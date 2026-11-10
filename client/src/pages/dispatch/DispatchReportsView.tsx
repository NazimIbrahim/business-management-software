import React, { useState, useMemo } from 'react';
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
  Search,
  User,
  Phone,
  MapPin,
  ExternalLink,
  ShieldCheck,
  Layers,
  ArrowRight,
} from 'lucide-react';
import { formatCurrency } from '../DispatchManagement';

export interface DispatchedItemReport {
  quotation_id: number;
  quotation_number: string;
  customer_name: string;
  customer_phone?: string;
  site_location?: string;
  challan_number?: string;
  last_invoice_number?: string;
  dispatched_at?: string;
  dispatch_status?: string;
  item_id: number;
  description: string;
  brand?: string;
  size?: string;
  product_type?: string;
  dispatched_quantity: number | string;
  ordered_quantity: number | string;
  rate: number | string;
  delivered_item_value: number | string;
}

export interface LocalPurchaseReport {
  local_purchase_id?: number;
  quotation_id: number;
  quotation_number: string;
  customer_name: string;
  customer_phone?: string;
  site_location?: string;
  item_id: number;
  description: string;
  brand?: string;
  size?: string;
  product_type?: string;
  vendor_name: string;
  vendor_contact?: string;
  quantity: number | string;
  actual_rate: number | string;
  total_spend: number | string;
  purchase_status: string;
  invoice_number?: string;
  completed_date?: string;
  payment_checked?: boolean;
}

export interface FactoryOrderReport {
  factory_order_id?: number;
  quotation_id: number;
  quotation_number: string;
  customer_name: string;
  customer_phone?: string;
  site_location?: string;
  item_id: number;
  description: string;
  brand?: string;
  size?: string;
  product_type?: string;
  factory_name: string;
  boxes_quantity: number | string;
  lr_number?: string;
  transporter_name?: string;
  truck_number?: string;
  freight_cost: number | string;
  status: string;
  order_date?: string;
  unloaded_date?: string;
}

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
  dispatched_items?: DispatchedItemReport[];
  local_purchases?: LocalPurchaseReport[];
  factory_orders?: FactoryOrderReport[];
}

interface Props {
  reportData: ReportStats | null;
  loading: boolean;
  onFilterChange: (range: string, fromDate?: string, toDate?: string) => void;
  onRefresh: () => void;
}

type SectionViewTab = 'all' | 'dispatches' | 'local' | 'factory';

export const DispatchReportsView: React.FC<Props> = ({
  reportData,
  loading,
  onFilterChange,
  onRefresh,
}) => {
  const [range, setRange] = useState<'today' | 'this_week' | 'this_month' | 'custom'>('this_month');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [activeSection, setActiveSection] = useState<SectionViewTab>('all');
  const [searchTerm, setSearchTerm] = useState('');

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

  const rawDispatchedItems = reportData?.dispatched_items || [];
  const rawLocalPurchases = reportData?.local_purchases || [];
  const rawFactoryOrders = reportData?.factory_orders || [];

  // Filtered lists based on search
  const filteredDispatchedItems = useMemo(() => {
    if (!searchTerm.trim()) return rawDispatchedItems;
    const s = searchTerm.toLowerCase();
    return rawDispatchedItems.filter(
      (it) =>
        it.customer_name?.toLowerCase().includes(s) ||
        it.quotation_number?.toLowerCase().includes(s) ||
        it.description?.toLowerCase().includes(s) ||
        it.brand?.toLowerCase().includes(s) ||
        it.challan_number?.toLowerCase().includes(s) ||
        it.last_invoice_number?.toLowerCase().includes(s) ||
        it.customer_phone?.includes(s)
    );
  }, [rawDispatchedItems, searchTerm]);

  const filteredLocalPurchases = useMemo(() => {
    if (!searchTerm.trim()) return rawLocalPurchases;
    const s = searchTerm.toLowerCase();
    return rawLocalPurchases.filter(
      (it) =>
        it.customer_name?.toLowerCase().includes(s) ||
        it.quotation_number?.toLowerCase().includes(s) ||
        it.description?.toLowerCase().includes(s) ||
        it.vendor_name?.toLowerCase().includes(s) ||
        it.brand?.toLowerCase().includes(s) ||
        it.invoice_number?.toLowerCase().includes(s)
    );
  }, [rawLocalPurchases, searchTerm]);

  const filteredFactoryOrders = useMemo(() => {
    if (!searchTerm.trim()) return rawFactoryOrders;
    const s = searchTerm.toLowerCase();
    return rawFactoryOrders.filter(
      (it) =>
        it.customer_name?.toLowerCase().includes(s) ||
        it.quotation_number?.toLowerCase().includes(s) ||
        it.description?.toLowerCase().includes(s) ||
        it.factory_name?.toLowerCase().includes(s) ||
        it.lr_number?.toLowerCase().includes(s) ||
        it.truck_number?.toLowerCase().includes(s) ||
        it.transporter_name?.toLowerCase().includes(s)
    );
  }, [rawFactoryOrders, searchTerm]);

  // Totals for itemized dispatches
  const totalDispatchedQty = useMemo(() => {
    return filteredDispatchedItems.reduce((acc, it) => acc + parseFloat(String(it.dispatched_quantity || 0)), 0);
  }, [filteredDispatchedItems]);

  const totalDeliveredValue = useMemo(() => {
    return filteredDispatchedItems.reduce((acc, it) => acc + parseFloat(String(it.delivered_item_value || 0)), 0);
  }, [filteredDispatchedItems]);

  const totalLocalSpendCalculated = useMemo(() => {
    return filteredLocalPurchases.reduce((acc, it) => acc + parseFloat(String(it.total_spend || 0)), 0);
  }, [filteredLocalPurchases]);

  const totalFactoryBoxesCalculated = useMemo(() => {
    return filteredFactoryOrders.reduce((acc, it) => acc + parseFloat(String(it.boxes_quantity || 0)), 0);
  }, [filteredFactoryOrders]);

  const totalFreightCostCalculated = useMemo(() => {
    return filteredFactoryOrders.reduce((acc, it) => acc + parseFloat(String(it.freight_cost || 0)), 0);
  }, [filteredFactoryOrders]);

  // Comprehensive Multi-Section CSV Export
  const exportToCsv = () => {
    if (!reportData) return;
    const escapeCsv = (val: any) => {
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const lines: string[] = [];
    lines.push('AMA CERAMICS PVT LTD - CENTRALIZED DISPATCH & PROCUREMENT REPORT');
    lines.push(`Timeframe: ${range.toUpperCase()} | Generated: ${new Date().toLocaleString('en-IN')}`);
    lines.push('');

    // Section 1: Executive KPI Summary
    lines.push('=== 1. EXECUTIVE FULFILLMENT & PROCUREMENT SUMMARY ===');
    lines.push('Category,Metric,Value');
    lines.push(`Dispatch,Delivered Orders,${reportData.dispatch.completed_orders || 0}`);
    lines.push(`Dispatch,Pending Backlog Orders,${reportData.dispatch.pending_orders || 0}`);
    lines.push(`Dispatch,Total Delivered Value (Rs),${reportData.dispatch.delivered_value || 0}`);
    lines.push(`Dispatch,Total Boxes Dispatched,${reportData.dispatch.total_boxes_delivered || 0}`);
    lines.push(`Local Purchase,Total Local Items Sourced,${reportData.local.total_local_items || 0}`);
    lines.push(`Local Purchase,Total Local Spend (Rs),${reportData.local.total_actual_spend || 0}`);
    lines.push(`Local Purchase,Received in Godown,${reportData.local.items_arrived || 0}`);
    lines.push(`Factory Logistics,Factory Orders Placed,${reportData.factory.total_factory_items || 0}`);
    lines.push(`Factory Logistics,Total Factory Boxes,${reportData.factory.total_factory_volume || 0}`);
    lines.push(`Factory Logistics,Inbound Freight Cost (Rs),${reportData.factory.total_freight_cost || 0}`);
    lines.push('');

    // Section 2: Item Dispatches to Customers
    lines.push('=== 2. ITEM DISPATCHES TO CUSTOMERS ===');
    lines.push([
      '#',
      'Quotation Number',
      'Customer Name',
      'Customer Phone',
      'Site Location',
      'Tax Invoice Number',
      'Delivery Challan',
      'Item Description',
      'Brand',
      'Size',
      'Product Type',
      'Dispatched Quantity',
      'Unit Rate (Rs)',
      'Delivered Value (Rs)',
      'Dispatch Date',
    ].join(','));

    rawDispatchedItems.forEach((it, idx) => {
      lines.push([
        idx + 1,
        escapeCsv(it.quotation_number),
        escapeCsv(it.customer_name),
        escapeCsv(it.customer_phone || '-'),
        escapeCsv(it.site_location || '-'),
        escapeCsv(it.last_invoice_number || '-'),
        escapeCsv(it.challan_number || '-'),
        escapeCsv(it.description),
        escapeCsv(it.brand || '-'),
        escapeCsv(it.size || '-'),
        escapeCsv(it.product_type || 'BOX'),
        it.dispatched_quantity,
        it.rate,
        it.delivered_item_value,
        escapeCsv(it.dispatched_at ? new Date(it.dispatched_at).toLocaleDateString('en-IN') : '-'),
      ].join(','));
    });
    lines.push('');

    // Section 3: Local Dealer Purchases
    lines.push('=== 3. LOCAL DEALER PURCHASES ===');
    lines.push([
      '#',
      'Quotation Number',
      'Customer Name',
      'Customer Phone',
      'Item Description',
      'Brand',
      'Size',
      'Dealer / Vendor Name',
      'Vendor Contact',
      'Quantity',
      'Actual Purchase Rate (Rs)',
      'Total Spend (Rs)',
      'Purchase Status',
      'Godown Arrival Date',
      'Payment Checked',
    ].join(','));

    rawLocalPurchases.forEach((it, idx) => {
      lines.push([
        idx + 1,
        escapeCsv(it.quotation_number),
        escapeCsv(it.customer_name),
        escapeCsv(it.customer_phone || '-'),
        escapeCsv(it.description),
        escapeCsv(it.brand || '-'),
        escapeCsv(it.size || '-'),
        escapeCsv(it.vendor_name || 'Local Dealer'),
        escapeCsv(it.vendor_contact || '-'),
        it.quantity,
        it.actual_rate,
        it.total_spend,
        escapeCsv(it.purchase_status),
        escapeCsv(it.completed_date ? new Date(it.completed_date).toLocaleDateString('en-IN') : '-'),
        escapeCsv(it.payment_checked ? 'YES' : 'NO'),
      ].join(','));
    });
    lines.push('');

    // Section 4: Factory Orders & Inbound Freight
    lines.push('=== 4. FACTORY LOGISTICS & INBOUND ORDERS ===');
    lines.push([
      '#',
      'Quotation Number',
      'Customer Name',
      'Customer Phone',
      'Item Description',
      'Brand',
      'Size',
      'Factory / Plant Name',
      'Boxes Quantity',
      'LR Number',
      'Transporter Name',
      'Truck Number',
      'Freight Cost (Rs)',
      'Status',
      'Order Date',
      'Unload Date',
    ].join(','));

    rawFactoryOrders.forEach((it, idx) => {
      lines.push([
        idx + 1,
        escapeCsv(it.quotation_number),
        escapeCsv(it.customer_name),
        escapeCsv(it.customer_phone || '-'),
        escapeCsv(it.description),
        escapeCsv(it.brand || '-'),
        escapeCsv(it.size || '-'),
        escapeCsv(it.factory_name || '-'),
        it.boxes_quantity,
        escapeCsv(it.lr_number || '-'),
        escapeCsv(it.transporter_name || '-'),
        escapeCsv(it.truck_number || '-'),
        it.freight_cost,
        escapeCsv(it.status),
        escapeCsv(it.order_date ? new Date(it.order_date).toLocaleDateString('en-IN') : '-'),
        escapeCsv(it.unloaded_date ? new Date(it.unloaded_date).toLocaleDateString('en-IN') : '-'),
      ].join(','));
    });

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + lines.join('\n');
    const link = document.createElement('a');
    link.setAttribute('href', encodeURI(csvContent));
    link.setAttribute('download', `Dispatch_Full_Report_${range}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Comprehensive Multi-Table Excel Export (.xls)
  const exportToExcel = () => {
    if (!reportData) return;

    const html = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta charset="utf-8"/>
        <title>Dispatch & Procurement Report</title>
        <style>
          table { border-collapse: collapse; width: 100%; margin-bottom: 25px; font-family: Calibri, sans-serif; font-size: 11pt; }
          th { background-color: #1E293B; color: #FFFFFF; font-weight: bold; padding: 8px 12px; text-align: left; border: 1px solid #CBD5E1; }
          td { padding: 6px 12px; border: 1px solid #CBD5E1; }
          .section-header { font-size: 13pt; font-weight: bold; background-color: #0F766E; color: #FFFFFF; padding: 10px; }
          .local-header { font-size: 13pt; font-weight: bold; background-color: #B45309; color: #FFFFFF; padding: 10px; }
          .factory-header { font-size: 13pt; font-weight: bold; background-color: #4338CA; color: #FFFFFF; padding: 10px; }
          .total-row { font-weight: bold; background-color: #F1F5F9; }
          .text-right { text-align: right; }
          .text-center { text-align: center; }
        </style>
      </head>
      <body>
        <h2>AMA CERAMICS PVT LTD - DISPATCH MANAGEMENT & PROCUREMENT REPORT</h2>
        <p><b>Timeframe:</b> ${range.toUpperCase()} | <b>Generated:</b> ${new Date().toLocaleString('en-IN')}</p>

        <!-- Section 1: Executive KPI Summary -->
        <table>
          <tr><th colspan="2" style="background-color: #1E293B;">EXECUTIVE SUMMARY METRICS</th></tr>
          <tr><td><b>Orders Fully Delivered</b></td><td>${reportData.dispatch.completed_orders || 0}</td></tr>
          <tr><td><b>Pending Delivery Backlog</b></td><td>${reportData.dispatch.pending_orders || 0}</td></tr>
          <tr><td><b>Total Delivered Value (Rs.)</b></td><td>₹ ${formatCurrency(reportData.dispatch.delivered_value)}</td></tr>
          <tr><td><b>Total Boxes Dispatched</b></td><td>${reportData.dispatch.total_boxes_delivered || 0}</td></tr>
          <tr><td><b>Total Local Line Items Sourced</b></td><td>${reportData.local.total_local_items || 0}</td></tr>
          <tr><td><b>Total Actual Local Purchase Spend (Rs.)</b></td><td>₹ ${formatCurrency(reportData.local.total_actual_spend)}</td></tr>
          <tr><td><b>Local Items Arrived at Godown</b></td><td>${reportData.local.items_arrived || 0}</td></tr>
          <tr><td><b>Factory Orders Placed</b></td><td>${reportData.factory.total_factory_items || 0}</td></tr>
          <tr><td><b>Total Factory Boxes Received</b></td><td>${reportData.factory.total_factory_volume || 0}</td></tr>
          <tr><td><b>Inbound Freight Cost (Rs.)</b></td><td>₹ ${formatCurrency(reportData.factory.total_freight_cost)}</td></tr>
        </table>

        <!-- Section 2: Dispatched Items to Customers -->
        <table>
          <tr><th colspan="11" class="section-header">1. DISPATCHED GOODS BREAKDOWN (WHICH ITEMS TO WHICH CUSTOMERS)</th></tr>
          <tr style="background-color: #F8FAFC;">
            <th>#</th>
            <th>Quotation Ref</th>
            <th>Customer Name</th>
            <th>Customer Phone</th>
            <th>Delivery Site</th>
            <th>Tax Invoice #</th>
            <th>Challan #</th>
            <th>Item Description & Specs</th>
            <th class="text-right">Dispatched Qty</th>
            <th class="text-right">Unit Rate (Rs.)</th>
            <th class="text-right">Delivered Value (Rs.)</th>
          </tr>
          ${rawDispatchedItems.map((it, idx) => `
            <tr>
              <td class="text-center">${idx + 1}</td>
              <td><b>${it.quotation_number}</b></td>
              <td>${it.customer_name}</td>
              <td>${it.customer_phone || '-'}</td>
              <td>${it.site_location || '-'}</td>
              <td>${it.last_invoice_number ? '#' + it.last_invoice_number : '-'}</td>
              <td>${it.challan_number || '-'}</td>
              <td>${it.description} ${it.brand ? '(' + it.brand + ')' : ''} ${it.size ? '[' + it.size + ']' : ''}</td>
              <td class="text-right"><b>${it.dispatched_quantity}</b> ${it.product_type || 'BOX'}</td>
              <td class="text-right">₹ ${formatCurrency(it.rate)}</td>
              <td class="text-right"><b>₹ ${formatCurrency(it.delivered_item_value)}</b></td>
            </tr>
          `).join('')}
          <tr class="total-row">
            <td colspan="8" style="text-align: right;"><b>TOTAL DELIVERED:</b></td>
            <td class="text-right"><b>${totalDispatchedQty}</b></td>
            <td></td>
            <td class="text-right"><b>₹ ${formatCurrency(totalDeliveredValue)}</b></td>
          </tr>
        </table>

        <!-- Section 3: Local Purchases -->
        <table>
          <tr><th colspan="9" class="local-header">2. LOCAL PURCHASE PROCUREMENT BREAKDOWN</th></tr>
          <tr style="background-color: #F8FAFC;">
            <th>#</th>
            <th>Customer & Quote</th>
            <th>Item Description</th>
            <th>Brand & Size</th>
            <th>Dealer / Distributor</th>
            <th class="text-right">Purchase Qty</th>
            <th class="text-right">Purchase Rate (Rs.)</th>
            <th class="text-right">Total Spend (Rs.)</th>
            <th>Status</th>
          </tr>
          ${rawLocalPurchases.map((it, idx) => `
            <tr>
              <td class="text-center">${idx + 1}</td>
              <td><b>${it.customer_name}</b><br/><small>${it.quotation_number}</small></td>
              <td>${it.description}</td>
              <td>${it.brand || '-'} ${it.size ? '• ' + it.size : ''}</td>
              <td><b>${it.vendor_name || 'Local Dealer'}</b> ${it.vendor_contact ? '(' + it.vendor_contact + ')' : ''}</td>
              <td class="text-right"><b>${it.quantity}</b></td>
              <td class="text-right">₹ ${formatCurrency(it.actual_rate)}</td>
              <td class="text-right"><b>₹ ${formatCurrency(it.total_spend)}</b></td>
              <td>${it.purchase_status}</td>
            </tr>
          `).join('')}
          <tr class="total-row">
            <td colspan="7" style="text-align: right;"><b>TOTAL LOCAL PROCUREMENT SPEND:</b></td>
            <td class="text-right"><b>₹ ${formatCurrency(totalLocalSpendCalculated)}</b></td>
            <td></td>
          </tr>
        </table>

        <!-- Section 4: Factory Orders -->
        <table>
          <tr><th colspan="9" class="factory-header">3. FACTORY ORDERS & INBOUND LOGISTICS BREAKDOWN</th></tr>
          <tr style="background-color: #F8FAFC;">
            <th>#</th>
            <th>Customer & Quote</th>
            <th>Item Description</th>
            <th>Factory / Plant</th>
            <th class="text-right">Ordered Boxes</th>
            <th>LR Number</th>
            <th>Transporter / Truck</th>
            <th class="text-right">Freight Cost (Rs.)</th>
            <th>Status</th>
          </tr>
          ${rawFactoryOrders.map((it, idx) => `
            <tr>
              <td class="text-center">${idx + 1}</td>
              <td><b>${it.customer_name}</b><br/><small>${it.quotation_number}</small></td>
              <td>${it.description}</td>
              <td><b>${it.factory_name || '-'}</b></td>
              <td class="text-right"><b>${it.boxes_quantity}</b></td>
              <td>${it.lr_number || '-'}</td>
              <td>${it.transporter_name || '-'} ${it.truck_number ? '[' + it.truck_number + ']' : ''}</td>
              <td class="text-right">₹ ${formatCurrency(it.freight_cost)}</td>
              <td>${it.status}</td>
            </tr>
          `).join('')}
          <tr class="total-row">
            <td colspan="4" style="text-align: right;"><b>TOTAL FACTORY VOLUME & FREIGHT:</b></td>
            <td class="text-right"><b>${totalFactoryBoxesCalculated} Boxes</b></td>
            <td colspan="2"></td>
            <td class="text-right"><b>₹ ${formatCurrency(totalFreightCostCalculated)}</b></td>
            <td></td>
          </tr>
        </table>
      </body>
      </html>
    `;

    const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Dispatch_Full_Report_${range}_${Date.now()}.xls`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Print Formatted PDF via window.print with print styling
  const handlePrintPdf = () => {
    window.print();
  };

  const d = reportData?.dispatch || {};
  const l = reportData?.local || {};
  const f = reportData?.factory || {};

  return (
    <div className="flex-1 min-h-0 w-full flex flex-col gap-2.5 sm:gap-3 overflow-hidden">
      {/* Top Filter & Export Bar */}
      <div className="bg-white rounded-2xl p-2.5 sm:p-3 border border-slate-200/80 shadow-xs flex flex-wrap items-center justify-between gap-2 shrink-0 print:hidden">
        {/* Timeframe Selector */}
        <div className="flex items-center space-x-2 flex-wrap gap-y-1.5">
          <span className="text-[11px] font-bold text-slate-500 uppercase mr-1">Timeframe:</span>
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
        <div className="flex items-center space-x-1.5 sm:space-x-2 shrink-0">
          <button
            onClick={exportToCsv}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-bold cursor-pointer shadow-2xs transition-colors"
            title="Download full multi-section CSV with all items, customers, local purchase, and factory orders"
          >
            <Download size={13} className="text-slate-600" />
            <span>Export CSV</span>
          </button>
          <button
            onClick={exportToExcel}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold cursor-pointer shadow-xs transition-colors"
            title="Download formatted multi-table Excel spreadsheet with all detailed breakdowns"
          >
            <Download size={13} />
            <span>Export Excel</span>
          </button>
          <button
            onClick={handlePrintPdf}
            className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-black text-white text-xs font-bold cursor-pointer shadow-xs transition-colors"
            title="Print or Save as PDF with clean tabular formatting"
          >
            <Printer size={13} />
            <span>Print PDF</span>
          </button>
        </div>
      </div>

      {/* Custom Date Form */}
      {range === 'custom' && (
        <form
          onSubmit={handleCustomSubmit}
          className="bg-white rounded-2xl p-2.5 sm:p-3 border border-slate-200/80 shadow-xs flex items-center space-x-3 text-xs shrink-0 print:hidden"
        >
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
            className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold cursor-pointer shadow-2xs"
          >
            Apply Range
          </button>
        </form>
      )}

      {/* Sub-Navigation & Global Search */}
      <div className="bg-white rounded-2xl p-2 sm:p-2.5 border border-slate-200/80 shadow-xs flex flex-wrap items-center justify-between gap-2.5 shrink-0 print:hidden">
        {/* Section View Tabs */}
        <div className="flex items-center space-x-1.5 overflow-x-auto">
          <button
            onClick={() => setActiveSection('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center space-x-1.5 ${
              activeSection === 'all'
                ? 'bg-indigo-50 text-indigo-900 border border-indigo-200'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <span>All Sections</span>
          </button>

          <button
            onClick={() => setActiveSection('dispatches')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center space-x-1.5 ${
              activeSection === 'dispatches'
                ? 'bg-indigo-600 text-white shadow-2xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Truck size={13} />
            <span>Dispatched Items ({rawDispatchedItems.length})</span>
          </button>

          <button
            onClick={() => setActiveSection('local')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center space-x-1.5 ${
              activeSection === 'local'
                ? 'bg-amber-600 text-white shadow-2xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Package size={13} />
            <span>Local Purchases ({rawLocalPurchases.length})</span>
          </button>

          <button
            onClick={() => setActiveSection('factory')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center space-x-1.5 ${
              activeSection === 'factory'
                ? 'bg-indigo-900 text-white shadow-2xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Factory size={13} />
            <span>Factory Orders ({rawFactoryOrders.length})</span>
          </button>
        </div>

        {/* Live Search */}
        <div className="relative min-w-[240px] flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search customer, quote #, item, dealer, factory..."
            className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-xl text-xs bg-slate-50 focus:bg-white focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex-1 min-h-0 flex items-center justify-center p-8 text-center text-slate-400 text-xs bg-white rounded-2xl border border-slate-200">
          <div>
            <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-indigo-600" />
            <span>Aggregating dispatch, local purchase, and factory logistics reports...</span>
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 w-full overflow-y-auto scrollbar-thin space-y-4 pr-1">
          {/* Printable Header Banner (Only shown on window.print) */}
          <div className="hidden print:block mb-4 border-b border-slate-300 pb-2">
            <h1 className="text-xl font-black text-slate-900">AMA CERAMICS PVT LTD</h1>
            <p className="text-xs text-slate-600">Centralized Dispatch, Local Purchase & Factory Logistics Report</p>
            <p className="text-[11px] text-slate-500">
              Timeframe: <b>{range.toUpperCase()}</b> | Generated on: {new Date().toLocaleString('en-IN')}
            </p>
          </div>

          {/* ========================================================================= */}
          {/* SECTION 1: DISPATCHED ITEMS & CUSTOMERS BREAKDOWN */}
          {/* ========================================================================= */}
          {(activeSection === 'all' || activeSection === 'dispatches') && (
            <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-xs space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center space-x-2">
                  <div className="p-2 bg-indigo-50 text-indigo-700 rounded-xl">
                    <Truck size={18} />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-sm text-slate-900 uppercase tracking-wide">
                      1. Order Dispatch & Customer Delivery Performance
                    </h3>
                    <p className="text-xs text-slate-500">
                      Track fulfilled customer shipments, invoice mappings, and revenue cleared to sites
                    </p>
                  </div>
                </div>
                <div className="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1 rounded-full">
                  {filteredDispatchedItems.length} Dispatched Item Record(s)
                </div>
              </div>

              {/* KPI Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="text-[10px] font-bold text-slate-500 uppercase">Orders Fully Delivered</div>
                  <div className="text-2xl font-black text-emerald-700 mt-1">{d.completed_orders || 0}</div>
                  <div className="text-[10px] text-emerald-600 font-semibold mt-0.5">100% Dispatched</div>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="text-[10px] font-bold text-slate-500 uppercase">Pending Delivery Backlog</div>
                  <div className="text-2xl font-black text-rose-700 mt-1">{d.pending_orders || 0}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">Quotations awaiting delivery</div>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="text-[10px] font-bold text-slate-500 uppercase">Total Delivered Value</div>
                  <div className="text-xl font-black text-slate-900 mt-1">₹ {formatCurrency(d.delivered_value)}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">Revenue cleared to customer sites</div>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="text-[10px] font-bold text-slate-500 uppercase">Total Boxes Dispatched</div>
                  <div className="text-2xl font-black text-slate-900 mt-1">{Math.round(d.total_boxes_delivered || 0)}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">Material units transported</div>
                </div>
              </div>

              {/* Itemized Table of Dispatched Goods */}
              <div className="border border-slate-200 rounded-xl overflow-hidden overflow-x-auto">
                <table className="w-full text-left text-xs min-w-[850px]">
                  <thead className="bg-slate-50 text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3 w-10 text-center">#</th>
                      <th className="py-2.5 px-3">Customer & Site Location</th>
                      <th className="py-2.5 px-3">Quote #</th>
                      <th className="py-2.5 px-3">Item Description & Specs</th>
                      <th className="py-2.5 px-3 text-center">Tax Invoice #</th>
                      <th className="py-2.5 px-3 text-center">Challan #</th>
                      <th className="py-2.5 px-3 text-right">Dispatched Qty</th>
                      <th className="py-2.5 px-3 text-right">Unit Rate</th>
                      <th className="py-2.5 px-3 text-right">Delivered Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredDispatchedItems.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-6 text-center text-slate-400 italic">
                          No dispatched goods recorded for the selected timeframe.
                        </td>
                      </tr>
                    ) : (
                      filteredDispatchedItems.map((it, idx) => (
                        <tr key={`${it.quotation_id}-${it.item_id}-${idx}`} className="hover:bg-slate-50/60 transition-colors">
                          <td className="py-2 px-3 text-center text-slate-400 font-mono">{idx + 1}</td>
                          <td className="py-2 px-3">
                            <div className="font-bold text-slate-900 flex items-center space-x-1">
                              <User size={12} className="text-slate-400" />
                              <span>{it.customer_name}</span>
                            </div>
                            <div className="text-[10px] text-slate-500 font-mono flex items-center space-x-1.5 mt-0.5">
                              {it.customer_phone && (
                                <span className="flex items-center space-x-0.5">
                                  <Phone size={10} className="text-slate-400" />
                                  <span>{it.customer_phone}</span>
                                </span>
                              )}
                              <span>•</span>
                              <span className="truncate max-w-[200px]">{it.site_location || 'Site Location'}</span>
                            </div>
                          </td>
                          <td className="py-2 px-3">
                            <span className="font-mono font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded text-[11px]">
                              {it.quotation_number}
                            </span>
                          </td>
                          <td className="py-2 px-3">
                            <div className="font-semibold text-slate-800">{it.description}</div>
                            <div className="text-[10px] text-slate-500 font-mono">
                              {it.brand && <span className="mr-2">Brand: {it.brand}</span>}
                              {it.size && <span>Size: {it.size}</span>}
                            </div>
                          </td>
                          <td className="py-2 px-3 text-center">
                            {it.last_invoice_number ? (
                              <span className="inline-block px-2 py-0.5 rounded font-mono font-bold text-[10px] bg-emerald-50 text-emerald-800 border border-emerald-200">
                                #{it.last_invoice_number}
                              </span>
                            ) : (
                              <span className="text-slate-400 text-[10px]">-</span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-center font-mono text-[10px] font-bold text-slate-600">
                            {it.challan_number || '-'}
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">
                            {it.dispatched_quantity} <span className="text-[10px] text-slate-500">{it.product_type || 'BOX'}</span>
                          </td>
                          <td className="py-2 px-3 text-right font-mono text-slate-600">
                            ₹ {formatCurrency(it.rate)}
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-black text-emerald-800">
                            ₹ {formatCurrency(it.delivered_item_value)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {filteredDispatchedItems.length > 0 && (
                    <tfoot className="bg-slate-50/80 border-t-2 border-slate-200 font-bold text-xs">
                      <tr>
                        <td colSpan={6} className="py-2.5 px-3 text-right uppercase text-[10px] text-slate-600">
                          Total Dispatched in Timeframe:
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-black text-slate-900">
                          {totalDispatchedQty}
                        </td>
                        <td></td>
                        <td className="py-2.5 px-3 text-right font-mono font-black text-emerald-800 text-sm">
                          ₹ {formatCurrency(totalDeliveredValue)}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* SECTION 2: LOCAL PURCHASE PROCUREMENT BREAKDOWN */}
          {/* ========================================================================= */}
          {(activeSection === 'all' || activeSection === 'local') && (
            <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-xs space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center space-x-2">
                  <div className="p-2 bg-amber-50 text-amber-700 rounded-xl">
                    <Package size={18} />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-sm text-slate-900 uppercase tracking-wide">
                      2. Local Purchase Procurement Performance
                    </h3>
                    <p className="text-xs text-slate-500">
                      Materials sourced locally from dealers, payment verifications, and godown arrival status
                    </p>
                  </div>
                </div>
                <div className="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1 rounded-full">
                  {filteredLocalPurchases.length} Local Item(s)
                </div>
              </div>

              {/* KPI Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="text-[10px] font-bold text-slate-500 uppercase">Total Local Items Sourced</div>
                  <div className="text-2xl font-black text-slate-900 mt-1">{l.total_local_items || 0}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">Products arranged from distributors</div>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="text-[10px] font-bold text-slate-500 uppercase">Total Local Spend</div>
                  <div className="text-xl font-black text-slate-900 mt-1">₹ {formatCurrency(l.total_actual_spend)}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">Actual purchase expenditure</div>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="text-[10px] font-bold text-slate-500 uppercase">Received in Godown</div>
                  <div className="text-2xl font-black text-emerald-700 mt-1">{l.items_arrived || 0}</div>
                  <div className="text-[10px] text-emerald-600 font-semibold mt-0.5">Converted to Ready Stock</div>
                </div>
              </div>

              {/* Local Purchases Itemized Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden overflow-x-auto">
                <table className="w-full text-left text-xs min-w-[850px]">
                  <thead className="bg-slate-50 text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3 w-10 text-center">#</th>
                      <th className="py-2.5 px-3">Customer & Quote Ref</th>
                      <th className="py-2.5 px-3">Item Description</th>
                      <th className="py-2.5 px-3">Brand & Size</th>
                      <th className="py-2.5 px-3">Dealer / Distributor</th>
                      <th className="py-2.5 px-3 text-right">Purchase Qty</th>
                      <th className="py-2.5 px-3 text-right">Actual Rate</th>
                      <th className="py-2.5 px-3 text-right">Total Spend</th>
                      <th className="py-2.5 px-3 text-center">Godown / Payment Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredLocalPurchases.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-6 text-center text-slate-400 italic">
                          No local purchases recorded for the selected timeframe.
                        </td>
                      </tr>
                    ) : (
                      filteredLocalPurchases.map((it, idx) => (
                        <tr key={`${it.quotation_id}-${it.item_id}-${idx}`} className="hover:bg-slate-50/60 transition-colors">
                          <td className="py-2 px-3 text-center text-slate-400 font-mono">{idx + 1}</td>
                          <td className="py-2 px-3">
                            <div className="font-bold text-slate-900">{it.customer_name}</div>
                            <div className="text-[10px] text-slate-500 font-mono">{it.quotation_number}</div>
                          </td>
                          <td className="py-2 px-3 font-semibold text-slate-800">
                            {it.description}
                          </td>
                          <td className="py-2 px-3 text-slate-600 text-[11px]">
                            {it.brand || '-'} {it.size ? `• ${it.size}` : ''}
                          </td>
                          <td className="py-2 px-3">
                            <div className="font-bold text-slate-800">{it.vendor_name || 'Local Dealer'}</div>
                            {it.vendor_contact && (
                              <div className="text-[10px] text-slate-400 font-mono">{it.vendor_contact}</div>
                            )}
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">
                            {it.quantity} <span className="text-[10px] text-slate-500">{it.product_type || 'BOX'}</span>
                          </td>
                          <td className="py-2 px-3 text-right font-mono text-slate-600">
                            ₹ {formatCurrency(it.actual_rate)}
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-black text-slate-900">
                            ₹ {formatCurrency(it.total_spend)}
                          </td>
                          <td className="py-2 px-3 text-center">
                            <div className="flex flex-col items-center space-y-1">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  it.purchase_status === 'ARRIVED_AT_GODOWN' || it.purchase_status === 'Reached to Godown'
                                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                    : 'bg-amber-100 text-amber-800 border border-amber-200'
                                }`}
                              >
                                {it.purchase_status === 'ARRIVED_AT_GODOWN' || it.purchase_status === 'Reached to Godown'
                                  ? 'Arrived in Godown'
                                  : it.purchase_status}
                              </span>
                              {it.payment_checked && (
                                <span className="text-[9px] text-emerald-700 flex items-center space-x-0.5 font-bold">
                                  <ShieldCheck size={10} />
                                  <span>Paid Verified</span>
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {filteredLocalPurchases.length > 0 && (
                    <tfoot className="bg-slate-50/80 border-t-2 border-slate-200 font-bold text-xs">
                      <tr>
                        <td colSpan={7} className="py-2.5 px-3 text-right uppercase text-[10px] text-slate-600">
                          Total Local Procurement Spend:
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-black text-amber-800 text-sm">
                          ₹ {formatCurrency(totalLocalSpendCalculated)}
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* SECTION 3: FACTORY LOGISTICS & INBOUND PROCUREMENT BREAKDOWN */}
          {/* ========================================================================= */}
          {(activeSection === 'all' || activeSection === 'factory') && (
            <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-xs space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center space-x-2">
                  <div className="p-2 bg-indigo-50 text-indigo-900 rounded-xl">
                    <Factory size={18} />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-sm text-slate-900 uppercase tracking-wide">
                      3. Factory Logistics & Inbound Procurement
                    </h3>
                    <p className="text-xs text-slate-500">
                      Direct plant shipments, lorry/freight tracking, and godown unloading status
                    </p>
                  </div>
                </div>
                <div className="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1 rounded-full">
                  {filteredFactoryOrders.length} Factory Item(s)
                </div>
              </div>

              {/* KPI Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="text-[10px] font-bold text-slate-500 uppercase">Factory Orders Placed</div>
                  <div className="text-2xl font-black text-slate-900 mt-1">{f.total_factory_items || 0}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">Manufacturing items ordered</div>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="text-[10px] font-bold text-slate-500 uppercase">Total Factory Boxes</div>
                  <div className="text-2xl font-black text-slate-900 mt-1">{Math.round(f.total_factory_volume || 0)}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">Volume in tiles & sanitary</div>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="text-[10px] font-bold text-slate-500 uppercase">Inbound Freight Expenditure</div>
                  <div className="text-xl font-black text-slate-900 mt-1">₹ {formatCurrency(f.total_freight_cost)}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">Lorry & transit costs</div>
                </div>
              </div>

              {/* Factory Orders Itemized Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden overflow-x-auto">
                <table className="w-full text-left text-xs min-w-[850px]">
                  <thead className="bg-slate-50 text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3 w-10 text-center">#</th>
                      <th className="py-2.5 px-3">Customer & Quote Ref</th>
                      <th className="py-2.5 px-3">Item Description</th>
                      <th className="py-2.5 px-3">Plant / Manufacturer</th>
                      <th className="py-2.5 px-3 text-right">Factory Boxes</th>
                      <th className="py-2.5 px-3">LR / Consignment #</th>
                      <th className="py-2.5 px-3">Transporter & Truck #</th>
                      <th className="py-2.5 px-3 text-right">Freight Cost</th>
                      <th className="py-2.5 px-3 text-center">Logistics Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredFactoryOrders.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-6 text-center text-slate-400 italic">
                          No factory orders recorded for the selected timeframe.
                        </td>
                      </tr>
                    ) : (
                      filteredFactoryOrders.map((it, idx) => (
                        <tr key={`${it.quotation_id}-${it.item_id}-${idx}`} className="hover:bg-slate-50/60 transition-colors">
                          <td className="py-2 px-3 text-center text-slate-400 font-mono">{idx + 1}</td>
                          <td className="py-2 px-3">
                            <div className="font-bold text-slate-900">{it.customer_name}</div>
                            <div className="text-[10px] text-slate-500 font-mono">{it.quotation_number}</div>
                          </td>
                          <td className="py-2 px-3">
                            <div className="font-semibold text-slate-800">{it.description}</div>
                            <div className="text-[10px] text-slate-500 font-mono">
                              {it.brand} {it.size ? `• ${it.size}` : ''}
                            </div>
                          </td>
                          <td className="py-2 px-3 font-bold text-slate-800">
                            {it.factory_name || 'Morbi Plant'}
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">
                            {it.boxes_quantity} <span className="text-[10px] text-slate-500">{it.product_type || 'BOX'}</span>
                          </td>
                          <td className="py-2 px-3 font-mono text-slate-600 text-[11px]">
                            {it.lr_number || '-'}
                          </td>
                          <td className="py-2 px-3 text-[11px] text-slate-700">
                            {it.transporter_name || '-'} {it.truck_number ? `(${it.truck_number})` : ''}
                          </td>
                          <td className="py-2 px-3 text-right font-mono text-slate-800">
                            ₹ {formatCurrency(it.freight_cost)}
                          </td>
                          <td className="py-2 px-3 text-center">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                it.status === 'UNLOADED'
                                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                  : it.status === 'IN_TRANSIT'
                                  ? 'bg-blue-100 text-blue-800 border border-blue-200'
                                  : 'bg-indigo-100 text-indigo-800 border border-indigo-200'
                              }`}
                            >
                              {it.status === 'UNLOADED'
                                ? 'Unloaded in Godown'
                                : it.status === 'IN_TRANSIT'
                                ? 'In Transit / Lorry'
                                : it.status}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {filteredFactoryOrders.length > 0 && (
                    <tfoot className="bg-slate-50/80 border-t-2 border-slate-200 font-bold text-xs">
                      <tr>
                        <td colSpan={4} className="py-2.5 px-3 text-right uppercase text-[10px] text-slate-600">
                          Total Factory Volume & Inbound Freight:
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-black text-slate-900">
                          {totalFactoryBoxesCalculated}
                        </td>
                        <td colSpan={2}></td>
                        <td className="py-2.5 px-3 text-right font-mono font-black text-indigo-900 text-sm">
                          ₹ {formatCurrency(totalFreightCostCalculated)}
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
