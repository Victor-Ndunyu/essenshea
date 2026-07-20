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
