import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useServer } from '../context/ServerContext';
import { Quotation, QuotationItem } from '../types';
import { ProcurementStepper } from '../components/ProcurementStepper';
import {
  Truck,
  Search,
  Filter,
  Calendar,
  Clock,
  CheckCircle2,
  Package,
  Factory,
  MapPin,
  Phone,
  User,
  AlertTriangle,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Save,
  Printer,
  X,
  ShieldCheck,
  Check,
  Eye,
  Bell,
  ArrowRight,
  Layers,
  ExternalLink,
} from 'lucide-react';

export const DISPATCH_STATUS_OPTIONS = [
  'Yet to Update',
  'Ready Stock',
  'Need to Arrange from Local',
  'Factory Order',
  'Dispatched',
] as const;

export type DispatchStatusType = (typeof DISPATCH_STATUS_OPTIONS)[number];

export interface ChangedQuotationSummary {
  id: number;
  quotation_number: string;
  customer_name: string;
  customer_phone?: string;
  site_location?: string;
  sales_person_name?: string;
  dispatch_status?: string;
  expected_dispatch_date?: string;
  dispatch_change_summary?: string;
  change_summary_parsed?: {
    changed_by?: string;
    changed_by_role?: string;
    changed_at?: string;
    prev_version?: number;
    new_version?: number;
    diffs?: string[];
  } | null;
  updated_at: string;
}

export const VALID_PROCUREMENT_STATUSES = [
  'Availability Confirmed',
  'Payment Done',
  'Dispatched',
  'On the Way',
  'Reached to Godown',
] as const;

export type ProcurementStatusType = (typeof VALID_PROCUREMENT_STATUSES)[number];

interface ProcurementStats {
  total_procurement_items: number;
  avail_confirmed: number;
  payment_done: number;
  supplier_dispatched: number;
  on_the_way: number;
  reached_godown: number;
}

interface DispatchStats {
  total_orders?: number;
  total_closed_quotations: number;
  approved_count?: number;
  closed_count?: number;
  pending_item_changes_count?: number;
  changed_quotations?: ChangedQuotationSummary[];
  total_items: number;
  yet_to_update_count?: number;
  ready_stock_count: number;
  local_arrange_count: number;
  factory_order_count: number;
  dispatched_count: number;
  overdue_count: number;
  todays_dispatches?: Quotation[];
  tomorrows_dispatches?: Quotation[];
  procurement_stats?: ProcurementStats;
}

export interface ProcurementItem {
  id: number;
  quotation_id: number;
  area_id?: number;
  area_name?: string;
  item_type?: string;
  description: string;
  brand?: string;
  size?: string;
  product_type?: string;
  quantity: number;
  coverage_area?: number;
  rate_per_sqft?: number;
  rate_per_unit?: number;
  item_total?: number;
  dispatch_status: string;
  expected_dispatch_date?: string;
  dispatch_notes?: string;
  dispatched_quantity?: number;
  procurement_status?: string | null;
  procurement_notes?: string | null;
  procurement_category?: string | null;
  procurement_updated_at?: string;
  procurement_updated_by_name?: string;
  quotation_number: string;
  quotation_date: string;
  quotation_type: string;
  quotation_status: string;
  customer_id?: number;
  customer_name: string;
  customer_phone?: string;
  site_location?: string;
  sales_person_id?: number;
  sales_person_name?: string;
  quotation_dispatch_status?: string;
  quotation_expected_date?: string;
}

export interface DispatchManagementProps {
  initialView?: 'all' | 'local-purchase' | 'factory-orders';
}

export const DispatchManagement: React.FC<DispatchManagementProps> = ({ initialView = 'all' }) => {
  const { user } = useAuth();
  const { fetchApi, subscribeToEvents, company } = useServer();

  const userRole = (user?.role || '').toLowerCase();
  const canEditDispatch = ['admin', 'manager', 'dispatch', 'dispatch_team'].includes(userRole);
  const isViewOnly = !canEditDispatch;
  const canSeeModifiedItemsAlert = ['admin', 'manager', 'dispatch', 'dispatch_team', 'accounts', 'accountant'].includes(userRole);

  const [loading, setLoading] = useState<boolean>(true);
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [stats, setStats] = useState<DispatchStats | null>(null);

  // Top View Mode: All Orders vs Dedicated Local Purchase vs Dedicated Factory Orders
  const [currentView, setCurrentView] = useState<'all' | 'local-purchase' | 'factory-orders'>(initialView);

  useEffect(() => {
    if (initialView) {
      setCurrentView(initialView);
    }
  }, [initialView]);

  // Dedicated Procurement Queue State
  const [procurementItems, setProcurementItems] = useState<ProcurementItem[]>([]);
  const [procurementLoading, setProcurementLoading] = useState<boolean>(false);
  const [procurementSubTab, setProcurementSubTab] = useState<'active' | 'fulfilled'>('active');
  const [procurementSearch, setProcurementSearch] = useState<string>('');
  const [debouncedProcSearch, setDebouncedProcSearch] = useState<string>('');
  const [procurementStageFilter, setProcurementStageFilter] = useState<string>('all');
  const [procurementSummary, setProcurementSummary] = useState<{
    local_active_count: number;
    local_fulfilled_count: number;
    factory_active_count: number;
    factory_fulfilled_count: number;
  }>({
    local_active_count: 0,
    local_fulfilled_count: 0,
    factory_active_count: 0,
    factory_fulfilled_count: 0,
  });
  const [markingReadyStockId, setMarkingReadyStockId] = useState<number | null>(null);
  const [updatingItemId, setUpdatingItemId] = useState<number | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((cur) => (cur === msg ? null : cur));
    }, 4000);
  };

  // Filters
  const [search, setSearch] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [dispatchStatusFilter, setDispatchStatusFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'tomorrow' | 'this_week' | 'overdue'>('all');
  const [procurementFilter, setProcurementFilter] = useState<string>('all');

  // Dispatches popup banner dismiss states
  const [isTodayBannerDismissed, setIsTodayBannerDismissed] = useState<boolean>(false);
  const [isTomorrowBannerDismissed, setIsTomorrowBannerDismissed] = useState<boolean>(false);

  // Active / Selected Quotation for Editing
  const [selectedQuotationId, setSelectedQuotationId] = useState<number | null>(null);
  const [detailLoading, setDetailLoading] = useState<boolean>(false);
  const [activeQuotation, setActiveQuotation] = useState<Quotation | null>(null);
  const [activeItems, setActiveItems] = useState<QuotationItem[]>([]);

  // Form State for Active Quotation
  const [overallStatus, setOverallStatus] = useState<string>('Yet to Update');
  const [overallDate, setOverallDate] = useState<string>('');
  const [overallNotes, setOverallNotes] = useState<string>('');
  const [editedItems, setEditedItems] = useState<
    Record<
      number,
      {
        status: string;
        date: string;
        notes: string;
        dispatched_quantity?: number | string;
        procurement_status?: string;
        procurement_notes?: string;
      }
    >
  >({});
  const [saving, setSaving] = useState<boolean>(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);

  // Review Item Changes Modal State (for when items were modified after dispatch update)
  const [reviewingChangeQuotation, setReviewingChangeQuotation] = useState<any | null>(null);
  const [acknowledgingChange, setAcknowledgingChange] = useState<boolean>(false);
  const [itemChangedAlert, setItemChangedAlert] = useState<any | null>(null);

  // Print Slip Modal State
  const [isPrintSlipOpen, setIsPrintSlipOpen] = useState<boolean>(false);

  // Quotation line items view mode: Default sequence vs Grouped by Availability
  const [itemsViewMode, setItemsViewMode] = useState<'default' | 'availability'>('default');

  // Group line items by stock & procurement availability: Ready Stock first, Local Purchase next, Factory Order next
  const availabilityGroups = useMemo(() => {
    const readyStock: QuotationItem[] = [];
    const localPurchase: QuotationItem[] = [];
    const factoryOrder: QuotationItem[] = [];
    const pending: QuotationItem[] = [];

    activeItems.forEach((item, idx) => {
      const itemId = item.id || idx;
      const itemState = editedItems[itemId] || {
        status: item.dispatch_status || 'Ready Stock',
      };
      const st = itemState.status || item.dispatch_status || 'Ready Stock';

      if (st === 'Ready Stock' || st === 'Dispatched') {
        readyStock.push(item);
      } else if (st === 'Need to Arrange from Local') {
        localPurchase.push(item);
      } else if (st === 'Factory Order') {
        factoryOrder.push(item);
      } else {
        pending.push(item);
      }
    });

    return [
      {
        id: 'ready-stock',
        label: '1. Ready Stock & Dispatched',
        subtitle: 'Available immediately in godown / Dispatched',
        color: 'emerald',
        items: readyStock,
      },
      {
        id: 'local-purchase',
        label: '2. Local Purchase Items',
        subtitle: 'Need to arrange from local distributors / market vendors',
        color: 'amber',
        items: localPurchase,
      },
      {
        id: 'factory-order',
        label: '3. Factory Order Items',
        subtitle: 'Direct mill / factory production sourcing',
        color: 'indigo',
        items: factoryOrder,
      },
      ...(pending.length > 0
        ? [
            {
              id: 'pending',
              label: '4. Stock Status Pending',
              subtitle: 'Awaiting dispatch categorization',
              color: 'slate',
              items: pending,
            },
          ]
        : []),
    ];
  }, [activeItems, editedItems]);

  // Debounce search
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(handler);
  }, [search]);

  // Load list & stats
  const loadData = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (debouncedSearch) params.append('search', debouncedSearch);
      if (dispatchStatusFilter !== 'all') params.append('dispatch_status', dispatchStatusFilter);
      if (dateFilter !== 'all') params.append('filter_date', dateFilter);
      if (procurementFilter !== 'all') params.append('procurement_status', procurementFilter);

      const [quotesRes, statsRes] = await Promise.all([
        fetchApi<any>(`/api/dispatch/quotations?${params.toString()}`),
        fetchApi<any>('/api/dispatch/stats'),
      ]);

      setQuotations(quotesRes.quotations || []);
      if (statsRes) {
        setStats(statsRes);
        setProcurementSummary((prev) => ({
          ...prev,
          local_active_count: statsRes.local_active_count ?? prev.local_active_count,
          factory_active_count: statsRes.factory_active_count ?? prev.factory_active_count,
        }));
      }
    } catch (err: any) {
      console.error('Error loading dispatch data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [debouncedSearch, dispatchStatusFilter, dateFilter, procurementFilter]);

  // Debounce procurement search
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedProcSearch(procurementSearch);
    }, 300);
    return () => clearTimeout(handler);
  }, [procurementSearch]);

  // Load dedicated procurement items queue
  const loadProcurementItems = async () => {
    try {
      setProcurementLoading(true);
      const category = currentView === 'local-purchase' ? 'local' : currentView === 'factory-orders' ? 'factory' : 'all';
      const params = new URLSearchParams({
        category,
        status: procurementSubTab,
      });
      if (procurementStageFilter !== 'all') {
        params.append('procurement_stage', procurementStageFilter);
      }
      if (debouncedProcSearch.trim()) {
        params.append('search', debouncedProcSearch.trim());
      }

      const res = await fetchApi<any>(`/api/dispatch/procurement-items?${params.toString()}`);
      setProcurementItems(res?.items || []);
      if (res?.summary) {
        setProcurementSummary(res.summary);
      }
    } catch (err: any) {
      console.error('Error fetching procurement items:', err);
    } finally {
      setProcurementLoading(false);
    }
  };

  useEffect(() => {
    if (currentView === 'local-purchase' || currentView === 'factory-orders') {
      loadProcurementItems();
    }
  }, [currentView, procurementSubTab, procurementStageFilter, debouncedProcSearch]);

  // Procurement Action Handlers
  const handleItemStageChange = async (itemId: number, newStage: string) => {
    try {
      setUpdatingItemId(itemId);
      await fetchApi<any>(`/api/dispatch/items/${itemId}`, {
        method: 'POST',
        body: JSON.stringify({ procurement_status: newStage }),
      });
      setProcurementItems((prev) =>
        prev.map((item) =>
          item.id === itemId
            ? {
                ...item,
                procurement_status: newStage,
                procurement_updated_at: new Date().toISOString(),
                procurement_updated_by_name: user?.full_name,
              }
            : item
        )
      );
      showToast(`Procurement stage updated to "${newStage}"`);
    } catch (err: any) {
      showToast(err.message || 'Failed to update stage');
    } finally {
      setUpdatingItemId(null);
    }
  };

  const handleItemNotesChange = async (itemId: number, notes: string) => {
    try {
      await fetchApi<any>(`/api/dispatch/items/${itemId}`, {
        method: 'POST',
        body: JSON.stringify({ procurement_notes: notes }),
      });
      setProcurementItems((prev) =>
        prev.map((item) => (item.id === itemId ? { ...item, procurement_notes: notes } : item))
      );
    } catch (err: any) {
      console.warn('Failed to save notes:', err);
    }
  };

  const handleItemDateChange = async (itemId: number, newDate: string) => {
    try {
      await fetchApi<any>(`/api/dispatch/items/${itemId}`, {
        method: 'POST',
        body: JSON.stringify({ expected_dispatch_date: newDate }),
      });
      setProcurementItems((prev) =>
        prev.map((item) => (item.id === itemId ? { ...item, expected_dispatch_date: newDate } : item))
      );
      showToast(`Expected date updated to ${newDate}`);
    } catch (err: any) {
      showToast(err.message || 'Failed to update expected date');
    }
  };

  const handleMarkReadyStock = async (item: ProcurementItem) => {
    try {
      setMarkingReadyStockId(item.id);
      await fetchApi<any>(`/api/dispatch/items/${item.id}`, {
        method: 'POST',
        body: JSON.stringify({ mark_ready_stock: true }),
      });

      if (procurementSubTab === 'active') {
        // Remove item from active pending queue immediately
        setProcurementItems((prev) => prev.filter((it) => it.id !== item.id));
        setProcurementSummary((prev) => {
          const isLocal =
            (item.procurement_category || '').toLowerCase() === 'local' ||
            item.dispatch_status === 'Need to Arrange from Local';
          return {
            ...prev,
            local_active_count: isLocal ? Math.max(0, prev.local_active_count - 1) : prev.local_active_count,
            local_fulfilled_count: isLocal ? prev.local_fulfilled_count + 1 : prev.local_fulfilled_count,
            factory_active_count: !isLocal ? Math.max(0, prev.factory_active_count - 1) : prev.factory_active_count,
            factory_fulfilled_count: !isLocal ? prev.factory_fulfilled_count + 1 : prev.factory_fulfilled_count,
          };
        });
      } else {
        setProcurementItems((prev) =>
          prev.map((it) =>
            it.id === item.id
              ? {
                  ...it,
                  dispatch_status: 'Ready Stock',
                  procurement_status: 'Reached to Godown',
                  procurement_updated_at: new Date().toISOString(),
                  procurement_updated_by_name: user?.full_name,
                }
              : it
          )
        );
      }

      showToast(
        `✓ Item marked as Ready Stock & moved to godown inventory! Quotation ${item.quotation_number} updated.`
      );
      loadData();
    } catch (err: any) {
      showToast(err.message || 'Failed to mark ready stock');
    } finally {
      setMarkingReadyStockId(null);
    }
  };

  const getDaysDiff = (dateStr?: string) => {
    if (!dateStr) return null;
    const target = new Date(dateStr);
    if (isNaN(target.getTime())) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    target.setHours(0, 0, 0, 0);
    const diffTime = target.getTime() - today.getTime();
    return Math.round(diffTime / (1000 * 60 * 60 * 24));
  };

  // Real-time synchronization
  useEffect(() => {
    const unsubscribe = subscribeToEvents((event) => {
      if (
        ['DISPATCH_UPDATED', 'QUOTATION_STATUS_CHANGED', 'QUOTATION_UPDATED', 'DISPATCH_CHANGES_ACKNOWLEDGED'].includes(
          event.type
        )
      ) {
        loadData();
        if (currentView === 'local-purchase' || currentView === 'factory-orders') {
          loadProcurementItems();
        }
        if (selectedQuotationId && event.payload?.quotation_id === selectedQuotationId) {
          loadQuotationDetail(selectedQuotationId);
        }
      } else if (event.type === 'DISPATCH_ITEM_CHANGED') {
        if (canSeeModifiedItemsAlert) {
          loadData();
        if (currentView === 'local-purchase' || currentView === 'factory-orders') {
          loadProcurementItems();
        }
          setItemChangedAlert(event.payload);
        } else {
          loadData();
        if (currentView === 'local-purchase' || currentView === 'factory-orders') {
          loadProcurementItems();
        }
        }
      }
    });
    return () => unsubscribe();
  }, [selectedQuotationId]);

  // Handle opening the item changes review modal
  const handleOpenReviewModal = (q: any) => {
    let parsed = q.change_summary_parsed;
    if (!parsed && q.dispatch_change_summary) {
      try {
        parsed = JSON.parse(q.dispatch_change_summary);
      } catch {
        parsed = null;
      }
    }
    setReviewingChangeQuotation({
      ...q,
      parsedSummary: parsed,
    });
  };

  // Handle acknowledging and clearing the item changes notification
  const handleAcknowledgeItemChanges = async (quotationId: number) => {
    try {
      setAcknowledgingChange(true);
      await fetchApi(`/api/dispatch/quotations/${quotationId}/acknowledge-changes`, {
        method: 'POST',
      });
      setReviewingChangeQuotation(null);
      setItemChangedAlert(null);
      await loadData();
      if (selectedQuotationId === quotationId) {
        await loadQuotationDetail(quotationId);
      }
    } catch (err: any) {
      alert(err.message || 'Failed to acknowledge item changes');
    } finally {
      setAcknowledgingChange(false);
    }
  };

  // Helper to compute overall dispatch status from item states
  const computeOverallDispatchStatus = (
    items: QuotationItem[],
    itemMap: Record<number, any>
  ): DispatchStatusType => {
    if (!items || items.length === 0) return 'Yet to Update';
    const statuses = items.map((it) => {
      const state = it.id ? itemMap[it.id] : null;
      return (state?.status || it.dispatch_status || 'Yet to Update') as DispatchStatusType;
    });
    const total = statuses.length;
    const dispatched = statuses.filter((s) => s === 'Dispatched').length;
    const factory = statuses.filter((s) => s === 'Factory Order').length;
    const local = statuses.filter((s) => s === 'Need to Arrange from Local').length;
    const ready = statuses.filter((s) => s === 'Ready Stock').length;

    if (total > 0 && dispatched === total) return 'Dispatched';
    if (factory > 0) return 'Factory Order';
    if (local > 0) return 'Need to Arrange from Local';
    if (ready > 0) return 'Ready Stock';
    return 'Yet to Update';
  };

  // Load single quotation detail for editing
  const loadQuotationDetail = async (id: number) => {
    try {
      setDetailLoading(true);
      setValidationError(null);
      setSaveSuccessMessage(null);
      const res = await fetchApi<any>(`/api/dispatch/quotations/${id}`);
      setActiveQuotation(res.quotation || null);

      const itemsList: QuotationItem[] = res.items || [];
      setActiveItems(itemsList);

      const qStatus = (res.quotation?.dispatch_status || 'Yet to Update') as DispatchStatusType;
      const qDate = res.quotation?.expected_dispatch_date
        ? String(res.quotation.expected_dispatch_date).split('T')[0]
        : '';
      const qNotes = res.quotation?.dispatch_notes || '';

      // Initialize item form states
      const itemMap: Record<
        number,
        {
          status: string;
          date: string;
          notes: string;
          dispatched_quantity?: number | string;
          procurement_status?: string;
          procurement_notes?: string;
        }
      > = {};
      itemsList.forEach((it) => {
        if (it.id) {
          const totalQty = it.quantity_boxes > 0 ? it.quantity_boxes : it.quantity_sqft > 0 ? it.quantity_sqft : 1;
          const initialDispQty =
            it.dispatched_quantity !== undefined && it.dispatched_quantity !== null
              ? it.dispatched_quantity
              : (it.dispatch_status === 'Dispatched' ? totalQty : 0);

          itemMap[it.id] = {
            status: it.dispatch_status || qStatus || 'Yet to Update',
            date: it.expected_dispatch_date
              ? String(it.expected_dispatch_date).split('T')[0]
              : qDate,
            notes: it.dispatch_notes || '',
            dispatched_quantity: initialDispQty,
            procurement_status: it.procurement_status || '',
            procurement_notes: it.procurement_notes || '',
          };
        }
      });
      setEditedItems(itemMap);

      // Dynamically compute and sync overall dispatch status from the loaded items
      const computedFromItems = computeOverallDispatchStatus(itemsList, itemMap);
      const effectiveOverallStatus = computedFromItems !== 'Yet to Update' ? computedFromItems : qStatus;

      setOverallStatus(effectiveOverallStatus);
      setOverallDate(qDate);
      setOverallNotes(qNotes);

      // Instantly sync the parent table row's dispatch stage badge if out of sync
      if (effectiveOverallStatus !== qStatus) {
        setQuotations((prev) =>
          prev.map((q) => (q.id === id ? { ...q, dispatch_status: effectiveOverallStatus as any } : q))
        );
      }
    } catch (err: any) {
      setValidationError(err.message || 'Failed to load quotation dispatch details');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleToggleRow = (q: Quotation) => {
    if (selectedQuotationId === q.id) {
      setSelectedQuotationId(null);
      setActiveQuotation(null);
    } else {
      setSelectedQuotationId(q.id);
      loadQuotationDetail(q.id);
    }
  };

  // Helper to apply quotation date to all items
  const handleApplyDateToAllItems = () => {
    if (!overallDate) {
      setValidationError('Please select an Expected Dispatch Date first before applying to all items.');
      return;
    }
    setValidationError(null);
    setEditedItems((prev) => {
      const updated = { ...prev };
      Object.keys(updated).forEach((k) => {
        const numKey = Number(k);
        updated[numKey] = {
          ...updated[numKey],
          date: overallDate,
        };
      });
      return updated;
    });
  };

  // Helper to mark all items with a specific status
  const handleApplyStatusToAllItems = (status: DispatchStatusType) => {
    setOverallStatus(status);
    setEditedItems((prev) => {
      const updated = { ...prev };
      Object.keys(updated).forEach((k) => {
        const numKey = Number(k);
        const itemObj = activeItems.find((it) => it.id === numKey);
        const totalQty = itemObj ? (itemObj.quantity_boxes > 0 ? itemObj.quantity_boxes : itemObj.quantity_sqft > 0 ? itemObj.quantity_sqft : 1) : 0;
        let newDispQty = updated[numKey]?.dispatched_quantity;
        if (status === 'Dispatched' && (!newDispQty || Number(newDispQty) === 0)) {
          newDispQty = totalQty;
        }
        updated[numKey] = {
          ...updated[numKey],
          status,
          dispatched_quantity: newDispQty,
        };
      });
      return updated;
    });

    if (selectedQuotationId) {
      setQuotations((prev) =>
        prev.map((q) => (q.id === selectedQuotationId ? { ...q, dispatch_status: status as any } : q))
      );
    }
  };

  // Save dispatch changes with validation
  const handleSaveDispatch = async () => {
    if (!selectedQuotationId) return;

    setValidationError(null);
    setSaveSuccessMessage(null);

    // VALIDATION: "expected discpatch date must be mentioned while saving"
    if (!overallDate) {
      const anyMissing = activeItems.some((it) => {
        const itemState = it.id ? editedItems[it.id] : null;
        return !itemState || !itemState.date;
      });

      if (anyMissing) {
        setValidationError(
          'Expected Dispatch Date must be specified while saving. Please select an expected dispatch date.'
        );
        return;
      }
    }

    const payloadItems = activeItems.map((it) => {
      const state = it.id ? editedItems[it.id] : null;
      const itStatus = state?.status || overallStatus;
      const totalQty = it.quantity_boxes > 0 ? it.quantity_boxes : it.quantity_sqft > 0 ? it.quantity_sqft : 1;
      const dispQty =
        state?.dispatched_quantity !== undefined && state?.dispatched_quantity !== null && state?.dispatched_quantity !== ''
          ? state.dispatched_quantity
          : (itStatus === 'Dispatched' ? totalQty : 0);

      return {
        id: it.id,
        dispatch_status: itStatus,
        expected_dispatch_date: state?.date || overallDate,
        dispatch_notes: state?.notes || '',
        dispatched_quantity: dispQty,
        procurement_status: state?.procurement_status || '',
        procurement_notes: state?.procurement_notes || '',
      };
    });

    const computedOverall = computeOverallDispatchStatus(activeItems, editedItems);
    const finalStatusToSend = overallStatus !== 'Yet to Update' ? overallStatus : computedOverall;

    try {
      setSaving(true);
      await fetchApi(`/api/dispatch/quotations/${selectedQuotationId}`, {
        method: 'PUT',
        body: JSON.stringify({
          expected_dispatch_date: overallDate,
          dispatch_status: finalStatusToSend,
          dispatch_notes: overallNotes,
          items: payloadItems,
        }),
      });

      setSaveSuccessMessage('Dispatch status and expected dispatch dates saved successfully!');
      setTimeout(() => setSaveSuccessMessage(null), 4000);
      loadData();
      loadQuotationDetail(selectedQuotationId);
    } catch (err: any) {
      setValidationError(err.message || 'Failed to save dispatch changes');
    } finally {
      setSaving(false);
    }
  };

  // Status Badge Helper
  const renderDispatchBadge = (status?: string) => {
    switch (status) {
      case 'Yet to Update':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-300 shadow-xs whitespace-nowrap">
            <Clock size={11} className="text-slate-500" />
            <span>Yet to Update</span>
          </span>
        );
      case 'Ready Stock':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-xs whitespace-nowrap">
            <CheckCircle2 size={11} className="text-emerald-600" />
            <span>Ready Stock</span>
          </span>
        );
      case 'Need to Arrange from Local':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300 shadow-xs whitespace-nowrap">
            <Package size={11} className="text-amber-700" />
            <span>Arrange Local</span>
          </span>
        );
      case 'Factory Order':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-100 text-indigo-900 border border-indigo-300 shadow-xs whitespace-nowrap">
            <Factory size={11} className="text-indigo-700" />
            <span>Factory Order</span>
          </span>
        );
      case 'Dispatched':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-teal-800 text-teal-50 border border-teal-900 shadow-xs whitespace-nowrap">
            <Truck size={11} className="text-teal-200" />
            <span>Dispatched</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-300 whitespace-nowrap">
            <span>{status || 'Yet to Update'}</span>
          </span>
        );
    }
  };

  // Check if expected date is today or overdue
  const getDateStatusBadge = (dateStr?: string | null, isDispatched: boolean = false) => {
    if (!dateStr) {
      return (
        <span className="text-rose-600 font-semibold text-[11px] flex items-center justify-center space-x-1">
          <AlertTriangle size={12} />
          <span>Date Required</span>
        </span>
      );
    }

    if (isDispatched) {
      return (
        <span className="text-emerald-700 font-semibold text-[11px] flex items-center justify-center space-x-1">
          <CheckCircle2 size={12} />
          <span>Completed</span>
        </span>
      );
    }

    const today = new Date().toISOString().split('T')[0];
    if (dateStr < today) {
      return (
        <span className="text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded text-[11px] font-bold inline-flex items-center space-x-1">
          <AlertTriangle size={11} />
          <span>Overdue ({new Date(dateStr).toLocaleDateString('en-GB')})</span>
        </span>
      );
    }
    if (dateStr === today) {
      return (
        <span className="text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded text-[11px] font-bold inline-flex items-center space-x-1">
          <Clock size={11} />
          <span>Due Today</span>
        </span>
      );
    }

    const dTomorrow = new Date();
    dTomorrow.setDate(dTomorrow.getDate() + 1);
    const tomorrow = dTomorrow.toISOString().split('T')[0];
    if (dateStr === tomorrow) {
      return (
        <span className="text-indigo-800 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded text-[11px] font-bold inline-flex items-center space-x-1">
          <Calendar size={11} className="text-indigo-600" />
          <span>Due Tomorrow</span>
        </span>
      );
    }

    return (
      <span className="text-slate-600 text-[11px] font-medium inline-flex items-center space-x-1">
        <Calendar size={11} className="text-slate-400" />
        <span>{new Date(dateStr).toLocaleDateString('en-GB')}</span>
      </span>
    );
  };

  const hasActiveFilters =
    Boolean(search) ||
    dispatchStatusFilter !== 'all' ||
    dateFilter !== 'all' ||
    procurementFilter !== 'all';

  const handleClearFilters = () => {
    setSearch('');
    setDebouncedSearch('');
    setDispatchStatusFilter('all');
    setDateFilter('all');
    setProcurementFilter('all');
  };


  const renderProcurementWorkspace = () => {
    const isLocal = currentView === 'local-purchase';
    const activeCount = isLocal
      ? procurementSummary.local_active_count
      : procurementSummary.factory_active_count;
    const fulfilledCount = isLocal
      ? procurementSummary.local_fulfilled_count
      : procurementSummary.factory_fulfilled_count;
    const categoryLabel = isLocal ? 'Local Purchase' : 'Factory Orders';

    return (
      <div className="space-y-4 animate-fade-in">
        {/* Workspace Banner & Metrics */}
        <div
          className={`card p-4 sm:p-5 rounded-2xl border shadow-xs ${
            isLocal
              ? 'bg-gradient-to-r from-amber-500/10 via-amber-50 to-white border-amber-200'
              : 'bg-gradient-to-r from-indigo-500/10 via-indigo-50 to-white border-indigo-200'
          }`}
        >
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start space-x-3.5">
              <div
                className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 shadow-md ${
                  isLocal
                    ? 'bg-amber-500 text-white shadow-amber-500/20'
                    : 'bg-indigo-600 text-white shadow-indigo-600/20'
                }`}
              >
                {isLocal ? <Package size={24} /> : <Factory size={24} />}
              </div>
              <div>
                <div className="flex items-center space-x-2.5">
                  <h2 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                    {isLocal ? 'Local Purchase Procurement' : 'Factory Orders Procurement'}
                  </h2>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                      isLocal
                        ? 'bg-amber-100 text-amber-900 border border-amber-300'
                        : 'bg-indigo-100 text-indigo-900 border border-indigo-300'
                    }`}
                  >
                    {isLocal ? 'Local Market' : 'Mill Production'}
                  </span>
                </div>
                <p className="text-xs text-slate-600 mt-1 max-w-2xl leading-relaxed">
                  {isLocal
                    ? 'Quotation line items to be arranged from local distributors and vendors. Items remain in this active list until arrived in godown and marked as Ready Stock.'
                    : 'Quotation line items ordered directly from manufacturing factories. Track production, factory dispatch, transit LR, and godown receiving until marked as Ready Stock.'}
                </p>
              </div>
            </div>

            {/* Quick Metrics Strip */}
            <div className="flex items-center gap-2 self-start md:self-auto shrink-0">
              <div className="px-3.5 py-2 rounded-xl bg-white border border-slate-200 shadow-xs text-center min-w-[100px]">
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  Pending Items
                </div>
                <div
                  className={`text-xl font-black ${
                    isLocal ? 'text-amber-600' : 'text-indigo-600'
                  }`}
                >
                  {activeCount}
                </div>
              </div>
              <div className="px-3.5 py-2 rounded-xl bg-white border border-slate-200 shadow-xs text-center min-w-[100px]">
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  In Godown
                </div>
                <div className="text-xl font-black text-emerald-600">
                  {fulfilledCount}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Sub-Tabs: Active Pending Queue vs Fulfilled/In Godown */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center gap-2 overflow-x-auto">
            <button
              type="button"
              onClick={() => setProcurementSubTab('active')}
              className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                procurementSubTab === 'active'
                  ? isLocal
                    ? 'bg-amber-500 text-white shadow-xs'
                    : 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Clock size={14} />
              <span>Active Pending Queue</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                  procurementSubTab === 'active'
                    ? 'bg-white/20 text-white'
                    : 'bg-slate-200 text-slate-700'
                }`}
              >
                {activeCount}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setProcurementSubTab('fulfilled')}
              className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                procurementSubTab === 'fulfilled'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <CheckCircle2 size={14} />
              <span>Fulfilled & Reached Godown</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                  procurementSubTab === 'fulfilled'
                    ? 'bg-white/20 text-white'
                    : 'bg-slate-200 text-slate-700'
                }`}
              >
                {fulfilledCount}
              </span>
            </button>
          </div>

          {/* Search & Stage Filter Toolbar */}
          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            <div className="relative flex-1 sm:w-64">
              <Search
                size={13}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="text"
                value={procurementSearch}
                onChange={(e) => setProcurementSearch(e.target.value)}
                placeholder="Search quote #, customer, item..."
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50"
              />
              {procurementSearch && (
                <button
                  type="button"
                  onClick={() => setProcurementSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X size={12} />
                </button>
              )}
            </div>

            <select
              value={procurementStageFilter}
              onChange={(e) => setProcurementStageFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 bg-white font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
            >
              <option value="all">All Procurement Stages</option>
              <option value="Availability Confirmed">Availability Confirmed</option>
              <option value="Payment Done">Payment Done</option>
              <option value="Dispatched">Order Dispatched</option>
              <option value="On the Way">On the Way</option>
              <option value="Reached to Godown">Reached to Godown</option>
            </select>

            <button
              type="button"
              onClick={loadProcurementItems}
              disabled={procurementLoading}
              className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 cursor-pointer shrink-0"
              title="Refresh queue"
            >
              <RefreshCw
                size={14}
                className={procurementLoading ? 'animate-spin text-indigo-600' : ''}
              />
            </button>
          </div>
        </div>

        {/* Queue Items Listing */}
        {procurementLoading ? (
          <div className="card p-12 bg-white rounded-2xl border border-slate-200 text-center space-y-3">
            <RefreshCw size={24} className="animate-spin text-indigo-600 mx-auto" />
            <p className="text-xs font-semibold text-slate-600">
              Loading {categoryLabel} line items...
            </p>
          </div>
        ) : procurementItems.length === 0 ? (
          <div className="card p-12 bg-white rounded-2xl border border-dashed border-slate-300 text-center space-y-3">
            <div
              className={`w-14 h-14 rounded-2xl mx-auto flex items-center justify-center ${
                procurementSubTab === 'active'
                  ? isLocal
                    ? 'bg-amber-100 text-amber-600'
                    : 'bg-indigo-100 text-indigo-600'
                  : 'bg-emerald-100 text-emerald-600'
              }`}
            >
              {procurementSubTab === 'active' ? (
                <CheckCircle2 size={28} />
              ) : (
                <Package size={28} />
              )}
            </div>
            <h3 className="text-sm font-bold text-slate-800">
              {procurementSubTab === 'active'
                ? `No pending ${categoryLabel.toLowerCase()} items`
                : `No fulfilled ${categoryLabel.toLowerCase()} items yet`}
            </h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              {procurementSubTab === 'active'
                ? `When quotation line items are set to "${
                    isLocal ? 'Need to Arrange from Local' : 'Factory Order'
                  }" in dispatch, they will automatically appear here until marked as Ready Stock.`
                : 'Items that have reached the godown and were marked Ready Stock will be cataloged here.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3.5">
            {procurementItems.map((item) => {
              const diff = getDaysDiff(item.expected_dispatch_date);
              const isFulfilled = item.dispatch_status === 'Ready Stock';

              return (
                <div
                  key={item.id}
                  className={`card p-4 sm:p-5 bg-white rounded-2xl border transition-all space-y-3.5 shadow-xs hover:shadow-md ${
                    isFulfilled
                      ? 'border-emerald-300 border-l-4 border-l-emerald-500'
                      : isLocal
                      ? 'border-amber-200 border-l-4 border-l-amber-500'
                      : 'border-indigo-200 border-l-4 border-l-indigo-600'
                  }`}
                >
                  {/* Item Card Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2.5 border-b border-slate-100">
                    <div className="flex items-center flex-wrap gap-2 text-xs">
                      {/* Quotation Ref Pill */}
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedQuotationId(item.quotation_id);
                          loadQuotationDetail(item.quotation_id);
                          setCurrentView('all');
                        }}
                        className="font-mono font-black text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-lg border border-indigo-200 cursor-pointer flex items-center space-x-1"
                        title="View full quotation order"
                      >
                        <span>{item.quotation_number}</span>
                        <ExternalLink size={11} />
                      </button>

                      {/* Type Badge */}
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          item.quotation_type === 'sanitary'
                            ? 'bg-teal-100 text-teal-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}
                      >
                        {item.quotation_type || 'Tile'}
                      </span>

                      {/* Customer Name */}
                      <span className="font-extrabold text-slate-900">
                        {item.customer_name}
                      </span>

                      {/* Customer Phone */}
                      {item.customer_phone && (
                        <a
                          href={`tel:${item.customer_phone}`}
                          className="flex items-center space-x-1 text-slate-600 hover:text-indigo-600 text-[11px] font-medium"
                          title="Call Customer"
                        >
                          <Phone size={11} className="text-slate-400" />
                          <span>{item.customer_phone}</span>
                        </a>
                      )}

                      {/* Site Location */}
                      {item.site_location && (
                        <span className="flex items-center space-x-1 text-slate-500 text-[11px]">
                          <MapPin size={11} className="text-slate-400" />
                          <span className="truncate max-w-[160px]">
                            {item.site_location}
                          </span>
                        </span>
                      )}

                      {/* Salesperson */}
                      {item.sales_person_name && (
                        <span className="flex items-center space-x-1 text-slate-400 text-[10px]">
                          <User size={10} />
                          <span>Sales: {item.sales_person_name}</span>
                        </span>
                      )}
                    </div>

                    {/* Right: Quick Action to open Order */}
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedQuotationId(item.quotation_id);
                        loadQuotationDetail(item.quotation_id);
                        setCurrentView('all');
                      }}
                      className="text-xs font-semibold text-slate-500 hover:text-indigo-600 cursor-pointer flex items-center space-x-1 self-start sm:self-auto shrink-0"
                    >
                      <Eye size={12} />
                      <span>Full Order</span>
                    </button>
                  </div>

                  {/* Item Description, Specifications, and Ordered Qty */}
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-50/70 p-3 rounded-xl border border-slate-100">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center space-x-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-slate-200 text-slate-700 uppercase tracking-wide">
                          {item.area_name || 'Item Area'}
                        </span>
                        {item.brand && (
                          <span className="text-[11px] font-bold text-slate-700">
                            Brand: {item.brand}
                          </span>
                        )}
                        {item.size && (
                          <span className="text-[11px] font-mono text-slate-500 font-medium">
                            • Size: {item.size}
                          </span>
                        )}
                      </div>
                      <h4 className="text-sm sm:text-base font-black text-slate-900 leading-snug">
                        {item.description}
                      </h4>
                    </div>

                    <div className="flex items-center gap-3 shrink-0 self-end md:self-auto">
                      <div className="text-right">
                        <div className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">
                          Order Qty
                        </div>
                        <div className="text-sm sm:text-base font-black text-slate-900">
                          {parseFloat(item.quantity as any || 0).toFixed(2)}{' '}
                          <span className="text-xs font-bold text-slate-600 uppercase">
                            {item.product_type || 'units'}
                          </span>
                        </div>
                      </div>

                      {/* Stock Category Badge */}
                      <span
                        className={`px-3 py-1 rounded-xl text-xs font-extrabold uppercase ${
                          isFulfilled
                            ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                            : isLocal
                            ? 'bg-amber-100 text-amber-900 border border-amber-300'
                            : 'bg-indigo-100 text-indigo-900 border border-indigo-300'
                        }`}
                      >
                        {isFulfilled
                          ? '✓ Ready Stock'
                          : isLocal
                          ? 'Local Purchase'
                          : 'Factory Order'}
                      </span>
                    </div>
                  </div>

                  {/* Arrival Date and Mark Ready Stock Top Strip */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                    <div className="flex items-center space-x-2 flex-wrap">
                      <span className="text-xs font-bold text-slate-600 flex items-center space-x-1.5">
                        <Calendar size={13} className="text-slate-400" />
                        <span>Expected Arrival:</span>
                      </span>
                      <input
                        type="date"
                        value={
                          item.expected_dispatch_date
                            ? String(item.expected_dispatch_date).slice(0, 10)
                            : ''
                        }
                        onChange={(e) => handleItemDateChange(item.id, e.target.value)}
                        disabled={isViewOnly}
                        className="px-2.5 py-1 text-xs border border-slate-300 rounded-lg font-medium text-slate-800 bg-white shadow-xs focus:ring-2 focus:ring-indigo-500"
                      />
                      {diff !== null && (
                        <>
                          {diff < 0 && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-rose-100 text-rose-800 border border-rose-300">
                              🚨 Overdue by {Math.abs(diff)}d
                            </span>
                          )}
                          {diff === 0 && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-amber-100 text-amber-800 border border-amber-300">
                              ⚠️ Due Today
                            </span>
                          )}
                          {diff === 1 && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-blue-100 text-blue-800 border border-blue-300">
                              Tomorrow
                            </span>
                          )}
                          {diff > 1 && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700">
                              In {diff} days
                            </span>
                          )}
                        </>
                      )}
                    </div>

                    {/* The Prominent Mark Ready Stock Button */}
                    {!isFulfilled ? (
                      !isViewOnly && (
                        <button
                          type="button"
                          onClick={() => handleMarkReadyStock(item)}
                          disabled={markingReadyStockId === item.id}
                          className="flex items-center space-x-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-extrabold text-xs rounded-xl shadow-md shadow-emerald-600/25 transition-all cursor-pointer hover:scale-[1.02]"
                          title="Item arrived in godown! Set status to Ready Stock"
                        >
                          <CheckCircle2 size={15} />
                          <span>
                            {markingReadyStockId === item.id
                              ? 'Updating...'
                              : '✓ Mark Ready Stock'}
                          </span>
                        </button>
                      )
                    ) : (
                      <div className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold">
                        <CheckCircle2 size={14} className="text-emerald-600" />
                        <span>Ready Stock in Godown</span>
                        {item.procurement_updated_by_name && (
                          <span className="text-[10px] text-emerald-600 font-normal">
                            • Verified by {item.procurement_updated_by_name}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* 5-Step Interactive Procurement Stepper */}
                  <div className="pt-1">
                    <ProcurementStepper
                      status={item.dispatch_status}
                      procurementStatus={item.procurement_status}
                      procurementNotes={item.procurement_notes}
                      onChangeStatus={(st) => handleItemStageChange(item.id, st)}
                      onChangeNotes={(notes) => handleItemNotesChange(item.id, notes)}
                      onMarkReadyStock={() => handleMarkReadyStock(item)}
                      isViewOnly={isViewOnly}
                      itemName={item.description}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const totalOrdersCount = stats?.total_orders ?? stats?.total_closed_quotations ?? quotations.length;

  return (
    <div className="flex-1 p-4 sm:p-5 lg:p-6 space-y-4 overflow-y-auto w-full min-w-0">
      {/* Formal Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
        <div className="flex items-center space-x-3 min-w-0">
          {company?.logo_base64 ? (
            <div className="h-11 px-2.5 py-1 rounded-xl bg-white border border-slate-200 shadow-xs flex items-center justify-center shrink-0">
              <img
                src={company.logo_base64}
                alt={company.company_name || 'Logo'}
                className="h-8 max-w-[140px] w-auto object-contain"
              />
            </div>
          ) : (
            <div className="w-10 h-10 rounded-xl bg-teal-600 text-white flex items-center justify-center shadow-md shadow-teal-500/20 shrink-0">
              <Truck size={22} className="text-white" />
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center space-x-2">
              <h1 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight truncate">
                Dispatch Management
              </h1>
              <span className={`px-2 py-0.5 text-[10px] font-extrabold uppercase rounded shrink-0 ${
                isViewOnly
                  ? 'bg-amber-100 text-amber-900 border border-amber-300'
                  : 'bg-teal-100 text-teal-900 border border-teal-300'
              }`}>
                {isViewOnly ? 'View Only' : 'Fulfillment'}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5 truncate">
              Order Fulfillment & Delivery Tracking • Closed Quotations Pipeline
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2 self-start sm:self-auto shrink-0">
          <button
            onClick={loadData}
            disabled={loading}
            className="btn btn-secondary btn-sm text-xs flex items-center space-x-1.5 cursor-pointer text-slate-700"
            title="Refresh dispatch pipeline"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin text-indigo-600' : 'text-slate-500'} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Sub-Navigation: Local Purchase vs Factory Orders vs All Orders */}
      <div className="flex items-center gap-2 bg-slate-100 p-1.5 rounded-2xl border border-slate-200 shadow-inner overflow-x-auto">
        <button
          type="button"
          onClick={() => setCurrentView('local-purchase')}
          className={`flex items-center space-x-2.5 px-4 py-2.5 rounded-xl font-bold text-xs transition-all cursor-pointer whitespace-nowrap ${
            currentView === 'local-purchase'
              ? 'bg-amber-500 text-white shadow-md shadow-amber-500/25 ring-2 ring-amber-400/50'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
          }`}
        >
          <Package size={16} />
          <span>Local Purchase</span>
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
              currentView === 'local-purchase' ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-800'
            }`}
          >
            {procurementSummary.local_active_count}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setCurrentView('factory-orders')}
          className={`flex items-center space-x-2.5 px-4 py-2.5 rounded-xl font-bold text-xs transition-all cursor-pointer whitespace-nowrap ${
            currentView === 'factory-orders'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/25 ring-2 ring-indigo-400/50'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
          }`}
        >
          <Factory size={16} />
          <span>Factory Orders</span>
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
              currentView === 'factory-orders' ? 'bg-white/20 text-white' : 'bg-indigo-100 text-indigo-800'
            }`}
          >
            {procurementSummary.factory_active_count}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setCurrentView('all')}
          className={`flex items-center space-x-2.5 px-4 py-2.5 rounded-xl font-bold text-xs transition-all cursor-pointer whitespace-nowrap ${
            currentView === 'all'
              ? 'bg-slate-900 text-white shadow-md shadow-slate-900/25'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
          }`}
        >
          <Truck size={16} />
          <span>All Dispatch Orders</span>
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
              currentView === 'all' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
            }`}
          >
            {totalOrdersCount}
          </span>
        </button>
      </div>

      {currentView === 'all' ? (
        <>
      {/* Formal KPI Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2.5">
        {/* Closed Orders */}
        <div className="card p-3 bg-white border border-slate-200 shadow-xs border-l-4 border-l-slate-700 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Orders Pipeline
            </span>
            <Truck size={14} className="text-slate-400" />
          </div>
          <div className="mt-2">
            <div className="text-2xl font-black text-slate-900 leading-tight">
              {stats?.closed_count || totalOrdersCount}
            </div>
            <div className="text-[10px] text-slate-500 font-medium mt-0.5 truncate">
              {stats?.closed_count || totalOrdersCount} Closed Orders
            </div>
          </div>
        </div>

        {/* Yet to Update */}
        <div className="card p-3 bg-white border border-slate-200 shadow-xs border-l-4 border-l-slate-400 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
              Yet to Update
            </span>
            <Clock size={14} className="text-slate-400" />
          </div>
          <div className="mt-2">
            <div className="text-2xl font-black text-slate-800 leading-tight">
              {stats?.yet_to_update_count || 0}
            </div>
            <div className="text-[10px] text-slate-500 font-medium mt-0.5 truncate">
              Awaiting stage check
            </div>
          </div>
        </div>

        {/* Ready Stock */}
        <div className="card p-3 bg-white border border-slate-200 shadow-xs border-l-4 border-l-emerald-600 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider">
              Ready Stock
            </span>
            <CheckCircle2 size={14} className="text-emerald-500" />
          </div>
          <div className="mt-2">
            <div className="text-2xl font-black text-emerald-800 leading-tight">
              {stats?.ready_stock_count || 0}
            </div>
            <div className="text-[10px] text-emerald-600 font-medium mt-0.5 truncate">
              Available in godown
            </div>
          </div>
        </div>

        {/* Arrange Local */}
        <div className="card p-3 bg-white border border-slate-200 shadow-xs border-l-4 border-l-amber-500 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-amber-800 uppercase tracking-wider">
              Arrange Local
            </span>
            <Package size={14} className="text-amber-500" />
          </div>
          <div className="mt-2">
            <div className="text-2xl font-black text-amber-800 leading-tight">
              {stats?.local_arrange_count || 0}
            </div>
            <div className="text-[10px] text-amber-700 font-medium mt-0.5 truncate">
              Local market sourcing
            </div>
          </div>
        </div>

        {/* Factory Order */}
        <div className="card p-3 bg-white border border-slate-200 shadow-xs border-l-4 border-l-indigo-600 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-indigo-800 uppercase tracking-wider">
              Factory Order
            </span>
            <Factory size={14} className="text-indigo-500" />
          </div>
          <div className="mt-2">
            <div className="text-2xl font-black text-indigo-800 leading-tight">
              {stats?.factory_order_count || 0}
            </div>
            <div className="text-[10px] text-indigo-600 font-medium mt-0.5 truncate">
              Production / transit
            </div>
          </div>
        </div>

        {/* Dispatched */}
        <div className="card p-3 bg-white border border-slate-200 shadow-xs border-l-4 border-l-teal-600 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-teal-800 uppercase tracking-wider">
              Dispatched
            </span>
            <Truck size={14} className="text-teal-600" />
          </div>
          <div className="mt-2">
            <div className="text-2xl font-black text-teal-900 leading-tight">
              {stats?.dispatched_count || 0}
            </div>
            <div className="text-[10px] text-teal-700 font-medium mt-0.5 truncate">
              Completed deliveries
            </div>
          </div>
        </div>

        {/* Overdue */}
        <div className="card p-3 bg-white border border-slate-200 shadow-xs border-l-4 border-l-rose-500 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-rose-800 uppercase tracking-wider">
              Overdue
            </span>
            <AlertTriangle size={14} className="text-rose-500" />
          </div>
          <div className="mt-2">
            <div className="text-2xl font-black text-rose-800 leading-tight">
              {stats?.overdue_count || 0}
            </div>
            <div className="text-[10px] text-rose-600 font-medium mt-0.5 truncate">
              Past expected date
            </div>
          </div>
        </div>
      </div>

      {/* Formal Filter and Search Bar */}
      <div className="card p-3 bg-white border border-slate-200 shadow-xs">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-2.5">
          {/* Search Box */}
          <div className="relative flex-1 min-w-[220px]">
            <Search size={14} className="absolute left-3 top-2.5 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search quotation #, customer, phone, site, project..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input input-sm pl-8 pr-8 w-full text-xs"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                title="Clear search"
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* Formally aligned filter dropdowns */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Dispatch Stage Filter */}
            <div className="w-full sm:w-48">
              <select
                value={dispatchStatusFilter}
                onChange={(e) => setDispatchStatusFilter(e.target.value)}
                className={`select select-sm w-full text-xs font-semibold cursor-pointer ${
                  dispatchStatusFilter !== 'all'
                    ? 'border-indigo-500 bg-indigo-50/50 text-indigo-950 font-bold'
                    : 'text-slate-700'
                }`}
              >
                <option value="all">All Dispatch Stages</option>
                <option value="Yet to Update">Yet to Update</option>
                <option value="Ready Stock">Ready Stock</option>
                <option value="Need to Arrange from Local">Need to Arrange Local</option>
                <option value="Factory Order">Factory Order</option>
                <option value="Dispatched">Dispatched</option>
              </select>
            </div>

            {/* Date Filter */}
            <div className="w-full sm:w-40">
              <select
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value as any)}
                className={`select select-sm w-full text-xs font-semibold cursor-pointer ${
                  dateFilter !== 'all'
                    ? 'border-indigo-500 bg-indigo-50/50 text-indigo-950 font-bold'
                    : 'text-slate-700'
                }`}
              >
                <option value="all">All Dates</option>
                <option value="today">Due Today</option>
                <option value="tomorrow">Due Tomorrow</option>
                <option value="this_week">Due This Week</option>
                <option value="overdue">Overdue</option>
              </select>
            </div>

            {/* Procurement / Purchase Stage Filter */}
            <div className="w-full sm:w-52">
              <select
                value={procurementFilter}
                onChange={(e) => setProcurementFilter(e.target.value)}
                className={`select select-sm w-full text-xs font-semibold cursor-pointer ${
                  procurementFilter !== 'all'
                    ? 'border-amber-500 bg-amber-50/50 text-amber-950 font-bold'
                    : 'text-slate-700'
                }`}
              >
                <option value="all">All Purchase Stages</option>
                {VALID_PROCUREMENT_STATUSES.map((ps) => (
                  <option key={ps} value={ps}>
                    {ps}
                  </option>
                ))}
              </select>
            </div>

            {/* Reset Filters button */}
            {hasActiveFilters && (
              <button
                onClick={handleClearFilters}
                className="btn btn-secondary btn-sm text-xs px-2.5 text-rose-600 hover:bg-rose-50 border-rose-200 cursor-pointer"
                title="Reset all filters"
              >
                <X size={12} className="mr-1" />
                <span>Reset</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* REAL-TIME TOAST ALERT FOR DISPATCH ITEM CHANGES */}
      {canSeeModifiedItemsAlert && itemChangedAlert && (
        <div className="dispatch-notice-banner-dark animate-fade-in" style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', flex: 1, minWidth: 0 }}>
              <div
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px',
                  background: 'rgba(239, 68, 68, 0.2)',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                  color: '#F87171',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  marginTop: '2px',
                }}
              >
                <AlertTriangle size={18} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 800, color: '#FFFFFF', letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                    Quotation Items Modified in Live Session
                  </span>
                  <span
                    style={{
                      background: 'rgba(255, 255, 255, 0.15)',
                      color: '#FFFFFF',
                      fontWeight: 800,
                      fontSize: '10px',
                      padding: '2px 8px',
                      borderRadius: '6px',
                      fontFamily: 'monospace',
                    }}
                  >
                    {itemChangedAlert.quotation_number}
                  </span>
                  {itemChangedAlert.changed_by && (
                    <span style={{ fontSize: '11px', color: '#94A3B8' }}>
                      by {itemChangedAlert.changed_by}
                    </span>
                  )}
                </div>
                <p style={{ fontSize: '11px', color: '#CBD5E1', marginTop: '3px', lineHeight: '1.4' }}>
                  Item quantities or products were revised after material availability was configured. Click to inspect changes diff.
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
              <button
                type="button"
                onClick={() => {
                  const matched = quotations.find((q) => q.id === itemChangedAlert.quotation_id) || {
                    id: itemChangedAlert.quotation_id,
                    quotation_number: itemChangedAlert.quotation_number,
                    customer_name: itemChangedAlert.customer_name,
                    parsedSummary: {
                      changed_by: itemChangedAlert.changed_by,
                      changed_at: itemChangedAlert.changed_at,
                      diffs: itemChangedAlert.diffs,
                    },
                  };
                  handleOpenReviewModal(matched);
                  setItemChangedAlert(null);
                }}
                className="dispatch-action-btn-danger"
                style={{ padding: '6px 14px', fontSize: '11px' }}
              >
                <Eye size={12} />
                <span>See Changes Diff</span>
              </button>
              <button
                type="button"
                onClick={() => setItemChangedAlert(null)}
                style={{
                  color: '#94A3B8',
                  padding: '6px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  background: 'transparent',
                  border: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                }}
                title="Dismiss alert"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TODAY'S PLANNED DISPATCHES POPUP BANNER */}
      {stats?.todays_dispatches && stats.todays_dispatches.length > 0 && !isTodayBannerDismissed && (
        <div className="dispatch-notice-banner-emerald animate-fade-in" style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '14px', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', flex: 1, minWidth: 0 }}>
              <div
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px',
                  background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                  boxShadow: '0 4px 12px rgba(5, 150, 105, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#FFFFFF',
                  flexShrink: 0,
                  marginTop: '2px',
                }}
              >
                <Truck size={18} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 800, color: '#064E3B', letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                    Today's Planned Dispatches
                  </span>
                  <span
                    style={{
                      background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                      color: '#FFFFFF',
                      fontWeight: 800,
                      fontSize: '10px',
                      padding: '2px 8px',
                      borderRadius: '9999px',
                      boxShadow: '0 2px 5px rgba(5, 150, 105, 0.25)',
                    }}
                  >
                    {stats.todays_dispatches.length} Order{stats.todays_dispatches.length > 1 ? 's' : ''} Scheduled Today
                  </span>
                </div>
                <p style={{ fontSize: '11px', color: '#065F46', marginTop: '3px', lineHeight: '1.4' }}>
                  Stock readiness and delivery checklist scheduled for today ({new Date().toLocaleDateString('en-GB')}). Review status and mark dispatched.
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
              <button
                type="button"
                onClick={() => setDateFilter(dateFilter === 'today' ? 'all' : 'today')}
                className="dispatch-action-btn-emerald"
                style={{ padding: '6px 14px', fontSize: '11px' }}
              >
                <Filter size={12} />
                <span>{dateFilter === 'today' ? 'Showing Today Only' : 'Filter Table to Today'}</span>
              </button>
              <button
                type="button"
                onClick={() => setIsTodayBannerDismissed(true)}
                style={{
                  color: '#065F46',
                  padding: '6px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  background: 'transparent',
                  border: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                }}
                title="Dismiss today's banner"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Quick interactive order chips */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', paddingTop: '2px' }}>
            {stats.todays_dispatches.map((td: any) => (
              <button
                type="button"
                key={td.id}
                onClick={() => handleToggleRow(td)}
                className="dispatch-notice-chip dispatch-notice-chip-emerald"
              >
                <span
                  style={{
                    fontFamily: 'monospace',
                    fontWeight: 800,
                    fontSize: '12px',
                    color: '#0F172A',
                    background: '#F1F5F9',
                    padding: '3px 8px',
                    borderRadius: '6px',
                  }}
                >
                  {td.quotation_number}
                </span>
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#334155' }}>
                  {td.customer_name}
                </span>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    color: '#065F46',
                    background: '#D1FAE5',
                    padding: '3px 8px',
                    borderRadius: '6px',
                    border: '1px solid #A7F3D0',
                  }}
                >
                  {td.total_items} items &bull; {td.dispatch_status}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* TOMORROW'S PLANNED DISPATCHES POPUP BANNER */}
      {stats?.tomorrows_dispatches && stats.tomorrows_dispatches.length > 0 && !isTomorrowBannerDismissed && (
        <div
          className="animate-fade-in"
          style={{
            marginBottom: '1rem',
            backgroundColor: '#EEF2FF',
            border: '1px solid #C7D2FE',
            borderRadius: '12px',
            padding: '14px 18px',
            boxShadow: '0 2px 8px rgba(79, 70, 229, 0.08)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '14px', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', flex: 1, minWidth: 0 }}>
              <div
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px',
                  background: 'linear-gradient(135deg, #4F46E5 0%, #4338CA 100%)',
                  boxShadow: '0 4px 12px rgba(67, 56, 202, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#FFFFFF',
                  flexShrink: 0,
                  marginTop: '2px',
                }}
              >
                <Calendar size={18} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 800, color: '#312E81', letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                    Tomorrow's Planned Dispatches
                  </span>
                  <span
                    style={{
                      background: 'linear-gradient(135deg, #4F46E5 0%, #4338CA 100%)',
                      color: '#FFFFFF',
                      fontWeight: 800,
                      fontSize: '10px',
                      padding: '2px 8px',
                      borderRadius: '9999px',
                      boxShadow: '0 2px 4px rgba(79, 70, 229, 0.25)',
                    }}
                  >
                    {stats.tomorrows_dispatches.length} Order{stats.tomorrows_dispatches.length > 1 ? 's' : ''} Scheduled Tomorrow
                  </span>
                </div>
                <p style={{ fontSize: '11px', color: '#4338CA', marginTop: '3px', lineHeight: '1.4' }}>
                  Scheduled for tomorrow ({new Date(Date.now() + 86400000).toLocaleDateString('en-GB')}). Review readiness or inspect order details below.
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
              <button
                type="button"
                onClick={() => setDateFilter(dateFilter === 'tomorrow' ? 'all' : 'tomorrow')}
                className="btn btn-xs font-bold cursor-pointer"
                style={{
                  backgroundColor: dateFilter === 'tomorrow' ? '#312E81' : '#4338CA',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '5px 10px',
                  fontSize: '11px',
                }}
              >
                {dateFilter === 'tomorrow' ? 'Clear Filter' : 'Filter Tomorrow’s Orders →'}
              </button>
              <button
                type="button"
                onClick={() => setIsTomorrowBannerDismissed(true)}
                style={{
                  color: '#4338CA',
                  padding: '6px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  background: 'transparent',
                  border: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                }}
                title="Dismiss tomorrow's banner"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Quick interactive order chips */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', paddingTop: '2px' }}>
            {stats.tomorrows_dispatches.map((td: any) => (
              <button
                type="button"
                key={td.id}
                onClick={() => handleToggleRow(td)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '6px 12px',
                  borderRadius: '8px',
                  backgroundColor: '#FFFFFF',
                  border: '1px solid #C7D2FE',
                  cursor: 'pointer',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                }}
              >
                <span
                  style={{
                    fontFamily: 'monospace',
                    fontWeight: 800,
                    fontSize: '12px',
                    color: '#312E81',
                    background: '#EEF2FF',
                    padding: '3px 8px',
                    borderRadius: '6px',
                  }}
                >
                  {td.quotation_number}
                </span>
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#334155' }}>
                  {td.customer_name}
                </span>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    color: '#4338CA',
                    background: '#E0E7FF',
                    padding: '3px 8px',
                    borderRadius: '6px',
                    border: '1px solid #C7D2FE',
                  }}
                >
                  {td.total_items} items &bull; {td.dispatch_status}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* PERSISTENT NOTIFICATION BANNER: ORDER ITEMS MODIFIED AFTER DISPATCH UPDATE */}
      {canSeeModifiedItemsAlert && stats?.changed_quotations && stats.changed_quotations.length > 0 && (
        <div className="dispatch-notice-banner-amber animate-fade-in" style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', marginBottom: '12px' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
                boxShadow: '0 4px 12px rgba(217, 119, 6, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#FFFFFF',
                flexShrink: 0,
                marginTop: '2px',
              }}
            >
              <Bell size={18} className="animate-pulse" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: 800, color: '#78350F', letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                  Attention: Order Items Modified After Dispatch Update
                </span>
                <span
                  style={{
                    background: 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)',
                    color: '#FFFFFF',
                    fontWeight: 800,
                    fontSize: '10px',
                    padding: '2px 8px',
                    borderRadius: '9999px',
                    boxShadow: '0 2px 5px rgba(220, 38, 38, 0.25)',
                  }}
                >
                  {stats.changed_quotations.length} Order{stats.changed_quotations.length > 1 ? 's' : ''} Need Review
                </span>
              </div>
              <p style={{ fontSize: '11px', color: '#92400E', marginTop: '3px', lineHeight: '1.4' }}>
                The sales team updated item quantities or descriptions after material availability was set. Click an order to inspect and acknowledge changes.
              </p>
            </div>
          </div>

          {/* Quick interactive order chips with 'Click to See Changes' */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', paddingTop: '2px' }}>
            {stats.changed_quotations.map((cq) => (
              <button
                type="button"
                key={cq.id}
                onClick={() => handleOpenReviewModal(cq)}
                className="dispatch-notice-chip dispatch-notice-chip-amber"
              >
                <span
                  style={{
                    fontFamily: 'monospace',
                    fontWeight: 800,
                    fontSize: '12px',
                    color: '#0F172A',
                    background: '#F1F5F9',
                    padding: '3px 8px',
                    borderRadius: '6px',
                  }}
                >
                  {cq.quotation_number}
                </span>
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#334155' }}>
                  {cq.customer_name}
                </span>
                <span className="dispatch-action-btn-danger">
                  <Eye size={12} />
                  <span>Review Changes &rarr;</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Formal Quotations Table with Row Expansion */}
      <div className="card overflow-hidden bg-white border border-slate-200 shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-[#E0E1DD] bg-[#F8F9FA]/90 text-[#415A77] font-semibold text-[11px] uppercase tracking-wider">
                <th className="py-3 px-3.5 w-36 whitespace-nowrap font-mono text-left">Quotation Ref</th>
                <th className="py-3 px-3 w-24 whitespace-nowrap text-left">Date</th>
                <th className="py-3 px-3.5 min-w-[180px] text-left">Customer & Site</th>
                <th className="py-3 px-3.5 min-w-[160px] text-left">Sales & Approval</th>
                <th className="py-3 px-3 w-24 whitespace-nowrap text-center">Order Status</th>
                <th className="py-3 px-3 w-32 whitespace-nowrap text-center">Dispatch Stage</th>
                <th className="py-3 px-3 w-32 whitespace-nowrap text-center">Expected Date</th>
                <th className="py-3 px-3.5 w-36 whitespace-nowrap text-left">Fulfillment</th>
                <th className="py-3 px-3.5 w-32 whitespace-nowrap text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E0E1DD]/60">
              {loading && quotations.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    <RefreshCw className="animate-spin inline mr-2 text-slate-600" size={16} />
                    Loading quotations for dispatch...
                  </td>
                </tr>
              ) : quotations.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    <Truck size={36} className="mx-auto mb-2 text-slate-300" />
                    <p className="text-sm font-semibold text-slate-700">No Closed Quotations for Dispatch Found</p>
                    <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                      When a quotation is Closed, it will immediately appear here for dispatch tracking, stock readiness, and delivery scheduling.
                    </p>
                  </td>
                </tr>
              ) : (
                quotations.map((q) => {
                  const isSelected = selectedQuotationId === q.id;
                  const totalItems = q.total_items || 0;
                  const dispatchedCount = q.dispatched_items_count || 0;
                  const percentDispatched = totalItems > 0 ? Math.round((dispatchedCount / totalItems) * 100) : 0;
                  const isFullyDispatched = totalItems > 0 && dispatchedCount === totalItems;
                  const isApproved = q.status?.toLowerCase() === 'approved';
                  const isClosed = q.status?.toLowerCase() === 'closed';

                  return (
                    <React.Fragment key={q.id}>
                      {/* Main Table Row */}
                      <tr
                        onClick={() => handleToggleRow(q)}
                        className={`transition-colors cursor-pointer border-b border-[#E0E1DD]/40 ${
                          q.has_dispatch_item_changes
                            ? 'bg-amber-50/70 hover:bg-amber-100/70 border-l-4 border-l-amber-500 font-medium'
                            : isSelected
                            ? 'bg-indigo-50/60 font-medium'
                            : 'hover:bg-slate-50/80 bg-white'
                        }`}
                      >
                        {/* 1. Quotation Ref */}
                        <td className="py-3 px-3.5 font-mono font-bold text-[#0D1B2A] whitespace-nowrap align-middle">
                          <div className="flex items-center space-x-1.5">
                            <span>{q.quotation_number}</span>
                            {q.quotation_type === 'sanitary' ? (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-teal-100 text-teal-800 border border-teal-300 font-sans tracking-wide">
                                🚿 Sanitary
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-300 font-sans tracking-wide">
                                🧱 Tile
                              </span>
                            )}
                          </div>
                          {q.has_dispatch_item_changes && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenReviewModal(q);
                              }}
                              className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-black bg-amber-200 text-amber-950 border border-amber-400 hover:bg-amber-300 shadow-2xs transition-all cursor-pointer mt-1"
                              title="Items modified after dispatch update. Click to review changes."
                            >
                              <AlertTriangle size={11} className="text-amber-800 animate-pulse" />
                              <span>Items Changed (Review)</span>
                            </button>
                          )}
                        </td>

                        {/* 2. Date */}
                        <td className="py-3 px-3 text-slate-600 whitespace-nowrap align-middle text-[11px]">
                          {new Date(q.quotation_date).toLocaleDateString('en-GB')}
                        </td>

                        {/* 3. Customer & Site */}
                        <td className="py-3 px-3.5 align-middle">
                          <div className="font-bold text-slate-900 text-xs">{q.customer_name}</div>
                          <div className="flex items-center space-x-2 text-[11px] text-slate-500 mt-0.5">
                            {q.customer_phone && (
                              <a
                                href={`tel:${q.customer_phone}`}
                                onClick={(e) => e.stopPropagation()}
                                className="text-indigo-600 hover:text-indigo-800 font-medium inline-flex items-center"
                              >
                                <Phone size={10} className="mr-0.5" />
                                <span>{q.customer_phone}</span>
                              </a>
                            )}
                            {q.site_location && (
                              <span className="text-slate-500 inline-flex items-center truncate max-w-[150px]">
                                <MapPin size={10} className="mr-0.5 text-slate-400 shrink-0" />
                                <span className="truncate">{q.site_location}</span>
                              </span>
                            )}
                          </div>
                        </td>

                        {/* 4. Sales Associate & Store Manager Approval */}
                        <td className="py-3 px-3.5 align-middle text-xs">
                          <div className="text-slate-800 font-medium">{q.sales_person_name}</div>
                          {q.approved_by_name ? (
                            <div className="text-[10px] text-emerald-700 font-bold inline-flex items-center space-x-1 mt-0.5">
                              <ShieldCheck size={11} className="text-emerald-600" />
                              <span>Approved by {q.approved_by_name}</span>
                            </div>
                          ) : (
                            <div className="text-[10px] text-slate-400 mt-0.5 italic">Pending Approval</div>
                          )}
                        </td>

                        {/* 5. Order Status */}
                        <td className="py-3 px-3 text-center align-middle whitespace-nowrap">
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              padding: '2.5px 10px',
                              borderRadius: '9999px',
                              fontSize: '10px',
                              fontWeight: 800,
                              backgroundColor: isApproved ? '#ECFDF5' : '#0D1B2A',
                              color: isApproved ? '#065F46' : '#FFFFFF',
                              border: isApproved ? '1px solid #6EE7B7' : '1px solid #1B263B',
                              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.12)',
                              letterSpacing: '0.02em',
                            }}
                          >
                            {isApproved ? 'Approved' : 'Closed'}
                          </span>
                        </td>

                        {/* 6. Dispatch Stage */}
                        <td className="py-3 px-3 text-center align-middle whitespace-nowrap">
                          {renderDispatchBadge(q.dispatch_status)}
                          {Boolean(q.total_procurement_items && q.total_procurement_items > 0) && (
                            <div className="mt-1 flex items-center justify-center">
                              <span className="text-[10px] font-bold text-amber-900 bg-amber-50 border border-amber-300 px-1.5 py-0.5 rounded-md inline-flex items-center space-x-1">
                                <Package size={10} className="text-amber-700" />
                                <span>
                                  {q.proc_reached_godown_count && q.proc_reached_godown_count > 0
                                    ? `${q.proc_reached_godown_count}/${q.total_procurement_items} In Godown`
                                    : q.proc_on_the_way_count && q.proc_on_the_way_count > 0
                                    ? `${q.proc_on_the_way_count} In Transit`
                                    : `${q.total_procurement_items} Sourcing`}
                                </span>
                              </span>
                            </div>
                          )}
                        </td>

                        {/* 7. Expected Date */}
                        <td className="py-3 px-3 text-center align-middle whitespace-nowrap">
                          {getDateStatusBadge(q.expected_dispatch_date, isFullyDispatched)}
                        </td>

                        {/* 8. Fulfillment Progress */}
                        <td className="py-3 px-3.5 align-middle">
                          <div className="flex items-center justify-between text-[10px] font-bold mb-1">
                            <span className="text-slate-600">{dispatchedCount}/{totalItems} items</span>
                            <span
                              style={{ color: percentDispatched === 100 ? '#059669' : percentDispatched > 0 ? '#2563eb' : '#64748b' }}
                              className="font-extrabold"
                            >
                              {percentDispatched}%
                            </span>
                          </div>
                          <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden border border-slate-300 shadow-inner">
                            <div
                              style={{
                                width: `${Math.min(100, Math.max(percentDispatched > 0 ? 6 : 0, percentDispatched))}%`,
                                backgroundColor: percentDispatched === 100 ? '#10b981' : percentDispatched > 0 ? '#2563eb' : '#cbd5e1',
                              }}
                              className="h-full rounded-full transition-all duration-300"
                            />
                          </div>
                        </td>

                        {/* 9. Actions */}
                        <td className="py-3 px-3.5 text-right align-middle whitespace-nowrap">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleRow(q);
                            }}
                            className={`btn btn-xs text-[11px] font-bold px-2.5 py-1 rounded-lg flex items-center space-x-1 ml-auto cursor-pointer ${
                              isSelected
                                ? 'bg-slate-900 text-white shadow-xs'
                                : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200'
                            }`}
                          >
                            <Truck size={12} />
                            <span>{isSelected ? 'Close' : 'Dispatch'}</span>
                            {isSelected ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                          </button>
                        </td>
                      </tr>

                      {/* EXPANDABLE ITEM-LEVEL DISPATCH DRAWER */}
                      {isSelected && (
                        <tr className="bg-slate-50/80 border-b-2 border-indigo-200">
                          <td colSpan={9} className="p-4 sm:p-5">
                            {detailLoading ? (
                              <div className="p-8 text-center text-slate-500 bg-white rounded-xl border border-slate-200">
                                <RefreshCw size={20} className="animate-spin mx-auto mb-2 text-indigo-500" />
                                <p className="text-xs">Loading order items for dispatch update...</p>
                              </div>
                            ) : (
                              <div className="space-y-4">
                                {/* Item Changes Detected Alert in Drawer */}
                                {q.has_dispatch_item_changes && (
                                  <div className="bg-amber-50 border-2 border-amber-400 rounded-xl p-3.5 text-xs text-amber-950 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs animate-fade-in">
                                    <div className="flex items-center space-x-2.5">
                                      <AlertTriangle size={18} className="text-amber-700 shrink-0" />
                                      <div>
                                        <div className="font-extrabold text-amber-950">
                                          Items were modified after material availability was set!
                                        </div>
                                        <div className="text-[11px] text-amber-900/90 mt-0.5">
                                          Sales updated item quantities or product details. Please inspect the line items and re-confirm readiness.
                                        </div>
                                      </div>
                                    </div>
                                    <div className="flex items-center space-x-2 shrink-0">
                                      <button
                                        type="button"
                                        onClick={() => handleOpenReviewModal(q)}
                                        className="btn btn-xs bg-amber-600 hover:bg-amber-700 text-white font-bold px-3 py-1.5 rounded-lg border-none cursor-pointer shadow-xs flex items-center space-x-1"
                                      >
                                        <Eye size={12} />
                                        <span>See Changes Diff</span>
                                      </button>
                                      {!isViewOnly && (
                                        <button
                                          type="button"
                                          onClick={() => handleAcknowledgeItemChanges(q.id)}
                                          disabled={acknowledgingChange}
                                          className="btn btn-xs btn-secondary text-[11px] px-2.5 py-1.5 text-slate-700 border-amber-300 hover:bg-amber-100 cursor-pointer"
                                        >
                                          {acknowledgingChange ? 'Clearing...' : 'Dismiss'}
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                )}

                                {/* View-Only Banner */}
                                {isViewOnly && (
                                  <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 text-xs text-amber-900 flex items-center space-x-2">
                                    <Eye size={16} className="text-amber-700 shrink-0" />
                                    <div>
                                      <span className="font-bold">View-Only Access: </span>
                                      <span>
                                        You are viewing dispatch tracking details in read-only mode. Only Dispatch Team and Admins can update fulfillment stages, dates, and vehicle notes.
                                      </span>
                                    </div>
                                  </div>
                                )}

                                {/* Validation & Success Alerts */}
                                {validationError && (
                                  <div className="bg-rose-50 border border-rose-300 rounded-xl p-3 text-xs text-rose-800 flex items-start space-x-2">
                                    <AlertTriangle size={16} className="text-rose-600 shrink-0 mt-0.5" />
                                    <div className="flex-1">
                                      <span className="font-bold">Cannot Save: </span>
                                      <span>{validationError}</span>
                                    </div>
                                    <button
                                      onClick={() => setValidationError(null)}
                                      className="text-rose-400 hover:text-rose-600 cursor-pointer"
                                    >
                                      <X size={14} />
                                    </button>
                                  </div>
                                )}

                                {saveSuccessMessage && (
                                  <div className="bg-emerald-50 border border-emerald-300 rounded-xl p-3 text-xs text-emerald-900 flex items-center space-x-2">
                                    <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                                    <span className="font-bold">{saveSuccessMessage}</span>
                                  </div>
                                )}

                                {/* Quotation Dispatch Settings Bar */}
                                <div className="card p-3.5 bg-white border border-slate-200 shadow-xs space-y-3">
                                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2">
                                    <div className="flex items-center space-x-2">
                                      <Truck size={15} className="text-indigo-600" />
                                      <h3 className="font-bold text-xs uppercase tracking-wider text-slate-800">
                                        Quotation Overall Dispatch Settings — {q.quotation_number}
                                      </h3>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => setIsPrintSlipOpen(true)}
                                      className="btn btn-secondary btn-xs text-[11px] flex items-center space-x-1 text-slate-700 hover:text-slate-900 self-start sm:self-auto cursor-pointer"
                                    >
                                      <Printer size={12} />
                                      <span>Print Dispatch Slip</span>
                                    </button>
                                  </div>

                                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    {/* Overall Status */}
                                    <div>
                                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                                        Overall Dispatch Status
                                      </label>
                                      <select
                                        value={overallStatus}
                                        disabled={isViewOnly}
                                        onChange={(e) => {
                                          const newStatus = e.target.value;
                                          setOverallStatus(newStatus);
                                          if (selectedQuotationId) {
                                            setQuotations((prev) =>
                                              prev.map((quot) => (quot.id === selectedQuotationId ? { ...quot, dispatch_status: newStatus as any } : quot))
                                            );
                                          }
                                        }}
                                        className={`select select-sm text-xs font-semibold w-full ${
                                          isViewOnly ? 'bg-slate-100 text-slate-600 cursor-not-allowed' : 'cursor-pointer'
                                        }`}
                                      >
                                        {DISPATCH_STATUS_OPTIONS.map((opt) => (
                                          <option key={opt} value={opt}>
                                            {opt}
                                          </option>
                                        ))}
                                      </select>
                                      {!isViewOnly && (
                                        <div className="flex items-center space-x-1 mt-1">
                                          <span className="text-[10px] text-slate-400">Quick set:</span>
                                          <button
                                            type="button"
                                            onClick={() => handleApplyStatusToAllItems(overallStatus as any)}
                                            className="text-[10px] text-indigo-600 hover:text-indigo-800 font-bold underline cursor-pointer"
                                          >
                                            Apply to all items
                                          </button>
                                        </div>
                                      )}
                                    </div>

                                    {/* Overall Expected Dispatch Date */}
                                    <div>
                                      <div className="flex items-center justify-between mb-1">
                                        <label className="text-[11px] font-bold text-slate-700 flex items-center space-x-1">
                                          <span>Expected Dispatch Date</span>
                                          {!isViewOnly && <span className="text-rose-500 font-bold">*</span>}
                                        </label>
                                        {!isViewOnly && overallDate && (
                                          <button
                                            type="button"
                                            onClick={handleApplyDateToAllItems}
                                            className="text-[10px] text-indigo-600 hover:text-indigo-800 font-bold underline cursor-pointer"
                                          >
                                            Apply to all items
                                          </button>
                                        )}
                                      </div>
                                      <input
                                        type="date"
                                        value={overallDate}
                                        disabled={isViewOnly}
                                        readOnly={isViewOnly}
                                        onChange={(e) => {
                                          setOverallDate(e.target.value);
                                          setValidationError(null);
                                        }}
                                        className={`input input-sm text-xs w-full font-mono ${
                                          isViewOnly ? 'bg-slate-100 text-slate-600 cursor-not-allowed' : ''
                                        } ${
                                          !overallDate && validationError
                                            ? 'border-rose-400 ring-2 ring-rose-200'
                                            : ''
                                        }`}
                                        required={!isViewOnly}
                                      />
                                      <p className="text-[10px] text-slate-400 mt-1">
                                        {isViewOnly
                                          ? 'Expected delivery date set by dispatch team.'
                                          : 'Required when saving dispatch status.'}
                                      </p>
                                    </div>

                                    {/* Dispatch Notes / Vehicle Info */}
                                    <div>
                                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                                        Dispatch Notes & Vehicle Details <span className="font-normal text-slate-400">(Optional)</span>
                                      </label>
                                      <input
                                        type="text"
                                        placeholder={
                                          isViewOnly
                                            ? 'No vehicle/dispatch notes provided'
                                            : 'Optional driver contact, vehicle number, dispatch remarks...'
                                        }
                                        value={overallNotes}
                                        disabled={isViewOnly}
                                        readOnly={isViewOnly}
                                        onChange={(e) => setOverallNotes(e.target.value)}
                                        className={`input input-sm text-xs w-full ${
                                          isViewOnly ? 'bg-slate-100 text-slate-600 cursor-not-allowed' : ''
                                        }`}
                                      />
                                    </div>
                                  </div>
                                </div>

                                {/* Items Breakdown Table */}
                                <div className="card overflow-hidden bg-white border border-slate-200 shadow-xs">
                                  <div className="px-3.5 py-2.5 bg-slate-100/90 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex items-center space-x-2">
                                      <span className="text-xs font-bold text-slate-800">
                                        Quotation Line Items ({activeItems.length})
                                      </span>
                                      <span className="text-[11px] text-slate-500 hidden sm:inline">
                                        Update stock status & expected dispatch date per item
                                      </span>
                                    </div>

                                    {/* View Mode Switcher: Default Quotation Order vs Group by Availability */}
                                    <div className="inline-flex rounded-lg bg-white p-0.5 border border-slate-300 shadow-2xs">
                                      <button
                                        type="button"
                                        onClick={() => setItemsViewMode('default')}
                                        className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-all flex items-center space-x-1.5 cursor-pointer ${
                                          itemsViewMode === 'default'
                                            ? 'bg-slate-900 text-white shadow-xs'
                                            : 'text-slate-600 hover:text-slate-900'
                                        }`}
                                        title="View items in original quotation order"
                                      >
                                        <Layers size={12} />
                                        <span>Default View</span>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setItemsViewMode('availability')}
                                        className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-all flex items-center space-x-1.5 cursor-pointer ${
                                          itemsViewMode === 'availability'
                                            ? 'bg-indigo-600 text-white shadow-xs'
                                            : 'text-slate-600 hover:text-slate-900'
                                        }`}
                                        title="Group items: Ready Stock first, Local Purchase next, Factory Order next"
                                      >
                                        <CheckCircle2 size={12} />
                                        <span>Group by Availability</span>
                                      </button>
                                    </div>
                                  </div>

                                  <div className="overflow-x-auto">
                                    <table className="w-full text-left text-xs border-collapse">
                                      <thead>
                                        <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-bold text-[10px] uppercase tracking-wider">
                                          <th className="py-2.5 px-3 w-10 text-center">#</th>
                                          <th className="py-2.5 px-3 min-w-[200px]">Item Description</th>
                                          <th className="py-2.5 px-3 w-28">Area / Section</th>
                                          <th className="py-2.5 px-3 w-24 text-right">Order Qty</th>
                                          <th className="py-2.5 px-3 w-32 text-right">Dispatched Qty</th>
                                          <th className="py-2.5 px-3 w-48">Status *</th>
                                          <th className="py-2.5 px-3 w-36">Expected Date *</th>
                                          <th className="py-2.5 px-3 min-w-[160px]">Location / Remarks (Optional)</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100">
                                        {(() => {
                                          const renderItemRow = (
                                            item: QuotationItem,
                                            itemOriginalIndex: number,
                                            displayNum: number
                                          ) => {
                                            const itemId = item.id || itemOriginalIndex;
                                            const totalItemQty =
                                              item.quantity_boxes > 0
                                                ? item.quantity_boxes
                                                : item.quantity_sqft > 0
                                                ? item.quantity_sqft
                                                : 1;
                                            const unitLabel =
                                              item.quantity_boxes > 0 ? 'boxes' : item.quantity_sqft > 0 ? 'sqft' : 'nos';

                                            const itemState = editedItems[itemId] || {
                                              status: item.dispatch_status || 'Ready Stock',
                                              date: item.expected_dispatch_date
                                                ? String(item.expected_dispatch_date).split('T')[0]
                                                : overallDate,
                                              notes: item.dispatch_notes || '',
                                              dispatched_quantity:
                                                item.dispatched_quantity !== undefined && item.dispatched_quantity !== null
                                                  ? item.dispatched_quantity
                                                  : (item.dispatch_status === 'Dispatched' ? totalItemQty : 0),
                                              procurement_status: item.procurement_status || '',
                                              procurement_notes: item.procurement_notes || '',
                                            };

                                            const isItemMissingDate = !itemState.date && !overallDate;

                                            return (
                                              <React.Fragment key={itemId}>
                                                <tr className="hover:bg-slate-50/80 transition-colors">
                                                  <td className="py-2.5 px-3 text-center text-slate-400 font-mono text-[11px]">
                                                    {displayNum}
                                                  </td>
                                                <td className="py-2.5 px-3">
                                                  <div className="flex items-start space-x-2.5">
                                                    {item.item_image ? (
                                                      <img
                                                        src={item.item_image}
                                                        alt={item.description}
                                                        className="w-9 h-9 object-cover rounded-md border border-slate-200 shrink-0 bg-slate-50"
                                                      />
                                                    ) : (
                                                      <div className="w-9 h-9 rounded-md bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0 text-slate-400">
                                                        <Package size={14} />
                                                      </div>
                                                    )}
                                                    <div>
                                                      <div className="font-bold text-slate-800 text-xs">
                                                        {item.description}
                                                      </div>
                                                      <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-x-2">
                                                        {item.item_code && (
                                                          <span className="font-mono font-semibold text-slate-700 bg-slate-100 px-1 rounded">
                                                            {item.item_code}
                                                          </span>
                                                        )}
                                                        {item.brand && <span>Brand: {item.brand}</span>}
                                                        {item.size && <span>Size: {item.size}</span>}
                                                      </div>
                                                    </div>
                                                  </div>
                                                </td>
                                                <td className="py-2.5 px-3 text-slate-600 font-medium text-xs">
                                                  {item.area_name || 'General Area'}
                                                </td>
                                                <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-800">
                                                  {item.quantity_boxes > 0
                                                    ? `${item.quantity_boxes} boxes`
                                                    : item.quantity_sqft > 0
                                                    ? `${item.quantity_sqft} sqft`
                                                    : '1 nos'}
                                                </td>
                                                <td className="py-2.5 px-3 text-right">
                                                  <div className="flex items-center space-x-1 justify-end">
                                                    <input
                                                      type="number"
                                                      step="any"
                                                      min="0"
                                                      disabled={isViewOnly}
                                                      readOnly={isViewOnly}
                                                      value={
                                                        itemState.dispatched_quantity !== undefined &&
                                                        itemState.dispatched_quantity !== null
                                                          ? itemState.dispatched_quantity
                                                          : ''
                                                      }
                                                      placeholder={itemState.status === 'Dispatched' ? String(totalItemQty) : '0'}
                                                      onChange={(e) => {
                                                        if (isViewOnly) return;
                                                        const val = e.target.value;
                                                        setEditedItems((prev) => ({
                                                          ...prev,
                                                          [itemId]: {
                                                            ...itemState,
                                                            dispatched_quantity:
                                                              val === '' ? '' : Math.max(0, parseFloat(val) || 0),
                                                          },
                                                        }));
                                                      }}
                                                      className={`input input-sm text-xs font-mono font-bold w-20 text-right ${
                                                        isViewOnly
                                                          ? 'bg-slate-100 text-slate-600 cursor-not-allowed'
                                                          : 'bg-white'
                                                      } ${
                                                        itemState.status === 'Dispatched'
                                                          ? 'border-teal-500 text-teal-950 bg-teal-50/40 ring-1 ring-teal-200'
                                                          : 'border-slate-300 text-slate-800'
                                                      }`}
                                                      title="Mention dispatched quantity for this specific item"
                                                    />
                                                    <span className="text-[10px] text-slate-500 font-semibold whitespace-nowrap">
                                                      {unitLabel}
                                                    </span>
                                                  </div>
                                                </td>
                                                <td className="py-2.5 px-3">
                                                  <select
                                                    value={itemState.status}
                                                    disabled={isViewOnly}
                                                    onChange={(e) => {
                                                      if (isViewOnly) return;
                                                      const newStatus = e.target.value as DispatchStatusType;
                                                      let autoDispQty = itemState.dispatched_quantity;
                                                      if (
                                                        newStatus === 'Dispatched' &&
                                                        (!autoDispQty || Number(autoDispQty) === 0)
                                                      ) {
                                                        autoDispQty = totalItemQty;
                                                      }
                                                      const nextEdited = {
                                                        ...editedItems,
                                                        [itemId]: {
                                                          ...itemState,
                                                          status: newStatus,
                                                          dispatched_quantity: autoDispQty,
                                                        },
                                                      };
                                                      setEditedItems(nextEdited);

                                                      // Automatically recalculate and update overall dispatch stage
                                                      const newOverall = computeOverallDispatchStatus(activeItems, nextEdited);
                                                      setOverallStatus(newOverall);
                                                      if (selectedQuotationId) {
                                                        setQuotations((prev) =>
                                                          prev.map((quot) => (quot.id === selectedQuotationId ? { ...quot, dispatch_status: newOverall as any } : quot))
                                                        );
                                                      }
                                                    }}
                                                    className={`select select-sm text-xs font-semibold w-full focus:outline-none focus:ring-1 focus:ring-teal-400 ${
                                                      isViewOnly ? 'opacity-85 cursor-not-allowed' : 'cursor-pointer'
                                                    } ${
                                                      itemState.status === 'Yet to Update'
                                                        ? 'text-slate-700 bg-slate-50 border-slate-300'
                                                        : itemState.status === 'Ready Stock'
                                                        ? 'text-emerald-700 bg-emerald-50/50 border-emerald-300'
                                                        : itemState.status === 'Need to Arrange from Local'
                                                        ? 'text-amber-800 bg-amber-50/50 border-amber-300'
                                                        : itemState.status === 'Factory Order'
                                                        ? 'text-indigo-800 bg-indigo-50/50 border-indigo-300'
                                                        : 'text-teal-900 bg-teal-50 border-teal-300'
                                                    }`}
                                                  >
                                                    {DISPATCH_STATUS_OPTIONS.map((opt) => (
                                                      <option key={opt} value={opt}>
                                                        {opt}
                                                      </option>
                                                    ))}
                                                  </select>
                                                </td>
                                                <td className="py-2.5 px-3">
                                                  <input
                                                    type="date"
                                                    value={itemState.date || overallDate}
                                                    disabled={isViewOnly}
                                                    readOnly={isViewOnly}
                                                    onChange={(e) => {
                                                      if (isViewOnly) return;
                                                      const newDate = e.target.value;
                                                      setEditedItems((prev) => ({
                                                        ...prev,
                                                        [itemId]: {
                                                          ...itemState,
                                                          date: newDate,
                                                        },
                                                      }));
                                                      setValidationError(null);
                                                    }}
                                                    className={`input input-sm text-xs font-mono w-full ${
                                                      isViewOnly ? 'bg-slate-100 text-slate-600 cursor-not-allowed' : ''
                                                    } ${
                                                      !isViewOnly && isItemMissingDate && validationError
                                                        ? 'border-rose-400 ring-2 ring-rose-200'
                                                        : ''
                                                    }`}
                                                    required={!isViewOnly}
                                                  />
                                                </td>
                                                <td className="py-2.5 px-3">
                                                  <input
                                                    type="text"
                                                    placeholder={isViewOnly ? 'None' : 'Optional rack, supplier, or notes...'}
                                                    value={itemState.notes}
                                                    disabled={isViewOnly}
                                                    readOnly={isViewOnly}
                                                    onChange={(e) => {
                                                      if (isViewOnly) return;
                                                      const newNotes = e.target.value;
                                                      setEditedItems((prev) => ({
                                                        ...prev,
                                                        [itemId]: {
                                                          ...itemState,
                                                          notes: newNotes,
                                                        },
                                                      }));
                                                    }}
                                                    className={`input input-sm text-xs w-full ${
                                                      isViewOnly ? 'bg-slate-100 text-slate-600 cursor-not-allowed' : ''
                                                    }`}
                                                  />
                                                </td>
                                              </tr>

                                              {/* Minimalist Horizontal Procurement Stepper for Local & Factory Orders */}
                                              {(itemState.status === 'Need to Arrange from Local' ||
                                                itemState.status === 'Factory Order' ||
                                                Boolean(itemState.procurement_status)) && (
                                                <tr className="bg-slate-50/70 border-b border-slate-200">
                                                  <td colSpan={8} className="p-3">
                                                    <ProcurementStepper
                                                      status={itemState.status}
                                                      procurementStatus={itemState.procurement_status}
                                                      procurementNotes={itemState.procurement_notes}
                                                      isViewOnly={isViewOnly}
                                                      itemName={item.description}
                                                      onChangeStatus={(newStage) => {
                                                        if (isViewOnly) return;
                                                        setEditedItems((prev) => ({
                                                          ...prev,
                                                          [itemId]: {
                                                            ...itemState,
                                                            procurement_status: newStage,
                                                          },
                                                        }));
                                                      }}
                                                      onChangeNotes={(notes) => {
                                                        if (isViewOnly) return;
                                                        setEditedItems((prev) => ({
                                                          ...prev,
                                                          [itemId]: {
                                                            ...itemState,
                                                            procurement_notes: notes,
                                                          },
                                                        }));
                                                      }}
                                                      onMarkReadyStock={() => {
                                                        const nextEdited = {
                                                          ...editedItems,
                                                          [itemId]: {
                                                            ...itemState,
                                                            status: 'Ready Stock' as DispatchStatusType,
                                                          },
                                                        };
                                                        setEditedItems(nextEdited);

                                                        // Recalculate and update overall dispatch status immediately
                                                        const newOverall = computeOverallDispatchStatus(activeItems, nextEdited);
                                                        setOverallStatus(newOverall);
                                                        if (selectedQuotationId) {
                                                          setQuotations((prev) =>
                                                            prev.map((quot) => (quot.id === selectedQuotationId ? { ...quot, dispatch_status: newOverall as any } : quot))
                                                          );
                                                        }
                                                      }}
                                                    />
                                                  </td>
                                                </tr>
                                              )}
                                            </React.Fragment>
                                          );
                                        };

                                        if (itemsViewMode === 'default') {
                                          return activeItems.map((item, idx) =>
                                            renderItemRow(item, idx, idx + 1)
                                          );
                                        }

                                        return availabilityGroups.map((group) => {
                                          if (group.items.length === 0) return null;
                                          return (
                                            <React.Fragment key={group.id}>
                                              <tr
                                                className={`border-y ${
                                                  group.color === 'emerald'
                                                    ? 'bg-emerald-50/90 border-emerald-200'
                                                    : group.color === 'amber'
                                                    ? 'bg-amber-50/90 border-amber-200'
                                                    : group.color === 'indigo'
                                                    ? 'bg-indigo-50/90 border-indigo-200'
                                                    : 'bg-slate-100 border-slate-200'
                                                }`}
                                              >
                                                <td colSpan={8} className="px-3.5 py-2">
                                                  <div className="flex items-center justify-between">
                                                    <div className="flex items-center space-x-2">
                                                      <span
                                                        className={`w-2.5 h-2.5 rounded-full ${
                                                          group.color === 'emerald'
                                                            ? 'bg-emerald-600'
                                                            : group.color === 'amber'
                                                            ? 'bg-amber-500'
                                                            : group.color === 'indigo'
                                                            ? 'bg-indigo-600'
                                                            : 'bg-slate-400'
                                                        }`}
                                                      />
                                                      <span
                                                        className={`text-xs font-black uppercase tracking-wider ${
                                                          group.color === 'emerald'
                                                            ? 'text-emerald-950'
                                                            : group.color === 'amber'
                                                            ? 'text-amber-950'
                                                            : group.color === 'indigo'
                                                            ? 'text-indigo-950'
                                                            : 'text-slate-800'
                                                        }`}
                                                      >
                                                        {group.label}
                                                      </span>
                                                      <span className="text-[11px] text-slate-500 hidden md:inline">
                                                        — {group.subtitle}
                                                      </span>
                                                    </div>
                                                    <span
                                                      className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                                                        group.color === 'emerald'
                                                          ? 'bg-emerald-100 text-emerald-900 border border-emerald-200'
                                                          : group.color === 'amber'
                                                          ? 'bg-amber-100 text-amber-900 border border-amber-200'
                                                          : group.color === 'indigo'
                                                          ? 'bg-indigo-100 text-indigo-900 border border-indigo-200'
                                                          : 'bg-slate-200 text-slate-700'
                                                      }`}
                                                    >
                                                      {group.items.length}{' '}
                                                      {group.items.length === 1 ? 'item' : 'items'}
                                                    </span>
                                                  </div>
                                                </td>
                                              </tr>
                                              {group.items.map((item, gIdx) =>
                                                renderItemRow(
                                                  item,
                                                  activeItems.indexOf(item),
                                                  gIdx + 1
                                                )
                                              )}
                                            </React.Fragment>
                                          );
                                        });
                                      })()}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>

                                {/* Bottom Actions Bar */}
                                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
                                  <div className="text-xs text-slate-500 flex items-center space-x-1">
                                    <span>Last updated by: </span>
                                    <strong className="text-slate-800">
                                      {activeQuotation?.dispatched_by_name || 'Dispatch Team'}
                                    </strong>
                                    {activeQuotation?.dispatched_at && (
                                      <span>
                                        {' '}
                                        on {new Date(activeQuotation.dispatched_at).toLocaleDateString('en-GB')}
                                      </span>
                                    )}
                                  </div>

                                  <div className="flex items-center space-x-2 w-full sm:w-auto justify-end">
                                    <button
                                      type="button"
                                      onClick={() => setSelectedQuotationId(null)}
                                      className="btn btn-secondary btn-sm text-xs px-3 py-1.5 text-slate-700 cursor-pointer"
                                    >
                                      {isViewOnly ? 'Close View' : 'Cancel'}
                                    </button>
                                    {!isViewOnly ? (
                                      <button
                                        type="button"
                                        onClick={handleSaveDispatch}
                                        disabled={saving}
                                        className="btn btn-primary btn-sm text-xs px-4 py-1.5 font-bold flex items-center space-x-1.5 shadow-sm cursor-pointer bg-emerald-600 hover:bg-emerald-700 text-white border-none"
                                      >
                                        <Save size={13} className={saving ? 'animate-spin' : ''} />
                                        <span>{saving ? 'Saving...' : 'Save Dispatch Details'}</span>
                                      </button>
                                    ) : (
                                      <div className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 font-bold text-xs">
                                        <Eye size={13} className="text-amber-700" />
                                        <span>View-Only Access</span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
        </>
      ) : (
        renderProcurementWorkspace()
      )}

      {/* PRINT DISPATCH SLIP MODAL */}
      {isPrintSlipOpen && activeQuotation && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
          <div className="card bg-white p-6 max-w-2xl w-full shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-slate-200 pb-3">
              <div className="flex items-center space-x-2">
                <Truck size={20} className="text-indigo-600" />
                <h3 className="font-extrabold text-base text-slate-900">
                  Dispatch & Delivery Slip — {activeQuotation.quotation_number}
                </h3>
              </div>
              <button
                onClick={() => setIsPrintSlipOpen(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Slip Printable Body */}
            <div className="border border-slate-200 rounded-lg p-4 space-y-4 bg-slate-50/50 text-xs text-slate-800 font-sans print:border-none print:p-0">
              <div className="flex justify-between items-start border-b border-slate-200 pb-3">
                <div>
                  <h2 className="text-sm font-extrabold text-slate-900">AMA CERAMICS PVT LTD</h2>
                  <p className="text-[11px] text-slate-500">Dispatch Order & Delivery Verification Slip</p>
                </div>
                <div className="text-right">
                  <div className="font-mono font-bold text-slate-900">{activeQuotation.quotation_number}</div>
                  <div className="text-slate-500">
                    Date: {new Date(activeQuotation.quotation_date).toLocaleDateString('en-GB')}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <strong className="block text-slate-500 text-[10px] uppercase font-bold">Customer Details:</strong>
                  <div className="font-bold text-slate-900">{activeQuotation.customer_name}</div>
                  <div>Phone: {activeQuotation.customer_phone}</div>
                  <div>Site: {activeQuotation.site_location || 'As per quotation'}</div>
                  <div className="text-slate-600 mt-0.5">{activeQuotation.delivery_address}</div>
                </div>
                <div>
                  <strong className="block text-slate-500 text-[10px] uppercase font-bold">Dispatch Info:</strong>
                  <div>Status: <span className="font-bold">{overallStatus}</span></div>
                  <div>
                    Expected Date:{' '}
                    <span className="font-bold font-mono">
                      {overallDate ? new Date(overallDate).toLocaleDateString('en-GB') : 'Not Set'}
                    </span>
                  </div>
                  <div>Sales Rep: {activeQuotation.sales_person_name}</div>
                  {overallNotes && <div className="text-slate-600 mt-1 italic">Notes: {overallNotes}</div>}
                </div>
              </div>

              {/* Items List */}
              <div className="border border-slate-200 rounded overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 text-[11px]">
                      <th className="py-2 px-2.5 text-center w-8">#</th>
                      <th className="py-2 px-2.5">Item Description</th>
                      <th className="py-2 px-2.5">Code / Brand</th>
                      <th className="py-2 px-2.5 text-right w-20">Qty</th>
                      <th className="py-2 px-2.5 w-32">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {activeItems.map((it, idx) => {
                      const st = it.id ? editedItems[it.id]?.status || it.dispatch_status : it.dispatch_status;
                      return (
                        <tr key={it.id || idx}>
                          <td className="py-2 px-2.5 text-center text-slate-400 font-mono text-[11px]">
                            {idx + 1}
                          </td>
                          <td className="py-2 px-2.5 font-medium">{it.description}</td>
                          <td className="py-2 px-2.5 text-slate-600 font-mono text-[11px]">
                            {it.item_code || it.brand || '-'}
                          </td>
                          <td className="py-2 px-2.5 text-right font-bold font-mono">
                            {it.quantity_boxes > 0
                              ? `${it.quantity_boxes} boxes`
                              : it.quantity_sqft > 0
                              ? `${it.quantity_sqft} sqft`
                              : '1 nos'}
                          </td>
                          <td className="py-2 px-2.5 font-semibold text-[11px]">{st || 'Yet to Update'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Signatures */}
              <div className="grid grid-cols-2 gap-6 pt-6 border-t border-slate-200 text-xs">
                <div>
                  <div className="h-10 border-b border-slate-300"></div>
                  <span className="text-[10px] text-slate-500 uppercase font-bold mt-1 block">
                    Warehouse / Dispatch Officer Signature
                  </span>
                </div>
                <div>
                  <div className="h-10 border-b border-slate-300"></div>
                  <span className="text-[10px] text-slate-500 uppercase font-bold mt-1 block">
                    Receiver / Driver Signature & Date
                  </span>
                </div>
              </div>
            </div>

            {/* Print Buttons */}
            <div className="flex justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setIsPrintSlipOpen(false)}
                className="btn btn-secondary btn-sm text-xs cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="btn btn-primary btn-sm text-xs font-bold flex items-center space-x-1.5 cursor-pointer"
              >
                <Printer size={14} />
                <span>Print Slip</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REVIEW ITEM CHANGES MODAL */}
      {reviewingChangeQuotation && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
          <div className="card bg-white p-5 sm:p-6 max-w-xl w-full shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-slate-200 pb-3">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-500 text-white flex items-center justify-center shadow-xs shrink-0">
                  <AlertTriangle size={18} />
                </div>
                <div>
                  <h3 className="font-black text-sm text-slate-900 flex items-center gap-2">
                    <span>Order Items Changed</span>
                    <span className="font-mono text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300">
                      {reviewingChangeQuotation.quotation_number}
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Customer: <strong className="text-slate-800">{reviewingChangeQuotation.customer_name}</strong>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setReviewingChangeQuotation(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer p-1"
              >
                <X size={18} />
              </button>
            </div>

            {/* Change Context Banner */}
            <div className="bg-amber-50/70 border border-amber-300 rounded-xl p-3 text-xs text-amber-950 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-bold">Modified by:</span>
                <span className="font-semibold text-slate-800">
                  {reviewingChangeQuotation.parsedSummary?.changed_by ||
                    reviewingChangeQuotation.sales_person_name ||
                    'Sales Team'}
                </span>
              </div>
              {reviewingChangeQuotation.parsedSummary?.changed_at && (
                <div className="flex items-center justify-between text-[11px] text-slate-600">
                  <span>Change Timestamp:</span>
                  <span>{new Date(reviewingChangeQuotation.parsedSummary.changed_at).toLocaleString('en-GB')}</span>
                </div>
              )}
              <p className="text-[11px] text-amber-900/90 pt-1">
                Notice: These items were revised after material availability or dispatch schedule was previously configured. Review the item diff below to ensure readiness.
              </p>
            </div>

            {/* Changes Diff List */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center justify-between">
                <span>Summary of Changes:</span>
                {reviewingChangeQuotation.parsedSummary?.diffs && (
                  <span className="text-[11px] font-normal text-slate-500">
                    {reviewingChangeQuotation.parsedSummary.diffs.length} change{reviewingChangeQuotation.parsedSummary.diffs.length > 1 ? 's' : ''} detected
                  </span>
                )}
              </h4>
              <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-60 overflow-y-auto bg-slate-50/50">
                {reviewingChangeQuotation.parsedSummary?.diffs &&
                reviewingChangeQuotation.parsedSummary.diffs.length > 0 ? (
                  reviewingChangeQuotation.parsedSummary.diffs.map((diff: string, dIdx: number) => {
                    const isAdded = diff.toLowerCase().includes('added');
                    const isRemoved = diff.toLowerCase().includes('removed');

                    return (
                      <div key={dIdx} className="p-3 text-xs flex items-start space-x-2.5">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-black shrink-0 ${
                            isAdded
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                              : isRemoved
                              ? 'bg-rose-100 text-rose-800 border border-rose-300'
                              : 'bg-amber-100 text-amber-900 border border-amber-300'
                          }`}
                        >
                          {isAdded ? '+ Added' : isRemoved ? '- Removed' : '~ Changed'}
                        </span>
                        <span className="text-slate-800 font-medium leading-relaxed">{diff}</span>
                      </div>
                    );
                  })
                ) : (
                  <div className="p-4 text-center text-xs text-slate-500">
                    Line items were revised. Please open the line items editor to verify quantities and products.
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  const qId = reviewingChangeQuotation.id;
                  setReviewingChangeQuotation(null);
                  setSelectedQuotationId(qId);
                  loadQuotationDetail(qId);
                }}
                className="btn btn-secondary btn-sm text-xs text-indigo-700 hover:text-indigo-900 font-bold w-full sm:w-auto cursor-pointer flex items-center space-x-1"
              >
                <span>Open Line Items Editor</span>
                <ArrowRight size={13} />
              </button>

              <div className="flex items-center space-x-2 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  onClick={() => setReviewingChangeQuotation(null)}
                  className="btn btn-secondary btn-sm text-xs text-slate-600 cursor-pointer"
                >
                  Close
                </button>
                {!isViewOnly && (
                  <button
                    type="button"
                    onClick={() => handleAcknowledgeItemChanges(reviewingChangeQuotation.id)}
                    disabled={acknowledgingChange}
                    className="btn btn-primary btn-sm text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white border-none shadow-xs cursor-pointer flex items-center space-x-1"
                  >
                    <Check size={13} className={acknowledgingChange ? 'animate-spin' : ''} />
                    <span>{acknowledgingChange ? 'Clearing...' : 'Acknowledge Changes & Clear'}</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center space-x-2.5 px-4 py-3 bg-emerald-800 text-white rounded-xl shadow-2xl border border-emerald-600 animate-slide-up">
          <CheckCircle2 size={18} className="text-emerald-300 shrink-0" />
          <span className="text-xs font-bold">{toastMessage}</span>
          <button
            onClick={() => setToastMessage(null)}
            className="ml-3 text-white/70 hover:text-white cursor-pointer"
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
};
