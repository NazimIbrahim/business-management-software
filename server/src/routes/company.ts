import { Router, Request, Response } from 'express';
import { query, getLastDbError } from '../db/connection';
import { authenticateToken, requireRole } from '../middleware/auth';
import { recordAuditLog } from '../utils/audit';
import { broadcast } from '../ws';

export const companyRouter = Router();

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

// Helper to auto-seed company settings if missing
async function getOrCreateCompanySettings() {
  let rows = await query('SELECT * FROM company_settings ORDER BY id ASC LIMIT 1');
  if (rows.length === 0) {
    rows = await query(
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
      ) RETURNING *`,
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
  }
  return rows[0];
}

// Public / Authenticated read
companyRouter.get('/', async (req: Request, res: Response) => {
  try {
    const settings = await getOrCreateCompanySettings();
    if (typeof settings.terms_json === 'string') {
      try {
        settings.terms_json = JSON.parse(settings.terms_json);
      } catch (e) {
        settings.terms_json = defaultTerms;
      }
    }
    res.json({ company: settings });
  } catch (error: any) {
    const errorMsg = error?.message || (typeof error === 'string' ? error : '') || getLastDbError() || 'Failed to fetch company settings';
    res.status(500).json({ error: errorMsg });
  }
});

// Update company profile (Admin only)
companyRouter.put('/', authenticateToken, requireRole(['admin']), async (req: Request, res: Response) => {
  try {
    const {
      company_name,
      tagline,
      logo_base64,
      address_line1,
      address_line2,
      phone,
      email,
      website,
      gstin,
      state,
      state_code,
      bank_name,
      account_name,
      account_number,
      ifsc_code,
      branch,
      account_type,
      upi_details,
      store_manager_title,
      store_manager_name,
      store_manager_phone,
      sales_associate_title,
      terms_json,
    } = req.body;

    const termsPayload = Array.isArray(terms_json)
      ? JSON.stringify(terms_json)
      : (typeof terms_json === 'string' ? terms_json : JSON.stringify(defaultTerms));

    const existing = await query('SELECT id FROM company_settings ORDER BY id ASC LIMIT 1');
    let rows: any[] = [];

    if (existing.length === 0) {
      rows = await query(
        `INSERT INTO company_settings (
          company_name, tagline, logo_base64, address_line1, address_line2,
          phone, email, website, gstin, state, state_code,
          bank_name, account_name, account_number, ifsc_code, branch,
          account_type, upi_details, store_manager_title, store_manager_name,
          store_manager_phone, sales_associate_title, terms_json
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9, $10, $11,
          $12, $13, $14, $15, $16,
          $17, $18, $19, $20,
          $21, $22, $23
        ) RETURNING *`,
        [
          company_name || 'Quotation Management System',
          tagline ?? '',
          logo_base64 ?? null,
          address_line1 ?? '',
          address_line2 ?? '',
          phone ?? '',
          email ?? '',
          website ?? '',
          gstin ?? '',
          state ?? 'Karnataka',
          state_code ?? '29',
          bank_name ?? '',
          account_name ?? '',
          account_number ?? '',
          ifsc_code ?? '',
          branch ?? '',
          account_type ?? 'Current Account',
          upi_details ?? '',
          store_manager_title ?? 'Store Manager',
          store_manager_name ?? '',
          store_manager_phone ?? '',
          sales_associate_title ?? 'Showroom Sales Associate',
          termsPayload,
        ]
      );
    } else {
      const targetId = existing[0].id;
      rows = await query(
        `UPDATE company_settings
         SET company_name = COALESCE($1, company_name),
             tagline = COALESCE($2, tagline),
             logo_base64 = $3,
             address_line1 = COALESCE($4, address_line1),
             address_line2 = COALESCE($5, address_line2),
             phone = COALESCE($6, phone),
             email = COALESCE($7, email),
             website = COALESCE($8, website),
             gstin = COALESCE($9, gstin),
             state = COALESCE($10, state),
             state_code = COALESCE($11, state_code),
             bank_name = COALESCE($12, bank_name),
             account_name = COALESCE($13, account_name),
             account_number = COALESCE($14, account_number),
             ifsc_code = COALESCE($15, ifsc_code),
             branch = COALESCE($16, branch),
             account_type = COALESCE($17, account_type),
             upi_details = COALESCE($18, upi_details),
             store_manager_title = COALESCE($19, store_manager_title),
             store_manager_name = COALESCE($20, store_manager_name),
             store_manager_phone = COALESCE($21, store_manager_phone),
             sales_associate_title = COALESCE($22, sales_associate_title),
             terms_json = $23,
             updated_at = NOW()
         WHERE id = $24
         RETURNING *`,
        [
          company_name,
          tagline,
          logo_base64 !== undefined ? logo_base64 : existing[0].logo_base64,
          address_line1,
          address_line2,
          phone,
          email,
          website,
          gstin,
          state,
          state_code,
          bank_name,
          account_name,
          account_number,
          ifsc_code,
          branch,
          account_type,
          upi_details,
          store_manager_title,
          store_manager_name,
          store_manager_phone,
          sales_associate_title,
          termsPayload,
          targetId,
        ]
      );
    }

    const updatedCompany = rows[0];
    if (typeof updatedCompany.terms_json === 'string') {
      try {
        updatedCompany.terms_json = JSON.parse(updatedCompany.terms_json);
      } catch (e) {
        updatedCompany.terms_json = defaultTerms;
      }
    }

    await recordAuditLog({
      userId: req.user!.id,
      username: req.user!.username,
      action: 'COMPANY_SETTINGS_UPDATED',
      entityType: 'company_settings',
      entityId: updatedCompany.id || 1,
      ipAddress: req.ip,
    });

    broadcast({ type: 'SETTINGS_UPDATED', payload: { company: updatedCompany } });

    res.json({ company: updatedCompany });
  } catch (error: any) {
    const errorMsg = error?.message || (typeof error === 'string' ? error : '') || getLastDbError() || 'Failed to update company settings';
    res.status(500).json({ error: errorMsg });
  }
});
