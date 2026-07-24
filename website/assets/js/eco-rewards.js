const ecoForm = document.getElementById('eco-lookup-form');
const ecoStatus = document.getElementById('eco-status');
const ecoAccount = document.getElementById('eco-account');

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function formatDate(value) {
  return new Intl.DateTimeFormat('en-KE', { dateStyle: 'medium' }).format(new Date(value));
}

function renderEcoAccount(data) {
  ecoAccount.replaceChildren();
  ecoAccount.classList.remove('hidden');
  const heading = element('div', 'eco-account__heading');
  const titleWrap = element('div');
  titleWrap.append(element('span', 'label', 'Your current card'));
  titleWrap.append(element('h3', 'display-md', `${data.account.name}, you have ${data.account.currentPunches} of 8 punches`));
  heading.append(titleWrap);
  heading.append(element('span', 'eco-next', `${data.account.nextMilestone - data.account.currentPunches} to your next reward`));
  ecoAccount.append(heading);

  const punches = element('div', 'eco-punches');
  for (let index = 1; index <= 8; index += 1) {
    const punch = element('span', index <= data.account.currentPunches ? 'is-earned' : '', String(index));
    punch.setAttribute('aria-label', index <= data.account.currentPunches ? `Punch ${index} earned` : `Punch ${index} not yet earned`);
    punches.append(punch);
  }
  ecoAccount.append(punches);

  const available = data.benefits.filter((benefit) => benefit.status === 'available');
  const rewards = element('div', 'eco-account__section');
  rewards.append(element('h4', '', 'Available rewards'));
  if (!available.length) rewards.append(element('p', 'body-sm', 'No unused rewards yet—your next approved refill moves you closer.'));
  available.forEach((benefit) => {
    const card = element('div', 'eco-benefit');
    card.append(element('strong', '', benefit.label));
    card.append(element('span', '', `Earned ${formatDate(benefit.earned_at)}`));
    rewards.append(card);
  });
  ecoAccount.append(rewards);

  const history = element('div', 'eco-account__section');
  history.append(element('h4', '', 'Recent refill activity'));
  if (!data.refills.length) history.append(element('p', 'body-sm', 'Your approved refills will appear here.'));
  data.refills.forEach((refill) => {
    const row = element('div', 'eco-history');
    row.append(element('strong', '', refill.status === 'approved' ? `${refill.accepted_containers} approved refill${refill.accepted_containers === 1 ? '' : 's'}` : 'Container not accepted'));
    row.append(element('span', '', formatDate(refill.created_at)));
    history.append(row);
  });
  ecoAccount.append(history);
}

ecoForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const submit = ecoForm.querySelector('button[type="submit"]');
  submit.disabled = true;
  ecoStatus.textContent = 'Opening your loyalty card…';
  ecoAccount.classList.add('hidden');
  try {
    const response = await fetch('/api/eco-rewards/customer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: ecoForm.elements.phone.value,
        code: ecoForm.elements.code.value,
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'We could not open your loyalty card');
    ecoStatus.textContent = '';
    renderEcoAccount(data);
  } catch (error) {
    ecoStatus.textContent = error.message;
  } finally {
    submit.disabled = false;
  }
});
