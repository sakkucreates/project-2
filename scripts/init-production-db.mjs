#!/usr/bin/env node
/**
 * LumaChat Production Database Initialization Script
 *
 * Idempotently initializes a fresh Upstash Redis / Vercel KV instance
 * with exactly two active accounts:
 *   1. System Administrator ('admin_root')
 *   2. Regular User ('Sakshi')
 *
 * Safety & Security Guarantees:
 * - Uses atomic Redis SETNX to prevent overwriting existing production data.
 * - Aborts safely without modifications if `lumachat_users` already exists.
 * - Never logs or prints passcodes, bearer tokens, or session secrets.
 * - Does not migrate private messages or demo accounts.
 *
 * Usage:
 *   node scripts/init-production-db.mjs [--dry-run]
 *
 * Required Environment Variables:
 *   KV_REST_API_URL or UPSTASH_REDIS_REST_URL
 *   KV_REST_API_TOKEN or UPSTASH_REDIS_REST_TOKEN
 *   ADMIN_CODE: Production passcode for admin_root
 *   SAKSHI_CODE (optional): Passcode for Sakshi (auto-generated if omitted)
 */

import crypto from 'crypto';

const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const ADMIN_CODE = process.env.ADMIN_CODE;
const SAKSHI_CODE = process.env.SAKSHI_CODE;
const isDryRun = process.argv.includes('--dry-run');

async function executeKv(command) {
  if (!KV_URL || !KV_TOKEN) {
    throw new Error('Missing KV_REST_API_URL or KV_REST_API_TOKEN environment variable.');
  }

  let url = KV_URL.trim();
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${KV_TOKEN.trim()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Upstash Redis HTTP ${res.status}: ${text}`);
  }

  const json = await res.json();
  if (json.error) {
    throw new Error(`Upstash Redis Error: ${json.error}`);
  }

  return json.result;
}

async function main() {
  console.log('[LumaChat] Production Database Initialization');
  console.log('----------------------------------------------------');

  if (isDryRun) {
    console.log('[Mode] DRY RUN - No changes will be written.');
  }

  if (!KV_URL || !KV_TOKEN) {
    console.error('[Error] Required environment variables KV_REST_API_URL and KV_REST_API_TOKEN are missing.');
    console.error('Please configure your Upstash Redis credentials before running this script.');
    process.exit(1);
  }

  if (!ADMIN_CODE || ADMIN_CODE.trim() === '') {
    console.error('[Error] ADMIN_CODE environment variable is required to seed the administrator account.');
    console.error('Set ADMIN_CODE in your environment before running this script.');
    process.exit(1);
  }

  console.log('[Check] Verifying Redis connection and checking existing user table...');

  let existingUsers = null;
  try {
    const rawUsers = await executeKv(['GET', 'lumachat_users']);
    if (rawUsers) {
      existingUsers = typeof rawUsers === 'string' ? JSON.parse(rawUsers) : rawUsers;
    }
  } catch (err) {
    console.error('[Error] Failed to connect to Upstash Redis:', err.message);
    process.exit(1);
  }

  if (Array.isArray(existingUsers) && existingUsers.length > 0) {
    console.log(`[Abort] Database already contains initialized users (${existingUsers.length} accounts found).`);
    console.log('[Abort] Idempotency guard triggered: No production accounts or data were modified.');
    process.exit(0);
  }

  // Generate Sakshi passcode if not explicitly supplied
  const sakshiPasscode = SAKSHI_CODE && SAKSHI_CODE.trim() !== ''
    ? SAKSHI_CODE.trim()
    : crypto.randomInt(1000, 10000).toString();

  const nowIso = new Date().toISOString();

  const seedUsers = [
    {
      id: 'admin_root',
      name: 'Admin / Support',
      code: ADMIN_CODE.trim(),
      role: 'admin',
      avatar: '🛡️',
      status: 'offline',
      lastSeen: nowIso,
      createdAt: nowIso,
      notes: 'System Administrator Account',
    },
    {
      id: `usr_${crypto.randomBytes(4).toString('hex')}`,
      name: 'Sakshi',
      code: sakshiPasscode,
      role: 'user',
      avatar: '🌸',
      status: 'offline',
      lastSeen: nowIso,
      createdAt: nowIso,
      notes: 'Primary User Account',
    },
  ];

  if (isDryRun) {
    console.log('[Dry Run] Accounts prepared for initialization:');
    seedUsers.forEach((u) => {
      console.log(`  - Account ID: ${u.id} | Name: "${u.name}" | Role: ${u.role} (Passcode: [CONFIGURED / NOT LOGGED])`);
    });
    console.log('[Dry Run] Completed without making modifications.');
    process.exit(0);
  }

  console.log('[Write] Executing atomic SETNX on "lumachat_users"...');
  const setResult = await executeKv(['SETNX', 'lumachat_users', JSON.stringify(seedUsers)]);

  if (setResult === 0 || setResult === '0') {
    console.log('[Abort] Atomic SETNX returned 0 (key was created concurrently). No changes overwritten.');
    process.exit(0);
  }

  console.log('[Success] Production database successfully initialized!');
  console.log('[Summary] Created accounts:');
  seedUsers.forEach((u) => {
    console.log(`  - ID: ${u.id} | Name: "${u.name}" | Role: ${u.role}`);
  });
  console.log('----------------------------------------------------');
  console.log('[Security Note] Passcodes were securely committed to Upstash Redis and were never displayed in console logs.');
  if (!SAKSHI_CODE) {
    console.log('[Notice] Sakshi passcode was auto-generated. Administrator can view/share it directly via the Admin Dashboard.');
  }
}

main().catch((err) => {
  console.error('[Fatal Error]', err.message);
  process.exit(1);
});
