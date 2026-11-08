-- AMA Ceramics Quotation System - PostgreSQL Schema
-- Designed for LAN Central Server with High Concurrency and Financial Precision

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(120) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'salesperson',
    email VARCHAR(120),
    phone VARCHAR(30),
    monthly_target NUMERIC(14, 2) DEFAULT 0.00,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS company_settings (
    id SERIAL PRIMARY KEY,
    company_name VARCHAR(200) NOT NULL,
    tagline VARCHAR(255) NOT NULL,
    logo_path VARCHAR(500),
    logo_base64 TEXT,
    address_line1 VARCHAR(255) NOT NULL,
    address_line2 VARCHAR(255) NOT NULL,
    phone VARCHAR(150) NOT NULL,
    email VARCHAR(150) NOT NULL,
    website VARCHAR(150) NOT NULL,
    gstin VARCHAR(50) NOT NULL,
    state VARCHAR(100) NOT NULL,
    state_code VARCHAR(10) NOT NULL DEFAULT '24',
    bank_name VARCHAR(150) NOT NULL,
    account_name VARCHAR(200) NOT NULL,
    account_number VARCHAR(60) NOT NULL,
    ifsc_code VARCHAR(50) NOT NULL,
    branch VARCHAR(200) NOT NULL,
    account_type VARCHAR(50) NOT NULL DEFAULT 'Current Account',
    upi_details TEXT NOT NULL,
    store_manager_title VARCHAR(100) NOT NULL DEFAULT 'Store Manager',
    store_manager_name VARCHAR(120) NOT NULL DEFAULT 'Rajesh Sharma',
    store_manager_phone VARCHAR(50) NOT NULL DEFAULT '+91 98250 12345',
    sales_associate_title VARCHAR(100) NOT NULL DEFAULT 'Showroom Sales Associate',
    terms_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS customers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    mobile_number VARCHAR(30) NOT NULL,
    email VARCHAR(120),
    delivery_address TEXT NOT NULL,
    site_location VARCHAR(150),
    gstin VARCHAR(50),
    notes TEXT,
    created_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers (name);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers (mobile_number);

CREATE TABLE IF NOT EXISTS tile_brands (
    id SERIAL PRIMARY KEY,
    name VARCHAR(150) NOT NULL UNIQUE,
    description VARCHAR(255),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS brand_size_coverages (
    id SERIAL PRIMARY KEY,
    brand_id INTEGER NOT NULL REFERENCES tile_brands(id) ON DELETE CASCADE,
    size VARCHAR(80) NOT NULL,
    product_type VARCHAR(30) NOT NULL DEFAULT 'box',
    coverage_sqft NUMERIC(8, 2) NOT NULL DEFAULT 0.00,
    pieces_per_box INTEGER NOT NULL DEFAULT 1,
    default_rate_sqft NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    default_rate_box NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    is_active BOOLEAN NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS idx_coverages_brand ON brand_size_coverages (brand_id);

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

CREATE TABLE IF NOT EXISTS quotation_sequences (
    year_prefix VARCHAR(20) PRIMARY KEY,
    last_seq INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS payment_sequences (
    year_prefix VARCHAR(20) PRIMARY KEY,
    last_seq INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS quotations (
    id SERIAL PRIMARY KEY,
    quotation_number VARCHAR(60) UNIQUE NOT NULL,
    quotation_date DATE NOT NULL,
    customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
    sales_person_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    customer_name VARCHAR(150) NOT NULL,
    customer_phone VARCHAR(30) NOT NULL,
    customer_gstin VARCHAR(50),
    delivery_address TEXT NOT NULL,
    site_location VARCHAR(150),
    sales_person_name VARCHAR(120) NOT NULL,
    assisted_sales_person_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    assisted_sales_person_name VARCHAR(120),
    split_share_type VARCHAR(20) DEFAULT 'percentage',
    primary_sales_share_percent NUMERIC(5, 2) DEFAULT 100.00,
    primary_sales_share_amount NUMERIC(12, 2) DEFAULT 0.00,
    assisted_sales_share_percent NUMERIC(5, 2) DEFAULT 0.00,
    assisted_sales_share_amount NUMERIC(12, 2) DEFAULT 0.00,
    project_name VARCHAR(150),
    quotation_type VARCHAR(30) NOT NULL DEFAULT 'tiles',
    status VARCHAR(30) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'in_review', 'approved', 'rejected', 'closed')),
    manager_approval_note TEXT,
    approved_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    gross_total NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    discount_percent NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    taxable_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    tax_type VARCHAR(20) NOT NULL DEFAULT 'cgst_sgst' CHECK (tax_type IN ('cgst_sgst', 'igst', 'exempt')),
    cgst_rate NUMERIC(5, 2) NOT NULL DEFAULT 9.00,
    cgst_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    sgst_rate NUMERIC(5, 2) NOT NULL DEFAULT 9.00,
    sgst_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    igst_rate NUMERIC(5, 2) NOT NULL DEFAULT 18.00,
    igst_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    round_off NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    net_total NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    special_notes TEXT,
    dispatch_status VARCHAR(50) DEFAULT 'Ready Stock',
    expected_dispatch_date DATE,
    dispatch_notes TEXT,
    dispatched_at TIMESTAMPTZ,
    dispatched_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    dispatched_by_name VARCHAR(120),
    has_dispatch_item_changes BOOLEAN DEFAULT FALSE,
    dispatch_change_summary TEXT,
    dispatch_change_acknowledged_at TIMESTAMPTZ,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_quotations_number ON quotations (quotation_number);
CREATE INDEX IF NOT EXISTS idx_quotations_status ON quotations (status);
CREATE INDEX IF NOT EXISTS idx_quotations_date ON quotations (quotation_date);
CREATE INDEX IF NOT EXISTS idx_quotations_customer ON quotations (customer_id);
CREATE INDEX IF NOT EXISTS idx_quotations_sales_person ON quotations (sales_person_id);
CREATE INDEX IF NOT EXISTS idx_quotations_assisted_sales_person ON quotations (assisted_sales_person_id);
CREATE INDEX IF NOT EXISTS idx_quotations_type ON quotations (quotation_type);

CREATE TABLE IF NOT EXISTS quotation_areas (
    id SERIAL PRIMARY KEY,
    quotation_id INTEGER NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
    area_name VARCHAR(120) NOT NULL,
    display_order INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_quotation_areas_quotation ON quotation_areas (quotation_id);

CREATE TABLE IF NOT EXISTS quotation_items (
    id SERIAL PRIMARY KEY,
    quotation_id INTEGER NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
    area_id INTEGER NOT NULL REFERENCES quotation_areas(id) ON DELETE CASCADE,
    sl_no INTEGER NOT NULL,
    description VARCHAR(255) NOT NULL,
    size VARCHAR(60) NOT NULL,
    brand VARCHAR(120) NOT NULL,
    product_type VARCHAR(30) NOT NULL DEFAULT 'box',
    coverage_area NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    quantity_sqft NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    base_rate_per_sqft NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    rate_per_sqft NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    quantity_boxes NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    base_rate_per_box NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    rate_per_box NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    discount_percent NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    item_code VARCHAR(100),
    item_image TEXT,
    mrp_price NUMERIC(12, 2) DEFAULT 0.00,
    encrypted_code VARCHAR(100),
    dispatch_status VARCHAR(50) DEFAULT 'Ready Stock',
    expected_dispatch_date DATE,
    dispatch_notes TEXT,
    dispatched_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_quotation_items_quotation ON quotation_items (quotation_id);
CREATE INDEX IF NOT EXISTS idx_quotation_items_area ON quotation_items (area_id);

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

CREATE TABLE IF NOT EXISTS payments (
    id SERIAL PRIMARY KEY,
    payment_number VARCHAR(60) UNIQUE NOT NULL,
    quotation_id INTEGER NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    payment_mode VARCHAR(50) NOT NULL CHECK (payment_mode IN ('Cash', 'Cheque', 'Bank Transfer (NEFT/RTGS/IMPS)', 'UPI (GPay/PhonePe/Paytm)', 'Card')),
    payment_date DATE NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'Recorded' CHECK (status IN ('Recorded', 'Cleared', 'Bounced', 'Refunded', 'Verified')),
    reference_number VARCHAR(100),
    notes TEXT,
    recorded_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    verified_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    verified_by_name VARCHAR(120),
    verified_at TIMESTAMPTZ,
    verification_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_payments_quotation ON payments (quotation_id);
CREATE INDEX IF NOT EXISTS idx_payments_date ON payments (payment_date);

CREATE TABLE IF NOT EXISTS sales_targets (
    id SERIAL PRIMARY KEY,
    sales_person_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_type VARCHAR(30) NOT NULL CHECK (target_type IN ('Daily', 'Weekly', 'Monthly', 'Custom')),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    year INTEGER,
    month INTEGER,
    week_number INTEGER,
    period_label VARCHAR(150) NOT NULL,
    target_amount NUMERIC(14, 2) NOT NULL CHECK (target_amount >= 0),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_sales_targets_person ON sales_targets (sales_person_id);
CREATE INDEX IF NOT EXISTS idx_sales_targets_dates ON sales_targets (start_date, end_date);

CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER,
    username VARCHAR(100),
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    entity_id VARCHAR(100),
    details_json JSONB,
    ip_address VARCHAR(50),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs (entity_type, entity_id);

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
CREATE UNIQUE INDEX IF NOT EXISTS idx_sanitary_catalog_code_unique ON sanitary_catalog_items (item_code);
CREATE INDEX IF NOT EXISTS idx_sanitary_catalog_code ON sanitary_catalog_items (item_code);
CREATE INDEX IF NOT EXISTS idx_sanitary_catalog_brand ON sanitary_catalog_items (brand);
CREATE INDEX IF NOT EXISTS idx_sanitary_catalog_category ON sanitary_catalog_items (category);

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

