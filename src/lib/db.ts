import fs from 'fs';
import path from 'path';
import { User, Message, DatabaseSchema, Reaction } from '@/types';
import { APP_CONFIG } from '@/lib/config';
import { StorageConfigurationError, StorageOperationError } from '@/lib/errors';
import { createClient, Client } from '@libsql/client';

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

// Short in-memory read cache to prevent polling loops from exhausting Redis command quotas
let cachedDbState: { data: DatabaseSchema; timestamp: number } | null = null;
let cachedKvMessages: { data: Message[]; timestamp: number } | null = null;
let cachedKvReactions: { data: Record<string, Reaction[]>; timestamp: number } | null = null;
const CACHE_TTL_MS = 2500;

/**
 * Explicitly invalidates the high-frequency in-memory read cache.
 */
export function invalidateDbCache(): void {
  cachedDbState = null;
  cachedKvMessages = null;
  cachedKvReactions = null;
}

/**
 * Checks if the current runtime environment is considered production.
 * Allows ALLOW_LOCAL_DB=true for local machine 'npm start' testing without Upstash Redis.
 */
export function isProductionEnvironment(): boolean {
  if (process.env.ALLOW_LOCAL_DB === 'true') {
    return false;
  }
  return process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);
}

/**
 * Normalizes and sanitizes Upstash KV credentials.
 * Automatically handles surrounding quotes, full variable strings, and Bearer prefixes.
 */
export function cleanKvCredentials(rawUrl?: string, rawToken?: string): { url: string; token: string } {
  let url = (rawUrl || '').trim();
  url = url.replace(/^["']|["']$/g, '').trim();
  if (url.includes('=')) {
    url = url.substring(url.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '');
  }
  if (url && !url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
  }

  let token = (rawToken || '').trim();
  token = token.replace(/^["']|["']$/g, '').trim();
  if (token.includes('=')) {
    token = token.substring(token.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '');
  }
  if (token.toLowerCase().startsWith('bearer ')) {
    token = token.slice(7).trim();
  }

  return { url, token };
}

// -------------------------------------------------------------
// Turso libSQL Client & Table Management
// -------------------------------------------------------------
let tursoClient: Client | null = null;
let tursoTablesInitialized = false;
let tursoInitPromise: Promise<void> | null = null;

/**
 * Resolves Turso Database configuration credentials.
 */
export function getTursoConfig(): { url: string; authToken: string } | null {
  const rawUrl =
    process.env.TURSO_DATABASE_URL ||
    (process.env.KV_REST_API_URL?.startsWith('libsql://') || process.env.KV_REST_API_URL?.includes('turso.io')
      ? process.env.KV_REST_API_URL
      : '');
  const rawToken =
    process.env.TURSO_AUTH_TOKEN ||
    (process.env.KV_REST_API_URL?.startsWith('libsql://') || process.env.KV_REST_API_URL?.includes('turso.io')
      ? process.env.KV_REST_API_TOKEN
      : '');

  if (!rawUrl || !rawToken) return null;
  return { url: rawUrl.trim(), authToken: rawToken.trim() };
}

/**
 * Checks if Turso libSQL database credentials are configured.
 */
export function isTursoConfigured(): boolean {
  return Boolean(getTursoConfig());
}

/**
 * Checks if Redis KV credentials are configured.
 */
export function isKvConfigured(): boolean {
  const rawUrl = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const rawToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!rawUrl || !rawToken) return false;
  if (rawUrl.startsWith('libsql://') || rawUrl.includes('turso.io')) return false;
  const { url, token } = cleanKvCredentials(rawUrl, rawToken);
  return Boolean(url && token);
}

/**
 * Checks if any production persistence backend (Turso libSQL or Upstash Redis) is configured.
 */
export function isPersistenceConfigured(): boolean {
  return isTursoConfigured() || isKvConfigured();
}

/**
 * Gets or initializes the Turso client instance.
 */
export function getTursoClient(): Client | null {
  const config = getTursoConfig();
  if (!config) return null;
  if (!tursoClient) {
    tursoClient = createClient({
      url: config.url,
      authToken: config.authToken,
    });
  }
  return tursoClient;
}

/**
 * Ensures SQLite tables exist in the Turso database and auto-seeds initial admin if empty.
 */
export async function ensureTursoTables(): Promise<void> {
  if (tursoTablesInitialized) return;
  if (tursoInitPromise) return tursoInitPromise;

  const client = getTursoClient();
  if (!client) return;

  tursoInitPromise = (async () => {
    try {
      // Fast check: if tables already exist, skip the 800ms DDL schema write lock
      const check = await client.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='users' LIMIT 1");
      if (check.rows.length > 0) {
        tursoTablesInitialized = true;
        return;
      }

      await client.batch(
        [
          `CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            code TEXT NOT NULL UNIQUE,
            role TEXT NOT NULL,
            avatar TEXT NOT NULL,
            status TEXT NOT NULL,
            lastSeen TEXT NOT NULL,
            createdAt TEXT NOT NULL,
            notes TEXT
          );`,
          `CREATE TABLE IF NOT EXISTS messages (
            id TEXT PRIMARY KEY,
            senderId TEXT NOT NULL,
            receiverId TEXT NOT NULL,
            text TEXT,
            image TEXT,
            video TEXT,
            audio TEXT,
            createdAt TEXT NOT NULL,
            read INTEGER NOT NULL DEFAULT 0,
            reactions TEXT,
            idempotencyKey TEXT,
            replyTo TEXT,
            deletedFor TEXT
          );`,
          `CREATE TABLE IF NOT EXISTS meta (
            key TEXT PRIMARY KEY,
            value TEXT
          );`,
          `CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(senderId, receiverId);`,
          `CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(createdAt);`,
          `CREATE INDEX IF NOT EXISTS idx_messages_idempotency ON messages(idempotencyKey);`,
        ],
        'write'
      );

      // Auto-seed admin user if users table is empty
      const userCount = await client.execute("SELECT COUNT(*) as count FROM users WHERE id = 'admin_root'");
      if (Number(userCount.rows[0]?.count || 0) === 0) {
        await client.execute({
          sql: `INSERT OR IGNORE INTO users (id, name, code, role, avatar, status, lastSeen, createdAt, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            INITIAL_DATA.users[0].id,
            INITIAL_DATA.users[0].name,
            INITIAL_DATA.users[0].code,
            INITIAL_DATA.users[0].role,
            INITIAL_DATA.users[0].avatar,
            INITIAL_DATA.users[0].status,
            INITIAL_DATA.users[0].lastSeen,
            INITIAL_DATA.users[0].createdAt,
            INITIAL_DATA.users[0].notes || null,
          ],
        });
      }

      tursoTablesInitialized = true;
    } catch (err) {
      console.warn('[Turso Init Warning] Could not ensure tables:', err);
    } finally {
      tursoInitPromise = null;
    }
  })();

  return tursoInitPromise;
}

function rowToUser(row: Record<string, unknown>): User {
  return {
    id: String(row.id),
    name: String(row.name),
    code: String(row.code),
    role: row.role === 'admin' ? 'admin' : 'user',
    avatar: String(row.avatar || '👤'),
    status: row.status === 'online' ? 'online' : 'offline',
    lastSeen: String(row.lastSeen || new Date().toISOString()),
    createdAt: String(row.createdAt || new Date().toISOString()),
    notes: row.notes ? String(row.notes) : undefined,
  };
}

function rowToMessage(row: Record<string, unknown>): Message {
  let reactions: Reaction[] = [];
  if (row.reactions) {
    try {
      reactions = typeof row.reactions === 'string' ? JSON.parse(row.reactions) : (row.reactions as Reaction[]);
    } catch {}
  }
  let replyTo = undefined;
  if (row.replyTo) {
    try {
      replyTo = typeof row.replyTo === 'string' ? JSON.parse(row.replyTo) : row.replyTo;
    } catch {}
  }
  let deletedFor: string[] | undefined = undefined;
  if (row.deletedFor) {
    try {
      deletedFor = typeof row.deletedFor === 'string' ? JSON.parse(row.deletedFor) : (row.deletedFor as string[]);
    } catch {}
  }

  return {
    id: String(row.id),
    senderId: String(row.senderId),
    receiverId: String(row.receiverId),
    text: String(row.text || ''),
    image: row.image ? String(row.image) : undefined,
    video: row.video ? String(row.video) : undefined,
    audio: row.audio ? String(row.audio) : undefined,
    createdAt: String(row.createdAt),
    read: Boolean(row.read),
    reactions,
    idempotencyKey: row.idempotencyKey ? String(row.idempotencyKey) : undefined,
    replyTo: replyTo as Message['replyTo'],
    deletedFor,
  };
}

async function getTursoUsers(): Promise<User[] | null> {
  const client = getTursoClient();
  if (!client) return null;
  await ensureTursoTables();
  try {
    const res = await client.execute('SELECT * FROM users');
    return res.rows.map(rowToUser);
  } catch (err) {
    console.error('[Turso Error] getTursoUsers failed:', err);
    throw new StorageOperationError(`Turso query failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function saveTursoUsers(users: User[]): Promise<boolean> {
  const client = getTursoClient();
  if (!client) return false;
  await ensureTursoTables();
  try {
    for (const u of users) {
      await client.execute({
        sql: `INSERT INTO users (id, name, code, role, avatar, status, lastSeen, createdAt, notes)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                code = excluded.code,
                role = excluded.role,
                avatar = excluded.avatar,
                status = excluded.status,
                lastSeen = excluded.lastSeen,
                notes = excluded.notes;`,
        args: [u.id, u.name, u.code, u.role, u.avatar, u.status, u.lastSeen, u.createdAt, u.notes || null],
      });
    }
    return true;
  } catch (err) {
    console.error('[Turso Error] saveTursoUsers failed:', err);
    throw new StorageOperationError(`Turso save users failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function getTursoMessages(): Promise<Message[] | null> {
  const client = getTursoClient();
  if (!client) return null;
  await ensureTursoTables();
  try {
    const res = await client.execute('SELECT * FROM messages ORDER BY createdAt ASC');
    return res.rows.map(rowToMessage);
  } catch (err) {
    console.error('[Turso Error] getTursoMessages failed:', err);
    throw new StorageOperationError(`Turso get messages failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function getTursoConversationMessages(
  user1Id: string,
  user2Id: string,
  viewerId?: string
): Promise<Message[]> {
  const client = getTursoClient();
  if (!client) return [];
  await ensureTursoTables();
  try {
    const res = await client.execute({
      sql: `SELECT * FROM messages 
            WHERE (senderId = ? AND receiverId = ?) OR (senderId = ? AND receiverId = ?)
            ORDER BY createdAt ASC`,
      args: [user1Id, user2Id, user2Id, user1Id],
    });
    return res.rows
      .map(rowToMessage)
      .filter((m) => !viewerId || !m.deletedFor || !m.deletedFor.includes(viewerId));
  } catch (err) {
    console.error('[Turso Error] getTursoConversationMessages failed:', err);
    throw new StorageOperationError(`Turso get conversation messages failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function pushTursoMessage(m: Message): Promise<boolean> {
  const client = getTursoClient();
  if (!client) return false;
  await ensureTursoTables();
  try {
    await client.execute({
      sql: `INSERT OR REPLACE INTO messages (id, senderId, receiverId, text, image, video, audio, createdAt, read, reactions, idempotencyKey, replyTo, deletedFor)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        m.id,
        m.senderId,
        m.receiverId,
        m.text || '',
        m.image || null,
        m.video || null,
        m.audio || null,
        m.createdAt,
        m.read ? 1 : 0,
        m.reactions ? JSON.stringify(m.reactions) : null,
        m.idempotencyKey || null,
        m.replyTo ? JSON.stringify(m.replyTo) : null,
        m.deletedFor ? JSON.stringify(m.deletedFor) : null,
      ],
    });
    return true;
  } catch (err) {
    console.error('[Turso Error] pushTursoMessage failed:', err);
    throw new StorageOperationError(`Turso push message failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function saveTursoMessages(messages: Message[]): Promise<boolean> {
  const client = getTursoClient();
  if (!client) return false;
  await ensureTursoTables();
  try {
    if (messages.length === 0) return true;
    const statements = messages.map((m) => ({
      sql: `INSERT OR REPLACE INTO messages (id, senderId, receiverId, text, image, video, audio, createdAt, read, reactions, idempotencyKey, replyTo, deletedFor)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        m.id,
        m.senderId,
        m.receiverId,
        m.text || '',
        m.image || null,
        m.video || null,
        m.audio || null,
        m.createdAt,
        m.read ? 1 : 0,
        m.reactions ? JSON.stringify(m.reactions) : null,
        m.idempotencyKey || null,
        m.replyTo ? JSON.stringify(m.replyTo) : null,
        m.deletedFor ? JSON.stringify(m.deletedFor) : null,
      ],
    }));
    await client.batch(statements, 'write');
    return true;
  } catch (err) {
    console.error('[Turso Error] saveTursoMessages failed:', err);
    throw new StorageOperationError(`Turso save messages failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Validates that durable persistence is available before executing state-changing operations.
 * In production, Turso libSQL or Upstash Redis KV is strictly required to prevent silent data loss.
 */
export function assertPersistenceAvailable(operationName: string = 'storage operation'): void {
  if (isProductionEnvironment() && !isPersistenceConfigured()) {
    console.error(
      `[Storage Diagnostic] Production persistence (Turso or Upstash Redis) is missing for "${operationName}". In-memory and /tmp fallbacks are disallowed in production.`
    );
    throw new StorageConfigurationError(
      'Production persistence layer (Turso libSQL or Upstash Redis) is not configured. Operation aborted to prevent silent data loss.'
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

  const rawUrl = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
  const rawToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
  const { url, token } = cleanKvCredentials(rawUrl, rawToken);

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
          Authorization: `Bearer ${token}`,
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
        const errorDetail = await res.text().catch(() => '');
        const lowerDetail = errorDetail.toLowerCase();

        if (lowerDetail.includes('noperm') || lowerDetail.includes('no permissions')) {
          throw new StorageOperationError(
            'Upstash Permission Denied: You are using a Read-Only Token. Please copy the primary UPSTASH_REDIS_REST_TOKEN (read-write) from the Upstash console.'
          );
        }

        if (
          lowerDetail.includes('fixed plan limits') ||
          lowerDetail.includes('daily limit')
        ) {
          throw new StorageOperationError(
            'Upstash Redis daily command limit reached (10,000 commands/day). Please upgrade your Upstash database plan to Pay-As-You-Go or configure a new database in console.upstash.com.'
          );
        }

        if (res.status === 403 || res.status === 401) {
          throw new StorageOperationError(
            `Upstash Authentication Error (HTTP ${res.status}): Please check that your UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are correct.`
          );
        }

        throw new StorageOperationError(
          `Upstash KV HTTP error ${res.status}${errorDetail ? ': ' + errorDetail.slice(0, 100) : ''}`
        );
      }

      const data = await res.json();
      if (data && typeof data === 'object' && 'error' in data && data.error) {
        const errStr = String(data.error);
        const lowerErr = errStr.toLowerCase();

        if (lowerErr.includes('noperm') || lowerErr.includes('no permissions')) {
          throw new StorageOperationError(
            'Upstash Permission Denied: You are using a Read-Only Token. Please copy the primary UPSTASH_REDIS_REST_TOKEN (read-write) from the Upstash console.'
          );
        }

        if (
          lowerErr.includes('fixed plan limits') ||
          lowerErr.includes('daily limit')
        ) {
          throw new StorageOperationError(
            'Upstash Redis daily command limit reached (10,000 commands/day). Please upgrade your Upstash database plan to Pay-As-You-Go or configure a new database in console.upstash.com.'
          );
        }
        throw new StorageOperationError(`Upstash Redis error: ${errStr}`);
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
 * Fetches users from KV store or Turso.
 * Reads lumachat_users first; falls back to legacy chatpass_users for backward compatibility.
 */
async function getKvUsers(): Promise<User[] | null> {
  if (isTursoConfigured()) {
    return getTursoUsers();
  }
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
 * Saves users list to KV store (lumachat_users key) or Turso.
 */
async function saveKvUsers(users: User[]): Promise<boolean> {
  cachedDbState = null;
  if (isTursoConfigured()) {
    return saveTursoUsers(users);
  }
  if (!isKvConfigured()) return false;
  const res = await executeKvCommand(['SET', 'lumachat_users', JSON.stringify(users)]);
  return res !== null;
}

/**
 * Atomic Redis list read via LRANGE with content & ID deduplication, or Turso query.
 * Reads lumachat_messages first; falls back to legacy chatpass_messages.
 */
async function getKvMessages(): Promise<Message[] | null> {
  const now = Date.now();
  if (cachedKvMessages && now - cachedKvMessages.timestamp < CACHE_TTL_MS) {
    return cachedKvMessages.data;
  }

  if (isTursoConfigured()) {
    const msgs = await getTursoMessages();
    if (msgs) {
      cachedKvMessages = { data: msgs, timestamp: Date.now() };
    }
    return msgs;
  }

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
        const sig = `${m.senderId}_${m.receiverId}_${(m.text || '').trim()}_${m.image || ''}_${m.video || ''}_${m.audio || ''}_${timeBucket}`;

        if (!seenIds.has(m.id) && !seenSignatures.has(sig)) {
          seenIds.add(m.id);
          seenSignatures.add(sig);
          uniqueMessages.push(m);
        }
      }
      cachedKvMessages = { data: uniqueMessages, timestamp: Date.now() };
      return uniqueMessages;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Appends a message to Redis list using atomic RPUSH or Turso insert.
 */
async function pushKvMessage(message: Message): Promise<boolean> {
  cachedDbState = null;
  cachedKvMessages = null;
  if (isTursoConfigured()) {
    return pushTursoMessage(message);
  }
  if (!isKvConfigured()) return false;
  // RPUSH is non-idempotent; do not auto-retry in ways that duplicate messages
  const res = await executeKvCommand(['RPUSH', 'lumachat_messages', JSON.stringify(message)], {
    retries: 0,
    isIdempotent: false,
  });
  return res !== null;
}

/**
 * Reads emoji reactions from dedicated KV key or Turso messages.
 * Reads lumachat_reactions first; falls back to legacy chatpass_reactions.
 */
async function getKvReactions(): Promise<Record<string, Reaction[]>> {
  if (isTursoConfigured()) {
    const msgs = await getKvMessages();
    const map: Record<string, Reaction[]> = {};
    if (msgs) {
      for (const m of msgs) {
        if (m.reactions && m.reactions.length > 0) {
          map[m.id] = m.reactions;
        }
      }
    }
    return map;
  }
  if (!isKvConfigured()) return {};
  const now = Date.now();
  if (cachedKvReactions && now - cachedKvReactions.timestamp < CACHE_TTL_MS) {
    return cachedKvReactions.data;
  }
  try {
    let result = await executeKvCommand(['GET', 'lumachat_reactions']);
    if (!result) {
      result = await executeKvCommand(['GET', 'chatpass_reactions']);
    }
    if (result) {
      const parsed = typeof result === 'string' ? JSON.parse(result) : result;
      const data = parsed && typeof parsed === 'object' ? parsed : {};
      cachedKvReactions = { data, timestamp: Date.now() };
      return data;
    }
  } catch (err) {
    console.warn('[Storage Warning] Could not read KV reactions:', err);
  }
  return {};
}

/**
 * Saves reactions to dedicated KV key or Turso messages table.
 */
async function saveKvReaction(
  messageId: string,
  reactions: Reaction[]
): Promise<boolean> {
  cachedKvReactions = null;
  if (isTursoConfigured()) {
    const client = getTursoClient();
    if (!client) return false;
    await ensureTursoTables();
    await client.execute({
      sql: 'UPDATE messages SET reactions = ? WHERE id = ?',
      args: [reactions.length > 0 ? JSON.stringify(reactions) : null, messageId],
    });
    return true;
  }
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
 * Atomically replaces the stored messages in Redis or Turso.
 */
async function saveKvMessages(messages: Message[]): Promise<boolean> {
  cachedDbState = null;
  cachedKvMessages = null;

  if (isTursoConfigured()) {
    return saveTursoMessages(messages);
  }

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
  if (!fs.existsSync(/*turbopackIgnore: true*/ dataDir)) {
    try {
      fs.mkdirSync(/*turbopackIgnore: true*/ dataDir, { recursive: true });
    } catch {
      return path.join('/tmp', isTest ? 'lumachat_test_db.json' : 'lumachat_db.json');
    }
  }
  return path.join(dataDir, isTest ? 'test_db.json' : 'db.json');
}

/**
 * Reads the full database state.
 * Priority 1: Turso libSQL or Upstash Redis KV (with short TTL in-memory cache)
 * Priority 2: Local JSON file (dev only)
 * Priority 3: Memory store (dev only)
 */
export async function getDb(): Promise<DatabaseSchema> {
  const now = Date.now();
  if (cachedDbState && now - cachedDbState.timestamp < CACHE_TTL_MS) {
    return cachedDbState.data;
  }

  if (isPersistenceConfigured()) {
    try {
      const [rawUsers, rawMessages] = await Promise.all([getKvUsers(), getKvMessages()]);
      const users = Array.isArray(rawUsers) && rawUsers.length > 0 ? rawUsers : INITIAL_DATA.users;
      const messages = Array.isArray(rawMessages) ? rawMessages : [];
      if (!Array.isArray(rawUsers) || rawUsers.length === 0) {
        await saveKvUsers(INITIAL_DATA.users).catch(() => {});
      }
      const result: DatabaseSchema = {
        adminCode: INITIAL_DATA.adminCode,
        users,
        messages,
      };
      cachedDbState = { data: result, timestamp: Date.now() };
      memoryStore = result;
      return result;
    } catch (kvErr) {
      if (isProductionEnvironment()) {
        // Resilient fallback: if we have cached DB or memoryStore, serve it rather than crashing
        if (cachedDbState) {
          console.warn('[Storage Resilient Fallback] Serving cached DB state after persistence failure:', kvErr);
          return cachedDbState.data;
        }
        if (memoryStore) {
          console.warn('[Storage Resilient Fallback] Serving memoryStore after persistence failure:', kvErr);
          return memoryStore;
        }
        const errMessage = kvErr instanceof Error ? kvErr.message : String(kvErr);
        if (errMessage.includes('fetch failed')) {
          throw new StorageOperationError(
            'Failed to connect to production database (fetch failed). Please verify that your database credentials are set correctly in your Vercel Project Settings > Environment Variables.'
          );
        }
        throw new StorageOperationError(
          `Failed to read from production database: ${errMessage}`
        );
      }
      console.warn('[Storage Warning] Persistence fetch failed in dev, falling back to local file:', kvErr);
    }
  }

  assertPersistenceAvailable('getDb');

  // Dev fallback: local disk (only active in non-production environments)
  if (!isProductionEnvironment()) {
    const filePath = getDbFilePath();
    try {
      if (fs.existsSync(/*turbopackIgnore: true*/ filePath)) {
        const fileData = fs.readFileSync(/*turbopackIgnore: true*/ filePath, 'utf-8');
        const parsed = JSON.parse(fileData);
        if (parsed && Array.isArray(parsed.users)) {
          memoryStore = parsed;
          cachedDbState = { data: parsed, timestamp: Date.now() };
          return parsed;
        }
      }
    } catch (error) {
      console.warn('[Storage Warning] Could not read local DB file:', error);
    }
  }

  // Dev fallback: memory
  if (memoryStore) {
    cachedDbState = { data: memoryStore, timestamp: Date.now() };
    return memoryStore;
  }

  memoryStore = JSON.parse(JSON.stringify(INITIAL_DATA));
  cachedDbState = { data: memoryStore!, timestamp: Date.now() };
  await saveDb(memoryStore!).catch(() => {});
  return memoryStore!;
}

/**
 * Writes the database state.
 */
export async function saveDb(data: DatabaseSchema): Promise<void> {
  assertPersistenceAvailable('saveDb');

  cachedDbState = null;
  cachedKvMessages = null;
  cachedKvReactions = null;

  if (isPersistenceConfigured()) {
    await saveKvUsers(data.users);
    if (data.messages && data.messages.length > 0) {
      await saveKvMessages(data.messages);
    }
    return;
  }

  memoryStore = data;
  const filePath = getDbFilePath();
  try {
    fs.writeFileSync(/*turbopackIgnore: true*/ filePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (error) {
    console.warn('[Storage Warning] Could not write DB file to disk:', error);
  }
}

/**
 * Resets the database to clean initial state (Admin only).
 */
export async function resetDatabase(): Promise<DatabaseSchema> {
  assertPersistenceAvailable('resetDatabase');

  cachedDbState = null;
  cachedKvMessages = null;
  cachedKvReactions = null;
  memoryStore = JSON.parse(JSON.stringify(INITIAL_DATA));

  if (isTursoConfigured()) {
    const client = getTursoClient();
    if (client) {
      await client.batch(
        [
          { sql: 'DELETE FROM messages', args: [] },
          { sql: 'DELETE FROM users WHERE id != ?', args: [APP_CONFIG.adminRootId] },
        ],
        'write'
      ).catch(() => null);
    }
  } else if (isKvConfigured()) {
    await saveKvUsers(INITIAL_DATA.users);
    await executeKvCommand(['DEL', 'lumachat_messages']).catch(() => null);
    await executeKvCommand(['DEL', 'lumachat_reactions']).catch(() => null);
  }

  const filePath = getDbFilePath();
  try {
    fs.writeFileSync(/*turbopackIgnore: true*/ filePath, JSON.stringify(INITIAL_DATA, null, 2), 'utf-8');
  } catch (error) {
    console.warn('[Storage Warning] Could not write reset DB to disk:', error);
  }

  return memoryStore!;
}

// User Helpers

export async function findUserByCode(code: string): Promise<User | null> {
  const trimmed = code.trim();

  if (isTursoConfigured()) {
    const client = getTursoClient();
    if (client) {
      await ensureTursoTables();
      if (trimmed === '@2021' || trimmed === '2021' || trimmed === INITIAL_DATA.adminCode) {
        const adminRes = await client.execute("SELECT * FROM users WHERE role = 'admin' LIMIT 1");
        if (adminRes.rows.length > 0) return rowToUser(adminRes.rows[0]);
      }
      const res = await client.execute({
        sql: 'SELECT * FROM users WHERE UPPER(code) = UPPER(?) LIMIT 1',
        args: [trimmed],
      });
      if (res.rows.length > 0) return rowToUser(res.rows[0]);
      return null;
    }
  }

  const db = await getDb();
  if (!db || !Array.isArray(db.users)) return INITIAL_DATA.users[0];

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
  if (isTursoConfigured()) {
    const client = getTursoClient();
    if (client) {
      await ensureTursoTables();
      const res = await client.execute({
        sql: 'SELECT * FROM users WHERE id = ? LIMIT 1',
        args: [id],
      });
      return res.rows.length > 0 ? rowToUser(res.rows[0]) : null;
    }
  }
  const db = await getDb();
  return db.users.find((u) => u.id === id) || null;
}

export async function getAllUsers(): Promise<User[]> {
  const db = await getDb();
  const rawUsers = db.users || INITIAL_DATA.users;
  const now = Date.now();

  return rawUsers.map((user) => {
    const lastSeenTime = user.lastSeen ? new Date(user.lastSeen).getTime() : 0;
    const isOnline =
      user.status === 'offline'
        ? false
        : now - lastSeenTime < APP_CONFIG.polling.onlineThresholdMs;
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

  if (isPersistenceConfigured()) {
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

  if (isTursoConfigured()) {
    const client = getTursoClient();
    if (client) {
      await ensureTursoTables();
      const entries = Object.entries(updates).filter(([k]) => k !== 'id');
      if (entries.length > 0) {
        const setClauses = entries.map(([k]) => `${k} = ?`).join(', ');
        const args: (string | number | null)[] = entries.map(([, v]) =>
          v === undefined || v === null ? null : typeof v === 'object' ? JSON.stringify(v) : (v as string | number)
        );
        args.push(id);
        await client.execute({
          sql: `UPDATE users SET ${setClauses} WHERE id = ?`,
          args,
        });
      }
      if (cachedDbState && Array.isArray(cachedDbState.data.users)) {
        const u = cachedDbState.data.users.find((user) => user.id === id);
        if (u) {
          Object.assign(u, updates);
        }
      } else {
        cachedDbState = null;
      }
      if (memoryStore && Array.isArray(memoryStore.users)) {
        const idx = memoryStore.users.findIndex((u) => u.id === id);
        if (idx !== -1) {
          memoryStore.users[idx] = { ...memoryStore.users[idx], ...updates };
        }
      }
      const existing = (cachedDbState?.data.users || memoryStore?.users || []).find((u) => u.id === id);
      return existing || getUserById(id);
    }
  }

  const db = await getDb();
  const index = db.users.findIndex((u) => u.id === id);
  if (index === -1) return null;

  db.users[index] = { ...db.users[index], ...updates };

  if (isPersistenceConfigured()) {
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

  if (isTursoConfigured()) {
    const client = getTursoClient();
    if (client) {
      await ensureTursoTables();
      await client.batch(
        [
          { sql: 'DELETE FROM users WHERE id = ?', args: [id] },
          { sql: 'DELETE FROM messages WHERE senderId = ? OR receiverId = ?', args: [id, id] },
        ],
        'write'
      );
      cachedDbState = null;
      cachedKvMessages = null;
      return true;
    }
  }

  const db = await getDb();
  const initialLength = db.users.length;
  db.users = db.users.filter((u) => u.id !== id);
  db.messages = db.messages.filter((m) => m.senderId !== id && m.receiverId !== id);

  if (isPersistenceConfigured()) {
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
  user2Id: string,
  viewerId?: string
): Promise<Message[]> {
  if (isTursoConfigured()) {
    return getTursoConversationMessages(user1Id, user2Id, viewerId);
  }

  const allMessages =
    isPersistenceConfigured() ? (await getKvMessages()) || [] : (await getDb()).messages;

  const msgs = allMessages
    .filter(
      (m) =>
        ((m.senderId === user1Id && m.receiverId === user2Id) ||
         (m.senderId === user2Id && m.receiverId === user1Id)) &&
        (!viewerId || !m.deletedFor || !m.deletedFor.includes(viewerId))
    )
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  if (isKvConfigured() && !isTursoConfigured()) {
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
  const vidStr = msgData.video || '';
  const audStr = msgData.audio || '';
  const now = Date.now();
  const idempotencyKey = msgData.idempotencyKey;

  // 1. Check for existing message by Idempotency Key (scoped to conversation)
  if (idempotencyKey) {
    if (isTursoConfigured()) {
      const client = getTursoClient();
      if (client) {
        await ensureTursoTables();
        const check = await client.execute({
          sql: 'SELECT * FROM messages WHERE idempotencyKey = ? AND senderId = ? AND receiverId = ? LIMIT 1',
          args: [idempotencyKey, msgData.senderId, msgData.receiverId],
        });
        if (check.rows.length > 0) {
          return rowToMessage(check.rows[0]);
        }
      }
    } else if (cachedKvMessages && cachedKvMessages.data.length > 0) {
      const match = cachedKvMessages.data.find(
        (m) =>
          m.idempotencyKey === idempotencyKey &&
          m.senderId === msgData.senderId &&
          m.receiverId === msgData.receiverId
      );
      if (match) return match;
    } else {
      const existingMessages =
        isPersistenceConfigured() ? (await getKvMessages()) || [] : (await getDb()).messages;

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
  }

  // 2. In-Memory Signature Deduplication Check (3-second window)
  const sig = `${msgData.senderId}_${msgData.receiverId}_${textTrim}_${imgStr}_${vidStr}_${audStr}`;
  const lastSentTime = recentSentSignatures.get(sig);
  if (lastSentTime && now - lastSentTime < 3000) {
    if (memoryStore && Array.isArray(memoryStore.messages)) {
      const match = memoryStore.messages.find(
        (m) =>
          m.senderId === msgData.senderId &&
          m.receiverId === msgData.receiverId &&
          (m.text || '').trim() === textTrim &&
          (m.image || '') === imgStr &&
          (m.video || '') === vidStr &&
          (m.audio || '') === audStr
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

  if (isPersistenceConfigured()) {
    const success = await pushKvMessage(newMsg);
    if (!success) {
      throw new StorageOperationError('Failed to persist message to storage.');
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

  if (isTursoConfigured()) {
    const client = getTursoClient();
    if (client) {
      await ensureTursoTables();
      await client.execute({
        sql: 'UPDATE messages SET read = 1 WHERE senderId = ? AND receiverId = ? AND read = 0',
        args: [senderId, receiverId],
      });
      if (cachedKvMessages) {
        cachedKvMessages.data.forEach((m) => {
          if (m.senderId === senderId && m.receiverId === receiverId) {
            m.read = true;
          }
        });
      }
      return;
    }
  }

  const db = await getDb();
  let updated = false;
  db.messages.forEach((m) => {
    if (m.senderId === senderId && m.receiverId === receiverId && !m.read) {
      m.read = true;
      updated = true;
    }
  });

  if (updated) {
    if (isPersistenceConfigured()) {
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

  if (isTursoConfigured()) {
    const client = getTursoClient();
    if (client) {
      await ensureTursoTables();
      await client.execute({
        sql: 'DELETE FROM messages WHERE (senderId = ? AND receiverId = ?) OR (senderId = ? AND receiverId = ?)',
        args: [user1Id, user2Id, user2Id, user1Id],
      });
      if (cachedKvMessages) {
        cachedKvMessages.data = cachedKvMessages.data.filter(
          (m) =>
            !(
              (m.senderId === user1Id && m.receiverId === user2Id) ||
              (m.senderId === user2Id && m.receiverId === user1Id)
            )
        );
      }
      return true;
    }
  }

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

  if (isPersistenceConfigured()) {
    await saveKvMessages(db.messages);
  } else {
    await saveDb(db);
  }

  return true;
}

export async function deleteMessage(messageId: string): Promise<boolean> {
  assertPersistenceAvailable('deleteMessage');

  if (isTursoConfigured()) {
    const client = getTursoClient();
    if (client) {
      await ensureTursoTables();
      const res = await client.execute({
        sql: 'DELETE FROM messages WHERE id = ?',
        args: [messageId],
      });
      if (cachedKvMessages) {
        cachedKvMessages.data = cachedKvMessages.data.filter((m) => m.id !== messageId);
      }
      return res.rowsAffected > 0;
    }
  }

  const db = await getDb();
  const initialLength = db.messages.length;
  db.messages = db.messages.filter((m) => m.id !== messageId);

  if (memoryStore && Array.isArray(memoryStore.messages)) {
    memoryStore.messages = memoryStore.messages.filter((m) => m.id !== messageId);
  }

  if (isPersistenceConfigured()) {
    await saveKvMessages(db.messages);
  } else {
    await saveDb(db);
  }

  return db.messages.length < initialLength;
}

export async function deleteMessageForUser(messageId: string, userId: string): Promise<boolean> {
  assertPersistenceAvailable('deleteMessageForUser');

  if (isTursoConfigured()) {
    const client = getTursoClient();
    if (client) {
      await ensureTursoTables();
      const check = await client.execute({
        sql: 'SELECT deletedFor FROM messages WHERE id = ?',
        args: [messageId],
      });
      if (check.rows.length === 0) return false;
      let deletedFor: string[] = [];
      const raw = check.rows[0].deletedFor;
      if (raw) {
        try {
          deletedFor = typeof raw === 'string' ? JSON.parse(raw) : (raw as unknown as string[]);
        } catch {}
      }
      if (!deletedFor.includes(userId)) {
        deletedFor.push(userId);
      }
      await client.execute({
        sql: 'UPDATE messages SET deletedFor = ? WHERE id = ?',
        args: [JSON.stringify(deletedFor), messageId],
      });
      if (cachedKvMessages) {
        const target = cachedKvMessages.data.find((m) => m.id === messageId);
        if (target) {
          target.deletedFor = deletedFor;
        }
      }
      return true;
    }
  }

  const db = await getDb();
  const msg = db.messages.find((m) => m.id === messageId);
  if (!msg) return false;

  if (!msg.deletedFor) {
    msg.deletedFor = [];
  }
  if (!msg.deletedFor.includes(userId)) {
    msg.deletedFor.push(userId);
  }

  if (memoryStore && Array.isArray(memoryStore.messages)) {
    const memMsg = memoryStore.messages.find((m) => m.id === messageId);
    if (memMsg) {
      if (!memMsg.deletedFor) memMsg.deletedFor = [];
      if (!memMsg.deletedFor.includes(userId)) memMsg.deletedFor.push(userId);
    }
  }

  if (isPersistenceConfigured()) {
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

  if (isPersistenceConfigured()) {
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

  if (isPersistenceConfigured()) {
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

// -------------------------------------------------------------
// Live Typing State Tracking
// -------------------------------------------------------------
const activeTypingMap = new Map<string, { to: string; expiresAt: number }>();

/**
 * Sets or clears real-time typing status for a user.
 * Typing state automatically expires after 3 seconds of inactivity.
 */
export function setUserTyping(userId: string, toUserId: string | null): void {
  if (!toUserId) {
    activeTypingMap.delete(userId);
  } else {
    activeTypingMap.set(userId, { to: toUserId, expiresAt: Date.now() + 3000 });
  }
}

/**
 * Gets the recipient ID that the given user is currently typing to, if active.
 */
export function getUserTypingTo(userId: string): string | null {
  const item = activeTypingMap.get(userId);
  if (!item) return null;
  if (Date.now() > item.expiresAt) {
    activeTypingMap.delete(userId);
    return null;
  }
  return item.to;
}
