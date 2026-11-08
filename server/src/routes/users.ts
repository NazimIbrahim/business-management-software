import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db/connection';
import { authenticateToken, requireRole } from '../middleware/auth';
import { recordAuditLog } from '../utils/audit';

export const usersRouter = Router();

usersRouter.use(authenticateToken);

// List all users
usersRouter.get('/', async (req: Request, res: Response) => {
  try {
    const { role, for_quotation } = req.query;
    const isSalesperson = req.user?.role?.toLowerCase() === 'salesperson';

    let sql = `SELECT id, username, full_name, role, email, phone, monthly_target, is_active, created_at, updated_at
               FROM users`;
    const params: any[] = [];
    let idx = 1;

    // Salespersons can only view their own user record in user listings unless explicitly requesting quotation assignment list
    if (isSalesperson && for_quotation !== 'true') {
      sql += ` WHERE id = $${idx++}`;
      params.push(req.user!.id);
    } else if (role) {
      sql += ` WHERE role = $${idx++}`;
      params.push(role);
    }
    sql += ' ORDER BY full_name ASC';
    const rows = await query(sql, params);
    res.json({ users: rows });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get sales team for quotation creation / assistance dropdowns
usersRouter.get('/sales-team', async (req: Request, res: Response) => {
  try {
    const rows = await query(
      `SELECT id, full_name, role FROM users WHERE is_active = true AND role IN ('salesperson', 'manager', 'admin') ORDER BY full_name ASC`
    );
    res.json({ users: rows });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create new user (Admin or Manager)
usersRouter.post('/', requireRole(['admin', 'manager']), async (req: Request, res: Response) => {
  try {
    const { username, password, full_name, role = 'salesperson', email, phone, monthly_target } = req.body;

    if (!username || !password || !full_name) {
      res.status(400).json({ error: 'Username, password, and full name are required' });
      return;
    }

    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password, salt);

    const rows = await query(
      `INSERT INTO users (username, password_hash, full_name, role, email, phone, monthly_target)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, username, full_name, role, email, phone, monthly_target, is_active, created_at`,
      [username.trim(), hash, full_name.trim(), role, email, phone, monthly_target || 0]
    );

    await recordAuditLog({
      userId: req.user!.id,
      username: req.user!.username,
      action: 'USER_CREATED',
      entityType: 'user',
      entityId: rows[0].id,
      details: { username, role, full_name },
      ipAddress: req.ip,
    });

    res.status(201).json({ user: rows[0] });
  } catch (error: any) {
    if (error.code === '23505') {
      res.status(409).json({ error: 'Username already exists' });
      return;
    }
    res.status(500).json({ error: error.message });
  }
});

// Update user (Admin or Manager for target)
usersRouter.put('/:id', requireRole(['admin', 'manager']), async (req: Request, res: Response) => {
  try {
    const userId = parseInt(req.params.id as string, 10);
    const { username, full_name, role, email, phone, monthly_target, is_active, password } = req.body;

    let updateFields: string[] = [];
    let params: any[] = [];
    let idx = 1;

    if (username !== undefined && req.user!.role === 'admin') {
      const cleanUser = String(username).trim();
      const existing = await query('SELECT id FROM users WHERE LOWER(username) = LOWER($1) AND id != $2', [cleanUser, userId]);
      if (existing.length > 0) {
        res.status(409).json({ error: 'Username already exists' });
        return;
      }
      updateFields.push(`username = $${idx++}`);
      params.push(cleanUser);
    }
    if (full_name !== undefined) {
      updateFields.push(`full_name = $${idx++}`);
      params.push(full_name);
    }
    if (role !== undefined && req.user!.role === 'admin') {
      updateFields.push(`role = $${idx++}`);
      params.push(role);
    }
    if (email !== undefined) {
      updateFields.push(`email = $${idx++}`);
      params.push(email);
    }
    if (phone !== undefined) {
      updateFields.push(`phone = $${idx++}`);
      params.push(phone);
    }
    if (monthly_target !== undefined) {
      updateFields.push(`monthly_target = $${idx++}`);
      params.push(monthly_target);
    }
    if (is_active !== undefined && req.user!.role === 'admin') {
      updateFields.push(`is_active = $${idx++}`);
      params.push(is_active);
    }
    if (password && req.user!.role === 'admin') {
      const salt = await bcrypt.genSalt(10);
      const hash = await bcrypt.hash(password, salt);
      updateFields.push(`password_hash = $${idx++}`);
      params.push(hash);
    }

    if (updateFields.length === 0) {
      res.status(400).json({ error: 'No update parameters provided' });
      return;
    }

    updateFields.push(`updated_at = NOW()`);
    params.push(userId);

    const sql = `UPDATE users SET ${updateFields.join(', ')} WHERE id = $${idx} RETURNING id, username, full_name, role, email, phone, monthly_target, is_active`;
    const rows = await query(sql, params);

    if (rows.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    await recordAuditLog({
      userId: req.user!.id,
      username: req.user!.username,
      action: 'USER_UPDATED',
      entityType: 'user',
      entityId: userId,
      ipAddress: req.ip,
    });

    res.json({ user: rows[0] });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Dedicated password reset endpoint for Admin
usersRouter.post('/:id/reset-password', requireRole(['admin']), async (req: Request, res: Response) => {
  try {
    const userId = parseInt(req.params.id as string, 10);
    const { new_password } = req.body;

    if (!new_password || String(new_password).trim().length < 4) {
      res.status(400).json({ error: 'New password must be at least 4 characters long' });
      return;
    }

    const userRows = await query('SELECT id, username, full_name FROM users WHERE id = $1', [userId]);
    if (userRows.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(String(new_password).trim(), salt);

    await query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [hash, userId]);

    await recordAuditLog({
      userId: req.user!.id,
      username: req.user!.username,
      action: 'PASSWORD_RESET',
      entityType: 'user',
      entityId: userId,
      details: { target_username: userRows[0].username, target_name: userRows[0].full_name },
      ipAddress: req.ip,
    });

    res.json({ message: `Password for ${userRows[0].username} has been reset successfully` });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get Salesperson Detailed Statistics & Performance
usersRouter.get('/:id/stats', async (req: Request, res: Response) => {
  try {
    const userId = parseInt(req.params.id as string, 10);
    const isSalesperson = req.user?.role?.toLowerCase() === 'salesperson';

    if (isSalesperson && userId !== req.user!.id) {
      res.status(403).json({ error: 'Access denied: Salespersons can only view their own performance statistics.' });
      return;
    }

    const userRows = await query(
      'SELECT id, username, full_name, role, email, phone, monthly_target, is_active FROM users WHERE id = $1',
      [userId]
    );
    if (userRows.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const salesperson = userRows[0];

    // Status-wise quotation summary (split-aware for both primary and assisted salesperson)
    const statusRows = await query(
      `SELECT
        LOWER(q.status) as status,
        count(*) as count,
        COALESCE(SUM(
          CASE
            WHEN q.sales_person_id = $1 THEN
              CASE
                WHEN q.assisted_sales_person_id IS NOT NULL AND q.primary_sales_share_amount > 0 THEN q.primary_sales_share_amount
                WHEN q.assisted_sales_person_id IS NOT NULL AND q.primary_sales_share_percent > 0 THEN ROUND((q.net_total * q.primary_sales_share_percent / 100.0)::numeric, 2)
                ELSE q.net_total
              END
            WHEN q.assisted_sales_person_id = $1 THEN
              CASE
                WHEN q.assisted_sales_share_amount > 0 THEN q.assisted_sales_share_amount
                WHEN q.assisted_sales_share_percent > 0 THEN ROUND((q.net_total * q.assisted_sales_share_percent / 100.0)::numeric, 2)
                ELSE 0
              END
            ELSE 0
          END
        ), 0) as total_val
       FROM quotations q
       WHERE (q.sales_person_id = $1 OR q.assisted_sales_person_id = $1)
       GROUP BY LOWER(q.status)`,
      [userId]
    );

    const statusMap: Record<string, { count: number; val: number }> = {};
    let totalQuotes = 0;
    let totalQuoted = 0;
    let approvedRevenue = 0;
    let pipelineRevenue = 0;
    let pipelineQuotes = 0;

    statusRows.forEach((r: any) => {
      const c = parseInt(r.count, 10);
      const v = parseFloat(r.total_val);
      const st = String(r.status).toLowerCase();
      statusMap[st] = { count: c, val: v };
      totalQuotes += c;
      totalQuoted += v;
      if (['approved', 'closed'].includes(st)) {
        approvedRevenue += v;
      } else if (['draft', 'in_review'].includes(st)) {
        pipelineRevenue += v;
        pipelineQuotes += c;
      }
    });

    // Payments collected (split-aware)
    const payRows = await query(
      `SELECT COALESCE(SUM(
        CASE
          WHEN q.sales_person_id = $1 THEN
            CASE
              WHEN q.assisted_sales_person_id IS NOT NULL AND q.primary_sales_share_percent > 0 THEN ROUND((p.amount * q.primary_sales_share_percent / 100.0)::numeric, 2)
              WHEN q.assisted_sales_person_id IS NOT NULL AND q.net_total > 0 THEN ROUND((p.amount * (q.primary_sales_share_amount / q.net_total))::numeric, 2)
              ELSE p.amount
            END
          WHEN q.assisted_sales_person_id = $1 THEN
            CASE
              WHEN q.assisted_sales_share_percent > 0 THEN ROUND((p.amount * q.assisted_sales_share_percent / 100.0)::numeric, 2)
              WHEN q.net_total > 0 THEN ROUND((p.amount * (q.assisted_sales_share_amount / q.net_total))::numeric, 2)
              ELSE 0
            END
          ELSE 0
        END
      ), 0) as total_collected
      FROM payments p
      JOIN quotations q ON q.id = p.quotation_id
      WHERE (q.sales_person_id = $1 OR q.assisted_sales_person_id = $1) AND p.status IN ('Cleared', 'Verified')`,
      [userId]
    );
    const totalCollected = parseFloat(payRows[0].total_collected);
    const outstanding = Math.max(0, approvedRevenue - totalCollected);

    const target = parseFloat(salesperson.monthly_target) || 0;
    const targetPercent = target > 0 ? parseFloat(((approvedRevenue / target) * 100).toFixed(1)) : 0;
    const quotedPercent = target > 0 ? parseFloat(((totalQuoted / target) * 100).toFixed(1)) : 0;

    res.json({
      salesperson,
      metrics: {
        totalQuotes,
        totalQuoted,
        approvedRevenue,
        pipelineRevenue,
        pipelineQuotes,
        totalCollected,
        outstanding,
        target,
        targetPercent,
        quotedPercent,
        statusMap,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Delete all salespersons (Admin & Accounts only, keeps logged-in user)
usersRouter.delete('/all-salespersons', requireRole(['admin', 'accounts', 'accountant']), async (req: Request, res: Response) => {
  try {
    await query(`DELETE FROM users WHERE role = 'salesperson' AND id != $1`, [req.user!.id]);
    res.json({ message: 'All salesperson accounts deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Delete single user / salesperson (Admin & Accounts only)
usersRouter.delete('/:id', requireRole(['admin', 'accounts', 'accountant']), async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    if (id === req.user!.id) {
      res.status(400).json({ error: 'You cannot delete your own account' });
      return;
    }
    const check = await query('SELECT username, role FROM users WHERE id = $1', [id]);
    if (check.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    if (check[0].username === 'admin') {
      res.status(400).json({ error: 'Cannot delete primary admin account' });
      return;
    }
    await query('DELETE FROM users WHERE id = $1', [id]);
    res.json({ message: `User ${check[0].username} deleted successfully` });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

