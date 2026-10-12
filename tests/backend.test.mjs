process.env.NODE_ENV = 'test';

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  getDb,
  resetDatabase,
  createUser,
  updateUser,
  deleteUser,
  findUserByCode,
  createMessage,
  getConversationMessages,
  markMessagesAsRead,
  clearConversationMessages,
  addReactionToMessage,
  assertPersistenceAvailable,
} from '../src/lib/db.ts';
import {
  createSessionToken,
  verifySessionToken,
  checkPasscodeRateLimit,
  recordFailedPasscodeAttempt,
  resetPasscodeRateLimit,
} from '../src/lib/auth.ts';
import {
  validateUserName,
  validatePasscode,
  validateMessageContent,
  validateEmojiReaction,
} from '../src/lib/validation.ts';
import {
  StorageConfigurationError,
  ValidationError,
  RateLimitError,
} from '../src/lib/errors.ts';
import { POST as verifyPost } from '../src/app/api/auth/verify/route.ts';
import { GET as usersGet } from '../src/app/api/users/route.ts';
import { POST as statusPost } from '../src/app/api/users/status/route.ts';
import { GET as messagesGet, POST as messagesPost } from '../src/app/api/messages/route.ts';
import { POST as reactPost } from '../src/app/api/messages/react/route.ts';
import { POST as clearPost } from '../src/app/api/messages/clear/route.ts';
import {
  GET as adminUsersGet,
  POST as adminUsersPost,
  PUT as adminUsersPut,
  DELETE as adminUsersDelete,
} from '../src/app/api/admin/users/route.ts';
import { POST as adminResetPost } from '../src/app/api/admin/reset/route.ts';
import { GET as sessionGet } from '../src/app/api/auth/session/route.ts';
import { POST as logoutPost } from '../src/app/api/auth/logout/route.ts';
import {
  SESSION_COOKIE_NAME,
  CSRF_COOKIE_NAME,
} from '../src/lib/auth.ts';

describe('LumaChat Phase 2: Backend & Persistence Tests', () => {
  beforeEach(async () => {
    // Reset database to clean initial state before each test suite
    await resetDatabase();
  });

  describe('Storage Reliability & Production Persistence Enforcement', () => {
    test('Throws StorageConfigurationError in production when KV is not configured', () => {
      const originalEnv = process.env.NODE_ENV;
      const originalUrl = process.env.KV_REST_API_URL;
      const originalToken = process.env.KV_REST_API_TOKEN;

      try {
        process.env.NODE_ENV = 'production';
        delete process.env.KV_REST_API_URL;
        delete process.env.KV_REST_API_TOKEN;
        delete process.env.UPSTASH_REDIS_REST_URL;
        delete process.env.UPSTASH_REDIS_REST_TOKEN;

        assert.throws(
          () => assertPersistenceAvailable('testOperation'),
          (err) => err instanceof StorageConfigurationError
        );
      } finally {
        process.env.NODE_ENV = originalEnv;
        if (originalUrl) process.env.KV_REST_API_URL = originalUrl;
        if (originalToken) process.env.KV_REST_API_TOKEN = originalToken;
      }
    });

    test('Allows operations in non-production development fallback', () => {
      assert.doesNotThrow(() => assertPersistenceAvailable('devOperation'));
    });
  });

  describe('Cryptographic Authentication & Rate Limiting', () => {
    test('Signs and verifies valid session tokens', () => {
      const mockUser = {
        id: 'usr_test123',
        name: 'Alice',
        code: '1234',
        role: 'user',
        avatar: '👩‍💼',
        status: 'online',
        lastSeen: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      };

      const token = createSessionToken(mockUser);
      assert.ok(token && typeof token === 'string');

      const payload = verifySessionToken(token);
      assert.ok(payload);
      assert.equal(payload.userId, 'usr_test123');
      assert.equal(payload.role, 'user');
    });

    test('Rejects tampered session tokens', () => {
      const mockUser = {
        id: 'usr_tamper',
        name: 'Bob',
        code: '9999',
        role: 'user',
        avatar: '👤',
        status: 'online',
        lastSeen: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      };

      const token = createSessionToken(mockUser);
      const [payloadBase64] = token.split('.');
      const tamperedToken = `${payloadBase64}.invalidsignature123`;

      assert.equal(verifySessionToken(tamperedToken), null);
    });

    test('Rate limits excessive failed passcode attempts', async () => {
      const clientIp = '192.168.1.100';
      await resetPasscodeRateLimit(clientIp);

      for (let i = 0; i < 4; i++) {
        await recordFailedPasscodeAttempt(clientIp);
        await assert.doesNotReject(async () => {
          await checkPasscodeRateLimit(clientIp);
        });
      }

      // 5th failed attempt
      await recordFailedPasscodeAttempt(clientIp);
      await assert.rejects(
        async () => {
          await checkPasscodeRateLimit(clientIp);
        },
        (err) => err instanceof RateLimitError
      );

      await resetPasscodeRateLimit(clientIp);
      await assert.doesNotReject(async () => {
        await checkPasscodeRateLimit(clientIp);
      });
    });
  });

  describe('Input Validation Rules', () => {
    test('validateUserName enforces constraints', () => {
      assert.equal(validateUserName('  Valid Name  '), 'Valid Name');
      assert.throws(() => validateUserName(''), (err) => err instanceof ValidationError);
      assert.throws(() => validateUserName('a'.repeat(51)), (err) => err instanceof ValidationError);
      assert.throws(() => validateUserName('Bad\x00Name'), (err) => err instanceof ValidationError);
    });

    test('validatePasscode enforces constraints', () => {
      assert.equal(validatePasscode(' 0796 '), '0796');
      assert.equal(validatePasscode('@2021'), '@2021');
      assert.throws(() => validatePasscode('1'), (err) => err instanceof ValidationError);
      assert.throws(() => validatePasscode('code with space'), (err) => err instanceof ValidationError);
      assert.throws(() => validatePasscode('code<script>'), (err) => err instanceof ValidationError);
    });

    test('validateMessageContent enforces limits', () => {
      const valid = validateMessageContent('Hello', undefined);
      assert.equal(valid.text, 'Hello');

      assert.throws(
        () => validateMessageContent('', ''),
        (err) => err instanceof ValidationError
      );

      assert.throws(
        () => validateMessageContent('a'.repeat(5001), undefined),
        (err) => err instanceof ValidationError
      );

      assert.throws(
        () => validateMessageContent('Hello', 'not_a_data_uri'),
        (err) => err instanceof ValidationError
      );
    });

    test('validateEmojiReaction enforces valid length', () => {
      assert.equal(validateEmojiReaction('❤️'), '❤️');
      assert.throws(() => validateEmojiReaction(''), (err) => err instanceof ValidationError);
      assert.throws(() => validateEmojiReaction('too_long_emoji_string'), (err) => err instanceof ValidationError);
    });
  });

  describe('Data Access Layer (db.ts) CRUD & Concurrency', () => {
    test('Creates user, retrieves by code, and prevents code collision', async () => {
      const u1 = await createUser({
        name: 'User One',
        code: '1111',
        role: 'user',
        avatar: '🐱',
        notes: 'Test note',
      });

      assert.ok(u1.id.startsWith('usr_'));
      const found = await findUserByCode('1111');
      assert.ok(found);
      assert.equal(found.id, u1.id);
    });

    test('Creates message and prevents duplicate message submission', async () => {
      const m1 = await createMessage({
        senderId: 'usr_s1',
        receiverId: 'usr_r1',
        text: 'Duplicate Test',
      });

      assert.ok(m1.id.startsWith('msg_'));

      // Immediately sending exact same message within 3s deduplicates
      const m2 = await createMessage({
        senderId: 'usr_s1',
        receiverId: 'usr_r1',
        text: 'Duplicate Test',
      });

      assert.equal(m1.id, m2.id);
    });

    test('Adds and toggles emoji reactions', async () => {
      const msg = await createMessage({
        senderId: 'usr_s1',
        receiverId: 'usr_r1',
        text: 'Reaction Test',
      });

      // Add reaction
      const r1 = await addReactionToMessage(msg.id, 'usr_r1', '👍');
      assert.ok(r1 && r1.reactions && r1.reactions.length === 1);
      assert.equal(r1.reactions[0].emoji, '👍');

      // Re-clicking same emoji toggles it off
      const r2 = await addReactionToMessage(msg.id, 'usr_r1', '👍');
      assert.ok(r2 && r2.reactions && r2.reactions.length === 0);
    });

    test('Clears conversation messages between two users only', async () => {
      await createMessage({ senderId: 'u1', receiverId: 'u2', text: 'Msg 1' });
      await createMessage({ senderId: 'u2', receiverId: 'u1', text: 'Msg 2' });
      await createMessage({ senderId: 'u1', receiverId: 'u3', text: 'Msg 3' });

      await clearConversationMessages('u1', 'u2');

      const u1u2 = await getConversationMessages('u1', 'u2');
      assert.equal(u1u2.length, 0);

      const u1u3 = await getConversationMessages('u1', 'u3');
      assert.equal(u1u3.length, 1);
    });

    test('Protects admin_root from deletion', async () => {
      const deleted = await deleteUser('admin_root');
      assert.equal(deleted, false);
      const db = await getDb();
      // admin_root must still exist
      assert.ok(db.users.some((u) => u.id === 'admin_root'));
    });

    test('Updates user details and marks messages as read', async () => {
      const u = await createUser({ name: 'Editable', code: '6666', role: 'user', avatar: '👤' });
      const updated = await updateUser(u.id, { name: 'Edited Name' });
      assert.ok(updated);
      assert.equal(updated.name, 'Edited Name');

      const msg = await createMessage({ senderId: u.id, receiverId: 'admin_root', text: 'Unread' });
      assert.equal(msg.read, false);
      await markMessagesAsRead(u.id, 'admin_root');
      const msgs = await getConversationMessages(u.id, 'admin_root');
      assert.equal(msgs[0].read, true);
    });
  });

  describe('API Routes Runtime Integration', () => {
    test('POST /api/auth/verify: Disguise trigger (@1234)', async () => {
      const req = new Request('http://localhost/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: '@1234' }),
      });

      const res = await verifyPost(req);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.equal(data.isDisguise, true);
    });

    test('POST /api/auth/verify: Valid admin login returns session token', async () => {
      const req = new Request('http://localhost/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: '@2021' }),
      });

      const res = await verifyPost(req);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.equal(data.isAdmin, true);
      assert.ok(data.token);
    });

    test('POST /api/auth/verify: Invalid passcode returns 401', async () => {
      const req = new Request('http://localhost/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'wrong_passcode' }),
      });

      const res = await verifyPost(req);
      assert.equal(res.status, 401);
    });

    test('Admin CRUD: Requires admin authorization', async () => {
      // 1. Unauthenticated request -> 401
      const reqUnauth = new Request('http://localhost/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Hacker', code: '9999' }),
      });
      const resUnauth = await adminUsersPost(reqUnauth);
      assert.equal(resUnauth.status, 401);

      // 2. Regular user token -> 403
      const regularUser = await createUser({
        name: 'Regular',
        code: '5555',
        role: 'user',
        avatar: '👤',
      });
      const userToken = createSessionToken(regularUser);

      const reqForbidden = new Request('http://localhost/api/admin/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userToken}`,
        },
        body: JSON.stringify({ name: 'Newbie', code: '8888' }),
      });
      const resForbidden = await adminUsersPost(reqForbidden);
      assert.equal(resForbidden.status, 403);

      // 3. Admin token -> 201 Created
      const admin = await findUserByCode('@2021');
      assert.ok(admin);
      const adminToken = createSessionToken(admin);

      const reqAdmin = new Request('http://localhost/api/admin/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ name: 'Created User', code: '7777', notes: 'VIP client' }),
      });
      const resAdmin = await adminUsersPost(reqAdmin);
      assert.equal(resAdmin.status, 201);
      const dataAdmin = await resAdmin.json();
      assert.equal(dataAdmin.success, true);
      assert.equal(dataAdmin.user.name, 'Created User');
    });

    test('POST /api/messages: Rejects sender spoofing', async () => {
      const user1 = await createUser({ name: 'User1', code: '2221', role: 'user', avatar: '👤' });
      const user2 = await createUser({ name: 'User2', code: '2222', role: 'user', avatar: '👤' });
      const user1Token = createSessionToken(user1);

      // User1 tries to send as User2
      const reqSpoof = new Request('http://localhost/api/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user1Token}`,
        },
        body: JSON.stringify({
          senderId: user2.id,
          receiverId: 'admin_root',
          text: 'Spoofed message',
        }),
      });

      const resSpoof = await messagesPost(reqSpoof);
      assert.equal(resSpoof.status, 403);
    });

    test('GET /api/messages: Rejects unauthorized third-party observer', async () => {
      const user1 = await createUser({ name: 'U1', code: '3331', role: 'user', avatar: '👤' });
      const user2 = await createUser({ name: 'U2', code: '3332', role: 'user', avatar: '👤' });
      const snooper = await createUser({ name: 'Snooper', code: '3333', role: 'user', avatar: '👤' });
      const snooperToken = createSessionToken(snooper);

      const reqSnoop = new Request(
        `http://localhost/api/messages?userId=${user1.id}&contactId=${user2.id}`,
        {
          headers: {
            Authorization: `Bearer ${snooperToken}`,
          },
        }
      );

      const resSnoop = await messagesGet(reqSnoop);
      assert.equal(resSnoop.status, 403);
    });

    test('GET /api/users & POST /api/users/status: Presence and stats', async () => {
      const u = await createUser({ name: 'PresUser', code: '8881', role: 'user', avatar: '👤' });
      const uToken = createSessionToken(u);

      const statusReq = new Request('http://localhost/api/users/status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${uToken}`,
        },
        body: JSON.stringify({ userId: u.id, status: 'online' }),
      });
      const statusRes = await statusPost(statusReq);
      assert.equal(statusRes.status, 200);

      const usersReq = new Request(`http://localhost/api/users?userId=${u.id}`, {
        headers: { Authorization: `Bearer ${uToken}` },
      });
      const usersRes = await usersGet(usersReq);
      assert.equal(usersRes.status, 200);
      const data = await usersRes.json();
      assert.ok(Array.isArray(data.users));
    });

    test('POST /api/messages/react & POST /api/messages/clear: Reactions and clear chat', async () => {
      const u1 = await createUser({ name: 'RUser1', code: '8882', role: 'user', avatar: '👤' });
      const u1Token = createSessionToken(u1);
      const msg = await createMessage({ senderId: u1.id, receiverId: 'admin_root', text: 'React me' });

      // React to message
      const reactReq = new Request('http://localhost/api/messages/react', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${u1Token}`,
        },
        body: JSON.stringify({ messageId: msg.id, userId: u1.id, emoji: '👍' }),
      });
      const reactRes = await reactPost(reactReq);
      assert.equal(reactRes.status, 200);

      // Clear conversation
      const clearReq = new Request('http://localhost/api/messages/clear', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${u1Token}`,
        },
        body: JSON.stringify({ userId: u1.id, contactId: 'admin_root' }),
      });
      const clearRes = await clearPost(clearReq);
      assert.equal(clearRes.status, 200);
    });

    test('Admin CRUD: GET, PUT, and DELETE /api/admin/users', async () => {
      const admin = await findUserByCode('@2021');
      assert.ok(admin);
      const adminToken = createSessionToken(admin);

      // 1. GET users
      const getReq = new Request('http://localhost/api/admin/users', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const getRes = await adminUsersGet(getReq);
      assert.equal(getRes.status, 200);

      // 2. PUT update user
      const target = await createUser({ name: 'BeforeUpdate', code: '8883', role: 'user', avatar: '👤' });
      const putReq = new Request('http://localhost/api/admin/users', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ id: target.id, name: 'AfterUpdate' }),
      });
      const putRes = await adminUsersPut(putReq);
      assert.equal(putRes.status, 200);

      // 3. DELETE user
      const delReq = new Request(`http://localhost/api/admin/users?id=${target.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const delRes = await adminUsersDelete(delReq);
      assert.equal(delRes.status, 200);
    });

    test('POST /api/admin/reset: Clears all non-admin accounts and messages', async () => {
      const admin = await findUserByCode('@2021');
      assert.ok(admin);
      const adminToken = createSessionToken(admin);

      // Create a test user
      await createUser({ name: 'To Be Reset', code: '4444', role: 'user', avatar: '👤' });

      const reqReset = new Request('http://localhost/api/admin/reset', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      const resReset = await adminResetPost(reqReset);
      assert.equal(resReset.status, 200);

      const db = await getDb();
      assert.equal(db.users.length, 1);
      assert.equal(db.users[0].id, 'admin_root');
      assert.equal(db.messages.length, 0);
    });
  });

  describe('Phase 3: Secure Session Handling, Cookies & Shell Verification', () => {
    test('POST /api/auth/verify delivers HttpOnly SameSite session cookie and CSRF cookie', async () => {
      const req = new Request('http://localhost/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: '@2021' }),
      });

      const res = await verifyPost(req);
      assert.equal(res.status, 200);

      // Verify Set-Cookie headers
      const setCookieHeaders = res.headers.getSetCookie();
      assert.ok(setCookieHeaders.length >= 2, 'Must deliver both session and CSRF cookies');

      const sessionCookieHeader = setCookieHeaders.find((h) => h.includes(SESSION_COOKIE_NAME));
      assert.ok(sessionCookieHeader, 'Must set lumachat_session cookie');
      assert.match(sessionCookieHeader, /HttpOnly/i, 'Session cookie must be HttpOnly');
      assert.match(sessionCookieHeader, /SameSite=Lax/i, 'Session cookie must be SameSite=Lax');
      assert.match(sessionCookieHeader, /Path=\//i, 'Session cookie must have Path=/');
      assert.match(sessionCookieHeader, /Max-Age=86400/i, 'Session cookie must have 24h expiration');

      const csrfCookieHeader = setCookieHeaders.find((h) => h.includes(CSRF_COOKIE_NAME));
      assert.ok(csrfCookieHeader, 'Must set lumachat_csrf cookie');
    });

    test('GET /api/auth/session restores session from valid HttpOnly cookie', async () => {
      const admin = await findUserByCode('@2021');
      assert.ok(admin);
      const token = createSessionToken(admin);

      const req = new Request('http://localhost/api/auth/session', {
        method: 'GET',
        headers: {
          Cookie: `${SESSION_COOKIE_NAME}=${token}`,
        },
      });

      const res = await sessionGet(req);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.authenticated, true);
      assert.equal(data.user.id, 'admin_root');
      assert.equal(data.isAdmin, true);
    });

    test('GET /api/auth/session rejects missing, invalid, or expired tokens', async () => {
      // 1. Missing cookie
      const reqEmpty = new Request('http://localhost/api/auth/session', { method: 'GET' });
      const resEmpty = await sessionGet(reqEmpty);
      assert.equal(resEmpty.status, 200);
      assert.equal((await resEmpty.json()).authenticated, false);

      // 2. Tampered cookie
      const reqTampered = new Request('http://localhost/api/auth/session', {
        method: 'GET',
        headers: { Cookie: `${SESSION_COOKIE_NAME}=invalid.tampered` },
      });
      const resTampered = await sessionGet(reqTampered);
      assert.equal((await resTampered.json()).authenticated, false);

      // 3. Expired token (expiresInHours: -1)
      const admin = await findUserByCode('@2021');
      assert.ok(admin);
      const expiredToken = createSessionToken(admin, -1);
      const reqExpired = new Request('http://localhost/api/auth/session', {
        method: 'GET',
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${expiredToken}` },
      });
      const resExpired = await sessionGet(reqExpired);
      assert.equal((await resExpired.json()).authenticated, false);
    });

    test('POST /api/auth/logout clears session cookie and marks user offline', async () => {
      const admin = await findUserByCode('@2021');
      assert.ok(admin);
      const token = createSessionToken(admin);

      const req = new Request('http://localhost/api/auth/logout', {
        method: 'POST',
        headers: {
          Cookie: `${SESSION_COOKIE_NAME}=${token}`,
        },
      });

      const res = await logoutPost(req);
      assert.equal(res.status, 200);

      const setCookies = res.headers.getSetCookie();
      const clearCookie = setCookies.find((h) => h.includes(SESSION_COOKIE_NAME));
      assert.ok(clearCookie, 'Must set clear-cookie header');
      assert.match(clearCookie, /Max-Age=0/i, 'Cleared cookie must have Max-Age=0');
    });

    test('CSRF protection blocks cross-site cookie requests on state-changing operations', async () => {
      const user = await createUser({ name: 'CsrfTarget', code: '9191', role: 'user', avatar: '👤' });
      const token = createSessionToken(user);

      // Malicious cross-site request with cookie but Sec-Fetch-Site: cross-site
      const reqCrossSite = new Request('http://localhost/api/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `${SESSION_COOKIE_NAME}=${token}`,
          'Sec-Fetch-Site': 'cross-site',
        },
        body: JSON.stringify({
          receiverId: 'admin_root',
          text: 'Attacker exploit payload',
        }),
      });

      const resCrossSite = await messagesPost(reqCrossSite);
      assert.equal(resCrossSite.status, 403);
      const data = await resCrossSite.json();
      assert.match(data.error, /CSRF/i);

      // Origin mismatch request
      const reqOriginMismatch = new Request('http://localhost/api/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `${SESSION_COOKIE_NAME}=${token}`,
          Host: 'localhost',
          Origin: 'http://malicious-website.com',
        },
        body: JSON.stringify({
          receiverId: 'admin_root',
          text: 'Attacker exploit payload',
        }),
      });

      const resOriginMismatch = await messagesPost(reqOriginMismatch);
      assert.equal(resOriginMismatch.status, 403);
    });

    test('Disguise mode @1234 does not deliver session cookie', async () => {
      const req = new Request('http://localhost/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: '@1234' }),
      });

      const res = await verifyPost(req);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.isDisguise, true);

      // Ensure NO session cookie is issued for disguise mode
      const setCookies = res.headers.getSetCookie();
      assert.equal(setCookies.length, 0);
    });

    test('Account switcher view never leaks passcodes to unauthenticated callers', async () => {
      const secretUser = await createUser({
        name: 'Secret User',
        code: '9876',
        role: 'user',
        avatar: '👤',
        notes: 'Secret VIP notes',
      });

      const req = new Request('http://localhost/api/admin/users', { method: 'GET' });
      const res = await adminUsersGet(req);
      assert.equal(res.status, 200);
      const data = await res.json();

      const matched = data.users.find((u) => u.id === secretUser.id);
      assert.ok(matched);
      // Passcode and notes must NOT be present in unauthenticated list
      assert.equal(matched.notes, undefined);
    });
  });
});
