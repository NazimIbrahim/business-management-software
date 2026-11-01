import React, { useState, useEffect } from 'react';
import { useServer } from '../context/ServerContext';
import { useAuth } from '../context/AuthContext';
import { User, Quotation, Pagination } from '../types';
import {
  Users,
  UserPlus,
  Target,
  FileText,
  CreditCard,
  TrendingUp,
  Search,
  Filter,
  Eye,
  Printer,
  Edit,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  X,
  Phone,
  Mail,
  Award,
  AlertCircle,
  CheckCircle,
  Plus,
  ShieldAlert,
  Download,
  FileSpreadsheet,
  Trash2,
  Truck,
} from 'lucide-react';
import { PdfPreviewModal } from '../components/PdfPreviewModal';

interface Props {
  onSelectQuotation: (id: number) => void;
  onEditQuotation: (id: number, type?: 'tiles' | 'sanitary') => void;
  onCreateQuotation: () => void;
}

export const SalespersonDashboard: React.FC<Props> = ({
  onSelectQuotation,
  onEditQuotation,
  onCreateQuotation,
}) => {
  const { serverUrl, fetchApi, getPdfUrl, subscribeToEvents } = useServer();
  const { user } = useAuth();

  // Salespersons list
  const [salespersons, setSalespersons] = useState<User[]>([]);
  const [selectedSalespersonId, setSelectedSalespersonId] = useState<number | null>(null);

  // Salesperson stats
  const [salespersonStats, setSalespersonStats] = useState<any>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  // Quotations for selected salesperson
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 15, total: 0, totalPages: 1 });
  const [summary, setSummary] = useState<{ totalQuotations: number; totalAmount: number }>({
    totalQuotations: 0,
    totalAmount: 0,
  });
  const [quotationsLoading, setQuotationsLoading] = useState(false);

  // Filters for quotations
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  // Add Salesperson Modal State
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [newFullName, setNewFullName] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newTarget, setNewTarget] = useState('500000');
  const [newRole, setNewRole] = useState<'salesperson' | 'manager'>('salesperson');
  const [creatingUser, setCreatingUser] = useState(false);
  const [userError, setUserError] = useState<string | null>(null);
  const [userSuccess, setUserSuccess] = useState<string | null>(null);

  // PDF Preview State
  const [previewPdf, setPreviewPdf] = useState<{
    url: string;
    title: string;
    fileName: string;
    quotationId?: number;
    initialEncrypted?: boolean;
  } | null>(null);

  // Debounce search
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(handler);
  }, [search]);

  // Load Salespersons
  const loadSalespersons = async () => {
    try {
      const res = await fetchApi('/api/users');
      const allUsers: User[] = res.users || [];
      const team = allUsers.filter((u) => ['salesperson', 'manager', 'admin'].includes(u.role) && u.is_active);
      setSalespersons(team);

      // Auto-select logged in user if salesperson, or first in list
      if (user?.role?.toLowerCase() === 'salesperson') {
        setSelectedSalespersonId(user.id);
      } else if (selectedSalespersonId === null && team.length > 0) {
        // If admin or manager, select first salesperson or keep all
        const firstSp = team.find((t) => t.role === 'salesperson') || team[0];
        setSelectedSalespersonId(firstSp.id);
      }
    } catch (err) {
      console.error('Failed to load sales team:', err);
    }
  };

  useEffect(() => {
    loadSalespersons();
  }, []);

  // Load Stats for Selected Salesperson
  const loadSalespersonStats = async () => {
    if (!selectedSalespersonId) {
      setSalespersonStats(null);
      return;
    }
    setStatsLoading(true);
    try {
      const res = await fetchApi(`/api/users/${selectedSalespersonId}/stats`);
      setSalespersonStats(res);
    } catch (err) {
      console.error('Failed to load salesperson stats:', err);
    } finally {
      setStatsLoading(false);
    }
  };

  useEffect(() => {
    loadSalespersonStats();
  }, [selectedSalespersonId]);

  // Load Quotations for Selected Salesperson
  const loadQuotations = async () => {
    setQuotationsLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '15',
      });
      if (user?.role?.toLowerCase() === 'salesperson') {
        params.append('sales_person_id', String(user.id));
      } else if (selectedSalespersonId) {
        params.append('sales_person_id', String(selectedSalespersonId));
      }
      if (debouncedSearch) params.append('search', debouncedSearch);
      if (status) params.append('status', status);

      const res = await fetchApi<any>(`/api/quotations?${params.toString()}`);
      setQuotations(res.quotations || []);
      setPagination(res.pagination || { page: 1, limit: 15, total: 0, totalPages: 1 });
      setSummary(res.summary || { totalQuotations: 0, totalAmount: 0 });
    } catch (err) {
      console.error('Failed to load salesperson quotations:', err);
    } finally {
      setQuotationsLoading(false);
    }
  };

  useEffect(() => {
    loadQuotations();
  }, [selectedSalespersonId, page, debouncedSearch, status]);

  // Real-time synchronization
  useEffect(() => {
    const unsubscribe = subscribeToEvents((event) => {
      if (
        ['QUOTATION_CREATED', 'QUOTATION_UPDATED', 'QUOTATION_STATUS_CHANGED', 'PAYMENT_RECORDED', 'USER_CREATED'].includes(
          event.type
        )
      ) {
        loadSalespersonStats();
        loadQuotations();
        if (event.type === 'USER_CREATED') {
          loadSalespersons();
        }
      } else if (event.type === 'DISPATCH_UPDATED') {
        loadSalespersonStats();
        loadQuotations();
        const isUserRelevant =
          ['admin', 'manager'].includes(user?.role || '') ||
          (user?.role === 'salesperson' &&
            (event.payload?.sales_person_id === user?.id ||
              event.payload?.sales_person_name === user?.full_name));

        if (isUserRelevant) {
          setDispatchAlert(event.payload);
        }
      }
    });
    return () => unsubscribe();
  }, [selectedSalespersonId, page, debouncedSearch, status]);

  const handleCreateSalesperson = async (e: React.FormEvent) => {
    e.preventDefault();
    setUserError(null);
    setUserSuccess(null);

    if (!newFullName.trim() || !newUsername.trim() || !newPassword.trim()) {
      setUserError('Full Name, Username, and Password are required.');
      return;
    }

    setCreatingUser(true);
    try {
      const res = await fetchApi('/api/users', {
        method: 'POST',
        body: JSON.stringify({
          full_name: newFullName.trim(),
          username: newUsername.trim(),
          password: newPassword.trim(),
          phone: newPhone.trim(),
          email: newEmail.trim(),
          role: newRole,
          monthly_target: parseFloat(newTarget) || 0,
        }),
      });

      setUserSuccess(`Salesperson ${res.user.full_name} registered successfully!`);
      setTimeout(() => {
        setAddModalOpen(false);
        setUserSuccess(null);
      }, 1500);

      setNewFullName('');
      setNewUsername('');
      setNewPassword('');
      setNewPhone('');
      setNewEmail('');
      setNewTarget('500000');

      await loadSalespersons();
      setSelectedSalespersonId(res.user.id);
    } catch (err: any) {
      setUserError(err.message || 'Failed to add salesperson');
    } finally {
      setCreatingUser(false);
    }
  };

  // Export State
  const [exportingFormat, setExportingFormat] = useState<'xlsx' | 'csv' | 'pdf' | null>(null);

  // Dispatch Update Real-Time Alert
  const [dispatchAlert, setDispatchAlert] = useState<{
    quotation_id: number;
    quotation_number: string;
    customer_name?: string;
    sales_person_name?: string;
    dispatch_status?: string;
    expected_dispatch_date?: string;
    updated_by?: string;
  } | null>(null);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);

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

  const handleExportList = async (format: 'xlsx' | 'csv' | 'pdf') => {
    setExportingFormat(format);
    try {
      const params = new URLSearchParams({ format });
      if (user?.role?.toLowerCase() === 'salesperson') {
        params.append('sales_person_id', String(user.id));
      } else if (selectedSalespersonId) {
        params.append('sales_person_id', String(selectedSalespersonId));
      }
      if (debouncedSearch) params.append('search', debouncedSearch);
      if (status) params.append('status', status);

      const token = localStorage.getItem('ama_token');
      if (token) params.append('token', token);

      const downloadUrl = `${serverUrl}/api/reports/quotations/export?${params.toString()}`;
      const spName = selectedUser ? `_${selectedUser.full_name.replace(/\s+/g, '_')}` : '';
      const statusLabel = status ? `_${status}` : '';
      const filename = `Quotations${spName}${statusLabel}_${new Date().toISOString().split('T')[0]}.${format}`;

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
      minimumFractionDigits: 0,
    });
  };

  const selectedUser = salespersons.find((s) => s.id === selectedSalespersonId);
  const canAddSalesperson = ['admin', 'manager', 'accounts', 'accountant'].includes(user?.role || '');
  const isAdminOrAccountant = ['admin', 'accounts', 'accountant'].includes(user?.role || '');

  const handleDeleteSelectedSalesperson = async () => {
    if (!isAdminOrAccountant || !selectedUser) return;
    if (selectedUser.id === user?.id) {
      alert('You cannot delete your own account.');
      return;
    }
    if (
      !confirm(
        `Are you sure you want to delete salesperson "${selectedUser.full_name}" (@${selectedUser.username})?`
      )
    )
      return;

    try {
      await fetchApi(`/api/users/${selectedUser.id}`, { method: 'DELETE' });
      alert(`Salesperson ${selectedUser.full_name} deleted successfully.`);
      setSelectedSalespersonId(null);
      await loadSalespersons();
    } catch (err: any) {
      alert(err.message || 'Failed to delete salesperson');
    }
  };

  const handleRemoveAllSalespersons = async () => {
    if (!isAdminOrAccountant) return;
    const count = salespersons.filter((s) => s.role === 'salesperson' && s.id !== user?.id).length;
    if (count === 0) {
      alert('No other salesperson accounts found to remove.');
      return;
    }
    if (
      window.confirm(
        `Are you sure you want to remove ALL ${count} salesperson accounts from the system?\n\nThis will remove their profile logins (your admin account will remain safe). This action cannot be undone.`
      )
    ) {
      try {
        await fetchApi('/api/users/all-salespersons', { method: 'DELETE' });
        alert('All salesperson accounts removed successfully.');
        setSelectedSalespersonId(user?.id || null);
        await loadSalespersons();
      } catch (err: any) {
        alert(err.message || 'Failed to remove all salespersons');
      }
    }
  };

  const statusChips = [
    { id: '', label: 'All Quotations' },
    { id: 'closed', label: 'Closed Quotations' },
    { id: 'not_closed', label: 'Not Closed (Active Pipeline)' },
    { id: 'approved', label: 'Approved' },
    { id: 'in_review', label: 'In Review' },
    { id: 'draft', label: 'Draft' },
    { id: 'rejected', label: 'Rejected' },
  ];

  return (
    <div className="flex-1 p-4 sm:p-5 lg:p-6 space-y-4 lg:space-y-5 overflow-y-auto w-full min-w-0">
      {/* Top Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            Salesperson Performance Dashboard
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Individual sales associate pipelines, target tracking, and quotation analytics
          </p>
        </div>

        <div className="flex items-center space-x-2">
          {canAddSalesperson && (
            <button
              onClick={() => setAddModalOpen(true)}
              className="btn btn-primary btn-sm"
            >
              <UserPlus size={13} />
              <span>+ Add Sales Person</span>
            </button>
          )}

          {isAdminOrAccountant && selectedUser && selectedUser.role === 'salesperson' && selectedUser.id !== user?.id && (
            <button
              onClick={handleDeleteSelectedSalesperson}
              className="btn btn-secondary btn-sm text-rose-600 hover:text-rose-700 hover:bg-rose-50 border-rose-200"
              title="Delete currently selected salesperson account"
            >
              <Trash2 size={13} className="text-rose-600" />
              <span>Remove {selectedUser.full_name.split(' ')[0]}</span>
            </button>
          )}

          {isAdminOrAccountant && salespersons.some((s) => s.role === 'salesperson' && s.id !== user?.id) && (
            <button
              onClick={handleRemoveAllSalespersons}
              className="btn btn-secondary btn-sm text-rose-600 hover:text-rose-700 hover:bg-rose-50 border-rose-200"
              title="Remove all salesperson accounts from the system"
            >
              <Trash2 size={13} className="text-rose-600" />
              <span>Remove All Sales Persons</span>
            </button>
          )}

          <button
            onClick={onCreateQuotation}
            className="btn btn-secondary btn-sm"
          >
            <Plus size={13} />
            <span>New Quotation</span>
          </button>
        </div>
      </div>

      {/* Real-time Dispatch Update Popup Banner */}
      {dispatchAlert && (
        <div className="bg-gradient-to-r from-slate-900 to-indigo-950 text-white p-3.5 sm:p-4 rounded-xl shadow-lg border border-teal-500/40 flex items-start sm:items-center justify-between gap-3 animate-fade-in">
          <div className="flex items-start sm:items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-teal-500/20 text-teal-300 border border-teal-400/30 flex items-center justify-center shrink-0 mt-0.5 sm:mt-0">
              <Truck size={17} />
            </div>
            <div>
              <div className="text-xs font-bold text-white flex flex-wrap items-center gap-2">
                <span>Dispatch Status Updated</span>
                <span className="px-2 py-0.2 rounded-full text-[10px] font-extrabold bg-teal-400/20 text-teal-200 border border-teal-400/30">
                  {dispatchAlert.dispatch_status || 'Ready Stock'}
                </span>
                {dispatchAlert.updated_by && (
                  <span className="text-[10px] text-slate-400 font-normal">
                    by {dispatchAlert.updated_by}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-300 mt-0.5">
                Quotation <strong className="text-white">{dispatchAlert.quotation_number}</strong>
                {dispatchAlert.customer_name ? ` for ${dispatchAlert.customer_name}` : ''} — Expected Dispatch Date:{' '}
                <strong className="text-teal-300 font-mono">
                  {dispatchAlert.expected_dispatch_date
                    ? new Date(dispatchAlert.expected_dispatch_date).toLocaleDateString('en-GB')
                    : 'Not Specified'}
                </strong>
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 shrink-0 self-start sm:self-auto">
            <button
              onClick={() => onSelectQuotation(dispatchAlert.quotation_id)}
              className="btn btn-xs bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold px-3 py-1.5 rounded-lg border-none shadow-xs cursor-pointer"
            >
              View Order
            </button>
            <button
              onClick={() => setDispatchAlert(null)}
              className="text-slate-400 hover:text-white p-1 rounded-md cursor-pointer"
              title="Dismiss alert"
            >
              <X size={15} />
            </button>
          </div>
        </div>
      )}

      {/* Sales Team Quick Selector Bar */}
      <div className="card p-3">
        <div className="flex items-center justify-between mb-2 pb-2 border-b border-slate-100">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center space-x-1.5">
            <Users size={13} className="text-slate-600" />
            <span>Filter by Sales Associate</span>
          </span>

          {selectedUser && (
            <div className="flex items-center space-x-3 text-xs text-slate-600">
              {selectedUser.phone && (
                <span className="flex items-center space-x-1 font-mono text-[11px]">
                  <Phone size={11} className="text-slate-400" />
                  <span>{selectedUser.phone}</span>
                </span>
              )}
              {selectedUser.email && (
                <span className="flex items-center space-x-1 text-[11px]">
                  <Mail size={11} className="text-slate-400" />
                  <span>{selectedUser.email}</span>
                </span>
              )}
              <span className="badge badge-draft font-mono">Role: {selectedUser.role}</span>
            </div>
          )}
        </div>

        {/* Team Chips */}
        <div className="flex items-center space-x-2 overflow-x-auto pb-1">
          {user?.role?.toLowerCase() !== 'salesperson' && (
            <button
              onClick={() => {
                setSelectedSalespersonId(null);
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
                selectedSalespersonId === null
                  ? 'bg-slate-900 text-white font-semibold shadow-sm'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              All Sales Team
            </button>
          )}

          {salespersons
            .filter((sp) => (user?.role?.toLowerCase() === 'salesperson' ? sp.id === user.id : true))
            .map((sp) => {
              const isSelected = selectedSalespersonId === sp.id;
              return (
                <button
                  key={sp.id}
                  onClick={() => {
                    setSelectedSalespersonId(sp.id);
                    setPage(1);
                  }}
                  className={`flex items-center space-x-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
                    isSelected
                      ? 'bg-slate-900 text-white font-semibold shadow-sm'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                      isSelected ? 'bg-white text-slate-900' : 'bg-slate-300 text-slate-700'
                    }`}
                  >
                    {sp.full_name.charAt(0).toUpperCase()}
                  </div>
                  <span>{sp.full_name}</span>
                  {sp.monthly_target && sp.monthly_target > 0 && (
                    <span
                      className={`text-[10px] font-mono tabular-nums ${
                        isSelected ? 'text-slate-300' : 'text-slate-500'
                      }`}
                    >
                      (₹{formatCurrency(sp.monthly_target)})
                    </span>
                  )}
                </button>
              );
            })}
        </div>
      </div>

      {/* KPI Performance Cards for Selected Salesperson */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Sales Target & Achievement Card */}
        <div className="card p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Monthly Target vs Actual
              </span>
              <Target size={15} className="text-blue-600" />
            </div>

            <div className="flex items-baseline space-x-2 mt-2">
              <span className="text-xl font-bold text-slate-900 tabular-nums">
                ₹ {formatCurrency(salespersonStats?.metrics?.approvedRevenue || 0)}
              </span>
              <span className="text-xs text-slate-400 font-mono tabular-nums">
                / ₹ {formatCurrency(salespersonStats?.metrics?.target || selectedUser?.monthly_target || 0)}
              </span>
            </div>

            {/* Achievement progress bar */}
            <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden mt-2.5 border border-slate-200">
              <div
                className="bg-blue-600 h-full transition-all"
                style={{
                  width: `${Math.min(100, salespersonStats?.metrics?.targetPercent || 0)}%`,
                }}
              />
            </div>

            {/* Pipeline subline */}
            {Boolean(salespersonStats?.metrics?.pipelineRevenue) && (
              <div className="mt-2 text-[10px] text-amber-700 bg-amber-50/80 px-2 py-0.5 rounded border border-amber-200/80 flex items-center justify-between">
                <span>Active Pipeline:</span>
                <span className="font-bold font-mono">
                  ₹ {formatCurrency(salespersonStats?.metrics?.pipelineRevenue || 0)}
                </span>
              </div>
            )}
          </div>

          <div className="flex justify-between items-center text-[11px] mt-2.5 pt-2 border-t border-slate-100">
            <span className="text-slate-500">Target Progress</span>
            <span className="font-bold text-blue-700 tabular-nums font-mono">
              {salespersonStats?.metrics?.targetPercent || 0}% Achieved
            </span>
          </div>
        </div>

        {/* Total Quotes Issued */}
        <div className="card p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Total Quotations Issued
              </span>
              <FileText size={15} className="text-slate-700" />
            </div>

            <div className="text-xl font-bold text-slate-900 tabular-nums mt-2">
              {salespersonStats?.metrics?.totalQuotes || summary.totalQuotations} Quotes
            </div>
            <div className="text-xs text-slate-500 mt-1 tabular-nums">
              Total Quoted Value: ₹ {formatCurrency(salespersonStats?.metrics?.totalQuoted || summary.totalAmount)}
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5 text-[10px] mt-3 pt-2 border-t border-slate-100">
            <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 font-semibold border border-emerald-200">
              {salespersonStats?.metrics?.statusMap?.['approved']?.count || 0} Approved
            </span>
            <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-800 font-semibold border border-blue-200">
              {salespersonStats?.metrics?.statusMap?.['closed']?.count || 0} Closed
            </span>
            <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 font-semibold border border-amber-200">
              {salespersonStats?.metrics?.statusMap?.['in_review']?.count || 0} Review
            </span>
            <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold border border-slate-200">
              {salespersonStats?.metrics?.statusMap?.['draft']?.count || 0} Draft
            </span>
            {Boolean(salespersonStats?.metrics?.statusMap?.['rejected']?.count) && (
              <span className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-800 font-semibold border border-rose-200">
                {salespersonStats?.metrics?.statusMap?.['rejected']?.count} Rejected
              </span>
            )}
          </div>
        </div>

        {/* Collections on Orders */}
        <div className="card p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Collections Realized
              </span>
              <CreditCard size={15} className="text-emerald-600" />
            </div>

            <div className="text-xl font-bold text-emerald-700 tabular-nums mt-2">
              ₹ {formatCurrency(salespersonStats?.metrics?.totalCollected || 0)}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              Advance & settlement payments cleared
            </div>
          </div>

          <div className="text-[11px] text-emerald-700 font-medium mt-3 pt-2 border-t border-slate-100 flex items-center space-x-1">
            <CheckCircle size={12} />
            <span>Cleared through Bank/UPI/Cheque</span>
          </div>
        </div>

        {/* Outstanding Receivables */}
        <div className="card p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Pending Balance Due
              </span>
              <TrendingUp size={15} className="text-amber-600" />
            </div>

            <div className="text-xl font-bold text-amber-800 tabular-nums mt-2">
              ₹ {formatCurrency(salespersonStats?.metrics?.outstanding || 0)}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              To be collected before dispatch
            </div>
          </div>

          <div className="text-[11px] text-amber-700 font-medium mt-3 pt-2 border-t border-slate-100">
            On Approved & Active Quotes
          </div>
        </div>
      </div>

      {/* Filter and Search Bar for Salesperson's Quotes */}
      <div className="card p-3 space-y-2.5">
        <div className="flex items-center space-x-3">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              className="input input-sm pl-8 pr-8"
              placeholder={`Search ${selectedUser ? selectedUser.full_name + "'s" : "all"} quotations by reference, customer name, mobile...`}
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

          <button
            onClick={() => {
              loadSalespersonStats();
              loadQuotations();
            }}
            className="btn btn-secondary btn-sm"
            title="Refresh list"
          >
            <RefreshCw size={12} className={quotationsLoading ? 'animate-spin' : ''} />
            <span>Refresh</span>
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
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all cursor-pointer ${
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

      {/* Filtered Quotations Table */}
      <div className="card overflow-hidden">
        <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex justify-between items-center">
          <span className="text-xs font-bold text-slate-800 uppercase tracking-wide">
            {selectedUser ? `${selectedUser.full_name}'s Quotations` : 'All Salesperson Quotations'} (
            {pagination.total} records)
          </span>
          <div className="flex items-center space-x-3">
            <span className="text-xs text-slate-500 tabular-nums">
              Total Quoted: ₹ {formatCurrency(summary.totalAmount)}
            </span>

            {/* Export Table Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setExportMenuOpen(!exportMenuOpen)}
                disabled={exportingFormat !== null}
                className="btn btn-secondary btn-sm flex items-center space-x-1.5 text-xs py-1 px-2.5"
                title="Export closed, not-closed, or filtered quotations to Excel / CSV"
              >
                {exportingFormat ? (
                  <RefreshCw size={12} className="animate-spin text-slate-700" />
                ) : (
                  <Download size={12} className="text-slate-700" />
                )}
                <span>{exportingFormat ? `Exporting ${exportingFormat.toUpperCase()}...` : 'Export'}</span>
              </button>

              {exportMenuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-20"
                    onClick={() => setExportMenuOpen(false)}
                  />
                  <div className="absolute right-0 mt-1 w-48 bg-white rounded-md shadow-lg border border-slate-200 py-1 z-30 text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        setExportMenuOpen(false);
                        handleExportList('pdf');
                      }}
                      className="w-full text-left px-3 py-2 text-slate-800 hover:bg-rose-50 hover:text-rose-700 flex items-center space-x-2 font-medium"
                    >
                      <Printer size={14} className="text-rose-600" />
                      <span>Export to PDF (.pdf)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setExportMenuOpen(false);
                        handleExportList('xlsx');
                      }}
                      className="w-full text-left px-3 py-2 text-slate-700 hover:bg-slate-100 flex items-center space-x-2"
                    >
                      <FileSpreadsheet size={14} className="text-emerald-600" />
                      <span>Export to Excel (.xlsx)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setExportMenuOpen(false);
                        handleExportList('csv');
                      }}
                      className="w-full text-left px-3 py-2 text-slate-700 hover:bg-slate-100 flex items-center space-x-2"
                    >
                      <FileText size={14} className="text-blue-600" />
                      <span>Export to CSV (.csv)</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#E0E1DD] bg-[#F8F9FA] text-[#415A77] font-semibold text-[11px]">
                <th className="py-2.5 px-3 whitespace-nowrap">Quotation Ref</th>
                <th className="py-2.5 px-3 whitespace-nowrap">Date</th>
                <th className="py-2.5 px-3">Customer Profile</th>
                <th className="py-2.5 px-3">Project</th>
                <th className="py-2.5 px-3">Sales Associate</th>
                <th className="py-2.5 px-3 whitespace-nowrap">Status</th>
                <th className="py-2.5 px-3 text-right whitespace-nowrap">Net Total</th>
                <th className="py-2.5 px-3 text-right whitespace-nowrap">Collected</th>
                <th className="py-2.5 px-3 text-right whitespace-nowrap">Balance Due</th>
                <th className="py-2.5 px-3 text-center whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E0E1DD]/60">
              {quotationsLoading && quotations.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400">
                    <RefreshCw className="animate-spin inline mr-2 text-slate-600" size={16} />
                    Loading quotations...
                  </td>
                </tr>
              ) : quotations.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400">
                    No quotations found for this salesperson under selected filters.
                  </td>
                </tr>
              ) : (
                quotations.map((q) => (
                  <tr
                    key={q.id}
                    onClick={() => onSelectQuotation(q.id)}
                    className="hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    <td className="py-2.5 px-3 font-mono font-semibold text-[#0D1B2A] whitespace-nowrap align-middle">
                      <div className="flex items-center space-x-1.5">
                        <span>{q.quotation_number}</span>
                        {q.quotation_type === 'sanitary' ? (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-teal-100 text-teal-800 border border-teal-300 font-sans">
                            🚿 Sanitary
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-blue-100 text-blue-800 border border-blue-300 font-sans">
                            🧱 Tile
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap align-middle">
                      {new Date(q.quotation_date).toLocaleDateString('en-GB')}
                    </td>
                    <td className="py-2.5 px-3 align-middle">
                      <div className="font-semibold text-[#0D1B2A]">{q.customer_name}</div>
                      <div className="text-[10px] text-[#778DA9] font-mono">{q.customer_phone}</div>
                    </td>
                    <td className="py-2.5 px-3 text-slate-600 align-middle">{q.project_name || 'Standard'}</td>
                    <td className="py-2.5 px-3 align-middle">
                      <div className="font-medium text-[#1B263B]">{q.sales_person_name}</div>
                      {q.assisted_sales_person_id ? (
                        q.assisted_sales_person_id === selectedSalespersonId ? (
                          <div className="text-[10px] text-indigo-700 font-medium inline-flex items-center space-x-1 mt-0.5">
                            <span className="bg-indigo-50 border border-indigo-200 px-1.5 py-0.2 rounded font-sans">
                              🤝 Co-Closer ({Number(q.assisted_sales_share_percent || 50).toFixed(0)}%)
                            </span>
                          </div>
                        ) : (
                          <div className="text-[10px] text-blue-700 font-medium inline-flex items-center space-x-1 mt-0.5">
                            <span className="bg-blue-50 border border-blue-200 px-1.5 py-0.2 rounded font-sans">
                              ⭐ Lead Closer ({Number(q.primary_sales_share_percent || 50).toFixed(0)}% w/ {q.assisted_sales_person_name})
                            </span>
                          </div>
                        )
                      ) : null}
                    </td>
                    <td className="py-2.5 px-3 align-middle whitespace-nowrap">
                      <span className={`badge badge-${q.status}`}>{q.status}</span>
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums align-middle whitespace-nowrap">
                      <div className="font-bold text-[#0D1B2A]">₹ {formatCurrency(q.net_total)}</div>
                      {q.assisted_sales_person_id && (
                        <div className="text-[10px] text-indigo-700 font-semibold font-mono">
                          Credited: ₹ {formatCurrency(
                            q.assisted_sales_person_id === selectedSalespersonId
                              ? (q.assisted_sales_share_amount || 0)
                              : (q.primary_sales_share_amount || q.net_total)
                          )}
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right text-emerald-700 font-semibold tabular-nums align-middle whitespace-nowrap">
                      ₹ {formatCurrency(q.total_paid || 0)}
                    </td>
                    <td className="py-2.5 px-3 text-right text-amber-700 font-semibold tabular-nums align-middle whitespace-nowrap">
                      ₹ {formatCurrency(q.balance_due || 0)}
                    </td>
                    <td className="py-2.5 px-3 text-center align-middle whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <div className="inline-flex items-center justify-center space-x-1 whitespace-nowrap">
                        {/* Explicit Standard PDF Export */}
                        <button
                          type="button"
                          onClick={(e) => handleOpenPdf(q, e, false)}
                          title="Export / Print Standard PDF"
                          className="btn btn-secondary btn-xs px-2 py-0.5 text-[10px] font-semibold text-[#1B263B] hover:text-[#0D1B2A] hover:border-[#778DA9]"
                        >
                          <Printer size={11} className="mr-1 text-[#415A77]" />
                          <span>PDF</span>
                        </button>

                        {/* Explicit Encrypted PDF Export */}
                        <button
                          type="button"
                          onClick={(e) => handleOpenPdf(q, e, true)}
                          title="Export Encrypted PDF (Masked codes, hidden brand)"
                          className="btn btn-xs px-2 py-0.5 text-[10px] font-semibold bg-[#0D1B2A] hover:bg-[#1B263B] text-amber-300 hover:text-amber-200 border-transparent shadow-xs"
                        >
                          <ShieldAlert size={11} className="mr-1 text-amber-400" />
                          <span>Encrypted</span>
                        </button>

                        {/* View Details */}
                        <button
                          type="button"
                          onClick={() => onSelectQuotation(q.id)}
                          title="View Details"
                          className="p-1 rounded text-[#415A77] hover:text-[#0D1B2A] hover:bg-[#E0E1DD]/60 transition-colors"
                        >
                          <Eye size={13} />
                        </button>

                        {/* Edit Quotation */}
                        <button
                          type="button"
                          onClick={() => onEditQuotation(q.id, q.quotation_type || 'tiles')}
                          title="Edit Quotation"
                          className="p-1 rounded text-[#415A77] hover:text-[#0D1B2A] hover:bg-[#E0E1DD]/60 transition-colors"
                        >
                          <Edit size={13} />
                        </button>
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

      {/* Add Salesperson Modal */}
      {addModalOpen && (
        <div className="modal-overlay" onClick={() => setAddModalOpen(false)}>
          <div
            className="card shadow-xl w-full max-w-lg p-5 border border-slate-200 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center border-b border-slate-200 pb-2.5">
              <div className="flex items-center space-x-2">
                <UserPlus size={17} className="text-slate-900" />
                <h2 className="text-sm font-bold text-slate-900 uppercase">
                  Add New Sales Associate
                </h2>
              </div>
              <button
                onClick={() => setAddModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={17} />
              </button>
            </div>

            {userError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-md text-xs flex items-center space-x-2">
                <AlertCircle size={15} className="shrink-0" />
                <span>{userError}</span>
              </div>
            )}

            {userSuccess && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-md text-xs flex items-center space-x-2">
                <CheckCircle size={15} className="shrink-0" />
                <span>{userSuccess}</span>
              </div>
            )}

            <form onSubmit={handleCreateSalesperson} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    className="input input-sm"
                    value={newFullName}
                    onChange={(e) => setNewFullName(e.target.value)}
                    placeholder="e.g. Ramesh Patel"
                    required
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    System Username *
                  </label>
                  <input
                    type="text"
                    className="input input-sm font-mono"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    placeholder="e.g. ramesh"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    Initial Login Password *
                  </label>
                  <input
                    type="password"
                    className="input input-sm font-mono"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter password"
                    required
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    Role Category
                  </label>
                  <select
                    className="input input-sm"
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value as any)}
                  >
                    <option value="salesperson">Salesperson / Showroom Associate</option>
                    <option value="manager">Store Manager</option>
                    <option value="accounts">Accounts & Finance</option>
                  </select>
                </div>
              </div>
              <p className="text-[11px] text-slate-500">
                These unique login credentials will be used by the salesperson to sign in from any PC.
              </p>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    Mobile Number
                  </label>
                  <input
                    type="text"
                    className="input input-sm font-mono"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    placeholder="e.g. +91 98251 45678"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    className="input input-sm"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="e.g. ramesh@amaceramics.com"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  Monthly Sales Target (INR)
                </label>
                <input
                  type="number"
                  step="10000"
                  className="input input-sm tabular-nums font-semibold"
                  value={newTarget}
                  onChange={(e) => setNewTarget(e.target.value)}
                  placeholder="e.g. 500000"
                />
                <p className="text-[10px] text-slate-400 mt-0.5">
                  Target for performance tracking and salesperson dashboard analytics
                </p>
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setAddModalOpen(false)}
                  disabled={creatingUser}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary btn-sm"
                  disabled={creatingUser}
                >
                  {creatingUser ? 'Registering...' : 'Register Sales Associate'}
                </button>
              </div>
            </form>
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
    </div>
  );
};
