// Stack: WebRTC peer mesh with Web Audio spatialisation per remote participant.
import * as THREE from 'three';

const RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

export class VoiceClient extends EventTarget {
  constructor(network, remotePlayers) {
    super();
    this.network = network;
    this.remotePlayers = remotePlayers;
    this.audioContext = null;
    this.localStream = null;
    this.peers = new Map();
    this.initialised = false;
    this.muted = false;
    this.pendingOffers = new Set();
    this.camera = null;
    this.tmpVec = new THREE.Vector3();
    this.forward = new THREE.Vector3();
    this.up = new THREE.Vector3();
    this.debugInfo = new Map();
    this.fallbackEnabled = false;
  }

  setCamera(camera) {
    this.camera = camera;
  }

  async start() {
    if (this.initialised) {
      return;
    }
    const AudioContextClass = window.AudioContext ?? window.webkitAudioContext;
    if (!AudioContextClass) {
      throw new Error('Web Audio API unavailable');
    }
    this.audioContext = new AudioContextClass();
    await this.audioContext.resume();

    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      this.setMuted(this.muted);
      this.initialised = true;
      this.dispatchEvent(new Event('ready'));
    } catch (err) {
      console.error('Microphone access denied', err);
      this.dispatchEvent(new CustomEvent('error', { detail: err }));
      throw err;
    }
  }

  async ensurePeer(remoteId) {
    if (!this.initialised || !this.localStream || remoteId === this.network.playerId) {
      return null;
    }
    let peer = this.peers.get(remoteId);
    if (peer) {
      return peer;
    }
    const pc = new RTCPeerConnection(RTC_CONFIG);
    this.localStream.getTracks().forEach((track) => {
      pc.addTrack(track, this.localStream);
    });
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.network.sendSignal('rtc-ice', {
          to: remoteId,
          candidate: event.candidate.toJSON()
        });
      }
    };
    pc.ontrack = (event) => {
      const [stream] = event.streams;
      if (!stream) {
        return;
      }
      console.log('[voice] remote track from', remoteId);
      this._attachRemoteStream(remoteId, stream);
    };
    pc.onconnectionstatechange = () => {
      console.log('[voice] peer state', remoteId, pc.connectionState);
      this._updateDebug(remoteId, { connectionState: pc.connectionState });
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        this.teardownPeer(remoteId);
      }
    };
    pc.oniceconnectionstatechange = () => {
      this._updateDebug(remoteId, { iceState: pc.iceConnectionState });
    };
    pc.onicecandidateerror = (event) => {
      console.warn('[voice] ICE error', remoteId, event.errorText);
      this._updateDebug(remoteId, { iceError: event.errorText });
    };

    peer = {
      id: remoteId,
      pc,
      stream: null,
      nodes: null,
      lastKnownPosition: new THREE.Vector3()
    };
    this.peers.set(remoteId, peer);
    return peer;
  }

  async createOffer(remoteId) {
    const peer = await this.ensurePeer(remoteId);
    if (!peer) {
      return;
    }
    if (this.pendingOffers.has(remoteId)) {
      return;
    }
    this.pendingOffers.add(remoteId);
    try {
      const offer = await peer.pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: false
      });
      await peer.pc.setLocalDescription(offer);
      this.network.sendSignal('rtc-offer', {
        to: remoteId,
        description: offer
      });
    } catch (err) {
      console.error('Failed to create offer', err);
    } finally {
      this.pendingOffers.delete(remoteId);
    }
  }

  async handleOffer({ from, description }) {
    const peer = await this.ensurePeer(from);
    if (!peer) {
      return;
    }
    try {
      await peer.pc.setRemoteDescription(description);
      const answer = await peer.pc.createAnswer();
      await peer.pc.setLocalDescription(answer);
      this.network.sendSignal('rtc-answer', {
        to: from,
        description: answer
      });
    } catch (err) {
      console.error('Failed to handle offer', err);
    }
  }

  async handleAnswer({ from, description }) {
    const peer = await this.ensurePeer(from);
    if (!peer) {
      return;
    }
    try {
      await peer.pc.setRemoteDescription(description);
    } catch (err) {
      console.error('Failed to handle answer', err);
    }
  }

  async handleIceCandidate({ from, candidate }) {
    const peer = await this.ensurePeer(from);
    if (!peer || !candidate) {
      return;
    }
    try {
      const ice = candidate instanceof RTCIceCandidate ? candidate : new RTCIceCandidate(candidate);
      await peer.pc.addIceCandidate(ice);
    } catch (err) {
      console.error('Failed to add ICE candidate', err);
    }
  }

  handlePlayerLeft(remoteId) {
    this.teardownPeer(remoteId);
  }

  teardownPeer(remoteId) {
    const peer = this.peers.get(remoteId);
    if (!peer) {
      return;
    }
    this.peers.delete(remoteId);
    if (peer.nodes) {
      const { source, gain, panner, mediaElement } = peer.nodes;
      source.disconnect();
      gain.disconnect();
      panner.disconnect();
      if (mediaElement) {
        mediaElement.pause();
        mediaElement.srcObject = null;
        if (mediaElement.parentElement) {
          mediaElement.parentElement.removeChild(mediaElement);
        }
      }
    }
    if (peer.stream) {
      peer.stream.getTracks().forEach((track) => track.stop());
    }
    peer.pc.onicecandidate = null;
    peer.pc.ontrack = null;
    peer.pc.close();
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        track.enabled = !muted;
      });
    }
    this.dispatchEvent(
      new CustomEvent('mute-changed', {
        detail: { muted }
      })
    );
  }

  update() {
    if (!this.initialised || !this.audioContext || !this.camera) {
      return;
    }

    const { position, quaternion } = this.camera;

    this.forward.set(0, 0, -1).applyQuaternion(quaternion).normalize();
    this.up.set(0, 1, 0).applyQuaternion(quaternion).normalize();

    const listener = this.audioContext.listener;
    if ('positionX' in listener) {
      listener.positionX.value = position.x;
      listener.positionY.value = position.y;
      listener.positionZ.value = position.z;
      listener.forwardX.value = this.forward.x;
      listener.forwardY.value = this.forward.y;
      listener.forwardZ.value = this.forward.z;
      listener.upX.value = this.up.x;
      listener.upY.value = this.up.y;
      listener.upZ.value = this.up.z;
    } else {
      listener.setPosition(position.x, position.y, position.z);
      listener.setOrientation(
        this.forward.x,
        this.forward.y,
        this.forward.z,
        this.up.x,
        this.up.y,
        this.up.z
      );
    }

    this.peers.forEach((peer, id) => {
      if (!peer.nodes) {
        return;
      }
      const pos = this.remotePlayers.getWorldPosition(id, this.tmpVec);
      if (!pos) {
        return;
      }
      peer.lastKnownPosition.copy(pos);
      const { panner } = peer.nodes;
      if ('positionX' in panner) {
        panner.positionX.value = pos.x;
        panner.positionY.value = pos.y + 1.5;
        panner.positionZ.value = pos.z;
      } else {
        panner.setPosition(pos.x, pos.y + 1.5, pos.z);
      }
    });
  }

  getPeers() {
    return Array.from(this.peers.keys());
  }

  setFallbackEnabled(enabled) {
    this.fallbackEnabled = enabled;
    this.peers.forEach((peer) => this._applyFallbackState(peer));
  }

  debug() {
    return {
      ready: this.initialised,
      muted: this.muted,
      peers: Array.from(this.debugInfo.entries()).map(([id, info]) => ({
        id,
        ...info
      }))
    };
  }

  _attachRemoteStream(remoteId, stream) {
    const peer = this.peers.get(remoteId);
    if (!peer || !this.audioContext) {
      return;
    }

    peer.stream = stream;
    const source = this.audioContext.createMediaStreamSource(stream);
    const gain = this.audioContext.createGain();
    const panner = this.audioContext.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = 2.5;
    panner.maxDistance = 45;
    panner.rolloffFactor = 1.1;
    const destination = this.audioContext.destination;
    source.connect(gain).connect(panner).connect(destination);
    const element = document.createElement('audio');
    element.autoplay = true;
    element.playsInline = true;
    element.controls = false;
    element.muted = !this.fallbackEnabled;
    element.srcObject = stream;
    element.style.display = 'none';
    document.body.appendChild(element);

    peer.nodes = { source, gain, panner, mediaElement: element };
    this._updateDebug(remoteId, { hasStream: true });
    this._applyFallbackState(peer);
  }

  _updateDebug(remoteId, patch) {
    const info = this.debugInfo.get(remoteId) ?? {};
    this.debugInfo.set(remoteId, { ...info, ...patch });
  }

  _applyFallbackState(peer) {
    if (!peer?.nodes?.mediaElement) {
      return;
    }
    peer.nodes.mediaElement.muted = !this.fallbackEnabled;
    this._updateDebug(peer.id, { fallback: this.fallbackEnabled });
  }
}
