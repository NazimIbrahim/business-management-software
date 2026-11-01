import React, { useState, useEffect } from 'react';
import { useServer } from '../context/ServerContext';
import { useAuth } from '../context/AuthContext';
import { User, Quotation } from '../types';
import {
  BarChart3,
  Download,
  FileSpreadsheet,
  Calendar,
  CheckCircle2,
  Users,
  UserCheck,
  TrendingUp,
  Award,
  Filter,
  RefreshCw,
  Printer,
  ShieldAlert,
  Eye,
  DollarSign,
  ChevronRight,
  Search,
} from 'lucide-react';
import { PdfPreviewModal } from '../components/PdfPreviewModal';

const formatCurrency = (val: number) => {
  return Number(val || 0).toLocaleString('en-IN', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  });
};

interface Props {
  onSelectQuotation?: (id: number) => void;
}

export const ReportsPage: React.FC<Props> = ({ onSelectQuotation }) => {
  const { serverUrl, fetchApi, getPdfUrl } = useServer();
  const { user } = useAuth();
  const isSalesperson = user?.role?.toLowerCase() === 'salesperson';
  const token = localStorage.getItem('ama_token');

  // Active Tab: 'salesperson' | 'quotations' | 'payments'
  const [activeTab, setActiveTab] = useState<'salesperson' | 'quotations' | 'payments'>('salesperson');

  // Sales team state
  const [salesTeam, setSalesTeam] = useState<User[]>([]);
  const [selectedSpId, setSelectedSpId] = useState<string>(isSalesperson && user ? String(user.id) : '');
  const [spStatus, setSpStatus] = useState<string>('');
  const [spStartDate, setSpStartDate] = useState<string>('');
  const [spEndDate, setSpEndDate] = useState<string>('');
  const [spSummary, setSpSummary] = useState<any[]>([]);
  const [spQuotations, setSpQuotations] = useState<Quotation[]>([]);
  const [loadingSummary, setLoadingSummary] = useState<boolean>(false);
  const [loadingQuotes, setLoadingQuotes] = useState<boolean>(false);

  // General Quotation export filters
  const [qStatus, setQStatus] = useState('');
  const [qSalespersonId, setQSalespersonId] = useState(isSalesperson && user ? String(user.id) : '');
  const [qStartDate, setQStartDate] = useState('');
  const [qEndDate, setQEndDate] = useState('');
  const [qExportMode, setQExportMode] = useState<'standard' | 'encrypted'>('standard');
  const [qItemized, setQItemized] = useState<boolean>(false);

  // Payment export filters
  const [pStartDate, setPStartDate] = useState('');
  const [pEndDate, setPEndDate] = useState('');

  const [exportingKey, setExportingKey] = useState<string | null>(null);

  // PDF Preview State
  const [previewPdf, setPreviewPdf] = useState<{
    url: string;
    title: string;
    fileName: string;
    quotationId?: number;
    initialEncrypted?: boolean;
  } | null>(null);

  // Sync salesperson restriction when user loads
  useEffect(() => {
    if (isSalesperson && user?.id) {
      setSelectedSpId(String(user.id));
      setQSalespersonId(String(user.id));
    }
  }, [isSalesperson, user]);

  // Fetch sales team users on mount
  useEffect(() => {
    fetchApi('/api/users')
      .then((res) => {
        const all: User[] = res.users || [];
        setSalesTeam(all.filter((u) => u.is_active));
      })
      .catch((err) => console.error('Failed to load users for report:', err));
  }, []);

  // Fetch Salesperson Summary
  const loadSalespersonSummary = () => {
    setLoadingSummary(true);
    const params = new URLSearchParams();
    if (spStartDate) params.append('start_date', spStartDate);
    if (spEndDate) params.append('end_date', spEndDate);
    if (isSalesperson && user?.id) {
      params.append('sales_person_id', String(user.id));
    } else if (selectedSpId) {
      params.append('sales_person_id', selectedSpId);
    }

    fetchApi(`/api/reports/salespersons/summary?${params.toString()}`)
      .then((res) => {
        let list = res.summary || [];
        if (isSalesperson && user?.id) {
          list = list.filter((s: any) => String(s.user_id) === String(user.id));
        }
        setSpSummary(list);
      })
      .catch((err) => console.error('Failed to load summary:', err))
      .finally(() => setLoadingSummary(false));
  };

  // Fetch Salesperson Quotations list
  const loadSalespersonQuotations = () => {
    setLoadingQuotes(true);
    const params = new URLSearchParams({ limit: '100' });
    if (isSalesperson && user?.id) {
      params.append('sales_person_id', String(user.id));
    } else if (selectedSpId) {
      params.append('sales_person_id', selectedSpId);
    }
    if (spStatus) params.append('status', spStatus);

    fetchApi(`/api/quotations?${params.toString()}`)
      .then((res) => {
        let list: Quotation[] = res.quotations || [];
        if (isSalesperson && user?.id) {
          list = list.filter((q: any) => q.sales_person_id === user.id || q.assisted_sales_person_id === user.id);
        }
        // Apply local date filtering if provided
        if (spStartDate) {
          list = list.filter((q) => q.quotation_date >= spStartDate);
        }
        if (spEndDate) {
          list = list.filter((q) => q.quotation_date <= spEndDate);
        }
        setSpQuotations(list);
      })
      .catch((err) => console.error('Failed to load salesperson quotations:', err))
      .finally(() => setLoadingQuotes(false));
  };

  useEffect(() => {
    loadSalespersonSummary();
    loadSalespersonQuotations();
  }, [selectedSpId, spStatus, spStartDate, spEndDate, user]);

  // Generic Download Handler
  const handleDownload = async (
    type: 'quotations' | 'payments' | 'salespersons',
    format: 'xlsx' | 'csv' | 'pdf',
    customParams?: Record<string, string>
  ) => {
    const key = `${type}-${format}${customParams?.encrypted ? '-enc' : ''}`;
    setExportingKey(key);

    const token = localStorage.getItem('ama_token');
    const params = new URLSearchParams({ format, ...(customParams || {}) });
    if (token) params.set('token', token);

    // If caller is a salesperson, STRICTLY scope exports to their own user id
    if (isSalesperson && user?.id) {
      params.set('sales_person_id', String(user.id));
    }

    if (type === 'quotations' && !customParams) {
      if (qStatus) params.append('status', qStatus);
      if (isSalesperson && user?.id) {
        params.set('sales_person_id', String(user.id));
      } else if (qSalespersonId) {
        params.append('sales_person_id', qSalespersonId);
      }
      if (qStartDate) params.append('start_date', qStartDate);
      if (qEndDate) params.append('end_date', qEndDate);
      if (qExportMode === 'encrypted') params.append('encrypted', 'true');
      if (qItemized) params.append('itemized', 'true');
    } else if (type === 'payments' && !customParams) {
      if (isSalesperson && user?.id) {
        params.set('sales_person_id', String(user.id));
      }
      if (pStartDate) params.append('start_date', pStartDate);
      if (pEndDate) params.append('end_date', pEndDate);
    } else if (type === 'salespersons' && !customParams) {
      if (isSalesperson && user?.id) {
        params.set('sales_person_id', String(user.id));
      }
      if (spStartDate) params.append('start_date', spStartDate);
      if (spEndDate) params.append('end_date', spEndDate);
    }

    const downloadUrl = `${serverUrl}/api/reports/${type}/export?${params.toString()}`;
    const encTag = customParams?.encrypted || qExportMode === 'encrypted' ? '_Encrypted' : '';
    const filename = `${type}_report${encTag}_${new Date().toISOString().split('T')[0]}.${format}`;

    try {
      if (window.electronAPI) {
        const res = await window.electronAPI.downloadFile(downloadUrl, filename);
        if (res.success) {
          alert(`Report successfully exported to:\n${res.filePath}`);
        } else if (res.error && res.error !== 'Canceled by user') {
          alert('Export failed: ' + res.error);
        }
      } else {
        const res = await fetch(downloadUrl, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      }
    } catch (err: any) {
      alert('Export failed: ' + err.message);
    } finally {
      setExportingKey(null);
    }
  };

  const handleOpenPdf = (quotation: Quotation, encrypted: boolean) => {
    const url = getPdfUrl(quotation.id, encrypted);
    setPreviewPdf({
      url,
      title: encrypted
        ? `Quotation ${quotation.quotation_number} — ${quotation.customer_name} (Encrypted)`
        : `Quotation ${quotation.quotation_number} — ${quotation.customer_name}`,
      fileName: encrypted
        ? `Quotation_${quotation.quotation_number}_Encrypted.pdf`
        : `Quotation_${quotation.quotation_number}.pdf`,
      quotationId: quotation.id,
      initialEncrypted: encrypted,
    });
  };

  // Selected salesperson summary stats
  const activeSummary = selectedSpId
    ? spSummary.find((s) => String(s.user_id) === String(selectedSpId))
    : null;

  // Total aggregated stats across sales team
  const aggregateStats = {
    totalQuotes: spSummary.reduce((acc, s) => acc + (s.total_quotations || 0), 0),
    closedQuotes: spSummary.reduce((acc, s) => acc + (s.closed_quotations || 0), 0),
    closedValue: spSummary.reduce((acc, s) => acc + (s.closed_value || 0), 0),
    pipelineValue: spSummary.reduce((acc, s) => acc + (s.pipeline_value || 0), 0),
    totalValue: spSummary.reduce((acc, s) => acc + (s.total_value || 0), 0),
  };

  return (
    <div className="flex-1 p-4 sm:p-5 lg:p-6 space-y-4 lg:space-y-6 overflow-y-auto w-full min-w-0">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Reports & Business Intelligence</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Salesperson performance analysis, encrypted item quotations, and audited financial statements
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center bg-slate-200/80 p-1 rounded-lg border border-slate-300 text-xs">
          <button
            onClick={() => setActiveTab('salesperson')}
            className={`px-3 py-1.5 rounded-md font-semibold transition-all flex items-center space-x-1.5 ${
              activeTab === 'salesperson'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-700 hover:text-slate-900'
            }`}
          >
            <Users size={14} />
            <span>Salesperson Reports</span>
          </button>
          <button
            onClick={() => setActiveTab('quotations')}
            className={`px-3 py-1.5 rounded-md font-semibold transition-all flex items-center space-x-1.5 ${
              activeTab === 'quotations'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-700 hover:text-slate-900'
            }`}
          >
            <FileSpreadsheet size={14} />
            <span>Quotations Register</span>
          </button>
          <button
            onClick={() => setActiveTab('payments')}
            className={`px-3 py-1.5 rounded-md font-semibold transition-all flex items-center space-x-1.5 ${
              activeTab === 'payments'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-700 hover:text-slate-900'
            }`}
          >
            <BarChart3 size={14} />
            <span>Payments Register</span>
          </button>
        </div>
      </div>

      {/* TAB 1: SALESPERSON WISE QUOTATION REPORTS */}
      {activeTab === 'salesperson' && (
        <div className="space-y-4 lg:space-y-5">
          {/* Salesperson Filter & Action Bar */}
          <div className="card p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <div className="flex items-center space-x-2 text-slate-900 font-bold text-sm">
                <Filter size={15} className="text-slate-700" />
                <span>Sales Associate Report Filters</span>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => {
                    if (!isSalesperson) setSelectedSpId('');
                    setSpStatus('');
                    setSpStartDate('');
                    setSpEndDate('');
                  }}
                  className="btn btn-secondary btn-xs text-[10px]"
                >
                  Reset Filters
                </button>
                <button
                  type="button"
                  onClick={() => {
                    loadSalespersonSummary();
                    loadSalespersonQuotations();
                  }}
                  className="btn btn-secondary btn-xs text-[10px] flex items-center space-x-1"
                >
                  <RefreshCw size={11} className={loadingSummary || loadingQuotes ? 'animate-spin' : ''} />
                  <span>Refresh</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              {/* Salesperson Select */}
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Sales Associate</label>
                {isSalesperson ? (
                  <div className="input input-sm w-full bg-slate-100 text-slate-800 font-bold flex items-center cursor-not-allowed select-none">
                    {user?.full_name} (Restricted to My Account)
                  </div>
                ) : (
                  <select
                    className="select select-sm w-full font-medium"
                    value={selectedSpId}
                    onChange={(e) => setSelectedSpId(e.target.value)}
                  >
                    <option value="">All Sales Associates (Team View)</option>
                    {salesTeam.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.full_name} ({u.role})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Status Filter */}
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Quotation Status</label>
                <select
                  className="select select-sm w-full"
                  value={spStatus}
                  onChange={(e) => setSpStatus(e.target.value)}
                >
                  <option value="">All Statuses (Closed, Pipeline, Draft, In-Review)</option>
                  <option value="closed">Closed / Won</option>
                  <option value="not_closed">Not Closed (Active Pipeline)</option>
                  <option value="approved">Approved</option>
                  <option value="in_review">In Review</option>
                  <option value="draft">Draft</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>

              {/* Start Date */}
              <div>
                <label className="block text-slate-700 font-semibold mb-1">From Date</label>
                <input
                  type="date"
                  className="input input-sm w-full"
                  value={spStartDate}
                  onChange={(e) => setSpStartDate(e.target.value)}
                />
              </div>

              {/* End Date */}
              <div>
                <label className="block text-slate-700 font-semibold mb-1">To Date</label>
                <input
                  type="date"
                  className="input input-sm w-full"
                  value={spEndDate}
                  onChange={(e) => setSpEndDate(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* KPI Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
            <div className="card p-4 space-y-1.5 bg-white">
              <div className="flex items-center justify-between text-slate-500 text-[11px] font-semibold">
                <span>Total Quotations</span>
                <FileSpreadsheet size={15} className="text-slate-400" />
              </div>
              <div className="text-lg font-bold text-slate-900">
                {activeSummary ? activeSummary.total_quotations : aggregateStats.totalQuotes}
              </div>
              <p className="text-[10px] text-slate-500">
                ₹ {formatCurrency(activeSummary ? activeSummary.total_value : aggregateStats.totalValue)} Total
              </p>
            </div>

            <div className="card p-4 space-y-1.5 bg-emerald-50/60 border border-emerald-200">
              <div className="flex items-center justify-between text-emerald-800 text-[11px] font-semibold">
                <span>Closed / Won Sales</span>
                <CheckCircle2 size={15} className="text-emerald-600" />
              </div>
              <div className="text-lg font-bold text-emerald-900">
                ₹ {formatCurrency(activeSummary ? activeSummary.closed_value : aggregateStats.closedValue)}
              </div>
              <p className="text-[10px] text-emerald-700 font-medium">
                {activeSummary ? activeSummary.closed_quotations : aggregateStats.closedQuotes} closed deals
              </p>
            </div>

            <div className="card p-4 space-y-1.5 bg-blue-50/60 border border-blue-200">
              <div className="flex items-center justify-between text-blue-800 text-[11px] font-semibold">
                <span>Active Pipeline</span>
                <TrendingUp size={15} className="text-blue-600" />
              </div>
              <div className="text-lg font-bold text-blue-900">
                ₹ {formatCurrency(activeSummary ? activeSummary.pipeline_value : aggregateStats.pipelineValue)}
              </div>
              <p className="text-[10px] text-blue-700 font-medium">
                {activeSummary ? activeSummary.pipeline_quotations : 0} proposals active
              </p>
            </div>

            <div className="card p-4 space-y-1.5 bg-amber-50/60 border border-amber-200">
              <div className="flex items-center justify-between text-amber-800 text-[11px] font-semibold">
                <span>Win / Conversion Rate</span>
                <Award size={15} className="text-amber-600" />
              </div>
              <div className="text-lg font-bold text-amber-900">
                {activeSummary
                  ? `${activeSummary.win_rate}%`
                  : aggregateStats.totalQuotes > 0
                  ? `${((aggregateStats.closedQuotes / aggregateStats.totalQuotes) * 100).toFixed(1)}%`
                  : '0%'}
              </div>
              <p className="text-[10px] text-amber-700 font-medium">Closed deals / Total quotes</p>
            </div>

            <div className="card p-4 space-y-1.5 bg-purple-50/60 border border-purple-200">
              <div className="flex items-center justify-between text-purple-800 text-[11px] font-semibold">
                <span>Split Collaboration</span>
                <Users size={15} className="text-purple-600" />
              </div>
              <div className="text-lg font-bold text-purple-900">
                {activeSummary ? activeSummary.assisted_count : 0} Deals
              </div>
              <p className="text-[10px] text-purple-700 font-medium">
                {activeSummary ? `${activeSummary.primary_count} Primary` : 'Multi-associate deals'}
              </p>
            </div>
          </div>

          {/* Export Action Bar for Salesperson Report */}
          <div className="card card-dark p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md border border-slate-700">
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-sm tracking-tight text-white">
                  {isSalesperson
                    ? `Export My Quotation Performance Report (${user?.full_name})`
                    : selectedSpId
                    ? `Export ${salesTeam.find((u) => String(u.id) === String(selectedSpId))?.full_name}'s Quotation Report`
                    : 'Export Sales Team Quotation Performance Report'}
                </span>
                <span className="badge bg-amber-400 text-slate-950 font-bold text-[10px]">
                  {spQuotations.length} Records
                </span>
              </div>
              <p className="text-xs text-slate-200 mt-0.5">
                Download spreadsheet with full salesperson commission credits, assisted splits, payment collections, and status.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  handleDownload(
                    'quotations',
                    'pdf',
                    selectedSpId ? { sales_person_id: selectedSpId, ...(spStatus ? { status: spStatus } : {}) } : undefined
                  )
                }
                disabled={exportingKey !== null}
                className="btn btn-sm bg-rose-600 hover:bg-rose-500 text-white font-bold border-none shadow flex items-center space-x-1.5"
                title="Export quotations register in high-resolution PDF format"
              >
                <Printer size={13} />
                <span>Export PDF (.pdf)</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  handleDownload(
                    'quotations',
                    'xlsx',
                    selectedSpId ? { sales_person_id: selectedSpId, ...(spStatus ? { status: spStatus } : {}) } : undefined
                  )
                }
                disabled={exportingKey !== null}
                className="btn btn-sm bg-emerald-600 hover:bg-emerald-500 text-white font-bold border-none shadow flex items-center space-x-1.5"
              >
                <Download size={13} />
                <span>Export Excel (.xlsx)</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  handleDownload(
                    'quotations',
                    'csv',
                    selectedSpId ? { sales_person_id: selectedSpId, ...(spStatus ? { status: spStatus } : {}) } : undefined
                  )
                }
                disabled={exportingKey !== null}
                className="btn btn-sm bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold border border-slate-700 flex items-center space-x-1.5"
              >
                <Download size={13} />
                <span>Export CSV</span>
              </button>

              {/* Encrypted Export for Salesperson Report (Dropdown for PDF / Excel) */}
              <div className="relative group">
                <button
                  type="button"
                  disabled={exportingKey !== null}
                  className="btn btn-sm bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold border-none shadow flex items-center space-x-1.5"
                  title="Export report with item product names masked with 3-letter encrypted code -AMA and brand hidden"
                >
                  <ShieldAlert size={13} className="text-slate-950" />
                  <span>Encrypted Export</span>
                </button>
                <div className="dropdown-menu absolute right-0 top-full mt-1 hidden group-hover:block z-30 bg-white border border-[#CBD5E1] rounded-md shadow-xl p-1 min-w-[195px] animate-dropdown-open">
                  <button
                    type="button"
                    onClick={() =>
                      handleDownload('quotations', 'pdf', {
                        encrypted: 'true',
                        itemized: 'true',
                        ...(selectedSpId ? { sales_person_id: selectedSpId } : {}),
                        ...(spStatus ? { status: spStatus } : {}),
                      })
                    }
                    className="w-full text-left px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-rose-50 hover:text-rose-700 rounded flex items-center space-x-2"
                  >
                    <Printer size={13} className="text-rose-600" />
                    <span>Encrypted PDF (.pdf)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      handleDownload('quotations', 'xlsx', {
                        encrypted: 'true',
                        itemized: 'true',
                        ...(selectedSpId ? { sales_person_id: selectedSpId } : {}),
                        ...(spStatus ? { status: spStatus } : {}),
                      })
                    }
                    className="w-full text-left px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-emerald-50 hover:text-emerald-700 rounded flex items-center space-x-2"
                  >
                    <Download size={13} className="text-emerald-600" />
                    <span>Encrypted Excel (.xlsx)</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Show Matrix: For Manager/Admin (if no specific selected) OR for Salesperson (showing their own row) */}
          {((!selectedSpId && spSummary.length > 0) || (isSalesperson && spSummary.length > 0)) && (
            <div className="card overflow-hidden">
              <div className="p-3.5 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Award size={15} className="text-slate-700" />
                  <span className="font-bold text-xs text-slate-900 uppercase tracking-wider">
                    {isSalesperson ? 'My Sales Performance Matrix' : 'Sales Associates Performance Matrix'}
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => handleDownload('salespersons', 'pdf')}
                    className="btn btn-secondary btn-xs text-[10px] flex items-center space-x-1 border border-rose-300 text-rose-700 bg-rose-50 hover:bg-rose-100"
                    title="Export Performance Matrix as Landscape PDF"
                  >
                    <Printer size={11} className="text-rose-600" />
                    <span>Download PDF (.pdf)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDownload('salespersons', 'xlsx')}
                    className="btn btn-secondary btn-xs text-[10px] flex items-center space-x-1"
                    title="Download Performance Matrix as Excel Spreadsheet"
                  >
                    <Download size={11} />
                    <span>Download Excel (.xlsx)</span>
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto w-full">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-100/75 text-slate-700 font-semibold text-[11px] uppercase">
                      <th className="py-2.5 px-3">Salesperson</th>
                      <th className="py-2.5 px-3">Role</th>
                      <th className="py-2.5 px-3 text-right">Target (₹)</th>
                      <th className="py-2.5 px-3 text-right">Achieved (%)</th>
                      <th className="py-2.5 px-3 text-center">Quotes</th>
                      <th className="py-2.5 px-3 text-center">Closed</th>
                      <th className="py-2.5 px-3 text-center">Win Rate</th>
                      <th className="py-2.5 px-3 text-right">Closed Revenue</th>
                      <th className="py-2.5 px-3 text-right">Pipeline</th>
                      <th className="py-2.5 px-3 text-right">Total Quoted</th>
                      <th className="py-2.5 px-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {spSummary.map((s) => (
                      <tr
                        key={s.user_id}
                        className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                        onClick={() => setSelectedSpId(String(s.user_id))}
                      >
                        <td className="py-2.5 px-3 font-bold text-slate-900 flex items-center space-x-1.5">
                          <UserCheck size={13} className="text-slate-500" />
                          <span>{s.sales_person_name}</span>
                        </td>
                        <td className="py-2.5 px-3 capitalize text-slate-600 font-medium">{s.role}</td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-700">
                          ₹ {formatCurrency(s.monthly_target)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[11px] ${
                              s.target_achievement_percent >= 100
                                ? 'bg-emerald-100 text-emerald-800'
                                : s.target_achievement_percent >= 50
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {s.target_achievement_percent}%
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center font-bold text-slate-800">{s.total_quotations}</td>
                        <td className="py-2.5 px-3 text-center font-bold text-emerald-700">{s.closed_quotations}</td>
                        <td className="py-2.5 px-3 text-center font-mono font-semibold text-slate-800">
                          {s.win_rate}%
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-emerald-800 tabular-nums">
                          ₹ {formatCurrency(s.closed_value)}
                        </td>
                        <td className="py-2.5 px-3 text-right text-blue-800 font-medium tabular-nums">
                          ₹ {formatCurrency(s.pipeline_value)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-slate-900 tabular-nums">
                          ₹ {formatCurrency(s.total_value)}
                        </td>
                        <td className="py-2.5 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => setSelectedSpId(String(s.user_id))}
                            className="btn btn-secondary btn-xs text-[10px] px-2 py-0.5"
                          >
                            <span>{isSalesperson ? 'My Ledger ↓' : 'View Quotes →'}</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Quotations Register Table for Selected Salesperson */}
          <div className="card overflow-hidden">
            <div className="p-3.5 bg-slate-50/80 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center space-x-2">
                <FileSpreadsheet size={15} className="text-slate-700" />
                <span className="font-bold text-xs text-slate-900 uppercase tracking-wider">
                  {isSalesperson
                    ? `My Active Quotations Ledger (${user?.full_name})`
                    : selectedSpId
                    ? `Quotations Ledger: ${salesTeam.find((u) => String(u.id) === String(selectedSpId))?.full_name}`
                    : 'All Active Quotations Ledger'}
                </span>
                <span className="badge badge-draft text-[10px]">{spQuotations.length} records</span>
              </div>
              {selectedSpId && !isSalesperson && (
                <button
                  type="button"
                  onClick={() => setSelectedSpId('')}
                  className="text-xs text-blue-700 font-semibold hover:underline"
                >
                  ← Show All Sales Associates
                </button>
              )}
            </div>

            <div className="overflow-x-auto w-full">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-100/75 text-slate-700 font-semibold text-[11px] uppercase tracking-wider">
                    <th className="py-3 px-3.5 w-36 font-mono text-left whitespace-nowrap">Quotation #</th>
                    <th className="py-3 px-3 w-28 text-left whitespace-nowrap">Date</th>
                    <th className="py-3 px-3.5 min-w-[160px] text-left">Customer & Mobile</th>
                    <th className="py-3 px-3.5 min-w-[150px] text-left">Sales Associate</th>
                    <th className="py-3 px-2 w-24 text-center whitespace-nowrap">Role</th>
                    <th className="py-3 px-2 w-24 text-center whitespace-nowrap">Status</th>
                    <th className="py-3 px-3 w-28 text-right whitespace-nowrap">Net Total</th>
                    <th className="py-3 px-3 w-32 text-right whitespace-nowrap">Salesperson Credit</th>
                    <th className="py-3 px-3 w-24 text-right whitespace-nowrap">Paid</th>
                    <th className="py-3 px-3 w-28 text-right whitespace-nowrap">Balance Due</th>
                    <th className="py-3 px-4 w-56 text-right whitespace-nowrap">Actions & PDF</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loadingQuotes ? (
                    <tr>
                      <td colSpan={11} className="py-10 text-center text-slate-400">
                        <RefreshCw className="animate-spin inline mr-2 text-slate-600" size={16} />
                        Loading salesperson quotations...
                      </td>
                    </tr>
                  ) : spQuotations.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="py-10 text-center text-slate-400">
                        No quotations match current salesperson and date filters.
                      </td>
                    </tr>
                  ) : (
                    spQuotations.map((q) => {
                      const isAssisted = selectedSpId && String(q.assisted_sales_person_id) === String(selectedSpId);
                      const creditedAmount = isAssisted
                        ? (q.assisted_sales_share_amount || Math.round((q.net_total * (q.assisted_sales_share_percent || 0)) / 100))
                        : (q.primary_sales_share_amount || Math.round((q.net_total * (q.primary_sales_share_percent || 100)) / 100));

                      return (
                        <tr
                          key={q.id}
                          className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                          onClick={() => onSelectQuotation && onSelectQuotation(q.id)}
                        >
                          <td className="py-3 px-3.5 font-mono font-bold text-slate-900 whitespace-nowrap">{q.quotation_number}</td>
                          <td className="py-3 px-3 text-slate-600 font-mono text-xs whitespace-nowrap">
                            {new Date(q.quotation_date).toLocaleDateString('en-GB')}
                          </td>
                          <td className="py-3 px-3.5">
                            <div className="font-semibold text-slate-900 text-xs">{q.customer_name}</div>
                            <div className="text-[11px] text-[#415A77] font-mono font-medium">{q.customer_phone}</div>
                          </td>
                          <td className="py-3 px-3.5">
                            <div className="font-medium text-slate-800 text-xs">{q.sales_person_name}</div>
                            {q.assisted_sales_person_name && (
                              <div className="text-[10px] text-indigo-700 font-semibold font-mono">
                                🤝 +{q.assisted_sales_person_name} ({Number(q.assisted_sales_share_percent || 50).toFixed(0)}%)
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-2 text-center whitespace-nowrap">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                                isAssisted
                                  ? 'bg-purple-100 text-purple-800 border border-purple-200'
                                  : 'bg-blue-100 text-blue-800 border border-blue-200'
                              }`}
                            >
                              {isAssisted ? 'Assisted' : 'Primary'}
                            </span>
                          </td>
                          <td className="py-3 px-2 text-center whitespace-nowrap">
                            <span className={`badge badge-${q.status}`}>{q.status ? q.status.replace('_', ' ') : ''}</span>
                          </td>
                          <td className="py-3 px-3 text-right font-bold text-slate-900 tabular-nums whitespace-nowrap">
                            ₹ {formatCurrency(q.net_total)}
                          </td>
                          <td className="py-3 px-3 text-right font-bold text-emerald-800 font-mono tabular-nums whitespace-nowrap">
                            ₹ {formatCurrency(creditedAmount)}
                          </td>
                          <td className="py-3 px-3 text-right text-emerald-700 font-semibold tabular-nums whitespace-nowrap">
                            ₹ {formatCurrency(q.total_paid || 0)}
                          </td>
                          <td className="py-3 px-3 text-right text-amber-700 font-semibold tabular-nums whitespace-nowrap">
                            ₹ {formatCurrency(q.balance_due || 0)}
                          </td>
                          <td className="py-3 px-4 text-right align-middle whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                            <div className="inline-flex items-center justify-end space-x-1.5 whitespace-nowrap">
                              {/* Standard PDF */}
                              <button
                                type="button"
                                onClick={() => handleOpenPdf(q, false)}
                                title="Export Standard PDF with tile & brand names"
                                className="btn btn-secondary btn-xs px-2 py-0.5 text-[10px] font-semibold text-[#1B263B] border border-slate-300 shadow-2xs"
                              >
                                <Printer size={11} className="mr-0.5 text-[#415A77]" />
                                <span>PDF</span>
                              </button>

                              {/* Encrypted PDF */}
                              <button
                                type="button"
                                onClick={() => handleOpenPdf(q, true)}
                                title="Export Encrypted PDF: Brand removed, Product name replaced with random code (e.g. HSDS-AMA)"
                                className="btn btn-xs px-2 py-0.5 text-[10px] font-semibold bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300/80 shadow-2xs"
                              >
                                <ShieldAlert size={11} className="mr-0.5 text-amber-600" />
                                <span>Encrypted</span>
                              </button>

                              {/* View Details */}
                              {onSelectQuotation && (
                                <button
                                  type="button"
                                  onClick={() => onSelectQuotation(q.id)}
                                  title="View Quotation Details"
                                  className="p-1.5 rounded-md text-[#415A77] hover:text-[#0D1B2A] hover:bg-white/80 border border-transparent hover:border-slate-200 transition-colors"
                                >
                                  <Eye size={13} />
                                </button>
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
        </div>
      )}

      {/* TAB 2: QUOTATIONS REGISTER EXPORT */}
      {activeTab === 'quotations' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
          <div className="card p-5 space-y-4">
            <div className="flex items-center space-x-2.5 pb-2 border-b border-slate-200">
              <div className="p-2 bg-blue-50 text-primary-900 rounded border border-blue-200">
                <FileSpreadsheet size={20} />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-900">Quotations Register Export</h2>
                <p className="text-[11px] text-slate-500">
                  Customer quotations, area totals, taxes, and salesperson share allocations
                </p>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              {/* Sales Associate Filter */}
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Filter by Sales Associate</label>
                {isSalesperson ? (
                  <div className="input input-sm w-full bg-slate-100 text-slate-800 font-bold flex items-center cursor-not-allowed select-none">
                    {user?.full_name} (Restricted to My Account)
                  </div>
                ) : (
                  <select
                    className="select select-sm w-full"
                    value={qSalespersonId}
                    onChange={(e) => setQSalespersonId(e.target.value)}
                  >
                    <option value="">All Sales Associates</option>
                    {salesTeam.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.full_name} ({u.role})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Status Filter */}
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Filter by Status</label>
                <select className="select select-sm w-full" value={qStatus} onChange={(e) => setQStatus(e.target.value)}>
                  <option value="">All Statuses (Draft, In-Review, Approved, Closed, Rejected)</option>
                  <option value="draft">Draft</option>
                  <option value="in_review">In-Review</option>
                  <option value="approved">Approved</option>
                  <option value="closed">Closed / Paid</option>
                  <option value="not_closed">Not Closed (Active Pipeline)</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">From Date</label>
                  <input
                    type="date"
                    className="input input-sm w-full"
                    value={qStartDate}
                    onChange={(e) => setQStartDate(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">To Date</label>
                  <input
                    type="date"
                    className="input input-sm w-full"
                    value={qEndDate}
                    onChange={(e) => setQEndDate(e.target.value)}
                  />
                </div>
              </div>

              {/* Export Mode: Standard vs Encrypted */}
              <div className="p-3 bg-slate-900 text-white rounded-lg border border-slate-700 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-xs text-white flex items-center space-x-1.5">
                    <ShieldAlert size={14} className="text-amber-400" />
                    <span>Export Product Mode</span>
                  </span>
                  <div className="flex items-center bg-slate-800 p-0.5 rounded text-[11px]">
                    <button
                      type="button"
                      onClick={() => setQExportMode('standard')}
                      className={`px-2 py-0.5 rounded ${
                        qExportMode === 'standard' ? 'bg-white text-slate-900 font-bold' : 'text-slate-300'
                      }`}
                    >
                      Standard
                    </button>
                    <button
                      type="button"
                      onClick={() => setQExportMode('encrypted')}
                      className={`px-2 py-0.5 rounded ${
                        qExportMode === 'encrypted' ? 'bg-amber-400 text-slate-950 font-bold' : 'text-slate-300'
                      }`}
                    >
                      Encrypted (-AMA)
                    </button>
                  </div>
                </div>
                <p className="text-[11px] text-slate-300">
                  {qExportMode === 'encrypted'
                    ? 'Encrypted mode masks product descriptions with random uppercase codes ending with -AMA (e.g. HSDS-AMA) and hides tile brands.'
                    : 'Standard mode exports with original brand names and full surface tile descriptions.'}
                </p>
                <label className="flex items-center space-x-2 text-[11px] text-slate-200 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={qItemized}
                    onChange={(e) => setQItemized(e.target.checked)}
                    className="checkbox checkbox-xs"
                  />
                  <span>Itemized Materials & Slabs Export (1 row per tile line item)</span>
                </label>
              </div>

              <div className="flex space-x-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => handleDownload('quotations', 'pdf')}
                  disabled={exportingKey !== null}
                  className={`btn btn-sm bg-rose-600 hover:bg-rose-500 text-white font-bold border-none shadow flex-1 flex items-center justify-center space-x-1.5 ${
                    exportingKey === 'quotations-pdf' ? 'btn-exporting' : ''
                  }`}
                  title="Download publication-quality PDF report (landscape layout with company branding and summary)"
                >
                  <Printer size={13} className={exportingKey === 'quotations-pdf' ? 'animate-bounce' : ''} />
                  <span>Download PDF (.pdf)</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDownload('quotations', 'xlsx')}
                  disabled={exportingKey !== null}
                  className={`btn btn-primary btn-sm flex-1 flex items-center justify-center space-x-1 ${
                    exportingKey === 'quotations-xlsx' ? 'btn-exporting' : ''
                  }`}
                >
                  <Download size={13} className={exportingKey === 'quotations-xlsx' ? 'animate-bounce' : ''} />
                  <span>Download Excel (.xlsx)</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDownload('quotations', 'csv')}
                  disabled={exportingKey !== null}
                  className={`btn btn-secondary btn-sm flex-1 flex items-center justify-center space-x-1 ${
                    exportingKey === 'quotations-csv' ? 'btn-exporting' : ''
                  }`}
                >
                  <Download size={13} className={exportingKey === 'quotations-csv' ? 'animate-bounce' : ''} />
                  <span>Download CSV</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: PAYMENTS REGISTER */}
      {activeTab === 'payments' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
          <div className="card p-5 space-y-4">
            <div className="flex items-center space-x-2.5 pb-2 border-b border-slate-200">
              <div className="p-2 bg-emerald-50 text-emerald-700 rounded border border-emerald-200">
                <BarChart3 size={20} />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-900">Collections & Receipts Register</h2>
                <p className="text-[11px] text-slate-500">
                  Detailed payment log with transaction IDs, cheque/NEFT refs & payment modes
                </p>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">From Date</label>
                  <input
                    type="date"
                    className="input input-sm w-full"
                    value={pStartDate}
                    onChange={(e) => setPStartDate(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">To Date</label>
                  <input
                    type="date"
                    className="input input-sm w-full"
                    value={pEndDate}
                    onChange={(e) => setPEndDate(e.target.value)}
                  />
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded border border-slate-200 text-slate-600 text-[11px] space-y-1">
                <div className="flex items-center space-x-1.5 text-emerald-700 font-semibold">
                  <CheckCircle2 size={13} />
                  <span>Audited Transaction Integrity</span>
                </div>
                <p>Includes receipt number, client, cheque/NEFT ref, amount, and clearing status.</p>
              </div>

              <div className="flex space-x-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => handleDownload('payments', 'pdf')}
                  disabled={exportingKey !== null}
                  className={`btn btn-sm bg-rose-600 hover:bg-rose-500 text-white font-bold border-none shadow flex-1 flex items-center justify-center space-x-1.5 ${
                    exportingKey === 'payments-pdf' ? 'btn-exporting' : ''
                  }`}
                  title="Download Collections & Payments Register in PDF format"
                >
                  <Printer size={13} className={exportingKey === 'payments-pdf' ? 'animate-bounce' : ''} />
                  <span>Download PDF (.pdf)</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDownload('payments', 'xlsx')}
                  disabled={exportingKey !== null}
                  className={`btn btn-primary btn-sm flex-1 flex items-center justify-center space-x-1 ${
                    exportingKey === 'payments-xlsx' ? 'btn-exporting' : ''
                  }`}
                >
                  <Download size={13} className={exportingKey === 'payments-xlsx' ? 'animate-bounce' : ''} />
                  <span>Download Excel (.xlsx)</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDownload('payments', 'csv')}
                  disabled={exportingKey !== null}
                  className={`btn btn-secondary btn-sm flex-1 flex items-center justify-center space-x-1 ${
                    exportingKey === 'payments-csv' ? 'btn-exporting' : ''
                  }`}
                >
                  <Download size={13} className={exportingKey === 'payments-csv' ? 'animate-bounce' : ''} />
                  <span>Download CSV</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PDF Preview Modal */}
      {previewPdf && (
        <PdfPreviewModal
          isOpen={Boolean(previewPdf)}
          pdfUrl={previewPdf.url}
          title={previewPdf.title}
          fileName={previewPdf.fileName}
          quotationId={previewPdf.quotationId}
          initialEncrypted={previewPdf.initialEncrypted}
          onClose={() => setPreviewPdf(null)}
        />
      )}
    </div>
  );
};
