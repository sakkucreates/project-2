import { NextResponse } from 'next/server';

export class AppError extends Error {
  statusCode: number;
  code: string;

  constructor(message: string, statusCode: number = 400, code: string = 'BAD_REQUEST') {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Authentication required. Please provide a valid session token or passcode.') {
    super(message, 401, 'UNAUTHORIZED');
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Access denied. You do not have permission to perform this action.') {
    super(message, 403, 'FORBIDDEN');
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = 'Resource not found') {
    super(message, 404, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

export class RateLimitError extends AppError {
  constructor(message: string = 'Too many attempts. Please try again later.') {
    super(message, 429, 'RATE_LIMITED');
    this.name = 'RateLimitError';
  }
}

export class StorageConfigurationError extends AppError {
  constructor(message: string = 'Production persistence layer is not configured.') {
    super(message, 500, 'STORAGE_CONFIG_ERROR');
    this.name = 'StorageConfigurationError';
  }
}

export class StorageOperationError extends AppError {
  constructor(message: string = 'Failed to execute storage operation.') {
    super(message, 500, 'STORAGE_OPERATION_ERROR');
    this.name = 'StorageOperationError';
  }
}

/**
 * Maps any error into a consistent JSON response.
 */
export function handleApiError(error: unknown): NextResponse {
  if (error instanceof AppError) {
    return NextResponse.json(
      {
        error: error.message,
        code: error.code,
      },
      { status: error.statusCode }
    );
  }

  // Handle standard SyntaxError from malformed JSON
  if (error instanceof SyntaxError && 'message' in error && error.message.includes('JSON')) {
    return NextResponse.json(
      {
        error: 'Invalid JSON request payload.',
        code: 'INVALID_JSON',
      },
      { status: 400 }
    );
  }

  const errorMessage = error instanceof Error ? error.message : 'Internal server error';
  console.error('[API Error]:', error);

  return NextResponse.json(
    {
      error: errorMessage,
      code: 'INTERNAL_SERVER_ERROR',
    },
    { status: 500 }
  );
}
