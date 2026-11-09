import React, { useState } from 'react';
import {
  Truck,
  Package,
  Layers,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Search,
  Calendar,
  Phone,
  User,
  MapPin,
  Clock,
  Printer,
  ChevronDown,
  ChevronUp,
  CreditCard,
  ShieldCheck,
  ShieldAlert,
  ArrowRight,
  X,
  FileText,
  Upload,
  Eye,
  Trash2,
  AlertCircle,
  Check,
  ExternalLink,
} from 'lucide-react';
import { formatCurrency } from '../DispatchManagement';
import { useServer } from '../../context/ServerContext';
import { useAuth } from '../../context/AuthContext';

export interface DispatchInvoice {
  id: number;
  quotation_id: number;
  invoice_number: string;
  invoice_date?: string;
  file_name: string;
  file_url: string;
  view_url?: string;
  file_size: number;
  customer_phone_detected?: string;
  customer_gstin_detected?: string;
  reconciliation_summary?: any;
  is_verified: boolean;
  uploaded_by_name?: string;
  created_at: string;
}

export interface ProcessingItem {
  id: number;
  quotation_id: number;
  area_name?: string;
  description: string;
  brand?: string;
  size?: string;
  product_type?: string;
  ordered_quantity: number;
  quantity_dispatched: number;
  remaining_quantity: number;
  pending_quantity?: number;
  fulfillment_status?: 'PENDING' | 'PARTIALLY_DISPATCHED' | 'DISPATCHED' | string;
  last_invoice_number?: string;
  last_invoice_id?: number;
  dispatch_status: string;
  procurement_status?: string;
  expected_dispatch_date?: string;
  item_image?: string;
  total_amount?: number;
  tax_inclusive_amount?: number;
  unit_rate_with_tax?: number;
  dispatched_value?: number;
  pending_value?: number;
}

export interface ProcessingQuotation {
  id: number;
  quotation_number: string;
  customer_name: string;
  customer_phone?: string;
  site_location?: string;
  delivery_address?: string;
  sales_person_name?: string;
  gross_total?: number | string;
  tax_type?: string;
  tax_multiplier?: number;
  net_total: number | string;
  dispatch_status: string;
  manager_approval_note?: string;
  dispatched_total_value?: number;
  expected_dispatch_date?: string;
  scheduled_dispatch_date?: string;
  dispatch_notes?: string;
  verified_paid: number | string;
  balance_due: number | string;
  vehicle_no?: string;
  driver_name?: string;
  driver_phone?: string;
  challan_number?: string;
  items: ProcessingItem[];
  total_ordered_qty: number;
  total_dispatched_qty: number;
  progress_percent: number;
  all_items_dispatched: boolean;
  total_received_amount?: number;
  ready_stock_total_value?: number;
  local_purchase_total_value?: number;
  committed_immediate_value?: number;
  is_payment_sufficient?: boolean;
  deficit_amount?: number;
  payment_coverage_status?: 'COVERED' | 'INSUFFICIENT';
  invoices?: DispatchInvoice[];
  has_verified_invoice?: boolean;
  latest_invoice?: DispatchInvoice | null;
}

export interface ParsedInvoiceItem {
  id: string;
  description: string;
  raw_description?: string;
  quantity: number;
  unit?: string;
}

interface Props {
  dispatches: ProcessingQuotation[];
  loading: boolean;
  onRefresh: () => void;
  onRecordPartial: (quote: ProcessingQuotation, item: ProcessingItem) => void;
  onPrintChallan: (quoteId: number) => void;
  canEdit: boolean;
  onNavigateToPayments?: (quotationNumber?: string) => void;
  userRole?: string;
}

export const ProcessingDispatchView: React.FC<Props> = ({
  dispatches,
  loading,
  onRefresh,
  onRecordPartial,
  onPrintChallan,
  canEdit,
  onNavigateToPayments,
  userRole = '',
}) => {
  const { serverUrl, fetchApi } = useServer();
  const { token } = useAuth();
  const authToken = token || localStorage.getItem('ama_token') || '';

  const [search, setSearch] = useState('');
  const [expandedQuotes, setExpandedQuotes] = useState<{ [key: number]: boolean }>({});

  // Financial Safety Modal State
  const [safetyModalItem, setSafetyModalItem] = useState<{
    quote: ProcessingQuotation;
    item: ProcessingItem;
  } | null>(null);
  const [adminOverrideReason, setAdminOverrideReason] = useState('');

  // Tax Invoice Upload & Reconciliation States
  const [uploadingQuoteId, setUploadingQuoteId] = useState<number | null>(null);
  const [mismatchErrors, setMismatchErrors] = useState<Record<number, string>>({});
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);

  const getInvoicePdfUrl = (invoice?: { id?: number; file_url?: string; view_url?: string } | null) => {
    if (!invoice) return '';
    const base = serverUrl || '';
    const token = localStorage.getItem('token');
    const tokenParam = token ? `token=${encodeURIComponent(token)}` : '';

    if (invoice.view_url) {
      const url = invoice.view_url.startsWith('http') ? invoice.view_url : `${base}${invoice.view_url}`;
      return tokenParam ? `${url}${url.includes('?') ? '&' : '?'}${tokenParam}` : url;
    }
    if (invoice.id) {
      const url = `${base}/api/dispatch/invoices/${invoice.id}/view-pdf`;
      return tokenParam ? `${url}?${tokenParam}` : url;
    }
    if (invoice.file_url) {
      if (invoice.file_url.startsWith('http://') || invoice.file_url.startsWith('https://')) {
        return invoice.file_url;
      }
      const url = `${base}${invoice.file_url.startsWith('/') ? '' : '/'}${invoice.file_url}`;
      return tokenParam ? `${url}${url.includes('?') ? '&' : '?'}${tokenParam}` : url;
    }
    return '';
  };
  const [reconcileDrawer, setReconcileDrawer] = useState<{
    quote: ProcessingQuotation;
    reconciliation: any;
    extractedItems: ParsedInvoiceItem[];
    invoice: DispatchInvoice;
  } | null>(null);
  const [isCommittingReconcile, setIsCommittingReconcile] = useState(false);

  // Safeguard & Enforcement Modals
  const [dispatchBlockedModal, setDispatchBlockedModal] = useState<{
    isOpen: boolean;
    quoteNumber: string;
    quotationId: number;
  } | null>(null);

  const [itemNotFoundModal, setItemNotFoundModal] = useState<{
    isOpen: boolean;
    itemName: string;
    quoteNumber: string;
  } | null>(null);

  const [overageModalItem, setOverageModalItem] = useState<{
    quote: ProcessingQuotation;
    item: ProcessingItem;
    quotedQty: number;
    invoicedQty: number;
    excessQty: number;
  } | null>(null);
  const [supervisorOverageReason, setSupervisorOverageReason] = useState('');
  const [managementPaymentOverride, setManagementPaymentOverride] = useState(false);
  const [managementOverrideNote, setManagementOverrideNote] = useState('');
  const [reviewApprovalQuote, setReviewApprovalQuote] = useState<ProcessingQuotation | null>(null);
  const [reviewApprovalActionNote, setReviewApprovalActionNote] = useState('');
  const [isSubmittingApproval, setIsSubmittingApproval] = useState(false);

  // Helper to open reconciliation drawer with guaranteed extractedItems and auto-match fallback
  const openReconciliationDrawer = (
    quote: ProcessingQuotation,
    reconciliationData: any,
    invoice: DispatchInvoice,
    rawExtractedList?: any[]
  ) => {
    const rawList =
      rawExtractedList ||
      reconciliationData?.extractedItems ||
      reconciliationData?.extracted_items ||
      reconciliationData?.unmapped_invoice_lines ||
      reconciliationData?.matched_items?.map((m: any, idx: number) => ({
        id: m.invoice_item_id || `inv_${idx}`,
        description: m.invoice_description || m.description,
        quantity: m.invoice_qty,
        unit: m.unit || 'BOX',
      })) ||
      [];

    const extractedItems: ParsedInvoiceItem[] = rawList.map((it: any, idx: number) => ({
      id: String(it.id || `inv_${idx}`),
      description: it.description || it.raw_description || `Invoice Line #${idx + 1}`,
      raw_description: it.raw_description || it.description || '',
      quantity: parseFloat(String(it.quantity || 0)),
      unit: it.unit || 'BOX',
    }));

    let matchedItems: any[] = [...(reconciliationData?.matched_items || [])];
    const matchedQuoteIds = new Set(matchedItems.map((m: any) => String(m.quotation_item_id)));
    const usedInvoiceIds = new Set(matchedItems.map((m: any) => String(m.invoice_item_id || '')));

    // Case-insensitive substring auto-match fallback for any unmapped items
    for (const qIt of quote.items || []) {
      if (!matchedQuoteIds.has(String(qIt.id))) {
        const qClean = (qIt.description || (qIt as any).name || (qIt as any).item_name || '')
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

        if (!qClean) continue;

        const foundInv = extractedItems.find((inv) => {
          if (usedInvoiceIds.has(inv.id)) return false;
          const iClean = (inv.description || inv.raw_description || '')
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
          return iClean.includes(qClean) || qClean.includes(iClean);
        });

        if (foundInv) {
          const quoted = parseFloat(String(qIt.ordered_quantity || 0));
          const already = parseFloat(String(qIt.quantity_dispatched || 0));
          const qty = foundInv.quantity;
          const newDispatched = Math.round((already + qty) * 100) / 100;
          const pending = Math.max(0, Math.round((quoted - newDispatched) * 100) / 100);
          const isOverage = newDispatched > quoted;
          const excess = isOverage ? Math.round((newDispatched - quoted) * 100) / 100 : 0;
          const fulfillmentStatus =
            newDispatched >= quoted
              ? 'DISPATCHED'
              : newDispatched > 0
              ? 'PARTIALLY_DISPATCHED'
              : 'PENDING';

          matchedItems.push({
            quotation_item_id: qIt.id,
            invoice_item_id: foundInv.id,
            description: qIt.description,
            brand: qIt.brand,
            size: qIt.size,
            invoice_description: foundInv.description,
            quoted_qty: quoted,
            already_dispatched_qty: already,
            invoice_qty: qty,
            unit: foundInv.unit || 'BOX',
            new_dispatched_qty: newDispatched,
            pending_qty: pending,
            fulfillment_status: fulfillmentStatus,
            is_overage: isOverage,
            excess_qty: excess,
            match_score: 1.0,
            confidence: 'EXACT',
          });

          matchedQuoteIds.add(String(qIt.id));
          usedInvoiceIds.add(foundInv.id);
        }
      }
    }

    setReconcileDrawer({
      quote,
      reconciliation: {
        ...reconciliationData,
        matched_items: matchedItems,
        has_overages: matchedItems.some((m: any) => m.is_overage),
        total_matched_count: matchedItems.length,
      },
      extractedItems,
      invoice,
    });

    if (extractedItems.length === 0 && invoice?.id) {
      setTimeout(() => {
        handleRescanInvoice(quote.id);
      }, 50);
    }
  };

  // Reactive Quantity Editor for Tax Invoice Reconciliation
  const handleInvoiceQtyChange = (quotationItemId: number | string, rawQty: number) => {
    if (!reconcileDrawer) return;
    const qty = isNaN(rawQty) || rawQty < 0 ? 0 : rawQty;

    const updatedMatched = (reconcileDrawer.reconciliation.matched_items || []).map((it: any) => {
      if (String(it.quotation_item_id) === String(quotationItemId)) {
        const quoted = parseFloat(it.quoted_qty || 0);
        const already = parseFloat(it.already_dispatched_qty || 0);
        const newDispatched = Math.round((already + qty) * 100) / 100;
        const pending = Math.max(0, Math.round((quoted - newDispatched) * 100) / 100);
        const isOverage = newDispatched > quoted;
        const excess = isOverage ? Math.round((newDispatched - quoted) * 100) / 100 : 0;
        const fulfillmentStatus =
          newDispatched >= quoted
            ? 'DISPATCHED'
            : newDispatched > 0
            ? 'PARTIALLY_DISPATCHED'
            : 'PENDING';

        return {
          ...it,
          invoice_qty: qty,
          new_dispatched_qty: newDispatched,
          pending_qty: pending,
          is_overage: isOverage,
          excess_qty: excess,
          fulfillment_status: fulfillmentStatus,
        };
      }
      return it;
    });

    const hasOverages = updatedMatched.some((it: any) => it.is_overage);

    setReconcileDrawer({
      ...reconcileDrawer,
      reconciliation: {
        ...reconcileDrawer.reconciliation,
        matched_items: updatedMatched,
        has_overages: hasOverages,
      },
    });
  };

  // 1-Click Manual Item Mapper from Dropdown
  const handleManualMap = (quoteItemId: number | string, invoiceItemId: string) => {
    if (!reconcileDrawer) return;

    if (!invoiceItemId) {
      handleUnbindMatchedItem(quoteItemId);
      return;
    }

    const targetQuoteItem = (reconcileDrawer.quote.items || []).find(
      (i) => String(i.id) === String(quoteItemId)
    );
    if (!targetQuoteItem) return;

    const selectedInv = (reconcileDrawer.extractedItems || []).find((inv) => inv.id === invoiceItemId);
    if (!selectedInv) return;

    const quoted = parseFloat(String(targetQuoteItem.ordered_quantity || 0));
    const already = parseFloat(String(targetQuoteItem.quantity_dispatched || 0));
    const qty = parseFloat(String(selectedInv.quantity || 0));
    const newDispatched = Math.round((already + qty) * 100) / 100;
    const pending = Math.max(0, Math.round((quoted - newDispatched) * 100) / 100);
    const isOverage = newDispatched > quoted;
    const excess = isOverage ? Math.round((newDispatched - quoted) * 100) / 100 : 0;
    const fulfillmentStatus =
      newDispatched >= quoted
        ? 'DISPATCHED'
        : newDispatched > 0
        ? 'PARTIALLY_DISPATCHED'
        : 'PENDING';

    const newMatchedItem = {
      quotation_item_id: targetQuoteItem.id,
      invoice_item_id: selectedInv.id,
      description: targetQuoteItem.description,
      brand: targetQuoteItem.brand,
      size: targetQuoteItem.size,
      invoice_description: selectedInv.description,
      quoted_qty: quoted,
      already_dispatched_qty: already,
      invoice_qty: qty,
      unit: selectedInv.unit || 'BOX',
      new_dispatched_qty: newDispatched,
      pending_qty: pending,
      fulfillment_status: fulfillmentStatus,
      is_overage: isOverage,
      excess_qty: excess,
      match_score: 1.0,
      confidence: 'Mapped',
    };

    const nextMatched = [
      ...(reconcileDrawer.reconciliation.matched_items || []).filter(
        (m: any) => String(m.quotation_item_id) !== String(quoteItemId)
      ),
      newMatchedItem,
    ];

    setReconcileDrawer({
      ...reconcileDrawer,
      reconciliation: {
        ...reconcileDrawer.reconciliation,
        matched_items: nextMatched,
        has_overages: nextMatched.some((m: any) => m.is_overage),
        total_matched_count: nextMatched.length,
      },
    });
  };

  // Unbind a matched item back to manual selector state
  const handleUnbindMatchedItem = (quoteItemId: number | string) => {
    if (!reconcileDrawer) return;

    const nextMatched = (reconcileDrawer.reconciliation.matched_items || []).filter(
      (m: any) => String(m.quotation_item_id) !== String(quoteItemId)
    );

    setReconcileDrawer({
      ...reconcileDrawer,
      reconciliation: {
        ...reconcileDrawer.reconciliation,
        matched_items: nextMatched,
        has_overages: nextMatched.some((m: any) => m.is_overage),
        total_matched_count: nextMatched.length,
      },
    });
  };

  // Map an unmapped invoice line to a quotation item from the secondary helper card
  const handleMapUnmappedLine = (unmappedIdx: number, targetQuoteItemId: number) => {
    if (!reconcileDrawer) return;
    const unmapped = reconcileDrawer.reconciliation.unmapped_invoice_lines?.[unmappedIdx];
    if (!unmapped) return;
    const invId = unmapped.id || `inv_${unmappedIdx}`;
    handleManualMap(targetQuoteItemId, invId);
  };

  const isAdminOrManager = userRole === 'admin' || userRole === 'manager';

  const toggleExpand = (id: number) => {
    setExpandedQuotes((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Upload Tax Invoice handler
  const handleUploadInvoice = async (quotationId: number, file: File) => {
    setUploadingQuoteId(quotationId);
    setMismatchErrors((prev) => ({ ...prev, [quotationId]: '' }));

    try {
      const formData = new FormData();
      formData.append('invoice_pdf', file);

      const targetUrl = `${serverUrl || ''}/api/dispatch/${quotationId}/upload-invoice`;
      const res = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.reason === 'CUSTOMER_MISMATCH') {
          setMismatchErrors((prev) => ({
            ...prev,
            [quotationId]: data.message || '⚠️ Data Mismatch: Customer phone/GSTIN does not match this quotation. Please verify and retry.',
          }));
        } else {
          alert(data.error || 'Failed to upload Tax Invoice PDF');
        }
        return;
      }

      // Success: open reconciliation review drawer
      const quote = dispatches.find((q) => q.id === quotationId);
      if (quote) {
        openReconciliationDrawer(
          quote,
          data.reconciliation || {},
          data.invoice,
          data.extractedItems || data.extracted_items
        );
      }

      onRefresh();
    } catch (err: any) {
      alert(err.message || 'Error uploading tax invoice');
    } finally {
      setUploadingQuoteId(null);
    }
  };

  // Remove/Delete Tax Invoice
  const handleDeleteInvoice = async (invoiceId: number) => {
    if (!window.confirm('Are you sure you want to remove this Tax Invoice?')) return;
    try {
      await fetchApi<any>(`/api/dispatch/invoices/${invoiceId}`, { method: 'DELETE' });
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'Failed to delete invoice');
    }
  };

  // Re-scan & Re-reconcile Tax Invoice PDF
  const [isRescanning, setIsRescanning] = useState(false);
  const handleRescanInvoice = async (quotationId: number) => {
    setIsRescanning(true);
    try {
      const res = await fetchApi<any>(`/api/dispatch/${quotationId}/re-reconcile-invoice`, {
        method: 'POST',
      });
      if (res?.success) {
        const quote =
          dispatches.find((q) => q.id === quotationId) ||
          (reconcileDrawer?.quote.id === quotationId ? reconcileDrawer.quote : null);
        if (quote) {
          openReconciliationDrawer(
            quote,
            res.reconciliation,
            res.invoice,
            res.extractedItems || res.extracted_items
          );
        }
        onRefresh();
      } else {
        alert(res?.error || 'Failed to re-scan Tax Invoice PDF');
      }
    } catch (err: any) {
      alert(err.message || 'Error re-scanning tax invoice');
    } finally {
      setIsRescanning(false);
    }
  };

  // Apply Auto-Reconciliation Commit with Payment & Overage Safety Enforcement
  const handleCommitReconciliation = async (
    quoteId: number,
    invoiceId: number,
    items: any[],
    override: boolean = false,
    overrideNote: string = ''
  ) => {
    setIsCommittingReconcile(true);
    try {
      const res = await fetchApi<any>(`/api/dispatch/${quoteId}/apply-invoice-dispatch`, {
        method: 'POST',
        body: JSON.stringify({
          invoice_id: invoiceId,
          items: items.map((it) => ({
            quotation_item_id: it.quotation_item_id,
            invoice_qty: it.invoice_qty,
            dispatch_qty: it.invoice_qty,
            is_overage: it.is_overage,
          })),
          supervisor_override: override || Boolean(supervisorOverageReason),
          supervisor_notes: overrideNote || supervisorOverageReason || 'Reconciliation approved by user',
        }),
      });

      setReconcileDrawer(null);
      setSupervisorOverageReason('');
      setManagementPaymentOverride(false);
      setManagementOverrideNote('');
      onRefresh();

      if (res?.is_completed) {
        alert('🎉 All items 100% fulfilled! Quotation moved to "Dispatch Completed".');
      } else {
        alert(res?.message || 'Invoice slice dispatched! Remaining pending items kept in Processing Dispatch.');
      }
    } catch (err: any) {
      alert(err.message || 'Failed to apply dispatch reconciliation');
      onRefresh();
    } finally {
      setIsCommittingReconcile(false);
    }
  };

  // Staff action: Request Management Approval when payment is insufficient
  const handleRequestManagementApproval = async (quoteId: number, deficit: number, sliceVal: number) => {
    setIsCommittingReconcile(true);
    try {
      const note = `[STAFF SUBMITTED FOR APPROVAL] Attempted dispatch slice of ${formatCurrency(sliceVal)} with deficit of ${formatCurrency(deficit)}. Awaiting management authorization.`;
      await fetchApi<any>(`/api/dispatch/${quoteId}/management-approval`, {
        method: 'PATCH',
        body: JSON.stringify({ approved: false, note }),
      });
      alert('⚠️ Dispatch request submitted for Management Approval. Order status set to PENDING MANAGEMENT APPROVAL.');
      setReconcileDrawer(null);
      setSafetyModalItem(null);
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'Error submitting for management approval');
    } finally {
      setIsCommittingReconcile(false);
    }
  };

  // Direct Management Decision (Approve / Reject)
  const handleDirectManagementDecision = async (quoteId: number, approved: boolean) => {
    setIsSubmittingApproval(true);
    try {
      const res = await fetchApi<any>(`/api/dispatch/${quoteId}/management-approval`, {
        method: 'PATCH',
        body: JSON.stringify({
          approved,
          note: reviewApprovalActionNote.trim() || (approved ? 'Authorized by Management' : 'Held by Management'),
        }),
      });
      alert(res?.message || (approved ? 'Management authorization granted!' : 'Order kept on hold.'));
      setReviewApprovalQuote(null);
      setReviewApprovalActionNote('');
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'Failed to update management approval');
    } finally {
      setIsSubmittingApproval(false);
    }
  };

  // Intercept "Record Dispatch" click with all safety checks
  const handleInitiatePartial = (quote: ProcessingQuotation, item: ProcessingItem) => {
    // Rule 1: Dispatch Lock - Enforce verified Tax Invoice requirement
    const hasInvoice = (quote.invoices && quote.invoices.length > 0) || quote.has_verified_invoice;
    if (!hasInvoice) {
      setDispatchBlockedModal({
        isOpen: true,
        quoteNumber: quote.quotation_number,
        quotationId: quote.id,
      });
      return;
    }

    // Rule 2: Item presence in invoice check
    // If invoice exists, check if this item has been matched in an invoice
    if (quote.latest_invoice && quote.latest_invoice.reconciliation_summary) {
      const summary = quote.latest_invoice.reconciliation_summary;
      const matched = (summary.matched_items || []).some((m: any) => m.quotation_item_id === item.id);
      const isPartiallyOrDispatched = item.fulfillment_status === 'PARTIALLY_DISPATCHED' || item.fulfillment_status === 'DISPATCHED';

      if (!matched && !isPartiallyOrDispatched && !item.last_invoice_number) {
        setItemNotFoundModal({
          isOpen: true,
          itemName: item.description,
          quoteNumber: quote.quotation_number,
        });
        return;
      }
    }

    // Rule 3: Financial Payment Safety Gate
    if (quote.is_payment_sufficient === false && (quote.deficit_amount || 0) > 0) {
      setSafetyModalItem({ quote, item });
      setAdminOverrideReason('');
      return;
    }

    // Rule 4: Quantity Overage Check
    const quoted = item.ordered_quantity || 0;
    const dispatched = item.quantity_dispatched || 0;
    if (dispatched > quoted) {
      setOverageModalItem({
        quote,
        item,
        quotedQty: quoted,
        invoicedQty: dispatched,
        excessQty: Math.round((dispatched - quoted) * 100) / 100,
      });
      return;
    }

    onRecordPartial(quote, item);
  };

  const handleConfirmAdminOverride = () => {
    if (!safetyModalItem) return;
    onRecordPartial(safetyModalItem.quote, safetyModalItem.item);
    setSafetyModalItem(null);
  };

  const filtered = dispatches.filter((d) => {
    const term = search.toLowerCase();
    return (
      d.quotation_number?.toLowerCase().includes(term) ||
      d.customer_name?.toLowerCase().includes(term) ||
      d.customer_phone?.includes(term) ||
      d.site_location?.toLowerCase().includes(term) ||
      d.vehicle_no?.toLowerCase().includes(term)
    );
  });

  return (
    <div className="flex-1 min-h-0 w-full flex flex-col gap-2 sm:gap-2.5 overflow-hidden">
      {/* Top Controls */}
      <div className="bg-white rounded-2xl p-2.5 sm:p-3 border border-slate-200/80 shadow-xs flex flex-wrap items-center justify-between gap-2.5 shrink-0">
        <div className="flex items-center space-x-2 flex-1 min-w-[240px]">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search active dispatches by quote #, customer, vehicle, site..."
              className="w-full pl-9 pr-3 py-1.5 sm:py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-hidden focus:ring-2 focus:ring-indigo-500/30 text-slate-900"
            />
          </div>
        </div>

        <button
          onClick={onRefresh}
          className="inline-flex items-center space-x-1.5 px-3 py-1.5 sm:py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer transition-colors shrink-0"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          <span>Refresh Active</span>
        </button>
      </div>

      {loading ? (
        <div className="flex-1 min-h-0 flex items-center justify-center p-8 text-center text-slate-400 text-xs bg-white rounded-2xl border border-slate-200">
          <div>
            <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-indigo-600" />
            <span>Loading active processing dispatches...</span>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex-1 min-h-0 flex items-center justify-center p-8 text-center text-slate-400 text-xs bg-white rounded-2xl border border-slate-200">
          <div>
            <CheckCircle2 size={32} className="mx-auto mb-2 text-emerald-500 opacity-60" />
            <span>No dispatches currently in processing. All items are either dispatched or yet to be sourced.</span>
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 w-full overflow-y-auto scrollbar-thin space-y-2.5 sm:space-y-3 pr-1">
          {filtered.map((d) => {
            const isExpanded = expandedQuotes[d.id] ?? true;
            const pct = d.progress_percent || 0;

            let barColor = 'bg-amber-500';
            if (pct >= 100) barColor = 'bg-emerald-500';
            else if (pct >= 50) barColor = 'bg-indigo-600';

            const hasInvoice = (d.invoices && d.invoices.length > 0) || d.has_verified_invoice;

            return (
              <div key={d.id} className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden transition-all">
                {/* Quotation Header Bar */}
                <div className="p-4 bg-slate-50/70 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center space-x-3">
                    <button
                      onClick={() => toggleExpand(d.id)}
                      className="p-1 rounded-lg hover:bg-slate-200 text-slate-600 cursor-pointer"
                    >
                      {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-extrabold text-sm text-slate-900 font-mono">{d.quotation_number}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
                          {d.dispatch_status}
                        </span>
                        {d.challan_number && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-mono font-bold bg-slate-200/80 text-slate-700">
                            Challan: {d.challan_number}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center space-x-3 text-xs text-slate-600 mt-0.5">
                        <span className="font-semibold text-slate-800 flex items-center space-x-1">
                          <User size={11} className="text-slate-400" />
                          <span>{d.customer_name}</span>
                        </span>
                        <span className="text-slate-400">|</span>
                        <span className="font-mono flex items-center space-x-1">
                          <Phone size={11} className="text-slate-400" />
                          <span>{d.customer_phone || '-'}</span>
                        </span>
                        <span className="text-slate-400">|</span>
                        <span className="truncate max-w-[200px] flex items-center space-x-1">
                          <MapPin size={11} className="text-slate-400" />
                          <span>{d.delivery_address || d.site_location || 'Site Location'}</span>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Progress & Quick Actions */}
                  <div className="flex items-center space-x-4">
                    {/* Live Progress Bar */}
                    <div className="text-right min-w-[140px]">
                      <div className="flex items-center justify-between text-[11px] font-bold mb-1">
                        <span className="text-slate-500">Fulfillment:</span>
                        <span className="text-slate-900 font-mono">{pct}%</span>
                      </div>
                      <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${barColor} transition-all duration-500 rounded-full`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                        {Math.round(d.total_dispatched_qty)} / {Math.round(d.total_ordered_qty)} Units
                      </div>
                    </div>

                    <button
                      onClick={() => onPrintChallan(d.id)}
                      className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-semibold cursor-pointer shadow-2xs"
                      title="Print / View Delivery Challan Note"
                    >
                      <Printer size={13} className="text-slate-500" />
                      <span>Challan</span>
                    </button>
                  </div>
                </div>

                {/* Tax Invoice Verification & Auto-Reconciliation Strip */}
                <div className="px-4 py-2.5 bg-slate-100/70 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2.5 text-xs">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="font-bold text-slate-700 flex items-center space-x-1.5">
                      <FileText size={14} className="text-indigo-600" />
                      <span>Tax Invoice Verification:</span>
                    </span>

                    {d.invoices && d.invoices.length > 0 ? (
                      <div className="flex flex-wrap items-center gap-2">
                        {d.invoices.map((inv) => (
                          <div
                            key={inv.id}
                            className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-[11px] font-bold shadow-2xs"
                          >
                            <CheckCircle2 size={13} className="text-emerald-600 shrink-0" />
                            <button
                              type="button"
                              onClick={() => {
                                openReconciliationDrawer(d, inv.reconciliation_summary || {}, inv);
                              }}
                              className="font-bold text-emerald-950 hover:underline cursor-pointer text-left"
                              title="Click to view/edit reconciliation table"
                            >
                              Tax Invoice #{inv.invoice_number} Verified
                            </button>
                            <button
                              onClick={() => setPreviewPdfUrl(getInvoicePdfUrl(inv))}
                              className="text-indigo-600 hover:text-indigo-800 underline text-[11px] ml-1 flex items-center space-x-0.5 cursor-pointer"
                              title="Preview Invoice PDF"
                            >
                              <Eye size={11} />
                              <span>View</span>
                            </button>
                            {canEdit && (
                              <button
                                onClick={() => handleDeleteInvoice(inv.id)}
                                className="text-slate-400 hover:text-rose-600 cursor-pointer ml-1"
                                title="Remove Invoice"
                              >
                                <Trash2 size={11} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="text-[11px] text-amber-800 font-semibold flex items-center space-x-1 bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-200">
                        <AlertCircle size={12} className="text-amber-600" />
                        <span>No Tax Invoice attached. Physical dispatch is locked until invoice is verified.</span>
                      </span>
                    )}
                  </div>

                  {/* Upload Control */}
                  <div className="flex items-center space-x-2">
                    {canEdit && (
                      <label
                        className={`inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-bold shadow-2xs transition-colors cursor-pointer ${
                          uploadingQuoteId === d.id
                            ? 'bg-indigo-100 text-indigo-400 cursor-not-allowed'
                            : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                        }`}
                      >
                        <Upload size={12} className={uploadingQuoteId === d.id ? 'animate-bounce' : ''} />
                        <span>{uploadingQuoteId === d.id ? 'Parsing Invoice PDF...' : 'Upload Tax Invoice (PDF)'}</span>
                        <input
                          type="file"
                          accept="application/pdf"
                          className="hidden"
                          disabled={uploadingQuoteId === d.id}
                          onChange={(e) => {
                            if (e.target.files && e.target.files[0]) {
                              handleUploadInvoice(d.id, e.target.files[0]);
                              e.target.value = '';
                            }
                          }}
                        />
                      </label>
                    )}
                  </div>
                </div>

                {/* Inline Metadata Mismatch Error Banner */}
                {mismatchErrors[d.id] && (
                  <div className="px-4 py-2.5 bg-rose-50 border-b border-rose-200 text-rose-900 text-xs flex items-center justify-between animate-fadeIn">
                    <div className="flex items-center space-x-2 font-bold">
                      <AlertTriangle size={15} className="text-rose-600 shrink-0" />
                      <span>{mismatchErrors[d.id]}</span>
                    </div>
                    <button
                      onClick={() => setMismatchErrors((prev) => ({ ...prev, [d.id]: '' }))}
                      className="text-rose-400 hover:text-rose-600 cursor-pointer p-0.5"
                    >
                      <X size={14} />
                    </button>
                  </div>
                )}

                {/* Financial Safety Summary Banner */}
                <div
                  className={`px-4 py-2 flex flex-wrap items-center justify-between gap-2.5 text-xs border-b ${
                    d.is_payment_sufficient !== false
                      ? 'bg-emerald-50/70 border-emerald-100 text-emerald-950'
                      : 'bg-rose-50/90 border-rose-200 text-rose-950'
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-3 sm:gap-4">
                    <div className="flex items-center space-x-1.5 font-medium">
                      <CreditCard
                        size={13}
                        className={d.is_payment_sufficient !== false ? 'text-emerald-600' : 'text-rose-600'}
                      />
                      <span className="text-slate-600">Total Received:</span>
                      <span className="font-bold font-mono text-emerald-800">
                        {formatCurrency(d.total_received_amount || 0)}
                      </span>
                    </div>

                    <span className="text-slate-300">|</span>

                    <div className="flex items-center space-x-1.5">
                      <Package size={13} className="text-slate-500" />
                      <span className="text-slate-600">Committed Immediate Value:</span>
                      <span className="font-bold font-mono text-slate-900">
                        {formatCurrency(d.committed_immediate_value || 0)}
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono">
                        (Dispatched: {formatCurrency(d.dispatched_total_value || 0)} + Ready: {formatCurrency(d.ready_stock_total_value || 0)} + Local:{' '}
                        {formatCurrency(d.local_purchase_total_value || 0)})
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    {d.dispatch_status === 'PENDING_MANAGEMENT_APPROVAL' ? (
                      <div className="flex items-center space-x-2">
                        <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300 animate-pulse">
                          <AlertTriangle size={12} className="text-amber-700" />
                          <span>⚠️ Pending Management Approval</span>
                        </span>
                        {isAdminOrManager && (
                          <button
                            onClick={() => {
                              setReviewApprovalQuote(d);
                              setReviewApprovalActionNote(d.manager_approval_note || '');
                            }}
                            className="px-2.5 py-0.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-[11px] cursor-pointer shadow-2xs transition-colors"
                          >
                            Authorize / Review
                          </button>
                        )}
                      </div>
                    ) : d.is_payment_sufficient !== false ? (
                      <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                        <ShieldCheck size={12} />
                        <span>Payment Covered</span>
                      </span>
                    ) : (
                      <div className="flex items-center space-x-2">
                        <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-300 animate-pulse">
                          <ShieldAlert size={12} />
                          <span>Insufficient Payment — Deficit: {formatCurrency(d.deficit_amount || 0)}</span>
                        </span>
                        {onNavigateToPayments && (
                          <button
                            onClick={() => onNavigateToPayments(d.quotation_number)}
                            className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-[11px] cursor-pointer shadow-2xs transition-colors"
                          >
                            <span>Record Payment</span>
                            <ArrowRight size={11} />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Expanded Line Items Table */}
                {isExpanded && (
                  <div className="p-3 overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                          <th className="py-2 px-2.5 w-10 text-center">#</th>
                          <th className="py-2 px-2.5">Item Description & Specs</th>
                          <th className="py-2 px-2.5">Room / Area</th>
                          <th className="py-2 px-2.5 text-center">Sourcing Status</th>
                          <th className="py-2 px-2.5 min-w-[220px]">Quantity Reconciliation (Quoted | Dispatched | Pending)</th>
                          <th className="py-2 px-2.5 text-center">Fulfillment Status</th>
                          <th className="py-2 px-2.5 text-right w-44">Dispatch Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {d.items.map((it, idx) => {
                          const ordered = Math.round(it.ordered_quantity || 0);
                          const dispatched = Math.round(it.quantity_dispatched || 0);
                          const pending = Math.max(0, ordered - dispatched);
                          const itemPct = ordered > 0 ? Math.min(100, Math.round((dispatched / ordered) * 100)) : 0;

                          const isFullyDispatched = it.dispatch_status === 'Dispatched' || it.fulfillment_status === 'DISPATCHED' || dispatched >= ordered;
                          const isPartiallyDispatched = it.fulfillment_status === 'PARTIALLY_DISPATCHED' || (dispatched > 0 && dispatched < ordered);
                          const isReady = it.dispatch_status === 'Ready Stock';
                          const isOverage = dispatched > ordered;

                          return (
                            <tr key={it.id} className="hover:bg-slate-50/50">
                              <td className="py-2.5 px-2.5 text-center text-slate-400 font-mono">{idx + 1}</td>
                              <td className="py-2.5 px-2.5">
                                <div className="font-semibold text-slate-900">{it.description}</div>
                                <div className="text-[10px] text-slate-500 font-mono flex items-center space-x-2 mt-0.5">
                                  {it.brand && <span>Brand: {it.brand}</span>}
                                  {it.size && <span>Size: {it.size}</span>}
                                  {it.last_invoice_number && (
                                    <span className="text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                                      Inv #{it.last_invoice_number}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="py-2.5 px-2.5 text-slate-600 font-medium text-[11px]">
                                {it.area_name || 'General Area'}
                              </td>
                              <td className="py-2.5 px-2.5 text-center">
                                <span
                                  className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                    isFullyDispatched
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : isReady
                                      ? 'bg-blue-100 text-blue-800'
                                      : it.dispatch_status === 'Need to Arrange from Local'
                                      ? 'bg-amber-100 text-amber-800'
                                      : it.dispatch_status === 'Factory Order'
                                      ? 'bg-indigo-100 text-indigo-800'
                                      : 'bg-slate-100 text-slate-700'
                                  }`}
                                >
                                  {it.dispatch_status}
                                </span>
                              </td>

                              {/* Split Badges: Quoted | Dispatched | Pending */}
                              <td className="py-2.5 px-2.5">
                                <div className="space-y-1">
                                  <div className="flex items-center space-x-1.5 text-[11px] font-mono">
                                    <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700" title="Quoted Quantity">
                                      Q: <span className="font-bold">{ordered}</span>
                                    </span>
                                    <span className="text-slate-300">|</span>
                                    <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold" title="Dispatched Quantity">
                                      D: {dispatched}
                                    </span>
                                    <span className="text-slate-300">|</span>
                                    <span
                                      className={`px-1.5 py-0.5 rounded font-bold ${
                                        pending > 0 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-500'
                                      }`}
                                      title="Pending Quantity"
                                    >
                                      P: {pending}
                                    </span>
                                    <span className="text-[10px] text-slate-400">{it.product_type || 'boxes'}</span>
                                  </div>

                                  {/* Item fulfillment progress bar */}
                                  <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                    <div
                                      className={`h-full ${
                                        itemPct >= 100 ? 'bg-emerald-500' : itemPct > 0 ? 'bg-amber-500' : 'bg-slate-300'
                                      } transition-all duration-300`}
                                      style={{ width: `${itemPct}%` }}
                                    />
                                  </div>

                                  {/* Extra Quantity Alert Pill */}
                                  {isOverage && (
                                    <div className="text-[10px] text-rose-700 font-bold flex items-center space-x-1">
                                      <AlertTriangle size={11} className="text-rose-600" />
                                      <span>Extra Quantity: +{Math.round(dispatched - ordered)} boxes!</span>
                                    </div>
                                  )}
                                </div>
                              </td>

                              {/* Fulfillment Status Pill */}
                              <td className="py-2.5 px-2.5 text-center">
                                <span
                                  className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                    isFullyDispatched
                                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                      : isPartiallyDispatched
                                      ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                      : 'bg-slate-100 text-slate-600 border border-slate-200'
                                  }`}
                                >
                                  {isFullyDispatched ? (
                                    <>
                                      <Check size={10} />
                                      <span>Dispatched</span>
                                    </>
                                  ) : isPartiallyDispatched ? (
                                    <>
                                      <Clock size={10} />
                                      <span>Partially Dispatched</span>
                                    </>
                                  ) : (
                                    <span>Pending</span>
                                  )}
                                </span>
                              </td>

                              {/* Dispatch Action Button */}
                              <td className="py-2.5 px-2.5 text-right">
                                {isFullyDispatched ? (
                                  <span className="inline-flex items-center space-x-1 text-[11px] font-bold text-emerald-600">
                                    <CheckCircle2 size={13} />
                                    <span>Completed</span>
                                  </span>
                                ) : canEdit ? (
                                  <button
                                    onClick={() => handleInitiatePartial(d, it)}
                                    className={`inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg font-bold text-[11px] shadow-2xs cursor-pointer transition-colors ${
                                      hasInvoice
                                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                        : 'bg-slate-200 hover:bg-slate-300 text-slate-700'
                                    }`}
                                    title={hasInvoice ? 'Record Partial / Full Dispatch' : 'Tax Invoice required before dispatch'}
                                  >
                                    <Truck size={12} />
                                    <span>Record Dispatch</span>
                                  </button>
                                ) : (
                                  <span className="text-[11px] text-slate-400">View Only</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 1. Dispatch Blocked Modal (No Tax Invoice) */}
      {dispatchBlockedModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 border border-rose-200 shadow-2xl flex flex-col space-y-4 animate-fadeIn">
            <div className="flex items-start space-x-3">
              <div className="p-2.5 rounded-2xl bg-rose-100 text-rose-600 shrink-0">
                <AlertTriangle size={24} />
              </div>
              <div className="flex-1">
                <h3 className="font-extrabold text-slate-900 text-base">
                  🚫 Dispatch Blocked: Tax Invoice Required
                </h3>
                <p className="text-xs text-slate-600 mt-1">
                  Please upload a valid Tax Invoice PDF before dispatching items for quotation{' '}
                  <span className="font-mono font-bold text-slate-900">{dispatchBlockedModal.quoteNumber}</span>.
                </p>
              </div>
              <button
                onClick={() => setDispatchBlockedModal(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 space-y-1">
              <div className="font-bold text-slate-800">Compliance & Accuracy Safeguard:</div>
              <div>
                All material dispatches require an uploaded Tax Invoice to verify customer phone, GSTIN, and line-item quantities before items leave the godown.
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                onClick={() => setDispatchBlockedModal(null)}
                className="px-3.5 py-2 rounded-xl border border-slate-300 hover:bg-slate-100 font-semibold text-xs text-slate-700 cursor-pointer"
              >
                Close
              </button>
              <label className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-sm cursor-pointer flex items-center space-x-1.5">
                <Upload size={13} />
                <span>Upload Tax Invoice Now</span>
                <input
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      const quoteId = dispatchBlockedModal.quotationId;
                      setDispatchBlockedModal(null);
                      handleUploadInvoice(quoteId, e.target.files[0]);
                      e.target.value = '';
                    }
                  }}
                />
              </label>
            </div>
          </div>
        </div>
      )}

      {/* 2. Item Not Found in Invoice Modal */}
      {itemNotFoundModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 border border-amber-200 shadow-2xl flex flex-col space-y-4 animate-fadeIn">
            <div className="flex items-start space-x-3">
              <div className="p-2.5 rounded-2xl bg-amber-100 text-amber-700 shrink-0">
                <AlertCircle size={24} />
              </div>
              <div className="flex-1">
                <h3 className="font-extrabold text-slate-900 text-base">
                  ⚠️ Item Not Found in Tax Invoice
                </h3>
                <p className="text-xs text-slate-600 mt-1">
                  The item <span className="font-bold text-slate-900">"{itemNotFoundModal.itemName}"</span> was not detected in the uploaded Tax Invoice for quote{' '}
                  <span className="font-mono font-bold text-slate-900">{itemNotFoundModal.quoteNumber}</span>.
                </p>
              </div>
              <button
                onClick={() => setItemNotFoundModal(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600">
              Please verify that this item is included in the uploaded Tax Invoice or upload a revised/supplementary Tax Invoice PDF.
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                onClick={() => setItemNotFoundModal(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs shadow-sm cursor-pointer"
              >
                Got It
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Auto-Reconciliation Confirmation Drawer / Modal */}
      {reconcileDrawer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col border border-slate-200 shadow-2xl overflow-hidden animate-fadeIn">
            {/* Header */}
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-2">
                <div className="p-1.5 rounded-xl bg-emerald-100 text-emerald-700">
                  <ShieldCheck size={20} />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-sm">
                    Tax Invoice Verified: #{reconcileDrawer.reconciliation.invoice_number}
                  </h3>
                  <div className="text-[11px] text-slate-500 font-mono">
                    Quotation Ref: <span className="font-bold text-slate-800">{reconcileDrawer.quote.quotation_number}</span> | Customer:{' '}
                    <span className="font-bold text-slate-800">{reconcileDrawer.quote.customer_name}</span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setReconcileDrawer(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3.5 text-xs scrollbar-thin">
              {/* Customer Match Success Banner */}
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-950 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                  <div>
                    <div className="font-bold">Customer Identity Verified</div>
                    <div className="text-[11px] text-emerald-800">
                      Phone / GSTIN matched the quotation record.
                    </div>
                  </div>
                </div>
                <div className="flex items-center space-x-2 shrink-0">
                  {reconcileDrawer.invoice.file_url && (
                    <button
                      onClick={() => setPreviewPdfUrl(getInvoicePdfUrl(reconcileDrawer.invoice))}
                      className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-white border border-emerald-300 text-emerald-800 font-bold text-[11px] cursor-pointer hover:bg-emerald-100"
                    >
                      <Eye size={12} />
                      <span>View PDF</span>
                    </button>
                  )}
                  <button
                    onClick={() => handleRescanInvoice(reconcileDrawer.quote.id)}
                    disabled={isRescanning}
                    className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] cursor-pointer shadow-2xs transition-all disabled:opacity-60"
                    title="Re-extract line items and re-reconcile with Tax Invoice"
                  >
                    <RefreshCw size={12} className={isRescanning ? 'animate-spin' : ''} />
                    <span>{isRescanning ? 'Scanning...' : 'Re-scan Invoice'}</span>
                  </button>
                </div>
              </div>

              {/* Matched Line Items Table */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-bold text-slate-800 uppercase text-[11px] tracking-wider">
                    Quotation Line Items Reconciliation ({reconcileDrawer.reconciliation.matched_items?.length || 0} of {reconcileDrawer.quote.items?.length || reconcileDrawer.reconciliation.matched_items?.length || 0} mapped)
                  </h4>
                  <span className="text-[10px] font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                    💡 Invoice Qty is editable (recalculates live)
                  </span>
                </div>
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-[10px] font-bold text-slate-500 uppercase border-b border-slate-200">
                      <tr>
                        <th className="py-2 px-3">Description</th>
                        <th className="py-2 px-2 text-right">Quoted</th>
                        <th className="py-2 px-2 text-right">Invoice Qty (Edit)</th>
                        <th className="py-2 px-2 text-right">New Dispatched</th>
                        <th className="py-2 px-2 text-right">Pending</th>
                        <th className="py-2 px-3 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(() => {
                        const quoteItems = reconcileDrawer.quote.items || [];
                        const matchedMap = new Map<string, any>();
                        (reconcileDrawer.reconciliation.matched_items || []).forEach((m: any) => {
                          matchedMap.set(String(m.quotation_item_id), m);
                        });

                        const extractedInvoiceItems = reconcileDrawer.extractedItems || [];
                        const mappedInvoiceItemIds = new Set(
                          (reconcileDrawer.reconciliation.matched_items || [])
                            .map((m: any) => String(m.invoice_item_id || ''))
                            .filter(Boolean)
                        );

                        // If no quote items exist on the quote object, fall back to matched_items
                        if (quoteItems.length === 0) {
                          return (reconcileDrawer.reconciliation.matched_items || []).map((it: any) => (
                            <tr key={it.quotation_item_id} className={it.is_overage ? 'bg-rose-50/50' : ''}>
                              <td className="py-2 px-3 font-semibold text-slate-800">
                                <div>{it.description}</div>
                                {it.invoice_description && it.invoice_description !== it.description && (
                                  <div className="text-[10px] text-slate-400 font-mono mt-0.5 font-normal">
                                    Invoice: {it.invoice_description}
                                  </div>
                                )}
                              </td>
                              <td className="py-2 px-2 text-right font-mono text-slate-600">{it.quoted_qty}</td>
                              <td className="py-2 px-2 text-right">
                                <div className="flex items-center justify-end space-x-1">
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    className="w-20 px-2 py-1 text-right font-mono font-bold text-indigo-700 border border-indigo-300 rounded-lg focus:ring-1 focus:ring-indigo-500 bg-white shadow-2xs"
                                    value={it.invoice_qty}
                                    onChange={(e) =>
                                      handleInvoiceQtyChange(it.quotation_item_id, parseFloat(e.target.value) || 0)
                                    }
                                  />
                                  <span className="text-[10px] text-slate-400 font-mono">{it.unit || 'BOX'}</span>
                                </div>
                              </td>
                              <td className="py-2 px-2 text-right font-mono text-emerald-700 font-bold">
                                {it.new_dispatched_qty}
                              </td>
                              <td className="py-2 px-2 text-right font-mono text-amber-700 font-bold">
                                {it.pending_qty}
                              </td>
                              <td className="py-2 px-3 text-center">
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                    it.fulfillment_status === 'DISPATCHED'
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : 'bg-amber-100 text-amber-800'
                                  }`}
                                >
                                  {it.fulfillment_status}
                                </span>
                              </td>
                            </tr>
                          ));
                        }

                        return quoteItems.map((qIt) => {
                          const it = matchedMap.get(String(qIt.id));

                          if (it) {
                            // MATCHED ITEM ROW (Confidence >= 70% or user mapped)
                            return (
                              <tr key={qIt.id} className={it.is_overage ? 'bg-rose-50/50' : 'hover:bg-slate-50/60'}>
                                <td className="py-2 px-3 font-semibold text-slate-800">
                                  <div className="flex items-center space-x-1.5">
                                    <span>{qIt.description}</span>
                                    {it.confidence && (
                                      <span
                                        className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                                          it.confidence === 'EXACT'
                                            ? 'bg-emerald-100 text-emerald-800'
                                            : it.confidence === 'HIGH'
                                            ? 'bg-blue-100 text-blue-800'
                                            : 'bg-emerald-100 text-emerald-800'
                                        }`}
                                      >
                                        {it.confidence}
                                      </span>
                                    )}
                                  </div>
                                  {it.invoice_description && (
                                    <div className="text-[10px] text-slate-400 font-mono mt-0.5 font-normal flex items-center space-x-2">
                                      <span>Invoice: {it.invoice_description}</span>
                                      <button
                                        type="button"
                                        onClick={() => handleUnbindMatchedItem(qIt.id)}
                                        className="text-rose-500 hover:text-rose-700 font-sans font-semibold cursor-pointer text-[10px]"
                                        title="Unbind to remap manually"
                                      >
                                        [Unmap]
                                      </button>
                                    </div>
                                  )}
                                </td>
                                <td className="py-2 px-2 text-right font-mono text-slate-600">{it.quoted_qty}</td>
                                <td className="py-2 px-2 text-right">
                                  <div className="flex items-center justify-end space-x-1">
                                    <input
                                      type="number"
                                      step="0.01"
                                      min="0"
                                      className="w-20 px-2 py-1 text-right font-mono font-bold text-indigo-700 border border-indigo-300 rounded-lg focus:ring-1 focus:ring-indigo-500 bg-white shadow-2xs"
                                      value={it.invoice_qty}
                                      onChange={(e) =>
                                        handleInvoiceQtyChange(qIt.id, parseFloat(e.target.value) || 0)
                                      }
                                    />
                                    <span className="text-[10px] text-slate-400 font-mono">{it.unit || 'BOX'}</span>
                                  </div>
                                </td>
                                <td className="py-2 px-2 text-right font-mono font-bold text-emerald-700">
                                  {it.new_dispatched_qty}
                                </td>
                                <td className="py-2 px-2 text-right font-mono font-bold text-amber-700">
                                  {it.pending_qty}
                                </td>
                                <td className="py-2 px-3 text-center">
                                  <span
                                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                      it.fulfillment_status === 'DISPATCHED'
                                        ? 'bg-emerald-100 text-emerald-800'
                                        : 'bg-amber-100 text-amber-800'
                                    }`}
                                  >
                                    {it.fulfillment_status}
                                  </span>
                                </td>
                              </tr>
                            );
                          }

                          // UNMATCHED ITEM ROW (Needs Mapping): Render inline dropdown populated from extractedInvoiceItems
                          const quoted = parseFloat(String(qIt.ordered_quantity || 0));
                          const already = parseFloat(String(qIt.quantity_dispatched || 0));
                          const pending = Math.max(0, quoted - already);

                          return (
                            <tr key={qIt.id} className="bg-amber-50/40 hover:bg-amber-50/70 transition-colors">
                              <td className="py-2 px-3 font-semibold text-slate-800">
                                <div className="flex items-center space-x-1.5">
                                  <span>{qIt.description}</span>
                                  <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-100 text-amber-800">
                                    Needs Mapping
                                  </span>
                                </div>
                                <div className="text-[10px] text-amber-700 font-sans mt-0.5 font-normal">
                                  Select matching line from uploaded Tax Invoice
                                </div>
                              </td>
                              <td className="py-2 px-2 text-right font-mono text-slate-600">{quoted}</td>
                              <td className="py-2 px-2 text-right" colSpan={1}>
                                <div className="flex items-center justify-end">
                                  <select
                                    className="max-w-[240px] w-full text-[11px] px-2 py-1.5 border border-amber-300 rounded-lg bg-white font-medium text-slate-800 focus:ring-2 focus:ring-emerald-500 shadow-2xs cursor-pointer"
                                    value=""
                                    onChange={(e) => {
                                      if (e.target.value !== '') {
                                        handleManualMap(qIt.id, e.target.value);
                                      }
                                    }}
                                  >
                                    <option value="">Select matching invoice item: ▼</option>
                                    {extractedInvoiceItems.map((invItem) => {
                                      const isMappedToOther = mappedInvoiceItemIds.has(invItem.id);
                                      return (
                                        <option key={invItem.id} value={invItem.id} disabled={isMappedToOther}>
                                          {invItem.description} — {invItem.quantity} {invItem.unit || 'BOX'}
                                          {isMappedToOther ? ' (Already Mapped)' : ''}
                                        </option>
                                      );
                                    })}
                                  </select>
                                </div>
                              </td>
                              <td className="py-2 px-2 text-right font-mono text-slate-400">
                                {already}
                              </td>
                              <td className="py-2 px-2 text-right font-mono text-amber-600 font-bold">
                                {pending}
                              </td>
                              <td className="py-2 px-3 text-center">
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500">
                                  Pending
                                </span>
                              </td>
                            </tr>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Unmapped Invoice Lines Mapping Control */}
              {reconcileDrawer.reconciliation.unmapped_invoice_lines?.length > 0 && (
                <div className="p-3 rounded-xl bg-indigo-50/70 border border-indigo-200 text-xs space-y-2">
                  <div className="font-bold text-indigo-950 flex items-center justify-between">
                    <span className="flex items-center space-x-1.5">
                      <AlertTriangle size={13} className="text-indigo-600" />
                      <span>
                        Unmapped Invoice Lines Detected ({reconcileDrawer.reconciliation.unmapped_invoice_lines.length}):
                      </span>
                    </span>
                    <span className="text-[10px] text-indigo-700 font-normal">
                      Bind invoice lines to quotation items manually
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {reconcileDrawer.reconciliation.unmapped_invoice_lines.map((unmapped: any, uIdx: number) => (
                      <div
                        key={uIdx}
                        className="p-2 bg-white rounded-lg border border-indigo-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-800 truncate">{unmapped.raw_description}</div>
                          <div className="text-[10px] text-slate-500 font-mono">
                            Detected Qty: {unmapped.quantity} {unmapped.unit}
                          </div>
                        </div>
                        <div className="flex items-center space-x-2 shrink-0">
                          <select
                            className="text-xs px-2.5 py-1 border border-slate-300 rounded-lg bg-slate-50 font-medium"
                            onChange={(e) => {
                              if (e.target.value) {
                                handleMapUnmappedLine(uIdx, parseInt(e.target.value, 10));
                              }
                            }}
                            defaultValue=""
                          >
                            <option value="">-- Map to Quotation Item --</option>
                            {reconcileDrawer.quote.items
                              .filter(
                                (qIt) =>
                                  !(reconcileDrawer.reconciliation.matched_items || []).some(
                                    (m: any) => m.quotation_item_id === qIt.id
                                  )
                              )
                              .map((qIt) => (
                                <option key={qIt.id} value={qIt.id}>
                                  {qIt.description} ({qIt.ordered_quantity} boxes)
                                </option>
                              ))}
                          </select>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Unmapped Items Notice */}
              {reconcileDrawer.reconciliation.unmatched_items?.length > 0 && (
                <div className="p-3 rounded-xl bg-amber-50/80 border border-amber-200 text-amber-900 text-xs">
                  <div className="font-bold flex items-center space-x-1.5 mb-1">
                    <AlertTriangle size={13} className="text-amber-700" />
                    <span>Quotation Lines Awaiting Mapping ({reconcileDrawer.reconciliation.unmatched_items.length}):</span>
                  </div>
                  <p className="text-[11px] text-amber-800">
                    Use the <span className="font-bold font-mono">[Select matching invoice item: ▼]</span> dropdowns in the table above to manually bind invoice lines to remaining items.
                  </p>
                </div>
              )}

              {/* Overage Warning & Supervisor Input */}
              {reconcileDrawer.reconciliation.has_overages && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs space-y-2">
                  <div className="font-bold flex items-center space-x-1.5">
                    <AlertTriangle size={14} className="text-rose-600" />
                    <span>⚠️ Extra Quantity Detected on one or more items!</span>
                  </div>
                  <p className="text-[11px] text-rose-800">
                    The Tax Invoice specifies higher quantities than the quotation. Supervisor confirmation is required to record overages.
                  </p>
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-700 mb-1">
                      Supervisor Approval Notes
                    </label>
                    <input
                      type="text"
                      value={supervisorOverageReason}
                      onChange={(e) => setSupervisorOverageReason(e.target.value)}
                      placeholder="e.g. Additional boxes approved for client site wastage..."
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs"
                    />
                  </div>
                </div>
              )}

              {/* Financial Payment Safety Gate in Invoice Modal */}
              {(() => {
                const quote = reconcileDrawer.quote;
                const grossTotal = parseFloat(String(quote.gross_total || 0));
                const netTotal = parseFloat(String(quote.net_total || 0));
                const taxMultiplier = grossTotal > 0 && netTotal > 0 ? (netTotal / grossTotal) : 1.0;
                const verifiedPaid = parseFloat(String(quote.total_received_amount || quote.verified_paid || 0));
                const alreadyDispatchedVal = parseFloat(String(quote.dispatched_total_value || 0));

                const matchedItems = reconcileDrawer.reconciliation.matched_items || [];
                const sliceDispatchValue = matchedItems.reduce((acc: number, m: any) => {
                  const qIt = quote.items.find((it: any) => it.id === m.quotation_item_id);
                  const ordered = parseFloat(String(qIt?.ordered_quantity || 1));
                  const baseAmount = parseFloat(String(qIt?.total_amount || 0));
                  const payableAmount = baseAmount * taxMultiplier;
                  const ratePerUnit = ordered > 0 ? (payableAmount / ordered) : 0;
                  const invQty = parseFloat(String(m.invoice_qty || 0));
                  return acc + (invQty * ratePerUnit);
                }, 0);

                const totalRequiredPayment = Math.round((alreadyDispatchedVal + sliceDispatchValue) * 100) / 100;
                const isSufficient = verifiedPaid >= (totalRequiredPayment - 0.50);
                const deficit = isSufficient ? 0 : Math.round((totalRequiredPayment - verifiedPaid) * 100) / 100;

                if (isSufficient) return null;

                return (
                  <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-300 text-rose-900 text-xs space-y-2 mt-2">
                    <div className="flex items-center space-x-2 font-bold text-rose-800">
                      <ShieldAlert size={15} className="text-rose-600" />
                      <span>INSUFFICIENT PAYMENT DETECTED FOR THIS TAX INVOICE</span>
                    </div>
                    <div className="text-[11px] text-rose-700 grid grid-cols-2 gap-2 bg-white/80 p-2.5 rounded-lg border border-rose-200">
                      <div>
                        Billed Invoice Slice Value: <span className="font-mono font-bold text-slate-900">{formatCurrency(sliceDispatchValue)}</span>
                      </div>
                      <div>
                        Verified Payments Received: <span className="font-mono font-bold text-emerald-700">{formatCurrency(verifiedPaid)}</span>
                      </div>
                      <div>
                        Total Cumulative Required: <span className="font-mono font-bold text-slate-900">{formatCurrency(totalRequiredPayment)}</span>
                      </div>
                      <div className="text-rose-700 font-bold">
                        Outstanding Payment Deficit: <span className="font-mono text-rose-800">{formatCurrency(deficit)}</span>
                      </div>
                    </div>

                    {isAdminOrManager ? (
                      <div className="pt-2 border-t border-rose-200 space-y-2">
                        <div className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            id="mgmtPaymentOverrideCheck"
                            checked={managementPaymentOverride}
                            onChange={(e) => setManagementPaymentOverride(e.target.checked)}
                            className="w-4 h-4 text-rose-600 rounded cursor-pointer"
                          />
                          <label htmlFor="mgmtPaymentOverrideCheck" className="font-bold text-slate-800 cursor-pointer">
                            Management Override: Authorize dispatch with payment deficit
                          </label>
                        </div>
                        {managementPaymentOverride && (
                          <input
                            type="text"
                            value={managementOverrideNote}
                            onChange={(e) => setManagementOverrideNote(e.target.value)}
                            placeholder="Mandatory management authorization note (e.g. Credit approved by Management)..."
                            className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-rose-500/20"
                          />
                        )}
                      </div>
                    ) : (
                      <div className="p-2 rounded-lg bg-amber-100/70 border border-amber-300 text-amber-900 font-semibold text-[11px]">
                        🔒 Staff Dispatch Blocked: Insufficient payment. Please collect payment or submit for Management Approval.
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Footer */}
            <div className="p-3 sm:p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end space-x-2 shrink-0">
              <button
                onClick={() => {
                  setReconcileDrawer(null);
                  setManagementPaymentOverride(false);
                  setManagementOverrideNote('');
                }}
                className="px-3.5 py-2 rounded-xl border border-slate-300 hover:bg-slate-100 font-semibold text-xs text-slate-700 cursor-pointer"
              >
                Close Without Applying
              </button>
              {(() => {
                const quote = reconcileDrawer.quote;
                const grossTotal = parseFloat(String(quote.gross_total || 0));
                const netTotal = parseFloat(String(quote.net_total || 0));
                const taxMultiplier = grossTotal > 0 && netTotal > 0 ? (netTotal / grossTotal) : 1.0;
                const verifiedPaid = parseFloat(String(quote.total_received_amount || quote.verified_paid || 0));
                const alreadyDispatchedVal = parseFloat(String(quote.dispatched_total_value || 0));

                const matchedItems = reconcileDrawer.reconciliation.matched_items || [];
                const sliceDispatchValue = matchedItems.reduce((acc: number, m: any) => {
                  const qIt = quote.items.find((it: any) => it.id === m.quotation_item_id);
                  const ordered = parseFloat(String(qIt?.ordered_quantity || 1));
                  const baseAmount = parseFloat(String(qIt?.total_amount || 0));
                  const payableAmount = baseAmount * taxMultiplier;
                  const ratePerUnit = ordered > 0 ? (payableAmount / ordered) : 0;
                  const invQty = parseFloat(String(m.invoice_qty || 0));
                  return acc + (invQty * ratePerUnit);
                }, 0);

                const totalRequiredPayment = Math.round((alreadyDispatchedVal + sliceDispatchValue) * 100) / 100;
                const isSufficient = verifiedPaid >= (totalRequiredPayment - 0.50);
                const deficit = isSufficient ? 0 : Math.round((totalRequiredPayment - verifiedPaid) * 100) / 100;

                if (!isSufficient) {
                  if (!isAdminOrManager) {
                    return (
                      <button
                        onClick={() => handleRequestManagementApproval(quote.id, deficit, sliceDispatchValue)}
                        disabled={isCommittingReconcile}
                        className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-sm cursor-pointer disabled:opacity-50 flex items-center space-x-1.5"
                      >
                        <AlertTriangle size={13} />
                        <span>{isCommittingReconcile ? 'Submitting...' : 'Submit for Management Approval'}</span>
                      </button>
                    );
                  }

                  return (
                    <button
                      onClick={() =>
                        handleCommitReconciliation(
                          reconcileDrawer.quote.id,
                          reconcileDrawer.invoice.id,
                          reconcileDrawer.reconciliation.matched_items || [],
                          true,
                          managementOverrideNote
                        )
                      }
                      disabled={isCommittingReconcile || !managementPaymentOverride || !managementOverrideNote.trim()}
                      className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-sm cursor-pointer disabled:opacity-50 flex items-center space-x-1.5"
                    >
                      <ShieldCheck size={13} />
                      <span>{isCommittingReconcile ? 'Authorizing...' : 'Authorize & Apply Dispatch (Management Override)'}</span>
                    </button>
                  );
                }

                return (
                  <button
                    onClick={() =>
                      handleCommitReconciliation(
                        reconcileDrawer.quote.id,
                        reconcileDrawer.invoice.id,
                        reconcileDrawer.reconciliation.matched_items || []
                      )
                    }
                    disabled={isCommittingReconcile}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm cursor-pointer disabled:opacity-50 flex items-center space-x-1.5"
                  >
                    <Check size={13} />
                    <span>{isCommittingReconcile ? 'Applying...' : 'Apply Reconciled Dispatch'}</span>
                  </button>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Management Approval Review Modal */}
      {reviewApprovalQuote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/70 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full p-4 sm:p-5 border border-slate-200 shadow-2xl animate-fadeIn space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center space-x-2 font-bold text-slate-800 text-sm">
                <AlertTriangle size={17} className="text-amber-600" />
                <span>Management Authorization Review</span>
              </div>
              <button
                onClick={() => setReviewApprovalQuote(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="text-xs space-y-2 bg-slate-50 p-3 rounded-xl border border-slate-200 font-mono">
              <div className="flex justify-between">
                <span className="text-slate-500">Quotation:</span>
                <span className="font-bold text-slate-900">{reviewApprovalQuote.quotation_number}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Customer:</span>
                <span className="font-bold text-slate-900">{reviewApprovalQuote.customer_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Net Payable:</span>
                <span className="font-bold text-slate-900">{formatCurrency(reviewApprovalQuote.net_total || 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Verified Paid:</span>
                <span className="font-bold text-emerald-700">{formatCurrency(reviewApprovalQuote.total_received_amount || 0)}</span>
              </div>
              <div className="flex justify-between text-rose-700 font-bold border-t border-slate-200 pt-1">
                <span>Payment Deficit:</span>
                <span>{formatCurrency(reviewApprovalQuote.deficit_amount || 0)}</span>
              </div>
            </div>

            {reviewApprovalQuote.dispatch_notes && (
              <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-900 max-h-28 overflow-y-auto">
                <div className="font-bold mb-1">Dispatch Notes / Audit Trail:</div>
                <pre className="whitespace-pre-wrap font-sans text-[11px]">{reviewApprovalQuote.dispatch_notes}</pre>
              </div>
            )}

            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                Management Decision Note
              </label>
              <input
                type="text"
                value={reviewApprovalActionNote}
                onChange={(e) => setReviewApprovalActionNote(e.target.value)}
                placeholder="e.g. Authorized by Management, client promised cheque tomorrow..."
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-200">
              <button
                onClick={() => handleDirectManagementDecision(reviewApprovalQuote.id, false)}
                disabled={isSubmittingApproval}
                className="px-3.5 py-2 rounded-xl border border-rose-300 bg-rose-50 hover:bg-rose-100 text-rose-800 font-bold text-xs cursor-pointer disabled:opacity-50"
              >
                Reject / Keep on Hold
              </button>
              <button
                onClick={() => handleDirectManagementDecision(reviewApprovalQuote.id, true)}
                disabled={isSubmittingApproval}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs cursor-pointer disabled:opacity-50 shadow-sm flex items-center space-x-1"
              >
                <Check size={13} />
                <span>Authorize Dispatch</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. PDF Preview Modal */}
      {previewPdfUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/80 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-5xl w-full h-[88vh] flex flex-col border border-slate-200 shadow-2xl overflow-hidden animate-fadeIn">
            <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-2 font-bold text-slate-800 text-xs">
                <FileText size={16} className="text-emerald-600" />
                <span className="font-extrabold text-slate-900 text-sm">Tax Invoice PDF Viewer</span>
                <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold">
                  Verified Tax Invoice
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <a
                  href={previewPdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs flex items-center space-x-1.5 transition"
                  title="Open PDF in a new browser tab"
                >
                  <ExternalLink size={13} />
                  <span>Open in New Tab</span>
                </a>
                <button
                  onClick={() => setPreviewPdfUrl(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition cursor-pointer"
                  title="Close Preview"
                >
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className="flex-1 min-h-0 w-full bg-slate-100 relative">
              <object
                data={previewPdfUrl}
                type="application/pdf"
                className="w-full h-full"
              >
                <iframe src={previewPdfUrl} className="w-full h-full border-none" title="Invoice Preview" />
                <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-slate-50">
                  <FileText className="text-slate-400 mb-3" size={42} />
                  <p className="text-xs font-semibold text-slate-700 mb-2">
                    PDF Preview is loading or your browser requires opening in a new tab.
                  </p>
                  <a
                    href={previewPdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center space-x-1.5 px-4 py-2 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 transition"
                  >
                    <ExternalLink size={13} />
                    <span>Open Tax Invoice PDF</span>
                  </a>
                </div>
              </object>
            </div>
          </div>
        </div>
      )}

      {/* 5. Financial Safeguard Warning Modal */}
      {safetyModalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full p-5 border border-rose-200 shadow-2xl flex flex-col space-y-4 animate-fadeIn">
            <div className="flex items-start space-x-3">
              <div className="p-2.5 rounded-2xl bg-rose-100 text-rose-600 shrink-0">
                <AlertTriangle size={24} />
              </div>
              <div className="flex-1">
                <h3 className="font-extrabold text-slate-900 text-base">
                  ⚠️ Insufficient Customer Payment for Dispatch / Procurement
                </h3>
                <p className="text-xs text-slate-600 mt-1">
                  The verified client payments received are less than the combined immediate value of Ready Stock and Local Purchase goods for this quotation.
                </p>
              </div>
              <button
                onClick={() => setSafetyModalItem(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Financial Breakdown Table */}
            <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 text-xs space-y-2">
              <div className="flex justify-between items-center text-slate-600">
                <span>Quotation Reference:</span>
                <span className="font-mono font-bold text-slate-800">{safetyModalItem.quote.quotation_number}</span>
              </div>
              <div className="flex justify-between items-center text-slate-600">
                <span>Customer:</span>
                <span className="font-semibold text-slate-800">{safetyModalItem.quote.customer_name}</span>
              </div>
              <div className="h-px bg-slate-200 my-1" />
              <div className="flex justify-between items-center">
                <span className="text-slate-600">Total Verified Payments Received:</span>
                <span className="font-mono font-bold text-emerald-700">
                  {formatCurrency(safetyModalItem.quote.total_received_amount || 0)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-600">Ready Stock Items Value:</span>
                <span className="font-mono font-semibold text-slate-800">
                  {formatCurrency(safetyModalItem.quote.ready_stock_total_value || 0)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-600">Local Purchase Items Value:</span>
                <span className="font-mono font-semibold text-slate-800">
                  {formatCurrency(safetyModalItem.quote.local_purchase_total_value || 0)}
                </span>
              </div>
              <div className="flex justify-between items-center font-bold text-slate-900 pt-1 border-t border-slate-200">
                <span>Committed Immediate Value:</span>
                <span className="font-mono">
                  {formatCurrency(safetyModalItem.quote.committed_immediate_value || 0)}
                </span>
              </div>
              <div className="flex justify-between items-center font-bold text-rose-700 pt-1 border-t border-rose-200 bg-rose-50/80 p-2 rounded-lg">
                <span>Outstanding Payment Deficit:</span>
                <span className="font-mono text-sm font-extrabold">
                  {formatCurrency(safetyModalItem.quote.deficit_amount || 0)}
                </span>
              </div>
            </div>

            {/* Target Item Being Dispatched */}
            <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs">
              <span className="font-bold text-amber-900">Attempted Action:</span>{' '}
              <span className="text-amber-800">Dispatching "{safetyModalItem.item.description}"</span>
            </div>

            {/* Admin Override Section */}
            {isAdminOrManager ? (
              <div className="space-y-1.5 pt-2 border-t border-slate-200">
                <label className="block text-[11px] font-bold text-slate-700 uppercase">
                  Supervisor Override (Admin / Manager Role Verified)
                </label>
                <input
                  type="text"
                  value={adminOverrideReason}
                  onChange={(e) => setAdminOverrideReason(e.target.value)}
                  placeholder="Optional reason for override (e.g. Approved by management, credit client)..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:outline-hidden focus:ring-2 focus:ring-rose-500/30 text-slate-900"
                />
              </div>
            ) : (
              <div className="p-2.5 rounded-xl bg-slate-100 border border-slate-200 text-slate-600 text-xs">
                🔒 Dispatch requires supervisor authorization. Please contact an Administrator or Manager to approve dispatching this order.
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setSafetyModalItem(null)}
                className="px-3.5 py-2 rounded-xl border border-slate-300 hover:bg-slate-100 font-semibold text-xs text-slate-700 cursor-pointer"
              >
                Cancel
              </button>

              {onNavigateToPayments && (
                <button
                  onClick={() => {
                    const quoteNum = safetyModalItem.quote.quotation_number;
                    setSafetyModalItem(null);
                    onNavigateToPayments(quoteNum);
                  }}
                  className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-sm cursor-pointer flex items-center space-x-1.5"
                >
                  <CreditCard size={13} />
                  <span>Record Customer Payment</span>
                </button>
              )}

              {isAdminOrManager && (
                <button
                  onClick={handleConfirmAdminOverride}
                  className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-sm cursor-pointer flex items-center space-x-1.5"
                >
                  <ShieldCheck size={13} />
                  <span>Override with Admin Approval</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
