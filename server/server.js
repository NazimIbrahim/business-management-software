// Direct wrapper for Render default start command (node server.js)
console.log('[SERVER.JS] Booting backend server from server/ directory...');
try {
  require('./dist/server.js');
} catch (err) {
  console.error('[FATAL SERVER.JS ERROR]', err);
  process.exit(1);
}
