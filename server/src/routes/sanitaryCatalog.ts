import { Router, Request, Response } from 'express';
import { query } from '../db/connection';
import { authenticateToken, requireRole } from '../middleware/auth';
import { recordAuditLog } from '../utils/audit';

export const sanitaryCatalogRouter = Router();

sanitaryCatalogRouter.use(authenticateToken);

// 1. Fast Autocomplete & Direct Lookup by Item Code
sanitaryCatalogRouter.get('/lookup', async (req: Request, res: Response) => {
  try {
    const rawCode = (req.query.code as string || '').trim();
    const rawQuery = (req.query.q as string || '').trim();

    let matchedItem: any = null;
    let suggestions: any[] = [];

    // Exact or Prefix Code Lookup
    if (rawCode) {
      // 1. Exact match (prioritizing items with real photos)
      const exactRows = await query(
        `SELECT * FROM sanitary_catalog_items 
         WHERE LOWER(item_code) = LOWER($1) AND is_active = true 
         ORDER BY CASE WHEN item_image IS NOT NULL AND length(item_image) > 500 THEN 0 ELSE 1 END, id DESC
         LIMIT 1`,
        [rawCode]
      );

      if (exactRows.length > 0) {
        matchedItem = exactRows[0];
      } else {
        // 2. Try relaxed match (e.g. ignoring dashes or whitespace)
        const clean = rawCode.replace(/[\s\-_]/g, '').toLowerCase();
        const relaxedRows = await query(
          `SELECT * FROM sanitary_catalog_items 
           WHERE LOWER(REPLACE(REPLACE(REPLACE(item_code, '-', ''), '_', ''), ' ', '')) = $1 
             AND is_active = true 
           ORDER BY CASE WHEN item_image IS NOT NULL AND length(item_image) > 500 THEN 0 ELSE 1 END, id DESC
           LIMIT 1`,
          [clean]
        );
        if (relaxedRows.length > 0) {
          matchedItem = relaxedRows[0];
        } else {
          // 3. Try slash variant or suffix match (e.g. user typed '510001' or 'KB2311035' and code is 'KA510001' or 'KB2211035 / KB2311035-CP')
          const variantRows = await query(
            `SELECT * FROM sanitary_catalog_items 
             WHERE (item_code ILIKE $1 OR item_code ILIKE $2)
               AND is_active = true 
             ORDER BY CASE WHEN item_image IS NOT NULL AND length(item_image) > 500 THEN 0 ELSE 1 END, id DESC
             LIMIT 1`,
            [`%${rawCode}%`, `%${rawCode}`]
          );
          if (variantRows.length > 0) {
            matchedItem = variantRows[0];
          }
        }
      }
    }

    // Autocomplete / suggestions
    const searchTerm = rawQuery || rawCode;
    if (searchTerm.length >= 1) {
      const suggestRows = await query(
        `SELECT id, item_code, brand, category, item_description, mrp_price, item_image, catalog_name 
         FROM sanitary_catalog_items 
         WHERE is_active = true 
           AND (
             item_code ILIKE $1 
             OR item_description ILIKE $1 
             OR brand ILIKE $1
           )
         ORDER BY 
           CASE WHEN item_image IS NOT NULL AND length(item_image) > 500 THEN 0 ELSE 1 END,
           CASE WHEN LOWER(item_code) = LOWER($2) THEN 0
                WHEN item_code ILIKE $3 THEN 1 
                ELSE 2 END,
           item_code ASC
         LIMIT 12`,
        [`%${searchTerm}%`, searchTerm, `${searchTerm}%`]
      );
      suggestions = suggestRows;
      if (!matchedItem && suggestions.length > 0) {
        const exact = suggestions.find((s) => s.item_code.toLowerCase() === searchTerm.toLowerCase());
        if (exact) matchedItem = exact;
      }
    }

    res.json({
      item: matchedItem,
      suggestions,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 2. Paginated Catalog List with Brand/Category Filters
sanitaryCatalogRouter.get('/', async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string || '25', 10)));
    const offset = (page - 1) * limit;

    const search = (req.query.search as string || '').trim();
    const brand = (req.query.brand as string || '').trim();
    const category = (req.query.category as string || '').trim();

    const whereClauses: string[] = ['is_active = true'];
    const params: any[] = [];
    let paramIndex = 1;

    if (search) {
      whereClauses.push(`(item_code ILIKE $${paramIndex} OR item_description ILIKE $${paramIndex} OR brand ILIKE $${paramIndex} OR category ILIKE $${paramIndex})`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (brand && brand !== 'all') {
      whereClauses.push(`brand = $${paramIndex}`);
      params.push(brand);
      paramIndex++;
    }

    if (category && category !== 'all') {
      whereClauses.push(`category = $${paramIndex}`);
      params.push(category);
      paramIndex++;
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const countRes = await query(`SELECT COUNT(*) FROM sanitary_catalog_items ${whereSql}`, params);
    const total = parseInt(countRes[0]?.count || '0', 10);

    const items = await query(
      `SELECT id, item_code, brand, category, item_description, mrp_price, item_image, catalog_name, page_number, created_at, updated_at 
       FROM sanitary_catalog_items 
       ${whereSql} 
       ORDER BY brand ASC, item_code ASC 
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset]
    );

    // Fetch distinct brands and categories for quick filtering
    const [brandsRes, categoriesRes] = await Promise.all([
      query(`SELECT DISTINCT brand FROM sanitary_catalog_items WHERE is_active = true AND brand IS NOT NULL AND brand != '' ORDER BY brand ASC`),
      query(`SELECT DISTINCT category FROM sanitary_catalog_items WHERE is_active = true AND category IS NOT NULL AND category != '' ORDER BY category ASC`),
    ]);

    res.json({
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
      brands: brandsRes.map((r: any) => r.brand),
      categories: categoriesRes.map((r: any) => r.category),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

let schemaVerified = false;
export async function ensureSanitaryCatalogSchema() {
  if (schemaVerified) return;
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS sanitary_catalog_items (
        id SERIAL PRIMARY KEY,
        item_code VARCHAR(100) NOT NULL,
        brand VARCHAR(150) NOT NULL DEFAULT 'Sanitary',
        category VARCHAR(100) NOT NULL DEFAULT 'General',
        item_description TEXT NOT NULL,
        mrp_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
        item_image TEXT,
        catalog_name VARCHAR(255),
        page_number INTEGER,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      -- Deduplicate if any duplicates exist before adding UNIQUE constraint
      DELETE FROM sanitary_catalog_items a
      USING sanitary_catalog_items b
      WHERE a.item_code = b.item_code
        AND a.id < b.id;

      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint 
          WHERE conname = 'sanitary_catalog_items_item_code_key' 
            AND conrelid = 'sanitary_catalog_items'::regclass
        ) THEN
          ALTER TABLE sanitary_catalog_items 
            ADD CONSTRAINT sanitary_catalog_items_item_code_key UNIQUE (item_code);
        END IF;
      END $$;

      CREATE UNIQUE INDEX IF NOT EXISTS idx_sanitary_catalog_code_unique ON sanitary_catalog_items (item_code);
      CREATE INDEX IF NOT EXISTS idx_sanitary_catalog_code ON sanitary_catalog_items (item_code);
      CREATE INDEX IF NOT EXISTS idx_sanitary_catalog_brand ON sanitary_catalog_items (brand);
      CREATE INDEX IF NOT EXISTS idx_sanitary_catalog_category ON sanitary_catalog_items (category);
    `);
    schemaVerified = true;
  } catch (err: any) {
    console.error('ensureSanitaryCatalogSchema notice:', err.message);
  }
}

async function upsertCatalogItem(item: any, catalog_name?: string): Promise<any[]> {
  await ensureSanitaryCatalogSchema();

  const code = (item.item_code || '').trim();
  const brand = (item.brand || 'Sanitary').trim();
  const category = (item.category || 'General').trim();
  const description = (item.item_description || item.description || item.item_code || 'Sanitary Item').trim();
  const mrp = parseFloat(item.mrp_price || item.mrp || 0) || 0;
  const image = item.item_image || null;
  const catName = (catalog_name || item.catalog_name || 'Imported Catalog').trim();
  const pageNum = item.page_number ? parseInt(item.page_number, 10) : null;

  try {
    return await query(
      `INSERT INTO sanitary_catalog_items 
        (item_code, brand, category, item_description, mrp_price, item_image, catalog_name, page_number, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
       ON CONFLICT (item_code) DO UPDATE SET
        brand = EXCLUDED.brand,
        category = EXCLUDED.category,
        item_description = CASE 
          WHEN LOWER(EXCLUDED.item_description) LIKE 'per piece%' 
            OR LOWER(EXCLUDED.item_description) LIKE 'also available%' 
            OR LOWER(EXCLUDED.item_description) LIKE 'compatible%'
            OR LOWER(EXCLUDED.item_description) LIKE '(comp%' THEN sanitary_catalog_items.item_description
          WHEN length(sanitary_catalog_items.item_description) > length(EXCLUDED.item_description) + 15 
            AND sanitary_catalog_items.item_image IS NOT NULL AND length(sanitary_catalog_items.item_image) > 500 THEN sanitary_catalog_items.item_description
          ELSE EXCLUDED.item_description
        END,
        mrp_price = CASE 
          WHEN EXCLUDED.mrp_price > 0 THEN EXCLUDED.mrp_price 
          ELSE sanitary_catalog_items.mrp_price 
        END,
        item_image = CASE 
          WHEN EXCLUDED.item_image IS NOT NULL AND length(EXCLUDED.item_image) > 500 THEN EXCLUDED.item_image 
          ELSE sanitary_catalog_items.item_image 
        END,
        catalog_name = COALESCE(EXCLUDED.catalog_name, sanitary_catalog_items.catalog_name),
        page_number = CASE 
          WHEN sanitary_catalog_items.item_image IS NOT NULL AND length(sanitary_catalog_items.item_image) > 500 AND (EXCLUDED.item_image IS NULL OR length(EXCLUDED.item_image) <= 500) THEN sanitary_catalog_items.page_number
          ELSE COALESCE(EXCLUDED.page_number, sanitary_catalog_items.page_number)
        END,
        updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [code, brand, category, description, mrp, image, catName, pageNum]
    );
  } catch (err: any) {
    if (err.message && (err.message.includes('ON CONFLICT') || err.message.includes('unique or exclusion constraint'))) {
      try {
        await query(`
          DELETE FROM sanitary_catalog_items a USING sanitary_catalog_items b
          WHERE a.item_code = b.item_code AND a.id < b.id;
          DO $$
          BEGIN
            IF NOT EXISTS (
              SELECT 1 FROM pg_constraint 
              WHERE conname = 'sanitary_catalog_items_item_code_key' 
                AND conrelid = 'sanitary_catalog_items'::regclass
            ) THEN
              ALTER TABLE sanitary_catalog_items ADD CONSTRAINT sanitary_catalog_items_item_code_key UNIQUE (item_code);
            END IF;
          END $$;
        `);
        return await query(
          `INSERT INTO sanitary_catalog_items 
            (item_code, brand, category, item_description, mrp_price, item_image, catalog_name, page_number, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
           ON CONFLICT (item_code) DO UPDATE SET
            brand = EXCLUDED.brand,
            category = EXCLUDED.category,
            item_description = CASE 
              WHEN LOWER(EXCLUDED.item_description) LIKE 'per piece%' 
                OR LOWER(EXCLUDED.item_description) LIKE 'also available%' 
                OR LOWER(EXCLUDED.item_description) LIKE 'compatible%'
                OR LOWER(EXCLUDED.item_description) LIKE '(comp%' THEN sanitary_catalog_items.item_description
              WHEN length(sanitary_catalog_items.item_description) > length(EXCLUDED.item_description) + 15 
                AND sanitary_catalog_items.item_image IS NOT NULL AND length(sanitary_catalog_items.item_image) > 500 THEN sanitary_catalog_items.item_description
              ELSE EXCLUDED.item_description
            END,
            mrp_price = CASE 
              WHEN EXCLUDED.mrp_price > 0 THEN EXCLUDED.mrp_price 
              ELSE sanitary_catalog_items.mrp_price 
            END,
            item_image = CASE 
              WHEN EXCLUDED.item_image IS NOT NULL AND length(EXCLUDED.item_image) > 500 THEN EXCLUDED.item_image 
              ELSE sanitary_catalog_items.item_image 
            END,
            catalog_name = COALESCE(EXCLUDED.catalog_name, sanitary_catalog_items.catalog_name),
            page_number = CASE 
              WHEN sanitary_catalog_items.item_image IS NOT NULL AND length(sanitary_catalog_items.item_image) > 500 AND (EXCLUDED.item_image IS NULL OR length(EXCLUDED.item_image) <= 500) THEN sanitary_catalog_items.page_number
              ELSE COALESCE(EXCLUDED.page_number, sanitary_catalog_items.page_number)
            END,
            updated_at = CURRENT_TIMESTAMP
           RETURNING *`,
          [code, brand, category, description, mrp, image, catName, pageNum]
        );
      } catch (retryErr) {
        // Fallback: SELECT then UPDATE/INSERT
        const existing = await query(
          `SELECT id, item_image, item_description, page_number FROM sanitary_catalog_items WHERE item_code = $1 LIMIT 1`,
          [code]
        );
        if (existing.length > 0) {
          const row = existing[0];
          const keepDesc = row.item_image && row.item_image.length > 500 && (!image || image.length <= 500);
          const finalDesc = keepDesc ? row.item_description : description;
          const finalImg = image && image.length > 500 ? image : row.item_image;
          const finalPage = keepDesc ? row.page_number : pageNum || row.page_number;
          return await query(
            `UPDATE sanitary_catalog_items 
             SET brand = $1, category = $2, item_description = $3, mrp_price = CASE WHEN $4 > 0 THEN $4 ELSE mrp_price END,
                 item_image = $5, catalog_name = COALESCE($6, catalog_name), page_number = $7, updated_at = CURRENT_TIMESTAMP
             WHERE id = $8 RETURNING *`,
            [brand, category, finalDesc, mrp, finalImg, catName, finalPage, row.id]
          );
        } else {
          return await query(
            `INSERT INTO sanitary_catalog_items 
              (item_code, brand, category, item_description, mrp_price, item_image, catalog_name, page_number, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP) RETURNING *`,
            [code, brand, category, description, mrp, image, catName, pageNum]
          );
        }
      }
    }
    throw err;
  }
}

// 3. Create or Upsert Single Catalog Item
sanitaryCatalogRouter.post('/', requireRole(['admin', 'manager']), async (req: Request, res: Response) => {
  try {
    const { item_code, item_description } = req.body;

    if (!item_code || !item_code.trim()) {
      res.status(400).json({ error: 'Item code is required' });
      return;
    }
    if (!item_description || !item_description.trim()) {
      res.status(400).json({ error: 'Item description is required' });
      return;
    }

    const rows = await upsertCatalogItem(req.body);
    res.status(201).json({ item: rows[0] });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 4. Batch Import Items (From PDF extraction or Excel/CSV)
sanitaryCatalogRouter.post('/batch', requireRole(['admin', 'manager']), async (req: Request, res: Response) => {
  try {
    const { items, catalog_name } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: 'Array of items is required' });
      return;
    }

    let successCount = 0;
    for (const item of items) {
      if (!item.item_code || !item.item_code.trim()) continue;
      await upsertCatalogItem(item, catalog_name);
      successCount++;
    }

    await recordAuditLog({
      userId: req.user!.id,
      username: req.user!.username,
      action: 'SANITARY_CATALOG_BATCH_IMPORT',
      entityType: 'sanitary_catalog',
      entityId: catalog_name || 'batch',
      details: { count: successCount, catalogName: catalog_name },
      ipAddress: req.ip,
    });

    res.json({
      message: `Successfully imported ${successCount} items into Sanitary Catalog`,
      count: successCount,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 5. Update Single Catalog Item
sanitaryCatalogRouter.put('/:id', requireRole(['admin', 'manager']), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { item_code, brand, category, item_description, mrp_price, item_image } = req.body;

    const rows = await query(
      `UPDATE sanitary_catalog_items 
       SET item_code = $1, brand = $2, category = $3, item_description = $4, mrp_price = $5, 
           item_image = COALESCE($6, item_image), updated_at = CURRENT_TIMESTAMP
       WHERE id = $7 RETURNING *`,
      [
        item_code.trim(),
        (brand || 'Sanitary').trim(),
        (category || 'General').trim(),
        item_description.trim(),
        parseFloat(mrp_price) || 0,
        item_image || null,
        id,
      ]
    );

    if (rows.length === 0) {
      res.status(404).json({ error: 'Catalog item not found' });
      return;
    }

    res.json({ item: rows[0] });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 6. Delete All Catalog Items (Admin & Accounts only)
sanitaryCatalogRouter.delete('/all', requireRole(['admin', 'accounts', 'accountant']), async (req: Request, res: Response) => {
  try {
    await query('DELETE FROM sanitary_catalog_items');
    await recordAuditLog({
      userId: req.user!.id,
      username: req.user!.username,
      action: 'SANITARY_CATALOG_CLEARED_ALL',
      entityType: 'sanitary_catalog',
      details: { message: 'All sanitary catalog items removed' },
      ipAddress: req.ip,
    });
    res.json({ message: 'All sanitary catalog items removed successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 7. Delete Single Catalog Item
sanitaryCatalogRouter.delete('/:id', requireRole(['admin', 'manager', 'accounts', 'accountant']), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await query(`DELETE FROM sanitary_catalog_items WHERE id = $1`, [id]);
    res.json({ message: 'Catalog item deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
