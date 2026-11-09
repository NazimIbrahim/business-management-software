import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useServer } from '../context/ServerContext';
import { Quotation, QuotationItem } from '../types';
import {
  Truck,
  AlertCircle,
  CreditCard,
  Search,
  Filter,
  Calendar,
  Clock,
  CheckCircle2,
  Package,
  PackageCheck,
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
  History,
  BarChart3,
} from 'lucide-react';
import { AllClosedView } from './dispatch/AllClosedView';
import { ProcessingDispatchView } from './dispatch/ProcessingDispatchView';
import { CompletedDispatchView } from './dispatch/CompletedDispatchView';
import { ScheduleView } from './dispatch/ScheduleView';
import { LocalTrackerView } from './dispatch/LocalTrackerView';
import { FactoryTrackerView } from './dispatch/FactoryTrackerView';
import { PaymentTrackingView } from './dispatch/PaymentTrackingView';
import { LocalHistoryView } from './dispatch/LocalHistoryView';
import { FactoryHistoryView } from './dispatch/FactoryHistoryView';
import { DispatchReportsView } from './dispatch/DispatchReportsView';
import { PdfPreviewModal } from '../components/PdfPreviewModal';

export const formatCurrency = (val: any) => {
  const n = parseFloat(String(val || 0));
  if (isNaN(n)) return '0.00';
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

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

export type DispatchViewType =
  | 'all-closed'
  | 'processing'
  | 'completed'
  | 'schedule'
  | 'local-tracker'
  | 'factory-tracker'
  | 'payment-tracking'
  | 'local-history'
  | 'factory-history'
  | 'reports'
  | 'all'
  | 'local-purchase'
  | 'factory-orders';

export interface DispatchManagementProps {
  initialView?: DispatchViewType;
}

export const normalizeDispatchView = (v?: string): string => {
  if (!v || v === 'all' || v === 'all-closed') return 'all-closed';
  if (v === 'local-purchase' || v === 'local-tracker' || v === 'dispatch-local') return 'local-tracker';
  if (v === 'factory-orders' || v === 'factory-tracker' || v === 'dispatch-factory') return 'factory-tracker';
  return v;
};

export const DispatchManagement: React.FC<DispatchManagementProps> = ({ initialView = 'all-closed' }) => {
  const { user } = useAuth();
  const { fetchApi, subscribeToEvents, company, serverUrl } = useServer();

  const userRole = (user?.role || '').toLowerCase();
  const canEditDispatch = ['admin', 'manager', 'dispatch', 'dispatch_team'].includes(userRole);
  const isViewOnly = !canEditDispatch;
  const canSeeModifiedItemsAlert = ['admin', 'manager', 'dispatch', 'dispatch_team', 'accounts', 'accountant'].includes(userRole);

  const [currentView, setCurrentView] = useState<string>(normalizeDispatchView(initialView));

  useEffect(() => {
    if (initialView) {
      setCurrentView(normalizeDispatchView(initialView));
    }
  }, [initialView]);

  // Overall Stats
  const [stats, setStats] = useState<any | null>(null);
  const [loadingStats, setLoadingStats] = useState<boolean>(false);

  // Sub-view Datasets
  const [allClosedList, setAllClosedList] = useState<any[]>([]);
  const [allClosedLoading, setAllClosedLoading] = useState<boolean>(false);

  const [processingList, setProcessingList] = useState<any[]>([]);
  const [processingLoading, setProcessingLoading] = useState<boolean>(false);

  const [completedList, setCompletedList] = useState<any[]>([]);
  const [completedLoading, setCompletedLoading] = useState<boolean>(false);

  const [scheduleList, setScheduleList] = useState<any[]>([]);
  const [scheduleLoading, setScheduleLoading] = useState<boolean>(false);

  const [localTrackerList, setLocalTrackerList] = useState<any[]>([]);
  const [localTrackerLoading, setLocalTrackerLoading] = useState<boolean>(false);

  const [factoryTrackerList, setFactoryTrackerList] = useState<any[]>([]);
  const [factoryTrackerLoading, setFactoryTrackerLoading] = useState<boolean>(false);

  const [paymentLedgers, setPaymentLedgers] = useState<any[]>([]);
  const [paymentLoading, setPaymentLoading] = useState<boolean>(false);

  const [localHistoryList, setLocalHistoryList] = useState<any[]>([]);
  const [localHistoryLoading, setLocalHistoryLoading] = useState<boolean>(false);

  const [factoryHistoryList, setFactoryHistoryList] = useState<any[]>([]);
  const [factoryHistoryLoading, setFactoryHistoryLoading] = useState<boolean>(false);

  const [reportsData, setReportsData] = useState<any | null>(null);
  const [reportsLoading, setReportsLoading] = useState<boolean>(false);

  // Partial Dispatch Modal State
  const [partialModal, setPartialModal] = useState<{
    quote: any;
    item: any;
  } | null>(null);
  const [partialQty, setPartialQty] = useState<number | string>('');
  const [partialVehicle, setPartialVehicle] = useState<string>('');
  const [partialDriverName, setPartialDriverName] = useState<string>('');
  const [partialDriverPhone, setPartialDriverPhone] = useState<string>('');
  const [partialNotes, setPartialNotes] = useState<string>('');
  const [recordingPartial, setRecordingPartial] = useState<boolean>(false);

  // Delivery Challan PDF Preview Modal State
  const [previewPdf, setPreviewPdf] = useState<{
    url: string;
    title: string;
    fileName: string;
  } | null>(null);

  // Selected Quotation Line Items Detail Drawer State
  const [selectedQuotationId, setSelectedQuotationId] = useState<number | null>(null);
  const [detailLoading, setDetailLoading] = useState<boolean>(false);
  const [activeQuotation, setActiveQuotation] = useState<Quotation | null>(null);
  const [activeItems, setActiveItems] = useState<QuotationItem[]>([]);
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
  const [savingDispatch, setSavingDispatch] = useState<boolean>(false);

  // Shortfall Warning Confirmation State
  const [shortfallConfirm, setShortfallConfirm] = useState<{
    item: any;
    itemVal: number;
    baseAmount?: number;
    taxInclusiveAmount?: number;
    isTaxExclusive?: boolean;
    taxRatePct?: number;
    verifiedPaid: number;
    shortfall: number;
    quoteNetTotal: number;
    quoteBalanceDue: number;
    actionDescription: string;
    actionBadgeText: string;
    onConfirm: () => void;
  } | null>(null);

  // Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((cur) => (cur === msg ? null : cur));
    }, 4000);
  };

  // API Loaders
  const loadStats = useCallback(async () => {
    try {
      setLoadingStats(true);
      const res = await fetchApi<any>('/api/dispatch/stats');
      setStats(res);
    } catch {
      // silent
    } finally {
      setLoadingStats(false);
    }
  }, [fetchApi]);

  const loadAllClosed = useCallback(async () => {
    try {
      setAllClosedLoading(true);
      const res = await fetchApi<any>('/api/dispatch/all-closed');
      setAllClosedList(res?.quotations || []);
    } catch (err: any) {
      console.warn('Failed to load all closed quotations:', err);
    } finally {
      setAllClosedLoading(false);
    }
  }, [fetchApi]);

  const loadProcessing = useCallback(async () => {
    try {
      setProcessingLoading(true);
      const res = await fetchApi<any>('/api/dispatch/processing');
      setProcessingList(res?.dispatches || []);
    } catch (err: any) {
      console.warn('Failed to load processing dispatches:', err);
    } finally {
      setProcessingLoading(false);
    }
  }, [fetchApi]);

  const loadCompleted = useCallback(async () => {
    try {
      setCompletedLoading(true);
      const res = await fetchApi<any>('/api/dispatch/completed');
      setCompletedList(res?.completed || res?.completed_dispatches || []);
    } catch (err: any) {
      console.warn('Failed to load completed dispatches:', err);
    } finally {
      setCompletedLoading(false);
    }
  }, [fetchApi]);

  const loadSchedule = useCallback(async () => {
    try {
      setScheduleLoading(true);
      const res = await fetchApi<any>('/api/dispatch/schedule');
      setScheduleList(res?.schedule || []);
    } catch (err: any) {
      console.warn('Failed to load dispatch schedule:', err);
    } finally {
      setScheduleLoading(false);
    }
  }, [fetchApi]);

  const loadLocalTracker = useCallback(async () => {
    try {
      setLocalTrackerLoading(true);
      const res = await fetchApi<any>('/api/dispatch/local-tracker');
      setLocalTrackerList(res?.items || []);
    } catch (err: any) {
      console.warn('Failed to load local tracker:', err);
    } finally {
      setLocalTrackerLoading(false);
    }
  }, [fetchApi]);

  const loadFactoryTracker = useCallback(async () => {
    try {
      setFactoryTrackerLoading(true);
      const res = await fetchApi<any>('/api/dispatch/factory-tracker');
      setFactoryTrackerList(res?.orders || []);
    } catch (err: any) {
      console.warn('Failed to load factory tracker:', err);
    } finally {
      setFactoryTrackerLoading(false);
    }
  }, [fetchApi]);

  const loadPaymentTracking = useCallback(async () => {
    try {
      setPaymentLoading(true);
      const res = await fetchApi<any>('/api/dispatch/payment-tracking');
      setPaymentLedgers(res?.ledgers || []);
    } catch (err: any) {
      console.warn('Failed to load payment tracking:', err);
    } finally {
      setPaymentLoading(false);
    }
  }, [fetchApi]);

  const loadLocalHistory = useCallback(async () => {
    try {
      setLocalHistoryLoading(true);
      const res = await fetchApi<any>('/api/dispatch/local-history');
      setLocalHistoryList(res?.history || []);
    } catch (err: any) {
      console.warn('Failed to load local history:', err);
    } finally {
      setLocalHistoryLoading(false);
    }
  }, [fetchApi]);

  const loadFactoryHistory = useCallback(async () => {
    try {
      setFactoryHistoryLoading(true);
      const res = await fetchApi<any>('/api/dispatch/factory-history');
      setFactoryHistoryList(res?.history || []);
    } catch (err: any) {
      console.warn('Failed to load factory history:', err);
    } finally {
      setFactoryHistoryLoading(false);
    }
  }, [fetchApi]);

  const loadReports = useCallback(
    async (range = 'month', fromDate?: string, toDate?: string) => {
      try {
        setReportsLoading(true);
        const p = new URLSearchParams({ range });
        if (fromDate) p.append('fromDate', fromDate);
        if (toDate) p.append('toDate', toDate);
        const res = await fetchApi<any>(`/api/dispatch/reports?${p.toString()}`);
        setReportsData(res?.reports || null);
      } catch (err: any) {
        console.warn('Failed to load reports:', err);
      } finally {
        setReportsLoading(false);
      }
    },
    [fetchApi]
  );

  // Load active view data
  useEffect(() => {
    loadStats();
    switch (currentView) {
      case 'all-closed':
        loadAllClosed();
        break;
      case 'processing':
        loadProcessing();
        break;
      case 'completed':
        loadCompleted();
        break;
      case 'schedule':
        loadSchedule();
        break;
      case 'local-tracker':
        loadLocalTracker();
        break;
      case 'factory-tracker':
        loadFactoryTracker();
        break;
      case 'payment-tracking':
        loadPaymentTracking();
        break;
      case 'local-history':
        loadLocalHistory();
        break;
      case 'factory-history':
        loadFactoryHistory();
        break;
      case 'reports':
        loadReports('month');
        break;
      default:
        loadAllClosed();
    }
  }, [
    currentView,
    loadStats,
    loadAllClosed,
    loadProcessing,
    loadCompleted,
    loadSchedule,
    loadLocalTracker,
    loadFactoryTracker,
    loadPaymentTracking,
    loadLocalHistory,
    loadFactoryHistory,
    loadReports,
  ]);

  // WebSocket sync for real-time updates across desktop and web clients
  useEffect(() => {
    const unsubscribe = subscribeToEvents((event) => {
      if (
        [
          'dispatch:updated',
          'dispatch:partial_applied',
          'item_status:changed',
          'payment:recorded',
          'DISPATCH_ITEM_CHANGED',
          'DISPATCH_CHANGES_ACKNOWLEDGED',
          'DISPATCH_UPDATED',
        ].includes(event.type)
      ) {
        loadStats();
        if (currentView === 'all-closed') loadAllClosed();
        if (currentView === 'processing') loadProcessing();
        if (currentView === 'completed') loadCompleted();
        if (currentView === 'schedule') loadSchedule();
        if (currentView === 'local-tracker') loadLocalTracker();
        if (currentView === 'factory-tracker') loadFactoryTracker();
        if (currentView === 'payment-tracking') loadPaymentTracking();
        if (selectedQuotationId && event.payload?.quotation_id === selectedQuotationId) {
          loadQuotationDetail(selectedQuotationId);
        }
      }
    });
    return () => unsubscribe();
  }, [
    currentView,
    selectedQuotationId,
    loadStats,
    loadAllClosed,
    loadProcessing,
    loadCompleted,
    loadSchedule,
    loadLocalTracker,
    loadFactoryTracker,
    loadPaymentTracking,
    subscribeToEvents,
  ]);

  // Quotation Detail Drawer Loader
  const loadQuotationDetail = async (id: number) => {
    try {
      setDetailLoading(true);
      const res = await fetchApi<any>(`/api/dispatch/quotations/${id}`);
      setActiveQuotation(res.quotation);
      const items = res.items || [];
      setActiveItems(items);

      setOverallStatus(res.quotation.dispatch_status || 'Yet to Update');
      setOverallDate(res.quotation.expected_dispatch_date ? res.quotation.expected_dispatch_date.slice(0, 10) : '');
      setOverallNotes(res.quotation.dispatch_notes || '');

      const initialEdited: Record<number, any> = {};
      items.forEach((it: QuotationItem) => {
        if (it.id) {
          const totalQty = it.quantity_boxes > 0 ? it.quantity_boxes : it.quantity_sqft > 0 ? it.quantity_sqft : 1;
          initialEdited[it.id] = {
            status: it.dispatch_status || 'Yet to Update',
            date: it.expected_dispatch_date ? it.expected_dispatch_date.slice(0, 10) : '',
            notes: it.dispatch_notes || '',
            dispatched_quantity: it.dispatched_quantity !== undefined ? it.dispatched_quantity : (it.dispatch_status === 'Dispatched' ? totalQty : 0),
            procurement_status: (it as any).procurement_status || '',
            procurement_notes: (it as any).procurement_notes || '',
          };
        }
      });
      setEditedItems(initialEdited);
    } catch (err: any) {
      alert(err.message || 'Failed to load quotation detail');
      setSelectedQuotationId(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleInitiateDispatch = (quote: any) => {
    setSelectedQuotationId(quote.id);
    loadQuotationDetail(quote.id);
  };

  // Partial Dispatch Recording
  const handleOpenPartialModal = (quote: any, item: any) => {
    const rem = Number(item.remaining_quantity || item.ordered_quantity || 0);
    setPartialModal({ quote, item });
    setPartialQty(rem > 0 ? rem : 1);
    setPartialVehicle(quote.vehicle_no || '');
    setPartialDriverName(quote.driver_name || '');
    setPartialDriverPhone(quote.driver_phone || '');
    setPartialNotes('');
  };

  const handleRecordPartialSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!partialModal) return;
    const qty = parseFloat(String(partialQty));
    if (isNaN(qty) || qty <= 0) {
      alert('Please enter a valid dispatch quantity');
      return;
    }
    const rem = Number(partialModal.item.remaining_quantity || partialModal.item.ordered_quantity || 0);
    if (qty > rem) {
      alert(`Cannot dispatch ${qty}. Only ${rem} remaining.`);
      return;
    }

    try {
      setRecordingPartial(true);
      const res = await fetchApi<any>('/api/dispatch/partial-dispatch', {
        method: 'POST',
        body: JSON.stringify({
          quotation_id: partialModal.quote.id,
          item_id: partialModal.item.id,
          quantity_dispatched: qty,
          vehicle_no: partialVehicle.trim(),
          driver_name: partialDriverName.trim(),
          driver_phone: partialDriverPhone.trim(),
          notes: partialNotes.trim(),
        }),
      });

      showToast(`Dispatched ${qty} units. Overall fulfillment: ${res.progress_percent}%`);
      const qId = partialModal.quote.id;
      const challanNo = res.challan_number;
      setPartialModal(null);
      loadProcessing();
      loadCompleted();
      loadStats();

      if (challanNo) {
        handlePrintChallan(qId, challanNo);
      }
    } catch (err: any) {
      alert(err.message || 'Failed to record partial dispatch');
    } finally {
      setRecordingPartial(false);
    }
  };

  // Delivery Challan PDF Print / View
  const handlePrintChallan = (quoteId: number, challanNo?: string) => {
    const token = localStorage.getItem('ama_token');
    const url = `${serverUrl}/api/dispatch/challan/${quoteId}/pdf${token ? `?token=${encodeURIComponent(token)}` : ''}`;
    setPreviewPdf({
      url,
      title: `Delivery Challan - Quote #${quoteId}`,
      fileName: `Delivery_Challan_${challanNo || quoteId}.pdf`,
    });
  };

  // Reschedule Dispatch
  const handleReschedule = async (quoteId: number, newDate: string, notes?: string) => {
    try {
      await fetchApi<any>(`/api/dispatch/schedule/${quoteId}`, {
        method: 'PUT',
        body: JSON.stringify({ scheduled_date: newDate, notes }),
      });
      showToast(`Dispatch rescheduled to ${newDate}`);
      loadSchedule();
      loadStats();
    } catch (err: any) {
      alert(err.message || 'Failed to reschedule dispatch');
    }
  };

  // Local Item Update
  const handleUpdateLocalItem = async (itemId: number, payload: any) => {
    try {
      await fetchApi<any>(`/api/dispatch/local-tracker/${itemId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      showToast('Local purchase item updated');
      loadLocalTracker();
      loadStats();
    } catch (err: any) {
      alert(err.message || 'Failed to update local purchase item');
    }
  };

  const handleVerifyLocalPayment = async (
    itemId: number,
    payload: { verified: boolean; admin_override?: boolean; override_notes?: string }
  ) => {
    try {
      const res = await fetchApi<any>(`/api/dispatch/local-tracker/${itemId}/verify-payment`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      showToast(res.message || 'Payment status updated');
      loadLocalTracker();
      loadProcessing();
    } catch (err: any) {
      alert(err.message || 'Failed to verify payment');
      throw err;
    }
  };

  const handleVerifyLocalAvailability = async (itemId: number, available: boolean) => {
    try {
      const res = await fetchApi<any>(`/api/dispatch/local-tracker/${itemId}/verify-availability`, {
        method: 'PATCH',
        body: JSON.stringify({ available }),
      });
      showToast(res.message || 'Availability status updated');
      loadLocalTracker();
    } catch (err: any) {
      alert(err.message || 'Failed to update availability');
      throw err;
    }
  };

  // Factory Order Update
  const handleUpdateFactoryOrder = async (itemId: number, payload: any) => {
    try {
      await fetchApi<any>(`/api/dispatch/factory-tracker/${itemId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      showToast('Factory order updated');
      loadFactoryTracker();
      loadStats();
    } catch (err: any) {
      alert(err.message || 'Failed to update factory order');
    }
  };

  // Helper to compute overall status
  const computeOverallDispatchStatus = (items: QuotationItem[], itemStates: Record<number, any>): string => {
    if (!items.length) return 'Yet to Update';
    const statuses = items.map((it) => {
      const state = it.id ? itemStates[it.id] : null;
      return state?.status || it.dispatch_status || 'Yet to Update';
    });

    if (statuses.every((s) => s === 'Dispatched')) return 'Dispatched';
    if (statuses.some((s) => s === 'Factory Order')) return 'Factory Order';
    if (statuses.some((s) => s === 'Need to Arrange from Local')) return 'Need to Arrange from Local';
    if (statuses.some((s) => s === 'Ready Stock')) return 'Ready Stock';
    return 'Yet to Update';
  };

  // Save Quotation Line Items Dispatch Statuses
  const handleSaveQuotationItemsDispatch = async () => {
    if (!selectedQuotationId || isViewOnly) return;
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
      setSavingDispatch(true);
      await fetchApi(`/api/dispatch/quotations/${selectedQuotationId}`, {
        method: 'PUT',
        body: JSON.stringify({
          expected_dispatch_date: overallDate,
          dispatch_status: finalStatusToSend,
          dispatch_notes: overallNotes,
          items: payloadItems,
        }),
      });

      showToast('Dispatch sourcing saved! Moved to Processing Dispatch.');
      setSelectedQuotationId(null);
      setCurrentView('processing');
      loadProcessing();
      loadAllClosed();
      loadStats();
    } catch (err: any) {
      alert(err.message || 'Failed to save dispatch changes');
    } finally {
      setSavingDispatch(false);
    }
  };

  // 10 Distinct Navigation Tabs Configuration
  const moduleTabs = [
    {
      id: 'all-closed',
      label: 'All Closed Quotations',
      icon: CheckCircle2,
      badge: allClosedList.length || stats?.total_closed_quotations,
      badgeColor: 'bg-emerald-600/30 text-emerald-800',
    },
    {
      id: 'processing',
      label: 'Processing Dispatch',
      icon: Truck,
      badge: processingList.length,
      badgeColor: 'bg-teal-600/30 text-teal-800',
    },
    {
      id: 'completed',
      label: 'Dispatch Completed',
      icon: PackageCheck,
      badge: completedList.length,
      badgeColor: 'bg-slate-200 text-slate-700',
    },
    {
      id: 'schedule',
      label: 'Dispatch Schedule',
      icon: Calendar,
      badge: stats?.overdue_count > 0 ? stats.overdue_count : undefined,
      badgeColor: 'bg-rose-500 text-white',
    },
    {
      id: 'local-tracker',
      label: 'Local Purchase Tracker',
      icon: Package,
      badge: localTrackerList.length || stats?.local_arrange_count,
      badgeColor: 'bg-amber-500 text-white',
    },
    {
      id: 'factory-tracker',
      label: 'Factory Order Tracking',
      icon: Factory,
      badge: factoryTrackerList.length || stats?.factory_order_count,
      badgeColor: 'bg-indigo-500 text-white',
    },
    {
      id: 'payment-tracking',
      label: 'Client Payment Tracking',
      icon: CreditCard,
    },
    {
      id: 'local-history',
      label: 'Local Purchase History',
      icon: History,
    },
    {
      id: 'factory-history',
      label: 'Factory Order History',
      icon: History,
    },
    {
      id: 'reports',
      label: 'Reports',
      icon: BarChart3,
    },
  ];

  // Refresh active view
  const handleRefreshActive = () => {
    loadStats();
    switch (currentView) {
      case 'all-closed':
        loadAllClosed();
        break;
      case 'processing':
        loadProcessing();
        break;
      case 'completed':
        loadCompleted();
        break;
      case 'schedule':
        loadSchedule();
        break;
      case 'local-tracker':
        loadLocalTracker();
        break;
      case 'factory-tracker':
        loadFactoryTracker();
        break;
      case 'payment-tracking':
        loadPaymentTracking();
        break;
      case 'local-history':
        loadLocalHistory();
        break;
      case 'factory-history':
        loadFactoryHistory();
        break;
      case 'reports':
        loadReports('month');
        break;
    }
  };

  const isCurrentViewLoading =
    currentView === 'all-closed'
      ? allClosedLoading
      : currentView === 'processing'
      ? processingLoading
      : currentView === 'completed'
      ? completedLoading
      : currentView === 'schedule'
      ? scheduleLoading
      : currentView === 'local-tracker'
      ? localTrackerLoading
      : currentView === 'factory-tracker'
      ? factoryTrackerLoading
      : currentView === 'payment-tracking'
      ? paymentLoading
      : currentView === 'local-history'
      ? localHistoryLoading
      : currentView === 'factory-history'
      ? factoryHistoryLoading
      : reportsLoading;

  // Render the selected view component
  const renderActiveViewContent = () => {
    switch (currentView) {
      case 'all-closed':
        return (
          <AllClosedView
            quotations={allClosedList}
            loading={allClosedLoading}
            onRefresh={loadAllClosed}
            onInitiateDispatch={handleInitiateDispatch}
            canEdit={canEditDispatch}
          />
        );
      case 'processing':
        return (
          <ProcessingDispatchView
            dispatches={processingList}
            loading={processingLoading}
            onRefresh={loadProcessing}
            onRecordPartial={handleOpenPartialModal}
            onPrintChallan={(id) => handlePrintChallan(id)}
            canEdit={canEditDispatch}
            onNavigateToPayments={(quoteNum) => {
              setCurrentView('payment-tracking');
            }}
            userRole={userRole}
          />
        );
      case 'completed':
        return (
          <CompletedDispatchView
            completedList={completedList}
            loading={completedLoading}
            onRefresh={loadCompleted}
            onPrintChallan={(id) => handlePrintChallan(id)}
          />
        );
      case 'schedule':
        return (
          <ScheduleView
            scheduleList={scheduleList}
            loading={scheduleLoading}
            onRefresh={loadSchedule}
            onReschedule={handleReschedule}
            canEdit={canEditDispatch}
          />
        );
      case 'local-tracker':
        return (
          <LocalTrackerView
            items={localTrackerList}
            loading={localTrackerLoading}
            onRefresh={loadLocalTracker}
            onUpdateItem={handleUpdateLocalItem}
            onVerifyPayment={handleVerifyLocalPayment}
            onVerifyAvailability={handleVerifyLocalAvailability}
            canEdit={canEditDispatch}
            onNavigateToPayments={(quoteNum) => {
              setCurrentView('payment-tracking');
            }}
            userRole={userRole}
          />
        );
      case 'factory-tracker':
        return (
          <FactoryTrackerView
            orders={factoryTrackerList}
            loading={factoryTrackerLoading}
            onRefresh={loadFactoryTracker}
            onUpdateOrder={handleUpdateFactoryOrder}
            canEdit={canEditDispatch}
          />
        );
      case 'payment-tracking':
        return (
          <PaymentTrackingView
            ledgers={paymentLedgers}
            loading={paymentLoading}
            onRefresh={loadPaymentTracking}
            onSelectQuote={(id) => {
              setSelectedQuotationId(id);
              loadQuotationDetail(id);
            }}
          />
        );
      case 'local-history':
        return (
          <LocalHistoryView
            history={localHistoryList}
            loading={localHistoryLoading}
            onRefresh={loadLocalHistory}
          />
        );
      case 'factory-history':
        return (
          <FactoryHistoryView
            history={factoryHistoryList}
            loading={factoryHistoryLoading}
            onRefresh={loadFactoryHistory}
          />
        );
      case 'reports':
        return (
          <DispatchReportsView
            reportData={reportsData}
            loading={reportsLoading}
            onFilterChange={(range, fromDate, toDate) => loadReports(range, fromDate, toDate)}
            onRefresh={() => loadReports('month')}
          />
        );
      default:
        return (
          <AllClosedView
            quotations={allClosedList}
            loading={allClosedLoading}
            onRefresh={loadAllClosed}
            onInitiateDispatch={handleInitiateDispatch}
            canEdit={canEditDispatch}
          />
        );
    }
  };

  return (
    <div className="h-full max-h-full w-full flex flex-col overflow-hidden bg-slate-50/60 dark:bg-slate-950 p-2 sm:p-3 lg:p-4 gap-2 sm:gap-2.5">
      {/* Top Header Bar */}
      <div className="flex-shrink-0 flex items-center justify-between gap-3 border-b border-slate-200/80 pb-2">
        <div>
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-600 to-teal-500 text-white flex items-center justify-center shadow-xs">
              <Truck size={17} />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-black text-slate-900 tracking-tight flex items-center space-x-1.5 leading-none">
                <span>Dispatch Management</span>
                <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-indigo-100 text-indigo-700 uppercase tracking-widest border border-indigo-200">
                  Subsystem
                </span>
              </h1>
              <p className="text-[11px] text-slate-500 font-medium mt-0.5 leading-tight">
                Centralized Godown Fulfillment, Local & Factory Procurement, Schedule & Audits
              </p>
            </div>
          </div>
        </div>

        {/* Global Quick Action & Refresh */}
        <div className="flex items-center space-x-2">
          {canSeeModifiedItemsAlert && (stats?.pending_item_changes_count || 0) > 0 && (
            <div className="px-2.5 py-1 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-[11px] font-bold flex items-center space-x-1 animate-pulse">
              <AlertTriangle size={13} className="text-rose-600 shrink-0" />
              <span>{stats.pending_item_changes_count} Orders Need Review</span>
            </div>
          )}

          <button
            type="button"
            onClick={handleRefreshActive}
            disabled={isCurrentViewLoading || loadingStats}
            className="btn btn-secondary btn-sm h-8 px-2.5 text-xs flex items-center space-x-1.5 cursor-pointer text-slate-700 shadow-2xs"
            title="Refresh current module"
          >
            <RefreshCw
              size={12}
              className={isCurrentViewLoading || loadingStats ? 'animate-spin text-indigo-600' : 'text-slate-500'}
            />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Top 10-Module Tab Navigation Bar */}
      <div className="flex-shrink-0 flex items-center gap-1.5 bg-slate-100/90 p-1.5 rounded-xl border border-slate-200/90 shadow-inner overflow-x-auto scrollbar-thin">
        {moduleTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = currentView === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setCurrentView(tab.id)}
              className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                isActive
                  ? 'bg-slate-900 text-white shadow-xs ring-1 ring-slate-700/50'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
              }`}
            >
              <Icon size={13} className={isActive ? 'text-teal-300' : 'text-slate-400'} />
              <span>{tab.label}</span>
              {tab.badge !== undefined && tab.badge !== null && tab.badge !== 0 && (
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[9px] font-extrabold ${
                    isActive ? 'bg-white/20 text-white' : tab.badgeColor || 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Fluid Dynamic Workspace Shell */}
      <main className="flex-1 min-h-0 w-full flex flex-col overflow-hidden">
        {renderActiveViewContent()}
      </main>

      {/* MODAL 1: Partial Dispatch Recording Modal */}
      {partialModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn"
          onClick={() => setPartialModal(null)}
        >
          <div
            className="card max-w-lg w-full max-h-[85vh] bg-white border border-slate-200 shadow-2xl rounded-2xl flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex-shrink-0 flex items-start justify-between border-b border-slate-200 p-4">
              <div>
                <h3 className="text-base font-extrabold text-slate-900 flex items-center space-x-2">
                  <Truck size={18} className="text-teal-600" />
                  <span>Record Partial Dispatch</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5 font-mono">
                  Quotation: {partialModal.quote.quotation_number} • {partialModal.quote.customer_name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPartialModal(null)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3.5 scrollbar-thin">
              {/* Item Card Summary */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs space-y-1.5">
                <div className="font-bold text-slate-900 text-sm">{partialModal.item.description}</div>
                <div className="text-slate-500 flex items-center space-x-2">
                  <span>Brand: {partialModal.item.brand || 'Standard'}</span>
                  <span>•</span>
                  <span>Size: {partialModal.item.size || 'N/A'}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200 text-center">
                  <div className="bg-white p-2 rounded-lg border border-slate-200">
                    <span className="text-[10px] text-slate-400 uppercase font-bold block">Ordered</span>
                    <span className="text-xs font-extrabold text-slate-800 font-mono">
                      {partialModal.item.ordered_quantity}
                    </span>
                  </div>
                  <div className="bg-white p-2 rounded-lg border border-slate-200">
                    <span className="text-[10px] text-teal-600 uppercase font-bold block">Delivered</span>
                    <span className="text-xs font-extrabold text-teal-700 font-mono">
                      {partialModal.item.quantity_dispatched || 0}
                    </span>
                  </div>
                  <div className="bg-white p-2 rounded-lg border border-slate-200">
                    <span className="text-[10px] text-amber-600 uppercase font-bold block">Remaining</span>
                    <span className="text-xs font-extrabold text-amber-700 font-mono">
                      {partialModal.item.remaining_quantity || partialModal.item.ordered_quantity}
                    </span>
                  </div>
                </div>
              </div>

              {/* Form */}
              <form id="partial-dispatch-form" onSubmit={handleRecordPartialSubmit} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Quantity to Dispatch Now <span className="text-rose-500">*</span>
                  </label>
                  <div className="flex items-center space-x-2">
                    <input
                      type="number"
                      step="any"
                      min="0.01"
                      max={Number(partialModal.item.remaining_quantity || partialModal.item.ordered_quantity)}
                      value={partialQty}
                      onChange={(e) => setPartialQty(e.target.value)}
                      required
                      className="input input-sm text-sm font-mono font-bold w-full"
                      placeholder="e.g. 50"
                    />
                    <span className="text-xs font-bold text-slate-600 bg-slate-100 px-3 py-2 rounded-lg border border-slate-200 whitespace-nowrap">
                      Units / Boxes
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Max dispatchable right now: {partialModal.item.remaining_quantity || partialModal.item.ordered_quantity}
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Vehicle / Truck No</label>
                    <input
                      type="text"
                      value={partialVehicle}
                      onChange={(e) => setPartialVehicle(e.target.value)}
                      className="input input-sm text-xs font-mono uppercase"
                      placeholder="KA-01-AB-1234"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Driver Name & Phone</label>
                    <input
                      type="text"
                      value={partialDriverName}
                      onChange={(e) => setPartialDriverName(e.target.value)}
                      className="input input-sm text-xs"
                      placeholder="Ramesh (+91 9876543210)"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Delivery Notes / Remarks</label>
                  <textarea
                    rows={2}
                    value={partialNotes}
                    onChange={(e) => setPartialNotes(e.target.value)}
                    className="input text-xs w-full"
                    placeholder="Gate pass #, recipient notes, floor unloading..."
                  />
                </div>
              </form>
            </div>

            <div className="flex-shrink-0 flex items-center justify-end space-x-2 p-3 bg-slate-50 border-t border-slate-200 sticky bottom-0">
              <button
                type="button"
                onClick={() => setPartialModal(null)}
                className="btn btn-secondary btn-sm text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="partial-dispatch-form"
                disabled={recordingPartial}
                className="btn btn-primary btn-sm text-xs font-bold bg-teal-600 hover:bg-teal-700 text-white border-none shadow-xs flex items-center space-x-1.5 cursor-pointer"
              >
                <Check size={14} className={recordingPartial ? 'animate-spin' : ''} />
                <span>{recordingPartial ? 'Recording...' : 'Confirm Dispatch & Create Challan'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Line Items Sourcing Detail Drawer */}
      {selectedQuotationId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-end bg-slate-900/60 backdrop-blur-xs animate-fadeIn"
          onClick={() => setSelectedQuotationId(null)}
        >
          <div
            className="card max-w-4xl w-full h-full bg-white border-l border-slate-200 shadow-2xl flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {detailLoading ? (
              <div className="flex-1 flex items-center justify-center space-y-3 flex-col">
                <RefreshCw size={28} className="animate-spin text-indigo-600" />
                <span className="text-xs text-slate-500 font-bold">Loading Quotation Line Items...</span>
              </div>
            ) : (
              <>
                {/* Drawer Fixed Header */}
                <div className="flex-shrink-0 p-4 border-b border-slate-200 flex items-start justify-between bg-white">
                  <div>
                    <div className="flex items-center space-x-2">
                      <h2 className="text-lg font-black text-slate-900 font-mono">
                        {activeQuotation?.quotation_number}
                      </h2>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 uppercase">
                        Line Items Sourcing Desk
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Customer: <strong className="text-slate-800">{activeQuotation?.customer_name}</strong> • Phone:{' '}
                      {activeQuotation?.customer_phone || 'N/A'} • Site: {activeQuotation?.site_location || 'N/A'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedQuotationId(null)}
                    className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                  >
                    <X size={20} />
                  </button>
                </div>

                {/* Sourcing Drawer Body - Isolated Inner Scroll */}
                <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 space-y-4 scrollbar-thin">
                  {/* Financial & Overall Status Card */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-bold block">Quotation Value</span>
                      <span className="text-xs font-extrabold text-slate-900 font-mono block mt-0.5">
                        ₹ {formatCurrency(activeQuotation?.net_total)}
                      </span>
                      {((activeQuotation as any)?.tax_type === 'exclusive' || (activeQuotation as any)?.is_tax_exclusive || (parseFloat(String(activeQuotation?.gross_total || 0)) > 0 && Math.abs(parseFloat(String(activeQuotation?.net_total || 0)) - parseFloat(String(activeQuotation?.gross_total || 0))) > 1.0)) ? (
                        <span className="text-[9px] font-bold text-amber-800 bg-amber-50 px-1 py-0.2 rounded border border-amber-200 font-mono inline-block mt-0.5">
                          Excl. Tax (Gross: ₹{formatCurrency(activeQuotation?.gross_total)})
                        </span>
                      ) : (
                        <span className="text-[9px] font-medium text-emerald-700 inline-block mt-0.5">
                          Incl. Tax
                        </span>
                      )}
                    </div>
                    <div>
                      <span className="text-[10px] text-emerald-600 uppercase font-bold block">Verified Paid</span>
                      <span className="text-xs font-extrabold text-emerald-700 font-mono block mt-0.5">
                        ₹ {formatCurrency(activeQuotation?.total_paid || 0)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-rose-600 uppercase font-bold block">Balance Due</span>
                      <span className="text-xs font-extrabold text-rose-700 font-mono block mt-0.5">
                        ₹ {formatCurrency(activeQuotation?.balance_due || 0)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-bold block">Total Items</span>
                      <span className="text-xs font-extrabold text-slate-800 font-mono block mt-0.5">
                        {activeItems.length} Products
                      </span>
                    </div>
                  </div>

                  {/* Overall Sourcing & Target Dispatch Date Settings */}
                  <div className="p-3 bg-indigo-50/50 border border-indigo-200/60 rounded-xl space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-extrabold text-indigo-950 uppercase tracking-wide">
                        Target Dispatch Schedule & Overall Note
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          Expected Dispatch Date
                        </label>
                        <input
                          type="date"
                          value={overallDate}
                          disabled={isViewOnly}
                          onChange={(e) => setOverallDate(e.target.value)}
                          className="input input-sm text-xs font-mono font-bold"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          Godown Dispatch Remarks
                        </label>
                        <input
                          type="text"
                          value={overallNotes}
                          disabled={isViewOnly}
                          onChange={(e) => setOverallNotes(e.target.value)}
                          placeholder="e.g. Delivery via tempo, customer requested morning drop..."
                          className="input input-sm text-xs"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Items Table */}
                  <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-100 text-slate-700 font-bold uppercase text-[10px] border-b border-slate-200">
                        <tr>
                          <th className="py-2.5 px-3">#</th>
                          <th className="py-2.5 px-3">Item Details</th>
                          <th className="py-2.5 px-3 text-right">Quantity</th>
                          <th className="py-2.5 px-3">Sourcing Status</th>
                          <th className="py-2.5 px-3">Target Date</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {activeItems.map((item, idx) => {
                          const itemId = item.id || idx;
                          const state = editedItems[itemId] || { status: 'Yet to Update', date: '' };
                          const totalQty = item.quantity_boxes > 0 ? item.quantity_boxes : item.quantity_sqft > 0 ? item.quantity_sqft : 1;
                          const unitLabel = item.quantity_boxes > 0 ? 'Box' : item.quantity_sqft > 0 ? 'Sq.Ft' : 'Pcs';

                          const grossTotal = parseFloat(String(activeQuotation?.gross_total || (activeQuotation as any)?.taxable_amount || 0));
                          const netTotal = parseFloat(String(activeQuotation?.net_total || 0));
                          const taxMultiplier = (grossTotal > 0 && netTotal > 0) ? (netTotal / grossTotal) : 1.0;
                          const isTaxExclusive = (activeQuotation as any)?.tax_type === 'exclusive' || (activeQuotation as any)?.is_tax_exclusive || (grossTotal > 0 && Math.abs(netTotal - grossTotal) > 1.0);
                          const taxRatePct = Math.round((taxMultiplier - 1.0) * 100);

                          const baseAmount = parseFloat(String(item.total_amount || 0));
                          const taxInclusiveAmount = (item as any).tax_inclusive_amount !== undefined
                            ? parseFloat(String((item as any).tax_inclusive_amount))
                            : Math.round(baseAmount * taxMultiplier * 100) / 100;

                          return (
                            <tr key={itemId} className="hover:bg-slate-50">
                              <td className="py-2.5 px-3 font-mono font-bold text-slate-400">{idx + 1}</td>
                              <td className="py-2.5 px-3">
                                <div className="font-bold text-slate-900">{item.description}</div>
                                <div className="text-[11px] text-slate-500 flex items-center flex-wrap gap-x-1.5 mt-0.5">
                                  {item.brand && <span>{item.brand} • </span>}
                                  {item.size && <span>{item.size} • </span>}
                                  <span className="font-extrabold text-slate-900 font-mono">
                                    ₹ {formatCurrency(taxInclusiveAmount)}
                                  </span>
                                  {isTaxExclusive ? (
                                    <span className="text-[10px] text-amber-800 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200 font-mono font-bold">
                                      Excl. Tax (Base ₹{formatCurrency(baseAmount)} + {taxRatePct > 0 ? `${taxRatePct}% GST` : 'Tax'})
                                    </span>
                                  ) : (
                                    <span className="text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200 font-medium">
                                      Incl. Tax
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-800">
                                {totalQty} {unitLabel}
                              </td>
                              <td className="py-2.5 px-3">
                                <select
                                  value={state.status}
                                  disabled={isViewOnly}
                                  onChange={(e) => {
                                    if (isViewOnly) return;
                                    const newStatus = e.target.value;
                                    const itemVal = taxInclusiveAmount;
                                    const verifiedPaid = parseFloat(String(activeQuotation?.total_paid || 0));

                                    const applyChange = () => {
                                      setEditedItems((prev) => ({
                                        ...prev,
                                        [itemId]: {
                                          ...state,
                                          status: newStatus,
                                        },
                                      }));
                                    };

                                    // Shortfall Warning Gate for local purchase or ready stock when balance due exists
                                    if (itemVal > verifiedPaid && ['Need to Arrange from Local', 'Ready Stock', 'Dispatched'].includes(newStatus)) {
                                      setShortfallConfirm({
                                        item,
                                        itemVal,
                                        baseAmount,
                                        taxInclusiveAmount,
                                        isTaxExclusive,
                                        taxRatePct,
                                        verifiedPaid,
                                        shortfall: Math.round((itemVal - verifiedPaid) * 100) / 100,
                                        quoteNetTotal: parseFloat(String(activeQuotation?.net_total || 0)),
                                        quoteBalanceDue: parseFloat(String(activeQuotation?.balance_due || 0)),
                                        actionDescription: `Proceed with setting status to "${newStatus}"`,
                                        actionBadgeText: newStatus,
                                        onConfirm: () => {
                                          setShortfallConfirm(null);
                                          applyChange();
                                        },
                                      });
                                      return;
                                    }

                                    applyChange();
                                  }}
                                  className="select select-sm text-xs font-semibold w-full"
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
                                  value={state.date || overallDate}
                                  disabled={isViewOnly}
                                  onChange={(e) => {
                                    setEditedItems((prev) => ({
                                      ...prev,
                                      [itemId]: {
                                        ...state,
                                        date: e.target.value,
                                      },
                                    }));
                                  }}
                                  className="input input-sm text-xs font-mono font-bold"
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Drawer Fixed Footer Actions */}
                <div className="flex-shrink-0 flex items-center justify-between p-3.5 sm:p-4 bg-slate-50 border-t border-slate-200 sticky bottom-0">
                  <div className="text-xs text-slate-500">
                    {isViewOnly && <span className="font-bold text-amber-700">View-Only Mode</span>}
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={() => setSelectedQuotationId(null)}
                      className="btn btn-secondary btn-sm text-xs cursor-pointer"
                    >
                      Close
                    </button>
                    {!isViewOnly && (
                      <button
                        type="button"
                        onClick={handleSaveQuotationItemsDispatch}
                        disabled={savingDispatch}
                        className="btn btn-primary btn-sm text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white border-none shadow-xs flex items-center space-x-1.5 cursor-pointer"
                      >
                        <Save size={14} className={savingDispatch ? 'animate-spin' : ''} />
                        <span>{savingDispatch ? 'Saving Changes...' : 'Save Dispatch Sourcing'}</span>
                      </button>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* MODAL 3: Payment Shortfall Warning Modal */}
      {shortfallConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn"
          onClick={() => setShortfallConfirm(null)}
        >
          <div
            className="card max-w-xl w-full max-h-[85vh] bg-white border border-amber-300 shadow-2xl rounded-2xl flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex-shrink-0 flex items-start justify-between gap-3 border-b border-amber-100 p-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-amber-100 border border-amber-300 text-amber-700 flex items-center justify-center text-xl shrink-0">
                  ⚠️
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-sm uppercase tracking-wide flex items-center gap-2">
                    <span>Payment Shortfall Warning</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                      Insufficient Advance
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Verified payment received is less than the value of this item.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShortfallConfirm(null)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4 scrollbar-thin">
              <div className="p-3.5 bg-amber-50/90 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-1.5 leading-relaxed">
                <p className="font-bold text-amber-950 flex items-center gap-1.5">
                  <AlertCircle size={15} className="text-amber-600 shrink-0" />
                  <span>Caution: Sufficient funds have not been verified for this item</span>
                </p>
                <p>
                  The customer has only paid a verified advance of{' '}
                  <strong className="text-emerald-800 font-bold">
                    ₹ {formatCurrency(shortfallConfirm.verifiedPaid)}
                  </strong>{' '}
                  against this quotation. This item alone is valued at{' '}
                  <strong className="text-slate-900 font-bold">
                    ₹ {formatCurrency(shortfallConfirm.itemVal)}
                  </strong>
                  {shortfallConfirm.isTaxExclusive && (
                    <span className="text-xs text-amber-800 font-medium ml-1">
                      (Base ₹{formatCurrency(shortfallConfirm.baseAmount || 0)} + {shortfallConfirm.taxRatePct && shortfallConfirm.taxRatePct > 0 ? `${shortfallConfirm.taxRatePct}% GST` : 'Tax'})
                    </span>
                  )}
                  , creating an uncovered shortfall of{' '}
                  <strong className="text-rose-700 font-extrabold">
                    ₹ {formatCurrency(shortfallConfirm.shortfall)}
                  </strong>
                  .
                </p>
              </div>

              <div className="grid grid-cols-3 gap-2.5 text-center">
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                    Item Value {shortfallConfirm.isTaxExclusive ? '(Incl. Tax)' : ''}
                  </span>
                  <span className="text-sm font-extrabold text-slate-900 block mt-1 tabular-nums">
                    ₹ {formatCurrency(shortfallConfirm.itemVal)}
                  </span>
                  {shortfallConfirm.isTaxExclusive && (
                    <span className="text-[9px] text-slate-400 font-mono block mt-0.5">
                      Base: ₹{formatCurrency(shortfallConfirm.baseAmount || 0)}
                    </span>
                  )}
                </div>
                <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 block">
                    Verified Paid
                  </span>
                  <span className="text-sm font-extrabold text-emerald-800 block mt-1 tabular-nums">
                    ₹ {formatCurrency(shortfallConfirm.verifiedPaid)}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700 block">
                    Shortfall
                  </span>
                  <span className="text-sm font-extrabold text-rose-700 block mt-1 tabular-nums">
                    -₹ {formatCurrency(shortfallConfirm.shortfall)}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex-shrink-0 flex flex-col sm:flex-row items-center justify-end gap-2.5 p-3 bg-slate-50 border-t border-slate-200 sticky bottom-0">
              <button
                type="button"
                onClick={() => setShortfallConfirm(null)}
                className="btn btn-secondary btn-sm w-full sm:w-auto font-semibold cursor-pointer"
              >
                Cancel Action
              </button>
              <button
                type="button"
                onClick={shortfallConfirm.onConfirm}
                className="btn btn-sm w-full sm:w-auto bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white font-bold flex items-center justify-center gap-1.5 shadow-md shadow-amber-600/20 cursor-pointer"
              >
                <span>Proceed Anyway ({shortfallConfirm.actionBadgeText})</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: Delivery Challan PDF Preview Modal */}
      {previewPdf && (
        <PdfPreviewModal
          isOpen={true}
          onClose={() => setPreviewPdf(null)}
          pdfUrl={previewPdf.url}
          title={previewPdf.title}
          fileName={previewPdf.fileName}
        />
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
