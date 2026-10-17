'use client';

import React from 'react';
import { Search, Shield, LogOut, MessageSquarePlus } from 'lucide-react';
import { User, Message } from '@/types';
import { Avatar, Badge, Spinner } from '@/components/ui';
import { formatConversationTimestamp } from '@/lib/dateUtils';

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
  // Filter contacts: ALWAYS exclude current user from their own contact list; search by display name only
  const filteredUsers = users.filter(
    (u) =>
      u.id !== currentUser.id &&
      u.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <aside className="w-full md:w-80 lg:w-96 h-full flex flex-col bg-white border-r border-[#E8E3FA] select-none shadow-sm">
      {/* Top Header */}
      <div className="h-16 px-4 flex items-center justify-between bg-white border-b border-[#E8E3FA]">
        <div className="flex items-center gap-3 min-w-0">
          <Avatar
            name={currentUser.name}
            avatar={currentUser.avatar}
            size="md"
            isOnline={true}
          />
          <div className="min-w-0">
            <div className="text-sm font-semibold text-[#1E1B2E] truncate flex items-center gap-1.5">
              <span className="truncate">{currentUser.name}</span>
              {currentUser.role === 'admin' && (
                <Badge variant="purple" size="sm">
                  Admin
                </Badge>
              )}
            </div>
            <div className="text-[11px] text-[#10B981] font-medium flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />
              <span>Online</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          {currentUser.role === 'admin' && (
            <button
              onClick={onOpenAdmin}
              title="Admin Control Center"
              aria-label="Admin Control Center"
              className="p-2 text-[#797196] hover:text-[#7C5CFC] hover:bg-[#EDE9FE]/50 rounded-xl transition-colors"
            >
              <Shield className="w-5 h-5" />
            </button>
          )}
          <button
            onClick={onLogout}
            title="Log Out"
            aria-label="Log Out"
            className="p-2 text-[#797196] hover:text-[#EF4444] hover:bg-[#FEF2F2] rounded-xl transition-colors"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Search Input Bar */}
      <div className="p-3 bg-[#F8F7FF] border-b border-[#E8E3FA]">
        <div className="relative">
          <Search className="w-4 h-4 text-[#797196] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Search contacts..."
            aria-label="Search contacts"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-white border border-[#DCD6F7] rounded-xl text-xs text-[#1E1B2E] placeholder-[#9E96BE] focus:outline-none focus:border-[#7C5CFC] focus:ring-2 focus:ring-[#7C5CFC]/20 transition-all shadow-sm"
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
      <div className="flex-1 overflow-y-auto divide-y divide-[#E8E3FA]/60">
        {loading && users.length === 0 ? (
          <div className="h-48 flex flex-col items-center justify-center text-center p-6 text-[#797196]">
            <Spinner size="md" className="mb-2" />
            <p className="text-xs">Loading conversations...</p>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="h-48 flex flex-col items-center justify-center text-center p-6 text-[#797196]">
            <MessageSquarePlus className="w-8 h-8 mb-2 stroke-1 text-[#8E82B2]" />
            <p className="text-xs font-medium">
              {searchQuery ? 'No matching contacts found.' : 'No conversations found.'}
            </p>
            {currentUser.role === 'admin' && !searchQuery && (
              <button
                onClick={onOpenAdmin}
                className="mt-3 text-xs text-[#7C5CFC] font-semibold hover:underline"
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
                    ? 'bg-[#EDE9FE] border-l-4 border-l-[#7C5CFC]'
                    : 'hover:bg-[#F8F7FF]'
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
                        isSelected ? 'text-[#4C3A8C]' : 'text-[#1E1B2E]'
                      }`}
                    >
                      {user.name}
                    </span>
                    {user.lastMessage && (
                      <span className="text-[10px] text-[#797196] flex-shrink-0 ml-1">
                        {formatConversationTimestamp(user.lastMessage.createdAt)}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between mt-0.5">
                    <p className="text-xs text-[#797196] truncate pr-2">
                      {user.lastMessage?.text || (user.lastMessage?.image ? '📷 Photo' : 'No messages yet')}
                    </p>
                    {Boolean(user.unreadCount && user.unreadCount > 0) && (
                      <span className="min-w-4 h-4 px-1.5 rounded-full bg-[#7C5CFC] text-white font-bold text-[10px] flex items-center justify-center flex-shrink-0 shadow-sm">
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
