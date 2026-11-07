import React, { useState, useEffect } from 'react';
import {
  Bath,
  Search,
  Plus,
  Upload,
  RefreshCw,
  X,
  Edit2,
  Trash2,
  FileText,
  FileSpreadsheet,
  CheckCircle,
  AlertCircle,
  Image as ImageIcon,
  Sparkles,
  Tag,
  Layers,
} from 'lucide-react';
import { useServer } from '../context/ServerContext';
import { useAuth } from '../context/AuthContext';
import { SanitaryCatalogItem } from '../types';
import { SanitaryPdfCatalogUploaderModal } from '../components/SanitaryPdfCatalogUploaderModal';

export const SanitaryCatalogManagement: React.FC = () => {
  const { fetchApi } = useServer();
  const { user } = useAuth();

  const [items, setItems] = useState<SanitaryCatalogItem[]>([]);
  const [brands, setBrands] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalCount, setTotalCount] = useState(0);

  // Filters
  const [search, setSearch] = useState('');
  const [selectedBrand, setSelectedBrand] = useState('all');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Modals
  const [uploaderOpen, setUploaderOpen] = useState(false);
  const [editItemModal, setEditItemModal] = useState<SanitaryCatalogItem | null>(null);
  const [newItemModal, setNewItemModal] = useState(false);
  const [enlargedImage, setEnlargedImage] = useState<string | null>(null);

  // Form State for Create / Edit
  const [formCode, setFormCode] = useState('');
  const [formBrand, setFormBrand] = useState('Cera');
  const [formCategory, setFormCategory] = useState('Water Closet');
  const [formDesc, setFormDesc] = useState('');
  const [formMrp, setFormMrp] = useState('');
  const [formImage, setFormImage] = useState('');
  const [savingItem, setSavingItem] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const isAdminOrManager = ['admin', 'manager', 'accounts', 'accountant'].includes(user?.role || '');
  const isAdminOrAccountant = ['admin', 'accounts', 'accountant'].includes(user?.role || '');

  const standardCategories = [
    'Water Closet',
    'Wash Basin',
    'Urinal',
    'Faucet',
    'Shower',
    'Diverter',
    'Bath Accessories',
    'Kitchen Sink',
    'General',
  ];

  const loadCatalog = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '20',
      });
      if (search.trim()) params.append('search', search.trim());
      if (selectedBrand !== 'all') params.append('brand', selectedBrand);
      if (selectedCategory !== 'all') params.append('category', selectedCategory);

      const res = await fetchApi<any>(`/api/sanitary-catalog?${params.toString()}`);
      setItems(res.items || []);
      setTotalCount(res.pagination?.total || 0);
      setTotalPages(res.pagination?.totalPages || 1);
      if (Array.isArray(res.brands)) setBrands(res.brands);
      if (Array.isArray(res.categories)) setCategories(res.categories);
    } catch (err) {
      console.error('Failed to load sanitary catalog:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCatalog();
  }, [page, selectedBrand, selectedCategory]);

  // Debounced search
  useEffect(() => {
    const handler = setTimeout(() => {
      setPage(1);
      loadCatalog();
    }, 250);
    return () => clearTimeout(handler);
  }, [search]);

  // Open Create Modal
  const handleOpenCreate = () => {
    setFormCode('');
    setFormBrand('Cera');
    setFormCategory('Water Closet');
    setFormDesc('');
    setFormMrp('');
    setFormImage('');
    setFormError(null);
    setNewItemModal(true);
  };

  // Open Edit Modal
  const handleOpenEdit = (it: SanitaryCatalogItem) => {
    setEditItemModal(it);
    setFormCode(it.item_code);
    setFormBrand(it.brand || 'Sanitary');
    setFormCategory(it.category || 'General');
    setFormDesc(it.item_description);
    setFormMrp(String(it.mrp_price));
    setFormImage(it.item_image || '');
    setFormError(null);
  };

  // Image file picker
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxDim = 360;
        let w = img.width;
        let h = img.height;
        if (w > h) {
          if (w > maxDim) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          }
        } else {
          if (h > maxDim) {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, w, h);
          setFormImage(canvas.toDataURL('image/jpeg', 0.8));
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  // Save Item (Create or Update)
  const handleSaveItem = async () => {
    if (!formCode.trim()) {
      setFormError('Item code is required.');
      return;
    }
    if (!formDesc.trim()) {
      setFormError('Item description is required.');
      return;
    }

    setSavingItem(true);
    setFormError(null);

    try {
      const payload = {
        item_code: formCode.trim().toUpperCase(),
        brand: formBrand.trim(),
        category: formCategory.trim(),
        item_description: formDesc.trim(),
        mrp_price: parseFloat(formMrp) || 0,
        item_image: formImage || null,
      };

      if (editItemModal && editItemModal.id) {
        await fetchApi(`/api/sanitary-catalog/${editItemModal.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      } else {
        await fetchApi('/api/sanitary-catalog', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }

      setNewItemModal(false);
      setEditItemModal(null);
      loadCatalog();
    } catch (err: any) {
      setFormError(err.message || 'Failed to save item');
    } finally {
      setSavingItem(false);
    }
  };

  // Delete Item
  const handleDeleteItem = async (id: number) => {
    if (!confirm('Are you sure you want to delete this catalogue item?')) return;
    try {
      await fetchApi(`/api/sanitary-catalog/${id}`, { method: 'DELETE' });
      loadCatalog();
    } catch (err: any) {
      alert(err.message || 'Failed to delete item');
    }
  };

  // Clear Entire Catalog
  const handleClearAllCatalog = async () => {
    if (!isAdminOrAccountant) return;
    if (
      window.confirm(
        `Are you sure you want to remove ALL ${totalCount} items from the sanitary catalog?\n\nThis will permanently delete all catalog items, photos, and MRP references. This action cannot be undone.`
      )
    ) {
      try {
        setLoading(true);
        await fetchApi('/api/sanitary-catalog/all', { method: 'DELETE' });
        alert('All sanitary catalog data has been removed successfully.');
        await loadCatalog();
      } catch (err: any) {
        alert(err.message || 'Failed to clear catalog');
      } finally {
        setLoading(false);
      }
    }
  };

  const formatCurrency = (val: number) => {
    return Number(val || 0).toLocaleString('en-IN', {
      maximumFractionDigits: 2,
      minimumFractionDigits: 2,
    });
  };

  return (
    <div className="flex-1 p-3 sm:p-5 lg:p-6 space-y-4 overflow-y-auto w-full min-w-0 max-w-full">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-teal-500/20 border border-teal-400/30 flex items-center justify-center text-teal-300">
              <Bath size={17} />
            </div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Sanitary Ware Catalog</h1>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-teal-100 text-teal-900 font-bold border border-teal-300 font-mono">
              Auto-Fetch Database
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Reference catalogue library with {totalCount} items. Codes auto-fill descriptions, photos & MRPs in Sanitary Quotations.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {isAdminOrManager && (
            <>
              <button
                type="button"
                onClick={() => setUploaderOpen(true)}
                className="btn btn-secondary btn-xs sm:btn-sm flex items-center space-x-1 border border-teal-500/30 text-teal-950 bg-teal-50 hover:bg-teal-100"
                title="Upload PDF Manufacturer Catalogue to extract items"
              >
                <FileText size={13} className="text-teal-700" />
                <span className="text-xs">Upload PDF Catalogue</span>
              </button>

              <button
                type="button"
                onClick={handleOpenCreate}
                className="btn btn-primary btn-xs sm:btn-sm flex items-center space-x-1 shadow-sm"
              >
                <Plus size={13} />
                <span className="text-xs">Add Item</span>
              </button>

              {isAdminOrAccountant && (
                <button
                  type="button"
                  onClick={handleClearAllCatalog}
                  className="btn btn-secondary btn-xs sm:btn-sm flex items-center space-x-1 border border-rose-300 text-rose-700 bg-rose-50 hover:bg-rose-100"
                  title="Remove all data from sanitary catalog (Admin & Accounts only)"
                >
                  <Trash2 size={13} className="text-rose-600" />
                  <span className="text-xs">Remove All Data</span>
                </button>
              )}
            </>
          )}

          <button
            type="button"
            onClick={loadCatalog}
            className="btn btn-secondary btn-xs sm:btn-sm"
            title="Refresh list"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="card p-3 space-y-2.5">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          {/* Search Box */}
          <div className="relative flex-1 min-w-0">
            <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              className="input input-sm pl-8 pr-8 w-full text-xs"
              placeholder="Search by Item Code, Description, Brand (e.g. Cera, Jaquar, Kohler)..."
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

          {/* Brand & Category Filters */}
          <div className="grid grid-cols-2 sm:flex sm:items-center gap-2">
            <div className="relative min-w-0 sm:min-w-[150px]">
              <select
                className="select select-sm w-full text-xs font-medium"
                value={selectedBrand}
                onChange={(e) => {
                  setSelectedBrand(e.target.value);
                  setPage(1);
                }}
              >
                <option value="all">All Brands ({brands.length})</option>
                {brands.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>

            <div className="relative min-w-0 sm:min-w-[150px]">
              <select
                className="select select-sm w-full text-xs font-medium"
                value={selectedCategory}
                onChange={(e) => {
                  setSelectedCategory(e.target.value);
                  setPage(1);
                }}
              >
                <option value="all">All Categories ({categories.length})</option>
                {categories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Catalog Items */}
      <div className="card overflow-hidden">
        {/* Mobile View: Fixed Zero-Horizontal-Scroll Cards */}
        <div className="quotation-mobile-cards p-3 space-y-2.5">
          {loading && items.length === 0 ? (
            <div className="py-8 text-center text-slate-400 text-xs">
              <RefreshCw className="animate-spin inline mr-2 text-slate-600" size={15} />
              Loading Sanitary Catalog...
            </div>
          ) : items.length === 0 ? (
            <div className="py-8 text-center text-slate-400 text-xs">
              <Bath size={24} className="mx-auto mb-2 opacity-30 text-teal-600" />
              No sanitary items match your filters. Click <strong>"Upload PDF Catalogue"</strong> to import items.
            </div>
          ) : (
            items.map((it) => (
              <div
                key={it.id}
                className="bg-white rounded-xl border border-slate-200/90 p-3 shadow-2xs space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center space-x-2.5 min-w-0">
                    <div
                      onClick={() => it.item_image && setEnlargedImage(it.item_image)}
                      className={`w-12 h-12 rounded-lg bg-slate-100 border border-slate-200 shrink-0 overflow-hidden flex items-center justify-center ${
                        it.item_image ? 'cursor-pointer hover:ring-2 hover:ring-teal-400' : ''
                      }`}
                    >
                      {it.item_image ? (
                        <img src={it.item_image} alt={it.item_code} className="w-full h-full object-cover" />
                      ) : (
                        <ImageIcon size={16} className="text-slate-300" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="font-mono font-bold text-xs text-[#0D1B2A] truncate">
                        {it.item_code}
                      </div>
                      <div className="flex items-center space-x-1.5 mt-0.5">
                        <span className="text-[10px] font-semibold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                          {it.brand || 'Sanitary'}
                        </span>
                        <span className="text-[10px] font-semibold text-teal-800 bg-teal-50 px-1.5 py-0.5 rounded border border-teal-200">
                          {it.category || 'General'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {isAdminOrManager && (
                    <div className="flex items-center space-x-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(it)}
                        className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                        title="Edit Item"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => it.id && handleDeleteItem(it.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                        title="Delete Item"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </div>

                <div className="text-xs text-slate-700 leading-snug font-medium pt-1">
                  {it.item_description}
                </div>

                <div className="flex items-center justify-between pt-1.5 border-t border-slate-100 text-xs">
                  <span className="text-slate-400 text-[10px] font-mono">
                    {it.catalog_name ? `${it.catalog_name}${it.page_number ? ` (p.${it.page_number})` : ''}` : 'Manual Entry'}
                  </span>
                  <div className="font-mono font-bold text-emerald-700 text-sm">
                    ₹ {formatCurrency(it.mrp_price)}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Desktop View: Full Spreadsheet Table */}
        <div className="quotation-desktop-table overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-[#E0E1DD] bg-[#F8F9FA]/80 text-[#415A77] font-semibold text-[11px] uppercase tracking-wider">
                <th className="py-3 px-3.5 w-16 text-center">Image</th>
                <th className="py-3 px-3.5 w-36 whitespace-nowrap">Item Code</th>
                <th className="py-3 px-3 w-32 whitespace-nowrap">Brand & Category</th>
                <th className="py-3 px-3.5 min-w-[220px]">Item Description</th>
                <th className="py-3 px-3.5 w-32 text-right whitespace-nowrap">MRP Price (₹)</th>
                <th className="py-3 px-3 w-40 whitespace-nowrap">Catalogue Source</th>
                {isAdminOrManager && (
                  <th className="py-3 px-3.5 w-24 text-right whitespace-nowrap">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E0E1DD]/60">
              {loading && items.length === 0 ? (
                <tr>
                  <td colSpan={isAdminOrManager ? 7 : 6} className="py-12 text-center text-slate-400">
                    <RefreshCw className="animate-spin inline mr-2 text-slate-600" size={16} />
                    Loading Sanitary Catalog...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={isAdminOrManager ? 7 : 6} className="py-12 text-center text-slate-400">
                    <Bath size={28} className="mx-auto mb-2 opacity-30 text-teal-600" />
                    No sanitary items match your filters. Click <strong>"Upload PDF Catalogue"</strong> to import items.
                  </td>
                </tr>
              ) : (
                items.map((it) => (
                  <tr key={it.id} className="hover:bg-white/80 transition-colors border-b border-[#E0E1DD]/40">
                    {/* Image Thumbnail */}
                    <td className="py-2.5 px-3 text-center align-middle">
                      <div
                        onClick={() => it.item_image && setEnlargedImage(it.item_image)}
                        className={`w-11 h-11 mx-auto rounded-lg bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center ${
                          it.item_image ? 'cursor-pointer hover:ring-2 hover:ring-teal-400 transition-all' : ''
                        }`}
                        title={it.item_image ? 'Click to enlarge' : 'No image'}
                      >
                        {it.item_image ? (
                          <img
                            src={it.item_image}
                            alt={it.item_code}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <ImageIcon size={14} className="text-slate-300" />
                        )}
                      </div>
                    </td>

                    {/* Item Code */}
                    <td className="py-2.5 px-3.5 font-mono font-bold text-[#0D1B2A] whitespace-nowrap align-middle text-xs">
                      {it.item_code}
                    </td>

                    {/* Brand & Category */}
                    <td className="py-2.5 px-3 align-middle">
                      <div className="font-semibold text-slate-900 text-xs">{it.brand || 'Sanitary'}</div>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-teal-50 text-teal-800 border border-teal-200 font-mono inline-block mt-0.5">
                        {it.category || 'General'}
                      </span>
                    </td>

                    {/* Description */}
                    <td className="py-2.5 px-3.5 text-slate-700 align-middle">
                      <div className="font-medium text-xs leading-relaxed">{it.item_description}</div>
                    </td>

                    {/* MRP Price */}
                    <td className="py-2.5 px-3.5 text-right font-mono font-bold text-emerald-700 whitespace-nowrap align-middle">
                      ₹ {formatCurrency(it.mrp_price)}
                    </td>

                    {/* Catalogue Source */}
                    <td className="py-2.5 px-3 text-slate-500 text-[11px] font-mono align-middle truncate max-w-[160px]" title={it.catalog_name || 'Standard'}>
                      {it.catalog_name ? (
                        <div>
                          <div className="truncate text-slate-700 font-medium">{it.catalog_name}</div>
                          {it.page_number && <span className="text-[10px] text-slate-400">Page {it.page_number}</span>}
                        </div>
                      ) : (
                        <span className="text-slate-400">Manual Entry</span>
                      )}
                    </td>

                    {/* Actions */}
                    {isAdminOrManager && (
                      <td className="py-2.5 px-3.5 text-right whitespace-nowrap align-middle">
                        <div className="flex items-center justify-end space-x-1">
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(it)}
                            className="p-1.5 rounded text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                            title="Edit Item"
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => it.id && handleDeleteItem(it.id)}
                            className="p-1.5 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                            title="Delete Item"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="p-3 border-t border-[#E0E1DD] bg-[#F8F9FA]/80 flex items-center justify-between text-xs text-slate-600">
            <span>
              Showing Page {page} of {totalPages} ({totalCount} total reference items)
            </span>
            <div className="flex items-center space-x-1">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="btn btn-secondary btn-xs disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="btn btn-secondary btn-xs disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* PDF Catalogue Uploader Modal */}
      <SanitaryPdfCatalogUploaderModal
        isOpen={uploaderOpen}
        onClose={() => setUploaderOpen(false)}
        onImportComplete={() => {
          loadCatalog();
        }}
      />

      {/* Create / Edit Item Modal */}
      {(newItemModal || editItemModal) && (
        <div
          className="modal-overlay"
          style={{ backgroundColor: 'rgba(13, 27, 42, 0.75)', zIndex: 100 }}
          onClick={() => {
            setNewItemModal(false);
            setEditItemModal(null);
          }}
        >
          <div
            className="bg-white rounded-2xl border border-slate-300 shadow-2xl flex flex-col overflow-hidden w-full max-w-md"
            style={{ backgroundColor: '#FFFFFF', color: '#0D1B2A' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-3.5 bg-[#0D1B2A] text-white flex items-center justify-between border-b border-slate-700">
              <h2 className="text-sm font-bold text-white tracking-wide">
                {editItemModal ? 'Edit Sanitary Catalog Item' : 'Add New Reference Item'}
              </h2>
              <button
                onClick={() => {
                  setNewItemModal(false);
                  setEditItemModal(null);
                }}
                className="p-1 rounded text-slate-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-3.5 text-xs bg-white">
              {formError && (
                <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-300 text-rose-800 text-xs font-semibold flex items-center space-x-2">
                  <AlertCircle size={14} className="shrink-0 text-rose-600" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">Item Code *</label>
                  <input
                    type="text"
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-900 font-mono uppercase font-bold text-xs focus:outline-none focus:border-teal-600"
                    placeholder="e.g. SN-WC-101"
                    value={formCode}
                    onChange={(e) => setFormCode(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">Brand</label>
                  <input
                    type="text"
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-900 font-semibold text-xs focus:outline-none focus:border-teal-600"
                    placeholder="e.g. Cera"
                    value={formBrand}
                    onChange={(e) => setFormBrand(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">Category</label>
                  <select
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-900 font-medium text-xs focus:outline-none focus:border-teal-600"
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                  >
                    {standardCategories.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">MRP Price (₹)</label>
                  <input
                    type="number"
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-900 font-mono font-bold text-emerald-800 text-xs text-right focus:outline-none focus:border-teal-600"
                    placeholder="0.00"
                    value={formMrp}
                    onChange={(e) => setFormMrp(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">Item Description *</label>
                <textarea
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-900 text-xs font-medium focus:outline-none focus:border-teal-600"
                  rows={2}
                  placeholder="e.g. Wall Hung Rimless Water Closet with Soft Close Seat Cover"
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                />
              </div>

              {/* Photo Upload */}
              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">Product Photo</label>
                <div className="flex items-center space-x-3">
                  <div className="w-14 h-14 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center shrink-0">
                    {formImage ? (
                      <img src={formImage} alt="Preview" className="w-full h-full object-cover" />
                    ) : (
                      <ImageIcon size={20} className="text-slate-400" />
                    )}
                  </div>
                  <div className="flex-1 space-y-1">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileChange}
                      className="text-xs text-slate-600 file:mr-2 file:py-1 file:px-2.5 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-[#1B263B] file:text-white hover:file:bg-[#0D1B2A] cursor-pointer"
                    />
                    {formImage && (
                      <button
                        type="button"
                        onClick={() => setFormImage('')}
                        className="text-[11px] font-bold text-rose-600 hover:underline block"
                      >
                        Remove photo
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-end space-x-2">
              <button
                type="button"
                onClick={() => {
                  setNewItemModal(false);
                  setEditItemModal(null);
                }}
                className="btn btn-secondary btn-sm px-3 py-1.5 rounded-lg text-xs font-bold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={savingItem}
                onClick={handleSaveItem}
                className="btn btn-sm bg-[#1B263B] hover:bg-[#0D1B2A] text-white font-bold px-4 py-1.5 rounded-lg shadow-xs"
              >
                {savingItem ? 'Saving...' : editItemModal ? 'Update Item' : 'Add Item'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox Modal */}
      {enlargedImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 animate-fade-in cursor-zoom-out"
          onClick={() => setEnlargedImage(null)}
        >
          <div className="relative max-w-lg max-h-[85vh] bg-white rounded-2xl p-2 shadow-2xl border border-white/20">
            <img
              src={enlargedImage}
              alt="Enlarged Sanitary Item"
              className="max-h-[80vh] w-auto rounded-xl object-contain"
            />
            <button
              onClick={() => setEnlargedImage(null)}
              className="absolute top-4 right-4 w-7 h-7 rounded-full bg-slate-900/80 text-white flex items-center justify-center hover:bg-black transition-colors"
            >
              <X size={15} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
