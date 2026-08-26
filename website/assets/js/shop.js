const shopProductsRoot = document.getElementById('shop-products-grid');
const shopCollectionsRoot = document.getElementById('shop-collections');
const cartItemsRoot = document.getElementById('cart-items');
const cartCount = document.getElementById('cart-count');
const cartNote = document.getElementById('cart-note');
const checkoutButton = document.getElementById('checkout-button');
const productModal = document.getElementById('product-modal');
const modalTitle = document.getElementById('modal-title');
const modalImage = document.getElementById('modal-image');
const modalDescription = document.getElementById('modal-description');
const modalDetails = document.getElementById('modal-details');
const modalBenefits = document.getElementById('modal-benefits');
const modalIngredients = document.getElementById('modal-ingredients');
const modalRelated = document.getElementById('modal-related');
const modalAction = document.getElementById('modal-action');
const modalClose = document.getElementById('modal-close');
const customRequestForm = document.getElementById('custom-request-form');
const customRequestStatus = document.getElementById('custom-request-status');
const customFragranceOptions = document.getElementById('custom-fragrance-options');
const shopSearchInput = document.getElementById('shop-search');
const shopCategoryChips = document.getElementById('shop-category-chips');
const shopConcernChips = document.getElementById('shop-concern-chips');
const shopResultsCount = document.getElementById('shop-results-count');
const shopSearchToggle = document.getElementById('shop-search-toggle');
const shopDiscoveryPanel = document.getElementById('shop-discovery-panel');
const shopAvailabilitySelect = document.getElementById('shop-availability');
const shopPriceSelect = document.getElementById('shop-price');
const shopSortSelect = document.getElementById('shop-sort');
const shopClearFilters = document.getElementById('shop-clear-filters');
const shopRoutinesRoot = document.getElementById('shop-routines');
const shopLookbook = document.querySelector('.shop-lookbook');
const shopPageLoader = document.getElementById('shop-page-loader');

const shopCollections = [];
const shopProducts = [];
let activeConcern = 'all';
let activeCategory = 'all';
let categoryOptions = [];
let modalReturnFocus = null;
let searchRenderTimer = null;
let lastNoResultSearch = '';
let shopLoaderHidden = false;

function hideShopPageLoader() {
  if (!shopPageLoader || shopLoaderHidden) return;
  shopLoaderHidden = true;
  shopPageLoader.classList.add('is-ready');
  window.setTimeout(function() { shopPageLoader.remove(); }, 520);
}

function enhanceShopLookbook() {
  if (!shopLookbook || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  const cards = Array.from(shopLookbook.querySelectorAll('.shop-lookbook__card'));
  let frame = 0;
  function updatePointer(event) {
    const bounds = shopLookbook.getBoundingClientRect();
    const x = Math.max(-1, Math.min(1, ((event.clientX - bounds.left) / bounds.width - .5) * 2));
    const y = Math.max(-1, Math.min(1, ((event.clientY - bounds.top) / bounds.height - .5) * 2));
    window.cancelAnimationFrame(frame);
    frame = window.requestAnimationFrame(function() {
      cards.forEach(function(card, index) {
        const depth = cards.length - index;
        card.style.setProperty('--pointer-x', `${(x * depth * 1.8).toFixed(2)}px`);
        card.style.setProperty('--pointer-y', `${(y * depth * 1.2).toFixed(2)}px`);
      });
    });
  }
  function resetPointer() {
    cards.forEach(function(card) {
      card.style.setProperty('--pointer-x', '0px');
      card.style.setProperty('--pointer-y', '0px');
    });
  }
  shopLookbook.addEventListener('pointermove', updatePointer, { passive: true });
  shopLookbook.addEventListener('pointerleave', resetPointer, { passive: true });
}

enhanceShopLookbook();

function trackShopEvent(eventType, details) {
  if (typeof window.essensheaTrack === 'function') window.essensheaTrack(eventType, details || {});
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getFocusableElements(container) {
  return Array.from(container.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'))
    .filter(function(element) { return !element.hidden && element.getAttribute('aria-hidden') !== 'true'; });
}

function trapModalFocus(event) {
  if (!productModal || productModal.classList.contains('hidden')) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    closeProductModal();
    return;
  }
  if (event.key !== 'Tab') return;
  const focusable = getFocusableElements(productModal);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function markImageUnavailable(image) {
  image.classList.add('image-unavailable');
  image.removeAttribute('src');
  image.alt = image.alt ? image.alt + ', image unavailable' : 'Product image unavailable';
}

function extractVariants(product) {
  if (Array.isArray(product.variants)) {
    return product.variants.map(function(variant) {
      return typeof variant === 'string' ? variant : [variant.size || variant.name, variant.price || variant.priceText].filter(Boolean).join(', ');
    }).filter(Boolean);
  }
  const text = String(product.description || '');
  const matches = text.match(/\b\d+(?:\.\d+)?\s*(?:ml|g|kg|l)\s*(?:(?:-|–|:)\s*)?(?:ksh|kes)\s*[\d,]+/gi) || [];
  return matches.slice(0, 6).map(function(value) { return value.replace(/\s+/g, ' ').trim(); });
}

const concernOptions = [
  { id: 'all', label: 'All products', terms: [] },
  { id: 'hair-growth', label: 'Hair growth', terms: ['hair growth', 'growth serum', 'amla', 'rosemary', 'scalp', 'hairline', 'edges'] },
  { id: 'dry-skin', label: 'Dry skin', terms: ['dry', 'moisturize', 'moisturise', 'shea', 'butter', 'body oil', 'hydrating'] },
  { id: 'glow', label: 'Glow', terms: ['glow', 'shiny', 'brighten', 'youthful', 'radiance', 'body oil'] },
  { id: 'stretch-marks', label: 'Stretch marks', terms: ['stretch marks', 'dark spots', 'shea', 'cocoa', 'mango butter'] },
  { id: 'acne-prone', label: 'Acne-prone skin', terms: ['acne', 'tea tree', 'neem', 'aloe', 'rashes'] },
  { id: 'scalp-comfort', label: 'Scalp comfort', terms: ['scalp', 'itch', 'itchiness', 'peppermint', 'soothing', 'hair'] },
  { id: 'mens-care', label: "Men's care", terms: ['men', 'beard', 'wood', 'spice', 'creed', 'balm', 'tonic'] },
  { id: 'fragrance', label: 'Fragrance', terms: ['fragrance', 'scent', 'perfume', 'vanilla', 'bubblegum', 'lavender'] },
  { id: 'custom-care', label: 'Custom care', terms: ['custom', 'customized', 'customised', 'bespoke', 'request'] },
  { id: 'gifts', label: 'Gifts', terms: ['gift', 'set', 'hamper', 'bundle'] },
];

const routineOptions = [
  { id: 'dry-skin', title: 'Daily moisture pairing', copy: 'Layer a nourishing oil with a body butter to help seal in moisture.', concerns: ['dry-skin'], categories: ['body-oils-and-tonics', 'body-butters-and-balms'], limit: 2 },
  { id: 'hair-growth', title: 'Scalp and hair pairing', copy: 'Pair targeted scalp care with a nourishing hair product for a simple weekly routine.', concerns: ['hair-growth', 'scalp-comfort'], categories: ['haircare', 'carrier-oils'], limit: 2 },
  { id: 'glow', title: 'Body glow pairing', copy: 'Combine lightweight body care products selected for radiance and everyday softness.', concerns: ['glow'], categories: ['body-oils-and-tonics', 'body-butters-and-balms'], limit: 2 },
  { id: 'gift', title: 'Easy gifting edit', copy: 'A small, thoughtful selection that makes choosing an Essenshea gift less complicated.', concerns: ['gifts', 'fragrance'], categories: ['gift-sets', 'fragrances'], limit: 2 },
];

function createProductId(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function excerpt(text, length = 90) {
  if (!text) return '';
  const sanitized = text.replace(/\s+/g, ' ').trim();
  return sanitized.length <= length ? sanitized : sanitized.slice(0, length).trim() + '…';
}

function normalizeSearchValue(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9\s]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function getProductConcernIds(product) {
  const haystack = normalizeSearchValue([product.title, product.category, product.description].join(' '));
  return concernOptions
    .filter(function(option) {
      if (option.id === 'all') return false;
      return option.terms.some(function(term) { return haystack.includes(normalizeSearchValue(term)); });
    })
    .map(function(option) { return option.id; });
}

function getProductConcernLabels(product) {
  const ids = product.concerns || getProductConcernIds(product);
  return concernOptions
    .filter(function(option) { return ids.includes(option.id); })
    .slice(0, 3)
    .map(function(option) { return option.label; });
}

function productMatchesQuery(product, query) {
  if (!query) return true;
  const haystack = normalizeSearchValue([
    product.title,
    product.category,
    product.description,
    product.bestFor.join(' '),
  ].join(' '));
  return normalizeSearchValue(query).split(' ').filter(Boolean).every(function(word) {
    return haystack.includes(word);
  });
}

function mapAvailability(product) {
  const requestOnlyPatterns = /(custom|customized|request)/i;
  if (product.availableByOrder) return false;
  if (typeof product.stock === 'number' && product.stock <= 0) return false;
  if (requestOnlyPatterns.test(product.title) || requestOnlyPatterns.test(product.category)) {
    return false;
  }
  return typeof product.priceValue === 'number';
}

function productStatusLabel(product) {
  if (product.availableByOrder) return 'By order';
  if (typeof product.stock === 'number') {
    if (product.stock <= 0) return 'Currently out';
    if (product.stock <= 3) return 'Only ' + product.stock + ' left';
    return 'In stock: ' + product.stock;
  }
  return product.available ? 'Available' : 'Made to order';
}

function productFulfilmentText(product) {
  if (product.availableByOrder) return 'Available by order. Essenshea will confirm the preparation timeline.';
  if (typeof product.stock === 'number' && product.stock <= 0) return 'Currently out. You can still request it and Essenshea will confirm the next availability.';
  if (product.available) return 'Available now. Add to your request list and Essenshea will confirm availability.';
  return 'Made to order. Essenshea will confirm price and schedule production after your request.';
}

function splitProductDescription(description) {
  const clean = String(description || '').replace(/\s+/g, ' ').trim();
  const ingredientMatch = clean.match(/ingredients?\s*:\s*([^.!]+(?:\.[^.!]+)?)/i);
  const ingredients = ingredientMatch ? ingredientMatch[1].replace(/\.$/, '').trim() : '';
  const benefitText = ingredientMatch ? clean.replace(ingredientMatch[0], '').trim() : clean;
  const benefits = benefitText
    .split(/\s*[•.]\s*/)
    .map(function(item) { return item.trim(); })
    .filter(function(item) { return item.length > 2; })
    .slice(0, 6);
  return { ingredients: ingredients, benefits: benefits };
}

function getRelatedProducts(product, limit) {
  return shopProducts
    .filter(function(item) { return item.id !== product.id; })
    .map(function(item) {
      const sharedConcerns = item.concerns.filter(function(concern) { return product.concerns.includes(concern); }).length;
      const categoryScore = item.categorySlug === product.categorySlug ? 1 : 0;
      return { item: item, score: sharedConcerns * 2 + categoryScore + Number(item.available) * 0.25 };
    })
    .filter(function(entry) { return entry.score > 0; })
    .sort(function(a, b) { return b.score - a.score || a.item.title.localeCompare(b.item.title); })
    .slice(0, limit || 3)
    .map(function(entry) { return entry.item; });
}

function getRoutineProducts(routine) {
  const chosen = [];
  routine.categories.forEach(function(categorySlug) {
    const match = shopProducts.find(function(product) {
      return !chosen.includes(product)
        && product.categorySlug === categorySlug
        && product.concerns.some(function(concern) { return routine.concerns.includes(concern); });
    });
    if (match) chosen.push(match);
  });
  if (chosen.length < routine.limit) {
    shopProducts.forEach(function(product) {
      if (chosen.length >= routine.limit || chosen.includes(product)) return;
      if (product.concerns.some(function(concern) { return routine.concerns.includes(concern); })) chosen.push(product);
    });
  }
  return chosen.slice(0, routine.limit);
}

function renderShopRoutines() {
  if (!shopRoutinesRoot) return;
  const routines = routineOptions.map(function(routine) {
    return { ...routine, products: getRoutineProducts(routine) };
  }).filter(function(routine) { return routine.products.length >= 2; });
  if (!routines.length) {
    shopRoutinesRoot.innerHTML = '';
    return;
  }
  shopRoutinesRoot.innerHTML = '<div class="shop-routines__header"><span class="label">Guided pairings</span><h2>Start with a simple routine.</h2><p>These are practical shopping suggestions, not medical treatment plans. Open each product to check whether it suits you.</p></div>'
    + '<div class="shop-routines__grid">'
    + routines.map(function(routine) {
      return '<article class="routine-card">'
        + '<h3>' + routine.title + '</h3><p>' + routine.copy + '</p>'
        + '<ul>' + routine.products.map(function(product) { return '<li>' + product.title + '</li>'; }).join('') + '</ul>'
        + '<button class="btn btn--sm btn--secondary routine-add" type="button" data-products="' + routine.products.map(function(product) { return product.id; }).join(',') + '">Add pairing to request</button>'
        + '</article>';
    }).join('')
    + '</div>';
}

function applyShopData(data) {
    const categories = data.categories || [];
    shopCollections.length = 0;
    shopProducts.length = 0;

    categoryOptions = [{ id: 'all', label: 'All categories' }].concat(categories.map(function(category) {
      return { id: category.slug, label: category.title };
    }));

    categories.forEach((category) => {
      shopCollections.push({
        title: category.title,
        copy: category.description || 'Discover premium Essenshea products.',
        link: '/shop?category=' + encodeURIComponent(category.slug) + '#shop-products',
      });

      (category.products || []).forEach((product) => {
        const title = product.name || 'Essenshea product';
        const available = mapAvailability({
          title,
          category: category.title,
          priceValue: product.priceValue,
          stock: product.stock,
          availableByOrder: product.availableByOrder,
        });

        const mappedProduct = {
          id: createProductId(category.title + '-' + title),
          slug: product.slug,
          categorySlug: category.slug,
          title,
          category: category.title,
          priceText: product.price || 'Price on request',
          priceValue: product.priceValue,
          description: product.description || category.description || 'Natural skincare and fragrance products crafted for daily care.',
          descriptionExcerpt: excerpt(product.description || category.description || 'Natural skincare and fragrance products crafted for daily care.'),
          image: product.image,
          available,
          stock: product.stock ?? null,
          availableByOrder: Boolean(product.availableByOrder),
          variants: extractVariants(product),
          stockText: typeof product.stock === 'number' ? 'In stock: ' + product.stock : '',
          note: '',
        };
        mappedProduct.concerns = getProductConcernIds(mappedProduct);
        mappedProduct.bestFor = getProductConcernLabels(mappedProduct);
        shopProducts.push(mappedProduct);
      });
    });

    shopProducts.sort(function(a, b) {
      return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
    });

    renderShopCollections();
    renderCategoryChips();
    renderConcernChips();
    renderShopProducts();
    renderShopRoutines();
    restoreCart();
    renderCart();
    applyShopDeepLinks();
    if (shopProductsRoot) shopProductsRoot.setAttribute('aria-busy', 'false');
    hideShopPageLoader();
}

async function fetchCatalog(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeout = window.setTimeout(function() { controller.abort(); }, timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) throw new Error('Catalogue request returned ' + response.status);
    return await response.json();
  } finally {
    window.clearTimeout(timeout);
  }
}

async function fetchLiveCatalogWithRetry() {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await fetchCatalog('/api/catalog', { cache: 'no-store' }, 6500);
    } catch (error) {
      lastError = error;
      if (attempt === 0) await new Promise(function(resolve) { window.setTimeout(resolve, 450); });
    }
  }
  throw lastError;
}

async function loadShopData() {
  let rendered = false;
  const liveRequest = fetchLiveCatalogWithRetry();
  try {
    const staticData = await fetchCatalog('/data/catalog.json', { cache: 'force-cache' }, 3000);
    applyShopData(staticData);
    rendered = true;
  } catch (error) {
    console.warn('Static catalogue fallback unavailable', error);
  }

  try {
    const liveData = await liveRequest;
    applyShopData(liveData);
    rendered = true;
  } catch (error) {
    console.error('Unable to refresh live shop product data', error);
  }

  if (!rendered && shopProductsRoot) {
    shopProductsRoot.innerHTML = '<div class="shop-load-recovery"><p>The catalogue took longer than expected.</p><button class="btn btn--secondary" type="button" id="shop-retry-load">Try loading again</button></div>';
    shopProductsRoot.setAttribute('aria-busy', 'false');
    const retry = document.getElementById('shop-retry-load');
    if (retry) retry.addEventListener('click', function() {
      shopProductsRoot.setAttribute('aria-busy', 'true');
      loadShopData();
    }, { once: true });
    hideShopPageLoader();
  }
}

async function loadFragranceOptions() {
  if (!customFragranceOptions) return;
  try {
    const response = await fetch('/data/fragrances.json');
    const data = await response.json();
    const notes = [...new Set((data.collections || []).flatMap((collection) => collection.notes || []))]
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    customFragranceOptions.innerHTML = notes.map((note) => '<option value="' + note + '"></option>').join('');
  } catch (error) {
    console.error('Unable to load fragrance options', error);
  }
}

const cart = [];

function restoreCart() {
  try {
    const saved = JSON.parse(localStorage.getItem('essenshea_cart') || '[]');
    if (!Array.isArray(saved)) return;
    saved.forEach(function(savedItem) {
      const product = shopProducts.find(function(item) { return item.id === savedItem.id; });
      if (!product) return;
      cart.push({ ...product, quantity: Math.max(1, Math.min(20, Number(savedItem.quantity) || 1)) });
    });
  } catch (error) {
    console.warn('Unable to restore the saved request list', error);
  }
}

function renderShopCollections() {
  if (!shopCollectionsRoot) return;
  shopCollectionsRoot.innerHTML = shopCollections
    .map(function(item) {
      return '<article class="discover-card">'
        + '<h3>' + item.title + '</h3>'
        + '<p>' + item.copy + '</p>'
        + '<a href="' + item.link + '">Browse collection</a>'
        + '</article>';
    })
    .join('');
}

function renderConcernChips() {
  if (!shopConcernChips) return;
  shopConcernChips.innerHTML = concernOptions
    .map(function(option) {
      return '<button class="concern-chip' + (option.id === activeConcern ? ' is-active' : '') + '" type="button" data-concern="' + option.id + '">' + option.label + '</button>';
    })
    .join('');
}

function renderCategoryChips() {
  if (!shopCategoryChips) return;
  shopCategoryChips.innerHTML = categoryOptions
    .map(function(option) {
      return '<button class="concern-chip' + (option.id === activeCategory ? ' is-active' : '') + '" type="button" data-category="' + option.id + '">' + option.label + '</button>';
    })
    .join('');
}

function getFilteredShopProducts() {
  const query = shopSearchInput ? shopSearchInput.value : '';
  const availability = shopAvailabilitySelect ? shopAvailabilitySelect.value : 'all';
  const price = shopPriceSelect ? shopPriceSelect.value : 'all';
  const sort = shopSortSelect ? shopSortSelect.value : 'recommended';
  const filtered = shopProducts.filter(function(product) {
    const matchesConcern = activeConcern === 'all' || product.concerns.includes(activeConcern);
    const matchesCategory = activeCategory === 'all' || product.categorySlug === activeCategory;
    const matchesAvailability = availability === 'all'
      || (availability === 'available' && product.available && (typeof product.stock !== 'number' || product.stock > 3))
      || (availability === 'low-stock' && typeof product.stock === 'number' && product.stock > 0 && product.stock <= 3)
      || (availability === 'made-to-order' && product.availableByOrder)
      || (availability === 'out' && typeof product.stock === 'number' && product.stock <= 0 && !product.availableByOrder);
    const value = product.priceValue;
    const matchesPrice = price === 'all'
      || (price === 'request' && typeof value !== 'number')
      || (price === 'under-500' && typeof value === 'number' && value < 500)
      || (price === '500-1000' && typeof value === 'number' && value >= 500 && value <= 1000)
      || (price === '1000-2000' && typeof value === 'number' && value > 1000 && value <= 2000)
      || (price === 'over-2000' && typeof value === 'number' && value > 2000);
    return matchesCategory && matchesConcern && matchesAvailability && matchesPrice && productMatchesQuery(product, query);
  });
  return filtered.sort(function(a, b) {
    if (sort === 'name-asc') return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
    if (sort === 'price-asc') return (typeof a.priceValue === 'number' ? a.priceValue : Number.MAX_SAFE_INTEGER) - (typeof b.priceValue === 'number' ? b.priceValue : Number.MAX_SAFE_INTEGER);
    if (sort === 'price-desc') return (typeof b.priceValue === 'number' ? b.priceValue : -1) - (typeof a.priceValue === 'number' ? a.priceValue : -1);
    return Number(b.available) - Number(a.available) || a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
  });
}

function syncShopFiltersToUrl() {
  const params = new URLSearchParams(window.location.search);
  [['category', activeCategory], ['concern', activeConcern], ['availability', shopAvailabilitySelect && shopAvailabilitySelect.value], ['price', shopPriceSelect && shopPriceSelect.value], ['sort', shopSortSelect && shopSortSelect.value]].forEach(function(pair) {
    if (pair[1] && pair[1] !== 'all' && pair[1] !== 'recommended') params.set(pair[0], pair[1]); else params.delete(pair[0]);
  });
  const query = shopSearchInput ? shopSearchInput.value.trim() : '';
  if (query) params.set('q', query); else params.delete('q');
  window.history.replaceState({}, '', window.location.pathname + (params.toString() ? '?' + params.toString() : '') + window.location.hash);
}

function hasActiveDiscovery() {
  return Boolean(
    (shopSearchInput && shopSearchInput.value.trim())
    || activeCategory !== 'all'
    || activeConcern !== 'all'
    || (shopAvailabilitySelect && shopAvailabilitySelect.value !== 'all')
    || (shopPriceSelect && shopPriceSelect.value !== 'all')
    || (shopSortSelect && shopSortSelect.value !== 'recommended')
  );
}

function renderProductCard(product) {
  const tags = (product.bestFor || []).map(function(tag) { return '<span>' + escapeHtml(tag) + '</span>'; }).join('');
  return '<article class="product-card" data-id="' + escapeHtml(product.id) + '">'
    + '<img src="' + escapeHtml(product.image) + '" alt="' + escapeHtml(product.title) + '" loading="lazy" decoding="async" />'
    + '<div class="product-card__content">'
    + '<h3>' + escapeHtml(product.title) + '</h3>'
    + '<p>' + escapeHtml(product.descriptionExcerpt) + '</p>'
    + (product.variants.length ? '<span class="product-card__variants">Sizes: ' + product.variants.map(escapeHtml).join(' · ') + '</span>' : '')
    + (tags ? '<div class="product-card__tags" aria-label="Best for">' + tags + '</div>' : '')
    + '</div>'
    + '<div class="product-card__meta">'
    + '<span class="product-card__price">' + escapeHtml(product.priceText) + '</span>'
    + '<span class="product-card__flag">' + escapeHtml(productStatusLabel(product)) + '</span>'
    + '<button class="btn btn--sm btn--secondary product-open" type="button" data-id="' + escapeHtml(product.id) + '" aria-label="View details for ' + escapeHtml(product.title) + '">View details</button>'
    + '</div>'
    + '</article>';
}

function renderShopProducts() {
  if (!shopProductsRoot) return;
  const filteredProducts = getFilteredShopProducts();
  if (shopResultsCount) {
    shopResultsCount.textContent = filteredProducts.length + ' product' + (filteredProducts.length === 1 ? '' : 's') + ' shown';
  }
  if (!filteredProducts.length) {
    shopProductsRoot.innerHTML = '<div class="shop-empty-state"><h3>No exact match yet</h3><p>Try another product name, ingredient or goal - or request a custom product and Essenshea will guide you.</p><a class="btn btn--secondary" href="/shop?focus=custom#custom-care">Request custom care</a></div>';
    const emptyQuery = shopSearchInput ? normalizeSearchValue(shopSearchInput.value) : '';
    if (emptyQuery.length >= 2 && emptyQuery !== lastNoResultSearch) {
      lastNoResultSearch = emptyQuery;
      trackShopEvent('search_no_results', { searchTerm: emptyQuery, metadata: { source: 'shop', resultCount: 0 } });
    }
    return;
  }
  if (hasActiveDiscovery()) {
    shopProductsRoot.classList.remove('shop-product-groups');
    shopProductsRoot.classList.add('shop-product-grid');
    shopProductsRoot.innerHTML = filteredProducts.map(renderProductCard).join('');
    return;
  }

  shopProductsRoot.classList.remove('shop-product-grid');
  shopProductsRoot.classList.add('shop-product-groups');
  shopProductsRoot.innerHTML = categoryOptions
    .filter(function(category) { return category.id !== 'all'; })
    .map(function(category) {
      const products = filteredProducts.filter(function(product) { return product.categorySlug === category.id; });
      if (!products.length) return '';
      return '<section class="shop-category-section" aria-labelledby="shop-category-' + category.id + '">'
        + '<div class="shop-category-section__header">'
        + '<div><span class="label">Collection</span><h3 id="shop-category-' + category.id + '">' + category.label + '</h3></div>'
        + '<span class="shop-category-section__count">' + products.length + ' product' + (products.length === 1 ? '' : 's') + '</span>'
        + '</div>'
        + '<div class="shop-product-grid">' + products.map(renderProductCard).join('') + '</div>'
        + '</section>';
    })
    .join('');
}

function renderCart() {
  if (!cartItemsRoot || !cartCount || !cartNote || !checkoutButton) return;

  if (!cart.length) {
    cartItemsRoot.innerHTML = '<p class="cart-empty">Your request list is empty. Open a product to add it.</p>';
    cartCount.textContent = '0 items';
    if (cartNote) cartNote.textContent = 'Ready to request when you are.';
    checkoutButton.disabled = true;
    return;
  }

  cartItemsRoot.innerHTML = cart
    .map(function(item) {
      return '<div class="cart-item">'
        + '<div class="cart-item__info">'
        + '<strong>' + item.quantity + 'x ' + item.title + '</strong>'
        + '<span>' + (item.statusText || (item.available ? 'Available - will be prepared for shipment.' : 'Made to order - will be queued and scheduled.')) + '</span>'
        + '</div>'
        + '<div class="cart-item__actions">'
        + '<button class="cart-quantity" type="button" data-cart-action="decrease" data-id="' + item.id + '" aria-label="Remove one">&minus;</button>'
        + '<span>' + item.quantity + '</span>'
        + '<button class="cart-quantity" type="button" data-cart-action="increase" data-id="' + item.id + '" aria-label="Add one more">+</button>'
        + '<button class="btn btn--sm btn--secondary cart-remove" type="button" data-id="' + item.id + '">Remove</button>'
        + '</div>'
        + '</div>';
    })
    .join('');

  const totalCount = cart.reduce(function(sum, item) { return sum + item.quantity; }, 0);
  cartCount.textContent = totalCount + ' item' + (totalCount === 1 ? '' : 's');

  if (cartNote) {
    cartNote.textContent = 'Ready to submit. We will confirm pricing and availability within 24 hours.';
  }
  checkoutButton.disabled = false;
}

function openProductModal(productId) {
  const product = shopProducts.find(function(item) { return item.id === productId || item.slug === productId; });
  if (!product || !productModal) return;
  trackShopEvent('product_view', { productSlug: product.slug, categorySlug: product.categorySlug, metadata: { source: 'shop' } });

  modalTitle.textContent = product.title;
  modalImage.src = product.image;
  modalImage.alt = product.title;
  const descriptionParts = splitProductDescription(product.description);
  const related = getRelatedProducts(product, 3);
  modalDescription.textContent = product.descriptionExcerpt;
  modalDetails.innerHTML = '<div><span>Price</span><strong>' + product.priceText + '</strong></div>'
    + '<div><span>Availability</span><strong>' + productStatusLabel(product) + '</strong></div>'
    + (product.bestFor && product.bestFor.length ? '<div><span>Best for</span><strong>' + product.bestFor.join(', ') + '</strong></div>' : '')
    + (product.variants.length ? '<div><span>Sizes</span><strong>' + product.variants.join(', ') + '</strong></div>' : '');
  modalBenefits.innerHTML = descriptionParts.benefits.length
    ? '<h3>Benefits and product notes</h3><ul>' + descriptionParts.benefits.map(function(benefit) { return '<li>' + benefit + '</li>'; }).join('') + '</ul>'
    : '';
  modalIngredients.innerHTML = '<h3>Ingredients and fulfilment</h3>'
    + (descriptionParts.ingredients ? '<p><strong>Ingredients:</strong> ' + descriptionParts.ingredients + '</p>' : '<p>Full ingredient details are not yet listed. Ask Essenshea before ordering if you have allergies or sensitivities.</p>')
    + '<p>' + productFulfilmentText(product) + '</p>';
  modalRelated.innerHTML = related.length
    ? '<h3>You may also like</h3><div class="product-related-list">' + related.map(function(item) {
      return '<button type="button" class="product-related-item" data-related-id="' + escapeHtml(item.id) + '"><img src="' + escapeHtml(item.image) + '" alt="" loading="lazy" decoding="async"><span><strong>' + escapeHtml(item.title) + '</strong><small>' + escapeHtml(item.priceText) + '</small></span></button>';
    }).join('') + '</div>'
    : '';
  modalAction.textContent = 'Add to request';
  modalAction.dataset.id = product.id;
  modalReturnFocus = document.activeElement;
  productModal.classList.remove('hidden');
  productModal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
  window.setTimeout(function() { modalClose.focus(); }, 20);
}

function closeProductModal() {
  if (!productModal) return;
  productModal.classList.add('hidden');
  productModal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-open');
  if (modalReturnFocus && typeof modalReturnFocus.focus === 'function') modalReturnFocus.focus();
  modalReturnFocus = null;
}

function syncCartToWidget() {
  var cartData = cart.map(function(item) {
    return {
      id: item.id,
      slug: item.slug,
      title: item.title,
      quantity: item.quantity,
      available: item.available,
      priceText: item.priceText,
    };
  });
  try { localStorage.setItem('essenshea_cart', JSON.stringify(cartData)); } catch (e) {}
  window.dispatchEvent(new CustomEvent('essenshea-cart-update'));
}

function addToCart(productId) {
  const product = shopProducts.find(function(item) { return item.id === productId || item.slug === productId; });
  if (!product) return;
  trackShopEvent('request_item_added', { productSlug: product.slug, categorySlug: product.categorySlug, metadata: { source: 'shop' } });

  const existing = cart.find(function(item) { return item.id === productId; });
  if (existing) {
    existing.quantity += 1;
  } else {
    cart.push({ ...product, quantity: 1 });
  }

  renderCart();
  syncCartToWidget();
  closeProductModal();
}

function applyShopDeepLinks() {
  var params = new URLSearchParams(window.location.search);
  var fragrance = params.get('fragrance');
  var product = params.get('product');
  var focus = params.get('focus');
  if (params.get('q') && shopSearchInput) shopSearchInput.value = params.get('q');
  if (params.get('category') && categoryOptions.some(function(option) { return option.id === params.get('category'); })) activeCategory = params.get('category');
  if (params.get('concern') && concernOptions.some(function(option) { return option.id === params.get('concern'); })) activeConcern = params.get('concern');
  if (params.get('availability') && shopAvailabilitySelect) shopAvailabilitySelect.value = params.get('availability');
  if (params.get('price') && shopPriceSelect) shopPriceSelect.value = params.get('price');
  if (params.get('sort') && shopSortSelect) shopSortSelect.value = params.get('sort');
  renderCategoryChips();
  renderConcernChips();
  renderShopProducts();

  if (fragrance) {
    var customFragrance = document.getElementById('custom-fragrance');
    if (customFragrance) customFragrance.value = fragrance;
  }

  if (fragrance || focus === 'custom') {
    var customSection = document.getElementById('custom-care');
    if (customSection) {
      window.setTimeout(function() {
        customSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 120);
    }
  }

  if (product) {
    window.setTimeout(function() {
      var match = shopProducts.find(function(item) { return item.slug === product || item.id === product; });
      if (!match) return;
      var card = document.querySelector('.product-card[data-id="' + match.id + '"]');
      if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        card.classList.add('product-card--highlight');
        window.setTimeout(function() { card.classList.remove('product-card--highlight'); }, 2600);
      }
      openProductModal(match.id);
    }, 180);
  }
}

function removeFromCart(productId) {
  const index = cart.findIndex(function(item) { return item.id === productId; });
  if (index === -1) return;
  cart.splice(index, 1);
  renderCart();
  syncCartToWidget();
}

function changeCartQuantity(productId, change) {
  const item = cart.find(function(cartItem) { return cartItem.id === productId; });
  if (!item) return;
  item.quantity = Math.max(0, Math.min(20, item.quantity + change));
  if (item.quantity === 0) return removeFromCart(productId);
  renderCart();
  syncCartToWidget();
}

async function submitCartRequest() {
  if (!cart.length) return;
  syncCartToWidget();
  const widget = document.getElementById('cart-widget');
  const popup = document.getElementById('cart-popup');
  if (widget && popup && popup.classList.contains('hidden')) widget.click();
  const nameInput = document.getElementById('cart-customer-name');
  if (nameInput) window.setTimeout(function() { nameInput.focus(); }, 120);
}

async function handleCustomRequestSubmit(event) {
  event.preventDefault();
  const formData = new FormData(customRequestForm);
  const name = formData.get('name').trim();
  const email = formData.get('email').trim();
  const productType = formData.get('productType');
  const details = formData.get('details').trim();
  const fragrance = (formData.get('fragrance') || '').trim();
  const submitBtn = document.getElementById('custom-submit');

  if (!name || !email || !details) {
    customRequestStatus.textContent = 'Please complete your name, email and request details.';
    return;
  }

  customRequestStatus.textContent = 'Sending your request…';
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Sending…'; }

  try {
    const response = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [
          {
            title: 'Custom request: ' + (productType || 'Unspecified'),
            quantity: 1,
            priceText: 'Price on request',
          },
        ],
        customer: {
          name: name,
          contact: email,
          email: email,
          notes: details + (fragrance ? ' | Preferred fragrance: ' + fragrance : ''),
        },
        type: 'custom',
      }),
    });

    const result = await response.json();

    if (result.success) {
      customRequestStatus.textContent = result.message;
      customRequestForm.reset();
    } else {
      customRequestStatus.textContent = 'Failed to send: ' + (result.error || 'Unknown error');
    }
  } catch (error) {
    customRequestStatus.textContent = 'Failed to send request: ' + error.message;
  } finally {
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Request custom product'; }
  }
}

renderCart();
loadShopData();
loadFragranceOptions();
window.setTimeout(hideShopPageLoader, 4500);

document.addEventListener('click', function(event) {
  if (event.target === productModal) {
    closeProductModal();
    return;
  }
  const button = event.target.closest('button');
  if (!button) return;

  if (button.classList.contains('product-open')) {
    openProductModal(button.dataset.id);
  }

  if (button.id === 'modal-close') {
    closeProductModal();
  }

  if (button.id === 'modal-action') {
    addToCart(button.dataset.id);
  }

  if (button.classList.contains('product-related-item')) {
    openProductModal(button.dataset.relatedId);
  }

  if (button.classList.contains('routine-add')) {
    String(button.dataset.products || '').split(',').filter(Boolean).forEach(addToCart);
  }

  if (button.classList.contains('cart-remove')) {
    removeFromCart(button.dataset.id);
  }

  if (button.dataset.cartAction === 'increase') changeCartQuantity(button.dataset.id, 1);
  if (button.dataset.cartAction === 'decrease') changeCartQuantity(button.dataset.id, -1);

  if (button.id === 'checkout-button') {
    submitCartRequest();
  }
});

if (customRequestForm) {
  customRequestForm.addEventListener('submit', handleCustomRequestSubmit);
}

if (shopSearchInput) {
  shopSearchInput.addEventListener('input', function() {
    window.clearTimeout(searchRenderTimer);
    searchRenderTimer = window.setTimeout(function() { renderShopProducts(); syncShopFiltersToUrl(); }, 140);
  });
}

document.addEventListener('keydown', trapModalFocus);
document.addEventListener('error', function(event) {
  if (event.target instanceof HTMLImageElement && event.target.closest('.product-card, .modal-card, .product-related-item')) {
    markImageUnavailable(event.target);
  }
}, true);

[shopAvailabilitySelect, shopPriceSelect, shopSortSelect].forEach(function(control) {
  if (control) control.addEventListener('change', function() { renderShopProducts(); syncShopFiltersToUrl(); });
});

if (shopClearFilters) shopClearFilters.addEventListener('click', function() {
  activeCategory = 'all'; activeConcern = 'all';
  if (shopSearchInput) shopSearchInput.value = '';
  if (shopAvailabilitySelect) shopAvailabilitySelect.value = 'all';
  if (shopPriceSelect) shopPriceSelect.value = 'all';
  if (shopSortSelect) shopSortSelect.value = 'recommended';
  renderCategoryChips(); renderConcernChips(); renderShopProducts(); syncShopFiltersToUrl();
});

if (shopSearchToggle && shopDiscoveryPanel) {
  shopSearchToggle.addEventListener('click', function() {
    const collapsed = shopDiscoveryPanel.classList.toggle('is-collapsed');
    shopSearchToggle.setAttribute('aria-expanded', String(!collapsed));
    if (!collapsed && shopSearchInput) window.setTimeout(function() { shopSearchInput.focus(); }, 120);
  });
}

if (shopConcernChips) {
  shopConcernChips.addEventListener('click', function(event) {
    const button = event.target.closest('[data-concern]');
    if (!button) return;
    activeConcern = button.dataset.concern || 'all';
    renderConcernChips();
    renderShopProducts();
    syncShopFiltersToUrl();
  });
}

if (shopCategoryChips) {
  shopCategoryChips.addEventListener('click', function(event) {
    const button = event.target.closest('[data-category]');
    if (!button) return;
    activeCategory = button.dataset.category || 'all';
    renderCategoryChips();
    renderShopProducts();
    syncShopFiltersToUrl();
  });
}
