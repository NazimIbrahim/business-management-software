import React, { useState, useEffect } from 'react';
import { useServer } from '../context/ServerContext';
import { useAuth } from '../context/AuthContext';
import {
  FileText,
  Clock,
  CheckCircle2,
  XCircle,
  IndianRupee,
  CreditCard,
  TrendingUp,
  Award,
  RefreshCw,
  Eye,
  Printer,
  Plus,
  ShieldAlert,
  Lock,
  Truck,
  X,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Target,
  Zap,
  ChevronDown,
  ChevronUp,
  Users,
} from 'lucide-react';
import { PdfPreviewModal } from '../components/PdfPreviewModal';

interface Props {
  onSelectQuotation: (id: number) => void;
  onCreateQuotation: () => void;
}

export const Dashboard: React.FC<Props> = ({ onSelectQuotation, onCreateQuotation }) => {
  const { fetchApi, getPdfUrl, subscribeToEvents } = useServer();
  const { user } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // PDF Preview State
  const [previewPdf, setPreviewPdf] = useState<{
    url: string;
    title: string;
    fileName: string;
    quotationId?: number;
    initialEncrypted?: boolean;
  } | null>(null);

  // Dispatch Update Real-Time Alert
  const [dispatchAlert, setDispatchAlert] = useState<{
    quotation_id: number;
    quotation_number: string;
    customer_name?: string;
    sales_person_name?: string;
    dispatch_status?: string;
    expected_dispatch_date?: string;
    updated_by?: string;
    updated_at?: string;
  } | null>(null);

  const [selectedMonth, setSelectedMonth] = useState<string>('current');
  const [targetProgress, setTargetProgress] = useState<any | null>(null);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  const formatMonthLabel = (mStr?: string) => {
    if (!mStr || mStr === 'all') return 'All-Time';
    const parts = mStr.split('-');
    if (parts.length !== 2) return mStr;
    const year = parts[0];
    const monthIdx = parseInt(parts[1], 10) - 1;
    const names = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    return `${names[monthIdx] || parts[1]} ${year}`;
  };

  const handlePrevMonth = () => {
    const cur = data?.selectedMonth || selectedMonth;
    if (cur === 'all') return;
    const [yStr, mStr] = cur.split('-');
    let y = parseInt(yStr, 10);
    let m = parseInt(mStr, 10);
    m -= 1;
    if (m < 1) {
      m = 12;
      y -= 1;
    }
    const prevKey = `${y}-${String(m).padStart(2, '0')}`;
    setSelectedMonth(prevKey);
    loadDashboard(prevKey);
  };

  const handleNextMonth = () => {
    const cur = data?.selectedMonth || selectedMonth;
    if (cur === 'all') return;
    const [yStr, mStr] = cur.split('-');
    let y = parseInt(yStr, 10);
    let m = parseInt(mStr, 10);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
    const nextKey = `${y}-${String(m).padStart(2, '0')}`;
    setSelectedMonth(nextKey);
    loadDashboard(nextKey);
  };

  const loadDashboard = async (monthToLoad: string = selectedMonth) => {
    try {
      setLoading(true);
      const queryParam = monthToLoad && monthToLoad !== 'current' ? `?month=${encodeURIComponent(monthToLoad)}` : '?month=current';
      const res = await fetchApi(`/api/dashboard/summary${queryParam}`);
      setData(res);
      if (res.selectedMonth && monthToLoad === 'current') {
        setSelectedMonth(res.selectedMonth);
      }

      try {
        let progUrl = '/api/targets/progress';
        if (monthToLoad && monthToLoad !== 'current' && monthToLoad !== 'all') {
          const [y, m] = monthToLoad.split('-');
          if (y && m) progUrl += `?year=${y}&month=${parseInt(m, 10)}`;
        }
        const prog = await fetchApi(progUrl);
        setTargetProgress(prog);
      } catch (pErr) {}
    } catch (err) {
      console.error('Failed to load dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
    const unsubscribe = subscribeToEvents((event) => {
      if (
        [
          'QUOTATION_CREATED',
          'QUOTATION_UPDATED',
          'QUOTATION_STATUS_CHANGED',
          'PAYMENT_RECORDED',
          'DASHBOARD_REFRESH',
        ].includes(event.type)
      ) {
        loadDashboard();
      } else if (event.type === 'DISPATCH_UPDATED') {
        loadDashboard();
        const role = (user?.role || '').toLowerCase();
        const isUserRelevant =
          ['admin', 'manager', 'accounts', 'accountant'].includes(role) ||
          (role === 'salesperson' &&
            (event.payload?.sales_person_id === user?.id ||
              event.payload?.assisted_sales_person_id === user?.id ||
              event.payload?.sales_person_name === user?.full_name));

        if (isUserRelevant) {
          setDispatchAlert(event.payload);
        }
      }
    });
    return () => unsubscribe();
  }, [user]);

  const isSalesperson = user?.role?.toLowerCase() === 'salesperson';

  // Filter recent quotations for salespersons (safeguard)
  const visibleRecentQuotations = (data?.recentQuotations || []).filter((q: any) => {
    if (!isSalesperson) return true;
    return (
      q.sales_person_id === user?.id ||
      q.assisted_sales_person_id === user?.id ||
      q.sales_person_name === user?.full_name ||
      q.assisted_sales_person_name === user?.full_name
    );
  });

  const formatCurrency = (val: number) => {
    return Number(val || 0).toLocaleString('en-IN', {
      maximumFractionDigits: 2,
      minimumFractionDigits: 0,
    });
  };

  const handleOpenPdf = (quotation: any, e: React.MouseEvent, encrypted: boolean = false) => {
    e.stopPropagation();
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

  if (loading && !data) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 bg-slate-50">
        <div className="text-center">
          <RefreshCw className="animate-spin text-slate-800 mx-auto mb-2" size={24} />
          <p className="text-xs font-medium text-slate-500">Loading Dashboard Metrics...</p>
        </div>
      </div>
    );
  }

  const statusMap: Record<string, { count: number; val: number }> = {};
  if (data?.statusCounts) {
    data.statusCounts.forEach((s: any) => {
      statusMap[s.status] = { count: parseInt(s.count, 10), val: parseFloat(s.total_val) };
    });
  }

  const totalQuotesCount = Object.values(statusMap).reduce((acc, curr) => acc + curr.count, 0) || 1;

  return (
    <div className="flex-1 p-4 sm:p-5 lg:p-6 space-y-4 lg:space-y-5 overflow-y-auto w-full min-w-0">
      {/* Top Header with Month Navigator & Auto-Reset Status */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
              Dashboard Overview
            </h1>
            <span
              className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border flex items-center space-x-1 ${
                data?.isCurrentMonth
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-amber-50 text-amber-800 border-amber-200'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${data?.isCurrentMonth ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`}></span>
              <span>{data?.isCurrentMonth ? 'Monthly Live (Auto-Resets Each Month)' : `Historical: ${data?.monthLabel}`}</span>
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Logged in as <span className="font-semibold text-slate-800">{user?.full_name}</span> ({user?.role}) &bull; Showing monthly performance for <strong className="text-slate-800 font-semibold">{data?.monthLabel || 'Current Month'}</strong>
          </p>
        </div>

        {/* Month Navigation & Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Quick Month Navigator */}
          <div className="flex items-center bg-slate-100/90 rounded-lg p-1 border border-slate-200/90 shadow-2xs">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-white rounded transition cursor-pointer"
              title="Previous Month"
            >
              <ChevronLeft size={15} />
            </button>

            <div className="flex items-center px-1.5 space-x-1.5">
              <Calendar size={13} className="text-slate-500" />
              <select
                value={data?.selectedMonth || selectedMonth}
                onChange={(e) => {
                  const m = e.target.value;
                  setSelectedMonth(m);
                  loadDashboard(m);
                }}
                className="bg-transparent text-xs font-bold text-slate-800 border-none outline-none cursor-pointer py-0.5 pr-1"
              >
                <option value="current">Current Month ({formatMonthLabel(data?.currentMonth)})</option>
                {(data?.availableMonths || []).map((m: string) => (
                  <option key={m} value={m}>
                    {formatMonthLabel(m)} {m === data?.currentMonth ? '(Current)' : ''}
                  </option>
                ))}
                <option value="all">All-Time Cumulative</option>
              </select>
            </div>

            <button
              type="button"
              onClick={handleNextMonth}
              disabled={data?.isCurrentMonth}
              className={`p-1.5 rounded transition ${
                data?.isCurrentMonth
                  ? 'text-slate-300 cursor-not-allowed'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white cursor-pointer'
              }`}
              title="Next Month"
            >
              <ChevronRight size={15} />
            </button>
          </div>

          <button
            onClick={() => loadDashboard(selectedMonth)}
            className="btn btn-secondary btn-sm"
            title="Refresh dashboard data"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
          <button
            onClick={onCreateQuotation}
            className="btn btn-primary btn-sm"
          >
            <Plus size={13} />
            <span>New Quotation</span>
          </button>
        </div>
      </div>

      {/* Real-time Dispatch Update Popup Banner */}
      {dispatchAlert && (
        <div className="dispatch-notice-banner-dark animate-fade-in" style={{ marginBottom: '1rem' }}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center space-x-3.5">
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '12px',
                  background: 'rgba(56, 189, 248, 0.2)',
                  border: '1px solid rgba(56, 189, 248, 0.4)',
                  color: '#38BDF8',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Truck size={20} />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span style={{ fontSize: '13px', fontWeight: 800, color: '#FFFFFF', letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                    Dispatch Status Updated
                  </span>
                  <span
                    style={{
                      background: 'rgba(56, 189, 248, 0.25)',
                      color: '#7DD3FC',
                      border: '1px solid rgba(56, 189, 248, 0.4)',
                      fontWeight: 800,
                      fontSize: '11px',
                      padding: '2px 8px',
                      borderRadius: '9999px',
                    }}
                  >
                    {dispatchAlert.dispatch_status || 'Ready Stock'}
                  </span>
                  {dispatchAlert.updated_by && (
                    <span style={{ fontSize: '11px', color: '#94A3B8' }}>
                      by {dispatchAlert.updated_by}
                    </span>
                  )}
                </div>
                <p style={{ fontSize: '12px', color: '#CBD5E1', marginTop: '3px', lineHeight: '1.4' }}>
                  Quotation <strong style={{ color: '#FFFFFF' }}>{dispatchAlert.quotation_number}</strong>
                  {dispatchAlert.customer_name ? ` for ${dispatchAlert.customer_name}` : ''} &bull; Expected Dispatch Date:{' '}
                  <strong style={{ color: '#38BDF8', fontFamily: 'monospace' }}>
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
                className="dispatch-action-btn-emerald"
                style={{ padding: '6px 14px', fontSize: '12px' }}
              >
                View Order
              </button>
              <button
                onClick={() => setDispatchAlert(null)}
                style={{
                  color: '#94A3B8',
                  padding: '6px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  background: 'transparent',
                  border: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                }}
                title="Dismiss alert"
              >
                <X size={18} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Items Dispatching Today Banner */}
      {data?.todaysDispatches && data.todaysDispatches.length > 0 && (
        <div className="dispatch-notice-banner-emerald animate-fade-in" style={{ marginBottom: '1rem' }}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center space-x-3.5">
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '12px',
                  background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                  boxShadow: '0 4px 12px rgba(5, 150, 105, 0.35)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#FFFFFF',
                  flexShrink: 0,
                }}
              >
                <Truck size={20} />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span style={{ fontSize: '13px', fontWeight: 800, color: '#064E3B', letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                    Items Dispatching Today
                  </span>
                  <span
                    style={{
                      background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                      color: '#FFFFFF',
                      fontWeight: 800,
                      fontSize: '11px',
                      padding: '2px 8px',
                      borderRadius: '9999px',
                      boxShadow: '0 2px 6px rgba(5, 150, 105, 0.25)',
                    }}
                  >
                    {data.todaysDispatches.length} Order{data.todaysDispatches.length > 1 ? 's' : ''}
                  </span>
                </div>
                <div style={{ fontSize: '12px', color: '#065F46', marginTop: '4px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {data.todaysDispatches.map((d: any) => (
                    <button
                      key={d.id}
                      onClick={() => onSelectQuotation(d.id)}
                      className="dispatch-notice-chip dispatch-notice-chip-emerald"
                      style={{ padding: '4px 10px', fontSize: '11px' }}
                    >
                      <strong style={{ color: '#0F172A', fontFamily: 'monospace' }}>{d.quotation_number}</strong>
                      <span style={{ color: '#334155' }}>({d.customer_name} &bull; {d.total_items} items &bull; {d.dispatch_status})</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button
              onClick={() => onSelectQuotation(data.todaysDispatches[0].id)}
              className="dispatch-action-btn-emerald"
              style={{ padding: '6px 14px', fontSize: '12px', alignSelf: 'flex-start' }}
            >
              View First Order &rarr;
            </button>
          </div>
        </div>
      )}

      {/* KPI Stat Cards (Scoped to Selected Month) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Approved Sales */}
        <div className="card card-hover p-4 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold tracking-wider uppercase text-[#415A77]">
              Approved Orders
            </span>
            <div className="text-xl font-bold text-[#0D1B2A] tabular-nums mt-1">
              ₹ {formatCurrency(data?.financials?.approvedRevenue)}
            </div>
            <p className="text-[10px] text-emerald-700 font-medium mt-1">
              ✓ Ready for order execution ({data?.monthLabel || 'This Month'})
            </p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-100">
            <TrendingUp size={20} />
          </div>
        </div>

        {/* Payments Collected */}
        <div className="card card-hover p-4 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold tracking-wider uppercase text-[#415A77]">
              Payments Collected
            </span>
            <div className="text-xl font-bold text-[#0D1B2A] tabular-nums mt-1">
              ₹ {formatCurrency(data?.financials?.totalCollected)}
            </div>
            <p className="text-[10px] text-[#415A77] font-medium mt-1">
              Cleared in {data?.monthLabel || 'This Month'}
            </p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-blue-50 text-[#415A77] flex items-center justify-center shrink-0 border border-blue-100">
            <CreditCard size={20} />
          </div>
        </div>

        {/* Outstanding Receivables */}
        <div className="card card-hover p-4 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold tracking-wider uppercase text-[#415A77]">
              Outstanding Balance
            </span>
            <div className="text-xl font-bold text-[#0D1B2A] tabular-nums mt-1">
              ₹ {formatCurrency(data?.financials?.totalOutstanding)}
            </div>
            <p className="text-[10px] text-amber-700 font-medium mt-1">
              Due on {data?.monthLabel || 'This Month'} orders
            </p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 border border-amber-100">
            <IndianRupee size={20} />
          </div>
        </div>

        {/* Total Quoted Pipeline */}
        <div className="card card-hover p-4 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold tracking-wider uppercase text-[#415A77]">
              Total Quoted Value
            </span>
            <div className="text-xl font-bold text-[#0D1B2A] tabular-nums mt-1">
              ₹ {formatCurrency(data?.financials?.totalQuoted)}
            </div>
            <p className="text-[10px] text-[#415A77] font-medium mt-1">
              Quoted in {data?.monthLabel || 'This Month'}
            </p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-slate-100 text-[#1B263B] flex items-center justify-center shrink-0 border border-[#E0E1DD]">
            <FileText size={20} />
          </div>
        </div>
      </div>

      {/* Target vs. Achievement Tracker Section */}
      {targetProgress?.categories && targetProgress.categories.length > 0 && (
        <div className="card p-4.5 bg-white border border-slate-200/90 shadow-2xs space-y-3.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
            <div className="flex items-center space-x-2">
              <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center shadow-xs">
                <Target size={15} />
              </div>
              <div>
                <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                  <span>Target vs. Achievement Tracker</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                    {targetProgress.summary?.grand_achievement_pct || 0}% Grand Progress
                  </span>
                </h2>
                <p className="text-[11px] text-slate-400">
                  Real-time sales velocity by category group • {targetProgress.period?.days_elapsed || 0} of {targetProgress.period?.total_days || 30} days elapsed
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {targetProgress.categories.map((cat: any) => {
              const isSurplus = cat.shortfall_or_surplus >= 0;
              const isExpanded = expandedCategory === cat.category;

              let colorStyles = {
                bar: 'bg-rose-500',
                text: 'text-rose-700',
                badge: 'bg-rose-100 text-rose-800 border-rose-200',
              };
              if (cat.achievement_pct >= 100) {
                colorStyles = {
                  bar: 'bg-purple-600',
                  text: 'text-purple-700',
                  badge: 'bg-purple-100 text-purple-800 border-purple-200',
                };
              } else if (cat.achievement_pct >= 80) {
                colorStyles = {
                  bar: 'bg-emerald-500',
                  text: 'text-emerald-700',
                  badge: 'bg-emerald-100 text-emerald-800 border-emerald-200',
                };
              } else if (cat.achievement_pct >= 50) {
                colorStyles = {
                  bar: 'bg-amber-500',
                  text: 'text-amber-700',
                  badge: 'bg-amber-100 text-amber-800 border-amber-200',
                };
              }

              return (
                <div
                  key={cat.category}
                  className="rounded-xl border border-slate-200/80 bg-slate-50/40 p-3.5 space-y-2.5 transition-all hover:bg-white hover:shadow-xs"
                >
                  <div className="flex justify-between items-center">
                    <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-slate-200 text-slate-800">
                      {cat.category}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-black font-mono border ${colorStyles.badge}`}>
                      {cat.achievement_pct}%
                    </span>
                  </div>

                  <div className="space-y-1">
                    <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-2 rounded-full transition-all duration-500 ${colorStyles.bar}`}
                        style={{ width: `${Math.min(100, Math.max(2, cat.achievement_pct))}%` }}
                      />
                    </div>
                  </div>

                  <div className="space-y-1 text-xs pt-1 border-t border-slate-200/60 font-mono">
                    <div className="flex justify-between text-slate-500 text-[11px]">
                      <span>Target:</span>
                      <span className="font-bold text-slate-700">₹ {formatCurrency(cat.allocated_target)}</span>
                    </div>
                    <div className="flex justify-between text-emerald-600 text-[11px]">
                      <span>Achieved:</span>
                      <span className="font-bold">₹ {formatCurrency(cat.achieved_revenue)}</span>
                    </div>
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-400">{isSurplus ? 'Surplus:' : 'Shortfall:'}</span>
                      <span className={`font-bold ${isSurplus ? 'text-purple-700' : 'text-rose-600'}`}>
                        {isSurplus ? '+' : '-'}₹ {formatCurrency(Math.abs(cat.shortfall_or_surplus))}
                      </span>
                    </div>
                  </div>

                  <div className="bg-white rounded-md p-1.5 border border-slate-200/60 flex items-center justify-between text-[10px]">
                    <div className="flex items-center space-x-1 text-slate-500">
                      <Zap size={11} className="text-amber-500" />
                      <span>Run-rate:</span>
                    </div>
                    <span className="font-mono font-bold text-indigo-700">
                      ₹ {formatCurrency(cat.projected_month_end)}
                    </span>
                  </div>

                  {cat.contributors && cat.contributors.length > 0 && (
                    <div>
                      <button
                        type="button"
                        onClick={() => setExpandedCategory(isExpanded ? null : cat.category)}
                        className="w-full text-center text-[10px] font-bold text-slate-500 hover:text-indigo-600 flex items-center justify-center space-x-1 pt-1"
                      >
                        <Users size={11} />
                        <span>{cat.contributors.length} Staff</span>
                        {isExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                      </button>

                      {isExpanded && (
                        <div className="mt-2 pt-2 border-t border-slate-200 space-y-1.5 max-h-40 overflow-y-auto">
                          {cat.contributors.map((c: any) => (
                            <div key={c.id} className="text-[10px] bg-white p-1.5 rounded border border-slate-100 flex justify-between items-center">
                              <span className="font-medium text-slate-700 truncate max-w-[90px]">{c.name}</span>
                              <span className="font-mono font-bold text-emerald-600">₹ {formatCurrency(c.achieved_amount)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Auto-Reset Month Alert if current month is fresh and at 0 */}
      {data?.financials?.totalQuoted === 0 && data?.isCurrentMonth && (
        <div className="p-3.5 bg-blue-50/70 border border-blue-200/80 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-blue-900">
          <div className="flex items-center space-x-2">
            <Clock size={16} className="text-blue-600 shrink-0" />
            <span>
              <strong>{data?.monthLabel} has started:</strong> Dashboard values have reset to zero for the new month. Prior month quotations can be reviewed anytime via the month selector above or Reports.
            </span>
          </div>
          <button
            onClick={onCreateQuotation}
            className="btn btn-xs bg-blue-600 text-white hover:bg-blue-700 shrink-0 self-start sm:self-auto cursor-pointer"
          >
            + Create First Quote for {data?.monthLabel}
          </button>
        </div>
      )}

      {/* Quotation Pipeline Distribution Bar */}
      <div className="card p-4">
        <div className="flex justify-between items-center mb-3">
          <div>
            <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Quotation Pipeline Stages
            </h2>
            <p className="text-[11px] text-slate-500">
              Distribution of quotations by lifecycle stage
            </p>
          </div>
          <span className="text-xs font-medium text-slate-500 tabular-nums">
            Total {totalQuotesCount} records
          </span>
        </div>

        {/* Progress bar */}
        <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden flex mb-4 border border-slate-200">
          <div
            className="bg-emerald-500 h-full transition-all"
            style={{ width: `${((statusMap['approved']?.count || 0) / totalQuotesCount) * 100}%` }}
            title={`Approved: ${statusMap['approved']?.count || 0}`}
          />
          <div
            className="bg-amber-400 h-full transition-all"
            style={{ width: `${((statusMap['in_review']?.count || 0) / totalQuotesCount) * 100}%` }}
            title={`In Review: ${statusMap['in_review']?.count || 0}`}
          />
          <div
            className="bg-slate-400 h-full transition-all"
            style={{ width: `${((statusMap['draft']?.count || 0) / totalQuotesCount) * 100}%` }}
            title={`Draft: ${statusMap['draft']?.count || 0}`}
          />
          <div
            className="bg-blue-500 h-full transition-all"
            style={{ width: `${((statusMap['closed']?.count || 0) / totalQuotesCount) * 100}%` }}
            title={`Closed: ${statusMap['closed']?.count || 0}`}
          />
          <div
            className="bg-rose-400 h-full transition-all"
            style={{ width: `${((statusMap['rejected']?.count || 0) / totalQuotesCount) * 100}%` }}
            title={`Rejected: ${statusMap['rejected']?.count || 0}`}
          />
        </div>

        {/* Pill status summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <div className="p-2.5 rounded-md border border-slate-200 bg-slate-50">
            <span className="text-[11px] font-medium text-slate-600 flex items-center space-x-1">
              <span className="w-2 h-2 rounded-full bg-slate-400"></span>
              <span>Draft</span>
            </span>
            <div className="text-lg font-bold text-slate-900 mt-1 tabular-nums">
              {statusMap['draft']?.count || 0}
            </div>
            <div className="text-[10px] text-slate-500 tabular-nums">
              ₹ {formatCurrency(statusMap['draft']?.val || 0)}
            </div>
          </div>

          <div className="p-2.5 rounded-md border border-amber-200 bg-amber-50">
            <span className="text-[11px] font-medium text-amber-800 flex items-center space-x-1">
              <span className="w-2 h-2 rounded-full bg-amber-500"></span>
              <span>In Review</span>
            </span>
            <div className="text-lg font-bold text-amber-900 mt-1 tabular-nums">
              {statusMap['in_review']?.count || 0}
            </div>
            <div className="text-[10px] text-amber-700 tabular-nums">
              ₹ {formatCurrency(statusMap['in_review']?.val || 0)}
            </div>
          </div>

          <div className="p-2.5 rounded-md border border-emerald-200 bg-emerald-50">
            <span className="text-[11px] font-medium text-emerald-800 flex items-center space-x-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span>Approved</span>
            </span>
            <div className="text-lg font-bold text-emerald-900 mt-1 tabular-nums">
              {statusMap['approved']?.count || 0}
            </div>
            <div className="text-[10px] text-emerald-700 tabular-nums">
              ₹ {formatCurrency(statusMap['approved']?.val || 0)}
            </div>
          </div>

          <div className="p-2.5 rounded-md border border-blue-200 bg-blue-50">
            <span className="text-[11px] font-medium text-blue-800 flex items-center space-x-1">
              <span className="w-2 h-2 rounded-full bg-blue-500"></span>
              <span>Closed</span>
            </span>
            <div className="text-lg font-bold text-blue-900 mt-1 tabular-nums">
              {statusMap['closed']?.count || 0}
            </div>
            <div className="text-[10px] text-blue-700 tabular-nums">
              ₹ {formatCurrency(statusMap['closed']?.val || 0)}
            </div>
          </div>

          <div className="p-2.5 rounded-md border border-rose-200 bg-rose-50">
            <span className="text-[11px] font-medium text-rose-800 flex items-center space-x-1">
              <span className="w-2 h-2 rounded-full bg-rose-500"></span>
              <span>Rejected</span>
            </span>
            <div className="text-lg font-bold text-rose-900 mt-1 tabular-nums">
              {statusMap['rejected']?.count || 0}
            </div>
            <div className="text-[10px] text-rose-700 tabular-nums">
              ₹ {formatCurrency(statusMap['rejected']?.val || 0)}
            </div>
          </div>
        </div>
      </div>

      {/* Main Bottom Grid: Recent Activity & Sales Leaderboard */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Recent Quotations Table (2 Cols on lg) */}
        <div className="col-span-1 lg:col-span-2 card p-4 flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center mb-3">
              <div>
                <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  {isSalesperson ? 'My Recent Quotations' : 'Recent Quotation Activity'}
                </h2>
                <p className="text-[11px] text-slate-500">
                  {isSalesperson
                    ? 'Your latest customer proposals and status updates'
                    : 'Latest updates from across the showroom network'}
                </p>
              </div>
              <span className="text-[11px] text-emerald-600 font-medium flex items-center space-x-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>Live Feed</span>
              </span>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-md">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 text-[11px]">
                    <th className="py-2.5 px-3">Quotation Ref</th>
                    <th className="py-2.5 px-3 whitespace-nowrap">Customer</th>
                    <th className="py-2.5 px-3 whitespace-nowrap">Salesperson</th>
                    <th className="py-2.5 px-3 whitespace-nowrap">Status</th>
                    <th className="py-2.5 px-3 text-right whitespace-nowrap">Net Total</th>
                    <th className="py-2.5 px-3 text-center whitespace-nowrap">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E0E1DD]/60">
                  {visibleRecentQuotations && visibleRecentQuotations.length > 0 ? (
                    visibleRecentQuotations.map((q: any) => (
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
                        <td className="py-2.5 px-3 font-medium text-[#1B263B] align-middle">
                          {q.customer_name}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 align-middle">
                          {q.sales_person_name}
                        </td>
                        <td className="py-2.5 px-3 align-middle whitespace-nowrap">
                          <span className={`badge badge-${q.status}`}>{q.status}</span>
                          {['approved', 'closed'].includes(q.status?.toLowerCase()) ? (
                            <div className="text-[10px] text-emerald-800 font-bold mt-0.5">
                              Approved: {q.approved_by_name || 'Store Manager'}
                            </div>
                          ) : q.status === 'in_review' ? (
                            <div className="text-[10px] text-amber-700 font-medium mt-0.5">
                              Pending Approval
                            </div>
                          ) : null}
                        </td>
                        <td className="py-2.5 px-3 text-right font-semibold text-[#0D1B2A] tabular-nums align-middle whitespace-nowrap">
                          ₹ {formatCurrency(q.net_total)}
                        </td>
                        <td className="py-2.5 px-3 text-center align-middle whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          <div className="inline-flex items-center justify-center space-x-1 whitespace-nowrap">
                            {user?.role === 'salesperson' && !['approved', 'closed'].includes(q.status?.toLowerCase()) ? (
                              <span
                                className="px-2 py-0.5 text-[10px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded inline-flex items-center"
                                title="Awaiting Store Manager approval before PDF export or print"
                              >
                                <Lock size={10} className="mr-1 text-amber-600" />
                                <span>Awaiting Approval</span>
                              </span>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={(e) => handleOpenPdf(q, e, false)}
                                  title="Export / Print Standard PDF"
                                  className="btn btn-secondary btn-xs px-2 py-0.5 text-[10px] font-semibold text-[#1B263B] hover:text-[#0D1B2A] hover:border-[#778DA9]"
                                >
                                  <Printer size={11} className="mr-1 text-[#415A77]" />
                                  <span>PDF</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => handleOpenPdf(q, e, true)}
                                  title="Export Encrypted PDF (Masked codes, hidden brand)"
                                  className="btn btn-xs px-2 py-0.5 text-[10px] font-semibold bg-[#0D1B2A] hover:bg-[#1B263B] text-amber-300 hover:text-amber-200 border-transparent shadow-xs"
                                >
                                  <ShieldAlert size={11} className="mr-1 text-amber-400" />
                                  <span>Encrypted</span>
                                </button>
                              </>
                            )}
                            <button
                              type="button"
                              onClick={() => onSelectQuotation(q.id)}
                              className="p-1 rounded text-[#415A77] hover:text-[#0D1B2A] hover:bg-[#E0E1DD]/60 transition-colors"
                              title="Review Quotation Details"
                            >
                              <Eye size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400">
                        No recent quotations recorded.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Salesperson Performance Leaderboard / Personal Target & Achievement (1 Col) */}
        <div className="card p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-2">
                <Award size={16} className="text-amber-600" />
                <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  {isSalesperson ? 'My Sales Milestone & Target' : 'Sales Leaderboard'}
                </h2>
              </div>
              <span className="text-[10px] text-slate-400 uppercase font-semibold">
                MTD Performance
              </span>
            </div>

            {isSalesperson ? (
              <div className="space-y-4">
                {/* Target & Achieved Card */}
                <div className="p-3.5 rounded-lg border border-teal-200 bg-teal-50/50">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-bold text-teal-900 uppercase tracking-wider">
                      Target Progress
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-teal-200 text-teal-900">
                      {Math.min(100, Math.round(data?.personalAchievement?.percentage || 0))}%
                    </span>
                  </div>

                  <div className="w-full bg-teal-200/60 rounded-full h-2.5 overflow-hidden mb-3">
                    <div
                      className="bg-teal-600 h-2.5 rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.min(100, Math.max(0, data?.personalAchievement?.percentage || 0))}%`,
                      }}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-teal-200/60">
                    <div>
                      <div className="text-[10px] text-slate-500 font-semibold uppercase">Monthly Target</div>
                      <div className="font-bold text-slate-800 tabular-nums">
                        ₹ {formatCurrency(data?.personalAchievement?.monthlyTarget || 0)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] text-teal-700 font-semibold uppercase">Achieved (Approved)</div>
                      <div className="font-bold text-teal-900 tabular-nums">
                        ₹ {formatCurrency(data?.personalAchievement?.approvedRevenue || 0)}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Approved Orders & Pipeline Stat */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="p-3 rounded-lg border border-emerald-100 bg-emerald-50/60">
                    <div className="text-[10px] text-emerald-800 font-bold uppercase tracking-wider">
                      Approved Orders
                    </div>
                    <div className="text-lg font-black text-emerald-950 mt-1 tabular-nums">
                      {data?.personalAchievement?.approvedOrdersCount || 0}
                    </div>
                    <div className="text-[10px] text-emerald-700 mt-0.5">Execution Ready</div>
                  </div>

                  <div className="p-3 rounded-lg border border-slate-200 bg-slate-50">
                    <div className="text-[10px] text-slate-600 font-bold uppercase tracking-wider">
                      Active Quotes
                    </div>
                    <div className="text-lg font-black text-slate-900 mt-1 tabular-nums">
                      {totalQuotesCount}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">Customer Proposals</div>
                  </div>
                </div>

                {/* Status difference pill */}
                <div className="p-2.5 rounded-lg border border-slate-200/80 bg-white flex items-center justify-between text-xs">
                  <span className="text-slate-600 font-medium text-[11px]">Monthly Variance:</span>
                  {(data?.personalAchievement?.difference || 0) >= 0 ? (
                    <span className="font-bold text-emerald-700">
                      + ₹ {formatCurrency(data?.personalAchievement?.difference || 0)} Ahead
                    </span>
                  ) : (
                    <span className="font-bold text-amber-700">
                      - ₹ {formatCurrency(Math.abs(data?.personalAchievement?.difference || 0))} Shortfall
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-2.5">
                {data?.leaderboard && data.leaderboard.length > 0 ? (
                  data.leaderboard.map((item: any, idx: number) => (
                    <div
                      key={item.id}
                      className="p-2.5 rounded-md border border-slate-100 bg-slate-50/70 flex items-center justify-between"
                    >
                      <div className="flex items-center space-x-2.5">
                        <div
                          className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-[11px] ${
                            idx === 0
                              ? 'bg-amber-100 text-amber-800 border border-amber-200'
                              : idx === 1
                              ? 'bg-slate-200 text-slate-700 border border-slate-300'
                              : 'bg-orange-100 text-orange-800 border border-orange-200'
                          }`}
                        >
                          {idx + 1}
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-slate-900">{item.full_name}</p>
                          <p className="text-[10px] text-slate-500 tabular-nums">
                            {item.total_quotations} quotes created
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-bold text-slate-900 tabular-nums">
                          ₹ {formatCurrency(item.sales_achieved)}
                        </p>
                        <p className="text-[10px] text-emerald-700 font-medium">Approved / Closed</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="py-8 text-center text-slate-400 text-xs">
                    No salesperson performance data yet.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

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
