'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { APP_CONFIG } from '@/lib/config';
import { User, Message } from '@/types';
import PasscodeModal from '@/components/PasscodeModal';
import BeautyWebsite from '@/components/BeautyWebsite';
import AdminDashboard from '@/components/AdminDashboard';
import ContactsSidebar from '@/components/ContactsSidebar';
import ChatWindow, { ChatMessageItem } from '@/components/ChatWindow';
import { Lock } from 'lucide-react';
import { Spinner } from '@/components/ui';
import { useTheme } from '@/context/ThemeContext';
import { encryptMessage, decryptMessage } from '@/lib/crypto';

type AppState = 'loading' | 'gate' | 'switcher' | 'authenticated' | 'disguise';

export default function HomePage() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [appState, setAppState] = useState<AppState>('loading');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [showAdminModal, setShowAdminModal] = useState(false);

  // Contacts and active conversation states
  const [users, setUsers] = useState<(User & { unreadCount?: number; lastMessage?: Message | null })[]>([]);
  const [activeContact, setActiveContact] = useState<User | null>(null);
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [isContactTyping, setIsContactTyping] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactsError, setContactsError] = useState<string | null>(null);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState<string | null>(null);

  // Mobile responsive layout: 'contacts' | 'conversation'
  const [mobileView, setMobileView] = useState<'contacts' | 'conversation'>('contacts');

  // Ref tracking current active conversation to prevent race conditions / stale updates
  const activeContactRef = useRef<User | null>(null);
  useEffect(() => {
    activeContactRef.current = activeContact;
  }, [activeContact]);

  const isPollingMessagesRef = useRef(false);
  const isPollingUsersRef = useRef(false);

  // Authenticate passcode via backend POST /api/auth/verify
  const handleLogin = useCallback(async (code: string): Promise<boolean> => {
    setAuthLoading(true);
    setAuthError(null);

    try {
      const res = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        setAuthError(data.error || 'Authentication failed. Please check your password.');
        return false;
      }

      // 1. Disguise Mode triggered (@1234)
      if (data.isDisguise) {
        if (typeof window !== 'undefined') {
          sessionStorage.setItem(APP_CONFIG.storageKeys.disguiseMode, 'true');
        }
        setAppState('disguise');
        return true;
      }

      // 2. Normal Successful Authentication
      if (data.success && data.user) {
        setCurrentUser(data.user);
        setAppState('authenticated');
        return true;
      }

      setAuthError('Unexpected response from authentication server.');
      return false;
    } catch {
      setAuthError('Network error while connecting to authentication service.');
      return false;
    } finally {
      setAuthLoading(false);
    }
  }, []);

  // Check server session on initial mount or process direct-link ?code=
  useEffect(() => {
    let isMounted = true;

    async function checkInitialSession() {
      // 1. Check if returning to Disguise Mode
      if (typeof window !== 'undefined') {
        const isDisguised = sessionStorage.getItem(APP_CONFIG.storageKeys.disguiseMode);
        if (isDisguised === 'true') {
          if (isMounted) setAppState('disguise');
          return;
        }

        // 2. Direct-Link Access via Client-Side Hash Fragment (#code=<passcode>)
        // Hash fragments are processed entirely by the browser and are NEVER transmitted
        // in HTTP request lines/headers, preventing credentials from appearing in server or CDN logs.
        let directCode: string | null = null;

        if (window.location.hash) {
          const hashContent = window.location.hash.replace(/^#/, '');
          const hashParams = new URLSearchParams(hashContent);
          directCode = hashParams.get('code') || (hashContent.startsWith('code=') ? hashContent.slice(5) : null);
        }

        // Backward compatibility fallback for legacy query parameters (?code=<passcode>)
        if (!directCode) {
          const searchParams = new URLSearchParams(window.location.search);
          directCode = searchParams.get('code');
        }

        if (directCode) {
          // Immediately purge credential from browser address bar and history
          const cleanUrl = window.location.pathname;
          window.history.replaceState(null, '', cleanUrl);

          const success = await handleLogin(directCode);
          if (!success && isMounted) {
            setAppState('gate');
          }
          return;
        }
      }

      // Always require password on initial page load / opening the link
      if (isMounted) {
        setAppState('gate');
      }
    }

    checkInitialSession();

    return () => {
      isMounted = false;
    };
  }, [handleLogin]);

  // Handle logout: invalidate server session & clear local state
  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Graceful logout
    }

    setCurrentUser(null);
    setActiveContact(null);
    setMessages([]);
    setAuthError(null);
    setShowAdminModal(false);
    setAppState('switcher');
    setMobileView('contacts');
  };

  // Exit disguise mode and return to gate
  const handleResetDisguise = () => {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(APP_CONFIG.storageKeys.disguiseMode);
    }
    setAppState('gate');
  };

  // -------------------------------------------------------------
  // Presence & Contacts Fetching
  // -------------------------------------------------------------
  const fetchUsers = useCallback(async () => {
    if (!currentUser || isPollingUsersRef.current) return;
    isPollingUsersRef.current = true;

    try {
      const activeContactIdParam = activeContactRef.current?.id || '';
      const url = `/api/users?userId=${encodeURIComponent(currentUser.id)}${
        activeContactIdParam ? `&activeContactId=${encodeURIComponent(activeContactIdParam)}` : ''
      }`;

      const res = await fetch(url, {
        method: 'GET',
        cache: 'no-store',
      });

      if (!res.ok) {
        if (res.status === 401) {
          handleLogout();
          return;
        }
        throw new Error('Failed to synchronize contacts');
      }

      const data = await res.json();
      if (data.users) {
        // Feature 5: Decrypt ciphertext for lastMessage preview in contacts list
        const decryptedUsers = await Promise.all(
          data.users.map(async (u: User & { lastMessage?: Message | null }) => {
            if (u.lastMessage?.text && u.lastMessage.text.startsWith('ENC:')) {
              const plain = await decryptMessage(u.lastMessage.text, u.lastMessage.senderId, u.lastMessage.receiverId);
              return { ...u, lastMessage: { ...u.lastMessage, text: plain } };
            }
            return u;
          })
        );

        setUsers(decryptedUsers);
        setContactsError(null);

        // Only update active contact status if one has already been explicitly selected by the user
        if (activeContactRef.current) {
          const fresh = data.users.find((u: User) => u.id === activeContactRef.current?.id);
          if (
            fresh &&
            (fresh.status !== activeContactRef.current.status ||
             fresh.typingTo !== activeContactRef.current.typingTo)
          ) {
            setActiveContact(fresh);
          }
        }
      }
    } catch {
      setContactsError('Could not sync contacts');
    } finally {
      isPollingUsersRef.current = false;
      setContactsLoading(false);
    }
  }, [currentUser]);

  // Presence heartbeat every 2 seconds
  useEffect(() => {
    if (appState !== 'authenticated' || !currentUser) return;

    // Trigger initial fetch asynchronously
    const initialTimer = setTimeout(() => {
      fetchUsers();
    }, 0);

    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        fetchUsers();
      }
    }, APP_CONFIG.polling.userPresenceIntervalMs);

    // Visibility change sync
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchUsers();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Send best-effort offline status on unload
    const handleBeforeUnload = () => {
      try {
        fetch('/api/users/status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: currentUser.id, status: 'offline' }),
          keepalive: true,
        });
      } catch {
        // Best effort
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [appState, currentUser, fetchUsers]);

  // -------------------------------------------------------------
  // Message Fetching & Polling
  // -------------------------------------------------------------
  const fetchMessages = useCallback(async (contactId: string) => {
    if (!currentUser || isPollingMessagesRef.current) return;
    isPollingMessagesRef.current = true;

    try {
      const url = `/api/messages?userId=${encodeURIComponent(currentUser.id)}&contactId=${encodeURIComponent(contactId)}`;
      const res = await fetch(url, {
        method: 'GET',
        cache: 'no-store',
      });

      if (!res.ok) {
        if (res.status === 401) {
          handleLogout();
          return;
        }
        throw new Error('Failed to fetch messages');
      }

      const data = await res.json();
      if (typeof data.isContactTyping === 'boolean') {
        setIsContactTyping(data.isContactTyping);
      }
      // Ensure responses are applied only to the active conversation
      if (activeContactRef.current?.id === contactId && Array.isArray(data.messages)) {
        // Feature 5: Seamless client-side decryption of E2EE ciphertext messages
        const decryptedList = await Promise.all(
          data.messages.map(async (m: Message) => {
            if (m.text && m.text.startsWith('ENC:')) {
              const plain = await decryptMessage(m.text, m.senderId, m.receiverId);
              return { ...m, text: plain };
            }
            return m;
          })
        );

        setMessages((prev) => {
          const now = Date.now();
          // Keep unsynced optimistic messages and very recent confirmed messages not yet present in server list
          const pendingUnsynced = prev.filter((p) => {
            const alreadyInServer = decryptedList.some(
              (m: Message) => m.id === p.id || (Boolean(p.idempotencyKey) && m.idempotencyKey === p.idempotencyKey)
            );
            if (alreadyInServer) return false;
            if (p.isOptimistic) return true;
            // Retain recent messages created by current user within the last 15s to bridge any replication gap
            const createdAtTime = new Date(p.createdAt).getTime();
            if (now - createdAtTime < 15000 && p.senderId === currentUser.id) {
              return true;
            }
            return false;
          });

          // Canonical messages from server with plaintext preservation
          const canonical = decryptedList.map((m: Message) => {
            const existing = prev.find(
              (p) => p.id === m.id || (Boolean(p.idempotencyKey) && Boolean(m.idempotencyKey) && p.idempotencyKey === m.idempotencyKey)
            );
            const preservedText =
              existing && existing.text && !existing.text.startsWith('ENC:')
                ? existing.text
                : m.text;
            return {
              ...m,
              text: preservedText,
              isOptimistic: false,
              failed: false,
            };
          });

          // Avoid unnecessary rerenders if message ids, read states, and content are identical
          const combined = [...canonical, ...pendingUnsynced];
          if (
            prev.length === combined.length &&
            prev.every(
              (msg, idx) =>
                msg.id === combined[idx]?.id &&
                msg.read === combined[idx]?.read &&
                msg.text === combined[idx]?.text &&
                msg.isOptimistic === combined[idx]?.isOptimistic &&
                msg.failed === combined[idx]?.failed
            )
          ) {
            return prev;
          }

          return combined;
        });

        // Trigger read status update if any incoming unread messages exist
        const hasUnreadIncoming = data.messages.some(
          (m: Message) => m.senderId === contactId && m.receiverId === currentUser.id && !m.read
        );
        if (hasUnreadIncoming) {
          fetch('/api/messages/read', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ senderId: contactId, receiverId: currentUser.id }),
          }).catch(() => {});
        }

        setMessagesError(null);
      }
    } catch {
      setMessagesError('Could not sync messages');
    } finally {
      isPollingMessagesRef.current = false;
      setMessagesLoading(false);
    }
  }, [currentUser]);

  // Poll conversation messages every 1 second when active
  useEffect(() => {
    if (appState !== 'authenticated' || !currentUser || !activeContact) {
      return;
    }

    const currentContactId = activeContact.id;
    const initialTimer = setTimeout(() => {
      fetchMessages(currentContactId);
    }, 0);

    const interval = setInterval(() => {
      if (
        typeof document !== 'undefined' &&
        document.visibilityState === 'visible' &&
        activeContactRef.current?.id === currentContactId
      ) {
        fetchMessages(currentContactId);
      }
    }, APP_CONFIG.polling.messageIntervalMs);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, [appState, currentUser, activeContact, fetchMessages]);

  // -------------------------------------------------------------
  // Send Message with Optimistic UI, Image Support & Idempotency Key
  // -------------------------------------------------------------
  const handleSendMessage = async (
    text: string,
    image?: string,
    video?: string,
    replyTo?: Message['replyTo'],
    existingIdempotencyKey?: string,
    existingTempId?: string,
    audio?: string
  ): Promise<boolean> => {
    if (!currentUser || !activeContact || (!text.trim() && !image && !video && !audio)) return false;

    const trimmedText = text.trim();
    const tempId = existingTempId || `opt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const idempotencyKey = existingIdempotencyKey || `idem_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    // Optimistic pending message (if not already in stream)
    const optimisticMessage: ChatMessageItem = {
      id: tempId,
      senderId: currentUser.id,
      receiverId: activeContact.id,
      text: trimmedText,
      image,
      video,
      audio,
      replyTo,
      createdAt: new Date().toISOString(),
      read: false,
      isOptimistic: true,
      failed: false,
      idempotencyKey,
    };

    if (!existingTempId) {
      setMessages((prev) => [...prev, optimisticMessage]);
    } else {
      // Clear failed flag when retrying
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, isOptimistic: true, failed: false } : m))
      );
    }

    try {
      // Feature 5: Scramble at rest with AES-GCM 256-bit E2EE before sending
      let textToSend = trimmedText;
      if (trimmedText) {
        textToSend = await encryptMessage(trimmedText, currentUser.id, activeContact.id);
      }

      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senderId: currentUser.id,
          receiverId: activeContact.id,
          text: textToSend || undefined,
          image: image || undefined,
          video: video || undefined,
          audio: audio || undefined,
          replyTo: replyTo || undefined,
          idempotencyKey,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success || !data.message) {
        throw new Error(data.error || 'Send failed');
      }

      const canonicalMessage: Message = data.message;

      // Reconcile: replace optimistic message with canonical server message (preserving plaintext)
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === tempId || (msg.idempotencyKey && msg.idempotencyKey === canonicalMessage.idempotencyKey)
            ? { ...canonicalMessage, text: trimmedText, isOptimistic: false, failed: false }
            : msg
        )
      );

      // Refresh contact list preview
      fetchUsers();
      return true;
    } catch {
      // Mark optimistic message as failed with preserved idempotencyKey
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === tempId ? { ...msg, isOptimistic: false, failed: true, idempotencyKey } : msg
        )
      );
      return false;
    }
  };

  // Retry sending failed message using its original idempotencyKey to prevent duplicate persistence
  const handleRetryMessage = async (
    failedMsgId: string,
    text: string,
    image?: string,
    video?: string,
    audio?: string
  ) => {
    const failedItem = messages.find((m) => m.id === failedMsgId);
    await handleSendMessage(
      text,
      image,
      video,
      failedItem?.replyTo,
      failedItem?.idempotencyKey,
      failedMsgId,
      audio
    );
  };

  // Handle toggling reaction on a message
  const handleReactToMessage = async (messageId: string, emoji: string) => {
    if (!currentUser) return;

    try {
      const res = await fetch('/api/messages/react', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId, emoji }),
      });

      if (!res.ok) {
        return;
      }

      const data = await res.json();
      if (data.success && data.message) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId ? { ...m, reactions: data.message.reactions } : m
          )
        );
      }
    } catch {
      // Graceful error handling
    }
  };

  // Handle clearing conversation history
  const handleClearChat = async (): Promise<boolean> => {
    if (!currentUser || !activeContact) return false;

    try {
      const res = await fetch('/api/messages/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUser.id,
          contactId: activeContact.id,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        return false;
      }

      // Reset visible messages and refresh contacts list preview
      setMessages([]);
      fetchUsers();
      return true;
    } catch {
      return false;
    }
  };

  // Handle deleting an individual message (optimistic instant removal)
  const handleDeleteMessage = async (
    messageId: string,
    mode: 'everyone' | 'forMe' = 'everyone'
  ): Promise<boolean> => {
    if (!currentUser) return false;

    // 1. Instant optimistic removal from UI with 0ms delay
    setMessages((prev) => prev.filter((m) => m.id !== messageId));

    try {
      const res = await fetch(
        `/api/messages?messageId=${encodeURIComponent(messageId)}&mode=${encodeURIComponent(mode)}`,
        {
          method: 'DELETE',
        }
      );

      const data = await res.json();
      if (!res.ok || !data.success) {
        return false;
      }

      fetchUsers();
      return true;
    } catch {
      return false;
    }
  };

  // Emergency Panic Button: switches immediately to Beauty and Joy disguise website for safety
  const handlePanic = useCallback(() => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(APP_CONFIG.storageKeys.disguiseMode, 'true');
    }
    setAppState('disguise');
  }, []);

  // Feature 3: Global Esc (Escape) key shortcut triggers disguise mode immediately from anywhere
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handlePanic();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, [handlePanic]);

  // Contact selection handler
  const handleSelectContact = (contact: User) => {
    setActiveContact(contact);
    setMobileView('conversation');
    setMessages([]); // Clear previous conversation history immediately to avoid flash of stale data
  };

  // 1. Initial Loading Screen
  if (appState === 'loading') {
    return (
      <main className={`min-h-screen flex flex-col items-center justify-center p-4 transition-colors duration-200 bg-[#F8F7FF] ${
        isDark ? '!bg-[#0c1317] text-[#e9edef]' : '!bg-[#f0f2f5] text-[#111b21]'
      }`}>
        <div className="flex flex-col items-center gap-4 text-center">
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-xs animate-pulse border ${
            isDark
              ? 'bg-[#202c33] border-[#2a3942] text-[#00a884]'
              : 'bg-white border-[#e9edef] text-[#00a884]'
          }`}>
            <Lock className="w-7 h-7" />
          </div>
          <div>
            <p className={`text-xs flex items-center justify-center gap-2 ${
              isDark ? 'text-[#8696a0]' : 'text-[#667781]'
            }`}>
              <Spinner size="sm" className="text-[#00a884]" />
              <span>Verifying secure session...</span>
            </p>
          </div>
        </div>
      </main>
    );
  }

  // 2. Disguise Mode Screen
  if (appState === 'disguise') {
    return <BeautyWebsite onReset={handleResetDisguise} />;
  }

  // 3. Passcode Gate Screen
  if (appState === 'gate') {
    return (
      <PasscodeModal
        mode="gate"
        onLogin={handleLogin}
        loading={authLoading}
        error={authError}
      />
    );
  }

  // 4. Account Switcher Screen (Post-Logout)
  if (appState === 'switcher') {
    return (
      <PasscodeModal
        mode="switcher"
        onLogin={handleLogin}
        loading={authLoading}
        error={authError}
      />
    );
  }

  // 5. Authenticated Core Messaging Layout (WhatsApp Coded Theme)
  return (
    <main className={`h-screen w-screen overflow-hidden flex transition-colors duration-200 bg-[#F8F7FF] ${
      isDark ? '!bg-[#0c1317] text-[#e9edef]' : '!bg-[#f0f2f5] text-[#111b21]'
    }`}>
      {currentUser && (
        <div className="flex w-full h-full">
          {/* Contacts Sidebar: Visible on desktop, or on mobile when view is 'contacts' */}
          <div
            className={`w-full md:w-80 lg:w-96 h-full flex-shrink-0 ${
              mobileView === 'conversation' ? 'hidden md:flex' : 'flex'
            }`}
          >
            <ContactsSidebar
              currentUser={currentUser}
              users={users}
              activeContact={activeContact}
              onSelectContact={handleSelectContact}
              onOpenAdmin={() => setShowAdminModal(true)}
              onLogout={handleLogout}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              loading={contactsLoading}
              error={contactsError}
              onRetry={fetchUsers}
            />
          </div>

          {/* Chat Window: Visible on desktop, or on mobile when view is 'conversation' */}
          <div
            className={`flex-1 h-full min-w-0 ${
              mobileView === 'contacts' ? 'hidden md:flex' : 'flex'
            }`}
          >
            {activeContact ? (
              <ChatWindow
                currentUser={currentUser}
                contact={activeContact}
                messages={messages}
                isContactTyping={isContactTyping}
                onSendMessage={handleSendMessage}
                onRetryMessage={handleRetryMessage}
                onReactToMessage={handleReactToMessage}
                onDeleteMessage={handleDeleteMessage}
                onClearChat={handleClearChat}
                onPanic={handlePanic}
                onBack={() => setMobileView('contacts')}
                loading={messagesLoading}
                error={messagesError}
              />
            ) : (
              <div className={`hidden md:flex flex-1 flex-col items-center justify-center p-8 text-center wa-chat-bg transition-colors duration-200 ${
                isDark ? 'bg-[#0b141a] text-[#8696a0]' : 'bg-[#efeae2] text-[#667781]'
              }`}>
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-4 shadow-xs border ${
                  isDark
                    ? 'bg-[#202c33] border-[#2a3942] text-[#00a884]'
                    : 'bg-white border-[#e9edef] text-[#00a884]'
                }`}>
                  <span className="text-3xl">💬</span>
                </div>
                <h2 className={`text-lg font-semibold mb-1 ${isDark ? 'text-[#e9edef]' : 'text-[#111b21]'}`}>
                  Select a contact to begin chatting
                </h2>
                <p className="text-xs max-w-sm leading-relaxed opacity-80">
                  Choose a contact from the sidebar to open conversation history and send direct messages in real-time.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Admin Dashboard Modal */}
      {showAdminModal && currentUser?.role === 'admin' && (
        <AdminDashboard
          onClose={() => {
            setShowAdminModal(false);
            fetchUsers();
          }}
          onSelectUserForChat={(user) => {
            setShowAdminModal(false);
            handleSelectContact(user);
            fetchUsers();
          }}
        />
      )}
    </main>
  );
}
