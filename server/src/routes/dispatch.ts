import { Router, Request, Response } from 'express';
import { query, withTransaction } from '../db/connection';
import { authenticateToken, requireRole } from '../middleware/auth';
import { recordAuditLog } from '../utils/audit';
import { broadcast } from '../ws';

export const dispatchRouter = Router();

// Protect all dispatch routes
dispatchRouter.use(authenticateToken);

let schemaEnsured = false;
export async function ensureDispatchSchema(): Promise<void> {
  if (schemaEnsured) return;
  try {
    await query(`
      ALTER TABLE quotations ADD COLUMN IF NOT EXISTS dispatch_status VARCHAR(50) DEFAULT 'Yet to Update';
      ALTER TABLE quotations ADD COLUMN IF NOT EXISTS expected_dispatch_date DATE;
      ALTER TABLE quotations ADD COLUMN IF NOT EXISTS dispatch_notes TEXT;
      ALTER TABLE quotations ADD COLUMN IF NOT EXISTS dispatched_at TIMESTAMPTZ;
      ALTER TABLE quotations ADD COLUMN IF NOT EXISTS dispatched_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
      ALTER TABLE quotations ADD COLUMN IF NOT EXISTS dispatched_by_name VARCHAR(120);
      ALTER TABLE quotations ADD COLUMN IF NOT EXISTS has_dispatch_item_changes BOOLEAN DEFAULT FALSE;
      ALTER TABLE quotations ADD COLUMN IF NOT EXISTS dispatch_change_summary TEXT;
      ALTER TABLE quotations ADD COLUMN IF NOT EXISTS dispatch_change_acknowledged_at TIMESTAMPTZ;

      ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS dispatch_status VARCHAR(50) DEFAULT 'Yet to Update';
      ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS expected_dispatch_date DATE;
      ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS dispatch_notes TEXT;
      ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS dispatched_at TIMESTAMPTZ;
      ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS dispatched_quantity NUMERIC(12, 2) DEFAULT 0;
      ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS procurement_status VARCHAR(60) DEFAULT NULL;
      ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS procurement_notes TEXT DEFAULT NULL;
      ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS procurement_updated_at TIMESTAMPTZ DEFAULT NULL;
      ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS procurement_category VARCHAR(50) DEFAULT NULL;
      ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS procurement_updated_by_name VARCHAR(120) DEFAULT NULL;

      ALTER TABLE quotations ALTER COLUMN dispatch_status SET DEFAULT 'Yet to Update';
      ALTER TABLE quotation_items ALTER COLUMN dispatch_status SET DEFAULT 'Yet to Update';
      UPDATE quotations SET dispatch_status = 'Yet to Update' WHERE dispatch_status IS NULL;
      UPDATE quotation_items SET dispatch_status = 'Yet to Update' WHERE dispatch_status IS NULL;

      -- Mark initial procurement category for existing items
      UPDATE quotation_items
      SET procurement_category = 'local'
      WHERE dispatch_status = 'Need to Arrange from Local' AND procurement_category IS NULL;

      UPDATE quotation_items
      SET procurement_category = 'factory'
      WHERE dispatch_status = 'Factory Order' AND procurement_category IS NULL;

      -- Sync quotation dispatch_status from items whenever items have updated stock availability
      UPDATE quotations q
      SET dispatch_status = sub.computed_status
      FROM (
        SELECT 
          quotation_id,
          CASE
            WHEN count(*) > 0 AND count(CASE WHEN dispatch_status = 'Dispatched' THEN 1 END) = count(*) THEN 'Dispatched'
            WHEN count(CASE WHEN dispatch_status = 'Factory Order' THEN 1 END) > 0 THEN 'Factory Order'
            WHEN count(CASE WHEN dispatch_status = 'Need to Arrange from Local' THEN 1 END) > 0 THEN 'Need to Arrange from Local'
            WHEN count(CASE WHEN dispatch_status = 'Ready Stock' THEN 1 END) > 0 THEN 'Ready Stock'
            ELSE 'Yet to Update'
          END as computed_status
        FROM quotation_items
        GROUP BY quotation_id
      ) sub
      WHERE q.id = sub.quotation_id
        AND COALESCE(q.dispatch_status, 'Yet to Update') != sub.computed_status;
    `);
    schemaEnsured = true;
  } catch (err: any) {
    console.warn('[Dispatch] Schema check notice:', err.message);
  }
}

export const VALID_DISPATCH_STATUSES = [
  'Yet to Update',
  'Ready Stock',
  'Need to Arrange from Local',
  'Factory Order',
  'Dispatched',
];

export const VALID_PROCUREMENT_STATUSES = [
  'Availability Confirmed',
  'Payment Done',
  'Dispatched',
  'On the Way',
  'Reached to Godown',
] as const;

export type ProcurementStatusType = (typeof VALID_PROCUREMENT_STATUSES)[number];

// Helper to normalize status strings
function normalizeStatus(st?: string): string {
  if (!st) return 'Yet to Update';
  const found = VALID_DISPATCH_STATUSES.find(
    (v) => v.toLowerCase() === st.trim().toLowerCase()
  );
  return found || 'Yet to Update';
}

// 1. Get Summary Stats for Dispatch Pipeline
dispatchRouter.get('/stats', async (req: Request, res: Response) => {
  try {
    await ensureDispatchSchema();

    const isSalesperson = req.user?.role?.toLowerCase() === 'salesperson';
    const userFilter = isSalesperson
      ? `AND (q.sales_person_id = $1 OR q.assisted_sales_person_id = $1)`
      : '';
    const userParams: any[] = isSalesperson ? [req.user!.id] : [];

    const ordersCountRes = await query(
      `SELECT 
         count(*) as total_orders,
         COUNT(CASE WHEN LOWER(q.status) = 'closed' THEN 1 END) as closed_count,
         COUNT(CASE WHEN LOWER(q.status) = 'approved' THEN 1 END) as approved_count,
         COUNT(CASE WHEN q.has_dispatch_item_changes = true THEN 1 END) as pending_item_changes_count
       FROM quotations q
       WHERE LOWER(q.status) IN ('closed', 'approved') ${userFilter}`,
      userParams
    );
    const countRow = ordersCountRes[0] || {};
    const totalOrders = parseInt(countRow.total_orders || '0', 10);
    const closedCount = parseInt(countRow.closed_count || '0', 10);
    const approvedCount = parseInt(countRow.approved_count || '0', 10);

    const userRole = (req.user?.role || '').toLowerCase();
    const canSeeModifiedItemsAlert = ['admin', 'manager', 'dispatch', 'dispatch_team', 'accounts', 'accountant'].includes(userRole);

    const pendingItemChangesCount = canSeeModifiedItemsAlert
      ? parseInt(countRow.pending_item_changes_count || '0', 10)
      : 0;

    const itemsStatsRes = await query(
      `SELECT 
        COUNT(qi.id) as total_items,
        COUNT(CASE WHEN COALESCE(qi.dispatch_status, 'Yet to Update') = 'Yet to Update' THEN 1 END) as yet_to_update_count,
        COUNT(CASE WHEN qi.dispatch_status = 'Ready Stock' THEN 1 END) as ready_stock_count,
        COUNT(CASE WHEN qi.dispatch_status = 'Need to Arrange from Local' THEN 1 END) as local_arrange_count,
        COUNT(CASE WHEN qi.dispatch_status = 'Factory Order' THEN 1 END) as factory_order_count,
        COUNT(CASE WHEN qi.dispatch_status = 'Dispatched' THEN 1 END) as dispatched_count,
        COUNT(CASE 
          WHEN qi.dispatch_status != 'Dispatched' 
          AND qi.expected_dispatch_date IS NOT NULL 
          AND qi.expected_dispatch_date < CURRENT_DATE 
          THEN 1 END) as overdue_count
      FROM quotation_items qi
      JOIN quotations q ON q.id = qi.quotation_id
      WHERE LOWER(q.status) IN ('closed', 'approved') ${userFilter}`,
      userParams
    );

    const stats = itemsStatsRes[0] || {};

    const todaysDispatchesRes = await query(
      `SELECT 
        q.id,
        q.quotation_number,
        q.quotation_date,
        q.quotation_type,
        q.status,
        q.customer_name,
        q.customer_phone,
        q.site_location,
        q.sales_person_name,
        COALESCE(q.dispatch_status, 'Yet to Update') as dispatch_status,
        q.expected_dispatch_date,
        COUNT(qi.id) as total_items,
        COUNT(CASE WHEN qi.dispatch_status = 'Dispatched' THEN 1 END) as dispatched_items_count
      FROM quotations q
      LEFT JOIN quotation_items qi ON qi.quotation_id = q.id
      WHERE LOWER(q.status) IN ('closed', 'approved')
        AND q.expected_dispatch_date = CURRENT_DATE
        AND COALESCE(q.dispatch_status, 'Yet to Update') != 'Dispatched'
        ${userFilter}
      GROUP BY q.id
      ORDER BY q.id DESC`,
      userParams
    );

    const tomorrowsDispatchesRes = await query(
      `SELECT 
        q.id,
        q.quotation_number,
        q.quotation_date,
        q.quotation_type,
        q.status,
        q.customer_name,
        q.customer_phone,
        q.site_location,
        q.sales_person_name,
        COALESCE(q.dispatch_status, 'Yet to Update') as dispatch_status,
        q.expected_dispatch_date,
        COUNT(qi.id) as total_items,
        COUNT(CASE WHEN qi.dispatch_status = 'Dispatched' THEN 1 END) as dispatched_items_count
      FROM quotations q
      LEFT JOIN quotation_items qi ON qi.quotation_id = q.id
      WHERE LOWER(q.status) IN ('closed', 'approved')
        AND q.expected_dispatch_date = CURRENT_DATE + INTERVAL '1 day'
        AND COALESCE(q.dispatch_status, 'Yet to Update') != 'Dispatched'
        ${userFilter}
      GROUP BY q.id
      ORDER BY q.id DESC`,
      userParams
    );

    const procurementStatsRes = await query(
      `SELECT 
        COUNT(CASE WHEN qi.dispatch_status IN ('Need to Arrange from Local', 'Factory Order') THEN 1 END) as total_procurement_items,
        COUNT(CASE WHEN qi.procurement_status = 'Availability Confirmed' THEN 1 END) as proc_avail_confirmed,
        COUNT(CASE WHEN qi.procurement_status = 'Payment Done' THEN 1 END) as proc_payment_done,
        COUNT(CASE WHEN qi.procurement_status = 'Dispatched' THEN 1 END) as proc_dispatched,
        COUNT(CASE WHEN qi.procurement_status = 'On the Way' THEN 1 END) as proc_on_the_way,
        COUNT(CASE WHEN qi.procurement_status = 'Reached to Godown' THEN 1 END) as proc_reached_godown
      FROM quotation_items qi
      JOIN quotations q ON q.id = qi.quotation_id
      WHERE LOWER(q.status) IN ('closed', 'approved') ${userFilter}`,
      userParams
    );
    const procStats = procurementStatsRes[0] || {};

    const changedQuotationsRes = canSeeModifiedItemsAlert
      ? await query(
          `SELECT 
            q.id,
            q.quotation_number,
            q.customer_name,
            q.customer_phone,
            q.site_location,
            q.sales_person_name,
            COALESCE(q.dispatch_status, 'Yet to Update') as dispatch_status,
            q.expected_dispatch_date,
            q.dispatch_change_summary,
            q.updated_at
          FROM quotations q
          WHERE LOWER(q.status) IN ('closed', 'approved')
            AND q.has_dispatch_item_changes = true
            ${userFilter}
          ORDER BY q.updated_at DESC`,
          userParams
        )
      : [];

    res.json({
      total_orders: totalOrders,
      total_closed_quotations: closedCount,
      approved_count: approvedCount,
      closed_count: closedCount,
      local_active_count: parseInt(stats.local_arrange_count || '0', 10),
      factory_active_count: parseInt(stats.factory_order_count || '0', 10),
      pending_item_changes_count: pendingItemChangesCount,
      changed_quotations: changedQuotationsRes.map((cq: any) => ({
        ...cq,
        change_summary_parsed: cq.dispatch_change_summary ? (() => {
          try { return JSON.parse(cq.dispatch_change_summary); } catch { return null; }
        })() : null,
      })),
      total_items: parseInt(stats.total_items || '0', 10),
      yet_to_update_count: parseInt(stats.yet_to_update_count || '0', 10),
      ready_stock_count: parseInt(stats.ready_stock_count || '0', 10),
      local_arrange_count: parseInt(stats.local_arrange_count || '0', 10),
      factory_order_count: parseInt(stats.factory_order_count || '0', 10),
      dispatched_count: parseInt(stats.dispatched_count || '0', 10),
      overdue_count: parseInt(stats.overdue_count || '0', 10),
      todays_dispatches: todaysDispatchesRes.map((r: any) => ({
        ...r,
        total_items: parseInt(r.total_items || '0', 10),
        dispatched_items_count: parseInt(r.dispatched_items_count || '0', 10),
      })),
      tomorrows_dispatches: tomorrowsDispatchesRes.map((r: any) => ({
        ...r,
        total_items: parseInt(r.total_items || '0', 10),
        dispatched_items_count: parseInt(r.dispatched_items_count || '0', 10),
      })),
      procurement_stats: {
        total_procurement_items: parseInt(procStats.total_procurement_items || '0', 10),
        avail_confirmed: parseInt(procStats.proc_avail_confirmed || '0', 10),
        payment_done: parseInt(procStats.proc_payment_done || '0', 10),
        supplier_dispatched: parseInt(procStats.proc_dispatched || '0', 10),
        on_the_way: parseInt(procStats.proc_on_the_way || '0', 10),
        reached_godown: parseInt(procStats.proc_reached_godown || '0', 10),
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 2. Get All Closed Quotations for Dispatch Management
dispatchRouter.get('/quotations', async (req: Request, res: Response) => {
  try {
    await ensureDispatchSchema();

    const { search, dispatch_status, filter_date, procurement_status } = req.query;

    const conditions: string[] = [];
    const params: any[] = [];
    let pIdx = 1;

    // Salespersons can only view quotations of their own customers
    const isSalesperson = req.user?.role?.toLowerCase() === 'salesperson';
    if (isSalesperson) {
      conditions.push(`(q.sales_person_id = $${pIdx} OR q.assisted_sales_person_id = $${pIdx})`);
      params.push(req.user!.id);
      pIdx++;
    }

    // Approved and Closed quotations are displayed and tracked in Dispatch Management
    conditions.push(`LOWER(q.status) IN ('closed', 'approved')`);

    if (search && typeof search === 'string' && search.trim()) {
      conditions.push(
        `(q.quotation_number ILIKE $${pIdx} OR q.customer_name ILIKE $${pIdx} OR q.customer_phone ILIKE $${pIdx} OR q.project_name ILIKE $${pIdx} OR q.site_location ILIKE $${pIdx})`
      );
      params.push(`%${search.trim()}%`);
      pIdx++;
    }

    if (dispatch_status && typeof dispatch_status === 'string' && dispatch_status !== 'all') {
      conditions.push(`COALESCE(q.dispatch_status, 'Yet to Update') = $${pIdx}`);
      params.push(normalizeStatus(dispatch_status));
      pIdx++;
    }

    if (filter_date === 'today') {
      conditions.push(`q.expected_dispatch_date = CURRENT_DATE`);
    } else if (filter_date === 'tomorrow') {
      conditions.push(`q.expected_dispatch_date = CURRENT_DATE + INTERVAL '1 day'`);
    } else if (filter_date === 'this_week') {
      conditions.push(
        `q.expected_dispatch_date >= CURRENT_DATE AND q.expected_dispatch_date <= CURRENT_DATE + INTERVAL '7 days'`
      );
    } else if (filter_date === 'overdue') {
      conditions.push(
        `q.expected_dispatch_date < CURRENT_DATE AND COALESCE(q.dispatch_status, 'Yet to Update') != 'Dispatched'`
      );
    }

    if (procurement_status && typeof procurement_status === 'string' && procurement_status !== 'all') {
      conditions.push(`EXISTS (
        SELECT 1 FROM quotation_items qi_p 
        WHERE qi_p.quotation_id = q.id 
          AND qi_p.procurement_status = $${pIdx}
      )`);
      params.push(procurement_status.trim());
      pIdx++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const sql = `
      SELECT 
        q.id,
        q.quotation_number,
        q.quotation_date,
        q.quotation_type,
        q.status,
        q.customer_id,
        q.customer_name,
        q.customer_phone,
        q.customer_gstin,
        q.delivery_address,
        q.site_location,
        q.project_name,
        q.sales_person_id,
        q.sales_person_name,
        q.assisted_sales_person_id,
        q.assisted_sales_person_name,
        q.approved_by_id,
        u_app.full_name as approved_by_name,
        q.approved_at,
        q.gross_total,
        q.net_total,
        q.version,
        q.updated_at,
        COALESCE(q.has_dispatch_item_changes, false) as has_dispatch_item_changes,
        q.dispatch_change_summary,
        q.dispatch_change_acknowledged_at,
        COALESCE(q.dispatch_status, 'Yet to Update') as dispatch_status,
        q.expected_dispatch_date,
        q.dispatch_notes,
        q.dispatched_at,
        q.dispatched_by_name,
        COUNT(qi.id) as total_items,
        COUNT(CASE WHEN qi.dispatch_status = 'Dispatched' THEN 1 END) as dispatched_items_count,
        COUNT(CASE WHEN COALESCE(qi.dispatch_status, 'Yet to Update') = 'Yet to Update' THEN 1 END) as yet_to_update_items_count,
        COUNT(CASE WHEN qi.dispatch_status = 'Ready Stock' THEN 1 END) as ready_stock_items_count,
        COUNT(CASE WHEN qi.dispatch_status = 'Need to Arrange from Local' THEN 1 END) as local_arrange_items_count,
        COUNT(CASE WHEN qi.dispatch_status = 'Factory Order' THEN 1 END) as factory_order_items_count,
        COUNT(CASE WHEN qi.dispatch_status IN ('Need to Arrange from Local', 'Factory Order') THEN 1 END) as total_procurement_items,
        COUNT(CASE WHEN qi.procurement_status = 'Reached to Godown' THEN 1 END) as proc_reached_godown_count,
        COUNT(CASE WHEN qi.procurement_status = 'On the Way' THEN 1 END) as proc_on_the_way_count
      FROM quotations q
      LEFT JOIN users u_app ON u_app.id = q.approved_by_id
      LEFT JOIN quotation_items qi ON qi.quotation_id = q.id
      ${whereClause}
      GROUP BY q.id, u_app.full_name
      ORDER BY 
        CASE WHEN q.has_dispatch_item_changes = true THEN 0 ELSE 1 END ASC,
        CASE WHEN q.expected_dispatch_date IS NULL THEN 1 ELSE 0 END ASC,
        q.expected_dispatch_date ASC,
        q.id DESC
    `;

    const rows = await query(sql, params);

    const quotations = rows.map((r: any) => ({
      ...r,
      total_items: parseInt(r.total_items || '0', 10),
      dispatched_items_count: parseInt(r.dispatched_items_count || '0', 10),
      yet_to_update_items_count: parseInt(r.yet_to_update_items_count || '0', 10),
      ready_stock_items_count: parseInt(r.ready_stock_items_count || '0', 10),
      local_arrange_items_count: parseInt(r.local_arrange_items_count || '0', 10),
      factory_order_items_count: parseInt(r.factory_order_items_count || '0', 10),
      total_procurement_items: parseInt(r.total_procurement_items || '0', 10),
      proc_reached_godown_count: parseInt(r.proc_reached_godown_count || '0', 10),
      proc_on_the_way_count: parseInt(r.proc_on_the_way_count || '0', 10),
    }));

    res.json({ quotations });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 3. Get Single Closed Quotation with Area & Item Details for Dispatch
dispatchRouter.get('/quotations/:id', async (req: Request, res: Response) => {
  try {
    await ensureDispatchSchema();

    const id = parseInt(req.params.id as string, 10);
    const qRows = await query(
      `SELECT q.*, u_app.full_name as approved_by_name
       FROM quotations q
       LEFT JOIN users u_app ON u_app.id = q.approved_by_id
       WHERE q.id = $1`,
      [id]
    );

    if (qRows.length === 0) {
      res.status(404).json({ error: 'Quotation not found' });
      return;
    }

    const quotation = qRows[0];
    if (!['closed', 'approved'].includes(quotation.status?.toLowerCase())) {
      res.status(400).json({
        error: `Quotation ${quotation.quotation_number} is in '${quotation.status}' status. Only approved or closed quotations are managed in the Dispatch module.`,
      });
      return;
    }

    // Salespersons can only view their own quotations
    const isSalesperson = req.user?.role?.toLowerCase() === 'salesperson';
    if (
      isSalesperson &&
      quotation.sales_person_id !== req.user!.id &&
      quotation.assisted_sales_person_id !== req.user!.id
    ) {
      res.status(403).json({
        error: 'Access denied: Salespersons can only view dispatch status of their own quotations.',
      });
      return;
    }

    const areas = await query(
      `SELECT * FROM quotation_areas WHERE quotation_id = $1 ORDER BY display_order ASC, id ASC`,
      [id]
    );

    const items = await query(
      `SELECT 
        qi.id,
        qi.quotation_id,
        qi.area_id,
        qa.area_name,
        qi.sl_no,
        qi.description,
        qi.size,
        qi.brand,
        qi.product_type,
        qi.coverage_area,
        qi.quantity_sqft,
        qi.quantity_boxes,
        qi.item_code,
        qi.item_image,
        qi.mrp_price,
        qi.total_amount,
        COALESCE(qi.dispatch_status, 'Yet to Update') as dispatch_status,
        COALESCE(qi.expected_dispatch_date, q.expected_dispatch_date) as expected_dispatch_date,
        qi.dispatch_notes,
        qi.dispatched_at,
        COALESCE(qi.dispatched_quantity, 0) as dispatched_quantity,
        qi.procurement_status,
        qi.procurement_notes,
        qi.procurement_updated_at
       FROM quotation_items qi
       JOIN quotations q ON q.id = qi.quotation_id
       LEFT JOIN quotation_areas qa ON qa.id = qi.area_id
       WHERE qi.quotation_id = $1
       ORDER BY COALESCE(qa.display_order, 0) ASC, qi.sl_no ASC, qi.id ASC`,
      [id]
    );

    // Group items by area
    const areasWithItems = areas.map((a: any) => ({
      ...a,
      items: items.filter((it: any) => it.area_id === a.id),
    }));

    res.json({
      quotation: {
        ...quotation,
        dispatch_status: quotation.dispatch_status || 'Yet to Update',
      },
      areas: areasWithItems,
      items,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 4. Update Dispatch Status & Expected Dispatch Date
dispatchRouter.put(
  '/quotations/:id',
  requireRole(['admin', 'dispatch', 'dispatch_team']),
  async (req: Request, res: Response) => {
    try {
      await ensureDispatchSchema();

      const id = parseInt(req.params.id as string, 10);
      const {
        expected_dispatch_date,
        dispatch_status,
        dispatch_notes,
        items,
      } = req.body;

      // VALIDATION: "expected discpatch date must be mentioned while saving"
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      const overallDateProvided =
        expected_dispatch_date && typeof expected_dispatch_date === 'string' && dateRegex.test(expected_dispatch_date.trim());

      const itemsList = Array.isArray(items) ? items : [];

      // If overall date is not provided, verify that each item being saved has an expected dispatch date
      if (!overallDateProvided) {
        if (itemsList.length === 0) {
          res.status(400).json({
            error: 'Expected dispatch date must be specified while saving.',
          });
          return;
        }

        const missingItemDate = itemsList.some(
          (it: any) => !it.expected_dispatch_date || !dateRegex.test(String(it.expected_dispatch_date).trim())
        );
        if (missingItemDate) {
          res.status(400).json({
            error: 'Expected dispatch date must be mentioned for all items or the quotation while saving.',
          });
          return;
        }
      }

      const qCheck = await query('SELECT id, quotation_number, status FROM quotations WHERE id = $1', [id]);
      if (qCheck.length === 0) {
        res.status(404).json({ error: 'Quotation not found' });
        return;
      }
      if (!['closed', 'approved'].includes(qCheck[0].status?.toLowerCase())) {
        res.status(400).json({
          error: `Quotation ${qCheck[0].quotation_number} is in '${qCheck[0].status}' status. Only approved or closed quotations are managed in the Dispatch module.`,
        });
        return;
      }

      const normalizedOverallStatus = dispatch_status ? normalizeStatus(dispatch_status) : null;
      const cleanExpectedDate = overallDateProvided ? expected_dispatch_date.trim() : null;

      await withTransaction(async (client) => {
        // 1. Update item-level dispatch fields if items array provided
        if (itemsList.length > 0) {
          for (const it of itemsList) {
            const itStatus = normalizeStatus(it.dispatch_status);
            const itDate =
              it.expected_dispatch_date && dateRegex.test(String(it.expected_dispatch_date).trim())
                ? String(it.expected_dispatch_date).trim()
                : cleanExpectedDate;
            const isItemDispatched = itStatus === 'Dispatched';
            const itDispatchedQty =
              it.dispatched_quantity !== undefined && it.dispatched_quantity !== null && it.dispatched_quantity !== ''
                ? Math.max(0, parseFloat(it.dispatched_quantity) || 0)
                : (isItemDispatched ? (parseFloat(it.quantity_boxes) || parseFloat(it.quantity_sqft) || 1) : 0);
            const itProcurementStatus =
              it.procurement_status && typeof it.procurement_status === 'string' && it.procurement_status.trim()
                ? it.procurement_status.trim()
                : null;
            const itProcurementNotes = it.procurement_notes || null;

            const itProcurementCategory =
              itStatus === 'Need to Arrange from Local'
                ? 'local'
                : itStatus === 'Factory Order'
                ? 'factory'
                : null;

            await client.query(
              `UPDATE quotation_items
               SET dispatch_status = $1,
                   expected_dispatch_date = $2,
                   dispatch_notes = $3,
                   dispatched_at = CASE WHEN $4::boolean THEN COALESCE(dispatched_at, CURRENT_TIMESTAMP) ELSE NULL END,
                   dispatched_quantity = $5,
                   procurement_status = $6,
                   procurement_notes = $7,
                   procurement_updated_at = CASE WHEN $6::varchar IS NOT NULL THEN CURRENT_TIMESTAMP ELSE procurement_updated_at END,
                   procurement_category = COALESCE($8, procurement_category),
                   procurement_updated_by_name = CASE WHEN $6::varchar IS NOT NULL THEN $9 ELSE procurement_updated_by_name END
               WHERE id = $10 AND quotation_id = $11`,
              [
                itStatus,
                itDate,
                it.dispatch_notes || null,
                isItemDispatched,
                itDispatchedQty,
                itProcurementStatus,
                itProcurementNotes,
                itProcurementCategory,
                req.user!.full_name,
                it.id,
                id,
              ]
            );
          }
        }

        // 2. Compute aggregate quotation dispatch status from items
        const itemStatusRows = await client.query(
          `SELECT dispatch_status, count(*) as count FROM quotation_items WHERE quotation_id = $1 GROUP BY dispatch_status`,
          [id]
        );
        const totalRows = await client.query(
          `SELECT count(*) as count FROM quotation_items WHERE quotation_id = $1`,
          [id]
        );
        const total = parseInt(totalRows.rows[0]?.count || '0', 10);
        const dispatched = parseInt(
          itemStatusRows.rows.find((r: any) => r.dispatch_status === 'Dispatched')?.count || '0',
          10
        );
        const factory = parseInt(
          itemStatusRows.rows.find((r: any) => r.dispatch_status === 'Factory Order')?.count || '0',
          10
        );
        const local = parseInt(
          itemStatusRows.rows.find((r: any) => r.dispatch_status === 'Need to Arrange from Local')?.count || '0',
          10
        );
        const ready = parseInt(
          itemStatusRows.rows.find((r: any) => r.dispatch_status === 'Ready Stock')?.count || '0',
          10
        );

        let finalQuotationStatus = 'Yet to Update';
        if (total > 0 && dispatched === total) {
          finalQuotationStatus = 'Dispatched';
        } else if (factory > 0) {
          finalQuotationStatus = 'Factory Order';
        } else if (local > 0) {
          finalQuotationStatus = 'Need to Arrange from Local';
        } else if (ready > 0) {
          finalQuotationStatus = 'Ready Stock';
        } else if (normalizedOverallStatus && normalizedOverallStatus !== 'Yet to Update') {
          finalQuotationStatus = normalizedOverallStatus;
        }

        // Determine earliest or default expected date for the quotation
        let finalQuotationDate = cleanExpectedDate;
        if (!finalQuotationDate) {
          const minDateRes = await client.query(
            `SELECT MIN(expected_dispatch_date) as min_date FROM quotation_items WHERE quotation_id = $1 AND expected_dispatch_date IS NOT NULL`,
            [id]
          );
          if (minDateRes.rows[0]?.min_date) {
            finalQuotationDate = minDateRes.rows[0].min_date;
          }
        }

        const isFullyDispatched = finalQuotationStatus === 'Dispatched';

        await client.query(
          `UPDATE quotations
           SET dispatch_status = $1,
               expected_dispatch_date = COALESCE($2::date, expected_dispatch_date),
               dispatch_notes = COALESCE($3::text, dispatch_notes),
               dispatched_by_id = $4,
               dispatched_by_name = $5,
               dispatched_at = CASE WHEN $6::boolean THEN COALESCE(dispatched_at, CURRENT_TIMESTAMP) ELSE NULL END,
               status = CASE WHEN $6::boolean AND status = 'approved' THEN 'closed' ELSE status END,
               has_dispatch_item_changes = false,
               dispatch_change_acknowledged_at = CURRENT_TIMESTAMP,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $7`,
          [
            finalQuotationStatus,
            finalQuotationDate,
            dispatch_notes !== undefined ? dispatch_notes : null,
            req.user!.id,
            req.user!.full_name,
            isFullyDispatched,
            id,
          ]
        );
      });

      // Record audit log
      await recordAuditLog({
        userId: req.user!.id,
        username: req.user!.username,
        action: 'DISPATCH_STATUS_UPDATED',
        entityType: 'quotation',
        entityId: id,
        details: {
          quotation_id: id,
          quotation_number: qCheck[0].quotation_number,
          dispatch_status: normalizedOverallStatus,
          expected_dispatch_date,
          item_count: itemsList.length,
        },
      });

      // Fetch fresh details of quotation for the broadcast
      const updatedQuoteRows = await query(
        `SELECT q.id, q.quotation_number, q.customer_name, q.sales_person_id, q.sales_person_name, q.dispatch_status, q.expected_dispatch_date
         FROM quotations q WHERE q.id = $1`,
        [id]
      );
      const updatedQuote = updatedQuoteRows[0] || {};

      // Broadcast WebSocket notification to keep all client dashboards in sync
      broadcast({
        type: 'DISPATCH_UPDATED',
        payload: {
          quotation_id: id,
          quotation_number: updatedQuote.quotation_number || qCheck[0].quotation_number,
          customer_name: updatedQuote.customer_name,
          sales_person_id: updatedQuote.sales_person_id,
          sales_person_name: updatedQuote.sales_person_name,
          dispatch_status: updatedQuote.dispatch_status || normalizedOverallStatus,
          expected_dispatch_date: updatedQuote.expected_dispatch_date || expected_dispatch_date,
          updated_by: req.user!.full_name,
          timestamp: new Date().toISOString(),
        },
      });

      res.json({
        success: true,
        message: 'Dispatch status and expected date saved successfully',
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// 5. Acknowledge and Clear Item Changes Notification
dispatchRouter.post(
  '/quotations/:id/acknowledge-changes',
  requireRole(['admin', 'dispatch', 'dispatch_team']),
  async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id as string, 10);
      const qRows = await query(`SELECT quotation_number FROM quotations WHERE id = $1`, [id]);
      if (qRows.length === 0) {
        res.status(404).json({ error: 'Quotation not found' });
        return;
      }

      await query(
        `UPDATE quotations
         SET has_dispatch_item_changes = false,
             dispatch_change_acknowledged_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [id]
      );

      broadcast({
        type: 'DISPATCH_CHANGES_ACKNOWLEDGED',
        payload: {
          quotation_id: id,
          quotation_number: qRows[0].quotation_number,
          acknowledged_by: req.user!.full_name,
          timestamp: new Date().toISOString(),
        },
      });

      res.json({
        success: true,
        message: 'Quotation item changes acknowledged successfully',
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// 6. Get Procurement Items (Dedicated Local Purchase & Factory Orders Line-Item Queues)
dispatchRouter.get('/procurement-items', async (req: Request, res: Response) => {
  try {
    await ensureDispatchSchema();

    const { category, status = 'active', procurement_stage, search } = req.query;

    const conditions: string[] = [];
    const params: any[] = [];
    let pIdx = 1;

    // Both Approved and Closed quotations are tracked in procurement
    conditions.push(`LOWER(q.status) IN ('closed', 'approved')`);

    // Salespersons can only view items from their own quotations
    const isSalesperson = req.user?.role?.toLowerCase() === 'salesperson';
    if (isSalesperson) {
      conditions.push(`(q.sales_person_id = $${pIdx} OR q.assisted_sales_person_id = $${pIdx})`);
      params.push(req.user!.id);
      pIdx++;
    }

    // Category filtering: local purchase vs factory order
    if (category === 'local') {
      if (status === 'fulfilled') {
        conditions.push(`qi.procurement_category = 'local' AND qi.dispatch_status IN ('Ready Stock', 'Dispatched')`);
      } else if (status === 'active') {
        conditions.push(`(qi.dispatch_status = 'Need to Arrange from Local' OR (qi.procurement_category = 'local' AND qi.dispatch_status NOT IN ('Ready Stock', 'Dispatched')))`);
      } else {
        // all
        conditions.push(`(qi.dispatch_status = 'Need to Arrange from Local' OR qi.procurement_category = 'local')`);
      }
    } else if (category === 'factory') {
      if (status === 'fulfilled') {
        conditions.push(`qi.procurement_category = 'factory' AND qi.dispatch_status IN ('Ready Stock', 'Dispatched')`);
      } else if (status === 'active') {
        conditions.push(`(qi.dispatch_status = 'Factory Order' OR (qi.procurement_category = 'factory' AND qi.dispatch_status NOT IN ('Ready Stock', 'Dispatched')))`);
      } else {
        // all
        conditions.push(`(qi.dispatch_status = 'Factory Order' OR qi.procurement_category = 'factory')`);
      }
    } else {
      // both categories
      if (status === 'fulfilled') {
        conditions.push(`qi.procurement_category IN ('local', 'factory') AND qi.dispatch_status IN ('Ready Stock', 'Dispatched')`);
      } else if (status === 'active') {
        conditions.push(`(qi.dispatch_status IN ('Need to Arrange from Local', 'Factory Order') OR (qi.procurement_category IN ('local', 'factory') AND qi.dispatch_status NOT IN ('Ready Stock', 'Dispatched')))`);
      } else {
        conditions.push(`(qi.dispatch_status IN ('Need to Arrange from Local', 'Factory Order') OR qi.procurement_category IN ('local', 'factory'))`);
      }
    }

    // Procurement stage filter
    if (procurement_stage && typeof procurement_stage === 'string' && procurement_stage.trim() !== 'all') {
      conditions.push(`qi.procurement_status = $${pIdx}`);
      params.push(procurement_stage.trim());
      pIdx++;
    }

    // Search keyword
    if (search && typeof search === 'string' && search.trim()) {
      const term = `%${search.trim()}%`;
      conditions.push(
        `(q.quotation_number ILIKE $${pIdx} OR q.customer_name ILIKE $${pIdx} OR q.customer_phone ILIKE $${pIdx} OR q.site_location ILIKE $${pIdx} OR qi.description ILIKE $${pIdx} OR qi.brand ILIKE $${pIdx} OR qi.size ILIKE $${pIdx})`
      );
      params.push(term);
      pIdx++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const sql = `
      SELECT 
        qi.id,
        qi.quotation_id,
        qi.area_id,
        COALESCE(qa.area_name, 'Default Area') as area_name,
        q.quotation_type as item_type,
        qi.description,
        qi.brand,
        qi.size,
        qi.product_type,
        COALESCE(qi.quantity_boxes, qi.quantity_sqft, 0) as quantity,
        qi.quantity_boxes,
        qi.quantity_sqft,
        qi.coverage_area,
        qi.rate_per_sqft,
        qi.rate_per_box as rate_per_unit,
        qi.total_amount as item_total,
        COALESCE(qi.dispatch_status, 'Yet to Update') as dispatch_status,
        qi.expected_dispatch_date,
        qi.dispatch_notes,
        qi.dispatched_quantity,
        qi.procurement_status,
        qi.procurement_notes,
        qi.procurement_category,
        qi.procurement_updated_at,
        qi.procurement_updated_by_name,
        q.quotation_number,
        q.quotation_date,
        q.quotation_type,
        q.status as quotation_status,
        q.customer_id,
        q.customer_name,
        q.customer_phone,
        q.site_location,
        q.sales_person_id,
        q.sales_person_name,
        COALESCE(q.dispatch_status, 'Yet to Update') as quotation_dispatch_status,
        q.expected_dispatch_date as quotation_expected_date
      FROM quotation_items qi
      JOIN quotations q ON q.id = qi.quotation_id
      LEFT JOIN quotation_areas qa ON qa.id = qi.area_id
      ${whereClause}
      ORDER BY 
        CASE WHEN qi.expected_dispatch_date IS NULL THEN 1 ELSE 0 END,
        qi.expected_dispatch_date ASC,
        qi.id DESC
      LIMIT 300
    `;

    const items = await query(sql, params);

    // Compute summary counts for the user
    const userRoleFilter = isSalesperson
      ? `AND (q.sales_person_id = $1 OR q.assisted_sales_person_id = $1)`
      : '';
    const userRoleParams = isSalesperson ? [req.user!.id] : [];

    const summaryRes = await query(
      `SELECT 
         COUNT(CASE WHEN qi.dispatch_status = 'Need to Arrange from Local' THEN 1 END) as local_active_count,
         COUNT(CASE WHEN qi.procurement_category = 'local' AND qi.dispatch_status IN ('Ready Stock', 'Dispatched') THEN 1 END) as local_fulfilled_count,
         COUNT(CASE WHEN qi.dispatch_status = 'Factory Order' THEN 1 END) as factory_active_count,
         COUNT(CASE WHEN qi.procurement_category = 'factory' AND qi.dispatch_status IN ('Ready Stock', 'Dispatched') THEN 1 END) as factory_fulfilled_count
       FROM quotation_items qi
       JOIN quotations q ON q.id = qi.quotation_id
       WHERE LOWER(q.status) IN ('closed', 'approved') ${userRoleFilter}`,
      userRoleParams
    );

    const counts = summaryRes[0] || {};

    res.json({
      items,
      summary: {
        local_active_count: parseInt(counts.local_active_count || '0', 10),
        local_fulfilled_count: parseInt(counts.local_fulfilled_count || '0', 10),
        factory_active_count: parseInt(counts.factory_active_count || '0', 10),
        factory_fulfilled_count: parseInt(counts.factory_fulfilled_count || '0', 10),
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 7. Update Single Item Procurement Status & Mark Ready Stock
dispatchRouter.patch(
  '/items/:id',
  requireRole(['admin', 'manager', 'dispatch', 'dispatch_team']),
  async (req: Request, res: Response) => {
    try {
      await ensureDispatchSchema();

      const itemId = parseInt(req.params.id as string, 10);
      const {
        procurement_status,
        procurement_notes,
        expected_dispatch_date,
        mark_ready_stock,
      } = req.body;

      // Find item
      const itemRows = await query(
        `SELECT qi.*, q.id as quote_id, q.quotation_number, q.customer_name, q.sales_person_id, q.sales_person_name
         FROM quotation_items qi
         JOIN quotations q ON q.id = qi.quotation_id
         WHERE qi.id = $1`,
        [itemId]
      );

      if (itemRows.length === 0) {
        res.status(404).json({ error: 'Quotation item not found' });
        return;
      }

      const item = itemRows[0];
      const quotationId = item.quote_id;

      let nextDispatchStatus = item.dispatch_status;
      let nextProcurementStatus = item.procurement_status;
      let nextProcurementCategory = item.procurement_category;

      if (!nextProcurementCategory) {
        if (item.dispatch_status === 'Need to Arrange from Local') nextProcurementCategory = 'local';
        else if (item.dispatch_status === 'Factory Order') nextProcurementCategory = 'factory';
      }

      if (mark_ready_stock === true) {
        // Transition item directly to Ready Stock in Godown
        nextDispatchStatus = 'Ready Stock';
        nextProcurementStatus = 'Reached to Godown';
      } else if (procurement_status && typeof procurement_status === 'string') {
        const cleanStage = procurement_status.trim();
        if (VALID_PROCUREMENT_STATUSES.includes(cleanStage as any)) {
          nextProcurementStatus = cleanStage;
        }
      }

      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      const nextDate =
        expected_dispatch_date && dateRegex.test(String(expected_dispatch_date).trim())
          ? String(expected_dispatch_date).trim()
          : item.expected_dispatch_date;

      const nextNotes = procurement_notes !== undefined ? procurement_notes : item.procurement_notes;

      // Update item
      await query(
        `UPDATE quotation_items
         SET dispatch_status = $1,
             procurement_status = $2,
             procurement_category = $3,
             procurement_notes = $4,
             expected_dispatch_date = $5,
             procurement_updated_at = CURRENT_TIMESTAMP,
             procurement_updated_by_name = $6
         WHERE id = $7`,
        [
          nextDispatchStatus,
          nextProcurementStatus,
          nextProcurementCategory,
          nextNotes,
          nextDate,
          req.user!.full_name,
          itemId,
        ]
      );

      // Recompute parent quotation's overall dispatch status
      const itemStatusRows = await query(
        `SELECT dispatch_status, count(*) as count FROM quotation_items WHERE quotation_id = $1 GROUP BY dispatch_status`,
        [quotationId]
      );
      const totalRows = await query(
        `SELECT count(*) as count FROM quotation_items WHERE quotation_id = $1`,
        [quotationId]
      );
      const total = parseInt(totalRows[0]?.count || '0', 10);
      const dispatched = parseInt(
        itemStatusRows.find((r: any) => r.dispatch_status === 'Dispatched')?.count || '0',
        10
      );
      const factory = parseInt(
        itemStatusRows.find((r: any) => r.dispatch_status === 'Factory Order')?.count || '0',
        10
      );
      const local = parseInt(
        itemStatusRows.find((r: any) => r.dispatch_status === 'Need to Arrange from Local')?.count || '0',
        10
      );
      const ready = parseInt(
        itemStatusRows.find((r: any) => r.dispatch_status === 'Ready Stock')?.count || '0',
        10
      );

      let computedQuotationStatus = 'Yet to Update';
      if (total > 0 && dispatched === total) {
        computedQuotationStatus = 'Dispatched';
      } else if (factory > 0) {
        computedQuotationStatus = 'Factory Order';
      } else if (local > 0) {
        computedQuotationStatus = 'Need to Arrange from Local';
      } else if (ready > 0) {
        computedQuotationStatus = 'Ready Stock';
      }

      await query(
        `UPDATE quotations
         SET dispatch_status = $1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [computedQuotationStatus, quotationId]
      );

      // Record audit log
      await recordAuditLog({
        userId: req.user!.id,
        username: req.user!.username,
        action: mark_ready_stock ? 'ITEM_MARKED_READY_STOCK' : 'ITEM_PROCUREMENT_STAGE_UPDATED',
        entityType: 'quotation_item',
        entityId: itemId,
        details: {
          quotation_id: quotationId,
          quotation_number: item.quotation_number,
          item_id: itemId,
          item_description: item.description,
          previous_dispatch_status: item.dispatch_status,
          new_dispatch_status: nextDispatchStatus,
          previous_procurement_status: item.procurement_status,
          new_procurement_status: nextProcurementStatus,
          quotation_dispatch_status: computedQuotationStatus,
        },
      });

      // Broadcast WebSocket notification to keep all dispatch screens instantly synchronized
      broadcast({
        type: 'DISPATCH_UPDATED',
        payload: {
          quotation_id: quotationId,
          quotation_number: item.quotation_number,
          item_id: itemId,
          dispatch_status: computedQuotationStatus,
          item_dispatch_status: nextDispatchStatus,
          procurement_status: nextProcurementStatus,
          updated_by: req.user!.full_name,
          timestamp: new Date().toISOString(),
        },
      });

      // Fetch fresh updated item row
      const freshRows = await query(
        `SELECT qi.*, q.quotation_number, q.customer_name, q.customer_phone, q.site_location
         FROM quotation_items qi
         JOIN quotations q ON q.id = qi.quotation_id
         WHERE qi.id = $1`,
        [itemId]
      );

      res.json({
        success: true,
        message: mark_ready_stock
          ? 'Item marked as Ready Stock and moved to Godown inventory.'
          : 'Procurement status updated successfully.',
        item: freshRows[0],
        quotation_dispatch_status: computedQuotationStatus,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);
