const fragranceSearch = document.getElementById('fragrance-search');
const fragranceTabs = document.getElementById('fragrance-tabs');
const fragranceGrid = document.getElementById('fragrance-grid');
const fragranceCount = document.getElementById('fragrance-count');
const fragranceDatalist = document.getElementById('fragrance-datalist');

let fragranceCollections = [];
let activeFragranceCollection = 'all';

function normalizeValue(value) {
  return String(value || '').toLowerCase().trim();
}

function allFragranceNotes() {
  return fragranceCollections.flatMap((collection) =>
    collection.notes.map((note) => ({ ...collection, note })),
  );
}

function renderFragranceTabs() {
  if (!fragranceTabs) return;
  const tabs = [
    { slug: 'all', title: 'All' },
    ...fragranceCollections.map((collection) => ({ slug: collection.slug, title: collection.title })),
  ];
  fragranceTabs.innerHTML = tabs
    .map((tab) => `<button class="filter-pill ${tab.slug === activeFragranceCollection ? 'is-active' : ''}" type="button" data-fragrance-tab="${tab.slug}">${tab.title}</button>`)
    .join('');
}

function renderFragranceGrid() {
  if (!fragranceGrid) return;
  const query = normalizeValue(fragranceSearch && fragranceSearch.value);
  const items = allFragranceNotes()
    .filter((item) => activeFragranceCollection === 'all' || item.slug === activeFragranceCollection)
    .filter((item) => !query || normalizeValue(item.note + ' ' + item.title).includes(query))
    .sort((a, b) => a.note.localeCompare(b.note, undefined, { sensitivity: 'base' }));

  fragranceGrid.innerHTML = items
    .map((item) => {
      return `<article class="fragrance-note-card">
        <span>${item.title}</span>
        <h3>${item.note}</h3>
        <p>Use this scent in a custom body oil, butter, balm or fragrance-led product.</p>
        <a class="btn btn--sm btn--secondary" href="/shop?fragrance=${encodeURIComponent(item.note)}#custom-care">Choose this scent</a>
      </article>`;
    })
    .join('');

  if (fragranceCount) {
    fragranceCount.textContent = `${items.length} fragrance${items.length === 1 ? '' : 's'} shown`;
  }
}

function renderFragranceSheets() {
  const root = document.getElementById('fragrance-sheets');
  if (!root) return;
  root.innerHTML = fragranceCollections
    .map((collection) => `<figure class="fragrance-sheet">
      <img src="${collection.image}" alt="${collection.title} Essenshea fragrance list" loading="lazy" />
      <figcaption>${collection.title}</figcaption>
    </figure>`)
    .join('');
}

function populateFragranceDatalist() {
  if (!fragranceDatalist) return;
  const uniqueNotes = [...new Set(allFragranceNotes().map((item) => item.note))].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' }),
  );
  fragranceDatalist.innerHTML = uniqueNotes.map((note) => `<option value="${note}"></option>`).join('');
}

async function loadFragrances() {
  try {
    const response = await fetch('/data/fragrances.json');
    const data = await response.json();
    fragranceCollections = data.collections || [];
    renderFragranceTabs();
    renderFragranceSheets();
    populateFragranceDatalist();
    renderFragranceGrid();
  } catch (error) {
    if (fragranceGrid) {
      fragranceGrid.innerHTML = '<p class="body">The fragrance list is being prepared. Please refresh shortly.</p>';
    }
    console.error('Unable to load fragrances', error);
  }
}

if (fragranceTabs) {
  fragranceTabs.addEventListener('click', (event) => {
    const button = event.target.closest('[data-fragrance-tab]');
    if (!button) return;
    activeFragranceCollection = button.dataset.fragranceTab;
    renderFragranceTabs();
    renderFragranceGrid();
  });
}

if (fragranceSearch) {
  fragranceSearch.addEventListener('input', renderFragranceGrid);
}

loadFragrances();
