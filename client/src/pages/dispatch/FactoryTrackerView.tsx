import React, { useState } from 'react';
import {
  Factory,
  Truck,
  Calendar,
  CheckCircle2,
  RefreshCw,
  Search,
  Phone,
  User,
  Edit2,
  X,
  Clock,
  Layers,
} from 'lucide-react';
import { formatCurrency } from '../DispatchManagement';

interface FactoryItem {
  quotation_item_id: number;
  quotation_id: number;
  quotation_number: string;
  customer_name: string;
  customer_phone?: string;
  site_location?: string;
  description: string;
  brand?: string;
  size?: string;
  product_type?: string;
  required_quantity: number;
  factory_name: string;
  brand_name?: string;
  batch_shade_code?: string;
  lr_number?: string;
  transporter_name?: string;
  truck_number?: string;
  order_date?: string;
  eta_date?: string;
  total_pallets?: number;
  freight_cost?: number;
  status: 'ORDER_PLACED' | 'IN_TRANSIT' | 'UNLOADED';
  factory_notes?: string;
  procurement_notes?: string;
  item_image?: string;
}

interface Props {
  orders: FactoryItem[];
  loading: boolean;
  onRefresh: () => void;
  onUpdateOrder: (itemId: number, payload: any) => Promise<void>;
  canEdit: boolean;
}

export const FactoryTrackerView: React.FC<Props> = ({
  orders,
  loading,
  onRefresh,
  onUpdateOrder,
  canEdit,
}) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'placed' | 'transit'>('all');

  // Edit Modal State
  const [selectedItem, setSelectedItem] = useState<FactoryItem | null>(null);
  const [factoryName, setFactoryName] = useState('');
  const [batchShade, setBatchShade] = useState('');
  const [lrNumber, setLrNumber] = useState('');
  const [transporter, setTransporter] = useState('');
  const [truckNumber, setTruckNumber] = useState('');
  const [etaDate, setEtaDate] = useState('');
  const [freightCost, setFreightCost] = useState<number | string>('');
  const [totalPallets, setTotalPallets] = useState<number | string>('');
  const [orderStatus, setOrderStatus] = useState<'ORDER_PLACED' | 'IN_TRANSIT' | 'UNLOADED'>('ORDER_PLACED');
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const filtered = orders.filter((o) => {
    const term = search.toLowerCase();
    const matchSearch =
      o.description?.toLowerCase().includes(term) ||
      o.factory_name?.toLowerCase().includes(term) ||
      o.brand?.toLowerCase().includes(term) ||
      o.lr_number?.toLowerCase().includes(term) ||
      o.quotation_number?.toLowerCase().includes(term) ||
      o.customer_name?.toLowerCase().includes(term);

    const matchStatus =
      statusFilter === 'all' ||
      (statusFilter === 'placed' && o.status === 'ORDER_PLACED') ||
      (statusFilter === 'transit' && o.status === 'IN_TRANSIT');

    return matchSearch && matchStatus;
  });

  const handleOpenEdit = (it: FactoryItem) => {
    setSelectedItem(it);
    setFactoryName(it.factory_name || it.brand || 'Factory / Morbi Plant');
    setBatchShade(it.batch_shade_code || '');
    setLrNumber(it.lr_number || '');
    setTransporter(it.transporter_name || '');
    setTruckNumber(it.truck_number || '');
    setEtaDate(it.eta_date ? it.eta_date.slice(0, 10) : '');
    setFreightCost(it.freight_cost || '');
    setTotalPallets(it.total_pallets || '');
    setOrderStatus(it.status || 'ORDER_PLACED');
    setNotes(it.factory_notes || it.procurement_notes || '');
  };

  const handleSave = async () => {
    if (!selectedItem) return;
    setIsSaving(true);
    try {
      await onUpdateOrder(selectedItem.quotation_item_id, {
        factory_name: factoryName,
        batch_shade_code: batchShade,
        lr_number: lrNumber,
        transporter_name: transporter,
        truck_number: truckNumber,
        eta_date: etaDate || null,
        freight_cost: parseFloat(String(freightCost || 0)),
        total_pallets: parseFloat(String(totalPallets || 0)),
        status: orderStatus,
        notes,
      });
      setSelectedItem(null);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDirectUnload = async (it: FactoryItem) => {
    if (!window.confirm(`Confirm unloading for ${it.description}? This will mark it as Ready Stock at Godown.`)) return;
    await onUpdateOrder(it.quotation_item_id, {
      status: 'UNLOADED',
    });
  };

  return (
    <div className="space-y-4">
      {/* Top Search Toolbar */}
      <div className="bg-white rounded-2xl p-3 border border-slate-200/80 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-2 flex-1 min-w-[260px]">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search factory consignments by LR / bilty #, factory, brand, item, quote..."
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-hidden text-slate-900"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e: any) => setStatusFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 font-medium focus:outline-hidden"
          >
            <option value="all">All Factory Logistics Stages</option>
            <option value="placed">Order Placed at Factory</option>
            <option value="transit">In Transit (On the Way)</option>
          </select>
        </div>

        <button
          onClick={onRefresh}
          className="inline-flex items-center space-x-1.5 px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer transition-colors"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          <span>Refresh Factory Orders</span>
        </button>
      </div>

      {/* Orders Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400 text-xs">
            <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-indigo-600" />
            Loading active factory orders...
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs">
            <CheckCircle2 size={32} className="mx-auto mb-2 text-emerald-500 opacity-60" />
            No active factory shipments in progress. All factory consignments have been unloaded.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                  <th className="py-3 px-3">Item Specs & Brand</th>
                  <th className="py-3 px-3">Quotation & Customer</th>
                  <th className="py-3 px-3 text-right">Qty (Boxes)</th>
                  <th className="py-3 px-3">Factory / Plant</th>
                  <th className="py-3 px-3">LR / Bilty & Truck</th>
                  <th className="py-3 px-3 text-center">Status</th>
                  <th className="py-3 px-3">Expected ETA</th>
                  <th className="py-3 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((it) => {
                  const isTransit = it.status === 'IN_TRANSIT';

                  return (
                    <tr key={it.quotation_item_id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3 px-3">
                        <div className="font-bold text-slate-900">{it.description}</div>
                        <div className="text-[10px] text-slate-500 font-mono flex items-center space-x-2 mt-0.5">
                          {it.brand && <span>Brand: {it.brand}</span>}
                          {it.size && <span>Size: {it.size}</span>}
                          {it.batch_shade_code && <span>Shade: {it.batch_shade_code}</span>}
                        </div>
                      </td>

                      <td className="py-3 px-3">
                        <div className="font-mono font-bold text-slate-800">{it.quotation_number}</div>
                        <div className="text-[11px] text-slate-600 mt-0.5 flex items-center space-x-1">
                          <User size={11} className="text-slate-400" />
                          <span>{it.customer_name}</span>
                        </div>
                      </td>

                      <td className="py-3 px-3 text-right font-mono font-bold text-indigo-900">
                        {Math.round(it.required_quantity)} boxes
                      </td>

                      <td className="py-3 px-3">
                        <div className="font-semibold text-slate-800">{it.factory_name}</div>
                        <div className="text-[10px] text-slate-400">Production Source</div>
                      </td>

                      <td className="py-3 px-3">
                        <div className="font-mono font-bold text-slate-900 text-xs">
                          {it.lr_number ? `LR: ${it.lr_number}` : 'LR Pending'}
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          {it.transporter_name || 'Transport'} {it.truck_number ? `(${it.truck_number})` : ''}
                        </div>
                      </td>

                      <td className="py-3 px-3 text-center">
                        <span
                          className={`inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            isTransit
                              ? 'bg-indigo-100 text-indigo-800 border border-indigo-200'
                              : 'bg-slate-100 text-slate-700 border border-slate-200'
                          }`}
                        >
                          <Truck size={10} />
                          <span>{isTransit ? 'In Transit' : 'Order Placed'}</span>
                        </span>
                      </td>

                      <td className="py-3 px-3">
                        <div className="font-mono font-semibold text-slate-700 flex items-center space-x-1">
                          <Calendar size={11} className="text-slate-400" />
                          <span>{it.eta_date ? new Date(it.eta_date).toLocaleDateString('en-IN') : 'TBD'}</span>
                        </div>
                      </td>

                      <td className="py-3 px-3 text-right">
                        <div className="flex items-center justify-end space-x-1.5">
                          {canEdit && (
                            <>
                              <button
                                onClick={() => handleOpenEdit(it)}
                                className="inline-flex items-center space-x-1 px-2 py-1 rounded-lg border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold text-[11px] cursor-pointer"
                                title="Edit LR #, Transporter, or ETA"
                              >
                                <Edit2 size={11} />
                                <span>Edit</span>
                              </button>

                              <button
                                onClick={() => handleDirectUnload(it)}
                                className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] shadow-2xs cursor-pointer transition-colors"
                                title="Confirm Unloading at Godown (Sets to Ready Stock)"
                              >
                                <CheckCircle2 size={12} />
                                <span>Unload</span>
                              </button>
                            </>
                          )}
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

      {/* Edit Factory Order Modal */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full p-5 border border-slate-200 shadow-2xl animate-fadeIn">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-200">
              <h3 className="font-extrabold text-slate-900 text-sm">Update Factory Consignment</h3>
              <button
                onClick={() => setSelectedItem(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                <div className="font-bold text-slate-900">{selectedItem.description}</div>
                <div className="text-slate-500 mt-0.5">
                  Quantity: <span className="font-bold text-slate-800">{selectedItem.required_quantity} boxes</span> | Quote Ref: <span className="font-mono font-bold text-slate-800">{selectedItem.quotation_number}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Factory / Plant Name</label>
                  <input
                    type="text"
                    value={factoryName}
                    onChange={(e) => setFactoryName(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Batch / Shade Code</label>
                  <input
                    type="text"
                    value={batchShade}
                    onChange={(e) => setBatchShade(e.target.value)}
                    placeholder="e.g. S-441 / Premium"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">LR / Bilty #</label>
                  <input
                    type="text"
                    value={lrNumber}
                    onChange={(e) => setLrNumber(e.target.value)}
                    placeholder="Tracking LR"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Transporter</label>
                  <input
                    type="text"
                    value={transporter}
                    onChange={(e) => setTransporter(e.target.value)}
                    placeholder="Logistics co."
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Truck Number</label>
                  <input
                    type="text"
                    value={truckNumber}
                    onChange={(e) => setTruckNumber(e.target.value)}
                    placeholder="GJ-36-XX-XXXX"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Expected Transit ETA</label>
                  <input
                    type="date"
                    value={etaDate}
                    onChange={(e) => setEtaDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Logistics Stage</label>
                  <select
                    value={orderStatus}
                    onChange={(e: any) => setOrderStatus(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl font-semibold text-slate-800 bg-white"
                  >
                    <option value="ORDER_PLACED">Order Placed at Factory</option>
                    <option value="IN_TRANSIT">In Transit (Vehicle Moving)</option>
                    <option value="UNLOADED">Unloaded at Godown (Sets to Ready Stock)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Notes / Special Instructions</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Container seal number, unloading bay remarks..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setSelectedItem(null)}
                  className="px-4 py-2 rounded-xl border border-slate-300 hover:bg-slate-100 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
                >
                  {isSaving ? 'Saving...' : 'Save Logistics Record'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
