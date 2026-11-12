// Direct wrapper for Render default start command (node app.js)
console.log('[SERVER APP.JS] Booting backend server from server/ directory...');
try {
  require('./dist/server.js');
} catch (err) {
  console.error('[FATAL SERVER APP.JS ERROR]', err);
  process.exit(1);
}
