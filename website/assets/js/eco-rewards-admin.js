let ownerKey = '';
let selectedAccount = null;
const byId = (id) => document.getElementById(id);

async function adminRequest(url = '/api/eco-rewards/admin', options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', 'x-eco-admin-key': ownerKey, ...(options.headers || {}) },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function safeNode(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

async function loadAccounts() {
  const search = byId('account-search').value.trim();
  const data = await adminRequest(`/api/eco-rewards/admin?search=${encodeURIComponent(search)}`);
  const list = byId('account-list');
  list.replaceChildren();
  data.accounts.forEach((account) => {
    const button = safeNode('button', '', 'eco-admin-account');
    button.type = 'button';
    button.dataset.accountId = account.id;
    button.classList.toggle('is-selected', selectedAccount?.id === account.id);
    button.append(safeNode('strong', account.customer_name));
    button.append(safeNode('span', `${account.phone} · ${account.current_punches}/8 punches`));
    button.addEventListener('click', () => openAccount(account.id));
    list.append(button);
  });
  if (!data.accounts.length) list.append(safeNode('p', 'No customers found.', 'body-sm'));
}

async function openAccount(id) {
  const data = await adminRequest(`/api/eco-rewards/admin?accountId=${encodeURIComponent(id)}`);
  selectedAccount = data.account;
  document.querySelectorAll('.eco-admin-account').forEach((button) => {
    button.classList.toggle('is-selected', button.dataset.accountId === id);
  });
  const detail = byId('account-detail');
  detail.classList.remove('hidden');
  detail.replaceChildren();
  const heading = safeNode('div', '', 'eco-admin-detail__heading');
  heading.append(safeNode('h2', `${data.account.customer_name} · ${data.account.current_punches}/8 punches`, 'display-md'));
  const phone = safeNode('span', data.account.phone, 'body');
  heading.append(phone);
  const deleteBtn = safeNode('button', 'Delete customer', 'btn btn--sm btn--ghost');
  deleteBtn.type = 'button';
  deleteBtn.style.color = '#B33A3A';
  deleteBtn.style.borderColor = 'rgba(179,58,58,0.3)';
  deleteBtn.addEventListener('click', () => openDeleteModal(data.account));
  heading.append(deleteBtn);
  detail.append(heading);

  const form = safeNode('div', '', 'form-wrap');
  form.innerHTML = `
    <h3 class="heading-md">Record container inspection and refill</h3>
    <div class="eco-admin-fields">
      <label>Containers submitted<input class="form-input" id="refill-submitted" type="number" min="1" max="25" value="1"></label>
      <label>Containers accepted<input class="form-input" id="refill-accepted" type="number" min="0" max="25" value="1"></label>
      <label>Refill product<input class="form-input" id="refill-product" placeholder="Product being refilled"></label>
      <label>Fulfilment<select class="form-select" id="refill-fulfilment"><option value="pickup">Pick up</option><option value="delivery">Delivery</option></select></label>
      <label>Rejection reason<select class="form-select" id="refill-reason"><option value="">Not rejected</option><option value="damaged">Damaged</option><option value="missing_label">Missing label</option><option value="not_eligible">Not refillable</option><option value="other">Other</option></select></label>
      <label class="consent-check"><input id="refill-paid" type="checkbox"><span>Payment confirmed</span></label>
    </div>
    <textarea class="form-textarea" id="refill-notes" placeholder="Optional notes"></textarea>
    <button class="btn btn--primary" id="record-refill" type="button">Save inspection</button>
    <p class="form-status" id="refill-status"></p>`;
  detail.append(form);
  byId('record-refill').addEventListener('click', recordRefill);

  const benefits = safeNode('div', '', 'eco-admin-benefits');
  benefits.append(safeNode('h3', 'Rewards', 'heading-md'));
  data.benefits.forEach((reward) => {
    const row = safeNode('div', '', 'eco-benefit');
    row.append(safeNode('strong', reward.reward_type.replaceAll('_', ' ')));
    row.append(safeNode('span', reward.status));
    if (reward.status === 'available') {
      const redeem = safeNode('button', 'Redeem', 'btn btn--sm btn--secondary');
      redeem.type = 'button';
      redeem.addEventListener('click', () => redeemReward(reward.id, reward.reward_type));
      row.append(redeem);
    }
    benefits.append(row);
  });
  detail.append(benefits);

  detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function openDeleteModal(account) {
  byId('delete-customer-name').textContent = account.customer_name;
  byId('delete-confirm-input').value = '';
  byId('delete-status').textContent = '';
  byId('delete-modal-confirm').disabled = true;
  byId('delete-modal').classList.remove('hidden');
  byId('delete-confirm-input').focus();
}

async function deleteCustomer() {
  const status = byId('delete-status');
  status.textContent = 'Deleting…';
  try {
    await adminRequest('/api/eco-rewards/admin', {
      method: 'POST',
      body: JSON.stringify({ action: 'delete_account', accountId: selectedAccount.id }),
    });
    byId('delete-modal').classList.add('hidden');
    selectedAccount = null;
    byId('account-detail').classList.add('hidden');
    byId('account-search').value = '';
    await loadAccounts();
  } catch (error) {
    status.textContent = error.message;
  }
}

byId('delete-modal-close').addEventListener('click', () => byId('delete-modal').classList.add('hidden'));
byId('delete-modal-cancel').addEventListener('click', () => byId('delete-modal').classList.add('hidden'));
byId('delete-modal').addEventListener('click', (e) => { if (e.target === byId('delete-modal')) byId('delete-modal').classList.add('hidden'); });
byId('delete-confirm-input').addEventListener('input', () => {
  byId('delete-modal-confirm').disabled = byId('delete-confirm-input').value !== 'DELETE';
});
byId('delete-modal-confirm').addEventListener('click', deleteCustomer);

byId('success-modal-close').addEventListener('click', () => byId('success-modal').classList.add('hidden'));
byId('success-modal-close-btn').addEventListener('click', () => byId('success-modal').classList.add('hidden'));
byId('success-modal').addEventListener('click', (e) => { if (e.target === byId('success-modal')) byId('success-modal').classList.add('hidden'); });

async function recordRefill() {
  const status = byId('refill-status');
  status.textContent = 'Saving…';
  try {
    const data = await adminRequest('/api/eco-rewards/admin', {
      method: 'POST',
      body: JSON.stringify({
        action: 'record_refill',
        accountId: selectedAccount.id,
        submittedContainers: Number(byId('refill-submitted').value),
        acceptedContainers: Number(byId('refill-accepted').value),
        productName: byId('refill-product').value,
        fulfilmentMethod: byId('refill-fulfilment').value,
        rejectionReason: byId('refill-reason').value,
        paymentConfirmed: byId('refill-paid').checked,
        notes: byId('refill-notes').value,
      }),
    });
    status.textContent = `Saved. Card now has ${data.result.current_punches}/8 punches.`;
    await openAccount(selectedAccount.id);
    await loadAccounts();
  } catch (error) {
    status.textContent = error.message;
  }
}

var pendingRedeemId = null;

function redeemReward(rewardId, rewardType) {
  pendingRedeemId = rewardId;
  byId('redeem-reward-type').textContent = rewardType.replaceAll('_', ' ');
  byId('redeem-customer-name').textContent = selectedAccount.customer_name;
  byId('redeem-product-name').value = '';
  byId('redeem-status').textContent = '';
  byId('redeem-modal-confirm').disabled = false;
  byId('redeem-modal').classList.remove('hidden');
  byId('redeem-product-name').focus();
}

byId('redeem-modal-close').addEventListener('click', () => byId('redeem-modal').classList.add('hidden'));
byId('redeem-modal-cancel').addEventListener('click', () => byId('redeem-modal').classList.add('hidden'));
byId('redeem-modal').addEventListener('click', (e) => { if (e.target === byId('redeem-modal')) byId('redeem-modal').classList.add('hidden'); });
byId('redeem-modal-confirm').addEventListener('click', async () => {
  const productName = byId('redeem-product-name').value.trim();
  if (!productName) { byId('redeem-status').textContent = 'Enter the product being redeemed.'; return; }
  byId('redeem-modal-confirm').disabled = true;
  byId('redeem-status').textContent = 'Redeeming...';
  try {
    await adminRequest('/api/eco-rewards/admin', {
      method: 'POST',
      body: JSON.stringify({ action: 'redeem_reward', rewardId: pendingRedeemId, productName }),
    });
    byId('redeem-modal').classList.add('hidden');
    pendingRedeemId = null;
    await openAccount(selectedAccount.id);
  } catch (error) {
    byId('redeem-status').textContent = error.message;
    byId('redeem-modal-confirm').disabled = false;
  }
});

byId('admin-login').addEventListener('click', async () => {
  ownerKey = byId('admin-key').value;
  try {
    await loadAccounts();
    byId('eco-admin-login').classList.add('hidden');
    byId('eco-admin-workspace').classList.remove('hidden');
  } catch (error) {
    byId('admin-login-status').textContent = error.message;
  }
});
byId('search-accounts').addEventListener('click', () => loadAccounts().catch((error) => { byId('admin-login-status').textContent = error.message; }));
byId('create-account').addEventListener('click', async () => {
  const status = byId('create-status');
  try {
    const data = await adminRequest('/api/eco-rewards/admin', {
      method: 'POST',
      body: JSON.stringify({
        action: 'create_account',
        customerName: byId('new-name').value,
        phone: byId('new-phone').value,
        consent: byId('new-consent').checked,
        consentSource: 'shop',
      }),
    });
    byId('new-name').value = '';
    byId('new-phone').value = '';
    byId('new-consent').checked = false;
    status.textContent = '';
    byId('success-customer-detail').textContent = data.account.customer_name + ' (' + data.account.phone + ') \u2014 card active.';
    var msg = 'Hey%20' + encodeURIComponent(data.account.customer_name) + '!%20%F0%9F%8C%BF%0A%0A'
      + 'Welcome%20to%20Essenshea%20Eco-Rewards!%20Your%20loyalty%20card%20is%20ready%20%F0%9F%8E%89%0A%0A'
      + '%F0%9F%94%91%20Your%20private%20access%20code:%20' + encodeURIComponent(data.accessCode) + '%0A'
      + '%F0%9F%91%89%20View%20your%20card:%20https://essenshea.vercel.app/eco-rewards%0A%0A'
      + 'Every%20time%20you%20refill,%20you%20earn%20punches%20toward%20free%20samples%20and%20discounts.%20%F0%9F%92%9A%0A%0A'
      + 'Your%20privacy%20matters%20%E2%80%94%20your%20info%20stays%20with%20us%20and%20is%20never%20shared.%0A'
      + 'You%20can%20leave%20the%20program%20anytime,%20no%20questions%20asked.%0A%0A'
      + 'So%20glad%20to%20have%20you%20refilling%20with%20us!%0A'
      + '-%20Essenshea';
    byId('success-whatsapp-link').href = 'https://wa.me/' + data.account.phone + '?text=' + msg;
    byId('success-modal').classList.remove('hidden');
    await loadAccounts();
  } catch (error) {
    status.textContent = error.message;
  }
});
