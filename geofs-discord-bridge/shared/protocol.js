export const MESSAGE_TYPES = {
  IDENTIFY: 'identify',
  IDENTIFIED: 'identified',
  GEO_UPDATE: 'geo_update',
  PLAYER_UPDATE: 'player_update',
  PLAYER_JOIN: 'player_join',
  PLAYER_LEAVE: 'player_leave',
  GEOFS_CHAT: 'geofs_chat',
  PLAYER_COUNT: 'player_count',
  DISCORD_CHAT: 'discord_chat',
  DISCORD_COMMAND: 'discord_command',
  PING: 'ping',
  SUBSCRIBE: 'subscribe',
  UNSUBSCRIBE: 'unsubscribe',
  STATUS: 'status',
  ERROR: 'error',
};

export function normalizePlayer(raw = {}) {
  const data = raw.player || raw;
  const player = {
    id: String(data.id ?? data.uid ?? data.userId ?? ''),
    acid: Number(data.acid ?? data.aircraftId ?? 0) || 0,
    callsign: String(data.callsign ?? data.cs ?? data.username ?? 'UNKNOWN').trim(),
    aircraft: Number(data.aircraft ?? data.ac ?? data.aircraftId ?? 0) || 0,
    latitude: Number(data.latitude ?? data.lat ?? data.location?.lat ?? data.co?.[0] ?? 0),
    longitude: Number(data.longitude ?? data.lon ?? data.location?.lon ?? data.co?.[1] ?? 0),
    altitude: Number(data.altitude ?? data.alt ?? data.co?.[2] ?? 0),
    heading: Number(data.heading ?? data.hdg ?? data.co?.[3] ?? 0),
    pitch: Number(data.pitch ?? data.co?.[4] ?? 0),
    roll: Number(data.roll ?? data.co?.[5] ?? 0),
    speed: Number(data.speed ?? data.airspeed ?? data.ve?.as ?? 0),
    gear: Number(data.gear ?? data.st?.gr ?? 0),
    serverTime: Number(data.serverTime ?? data.ti ?? Date.now()),
    source: data.source || 'geofs',
    lastSeen: data.lastSeen || Date.now(),
  };

  return player;
}

export function normalizeChat(payload = {}) {
  const msg = payload.message ?? payload.msg ?? '';
  return {
    type: MESSAGE_TYPES.GEOFS_CHAT,
    playerId: payload.playerId ?? payload.uid ?? payload.userId ?? '',
    acid: Number(payload.acid ?? 0) || 0,
    callsign: String(payload.callsign ?? payload.cs ?? 'UNKNOWN').trim(),
    message: decodeURIComponent(String(msg)).replace(/\+/g, ' '),
    timestamp: payload.timestamp || Date.now(),
  };
}

export function sanitizePlayerForDiscord(player = {}) {
  return {
    id: player.id,
    callsign: player.callsign,
    aircraft: player.aircraft,
    latitude: player.latitude,
    longitude: player.longitude,
    altitude: player.altitude,
    heading: player.heading,
    speed: player.speed,
    gear: player.gear,
  };
}
