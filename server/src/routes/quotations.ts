import { Router, Request, Response } from 'express';
import { query, withTransaction } from '../db/connection';
import { authenticateToken, optionalAuthenticateToken, requireRole } from '../middleware/auth';
import { generateNextQuotationNumber } from '../utils/quotationNumber';
import { generateQuotationPdf } from '../utils/pdfGenerator';
import { recordAuditLog } from '../utils/audit';
import { broadcast } from '../ws';
import { calculateQuotationDiscountAndTotals, isCeraBrand } from '../utils/discountCalculator';
import { getOrSaveEncryptedProductCodes } from '../utils/encryptedCode';

export const quotationsRouter = Router();

// Stream PDF Quotation (accessible directly via browser tab, print window, or download with optional token)
quotationsRouter.get('/:id/pdf', optionalAuthenticateToken, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    const isEncrypted = req.query.encrypted === 'true' || req.query.encrypted === '1';

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

    // Salespersons can only view/export/print their own approved or closed quotations
    if (req.user?.role?.toLowerCase() === 'salesperson') {
      if (quotation.sales_person_id !== req.user.id && quotation.assisted_sales_person_id !== req.user.id) {
        res.status(403).json({
          error: 'Access denied: Salespersons can only view, export, and print their own quotations.',
        });
        return;
      }
      if (!['approved', 'closed'].includes(quotation.status?.toLowerCase())) {
        res.status(403).json({
          error: 'Quotation is awaiting Store Manager approval. PDF export and printing will be unlocked once approved.',
        });
        return;
      }
    }
    const areas = await query(
      'SELECT * FROM quotation_areas WHERE quotation_id = $1 ORDER BY display_order ASC',
      [id]
    );
    const items = await query(
      'SELECT * FROM quotation_items WHERE quotation_id = $1 ORDER BY sl_no ASC',
      [id]
    );
    const companyRows = await query('SELECT * FROM company_settings LIMIT 1');
    const company = companyRows[0] || {};

    let encryptedMap = new Map<string, string>();
    if (isEncrypted) {
      const allNames: string[] = [];
      for (const it of items) {
        if (it.description) allNames.push(it.description);
        if (quotation.quotation_type === 'sanitary') {
          if (it.item_code) allNames.push(it.item_code);
          if (it.size) allNames.push(it.size);
        }
      }
      encryptedMap = await getOrSaveEncryptedProductCodes(allNames);

      // Persist any resolved codes back to quotation_items if not set
      for (const it of items) {
        const code = encryptedMap.get((it.description || '').trim());
        if (code && !it.encrypted_code) {
          query('UPDATE quotation_items SET encrypted_code = $1 WHERE id = $2', [code, it.id]).catch(() => {});
        }
      }
    }

    const areasWithItems = (areas || []).map((a) => ({
      ...a,
      items: (items || []).filter((it) => it.area_id === a.id),
    }));

    const doc = generateQuotationPdf({
      quotation,
      areas: areasWithItems,
      company: {
        ...company,
        terms_json: company.terms_json
          ? (typeof company.terms_json === 'string' ? JSON.parse(company.terms_json) : company.terms_json)
          : [],
      },
      encrypted: isEncrypted,
      encryptedMap,
    });

    const filename = isEncrypted
      ? `Quotation_${quotation.quotation_number}_Encrypted.pdf`
      : `Quotation_${quotation.quotation_number}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${filename}"`
    );

    doc.pipe(res);
    doc.end();
  } catch (error: any) {
    console.error('Error generating quotation PDF:', error);
    res.status(500).json({ error: error.message });
  }
});

quotationsRouter.use(authenticateToken);

// 1. Paginated Quotation List with Server-side Filtering and Debounced Search
quotationsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 20));
    const offset = (page - 1) * limit;

    const search = (req.query.search as string || '').trim();
    const status = (req.query.status as string || '').trim();
    const quotationType = (req.query.quotation_type as string || '').trim().toLowerCase();
    const salesPersonId = req.query.sales_person_id ? parseInt(req.query.sales_person_id as string, 10) : null;
    const startDate = req.query.start_date as string;
    const endDate = req.query.end_date as string;

    const whereClauses: string[] = ['1=1'];
    const params: any[] = [];
    let idx = 1;

    if (quotationType === 'tiles' || quotationType === 'sanitary') {
      whereClauses.push(`q.quotation_type = $${idx++}`);
      params.push(quotationType);
    }

    // Role-based scoping: Salespersons see quotations where they are primary or assisted
    const isSalesperson = req.user?.role?.toLowerCase() === 'salesperson';
    if (isSalesperson) {
      whereClauses.push(`(q.sales_person_id = $${idx} OR q.assisted_sales_person_id = $${idx})`);
      params.push(req.user!.id);
      idx++;
    } else if (salesPersonId) {
      whereClauses.push(`(q.sales_person_id = $${idx} OR q.assisted_sales_person_id = $${idx})`);
      params.push(salesPersonId);
      idx++;
    }

    if (status) {
      const st = status.toLowerCase();
      if (st === 'not_closed' || st === 'open') {
        whereClauses.push(`q.status IN ('draft', 'in_review', 'approved')`);
      } else {
        whereClauses.push(`q.status = $${idx++}`);
        params.push(status);
      }
    }

    if (search) {
      whereClauses.push(
        `(q.quotation_number ILIKE $${idx} OR q.customer_name ILIKE $${idx} OR q.customer_phone ILIKE $${idx} OR q.project_name ILIKE $${idx} OR q.assisted_sales_person_name ILIKE $${idx})`
      );
      params.push(`%${search}%`);
      idx++;
    }

    if (startDate) {
      whereClauses.push(`q.quotation_date >= $${idx++}`);
      params.push(startDate);
    }

    if (endDate) {
      whereClauses.push(`q.quotation_date <= $${idx++}`);
      params.push(endDate);
    }

    const whereSql = whereClauses.join(' AND ');

    // Total count and aggregate total (split-aware when filtering by salesperson)
    const targetSpId = isSalesperson ? req.user!.id : (salesPersonId || null);
    const countAmountExpr = targetSpId
      ? `COALESCE(SUM(
          CASE
            WHEN q.sales_person_id = ${targetSpId} THEN
              CASE
                WHEN q.assisted_sales_person_id IS NOT NULL AND q.primary_sales_share_amount > 0 THEN q.primary_sales_share_amount
                WHEN q.assisted_sales_person_id IS NOT NULL AND q.primary_sales_share_percent > 0 THEN ROUND((q.net_total * q.primary_sales_share_percent / 100.0)::numeric, 2)
                ELSE q.net_total
              END
            WHEN q.assisted_sales_person_id = ${targetSpId} THEN
              CASE
                WHEN q.assisted_sales_share_amount > 0 THEN q.assisted_sales_share_amount
                WHEN q.assisted_sales_share_percent > 0 THEN ROUND((q.net_total * q.assisted_sales_share_percent / 100.0)::numeric, 2)
                ELSE 0
              END
            ELSE q.net_total
          END
        ), 0)`
      : `COALESCE(SUM(q.net_total), 0)`;

    const countQuery = `
      SELECT count(*) as total_count, ${countAmountExpr} as total_amount
      FROM quotations q
      WHERE ${whereSql}
    `;
    const countRes = await query<{ total_count: string; total_amount: string }>(countQuery, params);
    const totalCount = parseInt(countRes[0].total_count, 10);
    const totalAmount = parseFloat(countRes[0].total_amount);

    // Paginated records with payments received summary
    const dataQuery = `
      SELECT
        q.id,
        q.quotation_number,
        q.quotation_date,
        q.customer_id,
        q.customer_name,
        q.customer_phone,
        q.sales_person_id,
        q.sales_person_name,
        q.assisted_sales_person_id,
        q.assisted_sales_person_name,
        q.split_share_type,
        q.primary_sales_share_percent,
        q.primary_sales_share_amount,
        q.assisted_sales_share_percent,
        q.assisted_sales_share_amount,
        q.project_name,
        q.quotation_type,
        q.status,
        q.approved_by_id,
        u_app.full_name as approved_by_name,
        q.approved_at,
        q.manager_approval_note,
        q.gross_total,
        q.discount_amount,
        q.net_total,
        q.version,
        q.created_at,
        COALESCE(p.total_paid, 0) as total_paid,
        (q.net_total - COALESCE(p.total_paid, 0)) as balance_due
      FROM quotations q
      LEFT JOIN users u_app ON u_app.id = q.approved_by_id
      LEFT JOIN (
        SELECT quotation_id, SUM(amount) as total_paid
        FROM payments
        WHERE status = 'Cleared'
        GROUP BY quotation_id
      ) p ON p.quotation_id = q.id
      WHERE ${whereSql}
      ORDER BY q.quotation_date DESC, q.id DESC
      LIMIT $${idx} OFFSET $${idx + 1}
    `;

    params.push(limit, offset);
    const rows = await query(dataQuery, params);

    res.json({
      quotations: rows,
      pagination: {
        page,
        limit,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
      summary: {
        totalQuotations: totalCount,
        totalAmount,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 2. Get Single Quotation with Areas, Items, and Payment History
quotationsRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);

    const qRows = await query(
      `SELECT q.*,
              u.full_name as approved_by_name,
              COALESCE(p.total_paid, 0) as total_paid,
              (q.net_total - COALESCE(p.total_paid, 0)) as balance_due
       FROM quotations q
       LEFT JOIN users u ON u.id = q.approved_by_id
       LEFT JOIN (
         SELECT quotation_id, SUM(amount) as total_paid
         FROM payments WHERE status = 'Cleared' GROUP BY quotation_id
       ) p ON p.quotation_id = q.id
       WHERE q.id = $1`,
      [id]
    );

    if (qRows.length === 0) {
      res.status(404).json({ error: 'Quotation not found' });
      return;
    }

    const quotation = qRows[0];

    // Enforce role scope: allow if salesperson is primary OR assisted
    if (
      req.user?.role?.toLowerCase() === 'salesperson' &&
      quotation.sales_person_id !== req.user!.id &&
      quotation.assisted_sales_person_id !== req.user!.id
    ) {
      res.status(403).json({ error: 'Access denied to this quotation' });
      return;
    }

    // Fetch Areas
    const areas = await query(
      `SELECT * FROM quotation_areas WHERE quotation_id = $1 ORDER BY display_order ASC, id ASC`,
      [id]
    );

    // Fetch Items with persistent encrypted_code
    const items = await query(
      `SELECT qi.*, COALESCE(qi.encrypted_code, pec.encrypted_code) as encrypted_code
       FROM quotation_items qi
       LEFT JOIN product_encrypted_codes pec ON pec.normalized_name = LOWER(TRIM(qi.description))
       WHERE qi.quotation_id = $1
       ORDER BY qi.sl_no ASC, qi.id ASC`,
      [id]
    );

    // Group items into areas
    const areaMap = areas.map((a) => ({
      ...a,
      items: items.filter((it) => it.area_id === a.id),
    }));

    // Fetch Payments
    const payments = await query(
      `SELECT p.*, u.full_name as recorded_by_name
       FROM payments p
       LEFT JOIN users u ON u.id = p.recorded_by_id
       WHERE p.quotation_id = $1
       ORDER BY p.payment_date DESC, p.id DESC`,
      [id]
    );

    res.json({
      quotation,
      areas: areaMap,
      payments,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Helper: Calculate Totals on Server with CERA-excluded direct item rate discount
function calculateTotals(items: any[], discountPercent: number, discountAmount: number, taxType: string, quotationType?: string) {
  return calculateQuotationDiscountAndTotals(items, discountAmount, discountPercent, taxType, quotationType);
}

// Helper: Archive full quotation version snapshot for historical version viewing & rollback
async function archiveQuotationVersion(
  client: any,
  quotationId: number,
  versionNumber: number,
  editedById: number | null,
  editedByName: string | null,
  revisionSummary: string,
  customHeader?: any
) {
  let qHeader = customHeader;
  if (!qHeader || !qHeader.approved_by_name || !qHeader.sales_person_name) {
    const qRes = await client.query(
      `SELECT q.*, u_app.full_name as approved_by_name, u_sales.full_name as sales_person_name
       FROM quotations q
       LEFT JOIN users u_app ON u_app.id = q.approved_by_id
       LEFT JOIN users u_sales ON u_sales.id = q.sales_person_id
       WHERE q.id = $1`,
      [quotationId]
    );
    if (qRes.rows.length > 0) {
      qHeader = {
        ...qRes.rows[0],
        ...(customHeader || {}),
        approved_by_name: (customHeader && customHeader.approved_by_name) || qRes.rows[0].approved_by_name,
        sales_person_name: (customHeader && customHeader.sales_person_name) || qRes.rows[0].sales_person_name,
      };
    }
  }
  if (!qHeader) return;

  const aRes = await client.query(
    'SELECT * FROM quotation_areas WHERE quotation_id = $1 ORDER BY display_order ASC',
    [quotationId]
  );
  const iRes = await client.query(
    'SELECT * FROM quotation_items WHERE quotation_id = $1 ORDER BY sl_no ASC',
    [quotationId]
  );

  const areasWithItems = (aRes.rows || []).map((a: any) => ({
    ...a,
    items: (iRes.rows || []).filter((it: any) => it.area_id === a.id),
  }));

  const snapshot = {
    quotation: qHeader,
    areas: areasWithItems,
  };

  await client.query(
    `INSERT INTO quotation_versions (
      quotation_id, version_number, edited_by_id, edited_by_name, revision_summary,
      snapshot_data, gross_total, discount_percent, discount_amount, taxable_amount,
      net_total, status, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP)
    ON CONFLICT (quotation_id, version_number) DO UPDATE SET
      edited_by_id = EXCLUDED.edited_by_id,
      edited_by_name = EXCLUDED.edited_by_name,
      revision_summary = EXCLUDED.revision_summary,
      snapshot_data = EXCLUDED.snapshot_data,
      gross_total = EXCLUDED.gross_total,
      discount_percent = EXCLUDED.discount_percent,
      discount_amount = EXCLUDED.discount_amount,
      taxable_amount = EXCLUDED.taxable_amount,
      net_total = EXCLUDED.net_total,
      status = EXCLUDED.status,
      created_at = CURRENT_TIMESTAMP`,
    [
      quotationId,
      versionNumber,
      editedById,
      editedByName,
      revisionSummary,
      JSON.stringify(snapshot),
      parseFloat(qHeader.gross_total) || 0,
      parseFloat(qHeader.discount_percent) || 0,
      parseFloat(qHeader.discount_amount) || 0,
      parseFloat(qHeader.taxable_amount) || 0,
      parseFloat(qHeader.net_total) || 0,
      qHeader.status || 'draft',
    ]
  );
}

// 3. Create Quotation (Transactional)
quotationsRouter.post('/', async (req: Request, res: Response) => {
  try {
    const {
      quotation_type = 'tiles',
      quotation_date,
      customer_id,
      customer_name,
      customer_phone,
      customer_gstin,
      delivery_address,
      site_location,
      project_name,
      status: reqStatus,
      special_notes,
      discount_percent,
      discount_amount,
      tax_type = 'cgst_sgst',
      assisted_sales_person_id,
      assisted_sales_person_name,
      split_share_type = 'percentage',
      primary_sales_share_percent,
      primary_sales_share_amount,
      assisted_sales_share_percent,
      assisted_sales_share_amount,
      areas = [],
    } = req.body;

    if (!customer_name || !customer_phone) {
      res.status(400).json({ error: 'Customer name and phone number are required' });
      return;
    }

    const qType = quotation_type === 'sanitary' ? 'sanitary' : 'tiles';

    const allItems: any[] = [];
    areas.forEach((a: any) => {
      if (Array.isArray(a.items)) {
        a.items.forEach((it: any) => allItems.push(it));
      }
    });

    const totals = calculateTotals(
      allItems,
      parseFloat(discount_percent) || 0,
      parseFloat(discount_amount) || 0,
      tax_type,
      qType
    );

    const isSalesperson = req.user?.role?.toLowerCase() === 'salesperson';
    // Quotations created by salespersons enter review mode pending store manager approval
    const initialStatus = isSalesperson
      ? 'in_review'
      : (reqStatus && ['draft', 'in_review', 'approved', 'closed'].includes(String(reqStatus).toLowerCase())
          ? String(reqStatus).toLowerCase()
          : 'draft');
    const isApprovedOrClosed = !isSalesperson && ['approved', 'closed'].includes(initialStatus);

    const result = await withTransaction(async (client) => {
      const qNumber = await generateNextQuotationNumber(client);

      // Compute Sales Split Shares
      let finalAssistedId: number | null = null;
      let finalAssistedName: string | null = null;
      let finalSplitType: string | null = null;
      let primaryPct = 100.0;
      let primaryAmt = totals.netTotal;
      let assistedPct = 0.0;
      let assistedAmt = 0.0;

      if (assisted_sales_person_id) {
        finalAssistedId = parseInt(assisted_sales_person_id, 10);
        const assistedUser = await client.query('SELECT full_name FROM users WHERE id = $1', [finalAssistedId]);
        finalAssistedName = assistedUser.rows[0]?.full_name || assisted_sales_person_name || 'Assisted Salesperson';
        finalSplitType = split_share_type === 'amount' ? 'amount' : 'percentage';

        if (finalSplitType === 'amount') {
          assistedAmt = Math.min(totals.netTotal, Math.max(0, parseFloat(assisted_sales_share_amount) || 0));
          primaryAmt = Math.max(0, parseFloat((totals.netTotal - assistedAmt).toFixed(2)));
          primaryPct = totals.netTotal > 0 ? parseFloat(((primaryAmt / totals.netTotal) * 100).toFixed(2)) : 100;
          assistedPct = totals.netTotal > 0 ? parseFloat(((assistedAmt / totals.netTotal) * 100).toFixed(2)) : 0;
        } else {
          assistedPct = Math.min(100, Math.max(0, parseFloat(assisted_sales_share_percent) || 0));
          primaryPct = parseFloat((100 - assistedPct).toFixed(2));
          primaryAmt = parseFloat(((totals.netTotal * primaryPct) / 100).toFixed(2));
          assistedAmt = parseFloat((totals.netTotal - primaryAmt).toFixed(2));
        }
      }

      const qRes = await client.query(
        `INSERT INTO quotations (
          quotation_number, quotation_date, customer_id, sales_person_id,
          customer_name, customer_phone, customer_gstin, delivery_address, site_location,
          sales_person_name, assisted_sales_person_id, assisted_sales_person_name,
          split_share_type, primary_sales_share_percent, primary_sales_share_amount,
          assisted_sales_share_percent, assisted_sales_share_amount,
          project_name, quotation_type, status, approved_by_id, approved_at, gross_total, discount_percent,
          discount_amount, taxable_amount, tax_type, cgst_rate, cgst_amount,
          sgst_rate, sgst_amount, igst_rate, igst_amount, round_off, net_total,
          special_notes, version
        ) VALUES (
          $1, $2, $3, $4,
          $5, $6, $7, $8, $9,
          $10, $11, $12,
          $13, $14, $15,
          $16, $17,
          $18, $19, $20, $21, $22, $23, $24,
          $25, $26, $27, $28, $29,
          $30, $31, $32, $33, $34, $35,
          $36, 1
        ) RETURNING *`,
        [
          qNumber,
          quotation_date || new Date().toISOString().split('T')[0],
          customer_id || null,
          req.user!.id,
          customer_name.trim(),
          customer_phone.trim(),
          customer_gstin?.trim() || null,
          delivery_address?.trim() || '',
          site_location?.trim() || '',
          req.user!.full_name,
          finalAssistedId,
          finalAssistedName,
          finalSplitType,
          primaryPct,
          primaryAmt,
          assistedPct,
          assistedAmt,
          project_name?.trim() || '',
          qType,
          initialStatus,
          isApprovedOrClosed ? req.user!.id : null,
          isApprovedOrClosed ? new Date() : null,
          totals.grossTotal,
          parseFloat(discount_percent) || 0,
          totals.discountAmount,
          totals.taxableAmount,
          tax_type,
          totals.cgstRate,
          totals.cgstAmount,
          totals.sgstRate,
          totals.sgstAmount,
          totals.igstRate,
          totals.igstAmount,
          totals.roundOff,
          totals.netTotal,
          special_notes || '',
        ]
      );

      const newQ = qRes.rows[0];
      let itemSlNo = 1;

      // Pre-resolve and save encrypted codes for all items
      const allItemNames: string[] = [];
      for (const a of areas) {
        if (Array.isArray(a.items)) {
          for (const it of a.items) {
            const desc = (it.item_description || it.description || '').trim();
            if (desc) allItemNames.push(desc);
          }
        }
      }
      const encryptedCodesMap = await getOrSaveEncryptedProductCodes(allItemNames, (sql, p) => client.query(sql, p).then((r: any) => r.rows));

      for (let i = 0; i < areas.length; i++) {
        const area = areas[i];
        const areaRes = await client.query(
          `INSERT INTO quotation_areas (quotation_id, area_name, display_order)
           VALUES ($1, $2, $3) RETURNING id`,
          [newQ.id, area.area_name || (qType === 'sanitary' ? 'Sanitary Ware' : `Area ${i + 1}`), i + 1]
        );
        const areaId = areaRes.rows[0].id;

        if (Array.isArray(area.items)) {
          for (const item of area.items) {
            let pType = String(item.product_type || (qType === 'sanitary' ? 'nos' : 'box')).toLowerCase();
            const cov = parseFloat(item.coverage_area) || 0;
            let sqft = parseFloat(item.quantity_sqft) || 0;
            let rSqft = parseFloat(item.rate_per_sqft) || 0;
            let boxes = parseFloat(item.quantity !== undefined ? item.quantity : item.quantity_boxes) || 0;
            let rBox = parseFloat(item.discounted_price !== undefined ? item.discounted_price : item.rate_per_box) || 0;
            let total = 0;

            if (qType === 'sanitary') {
              pType = 'nos';
              const mrp = parseFloat(item.mrp_price !== undefined ? item.mrp_price : item.base_rate_per_box) || 0;
              const discPct = parseFloat(item.discount_percent) || 0;
              if (rBox <= 0 && mrp > 0) {
                rBox = parseFloat((mrp * (1 - discPct / 100)).toFixed(2));
              }
              total = parseFloat((boxes * rBox).toFixed(2));
              sqft = 0;
              rSqft = 0;
            } else if (pType === 'sqft') {
              total = parseFloat((sqft * rSqft).toFixed(2));
              boxes = 0;
              rBox = 0;
            } else if (['bags', 'pieces', 'nos'].includes(pType)) {
              total = parseFloat((boxes * rBox).toFixed(2));
              sqft = 0;
              rSqft = 0;
            } else {
              // 'box'
              boxes = cov > 0 ? parseFloat((sqft / cov).toFixed(2)) : boxes;
              rBox = cov > 0 ? parseFloat((rSqft * cov).toFixed(2)) : rBox;
              total = parseFloat((sqft * rSqft).toFixed(2));
            }

            const baseSqft = parseFloat(item.base_rate_per_sqft) || rSqft;
            const baseBox = parseFloat(item.mrp_price !== undefined ? item.mrp_price : item.base_rate_per_box) || rBox;
            const discPct = parseFloat(item.discount_percent) || 0;
            const discAmt = parseFloat(item.discount_amount) || parseFloat((boxes * baseBox - total).toFixed(2));
            const itemCode = item.item_code || (qType === 'sanitary' ? (item.size || null) : null);
            const itemImage = item.item_image || null;
            const mrpPrice = parseFloat(item.mrp_price) || (pType === 'nos' ? baseBox : 0);
            const itemDesc = item.item_description || item.description || (qType === 'sanitary' ? 'Sanitary Item' : 'Vitrified Tile');
            const encCode = encryptedCodesMap.get(itemDesc.trim()) || null;

            await client.query(
              `INSERT INTO quotation_items (
                quotation_id, area_id, sl_no, description, size, brand,
                product_type, coverage_area, quantity_sqft, base_rate_per_sqft, rate_per_sqft,
                quantity_boxes, base_rate_per_box, rate_per_box, discount_percent, discount_amount, total_amount,
                item_code, item_image, mrp_price, encrypted_code
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)`,
              [
                newQ.id,
                areaId,
                itemSlNo++,
                itemDesc,
                item.size || (qType === 'sanitary' ? (itemCode || 'Nos') : 'Standard'),
                item.brand || (qType === 'sanitary' ? 'Sanitary' : 'AMA Collection'),
                pType,
                cov,
                sqft,
                baseSqft,
                rSqft,
                boxes,
                baseBox,
                rBox,
                discPct,
                discAmt,
                total,
                itemCode,
                itemImage,
                mrpPrice,
                encCode,
              ]
            );

            // Automatically record tile item into catalog for future auto-fill memory
            if (qType !== 'sanitary') {
              const desc = (item.item_description || item.description || '').trim();
              if (desc && desc.length > 1) {
                await client.query(
                  `INSERT INTO tile_catalog_items (
                    description, brand, size, product_type, coverage_area,
                    base_rate_per_sqft, rate_per_sqft, base_rate_per_box, rate_per_box,
                    usage_count, last_used_at
                  ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1, CURRENT_TIMESTAMP)
                  ON CONFLICT (description) DO UPDATE SET
                    brand = COALESCE(NULLIF(EXCLUDED.brand, ''), tile_catalog_items.brand),
                    size = COALESCE(NULLIF(EXCLUDED.size, ''), tile_catalog_items.size),
                    product_type = COALESCE(NULLIF(EXCLUDED.product_type, ''), tile_catalog_items.product_type),
                    coverage_area = CASE WHEN EXCLUDED.coverage_area > 0 THEN EXCLUDED.coverage_area ELSE tile_catalog_items.coverage_area END,
                    base_rate_per_sqft = CASE WHEN EXCLUDED.base_rate_per_sqft > 0 THEN EXCLUDED.base_rate_per_sqft ELSE tile_catalog_items.base_rate_per_sqft END,
                    rate_per_sqft = CASE WHEN EXCLUDED.rate_per_sqft > 0 THEN EXCLUDED.rate_per_sqft ELSE tile_catalog_items.rate_per_sqft END,
                    base_rate_per_box = CASE WHEN EXCLUDED.base_rate_per_box > 0 THEN EXCLUDED.base_rate_per_box ELSE tile_catalog_items.base_rate_per_box END,
                    rate_per_box = CASE WHEN EXCLUDED.rate_per_box > 0 THEN EXCLUDED.rate_per_box ELSE tile_catalog_items.rate_per_box END,
                    usage_count = tile_catalog_items.usage_count + 1,
                    last_used_at = CURRENT_TIMESTAMP`,
                  [desc, item.brand || null, item.size || null, pType, cov, baseSqft, rSqft, baseBox, rBox]
                ).catch(() => {});
              }
            }
          }
        }
      }

      await recordAuditLog({
        userId: req.user!.id,
        username: req.user!.username,
        action: 'QUOTATION_CREATED',
        entityType: 'quotation',
        entityId: newQ.id,
        details: { quotation_number: newQ.quotation_number, net_total: newQ.net_total },
        ipAddress: req.ip,
      });

      // Archive initial Version 1 snapshot
      await archiveQuotationVersion(
        client,
        newQ.id,
        1,
        req.user!.id,
        req.user!.full_name,
        'Initial quotation created',
        newQ
      );

      return newQ;
    });

    broadcast({ type: 'QUOTATION_CREATED', payload: { id: result.id, quotation_number: result.quotation_number } });

    res.status(201).json({ quotation: result });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 4. Update Quotation (with Optimistic Concurrency Control)
quotationsRouter.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    const {
      version,
      quotation_type,
      quotation_date,
      customer_id,
      customer_name,
      customer_phone,
      customer_gstin,
      delivery_address,
      site_location,
      project_name,
      status: reqStatus,
      special_notes,
      discount_percent,
      discount_amount,
      tax_type = 'cgst_sgst',
      assisted_sales_person_id,
      assisted_sales_person_name,
      split_share_type = 'percentage',
      primary_sales_share_percent,
      primary_sales_share_amount,
      assisted_sales_share_percent,
      assisted_sales_share_amount,
      areas = [],
    } = req.body;

    if (version === undefined) {
      res.status(400).json({ error: 'Record version is required for safe concurrent updates' });
      return;
    }

    const updated = await withTransaction(async (client) => {
      // Optimistic concurrency check
      const current = await client.query(
        `SELECT version, status, quotation_type, quotation_number, customer_name,
                sales_person_id, assisted_sales_person_id,
                dispatch_status, expected_dispatch_date, dispatched_at, dispatched_by_id, dispatched_by_name,
                has_dispatch_item_changes
         FROM quotations WHERE id = $1`,
        [id]
      );
      if (current.rows.length === 0) {
        throw new Error('Quotation not found');
      }

      if (
        req.user?.role?.toLowerCase() === 'salesperson' &&
        current.rows[0].sales_person_id !== req.user!.id &&
        current.rows[0].assisted_sales_person_id !== req.user!.id
      ) {
        const forbiddenErr: any = new Error('Access denied: You can only edit your own quotations.');
        forbiddenErr.statusCode = 403;
        throw forbiddenErr;
      }

      // Fetch existing items before update to detect changes if dispatch status was previously set
      const existingItemsRes = await client.query(
        `SELECT id, description, size, brand, product_type, quantity_boxes, quantity_sqft
         FROM quotation_items WHERE quotation_id = $1 ORDER BY sl_no ASC`,
        [id]
      );
      const existingItems = existingItemsRes.rows;

      if (current.rows[0].version !== parseInt(version, 10)) {
        const conflictErr: any = new Error(
          'Conflict: This quotation was modified by another user. Please reload the latest changes.'
        );
        conflictErr.statusCode = 409;
        throw conflictErr;
      }

      const qType = (quotation_type || current.rows[0].quotation_type || 'tiles') === 'sanitary' ? 'sanitary' : 'tiles';

      const allItems: any[] = [];
      areas.forEach((a: any) => {
        if (Array.isArray(a.items)) {
          a.items.forEach((it: any) => allItems.push(it));
        }
      });

      const totals = calculateTotals(
        allItems,
        parseFloat(discount_percent) || 0,
        parseFloat(discount_amount) || 0,
        tax_type,
        qType
      );

      // Compute Sales Split Shares
      let finalAssistedId: number | null = null;
      let finalAssistedName: string | null = null;
      let finalSplitType: string | null = null;
      let primaryPct = 100.0;
      let primaryAmt = totals.netTotal;
      let assistedPct = 0.0;
      let assistedAmt = 0.0;

      if (assisted_sales_person_id) {
        finalAssistedId = parseInt(assisted_sales_person_id, 10);
        const assistedUser = await client.query('SELECT full_name FROM users WHERE id = $1', [finalAssistedId]);
        finalAssistedName = assistedUser.rows[0]?.full_name || assisted_sales_person_name || 'Assisted Salesperson';
        finalSplitType = split_share_type === 'amount' ? 'amount' : 'percentage';

        if (finalSplitType === 'amount') {
          assistedAmt = Math.min(totals.netTotal, Math.max(0, parseFloat(assisted_sales_share_amount) || 0));
          primaryAmt = Math.max(0, parseFloat((totals.netTotal - assistedAmt).toFixed(2)));
          primaryPct = totals.netTotal > 0 ? parseFloat(((primaryAmt / totals.netTotal) * 100).toFixed(2)) : 100;
          assistedPct = totals.netTotal > 0 ? parseFloat(((assistedAmt / totals.netTotal) * 100).toFixed(2)) : 0;
        } else {
          assistedPct = Math.min(100, Math.max(0, parseFloat(assisted_sales_share_percent) || 0));
          primaryPct = parseFloat((100 - assistedPct).toFixed(2));
          primaryAmt = parseFloat(((totals.netTotal * primaryPct) / 100).toFixed(2));
          assistedAmt = parseFloat((totals.netTotal - primaryAmt).toFixed(2));
        }
      }

      const isSalesperson = req.user?.role?.toLowerCase() === 'salesperson';
      // If edited by a salesperson, reset status to 'in_review' requiring Store Manager re-approval
      let nextStatus = current.rows[0].status;
      if (isSalesperson) {
        nextStatus = 'in_review';
      } else if (reqStatus && ['draft', 'in_review', 'approved', 'closed', 'rejected'].includes(String(reqStatus).toLowerCase())) {
        nextStatus = String(reqStatus).toLowerCase();
      }
      const isNextApproved = !isSalesperson && ['approved', 'closed'].includes(nextStatus);

      // Ensure the previous version state is permanently archived BEFORE modifying quotation header and areas
      const nextVersion = current.rows[0].version + 1;
      const prevArchived = await client.query(
        'SELECT id FROM quotation_versions WHERE quotation_id = $1 AND version_number = $2',
        [id, current.rows[0].version]
      );
      if (prevArchived.rows.length === 0) {
        await archiveQuotationVersion(
          client,
          id,
          current.rows[0].version,
          current.rows[0].sales_person_id || req.user!.id,
          current.rows[0].sales_person_name || req.user!.full_name,
          `Version ${current.rows[0].version} snapshot before revision ${nextVersion}`,
          current.rows[0]
        );
      }

      // Detect if items changed after the dispatch guy had updated material availability or dates
      const wasDispatchConfigured = Boolean(
        current.rows[0].dispatched_by_id ||
        current.rows[0].expected_dispatch_date ||
        current.rows[0].dispatched_at ||
        (current.rows[0].dispatch_status && current.rows[0].dispatch_status !== 'Ready Stock')
      );

      const itemDiffs: string[] = [];
      if (existingItems.length !== allItems.length) {
        itemDiffs.push(`Total items count changed from ${existingItems.length} to ${allItems.length}`);
      }

      const oldItemMap = new Map<string, any>();
      existingItems.forEach((it: any) => {
        const key = `${(it.description || '').trim().toLowerCase()}___${(it.size || '').trim().toLowerCase()}`;
        oldItemMap.set(key, it);
      });

      const newItemMap = new Map<string, any>();
      allItems.forEach((it: any) => {
        const desc = (it.item_description || it.description || '').trim();
        const size = (it.size || '').trim();
        const key = `${desc.toLowerCase()}___${size.toLowerCase()}`;
        newItemMap.set(key, it);

        const old = oldItemMap.get(key);
        if (!old) {
          const qty = it.quantity !== undefined ? it.quantity : (it.quantity_boxes || it.quantity_sqft || 0);
          itemDiffs.push(`Added new item: "${desc}" (${qty} ${it.product_type || 'units'})`);
        } else {
          const oldQty = parseFloat(old.quantity_boxes || old.quantity_sqft || '0') || 0;
          const newQty = parseFloat(it.quantity !== undefined ? it.quantity : (it.quantity_boxes || it.quantity_sqft || '0')) || 0;
          if (Math.abs(oldQty - newQty) > 0.001) {
            itemDiffs.push(`"${desc}": quantity changed from ${oldQty} to ${newQty}`);
          }
        }
      });

      existingItems.forEach((it: any) => {
        const key = `${(it.description || '').trim().toLowerCase()}___${(it.size || '').trim().toLowerCase()}`;
        if (!newItemMap.has(key)) {
          itemDiffs.push(`Removed item: "${it.description}"`);
        }
      });

      const shouldNotifyDispatch = wasDispatchConfigured && itemDiffs.length > 0;
      let dispatchChangeSummary: string | null = null;
      if (shouldNotifyDispatch) {
        dispatchChangeSummary = JSON.stringify({
          changed_by: req.user!.full_name,
          changed_by_role: req.user!.role,
          changed_at: new Date().toISOString(),
          prev_version: current.rows[0].version,
          new_version: nextVersion,
          diffs: itemDiffs,
        });
      }

      // Update Quotation Header and bump version
      const qRes = await client.query(
        `UPDATE quotations
         SET quotation_date = $1,
             customer_id = $2,
             customer_name = $3,
             customer_phone = $4,
             customer_gstin = $5,
             delivery_address = $6,
             site_location = $7,
             project_name = $8,
             quotation_type = $9,
             assisted_sales_person_id = $10,
             assisted_sales_person_name = $11,
             split_share_type = $12,
             primary_sales_share_percent = $13,
             primary_sales_share_amount = $14,
             assisted_sales_share_percent = $15,
             assisted_sales_share_amount = $16,
             status = $17,
             approved_by_id = CASE
               WHEN $18::boolean THEN COALESCE(approved_by_id, $19::integer)
               WHEN $20::boolean THEN NULL
               ELSE approved_by_id
             END,
             approved_at = CASE
               WHEN $18::boolean THEN COALESCE(approved_at, NOW())
               WHEN $20::boolean THEN NULL
               ELSE approved_at
             END,
             manager_approval_note = CASE
               WHEN $20::boolean THEN 'Revised by salesperson (' || $21::text || '). Pending Store Manager re-approval.'
               ELSE manager_approval_note
             END,
             gross_total = $22,
             discount_percent = $23,
             discount_amount = $24,
             taxable_amount = $25,
             tax_type = $26,
             cgst_rate = $27,
             cgst_amount = $28,
             sgst_rate = $29,
             sgst_amount = $30,
             igst_rate = $31,
             igst_amount = $32,
             round_off = $33,
             net_total = $34,
             special_notes = $35,
             version = $36,
             has_dispatch_item_changes = CASE WHEN $39::boolean THEN true ELSE has_dispatch_item_changes END,
             dispatch_change_summary = CASE WHEN $39::boolean THEN $40::text ELSE dispatch_change_summary END,
             dispatch_change_acknowledged_at = CASE WHEN $39::boolean THEN NULL ELSE dispatch_change_acknowledged_at END,
             updated_at = NOW()
         WHERE id = $37 AND version = $38
         RETURNING *`,
        [
          quotation_date,
          customer_id || null,
          customer_name,
          customer_phone,
          customer_gstin || null,
          delivery_address || '',
          site_location || '',
          project_name || '',
          qType,
          finalAssistedId,
          finalAssistedName,
          finalSplitType,
          primaryPct,
          primaryAmt,
          assistedPct,
          assistedAmt,
          nextStatus,
          isNextApproved,
          req.user!.id,
          isSalesperson,
          req.user!.full_name,
          totals.grossTotal,
          parseFloat(discount_percent) || 0,
          totals.discountAmount,
          totals.taxableAmount,
          tax_type,
          totals.cgstRate,
          totals.cgstAmount,
          totals.sgstRate,
          totals.sgstAmount,
          totals.igstRate,
          totals.igstAmount,
          totals.roundOff,
          totals.netTotal,
          special_notes || '',
          nextVersion,
          id,
          current.rows[0].version,
          shouldNotifyDispatch,
          dispatchChangeSummary,
        ]
      );

      // Re-create areas and items cleanly
      await client.query('DELETE FROM quotation_areas WHERE quotation_id = $1', [id]);

      // Pre-resolve and save encrypted codes for all items
      const allItemNames: string[] = [];
      for (const a of areas) {
        if (Array.isArray(a.items)) {
          for (const it of a.items) {
            const desc = (it.item_description || it.description || '').trim();
            if (desc) allItemNames.push(desc);
          }
        }
      }
      const encryptedCodesMap = await getOrSaveEncryptedProductCodes(allItemNames, (sql, p) => client.query(sql, p).then((r: any) => r.rows));

      let itemSlNo = 1;
      for (let i = 0; i < areas.length; i++) {
        const area = areas[i];
        const areaRes = await client.query(
          `INSERT INTO quotation_areas (quotation_id, area_name, display_order)
           VALUES ($1, $2, $3) RETURNING id`,
          [id, area.area_name || (qType === 'sanitary' ? 'Sanitary Ware' : `Area ${i + 1}`), i + 1]
        );
        const areaId = areaRes.rows[0].id;

        if (Array.isArray(area.items)) {
          for (const item of area.items) {
            let pType = String(item.product_type || (qType === 'sanitary' ? 'nos' : 'box')).toLowerCase();
            const cov = parseFloat(item.coverage_area) || 0;
            let sqft = parseFloat(item.quantity_sqft) || 0;
            let rSqft = parseFloat(item.rate_per_sqft) || 0;
            let boxes = parseFloat(item.quantity !== undefined ? item.quantity : item.quantity_boxes) || 0;
            let rBox = parseFloat(item.discounted_price !== undefined ? item.discounted_price : item.rate_per_box) || 0;
            let total = 0;

            if (qType === 'sanitary') {
              pType = 'nos';
              const mrp = parseFloat(item.mrp_price !== undefined ? item.mrp_price : item.base_rate_per_box) || 0;
              const discPct = parseFloat(item.discount_percent) || 0;
              if (rBox <= 0 && mrp > 0) {
                rBox = parseFloat((mrp * (1 - discPct / 100)).toFixed(2));
              }
              total = parseFloat((boxes * rBox).toFixed(2));
              sqft = 0;
              rSqft = 0;
            } else if (pType === 'sqft') {
              total = parseFloat((sqft * rSqft).toFixed(2));
              boxes = 0;
              rBox = 0;
            } else if (['bags', 'pieces', 'nos'].includes(pType)) {
              total = parseFloat((boxes * rBox).toFixed(2));
              sqft = 0;
              rSqft = 0;
            } else {
              // 'box'
              boxes = cov > 0 ? parseFloat((sqft / cov).toFixed(2)) : boxes;
              rBox = cov > 0 ? parseFloat((rSqft * cov).toFixed(2)) : rBox;
              total = parseFloat((sqft * rSqft).toFixed(2));
            }

            const baseSqft = parseFloat(item.base_rate_per_sqft) || rSqft;
            const baseBox = parseFloat(item.mrp_price !== undefined ? item.mrp_price : item.base_rate_per_box) || rBox;
            const discPct = parseFloat(item.discount_percent) || 0;
            const discAmt = parseFloat(item.discount_amount) || parseFloat((boxes * baseBox - total).toFixed(2));
            const itemCode = item.item_code || (qType === 'sanitary' ? (item.size || null) : null);
            const itemImage = item.item_image || null;
            const mrpPrice = parseFloat(item.mrp_price) || (pType === 'nos' ? baseBox : 0);
            const itemDesc = item.item_description || item.description || (qType === 'sanitary' ? 'Sanitary Item' : 'Tile Item');
            const encCode = encryptedCodesMap.get(itemDesc.trim()) || null;

            await client.query(
              `INSERT INTO quotation_items (
                quotation_id, area_id, sl_no, description, size, brand,
                product_type, coverage_area, quantity_sqft, base_rate_per_sqft, rate_per_sqft,
                quantity_boxes, base_rate_per_box, rate_per_box, discount_percent, discount_amount, total_amount,
                item_code, item_image, mrp_price, encrypted_code
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)`,
              [
                id,
                areaId,
                itemSlNo++,
                itemDesc,
                item.size || (qType === 'sanitary' ? (itemCode || 'Nos') : ''),
                item.brand || (qType === 'sanitary' ? 'Sanitary' : ''),
                pType,
                cov,
                sqft,
                baseSqft,
                rSqft,
                boxes,
                baseBox,
                rBox,
                discPct,
                discAmt,
                total,
                itemCode,
                itemImage,
                mrpPrice,
                encCode,
              ]
            );

            // Automatically record tile item into catalog for future auto-fill memory
            if (qType !== 'sanitary') {
              const desc = (item.item_description || item.description || '').trim();
              if (desc && desc.length > 1) {
                await client.query(
                  `INSERT INTO tile_catalog_items (
                    description, brand, size, product_type, coverage_area,
                    base_rate_per_sqft, rate_per_sqft, base_rate_per_box, rate_per_box,
                    usage_count, last_used_at
                  ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1, CURRENT_TIMESTAMP)
                  ON CONFLICT (description) DO UPDATE SET
                    brand = COALESCE(NULLIF(EXCLUDED.brand, ''), tile_catalog_items.brand),
                    size = COALESCE(NULLIF(EXCLUDED.size, ''), tile_catalog_items.size),
                    product_type = COALESCE(NULLIF(EXCLUDED.product_type, ''), tile_catalog_items.product_type),
                    coverage_area = CASE WHEN EXCLUDED.coverage_area > 0 THEN EXCLUDED.coverage_area ELSE tile_catalog_items.coverage_area END,
                    base_rate_per_sqft = CASE WHEN EXCLUDED.base_rate_per_sqft > 0 THEN EXCLUDED.base_rate_per_sqft ELSE tile_catalog_items.base_rate_per_sqft END,
                    rate_per_sqft = CASE WHEN EXCLUDED.rate_per_sqft > 0 THEN EXCLUDED.rate_per_sqft ELSE tile_catalog_items.rate_per_sqft END,
                    base_rate_per_box = CASE WHEN EXCLUDED.base_rate_per_box > 0 THEN EXCLUDED.base_rate_per_box ELSE tile_catalog_items.base_rate_per_box END,
                    rate_per_box = CASE WHEN EXCLUDED.rate_per_box > 0 THEN EXCLUDED.rate_per_box ELSE tile_catalog_items.rate_per_box END,
                    usage_count = tile_catalog_items.usage_count + 1,
                    last_used_at = CURRENT_TIMESTAMP`,
                  [desc, item.brand || null, item.size || null, pType, cov, baseSqft, rSqft, baseBox, rBox]
                ).catch(() => {});
              }
            }
          }
        }
      }

      await recordAuditLog({
        userId: req.user!.id,
        username: req.user!.username,
        action: 'QUOTATION_UPDATED',
        entityType: 'quotation',
        entityId: id,
        details: { version: nextVersion, net_total: totals.netTotal },
        ipAddress: req.ip,
      });

      // Archive newly created version snapshot
      const revSummary = req.body.revision_summary || (
        isSalesperson
          ? `Edited by salesperson (${req.user!.full_name}). Pending Store Manager re-approval.`
          : `Revised by ${req.user!.full_name}`
      );
      await archiveQuotationVersion(
        client,
        id,
        nextVersion,
        req.user!.id,
        req.user!.full_name,
        revSummary,
        qRes.rows[0]
      );

      return {
        quotation: qRes.rows[0],
        shouldNotifyDispatch,
        itemDiffs,
        dispatchChangeSummary,
      };
    });

    broadcast({ type: 'QUOTATION_UPDATED', payload: { id, version: updated.quotation.version } });

    if (updated.shouldNotifyDispatch) {
      broadcast({
        type: 'DISPATCH_ITEM_CHANGED',
        payload: {
          quotation_id: id,
          quotation_number: updated.quotation.quotation_number,
          customer_name: updated.quotation.customer_name,
          changed_by: req.user!.full_name,
          changed_at: new Date().toISOString(),
          diffs: updated.itemDiffs,
          summary: updated.dispatchChangeSummary,
        },
      });
    }

    res.json({ quotation: updated.quotation });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

// 5. Quotation Status Workflow (Approval / Rejection / In-Review)
quotationsRouter.post('/:id/status', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    const { status, manager_approval_note } = req.body;

    const validStatuses = ['draft', 'in_review', 'approved', 'rejected', 'closed'];
    if (!validStatuses.includes(status)) {
      res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
      return;
    }

    // Role restrictions: Only Manager & Admin can approve or reject
    if (['approved', 'rejected'].includes(status) && !['admin', 'manager'].includes(req.user!.role)) {
      res.status(403).json({ error: 'Only Managers and Administrators can approve or reject quotations' });
      return;
    }

    const isApproval = status === 'approved';
    const rows = await query(
      `UPDATE quotations
       SET status = $1,
           manager_approval_note = COALESCE($2, manager_approval_note),
           approved_by_id = CASE WHEN $3 THEN $4 ELSE approved_by_id END,
           approved_at = CASE WHEN $3 THEN NOW() ELSE approved_at END,
           updated_at = NOW()
       WHERE id = $5
       RETURNING *`,
      [status, manager_approval_note || null, isApproval, req.user!.id, id]
    );

    if (rows.length === 0) {
      res.status(404).json({ error: 'Quotation not found' });
      return;
    }

    // Keep active version snapshot synchronized with status update
    await query(
      `UPDATE quotation_versions
       SET status = $1,
           snapshot_data = jsonb_set(
             jsonb_set(snapshot_data, '{quotation,status}', to_jsonb($1::text)),
             '{quotation,approved_by_name}', to_jsonb($2::text)
           )
       WHERE quotation_id = $3 AND version_number = $4`,
      [status, isApproval ? req.user!.full_name : '', id, rows[0].version]
    ).catch(() => {});

    await recordAuditLog({
      userId: req.user!.id,
      username: req.user!.username,
      action: `QUOTATION_STATUS_${status.toUpperCase()}`,
      entityType: 'quotation',
      entityId: id,
      details: { status, manager_approval_note },
      ipAddress: req.ip,
    });

    broadcast({
      type: 'QUOTATION_STATUS_CHANGED',
      payload: { id, status, quotation_number: rows[0].quotation_number },
    });

    res.json({ quotation: rows[0] });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 6. Delete All Quotations (Admin & Accounts only)
quotationsRouter.delete('/all', requireRole(['admin', 'accounts', 'accountant']), async (req: Request, res: Response) => {
  try {
    await query('DELETE FROM quotation_items');
    await query('DELETE FROM quotation_areas');
    await query('DELETE FROM payments');
    await query('DELETE FROM quotations');

    await recordAuditLog({
      userId: req.user!.id,
      username: req.user!.username,
      action: 'ALL_QUOTATIONS_DELETED',
      entityType: 'quotation',
      details: { message: 'All quotations removed from system' },
      ipAddress: req.ip,
    });

    broadcast({ type: 'QUOTATION_UPDATED', payload: { allDeleted: true } });

    res.json({ message: 'All quotations deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 7. Delete Single Quotation
quotationsRouter.delete('/:id', requireRole(['admin', 'manager', 'accounts']), async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);

    const qRows = await query('SELECT status, quotation_number FROM quotations WHERE id = $1', [id]);
    if (qRows.length === 0) {
      res.status(404).json({ error: 'Quotation not found' });
      return;
    }

    const isPrivileged = ['admin', 'accounts'].includes(req.user!.role);
    if (!['draft', 'rejected'].includes(qRows[0].status) && !isPrivileged) {
      res.status(400).json({ error: 'Only draft or rejected quotations can be deleted' });
      return;
    }

    await query('DELETE FROM quotation_items WHERE quotation_id = $1', [id]);
    await query('DELETE FROM quotation_areas WHERE quotation_id = $1', [id]);
    await query('DELETE FROM payments WHERE quotation_id = $1', [id]);
    await query('DELETE FROM quotations WHERE id = $1', [id]);

    await recordAuditLog({
      userId: req.user!.id,
      username: req.user!.username,
      action: 'QUOTATION_DELETED',
      entityType: 'quotation',
      entityId: id,
      details: { quotation_number: qRows[0].quotation_number },
      ipAddress: req.ip,
    });

    broadcast({ type: 'QUOTATION_UPDATED', payload: { id, deleted: true } });

    res.json({ message: 'Quotation deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 8. List All Versions / Revision History of a Quotation
quotationsRouter.get('/:id/versions', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    const qRows = await query('SELECT * FROM quotations WHERE id = $1', [id]);
    if (qRows.length === 0) {
      res.status(404).json({ error: 'Quotation not found' });
      return;
    }
    const currentQ = qRows[0];

    // Salesperson scoping check
    if (req.user?.role?.toLowerCase() === 'salesperson') {
      const isOwner = currentQ.sales_person_id === req.user.id;
      const isAssisted = currentQ.assisted_sales_person_id === req.user.id;
      if (!isOwner && !isAssisted) {
        res.status(403).json({ error: 'Access denied: You can only view versions of your assigned quotations.' });
        return;
      }
    }

    let rows = await query(
      `SELECT id, quotation_id, version_number, edited_by_id, edited_by_name, revision_summary,
              gross_total, discount_percent, discount_amount, taxable_amount, net_total, status, created_at,
              (snapshot_data->'areas') as areas_summary
       FROM quotation_versions
       WHERE quotation_id = $1
       ORDER BY version_number DESC`,
      [id]
    );

    // If no versions exist yet (legacy quotation created before versioning), archive current quotation as initial version
    if (rows.length === 0) {
      await withTransaction(async (client) => {
        await archiveQuotationVersion(
          client,
          id,
          currentQ.version || 1,
          currentQ.sales_person_id || req.user!.id,
          currentQ.sales_person_name || req.user!.full_name,
          'Initial quotation snapshot',
          currentQ
        );
      });

      rows = await query(
        `SELECT id, quotation_id, version_number, edited_by_id, edited_by_name, revision_summary,
                gross_total, discount_percent, discount_amount, taxable_amount, net_total, status, created_at,
                (snapshot_data->'areas') as areas_summary
         FROM quotation_versions
         WHERE quotation_id = $1
         ORDER BY version_number DESC`,
        [id]
      );
    }

    // If only 1 version exists and its version_number is > 1 (e.g. legacy quotation created before versioning),
    // clone it as v1 baseline so users can view the initial quote creation and have multiple revisions visible
    if (rows.length === 1 && rows[0].version_number > 1) {
      await withTransaction(async (client) => {
        const v1Exists = await client.query(
          'SELECT id FROM quotation_versions WHERE quotation_id = $1 AND version_number = 1',
          [id]
        );
        if (v1Exists.rows.length === 0) {
          const baseRow = rows[0];
          await client.query(
            `INSERT INTO quotation_versions (
              quotation_id, version_number, edited_by_id, edited_by_name, revision_summary,
              snapshot_data, gross_total, discount_percent, discount_amount, taxable_amount,
              net_total, status, created_at
            ) VALUES ($1, 1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
            [
              id,
              baseRow.edited_by_id,
              baseRow.edited_by_name,
              'Initial quotation creation',
              baseRow.snapshot_data,
              baseRow.gross_total,
              baseRow.discount_percent,
              baseRow.discount_amount,
              baseRow.taxable_amount,
              baseRow.net_total,
              baseRow.status,
              currentQ.created_at || baseRow.created_at,
            ]
          );
        }
      });

      rows = await query(
        `SELECT id, quotation_id, version_number, edited_by_id, edited_by_name, revision_summary,
                gross_total, discount_percent, discount_amount, taxable_amount, net_total, status, created_at,
                (snapshot_data->'areas') as areas_summary
         FROM quotation_versions
         WHERE quotation_id = $1
         ORDER BY version_number DESC`,
        [id]
      );
    }

    const versions = rows.map((r: any) => {
      let itemCount = 0;
      if (Array.isArray(r.areas_summary)) {
        r.areas_summary.forEach((a: any) => {
          if (Array.isArray(a.items)) itemCount += a.items.length;
        });
      }
      return {
        id: r.id,
        quotation_id: r.quotation_id,
        version_number: r.version_number,
        is_current: r.version_number === currentQ.version,
        edited_by_id: r.edited_by_id,
        edited_by_name: r.edited_by_name || 'System / Associate',
        revision_summary: r.revision_summary || `Revision ${r.version_number}`,
        gross_total: parseFloat(r.gross_total) || 0,
        discount_percent: parseFloat(r.discount_percent) || 0,
        discount_amount: parseFloat(r.discount_amount) || 0,
        taxable_amount: parseFloat(r.taxable_amount) || 0,
        net_total: parseFloat(r.net_total) || 0,
        status: r.status,
        created_at: r.created_at,
        items_count: itemCount,
      };
    });

    res.json({
      versions,
      current_version: currentQ.version,
      quotation_number: currentQ.quotation_number,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 9. Get Single Historical Quotation Version Snapshot (Full line items & areas)
quotationsRouter.get('/:id/versions/:versionNumber', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    const versionNum = parseInt(req.params.versionNumber as string, 10);

    const rows = await query(
      `SELECT * FROM quotation_versions WHERE quotation_id = $1 AND version_number = $2`,
      [id, versionNum]
    );

    if (rows.length === 0) {
      res.status(404).json({ error: `Quotation version ${versionNum} not found` });
      return;
    }

    const versionRow = rows[0];
    const snapshot = typeof versionRow.snapshot_data === 'string'
      ? JSON.parse(versionRow.snapshot_data)
      : versionRow.snapshot_data;

    // Enrich snapshot with joined names if missing
    if (snapshot?.quotation) {
      if (snapshot.quotation.approved_by_id && !snapshot.quotation.approved_by_name) {
        const uApp = await query('SELECT full_name FROM users WHERE id = $1', [snapshot.quotation.approved_by_id]);
        if (uApp.length > 0) {
          snapshot.quotation.approved_by_name = uApp[0].full_name;
        }
      }
      if (snapshot.quotation.sales_person_id && !snapshot.quotation.sales_person_name) {
        const uSales = await query('SELECT full_name FROM users WHERE id = $1', [snapshot.quotation.sales_person_id]);
        if (uSales.length > 0) {
          snapshot.quotation.sales_person_name = uSales[0].full_name;
        }
      }
    }

    res.json({
      id: versionRow.id,
      quotation_id: versionRow.quotation_id,
      version_number: versionRow.version_number,
      edited_by_name: versionRow.edited_by_name,
      revision_summary: versionRow.revision_summary,
      created_at: versionRow.created_at,
      status: versionRow.status,
      net_total: parseFloat(versionRow.net_total) || 0,
      snapshot,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 10. Stream PDF of a Historical Quotation Version
quotationsRouter.get('/:id/versions/:versionNumber/pdf', optionalAuthenticateToken, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    const versionNum = parseInt(req.params.versionNumber as string, 10);
    const isEncrypted = req.query.encrypted === 'true' || req.query.encrypted === '1';

    const rows = await query(
      `SELECT * FROM quotation_versions WHERE quotation_id = $1 AND version_number = $2`,
      [id, versionNum]
    );

    if (rows.length === 0) {
      res.status(404).json({ error: `Quotation version ${versionNum} not found` });
      return;
    }

    const versionRow = rows[0];
    const snapshot = typeof versionRow.snapshot_data === 'string'
      ? JSON.parse(versionRow.snapshot_data)
      : versionRow.snapshot_data;

    const quotation = snapshot.quotation || {};
    const areas = snapshot.areas || [];

    if (quotation.approved_by_id && !quotation.approved_by_name) {
      const uApp = await query('SELECT full_name FROM users WHERE id = $1', [quotation.approved_by_id]);
      if (uApp.length > 0) {
        quotation.approved_by_name = uApp[0].full_name;
      }
    }
    if (quotation.sales_person_id && !quotation.sales_person_name) {
      const uSales = await query('SELECT full_name FROM users WHERE id = $1', [quotation.sales_person_id]);
      if (uSales.length > 0) {
        quotation.sales_person_name = uSales[0].full_name;
      }
    }

    // Salespersons can only view/export approved or closed quotations
    if (req.user?.role?.toLowerCase() === 'salesperson' && !['approved', 'closed'].includes(quotation.status?.toLowerCase())) {
      res.status(403).json({
        error: 'Historical revision is awaiting Store Manager approval. PDF will unlock once approved.',
      });
      return;
    }

    const companyRows = await query('SELECT * FROM company_settings LIMIT 1');
    const company = companyRows[0] || {};

    let encryptedMap = new Map<string, string>();
    if (isEncrypted) {
      const allNames: string[] = [];
      for (const a of areas) {
        for (const it of a.items || []) {
          if (it.description) allNames.push(it.description);
          if (it.item_code) allNames.push(it.item_code);
          if (it.size) allNames.push(it.size);
        }
      }
      encryptedMap = await getOrSaveEncryptedProductCodes(allNames);
    }

    const doc = generateQuotationPdf({
      quotation: {
        ...quotation,
        quotation_number: `${quotation.quotation_number || id}_v${versionNum}`,
      },
      areas,
      company: {
        ...company,
        terms_json: company.terms_json
          ? (typeof company.terms_json === 'string' ? JSON.parse(company.terms_json) : company.terms_json)
          : [],
      },
      encrypted: isEncrypted,
      encryptedMap,
    });

    const filename = isEncrypted
      ? `Quotation_${quotation.quotation_number}_v${versionNum}_Encrypted.pdf`
      : `Quotation_${quotation.quotation_number}_v${versionNum}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    doc.pipe(res);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 11. Restore Quotation to a Historical Version
quotationsRouter.post('/:id/versions/:versionNumber/restore', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    const versionNum = parseInt(req.params.versionNumber as string, 10);

    const rows = await query(
      `SELECT * FROM quotation_versions WHERE quotation_id = $1 AND version_number = $2`,
      [id, versionNum]
    );

    if (rows.length === 0) {
      res.status(404).json({ error: `Version ${versionNum} not found` });
      return;
    }

    const versionRow = rows[0];
    const snapshot = typeof versionRow.snapshot_data === 'string'
      ? JSON.parse(versionRow.snapshot_data)
      : versionRow.snapshot_data;

    const histQ = snapshot.quotation;
    const histAreas = snapshot.areas || [];

    const restored = await withTransaction(async (client) => {
      const cur = await client.query('SELECT version, quotation_number FROM quotations WHERE id = $1', [id]);
      if (cur.rows.length === 0) throw new Error('Quotation not found');

      const nextVer = cur.rows[0].version + 1;
      const isSalesperson = req.user?.role?.toLowerCase() === 'salesperson';
      const newStatus = isSalesperson ? 'in_review' : (histQ.status || 'draft');

      // Update header
      const qUpdate = await client.query(
        `UPDATE quotations
         SET customer_name = $1,
             customer_phone = $2,
             customer_gstin = $3,
             delivery_address = $4,
             site_location = $5,
             project_name = $6,
             status = $7,
             gross_total = $8,
             discount_percent = $9,
             discount_amount = $10,
             taxable_amount = $11,
             tax_type = $12,
             cgst_rate = $13,
             cgst_amount = $14,
             sgst_rate = $15,
             sgst_amount = $16,
             igst_rate = $17,
             igst_amount = $18,
             round_off = $19,
             net_total = $20,
             special_notes = $21,
             version = $22,
             updated_at = NOW()
         WHERE id = $23
         RETURNING *`,
        [
          histQ.customer_name,
          histQ.customer_phone,
          histQ.customer_gstin || null,
          histQ.delivery_address || '',
          histQ.site_location || '',
          histQ.project_name || '',
          newStatus,
          histQ.gross_total || 0,
          histQ.discount_percent || 0,
          histQ.discount_amount || 0,
          histQ.taxable_amount || 0,
          histQ.tax_type || 'cgst_sgst',
          histQ.cgst_rate || 9,
          histQ.cgst_amount || 0,
          histQ.sgst_rate || 9,
          histQ.sgst_amount || 0,
          histQ.igst_rate || 18,
          histQ.igst_amount || 0,
          histQ.round_off || 0,
          histQ.net_total || 0,
          histQ.special_notes || '',
          nextVer,
          id,
        ]
      );

      // Re-create areas and items
      await client.query('DELETE FROM quotation_areas WHERE quotation_id = $1', [id]);

      let itemSlNo = 1;
      for (let i = 0; i < histAreas.length; i++) {
        const area = histAreas[i];
        const areaRes = await client.query(
          `INSERT INTO quotation_areas (quotation_id, area_name, display_order)
           VALUES ($1, $2, $3) RETURNING id`,
          [id, area.area_name || `Area ${i + 1}`, i + 1]
        );
        const areaId = areaRes.rows[0].id;

        for (const it of area.items || []) {
          await client.query(
            `INSERT INTO quotation_items (
              quotation_id, area_id, sl_no, description, size, brand,
              product_type, coverage_area, quantity_sqft, base_rate_per_sqft, rate_per_sqft,
              quantity_boxes, base_rate_per_box, rate_per_box, discount_percent, discount_amount, total_amount,
              item_code, item_image, mrp_price, encrypted_code
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)`,
            [
              id,
              areaId,
              itemSlNo++,
              it.description,
              it.size,
              it.brand,
              it.product_type || 'box',
              it.coverage_area || 0,
              it.quantity_sqft || 0,
              it.base_rate_per_sqft || 0,
              it.rate_per_sqft || 0,
              it.quantity_boxes || 0,
              it.base_rate_per_box || 0,
              it.rate_per_box || 0,
              it.discount_percent || 0,
              it.discount_amount || 0,
              it.total_amount || 0,
              it.item_code || null,
              it.item_image || null,
              it.mrp_price || 0,
              it.encrypted_code || null,
            ]
          );
        }
      }

      await archiveQuotationVersion(
        client,
        id,
        nextVer,
        req.user!.id,
        req.user!.full_name,
        `Restored from historical Version ${versionNum} by ${req.user!.full_name}`,
        qUpdate.rows[0]
      );

      await recordAuditLog({
        userId: req.user!.id,
        username: req.user!.username,
        action: 'QUOTATION_RESTORED',
        entityType: 'quotation',
        entityId: id,
        details: { restored_from_version: versionNum, new_version: nextVer },
        ipAddress: req.ip,
      });

      return qUpdate.rows[0];
    });

    broadcast({ type: 'QUOTATION_UPDATED', payload: { id, version: restored.version } });

    res.json({ message: `Successfully restored to Version ${versionNum}`, quotation: restored });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

