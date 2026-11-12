import fs from 'fs';
import path from 'path';
import { config } from '../config';

const MAX_LOG_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB max per log file
const MAX_BACKUP_LOGS = 3;

try {
  if (!fs.existsSync(config.logsDir)) {
    fs.mkdirSync(config.logsDir, { recursive: true });
  }
} catch {
  // Silent fallback: In restricted containers stdout will handle logs
}

function rotateLogFile(filePath: string) {
  try {
    if (!fs.existsSync(filePath)) return;
    const stat = fs.statSync(filePath);
    if (stat.size < MAX_LOG_SIZE_BYTES) return;

    for (let i = MAX_BACKUP_LOGS - 1; i >= 1; i--) {
      const oldFile = `${filePath}.${i}`;
      const newFile = `${filePath}.${i + 1}`;
      if (fs.existsSync(oldFile)) {
        fs.renameSync(oldFile, newFile);
      }
    }
    fs.renameSync(filePath, `${filePath}.1`);
  } catch {
    // Ignore file rotation failures in read-only environments
  }
}

export function log(level: 'INFO' | 'WARN' | 'ERROR', message: string, meta?: any) {
  const timestamp = new Date().toISOString();
  const metaStr = meta ? ` | ${JSON.stringify(meta)}` : '';
  const logLine = `[${timestamp}] [${level}] ${message}${metaStr}\n`;

  // Always output to stdout for cloud runtime log drains (Render, Vercel, Docker)
  console.log(`[${level}] ${message}`);

  try {
    const logFile = path.join(config.logsDir, `${level.toLowerCase()}.log`);
    rotateLogFile(logFile);
    fs.appendFileSync(logFile, logLine, 'utf8');
  } catch {
    // Ignore local file append error if disk is restricted
  }
}

export const logger = {
  info: (msg: string, meta?: any) => log('INFO', msg, meta),
  warn: (msg: string, meta?: any) => log('WARN', msg, meta),
  error: (msg: string, meta?: any) => log('ERROR', msg, meta),
};
