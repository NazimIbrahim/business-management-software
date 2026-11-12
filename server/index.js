// Direct wrapper for Render default start command (node index.js)
console.log('[SERVER INDEX.JS] Booting backend server from server/ directory...');
try {
  require('./dist/index.js');
} catch (err) {
  console.error('[FATAL SERVER INDEX.JS ERROR]', err);
  process.exit(1);
}
