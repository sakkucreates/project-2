process.env.NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import { validateMessageContent } from '../src/lib/validation.ts';
import { encryptMessage, decryptMessage, isEncryptedMessage } from '../src/lib/crypto.ts';
import {
  setUserTyping,
  getUserTypingTo,
  createUser,
  createMessage,
  getConversationMessages,
  deleteMessage,
} from '../src/lib/db.ts';
import { POST as typingPost, GET as typingGet } from '../src/app/api/users/typing/route.ts';
import { POST as messagesPost, DELETE as messagesDelete } from '../src/app/api/messages/route.ts';
import { createSessionToken } from '../src/lib/auth.ts';
import fs from 'node:fs';
import path from 'node:path';

test('Feature 1: 🎙️ Voice Notes / Audio Messages Validation & Schema', async (t) => {
  await t.test('accepts valid audio base64 data URI voice notes', () => {
    const validAudioDataUri = 'data:audio/webm;base64,GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQRChYECGFOAZwEAAAA';
    const result = validateMessageContent('', undefined, undefined, validAudioDataUri);
    assert.equal(result.audio, validAudioDataUri);
    assert.equal(result.text, '');
  });

  await t.test('rejects unsupported audio formats (e.g. audio/flac)', () => {
    const invalidAudio = 'data:audio/flac;base64,fLaC000000';
    assert.throws(
      () => validateMessageContent('', undefined, undefined, invalidAudio),
      /Invalid or unsupported audio format/
    );
  });

  await t.test('rejects oversized audio attachments', () => {
    // Generate base64 data URI exceeding 15MB limit
    const hugeAudio = 'data:audio/webm;base64,' + 'A'.repeat(21 * 1024 * 1024);
    assert.throws(
      () => validateMessageContent('', undefined, undefined, hugeAudio),
      /Audio voice note exceeds 15MB limit/
    );
  });

  await t.test('POST /api/messages persists audio voice notes', async () => {
    const sender = await createUser({
      name: 'VN Sender',
      code: 'vn11',
      role: 'user',
      avatar: '🎙️',
    });
    const receiver = await createUser({
      name: 'VN Receiver',
      code: 'vn22',
      role: 'user',
      avatar: '🎧',
    });

    const validAudio = 'data:audio/webm;base64,GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQRChYECGFOAZwEAAAA';
    const token = createSessionToken(sender);
    const req = new Request('http://localhost:3000/api/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `lumachat_session=${token}`,
      },
      body: JSON.stringify({
        receiverId: receiver.id,
        audio: validAudio,
      }),
    });

    const res = await messagesPost(req);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.message.audio, validAudio);
  });

  await t.test('ChatWindow.tsx contains AudioBubblePlayer and Mic button', () => {
    const chatWindowPath = path.resolve(process.cwd(), 'src/components/ChatWindow.tsx');
    const content = fs.readFileSync(chatWindowPath, 'utf8');
    assert.ok(content.includes('AudioBubblePlayer'), 'ChatWindow should define AudioBubblePlayer');
    assert.ok(content.includes('Record voice note') || content.includes('startRecording'), 'ChatWindow should have voice recording controls');
    assert.ok(content.includes('Recording voice note...'), 'ChatWindow should display live recording bar with timer');
  });
});

test('Feature 2: ⌨️ Live "Typing..." Indicator', async (t) => {
  await t.test('setUserTyping and getUserTypingTo tracks active typing status', () => {
    setUserTyping('usr_alice', 'usr_bob');
    assert.equal(getUserTypingTo('usr_alice'), 'usr_bob');

    // Clearing typing
    setUserTyping('usr_alice', null);
    assert.equal(getUserTypingTo('usr_alice'), null);
  });

  await t.test('POST /api/users/typing updates typing status for authenticated user', async () => {
    const typer = await createUser({
      name: 'Typer User',
      code: 'type11',
      role: 'user',
      avatar: '⌨️',
    });
    const listener = await createUser({
      name: 'Listener User',
      code: 'type22',
      role: 'user',
      avatar: '👂',
    });

    const token = createSessionToken(typer);
    const req = new Request('http://localhost:3000/api/users/typing', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `lumachat_session=${token}`,
      },
      body: JSON.stringify({
        receiverId: listener.id,
        isTyping: true,
      }),
    });

    const res = await typingPost(req);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.typingTo, listener.id);
    assert.equal(getUserTypingTo(typer.id), listener.id);
  });

  await t.test('GET /api/users/typing returns whether contact is typing', async () => {
    setUserTyping('usr_contact_typer', 'usr_current_user');
    const req = new Request('http://localhost:3000/api/users/typing?userId=usr_current_user&contactId=usr_contact_typer');
    const res = await typingGet(req);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.isTyping, true);
    assert.equal(data.typingTo, 'usr_current_user');
  });

  await t.test('ContactsSidebar.tsx displays typing... in glowing emerald text', () => {
    const sidebarPath = path.resolve(process.cwd(), 'src/components/ContactsSidebar.tsx');
    const content = fs.readFileSync(sidebarPath, 'utf8');
    assert.ok(content.includes('typing...'), 'ContactsSidebar should render typing indicator');
    assert.ok(content.includes('user.typingTo === currentUser.id'), 'ContactsSidebar should check typingTo against currentUser.id');
  });
});

test('Feature 3: 🚨 Panic / Quick-Exit Shortcut (Stealth Mode)', async (t) => {
  await t.test('page.tsx implements global Esc (Escape) key listener and header Panic trigger', () => {
    const pagePath = path.resolve(process.cwd(), 'src/app/page.tsx');
    const content = fs.readFileSync(pagePath, 'utf8');
    assert.ok(content.includes("e.key === 'Escape'"), 'page.tsx should listen for Escape key');
    assert.ok(content.includes('handlePanic'), 'page.tsx should invoke handlePanic on Escape');
    assert.ok(content.includes('disguiseMode'), 'page.tsx should set disguise mode storage key');
  });

  await t.test('ChatWindow.tsx includes discreet Panic button with shield icon', () => {
    const chatWindowPath = path.resolve(process.cwd(), 'src/components/ChatWindow.tsx');
    const content = fs.readFileSync(chatWindowPath, 'utf8');
    assert.ok(content.includes('Panic') && content.includes('ShieldAlert'), 'ChatWindow should have Panic shield button');
  });
});

test('Feature 4: 🗑️ "Delete for Everyone" Individual Message Deletion', async (t) => {
  await t.test('ChatWindow.tsx displays hover trash icon next to options chevron', () => {
    const chatWindowPath = path.resolve(process.cwd(), 'src/components/ChatWindow.tsx');
    const content = fs.readFileSync(chatWindowPath, 'utf8');
    assert.ok(content.includes('right-6') && content.includes('Trash2'), 'ChatWindow should have hover trash icon button at right-6');
    assert.ok(content.includes('Delete for everyone'), 'ChatWindow delete modal should have Delete for everyone');
  });

  await t.test('DELETE /api/messages with mode=everyone removes message from store for both participants', async () => {
    const sender = await createUser({
      name: 'Del User A',
      code: 'del11',
      role: 'user',
      avatar: '🗑️',
    });
    const receiver = await createUser({
      name: 'Del User B',
      code: 'del22',
      role: 'user',
      avatar: '👤',
    });

    const msg = await createMessage({
      senderId: sender.id,
      receiverId: receiver.id,
      text: 'Message to delete for everyone',
    });

    const token = createSessionToken(sender);
    const req = new Request(`http://localhost:3000/api/messages?messageId=${msg.id}&mode=everyone`, {
      method: 'DELETE',
      headers: {
        Cookie: `lumachat_session=${token}`,
      },
    });

    const res = await messagesDelete(req);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.mode, 'everyone');

    // Confirm removed from conversation history for both sender and receiver
    const senderMsgs = await getConversationMessages(sender.id, receiver.id, sender.id);
    assert.ok(!senderMsgs.some((m) => m.id === msg.id));
    const receiverMsgs = await getConversationMessages(sender.id, receiver.id, receiver.id);
    assert.ok(!receiverMsgs.some((m) => m.id === msg.id));
  });
});

test('Feature 5: 🔒 End-to-End Chat Encryption (E2EE)', async (t) => {
  await t.test('encrypts plaintext to AES-GCM ciphertext format ENC:...', async () => {
    const plain = 'Super sensitive secret message 12345';
    const encrypted = await encryptMessage(plain, 'usr_alice', 'usr_bob');
    assert.ok(encrypted.startsWith('ENC:'), 'Ciphertext must start with ENC:');
    assert.notEqual(encrypted, plain);
    assert.ok(isEncryptedMessage(encrypted));
  });

  await t.test('decrypts ciphertext symmetrically regardless of participant order', async () => {
    const secret = 'Confidential conversation content';
    const encrypted = await encryptMessage(secret, 'usr_alice', 'usr_bob');

    // Alice decrypts
    const decryptedByAlice = await decryptMessage(encrypted, 'usr_alice', 'usr_bob');
    assert.equal(decryptedByAlice, secret);

    // Bob decrypts with reversed participant argument order
    const decryptedByBob = await decryptMessage(encrypted, 'usr_bob', 'usr_alice');
    assert.equal(decryptedByBob, secret);
  });

  await t.test('backward compatibility: non-encrypted messages pass through untouched', async () => {
    const legacyPlaintext = 'Older unencrypted message from yesterday';
    const result = await decryptMessage(legacyPlaintext, 'usr_alice', 'usr_bob');
    assert.equal(result, legacyPlaintext);
  });
});
