/**
 * LumaChat Shared Type Definitions
 * Derived from ChatPass APP_BLUEPRINT.md specifications
 */

export type UserRole = 'admin' | 'user';
export type UserStatus = 'online' | 'offline';

export interface Reaction {
  emoji: string;
  userId: string;
}

export interface User {
  id: string;                    // "admin_root" or "usr_<random>"
  name: string;
  code: string;                  // Passcode used to log in (e.g. "0796", "@2021")
  role: UserRole;
  avatar: string;                // Emoji string
  status: UserStatus;            // Computed dynamically from lastSeen (<6s)
  lastSeen: string;              // ISO 8601 timestamp
  createdAt: string;             // ISO 8601 timestamp
  notes?: string;                // Admin-only internal notes
  unreadCount?: number;          // Aggregated unread count for sidebar contact list
  lastMessage?: Message | null;  // Latest message preview in sidebar
  typingTo?: string | null;      // ID of contact this user is currently typing to
}

export interface Message {
  id: string;                    // "msg_<random>_<timestamp>"
  senderId: string;
  receiverId: string;
  text: string;
  image?: string;                // Base64 data URI
  video?: string;                // Base64 data URI
  audio?: string;                // Base64 data URI for voice notes
  createdAt: string;             // ISO 8601 timestamp
  read: boolean;
  reactions?: Reaction[];
  idempotencyKey?: string;       // Client-generated deduplication key
  pinned?: boolean;
  starred?: boolean;
  replyTo?: {
    id: string;
    text?: string;
    senderName?: string;
  };
  deletedFor?: string[];         // User IDs who deleted this message for themselves
}

export interface DatabaseSchema {
  users: User[];
  messages: Message[];
  adminCode: string;
}

export interface ReactionsStore {
  [messageId: string]: Reaction[];
}

export interface AuthVerifyPayload {
  code: string;
}

export interface AuthVerifyResult {
  success: boolean;
  user?: User;
  error?: string;
  isDisguise?: boolean;
}

export interface AppMetadataConfig {
  name: string;
  shortName: string;
  tagline: string;
  description: string;
  version: string;
  adminRootId: string;
  defaultAdminCode: string;
  disguiseCode: string;
  defaultDisguiseUrl: string;
  storageKeys: {
    disguiseMode: string;
    linkUnlocked: string;
    userCode: string;
    messageCachePrefix: string;
  };
  polling: {
    messageIntervalMs: number;
    userPresenceIntervalMs: number;
    onlineThresholdMs: number;
    pendingReactionGuardMs: number;
  };
  limits: {
    maxImageSizeBytes: number;
    maxVideoSizeBytes: number;
  };
}
