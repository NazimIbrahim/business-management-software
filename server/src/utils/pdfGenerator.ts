import PDFDocument from 'pdfkit';
import { numberToWordsIndian } from './numberToWords';
import { buildEncryptedProductMap } from './encryptedCode';

export interface QuotationPdfData {
  quotation: {
    quotation_number: string;
    quotation_date: string;
    customer_name: string;
    customer_phone: string;
    delivery_address: string;
    project_name?: string;
    sales_person_name: string;
    assisted_sales_person_name?: string;
    status: string;
    gross_total: number;
    discount_percent?: number;
    discount_amount: number;
    taxable_amount: number;
    tax_type: string;
    cgst_rate: number;
    cgst_amount: number;
    sgst_rate: number;
    sgst_amount: number;
    igst_rate: number;
    igst_amount: number;
    round_off: number;
    net_total: number;
    special_notes?: string;
    quotation_type?: string;
    approved_by_name?: string;
    approved_at?: string | Date;
    version?: number;
    created_at?: string | Date;
    updated_at?: string | Date;
  };
  areas: Array<{
    id: number;
    area_name: string;
    display_order: number;
    items: Array<{
      sl_no: number;
      description: string;
      size: string;
      brand: string;
      product_type?: string;
      coverage_area: number;
      quantity_sqft: number;
      rate_per_sqft: number;
      quantity_boxes: number;
      rate_per_box: number;
      base_rate_per_box?: number;
      base_rate_per_sqft?: number;
      total_amount: number;
      item_code?: string;
      item_image?: string;
      mrp_price?: number;
      discount_percent?: number;
    }>;
  }>;
  company?: {
    company_name?: string;
    tagline?: string;
    logo_base64?: string;
    address_line1?: string;
    address_line2?: string;
    phone?: string;
    email?: string;
    website?: string;
    gstin?: string;
    bank_name?: string;
    account_name?: string;
    account_number?: string;
    ifsc_code?: string;
    branch?: string;
    upi_details?: string;
    store_manager_title?: string;
    store_manager_name?: string;
    sales_associate_title?: string;
    terms_json?: string[] | string;
  };
  encrypted?: boolean;
  encryptedMap?: Map<string, string>;
}

export function generateQuotationPdf(data: QuotationPdfData): PDFKit.PDFDocument {
  const doc = new PDFDocument({
    size: 'A4',
    margin: 30,
    bufferPages: true,
  });

  const { quotation, areas = [] } = data;
  const rawComp = data.company || {};
  const company = {
    company_name: rawComp.company_name || 'Quotation Management System',
    tagline: rawComp.tagline || '',
    logo_base64: rawComp.logo_base64 || '',
    address_line1: rawComp.address_line1 || '',
    address_line2: rawComp.address_line2 || '',
    phone: rawComp.phone || '',
    email: rawComp.email || '',
    website: rawComp.website || '',
    gstin: rawComp.gstin || '',
    bank_name: rawComp.bank_name || '',
    account_name: rawComp.account_name || rawComp.company_name || '',
    account_number: rawComp.account_number || '',
    ifsc_code: rawComp.ifsc_code || '',
    branch: rawComp.branch || '',
    upi_details: rawComp.upi_details || '',
    store_manager_title: rawComp.store_manager_title || 'Store Manager',
    store_manager_name: rawComp.store_manager_name || '',
    sales_associate_title: rawComp.sales_associate_title || 'Sales Associate',
    terms_json: Array.isArray(rawComp.terms_json)
      ? rawComp.terms_json
      : (typeof rawComp.terms_json === 'string'
          ? (() => { try { return JSON.parse(rawComp.terms_json); } catch { return []; } })()
          : []),
  };

  // Colors
  const primaryColor = '#1B365D'; // Navy
  const secondaryColor = '#8A6D3B'; // Gold / Bronze accent
  const lightBg = '#F4F6F9';
  const tableBorder = '#D0D7DE';
  const textColor = '#24292F';

  // Helper for formatting Indian currency
  const formatCurrency = (val: number) => {
    return Number(val || 0).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  // Header Box
  doc
    .rect(30, 26, 535, 84)
    .fillAndStroke(lightBg, tableBorder);

  // Logo Rendering (if available)
  let hasLogo = false;
  if (company.logo_base64) {
    try {
      const base64Clean = company.logo_base64.replace(/^data:image\/\w+;base64,/, '');
      const imgBuffer = Buffer.from(base64Clean, 'base64');
      doc.image(imgBuffer, 38, 34, { fit: [72, 68], align: 'center', valign: 'center' });
      hasLogo = true;
    } catch (err) {
      // If image decode fails, gracefully fallback to text-only layout
      hasLogo = false;
    }
  }

  const textX = hasLogo ? 118 : 42;
  const maxTextW = hasLogo ? 268 : 340;

  let curY = 32;

  // 1. Company Name
  doc
    .fontSize(13)
    .font('Helvetica-Bold')
    .fillColor(primaryColor)
    .text(company.company_name, textX, curY, { width: maxTextW, ellipsis: true });
  curY += doc.heightOfString(company.company_name, { width: maxTextW }) + 1.5;

  // 2. Tagline (if set and distinct from company name)
  if (company.tagline && company.tagline !== company.company_name) {
    doc
      .fontSize(7)
      .font('Helvetica-Oblique')
      .fillColor('#64748B')
      .text(company.tagline, textX, curY, { width: maxTextW, ellipsis: true });
    curY += doc.heightOfString(company.tagline, { width: maxTextW }) + 1;
  }

  // 3. Address Line 1
  if (company.address_line1) {
    doc
      .fontSize(7.5)
      .font('Helvetica')
      .fillColor('#475569')
      .text(company.address_line1, textX, curY, { width: maxTextW });
    curY += doc.heightOfString(company.address_line1, { width: maxTextW }) + 1;
  }

  // 4. Address Line 2
  if (company.address_line2) {
    doc
      .fontSize(7.5)
      .font('Helvetica')
      .fillColor('#475569')
      .text(company.address_line2, textX, curY, { width: maxTextW });
    curY += doc.heightOfString(company.address_line2, { width: maxTextW }) + 1;
  }

  // 5. Contact line (Phone | Web | Email)
  const contactParts: string[] = [];
  if (company.phone) contactParts.push(`Phone: ${company.phone}`);
  if (company.website) contactParts.push(`Web: ${company.website}`);
  if (company.email && contactParts.length < 2) contactParts.push(`Email: ${company.email}`);
  if (contactParts.length > 0) {
    const contactText = contactParts.join(' | ');
    doc
      .fontSize(7.5)
      .font('Helvetica')
      .fillColor('#475569')
      .text(contactText, textX, curY, { width: maxTextW, ellipsis: true });
    curY += doc.heightOfString(contactText, { width: maxTextW }) + 1;
  }

  // 6. GSTIN
  if (company.gstin) {
    doc
      .fontSize(7.5)
      .font('Helvetica-Bold')
      .fillColor('#0F172A')
      .text(`GSTIN: ${company.gstin}`, textX, curY, { width: maxTextW, ellipsis: true });
  }

  // QUOTATION Title (Right)
  const isRevised = (quotation.version || 1) > 1;
  const qDateFormatted = new Date(quotation.quotation_date).toLocaleDateString('en-GB');
  const origDateFormatted = quotation.created_at ? new Date(quotation.created_at).toLocaleDateString('en-GB') : null;

  doc
    .fontSize(16.5)
    .font('Helvetica-Bold')
    .fillColor(primaryColor)
    .text('QUOTATION', 350, 30, { align: 'right', width: 205 });

  if (isRevised) {
    doc
      .fontSize(8.5)
      .font('Helvetica-Bold')
      .fillColor(textColor)
      .text(`Ref: ${quotation.quotation_number} (Rev ${quotation.version})`, 330, 50, { align: 'right', width: 225 })
      .text(`Date: ${qDateFormatted}`, 330, 63, { align: 'right', width: 225 })
      .text(`Orig. Date: ${origDateFormatted || qDateFormatted}`, 330, 76, { align: 'right', width: 225 })
      .text(`Status: ${quotation.status.toUpperCase()}`, 330, 89, { align: 'right', width: 225 });
  } else {
    doc
      .fontSize(8.5)
      .font('Helvetica-Bold')
      .fillColor(textColor)
      .text(`Ref: ${quotation.quotation_number}`, 350, 54, { align: 'right', width: 205 })
      .text(`Date: ${qDateFormatted}`, 350, 67, { align: 'right', width: 205 })
      .text(`Status: ${quotation.status.toUpperCase()}`, 350, 80, { align: 'right', width: 205 });
  }

  // Customer & Salesperson Info Box
  const customerBoxY = 116;
  doc
    .rect(30, customerBoxY, 535, 55)
    .fillAndStroke('#FFFFFF', tableBorder);

  // Left: Customer Details
  doc
    .fontSize(9)
    .font('Helvetica-Bold')
    .fillColor(primaryColor)
    .text('Customer Details:', 40, customerBoxY + 6);

  doc
    .fontSize(8.5)
    .font('Helvetica')
    .fillColor(textColor)
    .text(`Name: ${quotation.customer_name}`, 40, customerBoxY + 18)
    .text(`Contact: ${quotation.customer_phone}`, 40, customerBoxY + 30)
    .text(`Site: ${quotation.delivery_address || 'As per order'}`, 40, customerBoxY + 42, { width: 270, ellipsis: true });

  // Right: Salesperson & Project
  doc
    .fontSize(9)
    .font('Helvetica-Bold')
    .fillColor(primaryColor)
    .text('Project & Sales Associate:', 320, customerBoxY + 6);

  const salesAssociateLabel = quotation.assisted_sales_person_name
    ? `Sales: ${quotation.sales_person_name} (Assisted: ${quotation.assisted_sales_person_name})`
    : `Sales Associate: ${quotation.sales_person_name}`;

  const storeManagerTitle = company.store_manager_title || 'Store Manager';
  const storeManagerName = quotation.approved_by_name || company.store_manager_name || 'Pending Approval';

  doc
    .fontSize(8.5)
    .font('Helvetica')
    .fillColor(textColor)
    .text(`Project: ${quotation.project_name || 'Standard Residential'}`, 320, customerBoxY + 18)
    .text(salesAssociateLabel, 320, customerBoxY + 30, { width: 240, ellipsis: true })
    .text(`${storeManagerTitle}: ${storeManagerName}`, 320, customerBoxY + 42, { width: 240, ellipsis: true });

  // Table setup
  const isEncrypted = Boolean(data.encrypted);
  const isSanitary = quotation.quotation_type === 'sanitary';
  const allItems = areas.flatMap((a) => a.items || []);
  const encryptedMap = isEncrypted
    ? (data.encryptedMap || buildEncryptedProductMap(quotation.quotation_number || quotation.quotation_date || 'AMA', allItems))
    : new Map<string, string>();

  let currentY = 180;

  if (isSanitary) {
    function drawSanitaryTableHeader(y: number) {
      doc.rect(30, y, 535, 20).fillAndStroke(primaryColor, primaryColor);
      doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#FFFFFF');
      doc.text('Sl.', 30, y + 6, { width: 20, align: 'center' });
      doc.text('Image', 50, y + 6, { width: 68, align: 'center' });
      doc.text('Item Code', 120, y + 6, { width: 68 });
      doc.text('Item Description', 190, y + 6, { width: 132 });
      doc.text('Qty (Nos)', 324, y + 6, { width: 40, align: 'right' });
      doc.text('MRP (Rs.)', 366, y + 6, { width: 48, align: 'right' });
      doc.text('Disc %', 416, y + 6, { width: 34, align: 'right' });
      doc.text('Price/Nos', 452, y + 6, { width: 54, align: 'right' });
      doc.text('Total (Rs.)', 508, y + 6, { width: 56, align: 'right' });
    }

    drawSanitaryTableHeader(currentY);
    currentY += 20;

    if (allItems.length === 0) {
      doc.rect(30, currentY, 535, 25).stroke(tableBorder);
      doc.fontSize(8).font('Helvetica-Oblique').fillColor('#666666');
      doc.text('No sanitary items recorded in this quotation.', 45, currentY + 8);
      currentY += 28;
    } else {
      for (const item of allItems) {
        if (currentY > 660) {
          doc.addPage();
          currentY = 40;
          drawSanitaryTableHeader(currentY);
          currentY += 20;
        }

        // Scaled product image row (44 pt height with larger image)
        doc.rect(30, currentY, 535, 44).stroke(tableBorder);
        doc.fontSize(7.5).font('Helvetica').fillColor(textColor);

        // Sl.
        doc.text(String(item.sl_no), 30, currentY + 17, { width: 20, align: 'center' });

        // Item Image - scaled up fit bounds [62, 38] in 68pt wide column
        if (item.item_image && item.item_image.startsWith('data:image')) {
          try {
            const base64Data = item.item_image.replace(/^data:image\/\w+;base64,/, '');
            const imgBuffer = Buffer.from(base64Data, 'base64');
            doc.image(imgBuffer, 53, currentY + 3, { fit: [62, 38], align: 'center', valign: 'center' });
          } catch (e) {
            doc.fontSize(7).fillColor('#999999').text('-', 50, currentY + 17, { width: 68, align: 'center' });
          }
        } else {
          doc.fontSize(7).fillColor('#999999').text('-', 50, currentY + 17, { width: 68, align: 'center' });
        }

        // Item Code
        const codeText = isEncrypted
          ? (encryptedMap.get(item.item_code || item.size || 'CODE') || 'AMA-SAN')
          : (item.item_code || item.size || '-');
        doc.fontSize(7.5).font('Helvetica-Bold').fillColor(primaryColor);
        doc.text(codeText, 120, currentY + 17, { width: 68, height: 12, ellipsis: true });

        // Item Description (fits 2 lines cleanly inside 44pt row)
        const descText = isEncrypted
          ? (encryptedMap.get((item.description || '').trim()) || `${item.description}-AMA`)
          : item.description;
        doc.fontSize(7.5).font('Helvetica').fillColor(textColor);
        doc.text(descText, 190, currentY + 11, { width: 132, height: 24, ellipsis: true });

        // Qty (Nos)
        const qtyVal = Number(item.quantity_boxes || 1).toFixed(0);
        doc.text(`${qtyVal} Nos`, 324, currentY + 17, { width: 40, align: 'right' });

        // MRP (Rs.)
        const mrpVal = Number(item.mrp_price || item.base_rate_per_box || item.rate_per_box || 0);
        doc.text(formatCurrency(mrpVal), 366, currentY + 17, { width: 48, align: 'right' });

        // Disc %
        const discVal = Number(item.discount_percent || 0);
        doc.text(discVal > 0 ? `${discVal.toFixed(1)}%` : '-', 416, currentY + 17, { width: 34, align: 'right' });

        // Discounted Price/Nos
        const priceVal = Number(item.rate_per_box || 0);
        doc.text(formatCurrency(priceVal), 452, currentY + 17, { width: 54, align: 'right' });

        // Total (Rs.)
        doc.font('Helvetica-Bold');
        doc.text(formatCurrency(item.total_amount), 508, currentY + 17, { width: 56, align: 'right' });

        currentY += 44;
      }
    }
  } else {
    const hasAnyTileImage = areas.some((a) =>
      a.items?.some((it: any) => it.item_image && it.item_image.startsWith('data:image'))
    );

    // Columns setup: dynamically includes Image column if any tile item has an image
    let colX: number[];
    let colW: number[];

    if (hasAnyTileImage) {
      if (isEncrypted) {
        colX = [30, 48, 96, 236, 284, 326, 368, 416, 464, 512];
        colW = [18, 46, 138, 46, 40, 40, 46, 46, 46, 53];
      } else {
        colX = [30, 48, 94, 192, 246, 290, 328, 366, 410, 458, 508];
        colW = [18, 44, 96, 52, 42, 36, 36, 42, 46, 48, 57];
      }
    } else {
      colX = isEncrypted
        ? [30, 52, 208, 260, 306, 350, 404, 456, 508]
        : [30, 52, 168, 232, 280, 322, 364, 412, 462, 512];
      colW = isEncrypted
        ? [20, 154, 50, 44, 42, 52, 50, 50, 56]
        : [20, 114, 62, 46, 40, 40, 46, 48, 48, 52];
    }

    const itemRowH = hasAnyTileImage ? 28 : 16;

    function drawTableHeader(y: number) {
      doc.rect(30, y, 535, 20).fillAndStroke(primaryColor, primaryColor);
      doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#FFFFFF');

      if (hasAnyTileImage) {
        if (isEncrypted) {
          doc.text('Sl.', colX[0], y + 6, { width: colW[0], align: 'center' });
          doc.text('Image', colX[1], y + 6, { width: colW[1], align: 'center' });
          doc.text('Description', colX[2], y + 6, { width: colW[2] });
          doc.text('Size', colX[3], y + 6, { width: colW[3], align: 'center' });
          doc.text('Cov/Box', colX[4], y + 6, { width: colW[4], align: 'right' });
          doc.text('Sqft', colX[5], y + 6, { width: colW[5], align: 'right' });
          doc.text('Rate/Sqft', colX[6], y + 6, { width: colW[6], align: 'right' });
          doc.text('Boxes/Qty', colX[7], y + 6, { width: colW[7], align: 'right' });
          doc.text('Rate/Unit', colX[8], y + 6, { width: colW[8], align: 'right' });
          doc.text('Total (Rs.)', colX[9], y + 6, { width: colW[9], align: 'right' });
        } else {
          doc.text('Sl.', colX[0], y + 6, { width: colW[0], align: 'center' });
          doc.text('Image', colX[1], y + 6, { width: colW[1], align: 'center' });
          doc.text('Description', colX[2], y + 6, { width: colW[2] });
          doc.text('Brand', colX[3], y + 6, { width: colW[3] });
          doc.text('Size', colX[4], y + 6, { width: colW[4], align: 'center' });
          doc.text('Cov/Box', colX[5], y + 6, { width: colW[5], align: 'right' });
          doc.text('Sqft', colX[6], y + 6, { width: colW[6], align: 'right' });
          doc.text('Rate/Sqft', colX[7], y + 6, { width: colW[7], align: 'right' });
          doc.text('Boxes/Qty', colX[8], y + 6, { width: colW[8], align: 'right' });
          doc.text('Rate/Unit', colX[9], y + 6, { width: colW[9], align: 'right' });
          doc.text('Total (Rs.)', colX[10], y + 6, { width: colW[10], align: 'right' });
        }
      } else {
        if (isEncrypted) {
          doc.text('Sl.', colX[0], y + 6, { width: colW[0], align: 'center' });
          doc.text('Description', colX[1], y + 6, { width: colW[1] });
          doc.text('Size', colX[2], y + 6, { width: colW[2], align: 'center' });
          doc.text('Cov/Box', colX[3], y + 6, { width: colW[3], align: 'right' });
          doc.text('Sqft', colX[4], y + 6, { width: colW[4], align: 'right' });
          doc.text('Rate/Sqft', colX[5], y + 6, { width: colW[5], align: 'right' });
          doc.text('Boxes/Qty', colX[6], y + 6, { width: colW[6], align: 'right' });
          doc.text('Rate/Unit', colX[7], y + 6, { width: colW[7], align: 'right' });
          doc.text('Total (Rs.)', colX[8], y + 6, { width: colW[8], align: 'right' });
        } else {
          doc.text('Sl.', colX[0], y + 6, { width: colW[0], align: 'center' });
          doc.text('Description', colX[1], y + 6, { width: colW[1] });
          doc.text('Brand', colX[2], y + 6, { width: colW[2] });
          doc.text('Size', colX[3], y + 6, { width: colW[3], align: 'center' });
          doc.text('Cov/Box', colX[4], y + 6, { width: colW[4], align: 'right' });
          doc.text('Sqft', colX[5], y + 6, { width: colW[5], align: 'right' });
          doc.text('Rate/Sqft', colX[6], y + 6, { width: colW[6], align: 'right' });
          doc.text('Boxes/Qty', colX[7], y + 6, { width: colW[7], align: 'right' });
          doc.text('Rate/Unit', colX[8], y + 6, { width: colW[8], align: 'right' });
          doc.text('Total (Rs.)', colX[9], y + 6, { width: colW[9], align: 'right' });
        }
      }
    }

    drawTableHeader(currentY);
    currentY += 20;

    const totalItemCount = areas.reduce((acc, a) => acc + (a.items?.length || 0), 0);
    if (totalItemCount === 0) {
      doc.rect(30, currentY, 535, 25).stroke(tableBorder);
      doc.fontSize(8).font('Helvetica-Oblique').fillColor('#666666');
      doc.text('No itemized materials or tiles recorded in this quotation.', 45, currentY + 8);
      currentY += 28;
    }

    // Render Areas and Items
    for (const area of areas) {
      if (!area.items || area.items.length === 0) continue;

      // Check page break
      if (currentY > 690) {
        doc.addPage();
        currentY = 40;
        drawTableHeader(currentY);
        currentY += 20;
      }

      // Area Header Bar
      doc.rect(30, currentY, 535, 16).fillAndStroke('#E8EEF5', tableBorder);
      doc.fontSize(8).font('Helvetica-Bold').fillColor(primaryColor);
      doc.text(`AREA: ${area.area_name.toUpperCase()}`, 38, currentY + 4);
      currentY += 16;

      for (const item of area.items) {
        if (currentY > (hasAnyTileImage ? 700 : 730)) {
          doc.addPage();
          currentY = 40;
          drawTableHeader(currentY);
          currentY += 20;
        }

        const pType = (item.product_type || 'box').toLowerCase();
        let covText = Number(item.coverage_area).toFixed(1);
        let sqftText = Number(item.quantity_sqft).toFixed(0);
        let rateSqftText = formatCurrency(item.rate_per_sqft);
        let qtyUnitText = Number(item.quantity_boxes).toFixed(0);
        let rateUnitText = formatCurrency(item.rate_per_box);

        if (pType === 'sqft') {
          covText = '-';
          qtyUnitText = '-';
          rateUnitText = '-';
        } else if (['bags', 'pieces', 'nos'].includes(pType)) {
          covText = '-';
          sqftText = '-';
          rateSqftText = '-';
          const suffix = pType === 'bags' ? 'Bags' : pType === 'pieces' ? 'Pcs' : 'Nos';
          qtyUnitText = `${Number(item.quantity_boxes).toFixed(0)} ${suffix}`;
        }

        const descText = isEncrypted
          ? (encryptedMap.get((item.description || '').trim()) || `${item.description}-AMA`)
          : item.description;

        doc.rect(30, currentY, 535, itemRowH).stroke(tableBorder);
        doc.fontSize(7.5).font('Helvetica').fillColor(textColor);

        const textYOffset = hasAnyTileImage ? Math.floor((itemRowH - 10) / 2) : 4;

        if (hasAnyTileImage) {
          // Sl.
          doc.text(String(item.sl_no), colX[0], currentY + textYOffset, { width: colW[0], align: 'center' });

          // Image
          if (item.item_image && item.item_image.startsWith('data:image')) {
            try {
              const base64Data = item.item_image.replace(/^data:image\/\w+;base64,/, '');
              const imgBuffer = Buffer.from(base64Data, 'base64');
              doc.image(imgBuffer, colX[1] + 2, currentY + 2, { fit: [colW[1] - 4, itemRowH - 4], align: 'center', valign: 'center' });
            } catch (e) {
              doc.fontSize(7).fillColor('#999999').text('-', colX[1], currentY + textYOffset, { width: colW[1], align: 'center' });
            }
          } else {
            doc.fontSize(7).fillColor('#999999').text('-', colX[1], currentY + textYOffset, { width: colW[1], align: 'center' });
          }
          doc.fontSize(7.5).fillColor(textColor);

          if (isEncrypted) {
            doc.text(descText, colX[2], currentY + textYOffset, { width: colW[2], height: itemRowH - 4, ellipsis: true });
            doc.text(item.size, colX[3], currentY + textYOffset, { width: colW[3], align: 'center' });
            doc.text(covText, colX[4], currentY + textYOffset, { width: colW[4], align: 'right' });
            doc.text(sqftText, colX[5], currentY + textYOffset, { width: colW[5], align: 'right' });
            doc.text(rateSqftText, colX[6], currentY + textYOffset, { width: colW[6], align: 'right' });
            doc.text(qtyUnitText, colX[7], currentY + textYOffset, { width: colW[7], align: 'right' });
            doc.text(rateUnitText, colX[8], currentY + textYOffset, { width: colW[8], align: 'right' });
            doc.text(formatCurrency(item.total_amount), colX[9], currentY + textYOffset, { width: colW[9], align: 'right' });
          } else {
            doc.text(descText, colX[2], currentY + textYOffset, { width: colW[2], height: itemRowH - 4, ellipsis: true });
            doc.text(item.brand || '-', colX[3], currentY + textYOffset, { width: colW[3], height: itemRowH - 4, ellipsis: true });
            doc.text(item.size, colX[4], currentY + textYOffset, { width: colW[4], align: 'center' });
            doc.text(covText, colX[5], currentY + textYOffset, { width: colW[5], align: 'right' });
            doc.text(sqftText, colX[6], currentY + textYOffset, { width: colW[6], align: 'right' });
            doc.text(rateSqftText, colX[7], currentY + textYOffset, { width: colW[7], align: 'right' });
            doc.text(qtyUnitText, colX[8], currentY + textYOffset, { width: colW[8], align: 'right' });
            doc.text(rateUnitText, colX[9], currentY + textYOffset, { width: colW[9], align: 'right' });
            doc.text(formatCurrency(item.total_amount), colX[10], currentY + textYOffset, { width: colW[10], align: 'right' });
          }
        } else {
          if (isEncrypted) {
            doc.text(String(item.sl_no), colX[0], currentY + 4, { width: colW[0], align: 'center' });
            doc.text(descText, colX[1], currentY + 4, { width: colW[1], height: 10, ellipsis: true });
            doc.text(item.size, colX[2], currentY + 4, { width: colW[2], align: 'center' });
            doc.text(covText, colX[3], currentY + 4, { width: colW[3], align: 'right' });
            doc.text(sqftText, colX[4], currentY + 4, { width: colW[4], align: 'right' });
            doc.text(rateSqftText, colX[5], currentY + 4, { width: colW[5], align: 'right' });
            doc.text(qtyUnitText, colX[6], currentY + 4, { width: colW[6], align: 'right' });
            doc.text(rateUnitText, colX[7], currentY + 4, { width: colW[7], align: 'right' });
            doc.text(formatCurrency(item.total_amount), colX[8], currentY + 4, { width: colW[8], align: 'right' });
          } else {
            doc.text(String(item.sl_no), colX[0], currentY + 4, { width: colW[0], align: 'center' });
            doc.text(descText, colX[1], currentY + 4, { width: colW[1], height: 10, ellipsis: true });
            doc.text(item.brand || '-', colX[2], currentY + 4, { width: colW[2], height: 10, ellipsis: true });
            doc.text(item.size, colX[3], currentY + 4, { width: colW[3], align: 'center' });
            doc.text(covText, colX[4], currentY + 4, { width: colW[4], align: 'right' });
            doc.text(sqftText, colX[5], currentY + 4, { width: colW[5], align: 'right' });
            doc.text(rateSqftText, colX[6], currentY + 4, { width: colW[6], align: 'right' });
            doc.text(qtyUnitText, colX[7], currentY + 4, { width: colW[7], align: 'right' });
            doc.text(rateUnitText, colX[8], currentY + 4, { width: colW[8], align: 'right' });
            doc.text(formatCurrency(item.total_amount), colX[9], currentY + 4, { width: colW[9], align: 'right' });
          }
        }

        currentY += itemRowH;
      }
    }
  }

  // Summary & Totals Block
  if (currentY > 640) {
    doc.addPage();
    currentY = 40;
  } else {
    currentY += 10;
  }

  // Left Side: Amount in Words and Notes
  const wordsBoxY = currentY;
  doc
    .fontSize(8)
    .font('Helvetica-Bold')
    .fillColor(primaryColor)
    .text('AMOUNT IN WORDS:', 35, wordsBoxY);

  const words = numberToWordsIndian(quotation.net_total);
  doc
    .fontSize(8)
    .font('Helvetica-Oblique')
    .fillColor(textColor)
    .text(words, 35, wordsBoxY + 12, { width: 300 });

  if (quotation.special_notes) {
    doc
      .fontSize(7.5)
      .font('Helvetica-Bold')
      .fillColor(primaryColor)
      .text('Special Notes:', 35, wordsBoxY + 34);

    doc
      .fontSize(7.5)
      .font('Helvetica')
      .fillColor(textColor)
      .text(quotation.special_notes, 35, wordsBoxY + 44, { width: 300 });
  }

  // Right Side: Totals Table
  const totalsX = 350;
  const totalsW = 215;
  let totalsY = wordsBoxY;

  const renderTotalRow = (label: string, value: string, isBold: boolean = false) => {
    doc.rect(totalsX, totalsY, totalsW, 16).stroke(tableBorder);
    doc
      .fontSize(8)
      .font(isBold ? 'Helvetica-Bold' : 'Helvetica')
      .fillColor(isBold ? primaryColor : textColor);
    doc.text(label, totalsX + 8, totalsY + 4, { width: 110 });
    doc.text(value, totalsX + 115, totalsY + 4, { width: 90, align: 'right' });
    totalsY += 16;
  };

  const discAmt = Number(quotation.discount_amount || 0);
  if (discAmt > 0) {
    const listTotal = Number(quotation.gross_total || 0) + discAmt;
    const discPct = Number(quotation.discount_percent || 0);
    renderTotalRow('LIST TOTAL', formatCurrency(listTotal));
    renderTotalRow(
      discPct > 0 ? `DIRECT DISCOUNT (${discPct}%)` : 'DIRECT DISCOUNT',
      `-${formatCurrency(discAmt)}`
    );
    renderTotalRow('TAXABLE TOTAL', formatCurrency(quotation.gross_total), true);
  } else {
    renderTotalRow('GROSS TOTAL', formatCurrency(quotation.gross_total));
  }
  if (quotation.round_off !== 0) {
    renderTotalRow('ROUND OFF', formatCurrency(quotation.round_off));
  }
  if (quotation.tax_type === 'cgst_sgst' && quotation.cgst_amount > 0) {
    renderTotalRow(`CGST (${quotation.cgst_rate}%)`, formatCurrency(quotation.cgst_amount));
    renderTotalRow(`SGST (${quotation.sgst_rate}%)`, formatCurrency(quotation.sgst_amount));
  } else if (quotation.tax_type === 'igst' && quotation.igst_amount > 0) {
    renderTotalRow(`IGST (${quotation.igst_rate}%)`, formatCurrency(quotation.igst_amount));
  }

  // Highlighted NET TOTAL row
  doc.rect(totalsX, totalsY, totalsW, 18).fillAndStroke(primaryColor, primaryColor);
  doc.fontSize(9).font('Helvetica-Bold').fillColor('#FFFFFF');
  doc.text('NET TOTAL', totalsX + 8, totalsY + 4, { width: 110 });
  doc.text(`INR ${formatCurrency(quotation.net_total)}`, totalsX + 115, totalsY + 4, { width: 90, align: 'right' });
  totalsY += 26;

  currentY = Math.max(wordsBoxY + 70, totalsY);

  // Page break check for Terms and Bank details
  if (currentY > 640) {
    doc.addPage();
    currentY = 40;
  }

  // Bank Details & Signatures Box
  doc.rect(30, currentY, 535, 60).fillAndStroke(lightBg, tableBorder);
  doc.fontSize(8).font('Helvetica-Bold').fillColor(primaryColor);
  doc.text('BANK DETAILS FOR SETTLEMENT:', 40, currentY + 6);

  doc
    .fontSize(7.5)
    .font('Helvetica')
    .fillColor(textColor)
    .text(`Name: ${company.account_name}`, 40, currentY + 18)
    .text(`A/C: ${company.account_number}  |  Bank: ${company.bank_name}`, 40, currentY + 28)
    .text(`IFSC: ${company.ifsc_code}  |  Branch: ${company.branch}`, 40, currentY + 38)
    .text(`UPI / Cheques in favor of: "${company.account_name}"`, 40, currentY + 48);

  // Signature Blocks
  doc
    .fontSize(7.5)
    .font('Helvetica-Bold')
    .fillColor(textColor)
    .text(`${company.sales_associate_title}`, 320, currentY + 18)
    .text(
      quotation.assisted_sales_person_name
        ? `${quotation.sales_person_name} & ${quotation.assisted_sales_person_name}`
        : `${quotation.sales_person_name}`,
      320,
      currentY + 30,
      { width: 120, ellipsis: true }
    )
    .text(`Signature: ________________`, 320, currentY + 44);

  doc
    .fontSize(7.5)
    .font('Helvetica-Bold')
    .fillColor(textColor)
    .text(`${company.store_manager_title || 'Store Manager'}`, 450, currentY + 18)
    .text(quotation.approved_by_name || `${company.store_manager_name || 'Store Manager'}`, 450, currentY + 30, { width: 120, ellipsis: true })
    .text(quotation.approved_at ? `Approved: ${new Date(quotation.approved_at).toLocaleDateString('en-GB')}` : `Signature: ________________`, 450, currentY + 44);

  currentY += 68;

  // Terms and Conditions Section (Compact 2-Column Layout to prevent blank 2nd page overflow)
  const termsList = Array.isArray(company.terms_json) ? company.terms_json : [];
  if (termsList.length > 0) {
    if (currentY > 700) {
      doc.addPage();
      currentY = 40;
    }

    doc.fontSize(8).font('Helvetica-Bold').fillColor(primaryColor).text('TERMS & CONDITIONS:', 30, currentY);
    currentY += 12;

    const half = Math.ceil(termsList.length / 2);
    const col1 = termsList.slice(0, half);
    const col2 = termsList.slice(half);

    const startTermsY = currentY;
    doc.fontSize(6.5).font('Helvetica').fillColor('#444444');
    let y1 = startTermsY;
    col1.forEach((term, idx) => {
      const text = `${idx + 1}. ${term}`;
      doc.text(text, 30, y1, { width: 260 });
      y1 += doc.heightOfString(text, { width: 260 }) + 2;
    });

    let y2 = startTermsY;
    col2.forEach((term, idx) => {
      const realIdx = half + idx + 1;
      const text = `${realIdx}. ${term}`;
      doc.text(text, 300, y2, { width: 265 });
      y2 += doc.heightOfString(text, { width: 265 }) + 2;
    });
    currentY = Math.max(y1, y2) + 6;
  }

  // Footer on all pages (margins.bottom tightened to prevent auto-overflow)
  const totalPages = doc.bufferedPageRange().count;
  for (let i = 0; i < totalPages; i++) {
    doc.switchToPage(i);
    doc.page.margins.bottom = 5;
    doc
      .fontSize(7)
      .font('Helvetica')
      .fillColor('#888888')
      .text(
        `${company.company_name || 'Quotation'} — Ref: ${quotation.quotation_number}${isEncrypted ? ' (Encrypted Export)' : ''} — Page ${i + 1} of ${totalPages}`,
        30,
        794,
        { align: 'center', width: 535, lineBreak: false }
      );
  }

  return doc;
}
