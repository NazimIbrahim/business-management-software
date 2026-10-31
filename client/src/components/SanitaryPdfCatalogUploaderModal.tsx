import React, { useState, useRef, useEffect } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.js?url';
import {
  X,
  Upload,
  FileText,
  ChevronLeft,
  ChevronRight,
  Camera,
  Check,
  AlertCircle,
  Plus,
  Trash2,
  Sparkles,
  RefreshCw,
  Search,
  Eye,
  FileSpreadsheet,
  Layers,
  ArrowRight,
  Square,
  Zap,
  CheckCircle2,
} from 'lucide-react';
import { useServer } from '../context/ServerContext';
import { SanitaryCatalogItem } from '../types';

if (typeof window !== 'undefined') {
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;
  } catch (e) {
    console.warn('Could not set PDF workerSrc:', e);
  }
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete?: () => void;
}

interface StagedItem {
  id: string;
  item_code: string;
  brand: string;
  category: string;
  item_description: string;
  mrp_price: number;
  item_image?: string;
  page_number?: number;
  hasRealPhoto?: boolean;
  isTableEntry?: boolean;
}

export const SanitaryPdfCatalogUploaderModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onImportComplete,
}) => {
  const { fetchApi } = useServer();

  const [activeTab, setActiveTab] = useState<'pdf' | 'excel'>('pdf');

  // PDF State
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [renderingPage, setRenderingPage] = useState<boolean>(false);
  const [defaultBrand, setDefaultBrand] = useState<string>('Cera');
  const [catalogName, setCatalogName] = useState<string>('');

  // Staged Items extracted from PDF or Excel
  const [stagedItems, setStagedItems] = useState<StagedItem[]>([]);
  const [isScanningPage, setIsScanningPage] = useState<boolean>(false);
  const [isScanningAll, setIsScanningAll] = useState<boolean>(false);
  const [scanProgress, setScanProgress] = useState<{ current: number; total: number; found: number } | null>(null);
  const stopScanRef = useRef<boolean>(false);
  const scannedPagesRef = useRef<Set<number>>(new Set());
  const renderScaleRef = useRef<number>(1.2);
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Manual Add Form State in Modal
  const [manualCode, setManualCode] = useState('');
  const [manualDesc, setManualDesc] = useState('');
  const [manualMrp, setManualMrp] = useState('');
  const [manualCategory, setManualCategory] = useState('Water Closet');
  const [manualImage, setManualImage] = useState('');

  // Visual Crop / Capture State
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderTaskRef = useRef<any>(null);
  const pdfInputRef = useRef<HTMLInputElement | null>(null);
  const excelInputRef = useRef<HTMLInputElement | null>(null);
  const [cropMode, setCropMode] = useState<boolean>(false);
  const [cropStart, setCropStart] = useState<{ x: number; y: number } | null>(null);
  const [cropRect, setCropRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  // Excel State
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [excelParsing, setExcelParsing] = useState(false);

  // Staged List Virtualization / Pagination & Filter State
  const [stagedSearch, setStagedSearch] = useState<string>('');
  const [stagedPage, setStagedPage] = useState<number>(1);
  const itemsPerPage = 35;

  const categories = [
    'Water Closet',
    'Wash Basin',
    'Urinal',
    'Faucet',
    'Shower',
    'Diverter',
    'Bath Accessories',
    'Kitchen Sink',
    'General',
  ];

  // Robust spatial extractor: parses codes, categories, prices, descriptions, and auto-crops photo directly above each code
  const extractItemsFromDocPage = async (
    doc: pdfjsLib.PDFDocumentProxy,
    pageNum: number,
    brandToUse: string,
    existingCanvas?: HTMLCanvasElement | null,
    renderScale: number = 1.2
  ): Promise<StagedItem[]> => {
    try {
      const page = await doc.getPage(pageNum);
      const textContent = await page.getTextContent();
      const items = textContent.items as any[];
      if (!items || items.length === 0) return [];

      // Detect category from page text
      let pageCategory = 'Water Closet';
      const headerText = items.slice(0, 50).map((it) => (it.str || '').toLowerCase()).join(' ');
      if (
        headerText.includes('cistern') ||
        headerText.includes('actuation') ||
        headerText.includes('flush plate') ||
        headerText.includes('closet') ||
        headerText.includes('ewc') ||
        headerText.includes('toilet') ||
        headerText.includes('commode') ||
        headerText.includes('squatting')
      ) {
        pageCategory = 'Water Closet';
      } else if (headerText.includes('basin') || headerText.includes('counter top') || headerText.includes('table top') || headerText.includes('vanity') || headerText.includes('sink')) {
        pageCategory = 'Wash Basin';
      } else if (headerText.includes('urinal')) {
        pageCategory = 'Urinal';
      } else if (headerText.includes('shower') || headerText.includes('overhead')) {
        pageCategory = 'Shower';
      } else if (headerText.includes('diverter')) {
        pageCategory = 'Diverter';
      } else if (headerText.includes('faucet') || headerText.includes('mixer') || headerText.includes('tap') || headerText.includes('spout') || headerText.includes('cock')) {
        pageCategory = 'Faucet';
      } else if (headerText.includes('accessories') || headerText.includes('towel') || headerText.includes('holder') || headerText.includes('soap')) {
        pageCategory = 'Bath Accessories';
      }

      // Skip pure certification / index / appendix table pages
      const first40Text = items.slice(0, 40).map((it) => (it.str || '').toLowerCase()).join(' ');
      if (
        first40Text.includes('green pro certification') ||
        first40Text.includes('list of kerovit products certified') ||
        first40Text.includes('technical data sheet') ||
        first40Text.includes('index of products') ||
        (first40Text.includes('certification') && items.length > 250)
      ) {
        return [];
      }

      // Price parser helper: handles Indian comma numbers (8,70,000), western numbers (870,000), currency prefixes, excludes dimensions
      const parsePrice = (str: string): number | null => {
        if (!str) return null;
        const trimmed = str.trim();
        if (/\b\d+\s*(?:mm|cm|m\b|inch|inches|dia|"|'|litres?)\b/i.test(trimmed)) return null;
        if (/\b\d+\s*x\s*\d+/i.test(trimmed)) return null;

        const cleaned = trimmed.replace(/[₹`]|Rs\.?|INR|MRP|Per\s*Piece/gi, '').trim();
        const m = cleaned.match(/\b\d{1,3}(?:,\d{2,3})*(?:\.\d{1,2})?\b/);
        if (m) {
          const numStr = m[0].replace(/,/g, '');
          const v = parseFloat(numStr);
          if (!isNaN(v) && v >= 100 && v <= 50000000) {
            return Math.round(v);
          }
        }
        return null;
      };

      // Extract actual PDF product images from operator list to guarantee accurate photo cropping
      interface PageImg {
        x: number;
        y: number;
        w: number;
        h: number;
        centerX: number;
        centerY: number;
      }
      const pageImages: PageImg[] = [];
      try {
        const opList = await page.getOperatorList();
        let ctmStack: number[][] = [];
        let currentCTM = [1, 0, 0, 1, 0, 0];
        const multiply = (m1: number[], m2: number[]) => [
          m1[0] * m2[0] + m1[2] * m2[1],
          m1[1] * m2[0] + m1[3] * m2[1],
          m1[0] * m2[2] + m1[2] * m2[3],
          m1[1] * m2[2] + m1[3] * m2[3],
          m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
          m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
        ];

        for (let i = 0; i < opList.fnArray.length; i++) {
          const fn = opList.fnArray[i];
          const args = opList.argsArray[i];
          if (fn === pdfjsLib.OPS.save) {
            ctmStack.push([...currentCTM]);
          } else if (fn === pdfjsLib.OPS.restore) {
            if (ctmStack.length > 0) currentCTM = ctmStack.pop()!;
          } else if (fn === pdfjsLib.OPS.transform) {
            if (Array.isArray(args) && args.length >= 6) {
              currentCTM = multiply(currentCTM, args);
            }
          } else if (
            fn === pdfjsLib.OPS.paintImageXObject ||
            fn === pdfjsLib.OPS.paintInlineImageXObject
          ) {
            const w = Math.hypot(currentCTM[0], currentCTM[1]);
            const h = Math.hypot(currentCTM[2], currentCTM[3]);
            // Exclude QR codes (small squares <=35x35) and full page backgrounds (>480 x >680)
            const isQrCode = w <= 35 && h <= 35 && Math.abs(w - h) <= 2;
            const isLarge = Math.max(w, h) >= 22 && Math.min(w, h) >= 15;
            if (
              isLarge &&
              !isQrCode &&
              (w < 480 || h < 680) &&
              !isNaN(w) &&
              !isNaN(h) &&
              isFinite(currentCTM[4]) &&
              isFinite(currentCTM[5])
            ) {
              pageImages.push({
                x: currentCTM[4],
                y: currentCTM[5],
                w,
                h,
                centerX: currentCTM[4] + w / 2,
                centerY: currentCTM[5] + h / 2,
              });
            }
          }
        }
      } catch (imgErr) {
        console.warn('Could not extract operator list images for page', pageNum, imgErr);
      }

      // Viewport and source canvas for cropping photos
      const viewport = page.getViewport({ scale: renderScale });
      let sourceCanvas: HTMLCanvasElement;
      let createdOffscreen: HTMLCanvasElement | null = null;

      if (existingCanvas && existingCanvas.width > 100) {
        sourceCanvas = existingCanvas;
      } else {
        const offscreen = document.createElement('canvas');
        offscreen.width = Math.floor(viewport.width);
        offscreen.height = Math.floor(viewport.height);
        const offCtx = offscreen.getContext('2d');
        if (offCtx) {
          offCtx.fillStyle = '#FFFFFF';
          offCtx.fillRect(0, 0, offscreen.width, offscreen.height);
          await page.render({ canvasContext: offCtx, viewport }).promise;
        }
        sourceCanvas = offscreen;
        createdOffscreen = offscreen;
      }

      // Helper to crop thumbnail from canvas
      const cropThumb = (cropPdfX: number, cropPdfY: number, cropPdfW: number, cropPdfH: number): string => {
        try {
          if (cropPdfW <= 0 || cropPdfH <= 0) return '';
          const [imgLeft, imgBottom] = viewport.convertToViewportPoint(cropPdfX, cropPdfY);
          const [imgRight, imgTop] = viewport.convertToViewportPoint(
            cropPdfX + cropPdfW,
            cropPdfY + cropPdfH
          );

          const cx = Math.max(0, Math.min(imgLeft, imgRight));
          const cy = Math.max(0, Math.min(imgTop, imgBottom));
          const cw = Math.min(sourceCanvas.width - cx, Math.abs(imgRight - imgLeft));
          const ch = Math.min(sourceCanvas.height - cy, Math.abs(imgBottom - imgTop));

          if (cw > 20 && ch > 20) {
            const thumb = document.createElement('canvas');
            thumb.width = 160;
            thumb.height = 160;
            const tCtx = thumb.getContext('2d');
            if (tCtx) {
              tCtx.fillStyle = '#FFFFFF';
              tCtx.fillRect(0, 0, 160, 160);
              const fitScale = Math.min(150 / cw, 150 / ch);
              const dw = Math.round(cw * fitScale);
              const dh = Math.round(ch * fitScale);
              const dx = Math.round((160 - dw) / 2);
              const dy = Math.round((160 - dh) / 2);
              tCtx.drawImage(sourceCanvas, cx, cy, cw, ch, dx, dy, dw, dh);
              const out = thumb.toDataURL('image/jpeg', 0.82);
              thumb.width = 0;
              thumb.height = 0;
              return out;
            }
          }
        } catch (cropErr) {
          console.warn('Failed auto-cropping photo', cropErr);
        }
        return '';
      };

      // 1. Detect Table Column Headers
      const detectedCols: Array<{ type: 'CODE' | 'DESC' | 'MRP' | 'IMAGE'; x: number; y: number; s: string }> = [];
      let headerY = 0;

      for (const it of items) {
        const s = (it.str || '').trim().toUpperCase();
        if (!it.transform) continue;
        const x = it.transform[4];
        const y = it.transform[5];
        if (y < 450) continue; // Headers are in the upper portion

        if (/^(CODE|ITEM\s*CODE|CAT(?:ALOGUE)?\s*NO\.?|PRODUCT\s*CODE|MODEL\s*NO\.?|ARTICLE\s*NO\.?|ITEM\s*NO\.?|PART\s*NO\.?)$/i.test(s)) {
          detectedCols.push({ type: 'CODE', x, y, s });
          headerY = Math.max(headerY, y);
        } else if (/^(DESCRIPTION|PRODUCT\s*DESCRIPTION|DETAILS|SPECIFICATION[S]?|PRODUCT\s*NAME|ITEM\s*DESCRIPTION|PARTICULARS|MODEL\s*DESCRIPTION)$/i.test(s)) {
          detectedCols.push({ type: 'DESC', x, y, s });
          headerY = Math.max(headerY, y);
        } else if (/^(MRP|PRICE|LIST\s*PRICE|RATE|AMOUNT|MRP\s*\(.*\)|PRICE\s*\(.*\))$/i.test(s) || s.startsWith('MRP')) {
          detectedCols.push({ type: 'MRP', x, y, s });
          headerY = Math.max(headerY, y);
        } else if (/^(MODEL|IMAGE[S]?|PHOTO[S]?|PICTURE[S]?|PRODUCT[S]?|PREVIEW)$/i.test(s)) {
          detectedCols.push({ type: 'IMAGE', x, y, s });
          headerY = Math.max(headerY, y);
        }
      }

      const colTypes: Array<'CODE' | 'DESC' | 'MRP' | 'IMAGE'> = ['CODE', 'DESC', 'MRP', 'IMAGE'];
      const cols: typeof detectedCols = [];
      for (const t of colTypes) {
        const matching = detectedCols.filter(c => c.type === t && Math.abs(c.y - headerY) < 35);
        if (matching.length > 0) {
          matching.sort((a, b) => b.y - a.y);
          cols.push(matching[0]);
        }
      }

      const hasTable = cols.some(c => c.type === 'CODE') && (cols.some(c => c.type === 'DESC') || cols.some(c => c.type === 'MRP'));

      const results: StagedItem[] = [];

      if (hasTable) {
        // ============================================
        // ENGINE A: TABLE LAYOUT ENGINE (Universal Price Books)
        // ============================================
        cols.sort((a, b) => a.x - b.x);
        const colRanges: Record<string, { minX: number; maxX: number; center: number }> = {};
        for (let i = 0; i < cols.length; i++) {
          const cur = cols[i];
          const prev = i > 0 ? cols[i - 1] : null;
          const next = i + 1 < cols.length ? cols[i + 1] : null;
          const minX = prev ? (prev.x + cur.x) / 2 : 0;
          const maxX = next ? (cur.x + next.x) / 2 : 9999;
          colRanges[cur.type] = { minX, maxX, center: cur.x };
        }

        const codeRange = colRanges['CODE'];
        const descRange = colRanges['DESC'] || { minX: 100, maxX: 400, center: 250 };
        const mrpRange = colRanges['MRP'] || { minX: 450, maxX: 9999, center: 520 };
        const imgRange = colRanges['IMAGE'] || { minX: 0, maxX: Math.min(codeRange.minX, descRange.minX), center: 60 };

        // Candidates strictly from CODE column
        const tableCodeCandidates: Array<{ index: number; code: string; x: number; y: number }> = [];
        for (let i = 0; i < items.length; i++) {
          const it = items[i];
          const str = (it.str || '').trim();
          if (!str || !it.transform) continue;
          const x = it.transform[4];
          const y = it.transform[5];

          if (y < headerY - 10 && x >= codeRange.minX && x < codeRange.maxX) {
            if (/^[A-Z0-9][A-Z0-9\-_]{2,30}$/i.test(str)) {
              if (!/^(PAGE|FINISH|COLOR|WHITE|TOTAL|NOTE|INR|RS|MRP|SL|NO)$/i.test(str)) {
                tableCodeCandidates.push({ index: i, code: str, x, y });
              }
            }
          }
        }

        // Sort descending Y
        tableCodeCandidates.sort((a, b) => b.y - a.y);

        for (let cIdx = 0; cIdx < tableCodeCandidates.length; cIdx++) {
          const cand = tableCodeCandidates[cIdx];
          const prevY = cIdx > 0 ? tableCodeCandidates[cIdx - 1].y : headerY;
          const nextY = cIdx + 1 < tableCodeCandidates.length ? tableCodeCandidates[cIdx + 1].y : 20;

          const rowTop = (prevY + cand.y) / 2;
          const rowBottom = (cand.y + nextY) / 2;

          // Extract description from DESC column within row slice
          const rowDescItems: Array<{ str: string; x: number; y: number }> = [];
          for (const it of items) {
            const s = (it.str || '').trim();
            if (!s || !it.transform) continue;
            const ix = it.transform[4];
            const iy = it.transform[5];

            if (iy < rowTop && iy >= rowBottom && ix >= descRange.minX && ix < descRange.maxX) {
              if (s !== '®' && s !== '™' && s !== '•') {
                if (
                  !s.toLowerCase().startsWith('must order') &&
                  !s.toLowerCase().startsWith('floor flange') &&
                  !s.toLowerCase().startsWith('external pre-filter') &&
                  !s.toLowerCase().startsWith('plastic outlet')
                ) {
                  rowDescItems.push({ str: s, x: ix, y: iy });
                }
              }
            }
          }

          rowDescItems.sort((a, b) => (Math.abs(b.y - a.y) > 3 ? b.y - a.y : a.x - b.x));
          const rowDesc = rowDescItems.map(d => d.str).join(' ').replace(/\s+/g, ' ').trim();

          // Extract MRP from MRP column within row slice
          let mrp = 0;
          for (const it of items) {
            const s = (it.str || '').trim();
            if (!s || !it.transform) continue;
            const ix = it.transform[4];
            const iy = it.transform[5];
            if (iy < rowTop && iy >= rowBottom && ix >= mrpRange.minX && ix < mrpRange.maxX) {
              const p = parsePrice(s);
              if (p && p >= 100) {
                mrp = p;
                break;
              }
            }
          }

          // Match image from IMAGE column within row vertical slice
          const rowCenterY = (rowTop + rowBottom) / 2;
          let bestImg: PageImg | null = null;
          let minDy = Infinity;
          for (const img of pageImages) {
            if (img.centerX >= imgRange.minX - 35 && img.centerX <= imgRange.maxX + 45) {
              const dy = Math.abs(img.centerY - rowCenterY);
              if (dy < Math.max(65, (rowTop - rowBottom)) && dy < minDy) {
                minDy = dy;
                bestImg = img;
              }
            }
          }

          let photoDataUrl = '';
          if (bestImg) {
            photoDataUrl = cropThumb(bestImg.x - 2, bestImg.y - 2, bestImg.w + 4, bestImg.h + 4);
          }

          results.push({
            id: Math.random().toString(36).substring(2, 9),
            item_code: cand.code,
            brand: brandToUse,
            category: pageCategory,
            item_description: rowDesc || `${brandToUse} ${cand.code} ${pageCategory}`,
            mrp_price: mrp,
            item_image: photoDataUrl,
            page_number: pageNum,
            hasRealPhoto: Boolean(bestImg && photoDataUrl && photoDataUrl.length > 500),
            isTableEntry: true,
          });
        }
      } else {
        // ============================================
        // ENGINE B: CARD / GRID LAYOUT ENGINE (Cera Aurum, Kerovit Klassic, etc.)
        // ============================================
        const codeRegex = /\b([A-Z]{1,6}[-_]?[0-9]{2,8}[A-Z0-9\-_]*)\b/i;
        const cardCandidates: Array<{ index: number; code: string; modelTitle?: string; pdfX: number; pdfY: number }> = [];

        for (let i = 0; i < items.length; i++) {
          const it = items[i];
          const str = (it.str || '').trim();
          if (!str || !it.transform) continue;

          // Check lookback to ensure this line is not part of a multi-line compatibility/accessory note
          let isCompat = false;
          for (let lookback = 1; lookback <= 4; lookback++) {
            if (i - lookback >= 0) {
              const prevStr = (items[i - lookback].str || '').toLowerCase();
              const prevY = items[i - lookback].transform[5];
              const curY = it.transform[5];
              if (Math.abs(prevY - curY) <= 35) {
                if (
                  prevStr.includes('compatible') ||
                  prevStr.includes('suitable') ||
                  prevStr.includes('comp.') ||
                  prevStr.includes('fits with') ||
                  prevStr.includes('use with') ||
                  prevStr.includes('matches with') ||
                  prevStr.includes('must order')
                ) {
                  isCompat = true;
                  break;
                }
              }
            }
          }
          if (isCompat) continue;

          // Skip non-product accessory notes and parenthesized strings
          const lowerStr = str.toLowerCase();
          if (
            lowerStr.startsWith('with ') ||
            lowerStr.includes('(comp') ||
            lowerStr.includes('compatible with') ||
            lowerStr.includes('suitable for') ||
            lowerStr.includes('fits with') ||
            lowerStr.startsWith('page') ||
            str.startsWith('&') ||
            str.startsWith('+') ||
            str.startsWith(',') ||
            str.includes(',') ||
            (str.includes('&') && !str.includes(' - ')) ||
            (str.startsWith('(') && str.endsWith(')'))
          ) {
            continue;
          }

          const m = str.match(codeRegex);
          if (m) {
            const codePart = m[1].toUpperCase();
            if (
              codePart === 'FAUCET' ||
              codePart === 'SANITARYWARE' ||
              codePart === 'ROUGH-IN' ||
              codePart.startsWith('SIZE') ||
              codePart.length < 4
            ) {
              continue;
            }

            const cleanCode = str.includes('/')
              ? str.split('/').map((s: string) => s.trim()).filter(Boolean).join(' / ')
              : codePart;

            let modelTitle = '';
            if (str.includes(' - ')) {
              const parts = str.split(' - ');
              if (parts[0] && parts[0].trim().length >= 3 && !parts[0].match(codeRegex)) {
                modelTitle = parts[0].trim();
              }
            }

            if (!cardCandidates.some((c) => c.code === cleanCode)) {
              cardCandidates.push({
                index: i,
                code: cleanCode,
                modelTitle,
                pdfX: it.transform[4],
                pdfY: it.transform[5],
              });
            }
          }
        }

        // CRITICAL FIX: Sort candidates by descending Y (top to bottom)
        cardCandidates.sort((a, b) => b.pdfY - a.pdfY);

        interface ClusterInfo {
          cluster: typeof cardCandidates;
          matchedImg: PageImg | null;
        }
        const clusters: ClusterInfo[] = [];
        let curCluster: typeof cardCandidates = [];

        for (let i = 0; i < cardCandidates.length; i++) {
          const cand = cardCandidates[i];
          if (curCluster.length === 0) {
            curCluster.push(cand);
          } else {
            const last = curCluster[curCluster.length - 1];
            const dy = Math.abs(last.pdfY - cand.pdfY);
            const dx = Math.abs(last.pdfX - cand.pdfX);
            if (dy <= 18 && dx <= 35) {
              curCluster.push(cand);
            } else {
              clusters.push({ cluster: curCluster, matchedImg: null });
              curCluster = [cand];
            }
          }
        }
        if (curCluster.length > 0) clusters.push({ cluster: curCluster, matchedImg: null });

        // Match the best image for each cluster
        for (const cl of clusters) {
          const minY = Math.min(...cl.cluster.map((c) => c.pdfY));
          const maxY = Math.max(...cl.cluster.map((c) => c.pdfY));
          const avgX = cl.cluster.reduce((sum, c) => sum + c.pdfX, 0) / cl.cluster.length;
          const centerY = (minY + maxY) / 2;

          let bestImg: PageImg | null = null;
          let bestDist = Infinity;
          for (const img of pageImages) {
            const isLeft =
              img.x < avgX &&
              img.x >= avgX - 450 &&
              centerY >= img.y - 45 &&
              centerY <= img.y + img.h + 45;

            const isAbove =
              img.y >= maxY - 20 &&
              img.y <= maxY + 220 &&
              Math.abs(img.centerX - avgX) <= 120;

            if (isLeft || isAbove) {
              const dist = Math.hypot(img.centerX - avgX, img.centerY - centerY);
              if (dist < bestDist) {
                bestDist = dist;
                bestImg = img;
              }
            }
          }
          cl.matchedImg = bestImg;
        }

        for (const cl of clusters) {
          const clusterImg = cl.matchedImg;

          for (const cand of cl.cluster) {
            let descLines: string[] = cand.modelTitle ? [cand.modelTitle] : [];
            let mrp = 0;

            // Row price matching
            for (let j = 0; j < items.length; j++) {
              const it = items[j];
              if (!it.str || !it.transform) continue;
              const iy = it.transform[5];
              const ix = it.transform[4];
              if (Math.abs(iy - cand.pdfY) <= 8 && ix >= cand.pdfX - 20) {
                const p = parsePrice(it.str);
                if (p && p >= 100) {
                  mrp = p;
                  break;
                }
              }
            }

            // Card price below
            if (!mrp) {
              for (let j = 0; j < items.length; j++) {
                const it = items[j];
                if (!it.str || !it.transform) continue;
                const iy = it.transform[5];
                const ix = it.transform[4];
                const dy = cand.pdfY - iy;
                const dx = Math.abs(ix - cand.pdfX);
                if (dy > 0 && dy <= 85 && dx <= 140) {
                  const p = parsePrice(it.str);
                  if (p && p >= 100) {
                    mrp = p;
                    break;
                  }
                }
              }
            }

            // Sibling description text
            for (let j = 0; j < items.length; j++) {
              if (j === cand.index) continue;
              const it = items[j];
              const str = (it.str || '').trim();
              if (!str || !it.transform) continue;

              const ix = it.transform[4];
              const iy = it.transform[5];
              const dx = ix - cand.pdfX;
              const dy = cand.pdfY - iy;

              if (dx >= -40 && dx <= 160 && dy > 0 && dy < 75) {
                const lower = str.toLowerCase();
                if (
                  str !== '`' &&
                  str !== '₹' &&
                  !lower.startsWith('per piece') &&
                  !lower.startsWith('also available') &&
                  !lower.includes('compatible') &&
                  !lower.includes('suitable') &&
                  !str.match(codeRegex) &&
                  !parsePrice(str)
                ) {
                  descLines.push(str);
                }
              }
            }

            // Fallback block title
            if (descLines.length === 0) {
              for (let j = 0; j < items.length; j++) {
                if (j === cand.index) continue;
                const it = items[j];
                if (!it.str || !it.transform) continue;
                const iy = it.transform[5];
                const ix = it.transform[4];
                const dy = cand.pdfY - iy;
                const dx = Math.abs(ix - cand.pdfX);
                if (dy > 0 && dy <= 160 && dx <= 70) {
                  const s = (it.str || '').trim();
                  const sl = s.toLowerCase();
                  if (
                    s.length >= 6 &&
                    !s.includes('/') &&
                    !sl.startsWith('also available') &&
                    !sl.includes('compatible') &&
                    !sl.includes('suitable') &&
                    !codeRegex.test(s) &&
                    !parsePrice(s)
                  ) {
                    descLines.push(s);
                    break;
                  }
                }
              }
            }

            let cleanDesc = descLines.join(' ').replace(/\s+/g, ' ').trim();
            cleanDesc = cleanDesc.replace(/\s*\((?:comp|suitable)[^)]*(?:\)|$)/gi, '').trim();
            cleanDesc = cleanDesc.replace(/\s*(?:compatible with|suitable for).*/gi, '').trim();
            cleanDesc = cleanDesc.replace(/\s*also available.*/gi, '').trim();

            // Always ensure cand.modelTitle (e.g. ABRIN, HALO, EVORA) is prominently included
            if (cand.modelTitle) {
              if (!cleanDesc.toUpperCase().includes(cand.modelTitle.toUpperCase())) {
                cleanDesc = cleanDesc ? `${cand.modelTitle} - ${cleanDesc}` : `${cand.modelTitle} ${brandToUse} ${pageCategory}`;
              }
            }

            if (!cleanDesc) {
              cleanDesc = `${brandToUse} ${cand.code} ${pageCategory}`;
            }

            let photoDataUrl = '';
            if (clusterImg) {
              photoDataUrl = cropThumb(clusterImg.x - 2, clusterImg.y - 2, clusterImg.w + 4, clusterImg.h + 4);
            } else {
              photoDataUrl = cropThumb(cand.pdfX - 10, cand.pdfY + 12, 104, 88);
            }

            results.push({
              id: Math.random().toString(36).substring(2, 9),
              item_code: cand.code,
              brand: brandToUse,
              category: pageCategory,
              item_description: cleanDesc,
              mrp_price: mrp,
              item_image: photoDataUrl,
              page_number: pageNum,
              hasRealPhoto: Boolean(clusterImg && photoDataUrl && photoDataUrl.length > 500),
              isTableEntry: false,
            });
          }
        }
      }

      // Explicitly release offscreen canvas and PDF page memory to prevent leaks
      if (createdOffscreen) {
        createdOffscreen.width = 0;
        createdOffscreen.height = 0;
      }
      try {
        page.cleanup();
      } catch (_) {}

      return results;
    } catch (e) {
      console.error(`Error scanning page ${pageNum}:`, e);
      return [];
    }
  };

  // 1. Handle PDF Selection - AUTOMATICALLY SCANS ALL PAGES
  const handleSelectPdf = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    setImportSuccess(null);
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setError('Please select a valid PDF file.');
      return;
    }

    setPdfFile(file);
    setCatalogName(file.name);

    // Auto-detect brand from filename
    const lowerName = file.name.toLowerCase();
    let detectedBrand = 'Cera';
    if (lowerName.includes('kerovit') || lowerName.includes('klassic')) {
      detectedBrand = 'KEROVIT';
    } else if (lowerName.includes('cera')) {
      detectedBrand = 'Cera';
    } else if (lowerName.includes('jaquar')) {
      detectedBrand = 'Jaquar';
    } else if (lowerName.includes('kohler')) {
      detectedBrand = 'Kohler';
    } else if (lowerName.includes('hindware')) {
      detectedBrand = 'Hindware';
    } else if (lowerName.includes('somany')) {
      detectedBrand = 'Somany';
    } else if (lowerName.includes('parryware')) {
      detectedBrand = 'Parryware';
    }
    setDefaultBrand(detectedBrand);

    try {
      const buffer = await file.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: buffer });
      const loadedPdf = await loadingTask.promise;
      setPdfDoc(loadedPdf);
      setNumPages(loadedPdf.numPages);
      scannedPagesRef.current.clear();

      // Find first page that contains product codes to render visually on canvas, and detect brand from content if needed
      let initialPage = 1;
      const codeRegex = /\b([A-Z]{1,6}[-_]?[0-9]{2,8}[A-Z0-9\-_]*)\b/i;
      let brandFoundInContent = false;

      for (let p = 1; p <= Math.min(25, loadedPdf.numPages); p++) {
        try {
          const pg = await loadedPdf.getPage(p);
          const tc = await pg.getTextContent();
          const pageTxt = tc.items.map((it: any) => (it.str || '').toLowerCase()).join(' ');

          if (!brandFoundInContent && (!lowerName.includes('cera') && detectedBrand === 'Cera')) {
            if (pageTxt.includes('kohler')) {
              detectedBrand = 'Kohler';
              brandFoundInContent = true;
            } else if (pageTxt.includes('kerovit') || pageTxt.includes('klassic')) {
              detectedBrand = 'KEROVIT';
              brandFoundInContent = true;
            } else if (pageTxt.includes('jaquar')) {
              detectedBrand = 'Jaquar';
              brandFoundInContent = true;
            } else if (pageTxt.includes('hindware')) {
              detectedBrand = 'Hindware';
              brandFoundInContent = true;
            } else if (pageTxt.includes('parryware')) {
              detectedBrand = 'Parryware';
              brandFoundInContent = true;
            } else if (pageTxt.includes('somany')) {
              detectedBrand = 'Somany';
              brandFoundInContent = true;
            } else if (pageTxt.includes('toto')) {
              detectedBrand = 'TOTO';
              brandFoundInContent = true;
            } else if (pageTxt.includes('grohe')) {
              detectedBrand = 'Grohe';
              brandFoundInContent = true;
            }
          }

          const hasCode = tc.items.some((it: any) => {
            const s = (it.str || '').trim();
            return s.length >= 4 && codeRegex.test(s) && !s.toLowerCase().includes('page');
          });
          if (hasCode && initialPage === 1) {
            initialPage = p;
          }
        } catch (_) {}
      }

      setDefaultBrand(detectedBrand);
      setCurrentPage(initialPage);

      // Render initial page on canvas
      setTimeout(() => {
        renderPage(initialPage, loadedPdf);
      }, 50);

      // AUTOMATICALLY SCAN ENTIRE CATALOGUE IMMEDIATELY (ALL PAGES)
      setTimeout(() => {
        startFullCatalogueScan(loadedPdf, detectedBrand);
      }, 150);
    } catch (err: any) {
      setError('Failed to load PDF document: ' + err.message);
    }
  };

  // 2. Render Page to Canvas
  const renderPage = async (pageNum: number, docOverride?: pdfjsLib.PDFDocumentProxy) => {
    const doc = docOverride || pdfDoc;
    if (!doc) return;

    // Cancel any previous in-progress page render
    if (renderTaskRef.current) {
      try {
        renderTaskRef.current.cancel();
      } catch (_) {}
      renderTaskRef.current = null;
    }

    setRenderingPage(true);
    setCropRect(null);

    try {
      const page = await doc.getPage(pageNum);
      const canvas = canvasRef.current;
      if (!canvas) {
        setRenderingPage(false);
        return;
      }

      // Calculate scale to fit container width nicely (~540px)
      const unscaledViewport = page.getViewport({ scale: 1.0 });
      const desiredWidth = 540;
      const scale = Math.max(0.8, Math.min(2.0, desiredWidth / unscaledViewport.width));
      renderScaleRef.current = scale;
      const viewport = page.getViewport({ scale });

      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        setRenderingPage(false);
        return;
      }

      // Fill pure white background behind the page
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const renderContext = {
        canvasContext: ctx,
        viewport,
      };

      const task = page.render(renderContext);
      renderTaskRef.current = task;
      await task.promise;
      renderTaskRef.current = null;
    } catch (err: any) {
      if (err?.name !== 'RenderingCancelledException') {
        console.error('Page render error:', err);
      }
    } finally {
      setRenderingPage(false);
    }
  };

  useEffect(() => {
    if (!pdfDoc || !currentPage || isScanningAll) return;
    const timer = setTimeout(async () => {
      await renderPage(currentPage);
      // Auto-extract current page if not already scanned
      if (!scannedPagesRef.current.has(currentPage)) {
        try {
          const autoItems = await extractItemsFromDocPage(
            pdfDoc,
            currentPage,
            defaultBrand,
            canvasRef.current,
            renderScaleRef.current || 1.2
          );
          if (autoItems.length > 0) {
            scannedPagesRef.current.add(currentPage);
            setStagedItems((prev) => {
              const next = [...prev];
              for (const item of autoItems) {
                const codeKey = item.item_code.trim().toUpperCase();
                const existingIdx = next.findIndex(
                  (it) => it.item_code.trim().toUpperCase() === codeKey
                );
                if (existingIdx >= 0) {
                  const existing = next[existingIdx];
                  const existingHasPhoto = Boolean(existing.hasRealPhoto || (existing.item_image && existing.item_image.length > 500 && !existing.isTableEntry));
                  const incomingHasPhoto = Boolean(item.hasRealPhoto || (item.item_image && item.item_image.length > 500 && !item.isTableEntry));

                  if (existingHasPhoto && !incomingHasPhoto) {
                    // DO NOT overwrite real product card with table or photo-less item
                    if ((!existing.mrp_price || existing.mrp_price === 0) && item.mrp_price > 0) {
                      existing.mrp_price = item.mrp_price;
                    }
                  } else {
                    next[existingIdx] = {
                      ...existing,
                      ...item,
                      item_image: incomingHasPhoto ? item.item_image : existing.item_image,
                      item_description: (item.item_description && item.item_description.length > 5 && !item.isTableEntry)
                        ? item.item_description
                        : existing.item_description,
                      mrp_price: item.mrp_price > 0 ? item.mrp_price : existing.mrp_price,
                      hasRealPhoto: existingHasPhoto || incomingHasPhoto,
                    };
                  }
                } else {
                  next.unshift(item);
                }
              }
              return next;
            });
            setImportSuccess(
              `Auto-detected ${autoItems.length} products on Page ${currentPage}!`
            );
          }
        } catch (_) {}
      }
    }, 80);
    return () => clearTimeout(timer);
  }, [pdfDoc, currentPage, isScanningAll]);

  // 3. Scan Current Page for Item Codes, Descriptions & MRP Prices
  const handleAutoScanCurrentPage = async () => {
    if (!pdfDoc) return;
    setIsScanningPage(true);
    setError(null);

    try {
      const newItems = await extractItemsFromDocPage(
        pdfDoc,
        currentPage,
        defaultBrand,
        canvasRef.current,
        renderScaleRef.current || 1.2
      );

      if (newItems.length > 0) {
        scannedPagesRef.current.add(currentPage);
        setStagedItems((prev) => {
          const next = [...prev];
          for (const item of newItems) {
            const codeKey = item.item_code.trim().toUpperCase();
            const existingIdx = next.findIndex(
              (it) => it.item_code.trim().toUpperCase() === codeKey
            );
            if (existingIdx >= 0) {
              const existing = next[existingIdx];
              const existingHasPhoto = Boolean(existing.hasRealPhoto || (existing.item_image && existing.item_image.length > 500 && !existing.isTableEntry));
              const incomingHasPhoto = Boolean(item.hasRealPhoto || (item.item_image && item.item_image.length > 500 && !item.isTableEntry));

              if (existingHasPhoto && !incomingHasPhoto) {
                if ((!existing.mrp_price || existing.mrp_price === 0) && item.mrp_price > 0) {
                  existing.mrp_price = item.mrp_price;
                }
              } else {
                next[existingIdx] = {
                  ...existing,
                  ...item,
                  item_image: incomingHasPhoto ? item.item_image : existing.item_image,
                  item_description: (item.item_description && item.item_description.length > 5 && !item.isTableEntry)
                    ? item.item_description
                    : existing.item_description,
                  mrp_price: item.mrp_price > 0 ? item.mrp_price : existing.mrp_price,
                  hasRealPhoto: existingHasPhoto || incomingHasPhoto,
                };
              }
            } else {
              next.unshift(item);
            }
          }
          return next;
        });
        setImportSuccess(`Auto-detected ${newItems.length} items with photos on Page ${currentPage}!`);
      } else {
        setError(`No recognized product codes found on page ${currentPage}. You can draw a box with "Crop Photo" or use Quick Add.`);
      }
    } catch (err: any) {
      setError('Page text extraction failed: ' + err.message);
    } finally {
      setIsScanningPage(false);
    }
  };

  // 4. Scan Entire Catalogue (All Pages)
  const startFullCatalogueScan = async (
    docOverride?: pdfjsLib.PDFDocumentProxy,
    brandOverride?: string
  ) => {
    const doc = docOverride || pdfDoc;
    const brandToUse = brandOverride || defaultBrand;
    if (!doc || isScanningAll) return;

    setIsScanningAll(true);
    stopScanRef.current = false;
    setError(null);
    setImportSuccess(null);

    let allExtracted: StagedItem[] = [...stagedItems];

    try {
      for (let p = 1; p <= doc.numPages; p++) {
        if (stopScanRef.current) {
          break;
        }

        setScanProgress({
          current: p,
          total: doc.numPages,
          found: allExtracted.length,
        });

        const pageItems = await extractItemsFromDocPage(
          doc,
          p,
          brandToUse,
          null, // uses offscreen canvas
          1.2
        );

        if (pageItems.length > 0) {
          scannedPagesRef.current.add(p);
          for (const item of pageItems) {
            const codeKey = item.item_code.trim().toUpperCase();
            const existingIdx = allExtracted.findIndex(
              (it) => it.item_code.trim().toUpperCase() === codeKey
            );
            if (existingIdx >= 0) {
              const existing = allExtracted[existingIdx];
              const existingHasPhoto = Boolean(existing.hasRealPhoto || (existing.item_image && existing.item_image.length > 500 && !existing.isTableEntry));
              const incomingHasPhoto = Boolean(item.hasRealPhoto || (item.item_image && item.item_image.length > 500 && !item.isTableEntry));

              if (existingHasPhoto && !incomingHasPhoto) {
                if ((!existing.mrp_price || existing.mrp_price === 0) && item.mrp_price > 0) {
                  existing.mrp_price = item.mrp_price;
                }
              } else {
                allExtracted[existingIdx] = {
                  ...existing,
                  ...item,
                  item_image: incomingHasPhoto ? item.item_image : existing.item_image,
                  item_description: (item.item_description && item.item_description.length > 5 && !item.isTableEntry)
                    ? item.item_description
                    : existing.item_description,
                  mrp_price: item.mrp_price > 0 ? item.mrp_price : existing.mrp_price,
                  hasRealPhoto: existingHasPhoto || incomingHasPhoto,
                };
              }
            } else {
              allExtracted.push(item);
            }
          }

          // Batch React state updates every 5 pages or on final page to prevent DOM thrashing
          if (p % 5 === 0 || p === doc.numPages) {
            setStagedItems([...allExtracted]);
          }
        }

        // Allow UI to breathe
        await new Promise((resolve) => setTimeout(resolve, 15));
      }

      setStagedItems([...allExtracted]);
      setImportSuccess(
        `✅ Entire catalogue scanned! Auto-detected ${allExtracted.length} products with photos. Click "Save Items to Catalog" to commit.`
      );
    } catch (err: any) {
      setError('Catalogue scan interrupted: ' + err.message);
    } finally {
      setIsScanningAll(false);
      setScanProgress(null);
    }
  };

  const handleScanEntireCatalogue = () => {
    startFullCatalogueScan();
  };

  // 4. Visual Canvas Cropping Handlers
  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!cropMode) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    setCropStart({ x, y });
    setCropRect({ x, y, w: 0, h: 0 });
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!cropMode || !cropStart) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const curX = (e.clientX - rect.left) * scaleX;
    const curY = (e.clientY - rect.top) * scaleY;

    const x = Math.min(cropStart.x, curX);
    const y = Math.min(cropStart.y, curY);
    const w = Math.abs(curX - cropStart.x);
    const h = Math.abs(curY - cropStart.y);

    setCropRect({ x, y, w, h });
  };

  const handleCanvasMouseUp = () => {
    if (!cropMode || !cropRect || cropRect.w < 10 || cropRect.h < 10) {
      setCropStart(null);
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    // Crop the selected region to a dedicated canvas
    try {
      const cropCanvas = document.createElement('canvas');
      const maxDim = 280;
      const ratio = Math.min(maxDim / cropRect.w, maxDim / cropRect.h, 1);
      cropCanvas.width = Math.round(cropRect.w * ratio);
      cropCanvas.height = Math.round(cropRect.h * ratio);

      const ctx = cropCanvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, cropCanvas.width, cropCanvas.height);
        ctx.drawImage(
          canvas,
          cropRect.x,
          cropRect.y,
          cropRect.w,
          cropRect.h,
          0,
          0,
          cropCanvas.width,
          cropCanvas.height
        );
        const dataUrl = cropCanvas.toDataURL('image/jpeg', 0.85);

        // Assign to the latest staged item or manual form
        if (stagedItems.length > 0) {
          setStagedItems((prev) => {
            const copy = [...prev];
            copy[copy.length - 1].item_image = dataUrl;
            return copy;
          });
          setImportSuccess('Cropped photo linked to item ' + stagedItems[stagedItems.length - 1].item_code);
        } else {
          setManualImage(dataUrl);
          setImportSuccess('Photo cropped! Enter Item Code & Description in the form to add it.');
        }
      }
    } catch (err) {
      console.error('Crop error:', err);
    }

    setCropStart(null);
    setCropMode(false);
  };

  // 5. Add Manual Item to Staged List
  const handleAddManualItem = () => {
    if (!manualCode.trim()) {
      setError('Please provide an Item Code.');
      return;
    }

    const newItem: StagedItem = {
      id: Math.random().toString(36).substring(2, 9),
      item_code: manualCode.trim().toUpperCase(),
      brand: defaultBrand || 'Sanitary',
      category: manualCategory,
      item_description: manualDesc.trim() || `${defaultBrand} ${manualCode.trim()}`,
      mrp_price: parseFloat(manualMrp) || 0,
      item_image: manualImage || (canvasRef.current ? canvasRef.current.toDataURL('image/jpeg', 0.7) : ''),
      page_number: currentPage,
    };

    setStagedItems((prev) => {
      const codeKey = newItem.item_code.trim().toUpperCase();
      const existingIdx = prev.findIndex(
        (it) => it.item_code.trim().toUpperCase() === codeKey
      );
      if (existingIdx >= 0) {
        // REPLACE existing item with the newer data
        const copy = [...prev];
        copy[existingIdx] = {
          ...copy[existingIdx],
          ...newItem,
          item_image: newItem.item_image || copy[existingIdx].item_image,
        };
        return copy;
      }
      return [newItem, ...prev];
    });
    setManualCode('');
    setManualDesc('');
    setManualMrp('');
    setManualImage('');
    setError(null);
    setImportSuccess(`Added ${newItem.item_code} to staged list.`);
  };

  // 6. Delete Staged Item
  const handleDeleteStaged = (id: string) => {
    setStagedItems((prev) => prev.filter((it) => it.id !== id));
  };

  // 7. Update Staged Item Field
  const handleUpdateStaged = (id: string, field: keyof StagedItem, value: any) => {
    setStagedItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, [field]: value } : it))
    );
  };

  // 8. Excel Import Handler
  const handleSelectExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setExcelFile(file);
    setCatalogName(file.name);
    setExcelParsing(true);
    setError(null);

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const text = evt.target?.result as string;
        const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
        if (lines.length <= 1) {
          setError('Spreadsheet appears to be empty.');
          setExcelParsing(false);
          return;
        }

        const headerLine = lines[0].toLowerCase();
        const headers = headerLine.split(/,|\t/).map((h) => h.trim().replace(/^"|"$/g, ''));

        const codeIdx = headers.findIndex((h) => h.includes('code') || h.includes('sku') || h.includes('item'));
        const descIdx = headers.findIndex((h) => h.includes('desc') || h.includes('name') || h.includes('title'));
        const mrpIdx = headers.findIndex((h) => h.includes('mrp') || h.includes('price') || h.includes('rate'));
        const brandIdx = headers.findIndex((h) => h.includes('brand'));
        const catIdx = headers.findIndex((h) => h.includes('cat') || h.includes('type'));

        if (codeIdx === -1) {
          setError('Could not identify "Item Code" column in the header row.');
          setExcelParsing(false);
          return;
        }

        const parsed: StagedItem[] = [];
        for (let i = 1; i < lines.length; i++) {
          const rawRow = lines[i].split(/,|\t/).map((cell) => cell.trim().replace(/^"|"$/g, ''));
          const code = rawRow[codeIdx] || '';
          if (!code) continue;

          const desc = descIdx !== -1 ? rawRow[descIdx] : '';
          const mrpRaw = mrpIdx !== -1 ? rawRow[mrpIdx].replace(/[^0-9.]/g, '') : '0';
          const brand = brandIdx !== -1 ? rawRow[brandIdx] : defaultBrand || 'Sanitary';
          const cat = catIdx !== -1 ? rawRow[catIdx] : 'General';

          parsed.push({
            id: Math.random().toString(36).substring(2, 9),
            item_code: code.toUpperCase(),
            brand: brand || defaultBrand,
            category: cat || 'General',
            item_description: desc || `${brand} ${code}`,
            mrp_price: parseFloat(mrpRaw) || 0,
            item_image: '',
            page_number: 1,
          });
        }

        setStagedItems((prev) => {
          const next = [...prev];
          for (const item of parsed) {
            const codeKey = item.item_code.trim().toUpperCase();
            const existingIdx = next.findIndex(
              (it) => it.item_code.trim().toUpperCase() === codeKey
            );
            if (existingIdx >= 0) {
              next[existingIdx] = {
                ...next[existingIdx],
                ...item,
                item_image: item.item_image || next[existingIdx].item_image,
              };
            } else {
              next.push(item);
            }
          }
          return next;
        });
        setImportSuccess(`Imported ${parsed.length} items from ${file.name}!`);
      } catch (err: any) {
        setError('Failed to parse spreadsheet: ' + err.message);
      } finally {
        setExcelParsing(false);
      }
    };
    reader.readAsText(file);
  };

  // 9. Batch Save to Database (in safe 50-item chunks)
  const handleSaveToCatalog = async () => {
    if (stagedItems.length === 0) {
      setError('No staged items to save.');
      return;
    }

    setIsImporting(true);
    setError(null);
    setImportSuccess(null);

    try {
      const BATCH_CHUNK_SIZE = 50;
      let totalSaved = 0;

      for (let i = 0; i < stagedItems.length; i += BATCH_CHUNK_SIZE) {
        const chunk = stagedItems.slice(i, i + BATCH_CHUNK_SIZE);
        setImportSuccess(
          `Saving to database: ${Math.min(i + BATCH_CHUNK_SIZE, stagedItems.length)} of ${stagedItems.length} items...`
        );

        const payload = {
          catalog_name: catalogName || `${defaultBrand} Sanitary Catalogue`,
          items: chunk.map((it) => ({
            item_code: it.item_code.trim(),
            brand: it.brand.trim() || defaultBrand || 'Sanitary',
            category: it.category.trim() || 'General',
            item_description: it.item_description.trim(),
            mrp_price: it.mrp_price || 0,
            item_image: it.item_image || null,
            catalog_name: catalogName || `${defaultBrand} Sanitary Catalogue`,
            page_number: it.page_number || 1,
          })),
        };

        const res = await fetchApi<any>('/api/sanitary-catalog/batch', {
          method: 'POST',
          body: JSON.stringify(payload),
        });

        totalSaved += res.count || chunk.length;
      }

      setImportSuccess(`Success! ${totalSaved} items imported into Sanitary Catalog.`);
      setStagedItems([]);
      if (onImportComplete) {
        onImportComplete();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to save items to catalog');
    } finally {
      setIsImporting(false);
    }
  };

  if (!isOpen) return null;

  // Staged Items Filter & Safe Pagination to prevent memory/DOM bloat
  const filteredStaged = stagedItems.filter((it) => {
    if (!stagedSearch.trim()) return true;
    const q = stagedSearch.toLowerCase();
    return (
      it.item_code.toLowerCase().includes(q) ||
      it.item_description.toLowerCase().includes(q) ||
      it.category.toLowerCase().includes(q)
    );
  });
  const totalStagedPages = Math.max(1, Math.ceil(filteredStaged.length / itemsPerPage));
  const currentPageSafe = Math.min(stagedPage, totalStagedPages);
  const displayedStaged = filteredStaged.slice(
    (currentPageSafe - 1) * itemsPerPage,
    currentPageSafe * itemsPerPage
  );

  return (
    <div
      className="modal-overlay"
      style={{ backgroundColor: 'rgba(13, 27, 42, 0.75)', zIndex: 100 }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl border border-slate-300 shadow-2xl flex flex-col overflow-hidden w-[96vw] max-w-6xl h-[92vh]"
        style={{ backgroundColor: '#FFFFFF', color: '#0D1B2A' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
        <div className="px-6 py-3.5 bg-[#0D1B2A] text-white flex items-center justify-between shrink-0 border-b border-slate-700">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-teal-500/20 border border-teal-400/40 flex items-center justify-center text-teal-300">
              <FileText size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-wide flex items-center space-x-2">
                <span>Sanitary Catalogue Upload & Reference Extractor</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-teal-400 text-slate-900 font-bold font-mono">
                  Auto-Fetch Engine
                </span>
              </h2>
              <p className="text-xs text-[#CBD5E1]">
                Upload PDF manufacturer price lists or spreadsheets to auto-populate Description, Image & MRP when entering Item Codes
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2.5">
            {/* Import Mode Tabs */}
            <div className="flex items-center bg-white/10 border border-white/20 rounded-lg p-0.5 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setActiveTab('pdf')}
                className={`px-3 py-1.5 rounded-md flex items-center space-x-1.5 transition-all ${
                  activeTab === 'pdf'
                    ? 'bg-teal-500 text-slate-900 font-bold shadow-xs'
                    : 'text-[#E0E1DD] hover:text-white'
                }`}
              >
                <FileText size={13} />
                <span>PDF Catalogue</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('excel')}
                className={`px-3 py-1.5 rounded-md flex items-center space-x-1.5 transition-all ${
                  activeTab === 'excel'
                    ? 'bg-teal-500 text-slate-900 font-bold shadow-xs'
                    : 'text-[#E0E1DD] hover:text-white'
                }`}
              >
                <FileSpreadsheet size={13} />
                <span>Excel / CSV</span>
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
              title="Close modal"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Status / Alerts */}
        {error && (
          <div className="mx-6 mt-3 p-3 rounded-xl bg-rose-50 border border-rose-300 text-rose-800 text-xs font-semibold flex items-center space-x-2 shrink-0">
            <AlertCircle size={16} className="shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
        )}
        {importSuccess && (
          <div className="mx-6 mt-3 p-3 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-semibold flex items-center justify-between shrink-0 shadow-xs">
            <div className="flex items-center space-x-2">
              <Check size={16} className="shrink-0 text-emerald-600" />
              <span>{importSuccess}</span>
            </div>
            {stagedItems.length > 0 && (
              <button
                type="button"
                disabled={isImporting}
                onClick={handleSaveToCatalog}
                className="btn btn-success btn-xs px-3.5 py-1.5 font-extrabold rounded-lg text-white shadow cursor-pointer ml-3 shrink-0 flex items-center space-x-1"
                style={{
                  background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
                  color: '#FFFFFF',
                  border: '1px solid #065F46',
                }}
              >
                {isImporting ? <RefreshCw size={12} className="animate-spin text-white" /> : <Check size={12} className="text-white" />}
                <span>{isImporting ? 'Saving...' : `Save ${stagedItems.length} Items to Catalog`}</span>
              </button>
            )}
          </div>
        )}

        {/* Main Content Area */}
        <div className="flex-1 flex overflow-hidden p-4 gap-4 bg-[#F4F5F7]">
          {/* Left Column: PDF Viewer / Visual Extractor Canvas */}
          {activeTab === 'pdf' ? (
            <div
              className="w-1/2 flex flex-col bg-white border border-slate-300 rounded-xl overflow-hidden shadow-xs"
              style={{ width: '50%' }}
            >
              {/* PDF Controls Header */}
              <div className="p-3 border-b border-slate-200 bg-slate-100 flex items-center justify-between text-xs shrink-0">
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => pdfInputRef.current?.click()}
                    className="btn btn-sm bg-[#1B263B] hover:bg-[#0D1B2A] text-white font-bold inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg shadow-xs"
                  >
                    <Upload size={13} />
                    <span>{pdfFile ? 'Change PDF' : 'Select PDF File'}</span>
                  </button>
                  <input
                    ref={pdfInputRef}
                    type="file"
                    accept=".pdf"
                    className="hidden"
                    onChange={handleSelectPdf}
                  />

                  {pdfFile && (
                    <span
                      className="text-xs font-semibold text-slate-800 font-mono truncate max-w-[150px]"
                      title={pdfFile.name}
                    >
                      {pdfFile.name}
                    </span>
                  )}
                </div>

                {numPages > 0 && (
                  <div className="flex items-center space-x-1.5 bg-white px-2 py-1 rounded-lg border border-slate-300 shadow-2xs">
                    <button
                      type="button"
                      disabled={currentPage <= 1 || renderingPage}
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      className="p-1 rounded hover:bg-slate-100 disabled:opacity-40 text-slate-700"
                      title="Previous page"
                    >
                      <ChevronLeft size={15} />
                    </button>
                    <span className="text-xs font-mono font-bold text-slate-900 px-1">
                      {currentPage} / {numPages}
                    </span>
                    <button
                      type="button"
                      disabled={currentPage >= numPages || renderingPage}
                      onClick={() => setCurrentPage((p) => Math.min(numPages, p + 1))}
                      className="p-1 rounded hover:bg-slate-100 disabled:opacity-40 text-slate-700"
                      title="Next page"
                    >
                      <ChevronRight size={15} />
                    </button>
                  </div>
                )}
              </div>

              {/* Action Toolbar above Canvas */}
              {pdfDoc && (
                <>
                  <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center space-x-2">
                      <label className="text-xs font-bold text-slate-700">Brand:</label>
                      <input
                        type="text"
                        className="w-24 px-2 py-1 bg-white border border-slate-300 rounded text-slate-900 font-bold text-xs"
                        value={defaultBrand}
                        onChange={(e) => setDefaultBrand(e.target.value)}
                        placeholder="e.g. Cera"
                      />
                    </div>

                    <div className="flex items-center space-x-1.5">
                      <button
                        type="button"
                        onClick={handleAutoScanCurrentPage}
                        disabled={isScanningPage || isScanningAll}
                        className="btn btn-sm bg-indigo-600 hover:bg-indigo-700 text-white inline-flex items-center space-x-1 px-2.5 py-1 font-bold rounded-lg shadow-xs disabled:opacity-40"
                        title="Auto-detect codes, descriptions, prices and crop photos on current page"
                      >
                        <Sparkles size={13} className={isScanningPage ? 'animate-spin' : ''} />
                        <span>{isScanningPage ? 'Detecting...' : 'Auto-Detect Page'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={isScanningAll ? () => { stopScanRef.current = true; } : handleScanEntireCatalogue}
                        className={`btn btn-sm inline-flex items-center space-x-1 px-3 py-1 font-bold rounded-lg shadow-xs ${
                          isScanningAll
                            ? 'bg-rose-600 hover:bg-rose-700 text-white animate-pulse'
                            : 'bg-teal-700 hover:bg-teal-800 text-white'
                        }`}
                        title={isScanningAll ? 'Stop catalogue scan' : 'Auto-scan every page in this catalogue and auto-crop photos'}
                      >
                        {isScanningAll ? (
                          <>
                            <Square size={12} className="fill-white" />
                            <span>Stop Scan</span>
                          </>
                        ) : (
                          <>
                            <Zap size={13} />
                            <span>Scan All Pages</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => setCropMode((prev) => !prev)}
                        className={`btn btn-sm inline-flex items-center space-x-1 px-2.5 py-1 font-bold rounded-lg shadow-xs ${
                          cropMode
                            ? 'bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold'
                            : 'bg-white hover:bg-slate-100 text-slate-800 border border-slate-300'
                        }`}
                        title="Manual drag-to-crop product photo"
                      >
                        <Camera size={13} />
                        <span>{cropMode ? 'Cancel' : 'Crop'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Live Progress Bar during Catalogue Scan */}
                  {isScanningAll && scanProgress && (
                    <div className="px-3 py-2 bg-indigo-50 border-b border-indigo-200 text-xs">
                      <div className="flex items-center justify-between font-bold text-indigo-950 mb-1">
                        <span className="flex items-center space-x-1.5">
                          <RefreshCw size={12} className="animate-spin text-indigo-600" />
                          <span>Scanning Page {scanProgress.current} of {scanProgress.total}...</span>
                        </span>
                        <span className="text-teal-700 font-mono font-bold">
                          {scanProgress.found} products auto-detected
                        </span>
                      </div>
                      <div className="w-full bg-indigo-200 rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-indigo-600 h-2 rounded-full transition-all duration-150"
                          style={{
                            width: `${Math.max(3, Math.round((scanProgress.current / scanProgress.total) * 100))}%`,
                          }}
                        />
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Canvas Container with slate-700 background so white PDF page stands out */}
              <div className="flex-1 overflow-auto flex items-center justify-center p-4 relative bg-[#334155]">
                {renderingPage && (
                  <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 backdrop-blur-xs">
                    <div className="bg-white/95 px-4 py-2 rounded-xl flex items-center space-x-2 shadow-lg">
                      <RefreshCw className="animate-spin text-teal-700" size={18} />
                      <span className="text-xs font-bold text-slate-800">Rendering Page...</span>
                    </div>
                  </div>
                )}

                <div
                  className="relative shadow-2xl rounded overflow-hidden"
                  style={{ display: pdfDoc ? 'block' : 'none' }}
                >
                  <canvas
                    ref={canvasRef}
                    onMouseDown={handleCanvasMouseDown}
                    onMouseMove={handleCanvasMouseMove}
                    onMouseUp={handleCanvasMouseUp}
                    className={`max-w-full h-auto bg-white ${
                      cropMode ? 'cursor-crosshair' : 'cursor-default'
                    }`}
                  />
                  {/* Visual Crop Selection Box */}
                  {cropMode && cropRect && (
                    <div
                      className="absolute border-2 border-amber-400 bg-amber-400/30 pointer-events-none"
                      style={{
                        left: `${cropRect.x}px`,
                        top: `${cropRect.y}px`,
                        width: `${cropRect.w}px`,
                        height: `${cropRect.h}px`,
                      }}
                    />
                  )}
                </div>

                {!pdfDoc && (
                  <div className="text-center p-8 bg-white/10 rounded-2xl border border-white/20 text-slate-200">
                    <Upload size={40} className="mx-auto mb-2 text-teal-300 opacity-80" />
                    <p className="text-sm font-bold text-white">No PDF Catalogue Loaded</p>
                    <p className="text-xs text-slate-300 mt-1 max-w-xs">
                      Click "Select PDF File" above to load manufacturer catalogue (Cera, Jaquar, Kohler, Hindware, etc.)
                    </p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Excel / CSV Import Section */
            <div
              className="w-1/2 flex flex-col bg-white border border-slate-300 rounded-xl p-5 overflow-y-auto space-y-4 shadow-xs"
              style={{ width: '50%' }}
            >
              <div className="text-center p-6 border-2 border-dashed border-slate-300 rounded-xl hover:border-teal-500 transition-colors bg-slate-50">
                <FileSpreadsheet size={40} className="mx-auto mb-2 text-teal-700 opacity-80" />
                <h3 className="text-sm font-bold text-slate-900">Import Catalogue from CSV / Spreadsheet</h3>
                <p className="text-xs text-slate-600 mt-1 max-w-sm mx-auto">
                  Upload an Excel (.csv or .tsv) price list with columns: <code>Item Code</code>, <code>Description</code>, <code>MRP</code>, <code>Brand</code>, <code>Category</code>
                </p>
                <div className="mt-4">
                  <button
                    type="button"
                    onClick={() => excelInputRef.current?.click()}
                    className="btn btn-sm bg-[#1B263B] hover:bg-[#0D1B2A] text-white font-bold inline-flex items-center space-x-1.5 px-4 py-2 rounded-lg shadow-xs"
                  >
                    <Upload size={14} />
                    <span>Select Spreadsheet (.csv / .tsv)</span>
                  </button>
                  <input
                    ref={excelInputRef}
                    type="file"
                    accept=".csv,.tsv,.txt"
                    className="hidden"
                    onChange={handleSelectExcel}
                  />
                </div>
              </div>

              {excelFile && (
                <div className="p-3 bg-slate-100 border border-slate-300 rounded-lg text-xs flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <FileSpreadsheet size={16} className="text-emerald-700" />
                    <span className="font-bold text-slate-900">{excelFile.name}</span>
                  </div>
                  <span className="text-slate-600 font-mono">{(excelFile.size / 1024).toFixed(1)} KB</span>
                </div>
              )}

              {/* Sample Structure Guide */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1.5 text-slate-700">
                <span className="font-bold text-slate-900 block">Expected CSV Format:</span>
                <code className="block p-2 rounded bg-slate-200 text-[11px] text-slate-900 font-mono">
                  Item Code, Description, MRP, Brand, Category<br />
                  SN-WC-101, Wall Hung Rimless Water Closet, 14500, Cera, Water Closet<br />
                  SN-WB-301, Table Top Oval Ceramic Basin, 6800, Cera, Wash Basin
                </code>
              </div>
            </div>
          )}

          {/* Right Column: Staged Line Items List & Quick Add Form */}
          <div
            className="w-1/2 flex flex-col bg-white border border-slate-300 rounded-xl overflow-hidden shadow-xs"
            style={{ width: '50%' }}
          >
            {/* Header */}
            <div className="p-3 border-b border-slate-200 bg-slate-100 flex flex-wrap items-center justify-between gap-2 shrink-0">
              <div className="flex items-center space-x-2">
                <Layers size={16} className="text-teal-700" />
                <span className="text-xs font-bold text-[#0D1B2A] uppercase tracking-wider">
                  Extracted Items ({stagedItems.length})
                </span>
              </div>

              <div className="flex items-center space-x-2">
                {stagedItems.length > 5 && (
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Search items..."
                      value={stagedSearch}
                      onChange={(e) => {
                        setStagedSearch(e.target.value);
                        setStagedPage(1);
                      }}
                      className="w-32 pl-6 pr-2 py-1 text-xs bg-white rounded-lg border border-slate-300 text-slate-800 placeholder-slate-400 focus:outline-none focus:border-teal-600 font-medium"
                    />
                    <Search size={12} className="absolute left-2 top-2 text-slate-400 pointer-events-none" />
                  </div>
                )}

                {stagedItems.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setStagedItems([]);
                      setStagedSearch('');
                      setStagedPage(1);
                    }}
                    className="text-xs font-bold text-rose-600 hover:text-rose-800 transition-colors"
                  >
                    Clear All
                  </button>
                )}
              </div>
            </div>

            {/* Pagination Bar for Staged Items */}
            {filteredStaged.length > itemsPerPage && (
              <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs text-slate-600 shrink-0">
                <span className="font-medium text-[11px]">
                  Showing {(currentPageSafe - 1) * itemsPerPage + 1} - {Math.min(currentPageSafe * itemsPerPage, filteredStaged.length)} of {filteredStaged.length}
                </span>
                <div className="flex items-center space-x-1.5">
                  <button
                    type="button"
                    disabled={currentPageSafe <= 1}
                    onClick={() => setStagedPage((p) => Math.max(1, p - 1))}
                    className="px-2 py-0.5 rounded border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed font-bold text-xs"
                  >
                    ‹ Prev
                  </button>
                  <span className="text-[11px] font-mono font-bold text-slate-800">
                    {currentPageSafe} / {totalStagedPages}
                  </span>
                  <button
                    type="button"
                    disabled={currentPageSafe >= totalStagedPages}
                    onClick={() => setStagedPage((p) => Math.min(totalStagedPages, p + 1))}
                    className="px-2 py-0.5 rounded border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed font-bold text-xs"
                  >
                    Next ›
                  </button>
                </div>
              </div>
            )}

            {/* Quick Add Form */}
            <div className="p-3 bg-slate-50 border-b border-slate-200 shrink-0 space-y-2">
              <div className="text-[11px] font-bold text-[#1B263B] uppercase tracking-wider flex items-center justify-between">
                <span>Quick Add Item</span>
                {manualImage && (
                  <span className="text-[10px] text-emerald-700 font-bold">✓ Photo Cropped</span>
                )}
              </div>
              <div className="grid grid-cols-12 gap-2 text-xs">
                <input
                  type="text"
                  placeholder="Item Code *"
                  className="col-span-3 px-2 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-900 font-mono uppercase font-bold text-xs focus:outline-none focus:border-teal-600"
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value)}
                />
                <input
                  type="text"
                  placeholder="Description *"
                  className="col-span-4 px-2 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-900 font-medium text-xs focus:outline-none focus:border-teal-600"
                  value={manualDesc}
                  onChange={(e) => setManualDesc(e.target.value)}
                />
                <input
                  type="number"
                  placeholder="MRP (₹)"
                  className="col-span-2 px-2 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-900 font-mono font-bold text-xs text-right focus:outline-none focus:border-teal-600"
                  value={manualMrp}
                  onChange={(e) => setManualMrp(e.target.value)}
                />
                <select
                  className="col-span-2 px-2 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-900 font-medium text-[11px] focus:outline-none focus:border-teal-600"
                  value={manualCategory}
                  onChange={(e) => setManualCategory(e.target.value)}
                >
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleAddManualItem}
                  className="col-span-1 btn btn-sm bg-[#1B263B] hover:bg-[#0D1B2A] text-white font-bold p-0 flex items-center justify-center rounded-lg shadow-xs"
                  title="Add to Staged Items"
                >
                  <Plus size={16} />
                </button>
              </div>
            </div>

            {/* Staged Items List Table */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100 bg-white">
              {stagedItems.length === 0 ? (
                <div className="h-full flex items-center justify-center text-center p-8 text-slate-400">
                  <div>
                    <Sparkles size={32} className="mx-auto mb-2 text-teal-600 opacity-60" />
                    <p className="text-xs font-bold text-slate-700">No items staged yet</p>
                    <p className="text-[11px] text-slate-500 mt-1 max-w-xs">
                      Upload a PDF catalogue or click <strong>"Scan All Pages"</strong> to automatically extract codes, MRPs, descriptions and photos.
                    </p>
                  </div>
                </div>
              ) : (
                displayedStaged.map((it) => (
                  <div
                    key={it.id}
                    className="p-2.5 flex items-center justify-between hover:bg-slate-50 transition-colors gap-2 text-xs"
                  >
                    {/* Thumbnail */}
                    <div className="w-11 h-11 rounded-lg bg-slate-100 border border-slate-200 overflow-hidden shrink-0 flex items-center justify-center shadow-2xs">
                      {it.item_image ? (
                        <img
                          src={it.item_image}
                          alt={it.item_code}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Camera size={16} className="text-slate-400" />
                      )}
                    </div>

                    {/* Details */}
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center space-x-1.5">
                        <input
                          type="text"
                          value={it.item_code}
                          onChange={(e) =>
                            handleUpdateStaged(it.id, 'item_code', e.target.value.toUpperCase())
                          }
                          className="w-28 px-1.5 py-0.5 rounded border border-slate-300 bg-white font-mono font-bold uppercase text-xs text-slate-900"
                        />
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-teal-50 text-teal-900 font-bold border border-teal-200">
                          {it.category}
                        </span>
                        {it.page_number && (
                          <span className="text-[10px] text-slate-500 font-mono">
                            p.{it.page_number}
                          </span>
                        )}
                      </div>
                      <input
                        type="text"
                        value={it.item_description}
                        onChange={(e) => handleUpdateStaged(it.id, 'item_description', e.target.value)}
                        className="w-full px-1.5 py-0.5 rounded border border-slate-200 hover:border-slate-300 bg-white text-slate-800 text-xs font-medium"
                        placeholder="Item Description"
                      />
                    </div>

                    {/* MRP & Delete */}
                    <div className="flex items-center space-x-2 shrink-0">
                      <div className="text-right">
                        <span className="text-[9px] font-bold text-slate-500 block">MRP (₹)</span>
                        <input
                          type="number"
                          value={it.mrp_price || ''}
                          onChange={(e) =>
                            handleUpdateStaged(it.id, 'mrp_price', parseFloat(e.target.value) || 0)
                          }
                          className="w-20 px-1.5 py-0.5 rounded border border-slate-300 bg-white text-right text-emerald-800 font-mono font-bold text-xs"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteStaged(it.id)}
                        className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                        title="Remove row"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Bottom Footer for Right Column */}
            <div className="p-3 bg-slate-100 border-t border-slate-200 flex items-center justify-between shrink-0">
              <span className="text-xs font-bold text-slate-700">
                Ready to save: <strong className="text-teal-900 font-mono">{stagedItems.length}</strong> products
              </span>

              <button
                type="button"
                disabled={stagedItems.length === 0 || isImporting}
                onClick={handleSaveToCatalog}
                className="btn btn-success btn-sm font-extrabold flex items-center space-x-2 px-5 py-2.5 rounded-xl shadow-md cursor-pointer transition-all transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
                style={{
                  background: stagedItems.length > 0 ? 'linear-gradient(135deg, #059669 0%, #047857 100%)' : '#94A3B8',
                  color: '#FFFFFF',
                  border: '1px solid #065F46',
                  boxShadow: stagedItems.length > 0 ? '0 4px 14px rgba(5, 150, 105, 0.4)' : 'none',
                }}
              >
                {isImporting ? (
                  <RefreshCw size={15} className="animate-spin text-white" />
                ) : (
                  <Check size={15} className="text-white" />
                )}
                <span className="text-white font-bold text-xs">
                  {isImporting ? 'Saving to Database...' : `Save ${stagedItems.length} Items to Catalog`}
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Modal Bottom Footer */}
        <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
          <p className="text-xs text-slate-600">
            💡 Once imported, any salesperson typing these Item Codes in Sanitary Quotations will have Description, Image & MRP auto-filled instantly.
          </p>
          <button
            onClick={onClose}
            className="btn btn-secondary btn-sm px-4 py-1.5 rounded-lg text-xs font-bold text-slate-800 hover:bg-slate-200 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
