import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getOptionalSession } from '@/lib/session';
import { searchInventory } from '@/lib/search';

export const dynamic = 'force-dynamic';

const querySchema = z.string().trim().min(2).max(100);

export async function GET(request: Request) {
  const session = await getOptionalSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const parsed = querySchema.safeParse(url.searchParams.get('q'));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Search must be between 2 and 100 characters' }, { status: 400 });
  }

  const results = await searchInventory(parsed.data, session.role);
  return NextResponse.json(results, {
    headers: { 'Cache-Control': 'private, no-store' },
  });
}
