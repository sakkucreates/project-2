import { NextResponse } from 'next/server';
import { getAllUsers, updateUser, getDb } from '@/lib/db';
import { getAuthenticatedUser } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const activeUserIdParam = searchParams.get('userId');
    const activeContactId = searchParams.get('activeContactId');

    // Authenticate caller (token, header, or param if matched)
    const authUser = await getAuthenticatedUser(request);

    // Enforce that caller can only update their own heartbeat
    const activeUserId = authUser?.id || activeUserIdParam;

    if (authUser && (!activeUserIdParam || activeUserIdParam === authUser.id)) {
      await updateUser(authUser.id, {
        status: 'online',
        lastSeen: new Date().toISOString(),
      });
    }

    const users = await getAllUsers();
    const db = await getDb();

    // Map users with last message info & unread counts relative to activeUserId
    const usersWithStats = users.map((user) => {
      let unreadCount = 0;
      let lastMessage = null;

      if (activeUserId) {
        // Find last message in conversation
        const conversationMsgs = db.messages
          .filter(
            (m) =>
              (m.senderId === user.id && m.receiverId === activeUserId) ||
              (m.senderId === activeUserId && m.receiverId === user.id)
          )
          .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

        if (conversationMsgs.length > 0) {
          lastMessage = conversationMsgs[conversationMsgs.length - 1];
        }

        // Unread messages sent FROM this contact TO activeUserId
        if (activeContactId && user.id === activeContactId) {
          unreadCount = 0;
        } else {
          unreadCount = db.messages.filter(
            (m) => m.senderId === user.id && m.receiverId === activeUserId && !m.read
          ).length;
        }
      }

      // Sanitize user: hide notes from non-admins
      const isCallerAdmin = authUser?.role === 'admin';
      return {
        id: user.id,
        name: user.name,
        code: isCallerAdmin ? user.code : undefined,
        role: user.role,
        avatar: user.avatar,
        status: user.status,
        lastSeen: user.lastSeen,
        createdAt: user.createdAt,
        notes: isCallerAdmin ? user.notes : undefined,
        unreadCount,
        lastMessage,
      };
    });

    return NextResponse.json(
      { users: usersWithStats },
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
