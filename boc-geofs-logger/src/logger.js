export function createLogger(level = 'info') {
  const ranks = { debug: 10, info: 20, warn: 30, error: 40 };
  const threshold = ranks[level] ?? ranks.info;
  return Object.fromEntries(Object.entries(ranks).map(([name, rank]) => [name, (data, message) => {
    if (rank < threshold) return;
    const payload = typeof data === 'object' ? data : {};
    const text = typeof data === 'string' ? data : message;
    process.stdout.write(`${JSON.stringify({ timestamp: new Date().toISOString(), level: name.toUpperCase(), message: text, ...payload })}\n`);
  }]));
}
