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
paymentsRouter.get('/:id/receipt', optionalAuthenticateToken, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);

    const pRows = await query(
      `SELECT p.*,
              q.quotation_number,
              q.customer_name,
              q.customer_phone,
              q.delivery_address,
              q.net_total as quotation_net_total,
              u.full_name as recorded_by_name
       FROM payments p
       JOIN quotations q ON q.id = p.quotation_id
       LEFT JOIN users u ON u.id = p.recorded_by_id
       WHERE p.id = $1`,
      [id]
    );

    if (pRows.length === 0) {
      res.status(404).json({ error: 'Payment receipt not found' });
      return;
    }

    const payment = pRows[0];
    const companyRows = await query('SELECT * FROM company_settings LIMIT 1');
    const company = companyRows[0] || {
      company_name: 'AMA Ceramics Pvt Ltd',
      address_line1: 'Survey No. 48, Near NH-48 Showroom Corridor',
      address_line2: 'Bengaluru, Karnataka 560068',
      phone: '+91 98450 12345',
      gstin: '29AABCA1234F1Z5',
    };

    const doc = new PDFDocument({ size: 'A5', layout: 'landscape', margin: 25 });

    // Stream directly
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="Receipt_${payment.payment_number}.pdf"`);
    doc.pipe(res);

    const primaryColor = '#1B365D';
    doc.rect(25, 25, 545, 370).stroke('#B0B9C2');

    // Header
    let hasLogo = false;
    if (company.logo_base64) {
      try {
        const base64Clean = company.logo_base64.replace(/^data:image\/\w+;base64,/, '');
        const imgBuffer = Buffer.from(base64Clean, 'base64');
        doc.image(imgBuffer, 35, 30, { fit: [50, 48], align: 'center', valign: 'center' });
        hasLogo = true;
      } catch (err) {
        hasLogo = false;
      }
    }
    const textX = hasLogo ? 95 : 35;
    doc.fontSize(14).font('Helvetica-Bold').fillColor(primaryColor).text(company.company_name || 'Receipt', textX, 35);
    const addr = [company.address_line1, company.address_line2].filter(Boolean).join(', ');
    if (addr) doc.fontSize(8).font('Helvetica').fillColor('#555555').text(addr, textX, 52);
    const contact = [company.phone ? `Phone: ${company.phone}` : '', company.gstin ? `GSTIN: ${company.gstin}` : ''].filter(Boolean).join(' | ');
    if (contact) doc.fontSize(8).font('Helvetica').fillColor('#555555').text(contact, textX, 64);

    doc.fontSize(16).font('Helvetica-Bold').fillColor(primaryColor).text('PAYMENT RECEIPT', 380, 35, { align: 'right', width: 180 });
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#222222').text(`Receipt No: ${payment.payment_number}`, 380, 55, { align: 'right', width: 180 });
    doc.fontSize(8).font('Helvetica').text(`Date: ${new Date(payment.payment_date).toLocaleDateString('en-GB')}`, 380, 68, { align: 'right', width: 180 });

    doc.moveTo(35, 82).lineTo(560, 82).stroke('#D0D7DE');

    // Body
    let y = 95;
    const renderField = (label: string, val: string) => {
      doc.fontSize(9).font('Helvetica-Bold').fillColor(primaryColor).text(label, 40, y, { width: 140 });
      doc.fontSize(9).font('Helvetica').fillColor('#222222').text(val, 190, y, { width: 360 });
      y += 20;
    };

    renderField('Received From:', payment.customer_name);
    renderField('Contact Number:', payment.customer_phone);
    renderField('Against Quotation Ref:', payment.quotation_number);
    renderField('Payment Mode:', payment.payment_mode);
    if (payment.reference_number) {
      renderField('Ref / Txn No / Cheque:', payment.reference_number);
    }

    // Amount Box
    doc.rect(40, y + 5, 510, 40).fillAndStroke('#F4F6F9', primaryColor);
    doc.fontSize(13).font('Helvetica-Bold').fillColor(primaryColor).text(`AMOUNT RECEIVED: INR ${Number(payment.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, 50, y + 15);
    doc.fontSize(8).font('Helvetica-Oblique').fillColor('#333333').text(numberToWordsIndian(payment.amount), 50, y + 30, { width: 490 });
    y += 60;

    // Signatures
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#222222').text('Authorized Signatory', 420, y + 25);
    doc.text(`${company.company_name}`, 420, y + 40);

    doc.end();
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

paymentsRouter.use(authenticateToken);

// 1. List Payments (Paginated with filters)
paymentsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 20));
    const offset = (page - 1) * limit;
    const quotationId = req.query.quotation_id ? parseInt(req.query.quotation_id as string, 10) : null;
    const paymentMode = req.query.payment_mode as string;
    const status = req.query.status as string;

    const whereClauses: string[] = ['1=1'];
    const params: any[] = [];
    let idx = 1;

    if (quotationId) {
      whereClauses.push(`p.quotation_id = $${idx++}`);
      params.push(quotationId);
    }
    if (paymentMode) {
      whereClauses.push(`p.payment_mode = $${idx++}`);
      params.push(paymentMode);
    }
    if (status) {
      whereClauses.push(`p.status = $${idx++}`);
      params.push(status);
    }

    const whereSql = whereClauses.join(' AND ');

    const countRes = await query<{ count: string; total_amount: string }>(
      `SELECT count(*) as count, COALESCE(sum(amount), 0) as total_amount FROM payments p WHERE ${whereSql}`,
      params
    );
    const totalCount = parseInt(countRes[0].count, 10);
    const totalCollected = parseFloat(countRes[0].total_amount);

    const dataSql = `
      SELECT p.*,
             q.quotation_number,
             q.customer_name,
             q.net_total as quotation_net_total,
             u.full_name as recorded_by_name
      FROM payments p
      JOIN quotations q ON q.id = p.quotation_id
      LEFT JOIN users u ON u.id = p.recorded_by_id
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
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 2. Record Payment (Advance / Milestone Payment)
paymentsRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { quotation_id, amount, payment_mode, payment_date, reference_number, notes } = req.body;

    const parsedAmount = parseFloat(amount);
    if (!quotation_id || isNaN(parsedAmount) || parsedAmount <= 0 || !payment_mode) {
      res.status(400).json({ error: 'Valid quotation, positive amount, and payment mode are required' });
      return;
    }

    const result = await withTransaction(async (client) => {
      // Validate quotation and check outstanding balance
      const qRes = await client.query(
        `SELECT q.id, q.quotation_number, q.customer_name, q.net_total,
                COALESCE(p.total_paid, 0) as total_paid
         FROM quotations q
         LEFT JOIN (
           SELECT quotation_id, SUM(amount) as total_paid
           FROM payments WHERE status = 'Cleared' GROUP BY quotation_id
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

      const pRes = await client.query(
        `INSERT INTO payments (
          payment_number, quotation_id, amount, payment_mode, payment_date,
          status, reference_number, notes, recorded_by_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *`,
        [
          paymentNumber,
          quotation_id,
          parsedAmount,
          payment_mode,
          payment_date || new Date().toISOString().split('T')[0],
          'Cleared',
          reference_number?.trim() || null,
          notes || '',
          req.user!.id,
        ]
      );

      const payment = pRes.rows[0];

      // If fully paid, optionally update quotation status to 'closed'
      if (parsedAmount >= outstanding - 0.5) {
        await client.query(
          `UPDATE quotations SET status = 'closed', updated_at = NOW() WHERE id = $1`,
          [quotation_id]
        );
      }

      await recordAuditLog({
        userId: req.user!.id,
        username: req.user!.username,
        action: 'PAYMENT_RECORDED',
        entityType: 'payment',
        entityId: payment.id,
        details: {
          payment_number: payment.paymentNumber,
          amount: parsedAmount,
          quotation_id,
          quotation_number: q.quotation_number,
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
      },
    });

    res.status(201).json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

