import { NextResponse } from 'next/server';
import { APP_CONFIG } from '@/lib/config';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    app: APP_CONFIG.name,
    version: APP_CONFIG.version,
    description: APP_CONFIG.description,
    timestamp: new Date().toISOString(),
  });
}
