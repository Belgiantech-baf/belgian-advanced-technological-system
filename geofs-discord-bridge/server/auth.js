import crypto from 'node:crypto';

export function verifyBridgeToken(token, expected) {
  if (!token || !expected) return false;
  return crypto.timingSafeEqual(
    Buffer.from(String(token)),
    Buffer.from(String(expected))
  );
}

export function createClientId() {
  return crypto.randomUUID();
}

export function isAuthorizedMessage(message, secret) {
  if (!message || typeof message !== 'object') return false;
  if (message.type === 'identify') {
    return typeof message.token === 'string' && message.token === secret;
  }
  return true;
}
