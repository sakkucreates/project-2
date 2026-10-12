import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkPasscodeRateLimit, recordFailedPasscodeAttempt, resetPasscodeRateLimit } from '../src/lib/auth.ts';
import { getApproximateBase64Bytes, MAX_COMPRESSED_BINARY_BYTES } from '../src/lib/imageCompression.ts';
import nextConfig from '../next.config.ts';

test('Production Hardening: Image compression byte size estimation', () => {
  assert.equal(MAX_COMPRESSED_BINARY_BYTES, 2 * 1024 * 1024);

  // A 4-character base64 string should approximate to 3 bytes
  const sample1 = 'data:image/png;base64,AAAA';
  const size1 = getApproximateBase64Bytes(sample1);
  assert.equal(size1, 3);

  // A 12-character base64 string should approximate to 9 bytes
  const sample2 = 'data:image/png;base64,AAAAAAAAAAAA';
  const size2 = getApproximateBase64Bytes(sample2);
  assert.equal(size2, 9);
});

test('Production Hardening: Security HTTP headers configured in next.config.ts', async () => {
  const config = nextConfig.default || nextConfig;
  assert.ok(typeof config.headers === 'function', 'nextConfig must define a headers function');
  const headersConfig = await config.headers();
  assert.ok(Array.isArray(headersConfig), 'headers() must return an array');
  
  const rootRoute = headersConfig.find(h => h.source === '/:path*');
  assert.ok(rootRoute, 'Root wildcard route "/:path*" must be configured');

  const headerMap = new Map(rootRoute.headers.map(h => [h.key, h.value]));
  assert.equal(headerMap.get('Referrer-Policy'), 'strict-origin-when-cross-origin');
  assert.equal(headerMap.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(headerMap.get('X-Frame-Options'), 'SAMEORIGIN');
  assert.equal(headerMap.get('X-XSS-Protection'), '1; mode=block');
});

test('Production Hardening: Distributed rate limiting bounds and reset', async () => {
  const testClient = 'hardening_test_client_' + Date.now();

  // Initially clear
  await resetPasscodeRateLimit(testClient);
  await assert.doesNotReject(() => checkPasscodeRateLimit(testClient));

  // Record 5 failed attempts (allowed threshold)
  for (let i = 1; i <= 5; i++) {
    await recordFailedPasscodeAttempt(testClient);
  }

  // 6th attempt must be rejected with 429
  await assert.rejects(
    async () => {
      await checkPasscodeRateLimit(testClient);
    },
    (err) => {
      assert.ok(err.message.includes('Too many failed login attempts'));
      return true;
    }
  );

  // Successful login resets rate limit
  await resetPasscodeRateLimit(testClient);
  await assert.doesNotReject(() => checkPasscodeRateLimit(testClient));
});

test('Production Hardening: Direct authentication links use secure hash fragments', async () => {
  const fs = await import('fs');
  const path = await import('path');

  // Verify AdminDashboard share link generation uses #code=
  const adminComponent = fs.readFileSync(path.resolve('src/components/AdminDashboard.tsx'), 'utf-8');
  assert.ok(
    adminComponent.includes('/#code='),
    'AdminDashboard must construct direct authentication links using hash fragments (/#code=)'
  );
  assert.ok(
    !adminComponent.includes('/?code='),
    'AdminDashboard must not construct direct links using query strings (/?code=)'
  );

  // Verify page.tsx prioritizes window.location.hash and purges URL
  const pageComponent = fs.readFileSync(path.resolve('src/app/page.tsx'), 'utf-8');
  assert.ok(
    pageComponent.includes('window.location.hash'),
    'page.tsx must inspect window.location.hash for direct authentication'
  );
  assert.ok(
    pageComponent.includes('window.history.replaceState'),
    'page.tsx must purge hash fragment from URL history immediately after extraction'
  );
});

test('Production Hardening: Production DB initialization script safety guards', async () => {
  const fs = await import('fs');
  const path = await import('path');

  const scriptContent = fs.readFileSync(path.resolve('scripts/init-production-db.mjs'), 'utf-8');
  assert.ok(
    scriptContent.includes('SETNX'),
    'DB init script must use atomic SETNX to avoid overwriting existing data'
  );
  assert.ok(
    scriptContent.includes('--dry-run'),
    'DB init script must support a --dry-run option'
  );
  assert.ok(
    scriptContent.includes('admin_root'),
    'DB init script must seed admin_root account'
  );
  assert.ok(
    scriptContent.includes('Sakshi'),
    'DB init script must seed Sakshi account'
  );
  assert.ok(
    !scriptContent.includes('console.log(ADMIN_CODE') && !scriptContent.includes('console.log(sakshiPasscode'),
    'DB init script must not print or log secret passcodes'
  );
});
