import { Router, Request, Response } from 'express';
import { query } from '../db/connection';
import { authenticateToken, optionalAuthenticateToken } from '../middleware/auth';
import * as XLSX from 'xlsx';
import { buildEncryptedProductMap, getOrSaveEncryptedProductCodes, derive3LetterCode } from '../utils/encryptedCode';
import {
  buildQuotationsReportPdf,
  buildItemizedQuotationsReportPdf,
  buildSalespersonsReportPdf,
  buildPaymentsReportPdf,
} from '../utils/reportPdfGenerator';

export const reportsRouter = Router();

// Export Quotations as XLSX or CSV (supports optional auth or query token)
reportsRouter.get('/quotations/export', optionalAuthenticateToken, async (req: Request, res: Response) => {
  try {
    const { format = 'xlsx', status, start_date, end_date, sales_person_id, search, encrypted, itemized, quotation_type } = req.query;

    const whereClauses = ['1=1'];
    const params: any[] = [];
    let idx = 1;

    const isSalesperson = req.user?.role?.toLowerCase() === 'salesperson';
    const targetSpId = isSalesperson
      ? req.user!.id
      : (sales_person_id && !isNaN(Number(sales_person_id)) ? parseInt(sales_person_id as string, 10) : null);

    if (targetSpId) {
      whereClauses.push(`(q.sales_person_id = $${idx}::integer OR q.assisted_sales_person_id = $${idx}::integer)`);
      params.push(targetSpId);
      idx++;
    }

    if (quotation_type && quotation_type !== 'all') {
      whereClauses.push(`q.quotation_type = $${idx++}::text`);
      params.push(String(quotation_type));
    }

    if (status) {
      const st = String(status).trim().toLowerCase();
      if (st === 'not_closed' || st === 'open') {
        whereClauses.push(`q.status IN ('draft', 'in_review', 'approved')`);
      } else if (st === 'closed') {
        whereClauses.push(`q.status = 'closed'`);
      } else {
        whereClauses.push(`q.status = $${idx++}::text`);
        params.push(st);
      }
    }

    if (search) {
      whereClauses.push(
        `(q.quotation_number ILIKE $${idx}::text OR q.customer_name ILIKE $${idx}::text OR q.customer_phone ILIKE $${idx}::text OR q.project_name ILIKE $${idx}::text OR q.assisted_sales_person_name ILIKE $${idx}::text)`
      );
      params.push(`%${search}%`);
      idx++;
    }

    if (start_date) {
      whereClauses.push(`q.quotation_date >= $${idx++}::date`);
      params.push(start_date);
    }
    if (end_date) {
      whereClauses.push(`q.quotation_date <= $${idx++}::date`);
      params.push(end_date);
    }

    const isEncrypted = encrypted === 'true' || encrypted === '1';
    const isItemized = itemized === 'true' || itemized === '1';

    let rows: any[] = [];

    if (isItemized) {
      const itemRows = await query(`
        SELECT
          q.quotation_number as "Quotation No",
          TO_CHAR(q.quotation_date, 'YYYY-MM-DD') as "Date",
          COALESCE(q.customer_name, '') as "Customer",
          COALESCE(q.sales_person_name, '') as "Salesperson",
          COALESCE(q.assisted_sales_person_name, '') as "Assisted By",
          COALESCE(q.status, '') as "Status",
          COALESCE(qa.area_name, 'General') as "Area / Room",
          COALESCE(qi.sl_no, 1) as "Item No",
          COALESCE(qi.description, '') as "Product Description",
          COALESCE(qi.brand, '') as "Brand",
          COALESCE(qi.size, '') as "Size",
          COALESCE(qi.product_type, '') as "Product Type",
          COALESCE(qi.quantity_sqft, 0) as "Sqft",
          COALESCE(qi.rate_per_sqft, 0) as "Rate/Sqft",
          COALESCE(qi.quantity_boxes, 0) as "Boxes/Qty",
          COALESCE(qi.rate_per_box, 0) as "Rate/Unit",
          COALESCE(qi.total_amount, 0) as "Item Total (INR)"
        FROM quotation_items qi
        JOIN quotation_areas qa ON qa.id = qi.area_id
        JOIN quotations q ON q.id = qa.quotation_id
        WHERE ${whereClauses.join(' AND ')}
        ORDER BY q.quotation_date DESC, q.id DESC, qa.display_order ASC, qi.sl_no ASC
      `, params);

      if (isEncrypted) {
        const itemNames = itemRows.map((it: any) => String(it["Product Description"] || '').trim()).filter(Boolean);
        const encryptedCodesMap = await getOrSaveEncryptedProductCodes(itemNames);

        rows = itemRows.map((it: any) => {
          const qNo = String(it["Quotation No"] || '');
          const desc = String(it["Product Description"] || '').trim();
          const masked = encryptedCodesMap.get(desc) || derive3LetterCode(desc);
          return {
            "Quotation No": qNo,
            "Date": String(it["Date"] || ''),
            "Customer": String(it["Customer"] || ''),
            "Salesperson": String(it["Salesperson"] || ''),
            "Status": String(it["Status"] || ''),
            "Area / Room": String(it["Area / Room"] || ''),
            "Item No": Number(it["Item No"]) || 1,
            "Encrypted Product Code": masked,
            "Size": String(it["Size"] || ''),
            "Product Type": String(it["Product Type"] || ''),
            "Sqft": Number(it["Sqft"]) || 0,
            "Rate/Sqft": Number(it["Rate/Sqft"]) || 0,
            "Boxes/Qty": Number(it["Boxes/Qty"]) || 0,
            "Rate/Unit": Number(it["Rate/Unit"]) || 0,
            "Item Total (INR)": Number(it["Item Total (INR)"]) || 0,
          };
        });
      } else {
        rows = itemRows.map((it: any) => ({
          "Quotation No": String(it["Quotation No"] || ''),
          "Date": String(it["Date"] || ''),
          "Customer": String(it["Customer"] || ''),
          "Salesperson": String(it["Salesperson"] || ''),
          "Status": String(it["Status"] || ''),
          "Area / Room": String(it["Area / Room"] || ''),
          "Item No": Number(it["Item No"]) || 1,
          "Product Description": String(it["Product Description"] || ''),
          "Brand": String(it["Brand"] || ''),
          "Size": String(it["Size"] || ''),
          "Product Type": String(it["Product Type"] || ''),
          "Sqft": Number(it["Sqft"]) || 0,
          "Rate/Sqft": Number(it["Rate/Sqft"]) || 0,
          "Boxes/Qty": Number(it["Boxes/Qty"]) || 0,
          "Rate/Unit": Number(it["Rate/Unit"]) || 0,
          "Item Total (INR)": Number(it["Item Total (INR)"]) || 0,
        }));
      }

      if (rows.length === 0) {
        rows = [{
          "Quotation No": "No records found",
          "Date": "",
          "Customer": "",
          "Salesperson": "",
          "Status": "",
          "Area / Room": "",
          "Item No": 1,
          ...(isEncrypted ? { "Encrypted Product Code": "" } : { "Product Description": "", "Brand": "" }),
          "Size": "",
          "Product Type": "",
          "Sqft": 0,
          "Rate/Sqft": 0,
          "Boxes/Qty": 0,
          "Rate/Unit": 0,
          "Item Total (INR)": 0,
        }];
      }
    } else {
      const regRows = await query(`
        SELECT
          q.quotation_number as "Quotation No",
          TO_CHAR(q.quotation_date, 'YYYY-MM-DD') as "Date",
          COALESCE(q.customer_name, '') as "Customer",
          COALESCE(q.customer_phone, '') as "Phone",
          COALESCE(q.project_name, '') as "Project",
          COALESCE(q.sales_person_name, '') as "Salesperson",
          COALESCE(q.assisted_sales_person_name, '') as "Assisted By",
          COALESCE(q.status, '') as "Status",
          COALESCE(u_app.full_name, CASE WHEN LOWER(q.status) IN ('approved', 'closed') THEN 'Store Manager' ELSE 'Pending Approval' END) as "Approved By",
          COALESCE(q.gross_total, 0) as "Gross Total (INR)",
          COALESCE(q.discount_amount, 0) as "Discount (INR)",
          COALESCE(q.taxable_amount, 0) as "Taxable (INR)",
          COALESCE(q.net_total, 0) as "Net Total (INR)",
          COALESCE(p.total_paid, 0) as "Paid (INR)",
          (COALESCE(q.net_total, 0) - COALESCE(p.total_paid, 0)) as "Balance Due (INR)",
          ${targetSpId ? `
            CASE
              WHEN q.assisted_sales_person_id = ${targetSpId} THEN 'Assisted'
              WHEN q.sales_person_id = ${targetSpId} THEN 'Primary'
              ELSE 'Sales Associate'
            END as "Salesperson Role",
            CASE
              WHEN q.assisted_sales_person_id = ${targetSpId} THEN COALESCE(q.assisted_sales_share_percent, 50)
              ELSE COALESCE(q.primary_sales_share_percent, 100)
            END as "Sales Share %",
            CASE
              WHEN q.assisted_sales_person_id = ${targetSpId} THEN COALESCE(q.assisted_sales_share_amount, ROUND((COALESCE(q.net_total, 0) * COALESCE(q.assisted_sales_share_percent, 50) / 100.0)::numeric, 2))
              ELSE COALESCE(q.primary_sales_share_amount, COALESCE(q.net_total, 0))
            END as "Sales Credit (INR)"
          ` : `
            COALESCE(q.primary_sales_share_percent, 100) as "Primary Share %",
            COALESCE(q.primary_sales_share_amount, COALESCE(q.net_total, 0)) as "Primary Credit (INR)",
            COALESCE(q.assisted_sales_share_percent, 0) as "Assisted Share %",
            COALESCE(q.assisted_sales_share_amount, 0) as "Assisted Credit (INR)"
          `}
        FROM quotations q
        LEFT JOIN users u_app ON u_app.id = q.approved_by_id
        LEFT JOIN (
          SELECT quotation_id, SUM(amount) as total_paid FROM payments WHERE status = 'Cleared' GROUP BY quotation_id
        ) p ON p.quotation_id = q.id
        WHERE ${whereClauses.join(' AND ')}
        ORDER BY q.quotation_date DESC, q.id DESC
      `, params);

      rows = regRows.map((it: any) => ({
        "Quotation No": String(it["Quotation No"] || ''),
        "Date": String(it["Date"] || ''),
        "Customer": String(it["Customer"] || ''),
        "Phone": String(it["Phone"] || ''),
        "Project": String(it["Project"] || ''),
        "Salesperson": String(it["Salesperson"] || ''),
        "Assisted By": String(it["Assisted By"] || ''),
        "Status": String(it["Status"] || ''),
        "Approved By": String(it["Approved By"] || ''),
        "Gross Total (INR)": Number(it["Gross Total (INR)"]) || 0,
        "Discount (INR)": Number(it["Discount (INR)"]) || 0,
        "Taxable (INR)": Number(it["Taxable (INR)"]) || 0,
        "Net Total (INR)": Number(it["Net Total (INR)"]) || 0,
        "Paid (INR)": Number(it["Paid (INR)"]) || 0,
        "Balance Due (INR)": Number(it["Balance Due (INR)"]) || 0,
        ...(targetSpId
          ? {
              "Salesperson Role": String(it["Salesperson Role"] || 'Sales Associate'),
              "Sales Share %": Number(it["Sales Share %"]) || 0,
              "Sales Credit (INR)": Number(it["Sales Credit (INR)"]) || 0,
            }
          : {
              "Primary Share %": Number(it["Primary Share %"]) || 100,
              "Primary Credit (INR)": Number(it["Primary Credit (INR)"]) || 0,
              "Assisted Share %": Number(it["Assisted Share %"]) || 0,
              "Assisted Credit (INR)": Number(it["Assisted Credit (INR)"]) || 0,
            }),
      }));

      if (rows.length === 0) {
        rows = [{
          "Quotation No": "No records found matching filter criteria",
          "Date": "",
          "Customer": "",
          "Phone": "",
          "Project": "",
          "Salesperson": "",
          "Assisted By": "",
          "Status": "",
          "Gross Total (INR)": 0,
          "Discount (INR)": 0,
          "Taxable (INR)": 0,
          "Net Total (INR)": 0,
          "Paid (INR)": 0,
          "Balance Due (INR)": 0,
        }];
      }
    }

    const statusSuffix = status ? `_${status}` : '';
    const encSuffix = isEncrypted ? '_Encrypted' : '';
    const dateSuffix = new Date().toISOString().split('T')[0];
    const outFilename = `Quotations${statusSuffix}${encSuffix}_${dateSuffix}.${format}`;

    if (format === 'pdf') {
      const companyRows = await query('SELECT * FROM company_settings LIMIT 1');
      const company = companyRows[0] || {};

      const filterDict: Record<string, string> = {};
      if (status) filterDict['Status'] = String(status);
      if (quotation_type && quotation_type !== 'all') filterDict['Type'] = String(quotation_type);
      if (start_date) filterDict['From'] = String(start_date);
      if (end_date) filterDict['To'] = String(end_date);
      if (search) filterDict['Search'] = String(search);

      let doc;
      if (isItemized) {
        doc = buildItemizedQuotationsReportPdf(rows, filterDict, company, isEncrypted);
      } else {
        doc = buildQuotationsReportPdf(rows, filterDict, company, isEncrypted);
      }

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${outFilename}"`);
      doc.pipe(res);
      doc.end();
    } else {
      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, isEncrypted ? 'Encrypted Quotes' : 'Quotations');

      if (format === 'csv') {
        const csvOutput = XLSX.utils.sheet_to_csv(worksheet);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${outFilename}"`);
        res.send(csvOutput);
      } else {
        const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${outFilename}"`);
        res.send(buffer);
      }
    }
  } catch (error: any) {
    console.error('Error exporting quotations:', error);
    res.status(500).json({ error: error.message });
  }
});

// Salesperson Quotation Summary & Breakdown Report (JSON for dashboard/charts)
reportsRouter.get('/salespersons/summary', optionalAuthenticateToken, async (req: Request, res: Response) => {
  try {
    const { start_date, end_date, sales_person_id } = req.query;
    const isSalesperson = req.user?.role?.toLowerCase() === 'salesperson';
    const targetSpId = isSalesperson
      ? req.user!.id
      : (sales_person_id && !isNaN(Number(sales_person_id)) ? parseInt(sales_person_id as string, 10) : null);

    const dateClauses: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (start_date) {
      dateClauses.push(`q.quotation_date >= $${idx++}::date`);
      params.push(start_date);
    }
    if (end_date) {
      dateClauses.push(`q.quotation_date <= $${idx++}::date`);
      params.push(end_date);
    }

    const dateFilter = dateClauses.length > 0 ? `AND ${dateClauses.join(' AND ')}` : '';
    let userFilter = '';
    if (targetSpId) {
      userFilter = `AND u.id = $${idx++}::integer`;
      params.push(targetSpId);
    }

    const rows = await query(`
      SELECT
        u.id as user_id,
        u.full_name as sales_person_name,
        u.role,
        u.email,
        u.phone,
        COALESCE(u.monthly_target, 0) as monthly_target,
        COUNT(DISTINCT q.id) as total_quotations,
        COUNT(DISTINCT CASE WHEN LOWER(q.status) = 'closed' THEN q.id END) as closed_quotations,
        COUNT(DISTINCT CASE WHEN LOWER(q.status) IN ('draft', 'in_review', 'approved') THEN q.id END) as pipeline_quotations,
        COUNT(DISTINCT CASE WHEN LOWER(q.status) = 'rejected' THEN q.id END) as rejected_quotations,
        COALESCE(SUM(
          CASE
            WHEN q.sales_person_id = u.id THEN
              CASE
                WHEN q.assisted_sales_person_id IS NOT NULL AND q.primary_sales_share_amount > 0 THEN q.primary_sales_share_amount
                WHEN q.assisted_sales_person_id IS NOT NULL AND q.primary_sales_share_percent > 0 THEN ROUND((q.net_total * q.primary_sales_share_percent / 100.0)::numeric, 2)
                ELSE q.net_total
              END
            WHEN q.assisted_sales_person_id = u.id THEN
              CASE
                WHEN q.assisted_sales_share_amount > 0 THEN q.assisted_sales_share_amount
                WHEN q.assisted_sales_share_percent > 0 THEN ROUND((q.net_total * q.assisted_sales_share_percent / 100.0)::numeric, 2)
                ELSE 0
              END
            ELSE 0
          END
        ), 0) as total_value,
        COALESCE(SUM(
          CASE
            WHEN LOWER(q.status) = 'closed' THEN
              CASE
                WHEN q.sales_person_id = u.id THEN
                  CASE
                    WHEN q.assisted_sales_person_id IS NOT NULL AND q.primary_sales_share_amount > 0 THEN q.primary_sales_share_amount
                    WHEN q.assisted_sales_person_id IS NOT NULL AND q.primary_sales_share_percent > 0 THEN ROUND((q.net_total * q.primary_sales_share_percent / 100.0)::numeric, 2)
                    ELSE q.net_total
                  END
                WHEN q.assisted_sales_person_id = u.id THEN
                  CASE
                    WHEN q.assisted_sales_share_amount > 0 THEN q.assisted_sales_share_amount
                    WHEN q.assisted_sales_share_percent > 0 THEN ROUND((q.net_total * q.assisted_sales_share_percent / 100.0)::numeric, 2)
                    ELSE 0
                  END
                ELSE 0
              END
            ELSE 0
          END
        ), 0) as closed_value,
        COALESCE(SUM(
          CASE
            WHEN LOWER(q.status) IN ('draft', 'in_review', 'approved') THEN
              CASE
                WHEN q.sales_person_id = u.id THEN
                  CASE
                    WHEN q.assisted_sales_person_id IS NOT NULL AND q.primary_sales_share_amount > 0 THEN q.primary_sales_share_amount
                    WHEN q.assisted_sales_person_id IS NOT NULL AND q.primary_sales_share_percent > 0 THEN ROUND((q.net_total * q.primary_sales_share_percent / 100.0)::numeric, 2)
                    ELSE q.net_total
                  END
                WHEN q.assisted_sales_person_id = u.id THEN
                  CASE
                    WHEN q.assisted_sales_share_amount > 0 THEN q.assisted_sales_share_amount
                    WHEN q.assisted_sales_share_percent > 0 THEN ROUND((q.net_total * q.assisted_sales_share_percent / 100.0)::numeric, 2)
                    ELSE 0
                  END
                ELSE 0
              END
            ELSE 0
          END
        ), 0) as pipeline_value,
        COUNT(DISTINCT CASE WHEN q.sales_person_id = u.id THEN q.id END) as primary_count,
        COUNT(DISTINCT CASE WHEN q.assisted_sales_person_id = u.id THEN q.id END) as assisted_count
      FROM users u
      LEFT JOIN quotations q ON (q.sales_person_id = u.id OR q.assisted_sales_person_id = u.id) ${dateFilter}
      WHERE u.is_active = true ${userFilter} ${userFilter}
      GROUP BY u.id, u.full_name, u.role, u.email, u.phone, u.monthly_target
      ORDER BY closed_value DESC, total_value DESC, u.full_name ASC
    `, params);

    const summary = rows.map((r: any) => {
      const totQ = parseInt(r.total_quotations, 10) || 0;
      const closedQ = parseInt(r.closed_quotations, 10) || 0;
      const closedVal = parseFloat(r.closed_value) || 0;
      const targetVal = parseFloat(r.monthly_target) || 0;
      return {
        ...r,
        total_quotations: totQ,
        closed_quotations: closedQ,
        pipeline_quotations: parseInt(r.pipeline_quotations, 10) || 0,
        rejected_quotations: parseInt(r.rejected_quotations, 10) || 0,
        total_value: parseFloat(r.total_value) || 0,
        closed_value: closedVal,
        pipeline_value: parseFloat(r.pipeline_value) || 0,
        primary_count: parseInt(r.primary_count, 10) || 0,
        assisted_count: parseInt(r.assisted_count, 10) || 0,
        monthly_target: targetVal,
        win_rate: totQ > 0 ? parseFloat(((closedQ / totQ) * 100).toFixed(1)) : 0,
        target_achievement_percent: targetVal > 0 ? parseFloat(((closedVal / targetVal) * 100).toFixed(1)) : 0,
      };
    });

    res.json({ success: true, summary });
  } catch (error: any) {
    console.error('Error fetching salesperson summary:', error);
    res.status(500).json({ error: error.message });
  }
});

// Export Salesperson Performance Summary to XLSX or CSV
reportsRouter.get('/salespersons/export', optionalAuthenticateToken, async (req: Request, res: Response) => {
  try {
    const { format = 'xlsx', start_date, end_date, sales_person_id } = req.query;
    const isSalesperson = req.user?.role?.toLowerCase() === 'salesperson';
    const targetSpId = isSalesperson
      ? req.user!.id
      : (sales_person_id && !isNaN(Number(sales_person_id)) ? parseInt(sales_person_id as string, 10) : null);

    const dateClauses: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (start_date) {
      dateClauses.push(`q.quotation_date >= $${idx++}::date`);
      params.push(start_date);
    }
    if (end_date) {
      dateClauses.push(`q.quotation_date <= $${idx++}::date`);
      params.push(end_date);
    }

    const dateFilter = dateClauses.length > 0 ? `AND ${dateClauses.join(' AND ')}` : '';
    let userFilter = '';
    if (targetSpId) {
      userFilter = `AND u.id = $${idx++}::integer`;
      params.push(targetSpId);
    }

    const rows = await query(`
      SELECT
        u.full_name as "Salesperson",
        u.role as "Role",
        COALESCE(u.monthly_target, 0) as "Monthly Target (INR)",
        COUNT(DISTINCT q.id) as "Total Quotes",
        COUNT(DISTINCT CASE WHEN LOWER(q.status) = 'closed' THEN q.id END) as "Closed Quotes",
        COUNT(DISTINCT CASE WHEN LOWER(q.status) IN ('draft', 'in_review', 'approved') THEN q.id END) as "Pipeline Quotes",
        COALESCE(SUM(
          CASE
            WHEN LOWER(q.status) = 'closed' THEN
              CASE
                WHEN q.sales_person_id = u.id THEN
                  CASE
                    WHEN q.assisted_sales_person_id IS NOT NULL AND q.primary_sales_share_amount > 0 THEN q.primary_sales_share_amount
                    WHEN q.assisted_sales_person_id IS NOT NULL AND q.primary_sales_share_percent > 0 THEN ROUND((q.net_total * q.primary_sales_share_percent / 100.0)::numeric, 2)
                    ELSE q.net_total
                  END
                WHEN q.assisted_sales_person_id = u.id THEN
                  CASE
                    WHEN q.assisted_sales_share_amount > 0 THEN q.assisted_sales_share_amount
                    WHEN q.assisted_sales_share_percent > 0 THEN ROUND((q.net_total * q.assisted_sales_share_percent / 100.0)::numeric, 2)
                    ELSE 0
                  END
                ELSE 0
              END
            ELSE 0
          END
        ), 0) as "Closed Revenue (INR)",
        COALESCE(SUM(
          CASE
            WHEN LOWER(q.status) IN ('draft', 'in_review', 'approved') THEN
              CASE
                WHEN q.sales_person_id = u.id THEN
                  CASE
                    WHEN q.assisted_sales_person_id IS NOT NULL AND q.primary_sales_share_amount > 0 THEN q.primary_sales_share_amount
                    WHEN q.assisted_sales_person_id IS NOT NULL AND q.primary_sales_share_percent > 0 THEN ROUND((q.net_total * q.primary_sales_share_percent / 100.0)::numeric, 2)
                    ELSE q.net_total
                  END
                WHEN q.assisted_sales_person_id = u.id THEN
                  CASE
                    WHEN q.assisted_sales_share_amount > 0 THEN q.assisted_sales_share_amount
                    WHEN q.assisted_sales_share_percent > 0 THEN ROUND((q.net_total * q.assisted_sales_share_percent / 100.0)::numeric, 2)
                    ELSE 0
                  END
                ELSE 0
              END
            ELSE 0
          END
        ), 0) as "Pipeline Value (INR)",
        COALESCE(SUM(
          CASE
            WHEN q.sales_person_id = u.id THEN
              CASE
                WHEN q.assisted_sales_person_id IS NOT NULL AND q.primary_sales_share_amount > 0 THEN q.primary_sales_share_amount
                WHEN q.assisted_sales_person_id IS NOT NULL AND q.primary_sales_share_percent > 0 THEN ROUND((q.net_total * q.primary_sales_share_percent / 100.0)::numeric, 2)
                ELSE q.net_total
              END
            WHEN q.assisted_sales_person_id = u.id THEN
              CASE
                WHEN q.assisted_sales_share_amount > 0 THEN q.assisted_sales_share_amount
                WHEN q.assisted_sales_share_percent > 0 THEN ROUND((q.net_total * q.assisted_sales_share_percent / 100.0)::numeric, 2)
                ELSE 0
              END
            ELSE 0
          END
        ), 0) as "Total Quoted Value (INR)"
      FROM users u
      LEFT JOIN quotations q ON (q.sales_person_id = u.id OR q.assisted_sales_person_id = u.id) ${dateFilter}
      WHERE u.is_active = true ${userFilter}
      GROUP BY u.id, u.full_name, u.role, u.monthly_target
      ORDER BY "Closed Revenue (INR)" DESC, "Total Quoted Value (INR)" DESC
    `, params);

    // Calculate win rates and format clean primitive values
    let formatted = rows.map((r: any) => {
      const tot = parseInt(r["Total Quotes"], 10) || 0;
      const closed = parseInt(r["Closed Quotes"], 10) || 0;
      const winRate = tot > 0 ? `${((closed / tot) * 100).toFixed(1)}%` : '0%';
      const tgt = parseFloat(r["Monthly Target (INR)"]) || 0;
      const clsdVal = parseFloat(r["Closed Revenue (INR)"]) || 0;
      const ach = tgt > 0 ? `${((clsdVal / tgt) * 100).toFixed(1)}%` : '0%';
      return {
        "Salesperson": String(r["Salesperson"] || ''),
        "Role": String(r["Role"] || ''),
        "Monthly Target (INR)": tgt,
        "Total Quotes": tot,
        "Closed Quotes": closed,
        "Pipeline Quotes": parseInt(r["Pipeline Quotes"], 10) || 0,
        "Closed Revenue (INR)": clsdVal,
        "Pipeline Value (INR)": parseFloat(r["Pipeline Value (INR)"]) || 0,
        "Total Quoted Value (INR)": parseFloat(r["Total Quoted Value (INR)"]) || 0,
        "Win Rate": winRate,
        "Target Achievement": ach,
      };
    });

    if (formatted.length === 0) {
      formatted = [{
        "Salesperson": "No records found",
        "Role": "",
        "Monthly Target (INR)": 0,
        "Total Quotes": 0,
        "Closed Quotes": 0,
        "Pipeline Quotes": 0,
        "Closed Revenue (INR)": 0,
        "Pipeline Value (INR)": 0,
        "Total Quoted Value (INR)": 0,
        "Win Rate": "0%",
        "Target Achievement": "0%",
      }];
    }

    const dateSuffix = new Date().toISOString().split('T')[0];
    const outFilename = `Sales_Team_Performance_${dateSuffix}.${format}`;

    if (format === 'pdf') {
      const companyRows = await query('SELECT * FROM company_settings LIMIT 1');
      const company = companyRows[0] || {};

      const filterDict: Record<string, string> = {};
      if (start_date) filterDict['From'] = String(start_date);
      if (end_date) filterDict['To'] = String(end_date);

      const doc = buildSalespersonsReportPdf(formatted, filterDict, company);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${outFilename}"`);
      doc.pipe(res);
      doc.end();
    } else {
      const worksheet = XLSX.utils.json_to_sheet(formatted);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Sales Team Performance');

      if (format === 'csv') {
        const csvOutput = XLSX.utils.sheet_to_csv(worksheet);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${outFilename}"`);
        res.send(csvOutput);
      } else {
        const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${outFilename}"`);
        res.send(buffer);
      }
    }
  } catch (error: any) {
    console.error('Error exporting salespersons report:', error);
    res.status(500).json({ error: error.message });
  }
});

// Export Payments as XLSX or CSV
reportsRouter.get('/payments/export', optionalAuthenticateToken, async (req: Request, res: Response) => {
  try {
    const { format = 'xlsx', start_date, end_date, sales_person_id } = req.query;
    const isSalesperson = req.user?.role?.toLowerCase() === 'salesperson';
    const targetSpId = isSalesperson
      ? req.user!.id
      : (sales_person_id && !isNaN(Number(sales_person_id)) ? parseInt(sales_person_id as string, 10) : null);

    const whereClauses = ['1=1'];
    const params: any[] = [];
    let idx = 1;

    if (targetSpId) {
      whereClauses.push(`(q.sales_person_id = $${idx}::integer OR q.assisted_sales_person_id = $${idx}::integer)`);
      params.push(targetSpId);
      idx++;
    }

    if (start_date) {
      whereClauses.push(`p.payment_date >= $${idx++}::date`);
      params.push(start_date);
    }
    if (end_date) {
      whereClauses.push(`p.payment_date <= $${idx++}::date`);
      params.push(end_date);
    }

    const rawRows = await query(`
      SELECT
        p.payment_number as "Receipt No",
        TO_CHAR(p.payment_date, 'YYYY-MM-DD') as "Date",
        q.quotation_number as "Quotation No",
        COALESCE(q.customer_name, '') as "Customer",
        COALESCE(p.amount, 0) as "Amount (INR)",
        COALESCE(p.payment_mode, '') as "Payment Mode",
        COALESCE(p.reference_number, '') as "Ref / Txn No",
        CASE WHEN p.status IN ('Cleared', 'Verified') THEN 'Verified' ELSE 'Not Verified' END as "Status",
        COALESCE(u.full_name, '') as "Recorded By",
        COALESCE(p.verified_by_name, uv.full_name, '') as "Verified By",
        TO_CHAR(p.verified_at, 'YYYY-MM-DD') as "Verified Date",
        COALESCE(p.notes, '') as "Notes"
      FROM payments p
      JOIN quotations q ON q.id = p.quotation_id
      LEFT JOIN users u ON u.id = p.recorded_by_id
      LEFT JOIN users uv ON uv.id = p.verified_by_id
      WHERE ${whereClauses.join(' AND ')}
      ORDER BY p.payment_date DESC
    `, params);

    let rows = rawRows.map((it: any) => ({
      "Receipt No": String(it["Receipt No"] || ''),
      "Date": String(it["Date"] || ''),
      "Quotation No": String(it["Quotation No"] || ''),
      "Customer": String(it["Customer"] || ''),
      "Amount (INR)": Number(it["Amount (INR)"]) || 0,
      "Payment Mode": String(it["Payment Mode"] || ''),
      "Ref / Txn No": String(it["Ref / Txn No"] || ''),
      "Status": String(it["Status"] || ''),
      "Recorded By": String(it["Recorded By"] || ''),
      "Verified By": String(it["Verified By"] || ''),
      "Verified Date": String(it["Verified Date"] || ''),
      "Notes": String(it["Notes"] || ''),
    }));

    if (rows.length === 0) {
      rows = [{
        "Receipt No": "No records found",
        "Date": "",
        "Quotation No": "",
        "Customer": "",
        "Amount (INR)": 0,
        "Payment Mode": "",
        "Ref / Txn No": "",
        "Status": "",
        "Recorded By": "",
        "Verified By": "",
        "Verified Date": "",
        "Notes": "",
      }];
    }

    const dateSuffix = new Date().toISOString().split('T')[0];
    const outFilename = `Payments_Export_${dateSuffix}.${format}`;

    if (format === 'pdf') {
      const companyRows = await query('SELECT * FROM company_settings LIMIT 1');
      const company = companyRows[0] || {};

      const filterDict: Record<string, string> = {};
      if (start_date) filterDict['From'] = String(start_date);
      if (end_date) filterDict['To'] = String(end_date);

      const doc = buildPaymentsReportPdf(rows, filterDict, company);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${outFilename}"`);
      doc.pipe(res);
      doc.end();
    } else {
      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Payments');

      if (format === 'csv') {
        const csvOutput = XLSX.utils.sheet_to_csv(worksheet);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${outFilename}"`);
        res.send(csvOutput);
      } else {
        const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${outFilename}"`);
        res.send(buffer);
      }
    }
  } catch (error: any) {
    console.error('Error exporting payments:', error);
    res.status(500).json({ error: error.message });
  }
});
