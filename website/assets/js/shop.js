const shopProductsRoot = document.getElementById('shop-products');
const shopCollectionsRoot = document.getElementById('shop-collections');
const cartItemsRoot = document.getElementById('cart-items');
const cartCount = document.getElementById('cart-count');
const cartTotal = document.getElementById('cart-total');
const cartNote = document.getElementById('cart-note');
const checkoutButton = document.getElementById('checkout-button');
const productModal = document.getElementById('product-modal');
const modalTitle = document.getElementById('modal-title');
const modalImage = document.getElementById('modal-image');
const modalDescription = document.getElementById('modal-description');
const modalDetails = document.getElementById('modal-details');
const modalAction = document.getElementById('modal-action');
const modalClose = document.getElementById('modal-close');
const customRequestForm = document.getElementById('custom-request-form');
const customRequestStatus = document.getElementById('custom-request-status');

const shopCollections = [];
const shopProducts = [];

function createProductId(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function formatPrice(value) {
  return `KES ${value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

function excerpt(text, length = 90) {
  if (!text) return '';
  const sanitized = text.replace(/\s+/g, ' ').trim();
  return sanitized.length <= length ? sanitized : `${sanitized.slice(0, length).trim()}…`;
}

function mapAvailability(product) {
  const requestOnlyPatterns = /(custom|customized|request)/i;
  if (requestOnlyPatterns.test(product.title) || requestOnlyPatterns.test(product.category)) {
    return false;
  }
  return typeof product.priceValue === 'number';
}

async function loadShopData() {
  try {
    const response = await fetch('./data/catalog.json');
    const data = await response.json();
    const categories = data.categories || [];

    categories.forEach((category) => {
      shopCollections.push({
        title: category.title,
        copy: category.description || 'Discover premium Essenshea products and request-only items.',
        link: `category.html?slug=${category.slug}`,
      });

      (category.products || []).forEach((product) => {
        const title = product.name || 'Essenshea product';
        const available = mapAvailability({
          title,
          category: category.title,
          priceValue: product.priceValue,
        });

        shopProducts.push({
          id: createProductId(`${category.title}-${title}`),
          title,
          category: category.title,
          priceText: product.price || 'Price on request',
          priceValue: product.priceValue,
          description: product.description || category.description || 'Natural skincare and fragrance products crafted for ritual use.',
          descriptionExcerpt: excerpt(product.description || category.description || 'Natural skincare and fragrance products crafted for ritual use.'),
          image: product.image,
          available,
          stock: product.stock ?? null,
          stockText: typeof product.stock === 'number' ? `In stock: ${product.stock}` : 'Stock pending',
          note: /custom/i.test(title)
            ? 'Custom and request-only product. The seller will confirm price and schedule production.'
            : available
            ? 'Request this item and the seller will confirm availability and pricing.'
            : 'Request-only item; seller will confirm price and schedule production.',
        });
      });
    });

    renderShopCollections();
    renderShopProducts();
  } catch (error) {
    if (shopProductsRoot) {
      shopProductsRoot.innerHTML = '<p class="empty-cart">The product list is being prepared. Please refresh shortly.</p>';
    }
    console.error('Unable to load shop product data', error);
  }
}

const cart = [];

function renderShopCollections() {
  if (!shopCollectionsRoot) return;
  shopCollectionsRoot.innerHTML = shopCollections
    .map(
      (item) => `
        <article class="shop-collection-card">
          <h3>${item.title}</h3>
          <p>${item.copy}</p>
          <a href="${item.link}">Discover</a>
        </article>
      `
    )
    .join('');
}

function renderShopProducts() {
  if (!shopProductsRoot) return;
  shopProductsRoot.innerHTML = shopProducts
    .map(
      (product) => `
        <article class="product-card" data-id="${product.id}">
          <img src="${product.image}" alt="${product.title}" />
          <div class="product-card__content">
            <span class="product-flag">${product.available ? 'Available' : 'Request only'}</span>
            <h3>${product.title}</h3>
            <p>${product.descriptionExcerpt}</p>
            <div class="product-card__meta">
              <span>${product.priceText}</span>
              <span class="product-stock">${product.stockText}</span>
              <button class="button button--ghost product-open" data-id="${product.id}">View</button>
            </div>
          </div>
        </article>
      `
    )
    .join('');
}

function renderCart() {
  if (!cartItemsRoot || !cartCount || !cartNote || !checkoutButton) return;

  if (!cart.length) {
    cartItemsRoot.innerHTML = '<p class="empty-cart">Your request cart is empty. Open a product to add it.</p>';
    cartCount.textContent = '0 items selected';
    if (cartTotal) {
      cartTotal.textContent = '';
    }
    cartNote.textContent = 'Ready to request when you are.';
    checkoutButton.disabled = true;
    return;
  }

  cartItemsRoot.innerHTML = cart
    .map(
      (item) => `
        <div class="cart-item">
          <div>
            <strong>${item.quantity}× ${item.title}</strong>
            <p>${item.available ? 'Available stock will be prepared for shipment.' : 'Requested item will be queued and scheduled.'}</p>
          </div>
          <button class="button button--ghost cart-remove" data-id="${item.id}">Remove</button>
        </div>
      `
    )
    .join('');

  const totalCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const hasAllPrices = cart.every((item) => typeof item.priceValue === 'number');
  const totalValue = cart.reduce((sum, item) => sum + item.quantity * (item.priceValue || 0), 0);

  cartCount.textContent = `${totalCount} item${totalCount === 1 ? '' : 's'} selected`;

  if (cartTotal) {
    cartTotal.textContent = hasAllPrices ? `Subtotal: ${formatPrice(totalValue)}` : 'Pricing will be confirmed by the seller after review.';
  }

  cartNote.textContent = hasAllPrices
    ? 'Shipping and pickup options are confirmed once the seller replies with availability.'
    : 'Cart pricing and fulfillment are confirmed after the seller reviews your request.';
  checkoutButton.disabled = false;
}

function openProductModal(productId) {
  const product = shopProducts.find((item) => item.id === productId);
  if (!product || !productModal) return;

  modalTitle.textContent = product.title;
  modalImage.src = product.image;
  modalImage.alt = product.title;
  modalDescription.textContent = product.description;
  modalDetails.textContent = `${product.priceText} · ${product.available ? 'Available now' : 'Request only'} · ${product.stockText} · ${product.note}`;
  modalAction.textContent = product.available ? 'Add to cart' : 'Request this item';
  modalAction.dataset.id = product.id;
  productModal.classList.remove('hidden');
  productModal.setAttribute('aria-hidden', 'false');
}

function closeProductModal() {
  if (!productModal) return;
  productModal.classList.add('hidden');
  productModal.setAttribute('aria-hidden', 'true');
}

function addToCart(productId) {
  const product = shopProducts.find((item) => item.id === productId);
  if (!product) return;

  const existing = cart.find((item) => item.id === productId);
  if (existing) {
    existing.quantity += 1;
  } else {
    cart.push({ ...product, quantity: 1 });
  }

  renderCart();
  closeProductModal();
}

function removeFromCart(productId) {
  const index = cart.findIndex((item) => item.id === productId);
  if (index === -1) return;
  cart.splice(index, 1);
  renderCart();
}

function submitCartRequest() {
  if (!cart.length) return;

  const requestDetails = cart.map((item) => `${item.quantity}× ${item.title}`).join('\n');
  alert(`Your request has been sent:\n\n${requestDetails}\n\nThe seller will reach out to confirm price and schedule fulfillment.`);
  cart.length = 0;
  renderCart();
}

function handleCustomRequestSubmit(event) {
  event.preventDefault();
  const formData = new FormData(customRequestForm);
  const name = formData.get('name').trim();
  const email = formData.get('email').trim();
  const productType = formData.get('productType');
  const details = formData.get('details').trim();
  const notes = formData.getAll('notes');

  if (!name || !email || !details) {
    customRequestStatus.textContent = 'Please complete your name, email and request details.';
    return;
  }

  customRequestStatus.textContent = 'Your custom request has been sent. A seller will reply with a price and schedule.';
  customRequestForm.reset();
}

renderCart();
loadShopData();

document.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button) return;

  if (button.classList.contains('product-open')) {
    openProductModal(button.dataset.id);
  }

  if (button.id === 'modal-close') {
    closeProductModal();
  }

  if (button.id === 'modal-action') {
    addToCart(button.dataset.id);
  }

  if (event.target === productModal) {
    closeProductModal();
  }

  if (button.classList.contains('cart-remove')) {
    removeFromCart(button.dataset.id);
  }

  if (button.id === 'checkout-button') {
    submitCartRequest();
  }
});

if (customRequestForm) {
  customRequestForm.addEventListener('submit', handleCustomRequestSubmit);
}
