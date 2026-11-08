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
  ShieldCheck,
  ShieldAlert,
  CreditCard,
  Check,
} from 'lucide-react';
import { formatCurrency } from '../DispatchManagement';

export interface LocalItem {
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
  payment_checked?: boolean;
  payment_checked_by?: number;
  payment_checked_by_name?: string;
  payment_checked_at?: string;
  availability_checked?: boolean;
  availability_checked_at?: string;
  admin_override_by_id?: number;
  admin_override_notes?: string;
  parent_verified_paid?: number;
  parent_ready_stock_val?: number;
  parent_local_purchase_val?: number;
  parent_committed_immediate_value?: number;
  parent_is_payment_sufficient?: boolean;
  parent_deficit_amount?: number;
}

interface Props {
  items: LocalItem[];
  loading: boolean;
  onRefresh: () => void;
  onUpdateItem: (itemId: number, payload: any) => Promise<void>;
  onVerifyPayment: (itemId: number, payload: { verified: boolean; admin_override?: boolean; override_notes?: string }) => Promise<void>;
  onVerifyAvailability: (itemId: number, available: boolean) => Promise<void>;
  canEdit: boolean;
  onNavigateToPayments?: (quotationNumber?: string) => void;
  userRole?: string;
}

export const LocalTrackerView: React.FC<Props> = ({
  items,
  loading,
  onRefresh,
  onUpdateItem,
  onVerifyPayment,
  onVerifyAvailability,
  canEdit,
  onNavigateToPayments,
  userRole = '',
}) => {
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState<'all' | 'unverified' | 'po' | 'awaiting'>('all');

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

  // Safety Gate / Verification Modal State
  const [paymentModalItem, setPaymentModalItem] = useState<LocalItem | null>(null);
  const [overrideNotes, setOverrideNotes] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);

  const isAdminOrManager = userRole === 'admin' || userRole === 'manager';

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
      (stageFilter === 'unverified' && !it.payment_checked) ||
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

    // Safety gate check: if advancing to PO_RAISED or AWAITING_DELIVERY and payment is unchecked
    if (!selectedItem.payment_checked && (purchaseStatus === 'PO_RAISED' || purchaseStatus === 'AWAITING_DELIVERY')) {
      const isDeficient = !selectedItem.parent_is_payment_sufficient;
      if (isDeficient && !isAdminOrManager) {
        alert(
          `Cannot place order: Quotation ${selectedItem.quotation_number} has an outstanding customer payment deficit of ₹${formatCurrency(
            selectedItem.parent_deficit_amount || 0
          )}. Payment verification or Manager override is required.`
        );
        return;
      }
    }

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

  const handleToggleAvailability = async (it: LocalItem) => {
    try {
      await onVerifyAvailability(it.quotation_item_id, !it.availability_checked);
    } catch (err: any) {
      console.error(err);
    }
  };

  const handleOpenPaymentVerification = (it: LocalItem) => {
    setPaymentModalItem(it);
    setOverrideNotes('');
  };

  const handleConfirmPaymentVerification = async (adminOverride = false) => {
    if (!paymentModalItem) return;
    setIsVerifying(true);
    try {
      await onVerifyPayment(paymentModalItem.quotation_item_id, {
        verified: true,
        admin_override: adminOverride,
        override_notes: adminOverride ? overrideNotes : undefined,
      });
      setPaymentModalItem(null);
    } catch (err: any) {
      // error handled in caller
    } finally {
      setIsVerifying(false);
    }
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
            className="px-3 py-1.5 sm:py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 font-semibold focus:outline-hidden"
          >
            <option value="all">All Local Procurement Stages</option>
            <option value="unverified">⚠️ Payment Check Pending</option>
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
                  <th className="py-2.5 px-3">5-Step Procurement Pipeline</th>
                  <th className="py-2.5 px-3">Vendor / Dealer</th>
                  <th className="py-2.5 px-3 text-right">Expected Arrival</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((it) => {
                  const isAwaiting = it.purchase_status === 'AWAITING_DELIVERY';
                  const hasDeficit = !it.parent_is_payment_sufficient && (it.parent_deficit_amount || 0) > 0;

                  return (
                    <tr key={it.quotation_item_id} className="hover:bg-slate-50/60 transition-colors">
                      {/* Item Description */}
                      <td className="py-3 px-3 max-w-[220px]">
                        <div className="font-bold text-slate-900 truncate" title={it.description}>
                          {it.description}
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono flex items-center space-x-2 mt-0.5">
                          {it.brand && <span>Brand: {it.brand}</span>}
                          {it.size && <span>Size: {it.size}</span>}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                          Rate: ₹{formatCurrency(it.quoted_rate)} | Total: ₹{formatCurrency(it.total_amount)}
                        </div>
                      </td>

                      {/* Quotation & Customer */}
                      <td className="py-3 px-3 min-w-[170px]">
                        <div className="font-mono font-bold text-slate-800">{it.quotation_number}</div>
                        <div className="text-[11px] text-slate-600 mt-0.5 flex items-center space-x-1 truncate">
                          <User size={11} className="text-slate-400 shrink-0" />
                          <span className="truncate">{it.customer_name}</span>
                        </div>
                        {it.customer_phone && (
                          <div className="text-[10px] text-slate-400 font-mono flex items-center space-x-1 mt-0.5">
                            <Phone size={10} className="text-slate-400 shrink-0" />
                            <span>{it.customer_phone}</span>
                          </div>
                        )}
                      </td>

                      {/* Qty Needed */}
                      <td className="py-3 px-3 text-right font-mono font-bold text-amber-900 whitespace-nowrap">
                        {Math.round(it.required_quantity)} {it.product_type || 'boxes'}
                      </td>

                      {/* 5-Step Pipeline Column */}
                      <td className="py-3 px-3 min-w-[340px]">
                        <div className="space-y-1.5">
                          {/* Stepper Pills */}
                          <div className="flex items-center space-x-1 text-[10px] font-semibold">
                            {/* Step 1: Availability */}
                            <button
                              onClick={() => canEdit && handleToggleAvailability(it)}
                              className={`px-2 py-0.5 rounded-md flex items-center space-x-1 cursor-pointer transition-colors ${
                                it.availability_checked
                                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                  : 'bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-200'
                              }`}
                              title={it.availability_checked ? 'Availability Checked' : 'Click to verify vendor availability'}
                            >
                              <span className="font-mono font-bold">1</span>
                              <span>{it.availability_checked ? 'Available ✓' : 'Avail?'}</span>
                            </button>

                            <ArrowRight size={10} className="text-slate-300 shrink-0" />

                            {/* Step 2: Payment Checked */}
                            <button
                              onClick={() => canEdit && handleOpenPaymentVerification(it)}
                              className={`px-2 py-0.5 rounded-md flex items-center space-x-1 cursor-pointer transition-colors ${
                                it.payment_checked
                                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                  : hasDeficit
                                  ? 'bg-rose-100 hover:bg-rose-200 text-rose-800 border border-rose-300 animate-pulse'
                                  : 'bg-amber-100 hover:bg-amber-200 text-amber-800 border border-amber-300'
                              }`}
                              title={
                                it.payment_checked
                                  ? `Verified by ${it.payment_checked_by_name || 'Staff'}`
                                  : hasDeficit
                                  ? `Payment Deficit: ₹${formatCurrency(it.parent_deficit_amount || 0)}`
                                  : 'Payment Covered - Click to Verify'
                              }
                            >
                              <span className="font-mono font-bold">2</span>
                              <span>{it.payment_checked ? 'Paid ✓' : hasDeficit ? 'Deficit!' : 'Pay?'}</span>
                            </button>

                            <ArrowRight size={10} className="text-slate-300 shrink-0" />

                            {/* Step 3: PO Raised */}
                            <span
                              className={`px-2 py-0.5 rounded-md font-mono ${
                                it.purchase_status === 'PO_RAISED'
                                  ? 'bg-indigo-100 text-indigo-800 border border-indigo-200 font-bold'
                                  : 'bg-slate-100 text-slate-500'
                              }`}
                            >
                              3 PO
                            </span>

                            <ArrowRight size={10} className="text-slate-300 shrink-0" />

                            {/* Step 4: In Transit */}
                            <span
                              className={`px-2 py-0.5 rounded-md font-mono ${
                                isAwaiting
                                  ? 'bg-amber-100 text-amber-800 border border-amber-200 font-bold'
                                  : 'bg-slate-100 text-slate-500'
                              }`}
                            >
                              4 Transit
                            </span>

                            <ArrowRight size={10} className="text-slate-300 shrink-0" />

                            {/* Step 5: Arrived */}
                            <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 font-mono">
                              5 Ready
                            </span>
                          </div>

                          {/* Verification Audit Details / Deficit Alert */}
                          <div className="text-[10px]">
                            {it.payment_checked ? (
                              <span className="text-emerald-700 font-medium flex items-center space-x-1">
                                <ShieldCheck size={11} className="text-emerald-600" />
                                <span>Verified by {it.payment_checked_by_name || 'Accounts/Admin'}</span>
                              </span>
                            ) : hasDeficit ? (
                              <div className="flex items-center space-x-1 text-rose-700 font-bold">
                                <ShieldAlert size={11} className="text-rose-600 shrink-0" />
                                <span>Deficit: ₹{formatCurrency(it.parent_deficit_amount || 0)}</span>
                                {onNavigateToPayments && (
                                  <button
                                    onClick={() => onNavigateToPayments(it.quotation_number)}
                                    className="text-indigo-600 underline hover:text-indigo-800 ml-1 cursor-pointer"
                                  >
                                    Pay Now
                                  </button>
                                )}
                              </div>
                            ) : (
                              <span className="text-amber-700 font-medium flex items-center space-x-1">
                                <Clock size={11} className="text-amber-600" />
                                <span>Payment covered. Awaiting audit verification.</span>
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Vendor Details */}
                      <td className="py-3 px-3 min-w-[150px]">
                        <div className="font-semibold text-slate-800 truncate">
                          {it.vendor_name || 'Local Distributor'}
                        </div>
                        {it.vendor_contact && (
                          <div className="text-[10px] text-slate-500 font-mono flex items-center space-x-1 mt-0.5">
                            <Phone size={10} className="text-slate-400" />
                            <span>{it.vendor_contact}</span>
                          </div>
                        )}
                      </td>

                      {/* Expected Arrival */}
                      <td className="py-3 px-3 text-right whitespace-nowrap">
                        <div className="font-mono font-semibold text-slate-700 flex items-center justify-end space-x-1">
                          <Calendar size={11} className="text-slate-400" />
                          <span>{it.expected_date ? new Date(it.expected_date).toLocaleDateString('en-IN') : 'TBD'}</span>
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end space-x-1.5">
                          {canEdit && (
                            <>
                              {!it.payment_checked && (
                                <button
                                  onClick={() => handleOpenPaymentVerification(it)}
                                  className="inline-flex items-center space-x-1 px-2 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 font-bold text-[11px] cursor-pointer"
                                  title="Verify customer payment gate"
                                >
                                  <ShieldCheck size={11} />
                                  <span>Verify Pay</span>
                                </button>
                              )}

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

      {/* Payment Verification & Safety Gate Modal */}
      {paymentModalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full p-5 border border-slate-200 shadow-2xl flex flex-col space-y-4 animate-fadeIn">
            <div className="flex items-start space-x-3">
              <div
                className={`p-2.5 rounded-2xl shrink-0 ${
                  paymentModalItem.parent_is_payment_sufficient ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                }`}
              >
                {paymentModalItem.parent_is_payment_sufficient ? <ShieldCheck size={24} /> : <AlertTriangle size={24} />}
              </div>
              <div className="flex-1">
                <h3 className="font-extrabold text-slate-900 text-base">
                  {paymentModalItem.parent_is_payment_sufficient
                    ? 'Customer Payment Verification Gate'
                    : '⚠️ Insufficient Payment for Local Purchase'}
                </h3>
                <p className="text-xs text-slate-600 mt-1">
                  Verify customer payment clearance before raising PO or committing funds with the local supplier.
                </p>
              </div>
              <button
                onClick={() => setPaymentModalItem(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Financial Ledger Summary */}
            <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 text-xs space-y-2">
              <div className="flex justify-between items-center text-slate-600">
                <span>Quotation Reference:</span>
                <span className="font-mono font-bold text-slate-800">{paymentModalItem.quotation_number}</span>
              </div>
              <div className="flex justify-between items-center text-slate-600">
                <span>Customer Name:</span>
                <span className="font-semibold text-slate-800">{paymentModalItem.customer_name}</span>
              </div>
              <div className="h-px bg-slate-200 my-1" />
              <div className="flex justify-between items-center">
                <span className="text-slate-600">Total Verified Payments Received:</span>
                <span className="font-mono font-bold text-emerald-700">
                  {formatCurrency(paymentModalItem.parent_verified_paid || 0)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-600">Committed Immediate Goods Value:</span>
                <span className="font-mono font-semibold text-slate-800">
                  {formatCurrency(paymentModalItem.parent_committed_immediate_value || 0)}
                </span>
              </div>

              {paymentModalItem.parent_is_payment_sufficient ? (
                <div className="flex justify-between items-center font-bold text-emerald-700 pt-1 border-t border-emerald-200 bg-emerald-50/70 p-2 rounded-lg">
                  <span>Coverage Status:</span>
                  <span>Payment Fully Covered ✓</span>
                </div>
              ) : (
                <div className="flex justify-between items-center font-bold text-rose-700 pt-1 border-t border-rose-200 bg-rose-50/80 p-2 rounded-lg">
                  <span>Outstanding Payment Deficit:</span>
                  <span className="font-mono text-sm font-extrabold">
                    {formatCurrency(paymentModalItem.parent_deficit_amount || 0)}
                  </span>
                </div>
              )}
            </div>

            {/* Current Item Specs */}
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs">
              <div className="font-bold text-slate-900">{paymentModalItem.description}</div>
              <div className="text-slate-500 mt-0.5">
                Target: {paymentModalItem.required_quantity} boxes @ ₹{formatCurrency(paymentModalItem.quoted_rate)} = ₹
                {formatCurrency(paymentModalItem.total_amount)}
              </div>
            </div>

            {/* Admin Override Input if Deficit */}
            {!paymentModalItem.parent_is_payment_sufficient && (
              <>
                {isAdminOrManager ? (
                  <div className="space-y-1.5 pt-2 border-t border-slate-200">
                    <label className="block text-[11px] font-bold text-slate-700 uppercase">
                      Supervisor Override Notes (Admin / Manager Role Required)
                    </label>
                    <input
                      type="text"
                      value={overrideNotes}
                      onChange={(e) => setOverrideNotes(e.target.value)}
                      placeholder="Reason for overriding payment deficit..."
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-rose-500/30 text-slate-900"
                    />
                  </div>
                ) : (
                  <div className="p-2.5 rounded-xl bg-slate-100 border border-slate-200 text-slate-600 text-xs">
                    🔒 Orders with payment deficits require supervisor authorization. Please contact an Administrator or Manager to approve.
                  </div>
                )}
              </>
            )}

            {/* Modal Actions */}
            <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setPaymentModalItem(null)}
                className="px-3.5 py-2 rounded-xl border border-slate-300 hover:bg-slate-100 font-semibold text-xs text-slate-700 cursor-pointer"
              >
                Cancel
              </button>

              {onNavigateToPayments && (
                <button
                  onClick={() => {
                    const quoteNum = paymentModalItem.quotation_number;
                    setPaymentModalItem(null);
                    onNavigateToPayments(quoteNum);
                  }}
                  className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-sm cursor-pointer flex items-center space-x-1.5"
                >
                  <CreditCard size={13} />
                  <span>Record Customer Payment</span>
                </button>
              )}

              {paymentModalItem.parent_is_payment_sufficient ? (
                <button
                  onClick={() => handleConfirmPaymentVerification(false)}
                  disabled={isVerifying}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm cursor-pointer disabled:opacity-50 flex items-center space-x-1.5"
                >
                  <Check size={13} />
                  <span>{isVerifying ? 'Verifying...' : 'Verify Customer Payment'}</span>
                </button>
              ) : isAdminOrManager ? (
                <button
                  onClick={() => handleConfirmPaymentVerification(true)}
                  disabled={isVerifying}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-sm cursor-pointer disabled:opacity-50 flex items-center space-x-1.5"
                >
                  <ShieldCheck size={13} />
                  <span>{isVerifying ? 'Overriding...' : 'Override with Admin Approval'}</span>
                </button>
              ) : null}
            </div>
          </div>
        </div>
      )}

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
                  Required: <span className="font-bold text-slate-800">{selectedItem.required_quantity} boxes</span> | Quote Ref:{' '}
                  <span className="font-mono font-bold text-slate-800">{selectedItem.quotation_number}</span>
                </div>
              </div>

              {/* Payment Verification Status Badge */}
              <div
                className={`p-2.5 rounded-xl border flex items-center justify-between ${
                  selectedItem.payment_checked
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : selectedItem.parent_is_payment_sufficient
                    ? 'bg-amber-50 border-amber-200 text-amber-900'
                    : 'bg-rose-50 border-rose-200 text-rose-900'
                }`}
              >
                <div className="flex items-center space-x-2">
                  {selectedItem.payment_checked ? (
                    <ShieldCheck size={16} className="text-emerald-600" />
                  ) : (
                    <ShieldAlert size={16} className={selectedItem.parent_is_payment_sufficient ? 'text-amber-600' : 'text-rose-600'} />
                  )}
                  <div>
                    <span className="font-bold">
                      {selectedItem.payment_checked
                        ? 'Customer Payment Verified'
                        : selectedItem.parent_is_payment_sufficient
                        ? 'Payment Covered (Pending Audit Stamp)'
                        : `Payment Deficit: ₹${formatCurrency(selectedItem.parent_deficit_amount || 0)}`}
                    </span>
                    {selectedItem.payment_checked_by_name && (
                      <div className="text-[10px] text-emerald-700">
                        Signed off by {selectedItem.payment_checked_by_name}
                      </div>
                    )}
                  </div>
                </div>

                {!selectedItem.payment_checked && (
                  <button
                    type="button"
                    onClick={() => {
                      const it = selectedItem;
                      setSelectedItem(null);
                      handleOpenPaymentVerification(it);
                    }}
                    className="px-2 py-1 rounded-lg bg-white border border-slate-300 hover:bg-slate-50 text-[11px] font-bold text-slate-700 cursor-pointer shadow-2xs"
                  >
                    Verify Gate
                  </button>
                )}
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
