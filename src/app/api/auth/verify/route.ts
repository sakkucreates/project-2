import { NextResponse } from 'next/server';
import { findUserByCode, updateUser } from '@/lib/db';
import {
  checkPasscodeRateLimit,
  recordFailedPasscodeAttempt,
  resetPasscodeRateLimit,
  createSessionToken,
  createCsrfToken,
  buildSessionCookieHeader,
  buildCsrfCookieHeader,
} from '@/lib/auth';
import { validatePasscode } from '@/lib/validation';
import { handleApiError, UnauthorizedError } from '@/lib/errors';
import { APP_CONFIG } from '@/lib/config';

export async function POST(request: Request) {
  try {
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      'anonymous_client';

    // 1. Enforce rate limiting
    await checkPasscodeRateLimit(ip);

    let body: { code?: unknown };
    try {
      body = (await request.json()) as { code?: unknown };
    } catch {
      return NextResponse.json({ error: 'Malformed JSON payload.' }, { status: 400 });
    }

    const { code } = body;
    if (!code || typeof code !== 'string') {
      return NextResponse.json({ error: 'Access passcode is required' }, { status: 400 });
    }

    const trimmedCode = code.trim();

    // 2. Disguise Trigger check (@1234)
    if (trimmedCode === APP_CONFIG.disguiseCode) {
      await resetPasscodeRateLimit(ip);
      return NextResponse.json({
        success: true,
        isDisguise: true,
      });
    }

    validatePasscode(trimmedCode);

    // 3. User verification
    const user = await findUserByCode(trimmedCode);

    if (!user) {
      await recordFailedPasscodeAttempt(ip);
      throw new UnauthorizedError('Invalid access code. Please check with your administrator.');
    }

    // Reset rate limit on success
    await resetPasscodeRateLimit(ip);

    // 4. Update presence
    const updatedUser = await updateUser(user.id, {
      status: 'online',
      lastSeen: new Date().toISOString(),
    });

    const activeUser = updatedUser || user;

    // 5. Generate signed server session token and CSRF token
    const token = createSessionToken(activeUser);
    const csrfToken = createCsrfToken();

    // Safe user object (passcode included for account-holder, internal notes omitted)
    const safeUser = {
      id: activeUser.id,
      name: activeUser.name,
      code: activeUser.code,
      role: activeUser.role,
      avatar: activeUser.avatar,
      status: activeUser.status,
      lastSeen: activeUser.lastSeen,
      createdAt: activeUser.createdAt,
    };

    const response = NextResponse.json({
      success: true,
      token,
      user: safeUser,
      isAdmin: activeUser.role === 'admin',
    });

    // 6. Deliver HttpOnly session cookie and SameSite CSRF cookie
    response.headers.append('Set-Cookie', buildSessionCookieHeader(token));
    response.headers.append('Set-Cookie', buildCsrfCookieHeader(csrfToken));

    return response;
  } catch (error) {
    return handleApiError(error);
  }
}
