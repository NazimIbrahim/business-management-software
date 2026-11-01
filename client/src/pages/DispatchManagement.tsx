import React, { useState, useEffect, useMemo } from 'react';
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
  ExternalLink,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';

export const DISPATCH_STATUS_OPTIONS = [
  'Ready Stock',
  'Need to Arrange from Local',
  'Factory Order',
  'Dispatched',
] as const;

export type DispatchStatusType = (typeof DISPATCH_STATUS_OPTIONS)[number];

interface DispatchStats {
  total_closed_quotations: number;
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
  const [statusFilter, setStatusFilter] = useState<string>('all');
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
      if (statusFilter !== 'all') params.append('dispatch_status', statusFilter);
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
  }, [debouncedSearch, statusFilter, dateFilter]);

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
      alert(err.message || 'Failed to load quotation dispatch details');
      setSelectedQuotationId(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleOpenDetail = (q: Quotation) => {
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
      // Check if every individual item has a date
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
  const renderStatusBadge = (status?: string) => {
    switch (status) {
      case 'Ready Stock':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-xs">
            <CheckCircle2 size={11} className="text-emerald-600" />
            <span>Ready Stock</span>
          </span>
        );
      case 'Need to Arrange from Local':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300 shadow-xs">
            <Package size={11} className="text-amber-700" />
            <span>Arrange Local</span>
          </span>
        );
      case 'Factory Order':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-100 text-indigo-900 border border-indigo-300 shadow-xs">
            <Factory size={11} className="text-indigo-700" />
            <span>Factory Order</span>
          </span>
        );
      case 'Dispatched':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-teal-800 text-teal-50 border border-teal-900 shadow-xs">
            <Truck size={11} className="text-teal-200" />
            <span>Dispatched</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-300">
            <span>{status || 'Ready Stock'}</span>
          </span>
        );
    }
  };

  // Check if expected date is today or overdue
  const getDateStatusBadge = (dateStr?: string | null, isDispatched: boolean = false) => {
    if (!dateStr) {
      return (
        <span className="text-rose-600 font-semibold text-[11px] flex items-center space-x-1">
          <AlertTriangle size={12} />
          <span>Date Required</span>
        </span>
      );
    }

    if (isDispatched) {
      return (
        <span className="text-emerald-700 font-semibold text-[11px] flex items-center space-x-1">
          <CheckCircle2 size={12} />
          <span>Completed</span>
        </span>
      );
    }

    const today = new Date().toISOString().split('T')[0];
    if (dateStr < today) {
      return (
        <span className="text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded text-[10px] font-bold flex items-center space-x-1">
          <AlertTriangle size={10} />
          <span>Overdue</span>
        </span>
      );
    }
    if (dateStr === today) {
      return (
        <span className="text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded text-[10px] font-bold flex items-center space-x-1">
          <Clock size={10} />
          <span>Due Today</span>
        </span>
      );
    }

    return (
      <span className="text-slate-600 text-[11px] flex items-center space-x-1">
        <Calendar size={11} className="text-slate-400" />
        <span>{new Date(dateStr).toLocaleDateString('en-GB')}</span>
      </span>
    );
  };

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-7xl mx-auto w-full">
      {/* Header Banner */}
      <div className="card p-5 bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white shadow-lg border border-slate-700/60 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-teal-500/20 border border-teal-400/40 flex items-center justify-center text-teal-300 shadow-inner">
              <Truck size={20} />
            </div>
            <div>
              <h1 className="text-lg md:text-xl font-extrabold tracking-tight">Dispatch Management</h1>
              <p className="text-xs text-slate-300">
                Closed Quotations Fulfillment • Track stock readiness, local arrangements, factory orders & delivery dates
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={loadData}
            disabled={loading}
            className="btn btn-secondary btn-sm bg-white/10 hover:bg-white/20 text-white border border-white/20 text-xs flex items-center space-x-1.5 cursor-pointer"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* KPI Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="card p-3 bg-white border border-slate-200 shadow-xs flex flex-col justify-between">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Closed Orders</span>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-xl font-extrabold text-slate-900">{stats.total_closed_quotations}</span>
              <span className="text-[10px] text-slate-400 font-medium">{stats.total_items} items</span>
            </div>
          </div>

          <div className="card p-3 bg-white border border-emerald-200 shadow-xs flex flex-col justify-between">
            <span className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wider flex items-center space-x-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              <span>Ready Stock</span>
            </span>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-xl font-extrabold text-emerald-800">{stats.ready_stock_count}</span>
              <span className="text-[10px] text-emerald-600 font-medium">available</span>
            </div>
          </div>

          <div className="card p-3 bg-white border border-amber-200 shadow-xs flex flex-col justify-between">
            <span className="text-[11px] font-semibold text-amber-700 uppercase tracking-wider flex items-center space-x-1">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
              <span>Arrange Local</span>
            </span>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-xl font-extrabold text-amber-800">{stats.local_arrange_count}</span>
              <span className="text-[10px] text-amber-600 font-medium">pending</span>
            </div>
          </div>

          <div className="card p-3 bg-white border border-indigo-200 shadow-xs flex flex-col justify-between">
            <span className="text-[11px] font-semibold text-indigo-700 uppercase tracking-wider flex items-center space-x-1">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
              <span>Factory Order</span>
            </span>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-xl font-extrabold text-indigo-800">{stats.factory_order_count}</span>
              <span className="text-[10px] text-indigo-600 font-medium">in transit</span>
            </div>
          </div>

          <div className="card p-3 bg-white border border-teal-200 shadow-xs flex flex-col justify-between">
            <span className="text-[11px] font-semibold text-teal-800 uppercase tracking-wider flex items-center space-x-1">
              <span className="w-1.5 h-1.5 rounded-full bg-teal-600"></span>
              <span>Dispatched</span>
            </span>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-xl font-extrabold text-teal-900">{stats.dispatched_count}</span>
              <span className="text-[10px] text-teal-700 font-medium">completed</span>
            </div>
          </div>

          <div className="card p-3 bg-white border border-rose-200 shadow-xs flex flex-col justify-between">
            <span className="text-[11px] font-semibold text-rose-700 uppercase tracking-wider flex items-center space-x-1">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span>
              <span>Overdue</span>
            </span>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-xl font-extrabold text-rose-800">{stats.overdue_count}</span>
              <span className="text-[10px] text-rose-600 font-medium">need action</span>
            </div>
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="card p-3.5 bg-white border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
          <div className="relative w-full md:w-80">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search quotation #, customer, phone, site..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input input-sm pl-9 pr-3 w-full text-xs"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5 w-full md:w-auto">
            <span className="text-[11px] font-bold text-slate-500 uppercase mr-1">Status:</span>
            {['all', 'Ready Stock', 'Need to Arrange from Local', 'Factory Order', 'Dispatched'].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                  statusFilter === st
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {st === 'all' ? 'All Statuses' : st === 'Need to Arrange from Local' ? 'Arrange Local' : st}
              </button>
            ))}
          </div>

          <div className="flex items-center space-x-1 w-full md:w-auto">
            <span className="text-[11px] font-bold text-slate-500 uppercase mr-1">Date:</span>
            {[
              { id: 'all', label: 'All Dates' },
              { id: 'today', label: 'Due Today' },
              { id: 'this_week', label: 'This Week' },
              { id: 'overdue', label: 'Overdue' },
            ].map((d) => (
              <button
                key={d.id}
                onClick={() => setDateFilter(d.id as any)}
                className={`px-2 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  dateFilter === d.id
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Closed Quotations List */}
      <div className="space-y-3">
        {loading ? (
          <div className="card p-12 text-center text-slate-500">
            <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-slate-400" />
            <p className="text-xs font-medium">Loading closed quotation orders...</p>
          </div>
        ) : quotations.length === 0 ? (
          <div className="card p-12 text-center text-slate-400 bg-white border border-slate-200">
            <Truck size={36} className="mx-auto mb-2 text-slate-300" />
            <p className="text-sm font-semibold text-slate-700">No Closed Quotations Found</p>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              When a quotation is marked as <strong>Closed</strong> in the quotation workflow, it will immediately appear here for dispatch tracking, stock readiness, and delivery scheduling.
            </p>
          </div>
        ) : (
          quotations.map((q) => {
            const isSelected = selectedQuotationId === q.id;
            const totalItems = q.total_items || 0;
            const dispatchedCount = q.dispatched_items_count || 0;
            const readyCount = q.ready_stock_items_count || 0;
            const localCount = q.local_arrange_items_count || 0;
            const factoryCount = q.factory_order_items_count || 0;
            const percentDispatched = totalItems > 0 ? Math.round((dispatchedCount / totalItems) * 100) : 0;
            const isFullyDispatched = totalItems > 0 && dispatchedCount === totalItems;

            return (
              <div
                key={q.id}
                className={`card bg-white border transition-all duration-200 overflow-hidden shadow-xs ${
                  isSelected
                    ? 'border-indigo-400 ring-2 ring-indigo-200/50 shadow-md'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                {/* Quotation Order Summary Row */}
                <div className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  {/* Left: Quotation Identity & Customer */}
                  <div className="space-y-1.5 flex-1 min-w-[280px]">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-extrabold text-sm text-slate-900 bg-slate-100 px-2.5 py-0.5 rounded border border-slate-300">
                        {q.quotation_number}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded uppercase font-bold tracking-wider bg-slate-800 text-white">
                        {q.quotation_type || 'tiles'}
                      </span>
                      {renderStatusBadge(q.dispatch_status)}
                    </div>

                    <div className="text-xs text-slate-800">
                      <span className="font-bold text-sm text-slate-900">{q.customer_name}</span>
                      {q.customer_phone && (
                        <a
                          href={`tel:${q.customer_phone}`}
                          className="ml-2 inline-flex items-center text-indigo-600 hover:text-indigo-800 font-semibold"
                        >
                          <Phone size={11} className="mr-0.5" />
                          <span>{q.customer_phone}</span>
                        </a>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center text-[11px] text-slate-500 gap-x-3 gap-y-1">
                      {q.site_location && (
                        <span className="flex items-center text-slate-600">
                          <MapPin size={11} className="mr-0.5 text-slate-400" />
                          <span>Site: {q.site_location}</span>
                        </span>
                      )}
                      {q.project_name && (
                        <span className="text-slate-500">Project: {q.project_name}</span>
                      )}
                      <span>Sales: {q.sales_person_name}</span>
                    </div>
                  </div>

                  {/* Middle: Expected Date & Delivery Progress */}
                  <div className="space-y-2 lg:w-72">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500 font-medium">Expected Dispatch:</span>
                      <div>{getDateStatusBadge(q.expected_dispatch_date, isFullyDispatched)}</div>
                    </div>

                    {/* Fulfillment Progress Bar */}
                    <div>
                      <div className="flex justify-between items-center text-[10px] text-slate-600 font-bold mb-1">
                        <span>Fulfillment: {dispatchedCount} of {totalItems} items dispatched</span>
                        <span className={isFullyDispatched ? 'text-teal-700' : 'text-indigo-600'}>
                          {percentDispatched}%
                        </span>
                      </div>
                      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-200 flex">
                        <div
                          style={{ width: `${percentDispatched}%` }}
                          className={`h-full transition-all duration-300 ${
                            isFullyDispatched ? 'bg-teal-600' : 'bg-indigo-600'
                          }`}
                        />
                      </div>
                    </div>

                    {/* Stock status pills */}
                    <div className="flex flex-wrap gap-1 text-[10px]">
                      {readyCount > 0 && (
                        <span className="px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                          {readyCount} Ready Stock
                        </span>
                      )}
                      {localCount > 0 && (
                        <span className="px-1.5 py-0.2 rounded bg-amber-50 text-amber-800 border border-amber-200">
                          {localCount} Arrange Local
                        </span>
                      )}
                      {factoryCount > 0 && (
                        <span className="px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-800 border border-indigo-200">
                          {factoryCount} Factory Order
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Right: Actions */}
                  <div className="flex items-center space-x-2 shrink-0">
                    <button
                      onClick={() => handleOpenDetail(q)}
                      className={`btn btn-sm text-xs font-bold px-3.5 py-2 rounded-xl flex items-center space-x-1.5 cursor-pointer ${
                        isSelected
                          ? 'bg-slate-900 text-white hover:bg-slate-800 shadow-sm'
                          : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200'
                      }`}
                    >
                      <Truck size={14} />
                      <span>{isSelected ? 'Collapse' : 'Manage Dispatch'}</span>
                      {isSelected ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                  </div>
                </div>

                {/* EXPANDED ITEM-LEVEL DISPATCH EDITOR */}
                {isSelected && (
                  <div className="border-t border-indigo-100 bg-slate-50/70 p-4 md:p-6 space-y-5 animate-fade-in">
                    {detailLoading ? (
                      <div className="p-8 text-center text-slate-500">
                        <RefreshCw size={20} className="animate-spin mx-auto mb-2 text-indigo-500" />
                        <p className="text-xs">Loading order items for dispatch update...</p>
                      </div>
                    ) : (
                      <>
                        {/* Validation & Success Alerts */}
                        {validationError && (
                          <div className="bg-rose-50 border border-rose-300 rounded-xl p-3 text-xs text-rose-800 flex items-start space-x-2 animate-shake">
                            <AlertTriangle size={16} className="text-rose-600 shrink-0 mt-0.5" />
                            <div className="flex-1">
                              <span className="font-bold">Cannot Save: </span>
                              <span>{validationError}</span>
                            </div>
                            <button
                              onClick={() => setValidationError(null)}
                              className="text-rose-400 hover:text-rose-600"
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

                        {/* Top Quotation-Level Controls */}
                        <div className="card p-4 bg-white border border-slate-200 shadow-xs space-y-3">
                          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                            <h3 className="font-bold text-xs uppercase tracking-wider text-slate-700 flex items-center space-x-1.5">
                              <Truck size={14} className="text-indigo-600" />
                              <span>Quotation Dispatch Settings</span>
                            </h3>
                            <button
                              type="button"
                              onClick={() => setIsPrintSlipOpen(true)}
                              className="btn btn-secondary btn-xs text-[11px] flex items-center space-x-1 text-slate-700 hover:text-slate-900"
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
                                className="input input-sm text-xs font-semibold w-full"
                              >
                                {DISPATCH_STATUS_OPTIONS.map((opt) => (
                                  <option key={opt} value={opt}>
                                    {opt}
                                  </option>
                                ))}
                              </select>
                              <div className="flex items-center space-x-1 mt-1">
                                <span className="text-[10px] text-slate-400">Quick set all:</span>
                                <button
                                  type="button"
                                  onClick={() => handleApplyStatusToAllItems(overallStatus as any)}
                                  className="text-[10px] text-indigo-600 hover:text-indigo-800 font-bold underline"
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
                                    className="text-[10px] text-indigo-600 hover:text-indigo-800 font-bold underline"
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
                                  !overallDate && validationError ? 'border-rose-400 ring-2 ring-rose-200' : ''
                                }`}
                                required
                              />
                              <p className="text-[10px] text-slate-400 mt-1">
                                Must be mentioned when saving dispatch status.
                              </p>
                            </div>

                            {/* Dispatch Notes / Vehicle Info */}
                            <div>
                              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                                Dispatch Notes & Vehicle Details
                              </label>
                              <input
                                type="text"
                                placeholder="Driver contact, vehicle number, dispatch remarks..."
                                value={overallNotes}
                                onChange={(e) => setOverallNotes(e.target.value)}
                                className="input input-sm text-xs w-full"
                              />
                            </div>
                          </div>
                        </div>

                        {/* Specific Items Dispatch Management Table */}
                        <div className="card overflow-hidden bg-white border border-slate-200 shadow-xs">
                          <div className="px-4 py-2.5 bg-slate-100/80 border-b border-slate-200 flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-800">
                              Specific Items in Quotation ({activeItems.length})
                            </span>
                            <span className="text-[11px] text-slate-500">
                              Update individual item stock status and expected date
                            </span>
                          </div>

                          <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs border-collapse">
                              <thead>
                                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-bold text-[11px] uppercase tracking-wider">
                                  <th className="py-2.5 px-3 w-10 text-center">#</th>
                                  <th className="py-2.5 px-3 min-w-[220px]">Item Description</th>
                                  <th className="py-2.5 px-3 w-28">Area / Section</th>
                                  <th className="py-2.5 px-3 w-24 text-right">Quantity</th>
                                  <th className="py-2.5 px-3 w-48">Status *</th>
                                  <th className="py-2.5 px-3 w-40">Expected Date *</th>
                                  <th className="py-2.5 px-3 min-w-[160px]">Remarks / Location</th>
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
                                      <td className="py-2.5 px-3 text-slate-600 font-medium">
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
                                          className={`input input-sm text-xs font-semibold w-full ${
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
                                          placeholder="Supplier, godown rack, or notes..."
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
                        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
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

                          <div className="flex items-center space-x-2.5 w-full sm:w-auto justify-end">
                            <button
                              type="button"
                              onClick={() => setSelectedQuotationId(null)}
                              className="btn btn-secondary btn-sm text-xs px-3 py-2 text-slate-700"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={handleSaveDispatch}
                              disabled={saving}
                              className="btn btn-primary btn-sm text-xs px-4 py-2 font-bold flex items-center space-x-1.5 shadow-sm cursor-pointer bg-emerald-600 hover:bg-emerald-700 text-white border-none"
                            >
                              <Save size={14} className={saving ? 'animate-spin' : ''} />
                              <span>{saving ? 'Saving...' : 'Save Dispatch Status & Dates'}</span>
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
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
                className="text-slate-400 hover:text-slate-600"
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
                className="btn btn-secondary btn-sm text-xs"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="btn btn-primary btn-sm text-xs font-bold flex items-center space-x-1.5"
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
