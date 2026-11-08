import React, { useState, useEffect, useRef } from 'react';
import { useServer } from '../context/ServerContext';
import { useAuth } from '../context/AuthContext';
import { Customer, User } from '../types';
import {
  Save,
  ArrowLeft,
  Plus,
  Trash2,
  Printer,
  Calendar,
  AlertCircle,
  FileCheck,
  Search,
  Phone,
  MapPin,
  Sparkles,
  CheckCircle2,
  X,
  Loader2,
  Users,
  ShieldAlert,
  Image as ImageIcon,
  Upload,
  Percent,
  Copy,
  Eye,
  Bath,
  ClipboardPaste,
  History,
} from 'lucide-react';
import { PdfPreviewModal } from '../components/PdfPreviewModal';
import { SanitaryCatalogPickerModal } from '../components/SanitaryCatalogPickerModal';
import { QuotationHistoryModal } from '../components/QuotationHistoryModal';
import { SalespersonSelect } from '../components/SalespersonSelect';
import { SanitaryCatalogItem } from '../types';
import { numberToWordsIndian } from '../utils/numberToWords';

const formatCurrency = (val: number) => {
  return Number(val || 0).toLocaleString('en-IN', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  });
};

export interface SanitaryLineItem {
  id?: number;
  sl_no: number;
  item_code: string;
  item_description: string;
  item_image: string; // Base64 data URL
  quantity: number;
  mrp_price: number;
  discount_percent: number;
  discounted_price: number;
  total_price: number;
}

interface Props {
  quotationId?: number | null;
  onBack: () => void;
  onSaved: (id: number) => void;
}

export const SanitaryQuotationEditor: React.FC<Props> = ({
  quotationId,
  onBack,
  onSaved,
}) => {
  const { fetchApi, getPdfUrl } = useServer();
  const { user } = useAuth();

  // Form Header State
  const [quotationNumber, setQuotationNumber] = useState<string>('');
  const [quotationDate, setQuotationDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [originalQuotationDate, setOriginalQuotationDate] = useState<string | null>(null);
  const [version, setVersion] = useState<number>(1);
  const [status, setStatus] = useState<'draft' | 'in_review' | 'approved' | 'closed'>('draft');

  // Customer State
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [customerName, setCustomerName] = useState<string>('');
  const [customerPhone, setCustomerPhone] = useState<string>('');
  const [customerGstin, setCustomerGstin] = useState<string>('');
  const [deliveryAddress, setDeliveryAddress] = useState<string>('');
  const [siteLocation, setSiteLocation] = useState<string>('');
  const [projectName, setProjectName] = useState<string>('');
  const [specialNotes, setSpecialNotes] = useState<string>('');

  // Tax State
  const [taxType, setTaxType] = useState<'cgst_sgst' | 'igst' | 'exempt'>('cgst_sgst');

  // Assigned Salesperson State (for Accounts / Billing Desk workflow)
  const [assignedSalesPersonId, setAssignedSalesPersonId] = useState<number | null>(null);
  const [assignedSalesPersonName, setAssignedSalesPersonName] = useState<string>('');
  const [salesPersonError, setSalesPersonError] = useState<string | null>(null);

  // Split Sales State
  const [enableSplitSale, setEnableSplitSale] = useState(false);
  const [primarySalesPersonName, setPrimarySalesPersonName] = useState<string>('');
  const [assistedSalesPersonId, setAssistedSalesPersonId] = useState<number | null>(null);
  const [assistedSalesPersonName, setAssistedSalesPersonName] = useState<string>('');
  const [splitShareType, setSplitShareType] = useState<'percentage' | 'amount'>('percentage');
  const [primarySalesSharePercent, setPrimarySalesSharePercent] = useState<number>(50);
  const [primarySalesShareAmount, setPrimarySalesShareAmount] = useState<number>(0);
  const [assistedSalesSharePercent, setAssistedSalesSharePercent] = useState<number>(50);
  const [assistedSalesShareAmount, setAssistedSalesShareAmount] = useState<number>(0);
  const [salesTeam, setSalesTeam] = useState<User[]>([]);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);

  // Sanitary Line Items State
  const [items, setItems] = useState<SanitaryLineItem[]>([
    {
      sl_no: 1,
      item_code: 'SN-WC-101',
      item_description: 'Wall Hung Rimless Water Closet with Soft Close Seat Cover',
      item_image: '',
      quantity: 1,
      mrp_price: 14500,
      discount_percent: 15,
      discounted_price: 12325,
      total_price: 12325,
    },
  ]);
  const itemsRef = useRef<SanitaryLineItem[]>(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // Customer Autocomplete State
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Customer[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isSearchingCustomer, setIsSearchingCustomer] = useState(false);
  const [exactPhoneMatch, setExactPhoneMatch] = useState<Customer | null>(null);
  const customerDropdownRef = useRef<HTMLDivElement>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // UI / Status State
  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [savedQuotationId, setSavedQuotationId] = useState<number | null>(quotationId || null);
  const [pdfPreviewOpen, setPdfPreviewOpen] = useState(false);
  const [pdfIsEncrypted, setPdfIsEncrypted] = useState(false);
  const [enlargedImage, setEnlargedImage] = useState<string | null>(null);

  // Catalog Autocomplete & Auto-Fetch State
  const [catalogPickerOpen, setCatalogPickerOpen] = useState(false);
  const [activeSuggestRow, setActiveSuggestRow] = useState<number | null>(null);
  const [catalogSuggestions, setCatalogSuggestions] = useState<SanitaryCatalogItem[]>([]);
  const [catalogHighlightIndex, setCatalogHighlightIndex] = useState(0);
  const [suggestPosition, setSuggestPosition] = useState<{
    top?: number;
    bottom?: number;
    left: number;
    width: number;
  } | null>(null);
  const [isSearchingCatalog, setIsSearchingCatalog] = useState(false);
  const catalogSearchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Helper to calculate screen position for floating dropdown (prevents clipping by table overflow)
  const updateSuggestPosition = (el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const showAbove = spaceBelow < 280 && rect.top > 280;
    const maxAvailableWidth = Math.max(280, window.innerWidth - 24);
    const width = Math.min(maxAvailableWidth, Math.max(rect.width, Math.min(360, maxAvailableWidth)));

    setSuggestPosition({
      top: showAbove ? undefined : rect.bottom + 4,
      bottom: showAbove ? window.innerHeight - rect.top + 4 : undefined,
      left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
      width,
    });
  };

  const fileInputRefs = useRef<{ [key: number]: HTMLInputElement | null }>({});

  const isAdmin = user?.role === 'admin';
  const isManager = user?.role === 'manager';
  const isAccounts = user?.role === 'accounts' || (user?.role as string) === 'accountant';
  const canApprove = isAdmin || isManager;
  const canClearAll = isAdmin || isAccounts;

  // 1. Fetch Reference Data (Customers & Sales Team)
  useEffect(() => {
    const fetchRefData = async () => {
      try {
        const [custRes, teamRes] = await Promise.all([
          fetchApi('/api/customers?limit=100'),
          fetchApi('/api/users/sales-team'),
        ]);
        setCustomers(custRes.customers || []);
        setSalesTeam(teamRes.users || []);
      } catch (err) {
        console.error('Failed to load reference data:', err);
      }
    };
    fetchRefData();
  }, []);

  // 2. Load Existing Quotation if editing
  const loadQuotation = async (qId?: number) => {
    const idToLoad = qId || quotationId;
    if (!idToLoad) {
      setPrimarySalesPersonName(user?.full_name || 'Sales Associate');
      return;
    }
    setLoading(true);
    try {
      const data = await fetchApi(`/api/quotations/${idToLoad}`);
      const q = data.quotation;

      setQuotationNumber(q.quotation_number);
      const origDate = q.quotation_date.split('T')[0];
      setOriginalQuotationDate(origDate);
      const todayStr = new Date().toISOString().split('T')[0];
      setQuotationDate(todayStr);
      setVersion(q.version);
      setStatus(q.status);
      setCustomerId(q.customer_id || null);
      setCustomerName(q.customer_name);
      setCustomerPhone(q.customer_phone);
      setCustomerGstin(q.customer_gstin || '');
      setDeliveryAddress(q.delivery_address || '');
      setSiteLocation(q.site_location || '');
      setProjectName(q.project_name || '');
      setSpecialNotes(q.special_notes || '');
      setTaxType(q.tax_type || 'cgst_sgst');
      setPrimarySalesPersonName(q.sales_person_name);
      setAssignedSalesPersonId(q.sales_person_id || null);
      setAssignedSalesPersonName(q.sales_person_name || '');

      if (q.assisted_sales_person_id) {
        setEnableSplitSale(true);
        setAssistedSalesPersonId(q.assisted_sales_person_id);
        setAssistedSalesPersonName(q.assisted_sales_person_name || '');
        setSplitShareType(q.split_share_type || 'percentage');
        setPrimarySalesSharePercent(Number(q.primary_sales_share_percent || 50));
        setPrimarySalesShareAmount(Number(q.primary_sales_share_amount || 0));
        setAssistedSalesSharePercent(Number(q.assisted_sales_share_percent || 50));
        setAssistedSalesShareAmount(Number(q.assisted_sales_share_amount || 0));
      }

      const rawItems: any[] = [];
      if (Array.isArray(data.areas)) {
        data.areas.forEach((area: any) => {
          if (Array.isArray(area.items)) {
            rawItems.push(...area.items);
          }
        });
      }

      if (rawItems.length > 0) {
        const mapped: SanitaryLineItem[] = rawItems.map((it: any, index: number) => {
          const qty = Number(it.quantity_boxes || it.quantity || 1);
          const mrp = Number(it.mrp_price || it.base_rate_per_box || it.rate_per_box || 0);
          const discPct = Number(it.discount_percent || 0);
          const discPrice = Number(it.rate_per_box || it.discounted_price || (mrp > 0 ? mrp * (1 - discPct / 100) : 0));
          const total = Number(it.total_amount || (qty * discPrice));

          return {
            id: it.id,
            sl_no: index + 1,
            item_code: it.item_code || it.size || '',
            item_description: it.description || '',
            item_image: it.item_image || '',
            quantity: qty,
            mrp_price: mrp,
            discount_percent: discPct,
            discounted_price: discPrice,
            total_price: total,
          };
        });
        setItems(mapped);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load quotation');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadQuotation();
  }, [quotationId]);

  // Close customer suggestions and catalog floating suggestions on outside click / update on scroll/resize
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        customerDropdownRef.current &&
        !customerDropdownRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
      }
      const target = event.target as HTMLElement;
      if (!target.closest('.sanitary-suggest-dropdown') && !target.closest('.sanitary-suggest-input')) {
        setActiveSuggestRow(null);
        setSuggestPosition(null);
      }
    };

    const handleScrollOrResize = () => {
      if (activeSuggestRow !== null) {
        const el = document.querySelector<HTMLElement>(
          `[data-sanitary-cell="${activeSuggestRow}-0"], [data-mobile-sanitary-suggest="${activeSuggestRow}"]`
        );
        if (el) {
          updateSuggestPosition(el);
        } else {
          setActiveSuggestRow(null);
          setSuggestPosition(null);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [activeSuggestRow]);

  // Customer search trigger
  const triggerCustomerLookup = (queryText: string) => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    const trimmed = queryText.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    setIsSearchingCustomer(true);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const res = await fetchApi(`/api/customers/lookup?q=${encodeURIComponent(trimmed)}`);
        const found: Customer[] = res.customers || [];
        setSuggestions(found);
        setShowSuggestions(found.length > 0);
      } catch (err) {
        console.error('Customer lookup error:', err);
      } finally {
        setIsSearchingCustomer(false);
      }
    }, 200);
  };

  const handleApplyCustomer = (c: Customer) => {
    setCustomerId(c.id);
    setCustomerName(c.name);
    setCustomerPhone(c.mobile_number);
    setCustomerGstin(c.gstin || '');
    setDeliveryAddress(c.delivery_address || '');
    setSiteLocation(c.site_location || '');
    setShowSuggestions(false);
    setCustomerSearchQuery('');
  };

  // 3. Compress & Convert Image to Base64 (Max 360x360 at 0.72 quality)
  const processImageUpload = (file: File, index: number) => {
    if (!file.type.startsWith('image/')) {
      alert('Please upload a valid image file (PNG, JPG, WEBP).');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxDim = 360;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxDim) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          }
        } else {
          if (height > maxDim) {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.72);
          updateItem(index, 'item_image', compressedDataUrl);
        }
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  // 4. Item Field Update Handlers (Bidirectional MRP, Discount %, and Discounted Price)
  const updateItem = (
    index: number,
    field: keyof SanitaryLineItem,
    val: any
  ) => {
    setItems((prev) => {
      const next = [...prev];
      const item = { ...next[index] };

      if (field === 'item_code') {
        item.item_code = String(val);
      } else if (field === 'item_description') {
        item.item_description = String(val);
      } else if (field === 'item_image') {
        item.item_image = String(val);
      } else if (field === 'quantity') {
        const qty = Math.max(1, parseFloat(val) || 1);
        item.quantity = qty;
        item.total_price = parseFloat((qty * item.discounted_price).toFixed(2));
      } else if (field === 'mrp_price') {
        const mrp = Math.max(0, parseFloat(val) || 0);
        item.mrp_price = mrp;
        const discPrice = parseFloat((mrp * (1 - item.discount_percent / 100)).toFixed(2));
        item.discounted_price = discPrice;
        item.total_price = parseFloat((item.quantity * discPrice).toFixed(2));
      } else if (field === 'discount_percent') {
        const discPct = Math.max(0, Math.min(100, parseFloat(val) || 0));
        item.discount_percent = discPct;
        const discPrice = parseFloat((item.mrp_price * (1 - discPct / 100)).toFixed(2));
        item.discounted_price = discPrice;
        item.total_price = parseFloat((item.quantity * discPrice).toFixed(2));
      } else if (field === 'discounted_price') {
        const discPrice = Math.max(0, parseFloat(val) || 0);
        item.discounted_price = discPrice;
        if (item.mrp_price > 0) {
          const discPct = Math.max(0, Math.min(100, parseFloat((((item.mrp_price - discPrice) / item.mrp_price) * 100).toFixed(2))));
          item.discount_percent = discPct;
        }
        item.total_price = parseFloat((item.quantity * discPrice).toFixed(2));
      }

      next[index] = item;
      return next;
    });
  };

  const addItem = () => {
    setItems((prev) => {
      const nextIndex = prev.length;
      setTimeout(() => {
        const mobileInput = document.querySelector<HTMLElement>(
          `[data-mobile-sanitary-suggest="${nextIndex}"]`
        );
        if (mobileInput) {
          mobileInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
          mobileInput.focus();
        } else {
          const deskInput = document.querySelector<HTMLElement>(
            `[data-sanitary-cell="${nextIndex}-0"]`
          );
          if (deskInput) {
            deskInput.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            deskInput.focus();
          }
        }
      }, 120);

      return [
        ...prev,
        {
          sl_no: prev.length + 1,
          item_code: '',
          item_description: '',
          item_image: '',
          quantity: 1,
          mrp_price: 0,
          discount_percent: 0,
          discounted_price: 0,
          total_price: 0,
        },
      ];
    });
  };

  const duplicateItem = (index: number) => {
    setItems((prev) => {
      const target = prev[index];
      const clone: SanitaryLineItem = {
        ...target,
        id: undefined,
        sl_no: prev.length + 1,
        item_code: `${target.item_code} (Copy)`,
      };
      const next = [...prev, clone].map((it, idx) => ({ ...it, sl_no: idx + 1 }));
      return next;
    });
  };

  const removeItem = (index: number) => {
    if (items.length <= 1) {
      alert('A quotation must contain at least one item.');
      return;
    }
    setItems((prev) =>
      prev.filter((_, i) => i !== index).map((it, idx) => ({ ...it, sl_no: idx + 1 }))
    );
  };

  // Keyboard Navigation Helpers for Sanitary Grid
  const focusSanitaryCell = (itemIdx: number, colIdx: number): boolean => {
    const el = document.querySelector<HTMLElement>(`[data-sanitary-cell="${itemIdx}-${colIdx}"]`);
    if (el) {
      el.focus();
      if (el instanceof HTMLInputElement) {
        el.select();
      }
      return true;
    }
    return false;
  };

  const navigateSanitaryNext = (itemIdx: number, currentCol: number) => {
    for (let nextCol = currentCol + 1; nextCol <= 5; nextCol++) {
      if (focusSanitaryCell(itemIdx, nextCol)) {
        return;
      }
    }
    if (itemIdx + 1 < items.length) {
      focusSanitaryCell(itemIdx + 1, 0);
    } else {
      addItem();
      setTimeout(() => {
        focusSanitaryCell(itemIdx + 1, 0);
      }, 50);
    }
  };

  const navigateSanitaryPrev = (itemIdx: number, currentCol: number) => {
    for (let prevCol = currentCol - 1; prevCol >= 0; prevCol--) {
      if (focusSanitaryCell(itemIdx, prevCol)) {
        return;
      }
    }
    if (itemIdx > 0) {
      focusSanitaryCell(itemIdx - 1, 5);
    }
  };

  const navigateSanitaryRow = (itemIdx: number, colIdx: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? itemIdx - 1 : itemIdx + 1;
    if (targetIdx >= 0 && targetIdx < items.length) {
      focusSanitaryCell(targetIdx, colIdx);
    } else if (direction === 'down' && targetIdx === items.length) {
      addItem();
      setTimeout(() => {
        focusSanitaryCell(targetIdx, colIdx);
      }, 50);
    }
  };

  const handleSanitaryCellKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    itemIdx: number,
    colIdx: number
  ) => {
    const isCode = colIdx === 0;
    const isSuggestOpen = isCode && activeSuggestRow === itemIdx && catalogSuggestions.length > 0;

    if (e.key === 'Enter') {
      if (isSuggestOpen) {
        e.preventDefault();
        applyCatalogItem(itemIdx, catalogSuggestions[catalogHighlightIndex] || catalogSuggestions[0]);
        return;
      }
      e.preventDefault();
      navigateSanitaryNext(itemIdx, colIdx);
      return;
    }

    if (e.key === 'ArrowDown') {
      if (isSuggestOpen) {
        e.preventDefault();
        setCatalogHighlightIndex((prev) => (prev + 1) % catalogSuggestions.length);
        return;
      }
      e.preventDefault();
      navigateSanitaryRow(itemIdx, colIdx, 'down');
      return;
    }

    if (e.key === 'ArrowUp') {
      if (isSuggestOpen) {
        e.preventDefault();
        setCatalogHighlightIndex((prev) => (prev - 1 + catalogSuggestions.length) % catalogSuggestions.length);
        return;
      }
      e.preventDefault();
      navigateSanitaryRow(itemIdx, colIdx, 'up');
      return;
    }

    if (e.key === 'ArrowRight') {
      const target = e.currentTarget as HTMLInputElement;
      if (target.type === 'text') {
        if (target.selectionEnd === target.value.length) {
          e.preventDefault();
          navigateSanitaryNext(itemIdx, colIdx);
        }
      } else {
        e.preventDefault();
        navigateSanitaryNext(itemIdx, colIdx);
      }
      return;
    }

    if (e.key === 'ArrowLeft') {
      const target = e.currentTarget as HTMLInputElement;
      if (target.type === 'text') {
        if (target.selectionStart === 0) {
          e.preventDefault();
          navigateSanitaryPrev(itemIdx, colIdx);
        }
      } else {
        e.preventDefault();
        navigateSanitaryPrev(itemIdx, colIdx);
      }
      return;
    }
  };

  const handleRemoveAllItems = () => {
    if (!canClearAll) return;
    if (window.confirm('Are you sure you want to remove all items from this sanitary quotation? This action cannot be undone.')) {
      setItems([
        {
          sl_no: 1,
          item_code: '',
          item_description: '',
          item_image: '',
          quantity: 1,
          mrp_price: 0,
          discount_percent: 0,
          discounted_price: 0,
          total_price: 0,
        },
      ]);
    }
  };

  const handlePasteFromClipboard = async (index: number) => {
    try {
      if (!navigator.clipboard || !navigator.clipboard.read) {
        alert('Clipboard API is not accessible directly in this browser context. You can focus on this item and press Ctrl+V to paste your image.');
        return;
      }
      const clipItems = await navigator.clipboard.read();
      for (const item of clipItems) {
        for (const type of item.types) {
          if (type.startsWith('image/')) {
            const blob = await item.getType(type);
            const file = new File([blob], 'clipboard_image.png', { type });
            processImageUpload(file, index);
            return;
          }
        }
      }
      alert('No image found in clipboard. Please copy an image first, then click Paste (or press Ctrl+V on the item row).');
    } catch (err: any) {
      console.warn('Clipboard read error:', err);
      alert('Unable to read clipboard directly. Please focus on this item row and press Ctrl+V to paste your image.');
    }
  };

  const handleRowPaste = (e: React.ClipboardEvent<HTMLTableRowElement>, index: number) => {
    const clipItems = e.clipboardData?.items;
    if (!clipItems) return;
    for (let i = 0; i < clipItems.length; i++) {
      const it = clipItems[i];
      if (it.type.indexOf('image') !== -1) {
        e.preventDefault();
        const file = it.getAsFile();
        if (file) {
          processImageUpload(file, index);
        }
        return;
      }
    }
  };

  const handleToolbarPaste = async () => {
    // Find first item without an image, or target the last item
    const targetIdx = items.findIndex((it) => !it.item_image) !== -1
      ? items.findIndex((it) => !it.item_image)
      : items.length - 1;
    if (targetIdx >= 0) {
      await handlePasteFromClipboard(targetIdx);
    }
  };

  // Catalog Autocomplete & Auto-Fetch Handlers
  const handleItemCodeChange = (index: number, code: string, targetEl?: HTMLElement | null) => {
    updateItem(index, 'item_code', code);
    setActiveSuggestRow(index);
    setCatalogHighlightIndex(0);

    const el =
      targetEl ||
      document.querySelector<HTMLElement>(
        `[data-sanitary-cell="${index}-0"], [data-mobile-sanitary-suggest="${index}"]`
      );
    if (el) {
      updateSuggestPosition(el);
    }

    if (catalogSearchTimeoutRef.current) {
      clearTimeout(catalogSearchTimeoutRef.current);
    }

    const trimmed = code.trim();
    if (!trimmed) {
      setCatalogSuggestions([]);
      setSuggestPosition(null);
      return;
    }

    catalogSearchTimeoutRef.current = setTimeout(async () => {
      try {
        setIsSearchingCatalog(true);
        const res = await fetchApi<any>(
          `/api/sanitary-catalog/lookup?code=${encodeURIComponent(trimmed)}&q=${encodeURIComponent(trimmed)}`
        );
        const found: SanitaryCatalogItem[] = res.suggestions || [];
        setCatalogSuggestions(found);

        // If exact code match found, immediately auto-fill it!
        if (res.item && res.item.item_code.trim().toLowerCase() === trimmed.toLowerCase()) {
          applyCatalogItem(index, res.item);
        } else if (found.length > 0) {
          const currentInput = document.querySelector<HTMLElement>(
            `[data-sanitary-cell="${index}-0"], [data-mobile-sanitary-suggest="${index}"]`
          );
          if (currentInput) {
            updateSuggestPosition(currentInput);
          }
        }
      } catch (err) {
        console.error('Catalog lookup error:', err);
      } finally {
        setIsSearchingCatalog(false);
      }
    }, 180);
  };

  const applyCatalogItem = (index: number, catItem: SanitaryCatalogItem) => {
    setItems((prev) => {
      const next = [...prev];
      if (!next[index]) return prev;
      const cur = { ...next[index] };
      cur.item_code = catItem.item_code;
      cur.item_description = catItem.item_description || cur.item_description;
      if (catItem.item_image) {
        cur.item_image = catItem.item_image;
      }
      const mrp = Number(catItem.mrp_price || 0);
      cur.mrp_price = mrp;
      const discPct = cur.discount_percent || 0;
      const discPrice = discPct > 0 ? parseFloat((mrp * (1 - discPct / 100)).toFixed(2)) : mrp;
      cur.discounted_price = discPrice;
      cur.total_price = parseFloat((cur.quantity * discPrice).toFixed(2));

      next[index] = cur;
      return next;
    });

    setActiveSuggestRow(null);
    setCatalogSuggestions([]);
    setSuggestPosition(null);
  };

  const handleItemCodeBlur = (index: number) => {
    // Slight delay to allow clicks on dropdown items
    setTimeout(async () => {
      setActiveSuggestRow(null);
      setSuggestPosition(null);
      const currentCode = itemsRef.current[index]?.item_code?.trim();
      if (currentCode) {
        try {
          const res = await fetchApi<any>(
            `/api/sanitary-catalog/lookup?code=${encodeURIComponent(currentCode)}`
          );
          if (res.item) {
            applyCatalogItem(index, res.item);
          }
        } catch (e) {
          console.warn('Catalog blur lookup error:', e);
        }
      }
    }, 250);
  };

  const handleSelectFromPicker = (catItem: SanitaryCatalogItem) => {
    const catCode = catItem.item_code.trim().toUpperCase();
    const existingIdx = items.findIndex(
      (it) => it.item_code.trim().toUpperCase() === catCode
    );
    if (existingIdx >= 0) {
      applyCatalogItem(existingIdx, catItem);
      return;
    }

    const lastIdx = items.length - 1;
    const isLastBlank = lastIdx >= 0 && !items[lastIdx].item_code.trim() && !items[lastIdx].item_description.trim();

    if (isLastBlank) {
      applyCatalogItem(lastIdx, catItem);
    } else {
      const mrp = Number(catItem.mrp_price || 0);
      setItems((prev) => [
        ...prev,
        {
          sl_no: prev.length + 1,
          item_code: catItem.item_code,
          item_description: catItem.item_description,
          item_image: catItem.item_image || '',
          quantity: 1,
          mrp_price: mrp,
          discount_percent: 0,
          discounted_price: mrp,
          total_price: mrp,
        },
      ]);
    }
  };

  // 5. Financial Summary Calculations
  const grossMrpTotal = items.reduce(
    (sum, it) => sum + (it.quantity * it.mrp_price),
    0
  );
  const taxableAmount = items.reduce(
    (sum, it) => sum + it.total_price,
    0
  );
  const totalDiscountAmount = parseFloat((grossMrpTotal - taxableAmount).toFixed(2));
  const overallDiscountPercent = grossMrpTotal > 0
    ? parseFloat(((totalDiscountAmount / grossMrpTotal) * 100).toFixed(2))
    : 0;

  let cgstAmount = 0;
  let sgstAmount = 0;
  let igstAmount = 0;

  if (taxType === 'cgst_sgst') {
    cgstAmount = parseFloat(((taxableAmount * 9) / 100).toFixed(2));
    sgstAmount = parseFloat(((taxableAmount * 9) / 100).toFixed(2));
  } else if (taxType === 'igst') {
    igstAmount = parseFloat(((taxableAmount * 18) / 100).toFixed(2));
  }

  const unroundedNet = taxableAmount + cgstAmount + sgstAmount + igstAmount;
  const netTotal = Math.round(unroundedNet);
  const roundOff = parseFloat((netTotal - unroundedNet).toFixed(2));
  const amountInWords = numberToWordsIndian(netTotal);
  const totalPieces = items.reduce((acc, it) => acc + (it.quantity || 0), 0);

  // Synchronize split share amounts
  useEffect(() => {
    if (!enableSplitSale) {
      setPrimarySalesShareAmount(netTotal);
      setAssistedSalesShareAmount(0);
      return;
    }
    if (splitShareType === 'percentage') {
      const pPct = primarySalesSharePercent || 50;
      const pAmt = Math.round((netTotal * pPct) / 100);
      setPrimarySalesShareAmount(pAmt);
      setAssistedSalesShareAmount(netTotal - pAmt);
    } else {
      const pAmt = Math.min(netTotal, primarySalesShareAmount);
      setPrimarySalesShareAmount(pAmt);
      setAssistedSalesShareAmount(Math.max(0, netTotal - pAmt));
      const pPct = netTotal > 0 ? parseFloat(((pAmt / netTotal) * 100).toFixed(2)) : 50;
      setPrimarySalesSharePercent(pPct);
      setAssistedSalesSharePercent(parseFloat((100 - pPct).toFixed(2)));
    }
  }, [netTotal, enableSplitSale]);

  const handleToggleSplitSale = (enabled: boolean) => {
    setEnableSplitSale(enabled);
    if (enabled) {
      const pAmt = Math.round(netTotal * 0.5);
      const aAmt = netTotal - pAmt;
      setPrimarySalesSharePercent(50);
      setAssistedSalesSharePercent(50);
      setPrimarySalesShareAmount(pAmt);
      setAssistedSalesShareAmount(aAmt);
      if (!assistedSalesPersonId && salesTeam.length > 0) {
        const other = salesTeam.find((u) => u.id !== user?.id) || salesTeam[0];
        setAssistedSalesPersonId(other.id);
        setAssistedSalesPersonName(other.full_name);
      }
    }
  };

  // 6. Save Quotation Function
  const saveQuotationData = async (targetStatus?: typeof status): Promise<number | null> => {
    setError(null);
    if (!customerName.trim()) {
      setError('Customer name is required.');
      return null;
    }
    if (!customerPhone.trim()) {
      setError('Customer phone number is required.');
      return null;
    }

    const isAccountsOrAdmin = ['admin', 'accounts', 'manager'].includes((user?.role || '').toLowerCase());
    if (isAccountsOrAdmin && (!assignedSalesPersonId || assignedSalesPersonId <= 0)) {
      setError('Please select an assigned sales executive for this quotation.');
      setSalesPersonError('Please select an assigned sales executive');
      return null;
    }

    if (enableSplitSale && !assistedSalesPersonId) {
      setError('Please select an assisted salesperson or disable split sale.');
      return null;
    }

    const finalStatus = targetStatus || status;
    setSaving(true);

    try {
      const payload = {
        quotation_type: 'sanitary',
        quotation_date: quotationDate,
        customer_id: customerId || null,
        customer_name: customerName.trim(),
        customer_phone: customerPhone.trim(),
        customer_gstin: customerGstin.trim() || null,
        delivery_address: deliveryAddress.trim(),
        site_location: siteLocation.trim(),
        project_name: projectName.trim(),
        sales_person_id: assignedSalesPersonId,
        sales_person_name: assignedSalesPersonName,
        status: finalStatus,
        tax_type: taxType,
        special_notes: specialNotes.trim(),
        discount_percent: overallDiscountPercent,
        discount_amount: totalDiscountAmount,
        assisted_sales_person_id: enableSplitSale ? assistedSalesPersonId : null,
        assisted_sales_person_name: enableSplitSale ? assistedSalesPersonName : null,
        split_share_type: enableSplitSale ? splitShareType : 'percentage',
        primary_sales_share_percent: enableSplitSale ? primarySalesSharePercent : 100,
        primary_sales_share_amount: enableSplitSale ? primarySalesShareAmount : netTotal,
        assisted_sales_share_percent: enableSplitSale ? assistedSalesSharePercent : 0,
        assisted_sales_share_amount: enableSplitSale ? assistedSalesShareAmount : 0,
        version: quotationId ? version : 1,
        areas: [
          {
            area_name: 'Sanitary Ware',
            display_order: 1,
            items: items.map((it, idx) => ({
              sl_no: idx + 1,
              item_code: it.item_code.trim(),
              item_description: it.item_description.trim() || 'Sanitary Item',
              description: it.item_description.trim() || 'Sanitary Item',
              size: it.item_code.trim() || 'Nos',
              brand: 'Sanitary',
              product_type: 'nos',
              item_image: it.item_image || null,
              coverage_area: 0,
              quantity_sqft: 0,
              rate_per_sqft: 0,
              quantity_boxes: it.quantity,
              quantity: it.quantity,
              mrp_price: it.mrp_price,
              base_rate_per_box: it.mrp_price,
              discount_percent: it.discount_percent,
              discount_amount: parseFloat((it.quantity * it.mrp_price - it.total_price).toFixed(2)),
              rate_per_box: it.discounted_price,
              discounted_price: it.discounted_price,
              total_amount: it.total_price,
              total_price: it.total_price,
            })),
          },
        ],
      };

      let res;
      if (quotationId) {
        res = await fetchApi(`/api/quotations/${quotationId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetchApi('/api/quotations', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }

      const saved = res.quotation;
      setSavedQuotationId(saved.id);
      setQuotationNumber(saved.quotation_number);
      setVersion(saved.version);
      setStatus(saved.status);
      setSuccessMessage(`Sanitary Quotation #${saved.quotation_number} saved successfully!`);
      setTimeout(() => setSuccessMessage(null), 4000);
      return saved.id;
    } catch (err: any) {
      setError(err.message || 'Failed to save sanitary quotation');
      return null;
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAndExit = async () => {
    const id = await saveQuotationData();
    if (id) {
      onSaved(id);
    }
  };

  const handleOpenPreview = async (encrypted: boolean = false) => {
    let id = savedQuotationId;
    if (!id || quotationNumber === '') {
      id = await saveQuotationData();
    }
    if (id) {
      setPdfIsEncrypted(encrypted);
      setPdfPreviewOpen(true);
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="text-center">
          <Loader2 className="animate-spin text-amber-500 mx-auto mb-3" size={32} />
          <p className="text-xs font-semibold text-[#1B263B]">Loading Sanitary Quotation...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 p-4 sm:p-5 lg:p-6 space-y-4 lg:space-y-5 overflow-y-auto w-full min-w-0 pb-36 select-none">
      {/* 1. Header Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white/90 backdrop-blur-md p-4 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center space-x-3">
          <button
            type="button"
            onClick={onBack}
            className="p-2 rounded-xl text-[#415A77] hover:text-[#0D1B2A] hover:bg-slate-100 transition-colors cursor-pointer"
            title="Return to Quotation List"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-lg font-bold text-[#0D1B2A] tracking-tight">
                {quotationId ? `Edit Sanitary Quotation #${quotationNumber}` : 'New Sanitary Quotation'}
              </span>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                🚿 Sanitary Ware
              </span>
              <span
                className={`px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider ${
                  status === 'approved'
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    : status === 'in_review'
                    ? 'bg-blue-100 text-blue-800 border border-blue-300'
                    : 'bg-slate-100 text-slate-700 border border-slate-300'
                }`}
              >
                {status.replace('_', ' ')}
              </span>
            </div>
            <div className="text-xs text-[#778DA9] flex items-center space-x-2 mt-0.5">
              <span>Salesperson: <strong className="text-[#1B263B]">{primarySalesPersonName || user?.full_name}</strong></span>
              <span>•</span>
              <span>Items: <strong className="text-[#1B263B]">{items.length}</strong></span>
              <span>•</span>
              <span>Total Units: <strong className="text-[#1B263B]">{totalPieces} Nos</strong></span>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Previous Quotes Version History */}
          {quotationId && (
            <button
              type="button"
              onClick={() => setHistoryModalOpen(true)}
              className="btn btn-secondary text-xs px-3 py-2 text-[#1B263B] border border-slate-300 shadow-2xs inline-flex items-center space-x-1.5"
              title="View previous quotes and edit history"
            >
              <History size={14} className="text-indigo-600" />
              <span>Previous Quotes {version > 1 ? `(v${version})` : ''}</span>
            </button>
          )}

          {/* Standard PDF */}
          <button
            type="button"
            onClick={() => handleOpenPreview(false)}
            className="btn btn-secondary text-xs px-3 py-2 text-[#1B263B] border border-slate-300 shadow-2xs inline-flex items-center space-x-1.5"
            title="Preview Standard Sanitary PDF"
          >
            <Printer size={14} className="text-[#415A77]" />
            <span>PDF Preview</span>
          </button>

          {/* Encrypted PDF */}
          <button
            type="button"
            onClick={() => handleOpenPreview(true)}
            className="btn btn-xs px-2.5 py-2 text-xs font-semibold bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300/80 shadow-2xs inline-flex items-center space-x-1.5"
            title="Preview Encrypted Sanitary PDF (Brand and descriptions coded)"
          >
            <ShieldAlert size={14} className="text-amber-600" />
            <span>Encrypted PDF</span>
          </button>

          {/* Save / Approve */}
          <button
            type="button"
            disabled={saving}
            onClick={handleSaveAndExit}
            className="btn btn-primary text-xs px-4 py-2 font-bold inline-flex items-center space-x-1.5 shadow-xs"
          >
            {saving ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Save size={14} />
            )}
            <span>{quotationId ? 'Update & Exit' : 'Save & Exit'}</span>
          </button>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex items-center space-x-2">
          <AlertCircle size={16} className="shrink-0 text-rose-600" />
          <span>{error}</span>
        </div>
      )}

      {successMessage && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center space-x-2">
          <CheckCircle2 size={16} className="shrink-0 text-emerald-600" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* 2. Customer & Quotation Meta Card */}
      <div className="bg-white/90 backdrop-blur-md p-4 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
          <div className="flex items-center space-x-2">
            <Users size={16} className="text-[#415A77]" />
            <span className="text-xs font-bold text-[#0D1B2A] uppercase tracking-wider">
              Customer & Project Information
            </span>
          </div>

          {/* Fast Customer Autocomplete Search Bar */}
          <div className="relative w-72" ref={customerDropdownRef}>
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search customer by name or phone..."
                value={customerSearchQuery}
                onChange={(e) => {
                  setCustomerSearchQuery(e.target.value);
                  triggerCustomerLookup(e.target.value);
                }}
                className="w-full text-xs pl-8 pr-3 py-1.5 rounded-xl border border-slate-300 focus:outline-none focus:border-[#415A77] bg-slate-50 focus:bg-white"
              />
              {isSearchingCustomer && (
                <Loader2 size={12} className="animate-spin absolute right-2.5 top-3 text-slate-400" />
              )}
            </div>

            {/* Dropdown Suggestions */}
            {showSuggestions && (
              <div className="absolute left-0 right-0 mt-1 bg-white rounded-xl shadow-lg border border-slate-200 z-50 max-h-56 overflow-y-auto divide-y divide-slate-100">
                {suggestions.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => handleApplyCustomer(c)}
                    className="p-2.5 hover:bg-slate-50 cursor-pointer flex items-center justify-between transition-colors"
                  >
                    <div>
                      <div className="text-xs font-bold text-slate-900">{c.name}</div>
                      <div className="text-[11px] text-[#415A77] font-mono">{c.mobile_number}</div>
                    </div>
                    <span className="text-[10px] text-blue-600 font-semibold bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                      Auto-fill
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Salesperson Assignment & Billing Desk Header Bar */}
        <div className="mb-4 p-3 bg-gradient-to-r from-slate-50 to-indigo-50/40 rounded-2xl border border-slate-200/90 shadow-2xs grid grid-cols-1 md:grid-cols-2 gap-3.5 items-end">
          <SalespersonSelect
            value={assignedSalesPersonId}
            onChange={(sp) => {
              setAssignedSalesPersonId(sp.id);
              setAssignedSalesPersonName(sp.full_name);
              setPrimarySalesPersonName(sp.full_name);
              setSalesPersonError(null);
            }}
            error={salesPersonError}
          />
          <div className="flex items-center justify-between p-2.5 bg-white rounded-xl border border-slate-200 text-xs text-slate-700">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Prepared & Billed By</span>
              <span className="font-bold text-slate-900">{user?.full_name}</span>
              <span className="text-[10px] text-slate-400 font-mono ml-1.5">(@{user?.username})</span>
            </div>
            <span className="px-2.5 py-1 rounded-lg text-[10px] font-extrabold uppercase tracking-wider bg-slate-100 text-slate-700 border border-slate-200">
              Role: {user?.role}
            </span>
          </div>
        </div>

        {/* Customer Form Fields */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
          <div>
            <label className="block text-[11px] font-semibold text-[#1B263B] mb-1">
              Customer Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Ramesh Patel"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="w-full px-3 py-1.5 rounded-xl border border-slate-300 focus:outline-none focus:border-[#415A77]"
              required
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-[#1B263B] mb-1">
              Mobile Phone <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              placeholder="e.g. 9845012345"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              className="w-full px-3 py-1.5 rounded-xl border border-slate-300 font-mono focus:outline-none focus:border-[#415A77]"
              required
            />
          </div>

          <div>
            <label className="flex items-center justify-between text-[11px] font-semibold text-[#1B263B] mb-1">
              <span>Quotation Date</span>
              {quotationId && (
                <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 rounded">
                  Revision v{(version || 1) + 1}
                </span>
              )}
            </label>
            <input
              type="date"
              value={quotationDate}
              onChange={(e) => setQuotationDate(e.target.value)}
              className="w-full px-3 py-1.5 rounded-xl border border-slate-300 focus:outline-none focus:border-[#415A77]"
            />
            {quotationId && (
              <div className="mt-1 flex items-center justify-between text-[10px] text-slate-600">
                <span className="text-emerald-700 font-medium">Auto-updated to today</span>
                {originalQuotationDate && originalQuotationDate !== quotationDate ? (
                  <button
                    type="button"
                    onClick={() => setQuotationDate(originalQuotationDate)}
                    className="text-indigo-600 hover:text-indigo-800 underline font-medium cursor-pointer"
                    title={`Revert to original quote date (${new Date(originalQuotationDate).toLocaleDateString('en-GB')})`}
                  >
                    Keep Original ({new Date(originalQuotationDate).toLocaleDateString('en-GB')})
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setQuotationDate(new Date().toISOString().split('T')[0])}
                    className="text-blue-600 hover:text-blue-800 underline font-medium cursor-pointer"
                  >
                    Set to Today
                  </button>
                )}
              </div>
            )}
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-[#1B263B] mb-1">
              GSTIN (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. 29ABCDE1234F1Z5"
              value={customerGstin}
              onChange={(e) => setCustomerGstin(e.target.value)}
              className="w-full px-3 py-1.5 rounded-xl border border-slate-300 font-mono uppercase focus:outline-none focus:border-[#415A77]"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-[11px] font-semibold text-[#1B263B] mb-1">
              Delivery Address
            </label>
            <input
              type="text"
              placeholder="Street address, apartment, or flat number"
              value={deliveryAddress}
              onChange={(e) => setDeliveryAddress(e.target.value)}
              className="w-full px-3 py-1.5 rounded-xl border border-slate-300 focus:outline-none focus:border-[#415A77]"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-[#1B263B] mb-1">
              Site Location / City
            </label>
            <input
              type="text"
              placeholder="e.g. Whitefield, Bengaluru"
              value={siteLocation}
              onChange={(e) => setSiteLocation(e.target.value)}
              className="w-full px-3 py-1.5 rounded-xl border border-slate-300 focus:outline-none focus:border-[#415A77]"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-[#1B263B] mb-1">
              Project Name (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. Villa 42 Master Bath"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              className="w-full px-3 py-1.5 rounded-xl border border-slate-300 focus:outline-none focus:border-[#415A77]"
            />
          </div>
        </div>

        {/* Assisted Salesperson Split (Optional) */}
        <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center space-x-2">
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={enableSplitSale}
                onChange={(e) => handleToggleSplitSale(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-8 h-4.5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-indigo-600"></div>
            </label>
            <span className="font-semibold text-slate-800">
              Assisted Salesperson Split
            </span>
          </div>

          {enableSplitSale && (
            <div className="flex items-center space-x-3 bg-indigo-50/80 px-3 py-1.5 rounded-xl border border-indigo-200">
              <span className="text-[11px] font-semibold text-indigo-900">Assisted Rep:</span>
              <select
                value={assistedSalesPersonId || ''}
                onChange={(e) => {
                  const id = parseInt(e.target.value, 10);
                  setAssistedSalesPersonId(id);
                  const found = salesTeam.find((u) => u.id === id);
                  setAssistedSalesPersonName(found?.full_name || '');
                }}
                className="text-xs px-2 py-1 bg-white rounded-lg border border-indigo-300 font-semibold text-slate-800"
              >
                <option value="">-- Select Associate --</option>
                {salesTeam.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name} ({u.role})
                  </option>
                ))}
              </select>

              <span className="text-[11px] font-semibold text-indigo-900">Share:</span>
              <input
                type="number"
                min="0"
                max="100"
                value={assistedSalesSharePercent}
                onChange={(e) => {
                  const aPct = Math.max(0, Math.min(100, parseFloat(e.target.value) || 0));
                  setAssistedSalesSharePercent(aPct);
                  setPrimarySalesSharePercent(parseFloat((100 - aPct).toFixed(2)));
                }}
                className="w-14 text-xs px-2 py-1 bg-white rounded-lg border border-indigo-300 font-mono text-center font-bold"
              />
              <span className="text-xs font-bold text-indigo-900">%</span>
            </div>
          )}
        </div>
      </div>

      {/* 3. Sanitary Items Table Card */}
      <div className="bg-white/90 backdrop-blur-md rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-4 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse"></span>
            <span className="text-xs font-bold text-[#0D1B2A] uppercase tracking-wider">
              Sanitary Ware Line Items
            </span>
            <span className="text-xs font-normal text-slate-500">
              (Item Code, Description, Image, Qty in Nos, MRP, Discount %, Discounted Rate, Total)
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={handleToolbarPaste}
              className="px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-bold inline-flex items-center space-x-1.5 bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 transition-colors shadow-2xs"
              title="Paste image from clipboard into active/unfilled item"
            >
              <ClipboardPaste size={13} className="text-indigo-600" />
              <span>Paste Image</span>
            </button>
            <button
              type="button"
              onClick={() => setCatalogPickerOpen(true)}
              className="px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-bold inline-flex items-center space-x-1.5 bg-teal-50 border border-teal-300 text-teal-900 hover:bg-teal-100 transition-colors shadow-2xs"
              title="Browse catalog and insert items directly"
            >
              <Bath size={13} className="text-teal-700" />
              <span>Browse Catalog</span>
            </button>
            {canClearAll && (
              <button
                type="button"
                onClick={handleRemoveAllItems}
                className="px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-bold inline-flex items-center space-x-1.5 bg-rose-50 border border-rose-300 text-rose-700 hover:bg-rose-100 transition-colors shadow-2xs"
                title="Remove all items (Admin & Accounts only)"
              >
                <Trash2 size={13} className="text-rose-600" />
                <span>Remove All</span>
              </button>
            )}
            <button
              type="button"
              onClick={addItem}
              className="btn btn-primary text-xs px-2.5 sm:px-3 py-1.5 font-bold inline-flex items-center space-x-1.5 shadow-xs"
            >
              <Plus size={13} />
              <span>Add Item</span>
            </button>
          </div>
        </div>

        {/* Mobile View: Fixed Zero-Horizontal-Scroll Cards */}
        <div className="quotation-mobile-cards p-3 space-y-3">
          {items.map((item, index) => (
            <div
              key={index}
              className="bg-white rounded-xl border border-slate-200/90 p-3 shadow-2xs space-y-2.5 transition-all"
            >
              {/* Header: Sl #, Image Thumbnail / Upload, and Delete */}
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div className="flex items-center space-x-2.5">
                  <span className="w-6 h-6 rounded-md bg-[#1B263B] text-white font-mono font-bold text-xs flex items-center justify-center shadow-2xs">
                    {item.sl_no}
                  </span>
                  <span className="text-xs font-bold text-slate-800">
                    Sanitary Item #{item.sl_no}
                  </span>
                </div>

                <div className="flex items-center space-x-2">
                  {/* Image Thumbnail / Picker */}
                  <input
                    type="file"
                    accept="image/*"
                    ref={(el) => (fileInputRefs.current[index] = el)}
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        processImageUpload(e.target.files[0], index);
                      }
                    }}
                    className="hidden"
                  />

                  {item.item_image ? (
                    <div className="relative inline-block">
                      <img
                        src={item.item_image}
                        alt={item.item_code}
                        onClick={() => setEnlargedImage(item.item_image)}
                        className="w-8 h-8 object-cover rounded-md border border-slate-200 cursor-pointer"
                        title="Click to view full image"
                      />
                      <button
                        type="button"
                        onClick={() => updateItem(index, 'item_image', '')}
                        className="absolute -top-1 -right-1 bg-rose-500 text-white rounded-full p-0.5 hover:bg-rose-600"
                        title="Remove Image"
                      >
                        <X size={8} />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileInputRefs.current[index]?.click()}
                      className="px-2 py-0.5 rounded border border-dashed border-slate-300 text-slate-600 bg-slate-50 text-[10px] font-semibold"
                    >
                      + Image
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => removeItem(index)}
                    className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors"
                    title="Delete Item"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>

              {/* Item Code (with Catalog Autocomplete) */}
              <div>
                <label className="block text-[10px] font-semibold text-slate-600 mb-1">
                  Item Code (Auto-fetches details)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    data-mobile-sanitary-suggest={index}
                    placeholder="e.g. KB1011011"
                    value={item.item_code}
                    onChange={(e) => handleItemCodeChange(index, e.target.value, e.currentTarget)}
                    onFocus={(e) => {
                      if (item.item_code) handleItemCodeChange(index, item.item_code, e.currentTarget);
                    }}
                    onBlur={() => handleItemCodeBlur(index)}
                    className="sanitary-suggest-input w-full px-2.5 py-1.5 rounded-lg border border-slate-300 font-mono font-bold text-xs text-slate-900 focus:outline-none focus:border-[#415A77] bg-white"
                  />
                  {isSearchingCatalog && activeSuggestRow === index && (
                    <div className="absolute right-2.5 top-2">
                      <Loader2 size={12} className="animate-spin text-teal-600" />
                    </div>
                  )}
                </div>
              </div>

              {/* Item Description */}
              <div>
                <label className="block text-[10px] font-semibold text-slate-600 mb-1">
                  Item Description
                </label>
                <input
                  type="text"
                  placeholder="e.g. Wall Hung Rimless WC with Soft Close Seat Cover"
                  value={item.item_description}
                  onChange={(e) => updateItem(index, 'item_description', e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs text-slate-900 focus:outline-none focus:border-[#415A77] bg-white font-medium"
                />
              </div>

              {/* Qty & MRP Price (2 Columns) */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-semibold text-slate-600 mb-1">
                    Qty (Nos)
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={item.quantity}
                    onChange={(e) => updateItem(index, 'quantity', e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-right font-mono font-bold text-xs text-slate-900 focus:outline-none focus:border-[#415A77] bg-white"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-semibold text-slate-600 mb-1">
                    MRP Price (₹)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    placeholder="0.00"
                    value={item.mrp_price || ''}
                    onChange={(e) => updateItem(index, 'mrp_price', e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-right font-mono font-bold text-xs text-slate-900 focus:outline-none focus:border-[#415A77] bg-white"
                  />
                </div>
              </div>

              {/* Discount % & Discounted Price (2 Columns) */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-semibold text-slate-600 mb-1">
                    Discount %
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    placeholder="0"
                    value={item.discount_percent || ''}
                    onChange={(e) => updateItem(index, 'discount_percent', e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-right font-mono font-medium text-xs text-emerald-700 focus:outline-none focus:border-[#415A77] bg-white"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-semibold text-slate-600 mb-1">
                    Discounted Price (₹)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    placeholder="0.00"
                    value={item.discounted_price || ''}
                    onChange={(e) => updateItem(index, 'discounted_price', e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-right font-mono font-bold text-xs text-emerald-800 focus:outline-none focus:border-[#415A77] bg-emerald-50/40"
                  />
                </div>
              </div>

              {/* Total Price (Highlighted Bar) */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-100 bg-slate-50/70 -mx-3 -mb-3 px-3 py-2 rounded-b-xl">
                <span className="text-xs font-semibold text-slate-600">Total Price:</span>
                <span className="text-sm font-bold text-slate-900 font-mono tabular-nums">
                  ₹ {formatCurrency(item.total_price)}
                </span>
              </div>
            </div>
          ))}

          {/* Quick Add Next Item Button directly after the mobile item cards */}
          <button
            type="button"
            onClick={addItem}
            className="w-full py-2.5 px-3 rounded-xl border-2 border-dashed border-[#415A77]/40 hover:border-[#415A77] bg-white hover:bg-slate-50 text-[#1B263B] font-bold text-xs flex items-center justify-center space-x-1.5 shadow-2xs transition-all active:scale-[0.99]"
          >
            <Plus size={15} className="text-[#415A77]" />
            <span>+ Add Next Item</span>
          </button>
        </div>

        {/* Desktop View: Full Spreadsheet Table */}
        <div className="quotation-desktop-table overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-100/90 text-[11px] font-bold text-[#1B263B] uppercase tracking-wider border-b border-slate-200">
                <th className="py-2.5 px-3 w-12 text-center">Sl.</th>
                <th className="py-2.5 px-3 w-32">Item Code</th>
                <th className="py-2.5 px-3 min-w-[200px]">Item Description</th>
                <th className="py-2.5 px-3 w-24 text-center">Item Image</th>
                <th className="py-2.5 px-3 w-24 text-right">Qty (Nos)</th>
                <th className="py-2.5 px-3 w-32 text-right">MRP Price (₹)</th>
                <th className="py-2.5 px-3 w-24 text-right">Discount %</th>
                <th className="py-2.5 px-3 w-32 text-right">Discounted Price</th>
                <th className="py-2.5 px-3 w-36 text-right">Total Price (₹)</th>
                <th className="py-2.5 px-3 w-20 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {items.map((item, index) => (
                <tr
                  key={index}
                  className="hover:bg-slate-50/70 transition-colors"
                  onPaste={(e) => handleRowPaste(e, index)}
                >
                  {/* Sl. */}
                  <td className="py-3 px-3 text-center font-bold text-slate-600 align-middle">
                    {item.sl_no}
                  </td>

                  {/* Item Code with Autocomplete */}
                  <td className="py-3 px-3 align-middle relative">
                    <div className="relative">
                      <input
                        type="text"
                        data-sanitary-cell={`${index}-0`}
                        placeholder="e.g. KB1011011"
                        value={item.item_code}
                        onChange={(e) => handleItemCodeChange(index, e.target.value, e.currentTarget)}
                        onFocus={(e) => {
                          if (item.item_code) handleItemCodeChange(index, item.item_code, e.currentTarget);
                        }}
                        onBlur={() => handleItemCodeBlur(index)}
                        onKeyDown={(e) => handleSanitaryCellKeyDown(e, index, 0)}
                        className="sanitary-suggest-input w-full px-2.5 py-1.5 rounded-lg border border-slate-300 font-mono font-bold text-slate-900 focus:outline-none focus:border-[#415A77] bg-white"
                      />
                      {isSearchingCatalog && activeSuggestRow === index && (
                        <div className="absolute right-2 top-2.5">
                          <Loader2 size={12} className="animate-spin text-teal-600" />
                        </div>
                      )}
                    </div>
                  </td>

                  {/* Item Description */}
                  <td className="py-3 px-3 align-middle">
                    <input
                      type="text"
                      data-sanitary-cell={`${index}-1`}
                      placeholder="e.g. Wall Hung Rimless WC with Soft Close Seat Cover"
                      value={item.item_description}
                      onChange={(e) => updateItem(index, 'item_description', e.target.value)}
                      onKeyDown={(e) => handleSanitaryCellKeyDown(e, index, 1)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-900 focus:outline-none focus:border-[#415A77] bg-white font-medium"
                    />
                  </td>

                  {/* Item Image */}
                  <td className="py-3 px-3 text-center align-middle">
                    <input
                      type="file"
                      accept="image/*"
                      ref={(el) => (fileInputRefs.current[index] = el)}
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          processImageUpload(e.target.files[0], index);
                        }
                      }}
                      className="hidden"
                    />

                    {item.item_image ? (
                      <div className="relative inline-block group">
                        <img
                          src={item.item_image}
                          alt={item.item_code}
                          onClick={() => setEnlargedImage(item.item_image)}
                          className="w-12 h-12 object-cover rounded-lg border border-slate-200 shadow-2xs cursor-pointer hover:opacity-90 transition-opacity"
                          title="Click to view full image"
                        />
                        <button
                          type="button"
                          onClick={() => updateItem(index, 'item_image', '')}
                          className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white rounded-full p-0.5 hover:bg-rose-600 transition-colors shadow-2xs"
                          title="Remove Image"
                        >
                          <X size={10} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePasteFromClipboard(index)}
                          className="absolute -bottom-1 -right-1 bg-indigo-600 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 hover:bg-indigo-700 transition-all shadow-xs"
                          title="Replace with image from clipboard"
                        >
                          <ClipboardPaste size={10} />
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center space-y-1">
                        <button
                          type="button"
                          onClick={() => fileInputRefs.current[index]?.click()}
                          className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-lg border border-dashed border-slate-300 hover:border-slate-400 text-slate-600 hover:text-slate-800 bg-slate-50 text-[10px] font-semibold cursor-pointer w-full justify-center"
                          title="Upload product image file"
                        >
                          <Upload size={11} className="text-[#415A77]" />
                          <span>Upload</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePasteFromClipboard(index)}
                          className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-lg border border-dashed border-indigo-300 hover:border-indigo-400 text-indigo-700 hover:text-indigo-900 bg-indigo-50 text-[10px] font-semibold cursor-pointer w-full justify-center"
                          title="Paste image from clipboard (or press Ctrl+V on this row)"
                        >
                          <ClipboardPaste size={11} className="text-indigo-600" />
                          <span>Paste</span>
                        </button>
                      </div>
                    )}
                  </td>

                  {/* Quantity in Nos */}
                  <td className="py-3 px-3 text-right align-middle">
                    <input
                      type="number"
                      min="1"
                      step="1"
                      data-sanitary-cell={`${index}-2`}
                      value={item.quantity}
                      onChange={(e) => updateItem(index, 'quantity', e.target.value)}
                      onKeyDown={(e) => handleSanitaryCellKeyDown(e, index, 2)}
                      className="w-20 px-2 py-1.5 rounded-lg border border-slate-300 text-right font-mono font-bold text-slate-900 focus:outline-none focus:border-[#415A77] bg-white"
                    />
                  </td>

                  {/* MRP Price per Nos */}
                  <td className="py-3 px-3 text-right align-middle">
                    <input
                      type="number"
                      min="0"
                      step="any"
                      data-sanitary-cell={`${index}-3`}
                      placeholder="0.00"
                      value={item.mrp_price || ''}
                      onChange={(e) => updateItem(index, 'mrp_price', e.target.value)}
                      onKeyDown={(e) => handleSanitaryCellKeyDown(e, index, 3)}
                      className="w-28 px-2 py-1.5 rounded-lg border border-slate-300 text-right font-mono font-semibold text-slate-800 focus:outline-none focus:border-[#415A77] bg-white"
                    />
                  </td>

                  {/* Discount Percentage */}
                  <td className="py-3 px-3 text-right align-middle">
                    <div className="relative inline-block w-20">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.1"
                        data-sanitary-cell={`${index}-4`}
                        placeholder="0"
                        value={item.discount_percent || ''}
                        onChange={(e) => updateItem(index, 'discount_percent', e.target.value)}
                        onKeyDown={(e) => handleSanitaryCellKeyDown(e, index, 4)}
                        className="w-full pr-5 pl-2 py-1.5 rounded-lg border border-slate-300 text-right font-mono font-semibold text-amber-900 focus:outline-none focus:border-[#415A77] bg-amber-50/50"
                      />
                      <span className="absolute right-1.5 top-2 text-[10px] font-bold text-slate-400">
                        %
                      </span>
                    </div>
                  </td>

                  {/* Discounted Price per Nos */}
                  <td className="py-3 px-3 text-right align-middle">
                    <input
                      type="number"
                      min="0"
                      step="any"
                      data-sanitary-cell={`${index}-5`}
                      placeholder="0.00"
                      value={item.discounted_price || ''}
                      onChange={(e) => updateItem(index, 'discounted_price', e.target.value)}
                      onKeyDown={(e) => handleSanitaryCellKeyDown(e, index, 5)}
                      className="w-28 px-2 py-1.5 rounded-lg border border-slate-300 text-right font-mono font-bold text-slate-900 focus:outline-none focus:border-[#415A77] bg-white"
                    />
                  </td>

                  {/* Total Price */}
                  <td className="py-3 px-3 text-right align-middle font-mono font-bold text-[#0D1B2A] text-sm tabular-nums whitespace-nowrap">
                    ₹ {formatCurrency(item.total_price)}
                  </td>

                  {/* Actions */}
                  <td className="py-3 px-3 text-center align-middle whitespace-nowrap">
                    <div className="inline-flex items-center space-x-1">
                      <button
                        type="button"
                        onClick={() => duplicateItem(index)}
                        className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                        title="Duplicate Item Row"
                      >
                        <Copy size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeItem(index)}
                        className="p-1.5 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                        title="Delete Item"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Table Footer Controls */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <button
            type="button"
            onClick={addItem}
            className="btn btn-secondary text-xs px-3 py-1.5 font-bold inline-flex items-center space-x-1.5"
          >
            <Plus size={14} className="text-[#415A77]" />
            <span>Add Next Item</span>
          </button>

          <div className="text-xs text-slate-600 flex items-center space-x-4">
            <span>Total Items: <strong className="text-slate-900">{items.length}</strong></span>
            <span>Total Units: <strong className="text-slate-900">{totalPieces} Nos</strong></span>
            <span>Taxable Total: <strong className="text-slate-900 font-mono">₹ {formatCurrency(taxableAmount)}</strong></span>
          </div>
        </div>
      </div>

      {/* 4. Financial Calculations & Summary Card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Special Notes & Terms */}
        <div className="md:col-span-2 bg-white/90 backdrop-blur-md p-4 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
          <div className="flex items-center space-x-2 border-b border-slate-100 pb-2">
            <span className="text-xs font-bold text-[#0D1B2A] uppercase tracking-wider">
              Special Terms & Notes
            </span>
          </div>
          <textarea
            rows={4}
            placeholder="Special installation notes, brand warranty, delivery timeline, payment milestones, etc."
            value={specialNotes}
            onChange={(e) => setSpecialNotes(e.target.value)}
            className="w-full text-xs p-3 rounded-xl border border-slate-300 focus:outline-none focus:border-[#415A77]"
          />
          <div className="text-[11px] text-[#778DA9] italic">
            * Note: These terms will be automatically printed on the customer quotation PDF.
          </div>
        </div>

        {/* Financial Ledger */}
        <div className="bg-white/90 backdrop-blur-md p-4 rounded-2xl border border-slate-200/80 shadow-xs space-y-2.5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <span className="text-xs font-bold text-[#0D1B2A] uppercase tracking-wider">
              Financial Summary
            </span>
            <span className="text-[10px] font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
              Tax Computed
            </span>
          </div>

          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between text-slate-600">
              <span>Gross MRP Total:</span>
              <span className="font-mono font-semibold">₹ {formatCurrency(grossMrpTotal)}</span>
            </div>

            <div className="flex justify-between text-amber-700">
              <span>Overall Discount ({overallDiscountPercent}%):</span>
              <span className="font-mono font-semibold">- ₹ {formatCurrency(totalDiscountAmount)}</span>
            </div>

            <div className="flex justify-between text-slate-900 font-bold pt-1 border-t border-slate-100">
              <span>Taxable Value:</span>
              <span className="font-mono">₹ {formatCurrency(taxableAmount)}</span>
            </div>

            {/* Tax Selection */}
            <div className="py-1">
              <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">
                GST Tax Structure
              </label>
              <select
                value={taxType}
                onChange={(e) => setTaxType(e.target.value as any)}
                className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white font-medium"
              >
                <option value="cgst_sgst">Intra-State: CGST (9%) + SGST (9%) = 18%</option>
                <option value="igst">Inter-State: IGST (18%)</option>
                <option value="exempt">Tax Exempt (0%)</option>
              </select>
            </div>

            {taxType === 'cgst_sgst' && (
              <>
                <div className="flex justify-between text-slate-600">
                  <span>CGST @ 9%:</span>
                  <span className="font-mono">₹ {formatCurrency(cgstAmount)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>SGST @ 9%:</span>
                  <span className="font-mono">₹ {formatCurrency(sgstAmount)}</span>
                </div>
              </>
            )}

            {taxType === 'igst' && (
              <div className="flex justify-between text-slate-600">
                <span>IGST @ 18%:</span>
                <span className="font-mono">₹ {formatCurrency(igstAmount)}</span>
              </div>
            )}

            {roundOff !== 0 && (
              <div className="flex justify-between text-slate-500 text-[11px]">
                <span>Round Off:</span>
                <span className="font-mono">{roundOff > 0 ? `+ ₹ ${roundOff}` : `- ₹ ${Math.abs(roundOff)}`}</span>
              </div>
            )}

            <div className="pt-2 border-t border-slate-200">
              <div className="flex justify-between items-baseline">
                <span className="text-sm font-bold text-[#0D1B2A]">Net Payable:</span>
                <span className="text-lg font-bold text-[#0D1B2A] font-mono tabular-nums">
                  ₹ {formatCurrency(netTotal)}
                </span>
              </div>
              <div className="text-[10px] text-slate-500 font-medium italic mt-1 leading-snug">
                {amountInWords}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 5. Bottom Sticky Action Bar */}
      <div className="fixed bottom-0 left-0 md:left-56 right-0 bg-[#0D1B2A]/90 backdrop-blur-md border-t border-white/10 px-4 sm:px-6 py-3 flex items-center justify-between text-white z-40">
        <div className="flex items-center space-x-3 text-xs">
          <span>Net Total: <strong className="text-amber-300 font-mono text-sm ml-1">₹ {formatCurrency(netTotal)}</strong></span>
          <span className="text-white/30">|</span>
          <span>Items: <strong className="text-white font-semibold">{items.length}</strong></span>
          <span className="text-white/30">|</span>
          <span>Units: <strong className="text-white font-semibold">{totalPieces} Nos</strong></span>
        </div>

        <div className="flex items-center space-x-2.5">
          <button
            type="button"
            onClick={onBack}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={() => handleOpenPreview(false)}
            className="btn btn-secondary btn-sm text-xs px-3 py-1.5 font-semibold text-[#1B263B] border border-slate-300 shadow-2xs inline-flex items-center space-x-1"
          >
            <Printer size={13} className="text-[#415A77]" />
            <span>PDF</span>
          </button>

          <button
            type="button"
            onClick={() => handleOpenPreview(true)}
            className="btn btn-xs px-2.5 py-1.5 text-xs font-semibold bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs inline-flex items-center space-x-1"
          >
            <ShieldAlert size={13} className="text-amber-600" />
            <span>Encrypted</span>
          </button>

          {/* Draft button */}
          <button
            type="button"
            disabled={saving}
            onClick={() => saveQuotationData('draft')}
            className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-white/15 hover:bg-white/25 text-white transition-colors"
          >
            Save Draft
          </button>

          {/* In Review button */}
          <button
            type="button"
            disabled={saving}
            onClick={() => saveQuotationData('in_review')}
            className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white transition-colors"
          >
            Submit for Review
          </button>

          {/* Direct Approve (Admin / Manager) */}
          {canApprove && (
            <button
              type="button"
              disabled={saving}
              onClick={() => saveQuotationData('approved')}
              className="px-4 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
            >
              Approve Quotation
            </button>
          )}

          <button
            type="button"
            disabled={saving}
            onClick={handleSaveAndExit}
            className="btn btn-primary text-xs px-4 py-1.5 font-bold inline-flex items-center space-x-1.5 shadow-xs"
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            <span>Save & Exit</span>
          </button>
        </div>
      </div>

      {/* Enlarged Image Lightbox Modal */}
      {enlargedImage && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setEnlargedImage(null)}
        >
          <div
            className="relative bg-white rounded-2xl p-2 max-w-lg max-h-[80vh] overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={enlargedImage}
              alt="Sanitary Product"
              className="max-w-full max-h-[75vh] object-contain rounded-xl"
            />
            <button
              type="button"
              onClick={() => setEnlargedImage(null)}
              className="absolute top-4 right-4 bg-black/60 hover:bg-black text-white p-1.5 rounded-full transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* PDF Preview Modal */}
      {pdfPreviewOpen && savedQuotationId && (
        <PdfPreviewModal
          isOpen={pdfPreviewOpen}
          onClose={() => setPdfPreviewOpen(false)}
          pdfUrl={getPdfUrl(savedQuotationId, pdfIsEncrypted)}
          title={`Sanitary Quotation #${quotationNumber} ${pdfIsEncrypted ? '(Encrypted)' : ''}`}
          fileName={`Sanitary_Quotation_${quotationNumber || savedQuotationId}${pdfIsEncrypted ? '_Encrypted' : ''}.pdf`}
          quotationId={savedQuotationId}
          initialEncrypted={pdfIsEncrypted}
        />
      )}

      {/* Sanitary Catalog Visual Picker Modal */}
      <SanitaryCatalogPickerModal
        isOpen={catalogPickerOpen}
        onClose={() => setCatalogPickerOpen(false)}
        onSelectItem={handleSelectFromPicker}
      />

      {/* Floating Dropdown for Sanitary Catalog Matches (Rendered at root level with fixed position to prevent table/card clipping) */}
      {activeSuggestRow !== null && catalogSuggestions.length > 0 && suggestPosition && (
        <div
          style={{
            position: 'fixed',
            top: suggestPosition.top !== undefined ? `${suggestPosition.top}px` : undefined,
            bottom: suggestPosition.bottom !== undefined ? `${suggestPosition.bottom}px` : undefined,
            left: `${suggestPosition.left}px`,
            width: `${suggestPosition.width}px`,
            zIndex: 99999,
          }}
          className="sanitary-suggest-dropdown bg-white rounded-xl border border-slate-300 shadow-2xl max-h-72 overflow-y-auto divide-y divide-slate-100 animate-in fade-in zoom-in-95 duration-100"
        >
          <div className="px-3 py-1.5 bg-slate-100/90 text-[10px] font-bold text-slate-600 uppercase tracking-wider flex items-center justify-between sticky top-0 border-b border-slate-200 z-10 backdrop-blur-sm">
            <span className="flex items-center space-x-1.5 text-slate-700">
              <Sparkles size={11} className="text-teal-600" />
              <span>Catalog Matches ({catalogSuggestions.length})</span>
            </span>
            <span className="text-teal-700 font-semibold">Click / Enter to Auto-Fill</span>
          </div>
          {catalogSuggestions.map((cat, cIdx) => (
            <div
              key={cat.id || cIdx}
              onMouseDown={(e) => {
                e.preventDefault();
                applyCatalogItem(activeSuggestRow, cat);
              }}
              className={`p-2 flex items-center space-x-2.5 cursor-pointer transition-colors text-left ${
                cIdx === catalogHighlightIndex
                  ? 'bg-teal-50 text-teal-900 font-semibold'
                  : 'hover:bg-slate-50 text-slate-800'
              }`}
            >
              {cat.item_image ? (
                <img
                  src={cat.item_image}
                  alt={cat.item_code}
                  className="w-10 h-10 object-cover rounded-lg border border-slate-200 shrink-0 bg-white"
                />
              ) : (
                <div className="w-10 h-10 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0 text-slate-400">
                  <Bath size={16} />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-xs text-teal-900 truncate">
                    {cat.item_code}
                  </span>
                  <span className="font-mono font-bold text-xs text-slate-900 shrink-0 ml-2">
                    ₹{formatCurrency(cat.mrp_price)}
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 truncate mt-0.5">
                  {cat.item_description}
                </p>
                {cat.brand && (
                  <span className="inline-block text-[9px] font-semibold px-1.5 py-0.2 bg-slate-100 text-slate-600 rounded mt-0.5">
                    {cat.brand}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {/* Quotation Edit & Version History Modal */}
      {historyModalOpen && quotationId && (
        <QuotationHistoryModal
          quotationId={quotationId}
          quotationNumber={quotationNumber || String(quotationId)}
          isOpen={historyModalOpen}
          onClose={() => setHistoryModalOpen(false)}
          onRestored={() => {
            loadQuotation(quotationId);
          }}
        />
      )}
    </div>
  );
};
