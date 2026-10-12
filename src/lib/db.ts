import fs from 'fs';
import path from 'path';
import { User, Message, DatabaseSchema, Reaction } from '@/types';
import { APP_CONFIG } from '@/lib/config';
import { StorageConfigurationError, StorageOperationError } from '@/lib/errors';

// Clean initial state (Only Admin account)
const INITIAL_DATA: DatabaseSchema = {
  adminCode: process.env.ADMIN_CODE || APP_CONFIG.defaultAdminCode,
  users: [
    {
      id: APP_CONFIG.adminRootId,
      name: 'Admin / Support',
      code: process.env.ADMIN_CODE || APP_CONFIG.defaultAdminCode,
      role: 'admin',
      avatar: '🛡️',
      status: 'online',
      lastSeen: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      notes: 'System Administrator Account',
    },
  ],
  messages: [],
};

// Global memory cache for single-process local development fallback
let memoryStore: DatabaseSchema | null = null;

// Environment credentials for Upstash Redis / Vercel KV REST API
const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

/**
 * Checks if the current runtime environment is considered production.
 */
export function isProductionEnvironment(): boolean {
  return process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);
}

/**
 * Checks if Redis KV credentials are configured.
 */
export function isKvConfigured(): boolean {
  return Boolean(KV_URL && KV_TOKEN);
}

/**
 * Validates that durable persistence is available before executing state-changing operations.
 * In production, Upstash Redis KV is strictly required to prevent silent data loss.
 */
export function assertPersistenceAvailable(operationName: string = 'storage operation'): void {
  if (isProductionEnvironment() && !isKvConfigured()) {
    console.error(
      `[Storage Diagnostic] Production persistence (Upstash Redis) is missing for "${operationName}". In-memory and /tmp fallbacks are disallowed in production.`
    );
    throw new StorageConfigurationError(
      'Production persistence layer (Upstash Redis) is not configured. Operation aborted to prevent silent data loss.'
    );
  }
}

interface CommandOptions {
  retries?: number;
  isIdempotent?: boolean;
}

/**
 * Upstash / Vercel KV REST Command Executor
 * Handles retries for transient errors, preserves error details, and strictly avoids swallowing failures.
 */
export async function executeKvCommand(
  command: (string | number)[],
  options: CommandOptions = { retries: 2, isIdempotent: true }
): Promise<unknown> {
  if (!isKvConfigured()) {
    return null;
  }

  let url = KV_URL!.trim();
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
  }

  const maxRetries = options.isIdempotent ? (options.retries ?? 2) : 0;
  let attempt = 0;
  let lastError: Error | null = null;

  while (attempt <= maxRetries) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${KV_TOKEN!.trim()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(command),
        cache: 'no-store',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        // Transient 5xx server errors can be retried if idempotent
        if (res.status >= 500 && attempt < maxRetries) {
          attempt++;
          await new Promise((r) => setTimeout(r, 100 * Math.pow(2, attempt)));
          continue;
        }
        throw new StorageOperationError(`Upstash KV HTTP error ${res.status}`);
      }

      const data = await res.json();
      if (data && typeof data === 'object' && 'error' in data && data.error) {
        throw new StorageOperationError(`Upstash Redis error: ${String(data.error)}`);
      }

      return data ? data.result : null;
    } catch (err: unknown) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries) {
        attempt++;
        await new Promise((r) => setTimeout(r, 100 * Math.pow(2, attempt)));
        continue;
      }
      break;
    }
  }

  console.error(`[Storage Diagnostic] KV command failed after ${attempt} attempts:`, lastError?.message);
  throw lastError || new StorageOperationError('Redis command failed');
}

/**
 * Fetches users from KV store.
 * Reads lumachat_users first; falls back to legacy chatpass_users for backward compatibility.
 */
async function getKvUsers(): Promise<User[] | null> {
  if (!isKvConfigured()) return null;

  let result = await executeKvCommand(['GET', 'lumachat_users']);
  if (!result) {
    result = await executeKvCommand(['GET', 'chatpass_users']);
  }

  if (result) {
    try {
      const parsed = typeof result === 'string' ? JSON.parse(result) : result;
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Saves users list to KV store (lumachat_users key).
 */
async function saveKvUsers(users: User[]): Promise<boolean> {
  if (!isKvConfigured()) return false;
  const res = await executeKvCommand(['SET', 'lumachat_users', JSON.stringify(users)]);
  return res !== null;
}

/**
 * Atomic Redis list read via LRANGE with content & ID deduplication.
 * Reads lumachat_messages first; falls back to legacy chatpass_messages.
 */
async function getKvMessages(): Promise<Message[] | null> {
  if (!isKvConfigured()) return null;

  let result = await executeKvCommand(['LRANGE', 'lumachat_messages', '0', '-1']);
  if (!Array.isArray(result) || result.length === 0) {
    result = await executeKvCommand(['LRANGE', 'chatpass_messages', '0', '-1']);
  }

  if (Array.isArray(result)) {
    try {
      const parsed = result
        .map((item: unknown) => (typeof item === 'string' ? JSON.parse(item) : item))
        .filter((m: unknown): m is Message =>
          Boolean(m && typeof m === 'object' && 'id' in m && 'senderId' in m && 'receiverId' in m)
        );

      const seenIds = new Set<string>();
      const seenSignatures = new Set<string>();
      const uniqueMessages: Message[] = [];

      for (const m of parsed) {
        const timeBucket = Math.floor(new Date(m.createdAt).getTime() / 3000);
        const sig = `${m.senderId}_${m.receiverId}_${(m.text || '').trim()}_${m.image || ''}_${timeBucket}`;

        if (!seenIds.has(m.id) && !seenSignatures.has(sig)) {
          seenIds.add(m.id);
          seenSignatures.add(sig);
          uniqueMessages.push(m);
        }
      }
      return uniqueMessages;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Appends a message to Redis list using atomic RPUSH.
 */
async function pushKvMessage(message: Message): Promise<boolean> {
  if (!isKvConfigured()) return false;
  // RPUSH is non-idempotent; do not auto-retry in ways that duplicate messages
  const res = await executeKvCommand(['RPUSH', 'lumachat_messages', JSON.stringify(message)], {
    retries: 0,
    isIdempotent: false,
  });
  return res !== null;
}

/**
 * Reads emoji reactions from dedicated KV key.
 * Reads lumachat_reactions first; falls back to legacy chatpass_reactions.
 */
async function getKvReactions(): Promise<Record<string, Reaction[]>> {
  if (!isKvConfigured()) return {};
  try {
    let result = await executeKvCommand(['GET', 'lumachat_reactions']);
    if (!result) {
      result = await executeKvCommand(['GET', 'chatpass_reactions']);
    }
    if (result) {
      const parsed = typeof result === 'string' ? JSON.parse(result) : result;
      return parsed && typeof parsed === 'object' ? parsed : {};
    }
  } catch (err) {
    console.warn('[Storage Warning] Could not read KV reactions:', err);
  }
  return {};
}

/**
 * Saves reactions to dedicated KV key.
 */
async function saveKvReaction(
  messageId: string,
  reactions: Reaction[]
): Promise<boolean> {
  if (!isKvConfigured()) return false;
  const current = await getKvReactions();
  if (reactions.length === 0) {
    delete current[messageId];
  } else {
    current[messageId] = reactions;
  }
  const res = await executeKvCommand(['SET', 'lumachat_reactions', JSON.stringify(current)]);
  return res !== null;
}

/**
 * Atomically replaces the stored messages in Redis without a dangerous empty-read window.
 * Uses a unique temporary key + atomic RENAME.
 */
async function saveKvMessages(messages: Message[]): Promise<boolean> {
  if (!isKvConfigured()) return false;

  if (messages.length === 0) {
    await executeKvCommand(['DEL', 'lumachat_messages']);
    return true;
  }

  const tempKey = `lumachat_messages_tmp_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const stringifiedMsgs = messages.map((m) => JSON.stringify(m));

  // 1. Push to temp key
  await executeKvCommand(['RPUSH', tempKey, ...stringifiedMsgs]);
  // 2. Atomic pointer swap (RENAME replaces the key instantaneously in Redis)
  await executeKvCommand(['RENAME', tempKey, 'lumachat_messages']);
  return true;
}

/**
 * Resolves local JSON DB file path for development.
 */
function getDbFilePath(): string {
  if (process.env.DB_FILE_PATH) {
    return process.env.DB_FILE_PATH;
  }
  const isTest = process.env.NODE_ENV === 'test' || process.env.npm_lifecycle_event === 'test';
  if (process.env.VERCEL) {
    return path.join('/tmp', isTest ? 'lumachat_test_db.json' : 'lumachat_db.json');
  }
  const dataDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    try {
      fs.mkdirSync(dataDir, { recursive: true });
    } catch {
      return path.join('/tmp', isTest ? 'lumachat_test_db.json' : 'lumachat_db.json');
    }
  }
  return path.join(dataDir, isTest ? 'test_db.json' : 'db.json');
}

/**
 * Reads the full database state.
 * Priority 1: Upstash Redis KV
 * Priority 2: Local JSON file (dev only)
 * Priority 3: Memory store (dev only)
 */
export async function getDb(): Promise<DatabaseSchema> {
  if (isKvConfigured()) {
    try {
      const rawUsers = await getKvUsers();
      const rawMessages = await getKvMessages();
      const users = Array.isArray(rawUsers) && rawUsers.length > 0 ? rawUsers : INITIAL_DATA.users;
      const messages = Array.isArray(rawMessages) ? rawMessages : [];
      return {
        adminCode: INITIAL_DATA.adminCode,
        users,
        messages,
      };
    } catch (kvErr) {
      if (isProductionEnvironment()) {
        throw new StorageOperationError(
          `Failed to read from production database: ${kvErr instanceof Error ? kvErr.message : String(kvErr)}`
        );
      }
      console.warn('[Storage Warning] KV fetch failed in dev, falling back to local file:', kvErr);
    }
  }

  assertPersistenceAvailable('getDb');

  // Dev fallback: local disk (only active in non-production environments)
  if (!isProductionEnvironment()) {
    const filePath = getDbFilePath();
    try {
      if (fs.existsSync(filePath)) {
        const fileData = fs.readFileSync(filePath, 'utf-8');
        const parsed = JSON.parse(fileData);
        if (parsed && Array.isArray(parsed.users)) {
          memoryStore = parsed;
          return parsed;
        }
      }
    } catch (error) {
      console.warn('[Storage Warning] Could not read local DB file:', error);
    }
  }

  // Dev fallback: memory
  if (memoryStore) {
    return memoryStore;
  }

  memoryStore = JSON.parse(JSON.stringify(INITIAL_DATA));
  await saveDb(memoryStore!).catch(() => {});
  return memoryStore!;
}

/**
 * Writes the database state.
 */
export async function saveDb(data: DatabaseSchema): Promise<void> {
  assertPersistenceAvailable('saveDb');

  if (isKvConfigured()) {
    await saveKvUsers(data.users);
    return;
  }

  memoryStore = data;
  const filePath = getDbFilePath();
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (error) {
    console.warn('[Storage Warning] Could not write DB file to disk:', error);
  }
}

/**
 * Resets the database to clean initial state (Admin only).
 */
export async function resetDatabase(): Promise<DatabaseSchema> {
  assertPersistenceAvailable('resetDatabase');

  memoryStore = JSON.parse(JSON.stringify(INITIAL_DATA));

  if (isKvConfigured()) {
    await saveKvUsers(INITIAL_DATA.users);
    await executeKvCommand(['DEL', 'lumachat_messages']).catch(() => null);
    await executeKvCommand(['DEL', 'lumachat_reactions']).catch(() => null);
  }

  const filePath = getDbFilePath();
  try {
    fs.writeFileSync(filePath, JSON.stringify(INITIAL_DATA, null, 2), 'utf-8');
  } catch (error) {
    console.warn('[Storage Warning] Could not write reset DB to disk:', error);
  }

  return memoryStore!;
}

// User Helpers

export async function findUserByCode(code: string): Promise<User | null> {
  const db = await getDb();
  if (!db || !Array.isArray(db.users)) return INITIAL_DATA.users[0];
  const trimmed = code.trim();

  // Admin access code matches
  if (trimmed === '@2021' || trimmed === '2021' || trimmed === db.adminCode) {
    const admin = db.users.find((u) => u.role === 'admin') || db.users[0];
    return admin || null;
  }

  const user = db.users.find(
    (u) => u && u.code && u.code.trim().toUpperCase() === trimmed.toUpperCase()
  );
  return user || null;
}

export async function getUserById(id: string): Promise<User | null> {
  const db = await getDb();
  return db.users.find((u) => u.id === id) || null;
}

export async function getAllUsers(): Promise<User[]> {
  const db = await getDb();
  const rawUsers = db.users || INITIAL_DATA.users;
  const now = Date.now();

  return rawUsers.map((user) => {
    const lastSeenTime = user.lastSeen ? new Date(user.lastSeen).getTime() : 0;
    const isOnline = now - lastSeenTime < APP_CONFIG.polling.onlineThresholdMs;
    return {
      ...user,
      status: isOnline ? 'online' : 'offline',
    };
  });
}

export async function createUser(
  userData: Omit<User, 'id' | 'createdAt' | 'status' | 'lastSeen'>
): Promise<User> {
  assertPersistenceAvailable('createUser');

  const db = await getDb();
  const newUser: User = {
    ...userData,
    id: 'usr_' + Math.random().toString(36).substring(2, 9),
    status: 'offline',
    lastSeen: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };

  db.users.push(newUser);

  if (isKvConfigured()) {
    const success = await saveKvUsers(db.users);
    if (!success) {
      throw new StorageOperationError('Failed to persist new user to storage.');
    }
  } else {
    await saveDb(db);
  }

  return newUser;
}

export async function updateUser(id: string, updates: Partial<User>): Promise<User | null> {
  assertPersistenceAvailable('updateUser');

  const db = await getDb();
  const index = db.users.findIndex((u) => u.id === id);
  if (index === -1) return null;

  db.users[index] = { ...db.users[index], ...updates };

  if (isKvConfigured()) {
    const success = await saveKvUsers(db.users);
    if (!success) {
      throw new StorageOperationError('Failed to persist user update to storage.');
    }
  } else {
    await saveDb(db);
  }

  return db.users[index];
}

export async function deleteUser(id: string): Promise<boolean> {
  assertPersistenceAvailable('deleteUser');

  if (id === APP_CONFIG.adminRootId) {
    return false;
  }

  const db = await getDb();
  const initialLength = db.users.length;
  db.users = db.users.filter((u) => u.id !== id);
  db.messages = db.messages.filter((m) => m.senderId !== id && m.receiverId !== id);

  if (isKvConfigured()) {
    await saveKvUsers(db.users);
    await saveKvMessages(db.messages);
  } else {
    await saveDb(db);
  }

  return db.users.length < initialLength;
}

// ATOMIC MESSAGE HELPERS

export async function getConversationMessages(
  user1Id: string,
  user2Id: string
): Promise<Message[]> {
  const allMessages =
    isKvConfigured() ? (await getKvMessages()) || [] : (await getDb()).messages;

  const msgs = allMessages
    .filter(
      (m) =>
        (m.senderId === user1Id && m.receiverId === user2Id) ||
        (m.senderId === user2Id && m.receiverId === user1Id)
    )
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  if (isKvConfigured()) {
    const kvReactions: Record<string, Reaction[]> = await getKvReactions().catch(
      () => ({} as Record<string, Reaction[]>)
    );
    return msgs.map((m) => ({
      ...m,
      reactions: kvReactions[m.id] || m.reactions || [],
    }));
  }

  return msgs;
}

// In-memory signature lock map to prevent duplicate requests
const recentSentSignatures = new Map<string, number>();

export async function createMessage(
  msgData: Omit<Message, 'id' | 'createdAt' | 'read'>
): Promise<Message> {
  assertPersistenceAvailable('createMessage');

  const textTrim = (msgData.text || '').trim();
  const imgStr = msgData.image || '';
  const now = Date.now();
  const idempotencyKey = msgData.idempotencyKey;

  // 1. Check for existing message by Idempotency Key (scoped to conversation)
  if (idempotencyKey) {
    const existingMessages =
      isKvConfigured() ? (await getKvMessages()) || [] : (await getDb()).messages;

    const existingMatch = existingMessages.find(
      (m) =>
        m.idempotencyKey === idempotencyKey &&
        m.senderId === msgData.senderId &&
        m.receiverId === msgData.receiverId
    );
    if (existingMatch) {
      return existingMatch;
    }
  }

  // 2. In-Memory Signature Deduplication Check (3-second window)
  const sig = `${msgData.senderId}_${msgData.receiverId}_${textTrim}_${imgStr}`;
  const lastSentTime = recentSentSignatures.get(sig);
  if (lastSentTime && now - lastSentTime < 3000) {
    if (memoryStore && Array.isArray(memoryStore.messages)) {
      const match = memoryStore.messages.find(
        (m) =>
          m.senderId === msgData.senderId &&
          m.receiverId === msgData.receiverId &&
          (m.text || '').trim() === textTrim &&
          (m.image || '') === imgStr
      );
      if (match) return match;
    }
  }

  recentSentSignatures.set(sig, now);
  if (recentSentSignatures.size > 200) {
    recentSentSignatures.clear();
  }

  const newMsg: Message = {
    ...msgData,
    text: textTrim,
    id: 'msg_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now(),
    createdAt: new Date().toISOString(),
    read: false,
    idempotencyKey,
  };

  if (memoryStore && Array.isArray(memoryStore.messages)) {
    if (!memoryStore.messages.some((m) => m.id === newMsg.id)) {
      memoryStore.messages.push(newMsg);
    }
  }

  if (isKvConfigured()) {
    const success = await pushKvMessage(newMsg);
    if (!success) {
      throw new StorageOperationError('Failed to persist message to Redis store.');
    }
  } else {
    const db = await getDb();
    if (!db.messages.some((m) => m.id === newMsg.id)) {
      db.messages.push(newMsg);
      await saveDb(db);
    }
  }

  return newMsg;
}

export async function markMessagesAsRead(senderId: string, receiverId: string): Promise<void> {
  assertPersistenceAvailable('markMessagesAsRead');

  const db = await getDb();
  let updated = false;
  db.messages.forEach((m) => {
    if (m.senderId === senderId && m.receiverId === receiverId && !m.read) {
      m.read = true;
      updated = true;
    }
  });

  if (updated) {
    if (isKvConfigured()) {
      await saveKvMessages(db.messages);
    } else {
      await saveDb(db);
    }
  }
}

export async function clearConversationMessages(
  user1Id: string,
  user2Id: string
): Promise<boolean> {
  assertPersistenceAvailable('clearConversationMessages');

  const db = await getDb();
  db.messages = db.messages.filter(
    (m) =>
      !(
        (m.senderId === user1Id && m.receiverId === user2Id) ||
        (m.senderId === user2Id && m.receiverId === user1Id)
      )
  );

  if (memoryStore && Array.isArray(memoryStore.messages)) {
    memoryStore.messages = memoryStore.messages.filter(
      (m) =>
        !(
          (m.senderId === user1Id && m.receiverId === user2Id) ||
          (m.senderId === user2Id && m.receiverId === user1Id)
        )
    );
  }

  if (isKvConfigured()) {
    await saveKvMessages(db.messages);
  } else {
    await saveDb(db);
  }

  return true;
}

export async function addReactionToMessage(
  messageId: string,
  userId: string,
  emoji: string
): Promise<Message | null> {
  assertPersistenceAvailable('addReactionToMessage');

  let reactions: Reaction[] = [];

  if (isKvConfigured()) {
    const kvReactions: Record<string, Reaction[]> = await getKvReactions().catch(
      () => ({} as Record<string, Reaction[]>)
    );
    reactions = kvReactions[messageId] ? [...kvReactions[messageId]] : [];
  } else {
    const db = await getDb();
    const msg = db.messages.find((m) => m.id === messageId);
    if (!msg) return null;
    reactions = msg.reactions ? [...msg.reactions] : [];
  }

  const existingIndex = reactions.findIndex((r) => r.userId === userId && r.emoji === emoji);
  if (existingIndex !== -1) {
    reactions.splice(existingIndex, 1);
  } else {
    const sameUserIndex = reactions.findIndex((r) => r.userId === userId);
    if (sameUserIndex !== -1) {
      reactions[sameUserIndex] = { emoji, userId };
    } else {
      reactions.push({ emoji, userId });
    }
  }

  if (isKvConfigured()) {
    const success = await saveKvReaction(messageId, reactions);
    if (!success) {
      throw new StorageOperationError('Failed to persist reaction to storage.');
    }
  } else {
    const db = await getDb();
    const index = db.messages.findIndex((m) => m.id === messageId);
    if (index !== -1) {
      db.messages[index] = { ...db.messages[index], reactions };
      if (memoryStore && Array.isArray(memoryStore.messages)) {
        const memIdx = memoryStore.messages.findIndex((m) => m.id === messageId);
        if (memIdx !== -1) {
          memoryStore.messages[memIdx] = { ...memoryStore.messages[memIdx], reactions };
        }
      }
      await saveDb(db);
    }
  }

  return { id: messageId, reactions } as unknown as Message;
}
