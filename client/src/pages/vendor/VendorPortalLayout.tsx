import React, { useState, useEffect, useMemo } from 'react';
import { useServer } from '../../context/ServerContext';
import { useAuth } from '../../context/AuthContext';
import {
  Store,
  FileSpreadsheet,
  Upload,
  FileText,
  CreditCard,
  Receipt,
  CheckCircle2,
  Clock,
  ExternalLink,
  RefreshCw,
  Search,
  Filter,
  AlertCircle,
  Eye,
  Download,
  Calendar,
  LogOut,
  Building,
  Phone,
  ShieldCheck,
  ChevronRight,
  X,
} from 'lucide-react';

interface VendorProfile {
  id: number;
  name: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  gstin?: string;
  address?: string;
  stock_sheet_url?: string;
  stock_file_url?: string;
  stock_file_name?: string;
  stock_last_updated?: string;
}

interface VendorOrder {
  id: number;
  local_purchase_id?: number;
  po_number: string;
  status: 'INQUIRY_SENT' | 'PI_SUBMITTED' | 'PAYMENT_RECORDED' | 'INVOICE_SUBMITTED' | 'COMPLETED' | string;
  item_description: string;
  requested_quantity: number;
  unit: string;
  quoted_rate: number;
  pi_number?: string;
  pi_amount?: number;
  pi_file_url?: string;
  pi_uploaded_at?: string;
  payment_utr?: string;
  payment_amount?: number;
  payment_proof_url?: string;
  payment_recorded_at?: string;
  tax_invoice_number?: string;
  tax_invoice_amount?: number;
  tax_invoice_file_url?: string;
  tax_invoice_uploaded_at?: string;
  vendor_notes?: string;
  internal_notes?: string;
  created_at: string;
}

type TabFilter = 'all' | 'inquiry' | 'pi' | 'payment' | 'invoice';

export const VendorPortalLayout: React.FC = () => {
  const { fetchApi, subscribeToEvents } = useServer();
  const { user, logout } = useAuth();

  const [profile, setProfile] = useState<VendorProfile | null>(null);
  const [orders, setOrders] = useState<VendorOrder[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [activeFilter, setActiveFilter] = useState<TabFilter>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Stock Feed State
  const [sheetUrl, setSheetUrl] = useState<string>('');
  const [stockFile, setStockFile] = useState<File | null>(null);

  // PI Upload Modal State
  const [selectedOrderForPI, setSelectedOrderForPI] = useState<VendorOrder | null>(null);
  const [piNumber, setPiNumber] = useState<string>('');
  const [piAmount, setPiAmount] = useState<number>(0);
  const [piNotes, setPiNotes] = useState<string>('');
  const [piFile, setPiFile] = useState<File | null>(null);

  // Tax Invoice Upload Modal State
  const [selectedOrderForInvoice, setSelectedOrderForInvoice] = useState<VendorOrder | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState<string>('');
  const [invoiceAmount, setInvoiceAmount] = useState<number>(0);
  const [invoiceNotes, setInvoiceNotes] = useState<string>('');
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);

  // Payment Proof Modal Viewer State
  const [viewingPaymentOrder, setViewingPaymentOrder] = useState<VendorOrder | null>(null);

  // Toast feedback
  const [toastMsg, setToastMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMsg({ text, type });
    setTimeout(() => setToastMsg(null), 4000);
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [profileRes, ordersRes] = await Promise.all([
        fetchApi<any>('/api/vendor/profile').catch(() => ({ vendor: null })),
        fetchApi<any>('/api/vendor/orders').catch(() => ({ orders: [] })),
      ]);

      if (profileRes?.vendor) {
        setProfile(profileRes.vendor);
        setSheetUrl(profileRes.vendor.stock_sheet_url || '');
      }
      setOrders(ordersRes?.orders || []);
    } catch (err: any) {
      showToast(err.message || 'Error loading vendor records', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    // Subscribe to real-time events
    const unsubscribe = subscribeToEvents((event) => {
      if (
        event.type === 'vendor:inquiry_sent' ||
        event.type === 'vendor:payment_proof_recorded' ||
        event.type === 'vendor:pi_submitted' ||
        event.type === 'vendor:tax_invoice_submitted'
      ) {
        loadData();
      }
    });

    return () => unsubscribe();
  }, []);

  // Update Live Google Sheet or file
  const handleUpdateStockFeed = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const formData = new FormData();
      if (sheetUrl.trim()) {
        formData.append('stock_sheet_url', sheetUrl.trim());
      }
      if (stockFile) {
        formData.append('stock_file', stockFile);
      }

      await fetchApi('/api/vendor/stock-feed', {
        method: 'POST',
        body: formData,
      });

      showToast('Daily stock feed updated successfully!');
      setStockFile(null);
      await loadData();
    } catch (err: any) {
      showToast(err.message || 'Failed to update stock feed', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Submit Proforma Invoice
  const handleSubmitPI = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrderForPI) return;

    if (!piNumber.trim()) {
      showToast('Proforma Invoice (PI) number is required.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('pi_number', piNumber.trim());
      formData.append('pi_amount', String(piAmount || 0));
      formData.append('notes', piNotes.trim());
      if (piFile) {
        formData.append('pi_file', piFile);
      }

      await fetchApi(`/api/vendor/orders/${selectedOrderForPI.id}/upload-pi`, {
        method: 'POST',
        body: formData,
      });

      showToast(`Proforma Invoice #${piNumber} uploaded! Under accounts review.`);
      setSelectedOrderForPI(null);
      setPiFile(null);
      await loadData();
    } catch (err: any) {
      showToast(err.message || 'PI submission failed', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Submit Tax Invoice
  const handleSubmitTaxInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrderForInvoice) return;

    if (!invoiceNumber.trim()) {
      showToast('Tax Invoice Number is required.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('tax_invoice_number', invoiceNumber.trim());
      formData.append('tax_invoice_amount', String(invoiceAmount || 0));
      formData.append('notes', invoiceNotes.trim());
      if (invoiceFile) {
        formData.append('tax_invoice_file', invoiceFile);
      }

      await fetchApi(`/api/vendor/orders/${selectedOrderForInvoice.id}/upload-tax-invoice`, {
        method: 'POST',
        body: formData,
      });

      showToast(`Tax Invoice #${invoiceNumber} submitted! Reconciled with dispatch tracker.`);
      setSelectedOrderForInvoice(null);
      setInvoiceFile(null);
      await loadData();
    } catch (err: any) {
      showToast(err.message || 'Invoice submission failed', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Filtered orders
  const filteredOrders = useMemo(() => {
    let result = orders;
    if (activeFilter === 'inquiry') {
      result = result.filter((o) => o.status === 'INQUIRY_SENT');
    } else if (activeFilter === 'pi') {
      result = result.filter((o) => o.status === 'PI_SUBMITTED');
    } else if (activeFilter === 'payment') {
      result = result.filter((o) => o.status === 'PAYMENT_RECORDED');
    } else if (activeFilter === 'invoice') {
      result = result.filter((o) => o.status === 'INVOICE_SUBMITTED' || o.status === 'COMPLETED');
    }

    const q = searchTerm.toLowerCase().trim();
    if (!q) return result;
    return result.filter(
      (o) =>
        o.po_number?.toLowerCase().includes(q) ||
        o.item_description?.toLowerCase().includes(q) ||
        o.pi_number?.toLowerCase().includes(q) ||
        o.tax_invoice_number?.toLowerCase().includes(q)
    );
  }, [orders, activeFilter, searchTerm]);

  // Stock freshness helper
  const stockFreshnessInfo = useMemo(() => {
    if (!profile?.stock_last_updated) return { text: 'No stock feed shared yet', isFresh: false };
    const date = new Date(profile.stock_last_updated);
    const diffHours = (Date.now() - date.getTime()) / (1000 * 60 * 60);
    const isToday = new Date().toDateString() === date.toDateString();
    if (diffHours < 24 || isToday) {
      return {
        text: `Updated ${date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} today`,
        isFresh: true,
      };
    }
    return {
      text: `Last updated ${date.toLocaleDateString('en-IN')}`,
      isFresh: false,
    };
  }, [profile?.stock_last_updated]);

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans">
      {/* Toast Banner */}
      {toastMsg && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 border ${
            toastMsg.type === 'success'
              ? 'bg-emerald-950/90 border-emerald-500/50 text-emerald-200'
              : 'bg-rose-950/90 border-rose-500/50 text-rose-200'
          } animate-fade-in`}
        >
          {toastMsg.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          <span className="text-sm font-semibold">{toastMsg.text}</span>
        </div>
      )}

      {/* Top Vendor Header */}
      <header className="bg-slate-800/95 border-b border-slate-700/60 sticky top-0 z-30 backdrop-blur-md px-4 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center shadow-lg shadow-indigo-500/20 text-white font-bold">
            <Store size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-black tracking-wide text-white">
                {profile?.name || 'LOCAL VENDOR PORTAL'}
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-indigo-500/20 text-indigo-300 border border-indigo-400/30">
                Authorized Supplier
              </span>
            </div>
            <div className="text-xs text-slate-400 flex flex-wrap items-center gap-2 mt-0.5">
              {profile?.contact_person && <span>Contact: {profile.contact_person}</span>}
              {profile?.phone && <span>• Phone: {profile.phone}</span>}
              {profile?.gstin && <span className="font-mono">• GSTIN: {profile.gstin}</span>}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="p-2 bg-slate-700/70 hover:bg-slate-700 rounded-lg text-slate-300 hover:text-white transition cursor-pointer flex items-center gap-1.5 text-xs font-semibold"
            title="Refresh Orders"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">Sync Portal</span>
          </button>

          {logout && (
            <button
              type="button"
              onClick={logout}
              className="p-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 hover:text-rose-200 border border-rose-500/30 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
            >
              <LogOut size={14} />
              <span className="hidden sm:inline">Logout</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Vendor Dashboard Body */}
      <main className="flex-1 p-4 sm:p-6 max-w-7xl w-full mx-auto space-y-6">
        {/* ========================================================================= */}
        {/* SECTION 1: DAILY STOCK REPORT SHARING (Google Sheet & File Upload) */}
        {/* ========================================================================= */}
        <section className="bg-slate-800/60 border border-slate-700/70 rounded-2xl p-5 shadow-lg relative overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-sm sm:text-base font-extrabold text-white flex items-center gap-2">
                <FileSpreadsheet size={18} className="text-emerald-400" />
                <span>My Daily Stock & Price List Feed</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Share your live inventory so our dispatch team arranges immediate local purchases.
              </p>
            </div>

            {/* Freshness Badge */}
            <div
              className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 border ${
                stockFreshnessInfo.isFresh
                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-400/30'
                  : 'bg-amber-500/15 text-amber-300 border-amber-400/30'
              }`}
            >
              <Clock size={13} />
              <span>{stockFreshnessInfo.text}</span>
            </div>
          </div>

          <form onSubmit={handleUpdateStockFeed} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Option A: Live Google Sheets URL */}
            <div className="bg-slate-900/70 border border-slate-700/60 rounded-xl p-4 flex flex-col justify-between">
              <div>
                <label className="block text-xs font-bold text-slate-200 mb-1 flex items-center justify-between">
                  <span>Method 1: Live Google Sheets URL</span>
                  {sheetUrl && (
                    <a
                      href={sheetUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-blue-400 hover:underline flex items-center gap-1"
                    >
                      <span>Open Sheet</span>
                      <ExternalLink size={11} />
                    </a>
                  )}
                </label>
                <p className="text-[11px] text-slate-400 mb-2">
                  Paste your public or viewable Google Sheets link for automatic live updates.
                </p>
                <input
                  type="url"
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                  value={sheetUrl}
                  onChange={(e) => setSheetUrl(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              <div className="mt-3 text-right">
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-lg shadow transition cursor-pointer"
                >
                  {submitting ? 'Saving...' : 'Save Sheet Link'}
                </button>
              </div>
            </div>

            {/* Option B: Daily File Upload (Excel, CSV, PDF) */}
            <div className="bg-slate-900/70 border border-slate-700/60 rounded-xl p-4 flex flex-col justify-between">
              <div>
                <label className="block text-xs font-bold text-slate-200 mb-1 flex items-center justify-between">
                  <span>Method 2: Upload Daily File (Excel / CSV / PDF)</span>
                  {profile?.stock_file_url && (
                    <a
                      href={profile.stock_file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-emerald-400 hover:underline flex items-center gap-1"
                    >
                      <Download size={11} />
                      <span>{profile.stock_file_name || 'Download Last File'}</span>
                    </a>
                  )}
                </label>
                <p className="text-[11px] text-slate-400 mb-2">
                  Upload daily catalog exports (.xlsx, .xls, .csv, .pdf). Max 30 MB.
                </p>

                <label className="border-2 border-dashed border-slate-700 hover:border-emerald-500/50 rounded-xl p-3 flex items-center justify-center gap-2 cursor-pointer transition-colors bg-slate-800/40">
                  <Upload size={16} className="text-slate-400" />
                  <span className="text-xs text-slate-300 font-medium truncate">
                    {stockFile ? stockFile.name : 'Click to choose stock file...'}
                  </span>
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv,.pdf"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setStockFile(e.target.files[0]);
                      }
                    }}
                    className="hidden"
                  />
                </label>
              </div>

              <div className="mt-3 text-right">
                <button
                  type="submit"
                  disabled={submitting || !stockFile}
                  className={`px-4 py-1.5 font-bold text-xs rounded-lg shadow transition cursor-pointer ${
                    stockFile
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                      : 'bg-slate-700 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  {submitting ? 'Uploading...' : 'Upload Stock File'}
                </button>
              </div>
            </div>
          </form>
        </section>

        {/* ========================================================================= */}
        {/* SECTION 2: PURCHASE INQUIRIES & ORDERS PIPELINE */}
        {/* ========================================================================= */}
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm sm:text-base font-extrabold text-white flex items-center gap-2">
                <Receipt size={18} className="text-blue-400" />
                <span>Purchase Inquiries & Active Orders</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                  {filteredOrders.length}
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Complete lifecycle: Submit PI &rarr; Review Payment Proof &rarr; Upload Final Tax Invoice.
              </p>
            </div>

            {/* Search Input */}
            <div className="relative w-full sm:w-64">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search PO #, item, invoice #..."
                className="w-full pl-9 pr-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
            {[
              { id: 'all', label: 'All Orders' },
              { id: 'inquiry', label: '1. Inquiries Awaiting PI' },
              { id: 'pi', label: '2. PI Submitted (Under Review)' },
              { id: 'payment', label: '3. Payment Verified (Invoice Needed)' },
              { id: 'invoice', label: '4. Invoice Completed' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveFilter(tab.id as TabFilter)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                  activeFilter === tab.id
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Orders Feed */}
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center text-slate-400">
              <RefreshCw size={28} className="animate-spin text-blue-500 mb-2" />
              <span className="text-xs">Loading orders...</span>
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="bg-slate-800/40 border border-slate-700/60 rounded-xl p-12 text-center text-slate-400">
              <Receipt size={36} className="mx-auto text-slate-500 mb-2" />
              <h3 className="text-sm font-bold text-white">No Orders Found</h3>
              <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                No orders match your filter. New purchase inquiries sent by the dispatch department will appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredOrders.map((order) => {
                // Pipeline stage indices:
                // 1: INQUIRY_SENT
                // 2: PI_SUBMITTED
                // 3: PAYMENT_RECORDED
                // 4: INVOICE_SUBMITTED / COMPLETED
                const currentStage =
                  order.status === 'INVOICE_SUBMITTED' || order.status === 'COMPLETED'
                    ? 4
                    : order.status === 'PAYMENT_RECORDED'
                    ? 3
                    : order.status === 'PI_SUBMITTED'
                    ? 2
                    : 1;

                return (
                  <div
                    key={order.id}
                    className="bg-slate-800/70 border border-slate-700/70 hover:border-slate-600 rounded-2xl p-5 shadow-md space-y-4"
                  >
                    {/* Header Row */}
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <span className="text-xs font-mono font-bold text-indigo-400 bg-indigo-500/10 px-2.5 py-1 rounded border border-indigo-400/20">
                          {order.po_number}
                        </span>
                        <span className="text-xs text-slate-400 font-mono">
                          {new Date(order.created_at).toLocaleDateString('en-IN', {
                            dateStyle: 'medium',
                          })}
                        </span>
                      </div>

                      {/* Status Badge */}
                      <span
                        className={`text-xs font-bold px-3 py-1 rounded-full uppercase border ${
                          currentStage === 4
                            ? 'bg-emerald-500/15 text-emerald-300 border-emerald-400/30'
                            : currentStage === 3
                            ? 'bg-blue-500/15 text-blue-300 border-blue-400/30'
                            : currentStage === 2
                            ? 'bg-purple-500/15 text-purple-300 border-purple-400/30'
                            : 'bg-amber-500/15 text-amber-300 border-amber-400/30'
                        }`}
                      >
                        {currentStage === 4
                          ? 'Tax Invoice Completed'
                          : currentStage === 3
                          ? 'Payment Confirmed'
                          : currentStage === 2
                          ? 'PI Submitted'
                          : 'New Purchase Inquiry'}
                      </span>
                    </div>

                    {/* Progress Stepper Bar */}
                    <div className="grid grid-cols-4 gap-2 pt-1 text-[11px] font-bold">
                      <div
                        className={`p-2 rounded-lg border text-center transition-all ${
                          currentStage >= 1
                            ? 'bg-amber-500/15 text-amber-300 border-amber-400/30'
                            : 'bg-slate-900/60 text-slate-500 border-slate-800'
                        }`}
                      >
                        1. Inquiry Received
                      </div>
                      <div
                        className={`p-2 rounded-lg border text-center transition-all ${
                          currentStage >= 2
                            ? 'bg-purple-500/15 text-purple-300 border-purple-400/30'
                            : 'bg-slate-900/60 text-slate-500 border-slate-800'
                        }`}
                      >
                        2. Proforma Invoice (PI)
                      </div>
                      <div
                        className={`p-2 rounded-lg border text-center transition-all ${
                          currentStage >= 3
                            ? 'bg-blue-500/15 text-blue-300 border-blue-400/30'
                            : 'bg-slate-900/60 text-slate-500 border-slate-800'
                        }`}
                      >
                        3. Payment Receipt
                      </div>
                      <div
                        className={`p-2 rounded-lg border text-center transition-all ${
                          currentStage >= 4
                            ? 'bg-emerald-500/15 text-emerald-300 border-emerald-400/30'
                            : 'bg-slate-900/60 text-slate-500 border-slate-800'
                        }`}
                      >
                        4. Tax Invoice Handover
                      </div>
                    </div>

                    {/* Order Details Body */}
                    <div className="bg-slate-900/60 border border-slate-700/50 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div>
                        <div className="text-sm font-extrabold text-white">
                          {order.item_description}
                        </div>
                        <div className="text-xs text-slate-400 mt-1 flex flex-wrap gap-3">
                          <span>
                            Requested: <strong className="text-amber-400">{order.requested_quantity} {order.unit}</strong>
                          </span>
                          {order.quoted_rate > 0 && (
                            <span>
                              Agreed Rate: <strong>₹{order.quoted_rate.toLocaleString('en-IN')}</strong>
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Contextual Action Buttons */}
                      <div className="flex flex-wrap items-center gap-2">
                        {/* Stage 1: Upload PI */}
                        {currentStage === 1 && (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedOrderForPI(order);
                              setPiNumber(`PI-${order.po_number.replace('PO-', '')}`);
                              setPiAmount(Number(order.requested_quantity * order.quoted_rate) || 0);
                            }}
                            className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs rounded-xl shadow-md transition active:scale-95 flex items-center gap-1.5 cursor-pointer"
                          >
                            <FileText size={15} />
                            <span>Upload Proforma Invoice (PI)</span>
                          </button>
                        )}

                        {/* Stage 2: PI Under Review */}
                        {currentStage === 2 && (
                          <div className="flex items-center gap-2">
                            {order.pi_file_url && (
                              <a
                                href={order.pi_file_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-purple-300 font-semibold text-xs rounded-lg border border-purple-400/30 flex items-center gap-1"
                              >
                                <Eye size={13} />
                                <span>View PI #{order.pi_number}</span>
                              </a>
                            )}
                            <span className="text-xs text-purple-400 bg-purple-500/10 px-3 py-1.5 rounded-lg border border-purple-400/20">
                              Awaiting Payment Proof from Accounts
                            </span>
                          </div>
                        )}

                        {/* Stage 3: Payment Recorded -> Upload Tax Invoice */}
                        {currentStage === 3 && (
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setViewingPaymentOrder(order)}
                              className="px-3.5 py-1.5 bg-blue-500/15 hover:bg-blue-500/25 text-blue-300 font-bold text-xs rounded-lg border border-blue-400/30 flex items-center gap-1.5 cursor-pointer"
                            >
                              <CreditCard size={14} />
                              <span>View Payment Proof (UTR: {order.payment_utr})</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setSelectedOrderForInvoice(order);
                                setInvoiceNumber(`INV-${order.po_number.replace('PO-', '')}`);
                                setInvoiceAmount(order.payment_amount || order.pi_amount || 0);
                              }}
                              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-md transition active:scale-95 flex items-center gap-1.5 cursor-pointer"
                            >
                              <Receipt size={15} />
                              <span>+ Upload Final Tax Invoice</span>
                            </button>
                          </div>
                        )}

                        {/* Stage 4: Invoice Completed */}
                        {currentStage === 4 && (
                          <div className="flex items-center gap-2">
                            {order.tax_invoice_file_url && (
                              <a
                                href={order.tax_invoice_file_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-3 py-1.5 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 font-bold text-xs rounded-lg border border-emerald-400/30 flex items-center gap-1.5"
                              >
                                <Receipt size={14} />
                                <span>Tax Invoice #{order.tax_invoice_number}</span>
                              </a>
                            )}
                            <span className="text-xs text-emerald-400 flex items-center gap-1 font-semibold">
                              <CheckCircle2 size={14} /> Reconciled
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>

      {/* ========================================================================= */}
      {/* MODAL: PROFORMA INVOICE (PI) SUBMISSION */}
      {/* ========================================================================= */}
      {selectedOrderForPI && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl relative">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <span className="text-[11px] font-mono font-bold text-purple-400 bg-purple-400/10 px-2 py-0.5 rounded border border-purple-400/20">
                  {selectedOrderForPI.po_number}
                </span>
                <h3 className="text-base font-bold text-white mt-1">
                  Upload Proforma Invoice (PI)
                </h3>
                <p className="text-xs text-slate-400">
                  Submit confirmed pricing and bank details for purchase clearance.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedOrderForPI(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitPI} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Proforma Invoice (PI) Number *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. PI-2026-987"
                  value={piNumber}
                  onChange={(e) => setPiNumber(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-purple-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Total PI Billed Amount (₹) *
                </label>
                <input
                  type="number"
                  step="any"
                  required
                  value={piAmount}
                  onChange={(e) => setPiAmount(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-purple-500 font-mono font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Attach Proforma Invoice (PDF)
                </label>
                <input
                  type="file"
                  accept=".pdf"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setPiFile(e.target.files[0]);
                    }
                  }}
                  className="w-full text-xs text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-purple-600 file:text-white hover:file:bg-purple-500 cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Notes / Payment Terms
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. 100% advance required before vehicle dispatch..."
                  value={piNotes}
                  onChange={(e) => setPiNotes(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setSelectedOrderForPI(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs rounded-lg shadow-md flex items-center gap-1.5 cursor-pointer"
                >
                  <FileText size={15} />
                  <span>{submitting ? 'Submitting...' : 'Submit Proforma Invoice'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: FINAL TAX INVOICE SUBMISSION */}
      {/* ========================================================================= */}
      {selectedOrderForInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl relative">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <span className="text-[11px] font-mono font-bold text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded border border-emerald-400/20">
                  {selectedOrderForInvoice.po_number}
                </span>
                <h3 className="text-base font-bold text-white mt-1">
                  Upload Final Tax Invoice (PDF)
                </h3>
                <p className="text-xs text-slate-400">
                  Enter final billed invoice details. Feeds into local dispatch automatically.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedOrderForInvoice(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitTaxInvoice} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Tax Invoice Number *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. SBC-2026-0089"
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Final Billed Amount (₹) *
                </label>
                <input
                  type="number"
                  step="any"
                  required
                  value={invoiceAmount}
                  onChange={(e) => setInvoiceAmount(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-emerald-500 font-mono font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Attach Tax Invoice (PDF)
                </label>
                <input
                  type="file"
                  accept=".pdf"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setInvoiceFile(e.target.files[0]);
                    }
                  }}
                  className="w-full text-xs text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-emerald-600 file:text-white hover:file:bg-emerald-500 cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Remarks / Delivery Notes
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Sent via truck KA-01-AB-1234, driver Ramesh..."
                  value={invoiceNotes}
                  onChange={(e) => setInvoiceNotes(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setSelectedOrderForInvoice(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg shadow-md flex items-center gap-1.5 cursor-pointer"
                >
                  <Receipt size={15} />
                  <span>{submitting ? 'Submitting...' : 'Submit & Reconcile'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: PAYMENT PROOF VIEWER */}
      {/* ========================================================================= */}
      {viewingPaymentOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-2xl relative">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <span className="text-[11px] font-mono font-bold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-400/20">
                  {viewingPaymentOrder.po_number}
                </span>
                <h3 className="text-base font-bold text-white mt-1">
                  Payment Receipt & UTR Proof
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setViewingPaymentOrder(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div className="p-3.5 bg-slate-800/80 rounded-xl border border-slate-700/60 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Payment Status:</span>
                  <span className="font-bold text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 size={13} /> Payment Confirmed
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Bank UTR / Ref #:</span>
                  <span className="font-mono font-extrabold text-blue-300 text-sm">
                    {viewingPaymentOrder.payment_utr}
                  </span>
                </div>
                {viewingPaymentOrder.payment_amount && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Paid Amount:</span>
                    <span className="font-extrabold text-white text-sm">
                      ₹{viewingPaymentOrder.payment_amount.toLocaleString('en-IN')}
                    </span>
                  </div>
                )}
                {viewingPaymentOrder.payment_recorded_at && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Transferred On:</span>
                    <span className="text-slate-300">
                      {new Date(viewingPaymentOrder.payment_recorded_at).toLocaleString('en-IN')}
                    </span>
                  </div>
                )}
              </div>

              {viewingPaymentOrder.payment_proof_url ? (
                <div className="border border-slate-700 rounded-xl overflow-hidden bg-slate-950 p-2 text-center">
                  <img
                    src={viewingPaymentOrder.payment_proof_url}
                    alt="Bank Slip Proof"
                    className="max-h-60 mx-auto rounded object-contain"
                    onError={(e) => {
                      // If PDF or image fails, show fallback link
                      (e.target as any).style.display = 'none';
                    }}
                  />
                  <div className="mt-2 pt-2 border-t border-slate-800 text-center">
                    <a
                      href={viewingPaymentOrder.payment_proof_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-blue-400 hover:underline"
                    >
                      <Download size={13} />
                      <span>Download Receipt / Bank Slip</span>
                    </a>
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-slate-800/40 border border-slate-700 rounded-xl text-center text-xs text-slate-400">
                  Bank UTR recorded directly by Accounts.
                </div>
              )}

              <div className="text-right pt-2">
                <button
                  type="button"
                  onClick={() => setViewingPaymentOrder(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-lg cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
