import React, { useState, useEffect, useMemo } from 'react';
import { useDebounce } from '../../hooks/useDebounce';
import {
  CheckCircle2,
  Printer,
  Search,
  Truck,
  Phone,
  User,
  Calendar,
  MapPin,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  Package,
  ChevronDown,
  ChevronUp,
  FileText,
  Eye,
  X,
  History,
  AlertCircle,
  Clock,
} from 'lucide-react';
import { formatCurrency } from '../DispatchManagement';
import { useServer } from '../../context/ServerContext';

export interface CompletedInvoice {
  id: number;
  invoice_number: string;
  invoice_date?: string;
  file_name?: string;
  file_url?: string;
  view_url?: string;
  file_size?: number;
  created_at?: string;
}

export interface CompletedDispatchHistoryItem {
  id: number;
  quotation_item_id: number;
  item_description: string;
  brand?: string;
  size?: string;
  ordered_quantity: number | string;
  dispatched_quantity: number | string;
  unit?: string;
  status: string;
  invoice_id?: number;
  invoice_number?: string;
  invoice_file_url?: string;
  invoice_view_url?: string;
  dispatched_at: string;
  created_by_name?: string;
}

export interface CompletedShipmentItem {
  id?: number;
  quotation_item_id: number;
  item_description: string;
  brand?: string;
  size?: string;
  quantity_sent: number;
  quoted_rate?: number;
  total_value?: number;
  status?: string;
}

export interface CompletedShipment {
  id: number;
  shipment_index: number;
  shipment_number: string;
  invoice_number?: string;
  dispatch_invoice_id?: number;
  invoice_pdf_url?: string;
  challan_number?: string;
  vehicle_number?: string;
  driver_name?: string;
  driver_phone?: string;
  supervisor_name?: string;
  dispatched_at: string;
  notes?: string;
  items: CompletedShipmentItem[];
}

export interface CompletedPendingItem {
  id: number;
  description: string;
  brand?: string;
  size?: string;
  unit?: string;
  pending_quantity: number;
  pending_sourcing_status?: string;
  expected_dispatch_date?: string;
  pending_notes?: string;
}

export interface CompletedRow {
  quotation_id: number;
  quotation_number: string;
  customer_name: string;
  customer_phone?: string;
  site_location?: string;
  delivery_address?: string;
  sales_person_name?: string;
  net_total: number | string;
  dispatch_number: string;
  challan_number: string;
  vehicle_no: string;
  driver_name: string;
  driver_phone: string;
  completed_date: string;
  dispatched_by_name: string;
  notes?: string;
  total_boxes: number;
  total_items: number;
  invoices?: CompletedInvoice[];
  total_invoices?: number;
  dispatch_history?: CompletedDispatchHistoryItem[];
  shipments?: CompletedShipment[];
  pending_items?: CompletedPendingItem[];
}

interface Props {
  completedList: CompletedRow[];
  loading: boolean;
  onRefresh: () => void;
  onPrintChallan: (quoteId: number) => void;
}

export const CompletedDispatchView: React.FC<Props> = ({
  completedList,
  loading,
  onRefresh,
  onPrintChallan,
}) => {
  const [search, setSearch] = useState('');
  const [expandedQuotes, setExpandedQuotes] = useState<Record<number, boolean>>({});
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);
  const [previewPdfBlobUrl, setPreviewPdfBlobUrl] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const { serverUrl } = useServer();

  const getInvoicePdfUrl = (invoice?: { id?: number; file_url?: string; view_url?: string } | null) => {
    if (!invoice) return '';
    const base = serverUrl || '';
    const token = localStorage.getItem('ama_token') || localStorage.getItem('token') || '';
    const tokenParam = token ? `token=${encodeURIComponent(token)}` : '';

    if (invoice.view_url) {
      const url = invoice.view_url.startsWith('http') ? invoice.view_url : `${base}${invoice.view_url}`;
      return tokenParam ? `${url}${url.includes('?') ? '&' : '?'}${tokenParam}` : url;
    }
    if (invoice.id) {
      const url = `${base}/api/dispatch/invoices/${invoice.id}/view-pdf`;
      return tokenParam ? `${url}?${tokenParam}` : url;
    }
    if (invoice.file_url) {
      if (invoice.file_url.startsWith('http://') || invoice.file_url.startsWith('https://')) {
        return invoice.file_url;
      }
      const url = `${base}${invoice.file_url.startsWith('/') ? '' : '/'}${invoice.file_url}`;
      return tokenParam ? `${url}${url.includes('?') ? '&' : '?'}${tokenParam}` : url;
    }
    return '';
  };

  useEffect(() => {
    if (!previewPdfUrl) {
      if (previewPdfBlobUrl) {
        URL.revokeObjectURL(previewPdfBlobUrl);
        setPreviewPdfBlobUrl(null);
      }
      setPdfError(null);
      setPdfLoading(false);
      return;
    }

    let isMounted = true;
    setPdfLoading(true);
    setPdfError(null);

    const token = localStorage.getItem('ama_token') || localStorage.getItem('token') || '';
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    fetch(previewPdfUrl, { headers })
      .then(async (res) => {
        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          throw new Error(`Server returned HTTP ${res.status}: ${errText || res.statusText}`);
        }
        const blob = await res.blob();
        if (isMounted) {
          const blobUrl = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
          setPreviewPdfBlobUrl(blobUrl);
          setPdfLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          console.error('Failed to load PDF preview:', err);
          setPdfError(err.message || 'Failed to load PDF document');
          setPdfLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [previewPdfUrl]);

  const toggleExpand = (quotationId: number) => {
    setExpandedQuotes((prev) => ({
      ...prev,
      [quotationId]: !prev[quotationId],
    }));
  };

  const debouncedSearch = useDebounce(search, 300);

  const filtered = useMemo(() => {
    const term = debouncedSearch.trim().toLowerCase();
    if (!term) return completedList;
    return completedList.filter((c) => {
      const matchInvoices = (c.invoices || []).some((inv) =>
        inv.invoice_number?.toLowerCase().includes(term)
      );
      const matchHistory = (c.dispatch_history || []).some(
        (h) =>
          h.item_description?.toLowerCase().includes(term) ||
          h.invoice_number?.toLowerCase().includes(term)
      );

      return (
        c.quotation_number?.toLowerCase().includes(term) ||
        c.challan_number?.toLowerCase().includes(term) ||
        c.customer_name?.toLowerCase().includes(term) ||
        c.customer_phone?.includes(term) ||
        c.vehicle_no?.toLowerCase().includes(term) ||
        c.driver_name?.toLowerCase().includes(term) ||
        matchInvoices ||
        matchHistory
      );
    });
  }, [completedList, debouncedSearch]);

  const totalDeliveredValue = useMemo(() => {
    return filtered.reduce((acc, c) => acc + parseFloat(String(c.net_total || 0)), 0);
  }, [filtered]);

  const totalBoxes = useMemo(() => {
    return filtered.reduce((acc, c) => acc + parseFloat(String(c.total_boxes || 0)), 0);
  }, [filtered]);

  return (
    <div className="flex-1 min-h-0 w-full flex flex-col gap-2 sm:gap-2.5 overflow-hidden">
      {/* Metrics Bar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 sm:gap-2.5 shrink-0">
        <div className="bg-white rounded-2xl p-2.5 sm:p-3 border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-[10px] sm:text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Dispatches Completed</div>
            <div className="text-xl sm:text-2xl font-black text-emerald-700 mt-0.5">{filtered.length}</div>
            <div className="text-[10px] text-emerald-600 font-semibold">100% Fulfilled & Delivered</div>
          </div>
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
            <CheckCircle2 size={18} />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-2.5 sm:p-3 border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-[10px] sm:text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Material Volume</div>
            <div className="text-xl sm:text-2xl font-black text-slate-900 mt-0.5">{Math.round(totalBoxes)}</div>
            <div className="text-[10px] text-slate-500 font-medium">Delivered Boxes / Units</div>
          </div>
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-700 shrink-0">
            <Package size={18} />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-2.5 sm:p-3 border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-[10px] sm:text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Value Delivered</div>
            <div className="text-lg sm:text-xl font-black text-slate-900 mt-0.5">₹ {formatCurrency(totalDeliveredValue)}</div>
            <div className="text-[10px] text-slate-500 font-medium">Successfully Fulfilled Orders</div>
          </div>
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
            <Truck size={18} />
          </div>
        </div>
      </div>

      {/* Search Toolbar */}
      <div className="bg-white rounded-2xl p-2 sm:p-2.5 border border-slate-200/80 shadow-xs flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="relative flex-1 min-w-[240px]">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search completed dispatches by invoice #, challan #, quote ref, customer, driver, item..."
            className="w-full pl-9 pr-3 py-1.5 sm:py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-hidden focus:ring-2 focus:ring-indigo-500/30 text-slate-900"
          />
        </div>

        <button
          onClick={onRefresh}
          className="inline-flex items-center space-x-1.5 px-3 py-1.5 sm:py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer transition-colors shrink-0"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          <span>Refresh Completed</span>
        </button>
      </div>

      {/* Archive Container with Isolated Scroll */}
      <div className="flex-1 min-h-0 w-full bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden flex flex-col">
        {loading ? (
          <div className="flex-1 min-h-0 flex items-center justify-center p-8 text-center text-slate-400 text-xs">
            <div>
              <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-indigo-600" />
              <span>Loading completed dispatches archive...</span>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex-1 min-h-0 flex items-center justify-center p-8 text-center text-slate-400 text-xs">
            <div>
              <CheckCircle2 size={32} className="mx-auto mb-2 text-slate-300" />
              <span>No completed dispatches match the search criteria.</span>
            </div>
          </div>
        ) : (
          <div className="flex-1 min-h-0 w-full overflow-x-auto overflow-y-auto scrollbar-thin">
            <table className="w-full min-w-[1000px] text-left border-collapse text-xs">
              <thead className="sticky top-0 bg-slate-50/95 backdrop-blur-xs z-10 shadow-xs">
                <tr className="text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                  <th className="py-2.5 px-3 w-10 text-center"></th>
                  <th className="py-2.5 px-3">Challan & Quote</th>
                  <th className="py-2.5 px-3">Customer & Destination</th>
                  <th className="py-2.5 px-3">Vehicle & Driver</th>
                  <th className="py-2.5 px-3 text-right">Delivered Units</th>
                  <th className="py-2.5 px-3 text-right">Order Value</th>
                  <th className="py-2.5 px-3">Tax Invoices</th>
                  <th className="py-2.5 px-3">Completed Date</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((c) => {
                  const isExpanded = !!expandedQuotes[c.quotation_id];
                  const invoiceCount = (c.invoices || []).length;
                  const historyCount = (c.dispatch_history || []).length;

                  return (
                    <React.Fragment key={c.quotation_id}>
                      <tr className={`hover:bg-slate-50/60 transition-colors ${isExpanded ? 'bg-indigo-50/20' : ''}`}>
                        {/* Expand / Collapse toggle */}
                        <td className="py-3 px-2 text-center">
                          <button
                            type="button"
                            onClick={() => toggleExpand(c.quotation_id)}
                            className="p-1 rounded-lg hover:bg-slate-200/80 text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
                            title={isExpanded ? 'Hide Delivery Audit Trail' : 'View Delivery Audit Trail & Invoices'}
                          >
                            {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                          </button>
                        </td>

                        <td className="py-3 px-3">
                          <div className="font-extrabold text-slate-900 font-mono text-xs flex items-center space-x-1.5">
                            <span className="text-emerald-700">{c.challan_number}</span>
                          </div>
                          <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                            Quote: <span className="font-bold text-slate-700">{c.quotation_number}</span>
                          </div>
                        </td>

                        <td className="py-3 px-3">
                          <div className="font-bold text-slate-900 flex items-center space-x-1">
                            <User size={12} className="text-slate-400" />
                            <span>{c.customer_name}</span>
                          </div>
                          <div className="text-[11px] text-slate-500 font-mono mt-0.5 flex items-center space-x-1">
                            <Phone size={11} className="text-slate-400" />
                            <span>{c.customer_phone || '-'}</span>
                          </div>
                          <div className="text-[10px] text-slate-500 truncate max-w-[200px] mt-0.5 flex items-center space-x-1">
                            <MapPin size={10} className="text-slate-400 shrink-0" />
                            <span title={c.delivery_address || c.site_location}>{c.delivery_address || c.site_location || 'Destination Site'}</span>
                          </div>
                        </td>

                        <td className="py-3 px-3">
                          <div className="font-bold text-slate-800 font-mono text-xs flex items-center space-x-1">
                            <Truck size={12} className="text-slate-500" />
                            <span>{c.vehicle_no || 'Standard Transport'}</span>
                          </div>
                          <div className="text-[11px] text-slate-600 mt-0.5">
                            {c.driver_name} {c.driver_phone && <span className="font-mono text-slate-400">({c.driver_phone})</span>}
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            Supervisor: {c.dispatched_by_name}
                          </div>
                        </td>

                        <td className="py-3 px-3 text-right font-mono font-bold text-emerald-800 text-xs">
                          {Math.round(c.total_boxes)} Boxes
                          <div className="text-[10px] text-slate-400 font-normal">{c.total_items} items</div>
                        </td>

                        <td className="py-3 px-3 text-right font-mono font-extrabold text-slate-900 text-xs">
                          ₹ {formatCurrency(c.net_total)}
                        </td>

                        {/* Tax Invoices Badge List */}
                        <td className="py-3 px-3">
                          {invoiceCount > 0 ? (
                            <div className="flex flex-wrap items-center gap-1">
                              {c.invoices!.map((inv) => (
                                <button
                                  key={inv.id}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setPreviewPdfUrl(getInvoicePdfUrl(inv));
                                  }}
                                  className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 font-mono text-[10px] font-bold hover:bg-emerald-100 transition-colors cursor-pointer"
                                  title={`Click to view Tax Invoice #${inv.invoice_number} PDF`}
                                >
                                  <FileText size={10} />
                                  <span>#{inv.invoice_number}</span>
                                  <Eye size={10} className="text-emerald-600" />
                                </button>
                              ))}
                            </div>
                          ) : (
                            <span className="text-[11px] text-slate-400 italic">No invoice PDF</span>
                          )}
                        </td>

                        <td className="py-3 px-3">
                          <div className="font-medium text-slate-700 flex items-center space-x-1">
                            <Calendar size={11} className="text-slate-400" />
                            <span>{new Date(c.completed_date).toLocaleDateString('en-IN')}</span>
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                            {new Date(c.completed_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </td>

                        <td className="py-3 px-3 text-right">
                          <div className="flex items-center justify-end space-x-1.5">
                            <button
                              onClick={() => toggleExpand(c.quotation_id)}
                              className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold text-xs cursor-pointer transition-colors shadow-2xs"
                              title="Toggle Full Audit Trail"
                            >
                              <History size={12} />
                              <span>Audit</span>
                            </button>
                            <button
                              onClick={() => onPrintChallan(c.quotation_id)}
                              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-black text-white font-bold text-xs shadow-2xs cursor-pointer transition-colors"
                            >
                              <Printer size={13} />
                              <span>Print Challan</span>
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Expandable Audit Trail & Itemized Breakdown */}
                      {isExpanded && (
                        <tr className="bg-slate-50/70 border-b border-slate-200">
                          <td colSpan={9} className="p-3 sm:p-4">
                            <div className="space-y-3.5">
                              {/* Header & Attached Tax Invoices Section */}
                              <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-200">
                                <div className="flex items-center space-x-2">
                                  <div className="w-6 h-6 rounded-md bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-xs">
                                    <CheckCircle2 size={14} />
                                  </div>
                                  <span className="font-extrabold text-slate-900 text-xs uppercase tracking-wider">
                                    Complete Delivery Audit Trail & Multi-Invoice Records ({c.quotation_number})
                                  </span>
                                </div>

                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-xs text-slate-500 font-medium">Attached Tax Invoices:</span>
                                  {invoiceCount > 0 ? (
                                    c.invoices!.map((inv) => (
                                      <div
                                        key={inv.id}
                                        className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-xl bg-white border border-emerald-300 text-emerald-900 shadow-2xs text-xs font-semibold"
                                      >
                                        <FileText size={12} className="text-emerald-700" />
                                        <span>Invoice #{inv.invoice_number}</span>
                                        {inv.invoice_date && (
                                          <span className="text-[10px] text-slate-500 font-mono">
                                            ({new Date(inv.invoice_date).toLocaleDateString('en-IN')})
                                          </span>
                                        )}
                                        {(inv.file_url || inv.view_url || inv.id) && (
                                          <button
                                            type="button"
                                            onClick={() => setPreviewPdfUrl(getInvoicePdfUrl(inv))}
                                            className="ml-1 inline-flex items-center space-x-0.5 text-indigo-600 hover:text-indigo-800 underline text-[11px] cursor-pointer"
                                          >
                                            <Eye size={11} />
                                            <span>View PDF</span>
                                          </button>
                                        )}
                                      </div>
                                    ))
                                  ) : (
                                    <span className="text-xs text-slate-400 italic">No attached Tax Invoices</span>
                                  )}
                                </div>
                              </div>

                              {/* Discrete Multi-Shipment Cards */}
                              {c.shipments && c.shipments.length > 0 ? (
                                <div className="space-y-3">
                                  <div className="text-[11px] font-bold text-slate-600 uppercase tracking-wider flex items-center justify-between">
                                    <div className="flex items-center space-x-1.5">
                                      <Truck size={13} className="text-emerald-700" />
                                      <span>Discrete Shipments Fulfilled ({c.shipments.length})</span>
                                    </div>
                                    <span className="text-[10px] text-slate-400 font-normal">Grouped per discrete tax invoice & delivery run</span>
                                  </div>

                                  <div className="space-y-3">
                                    {c.shipments.map((s, sIdx) => {
                                      const shipItems = s.items || [];
                                      const totalUnits = shipItems.reduce((acc, it) => acc + Number(it.quantity_sent || 0), 0);
                                      const totalValue = shipItems.reduce((acc, it) => acc + Number(it.total_value || 0), 0);

                                      return (
                                        <div key={s.id || sIdx} className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
                                          {/* Shipment Card Header */}
                                          <div className="bg-slate-50 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 border-b border-slate-200">
                                            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                                              <span className="font-extrabold text-slate-900 text-xs bg-emerald-100 text-emerald-900 px-2 py-0.5 rounded-lg border border-emerald-300">
                                                {s.shipment_number || `Shipment #${s.shipment_index}`}
                                              </span>
                                              {s.invoice_number ? (
                                                <span className="font-mono text-xs font-bold text-slate-800 bg-white px-2 py-0.5 rounded border border-slate-300">
                                                  Tax Invoice #{s.invoice_number}
                                                </span>
                                              ) : (
                                                <span className="text-xs text-slate-500 italic">Direct Delivery</span>
                                              )}
                                              {s.challan_number && (
                                                <span className="font-mono text-[11px] text-slate-600">
                                                  Challan: <span className="font-semibold text-slate-800">{s.challan_number}</span>
                                                </span>
                                              )}
                                              <div className="flex items-center space-x-1 text-[11px] text-slate-500">
                                                <Calendar size={11} className="text-slate-400" />
                                                <span>{s.dispatched_at ? new Date(s.dispatched_at).toLocaleDateString('en-IN') : '-'}</span>
                                              </div>
                                            </div>

                                            {/* Shipment Action Buttons */}
                                            <div className="flex items-center space-x-2">
                                              {(s.invoice_pdf_url || s.dispatch_invoice_id) && (
                                                <button
                                                  type="button"
                                                  onClick={() => setPreviewPdfUrl(getInvoicePdfUrl({ id: s.dispatch_invoice_id, file_url: s.invoice_pdf_url }))}
                                                  className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-[11px] border border-indigo-200 cursor-pointer shadow-2xs transition-colors"
                                                >
                                                  <Eye size={11} />
                                                  <span>View Invoice #{s.invoice_number} PDF</span>
                                                </button>
                                              )}
                                              <button
                                                type="button"
                                                onClick={() => onPrintChallan(c.quotation_id)}
                                                className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-black text-white font-bold text-[11px] cursor-pointer shadow-2xs transition-colors"
                                              >
                                                <Printer size={11} />
                                                <span>Print Challan</span>
                                              </button>
                                            </div>
                                          </div>

                                          {/* Vehicle & Logistics Metadata Bar */}
                                          <div className="px-3.5 py-1.5 bg-slate-50/40 text-[11px] text-slate-600 flex flex-wrap items-center gap-3 border-b border-slate-100">
                                            <span>Vehicle: <strong className="text-slate-800">{s.vehicle_number || c.vehicle_no || 'Standard Transport'}</strong></span>
                                            <span className="text-slate-300">•</span>
                                            <span>Driver: <strong className="text-slate-800">{s.driver_name || c.driver_name || '-'}</strong> {s.driver_phone ? `(${s.driver_phone})` : ''}</span>
                                            <span className="text-slate-300">•</span>
                                            <span>Supervisor: <strong className="text-slate-800">{s.supervisor_name || c.dispatched_by_name || 'Admin'}</strong></span>
                                          </div>

                                          {/* Shipment Items Table */}
                                          <table className="w-full text-left text-xs border-collapse">
                                            <thead className="bg-slate-50/80 text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-100">
                                              <tr>
                                                <th className="py-2 px-3 w-10 text-center">#</th>
                                                <th className="py-2 px-3">Item Description</th>
                                                <th className="py-2 px-3">Brand & Size</th>
                                                <th className="py-2 px-3 text-right">Dispatched Qty</th>
                                                <th className="py-2 px-3 text-right">Quoted Rate</th>
                                                <th className="py-2 px-3 text-right">Total Value</th>
                                                <th className="py-2 px-3 text-center">Status</th>
                                              </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                              {shipItems.map((it, idx) => (
                                                <tr key={it.id || idx} className="hover:bg-slate-50/50">
                                                  <td className="py-2 px-3 text-center text-slate-400 font-mono">{idx + 1}</td>
                                                  <td className="py-2 px-3 font-semibold text-slate-900">{it.item_description}</td>
                                                  <td className="py-2 px-3 text-slate-600 font-mono text-[11px]">
                                                    {it.brand ? `${it.brand} • ` : ''}{it.size || '-'}
                                                  </td>
                                                  <td className="py-2 px-3 text-right font-mono font-bold text-emerald-800">
                                                    {Math.round(Number(it.quantity_sent || 0))} boxes
                                                  </td>
                                                  <td className="py-2 px-3 text-right font-mono text-slate-600">
                                                    {formatCurrency(Number(it.quoted_rate || 0))}
                                                  </td>
                                                  <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">
                                                    {formatCurrency(Number(it.total_value || 0))}
                                                  </td>
                                                  <td className="py-2 px-3 text-center">
                                                    <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                                      <CheckCircle2 size={10} />
                                                      <span>Dispatched</span>
                                                    </span>
                                                  </td>
                                                </tr>
                                              ))}
                                            </tbody>
                                            <tfoot className="bg-slate-50 font-bold text-xs border-t border-slate-200">
                                              <tr>
                                                <td colSpan={3} className="py-2 px-3 text-right text-slate-600">Shipment Run Total:</td>
                                                <td className="py-2 px-3 text-right font-mono text-emerald-800">{Math.round(totalUnits)} boxes</td>
                                                <td></td>
                                                <td className="py-2 px-3 text-right font-mono text-slate-900">{formatCurrency(totalValue)}</td>
                                                <td></td>
                                              </tr>
                                            </tfoot>
                                          </table>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              ) : (
                                /* Fallback: Legacy Itemized Delivery Breakdown */
                                <div>
                                  <div className="text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1.5 flex items-center space-x-1">
                                    <Package size={12} className="text-slate-500" />
                                    <span>Itemized Delivery Breakdown (Slices Fulfilled)</span>
                                  </div>

                                  {historyCount > 0 ? (
                                    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
                                      <table className="w-full text-left text-xs border-collapse">
                                        <thead className="bg-slate-100 text-[10px] font-bold text-slate-600 uppercase tracking-wider border-b border-slate-200">
                                          <tr>
                                            <th className="py-2 px-3">Item Description</th>
                                            <th className="py-2 px-3">Brand & Size</th>
                                            <th className="py-2 px-3 text-right">Quoted Qty</th>
                                            <th className="py-2 px-3 text-right">Delivered Qty</th>
                                            <th className="py-2 px-3">Tax Invoice #</th>
                                            <th className="py-2 px-3">Dispatched Date & Time</th>
                                            <th className="py-2 px-3">Supervisor</th>
                                            <th className="py-2 px-3 text-center">Status</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                          {c.dispatch_history!.map((h, hIdx) => (
                                            <tr key={h.id || hIdx} className="hover:bg-slate-50/50">
                                              <td className="py-2.5 px-3 font-semibold text-slate-900">
                                                {h.item_description}
                                              </td>
                                              <td className="py-2.5 px-3 text-slate-600 font-mono text-[11px]">
                                                {h.brand ? `${h.brand} • ` : ''}{h.size || '-'}
                                              </td>
                                              <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                                                {Math.round(Number(h.ordered_quantity || 0))} {h.unit || 'boxes'}
                                              </td>
                                              <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-800">
                                                {Math.round(Number(h.dispatched_quantity || 0))} {h.unit || 'boxes'}
                                              </td>
                                              <td className="py-2.5 px-3 font-mono font-bold text-slate-800">
                                                {h.invoice_number ? (
                                                  <button
                                                    type="button"
                                                    onClick={() => setPreviewPdfUrl(getInvoicePdfUrl({ id: h.invoice_id, file_url: h.invoice_file_url, view_url: h.invoice_view_url }))}
                                                    className="inline-flex items-center space-x-1 text-emerald-700 hover:text-emerald-900 underline cursor-pointer"
                                                  >
                                                    <span>#{h.invoice_number}</span>
                                                    {(h.invoice_file_url || h.invoice_view_url || h.invoice_id) && <Eye size={10} />}
                                                  </button>
                                                ) : (
                                                  <span className="text-slate-400">-</span>
                                                )}
                                              </td>
                                              <td className="py-2.5 px-3 text-slate-600 font-mono text-[11px]">
                                                {h.dispatched_at ? new Date(h.dispatched_at).toLocaleString('en-IN') : '-'}
                                              </td>
                                              <td className="py-2.5 px-3 text-slate-600 text-[11px]">
                                                {h.created_by_name || c.dispatched_by_name}
                                              </td>
                                              <td className="py-2.5 px-3 text-center">
                                                <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                                  <CheckCircle2 size={10} />
                                                  <span>Delivered</span>
                                                </span>
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  ) : (
                                    <div className="bg-white rounded-xl border border-slate-200 p-3 text-xs text-slate-500 italic text-center">
                                      All {c.total_items} items fulfilled under Challan #{c.challan_number}.
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Upcoming / Scheduled Remaining Fulfillment */}
                              {c.pending_items && c.pending_items.length > 0 && (
                                <div className="bg-amber-50/70 rounded-xl border border-amber-200 p-3 sm:p-3.5 space-y-2.5 shadow-2xs">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center space-x-2">
                                      <Clock size={14} className="text-amber-700" />
                                      <span className="font-extrabold text-amber-950 text-xs uppercase tracking-wider">
                                        Upcoming Shipment • Scheduled Remaining Fulfillment ({c.pending_items.length} Pending Items)
                                      </span>
                                    </div>
                                    <span className="text-[10px] font-bold text-amber-800 bg-amber-200/70 px-2 py-0.5 rounded-md">
                                      Pending Godown / Sourcing Balance
                                    </span>
                                  </div>

                                  <div className="bg-white rounded-lg border border-amber-200 overflow-hidden">
                                    <table className="w-full text-left text-xs border-collapse">
                                      <thead className="bg-amber-100/50 text-[10px] font-bold text-amber-900 uppercase tracking-wider border-b border-amber-200">
                                        <tr>
                                          <th className="py-2 px-3">Pending Item</th>
                                          <th className="py-2 px-3">Brand & Size</th>
                                          <th className="py-2 px-3 text-right">Pending Quantity</th>
                                          <th className="py-2 px-3 text-center">Remaining Sourcing Channel</th>
                                          <th className="py-2 px-3 text-right">Target Available / Dispatch Date</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-amber-100">
                                        {c.pending_items.map((pi, pIdx) => (
                                          <tr key={pi.id || pIdx} className="hover:bg-amber-50/30">
                                            <td className="py-2.5 px-3 font-semibold text-slate-900">{pi.description}</td>
                                            <td className="py-2.5 px-3 text-slate-600 font-mono text-[11px]">
                                              {pi.brand ? `${pi.brand} • ` : ''}{pi.size || '-'}
                                            </td>
                                            <td className="py-2.5 px-3 text-right font-mono font-bold text-amber-900">
                                              {Math.round(Number(pi.pending_quantity || 0))} {pi.unit || 'boxes'}
                                            </td>
                                            <td className="py-2.5 px-3 text-center">
                                              <span
                                                className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                                                  pi.pending_sourcing_status === 'LOCAL_ARRANGE'
                                                    ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                                    : pi.pending_sourcing_status === 'FACTORY_ORDER'
                                                    ? 'bg-indigo-100 text-indigo-800 border border-indigo-300'
                                                    : 'bg-blue-100 text-blue-800 border border-blue-300'
                                                }`}
                                              >
                                                {pi.pending_sourcing_status === 'LOCAL_ARRANGE'
                                                  ? 'Local Arrange (Dealer)'
                                                  : pi.pending_sourcing_status === 'FACTORY_ORDER'
                                                  ? 'Factory Order (Morbi/Plant)'
                                                  : 'Ready Stock (Godown)'}
                                              </span>
                                            </td>
                                            <td className="py-2.5 px-3 text-right font-mono text-slate-700">
                                              {pi.expected_dispatch_date ? (
                                                <span className="font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                                                  {new Date(pi.expected_dispatch_date).toLocaleDateString('en-IN')}
                                                </span>
                                              ) : (
                                                <span className="text-slate-400 italic">Not scheduled yet</span>
                                              )}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* PDF Preview Modal */}
      {previewPdfUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/80 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl h-[88vh] flex flex-col overflow-hidden">
            <div className="p-3 sm:p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-2">
                <FileText size={16} className="text-emerald-600" />
                <span className="font-extrabold text-slate-900 text-sm">Tax Invoice PDF Viewer</span>
                <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold">
                  Verified Tax Invoice
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <a
                  href={previewPdfBlobUrl || previewPdfUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold cursor-pointer transition"
                  title="Open PDF in a new browser tab"
                >
                  <ExternalLink size={13} />
                  <span>Open in New Tab</span>
                </a>
                <button
                  onClick={() => setPreviewPdfUrl(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition cursor-pointer"
                  title="Close Preview"
                >
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className="flex-1 min-h-0 bg-slate-100 relative overflow-hidden">
              {pdfLoading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/95 z-20">
                  <RefreshCw className="animate-spin text-emerald-600 mb-3" size={32} />
                  <p className="text-xs font-bold text-slate-700">Loading Tax Invoice PDF...</p>
                  <p className="text-[11px] text-slate-400 mt-1">Preparing verified document stream</p>
                </div>
              )}
              {pdfError ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-50 p-6 text-center z-20">
                  <AlertCircle className="text-rose-500 mb-3" size={44} />
                  <p className="text-sm font-bold text-slate-800 mb-1">Unable to preview PDF document in-app</p>
                  <p className="text-xs text-rose-600 max-w-md mb-4 bg-rose-50 p-2.5 rounded-lg border border-rose-200 font-mono">
                    {pdfError}
                  </p>
                  <div className="flex items-center space-x-3">
                    <a
                      href={previewPdfUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center space-x-1.5 px-4 py-2 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 transition"
                    >
                      <ExternalLink size={13} />
                      <span>Open Direct Link in New Tab</span>
                    </a>
                    <button
                      onClick={() => {
                        const url = previewPdfUrl;
                        setPreviewPdfUrl(null);
                        setTimeout(() => setPreviewPdfUrl(url), 50);
                      }}
                      className="px-3 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-bold transition cursor-pointer"
                    >
                      Retry
                    </button>
                  </div>
                </div>
              ) : previewPdfBlobUrl ? (
                <iframe
                  src={previewPdfBlobUrl}
                  className="w-full h-full border-none"
                  title="Tax Invoice Preview"
                />
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
