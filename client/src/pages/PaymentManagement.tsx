import React, { useState, useEffect } from 'react';
import { useServer } from '../context/ServerContext';
import { useAuth } from '../context/AuthContext';
import { Payment, Quotation } from '../types';
import {
  CreditCard,
  Plus,
  Printer,
  RefreshCw,
  X,
  AlertCircle,
  CheckCircle2,
  Clock,
  Check,
  ShieldCheck,
  RotateCcw,
} from 'lucide-react';
import { PdfPreviewModal } from '../components/PdfPreviewModal';

export const PaymentManagement: React.FC = () => {
  const { fetchApi, getReceiptUrl, subscribeToEvents } = useServer();
  const { user } = useAuth();
  const isAccountsOrAdmin = user?.role === 'admin' || user?.role === 'manager';

  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'verified' | 'pending'>('all');

  // Summary Metrics
  const [totalCollected, setTotalCollected] = useState(0);
  const [verifiedAmount, setVerifiedAmount] = useState(0);
  const [pendingAmount, setPendingAmount] = useState(0);
  const [verifiedCount, setVerifiedCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);

  // New Payment Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [selectedQuotationId, setSelectedQuotationId] = useState<number | null>(null);
  const [amount, setAmount] = useState<string>('');
  const [paymentMode, setPaymentMode] = useState<string>('Bank Transfer (NEFT/RTGS/IMPS)');
  const [paymentDate, setPaymentDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [referenceNumber, setReferenceNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [isVerifiedParam, setIsVerifiedParam] = useState<boolean>(isAccountsOrAdmin);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Verifying action loading state
  const [verifyingId, setVerifyingId] = useState<number | null>(null);

  // PDF Preview State
  const [previewPdf, setPreviewPdf] = useState<{ url: string; title: string; fileName: string } | null>(null);

  const loadPayments = async () => {
    setLoading(true);
    try {
      let queryParam = '';
      if (statusFilter === 'verified') queryParam = '&status=verified';
      if (statusFilter === 'pending') queryParam = '&status=pending';

      const res = await fetchApi(`/api/payments?limit=100${queryParam}`);
      setPayments(res.payments || []);
      setTotalCollected(res.summary?.totalCollected || 0);
      setVerifiedAmount(res.summary?.verifiedAmount || 0);
      setPendingAmount(res.summary?.pendingAmount || 0);
      setVerifiedCount(res.summary?.verifiedCount || 0);
      setPendingCount(res.summary?.pendingCount || 0);
    } catch (err) {
      console.error('Failed to load payments:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPayments();
  }, [statusFilter]);

  useEffect(() => {
    const unsubscribe = subscribeToEvents((event) => {
      if (['PAYMENT_RECORDED'].includes(event.type)) {
        loadPayments();
      }
    });
    return () => unsubscribe();
  }, [statusFilter]);

  const openPaymentModal = async () => {
    setError(null);
    setIsVerifiedParam(isAccountsOrAdmin);
    try {
      const res = await fetchApi('/api/quotations?status=approved&limit=100');
      setQuotations(res.quotations || []);
      if (res.quotations && res.quotations.length > 0) {
        setSelectedQuotationId(res.quotations[0].id);
        setAmount(String(res.quotations[0].balance_due || ''));
      }
      setModalOpen(true);
    } catch (err) {
      alert('Failed to load approved quotations');
    }
  };

  const selectedQuotation = quotations.find((q) => q.id === selectedQuotationId);

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!selectedQuotationId || !amount) {
      setError('Please select a quotation and specify the payment amount');
      return;
    }

    setSubmitting(true);
    try {
      await fetchApi('/api/payments', {
        method: 'POST',
        body: JSON.stringify({
          quotation_id: selectedQuotationId,
          amount: parseFloat(amount),
          payment_mode: paymentMode,
          payment_date: paymentDate,
          reference_number: referenceNumber,
          notes,
          is_verified: isAccountsOrAdmin ? isVerifiedParam : false,
        }),
      });

      setModalOpen(false);
      setAmount('');
      setReferenceNumber('');
      setNotes('');
      loadPayments();
    } catch (err: any) {
      setError(err.message || 'Payment submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyToggle = async (paymentId: number, targetVerified: boolean) => {
    if (
      targetVerified === false &&
      !window.confirm('Are you sure you want to revert this payment to Unverified (Pending Accounts)?')
    ) {
      return;
    }
    setVerifyingId(paymentId);
    try {
      await fetchApi(`/api/payments/${paymentId}/verify`, {
        method: 'POST',
        body: JSON.stringify({ verified: targetVerified }),
      });
      await loadPayments();
    } catch (err: any) {
      alert(err.message || 'Failed to update verification status');
    } finally {
      setVerifyingId(null);
    }
  };

  const handleOpenReceipt = (p: Payment) => {
    const url = getReceiptUrl(p.id);
    setPreviewPdf({
      url,
      title: `Payment Receipt ${p.payment_number} — ${p.customer_name}`,
      fileName: `Receipt_${p.payment_number}.pdf`,
    });
  };

  const formatCurrency = (val: number) => {
    return Number(val || 0).toLocaleString('en-IN', {
      maximumFractionDigits: 2,
      minimumFractionDigits: 2,
    });
  };

  return (
    <div className="flex-1 p-4 sm:p-5 lg:p-6 space-y-4 overflow-y-auto w-full min-w-0">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <span>Payments & Receipts</span>
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
              Audit & Verification Desk
            </span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Log advance receipts, sales collections, and verify funds received in company accounts
          </p>
        </div>

        <button onClick={openPaymentModal} className="btn btn-primary btn-sm flex items-center gap-1.5 shadow-xs">
          <Plus size={14} />
          <span>Record New Payment</span>
        </button>
      </div>

      {/* KPI Metric Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="card p-3.5 bg-white border border-slate-200 flex items-center justify-between">
          <div>
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Total Recorded Receipts</div>
            <div className="text-lg font-bold text-slate-900 mt-0.5 tabular-nums">
              ₹ {formatCurrency(totalCollected)}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">Across all payments</div>
          </div>
          <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center text-slate-700">
            <CreditCard size={18} />
          </div>
        </div>

        <div className="card p-3.5 bg-emerald-50/50 border border-emerald-200 flex items-center justify-between">
          <div>
            <div className="text-[11px] font-semibold text-emerald-800 uppercase tracking-wider flex items-center gap-1">
              <CheckCircle2 size={12} className="text-emerald-600" />
              <span>Verified Collections</span>
            </div>
            <div className="text-lg font-bold text-emerald-900 mt-0.5 tabular-nums">
              ₹ {formatCurrency(verifiedAmount)}
            </div>
            <div className="text-[11px] text-emerald-700 mt-0.5 font-medium">
              {verifiedCount} receipt{verifiedCount !== 1 ? 's' : ''} verified & credited
            </div>
          </div>
          <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-700">
            <ShieldCheck size={18} />
          </div>
        </div>

        <div className="card p-3.5 bg-amber-50/50 border border-amber-200 flex items-center justify-between">
          <div>
            <div className="text-[11px] font-semibold text-amber-800 uppercase tracking-wider flex items-center gap-1">
              <Clock size={12} className="text-amber-600" />
              <span>Pending Accounts Verification</span>
            </div>
            <div className="text-lg font-bold text-amber-900 mt-0.5 tabular-nums">
              ₹ {formatCurrency(pendingAmount)}
            </div>
            <div className="text-[11px] text-amber-700 mt-0.5 font-medium">
              {pendingCount} receipt{pendingCount !== 1 ? 's' : ''} awaiting accounts confirmation
            </div>
          </div>
          <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center text-amber-700">
            <Clock size={18} />
          </div>
        </div>
      </div>

      {/* Filter Tabs & Payments Table */}
      <div className="card overflow-hidden border border-slate-200">
        <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
          {/* Tabs */}
          <div className="flex items-center gap-1 bg-slate-200/70 p-0.5 rounded-lg text-xs font-semibold">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1 rounded-md transition-colors ${
                statusFilter === 'all'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Receipts
            </button>
            <button
              onClick={() => setStatusFilter('verified')}
              className={`px-3 py-1 rounded-md transition-colors flex items-center gap-1 ${
                statusFilter === 'verified'
                  ? 'bg-white text-emerald-800 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <CheckCircle2 size={12} className="text-emerald-600" />
              <span>Verified Only</span>
              {verifiedCount > 0 && (
                <span className="ml-1 text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-100 text-emerald-800">
                  {verifiedCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setStatusFilter('pending')}
              className={`px-3 py-1 rounded-md transition-colors flex items-center gap-1 ${
                statusFilter === 'pending'
                  ? 'bg-white text-amber-800 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Clock size={12} className="text-amber-600" />
              <span>Pending Accounts</span>
              {pendingCount > 0 && (
                <span className="ml-1 text-[10px] px-1.5 py-0.2 rounded-full bg-amber-200 text-amber-900 font-bold">
                  {pendingCount}
                </span>
              )}
            </button>
          </div>

          <button
            onClick={loadPayments}
            className="btn btn-secondary btn-xs flex items-center gap-1"
            title="Refresh payments"
          >
            <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/50 text-slate-600 font-semibold text-[11px]">
                <th className="py-2.5 px-3">Receipt Ref</th>
                <th className="py-2.5 px-3">Payment Date</th>
                <th className="py-2.5 px-3">Quotation Ref</th>
                <th className="py-2.5 px-3">Customer</th>
                <th className="py-2.5 px-3">Payment Mode</th>
                <th className="py-2.5 px-3">Ref / Cheque #</th>
                <th className="py-2.5 px-3 text-right">Amount Received</th>
                <th className="py-2.5 px-3">Recorded By</th>
                <th className="py-2.5 px-3 text-center">Verification Status</th>
                <th className="py-2.5 px-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && payments.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400">
                    <RefreshCw className="animate-spin inline mr-2 text-slate-600" size={16} />
                    Loading payments...
                  </td>
                </tr>
              ) : payments.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400">
                    No payment receipts found.
                  </td>
                </tr>
              ) : (
                payments.map((p) => {
                  const isVerified = ['Cleared', 'Verified'].includes(p.status);
                  const isPending = p.status === 'Recorded';

                  return (
                    <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-2.5 px-3 font-mono font-semibold text-slate-900">
                        {p.payment_number}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">
                        {new Date(p.payment_date).toLocaleDateString('en-GB')}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-800 whitespace-nowrap">
                        {p.quotation_number}
                      </td>
                      <td className="py-2.5 px-3 text-slate-900 font-medium whitespace-nowrap">
                        {p.customer_name}
                      </td>
                      <td className="py-2.5 px-3 text-slate-700 whitespace-nowrap">
                        {p.payment_mode}
                      </td>
                      <td className="py-2.5 px-3 text-slate-500 font-mono text-[11px]">
                        {p.reference_number || '-'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-slate-900 tabular-nums whitespace-nowrap">
                        <span className={isVerified ? 'text-emerald-700' : 'text-amber-800'}>
                          ₹ {formatCurrency(p.amount)}
                        </span>
                      </td>

                      {/* Recorded By Column */}
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

                      {/* Verification Status Column */}
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

                      {/* Actions Column */}
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5 justify-center">
                          {/* Receipt PDF in Portrait Mode */}
                          <button
                            onClick={() => handleOpenReceipt(p)}
                            className="btn btn-secondary btn-xs flex items-center gap-1"
                            title="Print / View Receipt PDF (Standard A4 Portrait)"
                          >
                            <Printer size={12} />
                            <span>Receipt</span>
                          </button>

                          {/* Accounts Verification Action Buttons */}
                          {isAccountsOrAdmin && (
                            <>
                              {isPending ? (
                                <button
                                  onClick={() => handleVerifyToggle(p.id, true)}
                                  disabled={verifyingId === p.id}
                                  className="btn btn-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold flex items-center gap-1 shadow-xs"
                                  title="Verify Amount Received in Bank Account"
                                >
                                  {verifyingId === p.id ? (
                                    <RefreshCw size={11} className="animate-spin" />
                                  ) : (
                                    <Check size={11} />
                                  )}
                                  <span>Verify</span>
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleVerifyToggle(p.id, false)}
                                  disabled={verifyingId === p.id}
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
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Record Payment Modal */}
      {modalOpen && (
        <div className="modal-overlay" onClick={() => setModalOpen(false)}>
          <div
            className="card shadow-xl w-full max-w-lg p-5 border border-slate-200 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center border-b border-slate-200 pb-2.5">
              <div className="flex items-center space-x-2">
                <CreditCard size={17} className="text-slate-800" />
                <h2 className="text-sm font-bold text-slate-900 uppercase">
                  Record Quotation Payment
                </h2>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={17} />
              </button>
            </div>

            {error && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-md text-xs flex items-center space-x-2">
                <AlertCircle size={15} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleRecordPayment} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Select Quotation *</label>
                <select
                  className="input input-sm"
                  value={selectedQuotationId || ''}
                  onChange={(e) => {
                    const qId = parseInt(e.target.value, 10);
                    setSelectedQuotationId(qId);
                    const match = quotations.find((q) => q.id === qId);
                    if (match) setAmount(String(match.balance_due || ''));
                  }}
                  required
                >
                  <option value="">-- Choose Approved Quotation --</option>
                  {quotations.map((q) => (
                    <option key={q.id} value={q.id}>
                      {q.quotation_number} - {q.customer_name} (Due: ₹ {formatCurrency(q.balance_due || 0)})
                    </option>
                  ))}
                </select>
              </div>

              {selectedQuotation && (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-md text-slate-800 text-xs space-y-1">
                  <div className="flex justify-between">
                    <span>Quotation Net Total:</span>
                    <span className="font-semibold tabular-nums">
                      ₹ {formatCurrency(selectedQuotation.net_total)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Already Received:</span>
                    <span className="font-semibold text-emerald-700 tabular-nums">
                      ₹ {formatCurrency(selectedQuotation.total_paid || 0)}
                    </span>
                  </div>
                  <div className="flex justify-between font-bold border-t border-slate-200 pt-1 text-slate-900">
                    <span>Outstanding Balance Due:</span>
                    <span className="tabular-nums">
                      ₹ {formatCurrency(selectedQuotation.balance_due || 0)}
                    </span>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    Amount to Collect (INR) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    className="input input-sm font-bold text-slate-900 tabular-nums"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="e.g. 50000"
                    required
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    Payment Date *
                  </label>
                  <input
                    type="date"
                    className="input input-sm"
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    Payment Mode *
                  </label>
                  <select
                    className="input input-sm"
                    value={paymentMode}
                    onChange={(e) => setPaymentMode(e.target.value)}
                  >
                    <option value="Bank Transfer (NEFT/RTGS/IMPS)">
                      Bank Transfer (NEFT/RTGS/IMPS)
                    </option>
                    <option value="UPI (GPay/PhonePe/Paytm)">UPI (GPay / PhonePe / Paytm)</option>
                    <option value="Cheque">Cheque</option>
                    <option value="Cash">Cash</option>
                    <option value="Card">Card Swipe</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    Reference / Cheque Number
                  </label>
                  <input
                    type="text"
                    className="input input-sm font-mono"
                    value={referenceNumber}
                    onChange={(e) => setReferenceNumber(e.target.value)}
                    placeholder="Txn ID / Cheque #004521"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Internal Notes</label>
                <input
                  type="text"
                  className="input input-sm"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. 50% order booking advance"
                />
              </div>

              {/* Accounts Verification Option / Notice */}
              {isAccountsOrAdmin ? (
                <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-md space-y-1">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isVerifiedParam}
                      onChange={(e) => setIsVerifiedParam(e.target.checked)}
                      className="rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    <span className="font-bold text-emerald-950 text-xs">
                      Mark as Amount Received & Verified (Accounts Desk)
                    </span>
                  </label>
                  <p className="text-[11px] text-emerald-800 pl-5">
                    {isVerifiedParam
                      ? 'Payment will be marked Verified immediately by you and settled in quotation ledger.'
                      : 'Payment will be logged as Not Verified (pending cheque/bank credit).'}
                  </p>
                </div>
              ) : (
                <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-md text-[11px] text-amber-800 flex items-start gap-2">
                  <Clock size={14} className="text-amber-600 shrink-0 mt-0.5" />
                  <span>
                    <strong>Note:</strong> Payment recorded by sales personnel is logged as{' '}
                    <strong>Not Verified</strong>. The Accounts & Finance Desk will verify the credit upon bank confirmation.
                  </span>
                </div>
              )}

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setModalOpen(false)}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={`btn btn-primary btn-sm ${submitting ? 'btn-saving' : ''}`}
                  disabled={submitting}
                >
                  {submitting ? 'Recording...' : 'Generate Receipt & Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PDF Receipt Preview Modal (Standard A4 Portrait) */}
      {previewPdf && (
        <PdfPreviewModal
          isOpen={true}
          onClose={() => setPreviewPdf(null)}
          pdfUrl={previewPdf.url}
          title={previewPdf.title}
          fileName={previewPdf.fileName}
        />
      )}
    </div>
  );
};
