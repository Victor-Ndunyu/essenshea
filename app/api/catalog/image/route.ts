import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function getTelegramFileUrl(fileId: string): Promise<string | null> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return null;
  const response = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) return null;
  const payload = await response.json();
  const filePath = payload?.result?.file_path;
  return filePath ? `https://api.telegram.org/file/bot${token}/${filePath}` : null;
}

export async function GET(req: NextRequest) {
  const fileId = req.nextUrl.searchParams.get('fileId') || '';
  if (!fileId || fileId.length > 240) {
    return NextResponse.json({ error: 'Missing image file id' }, { status: 400 });
  }
  const fileUrl = await getTelegramFileUrl(fileId);
  if (!fileUrl) {
    return NextResponse.json({ error: 'Image is unavailable' }, { status: 404 });
  }
  const imageResponse = await fetch(fileUrl, { signal: AbortSignal.timeout(15_000) });
  if (!imageResponse.ok || !imageResponse.body) {
    return NextResponse.json({ error: 'Image could not be loaded' }, { status: 502 });
  }
  return new NextResponse(imageResponse.body, {
    headers: {
      'Content-Type': imageResponse.headers.get('content-type') || 'image/jpeg',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
