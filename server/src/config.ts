import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });
dotenv.config();

let rawDbUrl = (process.env.DATABASE_URL || '').trim();
if (rawDbUrl && ((rawDbUrl.startsWith('"') && rawDbUrl.endsWith('"')) || (rawDbUrl.startsWith("'") && rawDbUrl.endsWith("'")))) {
  rawDbUrl = rawDbUrl.slice(1, -1).trim();
}

// Clean query parameters from connection string so pg does not overwrite rejectUnauthorized: false
let sanitizedDbUrl = rawDbUrl;
if (sanitizedDbUrl) {
  try {
    const parsed = new URL(sanitizedDbUrl);
    parsed.searchParams.delete('sslmode');
    parsed.searchParams.delete('channel_binding');
    sanitizedDbUrl = parsed.toString();
  } catch (_) {
    // Keep raw if URL parser fails
  }
}

const isCloudSsl = Boolean(
  sanitizedDbUrl ||
  process.env.DB_SSL === 'true'
);

export const config = {
  port: Number(process.env.PORT) > 0 ? Number(process.env.PORT) : 4000,
  db: {
    connectionString: sanitizedDbUrl || undefined,
    rawConnectionString: rawDbUrl || undefined,
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'ama_quotations',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    ssl: isCloudSsl ? { rejectUnauthorized: false } : false,
    max: parseInt(process.env.DB_MAX_CONNECTIONS || '20', 10),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  },
  jwtSecret: process.env.JWT_SECRET || 'ama_ceramics_secret_key_2026_jwt_token',
  jwtExpiresIn: '7d',
  logsDir: process.env.LOGS_DIR || path.resolve(process.cwd(), 'logs'),
  backupDir: process.env.BACKUP_DIR || path.resolve(process.cwd(), 'backups'),
};
