import { secretsMatch } from '@/lib/security';
import { scanCompetitors } from '@/lib/competitor-intelligence';
export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected || !secretsMatch(request.headers.get('authorization') || '', 'Bearer ' + expected))
    return Response.json({error:'Unauthorized'}, {status:401});
  try {
    const result = await scanCompetitors();
    return Response.json(result, {status:!result.skipped && result.scanned===0 ? 503 : 200, headers:{'Cache-Control':'no-store'}});
  } catch { return Response.json({error:'Competitor scan unavailable'}, {status:503}); }
}
