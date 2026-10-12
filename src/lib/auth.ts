import crypto from 'crypto';
import { User, UserRole } from '@/types';
import { findUserByCode, getUserById, isProductionEnvironment, isKvConfigured, executeKvCommand } from '@/lib/db';
import { UnauthorizedError, ForbiddenError, RateLimitError } from '@/lib/errors';

export const SESSION_COOKIE_NAME = 'lumachat_session';
export const CSRF_COOKIE_NAME = 'lumachat_csrf';

// Server-side signing secret
const AUTH_SECRET =
  process.env.AUTH_SECRET ||
  process.env.ADMIN_CODE ||
  'lumachat_secret_key_f839c4a89d1b02e7';

export interface SessionTokenPayload {
  userId: string;
  role: UserRole;
  name: string;
  iat: number;
  exp: number;
}

// In-memory sliding window rate limiter fallback for non-Redis development/testing
interface RateLimitRecord {
  count: number;
  resetAt: number;
}
const rateLimitMap = new Map<string, RateLimitRecord>();

/**
 * Sanitizes and normalizes client IP for rate limiting key.
 * Prevents key collision, injection, and invalid characters in Redis keys.
 */
function sanitizeRateLimitKey(clientKey: string): string {
  const sanitized = clientKey.trim().replace(/[^a-zA-Z0-9.:_-]/g, '').slice(0, 64);
  return `lumachat_ratelimit:${sanitized || 'anonymous'}`;
}

/**
 * Checks passcode verification attempts.
 * Max 5 failed attempts within a 60-second window.
 * Enforces distributed rate limiting in Upstash Redis when configured,
 * and fails safely in production if rate limiting infrastructure is unavailable.
 */
export async function checkPasscodeRateLimit(clientKey: string): Promise<void> {
  // Distributed path: Upstash Redis
  if (isKvConfigured()) {
    const redisKey = sanitizeRateLimitKey(clientKey);
    try {
      const countRaw = await executeKvCommand(['GET', redisKey]);
      const count = countRaw ? Number(countRaw) : 0;
      if (count >= 5) {
        const ttlRaw = (await executeKvCommand(['TTL', redisKey])) as number | null;
        const ttl = typeof ttlRaw === 'number' && ttlRaw > 0 ? ttlRaw : 60;
        throw new RateLimitError(
          `Too many failed login attempts. Please try again in ${ttl} seconds.`
        );
      }
      return;
    } catch (err) {
      if (err instanceof RateLimitError) throw err;
      if (isProductionEnvironment()) {
        console.error('[RateLimit Error] Production rate limit check failed:', err);
        throw new RateLimitError('Authentication service rate limit check failed. Please retry.');
      }
    }
  }

  // Local development / automated testing in-memory fallback
  const now = Date.now();
  const record = rateLimitMap.get(clientKey);

  if (record) {
    if (now < record.resetAt) {
      if (record.count >= 5) {
        const retryAfterSec = Math.ceil((record.resetAt - now) / 1000);
        throw new RateLimitError(
          `Too many failed login attempts. Please try again in ${retryAfterSec} seconds.`
        );
      }
    } else {
      rateLimitMap.set(clientKey, { count: 0, resetAt: now + 60000 });
    }
  } else {
    rateLimitMap.set(clientKey, { count: 0, resetAt: now + 60000 });
  }
}

/**
 * Records a failed attempt for rate limiting.
 * Uses atomic Redis INCR and sets 60-second expiration on initial failure.
 */
export async function recordFailedPasscodeAttempt(clientKey: string): Promise<void> {
  if (isKvConfigured()) {
    const redisKey = sanitizeRateLimitKey(clientKey);
    try {
      const newCount = (await executeKvCommand(['INCR', redisKey], {
        retries: 1,
        isIdempotent: false,
      })) as number;
      if (newCount === 1) {
        await executeKvCommand(['EXPIRE', redisKey, 60]);
      }
      return;
    } catch (err) {
      if (isProductionEnvironment()) {
        console.error('[RateLimit Error] Failed to record attempt in Redis:', err);
      }
    }
  }

  const now = Date.now();
  const record = rateLimitMap.get(clientKey);
  if (record && now < record.resetAt) {
    record.count += 1;
  } else {
    rateLimitMap.set(clientKey, { count: 1, resetAt: now + 60000 });
  }
}

/**
 * Resets rate limit on successful authentication.
 */
export async function resetPasscodeRateLimit(clientKey: string): Promise<void> {
  if (isKvConfigured()) {
    const redisKey = sanitizeRateLimitKey(clientKey);
    try {
      await executeKvCommand(['DEL', redisKey]);
    } catch (err) {
      console.warn('[RateLimit Warning] Failed to delete Redis rate limit key:', err);
    }
  }

  rateLimitMap.delete(clientKey);
}

/**
 * Parses HTTP Cookie header into key-value map.
 */
export function parseCookies(cookieHeader: string | null): Record<string, string> {
  if (!cookieHeader) return {};
  const cookies: Record<string, string> = {};
  cookieHeader.split(';').forEach((cookie) => {
    const [name, ...rest] = cookie.trim().split('=');
    if (name) {
      cookies[name.trim()] = decodeURIComponent(rest.join('='));
    }
  });
  return cookies;
}

/**
 * Creates a cryptographically random CSRF token.
 */
export function createCsrfToken(): string {
  return crypto.randomBytes(24).toString('hex');
}

/**
 * Builds the HttpOnly session cookie header.
 */
export function buildSessionCookieHeader(token: string, expiresInHours: number = 24): string {
  const maxAge = expiresInHours * 3600;
  const isProd = isProductionEnvironment();
  const secureFlag = isProd ? '; Secure' : '';
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secureFlag}`;
}

/**
 * Builds an expired cookie header to clear the session.
 */
export function buildClearSessionCookieHeader(): string {
  const isProd = isProductionEnvironment();
  const secureFlag = isProd ? '; Secure' : '';
  return `${SESSION_COOKIE_NAME}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax${secureFlag}`;
}

/**
 * Builds a readable CSRF cookie header.
 */
export function buildCsrfCookieHeader(csrfToken: string, expiresInHours: number = 24): string {
  const maxAge = expiresInHours * 3600;
  const isProd = isProductionEnvironment();
  const secureFlag = isProd ? '; Secure' : '';
  return `${CSRF_COOKIE_NAME}=${encodeURIComponent(csrfToken)}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secureFlag}`;
}

/**
 * Enforces CSRF protection on state-changing requests when authenticated via cookie.
 */
export function validateCsrfProtection(request: Request): void {
  const method = request.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return;
  }

  // 1. Check Sec-Fetch-Site if provided by modern browsers
  const secFetchSite = request.headers.get('sec-fetch-site');
  if (secFetchSite && secFetchSite === 'cross-site') {
    throw new ForbiddenError('Cross-Site Request Forgery (CSRF) blocked: cross-site origin detected.');
  }

  // 2. Check Origin / Referer against request host
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');

  if (origin && host) {
    try {
      const originHost = new URL(origin).host;
      if (originHost !== host) {
        throw new ForbiddenError('Cross-Site Request Forgery (CSRF) blocked: Origin mismatch.');
      }
      return;
    } catch {
      throw new ForbiddenError('Invalid Origin header.');
    }
  }

  // 3. Fallback: Double-submit CSRF token validation
  const cookies = parseCookies(request.headers.get('cookie'));
  const csrfCookie = cookies[CSRF_COOKIE_NAME];
  const csrfHeader = request.headers.get('x-csrf-token');

  if (csrfCookie) {
    if (!csrfHeader || csrfHeader !== csrfCookie) {
      throw new ForbiddenError('CSRF token validation failed.');
    }
  }
}

/**
 * Creates a cryptographically signed HMAC-SHA256 session token.
 */
export function createSessionToken(user: User, expiresInHours: number = 24): string {
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + expiresInHours * 3600;

  const payload: SessionTokenPayload = {
    userId: user.id,
    role: user.role,
    name: user.name,
    iat,
    exp,
  };

  const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', AUTH_SECRET)
    .update(payloadBase64)
    .digest('base64url');

  return `${payloadBase64}.${signature}`;
}

/**
 * Verifies a signed session token. Returns parsed payload if valid, null otherwise.
 */
export function verifySessionToken(token: string): SessionTokenPayload | null {
  if (!token || typeof token !== 'string') return null;

  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [payloadBase64, signature] = parts;

  // Verify HMAC signature
  const expectedSignature = crypto
    .createHmac('sha256', AUTH_SECRET)
    .update(payloadBase64)
    .digest('base64url');

  const sigBuffer = Buffer.from(signature);
  const expectedSigBuffer = Buffer.from(expectedSignature);

  if (
    sigBuffer.length !== expectedSigBuffer.length ||
    !crypto.timingSafeEqual(sigBuffer, expectedSigBuffer)
  ) {
    return null;
  }

  try {
    const payloadJson = Buffer.from(payloadBase64, 'base64url').toString('utf-8');
    const payload: SessionTokenPayload = JSON.parse(payloadJson);

    // Verify expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

/**
 * Resolves the authenticated user from the incoming request.
 * Prioritizes HttpOnly session cookie, then Bearer token, then x-lumachat-token, then x-passcode.
 */
export async function getAuthenticatedUser(request: Request): Promise<User | null> {
  const cookies = parseCookies(request.headers.get('cookie'));
  const sessionCookie = cookies[SESSION_COOKIE_NAME];
  const authHeader = request.headers.get('authorization') || '';
  const tokenHeader = request.headers.get('x-lumachat-token');
  const passcodeHeader = request.headers.get('x-passcode');

  let token: string | null = null;
  let isCookieAuth = false;

  if (sessionCookie) {
    token = sessionCookie.trim();
    isCookieAuth = true;
  } else if (authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  } else if (tokenHeader) {
    token = tokenHeader.trim();
  }

  // 1. Try Token Verification
  if (token) {
    const payload = verifySessionToken(token);
    if (payload && payload.userId) {
      // If authenticated via cookie on state-changing request, enforce CSRF protection
      if (isCookieAuth) {
        validateCsrfProtection(request);
      }

      const user = await getUserById(payload.userId);
      if (user) {
        return user;
      }
    }
  }

  // 2. Fallback: Authenticate via x-passcode header (direct API clients)
  if (passcodeHeader) {
    const user = await findUserByCode(passcodeHeader.trim());
    if (user) {
      return user;
    }
  }

  return null;
}

/**
 * Enforces that the request is made by an authenticated user.
 */
export async function requireAuth(request: Request): Promise<User> {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    throw new UnauthorizedError('Authentication required. Invalid or missing session token.');
  }
  return user;
}

/**
 * Enforces that the request is made by an administrator.
 */
export async function requireAdmin(request: Request): Promise<User> {
  const user = await requireAuth(request);
  if (user.role !== 'admin') {
    throw new ForbiddenError('Administrator privileges are required for this action.');
  }
  return user;
}

/**
 * Enforces that the authenticated user is either user1Id, user2Id, or an administrator.
 */
export async function requireConversationAccess(
  request: Request,
  user1Id: string,
  user2Id: string
): Promise<User> {
  const user = await requireAuth(request);
  if (user.role === 'admin' || user.id === user1Id || user.id === user2Id) {
    return user;
  }
  throw new ForbiddenError('You are not authorized to access this conversation.');
}

/**
 * Enforces that the authenticated user is targetUserId or an administrator.
 */
export async function requireSelfOrAdmin(
  request: Request,
  targetUserId: string
): Promise<User> {
  const user = await requireAuth(request);
  if (user.role === 'admin' || user.id === targetUserId) {
    return user;
  }
  throw new ForbiddenError('You can only perform this action on your own account.');
}
