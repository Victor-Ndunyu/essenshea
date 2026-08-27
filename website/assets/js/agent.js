const AGENT_CONFIG = window.AGENT_CONFIG || {};
const AGENT_API_ENDPOINT = AGENT_CONFIG.apiUrl || '/api/agent';
const AGENT_SESSION_KEY = 'essenshea_agent_session_v1';
const AGENT_DATA = {
  page: {
    title: document.title,
    url: window.location.href,
    description: document.querySelector('meta[name="description"]')?.content || '',
    navigation: Array.from(document.querySelectorAll('.topnav a')).map((link) => ({ text: link.textContent.trim(), href: link.href })),
  },
  catalog: null,
  products: {},
  categories: {},
  messages: [],
};

function getAgentSessionId() {
  try {
    const existing = localStorage.getItem(AGENT_SESSION_KEY);
    if (existing) return existing;
    const generated = 'web_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 12);
    localStorage.setItem(AGENT_SESSION_KEY, generated);
    return generated;
  } catch (error) {
    return 'web_memory_' + Date.now().toString(36);
  }
}

const AGENT_CONCERNS = [
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

function createAgentMarkup() {
  const body = document.body;
  const wrapper = document.createElement('div');
  wrapper.id = 'agent-widget';
  wrapper.innerHTML = `
    <button id="agent-launcher" class="agent-launcher" aria-label="Toggle Essenshea assistant">
      <span class="agent-launcher-mark" aria-hidden="true"><img src="/assets/images/angel-assistant.svg?v=2" alt="" /></span>
      <span class="agent-launcher-text">Ask Essenshea</span>
    </button>
    <aside id="agent-panel" class="agent-panel hidden" aria-hidden="true">
      <div class="agent-header">
        <div>
          <p class="eyebrow">Essenshea Assistant</p>
          <h2>How can I help today?</h2>
        </div>
        <button id="agent-close" class="agent-panel-close" aria-label="Close assistant">&times;</button>
      </div>
      <div class="agent-status-bar">
        <span>Essenshea Care</span>
        <span>Online</span>
      </div>
      <div class="agent-body">
        <div class="agent-chat-window" id="agent-chat-window"></div>
        <div class="agent-quick-actions" aria-label="Assistant shortcuts">
          <button type="button" data-agent-prompt="Help me build a simple skincare routine">Build a routine</button>
          <button type="button" data-agent-prompt="Help me choose products for my hair goals">Hair guide</button>
          <button type="button" data-agent-prompt="Help me choose a fragrance or gift">Fragrance or gift</button>
          <button type="button" data-agent-prompt="Help me make a custom order">Custom order</button>
        </div>
        <form id="agent-send-form" class="agent-send-form">
          <input id="agent-input" type="text" placeholder="Type your question..." aria-label="Agent message input" />
          <button type="submit" class="btn btn--primary">Send</button>
        </form>
      </div>
    </aside>
  `;

  body.appendChild(wrapper);
}

function updateAgentViewportOffset() {
  const viewport = window.visualViewport;
  if (!viewport) {
    document.documentElement.style.setProperty('--agent-viewport-bottom', '0px');
    return;
  }
  const obscuredBottom = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
  document.documentElement.style.setProperty('--agent-viewport-bottom', `${Math.round(obscuredBottom)}px`);
}

function enhanceMobileNavigation() {
  document.querySelectorAll('.topbar').forEach((header) => {
    const toggle = header.querySelector('.nav-toggle');
    const nav = header.querySelector('.topnav');
    if (!toggle || !nav) return;

    toggle.removeAttribute('onclick');
    const setOpen = (open) => {
      nav.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
    };

    toggle.addEventListener('click', (event) => {
      event.stopPropagation();
      setOpen(!nav.classList.contains('is-open'));
    });
    nav.addEventListener('click', (event) => {
      if (event.target.closest('a')) setOpen(false);
    });
    document.addEventListener('click', (event) => {
      if (!header.contains(event.target)) setOpen(false);
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') setOpen(false);
    });
  });
}

function setAgentPanelVisible(visible) {
  const panel = document.getElementById('agent-panel');
  const launcher = document.getElementById('agent-launcher');
  if (!panel || !launcher) return;
  if (visible) {
    panel.classList.remove('hidden');
    panel.setAttribute('aria-hidden', 'false');
    launcher.classList.add('agent-launcher--active');
  } else {
    panel.classList.add('hidden');
    panel.setAttribute('aria-hidden', 'true');
    launcher.classList.remove('agent-launcher--active');
  }
}

function renderAgentMessages() {
  const chatWindow = document.getElementById('agent-chat-window');
  if (!chatWindow) return;
  chatWindow.replaceChildren();
  AGENT_DATA.messages.forEach((message) => {
    const item = document.createElement('div');
    item.className = `agent-chat-message agent-chat-message--${message.role}`;
    const role = document.createElement('span');
    role.className = 'agent-chat-role';
    role.textContent = message.role === 'assistant' ? 'Assistant' : 'You';
    const text = document.createElement('p');
    text.textContent = message.text;
    item.append(role, text);
    if (message.actions && message.actions.length) {
      const actions = document.createElement('div');
      actions.className = 'agent-message-actions';
      message.actions.forEach((action) => {
        const link = document.createElement('a');
        link.className = 'btn btn--sm btn--secondary';
        link.href = action.href;
        link.textContent = action.label;
        actions.appendChild(link);
      });
      item.appendChild(actions);
    }
    chatWindow.appendChild(item);
  });
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function addAgentMessage(role, text, actions) {
  AGENT_DATA.messages.push({ role, text, actions: actions || [], timestamp: Date.now() });
  renderAgentMessages();
}

function normalizeAgentText(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9\s]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function shouldOfferProductMatches(prompt) {
  var cleanPrompt = normalizeAgentText(prompt);
  if (!cleanPrompt) return false;
  var shoppingTerms = [
    'recommend', 'suggest', 'show', 'find', 'product', 'products', 'shop', 'buy', 'order', 'available',
    'price', 'cost', 'for my', 'for hair', 'for skin', 'dry skin', 'hair growth', 'acne', 'glow', 'scent', 'fragrance'
  ];
  return shoppingTerms.some(function(term) { return cleanPrompt.includes(term); });
}

function findAgentProductMatches(prompt) {
  var cleanPrompt = normalizeAgentText(prompt);
  if (!cleanPrompt || !AGENT_DATA.catalog) return [];
  var stopWords = new Set(['the', 'and', 'for', 'with', 'you', 'your', 'are', 'can', 'what', 'how', 'why', 'when', 'where', 'which', 'that', 'this', 'have', 'has', 'from', 'about', 'there', 'they', 'them', 'please', 'need', 'want']);
  var promptTerms = cleanPrompt.split(' ').filter(function(word) { return word.length > 2 && !stopWords.has(word); });
  if (!promptTerms.length) return [];
  var activeConcern = AGENT_CONCERNS.find(function(concern) {
    return concern.terms.some(function(term) { return cleanPrompt.includes(normalizeAgentText(term)); });
  });
  var scored = [];
  Object.keys(AGENT_DATA.products || {}).forEach(function(slug) {
    var product = AGENT_DATA.products[slug];
    var haystack = normalizeAgentText([product.name, product.category, product.description].join(' '));
    var name = normalizeAgentText(product.name);
    var score = promptTerms.reduce(function(total, word) { return total + (haystack.includes(word) ? 1 : 0); }, 0);
    if (name && (name.includes(cleanPrompt) || cleanPrompt.includes(name))) score += 8;
    if (activeConcern && activeConcern.terms.some(function(term) { return haystack.includes(normalizeAgentText(term)); })) score += 3;
    if (score >= 3) scored.push({ product: product, score: score });
  });
  return scored.sort(function(a, b) { return b.score - a.score; }).slice(0, 4).map(function(item) { return item.product; });
}

function getAgentActions(prompt) {
  var cleanPrompt = normalizeAgentText(prompt);
  if (!cleanPrompt) return [];

  var actions = [];

  if (cleanPrompt.includes('custom') || cleanPrompt.includes('personalized') || cleanPrompt.includes('customised') || cleanPrompt.includes('customized')) {
    actions.push(
      { label: 'Start custom order', href: '/shop?focus=custom#custom-care' },
      { label: 'Browse fragrances', href: '/fragrances' }
    );
  }

  if (cleanPrompt.includes('fragrance') || cleanPrompt.includes('scent') || cleanPrompt.includes('perfume')) {
    actions.push({ label: 'Open fragrance library', href: '/fragrances' });
  }

  if (cleanPrompt.includes('order') || cleanPrompt.includes('buy') || cleanPrompt.includes('shop')) {
    actions.push({ label: 'Open shop', href: '/shop' });
  }

  var matches = shouldOfferProductMatches(prompt) ? findAgentProductMatches(prompt) : [];
  matches.forEach(function(product) {
    actions.push({ label: product.name, href: '/shop?product=' + encodeURIComponent(product.slug) });
  });
  if (matches.length && !actions.some(function(action) { return action.href === '/shop'; })) {
    actions.push({ label: 'Browse all products', href: '/shop' });
  }
  return actions.filter(function(action, index, list) {
    return list.findIndex(function(candidate) { return candidate.href === action.href; }) === index;
  }).slice(0, 5);
}

async function callBrainProvider(prompt) {
  if (!AGENT_API_ENDPOINT) {
    return { error: 'Missing agent API URL. Add AGENT_API_URL to the configuration.' };
  }

  try {
    const response = await fetch(AGENT_API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message: prompt, source: 'website', sessionId: getAgentSessionId() }),
    });

    if (!response.ok) {
      return {
        error:
          response.status === 429
            ? 'The assistant has reached its message limit. Please try again later or contact us on WhatsApp.'
            : 'The assistant is temporarily unavailable. Please contact us on WhatsApp at +254 727 349 749.',
      };
    }

    const payload = await response.json();
    return { result: payload.response || payload.answer || 'Agent response received.' };
  } catch (error) {
    return { error: error.message || 'Unable to reach the provider.' };
  }
}

async function handleAgentSend(event) {
  event.preventDefault();
  const input = document.getElementById('agent-input');
  if (!input) return;
  const value = input.value.trim();
  if (!value) return;

  addAgentMessage('user', value);
  input.value = '';

  input.disabled = true;
  const sendButton = event.currentTarget.querySelector('button[type="submit"]');
  if (sendButton) {
    sendButton.disabled = true;
    sendButton.textContent = 'Sending...';
  }

  const result = await callBrainProvider(value);
  if (result.error) {
    addAgentMessage('assistant', result.error);
  } else {
    addAgentMessage('assistant', result.result, getAgentActions(value));
  }
  input.disabled = false;
  input.focus();
  if (sendButton) {
    sendButton.disabled = false;
    sendButton.textContent = 'Send';
  }
}

function getSiteProducts(rawCatalog) {
  const products = {};
  const categories = {};
  (rawCatalog.categories || []).forEach((category) => {
    categories[category.title] = category;
    (category.products || []).forEach((product) => {
      products[product.slug] = { ...product, category: category.title, name: product.name, slug: product.slug };
    });
  });
  return { products, categories };
}

async function initializeAgent() {
  createAgentMarkup();
  setAgentPanelVisible(false);
  updateAgentViewportOffset();
  window.visualViewport?.addEventListener('resize', updateAgentViewportOffset);
  window.visualViewport?.addEventListener('scroll', updateAgentViewportOffset);
  window.addEventListener('orientationchange', updateAgentViewportOffset);

  var launcher = document.getElementById('agent-launcher');
  var panel = document.getElementById('agent-panel');

  if (launcher) {
    launcher.addEventListener('click', function (e) {
      e.stopPropagation();
      var isOpen = panel && !panel.classList.contains('hidden');
      setAgentPanelVisible(!isOpen);
    });
  }
  document.getElementById('agent-close')?.addEventListener('click', function (e) {
    e.stopPropagation();
    setAgentPanelVisible(false);
  });
  document.getElementById('agent-send-form')?.addEventListener('submit', handleAgentSend);
  document.addEventListener('click', function (e) {
    var shortcut = e.target.closest('[data-agent-prompt]');
    if (!shortcut) return;
    e.preventDefault();
    var input = document.getElementById('agent-input');
    if (input) input.value = shortcut.dataset.agentPrompt;
    document.getElementById('agent-send-form')?.requestSubmit();
  });

  try {
    const response = await fetch('/api/catalog');
    const catalogData = await response.json();
    AGENT_DATA.catalog = catalogData;
    const siteProducts = getSiteProducts(catalogData);
    AGENT_DATA.products = siteProducts.products;
    AGENT_DATA.categories = siteProducts.categories;
    addAgentMessage('assistant', 'Hi. Tell me what you are shopping for, your skin or hair goal, preferred scent, or budget. I can help narrow it down and explain the options.');
  } catch (error) {
    addAgentMessage('assistant', `Failed to load catalog data: ${error.message}`);
  }

  window.EssensheaAgent = {
    config: AGENT_CONFIG,
    data: AGENT_DATA,
  };
}

initializeAgent();

function ensureAccountNavigation() {
  document.querySelectorAll('.topnav').forEach(function(nav) {
    if (nav.querySelector('a[href="/account"]')) return;
    var link = document.createElement('a');
    link.href = '/account';
    link.textContent = 'My account';
    nav.appendChild(link);
  });
}

ensureAccountNavigation();
enhanceMobileNavigation();

// ── Cart Widget ──

var CART_STORAGE_KEY = 'essenshea_cart';
var CHECKOUT_DRAFT_KEY = 'essenshea_checkout_draft';
var customerCartIsConnected = false;
var customerCartSyncTimer = null;

function loadCartFromStorage() {
  try {
    var data = localStorage.getItem(CART_STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (e) { return []; }
}

function saveCartToStorage(cart) {
  try { localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart)); } catch (e) {}
}

function normalizeSyncedCart(cart) {
  return (Array.isArray(cart) ? cart : []).filter(function(item) {
    return item && item.id && item.title && Number(item.quantity) > 0;
  }).slice(0, 50).map(function(item) {
    return {
      id: String(item.id).slice(0, 180),
      slug: item.slug ? String(item.slug).slice(0, 180) : null,
      title: String(item.title).slice(0, 180),
      quantity: Math.max(1, Math.min(20, Number(item.quantity) || 1)),
      priceText: String(item.priceText || 'Price on request').slice(0, 80),
      unitPrice: item.unitPrice !== null && item.unitPrice !== undefined && item.unitPrice !== '' && Number.isFinite(Number(item.unitPrice))
        ? Number(item.unitPrice)
        : null,
      available: item.available === true,
    };
  });
}

function mergeCustomerCarts(localItems, accountItems) {
  var merged = new Map();
  normalizeSyncedCart(accountItems).forEach(function(item) { merged.set(item.id, item); });
  normalizeSyncedCart(localItems).forEach(function(item) {
    var existing = merged.get(item.id);
    merged.set(item.id, existing ? Object.assign({}, existing, item, { quantity: Math.max(existing.quantity, item.quantity) }) : item);
  });
  return Array.from(merged.values());
}

function syncCustomerCartSoon() {
  if (!customerCartIsConnected) return;
  window.clearTimeout(customerCartSyncTimer);
  customerCartSyncTimer = window.setTimeout(function() {
    fetch('/api/customer/cart', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: normalizeSyncedCart(loadCartFromStorage()) }),
    }).catch(function() {});
  }, 350);
}

async function connectCustomerExperience() {
  try {
    var responses = await Promise.all([fetch('/api/customer/cart'), fetch('/api/customer/account')]);
    if (!responses[0].ok || !responses[1].ok) return;
    var cartData = await responses[0].json();
    var accountData = await responses[1].json();
    customerCartIsConnected = true;
    var merged = mergeCustomerCarts(loadCartFromStorage(), cartData.items || []);
    saveCartToStorage(merged);
    window.dispatchEvent(new CustomEvent('essenshea-cart-update'));

    var profile = accountData.profile || {};
    var checkoutForm = document.getElementById('cart-popup-form');
    if (checkoutForm) {
      var values = {
        name: profile.full_name || '',
        phone: profile.phone || '',
        fulfilmentMethod: profile.default_fulfilment_method || 'delivery',
        deliveryLocation: profile.default_delivery_location || '',
        notes: profile.delivery_notes || '',
      };
      Object.keys(values).forEach(function(key) {
        var field = checkoutForm.elements.namedItem(key);
        if (field && !field.value) field.value = values[key];
      });
    }
    syncCustomerCartSoon();
  } catch (error) {}
}

function loadCheckoutDraft() {
  try { return JSON.parse(localStorage.getItem(CHECKOUT_DRAFT_KEY) || '{}'); } catch (e) { return {}; }
}

function saveCheckoutDraft(form) {
  if (!form) return;
  var data = new FormData(form);
  try {
    localStorage.setItem(CHECKOUT_DRAFT_KEY, JSON.stringify({
      name: String(data.get('name') || ''),
      phone: String(data.get('phone') || ''),
      fulfilmentMethod: String(data.get('fulfilmentMethod') || 'delivery'),
      deliveryLocation: String(data.get('deliveryLocation') || ''),
      notes: String(data.get('notes') || ''),
      ecoRewardsOptIn: data.get('ecoRewardsOptIn') === 'on',
    }));
  } catch (e) {}
}

function createCartWidgetMarkup() {
  var wrapper = document.createElement('div');
  wrapper.innerHTML =
    '<button id="cart-widget" class="cart-widget" aria-label="Open request list">'
    + '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>'
    + '<span id="cart-badge" class="cart-widget__badge">0</span>'
    + '</button>'
    + '<div id="site-notice" class="site-notice hidden" role="status" aria-live="polite"></div>'
    + '<aside id="cart-popup" class="cart-popup hidden" aria-hidden="true">'
    + '<div class="cart-popup-header">'
    + '<h2>Your request list</h2>'
    + '<button id="cart-popup-close" class="cart-popup-close" aria-label="Close">&times;</button>'
    + '</div>'
    + '<div id="cart-popup-body" class="cart-popup-body">'
    + '<p class="cart-empty">Your request list is empty.</p>'
    + '</div>'
    + '<div class="cart-popup-footer">'
    + '<div class="cart-summary">'
    + '<span id="cart-popup-count">0 items</span>'
    + '<strong id="cart-popup-total" class="cart-popup-total">KSh 0</strong>'
    + '<span id="cart-popup-note">Ready to request when you are.</span>'
    + '</div>'
    + '<form id="cart-popup-form" class="cart-popup-form">'
    + '<label for="cart-customer-name">Full name</label>'
    + '<input id="cart-customer-name" name="name" type="text" autocomplete="name" maxlength="120" required />'
    + '<label for="cart-customer-phone">Phone or WhatsApp number</label>'
    + '<input id="cart-customer-phone" name="phone" type="tel" autocomplete="tel" maxlength="40" required />'
    + '<label for="cart-fulfilment">How should we fulfil this request?</label>'
    + '<select id="cart-fulfilment" name="fulfilmentMethod">'
    + '<option value="delivery">Delivery</option>'
    + '<option value="pickup">Pickup</option>'
    + '<option value="discuss">Discuss with me</option>'
    + '</select>'
    + '<div id="cart-location-group">'
    + '<label for="cart-delivery-location">Delivery town or area</label>'
    + '<input id="cart-delivery-location" name="deliveryLocation" type="text" autocomplete="address-level2" maxlength="200" required />'
    + '</div>'
    + '<label for="cart-order-notes">Order notes <span>(optional)</span></label>'
    + '<textarea id="cart-order-notes" name="notes" rows="2" maxlength="500" placeholder="Delivery instructions, preferred contact time, or anything we should know"></textarea>'
    + '<label class="consent-check"><input name="ecoRewardsOptIn" type="checkbox" /> <span>Keep my purchase history so Essenshea can check Eco-Rewards refill eligibility.</span></label>'
    + '<div class="form-honeypot" aria-hidden="true"><input name="companyWebsite" type="text" tabindex="-1" autocomplete="off" aria-hidden="true" /></div>'
    + '<button id="cart-popup-checkout" class="btn btn--primary" type="submit" disabled>Send request</button>'
    + '<p id="cart-popup-status" class="form-status" role="status" aria-live="polite"></p>'
    + '</form>'
    + '</div>'
    + '</aside>';
  while (wrapper.firstChild) {
    document.body.appendChild(wrapper.firstChild);
  }
}

function showSiteNotice(message) {
  var notice = document.getElementById('site-notice');
  if (!notice) return;
  notice.textContent = message;
  notice.classList.remove('hidden');
  window.setTimeout(function() { notice.classList.add('hidden'); }, 12000);
}

function updateCartWidget() {
  var cart = loadCartFromStorage();
  var widget = document.getElementById('cart-widget');
  var badge = document.getElementById('cart-badge');
  if (!widget || !badge) return;

  if (cart.length > 0) {
    var total = cart.reduce(function(s, i) { return s + i.quantity; }, 0);
    badge.textContent = total;
    widget.classList.add('cart-widget--visible');
  } else {
    widget.classList.remove('cart-widget--visible');
    var popup = document.getElementById('cart-popup');
    if (popup && !popup.classList.contains('hidden')) {
      popup.classList.add('hidden');
      popup.setAttribute('aria-hidden', 'true');
    }
  }
}

function renderCartPopup() {
  var cart = loadCartFromStorage();
  var body = document.getElementById('cart-popup-body');
  var count = document.getElementById('cart-popup-count');
  var note = document.getElementById('cart-popup-note');
  var checkout = document.getElementById('cart-popup-checkout');
  var totalLabel = document.getElementById('cart-popup-total');
  if (!body) return;

  if (!cart.length) {
    body.innerHTML = '<p class="cart-empty">Your request list is empty.</p>';
    if (count) count.textContent = '0 items';
    if (note) note.textContent = 'Ready to request when you are.';
    if (totalLabel) totalLabel.textContent = 'KSh 0';
    if (checkout) checkout.disabled = true;
    return;
  }

  body.innerHTML = cart.map(function(item) {
    return '<div class="cart-item">'
      + '<div class="cart-item__info">'
      + '<strong>' + item.quantity + 'x ' + item.title + '</strong>'
      + '<span>' + (item.statusText || (item.available ? 'Available - will be prepared for shipment.' : 'Made to order - will be queued and scheduled.')) + '</span>'
      + '</div>'
      + '<div class="cart-item__actions">'
      + '<button class="cart-quantity" type="button" data-cart-action="decrease" data-id="' + item.id + '" aria-label="Remove one">&minus;</button>'
      + '<span>' + item.quantity + '</span>'
      + '<button class="cart-quantity" type="button" data-cart-action="increase" data-id="' + item.id + '" aria-label="Add one more">+</button>'
      + '<button class="btn btn--sm btn--secondary cart-popup-remove" type="button" data-id="' + item.id + '">Remove</button>'
      + '</div>'
      + '</div>';
  }).join('');

  var total = cart.reduce(function(s, i) { return s + i.quantity; }, 0);
  if (count) count.textContent = total + ' item' + (total === 1 ? '' : 's');
  var pricedTotal = cart.reduce(function(sum, item) {
    return sum + (typeof item.unitPrice === 'number' ? item.unitPrice * item.quantity : 0);
  }, 0);
  var requestPriceCount = cart.filter(function(item) { return typeof item.unitPrice !== 'number'; }).length;
  if (totalLabel) totalLabel.textContent = 'Estimated total: KSh ' + pricedTotal.toLocaleString('en-KE');
  if (note) note.textContent = requestPriceCount
    ? requestPriceCount + ' item' + (requestPriceCount === 1 ? '' : 's') + ' will be priced after review.'
    : 'Taxes or delivery, if applicable, are confirmed before payment.';
  if (checkout) checkout.disabled = false;
}

function trackEssensheaEvent(eventType, details) {
  var payload = Object.assign({ eventType: eventType }, details || {});
  try {
    fetch('/api/analytics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(function() {});
  } catch (error) {}
}
window.essensheaTrack = trackEssensheaEvent;

function submitCartPopup(event) {
  event.preventDefault();
  var cart = loadCartFromStorage();
  if (!cart.length) return;
  var form = document.getElementById('cart-popup-form');
  var checkout = document.getElementById('cart-popup-checkout');
  var status = document.getElementById('cart-popup-status');
  if (!form || !form.reportValidity()) return;
  var formData = new FormData(form);
  if (formData.get('companyWebsite')) return;
  trackEssensheaEvent('checkout_started', {
    metadata: { source: 'website_cart', itemCount: cart.reduce(function(total, item) { return total + item.quantity; }, 0) },
  });
  if (formData.get('ecoRewardsOptIn') === 'on') {
    trackEssensheaEvent('eco_rewards_interest', { metadata: { source: 'website_cart' } });
  }
  if (checkout) { checkout.disabled = true; checkout.textContent = 'Sending\u2026'; }
  if (status) status.textContent = 'Saving your request and alerting Essenshea\u2026';

  fetch('/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: cart.map(function(i) {
        return {
          productSlug: i.id,
          title: i.title,
          quantity: i.quantity,
          priceText: i.priceText,
          unitPrice: i.unitPrice,
        };
      }),
      customer: {
        name: String(formData.get('name') || '').trim(),
        phone: String(formData.get('phone') || '').trim(),
        preferredContact: 'whatsapp',
        fulfilmentMethod: String(formData.get('fulfilmentMethod') || 'discuss'),
        deliveryLocation: String(formData.get('deliveryLocation') || '').trim(),
        notes: String(formData.get('notes') || '').trim(),
        ecoRewardsOptIn: formData.get('ecoRewardsOptIn') === 'on',
      },
      type: 'cart',
      source: 'website_cart',
    }),
  })
  .then(function(r) { return r.json(); })
  .then(function(result) {
    if (result.success) {
      showSiteNotice(result.message);
      try {
        localStorage.setItem('essenshea_order_refresh', JSON.stringify({
          reference: result.reference || '',
          at: Date.now(),
        }));
      } catch (error) {}
      window.dispatchEvent(new CustomEvent('essenshea-order-submitted', { detail: result }));
      localStorage.removeItem(CART_STORAGE_KEY);
      if (customerCartIsConnected) {
        fetch('/api/customer/cart', {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: [] }),
        }).catch(function() {});
      }
      updateCartWidget();
      renderCartPopup();
      form.reset();
      localStorage.removeItem(CHECKOUT_DRAFT_KEY);
      if (status) status.textContent = result.message;
    } else {
      if (status) status.textContent = (result.error || 'We could not submit the request.');
    }
  })
  .catch(function(error) {
    if (status) status.textContent = 'Connection failed. Your request list is still saved; please try again.';
  })
  .finally(function() {
    if (checkout) { checkout.disabled = false; checkout.textContent = 'Send request'; }
  });
}

function initializeCartWidget() {
  createCartWidgetMarkup();
  updateCartWidget();
  renderCartPopup();

  var widget = document.getElementById('cart-widget');
  var popup = document.getElementById('cart-popup');
  var closeBtn = document.getElementById('cart-popup-close');

  if (widget) {
    widget.addEventListener('click', function(e) {
      e.stopPropagation();
      renderCartPopup();
      var isOpen = popup && !popup.classList.contains('hidden');
      if (isOpen) {
        popup.classList.add('hidden');
        popup.setAttribute('aria-hidden', 'true');
      } else {
        popup.classList.remove('hidden');
        popup.setAttribute('aria-hidden', 'false');
      }
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      if (popup) { popup.classList.add('hidden'); popup.setAttribute('aria-hidden', 'true'); }
    });
  }

  document.addEventListener('click', function(e) {
    if (popup && !popup.classList.contains('hidden')) {
      if (!popup.contains(e.target) && e.target !== widget) {
        popup.classList.add('hidden');
        popup.setAttribute('aria-hidden', 'true');
      }
    }
  });

  document.addEventListener('click', function(e) {
    var quantityBtn = e.target.closest('[data-cart-action]');
    if (quantityBtn && quantityBtn.closest('#cart-popup')) {
      var quantityCart = loadCartFromStorage();
      var quantityItem = quantityCart.find(function(item) { return item.id === quantityBtn.dataset.id; });
      if (quantityItem) {
        quantityItem.quantity = Math.max(0, Math.min(20, Number(quantityItem.quantity || 1) + (quantityBtn.dataset.cartAction === 'increase' ? 1 : -1)));
        quantityCart = quantityCart.filter(function(item) { return item.quantity > 0; });
        saveCartToStorage(quantityCart);
        updateCartWidget();
        renderCartPopup();
        window.dispatchEvent(new CustomEvent('essenshea-cart-update'));
      }
      return;
    }
    var btn = e.target.closest('.cart-popup-remove');
    if (!btn) return;
    var id = btn.dataset.id;
    var c = loadCartFromStorage();
    var idx = c.findIndex(function(i) { return i.id === id; });
    if (idx !== -1) {
      c.splice(idx, 1);
      saveCartToStorage(c);
      updateCartWidget();
      renderCartPopup();
      window.dispatchEvent(new CustomEvent('essenshea-cart-update'));
    }
  });

  window.addEventListener('essenshea-cart-update', function() {
    updateCartWidget();
    syncCustomerCartSoon();
    if (popup && !popup.classList.contains('hidden')) {
      renderCartPopup();
    }
  });

  var checkoutBtn = document.getElementById('cart-popup-checkout');
  var checkoutForm = document.getElementById('cart-popup-form');
  var fulfilmentSelect = document.getElementById('cart-fulfilment');
  var locationInput = document.getElementById('cart-delivery-location');
  var locationGroup = document.getElementById('cart-location-group');
  if (checkoutForm) {
    checkoutForm.addEventListener('submit', submitCartPopup);
    var draft = loadCheckoutDraft();
    Object.keys(draft).forEach(function(key) {
      var field = checkoutForm.elements.namedItem(key);
      if (!field) return;
      if (field.type === 'checkbox') field.checked = Boolean(draft[key]);
      else field.value = draft[key];
    });
    checkoutForm.addEventListener('input', function() { saveCheckoutDraft(checkoutForm); });
    checkoutForm.addEventListener('change', function() { saveCheckoutDraft(checkoutForm); });
  }
  if (fulfilmentSelect && locationInput && locationGroup) {
    var updateFulfilmentFields = function() {
      var delivery = fulfilmentSelect.value === 'delivery';
      locationGroup.hidden = !delivery;
      locationInput.required = delivery;
      if (!delivery) locationInput.value = '';
    };
    fulfilmentSelect.addEventListener('change', updateFulfilmentFields);
    updateFulfilmentFields();
  }
}

initializeCartWidget();
connectCustomerExperience();
window.addEventListener('essenshea-account-change', connectCustomerExperience);
