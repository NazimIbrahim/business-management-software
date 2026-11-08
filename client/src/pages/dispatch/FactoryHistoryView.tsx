import React, { useState } from 'react';
import {
  Factory,
  Search,
  RefreshCw,
  Calendar,
  CheckCircle2,
  Truck,
  Layers,
  FileText,
} from 'lucide-react';
import { formatCurrency } from '../DispatchManagement';

interface FactoryHistoryRow {
  quotation_item_id: number;
  quotation_id: number;
  quotation_number: string;
  customer_name: string;
  description: string;
  brand?: string;
  size?: string;
  quantity: number;
  factory_name: string;
  brand_name?: string;
  batch_shade_code?: string;
  lr_number?: string;
  transporter_name?: string;
  truck_number?: string;
  order_date?: string;
  eta_date?: string;
  unloaded_date: string;
  total_pallets?: number;
  freight_cost?: number;
  notes?: string;
}

interface Props {
  history: FactoryHistoryRow[];
  loading: boolean;
  onRefresh: () => void;
}

export const FactoryHistoryView: React.FC<Props> = ({
  history,
  loading,
  onRefresh,
}) => {
  const [search, setSearch] = useState('');

  const filtered = history.filter((h) => {
    const term = search.toLowerCase();
    return (
      h.description?.toLowerCase().includes(term) ||
      h.factory_name?.toLowerCase().includes(term) ||
      h.brand?.toLowerCase().includes(term) ||
      h.lr_number?.toLowerCase().includes(term) ||
      h.quotation_number?.toLowerCase().includes(term) ||
      h.customer_name?.toLowerCase().includes(term) ||
      h.truck_number?.toLowerCase().includes(term)
    );
  });

  const totalDeliveredBoxes = filtered.reduce((acc, h) => acc + h.quantity, 0);
  const totalFreight = filtered.reduce((acc, h) => acc + (parseFloat(String(h.freight_cost || 0))), 0);

  return (
    <div className="flex-1 min-h-0 w-full flex flex-col gap-2 sm:gap-2.5 overflow-hidden">
      {/* Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 sm:gap-2.5 shrink-0">
        <div className="bg-white rounded-2xl p-2.5 sm:p-3 border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-[10px] sm:text-[11px] font-bold text-slate-500 uppercase tracking-wider">Completed Factory Shipments</div>
            <div className="text-xl sm:text-2xl font-black text-slate-900 mt-0.5">{filtered.length}</div>
            <div className="text-[10px] text-slate-500 font-medium">Unloaded and placed in Godown</div>
          </div>
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-700 shrink-0">
            <Factory size={18} />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-2.5 sm:p-3 border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-[10px] sm:text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Received Boxes</div>
            <div className="text-xl sm:text-2xl font-black text-slate-900 mt-0.5">{Math.round(totalDeliveredBoxes)}</div>
            <div className="text-[10px] text-slate-500 font-medium">Boxes delivered from Morbi & factories</div>
          </div>
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
            <Layers size={18} />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-2.5 sm:p-3 border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-[10px] sm:text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Inbound Logistics Freight</div>
            <div className="text-lg sm:text-xl font-black text-slate-900 mt-0.5">₹ {formatCurrency(totalFreight)}</div>
            <div className="text-[10px] text-slate-500 font-medium">Transportation expenditures</div>
          </div>
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-700 shrink-0">
            <Truck size={18} />
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
            placeholder="Search factory shipment history by LR #, factory, brand, item, truck, quote..."
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
              <span>Loading factory shipment history...</span>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex-1 min-h-0 flex items-center justify-center p-8 text-center text-slate-400 text-xs">
            <div>
              <CheckCircle2 size={32} className="mx-auto mb-2 text-slate-300" />
              <span>No factory shipment history records found.</span>
            </div>
          </div>
        ) : (
          <div className="flex-1 min-h-0 w-full overflow-x-auto overflow-y-auto scrollbar-thin">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="sticky top-0 bg-slate-50/95 backdrop-blur-xs z-10 shadow-xs">
                <tr className="text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                  <th className="py-3 px-3">Item Specs & Shade</th>
                  <th className="py-3 px-3">Quotation & Customer</th>
                  <th className="py-3 px-3">Factory Source</th>
                  <th className="py-3 px-3">LR / Bilty & Truck</th>
                  <th className="py-3 px-3 text-right">Volume</th>
                  <th className="py-3 px-3 text-right">Freight Cost</th>
                  <th className="py-3 px-3">Unloaded Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((h) => (
                  <tr key={h.quotation_item_id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3 px-3">
                      <div className="font-bold text-slate-900">{h.description}</div>
                      <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                        {h.brand && <span>Brand: {h.brand}</span>}
                        {h.size && <span className="ml-2">Size: {h.size}</span>}
                        {h.batch_shade_code && <span className="ml-2 text-indigo-700 font-bold">Shade: {h.batch_shade_code}</span>}
                      </div>
                    </td>

                    <td className="py-3 px-3">
                      <div className="font-mono font-bold text-slate-800">{h.quotation_number}</div>
                      <div className="text-[11px] text-slate-600 mt-0.5">{h.customer_name}</div>
                    </td>

                    <td className="py-3 px-3">
                      <div className="font-semibold text-slate-800">{h.factory_name}</div>
                      <div className="text-[10px] text-slate-400">Plant Consignment</div>
                    </td>

                    <td className="py-3 px-3">
                      <div className="font-mono font-bold text-slate-900 text-xs">
                        {h.lr_number ? `LR: ${h.lr_number}` : 'Delivered'}
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        {h.transporter_name || 'Direct Freight'} {h.truck_number ? `(${h.truck_number})` : ''}
                      </div>
                    </td>

                    <td className="py-3 px-3 text-right font-mono font-bold text-slate-900">
                      {Math.round(h.quantity)} boxes
                    </td>

                    <td className="py-3 px-3 text-right font-mono font-bold text-slate-800">
                      {parseFloat(String(h.freight_cost || 0)) > 0 ? `₹ ${formatCurrency(h.freight_cost)}` : '-'}
                    </td>

                    <td className="py-3 px-3">
                      <div className="font-mono font-medium text-slate-700 flex items-center space-x-1">
                        <Calendar size={11} className="text-slate-400" />
                        <span>{h.unloaded_date ? new Date(h.unloaded_date).toLocaleDateString('en-IN') : '-'}</span>
                      </div>
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
