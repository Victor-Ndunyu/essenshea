const accountLoading = document.getElementById('account-loading');
const accountAuth = document.getElementById('account-auth');
const accountDashboard = document.getElementById('account-dashboard');
const authStatus = document.getElementById('auth-status');
const CART_KEY = 'essenshea_cart';
const CHECKOUT_KEY = 'essenshea_checkout_draft';

function showAccountView(view) {
  accountLoading.classList.toggle('hidden', view !== 'loading');
  accountAuth.classList.toggle('hidden', view !== 'auth');
  accountDashboard.classList.toggle('hidden', view !== 'dashboard');
}

function setStatus(element, message, isError) {
  if (!element) return;
  element.textContent = message || '';
  element.classList.toggle('is-error', Boolean(isError));
}

function formatDate(value) {
  return new Intl.DateTimeFormat('en-KE', { dateStyle: 'medium' }).format(new Date(value));
}

function statusLabel(value) {
  const labels = {
    new: 'Request received', contacted: 'Contacted', confirmed: 'Confirmed',
    in_preparation: 'In preparation', ready_for_pickup: 'Ready for pickup',
    dispatched: 'Dispatched', completed: 'Completed', cancelled: 'Cancelled',
  };
  return labels[value] || String(value || 'Pending').replace(/_/g, ' ');
}

async function requestJson(url, options) {
  const response = await fetch(url, options);
  const data = await response.json().catch(function() { return {}; });
  if (!response.ok) {
    const error = new Error(data.error || 'Something went wrong. Please try again.');
    error.status = response.status;
    throw error;
  }
  return data;
}

function switchAuthTab(tab) {
  document.querySelectorAll('[data-auth-tab]').forEach(function(button) {
    const active = button.dataset.authTab === tab;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-selected', String(active));
  });
  document.querySelectorAll('[data-auth-panel]').forEach(function(panel) {
    panel.classList.toggle('hidden', panel.dataset.authPanel !== tab);
  });
  setStatus(authStatus, '');
}

function renderCart(items) {
  const root = document.getElementById('account-cart');
  root.replaceChildren();
  if (!items.length) {
    const empty = document.createElement('p');
    empty.className = 'account-empty';
    empty.textContent = 'Your cart is empty. Products you add while signed in will stay with your account.';
    root.append(empty);
    return;
  }
  items.forEach(function(item) {
    const row = document.createElement('div');
    row.className = 'account-list-row';
    const title = document.createElement('strong');
    title.textContent = item.title;
    const detail = document.createElement('span');
    detail.textContent = item.quantity + ' × ' + (item.priceText || 'Price on request');
    row.append(title, detail);
    root.append(row);
  });
}

function renderOrders(orders) {
  const root = document.getElementById('account-orders');
  root.replaceChildren();
  if (!orders.length) {
    const empty = document.createElement('p');
    empty.className = 'account-empty';
    empty.textContent = 'No linked orders yet. Your next signed-in request will appear here automatically.';
    root.append(empty);
    return;
  }
  orders.forEach(function(order) {
    const card = document.createElement('article');
    card.className = 'account-order';
    const header = document.createElement('div');
    header.className = 'account-order__header';
    const identity = document.createElement('div');
    const reference = document.createElement('strong');
    reference.textContent = order.reference;
    const date = document.createElement('span');
    date.textContent = formatDate(order.created_at);
    identity.append(reference, date);
    const badge = document.createElement('span');
    badge.className = 'account-order__status account-order__status--' + order.status;
    badge.textContent = statusLabel(order.status);
    header.append(identity, badge);
    const items = document.createElement('ul');
    (order.order_items || []).forEach(function(item) {
      const line = document.createElement('li');
      line.textContent = item.quantity + ' × ' + item.title + ' — ' + item.price_text;
      items.append(line);
    });
    const detail = document.createElement('p');
    detail.className = 'body-sm';
    detail.textContent = 'Fulfilment: ' + statusLabel(order.fulfilment_method) + ' · Payment: ' + statusLabel(order.payment_status);
    card.append(header, items, detail);
    root.append(card);
  });
}

function renderRewards(rewards) {
  const root = document.getElementById('account-rewards');
  const linkForm = document.getElementById('link-rewards-form');
  root.replaceChildren();
  if (!rewards) {
    const empty = document.createElement('p');
    empty.className = 'account-empty';
    empty.textContent = 'Have an Eco-Rewards card from the shop? Link it once to see your punches here.';
    root.append(empty);
    linkForm.classList.remove('hidden');
    return;
  }
  linkForm.classList.add('hidden');
  const summary = document.createElement('div');
  summary.className = 'account-reward-summary';
  const score = document.createElement('strong');
  score.textContent = rewards.currentPunches + ' / 8';
  const copy = document.createElement('span');
  copy.textContent = 'punches on your current card';
  summary.append(score, copy);
  const punches = document.createElement('div');
  punches.className = 'account-reward-punches';
  for (let index = 1; index <= 8; index += 1) {
    const punch = document.createElement('span');
    punch.textContent = String(index);
    punch.classList.toggle('is-earned', index <= rewards.currentPunches);
    punches.append(punch);
  }
  root.append(summary, punches);
  const available = (rewards.benefits || []).filter(function(benefit) { return benefit.status === 'available'; });
  const note = document.createElement('p');
  note.className = 'body-sm';
  note.textContent = available.length
    ? 'Available now: ' + available.map(function(benefit) { return benefit.label; }).join(', ')
    : 'No unused reward yet. Your approved refills will keep moving the card forward.';
  root.append(note);
}

function fillProfile(profile) {
  const form = document.getElementById('profile-form');
  form.elements.fullName.value = profile.full_name || '';
  form.elements.phone.value = profile.phone || '';
  form.elements.preferredContact.value = profile.preferred_contact || 'whatsapp';
  form.elements.defaultFulfilmentMethod.value = profile.default_fulfilment_method || 'delivery';
  form.elements.defaultDeliveryLocation.value = profile.default_delivery_location || '';
  form.elements.deliveryNotes.value = profile.delivery_notes || '';
  form.elements.marketingConsent.checked = Boolean(profile.marketing_consent);
}

async function loadDashboard() {
  showAccountView('loading');
  try {
    const [account, cart] = await Promise.all([
      requestJson('/api/customer/account'),
      requestJson('/api/customer/cart').catch(function(error) {
        if (error.status === 401) return { items: [] };
        throw error;
      }),
    ]);
    document.getElementById('account-welcome-name').textContent = account.profile.full_name
      ? 'Hello, ' + account.profile.full_name.split(' ')[0] + '.'
      : 'Your account';
    document.getElementById('account-email').textContent = account.email || '';
    fillProfile(account.profile);
    renderOrders(account.orders || []);
    renderRewards(account.rewards);
    renderCart(cart.items || []);
    showAccountView('dashboard');
  } catch (error) {
    if (error.status === 401) {
      showAccountView('auth');
      return;
    }
    showAccountView('auth');
    setStatus(authStatus, error.message, true);
  }
}

document.querySelectorAll('[data-auth-tab]').forEach(function(button) {
  button.addEventListener('click', function() { switchAuthTab(button.dataset.authTab); });
});

document.getElementById('signin-form').addEventListener('submit', async function(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const submit = form.querySelector('button[type="submit"]');
  submit.disabled = true;
  setStatus(authStatus, 'Signing you in…');
  try {
    await requestJson('/api/customer/auth', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'signin', email: form.elements.email.value, password: form.elements.password.value }),
    });
    await loadDashboard();
    window.dispatchEvent(new CustomEvent('essenshea-account-change'));
  } catch (error) {
    setStatus(authStatus, error.message, true);
  } finally {
    submit.disabled = false;
  }
});

document.getElementById('signup-form').addEventListener('submit', async function(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const submit = form.querySelector('button[type="submit"]');
  submit.disabled = true;
  setStatus(authStatus, 'Creating your account…');
  try {
    const data = await requestJson('/api/customer/auth', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'signup', fullName: form.elements.fullName.value, email: form.elements.email.value, password: form.elements.password.value }),
    });
    if (data.requiresConfirmation) {
      switchAuthTab('signin');
      setStatus(authStatus, data.message);
    } else {
      await loadDashboard();
      window.dispatchEvent(new CustomEvent('essenshea-account-change'));
    }
  } catch (error) {
    setStatus(authStatus, error.message, true);
  } finally {
    submit.disabled = false;
  }
});

document.getElementById('recover-password').addEventListener('click', async function() {
  const email = document.getElementById('signin-form').elements.email.value;
  if (!email) return setStatus(authStatus, 'Enter your email address first.', true);
  try {
    const data = await requestJson('/api/customer/auth', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'recover', email: email }),
    });
    setStatus(authStatus, data.message);
  } catch (error) {
    setStatus(authStatus, error.message, true);
  }
});

document.getElementById('account-signout').addEventListener('click', async function() {
  await requestJson('/api/customer/auth', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'signout' }),
  }).catch(function() {});
  showAccountView('auth');
  switchAuthTab('signin');
  window.dispatchEvent(new CustomEvent('essenshea-account-change'));
});

document.getElementById('profile-form').addEventListener('submit', async function(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const status = document.getElementById('profile-status');
  const submit = form.querySelector('button[type="submit"]');
  submit.disabled = true;
  setStatus(status, 'Saving…');
  const payload = {
    fullName: form.elements.fullName.value,
    phone: form.elements.phone.value,
    preferredContact: form.elements.preferredContact.value,
    defaultFulfilmentMethod: form.elements.defaultFulfilmentMethod.value,
    defaultDeliveryLocation: form.elements.defaultDeliveryLocation.value,
    deliveryNotes: form.elements.deliveryNotes.value,
    marketingConsent: form.elements.marketingConsent.checked,
  };
  try {
    const data = await requestJson('/api/customer/account', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    localStorage.setItem(CHECKOUT_KEY, JSON.stringify({
      name: payload.fullName, phone: payload.phone,
      fulfilmentMethod: payload.defaultFulfilmentMethod,
      deliveryLocation: payload.defaultDeliveryLocation,
      notes: payload.deliveryNotes,
    }));
    setStatus(status, data.message);
  } catch (error) {
    setStatus(status, error.message, true);
  } finally {
    submit.disabled = false;
  }
});

document.getElementById('link-rewards-form').addEventListener('submit', async function(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const status = document.getElementById('rewards-status');
  const submit = form.querySelector('button[type="submit"]');
  submit.disabled = true;
  setStatus(status, 'Linking your card…');
  try {
    const data = await requestJson('/api/customer/rewards', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: form.elements.phone.value, code: form.elements.code.value }),
    });
    setStatus(status, data.message);
    await loadDashboard();
  } catch (error) {
    setStatus(status, error.message, true);
  } finally {
    submit.disabled = false;
  }
});

showAccountView('loading');
loadDashboard();

