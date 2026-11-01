import { Router, Request, Response } from 'express';
import { query, withTransaction } from '../db/connection';
import { authenticateToken, requireRole } from '../middleware/auth';
import { recordAuditLog } from '../utils/audit';
import { broadcast } from '../ws';

export const dispatchRouter = Router();

// Protect all dispatch routes
dispatchRouter.use(authenticateToken);

const VALID_DISPATCH_STATUSES = [
  'Ready Stock',
  'Need to Arrange from Local',
  'Factory Order',
  'Dispatched',
];

// Helper to normalize status strings
function normalizeStatus(st?: string): string {
  if (!st) return 'Ready Stock';
  const found = VALID_DISPATCH_STATUSES.find(
    (v) => v.toLowerCase() === st.trim().toLowerCase()
  );
  return found || 'Ready Stock';
}

// 1. Get Summary Stats for Dispatch Pipeline
dispatchRouter.get('/stats', async (req: Request, res: Response) => {
  try {
    const ordersCountRes = await query(
      `SELECT 
         count(*) as total_orders,
         COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved_count,
         COUNT(CASE WHEN status = 'closed' THEN 1 END) as closed_count
       FROM quotations WHERE status IN ('approved', 'closed')`
    );
    const countRow = ordersCountRes[0] || {};
    const totalOrders = parseInt(countRow.total_orders || '0', 10);
    const approvedCount = parseInt(countRow.approved_count || '0', 10);
    const closedCount = parseInt(countRow.closed_count || '0', 10);

    const itemsStatsRes = await query(`
      SELECT 
        COUNT(qi.id) as total_items,
        COUNT(CASE WHEN COALESCE(qi.dispatch_status, 'Ready Stock') = 'Ready Stock' THEN 1 END) as ready_stock_count,
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
      WHERE q.status IN ('approved', 'closed')
    `);

    const stats = itemsStatsRes[0] || {};

    res.json({
      total_orders: totalOrders,
      total_closed_quotations: totalOrders,
      approved_count: approvedCount,
      closed_count: closedCount,
      total_items: parseInt(stats.total_items || '0', 10),
      ready_stock_count: parseInt(stats.ready_stock_count || '0', 10),
      local_arrange_count: parseInt(stats.local_arrange_count || '0', 10),
      factory_order_count: parseInt(stats.factory_order_count || '0', 10),
      dispatched_count: parseInt(stats.dispatched_count || '0', 10),
      overdue_count: parseInt(stats.overdue_count || '0', 10),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 2. Get All Approved & Closed Quotations for Dispatch Management
dispatchRouter.get('/quotations', async (req: Request, res: Response) => {
  try {
    const { search, dispatch_status, filter_date, quotation_status } = req.query;

    const conditions: string[] = [];
    const params: any[] = [];
    let pIdx = 1;

    if (quotation_status === 'approved') {
      conditions.push(`q.status = 'approved'`);
    } else if (quotation_status === 'closed') {
      conditions.push(`q.status = 'closed'`);
    } else {
      conditions.push(`q.status IN ('approved', 'closed')`);
    }

    if (search && typeof search === 'string' && search.trim()) {
      conditions.push(
        `(q.quotation_number ILIKE $${pIdx} OR q.customer_name ILIKE $${pIdx} OR q.customer_phone ILIKE $${pIdx} OR q.project_name ILIKE $${pIdx} OR q.site_location ILIKE $${pIdx})`
      );
      params.push(`%${search.trim()}%`);
      pIdx++;
    }

    if (dispatch_status && typeof dispatch_status === 'string' && dispatch_status !== 'all') {
      conditions.push(`COALESCE(q.dispatch_status, 'Ready Stock') = $${pIdx}`);
      params.push(normalizeStatus(dispatch_status));
      pIdx++;
    }

    if (filter_date === 'today') {
      conditions.push(`q.expected_dispatch_date = CURRENT_DATE`);
    } else if (filter_date === 'this_week') {
      conditions.push(
        `q.expected_dispatch_date >= CURRENT_DATE AND q.expected_dispatch_date <= CURRENT_DATE + INTERVAL '7 days'`
      );
    } else if (filter_date === 'overdue') {
      conditions.push(
        `q.expected_dispatch_date < CURRENT_DATE AND COALESCE(q.dispatch_status, 'Ready Stock') != 'Dispatched'`
      );
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
        q.sales_person_name,
        q.approved_by_id,
        u_app.full_name as approved_by_name,
        q.approved_at,
        q.gross_total,
        q.net_total,
        q.version,
        q.updated_at,
        COALESCE(q.dispatch_status, 'Ready Stock') as dispatch_status,
        q.expected_dispatch_date,
        q.dispatch_notes,
        q.dispatched_at,
        q.dispatched_by_name,
        COUNT(qi.id) as total_items,
        COUNT(CASE WHEN qi.dispatch_status = 'Dispatched' THEN 1 END) as dispatched_items_count,
        COUNT(CASE WHEN COALESCE(qi.dispatch_status, 'Ready Stock') = 'Ready Stock' THEN 1 END) as ready_stock_items_count,
        COUNT(CASE WHEN qi.dispatch_status = 'Need to Arrange from Local' THEN 1 END) as local_arrange_items_count,
        COUNT(CASE WHEN qi.dispatch_status = 'Factory Order' THEN 1 END) as factory_order_items_count
      FROM quotations q
      LEFT JOIN users u_app ON u_app.id = q.approved_by_id
      LEFT JOIN quotation_items qi ON qi.quotation_id = q.id
      ${whereClause}
      GROUP BY q.id, u_app.full_name
      ORDER BY 
        CASE WHEN q.expected_dispatch_date IS NULL THEN 1 ELSE 0 END ASC,
        q.expected_dispatch_date ASC,
        q.id DESC
    `;

    const rows = await query(sql, params);

    const quotations = rows.map((r: any) => ({
      ...r,
      total_items: parseInt(r.total_items || '0', 10),
      dispatched_items_count: parseInt(r.dispatched_items_count || '0', 10),
      ready_stock_items_count: parseInt(r.ready_stock_items_count || '0', 10),
      local_arrange_items_count: parseInt(r.local_arrange_items_count || '0', 10),
      factory_order_items_count: parseInt(r.factory_order_items_count || '0', 10),
    }));

    res.json({ quotations });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 3. Get Single Closed Quotation with Area & Item Details for Dispatch
dispatchRouter.get('/quotations/:id', async (req: Request, res: Response) => {
  try {
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
    if (!['approved', 'closed'].includes(quotation.status?.toLowerCase())) {
      res.status(400).json({
        error: `Quotation ${quotation.quotation_number} is in '${quotation.status}' status. Only approved or closed quotations are managed in the Dispatch module.`,
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
        COALESCE(qi.dispatch_status, 'Ready Stock') as dispatch_status,
        COALESCE(qi.expected_dispatch_date, q.expected_dispatch_date) as expected_dispatch_date,
        qi.dispatch_notes,
        qi.dispatched_at
       FROM quotation_items qi
       JOIN quotation_areas qa ON qa.id = qi.area_id
       WHERE qi.quotation_id = $1
       ORDER BY qa.display_order ASC, qi.sl_no ASC, qi.id ASC`,
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
        dispatch_status: quotation.dispatch_status || 'Ready Stock',
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
  requireRole(['admin', 'manager', 'dispatch', 'dispatch_team']),
  async (req: Request, res: Response) => {
    try {
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
      if (!['approved', 'closed'].includes(qCheck[0].status?.toLowerCase())) {
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

            await client.query(
              `UPDATE quotation_items
               SET dispatch_status = $1,
                   expected_dispatch_date = $2,
                   dispatch_notes = $3,
                   dispatched_at = CASE WHEN $1 = 'Dispatched' THEN COALESCE(dispatched_at, CURRENT_TIMESTAMP) ELSE NULL END
               WHERE id = $4 AND quotation_id = $5`,
              [itStatus, itDate, it.dispatch_notes || null, it.id, id]
            );
          }
        }

        // 2. Compute aggregate quotation dispatch status if not explicitly overridden
        let finalQuotationStatus = normalizedOverallStatus;
        if (!finalQuotationStatus) {
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

          if (total > 0 && dispatched === total) {
            finalQuotationStatus = 'Dispatched';
          } else if (factory > 0) {
            finalQuotationStatus = 'Factory Order';
          } else if (local > 0) {
            finalQuotationStatus = 'Need to Arrange from Local';
          } else {
            finalQuotationStatus = 'Ready Stock';
          }
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
               expected_dispatch_date = COALESCE($2, expected_dispatch_date),
               dispatch_notes = COALESCE($3, dispatch_notes),
               dispatched_by_id = $4,
               dispatched_by_name = $5,
               dispatched_at = CASE WHEN $6::boolean THEN COALESCE(dispatched_at, CURRENT_TIMESTAMP) ELSE NULL END,
               status = CASE WHEN $6::boolean AND status = 'approved' THEN 'closed' ELSE status END,
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

      // Broadcast WebSocket notification to keep all client dashboards in sync
      broadcast({
        type: 'DISPATCH_UPDATED',
        payload: {
          quotation_id: id,
          quotation_number: qCheck[0].quotation_number,
          updated_by: req.user!.full_name,
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
