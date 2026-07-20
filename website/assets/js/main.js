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
    catalogGrid.innerHTML = '<p class="body" style="text-align: center; padding: var(--space-2xl);">The collection is being prepared. Please refresh shortly.</p>';
  }
}

function renderCatalog(categories) {
  catalogGrid.innerHTML = categories
    .map(
      (item) => `
        <article class="catalog-card card">
          <img class="catalog-card__image" src="${item.image}" alt="${item.title}" />
          <div class="catalog-card__body">
            <h3 class="heading-md">${item.title}</h3>
            <p class="body">${item.description}</p>
            <div class="catalog-card__meta">
              <span class="caption">${item.items} products</span>
              <span class="badge badge--accent">${item.tag}</span>
            </div>
            <a class="btn btn--secondary" href="/category/${item.slug}">View products</a>
          </div>
        </article>
      `
    )
    .join('');
}

loadCatalog();

if (wholesaleForm && formStatus) {
  wholesaleForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const name = wholesaleForm.elements.name.value.trim();
    const email = wholesaleForm.elements.email.value.trim();

    if (!name || !email) {
      formStatus.textContent = 'Please share your name and email so we can respond warmly.';
      return;
    }

    formStatus.textContent = 'Sending your request…';

    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [
            {
              title: 'Wholesale inquiry',
              quantity: 1,
              priceText: 'Price on request',
            },
          ],
          customer: {
            name,
            contact: email,
            email,
          },
          type: 'wholesale',
        }),
      });

      const result = await response.json();

      if (result.success) {
        formStatus.textContent = `Thank you, ${name}. We will reach out shortly with wholesale options and sample availability.`;
        wholesaleForm.reset();
      } else {
        formStatus.textContent = `Failed to send: ${result.error || 'Unknown error'}`;
      }
    } catch (error) {
      formStatus.textContent = `Failed to send request: ${error.message}`;
    }
  });
}
