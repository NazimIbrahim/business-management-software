import React, { useState, useEffect, useMemo } from 'react';
import {
  RotateCcw,
  FileText,
  AlertTriangle,
  Plus,
  Search,
  CheckCircle2,
  PackageCheck,
  ShieldCheck,
  Eye,
  RefreshCw,
  X,
  ChevronRight,
  Calendar,
  Phone,
  User,
  MapPin,
  Truck,
  ArrowLeft,
  AlertCircle,
  Upload,
  Check,
  Layers,
} from 'lucide-react';
import { formatCurrency } from '../DispatchManagement';
import { useServer } from '../../context/ServerContext';
import { useAuth } from '../../context/AuthContext';
import { PdfPreviewModal } from '../../components/PdfPreviewModal';

export interface CreditNoteItem {
  id?: number;
  quotation_item_id: number;
  item_description: string;
  brand?: string;
  size?: string;
  damaged_quantity: number;
  unit: string;
  replacement_sourcing_status: string;
  status?: string;
  notes?: string;
}

export interface CreditNoteRecord {
  id: number;
  quotation_id: number;
  quotation_number: string;
  customer_name: string;
  customer_phone?: string;
  delivery_address?: string;
  credit_note_number: string;
  credit_note_date?: string;
  file_url: string;
  file_name?: string;
  reason: string;
  total_returned_boxes: number;
  status: string;
  notes?: string;
  created_by_name?: string;
  created_at: string;
  items?: CreditNoteItem[];
}

export interface DispatchedQuoteItem {
  id: number;
  quotation_id: number;
  description: string;
  brand?: string;
  size?: string;
  product_type?: string;
  ordered_quantity: number | string;
  dispatched_quantity: number | string;
  pending_quantity: number | string;
  fulfillment_status?: string;
  rate_per_box?: number | string;
  total_amount?: number | string;
}

export interface DispatchedQuotation {
  id: number;
  quotation_number: string;
  customer_name: string;
  customer_phone?: string;
  customer_gstin?: string;
  delivery_address?: string;
  dispatch_status: string;
  status: string;
  net_total?: number | string;
  created_at: string;
  items: DispatchedQuoteItem[];
}

interface DamageReplacementViewProps {
  onRefresh?: () => void;
  canEdit?: boolean;
}

export const DamageReplacementView: React.FC<DamageReplacementViewProps> = ({
  onRefresh,
  canEdit = true,
}) => {
  const { fetchApi, serverUrl } = useServer();
  const { user } = useAuth();

  const [creditNotes, setCreditNotes] = useState<CreditNoteRecord[]>([]);
  const [stats, setStats] = useState({
    total_requests: 0,
    total_damaged_boxes: 0,
    pending_redispatch_boxes: 0,
    resolved_boxes: 0,
  });
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'AWAITING_REDISPATCH' | 'RESOLVED'>('ALL');
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);

  // Wizard Modal States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);

  // Step 1: Customer & Quote Search
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [eligibleQuotes, setEligibleQuotes] = useState<DispatchedQuotation[]>([]);
  const [searchingQuotes, setSearchingQuotes] = useState(false);
  const [selectedQuote, setSelectedQuote] = useState<DispatchedQuotation | null>(null);

  // Step 3: Credit Note Upload & Extraction Review
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isParsingPdf, setIsParsingPdf] = useState(false);
  const [parsedData, setParsedData] = useState<{
    credit_note_number: string;
    credit_note_date: string | null;
    customer_matched: boolean;
    detected_phones: string[];
    detected_gstins: string[];
    file_url: string;
    file_name: string;
    file_size: number;
    file_base64?: string;
    matched_items: Array<{
      quotation_item_id: number;
      description: string;
      brand?: string;
      size?: string;
      unit: string;
      delivered_quantity: number;
      cn_extracted_qty: number;
      return_quantity: number;
      replacement_sourcing_status: string;
      confidence: string;
    }>;
  } | null>(null);

  const [returnReason, setReturnReason] = useState('Transit Damage / Breakage');
  const [generalNotes, setGeneralNotes] = useState('');
  const [isApplying, setIsApplying] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Load Credit Notes History
  const loadCreditNotes = async () => {
    try {
      setLoading(true);
      const res = await fetchApi<{
        success: boolean;
        credit_notes: CreditNoteRecord[];
        stats: typeof stats;
      }>('/api/dispatch/credit-notes');
      setCreditNotes(res.credit_notes || []);
      if (res.stats) setStats(res.stats);
    } catch (err: any) {
      console.error('Failed to load credit notes:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCreditNotes();
  }, []);

  // Search Eligible Dispatched Quotations
  const searchCustomerDispatches = async (queryStr: string) => {
    try {
      setSearchingQuotes(true);
      const res = await fetchApi<{
        success: boolean;
        quotations: DispatchedQuotation[];
      }>(`/api/dispatch/credit-notes/customer-dispatches?query=${encodeURIComponent(queryStr)}`);
      setEligibleQuotes(res.quotations || []);
    } catch (err: any) {
      console.error('Failed to search customer dispatches:', err);
    } finally {
      setSearchingQuotes(false);
    }
  };

  useEffect(() => {
    if (isModalOpen && wizardStep === 1) {
      const delay = setTimeout(() => {
        searchCustomerDispatches(customerSearchQuery);
      }, 300);
      return () => clearTimeout(delay);
    }
  }, [customerSearchQuery, isModalOpen, wizardStep]);

  // Open New Request Modal
  const handleOpenNewRequest = () => {
    setSelectedQuote(null);
    setUploadedFile(null);
    setParsedData(null);
    setCustomerSearchQuery('');
    setReturnReason('Transit Damage / Breakage');
    setGeneralNotes('');
    setActionError(null);
    setWizardStep(1);
    setIsModalOpen(true);
  };

  // Upload & Parse Credit Note PDF
  const handleUploadCreditNote = async (file: File) => {
    if (!selectedQuote) return;
    try {
      setIsParsingPdf(true);
      setActionError(null);
      setUploadedFile(file);

      const formData = new FormData();
      formData.append('credit_note_pdf', file);
      formData.append('quotation_id', String(selectedQuote.id));

      const token = localStorage.getItem('ama_token') || localStorage.getItem('token') || '';
      const targetUrl = `${serverUrl || ''}/api/dispatch/credit-notes/upload`;
      const res = await fetch(targetUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to parse Credit Note PDF');
      }

      setParsedData(data);
    } catch (err: any) {
      setActionError(err.message || 'Error processing Credit Note PDF');
    } finally {
      setIsParsingPdf(false);
    }
  };

  // Adjust return quantity in table
  const handleItemReturnQtyChange = (itemId: number, newQty: number) => {
    if (!parsedData) return;
    setParsedData({
      ...parsedData,
      matched_items: parsedData.matched_items.map((it) => {
        if (it.quotation_item_id === itemId) {
          const maxAllowed = it.delivered_quantity;
          const clamped = Math.max(0, Math.min(maxAllowed, newQty));
          return { ...it, return_quantity: clamped };
        }
        return it;
      }),
    });
  };

  // Adjust replacement sourcing status
  const handleItemSourcingChange = (itemId: number, sourcing: string) => {
    if (!parsedData) return;
    setParsedData({
      ...parsedData,
      matched_items: parsedData.matched_items.map((it) =>
        it.quotation_item_id === itemId ? { ...it, replacement_sourcing_status: sourcing } : it
      ),
    });
  };

  // Apply Credit Note & Reverse Lifecycle
  const handleApplyReplacement = async () => {
    if (!selectedQuote || !parsedData) return;
    const validItems = parsedData.matched_items.filter((it) => it.return_quantity > 0);

    if (validItems.length === 0) {
      setActionError('Please specify at least one item with a return quantity greater than 0.');
      return;
    }

    try {
      setIsApplying(true);
      setActionError(null);

      const payload = {
        quotation_id: selectedQuote.id,
        credit_note_number: parsedData.credit_note_number,
        credit_note_date: parsedData.credit_note_date,
        file_url: parsedData.file_url,
        file_name: parsedData.file_name,
        file_size: parsedData.file_size,
        file_base64: parsedData.file_base64,
        reason: returnReason,
        notes: generalNotes,
        items: validItems.map((it) => ({
          quotation_item_id: it.quotation_item_id,
          damaged_quantity: it.return_quantity,
          unit: it.unit,
          replacement_sourcing_status: it.replacement_sourcing_status,
        })),
      };

      const res = await fetchApi<{ success: boolean; message: string }>('/api/dispatch/credit-notes/apply', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      setIsModalOpen(false);
      loadCreditNotes();
      if (onRefresh) onRefresh();
      alert(res.message || 'Damage replacement successfully applied!');
    } catch (err: any) {
      setActionError(err.message || 'Failed to apply damage replacement');
    } finally {
      setIsApplying(false);
    }
  };

  // Filtered Credit Notes List
  const filteredNotes = useMemo(() => {
    return creditNotes.filter((cn) => {
      const matchSearch =
        !searchTerm ||
        cn.credit_note_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
        cn.quotation_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
        cn.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        cn.reason.toLowerCase().includes(searchTerm.toLowerCase());

      const isResolved = (cn.items || []).every((it) => it.status === 'REDISPATCHED');
      const matchStatus =
        statusFilter === 'ALL'
          ? true
          : statusFilter === 'RESOLVED'
          ? isResolved
          : !isResolved;

      return matchSearch && matchStatus;
    });
  }, [creditNotes, searchTerm, statusFilter]);

  return (
    <div className="flex-1 min-h-0 w-full flex flex-col overflow-hidden bg-slate-50/60 p-2 sm:p-3 space-y-3">
      {/* 1. Header & KPI Summary Cards */}
      <div className="flex-shrink-0 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-slate-200/90 pb-2.5">
        <div>
          <h2 className="text-base sm:text-lg font-black text-slate-900 tracking-tight flex items-center space-x-2">
            <span className="p-1.5 rounded-lg bg-rose-100 text-rose-700">
              <RotateCcw size={16} />
            </span>
            <span>Damage Replacement / Credit Note System</span>
          </h2>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Automated ceramic breakage reconciliation, credit note parsing, and dispatch lifecycle reversals
          </p>
        </div>

        <div className="flex items-center space-x-2 shrink-0">
          <button
            type="button"
            onClick={loadCreditNotes}
            disabled={loading}
            className="btn btn-secondary btn-sm h-8 px-2.5 text-xs flex items-center space-x-1 text-slate-700 cursor-pointer shadow-2xs"
            title="Refresh Credit Notes"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin text-indigo-600' : 'text-slate-500'} />
            <span>Refresh</span>
          </button>

          {canEdit && (
            <button
              type="button"
              onClick={handleOpenNewRequest}
              className="btn btn-emerald btn-sm h-8 px-3 text-xs font-bold flex items-center space-x-1.5 shadow-sm cursor-pointer"
            >
              <Plus size={14} />
              <span>New Damage / Replacement Request</span>
            </button>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 flex-shrink-0">
        <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-2xs">
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            Total Damage Requests
          </div>
          <div className="text-xl font-black text-slate-900 mt-1 font-mono">
            {stats.total_requests}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">Credit note claims recorded</div>
        </div>

        <div className="bg-white rounded-xl border border-rose-200 p-3 shadow-2xs bg-rose-50/20">
          <div className="text-[11px] font-bold text-rose-700 uppercase tracking-wider">
            Total Damaged / Returned
          </div>
          <div className="text-xl font-black text-rose-800 mt-1 font-mono">
            {stats.total_damaged_boxes} <span className="text-xs font-semibold text-rose-600">Boxes</span>
          </div>
          <div className="text-[10px] text-rose-600/80 mt-0.5">Deducted from dispatches</div>
        </div>

        <div className="bg-white rounded-xl border border-amber-200 p-3 shadow-2xs bg-amber-50/20">
          <div className="text-[11px] font-bold text-amber-700 uppercase tracking-wider">
            Pending Re-dispatch
          </div>
          <div className="text-xl font-black text-amber-800 mt-1 font-mono">
            {stats.pending_redispatch_boxes} <span className="text-xs font-semibold text-amber-600">Boxes</span>
          </div>
          <div className="text-[10px] text-amber-700/80 mt-0.5">In Processing Dispatch queue</div>
        </div>

        <div className="bg-white rounded-xl border border-emerald-200 p-3 shadow-2xs bg-emerald-50/20">
          <div className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider">
            Resolved Re-dispatches
          </div>
          <div className="text-xl font-black text-emerald-800 mt-1 font-mono">
            {stats.resolved_boxes} <span className="text-xs font-semibold text-emerald-600">Boxes</span>
          </div>
          <div className="text-[10px] text-emerald-700/80 mt-0.5">Replacement fulfilled to site</div>
        </div>
      </div>

      {/* 2. Search & Filter Bar */}
      <div className="flex-shrink-0 flex flex-wrap items-center justify-between gap-2 bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs">
        <div className="flex items-center space-x-2 flex-1 min-w-[240px] max-w-md">
          <div className="relative w-full">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by Credit Note #, Quote #, customer, reason..."
              className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500 bg-slate-50/50"
            />
          </div>
        </div>

        <div className="flex items-center space-x-1.5 text-xs">
          <span className="text-[11px] font-semibold text-slate-500">Status:</span>
          {(['ALL', 'AWAITING_REDISPATCH', 'RESOLVED'] as const).map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                statusFilter === st
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {st === 'ALL' ? 'All Records' : st === 'AWAITING_REDISPATCH' ? 'Awaiting Re-dispatch' : 'Resolved'}
            </button>
          ))}
        </div>
      </div>

      {/* 3. History Audit Table */}
      <div className="flex-1 min-h-0 bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden flex flex-col">
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-auto scrollbar-thin">
          <table className="w-full text-left text-xs min-w-[850px]">
            <thead className="bg-slate-50 text-[10px] font-bold text-slate-500 uppercase border-b border-slate-200 sticky top-0 z-10">
              <tr>
                <th className="py-2.5 px-3">Date</th>
                <th className="py-2.5 px-3">Credit Note #</th>
                <th className="py-2.5 px-3">Quotation Ref</th>
                <th className="py-2.5 px-3">Customer & Site</th>
                <th className="py-2.5 px-3 text-right">Damaged Boxes</th>
                <th className="py-2.5 px-3">Return Reason</th>
                <th className="py-2.5 px-3 text-center">Lifecycle Status</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    <RefreshCw size={20} className="animate-spin mx-auto text-indigo-500 mb-2" />
                    <span>Loading Credit Note & Damage history...</span>
                  </td>
                </tr>
              ) : filteredNotes.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-slate-400">
                    <RotateCcw size={28} className="mx-auto text-slate-300 mb-2" />
                    <p className="font-semibold text-slate-600 text-sm">No Damage / Replacement Requests Found</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Click "+ New Damage / Replacement Request" to record breakage or customer returns.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredNotes.map((cn) => {
                  const pdfUrl = `${serverUrl || ''}/api/dispatch/credit-notes/${cn.id}/view-pdf`;
                  const isResolved = (cn.items || []).every((it) => it.status === 'REDISPATCHED');

                  return (
                    <tr key={cn.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-2.5 px-3 font-mono text-slate-600">
                        {cn.credit_note_date
                          ? new Date(cn.credit_note_date).toLocaleDateString('en-IN')
                          : new Date(cn.created_at).toLocaleDateString('en-IN')}
                      </td>
                      <td className="py-2.5 px-3 font-bold text-slate-900 font-mono flex items-center space-x-1.5">
                        <span className="p-1 rounded bg-rose-50 text-rose-700">
                          <FileText size={12} />
                        </span>
                        <span>#{cn.credit_note_number}</span>
                      </td>
                      <td className="py-2.5 px-3 font-bold text-indigo-700 font-mono">
                        {cn.quotation_number}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-bold text-slate-800">{cn.customer_name}</div>
                        {cn.customer_phone && (
                          <div className="text-[10px] text-slate-400 flex items-center space-x-1 mt-0.5 font-mono">
                            <Phone size={10} />
                            <span>{cn.customer_phone}</span>
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-rose-700 text-sm">
                        {cn.total_returned_boxes} <span className="text-[10px] font-normal text-slate-400">box</span>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                          {cn.reason}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            isResolved
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {isResolved ? 'Resolved' : 'In Processing Dispatch'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          onClick={() => setPreviewPdfUrl(pdfUrl)}
                          className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-semibold cursor-pointer shadow-2xs"
                        >
                          <Eye size={12} />
                          <span>View PDF</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. Three-Step Damage Replacement Wizard Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[85vh] flex flex-col border border-slate-200 shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 rounded-xl bg-rose-100 text-rose-700">
                  <RotateCcw size={18} />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base leading-tight">
                    New Damage / Replacement Request
                  </h3>
                  <div className="text-[11px] text-slate-500 flex items-center space-x-2 mt-0.5">
                    <span className={wizardStep === 1 ? 'font-bold text-indigo-600' : ''}>
                      1. Select Quotation
                    </span>
                    <span>→</span>
                    <span className={wizardStep === 2 ? 'font-bold text-indigo-600' : ''}>
                      2. Delivered Items
                    </span>
                    <span>→</span>
                    <span className={wizardStep === 3 ? 'font-bold text-indigo-600' : ''}>
                      3. Upload Credit Note & Apply
                    </span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4 text-xs scrollbar-thin">
              {actionError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 flex items-center space-x-2">
                  <AlertTriangle size={16} className="text-rose-600 shrink-0" />
                  <span>{actionError}</span>
                </div>
              )}

              {/* STEP 1: Search Customer & Select Quotation */}
              {wizardStep === 1 && (
                <div className="space-y-3">
                  <div className="text-slate-700 font-semibold text-xs">
                    Search and select the customer quotation with previously dispatched goods:
                  </div>

                  <div className="relative">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={customerSearchQuery}
                      onChange={(e) => setCustomerSearchQuery(e.target.value)}
                      placeholder="Type customer name, phone number, or quote reference (e.g. AMA-2026-0043)..."
                      className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500/20"
                      autoFocus
                    />
                  </div>

                  <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-72 overflow-y-auto scrollbar-thin">
                    {searchingQuotes ? (
                      <div className="p-6 text-center text-slate-400">
                        <RefreshCw size={16} className="animate-spin mx-auto text-indigo-500 mb-1" />
                        <span>Searching previously dispatched quotations...</span>
                      </div>
                    ) : eligibleQuotes.length === 0 ? (
                      <div className="p-6 text-center text-slate-400">
                        <PackageCheck size={24} className="mx-auto text-slate-300 mb-1" />
                        <p className="font-semibold text-slate-600">No Dispatched Quotations Found</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Only quotations with recorded dispatched quantities can have damage replacements.
                        </p>
                      </div>
                    ) : (
                      eligibleQuotes.map((q) => {
                        const totalDispBoxes = q.items.reduce(
                          (acc, it) => acc + parseFloat(String(it.dispatched_quantity || 0)),
                          0
                        );

                        return (
                          <div
                            key={q.id}
                            onClick={() => {
                              setSelectedQuote(q);
                              setWizardStep(2);
                            }}
                            className="p-3 hover:bg-indigo-50/60 cursor-pointer transition-colors flex items-center justify-between"
                          >
                            <div>
                              <div className="flex items-center space-x-2">
                                <span className="font-bold text-slate-900 font-mono">
                                  {q.quotation_number}
                                </span>
                                <span className="font-semibold text-slate-700">• {q.customer_name}</span>
                                <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                                  {q.dispatch_status}
                                </span>
                              </div>
                              <div className="text-[11px] text-slate-500 mt-1 flex items-center space-x-3">
                                <span>{q.customer_phone || 'No phone'}</span>
                                <span>•</span>
                                <span>{q.delivery_address || 'Site delivery'}</span>
                              </div>
                            </div>

                            <div className="flex items-center space-x-3 shrink-0">
                              <div className="text-right">
                                <div className="font-mono font-bold text-emerald-700 text-xs">
                                  {totalDispBoxes} boxes delivered
                                </div>
                                <div className="text-[10px] text-slate-400">{q.items.length} item line(s)</div>
                              </div>
                              <ChevronRight size={16} className="text-slate-400" />
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {/* STEP 2: Review Quotation Line Items Delivered */}
              {wizardStep === 2 && selectedQuote && (
                <div className="space-y-3">
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                    <div>
                      <div className="font-bold text-slate-900 text-sm">
                        {selectedQuote.quotation_number} — {selectedQuote.customer_name}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        Phone: <span className="font-mono font-semibold text-slate-700">{selectedQuote.customer_phone || '-'}</span> | GSTIN:{' '}
                        <span className="font-mono font-semibold text-slate-700">{selectedQuote.customer_gstin || '-'}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => setWizardStep(1)}
                      className="text-indigo-600 hover:text-indigo-800 text-xs font-semibold cursor-pointer"
                    >
                      Change Quote
                    </button>
                  </div>

                  <div className="font-bold text-slate-800 text-xs uppercase tracking-wider">
                    Eligible Dispatched Line Items:
                  </div>

                  <div className="border border-slate-200 rounded-xl overflow-hidden overflow-x-auto">
                    <table className="w-full text-left text-xs min-w-[500px]">
                      <thead className="bg-slate-50 text-[10px] font-bold text-slate-500 uppercase border-b border-slate-200">
                        <tr>
                          <th className="py-2 px-3">Item Description</th>
                          <th className="py-2 px-2 text-right">Quoted Qty</th>
                          <th className="py-2 px-2 text-right">Delivered Qty</th>
                          <th className="py-2 px-2 text-right">Current Pending</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {selectedQuote.items.map((it) => (
                          <tr key={it.id}>
                            <td className="py-2 px-3">
                              <div className="font-semibold text-slate-800">{it.description}</div>
                              <div className="text-[10px] text-slate-400 font-mono">
                                {it.brand} {it.size ? `• ${it.size}` : ''}
                              </div>
                            </td>
                            <td className="py-2 px-2 text-right font-mono text-slate-600">{it.ordered_quantity}</td>
                            <td className="py-2 px-2 text-right font-mono font-bold text-emerald-700">
                              {it.dispatched_quantity}
                            </td>
                            <td className="py-2 px-2 text-right font-mono text-amber-700">
                              {it.pending_quantity}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <button
                      onClick={() => setWizardStep(1)}
                      className="px-3 py-1.5 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 font-semibold cursor-pointer"
                    >
                      ← Back to Search
                    </button>
                    <button
                      onClick={() => setWizardStep(3)}
                      className="btn btn-primary btn-sm px-4 py-1.5 font-bold cursor-pointer flex items-center space-x-1"
                    >
                      <span>Proceed to Credit Note Upload</span>
                      <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 3: Credit Note PDF Upload & Line Item Auto-Reconciliation */}
              {wizardStep === 3 && selectedQuote && (
                <div className="space-y-4">
                  {/* Upload Zone */}
                  {!parsedData && (
                    <div className="p-5 border-2 border-dashed border-indigo-200 hover:border-indigo-400 bg-indigo-50/30 rounded-2xl text-center space-y-2 transition-all">
                      <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-600 mx-auto flex items-center justify-center">
                        <Upload size={18} />
                      </div>
                      <div className="font-bold text-slate-800 text-sm">
                        Upload Credit Note (PDF)
                      </div>
                      <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                        Upload the official digital Credit Note PDF. Our engine will automatically extract the Credit Note Number, Date, Customer verification, and returned line quantities.
                      </p>

                      <label className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl btn-primary font-bold text-xs cursor-pointer shadow-sm">
                        <Upload size={14} />
                        <span>{isParsingPdf ? 'Analyzing PDF...' : 'Select Credit Note PDF'}</span>
                        <input
                          type="file"
                          accept="application/pdf"
                          className="hidden"
                          disabled={isParsingPdf}
                          onChange={(e) => {
                            if (e.target.files && e.target.files[0]) {
                              handleUploadCreditNote(e.target.files[0]);
                              e.target.value = '';
                            }
                          }}
                        />
                      </label>
                    </div>
                  )}

                  {/* Extraction Review Table & Parameters */}
                  {parsedData && (
                    <div className="space-y-3">
                      {/* CN Details Banner */}
                      <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-950 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center space-x-2">
                          <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                          <div>
                            <div className="font-bold">
                              Credit Note #{parsedData.credit_note_number} Verified
                            </div>
                            <div className="text-[11px] text-emerald-800">
                              Date: {parsedData.credit_note_date || 'Today'} • Customer Match: {parsedData.customer_matched ? '✅ Verified' : '⚠️ Manual Match'}
                            </div>
                          </div>
                        </div>

                        <label className="text-indigo-600 hover:text-indigo-800 text-xs font-semibold cursor-pointer underline">
                          <span>Re-upload New PDF</span>
                          <input
                            type="file"
                            accept="application/pdf"
                            className="hidden"
                            onChange={(e) => {
                              if (e.target.files && e.target.files[0]) {
                                handleUploadCreditNote(e.target.files[0]);
                                e.target.value = '';
                              }
                            }}
                          />
                        </label>
                      </div>

                      {/* Return Parameters */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 bg-slate-50 p-3 rounded-xl border border-slate-200">
                        <div>
                          <label className="font-bold text-slate-700 block text-[11px] mb-1">
                            Primary Return Reason *
                          </label>
                          <select
                            value={returnReason}
                            onChange={(e) => setReturnReason(e.target.value)}
                            className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white font-medium"
                          >
                            <option value="Transit Damage / Breakage">Transit Damage / Breakage</option>
                            <option value="Edge Chipping / Cracks">Edge Chipping / Cracks</option>
                            <option value="Shade / Batch Mismatch">Shade / Batch Mismatch</option>
                            <option value="Customer Site Return">Customer Site Return</option>
                            <option value="Other / Factory Defect">Other / Factory Defect</option>
                          </select>
                        </div>

                        <div>
                          <label className="font-bold text-slate-700 block text-[11px] mb-1">
                            Credit Note Remarks / Supervisor Notes
                          </label>
                          <input
                            type="text"
                            value={generalNotes}
                            onChange={(e) => setGeneralNotes(e.target.value)}
                            placeholder="e.g. 5 boxes chipped during unloading at site..."
                            className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white"
                          />
                        </div>
                      </div>

                      {/* Items Return Table */}
                      <div className="border border-slate-200 rounded-xl overflow-hidden overflow-x-auto">
                        <table className="w-full text-left text-xs min-w-[650px]">
                          <thead className="bg-slate-50 text-[10px] font-bold text-slate-500 uppercase border-b border-slate-200">
                            <tr>
                              <th className="py-2 px-3">Item Description</th>
                              <th className="py-2 px-2 text-right">Delivered</th>
                              <th className="py-2 px-2 text-right">Return Qty (Editable)</th>
                              <th className="py-2 px-2 text-right">New Dispatched</th>
                              <th className="py-2 px-2 text-right">New Pending</th>
                              <th className="py-2 px-3">Replacement Sourcing</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {parsedData.matched_items.map((it) => {
                              const newDisp = Math.max(0, it.delivered_quantity - it.return_quantity);
                              const origQuoteItem = selectedQuote.items.find(
                                (qi) => qi.id === it.quotation_item_id
                              );
                              const ordered = parseFloat(String(origQuoteItem?.ordered_quantity || 1));
                              const newPending = Math.max(0, ordered - newDisp);

                              return (
                                <tr key={it.quotation_item_id} className={it.return_quantity > 0 ? 'bg-rose-50/30' : ''}>
                                  <td className="py-2 px-3">
                                    <div className="font-semibold text-slate-800">{it.description}</div>
                                    <div className="text-[10px] text-slate-400 font-mono">
                                      {it.brand} {it.size ? `• ${it.size}` : ''}
                                    </div>
                                  </td>
                                  <td className="py-2 px-2 text-right font-mono text-slate-600 font-bold">
                                    {it.delivered_quantity}
                                  </td>
                                  <td className="py-2 px-2 text-right">
                                    <input
                                      type="number"
                                      step="1"
                                      min="0"
                                      max={it.delivered_quantity}
                                      value={it.return_quantity}
                                      onChange={(e) =>
                                        handleItemReturnQtyChange(
                                          it.quotation_item_id,
                                          parseFloat(e.target.value) || 0
                                        )
                                      }
                                      className="w-20 px-2 py-1 text-right font-mono font-bold text-rose-700 border border-rose-300 rounded-lg focus:ring-1 focus:ring-rose-500 bg-white"
                                    />
                                  </td>
                                  <td className="py-2 px-2 text-right font-mono font-bold text-slate-700">
                                    {newDisp}
                                  </td>
                                  <td className="py-2 px-2 text-right font-mono font-bold text-amber-700">
                                    {newPending}
                                  </td>
                                  <td className="py-2 px-3">
                                    <select
                                      value={it.replacement_sourcing_status}
                                      onChange={(e) =>
                                        handleItemSourcingChange(it.quotation_item_id, e.target.value)
                                      }
                                      disabled={it.return_quantity === 0}
                                      className="px-2 py-1 border border-slate-300 rounded-lg text-xs bg-white font-medium disabled:opacity-40"
                                    >
                                      <option value="READY_STOCK">Ready Stock (Godown)</option>
                                      <option value="LOCAL_ARRANGE">Local Arrange (Dealer)</option>
                                      <option value="FACTORY_ORDER">Factory Order (Morbi)</option>
                                    </select>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Wizard Footer Controls */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                    <button
                      onClick={() => setWizardStep(2)}
                      className="px-3 py-1.5 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 font-semibold cursor-pointer"
                    >
                      ← Back
                    </button>

                    {parsedData && (
                      <button
                        onClick={handleApplyReplacement}
                        disabled={isApplying}
                        className="btn btn-danger btn-sm px-4 py-2 font-bold cursor-pointer flex items-center space-x-1.5 shadow-sm disabled:opacity-50"
                      >
                        <RotateCcw size={14} className={isApplying ? 'animate-spin' : ''} />
                        <span>{isApplying ? 'Applying Replacement...' : 'Apply Damage Replacement & Credit Note'}</span>
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* PDF Preview Modal */}
      {previewPdfUrl && (
        <PdfPreviewModal
          isOpen={Boolean(previewPdfUrl)}
          pdfUrl={previewPdfUrl}
          title="Credit Note Document Preview"
          fileName="credit-note.pdf"
          onClose={() => setPreviewPdfUrl(null)}
        />
      )}
    </div>
  );
};
