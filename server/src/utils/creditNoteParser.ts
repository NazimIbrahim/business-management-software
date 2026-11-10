import { extractCoordinateTextItems, ParsedInvoiceItem } from './pdfTableParser';
import { normalizeCeramicName } from './fuzzyItemMatcher';

export interface ParsedCreditNote {
  credit_note_number: string;
  credit_note_date: string | null;
  customer_phones: string[];
  customer_gstins: string[];
  items: ParsedInvoiceItem[];
  raw_text: string;
  confidence: number;
}

/**
 * Parses Credit Note PDFs (Tally, ERP, GST format) for damage/breakage replacements
 */
export async function parseCreditNotePdf(pdfBuffer: Buffer): Promise<ParsedCreditNote> {
  const { items: allItems, fullText } = await extractCoordinateTextItems(pdfBuffer);

  // 1. Extract Credit Note Number
  let creditNoteNumber = '';
  const cnMatches = [
    /(?:credit\s*note\s*(?:no|number|#)?|cn\s*(?:no|number|#)?)\s*[:.\-]?\s*([A-Za-z0-9\/\-_]+)/i,
    /(?:credit\s*memo\s*(?:no|number|#)?)\s*[:.\-]?\s*([A-Za-z0-9\/\-_]+)/i,
    /\b(CN[-_][0-9]{4}[-_][0-9]+)\b/i,
    /\b(CR[-_][0-9]+)\b/i,
  ];

  for (const regex of cnMatches) {
    const match = fullText.match(regex);
    if (match && match[1] && match[1].trim().length > 1) {
      creditNoteNumber = match[1].trim();
      break;
    }
  }

  // Fallback: check if standard invoice number pattern exists if marked as CREDIT NOTE
  if (!creditNoteNumber && /credit\s*note/i.test(fullText)) {
    const invMatch = fullText.match(/(?:invoice|doc(?:ument)?)\s*(?:no|#)?\s*[:.\-]?\s*([A-Za-z0-9\/\-_]+)/i);
    if (invMatch && invMatch[1]) {
      creditNoteNumber = invMatch[1].trim();
    }
  }

  if (!creditNoteNumber) {
    creditNoteNumber = `CN-${Date.now().toString().slice(-6)}`;
  }

  // 2. Extract Date
  let creditNoteDate: string | null = null;
  const dateMatch = fullText.match(/(?:date|dated)\s*[:.\-]?\s*([0-9]{1,2}[-\/.][0-9]{1,2}[-\/.][0-9]{2,4}|[0-9]{1,2}\s+[A-Za-z]{3}\s+[0-9]{4})/i);
  if (dateMatch) {
    creditNoteDate = dateMatch[1].trim();
  }

  // 3. Extract Customer Phone(s)
  const phoneRegex = /\b(?:(?:\+?91[\s\-]?)?[6-9]\d{9})\b/g;
  const rawPhones = fullText.match(phoneRegex) || [];
  const detectedPhones = Array.from(new Set(rawPhones.map((p) => p.replace(/\D/g, '').slice(-10))));

  // 4. Extract Customer GSTIN(s)
  const gstinRegex = /\b[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}\b/gi;
  const rawGstins = fullText.match(gstinRegex) || [];
  const detectedGstins = Array.from(new Set(rawGstins.map((g) => g.trim().toUpperCase())));

  // 5. Cluster Coordinate Rows for Line Items
  allItems.sort((a, b) => b.y - a.y || a.x - b.x);

  interface RowCluster {
    y: number;
    items: typeof allItems;
    rowText: string;
  }

  const rows: RowCluster[] = [];
  let currentRow: typeof allItems = [];
  let currentY = -9999;

  for (const item of allItems) {
    if (currentY === -9999 || Math.abs(item.y - currentY) <= 4.0) {
      currentRow.push(item);
      currentY = item.y;
    } else {
      if (currentRow.length > 0) {
        currentRow.sort((a, b) => a.x - b.x);
        rows.push({
          y: currentY,
          items: currentRow,
          rowText: currentRow.map((it) => it.str).join(' '),
        });
      }
      currentRow = [item];
      currentY = item.y;
    }
  }
  if (currentRow.length > 0) {
    currentRow.sort((a, b) => a.x - b.x);
    rows.push({
      y: currentY,
      items: currentRow,
      rowText: currentRow.map((it) => it.str).join(' '),
    });
  }

  // Find table header row
  let headerRowIndex = -1;
  for (let i = 0; i < rows.length; i++) {
    const text = rows[i].rowText.toLowerCase();
    const hasDesc = text.includes('description') || text.includes('particulars') || text.includes('item');
    const hasQty = text.includes('qty') || text.includes('quantity') || text.includes('returned') || text.includes('damaged');
    if (hasDesc && hasQty) {
      headerRowIndex = i;
      break;
    }
  }

  const extractedItems: ParsedInvoiceItem[] = [];

  if (headerRowIndex !== -1) {
    const headerRow = rows[headerRowIndex];
    let descMinX = 0;
    let descMaxX = 250;
    let qtyMinX = 250;
    let qtyMaxX = 400;

    for (const hItem of headerRow.items) {
      const lower = hItem.str.toLowerCase();
      if (lower.includes('desc') || lower.includes('particular')) {
        descMinX = hItem.x - 10;
      } else if (lower.includes('qty') || lower.includes('quantity')) {
        qtyMinX = hItem.x - 15;
        descMaxX = hItem.x - 5;
        qtyMaxX = hItem.x + 80;
      }
    }

    // Process rows after header
    for (let r = headerRowIndex + 1; r < rows.length; r++) {
      const row = rows[r];
      const rowTextLower = row.rowText.toLowerCase();

      // Stop on total summary rows
      if (
        rowTextLower.startsWith('total') ||
        rowTextLower.includes('amount chargeable') ||
        rowTextLower.includes('tax amount') ||
        rowTextLower.includes('sub total') ||
        rowTextLower.includes('grand total')
      ) {
        break;
      }

      // Collect description text & quantity
      const descTokens: string[] = [];
      const qtyTokens: string[] = [];

      for (const item of row.items) {
        if (item.x >= descMinX && item.x < descMaxX) {
          descTokens.push(item.str);
        } else if (item.x >= qtyMinX && item.x <= qtyMaxX) {
          qtyTokens.push(item.str);
        }
      }

      const rawDesc = descTokens.join(' ').replace(/^[\d.)\s]+/, '').trim();
      const qtyStr = qtyTokens.join(' ').trim();

      // Parse quantity
      const qtyNumMatch = qtyStr.match(/(\d+(?:\.\d+)?)/);
      if (rawDesc.length > 2 && qtyNumMatch) {
        const qty = parseFloat(qtyNumMatch[1]);
        if (qty > 0) {
          const unitMatch = qtyStr.match(/\b(box(?:es)?|sqft|sqm|pcs|nos)\b/i);
          const unit = unitMatch ? unitMatch[1].toUpperCase() : 'BOX';

          extractedItems.push({
            raw_description: rawDesc,
            clean_description: normalizeCeramicName(rawDesc),
            quantity: qty,
            unit,
            raw_line: row.rowText,
          });
        }
      }
    }
  }

  // Fallback: If coordinate table parsing didn't find items, use line-by-line regex
  if (extractedItems.length === 0) {
    const lines = fullText.split('\n');
    for (const line of lines) {
      const lineTrim = line.trim();
      if (!lineTrim || /total|chargeable|taxable|gst|invoice/i.test(lineTrim)) continue;

      const itemRegex = /(?:^\d+[\s.)]+)?([A-Za-z0-9\s*xX\-_]{3,45})\s+(?:6907\s+)?(\d+(?:\.\d+)?)\s*(BOX(?:ES)?|SQFT|PCS|NOS)?/i;
      const match = lineTrim.match(itemRegex);
      if (match) {
        const desc = match[1].trim();
        const qty = parseFloat(match[2]);
        const unit = (match[3] || 'BOX').toUpperCase();
        if (desc.length > 2 && qty > 0 && !/credit|note|date|dated|buyer|amount/i.test(desc)) {
          extractedItems.push({
            raw_description: desc,
            clean_description: normalizeCeramicName(desc),
            quantity: qty,
            unit,
            raw_line: lineTrim,
          });
        }
      }
    }
  }

  return {
    credit_note_number: creditNoteNumber,
    credit_note_date: creditNoteDate,
    customer_phones: detectedPhones,
    customer_gstins: detectedGstins,
    items: extractedItems,
    raw_text: fullText,
    confidence: extractedItems.length > 0 ? 0.95 : 0.6,
  };
}
