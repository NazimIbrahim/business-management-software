import { normalizeCeramicName } from './fuzzyItemMatcher';

// Lazy-require pdfjs-dist legacy to prevent canvas issues in Node
let pdfjsLib: any = null;
function getPdfJs() {
  if (!pdfjsLib) {
    if (typeof (global as any).DOMMatrix === 'undefined') {
      (global as any).DOMMatrix = class DOMMatrix {
        a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
        m11 = 1; m12 = 0; m13 = 0; m14 = 0;
        m21 = 0; m22 = 1; m23 = 0; m24 = 0;
        m31 = 0; m32 = 0; m33 = 1; m34 = 0;
        m41 = 0; m42 = 0; m43 = 0; m44 = 1;
        is2D = true;
        isIdentity = true;
      };
    }
    pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
  }
  return pdfjsLib;
}

export interface TextItemPos {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ParsedInvoiceItem {
  raw_description: string;
  clean_description: string;
  quantity: number;
  unit: string;
  hsn?: string;
  rate?: number;
  amount?: number;
  raw_line?: string;
}

export interface ParsedTaxInvoice {
  invoice_number: string;
  invoice_date: string | null;
  customer_phones: string[];
  customer_gstins: string[];
  items: ParsedInvoiceItem[];
  raw_text: string;
  parser_type: 'COORDINATE_TABLE' | 'AI_VISION_FALLBACK' | 'REGEX_FALLBACK';
  confidence: number;
}

/**
 * Extracts coordinate-positioned text items from PDF buffer
 */
export async function extractCoordinateTextItems(pdfBuffer: Buffer): Promise<{ items: TextItemPos[]; fullText: string }> {
  const pdfjs = getPdfJs();
  const uint8 = new Uint8Array(pdfBuffer);
  const loadingTask = pdfjs.getDocument({
    data: uint8,
    isEvalSupported: false,
    useSystemFonts: true,
  });

  const doc = await loadingTask.promise;
  const allItems: TextItemPos[] = [];
  const textChunks: string[] = [];

  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const content = await page.getTextContent();

    for (const it of content.items) {
      if (!it.str || !it.str.trim()) continue;
      // transform: [scaleX, skewY, skewX, scaleY, transX, transY]
      const x = it.transform ? it.transform[4] : 0;
      const y = it.transform ? it.transform[5] : 0;

      allItems.push({
        str: it.str.trim(),
        x,
        y,
        width: it.width || 0,
        height: it.height || 0,
      });

      if (it.str) textChunks.push(it.str + ' ');
    }
    textChunks.push('\n');
  }

  return { items: allItems, fullText: textChunks.join('') };
}

/**
 * Parses Indian GST / Tally / ERP Tax Invoices using precise column boundary intervals
 */
export async function parseTaxInvoiceWithCoordinates(pdfBuffer: Buffer): Promise<ParsedTaxInvoice> {
  const { items: allItems, fullText } = await extractCoordinateTextItems(pdfBuffer);

  // 2. Cluster text items into visual rows by Y coordinate (±4 pt tolerance)
  // PDF coordinate system has Y increasing from bottom to top
  allItems.sort((a, b) => b.y - a.y || a.x - b.x);

  interface RowCluster {
    y: number;
    items: TextItemPos[];
    rowText: string;
  }

  const rows: RowCluster[] = [];
  for (const item of allItems) {
    let row = rows.find((r) => Math.abs(r.y - item.y) <= 4.0);
    if (!row) {
      row = { y: item.y, items: [], rowText: '' };
      rows.push(row);
    }
    row.items.push(item);
  }

  // Sort each row's items horizontally from left to right
  for (const r of rows) {
    r.items.sort((a, b) => a.x - b.x);
    r.rowText = r.items.map((i) => i.str).join(' ');
  }

  const rowJoinedText = rows.map((r) => r.rowText).join('\n');
  const fullTextToUse = rowJoinedText || fullText;

  // 1. Extract Statutory Metadata (Phone, GSTIN, Invoice #, Date)
  const phoneMatches = Array.from(fullTextToUse.matchAll(/(?:\+91[\-\s]?)?([6-9]\d{9})\b/g)).map((m) => m[1]);
  const detectedPhones = Array.from(new Set(phoneMatches));

  const gstinMatches = fullTextToUse.match(/\b\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}\b/gi) || [];
  const detectedGstins = Array.from(new Set(gstinMatches.map((g) => g.toUpperCase())));

  // Coordinate-based invoice number detection (look near "Invoice No")
  let invoiceNumber: string | null = null;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const invNoItem = r.items.find((it) => /invoice\s*(?:no|number|#)/i.test(it.str));
    if (invNoItem) {
      const sameRowNext = r.items.find((it) => it.x > invNoItem.x && !/dated|delivery/i.test(it.str));
      if (sameRowNext && /^[A-Za-z0-9\/\-_]+$/.test(sameRowNext.str)) {
        invoiceNumber = sameRowNext.str;
        break;
      }
      for (let j = i + 1; j < Math.min(i + 4, rows.length); j++) {
        const nextRowItem = rows[j].items.find(
          (it) => Math.abs(it.x - invNoItem.x) <= 25 && /^[A-Za-z0-9\/\-_]+$/.test(it.str) && !/dated|delivery|buyer/i.test(it.str)
        );
        if (nextRowItem) {
          invoiceNumber = nextRowItem.str;
          break;
        }
      }
      if (invoiceNumber) break;
    }
  }

  if (!invoiceNumber) {
    const invMatch =
      fullTextToUse.match(/(?:Invoice\s*(?:No|Number|#)[\s.:#]*([A-Za-z0-9\/\-_]+))/i) ||
      fullTextToUse.match(/(?:Bill\s*(?:No|Number|#)[\s.:#]*([A-Za-z0-9\/\-_]+))/i) ||
      fullTextToUse.match(/(?:Tax\s*Invoice[\s\S]*?(?:No|#)[\s.:#]*([A-Za-z0-9\/\-_]+))/i);
    invoiceNumber = invMatch && invMatch[1] && !/dated|delivery/i.test(invMatch[1]) ? invMatch[1].trim() : `INV-${Date.now().toString().slice(-6)}`;
  }

  // Coordinate-based invoice date detection (look near "Dated")
  let invoiceDate: string | null = null;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const dateItem = r.items.find((it) => /^dated$/i.test(it.str));
    if (dateItem) {
      for (let j = i + 1; j < Math.min(i + 4, rows.length); j++) {
        const nextRowItem = rows[j].items.find(
          (it) => Math.abs(it.x - dateItem.x) <= 25 && /[0-9]{1,2}[\/\-\.][0-9A-Za-z]{1,4}[\/\-\.][0-9]{2,4}/.test(it.str)
        );
        if (nextRowItem) {
          invoiceDate = nextRowItem.str;
          break;
        }
      }
      if (invoiceDate) break;
    }
  }

  if (!invoiceDate) {
    const dateMatch = fullTextToUse.match(/(?:Invoice\s*Date|Dated|Date)[\s.:#]*([0-9]{1,2}[\/\-\.][0-9A-Za-z]{1,4}[\/\-\.][0-9]{2,4})/i);
    invoiceDate = dateMatch && dateMatch[1] ? dateMatch[1].trim() : null;
  }

  // 3. Dynamic Column Header Detection
  let headerRowIndex = -1;
  let slColX = -1;
  let descColX = -1;
  let hsnColX = -1;
  let qtyColX = -1;
  let rateColX = -1;
  let perColX = -1;
  let amountColX = -1;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const textLower = r.rowText.toLowerCase();

    // Look for row with Description and Quantity
    const hasDesc = /desc|particular|item\s+name|product/i.test(textLower);
    const hasQty = /qty|quantity|billed/i.test(textLower);

    if (hasDesc && hasQty) {
      headerRowIndex = i;

      for (const item of r.items) {
        const s = item.str.toLowerCase();
        if (/^sl\b/i.test(s) && slColX === -1) slColX = item.x;
        if (/desc|particular|item/i.test(s) && descColX === -1) descColX = item.x;
        if (/hsn|sac/i.test(s) && hsnColX === -1) hsnColX = item.x;
        if (/qty|quantity|billed/i.test(s) && qtyColX === -1) qtyColX = item.x;
        if (/rate|price/i.test(s) && rateColX === -1) rateColX = item.x;
        if (/per|uom|unit/i.test(s) && perColX === -1) perColX = item.x;
        if (/amount|total|value/i.test(s) && amountColX === -1) amountColX = item.x;
      }
      break;
    }
  }

  const parsedItems: ParsedInvoiceItem[] = [];

  // If header row found, establish column bounding intervals
  if (headerRowIndex !== -1 && qtyColX !== -1) {
    // Quantity horizontal interval:
    const nextColX = [rateColX, perColX, amountColX].filter((x) => x > qtyColX).sort((a, b) => a - b)[0] || (qtyColX + 70);
    const prevColX = [hsnColX].filter((x) => x > 0 && x < qtyColX).sort((a, b) => b - a)[0] || (qtyColX - 60);

    const qtyStartX = Math.max(0, qtyColX - Math.min(25, (qtyColX - prevColX) / 2));
    const qtyEndX = nextColX - 5;

    // Description column interval: starts after Sl column (or 25pt) and ends before HSN or Qty
    const descStartX = slColX > 0 ? slColX + 5 : 25;
    const descEndX = (hsnColX > 0 ? hsnColX : qtyStartX) - 5;

    // Scan data rows below header
    for (let i = headerRowIndex + 1; i < rows.length; i++) {
      const r = rows[i];
      const textLower = r.rowText.toLowerCase();

      // Check for table termination keywords
      if (/sub\s*total|grand\s*total|total|taxable\s*amount|e\.?\s*&\s*o\.?e|bank\s*details|rupees|output\s*cgst|output\s*sgst/i.test(textLower)) {
        if (/total|output|cgst|sgst/i.test(textLower) && r.items.length < 8) {
          break;
        }
      }

      // Collect Description items
      const descItems = r.items.filter((it) => it.x >= descStartX && it.x < descEndX);
      // Collect Quantity items
      const qtyItems = r.items.filter((it) => it.x >= qtyStartX && it.x <= qtyEndX);

      // Strip leading serial number e.g. "1 " if captured
      let rowDescText = descItems.map((it) => it.str).join(' ').trim().replace(/^\d+[\s.)-]+/, '').trim();
      const rowQtyText = qtyItems.map((it) => it.str).join(' ').trim();

      // Check if this row or sub-line has parenthesis NOS like "(28 NOS)"
      const isSublinePieceCount = /^\(\s*\d+\s*(?:nos|pcs)?\s*\)$/i.test(rowQtyText);

      // Parse Quantity: target primary billed unit first (BOX, SQM, SQFT, PCS, NOS)
      let detectedQty: number | null = null;
      let detectedUnit = 'BOX';

      if (rowQtyText && !isSublinePieceCount) {
        // 1. Prioritize strict BOX quantity: ([0-9]+(?:\.[0-9]+)?)\s*BOX
        const boxMatch = rowQtyText.match(/(?:^|\s)([0-9]+(?:\.[0-9]+)?)\s*BOX(?:ES)?\b/i);
        if (boxMatch) {
          detectedQty = parseFloat(boxMatch[1]);
          detectedUnit = 'BOX';
        } else {
          // 2. Secondary recognized units (SQM, SQFT, PCS, NOS)
          const unitMatch = rowQtyText.match(/(?:^|\s)([0-9]+(?:\.[0-9]+)?)\s*(SQM|SQFT|PCS|NOS)\b/i);
          if (unitMatch) {
            detectedQty = parseFloat(unitMatch[1]);
            detectedUnit = unitMatch[2].toUpperCase();
          } else {
            // 3. Strip any parentheses e.g. "(28 NOS)" and extract standalone number
            const cleanQtyText = rowQtyText.replace(/\([^)]*\)/g, '').trim();
            const numMatch = cleanQtyText.match(/(?:^|\s)([0-9]+(?:\.[0-9]+)?)\b/);
            if (numMatch) {
              detectedQty = parseFloat(numMatch[1]);
            }
          }
        }
      }

      // Check if quantity exists anywhere on the row if column interval missed it
      if (detectedQty === null) {
        const boxMatchInRow = r.rowText.match(/(?:^|\s)([0-9]+(?:\.[0-9]+)?)\s*BOX(?:ES)?\b/i);
        if (boxMatchInRow) {
          detectedQty = parseFloat(boxMatchInRow[1]);
          detectedUnit = 'BOX';
        }
      }

      if (rowDescText && detectedQty !== null && detectedQty > 0) {
        parsedItems.push({
          raw_description: rowDescText,
          clean_description: normalizeCeramicName(rowDescText),
          quantity: detectedQty,
          unit: detectedUnit,
          raw_line: r.rowText,
        });
      } else if (rowDescText && parsedItems.length > 0 && detectedQty === null) {
        // Multi-line description continuation (ignore piece counts or secondary units like "2 PC" or "(28 NOS)")
        const prevItem = parsedItems[parsedItems.length - 1];
        const isPieceCountOrUnit = /^(?:\(?\s*\d*(?:\.\d+)?\s*(?:pc|pcs|nos|box|boxes)?\s*\)?|pc|pcs|nos|box|boxes)$/i.test(rowDescText.trim());
        if (!isPieceCountOrUnit && !/terms|declaration|bank|account|gst|output|cgst|sgst/i.test(rowDescText)) {
          prevItem.raw_description += ` ${rowDescText}`;
          prevItem.clean_description = normalizeCeramicName(prevItem.raw_description);
        }
      }
    }
  }

  // 4. Fallback line-by-line regex if coordinate column detection found 0 items
  if (parsedItems.length === 0) {
    const rawLines = fullTextToUse.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 5);

    for (const line of rawLines) {
      if (/total|invoice|buyer|gstin|transport|vehicle|terms/i.test(line)) continue;

      // Regex matching description followed by billed quantity (prioritize BOX)
      let lineMatch = line.match(/(.+?)(?:\s+\d{4,8})?\s+([0-9]+(?:\.[0-9]+)?)\s*BOX(?:ES)?\b/i);
      let unit = 'BOX';
      if (!lineMatch) {
        lineMatch = line.match(/(.+?)(?:\s+\d{4,8})?\s+([0-9]+(?:\.[0-9]+)?)\s*(SQM|SQFT|PCS|NOS)\b/i);
        if (lineMatch) unit = lineMatch[3].toUpperCase();
      }

      if (lineMatch) {
        const desc = lineMatch[1].replace(/^\d+[\s.)-]+/, '').trim();
        const qty = parseFloat(lineMatch[2]);

        if (desc.length > 3 && !isNaN(qty) && qty > 0) {
          parsedItems.push({
            raw_description: desc,
            clean_description: normalizeCeramicName(desc),
            quantity: qty,
            unit,
            raw_line: line,
          });
        }
      }
    }
  }

  const confidence = parsedItems.length > 0 ? 0.95 : 0.4;
  const parserType = parsedItems.length > 0 ? 'COORDINATE_TABLE' : 'REGEX_FALLBACK';

  return {
    invoice_number: invoiceNumber,
    invoice_date: invoiceDate,
    customer_phones: detectedPhones,
    customer_gstins: detectedGstins,
    items: parsedItems,
    raw_text: fullTextToUse,
    parser_type: parserType,
    confidence,
  };
}
