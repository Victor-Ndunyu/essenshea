const categoryTitle = document.getElementById('category-title');
const categoryDescription = document.getElementById('category-description');
const categoryProductsCount = document.getElementById('category-products-count');
const categoryTag = document.getElementById('category-tag');
const categoryImage = document.getElementById('category-image');
const categoryProductGrid = document.getElementById('category-product-grid');
const categoryNoticeText = document.getElementById('category-notice-text');
const categoryModal = document.getElementById('category-modal');
const categoryModalTitle = document.getElementById('category-modal-title');
const categoryModalImage = document.getElementById('category-modal-image');
const categoryModalDescription = document.getElementById('category-modal-description');
const categoryModalDetails = document.getElementById('category-modal-details');
const categoryModalAction = document.getElementById('category-modal-action');
const categoryModalClose = document.getElementById('category-modal-close');

let currentCategory = null;

function getQueryParam(name) {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(name);
}

function excerpt(text, length = 100) {
  if (!text) return '';
  const sanitized = text.replace(/\s+/g, ' ').trim();
  return sanitized.length <= length ? sanitized : `${sanitized.slice(0, length).trim()}…`;
}

function formatPrice(value) {
  return `KES ${value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

async function loadCategory() {
  const slug = getQueryParam('slug');
  if (!slug) {
    categoryTitle.textContent = 'Category not found';
    categoryDescription.textContent = 'Please return to the catalog and select a collection.';
    return;
  }

  try {
    const response = await fetch('./data/catalog.json');
    const data = await response.json();
    const category = (data.categories || []).find((item) => item.slug === slug);

    if (!category) {
      categoryTitle.textContent = 'Category not found';
      categoryDescription.textContent = 'Please return to the catalog and select a collection.';
      return;
    }

    currentCategory = category;
    categoryTitle.textContent = category.title;
    categoryDescription.textContent = category.description;
    categoryProductsCount.textContent = `${category.items} products`;
    categoryTag.textContent = category.tag || 'Curated collection';
    categoryImage.src = category.image;
    categoryImage.alt = category.title;

    renderCategoryProducts(category);
    setupCategoryEvents();
  } catch (error) {
    categoryTitle.textContent = 'Unable to load category';
    categoryDescription.textContent = 'Please refresh the page or return to the catalog later.';
    categoryProductGrid.innerHTML = '<p class="value-card">Unable to load category details right now.</p>';
    console.error('Unable to load category data', error);
  }
}

function renderCategoryProducts(category) {
  categoryProductGrid.innerHTML = (category.products || [])
    .map((product) => {
      const priceText = product.price || 'Price on request';
      const available = typeof product.priceValue === 'number';
      const stockText = typeof product.stock === 'number' ? `In stock: ${product.stock}` : 'Stock pending';

      return `
        <article class="category-product-card">
          <img src="${product.image}" alt="${product.name}" />
          <div class="category-product-card__body">
            <div>
              <h3>${product.name}</h3>
              <p>${excerpt(product.description, 100)}</p>
            </div>
            <div class="category-product-card__meta">
              <span>${priceText}</span>
              <span>${available ? 'Available' : 'Request only'}</span>
              <span class="product-stock">${stockText}</span>
            </div>
            <button type="button" class="button button--ghost category-product-open" data-product="${product.slug}">
              View details
            </button>
          </div>
        </article>
      `;
    })
    .join('');
}

function openCategoryProductModal(productSlug) {
  if (!currentCategory || !categoryModal) return;

  const product = (currentCategory.products || []).find((item) => item.slug === productSlug);
  if (!product) return;

  categoryModalTitle.textContent = product.name;
  categoryModalImage.src = product.image;
  categoryModalImage.alt = product.name;
  categoryModalDescription.textContent = product.description;
  const available = typeof product.priceValue === 'number';
  const stockText = typeof product.stock === 'number' ? `In stock: ${product.stock}` : 'Stock pending';
  categoryModalDetails.textContent = `${product.price || 'Price on request'} · ${available ? 'Available now' : 'Request only'} · ${stockText} · ${available ? 'Seller will ship or confirm pickup options.' : 'Seller will review and confirm pricing and availability.'}`;
  categoryModal.classList.remove('hidden');
  categoryModal.setAttribute('aria-hidden', 'false');
}

function closeCategoryProductModal() {
  if (!categoryModal) return;
  categoryModal.classList.add('hidden');
  categoryModal.setAttribute('aria-hidden', 'true');
}

function handleCategoryProductClick(event) {
  const openButton = event.target.closest('.category-product-open');
  if (openButton) {
    openCategoryProductModal(openButton.dataset.product);
  }
}

function setupCategoryEvents() {
  if (categoryProductGrid) {
    categoryProductGrid.addEventListener('click', handleCategoryProductClick);
  }

  if (categoryModal) {
    categoryModal.addEventListener('click', (event) => {
      if (event.target === categoryModal || event.target === categoryModalClose || event.target === categoryModalAction) {
        closeCategoryProductModal();
      }
    });
  }

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && categoryModal && !categoryModal.classList.contains('hidden')) {
      closeCategoryProductModal();
    }
  });
}

loadCategory();
