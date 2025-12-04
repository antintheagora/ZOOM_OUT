// Stack: Three.js scene factory; configures renderer + camera for the single-player courtyard.
import * as THREE from 'three';
import { buildCourtyard } from './courtyard.js';

export function createWorld(container) {
  const renderer = new THREE.WebGLRenderer({
    antialias: true
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.shadowMap.enabled = true;
  container.appendChild(renderer.domElement);

  const loader = new THREE.TextureLoader();
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0c111e, 0.04);

  const backdropTexture = loader.load('/assets/Backdrop.png');
  backdropTexture.colorSpace = THREE.SRGBColorSpace;
  backdropTexture.wrapS = THREE.ClampToEdgeWrapping;
  backdropTexture.wrapT = THREE.ClampToEdgeWrapping;
  const backdropMaterial = new THREE.MeshBasicMaterial({
    map: backdropTexture,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false
  });
  const radius = 140;
  const height = 80;
  const backdropGeometry = new THREE.CylinderGeometry(radius, radius, height, 48, 1, true);
  const backdrop = new THREE.Mesh(backdropGeometry, backdropMaterial);
  backdrop.position.set(0, -8, 0);
  backdrop.renderOrder = -10;
  scene.add(backdrop);

  const camera = new THREE.PerspectiveCamera(
    75,
    container.clientWidth / container.clientHeight,
    0.1,
    100
  );
  camera.position.set(0, 1.6, 6);

  const floorTexture = loader.load('/assets/Floor.png');
  floorTexture.colorSpace = THREE.SRGBColorSpace;
  floorTexture.wrapS = THREE.RepeatWrapping;
  floorTexture.wrapT = THREE.RepeatWrapping;
  floorTexture.repeat.set(8, 8);

  buildCourtyard(scene, { floorTexture });

  return { renderer, scene, camera, backdrop };
}

export function handleResize({ renderer, camera }, container) {
  const width = container.clientWidth;
  const height = container.clientHeight;

  renderer.setSize(width, height);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}
