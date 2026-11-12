import { Router, Request, Response } from 'express';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import { config } from '../config';
import { authenticateToken, requireRole } from '../middleware/auth';
import { recordAuditLog } from '../utils/audit';
import { logger } from '../utils/logger';

export const backupRouter = Router();

backupRouter.use(authenticateToken);
backupRouter.use(requireRole(['admin']));

try {
  if (!fs.existsSync(config.backupDir)) {
    fs.mkdirSync(config.backupDir, { recursive: true });
  }
} catch (err: any) {
  console.warn('[BACKUP] Backup directory init warning:', err?.message || err);
}

// 1. List backups
backupRouter.get('/list', async (req: Request, res: Response) => {
  try {
    const files = fs.readdirSync(config.backupDir);
    const backups = files
      .filter((f) => f.endsWith('.sql') || f.endsWith('.dump'))
      .map((f) => {
        const filePath = path.join(config.backupDir, f);
        const stat = fs.statSync(filePath);
        return {
          filename: f,
          sizeBytes: stat.size,
          sizeFormatted: `${(stat.size / (1024 * 1024)).toFixed(2)} MB`,
          createdAt: stat.birthtime.toISOString(),
        };
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    res.json({ backups });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 2. Trigger Backup
backupRouter.post('/create', async (req: Request, res: Response) => {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `ama_quotations_backup_${timestamp}.sql`;
    const targetPath = path.join(config.backupDir, filename);

    const pgDumpPath = `"C:\\Program Files\\PostgreSQL\\16\\bin\\pg_dump.exe"`;
    const cmd = `${pgDumpPath} -h ${config.db.host} -p ${config.db.port} -U ${config.db.user} -d ${config.db.database} -F p -f "${targetPath}"`;

    logger.info(`Starting database backup to ${filename}...`);

    exec(cmd, { env: { ...process.env, PGPASSWORD: config.db.password } }, async (error, stdout, stderr) => {
      if (error) {
        logger.error('Database backup failed:', stderr || error.message);
        res.status(500).json({ error: 'Database backup failed: ' + (stderr || error.message) });
        return;
      }

      const stat = fs.statSync(targetPath);
      logger.info(`Database backup completed: ${filename} (${stat.size} bytes)`);

      await recordAuditLog({
        userId: req.user!.id,
        username: req.user!.username,
        action: 'DATABASE_BACKUP_CREATED',
        entityType: 'database',
        details: { filename, sizeBytes: stat.size },
        ipAddress: req.ip,
      });

      res.status(201).json({
        message: 'Backup created successfully',
        backup: {
          filename,
          sizeFormatted: `${(stat.size / (1024 * 1024)).toFixed(2)} MB`,
          createdAt: new Date().toISOString(),
        },
      });
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 3. Restore Backup
backupRouter.post('/restore', async (req: Request, res: Response) => {
  try {
    const { filename } = req.body;
    if (!filename) {
      res.status(400).json({ error: 'Filename is required' });
      return;
    }

    const safeFilename = path.basename(filename);
    const sourcePath = path.join(config.backupDir, safeFilename);

    if (!fs.existsSync(sourcePath)) {
      res.status(404).json({ error: 'Backup file not found' });
      return;
    }

    const psqlPath = `"C:\\Program Files\\PostgreSQL\\16\\bin\\psql.exe"`;
    const cmd = `${psqlPath} -h ${config.db.host} -p ${config.db.port} -U ${config.db.user} -d ${config.db.database} -f "${sourcePath}"`;

    logger.info(`Restoring database from ${safeFilename}...`);

    exec(cmd, { env: { ...process.env, PGPASSWORD: config.db.password } }, async (error, stdout, stderr) => {
      if (error) {
        logger.error('Database restore error:', stderr || error.message);
        res.status(500).json({ error: 'Database restore error: ' + (stderr || error.message) });
        return;
      }

      await recordAuditLog({
        userId: req.user!.id,
        username: req.user!.username,
        action: 'DATABASE_RESTORED',
        entityType: 'database',
        details: { filename: safeFilename },
        ipAddress: req.ip,
      });

      res.json({ message: 'Database restored successfully from backup' });
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
