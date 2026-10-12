import type { CatalogData, CatalogCategory, CatalogProduct } from './catalog';
import { ESSENSHEA_SITE_FACTS as facts, formatSiteFacts } from './site-facts';

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://essenshea.vercel.app').replace(/\/$/, '');
export const escapeHtml = (value: unknown): string => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
export const productPath = (product: CatalogProduct) => '/product/' + encodeURIComponent(product.slug);
export const categoryPath = (category: CatalogCategory) => '/category/' + encodeURIComponent(category.slug);
const jsonScript = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c');

export function businessSchema() {
  return { '@context':'https://schema.org', '@type':'Store', '@id':SITE_URL+'/#business', name:facts.businessName, url:SITE_URL+'/', telephone:facts.phone, sameAs:['https://instagram.com/essenshea.ke'],
    image:SITE_URL+'/assets/images/essenshea-logo.jpg', description:'Essenshea supplies natural body care, haircare, fragrance and skincare ingredients in Nairobi, Kenya.',
    address:{'@type':'PostalAddress',streetAddress:facts.address,addressLocality:'Nairobi',addressCountry:'KE'},
    openingHoursSpecification:[{'@type':'OpeningHoursSpecification',dayOfWeek:['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'],opens:'09:30',closes:'18:00'}] };
}

export function productSchema(product: CatalogProduct) {
  const schema: Record<string, unknown> = {'@context':'https://schema.org','@type':'Product',name:product.name,description:product.description || '',url:SITE_URL+productPath(product),brand:{'@type':'Brand',name:'Essenshea'}};
  if (product.image) schema.image = new URL(product.image, SITE_URL).href;
  // Unknown counts are never presented as in stock. Variable/request prices have no invented offer.
  if (typeof product.priceValue === 'number' && Number.isFinite(product.priceValue) && product.priceValue >= 0) {
    const offer: Record<string, unknown> = {'@type':'Offer',url:SITE_URL+productPath(product),priceCurrency:'KES',price:product.priceValue,seller:{'@id':SITE_URL+'/#business'}};
    if (product.availableByOrder) offer.availability='https://schema.org/PreOrder';
    else if (typeof product.stock === 'number') offer.availability=product.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock';
    schema.offers=offer;
  }
  return schema;
}

export function enhanceHtml(html: string, pathname: string, title?: string, description?: string, schema?: unknown): string {
  const url=SITE_URL+pathname;
  title ||= html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || facts.businessName;
  description ||= html.match(/<meta name="description" content="([^"]*)"/i)?.[1] || 'Natural body care, haircare and skincare ingredients in Nairobi, Kenya.';
  html=html.replace(/<title>[\s\S]*?<\/title>/i,'<title>'+escapeHtml(title)+'</title>')
    .replace(/<meta name="description" content="[^"]*"\s*\/>/i,'<meta name="description" content="'+escapeHtml(description)+'" />');
  const privatePage=['/account','/eco-rewards-admin'].includes(pathname);
  const head=`${['/','/shop'].includes(pathname)?'<link rel="stylesheet" href="/assets/css/discovery.css" />':''}<link rel="canonical" href="${escapeHtml(url)}" />
<meta name="robots" content="${privatePage?'noindex, nofollow':'index, follow, max-image-preview:large'}" />
<meta property="og:type" content="website" /><meta property="og:site_name" content="Essenshea" />
<meta property="og:title" content="${escapeHtml(title)}" /><meta property="og:description" content="${escapeHtml(description)}" />
<meta property="og:url" content="${escapeHtml(url)}" /><meta property="og:image" content="${SITE_URL}/assets/images/essenshea-logo.jpg" />
<meta name="twitter:card" content="summary_large_image" />
<link rel="alternate" type="text/plain" href="/llms.txt" title="Essenshea business and catalogue summary" />
${privatePage?'':`<script type="application/ld+json">${jsonScript(schema || businessSchema())}</script>`}`;
  return html.replace('</head>',head+'\n</head>');
}

export function catalogueLinks(catalog: CatalogData): string {
  return '<section class="section catalogue-directory" id="catalogue-directory" data-no-reveal><span class="label">Explore the catalogue</span><h2 class="display-md">Skin, hair and fragrance care in Nairobi</h2><p>Browse every collection and product. Pricing and availability are confirmed by Essenshea before payment.</p>'+catalog.categories.map(category => '<details><summary><a href="'+categoryPath(category)+'">'+escapeHtml(category.title)+'</a> ('+category.products.length+')</summary><ul>'+category.products.map(product=>'<li><a href="'+productPath(product)+'">'+escapeHtml(product.name)+'</a></li>').join('')+'</ul></details>').join('')+'</section>';
}

export function renderProductPage(template: string, category: CatalogCategory, product: CatalogProduct): string {
  const details=[product.size?'<p>Size: '+escapeHtml(product.size)+'</p>':'',product.ingredients?'<p>Ingredients: '+escapeHtml(product.ingredients)+'</p>':'',product.variants?.length?'<ul>'+product.variants.map(variant=>'<li>'+escapeHtml(variant.size)+': '+escapeHtml(variant.price)+'</li>').join('')+'</ul>':''];
  const stock=product.availableByOrder?'Available by order':typeof product.stock==='number'?(product.stock>0?'In stock: '+product.stock:'Currently out of stock'):'Availability confirmed on request';
  const main='<main><section class="section"><p><a href="/shop">Shop</a> / <a href="'+categoryPath(category)+'">'+escapeHtml(category.title)+'</a></p><div class="product-detail-layout"><img class="product-detail-image" src="'+escapeHtml(product.image || '/assets/images/essenshea-logo.jpg')+'" alt="'+escapeHtml(product.name)+'" /><div><span class="label">'+escapeHtml(category.title)+'</span><h1 class="display-lg">'+escapeHtml(product.name)+'</h1><p class="body-lg" style="white-space:pre-line">'+escapeHtml(product.description || 'Contact Essenshea for product details.')+'</p><p>'+escapeHtml(product.price || 'Price on request')+'</p><p>'+stock+'</p>'+details.join('')+'<a class="btn btn--primary" href="/shop?product='+encodeURIComponent(product.slug)+'">Select options and request</a><p>'+escapeHtml(facts.ordering)+'</p></div></div></section></main>';
  let html=template.replace(/<main>[\s\S]*?<\/main>/,main).replace(/<script[^>]*src="[^"]*category\.js[^"]*"[^>]*><\/script>/g,'').replace(/<script>\s*var categoryModal[\s\S]*?<\/script>/, '');
  html=html.replace('</head>','<style>.product-detail-layout{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:clamp(24px,5vw,80px);align-items:start}.product-detail-image{width:100%;max-height:70vh;object-fit:contain;border-radius:16px}@media(max-width:700px){.product-detail-layout{grid-template-columns:1fr}}</style></head>');
  return enhanceHtml(html,productPath(product),product.name+' | Essenshea Nairobi',product.description?.replace(/\s+/g,' ').slice(0,155) || product.name+' from Essenshea in Nairobi, Kenya.',[businessSchema(),productSchema(product)]);
}

export function renderSitemap(catalog: CatalogData): string {
  const paths=['/','/shop','/about','/eco-rewards','/reviews','/fragrances',...catalog.categories.map(categoryPath),...catalog.categories.flatMap(category=>category.products.map(productPath))];
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+[...new Set(paths)].map(path=>'<url><loc>'+escapeHtml(SITE_URL+path)+'</loc></url>').join('')+'</urlset>';
}

export function renderLlms(catalog: CatalogData, full=false): string {
  return ['# Essenshea Natural Body Care','', '> Perfect for skin and hair. Natural body care, haircare, fragrances and skincare ingredients in Nairobi, Kenya.','',formatSiteFacts(),'','## Official website','- [Shop]('+SITE_URL+'/shop): Browse products and build a request list.','- [About]('+SITE_URL+'/about): Business information.','- [Eco-Rewards]('+SITE_URL+'/eco-rewards): Container return and refill programme.','- [Complete catalogue]('+SITE_URL+'/llms-full.txt): Live public products, descriptions and listed prices.','','## Collections',...catalog.categories.flatMap(category=>['','### ['+category.title+']('+SITE_URL+categoryPath(category)+')',category.description || '',...category.products.map(product=>'- ['+product.name+']('+SITE_URL+productPath(product)+')'+(full?'\n  Listed price: '+(product.price || 'Price on request')+'\n  Availability: '+(product.availableByOrder?'by order':typeof product.stock==='number'?(product.stock>0?'stock '+product.stock:'out of stock'):'not confirmed')+'\n  '+(product.description || '').replace(/\s+/g,' ')+(product.size?'\n  Size: '+product.size:'')+(product.ingredients?'\n  Ingredients: '+product.ingredients:'')+(product.variants?.length?'\n  Size prices: '+product.variants.map(v=>v.size+': '+v.price).join('; '):''):''))]),'','## Ordering accuracy','Prices and availability can change. Verify the linked live product and confirm with Essenshea before payment. Product descriptions are catalogue information; no medical efficacy or guaranteed outcomes are established by this summary.',''].join('\n');
}
