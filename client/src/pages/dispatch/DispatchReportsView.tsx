import React, { useState } from 'react';
import {
  FileText,
  Download,
  Calendar,
  RefreshCw,
  Truck,
  Package,
  Factory,
  CheckCircle2,
  TrendingUp,
  Clock,
  Printer,
} from 'lucide-react';
import { formatCurrency } from '../DispatchManagement';

interface ReportStats {
  range: string;
  dispatch: {
    completed_orders?: number;
    pending_orders?: number;
    delivered_value?: number;
    pending_backlog_value?: number;
    total_boxes_delivered?: number;
  };
  local: {
    total_local_items?: number;
    total_local_quoted_spend?: number;
    total_actual_spend?: number;
    items_arrived?: number;
  };
  factory: {
    total_factory_items?: number;
    total_factory_volume?: number;
    total_freight_cost?: number;
    factory_unloaded?: number;
  };
}

interface Props {
  reportData: ReportStats | null;
  loading: boolean;
  onFilterChange: (range: string, fromDate?: string, toDate?: string) => void;
  onRefresh: () => void;
}

export const DispatchReportsView: React.FC<Props> = ({
  reportData,
  loading,
  onFilterChange,
  onRefresh,
}) => {
  const [range, setRange] = useState<'today' | 'this_week' | 'this_month' | 'custom'>('this_month');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const handleApplyFilter = (newRange: 'today' | 'this_week' | 'this_month' | 'custom') => {
    setRange(newRange);
    if (newRange !== 'custom') {
      onFilterChange(newRange);
    } else if (fromDate && toDate) {
      onFilterChange('custom', fromDate, toDate);
    }
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (fromDate && toDate) {
      onFilterChange('custom', fromDate, toDate);
    }
  };

  // Export to CSV
  const exportToCsv = () => {
    if (!reportData) return;
    const lines: string[] = [];
    lines.push('AMA CERAMICS PVT LTD - DISPATCH & PROCUREMENT REPORT');
    lines.push(`Report Range: ${range.toUpperCase()}`);
    lines.push(`Generated: ${new Date().toLocaleString('en-IN')}`);
    lines.push('');

    lines.push('DISPATCH FULFILLMENT SUMMARY');
    lines.push(`Delivered Orders,${reportData.dispatch.completed_orders || 0}`);
    lines.push(`Pending Orders,${reportData.dispatch.pending_orders || 0}`);
    lines.push(`Delivered Value (Rs),${reportData.dispatch.delivered_value || 0}`);
    lines.push(`Pending Backlog Value (Rs),${reportData.dispatch.pending_backlog_value || 0}`);
    lines.push(`Total Boxes Delivered,${reportData.dispatch.total_boxes_delivered || 0}`);
    lines.push('');

    lines.push('LOCAL PROCUREMENT SUMMARY');
    lines.push(`Total Local Line Items,${reportData.local.total_local_items || 0}`);
    lines.push(`Total Quoted Spend (Rs),${reportData.local.total_local_quoted_spend || 0}`);
    lines.push(`Total Actual Purchase Spend (Rs),${reportData.local.total_actual_spend || 0}`);
    lines.push(`Items Arrived at Godown,${reportData.local.items_arrived || 0}`);
    lines.push('');

    lines.push('FACTORY LOGISTICS SUMMARY');
    lines.push(`Total Factory Line Items,${reportData.factory.total_factory_items || 0}`);
    lines.push(`Total Volume (Boxes),${reportData.factory.total_factory_volume || 0}`);
    lines.push(`Total Inbound Freight Cost (Rs),${reportData.factory.total_freight_cost || 0}`);
    lines.push(`Consignments Unloaded,${reportData.factory.factory_unloaded || 0}`);

    const csvContent = 'data:text/csv;charset=utf-8,' + lines.map((e) => encodeURIComponent(e)).join('\n');
    const link = document.createElement('a');
    link.setAttribute('href', csvContent);
    link.setAttribute('download', `Dispatch_Report_${range}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export to Excel-compatible HTML Spreadsheet (.xlsx format)
  const exportToExcel = () => {
    if (!reportData) return;
    const html = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head><meta charset="utf-8"/><title>Dispatch Report</title></head>
      <body>
        <table border="1">
          <tr style="background-color: #1E293B; color: #FFFFFF; font-weight: bold; font-size: 14pt;">
            <th colspan="2">AMA CERAMICS PVT LTD - DISPATCH MANAGEMENT REPORT</th>
          </tr>
          <tr><td><b>Time Range</b></td><td>${range.toUpperCase()}</td></tr>
          <tr><td><b>Report Date</b></td><td>${new Date().toLocaleDateString('en-IN')}</td></tr>
          <tr style="background-color: #E2E8F0; font-weight: bold;"><th colspan="2">1. DISPATCH FULFILLMENT</th></tr>
          <tr><td>Completed Delivered Orders</td><td>${reportData.dispatch.completed_orders || 0}</td></tr>
          <tr><td>Pending Delivery Backlog Orders</td><td>${reportData.dispatch.pending_orders || 0}</td></tr>
          <tr><td>Total Dispatched Boxes / Units</td><td>${reportData.dispatch.total_boxes_delivered || 0}</td></tr>
          <tr><td>Delivered Order Value (Rs.)</td><td>${reportData.dispatch.delivered_value || 0}</td></tr>
          <tr><td>Pending Backlog Value (Rs.)</td><td>${reportData.dispatch.pending_backlog_value || 0}</td></tr>
          <tr style="background-color: #E2E8F0; font-weight: bold;"><th colspan="2">2. LOCAL PROCUREMENT</th></tr>
          <tr><td>Total Local Items Arranged</td><td>${reportData.local.total_local_items || 0}</td></tr>
          <tr><td>Total Actual Local Spend (Rs.)</td><td>${reportData.local.total_actual_spend || 0}</td></tr>
          <tr><td>Items Arrived at Godown</td><td>${reportData.local.items_arrived || 0}</td></tr>
          <tr style="background-color: #E2E8F0; font-weight: bold;"><th colspan="2">3. FACTORY SHIPMENTS & FREIGHT</th></tr>
          <tr><td>Total Factory Orders</td><td>${reportData.factory.total_factory_items || 0}</td></tr>
          <tr><td>Total Factory Boxes Received</td><td>${reportData.factory.total_factory_volume || 0}</td></tr>
          <tr><td>Inbound Freight & Transit Cost (Rs.)</td><td>${reportData.factory.total_freight_cost || 0}</td></tr>
          <tr><td>Factory Orders Unloaded</td><td>${reportData.factory.factory_unloaded || 0}</td></tr>
        </table>
      </body>
      </html>
    `;

    const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Dispatch_Report_${range}_${Date.now()}.xls`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Print Formatted PDF
  const handlePrintPdf = () => {
    window.print();
  };

  const d = reportData?.dispatch || {};
  const l = reportData?.local || {};
  const f = reportData?.factory || {};

  return (
    <div className="space-y-4">
      {/* Top Filter Bar */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-2 flex-wrap gap-y-2">
          <span className="text-xs font-bold text-slate-500 uppercase mr-1">Timeframe:</span>
          {(['today', 'this_week', 'this_month'] as const).map((r) => (
            <button
              key={r}
              onClick={() => handleApplyFilter(r)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition-colors ${
                range === r
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
            >
              {r === 'today' ? 'Today' : r === 'this_week' ? 'This Week' : 'This Month'}
            </button>
          ))}
          <button
            onClick={() => handleApplyFilter('custom')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition-colors ${
              range === 'custom'
                ? 'bg-slate-900 text-white shadow-2xs'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
          >
            Custom Dates
          </button>
        </div>

        {/* 1-Click Export Buttons */}
        <div className="flex items-center space-x-2">
          <button
            onClick={exportToCsv}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-bold cursor-pointer shadow-2xs"
          >
            <Download size={13} />
            <span>Export CSV</span>
          </button>
          <button
            onClick={exportToExcel}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer shadow-xs"
          >
            <Download size={13} />
            <span>Export Excel</span>
          </button>
          <button
            onClick={handlePrintPdf}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-black text-white text-xs font-bold cursor-pointer shadow-xs"
          >
            <Printer size={13} />
            <span>Print PDF</span>
          </button>
        </div>
      </div>

      {/* Custom Date Selector */}
      {range === 'custom' && (
        <form onSubmit={handleCustomSubmit} className="bg-white rounded-2xl p-3 border border-slate-200/80 shadow-xs flex items-center space-x-3 text-xs">
          <div className="flex items-center space-x-2">
            <span className="font-semibold text-slate-700">From:</span>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="px-2.5 py-1.5 border border-slate-300 rounded-lg font-mono"
              required
            />
          </div>
          <div className="flex items-center space-x-2">
            <span className="font-semibold text-slate-700">To:</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="px-2.5 py-1.5 border border-slate-300 rounded-lg font-mono"
              required
            />
          </div>
          <button
            type="submit"
            className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold cursor-pointer"
          >
            Apply Range
          </button>
        </form>
      )}

      {loading ? (
        <div className="p-12 text-center text-slate-400 text-xs bg-white rounded-2xl border border-slate-200">
          <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-indigo-600" />
          Aggregating dispatch and procurement reports...
        </div>
      ) : (
        <div className="space-y-4">
          {/* Section 1: Dispatch Delivery Performance */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs">
            <div className="flex items-center space-x-2 mb-4">
              <Truck size={18} className="text-indigo-600" />
              <h3 className="font-extrabold text-sm text-slate-900 uppercase tracking-wide">
                1. Order Dispatch & Fulfillment Summary
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3.5">
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                <div className="text-[11px] font-bold text-slate-500 uppercase">Orders Fully Delivered</div>
                <div className="text-2xl font-black text-emerald-700 mt-1">{d.completed_orders || 0}</div>
                <div className="text-[10px] text-emerald-600 font-semibold mt-0.5">100% Dispatched</div>
              </div>

              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                <div className="text-[11px] font-bold text-slate-500 uppercase">Pending Delivery Backlog</div>
                <div className="text-2xl font-black text-rose-700 mt-1">{d.pending_orders || 0}</div>
                <div className="text-[10px] text-slate-500 mt-0.5">Quotations awaiting delivery</div>
              </div>

              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                <div className="text-[11px] font-bold text-slate-500 uppercase">Total Delivered Value</div>
                <div className="text-xl font-black text-slate-900 mt-1">₹ {formatCurrency(d.delivered_value)}</div>
                <div className="text-[10px] text-slate-500 mt-0.5">Revenue cleared to customer sites</div>
              </div>

              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                <div className="text-[11px] font-bold text-slate-500 uppercase">Total Boxes Dispatched</div>
                <div className="text-2xl font-black text-slate-900 mt-1">{Math.round(d.total_boxes_delivered || 0)}</div>
                <div className="text-[10px] text-slate-500 mt-0.5">Material units transported</div>
              </div>
            </div>
          </div>

          {/* Section 2: Local Purchase Performance */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs">
            <div className="flex items-center space-x-2 mb-4">
              <Package size={18} className="text-amber-600" />
              <h3 className="font-extrabold text-sm text-slate-900 uppercase tracking-wide">
                2. Local Purchase Procurement Performance
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                <div className="text-[11px] font-bold text-slate-500 uppercase">Total Local Items Sourced</div>
                <div className="text-2xl font-black text-slate-900 mt-1">{l.total_local_items || 0}</div>
                <div className="text-[10px] text-slate-500 mt-0.5">Products arranged from distributors</div>
              </div>

              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                <div className="text-[11px] font-bold text-slate-500 uppercase">Total Local Spend</div>
                <div className="text-xl font-black text-slate-900 mt-1">₹ {formatCurrency(l.total_actual_spend)}</div>
                <div className="text-[10px] text-slate-500 mt-0.5">Actual purchase expenditure</div>
              </div>

              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                <div className="text-[11px] font-bold text-slate-500 uppercase">Received in Godown</div>
                <div className="text-2xl font-black text-emerald-700 mt-1">{l.items_arrived || 0}</div>
                <div className="text-[10px] text-emerald-600 font-semibold mt-0.5">Converted to Ready Stock</div>
              </div>
            </div>
          </div>

          {/* Section 3: Factory Logistics & Inbound Performance */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs">
            <div className="flex items-center space-x-2 mb-4">
              <Factory size={18} className="text-indigo-600" />
              <h3 className="font-extrabold text-sm text-slate-900 uppercase tracking-wide">
                3. Factory Logistics & Inbound Procurement
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                <div className="text-[11px] font-bold text-slate-500 uppercase">Factory Orders Placed</div>
                <div className="text-2xl font-black text-slate-900 mt-1">{f.total_factory_items || 0}</div>
                <div className="text-[10px] text-slate-500 mt-0.5">Manufacturing items ordered</div>
              </div>

              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                <div className="text-[11px] font-bold text-slate-500 uppercase">Total Factory Boxes</div>
                <div className="text-2xl font-black text-slate-900 mt-1">{Math.round(f.total_factory_volume || 0)}</div>
                <div className="text-[10px] text-slate-500 mt-0.5">Volume in tiles & sanitary</div>
              </div>

              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                <div className="text-[11px] font-bold text-slate-500 uppercase">Inbound Freight Expenditure</div>
                <div className="text-xl font-black text-slate-900 mt-1">₹ {formatCurrency(f.total_freight_cost)}</div>
                <div className="text-[10px] text-slate-500 mt-0.5">Lorry & transit costs</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
