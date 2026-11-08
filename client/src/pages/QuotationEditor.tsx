import React, { useState, useEffect, useRef } from 'react';
import { useServer } from '../context/ServerContext';
import { useAuth } from '../context/AuthContext';
import { Quotation, QuotationArea, QuotationItem, Customer, TileBrand, BrandSizeCoverage, User, ProductType, TileCatalogItem } from '../types';
import {
  Save,
  ArrowLeft,
  Plus,
  Trash2,
  Printer,
  UserCheck,
  Building2,
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
  User as UserIcon,
  Award,
  Percent,
  ShieldAlert,
  History,
} from 'lucide-react';
import { PdfPreviewModal } from '../components/PdfPreviewModal';
import { QuotationHistoryModal } from '../components/QuotationHistoryModal';
import { numberToWordsIndian } from '../utils/numberToWords';
import { calculateQuotationDiscountAndTotals, isCeraBrand } from '../utils/discountCalculator';
import { buildEncryptedProductMap, derive3LetterCode } from '../utils/encryptedCode';

const formatCurrency = (val: number) => {
  return Number(val || 0).toLocaleString('en-IN', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  });
};

interface Props {
  quotationId?: number | null;
  onBack: () => void;
  onSaved: (id: number) => void;
}

export const QuotationEditor: React.FC<Props> = ({ quotationId, onBack, onSaved }) => {
  const { fetchApi, getPdfUrl } = useServer();
  const { user } = useAuth();

  const isAdmin = user?.role === 'admin';
  const isAccounts = user?.role === 'accounts' || (user?.role as string) === 'accountant';
  const canClearAll = isAdmin || isAccounts;

  // Reference data
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [brands, setBrands] = useState<TileBrand[]>([]);
  const [coverages, setCoverages] = useState<BrandSizeCoverage[]>([]);

  // Form State
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerGstin, setCustomerGstin] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [siteLocation, setSiteLocation] = useState('');
  const [projectName, setProjectName] = useState('');
  const [quotationDate, setQuotationDate] = useState(new Date().toISOString().split('T')[0]);
  const [originalQuotationDate, setOriginalQuotationDate] = useState<string | null>(null);
  const [specialNotes, setSpecialNotes] = useState('');
  const [discountPercent, setDiscountPercent] = useState<number>(0);
  const [discountAmount, setDiscountAmount] = useState<number>(0);
  const [taxType, setTaxType] = useState<'cgst_sgst' | 'igst' | 'exempt'>('cgst_sgst');

  const [version, setVersion] = useState<number>(1);
  const [quotationNumber, setQuotationNumber] = useState<string>('');
  const [status, setStatus] = useState<'draft' | 'in_review' | 'approved' | 'closed'>('draft');

  // Split Sales / Assisted Salesperson State
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

  // Customer Autocomplete & Live Lookup State
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Customer[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activePopupSource, setActivePopupSource] = useState<'search' | 'phone' | 'name' | null>(null);
  const [isSearchingCustomer, setIsSearchingCustomer] = useState(false);
  const [exactPhoneMatch, setExactPhoneMatch] = useState<Customer | null>(null);
  const [highlightIndex, setHighlightIndex] = useState(0);

  const customerDropdownRef = useRef<HTMLDivElement>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Saved Tile Items Autocomplete & Memory State
  const [savedTileItems, setSavedTileItems] = useState<TileCatalogItem[]>([]);
  const [activeTileSuggestRow, setActiveTileSuggestRow] = useState<{ areaIdx: number; itemIdx: number } | null>(null);
  const [tileSuggestions, setTileSuggestions] = useState<TileCatalogItem[]>([]);
  const [tileHighlightIndex, setTileHighlightIndex] = useState(0);
  const [suggestPosition, setSuggestPosition] = useState<{
    top?: number;
    bottom?: number;
    left: number;
    width: number;
  } | null>(null);

  // Helper to calculate screen position for floating dropdown (prevents clipping by table overflow)
  const updateSuggestPosition = (el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const showAbove = spaceBelow < 280 && rect.top > 280;
    const maxAvailableWidth = Math.max(280, window.innerWidth - 24);
    const width = Math.min(maxAvailableWidth, Math.max(rect.width, Math.min(420, maxAvailableWidth)));

    setSuggestPosition({
      top: showAbove ? undefined : rect.bottom + 4,
      bottom: showAbove ? window.innerHeight - rect.top + 4 : undefined,
      left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
      width,
    });
  };

  // Close suggestions on outside click and update on scroll/resize
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        customerDropdownRef.current &&
        !customerDropdownRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
      }
      const target = event.target as HTMLElement;
      if (!target.closest('.tile-suggest-dropdown') && !target.closest('.tile-suggest-input')) {
        setActiveTileSuggestRow(null);
        setSuggestPosition(null);
      }
    };

    const handleScrollOrResize = () => {
      if (activeTileSuggestRow) {
        const el = document.querySelector<HTMLElement>(
          `[data-cell="${activeTileSuggestRow.areaIdx}-${activeTileSuggestRow.itemIdx}-0"], [data-mobile-suggest="${activeTileSuggestRow.areaIdx}-${activeTileSuggestRow.itemIdx}"]`
        );
        if (el) {
          updateSuggestPosition(el);
        } else {
          setActiveTileSuggestRow(null);
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
  }, [activeTileSuggestRow]);

  // Live customer lookup triggered as user types
  const triggerCustomerLookup = (queryText: string, source: 'search' | 'phone' | 'name') => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    const trimmed = queryText.trim();
    const cleanDigits = queryText.replace(/\D/g, '');

    if (!trimmed) {
      setSuggestions([]);
      setShowSuggestions(false);
      setExactPhoneMatch(null);
      return;
    }

    // Fast local exact phone match check from cached customers
    if (source === 'phone' && cleanDigits.length >= 7) {
      const quick = customers.find((c) => {
        const cDigits = (c.mobile_number || '').replace(/\D/g, '');
        return cDigits === cleanDigits || (cleanDigits.length >= 10 && cDigits.endsWith(cleanDigits));
      });
      if (quick) {
        setExactPhoneMatch(quick);
      }
    }

    if (trimmed.length < 2) {
      setShowSuggestions(false);
      return;
    }

    setIsSearchingCustomer(true);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const res = await fetchApi(`/api/customers/lookup?q=${encodeURIComponent(trimmed)}`);
        const found: Customer[] = res.customers || [];
        setSuggestions(found);
        setHighlightIndex(0);
        setShowSuggestions(found.length > 0);
        setActivePopupSource(source);

        if (source === 'phone' && cleanDigits.length >= 7) {
          const matched = found.find((c) => {
            const cDigits = (c.mobile_number || '').replace(/\D/g, '');
            return cDigits === cleanDigits || (cleanDigits.length >= 10 && cDigits.endsWith(cleanDigits));
          });
          setExactPhoneMatch(matched || null);
        }
      } catch (err) {
        console.error('Customer lookup error:', err);
      } finally {
        setIsSearchingCustomer(false);
      }
    }, 200);
  };

  // Auto-fill all customer details from database record
  const handleApplyCustomer = (selected: Customer) => {
    setCustomerId(selected.id);
    setCustomerName(selected.name);
    setCustomerPhone(selected.mobile_number);
    setCustomerGstin(selected.gstin || '');
    setDeliveryAddress(selected.delivery_address || '');
    setSiteLocation(selected.site_location || '');
    if (!projectName && (selected.site_location || selected.notes)) {
      setProjectName(selected.site_location || selected.notes || '');
    }
    setShowSuggestions(false);
    setActivePopupSource(null);
    setExactPhoneMatch(null);
    setCustomerSearchQuery('');
  };

  const handleUnlinkCustomer = () => {
    setCustomerId(null);
  };

  const handleKeyDownOnInput = (e: React.KeyboardEvent) => {
    if (!showSuggestions || suggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex((prev) => Math.min(prev + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      if (suggestions[highlightIndex]) {
        e.preventDefault();
        handleApplyCustomer(suggestions[highlightIndex]);
      }
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  // Reusable Auto-popup dropdown component
  const renderSuggestionsPopup = (source: 'search' | 'phone' | 'name') => {
    if (!showSuggestions || activePopupSource !== source || suggestions.length === 0) {
      return null;
    }

    return (
      <div
        ref={customerDropdownRef}
        className="absolute left-0 top-full mt-1.5 z-50 bg-white border border-[#CBD5E1] rounded-lg shadow-2xl overflow-hidden divide-y divide-slate-100 max-h-72 overflow-y-auto w-full md:w-[420px] animate-dropdown-open"
      >
        <div className="bg-slate-50 px-3 py-1.5 flex items-center justify-between text-[11px] text-slate-500 font-semibold border-b border-slate-200">
          <div className="flex items-center space-x-1.5">
            <UserCheck size={12} className="text-slate-600" />
            <span>Customer Records Found ({suggestions.length})</span>
          </div>
          <span className="text-[10px] text-slate-400">Click or Enter to Auto-Fill</span>
        </div>

        {suggestions.map((c, idx) => {
          const isSelected = idx === highlightIndex;
          return (
            <div
              key={c.id}
              onClick={() => handleApplyCustomer(c)}
              onMouseEnter={() => setHighlightIndex(idx)}
              className={`p-2.5 cursor-pointer transition-colors flex items-center justify-between ${
                isSelected ? 'bg-primary-50/80 text-primary-950' : 'hover:bg-slate-50'
              }`}
            >
              <div className="space-y-0.5 min-w-0 pr-2">
                <div className="flex items-center space-x-2">
                  <span className="font-bold text-xs text-slate-900 truncate">{c.name}</span>
                  {c.gstin && (
                    <span className="px-1.5 py-0.2 bg-slate-100 text-slate-600 text-[10px] font-mono rounded border border-slate-200">
                      GST: {c.gstin}
                    </span>
                  )}
                </div>
                <div className="flex items-center space-x-3 text-[11px] text-slate-600">
                  <span className="inline-flex items-center space-x-1 font-mono text-primary-700 font-semibold">
                    <Phone size={10} className="shrink-0" />
                    <span>{c.mobile_number}</span>
                  </span>
                  {(c.site_location || c.delivery_address) && (
                    <span className="inline-flex items-center space-x-1 text-slate-500 truncate max-w-[200px]">
                      <MapPin size={10} className="shrink-0" />
                      <span className="truncate">{c.site_location || c.delivery_address}</span>
                    </span>
                  )}
                </div>
              </div>

              <button
                type="button"
                className={`btn btn-xs shrink-0 text-[10px] font-semibold px-2.5 py-1 ${
                  isSelected ? 'btn-primary' : 'btn-secondary'
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  handleApplyCustomer(c);
                }}
              >
                Auto-fill All Details →
              </button>
            </div>
          );
        })}
      </div>
    );
  };

  // Areas and Items
  const [areas, setAreas] = useState<Array<{ name: string; items: QuotationItem[] }>>([
    {
      name: 'GROUND FLOOR',
      items: [
        {
          sl_no: 1,
          description: 'OMBRA EMERALD ULTRA - SS',
          size: '1200X1800',
          brand: 'Simpolo Ceramics',
          product_type: 'box',
          coverage_area: 46.5,
          quantity_sqft: 326,
          base_rate_per_sqft: 145,
          rate_per_sqft: 145,
          quantity_boxes: 7,
          base_rate_per_box: 6743,
          rate_per_box: 6743,
          discount_percent: 0,
          discount_amount: 0,
          total_amount: 47197.5,
        },
      ],
    },
  ]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // PDF Preview State
  const [previewPdf, setPreviewPdf] = useState<{
    url: string;
    title: string;
    fileName: string;
    quotationId?: number;
    initialEncrypted?: boolean;
  } | null>(null);

  // Load Reference Data
  useEffect(() => {
    fetchApi('/api/customers?limit=100').then((res) => setCustomers(res.customers || [])).catch(() => {});
    fetchApi('/api/products/brands').then((res) => setBrands(res.brands || [])).catch(() => {});
    fetchApi('/api/products/coverages').then((res) => setCoverages(res.coverages || [])).catch(() => {});
    fetchApi('/api/products/tile-items?limit=100').then((res) => setSavedTileItems(res.items || [])).catch(() => {});
    fetchApi('/api/users').then((res) => {
      const all: User[] = res.users || [];
      setSalesTeam(all.filter((u) => u.is_active));
    }).catch(() => {});
  }, []);

  // Load Existing Quotation if editing
  const loadExistingQuotation = (qId: number) => {
    fetchApi(`/api/quotations/${qId}`)
      .then((res) => {
        const q: Quotation = res.quotation;
        setCustomerId(q.customer_id || null);
        setCustomerName(q.customer_name);
        setCustomerPhone(q.customer_phone);
        setCustomerGstin(q.customer_gstin || '');
        setDeliveryAddress(q.delivery_address || '');
        setSiteLocation(q.site_location || '');
        setProjectName(q.project_name || '');
        const origDate = q.quotation_date.split('T')[0];
        setOriginalQuotationDate(origDate);
        // Automatically set date to today for quotation updates/revisions
        const todayStr = new Date().toISOString().split('T')[0];
        setQuotationDate(todayStr);
        setSpecialNotes(q.special_notes || '');
        setDiscountPercent(parseFloat(String(q.discount_percent)) || 0);
        setDiscountAmount(parseFloat(String(q.discount_amount)) || 0);
        setTaxType(q.tax_type || 'cgst_sgst');
        setVersion(q.version || 1);
        setQuotationNumber(q.quotation_number);
        setStatus((q.status as any) || 'draft');
        setPrimarySalesPersonName(q.sales_person_name || '');

        if (q.assisted_sales_person_id) {
          setEnableSplitSale(true);
          setAssistedSalesPersonId(q.assisted_sales_person_id);
          setAssistedSalesPersonName(q.assisted_sales_person_name || '');
          setSplitShareType((q.split_share_type as any) || 'percentage');
          setPrimarySalesSharePercent(parseFloat(String(q.primary_sales_share_percent)) || 50);
          setPrimarySalesShareAmount(parseFloat(String(q.primary_sales_share_amount)) || 0);
          setAssistedSalesSharePercent(parseFloat(String(q.assisted_sales_share_percent)) || 50);
          setAssistedSalesShareAmount(parseFloat(String(q.assisted_sales_share_amount)) || 0);
        } else {
          setEnableSplitSale(false);
          setAssistedSalesPersonId(null);
          setAssistedSalesPersonName('');
          setSplitShareType('percentage');
          setPrimarySalesSharePercent(100);
          setAssistedSalesSharePercent(0);
        }

        if (Array.isArray(res.areas) && res.areas.length > 0) {
          setAreas(
            res.areas.map((a: any) => ({
              name: a.area_name,
              items: (a.items || []).map((it: any) => ({
                ...it,
                base_rate_per_sqft: parseFloat(it.base_rate_per_sqft) || parseFloat(it.rate_per_sqft) || 0,
                base_rate_per_box: parseFloat(it.base_rate_per_box) || parseFloat(it.rate_per_box) || 0,
                discount_percent: parseFloat(it.discount_percent) || 0,
                discount_amount: parseFloat(it.discount_amount) || 0,
              })),
            }))
          );
        }
      })
      .catch((err) => setError(err.message));
  };

  useEffect(() => {
    if (quotationId) {
      loadExistingQuotation(quotationId);
    }
  }, [quotationId]);

  // Customer Select Handler
  const handleSelectCustomer = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const custId = parseInt(e.target.value, 10);
    const selected = customers.find((c) => c.id === custId);
    if (selected) {
      handleApplyCustomer(selected);
    }
  };

  // Add Room/Area
  const handleAddArea = () => {
    setAreas([...areas, { name: `ROOM / AREA ${areas.length + 1}`, items: [] }]);
  };

  const handleRemoveArea = (areaIdx: number) => {
    if (areas.length === 1) {
      alert('Quotation must contain at least one area.');
      return;
    }
    setAreas(areas.filter((_, idx) => idx !== areaIdx));
  };

  const handleRemoveAllItems = () => {
    if (!canClearAll) return;
    if (window.confirm('Are you sure you want to remove all items and rooms from this tile quotation? This action cannot be undone.')) {
      const defaultBrand = brands[0]?.name || 'Simpolo Ceramics';
      setAreas([
        {
          name: 'AREA 1',
          items: [
            {
              sl_no: 1,
              description: '',
              size: '1200X1800',
              brand: defaultBrand,
              product_type: 'box',
              coverage_area: 0,
              quantity_sqft: 0,
              base_rate_per_sqft: 0,
              rate_per_sqft: 0,
              quantity_boxes: 0,
              base_rate_per_box: 0,
              rate_per_box: 0,
              discount_percent: 0,
              discount_amount: 0,
              total_amount: 0,
            },
          ],
        },
      ]);
    }
  };

  // Add Item to Area
  const handleAddItem = (areaIdx: number) => {
    const newAreas = [...areas];
    const defaultBrand = brands[0]?.name || 'Simpolo Ceramics';
    const brandObj = brands[0];
    const brandSizes = coverages.filter(
      (c) =>
        (brandObj && c.brand_id === brandObj.id) ||
        (c.brand_name && c.brand_name.toLowerCase() === defaultBrand.toLowerCase())
    );
    const firstCov = brandSizes[0];
    const defaultSize = firstCov?.size || '1200X1800';
    const defaultProductType = ((firstCov?.product_type || 'box').toLowerCase()) as ProductType;
    const defaultCovSqft = firstCov?.coverage_sqft ?? 46.5;
    const defaultRateSqft = firstCov?.default_rate_sqft ?? 120;
    const defaultRateBox =
      firstCov?.default_rate_box ??
      (defaultProductType === 'box' ? defaultRateSqft * defaultCovSqft : 5580);

    const isBox = defaultProductType === 'box';
    const isSqft = defaultProductType === 'sqft';
    const isUnit = ['bags', 'pieces', 'nos'].includes(defaultProductType);

    const initialSqft = isBox || isSqft ? 100 : 0;
    const initialBoxes = isBox
      ? defaultCovSqft > 0
        ? parseFloat((100 / defaultCovSqft).toFixed(2))
        : 2.15
      : isUnit
      ? 10
      : 0;

    const initialTotal =
      isBox || isSqft
        ? parseFloat((initialSqft * defaultRateSqft).toFixed(2))
        : parseFloat((initialBoxes * defaultRateBox).toFixed(2));

    newAreas[areaIdx].items.push({
      sl_no: newAreas[areaIdx].items.length + 1,
      description: 'Vitrified Surface Tile',
      size: defaultSize,
      brand: defaultBrand,
      product_type: defaultProductType,
      coverage_area: isBox ? defaultCovSqft : 0,
      quantity_sqft: initialSqft,
      base_rate_per_sqft: defaultRateSqft,
      rate_per_sqft: defaultRateSqft,
      quantity_boxes: initialBoxes,
      base_rate_per_box: defaultRateBox,
      rate_per_box: defaultRateBox,
      discount_percent: 0,
      discount_amount: 0,
      total_amount: initialTotal,
    });
    setAreas(newAreas);

    setTimeout(() => {
      const addedIdx = newAreas[areaIdx].items.length - 1;
      const mobileInput = document.querySelector<HTMLElement>(
        `[data-mobile-suggest="${areaIdx}-${addedIdx}"]`
      );
      if (mobileInput) {
        mobileInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        mobileInput.focus();
      } else {
        const desktopInput = document.querySelector<HTMLElement>(
          `[data-cell="${areaIdx}-${addedIdx}-0"]`
        );
        if (desktopInput) {
          desktopInput.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          desktopInput.focus();
        }
      }
    }, 120);
  };

  const handleRemoveItem = (areaIdx: number, itemIdx: number) => {
    const newAreas = [...areas];
    newAreas[areaIdx].items = newAreas[areaIdx].items.filter((_, idx) => idx !== itemIdx);
    setAreas(newAreas);
  };

  // Item Field Change with Bidirectional Sqft <-> Box / Unit Calculation
  const handleItemChange = (
    areaIdx: number,
    itemIdx: number,
    field: keyof QuotationItem,
    val: any
  ) => {
    const newAreas = [...areas];
    const item = { ...newAreas[areaIdx].items[itemIdx], [field]: val };
    const pType = (item.product_type || 'box').toLowerCase();

    const cov = parseFloat(String(item.coverage_area)) || 1;
    let sqft = parseFloat(String(item.quantity_sqft)) || 0;
    let rSqft = parseFloat(String(item.rate_per_sqft)) || 0;
    let boxes = parseFloat(String(item.quantity_boxes)) || 0;
    let rBox = parseFloat(String(item.rate_per_box)) || 0;

    // Automatic calculation dependencies
    if (field === 'brand') {
      const selectedBrandName = String(val);
      item.brand = selectedBrandName;
      const brandObj = brands.find(
        (b) => b.name.toLowerCase() === selectedBrandName.toLowerCase()
      );
      const brandSizes = coverages.filter(
        (c) =>
          (brandObj && c.brand_id === brandObj.id) ||
          (c.brand_name && c.brand_name.toLowerCase() === selectedBrandName.toLowerCase())
      );

      // Check if current item.size exists in the newly selected brand
      const currentSizeMatch = brandSizes.find(
        (c) => c.size.toLowerCase() === (item.size || '').toLowerCase()
      );

      const targetCoverage = currentSizeMatch || brandSizes[0];
      if (targetCoverage) {
        item.size = targetCoverage.size;
        const matchedType = (targetCoverage.product_type || 'box').toLowerCase();
        item.product_type = matchedType as any;
        if (matchedType === 'sqft') {
          item.coverage_area = 0;
          item.quantity_boxes = 0;
          item.rate_per_box = 0;
          item.base_rate_per_box = 0;
          item.base_rate_per_sqft = targetCoverage.default_rate_sqft || rSqft;
          item.rate_per_sqft = item.base_rate_per_sqft;
          item.total_amount = parseFloat((sqft * item.rate_per_sqft).toFixed(2));
        } else if (['bags', 'pieces', 'nos'].includes(matchedType)) {
          item.coverage_area = 0;
          item.quantity_sqft = 0;
          item.rate_per_sqft = 0;
          item.base_rate_per_sqft = 0;
          const unitRate = targetCoverage.default_rate_box || targetCoverage.default_rate_sqft || rBox;
          item.base_rate_per_box = unitRate;
          item.rate_per_box = unitRate;
          item.total_amount = parseFloat((boxes * unitRate).toFixed(2));
        } else {
          // 'box'
          item.coverage_area = targetCoverage.coverage_sqft;
          item.base_rate_per_sqft = targetCoverage.default_rate_sqft || rSqft;
          item.rate_per_sqft = item.base_rate_per_sqft;
          item.base_rate_per_box = targetCoverage.default_rate_box || (item.base_rate_per_sqft * targetCoverage.coverage_sqft);
          item.rate_per_box = item.base_rate_per_box;
          if (targetCoverage.coverage_sqft > 0 && sqft > 0) {
            item.quantity_boxes = parseFloat((sqft / targetCoverage.coverage_sqft).toFixed(2));
          }
          item.total_amount = parseFloat((sqft * item.rate_per_sqft).toFixed(2));
        }
      }
    } else if (field === 'size') {
      const brandObj = brands.find(
        (b) => b.name.toLowerCase() === (item.brand || '').toLowerCase()
      );
      const match = coverages.find(
        (c) =>
          ((brandObj && c.brand_id === brandObj.id) ||
            (c.brand_name && c.brand_name.toLowerCase() === (item.brand || '').toLowerCase())) &&
          c.size.toLowerCase() === String(val).toLowerCase()
      ) || coverages.find((c) => c.size.toLowerCase() === String(val).toLowerCase());

      if (match) {
        const matchedType = (match.product_type || 'box').toLowerCase();
        item.product_type = matchedType as any;
        if (matchedType === 'sqft') {
          item.coverage_area = 0;
          item.quantity_boxes = 0;
          item.rate_per_box = 0;
          item.base_rate_per_box = 0;
          item.base_rate_per_sqft = match.default_rate_sqft || rSqft;
          item.rate_per_sqft = item.base_rate_per_sqft;
          item.total_amount = parseFloat((sqft * item.rate_per_sqft).toFixed(2));
        } else if (['bags', 'pieces', 'nos'].includes(matchedType)) {
          item.coverage_area = 0;
          item.quantity_sqft = 0;
          item.rate_per_sqft = 0;
          item.base_rate_per_sqft = 0;
          const unitRate = match.default_rate_box || match.default_rate_sqft || rBox;
          item.base_rate_per_box = unitRate;
          item.rate_per_box = unitRate;
          item.total_amount = parseFloat((boxes * unitRate).toFixed(2));
        } else {
          // 'box'
          item.coverage_area = match.coverage_sqft;
          item.base_rate_per_sqft = match.default_rate_sqft || rSqft;
          item.rate_per_sqft = item.base_rate_per_sqft;
          item.base_rate_per_box = match.default_rate_box || (item.base_rate_per_sqft * match.coverage_sqft);
          item.rate_per_box = item.base_rate_per_box;
          if (match.coverage_sqft > 0 && sqft > 0) {
            item.quantity_boxes = parseFloat((sqft / match.coverage_sqft).toFixed(2));
          }
          item.total_amount = parseFloat((sqft * item.rate_per_sqft).toFixed(2));
        }
      }
    } else if (field === 'product_type') {
      const newType = String(val).toLowerCase();
      item.product_type = newType as any;
      if (newType === 'sqft') {
        item.coverage_area = 0;
        item.quantity_boxes = 0;
        item.rate_per_box = 0;
        item.base_rate_per_box = 0;
        item.total_amount = parseFloat((sqft * rSqft).toFixed(2));
      } else if (['bags', 'pieces', 'nos'].includes(newType)) {
        item.coverage_area = 0;
        item.quantity_sqft = 0;
        item.rate_per_sqft = 0;
        item.base_rate_per_sqft = 0;
        item.total_amount = parseFloat((boxes * rBox).toFixed(2));
      } else {
        // 'box'
        boxes = cov > 0 ? parseFloat((sqft / cov).toFixed(2)) : 0;
        rBox = cov > 0 ? parseFloat((rSqft * cov).toFixed(2)) : 0;
        item.quantity_boxes = boxes;
        item.rate_per_box = rBox;
        item.base_rate_per_box = rBox;
        item.base_rate_per_sqft = rSqft;
        item.total_amount = parseFloat((sqft * rSqft).toFixed(2));
      }
    } else if (pType === 'sqft') {
      if (field === 'quantity_sqft') {
        sqft = parseFloat(val) || 0;
        item.total_amount = parseFloat((sqft * rSqft).toFixed(2));
      } else if (field === 'rate_per_sqft') {
        rSqft = parseFloat(val) || 0;
        item.base_rate_per_sqft = rSqft;
        item.rate_per_sqft = rSqft;
        item.total_amount = parseFloat((sqft * rSqft).toFixed(2));
      }
    } else if (['bags', 'pieces', 'nos'].includes(pType)) {
      if (field === 'quantity_boxes') {
        boxes = parseFloat(val) || 0;
        item.total_amount = parseFloat((boxes * rBox).toFixed(2));
      } else if (field === 'rate_per_box') {
        rBox = parseFloat(val) || 0;
        item.base_rate_per_box = rBox;
        item.rate_per_box = rBox;
        item.total_amount = parseFloat((boxes * rBox).toFixed(2));
      }
    } else {
      // Standard 'box' bidirectional calculations
      if (field === 'quantity_sqft') {
        sqft = parseFloat(val) || 0;
        boxes = cov > 0 ? parseFloat((sqft / cov).toFixed(2)) : 0;
        item.quantity_boxes = boxes;
        item.total_amount = parseFloat((sqft * rSqft).toFixed(2));
      } else if (field === 'quantity_boxes') {
        boxes = parseFloat(val) || 0;
        sqft = cov > 0 ? parseFloat((boxes * cov).toFixed(2)) : 0;
        item.quantity_sqft = sqft;
        item.total_amount = parseFloat((sqft * rSqft).toFixed(2));
      } else if (field === 'rate_per_sqft') {
        rSqft = parseFloat(val) || 0;
        rBox = cov > 0 ? parseFloat((rSqft * cov).toFixed(2)) : 0;
        item.base_rate_per_sqft = rSqft;
        item.base_rate_per_box = rBox;
        item.rate_per_sqft = rSqft;
        item.rate_per_box = rBox;
        item.total_amount = parseFloat((sqft * rSqft).toFixed(2));
      } else if (field === 'rate_per_box') {
        rBox = parseFloat(val) || 0;
        rSqft = cov > 0 ? parseFloat((rBox / cov).toFixed(2)) : 0;
        item.base_rate_per_box = rBox;
        item.base_rate_per_sqft = rSqft;
        item.rate_per_box = rBox;
        item.rate_per_sqft = rSqft;
        item.total_amount = parseFloat((sqft * rSqft).toFixed(2));
      } else if (field === 'coverage_area') {
        const newCov = parseFloat(val) || 1;
        boxes = newCov > 0 ? parseFloat((sqft / newCov).toFixed(2)) : 0;
        item.quantity_boxes = boxes;
        item.rate_per_box = parseFloat((rSqft * newCov).toFixed(2));
        item.base_rate_per_box = item.rate_per_box;
      }
    }

    newAreas[areaIdx].items[itemIdx] = item;
    setAreas(newAreas);
  };

  // Saved Tile Item Lookup & Autocomplete Handler
  const handleDescriptionChange = (
    areaIdx: number,
    itemIdx: number,
    text: string,
    targetEl?: HTMLElement | null
  ) => {
    handleItemChange(areaIdx, itemIdx, 'description', text);
    const q = text.trim().toLowerCase();
    if (q.length >= 1) {
      const matches = savedTileItems.filter(
        (item) =>
          item.description.toLowerCase().includes(q) ||
          (item.brand && item.brand.toLowerCase().includes(q))
      ).slice(0, 8);
      setTileSuggestions(matches);
      setActiveTileSuggestRow({ areaIdx, itemIdx });
      setTileHighlightIndex(0);

      const el =
        targetEl ||
        document.querySelector<HTMLElement>(
          `[data-cell="${areaIdx}-${itemIdx}-0"], [data-mobile-suggest="${areaIdx}-${itemIdx}"]`
        );
      if (el) {
        updateSuggestPosition(el);
      }
    } else {
      setActiveTileSuggestRow(null);
      setSuggestPosition(null);
    }
  };

  const handleDescriptionBlur = (areaIdx: number, itemIdx: number) => {
    setTimeout(() => {
      setActiveTileSuggestRow(null);
      setSuggestPosition(null);
    }, 250);

    const item = areas[areaIdx]?.items[itemIdx];
    if (item && item.description && item.description.trim().length > 1) {
      fetchApi('/api/products/tile-items', {
        method: 'POST',
        body: JSON.stringify({
          description: item.description.trim(),
          brand: item.brand,
          size: item.size,
          product_type: item.product_type,
          coverage_area: item.coverage_area,
          base_rate_per_sqft: item.base_rate_per_sqft,
          rate_per_sqft: item.rate_per_sqft,
          base_rate_per_box: item.base_rate_per_box,
          rate_per_box: item.rate_per_box,
        }),
      }).then((res) => {
        if (res.item) {
          setSavedTileItems((prev) => {
            const exists = prev.some((p) => p.description.toLowerCase() === res.item.description.toLowerCase());
            if (exists) {
              return prev.map((p) => p.description.toLowerCase() === res.item.description.toLowerCase() ? res.item : p);
            }
            return [res.item, ...prev];
          });
        }
      }).catch(() => {});
    }
  };

  const applySavedTileItem = (areaIdx: number, itemIdx: number, saved: TileCatalogItem) => {
    const newAreas = [...areas];
    const item = { ...newAreas[areaIdx].items[itemIdx] };

    item.description = saved.description;
    if (saved.brand) item.brand = saved.brand;
    if (saved.size) item.size = saved.size;
    if (saved.product_type) item.product_type = saved.product_type;
    if (saved.coverage_area) item.coverage_area = saved.coverage_area;

    const pType = (item.product_type || 'box').toLowerCase();

    if (saved.base_rate_per_sqft) {
      item.base_rate_per_sqft = saved.base_rate_per_sqft;
      item.rate_per_sqft = saved.rate_per_sqft || saved.base_rate_per_sqft;
    }
    if (saved.base_rate_per_box) {
      item.base_rate_per_box = saved.base_rate_per_box;
      item.rate_per_box = saved.rate_per_box || saved.base_rate_per_box;
    }

    const sqft = parseFloat(String(item.quantity_sqft)) || 0;
    const boxes = parseFloat(String(item.quantity_boxes)) || 0;
    if (pType === 'sqft') {
      item.total_amount = parseFloat((sqft * (item.rate_per_sqft || 0)).toFixed(2));
    } else if (['bags', 'pieces', 'nos'].includes(pType)) {
      item.total_amount = parseFloat((boxes * (item.rate_per_box || 0)).toFixed(2));
    } else {
      item.total_amount = parseFloat((sqft * (item.rate_per_sqft || 0)).toFixed(2));
    }

    newAreas[areaIdx].items[itemIdx] = item;
    setAreas(newAreas);
    setActiveTileSuggestRow(null);
    setSuggestPosition(null);

    // Focus next column (e.g. quantity_sqft or size)
    setTimeout(() => {
      navigateNext(areaIdx, itemIdx, 0);
    }, 50);
  };

  // Keyboard Grid Navigation Handlers
  const focusGridCell = (areaIdx: number, itemIdx: number, colIdx: number): boolean => {
    const el = document.querySelector<HTMLElement>(`[data-cell="${areaIdx}-${itemIdx}-${colIdx}"]`);
    if (el) {
      el.focus();
      if (el instanceof HTMLInputElement) {
        el.select();
      }
      return true;
    }
    return false;
  };

  const navigateNext = (areaIdx: number, itemIdx: number, currentCol: number) => {
    const item = areas[areaIdx]?.items[itemIdx];
    if (!item) return;
    const pType = (item.product_type || 'box').toLowerCase();

    for (let nextCol = currentCol + 1; nextCol <= 8; nextCol++) {
      if (nextCol === 4 && pType !== 'box') continue;
      if ((nextCol === 5 || nextCol === 6) && pType !== 'box' && pType !== 'sqft') continue;
      if ((nextCol === 7 || nextCol === 8) && pType === 'sqft') continue;

      if (focusGridCell(areaIdx, itemIdx, nextCol)) {
        return;
      }
    }

    if (itemIdx + 1 < areas[areaIdx].items.length) {
      focusGridCell(areaIdx, itemIdx + 1, 0);
    } else {
      handleAddItem(areaIdx);
      setTimeout(() => {
        focusGridCell(areaIdx, itemIdx + 1, 0);
      }, 50);
    }
  };

  const navigatePrev = (areaIdx: number, itemIdx: number, currentCol: number) => {
    const item = areas[areaIdx]?.items[itemIdx];
    if (!item) return;
    const pType = (item.product_type || 'box').toLowerCase();

    for (let prevCol = currentCol - 1; prevCol >= 0; prevCol--) {
      if (prevCol === 4 && pType !== 'box') continue;
      if ((prevCol === 5 || prevCol === 6) && pType !== 'box' && pType !== 'sqft') continue;
      if ((prevCol === 7 || prevCol === 8) && pType === 'sqft') continue;

      if (focusGridCell(areaIdx, itemIdx, prevCol)) {
        return;
      }
    }

    if (itemIdx > 0) {
      const prevItem = areas[areaIdx].items[itemIdx - 1];
      const prevType = (prevItem.product_type || 'box').toLowerCase();
      const lastCol = prevType === 'sqft' ? 6 : 8;
      focusGridCell(areaIdx, itemIdx - 1, lastCol);
    }
  };

  const navigateRow = (areaIdx: number, itemIdx: number, colIdx: number, direction: 'up' | 'down') => {
    const targetItemIdx = direction === 'up' ? itemIdx - 1 : itemIdx + 1;
    if (targetItemIdx >= 0 && targetItemIdx < areas[areaIdx].items.length) {
      focusGridCell(areaIdx, targetItemIdx, colIdx);
    } else if (direction === 'down' && targetItemIdx === areas[areaIdx].items.length) {
      handleAddItem(areaIdx);
      setTimeout(() => {
        focusGridCell(areaIdx, targetItemIdx, colIdx);
      }, 50);
    }
  };

  const handleCellKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>,
    areaIdx: number,
    itemIdx: number,
    colIdx: number
  ) => {
    const isDescription = colIdx === 0;
    const isSuggestOpen =
      isDescription &&
      activeTileSuggestRow?.areaIdx === areaIdx &&
      activeTileSuggestRow?.itemIdx === itemIdx &&
      tileSuggestions.length > 0;

    if (e.key === 'Enter') {
      if (isSuggestOpen) {
        e.preventDefault();
        applySavedTileItem(areaIdx, itemIdx, tileSuggestions[tileHighlightIndex] || tileSuggestions[0]);
        return;
      }
      e.preventDefault();
      navigateNext(areaIdx, itemIdx, colIdx);
      return;
    }

    if (e.key === 'ArrowDown') {
      if (isSuggestOpen) {
        e.preventDefault();
        setTileHighlightIndex((prev) => (prev + 1) % tileSuggestions.length);
        return;
      }
      if (e.currentTarget instanceof HTMLSelectElement) {
        return;
      }
      e.preventDefault();
      navigateRow(areaIdx, itemIdx, colIdx, 'down');
      return;
    }

    if (e.key === 'ArrowUp') {
      if (isSuggestOpen) {
        e.preventDefault();
        setTileHighlightIndex((prev) => (prev - 1 + tileSuggestions.length) % tileSuggestions.length);
        return;
      }
      if (e.currentTarget instanceof HTMLSelectElement) {
        return;
      }
      e.preventDefault();
      navigateRow(areaIdx, itemIdx, colIdx, 'up');
      return;
    }

    if (e.key === 'ArrowRight') {
      const target = e.currentTarget as HTMLInputElement;
      if (target.type === 'text') {
        if (target.selectionEnd === target.value.length) {
          e.preventDefault();
          navigateNext(areaIdx, itemIdx, colIdx);
        }
      } else {
        e.preventDefault();
        navigateNext(areaIdx, itemIdx, colIdx);
      }
      return;
    }

    if (e.key === 'ArrowLeft') {
      const target = e.currentTarget as HTMLInputElement;
      if (target.type === 'text') {
        if (target.selectionStart === 0) {
          e.preventDefault();
          navigatePrev(areaIdx, itemIdx, colIdx);
        }
      } else {
        e.preventDefault();
        navigatePrev(areaIdx, itemIdx, colIdx);
      }
      return;
    }

    if (e.key === 'Escape' && isSuggestOpen) {
      e.preventDefault();
      setActiveTileSuggestRow(null);
    }
  };

  // Re-number SL Nos across all items and collect flat array
  let runningSl = 1;
  const allItems: QuotationItem[] = [];
  areas.forEach((a) => {
    a.items.forEach((it) => {
      it.sl_no = runningSl++;
      allItems.push(it);
    });
  });

  const encryptedProductMap = React.useMemo(() => {
    return buildEncryptedProductMap(quotationNumber || 'AMA', allItems);
  }, [quotationNumber, allItems]);

  // Calculate CERA-excluded direct item rate discounts and financial totals
  const calculationResult = calculateQuotationDiscountAndTotals(
    allItems,
    discountAmount,
    discountPercent,
    taxType
  );

  const {
    ceraBaseTotal,
    nonCeraBaseTotal,
    totalBaseQuote,
    taxableAmount,
    cgstAmount,
    sgstAmount,
    igstAmount,
    roundOff,
    netTotal,
    grossTotal,
  } = calculationResult;

  const finalDiscount = calculationResult.discountAmount;
  const computedDiscountPercent = calculationResult.discountPercent;
  const amountInWords = numberToWordsIndian(netTotal);

  // Synchronize split amounts whenever netTotal changes
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
        const primaryId = quotationId ? undefined : user?.id;
        const candidate = salesTeam.find((u) => u.id !== primaryId);
        if (candidate) {
          setAssistedSalesPersonId(candidate.id);
          setAssistedSalesPersonName(candidate.full_name);
        }
      }
    } else {
      setAssistedSalesPersonId(null);
      setAssistedSalesPersonName('');
      setPrimarySalesSharePercent(100);
      setAssistedSalesSharePercent(0);
      setPrimarySalesShareAmount(netTotal);
      setAssistedSalesShareAmount(0);
    }
  };

  const handleSelectAssistedSalesperson = (salesPersonIdNum: number) => {
    setAssistedSalesPersonId(salesPersonIdNum);
    const found = salesTeam.find((u) => u.id === salesPersonIdNum);
    setAssistedSalesPersonName(found?.full_name || '');
  };

  const handleUpdateSplitPercent = (field: 'primary' | 'assisted', val: number) => {
    const clamped = Math.max(0, Math.min(100, Math.round(val * 100) / 100));
    if (field === 'primary') {
      const other = Math.max(0, parseFloat((100 - clamped).toFixed(2)));
      setPrimarySalesSharePercent(clamped);
      setAssistedSalesSharePercent(other);
      const pAmt = Math.round((netTotal * clamped) / 100);
      setPrimarySalesShareAmount(pAmt);
      setAssistedSalesShareAmount(netTotal - pAmt);
    } else {
      const other = Math.max(0, parseFloat((100 - clamped).toFixed(2)));
      setAssistedSalesSharePercent(clamped);
      setPrimarySalesSharePercent(other);
      const aAmt = Math.round((netTotal * clamped) / 100);
      setAssistedSalesShareAmount(aAmt);
      setPrimarySalesShareAmount(netTotal - aAmt);
    }
  };

  const handleUpdateSplitAmount = (field: 'primary' | 'assisted', val: number) => {
    const clamped = Math.max(0, Math.min(netTotal, Math.round(val)));
    if (field === 'primary') {
      const other = Math.max(0, netTotal - clamped);
      setPrimarySalesShareAmount(clamped);
      setAssistedSalesShareAmount(other);
      const pPct = netTotal > 0 ? parseFloat(((clamped / netTotal) * 100).toFixed(2)) : 0;
      setPrimarySalesSharePercent(pPct);
      setAssistedSalesSharePercent(parseFloat((100 - pPct).toFixed(2)));
    } else {
      const other = Math.max(0, netTotal - clamped);
      setAssistedSalesShareAmount(clamped);
      setPrimarySalesShareAmount(other);
      const aPct = netTotal > 0 ? parseFloat(((clamped / netTotal) * 100).toFixed(2)) : 0;
      setAssistedSalesSharePercent(aPct);
      setPrimarySalesSharePercent(parseFloat((100 - aPct).toFixed(2)));
    }
  };

  const handlePresetSplit = (primaryPct: number, assistedPct: number) => {
    setPrimarySalesSharePercent(primaryPct);
    setAssistedSalesSharePercent(assistedPct);
    const pAmt = Math.round((netTotal * primaryPct) / 100);
    setPrimarySalesShareAmount(pAmt);
    setAssistedSalesShareAmount(netTotal - pAmt);
  };

  // Save Quotation Internal Helper
  const saveQuotationData = async (): Promise<Quotation | null> => {
    setError(null);
    if (!customerName.trim()) {
      setError('Customer name is required.');
      return null;
    }
    if (!customerPhone.trim()) {
      setError('Customer phone number is required.');
      return null;
    }

    if (enableSplitSale) {
      if (!assistedSalesPersonId) {
        setError('Please select an assisted salesperson or disable the split sale option.');
        return null;
      }
      if (Math.abs((primarySalesSharePercent + assistedSalesSharePercent) - 100) > 0.5) {
        setError('The total split percentage between primary and assisted salespersons must equal 100%.');
        return null;
      }
    }

    setSaving(true);
    try {
      const payload = {
        customer_id: customerId || null,
        customer_name: customerName,
        customer_phone: customerPhone,
        customer_gstin: customerGstin,
        delivery_address: deliveryAddress,
        site_location: siteLocation,
        project_name: projectName,
        quotation_type: 'tiles',
        quotation_date: quotationDate,
        status: status,
        tax_type: taxType,
        special_notes: specialNotes,
        discount_percent: computedDiscountPercent,
        discount_amount: finalDiscount,
        assisted_sales_person_id: enableSplitSale ? assistedSalesPersonId : null,
        assisted_sales_person_name: enableSplitSale ? assistedSalesPersonName : null,
        split_share_type: enableSplitSale ? splitShareType : 'percentage',
        primary_sales_share_percent: enableSplitSale ? primarySalesSharePercent : 100,
        primary_sales_share_amount: enableSplitSale ? primarySalesShareAmount : netTotal,
        assisted_sales_share_percent: enableSplitSale ? assistedSalesSharePercent : 0,
        assisted_sales_share_amount: enableSplitSale ? assistedSalesShareAmount : 0,
        version: quotationId ? version : 1,
        areas: areas.map((a, i) => ({
          area_name: a.name,
          display_order: i + 1,
          items: a.items.map((it) => ({
            description: it.description,
            brand: it.brand,
            size: it.size,
            product_type: it.product_type || 'box',
            coverage_area: parseFloat(String(it.coverage_area)) || 0,
            quantity_sqft: parseFloat(String(it.quantity_sqft)) || 0,
            base_rate_per_sqft: parseFloat(String(it.base_rate_per_sqft || it.rate_per_sqft)) || 0,
            rate_per_sqft: parseFloat(String(it.rate_per_sqft)) || 0,
            quantity_boxes: parseFloat(String(it.quantity_boxes)) || 0,
            base_rate_per_box: parseFloat(String(it.base_rate_per_box || it.rate_per_box)) || 0,
            rate_per_box: parseFloat(String(it.rate_per_box)) || 0,
            discount_percent: parseFloat(String(it.discount_percent || 0)) || 0,
            discount_amount: parseFloat(String(it.discount_amount || 0)) || 0,
            total_amount: parseFloat(String(it.total_amount)) || 0,
          })),
        })),
      };

      let savedRecord: Quotation;
      if (quotationId) {
        const res = await fetchApi(`/api/quotations/${quotationId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        savedRecord = res.quotation;
      } else {
        const res = await fetchApi('/api/quotations', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        savedRecord = res.quotation;
        setQuotationNumber(savedRecord.quotation_number);
      }
      return savedRecord;
    } catch (err: any) {
      setError(err.message || 'Failed to save quotation');
      return null;
    } finally {
      setSaving(false);
    }
  };

  const handleSaveQuotation = async () => {
    const saved = await saveQuotationData();
    if (saved) {
      onSaved(saved.id);
    }
  };

  const handleOpenPdf = async (encrypted: boolean = false) => {
    let targetId: number | undefined = quotationId || undefined;
    let targetNum = quotationNumber;

    if (!targetId) {
      const saved = await saveQuotationData();
      if (!saved) return;
      targetId = saved.id;
      targetNum = saved.quotation_number;
    }

    if (!targetId) return;

    const url = getPdfUrl(targetId, encrypted);
    setPreviewPdf({
      url,
      title: encrypted
        ? `Quotation ${targetNum} — ${customerName} (Encrypted Export)`
        : `Quotation ${targetNum} — ${customerName}`,
      fileName: encrypted
        ? `Quotation_${targetNum}_Encrypted.pdf`
        : `Quotation_${targetNum}.pdf`,
      quotationId: targetId,
      initialEncrypted: encrypted,
    });
  };

  return (
    <div className="flex-1 p-4 sm:p-5 lg:p-6 space-y-4 lg:space-y-5 overflow-y-auto w-full min-w-0">
      {/* Top Action Header */}
      <div className="card p-3 sm:p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <button
            onClick={onBack}
            className="btn btn-secondary btn-sm p-1.5"
            title="Back to List"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
              {quotationId ? `Edit Quotation (${quotationNumber})` : 'New Quotation Builder'}
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Architectural Surfaces, Slabs & Tile Estimation
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {quotationId && (
            <button
              type="button"
              onClick={() => setHistoryModalOpen(true)}
              className="btn btn-secondary btn-sm flex items-center space-x-1.5"
              title="View previous quotes and revision history"
            >
              <History size={13} className="text-indigo-600" />
              <span>Previous Quotes {version > 1 ? `(v${version})` : ''}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => handleOpenPdf(false)}
            disabled={saving}
            className="btn btn-secondary btn-sm flex items-center space-x-1.5"
            title="Preview Standard PDF with Brand & Tile Names"
          >
            <Printer size={13} />
            <span>Standard PDF</span>
          </button>

          <button
            type="button"
            onClick={() => handleOpenPdf(true)}
            disabled={saving}
            className="btn btn-sm flex items-center space-x-1.5 bg-slate-900 hover:bg-black text-amber-300 hover:text-amber-200 border border-slate-700 shadow-sm font-semibold"
            title="Export Encrypted PDF: Brand removed, Product name replaced with random code ending in -AMA (e.g. HSDS-AMA)"
          >
            <ShieldAlert size={13} className="text-amber-400" />
            <span>Encrypted Export</span>
          </button>

          <button
            type="button"
            onClick={handleSaveQuotation}
            disabled={saving}
            className={`btn btn-primary btn-sm ${saving ? 'btn-saving' : ''}`}
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            <span>{saving ? 'Saving Record...' : 'Save Quotation'}</span>
          </button>
        </div>
      </div>

      {/* Encrypted Product Names Feature Banner */}
      <div className="card card-dark p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md border border-slate-700">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-lg bg-amber-400/20 text-amber-300 border border-amber-400/30 shrink-0">
            <ShieldAlert size={20} />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-bold text-sm tracking-tight text-white">Encrypted Product Names Quotation</span>
              <span className="badge bg-amber-400 text-slate-950 font-bold text-[10px] uppercase">Feature Ready</span>
            </div>
            <p className="text-xs text-slate-200 mt-0.5">
              Exports with brand removed and product names masked with random alphabets ending in <span className="text-amber-300 font-mono font-bold">-AMA</span> (e.g. <span className="text-amber-300 font-mono font-bold">HSDS-AMA</span>). Original product details remain safely stored in database.
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2 shrink-0">
          <button
            type="button"
            onClick={() => handleOpenPdf(true)}
            disabled={saving}
            className="btn btn-sm bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold border-none shadow flex items-center space-x-1.5"
            title="Export Encrypted PDF with masked codes (-AMA) and brand removed"
          >
            <ShieldAlert size={13} className="text-slate-950" />
            <span>Export Encrypted PDF</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-md text-xs flex items-center space-x-2">
          <AlertCircle size={15} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Section 1: Customer Profile & Auto-fill Details */}
      <div className="card p-4 space-y-4">
        {/* Header row with customer link status */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
          <div className="flex items-center space-x-2.5">
            <UserCheck size={16} className="text-slate-700" />
            <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Customer Profile & Site Details
            </h2>
            {customerId ? (
              <span className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <CheckCircle2 size={12} className="text-emerald-600" />
                <span>Linked to Customer #{customerId}</span>
                <button
                  type="button"
                  onClick={handleUnlinkCustomer}
                  className="hover:text-rose-600 ml-1 font-bold text-xs"
                  title="Unlink Customer (edit as custom)"
                >
                  <X size={11} />
                </button>
              </span>
            ) : (
              <span className="text-[11px] text-slate-500 font-normal ml-2">
                (Type Phone or Name to search existing customer)
              </span>
            )}
          </div>
          <div className="text-[11px] text-slate-400 hidden sm:block">
            Auto-popup on mobile number or customer name
          </div>
        </div>

        {/* Quick Customer Search Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
              {isSearchingCustomer ? (
                <Loader2 size={14} className="animate-spin text-primary-600" />
              ) : (
                <Search size={14} />
              )}
            </div>
            <input
              type="text"
              className="input input-sm pl-9 pr-8 w-full bg-white text-xs"
              placeholder="🔍 Quick Search: Type phone number, name, GSTIN, or site to auto-fill..."
              value={customerSearchQuery}
              onChange={(e) => {
                setCustomerSearchQuery(e.target.value);
                triggerCustomerLookup(e.target.value, 'search');
              }}
              onFocus={() => {
                if (customerSearchQuery.trim().length >= 2) {
                  triggerCustomerLookup(customerSearchQuery, 'search');
                }
              }}
              onKeyDown={handleKeyDownOnInput}
            />
            {customerSearchQuery && (
              <button
                type="button"
                onClick={() => {
                  setCustomerSearchQuery('');
                  setShowSuggestions(false);
                }}
                className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400 hover:text-slate-600"
              >
                <X size={13} />
              </button>
            )}
            {renderSuggestionsPopup('search')}
          </div>

          {/* Quick Select from Loaded List */}
          <div className="shrink-0 flex items-center space-x-2">
            <span className="text-[11px] text-slate-500 font-medium whitespace-nowrap">Or pick:</span>
            <select
              className="input input-sm text-xs max-w-[220px] bg-white"
              onChange={handleSelectCustomer}
              value={customerId || ''}
            >
              <option value="">-- Saved Customers List --</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.mobile_number})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Exact Phone Match Prompt Banner */}
        {exactPhoneMatch && customerId !== exactPhoneMatch.id && (
          <div className="bg-emerald-50 border border-emerald-300 rounded-lg p-3 flex items-center justify-between text-xs text-emerald-950 shadow-sm animate-in fade-in slide-in-from-top-1">
            <div className="flex items-center space-x-2.5">
              <Sparkles size={16} className="text-emerald-600 shrink-0" />
              <div>
                <span className="font-bold">Existing Customer Profile Found: </span>
                <span className="font-semibold text-emerald-900">{exactPhoneMatch.name}</span>
                <span className="font-mono text-emerald-700 ml-1.5 font-bold">({exactPhoneMatch.mobile_number})</span>
                {exactPhoneMatch.site_location && (
                  <span className="text-emerald-700 text-[11px] ml-2">• Site: {exactPhoneMatch.site_location}</span>
                )}
                {exactPhoneMatch.delivery_address && (
                  <span className="text-emerald-600 text-[11px] ml-2 hidden md:inline">• {exactPhoneMatch.delivery_address}</span>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleApplyCustomer(exactPhoneMatch)}
              className="btn btn-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-3 py-1.5 shrink-0 rounded shadow"
            >
              Auto-fill All Details →
            </button>
          </div>
        )}

        {/* Customer Fields Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 text-xs">
          {/* Row 1, Col 1: Customer Name with popup */}
          <div className="relative">
            <label className="flex items-center justify-between text-slate-700 font-semibold h-5 mb-1.5">
              <span>Customer Name *</span>
            </label>
            <input
              type="text"
              className="input input-sm w-full font-medium"
              value={customerName}
              onChange={(e) => {
                setCustomerName(e.target.value);
                triggerCustomerLookup(e.target.value, 'name');
              }}
              onFocus={() => {
                if (customerName.trim().length >= 2) {
                  triggerCustomerLookup(customerName, 'name');
                }
              }}
              onKeyDown={handleKeyDownOnInput}
              placeholder="e.g. Mr Vinayak"
              required
            />
            {renderSuggestionsPopup('name')}
          </div>

          {/* Row 1, Col 2: Contact Number with phone search popup */}
          <div className="relative">
            <label className="flex items-center justify-between text-slate-700 font-semibold h-5 mb-1.5">
              <span>Contact Number *</span>
              <span className="text-[10px] text-slate-500 font-normal ml-2">Search by mobile</span>
            </label>
            <div className="relative">
              <input
                type="text"
                className="input input-sm font-mono w-full"
                value={customerPhone}
                onChange={(e) => {
                  setCustomerPhone(e.target.value);
                  triggerCustomerLookup(e.target.value, 'phone');
                }}
                onFocus={() => {
                  if (customerPhone.trim().length >= 2) {
                    triggerCustomerLookup(customerPhone, 'phone');
                  }
                }}
                onKeyDown={handleKeyDownOnInput}
                placeholder="e.g. 7795495467"
                required
              />
            </div>
            {renderSuggestionsPopup('phone')}
          </div>

          {/* Row 1, Col 3: Customer GSTIN */}
          <div>
            <label className="flex items-center justify-between text-slate-700 font-semibold h-5 mb-1.5">
              <span>Customer GSTIN</span>
              <span className="text-[10px] text-slate-500 font-normal ml-2">Optional</span>
            </label>
            <input
              type="text"
              className="input input-sm font-mono w-full uppercase"
              value={customerGstin}
              onChange={(e) => setCustomerGstin(e.target.value.toUpperCase())}
              placeholder="e.g. 29ABCDE1234F1Z5"
            />
          </div>

          {/* Row 1, Col 4: Quotation Date */}
          <div>
            <label className="flex items-center justify-between text-slate-700 font-semibold h-5 mb-1.5">
              <span>Quotation Date</span>
              {quotationId && (
                <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 rounded">
                  Revision v{(version || 1) + 1}
                </span>
              )}
            </label>
            <input
              type="date"
              className="input input-sm w-full font-medium"
              value={quotationDate}
              onChange={(e) => setQuotationDate(e.target.value)}
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

          {/* Row 2, Col 1: Project / Villa Name */}
          <div>
            <label className="flex items-center justify-between text-slate-600 font-medium h-5 mb-1.5">
              <span>Project / Villa Name</span>
            </label>
            <input
              type="text"
              className="input input-sm w-full"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="e.g. Vinayak Villa Residence"
            />
          </div>

          {/* Row 2, Col 2: Deal Stage / Quotation Status */}
          <div>
            <label className="flex items-center justify-between text-slate-700 font-semibold h-5 mb-1.5">
              <span>Deal Stage / Status</span>
              {['approved', 'closed'].includes(status) && (
                <span className="text-[10px] text-emerald-600 font-medium flex items-center">
                  <CheckCircle2 size={11} className="inline mr-0.5" />
                  <span>Target Credit</span>
                </span>
              )}
            </label>
            <select
              className={`select select-sm w-full font-medium ${
                ['approved', 'closed'].includes(status)
                  ? 'border-emerald-500 bg-emerald-50/50 text-emerald-900 font-semibold'
                  : 'text-slate-800'
              }`}
              value={status}
              onChange={(e) => setStatus(e.target.value as any)}
            >
              <option value="draft">Draft (In Progress)</option>
              <option value="in_review">In Review (Pending Confirmation)</option>
              <option value="approved">Approved (Order Confirmed — Adds to Target)</option>
              <option value="closed">Closed (Won / Deal Closed — Adds to Target)</option>
            </select>
          </div>

          {/* Row 2, Col 3: Site Location / City */}
          <div>
            <label className="flex items-center justify-between text-slate-600 font-medium h-5 mb-1.5">
              <span>Site Location / Area</span>
            </label>
            <input
              type="text"
              className="input input-sm w-full"
              value={siteLocation}
              onChange={(e) => setSiteLocation(e.target.value)}
              placeholder="e.g. Whitefield, Bengaluru"
            />
          </div>

          {/* Row 2, Col 4: Site Delivery Address */}
          <div>
            <label className="flex items-center justify-between text-slate-600 font-medium h-5 mb-1.5">
              <span>Site Delivery Address</span>
            </label>
            <input
              type="text"
              className="input input-sm w-full"
              value={deliveryAddress}
              onChange={(e) => setDeliveryAddress(e.target.value)}
              placeholder="e.g. Villa 42, Palm Meadows"
            />
          </div>
        </div>
      </div>

      {/* Section 1.5: Sales Attribution & Assisted Salesperson Split */}
      <div className="card p-4 space-y-4 border border-slate-200">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <div className="flex items-center space-x-2">
              <Users size={16} className="text-indigo-600" />
              <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Sales Attribution & Co-Closer Split
              </h2>
              {enableSplitSale && (
                <span className="badge badge-sm bg-indigo-50 text-indigo-700 border border-indigo-200 font-semibold">
                  Split Deal Active
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Split revenue credit and monthly target achievements when a quotation is closed with another salesperson
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => handleToggleSplitSale(!enableSplitSale)}
              className={`btn btn-xs inline-flex items-center space-x-1.5 transition-all ${
                enableSplitSale
                  ? 'bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100'
                  : 'btn-secondary text-indigo-700 border-indigo-200 bg-indigo-50/70 hover:bg-indigo-100'
              }`}
            >
              {enableSplitSale ? (
                <>
                  <X size={12} />
                  <span>Remove Split Sale (100% Single Closer)</span>
                </>
              ) : (
                <>
                  <Users size={12} />
                  <span>+ Add Assisted Salesperson</span>
                </>
              )}
            </button>
          </div>
        </div>

        {!enableSplitSale ? (
          <div className="flex items-center justify-between bg-slate-50 border border-slate-200/80 rounded-md px-3 py-2 text-xs text-slate-600">
            <div className="flex items-center space-x-2">
              <UserIcon size={13} className="text-slate-500" />
              <span>
                Primary Closer:{' '}
                <strong className="text-slate-900 font-semibold">
                  {primarySalesPersonName || user?.full_name || user?.username || 'Current User'}
                </strong>
                <span className="text-slate-500 ml-1.5">(100% Sales & Target Attribution)</span>
              </span>
            </div>
            <span className="text-[11px] text-slate-400">Single Salesperson Deal</span>
          </div>
        ) : (
          <div className="space-y-4 animate-in fade-in duration-200">
            {/* Top Controls: Assisted Selection, Split Method, Quick Presets */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-indigo-50/40 p-3 rounded-lg border border-indigo-100">
              {/* Assisted Salesperson Select */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Assisted Salesperson (Co-Closer) <span className="text-rose-500">*</span>
                </label>
                <select
                  className="input input-sm w-full font-medium"
                  value={assistedSalesPersonId || ''}
                  onChange={(e) => handleSelectAssistedSalesperson(Number(e.target.value))}
                >
                  <option value="">-- Choose Colleague --</option>
                  {salesTeam
                    .filter((u) => u.id !== (quotationId ? undefined : user?.id))
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.full_name} ({u.role})
                      </option>
                    ))}
                </select>
              </div>

              {/* Share Type Selector */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Split Share Mode
                </label>
                <div className="inline-flex rounded-md shadow-sm w-full border border-slate-300 overflow-hidden bg-white">
                  <button
                    type="button"
                    onClick={() => setSplitShareType('percentage')}
                    className={`flex-1 py-1.5 px-2 text-xs font-semibold flex items-center justify-center space-x-1 transition-colors ${
                      splitShareType === 'percentage'
                        ? 'bg-indigo-600 text-white'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <Percent size={12} />
                    <span>Percentage (%)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSplitShareType('amount')}
                    className={`flex-1 py-1.5 px-2 text-xs font-semibold flex items-center justify-center space-x-1 transition-colors ${
                      splitShareType === 'amount'
                        ? 'bg-indigo-600 text-white'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span>₹ Amount (Fixed)</span>
                  </button>
                </div>
              </div>

              {/* Quick Ratio Presets */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Quick Ratio Presets
                </label>
                <div className="grid grid-cols-4 gap-1">
                  {[
                    [50, 50],
                    [60, 40],
                    [70, 30],
                    [80, 20],
                  ].map(([p, a]) => {
                    const isSelected =
                      splitShareType === 'percentage' &&
                      primarySalesSharePercent === p &&
                      assistedSalesSharePercent === a;
                    return (
                      <button
                        key={`${p}-${a}`}
                        type="button"
                        onClick={() => handlePresetSplit(p, a)}
                        className={`text-[11px] font-semibold py-1.5 rounded border transition-colors ${
                          isSelected
                            ? 'bg-indigo-600 border-indigo-600 text-white'
                            : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        {p}:{a}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Split Cards: Lead vs Assisted */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Primary Salesperson Card */}
              <div className="border border-indigo-200 bg-white rounded-lg p-3.5 space-y-2.5 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />
                    <span className="text-xs font-bold text-slate-900">
                      {primarySalesPersonName || user?.full_name || 'Lead Closer'}
                    </span>
                  </div>
                  <span className="badge badge-sm bg-blue-50 text-blue-700 border border-blue-200 font-semibold">
                    Lead Closer
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-[11px] text-slate-500 font-medium mb-1">
                      Share Percentage
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.5"
                        disabled={splitShareType === 'amount'}
                        value={primarySalesSharePercent}
                        onChange={(e) =>
                          handleUpdateSplitPercent('primary', parseFloat(e.target.value) || 0)
                        }
                        className="input input-sm w-full pr-6 font-mono font-bold text-slate-900"
                      />
                      <span className="absolute right-2 top-2 text-slate-400 text-xs font-mono">%</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-500 font-medium mb-1">
                      Attributed Revenue
                    </label>
                    <div className="relative">
                      <span className="absolute left-2.5 top-2 text-slate-400 text-xs font-mono">₹</span>
                      <input
                        type="number"
                        min="0"
                        max={netTotal}
                        step="1"
                        disabled={splitShareType === 'percentage'}
                        value={primarySalesShareAmount}
                        onChange={(e) =>
                          handleUpdateSplitAmount('primary', parseFloat(e.target.value) || 0)
                        }
                        className="input input-sm w-full pl-6 font-mono font-bold text-slate-900"
                      />
                    </div>
                  </div>
                </div>

                <div className="text-[11px] text-slate-500 flex justify-between pt-1 border-t border-slate-100">
                  <span>Credited to Targets:</span>
                  <strong className="text-blue-700 font-mono">
                    ₹ {formatCurrency(primarySalesShareAmount)} ({primarySalesSharePercent}%)
                  </strong>
                </div>
              </div>

              {/* Assisted Salesperson Card */}
              <div className="border border-emerald-200 bg-white rounded-lg p-3.5 space-y-2.5 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-600" />
                    <span className="text-xs font-bold text-slate-900">
                      {assistedSalesPersonName || 'Select Assisted Colleague Above'}
                    </span>
                  </div>
                  <span className="badge badge-sm bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">
                    Co-Closer (Assisted)
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-[11px] text-slate-500 font-medium mb-1">
                      Share Percentage
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.5"
                        disabled={splitShareType === 'amount'}
                        value={assistedSalesSharePercent}
                        onChange={(e) =>
                          handleUpdateSplitPercent('assisted', parseFloat(e.target.value) || 0)
                        }
                        className="input input-sm w-full pr-6 font-mono font-bold text-slate-900"
                      />
                      <span className="absolute right-2 top-2 text-slate-400 text-xs font-mono">%</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-500 font-medium mb-1">
                      Attributed Revenue
                    </label>
                    <div className="relative">
                      <span className="absolute left-2.5 top-2 text-slate-400 text-xs font-mono">₹</span>
                      <input
                        type="number"
                        min="0"
                        max={netTotal}
                        step="1"
                        disabled={splitShareType === 'percentage'}
                        value={assistedSalesShareAmount}
                        onChange={(e) =>
                          handleUpdateSplitAmount('assisted', parseFloat(e.target.value) || 0)
                        }
                        className="input input-sm w-full pl-6 font-mono font-bold text-slate-900"
                      />
                    </div>
                  </div>
                </div>

                <div className="text-[11px] text-slate-500 flex justify-between pt-1 border-t border-slate-100">
                  <span>Credited to Targets:</span>
                  <strong className="text-emerald-700 font-mono">
                    ₹ {formatCurrency(assistedSalesShareAmount)} ({assistedSalesSharePercent}%)
                  </strong>
                </div>
              </div>
            </div>

            {/* Visual Split Distribution Bar */}
            <div className="space-y-1.5 bg-slate-50 p-2.5 rounded border border-slate-200">
              <div className="flex justify-between text-[11px] font-semibold text-slate-700">
                <span className="text-blue-700">
                  Lead ({primarySalesSharePercent}%): ₹ {formatCurrency(primarySalesShareAmount)}
                </span>
                <span className="text-slate-500 font-mono">Net Quotation: ₹ {formatCurrency(netTotal)}</span>
                <span className="text-emerald-700">
                  Assisted ({assistedSalesSharePercent}%): ₹ {formatCurrency(assistedSalesShareAmount)}
                </span>
              </div>

              <div className="h-3 w-full bg-slate-200 rounded-full overflow-hidden flex shadow-inner">
                <div
                  className="bg-blue-600 transition-all duration-300"
                  style={{ width: `${Math.max(0, Math.min(100, primarySalesSharePercent))}%` }}
                  title={`Lead Closer: ${primarySalesSharePercent}%`}
                />
                <div
                  className="bg-emerald-600 transition-all duration-300"
                  style={{ width: `${Math.max(0, Math.min(100, assistedSalesSharePercent))}%` }}
                  title={`Assisted Closer: ${assistedSalesSharePercent}%`}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Section 2: Room / Areas & Tile Line Items */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2">
          <div>
            <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Room-Wise Tile Specifications
            </h2>
            <p className="text-[11px] text-slate-500">
              Calculate quantities across square feet and full packaging boxes
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            {canClearAll && (
              <button
                type="button"
                onClick={handleRemoveAllItems}
                className="btn btn-secondary btn-xs sm:btn-sm text-rose-600 hover:text-rose-700 hover:bg-rose-50 border-rose-200"
                title="Remove all items and areas (Admin & Accounts only)"
              >
                <Trash2 size={13} className="text-rose-600" />
                <span>Remove All Items</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleAddArea}
              className="btn btn-secondary btn-xs sm:btn-sm"
            >
              <Plus size={13} />
              <span>Add Area / Room</span>
            </button>
          </div>
        </div>

        {areas.map((area, areaIdx) => (
          <div key={areaIdx} className="card overflow-hidden">
            {/* Area Header Bar */}
            <div className="bg-slate-50 px-3 sm:px-4 py-2 sm:py-2.5 border-b border-slate-200 flex flex-wrap justify-between items-center gap-2">
              <div className="flex items-center space-x-2 flex-1 min-w-[200px] max-w-xl">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wide whitespace-nowrap">
                  AREA #{areaIdx + 1}:
                </span>
                <input
                  type="text"
                  className="input input-sm font-bold text-slate-900 uppercase tracking-wide bg-white flex-1"
                  value={area.name}
                  onChange={(e) => {
                    const newAreas = [...areas];
                    newAreas[areaIdx].name = e.target.value;
                    setAreas(newAreas);
                  }}
                  placeholder="e.g. MASTER BEDROOM, BALCONY"
                />
              </div>

              <div className="flex items-center space-x-1.5 sm:space-x-2">
                <button
                  type="button"
                  onClick={() => handleAddItem(areaIdx)}
                  className="btn btn-secondary btn-xs"
                >
                  <Plus size={12} />
                  <span>Add Line Item</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleRemoveArea(areaIdx)}
                  className="btn btn-secondary btn-xs text-rose-600 hover:text-rose-700"
                  title="Remove this room"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>

            {/* Mobile View: Fixed Zero-Horizontal-Scroll Cards */}
            <div className="quotation-mobile-cards p-3 space-y-3">
              {area.items.map((item, itemIdx) => {
                const pType = (item.product_type || 'box').toLowerCase();
                const selectedBrandObj = brands.find(
                  (b) => b.name.toLowerCase() === (item.brand || '').toLowerCase()
                );
                const rowBrandSizes = coverages.filter(
                  (c) =>
                    (selectedBrandObj && c.brand_id === selectedBrandObj.id) ||
                    (c.brand_name && c.brand_name.toLowerCase() === (item.brand || '').toLowerCase())
                );
                const hasCurrentSize = rowBrandSizes.some(
                  (c) => c.size.toLowerCase() === (item.size || '').toLowerCase()
                );

                return (
                  <div
                    key={itemIdx}
                    className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-2.5 transition-all"
                  >
                    {/* Card Header: Item # and Delete */}
                    <div className="flex items-center justify-between pb-1.5 border-b border-slate-100">
                      <div className="flex items-center space-x-2">
                        <span className="w-6 h-6 rounded-md bg-[#1B263B] text-white font-mono font-bold text-xs flex items-center justify-center shadow-2xs">
                          {item.sl_no}
                        </span>
                        <span className="text-xs font-bold text-slate-800">
                          Line Item #{item.sl_no}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(areaIdx, itemIdx)}
                        className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors"
                        title="Delete this line item"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>

                    {/* Description Field */}
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Tile / Surface Description
                      </label>
                      <input
                        type="text"
                        data-mobile-suggest={`${areaIdx}-${itemIdx}`}
                        className="input input-sm py-1.5 font-medium text-slate-900 w-full tile-suggest-input"
                        value={item.description}
                        onChange={(e) =>
                          handleDescriptionChange(areaIdx, itemIdx, e.target.value, e.currentTarget)
                        }
                        onFocus={(e) => {
                          if (item.description) {
                            handleDescriptionChange(areaIdx, itemIdx, item.description, e.currentTarget);
                          }
                        }}
                        onBlur={() => handleDescriptionBlur(areaIdx, itemIdx)}
                        placeholder="e.g. OMBRA EMERALD ULTRA - S"
                      />
                      <div className="flex items-center space-x-1.5 mt-1 text-[10px]">
                        <span className="text-slate-400 font-medium">Encrypted Code:</span>
                        <span
                          className="bg-slate-900 text-amber-300 font-mono font-bold px-1.5 py-0.5 rounded border border-slate-700 shadow-2xs"
                        >
                          {encryptedProductMap.get((item.description || '').trim()) || derive3LetterCode(item.description)}
                        </span>
                      </div>
                    </div>

                    {/* Brand & Size (2 Columns) */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-600 mb-1">
                          Brand
                        </label>
                        <select
                          className="select select-sm py-1 w-full text-xs"
                          value={item.brand}
                          onChange={(e) => handleItemChange(areaIdx, itemIdx, 'brand', e.target.value)}
                        >
                          {brands.length > 0 ? (
                            brands.map((b) => (
                              <option key={b.id} value={b.name}>
                                {b.name}
                              </option>
                            ))
                          ) : (
                            <option value="Simpolo Ceramics">Simpolo Ceramics</option>
                          )}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] font-semibold text-slate-600 mb-1">
                          Size
                        </label>
                        <select
                          className="select select-sm py-1 font-mono text-xs w-full"
                          value={item.size}
                          onChange={(e) => handleItemChange(areaIdx, itemIdx, 'size', e.target.value)}
                        >
                          {rowBrandSizes.length > 0 ? (
                            <>
                              {item.size && !hasCurrentSize && (
                                <option value={item.size}>
                                  {item.size} ({item.product_type || 'box'})
                                </option>
                              )}
                              {rowBrandSizes.map((c) => (
                                <option key={c.id} value={c.size}>
                                  {c.size} ({c.product_type || 'box'})
                                </option>
                              ))}
                            </>
                          ) : (
                            <option value={item.size || ''}>
                              {item.size
                                ? `${item.size} (${item.product_type || 'box'})`
                                : 'No sizes'}
                            </option>
                          )}
                        </select>
                      </div>
                    </div>

                    {/* Product Type & Coverage / Box (2 Columns) */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-600 mb-1">
                          Product Type
                        </label>
                        <select
                          className={`select select-sm py-1 font-semibold text-xs w-full ${
                            pType === 'box'
                              ? 'text-blue-700 bg-blue-50/50'
                              : pType === 'sqft'
                              ? 'text-emerald-700 bg-emerald-50/50'
                              : pType === 'bags'
                              ? 'text-amber-800 bg-amber-50/50'
                              : pType === 'pieces'
                              ? 'text-purple-800 bg-purple-50/50'
                              : 'text-slate-800 bg-slate-100'
                          }`}
                          value={item.product_type || 'box'}
                          onChange={(e) =>
                            handleItemChange(areaIdx, itemIdx, 'product_type', e.target.value)
                          }
                        >
                          <option value="box">Box</option>
                          <option value="pieces">Pieces</option>
                          <option value="sqft">Sq.Ft</option>
                          <option value="bags">Bags</option>
                          <option value="nos">Nos</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] font-semibold text-slate-600 mb-1">
                          Cov / Box (Sqft)
                        </label>
                        {pType === 'box' ? (
                          <input
                            type="number"
                            step="0.1"
                            className="input input-sm py-1 text-right text-slate-600 font-mono w-full text-xs"
                            value={item.coverage_area}
                            onChange={(e) =>
                              handleItemChange(areaIdx, itemIdx, 'coverage_area', e.target.value)
                            }
                            placeholder="Sqft/Box"
                          />
                        ) : (
                          <div className="text-slate-400 font-mono text-xs py-1.5 px-2 bg-slate-50 rounded border border-slate-200 text-center">
                            N/A
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Sqft & Rate / Sqft (2 Columns) */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-600 mb-1">
                          Total Area (Sqft)
                        </label>
                        {pType === 'box' || pType === 'sqft' ? (
                          <input
                            type="number"
                            step="1"
                            className="input input-sm py-1 text-right font-semibold text-slate-900 tabular-nums w-full text-xs"
                            placeholder="Sqft"
                            value={item.quantity_sqft}
                            onChange={(e) =>
                              handleItemChange(areaIdx, itemIdx, 'quantity_sqft', e.target.value)
                            }
                          />
                        ) : (
                          <div className="text-slate-400 font-mono text-xs py-1.5 px-2 bg-slate-50 rounded border border-slate-200 text-center">
                            N/A
                          </div>
                        )}
                      </div>

                      <div>
                        <label className="block text-[10px] font-semibold text-slate-600 mb-1">
                          Rate / Sqft (₹)
                        </label>
                        {pType === 'box' || pType === 'sqft' ? (
                          <div>
                            <input
                              type="number"
                              step="0.01"
                              className="input input-sm py-1 text-right text-slate-700 tabular-nums w-full text-xs"
                              placeholder="₹/Sqft"
                              value={
                                item.base_rate_per_sqft !== undefined && item.base_rate_per_sqft !== null
                                  ? item.base_rate_per_sqft
                                  : item.rate_per_sqft
                              }
                              onChange={(e) =>
                                handleItemChange(areaIdx, itemIdx, 'rate_per_sqft', e.target.value)
                              }
                            />
                            {isCeraBrand(item.brand) ? (
                              <div className="text-[10px] text-amber-700 font-semibold text-right mt-0.5">
                                CERA (0% Disc)
                              </div>
                            ) : computedDiscountPercent > 0 && item.discount_percent ? (
                              <div className="text-[10px] text-emerald-700 font-mono font-semibold text-right mt-0.5">
                                ₹{formatCurrency(item.rate_per_sqft)} (-{item.discount_percent}%)
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          <div className="text-slate-400 font-mono text-xs py-1.5 px-2 bg-slate-50 rounded border border-slate-200 text-center">
                            N/A
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Boxes/Qty & Rate/Unit (2 Columns) */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-600 mb-1">
                          {pType === 'box'
                            ? 'Quantity (Boxes)'
                            : pType === 'bags'
                            ? 'Quantity (Bags)'
                            : pType === 'pieces'
                            ? 'Quantity (Pieces)'
                            : pType === 'sqft'
                            ? 'Boxes (N/A)'
                            : 'Quantity (Nos)'}
                        </label>
                        {pType === 'sqft' ? (
                          <div className="text-slate-400 font-mono text-xs py-1.5 px-2 bg-slate-50 rounded border border-slate-200 text-center">
                            N/A
                          </div>
                        ) : (
                          <input
                            type="number"
                            step={pType === 'box' ? '0.01' : '1'}
                            className="input input-sm py-1 text-right tabular-nums w-full text-xs font-semibold text-slate-900"
                            placeholder={
                              pType === 'box'
                                ? 'Boxes'
                                : pType === 'bags'
                                ? 'Bags'
                                : pType === 'pieces'
                                ? 'Pcs'
                                : 'Nos'
                            }
                            value={item.quantity_boxes}
                            onChange={(e) =>
                              handleItemChange(areaIdx, itemIdx, 'quantity_boxes', e.target.value)
                            }
                          />
                        )}
                      </div>

                      <div>
                        <label className="block text-[10px] font-semibold text-slate-600 mb-1">
                          Rate / {pType === 'box' ? 'Box' : pType === 'bags' ? 'Bag' : pType === 'pieces' ? 'Piece' : pType === 'sqft' ? 'Unit' : 'No'} (₹)
                        </label>
                        {pType === 'sqft' ? (
                          <div className="text-slate-400 font-mono text-xs py-1.5 px-2 bg-slate-50 rounded border border-slate-200 text-center">
                            N/A
                          </div>
                        ) : (
                          <div>
                            <input
                              type="number"
                              step="0.01"
                              className="input input-sm py-1 text-right tabular-nums w-full text-xs"
                              placeholder="₹/Unit"
                              value={
                                item.base_rate_per_box !== undefined && item.base_rate_per_box !== null
                                  ? item.base_rate_per_box
                                  : item.rate_per_box
                              }
                              onChange={(e) =>
                                handleItemChange(areaIdx, itemIdx, 'rate_per_box', e.target.value)
                              }
                            />
                            {isCeraBrand(item.brand) ? (
                              <div className="text-[10px] text-amber-700 font-semibold text-right mt-0.5">
                                CERA (0% Disc)
                              </div>
                            ) : computedDiscountPercent > 0 && item.discount_percent ? (
                              <div className="text-[10px] text-emerald-700 font-mono font-semibold text-right mt-0.5">
                                ₹{formatCurrency(item.rate_per_box)} (-{item.discount_percent}%)
                              </div>
                            ) : null}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Item Total (Highlighted Bar) */}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-100 bg-slate-50/70 -mx-3 -mb-3 px-3 py-2 rounded-b-xl">
                      <span className="text-xs font-semibold text-slate-600">Item Total:</span>
                      <div className="text-right">
                        <span className="text-sm font-bold text-slate-900 tabular-nums">
                          ₹ {formatCurrency(item.total_amount)}
                        </span>
                        {computedDiscountPercent > 0 &&
                          !isCeraBrand(item.brand) &&
                          (item._itemBaseTotal || 0) > item.total_amount && (
                            <span className="text-[10px] text-slate-400 line-through font-normal block">
                              ₹ {formatCurrency(item._itemBaseTotal || 0)}
                            </span>
                          )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Quick Add Line Item Button directly after the last item */}
              <button
                type="button"
                onClick={() => handleAddItem(areaIdx)}
                className="w-full py-2.5 px-3 rounded-xl border-2 border-dashed border-[#415A77]/40 hover:border-[#415A77] bg-white hover:bg-slate-50 text-[#1B263B] font-bold text-xs flex items-center justify-center space-x-1.5 shadow-2xs transition-all active:scale-[0.99]"
              >
                <Plus size={15} className="text-[#415A77]" />
                <span>+ Add Line Item in {area.name || `Area #${areaIdx + 1}`}</span>
              </button>
            </div>

            {/* Desktop View: Full Spreadsheet Table */}
            <div className="quotation-desktop-table overflow-x-auto w-full">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/75 text-slate-700 font-semibold text-[11px] uppercase tracking-wider">
                    <th className="py-2.5 px-1.5 text-center w-8">Sl</th>
                    <th className="py-2.5 px-2 text-left min-w-[200px]">Tile / Surface Description</th>
                    <th className="py-2.5 px-2 text-left w-36 min-w-[130px]">Brand</th>
                    <th className="py-2.5 px-2 text-left w-36 min-w-[130px]">Size</th>
                    <th className="py-2.5 px-1.5 text-left w-24 min-w-[90px]">Type</th>
                    <th className="py-2.5 px-1.5 text-right w-20 min-w-[70px]">Cov/Box</th>
                    <th className="py-2.5 px-1.5 text-right w-24 min-w-[85px]">Sqft</th>
                    <th className="py-2.5 px-1.5 text-right w-24 min-w-[95px]">Rate/Sqft</th>
                    <th className="py-2.5 px-1.5 text-right w-24 min-w-[85px]">Boxes/Qty</th>
                    <th className="py-2.5 px-1.5 text-right w-24 min-w-[95px]">Rate/Unit</th>
                    <th className="py-2.5 px-2 text-right w-28 min-w-[110px]">Total (₹)</th>
                    <th className="py-2.5 px-1 text-center w-10">Del</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {area.items.map((item, itemIdx) => {
                    const pType = (item.product_type || 'box').toLowerCase();

                    return (
                      <tr key={itemIdx} className="hover:bg-slate-50/60 transition-colors">
                        <td className="align-top pt-3 px-1.5 text-center font-mono text-slate-400 font-semibold text-xs">
                          {item.sl_no}
                        </td>

                        <td className="align-top py-1.5 px-2">
                          <input
                            type="text"
                            data-cell={`${areaIdx}-${itemIdx}-0`}
                            className="input input-sm py-1 font-medium text-slate-900 w-full tile-suggest-input"
                            value={item.description}
                            onChange={(e) =>
                              handleDescriptionChange(areaIdx, itemIdx, e.target.value, e.currentTarget)
                            }
                            onFocus={(e) => {
                              if (item.description) {
                                handleDescriptionChange(areaIdx, itemIdx, item.description, e.currentTarget);
                              }
                            }}
                            onBlur={() => handleDescriptionBlur(areaIdx, itemIdx)}
                            onKeyDown={(e) => handleCellKeyDown(e, areaIdx, itemIdx, 0)}
                            placeholder="Surface / Tile description"
                          />
                          <div className="flex items-center space-x-1.5 mt-1 text-[10px]">
                            <span className="text-slate-400 font-medium">Encrypted Code:</span>
                            <span
                              className="bg-slate-900 text-amber-300 font-mono font-bold px-1.5 py-0.2 rounded border border-slate-700 shadow-2xs"
                              title="Masked product code generated on Encrypted Export (Brand removed, random alphabet code ending with -AMA)"
                            >
                              {encryptedProductMap.get((item.description || '').trim()) || derive3LetterCode(item.description)}
                            </span>
                          </div>
                        </td>

                        <td className="align-top py-1.5 px-2">
                          <select
                            data-cell={`${areaIdx}-${itemIdx}-1`}
                            className="select select-sm py-1 w-full"
                            value={item.brand}
                            onChange={(e) =>
                              handleItemChange(areaIdx, itemIdx, 'brand', e.target.value)
                            }
                            onKeyDown={(e) => handleCellKeyDown(e, areaIdx, itemIdx, 1)}
                          >
                            {brands.length > 0 ? (
                              brands.map((b) => (
                                <option key={b.id} value={b.name}>
                                  {b.name}
                                </option>
                              ))
                            ) : (
                              <option value="Simpolo Ceramics">Simpolo Ceramics</option>
                            )}
                          </select>
                        </td>

                        <td className="align-top py-1.5 px-2">
                          {(() => {
                            const selectedBrandObj = brands.find(
                              (b) => b.name.toLowerCase() === (item.brand || '').toLowerCase()
                            );
                            const rowBrandSizes = coverages.filter(
                              (c) =>
                                (selectedBrandObj && c.brand_id === selectedBrandObj.id) ||
                                (c.brand_name && c.brand_name.toLowerCase() === (item.brand || '').toLowerCase())
                            );
                            const hasCurrentSize = rowBrandSizes.some(
                              (c) => c.size.toLowerCase() === (item.size || '').toLowerCase()
                            );

                            return (
                              <select
                                data-cell={`${areaIdx}-${itemIdx}-2`}
                                className="select select-sm py-1 font-mono text-xs w-full"
                                value={item.size}
                                onChange={(e) =>
                                  handleItemChange(areaIdx, itemIdx, 'size', e.target.value)
                                }
                                onKeyDown={(e) => handleCellKeyDown(e, areaIdx, itemIdx, 2)}
                              >
                                {rowBrandSizes.length > 0 ? (
                                  <>
                                    {item.size && !hasCurrentSize && (
                                      <option value={item.size}>
                                        {item.size} ({item.product_type || 'box'})
                                      </option>
                                    )}
                                    {rowBrandSizes.map((c) => (
                                      <option key={c.id} value={c.size}>
                                        {c.size} ({c.product_type || 'box'})
                                      </option>
                                    ))}
                                  </>
                                ) : (
                                  <option value={item.size || ''}>
                                    {item.size
                                      ? `${item.size} (${item.product_type || 'box'})`
                                      : 'No sizes configured'}
                                  </option>
                                )}
                              </select>
                            );
                          })()}
                        </td>

                        {/* Product Type selector */}
                        <td className="align-top py-1.5 px-1.5">
                          <select
                            data-cell={`${areaIdx}-${itemIdx}-3`}
                            className={`select select-sm py-1 font-semibold text-[11px] w-full ${
                              pType === 'box'
                                ? 'text-blue-700 bg-blue-50/50'
                                : pType === 'sqft'
                                ? 'text-emerald-700 bg-emerald-50/50'
                                : pType === 'bags'
                                ? 'text-amber-800 bg-amber-50/50'
                                : pType === 'pieces'
                                ? 'text-purple-800 bg-purple-50/50'
                                : 'text-slate-800 bg-slate-100'
                            }`}
                            value={item.product_type || 'box'}
                            onChange={(e) =>
                              handleItemChange(areaIdx, itemIdx, 'product_type', e.target.value)
                            }
                            onKeyDown={(e) => handleCellKeyDown(e, areaIdx, itemIdx, 3)}
                          >
                            <option value="box">Box</option>
                            <option value="pieces">Pieces</option>
                            <option value="sqft">Sq.Ft</option>
                            <option value="bags">Bags</option>
                            <option value="nos">Nos</option>
                          </select>
                        </td>

                        {/* Coverage / Box */}
                        <td className="align-top py-1.5 px-1.5 text-right">
                          {pType === 'box' ? (
                            <input
                              type="number"
                              step="0.1"
                              data-cell={`${areaIdx}-${itemIdx}-4`}
                              className="input input-sm py-1 text-right text-slate-600 font-mono w-full"
                              value={item.coverage_area}
                              onChange={(e) =>
                                handleItemChange(areaIdx, itemIdx, 'coverage_area', e.target.value)
                              }
                              onKeyDown={(e) => handleCellKeyDown(e, areaIdx, itemIdx, 4)}
                            />
                          ) : (
                            <span className="text-slate-300 font-mono text-center block pt-2">-</span>
                          )}
                        </td>

                        {/* Quantity Sqft */}
                        <td className="align-top py-1.5 px-1.5 text-right">
                          {pType === 'box' || pType === 'sqft' ? (
                            <input
                              type="number"
                              step="1"
                              data-cell={`${areaIdx}-${itemIdx}-5`}
                              className="input input-sm py-1 text-right font-semibold text-slate-900 tabular-nums w-full"
                              placeholder="Sqft"
                              value={item.quantity_sqft}
                              onChange={(e) =>
                                handleItemChange(areaIdx, itemIdx, 'quantity_sqft', e.target.value)
                              }
                              onKeyDown={(e) => handleCellKeyDown(e, areaIdx, itemIdx, 5)}
                            />
                          ) : (
                            <span className="text-slate-300 font-mono text-center block pt-2">-</span>
                          )}
                        </td>

                        {/* Rate / Sqft */}
                        <td className="align-top py-1.5 px-1.5 text-right">
                          {pType === 'box' || pType === 'sqft' ? (
                            <div>
                              <input
                                type="number"
                                step="0.01"
                                data-cell={`${areaIdx}-${itemIdx}-6`}
                                className="input input-sm py-1 text-right text-slate-700 tabular-nums w-full"
                                placeholder="₹/Sqft"
                                value={item.base_rate_per_sqft !== undefined && item.base_rate_per_sqft !== null ? item.base_rate_per_sqft : item.rate_per_sqft}
                                onChange={(e) =>
                                  handleItemChange(areaIdx, itemIdx, 'rate_per_sqft', e.target.value)
                                }
                                onKeyDown={(e) => handleCellKeyDown(e, areaIdx, itemIdx, 6)}
                              />
                              {isCeraBrand(item.brand) ? (
                                <div className="text-[10px] text-amber-700 font-semibold text-right mt-0.5 whitespace-nowrap" title="CERA brand excluded from discounts">
                                  CERA (0% Disc)
                                </div>
                              ) : (computedDiscountPercent > 0 && item.discount_percent ? (
                                <div className="text-[10px] text-emerald-700 font-mono font-semibold text-right mt-0.5 whitespace-nowrap" title="Effective discounted rate">
                                  ₹{formatCurrency(item.rate_per_sqft)} (-{item.discount_percent}%)
                                </div>
                              ) : null)}
                            </div>
                          ) : (
                            <span className="text-slate-300 font-mono text-center block pt-2">-</span>
                          )}
                        </td>

                        {/* Boxes / Unit Quantity */}
                        <td className="align-top py-1.5 px-1.5 text-right">
                          {pType === 'sqft' ? (
                            <span className="text-slate-300 font-mono text-center block pt-2">-</span>
                          ) : (
                            <input
                              type="number"
                              step={pType === 'box' ? '0.01' : '1'}
                              data-cell={`${areaIdx}-${itemIdx}-7`}
                              className={`input input-sm py-1 text-right tabular-nums w-full ${
                                pType === 'bags'
                                  ? 'font-bold text-amber-900 bg-amber-50/50'
                                  : pType === 'pieces'
                                  ? 'font-bold text-purple-900 bg-purple-50/50'
                                  : pType === 'nos'
                                  ? 'font-bold text-slate-900 bg-slate-50'
                                  : 'text-slate-600'
                              }`}
                              placeholder={
                                pType === 'box'
                                  ? 'Boxes'
                                  : pType === 'bags'
                                  ? 'Bags'
                                  : pType === 'pieces'
                                  ? 'Pcs'
                                  : 'Nos'
                              }
                              value={item.quantity_boxes}
                              onChange={(e) =>
                                handleItemChange(areaIdx, itemIdx, 'quantity_boxes', e.target.value)
                              }
                              onKeyDown={(e) => handleCellKeyDown(e, areaIdx, itemIdx, 7)}
                            />
                          )}
                        </td>

                        {/* Rate / Unit */}
                        <td className="align-top py-1.5 px-1.5 text-right">
                          {pType === 'sqft' ? (
                            <span className="text-slate-300 font-mono text-center block pt-2">-</span>
                          ) : (
                            <div>
                              <input
                                type="number"
                                step="0.01"
                                data-cell={`${areaIdx}-${itemIdx}-8`}
                                className={`input input-sm py-1 text-right tabular-nums w-full ${
                                  pType === 'bags'
                                    ? 'font-bold text-amber-900 bg-amber-50/50'
                                    : pType === 'pieces'
                                    ? 'font-bold text-purple-900 bg-purple-50/50'
                                    : pType === 'nos'
                                    ? 'font-bold text-slate-900 bg-slate-50'
                                    : 'text-slate-700'
                                }`}
                                placeholder={
                                  pType === 'box'
                                    ? '₹/Box'
                                    : pType === 'bags'
                                    ? '₹/Bag'
                                    : pType === 'pieces'
                                    ? '₹/Pc'
                                    : '₹/No'
                                }
                                value={item.base_rate_per_box !== undefined && item.base_rate_per_box !== null ? item.base_rate_per_box : item.rate_per_box}
                                onChange={(e) =>
                                  handleItemChange(areaIdx, itemIdx, 'rate_per_box', e.target.value)
                                }
                                onKeyDown={(e) => handleCellKeyDown(e, areaIdx, itemIdx, 8)}
                              />
                              {isCeraBrand(item.brand) ? (
                                <div className="text-[10px] text-amber-700 font-semibold text-right mt-0.5 whitespace-nowrap" title="CERA brand excluded from discounts">
                                  CERA (0% Disc)
                                </div>
                              ) : (computedDiscountPercent > 0 && item.discount_percent ? (
                                <div className="text-[10px] text-emerald-700 font-mono font-semibold text-right mt-0.5 whitespace-nowrap" title="Effective discounted rate">
                                  ₹{formatCurrency(item.rate_per_box)} (-{item.discount_percent}%)
                                </div>
                              ) : null)}
                            </div>
                          )}
                        </td>

                        {/* Total Amount */}
                        <td className="align-top py-2 px-2 text-right font-bold text-slate-900 tabular-nums">
                          <div>₹ {formatCurrency(item.total_amount)}</div>
                          {computedDiscountPercent > 0 && !isCeraBrand(item.brand) && (item._itemBaseTotal || 0) > item.total_amount && (
                            <div className="text-[10px] text-slate-400 line-through font-normal whitespace-nowrap">
                              ₹ {formatCurrency(item._itemBaseTotal || 0)}
                            </div>
                          )}
                        </td>

                        <td className="align-top pt-3 px-1 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(areaIdx, itemIdx)}
                            className="text-slate-400 hover:text-rose-600 transition-colors p-1"
                            title="Delete line"
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Area Card Footer: Add Line Item Button at the bottom of the room */}
            <div className="p-2.5 sm:p-3 bg-slate-50/80 border-t border-slate-200 flex items-center justify-between">
              <button
                type="button"
                onClick={() => handleAddItem(areaIdx)}
                className="btn btn-secondary text-xs px-3 py-1.5 font-bold inline-flex items-center space-x-1.5 hover:bg-slate-200/70"
              >
                <Plus size={13} className="text-[#415A77]" />
                <span>+ Add Line Item</span>
              </button>
              <span className="text-xs text-slate-500 font-medium">
                {area.items.length} {area.items.length === 1 ? 'item' : 'items'} in {area.name || `Area #${areaIdx + 1}`}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Section 3: Summary, GST, Discount & Notes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 card p-4">
        {/* Left Side: Special Notes & Tax Options */}
        <div className="space-y-3 text-xs">
          <div>
            <label className="block text-slate-700 font-semibold mb-1">GST Tax Framework</label>
            <select
              className="select select-sm w-full max-w-md"
              value={taxType}
              onChange={(e) => setTaxType(e.target.value as any)}
            >
              <option value="cgst_sgst">Intra-State: CGST (9%) + SGST (9%) = 18%</option>
              <option value="igst">Inter-State: IGST (18%)</option>
              <option value="exempt">Inclusive of Taxes / Exempt (0%)</option>
            </select>
            <p className="text-[10px] text-slate-500 mt-1">
              For Karnataka billing: Intra-State. For other states dispatch: Inter-State.
            </p>
          </div>

          <div>
            <label className="block text-slate-700 font-semibold mb-1">
              Special Notes & Instructions
            </label>
            <textarea
              className="input text-xs"
              rows={3}
              value={specialNotes}
              onChange={(e) => setSpecialNotes(e.target.value)}
              placeholder="e.g. Batch shade matching guaranteed. Site unloading by customer."
            />
          </div>

          {/* Amount in words live box */}
          <div className="p-2.5 rounded-md bg-slate-50 border border-slate-200">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
              Amount In Words (Indian Numbering Format):
            </span>
            <span className="text-xs font-semibold text-slate-900 italic mt-0.5 block">
              {amountInWords}
            </span>
          </div>
        </div>

        {/* Right Side: Totals Card */}
        <div className="bg-slate-50 p-4 rounded-md border border-slate-200 space-y-2 text-xs">
          <div className="flex justify-between py-1">
            <span className="text-slate-600 font-medium">List Total (Gross):</span>
            <span className="font-bold text-slate-900 tabular-nums">
              ₹ {formatCurrency(totalBaseQuote)}
            </span>
          </div>

          {ceraBaseTotal > 0 && (
            <div className="p-2.5 rounded bg-amber-50/80 border border-amber-200 text-[11px] space-y-1">
              <div className="flex justify-between text-amber-900 font-semibold">
                <span>CERA Excluded (0% Disc):</span>
                <span className="tabular-nums">₹ {formatCurrency(ceraBaseTotal)}</span>
              </div>
              <div className="flex justify-between text-slate-700">
                <span>Eligible Non-CERA Base:</span>
                <span className="tabular-nums font-medium">₹ {formatCurrency(nonCeraBaseTotal)}</span>
              </div>
            </div>
          )}

          {/* Trade Discount Input Block */}
          <div className="py-2 border-t border-b border-slate-200 space-y-1.5">
            <div className="flex justify-between items-center">
              <div>
                <span className="text-slate-700 font-semibold block">Trade Discount</span>
                {ceraBaseTotal > 0 && (
                  <span className="text-[10px] text-amber-700 font-medium block">
                    (Excluded from CERA)
                  </span>
                )}
              </div>
              <div className="flex items-center space-x-2">
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    className="input input-sm w-28 text-right tabular-nums font-semibold pr-6"
                    value={discountAmount || ''}
                    onChange={(e) => {
                      const amt = parseFloat(e.target.value) || 0;
                      setDiscountAmount(amt);
                      if (nonCeraBaseTotal > 0) {
                        setDiscountPercent(parseFloat(((amt / nonCeraBaseTotal) * 100).toFixed(2)));
                      } else {
                        setDiscountPercent(0);
                      }
                    }}
                    placeholder="0.00"
                  />
                  <span className="absolute right-2 top-1.5 text-slate-400 text-xs font-semibold">₹</span>
                </div>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    className="input input-sm w-20 text-right tabular-nums font-semibold pr-6"
                    value={discountPercent || ''}
                    onChange={(e) => {
                      const pct = parseFloat(e.target.value) || 0;
                      setDiscountPercent(pct);
                      if (nonCeraBaseTotal > 0) {
                        setDiscountAmount(parseFloat(((nonCeraBaseTotal * pct) / 100).toFixed(2)));
                      } else {
                        setDiscountAmount(0);
                      }
                    }}
                    placeholder="0.0"
                  />
                  <span className="absolute right-2 top-1.5 text-slate-400 text-xs font-semibold">%</span>
                </div>
              </div>
            </div>

            {finalDiscount > 0 && nonCeraBaseTotal > 0 && (
              <div className="text-[10px] text-emerald-700 font-mono text-right bg-emerald-50 px-2 py-1 rounded border border-emerald-200/60">
                Formula: ₹{formatCurrency(finalDiscount)} / ₹{formatCurrency(nonCeraBaseTotal)} × 100 ={' '}
                <strong>{computedDiscountPercent}%</strong> deducted from eligible items
              </div>
            )}
          </div>

          <div className="flex justify-between py-1">
            <span className="text-slate-600 font-medium">Taxable Base Amount:</span>
            <span className="font-bold text-slate-900 tabular-nums">
              ₹ {formatCurrency(taxableAmount)}
            </span>
          </div>

          {taxType === 'cgst_sgst' && (
            <>
              <div className="flex justify-between py-1 text-slate-600">
                <span>CGST (9%):</span>
                <span className="tabular-nums">₹ {formatCurrency(cgstAmount)}</span>
              </div>
              <div className="flex justify-between py-1 text-slate-600">
                <span>SGST (9%):</span>
                <span className="tabular-nums">₹ {formatCurrency(sgstAmount)}</span>
              </div>
            </>
          )}

          {taxType === 'igst' && (
            <div className="flex justify-between py-1 text-slate-600">
              <span>IGST (18%):</span>
              <span className="tabular-nums">₹ {formatCurrency(igstAmount)}</span>
            </div>
          )}

          <div className="flex justify-between py-1 text-slate-600">
            <span>Round Off:</span>
            <span className="tabular-nums">₹ {formatCurrency(roundOff)}</span>
          </div>

          {/* Net Total Highlight */}
          <div className="flex justify-between items-center p-3 bg-slate-900 text-white rounded-md mt-2 shadow-sm">
            <div>
              <span className="font-bold text-xs uppercase tracking-wider block text-slate-300">
                Net Payable Total
              </span>
              <span className="text-[10px] text-slate-400">Inclusive of GST</span>
            </div>
            <span className="font-bold text-lg tabular-nums">
              ₹ {formatCurrency(netTotal)}
            </span>
          </div>
        </div>
      </div>

      {/* PDF Preview Modal */}
      {previewPdf && (
        <PdfPreviewModal
          isOpen={true}
          onClose={() => setPreviewPdf(null)}
          pdfUrl={previewPdf.url}
          title={previewPdf.title}
          fileName={previewPdf.fileName}
          quotationId={previewPdf.quotationId}
          initialEncrypted={previewPdf.initialEncrypted}
        />
      )}

      {/* Floating Dropdown for Saved Products Memory (Rendered at root level with fixed position to prevent table/card clipping) */}
      {activeTileSuggestRow && tileSuggestions.length > 0 && suggestPosition && (
        <div
          style={{
            position: 'fixed',
            top: suggestPosition.top !== undefined ? `${suggestPosition.top}px` : undefined,
            bottom: suggestPosition.bottom !== undefined ? `${suggestPosition.bottom}px` : undefined,
            left: `${suggestPosition.left}px`,
            width: `${suggestPosition.width}px`,
            zIndex: 99999,
          }}
          className="tile-suggest-dropdown bg-white rounded-xl border border-slate-300 shadow-2xl max-h-72 overflow-y-auto divide-y divide-slate-100 animate-in fade-in zoom-in-95 duration-100"
        >
          <div className="px-3 py-1.5 bg-slate-100/90 text-[10px] font-bold text-slate-600 uppercase tracking-wider flex items-center justify-between sticky top-0 border-b border-slate-200 z-10 backdrop-blur-sm">
            <span className="flex items-center space-x-1.5 text-slate-700">
              <Sparkles size={11} className="text-amber-500" />
              <span>Saved Products Memory ({tileSuggestions.length})</span>
            </span>
            <span className="text-blue-700 font-semibold">Click / Enter to Auto-Fill</span>
          </div>
          {tileSuggestions.map((sug, sIdx) => (
            <div
              key={sug.id || sIdx}
              onMouseDown={(e) => {
                e.preventDefault();
                applySavedTileItem(activeTileSuggestRow.areaIdx, activeTileSuggestRow.itemIdx, sug);
              }}
              className={`p-2.5 flex items-center justify-between cursor-pointer transition-colors text-left ${
                sIdx === tileHighlightIndex
                  ? 'bg-blue-50 text-blue-900 font-semibold'
                  : 'hover:bg-slate-50 text-slate-800'
              }`}
            >
              <div className="min-w-0 flex-1 mr-2">
                <div className="font-bold text-xs text-slate-900 truncate">
                  {sug.description}
                </div>
                <div className="flex items-center space-x-1.5 mt-0.5 text-[10px] text-slate-500">
                  {sug.brand && (
                    <span className="bg-slate-100 text-slate-700 px-1.5 py-0.2 rounded font-medium border border-slate-200">
                      {sug.brand}
                    </span>
                  )}
                  {sug.size && (
                    <span className="bg-blue-50 text-blue-700 px-1.5 py-0.2 rounded font-mono font-medium border border-blue-100">
                      {sug.size}
                    </span>
                  )}
                  <span className="uppercase text-[9px] font-bold text-slate-400 bg-slate-50 px-1 py-0.2 rounded">
                    {sug.product_type || 'box'}
                  </span>
                </div>
              </div>
              <div className="text-right shrink-0">
                <span className="font-mono font-bold text-xs text-emerald-700 block">
                  ₹{formatCurrency(sug.rate_per_sqft || sug.base_rate_per_sqft || sug.rate_per_box || 0)}
                </span>
                <span className="text-[10px] text-slate-400 block">
                  {sug.product_type === 'sqft' ? '/Sqft' : sug.product_type === 'box' ? '/Sqft' : '/Unit'}
                </span>
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
            loadExistingQuotation(quotationId);
          }}
        />
      )}
    </div>
  );
};
