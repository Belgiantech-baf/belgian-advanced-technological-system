export function shouldForwardDiscordEvent(type) {
  return type === 'chat.message' || type === 'baf.chat';
}

export function toDiscordRelayPayload(message = {}) {
  return {
    type: 'chat',
    username: message.callsign || message.username || 'GeoFS',
    message: message.message ?? message.msg ?? '',
    timestamp: message.timestamp || new Date().toISOString(),
    server: message.server || 'GeoFS',
    uid: message.uid || null,
    aircraftId: message.aircraftId || null,
  };
}
