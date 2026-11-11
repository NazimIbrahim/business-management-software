-- AMA Ceramics Quotation System - PostgreSQL Schema
-- Designed for LAN Central Server with High Concurrency and Financial Precision

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(120) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'salesperson',
    sales_category VARCHAR(50) NOT NULL DEFAULT 'RETAIL' CHECK (sales_category IN ('RETAIL', 'PROJECT', 'MANAGEMENT', 'COMPANY')),
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
    sales_category VARCHAR(50) DEFAULT 'RETAIL' CHECK (sales_category IN ('RETAIL', 'PROJECT', 'MANAGEMENT', 'COMPANY')),
    created_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_by_name VARCHAR(255),
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
CREATE INDEX IF NOT EXISTS idx_quotations_created_by ON quotations (created_by_id);
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
    customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
    proof_file_url TEXT,
    proof_file_name VARCHAR(255),
    proof_mime_type VARCHAR(100),
    recorded_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    verified_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    verified_by_name VARCHAR(120),
    verified_at TIMESTAMPTZ,
    verification_notes TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_payments_quotation ON payments (quotation_id);
CREATE INDEX IF NOT EXISTS idx_payments_date ON payments (payment_date);
CREATE INDEX IF NOT EXISTS idx_payments_customer_id ON payments (customer_id);

CREATE OR REPLACE VIEW payment_transactions AS
SELECT p.*,
       q.quotation_number,
       q.customer_name as quotation_customer_name,
       COALESCE(c.name, q.customer_name) as customer_name,
       COALESCE(c.mobile_number, q.customer_phone) as customer_phone
FROM payments p
JOIN quotations q ON q.id = p.quotation_id
LEFT JOIN customers c ON c.id = p.customer_id;

CREATE TABLE IF NOT EXISTS sales_targets (
    id SERIAL PRIMARY KEY,
    category VARCHAR(50) NOT NULL DEFAULT 'RETAIL' CHECK (category IN ('RETAIL', 'PROJECT', 'MANAGEMENT', 'COMPANY')),
    sales_person_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    target_type VARCHAR(30) NOT NULL CHECK (target_type IN ('Daily', 'Weekly', 'Monthly', 'Custom', 'Quarterly', 'Annual')),
    period_type VARCHAR(20) NOT NULL DEFAULT 'MONTHLY' CHECK (period_type IN ('MONTHLY', 'QUARTERLY', 'YEARLY')),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    year INTEGER,
    month INTEGER,
    week_number INTEGER,
    period_label VARCHAR(150) NOT NULL,
    target_amount NUMERIC(15, 2) NOT NULL CHECK (target_amount >= 0),
    target_volume_sqft NUMERIC(15, 2) DEFAULT 0.00,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_sales_targets_person ON sales_targets (sales_person_id);
CREATE INDEX IF NOT EXISTS idx_sales_targets_dates ON sales_targets (start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_sales_targets_cat_period ON sales_targets (category, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_sales_targets_user_period ON sales_targets (sales_person_id, start_date, end_date);

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

-- -------------------------------------------------------------
-- DISPATCH SUBSYSTEM TABLES
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dispatch_records (
    id SERIAL PRIMARY KEY,
    dispatch_number VARCHAR(60) UNIQUE NOT NULL,
    quotation_id INTEGER NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
    status VARCHAR(40) NOT NULL DEFAULT 'PROCESSING',
    scheduled_date DATE,
    completed_date TIMESTAMPTZ,
    vehicle_no VARCHAR(50),
    driver_name VARCHAR(120),
    driver_phone VARCHAR(30),
    delivery_address TEXT,
    challan_number VARCHAR(80),
    notes TEXT,
    dispatched_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    dispatched_by_name VARCHAR(120),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_dispatch_records_qid ON dispatch_records (quotation_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_records_status ON dispatch_records (status);
CREATE INDEX IF NOT EXISTS idx_dispatch_records_sched ON dispatch_records (scheduled_date);
CREATE INDEX IF NOT EXISTS idx_dispatch_records_challan ON dispatch_records (challan_number);

CREATE TABLE IF NOT EXISTS dispatch_items (
    id SERIAL PRIMARY KEY,
    dispatch_id INTEGER NOT NULL REFERENCES dispatch_records(id) ON DELETE CASCADE,
    quotation_item_id INTEGER NOT NULL REFERENCES quotation_items(id) ON DELETE CASCADE,
    ordered_quantity NUMERIC(12, 2) NOT NULL DEFAULT 0,
    quantity_dispatched NUMERIC(12, 2) NOT NULL DEFAULT 0,
    unit VARCHAR(30) DEFAULT 'boxes',
    status VARCHAR(40) NOT NULL DEFAULT 'PENDING',
    remarks TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_dispatch_items_did ON dispatch_items (dispatch_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_items_qiid ON dispatch_items (quotation_item_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_items_status ON dispatch_items (status);

CREATE TABLE IF NOT EXISTS local_purchases (
    id SERIAL PRIMARY KEY,
    quotation_item_id INTEGER NOT NULL REFERENCES quotation_items(id) ON DELETE CASCADE,
    quotation_id INTEGER NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
    vendor_name VARCHAR(180) NOT NULL DEFAULT 'Local Distributor',
    vendor_contact VARCHAR(50),
    required_quantity NUMERIC(12, 2) NOT NULL DEFAULT 0,
    quoted_rate NUMERIC(12, 2) NOT NULL DEFAULT 0,
    actual_purchase_rate NUMERIC(12, 2) DEFAULT 0,
    purchase_status VARCHAR(40) NOT NULL DEFAULT 'PO_RAISED',
    invoice_number VARCHAR(100),
    expected_date DATE,
    completed_date TIMESTAMPTZ,
    notes TEXT,
    payment_checked BOOLEAN DEFAULT FALSE,
    payment_checked_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    payment_checked_by_name VARCHAR(120),
    payment_checked_at TIMESTAMPTZ,
    availability_checked BOOLEAN DEFAULT FALSE,
    availability_checked_at TIMESTAMPTZ,
    admin_override_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    admin_override_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_local_purchases_item UNIQUE (quotation_item_id)
);
CREATE INDEX IF NOT EXISTS idx_local_purchases_qid ON local_purchases (quotation_id);
CREATE INDEX IF NOT EXISTS idx_local_purchases_qiid ON local_purchases (quotation_item_id);
CREATE INDEX IF NOT EXISTS idx_local_purchases_status ON local_purchases (purchase_status, expected_date);
CREATE INDEX IF NOT EXISTS idx_local_purchases_vendor ON local_purchases (vendor_name);

CREATE TABLE IF NOT EXISTS factory_orders (
    id SERIAL PRIMARY KEY,
    quotation_item_id INTEGER NOT NULL REFERENCES quotation_items(id) ON DELETE CASCADE,
    quotation_id INTEGER NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
    factory_name VARCHAR(180) NOT NULL DEFAULT 'Factory / Morbi Plant',
    brand_name VARCHAR(120),
    batch_shade_code VARCHAR(100),
    lr_number VARCHAR(100),
    transporter_name VARCHAR(150),
    truck_number VARCHAR(50),
    order_date DATE NOT NULL DEFAULT CURRENT_DATE,
    eta_date DATE,
    unloaded_date TIMESTAMPTZ,
    status VARCHAR(40) NOT NULL DEFAULT 'ORDER_PLACED',
    freight_cost NUMERIC(12, 2) DEFAULT 0,
    total_pallets NUMERIC(10, 2) DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_factory_orders_qid ON factory_orders (quotation_id);
CREATE INDEX IF NOT EXISTS idx_factory_orders_qiid ON factory_orders (quotation_item_id);
CREATE INDEX IF NOT EXISTS idx_factory_orders_status ON factory_orders (status, eta_date);
CREATE INDEX IF NOT EXISTS idx_factory_orders_factory ON factory_orders (factory_name);
CREATE INDEX IF NOT EXISTS idx_factory_orders_lr ON factory_orders (lr_number);

-- Dispatch Invoices for Tax Invoice PDF Verification & Auto-Reconciliation
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

-- Credit Notes & Damage Replacement System
CREATE TABLE IF NOT EXISTS credit_notes (
    id SERIAL PRIMARY KEY,
    quotation_id INTEGER NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
    credit_note_number VARCHAR(100) NOT NULL,
    credit_note_date DATE,
    file_url TEXT NOT NULL,
    file_name VARCHAR(255),
    file_size INTEGER,
    file_base64 TEXT,
    reason VARCHAR(255) DEFAULT 'Transit Damage',
    customer_phone_detected VARCHAR(50),
    customer_gstin_detected VARCHAR(50),
    total_returned_boxes NUMERIC(10, 2) DEFAULT 0,
    total_credit_amount NUMERIC(12, 2) DEFAULT 0,
    status VARCHAR(50) DEFAULT 'APPLIED',
    notes TEXT,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_by_name VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_credit_notes_quotation_id ON credit_notes(quotation_id);
CREATE INDEX IF NOT EXISTS idx_credit_notes_number ON credit_notes(LOWER(TRIM(credit_note_number)));

CREATE TABLE IF NOT EXISTS credit_note_items (
    id SERIAL PRIMARY KEY,
    credit_note_id INTEGER NOT NULL REFERENCES credit_notes(id) ON DELETE CASCADE,
    quotation_id INTEGER NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
    quotation_item_id INTEGER NOT NULL REFERENCES quotation_items(id) ON DELETE CASCADE,
    item_description VARCHAR(255) NOT NULL,
    damaged_quantity NUMERIC(10, 2) NOT NULL,
    unit VARCHAR(50) DEFAULT 'BOX',
    replacement_sourcing_status VARCHAR(50) DEFAULT 'READY_STOCK',
    status VARCHAR(50) DEFAULT 'AWAITING_REDISPATCH',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_credit_note_items_cn_id ON credit_note_items(credit_note_id);
CREATE INDEX IF NOT EXISTS idx_credit_note_items_item_id ON credit_note_items(quotation_item_id);



