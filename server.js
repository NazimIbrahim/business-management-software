// Root entrypoint for Render when Root Directory is not set to 'server'
console.log('[ROOT SERVER.JS] Booting backend server from repository root...');
try {
  require('./server/dist/index.js');
} catch (err) {
  console.error('[FATAL ROOT SERVER.JS ERROR]', err);
  process.exit(1);
}
