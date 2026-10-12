import { NextResponse } from 'next/server';
import { updateUser } from '@/lib/db';
import { getAuthenticatedUser } from '@/lib/auth';
import { validateUserStatus } from '@/lib/validation';
import { handleApiError, ForbiddenError } from '@/lib/errors';

export async function POST(request: Request) {
  try {
    let targetUserId: string | null = null;
    let statusInput: string | null = null;

    const contentType = request.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const body = await request.json();
      targetUserId = body.userId;
      statusInput = body.status;
    } else {
      const text = await request.text();
      try {
        const parsed = JSON.parse(text);
        targetUserId = parsed.userId;
        statusInput = parsed.status;
      } catch {
        // Plain text or unparsable
      }
    }

    if (!targetUserId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    // Verify identity if authenticated
    const authUser = await getAuthenticatedUser(request);
    if (authUser && authUser.role !== 'admin' && authUser.id !== targetUserId) {
      throw new ForbiddenError('You can only update your own online status.');
    }

    const validatedStatus = validateUserStatus(statusInput);

    await updateUser(targetUserId, {
      status: validatedStatus,
      lastSeen:
        validatedStatus === 'offline'
          ? new Date(Date.now() - 10000).toISOString()
          : new Date().toISOString(),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
