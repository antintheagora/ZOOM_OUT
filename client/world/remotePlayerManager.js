// Stack: Manages remote avatar meshes and smooth interpolation in the Three.js scene.
import * as THREE from 'three';

const BODY_HEIGHT = 1.5;
const HIT_FLASH_DURATION = 0.45;
const textureLoader = new THREE.TextureLoader();

// Texture cache for clothing options
const clothingTextureCache = new Map();

function getClothingTexture(clothingId) {
  if (!clothingId || clothingId === 'none') {
    return null;
  }
  if (clothingTextureCache.has(clothingId)) {
    return clothingTextureCache.get(clothingId);
  }
  const texture = textureLoader.load(`/assets/characters/${clothingId}.png`, (tex) => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.repeat.set(1, 1);
  });
  clothingTextureCache.set(clothingId, texture);
  return texture;
}

// Default torso texture
const defaultTorsoTexture = getClothingTexture('Torso1');


export class RemotePlayerManager {
  constructor(scene) {
    this.scene = scene;
    this.players = new Map();
  }

  get size() {
    return this.players.size;
  }

  getIds() {
    return Array.from(this.players.keys());
  }

  getWorldPosition(id, target = new THREE.Vector3()) {
    const entry = this.players.get(id);
    if (!entry) {
      return null;
    }
    return target.copy(entry.group.position);
  }

  upsertPlayer(data) {
    const { id, name, position, rotation, health, alive, customization } = data;
    let entry = this.players.get(id);
    if (!entry) {
      const mesh = createAvatarMesh(name ?? 'Guest', tintFromId(id), customization || {});
      const { group, parts } = mesh;
      group.position.set(0, 0, 0);
      this.scene.add(group);
      entry = {
        id,
        group,
        parts,
        customization: customization || {},
        targetPosition: new THREE.Vector3(),
        lastPosition: new THREE.Vector3(),
        targetRotation: 0,
        walkPhase: 0,
        attackTimer: 0,
        health: health ?? 6,
        alive: alive ?? true,
        hitTimer: 0
      };
      this.players.set(id, entry);
    }
    entry.health = health ?? entry.health;
    entry.alive = alive ?? entry.alive;
    entry.group.visible = entry.alive;
    this._applyImmediate(entry, position, rotation);
  }

  applyStateUpdate({ id, position, rotation }) {
    const entry = this.players.get(id);
    if (!entry) {
      return;
    }
    if (Array.isArray(position) && position.length === 3) {
      const offsetY = (position[1] ?? 1.6) - 1.6;
      entry.targetPosition.set(position[0], offsetY, position[2]);
    }
    if (Array.isArray(rotation) && rotation.length === 3) {
      entry.targetRotation = rotation[1] ?? 0;
    }
  }

  removePlayer(id) {
    const entry = this.players.get(id);
    if (!entry) {
      return;
    }
    this.scene.remove(entry.group);
    entry.group.traverse((child) => {
      if (child.geometry) {
        child.geometry.dispose();
      }
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach((mat) => mat.dispose());
        } else {
          child.material.dispose();
        }
      }
      if (child.material && child.material.map) {
        child.material.map.dispose();
      }
    });
    this.players.delete(id);
  }

  update(delta, camera) {
    const lerpFactor = Math.min(1, delta * 6);
    this.players.forEach((entry) => {
      entry.group.position.lerp(entry.targetPosition, lerpFactor);
      const movementDelta = entry.group.position.clone().sub(entry.lastPosition);
      const speed = movementDelta.length() / Math.max(delta, 0.0001);

      const currentY = entry.group.rotation.y;
      const targetY = entry.targetRotation;
      entry.group.rotation.y = lerpRadians(currentY, targetY, lerpFactor);

      this.animateLimbs(entry, speed, delta);
      this.applyHitFlash(entry, delta);
      entry.lastPosition.copy(entry.group.position);

      entry.group.children.forEach((child) => {
        if (child.userData.isNameTag) {
          child.quaternion.copy(camera.quaternion);
        }
      });
    });
  }

  animateLimbs(entry, speed, delta) {
    if (!entry.parts) {
      return;
    }
    const { leftLeg, rightLeg, leftArm, rightArm } = entry.parts;
    const moving = speed > 0.3 && entry.alive;
    const swingTarget = moving ? 0.6 : 0;
    if (moving) {
      entry.walkPhase += speed * delta * 0.12;
    } else {
      entry.walkPhase = THREE.MathUtils.lerp(entry.walkPhase, 0, delta * 6);
    }
    const swing = Math.sin(entry.walkPhase * Math.PI * 2) * swingTarget;
    const armSwing = Math.sin(entry.walkPhase * Math.PI * 2 + Math.PI) * swingTarget * 0.8;

    leftLeg.rotation.x = THREE.MathUtils.lerp(leftLeg.rotation.x, swing, delta * 10);
    rightLeg.rotation.x = THREE.MathUtils.lerp(rightLeg.rotation.x, -swing, delta * 10);
    leftArm.rotation.x = THREE.MathUtils.lerp(leftArm.rotation.x, -armSwing, delta * 10);

    if (entry.attackTimer > 0 && entry.alive) {
      entry.attackTimer -= delta;
      const phase = 1 - entry.attackTimer / ATTACK_DURATION;
      const attackSwing = -Math.sin(phase * Math.PI) * 1.2;
      rightArm.rotation.x = attackSwing;
    } else {
      entry.attackTimer = 0;
      rightArm.rotation.x = THREE.MathUtils.lerp(rightArm.rotation.x, armSwing, delta * 10);
    }
  }

  triggerAttack(id) {
    const entry = this.players.get(id);
    if (!entry || !entry.parts) {
      return;
    }
    entry.attackTimer = ATTACK_DURATION;
  }

  setHealth(id, { health, alive }) {
    const entry = this.players.get(id);
    if (!entry) {
      return;
    }
    if (typeof health === 'number') {
      if (health < entry.health) {
        entry.hitTimer = HIT_FLASH_DURATION;
      }
      entry.health = health;
    }
    if (typeof alive === 'boolean') {
      entry.alive = alive;
      entry.group.visible = entry.alive;
    }
    if (!entry.alive) {
      entry.attackTimer = 0;
      this.resetLimbs(entry);
    }
  }

  resetLimbs(entry) {
    if (!entry.parts) {
      return;
    }
    const { leftLeg, rightLeg, leftArm, rightArm } = entry.parts;
    leftLeg.rotation.set(0, 0, 0);
    rightLeg.rotation.set(0, 0, 0);
    leftArm.rotation.set(0, 0, 0);
    rightArm.rotation.set(0, 0, 0);
  }

  _applyImmediate(entry, position, rotation) {
    if (Array.isArray(position) && position.length === 3) {
      const offsetY = (position[1] ?? 1.6) - 1.6;
      entry.group.position.set(position[0], offsetY, position[2]);
      entry.targetPosition.set(position[0], offsetY, position[2]);
      entry.lastPosition.copy(entry.group.position);
    }
    if (Array.isArray(rotation) && rotation.length === 3) {
      const yaw = rotation[1] ?? 0;
      entry.group.rotation.y = yaw;
      entry.targetRotation = yaw;
    }
  }
}

function createAvatarMesh(name, color, customization = {}) {
  const group = new THREE.Group();
  const { headColor, bodyColor, clothing, faceImage } = customization;

  // Determine torso texture/color
  const clothingTexture = clothing && clothing !== 'none'
    ? getClothingTexture(clothing)
    : defaultTorsoTexture;

  const torsoGeometry = new THREE.CylinderGeometry(0.32, 0.36, 1.0, 32, 1, true);
  const torsoMaterial = new THREE.MeshStandardMaterial({
    map: clothingTexture,
    color: bodyColor && (!clothing || clothing === 'none') ? new THREE.Color(bodyColor) : 0xffffff,
    roughness: 0.5,
    metalness: 0.05,
    transparent: true,
    side: THREE.FrontSide,
    emissive: new THREE.Color(0x000000)
  });
  const torso = new THREE.Mesh(torsoGeometry, torsoMaterial);
  torso.castShadow = true;
  torso.position.y = 0.5;
  torso.rotation.y = Math.PI;
  group.add(torso);

  // Head with optional color and face texture
  const headGeometry = new THREE.SphereGeometry(0.28, 32, 32, 0, Math.PI * 2, 0, Math.PI);
  const headMaterialColor = headColor ? new THREE.Color(headColor) : 0xf5d8b4;

  // Create head material - apply face texture to front half only if provided
  let headMaterial;
  if (faceImage) {
    // Create two hemispheres: front with face texture, back with color
    const faceTexture = textureLoader.load(faceImage);
    faceTexture.colorSpace = THREE.SRGBColorSpace;

    // Front hemisphere with face
    const frontHeadGeometry = new THREE.SphereGeometry(0.28, 32, 32, -Math.PI / 2, Math.PI, 0, Math.PI);
    const frontHeadMaterial = new THREE.MeshStandardMaterial({
      map: faceTexture,
      roughness: 0.6
    });
    const frontHead = new THREE.Mesh(frontHeadGeometry, frontHeadMaterial);
    frontHead.position.y = 1.45;
    frontHead.castShadow = true;
    group.add(frontHead);

    // Back hemisphere with color
    const backHeadGeometry = new THREE.SphereGeometry(0.28, 32, 32, Math.PI / 2, Math.PI, 0, Math.PI);
    const backHeadMaterial = new THREE.MeshStandardMaterial({
      color: headMaterialColor,
      roughness: 0.6
    });
    const backHead = new THREE.Mesh(backHeadGeometry, backHeadMaterial);
    backHead.position.y = 1.45;
    backHead.castShadow = true;
    group.add(backHead);
  } else {
    headMaterial = new THREE.MeshStandardMaterial({
      color: headMaterialColor,
      roughness: 0.6
    });
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.y = 1.45;
    head.castShadow = true;
    group.add(head);
  }

  const leftLeg = createLimb(0.11, 0.42);
  leftLeg.position.set(-0.14, 0.45, 0);
  group.add(leftLeg);

  const rightLeg = createLimb(0.11, 0.42);
  rightLeg.position.set(0.14, 0.45, 0);
  group.add(rightLeg);

  const leftArm = createLimb(0.085, 0.48);
  leftArm.position.set(-0.32, 1.25, 0);
  leftArm.rotation.z = 0.15;
  group.add(leftArm);

  const rightArm = createLimb(0.085, 0.48);
  rightArm.position.set(0.32, 1.25, 0);
  rightArm.rotation.z = -0.15;
  group.add(rightArm);

  const nameTag = buildNameTag(name);
  nameTag.position.set(0, BODY_HEIGHT + 0.35, 0);
  nameTag.userData.isNameTag = true;
  group.add(nameTag);

  return {
    group,
    parts: {
      torso,
      leftLeg,
      rightLeg,
      leftArm,
      rightArm,
      torsoMaterial
    }
  };
}

function createLimb(radius, length) {
  const geometry = new THREE.CapsuleGeometry(radius, length, 6, 12);
  const material = new THREE.MeshStandardMaterial({
    color: 0xbfccd4,
    roughness: 0.8
  });
  const limb = new THREE.Mesh(geometry, material);
  limb.castShadow = true;
  limb.geometry.translate(0, -length / 2, 0);
  limb.rotation.order = 'YXZ';
  return limb;
}

function buildNameTag(name) {
  const canvas = document.createElement('canvas');
  const scale = 4;
  canvas.width = 128 * scale;
  canvas.height = 64 * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to create canvas context for name tag');
  }
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(18, 22, 34, 0.75)';
  roundRect(ctx, 10 * scale, 10 * scale, canvas.width - 20 * scale, canvas.height - 20 * scale, 18 * scale);
  ctx.fillStyle = '#f0f4ff';
  ctx.font = `${24 * scale}px "Segoe UI", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.encoding = THREE.sRGBEncoding;
  texture.anisotropy = 8;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true
  });

  const sprite = new THREE.Sprite(material);
  sprite.scale.set(1.4, 0.6, 1);
  return sprite;
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  ctx.fill();
}

function tintFromId(id) {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash << 5) - hash + id.charCodeAt(i);
    hash |= 0;
  }
  const hue = Math.abs(hash) % 360;
  const color = new THREE.Color().setHSL(hue / 360, 0.45, 0.55);
  return color;
}

const ATTACK_DURATION = 0.4;

RemotePlayerManager.prototype.applyHitFlash = function applyHitFlash(entry, delta) {
  if (!entry.parts?.torsoMaterial) {
    return;
  }
  if (entry.hitTimer > 0) {
    entry.hitTimer = Math.max(0, entry.hitTimer - delta);
    const strength = entry.hitTimer / HIT_FLASH_DURATION;
    entry.parts.torsoMaterial.emissive.setRGB(strength * 0.9, strength * 0.2, 0);
  } else {
    entry.parts.torsoMaterial.emissive.setRGB(0, 0, 0);
  }
};

function lerpRadians(current, target, t) {
  const twoPi = Math.PI * 2;
  let diff = (target - current) % twoPi;
  if (diff < -Math.PI) {
    diff += twoPi;
  } else if (diff > Math.PI) {
    diff -= twoPi;
  }
  return current + diff * t;
}
