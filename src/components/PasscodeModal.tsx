'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { KeyRound, ShieldCheck, UserCheck, Eye, EyeOff, Lock, Users, Sun, Moon } from 'lucide-react';
import { User } from '@/types';
import { Button, Input, Card, Badge, Avatar, Spinner } from '@/components/ui';
import { useTheme } from '@/context/ThemeContext';

export interface PasscodeModalProps {
  mode: 'gate' | 'switcher';
  onLogin: (code: string) => Promise<boolean>;
  loading: boolean;
  error: string | null;
}

export default function PasscodeModal({
  mode,
  onLogin,
  loading,
  error,
}: PasscodeModalProps) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';
  const [code, setCode] = useState('');
  const [showCode, setShowCode] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [availableUsers, setAvailableUsers] = useState<User[]>([]);
  const [fetchingUsers, setFetchingUsers] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch created users for account selection
  const fetchAvailableUsers = useCallback(async () => {
    setFetchingUsers(true);
    try {
      const res = await fetch('/api/admin/users');
      const data = await res.json();
      if (data.users) {
        setAvailableUsers(data.users);
      }
    } catch {
      // Graceful degradation
    } finally {
      setFetchingUsers(false);
    }
  }, []);

  useEffect(() => {
    if (mode !== 'switcher') return;
    let isMounted = true;
    fetch('/api/admin/users')
      .then((res) => res.json())
      .then((data) => {
        if (isMounted && data.users) {
          setAvailableUsers(data.users);
        }
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, [mode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || loading) return;
    const success = await onLogin(code.trim());
    if (success) {
      setCode('');
    }
  };

  const handleSelectUser = async (user: User) => {
    if (loading) return;
    const targetCode = user.code || (user.role === 'admin' ? '@2021' : '');
    if (targetCode) {
      await onLogin(targetCode);
    } else {
      setSelectedUser(user);
      inputRef.current?.focus();
    }
  };

  return (
    <div
      className={`fixed inset-0 min-h-screen w-full flex items-center justify-center p-4 z-40 transition-colors ${
        isDark ? 'bg-[#0c1317]' : 'bg-[#F8F7FF]'
      }`}
    >
      {/* Top Header Theme Toggle */}
      <div className="absolute top-4 right-4 z-50">
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
          title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
          className={`p-2.5 rounded-full transition-all border shadow-sm flex items-center justify-center ${
            isDark
              ? 'bg-[#202c33] border-[#2a3942] text-[#00a884] hover:bg-[#2a3942]'
              : 'bg-white border-[#E8E3FA] text-[#00a884] hover:bg-[#EDE9FE]'
          }`}
        >
          {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>
      </div>

      {/* Decorative background elements */}
      {!isDark && (
        <>
          <div className="absolute top-1/4 -left-20 w-80 h-80 rounded-full bg-[#EDE9FE]/50 blur-3xl pointer-events-none" />
          <div className="absolute bottom-1/4 -right-20 w-80 h-80 rounded-full bg-[#E4DEFD]/40 blur-3xl pointer-events-none" />
        </>
      )}
      {isDark && (
        <div className="absolute inset-0 bg-[radial-gradient(#1f2c34_1px,transparent_1px)] [background-size:24px_24px] opacity-30 pointer-events-none" />
      )}

      <Card
        variant="white"
        className={`relative w-full max-w-md p-6 sm:p-8 border shadow-xl z-10 transition-colors ${
          isDark
            ? '!bg-[#111b21] !border-[#222d34] shadow-black/40 text-[#e9edef]'
            : 'border-[#E8E3FA] shadow-[#4C3A8C]/5 text-[#1E1B2E]'
        }`}
      >
        <div className="flex flex-col items-center text-center mb-6">
          <div
            className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-3 shadow-sm transition-transform hover:scale-105 border ${
              isDark
                ? 'bg-[#202c33] border-[#2a3942] text-[#00a884]'
                : 'bg-[#d9fdd3] border-[#00a884]/30 text-[#00a884]'
            }`}
          >
            <Lock className="w-7 h-7" />
          </div>
          <h1
            className={`text-2xl font-bold tracking-tight ${
              isDark ? 'text-[#e9edef]' : 'text-[#1E1B2E]'
            }`}
          >
            {mode === 'gate' ? 'Login' : 'Switch Account'}
          </h1>
          <p
            className={`text-xs mt-1.5 max-w-xs leading-relaxed ${
              isDark ? 'text-[#8696a0]' : 'text-[#797196]'
            }`}
          >
            {mode === 'gate'
              ? 'Enter your password to sign in to your account.'
              : selectedUser
              ? `Enter password for ${selectedUser.name}`
              : 'Select an account below to switch, or enter your password.'}
          </p>
        </div>

        {error && (
          <div
            id="passcode-error"
            role="alert"
            className="mb-4 p-3 rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-[#991B1B] text-xs text-center font-medium leading-relaxed"
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="passcode"
              className={`block text-xs font-semibold mb-1.5 text-left ${
                isDark ? 'text-[#8696a0]' : 'text-[#4B4562]'
              }`}
            >
              {selectedUser ? `Password for ${selectedUser.name}` : 'Password'}
            </label>
            <Input
              ref={inputRef}
              id="passcode"
              type={showCode ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="Password"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              disabled={loading}
              error={Boolean(error)}
              leftIcon={<KeyRound className={`w-4 h-4 ${isDark ? 'text-[#8696a0]' : ''}`} />}
              className={
                isDark
                  ? '!bg-[#202c33] !border-[#2a3942] !text-[#e9edef] placeholder:!text-[#8696a0] focus:!border-[#00a884] focus:!ring-[#00a884]/30'
                  : '!bg-[#f0f2f5] !border-[#e9edef] !text-[#111b21] placeholder:!text-[#8696a0] focus:!border-[#00a884] focus:!ring-[#00a884]/30'
              }
              rightIcon={
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label={showCode ? 'Hide password' : 'Show password'}
                  onClick={() => setShowCode(!showCode)}
                  className={`p-1 transition-colors focus:outline-none ${
                    isDark ? 'text-[#8696a0] hover:text-[#00a884]' : 'text-[#797196] hover:text-[#00a884]'
                  }`}
                >
                  {showCode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              }
            />
          </div>

          <Button
            type="submit"
            disabled={loading || !code.trim()}
            isLoading={loading}
            className="w-full !bg-[#00a884] hover:!bg-[#008f6f] !text-white font-semibold !shadow-md !border-none"
          >
            {loading ? (
              <>
                <Spinner size="sm" className="text-white mr-1.5" />
                <span>{mode === 'switcher' ? 'Switching...' : 'Logging in...'}</span>
              </>
            ) : (
              <span>{mode === 'switcher' ? 'Switch Account' : 'Login'}</span>
            )}
          </Button>

          <div className="pt-2 text-center space-y-2">
            <div>
              <button
                type="button"
                onClick={() => alert('Please contact the administrator to retrieve or reset your password.')}
                className={`text-xs hover:underline transition-colors focus:outline-none ${
                  isDark ? 'text-[#00a884] hover:text-[#25d366]' : 'text-[#00a884] hover:text-[#008f6f]'
                }`}
              >
                Forgot Password?
              </button>
            </div>
            <p className={`text-xs ${isDark ? 'text-[#8696a0]' : 'text-[#797196]'}`}>
              Don&apos;t have an account?{' '}
              <button
                type="button"
                onClick={() => alert('New accounts are created by the administrator in the Admin Dashboard.')}
                className={`font-semibold hover:underline transition-colors focus:outline-none ${
                  isDark ? 'text-[#00a884] hover:text-[#25d366]' : 'text-[#00a884] hover:text-[#008f6f]'
                }`}
              >
                Sign up
              </button>
            </p>
          </div>
        </form>

        {mode === 'switcher' && availableUsers.length > 0 && (
          <div className={`mt-6 pt-5 border-t ${isDark ? 'border-[#222d34]' : 'border-[#E8E3FA]'}`}>
            <div className="flex items-center justify-between mb-3">
              <span
                className={`text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5 ${
                  isDark ? 'text-[#8696a0]' : 'text-[#797196]'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>Select Account</span>
              </span>
              <button
                type="button"
                onClick={fetchAvailableUsers}
                disabled={fetchingUsers}
                className={`text-xs font-medium flex items-center gap-1 transition-colors disabled:opacity-50 ${
                  isDark ? 'text-[#00a884] hover:text-[#25d366]' : 'text-[#00a884] hover:text-[#008f6f]'
                }`}
              >
                {fetchingUsers && <Spinner size="sm" className="mr-0.5" />}
                <span>Refresh</span>
              </button>
            </div>

            <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto pr-1">
              {availableUsers.map((u) => {
                const isSelected = selectedUser?.id === u.id;
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => handleSelectUser(u)}
                    disabled={loading}
                    className={`w-full min-h-[44px] flex items-center justify-between p-2.5 rounded-xl border text-left transition-all group ${
                      isSelected
                        ? isDark
                          ? 'bg-[#202c33] border-[#00a884] ring-2 ring-[#00a884]/30'
                          : 'bg-[#d9fdd3] border-[#00a884] ring-2 ring-[#00a884]/20'
                        : isDark
                        ? 'bg-[#111b21] hover:bg-[#202c33] border-[#222d34]'
                        : 'bg-white hover:bg-[#F8F7FF] border-[#E8E3FA] hover:border-[#D5CCF5]'
                    } ${loading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Avatar name={u.name} avatar={u.avatar} size="sm" />
                      <span
                        className={`text-xs font-medium transition-colors ${
                          isDark
                            ? 'text-[#e9edef] group-hover:text-[#00a884]'
                            : 'text-[#1E1B2E] group-hover:text-[#00a884]'
                        }`}
                      >
                        {u.name}
                      </span>
                    </div>
                    <div>
                      {u.role === 'admin' ? (
                        <Badge
                          variant="purple"
                          size="sm"
                          className="gap-1 !bg-[#00a884]/20 !text-[#00a884] !border-[#00a884]/30"
                        >
                          <ShieldCheck className="w-3 h-3" /> Admin
                        </Badge>
                      ) : (
                        <Badge
                          variant="neutral"
                          size="sm"
                          className={`gap-1 ${
                            isDark ? '!bg-[#202c33] !text-[#8696a0] !border-[#2a3942]' : ''
                          }`}
                        >
                          <UserCheck className="w-3 h-3" /> User
                        </Badge>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
