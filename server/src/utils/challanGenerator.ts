import PDFDocument from 'pdfkit';

export interface ChallanCompanyData {
  company_name?: string;
  tagline?: string;
  logo_base64?: string;
  address_line1?: string;
  address_line2?: string;
  phone?: string;
  email?: string;
  website?: string;
  gstin?: string;
}

export interface ChallanQuotationData {
  id: number;
  quotation_number: string;
  challan_number: string;
  customer_name: string;
  customer_phone?: string;
  delivery_site?: string;
  vehicle_no?: string;
  driver_name?: string;
  driver_phone?: string;
  dispatched_by_name?: string;
  dispatch_time?: string | Date;
  dispatch_status?: string;
  last_invoice_number?: string;
  gstin?: string;
}

export interface ChallanItemData {
  sl_no?: number;
  description: string;
  brand?: string;
  size?: string;
  product_type?: string;
  item_code?: string;
  area_name?: string;
  quantity_boxes?: number | string;
  quantity_sqft?: number | string;
  dispatched_quantity?: number | string;
  pending_quantity?: number | string;
  dispatch_status?: string;
}

export interface ChallanPdfData {
  company?: ChallanCompanyData;
  quotation: ChallanQuotationData;
  items: ChallanItemData[];
}

export function generateDeliveryChallanPdf(data: ChallanPdfData): PDFKit.PDFDocument {
  const doc = new PDFDocument({
    size: 'A4',
    margin: 36,
    bufferPages: true,
  });

  const comp = data.company || {};
  const q = data.quotation;
  const items = data.items || [];

  // Luxury Corporate Palette
  const brandMidnight = '#0D1B2A';
  const brandNavy = '#1B263B';
  const brandSteel = '#415A77';
  const brandSlate = '#778DA9';
  const lightBg = '#F8FAFC';
  const borderLight = '#E2E8F0';
  const borderDark = '#CBD5E1';
  const textDark = '#0F172A';
  const textMuted = '#64748B';
  const textLight = '#94A3B8';
  const emeraldDark = '#065F46';
  const emeraldBg = '#ECFDF5';
  const emeraldBorder = '#A7F3D0';
  const amberDark = '#92400E';
  const amberBg = '#FFFBEB';
  const amberBorder = '#FDE68A';

  const pageWidth = 523; // 595.28 - 72
  const leftX = 36;
  const rightX = leftX + pageWidth;

  // 1. Top Brand Stripe
  doc.rect(leftX, 28, pageWidth, 3.5).fill(brandMidnight);

  let curY = 38;

  // Decode Company Logo if available
  let hasLogo = false;
  if (comp.logo_base64) {
    try {
      const base64Clean = comp.logo_base64.replace(/^data:image\/\w+;base64,/, '');
      const imgBuffer = Buffer.from(base64Clean, 'base64');
      doc.image(imgBuffer, leftX, 36, { fit: [65, 58], valign: 'center' });
      hasLogo = true;
    } catch {
      hasLogo = false;
    }
  }

  const textX = hasLogo ? leftX + 74 : leftX;
  const badgeCardW = 195;
  const badgeCardH = 68;
  const badgeCardX = rightX - badgeCardW;
  const badgeCardY = 36;
  const maxHeaderW = badgeCardX - textX - 12;

  // Company Name & Info
  doc
    .fontSize(15)
    .font('Helvetica-Bold')
    .fillColor(brandMidnight)
    .text((comp.company_name || 'AMA CERAMICS PVT LTD').toUpperCase(), textX, curY, { width: maxHeaderW, ellipsis: true });

  curY += 18;
  doc
    .fontSize(8)
    .font('Helvetica-Bold')
    .fillColor(brandSteel)
    .text(comp.tagline || 'Commercial Quotation & Dispatch Management', textX, curY, { width: maxHeaderW, ellipsis: true });

  curY += 12;
  const addressLine = [comp.address_line1, comp.address_line2].filter(Boolean).join(', ') || 'Showroom & Central Warehouse, Bengaluru';
  doc
    .fontSize(7.5)
    .font('Helvetica')
    .fillColor(textMuted)
    .text(addressLine, textX, curY, { width: maxHeaderW, ellipsis: true });

  curY += 11;
  doc
    .fontSize(7.5)
    .font('Helvetica')
    .fillColor(textMuted)
    .text(`GSTIN: ${comp.gstin || '-'}  •  Phone: ${comp.phone || '-'}  •  Email: ${comp.email || '-'}`, textX, curY, { width: maxHeaderW, ellipsis: true });

  // Official Document Badge Card (Top Right)
  doc
    .roundedRect(badgeCardX, badgeCardY, badgeCardW, badgeCardH, 5)
    .fillAndStroke(lightBg, borderDark);

  doc
    .fontSize(11)
    .font('Helvetica-Bold')
    .fillColor(brandMidnight)
    .text('DELIVERY CHALLAN', badgeCardX, badgeCardY + 8, { width: badgeCardW, align: 'center' });

  doc
    .fontSize(6.5)
    .font('Helvetica-Bold')
    .fillColor(brandSteel)
    .text('GOODS DISPATCH ADVICE NOTE', badgeCardX, badgeCardY + 22, { width: badgeCardW, align: 'center' });

  // Badge inner dividing rule
  doc
    .moveTo(badgeCardX + 12, badgeCardY + 32)
    .lineTo(badgeCardX + badgeCardW - 12, badgeCardY + 32)
    .strokeColor(borderDark)
    .stroke();

  doc
    .fontSize(7.5)
    .font('Helvetica-Bold')
    .fillColor(textDark)
    .text('Challan No:', badgeCardX + 12, badgeCardY + 37)
    .font('Helvetica-Bold')
    .fillColor('#1D4ED8')
    .text(q.challan_number || `DC-2026-${String(q.id || 1).padStart(4, '0')}`, badgeCardX + 70, badgeCardY + 37, { align: 'right', width: badgeCardW - 82 });

  const dispDateStr = q.dispatch_time
    ? new Date(q.dispatch_time).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  doc
    .font('Helvetica')
    .fillColor(textMuted)
    .text('Date:', badgeCardX + 12, badgeCardY + 49)
    .font('Helvetica-Bold')
    .fillColor(textDark)
    .text(dispDateStr, badgeCardX + 70, badgeCardY + 49, { align: 'right', width: badgeCardW - 82 });

  doc
    .font('Helvetica')
    .fillColor(textMuted)
    .text('Quote Ref:', badgeCardX + 12, badgeCardY + 59)
    .font('Helvetica-Bold')
    .fillColor(textDark)
    .text(q.quotation_number || '-', badgeCardX + 70, badgeCardY + 59, { align: 'right', width: badgeCardW - 82 });

  // 2. Logistics & Consignee Dual Cards
  curY = 114;
  const colGap = 12;
  const colW = (pageWidth - colGap) / 2; // ~255.5 pt
  const cardH = 74;

  // Left Card: Consignee / Delivery Destination
  doc
    .roundedRect(leftX, curY, colW, cardH, 5)
    .fillAndStroke('#FFFFFF', borderLight);

  doc
    .roundedRect(leftX, curY, colW, 18, 5)
    .fill(lightBg);
  doc
    .rect(leftX, curY + 12, colW, 6)
    .fill(lightBg);
  doc
    .moveTo(leftX, curY + 18)
    .lineTo(leftX + colW, curY + 18)
    .strokeColor(borderLight)
    .stroke();

  doc
    .fontSize(7.5)
    .font('Helvetica-Bold')
    .fillColor(brandSteel)
    .text('CONSIGNEE / DELIVERY DESTINATION', leftX + 10, curY + 5);

  doc
    .fontSize(9.5)
    .font('Helvetica-Bold')
    .fillColor(textDark)
    .text(q.customer_name || 'Customer Record', leftX + 10, curY + 23, { width: colW - 20, ellipsis: true });

  doc
    .fontSize(8)
    .font('Helvetica')
    .fillColor(textMuted)
    .text('Contact: ', leftX + 10, curY + 36)
    .font('Helvetica-Bold')
    .fillColor(textDark)
    .text(q.customer_phone || 'N/A', leftX + 46, curY + 36);

  doc
    .font('Helvetica')
    .fillColor(textMuted)
    .text('Site: ', leftX + 10, curY + 48)
    .font('Helvetica')
    .fillColor(textDark)
    .text((q.delivery_site || 'Ex-Showroom / Customer Site').substring(0, 65), leftX + 32, curY + 48, { width: colW - 42, height: 22, ellipsis: true });

  // Right Card: Transport & Dispatch Logistics
  const rightColX = leftX + colW + colGap;

  doc
    .roundedRect(rightColX, curY, colW, cardH, 5)
    .fillAndStroke('#FFFFFF', borderLight);

  doc
    .roundedRect(rightColX, curY, colW, 18, 5)
    .fill(lightBg);
  doc
    .rect(rightColX, curY + 12, colW, 6)
    .fill(lightBg);
  doc
    .moveTo(rightColX, curY + 18)
    .lineTo(rightColX + colW, curY + 18)
    .strokeColor(borderLight)
    .stroke();

  doc
    .fontSize(7.5)
    .font('Helvetica-Bold')
    .fillColor(brandSteel)
    .text('TRANSPORT & DISPATCH LOGISTICS', rightColX + 10, curY + 5);

  doc
    .fontSize(8)
    .font('Helvetica')
    .fillColor(textMuted)
    .text('Vehicle No:', rightColX + 10, curY + 24)
    .font('Helvetica-Bold')
    .fillColor(textDark)
    .text(q.vehicle_no || 'Standard Commercial Transport', rightColX + 64, curY + 24, { width: colW - 74, ellipsis: true });

  const driverPhonePart = q.driver_phone ? `(${q.driver_phone})` : '';
  const driverText = q.driver_name ? `${q.driver_name} ${driverPhonePart}`.trim() : 'Pending Driver Assignment';

  doc
    .font('Helvetica')
    .fillColor(textMuted)
    .text('Driver / Phone:', rightColX + 10, curY + 36)
    .font('Helvetica-Bold')
    .fillColor(textDark)
    .text(driverText, rightColX + 75, curY + 36, { width: colW - 85, ellipsis: true });

  doc
    .font('Helvetica')
    .fillColor(textMuted)
    .text('Supervisor:', rightColX + 10, curY + 48)
    .font('Helvetica-Bold')
    .fillColor(textDark)
    .text(q.dispatched_by_name || 'Godown Warehouse Team', rightColX + 62, curY + 48, { width: colW - 72, ellipsis: true });

  if (q.last_invoice_number) {
    doc
      .font('Helvetica')
      .fillColor(textMuted)
      .text('Billed Inv Ref:', rightColX + 10, curY + 60)
      .font('Helvetica-Bold')
      .fillColor(emeraldDark)
      .text(`#${q.last_invoice_number}`, rightColX + 72, curY + 60);
  }

  // 3. Items Table Header
  curY = 196;

  // Exact column coordinates spanning 523 pt
  const colSlX = leftX;
  const colSlW = 26;
  const colDescX = colSlX + colSlW;
  const colDescW = 175;
  const colBrandX = colDescX + colDescW;
  const colBrandW = 88;
  const colAreaX = colBrandX + colBrandW;
  const colAreaW = 72;
  const colOrdX = colAreaX + colAreaW;
  const colOrdW = 54;
  const colDispX = colOrdX + colOrdW;
  const colDispW = 56;
  const colStatX = colDispX + colDispW;
  const colStatW = 52;

  function drawTableHeader(yPos: number): number {
    const thHeight = 22;
    doc
      .rect(leftX, yPos, pageWidth, thHeight)
      .fill(brandNavy);

    doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#FFFFFF');
    doc.text('SL', colSlX, yPos + 7, { width: colSlW, align: 'center' });
    doc.text('ITEM DESCRIPTION', colDescX + 4, yPos + 7, { width: colDescW - 8 });
    doc.text('BRAND / SPECS', colBrandX, yPos + 7, { width: colBrandW });
    doc.text('ROOM / AREA', colAreaX, yPos + 7, { width: colAreaW });
    doc.text('ORDERED', colOrdX, yPos + 7, { width: colOrdW - 4, align: 'right' });
    doc.text('DISPATCHED', colDispX, yPos + 7, { width: colDispW - 4, align: 'right' });
    doc.text('STATUS', colStatX, yPos + 7, { width: colStatW, align: 'center' });

    return thHeight;
  }

  curY += drawTableHeader(curY);

  let totalDispatchedCount = 0;
  let totalOrderedCount = 0;

  items.forEach((it, idx) => {
    const rowH = 26;

    // Multi-page break threshold
    if (curY + rowH > 715) {
      doc.addPage();
      curY = 36;
      doc.rect(leftX, 28, pageWidth, 2.5).fill(brandMidnight);
      doc
        .fontSize(9)
        .font('Helvetica-Bold')
        .fillColor(brandMidnight)
        .text(`DELIVERY CHALLAN #${q.challan_number || ''} — CONTINUED`, leftX, curY);
      curY += 16;
      curY += drawTableHeader(curY);
    }

    const isEven = idx % 2 === 0;
    if (!isEven) {
      doc.rect(leftX, curY, pageWidth, rowH).fill(lightBg);
    }

    doc
      .moveTo(leftX, curY + rowH)
      .lineTo(rightX, curY + rowH)
      .strokeColor(borderLight)
      .stroke();

    const ord = it.quantity_boxes != null && !isNaN(Number(it.quantity_boxes)) && Number(it.quantity_boxes) > 0
      ? Number(it.quantity_boxes)
      : (it.quantity_sqft != null && !isNaN(Number(it.quantity_sqft)) ? Number(it.quantity_sqft) : 1);

    let disp = 0;
    if (it.dispatched_quantity != null && !isNaN(Number(it.dispatched_quantity))) {
      disp = Number(it.dispatched_quantity);
    } else if (q.dispatch_status === 'Dispatched' || q.dispatch_status === 'COMPLETED' || it.dispatch_status === 'Dispatched') {
      disp = ord;
    }

    const unitStr = it.product_type || 'Box';
    const isFull = disp >= ord && ord > 0;
    const isPartial = disp > 0 && disp < ord;

    totalOrderedCount += ord;
    totalDispatchedCount += disp;

    // Sl No
    doc
      .fontSize(7.5)
      .font('Helvetica-Bold')
      .fillColor(textMuted)
      .text(String(idx + 1), colSlX, curY + 8, { width: colSlW, align: 'center' });

    // Item Description & Subtitle
    doc
      .fontSize(8)
      .font('Helvetica-Bold')
      .fillColor(textDark)
      .text(it.description || 'Tile Product', colDescX + 4, curY + 5, { width: colDescW - 8, ellipsis: true });

    const specsSubtitle = [it.size, it.item_code].filter(Boolean).join(' • ');
    if (specsSubtitle) {
      doc
        .fontSize(6.5)
        .font('Helvetica')
        .fillColor(textMuted)
        .text(specsSubtitle, colDescX + 4, curY + 15, { width: colDescW - 8, ellipsis: true });
    }

    // Brand / Specs
    doc
      .fontSize(7.5)
      .font('Helvetica-Bold')
      .fillColor(brandSteel)
      .text(it.brand || 'Premium Grade', colBrandX, curY + 5, { width: colBrandW, ellipsis: true });

    if (it.size) {
      doc
        .fontSize(6.5)
        .font('Helvetica')
        .fillColor(textMuted)
        .text(it.size, colBrandX, curY + 15, { width: colBrandW, ellipsis: true });
    }

    // Room / Area
    doc
      .fontSize(7.5)
      .font('Helvetica')
      .fillColor(textMuted)
      .text(it.area_name || 'General / All Areas', colAreaX, curY + 8, { width: colAreaW, ellipsis: true });

    // Ordered Qty
    const ordStr = ord % 1 === 0 ? ord.toFixed(0) : ord.toFixed(1);
    doc
      .fontSize(7.5)
      .font('Helvetica')
      .fillColor(textMuted)
      .text(`${ordStr} ${unitStr}`, colOrdX, curY + 8, { width: colOrdW - 4, align: 'right' });

    // Dispatched Qty
    const dispStr = disp % 1 === 0 ? disp.toFixed(0) : disp.toFixed(1);
    doc
      .fontSize(8)
      .font('Helvetica-Bold')
      .fillColor(brandMidnight)
      .text(`${dispStr} ${unitStr}`, colDispX, curY + 8, { width: colDispW - 4, align: 'right' });

    // Status Pill
    const pillW = 46;
    const pillH = 13;
    const pillX = colStatX + (colStatW - pillW) / 2;
    const pillY = curY + 6.5;

    if (isFull) {
      doc
        .roundedRect(pillX, pillY, pillW, pillH, 6.5)
        .fillAndStroke(emeraldBg, emeraldBorder);
      doc
        .fontSize(6)
        .font('Helvetica-Bold')
        .fillColor(emeraldDark)
        .text('DISPATCHED', pillX, pillY + 3, { width: pillW, align: 'center' });
    } else if (isPartial) {
      doc
        .roundedRect(pillX, pillY, pillW, pillH, 6.5)
        .fillAndStroke(amberBg, amberBorder);
      doc
        .fontSize(6)
        .font('Helvetica-Bold')
        .fillColor(amberDark)
        .text('PARTIAL', pillX, pillY + 3, { width: pillW, align: 'center' });
    } else {
      doc
        .roundedRect(pillX, pillY, pillW, pillH, 6.5)
        .fillAndStroke('#F1F5F9', borderDark);
      doc
        .fontSize(6)
        .font('Helvetica-Bold')
        .fillColor('#64748B')
        .text('PENDING', pillX, pillY + 3, { width: pillW, align: 'center' });
    }

    curY += rowH;
  });

  // 4. Table Summary Footer Bar
  const summaryH = 24;
  if (curY + summaryH > 725) {
    doc.addPage();
    curY = 36;
  }

  doc
    .rect(leftX, curY, pageWidth, summaryH)
    .fillAndStroke('#F1F5F9', borderDark);

  doc
    .fontSize(8)
    .font('Helvetica-Bold')
    .fillColor(brandSteel)
    .text(`TOTAL SUMMARY: ${items.length} LINE ITEMS`, leftX + 12, curY + 7);

  doc
    .fontSize(8.5)
    .font('Helvetica-Bold')
    .fillColor(textDark)
    .text('TOTAL DISPATCHED UNITS:', colOrdX - 80, curY + 7, { width: 120, align: 'right' });

  const totalDispStr = totalDispatchedCount % 1 === 0 ? totalDispatchedCount.toFixed(0) : totalDispatchedCount.toFixed(1);
  doc
    .fontSize(9.5)
    .font('Helvetica-Bold')
    .fillColor(brandMidnight)
    .text(`${totalDispStr} Boxes / Units`, colDispX - 10, curY + 6, { width: 70, align: 'right' });

  curY += summaryH + 14;

  // Check if declaration and signatures fit on current page
  const termsAndSigH = 44 + 14 + 78;
  if (curY + termsAndSigH > 780) {
    doc.addPage();
    curY = 40;
  }

  // 5. Receiving Declaration & Transit Terms Card
  const termsH = 44;
  doc
    .roundedRect(leftX, curY, pageWidth, termsH, 5)
    .fillAndStroke('#FAFAFA', borderLight);

  doc
    .fontSize(7)
    .font('Helvetica-Bold')
    .fillColor(brandMidnight)
    .text('RECEIVING DECLARATION & TERMS OF TRANSIT:', leftX + 10, curY + 6);

  doc
    .fontSize(6.5)
    .font('Helvetica')
    .fillColor(textMuted)
    .text(
      '1. Materials listed above have been inspected and received in good order, exact batch shades, and verified physical quantities.\n' +
      '2. Breakage or discrepancy claims, if any, must be endorsed in writing on this official copy at the time of delivery before vehicle release.\n' +
      '3. Once signed and acknowledged at customer destination site, AMA Ceramics Pvt Ltd stands discharged of delivery obligations.',
      leftX + 10,
      curY + 16,
      { width: pageWidth - 20, lineGap: 1.2 }
    );

  curY += termsH + 14;

  // 6. Professional Triple Authorization & Stamp Block
  const sigBoxW = (pageWidth - 20) / 3; // ~167.7 pt each
  const sigBoxH = 78;

  // Sign Box 1: Warehouse Dispatch Supervisor
  const sig1X = leftX;
  doc
    .roundedRect(sig1X, curY, sigBoxW, sigBoxH, 5)
    .fillAndStroke('#FFFFFF', borderLight);

  doc
    .roundedRect(sig1X, curY, sigBoxW, 16, 5)
    .fill(lightBg);
  doc
    .rect(sig1X, curY + 10, sigBoxW, 6)
    .fill(lightBg);
  doc
    .moveTo(sig1X, curY + 16)
    .lineTo(sig1X + sigBoxW, curY + 16)
    .strokeColor(borderLight)
    .stroke();

  doc
    .fontSize(6.5)
    .font('Helvetica-Bold')
    .fillColor(brandSteel)
    .text('1. WAREHOUSE DISPATCH', sig1X + 8, curY + 5);

  doc
    .fontSize(7.5)
    .font('Helvetica-Bold')
    .fillColor(textDark)
    .text(`Supervisor: ${q.dispatched_by_name || 'Godown Supervisor'}`, sig1X + 8, curY + 22, { width: sigBoxW - 16, ellipsis: true });

  doc
    .fontSize(6.5)
    .font('Helvetica')
    .fillColor(textLight)
    .text('Verified stock pulled & packed', sig1X + 8, curY + 31);

  doc
    .moveTo(sig1X + 8, curY + 58)
    .lineTo(sig1X + sigBoxW - 8, curY + 58)
    .strokeColor(borderDark)
    .stroke();

  doc
    .fontSize(6.5)
    .font('Helvetica-Bold')
    .fillColor(textMuted)
    .text('Signature & Godown Seal', sig1X + 8, curY + 62, { width: sigBoxW - 16, align: 'center' });

  // Sign Box 2: Carrier / Driver
  const sig2X = sig1X + sigBoxW + 10;
  doc
    .roundedRect(sig2X, curY, sigBoxW, sigBoxH, 5)
    .fillAndStroke('#FFFFFF', borderLight);

  doc
    .roundedRect(sig2X, curY, sigBoxW, 16, 5)
    .fill(lightBg);
  doc
    .rect(sig2X, curY + 10, sigBoxW, 6)
    .fill(lightBg);
  doc
    .moveTo(sig2X, curY + 16)
    .lineTo(sig2X + sigBoxW, curY + 16)
    .strokeColor(borderLight)
    .stroke();

  doc
    .fontSize(6.5)
    .font('Helvetica-Bold')
    .fillColor(brandSteel)
    .text('2. CARRIER / DRIVER', sig2X + 8, curY + 5);

  doc
    .fontSize(7.5)
    .font('Helvetica-Bold')
    .fillColor(textDark)
    .text(`Driver: ${q.driver_name || 'Transport Driver'}`, sig2X + 8, curY + 22, { width: sigBoxW - 16, ellipsis: true });

  doc
    .fontSize(6.5)
    .font('Helvetica')
    .fillColor(textLight)
    .text(`Vehicle: ${q.vehicle_no || 'Standard Commercial'}`, sig2X + 8, curY + 31, { width: sigBoxW - 16, ellipsis: true });

  doc
    .moveTo(sig2X + 8, curY + 58)
    .lineTo(sig2X + sigBoxW - 8, curY + 58)
    .strokeColor(borderDark)
    .stroke();

  doc
    .fontSize(6.5)
    .font('Helvetica-Bold')
    .fillColor(textMuted)
    .text("Carrier's Signature & Date", sig2X + 8, curY + 62, { width: sigBoxW - 16, align: 'center' });

  // Sign Box 3: Customer / Consignee
  const sig3X = sig2X + sigBoxW + 10;
  doc
    .roundedRect(sig3X, curY, sigBoxW, sigBoxH, 5)
    .fillAndStroke('#FFFFFF', borderLight);

  doc
    .roundedRect(sig3X, curY, sigBoxW, 16, 5)
    .fill(lightBg);
  doc
    .rect(sig3X, curY + 10, sigBoxW, 6)
    .fill(lightBg);
  doc
    .moveTo(sig3X, curY + 16)
    .lineTo(sig3X + sigBoxW, curY + 16)
    .strokeColor(borderLight)
    .stroke();

  doc
    .fontSize(6.5)
    .font('Helvetica-Bold')
    .fillColor(brandSteel)
    .text('3. CONSIGNEE / SITE AGENT', sig3X + 8, curY + 5);

  doc
    .fontSize(7.5)
    .font('Helvetica-Bold')
    .fillColor(textDark)
    .text(`Receiver: ${q.customer_name || 'Consignee'}`, sig3X + 8, curY + 22, { width: sigBoxW - 16, ellipsis: true });

  doc
    .fontSize(6.5)
    .font('Helvetica')
    .fillColor(textLight)
    .text('Goods received in sound condition', sig3X + 8, curY + 31);

  doc
    .moveTo(sig3X + 8, curY + 58)
    .lineTo(sig3X + sigBoxW - 8, curY + 58)
    .strokeColor(borderDark)
    .stroke();

  doc
    .fontSize(6.5)
    .font('Helvetica-Bold')
    .fillColor(textMuted)
    .text('Receiver Signature & Date', sig3X + 8, curY + 62, { width: sigBoxW - 16, align: 'center' });

  // 7. Corporate Running Footer across all pages
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const footerY = 806;
    doc
      .moveTo(leftX, footerY)
      .lineTo(rightX, footerY)
      .strokeColor(borderLight)
      .stroke();

    doc
      .fontSize(6)
      .font('Helvetica')
      .fillColor(textLight)
      .text('Official Computer-Generated Delivery Challan • AMA Ceramics Pvt Ltd • Valid without physical endorsement if digitally reconciled', leftX, footerY + 5);

    doc
      .fontSize(6)
      .font('Helvetica-Bold')
      .fillColor(brandSteel)
      .text(`Page ${i + 1} of ${range.count}`, rightX - 60, footerY + 5, { align: 'right', width: 60 });
  }

  doc.end();
  return doc;
}
