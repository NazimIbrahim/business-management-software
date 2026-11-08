import React, { useState } from 'react';
import {
  Clock,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  Truck,
  ArrowRight,
  ExternalLink,
  ShieldCheck,
  Package,
  Factory,
  RefreshCw,
  User,
  Phone,
  MapPin,
  Calendar,
} from 'lucide-react';
import { formatCurrency } from '../DispatchManagement';

interface QuotationRow {
  id: number;
  quotation_number: string;
  quotation_type?: string;
  customer_name: string;
  customer_phone?: string;
  site_location?: string;
  delivery_address?: string;
  sales_person_name?: string;
  net_total: number | string;
  quotation_status: string;
  dispatch_status: string;
  expected_dispatch_date?: string;
  scheduled_dispatch_date?: string;
  closed_at?: string;
  total_items: number;
  ready_items: number;
  local_items: number;
  factory_items: number;
  dispatched_items: number;
  total_ordered_qty: number;
  total_dispatched_qty: number;
  verified_paid: number | string;
  unverified_paid: number | string;
  balance_due: number | string;
  payment_status: 'CLEARED' | 'PARTIAL' | 'PENDING';
}

interface Props {
  quotations: QuotationRow[];
  loading: boolean;
  onRefresh: () => void;
  onInitiateDispatch: (quote: QuotationRow) => void;
  canEdit: boolean;
}

export const AllClosedView: React.FC<Props> = ({
  quotations,
  loading,
  onRefresh,
  onInitiateDispatch,
  canEdit,
}) => {
  const [search, setSearch] = useState('');
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'cleared' | 'partial' | 'pending'>('all');

  const filtered = quotations.filter((q) => {
    const term = search.toLowerCase();
    const matchSearch =
      q.quotation_number?.toLowerCase().includes(term) ||
      q.customer_name?.toLowerCase().includes(term) ||
      q.customer_phone?.includes(term) ||
      q.site_location?.toLowerCase().includes(term) ||
      q.sales_person_name?.toLowerCase().includes(term);

    const matchPay = paymentFilter === 'all' || q.payment_status.toLowerCase() === paymentFilter;
    return matchSearch && matchPay;
  });

  const totalValue = filtered.reduce((acc, q) => acc + parseFloat(String(q.net_total || 0)), 0);
  const totalVerifiedPaid = filtered.reduce((acc, q) => acc + parseFloat(String(q.verified_paid || 0)), 0);
  const totalUnits = filtered.reduce((acc, q) => acc + parseFloat(String(q.total_ordered_qty || 0)), 0);

  return (
    <div className="space-y-4">
      {/* Top Banner & KPI metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3.5">
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">FIFO Pending Queue</div>
            <div className="text-2xl font-black text-slate-900 mt-1">{filtered.length}</div>
            <div className="text-[10px] text-indigo-600 font-semibold mt-0.5">Ordered First-In, First-Out</div>
          </div>
          <div className="w-11 h-11 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
            <Clock size={20} />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Queue Value</div>
            <div className="text-xl font-black text-slate-900 mt-1">₹ {formatCurrency(totalValue)}</div>
            <div className="text-[10px] text-slate-500 font-medium mt-0.5">{filtered.length} closed quotations</div>
          </div>
          <div className="w-11 h-11 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-700">
            <Truck size={20} />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Verified Payments Received</div>
            <div className="text-xl font-black text-emerald-700 mt-1">₹ {formatCurrency(totalVerifiedPaid)}</div>
            <div className="text-[10px] text-emerald-600 font-medium mt-0.5">Cleared into company accounts</div>
          </div>
          <div className="w-11 h-11 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
            <ShieldCheck size={20} />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Material Units</div>
            <div className="text-2xl font-black text-slate-900 mt-1">{Math.round(totalUnits)}</div>
            <div className="text-[10px] text-slate-500 font-medium mt-0.5">Boxes / Units awaiting delivery</div>
          </div>
          <div className="w-11 h-11 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600">
            <Package size={20} />
          </div>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="bg-white rounded-2xl p-3 border border-slate-200/80 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-2 flex-1 min-w-[260px]">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by quote ref (#), customer name, contact, site location, salesperson..."
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-hidden focus:ring-2 focus:ring-indigo-500/30 text-slate-900"
            />
          </div>
          <select
            value={paymentFilter}
            onChange={(e: any) => setPaymentFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 font-medium focus:outline-hidden"
          >
            <option value="all">All Payment Statuses</option>
            <option value="cleared">Cleared Payments Only</option>
            <option value="partial">Partially Paid</option>
            <option value="pending">Pending Payments</option>
          </select>
        </div>

        <button
          onClick={onRefresh}
          className="inline-flex items-center space-x-1.5 px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer transition-colors"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          <span>Refresh Queue</span>
        </button>
      </div>

      {/* Data Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400 text-xs">
            <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-indigo-600" />
            Loading FIFO closed quotations queue...
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs">
            <CheckCircle2 size={32} className="mx-auto mb-2 text-emerald-500 opacity-60" />
            No closed quotations waiting in the FIFO dispatch queue.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <th className="py-3 px-3 text-center w-12">FIFO #</th>
                  <th className="py-3 px-3">Quotation & Type</th>
                  <th className="py-3 px-3">Customer & Site</th>
                  <th className="py-3 px-3">Order Value</th>
                  <th className="py-3 px-3">Payment Status</th>
                  <th className="py-3 px-3">Material Status</th>
                  <th className="py-3 px-3">Closed Date</th>
                  <th className="py-3 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((q, idx) => {
                  const verifiedPaidNum = parseFloat(String(q.verified_paid || 0));
                  const netTotalNum = parseFloat(String(q.net_total || 0));
                  const isCleared = verifiedPaidNum >= netTotalNum - 0.5;
                  const hasShortfall = !isCleared;

                  return (
                    <tr key={q.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3 px-3 text-center">
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-100 text-slate-700 font-black text-[11px]">
                          {idx + 1}
                        </span>
                      </td>

                      <td className="py-3 px-3">
                        <div className="font-bold text-slate-900 font-mono flex items-center space-x-1.5">
                          <span>{q.quotation_number}</span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-slate-100 font-sans font-semibold text-slate-600 border border-slate-200 capitalize">
                            {q.quotation_type || 'tiles'}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          Assigned: <span className="font-semibold text-slate-700">{q.sales_person_name || 'Direct'}</span>
                        </div>
                      </td>

                      <td className="py-3 px-3">
                        <div className="font-bold text-slate-900 flex items-center space-x-1">
                          <User size={12} className="text-slate-400" />
                          <span>{q.customer_name}</span>
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono mt-0.5 flex items-center space-x-1">
                          <Phone size={11} className="text-slate-400" />
                          <span>{q.customer_phone || '-'}</span>
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5 truncate max-w-[220px] flex items-center space-x-1">
                          <MapPin size={10} className="text-slate-400 shrink-0" />
                          <span title={q.delivery_address || q.site_location}>{q.delivery_address || q.site_location || 'Site Address'}</span>
                        </div>
                      </td>

                      <td className="py-3 px-3">
                        <div className="font-extrabold text-slate-900 font-mono text-[13px]">
                          ₹ {formatCurrency(q.net_total)}
                        </div>
                        <div className="text-[10px] text-slate-500 font-medium">
                          {q.total_items} items ({Math.round(q.total_ordered_qty || 0)} boxes)
                        </div>
                      </td>

                      <td className="py-3 px-3">
                        <div className="flex items-center space-x-1.5">
                          {isCleared ? (
                            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                              <ShieldCheck size={11} />
                              <span>Cleared (100%)</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-200">
                              <AlertCircle size={11} />
                              <span>₹ {formatCurrency(q.balance_due)} Due</span>
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono mt-1">
                          Paid: ₹ {formatCurrency(q.verified_paid)}
                        </div>
                      </td>

                      <td className="py-3 px-3">
                        <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
                          {q.ready_items > 0 && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
                              {q.ready_items} Ready
                            </span>
                          )}
                          {q.local_items > 0 && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200">
                              {q.local_items} Local
                            </span>
                          )}
                          {q.factory_items > 0 && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200">
                              {q.factory_items} Factory
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-500 mt-1 font-semibold">
                          Stage: <span className="capitalize">{q.dispatch_status}</span>
                        </div>
                      </td>

                      <td className="py-3 px-3">
                        <div className="text-[11px] font-medium text-slate-700 flex items-center space-x-1">
                          <Calendar size={11} className="text-slate-400" />
                          <span>{q.closed_at ? new Date(q.closed_at).toLocaleDateString('en-IN') : '-'}</span>
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                          {q.closed_at ? new Date(q.closed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                        </div>
                      </td>

                      <td className="py-3 px-3 text-right">
                        <button
                          onClick={() => onInitiateDispatch(q)}
                          className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-xs cursor-pointer transition-all hover:shadow-md"
                        >
                          <Truck size={13} />
                          <span>Initiate / Review</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
