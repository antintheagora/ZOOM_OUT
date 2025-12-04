// Stack: PointerLockControls from Three.js with lightweight WASD kinematics; keeps the camera at head height.
import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';

export class FirstPersonController {
  constructor(camera, domElement) {
    this.controls = new PointerLockControls(camera, domElement);
    this.velocity = new THREE.Vector3();
    this.direction = new THREE.Vector3();
    this.speed = 30;
    this.verticalVelocity = 0;
    this.gravity = 28;
    this.jumpStrength = 10;
    this.baseEyeHeight = 1.6;
    this.isOnGround = true;

    this.moveForward = false;
    this.moveBackward = false;
    this.moveLeft = false;
    this.moveRight = false;

    this.events = new EventTarget();

    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);

    document.addEventListener('keydown', this._onKeyDown);
    document.addEventListener('keyup', this._onKeyUp);
  }

  lock() {
    this.controls.lock();
  }

  unlock() {
    this.controls.unlock();
  }

  dispose() {
    document.removeEventListener('keydown', this._onKeyDown);
    document.removeEventListener('keyup', this._onKeyUp);
  }

  update(delta) {
    if (!this.controls.isLocked) {
      return;
    }

    this.velocity.x -= this.velocity.x * 8.5 * delta;
    this.velocity.z -= this.velocity.z * 8.5 * delta;

    this.direction.z = Number(this.moveForward) - Number(this.moveBackward);
    this.direction.x = Number(this.moveRight) - Number(this.moveLeft);
    this.direction.normalize();

    if (this.moveForward || this.moveBackward) {
      this.velocity.z -= this.direction.z * this.speed * delta;
    }
    if (this.moveLeft || this.moveRight) {
      this.velocity.x -= this.direction.x * this.speed * delta;
    }

    this.controls.moveRight(-this.velocity.x * delta);
    this.controls.moveForward(-this.velocity.z * delta);

    this.verticalVelocity -= this.gravity * delta;
    const object = this.controls.getObject();
    object.position.y += this.verticalVelocity * delta;

    if (object.position.y <= this.baseEyeHeight) {
      object.position.y = this.baseEyeHeight;
      this.verticalVelocity = 0;
      this.isOnGround = true;
    } else {
      this.isOnGround = false;
    }
  }

  _onKeyDown(event) {
    switch (event.code) {
      case 'ArrowUp':
      case 'KeyW':
        this.moveForward = true;
        break;
      case 'ArrowLeft':
      case 'KeyA':
        this.moveLeft = true;
        break;
      case 'ArrowDown':
      case 'KeyS':
        this.moveBackward = true;
        break;
      case 'ArrowRight':
      case 'KeyD':
        this.moveRight = true;
        break;
      case 'Space':
        if (this.isOnGround) {
          this.verticalVelocity = this.jumpStrength;
          this.isOnGround = false;
          this.events.dispatchEvent(new Event('jump'));
        }
        break;
      default:
        break;
    }
  }

  _onKeyUp(event) {
    switch (event.code) {
      case 'ArrowUp':
      case 'KeyW':
        this.moveForward = false;
        break;
      case 'ArrowLeft':
      case 'KeyA':
        this.moveLeft = false;
        break;
      case 'ArrowDown':
      case 'KeyS':
        this.moveBackward = false;
        break;
      case 'ArrowRight':
      case 'KeyD':
        this.moveRight = false;
        break;
      default:
        break;
    }
  }
}
