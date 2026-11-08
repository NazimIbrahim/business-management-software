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
} from 'lucide-react';
import { formatCurrency } from '../DispatchManagement';

interface CompletedRow {
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

  const filtered = completedList.filter((c) => {
    const term = search.toLowerCase();
    return (
      c.quotation_number?.toLowerCase().includes(term) ||
      c.challan_number?.toLowerCase().includes(term) ||
      c.customer_name?.toLowerCase().includes(term) ||
      c.customer_phone?.includes(term) ||
      c.vehicle_no?.toLowerCase().includes(term) ||
      c.driver_name?.toLowerCase().includes(term)
    );
  });

  const totalDeliveredValue = filtered.reduce((acc, c) => acc + parseFloat(String(c.net_total || 0)), 0);
  const totalBoxes = filtered.reduce((acc, c) => acc + parseFloat(String(c.total_boxes || 0)), 0);

  return (
    <div className="space-y-4">
      {/* Metrics Bar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Dispatches Completed</div>
            <div className="text-2xl font-black text-emerald-700 mt-1">{filtered.length}</div>
            <div className="text-[10px] text-emerald-600 font-semibold mt-0.5">100% Fulfilled & Delivered</div>
          </div>
          <div className="w-11 h-11 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
            <CheckCircle2 size={22} />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Material Volume</div>
            <div className="text-2xl font-black text-slate-900 mt-1">{Math.round(totalBoxes)}</div>
            <div className="text-[10px] text-slate-500 font-medium mt-0.5">Delivered Boxes / Units</div>
          </div>
          <div className="w-11 h-11 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-700">
            <Package size={22} />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Value Delivered</div>
            <div className="text-xl font-black text-slate-900 mt-1">₹ {formatCurrency(totalDeliveredValue)}</div>
            <div className="text-[10px] text-slate-500 font-medium mt-0.5">Successfully Fulfilled Orders</div>
          </div>
          <div className="w-11 h-11 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
            <Truck size={22} />
          </div>
        </div>
      </div>

      {/* Search Toolbar */}
      <div className="bg-white rounded-2xl p-3 border border-slate-200/80 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 min-w-[260px]">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search completed dispatches by challan #, quote ref, customer, driver, vehicle..."
            className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-hidden focus:ring-2 focus:ring-indigo-500/30 text-slate-900"
          />
        </div>

        <button
          onClick={onRefresh}
          className="inline-flex items-center space-x-1.5 px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer transition-colors"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          <span>Refresh Completed</span>
        </button>
      </div>

      {/* Archive Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400 text-xs">
            <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-indigo-600" />
            Loading completed dispatches archive...
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs">
            <CheckCircle2 size={32} className="mx-auto mb-2 text-slate-300" />
            No completed dispatches match the search criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                  <th className="py-3 px-3">Challan & Quote</th>
                  <th className="py-3 px-3">Customer & Destination</th>
                  <th className="py-3 px-3">Vehicle & Driver</th>
                  <th className="py-3 px-3 text-right">Delivered Units</th>
                  <th className="py-3 px-3 text-right">Order Value</th>
                  <th className="py-3 px-3">Completed Date</th>
                  <th className="py-3 px-3 text-right">Delivery Challan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((c) => (
                  <tr key={c.quotation_id} className="hover:bg-slate-50/60 transition-colors">
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
                    </td>

                    <td className="py-3 px-3 text-right font-mono font-extrabold text-slate-900 text-xs">
                      ₹ {formatCurrency(c.net_total)}
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
                      <button
                        onClick={() => onPrintChallan(c.quotation_id)}
                        className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-black text-white font-bold text-xs shadow-2xs cursor-pointer transition-colors"
                      >
                        <Printer size={13} />
                        <span>Print Challan</span>
                      </button>
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
