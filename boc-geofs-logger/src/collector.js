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
