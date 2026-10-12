import { NextResponse } from 'next/server';
import { getAuthenticatedUser, buildClearSessionCookieHeader } from '@/lib/auth';
import { updateUser } from '@/lib/db';
import { handleApiError } from '@/lib/errors';

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser(request);

    if (user) {
      await updateUser(user.id, {
        status: 'offline',
        lastSeen: new Date(Date.now() - 10000).toISOString(),
      });
    }

    const response = NextResponse.json({
      success: true,
      message: 'Logged out successfully.',
    });

    response.headers.append('Set-Cookie', buildClearSessionCookieHeader());

    return response;
  } catch (error) {
    return handleApiError(error);
  }
}
