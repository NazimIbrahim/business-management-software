// Global Crash Protectors - Guarantee logs are visible and process does not silently exit
process.on('uncaughtException', (err) => {
  console.error('[FATAL UNCAUGHT EXCEPTION]', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[FATAL UNHANDLED REJECTION]', reason);
});

import express, { Request, Response, NextFunction } from 'express';
import http from 'http';
import cors from 'cors';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { config } from './config';
import { logger } from './utils/logger';
import { testConnection, query, getLastDbError } from './db/connection';
import { seedDatabase } from './db/seed';
import { initWebSocketServer, getConnectedClientCount } from './ws';

import { authRouter } from './routes/auth';
import { usersRouter } from './routes/users';
import { quotationsRouter } from './routes/quotations';
import { customersRouter } from './routes/customers';
import { productsRouter } from './routes/products';
import { paymentsRouter } from './routes/payments';
import { targetsRouter } from './routes/targets';
import { dashboardRouter } from './routes/dashboard';
import { companyRouter } from './routes/company';
import { auditRouter } from './routes/audit';
import { reportsRouter } from './routes/reports';
import { backupRouter } from './routes/backup';
import { sanitaryCatalogRouter } from './routes/sanitaryCatalog';
import { rolesRouter, ensureRolesSchema } from './routes/roles';
import { dispatchRouter, ensureDispatchSchema } from './routes/dispatch';

const app = express();
const server = http.createServer(app);

server.on('error', (err: any) => {
  console.error('[HTTP SERVER ERROR]', err);
  logger.error('HTTP server error:', err);
});

const PORT = Number(process.env.PORT) || 5000;

console.log(`[BOOT] AMA Ceramics Backend initializing on Node ${process.version}...`);
console.log(`[BOOT] Target Port: ${PORT} (PORT env: ${process.env.PORT || 'default 5000'})`);

// Enable CORS for all LAN clients & cloud web portals
const corsOptions: cors.CorsOptions = {
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  credentials: false,
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Request logging (lightweight, excludes health check)
app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.path !== '/api/health') {
    logger.info(`${req.method} ${req.path} from ${req.ip}`);
  }
  next();
});

// Health check endpoint for connection tests from desktop client & cloud diagnostics
app.get('/api/health', async (req: Request, res: Response) => {
  const conn = await testConnection();
  res.json({
    status: conn.ok ? 'ok' : 'degraded',
    server: 'AMA Ceramics Quotation Central Server',
    version: '2.4.78',
    dbConnected: conn.ok,
    dbError: conn.ok ? null : (conn.error || getLastDbError() || 'Unknown database connection error'),
    hasDatabaseUrl: Boolean(config.db.connectionString),
    activeWsClients: getConnectedClientCount(),
    timestamp: new Date().toISOString(),
  });
});

// Mount API routes
app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/roles', rolesRouter);
app.use('/api/quotations', quotationsRouter);
app.use('/api/customers', customersRouter);
app.use('/api/products', productsRouter);
app.use('/api/sanitary-catalog', sanitaryCatalogRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/targets', targetsRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/company', companyRouter);
app.use('/api/audit-logs', auditRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/backup', backupRouter);
app.use('/api/dispatch', dispatchRouter);

// Static serving for uploaded tax invoices & payment proofs
try {
  const invoicesDir = path.resolve(process.cwd(), 'uploads/invoices');
  if (!fs.existsSync(invoicesDir)) {
    fs.mkdirSync(invoicesDir, { recursive: true });
  }
  app.use('/uploads/invoices', express.static(invoicesDir));
} catch (err: any) {
  console.warn('[BOOT] Invoices dir notice:', err.message);
}

try {
  const paymentProofsDir = path.resolve(process.cwd(), 'uploads/payment-proofs');
  if (!fs.existsSync(paymentProofsDir)) {
    fs.mkdirSync(paymentProofsDir, { recursive: true });
  }
  app.use('/uploads/payment-proofs', express.static(paymentProofsDir));
} catch (err: any) {
  console.warn('[BOOT] Payment proofs dir notice:', err.message);
}

// Static frontend serving (turns central server into an instant web portal for any browser on LAN/web)
const clientDistCandidates = [
  path.resolve(__dirname, '../../client/dist'),
  path.resolve(__dirname, '../client/dist'),
  path.resolve(process.cwd(), 'client/dist'),
  path.resolve(process.cwd(), '../client/dist'),
  path.resolve(process.cwd(), 'dist-client'),
  'C:\\AMA-Ceramics-Host-Server\\client\\dist',
];

const clientDist = clientDistCandidates.find(
  (dir) => fs.existsSync(dir) && fs.existsSync(path.join(dir, 'index.html'))
);

if (clientDist) {
  logger.info(`Static web portal enabled! Serving from: ${clientDist}`);
  app.use(express.static(clientDist));
  // Catch-all route for Single Page Application navigation
  app.get('*', (req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/ws')) {
      return next();
    }
    res.sendFile(path.join(clientDist, 'index.html'));
  });
} else {
  logger.info('No client/dist build found. Server running in API-only mode.');
}

// Global Error Handler
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  logger.error('Unhandled server error:', { message: err.message, stack: err.stack });
  res.status(err.statusCode || 500).json({
    error: err.message || 'Internal server error',
  });
});

// Initialize WebSocket server
initWebSocketServer(server);

// Automatically apply essential database migrations and constraints
async function runAutoMigrations() {
  logger.info('Checking and applying automatic database schema migrations...');

  // Step 1: Ensure all missing columns exist on existing tables
  try {
    await query(`
      -- quotation_items columns
      ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS product_type VARCHAR(30) NOT NULL DEFAULT 'box';
      ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS coverage_area NUMERIC(10, 2) NOT NULL DEFAULT 0.00;
      ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS quantity_sqft NUMERIC(10, 2) NOT NULL DEFAULT 0.00;
      ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS base_rate_per_sqft NUMERIC(10, 2) NOT NULL DEFAULT 0.00;
      ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS rate_per_sqft NUMERIC(10, 2) NOT NULL DEFAULT 0.00;
      ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS quantity_boxes NUMERIC(10, 2) NOT NULL DEFAULT 0.00;
      ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS base_rate_per_box NUMERIC(10, 2) NOT NULL DEFAULT 0.00;
      ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS rate_per_box NUMERIC(10, 2) NOT NULL DEFAULT 0.00;
      ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS discount_percent NUMERIC(5, 2) NOT NULL DEFAULT 0.00;
      ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00;
      ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00;
      ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS item_code VARCHAR(100);
      ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS item_image TEXT;
      ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS mrp_price NUMERIC(12, 2) DEFAULT 0.00;
      ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS encrypted_code VARCHAR(100);
      ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS dispatch_status VARCHAR(50) DEFAULT 'Yet to Update';
      ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS expected_dispatch_date DATE;
      ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS dispatch_notes TEXT;
      ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS dispatched_at TIMESTAMPTZ;
      ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS dispatched_quantity NUMERIC(12, 2) DEFAULT 0;
      ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS procurement_status VARCHAR(60) DEFAULT NULL;
      ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS procurement_notes TEXT DEFAULT NULL;
      ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS procurement_updated_at TIMESTAMPTZ DEFAULT NULL;

      -- quotations columns
      ALTER TABLE quotations ADD COLUMN IF NOT EXISTS customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL;
      ALTER TABLE quotations ADD COLUMN IF NOT EXISTS sales_person_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
      ALTER TABLE quotations ADD COLUMN IF NOT EXISTS assisted_sales_person_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
      ALTER TABLE quotations ADD COLUMN IF NOT EXISTS assisted_sales_person_name VARCHAR(120);
      ALTER TABLE quotations ADD COLUMN IF NOT EXISTS split_share_type VARCHAR(20) DEFAULT 'percentage';
      ALTER TABLE quotations ADD COLUMN IF NOT EXISTS primary_sales_share_percent NUMERIC(5, 2) DEFAULT 100.00;
      ALTER TABLE quotations ADD COLUMN IF NOT EXISTS primary_sales_share_amount NUMERIC(12, 2) DEFAULT 0.00;
      ALTER TABLE quotations ADD COLUMN IF NOT EXISTS assisted_sales_share_percent NUMERIC(5, 2) DEFAULT 0.00;
      ALTER TABLE quotations ADD COLUMN IF NOT EXISTS assisted_sales_share_amount NUMERIC(12, 2) DEFAULT 0.00;
      ALTER TABLE quotations ADD COLUMN IF NOT EXISTS project_name VARCHAR(150);
      ALTER TABLE quotations ADD COLUMN IF NOT EXISTS quotation_type VARCHAR(30) NOT NULL DEFAULT 'tiles';
      ALTER TABLE quotations ADD COLUMN IF NOT EXISTS manager_approval_note TEXT;
      ALTER TABLE quotations ADD COLUMN IF NOT EXISTS approved_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
      ALTER TABLE quotations ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
      ALTER TABLE quotations ADD COLUMN IF NOT EXISTS round_off NUMERIC(12, 2) NOT NULL DEFAULT 0.00;
      ALTER TABLE quotations ADD COLUMN IF NOT EXISTS special_notes TEXT;
      ALTER TABLE quotations ADD COLUMN IF NOT EXISTS dispatch_status VARCHAR(50) DEFAULT 'Yet to Update';
      ALTER TABLE quotations ADD COLUMN IF NOT EXISTS expected_dispatch_date DATE;
      ALTER TABLE quotations ADD COLUMN IF NOT EXISTS dispatch_notes TEXT;
      ALTER TABLE quotations ADD COLUMN IF NOT EXISTS dispatched_at TIMESTAMPTZ;
      ALTER TABLE quotations ADD COLUMN IF NOT EXISTS dispatched_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
      ALTER TABLE quotations ADD COLUMN IF NOT EXISTS dispatched_by_name VARCHAR(120);
      ALTER TABLE quotations ADD COLUMN IF NOT EXISTS has_dispatch_item_changes BOOLEAN DEFAULT FALSE;
      ALTER TABLE quotations ADD COLUMN IF NOT EXISTS dispatch_change_summary TEXT;
      ALTER TABLE quotations ADD COLUMN IF NOT EXISTS dispatch_change_acknowledged_at TIMESTAMPTZ;
      ALTER TABLE quotations ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

      -- Set default dispatch_status to 'Yet to Update'
      ALTER TABLE quotations ALTER COLUMN dispatch_status SET DEFAULT 'Yet to Update';
      ALTER TABLE quotation_items ALTER COLUMN dispatch_status SET DEFAULT 'Yet to Update';
      UPDATE quotations SET dispatch_status = 'Yet to Update' WHERE dispatch_status IS NULL;
      UPDATE quotation_items SET dispatch_status = 'Yet to Update' WHERE dispatch_status IS NULL;

      -- users columns
      ALTER TABLE users ADD COLUMN IF NOT EXISTS monthly_target NUMERIC(14, 2) DEFAULT 0.00;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(120);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(30);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
      ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;

      -- brand_size_coverages columns
      ALTER TABLE brand_size_coverages ADD COLUMN IF NOT EXISTS product_type VARCHAR(30) NOT NULL DEFAULT 'box';
      ALTER TABLE brand_size_coverages ADD COLUMN IF NOT EXISTS pieces_per_box INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE brand_size_coverages ADD COLUMN IF NOT EXISTS default_rate_sqft NUMERIC(10, 2) NOT NULL DEFAULT 0.00;
      ALTER TABLE brand_size_coverages ADD COLUMN IF NOT EXISTS default_rate_box NUMERIC(10, 2) NOT NULL DEFAULT 0.00;

      -- customers columns
      ALTER TABLE customers ADD COLUMN IF NOT EXISTS created_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
      CREATE INDEX IF NOT EXISTS idx_customers_created_by ON customers (created_by_id);
      CREATE INDEX IF NOT EXISTS idx_quotations_type ON quotations (quotation_type);
      CREATE INDEX IF NOT EXISTS idx_quotations_assisted_sales_person ON quotations (assisted_sales_person_id);

      -- payments columns for accounts verification and recorded by audit
      ALTER TABLE payments ADD COLUMN IF NOT EXISTS recorded_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
      ALTER TABLE payments ADD COLUMN IF NOT EXISTS verified_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
      ALTER TABLE payments ADD COLUMN IF NOT EXISTS verified_by_name VARCHAR(120);
      ALTER TABLE payments ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;
      ALTER TABLE payments ADD COLUMN IF NOT EXISTS verification_notes TEXT;
      ALTER TABLE payments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;
      ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_status_check;
      ALTER TABLE payments ADD CONSTRAINT payments_status_check CHECK (status IN ('Recorded', 'Cleared', 'Bounced', 'Refunded', 'Verified'));

      -- Sales Categories on users and quotations
      ALTER TABLE users ADD COLUMN IF NOT EXISTS sales_category VARCHAR(50) NOT NULL DEFAULT 'RETAIL';
      ALTER TABLE users DROP CONSTRAINT IF EXISTS check_users_sales_category;
      ALTER TABLE users ADD CONSTRAINT check_users_sales_category CHECK (sales_category IN ('RETAIL', 'PROJECT', 'MANAGEMENT', 'COMPANY'));
      CREATE INDEX IF NOT EXISTS idx_users_sales_category ON users(sales_category);

      UPDATE users SET sales_category = 'MANAGEMENT' WHERE role IN ('admin', 'manager') AND sales_category = 'RETAIL';

      ALTER TABLE quotations ADD COLUMN IF NOT EXISTS sales_category VARCHAR(50) DEFAULT 'RETAIL';
      ALTER TABLE quotations DROP CONSTRAINT IF EXISTS check_quotations_sales_category;
      ALTER TABLE quotations ADD CONSTRAINT check_quotations_sales_category CHECK (sales_category IN ('RETAIL', 'PROJECT', 'MANAGEMENT', 'COMPANY'));
      CREATE INDEX IF NOT EXISTS idx_quotations_sales_category ON quotations(sales_category);

      -- Dedicated Salesperson Assignment & Creator Tracking
      ALTER TABLE quotations ADD COLUMN IF NOT EXISTS created_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
      ALTER TABLE quotations ADD COLUMN IF NOT EXISTS created_by_name VARCHAR(255);
      CREATE INDEX IF NOT EXISTS idx_quotations_sales_person_id ON quotations(sales_person_id);
      CREATE INDEX IF NOT EXISTS idx_quotations_created_by_id ON quotations(created_by_id);

      UPDATE quotations 
      SET 
        created_by_id = COALESCE(sales_person_id, 1),
        created_by_name = COALESCE(sales_person_name, 'System Administrator')
      WHERE created_by_id IS NULL;

      UPDATE quotations 
      SET 
        sales_person_id = COALESCE(created_by_id, 1),
        sales_person_name = COALESCE(created_by_name, 'System Administrator')
      WHERE sales_person_id IS NULL;

      UPDATE quotations q
      SET sales_category = COALESCE(u.sales_category, 'RETAIL')
      FROM users u
      WHERE q.sales_person_id = u.id AND (q.sales_category IS NULL OR q.sales_category = 'RETAIL');

      -- Group & Individual Sales Targets upgrade
      ALTER TABLE sales_targets ADD COLUMN IF NOT EXISTS category VARCHAR(50) NOT NULL DEFAULT 'RETAIL';
      ALTER TABLE sales_targets ALTER COLUMN sales_person_id DROP NOT NULL;
      ALTER TABLE sales_targets ADD COLUMN IF NOT EXISTS target_volume_sqft NUMERIC(15, 2) DEFAULT 0.00;
      ALTER TABLE sales_targets ADD COLUMN IF NOT EXISTS period_type VARCHAR(20) NOT NULL DEFAULT 'MONTHLY';
      ALTER TABLE sales_targets DROP CONSTRAINT IF EXISTS check_sales_targets_category;
      ALTER TABLE sales_targets ADD CONSTRAINT check_sales_targets_category CHECK (category IN ('RETAIL', 'PROJECT', 'MANAGEMENT', 'COMPANY'));
      ALTER TABLE sales_targets DROP CONSTRAINT IF EXISTS check_sales_targets_period_type;
      ALTER TABLE sales_targets ADD CONSTRAINT check_sales_targets_period_type CHECK (period_type IN ('MONTHLY', 'QUARTERLY', 'YEARLY'));
      CREATE INDEX IF NOT EXISTS idx_sales_targets_cat_period ON sales_targets (category, start_date, end_date);
      CREATE INDEX IF NOT EXISTS idx_sales_targets_user_period ON sales_targets (sales_person_id, start_date, end_date);

      -- Financial Safety-Gate & Stepped Verification on local_purchases
      ALTER TABLE local_purchases ADD COLUMN IF NOT EXISTS payment_checked BOOLEAN DEFAULT FALSE;
      ALTER TABLE local_purchases ADD COLUMN IF NOT EXISTS payment_checked_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
      ALTER TABLE local_purchases ADD COLUMN IF NOT EXISTS payment_checked_by_name VARCHAR(120);
      ALTER TABLE local_purchases ADD COLUMN IF NOT EXISTS payment_checked_at TIMESTAMPTZ;
      ALTER TABLE local_purchases ADD COLUMN IF NOT EXISTS availability_checked BOOLEAN DEFAULT FALSE;
      ALTER TABLE local_purchases ADD COLUMN IF NOT EXISTS availability_checked_at TIMESTAMPTZ;
      ALTER TABLE local_purchases ADD COLUMN IF NOT EXISTS admin_override_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
      ALTER TABLE local_purchases ADD COLUMN IF NOT EXISTS admin_override_notes TEXT;

      ALTER TABLE local_purchases DROP CONSTRAINT IF EXISTS uq_local_purchases_item;
      ALTER TABLE local_purchases ADD CONSTRAINT uq_local_purchases_item UNIQUE (quotation_item_id);

      UPDATE local_purchases lp
      SET payment_checked = TRUE,
          payment_checked_by_name = 'System Auto-Backfill',
          payment_checked_at = lp.created_at
      FROM quotations q
      WHERE lp.quotation_id = q.id 
        AND (LOWER(q.status) = 'closed' OR lp.purchase_status IN ('AWAITING_DELIVERY', 'ARRIVED_AT_GODOWN'))
        AND lp.payment_checked IS FALSE;

      -- Tax Invoice PDF Verification & Auto-Reconciliation Schema
      CREATE TABLE IF NOT EXISTS dispatch_invoices (
          id SERIAL PRIMARY KEY,
          quotation_id INTEGER NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
          invoice_number VARCHAR(100) NOT NULL,
          invoice_date DATE,
          file_name VARCHAR(255) NOT NULL,
          file_url TEXT NOT NULL,
          file_size INTEGER NOT NULL,
          customer_phone_detected VARCHAR(50),
          customer_gstin_detected VARCHAR(30),
          extracted_raw_data JSONB DEFAULT '{}'::jsonb,
          reconciliation_summary JSONB DEFAULT '{}'::jsonb,
          is_verified BOOLEAN DEFAULT TRUE,
          uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
          uploaded_by_name VARCHAR(120),
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_dispatch_invoices_qid ON dispatch_invoices (quotation_id);
      CREATE INDEX IF NOT EXISTS idx_dispatch_invoices_inv_no ON dispatch_invoices (invoice_number);

      ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS pending_quantity NUMERIC(12, 2) DEFAULT 0;
      ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS fulfillment_status VARCHAR(50) DEFAULT 'PENDING';
      ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS last_invoice_id INTEGER REFERENCES dispatch_invoices(id) ON DELETE SET NULL;
      ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS last_invoice_number VARCHAR(100);

      UPDATE quotation_items
      SET pending_quantity = GREATEST(0, COALESCE(quantity_boxes, quantity_sqft, 0) - COALESCE(dispatched_quantity, 0))
      WHERE pending_quantity = 0 AND (COALESCE(quantity_boxes, quantity_sqft, 0) - COALESCE(dispatched_quantity, 0)) > 0;

      UPDATE quotation_items
      SET fulfillment_status = CASE 
          WHEN COALESCE(dispatched_quantity, 0) >= COALESCE(quantity_boxes, quantity_sqft, 0) AND COALESCE(quantity_boxes, quantity_sqft, 0) > 0 THEN 'DISPATCHED'
          WHEN COALESCE(dispatched_quantity, 0) > 0 THEN 'PARTIALLY_DISPATCHED'
          ELSE 'PENDING'
      END;
    `);
  } catch (err: any) {
    logger.warn('Column additions migration warning:', err.message);
  }

  // Step 2: Ensure Roles and Permissions Schema exists early
  try {
    await ensureRolesSchema();
  } catch (err: any) {
    logger.warn('Roles schema migration warning:', err.message);
  }

  // Step 3: Ensure sanitary_catalog_items exists with UNIQUE constraint on item_code
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
  } catch (err: any) {
    logger.warn('Sanitary catalog migration warning:', err.message);
  }

  // Step 4: Ensure tile_catalog_items exists for autocomplete and item memory
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS tile_catalog_items (
        id SERIAL PRIMARY KEY,
        description VARCHAR(255) NOT NULL UNIQUE,
        brand VARCHAR(150),
        size VARCHAR(100),
        product_type VARCHAR(30) NOT NULL DEFAULT 'box',
        coverage_area NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
        base_rate_per_sqft NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
        rate_per_sqft NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
        base_rate_per_box NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
        rate_per_box NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
        usage_count INTEGER NOT NULL DEFAULT 1,
        last_used_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_tile_catalog_description ON tile_catalog_items (description);
      CREATE INDEX IF NOT EXISTS idx_tile_catalog_usage ON tile_catalog_items (usage_count DESC, last_used_at DESC);

      INSERT INTO tile_catalog_items (description, brand, size, product_type, coverage_area, base_rate_per_sqft, rate_per_sqft, base_rate_per_box, rate_per_box)
      SELECT DISTINCT ON (LOWER(TRIM(description))) 
        TRIM(description), brand, size, COALESCE(product_type, 'box'), coverage_area, base_rate_per_sqft, rate_per_sqft, base_rate_per_box, rate_per_box
      FROM quotation_items
      WHERE description IS NOT NULL AND length(TRIM(description)) > 1
      ON CONFLICT (description) DO NOTHING;
    `);
  } catch (err: any) {
    logger.warn('Tile catalog migration warning:', err.message);
  }

  // Step 5: Ensure product_encrypted_codes exists for persistent 3-letter encrypted codes
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS product_encrypted_codes (
        id SERIAL PRIMARY KEY,
        item_name VARCHAR(255) NOT NULL,
        normalized_name VARCHAR(255) UNIQUE NOT NULL,
        encrypted_code VARCHAR(100) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_product_encrypted_codes_norm ON product_encrypted_codes (normalized_name);
      CREATE INDEX IF NOT EXISTS idx_product_encrypted_codes_code ON product_encrypted_codes (encrypted_code);
    `);
  } catch (err: any) {
    logger.warn('Product encrypted codes migration warning:', err.message);
  }

  // Step 6: Ensure quotation_versions exists for full audit trail & historical version viewing
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS quotation_versions (
        id SERIAL PRIMARY KEY,
        quotation_id INTEGER NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
        version_number INTEGER NOT NULL,
        edited_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        edited_by_name VARCHAR(120),
        revision_summary TEXT,
        snapshot_data JSONB NOT NULL,
        gross_total NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
        discount_percent NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
        discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
        taxable_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
        net_total NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
        status VARCHAR(30),
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_quotation_versions_unique ON quotation_versions (quotation_id, version_number);
      CREATE INDEX IF NOT EXISTS idx_quotation_versions_qid ON quotation_versions (quotation_id, version_number DESC);

      INSERT INTO quotation_versions (
        quotation_id, version_number, edited_by_id, edited_by_name, revision_summary,
        snapshot_data, gross_total, discount_percent, discount_amount, taxable_amount,
        net_total, status, created_at
      )
      SELECT
        q.id,
        COALESCE(q.version, 1),
        q.sales_person_id,
        q.sales_person_name,
        'Initial quotation snapshot',
        jsonb_build_object(
          'quotation', jsonb_set(to_jsonb(q), '{approved_by_name}', to_jsonb(COALESCE(u_app.full_name, ''))),
          'areas', COALESCE((
            SELECT jsonb_agg(
              jsonb_build_object(
                'id', a.id,
                'area_name', a.area_name,
                'display_order', a.display_order,
                'items', COALESCE((
                  SELECT jsonb_agg(to_jsonb(it))
                  FROM quotation_items it
                  WHERE it.area_id = a.id
                ), '[]'::jsonb)
              )
            )
            FROM quotation_areas a
            WHERE a.quotation_id = q.id
          ), '[]'::jsonb)
        ),
        q.gross_total,
        q.discount_percent,
        q.discount_amount,
        q.taxable_amount,
        q.net_total,
        q.status,
        q.created_at
      FROM quotations q
      LEFT JOIN users u_app ON u_app.id = q.approved_by_id
      WHERE NOT EXISTS (
        SELECT 1 FROM quotation_versions qv
        WHERE qv.quotation_id = q.id AND qv.version_number = COALESCE(q.version, 1)
      )
      ON CONFLICT (quotation_id, version_number) DO NOTHING;

      INSERT INTO quotation_versions (
        quotation_id, version_number, edited_by_id, edited_by_name, revision_summary,
        snapshot_data, gross_total, discount_percent, discount_amount, taxable_amount,
        net_total, status, created_at
      )
      SELECT
        q.id,
        1,
        q.sales_person_id,
        q.sales_person_name,
        'Initial quotation creation',
        jsonb_build_object(
          'quotation', jsonb_set(to_jsonb(q), '{approved_by_name}', to_jsonb(COALESCE(u_app.full_name, ''))),
          'areas', COALESCE((
            SELECT jsonb_agg(
              jsonb_build_object(
                'id', a.id,
                'area_name', a.area_name,
                'display_order', a.display_order,
                'items', COALESCE((
                  SELECT jsonb_agg(to_jsonb(it))
                  FROM quotation_items it
                  WHERE it.area_id = a.id
                ), '[]'::jsonb)
              )
            )
            FROM quotation_areas a
            WHERE a.quotation_id = q.id
          ), '[]'::jsonb)
        ),
        q.gross_total,
        q.discount_percent,
        q.discount_amount,
        q.taxable_amount,
        q.net_total,
        q.status,
        q.created_at
      FROM quotations q
      LEFT JOIN users u_app ON u_app.id = q.approved_by_id
      WHERE NOT EXISTS (
        SELECT 1 FROM quotation_versions qv WHERE qv.quotation_id = q.id AND qv.version_number = 1
      )
      ON CONFLICT (quotation_id, version_number) DO NOTHING;
    `);
  } catch (err: any) {
    logger.warn('Quotation versions migration warning:', err.message);
  }

  logger.info('Database schema migrations applied successfully.');
}

async function ensureBootstrapData() {
  try {
    // 1. If core tables do not exist (e.g. fresh cloud database on Neon.tech), run schema.sql
    const checkTable = await query<{ tbl: string | null }>("SELECT to_regclass('public.users') as tbl").catch(() => [{ tbl: null }]);
    if (!checkTable || !checkTable[0] || !checkTable[0].tbl) {
      logger.info('Fresh database detected (tables missing). Initializing base tables from schema.sql...');
      const schemaPath = [
        path.join(__dirname, 'db/schema.sql'),
        path.join(__dirname, 'schema.sql'),
        path.join(__dirname, '../src/db/schema.sql'),
        path.join(process.cwd(), 'dist/db/schema.sql'),
        path.join(process.cwd(), 'src/db/schema.sql'),
      ].find((p) => fs.existsSync(p));

      if (schemaPath) {
        const schemaSql = fs.readFileSync(schemaPath, 'utf8');
        logger.info(`Applying base schema from ${schemaPath}...`);
        await query(schemaSql);
        logger.info('Base database schema created successfully.');
      } else {
        logger.error('Could not locate schema.sql to initialize fresh database!');
      }
    }

    // 2. Run incremental migrations to guarantee all columns and extra tables exist
    await runAutoMigrations();
    await ensureDispatchSchema();

    // 3. If users table has 0 users, seed default accounts and roles
    const userCount = await query('SELECT count(*) FROM users');
    if (parseInt(userCount[0]?.count || '0', 10) === 0) {
      logger.info('Fresh database detected (0 users). Seeding default admin, manager, accounts, and salesperson accounts...');
      await seedDatabase();
      logger.info('Default accounts and company settings seeded successfully.');
    } else {
      // 4. Ensure company_settings has at least 1 record even if users already exist
      const compCount = await query('SELECT count(*) FROM company_settings').catch(() => [{ count: '0' }]);
      if (parseInt(compCount[0]?.count || '0', 10) === 0) {
        logger.info('Empty company_settings table detected. Seeding default company profile...');
        const defaultTerms = [
          'Prices are inclusive of GST unless otherwise specified.',
          'Payment: 100% advance along with confirmed purchase order.',
          'Delivery: Materials will be dispatched after receipt of full payment.',
          'Transportation/Freight charges extra at actuals unless explicitly agreed in writing.',
          'Unloading of materials at destination site is under customer scope and responsibility.',
          'Goods once sold cannot be returned or exchanged under any circumstances.',
          'Color shade and sizing variations are inherent in ceramic and vitrified products.',
          'Any delay in delivery due to unavailability of materials in factory will not hold the seller liable.',
          'The buyer must inspect the materials upon delivery. Any discrepancies or damages must be reported within 24 hours.',
          'Once materials are inspected and accepted no claims will be entertained.',
          'Orders once placed cannot be cancelled.',
          'Return or replacements are only applicable for defective or damaged products subject to approvals after inspection.',
          'Non-defective materials are non-returnable.'
        ];
        await query(
          `INSERT INTO company_settings (
            company_name, tagline, address_line1, address_line2, phone, email, website,
            gstin, state, state_code, bank_name, account_name, account_number, ifsc_code,
            branch, account_type, upi_details, store_manager_title, store_manager_name,
            store_manager_phone, sales_associate_title, terms_json
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7,
            $8, $9, $10, $11, $12, $13, $14,
            $15, $16, $17, $18, $19,
            $20, $21, $22
          )`,
          [
            'AMA CERAMICS PVT LTD',
            'Architectural Surfaces, Vitrified Tiles & Luxury Sanitaries',
            '125/1, Sulikunte Village, Sarjapura Main Road',
            'Varthur Hobli, Bengaluru, 562125',
            '+91 96637 73871 / +91 98250 12345',
            'sales@amaceramics.in',
            'www.amaceramics.in',
            '24AAACA5678Q1Z4',
            'Karnataka',
            '29',
            'ICICI Bank',
            'AMA Ceramics Private Limited',
            '743205000413',
            'ICIC0007432',
            'Dommasandra',
            'Current Account',
            'GPay / PhonePe / Paytm / UPI: amaceramics@icici\nCheques in favor of: AMA CERAMICS PRIVATE LIMITED',
            'Store Manager',
            'Rajesh Sharma',
            '+91 98250 12345',
            'Showroom Sales Associate',
            JSON.stringify(defaultTerms),
          ]
        );
        logger.info('Default company settings row created successfully.');
      }
    }
  } catch (err: any) {
    logger.warn('Bootstrap data check warning:', err.message);
  }
}

// Start listening on 0.0.0.0 (all LAN interfaces)
server.listen(PORT, '0.0.0.0', () => {
  console.log('Server listening on port', PORT);
  logger.info(`========================================================`);
  logger.info(`AMA Ceramics Quotation Central Server is running!`);
  logger.info(`Port: ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'production'}`);
  logger.info(`Local URL: http://localhost:${PORT}`);

  // Display all available LAN IP addresses
  try {
    const networkInterfaces = os.networkInterfaces();
    logger.info(`Available LAN IP addresses for Client connection:`);
    for (const name of Object.keys(networkInterfaces)) {
      const netList = networkInterfaces[name];
      if (netList) {
        for (const net of netList) {
          if (net.family === 'IPv4' && !net.internal) {
            logger.info(`  -> http://${net.address}:${PORT} (${name})`);
          }
        }
      }
    }
  } catch {
    // Ignore interface inspection errors in sandbox
  }
  logger.info(`========================================================`);

  // Run database bootstrap and auto-migrations in background so port is immediately open for Render
  ensureBootstrapData().catch((err: any) => {
    logger.warn('Bootstrap data background warning:', err?.message || err);
  });

  // Cloud Keep-Alive Daemon: Keeps Render cloud instance awake 24/7 so it never spins down into sleep
  const cloudHealthUrl = 'https://ama-quotation-api.onrender.com/api/health';
  const pingCloudKeepAlive = async () => {
    try {
      const res = await fetch(cloudHealthUrl, {
        method: 'GET',
        headers: { 'User-Agent': 'AMA-Host-KeepAlive/2.4.60' },
      });
      if (res.ok) {
        logger.info('[KeepAlive] Cloud server ping successful — Render instance kept warm 24/7.');
      }
    } catch (err: any) {
      logger.warn(`[KeepAlive] Cloud ping notice: ${err.message}`);
    }
  };

  // Initial ping 15 seconds after boot, then recurring every 7 minutes (Render sleeps after 15 minutes of inactivity)
  setTimeout(pingCloudKeepAlive, 15000);
  setInterval(pingCloudKeepAlive, 7 * 60 * 1000);
});
