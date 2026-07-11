const catalogGrid = document.getElementById('catalog-grid');
const wholesaleForm = document.getElementById('wholesale-form');
const formStatus = document.getElementById('form-status');

async function loadCatalog() {
  try {
    const response = await fetch('./data/catalog.json');
    const data = await response.json();
    renderCatalog(data.categories);
  } catch (error) {
    console.error('Unable to load catalog data', error);
    catalogGrid.innerHTML = '<p class="value-card">The collection is being prepared. Please refresh shortly.</p>';
  }
}

function renderCatalog(categories) {
  catalogGrid.innerHTML = categories
    .map(
      (item) => `
        <article class="catalog-card">
          <img class="catalog-card__image" src="${item.image}" alt="${item.title}" />
          <div class="catalog-card__body">
            <h3>${item.title}</h3>
            <p>${item.description}</p>
            <div class="catalog-card__meta">
              <span>${item.items} products</span>
              <span>${item.tag}</span>
            </div>
            <a class="button button--ghost" href="category.html?slug=${item.slug}">View products</a>
          </div>
        </article>
      `
    )
    .join('');
}

loadCatalog();

if (wholesaleForm && formStatus) {
  wholesaleForm.addEventListener('submit', (event) => {
    event.preventDefault();

    const name = wholesaleForm.elements.name.value.trim();
    const email = wholesaleForm.elements.email.value.trim();

    if (!name || !email) {
      formStatus.textContent = 'Please share your name and email so we can respond warmly.';
      return;
    }

    formStatus.textContent = `Thank you, ${name}. We will reach out shortly with wholesale options and sample availability.`;
    wholesaleForm.reset();
  });
}
