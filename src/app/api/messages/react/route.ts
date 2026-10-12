import { NextResponse } from 'next/server';
import { addReactionToMessage } from '@/lib/db';
import { getAuthenticatedUser } from '@/lib/auth';
import { validateEmojiReaction, parseJsonBody } from '@/lib/validation';
import { handleApiError, ValidationError, NotFoundError, ForbiddenError } from '@/lib/errors';

export async function POST(request: Request) {
  try {
    const body = await parseJsonBody<{
      messageId?: string;
      userId?: string;
      emoji?: string;
    }>(request);

    const { messageId, emoji } = body;
    let { userId } = body;

    if (!messageId || typeof messageId !== 'string') {
      throw new ValidationError('messageId is required.');
    }

    const validatedEmoji = validateEmojiReaction(emoji);

    // Verify caller identity and participant authorization
    const authUser = await getAuthenticatedUser(request);
    if (authUser) {
      if (userId && userId !== authUser.id && authUser.role !== 'admin') {
        throw new ForbiddenError('Cannot react on behalf of another user.');
      }
      userId = authUser.id;
    } else {
      if (!userId || typeof userId !== 'string') {
        throw new ValidationError('userId is required.');
      }
    }

    // Verify target message exists and caller is authorized to view it
    const db = await (await import('@/lib/db')).getDb();
    const targetMsg = db.messages.find((m) => m.id === messageId);
    if (!targetMsg) {
      throw new NotFoundError('Message not found.');
    }

    if (authUser && authUser.role !== 'admin') {
      if (targetMsg.senderId !== authUser.id && targetMsg.receiverId !== authUser.id) {
        throw new ForbiddenError('You are not authorized to react to messages in this conversation.');
      }
    }

    const updated = await addReactionToMessage(messageId, userId, validatedEmoji);

    if (!updated) {
      throw new NotFoundError('Message not found.');
    }

    return NextResponse.json({ success: true, message: updated });
  } catch (error) {
    return handleApiError(error);
  }
}
