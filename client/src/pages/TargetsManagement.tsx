import React, { useState, useEffect, useMemo } from 'react';
import { useServer } from '../context/ServerContext';
import { useAuth } from '../context/AuthContext';
import { SalesCategory, SalesTarget } from '../types';
import {
  Target,
  TrendingUp,
  Plus,
  RefreshCw,
  X,
  Award,
  CheckCircle,
  Edit2,
  Copy,
  ChevronDown,
  ChevronUp,
  Users,
  Shield,
  Layers,
  Calendar,
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
  Zap,
} from 'lucide-react';

export const TargetsManagement: React.FC = () => {
  const { fetchApi, subscribeToEvents } = useServer();
  const { user } = useAuth();

  const isAdminOrManager = ['admin', 'manager'].includes(user?.role?.toLowerCase() || '');
  const isSalesperson = user?.role?.toLowerCase() === 'salesperson';

  // Navigation tab
  const [activeTab, setActiveTab] = useState<'visual' | 'group' | 'staff'>('visual');

  // Period filters
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth() + 1);
  const [selectedPeriodType, setSelectedPeriodType] = useState<'MONTHLY' | 'QUARTERLY' | 'YEARLY'>('MONTHLY');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');

  // Expanded categories in drilldown
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({
    RETAIL: true,
    PROJECT: false,
    MANAGEMENT: false,
    COMPANY: false,
  });

  // Data states
  const [progressData, setProgressData] = useState<any | null>(null);
  const [allTargets, setAllTargets] = useState<SalesTarget[]>([]);
  const [performance, setPerformance] = useState<any[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // New Target Allocation Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [targetScope, setTargetScope] = useState<'group' | 'staff'>('group');
  const [targetCategory, setTargetCategory] = useState<SalesCategory>('RETAIL');
  const [targetStaffId, setTargetStaffId] = useState<number | null>(null);
  const [targetAmount, setTargetAmount] = useState('1000000');
  const [targetVolumeSqft, setTargetVolumeSqft] = useState('0');
  const [targetPeriodType, setTargetPeriodType] = useState<'MONTHLY' | 'QUARTERLY' | 'YEARLY'>('MONTHLY');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [savingTarget, setSavingTarget] = useState(false);

  // Rollover / Clone Modal
  const [rolloverModalOpen, setRolloverModalOpen] = useState(false);
  const [sourceYear, setSourceYear] = useState<number>(now.getFullYear());
  const [sourceMonth, setSourceMonth] = useState<number>(now.getMonth() === 0 ? 12 : now.getMonth());
  const [targetYear, setTargetYear] = useState<number>(now.getFullYear());
  const [targetMonth, setTargetMonth] = useState<number>(now.getMonth() + 1);
  const [adjustmentPct, setAdjustmentPct] = useState<number>(0);
  const [rollingOver, setRollingOver] = useState(false);

  // Quick Edit Target Modal for Store Managers
  const [editTargetModal, setEditTargetModal] = useState<{ id: number; name: string; target: number } | null>(null);
  const [editTargetValue, setEditTargetValue] = useState<string>('');
  const [savingQuickEdit, setSavingQuickEdit] = useState(false);

  const formatCurrency = (val: number | string) => {
    const num = typeof val === 'number' ? val : parseFloat(String(val || 0)) || 0;
    return num.toLocaleString('en-IN', {
      maximumFractionDigits: 0,
      minimumFractionDigits: 0,
    });
  };

  const loadAllData = async () => {
    setLoading(true);
    try {
      // 1. Load Visual Progress Aggregation
      const progRes = await fetchApi(
        `/api/targets/progress?year=${selectedYear}&month=${selectedMonth}&period_type=${selectedPeriodType}`
      );
      setProgressData(progRes);

      // 2. Load Targets table
      const targetsRes = await fetchApi(
        `/api/targets?year=${selectedYear}&month=${selectedMonth}&period_type=${selectedPeriodType}`
      );
      setAllTargets(targetsRes.targets || []);

      // 3. Load Staff Performance
      const perfRes = await fetchApi('/api/targets/performance');
      setPerformance(perfRes.performance || []);

      // 4. Load users for staff target assignments
      if (isAdminOrManager) {
        const uRes = await fetchApi('/api/users');
        setAllUsers(uRes.users || []);
      }
    } catch (err) {
      console.error('Failed to load targets data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, [selectedYear, selectedMonth, selectedPeriodType]);

  useEffect(() => {
    const unsubscribe = subscribeToEvents((event) => {
      if (['TARGET_UPDATED', 'QUOTATION_STATUS_CHANGED', 'QUOTATION_CREATED'].includes(event.type)) {
        loadAllData();
      }
    });
    return () => unsubscribe();
  }, [selectedYear, selectedMonth, selectedPeriodType]);

  const toggleCategoryExpand = (cat: string) => {
    setExpandedCategories((prev) => ({
      ...prev,
      [cat]: !prev[cat],
    }));
  };

  // Open Target Modal
  const openNewTargetModal = (scope: 'group' | 'staff' = 'group', cat: SalesCategory = 'RETAIL', staffId?: number) => {
    setTargetScope(scope);
    setTargetCategory(cat);
    setTargetStaffId(staffId || null);
    setTargetPeriodType(selectedPeriodType);

    const fDay = new Date(selectedYear, selectedMonth - 1, 1).toISOString().split('T')[0];
    const lDay = new Date(selectedYear, selectedMonth, 0).toISOString().split('T')[0];
    setStartDate(fDay);
    setEndDate(lDay);
    setTargetAmount(scope === 'group' ? '2500000' : '500000');
    setTargetVolumeSqft('0');
    setNotes('');
    setModalOpen(true);
  };

  // Handle Save Target
  const handleSaveTargetAllocation = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingTarget(true);
    try {
      await fetchApi('/api/targets', {
        method: 'POST',
        body: JSON.stringify({
          category: targetCategory,
          sales_person_id: targetScope === 'staff' ? targetStaffId : null,
          target_type: targetPeriodType === 'MONTHLY' ? 'Monthly' : targetPeriodType === 'QUARTERLY' ? 'Quarterly' : 'Annual',
          period_type: targetPeriodType,
          start_date: startDate,
          end_date: endDate,
          target_amount: parseFloat(targetAmount) || 0,
          target_volume_sqft: parseFloat(targetVolumeSqft) || 0,
          notes,
        }),
      });

      setModalOpen(false);
      loadAllData();
    } catch (err: any) {
      alert(err.message || 'Failed to save target allocation');
    } finally {
      setSavingTarget(false);
    }
  };

  // Handle Rollover / Clone
  const handleExecuteRollover = async (e: React.FormEvent) => {
    e.preventDefault();
    setRollingOver(true);
    try {
      const res = await fetchApi('/api/targets/clone', {
        method: 'POST',
        body: JSON.stringify({
          source_year: sourceYear,
          source_month: sourceMonth,
          target_year: targetYear,
          target_month: targetMonth,
          period_type: selectedPeriodType,
          adjustment_percent: adjustmentPct,
        }),
      });

      alert(res.message || 'Targets cloned successfully!');
      setRolloverModalOpen(false);
      setSelectedYear(targetYear);
      setSelectedMonth(targetMonth);
      loadAllData();
    } catch (err: any) {
      alert(err.message || 'Failed to clone targets');
    } finally {
      setRollingOver(false);
    }
  };

  const handleOpenEditTarget = (sp: any, currentTarget: number) => {
    setEditTargetModal({ id: sp.id, name: sp.full_name, target: currentTarget });
    setEditTargetValue(String(currentTarget || ''));
  };

  // Quick edit monthly target directly
  const handleSaveQuickEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTargetModal) return;
    setSavingQuickEdit(true);
    try {
      await fetchApi(`/api/targets/salesperson/${editTargetModal.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          monthly_target: parseFloat(editTargetValue) || 0,
        }),
      });
      setEditTargetModal(null);
      loadAllData();
    } catch (err: any) {
      alert(err.message || 'Failed to update target');
    } finally {
      setSavingQuickEdit(false);
    }
  };

  // Delete target
  const handleDeleteTarget = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this target configuration?')) return;
    try {
      await fetchApi(`/api/targets/${id}`, { method: 'DELETE' });
      loadAllData();
    } catch (err: any) {
      alert(err.message || 'Failed to delete target');
    }
  };

  // Filtered categories for display
  const displayedCategories = useMemo(() => {
    if (!progressData?.categories) return [];
    if (categoryFilter === 'ALL') return progressData.categories;
    return progressData.categories.filter((c: any) => c.category === categoryFilter);
  }, [progressData, categoryFilter]);

  // Group targets list
  const groupTargets = useMemo(() => {
    return allTargets.filter((t) => t.sales_person_id === null || t.sales_person_id === undefined);
  }, [allTargets]);

  // Staff targets list
  const staffTargets = useMemo(() => {
    return allTargets.filter((t) => t.sales_person_id !== null && t.sales_person_id !== undefined);
  }, [allTargets]);

  // Helper for progress bar color threshold
  const getProgressColor = (color: string) => {
    switch (color) {
      case 'purple':
        return {
          bar: 'bg-purple-600',
          bg: 'bg-purple-50',
          text: 'text-purple-700',
          border: 'border-purple-200',
          badge: 'bg-purple-100 text-purple-800',
        };
      case 'green':
        return {
          bar: 'bg-emerald-500',
          bg: 'bg-emerald-50',
          text: 'text-emerald-700',
          border: 'border-emerald-200',
          badge: 'bg-emerald-100 text-emerald-800',
        };
      case 'amber':
        return {
          bar: 'bg-amber-500',
          bg: 'bg-amber-50',
          text: 'text-amber-700',
          border: 'border-amber-200',
          badge: 'bg-amber-100 text-amber-800',
        };
      default:
        return {
          bar: 'bg-rose-500',
          bg: 'bg-rose-50',
          text: 'text-rose-700',
          border: 'border-rose-200',
          badge: 'bg-rose-100 text-rose-800',
        };
    }
  };

  const getCategoryTheme = (cat: string) => {
    switch (cat) {
      case 'RETAIL':
        return {
          name: 'Retail Sales Group',
          desc: 'Showroom floor walk-in sales & counter billing',
          badge: 'bg-amber-100 text-amber-900 border-amber-300',
          iconColor: 'text-amber-600',
        };
      case 'PROJECT':
        return {
          name: 'B2B Project Sales',
          desc: 'Architects, builders, developers & commercial contracts',
          badge: 'bg-blue-100 text-blue-900 border-blue-300',
          iconColor: 'text-blue-600',
        };
      case 'MANAGEMENT':
        return {
          name: 'Management Group',
          desc: 'Store managers, team leads & senior sales coordinators',
          badge: 'bg-purple-100 text-purple-900 border-purple-300',
          iconColor: 'text-purple-600',
        };
      case 'COMPANY':
        return {
          name: 'Executive Key Accounts',
          desc: 'Direct company contracts & executive corporate orders',
          badge: 'bg-slate-100 text-slate-900 border-slate-300',
          iconColor: 'text-slate-600',
        };
      default:
        return {
          name: cat,
          desc: '',
          badge: 'bg-slate-100 text-slate-800',
          iconColor: 'text-slate-600',
        };
    }
  };

  return (
    <div className="flex-1 p-4 sm:p-5 lg:p-6 space-y-5 overflow-y-auto w-full min-w-0 bg-[#F8FAFC]">
      {/* 1. Header with Controls & Action Buttons */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-lg bg-indigo-600 text-white flex items-center justify-center shadow-xs">
              <Target size={20} />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900 leading-tight">
                Sales Targets & Category Performance Engine
              </h1>
              <p className="text-xs text-slate-500">
                Group-level milestone tracking, staff targets, projected run-rates & closed revenue
              </p>
            </div>
          </div>
        </div>

        {/* Global Controls & Period Switcher */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Period Type */}
          <select
            className="input input-sm text-xs font-semibold py-1 px-2.5 border-slate-300 bg-slate-50 text-slate-700"
            value={selectedPeriodType}
            onChange={(e) => setSelectedPeriodType(e.target.value as any)}
          >
            <option value="MONTHLY">Monthly Target</option>
            <option value="QUARTERLY">Quarterly Target</option>
            <option value="YEARLY">Annual Target</option>
          </select>

          {/* Month selector (if monthly) */}
          {selectedPeriodType === 'MONTHLY' && (
            <select
              className="input input-sm text-xs font-semibold py-1 px-2.5 border-slate-300 bg-slate-50 text-slate-700"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(parseInt(e.target.value, 10))}
            >
              {[
                'January',
                'February',
                'March',
                'April',
                'May',
                'June',
                'July',
                'August',
                'September',
                'October',
                'November',
                'December',
              ].map((m, idx) => (
                <option key={m} value={idx + 1}>
                  {m}
                </option>
              ))}
            </select>
          )}

          {/* Year selector */}
          <select
            className="input input-sm text-xs font-semibold py-1 px-2.5 border-slate-300 bg-slate-50 text-slate-700"
            value={selectedYear}
            onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
          >
            {[2024, 2025, 2026, 2027, 2028].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>

          {/* Refresh */}
          <button
            onClick={loadAllData}
            className="btn btn-secondary btn-sm flex items-center space-x-1 border-slate-300 text-slate-700 hover:bg-slate-100"
            title="Refresh All Target Data"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          {/* 1-Click Rollover / Clone Button */}
          {isAdminOrManager && (
            <button
              onClick={() => setRolloverModalOpen(true)}
              className="btn btn-secondary btn-sm flex items-center space-x-1.5 border-indigo-200 text-indigo-700 bg-indigo-50/70 hover:bg-indigo-100 font-semibold"
              title="Rollover targets from previous month"
            >
              <Copy size={13} />
              <span>Rollover Targets</span>
            </button>
          )}

          {/* Set New Target */}
          {isAdminOrManager && (
            <button
              onClick={() => openNewTargetModal('group', 'RETAIL')}
              className="btn btn-primary btn-sm flex items-center space-x-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold shadow-xs"
            >
              <Plus size={14} />
              <span>Set Target</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. Top Grand KPI Summary Ribbon */}
      {progressData?.summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
              Total Target (All Groups)
            </span>
            <div className="mt-1 flex items-baseline space-x-1">
              <span className="text-xl font-black text-slate-900 font-mono">
                ₹ {formatCurrency(progressData.summary.total_allocated_target)}
              </span>
            </div>
            <span className="text-[10px] text-slate-400 mt-0.5 block">Allocated revenue target</span>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
              Total Achieved Revenue
            </span>
            <div className="mt-1 flex items-baseline space-x-1">
              <span className="text-xl font-black text-emerald-600 font-mono">
                ₹ {formatCurrency(progressData.summary.total_achieved_revenue)}
              </span>
            </div>
            <span className="text-[10px] text-emerald-600 font-semibold mt-0.5 block">
              {progressData.summary.total_closed_quotes} Closed Quotations
            </span>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
              Grand Achievement
            </span>
            <div className="mt-1 flex items-baseline space-x-2">
              <span className="text-xl font-black text-indigo-600 font-mono">
                {progressData.summary.grand_achievement_pct}%
              </span>
              <span className="text-[11px] text-slate-500">
                ({progressData.period?.days_elapsed || 0}/{progressData.period?.total_days || 30} days)
              </span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-1.5 mt-1.5 overflow-hidden">
              <div
                className="bg-indigo-600 h-1.5 rounded-full"
                style={{ width: `${Math.min(100, progressData.summary.grand_achievement_pct)}%` }}
              />
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
              Active Category Groups
            </span>
            <div className="mt-1 flex items-baseline space-x-1">
              <span className="text-xl font-black text-slate-800 font-mono">4 Categories</span>
            </div>
            <span className="text-[10px] text-slate-400 mt-0.5 block">Retail • Project • Management • Company</span>
          </div>
        </div>
      )}

      {/* 3. Navigation Tabs */}
      <div className="flex border-b border-slate-200 gap-1">
        <button
          onClick={() => setActiveTab('visual')}
          className={`py-2 px-4 text-xs font-bold rounded-t-lg transition-colors flex items-center space-x-2 border-b-2 ${
            activeTab === 'visual'
              ? 'border-indigo-600 text-indigo-700 bg-white shadow-2xs'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100/60'
          }`}
        >
          <TrendingUp size={14} />
          <span>Target vs. Achievement Tracker (Visual)</span>
        </button>

        <button
          onClick={() => setActiveTab('group')}
          className={`py-2 px-4 text-xs font-bold rounded-t-lg transition-colors flex items-center space-x-2 border-b-2 ${
            activeTab === 'group'
              ? 'border-indigo-600 text-indigo-700 bg-white shadow-2xs'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100/60'
          }`}
        >
          <Layers size={14} />
          <span>Category Group Targets ({groupTargets.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('staff')}
          className={`py-2 px-4 text-xs font-bold rounded-t-lg transition-colors flex items-center space-x-2 border-b-2 ${
            activeTab === 'staff'
              ? 'border-indigo-600 text-indigo-700 bg-white shadow-2xs'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100/60'
          }`}
        >
          <Users size={14} />
          <span>Staff Target Allocations ({staffTargets.length})</span>
        </button>
      </div>

      {/* ======================================================== */}
      {/* TAB 1: VISUAL TARGET VS ACHIEVEMENT TRACKER               */}
      {/* ======================================================== */}
      {activeTab === 'visual' && (
        <div className="space-y-4">
          {/* Category Filter Chips */}
          <div className="flex items-center space-x-2 text-xs">
            <span className="font-bold text-slate-500">Filter Group:</span>
            {['ALL', 'RETAIL', 'PROJECT', 'MANAGEMENT', 'COMPANY'].map((cat) => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={`px-3 py-1 rounded-full font-bold transition-colors ${
                  categoryFilter === cat
                    ? 'bg-[#0D1B2A] text-white shadow-xs'
                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                {cat === 'ALL' ? 'All 4 Categories' : cat}
              </button>
            ))}
          </div>

          {/* Category Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {displayedCategories.map((catData: any) => {
              const theme = getCategoryTheme(catData.category);
              const colors = getProgressColor(catData.status_color);
              const isExpanded = Boolean(expandedCategories[catData.category]);
              const isSurplus = catData.shortfall_or_surplus >= 0;

              return (
                <div
                  key={catData.category}
                  className="bg-white rounded-xl border border-slate-200/90 shadow-xs overflow-hidden transition-shadow hover:shadow-md"
                >
                  {/* Card Header */}
                  <div className="p-5 border-b border-slate-100">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center space-x-2">
                          <span
                            className={`px-2.5 py-0.5 rounded-md text-[11px] font-black uppercase tracking-wider border ${theme.badge}`}
                          >
                            {catData.category}
                          </span>
                          <span className="text-xs font-bold text-slate-700">{theme.name}</span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1">{theme.desc}</p>
                      </div>

                      {/* Percentage Badge */}
                      <span className={`px-2.5 py-1 rounded-lg text-xs font-black font-mono border ${colors.badge} ${colors.border}`}>
                        {catData.achievement_pct}%
                      </span>
                    </div>

                    {/* Progress Bar with Color Thresholds */}
                    <div className="mt-4 space-y-1.5">
                      <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                        <div
                          className={`h-2.5 rounded-full transition-all duration-500 ${colors.bar}`}
                          style={{ width: `${Math.min(100, Math.max(2, catData.achievement_pct))}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-[11px] text-slate-400 font-medium">
                        <span>Threshold: Red &lt;50% • Amber 50-79% • Green ≥80% • Purple &gt;100%</span>
                        <span className="font-bold text-slate-600 font-mono">{catData.achievement_pct}%</span>
                      </div>
                    </div>

                    {/* Core Financial Metrics */}
                    <div className="grid grid-cols-3 gap-2.5 mt-4 pt-4 border-t border-slate-100">
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                          Allocated Target
                        </span>
                        <span className="text-sm font-bold text-slate-800 font-mono block mt-0.5">
                          ₹ {formatCurrency(catData.allocated_target)}
                        </span>
                        {catData.allocated_volume_sqft > 0 && (
                          <span className="text-[10px] text-slate-400 block font-mono">
                            {formatCurrency(catData.allocated_volume_sqft)} sq.ft
                          </span>
                        )}
                      </div>

                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                          Achieved Sales
                        </span>
                        <span className="text-sm font-bold text-emerald-600 font-mono block mt-0.5">
                          ₹ {formatCurrency(catData.achieved_revenue)}
                        </span>
                        <span className="text-[10px] text-emerald-600 font-medium block">
                          {catData.closed_quotes_count} Closed Quotes
                        </span>
                      </div>

                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                          {isSurplus ? 'Surplus' : 'Shortfall'}
                        </span>
                        <div className="flex items-center space-x-1 mt-0.5">
                          {isSurplus ? (
                            <ArrowUpRight size={13} className="text-purple-600" />
                          ) : (
                            <ArrowDownRight size={13} className="text-rose-500" />
                          )}
                          <span
                            className={`text-sm font-bold font-mono ${
                              isSurplus ? 'text-purple-700' : 'text-rose-600'
                            }`}
                          >
                            ₹ {formatCurrency(Math.abs(catData.shortfall_or_surplus))}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-400 block">
                          {isSurplus ? 'Ahead of target' : 'Behind target'}
                        </span>
                      </div>
                    </div>

                    {/* Projected Run-Rate Indicator Banner */}
                    <div className="mt-3.5 bg-slate-50 rounded-lg p-2.5 flex items-center justify-between border border-slate-200/60">
                      <div className="flex items-center space-x-2 text-xs">
                        <Zap size={14} className="text-amber-500" />
                        <span className="font-bold text-slate-700">Projected Month-End Run-Rate:</span>
                        <span className="font-mono font-bold text-indigo-700">
                          ₹ {formatCurrency(catData.projected_month_end)}
                        </span>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-100 text-indigo-800">
                        {catData.projected_pct}% projected
                      </span>
                    </div>
                  </div>

                  {/* Accordion Toggle for Staff Drilldown */}
                  <button
                    type="button"
                    onClick={() => toggleCategoryExpand(catData.category)}
                    className="w-full px-5 py-2.5 bg-slate-50/80 hover:bg-slate-100 text-xs font-bold text-slate-600 flex items-center justify-between transition-colors border-t border-slate-100"
                  >
                    <div className="flex items-center space-x-2">
                      <Users size={13} className="text-slate-400" />
                      <span>
                        Staff Contributors Breakdown ({catData.contributors?.length || 0} Staff Members)
                      </span>
                    </div>
                    {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                  </button>

                  {/* Interactive Staff Contributors List */}
                  {isExpanded && (
                    <div className="p-4 bg-slate-50/50 border-t border-slate-200 divide-y divide-slate-100 text-xs">
                      {catData.contributors?.length === 0 ? (
                        <p className="text-center py-4 text-slate-400 text-xs italic">
                          No staff members assigned to category {catData.category} yet.
                        </p>
                      ) : (
                        <table className="w-full text-left">
                          <thead>
                            <tr className="text-[10px] uppercase font-bold text-slate-400 border-b border-slate-200 pb-1">
                              <th className="pb-1.5">Staff Member</th>
                              <th className="pb-1.5 text-right">Target</th>
                              <th className="pb-1.5 text-right">Achieved</th>
                              <th className="pb-1.5 text-center">Deals</th>
                              <th className="pb-1.5 text-right">% Ach</th>
                              {isAdminOrManager && <th className="pb-1.5 text-right">Action</th>}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {catData.contributors.map((c: any) => (
                              <tr key={c.id} className="hover:bg-white transition-colors">
                                <td className="py-2 font-semibold text-slate-800">
                                  <span>{c.name}</span>
                                  <span className="block text-[10px] text-slate-400 capitalize">{c.role}</span>
                                </td>
                                <td className="py-2 text-right font-mono text-slate-600">
                                  ₹ {formatCurrency(c.target_amount)}
                                </td>
                                <td className="py-2 text-right font-mono font-bold text-emerald-600">
                                  ₹ {formatCurrency(c.achieved_amount)}
                                </td>
                                <td className="py-2 text-center font-mono text-slate-600">
                                  {c.closed_quotes_count}
                                </td>
                                <td className="py-2 text-right font-mono font-bold">
                                  <span
                                    className={`px-1.5 py-0.5 rounded text-[10px] ${
                                      c.achievement_pct >= 100
                                        ? 'bg-purple-100 text-purple-700'
                                        : c.achievement_pct >= 80
                                        ? 'bg-emerald-100 text-emerald-700'
                                        : c.achievement_pct >= 50
                                        ? 'bg-amber-100 text-amber-700'
                                        : 'bg-rose-100 text-rose-700'
                                    }`}
                                  >
                                    {c.achievement_pct}%
                                  </span>
                                </td>
                                {isAdminOrManager && (
                                  <td className="py-2 text-right">
                                    <button
                                      type="button"
                                      onClick={() => openNewTargetModal('staff', catData.category, c.id)}
                                      className="p-1 text-slate-400 hover:text-indigo-600 transition-colors"
                                      title="Edit target allocation"
                                    >
                                      <Edit2 size={12} />
                                    </button>
                                  </td>
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 2: CATEGORY GROUP TARGETS                            */}
      {/* ======================================================== */}
      {activeTab === 'group' && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50/70">
            <div>
              <h3 className="font-bold text-slate-900 text-sm">Defined Category Group Targets</h3>
              <p className="text-xs text-slate-500">
                Overall group goals assigned to Retail, Project, Management, and Executive company categories
              </p>
            </div>
            {isAdminOrManager && (
              <button
                onClick={() => openNewTargetModal('group', 'RETAIL')}
                className="btn btn-primary btn-sm flex items-center space-x-1.5"
              >
                <Plus size={13} />
                <span>Assign Group Target</span>
              </button>
            )}
          </div>

          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-100 text-slate-700 font-bold uppercase text-[10px] border-b border-slate-200">
                <th className="py-3 px-4">Sales Category</th>
                <th className="py-3 px-3">Period Type</th>
                <th className="py-3 px-3">Date Range</th>
                <th className="py-3 px-3 text-right">Revenue Target (₹)</th>
                <th className="py-3 px-3 text-right">Volume (Sq.ft)</th>
                <th className="py-3 px-3">Notes</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {groupTargets.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400 text-xs">
                    No category group targets set for this period. Click "Assign Group Target" above.
                  </td>
                </tr>
              ) : (
                groupTargets.map((gt) => (
                  <tr key={gt.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 font-bold text-slate-900">
                      <span className="px-2.5 py-0.5 rounded-md bg-indigo-100 text-indigo-800 font-black text-[10px]">
                        {gt.category}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-semibold text-slate-700">{gt.period_type || gt.target_type}</td>
                    <td className="py-3 px-3 text-slate-600 font-mono text-[11px]">
                      {gt.start_date} to {gt.end_date}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-indigo-700 text-sm">
                      ₹ {formatCurrency(gt.target_amount)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-slate-600">
                      {formatCurrency(gt.target_volume_sqft || 0)}
                    </td>
                    <td className="py-3 px-3 text-slate-500 max-w-xs truncate">{gt.notes || '—'}</td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end space-x-2">
                        <button
                          type="button"
                          onClick={() => openNewTargetModal('group', gt.category)}
                          className="text-slate-400 hover:text-indigo-600"
                          title="Edit group target"
                        >
                          <Edit2 size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteTarget(gt.id)}
                          className="text-slate-400 hover:text-rose-600"
                          title="Delete target"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 3: STAFF TARGET ALLOCATIONS                          */}
      {/* ======================================================== */}
      {activeTab === 'staff' && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50/70">
            <div>
              <h3 className="font-bold text-slate-900 text-sm">Individual Staff Targets & Achievements</h3>
              <p className="text-xs text-slate-500">
                Detailed staff targets breakdown by salesperson and coordinator
              </p>
            </div>
            {isAdminOrManager && (
              <button
                onClick={() => openNewTargetModal('staff', 'RETAIL')}
                className="btn btn-primary btn-sm flex items-center space-x-1.5"
              >
                <Plus size={13} />
                <span>Assign Staff Target</span>
              </button>
            )}
          </div>

          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-100 text-slate-700 font-bold uppercase text-[10px] border-b border-slate-200">
                <th className="py-3 px-4">Staff Member</th>
                <th className="py-3 px-3">Sales Category</th>
                <th className="py-3 px-3">Role</th>
                <th className="py-3 px-3 text-right">Target (₹)</th>
                <th className="py-3 px-3 text-right">Achieved (₹)</th>
                <th className="py-3 px-3 text-right">Achievement %</th>
                <th className="py-3 px-3 text-right">Shortfall / Surplus</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {performance.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400 text-xs">
                    No individual performance data found for this period.
                  </td>
                </tr>
              ) : (
                performance.map((p) => {
                  const isAhead = (p.difference ?? 0) >= 0;
                  return (
                    <tr key={p.salesperson.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-bold text-slate-900">{p.salesperson.full_name}</td>
                      <td className="py-3 px-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 text-slate-700">
                          {p.salesperson.sales_category || 'RETAIL'}
                        </span>
                      </td>
                      <td className="py-3 px-3 capitalize text-slate-500">{p.salesperson.role}</td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-slate-800">
                        ₹ {formatCurrency(p.target)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-emerald-600">
                        ₹ {formatCurrency(p.achieved)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] ${
                            p.percentage >= 100
                              ? 'bg-purple-100 text-purple-700'
                              : p.percentage >= 80
                              ? 'bg-emerald-100 text-emerald-700'
                              : p.percentage >= 50
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-rose-100 text-rose-700'
                          }`}
                        >
                          {p.percentage}%
                        </span>
                      </td>
                      <td
                        className={`py-3 px-3 text-right font-mono font-semibold ${
                          isAhead ? 'text-purple-700' : 'text-rose-600'
                        }`}
                      >
                        {isAhead ? '+' : ''}₹ {formatCurrency(p.difference)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => handleOpenEditTarget(p.salesperson, p.target)}
                          className="btn btn-secondary btn-xs text-xs"
                        >
                          Edit Target
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 1: SET / ALLOCATE TARGET (GROUP OR STAFF)          */}
      {/* ======================================================== */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="card w-full max-w-lg overflow-hidden shadow-2xl border border-slate-200">
            <div className="bg-[#0D1B2A] text-white p-4 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Target size={18} className="text-amber-400" />
                <h3 className="font-bold text-sm">
                  {targetScope === 'group' ? 'Configure Category Group Target' : 'Configure Staff Member Target'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveTargetAllocation} className="p-5 space-y-4">
              {/* Target Scope Switcher */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Target Allocation Level *</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setTargetScope('group')}
                    className={`py-2 px-3 text-xs font-bold rounded-lg border transition-colors flex items-center justify-center space-x-1.5 ${
                      targetScope === 'group'
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <Layers size={14} />
                    <span>Entire Category Group</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setTargetScope('staff')}
                    className={`py-2 px-3 text-xs font-bold rounded-lg border transition-colors flex items-center justify-center space-x-1.5 ${
                      targetScope === 'staff'
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <Users size={14} />
                    <span>Specific Staff Member</span>
                  </button>
                </div>
              </div>

              {/* Category & Staff Member */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Sales Category *</label>
                  <select
                    className="input input-sm text-xs w-full font-semibold"
                    value={targetCategory}
                    onChange={(e) => setTargetCategory(e.target.value as SalesCategory)}
                  >
                    <option value="RETAIL">Retail (Walk-in showroom)</option>
                    <option value="PROJECT">Project (Architect / B2B)</option>
                    <option value="MANAGEMENT">Management (Leads / Coordinators)</option>
                    <option value="COMPANY">Company (Executive accounts)</option>
                  </select>
                </div>

                {targetScope === 'staff' && (
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Select Staff Member *</label>
                    <select
                      className="input input-sm text-xs w-full font-semibold"
                      value={targetStaffId || ''}
                      onChange={(e) => setTargetStaffId(parseInt(e.target.value, 10))}
                      required
                    >
                      <option value="">-- Choose Staff --</option>
                      {allUsers
                        .filter((u) => u.is_active !== false)
                        .map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.full_name} ({u.role})
                          </option>
                        ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Period Type */}
              <div className="grid grid-cols-3 gap-2">
                {(['MONTHLY', 'QUARTERLY', 'YEARLY'] as const).map((pt) => (
                  <button
                    key={pt}
                    type="button"
                    onClick={() => setTargetPeriodType(pt)}
                    className={`py-1.5 text-xs font-bold rounded-lg border transition-colors ${
                      targetPeriodType === pt
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {pt}
                  </button>
                ))}
              </div>

              {/* Metrics: Target Revenue (₹) & Volume (Sq.ft) */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Revenue Target (INR ₹) *</label>
                  <input
                    type="number"
                    step="50000"
                    className="input input-sm text-xs font-mono font-bold w-full"
                    value={targetAmount}
                    onChange={(e) => setTargetAmount(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Volume Target (Sq.ft / Boxes)</label>
                  <input
                    type="number"
                    step="500"
                    className="input input-sm text-xs font-mono font-bold w-full"
                    value={targetVolumeSqft}
                    onChange={(e) => setTargetVolumeSqft(e.target.value)}
                    placeholder="0"
                  />
                </div>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Start Date *</label>
                  <input
                    type="date"
                    className="input input-sm text-xs font-mono w-full"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">End Date *</label>
                  <input
                    type="date"
                    className="input input-sm text-xs font-mono w-full"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    required
                  />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Notes / Strategic Goals</label>
                <textarea
                  rows={2}
                  className="input text-xs w-full py-1.5"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional milestones or special instructions..."
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  disabled={savingTarget}
                  className="btn btn-secondary btn-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingTarget}
                  className="btn btn-primary btn-sm bg-indigo-600 hover:bg-indigo-500 text-white font-bold"
                >
                  {savingTarget ? 'Saving Target...' : 'Save Target Allocation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 2: 1-CLICK ROLLOVER / CLONE TARGETS                */}
      {/* ======================================================== */}
      {rolloverModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="card w-full max-w-md overflow-hidden shadow-2xl border border-slate-200">
            <div className="bg-[#0D1B2A] text-white p-4 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Copy size={18} className="text-indigo-400" />
                <h3 className="font-bold text-sm">Rollover / Clone Previous Targets</h3>
              </div>
              <button
                type="button"
                onClick={() => setRolloverModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleExecuteRollover} className="p-5 space-y-4">
              <p className="text-xs text-slate-500">
                Duplicate all group and individual targets from a past period into the target period with optional
                percentage adjustment.
              </p>

              {/* Source Period */}
              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">Source Month</label>
                  <select
                    className="input input-sm text-xs w-full"
                    value={sourceMonth}
                    onChange={(e) => setSourceMonth(parseInt(e.target.value, 10))}
                  >
                    {[
                      'January',
                      'February',
                      'March',
                      'April',
                      'May',
                      'June',
                      'July',
                      'August',
                      'September',
                      'October',
                      'November',
                      'December',
                    ].map((m, idx) => (
                      <option key={m} value={idx + 1}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">Source Year</label>
                  <select
                    className="input input-sm text-xs w-full"
                    value={sourceYear}
                    onChange={(e) => setSourceYear(parseInt(e.target.value, 10))}
                  >
                    {[2024, 2025, 2026, 2027].map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Target Period */}
              <div className="grid grid-cols-2 gap-3 bg-indigo-50/50 p-3 rounded-lg border border-indigo-200">
                <div>
                  <label className="block text-[11px] font-bold text-indigo-900 mb-1">Target Month</label>
                  <select
                    className="input input-sm text-xs w-full"
                    value={targetMonth}
                    onChange={(e) => setTargetMonth(parseInt(e.target.value, 10))}
                  >
                    {[
                      'January',
                      'February',
                      'March',
                      'April',
                      'May',
                      'June',
                      'July',
                      'August',
                      'September',
                      'October',
                      'November',
                      'December',
                    ].map((m, idx) => (
                      <option key={m} value={idx + 1}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-indigo-900 mb-1">Target Year</label>
                  <select
                    className="input input-sm text-xs w-full"
                    value={targetYear}
                    onChange={(e) => setTargetYear(parseInt(e.target.value, 10))}
                  >
                    {[2025, 2026, 2027, 2028].map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Adjustment % */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Target Adjustment Percentage (% Growth)
                </label>
                <div className="flex items-center space-x-2">
                  <input
                    type="number"
                    step="5"
                    className="input input-sm text-xs font-mono font-bold w-full"
                    value={adjustmentPct}
                    onChange={(e) => setAdjustmentPct(parseFloat(e.target.value) || 0)}
                    placeholder="0"
                  />
                  <span className="text-xs font-bold text-slate-500">%</span>
                </div>
                <span className="text-[10px] text-slate-400 mt-0.5 block">
                  Example: +10% will increase all rolled-over targets by 10%.
                </span>
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setRolloverModalOpen(false)}
                  disabled={rollingOver}
                  className="btn btn-secondary btn-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={rollingOver}
                  className="btn btn-primary btn-sm bg-indigo-600 hover:bg-indigo-500 text-white font-bold"
                >
                  {rollingOver ? 'Cloning Targets...' : 'Execute Rollover'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 3: QUICK EDIT STAFF MONTHLY TARGET                 */}
      {/* ======================================================== */}
      {editTargetModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="card w-full max-w-sm overflow-hidden shadow-2xl border border-slate-200">
            <div className="bg-[#0D1B2A] text-white p-4 flex items-center justify-between">
              <h3 className="font-bold text-sm">Edit Target: {editTargetModal.name}</h3>
              <button
                type="button"
                onClick={() => setEditTargetModal(null)}
                className="text-slate-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleSaveQuickEdit} className="p-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Monthly Target (INR ₹)</label>
                <input
                  type="number"
                  step="50000"
                  className="input input-sm text-xs font-mono font-bold w-full"
                  value={editTargetValue}
                  onChange={(e) => setEditTargetValue(e.target.value)}
                  required
                />
              </div>
              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setEditTargetModal(null)}
                  disabled={savingQuickEdit}
                  className="btn btn-secondary btn-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingQuickEdit}
                  className="btn btn-primary btn-sm"
                >
                  {savingQuickEdit ? 'Saving...' : 'Update'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
