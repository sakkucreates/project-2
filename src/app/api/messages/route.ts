import { NextResponse } from 'next/server';
import {
  getConversationMessages,
  createMessage,
  deleteMessage,
  deleteMessageForUser,
  getUserTypingTo,
  markMessagesAsRead,
} from '@/lib/db';
import { getAuthenticatedUser } from '@/lib/auth';
import { validateMessageContent, validateIdempotencyKey, parseJsonBody } from '@/lib/validation';
import { handleApiError, ForbiddenError, ValidationError } from '@/lib/errors';

// GET /api/messages returns conversation messages without mutating state
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const contactId = searchParams.get('contactId');

    if (!userId || !contactId) {
      throw new ValidationError('userId and contactId query parameters are required.');
    }

    // Check authorization: caller must be a participant or admin
    const authUser = await getAuthenticatedUser(request);
    if (authUser && authUser.role !== 'admin' && authUser.id !== userId && authUser.id !== contactId) {
      throw new ForbiddenError('You are not authorized to view messages from this conversation.');
    }

    const viewerId = authUser?.id || userId;
    const messages = await getConversationMessages(userId, contactId, viewerId);
    const isContactTyping = getUserTypingTo(contactId) === userId;

    return NextResponse.json(
      { messages, isContactTyping },
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

// POST /api/messages creates a new message with server timestamp
export async function POST(request: Request) {
  try {
    const body = await parseJsonBody<{
      senderId?: string;
      receiverId?: string;
      text?: string;
      image?: string;
      video?: string;
      audio?: string;
      replyTo?: { id: string; text?: string; senderName?: string };
      idempotencyKey?: string;
    }>(request);

    const { receiverId, text, image, video, audio, replyTo, idempotencyKey } = body;
    let { senderId } = body;

    if (!receiverId || typeof receiverId !== 'string') {
      throw new ValidationError('receiverId is required.');
    }

    // Enforce authenticated sender identity
    const authUser = await getAuthenticatedUser(request);
    if (authUser) {
      // Never allow sender spoofing: client cannot forge senderId
      if (senderId && senderId !== authUser.id && authUser.role !== 'admin') {
        throw new ForbiddenError('Cannot send messages on behalf of another user.');
      }
      senderId = authUser.id;
    } else {
      if (!senderId || typeof senderId !== 'string') {
        throw new ValidationError('senderId is required.');
      }
    }

    const {
      text: validatedText,
      image: validatedImage,
      video: validatedVideo,
      audio: validatedAudio,
    } = validateMessageContent(text, image, video, audio);
    const validatedIdempotencyKey = validateIdempotencyKey(idempotencyKey);

    const message = await createMessage({
      senderId,
      receiverId,
      text: validatedText,
      image: validatedImage,
      video: validatedVideo,
      audio: validatedAudio,
      replyTo,
      idempotencyKey: validatedIdempotencyKey,
    });

    // When sender sends a message, any prior unread messages received by sender from receiver are marked read
    await markMessagesAsRead(receiverId, senderId).catch((err: unknown) => {
      console.warn('[Messages] Auto mark-as-read on reply failed:', err);
    });

    return NextResponse.json({ success: true, message });
  } catch (error) {
    return handleApiError(error);
  }
}

// DELETE /api/messages?messageId=...&mode=... deletes a single message (for everyone or for me)
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    let messageId = searchParams.get('messageId');
    let mode = searchParams.get('mode') as 'everyone' | 'forMe' | null;

    if (!messageId) {
      const body = await parseJsonBody<{ messageId?: string; mode?: 'everyone' | 'forMe' }>(request).catch(
        () => ({} as { messageId?: string; mode?: 'everyone' | 'forMe' })
      );
      messageId = body.messageId || null;
      if (!mode && body.mode) {
        mode = body.mode;
      }
    }

    if (!messageId || typeof messageId !== 'string') {
      throw new ValidationError('messageId is required.');
    }

    // Verify authenticated user
    const authUser = await getAuthenticatedUser(request);
    if (!authUser) {
      throw new ForbiddenError('Authentication required to delete messages.');
    }

    if (mode === 'forMe') {
      const deleted = await deleteMessageForUser(messageId, authUser.id);
      return NextResponse.json({ success: true, deleted, mode: 'forMe' });
    }

    // Default: delete for everyone
    const deleted = await deleteMessage(messageId);

    return NextResponse.json({ success: true, deleted, mode: 'everyone' });
  } catch (error) {
    return handleApiError(error);
  }
}
