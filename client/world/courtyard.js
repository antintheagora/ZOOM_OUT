// Stack: Procedural courtyard geometry w/ warm campfire lighting for cozy ambience.
import * as THREE from 'three';

export function buildCourtyard(scene, assets = {}) {
  addLights(scene);
  addGround(scene, assets.floorTexture);
  addCampfire(scene);
  addWalls(scene);
  addFogSprites(scene);
}

function addLights(scene) {
  const ambient = new THREE.HemisphereLight(0x445577, 0x080910, 0.35);
  scene.add(ambient);

  const moon = new THREE.DirectionalLight(0x88aaff, 0.25);
  moon.position.set(-6, 10, 6);
  moon.castShadow = true;
  scene.add(moon);
}

function addGround(scene, floorTexture) {
  const geometry = new THREE.CircleGeometry(14, 32);
  const material = new THREE.MeshStandardMaterial({
    color: 0x2b2f3a,
    roughness: 0.85,
    metalness: 0.05,
    map: floorTexture ?? null
  });
  if (floorTexture) {
    material.color.set(0xffffff);
    material.map = floorTexture;
    material.map.needsUpdate = true;
  }
  const ground = new THREE.Mesh(geometry, material);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const stones = new THREE.Group();
  for (let i = 0; i < 40; i += 1) {
    const stoneGeometry = new THREE.CapsuleGeometry(0.1, 0.2, 4, 8);
    const stoneMaterial = new THREE.MeshStandardMaterial({
      color: 0x3a3f4c,
      roughness: 0.9
    });
    const stone = new THREE.Mesh(stoneGeometry, stoneMaterial);
    const radius = 5 + Math.random() * 2;
    const angle = Math.random() * Math.PI * 2;
    stone.position.set(
      Math.cos(angle) * radius,
      0.05,
      Math.sin(angle) * radius
    );
    stone.rotation.y = Math.random() * Math.PI;
    stone.castShadow = true;
    stones.add(stone);
  }
  scene.add(stones);
}

function addCampfire(scene) {
  const fireGroup = new THREE.Group();
  fireGroup.position.set(0, 0, 0);

  const fireLight = new THREE.PointLight(0xffb36b, 2.2, 12, 2);
  fireLight.castShadow = true;
  fireLight.position.y = 1;
  fireGroup.add(fireLight);

  const emberGeometry = new THREE.SphereGeometry(0.3, 16, 16);
  const emberMaterial = new THREE.MeshBasicMaterial({
    color: 0xff7b2d
  });
  const ember = new THREE.Mesh(emberGeometry, emberMaterial);
  ember.position.y = 0.4;
  fireGroup.add(ember);

  const logGeometry = new THREE.CylinderGeometry(0.1, 0.12, 1.4, 8);
  const logMaterial = new THREE.MeshStandardMaterial({
    color: 0x3b2416,
    roughness: 0.8
  });

  for (let i = 0; i < 4; i += 1) {
    const log = new THREE.Mesh(logGeometry, logMaterial);
    log.castShadow = true;
    log.rotation.z = Math.PI / 2 + (Math.random() - 0.5) * 0.2;
    log.rotation.y = (Math.PI / 2) * i + Math.random() * 0.2;
    log.position.set(
      Math.cos((Math.PI / 2) * i) * 0.6,
      0.15,
      Math.sin((Math.PI / 2) * i) * 0.6
    );
    fireGroup.add(log);
  }

  scene.add(fireGroup);
}

function addWalls(scene) {
  const wallMaterial = new THREE.MeshStandardMaterial({
    color: 0x252838,
    roughness: 0.85
  });

  const wallGeometry = new THREE.BoxGeometry(10, 3.5, 0.4);
  const backWall = new THREE.Mesh(wallGeometry, wallMaterial);
  backWall.position.set(0, 1.75, -8);
  backWall.castShadow = true;
  backWall.receiveShadow = true;
  scene.add(backWall);

  const sideWallGeometry = new THREE.BoxGeometry(0.4, 3.2, 8);
  const leftWall = new THREE.Mesh(sideWallGeometry, wallMaterial);
  leftWall.position.set(-7, 1.6, -2);
  leftWall.castShadow = true;
  scene.add(leftWall);

  const rightWall = leftWall.clone();
  rightWall.position.x = 7;
  scene.add(rightWall);

  const archGroup = new THREE.Group();
  const pillarGeometry = new THREE.CylinderGeometry(0.35, 0.45, 3.4, 8);
  const pillarMaterial = new THREE.MeshStandardMaterial({
    color: 0x222532,
    roughness: 0.88
  });
  const leftPillar = new THREE.Mesh(pillarGeometry, pillarMaterial);
  leftPillar.position.set(-2.5, 1.7, 6);
  leftPillar.castShadow = true;
  archGroup.add(leftPillar);
  const rightPillar = leftPillar.clone();
  rightPillar.position.x = 2.5;
  archGroup.add(rightPillar);

  const archGeometry = new THREE.TorusGeometry(2.6, 0.2, 10, 24, Math.PI);
  const archMaterial = new THREE.MeshStandardMaterial({
    color: 0x292c3d,
    roughness: 0.8
  });
  const arch = new THREE.Mesh(archGeometry, archMaterial);
  arch.rotation.x = Math.PI / 2;
  arch.position.y = 3.3;
  arch.castShadow = true;
  archGroup.add(arch);

  archGroup.position.z = 6;
  scene.add(archGroup);
}

function addFogSprites(scene) {
  const spriteMaterial = new THREE.SpriteMaterial({
    color: 0x253147,
    transparent: true,
    opacity: 0.1
  });

  for (let i = 0; i < 12; i += 1) {
    const sprite = new THREE.Sprite(spriteMaterial.clone());
    const radius = 6 + Math.random() * 4;
    const angle = Math.random() * Math.PI * 2;
    sprite.position.set(
      Math.cos(angle) * radius,
      0.6 + Math.random() * 0.8,
      Math.sin(angle) * radius
    );
    const scale = 4 + Math.random() * 5;
    sprite.scale.set(scale, scale, scale);
    scene.add(sprite);
  }
}
