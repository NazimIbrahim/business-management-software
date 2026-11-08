import PDFDocument from 'pdfkit';
import * as XLSX from 'xlsx';
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

      -- Additional Subsystem Tables
      CREATE TABLE IF NOT EXISTS dispatch_records (
        id SERIAL PRIMARY KEY,
        dispatch_number VARCHAR(60) UNIQUE NOT NULL,
        quotation_id INTEGER NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
        status VARCHAR(40) NOT NULL DEFAULT 'PROCESSING',
        scheduled_date DATE,
        completed_date TIMESTAMPTZ,
        vehicle_no VARCHAR(50),
        driver_name VARCHAR(120),
        driver_phone VARCHAR(30),
        delivery_address TEXT,
        challan_number VARCHAR(80),
        notes TEXT,
        dispatched_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        dispatched_by_name VARCHAR(120),
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS dispatch_items (
        id SERIAL PRIMARY KEY,
        dispatch_id INTEGER NOT NULL REFERENCES dispatch_records(id) ON DELETE CASCADE,
        quotation_item_id INTEGER NOT NULL REFERENCES quotation_items(id) ON DELETE CASCADE,
        ordered_quantity NUMERIC(12, 2) NOT NULL DEFAULT 0,
        quantity_dispatched NUMERIC(12, 2) NOT NULL DEFAULT 0,
        unit VARCHAR(30) DEFAULT 'boxes',
        status VARCHAR(40) NOT NULL DEFAULT 'PENDING',
        remarks TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS local_purchases (
        id SERIAL PRIMARY KEY,
        quotation_item_id INTEGER NOT NULL REFERENCES quotation_items(id) ON DELETE CASCADE,
        quotation_id INTEGER NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
        vendor_name VARCHAR(180) NOT NULL DEFAULT 'Local Distributor',
        vendor_contact VARCHAR(50),
        required_quantity NUMERIC(12, 2) NOT NULL DEFAULT 0,
        quoted_rate NUMERIC(12, 2) NOT NULL DEFAULT 0,
        actual_purchase_rate NUMERIC(12, 2) DEFAULT 0,
        purchase_status VARCHAR(40) NOT NULL DEFAULT 'PO_RAISED',
        invoice_number VARCHAR(100),
        expected_date DATE,
        completed_date TIMESTAMPTZ,
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS factory_orders (
        id SERIAL PRIMARY KEY,
        quotation_item_id INTEGER NOT NULL REFERENCES quotation_items(id) ON DELETE CASCADE,
        quotation_id INTEGER NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
        factory_name VARCHAR(180) NOT NULL DEFAULT 'Factory / Morbi Plant',
        brand_name VARCHAR(120),
        batch_shade_code VARCHAR(100),
        lr_number VARCHAR(100),
        transporter_name VARCHAR(150),
        truck_number VARCHAR(50),
        order_date DATE NOT NULL DEFAULT CURRENT_DATE,
        eta_date DATE,
        unloaded_date TIMESTAMPTZ,
        status VARCHAR(40) NOT NULL DEFAULT 'ORDER_PLACED',
        freight_cost NUMERIC(12, 2) DEFAULT 0,
        total_pallets NUMERIC(10, 2) DEFAULT 0,
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      ALTER TABLE quotations ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;
      ALTER TABLE quotations ADD COLUMN IF NOT EXISTS scheduled_dispatch_date DATE;
      ALTER TABLE quotations ADD COLUMN IF NOT EXISTS dispatch_progress_percent NUMERIC(5, 2) DEFAULT 0.00;
      ALTER TABLE quotations ADD COLUMN IF NOT EXISTS delivery_challan_number VARCHAR(80);
      ALTER TABLE quotations ADD COLUMN IF NOT EXISTS delivery_address TEXT;

      ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS sourcing_type VARCHAR(50);
      ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS remaining_quantity NUMERIC(12, 2) DEFAULT 0;
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
        COALESCE(p_pay.verified_paid, 0) as total_paid,
        GREATEST(0, q.net_total - COALESCE(p_pay.verified_paid, 0)) as balance_due,
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
      LEFT JOIN (
        SELECT quotation_id, SUM(amount) as verified_paid
        FROM payments
        WHERE status IN ('Cleared', 'Verified')
        GROUP BY quotation_id
      ) p_pay ON p_pay.quotation_id = q.id
      ${whereClause}
      GROUP BY q.id, u_app.full_name, p_pay.verified_paid
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
      `SELECT q.*, u_app.full_name as approved_by_name,
              COALESCE(p_pay.verified_paid, 0) as total_paid,
              GREATEST(0, q.net_total - COALESCE(p_pay.verified_paid, 0)) as balance_due
       FROM quotations q
       LEFT JOIN users u_app ON u_app.id = q.approved_by_id
       LEFT JOIN (
         SELECT quotation_id, SUM(amount) as verified_paid
         FROM payments
         WHERE status IN ('Cleared', 'Verified')
         GROUP BY quotation_id
       ) p_pay ON p_pay.quotation_id = q.id
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
        q.expected_dispatch_date as quotation_expected_date,
        q.net_total as quotation_net_total,
        COALESCE(p_pay.verified_paid, 0) as quotation_verified_paid,
        GREATEST(0, q.net_total - COALESCE(p_pay.verified_paid, 0)) as quotation_balance_due
      FROM quotation_items qi
      JOIN quotations q ON q.id = qi.quotation_id
      LEFT JOIN quotation_areas qa ON qa.id = qi.area_id
      LEFT JOIN (
        SELECT quotation_id, SUM(amount) as verified_paid
        FROM payments
        WHERE status IN ('Cleared', 'Verified')
        GROUP BY quotation_id
      ) p_pay ON p_pay.quotation_id = q.id
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
const handleItemProcurementUpdate = async (req: Request, res: Response) => {
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
        `SELECT qi.*,
                qi.total_amount as item_total,
                q.quotation_number, q.customer_name, q.customer_phone, q.site_location,
                q.net_total as quotation_net_total,
                COALESCE(p_pay.verified_paid, 0) as quotation_verified_paid,
                GREATEST(0, q.net_total - COALESCE(p_pay.verified_paid, 0)) as quotation_balance_due
         FROM quotation_items qi
         JOIN quotations q ON q.id = qi.quotation_id
         LEFT JOIN (
           SELECT quotation_id, SUM(amount) as verified_paid
           FROM payments
           WHERE status IN ('Cleared', 'Verified')
           GROUP BY quotation_id
         ) p_pay ON p_pay.quotation_id = q.id
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
};

const dispatchItemRoles = requireRole(['admin', 'manager', 'dispatch', 'dispatch_team']);
dispatchRouter.patch('/items/:id', dispatchItemRoles, handleItemProcurementUpdate);
dispatchRouter.post('/items/:id', dispatchItemRoles, handleItemProcurementUpdate);
dispatchRouter.put('/items/:id', dispatchItemRoles, handleItemProcurementUpdate);


// =========================================================================
// DISPATCH MANAGEMENT 10 CORE MODULE ENDPOINTS
// =========================================================================

// 1. ALL CLOSED QUOTATIONS (Strict FIFO ordering: First-In, First-Out by closed_at ASC)
dispatchRouter.get('/all-closed', async (req: Request, res: Response) => {
  try {
    const userRole = (req.user?.role || '').toLowerCase();
    const isSalesperson = userRole === 'salesperson';
    const userFilter = isSalesperson ? 'AND q.sales_person_id = $1' : '';
    const userParams = isSalesperson ? [req.user!.id] : [];

    const rows = await query(
      `SELECT 
        q.id,
        q.quotation_number,
        q.customer_name,
        q.customer_phone,
        q.customer_gstin,
        q.site_location,
        COALESCE(q.delivery_address, q.site_location, 'Site Address') as delivery_address,
        q.project_name,
        q.quotation_type,
        q.sales_person_name,
        q.net_total,
        q.status as quotation_status,
        COALESCE(q.dispatch_status, 'Yet to Update') as dispatch_status,
        q.expected_dispatch_date,
        q.scheduled_dispatch_date,
        q.dispatch_notes,
        COALESCE(q.closed_at, q.updated_at, q.created_at) as closed_at,
        q.created_at,
        q.has_dispatch_item_changes,
        q.dispatch_change_summary,
        COALESCE(qi_agg.total_items, 0) as total_items,
        COALESCE(qi_agg.ready_items, 0) as ready_items,
        COALESCE(qi_agg.local_items, 0) as local_items,
        COALESCE(qi_agg.factory_items, 0) as factory_items,
        COALESCE(qi_agg.dispatched_items, 0) as dispatched_items,
        COALESCE(qi_agg.total_ordered_qty, 0) as total_ordered_qty,
        COALESCE(qi_agg.total_dispatched_qty, 0) as total_dispatched_qty,
        COALESCE(p_pay.verified_paid, 0) as verified_paid,
        COALESCE(p_pay.unverified_paid, 0) as unverified_paid,
        GREATEST(0, q.net_total - COALESCE(p_pay.verified_paid, 0)) as balance_due,
        CASE 
          WHEN COALESCE(p_pay.verified_paid, 0) >= q.net_total - 0.5 THEN 'CLEARED'
          WHEN COALESCE(p_pay.verified_paid, 0) > 0 THEN 'PARTIAL'
          ELSE 'PENDING'
        END as payment_status
      FROM quotations q
      LEFT JOIN (
        SELECT 
          quotation_id,
          COUNT(*) as total_items,
          COUNT(CASE WHEN dispatch_status = 'Ready Stock' THEN 1 END) as ready_items,
          COUNT(CASE WHEN dispatch_status = 'Need to Arrange from Local' THEN 1 END) as local_items,
          COUNT(CASE WHEN dispatch_status = 'Factory Order' THEN 1 END) as factory_items,
          COUNT(CASE WHEN dispatch_status = 'Dispatched' THEN 1 END) as dispatched_items,
          SUM(COALESCE(quantity_boxes, quantity_sqft, 1)) as total_ordered_qty,
          SUM(COALESCE(dispatched_quantity, 0)) as total_dispatched_qty
        FROM quotation_items
        GROUP BY quotation_id
      ) qi_agg ON qi_agg.quotation_id = q.id
      LEFT JOIN (
        SELECT 
          quotation_id,
          SUM(CASE WHEN status IN ('Cleared', 'Verified') THEN amount ELSE 0 END) as verified_paid,
          SUM(CASE WHEN status = 'Recorded' THEN amount ELSE 0 END) as unverified_paid
        FROM payments
        GROUP BY quotation_id
      ) p_pay ON p_pay.quotation_id = q.id
      WHERE LOWER(q.status) IN ('closed', 'approved')
        AND COALESCE(q.dispatch_status, 'Yet to Update') != 'Dispatched'
        ${userFilter}
      ORDER BY COALESCE(q.closed_at, q.updated_at, q.created_at) ASC`,
      userParams
    );

    res.json({
      success: true,
      count: rows.length,
      quotations: rows,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 2. PROCESSING DISPATCH (Active pool with item-level partial quantities and live % progress)
dispatchRouter.get('/processing', async (req: Request, res: Response) => {
  try {
    const userRole = (req.user?.role || '').toLowerCase();
    const isSalesperson = userRole === 'salesperson';
    const userFilter = isSalesperson ? 'AND q.sales_person_id = $1' : '';
    const userParams = isSalesperson ? [req.user!.id] : [];

    const quotes = await query(
      `SELECT 
        q.id,
        q.quotation_number,
        q.customer_name,
        q.customer_phone,
        q.site_location,
        COALESCE(q.delivery_address, q.site_location, 'Site Address') as delivery_address,
        q.sales_person_name,
        q.net_total,
        COALESCE(q.dispatch_status, 'Yet to Update') as dispatch_status,
        q.expected_dispatch_date,
        q.scheduled_dispatch_date,
        q.dispatch_notes,
        COALESCE(p_pay.verified_paid, 0) as verified_paid,
        GREATEST(0, q.net_total - COALESCE(p_pay.verified_paid, 0)) as balance_due,
        COALESCE(dr.vehicle_no, '') as vehicle_no,
        COALESCE(dr.driver_name, '') as driver_name,
        COALESCE(dr.driver_phone, '') as driver_phone,
        COALESCE(dr.challan_number, '') as challan_number
      FROM quotations q
      LEFT JOIN (
        SELECT quotation_id, SUM(amount) as verified_paid
        FROM payments
        WHERE status IN ('Cleared', 'Verified')
        GROUP BY quotation_id
      ) p_pay ON p_pay.quotation_id = q.id
      LEFT JOIN (
        SELECT DISTINCT ON (quotation_id) quotation_id, vehicle_no, driver_name, driver_phone, challan_number
        FROM dispatch_records
        ORDER BY quotation_id, id DESC
      ) dr ON dr.quotation_id = q.id
      WHERE LOWER(q.status) IN ('closed', 'approved')
        AND COALESCE(q.dispatch_status, 'Yet to Update') != 'Dispatched'
        AND EXISTS (
          SELECT 1 FROM quotation_items qi 
          WHERE qi.quotation_id = q.id 
            AND qi.dispatch_status IN ('Ready Stock', 'Need to Arrange from Local', 'Factory Order', 'Dispatched')
        )
        ${userFilter}
      ORDER BY COALESCE(q.scheduled_dispatch_date, q.expected_dispatch_date, q.updated_at) ASC`,
      userParams
    );

    if (quotes.length === 0) {
      res.json({ success: true, count: 0, dispatches: [] });
      return;
    }

    const quoteIds = quotes.map((q: any) => q.id);
    const itemsRes = await query(
      `SELECT 
        qi.id,
        qi.quotation_id,
        qi.area_id,
        qa.area_name,
        qi.description,
        qi.brand,
        qi.size,
        qi.product_type,
        COALESCE(qi.quantity_boxes, qi.quantity_sqft, 1) as ordered_quantity,
        COALESCE(qi.dispatched_quantity, 0) as quantity_dispatched,
        GREATEST(0, COALESCE(qi.quantity_boxes, qi.quantity_sqft, 1) - COALESCE(qi.dispatched_quantity, 0)) as remaining_quantity,
        qi.rate_per_box,
        qi.rate_per_sqft,
        qi.total_amount,
        COALESCE(qi.dispatch_status, 'Yet to Update') as dispatch_status,
        qi.expected_dispatch_date,
        qi.procurement_status,
        qi.procurement_notes,
        qi.item_image
      FROM quotation_items qi
      LEFT JOIN quotation_areas qa ON qa.id = qi.area_id
      WHERE qi.quotation_id = ANY($1::int[])
      ORDER BY qi.quotation_id, qa.display_order ASC NULLS LAST, qi.id ASC`,
      [quoteIds]
    );

    // Group items by quote and calculate fulfillment %
    const itemsByQuote = new Map<number, any[]>();
    for (const it of itemsRes) {
      const arr = itemsByQuote.get(it.quotation_id) || [];
      arr.push(it);
      itemsByQuote.set(it.quotation_id, arr);
    }

    const dispatches = quotes.map((q: any) => {
      const items = itemsByQuote.get(q.id) || [];
      const totalOrdered = items.reduce((acc: number, it: any) => acc + parseFloat(it.ordered_quantity || 0), 0);
      const totalDispatched = items.reduce((acc: number, it: any) => acc + parseFloat(it.quantity_dispatched || 0), 0);
      const progressPercent = totalOrdered > 0 ? Math.min(100, Math.round((totalDispatched / totalOrdered) * 100)) : 0;
      const allDispatched = items.length > 0 && items.every((it: any) => it.dispatch_status === 'Dispatched');

      return {
        ...q,
        items,
        total_ordered_qty: totalOrdered,
        total_dispatched_qty: totalDispatched,
        progress_percent: progressPercent,
        all_items_dispatched: allDispatched,
      };
    });

    res.json({
      success: true,
      count: dispatches.length,
      dispatches,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 3. RECORD PARTIAL OR COMPLETE LINE-ITEM DISPATCH
dispatchRouter.post('/partial-dispatch', async (req: Request, res: Response) => {
  try {
    const {
      quotation_id,
      quotation_item_id,
      quantity_to_dispatch,
      vehicle_no,
      driver_name,
      driver_phone,
      delivery_address,
      challan_number,
      notes,
    } = req.body;

    const qId = parseInt(quotation_id, 10);
    const qiId = parseInt(quotation_item_id, 10);
    const qty = parseFloat(quantity_to_dispatch || 0);

    if (!qId || !qiId || qty <= 0) {
      res.status(400).json({ error: 'Valid quotation_id, quotation_item_id, and positive quantity_to_dispatch required' });
      return;
    }

    const itemRows = await query(
      `SELECT qi.*, q.quotation_number, q.customer_name, q.customer_phone, q.net_total
       FROM quotation_items qi
       JOIN quotations q ON q.id = qi.quotation_id
       WHERE qi.id = $1 AND qi.quotation_id = $2`,
      [qiId, qId]
    );

    if (itemRows.length === 0) {
      res.status(404).json({ error: 'Line item or quotation not found' });
      return;
    }

    const item = itemRows[0];
    const ordered = parseFloat(item.quantity_boxes || item.quantity_sqft || 1);
    const prevDispatched = parseFloat(item.dispatched_quantity || 0);
    const newDispatched = Math.min(ordered, prevDispatched + qty);
    const isNowFullyDispatched = newDispatched >= ordered - 0.001;

    // Generate or use challan number
    const generatedChallan = challan_number?.trim() || `DC-2026-${String(qId).padStart(4, '0')}`;

    await withTransaction(async (client) => {
      // 1. Update quotation_items
      await client.query(
        `UPDATE quotation_items
         SET dispatched_quantity = $1,
             dispatch_status = CASE WHEN $2 = true THEN 'Dispatched' ELSE dispatch_status END,
             dispatched_at = CASE WHEN $2 = true THEN CURRENT_TIMESTAMP ELSE dispatched_at END,
             remaining_quantity = GREATEST(0, $3 - $1)
         WHERE id = $4`,
        [newDispatched, isNowFullyDispatched, ordered, qiId]
      );

      // 2. Insert or update dispatch_records
      let recordId: number;
      const recCheck = await client.query(
        `SELECT id FROM dispatch_records WHERE quotation_id = $1 AND status != 'COMPLETED' ORDER BY id DESC LIMIT 1`,
        [qId]
      );

      if (recCheck.rows.length > 0) {
        recordId = recCheck.rows[0].id;
        await client.query(
          `UPDATE dispatch_records
           SET vehicle_no = COALESCE($1, vehicle_no),
               driver_name = COALESCE($2, driver_name),
               driver_phone = COALESCE($3, driver_phone),
               delivery_address = COALESCE($4, delivery_address),
               challan_number = COALESCE($5, challan_number),
               notes = COALESCE($6, notes),
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $7`,
          [vehicle_no || null, driver_name || null, driver_phone || null, delivery_address || null, generatedChallan, notes || null, recordId]
        );
      } else {
        const dNum = `DSP-2026-${Date.now().toString().slice(-6)}`;
        const insRec = await client.query(
          `INSERT INTO dispatch_records (
            dispatch_number, quotation_id, status, vehicle_no, driver_name, driver_phone,
            delivery_address, challan_number, notes, dispatched_by_id, dispatched_by_name
          ) VALUES ($1, $2, 'PROCESSING', $3, $4, $5, $6, $7, $8, $9, $10)
          RETURNING id`,
          [dNum, qId, vehicle_no || null, driver_name || null, driver_phone || null, delivery_address || null, generatedChallan, notes || null, req.user!.id, req.user!.full_name]
        );
        recordId = insRec.rows[0].id;
      }

      // 3. Record dispatch_items entry
      await client.query(
        `INSERT INTO dispatch_items (
          dispatch_id, quotation_item_id, ordered_quantity, quantity_dispatched, unit, status, remarks
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [recordId, qiId, ordered, qty, item.product_type || 'boxes', isNowFullyDispatched ? 'DISPATCHED' : 'PARTIAL', notes || null]
      );

      // 4. Re-check entire quotation items fulfillment
      const allItemsCheck = await client.query(
        `SELECT 
          COUNT(*) as total_items,
          COUNT(CASE WHEN dispatch_status = 'Dispatched' THEN 1 END) as dispatched_items
         FROM quotation_items
         WHERE quotation_id = $1`,
        [qId]
      );

      const tot = parseInt(allItemsCheck.rows[0]?.total_items || '0', 10);
      const disp = parseInt(allItemsCheck.rows[0]?.dispatched_items || '0', 10);
      const isQuoteFullyDispatched = tot > 0 && tot === disp;

      if (isQuoteFullyDispatched) {
        await client.query(
          `UPDATE quotations
           SET dispatch_status = 'Dispatched',
               dispatched_at = CURRENT_TIMESTAMP,
               dispatched_by_id = $1,
               dispatched_by_name = $2,
               delivery_challan_number = $3,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $4`,
          [req.user!.id, req.user!.full_name, generatedChallan, qId]
        );

        await client.query(
          `UPDATE dispatch_records
           SET status = 'COMPLETED',
               completed_date = CURRENT_TIMESTAMP,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [recordId]
        );
      }
    });

    // Broadcast WebSockets to sync all connected terminals
    broadcast({
      type: 'item_status:changed',
      payload: {
        quotation_id: qId,
        quotation_item_id: qiId,
        dispatched_quantity: newDispatched,
        ordered_quantity: ordered,
        is_dispatched: isNowFullyDispatched,
        updated_by: req.user!.full_name,
        timestamp: new Date().toISOString(),
      },
    });

    broadcast({
      type: 'dispatch:updated',
      payload: {
        quotation_id: qId,
        updated_by: req.user!.full_name,
        timestamp: new Date().toISOString(),
      },
    });

    res.json({
      success: true,
      message: isNowFullyDispatched ? 'Item completely dispatched!' : `Recorded ${qty} units dispatched.`,
      dispatched_quantity: newDispatched,
      remaining_quantity: Math.max(0, ordered - newDispatched),
      is_item_dispatched: isNowFullyDispatched,
      challan_number: generatedChallan,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 4. DISPATCH COMPLETED (Archive of 100% fulfilled dispatches)
dispatchRouter.get('/completed', async (req: Request, res: Response) => {
  try {
    const userRole = (req.user?.role || '').toLowerCase();
    const isSalesperson = userRole === 'salesperson';
    const userFilter = isSalesperson ? 'AND q.sales_person_id = $1' : '';
    const userParams = isSalesperson ? [req.user!.id] : [];

    const rows = await query(
      `SELECT 
        q.id as quotation_id,
        q.quotation_number,
        q.customer_name,
        q.customer_phone,
        q.site_location,
        COALESCE(q.delivery_address, q.site_location, 'Site Address') as delivery_address,
        q.sales_person_name,
        q.net_total,
        COALESCE(dr.dispatch_number, 'DSP-2026-' || LPAD(q.id::TEXT, 6, '0')) as dispatch_number,
        COALESCE(dr.challan_number, q.delivery_challan_number, 'DC-2026-' || LPAD(q.id::TEXT, 4, '0')) as challan_number,
        COALESCE(dr.vehicle_no, '-') as vehicle_no,
        COALESCE(dr.driver_name, '-') as driver_name,
        COALESCE(dr.driver_phone, '-') as driver_phone,
        COALESCE(dr.completed_date, q.dispatched_at, q.updated_at) as completed_date,
        COALESCE(dr.dispatched_by_name, q.dispatched_by_name, 'Warehouse Dispatcher') as dispatched_by_name,
        dr.notes,
        COALESCE(qi_agg.total_boxes, 0) as total_boxes,
        COALESCE(qi_agg.total_items, 0) as total_items
      FROM quotations q
      LEFT JOIN (
        SELECT DISTINCT ON (quotation_id) *
        FROM dispatch_records
        ORDER BY quotation_id, id DESC
      ) dr ON dr.quotation_id = q.id
      LEFT JOIN (
        SELECT 
          quotation_id,
          COUNT(*) as total_items,
          SUM(COALESCE(dispatched_quantity, quantity_boxes, 0)) as total_boxes
        FROM quotation_items
        GROUP BY quotation_id
      ) qi_agg ON qi_agg.quotation_id = q.id
      WHERE (q.dispatch_status = 'Dispatched' OR dr.status = 'COMPLETED')
        ${userFilter}
      ORDER BY COALESCE(dr.completed_date, q.dispatched_at, q.updated_at) DESC`,
      userParams
    );

    res.json({
      success: true,
      count: rows.length,
      completed_dispatches: rows,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 5. DISPATCH SCHEDULE (Chronological list and calendar dates)
dispatchRouter.get('/schedule', async (req: Request, res: Response) => {
  try {
    const userRole = (req.user?.role || '').toLowerCase();
    const isSalesperson = userRole === 'salesperson';
    const userFilter = isSalesperson ? 'AND q.sales_person_id = $1' : '';
    const userParams = isSalesperson ? [req.user!.id] : [];

    const rows = await query(
      `SELECT 
        q.id as quotation_id,
        q.quotation_number,
        q.customer_name,
        q.customer_phone,
        q.site_location,
        COALESCE(q.delivery_address, q.site_location, 'Site Address') as delivery_address,
        q.sales_person_name,
        q.net_total,
        COALESCE(q.dispatch_status, 'Yet to Update') as dispatch_status,
        COALESCE(q.scheduled_dispatch_date, q.expected_dispatch_date, CURRENT_DATE) as scheduled_date,
        q.expected_dispatch_date,
        q.scheduled_dispatch_date,
        q.dispatch_notes,
        COALESCE(dr.vehicle_no, '') as vehicle_no,
        COALESCE(dr.driver_name, '') as driver_name,
        COALESCE(dr.driver_phone, '') as driver_phone,
        COALESCE(qi_agg.total_boxes, 0) as total_boxes,
        COALESCE(qi_agg.total_items, 0) as total_items,
        CASE 
          WHEN COALESCE(q.scheduled_dispatch_date, q.expected_dispatch_date) < CURRENT_DATE 
               AND COALESCE(q.dispatch_status, 'Yet to Update') != 'Dispatched' THEN 'OVERDUE'
          WHEN COALESCE(q.scheduled_dispatch_date, q.expected_dispatch_date) = CURRENT_DATE THEN 'TODAY'
          ELSE 'UPCOMING'
        END as timeline_category
      FROM quotations q
      LEFT JOIN (
        SELECT DISTINCT ON (quotation_id) *
        FROM dispatch_records
        ORDER BY quotation_id, id DESC
      ) dr ON dr.quotation_id = q.id
      LEFT JOIN (
        SELECT 
          quotation_id,
          COUNT(*) as total_items,
          SUM(COALESCE(quantity_boxes, quantity_sqft, 1)) as total_boxes
        FROM quotation_items
        GROUP BY quotation_id
      ) qi_agg ON qi_agg.quotation_id = q.id
      WHERE LOWER(q.status) IN ('closed', 'approved')
        AND COALESCE(q.dispatch_status, 'Yet to Update') != 'Dispatched'
        ${userFilter}
      ORDER BY COALESCE(q.scheduled_dispatch_date, q.expected_dispatch_date, CURRENT_DATE) ASC`,
      userParams
    );

    res.json({
      success: true,
      count: rows.length,
      schedule: rows,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update / Reschedule dispatch date
dispatchRouter.put('/schedule/:id', async (req: Request, res: Response) => {
  try {
    const qId = parseInt(req.params.id as string, 10);
    const { scheduled_date, dispatch_notes } = req.body;

    if (!qId || !scheduled_date) {
      res.status(400).json({ error: 'Quotation id and scheduled_date required' });
      return;
    }

    await query(
      `UPDATE quotations
       SET scheduled_dispatch_date = $1,
           expected_dispatch_date = $1,
           dispatch_notes = COALESCE($2, dispatch_notes),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [scheduled_date, dispatch_notes || null, qId]
    );

    await query(
      `UPDATE dispatch_records
       SET scheduled_date = $1,
           notes = COALESCE($2, notes),
           updated_at = CURRENT_TIMESTAMP
       WHERE quotation_id = $3`,
      [scheduled_date, dispatch_notes || null, qId]
    );

    broadcast({
      type: 'dispatch:updated',
      payload: { quotation_id: qId, scheduled_date, updated_by: req.user!.full_name },
    });

    res.json({ success: true, message: 'Dispatch schedule updated successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 6. LOCAL PURCHASE TRACKER (Active local sourcing workbench)
dispatchRouter.get('/local-tracker', async (req: Request, res: Response) => {
  try {
    const rows = await query(
      `SELECT 
        qi.id as quotation_item_id,
        qi.quotation_id,
        q.quotation_number,
        q.customer_name,
        q.customer_phone,
        q.site_location,
        qi.description,
        qi.brand,
        qi.size,
        qi.product_type,
        COALESCE(qi.quantity_boxes, qi.quantity_sqft, 1) as required_quantity,
        COALESCE(qi.rate_per_box, qi.rate_per_sqft, 0) as quoted_rate,
        qi.total_amount,
        COALESCE(lp.vendor_name, qi.brand, 'Local Distributor') as vendor_name,
        lp.vendor_contact,
        lp.actual_purchase_rate,
        COALESCE(lp.purchase_status, 
          CASE 
            WHEN qi.procurement_status = 'Reached to Godown' THEN 'ARRIVED_AT_GODOWN'
            WHEN qi.procurement_status = 'Dispatched' OR qi.procurement_status = 'On the Way' THEN 'AWAITING_DELIVERY'
            ELSE 'PO_RAISED'
          END
        ) as purchase_status,
        lp.invoice_number,
        COALESCE(lp.expected_date, qi.expected_dispatch_date) as expected_date,
        lp.notes as purchase_notes,
        qi.procurement_notes,
        qi.item_image
      FROM quotation_items qi
      JOIN quotations q ON q.id = qi.quotation_id
      LEFT JOIN local_purchases lp ON lp.quotation_item_id = qi.id
      WHERE qi.dispatch_status = 'Need to Arrange from Local'
        AND COALESCE(qi.procurement_status, '') != 'Reached to Godown'
        AND LOWER(q.status) IN ('closed', 'approved')
      ORDER BY COALESCE(lp.expected_date, qi.expected_dispatch_date, qi.id) ASC`
    );

    res.json({ success: true, count: rows.length, items: rows });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update local purchase item status or details
dispatchRouter.patch('/local-tracker/:id', async (req: Request, res: Response) => {
  try {
    const itemId = parseInt(req.params.id as string, 10);
    const { vendor_name, vendor_contact, actual_purchase_rate, invoice_number, expected_date, purchase_status, notes } = req.body;

    const itemRows = await query('SELECT * FROM quotation_items WHERE id = $1', [itemId]);
    if (itemRows.length === 0) {
      res.status(404).json({ error: 'Line item not found' });
      return;
    }
    const item = itemRows[0];

    const markArrived = purchase_status === 'ARRIVED_AT_GODOWN';

    await withTransaction(async (client) => {
      // Upsert local_purchases
      await client.query(
        `INSERT INTO local_purchases (
          quotation_item_id, quotation_id, vendor_name, vendor_contact, required_quantity,
          quoted_rate, actual_purchase_rate, purchase_status, invoice_number, expected_date,
          completed_date, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (id) DO UPDATE
        SET vendor_name = COALESCE($3, local_purchases.vendor_name),
            vendor_contact = COALESCE($4, local_purchases.vendor_contact),
            actual_purchase_rate = COALESCE($7, local_purchases.actual_purchase_rate),
            purchase_status = COALESCE($8, local_purchases.purchase_status),
            invoice_number = COALESCE($9, local_purchases.invoice_number),
            expected_date = COALESCE($10, local_purchases.expected_date),
            completed_date = CASE WHEN $8 = 'ARRIVED_AT_GODOWN' THEN CURRENT_TIMESTAMP ELSE local_purchases.completed_date END,
            notes = COALESCE($12, local_purchases.notes),
            updated_at = CURRENT_TIMESTAMP`,
        [
          itemId,
          item.quotation_id,
          vendor_name || 'Local Distributor',
          vendor_contact || null,
          item.quantity_boxes || item.quantity_sqft || 1,
          item.rate_per_box || item.rate_per_sqft || 0,
          actual_purchase_rate || null,
          purchase_status || 'PO_RAISED',
          invoice_number || null,
          expected_date || null,
          markArrived ? new Date() : null,
          notes || null,
        ]
      );

      if (markArrived) {
        await client.query(
          `UPDATE quotation_items
           SET dispatch_status = 'Ready Stock',
               procurement_status = 'Reached to Godown',
               procurement_updated_at = CURRENT_TIMESTAMP,
               procurement_updated_by_name = $1
           WHERE id = $2`,
          [req.user!.full_name, itemId]
        );
      } else {
        await client.query(
          `UPDATE quotation_items
           SET procurement_status = CASE 
                 WHEN $1 = 'AWAITING_DELIVERY' THEN 'On the Way'
                 ELSE 'Availability Confirmed'
               END,
               expected_dispatch_date = COALESCE($2, expected_dispatch_date),
               procurement_updated_at = CURRENT_TIMESTAMP,
               procurement_updated_by_name = $3
           WHERE id = $4`,
          [purchase_status, expected_date || null, req.user!.full_name, itemId]
        );
      }
    });

    broadcast({
      type: 'item_status:changed',
      payload: { quotation_id: item.quotation_id, quotation_item_id: itemId, status: markArrived ? 'Ready Stock' : purchase_status },
    });

    res.json({ success: true, message: markArrived ? 'Item received at Godown and marked Ready Stock!' : 'Local purchase tracker updated!' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 7. FACTORY ORDER TRACKING (Direct factory manufacturing & container tracking)
dispatchRouter.get('/factory-tracker', async (req: Request, res: Response) => {
  try {
    const rows = await query(
      `SELECT 
        qi.id as quotation_item_id,
        qi.quotation_id,
        q.quotation_number,
        q.customer_name,
        q.customer_phone,
        q.site_location,
        qi.description,
        qi.brand,
        qi.size,
        qi.product_type,
        COALESCE(qi.quantity_boxes, qi.quantity_sqft, 1) as required_quantity,
        COALESCE(fo.factory_name, qi.brand, 'Factory Plant') as factory_name,
        fo.brand_name,
        fo.batch_shade_code,
        fo.lr_number,
        fo.transporter_name,
        fo.truck_number,
        fo.order_date,
        COALESCE(fo.eta_date, qi.expected_dispatch_date) as eta_date,
        fo.total_pallets,
        fo.freight_cost,
        COALESCE(fo.status, 
          CASE 
            WHEN qi.procurement_status = 'Reached to Godown' THEN 'UNLOADED'
            WHEN qi.procurement_status = 'Dispatched' OR qi.procurement_status = 'On the Way' THEN 'IN_TRANSIT'
            ELSE 'ORDER_PLACED'
          END
        ) as status,
        fo.notes as factory_notes,
        qi.procurement_notes,
        qi.item_image
      FROM quotation_items qi
      JOIN quotations q ON q.id = qi.quotation_id
      LEFT JOIN factory_orders fo ON fo.quotation_item_id = qi.id
      WHERE qi.dispatch_status = 'Factory Order'
        AND COALESCE(qi.procurement_status, '') != 'Reached to Godown'
        AND LOWER(q.status) IN ('closed', 'approved')
      ORDER BY COALESCE(fo.eta_date, qi.expected_dispatch_date, qi.id) ASC`
    );

    res.json({ success: true, count: rows.length, orders: rows });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update factory order item tracking
dispatchRouter.patch('/factory-tracker/:id', async (req: Request, res: Response) => {
  try {
    const itemId = parseInt(req.params.id as string, 10);
    const { factory_name, batch_shade_code, lr_number, transporter_name, truck_number, eta_date, status, freight_cost, total_pallets, notes } = req.body;

    const itemRows = await query('SELECT * FROM quotation_items WHERE id = $1', [itemId]);
    if (itemRows.length === 0) {
      res.status(404).json({ error: 'Line item not found' });
      return;
    }
    const item = itemRows[0];
    const markUnloaded = status === 'UNLOADED';

    await withTransaction(async (client) => {
      // Upsert factory_orders
      await client.query(
        `INSERT INTO factory_orders (
          quotation_item_id, quotation_id, factory_name, brand_name, batch_shade_code,
          lr_number, transporter_name, truck_number, eta_date, unloaded_date, status,
          freight_cost, total_pallets, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        ON CONFLICT (id) DO UPDATE
        SET factory_name = COALESCE($3, factory_orders.factory_name),
            batch_shade_code = COALESCE($5, factory_orders.batch_shade_code),
            lr_number = COALESCE($6, factory_orders.lr_number),
            transporter_name = COALESCE($7, factory_orders.transporter_name),
            truck_number = COALESCE($8, factory_orders.truck_number),
            eta_date = COALESCE($9, factory_orders.eta_date),
            unloaded_date = CASE WHEN $11 = 'UNLOADED' THEN CURRENT_TIMESTAMP ELSE factory_orders.unloaded_date END,
            status = COALESCE($11, factory_orders.status),
            freight_cost = COALESCE($12, factory_orders.freight_cost),
            total_pallets = COALESCE($13, factory_orders.total_pallets),
            notes = COALESCE($14, factory_orders.notes),
            updated_at = CURRENT_TIMESTAMP`,
        [
          itemId,
          item.quotation_id,
          factory_name || 'Factory Plant',
          item.brand || 'Factory',
          batch_shade_code || null,
          lr_number || null,
          transporter_name || null,
          truck_number || null,
          eta_date || null,
          markUnloaded ? new Date() : null,
          status || 'ORDER_PLACED',
          freight_cost || 0,
          total_pallets || 0,
          notes || null,
        ]
      );

      if (markUnloaded) {
        await client.query(
          `UPDATE quotation_items
           SET dispatch_status = 'Ready Stock',
               procurement_status = 'Reached to Godown',
               procurement_updated_at = CURRENT_TIMESTAMP,
               procurement_updated_by_name = $1
           WHERE id = $2`,
          [req.user!.full_name, itemId]
        );
      } else {
        await client.query(
          `UPDATE quotation_items
           SET procurement_status = CASE 
                 WHEN $1 = 'IN_TRANSIT' THEN 'On the Way'
                 ELSE 'Availability Confirmed'
               END,
               expected_dispatch_date = COALESCE($2, expected_dispatch_date),
               procurement_updated_at = CURRENT_TIMESTAMP,
               procurement_updated_by_name = $3
           WHERE id = $4`,
          [status, eta_date || null, req.user!.full_name, itemId]
        );
      }
    });

    broadcast({
      type: 'item_status:changed',
      payload: { quotation_id: item.quotation_id, quotation_item_id: itemId, status: markUnloaded ? 'Ready Stock' : status },
    });

    res.json({ success: true, message: markUnloaded ? 'Factory shipment unloaded and marked Ready Stock!' : 'Factory order tracking updated!' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 8. CLIENT PAYMENT TRACKING & DISPATCH SAFETY GATE
dispatchRouter.get('/payment-tracking', async (req: Request, res: Response) => {
  try {
    const userRole = (req.user?.role || '').toLowerCase();
    const isSalesperson = userRole === 'salesperson';
    const userFilter = isSalesperson ? 'AND q.sales_person_id = $1' : '';
    const userParams = isSalesperson ? [req.user!.id] : [];

    const rows = await query(
      `SELECT 
        q.id as quotation_id,
        q.quotation_number,
        q.customer_name,
        q.customer_phone,
        q.site_location,
        q.sales_person_name,
        q.net_total,
        COALESCE(q.dispatch_status, 'Yet to Update') as dispatch_status,
        COALESCE(p_pay.verified_paid, 0) as verified_paid,
        COALESCE(p_pay.unverified_paid, 0) as unverified_paid,
        COALESCE(p_pay.total_recorded, 0) as total_recorded,
        GREATEST(0, q.net_total - COALESCE(p_pay.verified_paid, 0)) as balance_due,
        CASE 
          WHEN COALESCE(p_pay.verified_paid, 0) >= q.net_total - 0.5 THEN 'CLEARED'
          WHEN COALESCE(p_pay.verified_paid, 0) > 0 THEN 'PARTIAL'
          ELSE 'PENDING'
        END as payment_clearance_status,
        CASE 
          WHEN COALESCE(p_pay.verified_paid, 0) < q.net_total - 0.5 THEN true
          ELSE false
        END as has_shortfall,
        GREATEST(0, q.net_total - COALESCE(p_pay.verified_paid, 0)) as shortfall_amount,
        COALESCE(p_pay.payment_modes, 'None') as payment_modes,
        COALESCE(p_pay.receipt_count, 0) as receipt_count
      FROM quotations q
      LEFT JOIN (
        SELECT 
          quotation_id,
          SUM(CASE WHEN status IN ('Cleared', 'Verified') THEN amount ELSE 0 END) as verified_paid,
          SUM(CASE WHEN status = 'Recorded' THEN amount ELSE 0 END) as unverified_paid,
          SUM(amount) as total_recorded,
          STRING_AGG(DISTINCT payment_mode, ', ') as payment_modes,
          COUNT(*) as receipt_count
        FROM payments
        GROUP BY quotation_id
      ) p_pay ON p_pay.quotation_id = q.id
      WHERE LOWER(q.status) IN ('closed', 'approved')
        ${userFilter}
      ORDER BY q.id DESC`,
      userParams
    );

    res.json({ success: true, count: rows.length, ledgers: rows });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 9. LOCAL PURCHASE HISTORY (Historical audit of completed local procurement)
dispatchRouter.get('/local-history', async (req: Request, res: Response) => {
  try {
    const rows = await query(
      `SELECT 
        qi.id as quotation_item_id,
        qi.quotation_id,
        q.quotation_number,
        q.customer_name,
        qi.description,
        qi.brand,
        qi.size,
        COALESCE(qi.quantity_boxes, qi.quantity_sqft, 1) as quantity,
        COALESCE(qi.rate_per_box, qi.rate_per_sqft, 0) as quoted_rate,
        COALESCE(lp.actual_purchase_rate, qi.rate_per_box, 0) as actual_purchase_rate,
        (COALESCE(qi.rate_per_box, qi.rate_per_sqft, 0) - COALESCE(lp.actual_purchase_rate, qi.rate_per_box, 0)) as variance_per_unit,
        ROUND((COALESCE(qi.rate_per_box, qi.rate_per_sqft, 0) - COALESCE(lp.actual_purchase_rate, qi.rate_per_box, 0)) * COALESCE(qi.quantity_boxes, qi.quantity_sqft, 1), 2) as total_margin_variance,
        COALESCE(lp.vendor_name, qi.brand, 'Local Distributor') as vendor_name,
        lp.invoice_number,
        COALESCE(lp.completed_date, qi.procurement_updated_at, qi.updated_at) as delivery_date,
        COALESCE(lp.purchase_status, 'ARRIVED_AT_GODOWN') as purchase_status,
        lp.notes
      FROM quotation_items qi
      JOIN quotations q ON q.id = qi.quotation_id
      LEFT JOIN local_purchases lp ON lp.quotation_item_id = qi.id
      WHERE (qi.procurement_status = 'Reached to Godown' OR qi.dispatch_status = 'Dispatched' OR lp.purchase_status = 'ARRIVED_AT_GODOWN')
        AND (lp.id IS NOT NULL OR qi.dispatch_status IN ('Need to Arrange from Local', 'Dispatched'))
      ORDER BY COALESCE(lp.completed_date, qi.procurement_updated_at) DESC LIMIT 200`
    );

    res.json({ success: true, count: rows.length, history: rows });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 10. FACTORY ORDER HISTORY (Historical audit of completed factory shipments)
dispatchRouter.get('/factory-history', async (req: Request, res: Response) => {
  try {
    const rows = await query(
      `SELECT 
        qi.id as quotation_item_id,
        qi.quotation_id,
        q.quotation_number,
        q.customer_name,
        qi.description,
        qi.brand,
        qi.size,
        COALESCE(qi.quantity_boxes, qi.quantity_sqft, 1) as quantity,
        COALESCE(fo.factory_name, qi.brand, 'Factory Plant') as factory_name,
        fo.brand_name,
        fo.batch_shade_code,
        fo.lr_number,
        fo.transporter_name,
        fo.truck_number,
        fo.order_date,
        fo.eta_date,
        COALESCE(fo.unloaded_date, qi.procurement_updated_at, qi.updated_at) as unloaded_date,
        fo.total_pallets,
        fo.freight_cost,
        fo.notes
      FROM quotation_items qi
      JOIN quotations q ON q.id = qi.quotation_id
      LEFT JOIN factory_orders fo ON fo.quotation_item_id = qi.id
      WHERE (qi.procurement_status = 'Reached to Godown' OR qi.dispatch_status = 'Dispatched' OR fo.status = 'UNLOADED')
        AND (fo.id IS NOT NULL OR qi.dispatch_status IN ('Factory Order', 'Dispatched'))
      ORDER BY COALESCE(fo.unloaded_date, qi.procurement_updated_at) DESC LIMIT 200`
    );

    res.json({ success: true, count: rows.length, history: rows });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 11. REPORTS (Aggregated analytics across date ranges)
dispatchRouter.get('/reports', async (req: Request, res: Response) => {
  try {
    const { range = 'this_month', from_date, to_date } = req.query;

    let dateCondition = "q.updated_at >= CURRENT_DATE - INTERVAL '30 days'";
    if (range === 'today') {
      dateCondition = 'q.updated_at::date = CURRENT_DATE';
    } else if (range === 'this_week') {
      dateCondition = "q.updated_at >= DATE_TRUNC('week', CURRENT_DATE)";
    } else if (range === 'this_month') {
      dateCondition = "q.updated_at >= DATE_TRUNC('month', CURRENT_DATE)";
    } else if (range === 'custom' && from_date && to_date) {
      dateCondition = `q.updated_at::date BETWEEN '${from_date}' AND '${to_date}'`;
    }

    // 1. Dispatch summary
    const dispSummary = await query(
      `SELECT 
        COUNT(CASE WHEN q.dispatch_status = 'Dispatched' THEN 1 END) as completed_orders,
        COUNT(CASE WHEN q.dispatch_status != 'Dispatched' THEN 1 END) as pending_orders,
        SUM(CASE WHEN q.dispatch_status = 'Dispatched' THEN q.net_total ELSE 0 END) as delivered_value,
        SUM(CASE WHEN q.dispatch_status != 'Dispatched' THEN q.net_total ELSE 0 END) as pending_backlog_value,
        COALESCE(SUM(qi.dispatched_quantity), 0) as total_boxes_delivered
      FROM quotations q
      LEFT JOIN quotation_items qi ON qi.quotation_id = q.id
      WHERE LOWER(q.status) IN ('closed', 'approved') AND ${dateCondition}`
    );

    // 2. Local purchase summary
    const localSummary = await query(
      `SELECT 
        COUNT(*) as total_local_items,
        SUM(COALESCE(qi.total_amount, 0)) as total_local_quoted_spend,
        SUM(COALESCE(lp.actual_purchase_rate, qi.rate_per_box, 0) * COALESCE(qi.quantity_boxes, 1)) as total_actual_spend,
        COUNT(CASE WHEN qi.procurement_status = 'Reached to Godown' THEN 1 END) as items_arrived
      FROM quotation_items qi
      JOIN quotations q ON q.id = qi.quotation_id
      LEFT JOIN local_purchases lp ON lp.quotation_item_id = qi.id
      WHERE qi.dispatch_status = 'Need to Arrange from Local' AND ${dateCondition}`
    );

    // 3. Factory orders summary
    const factorySummary = await query(
      `SELECT 
        COUNT(*) as total_factory_items,
        SUM(COALESCE(qi.quantity_boxes, qi.quantity_sqft, 0)) as total_factory_volume,
        SUM(COALESCE(fo.freight_cost, 0)) as total_freight_cost,
        COUNT(CASE WHEN qi.procurement_status = 'Reached to Godown' THEN 1 END) as factory_unloaded
      FROM quotation_items qi
      JOIN quotations q ON q.id = qi.quotation_id
      LEFT JOIN factory_orders fo ON fo.quotation_item_id = qi.id
      WHERE qi.dispatch_status = 'Factory Order' AND ${dateCondition}`
    );

    res.json({
      success: true,
      range,
      dispatch: dispSummary[0] || {},
      local: localSummary[0] || {},
      factory: factorySummary[0] || {},
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 12. OFFICIAL DELIVERY CHALLAN PDF GENERATOR
dispatchRouter.get('/challan/:id/pdf', async (req: Request, res: Response) => {
  try {
    const qId = parseInt(req.params.id as string, 10);
    const quoteRows = await query(
      `SELECT q.*, 
              COALESCE(q.delivery_address, q.site_location, 'Customer Destination Site') as delivery_site,
              dr.dispatch_number,
              COALESCE(dr.challan_number, q.delivery_challan_number, 'DC-2026-' || LPAD(q.id::TEXT, 4, '0')) as challan_number,
              dr.vehicle_no,
              dr.driver_name,
              dr.driver_phone,
              COALESCE(dr.completed_date, q.dispatched_at, CURRENT_TIMESTAMP) as dispatch_time,
              COALESCE(dr.dispatched_by_name, q.dispatched_by_name, 'Warehouse Dispatcher') as dispatched_by_name
       FROM quotations q
       LEFT JOIN (
         SELECT DISTINCT ON (quotation_id) *
         FROM dispatch_records
         ORDER BY quotation_id, id DESC
       ) dr ON dr.quotation_id = q.id
       WHERE q.id = $1`,
      [qId]
    );

    if (quoteRows.length === 0) {
      res.status(404).send('Quotation not found');
      return;
    }
    const q = quoteRows[0];

    const itemRows = await query(
      `SELECT qi.*, qa.area_name
       FROM quotation_items qi
       LEFT JOIN quotation_areas qa ON qa.id = qi.area_id
       WHERE qi.quotation_id = $1
       ORDER BY qa.display_order ASC NULLS LAST, qi.id ASC`,
      [qId]
    );

    const compRows = await query('SELECT * FROM company_settings LIMIT 1');
    const comp = compRows[0] || { company_name: 'AMA CERAMICS PVT LTD', address_line1: 'Whitefield, Bengaluru', phone: '+91 96637 73871', gstin: '29ABCDE1234F1Z5' };

    const doc = new PDFDocument({ margin: 36, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="Challan_${q.challan_number}.pdf"`);
    doc.pipe(res);

    // Header bar
    doc.rect(36, 36, 523, 60).fill('#1E293B');
    doc.fontSize(16).font('Helvetica-Bold').fillColor('#FFFFFF').text(comp.company_name.toUpperCase(), 50, 48);
    doc.fontSize(8.5).font('Helvetica').fillColor('#94A3B8').text(comp.tagline || 'Commercial Quotation & Dispatch Management', 50, 68);
    doc.fontSize(8.5).fillColor('#E2E8F0').text(`GSTIN: ${comp.gstin || '-'} | Phone: ${comp.phone || '-'}`, 50, 80);

    // Title banner
    doc.rect(36, 104, 523, 24).fill('#E2E8F0');
    doc.fontSize(11).font('Helvetica-Bold').fillColor('#0F172A').text('OFFICIAL DELIVERY CHALLAN / GOODS DISPATCH NOTE', 50, 110, { align: 'center', width: 495 });

    // Meta box
    doc.rect(36, 136, 523, 75).stroke('#CBD5E1');
    doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#334155');
    doc.text(`Challan No: ${q.challan_number}`, 46, 144);
    doc.text(`Quotation Ref: ${q.quotation_number}`, 46, 158);
    doc.text(`Dispatch Date: ${new Date(q.dispatch_time).toLocaleDateString('en-IN')}`, 46, 172);
    doc.text(`Vehicle No: ${q.vehicle_no || 'Standard Commercial'}`, 46, 186);

    doc.text(`Customer: ${q.customer_name}`, 310, 144);
    doc.text(`Contact: ${q.customer_phone || '-'}`, 310, 158);
    doc.text(`Driver / Phone: ${q.driver_name || '-'} (${q.driver_phone || '-'})`, 310, 172);
    doc.text(`Delivery Site: ${(q.delivery_site || '').substring(0, 35)}`, 310, 186);

    // Table Header
    let y = 222;
    doc.rect(36, y, 523, 20).fill('#3B82F6');
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#FFFFFF');
    doc.text('Sl.', 44, y + 6, { width: 25, align: 'center' });
    doc.text('Item Description', 74, y + 6, { width: 200 });
    doc.text('Brand / Size', 278, y + 6, { width: 95 });
    doc.text('Ordered Qty', 377, y + 6, { width: 60, align: 'right' });
    doc.text('Dispatched Qty', 441, y + 6, { width: 60, align: 'right' });
    doc.text('Status', 505, y + 6, { width: 50, align: 'center' });

    y += 20;
    let totalDeliveredBoxes = 0;

    itemRows.forEach((it: any, idx: number) => {
      const rowH = 18;
      doc.rect(36, y, 523, rowH).stroke('#E2E8F0');
      doc.fontSize(7.5).font('Helvetica').fillColor('#1E293B');

      const ord = parseFloat(it.quantity_boxes || it.quantity_sqft || 1);
      const disp = parseFloat(it.dispatched_quantity || ord);
      totalDeliveredBoxes += disp;

      doc.text(String(idx + 1), 44, y + 5, { width: 25, align: 'center' });
      doc.text(it.description || '-', 74, y + 5, { width: 200, ellipsis: true });
      doc.text(`${it.brand || '-'} / ${it.size || '-'}`, 278, y + 5, { width: 95, ellipsis: true });
      doc.text(`${ord.toFixed(0)} ${it.product_type || 'boxes'}`, 377, y + 5, { width: 60, align: 'right' });
      doc.text(`${disp.toFixed(0)} ${it.product_type || 'boxes'}`, 441, y + 5, { width: 60, align: 'right' });
      doc.text(it.dispatch_status || 'Ready', 505, y + 5, { width: 50, align: 'center' });

      y += rowH;
    });

    // Summary row
    doc.rect(36, y, 523, 20).fill('#F1F5F9');
    doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#0F172A');
    doc.text('TOTAL DISPATCHED UNITS:', 250, y + 6);
    doc.text(`${totalDeliveredBoxes.toFixed(0)} Boxes / Units`, 441, y + 6, { width: 60, align: 'right' });
    y += 40;

    // Terms & Signatures
    doc.fontSize(7.5).font('Helvetica').fillColor('#64748B');
    doc.text('Declaration: Received the above-listed materials in good order and condition with verified quantities.', 36, y);
    y += 45;

    // Signature boxes
    doc.rect(50, y, 180, 50).stroke('#CBD5E1');
    doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#475569').text('DISPATCHED BY (GODOWN SUPERVISOR)', 60, y + 8);
    doc.font('Helvetica').text(`Name: ${q.dispatched_by_name}`, 60, y + 26);
    doc.text('Signature & Stamp: _______________', 60, y + 38);

    doc.rect(330, y, 180, 50).stroke('#CBD5E1');
    doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#475569').text('RECEIVED BY (CUSTOMER / SITE AGENT)', 340, y + 8);
    doc.font('Helvetica').text(`Customer: ${q.customer_name}`, 340, y + 26);
    doc.text('Signature & Date: _________________', 340, y + 38);

    doc.end();
  } catch (error: any) {
    res.status(500).send('Error generating Delivery Challan: ' + error.message);
  }
});
