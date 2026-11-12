// Root entrypoint for Render when Start Command is 'node app.js'
console.log('[ROOT APP.JS] Booting backend server from repository root...');
try {
  require('./server/dist/index.js');
} catch (err) {
  console.error('[FATAL ROOT APP.JS ERROR]', err);
  process.exit(1);
}
