import { NextResponse } from 'next/server';
import { markMessagesAsRead } from '@/lib/db';
import { getAuthenticatedUser } from '@/lib/auth';
import { parseJsonBody } from '@/lib/validation';
import { handleApiError, ValidationError, ForbiddenError } from '@/lib/errors';

export async function POST(request: Request) {
  try {
    const body = await parseJsonBody<{
      senderId?: string;
      receiverId?: string;
    }>(request);
    const senderId = body.senderId;
    let receiverId = body.receiverId;

    // Verify caller is authenticated
    const authUser = await getAuthenticatedUser(request);
    if (authUser) {
      if (receiverId && receiverId !== authUser.id && authUser.role !== 'admin') {
        throw new ForbiddenError('You can only mark messages received by yourself as read.');
      }
      receiverId = authUser.id;
    }

    if (!senderId || !receiverId) {
      throw new ValidationError('senderId and receiverId are required.');
    }

    await markMessagesAsRead(senderId, receiverId);

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
