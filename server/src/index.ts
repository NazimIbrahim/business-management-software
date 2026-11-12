// Global Crash Protectors - Guarantee logs are visible and process does not silently exit
process.on('uncaughtException', (err) => {
  console.error('[FATAL UNCAUGHT EXCEPTION]', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[FATAL UNHANDLED REJECTION]', reason);
});

// Main Server Entrypoint
import './server';
