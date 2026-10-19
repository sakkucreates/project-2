import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { setUserTyping, getUserTypingTo } from '@/lib/db';
import { handleApiError, ForbiddenError } from '@/lib/errors';
import { parseJsonBody } from '@/lib/validation';

// POST /api/users/typing updates caller's typing state
export async function POST(request: Request) {
  try {
    const authUser = await getAuthenticatedUser(request);
    const body = await parseJsonBody<{
      userId?: string;
      receiverId?: string | null;
      isTyping?: boolean;
    }>(request).catch(() => ({} as { userId?: string; receiverId?: string | null; isTyping?: boolean }));

    const senderId = authUser?.id || body.userId;
    if (!senderId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    if (authUser && body.userId && body.userId !== authUser.id && authUser.role !== 'admin') {
      throw new ForbiddenError('Cannot update typing status on behalf of another user.');
    }

    const receiverId = body.isTyping === false ? null : (body.receiverId || null);
    setUserTyping(senderId, receiverId);

    return NextResponse.json({ success: true, typingTo: receiverId });
  } catch (error) {
    return handleApiError(error);
  }
}

// GET /api/users/typing?userId=...&contactId=... returns if contact is currently typing to user
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const contactId = searchParams.get('contactId');

    if (!contactId) {
      return NextResponse.json({ isTyping: false });
    }

    const typingTo = getUserTypingTo(contactId);
    const isTyping = Boolean(typingTo && (!userId || typingTo === userId));

    return NextResponse.json(
      { isTyping, typingTo },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        },
      }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
