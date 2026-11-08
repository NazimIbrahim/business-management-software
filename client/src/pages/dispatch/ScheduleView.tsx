import React, { useState } from 'react';
import {
  Calendar as CalendarIcon,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Truck,
  RefreshCw,
  Search,
  ChevronLeft,
  ChevronRight,
  User,
  Phone,
  MapPin,
  Edit2,
  X,
} from 'lucide-react';
import { formatCurrency } from '../DispatchManagement';

interface ScheduleItem {
  quotation_id: number;
  quotation_number: string;
  customer_name: string;
  customer_phone?: string;
  site_location?: string;
  delivery_address?: string;
  sales_person_name?: string;
  net_total: number | string;
  dispatch_status: string;
  scheduled_date: string;
  expected_dispatch_date?: string;
  scheduled_dispatch_date?: string;
  dispatch_notes?: string;
  vehicle_no?: string;
  driver_name?: string;
  driver_phone?: string;
  total_boxes: number;
  total_items: number;
  timeline_category: 'OVERDUE' | 'TODAY' | 'UPCOMING';
}

interface Props {
  scheduleList: ScheduleItem[];
  loading: boolean;
  onRefresh: () => void;
  onReschedule: (quoteId: number, newDate: string, notes?: string) => Promise<void>;
  canEdit: boolean;
}

export const ScheduleView: React.FC<Props> = ({
  scheduleList,
  loading,
  onRefresh,
  onReschedule,
  canEdit,
}) => {
  const [viewType, setViewType] = useState<'timeline' | 'calendar'>('timeline');
  const [search, setSearch] = useState('');
  const [rescheduleModalItem, setRescheduleModalItem] = useState<ScheduleItem | null>(null);
  const [newDateVal, setNewDateVal] = useState('');
  const [newNotesVal, setNewNotesVal] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Calendar State
  const [currentMonthDate, setCurrentMonthDate] = useState(new Date());

  const handlePrevMonth = () => {
    setCurrentMonthDate(new Date(currentMonthDate.getFullYear(), currentMonthDate.getMonth() - 1, 1));
  };
  const handleNextMonth = () => {
    setCurrentMonthDate(new Date(currentMonthDate.getFullYear(), currentMonthDate.getMonth() + 1, 1));
  };

  const filtered = scheduleList.filter((s) => {
    const term = search.toLowerCase();
    return (
      s.quotation_number?.toLowerCase().includes(term) ||
      s.customer_name?.toLowerCase().includes(term) ||
      s.customer_phone?.includes(term) ||
      s.site_location?.toLowerCase().includes(term) ||
      s.vehicle_no?.toLowerCase().includes(term)
    );
  });

  const overdueCount = filtered.filter((s) => s.timeline_category === 'OVERDUE').length;
  const todayCount = filtered.filter((s) => s.timeline_category === 'TODAY').length;
  const upcomingCount = filtered.filter((s) => s.timeline_category === 'UPCOMING').length;

  const handleOpenReschedule = (item: ScheduleItem) => {
    setRescheduleModalItem(item);
    setNewDateVal(item.scheduled_date ? item.scheduled_date.slice(0, 10) : new Date().toISOString().slice(0, 10));
    setNewNotesVal(item.dispatch_notes || '');
  };

  const handleSaveReschedule = async () => {
    if (!rescheduleModalItem || !newDateVal) return;
    setIsSaving(true);
    try {
      await onReschedule(rescheduleModalItem.quotation_id, newDateVal, newNotesVal);
      setRescheduleModalItem(null);
    } finally {
      setIsSaving(false);
    }
  };

  // Calendar calculations
  const year = currentMonthDate.getFullYear();
  const month = currentMonthDate.getMonth();
  const firstDayIndex = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  // Group schedule items by date (YYYY-MM-DD)
  const itemsByDate: { [key: string]: ScheduleItem[] } = {};
  filtered.forEach((s) => {
    const dStr = s.scheduled_date ? s.scheduled_date.slice(0, 10) : '';
    if (dStr) {
      if (!itemsByDate[dStr]) itemsByDate[dStr] = [];
      itemsByDate[dStr].push(s);
    }
  });

  return (
    <div className="flex-1 min-h-0 w-full flex flex-col gap-2 sm:gap-2.5 overflow-hidden">
      {/* Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-2.5 shrink-0">
        <div className="bg-white rounded-2xl p-2.5 sm:p-3 border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-[10px] sm:text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Scheduled</div>
            <div className="text-xl sm:text-2xl font-black text-slate-900 mt-0.5">{filtered.length}</div>
            <div className="text-[10px] text-slate-500 font-medium">Dispatches on timeline</div>
          </div>
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-700 shrink-0">
            <CalendarIcon size={18} />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-2.5 sm:p-3 border border-rose-200/80 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-[10px] sm:text-[11px] font-bold text-rose-600 uppercase tracking-wider">Overdue Commitments</div>
            <div className="text-xl sm:text-2xl font-black text-rose-700 mt-0.5">{overdueCount}</div>
            <div className="text-[10px] text-rose-500 font-medium">Past target dispatch date</div>
          </div>
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600 shrink-0">
            <AlertTriangle size={18} />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-2.5 sm:p-3 border border-amber-200/80 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-[10px] sm:text-[11px] font-bold text-amber-700 uppercase tracking-wider">Today's Deliveries</div>
            <div className="text-xl sm:text-2xl font-black text-amber-800 mt-0.5">{todayCount}</div>
            <div className="text-[10px] text-amber-600 font-medium">Scheduled for today</div>
          </div>
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600 shrink-0">
            <Clock size={18} />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-2.5 sm:p-3 border border-indigo-200/80 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-[10px] sm:text-[11px] font-bold text-indigo-600 uppercase tracking-wider">Upcoming Dispatches</div>
            <div className="text-xl sm:text-2xl font-black text-indigo-700 mt-0.5">{upcomingCount}</div>
            <div className="text-[10px] text-indigo-500 font-medium">Future planned dates</div>
          </div>
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
            <Truck size={18} />
          </div>
        </div>
      </div>

      {/* Toolbar & View Mode Switcher */}
      <div className="bg-white rounded-2xl p-2 sm:p-2.5 border border-slate-200/80 shadow-xs flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center space-x-2">
          <div className="flex bg-slate-100 p-0.5 rounded-xl border border-slate-200">
            <button
              onClick={() => setViewType('timeline')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                viewType === 'timeline' ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Timeline List
            </button>
            <button
              onClick={() => setViewType('calendar')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                viewType === 'calendar' ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Interactive Calendar
            </button>
          </div>
        </div>

        <div className="flex items-center space-x-2 flex-1 max-w-md">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter schedule by quote, customer, site..."
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-hidden text-slate-900"
            />
          </div>

          <button
            onClick={onRefresh}
            className="inline-flex items-center space-x-1.5 px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer transition-colors"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Content based on View Type */}
      {viewType === 'timeline' ? (
        /* Timeline List View */
        <div className="flex-1 min-h-0 w-full bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden flex flex-col">
          {loading ? (
            <div className="flex-1 min-h-0 flex items-center justify-center p-8 text-center text-slate-400 text-xs">
              <div>
                <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-indigo-600" />
                <span>Loading dispatch schedule timeline...</span>
              </div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex-1 min-h-0 flex items-center justify-center p-8 text-center text-slate-400 text-xs">
              <div>
                <CalendarIcon size={32} className="mx-auto mb-2 text-slate-300" />
                <span>No dispatches currently scheduled.</span>
              </div>
            </div>
          ) : (
            <div className="flex-1 min-h-0 w-full overflow-x-auto overflow-y-auto scrollbar-thin">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="sticky top-0 bg-slate-50/95 backdrop-blur-xs z-10 shadow-xs">
                  <tr className="text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                    <th className="py-2.5 px-3">Timeline Tag</th>
                    <th className="py-2.5 px-3">Scheduled Date</th>
                    <th className="py-2.5 px-3">Quotation Ref</th>
                    <th className="py-2.5 px-3">Customer & Site</th>
                    <th className="py-2.5 px-3">Vehicle / Driver</th>
                    <th className="py-2.5 px-3 text-right">Volume</th>
                    <th className="py-2.5 px-3 text-right">Order Value</th>
                    <th className="py-2.5 px-3 text-right">Reschedule</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((s) => {
                    const isOverdue = s.timeline_category === 'OVERDUE';
                    const isToday = s.timeline_category === 'TODAY';

                    return (
                      <tr
                        key={s.quotation_id}
                        className={`hover:bg-slate-50/60 transition-colors ${
                          isOverdue ? 'bg-rose-50/20' : isToday ? 'bg-amber-50/20' : ''
                        }`}
                      >
                        <td className="py-3 px-3">
                          {isOverdue ? (
                            <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                              <AlertTriangle size={11} />
                              <span>OVERDUE</span>
                            </span>
                          ) : isToday ? (
                            <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-200">
                              <Clock size={11} />
                              <span>TODAY</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                              <Truck size={11} />
                              <span>UPCOMING</span>
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-3 font-semibold text-slate-800">
                          <div className="flex items-center space-x-1 font-mono text-xs">
                            <CalendarIcon size={12} className={isOverdue ? 'text-rose-500' : 'text-slate-400'} />
                            <span>{s.scheduled_date ? new Date(s.scheduled_date).toLocaleDateString('en-IN') : '-'}</span>
                          </div>
                        </td>

                        <td className="py-3 px-3 font-mono font-bold text-slate-900">
                          <div>{s.quotation_number}</div>
                          <div className="text-[10px] text-slate-500 font-sans font-normal mt-0.5">
                            Stage: <span className="font-semibold text-slate-700">{s.dispatch_status}</span>
                          </div>
                        </td>

                        <td className="py-3 px-3">
                          <div className="font-bold text-slate-900 flex items-center space-x-1">
                            <User size={12} className="text-slate-400" />
                            <span>{s.customer_name}</span>
                          </div>
                          <div className="text-[11px] text-slate-500 font-mono mt-0.5 flex items-center space-x-1">
                            <Phone size={11} className="text-slate-400" />
                            <span>{s.customer_phone || '-'}</span>
                          </div>
                          <div className="text-[10px] text-slate-500 truncate max-w-[200px] mt-0.5 flex items-center space-x-1">
                            <MapPin size={10} className="text-slate-400 shrink-0" />
                            <span title={s.delivery_address || s.site_location}>{s.delivery_address || s.site_location || 'Destination'}</span>
                          </div>
                        </td>

                        <td className="py-3 px-3">
                          <div className="font-mono text-slate-800 font-semibold">{s.vehicle_no || 'TBD'}</div>
                          <div className="text-[11px] text-slate-500">
                            {s.driver_name || 'Driver to be assigned'}
                          </div>
                        </td>

                        <td className="py-3 px-3 text-right font-mono font-bold text-slate-800">
                          {Math.round(s.total_boxes)} Boxes
                        </td>

                        <td className="py-3 px-3 text-right font-mono font-extrabold text-slate-900">
                          ₹ {formatCurrency(s.net_total)}
                        </td>

                        <td className="py-3 px-3 text-right">
                          {canEdit ? (
                            <button
                              onClick={() => handleOpenReschedule(s)}
                              className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold text-[11px] cursor-pointer shadow-2xs"
                            >
                              <Edit2 size={11} />
                              <span>Reschedule</span>
                            </button>
                          ) : (
                            <span className="text-[11px] text-slate-400 font-medium">Locked</span>
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
      ) : (
        /* Interactive Month Calendar View */
        <div className="flex-1 min-h-0 w-full bg-white rounded-2xl border border-slate-200/80 shadow-xs p-3 sm:p-4 overflow-y-auto scrollbar-thin flex flex-col">
          {/* Calendar Month Header */}
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-200 shrink-0">
            <h3 className="font-bold text-sm sm:text-base text-slate-900">
              {monthNames[month]} {year}
            </h3>
            <div className="flex items-center space-x-1">
              <button
                onClick={handlePrevMonth}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 cursor-pointer"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={handleNextMonth}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 cursor-pointer"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          {/* Day Names Grid */}
          <div className="grid grid-cols-7 gap-1.5 sm:gap-2 mb-2 text-center text-[10px] sm:text-[11px] font-bold text-slate-500 uppercase shrink-0">
            <div>Sun</div>
            <div>Mon</div>
            <div>Tue</div>
            <div>Wed</div>
            <div>Thu</div>
            <div>Fri</div>
            <div>Sat</div>
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-1.5 sm:gap-2 flex-1">
            {/* Empty cells before month start */}
            {Array.from({ length: firstDayIndex }).map((_, i) => (
              <div key={`empty-${i}`} className="min-h-[75px] bg-slate-50/50 rounded-xl border border-dashed border-slate-200/50" />
            ))}

            {/* Month Day Cells */}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const dayItems = itemsByDate[dateKey] || [];
              const isCurrentDay =
                day === new Date().getDate() &&
                month === new Date().getMonth() &&
                year === new Date().getFullYear();

              return (
                <div
                  key={`day-${day}`}
                  className={`min-h-[75px] p-1.5 sm:p-2 rounded-xl border flex flex-col justify-between transition-colors ${
                    isCurrentDay
                      ? 'bg-amber-50/30 border-amber-300 ring-1 ring-amber-300'
                      : dayItems.length > 0
                      ? 'bg-indigo-50/20 border-indigo-200'
                      : 'bg-white border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span
                      className={`text-[11px] font-bold ${
                        isCurrentDay
                          ? 'w-5 h-5 rounded-full bg-amber-500 text-white flex items-center justify-center'
                          : 'text-slate-800'
                      }`}
                    >
                      {day}
                    </span>
                    {dayItems.length > 0 && (
                      <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-indigo-600 text-white">
                        {dayItems.length}
                      </span>
                    )}
                  </div>

                  <div className="space-y-1 overflow-y-auto max-h-[60px] scrollbar-thin">
                    {dayItems.map((item) => (
                      <div
                        key={item.quotation_id}
                        onClick={() => canEdit && handleOpenReschedule(item)}
                        className="p-1 rounded-md bg-white border border-slate-200/80 text-[10px] text-slate-800 shadow-2xs hover:border-indigo-400 cursor-pointer truncate"
                        title={`${item.quotation_number} - ${item.customer_name} (Click to reschedule)`}
                      >
                        <span className="font-bold text-indigo-700 font-mono">{item.quotation_number.slice(-5)}</span>{' '}
                        <span>{item.customer_name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Reschedule Modal */}
      {rescheduleModalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full max-h-[85vh] flex flex-col border border-slate-200 shadow-2xl overflow-hidden animate-fadeIn">
            <div className="flex items-center justify-between p-3.5 sm:p-4 border-b border-slate-200 shrink-0">
              <h3 className="font-extrabold text-slate-900 text-sm">Reschedule Dispatch Commitment</h3>
              <button
                onClick={() => setRescheduleModalItem(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3.5 text-xs scrollbar-thin">
              <div>
                <span className="text-slate-500 font-medium">Quotation:</span>{' '}
                <span className="font-bold font-mono text-slate-900">{rescheduleModalItem.quotation_number}</span> (
                {rescheduleModalItem.customer_name})
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                  New Target Dispatch Date *
                </label>
                <input
                  type="date"
                  value={newDateVal}
                  onChange={(e) => setNewDateVal(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500/30 text-slate-900 font-mono font-semibold"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                  Reason for Rescheduling / Customer Notes
                </label>
                <textarea
                  rows={2}
                  value={newNotesVal}
                  onChange={(e) => setNewNotesVal(e.target.value)}
                  placeholder="e.g. Customer site unloading delay, factory lorry ETA pushed by 2 days..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500/30 text-slate-900"
                />
              </div>
            </div>

            <div className="p-3 sm:p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end space-x-2 shrink-0">
              <button
                type="button"
                onClick={() => setRescheduleModalItem(null)}
                className="px-4 py-2 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 font-semibold cursor-pointer text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveReschedule}
                disabled={isSaving || !newDateVal}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold cursor-pointer disabled:opacity-50 text-xs shadow-sm"
              >
                {isSaving ? 'Updating...' : 'Save Schedule'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
