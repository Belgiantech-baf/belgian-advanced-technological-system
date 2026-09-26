import { WebSocketServer } from 'ws';
import { MESSAGE_TYPES, normalizeChat, normalizePlayer } from '../shared/protocol.js';
import { createClientId, verifyBridgeToken } from './auth.js';
import { rateLimitExceeded, rememberPlayer, forgetPlayer, serverState, updateChatMessageId } from './state.js';

export class GeoFSBridgeServer {
  constructor({ port, bridgeSecret, onPlayerUpdate, onChat, onStatus }) {
    this.port = port;
    this.bridgeSecret = bridgeSecret;
    this.onPlayerUpdate = onPlayerUpdate || (() => {});
    this.onChat = onChat || (() => {});
    this.onStatus = onStatus || (() => {});
    this.server = null;
    this.state = serverState;
    this.clients = new Map();
  }

  start() {
    if (!this.bridgeSecret) {
      throw new Error('BRIDGE_SECRET is required');
    }

    this.server = new WebSocketServer({ port: Number(this.port || 3000) });
    this.server.on('connection', (socket) => {
      socket.isAuthorized = false;
      socket.clientId = createClientId();
      this.clients.set(socket.clientId, socket);

      socket.on('message', (raw) => {
        try {
          const message = JSON.parse(String(raw));
          this.handleIncoming(socket, message);
        } catch (error) {
          this.send(socket, { type: MESSAGE_TYPES.ERROR, error: 'Invalid JSON payload' });
        }
      });

      socket.on('close', () => {
        this.clients.delete(socket.clientId);
        this.state.connectedGeoFSClients.delete(socket.clientId);
        this.emitStatus();
      });
    });

    this.emitStatus();
    return this.server;
  }

  send(socket, payload) {
    if (!socket || typeof socket.send !== 'function') return false;
    try {
      socket.send(JSON.stringify(payload));
      return true;
    } catch {
      return false;
    }
  }

  broadcast(payload) {
    const message = JSON.stringify(payload);
    this.clients.forEach((socket) => {
      try { socket.send(message); } catch { }
    });
  }

  handleIncoming(socket, message) {
    if (!message || typeof message !== 'object') {
      this.send(socket, { type: MESSAGE_TYPES.ERROR, error: 'Invalid message format' });
      return;
    }

    if (message.type === MESSAGE_TYPES.IDENTIFY) {
      const authorized = verifyBridgeToken(message.token, this.bridgeSecret);
      if (!authorized) {
        this.send(socket, { type: MESSAGE_TYPES.ERROR, error: 'Unauthorized' });
        socket.close();
        return;
      }

      socket.isAuthorized = true;
      this.state.connectedGeoFSClients.set(socket.clientId, { connectedAt: Date.now(), socket });
      this.send(socket, { type: MESSAGE_TYPES.IDENTIFIED, clientId: socket.clientId });
      this.emitStatus();
      return;
    }

    if (!socket.isAuthorized) {
      this.send(socket, { type: MESSAGE_TYPES.ERROR, error: 'Authentication required' });
      return;
    }

    if (message.type === MESSAGE_TYPES.GEO_UPDATE || message.type === MESSAGE_TYPES.PLAYER_UPDATE) {
      const player = normalizePlayer(message);
      if (!player.id) return;
      rememberPlayer(player);
      this.onPlayerUpdate?.(player);
      this.broadcast({ type: MESSAGE_TYPES.PLAYER_UPDATE, player, timestamp: Date.now() });
      this.emitStatus();
      return;
    }

    if (message.type === MESSAGE_TYPES.GEOFS_CHAT) {
      const chat = normalizeChat(message);
      updateChatMessageId(chat.timestamp || Date.now());
      this.onChat?.(chat);
      this.broadcast(chat);
      return;
    }

    if (message.type === MESSAGE_TYPES.PING) {
      this.send(socket, { type: MESSAGE_TYPES.PING, timestamp: Date.now() });
      return;
    }

    if (message.type === MESSAGE_TYPES.SUBSCRIBE) {
      socket.subscriptions = socket.subscriptions || new Set();
      socket.subscriptions.add(message.channel || 'all');
      return;
    }

    if (message.type === MESSAGE_TYPES.UNSUBSCRIBE) {
      socket.subscriptions = socket.subscriptions || new Set();
      socket.subscriptions.delete(message.channel || 'all');
      return;
    }

    this.send(socket, { type: MESSAGE_TYPES.ERROR, error: 'Unsupported message type' });
  }

  broadcastToGeoFS(message) {
    if (!message || typeof message !== 'object') return false;
    if (rateLimitExceeded(`geo-${message.type || 'unknown'}`)) return false;
    const payload = typeof message === 'string' ? message : JSON.stringify(message);
    let sent = 0;
    this.clients.forEach((socket) => {
      if (socket.isAuthorized) {
        try {
          socket.send(payload);
          sent += 1;
        } catch {
          // Ignore send failures; they are handled by websocket close events.
        }
      }
    });
    return sent > 0;
  }

  emitStatus() {
    const snapshot = {
      connectedGeoFSClients: this.state.connectedGeoFSClients.size,
      players: Object.fromEntries(this.state.players),
      lastChatMessageId: this.state.lastChatMessageId,
      lastGeoFSUpdate: this.state.lastGeoFSUpdate,
      serverStatus: this.state.serverStatus,
      discordStatus: this.state.discordStatus,
    };
    this.onStatus?.(snapshot);
  }
}
