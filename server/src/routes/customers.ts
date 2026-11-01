import { Router, Request, Response } from 'express';
import { query } from '../db/connection';
import { authenticateToken } from '../middleware/auth';
import { recordAuditLog } from '../utils/audit';
import { broadcast } from '../ws';

export const customersRouter = Router();

customersRouter.use(authenticateToken);

// Paginated customer list with debounced search and salesperson scoping
customersRouter.get('/', async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 20));
    const offset = (page - 1) * limit;
    const search = (req.query.search as string || '').trim();
    const isSalesperson = req.user?.role?.toLowerCase() === 'salesperson';

    let whereClause = 'WHERE c.is_active = true';
    const params: any[] = [];
    let idx = 1;

    // Salespersons can only view their own customers (created by them or on their quotations)
    if (isSalesperson) {
      whereClause += ` AND (c.created_by_id = $${idx} OR c.id IN (
        SELECT DISTINCT customer_id FROM quotations
        WHERE customer_id IS NOT NULL AND (sales_person_id = $${idx} OR assisted_sales_person_id = $${idx})
      ))`;
      params.push(req.user!.id);
      idx++;
    }

    if (search) {
      whereClause += ` AND (c.name ILIKE $${idx} OR c.mobile_number ILIKE $${idx} OR c.site_location ILIKE $${idx})`;
      params.push(`%${search}%`);
      idx++;
    }

    const countRes = await query<{ count: string }>(
      `SELECT count(*) FROM customers c ${whereClause}`,
      params
    );
    const totalCount = parseInt(countRes[0].count, 10);

    const dataSql = `
      SELECT c.*,
        COALESCE(q_all.quotations_count, 0) as quotations_count,
        COALESCE(q_all.total_quoted, 0) as total_quoted,
        COALESCE(q_closed.closed_count, 0) as closed_count,
        COALESCE(q_closed.closed_total, 0) as closed_total
      FROM customers c
      LEFT JOIN (
        SELECT customer_id, count(*) as quotations_count, sum(net_total) as total_quoted
        FROM quotations
        ${isSalesperson ? `WHERE sales_person_id = ${req.user!.id} OR assisted_sales_person_id = ${req.user!.id}` : ''}
        GROUP BY customer_id
      ) q_all ON q_all.customer_id = c.id
      LEFT JOIN (
        SELECT customer_id, count(*) as closed_count, sum(net_total) as closed_total
        FROM quotations
        WHERE LOWER(status) IN ('approved', 'closed')
        ${isSalesperson ? `AND (sales_person_id = ${req.user!.id} OR assisted_sales_person_id = ${req.user!.id})` : ''}
        GROUP BY customer_id
      ) q_closed ON q_closed.customer_id = c.id
      ${whereClause}
      ORDER BY c.created_at DESC
      LIMIT $${idx} OFFSET $${idx + 1}
    `;

    params.push(limit, offset);
    const rows = await query(dataSql, params);

    res.json({
      customers: rows,
      pagination: {
        page,
        limit,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Fast customer lookup by phone, name, email, or address for autocomplete popup (scoped for salespersons)
customersRouter.get('/lookup', async (req: Request, res: Response) => {
  try {
    const q = ((req.query.q as string) || '').trim();
    if (!q) {
      res.json({ customers: [] });
      return;
    }
    const cleanDigits = q.replace(/\D/g, '');
    const isSalesperson = req.user?.role?.toLowerCase() === 'salesperson';

    let sql = `
      SELECT id, name, mobile_number, email, delivery_address, site_location, gstin, notes
      FROM customers c
      WHERE c.is_active = true
    `;
    const params: any[] = [];
    let idx = 1;

    if (isSalesperson) {
      sql += ` AND (c.created_by_id = $${idx} OR c.id IN (
        SELECT DISTINCT customer_id FROM quotations
        WHERE customer_id IS NOT NULL AND (sales_person_id = $${idx} OR assisted_sales_person_id = $${idx})
      ))`;
      params.push(req.user!.id);
      idx++;
    }

    sql += ` AND (
      c.name ILIKE $${idx} 
      OR c.mobile_number ILIKE $${idx} 
      OR c.site_location ILIKE $${idx} 
      OR c.email ILIKE $${idx} 
      OR c.gstin ILIKE $${idx}
    `;
    params.push(`%${q}%`);
    idx++;

    if (cleanDigits.length >= 3) {
      sql += ` OR REPLACE(c.mobile_number, ' ', '') ILIKE $${idx}`;
      params.push(`%${cleanDigits}%`);
      idx++;
    }
    sql += `) ORDER BY c.name ASC LIMIT 10`;

    const rows = await query(sql, params);
    res.json({ customers: rows });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get single customer with their quotations (scoped for salesperson)
customersRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    const isSalesperson = req.user?.role?.toLowerCase() === 'salesperson';

    const custRows = await query('SELECT * FROM customers WHERE id = $1', [id]);
    if (custRows.length === 0) {
      res.status(404).json({ error: 'Customer not found' });
      return;
    }

    if (isSalesperson) {
      const allowed = await query(
        `SELECT 1 FROM customers c
         WHERE c.id = $1 AND (
           c.created_by_id = $2
           OR EXISTS (
             SELECT 1 FROM quotations q
             WHERE q.customer_id = c.id AND (q.sales_person_id = $2 OR q.assisted_sales_person_id = $2)
           )
         )`,
        [id, req.user!.id]
      );
      if (allowed.length === 0) {
        res.status(403).json({ error: 'You only have access to view your own customers and deals.' });
        return;
      }
    }

    const quotations = await query(
      `SELECT q.id, q.quotation_number, q.quotation_date, q.status, q.gross_total, q.net_total,
              q.project_name, q.quotation_type, q.created_at, q.approved_by_id,
              u_app.full_name as approved_by_name, q.approved_at
       FROM quotations q
       LEFT JOIN users u_app ON u_app.id = q.approved_by_id
       WHERE q.customer_id = $1
       ${isSalesperson ? `AND (q.sales_person_id = ${req.user!.id} OR q.assisted_sales_person_id = ${req.user!.id})` : ''}
       ORDER BY q.quotation_date DESC, q.id DESC`,
      [id]
    );

    res.json({
      customer: custRows[0],
      quotations,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create new customer
customersRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { name, mobile_number, email, delivery_address, site_location, gstin, notes } = req.body;

    if (!name || !mobile_number) {
      res.status(400).json({ error: 'Customer name and mobile number are required' });
      return;
    }

    const rows = await query(
      `INSERT INTO customers (name, mobile_number, email, delivery_address, site_location, gstin, notes, created_by_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        name.trim(),
        mobile_number.trim(),
        email?.trim() || null,
        delivery_address?.trim() || '',
        site_location?.trim() || '',
        gstin?.trim() || '',
        notes || '',
        req.user!.id,
      ]
    );

    await recordAuditLog({
      userId: req.user!.id,
      username: req.user!.username,
      action: 'CUSTOMER_CREATED',
      entityType: 'customer',
      entityId: rows[0].id,
      details: { name, mobile_number },
      ipAddress: req.ip,
    });

    broadcast({ type: 'CUSTOMER_UPDATED', payload: { id: rows[0].id, name: rows[0].name } });

    res.status(201).json({ customer: rows[0] });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update customer
customersRouter.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    const { name, mobile_number, email, delivery_address, site_location, gstin, notes, is_active } = req.body;
    const isSalesperson = req.user?.role?.toLowerCase() === 'salesperson';

    if (isSalesperson) {
      const allowed = await query(
        `SELECT 1 FROM customers c
         WHERE c.id = $1 AND (
           c.created_by_id = $2
           OR EXISTS (
             SELECT 1 FROM quotations q
             WHERE q.customer_id = c.id AND (q.sales_person_id = $2 OR q.assisted_sales_person_id = $2)
           )
         )`,
        [id, req.user!.id]
      );
      if (allowed.length === 0) {
        res.status(403).json({ error: 'You only have permission to edit your own customers.' });
        return;
      }
    }

    const rows = await query(
      `UPDATE customers
       SET name = COALESCE($1, name),
           mobile_number = COALESCE($2, mobile_number),
           email = COALESCE($3, email),
           delivery_address = COALESCE($4, delivery_address),
           site_location = COALESCE($5, site_location),
           gstin = COALESCE($6, gstin),
           notes = COALESCE($7, notes),
           is_active = COALESCE($8, is_active),
           updated_at = NOW()
       WHERE id = $9
       RETURNING *`,
      [name, mobile_number, email, delivery_address, site_location, gstin, notes, is_active, id]
    );

    if (rows.length === 0) {
      res.status(404).json({ error: 'Customer not found' });
      return;
    }

    await recordAuditLog({
      userId: req.user!.id,
      username: req.user!.username,
      action: 'CUSTOMER_UPDATED',
      entityType: 'customer',
      entityId: id,
      ipAddress: req.ip,
    });

    broadcast({ type: 'CUSTOMER_UPDATED', payload: { id, name: rows[0].name } });

    res.json({ customer: rows[0] });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
