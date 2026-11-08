import { Router, Request, Response } from 'express';
import { query } from '../db/connection';
import { authenticateToken, requireRole } from '../middleware/auth';
import { recordAuditLog } from '../utils/audit';
import { broadcast } from '../ws';

export const targetsRouter = Router();

targetsRouter.use(authenticateToken);

const VALID_CATEGORIES = ['RETAIL', 'PROJECT', 'MANAGEMENT', 'COMPANY'];
const VALID_PERIOD_TYPES = ['MONTHLY', 'QUARTERLY', 'YEARLY'];

// 1. List targets (Supports Group-Level and Individual targets)
targetsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const { salesperson_id, target_type, period_type, category, target_level, year, month } = req.query;

    let sql = `
      SELECT t.*,
             COALESCE(t.category, 'RETAIL') as category,
             COALESCE(t.period_type, 'MONTHLY') as period_type,
             COALESCE(t.target_volume_sqft, 0) as target_volume_sqft,
             u.full_name as sales_person_name,
             u.role as sales_person_role,
             u.sales_category as user_sales_category
      FROM sales_targets t
      LEFT JOIN users u ON u.id = t.sales_person_id
      WHERE 1=1
    `;
    const params: any[] = [];
    let idx = 1;

    // Scoping: Salespersons can only view their own targets plus their category group target
    if (req.user?.role?.toLowerCase() === 'salesperson') {
      const userCat = req.user.sales_category || 'RETAIL';
      sql += ` AND (t.sales_person_id = $${idx} OR (t.sales_person_id IS NULL AND t.category = $${idx + 1}))`;
      params.push(req.user.id, userCat);
      idx += 2;
    } else {
      if (salesperson_id) {
        if (salesperson_id === 'null' || salesperson_id === 'group') {
          sql += ` AND t.sales_person_id IS NULL`;
        } else {
          sql += ` AND t.sales_person_id = $${idx++}`;
          params.push(salesperson_id);
        }
      }
      if (target_level === 'group') {
        sql += ` AND t.sales_person_id IS NULL`;
      } else if (target_level === 'staff') {
        sql += ` AND t.sales_person_id IS NOT NULL`;
      }
    }

    if (category && category !== 'ALL') {
      const catClean = String(category).toUpperCase();
      if (VALID_CATEGORIES.includes(catClean)) {
        sql += ` AND t.category = $${idx++}`;
        params.push(catClean);
      }
    }

    if (period_type) {
      const ptClean = String(period_type).toUpperCase();
      sql += ` AND (t.period_type = $${idx} OR t.target_type = $${idx})`;
      params.push(ptClean);
      idx++;
    }

    if (target_type) {
      sql += ` AND t.target_type = $${idx++}`;
      params.push(target_type);
    }
    if (year) {
      sql += ` AND t.year = $${idx++}`;
      params.push(parseInt(String(year), 10));
    }
    if (month) {
      sql += ` AND t.month = $${idx++}`;
      params.push(parseInt(String(month), 10));
    }

    sql += ' ORDER BY t.start_date DESC, t.category ASC, t.sales_person_id NULLS FIRST';
    const rows = await query(sql, params);
    res.json({ targets: rows });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 2. Set / Update Target (Manager / Admin) - Handles Group Targets and Staff Targets
targetsRouter.post('/', requireRole(['admin', 'manager']), async (req: Request, res: Response) => {
  try {
    const {
      sales_person_id,
      category,
      target_type = 'Monthly',
      period_type = 'MONTHLY',
      start_date,
      end_date,
      target_amount,
      target_volume_sqft = 0,
      notes,
      period_label,
    } = req.body;

    if (target_amount === undefined || isNaN(Number(target_amount)) || Number(target_amount) < 0) {
      res.status(400).json({ error: 'A valid non-negative target amount is required' });
      return;
    }

    const assignedCategory = String(category || 'RETAIL').toUpperCase();
    if (!VALID_CATEGORIES.includes(assignedCategory)) {
      res.status(400).json({ error: `Invalid category. Allowed: ${VALID_CATEGORIES.join(', ')}` });
      return;
    }

    const finalPeriodType = String(period_type || 'MONTHLY').toUpperCase();
    const parsedAmount = parseFloat(target_amount);
    const parsedVolume = parseFloat(target_volume_sqft) || 0;
    const finalSpId = sales_person_id ? parseInt(String(sales_person_id), 10) : null;

    // Date calculations
    const now = new Date();
    let finalStartDate = start_date;
    let finalEndDate = end_date;
    const startObj = start_date ? new Date(start_date) : now;
    const year = startObj.getFullYear();
    const month = startObj.getMonth() + 1;

    if (!finalStartDate || !finalEndDate) {
      if (finalPeriodType === 'MONTHLY' || target_type === 'Monthly') {
        finalStartDate = new Date(year, month - 1, 1).toISOString().split('T')[0];
        finalEndDate = new Date(year, month, 0).toISOString().split('T')[0];
      } else if (finalPeriodType === 'QUARTERLY') {
        const qMonth = Math.floor((month - 1) / 3) * 3;
        finalStartDate = new Date(year, qMonth, 1).toISOString().split('T')[0];
        finalEndDate = new Date(year, qMonth + 3, 0).toISOString().split('T')[0];
      } else if (finalPeriodType === 'YEARLY') {
        finalStartDate = `${year}-01-01`;
        finalEndDate = `${year}-12-31`;
      }
    }

    const label =
      period_label ||
      (finalSpId
        ? `${assignedCategory} Staff Target (${finalStartDate} to ${finalEndDate})`
        : `${assignedCategory} Group Target (${finalStartDate} to ${finalEndDate})`);

    // Check if an existing target exists for this category/staff/period
    let existing: any[];
    if (finalSpId) {
      existing = await query(
        `SELECT id FROM sales_targets
         WHERE sales_person_id = $1
           AND category = $2
           AND period_type = $3
           AND start_date = $4
         ORDER BY created_at DESC`,
        [finalSpId, assignedCategory, finalPeriodType, finalStartDate]
      );
    } else {
      existing = await query(
        `SELECT id FROM sales_targets
         WHERE sales_person_id IS NULL
           AND category = $1
           AND period_type = $2
           AND start_date = $3
         ORDER BY created_at DESC`,
        [assignedCategory, finalPeriodType, finalStartDate]
      );
    }

    let targetRow: any;
    if (existing.length > 0) {
      const primaryId = existing[0].id;
      const updated = await query(
        `UPDATE sales_targets
         SET category = $1,
             target_type = $2,
             period_type = $3,
             start_date = $4,
             end_date = $5,
             year = $6,
             month = $7,
             period_label = $8,
             target_amount = $9,
             target_volume_sqft = $10,
             notes = $11,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $12
         RETURNING *`,
        [
          assignedCategory,
          target_type,
          finalPeriodType,
          finalStartDate,
          finalEndDate,
          year,
          month,
          label,
          parsedAmount,
          parsedVolume,
          notes || '',
          primaryId,
        ]
      );
      targetRow = updated[0];

      if (existing.length > 1) {
        const extraIds = existing.slice(1).map((r: any) => r.id);
        await query(`DELETE FROM sales_targets WHERE id = ANY($1::int[])`, [extraIds]);
      }
    } else {
      const inserted = await query(
        `INSERT INTO sales_targets (
          sales_person_id, category, target_type, period_type, start_date, end_date,
          year, month, period_label, target_amount, target_volume_sqft, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *`,
        [
          finalSpId,
          assignedCategory,
          target_type,
          finalPeriodType,
          finalStartDate,
          finalEndDate,
          year,
          month,
          label,
          parsedAmount,
          parsedVolume,
          notes || '',
        ]
      );
      targetRow = inserted[0];
    }

    // If individual staff target, keep users.monthly_target updated as well
    if (finalSpId) {
      await query(
        `UPDATE users
         SET monthly_target = $1, sales_category = $2, updated_at = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [parsedAmount, assignedCategory, finalSpId]
      );
    }

    await recordAuditLog({
      userId: req.user!.id,
      username: req.user!.username,
      action: finalSpId ? 'STAFF_TARGET_UPDATED' : 'GROUP_TARGET_UPDATED',
      entityType: 'sales_target',
      entityId: targetRow.id,
      details: {
        category: assignedCategory,
        sales_person_id: finalSpId,
        period_type: finalPeriodType,
        target_amount: parsedAmount,
        target_volume_sqft: parsedVolume,
      },
      ipAddress: req.ip,
    });

    broadcast({
      type: 'TARGET_UPDATED',
      payload: {
        id: targetRow.id,
        category: assignedCategory,
        sales_person_id: finalSpId,
        target_amount: parsedAmount,
      },
    });

    res.status(200).json({ success: true, target: targetRow });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 3. Clone / Rollover Targets (Manager / Admin)
// Copies all group & individual targets from one month/period into another
targetsRouter.post('/clone', requireRole(['admin', 'manager']), async (req: Request, res: Response) => {
  try {
    const {
      source_year,
      source_month,
      target_year,
      target_month,
      period_type = 'MONTHLY',
      adjustment_percent = 0,
    } = req.body;

    if (!source_year || !source_month || !target_year || !target_month) {
      res.status(400).json({ error: 'source_year, source_month, target_year, and target_month are required' });
      return;
    }

    const sYear = parseInt(String(source_year), 10);
    const sMonth = parseInt(String(source_month), 10);
    const tYear = parseInt(String(target_year), 10);
    const tMonth = parseInt(String(target_month), 10);
    const pct = parseFloat(String(adjustment_percent)) || 0;
    const multiplier = 1 + pct / 100.0;

    const targetStartDate = new Date(tYear, tMonth - 1, 1).toISOString().split('T')[0];
    const targetEndDate = new Date(tYear, tMonth, 0).toISOString().split('T')[0];

    // Find source targets
    const sourceRows = await query(
      `SELECT * FROM sales_targets
       WHERE year = $1 AND month = $2 AND period_type = $3`,
      [sYear, sMonth, period_type]
    );

    if (sourceRows.length === 0) {
      res.status(404).json({ error: `No targets found for source period ${sMonth}/${sYear} to rollover.` });
      return;
    }

    let clonedCount = 0;
    for (const st of sourceRows) {
      const newAmount = Math.max(0, parseFloat((parseFloat(st.target_amount) * multiplier).toFixed(2)));
      const newVolume = Math.max(0, parseFloat((parseFloat(st.target_volume_sqft || 0) * multiplier).toFixed(2)));
      const newLabel = st.sales_person_id
        ? `${st.category} Staff Target (${targetStartDate} to ${targetEndDate})`
        : `${st.category} Group Target (${targetStartDate} to ${targetEndDate})`;

      // Upsert into target period
      if (st.sales_person_id) {
        await query(
          `INSERT INTO sales_targets (
            sales_person_id, category, target_type, period_type, start_date, end_date,
            year, month, period_label, target_amount, target_volume_sqft, notes
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          ON CONFLICT DO NOTHING`,
          [
            st.sales_person_id,
            st.category,
            st.target_type,
            period_type,
            targetStartDate,
            targetEndDate,
            tYear,
            tMonth,
            newLabel,
            newAmount,
            newVolume,
            `Rolled over from ${sMonth}/${sYear}${pct !== 0 ? ` with ${pct}% adjustment` : ''}`,
          ]
        );
      } else {
        await query(
          `INSERT INTO sales_targets (
            sales_person_id, category, target_type, period_type, start_date, end_date,
            year, month, period_label, target_amount, target_volume_sqft, notes
          ) VALUES (NULL, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          ON CONFLICT DO NOTHING`,
          [
            st.category,
            st.target_type,
            period_type,
            targetStartDate,
            targetEndDate,
            tYear,
            tMonth,
            newLabel,
            newAmount,
            newVolume,
            `Group rollover from ${sMonth}/${sYear}${pct !== 0 ? ` with ${pct}% adjustment` : ''}`,
          ]
        );
      }
      clonedCount++;
    }

    await recordAuditLog({
      userId: req.user!.id,
      username: req.user!.username,
      action: 'TARGETS_ROLLED_OVER',
      entityType: 'sales_target',
      entityId: 0,
      details: {
        from: `${sMonth}/${sYear}`,
        to: `${tMonth}/${tYear}`,
        clonedCount,
        adjustment_percent: pct,
      },
      ipAddress: req.ip,
    });

    broadcast({ type: 'TARGET_UPDATED', payload: { action: 'rollover', year: tYear, month: tMonth } });

    res.json({
      success: true,
      message: `Successfully rolled over ${clonedCount} targets to ${tMonth}/${tYear}`,
      clonedCount,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 4. Visual Target vs. Achievement Tracker Aggregator
// Returns aggregated metrics for the 4 categories with color thresholds, run-rate velocity, and staff drilldown
targetsRouter.get('/progress', async (req: Request, res: Response) => {
  try {
    const now = new Date();
    const reqYear = req.query.year ? parseInt(String(req.query.year), 10) : now.getFullYear();
    const reqMonth = req.query.month ? parseInt(String(req.query.month), 10) : now.getMonth() + 1;
    const periodType = String(req.query.period_type || 'MONTHLY').toUpperCase();

    let startDate: string;
    let endDate: string;
    let totalDays: number;
    let daysElapsed: number;

    if (periodType === 'MONTHLY') {
      const firstD = new Date(reqYear, reqMonth - 1, 1);
      const lastD = new Date(reqYear, reqMonth, 0);
      startDate = firstD.toISOString().split('T')[0];
      endDate = lastD.toISOString().split('T')[0];
      totalDays = lastD.getDate();

      if (now.getFullYear() === reqYear && now.getMonth() + 1 === reqMonth) {
        daysElapsed = Math.max(1, now.getDate());
      } else if (now > lastD) {
        daysElapsed = totalDays;
      } else {
        daysElapsed = 1;
      }
    } else if (periodType === 'QUARTERLY') {
      const qIndex = Math.floor((reqMonth - 1) / 3);
      const qStart = new Date(reqYear, qIndex * 3, 1);
      const qEnd = new Date(reqYear, (qIndex + 1) * 3, 0);
      startDate = qStart.toISOString().split('T')[0];
      endDate = qEnd.toISOString().split('T')[0];
      totalDays = Math.ceil((qEnd.getTime() - qStart.getTime()) / (1000 * 60 * 60 * 24));
      daysElapsed = now > qEnd ? totalDays : Math.max(1, Math.ceil((now.getTime() - qStart.getTime()) / (1000 * 60 * 60 * 24)));
    } else {
      startDate = `${reqYear}-01-01`;
      endDate = `${reqYear}-12-31`;
      totalDays = 365;
      const startOfYear = new Date(reqYear, 0, 1);
      daysElapsed = now.getFullYear() > reqYear ? 365 : Math.max(1, Math.ceil((now.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24)));
    }

    // 1. Fetch group-level and staff targets for this period
    const targetRows = await query(
      `SELECT t.*,
              COALESCE(t.category, 'RETAIL') as category,
              COALESCE(t.target_volume_sqft, 0) as target_volume_sqft,
              u.full_name as staff_name,
              u.role as staff_role
       FROM sales_targets t
       LEFT JOIN users u ON u.id = t.sales_person_id
       WHERE (t.start_date <= $2 AND t.end_date >= $1)
          OR (t.year = $3 AND t.month = $4)
       ORDER BY t.category ASC, t.sales_person_id NULLS FIRST`,
      [startDate, endDate, reqYear, reqMonth]
    );

    // 2. Fetch all active staff categorized
    const allStaff = await query(
      `SELECT id, full_name, email, phone, role,
              COALESCE(sales_category, 'RETAIL') as sales_category,
              COALESCE(monthly_target, 0) as default_monthly_target
       FROM users
       WHERE is_active = true
       ORDER BY full_name ASC`
    );

    // 3. Fetch closed quotations aggregated by sales_category and sales_person_id
    const closedQuotes = await query(
      `SELECT
          COALESCE(q.sales_category, 'RETAIL') as sales_category,
          q.sales_person_id,
          q.sales_person_name,
          q.id as quotation_id,
          q.net_total,
          COALESCE(qi.sqft_volume, 0) as sqft_volume
       FROM quotations q
       LEFT JOIN (
         SELECT quotation_id, SUM(quantity_sqft) as sqft_volume
         FROM quotation_items
         GROUP BY quotation_id
       ) qi ON qi.quotation_id = q.id
       WHERE q.status = 'closed'
         AND q.quotation_date >= $1 AND q.quotation_date <= $2`,
      [startDate, endDate]
    );

    // Build categories payload
    const categoriesData = VALID_CATEGORIES.map((catKey) => {
      // Find Group Target row
      const groupTargetRow = targetRows.find((r) => r.category === catKey && r.sales_person_id === null);

      // Staff under this category
      const staffInCat = allStaff.filter((u) => (u.sales_category || 'RETAIL') === catKey);

      // Staff specific targets
      const staffTargetRows = targetRows.filter((r) => r.category === catKey && r.sales_person_id !== null);

      // Sum of individual targets
      let sumStaffTargets = 0;
      let sumStaffVolume = 0;
      for (const st of staffTargetRows) {
        sumStaffTargets += parseFloat(st.target_amount || 0);
        sumStaffVolume += parseFloat(st.target_volume_sqft || 0);
      }

      // If group target row exists, use it; otherwise fallback to sum of staff targets
      let allocatedTarget = groupTargetRow ? parseFloat(groupTargetRow.target_amount || 0) : sumStaffTargets;
      let allocatedVolume = groupTargetRow ? parseFloat(groupTargetRow.target_volume_sqft || 0) : sumStaffVolume;

      // Achieved closed quotes in this category
      const categoryClosed = closedQuotes.filter((q) => q.sales_category === catKey);
      let achievedRevenue = 0;
      let achievedSqft = 0;
      for (const cq of categoryClosed) {
        achievedRevenue += parseFloat(cq.net_total || 0);
        achievedSqft += parseFloat(cq.sqft_volume || 0);
      }

      achievedRevenue = parseFloat(achievedRevenue.toFixed(2));
      achievedSqft = parseFloat(achievedSqft.toFixed(2));

      const shortfallOrSurplus = parseFloat((achievedRevenue - allocatedTarget).toFixed(2));
      const achievementPct = allocatedTarget > 0 ? parseFloat(((achievedRevenue / allocatedTarget) * 100).toFixed(1)) : 0;

      // Color coding thresholds: Red <50%, Amber 50-79%, Green 80-100%, Purple >100%
      let statusColor = 'red';
      if (achievementPct >= 100) statusColor = 'purple';
      else if (achievementPct >= 80) statusColor = 'green';
      else if (achievementPct >= 50) statusColor = 'amber';

      // Projected Run-Rate: (Achieved / daysElapsed) * totalDays
      const dailyRunRate = daysElapsed > 0 ? achievedRevenue / daysElapsed : 0;
      const projectedMonthEnd = parseFloat((dailyRunRate * totalDays).toFixed(2));
      const projectedPct = allocatedTarget > 0 ? parseFloat(((projectedMonthEnd / allocatedTarget) * 100).toFixed(1)) : 0;

      // Staff Contributors Drilldown
      const contributors = staffInCat.map((staffMember) => {
        const staffTargetRow = staffTargetRows.find((r) => r.sales_person_id === staffMember.id);
        const staffTargetAmt = staffTargetRow
          ? parseFloat(staffTargetRow.target_amount)
          : parseFloat(staffMember.default_monthly_target) || 0;
        const staffVolumeTarget = staffTargetRow ? parseFloat(staffTargetRow.target_volume_sqft) || 0 : 0;

        const staffQuotes = categoryClosed.filter((q) => q.sales_person_id === staffMember.id);
        let staffAchievedAmt = 0;
        let staffAchievedSqft = 0;
        for (const sq of staffQuotes) {
          staffAchievedAmt += parseFloat(sq.net_total || 0);
          staffAchievedSqft += parseFloat(sq.sqft_volume || 0);
        }

        const staffPct = staffTargetAmt > 0 ? parseFloat(((staffAchievedAmt / staffTargetAmt) * 100).toFixed(1)) : 0;

        return {
          id: staffMember.id,
          name: staffMember.full_name,
          role: staffMember.role,
          target_amount: staffTargetAmt,
          target_volume_sqft: staffVolumeTarget,
          achieved_amount: parseFloat(staffAchievedAmt.toFixed(2)),
          achieved_sqft: parseFloat(staffAchievedSqft.toFixed(2)),
          closed_quotes_count: staffQuotes.length,
          achievement_pct: staffPct,
          shortfall_or_surplus: parseFloat((staffAchievedAmt - staffTargetAmt).toFixed(2)),
        };
      });

      return {
        category: catKey,
        group_target_id: groupTargetRow?.id || null,
        allocated_target: allocatedTarget,
        allocated_volume_sqft: allocatedVolume,
        achieved_revenue: achievedRevenue,
        achieved_sqft: achievedSqft,
        closed_quotes_count: categoryClosed.length,
        shortfall_or_surplus: shortfallOrSurplus,
        achievement_pct: achievementPct,
        status_color: statusColor,
        projected_month_end: projectedMonthEnd,
        projected_pct: projectedPct,
        staff_count: staffInCat.length,
        contributors,
      };
    });

    // Grand totals across all categories
    let grandAllocated = 0;
    let grandAchieved = 0;
    let grandClosedCount = 0;
    for (const c of categoriesData) {
      grandAllocated += c.allocated_target;
      grandAchieved += c.achieved_revenue;
      grandClosedCount += c.closed_quotes_count;
    }
    const grandPct = grandAllocated > 0 ? parseFloat(((grandAchieved / grandAllocated) * 100).toFixed(1)) : 0;

    res.json({
      period: {
        startDate,
        endDate,
        year: reqYear,
        month: reqMonth,
        period_type: periodType,
        total_days: totalDays,
        days_elapsed: daysElapsed,
      },
      summary: {
        total_allocated_target: parseFloat(grandAllocated.toFixed(2)),
        total_achieved_revenue: parseFloat(grandAchieved.toFixed(2)),
        total_closed_quotes: grandClosedCount,
        grand_achievement_pct: grandPct,
      },
      categories: categoriesData,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 5. Salesperson Performance Analytics (Legacy & Detailed)
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

    const salespersons = isSalesperson
      ? await query(
          `SELECT id, full_name, email, phone, monthly_target, sales_category
           FROM users WHERE id = $1 AND is_active = true`,
          [req.user!.id]
        )
      : await query(
          `SELECT id, full_name, email, phone, monthly_target, sales_category
           FROM users WHERE role IN ('salesperson', 'manager') AND is_active = true
           ORDER BY full_name ASC`
        );

    const targets = await query(
      `SELECT DISTINCT ON (sales_person_id)
         sales_person_id, target_amount as total_target
       FROM sales_targets
       WHERE sales_person_id IS NOT NULL AND (
         (start_date <= $2 AND end_date >= $1)
         OR (year = EXTRACT(YEAR FROM $1::date) AND month = EXTRACT(MONTH FROM $1::date))
       ) ${isSalesperson ? `AND sales_person_id = ${req.user!.id}` : ''}
       ORDER BY sales_person_id, created_at DESC`,
      [startDate, endDate]
    );

    const achievements = await query(
      `SELECT
          sp_id as sales_person_id,
          count(*) as quotations_count,
          COALESCE(SUM(credited_amount), 0) as total_achieved
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
           AND LOWER(q.status) IN ('approved', 'closed')

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
           AND LOWER(q.status) IN ('approved', 'closed')
           AND q.assisted_sales_person_id IS NOT NULL
       ) combined_sales
       ${isSalesperson ? `WHERE sp_id = ${req.user!.id}` : ''}
       GROUP BY sp_id`,
      [startDate, endDate]
    );

    const targetMap = new Map(targets.map((t) => [t.sales_person_id, parseFloat(t.total_target)]));
    const achieveMap = new Map(achievements.map((a) => [a.sales_person_id, { count: parseInt(a.quotations_count, 10), amount: parseFloat(a.total_achieved) }]));

    const performance = salespersons.map((sp) => {
      const explicitTarget = targetMap.get(sp.id) || 0;
      const target = explicitTarget > 0 ? explicitTarget : parseFloat(sp.monthly_target) || 0;
      const achieveData = achieveMap.get(sp.id) || { count: 0, amount: 0 };
      const percentage = target > 0 ? parseFloat(((achieveData.amount / target) * 100).toFixed(1)) : 0;
      const difference = parseFloat((achieveData.amount - target).toFixed(2));

      return {
        salesperson: sp,
        target,
        achieved: achieveData.amount,
        difference,
        quotationsCount: achieveData.count,
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

    broadcast({ type: 'TARGET_UPDATED', payload: { id, category: rows[0].category } });

    res.json({ success: true, message: 'Target removed successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
