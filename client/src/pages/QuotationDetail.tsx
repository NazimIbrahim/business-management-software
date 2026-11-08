import React, { useState, useEffect, useMemo } from 'react';
import { useServer } from '../context/ServerContext';
import { useAuth } from '../context/AuthContext';
import { Quotation, QuotationArea, Payment, QuotationItem } from '../types';
import { ProcurementStepper } from '../components/ProcurementStepper';
import {
  ArrowLeft,
  Printer,
  Edit,
  CreditCard,
  Building,
  User,
  Users,
  IndianRupee,
  RefreshCw,
  Receipt,
  ShieldAlert,
  X,
  Lock,
  CheckCircle,
  CheckCircle2,
  Clock,
  Check,
  AlertTriangle,
  History,
  Eye,
  Calendar,
  Truck,
  PackageCheck,
  Package,
  Factory,
  Layers,
  AlertCircle,
} from 'lucide-react';
import { PdfPreviewModal } from '../components/PdfPreviewModal';
import { QuotationHistoryModal } from '../components/QuotationHistoryModal';
import { buildEncryptedProductMap, derive3LetterCode } from '../utils/encryptedCode';
import { isCeraBrand } from '../utils/discountCalculator';

interface Props {
  quotationId: number;
  onBack: () => void;
  onEdit: (id: number, type?: 'tiles' | 'sanitary') => void;
  onRecordPayment: (quotationId: number) => void;
}

export const QuotationDetail: React.FC<Props> = ({
  quotationId,
  onBack,
  onEdit,
  onRecordPayment,
}) => {
  const { fetchApi, getPdfUrl, getReceiptUrl, subscribeToEvents } = useServer();
  const { user } = useAuth();

  const [data, setData] = useState<{
    quotation: Quotation;
    areas: QuotationArea[];
    payments: Payment[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState(false);
  const [closingQuotation, setClosingQuotation] = useState(false);
  const [editWarningModal, setEditWarningModal] = useState(false);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [historyModalInitialVersion, setHistoryModalInitialVersion] = useState<number | null>(null);

  // PDF Preview State
  const [previewPdf, setPreviewPdf] = useState<{
    url: string;
    title: string;
    fileName: string;
    quotationId?: number;
    initialEncrypted?: boolean;
  } | null>(null);
  const [enlargedImage, setEnlargedImage] = useState<string | null>(null);

  // Line items view mode: Default sequence vs Grouped by Availability
  const [itemViewMode, setItemViewMode] = useState<'default' | 'availability'>('default');
  const [verifyingPaymentId, setVerifyingPaymentId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadDetail = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetchApi(`/api/quotations/${quotationId}`);
      if (!res || !res.quotation) {
        throw new Error('Quotation record was not found or returned empty data.');
      }
      setData(res);
    } catch (err: any) {
      console.error('Failed to load quotation detail:', err);
      setError(err?.message || 'Failed to load quotation details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDetail();
    const unsubscribe = subscribeToEvents((event) => {
      if (
        (['QUOTATION_UPDATED', 'QUOTATION_STATUS_CHANGED', 'PAYMENT_RECORDED'].includes(event.type) &&
          event.payload?.id === quotationId) ||
        event.payload?.quotation_id === quotationId
      ) {
        loadDetail();
      }
    });
    return () => unsubscribe();
  }, [quotationId]);

  const allQuotationItems = useMemo(() => {
    return (data?.areas || []).flatMap((a) =>
      (a.items || []).map((it) => ({
        ...it,
        area_name: it.area_name || a.area_name,
      }))
    );
  }, [data]);

  const hasAnyDispatchUpdates = useMemo(() => {
    return allQuotationItems.some(
      (it) => it.dispatch_status && it.dispatch_status !== 'Yet to Update'
    );
  }, [allQuotationItems]);

  const availabilityGroups = useMemo(() => {
    const readyStock: QuotationItem[] = [];
    const localPurchase: QuotationItem[] = [];
    const factoryOrder: QuotationItem[] = [];
    const pending: QuotationItem[] = [];

    allQuotationItems.forEach((item) => {
      const st = item.dispatch_status || 'Yet to Update';
      if (st === 'Ready Stock' || st === 'Dispatched') {
        readyStock.push(item);
      } else if (st === 'Need to Arrange from Local') {
        localPurchase.push(item);
      } else if (st === 'Factory Order') {
        factoryOrder.push(item);
      } else {
        pending.push(item);
      }
    });

    return [
      {
        id: 'ready-stock',
        label: '1. Ready Stock & Dispatched',
        subtitle: 'Available immediately in godown / Dispatched',
        color: 'emerald',
        items: readyStock,
      },
      {
        id: 'local-purchase',
        label: '2. Local Purchase Items',
        subtitle: 'Need to arrange from local distributors / market vendors',
        color: 'amber',
        items: localPurchase,
      },
      {
        id: 'factory-order',
        label: '3. Factory Order Items',
        subtitle: 'Direct mill / factory production sourcing',
        color: 'indigo',
        items: factoryOrder,
      },
      ...(pending.length > 0
        ? [
            {
              id: 'pending',
              label: '4. Stock Status Pending',
              subtitle: 'Awaiting dispatch categorization',
              color: 'slate',
              items: pending,
            },
          ]
        : []),
    ];
  }, [allQuotationItems]);

  const encryptedProductMap = useMemo(() => {
    if (!data?.quotation) return new Map<string, string>();
    return buildEncryptedProductMap(data.quotation.quotation_number || data.quotation.id, allQuotationItems);
  }, [data, allQuotationItems]);

  const formatCurrency = (val: number) => {
    return Number(val || 0).toLocaleString('en-IN', {
      maximumFractionDigits: 2,
      minimumFractionDigits: 2,
    });
  };

  const handleOpenQuotationPdf = () => {
    if (!data) return;
    const url = getPdfUrl(data.quotation.id, false);
    setPreviewPdf({
      url,
      title: `Quotation ${data.quotation.quotation_number} — ${data.quotation.customer_name}`,
      fileName: `Quotation_${data.quotation.quotation_number}.pdf`,
      quotationId: data.quotation.id,
      initialEncrypted: false,
    });
  };

  const handleOpenEncryptedQuotationPdf = () => {
    if (!data) return;
    const url = getPdfUrl(data.quotation.id, true);
    setPreviewPdf({
      url,
      title: `Quotation ${data.quotation.quotation_number} (Encrypted Export)`,
      fileName: `Quotation_${data.quotation.quotation_number}_Encrypted.pdf`,
      quotationId: data.quotation.id,
      initialEncrypted: true,
    });
  };

  const handleOpenReceiptPdf = (p: Payment) => {
    const url = getReceiptUrl(p.id);
    setPreviewPdf({
      url,
      title: `Receipt ${p.payment_number} — ${p.customer_name}`,
      fileName: `Receipt_${p.payment_number}.pdf`,
    });
  };

  const handleApproveQuotation = async () => {
    if (!data) return;
    setApproving(true);
    try {
      await fetchApi(`/api/quotations/${data.quotation.id}/status`, {
        method: 'POST',
        body: JSON.stringify({ status: 'approved' }),
      });
      loadDetail();
    } catch (err: any) {
      alert(err.message || 'Failed to approve quotation');
    } finally {
      setApproving(false);
    }
  };

  const handleCloseQuotation = async () => {
    if (!data) return;
    if (window.confirm(`Mark quotation ${data.quotation.quotation_number} as CLOSED and move to Dispatch Pipeline?`)) {
      setClosingQuotation(true);
      try {
        await fetchApi(`/api/quotations/${data.quotation.id}/status`, {
          method: 'POST',
          body: JSON.stringify({ status: 'closed' }),
        });
        loadDetail();
      } catch (err: any) {
        alert(err.message || 'Failed to close quotation');
      } finally {
        setClosingQuotation(false);
      }
    }
  };

  const handleEditClick = () => {
    if (!data) return;
    const isApproved = ['approved', 'closed'].includes(data.quotation.status?.toLowerCase());
    const isSalesperson = user?.role === 'salesperson';
    if (isSalesperson && isApproved) {
      setEditWarningModal(true);
    } else {
      onEdit(data.quotation.id, data.quotation.quotation_type || 'tiles');
    }
  };

  const handleConfirmEdit = () => {
    setEditWarningModal(false);
    if (data) {
      onEdit(data.quotation.id, data.quotation.quotation_type || 'tiles');
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 bg-slate-50 min-h-[400px]">
        <div className="text-center">
          <RefreshCw className="animate-spin text-slate-800 mx-auto mb-2" size={24} />
          <p className="text-xs font-semibold text-slate-600">Loading Quotation Record...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 bg-slate-50 min-h-[400px]">
        <div className="card p-6 max-w-md w-full text-center space-y-4 shadow-md border border-slate-200 bg-white rounded-xl">
          <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
            <AlertCircle size={24} />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">Unable to Open Quotation</h3>
            <p className="text-xs text-slate-600 mt-1 leading-relaxed">
              {error || 'The requested quotation record could not be loaded.'}
            </p>
          </div>
          <div className="flex items-center justify-center gap-2 pt-2">
            <button
              onClick={onBack}
              className="btn btn-secondary btn-sm flex items-center gap-1.5"
            >
              <ArrowLeft size={14} />
              <span>Back to Quotations</span>
            </button>
            <button
              onClick={loadDetail}
              className="btn btn-primary btn-sm flex items-center gap-1.5"
            >
              <RefreshCw size={14} />
              <span>Try Again</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  const { quotation, areas = [], payments = [] } = data;
  const isApproved = ['approved', 'closed'].includes(quotation.status?.toLowerCase());
  const isSalesperson = user?.role === 'salesperson';
  const isManagerOrAdmin = ['admin', 'manager'].includes(user?.role || '');
  const isAccountsOrAdmin = ['admin', 'accounts', 'accountant'].includes((user?.role || '').toLowerCase());
  const canExportPdf = !isSalesperson || isApproved;
  const canApprove = isManagerOrAdmin && !isApproved;

  const unverifiedPaid = (payments || [])
    .filter((p) => p.status === 'Recorded')
    .reduce((sum, p) => sum + parseFloat(String(p.amount || 0)), 0);

  const handleVerifyPayment = async (paymentId: number, targetVerified: boolean) => {
    if (
      !targetVerified &&
      !window.confirm('Are you sure you want to revert this payment to Unverified (Pending Accounts)?')
    ) {
      return;
    }
    setVerifyingPaymentId(paymentId);
    try {
      await fetchApi(`/api/payments/${paymentId}/verify`, {
        method: 'POST',
        body: JSON.stringify({ verified: targetVerified }),
      });
      loadDetail();
    } catch (err: any) {
      alert(err.message || 'Failed to update payment verification status');
    } finally {
      setVerifyingPaymentId(null);
    }
  };

  return (
    <div className="flex-1 p-4 sm:p-5 lg:p-6 space-y-4 lg:space-y-5 overflow-y-auto w-full min-w-0">
      {/* Top Header & Actions */}
      <div className="card p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <button
            onClick={onBack}
            className="btn btn-secondary btn-sm p-1.5"
            title="Back to Quotation List"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-lg font-bold font-mono text-slate-900 tracking-tight">
                {quotation.quotation_number}
              </h1>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                quotation.quotation_type === 'sanitary'
                  ? 'bg-amber-100 text-amber-900 border border-amber-300'
                  : 'bg-blue-100 text-blue-900 border border-blue-300'
              }`}>
                {quotation.quotation_type === 'sanitary' ? '🚿 Sanitary' : '🧱 Tile'}
              </span>
              <button
                type="button"
                onClick={() => setHistoryModalOpen(true)}
                className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 transition-colors flex items-center space-x-1 cursor-pointer"
                title="View previous quotes and edit history"
              >
                <History size={11} className="text-indigo-600" />
                <span>v{quotation.version || 1} History</span>
              </button>
              <span className={`badge badge-${quotation.status}`}>{quotation.status ? quotation.status.replace('_', ' ') : ''}</span>
            </div>
            <div className="flex flex-wrap items-center gap-x-2 text-xs text-slate-500 mt-0.5">
              <span>
                Quotation Date: <strong className="font-semibold text-slate-800">{new Date(quotation.quotation_date).toLocaleDateString('en-GB')}</strong>
              </span>
              {(quotation.version || 1) > 1 && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 px-1.5 py-0.2 rounded-md">
                  <span>Rev v{quotation.version}</span>
                  <span className="text-slate-400">•</span>
                  <span className="text-slate-500 font-normal">Orig: {new Date(quotation.created_at || quotation.quotation_date).toLocaleDateString('en-GB')}</span>
                </span>
              )}
              <span>• Sales Associate: <strong className="font-semibold text-slate-700">{quotation.sales_person_name}</strong></span>
              {quotation.approved_by_name && (
                <span className="font-medium text-emerald-700">
                  • Approved by: <strong className="font-bold">{quotation.approved_by_name}</strong>
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {canApprove && (
            <button
              onClick={handleApproveQuotation}
              disabled={approving}
              className="btn btn-sm bg-emerald-600 hover:bg-emerald-700 text-white font-semibold flex items-center space-x-1.5 shadow-sm"
              title="Approve this quotation as Store Manager / Admin"
            >
              <CheckCircle size={14} />
              <span>{approving ? 'Approving...' : 'Approve Quotation'}</span>
            </button>
          )}

          <button
            onClick={handleEditClick}
            className="btn btn-secondary btn-sm"
            title={isSalesperson && isApproved ? 'Editing requires re-approval' : 'Edit quotation'}
          >
            <Edit size={13} />
            <span>Edit</span>
          </button>

          <button
            type="button"
            onClick={() => setHistoryModalOpen(true)}
            className="btn btn-secondary btn-sm flex items-center space-x-1.5"
            title="View previous quotes and edit history"
          >
            <History size={13} className="text-indigo-600" />
            <span>History (v{quotation.version || 1})</span>
          </button>

          {canExportPdf ? (
            <>
              <button
                onClick={handleOpenQuotationPdf}
                className="btn btn-secondary btn-sm"
                title="View & Export Official PDF with Brand & Tile names"
              >
                <Printer size={13} />
                <span>Standard PDF</span>
              </button>

              <button
                onClick={handleOpenEncryptedQuotationPdf}
                className="btn btn-secondary btn-sm flex items-center space-x-1.5 bg-slate-900 hover:bg-black text-white border-transparent shadow-sm"
                title="Export Encrypted PDF: Brand removed, Product name replaced with random code (e.g. HSDS-AMA)"
              >
                <ShieldAlert size={13} className="text-amber-400" />
                <span>Encrypted Export</span>
              </button>
            </>
          ) : (
            <div className="inline-flex items-center space-x-1.5">
              <button
                disabled
                className="btn btn-secondary btn-sm opacity-50 cursor-not-allowed flex items-center space-x-1 bg-gray-100 text-gray-500 border-dashed"
                title="Quotation is awaiting Store Manager approval before PDF export or printing is enabled."
              >
                <Lock size={12} className="text-amber-600" />
                <span>Standard PDF (Locked)</span>
              </button>
              <button
                disabled
                className="btn btn-secondary btn-sm opacity-50 cursor-not-allowed flex items-center space-x-1 bg-gray-100 text-gray-500 border-dashed"
                title="Quotation is awaiting Store Manager approval before PDF export or printing is enabled."
              >
                <Lock size={12} className="text-amber-600" />
                <span>Encrypted Export (Locked)</span>
              </button>
            </div>
          )}

          <button
            onClick={() => onRecordPayment(quotation.id)}
            className="btn btn-primary btn-sm"
          >
            <CreditCard size={13} />
            <span>Record Payment</span>
          </button>
        </div>
      </div>

      {/* Approval Status Banner */}
      {!isApproved ? (
        <div className="bg-amber-50 border border-amber-300 rounded-lg p-3 text-xs text-amber-900 flex items-start justify-between space-x-2.5 shadow-xs">
          <div className="flex items-start space-x-2.5">
            <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold flex items-center space-x-2">
                <span>Quotation Review Mode — Pending Store Manager Approval</span>
                <span className="badge badge-in_review text-[10px]">In Review</span>
              </div>
              <p className="text-[11px] text-amber-800 mt-0.5">
                {isSalesperson
                  ? 'This quotation is saved in Review Mode. Official PDF generation and printing options will unlock immediately once approved by the Store Manager.'
                  : 'This quotation is currently awaiting Store Manager approval. Review all quantities, discounts, and line items, then click "Approve Quotation" to unlock PDF export and printing.'}
              </p>
            </div>
          </div>
          {canApprove && (
            <button
              onClick={handleApproveQuotation}
              disabled={approving}
              className="btn btn-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shrink-0"
            >
              <CheckCircle size={12} className="mr-1" />
              <span>Approve Now</span>
            </button>
          )}
        </div>
      ) : (
        <div className="bg-emerald-50 border border-emerald-300 rounded-lg p-2.5 text-xs text-emerald-950 flex items-center justify-between shadow-xs">
          <div className="flex items-center space-x-2">
            <CheckCircle size={16} className="text-emerald-600 shrink-0" />
            <div>
              <span className="font-bold">Approved by Store Manager:</span>{' '}
              <strong className="text-emerald-900 font-extrabold">{quotation.approved_by_name || 'Store Manager'}</strong>
              {quotation.approved_at && (
                <span className="text-emerald-800"> on {new Date(quotation.approved_at).toLocaleDateString('en-GB')} at {new Date(quotation.approved_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              )}
              {quotation.manager_approval_note && (
                <span className="text-[11px] text-emerald-700 ml-2 italic">({quotation.manager_approval_note})</span>
              )}
            </div>
          </div>
          <div className="flex items-center space-x-2">
            {quotation.status === 'closed' ? (
              <span className="badge text-[10px] uppercase font-bold tracking-wider bg-teal-800 text-white flex items-center space-x-1 px-2.5 py-1 rounded shadow-xs">
                <Truck size={12} className="mr-1" />
                <span>Closed (In Dispatch)</span>
              </span>
            ) : (
              <>
                <span className="badge badge-approved text-[10px] uppercase font-bold tracking-wider">Approved</span>
                {canApprove && (
                  <button
                    type="button"
                    onClick={handleCloseQuotation}
                    disabled={closingQuotation}
                    className="btn btn-xs bg-indigo-600 hover:bg-indigo-700 text-white font-bold flex items-center space-x-1 cursor-pointer shadow-xs px-2.5 py-1"
                    title="Finalize Deal and Send to Dispatch Pipeline"
                  >
                    <Truck size={12} />
                    <span>Close and Send to Dispatch</span>
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Re-Approval Warning Modal for Salespersons */}
      {editWarningModal && (
        <div className="modal-overlay">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 border border-amber-300">
            <div className="flex items-center space-x-2 text-amber-700 font-bold text-sm mb-2.5">
              <AlertTriangle size={20} />
              <span>Permission Notice: Re-Approval Required</span>
            </div>
            <p className="text-xs text-slate-700 leading-relaxed mb-4">
              This quotation was previously approved by <strong>{quotation.approved_by_name || 'Store Manager'}</strong>.
              <br /><br />
              Modifying this quotation will automatically revoke the approval and reset its status back to <strong>"In Review"</strong>.
              PDF export and printing will remain locked until your Store Manager reviews and re-approves the updated quotation.
              <br /><br />
              Do you wish to proceed with editing?
            </p>
            <div className="flex justify-end space-x-2">
              <button
                type="button"
                onClick={() => setEditWarningModal(false)}
                className="btn btn-secondary btn-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmEdit}
                className="btn btn-primary btn-sm bg-amber-600 hover:bg-amber-700 border-transparent text-white"
              >
                Proceed to Edit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Customer Box */}
        <div className="card p-4 text-xs space-y-1.5">
          <div className="flex items-center space-x-1.5 text-slate-900 font-bold tracking-wider uppercase text-[11px] mb-1">
            <User size={13} className="text-slate-700" />
            <span>Customer Profile</span>
          </div>
          <p className="font-bold text-slate-900 text-sm">{quotation.customer_name}</p>
          <p className="text-slate-600 font-mono">Contact: {quotation.customer_phone}</p>
          {quotation.customer_gstin && (
            <p className="text-slate-500 font-mono">GSTIN: {quotation.customer_gstin}</p>
          )}
          <p className="text-slate-600 mt-1">
            Site: {quotation.delivery_address || 'Ex-showroom Delivery'}
          </p>
        </div>

        {/* Project Box */}
        <div className="card p-4 text-xs space-y-1.5">
          <div className="flex items-center space-x-1.5 text-slate-900 font-bold tracking-wider uppercase text-[11px] mb-1">
            <Building size={13} className="text-slate-700" />
            <span>Project & Sales Associate</span>
          </div>
          <p className="font-bold text-slate-900 text-sm">
            {quotation.project_name || 'Standard Residential Order'}
          </p>
          <div className="space-y-1 pt-0.5">
            <div className="flex items-center justify-between text-slate-700">
              <span>Lead Closer:</span>
              <span className="font-semibold text-slate-900">{quotation.sales_person_name}</span>
            </div>

            {quotation.assisted_sales_person_name && (
              <div className="p-2 bg-indigo-50/70 rounded border border-indigo-100 text-[11px] space-y-1.5 my-1">
                <div className="flex items-center justify-between font-medium text-indigo-950">
                  <span className="inline-flex items-center space-x-1">
                    <Users size={12} className="text-indigo-600" />
                    <span>Assisted Sale (Co-Closer):</span>
                  </span>
                  <span className="font-bold">{quotation.assisted_sales_person_name}</span>
                </div>
                <div className="grid grid-cols-2 gap-1 text-[10px] text-slate-600 border-t border-indigo-100/80 pt-1">
                  <div>
                    <span className="text-slate-500">Lead ({Number(quotation.primary_sales_share_percent || 50).toFixed(0)}%):</span>{' '}
                    <strong className="text-blue-700 font-mono">₹{formatCurrency(quotation.primary_sales_share_amount || 0)}</strong>
                  </div>
                  <div className="text-right">
                    <span className="text-slate-500">Assisted ({Number(quotation.assisted_sales_share_percent || 50).toFixed(0)}%):</span>{' '}
                    <strong className="text-emerald-700 font-mono">₹{formatCurrency(quotation.assisted_sales_share_amount || 0)}</strong>
                  </div>
                </div>
              </div>
            )}
          </div>
          <div className="space-y-1 text-slate-600 pt-0.5">
            <div className="flex items-center space-x-1.5">
              <span>Quotation Date:</span>
              <strong className="text-slate-800 font-semibold">{new Date(quotation.quotation_date).toLocaleDateString('en-GB')}</strong>
              {(quotation.version || 1) > 1 && (
                <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-indigo-100 text-indigo-800 border border-indigo-200">
                  v{quotation.version} Revised Date
                </span>
              )}
            </div>
            {(quotation.version || 1) > 1 && quotation.created_at && (
              <div className="text-[11px] text-slate-500 flex items-center space-x-1">
                <span>Original Issue Date:</span>
                <span className="font-medium text-slate-700">{new Date(quotation.created_at).toLocaleDateString('en-GB')}</span>
              </div>
            )}
          </div>
          {quotation.approved_by_name && (
            <p className="text-emerald-700 font-medium">Approved by: {quotation.approved_by_name}</p>
          )}
        </div>

        {/* Financial Summary Box */}
        <div className="card p-4 text-xs space-y-1.5">
          <div className="flex items-center space-x-1.5 text-slate-900 font-bold tracking-wider uppercase text-[11px] mb-1">
            <IndianRupee size={13} className="text-slate-700" />
            <span>Financial Settlement</span>
          </div>

          {Number(quotation.discount_amount || 0) > 0 ? (
            <>
              <div className="flex justify-between text-slate-500">
                <span>List Gross Total:</span>
                <span className="tabular-nums">
                  ₹ {formatCurrency(Number(quotation.gross_total || 0) + Number(quotation.discount_amount || 0))}
                </span>
              </div>
              <div className="flex justify-between text-emerald-700 font-medium">
                <span>Direct Trade Discount ({quotation.discount_percent}%):</span>
                <span className="tabular-nums">-₹ {formatCurrency(quotation.discount_amount)}</span>
              </div>
              <div className="flex justify-between text-slate-700 font-medium">
                <span>Taxable Total:</span>
                <span className="tabular-nums">₹ {formatCurrency(quotation.taxable_amount || quotation.gross_total)}</span>
              </div>
            </>
          ) : (
            <div className="flex justify-between text-slate-600">
              <span>Gross Total:</span>
              <span className="tabular-nums">₹ {formatCurrency(quotation.gross_total)}</span>
            </div>
          )}

          <div className="flex justify-between text-slate-900 font-bold border-t border-slate-200 pt-1">
            <span>Net Payable:</span>
            <span className="font-bold text-slate-900 text-sm tabular-nums">
              ₹ {formatCurrency(quotation.net_total)}
            </span>
          </div>
          <div className="flex justify-between text-emerald-700 font-medium">
            <span>Verified Paid:</span>
            <span className="tabular-nums font-semibold">
              ₹ {formatCurrency(quotation.total_paid || 0)}
            </span>
          </div>
          {unverifiedPaid > 0 && (
            <div className="flex justify-between text-amber-800 text-[11px] font-medium bg-amber-50 px-2 py-1 rounded border border-amber-200">
              <span className="flex items-center gap-1">
                <Clock size={11} className="text-amber-600" />
                <span>Pending Accounts Verification:</span>
              </span>
              <span className="tabular-nums font-bold">₹ {formatCurrency(unverifiedPaid)}</span>
            </div>
          )}
          <div className="flex justify-between text-amber-700 font-bold border-t border-slate-200 pt-1.5">
            <span>Balance Due:</span>
            <span className="tabular-nums">₹ {formatCurrency(quotation.balance_due || 0)}</span>
          </div>
        </div>

      {/* Executive Revision & Audit Card */}
      {(quotation.version || 1) > 1 && (
        <div className="relative overflow-hidden rounded-xl border border-indigo-200 bg-gradient-to-r from-slate-50 via-white to-indigo-50/40 p-4 shadow-sm">
          {/* Left vertical accent bar */}
          <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b from-indigo-600 via-blue-600 to-amber-500" />

          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3.5 pl-1.5">
            {/* Left Column: Icon + Badge + Description */}
            <div className="flex items-start sm:items-center space-x-3.5">
              <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center font-bold text-sm shrink-0 shadow-sm border border-slate-700">
                <History size={20} className="text-cyan-400" />
              </div>
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-slate-900 text-sm tracking-tight flex items-center gap-1.5">
                    Quotation Revision Active
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-indigo-100 text-indigo-900 border border-indigo-200">
                      Version {quotation.version}
                    </span>
                  </span>
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                    <Calendar size={11} className="text-emerald-600" />
                    Revised: {new Date(quotation.quotation_date).toLocaleDateString('en-GB')}
                  </span>
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                    Original: {new Date(quotation.created_at || quotation.quotation_date).toLocaleDateString('en-GB')}
                  </span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed max-w-2xl">
                  This quotation was updated and re-versioned. The active quotation date reflects the date of revision, while previous quotation snapshots (rates, quantities, line items) remain permanently archived.
                </p>
              </div>
            </div>

            {/* Right Column: High-Contrast Corporate Action Buttons */}
            <div className="flex items-center flex-wrap gap-2 shrink-0 self-end lg:self-center">
              <button
                type="button"
                onClick={() => {
                  setHistoryModalInitialVersion((quotation.version || 2) - 1);
                  setHistoryModalOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 active:scale-98 transition-all shadow-sm border border-slate-800 cursor-pointer"
                title={`Review previous Version ${(quotation.version || 2) - 1} snapshot`}
              >
                <Eye size={14} className="text-cyan-400" />
                <span>Review Previous Quote (v{(quotation.version || 2) - 1})</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setHistoryModalInitialVersion(null);
                  setHistoryModalOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 active:scale-98 transition-all border border-slate-300 shadow-2xs cursor-pointer"
                title="View full audit trail and version comparison"
              >
                <History size={14} className="text-indigo-600" />
                <span>Full History</span>
              </button>
            </div>
          </div>
        </div>
      )}
      </div>

      {/* Items Display Switcher (Default View vs Group by Availability) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
        <div className="flex items-center space-x-2">
          <div className="w-2.5 h-2.5 rounded-full bg-indigo-600" />
          <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
            Items Display Mode:
          </span>
          {hasAnyDispatchUpdates ? (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
              Dispatch Updated
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
              Standard View
            </span>
          )}
        </div>

        <div className="inline-flex rounded-lg bg-slate-100 p-0.5 border border-slate-200 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setItemViewMode('default')}
            className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all flex items-center space-x-1.5 cursor-pointer ${
              itemViewMode === 'default'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Layers size={13} />
            <span>Default View ({quotation.quotation_type === 'sanitary' ? 'Sanitary List' : 'By Area'})</span>
          </button>
          <button
            type="button"
            onClick={() => setItemViewMode('availability')}
            className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all flex items-center space-x-1.5 cursor-pointer ${
              itemViewMode === 'availability'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <PackageCheck size={13} />
            <span>Group by Availability (Ready Stock → Local → Factory)</span>
          </button>
        </div>
      </div>

      {itemViewMode === 'availability' ? (
        <div className="space-y-4">
          {availabilityGroups.map((group) => {
            if (group.items.length === 0) return null;
            return (
              <div key={group.id} className="card overflow-hidden shadow-2xs">
                {/* Group Header */}
                <div
                  className={`px-4 py-2.5 border-b font-bold text-xs flex flex-wrap items-center justify-between gap-2 ${
                    group.color === 'emerald'
                      ? 'bg-emerald-50/90 border-emerald-200 text-emerald-950'
                      : group.color === 'amber'
                      ? 'bg-amber-50/90 border-amber-200 text-amber-950'
                      : group.color === 'indigo'
                      ? 'bg-indigo-50/90 border-indigo-200 text-indigo-950'
                      : 'bg-slate-100 border-slate-200 text-slate-800'
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    <span
                      className={`w-2.5 h-2.5 rounded-full ${
                        group.color === 'emerald'
                          ? 'bg-emerald-600'
                          : group.color === 'amber'
                          ? 'bg-amber-500'
                          : group.color === 'indigo'
                          ? 'bg-indigo-600'
                          : 'bg-slate-400'
                      }`}
                    />
                    <span className="uppercase tracking-wider">{group.label}</span>
                    <span className="text-[11px] font-normal opacity-75 hidden sm:inline">
                      ({group.subtitle})
                    </span>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                      group.color === 'emerald'
                        ? 'bg-emerald-100 text-emerald-900 border border-emerald-200'
                        : group.color === 'amber'
                        ? 'bg-amber-100 text-amber-900 border border-amber-200'
                        : group.color === 'indigo'
                        ? 'bg-indigo-100 text-indigo-900 border border-indigo-200'
                        : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {group.items.length} {group.items.length === 1 ? 'item' : 'items'}
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-600 bg-slate-50/60 text-[11px]">
                        <th className="py-2.5 px-3 text-center w-10">#</th>
                        <th className="py-2.5 px-3 w-16 text-center">Image</th>
                        <th className="py-2.5 px-3 min-w-[200px]">Item Description</th>
                        <th className="py-2.5 px-3 w-32">Area / Section</th>
                        <th className="py-2.5 px-3 text-right w-24">Qty</th>
                        <th className="py-2.5 px-3 text-right w-28">Rate (₹)</th>
                        <th className="py-2.5 px-3 text-right w-32 font-bold">Total (₹)</th>
                        <th className="py-2.5 px-3 w-36">Stock Status</th>
                        <th className="py-2.5 px-3 w-32">Expected Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {group.items.map((item, gIdx) => {
                        const totalQty =
                          item.quantity_boxes > 0
                            ? `${item.quantity_boxes} ${item.product_type || (quotation.quotation_type === 'sanitary' ? 'Nos' : 'boxes')}`
                            : item.quantity_sqft > 0
                            ? `${item.quantity_sqft} sqft`
                            : '1 nos';

                        return (
                          <React.Fragment key={item.id || gIdx}>
                            <tr className="hover:bg-slate-50/60 transition-colors">
                              <td className="py-2.5 px-3 text-center text-slate-400 font-mono">
                                {gIdx + 1}
                              </td>
                              <td className="py-2.5 px-3 text-center">
                                {item.item_image ? (
                                  <img
                                    src={item.item_image}
                                    alt={item.description}
                                    onClick={() => setEnlargedImage(item.item_image || null)}
                                    className="w-10 h-10 object-cover rounded-lg border border-slate-200 shadow-2xs mx-auto cursor-pointer hover:opacity-90"
                                    title="Click to view full image"
                                  />
                                ) : (
                                  <span className="text-slate-400 text-xs">-</span>
                                )}
                              </td>
                              <td className="py-2.5 px-3">
                                <div className="font-semibold text-slate-900">
                                  {item.description}
                                </div>
                                <div className="text-[10px] text-slate-500 font-mono mt-0.5 flex flex-wrap items-center gap-x-2">
                                  {item.item_code && (
                                    <span className="bg-slate-100 px-1 rounded font-semibold text-slate-700">
                                      {item.item_code}
                                    </span>
                                  )}
                                  {item.brand && <span>Brand: {item.brand}</span>}
                                  {item.size && <span>Size: {item.size}</span>}
                                </div>
                              </td>
                              <td className="py-2.5 px-3 text-slate-600 font-medium text-xs">
                                {item.area_name || 'General Area'}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                                {totalQty}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono text-slate-700 tabular-nums">
                                ₹ {formatCurrency(item.rate_per_box || item.rate_per_sqft || 0)}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-950 tabular-nums">
                                ₹ {formatCurrency(item.total_amount)}
                              </td>
                              <td className="py-2.5 px-3">
                                <span
                                  className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
                                    item.dispatch_status === 'Ready Stock'
                                      ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                                      : item.dispatch_status === 'Dispatched'
                                      ? 'bg-teal-100 text-teal-900 border border-teal-300'
                                      : item.dispatch_status === 'Need to Arrange from Local'
                                      ? 'bg-amber-100 text-amber-900 border border-amber-300'
                                      : item.dispatch_status === 'Factory Order'
                                      ? 'bg-indigo-100 text-indigo-900 border border-indigo-300'
                                      : 'bg-slate-100 text-slate-600 border border-slate-200'
                                  }`}
                                >
                                  {item.dispatch_status || 'Yet to Update'}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-slate-600 font-mono text-xs">
                                {item.expected_dispatch_date
                                  ? new Date(item.expected_dispatch_date).toLocaleDateString('en-GB')
                                  : quotation.expected_dispatch_date
                                  ? new Date(quotation.expected_dispatch_date).toLocaleDateString('en-GB')
                                  : '-'}
                              </td>
                            </tr>

                            {/* Minimalist Horizontal Procurement Stepper for Local Purchase and Factory Orders */}
                            {(item.dispatch_status === 'Need to Arrange from Local' ||
                              item.dispatch_status === 'Factory Order' ||
                              Boolean(item.procurement_status)) && (
                              <tr className="bg-slate-50/50 border-b border-slate-200">
                                <td colSpan={9} className="p-3">
                                  <ProcurementStepper
                                    status={item.dispatch_status || 'Need to Arrange from Local'}
                                    procurementStatus={item.procurement_status}
                                    procurementNotes={item.procurement_notes}
                                    isViewOnly={true}
                                    itemName={item.description}
                                  />
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Default View: Sanitary vs Tiles */
        quotation.quotation_type === 'sanitary' ? (
          <div className="card overflow-hidden">
            <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 font-bold text-xs text-slate-900 uppercase tracking-wide flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                <span>Sanitary Ware Line Items</span>
              </div>
              <span className="text-[11px] font-normal text-slate-500">
                Total: {allQuotationItems.length} items ({allQuotationItems.reduce((acc, it) => acc + (it.quantity_boxes || 1), 0)} Nos)
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-600 bg-slate-50/50 text-[11px]">
                    <th className="py-2.5 px-3 text-center w-10">Sl</th>
                    <th className="py-2.5 px-3 w-16 text-center">Image</th>
                    <th className="py-2.5 px-3 w-32">Item Code</th>
                    <th className="py-2.5 px-3 min-w-[200px]">Item Description</th>
                    <th className="py-2.5 px-3 text-right w-24">Qty (Nos)</th>
                    <th className="py-2.5 px-3 text-right w-28">MRP (₹)</th>
                    <th className="py-2.5 px-3 text-right w-24">Discount %</th>
                    <th className="py-2.5 px-3 text-right w-28">Discounted Price</th>
                    <th className="py-2.5 px-3 text-right w-32 font-bold">Total (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {allQuotationItems.length > 0 ? (
                    allQuotationItems.map((item, idx) => (
                      <tr key={item.id || idx} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-2.5 px-3 text-center text-slate-400 font-mono">
                          {item.sl_no || idx + 1}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {item.item_image ? (
                            <img
                              src={item.item_image}
                              alt={item.item_code}
                              onClick={() => setEnlargedImage(item.item_image || null)}
                              className="w-10 h-10 object-cover rounded-lg border border-slate-200 shadow-2xs mx-auto cursor-pointer hover:opacity-90"
                              title="Click to view full image"
                            />
                          ) : (
                            <span className="text-slate-400 text-xs">-</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                          {item.item_code || item.size || '-'}
                        </td>
                        <td className="py-2.5 px-3 font-medium text-slate-800">
                          {item.description}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                          {item.quantity_boxes || 1} Nos
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-600 font-mono tabular-nums">
                          ₹ {formatCurrency(item.mrp_price || item.base_rate_per_box || item.rate_per_box || 0)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-amber-800 font-semibold tabular-nums">
                          {Number(item.discount_percent || 0) > 0 ? `${item.discount_percent}%` : '-'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900 tabular-nums">
                          ₹ {formatCurrency(item.rate_per_box)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-950 tabular-nums">
                          ₹ {formatCurrency(item.total_amount)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={9} className="py-6 text-center text-slate-400">
                        No sanitary items recorded in this quotation.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* Room-wise Items */
          <div className="space-y-3">
            <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Itemized Areas & Tile Specifications
            </h2>

            {areas.map((area) => (
              <div key={area.id} className="card overflow-hidden">
                <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 font-bold text-xs text-slate-900 uppercase tracking-wide">
                  AREA: {area.area_name}
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-600 bg-slate-50/50 text-[11px]">
                        <th className="py-2 px-3 text-center w-8">Sl</th>
                        <th className="py-2 px-3">Description</th>
                        <th className="py-2 px-3">Brand</th>
                        <th className="py-2 px-3">Size</th>
                        <th className="py-2 px-2.5">Type</th>
                        <th className="py-2 px-3 text-right">Cov/Box</th>
                        <th className="py-2 px-3 text-right">Sqft</th>
                        <th className="py-2 px-3 text-right">Rate/Sqft</th>
                        <th className="py-2 px-3 text-right">Boxes/Qty</th>
                        <th className="py-2 px-3 text-right">Rate/Unit</th>
                        <th className="py-2 px-3 text-right">Total (₹)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {area.items && area.items.length > 0 ? (
                        area.items.map((item) => {
                          const pType = (item.product_type || 'box').toLowerCase();
                          const badgeStyles: Record<string, { label: string; cls: string }> = {
                            box: { label: 'Box', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
                            pieces: { label: 'Pcs', cls: 'bg-purple-50 text-purple-700 border-purple-200' },
                            sqft: { label: 'Sq.Ft', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
                            bags: { label: 'Bags', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
                            nos: { label: 'Nos', cls: 'bg-slate-100 text-slate-700 border-slate-200' },
                          };
                          const badge = badgeStyles[pType] || badgeStyles['box'];

                          return (
                            <tr key={item.id} className="hover:bg-slate-50/60 transition-colors">
                              <td className="py-2 px-3 text-center text-slate-400 font-mono">
                                {item.sl_no}
                              </td>
                              <td className="py-2 px-3 text-slate-900">
                                <div className="font-semibold">{item.description}</div>
                                <div className="text-[10px] text-slate-400 font-mono mt-0.5 flex items-center space-x-1">
                                  <span>Ref:</span>
                                  <span className="bg-amber-50 text-amber-800 font-semibold px-1 rounded border border-amber-200/60" title="Masked product code on Encrypted Export">
                                    {item.encrypted_code || encryptedProductMap.get((item.description || '').trim()) || derive3LetterCode(item.description)}
                                  </span>
                                </div>
                              </td>
                              <td className="py-2 px-3 text-slate-600">{item.brand}</td>
                              <td className="py-2 px-3 text-slate-600 font-mono">{item.size}</td>
                              <td className="py-2 px-2.5">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${badge.cls}`}>
                                  {badge.label}
                                </span>
                              </td>
                              <td className="py-2 px-3 text-right text-slate-600 tabular-nums">
                                {pType === 'box' ? Number(item.coverage_area).toFixed(1) : '-'}
                              </td>
                              <td className="py-2 px-3 text-right font-medium tabular-nums">
                                {pType === 'box' || pType === 'sqft' ? item.quantity_sqft : '-'}
                              </td>
                              <td className="py-2 px-3 text-right tabular-nums">
                                {pType === 'box' || pType === 'sqft' ? (
                                  <div>
                                    <div>₹ {formatCurrency(item.rate_per_sqft)}</div>
                                    {Number(item.discount_percent || 0) > 0 ? (
                                      <div className="text-[10px] text-emerald-700 font-medium">
                                        (-{item.discount_percent}%) <span className="line-through text-slate-400">₹{formatCurrency(item.base_rate_per_sqft || item.rate_per_sqft)}</span>
                                      </div>
                                    ) : isCeraBrand(item.brand) && Number(quotation.discount_amount || 0) > 0 ? (
                                      <div className="text-[10px] text-amber-700 font-medium">CERA (0%)</div>
                                    ) : null}
                                  </div>
                                ) : (
                                  '-'
                                )}
                              </td>
                              <td className="py-2 px-3 text-right text-slate-700 font-semibold tabular-nums">
                                {pType === 'sqft'
                                  ? '-'
                                  : `${item.quantity_boxes} ${
                                      pType === 'bags'
                                        ? 'Bags'
                                        : pType === 'pieces'
                                        ? 'Pcs'
                                        : pType === 'nos'
                                        ? 'Nos'
                                        : 'Boxes'
                                    }`}
                              </td>
                              <td className="py-2 px-3 text-right text-slate-600 tabular-nums">
                                {pType === 'sqft' ? (
                                  '-'
                                ) : (
                                  <div>
                                    <div>₹ {formatCurrency(item.rate_per_box)}</div>
                                    {Number(item.discount_percent || 0) > 0 ? (
                                      <div className="text-[10px] text-emerald-700 font-medium">
                                        (-{item.discount_percent}%) <span className="line-through text-slate-400">₹{formatCurrency(item.base_rate_per_box || item.rate_per_box)}</span>
                                      </div>
                                    ) : isCeraBrand(item.brand) && Number(quotation.discount_amount || 0) > 0 ? (
                                      <div className="text-[10px] text-amber-700 font-medium">CERA (0%)</div>
                                    ) : null}
                                  </div>
                                )}
                              </td>
                              <td className="py-2 px-3 text-right font-bold text-slate-900 tabular-nums">
                                <div>₹ {formatCurrency(item.total_amount)}</div>
                                {Number(item.discount_percent || 0) > 0 && Number(item.discount_amount || 0) > 0 && (
                                  <div className="text-[10px] text-slate-400 line-through font-normal">
                                    ₹ {formatCurrency(Number(item.total_amount) + Number(item.discount_amount))}
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={11} className="py-4 text-center text-slate-400">
                            No line items recorded in this area.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* Payment History */}
      <div className="card p-4">
        <div className="flex justify-between items-center mb-3">
          <div>
            <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Payments & Receipts History
            </h2>
            <p className="text-[11px] text-slate-500">
              Payments recorded and linked to this quotation
            </p>
          </div>
          <button
            onClick={() => onRecordPayment(quotation.id)}
            className="btn btn-secondary btn-sm"
          >
            <CreditCard size={13} />
            <span>Record Payment</span>
          </button>
        </div>

        {payments && payments.length > 0 ? (
          <div className="overflow-x-auto border border-slate-200 rounded-md">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-600 bg-slate-50 text-[11px]">
                  <th className="py-2.5 px-3">Receipt Ref</th>
                  <th className="py-2.5 px-3">Payment Date</th>
                  <th className="py-2.5 px-3">Mode</th>
                  <th className="py-2.5 px-3">Reference / Txn #</th>
                  <th className="py-2.5 px-3 text-right">Amount Received</th>
                  <th className="py-2.5 px-3">Recorded By</th>
                  <th className="py-2.5 px-3 text-center">Accounts Verification</th>
                  <th className="py-2.5 px-3 text-center">Receipt PDF & Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {payments.map((p) => {
                  const isVerified = ['Cleared', 'Verified'].includes(p.status);
                  const isPending = p.status === 'Recorded';

                  return (
                    <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-2.5 px-3 font-mono font-semibold text-slate-900 whitespace-nowrap">
                        {p.payment_number}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">
                        {new Date(p.payment_date).toLocaleDateString('en-GB')}
                      </td>
                      <td className="py-2.5 px-3 text-slate-700 whitespace-nowrap">{p.payment_mode}</td>
                      <td className="py-2.5 px-3 text-slate-500 font-mono text-[11px] whitespace-nowrap">
                        {p.reference_number || '-'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold tabular-nums whitespace-nowrap">
                        <span className={isVerified ? 'text-emerald-700' : 'text-amber-800'}>
                          ₹ {formatCurrency(p.amount)}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-slate-800">
                            {p.recorded_by_name || 'System'}
                          </span>
                          {p.recorded_by_role && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-slate-100 text-slate-600 border border-slate-200 capitalize">
                              {p.recorded_by_role}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        {isVerified ? (
                          <div className="inline-flex flex-col items-center">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                              <CheckCircle2 size={12} className="text-emerald-600" />
                              <span>Verified</span>
                            </span>
                            {p.verified_by_name && (
                              <span className="text-[10px] text-slate-400 mt-0.5">
                                by {p.verified_by_name}
                              </span>
                            )}
                          </div>
                        ) : isPending ? (
                          <div className="inline-flex flex-col items-center">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800 border border-amber-300">
                              <Clock size={12} className="text-amber-600" />
                              <span>Not Verified</span>
                            </span>
                            <span className="text-[10px] text-amber-700/80 mt-0.5">
                              Pending Accounts
                            </span>
                          </div>
                        ) : (
                          <span className="badge badge-secondary">{p.status}</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5 justify-center">
                          <button
                            onClick={() => handleOpenReceiptPdf(p)}
                            className="btn btn-secondary btn-xs flex items-center gap-1"
                            title="View Standard A4 Portrait Receipt"
                          >
                            <Receipt size={12} />
                            <span>Receipt</span>
                          </button>

                          {isAccountsOrAdmin && (
                            <>
                              {isPending ? (
                                <button
                                  onClick={() => handleVerifyPayment(p.id, true)}
                                  disabled={verifyingPaymentId === p.id}
                                  className="btn btn-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold flex items-center gap-1 shadow-xs"
                                  title="Verify Amount Received in Bank Account"
                                >
                                  {verifyingPaymentId === p.id ? (
                                    <RefreshCw size={11} className="animate-spin" />
                                  ) : (
                                    <Check size={11} />
                                  )}
                                  <span>Verify</span>
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleVerifyPayment(p.id, false)}
                                  disabled={verifyingPaymentId === p.id}
                                  className="text-[11px] text-slate-400 hover:text-rose-600 px-1.5 py-0.5 rounded transition-colors"
                                  title="Revert to Not Verified"
                                >
                                  Unverify
                                </button>
                              )}
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
        ) : (
          <p className="text-xs text-slate-400 py-6 text-center">
            No payments recorded against this quotation yet.
          </p>
        )}
      </div>

      {/* In-App PDF Preview Modal */}
      {previewPdf && (
        <PdfPreviewModal
          isOpen={true}
          onClose={() => setPreviewPdf(null)}
          pdfUrl={previewPdf.url}
          title={previewPdf.title}
          fileName={previewPdf.fileName}
          quotationId={previewPdf.quotationId}
          initialEncrypted={previewPdf.initialEncrypted}
        />
      )}

      {/* Enlarged Image Lightbox Modal */}
      {enlargedImage && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setEnlargedImage(null)}
        >
          <div
            className="relative bg-white rounded-2xl p-2 max-w-lg max-h-[80vh] overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={enlargedImage}
              alt="Sanitary Product"
              className="max-w-full max-h-[75vh] object-contain rounded-xl"
            />
            <button
              type="button"
              onClick={() => setEnlargedImage(null)}
              className="absolute top-4 right-4 bg-black/60 hover:bg-black text-white p-1.5 rounded-full transition-colors cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Quotation Edit & Version History Modal */}
      {historyModalOpen && (
        <QuotationHistoryModal
          quotationId={quotation.id}
          quotationNumber={quotation.quotation_number}
          isOpen={historyModalOpen}
          onClose={() => {
            setHistoryModalOpen(false);
            setHistoryModalInitialVersion(null);
          }}
          onRestored={() => {
            loadDetail();
          }}
          initialVersion={historyModalInitialVersion || undefined}
        />
      )}
    </div>
  );
};
