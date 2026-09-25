import crypto from 'node:crypto';

function decodeMessage(value) {
  if (typeof value !== 'string') return null;
  try { return decodeURIComponent(value); } catch { return value; }
}

function isoTimestamp(value) {
  if (!value) return new Date().toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? new Date().toISOString() : parsed.toISOString();
}

function textOrNull(value) {
  if (value === undefined || value === null || value === '') return null;
  return String(value);
}

export function normalizeMessage(raw, source = 'GeoFS') {
  const message = decodeMessage(raw?.msg ?? raw?.message);
  if (!message) return null;
  const callsign = textOrNull(raw.cs ?? raw.callsign);
  const uid = textOrNull(raw.uid ?? raw.userId);
  const aircraftId = textOrNull(raw.acid ?? raw.aircraftId);
  const timestamp = isoTimestamp(raw.timestamp ?? raw.time);
  const sourceId = textOrNull(raw.id ?? raw.messageId);
  const fallbackIdentity = [uid, aircraftId, callsign, message, timestamp].map((value) => value ?? '').join('|');
  const dedupeKey = sourceId ? `id:${sourceId}` : `hash:${crypto.createHash('sha256').update(fallbackIdentity).digest('hex')}`;
  return {
    sourceId,
    dedupeKey,
    timestamp,
    callsign,
    uid,
    aircraftId,
    message,
    server: textOrNull(raw.server) ?? source,
    createdAt: new Date().toISOString(),
  };
}

export function validateBafChatMessage(payload) {
  const raw = payload && typeof payload === 'object' ? payload : {};
  const callsign = String(raw.callsign ?? raw.cs ?? raw.username ?? '').trim();
  const message = String(raw.message ?? raw.msg ?? '').trim();
  const channel = String(raw.channel ?? 'BAF CHAT').trim() || 'BAF CHAT';
  const server = String(raw.server ?? 'BOC Server').trim() || 'BOC Server';
  const valid = Boolean(callsign) && callsign.length <= 64 && Boolean(message) && message.length <= 500 && channel.length > 0 && channel.length <= 128;
  return { valid, channel, callsign, message, server, username: String(raw.username ?? raw.callsign ?? callsign).trim() };
}

export function normalizeBafChatMessage(raw) {
  const validated = validateBafChatMessage(raw);
  if (!validated.valid) return null;
  const id = textOrNull(raw.id ?? raw.messageId) || `bafchat:${Date.now()}:${crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(16).slice(2)}`;
  const normalized = normalizeMessage({
    id,
    cs: validated.callsign,
    uid: textOrNull(raw.uid ?? raw.userId) ?? `baf:${validated.callsign}`,
    acid: textOrNull(raw.aircraftId ?? raw.acid),
    msg: validated.message,
    server: validated.server,
    timestamp: raw.timestamp ?? new Date().toISOString(),
  }, 'BAF_CHAT');
  if (!normalized) return null;
  return { ...normalized, channel: validated.channel, username: validated.username };
}

export function createCollector({ repository, publish, logger }) {
  return {
    ingest(messages, source = 'GeoFS') {
      const list = Array.isArray(messages) ? messages : [messages];
      const normalized = list.map((message) => normalizeMessage(message, source)).filter(Boolean);
      if (!normalized.length) return { received: list.length, stored: 0, messages: [] };
      const insertion = repository.insertMany(normalized);
      const stored = insertion.count;
      if (stored) logger.info({ stored, received: list.length }, 'Chat messages stored');
      const freshKeys = new Set(insertion.keys);
      const fresh = normalized.filter((message) => freshKeys.has(message.dedupeKey));
      fresh.forEach((message) => publish({ type: 'chat.message', data: message }));
      return { received: list.length, stored, messages: fresh };
    },
  };
}
