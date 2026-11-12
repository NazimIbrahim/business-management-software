import React, { useState, useEffect } from 'react';
import { useServer } from '../context/ServerContext';
import { useAuth } from '../context/AuthContext';
import { TileBrand, BrandSizeCoverage, ProductType } from '../types';
import { Layers, Plus, Tag, RefreshCw, X, Edit2, Trash2 } from 'lucide-react';

interface Props {
  initialOpenModal?: boolean;
}

export const ProductManagement: React.FC<Props> = ({ initialOpenModal }) => {
  const { fetchApi } = useServer();
  const { user } = useAuth();

  const [brands, setBrands] = useState<TileBrand[]>([]);
  const [coverages, setCoverages] = useState<BrandSizeCoverage[]>([]);
  const [selectedBrandId, setSelectedBrandId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  // Brand Modal State (Create & Edit)
  const [brandModal, setBrandModal] = useState(false);
  const [editingBrand, setEditingBrand] = useState<TileBrand | null>(null);
  const [brandName, setBrandName] = useState('');
  const [brandDesc, setBrandDesc] = useState('');

  // Coverage Modal State (Create & Edit)
  const [coverageModal, setCoverageModal] = useState(false);
  const [editingCoverage, setEditingCoverage] = useState<BrandSizeCoverage | null>(null);
  const [covBrandId, setCovBrandId] = useState<number>(0);
  const [productType, setProductType] = useState<ProductType>('box');
  const [size, setSize] = useState('1200X1800');
  const [coverageSqft, setCoverageSqft] = useState('46.5');
  const [piecesPerBox, setPiecesPerBox] = useState('2');
  const [rateSqft, setRateSqft] = useState('130.0');

  const isAdminOrManager = ['admin', 'manager', 'accounts', 'accountant'].includes(user?.role || '');
  const isAdminOrAccountant = ['admin', 'accounts', 'accountant'].includes(user?.role || '');

  const loadData = async () => {
    setLoading(true);
    try {
      const bRes = await fetchApi<{ brands: TileBrand[] }>('/api/products/brands');
      const loadedBrands = bRes.brands || [];
      setBrands(loadedBrands);

      if (loadedBrands.length > 0) {
        setSelectedBrandId((prev) => (prev && loadedBrands.some((b) => b.id === prev) ? prev : loadedBrands[0].id));
      } else {
        setSelectedBrandId(null);
      }

      const cRes = await fetchApi<{ coverages: BrandSizeCoverage[] }>('/api/products/coverages');
      setCoverages(cRes.coverages || []);
    } catch (err) {
      console.error('Failed to load products/coverages:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Open Create Brand
  const handleOpenCreateBrand = () => {
    setEditingBrand(null);
    setBrandName('');
    setBrandDesc('');
    setBrandModal(true);
  };

  useEffect(() => {
    if (initialOpenModal) {
      handleOpenCreateBrand();
    }
  }, [initialOpenModal]);

  // Open Edit Brand
  const handleOpenEditBrand = (b: TileBrand, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingBrand(b);
    setBrandName(b.name);
    setBrandDesc(b.description || '');
    setBrandModal(true);
  };

  // Delete Brand
  const handleDeleteBrand = async (b: TileBrand, e: React.MouseEvent) => {
    e.stopPropagation();
    const confirmed = window.confirm(
      `Are you sure you want to delete brand "${b.name}"?\nAll associated tile size specifications will also be permanently deleted.`
    );
    if (!confirmed) return;

    try {
      await fetchApi(`/api/products/brands/${b.id}`, { method: 'DELETE' });
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to delete brand');
    }
  };

  // Save Brand (POST or PUT)
  const handleSaveBrand = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingBrand) {
        await fetchApi(`/api/products/brands/${editingBrand.id}`, {
          method: 'PUT',
          body: JSON.stringify({ name: brandName, description: brandDesc }),
        });
      } else {
        await fetchApi('/api/products/brands', {
          method: 'POST',
          body: JSON.stringify({ name: brandName, description: brandDesc }),
        });
      }
      setBrandModal(false);
      setEditingBrand(null);
      setBrandName('');
      setBrandDesc('');
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to save brand');
    }
  };

  // Open Create Coverage
  const handleOpenCreateCoverage = () => {
    setEditingCoverage(null);
    setCovBrandId(selectedBrandId || (brands[0]?.id || 1));
    setProductType('box');
    setSize('1200X1800');
    setCoverageSqft('46.5');
    setPiecesPerBox('2');
    setRateSqft('130.0');
    setCoverageModal(true);
  };

  // Open Edit Coverage
  const handleOpenEditCoverage = (c: BrandSizeCoverage, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingCoverage(c);
    setCovBrandId(c.brand_id);
    setProductType(c.product_type || 'box');
    setSize(c.size);
    setCoverageSqft(String(c.coverage_sqft || '0'));
    setPiecesPerBox(String(c.pieces_per_box || '1'));
    setRateSqft(String(c.default_rate_sqft || c.default_rate_box || '0'));
    setCoverageModal(true);
  };

  // Delete Coverage
  const handleDeleteCoverage = async (c: BrandSizeCoverage, e: React.MouseEvent) => {
    e.stopPropagation();
    const confirmed = window.confirm(`Are you sure you want to delete size specification "${c.size}"?`);
    if (!confirmed) return;

    try {
      await fetchApi(`/api/products/coverages/${c.id}`, { method: 'DELETE' });
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to delete size specification');
    }
  };

  // Save Coverage (POST or PUT)
  const handleSaveCoverage = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        brand_id: covBrandId || selectedBrandId,
        size,
        product_type: productType,
        coverage_sqft: productType === 'box' ? coverageSqft : '0',
        pieces_per_box: productType === 'box' ? piecesPerBox : '1',
        default_rate_sqft: productType === 'sqft' || productType === 'box' ? rateSqft : '0',
        default_rate_box: productType !== 'box' && productType !== 'sqft' ? rateSqft : undefined,
      };

      if (editingCoverage) {
        await fetchApi(`/api/products/coverages/${editingCoverage.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      } else {
        await fetchApi('/api/products/coverages', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      setCoverageModal(false);
      setEditingCoverage(null);
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to save size specification');
    }
  };

  const handleClearAllTileCatalog = async () => {
    if (!isAdminOrAccountant) return;
    if (
      window.confirm(
        'Are you sure you want to remove ALL tile brands and size specifications from the catalogue?\n\nThis will permanently delete all brand coverage data. This action cannot be undone.'
      )
    ) {
      try {
        setLoading(true);
        await fetchApi('/api/products/all', { method: 'DELETE' });
        alert('All tile catalogue data has been removed successfully.');
        await loadData();
      } catch (err: any) {
        alert(err.message || 'Failed to clear tile catalogue');
      } finally {
        setLoading(false);
      }
    }
  };

  const filteredCoverages = selectedBrandId
    ? coverages.filter((c) => c.brand_id === selectedBrandId)
    : coverages;

  const currentBrand = brands.find((b) => b.id === selectedBrandId);

  return (
    <div className="flex-1 p-3 sm:p-5 lg:p-6 space-y-4 overflow-y-auto w-full min-w-0 max-w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-xl font-bold text-[#0D1B2A]">Tile Brands & Size Specifications</h1>
          <p className="text-xs text-[#415A77]">
            Configure box coverage formulas, pieces per carton, and standard rates
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <button
            onClick={loadData}
            title="Refresh brands and formulas"
            className="btn btn-secondary btn-xs sm:btn-sm flex items-center space-x-1"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
          {isAdminOrManager && (
            <>
              <button
                onClick={handleOpenCreateBrand}
                className="btn btn-secondary btn-xs sm:btn-sm flex items-center space-x-1"
              >
                <Tag size={12} />
                <span>+ Add Brand</span>
              </button>
              <button
                onClick={handleOpenCreateCoverage}
                className="btn btn-primary btn-xs sm:btn-sm flex items-center space-x-1"
              >
                <Plus size={12} />
                <span>+ Add Size Formula</span>
              </button>
              {isAdminOrAccountant && (
                <button
                  onClick={handleClearAllTileCatalog}
                  className="btn btn-secondary btn-xs sm:btn-sm flex items-center space-x-1 border border-rose-300 text-rose-700 bg-rose-50 hover:bg-rose-100"
                  title="Remove all tile catalogue data (Admin & Accounts only)"
                >
                  <Trash2 size={12} className="text-rose-600" />
                  <span>Remove All Data</span>
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Main Grid: Brands Sidebar & Coverage Table */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 lg:gap-6">
        {/* Brands List */}
        <div className="col-span-1 bg-white rounded-lg border border-[#E0E1DD] shadow-sm p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold text-[#415A77] uppercase tracking-wider">
              Ceramic Brands
            </h2>
            <span className="text-[10px] font-semibold text-[#778DA9]">
              {brands.length} Total
            </span>
          </div>

          <div className="space-y-1 max-h-[600px] overflow-y-auto pr-0.5">
            {brands.length === 0 ? (
              <div className="text-center py-6 text-xs text-[#778DA9]">
                No brands recorded yet.
              </div>
            ) : (
              brands.map((b) => {
                const isSelected = selectedBrandId === b.id;
                const sizeCount = coverages.filter((c) => c.brand_id === b.id).length;

                return (
                  <div
                    key={b.id}
                    onClick={() => setSelectedBrandId(b.id)}
                    className={`w-full text-left px-3 py-2 rounded text-xs transition-all flex items-center justify-between cursor-pointer group ${
                      isSelected
                        ? 'bg-[#1B263B] text-white font-bold border-l-4 border-[#778DA9] shadow-sm'
                        : 'hover:bg-[#E0E1DD]/40 text-[#0D1B2A] font-medium'
                    }`}
                  >
                    <div className="flex flex-col min-w-0 pr-1 flex-1">
                      <span className="truncate">{b.name}</span>
                      <span
                        className={`text-[10px] ${
                          isSelected ? 'text-[#778DA9]' : 'text-slate-400'
                        }`}
                      >
                        {sizeCount} {sizeCount === 1 ? 'size' : 'sizes'}
                      </span>
                    </div>

                    {isAdminOrManager && (
                      <div className="flex items-center space-x-1 shrink-0 ml-1">
                        <button
                          type="button"
                          onClick={(e) => handleOpenEditBrand(b, e)}
                          title={`Edit brand: ${b.name}`}
                          className={`p-1 rounded transition-colors ${
                            isSelected
                              ? 'text-[#E0E1DD] hover:text-white hover:bg-white/20'
                              : 'text-[#415A77] hover:text-[#0D1B2A] hover:bg-[#E0E1DD]'
                          }`}
                        >
                          <Edit2 size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleDeleteBrand(b, e)}
                          title={`Delete brand: ${b.name}`}
                          className={`p-1 rounded transition-colors ${
                            isSelected
                              ? 'text-rose-300 hover:text-rose-100 hover:bg-rose-900/50'
                              : 'text-slate-400 hover:text-rose-600 hover:bg-rose-50'
                          }`}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Coverage Formulas Table */}
        <div className="col-span-1 lg:col-span-3 bg-white rounded-lg border border-[#E0E1DD] shadow-sm overflow-hidden">
          <div className="bg-[#F8F9FA] px-4 py-3 border-b border-[#E0E1DD] flex justify-between items-center">
            <span className="text-xs font-bold text-[#1B263B] uppercase tracking-wide">
              {currentBrand ? currentBrand.name : 'All Brands'} — Size & Sqft Coverages
            </span>
            <span className="text-[10px] text-[#415A77]">Auto-populates quotation line items</span>
          </div>

          {/* Mobile View: Fixed Zero-Horizontal-Scroll Cards */}
          <div className="quotation-mobile-cards p-3 space-y-2.5">
            {filteredCoverages.length === 0 ? (
              <div className="py-8 text-center text-xs text-[#778DA9]">
                No size formulas recorded for this brand. Click "+ Add Size Formula" above.
              </div>
            ) : (
              filteredCoverages.map((c) => {
                const pType = c.product_type || 'box';
                const badgeStyles: Record<string, { label: string; cls: string }> = {
                  box: { label: 'Boxes (Box)', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
                  pieces: { label: 'Pieces (Pcs)', cls: 'bg-purple-50 text-purple-700 border-purple-200' },
                  sqft: { label: 'Square Feet (Sq.Ft)', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
                  bags: { label: 'Bags (Bag)', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
                  nos: { label: 'Numbers (Nos)', cls: 'bg-slate-100 text-slate-700 border-slate-200' },
                };
                const badge = badgeStyles[pType] || badgeStyles['box'];

                return (
                  <div
                    key={c.id}
                    className="bg-white rounded-xl border border-slate-200 p-3 shadow-2xs space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="font-mono font-bold text-xs text-[#0D1B2A]">{c.size}</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${badge.cls}`}>
                          {badge.label}
                        </span>
                      </div>
                      {isAdminOrManager && (
                        <div className="flex items-center space-x-1">
                          <button
                            type="button"
                            onClick={(e) => handleOpenEditCoverage(c, e)}
                            title="Edit size specification"
                            className="p-1.5 rounded-lg text-[#415A77] hover:text-[#0D1B2A] hover:bg-[#E0E1DD] transition-colors"
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleDeleteCoverage(c, e)}
                            title="Delete size specification"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="text-xs text-slate-600 flex items-center justify-between">
                      <span className="text-[11px] text-slate-400 font-medium">Packaging:</span>
                      <span className="font-medium text-slate-700">
                        {pType === 'box'
                          ? `${Number(c.coverage_sqft).toFixed(2)} sqft/box (${c.pieces_per_box} pcs)`
                          : pType === 'sqft'
                          ? '1.00 Sq.Ft Unit'
                          : pType === 'bags'
                          ? '1 Bag Packaging'
                          : pType === 'pieces'
                          ? '1 Piece Unit'
                          : '1 Unit (Nos)'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between pt-1.5 border-t border-slate-100 text-xs">
                      <span className="text-[11px] text-slate-400 font-medium">Default Rate:</span>
                      <span className="font-bold text-[#0D1B2A]">
                        {pType === 'box' ? (
                          <span>
                            ₹ {Number(c.default_rate_sqft).toFixed(2)}/sqft{' '}
                            <span className="text-[11px] font-semibold text-[#415A77]">
                              (₹ {Number(c.default_rate_box).toFixed(2)}/box)
                            </span>
                          </span>
                        ) : pType === 'sqft' ? (
                          <span>₹ {Number(c.default_rate_sqft).toFixed(2)}/sqft</span>
                        ) : (
                          <span>
                            ₹ {Number(c.default_rate_box || c.default_rate_sqft).toFixed(2)}/{pType === 'bags' ? 'bag' : pType === 'pieces' ? 'pc' : 'no'}
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Desktop View: Full Spreadsheet Table */}
          <div className="quotation-desktop-table overflow-x-auto scrollbar-thin">
            <table className="w-full min-w-[700px] text-left text-xs">
              <thead>
                <tr className="border-b border-[#E0E1DD] text-[#415A77] bg-[#F8F9FA]/60 font-semibold text-[11px]">
                  <th className="py-2.5 px-3">Size / Specification</th>
                  <th className="py-2.5 px-3">Product Type</th>
                  <th className="py-2.5 px-3 text-right">Coverage / Packaging</th>
                  <th className="py-2.5 px-3 text-right">Default Rate</th>
                  {isAdminOrManager && <th className="py-2.5 px-3 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E0E1DD]/60">
                {filteredCoverages.length === 0 ? (
                  <tr>
                    <td colSpan={isAdminOrManager ? 5 : 4} className="py-10 text-center text-[#778DA9]">
                      No size formulas recorded for this brand. Click "+ Add Size Formula" above.
                    </td>
                  </tr>
                ) : (
                  filteredCoverages.map((c) => {
                    const pType = c.product_type || 'box';
                    const badgeStyles: Record<string, { label: string; cls: string }> = {
                      box: { label: 'Boxes (Box)', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
                      pieces: { label: 'Pieces (Pcs)', cls: 'bg-purple-50 text-purple-700 border-purple-200' },
                      sqft: { label: 'Square Feet (Sq.Ft)', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
                      bags: { label: 'Bags (Bag)', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
                      nos: { label: 'Numbers (Nos)', cls: 'bg-slate-100 text-slate-700 border-slate-200' },
                    };
                    const badge = badgeStyles[pType] || badgeStyles['box'];

                    return (
                      <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-2.5 px-3 font-bold text-[#0D1B2A] align-middle">{c.size}</td>
                        <td className="py-2.5 px-3 align-middle">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${badge.cls}`}>
                            {badge.label}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-700 font-medium align-middle tabular-nums">
                          {pType === 'box'
                            ? `${Number(c.coverage_sqft).toFixed(2)} sqft/box (${c.pieces_per_box} pcs)`
                            : pType === 'sqft'
                            ? '1.00 Sq.Ft Unit'
                            : pType === 'bags'
                            ? '1 Bag Packaging'
                            : pType === 'pieces'
                            ? '1 Piece Unit'
                            : '1 Unit (Nos)'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-[#0D1B2A] align-middle tabular-nums">
                          {pType === 'box' ? (
                            <span>
                              ₹ {Number(c.default_rate_sqft).toFixed(2)}{' '}
                              <span className="text-[10px] text-[#778DA9] font-normal">/ sqft</span>{' '}
                              <span className="text-[11px] font-semibold text-[#415A77]">
                                (₹ {Number(c.default_rate_box).toFixed(2)} / box)
                              </span>
                            </span>
                          ) : pType === 'sqft' ? (
                            <span>
                              ₹ {Number(c.default_rate_sqft).toFixed(2)}{' '}
                              <span className="text-[10px] text-[#778DA9] font-normal">/ sqft</span>
                            </span>
                          ) : (
                            <span>
                              ₹ {Number(c.default_rate_box || c.default_rate_sqft).toFixed(2)}{' '}
                              <span className="text-[10px] text-[#778DA9] font-normal">
                                / {pType === 'bags' ? 'bag' : pType === 'pieces' ? 'pc' : 'no'}
                              </span>
                            </span>
                          )}
                        </td>
                        {isAdminOrManager && (
                          <td className="py-2.5 px-3 text-right align-middle whitespace-nowrap">
                            <div className="inline-flex items-center space-x-1">
                              <button
                                type="button"
                                onClick={(e) => handleOpenEditCoverage(c, e)}
                                title="Edit size specification"
                                className="p-1 rounded text-[#415A77] hover:text-[#0D1B2A] hover:bg-[#E0E1DD] transition-colors"
                              >
                                <Edit2 size={13} />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => handleDeleteCoverage(c, e)}
                                title="Delete size specification"
                                className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Brand Modal (Create & Edit) */}
      {brandModal && (
        <div className="modal-overlay">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 border border-[#CBD5E1] animate-in fade-in duration-150">
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-base font-bold text-[#0D1B2A]">
                {editingBrand ? `Edit Brand: ${editingBrand.name}` : 'Add Ceramic Brand'}
              </h2>
              <button
                onClick={() => {
                  setBrandModal(false);
                  setEditingBrand(null);
                }}
                className="text-[#778DA9] hover:text-[#0D1B2A]"
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSaveBrand} className="space-y-3 text-xs">
              <div>
                <label className="block text-[#0D1B2A] font-semibold mb-1">Brand Name *</label>
                <input
                  type="text"
                  className="input input-sm"
                  value={brandName}
                  onChange={(e) => setBrandName(e.target.value)}
                  placeholder="e.g. Somany Ceramics, Cera, Simpolo"
                  required
                />
              </div>
              <div>
                <label className="block text-[#0D1B2A] font-semibold mb-1">Description</label>
                <input
                  type="text"
                  className="input input-sm"
                  value={brandDesc}
                  onChange={(e) => setBrandDesc(e.target.value)}
                  placeholder="e.g. Glazed vitrified tiles, sanitaryware and heavy duty slabs"
                />
              </div>
              <div className="flex justify-end space-x-2 pt-2 border-t border-[#E0E1DD]">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    setBrandModal(false);
                    setEditingBrand(null);
                  }}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary btn-sm">
                  {editingBrand ? 'Update Brand' : 'Save Brand'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Coverage Formula Modal (Create & Edit) */}
      {coverageModal && (
        <div className="modal-overlay">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 border border-[#CBD5E1] animate-in fade-in duration-150">
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-base font-bold text-[#0D1B2A]">
                {editingCoverage
                  ? `Edit Specification: ${editingCoverage.size}`
                  : 'Add Size Formula'}
              </h2>
              <button
                onClick={() => {
                  setCoverageModal(false);
                  setEditingCoverage(null);
                }}
                className="text-[#778DA9] hover:text-[#0D1B2A]"
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSaveCoverage} className="space-y-3 text-xs">
              <div>
                <label className="block text-[#0D1B2A] font-semibold mb-1">Brand *</label>
                <select
                  className="input input-sm"
                  value={covBrandId}
                  onChange={(e) => setCovBrandId(parseInt(e.target.value, 10))}
                  required
                >
                  {brands.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Product Type / Packaging Unit */}
              <div>
                <label className="block text-[#0D1B2A] font-semibold mb-1">
                  Product Type / Packaging Unit *
                </label>
                <select
                  className="input input-sm font-semibold text-[#1B263B]"
                  value={productType}
                  onChange={(e) => setProductType(e.target.value as ProductType)}
                >
                  <option value="box">Boxes (Box) — Default Tile Packaging</option>
                  <option value="pieces">Pieces (Pcs) — Single Tiles / Slabs</option>
                  <option value="sqft">Square Feet (Sq.Ft) — Direct Area Sizing</option>
                  <option value="bags">Bags (Bag) — Adhesives / Grouts / Mortar</option>
                  <option value="nos">Numbers (Nos) — Accessories / Trims / Spacers</option>
                </select>
              </div>

              <div>
                <label className="block text-[#0D1B2A] font-semibold mb-1">Dimensions / Spec Name *</label>
                <input
                  type="text"
                  className="input input-sm"
                  value={size}
                  onChange={(e) => setSize(e.target.value)}
                  placeholder={
                    productType === 'box'
                      ? 'e.g. 1200X1800, 600X1200'
                      : productType === 'sqft'
                      ? 'e.g. Custom Cut Sqft, Polished Slab'
                      : productType === 'bags'
                      ? 'e.g. 20kg Bag, 5kg Epoxy Grout'
                      : productType === 'pieces'
                      ? 'e.g. 800X1600 Step Tile, Bullnose'
                      : 'e.g. Tile Spacers 2mm, Leveling Clips'
                  }
                  required
                />
              </div>

              {productType === 'box' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[#0D1B2A] font-semibold mb-1">Sqft per Box *</label>
                    <input
                      type="number"
                      step="0.01"
                      className="input input-sm"
                      value={coverageSqft}
                      onChange={(e) => setCoverageSqft(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[#0D1B2A] font-semibold mb-1">Pieces per Box</label>
                    <input
                      type="number"
                      className="input input-sm"
                      value={piecesPerBox}
                      onChange={(e) => setPiecesPerBox(e.target.value)}
                      required
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-[#0D1B2A] font-semibold mb-1">
                  {productType === 'box'
                    ? 'Default Rate per Sqft (INR) *'
                    : productType === 'sqft'
                    ? 'Default Rate per Sqft (INR) *'
                    : productType === 'bags'
                    ? 'Default Rate per Bag (INR) *'
                    : productType === 'pieces'
                    ? 'Default Rate per Piece (INR) *'
                    : 'Default Rate per No (INR) *'}
                </label>
                <input
                  type="number"
                  step="0.01"
                  className="input input-sm"
                  value={rateSqft}
                  onChange={(e) => setRateSqft(e.target.value)}
                  required
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-[#E0E1DD]">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    setCoverageModal(false);
                    setEditingCoverage(null);
                  }}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary btn-sm">
                  {editingCoverage ? 'Update Specification' : 'Save Specification'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
