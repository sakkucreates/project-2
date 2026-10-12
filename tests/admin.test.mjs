process.env.NODE_ENV = 'test';

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  createUser,
  getUserById,
  getAllUsers,
  updateUser,
  resetDatabase,
  createMessage,
} from '../src/lib/db.ts';
import {
  GET as adminUsersGet,
  POST as adminUsersPost,
  PUT as adminUsersPut,
  DELETE as adminUsersDelete,
} from '../src/app/api/admin/users/route.ts';
import { POST as adminResetPost } from '../src/app/api/admin/reset/route.ts';
import { createSessionToken } from '../src/lib/auth.ts';
import { APP_CONFIG } from '../src/lib/config.ts';

const projectRoot = process.cwd();

describe('LumaChat Phase 7: Admin Dashboard & Management Tests', () => {
  let adminRoot;
  let adminToken;
  let regularUser;
  let userToken;

  beforeEach(async () => {
    await resetDatabase();
    // Default admin created during resetDatabase / initial data
    const users = await getAllUsers();
    adminRoot = users.find((u) => u.id === APP_CONFIG.adminRootId || u.role === 'admin');
    if (!adminRoot) {
      adminRoot = await createUser({
        id: APP_CONFIG.adminRootId,
        name: 'Administrator',
        code: '@2021',
        role: 'admin',
        avatar: '🛡️',
      });
    }
    adminToken = await createSessionToken(adminRoot);

    regularUser = await createUser({
      name: 'Regular Bob',
      code: '7001',
      role: 'user',
      avatar: '👨',
    });
    userToken = await createSessionToken(regularUser);
  });

  // -------------------------------------------------------------
  // Authorization Guards
  // -------------------------------------------------------------
  describe('Admin Authorization Enforcement', () => {
    test('Non-admin or unauthenticated callers cannot perform administrative mutations', async () => {
      // 1. Unauthenticated POST /api/admin/users -> 401
      const reqUnauthPost = new Request('http://localhost/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Imposter', code: '7777' }),
      });
      const resUnauthPost = await adminUsersPost(reqUnauthPost);
      assert.equal(resUnauthPost.status, 401);

      // 2. Regular user POST /api/admin/users -> 403
      const reqUserPost = new Request('http://localhost/api/admin/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userToken}`,
        },
        body: JSON.stringify({ name: 'Sneaky User', code: '7778' }),
      });
      const resUserPost = await adminUsersPost(reqUserPost);
      assert.equal(resUserPost.status, 403);

      // 3. Regular user PUT /api/admin/users -> 403
      const reqUserPut = new Request('http://localhost/api/admin/users', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userToken}`,
        },
        body: JSON.stringify({ id: regularUser.id, name: 'Renamed Bob' }),
      });
      const resUserPut = await adminUsersPut(reqUserPut);
      assert.equal(resUserPut.status, 403);

      // 4. Regular user DELETE /api/admin/users -> 403
      const reqUserDel = new Request(`http://localhost/api/admin/users?id=${regularUser.id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${userToken}`,
        },
      });
      const resUserDel = await adminUsersDelete(reqUserDel);
      assert.equal(resUserDel.status, 403);

      // 5. Regular user POST /api/admin/reset -> 403
      const reqUserReset = new Request('http://localhost/api/admin/reset', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${userToken}`,
        },
      });
      const resUserReset = await adminResetPost(reqUserReset);
      assert.equal(resUserReset.status, 403);
    });

    test('GET /api/admin/users returns full records for admins and sanitized records for non-admins', async () => {
      // Create user with private admin notes
      await createUser({
        name: 'Private Notes Subject',
        code: '7009',
        role: 'user',
        avatar: '🕵️',
        notes: 'Secret internal admin notes',
      });

      // Admin request
      const reqAdmin = new Request('http://localhost/api/admin/users', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const resAdmin = await adminUsersGet(reqAdmin);
      assert.equal(resAdmin.status, 200);
      const dataAdmin = await resAdmin.json();
      const subjectAdmin = dataAdmin.users.find((u) => u.name === 'Private Notes Subject');
      assert.ok(subjectAdmin);
      assert.equal(subjectAdmin.notes, 'Secret internal admin notes');

      // Unauthenticated / regular request
      const reqPublic = new Request('http://localhost/api/admin/users');
      const resPublic = await adminUsersGet(reqPublic);
      assert.equal(resPublic.status, 200);
      const dataPublic = await resPublic.json();
      const subjectPublic = dataPublic.users.find((u) => u.name === 'Private Notes Subject');
      assert.ok(subjectPublic);
      assert.equal(subjectPublic.notes, undefined);
    });
  });

  // -------------------------------------------------------------
  // Account Creation & Passcode Handling
  // -------------------------------------------------------------
  describe('Account Creation & Passcode Logic', () => {
    test('Admin can create account with auto-generated 4-digit numeric passcode', async () => {
      const req = new Request('http://localhost/api/admin/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          name: 'Auto Code User',
          avatar: '🐱',
          role: 'user',
          notes: 'Auto generated code test',
        }),
      });

      const res = await adminUsersPost(req);
      assert.equal(res.status, 201);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.ok(data.user);
      assert.equal(data.user.name, 'Auto Code User');
      assert.match(data.user.code, /^\d{4}$/, 'Auto generated passcode must be exactly 4 digits');
    });

    test('Admin can create account with valid custom passcode and duplicate passcode is rejected', async () => {
      // 1. Create with custom code '7890'
      const req1 = new Request('http://localhost/api/admin/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          name: 'Custom User One',
          code: '7890',
          role: 'user',
          avatar: '🦊',
        }),
      });

      const res1 = await adminUsersPost(req1);
      assert.equal(res1.status, 201);
      const data1 = await res1.json();
      assert.equal(data1.user.code, '7890');

      // 2. Attempt duplicate code '7890' -> 400
      const req2 = new Request('http://localhost/api/admin/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          name: 'Custom User Two',
          code: '7890',
          role: 'user',
        }),
      });

      const res2 = await adminUsersPost(req2);
      assert.equal(res2.status, 400);
      const data2 = await res2.json();
      assert.match(data2.error, /already in use/i);
    });
  });

  // -------------------------------------------------------------
  // Account Modification & Root Safeguards
  // -------------------------------------------------------------
  describe('Account Updates & Protection Safeguards', () => {
    test('Admin can update user name, avatar, notes, role, and passcode', async () => {
      const targetUser = await createUser({
        name: 'Mod Target',
        code: '7111',
        role: 'user',
        avatar: '👤',
      });

      const req = new Request('http://localhost/api/admin/users', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          id: targetUser.id,
          name: 'Modified Name',
          code: '7222',
          avatar: '🚀',
          role: 'admin',
          notes: 'Promoted to admin',
        }),
      });

      const res = await adminUsersPut(req);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.equal(data.user.name, 'Modified Name');
      assert.equal(data.user.code, '7222');
      assert.equal(data.user.avatar, '🚀');
      assert.equal(data.user.role, 'admin');
      assert.equal(data.user.notes, 'Promoted to admin');
    });

    test('Rejects updating primary admin root role away from admin', async () => {
      const req = new Request('http://localhost/api/admin/users', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          id: APP_CONFIG.adminRootId,
          role: 'user',
        }),
      });

      const res = await adminUsersPut(req);
      assert.equal(res.status, 403);
      const data = await res.json();
      assert.match(data.error, /primary system administrator/i);
    });

    test('Rejects deleting primary admin root (admin_root)', async () => {
      const req = new Request(`http://localhost/api/admin/users?id=${APP_CONFIG.adminRootId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      const res = await adminUsersDelete(req);
      assert.equal(res.status, 403);
      const data = await res.json();
      assert.match(data.error, /primary administrator account cannot be deleted/i);
    });

    test('Rejects deleting the last remaining administrator account', async () => {
      // 1. Create a secondary admin
      const secondaryAdmin = await createUser({
        name: 'Secondary Admin',
        code: '7999',
        role: 'admin',
        avatar: '🛡️',
      });

      // 2. Verify deleting secondary admin works when adminRoot is present
      const reqDelSecondary = new Request(`http://localhost/api/admin/users?id=${secondaryAdmin.id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });
      const resDelSecondary = await adminUsersDelete(reqDelSecondary);
      assert.equal(resDelSecondary.status, 200);

      // 3. Create a sole admin, demote adminRoot directly in storage, and verify deleting the sole admin fails
      const soleAdmin = await createUser({
        name: 'Sole Admin',
        code: '7998',
        role: 'admin',
        avatar: '🛡️',
      });
      await updateUser(adminRoot.id, { role: 'user' });
      const soleAdminToken = await createSessionToken(soleAdmin);

      const reqDelSole = new Request(`http://localhost/api/admin/users?id=${soleAdmin.id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${soleAdminToken}`,
        },
      });
      const resDelSole = await adminUsersDelete(reqDelSole);
      assert.equal(resDelSole.status, 403);
      const dataDelSole = await resDelSole.json();
      assert.match(dataDelSole.error, /final administrator account/i);

      // Verify deleting a regular user works
      const reqDelUser = new Request(`http://localhost/api/admin/users?id=${regularUser.id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${soleAdminToken}`,
        },
      });
      const resDelUser = await adminUsersDelete(reqDelUser);
      assert.equal(resDelUser.status, 200);
      assert.equal(await getUserById(regularUser.id), null);
    });
  });

  // -------------------------------------------------------------
  // Demo Database Reset
  // -------------------------------------------------------------
  describe('Demo Database Reset Endpoint', () => {
    test('POST /api/admin/reset clears messages and non-admin accounts but retains admin root', async () => {
      // Create some messages
      await createMessage({
        senderId: adminRoot.id,
        receiverId: regularUser.id,
        text: 'Pre-reset message',
      });

      const reqReset = new Request('http://localhost/api/admin/reset', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      const resReset = await adminResetPost(reqReset);
      assert.equal(resReset.status, 200);
      const dataReset = await resReset.json();
      assert.equal(dataReset.success, true);

      // Verify admin root still exists and has admin role
      const usersAfter = await getAllUsers();
      const adminAfter = usersAfter.find((u) => u.id === APP_CONFIG.adminRootId || u.role === 'admin');
      assert.ok(adminAfter, 'Admin account must persist after reset');
      assert.equal(adminAfter.role, 'admin');

      // Regular user created before reset should be wiped
      const userAfter = await getUserById(regularUser.id);
      assert.equal(userAfter, null, 'Non-admin user must be wiped upon reset');
    });
  });

  // -------------------------------------------------------------
  // Admin Dashboard UI & Component Integrity
  // -------------------------------------------------------------
  describe('AdminDashboard Component Static & Accessibility Integrity', () => {
    const adminComponentPath = path.join(projectRoot, 'src', 'components', 'AdminDashboard.tsx');

    test('AdminDashboard.tsx exists and is a valid client component', () => {
      assert.ok(fs.existsSync(adminComponentPath), 'AdminDashboard.tsx should exist');
      const content = fs.readFileSync(adminComponentPath, 'utf8');
      assert.ok(content.includes("'use client'"), 'Should be a client component');
      assert.ok(content.includes('export default function AdminDashboard'), 'Exports AdminDashboard');
    });

    test('Includes responsive overview metric cards (Total, Regular, Admins, Online)', () => {
      const content = fs.readFileSync(adminComponentPath, 'utf8');
      assert.ok(content.includes('Total Users'), 'Has Total Users metric');
      assert.ok(content.includes('Regular Users'), 'Has Regular Users metric');
      assert.ok(content.includes('Administrators'), 'Has Administrators metric');
      assert.ok(content.includes('Active / Online') || content.includes('Online'), 'Has Active / Online metric');
    });

    test('Includes user search and role filter controls', () => {
      const content = fs.readFileSync(adminComponentPath, 'utf8');
      assert.ok(content.includes('searchQuery'), 'Contains search query state');
      assert.ok(content.includes('roleFilter'), 'Contains role filter state');
      assert.ok(content.includes('filterUsers') || content.includes('filteredUsers'), 'Filters user collection');
    });

    test('Supports direct link copy and WhatsApp sharing workflow', () => {
      const content = fs.readFileSync(adminComponentPath, 'utf8');
      assert.ok(content.includes('api.whatsapp.com/send') || content.includes('wa.me'), 'Includes WhatsApp share URL');
      assert.ok(content.includes('navigator.clipboard.writeText') || content.includes('handleCopyLink'), 'Handles clipboard copy');
      assert.ok(content.includes('code='), 'Includes passcode parameter in share URL');
    });

    test('Contains modal dialogs with accessible attributes and close buttons', () => {
      const content = fs.readFileSync(adminComponentPath, 'utf8');
      assert.ok(content.includes('role="dialog"'), 'Uses dialog accessibility role');
      assert.ok(content.includes('aria-modal="true"'), 'Declares aria-modal attribute');
      assert.ok(content.includes('Confirm Demo Reset') || content.includes('Demo Database Reset'), 'Contains Demo Reset dialog');
      assert.ok(content.includes('Delete Account'), 'Contains Delete Account confirmation dialog');
      assert.ok(content.includes('Edit Account'), 'Contains Edit Account dialog');
    });
  });
});
