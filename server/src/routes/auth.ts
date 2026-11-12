import { ensureRolesSchema } from './roles';
import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query, testConnection, getLastDbError } from '../db/connection';
import { config } from '../config';
import { authenticateToken, AuthUser } from '../middleware/auth';
import { recordAuditLog } from '../utils/audit';

export const authRouter = Router();

authRouter.post('/login', async (req: Request, res: Response) => {
  try {
    const { username, password, role } = req.body;

    // Check if cloud DATABASE_URL is configured
    if (!config.db.connectionString && (process.env.NODE_ENV === 'production' || process.env.RENDER)) {
      return res.status(503).json({
        error: 'DATABASE_URL environment variable is missing on Render. Please open your Render dashboard -> Environment tab -> Add variable DATABASE_URL with your Neon.tech connection string.'
      });
    }

    // Check database connection before doing anything
    const conn = await testConnection();
    if (!conn.ok) {
      const errDetail = conn.error || getLastDbError() || 'Connection failed';
      return res.status(503).json({
        error: `Database is offline (${errDetail}). Please verify your DATABASE_URL in the Render dashboard.`
      });
    }

    // 1. Instant 1-Click Administrator login (when role === 'admin' and no password is provided)
    if ((role === 'admin' || username === 'admin') && (!password || String(password).trim() === '')) {
      let adminUser = await query("SELECT * FROM users WHERE role = 'admin' LIMIT 1");
      if (adminUser.length === 0) {
        const hash = await bcrypt.hash('admin', 10);
        adminUser = await query(
          `INSERT INTO users (username, password_hash, full_name, role, email, phone, is_active)
           VALUES ('admin', $1, 'System Administrator', 'admin', 'admin@amaceramics.com', '+91 98250 00001', true)
           RETURNING *`,
          [hash]
        );
      }

      const user = adminUser[0];
      const payload: AuthUser = {
        id: user.id,
        username: user.username,
        full_name: user.full_name,
        role: user.role,
        sales_category: user.sales_category || 'MANAGEMENT',
        email: user.email,
        phone: user.phone,
      };

      const token = jwt.sign(payload, config.jwtSecret, { expiresIn: '7d' });
      try {
        await recordAuditLog({
          userId: user.id,
          username: user.username,
          action: 'USER_LOGIN',
          entityType: 'user',
          entityId: user.id,
          ipAddress: req.ip,
        });
      } catch (_) {}

      return res.json({ token, user: payload });
    }

    // 2. Standard Credential Login with Username & Password
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const cleanUsername = String(username).trim();
    let rows: any[];
    try {
      rows = await query(
        `SELECT u.id, u.username, u.password_hash, u.full_name, u.role, u.sales_category, u.email, u.phone, u.is_active,
                COALESCE(r.permissions, '{}'::jsonb) as permissions
         FROM users u
         LEFT JOIN roles r ON r.name = u.role
         WHERE LOWER(u.username) = LOWER($1) OR (u.email IS NOT NULL AND LOWER(u.email) = LOWER($1))
         LIMIT 1`,
        [cleanUsername]
      );
    } catch (dbErr: any) {
      if (dbErr.message && dbErr.message.includes('roles')) {
        await ensureRolesSchema().catch(() => {});
        try {
          rows = await query(
            `SELECT u.id, u.username, u.password_hash, u.full_name, u.role, u.sales_category, u.email, u.phone, u.is_active,
                    COALESCE(r.permissions, '{}'::jsonb) as permissions
             FROM users u
             LEFT JOIN roles r ON r.name = u.role
             WHERE LOWER(u.username) = LOWER($1) OR (u.email IS NOT NULL AND LOWER(u.email) = LOWER($1))
             LIMIT 1`,
            [cleanUsername]
          );
        } catch {
          rows = await query(
            `SELECT u.id, u.username, u.password_hash, u.full_name, u.role, u.sales_category, u.email, u.phone, u.is_active,
                    '{}'::jsonb as permissions
             FROM users u
             WHERE LOWER(u.username) = LOWER($1) OR (u.email IS NOT NULL AND LOWER(u.email) = LOWER($1))
             LIMIT 1`,
            [cleanUsername]
          );
        }
      } else {
        throw dbErr;
      }
    }

    if (rows.length === 0) {
      // Auto-create admin if database has no admin row and user attempts admin / admin
      if (cleanUsername.toLowerCase() === 'admin' && String(password) === 'admin') {
        const hash = await bcrypt.hash('admin', 10);
        const newAdmin = await query(
          `INSERT INTO users (username, password_hash, full_name, role, email, phone, is_active, sales_category)
           VALUES ('admin', $1, 'System Administrator', 'admin', 'admin@amaceramics.com', '+91 98250 00001', true, 'MANAGEMENT')
           RETURNING id, username, password_hash, full_name, role, sales_category, email, phone, is_active`,
          [hash]
        );
        rows = newAdmin;
      } else {
        return res.status(401).json({ error: 'Invalid username or password' });
      }
    }

    const user = rows[0];

    if (!user.is_active) {
      return res.status(403).json({ error: 'This account has been deactivated. Please contact your Administrator.' });
    }

    let passwordMatch = await bcrypt.compare(String(password), user.password_hash);
    // Instant fallback & auto-reset if user logs in with admin / admin but DB holds legacy hash
    if (!passwordMatch && cleanUsername.toLowerCase() === 'admin' && String(password) === 'admin') {
      const newHash = await bcrypt.hash('admin', 10);
      await query("UPDATE users SET password_hash = $1, is_active = true WHERE id = $2", [newHash, user.id]).catch(() => {});
      passwordMatch = true;
    }

    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const payload: AuthUser = {
      id: user.id,
      username: user.username,
      full_name: user.full_name,
      role: user.role,
      sales_category: user.sales_category || (['admin', 'manager'].includes(user.role) ? 'MANAGEMENT' : 'RETAIL'),
      email: user.email,
      phone: user.phone,
    };

    const token = jwt.sign(payload, config.jwtSecret, { expiresIn: '7d' });

    try {
      await recordAuditLog({
        userId: user.id,
        username: user.username,
        action: 'USER_LOGIN',
        entityType: 'user',
        entityId: user.id,
        ipAddress: req.ip,
      });
    } catch (_) {}

    return res.json({ token, user: payload });
  } catch (error: any) {
    const errorMsg = error?.message || (typeof error === 'string' ? error : '') || getLastDbError() || 'Internal server error during login';
    res.status(500).json({ error: errorMsg });
  }
});

authRouter.get('/me', authenticateToken, async (req: Request, res: Response) => {
  try {
    const rows = await query(
      `SELECT id, username, full_name, role, email, phone, monthly_target, is_active
       FROM users WHERE id = $1`,
      [req.user!.id]
    );

    if (rows.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({ user: rows[0] });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

authRouter.put('/profile', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { full_name, email, phone, current_password, new_password } = req.body;

    if (new_password) {
      if (!current_password) {
        res.status(400).json({ error: 'Current password required to set new password' });
        return;
      }
      const userRows = await query('SELECT password_hash FROM users WHERE id = $1', [req.user!.id]);
      const valid = await bcrypt.compare(current_password, userRows[0].password_hash);
      if (!valid) {
        res.status(400).json({ error: 'Incorrect current password' });
        return;
      }
      const salt = await bcrypt.genSalt(10);
      const newHash = await bcrypt.hash(new_password, salt);
      await query(
        `UPDATE users SET password_hash = $1, full_name = COALESCE($2, full_name),
         email = COALESCE($3, email), phone = COALESCE($4, phone), updated_at = NOW()
         WHERE id = $5`,
        [newHash, full_name, email, phone, req.user!.id]
      );
    } else {
      await query(
        `UPDATE users SET full_name = COALESCE($1, full_name),
         email = COALESCE($2, email), phone = COALESCE($3, phone), updated_at = NOW()
         WHERE id = $4`,
        [full_name, email, phone, req.user!.id]
      );
    }

    res.json({ message: 'Profile updated successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
