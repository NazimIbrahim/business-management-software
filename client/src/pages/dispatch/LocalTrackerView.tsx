import React, { useState } from 'react';
import {
  Package,
  CheckCircle2,
  Clock,
  Search,
  Filter,
  RefreshCw,
  Phone,
  User,
  Calendar,
  AlertTriangle,
  ArrowRight,
  Edit2,
  X,
  Truck,
} from 'lucide-react';
import { formatCurrency } from '../DispatchManagement';

interface LocalItem {
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
  quoted_rate: number;
  total_amount: number;
  vendor_name: string;
  vendor_contact?: string;
  actual_purchase_rate?: number;
  purchase_status: 'PO_RAISED' | 'AWAITING_DELIVERY' | 'ARRIVED_AT_GODOWN';
  invoice_number?: string;
  expected_date?: string;
  purchase_notes?: string;
  procurement_notes?: string;
  item_image?: string;
}

interface Props {
  items: LocalItem[];
  loading: boolean;
  onRefresh: () => void;
  onUpdateItem: (itemId: number, payload: any) => Promise<void>;
  canEdit: boolean;
}

export const LocalTrackerView: React.FC<Props> = ({
  items,
  loading,
  onRefresh,
  onUpdateItem,
  canEdit,
}) => {
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState<'all' | 'po' | 'awaiting'>('all');

  // Edit Modal State
  const [selectedItem, setSelectedItem] = useState<LocalItem | null>(null);
  const [vendorName, setVendorName] = useState('');
  const [vendorContact, setVendorContact] = useState('');
  const [actualRate, setActualRate] = useState<number | string>('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [expectedDate, setExpectedDate] = useState('');
  const [purchaseStatus, setPurchaseStatus] = useState<'PO_RAISED' | 'AWAITING_DELIVERY' | 'ARRIVED_AT_GODOWN'>('PO_RAISED');
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const filtered = items.filter((it) => {
    const term = search.toLowerCase();
    const matchSearch =
      it.description?.toLowerCase().includes(term) ||
      it.vendor_name?.toLowerCase().includes(term) ||
      it.quotation_number?.toLowerCase().includes(term) ||
      it.customer_name?.toLowerCase().includes(term) ||
      it.brand?.toLowerCase().includes(term);

    const matchStage =
      stageFilter === 'all' ||
      (stageFilter === 'po' && it.purchase_status === 'PO_RAISED') ||
      (stageFilter === 'awaiting' && it.purchase_status === 'AWAITING_DELIVERY');

    return matchSearch && matchStage;
  });

  const handleOpenEdit = (it: LocalItem) => {
    setSelectedItem(it);
    setVendorName(it.vendor_name || '');
    setVendorContact(it.vendor_contact || '');
    setActualRate(it.actual_purchase_rate || it.quoted_rate || '');
    setInvoiceNo(it.invoice_number || '');
    setExpectedDate(it.expected_date ? it.expected_date.slice(0, 10) : '');
    setPurchaseStatus(it.purchase_status || 'PO_RAISED');
    setNotes(it.purchase_notes || it.procurement_notes || '');
  };

  const handleSave = async () => {
    if (!selectedItem) return;
    setIsSaving(true);
    try {
      await onUpdateItem(selectedItem.quotation_item_id, {
        vendor_name: vendorName,
        vendor_contact: vendorContact,
        actual_purchase_rate: parseFloat(String(actualRate || 0)),
        invoice_number: invoiceNo,
        expected_date: expectedDate || null,
        purchase_status: purchaseStatus,
        notes,
      });
      setSelectedItem(null);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDirectMarkArrived = async (it: LocalItem) => {
    if (!window.confirm(`Mark ${it.description} as Arrived at Godown? This will instantly make it Ready Stock.`)) return;
    await onUpdateItem(it.quotation_item_id, {
      purchase_status: 'ARRIVED_AT_GODOWN',
    });
  };

  return (
    <div className="flex-1 min-h-0 w-full flex flex-col gap-2 sm:gap-2.5 overflow-hidden">
      {/* Top Search & Filter Bar */}
      <div className="bg-white rounded-2xl p-2 sm:p-2.5 border border-slate-200/80 shadow-xs flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center space-x-2 flex-1 min-w-[240px]">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search local purchase items by description, vendor, quotation #, customer..."
              className="w-full pl-9 pr-3 py-1.5 sm:py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-hidden text-slate-900"
            />
          </div>

          <select
            value={stageFilter}
            onChange={(e: any) => setStageFilter(e.target.value)}
            className="px-3 py-1.5 sm:py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 font-medium focus:outline-hidden"
          >
            <option value="all">All Local Procurement Stages</option>
            <option value="po">PO Raised / Arranging</option>
            <option value="awaiting">Awaiting Delivery / In Transit</option>
          </select>
        </div>

        <button
          onClick={onRefresh}
          className="inline-flex items-center space-x-1.5 px-3 py-1.5 sm:py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer transition-colors shrink-0"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          <span>Refresh Local Tracker</span>
        </button>
      </div>

      {/* Items Table Container */}
      <div className="flex-1 min-h-0 w-full bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden flex flex-col">
        {loading ? (
          <div className="flex-1 min-h-0 flex items-center justify-center p-8 text-center text-slate-400 text-xs">
            <div>
              <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-amber-600" />
              <span>Loading local purchase tracking list...</span>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex-1 min-h-0 flex items-center justify-center p-8 text-center text-slate-400 text-xs">
            <div>
              <CheckCircle2 size={32} className="mx-auto mb-2 text-emerald-500 opacity-60" />
              <span>No active local purchase items in queue. All items have arrived or are sourced from factory/stock.</span>
            </div>
          </div>
        ) : (
          <div className="flex-1 min-h-0 w-full overflow-x-auto overflow-y-auto scrollbar-thin">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="sticky top-0 bg-slate-50/95 backdrop-blur-xs z-10 shadow-xs">
                <tr className="text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                  <th className="py-2.5 px-3">Item Description & Specs</th>
                  <th className="py-2.5 px-3">Quotation & Customer</th>
                  <th className="py-2.5 px-3 text-right">Qty Needed</th>
                  <th className="py-2.5 px-3">Vendor / Dealer</th>
                  <th className="py-2.5 px-3 text-center">Procurement Stage</th>
                  <th className="py-2.5 px-3">Expected Arrival</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((it) => {
                  const isAwaiting = it.purchase_status === 'AWAITING_DELIVERY';

                  return (
                    <tr key={it.quotation_item_id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3 px-3">
                        <div className="font-bold text-slate-900">{it.description}</div>
                        <div className="text-[10px] text-slate-500 font-mono flex items-center space-x-2 mt-0.5">
                          {it.brand && <span>Brand: {it.brand}</span>}
                          {it.size && <span>Size: {it.size}</span>}
                        </div>
                      </td>

                      <td className="py-3 px-3">
                        <div className="font-mono font-bold text-slate-800">{it.quotation_number}</div>
                        <div className="text-[11px] text-slate-600 mt-0.5 flex items-center space-x-1">
                          <User size={11} className="text-slate-400" />
                          <span>{it.customer_name}</span>
                        </div>
                      </td>

                      <td className="py-3 px-3 text-right font-mono font-bold text-amber-900">
                        {Math.round(it.required_quantity)} {it.product_type || 'boxes'}
                      </td>

                      <td className="py-3 px-3">
                        <div className="font-semibold text-slate-800">{it.vendor_name || 'Local Distributor'}</div>
                        {it.vendor_contact && (
                          <div className="text-[10px] text-slate-500 font-mono flex items-center space-x-1 mt-0.5">
                            <Phone size={10} className="text-slate-400" />
                            <span>{it.vendor_contact}</span>
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-3 text-center">
                        <span
                          className={`inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            isAwaiting
                              ? 'bg-amber-100 text-amber-900 border border-amber-200'
                              : 'bg-slate-100 text-slate-700 border border-slate-200'
                          }`}
                        >
                          <Clock size={10} />
                          <span>{isAwaiting ? 'Awaiting Delivery' : 'PO Raised'}</span>
                        </span>
                      </td>

                      <td className="py-3 px-3">
                        <div className="font-mono font-semibold text-slate-700 flex items-center space-x-1">
                          <Calendar size={11} className="text-slate-400" />
                          <span>{it.expected_date ? new Date(it.expected_date).toLocaleDateString('en-IN') : 'TBD'}</span>
                        </div>
                      </td>

                      <td className="py-3 px-3 text-right">
                        <div className="flex items-center justify-end space-x-1.5">
                          {canEdit && (
                            <>
                              <button
                                onClick={() => handleOpenEdit(it)}
                                className="inline-flex items-center space-x-1 px-2 py-1 rounded-lg border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold text-[11px] cursor-pointer"
                                title="Edit Vendor, Rate, or Stage"
                              >
                                <Edit2 size={11} />
                                <span>Edit</span>
                              </button>

                              <button
                                onClick={() => handleDirectMarkArrived(it)}
                                className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] shadow-2xs cursor-pointer transition-colors"
                                title="Mark as Arrived at Godown (Sets to Ready Stock)"
                              >
                                <CheckCircle2 size={12} />
                                <span>Arrived</span>
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

      {/* Edit Local Purchase Modal */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[85vh] flex flex-col border border-slate-200 shadow-2xl overflow-hidden animate-fadeIn">
            <div className="flex items-center justify-between p-3.5 sm:p-4 border-b border-slate-200 shrink-0">
              <h3 className="font-extrabold text-slate-900 text-sm">Update Local Purchase Order</h3>
              <button
                onClick={() => setSelectedItem(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3 text-xs scrollbar-thin">
              <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                <div className="font-bold text-slate-900">{selectedItem.description}</div>
                <div className="text-slate-500 mt-0.5">
                  Required: <span className="font-bold text-slate-800">{selectedItem.required_quantity} boxes</span> | Quote Ref: <span className="font-mono font-bold text-slate-800">{selectedItem.quotation_number}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Target Vendor Name</label>
                  <input
                    type="text"
                    value={vendorName}
                    onChange={(e) => setVendorName(e.target.value)}
                    placeholder="Dealer / Supplier name"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Vendor Contact Phone</label>
                  <input
                    type="text"
                    value={vendorContact}
                    onChange={(e) => setVendorContact(e.target.value)}
                    placeholder="Phone number"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Actual Purchase Rate (₹)</label>
                  <input
                    type="number"
                    step="any"
                    value={actualRate}
                    onChange={(e) => setActualRate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Expected Delivery Date</label>
                  <input
                    type="date"
                    value={expectedDate}
                    onChange={(e) => setExpectedDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Procurement Status Stage</label>
                <select
                  value={purchaseStatus}
                  onChange={(e: any) => setPurchaseStatus(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-semibold text-slate-800 bg-white"
                >
                  <option value="PO_RAISED">PO Raised / In Negotiation</option>
                  <option value="AWAITING_DELIVERY">Awaiting Delivery / Dispatched by Vendor</option>
                  <option value="ARRIVED_AT_GODOWN">Arrived at Godown (Mark as Ready Stock)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Notes / Supplier Invoice #</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Invoice number, payment mode, vendor remarks..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                />
              </div>

            </div>

            <div className="p-3 sm:p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end space-x-2 shrink-0">
              <button
                type="button"
                onClick={() => setSelectedItem(null)}
                className="px-4 py-2 rounded-xl border border-slate-300 hover:bg-slate-100 font-semibold text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-sm cursor-pointer disabled:opacity-50"
              >
                {isSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
