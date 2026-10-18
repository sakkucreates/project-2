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
import { POST as messagesPost, DELETE as messagesDelete } from '../src/app/api/messages/route.ts';
import { POST as reactPost } from '../src/app/api/messages/react/route.ts';
import { POST as clearPost } from '../src/app/api/messages/clear/route.ts';
import { createSessionToken, SESSION_COOKIE_NAME } from '../src/lib/auth.ts';

const projectRoot = process.cwd();

// Small 1x1 transparent PNG data URI for testing
const VALID_PNG_DATA_URI =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

// SVG data URI (should be rejected for safety)
const INVALID_SVG_DATA_URI =
  'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxyZWN0IHdpZHRoPSIxMCIgaGVpZ2h0PSIxMCIvPjwvc3ZnPg==';

// Small valid MP4 data URI for testing
const VALID_MP4_DATA_URI =
  'data:video/mp4;base64,AAAAHGZ0eXBtcDQyAAAAAG1wNDJpc29tYXZjMQAAAAhmcmVlAAAAGG1kYXQ=';

describe('LumaChat Phase 6: Advanced Chat Features Tests', () => {
  let userA;
  let userB;
  let userC;
  let tokenA;
  let tokenB;
  let tokenC;

  beforeEach(async () => {
    await resetDatabase();
    userA = await createUser({
      name: 'Alice Phase6',
      code: '6001',
      role: 'user',
      avatar: '👩',
    });
    userB = await createUser({
      name: 'Bob Phase6',
      code: '6002',
      role: 'user',
      avatar: '👨',
    });
    userC = await createUser({
      name: 'Charlie Outsider',
      code: '6003',
      role: 'user',
      avatar: '🧑',
    });
    tokenA = await createSessionToken(userA);
    tokenB = await createSessionToken(userB);
    tokenC = await createSessionToken(userC);
  });

  // -------------------------------------------------------------
  // Image Attachments & Validation
  // -------------------------------------------------------------
  test('POST /api/messages accepts valid raster image attachments', async () => {
    const req = new Request('http://localhost:3000/api/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `${SESSION_COOKIE_NAME}=${tokenA}`,
      },
      body: JSON.stringify({
        receiverId: userB.id,
        text: 'Look at this photo',
        image: VALID_PNG_DATA_URI,
      }),
    });

    const res = await messagesPost(req);
    assert.equal(res.status, 200);

    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.message.senderId, userA.id);
    assert.equal(data.message.receiverId, userB.id);
    assert.equal(data.message.image, VALID_PNG_DATA_URI);
    assert.equal(data.message.text, 'Look at this photo');
  });

  test('POST /api/messages rejects unsupported image formats (e.g. SVG)', async () => {
    const req = new Request('http://localhost:3000/api/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `${SESSION_COOKIE_NAME}=${tokenA}`,
      },
      body: JSON.stringify({
        receiverId: userB.id,
        image: INVALID_SVG_DATA_URI,
      }),
    });

    const res = await messagesPost(req);
    assert.equal(res.status, 400);

    const data = await res.json();
    assert.match(data.error, /Supported raster formats: JPEG, PNG, WebP, GIF/i);
  });

  test('POST /api/messages rejects oversized images exceeding 5MB limit', async () => {
    // Construct fake base64 data URI exceeding 5MB (~7 million chars)
    const largeBase64 = 'data:image/png;base64,' + 'A'.repeat(7 * 1024 * 1024);

    const req = new Request('http://localhost:3000/api/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `${SESSION_COOKIE_NAME}=${tokenA}`,
      },
      body: JSON.stringify({
        receiverId: userB.id,
        image: largeBase64,
      }),
    });

    const res = await messagesPost(req);
    assert.equal(res.status, 400);

    const data = await res.json();
    assert.match(data.error, /exceeds 5MB limit/i);
  });

  // -------------------------------------------------------------
  // Video Attachments & Validation
  // -------------------------------------------------------------
  test('POST /api/messages accepts valid video attachments', async () => {
    const req = new Request('http://localhost:3000/api/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `${SESSION_COOKIE_NAME}=${tokenA}`,
      },
      body: JSON.stringify({
        receiverId: userB.id,
        text: 'Watch this clip',
        video: VALID_MP4_DATA_URI,
      }),
    });

    const res = await messagesPost(req);
    assert.equal(res.status, 200);

    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.message.senderId, userA.id);
    assert.equal(data.message.receiverId, userB.id);
    assert.equal(data.message.video, VALID_MP4_DATA_URI);
    assert.equal(data.message.text, 'Watch this clip');
  });

  test('POST /api/messages rejects unsupported video formats', async () => {
    const req = new Request('http://localhost:3000/api/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `${SESSION_COOKIE_NAME}=${tokenA}`,
      },
      body: JSON.stringify({
        receiverId: userB.id,
        video: 'data:video/unknown;base64,AAAA',
      }),
    });

    const res = await messagesPost(req);
    assert.equal(res.status, 400);

    const data = await res.json();
    assert.match(data.error, /Supported video formats: MP4, WebM, OGG, MOV/i);
  });

  // -------------------------------------------------------------
  // Emoji Reactions (6-Reaction System & Authorization)
  // -------------------------------------------------------------
  test('POST /api/messages/react adds, updates, and toggles allowed reaction', async () => {
    const msg = await createMessage({
      senderId: userA.id,
      receiverId: userB.id,
      text: 'Reaction target message',
    });

    // 1. Add reaction '❤️'
    const req1 = new Request('http://localhost:3000/api/messages/react', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `${SESSION_COOKIE_NAME}=${tokenB}`,
      },
      body: JSON.stringify({
        messageId: msg.id,
        emoji: '❤️',
      }),
    });
    const res1 = await reactPost(req1);
    assert.equal(res1.status, 200);
    const data1 = await res1.json();
    assert.equal(data1.success, true);
    assert.equal(data1.message.reactions.length, 1);
    assert.equal(data1.message.reactions[0].emoji, '❤️');

    // 2. Change reaction to '👍'
    const req2 = new Request('http://localhost:3000/api/messages/react', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `${SESSION_COOKIE_NAME}=${tokenB}`,
      },
      body: JSON.stringify({
        messageId: msg.id,
        emoji: '👍',
      }),
    });
    const res2 = await reactPost(req2);
    assert.equal(res2.status, 200);
    const data2 = await res2.json();
    assert.equal(data2.message.reactions.length, 1);
    assert.equal(data2.message.reactions[0].emoji, '👍');

    // 3. Re-submitting '👍' toggles reaction off
    const req3 = new Request('http://localhost:3000/api/messages/react', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `${SESSION_COOKIE_NAME}=${tokenB}`,
      },
      body: JSON.stringify({
        messageId: msg.id,
        emoji: '👍',
      }),
    });
    const res3 = await reactPost(req3);
    assert.equal(res3.status, 200);
    const data3 = await res3.json();
    assert.equal(data3.message.reactions.length, 0);
  });

  test('POST /api/messages/react rejects unsupported emoji reactions', async () => {
    const msg = await createMessage({
      senderId: userA.id,
      receiverId: userB.id,
      text: 'Test message',
    });

    const req = new Request('http://localhost:3000/api/messages/react', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `${SESSION_COOKIE_NAME}=${tokenB}`,
      },
      body: JSON.stringify({
        messageId: msg.id,
        emoji: '🚀', // Not in the allowed six reactions
      }),
    });

    const res = await reactPost(req);
    assert.equal(res.status, 400);

    const data = await res.json();
    assert.match(data.error, /Unsupported reaction emoji/i);
  });

  test('POST /api/messages/react rejects unauthorized third-party user', async () => {
    const msg = await createMessage({
      senderId: userA.id,
      receiverId: userB.id,
      text: 'Private conversation between A and B',
    });

    // Charlie is not a participant
    const req = new Request('http://localhost:3000/api/messages/react', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `${SESSION_COOKIE_NAME}=${tokenC}`,
      },
      body: JSON.stringify({
        messageId: msg.id,
        emoji: '❤️',
      }),
    });

    const res = await reactPost(req);
    assert.equal(res.status, 403);

    const data = await res.json();
    assert.match(data.error, /You are not authorized to react to messages in this conversation/i);
  });

  // -------------------------------------------------------------
  // Clear Chat (Both-Sides Deletion & Authorization)
  // -------------------------------------------------------------
  test('POST /api/messages/clear deletes conversation messages for both parties', async () => {
    await createMessage({ senderId: userA.id, receiverId: userB.id, text: 'Msg 1' });
    await createMessage({ senderId: userB.id, receiverId: userA.id, text: 'Msg 2' });
    await createMessage({ senderId: userA.id, receiverId: userC.id, text: 'Msg with C' });

    const req = new Request('http://localhost:3000/api/messages/clear', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `${SESSION_COOKIE_NAME}=${tokenA}`,
      },
      body: JSON.stringify({
        userId: userA.id,
        contactId: userB.id,
      }),
    });

    const res = await clearPost(req);
    assert.equal(res.status, 200);

    // Messages between A and B are wiped
    const msgsAB = await getConversationMessages(userA.id, userB.id);
    assert.equal(msgsAB.length, 0);

    // Messages between A and C remain intact
    const msgsAC = await getConversationMessages(userA.id, userC.id);
    assert.equal(msgsAC.length, 1);
  });

  test('POST /api/messages/clear rejects non-participants', async () => {
    const req = new Request('http://localhost:3000/api/messages/clear', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `${SESSION_COOKIE_NAME}=${tokenC}`,
      },
      body: JSON.stringify({
        userId: userA.id,
        contactId: userB.id,
      }),
    });

    const res = await clearPost(req);
    assert.equal(res.status, 403);
  });

  // -------------------------------------------------------------
  // Single Message Deletion Tests
  // -------------------------------------------------------------
  test('DELETE /api/messages deletes individual message when authenticated', async () => {
    const msg = await createMessage({
      senderId: userA.id,
      receiverId: userB.id,
      text: 'Message to be deleted',
    });

    const beforeMsgs = await getConversationMessages(userA.id, userB.id);
    assert.equal(beforeMsgs.some((m) => m.id === msg.id), true);

    const req = new Request(`http://localhost:3000/api/messages?messageId=${msg.id}`, {
      method: 'DELETE',
      headers: {
        Cookie: `${SESSION_COOKIE_NAME}=${tokenA}`,
      },
    });

    const res = await messagesDelete(req);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.deleted, true);

    const afterMsgs = await getConversationMessages(userA.id, userB.id);
    assert.equal(afterMsgs.some((m) => m.id === msg.id), false);
  });

  test('DELETE /api/messages with mode=forMe hides message from caller but retains it for other participant', async () => {
    const msg = await createMessage({
      senderId: userA.id,
      receiverId: userB.id,
      text: 'Secret message deleted for me only',
    });

    const req = new Request(`http://localhost:3000/api/messages?messageId=${msg.id}&mode=forMe`, {
      method: 'DELETE',
      headers: {
        Cookie: `${SESSION_COOKIE_NAME}=${tokenA}`,
      },
    });

    const res = await messagesDelete(req);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.mode, 'forMe');

    // Hidden from userA
    const msgsForA = await getConversationMessages(userA.id, userB.id, userA.id);
    assert.equal(msgsForA.some((m) => m.id === msg.id), false);

    // Still visible for userB
    const msgsForB = await getConversationMessages(userB.id, userA.id, userB.id);
    assert.equal(msgsForB.some((m) => m.id === msg.id), true);
  });

  test('DELETE /api/messages rejects unauthenticated caller', async () => {
    const msg = await createMessage({
      senderId: userA.id,
      receiverId: userB.id,
      text: 'Cannot delete without auth',
    });

    const req = new Request(`http://localhost:3000/api/messages?messageId=${msg.id}`, {
      method: 'DELETE',
    });

    const res = await messagesDelete(req);
    assert.equal(res.status, 403);
  });

  // -------------------------------------------------------------
  // UI Component Contract & Accessibility Checks
  // -------------------------------------------------------------
  test('ChatWindow.tsx includes image attachments, lightbox dialog, reactions, and clear modal', () => {
    const chatWindowPath = path.join(projectRoot, 'src', 'components', 'ChatWindow.tsx');
    const content = fs.readFileSync(chatWindowPath, 'utf-8');

    // Image file attachment & staging
    assert.match(content, /handleFileSelect/);
    assert.match(content, /accept=["']image\/jpeg,image\/png,image\/webp,image\/gif["']/);
    assert.match(content, /selectedImage/);

    // Video file attachment, staging, & player
    assert.match(content, /handleVideoSelect/);
    assert.match(content, /selectedVideo/);
    assert.match(content, /<video/);

    // Lightbox modal with accessible role and Escape key support
    assert.match(content, /role=["']dialog["']/);
    assert.match(content, /aria-label=["']Image preview["']/);
    assert.match(content, /closeLightbox/);

    // 6-Reaction system
    assert.match(content, /REACTION_EMOJIS/);
    assert.match(content, /renderReactionSummary/);

    // Clear chat confirmation dialog
    assert.match(content, /showClearConfirm/);
    assert.match(content, /Clear this conversation\?/);

    // WhatsApp-style message options menu
    assert.match(content, /ChevronDown/);
    assert.match(content, /activeMenuMsgId/);
    assert.match(content, /Reply/);
    assert.match(content, /Pin/);
    assert.match(content, /Star/);
    assert.match(content, /Delete/);

    // WhatsApp Panic button & Delete for everyone / Delete for me options
    assert.match(content, /Panic/);
    assert.match(content, /Delete for everyone/);
    assert.match(content, /Delete for me/);
    assert.match(content, /Passcode Encrypted/);
  });
});

