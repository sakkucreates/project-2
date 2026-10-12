'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { KeyRound, ShieldCheck, UserCheck, Eye, EyeOff, Lock, Users } from 'lucide-react';
import { User } from '@/types';
import { Button, Input, Card, Badge, Avatar, Spinner } from '@/components/ui';

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
  }, []);

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
    <div className="fixed inset-0 min-h-screen w-full flex items-center justify-center p-4 bg-[#F8F7FF] z-40">
      {/* Subtle decorative background gradient circles */}
      <div className="absolute top-1/4 -left-20 w-80 h-80 rounded-full bg-[#EDE9FE]/50 blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-20 w-80 h-80 rounded-full bg-[#E4DEFD]/40 blur-3xl pointer-events-none" />

      <Card
        variant="white"
        className="relative w-full max-w-md p-6 sm:p-8 border border-[#E8E3FA] shadow-xl shadow-[#4C3A8C]/5 z-10"
      >
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-[#EDE9FE] border border-[#D5CCF5] flex items-center justify-center text-[#7C5CFC] mb-3 shadow-sm transition-transform hover:scale-105">
            <Lock className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[#1E1B2E]">
            Login
          </h1>
          <p className="text-xs text-[#797196] mt-1.5 max-w-xs leading-relaxed">
            {mode === 'gate'
              ? 'Enter your password to sign in to your account.'
              : selectedUser
              ? `Enter password for ${selectedUser.name}`
              : 'Select an account below or enter your password to log in.'}
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
              className="block text-xs font-semibold text-[#4B4562] mb-1.5 text-left"
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
              leftIcon={<KeyRound className="w-4 h-4" />}
              rightIcon={
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label={showCode ? 'Hide password' : 'Show password'}
                  onClick={() => setShowCode(!showCode)}
                  className="p-1 text-[#797196] hover:text-[#4C3A8C] transition-colors focus:outline-none"
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
            className="w-full"
          >
            {loading ? (
              <>
                <Spinner size="sm" className="text-white mr-1.5" />
                <span>Logging in...</span>
              </>
            ) : (
              <span>Login</span>
            )}
          </Button>

          <div className="pt-2 text-center space-y-2">
            <div>
              <button
                type="button"
                onClick={() => alert('Please contact the administrator to retrieve or reset your password.')}
                className="text-xs text-[#7C5CFC] hover:text-[#6C4AE8] hover:underline transition-colors focus:outline-none"
              >
                Forgot Password?
              </button>
            </div>
            <p className="text-xs text-[#797196]">
              Don&apos;t have an account?{' '}
              <button
                type="button"
                onClick={() => alert('New accounts are created by the administrator in the Admin Dashboard.')}
                className="font-semibold text-[#7C5CFC] hover:text-[#6C4AE8] hover:underline transition-colors focus:outline-none"
              >
                Sign up
              </button>
            </p>
          </div>
        </form>

        {(mode === 'switcher' || availableUsers.length > 0) && (
          <div className="mt-6 pt-5 border-t border-[#E8E3FA]">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-[#797196] uppercase tracking-wider flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" />
                <span>Select Account</span>
              </span>
              <button
                type="button"
                onClick={fetchAvailableUsers}
                disabled={fetchingUsers}
                className="text-xs text-[#7C5CFC] hover:text-[#6C4AE8] font-medium flex items-center gap-1 transition-colors disabled:opacity-50"
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
                        ? 'bg-[#EDE9FE] border-[#7C5CFC]/60 ring-2 ring-[#7C5CFC]/20'
                        : 'bg-white hover:bg-[#F8F7FF] border-[#E8E3FA] hover:border-[#D5CCF5]'
                    } ${loading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Avatar name={u.name} avatar={u.avatar} size="sm" />
                      <span className="text-xs font-medium text-[#1E1B2E] group-hover:text-[#7C5CFC] transition-colors">
                        {u.name}
                      </span>
                    </div>
                    <div>
                      {u.role === 'admin' ? (
                        <Badge variant="purple" size="sm" className="gap-1">
                          <ShieldCheck className="w-3 h-3" /> Admin
                        </Badge>
                      ) : (
                        <Badge variant="neutral" size="sm" className="gap-1">
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
