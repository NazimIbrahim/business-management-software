import React, { useState, useEffect, useMemo } from 'react';
import { useServer } from '../../context/ServerContext';
import { useAuth } from '../../context/AuthContext';
import {
  PackageCheck,
  Truck,
  ClipboardList,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Search,
  MapPin,
  Calendar,
  Layers,
  ArrowRight,
  ShieldCheck,
  Box,
  FileText,
  User,
  Phone,
  Tag,
  Clock,
  LogOut,
} from 'lucide-react';

interface PendingVerificationItem {
  quotation_item_id: number;
  quotation_id: number;
  quotation_number: string;
  customer_name: string;
  site_location?: string;
  description: string;
  brand: string;
  size: string;
  room_area?: string;
  expected_quantity: number;
  dispatched_quantity: number;
  remaining_quantity: number;
  unit: string;
  dispatch_status: string;
  procurement_status?: string;
  procurement_category?: string;
  godown_cleared: boolean;
  godown_verified_qty: number;
  godown_rack_location?: string;
  local_purchase_id?: number;
  vendor_name?: string;
  factory_order_id?: number;
  factory_name?: string;
  arrival_source_type: string;
}

interface PendingLoadingQuotation {
  quotation_id: number;
  quotation_number: string;
  customer_name: string;
  customer_phone?: string;
  site_location?: string;
  delivery_address?: string;
  challan_number: string;
  items: Array<{
    quotation_item_id: number;
    description: string;
    brand: string;
    size: string;
    quantity_boxes: number;
    dispatched_quantity: number;
    pending_quantity: number;
    godown_verified_qty: number;
    godown_rack_location?: string;
    godown_cleared: boolean;
  }>;
}

interface ConfirmationLog {
  id: number;
  quotation_id: number;
  quotation_number: string;
  customer_name: string;
  site_location?: string;
  quotation_item_id: number;
  item_description: string;
  item_brand?: string;
  item_size?: string;
  confirmation_type: 'STOCK_ARRIVAL' | 'PHYSICAL_DISPATCH';
  expected_quantity: number;
  verified_quantity: number;
  unit: string;
  rack_location?: string;
  batch_number?: string;
  vehicle_no?: string;
  driver_name?: string;
  driver_phone?: string;
  has_discrepancy: boolean;
  notes?: string;
  confirmed_by_name: string;
  created_at: string;
}

type TabKey = 'arrival' | 'loading' | 'logs';

export const GodownCoordinatorDashboard: React.FC = () => {
  const { fetchApi, subscribeToEvents } = useServer();
  const { user, logout } = useAuth();

  const [activeTab, setActiveTab] = useState<TabKey>('arrival');
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Data states
  const [pendingArrivals, setPendingArrivals] = useState<PendingVerificationItem[]>([]);
  const [pendingLoading, setPendingLoading] = useState<PendingLoadingQuotation[]>([]);
  const [confirmationLogs, setConfirmationLogs] = useState<ConfirmationLog[]>([]);

  // Verification Form Modal State
  const [selectedArrival, setSelectedArrival] = useState<PendingVerificationItem | null>(null);
  const [arrivalVerifiedQty, setArrivalVerifiedQty] = useState<number>(0);
  const [arrivalPhysicallyChecked, setArrivalPhysicallyChecked] = useState<boolean>(true);
  const [arrivalRackLocation, setArrivalRackLocation] = useState<string>('');
  const [arrivalBatchNumber, setArrivalBatchNumber] = useState<string>('');
  const [arrivalNotes, setArrivalNotes] = useState<string>('');

  // Loading Form Modal State
  const [selectedLoadingQuote, setSelectedLoadingQuote] = useState<PendingLoadingQuotation | null>(null);
  const [loadingItemsState, setLoadingItemsState] = useState<{ [itemId: number]: number }>({});
  const [loadingVehicleNo, setLoadingVehicleNo] = useState<string>('');
  const [loadingDriverName, setLoadingDriverName] = useState<string>('');
  const [loadingDriverPhone, setLoadingDriverPhone] = useState<string>('');
  const [loadingNotes, setLoadingNotes] = useState<string>('');

  // Feedback Notification
  const [toastMsg, setToastMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMsg({ text, type });
    setTimeout(() => setToastMsg(null), 4000);
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [arrivalsRes, loadingRes, logsRes] = await Promise.all([
        fetchApi<any>('/api/godown/pending-verifications').catch(() => ({ items: [] })),
        fetchApi<any>('/api/godown/pending-loading').catch(() => ({ quotations: [] })),
        fetchApi<any>('/api/godown/confirmations-log?limit=50').catch(() => ({ logs: [] })),
      ]);

      setPendingArrivals(arrivalsRes?.items || []);
      setPendingLoading(loadingRes?.quotations || []);
      setConfirmationLogs(logsRes?.logs || []);
    } catch (err: any) {
      showToast(err.message || 'Failed to refresh godown records', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    // Subscribe to live WebSocket events
    const unsubscribe = subscribeToEvents((event) => {
      if (
        event.type === 'godown:arrival_verified' ||
        event.type === 'godown:loading_verified' ||
        event.type === 'DISPATCH_UPDATED' ||
        event.type === 'vendor:tax_invoice_submitted'
      ) {
        loadData();
      }
    });

    return () => unsubscribe();
  }, []);

  // Filtered arrivals
  const filteredArrivals = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();
    if (!q) return pendingArrivals;
    return pendingArrivals.filter(
      (item) =>
        item.description.toLowerCase().includes(q) ||
        item.brand?.toLowerCase().includes(q) ||
        item.quotation_number?.toLowerCase().includes(q) ||
        item.customer_name?.toLowerCase().includes(q)
    );
  }, [pendingArrivals, searchTerm]);

  // Open Arrival Verification Modal
  const handleOpenArrivalModal = (item: PendingVerificationItem) => {
    setSelectedArrival(item);
    setArrivalVerifiedQty(item.expected_quantity);
    setArrivalPhysicallyChecked(true);
    setArrivalRackLocation(item.godown_rack_location || '');
    setArrivalBatchNumber('');
    setArrivalNotes('');
  };

  // Submit Arrival Verification
  const handleSubmitArrival = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedArrival) return;

    if (!arrivalPhysicallyChecked) {
      showToast('Please confirm that the material is physically verified in the yard/godown.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      await fetchApi('/api/godown/verify-arrival', {
        method: 'POST',
        body: JSON.stringify({
          quotation_id: selectedArrival.quotation_id,
          quotation_item_id: selectedArrival.quotation_item_id,
          local_purchase_id: selectedArrival.local_purchase_id,
          expected_quantity: selectedArrival.expected_quantity,
          verified_quantity: arrivalVerifiedQty,
          unit: selectedArrival.unit,
          rack_location: arrivalRackLocation,
          batch_number: arrivalBatchNumber,
          notes: arrivalNotes,
        }),
      });

      showToast(`Item verified & cleared for loading! Rack: ${arrivalRackLocation || 'Yard General'}`);
      setSelectedArrival(null);
      await loadData();
    } catch (err: any) {
      showToast(err.message || 'Verification submission failed', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Open Loading Verification Modal
  const handleOpenLoadingModal = (quote: PendingLoadingQuotation) => {
    setSelectedLoadingQuote(quote);
    const initialCounts: { [itemId: number]: number } = {};
    quote.items.forEach((it) => {
      initialCounts[it.quotation_item_id] = it.pending_quantity;
    });
    setLoadingItemsState(initialCounts);
    setLoadingVehicleNo('');
    setLoadingDriverName('');
    setLoadingDriverPhone('');
    setLoadingNotes('');
  };

  // Submit Loading Gate Pass Verification
  const handleSubmitLoading = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLoadingQuote) return;

    const itemsToSubmit = selectedLoadingQuote.items
      .map((it) => ({
        quotation_item_id: it.quotation_item_id,
        expected_quantity: it.pending_quantity,
        loaded_quantity: Number(loadingItemsState[it.quotation_item_id] || 0),
        unit: 'BOX',
      }))
      .filter((it) => it.loaded_quantity > 0);

    if (itemsToSubmit.length === 0) {
      showToast('Please specify loaded quantity for at least one item.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      await fetchApi('/api/godown/verify-loading', {
        method: 'POST',
        body: JSON.stringify({
          quotation_id: selectedLoadingQuote.quotation_id,
          items: itemsToSubmit,
          vehicle_no: loadingVehicleNo,
          driver_name: loadingDriverName,
          driver_phone: loadingDriverPhone,
          notes: loadingNotes,
        }),
      });

      showToast(`Loading verified for vehicle ${loadingVehicleNo || 'Gate Dispatch'}! Gate pass signed.`);
      setSelectedLoadingQuote(null);
      await loadData();
    } catch (err: any) {
      showToast(err.message || 'Loading verification failed', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans">
      {/* Toast Banner */}
      {toastMsg && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 border ${
            toastMsg.type === 'success'
              ? 'bg-emerald-950/90 border-emerald-500/50 text-emerald-200'
              : 'bg-rose-950/90 border-rose-500/50 text-rose-200'
          } animate-fade-in`}
        >
          {toastMsg.type === 'success' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
          <span className="text-sm font-semibold">{toastMsg.text}</span>
        </div>
      )}

      {/* Top Godown Operations Header */}
      <header className="bg-slate-800/90 border-b border-slate-700/60 sticky top-0 z-30 backdrop-blur-md px-4 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-orange-500/20 text-white font-bold">
            <PackageCheck size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-black tracking-wide text-white">
                GODOWN & YARD COORDINATOR PORTAL
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-amber-500/20 text-amber-300 border border-amber-400/30">
                Yard Ops
              </span>
            </div>
            <p className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5">
              <span>Main Warehouse Yard</span> •
              <span className="text-slate-300 font-medium">{user?.full_name || user?.username}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="p-2 bg-slate-700/70 hover:bg-slate-700 rounded-lg text-slate-300 hover:text-white transition cursor-pointer flex items-center gap-1.5 text-xs font-semibold"
            title="Refresh Records"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">Sync Yard</span>
          </button>

          {logout && (
            <button
              type="button"
              onClick={logout}
              className="p-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 hover:text-rose-200 border border-rose-500/30 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
            >
              <LogOut size={14} />
              <span className="hidden sm:inline">Logout</span>
            </button>
          )}
        </div>
      </header>

      {/* Sub-Navigation Tabs */}
      <div className="bg-slate-800/40 border-b border-slate-700/50 px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => setActiveTab('arrival')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
              activeTab === 'arrival'
                ? 'bg-amber-500 text-slate-950 shadow-md font-black'
                : 'bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700/60'
            }`}
          >
            <PackageCheck size={15} />
            <span>Material Arrival Audit</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                activeTab === 'arrival' ? 'bg-slate-950/20 text-slate-950 font-black' : 'bg-slate-700 text-slate-300'
              }`}
            >
              {pendingArrivals.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('loading')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
              activeTab === 'loading'
                ? 'bg-blue-500 text-white shadow-md font-black'
                : 'bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700/60'
            }`}
          >
            <Truck size={15} />
            <span>Vehicle Loading Gate Pass</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                activeTab === 'loading' ? 'bg-white/20 text-white font-black' : 'bg-slate-700 text-slate-300'
              }`}
            >
              {pendingLoading.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('logs')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
              activeTab === 'logs'
                ? 'bg-emerald-500 text-slate-950 shadow-md font-black'
                : 'bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700/60'
            }`}
          >
            <ClipboardList size={15} />
            <span>Godown Confirmations Log</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-700 text-slate-300">
              {confirmationLogs.length}
            </span>
          </button>
        </div>

        {/* Quick Search */}
        <div className="relative w-full sm:w-64">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search item, order #, brand..."
            className="w-full pl-9 pr-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
          />
        </div>
      </div>

      {/* Main Container */}
      <main className="flex-1 p-4 sm:p-6 max-w-7xl w-full mx-auto">
        {/* ========================================================================= */}
        {/* TAB 1: PENDING YARD ARRIVAL AUDIT */}
        {/* ========================================================================= */}
        {activeTab === 'arrival' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-1">
              <div>
                <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                  <span>Physical Inventory Waiting for Yard Inspection</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                    {filteredArrivals.length} item(s)
                  </span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Confirm physical box counts, assign warehouse racks/bins, and clear materials for vehicle loading.
                </p>
              </div>
            </div>

            {loading ? (
              <div className="py-20 flex flex-col items-center justify-center text-slate-400">
                <RefreshCw size={28} className="animate-spin text-amber-500 mb-2" />
                <span className="text-xs">Loading yard inventory...</span>
              </div>
            ) : filteredArrivals.length === 0 ? (
              <div className="bg-slate-800/40 border border-slate-700/60 rounded-xl p-12 text-center text-slate-400">
                <CheckCircle2 size={36} className="mx-auto text-emerald-400 mb-2" />
                <h3 className="text-sm font-bold text-white">All Arriving Inventory Inspected & Cleared!</h3>
                <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                  No materials currently awaiting yard physical checks. Any newly arrived local purchase or unloaded factory shipment will appear here automatically.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {filteredArrivals.map((item) => (
                  <div
                    key={item.quotation_item_id}
                    className="bg-slate-800/70 border border-slate-700/70 hover:border-amber-500/50 rounded-xl p-4 flex flex-col justify-between transition-all shadow-md group"
                  >
                    <div>
                      {/* Badge Row */}
                      <div className="flex items-center justify-between gap-2 mb-2.5">
                        <span className="text-[11px] font-mono font-bold text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded border border-amber-400/20">
                          {item.quotation_number}
                        </span>

                        <span
                          className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full border ${
                            item.arrival_source_type === 'LOCAL_PURCHASE_ARRIVED'
                              ? 'bg-blue-500/15 text-blue-300 border-blue-400/30'
                              : item.arrival_source_type === 'FACTORY_SHIPMENT_UNLOADED'
                              ? 'bg-purple-500/15 text-purple-300 border-purple-400/30'
                              : 'bg-emerald-500/15 text-emerald-300 border-emerald-400/30'
                          }`}
                        >
                          {item.arrival_source_type === 'LOCAL_PURCHASE_ARRIVED'
                            ? 'Local Arrival'
                            : item.arrival_source_type === 'FACTORY_SHIPMENT_UNLOADED'
                            ? 'Factory Unload'
                            : 'Ready Stock Yard'}
                        </span>
                      </div>

                      {/* Product Specs */}
                      <h3 className="text-sm font-black text-white group-hover:text-amber-300 transition-colors">
                        {item.description}
                      </h3>
                      <div className="text-xs text-slate-400 flex flex-wrap gap-2 mt-1">
                        {item.brand && <span>Brand: <strong className="text-slate-300">{item.brand}</strong></span>}
                        {item.size && <span>• Size: <strong className="text-slate-300">{item.size}</strong></span>}
                        {item.room_area && <span>• Area: <strong className="text-slate-300">{item.room_area}</strong></span>}
                      </div>

                      {/* Source details */}
                      <div className="mt-3 p-2 bg-slate-900/60 rounded-lg text-xs text-slate-300 space-y-1 border border-slate-700/40">
                        {item.vendor_name && (
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400">Supplier:</span>
                            <span className="font-semibold text-white truncate max-w-[170px]">{item.vendor_name}</span>
                          </div>
                        )}
                        {item.factory_name && (
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400">Plant:</span>
                            <span className="font-semibold text-white truncate max-w-[170px]">{item.factory_name}</span>
                          </div>
                        )}
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Expected Count:</span>
                          <span className="font-extrabold text-amber-400">
                            {item.expected_quantity} {item.unit.toUpperCase()}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Action Button */}
                    <div className="mt-4 pt-3 border-t border-slate-700/50 flex items-center justify-between">
                      <span className="text-[11px] text-slate-400">Awaiting Yard Check</span>
                      <button
                        type="button"
                        onClick={() => handleOpenArrivalModal(item)}
                        className="px-3 py-1.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs rounded-lg shadow-md transition active:scale-95 flex items-center gap-1.5 cursor-pointer"
                      >
                        <ShieldCheck size={14} />
                        <span>Inspect & Clear</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: VEHICLE LOADING GATE PASS */}
        {/* ========================================================================= */}
        {activeTab === 'loading' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-1">
              <div>
                <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                  <span>Cleared Orders Awaiting Truck Loading</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                    {pendingLoading.length} order(s)
                  </span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Verify actual box quantities loaded into the vehicle, record vehicle/driver details, and issue gate clearance.
                </p>
              </div>
            </div>

            {loading ? (
              <div className="py-20 flex flex-col items-center justify-center text-slate-400">
                <RefreshCw size={28} className="animate-spin text-blue-500 mb-2" />
                <span className="text-xs">Loading pending dispatches...</span>
              </div>
            ) : pendingLoading.length === 0 ? (
              <div className="bg-slate-800/40 border border-slate-700/60 rounded-xl p-12 text-center text-slate-400">
                <Truck size={36} className="mx-auto text-blue-400 mb-2" />
                <h3 className="text-sm font-bold text-white">No Dispatches Awaiting Loading</h3>
                <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                  Once materials are verified in the yard and scheduled for delivery, they will appear here for vehicle gate check.
                </p>
              </div>
            ) : (
              <div className="space-y-3.5">
                {pendingLoading.map((quote) => (
                  <div
                    key={quote.quotation_id}
                    className="bg-slate-800/70 border border-slate-700/70 rounded-xl p-4 sm:p-5 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 shadow-md"
                  >
                    <div className="flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <span className="text-xs font-mono font-bold text-blue-400 bg-blue-500/10 px-2.5 py-0.5 rounded border border-blue-400/20">
                          {quote.quotation_number}
                        </span>
                        <span className="text-xs font-bold text-white">{quote.customer_name}</span>
                        {quote.customer_phone && (
                          <span className="text-xs text-slate-400 flex items-center gap-1">
                            <Phone size={12} /> {quote.customer_phone}
                          </span>
                        )}
                        {quote.site_location && (
                          <span className="text-xs text-slate-400 flex items-center gap-1">
                            <MapPin size={12} /> {quote.site_location}
                          </span>
                        )}
                      </div>

                      {/* Item list summary */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 pt-1">
                        {quote.items.map((it) => (
                          <div
                            key={it.quotation_item_id}
                            className="p-2 bg-slate-900/60 rounded border border-slate-700/40 text-xs"
                          >
                            <div className="font-semibold text-slate-200 truncate">{it.description}</div>
                            <div className="text-[11px] text-slate-400 flex items-center justify-between mt-1">
                              <span>Pending: <strong className="text-amber-400">{it.pending_quantity} boxes</strong></span>
                              {it.godown_rack_location && (
                                <span className="text-blue-300 font-mono text-[10px]">Rack: {it.godown_rack_location}</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleOpenLoadingModal(quote)}
                      className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-blue-600/25 transition active:scale-95 flex items-center gap-2 flex-shrink-0 cursor-pointer"
                    >
                      <Truck size={16} />
                      <span>Verify Truck Loading</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: GODOWN CONFIRMATIONS AUDIT LOG */}
        {/* ========================================================================= */}
        {activeTab === 'logs' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-1">
              <div>
                <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                  <span>Physical Verification & Gate Audit Log</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                    {confirmationLogs.length} entries
                  </span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Immutable record of all physical count checks, rack placements, and vehicle loading sign-offs.
                </p>
              </div>
            </div>

            {confirmationLogs.length === 0 ? (
              <div className="bg-slate-800/40 border border-slate-700/60 rounded-xl p-12 text-center text-slate-400">
                <ClipboardList size={36} className="mx-auto text-slate-500 mb-2" />
                <h3 className="text-sm font-bold text-white">No Confirmations Recorded Yet</h3>
                <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                  Audit entries will appear here automatically when arriving stock is inspected or dispatches are loaded.
                </p>
              </div>
            ) : (
              <div className="bg-slate-800/50 border border-slate-700/60 rounded-xl overflow-hidden shadow-md">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-900/80 border-b border-slate-700/60 text-slate-400 text-[11px] font-bold uppercase tracking-wider">
                        <th className="py-3 px-4">Date / Time</th>
                        <th className="py-3 px-4">Type</th>
                        <th className="py-3 px-4">Order #</th>
                        <th className="py-3 px-4">Material Specs</th>
                        <th className="py-3 px-4">Expected vs. Verified</th>
                        <th className="py-3 px-4">Rack / Vehicle</th>
                        <th className="py-3 px-4">Coordinator</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/40">
                      {confirmationLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-slate-800/80 transition-colors">
                          <td className="py-3 px-4 font-mono text-[11px] text-slate-400 whitespace-nowrap">
                            {new Date(log.created_at).toLocaleString('en-IN', {
                              dateStyle: 'short',
                              timeStyle: 'short',
                            })}
                          </td>

                          <td className="py-3 px-4">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase inline-flex items-center gap-1 ${
                                log.confirmation_type === 'STOCK_ARRIVAL'
                                  ? 'bg-amber-500/15 text-amber-300 border border-amber-400/30'
                                  : 'bg-blue-500/15 text-blue-300 border border-blue-400/30'
                              }`}
                            >
                              {log.confirmation_type === 'STOCK_ARRIVAL' ? 'Yard Arrival' : 'Truck Loading'}
                            </span>
                          </td>

                          <td className="py-3 px-4 font-mono font-bold text-slate-200">
                            {log.quotation_number}
                          </td>

                          <td className="py-3 px-4">
                            <div className="font-semibold text-white max-w-xs truncate">
                              {log.item_description}
                            </div>
                            {(log.item_brand || log.item_size) && (
                              <div className="text-[10px] text-slate-400">
                                {log.item_brand} {log.item_size ? `• ${log.item_size}` : ''}
                              </div>
                            )}
                          </td>

                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <span className="text-slate-400">{log.expected_quantity}</span>
                              <ArrowRight size={12} className="text-slate-500" />
                              <span
                                className={`font-bold ${
                                  log.has_discrepancy ? 'text-rose-400' : 'text-emerald-400'
                                }`}
                              >
                                {log.verified_quantity} {log.unit}
                              </span>
                            </div>
                            {log.has_discrepancy && (
                              <span className="text-[10px] text-rose-400 flex items-center gap-1 font-semibold mt-0.5">
                                <AlertTriangle size={10} /> Discrepancy Flagged
                              </span>
                            )}
                          </td>

                          <td className="py-3 px-4 text-slate-300">
                            {log.rack_location && (
                              <div className="text-[11px] font-mono">
                                <span className="text-slate-500">Rack:</span> {log.rack_location}
                              </div>
                            )}
                            {log.vehicle_no && (
                              <div className="text-[11px] font-mono text-blue-300">
                                <span className="text-slate-500">Truck:</span> {log.vehicle_no}
                              </div>
                            )}
                            {log.driver_name && (
                              <div className="text-[10px] text-slate-400">
                                Driver: {log.driver_name} {log.driver_phone ? `(${log.driver_phone})` : ''}
                              </div>
                            )}
                          </td>

                          <td className="py-3 px-4 font-semibold text-slate-300 whitespace-nowrap">
                            {log.confirmed_by_name || 'Coordinator'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* ========================================================================= */}
      {/* MODAL: PHYSICAL YARD ARRIVAL INSPECTION */}
      {/* ========================================================================= */}
      {selectedArrival && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-2xl relative">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <span className="text-[11px] font-mono font-bold text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded border border-amber-400/20">
                  {selectedArrival.quotation_number}
                </span>
                <h3 className="text-base font-bold text-white mt-1">
                  Physical Material Arrival Inspection
                </h3>
                <p className="text-xs text-slate-400">
                  Verify boxes on yard ground before marking ready for dispatch.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedArrival(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitArrival} className="space-y-4">
              {/* Item Info Box */}
              <div className="p-3 bg-slate-800/80 rounded-xl border border-slate-700/60 text-xs space-y-1">
                <div className="font-bold text-white">{selectedArrival.description}</div>
                <div className="text-slate-400">
                  {selectedArrival.brand} • {selectedArrival.size}
                </div>
                <div className="flex items-center justify-between pt-1 border-t border-slate-700/40 text-slate-300">
                  <span>Expected Quantity:</span>
                  <span className="font-bold text-amber-400 text-sm">
                    {selectedArrival.expected_quantity} {selectedArrival.unit.toUpperCase()}
                  </span>
                </div>
              </div>

              {/* Physical check checkbox */}
              <label className="flex items-start gap-3 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl cursor-pointer">
                <input
                  type="checkbox"
                  checked={arrivalPhysicallyChecked}
                  onChange={(e) => setArrivalPhysicallyChecked(e.target.checked)}
                  className="mt-0.5 rounded text-amber-500 focus:ring-0 w-4 h-4 cursor-pointer"
                />
                <div className="text-xs">
                  <div className="font-bold text-amber-200">
                    Material Physically Verified in Yard / Godown
                  </div>
                  <div className="text-amber-400/80 text-[11px] mt-0.5">
                    I confirm that the boxes are physically present and visually undamaged.
                  </div>
                </div>
              </label>

              {/* Verified Count */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Actual Count in Boxes / Units *
                </label>
                <input
                  type="number"
                  step="any"
                  value={arrivalVerifiedQty}
                  onChange={(e) => setArrivalVerifiedQty(Number(e.target.value))}
                  required
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white font-mono font-bold focus:outline-none focus:border-amber-500"
                />
                {arrivalVerifiedQty < selectedArrival.expected_quantity && (
                  <div className="mt-1.5 p-2 bg-rose-500/15 border border-rose-500/30 rounded-lg text-xs text-rose-300 flex items-center gap-2">
                    <AlertTriangle size={14} className="flex-shrink-0" />
                    <span>
                      Shortage Warning: Count is{' '}
                      <strong>{selectedArrival.expected_quantity - arrivalVerifiedQty}</strong> less than expected!
                    </span>
                  </div>
                )}
              </div>

              {/* Rack Location & Shade Batch */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    Rack / Bin Location
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Rack A-12, Yard Bay 2"
                    value={arrivalRackLocation}
                    onChange={(e) => setArrivalRackLocation(e.target.value)}
                    className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    Factory Shade / Batch #
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. B-2026-08 / Shade 4"
                    value={arrivalBatchNumber}
                    onChange={(e) => setArrivalBatchNumber(e.target.value)}
                    className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {/* Remarks */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Inspection Remarks / Quality Notes
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Corner edge check ok, pallets clean..."
                  value={arrivalNotes}
                  onChange={(e) => setArrivalNotes(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Modal Buttons */}
              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setSelectedArrival(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs rounded-lg shadow-md flex items-center gap-1.5 cursor-pointer"
                >
                  <ShieldCheck size={15} />
                  <span>{submitting ? 'Verifying...' : 'Clear for Dispatch'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: VEHICLE LOADING GATE PASS */}
      {/* ========================================================================= */}
      {selectedLoadingQuote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-xl w-full p-5 sm:p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <span className="text-[11px] font-mono font-bold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-400/20">
                  {selectedLoadingQuote.quotation_number}
                </span>
                <h3 className="text-base font-bold text-white mt-1">
                  Vehicle Loading & Gate Sign-Off
                </h3>
                <p className="text-xs text-slate-400">
                  Verify quantities loaded onto truck and capture driver/vehicle credentials.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedLoadingQuote(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitLoading} className="space-y-4">
              {/* Items loaded table */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-300">
                  Items to Load into Vehicle:
                </label>
                <div className="space-y-2">
                  {selectedLoadingQuote.items.map((it) => (
                    <div
                      key={it.quotation_item_id}
                      className="p-3 bg-slate-800/80 border border-slate-700/60 rounded-xl flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-white truncate">{it.description}</div>
                        <div className="text-slate-400 text-[11px]">
                          Pending Delivery: <strong>{it.pending_quantity} boxes</strong>
                          {it.godown_rack_location && <span> • Rack: {it.godown_rack_location}</span>}
                        </div>
                      </div>

                      <div className="w-28 flex-shrink-0">
                        <label className="text-[10px] text-slate-400 block mb-0.5">Loaded Qty:</label>
                        <input
                          type="number"
                          step="any"
                          value={loadingItemsState[it.quotation_item_id] ?? it.pending_quantity}
                          onChange={(e) =>
                            setLoadingItemsState({
                              ...loadingItemsState,
                              [it.quotation_item_id]: Number(e.target.value),
                            })
                          }
                          className="w-full px-2 py-1 bg-slate-900 border border-slate-700 rounded text-center text-xs text-white font-mono font-bold focus:outline-none focus:border-blue-500"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Vehicle & Driver Details */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    Vehicle / Truck # *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="KA-01-AB-1234"
                    value={loadingVehicleNo}
                    onChange={(e) => setLoadingVehicleNo(e.target.value)}
                    className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white font-mono focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Driver Name</label>
                  <input
                    type="text"
                    placeholder="Ramesh"
                    value={loadingDriverName}
                    onChange={(e) => setLoadingDriverName(e.target.value)}
                    className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Driver Phone</label>
                  <input
                    type="text"
                    placeholder="+91 98765 43210"
                    value={loadingDriverPhone}
                    onChange={(e) => setLoadingDriverPhone(e.target.value)}
                    className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white font-mono focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Loading remarks */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Gate Loading Remarks
                </label>
                <textarea
                  rows={2}
                  placeholder="Gate pass number, floor delivery instructions..."
                  value={loadingNotes}
                  onChange={(e) => setLoadingNotes(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Modal Buttons */}
              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setSelectedLoadingQuote(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-lg shadow-md flex items-center gap-1.5 cursor-pointer"
                >
                  <Truck size={15} />
                  <span>{submitting ? 'Signing Off...' : 'Issue Gate Sign-Off'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
