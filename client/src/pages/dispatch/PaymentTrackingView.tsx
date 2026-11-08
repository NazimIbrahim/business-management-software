import React, { useState } from 'react';
import {
  CreditCard,
  ShieldCheck,
  AlertCircle,
  AlertTriangle,
  Search,
  RefreshCw,
  Phone,
  User,
  CheckCircle2,
  MapPin,
  Clock,
  ArrowRight,
} from 'lucide-react';
import { formatCurrency } from '../DispatchManagement';

interface PaymentLedgerItem {
  quotation_id: number;
  quotation_number: string;
  customer_name: string;
  customer_phone?: string;
  site_location?: string;
  sales_person_name?: string;
  net_total: number | string;
  dispatch_status: string;
  verified_paid: number | string;
  unverified_paid: number | string;
  total_recorded: number | string;
  balance_due: number | string;
  payment_clearance_status: 'CLEARED' | 'PARTIAL' | 'PENDING';
  has_shortfall: boolean;
  shortfall_amount: number | string;
  payment_modes: string;
  receipt_count: number;
}

interface Props {
  ledgers: PaymentLedgerItem[];
  loading: boolean;
  onRefresh: () => void;
  onSelectQuote?: (quoteId: number) => void;
}

export const PaymentTrackingView: React.FC<Props> = ({
  ledgers,
  loading,
  onRefresh,
  onSelectQuote,
}) => {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'shortfall' | 'cleared'>('all');

  const filtered = ledgers.filter((l) => {
    const term = search.toLowerCase();
    const matchSearch =
      l.quotation_number?.toLowerCase().includes(term) ||
      l.customer_name?.toLowerCase().includes(term) ||
      l.customer_phone?.includes(term) ||
      l.site_location?.toLowerCase().includes(term);

    const matchFilter =
      filter === 'all' ||
      (filter === 'shortfall' && l.has_shortfall) ||
      (filter === 'cleared' && !l.has_shortfall);

    return matchSearch && matchFilter;
  });

  const totalValue = filtered.reduce((acc, l) => acc + parseFloat(String(l.net_total || 0)), 0);
  const totalVerified = filtered.reduce((acc, l) => acc + parseFloat(String(l.verified_paid || 0)), 0);
  const totalPendingBalance = filtered.reduce((acc, l) => acc + parseFloat(String(l.balance_due || 0)), 0);
  const shortfallCount = filtered.filter((l) => l.has_shortfall).length;

  return (
    <div className="flex-1 min-h-0 w-full flex flex-col gap-2 sm:gap-2.5 overflow-hidden">
      {/* Metric KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-2.5 shrink-0">
        <div className="bg-white rounded-2xl p-2.5 sm:p-3 border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-[10px] sm:text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Ledger Value</div>
            <div className="text-lg sm:text-xl font-black text-slate-900 mt-0.5">₹ {formatCurrency(totalValue)}</div>
            <div className="text-[10px] text-slate-500 font-medium">{filtered.length} active customer quotes</div>
          </div>
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-700 shrink-0">
            <CreditCard size={18} />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-2.5 sm:p-3 border border-emerald-200/80 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-[10px] sm:text-[11px] font-bold text-emerald-700 uppercase tracking-wider">Verified Collections</div>
            <div className="text-lg sm:text-xl font-black text-emerald-800 mt-0.5">₹ {formatCurrency(totalVerified)}</div>
            <div className="text-[10px] text-emerald-600 font-semibold">Cleared by Accounts Team</div>
          </div>
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
            <ShieldCheck size={18} />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-2.5 sm:p-3 border border-rose-200/80 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-[10px] sm:text-[11px] font-bold text-rose-600 uppercase tracking-wider">Outstanding Balance Due</div>
            <div className="text-lg sm:text-xl font-black text-rose-700 mt-0.5">₹ {formatCurrency(totalPendingBalance)}</div>
            <div className="text-[10px] text-rose-500 font-medium">Unpaid customer receivable</div>
          </div>
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600 shrink-0">
            <AlertCircle size={18} />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-2.5 sm:p-3 border border-amber-200/80 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-[10px] sm:text-[11px] font-bold text-amber-700 uppercase tracking-wider">Dispatch Safety Alerts</div>
            <div className="text-xl sm:text-2xl font-black text-amber-800 mt-0.5">{shortfallCount}</div>
            <div className="text-[10px] text-amber-600 font-medium">Orders with payment shortfall</div>
          </div>
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600 shrink-0">
            <AlertTriangle size={18} />
          </div>
        </div>
      </div>

      {/* Safety Gate Warning Banner */}
      {shortfallCount > 0 && (
        <div className="p-2.5 sm:p-3 bg-amber-50/80 border border-amber-300 rounded-2xl flex items-center justify-between text-xs text-amber-900 shrink-0">
          <div className="flex items-center space-x-2.5">
            <AlertTriangle size={16} className="text-amber-600 shrink-0" />
            <div className="text-[11px]">
              <span className="font-extrabold">DISPATCH SAFETY GATE ACTIVE:</span> {shortfallCount} closed orders have not received 100% verified payment. Warehouse staff cannot dispatch items beyond the verified customer credit limit without supervisor override.
            </div>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="bg-white rounded-2xl p-2 sm:p-2.5 border border-slate-200/80 shadow-xs flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center space-x-2 flex-1 min-w-[240px]">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search billing ledger by quotation #, customer, phone, site..."
              className="w-full pl-9 pr-3 py-1.5 sm:py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-hidden text-slate-900"
            />
          </div>

          <select
            value={filter}
            onChange={(e: any) => setFilter(e.target.value)}
            className="px-3 py-1.5 sm:py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 font-medium focus:outline-hidden"
          >
            <option value="all">All Payment Ledgers</option>
            <option value="shortfall">Shortfall Alerts Only (Pending Balance)</option>
            <option value="cleared">Cleared Orders Only (100% Paid)</option>
          </select>
        </div>

        <button
          onClick={onRefresh}
          className="inline-flex items-center space-x-1.5 px-3 py-1.5 sm:py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer transition-colors shrink-0"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          <span>Refresh Ledger</span>
        </button>
      </div>

      {/* Ledger Table Container */}
      <div className="flex-1 min-h-0 w-full bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden flex flex-col">
        {loading ? (
          <div className="flex-1 min-h-0 flex items-center justify-center p-8 text-center text-slate-400 text-xs">
            <div>
              <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-indigo-600" />
              <span>Loading customer payment ledger...</span>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex-1 min-h-0 flex items-center justify-center p-8 text-center text-slate-400 text-xs">
            <div>
              <CheckCircle2 size={32} className="mx-auto mb-2 text-slate-300" />
              <span>No customer quotations match the filter.</span>
            </div>
          </div>
        ) : (
          <div className="flex-1 min-h-0 w-full overflow-x-auto overflow-y-auto scrollbar-thin">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="sticky top-0 bg-slate-50/95 backdrop-blur-xs z-10 shadow-xs">
                <tr className="text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                  <th className="py-2.5 px-3">Quotation Ref</th>
                  <th className="py-2.5 px-3">Customer & Contact</th>
                  <th className="py-2.5 px-3 text-right">Quote Net Total</th>
                  <th className="py-2.5 px-3 text-right">Accounts Verified</th>
                  <th className="py-2.5 px-3 text-right">Unverified Receipts</th>
                  <th className="py-2.5 px-3 text-right">Balance Due</th>
                  <th className="py-2.5 px-3 text-center">Safety Gate Status</th>
                  <th className="py-2.5 px-3">Payment Modes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((l) => (
                  <tr key={l.quotation_id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3 px-3">
                      <div className="font-extrabold text-slate-900 font-mono text-xs">{l.quotation_number}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        Dispatch Stage: <span className="font-semibold text-slate-700">{l.dispatch_status}</span>
                      </div>
                    </td>

                    <td className="py-3 px-3">
                      <div className="font-bold text-slate-900 flex items-center space-x-1">
                        <User size={12} className="text-slate-400" />
                        <span>{l.customer_name}</span>
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono mt-0.5 flex items-center space-x-1">
                        <Phone size={11} className="text-slate-400" />
                        <span>{l.customer_phone || '-'}</span>
                      </div>
                    </td>

                    <td className="py-3 px-3 text-right font-mono font-bold text-slate-900">
                      ₹ {formatCurrency(l.net_total)}
                    </td>

                    <td className="py-3 px-3 text-right font-mono font-extrabold text-emerald-700">
                      ₹ {formatCurrency(l.verified_paid)}
                    </td>

                    <td className="py-3 px-3 text-right font-mono text-slate-500">
                      {parseFloat(String(l.unverified_paid || 0)) > 0 ? (
                        <span className="text-amber-700 font-bold">₹ {formatCurrency(l.unverified_paid)} (Pending)</span>
                      ) : (
                        '-'
                      )}
                    </td>

                    <td className="py-3 px-3 text-right font-mono font-extrabold">
                      {parseFloat(String(l.balance_due || 0)) <= 0.5 ? (
                        <span className="text-emerald-700">₹ 0.00</span>
                      ) : (
                        <span className="text-rose-700">₹ {formatCurrency(l.balance_due)}</span>
                      )}
                    </td>

                    <td className="py-3 px-3 text-center">
                      {!l.has_shortfall ? (
                        <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                          <ShieldCheck size={11} />
                          <span>100% Cleared</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                          <AlertTriangle size={11} />
                          <span>Shortfall Warning</span>
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-3">
                      <div className="text-[11px] text-slate-700 font-medium">{l.payment_modes}</div>
                      <div className="text-[10px] text-slate-400">{l.receipt_count} payment receipts</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
