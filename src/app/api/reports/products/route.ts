import { NextResponse } from 'next/server';
import { getOptionalSession } from '@/lib/session';
import { hasPermission } from '@/lib/permissions';
import { db } from '@/repositories';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const session = await getOptionalSession();
  const headers = { 'Cache-Control': 'no-store' };
  if (!session)
    return NextResponse.json({ error: 'Authentication required' }, { status: 401, headers });
  if (!hasPermission(session.role, 'VIEW_REPORTS'))
    return NextResponse.json(
      { error: 'Financial reports require manager access' },
      { status: 403, headers },
    );
  const q = (new URL(request.url).searchParams.get('q') ?? '').trim().slice(0, 120);
  return NextResponse.json({ products: await db.reports.products(q) }, { headers });
}
