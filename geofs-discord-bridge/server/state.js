export const serverState = {
  connectedGeoFSClients: new Map(),
  players: new Map(),
  lastChatMessageId: 0,
  lastGeoFSUpdate: 0,
  serverStatus: 'online',
  discordStatus: 'offline',
  lastDiscordPing: 0,
  rateLimit: new Map(),
};

export function getServerSnapshot() {
  return {
    connectedGeoFSClients: serverState.connectedGeoFSClients.size,
    players: Object.fromEntries(serverState.players),
    lastChatMessageId: serverState.lastChatMessageId,
    lastGeoFSUpdate: serverState.lastGeoFSUpdate,
    serverStatus: serverState.serverStatus,
    discordStatus: serverState.discordStatus,
  };
}

export function rememberPlayer(player) {
  if (!player || !player.id) return null;
  serverState.players.set(player.id, { ...player, lastSeen: Date.now() });
  serverState.lastGeoFSUpdate = Date.now();
  return serverState.players.get(player.id);
}

export function forgetPlayer(id) {
  if (!id) return false;
  return serverState.players.delete(id);
}

export function updateChatMessageId(id) {
  const value = Number(id || 0);
  if (!Number.isFinite(value)) return serverState.lastChatMessageId;
  serverState.lastChatMessageId = value;
  return value;
}

export function rateLimitExceeded(key, max = 5, ms = 1000) {
  const now = Date.now();
  const bucket = serverState.rateLimit.get(key) || { count: 0, resetAt: now + ms };
  if (now > bucket.resetAt) {
    bucket.count = 0;
    bucket.resetAt = now + ms;
  }
  if (bucket.count >= max) return true;
  bucket.count += 1;
  serverState.rateLimit.set(key, bucket);
  return false;
}
