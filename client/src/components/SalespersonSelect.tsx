import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useServer } from '../context/ServerContext';
import { User, SalesCategory } from '../types';
import { UserCheck, Search, ChevronDown, Check, Lock, Shield, User as UserIcon, AlertCircle } from 'lucide-react';

interface SalespersonSelectProps {
  value: number | null;
  onChange: (salesPerson: User) => void;
  disabled?: boolean;
  required?: boolean;
  error?: string | null;
  className?: string;
  label?: string;
}

const CATEGORY_COLORS: Record<SalesCategory, string> = {
  RETAIL: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  PROJECT: 'bg-blue-50 text-blue-700 border-blue-200',
  MANAGEMENT: 'bg-purple-50 text-purple-700 border-purple-200',
  COMPANY: 'bg-amber-50 text-amber-700 border-amber-200',
};

export const SalespersonSelect: React.FC<SalespersonSelectProps> = ({
  value,
  onChange,
  disabled = false,
  required = true,
  error = null,
  className = '',
  label = 'Assigned Sales Executive',
}) => {
  const { user: currentUser } = useAuth();
  const { fetchApi } = useServer();

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const isSalesperson = currentUser?.role?.toLowerCase() === 'salesperson';
  const isAccountsOrAdmin = ['admin', 'accounts', 'manager'].includes((currentUser?.role || '').toLowerCase());

  // Load active sales team members
  useEffect(() => {
    let mounted = true;
    setLoading(true);
    fetchApi('/api/users')
      .then((res) => {
        if (!mounted) return;
        const all: User[] = res.users || [];
        // Include active users who are salespersons or have sales categories
        const salesStaff = all.filter(
          (u) =>
            u.is_active &&
            (u.role === 'salesperson' ||
              ['RETAIL', 'PROJECT', 'MANAGEMENT', 'COMPANY'].includes(String(u.sales_category || '').toUpperCase()))
        );
        setUsers(salesStaff);

        // If current user is a salesperson and value is not yet set, automatically assign them
        if (isSalesperson && currentUser && (!value || value <= 0)) {
          const match = salesStaff.find((u) => u.id === currentUser.id) || currentUser;
          onChange(match);
        }
      })
      .catch((err) => {
        console.warn('Failed to load sales staff:', err);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [fetchApi, currentUser?.id]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const selectedUser = useMemo(() => {
    if (!value) return null;
    return users.find((u) => u.id === value) || null;
  }, [value, users]);

  const filteredUsers = useMemo(() => {
    const term = search.toLowerCase().trim();
    if (!term) return users;
    return users.filter(
      (u) =>
        u.full_name?.toLowerCase().includes(term) ||
        u.username?.toLowerCase().includes(term) ||
        u.sales_category?.toLowerCase().includes(term) ||
        u.role?.toLowerCase().includes(term)
    );
  }, [users, search]);

  const handleSelect = (u: User) => {
    onChange(u);
    setIsOpen(false);
    setSearch('');
  };

  // If the logged-in user is a standard salesperson, lock the field to their own identity
  if (isSalesperson) {
    const currentName = selectedUser?.full_name || currentUser?.full_name || 'Current Salesperson';
    const category = (selectedUser?.sales_category || currentUser?.sales_category || 'RETAIL') as SalesCategory;

    return (
      <div className={`space-y-1 ${className}`}>
        <label className="flex items-center justify-between text-[11px] font-bold text-slate-700 uppercase tracking-wider">
          <span className="flex items-center space-x-1">
            <UserCheck size={13} className="text-indigo-600" />
            <span>{label}</span>
          </span>
          <span className="text-[10px] text-slate-400 font-normal flex items-center space-x-1">
            <Lock size={10} />
            <span>Fixed to your profile</span>
          </span>
        </label>
        <div className="flex items-center justify-between px-3 py-2 bg-slate-100/80 border border-slate-200 rounded-xl text-xs text-slate-800">
          <div className="flex items-center space-x-2">
            <div className="w-6 h-6 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-[10px]">
              {currentName.charAt(0).toUpperCase()}
            </div>
            <div>
              <span className="font-bold text-slate-900">{currentName}</span>
              <span className="text-slate-400 text-[10px] ml-1.5 font-mono">(@{currentUser?.username})</span>
            </div>
          </div>
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold border uppercase tracking-wider ${
              CATEGORY_COLORS[category] || 'bg-slate-100 text-slate-700 border-slate-200'
            }`}
          >
            {category}
          </span>
        </div>
      </div>
    );
  }

  // If logged in as Accounts, Admin, or Store Manager: render interactive searchable selector
  return (
    <div className={`relative space-y-1 ${className}`} ref={dropdownRef}>
      <label className="flex items-center justify-between text-[11px] font-bold text-slate-700 uppercase tracking-wider">
        <span className="flex items-center space-x-1">
          <UserCheck size={13} className="text-indigo-600" />
          <span>{label}</span>
          {required && <span className="text-rose-500">*</span>}
        </span>
        <span className="text-[10px] text-indigo-600 font-bold bg-indigo-50 border border-indigo-200 px-1.5 py-0.2 rounded">
          Billing Attribution
        </span>
      </label>

      {/* Selected Value Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs border transition-all text-left cursor-pointer ${
          error
            ? 'border-rose-400 bg-rose-50/40 text-rose-900 ring-2 ring-rose-200'
            : isOpen
            ? 'border-indigo-500 bg-white ring-2 ring-indigo-500/20 text-slate-900 shadow-sm'
            : 'border-slate-300 bg-white hover:border-slate-400 text-slate-800 shadow-2xs'
        } ${disabled ? 'opacity-60 cursor-not-allowed bg-slate-100' : ''}`}
      >
        {selectedUser ? (
          <div className="flex items-center space-x-2 truncate">
            <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-indigo-600 to-teal-500 text-white flex items-center justify-center font-black text-[10px] shrink-0">
              {selectedUser.full_name?.charAt(0).toUpperCase() || 'S'}
            </div>
            <div className="truncate">
              <span className="font-bold text-slate-900">{selectedUser.full_name}</span>
              <span className="text-slate-400 text-[10px] ml-1.5 font-mono">(@{selectedUser.username})</span>
            </div>
          </div>
        ) : (
          <span className="text-slate-400 font-medium italic">
            -- Click to Select Salesperson (Required) --
          </span>
        )}

        <div className="flex items-center space-x-1.5 shrink-0 ml-2">
          {selectedUser?.sales_category && (
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-extrabold border uppercase tracking-wider ${
                CATEGORY_COLORS[selectedUser.sales_category as SalesCategory] || 'bg-slate-100 text-slate-700 border-slate-200'
              }`}
            >
              {selectedUser.sales_category}
            </span>
          )}
          <ChevronDown
            size={14}
            className={`text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180 text-indigo-600' : ''}`}
          />
        </div>
      </button>

      {/* Validation Error Message */}
      {error && (
        <div className="flex items-center space-x-1 text-rose-600 text-[11px] font-semibold mt-1">
          <AlertCircle size={12} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Searchable Dropdown Popup */}
      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-white rounded-2xl border border-slate-200/90 shadow-2xl overflow-hidden animate-fadeIn">
          {/* Search Header */}
          <div className="p-2.5 border-b border-slate-100 bg-slate-50/70">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                ref={searchInputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search sales executive by name, @username, category..."
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-indigo-500/30 text-slate-900"
              />
            </div>
          </div>

          {/* Users Option List */}
          <div className="max-h-56 overflow-y-auto scrollbar-thin divide-y divide-slate-100 p-1">
            {loading ? (
              <div className="p-4 text-center text-xs text-slate-400">Loading sales representatives...</div>
            ) : filteredUsers.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-400">
                No active sales staff matching "{search}"
              </div>
            ) : (
              filteredUsers.map((u) => {
                const isSelected = selectedUser?.id === u.id;
                const cat = (u.sales_category || 'RETAIL') as SalesCategory;

                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => handleSelect(u)}
                    className={`w-full flex items-center justify-between p-2 rounded-xl text-left cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-indigo-50 text-indigo-950 font-bold'
                        : 'hover:bg-slate-50 text-slate-800'
                    }`}
                  >
                    <div className="flex items-center space-x-2.5">
                      <div
                        className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                          isSelected
                            ? 'bg-indigo-600 text-white'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {u.full_name?.charAt(0).toUpperCase() || 'S'}
                      </div>
                      <div>
                        <div className="flex items-center space-x-1.5">
                          <span className="text-xs font-bold text-slate-900">{u.full_name}</span>
                          <span className="text-[10px] text-slate-400 font-mono">(@{u.username})</span>
                        </div>
                        <div className="text-[10px] text-slate-500 font-medium">
                          Role: {u.role}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2 shrink-0">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold border uppercase tracking-wider ${
                          CATEGORY_COLORS[cat] || 'bg-slate-100 text-slate-700 border-slate-200'
                        }`}
                      >
                        {cat}
                      </span>
                      {isSelected && <Check size={14} className="text-indigo-600 stroke-[3]" />}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
