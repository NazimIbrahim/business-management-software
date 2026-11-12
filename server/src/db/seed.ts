import bcrypt from 'bcryptjs';
import { query, withTransaction } from './connection';
import { logger } from '../utils/logger';

export async function seedDatabase(): Promise<void> {
  logger.info('Starting database seeding...');

  await withTransaction(async (client) => {
    // 1. Seed Users (Only Administrator kept by default)
    logger.info('Seeding default admin user...');
    const salt = await bcrypt.genSalt(10);
    const users = [
      {
        username: 'admin',
        password: 'admin',
        full_name: 'System Administrator',
        role: 'admin',
        email: 'admin@amaceramics.com',
        phone: '+91 98250 00001',
        monthly_target: 0,
      },
      {
        username: 'dispatch',
        password: 'dispatchpassword123',
        full_name: 'Dispatch Team Coordinator',
        role: 'dispatch',
        email: 'dispatch@amaceramics.com',
        phone: '+91 98250 00006',
        monthly_target: 0,
      },
    ];

    for (const u of users) {
      const hash = await bcrypt.hash(u.password, salt);
      await client.query(
        `INSERT INTO users (username, password_hash, full_name, role, email, phone, monthly_target)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (username) DO UPDATE
         SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, email = EXCLUDED.email, phone = EXCLUDED.phone`,
        [u.username, hash, u.full_name, u.role, u.email, u.phone, u.monthly_target]
      );
    }

    // 2. Seed Company Settings
    logger.info('Seeding company settings...');
    const terms = [
      'This quotation is valid for a period of 30 days from the date of issue. Prices are subject to change after this period without prior notice.',
      'All prices mentioned are inclusive of applicable taxes.',
      '100% advance payment. Any outstanding amount has to be cleared before delivery.',
      'Payment must be made via Bank transfer, Google pay, Phone pay or Cheque.',
      'Delivery will be made within 10-15 days from the date of order confirmation and receipt of Advance payment.',
      'Delivery is subject to stock availability at the time of order.',
      'The cost of transportation will be borne by the customer, unless otherwise agreed upon.',
      'Any delay in delivery due to unavailability of materials in factory will not hold the seller liable.',
      'The buyer must inspect the materials upon delivery. Any discrepancies or damages must be reported within 24 hours.',
      'Once materials are inspected and accepted no claims will be entertained.',
      'Orders once placed cannot be cancelled.',
      'Return or replacements are only applicable for defective or damaged products subject to approvals after inspection.',
      'Non-defective materials are non-returnable.'
    ];

    const companyCheck = await client.query('SELECT count(*) FROM company_settings');
    if (parseInt(companyCheck.rows[0].count, 10) === 0) {
      await client.query(
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
          JSON.stringify(terms),
        ]
      );
    }

    // 3. Seed Brands
    logger.info('Seeding tile brands...');
    const brands = [
      { name: 'Kajaria Eternity', desc: 'Premium GVT/PGVT vitrified tiles and slabs' },
      { name: 'Simpolo Ceramics', desc: 'Architectural vitrified surfaces & carving slabs' },
      { name: 'Qutone Ceramics', desc: 'High-end i-Marble and large porcelain slabs' },
      { name: 'Simero Vitrified', desc: 'Luxury glazed vitrified flooring solutions' },
      { name: 'Grifine Ceramics', desc: 'Modern designer wall and floor tiles' },
      { name: 'Mozart Vitrified', desc: 'Designer Italian-inspired ceramic surfaces' },
      { name: 'Nexion Surfaces', desc: 'Sintered marble and contemporary architectural tiles' },
      { name: 'VS Tiles', desc: 'Durable vitrified tiles for residential and commercial spaces' },
    ];

    const brandMap = new Map<string, number>();
    for (const b of brands) {
      const res = await client.query(
        `INSERT INTO tile_brands (name, description) VALUES ($1, $2)
         ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description RETURNING id, name`,
        [b.name, b.desc]
      );
      brandMap.set(res.rows[0].name, res.rows[0].id);
    }

    // 4. Seed Brand Size Coverages
    logger.info('Seeding brand size coverages...');
    const coverages = [
      { brand: 'Kajaria Eternity', size: '1200X1800', sqft: 46.5, pieces: 2, r_sqft: 125.0, r_box: 5812.5 },
      { brand: 'Kajaria Eternity', size: '200X1200', sqft: 15.5, pieces: 6, r_sqft: 90.0, r_box: 1395.0 },
      { brand: 'Simpolo Ceramics', size: '1200X1800', sqft: 46.5, pieces: 2, r_sqft: 145.0, r_box: 6742.5 },
      { brand: 'Simpolo Ceramics', size: '600X1200', sqft: 15.5, pieces: 2, r_sqft: 95.0, r_box: 1472.5 },
      { brand: 'Qutone Ceramics', size: '1200X1800', sqft: 46.5, pieces: 2, r_sqft: 140.0, r_box: 6510.0 },
      { brand: 'Simero Vitrified', size: '1200X1800', sqft: 46.5, pieces: 2, r_sqft: 160.0, r_box: 7440.0 },
      { brand: 'Grifine Ceramics', size: '600X600', sqft: 15.5, pieces: 4, r_sqft: 85.0, r_box: 1317.5 },
      { brand: 'Grifine Ceramics', size: '600X1200', sqft: 15.5, pieces: 2, r_sqft: 90.0, r_box: 1395.0 },
      { brand: 'Mozart Vitrified', size: '600X600', sqft: 15.5, pieces: 4, r_sqft: 90.0, r_box: 1395.0 },
      { brand: 'Nexion Surfaces', size: '1200X1800', sqft: 46.5, pieces: 2, r_sqft: 390.0, r_box: 18135.0 },
      { brand: 'VS Tiles', size: '600X600', sqft: 15.5, pieces: 4, r_sqft: 125.0, r_box: 1937.5 },
    ];

    for (const c of coverages) {
      const bId = brandMap.get(c.brand);
      if (bId) {
        const check = await client.query(
          `SELECT id FROM brand_size_coverages WHERE brand_id = $1 AND size = $2`,
          [bId, c.size]
        );
        if (check.rows.length === 0) {
          await client.query(
            `INSERT INTO brand_size_coverages (brand_id, size, coverage_sqft, pieces_per_box, default_rate_sqft, default_rate_box)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [bId, c.size, c.sqft, c.pieces, c.r_sqft, c.r_box]
          );
        }
      }
    }

    // 5. Seed Customers
    logger.info('Seeding customers...');
    const customers = [
      {
        name: 'Mr Vinayak',
        mobile: '7795495467',
        email: 'vinayak@example.com',
        address: 'Villa 42, Palm Meadows, Whitefield, Bengaluru',
        site: 'Bengaluru Residence',
        gstin: '',
        notes: 'Premium residential villa project with multiple luxury bathrooms and living spaces.',
      },
      {
        name: 'Dr. Priya Sengupta',
        mobile: '+91 98980 11223',
        email: 'dr.priya.s@gmail.com',
        address: 'Bungalow No. 14, Whispering Meadows, Near Sterling City, Bopal, Ahmedabad - 380058',
        site: 'Bopal Villa Project',
        gstin: '24ABCPS1234F1Z8',
        notes: 'Requires matching Italian marble patterns and anti-skid bathroom tiles.',
      },
      {
        name: 'Ar. Rohan Mehta (Studio Form & Space)',
        mobile: '+91 98240 77889',
        email: 'rohan@studioformspace.com',
        address: 'Plot 302, Sector 8, Gandhinagar, Gujarat - 382007',
        site: 'Luxury Weekend Home',
        gstin: '24AAECS9988G1ZQ',
        notes: 'Architectural specifier. High volume luxury slab orders.',
      },
    ];

    const customerMap = new Map<string, number>();
    for (const cust of customers) {
      const res = await client.query(
        `INSERT INTO customers (name, mobile_number, email, delivery_address, site_location, gstin, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT DO NOTHING RETURNING id, name`,
        [cust.name, cust.mobile, cust.email, cust.address, cust.site, cust.gstin, cust.notes]
      );
      if (res.rows.length > 0) {
        customerMap.set(res.rows[0].name, res.rows[0].id);
      } else {
        const existing = await client.query('SELECT id FROM customers WHERE mobile_number = $1', [cust.mobile]);
        customerMap.set(cust.name, existing.rows[0].id);
      }
    }

    // 6. Seed Mr. Vinayak's Full Quotation (matching sample Mr Vinayak.pdf)
    logger.info('Seeding sample quotation matching Mr Vinayak.pdf...');
    const vinayakId = customerMap.get('Mr Vinayak');
    const yasminUser = await client.query("SELECT id FROM users WHERE username = 'yasmin'");
    const managerUser = await client.query("SELECT id FROM users WHERE username = 'manager'");
    const salespersonId = yasminUser.rows[0]?.id || 1;
    const managerId = managerUser.rows[0]?.id || 2;

    const qNumber = 'AMA-2026-0001';
    const checkQ = await client.query('SELECT id FROM quotations WHERE quotation_number = $1', [qNumber]);

    if (checkQ.rows.length === 0) {
      const qInsert = await client.query(
        `INSERT INTO quotations (
          quotation_number, quotation_date, customer_id, sales_person_id,
          customer_name, customer_phone, delivery_address, sales_person_name,
          project_name, status, manager_approval_note, approved_by_id, approved_at,
          gross_total, discount_amount, discount_percent, taxable_amount,
          tax_type, cgst_rate, cgst_amount, sgst_rate, sgst_amount,
          round_off, net_total, special_notes, version
        ) VALUES (
          $1, $2, $3, $4,
          $5, $6, $7, $8,
          $9, $10, $11, $12, $13,
          $14, $15, $16, $17,
          $18, $19, $20, $21, $22,
          $23, $24, $25, $26
        ) RETURNING id`,
        [
          qNumber,
          '2026-06-15',
          vinayakId,
          salespersonId,
          'Mr Vinayak',
          '7795495467',
          'Villa 42, Palm Meadows, Whitefield, Bengaluru',
          'Mr Yasmin',
          'Vinayak Luxury Villa Residence',
          'approved',
          'Approved with showroom volume concession.',
          managerId,
          '2026-06-16 11:30:00+05:30',
          774152.50,
          0.00,
          0.00,
          774152.50,
          'cgst_sgst',
          0.00, // Inclusive of taxes as per note 2
          0.00,
          0.00,
          0.00,
          -12772.50, // Round off discount
          761380.00, // Net total
          'All prices mentioned are inclusive of applicable taxes as per company showroom terms.',
          1
        ]
      );

      const quotationId = qInsert.rows[0].id;

      // Seed Areas & Items matching Mr Vinayak.pdf
      const areasData = [
        {
          name: 'GROUND FLOOR',
          order: 1,
          items: [
            { sl: 1, desc: 'OMBRA EMERALD ULTRA - SS', size: '1200X1800', brand: 'Simpolo Ceramics', cov: 46.5, sqft: 326, r_sqft: 145.0, boxes: 7, r_box: 6743, tot: 47197.50 },
            { sl: 2, desc: 'HARMONY ONYX - KAJ', size: '1200X1800', brand: 'Kajaria Eternity', cov: 46.5, sqft: 279, r_sqft: 125.0, boxes: 6, r_box: 5813, tot: 34875.00 },
          ]
        },
        {
          name: 'KIDS BATHROOM',
          order: 2,
          items: [
            { sl: 3, desc: 'MATTERA GIRGIO MATT - GRIFINE', size: '600X600', brand: 'Grifine Ceramics', cov: 15.5, sqft: 93, r_sqft: 85.0, boxes: 6, r_box: 1318, tot: 7905.00 },
            { sl: 4, desc: 'CORSICA SAND MATT - SS', size: '1200X1800', brand: 'Simpolo Ceramics', cov: 46.5, sqft: 279, r_sqft: 145.0, boxes: 6, r_box: 6743, tot: 40455.00 },
          ]
        },
        {
          name: 'FIRST FLOOR BATHROOM',
          order: 3,
          items: [
            { sl: 5, desc: 'MASCARA CREMA MATT - SS', size: '1200X1800', brand: 'Simpolo Ceramics', cov: 46.5, sqft: 279, r_sqft: 145.0, boxes: 6, r_box: 6743, tot: 40455.00 },
            { sl: 6, desc: 'VITERBO IVORY MATT - GRIFINE', size: '600X1200', brand: 'Grifine Ceramics', cov: 15.5, sqft: 93, r_sqft: 90.0, boxes: 6, r_box: 1395, tot: 8370.00 },
          ]
        },
        {
          name: 'BALCONY',
          order: 4,
          items: [
            { sl: 7, desc: 'ELEGENCE BLACK - SIMERO', size: '1200X1800', brand: 'Simero Vitrified', cov: 46.5, sqft: 326, r_sqft: 160.0, boxes: 7, r_box: 7440, tot: 52080.00 },
            { sl: 8, desc: 'DOVE RIVER - MOZART', size: '600X600', brand: 'Mozart Vitrified', cov: 15.5, sqft: 16, r_sqft: 90.0, boxes: 1, r_box: 1395, tot: 1395.00 },
          ]
        },
        {
          name: 'BAR COUNTER',
          order: 5,
          items: [
            { sl: 9, desc: 'AMELIA GIRGIO MATT - QUTONE', size: '1200X1800', brand: 'Qutone Ceramics', cov: 46.5, sqft: 186, r_sqft: 140.0, boxes: 4, r_box: 6510, tot: 26040.00 },
            { sl: 10, desc: 'OKNATE BROWN - VS', size: '600X600', brand: 'VS Tiles', cov: 15.5, sqft: 295, r_sqft: 125.0, boxes: 19, r_box: 1938, tot: 36812.50 },
          ]
        },
        {
          name: 'OUTSIDE WALL',
          order: 6,
          items: [
            { sl: 11, desc: 'X-WOOD TEAK - KAJ', size: '200X1200', brand: 'Kajaria Eternity', cov: 15.5, sqft: 1132, r_sqft: 90.0, boxes: 73, r_box: 1395, tot: 101835.00 },
            { sl: 12, desc: 'FERRO CLADDING TILE SQFT', size: 'SQFT', brand: 'Simpolo Ceramics', cov: 1.0, sqft: 550, r_sqft: 600.0, boxes: 550, r_box: 600, tot: 330000.00 },
          ]
        },
        {
          name: 'COMMON BATHROOM',
          order: 7,
          items: [
            { sl: 13, desc: 'AMELIA BEIGE - QUTONE', size: '1200X1800', brand: 'Qutone Ceramics', cov: 46.5, sqft: 140, r_sqft: 140.0, boxes: 3, r_box: 6510, tot: 19530.00 },
            { sl: 14, desc: 'BEIGE RIVER - MOZART', size: '600X600', brand: 'Mozart Vitrified', cov: 15.5, sqft: 31, r_sqft: 90.0, boxes: 2, r_box: 1395, tot: 2790.00 },
          ]
        },
        {
          name: 'MASTER BATHROOM',
          order: 8,
          items: [
            { sl: 15, desc: 'PLATINA BLEND - KAJ', size: '1200X1800', brand: 'Kajaria Eternity', cov: 46.5, sqft: 47, r_sqft: 135.0, boxes: 1, r_box: 6278, tot: 6277.50 },
            { sl: 16, desc: 'PIETRA GREY LAPPATO - NEXION', size: '1200X1800', brand: 'Nexion Surfaces', cov: 46.5, sqft: 47, r_sqft: 390.0, boxes: 1, r_box: 18135, tot: 18135.00 },
          ]
        }
      ];

      for (const area of areasData) {
        const areaRes = await client.query(
          `INSERT INTO quotation_areas (quotation_id, area_name, display_order)
           VALUES ($1, $2, $3) RETURNING id`,
          [quotationId, area.name, area.order]
        );
        const areaId = areaRes.rows[0].id;

        for (const item of area.items) {
          await client.query(
            `INSERT INTO quotation_items (
              quotation_id, area_id, sl_no, description, size, brand,
              coverage_area, quantity_sqft, rate_per_sqft, quantity_boxes, rate_per_box, total_amount
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
            [
              quotationId,
              areaId,
              item.sl,
              item.desc,
              item.size,
              item.brand,
              item.cov,
              item.sqft,
              item.r_sqft,
              item.boxes,
              item.r_box,
              item.tot
            ]
          );
        }
      }

      // 7. Seed Payments for Vinayak
      logger.info('Seeding payments...');
      await client.query(
        `INSERT INTO payments (
          payment_number, quotation_id, amount, payment_mode, payment_date,
          status, reference_number, notes, recorded_by_id
        ) VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8, $9),
        ($10, $11, $12, $13, $14, $15, $16, $17, $18)`,
        [
          'REC-2026-0001', quotationId, 400000.00, 'Bank Transfer (NEFT/RTGS/IMPS)', '2026-06-18',
          'Cleared', 'HDFCN2606189901', 'Initial 50% order booking advance', salespersonId,
          'REC-2026-0002', quotationId, 250000.00, 'Cheque', '2026-06-25',
          'Cleared', 'CHQ #902145 SBI', 'Second milestone payment prior to factory dispatch', salespersonId,
        ]
      );
    }

    // 8. Seed Sales Targets
    logger.info('Seeding sales targets...');
    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = now.getMonth() + 1;

    const targets = [
      {
        personId: salespersonId,
        type: 'Monthly',
        start: `${curYear}-${String(curMonth).padStart(2, '0')}-01`,
        end: `${curYear}-${String(curMonth).padStart(2, '0')}-28`,
        year: curYear,
        month: curMonth,
        label: `Monthly Target - ${curYear}/${curMonth}`,
        amount: 1500000.00,
      },
      {
        personId: salespersonId,
        type: 'Daily',
        start: new Date().toISOString().split('T')[0],
        end: new Date().toISOString().split('T')[0],
        year: curYear,
        month: curMonth,
        label: `Daily Target - Today`,
        amount: 60000.00,
      }
    ];

    for (const t of targets) {
      await client.query(
        `INSERT INTO sales_targets (
          sales_person_id, target_type, start_date, end_date, year, month, period_label, target_amount
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT DO NOTHING`,
        [t.personId, t.type, t.start, t.end, t.year, t.month, t.label, t.amount]
      );
    }

    // 9. Initial Audit Log
    await client.query(
      `INSERT INTO audit_logs (username, action, entity_type, entity_id, details_json)
       VALUES ($1, $2, $3, $4, $5)`,
      ['system', 'SYSTEM_INITIALIZED', 'database', '1', JSON.stringify({ message: 'AMA Ceramics system seed completed successfully' })]
    );

    logger.info('Database seeded successfully.');
  });
}

if (require.main === module) {
  seedDatabase()
    .then(() => {
      logger.info('Seed completed.');
      process.exit(0);
    })
    .catch((err) => {
      logger.error('Seed failed:', err);
      process.exit(1);
    });
}
