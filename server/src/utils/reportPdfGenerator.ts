import PDFDocument from 'pdfkit';

export interface ColumnDefinition {
  header: string;
  key: string;
  width: number;
  align?: 'left' | 'center' | 'right';
  format?: (val: any) => string;
}

export interface CompanyInfo {
  company_name?: string;
  phone?: string;
  email?: string;
  gstin?: string;
  address_line1?: string;
  address_line2?: string;
}

export interface ReportPdfOptions {
  title: string;
  subtitle?: string;
  company?: CompanyInfo;
  filters?: Record<string, string>;
  columns: ColumnDefinition[];
  rows: any[];
  summaryRow?: Record<string, any>;
  landscape?: boolean;
}

const formatCurrency = (val: number | string) => {
  const num = typeof val === 'number' ? val : parseFloat(String(val || 0)) || 0;
  return num.toLocaleString('en-IN', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  });
};

export function generateTableReportPdf(options: ReportPdfOptions): PDFKit.PDFDocument {
  const isLandscape = options.landscape !== false; // default true
  const doc = new PDFDocument({
    size: 'A4',
    layout: isLandscape ? 'landscape' : 'portrait',
    margin: 30,
    bufferPages: true,
  });

  const pageWidth = isLandscape ? 841.89 : 595.28;
  const pageHeight = isLandscape ? 595.28 : 841.89;
  const margin = 30;
  const usableWidth = pageWidth - margin * 2; // ~781.89 pt landscape
  const maxY = pageHeight - margin - 25; // leave room for page footer

  // Scale column widths to fit usableWidth exactly
  const initialTotalWidth = options.columns.reduce((sum, c) => sum + c.width, 0);
  const scale = usableWidth / initialTotalWidth;
  const scaledColumns = options.columns.map((c) => ({
    ...c,
    scaledWidth: c.width * scale,
  }));

  const company = options.company || { company_name: 'AMA Ceramics' };
  let currentY = margin;

  function drawReportHeader() {
    // Top colored accent bar
    doc.rect(margin, currentY, usableWidth, 3).fill('#0284C7'); // Cyan/sky accent
    currentY += 8;

    // Company Header & Report Title
    doc.fontSize(14).font('Helvetica-Bold').fillColor('#0F172A').text(company.company_name || 'AMA Ceramics', margin, currentY);
    
    // Company contact details on right
    const contactParts: string[] = [];
    if (company.gstin) contactParts.push(`GSTIN: ${company.gstin}`);
    if (company.phone) contactParts.push(`Ph: ${company.phone}`);
    if (company.email) contactParts.push(`Email: ${company.email}`);
    if (contactParts.length > 0) {
      doc.fontSize(7.5).font('Helvetica').fillColor('#64748B').text(contactParts.join(' | '), margin, currentY + 3, {
        align: 'right',
        width: usableWidth,
      });
    }

    currentY += 18;

    // Report Title
    doc.fontSize(11).font('Helvetica-Bold').fillColor('#1E293B').text(options.title.toUpperCase(), margin, currentY);

    // Subtitle / Filters
    const filterTokens: string[] = [];
    if (options.subtitle) filterTokens.push(options.subtitle);
    if (options.filters) {
      for (const [k, v] of Object.entries(options.filters)) {
        if (v && v.trim()) filterTokens.push(`${k}: ${v}`);
      }
    }
    const dateStamp = `Generated: ${new Date().toISOString().replace('T', ' ').slice(0, 19)}`;
    filterTokens.push(dateStamp);

    doc.fontSize(7).font('Helvetica').fillColor('#64748B').text(filterTokens.join('  •  '), margin, currentY + 3, {
      align: 'right',
      width: usableWidth,
    });

    currentY += 16;
  }

  function drawTableHeader(y: number) {
    const rowH = 18;
    doc.rect(margin, y, usableWidth, rowH).fill('#1E293B');

    doc.fontSize(7).font('Helvetica-Bold').fillColor('#FFFFFF');
    let curX = margin;
    for (const col of scaledColumns) {
      const align = col.align || 'left';
      doc.text(col.header, curX + 3, y + 5, {
        width: col.scaledWidth - 6,
        align,
        ellipsis: true,
      });
      curX += col.scaledWidth;
    }
    return y + rowH;
  }

  // Draw initial header
  drawReportHeader();
  currentY = drawTableHeader(currentY);

  // Draw rows
  const rowH = 15;
  let isEven = false;

  if (options.rows.length === 0) {
    doc.rect(margin, currentY, usableWidth, 24).fill('#FFFFFF');
    doc.rect(margin, currentY, usableWidth, 24).stroke('#E2E8F0');
    doc.fontSize(8).font('Helvetica-Oblique').fillColor('#64748B').text('No records found matching filter criteria', margin, currentY + 8, {
      width: usableWidth,
      align: 'center',
    });
    currentY += 24;
  } else {
    for (let rIdx = 0; rIdx < options.rows.length; rIdx++) {
      const row = options.rows[rIdx];

      // Page break check
      if (currentY + rowH > maxY) {
        doc.addPage();
        currentY = margin;
        // Subsequent page mini header
        doc.fontSize(8).font('Helvetica-Bold').fillColor('#475569').text(`${options.title} (Continued)`, margin, currentY);
        currentY += 14;
        currentY = drawTableHeader(currentY);
        isEven = false;
      }

      // Row background
      const bg = isEven ? '#F8FAFC' : '#FFFFFF';
      doc.rect(margin, currentY, usableWidth, rowH).fill(bg);

      // Row borders
      doc.rect(margin, currentY, usableWidth, rowH).stroke('#E2E8F0');

      // Row text
      doc.fontSize(6.5).font('Helvetica').fillColor('#1E293B');
      let curX = margin;

      for (const col of scaledColumns) {
        let val = row[col.key];
        if (col.format) {
          val = col.format(val);
        } else if (val === null || val === undefined) {
          val = '';
        } else if (typeof val === 'number') {
          val = String(val);
        } else {
          val = String(val);
        }

        const align = col.align || 'left';
        doc.text(val, curX + 3, currentY + 4, {
          width: col.scaledWidth - 6,
          align,
          ellipsis: true,
          height: 10,
        });
        curX += col.scaledWidth;
      }

      currentY += rowH;
      isEven = !isEven;
    }
  }

  // Draw summary / totals row if provided
  if (options.summaryRow) {
    if (currentY + rowH + 4 > maxY) {
      doc.addPage();
      currentY = margin;
      currentY = drawTableHeader(currentY);
    }

    currentY += 2;
    doc.rect(margin, currentY, usableWidth, rowH + 2).fill('#F1F5F9');
    doc.rect(margin, currentY, usableWidth, rowH + 2).stroke('#CBD5E1');

    doc.fontSize(7).font('Helvetica-Bold').fillColor('#0F172A');
    let curX = margin;

    for (const col of scaledColumns) {
      let val = options.summaryRow[col.key];
      if (col.format && val !== undefined) {
        val = col.format(val);
      } else if (val === null || val === undefined) {
        val = '';
      } else {
        val = String(val);
      }

      const align = col.align || 'left';
      doc.text(val, curX + 3, currentY + 5, {
        width: col.scaledWidth - 6,
        align,
        ellipsis: true,
      });
      curX += col.scaledWidth;
    }

    currentY += rowH + 4;
  }

  // Two-pass page footers with page numbers
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.fontSize(6.5).font('Helvetica').fillColor('#94A3B8');
    doc.text(
      `${company.company_name || 'Quotation Management System'}  •  Confidential Financial Document`,
      margin,
      pageHeight - margin + 8,
      { width: usableWidth / 2, align: 'left' }
    );
    doc.text(
      `Page ${i + 1} of ${range.count}`,
      margin + usableWidth / 2,
      pageHeight - margin + 8,
      { width: usableWidth / 2, align: 'right' }
    );
  }

  return doc;
}

/**
 * Builds Landscape PDF for Quotation Register
 */
export function buildQuotationsReportPdf(
  rows: any[],
  filters: Record<string, string>,
  company?: CompanyInfo,
  isEncrypted: boolean = false
): PDFKit.PDFDocument {
  const cleanRows = rows.filter((r) => {
    const qNo = String(r['Quotation No'] || '');
    return !qNo.toLowerCase().includes('no records');
  });

  const columns: ColumnDefinition[] = [
    { header: 'Quote No', key: 'Quotation No', width: 75, align: 'left' },
    { header: 'Date', key: 'Date', width: 55, align: 'center' },
    { header: 'Customer', key: 'Customer', width: 95, align: 'left' },
    { header: 'Phone', key: 'Phone', width: 70, align: 'left' },
    { header: 'Project', key: 'Project', width: 75, align: 'left' },
    { header: 'Salesperson', key: 'Salesperson', width: 85, align: 'left' },
    { header: 'Category', key: 'Sales Category', width: 60, align: 'center' },
    { header: 'Status', key: 'Status', width: 55, align: 'center' },
    { header: 'Approved By', key: 'Approved By', width: 75, align: 'left' },
    { header: 'Gross (Rs.)', key: 'Gross Total (INR)', width: 65, align: 'right', format: formatCurrency },
    { header: 'Disc (Rs.)', key: 'Discount (INR)', width: 55, align: 'right', format: formatCurrency },
    { header: 'Net Total (Rs.)', key: 'Net Total (INR)', width: 70, align: 'right', format: formatCurrency },
    { header: 'Paid (Rs.)', key: 'Paid (INR)', width: 65, align: 'right', format: formatCurrency },
    { header: 'Balance (Rs.)', key: 'Balance Due (INR)', width: 65, align: 'right', format: formatCurrency },
  ];

  // Calculate totals
  const totalGross = cleanRows.reduce((s, r) => s + (Number(r['Gross Total (INR)']) || 0), 0);
  const totalDisc = cleanRows.reduce((s, r) => s + (Number(r['Discount (INR)']) || 0), 0);
  const totalNet = cleanRows.reduce((s, r) => s + (Number(r['Net Total (INR)']) || 0), 0);
  const totalPaid = cleanRows.reduce((s, r) => s + (Number(r['Paid (INR)']) || 0), 0);
  const totalBalance = cleanRows.reduce((s, r) => s + (Number(r['Balance Due (INR)']) || 0), 0);

  const summaryRow = {
    'Quotation No': `TOTAL (${cleanRows.length} quotes)`,
    'Gross Total (INR)': totalGross,
    'Discount (INR)': totalDisc,
    'Net Total (INR)': totalNet,
    'Paid (INR)': totalPaid,
    'Balance Due (INR)': totalBalance,
  };

  return generateTableReportPdf({
    title: isEncrypted ? 'Quotations Register (Encrypted)' : 'Quotations Register Report',
    company,
    filters,
    columns,
    rows: cleanRows,
    summaryRow,
    landscape: true,
  });
}

/**
 * Builds Landscape PDF for Itemized Quotation Line Items
 */
export function buildItemizedQuotationsReportPdf(
  rows: any[],
  filters: Record<string, string>,
  company?: CompanyInfo,
  isEncrypted: boolean = false
): PDFKit.PDFDocument {
  const cleanRows = rows.filter((r) => {
    const qNo = String(r['Quotation No'] || '');
    return !qNo.toLowerCase().includes('no records');
  });

  const columns: ColumnDefinition[] = [
    { header: 'Quote No', key: 'Quotation No', width: 70, align: 'left' },
    { header: 'Date', key: 'Date', width: 55, align: 'center' },
    { header: 'Customer', key: 'Customer', width: 85, align: 'left' },
    { header: 'Salesperson', key: 'Salesperson', width: 75, align: 'left' },
    { header: 'Area / Room', key: 'Area / Room', width: 65, align: 'left' },
    ...(isEncrypted
      ? [{ header: 'Encrypted Product Code', key: 'Encrypted Product Code', width: 145, align: 'left' as const }]
      : [
          { header: 'Product Description', key: 'Product Description', width: 125, align: 'left' as const },
          { header: 'Brand', key: 'Brand', width: 55, align: 'left' as const },
        ]),
    { header: 'Size', key: 'Size', width: 55, align: 'center' },
    { header: 'Type', key: 'Product Type', width: 35, align: 'center' },
    { header: 'Sqft', key: 'Sqft', width: 45, align: 'right', format: (v) => Number(v || 0).toFixed(1) },
    { header: 'Rate/Sqft', key: 'Rate/Sqft', width: 50, align: 'right', format: formatCurrency },
    { header: 'Boxes/Qty', key: 'Boxes/Qty', width: 45, align: 'right', format: (v) => Number(v || 0).toFixed(0) },
    { header: 'Rate/Unit', key: 'Rate/Unit', width: 50, align: 'right', format: formatCurrency },
    { header: 'Total (Rs.)', key: 'Item Total (INR)', width: 65, align: 'right', format: formatCurrency },
  ];

  const totalSqft = cleanRows.reduce((s, r) => s + (Number(r['Sqft']) || 0), 0);
  const totalQty = cleanRows.reduce((s, r) => s + (Number(r['Boxes/Qty']) || 0), 0);
  const totalAmount = cleanRows.reduce((s, r) => s + (Number(r['Item Total (INR)']) || 0), 0);

  const summaryRow = {
    'Quotation No': `TOTAL (${cleanRows.length} items)`,
    Sqft: totalSqft,
    'Boxes/Qty': totalQty,
    'Item Total (INR)': totalAmount,
  };

  return generateTableReportPdf({
    title: isEncrypted ? 'Itemized Quotations Export (Encrypted -AMA)' : 'Itemized Quotations Line Item Report',
    company,
    filters,
    columns,
    rows: cleanRows,
    summaryRow,
    landscape: true,
  });
}

/**
 * Builds Landscape PDF for Salesperson Team Performance
 */
export function buildSalespersonsReportPdf(
  rows: any[],
  filters: Record<string, string>,
  company?: CompanyInfo
): PDFKit.PDFDocument {
  const cleanRows = rows.filter((r) => {
    const sp = String(r['Salesperson'] || '');
    return !sp.toLowerCase().includes('no records');
  });

  const columns: ColumnDefinition[] = [
    { header: 'Salesperson', key: 'Salesperson', width: 105, align: 'left' },
    { header: 'Role', key: 'Role', width: 65, align: 'left' },
    { header: 'Category', key: 'Sales Category', width: 65, align: 'center' },
    { header: 'Target (Rs.)', key: 'Monthly Target (INR)', width: 85, align: 'right', format: formatCurrency },
    { header: 'Achieved %', key: 'Target Achievement', width: 65, align: 'center' },
    { header: 'Quotes', key: 'Total Quotes', width: 50, align: 'center' },
    { header: 'Closed', key: 'Closed Quotes', width: 50, align: 'center' },
    { header: 'Win Rate', key: 'Win Rate', width: 55, align: 'center' },
    { header: 'Closed Rev (Rs.)', key: 'Closed Revenue (INR)', width: 95, align: 'right', format: formatCurrency },
    { header: 'Pipeline (Rs.)', key: 'Pipeline Value (INR)', width: 95, align: 'right', format: formatCurrency },
    { header: 'Total Quoted (Rs.)', key: 'Total Quoted Value (INR)', width: 105, align: 'right', format: formatCurrency },
  ];

  const totalTarget = cleanRows.reduce((s, r) => s + (Number(r['Monthly Target (INR)']) || 0), 0);
  const totalQuotes = cleanRows.reduce((s, r) => s + (Number(r['Total Quotes']) || 0), 0);
  const totalClosed = cleanRows.reduce((s, r) => s + (Number(r['Closed Quotes']) || 0), 0);
  const totalClosedRev = cleanRows.reduce((s, r) => s + (Number(r['Closed Revenue (INR)']) || 0), 0);
  const totalPipeline = cleanRows.reduce((s, r) => s + (Number(r['Pipeline Value (INR)']) || 0), 0);
  const totalQuoted = cleanRows.reduce((s, r) => s + (Number(r['Total Quoted Value (INR)']) || 0), 0);
  const overallWinRate = totalQuotes > 0 ? `${((totalClosed / totalQuotes) * 100).toFixed(1)}%` : '0%';
  const overallAch = totalTarget > 0 ? `${((totalClosedRev / totalTarget) * 100).toFixed(1)}%` : '0%';

  const summaryRow = {
    Salesperson: `TOTAL (${cleanRows.length} associates)`,
    'Monthly Target (INR)': totalTarget,
    'Target Achievement': overallAch,
    'Total Quotes': totalQuotes,
    'Closed Quotes': totalClosed,
    'Win Rate': overallWinRate,
    'Closed Revenue (INR)': totalClosedRev,
    'Pipeline Value (INR)': totalPipeline,
    'Total Quoted Value (INR)': totalQuoted,
  };

  return generateTableReportPdf({
    title: 'Sales Team Performance & Conversion Report',
    company,
    filters,
    columns,
    rows: cleanRows,
    summaryRow,
    landscape: true,
  });
}

/**
 * Builds Landscape PDF for Collections & Payments Register
 */
export function buildPaymentsReportPdf(
  rows: any[],
  filters: Record<string, string>,
  company?: CompanyInfo
): PDFKit.PDFDocument {
  const cleanRows = rows.filter((r) => {
    const rc = String(r['Receipt No'] || '');
    return !rc.toLowerCase().includes('no records');
  });

  const columns: ColumnDefinition[] = [
    { header: 'Receipt No', key: 'Receipt No', width: 72, align: 'left' },
    { header: 'Date', key: 'Date', width: 55, align: 'center' },
    { header: 'Quote No', key: 'Quotation No', width: 70, align: 'left' },
    { header: 'Customer', key: 'Customer', width: 95, align: 'left' },
    { header: 'Amount (Rs.)', key: 'Amount (INR)', width: 80, align: 'right', format: formatCurrency },
    { header: 'Payment Mode', key: 'Payment Mode', width: 85, align: 'left' },
    { header: 'Ref / Txn No', key: 'Ref / Txn No', width: 75, align: 'left' },
    { header: 'Status', key: 'Status', width: 65, align: 'center' },
    { header: 'Recorded By', key: 'Recorded By', width: 75, align: 'left' },
    { header: 'Verified By', key: 'Verified By', width: 75, align: 'left' },
    { header: 'Notes', key: 'Notes', width: 60, align: 'left' },
  ];

  const totalAmount = cleanRows.reduce((s, r) => s + (Number(r['Amount (INR)']) || 0), 0);

  const summaryRow = {
    'Receipt No': `TOTAL (${cleanRows.length} receipts)`,
    'Amount (INR)': totalAmount,
  };

  return generateTableReportPdf({
    title: 'Collections & Payments Register',
    company,
    filters,
    columns,
    rows: cleanRows,
    summaryRow,
    landscape: true,
  });
}
