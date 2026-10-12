import { NextResponse } from 'next/server';
import { clearConversationMessages } from '@/lib/db';
import { getAuthenticatedUser } from '@/lib/auth';
import { parseJsonBody } from '@/lib/validation';
import { handleApiError, ValidationError, ForbiddenError } from '@/lib/errors';

export async function POST(request: Request) {
  try {
    const { userId, contactId } = await parseJsonBody<{
      userId?: string;
      contactId?: string;
    }>(request);

    if (!userId || !contactId) {
      throw new ValidationError('userId and contactId are required.');
    }

    // Verify caller is a conversation participant or admin
    const authUser = await getAuthenticatedUser(request);
    if (authUser && authUser.role !== 'admin' && authUser.id !== userId && authUser.id !== contactId) {
      throw new ForbiddenError('You can only clear your own conversations.');
    }

    await clearConversationMessages(userId, contactId);

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
