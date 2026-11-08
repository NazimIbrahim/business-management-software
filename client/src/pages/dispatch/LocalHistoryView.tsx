import React, { useState } from 'react';
import {
  Package,
  Search,
  RefreshCw,
  Calendar,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  Building2,
  FileText,
} from 'lucide-react';
import { formatCurrency } from '../DispatchManagement';

interface LocalHistoryRow {
  quotation_item_id: number;
  quotation_id: number;
  quotation_number: string;
  customer_name: string;
  description: string;
  brand?: string;
  size?: string;
  quantity: number;
  quoted_rate: number;
  actual_purchase_rate: number;
  variance_per_unit: number;
  total_margin_variance: number;
  vendor_name: string;
  invoice_number?: string;
  delivery_date: string;
  purchase_status: string;
  notes?: string;
}

interface Props {
  history: LocalHistoryRow[];
  loading: boolean;
  onRefresh: () => void;
}

export const LocalHistoryView: React.FC<Props> = ({
  history,
  loading,
  onRefresh,
}) => {
  const [search, setSearch] = useState('');

  const filtered = history.filter((h) => {
    const term = search.toLowerCase();
    return (
      h.description?.toLowerCase().includes(term) ||
      h.vendor_name?.toLowerCase().includes(term) ||
      h.quotation_number?.toLowerCase().includes(term) ||
      h.customer_name?.toLowerCase().includes(term) ||
      h.invoice_number?.toLowerCase().includes(term)
    );
  });

  const totalSpend = filtered.reduce((acc, h) => acc + (h.actual_purchase_rate || h.quoted_rate) * h.quantity, 0);
  const totalVariance = filtered.reduce((acc, h) => acc + (h.total_margin_variance || 0), 0);

  return (
    <div className="flex-1 min-h-0 w-full flex flex-col gap-2 sm:gap-2.5 overflow-hidden">
      {/* Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 sm:gap-2.5 shrink-0">
        <div className="bg-white rounded-2xl p-2.5 sm:p-3 border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-[10px] sm:text-[11px] font-bold text-slate-500 uppercase tracking-wider">Completed Purchases</div>
            <div className="text-xl sm:text-2xl font-black text-slate-900 mt-0.5">{filtered.length}</div>
            <div className="text-[10px] text-slate-500 font-medium">Procured from local distributors</div>
          </div>
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-700 shrink-0">
            <Package size={18} />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-2.5 sm:p-3 border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-[10px] sm:text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Local Procurement Spend</div>
            <div className="text-lg sm:text-xl font-black text-slate-900 mt-0.5">₹ {formatCurrency(totalSpend)}</div>
            <div className="text-[10px] text-slate-500 font-medium">Actual purchase expenditures</div>
          </div>
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600 shrink-0">
            <Building2 size={18} />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-2.5 sm:p-3 border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-[10px] sm:text-[11px] font-bold text-slate-500 uppercase tracking-wider">Procurement Variance Margin</div>
            <div className={`text-lg sm:text-xl font-black mt-0.5 ${totalVariance >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
              ₹ {formatCurrency(totalVariance)}
            </div>
            <div className="text-[10px] text-slate-500 font-medium">Quoted vs Actual Purchase Rate</div>
          </div>
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
            {totalVariance >= 0 ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="bg-white rounded-2xl p-2 sm:p-2.5 border border-slate-200/80 shadow-xs flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="relative flex-1 min-w-[240px]">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search local purchase audit history by supplier, item, quote #, invoice..."
            className="w-full pl-9 pr-3 py-1.5 sm:py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-hidden text-slate-900"
          />
        </div>

        <button
          onClick={onRefresh}
          className="inline-flex items-center space-x-1.5 px-3 py-1.5 sm:py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer transition-colors shrink-0"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          <span>Refresh History</span>
        </button>
      </div>

      {/* Table Container */}
      <div className="flex-1 min-h-0 w-full bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden flex flex-col">
        {loading ? (
          <div className="flex-1 min-h-0 flex items-center justify-center p-8 text-center text-slate-400 text-xs">
            <div>
              <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-indigo-600" />
              <span>Loading local purchase history...</span>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex-1 min-h-0 flex items-center justify-center p-8 text-center text-slate-400 text-xs">
            <div>
              <CheckCircle2 size={32} className="mx-auto mb-2 text-slate-300" />
              <span>No local purchase history records found.</span>
            </div>
          </div>
        ) : (
          <div className="flex-1 min-h-0 w-full overflow-x-auto overflow-y-auto scrollbar-thin">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="sticky top-0 bg-slate-50/95 backdrop-blur-xs z-10 shadow-xs">
                <tr className="text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                  <th className="py-3 px-3">Item Description</th>
                  <th className="py-3 px-3">Quotation & Customer</th>
                  <th className="py-3 px-3">Supplier / Vendor</th>
                  <th className="py-3 px-3 text-right">Quantity</th>
                  <th className="py-3 px-3 text-right">Quoted Rate</th>
                  <th className="py-3 px-3 text-right">Actual Rate</th>
                  <th className="py-3 px-3 text-right">Margin Variance</th>
                  <th className="py-3 px-3">Arrival Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((h) => {
                  const variance = h.total_margin_variance || 0;
                  const isPositive = variance >= 0;

                  return (
                    <tr key={h.quotation_item_id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3 px-3">
                        <div className="font-bold text-slate-900">{h.description}</div>
                        <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                          {h.brand && <span>Brand: {h.brand}</span>}
                          {h.size && <span className="ml-2">Size: {h.size}</span>}
                        </div>
                      </td>

                      <td className="py-3 px-3">
                        <div className="font-mono font-bold text-slate-800">{h.quotation_number}</div>
                        <div className="text-[11px] text-slate-600 mt-0.5">{h.customer_name}</div>
                      </td>

                      <td className="py-3 px-3">
                        <div className="font-semibold text-slate-800">{h.vendor_name}</div>
                        {h.invoice_number && (
                          <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                            Inv: {h.invoice_number}
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-3 text-right font-mono font-semibold text-slate-800">
                        {Math.round(h.quantity)} boxes
                      </td>

                      <td className="py-3 px-3 text-right font-mono text-slate-700">
                        ₹ {formatCurrency(h.quoted_rate)}
                      </td>

                      <td className="py-3 px-3 text-right font-mono font-bold text-slate-900">
                        ₹ {formatCurrency(h.actual_purchase_rate)}
                      </td>

                      <td className="py-3 px-3 text-right font-mono font-bold">
                        <span className={isPositive ? 'text-emerald-700' : 'text-rose-700'}>
                          {isPositive ? '+' : ''}₹ {formatCurrency(variance)}
                        </span>
                      </td>

                      <td className="py-3 px-3">
                        <div className="font-mono font-medium text-slate-700 flex items-center space-x-1">
                          <Calendar size={11} className="text-slate-400" />
                          <span>{h.delivery_date ? new Date(h.delivery_date).toLocaleDateString('en-IN') : '-'}</span>
                        </div>
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
