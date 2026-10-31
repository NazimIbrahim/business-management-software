import React, { useState, useEffect, useRef } from 'react';
import { useServer } from '../context/ServerContext';
import { CompanySettings } from '../types';
import {
  Building,
  Landmark,
  FileText,
  Save,
  CheckCircle2,
  AlertCircle,
  Image as ImageIcon,
  Upload,
  Trash2,
  Plus,
  RotateCcw,
  UserCheck,
} from 'lucide-react';

const DEFAULT_TERMS = [
  'Prices are inclusive of GST unless otherwise specified.',
  'Payment: 100% advance along with confirmed purchase order.',
  'Delivery: Materials will be dispatched after receipt of full payment.',
  'Transportation/Freight charges extra at actuals unless explicitly agreed in writing.',
  'Unloading of materials at destination site is under customer scope and responsibility.',
  'Goods once sold cannot be returned or exchanged under any circumstances.',
  'Color shade and sizing variations are inherent in ceramic and vitrified products.',
  'Any delay in delivery due to unavailability of materials in factory will hold the seller harmless.',
  'The buyer must inspect the materials upon delivery. Any discrepancies or damages must be reported within 24 hours.',
  'Once materials are inspected and accepted no claims will be entertained.',
  'Orders once placed cannot be cancelled.',
  'Return or replacements are only applicable for defective or damaged products subject to approvals after inspection.',
  'Non-defective materials are non-returnable.'
];

const FALLBACK_SETTINGS: CompanySettings = {
  id: 1,
  company_name: 'AMA CERAMICS PVT LTD',
  tagline: 'Architectural Surfaces, Vitrified Tiles & Luxury Sanitaries',
  logo_base64: '',
  address_line1: '125/1, Sulikunte Village, Sarjapura Main Road',
  address_line2: 'Varthur Hobli, Bengaluru, 562125',
  phone: '+91 96637 73871 / +91 98250 12345',
  email: 'sales@amaceramics.in',
  website: 'www.amaceramics.in',
  gstin: '24AAACA5678Q1Z4',
  state: 'Karnataka',
  state_code: '29',
  bank_name: 'ICICI Bank',
  account_name: 'AMA Ceramics Private Limited',
  account_number: '743205000413',
  ifsc_code: 'ICIC0007432',
  branch: 'Dommasandra',
  account_type: 'Current Account',
  upi_details: 'GPay / PhonePe / Paytm / UPI: amaceramics@icici\nCheques in favor of: AMA CERAMICS PRIVATE LIMITED',
  store_manager_title: 'Store Manager',
  store_manager_name: 'Rajesh Sharma',
  store_manager_phone: '+91 98250 12345',
  sales_associate_title: 'Showroom Sales Associate',
  terms_json: DEFAULT_TERMS,
};

export const CompanySettingsPage: React.FC = () => {
  const { fetchApi, reloadCompany } = useServer();
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadSettings = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetchApi('/api/company');
      if (res && res.company) {
        setSettings({
          ...FALLBACK_SETTINGS,
          ...res.company,
          terms_json: Array.isArray(res.company.terms_json)
            ? res.company.terms_json
            : (typeof res.company.terms_json === 'string'
                ? JSON.parse(res.company.terms_json || '[]')
                : DEFAULT_TERMS),
        });
      } else {
        setSettings(FALLBACK_SETTINGS);
      }
    } catch (err: any) {
      console.warn('Could not load company settings from server, using default profile:', err.message);
      setSettings((prev) => prev || FALLBACK_SETTINGS);
      // Only set error if not a standard not found
      if (!err.message?.includes('not found')) {
        setError(`Notice: Using local defaults (${err.message}). Click 'Save Profile Changes' below to write your profile.`);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const handleLogoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please select a valid image file (PNG, JPG, SVG, WebP).');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('Selected image is over 5MB. Please choose an image under 5MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (!dataUrl) return;

      // Optimize image dimensions for crisp rendering in header & PDF
      const img = new Image();
      img.onload = () => {
        const maxDim = 800;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            const optimized = canvas.toDataURL(file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.92);
            setSettings((prev) => (prev ? { ...prev, logo_base64: optimized } : prev));
            return;
          }
        }
        setSettings((prev) => (prev ? { ...prev, logo_base64: dataUrl } : prev));
      };
      img.onerror = () => {
        setSettings((prev) => (prev ? { ...prev, logo_base64: dataUrl } : prev));
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleRemoveLogo = () => {
    if (!settings) return;
    setSettings({ ...settings, logo_base64: '' });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    setSaving(true);
    setError(null);
    setSavedSuccess(false);
    try {
      const res = await fetchApi('/api/company', {
        method: 'PUT',
        body: JSON.stringify(settings),
      });
      if (res && res.company) {
        setSettings({
          ...settings,
          ...res.company,
          terms_json: Array.isArray(res.company.terms_json)
            ? res.company.terms_json
            : (typeof res.company.terms_json === 'string'
                ? JSON.parse(res.company.terms_json || '[]')
                : settings.terms_json),
        });
      }
      await reloadCompany();
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 4000);
    } catch (err: any) {
      setError(err.message || 'Failed to update company settings');
    } finally {
      setSaving(false);
    }
  };

  const handleTermChange = (index: number, val: string) => {
    if (!settings) return;
    const newTerms = [...(Array.isArray(settings.terms_json) ? settings.terms_json : [])];
    newTerms[index] = val;
    setSettings({ ...settings, terms_json: newTerms });
  };

  const handleAddTerm = () => {
    if (!settings) return;
    const newTerms = [...(Array.isArray(settings.terms_json) ? settings.terms_json : []), ''];
    setSettings({ ...settings, terms_json: newTerms });
  };

  const handleRemoveTerm = (index: number) => {
    if (!settings) return;
    const newTerms = (Array.isArray(settings.terms_json) ? settings.terms_json : []).filter((_, i) => i !== index);
    setSettings({ ...settings, terms_json: newTerms });
  };

  const handleResetTerms = () => {
    if (!settings) return;
    if (window.confirm('Reset all quotation terms to the standard official default clauses?')) {
      setSettings({ ...settings, terms_json: DEFAULT_TERMS });
    }
  };

  if (loading && !settings) {
    return (
      <div className="flex-1 p-8 flex flex-col items-center justify-center space-y-3">
        <div className="w-8 h-8 border-3 border-[#1B263B] border-t-transparent rounded-full animate-spin"></div>
        <p className="text-xs text-gray-500 font-medium">Loading company profile...</p>
      </div>
    );
  }

  const currentSettings = settings || FALLBACK_SETTINGS;
  const termsList = Array.isArray(currentSettings.terms_json) ? currentSettings.terms_json : DEFAULT_TERMS;

  return (
    <div className="flex-1 p-4 sm:p-5 lg:p-6 space-y-4 lg:space-y-6 overflow-y-auto w-full min-w-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Company Profile & Quotation Branding</h1>
          <p className="text-xs text-gray-500">
            Company logo, details, GSTIN, bank accounts, and terms applied to PDF quotations & throughout the application.
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className={`btn btn-primary btn-sm flex items-center space-x-1.5 self-start sm:self-auto ${saving ? 'btn-saving' : ''}`}
        >
          <Save size={14} className={saving ? 'animate-spin' : ''} />
          <span>{saving ? 'Saving...' : 'Save Profile Changes'}</span>
        </button>
      </div>

      {savedSuccess && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-md text-xs flex items-center space-x-2 animate-save-success shadow-xs">
          <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
          <span>Company profile, uploaded logo, and quotation terms updated successfully! Changes applied everywhere.</span>
        </div>
      )}

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-md text-xs flex items-center justify-between space-x-2">
          <div className="flex items-center space-x-2 min-w-0">
            <AlertCircle size={16} className="text-rose-600 shrink-0" />
            <span className="truncate">{error}</span>
          </div>
          <button
            type="button"
            onClick={loadSettings}
            className="text-xs font-semibold underline text-rose-700 hover:text-rose-900 shrink-0 cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6 text-xs">
        {/* Company Logo Section */}
        <div className="bg-white p-5 rounded-lg border border-gray-200 shadow-sm space-y-4">
          <div className="flex items-center space-x-2 border-b pb-2">
            <ImageIcon size={16} className="text-primary" />
            <h2 className="text-xs font-bold text-gray-800 uppercase tracking-wider">
              Company Logo & Visual Branding
            </h2>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
            {/* Logo Preview Frame */}
            <div className="w-32 h-32 rounded-lg border-2 border-dashed border-gray-300 bg-slate-50 flex items-center justify-center p-2 relative overflow-hidden shrink-0 group">
              {currentSettings.logo_base64 ? (
                <img
                  src={currentSettings.logo_base64}
                  alt="Company Logo Preview"
                  className="max-w-full max-h-full object-contain"
                />
              ) : (
                <div className="text-center p-2">
                  <ImageIcon size={28} className="mx-auto text-gray-400 mb-1" />
                  <span className="text-[10px] text-gray-400 font-medium block">No Logo Uploaded</span>
                </div>
              )}
            </div>

            {/* Action Buttons & Format Instructions */}
            <div className="space-y-2 flex-1">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml"
                onChange={handleLogoSelect}
                className="hidden"
              />
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="btn btn-secondary btn-sm flex items-center space-x-1.5"
                >
                  <Upload size={13} />
                  <span>{currentSettings.logo_base64 ? 'Change Logo Image' : 'Upload Company Logo'}</span>
                </button>
                {currentSettings.logo_base64 && (
                  <button
                    type="button"
                    onClick={handleRemoveLogo}
                    className="btn btn-outline btn-sm text-rose-600 hover:bg-rose-50 hover:border-rose-300 flex items-center space-x-1"
                  >
                    <Trash2 size={13} />
                    <span>Remove Logo</span>
                  </button>
                )}
              </div>
              <p className="text-[11px] text-gray-500 leading-relaxed">
                Recommended formats: <strong>PNG</strong> (transparent), <strong>JPEG</strong>, or <strong>SVG</strong>. Maximum file size: 5MB.
                This logo will immediately replace the default badge on the top header bar, login screen, mobile menu, and on all official exported Quotation PDFs.
              </p>
            </div>
          </div>
        </div>

        {/* Basic Showroom Info */}
        <div className="bg-white p-5 rounded-lg border border-gray-200 shadow-sm space-y-4">
          <div className="flex items-center space-x-2 border-b pb-2">
            <Building size={16} className="text-primary" />
            <h2 className="text-xs font-bold text-gray-800 uppercase tracking-wider">
              Showroom & Entity Information
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-gray-700 font-semibold mb-1">Company / Business Name *</label>
              <input
                type="text"
                className="input input-sm font-bold text-primary"
                value={currentSettings.company_name}
                onChange={(e) => setSettings({ ...currentSettings, company_name: e.target.value })}
                placeholder="e.g. Acme Surfaces & Ceramics"
                required
              />
            </div>
            <div>
              <label className="block text-gray-700 font-semibold mb-1">Tagline / Business Subtitle</label>
              <input
                type="text"
                className="input input-sm"
                value={currentSettings.tagline}
                onChange={(e) => setSettings({ ...currentSettings, tagline: e.target.value })}
                placeholder="e.g. Architectural Surfaces & Luxury Sanitaryware"
              />
            </div>
            <div>
              <label className="block text-gray-700 font-semibold mb-1">Address Line 1</label>
              <input
                type="text"
                className="input input-sm"
                value={currentSettings.address_line1}
                onChange={(e) => setSettings({ ...currentSettings, address_line1: e.target.value })}
                placeholder="e.g. Survey No. 48, Showroom Corridor"
              />
            </div>
            <div>
              <label className="block text-gray-700 font-semibold mb-1">Address Line 2 (City, State, Pincode)</label>
              <input
                type="text"
                className="input input-sm"
                value={currentSettings.address_line2}
                onChange={(e) => setSettings({ ...currentSettings, address_line2: e.target.value })}
                placeholder="e.g. Bengaluru, Karnataka 560068"
              />
            </div>
            <div>
              <label className="block text-gray-700 font-semibold mb-1">Phone / Customer Care</label>
              <input
                type="text"
                className="input input-sm"
                value={currentSettings.phone}
                onChange={(e) => setSettings({ ...currentSettings, phone: e.target.value })}
                placeholder="e.g. +91 98450 12345"
              />
            </div>
            <div>
              <label className="block text-gray-700 font-semibold mb-1">GSTIN *</label>
              <input
                type="text"
                className="input input-sm font-mono font-bold"
                value={currentSettings.gstin}
                onChange={(e) => setSettings({ ...currentSettings, gstin: e.target.value })}
                placeholder="e.g. 29AABCA1234F1Z5"
                required
              />
            </div>
            <div>
              <label className="block text-gray-700 font-semibold mb-1">Email</label>
              <input
                type="email"
                className="input input-sm"
                value={currentSettings.email}
                onChange={(e) => setSettings({ ...currentSettings, email: e.target.value })}
                placeholder="e.g. info@acmesurfaces.com"
              />
            </div>
            <div>
              <label className="block text-gray-700 font-semibold mb-1">Website</label>
              <input
                type="text"
                className="input input-sm"
                value={currentSettings.website}
                onChange={(e) => setSettings({ ...currentSettings, website: e.target.value })}
                placeholder="e.g. www.acmesurfaces.com"
              />
            </div>
            <div>
              <label className="block text-gray-700 font-semibold mb-1">State</label>
              <input
                type="text"
                className="input input-sm"
                value={currentSettings.state}
                onChange={(e) => setSettings({ ...currentSettings, state: e.target.value })}
                placeholder="e.g. Karnataka"
              />
            </div>
            <div>
              <label className="block text-gray-700 font-semibold mb-1">State Code (2-digit GST)</label>
              <input
                type="text"
                className="input input-sm font-mono"
                value={currentSettings.state_code}
                onChange={(e) => setSettings({ ...currentSettings, state_code: e.target.value })}
                placeholder="e.g. 29"
              />
            </div>
          </div>
        </div>

        {/* Signatories & Showroom Contacts */}
        <div className="bg-white p-5 rounded-lg border border-gray-200 shadow-sm space-y-4">
          <div className="flex items-center space-x-2 border-b pb-2">
            <UserCheck size={16} className="text-primary" />
            <h2 className="text-xs font-bold text-gray-800 uppercase tracking-wider">
              Quotation Signatories & Showroom Contacts
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-gray-700 font-semibold mb-1">Store Manager Title</label>
              <input
                type="text"
                className="input input-sm"
                value={currentSettings.store_manager_title}
                onChange={(e) => setSettings({ ...currentSettings, store_manager_title: e.target.value })}
                placeholder="Store Manager"
              />
            </div>
            <div>
              <label className="block text-gray-700 font-semibold mb-1">Store Manager Name</label>
              <input
                type="text"
                className="input input-sm font-semibold"
                value={currentSettings.store_manager_name}
                onChange={(e) => setSettings({ ...currentSettings, store_manager_name: e.target.value })}
                placeholder="e.g. Deepak Patel"
              />
            </div>
            <div>
              <label className="block text-gray-700 font-semibold mb-1">Store Manager Contact Phone</label>
              <input
                type="text"
                className="input input-sm"
                value={currentSettings.store_manager_phone}
                onChange={(e) => setSettings({ ...currentSettings, store_manager_phone: e.target.value })}
                placeholder="+91 98250 12345"
              />
            </div>
            <div>
              <label className="block text-gray-700 font-semibold mb-1">Sales Associate Signatory Title</label>
              <input
                type="text"
                className="input input-sm"
                value={currentSettings.sales_associate_title}
                onChange={(e) => setSettings({ ...currentSettings, sales_associate_title: e.target.value })}
                placeholder="Showroom Sales Associate"
              />
            </div>
          </div>
        </div>

        {/* Bank & Settlement Details */}
        <div className="bg-white p-5 rounded-lg border border-gray-200 shadow-sm space-y-4">
          <div className="flex items-center space-x-2 border-b pb-2">
            <Landmark size={16} className="text-primary" />
            <h2 className="text-xs font-bold text-gray-800 uppercase tracking-wider">
              Settlement Bank & UPI Accounts (PDF Bank Box)
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-gray-700 font-semibold mb-1">Beneficiary Account Name</label>
              <input
                type="text"
                className="input input-sm"
                value={currentSettings.account_name}
                onChange={(e) => setSettings({ ...currentSettings, account_name: e.target.value })}
                placeholder="e.g. Acme Surfaces Private Limited"
              />
            </div>
            <div>
              <label className="block text-gray-700 font-semibold mb-1">Bank Name</label>
              <input
                type="text"
                className="input input-sm"
                value={currentSettings.bank_name}
                onChange={(e) => setSettings({ ...currentSettings, bank_name: e.target.value })}
                placeholder="e.g. ICICI Bank"
              />
            </div>
            <div>
              <label className="block text-gray-700 font-semibold mb-1">Account Number</label>
              <input
                type="text"
                className="input input-sm font-mono"
                value={currentSettings.account_number}
                onChange={(e) => setSettings({ ...currentSettings, account_number: e.target.value })}
                placeholder="e.g. 743205000413"
              />
            </div>
            <div>
              <label className="block text-gray-700 font-semibold mb-1">IFSC Code</label>
              <input
                type="text"
                className="input input-sm font-mono uppercase"
                value={currentSettings.ifsc_code}
                onChange={(e) => setSettings({ ...currentSettings, ifsc_code: e.target.value })}
                placeholder="e.g. ICIC0007432"
              />
            </div>
            <div>
              <label className="block text-gray-700 font-semibold mb-1">Branch Name</label>
              <input
                type="text"
                className="input input-sm"
                value={currentSettings.branch}
                onChange={(e) => setSettings({ ...currentSettings, branch: e.target.value })}
                placeholder="e.g. Main Branch"
              />
            </div>
            <div>
              <label className="block text-gray-700 font-semibold mb-1">Account Type</label>
              <input
                type="text"
                className="input input-sm"
                value={currentSettings.account_type}
                onChange={(e) => setSettings({ ...currentSettings, account_type: e.target.value })}
                placeholder="e.g. Current Account"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-gray-700 font-semibold mb-1">UPI ID & Payment Notes (Appears on Quotation)</label>
              <textarea
                rows={2}
                className="input input-sm w-full font-mono text-[11px]"
                value={currentSettings.upi_details}
                onChange={(e) => setSettings({ ...currentSettings, upi_details: e.target.value })}
                placeholder="e.g. GPay / PhonePe / Paytm / UPI: company@upi&#10;Cheques in favor of: YOUR COMPANY PRIVATE LIMITED"
              />
            </div>
          </div>
        </div>

        {/* Quotation Terms and Conditions */}
        <div className="bg-white p-5 rounded-lg border border-gray-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b pb-2">
            <div className="flex items-center space-x-2">
              <FileText size={16} className="text-primary" />
              <h2 className="text-xs font-bold text-gray-800 uppercase tracking-wider">
                Official Quotation Terms & Conditions ({termsList.length} Clauses)
              </h2>
            </div>
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={handleResetTerms}
                className="btn btn-outline btn-xs flex items-center space-x-1 text-gray-600 hover:text-gray-900"
                title="Reset to 13 standard industry terms"
              >
                <RotateCcw size={11} />
                <span>Reset Defaults</span>
              </button>
              <button
                type="button"
                onClick={handleAddTerm}
                className="btn btn-secondary btn-xs flex items-center space-x-1"
              >
                <Plus size={11} />
                <span>Add Clause</span>
              </button>
            </div>
          </div>

          <div className="space-y-2">
            {termsList.map((term, idx) => (
              <div key={idx} className="flex items-center space-x-2">
                <span className="w-6 text-right font-bold text-gray-500 shrink-0">{idx + 1}.</span>
                <input
                  type="text"
                  className="input input-sm flex-1"
                  value={term}
                  onChange={(e) => handleTermChange(idx, e.target.value)}
                  placeholder={`Clause ${idx + 1}...`}
                />
                <button
                  type="button"
                  onClick={() => handleRemoveTerm(idx)}
                  className="p-1.5 text-gray-400 hover:text-rose-600 rounded transition-colors shrink-0"
                  title="Delete clause"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom Save Bar */}
        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={saving}
            className={`btn btn-primary px-6 py-2.5 flex items-center space-x-2 ${saving ? 'btn-saving' : ''}`}
          >
            <Save size={16} className={saving ? 'animate-spin' : ''} />
            <span className="font-semibold text-xs">{saving ? 'Saving Changes...' : 'Save Profile Changes'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
