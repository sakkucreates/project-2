import { NextResponse } from 'next/server';
import { createUser, deleteUser, updateUser, getAllUsers, findUserByCode, getUserById } from '@/lib/db';
import { getAuthenticatedUser, requireAdmin } from '@/lib/auth';
import {
  validateUserName,
  validatePasscode,
  validateAvatar,
  validateNotes,
  validateUserRole,
  parseJsonBody,
} from '@/lib/validation';
import { handleApiError, ValidationError, ForbiddenError, NotFoundError } from '@/lib/errors';
import { APP_CONFIG } from '@/lib/config';
import { User } from '@/types';

import { randomInt } from 'crypto';

// Cryptographically secure numeric passcode generator
function generatePasscode(length: number = 4): string {
  const chars = '0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(randomInt(0, chars.length));
  }
  return result;
}

export async function GET(request: Request) {
  try {
    const authUser = await getAuthenticatedUser(request);
    const users = await getAllUsers();

    // If caller is authenticated as admin, return complete user management details
    if (authUser?.role === 'admin') {
      return NextResponse.json({ users });
    }

    // For public switcher view, return sanitized user records (omitting private admin notes)
    const sanitizedUsers = users.map((u) => ({
      id: u.id,
      name: u.name,
      code: u.code,
      role: u.role,
      avatar: u.avatar,
      status: u.status,
      lastSeen: u.lastSeen,
      createdAt: u.createdAt,
    }));

    return NextResponse.json({ users: sanitizedUsers });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    // 1. Enforce Admin Authorization
    await requireAdmin(request);

    // 2. Parse & Validate Payload
    const body = await parseJsonBody<{
      name?: string;
      code?: string;
      role?: string;
      avatar?: string;
      notes?: string;
    }>(request);

    const validatedName = validateUserName(body.name);
    const validatedAvatar = validateAvatar(body.avatar);
    const validatedNotes = validateNotes(body.notes);
    const validatedRole = validateUserRole(body.role);

    let finalCode: string;
    if (body.code && typeof body.code === 'string' && body.code.trim()) {
      finalCode = validatePasscode(body.code);
      const existing = await findUserByCode(finalCode);
      if (existing) {
        throw new ValidationError('This access code is already in use by another account.');
      }
    } else {
      // Auto-generate code and guarantee uniqueness
      let attempts = 0;
      do {
        finalCode = generatePasscode(4);
        const existing = await findUserByCode(finalCode);
        if (!existing) break;
        attempts++;
      } while (attempts < 10);
    }

    // 3. Create User in Storage
    const newUser = await createUser({
      name: validatedName,
      code: finalCode,
      role: validatedRole,
      avatar: validatedAvatar,
      notes: validatedNotes,
    });

    return NextResponse.json({ success: true, user: newUser }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: Request) {
  try {
    // 1. Enforce Admin Authorization
    await requireAdmin(request);

    // 2. Parse & Validate Payload
    const body = await parseJsonBody<{
      id?: string;
      name?: string;
      code?: string;
      avatar?: string;
      notes?: string;
      role?: string;
    }>(request);

    const { id } = body;
    if (!id || typeof id !== 'string') {
      throw new ValidationError('User ID is required.');
    }

    const existingUser = await getUserById(id);
    if (!existingUser) {
      throw new NotFoundError('User not found.');
    }

    // Protect primary admin from role downgrade
    if (id === APP_CONFIG.adminRootId && body.role && body.role !== 'admin') {
      throw new ForbiddenError('Cannot change the role of the primary system administrator account.');
    }

    const updates: Partial<User> = {};

    if (body.name !== undefined) {
      updates.name = validateUserName(body.name);
    }

    if (body.code !== undefined) {
      const validatedCode = validatePasscode(body.code);
      const existingWithCode = await findUserByCode(validatedCode);
      if (existingWithCode && existingWithCode.id !== id) {
        throw new ValidationError('Access code is already in use by another user.');
      }
      updates.code = validatedCode;
    }

    if (body.avatar !== undefined) {
      updates.avatar = validateAvatar(body.avatar);
    }

    if (body.notes !== undefined) {
      updates.notes = validateNotes(body.notes);
    }

    if (body.role !== undefined) {
      updates.role = validateUserRole(body.role);
    }

    const updatedUser = await updateUser(id, updates);

    return NextResponse.json({ success: true, user: updatedUser });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    // 1. Enforce Admin Authorization
    await requireAdmin(request);

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      throw new ValidationError('User ID is required.');
    }

    // Protect designated administrator account
    if (id === APP_CONFIG.adminRootId) {
      throw new ForbiddenError('The primary administrator account cannot be deleted.');
    }

    // Protect against deleting the last remaining admin account
    const allUsers = await getAllUsers();
    const targetUser = allUsers.find((u) => u.id === id);
    if (targetUser?.role === 'admin') {
      const remainingAdmins = allUsers.filter((u) => u.role === 'admin' && u.id !== id);
      if (remainingAdmins.length === 0) {
        throw new ForbiddenError('Cannot delete the final administrator account.');
      }
    }

    const success = await deleteUser(id);
    if (!success) {
      throw new NotFoundError('User not found or already deleted.');
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
