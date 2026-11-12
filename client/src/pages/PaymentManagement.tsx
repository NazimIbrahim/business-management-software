import React, { useState, useEffect, useRef } from 'react';
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
  Upload,
  FileText,
  Image as ImageIcon,
  Search,
  Eye,
  AlertTriangle,
  ExternalLink,
  Download,
  ZoomIn,
  ZoomOut,
  FileCheck,
  Building,
  Phone,
  User,
} from 'lucide-react';
import { PdfPreviewModal } from '../components/PdfPreviewModal';
import { compressImageFile } from '../utils/imageCompressor';

interface CustomerSearchResult {
  id: number;
  name: string;
  mobile_number: string;
  email?: string;
  delivery_address?: string;
  site_location?: string;
  gstin?: string;
  active_quotations_count: number | string;
  total_quoted: number | string;
  total_paid: number | string;
  outstanding_balance: number | string;
}

interface ActiveCustomerQuotation {
  id: number;
  quotation_number: string;
  quotation_date: string;
  status: string;
  net_total: number | string;
  total_paid: number | string;
  balance_due: number | string;
}

export const PaymentManagement: React.FC = () => {
  const { fetchApi, getReceiptUrl, subscribeToEvents, serverUrl } = useServer();
  const { user } = useAuth();
  const userRole = (user?.role || '').toLowerCase();
  const isAccountsOrAdmin = userRole === 'admin' || userRole === 'accounts' || userRole === 'accountant';

  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'verified' | 'pending'>('all');

  // Summary Metrics
  const [totalCollected, setTotalCollected] = useState(0);
  const [verifiedAmount, setVerifiedAmount] = useState(0);
  const [pendingAmount, setPendingAmount] = useState(0);
  const [verifiedCount, setVerifiedCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);

  // New Payment Modal State
  const [modalOpen, setModalOpen] = useState(false);

  // Customer Search & Auto-Selection States
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [customerSearchResults, setCustomerSearchResults] = useState<CustomerSearchResult[]>([]);
  const [isSearchingCustomers, setIsSearchingCustomers] = useState(false);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerSearchResult | null>(null);

  // Quotation Selection & Dynamic Ledger States
  const [customerQuotations, setCustomerQuotations] = useState<ActiveCustomerQuotation[]>([]);
  const [loadingQuotes, setLoadingQuotes] = useState(false);
  const [selectedQuotationId, setSelectedQuotationId] = useState<number | null>(null);

  // Form Field States
  const [amount, setAmount] = useState<string>('');
  const [paymentMode, setPaymentMode] = useState<string>('UPI (GPay/PhonePe/Paytm)');
  const [paymentDate, setPaymentDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [referenceNumber, setReferenceNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [isVerifiedParam, setIsVerifiedParam] = useState<boolean>(isAccountsOrAdmin);
  const [allowOverpayment, setAllowOverpayment] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mandatory Payment Proof Upload States
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPreviewUrl, setProofPreviewUrl] = useState<string | null>(null);
  const [proofError, setProofError] = useState<string | null>(null);
  const [isDraggingProof, setIsDraggingProof] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Verifying action loading state
  const [verifyingId, setVerifyingId] = useState<number | null>(null);

  // PDF Preview State for Official Receipts
  const [previewPdf, setPreviewPdf] = useState<{ url: string; title: string; fileName: string } | null>(null);

  // Lightbox / Proof Preview State for Payment Proofs (Screenshots, PDFs)
  const [previewProof, setPreviewProof] = useState<{
    url: string;
    fileName?: string;
    mimeType?: string;
    paymentNumber?: string;
    customerName?: string;
    amount?: number | string;
    date?: string;
  } | null>(null);
  const [proofZoom, setProofZoom] = useState<number>(1);

  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null);

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
      if (['PAYMENT_RECORDED', 'payment:recorded'].includes(event.type)) {
        loadPayments();
      }
    });
    return () => unsubscribe();
  }, [statusFilter]);

  // Debounced Customer Search
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);

    const trimmed = customerSearchQuery.trim();
    if (!trimmed || selectedCustomer?.name === trimmed) {
      setCustomerSearchResults([]);
      setIsSearchingCustomers(false);
      return;
    }

    setIsSearchingCustomers(true);
    searchDebounceRef.current = setTimeout(async () => {
      try {
        const res = await fetchApi(`/api/customers/search?q=${encodeURIComponent(trimmed)}`);
        setCustomerSearchResults(res.customers || []);
        setShowCustomerDropdown(true);
      } catch (err) {
        console.error('Customer search error:', err);
      } finally {
        setIsSearchingCustomers(false);
      }
    }, 300);

    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [customerSearchQuery, selectedCustomer]);

  const openPaymentModal = () => {
    setError(null);
    setProofError(null);
    setIsVerifiedParam(isAccountsOrAdmin);
    setSelectedCustomer(null);
    setCustomerSearchQuery('');
    setCustomerSearchResults([]);
    setShowCustomerDropdown(false);
    setCustomerQuotations([]);
    setSelectedQuotationId(null);
    setAmount('');
    setPaymentMode('UPI (GPay/PhonePe/Paytm)');
    setPaymentDate(new Date().toISOString().split('T')[0]);
    setReferenceNumber('');
    setNotes('');
    setProofFile(null);
    setProofPreviewUrl(null);
    setAllowOverpayment(false);
    setModalOpen(true);
  };

  const handleSelectCustomer = async (cust: CustomerSearchResult) => {
    setSelectedCustomer(cust);
    setCustomerSearchQuery(cust.name);
    setShowCustomerDropdown(false);
    setSelectedQuotationId(null);
    setAmount('');
    setLoadingQuotes(true);

    try {
      const res = await fetchApi(`/api/customers/${cust.id}/active-quotations`);
      const quotes: ActiveCustomerQuotation[] = res.quotations || [];
      setCustomerQuotations(quotes);

      if (quotes.length > 0) {
        // Auto-select the first quotation with highest balance due
        setSelectedQuotationId(quotes[0].id);
        const due = parseFloat(String(quotes[0].balance_due || 0));
        setAmount(due > 0 ? due.toFixed(2) : String(quotes[0].net_total));
      }
    } catch (err: any) {
      console.error('Failed to load customer quotations:', err);
      setError('Failed to load active quotations for this customer.');
    } finally {
      setLoadingQuotes(false);
    }
  };

  const handleSelectQuotation = (qId: number) => {
    setSelectedQuotationId(qId);
    const match = customerQuotations.find((q) => q.id === qId);
    if (match) {
      const due = parseFloat(String(match.balance_due || 0));
      setAmount(due > 0 ? due.toFixed(2) : String(match.net_total));
    }
  };

  const selectedQuotation = customerQuotations.find((q) => q.id === selectedQuotationId);

  // File Handling for Proofs (with Canvas-based pre-compression)
  const handleProofFile = async (file: File) => {
    setProofError(null);

    // Validate mime type
    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowedMimes.includes(file.type)) {
      setProofError('Invalid file type. Only JPG, PNG, WEBP, and PDF documents are allowed.');
      return;
    }

    // Auto-compress image before memory/storage buffering
    let processedFile = file;
    if (file.type.startsWith('image/')) {
      try {
        processedFile = await compressImageFile(file, { maxDimension: 1600, quality: 0.80 });
      } catch (e) {
        console.warn('Image pre-compression skipped:', e);
      }
    }

    // Validate size (max 5 MB)
    if (processedFile.size > 5 * 1024 * 1024) {
      setProofError('File exceeds 5MB limit. Please upload a compressed screenshot or PDF.');
      return;
    }

    setProofFile(processedFile);
    if (processedFile.type.startsWith('image/')) {
      const preview = URL.createObjectURL(processedFile);
      setProofPreviewUrl(preview);
    } else {
      setProofPreviewUrl('pdf');
    }
  };

  const handleRemoveProof = () => {
    if (proofPreviewUrl && proofPreviewUrl !== 'pdf') {
      URL.revokeObjectURL(proofPreviewUrl);
    }
    setProofFile(null);
    setProofPreviewUrl(null);
    setProofError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const isNonCashMode = !paymentMode.toUpperCase().includes('CASH');

  // Hard Gate Check: Button Disabled if missing proof, customer, quote, amount, or non-cash ref
  const isSubmissionDisabled =
    submitting ||
    !selectedCustomer ||
    !selectedQuotationId ||
    !proofFile ||
    !amount ||
    parseFloat(amount) <= 0 ||
    (isNonCashMode && !referenceNumber.trim());

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // 1. Hard Gate Enforcement Alert
    if (!proofFile) {
      setError(
        '🚫 Payment Proof Required: You must attach a valid payment screenshot, receipt, or bank slip before recording this transaction.'
      );
      return;
    }

    if (!selectedCustomer) {
      setError('Please search and select a customer before proceeding.');
      return;
    }

    if (!selectedQuotationId || !amount) {
      setError('Please select a quotation and specify the payment amount.');
      return;
    }

    if (isNonCashMode && !referenceNumber.trim()) {
      setError(`Transaction Reference / Cheque / UTR number is mandatory for ${paymentMode}.`);
      return;
    }

    const parsedAmount = parseFloat(amount);
    const balanceDue = parseFloat(String(selectedQuotation?.balance_due || 0));

    if (parsedAmount > balanceDue + 1.0 && !allowOverpayment) {
      setError(
        `⚠️ Advance / Overpayment: Amount (₹ ${formatCurrency(
          parsedAmount
        )}) exceeds outstanding balance (₹ ${formatCurrency(balanceDue)}). Please confirm advance credit below.`
      );
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('proof', proofFile);
      formData.append('quotation_id', String(selectedQuotationId));
      formData.append('customer_id', String(selectedCustomer.id));
      formData.append('amount', String(parsedAmount));
      formData.append('payment_mode', paymentMode);
      formData.append('payment_date', paymentDate);
      formData.append('reference_number', referenceNumber.trim());
      formData.append('notes', notes.trim());
      formData.append('is_verified', String(isAccountsOrAdmin ? isVerifiedParam : false));
      if (allowOverpayment) formData.append('allow_overpayment', 'true');

      await fetchApi('/api/payments', {
        method: 'POST',
        body: formData,
      });

      setModalOpen(false);
      handleRemoveProof();
      loadPayments();
    } catch (err: any) {
      setError(err.message || 'Payment submission failed. Please verify the details.');
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

  const handleOpenProof = (p: Payment) => {
    if (!p.proof_file_url) return;
    const token = localStorage.getItem('ama_token');
    const query = token ? `?token=${encodeURIComponent(token)}` : '';
    const proofUrl = `${serverUrl}/api/payments/${p.id}/proof${query}`;

    setProofZoom(1);
    setPreviewProof({
      url: proofUrl,
      fileName: p.proof_file_name,
      mimeType: p.proof_mime_type,
      paymentNumber: p.payment_number,
      customerName: p.customer_name,
      amount: p.amount,
      date: p.payment_date,
    });
  };

  const formatCurrency = (val: number | string) => {
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
            Log advance receipts, sales collections, and verify customer payment proofs in company accounts
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
                <th className="py-2.5 px-3 text-center">Payment Proof</th>
                <th className="py-2.5 px-3">Recorded By</th>
                <th className="py-2.5 px-3 text-center">Verification Status</th>
                <th className="py-2.5 px-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && payments.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-slate-400">
                    <RefreshCw className="animate-spin inline mr-2 text-slate-600" size={16} />
                    Loading payments...
                  </td>
                </tr>
              ) : payments.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-slate-400">
                    No payment receipts found.
                  </td>
                </tr>
              ) : (
                payments.map((p) => {
                  const isVerified = ['Cleared', 'Verified'].includes(p.status);
                  const isPending = p.status === 'Recorded';
                  const hasProof = Boolean(p.proof_file_url);
                  const isPdfProof = p.proof_mime_type?.includes('pdf') || p.proof_file_url?.toLowerCase().endsWith('.pdf');

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
                        <div>{p.customer_name}</div>
                        {p.customer_phone && (
                          <div className="text-[10px] text-slate-400 font-normal">{p.customer_phone}</div>
                        )}
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

                      {/* Payment Proof Column */}
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        {hasProof ? (
                          <button
                            onClick={() => handleOpenProof(p)}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-200 transition-colors"
                            title="Inspect Uploaded Payment Proof"
                          >
                            {isPdfProof ? <FileText size={12} className="text-red-500" /> : <ImageIcon size={12} className="text-sky-600" />}
                            <span>{isPdfProof ? 'View Slip' : 'View Proof'}</span>
                          </button>
                        ) : (
                          <span className="text-slate-300 text-[11px] font-mono">-</span>
                        )}
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

      {/* Record Payment Modal with Customer Search & Mandatory Payment Proof Upload */}
      {modalOpen && (
        <div className="modal-overlay" onClick={() => setModalOpen(false)}>
          <div
            className="card shadow-2xl w-full max-w-xl max-h-[85vh] flex flex-col border border-slate-200 overflow-hidden bg-white"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex justify-between items-center px-5 py-3 border-b border-slate-200 bg-slate-50/70 shrink-0">
              <div className="flex items-center space-x-2">
                <CreditCard size={18} className="text-slate-800" />
                <div>
                  <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
                    Record New Payment Receipt
                  </h2>
                  <p className="text-[11px] text-slate-500">Live Customer Search & Mandatory Audit Proof Verification</p>
                </div>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-md"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4 overflow-y-auto text-xs flex-1 min-h-0 scrollbar-thin">
              {error && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-xs flex items-start space-x-2">
                  <AlertCircle size={16} className="shrink-0 mt-0.5" />
                  <span className="font-medium">{error}</span>
                </div>
              )}

              <form onSubmit={handleRecordPayment} className="space-y-4">
                {/* 1. Live Customer Search Section */}
                <div className="space-y-1.5 relative">
                  <label className="block text-slate-800 font-bold">
                    1. Search & Select Customer *
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-400">
                      {isSearchingCustomers ? (
                        <RefreshCw size={14} className="animate-spin text-primary" />
                      ) : (
                        <Search size={14} />
                      )}
                    </div>
                    <input
                      type="text"
                      className="input input-sm pl-8 pr-8 w-full"
                      placeholder="Type Customer Name, Mobile Number, GSTIN, or Quotation #..."
                      value={customerSearchQuery}
                      onChange={(e) => {
                        setCustomerSearchQuery(e.target.value);
                        if (selectedCustomer && e.target.value !== selectedCustomer.name) {
                          setSelectedCustomer(null);
                          setCustomerQuotations([]);
                          setSelectedQuotationId(null);
                        }
                      }}
                      onFocus={() => {
                        if (customerSearchResults.length > 0) setShowCustomerDropdown(true);
                      }}
                    />
                    {customerSearchQuery && (
                      <button
                        type="button"
                        onClick={() => {
                          setCustomerSearchQuery('');
                          setSelectedCustomer(null);
                          setCustomerQuotations([]);
                          setSelectedQuotationId(null);
                        }}
                        className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400 hover:text-slate-600"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>

                  {/* Customer Autocomplete Dropdown */}
                  {showCustomerDropdown && customerSearchResults.length > 0 && (
                    <div className="absolute z-30 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-xl max-h-60 overflow-y-auto divide-y divide-slate-100">
                      {customerSearchResults.map((cust) => {
                        const bal = parseFloat(String(cust.outstanding_balance || 0));
                        return (
                          <div
                            key={cust.id}
                            onClick={() => handleSelectCustomer(cust)}
                            className="p-2.5 hover:bg-slate-50 cursor-pointer transition-colors flex items-center justify-between gap-2"
                          >
                            <div className="min-w-0">
                              <div className="font-bold text-slate-900 flex items-center gap-1.5">
                                <span>{cust.name}</span>
                                {cust.gstin && (
                                  <span className="text-[10px] px-1.5 py-0.2 bg-slate-100 text-slate-600 rounded font-mono">
                                    {cust.gstin}
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                                <span className="flex items-center gap-1 font-mono">
                                  <Phone size={10} /> {cust.mobile_number}
                                </span>
                                {cust.site_location && (
                                  <span>• {cust.site_location}</span>
                                )}
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <span
                                className={`inline-block text-[11px] font-bold px-2 py-0.5 rounded-full ${
                                  bal > 0
                                    ? 'bg-amber-100 text-amber-900 border border-amber-200'
                                    : 'bg-emerald-100 text-emerald-800'
                                }`}
                              >
                                ₹ {formatCurrency(bal)} Due
                              </span>
                              <div className="text-[10px] text-slate-400 mt-0.5">
                                {cust.active_quotations_count} active quote{cust.active_quotations_count !== 1 ? 's' : ''}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Selected Customer Card */}
                  {selectedCustomer && (
                    <div className="p-2.5 bg-sky-50/70 border border-sky-200 rounded-lg flex items-center justify-between text-xs mt-2">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-sky-100 text-sky-700 flex items-center justify-center font-bold text-xs">
                          {selectedCustomer.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-bold text-sky-950 flex items-center gap-2">
                            <span>{selectedCustomer.name}</span>
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-sky-100 text-sky-800 font-mono">
                              {selectedCustomer.mobile_number}
                            </span>
                          </div>
                          <div className="text-[10px] text-sky-700">
                            {selectedCustomer.delivery_address || selectedCustomer.site_location || 'Showroom Customer'}
                          </div>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-200 text-sky-900">
                        Customer Selected
                      </span>
                    </div>
                  )}
                </div>

                {/* 2. Quotation Selector & Dynamic Ledger Metrics */}
                {selectedCustomer && (
                  <div className="space-y-2 border-t border-slate-200 pt-3">
                    <div className="flex justify-between items-center">
                      <label className="block text-slate-800 font-bold">
                        2. Select Quotation / Order *
                      </label>
                      {loadingQuotes && (
                        <span className="text-[11px] text-slate-400 flex items-center gap-1">
                          <RefreshCw size={11} className="animate-spin" /> Loading quotations...
                        </span>
                      )}
                    </div>

                    {customerQuotations.length === 0 && !loadingQuotes ? (
                      <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg text-xs flex items-center gap-2">
                        <AlertTriangle size={15} className="shrink-0" />
                        <span>No active/unpaid quotations found for this customer. Please create an approved quotation first.</span>
                      </div>
                    ) : (
                      <select
                        className="input input-sm w-full"
                        value={selectedQuotationId || ''}
                        onChange={(e) => handleSelectQuotation(parseInt(e.target.value, 10))}
                        required
                      >
                        <option value="">-- Choose Quotation --</option>
                        {customerQuotations.map((q) => (
                          <option key={q.id} value={q.id}>
                            {q.quotation_number} — Net: ₹ {formatCurrency(q.net_total)} (Due: ₹ {formatCurrency(q.balance_due)}) [{q.status.toUpperCase()}]
                          </option>
                        ))}
                      </select>
                    )}

                    {/* Dynamic Quotation Ledger Metrics Cards */}
                    {selectedQuotation && (
                      <div className="grid grid-cols-3 gap-2 p-3 bg-slate-50 border border-slate-200 rounded-lg">
                        <div className="bg-white p-2 rounded border border-slate-200">
                          <div className="text-[10px] text-slate-500 uppercase font-semibold">Total Quoted Value</div>
                          <div className="text-sm font-bold text-slate-900 mt-0.5 tabular-nums">
                            ₹ {formatCurrency(selectedQuotation.net_total)}
                          </div>
                        </div>
                        <div className="bg-white p-2 rounded border border-slate-200">
                          <div className="text-[10px] text-emerald-700 uppercase font-semibold">Previously Paid</div>
                          <div className="text-sm font-bold text-emerald-700 mt-0.5 tabular-nums">
                            ₹ {formatCurrency(selectedQuotation.total_paid)}
                          </div>
                        </div>
                        <div className="bg-white p-2 rounded border border-slate-200">
                          <div className="text-[10px] text-amber-700 uppercase font-semibold">Outstanding Due</div>
                          <div className="text-sm font-bold text-amber-800 mt-0.5 tabular-nums">
                            ₹ {formatCurrency(selectedQuotation.balance_due)}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* 3. Mandatory Payment Proof Upload Component (Hard Gate) */}
                <div className="space-y-1.5 border-t border-slate-200 pt-3">
                  <div className="flex justify-between items-center">
                    <label className="block text-slate-800 font-bold flex items-center gap-1.5">
                      <FileCheck size={14} className="text-primary" />
                      <span>3. Upload Payment Proof (Screenshot / Slip / Receipt) *</span>
                    </label>
                    <span className="text-[10px] font-semibold text-rose-600 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                      Mandatory Hard Gate
                    </span>
                  </div>

                  {proofError && (
                    <div className="p-2 bg-rose-50 border border-rose-200 text-rose-700 rounded text-xs flex items-center gap-2">
                      <AlertCircle size={14} className="shrink-0" />
                      <span>{proofError}</span>
                    </div>
                  )}

                  {!proofFile ? (
                    <div
                      onDragOver={(e) => {
                        e.preventDefault();
                        setIsDraggingProof(true);
                      }}
                      onDragLeave={() => setIsDraggingProof(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setIsDraggingProof(false);
                        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                          handleProofFile(e.dataTransfer.files[0]);
                        }
                      }}
                      onClick={() => fileInputRef.current?.click()}
                      className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
                        isDraggingProof
                          ? 'border-primary bg-primary/5'
                          : 'border-slate-300 hover:border-slate-400 bg-slate-50/50'
                      }`}
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp,application/pdf"
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            handleProofFile(e.target.files[0]);
                          }
                        }}
                      />
                      <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center mx-auto mb-2">
                        <Upload size={18} />
                      </div>
                      <div className="font-semibold text-slate-800 text-xs">
                        Click to browse or drag & drop Payment Proof
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        UPI screenshots (GPay/PhonePe/Paytm), Bank NEFT slips, or Cheques (.jpg, .png, .pdf, &le; 5MB)
                      </p>
                    </div>
                  ) : (
                    <div className="p-3 bg-emerald-50/70 border border-emerald-300 rounded-lg flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        {proofPreviewUrl === 'pdf' ? (
                          <div className="w-10 h-10 rounded bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                            <FileText size={20} />
                          </div>
                        ) : (
                          <img
                            src={proofPreviewUrl || ''}
                            alt="Proof Preview"
                            className="w-12 h-12 object-cover rounded border border-emerald-300 shrink-0 shadow-xs"
                          />
                        )}
                        <div className="min-w-0">
                          <div className="font-bold text-emerald-950 truncate max-w-xs">{proofFile.name}</div>
                          <div className="text-[10px] text-emerald-700 flex items-center gap-2 mt-0.5">
                            <span>{(proofFile.size / 1024).toFixed(1)} KB</span>
                            <span>•</span>
                            <span className="uppercase">{proofFile.type.split('/')[1] || 'Proof'}</span>
                            <span>•</span>
                            <span className="font-semibold text-emerald-800">Attached & Verified</span>
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleRemoveProof}
                        className="btn btn-xs bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 px-2 py-1 rounded"
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>

                {/* 4. Transaction Details */}
                <div className="space-y-3 border-t border-slate-200 pt-3">
                  <label className="block text-slate-800 font-bold">
                    4. Transaction Particulars
                  </label>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-700 font-semibold mb-1">
                        Amount to Collect (INR) *
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        className="input input-sm font-bold text-slate-900 tabular-nums w-full"
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
                        className="input input-sm w-full"
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
                        className="input input-sm w-full"
                        value={paymentMode}
                        onChange={(e) => setPaymentMode(e.target.value)}
                      >
                        <option value="UPI (GPay/PhonePe/Paytm)">UPI (GPay / PhonePe / Paytm)</option>
                        <option value="Bank Transfer (NEFT/RTGS/IMPS)">
                          Bank Transfer (NEFT/RTGS/IMPS)
                        </option>
                        <option value="Cheque">Cheque</option>
                        <option value="Cash">Cash</option>
                        <option value="Card">Card Swipe</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-slate-700 font-semibold mb-1">
                        Reference / UTR / Cheque #{isNonCashMode ? ' *' : ''}
                      </label>
                      <input
                        type="text"
                        className="input input-sm font-mono w-full"
                        value={referenceNumber}
                        onChange={(e) => setReferenceNumber(e.target.value)}
                        placeholder={isNonCashMode ? 'Mandatory UTR / Txn ID' : 'Optional for Cash'}
                        required={isNonCashMode}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Internal Notes / Narration</label>
                    <input
                      type="text"
                      className="input input-sm w-full"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="e.g. Advance payment against order confirmation"
                    />
                  </div>

                  {/* Overpayment Confirmation Warning */}
                  {selectedQuotation &&
                    parseFloat(amount || '0') > parseFloat(String(selectedQuotation.balance_due || 0)) + 1.0 && (
                      <div className="p-3 bg-amber-50 border border-amber-300 rounded-lg space-y-1.5">
                        <div className="flex items-center gap-2 font-bold text-amber-900 text-xs">
                          <AlertTriangle size={15} className="text-amber-600 shrink-0" />
                          <span>Advance / Overpayment Confirmation</span>
                        </div>
                        <p className="text-[11px] text-amber-800">
                          The entered amount (₹ {formatCurrency(parseFloat(amount))}) exceeds the quotation balance due (₹{' '}
                          {formatCurrency(selectedQuotation.balance_due)}).
                        </p>
                        <label className="flex items-center gap-2 cursor-pointer pt-1">
                          <input
                            type="checkbox"
                            checked={allowOverpayment}
                            onChange={(e) => setAllowOverpayment(e.target.checked)}
                            className="rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                          />
                          <span className="font-bold text-amber-950 text-xs">
                            Confirm and record excess payment as Customer Advance / Credit
                          </span>
                        </label>
                      </div>
                    )}

                  {/* Accounts Verification Option / Notice */}
                  {isAccountsOrAdmin ? (
                    <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-lg space-y-1">
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
                    <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-800 flex items-start gap-2">
                      <Clock size={14} className="text-amber-600 shrink-0 mt-0.5" />
                      <span>
                        <strong>Notice:</strong> Payments entered by sales personnel are logged as{' '}
                        <strong>Not Verified</strong>. Accounts team will audit the attached proof before crediting.
                      </span>
                    </div>
                  )}
                </div>

                {/* Modal Footer */}
                <div className="flex justify-end space-x-2 p-3.5 border-t border-slate-200 bg-slate-50 shrink-0 sticky bottom-0">
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
                    className={`btn btn-primary btn-sm flex items-center gap-1.5 ${
                      submitting ? 'btn-saving' : ''
                    }`}
                    disabled={isSubmissionDisabled}
                    title={
                      !proofFile
                        ? 'Mandatory: Upload payment proof file first'
                        : !selectedCustomer
                        ? 'Select customer first'
                        : !selectedQuotationId
                        ? 'Select quotation first'
                        : isNonCashMode && !referenceNumber.trim()
                        ? 'Reference number is required for non-cash modes'
                        : 'Submit and save payment transaction'
                    }
                  >
                    <FileCheck size={14} />
                    <span>{submitting ? 'Recording...' : 'Generate Receipt & Save'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox / Document Preview Modal for Payment Proofs */}
      {previewProof && (
        <div className="modal-overlay" onClick={() => setPreviewProof(null)}>
          <div
            className="card shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col border border-slate-200 overflow-hidden bg-white"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex justify-between items-center px-5 py-3 border-b border-slate-200 bg-slate-50 shrink-0">
              <div className="flex items-center space-x-2">
                <FileCheck size={17} className="text-emerald-600" />
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Payment Proof — {previewProof.paymentNumber} ({previewProof.customerName})
                  </h3>
                  <div className="text-[11px] text-slate-500 flex items-center gap-2">
                    <span>Amount: ₹ {formatCurrency(previewProof.amount || 0)}</span>
                    <span>•</span>
                    <span>Date: {new Date(previewProof.date || '').toLocaleDateString('en-GB')}</span>
                    {previewProof.fileName && (
                      <>
                        <span>•</span>
                        <span className="font-mono">{previewProof.fileName}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* Zoom buttons for images */}
                {!previewProof.mimeType?.includes('pdf') && !previewProof.url.endsWith('.pdf') && (
                  <div className="flex items-center gap-1 bg-slate-200/80 p-0.5 rounded">
                    <button
                      onClick={() => setProofZoom((z) => Math.max(0.5, z - 0.25))}
                      className="p-1 text-slate-600 hover:text-slate-900"
                      title="Zoom Out"
                    >
                      <ZoomOut size={14} />
                    </button>
                    <span className="text-[10px] font-mono px-1">{Math.round(proofZoom * 100)}%</span>
                    <button
                      onClick={() => setProofZoom((z) => Math.min(2.5, z + 0.25))}
                      className="p-1 text-slate-600 hover:text-slate-900"
                      title="Zoom In"
                    >
                      <ZoomIn size={14} />
                    </button>
                  </div>
                )}

                <a
                  href={previewProof.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-secondary btn-xs flex items-center gap-1"
                >
                  <ExternalLink size={12} />
                  <span>Open in Tab</span>
                </a>

                <button
                  onClick={() => setPreviewProof(null)}
                  className="text-slate-400 hover:text-slate-600 p-1"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Modal Content */}
            <div className="flex-1 min-h-[500px] overflow-auto bg-slate-900/90 flex items-center justify-center p-4">
              {previewProof.mimeType?.includes('pdf') || previewProof.url.toLowerCase().endsWith('.pdf') ? (
                <iframe
                  src={previewProof.url}
                  className="w-full h-[600px] rounded border border-slate-700 bg-white"
                  title="PDF Proof Viewer"
                />
              ) : (
                <div className="overflow-auto max-h-[70vh] flex items-center justify-center">
                  <img
                    src={previewProof.url}
                    alt="Proof"
                    style={{ transform: `scale(${proofZoom})`, transition: 'transform 0.15s ease' }}
                    className="max-h-[70vh] max-w-full object-contain rounded shadow-lg origin-center"
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Official PDF Receipt Preview Modal (Standard A4 Portrait) */}
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
