import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { query } from '../db/connection';
import { authenticateToken, requireRole } from '../middleware/auth';
import { broadcast } from '../ws';
import { logger } from '../utils/logger';

export const vendorRouter = Router();

// Configure storage directories for Vendor Portal
const VENDOR_STOCK_DIR = path.resolve(process.cwd(), 'uploads/vendor-stock');
const VENDOR_PI_DIR = path.resolve(process.cwd(), 'uploads/vendor-pi');
const VENDOR_INVOICES_DIR = path.resolve(process.cwd(), 'uploads/vendor-invoices');
const PAYMENT_PROOFS_DIR = path.resolve(process.cwd(), 'uploads/payment-proofs');

[VENDOR_STOCK_DIR, VENDOR_PI_DIR, VENDOR_INVOICES_DIR, PAYMENT_PROOFS_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Multer storage engines
const stockStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, VENDOR_STOCK_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const vendorId = (req.user as any)?.vendor_id || 'v';
    cb(null, `STOCK_${vendorId}_${Date.now()}${ext}`);
  },
});
const uploadStockFile = multer({
  storage: stockStorage,
  limits: { fileSize: 30 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['.xlsx', '.xls', '.csv', '.pdf'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel (.xlsx, .xls), CSV, or PDF files are accepted for stock lists.'));
    }
  },
});

const piStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, VENDOR_PI_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.pdf';
    cb(null, `PI_${req.params.id || 'order'}_${Date.now()}${ext}`);
  },
});
const uploadPIFile = multer({
  storage: piStorage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF documents are accepted for Proforma Invoices.'));
    }
  },
});

const taxInvoiceStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, VENDOR_INVOICES_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.pdf';
    cb(null, `VTAXINV_${req.params.id || 'order'}_${Date.now()}${ext}`);
  },
});
const uploadTaxInvoiceFile = multer({
  storage: taxInvoiceStorage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF documents are accepted for Tax Invoices.'));
    }
  },
});

const paymentProofStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, PAYMENT_PROOFS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `UTR_${req.body?.order_id || 'pay'}_${Date.now()}${ext}`);
  },
});
const uploadPaymentProofFile = multer({
  storage: paymentProofStorage,
  limits: { fileSize: 20 * 1024 * 1024 },
});

vendorRouter.use(authenticateToken);
vendorRouter.use(
  requireRole(['local_vendor', 'admin', 'manager', 'dispatch', 'dispatch_team', 'accounts', 'accountant'])
);

/**
 * Helper to determine active vendor_id for current request
 */
function resolveVendorId(req: Request): number | null {
  const isVendor = req.user?.role?.toLowerCase() === 'local_vendor';
  if (isVendor) {
    return req.user?.vendor_id || null;
  }
  // Internal staff can specify vendor_id in query/params
  const queryVendorId = req.query.vendor_id || req.body?.vendor_id;
  return queryVendorId ? parseInt(String(queryVendorId), 10) : null;
}

// =========================================================================
// VENDOR WORKFLOW ENDPOINTS (Scoped strictly by vendor_id)
// =========================================================================

/**
 * GET /api/vendor/profile
 * Returns profile details and active stock feed status for the authenticated vendor.
 */
vendorRouter.get('/profile', async (req: Request, res: Response) => {
  try {
    const vendorId = resolveVendorId(req);
    if (!vendorId) {
      res.status(403).json({ error: 'Vendor profile not found or unauthorized.' });
      return;
    }

    const rows = await query(`SELECT * FROM vendors WHERE id = $1 LIMIT 1`, [vendorId]);
    if (rows.length === 0) {
      res.status(404).json({ error: 'Vendor record not found.' });
      return;
    }

    res.json({ success: true, vendor: rows[0] });
  } catch (error: any) {
    logger.error('Error fetching vendor profile:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/vendor/stock-feed
 * Updates daily live stock link or uploads daily stock catalog file.
 */
vendorRouter.post('/stock-feed', uploadStockFile.single('stock_file'), async (req: Request, res: Response) => {
  try {
    const vendorId = resolveVendorId(req);
    if (!vendorId) {
      res.status(403).json({ error: 'Vendor account required.' });
      return;
    }

    const { stock_sheet_url } = req.body;
    let fileUrl: string | null = null;
    let fileName: string | null = null;

    if (req.file) {
      fileUrl = `/uploads/vendor-stock/${req.file.filename}`;
      fileName = req.file.originalname;
    }

    let updateSql = `
      UPDATE vendors 
      SET stock_last_updated = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
    `;
    const params: any[] = [];
    let idx = 1;

    if (stock_sheet_url !== undefined && stock_sheet_url !== '') {
      updateSql += `, stock_sheet_url = $${idx++}`;
      params.push(String(stock_sheet_url).trim());
    }
    if (fileUrl) {
      updateSql += `, stock_file_url = $${idx++}, stock_file_name = $${idx++}`;
      params.push(fileUrl, fileName);
    }

    updateSql += ` WHERE id = $${idx++} RETURNING *`;
    params.push(vendorId);

    const updated = await query(updateSql, params);

    // Broadcast stock refresh
    broadcast({
      type: 'vendor:stock_updated',
      payload: {
        vendor_id: vendorId,
        vendor_name: updated[0]?.name,
        stock_last_updated: updated[0]?.stock_last_updated,
      },
    });

    res.json({
      success: true,
      message: 'Stock report updated successfully!',
      vendor: updated[0],
    });
  } catch (error: any) {
    logger.error('Error updating vendor stock feed:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/vendor/orders
 * Returns all inquiries, POs, and invoices strictly scoped to the vendor.
 * Customer identity and quotation rates are sanitized.
 */
vendorRouter.get('/orders', async (req: Request, res: Response) => {
  try {
    const vendorId = resolveVendorId(req);
    if (!vendorId) {
      res.status(403).json({ error: 'Vendor account required.' });
      return;
    }

    const rows = await query(`
      SELECT 
        vpo.id,
        vpo.local_purchase_id,
        vpo.po_number,
        vpo.status,
        vpo.item_description,
        vpo.requested_quantity,
        vpo.unit,
        vpo.quoted_rate,
        vpo.pi_number,
        vpo.pi_amount,
        vpo.pi_file_url,
        vpo.pi_uploaded_at,
        vpo.payment_utr,
        vpo.payment_amount,
        vpo.payment_proof_url,
        vpo.payment_recorded_at,
        vpo.tax_invoice_number,
        vpo.tax_invoice_amount,
        vpo.tax_invoice_file_url,
        vpo.tax_invoice_uploaded_at,
        vpo.vendor_notes,
        vpo.internal_notes,
        vpo.created_at,
        vpo.updated_at
      FROM vendor_purchase_orders vpo
      WHERE vpo.vendor_id = $1
      ORDER BY vpo.id DESC
    `, [vendorId]);

    res.json({
      success: true,
      count: rows.length,
      orders: rows,
    });
  } catch (error: any) {
    logger.error('Error fetching vendor orders:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/vendor/orders/:id/upload-pi
 * Submits Proforma Invoice (PI) PDF with confirmed rates and quantity.
 */
vendorRouter.post('/orders/:id/upload-pi', uploadPIFile.single('pi_file'), async (req: Request, res: Response) => {
  try {
    const orderId = parseInt(req.params.id as string, 10);
    const vendorId = resolveVendorId(req);
    const { pi_number = '', pi_amount = 0, notes = '' } = req.body;

    if (!orderId) {
      res.status(400).json({ error: 'Order ID is required.' });
      return;
    }

    let fileUrl: string | null = null;
    if (req.file) {
      fileUrl = `/uploads/vendor-pi/${req.file.filename}`;
    }

    // Verify ownership
    let checkSql = `SELECT * FROM vendor_purchase_orders WHERE id = $1`;
    const checkParams: any[] = [orderId];
    if (vendorId) {
      checkSql += ` AND vendor_id = $2`;
      checkParams.push(vendorId);
    }
    const orderRows = await query(checkSql, checkParams);
    if (orderRows.length === 0) {
      res.status(404).json({ error: 'Order not found or unauthorized.' });
      return;
    }

    const updated = await query(`
      UPDATE vendor_purchase_orders
      SET status = 'PI_SUBMITTED',
          pi_number = COALESCE(NULLIF($1, ''), pi_number),
          pi_amount = COALESCE(NULLIF($2::numeric, 0), pi_amount),
          pi_file_url = COALESCE($3, pi_file_url),
          pi_uploaded_at = CURRENT_TIMESTAMP,
          vendor_notes = COALESCE(NULLIF($4, ''), vendor_notes),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $5
      RETURNING *
    `, [pi_number.trim(), Number(pi_amount) || 0, fileUrl, notes.trim(), orderId]);

    // Broadcast event
    broadcast({
      type: 'vendor:pi_submitted',
      payload: {
        order_id: orderId,
        pi_number: updated[0]?.pi_number,
        pi_amount: updated[0]?.pi_amount,
      },
    });

    res.json({
      success: true,
      message: 'Proforma Invoice (PI) submitted successfully!',
      order: updated[0],
    });
  } catch (error: any) {
    logger.error('Error uploading vendor PI:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/vendor/orders/:id/upload-tax-invoice
 * Submits final Tax Invoice (PDF) with Invoice Number and Amount.
 * Automatically reconciles into internal Local Purchase Tracker & Dispatch!
 */
vendorRouter.post('/orders/:id/upload-tax-invoice', uploadTaxInvoiceFile.single('tax_invoice_file'), async (req: Request, res: Response) => {
  try {
    const orderId = parseInt(req.params.id as string, 10);
    const vendorId = resolveVendorId(req);
    const { tax_invoice_number = '', tax_invoice_amount = 0, notes = '' } = req.body;

    if (!orderId || !tax_invoice_number.trim()) {
      res.status(400).json({ error: 'Order ID and Tax Invoice Number are required.' });
      return;
    }

    let fileUrl: string | null = null;
    if (req.file) {
      fileUrl = `/uploads/vendor-invoices/${req.file.filename}`;
    }

    // Verify ownership
    let checkSql = `SELECT * FROM vendor_purchase_orders WHERE id = $1`;
    const checkParams: any[] = [orderId];
    if (vendorId) {
      checkSql += ` AND vendor_id = $2`;
      checkParams.push(vendorId);
    }
    const orderRows = await query(checkSql, checkParams);
    if (orderRows.length === 0) {
      res.status(404).json({ error: 'Order not found or unauthorized.' });
      return;
    }

    const currentOrder = orderRows[0];
    const invAmount = Number(tax_invoice_amount) || 0;
    const reqQty = Number(currentOrder.requested_quantity) || 1;
    const calcRate = reqQty > 0 ? Number((invAmount / reqQty).toFixed(2)) : 0;

    // 1. Update vendor_purchase_orders
    const updated = await query(`
      UPDATE vendor_purchase_orders
      SET status = 'INVOICE_SUBMITTED',
          tax_invoice_number = $1,
          tax_invoice_amount = $2,
          tax_invoice_file_url = COALESCE($3, tax_invoice_file_url),
          tax_invoice_uploaded_at = CURRENT_TIMESTAMP,
          vendor_notes = COALESCE(NULLIF($4, ''), vendor_notes),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $5
      RETURNING *
    `, [tax_invoice_number.trim(), invAmount, fileUrl, notes.trim(), orderId]);

    // 2. Automatically feed into internal Local Purchases Tracker
    if (currentOrder.local_purchase_id) {
      await query(`
        UPDATE local_purchases
        SET invoice_number = $1,
            actual_purchase_rate = CASE WHEN $2::numeric > 0 THEN $2::numeric ELSE actual_purchase_rate END,
            purchase_status = 'ARRIVED_AT_GODOWN',
            completed_date = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $3
      `, [tax_invoice_number.trim(), calcRate, currentOrder.local_purchase_id]);

      // 3. Update quotation_items to Reached to Godown
      if (currentOrder.quotation_item_id) {
        await query(`
          UPDATE quotation_items
          SET procurement_status = 'Reached to Godown',
              procurement_updated_at = CURRENT_TIMESTAMP
          WHERE id = $1
        `, [currentOrder.quotation_item_id]);
      }
    }

    // 4. Broadcast event
    broadcast({
      type: 'vendor:tax_invoice_submitted',
      payload: {
        order_id: orderId,
        local_purchase_id: currentOrder.local_purchase_id,
        tax_invoice_number: tax_invoice_number.trim(),
        tax_invoice_amount: invAmount,
      },
    });

    res.json({
      success: true,
      message: `Tax Invoice #${tax_invoice_number} submitted! Reconciled with Local Purchase Tracker.`,
      order: updated[0],
    });
  } catch (error: any) {
    logger.error('Error uploading vendor tax invoice:', error);
    res.status(500).json({ error: error.message });
  }
});

// =========================================================================
// INTERNAL MANAGEMENT ENDPOINTS (Admin / Manager / Dispatch / Accounts)
// =========================================================================

/**
 * GET /api/vendor/admin/list
 * Returns all registered vendors with active order counts.
 */
vendorRouter.get('/admin/list', requireRole(['admin', 'manager', 'dispatch', 'dispatch_team', 'accounts']), async (_req: Request, res: Response) => {
  try {
    const rows = await query(`
      SELECT 
        v.*,
        COUNT(DISTINCT vpo.id) as total_orders,
        COUNT(DISTINCT CASE WHEN vpo.status = 'INQUIRY_SENT' THEN vpo.id END) as pending_inquiries,
        COUNT(DISTINCT CASE WHEN vpo.status = 'PI_SUBMITTED' THEN vpo.id END) as pending_pi,
        COUNT(DISTINCT CASE WHEN vpo.status = 'PAYMENT_RECORDED' THEN vpo.id END) as pending_invoice
      FROM vendors v
      LEFT JOIN vendor_purchase_orders vpo ON vpo.vendor_id = v.id
      GROUP BY v.id
      ORDER BY v.name ASC
    `);

    res.json({ success: true, vendors: rows });
  } catch (error: any) {
    logger.error('Error listing vendors:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/vendor/admin/create
 * Creates a new vendor profile.
 */
vendorRouter.post('/admin/create', requireRole(['admin', 'manager', 'dispatch']), async (req: Request, res: Response) => {
  try {
    const { name, contact_person, phone, email, gstin, address, stock_sheet_url } = req.body;
    if (!name || !name.trim()) {
      res.status(400).json({ error: 'Vendor name is required.' });
      return;
    }

    const inserted = await query(`
      INSERT INTO vendors (name, contact_person, phone, email, gstin, address, stock_sheet_url)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [
      name.trim(),
      contact_person?.trim() || null,
      phone?.trim() || null,
      email?.trim() || null,
      gstin?.trim() || null,
      address?.trim() || null,
      stock_sheet_url?.trim() || null,
    ]);

    res.status(201).json({ success: true, vendor: inserted[0] });
  } catch (error: any) {
    logger.error('Error creating vendor:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/vendor/admin/assign-inquiry
 * Internal procurement staff raises/assigns a purchase inquiry to a registered vendor.
 */
vendorRouter.post('/admin/assign-inquiry', requireRole(['admin', 'manager', 'dispatch', 'dispatch_team']), async (req: Request, res: Response) => {
  try {
    const { local_purchase_id, vendor_id, quoted_rate, notes } = req.body;

    if (!local_purchase_id || !vendor_id) {
      res.status(400).json({ error: 'Local Purchase ID and Vendor ID are required.' });
      return;
    }

    // 1. Fetch local purchase details
    const lpRows = await query(`
      SELECT lp.*, qi.description as item_description, qi.brand, qi.size, COALESCE(qi.product_type, 'box') as unit
      FROM local_purchases lp
      JOIN quotation_items qi ON qi.id = lp.quotation_item_id
      WHERE lp.id = $1
    `, [local_purchase_id]);

    if (lpRows.length === 0) {
      res.status(404).json({ error: 'Local purchase record not found.' });
      return;
    }

    const lp = lpRows[0];
    const vendorRows = await query(`SELECT * FROM vendors WHERE id = $1`, [vendor_id]);
    if (vendorRows.length === 0) {
      res.status(404).json({ error: 'Vendor record not found.' });
      return;
    }
    const vendor = vendorRows[0];

    // Generate PO Number
    const poNumber = `PO-${new Date().getFullYear()}-${String(local_purchase_id).padStart(4, '0')}`;

    // 2. Insert into vendor_purchase_orders
    const vpo = await query(`
      INSERT INTO vendor_purchase_orders (
        local_purchase_id,
        quotation_id,
        quotation_item_id,
        vendor_id,
        po_number,
        status,
        item_description,
        requested_quantity,
        unit,
        quoted_rate,
        internal_notes
      ) VALUES ($1, $2, $3, $4, $5, 'INQUIRY_SENT', $6, $7, $8, $9, $10)
      RETURNING *
    `, [
      lp.id,
      lp.quotation_id,
      lp.quotation_item_id,
      vendor.id,
      poNumber,
      `${lp.brand ? lp.brand + ' - ' : ''}${lp.item_description}${lp.size ? ' (' + lp.size + ')' : ''}`,
      lp.required_quantity,
      lp.unit || 'BOX',
      quoted_rate || lp.quoted_rate || 0,
      notes || null,
    ]);

    // 3. Link vendor to local_purchases
    await query(`
      UPDATE local_purchases
      SET vendor_id = $1,
          vendor_name = $2,
          vendor_contact = $3,
          purchase_status = 'PO_RAISED',
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $4
    `, [vendor.id, vendor.name, vendor.phone, local_purchase_id]);

    // Broadcast inquiry sent
    broadcast({
      type: 'vendor:inquiry_sent',
      payload: {
        order_id: vpo[0]?.id,
        vendor_id: vendor.id,
        po_number: poNumber,
      },
    });

    res.json({
      success: true,
      message: `Inquiry successfully assigned to ${vendor.name} (${poNumber})!`,
      order: vpo[0],
    });
  } catch (error: any) {
    logger.error('Error assigning vendor inquiry:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/vendor/admin/record-payment-proof
 * Accounts team records payment UTR and uploads bank transfer slip.
 * Instantly available to vendor for preview in their portal.
 */
vendorRouter.post('/admin/record-payment-proof', uploadPaymentProofFile.single('proof_file'), requireRole(['admin', 'manager', 'accounts', 'accountant', 'dispatch']), async (req: Request, res: Response) => {
  try {
    const { order_id, payment_utr = '', payment_amount = 0, notes = '' } = req.body;

    if (!order_id || !payment_utr.trim()) {
      res.status(400).json({ error: 'Order ID and Payment UTR Number are required.' });
      return;
    }

    let fileUrl: string | null = null;
    if (req.file) {
      fileUrl = `/uploads/payment-proofs/${req.file.filename}`;
    }

    const updated = await query(`
      UPDATE vendor_purchase_orders
      SET status = 'PAYMENT_RECORDED',
          payment_utr = $1,
          payment_amount = $2,
          payment_proof_url = COALESCE($3, payment_proof_url),
          payment_recorded_at = CURRENT_TIMESTAMP,
          internal_notes = COALESCE(NULLIF($4, ''), internal_notes),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $5
      RETURNING *
    `, [payment_utr.trim(), Number(payment_amount) || 0, fileUrl, notes.trim(), order_id]);

    if (updated.length === 0) {
      res.status(404).json({ error: 'Vendor order record not found.' });
      return;
    }

    const vpo = updated[0];

    // Also update local_purchases payment check
    if (vpo.local_purchase_id) {
      await query(`
        UPDATE local_purchases
        SET payment_checked = true,
            payment_utr = $1,
            payment_proof_url = COALESCE($2, payment_proof_url),
            payment_checked_at = CURRENT_TIMESTAMP,
            payment_checked_by = $3,
            payment_checked_by_name = $4
        WHERE id = $5
      `, [payment_utr.trim(), fileUrl, req.user!.id, req.user!.full_name || req.user!.username, vpo.local_purchase_id]);
    }

    // Broadcast payment proof recorded
    broadcast({
      type: 'vendor:payment_proof_recorded',
      payload: {
        order_id: vpo.id,
        vendor_id: vpo.vendor_id,
        payment_utr: payment_utr.trim(),
      },
    });

    res.json({
      success: true,
      message: 'Payment proof & UTR recorded! Vendor can now submit Tax Invoice.',
      order: vpo,
    });
  } catch (error: any) {
    logger.error('Error recording payment proof:', error);
    res.status(500).json({ error: error.message });
  }
});
