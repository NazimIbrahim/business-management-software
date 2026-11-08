import { Router, Request, Response } from 'express';
import { query, withTransaction } from '../db/connection';
import { authenticateToken, optionalAuthenticateToken, requireRole } from '../middleware/auth';
import { generateNextPaymentNumber } from '../utils/quotationNumber';
import { recordAuditLog } from '../utils/audit';
import { broadcast } from '../ws';
import PDFDocument from 'pdfkit';
import { numberToWordsIndian } from '../utils/numberToWords';

export const paymentsRouter = Router();

// Stream Payment Receipt (accessible directly via browser tab, print window, or download with optional token)
// Fixed to standard A4 portrait mode with Recorded By & Accounts Verification details
const streamReceiptPdf = async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);

    const pRows = await query(
      `SELECT p.*,
              q.quotation_number,
              q.customer_name,
              q.customer_phone,
              q.delivery_address,
              q.sales_person_id,
              q.assisted_sales_person_id,
              q.net_total as quotation_net_total,
              u.full_name as recorded_by_name,
              u.role as recorded_by_role,
              COALESCE(p.verified_by_name, uv.full_name) as verified_by_name,
              uv.role as verified_by_role,
              COALESCE(paid_agg.total_cleared_paid, 0) as total_cleared_paid
       FROM payments p
       JOIN quotations q ON q.id = p.quotation_id
       LEFT JOIN users u ON u.id = p.recorded_by_id
       LEFT JOIN users uv ON uv.id = p.verified_by_id
       LEFT JOIN (
         SELECT quotation_id, SUM(amount) as total_cleared_paid
         FROM payments
         WHERE status IN ('Cleared', 'Verified')
         GROUP BY quotation_id
       ) paid_agg ON paid_agg.quotation_id = q.id
       WHERE p.id = $1`,
      [id]
    );

    if (pRows.length === 0) {
      res.status(404).json({ error: 'Payment receipt not found' });
      return;
    }

    const payment = pRows[0];

    if (
      req.user?.role?.toLowerCase() === 'salesperson' &&
      payment.sales_person_id !== req.user.id &&
      payment.assisted_sales_person_id !== req.user.id
    ) {
      res.status(403).json({ error: 'Access denied: You can only view receipts for your own quotations.' });
      return;
    }
    const companyRows = await query('SELECT * FROM company_settings LIMIT 1');
    const company = companyRows[0] || {
      company_name: 'AMA Ceramics Pvt Ltd',
      address_line1: '125/1, Sulikunte Village, Sarjapura Main Road, Varthur Hobli',
      address_line2: 'Bengaluru, Karnataka 562125',
      phone: '+91 96637 73871',
      gstin: '24AAACA5678Q1Z4',
    };

    // Standard Portrait Mode A4 (595.28 x 841.89 points)
    const doc = new PDFDocument({
      size: 'A4',
      layout: 'portrait',
      margin: 36,
      bufferPages: true,
      info: {
        Title: `Payment Receipt - ${payment.payment_number}`,
        Author: company.company_name || 'AMA Ceramics Pvt Ltd',
      },
    });

    // Stream directly
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="Receipt_${payment.payment_number}.pdf"`);
    doc.pipe(res);

    const primaryColor = '#1B365D';
    const darkSlate = '#1E293B';
    const grayText = '#475569';
    const borderGray = '#CBD5E1';
    const lightBg = '#F8FAFC';

    // Outer decorative frame
    doc.rect(32, 32, 531, 778).lineWidth(1).stroke('#CBD5E1');

    // Header Logo
    let hasLogo = false;
    if (company.logo_base64) {
      try {
        const base64Clean = company.logo_base64.replace(/^data:image\/\w+;base64,/, '');
        const imgBuffer = Buffer.from(base64Clean, 'base64');
        doc.image(imgBuffer, 45, 42, { fit: [60, 52], align: 'center', valign: 'center' });
        hasLogo = true;
      } catch (err) {
        hasLogo = false;
      }
    }

    const textX = hasLogo ? 115 : 45;
    let curY = 44;
    doc.fontSize(14).font('Helvetica-Bold').fillColor(primaryColor).text(company.company_name || 'AMA Ceramics Pvt Ltd', textX, curY);
    curY += 16;

    if (company.address_line1) {
      doc.fontSize(8).font('Helvetica').fillColor(grayText).text(company.address_line1, textX, curY);
      curY += 11;
    }
    if (company.address_line2) {
      doc.fontSize(8).font('Helvetica').fillColor(grayText).text(company.address_line2, textX, curY);
      curY += 11;
    }
    const contact = [
      company.phone ? `Phone: ${company.phone}` : '',
      company.gstin ? `GSTIN: ${company.gstin}` : '',
    ].filter(Boolean).join(' | ');
    if (contact) {
      doc.fontSize(8).font('Helvetica').fillColor(grayText).text(contact, textX, curY);
    }

    // Top Right Header: Title, Ref & Verification Pill
    doc.fontSize(18).font('Helvetica-Bold').fillColor(primaryColor).text('PAYMENT RECEIPT', 330, 42, { align: 'right', width: 220 });
    doc.fontSize(9.5).font('Helvetica-Bold').fillColor(darkSlate).text(`Receipt Ref: ${payment.payment_number}`, 330, 64, { align: 'right', width: 220 });
    doc.fontSize(8.5).font('Helvetica').fillColor(grayText).text(
      `Payment Date: ${new Date(payment.payment_date).toLocaleDateString('en-GB')}`,
      330,
      78,
      { align: 'right', width: 220 }
    );

    const isVerified = ['Cleared', 'Verified'].includes(payment.status);
    if (isVerified) {
      doc.rect(405, 94, 145, 18).fillAndStroke('#ECFDF5', '#10B981');
      doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#065F46').text('✓ ACCOUNTS VERIFIED', 405, 99, { width: 145, align: 'center' });
    } else {
      doc.rect(355, 94, 195, 18).fillAndStroke('#FFFBEB', '#F59E0B');
      doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#92400E').text('⏳ NOT VERIFIED (PENDING ACCOUNTS)', 355, 99, { width: 195, align: 'center' });
    }

    // Header divider line
    doc.moveTo(45, 122).lineTo(550, 122).lineWidth(1).stroke(borderGray);

    // Two Column Panels: Received From & Receipt / Audit Details
    const colY = 132;
    const colWidth = 245;

    // Left Panel: Customer Details
    doc.rect(45, colY, colWidth, 115).fillAndStroke(lightBg, borderGray);
    doc.fontSize(8.5).font('Helvetica-Bold').fillColor(primaryColor).text('RECEIVED FROM (CUSTOMER)', 55, colY + 9);
    doc.moveTo(55, colY + 22).lineTo(280, colY + 22).lineWidth(0.5).stroke('#E2E8F0');

    doc.fontSize(8).font('Helvetica-Bold').fillColor(grayText).text('Customer Name:', 55, colY + 30);
    doc.fontSize(9).font('Helvetica-Bold').fillColor(darkSlate).text(payment.customer_name || 'N/A', 135, colY + 29, { width: 145 });

    doc.fontSize(8).font('Helvetica-Bold').fillColor(grayText).text('Contact Phone:', 55, colY + 50);
    doc.fontSize(8.5).font('Helvetica').fillColor(darkSlate).text(payment.customer_phone || 'N/A', 135, colY + 50);

    doc.fontSize(8).font('Helvetica-Bold').fillColor(grayText).text('Delivery / Site:', 55, colY + 68);
    doc.fontSize(8).font('Helvetica').fillColor(darkSlate).text(payment.delivery_address || 'Showroom Site', 135, colY + 68, { width: 145, height: 38 });

    // Right Panel: Receipt & Audit Particulars
    const rightColX = 305;
    doc.rect(rightColX, colY, colWidth, 115).fillAndStroke(lightBg, borderGray);
    doc.fontSize(8.5).font('Helvetica-Bold').fillColor(primaryColor).text('RECEIPT & AUDIT PARTICULARS', rightColX + 10, colY + 9);
    doc.moveTo(rightColX + 10, colY + 22).lineTo(rightColX + colWidth - 10, colY + 22).lineWidth(0.5).stroke('#E2E8F0');

    doc.fontSize(8).font('Helvetica-Bold').fillColor(grayText).text('Quotation Ref:', rightColX + 10, colY + 30);
    doc.fontSize(9).font('Helvetica-Bold').fillColor(darkSlate).text(payment.quotation_number || 'N/A', rightColX + 100, colY + 29);

    doc.fontSize(8).font('Helvetica-Bold').fillColor(grayText).text('Payment Mode:', rightColX + 10, colY + 48);
    doc.fontSize(8.5).font('Helvetica').fillColor(darkSlate).text(payment.payment_mode || 'Bank Transfer', rightColX + 100, colY + 48);

    doc.fontSize(8).font('Helvetica-Bold').fillColor(grayText).text('Recorded / By:', rightColX + 10, colY + 66);
    const recordedByDisplay = payment.recorded_by_name
      ? `${payment.recorded_by_name} (${payment.recorded_by_role || 'Staff'})`
      : 'System Administrator';
    doc.fontSize(8.5).font('Helvetica-Bold').fillColor(primaryColor).text(recordedByDisplay, rightColX + 100, colY + 66, { width: 140 });

    doc.fontSize(8).font('Helvetica-Bold').fillColor(grayText).text('Accounts Status:', rightColX + 10, colY + 84);
    if (isVerified) {
      const verifierStr = payment.verified_by_name
        ? `Verified by ${payment.verified_by_name}`
        : 'Verified by Accounts';
      const verDateStr = payment.verified_at
        ? new Date(payment.verified_at).toLocaleDateString('en-GB')
        : new Date(payment.created_at).toLocaleDateString('en-GB');
      doc.fontSize(8).font('Helvetica-Bold').fillColor('#065F46').text(`${verifierStr} (${verDateStr})`, rightColX + 100, colY + 84, { width: 140 });
    } else {
      doc.fontSize(8).font('Helvetica-Bold').fillColor('#92400E').text('Not Verified (Pending Accounts)', rightColX + 100, colY + 84, { width: 140 });
    }

    // Highlight Box: Amount Received
    const amtY = 260;
    doc.rect(45, amtY, 505, 68).fillAndStroke('#F0F7FF', primaryColor);
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#0284C7').text('OFFICIAL AMOUNT RECEIVED', 58, amtY + 11);
    doc.fontSize(18).font('Helvetica-Bold').fillColor(primaryColor).text(
      `INR ${Number(payment.amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      58,
      amtY + 24
    );
    doc.fontSize(8.5).font('Helvetica-Oblique').fillColor('#334155').text(
      numberToWordsIndian(payment.amount),
      58,
      amtY + 48,
      { width: 480 }
    );

    // Quotation Account Settlement Summary
    const tblY = 342;
    doc.fontSize(9).font('Helvetica-Bold').fillColor(primaryColor).text('QUOTATION ACCOUNT SETTLEMENT SUMMARY', 45, tblY);

    const rowH = 22;
    doc.rect(45, tblY + 14, 505, rowH).fillAndStroke('#E2E8F0', '#CBD5E1');
    doc.fontSize(8).font('Helvetica-Bold').fillColor(darkSlate);
    doc.text('QUOTATION NET TOTAL', 55, tblY + 20, { width: 160 });
    doc.text('TOTAL VERIFIED RECEIVED TO DATE', 225, tblY + 20, { width: 160, align: 'center' });
    doc.text('REMAINING OUTSTANDING BALANCE', 395, tblY + 20, { width: 145, align: 'right' });

    const netVal = parseFloat(payment.quotation_net_total || 0);
    const paidVal = parseFloat(payment.total_cleared_paid || 0);
    const balVal = Math.max(0, netVal - paidVal);

    doc.rect(45, tblY + 14 + rowH, 505, rowH + 4).fillAndStroke('#FFFFFF', '#CBD5E1');
    doc.fontSize(9.5).font('Helvetica-Bold').fillColor(darkSlate).text(
      `INR ${netVal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
      55,
      tblY + 21 + rowH,
      { width: 160 }
    );
    doc.fontSize(9.5).font('Helvetica-Bold').fillColor('#059669').text(
      `INR ${paidVal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
      225,
      tblY + 21 + rowH,
      { width: 160, align: 'center' }
    );
    doc.fontSize(9.5).font('Helvetica-Bold').fillColor(balVal <= 0.01 ? '#059669' : '#D97706').text(
      `INR ${balVal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
      395,
      tblY + 21 + rowH,
      { width: 145, align: 'right' }
    );

    // Transaction Details & Remarks
    const notesY = 415;
    doc.rect(45, notesY, 505, 56).fillAndStroke(lightBg, borderGray);
    doc.fontSize(8).font('Helvetica-Bold').fillColor(darkSlate).text('Payment Ref / Cheque / UTR #:', 55, notesY + 10);
    doc.fontSize(8.5).font('Helvetica').fillColor(grayText).text(payment.reference_number || 'N/A', 205, notesY + 10);

    doc.fontSize(8).font('Helvetica-Bold').fillColor(darkSlate).text('Internal Notes / Narration:', 55, notesY + 28);
    doc.fontSize(8.5).font('Helvetica').fillColor(grayText).text(payment.notes || 'Payment recorded towards quotation confirmation / settlement.', 205, notesY + 28, { width: 335 });

    // Official Terms & Verification Disclaimer
    const termsY = 485;
    doc.fontSize(8.5).font('Helvetica-Bold').fillColor(primaryColor).text('RECEIPT TERMS & VERIFICATION POLICY:', 45, termsY);
    doc.fontSize(7.5).font('Helvetica').fillColor(grayText);
    const terms = [
      '1. This is a computer-generated official payment receipt issued by AMA Ceramics Pvt Ltd.',
      '2. Payments recorded by sales personnel remain provisional until verified & confirmed by the Accounts & Finance Department.',
      '3. Cheques, RTGS, and electronic transfers are acknowledged subject to realization in the company bank account.',
      '4. Receipts marked as "Verified" signify confirmed fund clearance and credit to the client quotation ledger.',
      '5. For billing, tax invoices, or accounting inquiries, please contact the accounts desk at ' + (company.phone || '+91 96637 73871') + '.',
    ];
    let ty = termsY + 13;
    terms.forEach((t) => {
      doc.text(t, 45, ty, { width: 505 });
      ty += 11;
    });

    // Dual Signatures: Entered By vs Accounts Signatory
    const sigY = 620;
    // Left Signature: Entered / Recorded By
    doc.moveTo(55, sigY + 45).lineTo(235, sigY + 45).lineWidth(0.8).stroke(borderGray);
    doc.fontSize(8).font('Helvetica-Bold').fillColor(darkSlate).text('Entered / Recorded By:', 55, sigY + 51);
    doc.fontSize(8.5).font('Helvetica-Bold').fillColor(primaryColor).text(recordedByDisplay, 55, sigY + 63);

    // Right Signature: Accounts Signatory
    doc.moveTo(365, sigY + 45).lineTo(545, sigY + 45).lineWidth(0.8).stroke(borderGray);
    doc.fontSize(8).font('Helvetica-Bold').fillColor(darkSlate).text('Authorized Accounts Signatory:', 365, sigY + 51);
    doc.fontSize(8.5).font('Helvetica-Bold').fillColor(primaryColor).text(company.company_name || 'AMA CERAMICS PVT LTD', 365, sigY + 63);

    if (isVerified) {
      // Official Accounts Stamp Box
      doc.rect(380, sigY - 24, 150, 36).lineWidth(1.2).stroke('#10B981');
      doc.fontSize(8).font('Helvetica-Bold').fillColor('#065F46').text('✓ ACCOUNTS VERIFIED', 380, sigY - 18, { width: 150, align: 'center' });
      const stampSub = payment.verified_by_name
        ? `${payment.verified_by_name} • ${new Date(payment.verified_at || payment.created_at).toLocaleDateString('en-GB')}`
        : `Verified • ${new Date(payment.created_at).toLocaleDateString('en-GB')}`;
      doc.fontSize(7).font('Helvetica').fillColor('#065F46').text(stampSub, 380, sigY - 6, { width: 150, align: 'center' });
    }

    // Page Footer
    doc.fontSize(7.5).font('Helvetica').fillColor('#94A3B8').text(
      `${company.company_name} • Showroom & Central Logistics Management • Standard A4 Portrait Mode`,
      45,
      785,
      { align: 'center', width: 505 }
    );

    doc.end();
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

paymentsRouter.get('/:id/receipt', optionalAuthenticateToken, streamReceiptPdf);
paymentsRouter.get('/:id/pdf', optionalAuthenticateToken, streamReceiptPdf);

paymentsRouter.use(authenticateToken);

// 1. List Payments (Paginated with filters: status, payment_mode, quotation_id, date range)
paymentsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 20));
    const offset = (page - 1) * limit;
    const quotationId = req.query.quotation_id ? parseInt(req.query.quotation_id as string, 10) : null;
    const paymentMode = req.query.payment_mode as string;
    const status = req.query.status as string;
    const isSalesperson = req.user?.role?.toLowerCase() === 'salesperson';

    const whereClauses: string[] = ['1=1'];
    const params: any[] = [];
    let idx = 1;

    if (isSalesperson) {
      whereClauses.push(`(q.sales_person_id = $${idx} OR q.assisted_sales_person_id = $${idx})`);
      params.push(req.user!.id);
      idx++;
    }

    if (quotationId) {
      whereClauses.push(`p.quotation_id = $${idx++}`);
      params.push(quotationId);
    }
    if (paymentMode) {
      whereClauses.push(`p.payment_mode = $${idx++}`);
      params.push(paymentMode);
    }
    if (status) {
      const lowerStatus = status.toLowerCase();
      if (lowerStatus === 'verified' || lowerStatus === 'cleared') {
        whereClauses.push(`p.status IN ('Cleared', 'Verified')`);
      } else if (lowerStatus === 'recorded' || lowerStatus === 'pending' || lowerStatus === 'not_verified') {
        whereClauses.push(`p.status = 'Recorded'`);
      } else {
        whereClauses.push(`p.status = $${idx++}`);
        params.push(status);
      }
    }

    const whereSql = whereClauses.join(' AND ');

    const countRes = await query<{
      count: string;
      total_amount: string;
      verified_amount: string;
      pending_amount: string;
      verified_count: string;
      pending_count: string;
    }>(
      `SELECT count(*) as count,
              COALESCE(sum(p.amount), 0) as total_amount,
              COALESCE(sum(CASE WHEN p.status IN ('Cleared', 'Verified') THEN p.amount ELSE 0 END), 0) as verified_amount,
              COALESCE(sum(CASE WHEN p.status = 'Recorded' THEN p.amount ELSE 0 END), 0) as pending_amount,
              COALESCE(sum(CASE WHEN p.status IN ('Cleared', 'Verified') THEN 1 ELSE 0 END), 0) as verified_count,
              COALESCE(sum(CASE WHEN p.status = 'Recorded' THEN 1 ELSE 0 END), 0) as pending_count
       FROM payments p
       JOIN quotations q ON q.id = p.quotation_id
       WHERE ${whereSql}`,
      params
    );
    const totalCount = parseInt(countRes[0]?.count || '0', 10);
    const totalCollected = parseFloat(countRes[0]?.total_amount || '0');
    const verifiedAmount = parseFloat(countRes[0]?.verified_amount || '0');
    const pendingAmount = parseFloat(countRes[0]?.pending_amount || '0');
    const verifiedCount = parseInt(countRes[0]?.verified_count || '0', 10);
    const pendingCount = parseInt(countRes[0]?.pending_count || '0', 10);

    const dataSql = `
      SELECT p.*,
             q.quotation_number,
             q.customer_name,
             q.net_total as quotation_net_total,
             u.full_name as recorded_by_name,
             u.role as recorded_by_role,
             COALESCE(p.verified_by_name, uv.full_name) as verified_by_name,
             uv.role as verified_by_role
      FROM payments p
      JOIN quotations q ON q.id = p.quotation_id
      LEFT JOIN users u ON u.id = p.recorded_by_id
      LEFT JOIN users uv ON uv.id = p.verified_by_id
      WHERE ${whereSql}
      ORDER BY p.payment_date DESC, p.id DESC
      LIMIT $${idx} OFFSET $${idx + 1}
    `;

    params.push(limit, offset);
    const rows = await query(dataSql, params);

    res.json({
      payments: rows,
      pagination: {
        page,
        limit,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
      summary: {
        totalPayments: totalCount,
        totalCollected,
        verifiedAmount,
        pendingAmount,
        verifiedCount,
        pendingCount,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 2. Record Payment (Advance / Milestone Payment)
// Salespeople entries default to status 'Recorded' (Not Verified)
// Accounts/Admins can record directly as 'Cleared' (Verified) or 'Recorded'
paymentsRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { quotation_id, amount, payment_mode, payment_date, reference_number, notes, is_verified } = req.body;

    const parsedAmount = parseFloat(amount);
    if (!quotation_id || isNaN(parsedAmount) || parsedAmount <= 0 || !payment_mode) {
      res.status(400).json({ error: 'Valid quotation, positive amount, and payment mode are required' });
      return;
    }

    const isSalesperson = req.user?.role?.toLowerCase() === 'salesperson';
    // If salesperson: always Recorded (Not Verified)
    // If admin or manager: default to Cleared unless is_verified is explicitly false
    const initialStatus = isSalesperson ? 'Recorded' : (is_verified === false ? 'Recorded' : 'Cleared');

    const result = await withTransaction(async (client) => {
      // Validate quotation and check outstanding balance
      const qRes = await client.query(
        `SELECT q.id, q.quotation_number, q.customer_name, q.net_total,
                COALESCE(p.total_paid, 0) as total_paid
         FROM quotations q
         LEFT JOIN (
           SELECT quotation_id, SUM(amount) as total_paid
           FROM payments WHERE status IN ('Cleared', 'Verified') GROUP BY quotation_id
         ) p ON p.quotation_id = q.id
         WHERE q.id = $1 FOR UPDATE OF q`,
        [quotation_id]
      );

      if (qRes.rows.length === 0) {
        throw new Error('Quotation not found');
      }

      const q = qRes.rows[0];
      const outstanding = parseFloat(q.net_total) - parseFloat(q.total_paid);

      // Warning if payment exceeds outstanding balance by more than rounding
      if (parsedAmount > outstanding + 1.0) {
        throw new Error(
          `Payment amount (INR ${parsedAmount.toFixed(2)}) exceeds outstanding balance (INR ${outstanding.toFixed(2)})`
        );
      }

      // Check duplicate payment submission within last 60 seconds with same amount and ref
      if (reference_number) {
        const dupCheck = await client.query(
          `SELECT id FROM payments
           WHERE quotation_id = $1 AND amount = $2 AND reference_number = $3
             AND created_at > NOW() - INTERVAL '60 seconds'`,
          [quotation_id, parsedAmount, reference_number.trim()]
        );
        if (dupCheck.rows.length > 0) {
          throw new Error('Duplicate payment submission detected. Please wait.');
        }
      }

      const paymentNumber = await generateNextPaymentNumber(client);

      const verifiedById = initialStatus === 'Cleared' ? req.user!.id : null;
      const verifiedByName = initialStatus === 'Cleared' ? req.user!.full_name : null;
      const verifiedAt = initialStatus === 'Cleared' ? new Date() : null;

      const pRes = await client.query(
        `INSERT INTO payments (
          payment_number, quotation_id, amount, payment_mode, payment_date,
          status, reference_number, notes, recorded_by_id,
          verified_by_id, verified_by_name, verified_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *`,
        [
          paymentNumber,
          quotation_id,
          parsedAmount,
          payment_mode,
          payment_date || new Date().toISOString().split('T')[0],
          initialStatus,
          reference_number?.trim() || null,
          notes || '',
          req.user!.id,
          verifiedById,
          verifiedByName,
          verifiedAt,
        ]
      );

      const payment = pRes.rows[0];

      // If verified and fully paid, optionally update quotation status to 'closed'
      if (initialStatus === 'Cleared' && parsedAmount >= outstanding - 0.5) {
        await client.query(
          `UPDATE quotations SET status = 'closed', updated_at = NOW() WHERE id = $1`,
          [quotation_id]
        );
      }

      await recordAuditLog({
        userId: req.user!.id,
        username: req.user!.username,
        action: initialStatus === 'Cleared' ? 'PAYMENT_RECORDED_AND_VERIFIED' : 'PAYMENT_RECORDED_PENDING_VERIFICATION',
        entityType: 'payment',
        entityId: payment.id,
        details: {
          payment_number: payment.payment_number,
          amount: parsedAmount,
          status: initialStatus,
          quotation_id,
          quotation_number: q.quotation_number,
          recorded_by_name: req.user!.full_name,
        },
        ipAddress: req.ip,
      });

      return { payment, quotation: q };
    });

    broadcast({
      type: 'PAYMENT_RECORDED',
      payload: {
        id: result.payment.id,
        quotation_id: result.payment.quotation_id,
        amount: result.payment.amount,
        status: result.payment.status,
      },
    });

    res.status(201).json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// 3. Accounts Verification Endpoint (Verify / Unverify payment receipt)
// Only Managers / Admins / Accounts team members can perform this action
paymentsRouter.patch('/:id/verify', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    const { verified = true, notes } = req.body;

    const userRole = req.user?.role?.toLowerCase();
    if (userRole === 'salesperson') {
      res.status(403).json({ error: 'Permission denied: Only Accounts / Management can verify payment receipts.' });
      return;
    }

    const updatedPayment = await withTransaction(async (client) => {
      // Find existing payment
      const pRes = await client.query(
        `SELECT p.*, q.net_total, q.quotation_number, q.status as quotation_status
         FROM payments p
         JOIN quotations q ON q.id = p.quotation_id
         WHERE p.id = $1 FOR UPDATE OF p`,
        [id]
      );

      if (pRes.rows.length === 0) {
        throw new Error('Payment receipt not found');
      }

      const currentPayment = pRes.rows[0];

      let newStatus: string;
      let verifiedById: number | null = null;
      let verifiedByName: string | null = null;
      let verifiedAt: Date | null = null;

      if (verified) {
        newStatus = 'Cleared';
        verifiedById = req.user!.id;
        verifiedByName = req.user!.full_name;
        verifiedAt = new Date();
      } else {
        newStatus = 'Recorded';
        verifiedById = null;
        verifiedByName = null;
        verifiedAt = null;
      }

      const updateRes = await client.query(
        `UPDATE payments
         SET status = $1,
             verified_by_id = $2,
             verified_by_name = $3,
             verified_at = $4,
             verification_notes = COALESCE($5, verification_notes),
             updated_at = NOW()
         WHERE id = $6
         RETURNING *`,
        [newStatus, verifiedById, verifiedByName, verifiedAt, notes || null, id]
      );

      const payment = updateRes.rows[0];

      // Re-evaluate quotation paid balance
      const paidRes = await client.query(
        `SELECT COALESCE(SUM(amount), 0) as total_cleared
         FROM payments
         WHERE quotation_id = $1 AND status IN ('Cleared', 'Verified')`,
        [payment.quotation_id]
      );
      const totalCleared = parseFloat(paidRes.rows[0]?.total_cleared || '0');
      const netTotal = parseFloat(currentPayment.net_total || '0');

      if (verified && totalCleared >= netTotal - 0.5) {
        // If quotation fully paid and not closed, set to closed
        await client.query(
          `UPDATE quotations SET status = 'closed', updated_at = NOW() WHERE id = $1`,
          [payment.quotation_id]
        );
      } else if (!verified && currentPayment.quotation_status === 'closed' && totalCleared < netTotal - 0.5) {
        // If unverified removed full payment on a closed quotation, revert to approved
        await client.query(
          `UPDATE quotations SET status = 'approved', updated_at = NOW() WHERE id = $1`,
          [payment.quotation_id]
        );
      }

      await recordAuditLog({
        userId: req.user!.id,
        username: req.user!.username,
        action: verified ? 'PAYMENT_ACCOUNTS_VERIFIED' : 'PAYMENT_ACCOUNTS_UNVERIFIED',
        entityType: 'payment',
        entityId: payment.id,
        details: {
          payment_number: payment.payment_number,
          amount: payment.amount,
          status: newStatus,
          quotation_id: payment.quotation_id,
          verified_by_name: verified ? req.user!.full_name : null,
          verification_notes: notes || null,
        },
        ipAddress: req.ip,
      });

      return payment;
    });

    broadcast({
      type: 'PAYMENT_RECORDED',
      payload: {
        id: updatedPayment.id,
        quotation_id: updatedPayment.quotation_id,
        status: updatedPayment.status,
      },
    });

    res.json({
      success: true,
      message: verified ? 'Payment receipt verified by accounts.' : 'Payment receipt marked as unverified.',
      payment: updatedPayment,
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});
