import { Router, Request, Response } from 'express';
import { query } from '../db/connection';
import { authenticateToken, requireRole } from '../middleware/auth';
import { broadcast } from '../ws';
import { logger } from '../utils/logger';

export const godownRouter = Router();

// Apply auth & RBAC: Accessible to godown_coordinator, dispatch, manager, and admin
godownRouter.use(authenticateToken);
godownRouter.use(requireRole(['godown_coordinator', 'admin', 'manager', 'dispatch', 'dispatch_team']));

/**
 * GET /api/godown/pending-verifications
 * Fetches all physical inventory arriving at or awaiting inspection in the godown yard.
 * Sanitized of financial margins, rates, or quotation profit data.
 */
godownRouter.get('/pending-verifications', async (req: Request, res: Response) => {
  try {
    const rows = await query(`
      SELECT 
        qi.id as quotation_item_id,
        qi.quotation_id,
        q.quotation_number,
        q.customer_name,
        q.site_location,
        qi.description,
        qi.brand,
        qi.size,
        COALESCE(qa.area_name, 'General Area') as room_area,
        COALESCE(qi.quantity_boxes, qi.quantity_sqft, 0) as expected_quantity,
        COALESCE(qi.dispatched_quantity, 0) as dispatched_quantity,
        COALESCE(qi.pending_quantity, (COALESCE(qi.quantity_boxes, 0) - COALESCE(qi.dispatched_quantity, 0))) as remaining_quantity,
        COALESCE(qi.product_type, 'box') as unit,
        qi.dispatch_status,
        qi.procurement_status,
        qi.procurement_category,
        COALESCE(qi.godown_cleared, false) as godown_cleared,
        COALESCE(qi.godown_verified_qty, 0) as godown_verified_qty,
        qi.godown_rack_location,
        lp.id as local_purchase_id,
        lp.vendor_name,
        lp.purchase_status as local_purchase_status,
        fo.id as factory_order_id,
        fo.factory_name,
        fo.status as factory_order_status,
        CASE
          WHEN lp.id IS NOT NULL AND lp.purchase_status = 'ARRIVED_AT_GODOWN' THEN 'LOCAL_PURCHASE_ARRIVED'
          WHEN fo.id IS NOT NULL AND fo.status = 'UNLOADED' THEN 'FACTORY_SHIPMENT_UNLOADED'
          WHEN qi.dispatch_status = 'Ready Stock' THEN 'READY_STOCK_INSPECTION'
          ELSE 'PENDING_PHYSICAL_CHECK'
        END as arrival_source_type
      FROM quotation_items qi
      JOIN quotations q ON q.id = qi.quotation_id
      LEFT JOIN quotation_areas qa ON qa.id = qi.area_id
      LEFT JOIN local_purchases lp ON lp.quotation_item_id = qi.id
      LEFT JOIN factory_orders fo ON fo.quotation_item_id = qi.id
      WHERE q.status IN ('approved', 'closed')
        AND COALESCE(qi.godown_cleared, false) = false
        AND (
          qi.dispatch_status = 'Ready Stock'
          OR (lp.id IS NOT NULL AND lp.purchase_status = 'ARRIVED_AT_GODOWN')
          OR (fo.id IS NOT NULL AND fo.status = 'UNLOADED')
        )
      ORDER BY q.id DESC, qi.id ASC
    `);

    res.json({
      success: true,
      count: rows.length,
      items: rows,
    });
  } catch (error: any) {
    logger.error('Error fetching pending godown verifications:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/godown/verify-arrival
 * Records physical inspection of arriving or yard-stocked materials.
 * Updates godown clearance and logs to godown_confirmations.
 */
godownRouter.post('/verify-arrival', async (req: Request, res: Response) => {
  try {
    const {
      quotation_id,
      quotation_item_id,
      local_purchase_id,
      expected_quantity = 0,
      verified_quantity = 0,
      unit = 'BOX',
      rack_location = '',
      batch_number = '',
      notes = '',
    } = req.body;

    if (!quotation_id || !quotation_item_id) {
      res.status(400).json({ error: 'Quotation ID and Quotation Item ID are required.' });
      return;
    }

    const expQty = Number(expected_quantity) || 0;
    const verQty = Number(verified_quantity) || 0;
    const hasDiscrepancy = verQty < expQty;

    // 1. Insert into godown_confirmations audit log
    const confRes = await query(`
      INSERT INTO godown_confirmations (
        quotation_id,
        quotation_item_id,
        local_purchase_id,
        confirmation_type,
        expected_quantity,
        verified_quantity,
        unit,
        rack_location,
        batch_number,
        has_discrepancy,
        notes,
        confirmed_by,
        confirmed_by_name
      ) VALUES ($1, $2, $3, 'STOCK_ARRIVAL', $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `, [
      quotation_id,
      quotation_item_id,
      local_purchase_id || null,
      expQty,
      verQty,
      unit,
      rack_location.trim(),
      batch_number.trim(),
      hasDiscrepancy,
      notes.trim(),
      req.user!.id,
      req.user!.full_name || req.user!.username,
    ]);

    // 2. Mark item as Cleared for Dispatch in godown
    await query(`
      UPDATE quotation_items
      SET godown_cleared = true,
          godown_verified_qty = $1,
          godown_rack_location = $2,
          dispatch_status = CASE 
            WHEN dispatch_status IN ('Need to Arrange from Local', 'Factory Order') THEN 'Ready Stock' 
            ELSE dispatch_status 
          END
      WHERE id = $3
    `, [verQty, rack_location.trim(), quotation_item_id]);

    // 3. If tied to a local purchase, mark it as verified in godown
    if (local_purchase_id) {
      await query(`
        UPDATE local_purchases
        SET godown_verified = true,
            godown_verified_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `, [local_purchase_id]);
    }

    // 4. Notify all connected devices via WebSocket
    broadcast({
      type: 'godown:arrival_verified',
      payload: {
        quotation_id,
        quotation_item_id,
        confirmation: confRes[0],
      },
    });

    res.json({
      success: true,
      message: hasDiscrepancy
        ? `Material verified with discrepancy: ${verQty} / ${expQty} ${unit}. Flagged in godown log.`
        : `Material verified (${verQty} ${unit}) and cleared for loading!`,
      confirmation: confRes[0],
    });
  } catch (error: any) {
    logger.error('Error verifying stock arrival:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/godown/pending-loading
 * Fetches orders with cleared materials ready for vehicle loading check.
 */
godownRouter.get('/pending-loading', async (req: Request, res: Response) => {
  try {
    const rows = await query(`
      SELECT 
        q.id as quotation_id,
        q.quotation_number,
        q.customer_name,
        q.customer_phone,
        q.site_location,
        q.delivery_address,
        COALESCE(q.delivery_challan_number, 'DC-2026-' || LPAD(q.id::TEXT, 4, '0')) as challan_number,
        json_agg(
          json_build_object(
            'quotation_item_id', qi.id,
            'description', qi.description,
            'brand', qi.brand,
            'size', qi.size,
            'quantity_boxes', COALESCE(qi.quantity_boxes, 0),
            'dispatched_quantity', COALESCE(qi.dispatched_quantity, 0),
            'pending_quantity', COALESCE(qi.pending_quantity, (COALESCE(qi.quantity_boxes, 0) - COALESCE(qi.dispatched_quantity, 0))),
            'godown_verified_qty', COALESCE(qi.godown_verified_qty, 0),
            'godown_rack_location', qi.godown_rack_location,
            'godown_cleared', qi.godown_cleared
          ) ORDER BY qi.id ASC
        ) as items
      FROM quotations q
      JOIN quotation_items qi ON qi.quotation_id = q.id
      WHERE q.status IN ('approved', 'closed')
        AND COALESCE(qi.godown_cleared, false) = true
        AND (COALESCE(qi.quantity_boxes, 0) - COALESCE(qi.dispatched_quantity, 0)) > 0
      GROUP BY q.id, q.quotation_number, q.customer_name, q.customer_phone, q.site_location, q.delivery_address, q.delivery_challan_number
      ORDER BY q.id DESC
    `);

    res.json({
      success: true,
      quotations: rows,
    });
  } catch (error: any) {
    logger.error('Error fetching pending loading orders:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/godown/verify-loading
 * Records physical loading onto truck with vehicle and driver contact.
 */
godownRouter.post('/verify-loading', async (req: Request, res: Response) => {
  try {
    const {
      quotation_id,
      items = [],
      vehicle_no = '',
      driver_name = '',
      driver_phone = '',
      notes = '',
    } = req.body;

    if (!quotation_id || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: 'Quotation ID and at least one loaded item are required.' });
      return;
    }

    const recordedConfirmations: any[] = [];

    for (const item of items) {
      const expQty = Number(item.expected_quantity) || 0;
      const loadedQty = Number(item.loaded_quantity) || 0;
      const hasDiscrepancy = loadedQty < expQty;

      const conf = await query(`
        INSERT INTO godown_confirmations (
          quotation_id,
          quotation_item_id,
          confirmation_type,
          expected_quantity,
          verified_quantity,
          unit,
          vehicle_no,
          driver_name,
          driver_phone,
          has_discrepancy,
          notes,
          confirmed_by,
          confirmed_by_name
        ) VALUES ($1, $2, 'PHYSICAL_DISPATCH', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *
      `, [
        quotation_id,
        item.quotation_item_id,
        expQty,
        loadedQty,
        item.unit || 'BOX',
        vehicle_no.trim(),
        driver_name.trim(),
        driver_phone.trim(),
        hasDiscrepancy,
        notes.trim(),
        req.user!.id,
        req.user!.full_name || req.user!.username,
      ]);

      recordedConfirmations.push(conf[0]);
    }

    // Broadcast loading event
    broadcast({
      type: 'godown:loading_verified',
      payload: {
        quotation_id,
        vehicle_no,
        driver_name,
        count: recordedConfirmations.length,
      },
    });

    res.json({
      success: true,
      message: `Loading verified for ${recordedConfirmations.length} item(s) onto vehicle ${vehicle_no || 'Standard Transport'}.`,
      confirmations: recordedConfirmations,
    });
  } catch (error: any) {
    logger.error('Error verifying loading:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/godown/confirmations-log
 * Full audit log of all physical arrival inspections and vehicle loading verifications.
 */
godownRouter.get('/confirmations-log', async (req: Request, res: Response) => {
  try {
    const { type, quotation_id, from_date, to_date, limit = 100, offset = 0 } = req.query;

    let sql = `
      SELECT 
        gc.id,
        gc.quotation_id,
        q.quotation_number,
        q.customer_name,
        q.site_location,
        gc.quotation_item_id,
        qi.description as item_description,
        qi.brand as item_brand,
        qi.size as item_size,
        gc.confirmation_type,
        gc.expected_quantity,
        gc.verified_quantity,
        gc.unit,
        gc.rack_location,
        gc.batch_number,
        gc.vehicle_no,
        gc.driver_name,
        gc.driver_phone,
        gc.has_discrepancy,
        gc.notes,
        gc.confirmed_by_name,
        gc.created_at
      FROM godown_confirmations gc
      JOIN quotations q ON q.id = gc.quotation_id
      JOIN quotation_items qi ON qi.id = gc.quotation_item_id
      WHERE 1=1
    `;
    const params: any[] = [];
    let idx = 1;

    if (type) {
      sql += ` AND gc.confirmation_type = $${idx++}`;
      params.push(type);
    }
    if (quotation_id) {
      sql += ` AND gc.quotation_id = $${idx++}`;
      params.push(quotation_id);
    }
    if (from_date) {
      sql += ` AND gc.created_at >= $${idx++}`;
      params.push(from_date);
    }
    if (to_date) {
      sql += ` AND gc.created_at <= $${idx++}`;
      params.push(to_date);
    }

    sql += ` ORDER BY gc.id DESC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(limit, offset);

    const rows = await query(sql, params);

    res.json({
      success: true,
      count: rows.length,
      logs: rows,
    });
  } catch (error: any) {
    logger.error('Error fetching godown confirmations log:', error);
    res.status(500).json({ error: error.message });
  }
});
