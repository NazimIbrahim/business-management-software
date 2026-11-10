import { parseTaxInvoiceWithCoordinates, ParsedInvoiceItem } from './pdfTableParser';
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
 * Powered by coordinate table parser with dedicated Credit Note reference extraction
 */
export async function parseCreditNotePdf(pdfBuffer: Buffer): Promise<ParsedCreditNote> {
  const invRes = await parseTaxInvoiceWithCoordinates(pdfBuffer);
  const fullText = invRes.raw_text || '';

  // 1. Extract Credit Note Number
  let creditNoteNumber = '';
  const cnMatches = [
    // Patterns requiring digits or explicit separators (prevents matching English words like "shows" or "details")
    /(?:credit\s*note\s*(?:no|number|#)?|cn\s*(?:no|number|#)?)\s*[:.\-]\s*([A-Za-z0-9\/\-_]+)/i,
    /(?:credit\s*note\s*(?:no|number|#))\s*[:.\-]?\s*([A-Za-z0-9\/\-_]+)/i,
    /(?:credit\s*memo\s*(?:no|number|#)?)\s*[:.\-]\s*([A-Za-z0-9\/\-_]+)/i,
    /(?:credit\s*memo\s*(?:no|number|#))\s*[:.\-]?\s*([A-Za-z0-9\/\-_]+)/i,
    /\b(CN[-_][0-9]{4}[-_][0-9]+)\b/i,
    /\b(CR[-_][0-9]+)\b/i,
    /\b(CN[0-9]+)\b/i,
    /(?:credit\s*note)\s+([A-Za-z0-9\/\-_]*\d+[A-Za-z0-9\/\-_]*)/i,
  ];

  for (const regex of cnMatches) {
    const match = fullText.match(regex);
    if (match && match[1] && match[1].trim().length > 1) {
      const candidate = match[1].trim();
      // Ensure candidate is not a common document stop word
      if (!/^(shows|the|particulars|details|date|dated|original|duplicate|buyer|amount|voucher|copy|gst|tax|memo|note)$/i.test(candidate)) {
        creditNoteNumber = candidate;
        break;
      }
    }
  }

  // Fallback 1: If document has a detected invoice/voucher number containing digits
  if (!creditNoteNumber && invRes.invoice_number && /\d/.test(invRes.invoice_number) && !invRes.invoice_number.startsWith('INV-')) {
    creditNoteNumber = invRes.invoice_number;
  }

  // Fallback 2: Check for Voucher No
  if (!creditNoteNumber) {
    const vchMatch = fullText.match(/(?:voucher|vch)\s*(?:no|number|#)?\s*[:.\-]?\s*([A-Za-z0-9\/\-_]*\d+[A-Za-z0-9\/\-_]*)/i);
    if (vchMatch && vchMatch[1]) {
      const candidate = vchMatch[1].trim();
      if (!/^(shows|the|particulars|details|date|dated)$/i.test(candidate)) {
        creditNoteNumber = candidate;
      }
    }
  }

  // Fallback 3: If still none, generate unique CN ID
  if (!creditNoteNumber) {
    creditNoteNumber = `CN-${Date.now().toString().slice(-6)}`;
  }

  // 2. Extract Date
  let creditNoteDate: string | null = invRes.invoice_date;
  if (!creditNoteDate) {
    const dateMatch = fullText.match(/(?:date|dated)\s*[:.\-]?\s*([0-9]{1,2}[-\/.][0-9]{1,2}[-\/.][0-9]{2,4}|[0-9]{1,2}\s+[A-Za-z]{3}\s+[0-9]{4})/i);
    if (dateMatch) {
      creditNoteDate = dateMatch[1].trim();
    }
  }

  // 3. Extract Items: use coordinate-parsed items from invRes
  const items: ParsedInvoiceItem[] = [...invRes.items];

  // Fallback: If coordinate table parsing found 0 items, scan lines for ceramic description + quantity
  if (items.length === 0) {
    const lines = fullText.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 5);
    for (const line of lines) {
      if (/total|credit|note|buyer|gstin|transport|vehicle|terms/i.test(line)) continue;

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
          items.push({
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

  return {
    credit_note_number: creditNoteNumber,
    credit_note_date: creditNoteDate,
    customer_phones: invRes.customer_phones,
    customer_gstins: invRes.customer_gstins,
    items,
    raw_text: fullText,
    confidence: items.length > 0 ? 0.95 : 0.5,
  };
}
