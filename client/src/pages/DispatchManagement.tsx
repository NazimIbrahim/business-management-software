import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useServer } from '../context/ServerContext';
import { Quotation, QuotationItem } from '../types';
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
} from 'lucide-react';

export const DISPATCH_STATUS_OPTIONS = [
  'Ready Stock',
  'Need to Arrange from Local',
  'Factory Order',
  'Dispatched',
] as const;

export type DispatchStatusType = (typeof DISPATCH_STATUS_OPTIONS)[number];

interface DispatchStats {
  total_orders?: number;
  total_closed_quotations: number;
  approved_count?: number;
  closed_count?: number;
  total_items: number;
  ready_stock_count: number;
  local_arrange_count: number;
  factory_order_count: number;
  dispatched_count: number;
  overdue_count: number;
}

export const DispatchManagement: React.FC = () => {
  const { user } = useAuth();
  const { fetchApi, subscribeToEvents } = useServer();

  const [loading, setLoading] = useState<boolean>(true);
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [stats, setStats] = useState<DispatchStats | null>(null);

  // Filters
  const [search, setSearch] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [quotationStatusFilter, setQuotationStatusFilter] = useState<'all' | 'approved' | 'closed'>('all');
  const [dispatchStatusFilter, setDispatchStatusFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'this_week' | 'overdue'>('all');

  // Active / Selected Quotation for Editing
  const [selectedQuotationId, setSelectedQuotationId] = useState<number | null>(null);
  const [detailLoading, setDetailLoading] = useState<boolean>(false);
  const [activeQuotation, setActiveQuotation] = useState<Quotation | null>(null);
  const [activeItems, setActiveItems] = useState<QuotationItem[]>([]);

  // Form State for Active Quotation
  const [overallStatus, setOverallStatus] = useState<string>('Ready Stock');
  const [overallDate, setOverallDate] = useState<string>('');
  const [overallNotes, setOverallNotes] = useState<string>('');
  const [editedItems, setEditedItems] = useState<Record<number, { status: string; date: string; notes: string }>>({});
  const [saving, setSaving] = useState<boolean>(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);

  // Print Slip Modal State
  const [isPrintSlipOpen, setIsPrintSlipOpen] = useState<boolean>(false);

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
      if (quotationStatusFilter !== 'all') params.append('quotation_status', quotationStatusFilter);
      if (dispatchStatusFilter !== 'all') params.append('dispatch_status', dispatchStatusFilter);
      if (dateFilter !== 'all') params.append('filter_date', dateFilter);

      const [quotesRes, statsRes] = await Promise.all([
        fetchApi<any>(`/api/dispatch/quotations?${params.toString()}`),
        fetchApi<any>('/api/dispatch/stats'),
      ]);

      setQuotations(quotesRes.quotations || []);
      setStats(statsRes || null);
    } catch (err: any) {
      console.error('Error loading dispatch data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [debouncedSearch, quotationStatusFilter, dispatchStatusFilter, dateFilter]);

  // Real-time synchronization
  useEffect(() => {
    const unsubscribe = subscribeToEvents((event) => {
      if (['DISPATCH_UPDATED', 'QUOTATION_STATUS_CHANGED'].includes(event.type)) {
        loadData();
        if (selectedQuotationId && event.payload?.quotation_id === selectedQuotationId) {
          loadQuotationDetail(selectedQuotationId);
        }
      }
    });
    return () => unsubscribe();
  }, [selectedQuotationId]);

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

      const qStatus = res.quotation?.dispatch_status || 'Ready Stock';
      const qDate = res.quotation?.expected_dispatch_date
        ? String(res.quotation.expected_dispatch_date).split('T')[0]
        : '';
      const qNotes = res.quotation?.dispatch_notes || '';

      setOverallStatus(qStatus);
      setOverallDate(qDate);
      setOverallNotes(qNotes);

      // Initialize item form states
      const itemMap: Record<number, { status: string; date: string; notes: string }> = {};
      itemsList.forEach((it) => {
        if (it.id) {
          itemMap[it.id] = {
            status: it.dispatch_status || qStatus || 'Ready Stock',
            date: it.expected_dispatch_date
              ? String(it.expected_dispatch_date).split('T')[0]
              : qDate,
            notes: it.dispatch_notes || '',
          };
        }
      });
      setEditedItems(itemMap);
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
        updated[numKey] = {
          ...updated[numKey],
          status,
        };
      });
      return updated;
    });
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
      return {
        id: it.id,
        dispatch_status: state?.status || overallStatus,
        expected_dispatch_date: state?.date || overallDate,
        dispatch_notes: state?.notes || '',
      };
    });

    try {
      setSaving(true);
      await fetchApi(`/api/dispatch/quotations/${selectedQuotationId}`, {
        method: 'PUT',
        body: JSON.stringify({
          expected_dispatch_date: overallDate,
          dispatch_status: overallStatus,
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
            <span>{status || 'Ready Stock'}</span>
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

    return (
      <span className="text-slate-600 text-[11px] font-medium inline-flex items-center space-x-1">
        <Calendar size={11} className="text-slate-400" />
        <span>{new Date(dateStr).toLocaleDateString('en-GB')}</span>
      </span>
    );
  };

  const hasActiveFilters =
    Boolean(search) ||
    quotationStatusFilter !== 'all' ||
    dispatchStatusFilter !== 'all' ||
    dateFilter !== 'all';

  const handleClearFilters = () => {
    setSearch('');
    setDebouncedSearch('');
    setQuotationStatusFilter('all');
    setDispatchStatusFilter('all');
    setDateFilter('all');
  };

  const totalOrdersCount = stats?.total_orders ?? stats?.total_closed_quotations ?? quotations.length;

  return (
    <div className="flex-1 p-4 sm:p-5 lg:p-6 space-y-4 overflow-y-auto w-full min-w-0">
      {/* Formal Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-teal-400 shadow-sm shrink-0">
            <Truck size={20} />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
                Dispatch Management
              </h1>
              <span className="px-2 py-0.5 text-[10px] font-extrabold uppercase rounded bg-teal-100 text-teal-900 border border-teal-300">
                Fulfillment
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Order Fulfillment & Delivery Tracking • Approved & Closed Quotations Pipeline
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2 self-start sm:self-auto">
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

      {/* Formal KPI Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Total Orders */}
        <div className="card p-3.5 bg-white border border-slate-200 shadow-xs border-l-4 border-l-slate-700 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Orders Pipeline
            </span>
            <Truck size={14} className="text-slate-400" />
          </div>
          <div className="mt-2">
            <div className="text-2xl font-black text-slate-900 leading-tight">
              {totalOrdersCount}
            </div>
            <div className="text-[10px] text-slate-500 font-medium mt-0.5 truncate">
              {stats?.approved_count || 0} Approved • {stats?.closed_count || 0} Closed
            </div>
          </div>
        </div>

        {/* Ready Stock */}
        <div className="card p-3.5 bg-white border border-slate-200 shadow-xs border-l-4 border-l-emerald-600 flex flex-col justify-between">
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
              Items available in godown
            </div>
          </div>
        </div>

        {/* Arrange Local */}
        <div className="card p-3.5 bg-white border border-slate-200 shadow-xs border-l-4 border-l-amber-500 flex flex-col justify-between">
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
        <div className="card p-3.5 bg-white border border-slate-200 shadow-xs border-l-4 border-l-indigo-600 flex flex-col justify-between">
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
              Under production / transit
            </div>
          </div>
        </div>

        {/* Dispatched */}
        <div className="card p-3.5 bg-white border border-slate-200 shadow-xs border-l-4 border-l-teal-600 flex flex-col justify-between">
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
        <div className="card p-3.5 bg-white border border-slate-200 shadow-xs border-l-4 border-l-rose-500 flex flex-col justify-between">
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
            {/* Quotation Workflow Status Filter */}
            <div className="w-full sm:w-48">
              <select
                value={quotationStatusFilter}
                onChange={(e) => setQuotationStatusFilter(e.target.value as any)}
                className={`select select-sm w-full text-xs font-semibold cursor-pointer ${
                  quotationStatusFilter !== 'all'
                    ? 'border-indigo-500 bg-indigo-50/50 text-indigo-950 font-bold'
                    : 'text-slate-700'
                }`}
              >
                <option value="all">All Orders (Approved & Closed)</option>
                <option value="approved">Approved Orders Only</option>
                <option value="closed">Closed Orders Only</option>
              </select>
            </div>

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
                <option value="Ready Stock">Ready Stock</option>
                <option value="Need to Arrange from Local">Need to Arrange Local</option>
                <option value="Factory Order">Factory Order</option>
                <option value="Dispatched">Dispatched</option>
              </select>
            </div>

            {/* Date Filter */}
            <div className="w-full sm:w-36">
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
                <option value="this_week">Due This Week</option>
                <option value="overdue">Overdue</option>
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
                    <p className="text-sm font-semibold text-slate-700">No Quotation Orders for Dispatch Found</p>
                    <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                      When a quotation is Approved by the Store Manager or Closed, it will immediately appear here for dispatch tracking, stock readiness, and delivery scheduling.
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
                          isSelected
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
                          {isApproved ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                              Approved
                            </span>
                          ) : isClosed ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-100 border border-slate-700">
                              Closed
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-700 border border-slate-300 capitalize">
                              {q.status}
                            </span>
                          )}
                        </td>

                        {/* 6. Dispatch Stage */}
                        <td className="py-3 px-3 text-center align-middle whitespace-nowrap">
                          {renderDispatchBadge(q.dispatch_status)}
                        </td>

                        {/* 7. Expected Date */}
                        <td className="py-3 px-3 text-center align-middle whitespace-nowrap">
                          {getDateStatusBadge(q.expected_dispatch_date, isFullyDispatched)}
                        </td>

                        {/* 8. Fulfillment Progress */}
                        <td className="py-3 px-3.5 align-middle">
                          <div className="flex items-center justify-between text-[10px] text-slate-600 font-bold mb-1">
                            <span>{dispatchedCount}/{totalItems} items</span>
                            <span className={isFullyDispatched ? 'text-teal-700' : 'text-indigo-600'}>
                              {percentDispatched}%
                            </span>
                          </div>
                          <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                            <div
                              style={{ width: `${percentDispatched}%` }}
                              className={`h-full transition-all duration-300 ${
                                isFullyDispatched ? 'bg-teal-600' : 'bg-indigo-600'
                              }`}
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
                                        onChange={(e) => setOverallStatus(e.target.value)}
                                        className="select select-sm text-xs font-semibold w-full cursor-pointer"
                                      >
                                        {DISPATCH_STATUS_OPTIONS.map((opt) => (
                                          <option key={opt} value={opt}>
                                            {opt}
                                          </option>
                                        ))}
                                      </select>
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
                                    </div>

                                    {/* Overall Expected Dispatch Date */}
                                    <div>
                                      <div className="flex items-center justify-between mb-1">
                                        <label className="text-[11px] font-bold text-slate-700 flex items-center space-x-1">
                                          <span>Expected Dispatch Date</span>
                                          <span className="text-rose-500 font-bold">*</span>
                                        </label>
                                        {overallDate && (
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
                                        onChange={(e) => {
                                          setOverallDate(e.target.value);
                                          setValidationError(null);
                                        }}
                                        className={`input input-sm text-xs w-full font-mono ${
                                          !overallDate && validationError
                                            ? 'border-rose-400 ring-2 ring-rose-200'
                                            : ''
                                        }`}
                                        required
                                      />
                                      <p className="text-[10px] text-slate-400 mt-1">
                                        Required when saving dispatch status.
                                      </p>
                                    </div>

                                    {/* Dispatch Notes / Vehicle Info */}
                                    <div>
                                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                                        Dispatch Notes & Vehicle Details <span className="font-normal text-slate-400">(Optional)</span>
                                      </label>
                                      <input
                                        type="text"
                                        placeholder="Optional driver contact, vehicle number, dispatch remarks..."
                                        value={overallNotes}
                                        onChange={(e) => setOverallNotes(e.target.value)}
                                        className="input input-sm text-xs w-full"
                                      />
                                    </div>
                                  </div>
                                </div>

                                {/* Items Breakdown Table */}
                                <div className="card overflow-hidden bg-white border border-slate-200 shadow-xs">
                                  <div className="px-3.5 py-2 bg-slate-100/90 border-b border-slate-200 flex items-center justify-between">
                                    <span className="text-xs font-bold text-slate-800">
                                      Quotation Line Items ({activeItems.length})
                                    </span>
                                    <span className="text-[11px] text-slate-500">
                                      Update stock status & expected dispatch date per item
                                    </span>
                                  </div>

                                  <div className="overflow-x-auto">
                                    <table className="w-full text-left text-xs border-collapse">
                                      <thead>
                                        <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-bold text-[10px] uppercase tracking-wider">
                                          <th className="py-2.5 px-3 w-10 text-center">#</th>
                                          <th className="py-2.5 px-3 min-w-[220px]">Item Description</th>
                                          <th className="py-2.5 px-3 w-28">Area / Section</th>
                                          <th className="py-2.5 px-3 w-24 text-right">Quantity</th>
                                          <th className="py-2.5 px-3 w-48">Status *</th>
                                          <th className="py-2.5 px-3 w-40">Expected Date *</th>
                                          <th className="py-2.5 px-3 min-w-[170px]">Location / Supplier Remarks (Optional)</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100">
                                        {activeItems.map((item, idx) => {
                                          const itemId = item.id || idx;
                                          const itemState = editedItems[itemId] || {
                                            status: item.dispatch_status || 'Ready Stock',
                                            date: item.expected_dispatch_date
                                              ? String(item.expected_dispatch_date).split('T')[0]
                                              : overallDate,
                                            notes: item.dispatch_notes || '',
                                          };

                                          const isItemMissingDate = !itemState.date && !overallDate;

                                          return (
                                            <tr key={itemId} className="hover:bg-slate-50/80 transition-colors">
                                              <td className="py-2.5 px-3 text-center text-slate-400 font-mono text-[11px]">
                                                {idx + 1}
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
                                              <td className="py-2.5 px-3">
                                                <select
                                                  value={itemState.status}
                                                  onChange={(e) => {
                                                    const newStatus = e.target.value;
                                                    setEditedItems((prev) => ({
                                                      ...prev,
                                                      [itemId]: {
                                                        ...itemState,
                                                        status: newStatus,
                                                      },
                                                    }));
                                                  }}
                                                  className={`select select-sm text-xs font-semibold w-full cursor-pointer ${
                                                    itemState.status === 'Ready Stock'
                                                      ? 'text-emerald-700 bg-emerald-50/50 border-emerald-200'
                                                      : itemState.status === 'Need to Arrange from Local'
                                                      ? 'text-amber-800 bg-amber-50/50 border-amber-200'
                                                      : itemState.status === 'Factory Order'
                                                      ? 'text-indigo-800 bg-indigo-50/50 border-indigo-200'
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
                                                  onChange={(e) => {
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
                                                    isItemMissingDate && validationError
                                                      ? 'border-rose-400 ring-2 ring-rose-200'
                                                      : ''
                                                  }`}
                                                  required
                                                />
                                              </td>
                                              <td className="py-2.5 px-3">
                                                <input
                                                  type="text"
                                                  placeholder="Optional rack, supplier, or notes..."
                                                  value={itemState.notes}
                                                  onChange={(e) => {
                                                    const newNotes = e.target.value;
                                                    setEditedItems((prev) => ({
                                                      ...prev,
                                                      [itemId]: {
                                                        ...itemState,
                                                        notes: newNotes,
                                                      },
                                                    }));
                                                  }}
                                                  className="input input-sm text-xs w-full"
                                                />
                                              </td>
                                            </tr>
                                          );
                                        })}
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
                                      Cancel
                                    </button>
                                    <button
                                      type="button"
                                      onClick={handleSaveDispatch}
                                      disabled={saving}
                                      className="btn btn-primary btn-sm text-xs px-4 py-1.5 font-bold flex items-center space-x-1.5 shadow-sm cursor-pointer bg-emerald-600 hover:bg-emerald-700 text-white border-none"
                                    >
                                      <Save size={13} className={saving ? 'animate-spin' : ''} />
                                      <span>{saving ? 'Saving...' : 'Save Dispatch Details'}</span>
                                    </button>
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
                          <td className="py-2 px-2.5 font-semibold text-[11px]">{st || 'Ready Stock'}</td>
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
    </div>
  );
};
