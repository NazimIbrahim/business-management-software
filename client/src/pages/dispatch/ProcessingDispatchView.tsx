import React, { useState } from 'react';
import {
  Truck,
  Package,
  Layers,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Search,
  Calendar,
  Phone,
  User,
  MapPin,
  Clock,
  Printer,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { formatCurrency } from '../DispatchManagement';

interface ProcessingItem {
  id: number;
  quotation_id: number;
  area_name?: string;
  description: string;
  brand?: string;
  size?: string;
  product_type?: string;
  ordered_quantity: number;
  quantity_dispatched: number;
  remaining_quantity: number;
  dispatch_status: string;
  procurement_status?: string;
  expected_dispatch_date?: string;
  item_image?: string;
}

interface ProcessingQuotation {
  id: number;
  quotation_number: string;
  customer_name: string;
  customer_phone?: string;
  site_location?: string;
  delivery_address?: string;
  sales_person_name?: string;
  net_total: number | string;
  dispatch_status: string;
  expected_dispatch_date?: string;
  scheduled_dispatch_date?: string;
  dispatch_notes?: string;
  verified_paid: number | string;
  balance_due: number | string;
  vehicle_no?: string;
  driver_name?: string;
  driver_phone?: string;
  challan_number?: string;
  items: ProcessingItem[];
  total_ordered_qty: number;
  total_dispatched_qty: number;
  progress_percent: number;
  all_items_dispatched: boolean;
}

interface Props {
  dispatches: ProcessingQuotation[];
  loading: boolean;
  onRefresh: () => void;
  onRecordPartial: (quote: ProcessingQuotation, item: ProcessingItem) => void;
  onPrintChallan: (quoteId: number) => void;
  canEdit: boolean;
}

export const ProcessingDispatchView: React.FC<Props> = ({
  dispatches,
  loading,
  onRefresh,
  onRecordPartial,
  onPrintChallan,
  canEdit,
}) => {
  const [search, setSearch] = useState('');
  const [expandedQuotes, setExpandedQuotes] = useState<{ [key: number]: boolean }>({});

  const toggleExpand = (id: number) => {
    setExpandedQuotes((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const filtered = dispatches.filter((d) => {
    const term = search.toLowerCase();
    return (
      d.quotation_number?.toLowerCase().includes(term) ||
      d.customer_name?.toLowerCase().includes(term) ||
      d.customer_phone?.includes(term) ||
      d.site_location?.toLowerCase().includes(term) ||
      d.vehicle_no?.toLowerCase().includes(term)
    );
  });

  return (
    <div className="space-y-4">
      {/* Top Controls */}
      <div className="bg-white rounded-2xl p-3 border border-slate-200/80 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-2 flex-1 min-w-[260px]">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search active dispatches by quote #, customer, vehicle, site..."
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-hidden focus:ring-2 focus:ring-indigo-500/30 text-slate-900"
            />
          </div>
        </div>

        <button
          onClick={onRefresh}
          className="inline-flex items-center space-x-1.5 px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer transition-colors"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          <span>Refresh Active</span>
        </button>
      </div>

      {loading ? (
        <div className="p-12 text-center text-slate-400 text-xs bg-white rounded-2xl border border-slate-200">
          <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-indigo-600" />
          Loading active processing dispatches...
        </div>
      ) : filtered.length === 0 ? (
        <div className="p-12 text-center text-slate-400 text-xs bg-white rounded-2xl border border-slate-200">
          <CheckCircle2 size={32} className="mx-auto mb-2 text-emerald-500 opacity-60" />
          No dispatches currently in processing. All items are either dispatched or yet to be sourced.
        </div>
      ) : (
        <div className="space-y-3.5">
          {filtered.map((d) => {
            const isExpanded = expandedQuotes[d.id] ?? true; // default expanded
            const pct = d.progress_percent || 0;

            let barColor = 'bg-amber-500';
            if (pct >= 100) barColor = 'bg-emerald-500';
            else if (pct >= 50) barColor = 'bg-indigo-600';

            return (
              <div key={d.id} className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden transition-all">
                {/* Quotation Header Bar */}
                <div className="p-4 bg-slate-50/70 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center space-x-3">
                    <button
                      onClick={() => toggleExpand(d.id)}
                      className="p-1 rounded-lg hover:bg-slate-200 text-slate-600 cursor-pointer"
                    >
                      {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-extrabold text-sm text-slate-900 font-mono">{d.quotation_number}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
                          {d.dispatch_status}
                        </span>
                        {d.challan_number && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-mono font-bold bg-slate-200/80 text-slate-700">
                            Challan: {d.challan_number}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center space-x-3 text-xs text-slate-600 mt-0.5">
                        <span className="font-semibold text-slate-800 flex items-center space-x-1">
                          <User size={11} className="text-slate-400" />
                          <span>{d.customer_name}</span>
                        </span>
                        <span className="text-slate-400">|</span>
                        <span className="font-mono flex items-center space-x-1">
                          <Phone size={11} className="text-slate-400" />
                          <span>{d.customer_phone || '-'}</span>
                        </span>
                        <span className="text-slate-400">|</span>
                        <span className="truncate max-w-[200px] flex items-center space-x-1">
                          <MapPin size={11} className="text-slate-400" />
                          <span>{d.delivery_address || d.site_location || 'Site Location'}</span>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Progress & Quick Actions */}
                  <div className="flex items-center space-x-4">
                    {/* Live Progress Bar */}
                    <div className="text-right min-w-[140px]">
                      <div className="flex items-center justify-between text-[11px] font-bold mb-1">
                        <span className="text-slate-500">Fulfillment:</span>
                        <span className="text-slate-900 font-mono">{pct}%</span>
                      </div>
                      <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${barColor} transition-all duration-500 rounded-full`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                        {Math.round(d.total_dispatched_qty)} / {Math.round(d.total_ordered_qty)} Units
                      </div>
                    </div>

                    <button
                      onClick={() => onPrintChallan(d.id)}
                      className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-semibold cursor-pointer shadow-2xs"
                      title="Print / View Delivery Challan Note"
                    >
                      <Printer size={13} className="text-slate-500" />
                      <span>Challan</span>
                    </button>
                  </div>
                </div>

                {/* Expanded Line Items Table */}
                {isExpanded && (
                  <div className="p-3 overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                          <th className="py-2 px-2.5 w-10 text-center">#</th>
                          <th className="py-2 px-2.5">Item Description & Specs</th>
                          <th className="py-2 px-2.5">Room / Area</th>
                          <th className="py-2 px-2.5 text-center">Sourcing Status</th>
                          <th className="py-2 px-2.5 text-right">Ordered</th>
                          <th className="py-2 px-2.5 text-right">Dispatched</th>
                          <th className="py-2 px-2.5 text-right">Remaining</th>
                          <th className="py-2 px-2.5 text-right w-44">Fulfill / Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {d.items.map((it, idx) => {
                          const isFullyDispatched = it.dispatch_status === 'Dispatched';
                          const isReady = it.dispatch_status === 'Ready Stock';

                          return (
                            <tr key={it.id} className="hover:bg-slate-50/50">
                              <td className="py-2.5 px-2.5 text-center text-slate-400 font-mono">{idx + 1}</td>
                              <td className="py-2.5 px-2.5">
                                <div className="font-semibold text-slate-900">{it.description}</div>
                                <div className="text-[10px] text-slate-500 font-mono flex items-center space-x-2 mt-0.5">
                                  {it.brand && <span>Brand: {it.brand}</span>}
                                  {it.size && <span>Size: {it.size}</span>}
                                </div>
                              </td>
                              <td className="py-2.5 px-2.5 text-slate-600 font-medium text-[11px]">
                                {it.area_name || 'General Area'}
                              </td>
                              <td className="py-2.5 px-2.5 text-center">
                                <span
                                  className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                    isFullyDispatched
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : isReady
                                      ? 'bg-blue-100 text-blue-800'
                                      : it.dispatch_status === 'Need to Arrange from Local'
                                      ? 'bg-amber-100 text-amber-800'
                                      : it.dispatch_status === 'Factory Order'
                                      ? 'bg-indigo-100 text-indigo-800'
                                      : 'bg-slate-100 text-slate-700'
                                  }`}
                                >
                                  {it.dispatch_status}
                                </span>
                              </td>
                              <td className="py-2.5 px-2.5 text-right font-mono font-semibold text-slate-800">
                                {Math.round(it.ordered_quantity)} {it.product_type || 'boxes'}
                              </td>
                              <td className="py-2.5 px-2.5 text-right font-mono font-bold text-emerald-700">
                                {Math.round(it.quantity_dispatched)} {it.product_type || 'boxes'}
                              </td>
                              <td className="py-2.5 px-2.5 text-right font-mono font-bold text-amber-700">
                                {Math.round(it.remaining_quantity)} {it.product_type || 'boxes'}
                              </td>
                              <td className="py-2.5 px-2.5 text-right">
                                {isFullyDispatched ? (
                                  <span className="inline-flex items-center space-x-1 text-[11px] font-bold text-emerald-600">
                                    <CheckCircle2 size={13} />
                                    <span>Completed</span>
                                  </span>
                                ) : canEdit ? (
                                  <button
                                    onClick={() => onRecordPartial(d, it)}
                                    className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] shadow-2xs cursor-pointer transition-colors"
                                  >
                                    <Truck size={12} />
                                    <span>Record Dispatch</span>
                                  </button>
                                ) : (
                                  <span className="text-[11px] text-slate-400">View Only</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
