import React, { useState, useEffect } from 'react';
import { useServer } from '../context/ServerContext';
import { useAuth } from '../context/AuthContext';
import { Target, TrendingUp, Plus, RefreshCw, X, Award, CheckCircle, Edit2 } from 'lucide-react';

export const TargetsManagement: React.FC = () => {
  const { fetchApi, subscribeToEvents } = useServer();
  const { user } = useAuth();

  const [performance, setPerformance] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<any[]>([]);

  // New Target Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [salesPersonId, setSalesPersonId] = useState<number>(0);
  const [targetType, setTargetType] = useState('Monthly');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [targetAmount, setTargetAmount] = useState('1000000');
  const [periodLabel, setPeriodLabel] = useState('');
  const [notes, setNotes] = useState('');

  // Quick Edit Target Modal for Store Managers
  const [editTargetModal, setEditTargetModal] = useState<{ id: number; name: string; target: number } | null>(null);
  const [editTargetValue, setEditTargetValue] = useState<string>('');
  const [savingTarget, setSavingTarget] = useState(false);

  const isAdminOrManager = ['admin', 'manager'].includes(user?.role?.toLowerCase() || '');
  const isSalesperson = user?.role?.toLowerCase() === 'salesperson';

  const visiblePerformance = isSalesperson
    ? performance.filter((p) => p.salesperson?.id === user?.id)
    : performance;

  const loadPerformance = async () => {
    setLoading(true);
    try {
      const res = await fetchApi('/api/targets/performance');
      setPerformance(res.performance || []);

      if (isAdminOrManager) {
        const uRes = await fetchApi('/api/users');
        const salesStaff = (uRes.users || []).filter((u: any) =>
          ['salesperson', 'manager'].includes(u.role)
        );
        setUsers(salesStaff);
        if (salesStaff.length > 0 && !salesPersonId) {
          setSalesPersonId(salesStaff[0].id);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPerformance();
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToEvents((event) => {
      if (['TARGET_UPDATED', 'QUOTATION_STATUS_CHANGED'].includes(event.type)) {
        loadPerformance();
      }
    });
    return () => unsubscribe();
  }, []);

  const getDatesForType = (type: string) => {
    const now = new Date();
    if (type === 'Monthly') {
      const year = now.getFullYear();
      const month = now.getMonth();
      const firstDay = new Date(year, month, 1);
      const lastDay = new Date(year, month + 1, 0);
      const fDay = `${firstDay.getFullYear()}-${String(firstDay.getMonth() + 1).padStart(2, '0')}-01`;
      const lDay = `${lastDay.getFullYear()}-${String(lastDay.getMonth() + 1).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}`;
      return { start: fDay, end: lDay };
    } else if (type === 'Weekly') {
      const day = now.getDay();
      const diffToMon = now.getDate() - day + (day === 0 ? -6 : 1);
      const mon = new Date(now.setDate(diffToMon));
      const sun = new Date(mon);
      sun.setDate(mon.getDate() + 6);
      return {
        start: mon.toISOString().split('T')[0],
        end: sun.toISOString().split('T')[0],
      };
    } else if (type === 'Daily') {
      const today = new Date().toISOString().split('T')[0];
      return { start: today, end: today };
    }
    const today = new Date().toISOString().split('T')[0];
    return { start: today, end: today };
  };

  const handleTargetTypeChange = (type: string) => {
    setTargetType(type);
    if (type !== 'Custom') {
      const { start, end } = getDatesForType(type);
      setStartDate(start);
      setEndDate(end);
    }
  };

  const openSetTargetModal = (spId?: number) => {
    const targetId = spId || salesPersonId || (users[0]?.id ?? 0);
    setSalesPersonId(targetId);
    const found = performance.find((p) => p.salesperson.id === targetId);
    if (found && found.target > 0) {
      setTargetAmount(String(found.target));
    } else {
      setTargetAmount('500000');
    }
    const { start, end } = getDatesForType('Monthly');
    setTargetType('Monthly');
    setStartDate(start);
    setEndDate(end);
    setPeriodLabel('Monthly Target');
    setModalOpen(true);
  };

  const handleSalesPersonChange = (id: number) => {
    setSalesPersonId(id);
    const found = performance.find((p) => p.salesperson.id === id);
    if (found && found.target > 0) {
      setTargetAmount(String(found.target));
    }
  };

  const handleCreateTarget = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await fetchApi('/api/targets', {
        method: 'POST',
        body: JSON.stringify({
          sales_person_id: salesPersonId,
          target_type: targetType,
          start_date: startDate,
          end_date: endDate,
          target_amount: parseFloat(targetAmount),
          period_label: periodLabel || `${targetType} Target`,
          notes,
        }),
      });

      setModalOpen(false);
      loadPerformance();
    } catch (err: any) {
      alert(err.message || 'Failed to update target');
    }
  };

  const handleOpenEditTarget = (sp: any, currentTarget: number) => {
    setEditTargetModal({ id: sp.id, name: sp.full_name, target: currentTarget });
    setEditTargetValue(String(currentTarget || ''));
  };

  const handleSaveTarget = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTargetModal) return;
    setSavingTarget(true);
    try {
      await fetchApi(`/api/targets/salesperson/${editTargetModal.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          monthly_target: parseFloat(editTargetValue) || 0,
        }),
      });
      setEditTargetModal(null);
      loadPerformance();
    } catch (err: any) {
      alert(err.message || 'Failed to update target');
    } finally {
      setSavingTarget(false);
    }
  };

  const formatCurrency = (val: number) => {
    return Number(val || 0).toLocaleString('en-IN', {
      maximumFractionDigits: 0,
      minimumFractionDigits: 0,
    });
  };

  return (
    <div className="flex-1 p-4 sm:p-5 lg:p-6 space-y-4 lg:space-y-6 overflow-y-auto w-full min-w-0">
      {/* Top Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            {isSalesperson ? 'My Sales Milestone & Performance' : 'Sales Targets & Performance'}
          </h1>
          <p className="text-xs text-gray-500">
            {isSalesperson
              ? 'Track your personal closed deals, monthly targets, collections, and progress'
              : 'Real-time tracking of salesperson milestones, targets, and approved revenue'}
          </p>
        </div>
        <div className="flex space-x-2">
          <button onClick={loadPerformance} className="btn btn-secondary btn-sm flex items-center space-x-1">
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
          {isAdminOrManager && (
            <button onClick={() => openSetTargetModal()} className="btn btn-primary btn-sm flex items-center space-x-1">
              <Plus size={14} />
              <span>Set Target</span>
            </button>
          )}
        </div>
      </div>

      {/* Performance Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 lg:gap-6">
        {loading && visiblePerformance.length === 0 ? (
          <div className="col-span-full text-center py-12 text-gray-400">Loading performance data...</div>
        ) : visiblePerformance.length === 0 ? (
          <div className="col-span-full text-center py-12 text-gray-400">
            {isSalesperson ? 'No performance targets assigned yet.' : 'No active salesperson targets found.'}
          </div>
        ) : (
          visiblePerformance.map((p) => {
            const pct = Math.min(100, p.percentage);
            const isAhead = (p.difference ?? 0) >= 0;

            return (
              <div key={p.salesperson.id} className="card card-hover p-5 space-y-4">
                <div className="flex justify-between items-start">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-full bg-[#E0E1DD] text-[#1B263B] font-bold flex items-center justify-center text-sm border border-[#CBD5E1] shadow-sm">
                      {p.salesperson.full_name.charAt(0)}
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900 text-sm">{p.salesperson.full_name}</h3>
                      <p className="text-xs text-gray-500">{p.salesperson.email || p.salesperson.phone}</p>
                    </div>
                  </div>
                  <span className="badge badge-approved text-xs">
                    {p.quotationsCount} Closed Deals
                  </span>
                </div>

                {/* Progress Bar */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">Progress to Target</span>
                    <span className="font-bold text-gray-900">{p.percentage}%</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                    <div
                      className={`h-2.5 rounded-full transition-all duration-500 ${
                        p.percentage >= 100 ? 'bg-green-600' : 'bg-primary'
                      }`}
                      style={{ width: `${pct}%` }}
                    ></div>
                  </div>
                </div>

                {/* Numbers Grid */}
                <div className="grid grid-cols-3 gap-2 p-3 bg-gray-50 rounded border border-gray-100 text-center text-xs">
                  <div>
                    <div className="flex items-center justify-center space-x-1 text-gray-400 text-[10px]">
                      <span>Target</span>
                      {isAdminOrManager && (
                        <button
                          type="button"
                          onClick={() => handleOpenEditTarget(p.salesperson, p.target)}
                          className="text-primary hover:text-blue-800 p-0.5 rounded"
                          title="Edit target"
                        >
                          <Edit2 size={10} />
                        </button>
                      )}
                    </div>
                    <p className="font-bold text-gray-800 mt-0.5">₹ {formatCurrency(p.target)}</p>
                  </div>
                  <div>
                    <p className="text-gray-400 text-[10px]">Achieved</p>
                    <p className="font-bold text-green-700 mt-0.5">₹ {formatCurrency(p.achieved)}</p>
                  </div>
                  <div>
                    <p className="text-gray-400 text-[10px]">Collections</p>
                    <p className="font-bold text-blue-700 mt-0.5">₹ {formatCurrency(p.collected)}</p>
                  </div>
                </div>

                <div className="text-[11px] flex justify-between items-center text-gray-500">
                  <span>Variance:</span>
                  <span className={`font-bold ${isAhead ? 'text-green-700' : 'text-amber-700'}`}>
                    {isAhead
                      ? `+ ₹ ${formatCurrency(p.difference || 0)} (Achieved)`
                      : `- ₹ ${formatCurrency(Math.abs(p.difference || 0))} (Shortfall)`}
                  </span>
                </div>

                {isAdminOrManager && (
                  <div className="pt-2 border-t border-gray-100 flex justify-end">
                    <button
                      type="button"
                      onClick={() => handleOpenEditTarget(p.salesperson, p.target)}
                      className="text-xs text-primary hover:text-blue-800 font-semibold flex items-center space-x-1"
                    >
                      <Edit2 size={12} />
                      <span>Edit Target Amount</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Edit Target Modal for Store Managers & Admins */}
      {editTargetModal && (
        <div className="modal-overlay">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm p-5 border border-gray-200">
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-sm font-bold text-gray-900">
                Edit Target: {editTargetModal.name}
              </h2>
              <button onClick={() => setEditTargetModal(null)} className="text-gray-400 hover:text-gray-600">
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleSaveTarget} className="space-y-3 text-xs">
              <div>
                <label className="block text-gray-700 font-semibold mb-1">
                  Monthly Target (₹) *
                </label>
                <input
                  type="number"
                  step="1000"
                  className="input input-sm w-full font-mono text-sm"
                  value={editTargetValue}
                  onChange={(e) => setEditTargetValue(e.target.value)}
                  placeholder="e.g. 1500000"
                  required
                />
                <p className="text-[11px] text-gray-500 mt-1">
                  Formatted: ₹ {formatCurrency(parseFloat(editTargetValue) || 0)}
                </p>
              </div>
              <div className="flex justify-end space-x-2 pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setEditTargetModal(null)}
                  className="btn btn-secondary btn-sm"
                  disabled={savingTarget}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary btn-sm flex items-center space-x-1"
                  disabled={savingTarget}
                >
                  {savingTarget ? <RefreshCw size={12} className="animate-spin" /> : null}
                  <span>Save Target</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Set / Update Target Modal */}
      {modalOpen && (
        <div className="modal-overlay">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 border border-gray-200">
            <div className="flex justify-between items-center mb-1">
              <h2 className="text-base font-bold text-gray-900">Set / Update Salesperson Target</h2>
              <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>
            <p className="text-[11px] text-gray-500 mb-3">
              The entered amount updates this salesperson's target directly (without adding to previous targets).
            </p>

            <form onSubmit={handleCreateTarget} className="space-y-3 text-xs">
              <div>
                <label className="block text-gray-700 font-semibold mb-1">Salesperson *</label>
                <select
                  className="input input-sm"
                  value={salesPersonId}
                  onChange={(e) => handleSalesPersonChange(parseInt(e.target.value, 10))}
                  required
                >
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name} ({u.role})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-gray-700 font-semibold mb-1">Target Period Type *</label>
                <select
                  className="input input-sm"
                  value={targetType}
                  onChange={(e) => handleTargetTypeChange(e.target.value)}
                >
                  <option value="Daily">Daily Target</option>
                  <option value="Weekly">Weekly Target</option>
                  <option value="Monthly">Monthly Target</option>
                  <option value="Custom">Custom Period</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-700 font-semibold mb-1">Start Date *</label>
                  <input
                    type="date"
                    className="input input-sm"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="block text-gray-700 font-semibold mb-1">End Date *</label>
                  <input
                    type="date"
                    className="input input-sm"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-gray-700 font-semibold mb-1">Target Amount (INR) *</label>
                <input
                  type="number"
                  step="1000"
                  className="input input-sm font-bold text-gray-900"
                  value={targetAmount}
                  onChange={(e) => setTargetAmount(e.target.value)}
                  placeholder="e.g. 1500000"
                  required
                />
                <p className="text-[11px] text-gray-500 mt-1">
                  Target: ₹ {formatCurrency(parseFloat(targetAmount) || 0)}
                </p>
              </div>

              <div>
                <label className="block text-gray-700 font-semibold mb-1">Target Description / Label</label>
                <input
                  type="text"
                  className="input input-sm"
                  value={periodLabel}
                  onChange={(e) => setPeriodLabel(e.target.value)}
                  placeholder="e.g. Q4 High-Season Residential Target"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t">
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary btn-sm">
                  Save / Update Target
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
