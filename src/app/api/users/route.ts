import { NextResponse } from 'next/server';
import { updateUser, getDb, getUserTypingTo } from '@/lib/db';
import { getAuthenticatedUser } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { APP_CONFIG } from '@/lib/config';

// In-memory heartbeat throttle: record last write timestamp per user
const lastHeartbeatMap = new Map<string, number>();
const HEARTBEAT_THROTTLE_MS = 1500;

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
      const now = Date.now();
      const lastHeartbeat = lastHeartbeatMap.get(authUser.id) || 0;
      if (now - lastHeartbeat >= HEARTBEAT_THROTTLE_MS) {
        lastHeartbeatMap.set(authUser.id, now);
        await updateUser(authUser.id, {
          status: 'online',
          lastSeen: new Date().toISOString(),
        }).catch((err) => {
          console.warn('[Heartbeat] Skipped heartbeat write:', err);
        });
      }
    }

    const db = await getDb();
    const now = Date.now();
    const users = (db.users || []).map((user) => {
      const lastSeenTime = user.lastSeen ? new Date(user.lastSeen).getTime() : 0;
      const isOnline =
        user.id === activeUserId
          ? true
          : user.status === 'offline'
          ? false
          : now - lastSeenTime < APP_CONFIG.polling.onlineThresholdMs;
      return {
        ...user,
        status: (isOnline ? 'online' : 'offline') as 'online' | 'offline',
      };
    });

    // Map users with last message info & unread counts relative to activeUserId
    const usersWithStats = users.map((user) => {
      let unreadCount = 0;
      let lastMessage = null;

      if (activeUserId) {
        // Find last message in conversation
        const conversationMsgs = db.messages
          .filter(
            (m) =>
              ((m.senderId === user.id && m.receiverId === activeUserId) ||
               (m.senderId === activeUserId && m.receiverId === user.id)) &&
              (!m.deletedFor || !m.deletedFor.includes(activeUserId))
          )
          .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

        if (conversationMsgs.length > 0) {
          lastMessage = conversationMsgs[conversationMsgs.length - 1];
        }

        // Unread messages sent FROM this contact TO activeUserId
        if (activeContactId && user.id === activeContactId) {
          unreadCount = 0;
        } else if (lastMessage && lastMessage.senderId === activeUserId) {
          // If the last message was sent by activeUserId, all prior messages in this conversation are already read
          unreadCount = 0;
        } else {
          unreadCount = db.messages.filter(
            (m) =>
              m.senderId === user.id &&
              m.receiverId === activeUserId &&
              !m.read &&
              (!m.deletedFor || !m.deletedFor.includes(activeUserId))
          ).length;
        }
      }

      // Sanitize user: hide notes from non-admins
      const isCallerAdmin = authUser?.role === 'admin';
      const typingTo = getUserTypingTo(user.id);
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
        typingTo,
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
