import { promises as fs } from 'fs';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';

const WEBSITE_DIR = path.join(process.cwd(), 'website');
const CATALOGUE_DIR = path.join(process.cwd(), 'Essenshea_Catalogue');

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.otf': 'font/otf',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

const PAGE_ROUTES: Record<string, string> = {
  '': 'index.html',
  'shop': 'shop.html',
  'catalog': 'catalog.html',
  'category': 'category.html',
  'about': 'about.html',
  'data/catalog.json': 'data/catalog.json',
};

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  let pathname = url.pathname;

  const cleanPath = pathname.replace(/^\//, '');
  if (PAGE_ROUTES[cleanPath]) {
    return serveFile(PAGE_ROUTES[cleanPath], WEBSITE_DIR);
  }

  const relativePath = pathname.replace(/^\//, '');

  if (!relativePath) {
    return serveFile('index.html', WEBSITE_DIR);
  }

  // Serve Essenshea_Catalogue images
  if (relativePath.startsWith('Essenshea_Catalogue/')) {
    return serveFile(relativePath.replace('Essenshea_Catalogue/', ''), CATALOGUE_DIR);
  }

  return serveFile(relativePath, WEBSITE_DIR);
}

async function serveFile(relativePath: string, baseDir: string): Promise<NextResponse> {
  const safePath = path.normalize(relativePath).replace(/^(\.\.[/\\])+/, '');
  const fullPath = path.join(baseDir, safePath);

  if (!fullPath.startsWith(baseDir)) {
    return new NextResponse('Not found', { status: 404 });
  }

  try {
    const data = await fs.readFile(fullPath);
    const ext = path.extname(fullPath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    return new NextResponse(data, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (err) {
    if (!path.extname(fullPath)) {
      try {
        const htmlPath = fullPath + '.html';
        const data = await fs.readFile(htmlPath);
        return new NextResponse(data, {
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'public, max-age=3600',
          },
        });
      } catch {
        // fall through to 404
      }
    }

    return new NextResponse('Not found', { status: 404 });
  }
}
