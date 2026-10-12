process.env.NODE_ENV = 'test';

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  createUser,
  createMessage,
  resetDatabase,
  getConversationMessages,
} from '../src/lib/db.ts';
import { GET as messagesGet, POST as messagesPost } from '../src/app/api/messages/route.ts';
import { POST as readPost } from '../src/app/api/messages/read/route.ts';
import { GET as usersGet } from '../src/app/api/users/route.ts';
import { createSessionToken, SESSION_COOKIE_NAME } from '../src/lib/auth.ts';

const projectRoot = process.cwd();

describe('LumaChat Phase 5 & 5A: Messaging Security & Reliability Tests', () => {
  let userA;
  let userB;
  let userAdmin;
  let tokenA;
  let tokenB;
  let tokenAdmin;

  beforeEach(async () => {
    await resetDatabase();
    userA = await createUser({
      name: 'Alice User',
      code: '1111',
      role: 'user',
      avatar: '👩',
    });
    userB = await createUser({
      name: 'Bob Contact',
      code: '2222',
      role: 'user',
      avatar: '👨',
    });
    userAdmin = await createUser({
      name: 'Root Admin',
      code: 'admin123',
      role: 'admin',
      avatar: '🛡️',
    });
    tokenA = await createSessionToken(userA);
    tokenB = await createSessionToken(userB);
    tokenAdmin = await createSessionToken(userAdmin);
  });

  test('ContactsSidebar and ChatWindow source files exist and export React components', () => {
    const sidebarPath = path.join(projectRoot, 'src', 'components', 'ContactsSidebar.tsx');
    const chatWindowPath = path.join(projectRoot, 'src', 'components', 'ChatWindow.tsx');

    assert.ok(fs.existsSync(sidebarPath), 'ContactsSidebar.tsx must exist');
    assert.ok(fs.existsSync(chatWindowPath), 'ChatWindow.tsx must exist');

    const sidebarContent = fs.readFileSync(sidebarPath, 'utf-8');
    const chatWindowContent = fs.readFileSync(chatWindowPath, 'utf-8');

    assert.match(sidebarContent, /export default function ContactsSidebar/);
    assert.match(chatWindowContent, /export default function ChatWindow/);
  });

  test('GET /api/users never exposes passcodes to non-admin callers', async () => {
    // Normal user requesting contact list
    const req = new Request(`http://localhost:3000/api/users?userId=${userA.id}`, {
      headers: { Cookie: `${SESSION_COOKIE_NAME}=${tokenA}` },
    });
    const res = await usersGet(req);
    assert.equal(res.status, 200);

    const data = await res.json();
    assert.ok(Array.isArray(data.users));

    // Neither the caller's code nor contacts' codes should be exposed to regular user
    for (const u of data.users) {
      assert.equal(
        u.code,
        undefined,
        `User ${u.name} code should not be visible to non-admin caller`
      );
    }

    // Admin caller CAN view codes for administrative account operations
    const adminReq = new Request(`http://localhost:3000/api/users?userId=${userAdmin.id}`, {
      headers: { Cookie: `${SESSION_COOKIE_NAME}=${tokenAdmin}` },
    });
    const adminRes = await usersGet(adminReq);
    assert.equal(adminRes.status, 200);
    const adminData = await adminRes.json();
    const bobForAdmin = adminData.users.find((u) => u.id === userB.id);
    assert.equal(bobForAdmin.code, '2222');
  });

  test('GET /api/users provides accurate unread counts and last message previews', async () => {
    // Send message from Bob to Alice
    await createMessage({
      senderId: userB.id,
      receiverId: userA.id,
      text: 'Hello Alice, please check this!',
    });

    const req = new Request(`http://localhost:3000/api/users?userId=${userA.id}`, {
      headers: { Cookie: `${SESSION_COOKIE_NAME}=${tokenA}` },
    });
    const res = await usersGet(req);
    assert.equal(res.status, 200);

    const data = await res.json();
    assert.ok(Array.isArray(data.users));

    const bobInList = data.users.find((u) => u.id === userB.id);
    assert.ok(bobInList);
    assert.equal(bobInList.unreadCount, 1);
    assert.equal(bobInList.lastMessage?.text, 'Hello Alice, please check this!');
  });

  test('GET /api/messages is strictly read-only and does not mutate read state', async () => {
    // Bob sends message to Alice
    const sentMsg = await createMessage({
      senderId: userB.id,
      receiverId: userA.id,
      text: 'Unread message test',
    });
    assert.equal(sentMsg.read, false);

    // Alice views the conversation via GET /api/messages
    const req = new Request(`http://localhost:3000/api/messages?userId=${userA.id}&contactId=${userB.id}`, {
      headers: { Cookie: `${SESSION_COOKIE_NAME}=${tokenA}` },
    });
    const res = await messagesGet(req);
    assert.equal(res.status, 200);

    const data = await res.json();
    assert.equal(data.messages.length, 1);
    assert.equal(data.messages[0].text, 'Unread message test');

    // Confirm that GET did NOT mutate read state
    const currentMsgs = await getConversationMessages(userA.id, userB.id);
    assert.equal(currentMsgs[0].read, false, 'GET must not mutate read state');
  });

  test('POST /api/messages/read authorizes recipient and mutates read state', async () => {
    // Bob sends message to Alice
    await createMessage({
      senderId: userB.id,
      receiverId: userA.id,
      text: 'Message needing read receipt',
    });

    // 1. Bob cannot mark messages received by Alice as read (Forbidden)
    const unauthorizedReq = new Request('http://localhost:3000/api/messages/read', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `${SESSION_COOKIE_NAME}=${tokenB}`,
      },
      body: JSON.stringify({
        senderId: userB.id,
        receiverId: userA.id,
      }),
    });
    const unauthRes = await readPost(unauthorizedReq);
    assert.equal(unauthRes.status, 403);

    // 2. Alice marks her received messages as read
    const validReq = new Request('http://localhost:3000/api/messages/read', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `${SESSION_COOKIE_NAME}=${tokenA}`,
      },
      body: JSON.stringify({
        senderId: userB.id,
        receiverId: userA.id,
      }),
    });
    const validRes = await readPost(validReq);
    assert.equal(validRes.status, 200);

    const updatedMsgs = await getConversationMessages(userA.id, userB.id);
    assert.equal(updatedMsgs[0].read, true, 'Message should now be marked as read');
  });

  test('POST /api/messages prevents duplicate messages when idempotencyKey is reused', async () => {
    const key = `idem_${Date.now()}_testkey123`;

    // First submission
    const req1 = new Request('http://localhost:3000/api/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `${SESSION_COOKIE_NAME}=${tokenA}`,
      },
      body: JSON.stringify({
        receiverId: userB.id,
        text: 'Idempotency verification message',
        idempotencyKey: key,
      }),
    });
    const res1 = await messagesPost(req1);
    assert.equal(res1.status, 200);
    const data1 = await res1.json();
    assert.equal(data1.success, true);
    const msgId = data1.message.id;

    // Second submission with exact same idempotencyKey (simulating retry after dropped connection)
    const req2 = new Request('http://localhost:3000/api/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `${SESSION_COOKIE_NAME}=${tokenA}`,
      },
      body: JSON.stringify({
        receiverId: userB.id,
        text: 'Idempotency verification message',
        idempotencyKey: key,
      }),
    });
    const res2 = await messagesPost(req2);
    assert.equal(res2.status, 200);
    const data2 = await res2.json();
    assert.equal(data2.success, true);
    assert.equal(data2.message.id, msgId, 'Repeated submission must return original persisted message');

    // Verify database only persisted ONE message
    const allMsgs = await getConversationMessages(userA.id, userB.id);
    assert.equal(allMsgs.length, 1, 'Only one message should be persisted in database');
  });

  test('POST /api/messages creates message with verified authenticated sender and delivers read=false', async () => {
    const req = new Request('http://localhost:3000/api/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `${SESSION_COOKIE_NAME}=${tokenA}`,
      },
      body: JSON.stringify({
        receiverId: userB.id,
        text: 'Hello Bob from Alice',
      }),
    });

    const res = await messagesPost(req);
    assert.equal(res.status, 200);

    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.message.senderId, userA.id);
    assert.equal(data.message.receiverId, userB.id);
    assert.equal(data.message.text, 'Hello Bob from Alice');
    assert.equal(data.message.read, false);
    assert.ok(data.message.id.startsWith('msg_'));
  });

  test('POST /api/messages trims whitespace and rejects empty text submissions', async () => {
    const req = new Request('http://localhost:3000/api/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `${SESSION_COOKIE_NAME}=${tokenA}`,
      },
      body: JSON.stringify({
        receiverId: userB.id,
        text: '   ',
      }),
    });

    const res = await messagesPost(req);
    assert.equal(res.status, 400);

    const data = await res.json();
    assert.match(data.error, /Message must contain either text content or an image attachment/);
  });

  test('Page.tsx enforces race condition guards, idempotency keys, and explicit read calls', () => {
    const pagePath = path.join(projectRoot, 'src', 'app', 'page.tsx');
    const content = fs.readFileSync(pagePath, 'utf-8');

    // Checks presence of active contact ref to prevent race conditions
    assert.match(content, /activeContactRef/);
    assert.match(content, /isPollingMessagesRef/);
    assert.match(content, /isPollingUsersRef/);

    // Checks idempotency key generation & reconciliation
    assert.match(content, /idempotencyKey/);
    assert.match(content, /idem_/);

    // Checks explicit call to /api/messages/read
    assert.match(content, /\/api\/messages\/read/);

    // Checks responsive view switching between contacts and conversation
    assert.match(content, /mobileView/);
    assert.match(content, /setMobileView\(['"]conversation['"]\)/);
  });
});
