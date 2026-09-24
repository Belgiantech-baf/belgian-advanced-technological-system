import 'dotenv/config';
import http from 'node:http';
import crypto from 'node:crypto';
import path from 'node:path';
import process from 'node:process';
import express from 'express';
import helmet from 'helmet';
import { fileURLToPath } from 'node:url';
import { openDatabase, createRepository } from './database.js';
import { createCollector } from './collector.js';
import { createLogger } from './logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 3000);
const databasePath = path.resolve(process.env.DATABASE_PATH || path.join(__dirname, '..', 'data', 'boc-chat.sqlite'));
const apiKey = process.env.BOC_API_KEY || '';
const discordRelayUrl = process.env.DISCORD_RELAY_URL || '';
const discordRelayKey = process.env.DISCORD_RELAY_KEY || '';
const logger = createLogger(process.env.LOG_LEVEL || 'info');
const db = openDatabase(databasePath);
const repository = createRepository(db);
const sseClients = new Set();
const startedAt = Date.now();
const ingestWindows = new Map();

function publish(event) {
  const payload = `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`;
  for (const response of sseClients) response.write(payload);
  if (event.type === 'chat.message') forwardToRadarBot(event.data);
}

async function forwardToRadarBot(message) {
  if (!discordRelayUrl) return;
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (discordRelayKey) headers['X-BOC-Relay-Key'] = discordRelayKey;
    const response = await fetch(discordRelayUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        type: 'chat',
        username: message.callsign || 'GeoFS',
        message: message.message,
        timestamp: message.timestamp,
        server: message.server,
        uid: message.uid,
        aircraftId: message.aircraftId,
      }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    logger.info({ messageId: message.id }, 'Chat message forwarded to existing Discord bot');
  } catch (error) {
    logger.error({ error: error.message, messageId: message.id }, 'Discord bot relay failed; message remains stored');
  }
}

const collector = createCollector({ repository, publish, logger });
const app = express();
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '64kb' }));
app.use((request, response, next) => {
  response.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || '*');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  if (request.method === 'OPTIONS') return response.sendStatus(204);
  next();
});

function requireApiKey(request, response, next) {
  if (!apiKey) return response.status(503).json({ error: 'BOC_API_KEY is not configured' });
  const supplied = request.get('x-api-key');
  if (!supplied || supplied.length !== apiKey.length || !cryptoEqual(supplied, apiKey)) return response.status(401).json({ error: 'Unauthorized' });
  next();
}

function cryptoEqual(left, right) {
  return crypto.timingSafeEqual(Buffer.from(left), Buffer.from(right));
}

function withinIngestLimit(request) {
  const now = Date.now();
  const key = request.ip || 'unknown';
  const current = ingestWindows.get(key) || { started: now, count: 0 };
  if (now - current.started > 60_000) { current.started = now; current.count = 0; }
  current.count += 1;
  ingestWindows.set(key, current);
  return current.count <= Number(process.env.INGEST_REQUESTS_PER_MINUTE || 240);
}

function validateMessageShape(message) {
  return message && typeof message === 'object' && typeof (message.msg ?? message.message) === 'string' && (message.msg ?? message.message).length <= 4000;
}

app.get('/api/status', (_request, response) => {
  response.json({
    status: 'online',
    geofsConnection: 'client-relay',
    database: 'connected',
    uptime: Math.floor((Date.now() - startedAt) / 1000),
    ...repository.stats(),
    ingestMode: 'authorized GeoFS client relay',
  });
});

app.get('/api/events', (request, response) => {
  response.status(200).set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  response.write(`event: ready\ndata: ${JSON.stringify({ connectedAt: new Date().toISOString() })}\n\n`);
  sseClients.add(response);
  const heartbeat = setInterval(() => response.write(': heartbeat\n\n'), 25_000);
  request.on('close', () => { clearInterval(heartbeat); sseClients.delete(response); });
});

app.post('/api/ingest', (request, response) => {
  if (!withinIngestLimit(request)) return response.status(429).json({ error: 'Ingest rate limit exceeded' });
  const body = request.body || {};
  const messages = Array.isArray(body.messages) ? body.messages : [body.message || body];
  const valid = messages.filter(validateMessageShape);
  if (!valid.length) return response.status(400).json({ error: 'Expected message or messages with a string msg/message field' });
  try {
    const result = collector.ingest(valid, body.source || 'GeoFS');
    response.status(202).json(result);
  } catch (error) {
    logger.error({ error: error.message }, 'Database error while ingesting chat');
    response.status(500).json({ error: 'Unable to store chat messages' });
  }
});

// Compatibility route for the existing BOC userscript relay payload.
app.post('/api/boc/log', (request, response) => {
  if (!withinIngestLimit(request)) return response.status(429).json({ error: 'Ingest rate limit exceeded' });
  const body = request.body || {};
  if (!validateMessageShape(body)) return response.status(400).json({ error: 'Expected a BOC activity containing a message string' });
  try {
    const result = collector.ingest({ ...body, server: body.server || 'GeoFS' }, 'GeoFS');
    response.status(202).json(result);
  } catch (error) {
    logger.error({ error: error.message }, 'Database error while ingesting BOC log');
    response.status(500).json({ error: 'Unable to store BOC log' });
  }
});

function listHandler(request, response) {
  const limit = Math.min(Math.max(Number(request.query.limit) || 100, 1), 500);
  const offset = Math.max(Number(request.query.offset) || 0, 0);
  const messages = repository.list({ limit, offset, q: request.query.q, callsign: request.query.callsign, uid: request.query.uid, from: request.query.from, to: request.query.to });
  response.json({ messages, limit, offset });
}

app.get('/api/chat', listHandler);
app.get('/api/chat/recent', listHandler);
app.get('/api/chat/search', listHandler);
app.get('/api/chat/:id', (request, response) => {
  const message = repository.get(Number(request.params.id));
  if (!message) return response.status(404).json({ error: 'Message not found' });
  response.json(message);
});

app.patch('/api/chat/:id/moderation', requireApiKey, (request, response) => {
  const body = request.body || {};
  if (typeof body.flagged !== 'boolean' || typeof body.reviewed !== 'boolean') return response.status(400).json({ error: 'flagged and reviewed must be boolean' });
  const message = repository.updateModeration(Number(request.params.id), { flagged: body.flagged, reviewed: body.reviewed, reason: body.reason ?? null });
  if (!message) return response.status(404).json({ error: 'Message not found' });
  publish({ type: 'chat.moderation', data: message });
  response.json(message);
});

app.use((_request, response) => response.status(404).json({ error: 'Not found' }));

const server = http.createServer(app);
server.listen(port, '0.0.0.0', () => logger.info({ port, databasePath }, 'BOC GeoFS logger online'));

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'Graceful shutdown started');
  for (const response of sseClients) response.end();
  await new Promise((resolve) => server.close(resolve));
  db.close();
  logger.info('Shutdown complete');
}

process.on('SIGTERM', () => shutdown('SIGTERM').finally(() => process.exit(0)));
process.on('SIGINT', () => shutdown('SIGINT').finally(() => process.exit(0)));
process.on('uncaughtException', (error) => { logger.error({ error: error.message }, 'Uncaught exception'); shutdown('uncaughtException').finally(() => process.exit(1)); });
process.on('unhandledRejection', (error) => logger.error({ error: String(error) }, 'Unhandled rejection'));
