import { ValidationError } from '@/lib/errors';
import { UserRole, UserStatus } from '@/types';
import { APP_CONFIG } from '@/lib/config';

/**
 * Safely parses and validates incoming JSON request body.
 */
export async function parseJsonBody<T = unknown>(request: Request): Promise<T> {
  const contentLength = request.headers.get('content-length');
  if (contentLength && parseInt(contentLength, 10) > 20 * 1024 * 1024) {
    throw new ValidationError('Payload too large. Maximum request body size is 20MB.');
  }

  try {
    const data = await request.json();
    if (!data || typeof data !== 'object') {
      throw new ValidationError('Request body must be a valid JSON object.');
    }
    return data as T;
  } catch (err) {
    if (err instanceof ValidationError) throw err;
    throw new ValidationError('Malformed JSON payload in request.');
  }
}

/**
 * Validates a user display name.
 */
export function validateUserName(name: unknown): string {
  if (typeof name !== 'string' || !name.trim()) {
    throw new ValidationError('Display name is required.');
  }
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > 50) {
    throw new ValidationError('Display name must be between 1 and 50 characters.');
  }
  // Disallow ASCII control characters
  if (/[\x00-\x1F\x7F]/.test(trimmed)) {
    throw new ValidationError('Display name contains invalid control characters.');
  }
  return trimmed;
}

/**
 * Validates a user access passcode.
 */
export function validatePasscode(code: unknown): string {
  if (typeof code !== 'string' || !code.trim()) {
    throw new ValidationError('Access passcode is required.');
  }
  const trimmed = code.trim();
  if (trimmed.length < 2 || trimmed.length > 20) {
    throw new ValidationError('Access passcode must be between 2 and 20 characters.');
  }
  // Allow alphanumeric, @, -, _
  if (!/^[a-zA-Z0-9@_\-]+$/.test(trimmed)) {
    throw new ValidationError(
      'Passcode may only contain letters, numbers, and symbols (@, -, _).'
    );
  }
  return trimmed;
}

/**
 * Validates user role.
 */
export function validateUserRole(role: unknown): UserRole {
  if (role === 'admin' || role === 'user') {
    return role;
  }
  return 'user';
}

/**
 * Validates an avatar emoji string.
 */
export function validateAvatar(avatar: unknown): string {
  if (typeof avatar !== 'string' || !avatar.trim()) {
    return '👤';
  }
  const trimmed = avatar.trim();
  if (trimmed.length > 10) {
    throw new ValidationError('Avatar emoji is too long.');
  }
  return trimmed;
}

/**
 * Validates optional internal notes.
 */
export function validateNotes(notes: unknown): string {
  if (typeof notes !== 'string') return '';
  const trimmed = notes.trim();
  if (trimmed.length > 500) {
    throw new ValidationError('Internal notes cannot exceed 500 characters.');
  }
  return trimmed;
}

/**
 * Validates a message text content and optional image attachment.
 */
export function validateMessageContent(
  text: unknown,
  image: unknown,
  video?: unknown
): { text: string; image?: string; video?: string } {
  let validatedText = '';
  if (typeof text === 'string') {
    validatedText = text.trim();
    if (validatedText.length > 5000) {
      throw new ValidationError('Message text exceeds maximum length of 5000 characters.');
    }
  }

  let validatedImage: string | undefined = undefined;
  if (image !== undefined && image !== null && image !== '') {
    if (typeof image !== 'string') {
      throw new ValidationError('Image attachment must be a base64 data URI string.');
    }
    const trimmedImg = image.trim();
    // Enforce allowed raster image MIME types: JPEG, PNG, WebP, GIF
    const mimeMatch = trimmedImg.match(/^data:(image\/(jpeg|jpg|png|webp|gif));base64,/i);
    if (!mimeMatch) {
      throw new ValidationError(
        'Invalid or unsupported image format. Supported raster formats: JPEG, PNG, WebP, GIF.'
      );
    }

    // Estimate base64 decoded size
    const base64Content = trimmedImg.split(',')[1] || '';
    const approximateBytes = Math.ceil((base64Content.length * 3) / 4);
    if (approximateBytes > APP_CONFIG.limits.maxImageSizeBytes) {
      throw new ValidationError('Image attachment exceeds 5MB limit.');
    }
    validatedImage = trimmedImg;
  }

  let validatedVideo: string | undefined = undefined;
  if (video !== undefined && video !== null && video !== '') {
    if (typeof video !== 'string') {
      throw new ValidationError('Video attachment must be a base64 data URI string.');
    }
    const trimmedVid = video.trim();
    // Enforce allowed video MIME types: MP4, WebM, OGG, QuickTime MOV, Matroska
    const videoMimeMatch = trimmedVid.match(/^data:(video\/(mp4|webm|ogg|quicktime|x-matroska));base64,/i);
    if (!videoMimeMatch) {
      throw new ValidationError(
        'Invalid or unsupported video format. Supported video formats: MP4, WebM, OGG, MOV.'
      );
    }

    const base64Content = trimmedVid.split(',')[1] || '';
    const approximateBytes = Math.ceil((base64Content.length * 3) / 4);
    if (approximateBytes > APP_CONFIG.limits.maxVideoSizeBytes) {
      throw new ValidationError('Video attachment exceeds 15MB limit.');
    }
    validatedVideo = trimmedVid;
  }

  if (!validatedText && !validatedImage && !validatedVideo) {
    throw new ValidationError('Message must contain either text content or an image attachment (or video).');
  }

  return {
    text: validatedText,
    image: validatedImage,
    video: validatedVideo,
  };
}

export const ALLOWED_REACTIONS = ['❤️', '👍', '😂', '😮', '😢', '🙏'] as const;

/**
 * Validates an emoji reaction string against the allowed six reactions.
 */
export function validateEmojiReaction(emoji: unknown): string {
  if (typeof emoji !== 'string' || !emoji.trim()) {
    throw new ValidationError('Reaction emoji is required.');
  }
  const trimmed = emoji.trim();
  if (!ALLOWED_REACTIONS.includes(trimmed as (typeof ALLOWED_REACTIONS)[number])) {
    throw new ValidationError(
      `Unsupported reaction emoji "${trimmed}". Allowed reactions: ${ALLOWED_REACTIONS.join(' ')}`
    );
  }
  return trimmed;
}

/**
 * Validates user presence status.
 */
export function validateUserStatus(status: unknown): UserStatus {
  if (status === 'online' || status === 'offline') {
    return status;
  }
  return 'offline';
}

/**
 * Validates an optional client-supplied idempotency key.
 */
export function validateIdempotencyKey(key: unknown): string | undefined {
  if (key === undefined || key === null || key === '') {
    return undefined;
  }
  if (typeof key !== 'string') {
    throw new ValidationError('Idempotency key must be a string.');
  }
  const trimmed = key.trim();
  if (trimmed.length < 8 || trimmed.length > 128) {
    throw new ValidationError('Idempotency key must be between 8 and 128 characters.');
  }
  if (!/^[a-zA-Z0-9_\-.:]+$/.test(trimmed)) {
    throw new ValidationError('Idempotency key contains invalid characters.');
  }
  return trimmed;
}
