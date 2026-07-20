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
};

function esc(s: any): string {
  if (typeof s !== 'string') s = String(s);
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const pathname = url.pathname;
  const cleanPath = pathname.replace(/^\//, '');

  if (cleanPath === 'category' || cleanPath === 'category.html' || cleanPath.startsWith('category/') || cleanPath.startsWith('category.html/')) {
    const slug = cleanPath.startsWith('category/')
      ? decodeURIComponent(cleanPath.replace('category/', '').split('/')[0])
      : cleanPath.startsWith('category.html/')
        ? decodeURIComponent(cleanPath.replace('category.html/', '').split('/')[0])
        : url.searchParams.get('slug') || '';
    const catPath = path.join(WEBSITE_DIR, 'category.html');
    const dataPath = path.join(WEBSITE_DIR, 'data', 'catalog.json');
    try {
      const [tmpl, raw] = await Promise.all([
        fs.readFile(catPath, 'utf-8'),
        fs.readFile(dataPath, 'utf-8'),
      ]);
      const catalog = JSON.parse(raw);
      let cat = null;
      for (let i = 0; i < (catalog.categories || []).length; i++) {
        if (catalog.categories[i].slug === slug) { cat = catalog.categories[i]; break; }
      }
      if (!cat) {
        return new NextResponse(tmpl, {
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
      }
      let productsHtml = '';
      for (let i = 0; i < (cat.products || []).length; i++) {
        const p = cat.products[i];
        const priceText = esc(p.price || 'Price on request');
        const avail = typeof p.priceValue === 'number';
        const stockTxt = typeof p.stock === 'number' ? '<span class="product-stock">In stock: ' + p.stock + '</span>' : '';
        const desc = (p.description || '').replace(/\s+/g, ' ').trim();
        const shortDesc = desc.length > 100 ? desc.slice(0, 100).trim() + '…' : desc;
        productsHtml += '<article class="category-product-card">'
          + '<img src="' + esc(p.image) + '" alt="' + esc(p.name) + '" loading="lazy" />'
          + '<div class="category-product-card__body">'
          + '<h3>' + esc(p.name) + '</h3>'
          + '<p>' + esc(shortDesc) + '</p>'
          + '<div class="category-product-card__meta">'
          + '<span>' + priceText + '</span>'
          + '<span class="avail-flag">' + (avail ? 'Available' : 'Made to order') + '</span>'
          + stockTxt
          + '</div>'
          + '<button type="button" class="btn btn--sm btn--secondary category-product-open" data-product="' + esc(p.slug) + '">View details</button>'
          + '</div>'
          + '</article>';
      }
      const rendered = tmpl
        .replace(
          '<h1 id="category-title" class="display-lg">Loading category...</h1>',
          '<h1 id="category-title" class="display-lg">' + esc(cat.title) + '</h1>'
        )
        .replace(
          '<p id="category-description" class="body-lg">Please wait while we load this collection.</p>',
          '<p id="category-description" class="body-lg">' + esc(cat.description || '') + '</p>'
        )
        .replace(
          '<span id="category-products-count" class="label label--gold"></span>',
          '<span id="category-products-count" class="label label--gold">' + esc(cat.items || 0) + ' products</span>'
        )
        .replace(
          'src="" alt="Category image"',
          'src="' + esc(cat.image || '') + '" alt="' + esc(cat.title) + '"'
        )
        .replace(
          '<div id="category-product-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:20px;margin-top:24px"></div>',
          '<div id="category-product-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:20px;margin-top:24px">' + productsHtml + '</div>'
        );

      const renderedWithTag = rendered.replace('id="category-tag" class="label label--gold"></span>', 'id="category-tag" class="label label--gold">' + esc(cat.tag || 'Curated collection') + '</span>');

      return new NextResponse(renderedWithTag, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    } catch (e) {
      return serveFile('category.html', WEBSITE_DIR);
    }
  }

  if (PAGE_ROUTES[cleanPath]) {
    return serveFile(PAGE_ROUTES[cleanPath], WEBSITE_DIR);
  }

  const relativePath = pathname.replace(/^\//, '');

  if (!relativePath) {
    return serveFile('index.html', WEBSITE_DIR);
  }

  if (relativePath.startsWith('data/') || relativePath.startsWith('assets/')) {
    return serveFile(relativePath, WEBSITE_DIR);
  }

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
      headers: { 'Content-Type': contentType, 'Cache-Control': 'no-cache' },
    });
  } catch {
    if (!path.extname(fullPath)) {
      try {
        const htmlPath = fullPath + '.html';
        const data = await fs.readFile(htmlPath);
        return new NextResponse(data, {
          headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' },
        });
      } catch { }
    }
    return new NextResponse('Not found', { status: 404 });
  }
}
