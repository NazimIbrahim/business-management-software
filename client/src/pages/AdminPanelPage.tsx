import React, { useState, useEffect } from 'react';
import { useServer } from '../context/ServerContext';
import { useAuth } from '../context/AuthContext';
import { User, Role } from '../types';
import {
  ShieldCheck,
  UserCheck,
  KeyRound,
  Plus,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Edit2,
  Trash2,
  Lock,
  Layers,
  Settings,
  Sparkles,
  UserPlus,
  Sliders,
  DollarSign,
  FileText,
  Building,
  Check,
  X,
} from 'lucide-react';

const PERMISSION_DEFINITIONS = [
  {
    category: 'Quotations & Sales',
    permissions: [
      { key: 'quotations.create', label: 'Create Quotations', description: 'Can create new Tile and Sanitary quotations' },
      { key: 'quotations.edit', label: 'Edit Quotations', description: 'Can edit line items, quantities, and customer details' },
      { key: 'quotations.approve', label: 'Approve & Reject', description: 'Can change quotation status to Approved, Closed or Rejected' },
      { key: 'quotations.delete', label: 'Delete Quotations', description: 'Can permanently remove quotations from the system' },
      { key: 'quotations.export', label: 'Export Reports', description: 'Can download quotation registers in PDF, Excel, and CSV' },
    ],
  },
  {
    category: 'Catalogs & Products',
    permissions: [
      { key: 'catalog.view', label: 'Browse Catalogs', description: 'Can view tile sizes, rates, and sanitary catalog' },
      { key: 'catalog.manage', label: 'Manage Products', description: 'Can add, edit, or remove catalog items and update base rates' },
    ],
  },
  {
    category: 'Customers & CRM',
    permissions: [
      { key: 'customers.manage', label: 'Manage Customers', description: 'Can add, edit, or delete customer records and delivery addresses' },
    ],
  },
  {
    category: 'Collections & Payments',
    permissions: [
      { key: 'payments.view', label: 'View Receipts', description: 'Can view payments history and customer balance dues' },
      { key: 'payments.record', label: 'Record Payments', description: 'Can log new customer receipts, cheques, and NEFT payments' },
    ],
  },
  {
    category: 'Analytics & Targets',
    permissions: [
      { key: 'reports.view', label: 'View Performance Reports', description: 'Can view salesperson matrices, conversion stats, and registers' },
      { key: 'targets.manage', label: 'Manage Targets', description: 'Can set and update monthly sales targets' },
    ],
  },
  {
    category: 'Dispatch & Logistics',
    permissions: [
      { key: 'dispatch.view', label: 'View Dispatch Pipeline', description: 'Can view closed quotations and dispatch readiness pipeline' },
      { key: 'dispatch.manage', label: 'Manage Dispatch Status', description: 'Can update stock readiness, factory orders, expected dates & dispatches' },
    ],
  },
  {
    category: 'System & Administration',
    permissions: [
      { key: 'company.manage', label: 'Company Settings', description: 'Can update company profile, bank accounts, and GSTIN' },
      { key: 'audit.view', label: 'Audit Trail', description: 'Can review system event logs and transaction audit records' },
      { key: 'backup.manage', label: 'Backup & Restore', description: 'Can generate database backups and restore snapshots' },
      { key: 'admin.access', label: 'Admin Panel Access', description: 'Can manage users, create roles, and reset passwords' },
    ],
  },
];

export const AdminPanelPage: React.FC = () => {
  const { fetchApi } = useServer();
  const { user: currentUser } = useAuth();

  const [activeTab, setActiveTab] = useState<'users' | 'roles'>('users');
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // Notification Toast
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  // Modals state
  const [resetModalUser, setResetModalUser] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [resetting, setResetting] = useState(false);

  const [addUserModalOpen, setAddUserModalOpen] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newFullName, setNewFullName] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState('salesperson');
  const [newUserPhone, setNewUserPhone] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserTarget, setNewUserTarget] = useState('500000');
  const [addingUser, setAddingUser] = useState(false);

  const [editUser, setEditUser] = useState<User | null>(null);
  const [editUsername, setEditUsername] = useState('');
  const [editFullName, setEditFullName] = useState('');
  const [editRole, setEditRole] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editTarget, setEditTarget] = useState('0');
  const [editActive, setEditActive] = useState(true);
  const [savingEdit, setSavingEdit] = useState(false);

  // Role creation modal
  const [addRoleModalOpen, setAddRoleModalOpen] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleDisplayName, setNewRoleDisplayName] = useState('');
  const [newRoleDescription, setNewRoleDescription] = useState('');
  const [creatingRole, setCreatingRole] = useState(false);

  // Selected role for editing permissions
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [rolePermissions, setRolePermissions] = useState<Record<string, boolean>>({});
  const [savingPermissions, setSavingPermissions] = useState(false);

  // Load Users & Roles
  const loadData = async () => {
    setLoading(true);
    try {
      const [uRes, rRes] = await Promise.all([
        fetchApi<{ users: User[] }>('/api/users'),
        fetchApi<{ roles: Role[] }>('/api/roles'),
      ]);
      setUsers(uRes.users || []);
      const loadedRoles = rRes.roles || [];
      setRoles(loadedRoles);

      if (loadedRoles.length > 0 && !selectedRole) {
        setSelectedRole(loadedRoles[0]);
        setRolePermissions(loadedRoles[0].permissions || {});
      } else if (selectedRole) {
        const refreshed = loadedRoles.find((r) => r.id === selectedRole.id);
        if (refreshed) {
          setSelectedRole(refreshed);
          setRolePermissions(refreshed.permissions || {});
        }
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to load admin data', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Generate strong random password
  const generateRandomPassword = () => {
    const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%';
    let res = '';
    for (let i = 0; i < 8; i++) {
      res += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return res;
  };

  // Handle Password Reset
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetModalUser || !newPassword.trim()) return;

    setResetting(true);
    try {
      await fetchApi(`/api/users/${resetModalUser.id}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ new_password: newPassword.trim() }),
      });
      showToast(`Password for ${resetModalUser.username} has been reset successfully!`);
      setResetModalUser(null);
      setNewPassword('');
    } catch (err: any) {
      showToast(err.message || 'Failed to reset password', 'error');
    } finally {
      setResetting(false);
    }
  };

  // Handle Add User
  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim() || !newFullName.trim() || !newUserPassword.trim()) {
      showToast('Username, Full Name, and Password are required', 'error');
      return;
    }

    setAddingUser(true);
    try {
      await fetchApi('/api/users', {
        method: 'POST',
        body: JSON.stringify({
          username: newUsername.trim(),
          password: newUserPassword.trim(),
          full_name: newFullName.trim(),
          role: newUserRole,
          phone: newUserPhone.trim(),
          email: newUserEmail.trim(),
          monthly_target: parseFloat(newUserTarget) || 0,
        }),
      });

      showToast(`User ${newUsername} created with unique credentials!`);
      setAddUserModalOpen(false);
      setNewUsername('');
      setNewFullName('');
      setNewUserPassword('');
      setNewUserPhone('');
      setNewUserEmail('');
      setNewUserTarget('500000');
      loadData();
    } catch (err: any) {
      showToast(err.message || 'Failed to create user', 'error');
    } finally {
      setAddingUser(false);
    }
  };

  // Open Edit User Modal
  const openEditModal = (u: User) => {
    setEditUser(u);
    setEditUsername(u.username);
    setEditFullName(u.full_name);
    setEditRole(u.role);
    setEditPhone(u.phone || '');
    setEditEmail(u.email || '');
    setEditTarget(String(u.monthly_target || 0));
    setEditActive(u.is_active !== false);
  };

  // Save Edit User
  const handleSaveEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editUser) return;

    setSavingEdit(true);
    try {
      await fetchApi(`/api/users/${editUser.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          username: editUsername.trim(),
          full_name: editFullName.trim(),
          role: editRole,
          phone: editPhone.trim(),
          email: editEmail.trim(),
          monthly_target: parseFloat(editTarget) || 0,
          is_active: editActive,
        }),
      });

      showToast(`User ${editUsername} updated successfully!`);
      setEditUser(null);
      loadData();
    } catch (err: any) {
      showToast(err.message || 'Failed to update user', 'error');
    } finally {
      setSavingEdit(false);
    }
  };

  // Delete User
  const handleDeleteUser = async (u: User) => {
    if (u.username === 'admin') {
      showToast('The primary Administrator account cannot be deleted', 'error');
      return;
    }

    if (!window.confirm(`Are you sure you want to permanently delete user "${u.full_name}" (@${u.username})?`)) {
      return;
    }

    try {
      await fetchApi(`/api/users/${u.id}`, { method: 'DELETE' });
      showToast(`User @${u.username} deleted successfully`);
      loadData();
    } catch (err: any) {
      showToast(err.message || 'Failed to delete user', 'error');
    }
  };

  // Handle Add Role
  const handleAddRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoleName.trim() || !newRoleDisplayName.trim()) {
      showToast('Role Identifier and Display Name are required', 'error');
      return;
    }

    setCreatingRole(true);
    try {
      const res = await fetchApi<{ role: Role }>('/api/roles', {
        method: 'POST',
        body: JSON.stringify({
          name: newRoleName.trim(),
          display_name: newRoleDisplayName.trim(),
          description: newRoleDescription.trim(),
          permissions: {},
        }),
      });

      showToast(`Role "${res.role.display_name}" created successfully!`);
      setAddRoleModalOpen(false);
      setNewRoleName('');
      setNewRoleDisplayName('');
      setNewRoleDescription('');
      await loadData();
      setSelectedRole(res.role);
      setRolePermissions({});
    } catch (err: any) {
      showToast(err.message || 'Failed to create role', 'error');
    } finally {
      setCreatingRole(false);
    }
  };

  // Handle Save Role Permissions
  const handleSavePermissions = async () => {
    if (!selectedRole) return;

    setSavingPermissions(true);
    try {
      const res = await fetchApi<{ role: Role }>(`/api/roles/${selectedRole.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          permissions: rolePermissions,
        }),
      });

      showToast(`Permissions for role "${res.role.display_name}" saved successfully!`);
      loadData();
    } catch (err: any) {
      showToast(err.message || 'Failed to save permissions', 'error');
    } finally {
      setSavingPermissions(false);
    }
  };

  // Filtered Users List
  const filteredUsers = users.filter((u) => {
    const q = search.toLowerCase();
    const matchesSearch =
      u.full_name.toLowerCase().includes(q) ||
      u.username.toLowerCase().includes(q) ||
      (u.phone && u.phone.includes(q)) ||
      (u.email && u.email.toLowerCase().includes(q));

    const matchesStatus =
      statusFilter === 'all'
        ? true
        : statusFilter === 'active'
        ? u.is_active !== false
        : u.is_active === false;

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto overflow-y-auto max-h-screen pb-24">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg shadow-xl border flex items-center space-x-2 text-xs font-semibold animate-slide-up ${
            toast.type === 'success'
              ? 'bg-emerald-900/90 text-emerald-100 border-emerald-500/50'
              : 'bg-rose-900/90 text-rose-100 border-rose-500/50'
          }`}
        >
          {toast.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/60 pb-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-sm">
              <ShieldCheck size={20} />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900 tracking-tight">Admin Control Panel</h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Centralized user login credentials, password resets, roles & permission matrices
              </p>
            </div>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
          <button
            type="button"
            onClick={() => setActiveTab('users')}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer ${
              activeTab === 'users'
                ? 'bg-white text-indigo-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <UserCheck size={14} />
            <span>Users & Salespersons ({users.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('roles')}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer ${
              activeTab === 'roles'
                ? 'bg-white text-indigo-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Sliders size={14} />
            <span>Roles & Permissions ({roles.length})</span>
          </button>
        </div>
      </div>

      {/* TAB 1: USERS & SALESPERSONS */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          {/* Action & Filter Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-2xs">
            <div className="flex items-center space-x-2 flex-1 max-w-md">
              <div className="relative w-full">
                <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  className="input pl-8 py-1.5 text-xs w-full"
                  placeholder="Search by name, username, or phone..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <select
                className="input py-1.5 text-xs font-medium shrink-0"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
              >
                <option value="all">All Status</option>
                <option value="active">Active Only</option>
                <option value="inactive">Inactive Only</option>
              </select>
            </div>

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={loadData}
                disabled={loading}
                className="btn btn-secondary btn-sm flex items-center space-x-1"
                title="Refresh user list"
              >
                <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
                <span>Refresh</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setNewUserPassword(generateRandomPassword());
                  setAddUserModalOpen(true);
                }}
                className="btn btn-primary btn-sm flex items-center space-x-1.5 shadow-sm"
              >
                <UserPlus size={14} />
                <span>Add New Salesperson / Staff</span>
              </button>
            </div>
          </div>

          {/* Users Table */}
          <div className="card overflow-hidden shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-700 font-bold uppercase text-[11px]">
                    <th className="py-3 px-4">User / Salesperson</th>
                    <th className="py-3 px-3">Unique Username</th>
                    <th className="py-3 px-3">Assigned Role</th>
                    <th className="py-3 px-3">Phone & Email</th>
                    <th className="py-3 px-3 text-right">Target (₹)</th>
                    <th className="py-3 px-3 text-center">Status</th>
                    <th className="py-3 px-4 text-right">Credentials & Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400 text-xs">
                        No users found matching your criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((u) => {
                      const isMainAdmin = u.username === 'admin';
                      const roleObj = roles.find((r) => r.name === u.role);
                      return (
                        <tr key={u.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3 px-4 font-semibold text-slate-900">
                            <div className="flex items-center space-x-2.5">
                              <div
                                className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs ${
                                  isMainAdmin
                                    ? 'bg-indigo-600 text-white shadow-xs'
                                    : 'bg-slate-200 text-slate-700'
                                }`}
                              >
                                {u.full_name.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <span className="block">{u.full_name}</span>
                                {isMainAdmin && (
                                  <span className="text-[10px] text-indigo-600 font-bold">
                                    Primary System Admin
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>

                          <td className="py-3 px-3 font-mono font-medium text-slate-700">
                            @{u.username}
                          </td>

                          <td className="py-3 px-3">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                u.role === 'admin'
                                  ? 'bg-indigo-100 text-indigo-800 border border-indigo-200'
                                  : u.role === 'manager'
                                  ? 'bg-blue-100 text-blue-800 border border-blue-200'
                                  : u.role === 'dispatch' || u.role === 'dispatch_team'
                                  ? 'bg-teal-100 text-teal-800 border border-teal-200'
                                  : u.role === 'accounts'
                                  ? 'bg-purple-100 text-purple-800 border border-purple-200'
                                  : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              }`}
                            >
                              {roleObj ? roleObj.display_name : u.role}
                            </span>
                          </td>

                          <td className="py-3 px-3 text-slate-600">
                            <div>{u.phone || '—'}</div>
                            {u.email && <div className="text-[11px] text-slate-400">{u.email}</div>}
                          </td>

                          <td className="py-3 px-3 text-right font-semibold font-mono text-slate-700">
                            ₹ {Number(u.monthly_target || 0).toLocaleString('en-IN')}
                          </td>

                          <td className="py-3 px-3 text-center">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                u.is_active !== false
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : 'bg-rose-100 text-rose-700'
                              }`}
                            >
                              {u.is_active !== false ? 'Active' : 'Inactive'}
                            </span>
                          </td>

                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end space-x-1.5">
                              {/* Reset Password Button */}
                              <button
                                type="button"
                                onClick={() => {
                                  setResetModalUser(u);
                                  setNewPassword(generateRandomPassword());
                                }}
                                className="btn btn-xs bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 font-semibold flex items-center space-x-1 py-1 px-2 cursor-pointer"
                                title="Reset login password for this user"
                              >
                                <KeyRound size={12} className="text-amber-700" />
                                <span>Reset Password</span>
                              </button>

                              {/* Edit User Button */}
                              <button
                                type="button"
                                onClick={() => openEditModal(u)}
                                className="btn btn-secondary btn-xs p-1"
                                title="Edit user profile details"
                              >
                                <Edit2 size={12} />
                              </button>

                              {/* Delete User Button (Hidden for primary admin) */}
                              {!isMainAdmin && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteUser(u)}
                                  className="btn btn-xs bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 p-1 cursor-pointer"
                                  title="Delete this user"
                                >
                                  <Trash2 size={12} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: ROLES & PERMISSIONS */}
      {activeTab === 'roles' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Roles List */}
          <div className="lg:col-span-1 space-y-3">
            <div className="flex items-center justify-between pb-1">
              <h2 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider">
                System & Custom Roles
              </h2>
              <button
                type="button"
                onClick={() => setAddRoleModalOpen(true)}
                className="btn btn-primary btn-xs flex items-center space-x-1 shadow-xs"
              >
                <Plus size={12} />
                <span>New Role</span>
              </button>
            </div>

            <div className="space-y-2">
              {roles.map((r) => {
                const isSelected = selectedRole?.id === r.id;
                return (
                  <div
                    key={r.id}
                    onClick={() => {
                      setSelectedRole(r);
                      setRolePermissions(r.permissions || {});
                    }}
                    className={`p-3.5 rounded-xl border text-left cursor-pointer transition-all ${
                      isSelected
                        ? 'border-indigo-600 bg-indigo-50/60 ring-2 ring-indigo-500/20 shadow-sm'
                        : 'border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="font-extrabold text-slate-900 text-sm">
                            {r.display_name}
                          </span>
                          {r.is_system && (
                            <span className="text-[9px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded uppercase">
                              System
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-slate-400 font-mono block mt-0.5">
                          role: {r.name}
                        </span>
                      </div>
                      <span className="text-[10px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">
                        {r.user_count || 0} user(s)
                      </span>
                    </div>
                    {r.description && (
                      <p className="text-xs text-slate-500 mt-2 line-clamp-2 leading-relaxed">
                        {r.description}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Permission Matrix */}
          <div className="lg:col-span-2">
            {selectedRole ? (
              <div className="card p-5 space-y-5 border border-slate-200">
                <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                  <div>
                    <div className="flex items-center space-x-2">
                      <h2 className="text-base font-extrabold text-slate-900">
                        {selectedRole.display_name} — Permissions Matrix
                      </h2>
                      <span className="text-xs font-mono text-slate-400">({selectedRole.name})</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Configure granular action and access permissions for all users assigned this role.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleSavePermissions}
                    disabled={savingPermissions}
                    className="btn btn-primary btn-sm flex items-center space-x-1.5 shadow-sm"
                  >
                    <Check size={14} />
                    <span>{savingPermissions ? 'Saving...' : 'Save Permissions'}</span>
                  </button>
                </div>

                {/* Categorized Permissions */}
                <div className="space-y-6">
                  {PERMISSION_DEFINITIONS.map((cat) => (
                    <div key={cat.category} className="space-y-2.5">
                      <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center space-x-1.5">
                        <span className="w-2 h-2 rounded-full bg-indigo-500" />
                        <span>{cat.category}</span>
                      </h3>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {cat.permissions.map((p) => {
                          const isChecked = Boolean(rolePermissions[p.key]);
                          const isDisabled = selectedRole.name === 'admin'; // Admin always has full access
                          return (
                            <label
                              key={p.key}
                              className={`p-3 rounded-lg border text-left flex items-start space-x-3 transition-colors ${
                                isDisabled
                                  ? 'bg-slate-50 border-slate-200 cursor-not-allowed opacity-90'
                                  : isChecked
                                  ? 'bg-indigo-50/40 border-indigo-200 cursor-pointer'
                                  : 'bg-white border-slate-200 hover:bg-slate-50 cursor-pointer'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                disabled={isDisabled}
                                onChange={(e) => {
                                  setRolePermissions({
                                    ...rolePermissions,
                                    [p.key]: e.target.checked,
                                  });
                                }}
                                className="checkbox checkbox-xs mt-0.5"
                              />
                              <div className="flex-1">
                                <span className="font-bold text-xs text-slate-900 block">
                                  {p.label}
                                </span>
                                <span className="text-[11px] text-slate-500 block leading-tight mt-0.5">
                                  {p.description}
                                </span>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="card p-10 text-center text-slate-400 text-xs">
                Select a role from the list to view and configure permissions.
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL 1: RESET PASSWORD */}
      {resetModalUser && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
          <div className="card w-full max-w-md overflow-hidden shadow-2xl border border-slate-200 animate-scale-up">
            <div className="bg-[#0D1B2A] text-white p-4 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <KeyRound size={18} className="text-amber-400" />
                <h3 className="font-bold text-sm">Reset Password</h3>
              </div>
              <button
                type="button"
                onClick={() => setResetModalUser(null)}
                className="text-slate-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleResetPassword} className="p-5 space-y-4">
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-700">
                <span className="font-semibold block">Target User Account:</span>
                <span className="font-bold text-indigo-700 text-sm">{resetModalUser.full_name}</span>
                <span className="text-slate-500 font-mono block">(@{resetModalUser.username})</span>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-700">New Password</label>
                  <button
                    type="button"
                    onClick={() => setNewPassword(generateRandomPassword())}
                    className="text-[11px] text-indigo-600 hover:text-indigo-800 font-semibold"
                  >
                    Generate Random
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    className="input font-mono text-xs w-full pr-9"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password (min 4 chars)..."
                    required
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
                  >
                    {showNewPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  This new password will immediately be required for this user to sign in.
                </p>
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setResetModalUser(null)}
                  disabled={resetting}
                  className="btn btn-secondary btn-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={resetting || !newPassword.trim()}
                  className="btn btn-primary btn-sm bg-indigo-600 hover:bg-indigo-500 text-white font-bold"
                >
                  {resetting ? 'Updating...' : 'Set New Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: ADD USER / SALESPERSON */}
      {addUserModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
          <div className="card w-full max-w-lg overflow-hidden shadow-2xl border border-slate-200 animate-scale-up">
            <div className="bg-[#0D1B2A] text-white p-4 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <UserPlus size={18} className="text-emerald-400" />
                <h3 className="font-bold text-sm">Add New Salesperson / User</h3>
              </div>
              <button
                type="button"
                onClick={() => setAddUserModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleAddUser} className="p-5 space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    className="input input-sm text-xs w-full"
                    value={newFullName}
                    onChange={(e) => setNewFullName(e.target.value)}
                    placeholder="e.g. Ramesh Patel"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Unique Username *
                  </label>
                  <input
                    type="text"
                    className="input input-sm text-xs font-mono w-full"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    placeholder="e.g. ramesh"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-slate-700">Initial Password *</label>
                    <button
                      type="button"
                      onClick={() => setNewUserPassword(generateRandomPassword())}
                      className="text-[10px] text-indigo-600 font-semibold"
                    >
                      Random
                    </button>
                  </div>
                  <input
                    type="text"
                    className="input input-sm text-xs font-mono w-full"
                    value={newUserPassword}
                    onChange={(e) => setNewUserPassword(e.target.value)}
                    placeholder="Enter password..."
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Role Category *
                  </label>
                  <select
                    className="input input-sm text-xs w-full font-semibold"
                    value={newUserRole}
                    onChange={(e) => setNewUserRole(e.target.value)}
                  >
                    {roles.map((r) => (
                      <option key={r.id} value={r.name}>
                        {r.display_name} ({r.name})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Phone Number
                  </label>
                  <input
                    type="text"
                    className="input input-sm text-xs font-mono w-full"
                    value={newUserPhone}
                    onChange={(e) => setNewUserPhone(e.target.value)}
                    placeholder="+91 98250 12345"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    className="input input-sm text-xs w-full"
                    value={newUserEmail}
                    onChange={(e) => setNewUserEmail(e.target.value)}
                    placeholder="ramesh@amaceramics.com"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Monthly Sales Target (INR)
                </label>
                <input
                  type="number"
                  step="50000"
                  className="input input-sm text-xs font-mono font-bold w-full"
                  value={newUserTarget}
                  onChange={(e) => setNewUserTarget(e.target.value)}
                  placeholder="500000"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setAddUserModalOpen(false)}
                  disabled={addingUser}
                  className="btn btn-secondary btn-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addingUser}
                  className="btn btn-primary btn-sm bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
                >
                  {addingUser ? 'Registering...' : 'Register User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: EDIT USER */}
      {editUser && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
          <div className="card w-full max-w-lg overflow-hidden shadow-2xl border border-slate-200 animate-scale-up">
            <div className="bg-[#0D1B2A] text-white p-4 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Edit2 size={18} className="text-blue-400" />
                <h3 className="font-bold text-sm">Edit User Details & Role</h3>
              </div>
              <button
                type="button"
                onClick={() => setEditUser(null)}
                className="text-slate-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveEditUser} className="p-5 space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    className="input input-sm text-xs w-full"
                    value={editFullName}
                    onChange={(e) => setEditFullName(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Username *
                  </label>
                  <input
                    type="text"
                    className="input input-sm text-xs font-mono w-full"
                    value={editUsername}
                    onChange={(e) => setEditUsername(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Role Category *
                  </label>
                  <select
                    className="input input-sm text-xs w-full font-semibold"
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value)}
                    disabled={editUser.username === 'admin'}
                  >
                    {roles.map((r) => (
                      <option key={r.id} value={r.name}>
                        {r.display_name} ({r.name})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Account Status
                  </label>
                  <select
                    className="input input-sm text-xs w-full font-semibold"
                    value={editActive ? 'active' : 'inactive'}
                    onChange={(e) => setEditActive(e.target.value === 'active')}
                    disabled={editUser.username === 'admin'}
                  >
                    <option value="active">Active (Can Sign In)</option>
                    <option value="inactive">Inactive (Deactivated)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Phone Number
                  </label>
                  <input
                    type="text"
                    className="input input-sm text-xs font-mono w-full"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    className="input input-sm text-xs w-full"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Monthly Sales Target (INR)
                </label>
                <input
                  type="number"
                  step="50000"
                  className="input input-sm text-xs font-mono font-bold w-full"
                  value={editTarget}
                  onChange={(e) => setEditTarget(e.target.value)}
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setEditUser(null)}
                  disabled={savingEdit}
                  className="btn btn-secondary btn-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="btn btn-primary btn-sm bg-blue-600 hover:bg-blue-500 text-white font-bold"
                >
                  {savingEdit ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: CREATE ROLE */}
      {addRoleModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
          <div className="card w-full max-w-md overflow-hidden shadow-2xl border border-slate-200 animate-scale-up">
            <div className="bg-[#0D1B2A] text-white p-4 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Sliders size={18} className="text-indigo-400" />
                <h3 className="font-bold text-sm">Create Custom Role</h3>
              </div>
              <button
                type="button"
                onClick={() => setAddRoleModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleAddRole} className="p-5 space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Role Identifier / Slug *
                </label>
                <input
                  type="text"
                  className="input input-sm text-xs font-mono w-full"
                  value={newRoleName}
                  onChange={(e) => setNewRoleName(e.target.value)}
                  placeholder="e.g. cashier, estimator, junior_sales"
                  required
                />
                <span className="text-[10px] text-slate-400">
                  Lowercase system key used in user assignments
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Display Name *
                </label>
                <input
                  type="text"
                  className="input input-sm text-xs w-full"
                  value={newRoleDisplayName}
                  onChange={(e) => setNewRoleDisplayName(e.target.value)}
                  placeholder="e.g. Store Cashier, Estimator"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Description
                </label>
                <textarea
                  className="input text-xs w-full h-16 py-1.5"
                  value={newRoleDescription}
                  onChange={(e) => setNewRoleDescription(e.target.value)}
                  placeholder="Responsibilities and access scope..."
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setAddRoleModalOpen(false)}
                  disabled={creatingRole}
                  className="btn btn-secondary btn-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingRole}
                  className="btn btn-primary btn-sm bg-indigo-600 hover:bg-indigo-500 text-white font-bold"
                >
                  {creatingRole ? 'Creating...' : 'Create Role'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
