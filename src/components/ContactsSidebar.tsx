'use client';

import React from 'react';
import { Search, Shield, LogOut, MessageSquarePlus, Sun, Moon } from 'lucide-react';
import { User, Message } from '@/types';
import { Avatar, Spinner } from '@/components/ui';
import { formatConversationTimestamp } from '@/lib/dateUtils';
import { useTheme } from '@/context/ThemeContext';

export interface ContactsSidebarProps {
  currentUser: User;
  users: (User & { unreadCount?: number; lastMessage?: Message | null })[];
  activeContact: User | null;
  onSelectContact: (user: User) => void;
  onOpenAdmin: () => void;
  onLogout: () => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

export default function ContactsSidebar({
  currentUser,
  users,
  activeContact,
  onSelectContact,
  onOpenAdmin,
  onLogout,
  searchQuery,
  setSearchQuery,
  loading = false,
  error = null,
  onRetry,
}: ContactsSidebarProps) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  // Filter contacts: ALWAYS exclude current user from their own contact list; search by display name only
  const filteredUsers = users.filter(
    (u) =>
      u.id !== currentUser.id &&
      u.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <aside
      className={`w-full md:w-80 lg:w-96 h-full flex flex-col select-none transition-colors duration-200 ${
        isDark
          ? 'bg-[#111b21] border-r border-[#222d34]'
          : 'bg-white border-r border-[#e9edef]'
      }`}
    >
      {/* Top Header */}
      <div
        className={`h-16 px-4 flex items-center justify-between border-b transition-colors duration-200 ${
          isDark
            ? 'bg-[#202c33] border-[#222d34] text-[#e9edef]'
            : 'bg-[#f0f2f5] border-[#d1d7db] text-[#111b21]'
        }`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <Avatar
            name={currentUser.name}
            avatar={currentUser.avatar}
            size="md"
            isOnline={true}
          />
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate flex items-center gap-1.5">
              <span className={`truncate ${isDark ? 'text-[#e9edef]' : 'text-[#111b21]'}`}>
                {currentUser.name}
              </span>
              {currentUser.role === 'admin' && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-md font-semibold bg-[#00a884]/20 text-[#00a884] border border-[#00a884]/30">
                  Admin
                </span>
              )}
            </div>
            <div className="text-[11px] text-[#00a884] font-medium flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#00a884]" />
              <span>Online</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Theme Toggle Button */}
          <button
            onClick={toggleTheme}
            title={isDark ? 'Switch to WhatsApp Light' : 'Switch to WhatsApp Dark'}
            aria-label={isDark ? 'Switch to WhatsApp Light' : 'Switch to WhatsApp Dark'}
            className={`p-2 rounded-xl transition-colors ${
              isDark
                ? 'text-[#aebac1] hover:text-[#00a884] hover:bg-[#111b21]'
                : 'text-[#54656f] hover:text-[#008069] hover:bg-[#e9edef]'
            }`}
          >
            {isDark ? (
              <Sun className="w-5 h-5 text-[#f59e0b] hover:scale-110 transition-transform" />
            ) : (
              <Moon className="w-5 h-5 text-[#54656f] hover:scale-110 transition-transform" />
            )}
          </button>

          {currentUser.role === 'admin' && (
            <button
              onClick={onOpenAdmin}
              title="Admin Control Center"
              aria-label="Admin Control Center"
              className={`p-2 rounded-xl transition-colors ${
                isDark
                  ? 'text-[#aebac1] hover:text-[#00a884] hover:bg-[#111b21]'
                  : 'text-[#54656f] hover:text-[#008069] hover:bg-[#e9edef]'
              }`}
            >
              <Shield className="w-5 h-5" />
            </button>
          )}
          <button
            onClick={onLogout}
            title="Log Out"
            aria-label="Log Out"
            className={`p-2 rounded-xl transition-colors ${
              isDark
                ? 'text-[#aebac1] hover:text-[#ef4444] hover:bg-[#111b21]'
                : 'text-[#54656f] hover:text-[#ef4444] hover:bg-[#fee2e2]'
            }`}
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Search Input Bar */}
      <div
        className={`p-3 border-b transition-colors duration-200 ${
          isDark
            ? 'bg-[#111b21] border-[#222d34]'
            : 'bg-white border-[#e9edef]'
        }`}
      >
        <div className="relative">
          <Search
            className={`w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none ${
              isDark ? 'text-[#8696a0]' : 'text-[#667781]'
            }`}
          />
          <input
            type="text"
            placeholder="Search contacts..."
            aria-label="Search contacts"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`w-full pl-9 pr-3 py-2 rounded-xl text-xs transition-all shadow-xs outline-none ${
              isDark
                ? 'bg-[#202c33] text-[#e9edef] placeholder-[#8696a0] border border-[#2a3942] focus:border-[#00a884] focus:ring-1 focus:ring-[#00a884]'
                : 'bg-[#f0f2f5] text-[#111b21] placeholder-[#8696a0] border border-[#e9edef] focus:border-[#00a884] focus:ring-1 focus:ring-[#00a884]'
            }`}
          />
        </div>
      </div>

      {/* Recoverable Error Banner */}
      {error && (
        <div className="p-3 bg-[#FEF2F2] border-b border-[#FECACA] flex items-center justify-between text-xs text-[#991B1B]">
          <span className="truncate">{error}</span>
          {onRetry && (
            <button
              onClick={onRetry}
              className="ml-2 font-semibold underline hover:text-[#EF4444] flex-shrink-0"
            >
              Retry
            </button>
          )}
        </div>
      )}

      {/* Contacts List Area */}
      <div className={`flex-1 overflow-y-auto divide-y ${isDark ? 'divide-[#222d34]/70' : 'divide-[#e9edef]/80'}`}>
        {loading && users.length === 0 ? (
          <div className={`h-48 flex flex-col items-center justify-center text-center p-6 ${isDark ? 'text-[#8696a0]' : 'text-[#667781]'}`}>
            <Spinner size="md" className="mb-2 text-[#00a884]" />
            <p className="text-xs">Loading conversations...</p>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className={`h-48 flex flex-col items-center justify-center text-center p-6 ${isDark ? 'text-[#8696a0]' : 'text-[#667781]'}`}>
            <MessageSquarePlus className="w-8 h-8 mb-2 stroke-1 text-[#00a884]" />
            <p className="text-xs font-medium">
              {searchQuery ? 'No matching contacts found.' : 'No conversations found.'}
            </p>
            {currentUser.role === 'admin' && !searchQuery && (
              <button
                onClick={onOpenAdmin}
                className="mt-3 text-xs text-[#00a884] font-semibold hover:underline"
              >
                Create user in Admin Center
              </button>
            )}
          </div>
        ) : (
          filteredUsers.map((user) => {
            const isSelected = activeContact?.id === user.id;
            return (
              <button
                key={user.id}
                onClick={() => onSelectContact(user)}
                data-selected={isSelected}
                className={`w-full min-h-[56px] p-3.5 flex items-center gap-3 transition-all text-left group ${
                  isSelected
                    ? isDark
                      ? 'bg-[#2a3942] border-l-4 border-l-[#00a884]'
                      : 'bg-[#f0f2f5] border-l-4 border-l-[#00a884]'
                    : isDark
                      ? 'hover:bg-[#202c33]'
                      : 'hover:bg-[#f5f6f6]'
                }`}
              >
                <Avatar
                  name={user.name}
                  avatar={user.avatar}
                  size="md"
                  isOnline={user.status === 'online'}
                  className="flex-shrink-0"
                />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-sm font-semibold truncate ${
                        isDark ? 'text-[#e9edef]' : 'text-[#111b21]'
                      }`}
                    >
                      {user.name}
                    </span>
                    {user.lastMessage && (
                      <span className={`text-[10px] flex-shrink-0 ml-1 ${isDark ? 'text-[#8696a0]' : 'text-[#667781]'}`}>
                        {formatConversationTimestamp(user.lastMessage.createdAt)}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between mt-0.5">
                    <p className={`text-xs truncate pr-2 ${isDark ? 'text-[#8696a0]' : 'text-[#667781]'}`}>
                      {user.lastMessage?.text ||
                        (user.lastMessage?.image
                          ? '📷 Photo'
                          : user.lastMessage?.video
                          ? '🎥 Video'
                          : 'No messages yet')}
                    </p>
                    {Boolean(user.unreadCount && user.unreadCount > 0) && (
                      <span className="min-w-4 h-4 px-1.5 rounded-full bg-[#00a884] text-white font-bold text-[10px] flex items-center justify-center flex-shrink-0 shadow-xs">
                        {user.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}
