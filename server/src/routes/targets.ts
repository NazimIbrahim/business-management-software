import { Router, Request, Response } from 'express';
import { query } from '../db/connection';
import { authenticateToken, requireRole } from '../middleware/auth';
import { recordAuditLog } from '../utils/audit';
import { broadcast } from '../ws';

export const targetsRouter = Router();

targetsRouter.use(authenticateToken);

// 1. List targets
targetsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const { salesperson_id, target_type, year } = req.query;

    let sql = `
      SELECT t.*, u.full_name as sales_person_name
      FROM sales_targets t
      JOIN users u ON u.id = t.sales_person_id
      WHERE 1=1
    `;
    const params: any[] = [];
    let idx = 1;

    // Salespersons can only view their own targets
    if (req.user?.role?.toLowerCase() === 'salesperson') {
      sql += ` AND t.sales_person_id = $${idx++}`;
      params.push(req.user!.id);
    } else if (salesperson_id) {
      sql += ` AND t.sales_person_id = $${idx++}`;
      params.push(salesperson_id);
    }
    if (target_type) {
      sql += ` AND t.target_type = $${idx++}`;
      params.push(target_type);
    }
    if (year) {
      sql += ` AND t.year = $${idx++}`;
      params.push(year);
    }

    sql += ' ORDER BY t.start_date DESC';
    const rows = await query(sql, params);
    res.json({ targets: rows });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 2. Set / Update Target (Manager / Admin) - Updates existing target instead of adding/accumulating
targetsRouter.post('/', requireRole(['admin', 'manager']), async (req: Request, res: Response) => {
  try {
    const { sales_person_id, target_type, start_date, end_date, target_amount, notes, period_label } = req.body;

    if (!sales_person_id || !target_type || !start_date || !end_date || target_amount === undefined || isNaN(Number(target_amount))) {
      res.status(400).json({ error: 'Salesperson, target type, dates, and a valid amount are required' });
      return;
    }

    const startObj = new Date(start_date);
    const year = startObj.getFullYear();
    const month = startObj.getMonth() + 1;
    let finalStartDate = start_date;
    let finalEndDate = end_date;
    if (target_type === 'Monthly') {
      finalStartDate = new Date(year, month - 1, 1).toISOString().split('T')[0];
      finalEndDate = new Date(year, month, 0).toISOString().split('T')[0];
    }
    const label = period_label || `${target_type} Target (${finalStartDate} to ${finalEndDate})`;
    const parsedAmount = parseFloat(target_amount);

    // Check if an existing target exists for this salesperson (for this period, year/month, or target type)
    const existing = await query(
      `SELECT id FROM sales_targets
       WHERE sales_person_id = $1
       ORDER BY created_at DESC`,
      [sales_person_id]
    );

    let targetRow: any;
    if (existing.length > 0) {
      // Update the active target record with the exact new amount
      const primaryId = existing[0].id;
      const updated = await query(
        `UPDATE sales_targets
         SET target_type = $1,
             start_date = $2,
             end_date = $3,
             year = $4,
             month = $5,
             period_label = $6,
             target_amount = $7,
             notes = $8,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $9
         RETURNING *`,
        [target_type, finalStartDate, finalEndDate, year, month, label, parsedAmount, notes || '', primaryId]
      );
      targetRow = updated[0];

      // Purge any stale duplicate rows for this salesperson so they NEVER accumulate or add up
      if (existing.length > 1) {
        const extraIds = existing.slice(1).map((r: any) => r.id);
        await query(`DELETE FROM sales_targets WHERE id = ANY($1::int[])`, [extraIds]);
      }
    } else {
      // Insert fresh target
      const inserted = await query(
        `INSERT INTO sales_targets (
          sales_person_id, target_type, start_date, end_date, year, month, period_label, target_amount, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *`,
        [sales_person_id, target_type, finalStartDate, finalEndDate, year, month, label, parsedAmount, notes || '']
      );
      targetRow = inserted[0];
    }

    // Always update the salesperson's base monthly_target in users table to match the exact target
    await query(
      `UPDATE users SET monthly_target = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [parsedAmount, sales_person_id]
    );

    await recordAuditLog({
      userId: req.user!.id,
      username: req.user!.username,
      action: 'TARGET_UPDATED',
      entityType: 'sales_target',
      entityId: targetRow.id,
      details: { sales_person_id, target_type, target_amount: parsedAmount },
      ipAddress: req.ip,
    });

    broadcast({ type: 'TARGET_UPDATED', payload: { sales_person_id } });

    res.status(200).json({ target: targetRow });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 3. Salesperson Performance Analytics (Target vs Actual Achievement)
targetsRouter.get('/performance', async (req: Request, res: Response) => {
  try {
    const { start_date, end_date } = req.query;

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const firstDay = new Date(year, month, 1).toISOString().split('T')[0];
    const lastDay = new Date(year, month + 1, 0).toISOString().split('T')[0];
    const startDate = (start_date as string) || firstDay;
    const endDate = (end_date as string) || lastDay;

    const isSalesperson = req.user?.role?.toLowerCase() === 'salesperson';

    // Salespersons only track and view their own performance; managers and admins see all
    const salespersons = isSalesperson
      ? await query(
          `SELECT id, full_name, email, phone, monthly_target
           FROM users WHERE id = $1 AND is_active = true`,
          [req.user!.id]
        )
      : await query(
          `SELECT id, full_name, email, phone, monthly_target
           FROM users WHERE role IN ('salesperson', 'manager') AND is_active = true
           ORDER BY full_name ASC`
        );

    // Get exact active target per salesperson (takes the latest defined target without summing or accumulating)
    const targets = await query(
      `SELECT DISTINCT ON (sales_person_id)
         sales_person_id, target_amount as total_target
       FROM sales_targets
       WHERE (
         (start_date <= $2 AND end_date >= $1)
         OR (year = EXTRACT(YEAR FROM $1::date) AND month = EXTRACT(MONTH FROM $1::date))
       ) ${isSalesperson ? `AND sales_person_id = ${req.user!.id}` : ''}
       ORDER BY sales_person_id, created_at DESC`,
      [startDate, endDate]
    );

    // Get actual achieved sales (approved/closed quotations created in this period, split-aware)
    const achievements = await query(
      `SELECT
          sp_id as sales_person_id,
          count(*) as quotations_count,
          COALESCE(SUM(credited_amount), 0) as total_achieved
       FROM (
         -- Primary salesperson achievements
         SELECT
           q.sales_person_id as sp_id,
           q.id as quotation_id,
           CASE
             WHEN q.assisted_sales_person_id IS NOT NULL AND q.primary_sales_share_amount > 0 THEN q.primary_sales_share_amount
             WHEN q.assisted_sales_person_id IS NOT NULL AND q.primary_sales_share_percent > 0 THEN ROUND((q.net_total * q.primary_sales_share_percent / 100.0)::numeric, 2)
             ELSE q.net_total
           END as credited_amount
         FROM quotations q
         WHERE q.quotation_date >= $1 AND q.quotation_date <= $2
           AND LOWER(q.status) IN ('approved', 'closed')

         UNION ALL

         -- Assisted salesperson achievements
         SELECT
           q.assisted_sales_person_id as sp_id,
           q.id as quotation_id,
           CASE
             WHEN q.assisted_sales_share_amount > 0 THEN q.assisted_sales_share_amount
             WHEN q.assisted_sales_share_percent > 0 THEN ROUND((q.net_total * q.assisted_sales_share_percent / 100.0)::numeric, 2)
             ELSE 0
           END as credited_amount
         FROM quotations q
         WHERE q.quotation_date >= $1 AND q.quotation_date <= $2
           AND LOWER(q.status) IN ('approved', 'closed')
           AND q.assisted_sales_person_id IS NOT NULL
       ) combined_sales
       ${isSalesperson ? `WHERE sp_id = ${req.user!.id}` : ''}
       GROUP BY sp_id`,
      [startDate, endDate]
    );

    // Get pipeline quotes (draft & in_review quotations created in this period, split-aware)
    const pipelineQuotes = await query(
      `SELECT
          sp_id as sales_person_id,
          count(*) as pipeline_count,
          COALESCE(SUM(credited_amount), 0) as total_pipeline
       FROM (
         SELECT
           q.sales_person_id as sp_id,
           q.id as quotation_id,
           CASE
             WHEN q.assisted_sales_person_id IS NOT NULL AND q.primary_sales_share_amount > 0 THEN q.primary_sales_share_amount
             WHEN q.assisted_sales_person_id IS NOT NULL AND q.primary_sales_share_percent > 0 THEN ROUND((q.net_total * q.primary_sales_share_percent / 100.0)::numeric, 2)
             ELSE q.net_total
           END as credited_amount
         FROM quotations q
         WHERE q.quotation_date >= $1 AND q.quotation_date <= $2
           AND LOWER(q.status) IN ('draft', 'in_review')

         UNION ALL

         SELECT
           q.assisted_sales_person_id as sp_id,
           q.id as quotation_id,
           CASE
             WHEN q.assisted_sales_share_amount > 0 THEN q.assisted_sales_share_amount
             WHEN q.assisted_sales_share_percent > 0 THEN ROUND((q.net_total * q.assisted_sales_share_percent / 100.0)::numeric, 2)
             ELSE 0
           END as credited_amount
         FROM quotations q
         WHERE q.quotation_date >= $1 AND q.quotation_date <= $2
           AND LOWER(q.status) IN ('draft', 'in_review')
           AND q.assisted_sales_person_id IS NOT NULL
       ) combined_pipeline
       ${isSalesperson ? `WHERE sp_id = ${req.user!.id}` : ''}
       GROUP BY sp_id`,
      [startDate, endDate]
    );

    // Get payments collected in this period by salesperson's quotations (split-aware)
    const collections = await query(
      `SELECT
         sp_id as sales_person_id,
         COALESCE(SUM(credited_paid), 0) as total_collected
       FROM (
         SELECT
           q.sales_person_id as sp_id,
           CASE
             WHEN q.assisted_sales_person_id IS NOT NULL AND q.primary_sales_share_percent > 0 THEN ROUND((p.amount * q.primary_sales_share_percent / 100.0)::numeric, 2)
             WHEN q.assisted_sales_person_id IS NOT NULL AND q.net_total > 0 THEN ROUND((p.amount * (q.primary_sales_share_amount / q.net_total))::numeric, 2)
             ELSE p.amount
           END as credited_paid
         FROM payments p
         JOIN quotations q ON q.id = p.quotation_id
         WHERE p.payment_date >= $1 AND p.payment_date <= $2
           AND p.status = 'Cleared'

         UNION ALL

         SELECT
           q.assisted_sales_person_id as sp_id,
           CASE
             WHEN q.assisted_sales_share_percent > 0 THEN ROUND((p.amount * q.assisted_sales_share_percent / 100.0)::numeric, 2)
             WHEN q.net_total > 0 THEN ROUND((p.amount * (q.assisted_sales_share_amount / q.net_total))::numeric, 2)
             ELSE 0
           END as credited_paid
         FROM payments p
         JOIN quotations q ON q.id = p.quotation_id
         WHERE p.payment_date >= $1 AND p.payment_date <= $2
           AND p.status = 'Cleared'
           AND q.assisted_sales_person_id IS NOT NULL
       ) combined_payments
       ${isSalesperson ? `WHERE sp_id = ${req.user!.id}` : ''}
       GROUP BY sp_id`,
      [startDate, endDate]
    );

    const targetMap = new Map(targets.map((t) => [t.sales_person_id, parseFloat(t.total_target)]));
    const achieveMap = new Map(achievements.map((a) => [a.sales_person_id, { count: parseInt(a.quotations_count, 10), amount: parseFloat(a.total_achieved) }]));
    const pipelineMap = new Map(pipelineQuotes.map((p) => [p.sales_person_id, { count: parseInt(p.pipeline_count, 10), amount: parseFloat(p.total_pipeline) }]));
    const collectMap = new Map(collections.map((c) => [c.sales_person_id, parseFloat(c.total_collected)]));

    const performance = salespersons.map((sp) => {
      const explicitTarget = targetMap.get(sp.id) || 0;
      const target = explicitTarget > 0 ? explicitTarget : parseFloat(sp.monthly_target) || 0;
      const achieveData = achieveMap.get(sp.id) || { count: 0, amount: 0 };
      const pipelineData = pipelineMap.get(sp.id) || { count: 0, amount: 0 };
      const collected = collectMap.get(sp.id) || 0;
      const percentage = target > 0 ? parseFloat(((achieveData.amount / target) * 100).toFixed(1)) : 0;
      const difference = parseFloat((achieveData.amount - target).toFixed(2));

      return {
        salesperson: sp,
        target,
        achieved: achieveData.amount,
        difference,
        quotationsCount: achieveData.count,
        pipelineAmount: pipelineData.amount,
        pipelineCount: pipelineData.count,
        totalQuotedWithPipeline: parseFloat((achieveData.amount + pipelineData.amount).toFixed(2)),
        collected,
        percentage,
      };
    });

    res.json({
      period: { startDate, endDate },
      performance,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 4. Update Salesperson Monthly Target directly (Store Manager / Admin)
targetsRouter.put('/salesperson/:id', requireRole(['admin', 'manager']), async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    const { monthly_target } = req.body;

    if (monthly_target === undefined || isNaN(Number(monthly_target))) {
      res.status(400).json({ error: 'Valid monthly target amount is required' });
      return;
    }

    const rows = await query(
      `UPDATE users SET monthly_target = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id, full_name, monthly_target`,
      [parseFloat(monthly_target), id]
    );

    if (rows.length === 0) {
      res.status(404).json({ error: 'Salesperson not found' });
      return;
    }

    // Keep sales_targets active record synchronized
    await query(
      `UPDATE sales_targets SET target_amount = $1, updated_at = CURRENT_TIMESTAMP WHERE sales_person_id = $2`,
      [parseFloat(monthly_target), id]
    );

    await recordAuditLog({
      userId: req.user!.id,
      username: req.user!.username,
      action: 'SALESPERSON_TARGET_UPDATED',
      entityType: 'user',
      entityId: id,
      details: { monthly_target: parseFloat(monthly_target), salesperson_name: rows[0].full_name },
      ipAddress: req.ip,
    });

    broadcast({ type: 'TARGET_UPDATED', payload: { sales_person_id: id } });

    res.json({ user: rows[0] });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 5. Update Target Record (Store Manager / Admin)
targetsRouter.put('/:id', requireRole(['admin', 'manager']), async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    const { target_type, start_date, end_date, target_amount, notes, period_label } = req.body;

    const rows = await query(
      `UPDATE sales_targets
       SET target_type = COALESCE($1, target_type),
           start_date = COALESCE($2, start_date),
           end_date = COALESCE($3, end_date),
           target_amount = COALESCE($4, target_amount),
           notes = COALESCE($5, notes),
           period_label = COALESCE($6, period_label),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $7
       RETURNING *`,
      [
        target_type,
        start_date,
        end_date,
        target_amount !== undefined ? parseFloat(target_amount) : null,
        notes,
        period_label,
        id,
      ]
    );

    if (rows.length === 0) {
      res.status(404).json({ error: 'Target record not found' });
      return;
    }

    if (target_amount !== undefined) {
      await query(
        `UPDATE users SET monthly_target = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
        [parseFloat(target_amount), rows[0].sales_person_id]
      );
    }

    await recordAuditLog({
      userId: req.user!.id,
      username: req.user!.username,
      action: 'TARGET_RECORD_UPDATED',
      entityType: 'sales_target',
      entityId: id,
      details: { target_amount, period_label },
      ipAddress: req.ip,
    });

    broadcast({ type: 'TARGET_UPDATED', payload: { sales_person_id: rows[0].sales_person_id } });

    res.json({ target: rows[0] });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 6. Delete Target Record (Store Manager / Admin)
targetsRouter.delete('/:id', requireRole(['admin', 'manager']), async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    const rows = await query(`DELETE FROM sales_targets WHERE id = $1 RETURNING *`, [id]);

    if (rows.length === 0) {
      res.status(404).json({ error: 'Target record not found' });
      return;
    }

    await recordAuditLog({
      userId: req.user!.id,
      username: req.user!.username,
      action: 'TARGET_DELETED',
      entityType: 'sales_target',
      entityId: id,
      details: { target: rows[0] },
      ipAddress: req.ip,
    });

    broadcast({ type: 'TARGET_UPDATED', payload: { sales_person_id: rows[0].sales_person_id } });

    res.json({ message: 'Target removed successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
