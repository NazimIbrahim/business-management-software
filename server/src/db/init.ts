import { Client } from 'pg';
import fs from 'fs';
import path from 'path';
import { config } from '../config';
import { logger } from '../utils/logger';
import { ensureRolesSchema } from '../routes/roles';

export async function initializeDatabase(): Promise<void> {
  logger.info('Initializing PostgreSQL database for AMA Quotations...');

  // Step 1: If using local credentials (no connectionString), verify/create 'ama_quotations' database
  if (!config.db.connectionString) {
    const rootClient = new Client({
      host: config.db.host,
      port: config.db.port,
      database: 'postgres',
      user: config.db.user,
      password: config.db.password,
    });

    try {
      await rootClient.connect();
      const checkDb = await rootClient.query(
        `SELECT 1 FROM pg_database WHERE datname = $1`,
        [config.db.database]
      );

      if (checkDb.rows.length === 0) {
        logger.info(`Database '${config.db.database}' does not exist. Creating...`);
        await rootClient.query(`CREATE DATABASE "${config.db.database}"`);
        logger.info(`Database '${config.db.database}' created successfully.`);
      } else {
        logger.info(`Database '${config.db.database}' already exists.`);
      }
    } catch (err: any) {
      logger.error('Error connecting to root postgres database:', err.message);
      throw err;
    } finally {
      await rootClient.end();
    }
  }

  // Step 2: Connect to target database and apply schema
  const dbClient = new Client(
    config.db.connectionString
      ? { connectionString: config.db.connectionString, ssl: config.db.ssl }
      : config.db
  );
  try {
    await dbClient.connect();
    const schemaSqlPath = [
      path.join(__dirname, 'schema.sql'),
      path.join(__dirname, 'db/schema.sql'),
      path.join(__dirname, '../src/db/schema.sql'),
      path.join(process.cwd(), 'src/db/schema.sql'),
      path.join(process.cwd(), 'dist/db/schema.sql'),
    ].find((p) => fs.existsSync(p));

    if (schemaSqlPath) {
      const schemaSql = fs.readFileSync(schemaSqlPath, 'utf8');
      logger.info(`Applying schema from ${schemaSqlPath}...`);
      await dbClient.query(schemaSql);
    } else {
      logger.warn('Could not locate schema.sql file during database initialization.');
    }

    // Apply incremental alterations if upgrading existing database
    await dbClient.query(`
      ALTER TABLE quotations ADD COLUMN IF NOT EXISTS assisted_sales_person_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
      ALTER TABLE quotations ADD COLUMN IF NOT EXISTS assisted_sales_person_name VARCHAR(120);
      ALTER TABLE quotations ADD COLUMN IF NOT EXISTS split_share_type VARCHAR(20) DEFAULT 'percentage';
      ALTER TABLE quotations ADD COLUMN IF NOT EXISTS primary_sales_share_percent NUMERIC(5, 2) DEFAULT 100.00;
      ALTER TABLE quotations ADD COLUMN IF NOT EXISTS primary_sales_share_amount NUMERIC(12, 2) DEFAULT 0.00;
      ALTER TABLE quotations ADD COLUMN IF NOT EXISTS assisted_sales_share_percent NUMERIC(5, 2) DEFAULT 0.00;
      ALTER TABLE quotations ADD COLUMN IF NOT EXISTS assisted_sales_share_amount NUMERIC(12, 2) DEFAULT 0.00;
      CREATE INDEX IF NOT EXISTS idx_quotations_assisted_sales_person ON quotations (assisted_sales_person_id);
      ALTER TABLE quotations ADD COLUMN IF NOT EXISTS quotation_type VARCHAR(30) NOT NULL DEFAULT 'tiles';
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
      CREATE INDEX IF NOT EXISTS idx_quotations_type ON quotations (quotation_type);
      ALTER TABLE quotations ADD COLUMN IF NOT EXISTS has_dispatch_item_changes BOOLEAN DEFAULT FALSE;
      ALTER TABLE quotations ADD COLUMN IF NOT EXISTS dispatch_change_summary TEXT;
      ALTER TABLE quotations ADD COLUMN IF NOT EXISTS dispatch_change_acknowledged_at TIMESTAMPTZ;
      CREATE INDEX IF NOT EXISTS idx_quotations_dispatch_changes ON quotations (has_dispatch_item_changes) WHERE has_dispatch_item_changes = TRUE;

      ALTER TABLE users ADD COLUMN IF NOT EXISTS monthly_target NUMERIC(14, 2) DEFAULT 0.00;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(120);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(30);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
      ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;

      ALTER TABLE customers ADD COLUMN IF NOT EXISTS created_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
      CREATE INDEX IF NOT EXISTS idx_customers_created_by ON customers (created_by_id);

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

      CREATE TABLE IF NOT EXISTS sanitary_catalog_items (
          id SERIAL PRIMARY KEY,
          item_code VARCHAR(100) NOT NULL UNIQUE,
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

      -- Backfill tile_catalog_items from existing quotation items if empty
      INSERT INTO tile_catalog_items (description, brand, size, product_type, coverage_area, base_rate_per_sqft, rate_per_sqft, base_rate_per_box, rate_per_box)
      SELECT DISTINCT ON (LOWER(TRIM(description))) 
        TRIM(description), brand, size, product_type, coverage_area, base_rate_per_sqft, rate_per_sqft, base_rate_per_box, rate_per_box
      FROM quotation_items
      WHERE description IS NOT NULL AND length(TRIM(description)) > 1
      ON CONFLICT (description) DO NOTHING;

      -- Ensure quotation_versions exists for historical version viewing
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
    `);

    // Ensure roles and permissions schema
    try {
      await ensureRolesSchema();
    } catch (e: any) {
      logger.warn('Roles schema init warning:', e.message);
    }

    logger.info('Database schema applied successfully.');
  } catch (err: any) {
    logger.error('Error applying schema to database:', err.message);
    throw err;
  } finally {
    await dbClient.end();
  }
}

if (require.main === module) {
  initializeDatabase()
    .then(() => {
      logger.info('Database initialization completed.');
      process.exit(0);
    })
    .catch((err) => {
      logger.error('Database initialization failed:', err);
      process.exit(1);
    });
}
