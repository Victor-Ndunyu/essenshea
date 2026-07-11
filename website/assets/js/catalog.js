const root = document.getElementById('catalog-root');
const filterPills = document.getElementById('filter-pills');

let catalogCategories = [];
let activeFilter = 'All';

async function loadCatalog() {
  try {
    const response = await fetch('./data/catalog.json');
    const data = await response.json();
    catalogCategories = data.categories;
    renderFilters();
    renderCatalog();
  } catch (error) {
    console.error('Unable to load catalog data', error);
    root.innerHTML = '<p class="value-card">The collection is being prepared. Please refresh shortly.</p>';
  }
}

function renderFilters() {
  const labels = ['All', ...catalogCategories.map((category) => category.title)];
  filterPills.innerHTML = labels
    .map(
      (label) => `
        <button class="filter-pill ${label === activeFilter ? 'is-active' : ''}" data-filter="${label}">
          ${label}
        </button>
      `
    )
    .join('');

  filterPills.querySelectorAll('button').forEach((button) => {
    button.addEventListener('click', () => {
      activeFilter = button.dataset.filter;
      renderFilters();
      renderCatalog();
    });
  });
}

function excerpt(text, length = 100) {
  if (!text) return '';
  const sanitized = text.replace(/\s+/g, ' ').trim();
  return sanitized.length <= length ? sanitized : `${sanitized.slice(0, length).trim()}…`;
}

function renderCatalog() {
  const filtered =
    activeFilter === 'All'
      ? catalogCategories
      : catalogCategories.filter((category) => category.title === activeFilter);

  if (!filtered.length) {
    root.innerHTML = '<p class="value-card">No products match this selection yet.</p>';
    return;
  }

  root.innerHTML = filtered
    .map((category) => {
      const productsMarkup = (category.products || [])
        .slice(0, 6)
        .map(
          (product) => `
            <div class="catalog-product">
              <img src="${product.image}" alt="${product.name}" />
              <span>${product.name}</span>
            </div>
          `
        )
        .join('');

      return `
        <article class="catalog-section-card">
          <div class="catalog-section-card__header">
            <div>
              <p class="eyebrow">${category.tag}</p>
              <h2>${category.title}</h2>
            </div>
            <span class="catalog-count">${category.items} items</span>
          </div>
          <p class="catalog-section-card__copy">${excerpt(category.description, 110)}</p>
          <div class="catalog-product-grid">${productsMarkup}</div>
          <a class="button button--ghost" href="category.html?slug=${category.slug}">View all products</a>
        </article>
      `;
    })
    .join('');
}

loadCatalog();
