import React, { useState } from 'react';
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
} from 'lucide-react';
import { formatCurrency } from '../DispatchManagement';

export interface CompletedInvoice {
  id: number;
  invoice_number: string;
  invoice_date?: string;
  file_name?: string;
  file_url?: string;
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
  dispatched_at: string;
  created_by_name?: string;
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

  const toggleExpand = (quotationId: number) => {
    setExpandedQuotes((prev) => ({
      ...prev,
      [quotationId]: !prev[quotationId],
    }));
  };

  const filtered = completedList.filter((c) => {
    const term = search.toLowerCase();
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

  const totalDeliveredValue = filtered.reduce((acc, c) => acc + parseFloat(String(c.net_total || 0)), 0);
  const totalBoxes = filtered.reduce((acc, c) => acc + parseFloat(String(c.total_boxes || 0)), 0);

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
            <table className="w-full text-left border-collapse text-xs">
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
                                    if (inv.file_url) setPreviewPdfUrl(inv.file_url);
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
                                        {inv.file_url && (
                                          <button
                                            type="button"
                                            onClick={() => setPreviewPdfUrl(inv.file_url!)}
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

                              {/* Itemized Delivery Slices Table */}
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
                                                  onClick={() => h.invoice_file_url && setPreviewPdfUrl(h.invoice_file_url)}
                                                  className="inline-flex items-center space-x-1 text-emerald-700 hover:text-emerald-900 underline cursor-pointer"
                                                >
                                                  <span>#{h.invoice_number}</span>
                                                  {h.invoice_file_url && <Eye size={10} />}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl h-[90vh] flex flex-col overflow-hidden">
            <div className="p-3 sm:p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-2">
                <FileText size={16} className="text-indigo-600" />
                <span className="font-extrabold text-slate-900 text-sm">Tax Invoice PDF Viewer</span>
              </div>
              <div className="flex items-center space-x-2">
                <a
                  href={previewPdfUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-semibold cursor-pointer"
                >
                  <ExternalLink size={12} />
                  <span>Open in New Tab</span>
                </a>
                <button
                  onClick={() => setPreviewPdfUrl(null)}
                  className="p-1.5 rounded-xl hover:bg-slate-200 text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
            <div className="flex-1 min-h-0 bg-slate-100">
              <iframe
                src={previewPdfUrl}
                title="Tax Invoice Preview"
                className="w-full h-full border-none"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
