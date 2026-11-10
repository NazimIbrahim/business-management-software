import React, { useState, useEffect } from 'react';
import { useServer } from '../context/ServerContext';
import { useAuth } from '../context/AuthContext';
import { Customer } from '../types';
import { Search, Plus, Edit, UserCheck, Phone, MapPin, RefreshCw, X, FileText, CheckCircle, Eye } from 'lucide-react';

interface Props {
  onSelectQuotation?: (id: number) => void;
}

export const CustomerManagement: React.FC<Props> = ({ onSelectQuotation }) => {
  const { fetchApi, subscribeToEvents } = useServer();
  const { user } = useAuth();
  const isSalesperson = user?.role?.toLowerCase() === 'salesperson';

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Customer Detail & Closed Quotations Modal
  const [detailModal, setDetailModal] = useState<{
    customer: Customer;
    quotations: any[];
    loading: boolean;
  } | null>(null);

  // Add / Edit Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [name, setName] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [email, setEmail] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [siteLocation, setSiteLocation] = useState('');
  const [gstin, setGstin] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(handler);
  }, [search]);

  const loadCustomers = async () => {
    setLoading(true);
    try {
      const res = await fetchApi(`/api/customers?limit=50&search=${encodeURIComponent(debouncedSearch)}`);
      setCustomers(res.customers || []);
    } catch (err) {
      console.error('Failed to load customers:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCustomers();
  }, [debouncedSearch]);

  useEffect(() => {
    const unsubscribe = subscribeToEvents((event) => {
      if (['CUSTOMER_UPDATED'].includes(event.type)) {
        loadCustomers();
      }
    });
    return () => unsubscribe();
  }, []);

  const openAddModal = () => {
    setEditingCustomer(null);
    setName('');
    setMobileNumber('');
    setEmail('');
    setDeliveryAddress('');
    setSiteLocation('');
    setGstin('');
    setNotes('');
    setModalOpen(true);
  };

  const openEditModal = (c: Customer) => {
    setEditingCustomer(c);
    setName(c.name);
    setMobileNumber(c.mobile_number);
    setEmail(c.email || '');
    setDeliveryAddress(c.delivery_address || '');
    setSiteLocation(c.site_location || '');
    setGstin(c.gstin || '');
    setNotes(c.notes || '');
    setModalOpen(true);
  };

  const openCustomerDetail = async (c: Customer) => {
    setDetailModal({ customer: c, quotations: [], loading: true });
    try {
      const res = await fetchApi(`/api/customers/${c.id}`);
      setDetailModal({ customer: res.customer || c, quotations: res.quotations || [], loading: false });
    } catch (err: any) {
      alert(err.message || 'Failed to load customer quotations');
      setDetailModal(null);
    }
  };

  const formatCurrency = (val: number) => {
    return Number(val || 0).toLocaleString('en-IN', {
      maximumFractionDigits: 0,
      minimumFractionDigits: 0,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        name,
        mobile_number: mobileNumber,
        email,
        delivery_address: deliveryAddress,
        site_location: siteLocation,
        gstin,
        notes,
      };

      if (editingCustomer) {
        await fetchApi(`/api/customers/${editingCustomer.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      } else {
        await fetchApi('/api/customers', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }

      setModalOpen(false);
      loadCustomers();
    } catch (err: any) {
      alert(err.message || 'Failed to save customer');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex-1 p-4 sm:p-5 lg:p-6 space-y-4 overflow-y-auto w-full min-w-0">
      {/* Top Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Customer Directory</h1>
          <p className="text-xs text-gray-500">
            {isSalesperson
              ? 'View and manage your assigned client contacts, site addresses, and closed deals'
              : 'Manage showroom client contacts, site addresses, and quotation histories'}
          </p>
        </div>
        <button onClick={openAddModal} className="btn btn-primary btn-sm flex items-center space-x-1">
          <Plus size={14} />
          <span>Add Customer</span>
        </button>
      </div>

      {isSalesperson && (
        <div className="bg-blue-50 border border-blue-200 text-blue-900 rounded-lg p-3 text-xs flex items-center justify-between shadow-xs">
          <div className="flex items-center space-x-2">
            <UserCheck size={16} className="text-blue-600 shrink-0" />
            <div>
              <span className="font-semibold">My Client Accounts & Closed Deals:</span> Viewing customer profiles, closed quotations, and sales records associated with your profile.
            </div>
          </div>
        </div>
      )}

      {/* Search Bar */}
      <div className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm flex items-center space-x-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-2.5 text-gray-400" />
          <input
            type="text"
            className="input input-sm pl-8"
            placeholder="Search by customer name, phone number, or project site..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button onClick={loadCustomers} className="btn btn-secondary btn-sm flex items-center space-x-1">
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Customer Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {loading && customers.length === 0 ? (
          <div className="col-span-full text-center py-10 text-gray-400">Loading customers...</div>
        ) : customers.length === 0 ? (
          <div className="col-span-full text-center py-10 text-gray-400">
            {isSalesperson
              ? 'No customer accounts or closed quotations found for your profile.'
              : 'No customers found.'}
          </div>
        ) : (
          customers.map((c) => (
            <div key={c.id} className="card card-hover p-4 rounded-lg border border-[#E0E1DD] shadow-sm space-y-2 text-xs flex flex-col justify-between">
              <div className="space-y-2">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-bold text-gray-900 text-sm">{c.name}</h3>
                    <div className="flex items-center space-x-1 text-gray-600 mt-1">
                      <Phone size={12} className="text-gray-400" />
                      <span>{c.mobile_number}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => openEditModal(c)}
                    className="p-1 rounded text-gray-400 hover:text-primary hover:bg-gray-100"
                    title="Edit Customer"
                  >
                    <Edit size={14} />
                  </button>
                </div>

                {c.site_location && (
                  <div className="flex items-center space-x-1 text-primary font-medium">
                    <MapPin size={12} />
                    <span>{c.site_location}</span>
                  </div>
                )}

                <p className="text-gray-500 text-[11px] line-clamp-2">
                  {c.delivery_address || 'No delivery address recorded'}
                </p>
              </div>

              <div className="pt-2 border-t border-gray-100 space-y-1.5 text-[11px] mt-2">
                <div className="flex justify-between text-gray-600">
                  <span className="flex items-center space-x-1">
                    <CheckCircle size={11} className="text-emerald-600" />
                    <span className="font-medium text-emerald-800">Closed Deals:</span>
                  </span>
                  <span className="font-bold text-emerald-800">
                    {c.closed_count || 0} deals (₹ {formatCurrency(c.closed_total || 0)})
                  </span>
                </div>
                <div className="flex justify-between text-gray-500">
                  <span>Total Quoted:</span>
                  <span className="font-semibold text-gray-800">
                    ₹ {formatCurrency(c.total_quoted || 0)} ({c.quotations_count || 0} quotes)
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => openCustomerDetail(c)}
                  className="w-full btn btn-secondary btn-xs py-1 mt-1 text-primary hover:text-blue-800 font-semibold border-primary/30 flex items-center justify-center space-x-1"
                >
                  <FileText size={11} />
                  <span>View Details & Deals</span>
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Customer Detail & Quotations Modal */}
      {detailModal && (
        <div className="modal-overlay">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl p-6 border border-gray-200 max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-start pb-3 border-b border-gray-100">
              <div>
                <h2 className="text-base font-bold text-gray-900">{detailModal.customer.name}</h2>
                <div className="flex items-center space-x-3 text-xs text-gray-500 mt-1">
                  <span className="flex items-center space-x-1">
                    <Phone size={12} />
                    <span>{detailModal.customer.mobile_number}</span>
                  </span>
                  {detailModal.customer.email && (
                    <span>• {detailModal.customer.email}</span>
                  )}
                  {detailModal.customer.site_location && (
                    <span className="flex items-center space-x-1 text-primary font-medium">
                      <MapPin size={12} />
                      <span>{detailModal.customer.site_location}</span>
                    </span>
                  )}
                </div>
              </div>
              <button onClick={() => setDetailModal(null)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>

            <div className="py-3 overflow-y-auto space-y-4 flex-1 text-xs">
              {/* Customer Profile Details */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-50 p-3 rounded border border-slate-200">
                <div>
                  <span className="text-[10px] text-gray-400 uppercase font-semibold">Delivery Address</span>
                  <p className="text-gray-800 mt-0.5">{detailModal.customer.delivery_address || '-'}</p>
                </div>
                <div>
                  <span className="text-[10px] text-gray-400 uppercase font-semibold">GSTIN</span>
                  <p className="text-gray-800 mt-0.5 font-mono">{detailModal.customer.gstin || 'None'}</p>
                </div>
                <div>
                  <span className="text-[10px] text-gray-400 uppercase font-semibold">Closed Deals</span>
                  <p className="text-emerald-700 font-bold mt-0.5">
                    {detailModal.customer.closed_count || 0} deals (₹ {formatCurrency(detailModal.customer.closed_total || 0)})
                  </p>
                </div>
                <div>
                  <span className="text-[10px] text-gray-400 uppercase font-semibold">Total Quoted</span>
                  <p className="text-gray-900 font-bold mt-0.5">
                    ₹ {formatCurrency(detailModal.customer.total_quoted || 0)}
                  </p>
                </div>
              </div>

              {detailModal.customer.notes && (
                <div className="bg-amber-50/60 border border-amber-200 p-2.5 rounded text-[11px] text-amber-900">
                  <span className="font-semibold">Notes:</span> {detailModal.customer.notes}
                </div>
              )}

              {/* Quotations List */}
              <div className="space-y-2">
                <h3 className="font-bold text-gray-900 text-xs flex items-center justify-between">
                  <span>Customer Quotations & Deals</span>
                  <span className="text-gray-500 font-normal">
                    {detailModal.quotations.length} total recorded
                  </span>
                </h3>

                {detailModal.loading ? (
                  <div className="py-8 text-center text-gray-400 flex items-center justify-center space-x-2">
                    <RefreshCw size={14} className="animate-spin" />
                    <span>Loading quotations...</span>
                  </div>
                ) : detailModal.quotations.length === 0 ? (
                  <div className="py-6 text-center text-gray-400 bg-gray-50 rounded border border-dashed border-gray-200">
                    No quotations found for this customer.
                  </div>
                ) : (
                  <div className="border border-gray-200 rounded-md overflow-hidden overflow-x-auto scrollbar-thin">
                    <table className="w-full min-w-[700px] text-left text-xs">
                      <thead className="bg-gray-50 text-gray-600 font-semibold border-b border-gray-200 text-[11px]">
                        <tr>
                          <th className="py-2 px-3">Quotation Ref</th>
                          <th className="py-2 px-3">Date</th>
                          <th className="py-2 px-3">Type</th>
                          <th className="py-2 px-3 text-center">Status</th>
                          <th className="py-2 px-3">Approved By</th>
                          <th className="py-2 px-3 text-right">Net Total</th>
                          <th className="py-2 px-3 text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {detailModal.quotations.map((q: any) => {
                          const isApproved = ['approved', 'closed'].includes(q.status?.toLowerCase());
                          return (
                            <tr key={q.id} className="hover:bg-slate-50 transition-colors">
                              <td className="py-2 px-3 font-mono font-semibold text-gray-900">
                                {q.quotation_number}
                              </td>
                              <td className="py-2 px-3 text-gray-600 font-mono text-[11px]">
                                {new Date(q.quotation_date).toLocaleDateString('en-GB')}
                              </td>
                              <td className="py-2 px-3">
                                {q.quotation_type === 'sanitary' ? (
                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-teal-100 text-teal-800">
                                    🚿 Sanitary
                                  </span>
                                ) : (
                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-100 text-blue-800">
                                    🧱 Tile
                                  </span>
                                )}
                              </td>
                              <td className="py-2 px-3 text-center">
                                <span className={`badge badge-${q.status}`}>{q.status}</span>
                              </td>
                              <td className="py-2 px-3">
                                {isApproved ? (
                                  <span className="text-[11px] text-emerald-800 font-semibold">
                                    {q.approved_by_name || 'Store Manager'}
                                  </span>
                                ) : (
                                  <span className="text-[11px] text-amber-700 italic">
                                    Pending Approval
                                  </span>
                                )}
                              </td>
                              <td className="py-2 px-3 text-right font-bold text-gray-900 tabular-nums">
                                ₹ {formatCurrency(q.net_total)}
                              </td>
                              <td className="py-2 px-3 text-center">
                                {onSelectQuotation && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setDetailModal(null);
                                      onSelectQuotation(q.id);
                                    }}
                                    className="btn btn-secondary btn-xs px-2 py-0.5 text-primary hover:text-blue-800 font-medium"
                                  >
                                    <Eye size={11} className="mr-1" />
                                    <span>View</span>
                                  </button>
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
            </div>

            <div className="pt-3 border-t border-gray-100 flex justify-end">
              <button
                type="button"
                onClick={() => setDetailModal(null)}
                className="btn btn-secondary btn-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Customer Modal */}
      {modalOpen && (
        <div className="modal-overlay">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6 border border-gray-200">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-base font-bold text-gray-900">
                {editingCustomer ? 'Edit Customer' : 'Add New Customer'}
              </h2>
              <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block text-gray-700 font-semibold mb-1">Full Name *</label>
                <input
                  type="text"
                  className="input input-sm"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Dr. Priya Sengupta"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-700 font-semibold mb-1">Mobile Contact *</label>
                  <input
                    type="text"
                    className="input input-sm"
                    value={mobileNumber}
                    onChange={(e) => setMobileNumber(e.target.value)}
                    placeholder="+91 98250 12345"
                    required
                  />
                </div>
                <div>
                  <label className="block text-gray-700 font-semibold mb-1">Email</label>
                  <input
                    type="email"
                    className="input input-sm"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="client@example.com"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-700 font-semibold mb-1">Project / Site Name</label>
                  <input
                    type="text"
                    className="input input-sm"
                    value={siteLocation}
                    onChange={(e) => setSiteLocation(e.target.value)}
                    placeholder="e.g. Bopal Villa Project"
                  />
                </div>
                <div>
                  <label className="block text-gray-700 font-semibold mb-1">GSTIN (Optional)</label>
                  <input
                    type="text"
                    className="input input-sm"
                    value={gstin}
                    onChange={(e) => setGstin(e.target.value)}
                    placeholder="e.g. 24AAACA5678Q1Z4"
                  />
                </div>
              </div>

              <div>
                <label className="block text-gray-700 font-semibold mb-1">Delivery Address</label>
                <textarea
                  className="input text-xs"
                  rows={2}
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  placeholder="Detailed site delivery address"
                />
              </div>

              <div>
                <label className="block text-gray-700 font-semibold mb-1">Notes / Preferences</label>
                <textarea
                  className="input text-xs"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Prefers Italian marble tones and anti-skid surfaces"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setModalOpen(false)}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button type="submit" className={`btn btn-primary btn-sm ${saving ? 'btn-saving' : ''}`} disabled={saving}>
                  {saving ? 'Saving...' : 'Save Customer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
