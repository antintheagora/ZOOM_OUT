// Stack: Minimal WebSocket client for realtime player state sync via the Node.js backend.
export class NetworkClient extends EventTarget {
  constructor() {
    super();
    this.socket = null;
    this.playerId = null;
    this.pendingJoin = null;
    this.joinDeferred = null;
    this.boundOnMessage = this._onMessage.bind(this);
    this.boundOnClose = this._onClose.bind(this);
  }

  get connected() {
    return this.socket && this.socket.readyState === WebSocket.OPEN;
  }

  async join({ name, position, rotation }) {
    this.pendingJoin = { name, position, rotation };

    if (this.connected && this.playerId) {
      this._sendJoin(this.pendingJoin);
      return this.playerId;
    }

    if (this.socket && this.socket.readyState === WebSocket.CONNECTING) {
      return this._waitForJoin();
    }

    this._createSocket();
    return this._waitForJoin();
  }

  sendState({ position, rotation }) {
    if (!this.connected || !this.playerId) {
      return;
    }
    const payload = {
      type: 'state-update',
      payload: {
        position,
        rotation
      }
    };
    this.socket.send(JSON.stringify(payload));
  }

  sendSignal(type, payload) {
    if (!this.connected || !this.playerId) {
      return;
    }
    this.socket.send(
      JSON.stringify({
        type,
        payload
      })
    );
  }

  sendAttack() {
    this._sendSimple('attack');
  }

  sendRespawn() {
    this._sendSimple('respawn');
  }

  _sendSimple(type, payload) {
    if (!this.connected || !this.playerId) {
      return;
    }
    this.socket.send(
      JSON.stringify({
        type,
        payload
      })
    );
  }

  dispose() {
    if (this.socket) {
      this.socket.removeEventListener('message', this.boundOnMessage);
      this.socket.removeEventListener('close', this.boundOnClose);
      this.socket.close();
      this.socket = null;
    }
  }

  _createSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${protocol}://${window.location.host}/ws`;

    this.socket = new WebSocket(url);
    this.socket.addEventListener('message', this.boundOnMessage);
    this.socket.addEventListener('close', this.boundOnClose);
    this.socket.addEventListener('error', (event) => {
      if (this.joinDeferred) {
        this.joinDeferred.reject(event);
        this.joinDeferred = null;
      }
      this.dispatchEvent(
        new CustomEvent('error', { detail: event instanceof ErrorEvent ? event.error : event })
      );
    });
  }

  _waitForJoin() {
    if (this.joinDeferred) {
      return this.joinDeferred.promise;
    }
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    this.joinDeferred = { resolve, reject, promise };
    return promise;
  }

  _onMessage(event) {
    let data;
    try {
      data = JSON.parse(event.data);
    } catch (err) {
      console.warn('Failed to parse message', err);
      return;
    }
    if (!data?.type) {
      return;
    }

    switch (data.type) {
      case 'welcome':
        this.playerId = data.payload?.id ?? null;
        if (this.playerId && this.pendingJoin) {
          this._sendJoin(this.pendingJoin);
        }
        break;

      case 'room-state':
        if (this.joinDeferred) {
          this.joinDeferred.resolve(this.playerId);
          this.joinDeferred = null;
        }
        this.dispatchEvent(
          new CustomEvent('room-state', {
            detail: data.payload?.players ?? []
          })
        );
        this.dispatchEvent(new Event('ready'));
        break;

      case 'player-joined':
        this.dispatchEvent(
          new CustomEvent('player-joined', { detail: data.payload?.player })
        );
        break;

      case 'player-left':
        this.dispatchEvent(
          new CustomEvent('player-left', { detail: data.payload?.id })
        );
        break;

      case 'state-update':
        this.dispatchEvent(
          new CustomEvent('state-update', { detail: data.payload })
        );
        break;

      case 'rtc-offer':
      case 'rtc-answer':
      case 'rtc-ice':
        this.dispatchEvent(
          new CustomEvent(data.type, {
            detail: data.payload
          })
        );
        break;

      case 'attack':
      case 'health-update':
      case 'player-respawned':
      case 'respawned':
        this.dispatchEvent(
          new CustomEvent(data.type, {
            detail: data.payload
          })
        );
        break;

      default:
        break;
    }
  }

  _onClose() {
    if (this.joinDeferred) {
      this.joinDeferred.reject(new Error('Connection closed before join completed'));
      this.joinDeferred = null;
    }
    this.playerId = null;
    this.socket = null;
    this.dispatchEvent(new Event('disconnected'));
  }

  _sendJoin(payload) {
    if (!this.connected || !this.playerId) {
      return;
    }
    const message = {
      type: 'join',
      payload: {
        name: payload.name,
        position: payload.position,
        rotation: payload.rotation
      }
    };
    this.socket.send(JSON.stringify(message));
    this.pendingJoin = null;
  }
}
