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
    root.innerHTML = '<p class="body" style="text-align: center; padding: var(--space-2xl);">The collection is being prepared. Please refresh shortly.</p>';
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
    root.innerHTML = '<p class="body" style="text-align: center; padding: var(--space-2xl);">No products match this selection yet.</p>';
    return;
  }

  root.innerHTML = filtered
    .map((category) => {
      const productsMarkup = (category.products || [])
        .slice(0, 6)
        .map(
          (product) => `
            <article class="catalog-product card">
              <img src="${product.image}" alt="${product.name}" class="catalog-product__image" />
              <h3 class="catalog-product__title heading-sm">${product.name}</h3>
            </article>
          `
        )
        .join('');

      return `
        <article class="catalog-section-card card reveal">
          <div class="catalog-section-card__header">
            <div>
              <p class="eyebrow">${category.tag}</p>
              <h2 class="heading-lg">${category.title}</h2>
            </div>
            <span class="catalog-count caption">${category.items} items</span>
          </div>
          <p class="catalog-section-card__copy body">${excerpt(category.description, 110)}</p>
          <div class="catalog-product-grid grid grid--3">${productsMarkup}</div>
          <a class="btn btn--secondary" href="/category/${category.slug}">View all products</a>
        </article>
      `;
    })
    .join('');
}

loadCatalog();
