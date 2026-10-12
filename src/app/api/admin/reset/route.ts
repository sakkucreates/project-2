import { NextResponse } from 'next/server';
import { resetDatabase } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';

export async function POST(request: Request) {
  try {
    // Enforce Admin Authorization
    await requireAdmin(request);

    await resetDatabase();
    return NextResponse.json({
      success: true,
      message: 'All demo chats and accounts have been reset successfully.',
    });
  } catch (error) {
    return handleApiError(error);
  }
}
