import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json(
        { authenticated: false },
        {
          headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate',
          },
        }
      );
    }

    const safeUser = {
      id: user.id,
      name: user.name,
      code: user.code,
      role: user.role,
      avatar: user.avatar,
      status: user.status,
      lastSeen: user.lastSeen,
      createdAt: user.createdAt,
    };

    return NextResponse.json(
      {
        authenticated: true,
        user: safeUser,
        isAdmin: user.role === 'admin',
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
