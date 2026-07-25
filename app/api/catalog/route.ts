import { NextResponse } from 'next/server';
import { getMergedCatalog } from '../../../lib/catalog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const catalog = await getMergedCatalog();
  return NextResponse.json(catalog, {
    headers: {
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}
