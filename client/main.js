// Stack: Vite client entry with Three.js scene, WebSocket state sync, and WebRTC voice chat + spatial audio.
import * as THREE from 'three';
import { createWorld, handleResize } from './world/createWorld.js';
import { FirstPersonController } from './controls/firstPersonController.js';
import { NetworkClient } from './network/networkClient.js';
import { RemotePlayerManager } from './world/remotePlayerManager.js';
import { VoiceClient } from './audio/voiceClient.js';
import { playJump, playAttack, playDamage } from './audio/sfx.js';

const app = document.getElementById('app');

if (!app) {
  throw new Error('#app container missing');
}

const container = document.createElement('div');
container.style.position = 'relative';
container.style.width = '100%';
container.style.height = '100%';
app.appendChild(container);

const { renderer, scene, camera, backdrop } = createWorld(container);
const controller = new FirstPersonController(camera, renderer.domElement);
scene.add(controller.controls.getObject());
controller.events.addEventListener('jump', () => {
  if (selfAlive) {
    playJump();
  }
});

const remotePlayers = new RemotePlayerManager(scene);
const network = new NetworkClient();
const voice = new VoiceClient(network, remotePlayers);
voice.setCamera(camera);

const hitFlash = document.createElement('div');
hitFlash.className = 'hit-flash';
container.appendChild(hitFlash);

const overlay = document.createElement('section');
overlay.className = 'overlay';
overlay.innerHTML = `
  <div data-role="panel">
    <h1>Campfire Courtyard</h1>
    <div data-role="name-block">
      <input type="text" name="displayName" placeholder="Campfire guest" maxlength="24" />
    </div>
    <button type="button">Join the courtyard</button>
    <p class="hint" data-role="hint">
      Voice chat requires microphone access.<br />
      Use <strong>WASD</strong> to move &bull; <strong>Space</strong> to hop &bull; Mouse to look &bull; Esc to release cursor
    </p>
  </div>
`;
container.appendChild(overlay);

const hud = document.createElement('div');
hud.className = 'hud';
hud.innerHTML = `
  <span>WASD / arrows to move &nbsp;&bull;&nbsp; Space to hop &nbsp;&bull;&nbsp; Mouse look &nbsp;&bull;&nbsp; Esc to unlock cursor</span>
  <span data-role="players">Not connected</span>
`;
container.appendChild(hud);

const controlsBar = document.createElement('div');
controlsBar.className = 'controls';
controlsBar.innerHTML = `
  <span class="label" data-role="self-name">Visitor</span>
  <button type="button" data-role="mute" disabled>Mute</button>
  <button type="button" data-role="audio-mode" disabled title="Toggle spatial audio fallback">Spatial</button>
`;
container.appendChild(controlsBar);

const rosterPanel = document.createElement('aside');
rosterPanel.className = 'player-list';
rosterPanel.innerHTML = `
  <h2>Campfire</h2>
  <ul data-role="player-list"></ul>
`;
container.appendChild(rosterPanel);

const heartsPanel = document.createElement('div');
heartsPanel.className = 'hearts-panel';
container.appendChild(heartsPanel);

const deathPanel = document.createElement('section');
deathPanel.className = 'overlay hidden death-panel';
deathPanel.innerHTML = `
  <div>
    <h1>You fell</h1>
    <p class="hint">Take a breath by the fire, then hop back in.</p>
    <button type="button" data-role="respawn">Respawn at the campfire</button>
  </div>
`;
container.appendChild(deathPanel);

const enterButton = overlay.querySelector('button');
const nameInput = overlay.querySelector('input');
const playersLabel = hud.querySelector('[data-role="players"]');
const nameBlock = overlay.querySelector('[data-role="name-block"]');
const hintText = overlay.querySelector('[data-role="hint"]');
const selfNameLabel = controlsBar.querySelector('[data-role="self-name"]');
const muteButton = controlsBar.querySelector('[data-role="mute"]');
const rosterList = rosterPanel.querySelector('[data-role="player-list"]');
const audioModeButton = controlsBar.querySelector('[data-role="audio-mode"]');
const respawnButton = deathPanel.querySelector('[data-role="respawn"]');

if (
  !enterButton ||
  !nameInput ||
  !playersLabel ||
  !nameBlock ||
  !hintText ||
  !selfNameLabel ||
  !muteButton ||
  !audioModeButton ||
  !rosterList ||
  !heartsPanel ||
  !respawnButton
) {
  throw new Error('UI failed to initialise');
}

const MAX_HEALTH = 6;
const ATTACK_COOLDOWN_MS = 650;

const roster = new Map();
const pendingPeerIds = new Set();
const pendingSignals = [];
let fallbackManual = false;
let fallbackAutoEnabled = false;
let selfName = '';
let hasJoined = false;
let isJoining = false;
let voiceReady = false;
let lastBroadcast = 0;
let selfHealth = MAX_HEALTH;
let selfAlive = true;
let lastAttackTime = 0;
let hitFlashTimeout = null;

enterButton.addEventListener('click', async () => {
  const mode = overlay.dataset.mode ?? 'join';
  if (mode === 'resume' && hasJoined) {
    controller.lock();
    return;
  }

  if (!hasJoined && !isJoining) {
    const desiredName = (nameInput.value || '').trim() || generateFriendlyName();
    isJoining = true;
    enterButton.disabled = true;
    try {
      await network.join({
        name: desiredName,
        position: getLocalPosition(),
        rotation: getLocalRotation()
      });
      hasJoined = true;
      selfName = desiredName;
      nameInput.value = desiredName;
      nameInput.disabled = true;
      roster.set(network.playerId, {
        id: network.playerId,
        name: desiredName,
        isSelf: true
      });
      updateRosterUI();
      selfHealth = MAX_HEALTH;
      selfAlive = true;
      renderHearts();
      hideDeathPanel();
      await voice.start();
      voiceReady = true;
      muteButton.disabled = false;
      audioModeButton.disabled = false;
      updateMuteButton();
      applyFallbackState();
      flushPendingSignals();
      flushPendingPeers();
      showToast('Mic connected. You can mute via the button below.');
    } catch (error) {
      if (error?.name === 'NotAllowedError') {
        showToast('Microphone blocked. You can still explore, but others cannot hear you.');
      } else if (error instanceof Error && error.message.includes('Connection closed')) {
        showToast('Unable to reach the campfire. Try again in a moment.');
      } else {
        console.error('Failed to join room', error);
        showToast('Join failed. Check your connection and retry.');
      }
    } finally {
      enterButton.disabled = false;
      isJoining = false;
      enterButton.textContent = hasJoined ? 'Re-enter courtyard' : 'Join the courtyard';
    }
  }

  controller.lock();
});

muteButton.addEventListener('click', () => {
  if (!voiceReady) {
    showToast('Voice is not ready yet.');
    return;
  }
  voice.setMuted(!voice.muted);
});

audioModeButton.addEventListener('click', () => {
  fallbackManual = !fallbackManual;
  fallbackAutoEnabled = false;
  applyFallbackState();
});

respawnButton.addEventListener('click', () => {
  if (!selfAlive) {
    respawnButton.disabled = true;
    network.sendRespawn();
  }
});

voice.addEventListener('mute-changed', updateMuteButton);
voice.addEventListener('error', (event) => {
  console.error('Voice error', event.detail);
  showToast('Voice channel error. Check microphone permissions.');
});

window.voiceDebug = () => {
  // eslint-disable-next-line no-console
  console.table(voice.debug().peers);
};

window.addEventListener('mousedown', (event) => {
  if (event.button !== 0) {
    return;
  }
  attemptAttack();
});

controller.controls.addEventListener('lock', () => {
  overlay.classList.add('hidden');
});

controller.controls.addEventListener('unlock', () => {
  if (hasJoined) {
    showResumePrompt();
  } else {
    showJoinPrompt();
  }
});

network.addEventListener('room-state', (event) => {
  const players = event.detail ?? [];
  players.forEach((player) => {
    registerRemotePlayer(player);
    schedulePeer(player.id);
  });
  updateRosterUI();
});

network.addEventListener('player-joined', (event) => {
  const player = event.detail;
  if (!player || player.id === network.playerId) {
    return;
  }
  registerRemotePlayer(player);
  schedulePeer(player.id);
  showToast(`${player.name} joined the courtyard.`);
});

network.addEventListener('player-left', (event) => {
  const id = event.detail;
  if (!id) {
    return;
  }
  unregisterRemotePlayer(id);
});

network.addEventListener('state-update', (event) => {
  const payload = event.detail;
  if (!payload || payload.id === network.playerId) {
    return;
  }
  remotePlayers.applyStateUpdate(payload);
});

network.addEventListener('attack', (event) => {
  const attacker = event.detail?.attacker;
  if (!attacker) {
    return;
  }
  if (attacker !== network.playerId) {
    remotePlayers.triggerAttack(attacker);
  }
});

network.addEventListener('health-update', (event) => {
  handleHealthUpdate(event.detail);
});

network.addEventListener('player-respawned', (event) => {
  const player = event.detail?.player;
  if (!player || player.id === network.playerId) {
    return;
  }
  remotePlayers.upsertPlayer(player);
  showToast(`${player.name} rejoined the fire.`);
});

network.addEventListener('respawned', (event) => {
  const { position, health } = event.detail ?? {};
  if (Array.isArray(position)) {
    const object = controller.controls.getObject();
    object.position.set(position[0], position[1], position[2]);
  }
  selfHealth = typeof health === 'number' ? health : MAX_HEALTH;
  selfAlive = true;
  renderHearts();
  hideDeathPanel();
  showToast('Back at the fire.');
});

network.addEventListener('disconnected', () => {
  if (hasJoined) {
    showToast('Connection lost. Click to reconnect.');
    hasJoined = false;
    voiceReady = false;
    pendingSignals.length = 0;
    muteButton.disabled = true;
    audioModeButton.disabled = true;
    fallbackManual = false;
    fallbackAutoEnabled = false;
    voice.setFallbackEnabled(false);
    selfHealth = MAX_HEALTH;
    selfAlive = true;
    renderHearts();
    hideDeathPanel();
    nameInput.disabled = false;
    playersLabel.textContent = 'Disconnected';
    roster.clear();
    remotePlayers.getIds().forEach((id) => remotePlayers.removePlayer(id));
    voice.getPeers().forEach((id) => voice.handlePlayerLeft(id));
    updateRosterUI();
    showJoinPrompt();
  }
});

network.addEventListener('rtc-offer', (event) => {
  if (!voiceReady) {
    pendingSignals.push({ type: 'rtc-offer', detail: event.detail });
    return;
  }
  voice.handleOffer(event.detail);
  maybeAutoEnableFallback();
});

network.addEventListener('rtc-answer', (event) => {
  if (!voiceReady) {
    pendingSignals.push({ type: 'rtc-answer', detail: event.detail });
    return;
  }
  voice.handleAnswer(event.detail);
  maybeAutoEnableFallback();
});

network.addEventListener('rtc-ice', (event) => {
  if (!voiceReady) {
    pendingSignals.push({ type: 'rtc-ice', detail: event.detail });
    return;
  }
  voice.handleIceCandidate(event.detail);
});

const clock = new THREE.Clock();
function animate() {
  const delta = Math.min(clock.getDelta(), 0.1);
  if (selfAlive) {
    controller.update(delta);
  }
  remotePlayers.update(delta, camera);
  voice.update();

  if (hasJoined && selfAlive) {
    lastBroadcast += delta;
    if (lastBroadcast >= 1 / 15) {
      lastBroadcast = 0;
      network.sendState({
        position: getLocalPosition(),
        rotation: getLocalRotation()
      });
    }
  }

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

animate();

window.addEventListener('resize', () => handleResize({ renderer, camera }, container));

function getLocalPosition() {
  const origin = controller.controls.getObject().position;
  return [origin.x, origin.y, origin.z];
}

function getLocalRotation() {
  const object = controller.controls.getObject();
  return [0, object.rotation.y, 0];
}

function updateRosterUI() {
  if (!hasJoined) {
    playersLabel.textContent = 'Not connected';
    rosterList.innerHTML = '';
    selfNameLabel.textContent = 'Visitor';
    return;
  }

  playersLabel.textContent = `Connected: ${roster.size}`;
  selfNameLabel.textContent = selfName || 'Campfire Guest';

  const players = Array.from(roster.values()).sort((a, b) => {
    if (a.isSelf) return -1;
    if (b.isSelf) return 1;
    return a.name.localeCompare(b.name);
  });

  rosterList.innerHTML = '';
  players.forEach((player) => {
    const li = document.createElement('li');
    const nameSpan = document.createElement('span');
    nameSpan.textContent = player.name;
    li.appendChild(nameSpan);
    if (player.isSelf) {
      const tag = document.createElement('span');
      tag.className = 'you-tag';
      tag.textContent = 'You';
      li.appendChild(tag);
    }
    rosterList.appendChild(li);
  });
}

function registerRemotePlayer(player) {
  remotePlayers.upsertPlayer(player);
  roster.set(player.id, {
    id: player.id,
    name: player.name,
    isSelf: false
  });
  updateRosterUI();
}

function unregisterRemotePlayer(id) {
  remotePlayers.removePlayer(id);
  roster.delete(id);
  pendingPeerIds.delete(id);
  voice.handlePlayerLeft(id);
  showToast('A friend wandered off.');
  updateRosterUI();
}

function schedulePeer(id) {
  if (!id || id === network.playerId) {
    return;
  }
  if (voiceReady) {
    maybeInitiatePeer(id);
  } else {
    pendingPeerIds.add(id);
  }
}

function flushPendingPeers() {
  if (!voiceReady) {
    return;
  }
  pendingPeerIds.forEach((id) => maybeInitiatePeer(id));
  pendingPeerIds.clear();
}

function flushPendingSignals() {
  if (!voiceReady || pendingSignals.length === 0) {
    return;
  }
  while (pendingSignals.length > 0) {
    const signal = pendingSignals.shift();
    if (!signal) {
      continue;
    }
    switch (signal.type) {
      case 'rtc-offer':
        voice.handleOffer(signal.detail);
        break;
      case 'rtc-answer':
        voice.handleAnswer(signal.detail);
        break;
      case 'rtc-ice':
        voice.handleIceCandidate(signal.detail);
        break;
      default:
        break;
    }
  }
}

function maybeInitiatePeer(id) {
  if (!voiceReady || !id || id === network.playerId) {
    return;
  }
  voice.ensurePeer(id);
  if (shouldInitiateCall(id)) {
    voice.createOffer(id);
  }
  applyFallbackState();
}

function shouldInitiateCall(remoteId) {
  if (!network.playerId) {
    return false;
  }
  return network.playerId.localeCompare(remoteId) < 0;
}

function updateMuteButton() {
  muteButton.textContent = voice.muted ? 'Unmute' : 'Mute';
  muteButton.setAttribute('aria-pressed', voice.muted ? 'true' : 'false');
}

function updateAudioModeButton() {
  const enabled = (fallbackManual || fallbackAutoEnabled) && voiceReady;
  audioModeButton.textContent = enabled ? 'Stereo' : 'Spatial';
  audioModeButton.setAttribute('aria-pressed', enabled ? 'true' : 'false');
}

function applyFallbackState() {
  const enabled = fallbackManual || fallbackAutoEnabled;
  if (voiceReady) {
    voice.setFallbackEnabled(enabled);
  }
  updateAudioModeButton();
}

function maybeAutoEnableFallback() {
  if (fallbackManual || fallbackAutoEnabled) {
    applyFallbackState();
    return;
  }
  fallbackAutoEnabled = true;
  showToast('Spatial audio fallback enabled for this session.');
  applyFallbackState();
}

function generateFriendlyName() {
  const descriptors = ['Wandering', 'Quiet', 'Twilight', 'Dreaming', 'Gentle', 'Forest'];
  const nouns = ['Firefly', 'Comet', 'Driftwood', 'Stargazer', 'Willow', 'Ember'];
  const descriptor = descriptors[Math.floor(Math.random() * descriptors.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  return `${descriptor} ${noun}`;
}

function attemptAttack() {
  if (!hasJoined || !selfAlive || !controller.controls.isLocked) {
    return;
  }
  const now = performance.now();
  if (now - lastAttackTime < ATTACK_COOLDOWN_MS) {
    return;
  }
  lastAttackTime = now;
  playAttack();
  network.sendAttack();
}

function showToast(message) {
  const toast = document.createElement('div');
  toast.textContent = message;
  toast.style.position = 'absolute';
  toast.style.bottom = '2rem';
  toast.style.left = '50%';
  toast.style.transform = 'translateX(-50%)';
  toast.style.padding = '0.6rem 1rem';
  toast.style.background = 'rgba(10, 14, 24, 0.8)';
  toast.style.borderRadius = '0.75rem';
  toast.style.color = '#f0f4ff';
  toast.style.fontSize = '0.9rem';
  toast.style.pointerEvents = 'none';
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.transition = 'opacity 0.4s ease';
    toast.style.opacity = '0';
    setTimeout(() => {
      if (toast.parentElement) {
        toast.parentElement.removeChild(toast);
      }
    }, 400);
  }, 2000);
}

function handleHealthUpdate(detail) {
  if (!detail || !detail.id) {
    return;
  }
  if (detail.id === network.playerId) {
    const previous = selfHealth;
    if (typeof detail.health === 'number') {
      selfHealth = detail.health;
    }
    if (typeof detail.alive === 'boolean') {
      selfAlive = detail.alive;
    }
    renderHearts();
    if (selfHealth < previous) {
      playDamage();
      flashScreen();
    }
    if (!selfAlive) {
      controller.unlock();
      showDeathPanel();
    } else {
      hideDeathPanel();
    }
  } else {
    remotePlayers.setHealth(detail.id, detail);
  }
}

function renderHearts() {
  const fragments = [];
  for (let i = 0; i < MAX_HEALTH; i += 1) {
    const full = i < selfHealth ? 'full' : '';
    fragments.push(`<span class="heart ${full}">♥</span>`);
  }
  heartsPanel.innerHTML = fragments.join('');
}

function showDeathPanel() {
  deathPanel.classList.remove('hidden');
  respawnButton.disabled = false;
}

function hideDeathPanel() {
  deathPanel.classList.add('hidden');
  respawnButton.disabled = true;
}

function flashScreen() {
  hitFlash.classList.add('active');
  if (hitFlashTimeout) {
    clearTimeout(hitFlashTimeout);
  }
  hitFlashTimeout = setTimeout(() => hitFlash.classList.remove('active'), 200);
}

function showJoinPrompt() {
  overlay.dataset.mode = 'join';
  nameBlock.style.display = '';
  nameInput.disabled = false;
  enterButton.disabled = false;
  enterButton.textContent = hasJoined ? 'Reconnect' : 'Join the courtyard';
  hintText.innerHTML =
    'Voice chat requires microphone access.<br />Use <strong>WASD</strong> to move &bull; <strong>Space</strong> to hop &bull; Mouse to look &bull; Esc to release cursor';
  overlay.classList.remove('hidden');
}

function showResumePrompt() {
  overlay.dataset.mode = 'resume';
  nameBlock.style.display = 'none';
  enterButton.disabled = false;
  enterButton.textContent = 'Click to resume';
  hintText.textContent = 'Pointer lock released. Click to continue walking.';
  overlay.classList.remove('hidden');
}

hideDeathPanel();
renderHearts();
showJoinPrompt();
