'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  UserPlus,
  Users,
  Copy,
  Check,
  Trash2,
  RefreshCw,
  X,
  MessageSquare,
  Shield,
  Sparkles,
  Search,
  RotateCcw,
  AlertTriangle,
  Edit2,
  ExternalLink,
  ShieldAlert,
} from 'lucide-react';
import { User } from '@/types';
import { Card, Badge, Avatar, Button, Input, Spinner } from '@/components/ui';
import { useTheme } from '@/context/ThemeContext';

export interface AdminDashboardProps {
  onClose: () => void;
  onSelectUserForChat: (user: User) => void;
}

const EMOJI_AVATARS = ['👨‍💻', '👩‍💼', '🧑‍🎨', '👨‍🏫', '👩‍🔬', '👨‍🚀', '🐱', '🦊', '🦁', '🐼', '⭐', '🚀'];

export default function AdminDashboard({
  onClose,
  onSelectUserForChat,
}: AdminDashboardProps) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [activeTab, setActiveTab] = useState<'overview' | 'create' | 'manage'>('overview');
  const [users, setUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Search & Role Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'user'>('all');

  // Create Form State
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [avatar, setAvatar] = useState('👨‍💻');
  const [role, setRole] = useState<'user' | 'admin'>('user');
  const [notes, setNotes] = useState('');
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Share Card State (Created User)
  const [createdUser, setCreatedUser] = useState<User | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // Edit User State
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editName, setEditName] = useState('');
  const [editCode, setEditCode] = useState('');
  const [editAvatar, setEditAvatar] = useState('👤');
  const [editRole, setEditRole] = useState<'user' | 'admin'>('user');
  const [editNotes, setEditNotes] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Delete Confirmation State
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Demo Reset State
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetSuccessMessage, setResetSuccessMessage] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoadingUsers(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/admin/users', { cache: 'no-store' });
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          throw new Error('Unauthorized: Admin access required.');
        }
        throw new Error('Failed to load user records.');
      }
      const data = await res.json();
      if (Array.isArray(data.users)) {
        setUsers(data.users);
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Error fetching users');
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  useEffect(() => {
    let ignore = false;
    async function loadInitial() {
      try {
        const res = await fetch('/api/admin/users', { cache: 'no-store' });
        if (!res.ok) {
          if (res.status === 401 || res.status === 403) {
            throw new Error('Unauthorized: Admin access required.');
          }
          throw new Error('Failed to load user records.');
        }
        const data = await res.json();
        if (!ignore && Array.isArray(data.users)) {
          setUsers(data.users);
        }
      } catch (err) {
        if (!ignore) {
          setErrorMessage(err instanceof Error ? err.message : 'Error fetching users');
        }
      } finally {
        if (!ignore) {
          setLoadingUsers(false);
        }
      }
    }
    loadInitial();
    return () => {
      ignore = true;
    };
  }, []);

  // Derived Metrics for Overview Tab
  const metrics = useMemo(() => {
    const total = users.length;
    const admins = users.filter((u) => u.role === 'admin').length;
    const regulars = users.filter((u) => u.role === 'user').length;
    const online = users.filter((u) => u.status === 'online').length;
    return { total, admins, regulars, online };
  }, [users]);

  // Filtered Users List for Management Tab
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const matchesSearch =
        u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (u.code && u.code.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesRole = roleFilter === 'all' || u.role === roleFilter;
      return matchesSearch && matchesRole;
    });
  }, [users, searchQuery, roleFilter]);

  const generateRandomCode = () => {
    const randomDigits = Math.floor(1000 + Math.random() * 9000).toString();
    setCode(randomDigits);
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setFormError('Please enter a display name.');
      return;
    }

    setCreating(true);
    setFormError(null);

    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          code: code.trim() || undefined,
          role,
          avatar,
          notes: notes.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error || 'Failed to create account.');
      } else {
        setCreatedUser(data.user);
        setName('');
        setCode('');
        setNotes('');
        setRole('user');
        await fetchUsers();
      }
    } catch {
      setFormError('Network error while creating account.');
    } finally {
      setCreating(false);
    }
  };

  const startEditUser = (user: User) => {
    setEditingUser(user);
    setEditName(user.name);
    setEditCode(user.code || '');
    setEditAvatar(user.avatar || '👤');
    setEditRole(user.role);
    setEditNotes(user.notes || '');
    setEditError(null);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser || !editName.trim()) return;

    setSavingEdit(true);
    setEditError(null);

    try {
      const res = await fetch('/api/admin/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingUser.id,
          name: editName.trim(),
          code: editCode.trim() || undefined,
          avatar: editAvatar,
          role: editRole,
          notes: editNotes.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setEditError(data.error || 'Failed to update user account.');
      } else {
        setEditingUser(null);
        await fetchUsers();
      }
    } catch {
      setEditError('Network error while saving user updates.');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!userToDelete) return;
    setDeleting(true);

    try {
      const res = await fetch(`/api/admin/users?id=${encodeURIComponent(userToDelete.id)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Failed to delete user.');
      } else {
        setUserToDelete(null);
        await fetchUsers();
      }
    } catch {
      alert('Network error while deleting account.');
    } finally {
      setDeleting(false);
    }
  };

  const handleExecuteReset = async () => {
    setResetting(true);
    try {
      const res = await fetch('/api/admin/reset', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setShowResetConfirm(false);
        setResetSuccessMessage('Database reset successfully. Only primary administrator is retained.');
        await fetchUsers();
        setTimeout(() => setResetSuccessMessage(null), 5000);
      } else {
        alert(data.error || 'Reset failed.');
      }
    } catch {
      alert('Network error while resetting database.');
    } finally {
      setResetting(false);
    }
  };

  const getShareLink = (passcode: string) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return `${origin}/#code=${encodeURIComponent(passcode)}`;
  };

  const copyShareLink = async (passcode: string) => {
    const shareUrl = getShareLink(passcode);
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      // Fallback
      alert(`Direct Link: ${shareUrl}`);
    }
  };

  const shareViaWhatsApp = (user: User) => {
    const shareUrl = getShareLink(user.code);
    const message = `Hello ${user.name}! Your direct access link to chat is:\n${shareUrl}\nPasscode: ${user.code}`;
    const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-dashboard-title"
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-6 animate-fadeIn"
    >
      <div
        className={`rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden transition-colors border ${
          isDark
            ? 'bg-[#111b21] border-[#222d34] text-[#e9edef]'
            : 'bg-[#F8F7FF] border-[#E8E3FA] text-[#1E1B2E]'
        }`}
      >
        {/* Header */}
        <header
          className={`h-16 px-6 border-b flex items-center justify-between flex-shrink-0 shadow-sm transition-colors ${
            isDark ? 'bg-[#202c33] border-[#222d34]' : 'bg-white border-[#E8E3FA]'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <div
              className={`w-9 h-9 rounded-xl border flex items-center justify-center ${
                isDark
                  ? 'bg-[#111b21] border-[#2a3942] text-[#00a884]'
                  : 'bg-[#EDE9FE] border-[#D5CCF5] text-[#7C5CFC]'
              }`}
            >
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h2
                id="admin-dashboard-title"
                className={`text-base font-bold ${isDark ? 'text-[#e9edef]' : 'text-[#1E1B2E]'}`}
              >
                Admin Center
              </h2>
              <p className={`text-[11px] ${isDark ? 'text-[#8696a0]' : 'text-[#797196]'}`}>
                User Management & System Controls
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            title="Close Admin Center"
            aria-label="Close Admin Center"
            className={`p-2 rounded-xl transition-colors ${
              isDark
                ? 'text-[#8696a0] hover:text-[#e9edef] hover:bg-[#2a3942]'
                : 'text-[#797196] hover:text-[#1E1B2E] hover:bg-[#EDE9FE]/50'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        {/* Tab Navigation */}
        <div
          className={`flex border-b px-6 gap-2 flex-shrink-0 transition-colors ${
            isDark ? 'bg-[#111b21] border-[#222d34]' : 'bg-white border-[#E8E3FA]'
          }`}
        >
          <button
            onClick={() => setActiveTab('overview')}
            className={`py-3 px-3 text-xs font-semibold uppercase tracking-wider flex items-center gap-2 border-b-2 transition-all ${
              activeTab === 'overview'
                ? isDark
                  ? 'border-[#00a884] text-[#00a884]'
                  : 'border-[#7C5CFC] text-[#7C5CFC]'
                : isDark
                ? 'border-transparent text-[#8696a0] hover:text-[#e9edef]'
                : 'border-transparent text-[#797196] hover:text-[#1E1B2E]'
            }`}
          >
            <ShieldAlert className="w-4 h-4" />
            <span>Overview</span>
          </button>
          <button
            onClick={() => setActiveTab('manage')}
            className={`py-3 px-3 text-xs font-semibold uppercase tracking-wider flex items-center gap-2 border-b-2 transition-all ${
              activeTab === 'manage'
                ? isDark
                  ? 'border-[#00a884] text-[#00a884]'
                  : 'border-[#7C5CFC] text-[#7C5CFC]'
                : isDark
                ? 'border-transparent text-[#8696a0] hover:text-[#e9edef]'
                : 'border-transparent text-[#797196] hover:text-[#1E1B2E]'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Manage Accounts ({users.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('create')}
            className={`py-3 px-3 text-xs font-semibold uppercase tracking-wider flex items-center gap-2 border-b-2 transition-all ${
              activeTab === 'create'
                ? isDark
                  ? 'border-[#00a884] text-[#00a884]'
                  : 'border-[#7C5CFC] text-[#7C5CFC]'
                : isDark
                ? 'border-transparent text-[#8696a0] hover:text-[#e9edef]'
                : 'border-transparent text-[#797196] hover:text-[#1E1B2E]'
            }`}
          >
            <UserPlus className="w-4 h-4" />
            <span>Create Account</span>
          </button>
        </div>

        {/* Global Error Banner */}
        {errorMessage && (
          <div className="px-6 py-2.5 bg-[#FEF2F2] border-b border-[#FECACA] flex items-center justify-between text-xs text-[#991B1B]">
            <span>{errorMessage}</span>
            <button onClick={fetchUsers} className="font-semibold underline">
              Retry
            </button>
          </div>
        )}

        {/* Global Success Banner */}
        {resetSuccessMessage && (
          <div className="px-6 py-2.5 bg-[#ECFDF5] border-b border-[#A7F3D0] flex items-center text-xs text-[#065F46] font-medium">
            <Check className="w-4 h-4 mr-1.5" />
            <span>{resetSuccessMessage}</span>
          </div>
        )}

        {/* Main Tab Content */}
        <div className={`flex-1 overflow-y-auto p-6 space-y-6 ${isDark ? 'bg-[#0c1317]' : ''}`}>
          {/* TAB 1: OVERVIEW & SYSTEM METRICS */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <Card
                  variant="white"
                  className={`p-4 ${isDark ? '!bg-[#111b21] !border-[#222d34]' : ''}`}
                >
                  <span
                    className={`text-[11px] font-semibold uppercase tracking-wider ${
                      isDark ? 'text-[#8696a0]' : 'text-[#797196]'
                    }`}
                  >
                    Total Users
                  </span>
                  <p
                    className={`text-2xl font-bold mt-1 ${
                      isDark ? 'text-[#e9edef]' : 'text-[#1E1B2E]'
                    }`}
                  >
                    {metrics.total}
                  </p>
                </Card>
                <Card
                  variant="white"
                  className={`p-4 ${isDark ? '!bg-[#111b21] !border-[#222d34]' : ''}`}
                >
                  <span
                    className={`text-[11px] font-semibold uppercase tracking-wider ${
                      isDark ? 'text-[#8696a0]' : 'text-[#797196]'
                    }`}
                  >
                    Regular Users
                  </span>
                  <p
                    className={`text-2xl font-bold mt-1 ${
                      isDark ? 'text-[#00a884]' : 'text-[#7C5CFC]'
                    }`}
                  >
                    {metrics.regulars}
                  </p>
                </Card>
                <Card
                  variant="white"
                  className={`p-4 ${isDark ? '!bg-[#111b21] !border-[#222d34]' : ''}`}
                >
                  <span
                    className={`text-[11px] font-semibold uppercase tracking-wider ${
                      isDark ? 'text-[#8696a0]' : 'text-[#797196]'
                    }`}
                  >
                    Administrators
                  </span>
                  <p
                    className={`text-2xl font-bold mt-1 ${
                      isDark ? 'text-[#53bdeb]' : 'text-[#4C3A8C]'
                    }`}
                  >
                    {metrics.admins}
                  </p>
                </Card>
                <Card
                  variant="white"
                  className={`p-4 ${isDark ? '!bg-[#111b21] !border-[#222d34]' : ''}`}
                >
                  <span
                    className={`text-[11px] font-semibold uppercase tracking-wider ${
                      isDark ? 'text-[#8696a0]' : 'text-[#797196]'
                    }`}
                  >
                    Active / Online
                  </span>
                  <p className="text-2xl font-bold text-[#10B981] mt-1">{metrics.online}</p>
                </Card>
              </div>

              {/* Maintenance & Dangerous Zone Card */}
              <Card
                variant="white"
                className={`p-5 border-l-4 border-l-[#EF4444] ${
                  isDark ? '!bg-[#111b21] !border-[#222d34] !border-l-[#EF4444]' : ''
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h3
                      className={`text-sm font-bold flex items-center gap-1.5 ${
                        isDark ? 'text-[#e9edef]' : 'text-[#1E1B2E]'
                      }`}
                    >
                      <AlertTriangle className="w-4 h-4 text-[#EF4444]" />
                      <span>Demo Database Reset</span>
                    </h3>
                    <p
                      className={`text-xs mt-1 leading-relaxed max-w-lg ${
                        isDark ? 'text-[#8696a0]' : 'text-[#797196]'
                      }`}
                    >
                      Deletes all conversations, attachments, reactions, and non-admin user accounts. Retains the primary root administrator account.
                    </p>
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setShowResetConfirm(true)}
                    className="flex-shrink-0 gap-1.5"
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span>Reset Database</span>
                  </Button>
                </div>
              </Card>
            </div>
          )}

          {/* TAB 2: MANAGE ACCOUNTS */}
          {activeTab === 'manage' && (
            <div className="space-y-4">
              {/* Search & Filter Toolbar */}
              <div className="flex flex-col sm:flex-row items-center gap-3">
                <div className="relative flex-1 w-full">
                  <Search
                    className={`w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none ${
                      isDark ? 'text-[#8696a0]' : 'text-[#797196]'
                    }`}
                  />
                  <input
                    type="text"
                    placeholder="Search by name, ID, or passcode..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className={`w-full pl-10 pr-4 py-2 rounded-xl text-xs focus:outline-none transition-colors border ${
                      isDark
                        ? 'bg-[#202c33] border-[#2a3942] text-[#e9edef] placeholder-[#8696a0] focus:border-[#00a884]'
                        : 'bg-white border-[#DCD6F7] text-[#1E1B2E] focus:border-[#7C5CFC]'
                    }`}
                  />
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <select
                    value={roleFilter}
                    onChange={(e) => setRoleFilter(e.target.value as 'all' | 'admin' | 'user')}
                    className={`px-3 py-2 rounded-xl text-xs focus:outline-none transition-colors border ${
                      isDark
                        ? 'bg-[#202c33] border-[#2a3942] text-[#e9edef] focus:border-[#00a884]'
                        : 'bg-white border-[#DCD6F7] text-[#1E1B2E] focus:border-[#7C5CFC]'
                    }`}
                  >
                    <option value="all">All Roles</option>
                    <option value="user">Users Only</option>
                    <option value="admin">Admins Only</option>
                  </select>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={fetchUsers}
                    disabled={loadingUsers}
                    className={`gap-1 flex-shrink-0 ${
                      isDark
                        ? '!bg-[#202c33] !border-[#2a3942] !text-[#e9edef] hover:!bg-[#2a3942]'
                        : ''
                    }`}
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingUsers ? 'animate-spin' : ''}`} />
                    <span>Refresh</span>
                  </Button>
                </div>
              </div>

              {/* User Account List */}
              {filteredUsers.length === 0 ? (
                <div
                  className={`p-8 text-center rounded-2xl border ${
                    isDark
                      ? 'bg-[#111b21] border-[#222d34] text-[#8696a0]'
                      : 'bg-white border-[#E8E3FA] text-[#797196]'
                  }`}
                >
                  <Users className={`w-8 h-8 mx-auto mb-2 ${isDark ? 'text-[#8696a0]' : 'text-[#8E82B2]'}`} />
                  <p className={`text-xs font-semibold ${isDark ? 'text-[#e9edef]' : 'text-[#1E1B2E]'}`}>
                    No matching accounts found
                  </p>
                  <p className="text-[11px] mt-0.5">
                    Try adjusting your search criteria or create a new user account.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {filteredUsers.map((u) => (
                    <Card
                      key={u.id}
                      variant="white"
                      className={`p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm transition-all ${
                        isDark
                          ? '!bg-[#111b21] !border-[#222d34] hover:!border-[#00a884]/60'
                          : 'hover:border-[#D5CCF5]'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar
                          name={u.name}
                          avatar={u.avatar}
                          size="md"
                          isOnline={u.status === 'online'}
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-sm font-bold truncate ${
                                isDark ? 'text-[#e9edef]' : 'text-[#1E1B2E]'
                              }`}
                            >
                              {u.name}
                            </span>
                            {u.role === 'admin' ? (
                              <Badge
                                variant="purple"
                                size="sm"
                                className="gap-1 !bg-[#00a884]/20 !text-[#00a884] !border-[#00a884]/30"
                              >
                                Admin
                              </Badge>
                            ) : (
                              <Badge
                                variant="neutral"
                                size="sm"
                                className={`gap-1 ${
                                  isDark ? '!bg-[#202c33] !text-[#8696a0] !border-[#2a3942]' : ''
                                }`}
                              >
                                User
                              </Badge>
                            )}
                          </div>
                          <div
                            className={`text-xs flex items-center gap-3 mt-0.5 ${
                              isDark ? 'text-[#8696a0]' : 'text-[#797196]'
                            }`}
                          >
                            <span
                              className={`font-mono font-medium ${
                                isDark ? 'text-[#00a884]' : 'text-[#1E1B2E]'
                              }`}
                            >
                              Passcode: {u.code}
                            </span>
                            <span className={`text-[10px] ${isDark ? 'text-[#8696a0]' : 'text-[#8E82B2]'}`}>
                              ID: {u.id}
                            </span>
                          </div>
                          {u.notes && (
                            <p
                              className={`text-[11px] mt-0.5 italic truncate max-w-sm ${
                                isDark ? 'text-[#00a884]/80' : 'text-[#4C3A8C]'
                              }`}
                            >
                              Note: {u.notes}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex items-center gap-1.5 self-end sm:self-center">
                        <button
                          onClick={() => {
                            onClose();
                            onSelectUserForChat(u);
                          }}
                          title="Open conversation"
                          aria-label={`Chat with ${u.name}`}
                          className={`p-2 rounded-xl transition-colors ${
                            isDark
                              ? 'text-[#8696a0] hover:text-[#00a884] hover:bg-[#202c33]'
                              : 'text-[#797196] hover:text-[#7C5CFC] hover:bg-[#EDE9FE]/50'
                          }`}
                        >
                          <MessageSquare className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => copyShareLink(u.code)}
                          title="Copy direct share link"
                          aria-label={`Copy link for ${u.name}`}
                          className={`p-2 rounded-xl transition-colors ${
                            isDark
                              ? 'text-[#8696a0] hover:text-[#00a884] hover:bg-[#202c33]'
                              : 'text-[#797196] hover:text-[#7C5CFC] hover:bg-[#EDE9FE]/50'
                          }`}
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => shareViaWhatsApp(u)}
                          title="Share via WhatsApp"
                          aria-label={`Share ${u.name} on WhatsApp`}
                          className={`p-2 rounded-xl transition-colors ${
                            isDark
                              ? 'text-[#8696a0] hover:text-[#25d366] hover:bg-[#202c33]'
                              : 'text-[#797196] hover:text-[#10B981] hover:bg-[#ECFDF5]'
                          }`}
                        >
                          <ExternalLink className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => startEditUser(u)}
                          title="Edit user account"
                          aria-label={`Edit ${u.name}`}
                          className={`p-2 rounded-xl transition-colors ${
                            isDark
                              ? 'text-[#8696a0] hover:text-[#00a884] hover:bg-[#202c33]'
                              : 'text-[#797196] hover:text-[#4C3A8C] hover:bg-[#EDE9FE]/50'
                          }`}
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        {u.id !== 'admin_root' && (
                          <button
                            onClick={() => setUserToDelete(u)}
                            title="Delete user account"
                            aria-label={`Delete ${u.name}`}
                            className={`p-2 rounded-xl transition-colors ${
                              isDark
                                ? 'text-[#8696a0] hover:text-[#EF4444] hover:bg-[#FEF2F2]/10'
                                : 'text-[#797196] hover:text-[#EF4444] hover:bg-[#FEF2F2]'
                            }`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: CREATE ACCOUNT */}
          {activeTab === 'create' && (
            <div className="space-y-6 max-w-xl mx-auto">
              {createdUser && (
                <Card
                  variant="lavender"
                  className={`p-4 animate-fadeIn ${
                    isDark
                      ? '!bg-[#202c33] !border-[#00a884]/40 text-[#e9edef]'
                      : 'border-[#7C5CFC]/40'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span
                      className={`text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 ${
                        isDark ? 'text-[#00a884]' : 'text-[#4C3A8C]'
                      }`}
                    >
                      <Check className="w-4 h-4 text-[#10B981]" />
                      <span>Account Created Successfully</span>
                    </span>
                    <button
                      onClick={() => setCreatedUser(null)}
                      className={`text-xs ${
                        isDark ? 'text-[#8696a0] hover:text-[#e9edef]' : 'text-[#797196] hover:text-[#1E1B2E]'
                      }`}
                    >
                      Dismiss
                    </button>
                  </div>
                  <p className={`text-sm font-semibold ${isDark ? 'text-[#e9edef]' : 'text-[#1E1B2E]'}`}>
                    {createdUser.avatar} {createdUser.name} — Passcode:{' '}
                    <span className={`font-mono ${isDark ? 'text-[#00a884]' : 'text-[#7C5CFC]'}`}>
                      {createdUser.code}
                    </span>
                  </p>
                  <div className="mt-3 flex gap-2">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => copyShareLink(createdUser.code)}
                      className="gap-1.5 !bg-[#00a884] hover:!bg-[#008f6f] !text-white"
                    >
                      {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedLink ? 'Copied Link!' : 'Copy Direct Access Link'}</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => shareViaWhatsApp(createdUser)}
                      className={`gap-1.5 ${
                        isDark ? '!bg-[#202c33] !border-[#2a3942] !text-[#e9edef] hover:!bg-[#2a3942]' : ''
                      }`}
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>WhatsApp Share</span>
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => {
                        onClose();
                        onSelectUserForChat(createdUser);
                      }}
                      className="gap-1.5 bg-[#10B981] hover:bg-[#059669]"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>Chat Now</span>
                    </Button>
                  </div>
                </Card>
              )}

              {formError && (
                <div className="p-3 rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-[#991B1B] text-xs font-medium">
                  {formError}
                </div>
              )}

              <form onSubmit={handleCreateUser} className="space-y-4">
                <div>
                  <label
                    className={`block text-xs font-semibold mb-1.5 ${
                      isDark ? 'text-[#8696a0]' : 'text-[#4B4562]'
                    }`}
                  >
                    Display Name
                  </label>
                  <Input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Sarah Connor"
                    required
                    className={
                      isDark
                        ? '!bg-[#202c33] !border-[#2a3942] !text-[#e9edef] placeholder:!text-[#8696a0] focus:!border-[#00a884]'
                        : ''
                    }
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label
                      className={`block text-xs font-semibold ${
                        isDark ? 'text-[#8696a0]' : 'text-[#4B4562]'
                      }`}
                    >
                      Access Passcode (Optional — auto-generated if left blank)
                    </label>
                    <button
                      type="button"
                      onClick={generateRandomCode}
                      className={`text-xs font-semibold flex items-center gap-1 ${
                        isDark ? 'text-[#00a884] hover:text-[#25d366]' : 'text-[#7C5CFC] hover:text-[#6C4AE8]'
                      }`}
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Generate 4 Digits</span>
                    </button>
                  </div>
                  <Input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="e.g. 4829"
                    className={`font-mono ${
                      isDark
                        ? '!bg-[#202c33] !border-[#2a3942] !text-[#e9edef] placeholder:!text-[#8696a0] focus:!border-[#00a884]'
                        : ''
                    }`}
                  />
                </div>

                <div>
                  <label
                    className={`block text-xs font-semibold mb-1.5 ${
                      isDark ? 'text-[#8696a0]' : 'text-[#4B4562]'
                    }`}
                  >
                    Account Role
                  </label>
                  <div className="flex gap-3">
                    <label
                      className={`flex items-center gap-2 text-xs font-medium cursor-pointer ${
                        isDark ? 'text-[#e9edef]' : 'text-[#1E1B2E]'
                      }`}
                    >
                      <input
                        type="radio"
                        name="createRole"
                        value="user"
                        checked={role === 'user'}
                        onChange={() => setRole('user')}
                        className="accent-[#00a884]"
                      />
                      <span>Regular User</span>
                    </label>
                    <label
                      className={`flex items-center gap-2 text-xs font-medium cursor-pointer ${
                        isDark ? 'text-[#e9edef]' : 'text-[#1E1B2E]'
                      }`}
                    >
                      <input
                        type="radio"
                        name="createRole"
                        value="admin"
                        checked={role === 'admin'}
                        onChange={() => setRole('admin')}
                        className="accent-[#00a884]"
                      />
                      <span>Administrator</span>
                    </label>
                  </div>
                </div>

                <div>
                  <label
                    className={`block text-xs font-semibold mb-2 ${
                      isDark ? 'text-[#8696a0]' : 'text-[#4B4562]'
                    }`}
                  >
                    Avatar Emoji
                  </label>
                  <div className="grid grid-cols-6 gap-2">
                    {EMOJI_AVATARS.map((em) => (
                      <button
                        key={em}
                        type="button"
                        onClick={() => setAvatar(em)}
                        className={`p-2 rounded-xl text-xl border transition-all ${
                          avatar === em
                            ? isDark
                              ? 'bg-[#202c33] border-[#00a884] ring-2 ring-[#00a884]/30'
                              : 'bg-[#EDE9FE] border-[#7C5CFC] shadow-sm'
                            : isDark
                            ? 'bg-[#111b21] border-[#2a3942] hover:bg-[#202c33]'
                            : 'bg-white border-[#E8E3FA] hover:bg-[#F8F7FF]'
                        }`}
                      >
                        {em}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label
                    className={`block text-xs font-semibold mb-1.5 ${
                      isDark ? 'text-[#8696a0]' : 'text-[#4B4562]'
                    }`}
                  >
                    Internal Admin Notes (Optional)
                  </label>
                  <Input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="e.g. VIP Client, Onboarding batch #1"
                    className={
                      isDark
                        ? '!bg-[#202c33] !border-[#2a3942] !text-[#e9edef] placeholder:!text-[#8696a0] focus:!border-[#00a884]'
                        : ''
                    }
                  />
                </div>

                <Button
                  type="submit"
                  disabled={creating}
                  isLoading={creating}
                  className="w-full gap-2 !bg-[#00a884] hover:!bg-[#008f6f] !text-white"
                >
                  {creating ? <Spinner size="sm" className="text-white" /> : <UserPlus className="w-4 h-4" />}
                  <span>Save & Generate Account</span>
                </Button>
              </form>
            </div>
          )}
        </div>
      </div>

      {/* EDIT USER MODAL */}
      {editingUser && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-user-title"
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn"
        >
          <Card
            variant="white"
            className={`p-6 max-w-md w-full shadow-2xl ${
              isDark ? '!bg-[#111b21] !border-[#222d34] text-[#e9edef]' : ''
            }`}
          >
            <h3
              id="edit-user-title"
              className={`text-base font-bold mb-4 ${isDark ? 'text-[#e9edef]' : 'text-[#1E1B2E]'}`}
            >
              Edit Account: {editingUser.name}
            </h3>

            {editError && (
              <div className="mb-4 p-3 rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-[#991B1B] text-xs">
                {editError}
              </div>
            )}

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label
                  className={`block text-xs font-semibold mb-1 ${
                    isDark ? 'text-[#8696a0]' : 'text-[#4B4562]'
                  }`}
                >
                  Display Name
                </label>
                <Input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                  className={
                    isDark
                      ? '!bg-[#202c33] !border-[#2a3942] !text-[#e9edef] focus:!border-[#00a884]'
                      : ''
                  }
                />
              </div>

              <div>
                <label
                  className={`block text-xs font-semibold mb-1 ${
                    isDark ? 'text-[#8696a0]' : 'text-[#4B4562]'
                  }`}
                >
                  Access Passcode
                </label>
                <Input
                  type="text"
                  value={editCode}
                  onChange={(e) => setEditCode(e.target.value)}
                  className={`font-mono ${
                    isDark
                      ? '!bg-[#202c33] !border-[#2a3942] !text-[#e9edef] focus:!border-[#00a884]'
                      : ''
                  }`}
                  required
                />
              </div>

              {editingUser.id !== 'admin_root' && (
                <div>
                  <label
                    className={`block text-xs font-semibold mb-1 ${
                      isDark ? 'text-[#8696a0]' : 'text-[#4B4562]'
                    }`}
                  >
                    Role
                  </label>
                  <select
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value as 'user' | 'admin')}
                    className={`w-full py-2 px-3 rounded-xl text-xs focus:outline-none border transition-colors ${
                      isDark
                        ? 'bg-[#202c33] border-[#2a3942] text-[#e9edef] focus:border-[#00a884]'
                        : 'bg-white border-[#DCD6F7] text-[#1E1B2E] focus:border-[#7C5CFC]'
                    }`}
                  >
                    <option value="user">Regular User</option>
                    <option value="admin">Administrator</option>
                  </select>
                </div>
              )}

              <div>
                <label
                  className={`block text-xs font-semibold mb-1 ${
                    isDark ? 'text-[#8696a0]' : 'text-[#4B4562]'
                  }`}
                >
                  Internal Notes
                </label>
                <Input
                  type="text"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Notes..."
                  className={
                    isDark
                      ? '!bg-[#202c33] !border-[#2a3942] !text-[#e9edef] focus:!border-[#00a884]'
                      : ''
                  }
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setEditingUser(null)}
                  className={isDark ? '!bg-[#202c33] !border-[#2a3942] !text-[#8696a0] hover:!text-[#e9edef]' : ''}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={savingEdit}
                  isLoading={savingEdit}
                  className="!bg-[#00a884] hover:!bg-[#008f6f] !text-white"
                >
                  Save Changes
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {userToDelete && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-user-title"
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn"
        >
          <Card
            variant="white"
            className={`p-6 max-w-sm w-full shadow-2xl ${
              isDark ? '!bg-[#111b21] !border-[#222d34] text-[#e9edef]' : ''
            }`}
          >
            <h3
              id="delete-user-title"
              className={`text-base font-bold mb-2 ${isDark ? 'text-[#e9edef]' : 'text-[#1E1B2E]'}`}
            >
              Delete account for {userToDelete.name}?
            </h3>
            <p className={`text-xs mb-5 leading-relaxed ${isDark ? 'text-[#8696a0]' : 'text-[#797196]'}`}>
              This will permanently delete this account and all associated conversation history. This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2.5">
              <Button
                variant="outline"
                size="sm"
                disabled={deleting}
                onClick={() => setUserToDelete(null)}
                className={isDark ? '!bg-[#202c33] !border-[#2a3942] !text-[#8696a0] hover:!text-[#e9edef]' : ''}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={deleting}
                isLoading={deleting}
                onClick={handleConfirmDelete}
              >
                Delete Account
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* RESET DATABASE CONFIRMATION MODAL */}
      {showResetConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="reset-db-title"
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn"
        >
          <Card
            variant="white"
            className={`p-6 max-w-sm w-full shadow-2xl border-l-4 border-l-[#EF4444] ${
              isDark ? '!bg-[#111b21] !border-[#222d34] !border-l-[#EF4444] text-[#e9edef]' : ''
            }`}
          >
            <h3
              id="reset-db-title"
              className={`text-base font-bold mb-2 flex items-center gap-1.5 ${
                isDark ? 'text-[#e9edef]' : 'text-[#1E1B2E]'
              }`}
            >
              <AlertTriangle className="w-5 h-5 text-[#EF4444]" />
              <span>Confirm Demo Reset</span>
            </h3>
            <p className={`text-xs mb-5 leading-relaxed ${isDark ? 'text-[#8696a0]' : 'text-[#797196]'}`}>
              Are you sure? This will permanently delete ALL messages, uploaded attachments, emoji reactions, and created users. Only the primary administrator account will be retained.
            </p>
            <div className="flex justify-end gap-2.5">
              <Button
                variant="outline"
                size="sm"
                disabled={resetting}
                onClick={() => setShowResetConfirm(false)}
                className={isDark ? '!bg-[#202c33] !border-[#2a3942] !text-[#8696a0] hover:!text-[#e9edef]' : ''}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={resetting}
                isLoading={resetting}
                onClick={handleExecuteReset}
              >
                Confirm Reset
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
