// Stack: In-memory room state manager for a single shared courtyard room.
import { v4 as uuidv4 } from 'uuid';
import { WebSocket } from 'ws';

const MAX_HEALTH = 6;
const ATTACK_RANGE = 2.2;
const ATTACK_ARC_COS = Math.cos(Math.PI / 3); // 60 degree arc
const ATTACK_COOLDOWN_MS = 600;

export class RoomManager {
  constructor() {
    this.players = new Map();
    this.roomId = 'default';
  }

  addPlayer(socket) {
    const player = {
      id: uuidv4(),
      name: 'guest',
      socket,
      ready: false,
      state: {
        position: [0, 0, 0],
        rotation: [0, 0, 0]
      },
      meta: {
        health: MAX_HEALTH,
        alive: true,
        lastAttack: 0
      }
    };
    this.players.set(player.id, player);
    console.log(`[room:${this.roomId}] player joined ${player.id}`);
    return player;
  }

  handleMessage(playerId, raw) {
    const player = this.players.get(playerId);
    if (!player) {
      return;
    }

    try {
      const message = JSON.parse(raw);
      if (!message?.type) {
        return;
      }
      switch (message.type) {
        case 'join': {
          const { name, position, rotation } = message.payload ?? {};
          player.name = sanitizeName(name);
          player.state.position = toVector(position);
          player.state.rotation = toVector(rotation);
          player.ready = true;

          this.send(player.id, {
            type: 'room-state',
            payload: {
              players: Array.from(this.players.values())
                .filter((p) => p.id !== player.id && p.ready)
                .map(formatPublicState)
            }
          });

          this.broadcast(
            {
              type: 'player-joined',
              payload: { player: formatPublicState(player) }
            },
            player.id
          );
          break;
        }

        case 'state-update': {
          if (!player.ready || !player.meta.alive) {
            return;
          }
          const { position, rotation } = message.payload ?? {};
          player.state.position = toVector(position);
          player.state.rotation = toVector(rotation);

          this.broadcast(
            {
              type: 'state-update',
              payload: {
                id: player.id,
                position: player.state.position,
                rotation: player.state.rotation
              }
            },
            player.id
          );
          break;
        }

        case 'attack': {
          this.handleAttack(player);
          break;
        }

        case 'respawn': {
          this.handleRespawn(player);
          break;
        }

        case 'rtc-offer':
        case 'rtc-answer':
        case 'rtc-ice': {
          const { to, description, candidate } = message.payload ?? {};
          if (!to) {
            return;
          }
          this.sendTo(to, {
            type: message.type,
            payload: {
              from: player.id,
              description,
              candidate
            }
          });
          break;
        }

        default:
          break;
      }
    } catch (err) {
      console.warn(`Failed to parse message from ${playerId}:`, err);
    }
  }

  removePlayer(playerId) {
    const player = this.players.get(playerId);
    if (!player) {
      return;
    }
    this.players.delete(playerId);
    console.log(`[room:${this.roomId}] player left ${playerId}`);
    this.broadcast({
      type: 'player-left',
      payload: { id: playerId }
    });
  }

  send(playerId, payload) {
    const player = this.players.get(playerId);
    if (!player) {
      return;
    }
    safeSend(player.socket, payload);
  }

  sendTo(playerId, payload) {
    const target = this.players.get(playerId);
    if (!target || !target.ready) {
      return;
    }
    safeSend(target.socket, payload);
  }

  broadcast(payload, excludeId) {
    this.players.forEach((player) => {
      if (player.id === excludeId) {
        return;
      }
      if (!player.ready) {
        return;
      }
      safeSend(player.socket, payload);
    });
  }
}

function safeSend(socket, payload) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    return;
  }
  try {
    socket.send(JSON.stringify(payload));
  } catch (err) {
    console.warn('Failed to send payload:', err);
  }
}

function toVector(value) {
  if (!Array.isArray(value) || value.length !== 3) {
    return [0, 0, 0];
  }
  return value.map((n) => (typeof n === 'number' ? Number(n) : 0));
}

function sanitizeName(name) {
  if (typeof name !== 'string' || !name.trim()) {
    return 'Guest';
  }
  return name.trim().slice(0, 24);
}

function formatPublicState(player) {
  return {
    id: player.id,
    name: player.name,
    position: player.state.position,
    rotation: player.state.rotation,
    health: player.meta.health,
    alive: player.meta.alive
  };
}

RoomManager.prototype.handleAttack = function handleAttack(player) {
  if (!player?.meta?.alive || !player.ready) {
    return;
  }
  const now = Date.now();
  if (now - player.meta.lastAttack < ATTACK_COOLDOWN_MS) {
    return;
  }
  player.meta.lastAttack = now;
  this.broadcast(
    {
      type: 'attack',
      payload: { attacker: player.id }
    },
    null
  );

  const attackerPos = player.state.position;
  const attackerRot = player.state.rotation;
  const forward = yawToVector(attackerRot[1] ?? 0);

  this.players.forEach((target) => {
    if (
      target.id === player.id ||
      !target.ready ||
      !target.meta.alive
    ) {
      return;
    }
    const toTarget = [
      target.state.position[0] - attackerPos[0],
      target.state.position[1] - attackerPos[1],
      target.state.position[2] - attackerPos[2]
    ];
    const horizontal = Math.hypot(toTarget[0], toTarget[2]);
    if (horizontal > ATTACK_RANGE) {
      return;
    }
    const dot = (toTarget[0] * forward[0] + toTarget[2] * forward[2]) / (horizontal || 1);
    if (dot < ATTACK_ARC_COS) {
      return;
    }
    this.applyDamage(target, 1);
  });
};

RoomManager.prototype.applyDamage = function applyDamage(target, amount) {
  if (!target.meta.alive) {
    return;
  }
  target.meta.health = Math.max(0, target.meta.health - amount);
  if (target.meta.health === 0) {
    target.meta.alive = false;
  }
  this.broadcast({
    type: 'health-update',
    payload: {
      id: target.id,
      health: target.meta.health,
      alive: target.meta.alive
    }
  });
};

RoomManager.prototype.handleRespawn = function handleRespawn(player) {
  if (!player?.ready || player.meta.alive) {
    return;
  }
  player.meta.health = MAX_HEALTH;
  player.meta.alive = true;
  const spawnPosition = [0, 1.6, 4 + Math.random() * 2];
  player.state.position = spawnPosition;
  player.state.rotation = [0, 0, 0];
  this.send(player.id, {
    type: 'respawned',
    payload: {
      position: spawnPosition,
      health: player.meta.health
    }
  });
  this.broadcast({
    type: 'player-respawned',
    payload: { player: formatPublicState(player) }
  });
};

function yawToVector(yaw) {
  const dirX = Math.sin(yaw);
  const dirZ = Math.cos(yaw);
  return [dirX, dirZ];
}
