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

  const loadDashboard = async () => {
    try {
      setLoading(true);
      const res = await fetchApi('/api/dashboard/summary');
      setData(res);
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
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
            Dashboard Overview
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Logged in as <span className="font-semibold text-slate-800">{user?.full_name}</span> ({user?.role})
          </p>
        </div>

        <div className="flex items-center space-x-2 shrink-0">
          <button
            onClick={loadDashboard}
            className="btn btn-secondary btn-sm"
            title="Refresh dashboard data"
          >
            <RefreshCw size={12} />
            <span>Refresh</span>
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

      {/* Items Dispatching Today Banner */}
      {data?.todaysDispatches && data.todaysDispatches.length > 0 && (
        <div className="bg-amber-50 border-2 border-amber-300/80 rounded-xl p-3.5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-fade-in">
          <div className="flex items-start sm:items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs mt-0.5 sm:mt-0">
              <Truck size={17} />
            </div>
            <div>
              <div className="text-xs font-extrabold text-amber-950 flex items-center gap-1.5">
                <span>Items Dispatching Today</span>
                <span className="px-1.5 py-0.2 rounded text-[10px] font-black bg-amber-200 text-amber-900 border border-amber-300">
                  {data.todaysDispatches.length} Order{data.todaysDispatches.length > 1 ? 's' : ''}
                </span>
              </div>
              <div className="text-[11px] text-amber-900/90 mt-0.5 flex flex-wrap gap-x-3 gap-y-1">
                {data.todaysDispatches.map((d: any) => (
                  <span
                    key={d.id}
                    onClick={() => onSelectQuotation(d.id)}
                    className="inline-flex items-center space-x-1 cursor-pointer hover:underline"
                  >
                    <strong>{d.quotation_number}</strong>
                    <span>({d.customer_name} • {d.total_items} items • {d.dispatch_status})</span>
                  </span>
                ))}
              </div>
            </div>
          </div>

          <button
            onClick={() => onSelectQuotation(data.todaysDispatches[0].id)}
            className="btn btn-xs bg-amber-600 hover:bg-amber-700 text-white font-bold px-3 py-1.5 rounded-lg border-none shadow-xs self-start sm:self-auto cursor-pointer whitespace-nowrap"
          >
            View Details
          </button>
        </div>
      )}

      {/* KPI Stat Cards */}
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
              ✓ Ready for order execution
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
              Cleared advances & settlements
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
              Due on approved quotes
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
              Across all quotation requests
            </p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-slate-100 text-[#1B263B] flex items-center justify-center shrink-0 border border-[#E0E1DD]">
            <FileText size={20} />
          </div>
        </div>
      </div>

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
