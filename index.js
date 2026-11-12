// Root entrypoint for Render when Start Command is 'node index.js'
console.log('[ROOT INDEX.JS] Booting backend server from repository root...');
try {
  require('./server/dist/server.js');
} catch (err) {
  console.error('[FATAL ROOT INDEX.JS ERROR]', err);
  process.exit(1);
}
