const AGENT_CONFIG = window.AGENT_CONFIG || {};
const AGENT_API_ENDPOINT = AGENT_CONFIG.apiUrl || '/api/agent';
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

function createAgentMarkup() {
  const body = document.body;
  const wrapper = document.createElement('div');
  wrapper.id = 'agent-widget';
  wrapper.innerHTML = `
    <button id="agent-launcher" class="agent-launcher" aria-label="Toggle Essenshea assistant">
      <span class="agent-launcher-icon">🧚</span>
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
        <span>Provider: ${AGENT_CONFIG.brainProvider || 'google'}</span>
        <span>${AGENT_CONFIG.apiUrl ? 'Connected' : 'Endpoint missing'}</span>
      </div>
      <div class="agent-body">
        <div class="agent-chat-window" id="agent-chat-window"></div>
        <form id="agent-send-form" class="agent-send-form">
          <input id="agent-input" type="text" placeholder="Type your question..." aria-label="Agent message input" />
          <button type="submit" class="btn btn--primary">Send</button>
        </form>
      </div>
    </aside>
  `;

  body.appendChild(wrapper);
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
  chatWindow.innerHTML = AGENT_DATA.messages
    .map((message) => `
      <div class="agent-chat-message agent-chat-message--${message.role}">
        <span class="agent-chat-role">${message.role === 'assistant' ? 'Assistant' : 'You'}</span>
        <p>${message.text}</p>
      </div>
    `)
    .join('');
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function addAgentMessage(role, text) {
  AGENT_DATA.messages.push({ role, text, timestamp: Date.now() });
  renderAgentMessages();
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
      body: JSON.stringify({ message: prompt, source: 'website' }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      return { error: `Provider returned ${response.status}: ${errorBody}` };
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

  const result = await callBrainProvider(value);
  if (result.error) {
    addAgentMessage('assistant', `Unable to send request: ${result.error}`);
  } else {
    addAgentMessage('assistant', result.result);
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
    if (panel && !panel.classList.contains('hidden')) {
      if (!panel.contains(e.target) && e.target !== launcher) {
        setAgentPanelVisible(false);
      }
    }
  });

  try {
    const response = await fetch('/data/catalog.json');
    const catalogData = await response.json();
    AGENT_DATA.catalog = catalogData;
    const siteProducts = getSiteProducts(catalogData);
    AGENT_DATA.products = siteProducts.products;
    AGENT_DATA.categories = siteProducts.categories;
    addAgentMessage('assistant', 'Hi there — how can I help you today?');
    addAgentMessage('assistant', 'I can answer questions about Essenshea products, collections, availability, and how to request items.');
  } catch (error) {
    addAgentMessage('assistant', `Failed to load catalog data: ${error.message}`);
  }

  window.EssensheaAgent = {
    config: AGENT_CONFIG,
    data: AGENT_DATA,
  };
}

initializeAgent();

// ── Cart Widget ──

var CART_STORAGE_KEY = 'essenshea_cart';

function loadCartFromStorage() {
  try {
    var data = localStorage.getItem(CART_STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (e) { return []; }
}

function saveCartToStorage(cart) {
  try { localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart)); } catch (e) {}
}

function createCartWidgetMarkup() {
  var wrapper = document.createElement('div');
  wrapper.innerHTML =
    '<button id="cart-widget" class="cart-widget" aria-label="Open request list">'
    + '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>'
    + '<span id="cart-badge" class="cart-widget__badge">0</span>'
    + '</button>'
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
    + '<span id="cart-popup-note">Ready to request when you are.</span>'
    + '</div>'
    + '<button id="cart-popup-checkout" class="btn btn--primary" disabled>Send request</button>'
    + '</div>'
    + '</aside>';
  while (wrapper.firstChild) {
    document.body.appendChild(wrapper.firstChild);
  }
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
  if (!body) return;

  if (!cart.length) {
    body.innerHTML = '<p class="cart-empty">Your request list is empty.</p>';
    if (count) count.textContent = '0 items';
    if (note) note.textContent = 'Ready to request when you are.';
    if (checkout) checkout.disabled = true;
    return;
  }

  body.innerHTML = cart.map(function(item) {
    return '<div class="cart-item">'
      + '<div class="cart-item__info">'
      + '<strong>' + item.quantity + 'x ' + item.title + '</strong>'
      + '<span>' + (item.available ? 'Available &mdash; will be prepared for shipment.' : 'Made to order &mdash; will be queued and scheduled.') + '</span>'
      + '</div>'
      + '<button class="btn btn--sm btn--secondary cart-popup-remove" data-id="' + item.id + '">Remove</button>'
      + '</div>';
  }).join('');

  var total = cart.reduce(function(s, i) { return s + i.quantity; }, 0);
  if (count) count.textContent = total + ' item' + (total === 1 ? '' : 's');
  if (note) note.textContent = 'Ready to submit. We will confirm pricing and availability within 24 hours.';
  if (checkout) checkout.disabled = false;
}

function submitCartPopup() {
  var cart = loadCartFromStorage();
  if (!cart.length) return;
  var checkout = document.getElementById('cart-popup-checkout');
  if (checkout) { checkout.disabled = true; checkout.textContent = 'Sending\u2026'; }

  var name = prompt('Your name:');
  if (!name || !name.trim()) {
    if (checkout) { checkout.disabled = false; checkout.textContent = 'Send request'; }
    return;
  }
  var contact = prompt('Phone number or email:');
  if (!contact || !contact.trim()) {
    if (checkout) { checkout.disabled = false; checkout.textContent = 'Send request'; }
    return;
  }

  fetch('/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: cart.map(function(i) { return { title: i.title, quantity: i.quantity, priceText: i.priceText }; }),
      customer: { name: name.trim(), contact: contact.trim() },
      type: 'cart',
    }),
  })
  .then(function(r) { return r.json(); })
  .then(function(result) {
    if (result.success) {
      alert(result.message);
      localStorage.removeItem(CART_STORAGE_KEY);
      updateCartWidget();
      renderCartPopup();
      var p = document.getElementById('cart-popup');
      if (p) { p.classList.add('hidden'); p.setAttribute('aria-hidden', 'true'); }
    } else {
      alert('Failed to submit: ' + (result.error || 'Unknown error'));
    }
  })
  .catch(function(error) {
    alert('Failed to submit request: ' + error.message);
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
    if (popup && !popup.classList.contains('hidden')) {
      renderCartPopup();
    }
  });

  var checkoutBtn = document.getElementById('cart-popup-checkout');
  if (checkoutBtn) {
    checkoutBtn.addEventListener('click', submitCartPopup);
  }
}

initializeCartWidget();
