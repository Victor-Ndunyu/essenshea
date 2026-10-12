import { promises as fs } from 'fs';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { getCatalogSnapshot } from '../../lib/catalog';
import { enhanceHtml, catalogueLinks, renderProductPage, renderSitemap, renderLlms, categoryPath, SITE_URL } from '../../lib/discovery';

export const dynamic = 'force-dynamic';

const WEBSITE_DIR = path.join(process.cwd(), 'website');
const CATALOGUE_DIR = path.join(process.cwd(), 'Essenshea_Catalogue');

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
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
  'category': 'category.html',
  'about': 'about.html',
  'eco-rewards': 'eco-rewards.html',
  'account': 'account.html',
  'eco-rewards-admin': 'eco-rewards-admin.html',
};

function esc(s: any): string {
  if (typeof s !== 'string') s = String(s);
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const pathname = url.pathname;
  const cleanPath = pathname.replace(/^\//, '');

  if (cleanPath === 'robots.txt') {
    return new NextResponse(`User-agent: *
Allow: /
Disallow: /account
Disallow: /eco-rewards-admin
Disallow: /api/

Sitemap: ${SITE_URL}/sitemap.xml
`, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
  if (['sitemap.xml', 'llms.txt', 'llms-full.txt'].includes(cleanPath) || cleanPath.startsWith('product/')) {
    const snapshot = await getCatalogSnapshot();
    if (snapshot.issues.some(issue => issue.code === 'unverified_live_data')) return new NextResponse('Live catalogue temporarily unavailable. Please retry.', { status: 503, headers: { 'Retry-After': '60' } });
    const catalog = snapshot.catalog;
    if (cleanPath === 'sitemap.xml') return new NextResponse(renderSitemap(catalog), { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'no-cache' } });
    if (cleanPath.startsWith('llms')) return new NextResponse(renderLlms(catalog, cleanPath === 'llms-full.txt'), { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' } });
    const slug = cleanPath.slice(8);
    const category = catalog.categories.find(category => category.products.some(product => product.slug === slug));
    const product = category?.products.find(product => product.slug === slug);
    if (!category || !product) return new NextResponse('Product not found', { status: 404 });
    const template = await fs.readFile(path.join(WEBSITE_DIR, 'category.html'), 'utf-8');
    return new NextResponse(renderProductPage(template, category, product), { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
  }
  if (cleanPath === 'catalog' || cleanPath === 'catalog.html') {
    const destination = new URL('/shop', req.url);
    url.searchParams.forEach((value, key) => destination.searchParams.set(key, value));
    return NextResponse.redirect(destination, 308);
  }

  if (cleanPath === 'category' || cleanPath === 'category.html' || cleanPath.startsWith('category/') || cleanPath.startsWith('category.html/')) {
    const slug = cleanPath.startsWith('category/')
      ? decodeURIComponent(cleanPath.replace('category/', '').split('/')[0])
      : cleanPath.startsWith('category.html/')
        ? decodeURIComponent(cleanPath.replace('category.html/', '').split('/')[0])
        : url.searchParams.get('slug') || '';
    const catPath = path.join(WEBSITE_DIR, 'category.html');
    try {
      const [tmpl, catalog] = await Promise.all([
        fs.readFile(catPath, 'utf-8'),
        getCatalogSnapshot(),
      ]);
      if (catalog.issues.some(issue => issue.code === 'unverified_live_data')) return new NextResponse('Live collection temporarily unavailable.', { status: 503, headers: { 'Retry-After': '60' } });
      const categoryCatalog = catalog.catalog;
      let cat = null;
      for (let i = 0; i < (categoryCatalog.categories || []).length; i++) {
        if (categoryCatalog.categories[i].slug === slug) { cat = categoryCatalog.categories[i]; break; }
      }
      if (!cat && slug) return new NextResponse('Collection not found', { status: 404 });
      if (!cat) {
        return new NextResponse(tmpl, {
          headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
        });
      }
      let productsHtml = '';
      for (let i = 0; i < (cat.products || []).length; i++) {
        const p = cat.products[i];
        const priceText = esc(p.price || 'Price on request');
        const avail = !p.availableByOrder && typeof p.priceValue === 'number' && !(typeof p.stock === 'number' && p.stock <= 0);
        const stockTxt = typeof p.stock === 'number' ? '<span class="product-stock">In stock: ' + p.stock + '</span>' : '';
        const desc = (p.description || '').replace(/\s+/g, ' ').trim();
        const shortDesc = desc.length > 100 ? desc.slice(0, 100).trim() + '…' : desc;
        productsHtml += '<article class="category-product-card">'
          + '<img src="' + esc(p.image) + '" alt="' + esc(p.name) + '" loading="lazy" />'
          + '<div class="category-product-card__body">'
          + '<h3><a href="/product/' + encodeURIComponent(p.slug) + '">' + esc(p.name) + '</a></h3>'
          + '<p>' + esc(shortDesc) + '</p>'
          + '<div class="category-product-card__meta">'
          + '<span>' + priceText + '</span>'
          + '<span class="avail-flag">' + (p.availableByOrder ? 'Made to order' : typeof p.stock === 'number' && p.stock <= 0 ? 'Out of stock' : avail ? 'Available' : 'Price on request') + '</span>'
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

      return new NextResponse(enhanceHtml(renderedWithTag, categoryPath(cat), cat.title + ' | Essenshea Nairobi', (cat.description || 'Explore ' + cat.title + ' from Essenshea in Nairobi, Kenya.').slice(0, 155)), {
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
      });
    } catch (e) {
      return new NextResponse('Collection temporarily unavailable.', { status: 503, headers: { 'Retry-After': '60' } });
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
    let data = await fs.readFile(fullPath);
    const ext = path.extname(fullPath).toLowerCase();
    if (ext === '.html') {
      const canonicalPath = '/' + relativePath.replace(/\.html$/, '').replace(/^index$/, '');
      let html = data.toString('utf-8');
      if (['index.html','shop.html'].includes(relativePath)) {
        const snapshot = await getCatalogSnapshot();
        if (!snapshot.issues.some(issue => issue.code === 'unverified_live_data')) html = html.replace('</main>', catalogueLinks(snapshot.catalog) + '</main>');
      }
      html = enhanceHtml(html, canonicalPath,
        relativePath === 'index.html' ? 'Essenshea Nairobi | Shea Butter, Oils, Skin & Hair Care' : undefined,
        relativePath === 'index.html' ? 'Shop Essenshea natural body care, shea butter, carrier oils, haircare and fragrances in Nairobi. Pickup at Kimathi House. Request pricing and delivery.' : undefined);
      data = Buffer.from(html);
    }
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const cacheControl = getCacheControl(ext, relativePath);
    return new NextResponse(data, {
      headers: { 'Content-Type': contentType, 'Cache-Control': cacheControl },
    });
  } catch {
    if (!path.extname(fullPath)) {
      try {
        await fs.access(fullPath + '.html');
        return serveFile(relativePath + '.html', baseDir);
      } catch { }
    }
    return new NextResponse('Not found', { status: 404 });
  }
}

function getCacheControl(ext: string, relativePath: string): string {
  if (ext === '.html' || relativePath.startsWith('data/')) {
    return 'no-cache';
  }
  if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.otf'].includes(ext)) {
    return 'public, max-age=604800, stale-while-revalidate=2592000';
  }
  if (ext === '.css' || ext === '.js') {
    return 'public, max-age=3600, stale-while-revalidate=86400';
  }
  return 'no-cache';
}
