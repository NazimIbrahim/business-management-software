import React, { useState, useEffect } from 'react';
import { useServer } from '../context/ServerContext';
import { useAuth } from '../context/AuthContext';
import { Quotation, Pagination, User } from '../types';
import {
  Search,
  Filter,
  FileText,
  Printer,
  Edit,
  Eye,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Plus,
  CheckCircle,
  XCircle,
  Clock,
  X,
  Users,
  ShieldAlert,
  Download,
  FileSpreadsheet,
  Trash2,
  Lock,
  AlertTriangle,
  History,
} from 'lucide-react';
import { PdfPreviewModal } from '../components/PdfPreviewModal';
import { QuotationHistoryModal } from '../components/QuotationHistoryModal';

interface Props {
  onSelectQuotation: (id: number) => void;
  onEditQuotation: (id: number, type?: 'tiles' | 'sanitary') => void;
  onCreateQuotation: (type?: 'tiles' | 'sanitary') => void;
}

export const QuotationList: React.FC<Props> = ({
  onSelectQuotation,
  onEditQuotation,
  onCreateQuotation,
}) => {
  const { serverUrl, fetchApi, getPdfUrl, subscribeToEvents } = useServer();
  const { user } = useAuth();

  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 15, total: 0, totalPages: 1 });
  const [summary, setSummary] = useState<{ totalQuotations: number; totalAmount: number }>({
    totalQuotations: 0,
    totalAmount: 0,
  });
  const [loading, setLoading] = useState(false);
  const [exportingFormat, setExportingFormat] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [status, setStatus] = useState('');
  const [quotationTypeFilter, setQuotationTypeFilter] = useState<'all' | 'tiles' | 'sanitary'>('all');
  const [selectedSalesPersonId, setSelectedSalesPersonId] = useState<number | null>(null);
  const [salesTeam, setSalesTeam] = useState<User[]>([]);
  const [page, setPage] = useState(1);

  // Status Change Modal State
  const [statusModal, setStatusModal] = useState<{ id: number; currentStatus: string; targetStatus: string } | null>(null);
  const [approvalNote, setApprovalNote] = useState('');
  const [updatingStatus, setUpdatingStatus] = useState(false);

  // Re-approval warning for salespersons editing approved quotations
  const [editWarningModal, setEditWarningModal] = useState<{ id: number; type?: 'tiles' | 'sanitary'; approvedBy?: string } | null>(null);

  // PDF Preview State
  const [previewPdf, setPreviewPdf] = useState<{
    url: string;
    title: string;
    fileName: string;
    quotationId?: number;
    initialEncrypted?: boolean;
  } | null>(null);

  // Quotation History Modal State
  const [historyModalQuotation, setHistoryModalQuotation] = useState<{ id: number; number: string } | null>(null);

  // Load sales team for filter
  useEffect(() => {
    fetchApi<any>('/api/users')
      .then((res: any) => {
        const list = res.users || res || [];
        if (Array.isArray(list)) {
          setSalesTeam(list.filter((u: User) => u.is_active));
        }
      })
      .catch((err) => console.error('Failed to load sales team:', err));
  }, []);

  // Debounce search input (300ms) to prevent excessive server requests
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(handler);
  }, [search]);

  const loadQuotations = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '15',
      });
      if (debouncedSearch) params.append('search', debouncedSearch);
      if (status) params.append('status', status);
      if (quotationTypeFilter !== 'all') params.append('quotation_type', quotationTypeFilter);
      if (user?.role?.toLowerCase() === 'salesperson') {
        params.append('sales_person_id', String(user.id));
      } else if (selectedSalesPersonId) {
        params.append('sales_person_id', String(selectedSalesPersonId));
      }

      const res = await fetchApi<any>(`/api/quotations?${params.toString()}`);
      setQuotations(res.quotations || []);
      setPagination(res.pagination || { page: 1, limit: 15, total: 0, totalPages: 1 });
      setSummary(res.summary || { totalQuotations: 0, totalAmount: 0 });
    } catch (err) {
      console.error('Failed to load quotations:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadQuotations();
  }, [page, debouncedSearch, status, selectedSalesPersonId, quotationTypeFilter]);

  // Real-time synchronization
  useEffect(() => {
    const unsubscribe = subscribeToEvents((event) => {
      if (['QUOTATION_CREATED', 'QUOTATION_UPDATED', 'QUOTATION_STATUS_CHANGED'].includes(event.type)) {
        loadQuotations();
      }
    });
    return () => unsubscribe();
  }, [page, debouncedSearch, status, selectedSalesPersonId]);

  const handleOpenPdf = (q: Quotation, e: React.MouseEvent, encrypted: boolean = false) => {
    e.stopPropagation();
    const url = getPdfUrl(q.id, encrypted);
    setPreviewPdf({
      url,
      title: encrypted
        ? `Quotation ${q.quotation_number} — ${q.customer_name} (Encrypted)`
        : `Quotation ${q.quotation_number} — ${q.customer_name}`,
      fileName: encrypted
        ? `Quotation_${q.quotation_number}_Encrypted.pdf`
        : `Quotation_${q.quotation_number}.pdf`,
      quotationId: q.id,
      initialEncrypted: encrypted,
    });
  };

  const handleStatusSubmit = async () => {
    if (!statusModal) return;
    setUpdatingStatus(true);
    try {
      await fetchApi(`/api/quotations/${statusModal.id}/status`, {
        method: 'POST',
        body: JSON.stringify({
          status: statusModal.targetStatus,
          manager_approval_note: approvalNote,
        }),
      });
      setStatusModal(null);
      setApprovalNote('');
      loadQuotations();
    } catch (err: any) {
      alert(err.message || 'Failed to update status');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleEditClick = (q: Quotation) => {
    const isApproved = ['approved', 'closed'].includes(q.status?.toLowerCase());
    const isSalesperson = user?.role === 'salesperson';
    if (isSalesperson && isApproved) {
      setEditWarningModal({
        id: q.id,
        type: q.quotation_type || 'tiles',
        approvedBy: q.approved_by_name || 'Store Manager',
      });
    } else {
      onEditQuotation(q.id, q.quotation_type || 'tiles');
    }
  };

  const handleExportList = async (format: 'xlsx' | 'csv' | 'pdf') => {
    setExportingFormat(format);
    try {
      const params = new URLSearchParams({ format });
      if (debouncedSearch) params.append('search', debouncedSearch);
      if (status) params.append('status', status);
      if (quotationTypeFilter !== 'all') params.append('quotation_type', quotationTypeFilter);
      if (user?.role?.toLowerCase() === 'salesperson') {
        params.append('sales_person_id', String(user.id));
      } else if (selectedSalesPersonId) {
        params.append('sales_person_id', String(selectedSalesPersonId));
      }

      const token = localStorage.getItem('ama_token');
      if (token) params.append('token', token);

      const downloadUrl = `${serverUrl}/api/reports/quotations/export?${params.toString()}`;
      const statusLabel = status ? `_${status}` : '';
      const filename = `Quotations${statusLabel}_${new Date().toISOString().split('T')[0]}.${format}`;

      if (window.electronAPI) {
        const res = await window.electronAPI.downloadFile(downloadUrl, filename);
        if (res.success) {
          alert(`Export saved successfully to:\n${res.filePath}`);
        } else if (res.error && res.error !== 'Canceled by user') {
          throw new Error(res.error);
        }
      } else {
        const token = localStorage.getItem('ama_token');
        const res = await fetch(downloadUrl, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) throw new Error(`Export failed: HTTP ${res.status}`);
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(blobUrl);
      }
    } catch (err: any) {
      alert(err.message || 'Failed to export quotations');
    } finally {
      setExportingFormat(null);
    }
  };

  const formatCurrency = (val: number) => {
    return Number(val || 0).toLocaleString('en-IN', {
      maximumFractionDigits: 2,
      minimumFractionDigits: 2,
    });
  };

  const canApprove = ['admin', 'manager'].includes(user?.role || '');
  const isAdminOrAccountant = ['admin', 'accounts', 'accountant'].includes(user?.role || '');

  const handleRemoveAllQuotations = async () => {
    if (!isAdminOrAccountant) return;
    if (
      window.confirm(
        `Are you sure you want to remove ALL ${summary.totalQuotations} quotations from the system?\n\nThis will permanently delete all quotations, area calculations, line items, and payment allocations. This action CANNOT be undone.`
      )
    ) {
      try {
        setLoading(true);
        await fetchApi('/api/quotations/all', { method: 'DELETE' });
        alert('All quotations have been deleted successfully.');
        await loadQuotations();
      } catch (err: any) {
        alert(err.message || 'Failed to delete quotations');
      } finally {
        setLoading(false);
      }
    }
  };

  const handleDeleteSingleQuotation = async (e: React.MouseEvent, id: number, quoteNum: string) => {
    e.stopPropagation();
    if (!confirm(`Are you sure you want to delete quotation ${quoteNum}?`)) return;
    try {
      await fetchApi(`/api/quotations/${id}`, { method: 'DELETE' });
      await loadQuotations();
    } catch (err: any) {
      alert(err.message || 'Failed to delete quotation');
    }
  };

  const statusChips = [
    { id: '', label: 'All Quotations' },
    { id: 'closed', label: 'Closed' },
    { id: 'not_closed', label: 'Not Closed (Active)' },
    { id: 'draft', label: 'Draft' },
    { id: 'in_review', label: 'In Review' },
    { id: 'approved', label: 'Approved' },
    { id: 'rejected', label: 'Rejected' },
  ];

  return (
    <div className="flex-1 p-4 sm:p-5 lg:p-6 space-y-4 overflow-y-auto w-full min-w-0">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">Quotations</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Total {summary.totalQuotations} records recorded • Total Value ₹ {formatCurrency(summary.totalAmount)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Export Register Dropdown */}
          <div className="relative group">
            <button
              type="button"
              className={`btn btn-secondary btn-sm flex items-center space-x-1.5 ${exportingFormat ? 'btn-exporting' : ''}`}
              disabled={Boolean(exportingFormat)}
              title="Export filtered quotations register to Excel (.xlsx) or CSV"
            >
              <FileSpreadsheet size={14} className={exportingFormat ? 'animate-bounce text-emerald-700' : 'text-emerald-700'} />
              <span>{exportingFormat ? `Exporting ${exportingFormat.toUpperCase()}...` : 'Export Register'}</span>
            </button>
            <div className="dropdown-menu absolute right-0 top-full mt-1 hidden group-hover:block z-30 bg-white border border-[#CBD5E1] rounded-md shadow-xl p-1 min-w-[185px] animate-dropdown-open">
              <button
                type="button"
                onClick={() => handleExportList('pdf')}
                className="w-full text-left px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-rose-50 hover:text-rose-700 rounded flex items-center space-x-2"
              >
                <Printer size={13} className="text-rose-600" />
                <span>Export to PDF (.pdf)</span>
              </button>
              <button
                type="button"
                onClick={() => handleExportList('xlsx')}
                className="w-full text-left px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded flex items-center space-x-2"
              >
                <FileSpreadsheet size={13} className="text-emerald-600" />
                <span>Export to Excel (.xlsx)</span>
              </button>
              <button
                type="button"
                onClick={() => handleExportList('csv')}
                className="w-full text-left px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded flex items-center space-x-2"
              >
                <Download size={13} className="text-blue-600" />
                <span>Export to CSV (.csv)</span>
              </button>
            </div>
          </div>

          {isAdminOrAccountant && (
            <button
              type="button"
              onClick={handleRemoveAllQuotations}
              className="btn btn-secondary btn-sm flex items-center space-x-1.5 border border-rose-300 text-rose-700 bg-rose-50 hover:bg-rose-100"
              title="Remove all quotations from the system (Admin & Accounts only)"
            >
              <Trash2 size={14} className="text-rose-600" />
              <span>Remove All Data</span>
            </button>
          )}

          <button onClick={() => onCreateQuotation()} className="btn btn-primary btn-sm">
            <Plus size={14} />
            <span>New Quotation</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="card p-3 space-y-2.5">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              className="input input-sm pl-8 pr-8 w-full"
              placeholder="Search by quotation number, customer name, mobile, project..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* Sales Associate Filter Dropdown (Locked for salespersons) */}
          {user?.role?.toLowerCase() === 'salesperson' ? (
            <div className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-100 border border-slate-200 rounded-md text-xs font-semibold text-slate-800 select-none">
              <Users size={13} className="text-slate-500" />
              <span>Associate: {user?.full_name}</span>
            </div>
          ) : (
            <div className="relative min-w-[220px]">
              <Users size={13} className="absolute left-2.5 top-2.5 text-slate-400 pointer-events-none" />
              <select
                className={`select select-sm pl-8 pr-7 w-full text-xs font-medium cursor-pointer ${
                  selectedSalesPersonId
                    ? 'border-indigo-500 bg-indigo-50/50 text-indigo-950 font-semibold'
                    : 'text-slate-700'
                }`}
                value={selectedSalesPersonId || ''}
                onChange={(e) => {
                  setSelectedSalesPersonId(e.target.value ? Number(e.target.value) : null);
                  setPage(1);
                }}
              >
                <option value="">All Sales Associates</option>
                {salesTeam.map((sp) => (
                  <option key={sp.id} value={sp.id}>
                    {sp.full_name} ({sp.role})
                  </option>
                ))}
              </select>
              {selectedSalesPersonId && (
                <button
                  onClick={() => {
                    setSelectedSalesPersonId(null);
                    setPage(1);
                  }}
                  className="absolute right-7 top-2 text-slate-400 hover:text-slate-600"
                  title="Clear sales associate filter"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          )}

          <button
            onClick={loadQuotations}
            className="btn btn-secondary btn-sm shrink-0"
            title="Refresh list"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
        </div>

        {/* Type & Status Filter Controls */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5 pt-2 border-t border-slate-100">
          {/* Category / Type Tabs */}
          <div className="flex items-center space-x-1.5 shrink-0">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mr-1">Type:</span>
            <button
              type="button"
              onClick={() => {
                setQuotationTypeFilter('all');
                setPage(1);
              }}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                quotationTypeFilter === 'all'
                  ? 'bg-[#1B263B] text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              All Types
            </button>
            <button
              type="button"
              onClick={() => {
                setQuotationTypeFilter('tiles');
                setPage(1);
              }}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center space-x-1 transition-all cursor-pointer ${
                quotationTypeFilter === 'tiles'
                  ? 'bg-blue-700 text-white shadow-xs'
                  : 'bg-blue-50 text-blue-800 border border-blue-200/60 hover:bg-blue-100'
              }`}
            >
              <span>🧱 Tile Quotations</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setQuotationTypeFilter('sanitary');
                setPage(1);
              }}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center space-x-1 transition-all cursor-pointer ${
                quotationTypeFilter === 'sanitary'
                  ? 'bg-teal-700 text-white shadow-xs'
                  : 'bg-teal-50 text-teal-800 border border-teal-200/60 hover:bg-teal-100'
              }`}
            >
              <span>🚿 Sanitary Quotations</span>
            </button>
          </div>

          {/* Status Chips */}
          <div className="flex items-center space-x-1.5 overflow-x-auto pb-0.5">
            {statusChips.map((chip) => {
              const isSelected = status === chip.id;
              return (
                <button
                  key={chip.id}
                  onClick={() => {
                    setStatus(chip.id);
                    setPage(1);
                  }}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
                    isSelected
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {chip.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Quotations Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-[#E0E1DD] bg-[#F8F9FA]/80 text-[#415A77] font-semibold text-[11px] uppercase tracking-wider">
                <th className="py-3 px-3.5 w-36 whitespace-nowrap text-left font-mono">Quotation Ref</th>
                <th className="py-3 px-3 w-28 whitespace-nowrap text-left">Date</th>
                <th className="py-3 px-3.5 min-w-[170px] text-left">Customer</th>
                <th className="py-3 px-3.5 min-w-[170px] text-left">Sales Associate</th>
                <th className="py-3 px-3 w-28 whitespace-nowrap text-center">Status</th>
                <th className="py-3 px-3.5 w-32 whitespace-nowrap text-right">Net Total</th>
                <th className="py-3 px-3.5 w-28 whitespace-nowrap text-right">Paid</th>
                <th className="py-3 px-3.5 w-32 whitespace-nowrap text-right">Balance Due</th>
                <th className="py-3 px-4 w-72 whitespace-nowrap text-right">Workflow & Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E0E1DD]/60">
              {loading && quotations.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    <RefreshCw className="animate-spin inline mr-2 text-slate-600" size={16} />
                    Loading quotations...
                  </td>
                </tr>
              ) : quotations.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    No quotations match current filters.
                  </td>
                </tr>
              ) : (
                quotations.map((q) => (
                  <tr
                    key={q.id}
                    onClick={() => onSelectQuotation(q.id)}
                    className="hover:bg-white/80 transition-colors cursor-pointer border-b border-[#E0E1DD]/40"
                  >
                    <td className="py-3 px-3.5 font-mono font-bold text-[#0D1B2A] whitespace-nowrap align-middle">
                      <div className="flex items-center space-x-1.5">
                        <span>{q.quotation_number}</span>
                        {q.quotation_type === 'sanitary' ? (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-teal-100 text-teal-800 border border-teal-300 font-sans tracking-wide">
                            🚿 Sanitary
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-blue-100 text-blue-800 border border-blue-300 font-sans tracking-wide">
                            🧱 Tile
                          </span>
                        )}
                        {q.version && q.version > 1 ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setHistoryModalQuotation({ id: q.id, number: q.quotation_number });
                            }}
                            className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 font-sans tracking-wide cursor-pointer flex items-center space-x-0.5"
                            title={`Revision ${q.version}. Click to view previous quotes and edit history.`}
                          >
                            <History size={9} />
                            <span>v{q.version}</span>
                          </button>
                        ) : null}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-slate-600 whitespace-nowrap align-middle font-mono text-xs">
                      {new Date(q.quotation_date).toLocaleDateString('en-GB')}
                    </td>
                    <td className="py-3 px-3.5 align-middle">
                      <div className="font-semibold text-[#0D1B2A] text-xs">{q.customer_name}</div>
                      <div className="text-[11px] text-[#415A77] font-mono font-medium">{q.customer_phone}</div>
                    </td>
                    <td className="py-3 px-3.5 align-middle">
                      <div className="font-medium text-[#1B263B] text-xs">{q.sales_person_name}</div>
                      {q.assisted_sales_person_name && (
                        <div className="text-[10px] text-indigo-800 font-semibold inline-flex items-center space-x-1 mt-0.5">
                          <span className="bg-indigo-50 border border-indigo-200 px-1.5 py-0.2 rounded font-sans">
                            🤝 +{q.assisted_sales_person_name} ({Number(q.assisted_sales_share_percent || 50).toFixed(0)}%)
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-3 align-middle text-center whitespace-nowrap">
                      <span className={`badge badge-${q.status}`}>
                        {q.status ? q.status.replace('_', ' ') : ''}
                      </span>
                      {['approved', 'closed'].includes(q.status?.toLowerCase()) ? (
                        <div className="text-[10px] text-emerald-800 font-bold mt-1">
                          Approved by: {q.approved_by_name || 'Store Manager'}
                        </div>
                      ) : q.status === 'in_review' ? (
                        <div className="text-[10px] text-amber-700 font-medium mt-1">
                          ⏳ Pending Approval
                        </div>
                      ) : null}
                    </td>
                    <td className="py-3 px-3.5 text-right font-bold text-[#0D1B2A] tabular-nums align-middle whitespace-nowrap">
                      <div>₹ {formatCurrency(q.net_total)}</div>
                      {selectedSalesPersonId && q.assisted_sales_person_id && (
                        <div className="text-[10px] text-indigo-700 font-semibold font-mono">
                          Credit: ₹{' '}
                          {formatCurrency(
                            q.sales_person_id === selectedSalesPersonId
                              ? (q.primary_sales_share_amount || Math.round((q.net_total * (q.primary_sales_share_percent || 100)) / 100))
                              : (q.assisted_sales_share_amount || Math.round((q.net_total * (q.assisted_sales_share_percent || 0)) / 100))
                          )}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-3.5 text-right text-emerald-700 font-semibold tabular-nums align-middle whitespace-nowrap">
                      ₹ {formatCurrency(q.total_paid || 0)}
                    </td>
                    <td className="py-3 px-3.5 text-right text-amber-700 font-semibold tabular-nums align-middle whitespace-nowrap">
                      ₹ {formatCurrency(q.balance_due || 0)}
                    </td>
                    <td className="py-3 px-4 text-right align-middle whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <div className="inline-flex items-center justify-end space-x-1.5 whitespace-nowrap">
                        {user?.role === 'salesperson' && !['approved', 'closed'].includes(q.status?.toLowerCase()) ? (
                          <span
                            className="px-2 py-0.5 text-[10px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded inline-flex items-center"
                            title="Quotation is pending Store Manager approval. PDF export and printing will unlock once approved."
                          >
                            <Lock size={10} className="mr-1 text-amber-600" />
                            <span>Awaiting Approval</span>
                          </span>
                        ) : (
                          <>
                            {/* Standard PDF Export Button */}
                            <button
                              type="button"
                              onClick={(e) => handleOpenPdf(q, e, false)}
                              title="Preview & Export Standard PDF"
                              className="btn btn-secondary btn-xs px-2 py-0.5 text-[10px] font-semibold text-[#1B263B] hover:text-[#0D1B2A] border border-slate-300 shadow-2xs"
                            >
                              <Printer size={11} className="mr-1 text-[#415A77]" />
                              <span>PDF</span>
                            </button>

                            {/* Encrypted PDF Export Button */}
                            <button
                              type="button"
                              onClick={(e) => handleOpenPdf(q, e, true)}
                              title="Export Encrypted PDF: Brand removed, Product name replaced with random code (e.g. HSDS-AMA)"
                              className="btn btn-xs px-2 py-0.5 text-[10px] font-semibold bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300/80 shadow-2xs"
                            >
                              <ShieldAlert size={11} className="mr-1 text-amber-600" />
                              <span>Encrypted</span>
                            </button>
                          </>
                        )}

                        {/* View / Review Details */}
                        <button
                          type="button"
                          onClick={() => onSelectQuotation(q.id)}
                          title="Review Quotation Details"
                          className="btn btn-secondary btn-xs px-2 py-0.5 text-[10px] font-semibold text-[#1B263B] hover:text-primary"
                        >
                          <Eye size={11} className="mr-1 text-[#415A77]" />
                          <span>Review</span>
                        </button>

                        {/* Version History Button */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setHistoryModalQuotation({ id: q.id, number: q.quotation_number });
                          }}
                          title="View Previous Quotes & Version History"
                          className="p-1.5 rounded-md text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 border border-transparent hover:border-indigo-200 transition-colors"
                        >
                          <History size={13} />
                        </button>

                        {/* Edit Quotation */}
                        <button
                          type="button"
                          onClick={() => handleEditClick(q)}
                          title="Edit Quotation"
                          className="p-1.5 rounded-md text-[#415A77] hover:text-[#0D1B2A] hover:bg-white/80 border border-transparent hover:border-slate-200 transition-colors"
                        >
                          <Edit size={13} />
                        </button>

                        {/* Delete Single Quotation (Admin & Accounts) */}
                        {isAdminOrAccountant && (
                          <button
                            type="button"
                            onClick={(e) => handleDeleteSingleQuotation(e, q.id, q.quotation_number)}
                            title="Delete Quotation"
                            className="p-1.5 rounded-md text-rose-500 hover:text-rose-700 hover:bg-rose-50 border border-transparent hover:border-rose-200 transition-colors"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}

                        {/* Status Transition Quick Buttons */}
                        {q.status === 'draft' && (
                          <button
                            onClick={() =>
                              setStatusModal({
                                id: q.id,
                                currentStatus: q.status,
                                targetStatus: 'in_review',
                              })
                            }
                            className="btn btn-secondary btn-xs px-2 py-0.5 text-[10px] font-semibold text-amber-800 hover:text-amber-900 border-amber-200"
                            title="Submit for Manager Review"
                          >
                            Review
                          </button>
                        )}

                        {q.status === 'approved' && canApprove && (
                          <button
                            onClick={() =>
                              setStatusModal({
                                id: q.id,
                                currentStatus: q.status,
                                targetStatus: 'closed',
                              })
                            }
                            className="btn btn-xs px-2 py-0.5 text-[10px] font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200"
                            title="Close Deal and Send to Dispatch Pipeline"
                          >
                            Close & Dispatch
                          </button>
                        )}

                        {q.status === 'in_review' && canApprove && (
                          <div className="inline-flex space-x-1">
                            <button
                              onClick={() =>
                                setStatusModal({
                                  id: q.id,
                                  currentStatus: q.status,
                                  targetStatus: 'approved',
                                })
                              }
                              className="btn btn-success btn-xs px-2 py-0.5 text-[10px] font-semibold"
                              title="Approve Quotation"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() =>
                                setStatusModal({
                                  id: q.id,
                                  currentStatus: q.status,
                                  targetStatus: 'rejected',
                                })
                              }
                              className="btn btn-danger btn-xs px-2 py-0.5 text-[10px] font-semibold"
                              title="Reject Quotation"
                            >
                              Reject
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        <div className="bg-slate-50 px-4 py-2.5 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
          <div>
            Showing {(pagination.page - 1) * pagination.limit + 1} to{' '}
            {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} entries
          </div>
          <div className="flex items-center space-x-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="btn btn-secondary btn-sm p-1 disabled:opacity-40"
              title="Previous Page"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="px-2 font-medium tabular-nums">
              Page {pagination.page} of {pagination.totalPages || 1}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
              disabled={page >= pagination.totalPages}
              className="btn btn-secondary btn-sm p-1 disabled:opacity-40"
              title="Next Page"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Status Transition Note Modal */}
      {statusModal && (
        <div className="modal-overlay" onClick={() => setStatusModal(null)}>
          <div
            className="card p-5 max-w-md w-full shadow-xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center border-b pb-2">
              <h3 className="text-sm font-bold text-slate-900 uppercase">
                Change Status: {statusModal.targetStatus.replace('_', ' ')}
              </h3>
              <button
                onClick={() => setStatusModal(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={16} />
              </button>
            </div>

            <div className="text-xs space-y-2">
              <label className="block text-slate-700 font-semibold">
                Approval / Rejection Note (Optional)
              </label>
              <textarea
                className="input"
                rows={3}
                placeholder="Enter comments for sales associate or audit log..."
                value={approvalNote}
                onChange={(e) => setApprovalNote(e.target.value)}
              />
            </div>

            <div className="flex justify-end space-x-2 pt-2">
              <button
                onClick={() => setStatusModal(null)}
                className="btn btn-secondary btn-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleStatusSubmit}
                disabled={updatingStatus}
                className="btn btn-primary btn-sm"
              >
                {updatingStatus ? 'Updating...' : 'Confirm Status Update'}
              </button>
            </div>
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
              This quotation was previously approved by <strong>{editWarningModal.approvedBy || 'Store Manager'}</strong>.
              <br /><br />
              Modifying this quotation will automatically revoke the approval and reset its status back to <strong>"In Review"</strong>.
              PDF export and printing will remain locked until your Store Manager reviews and re-approves the updated quotation.
              <br /><br />
              Do you wish to proceed with editing?
            </p>
            <div className="flex justify-end space-x-2">
              <button
                type="button"
                onClick={() => setEditWarningModal(null)}
                className="btn btn-secondary btn-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const target = editWarningModal;
                  setEditWarningModal(null);
                  onEditQuotation(target.id, target.type);
                }}
                className="btn btn-primary btn-sm bg-amber-600 hover:bg-amber-700 border-transparent text-white"
              >
                Proceed to Edit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PDF Preview Modal */}
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

      {/* Quotation Edit & Version History Modal */}
      {historyModalQuotation && (
        <QuotationHistoryModal
          quotationId={historyModalQuotation.id}
          quotationNumber={historyModalQuotation.number}
          isOpen={Boolean(historyModalQuotation)}
          onClose={() => setHistoryModalQuotation(null)}
          onRestored={() => {
            loadQuotations();
          }}
        />
      )}
    </div>
  );
};
