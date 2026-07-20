const shopProductsRoot = document.getElementById('shop-products-grid');
const shopCollectionsRoot = document.getElementById('shop-collections');
const cartItemsRoot = document.getElementById('cart-items');
const cartCount = document.getElementById('cart-count');
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

function excerpt(text, length = 90) {
  if (!text) return '';
  const sanitized = text.replace(/\s+/g, ' ').trim();
  return sanitized.length <= length ? sanitized : sanitized.slice(0, length).trim() + '…';
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
    const response = await fetch('/data/catalog.json');
    const data = await response.json();
    const categories = data.categories || [];

    categories.forEach((category) => {
      shopCollections.push({
        title: category.title,
        copy: category.description || 'Discover premium Essenshea products.',
        link: '/category/' + category.slug,
      });

      (category.products || []).forEach((product) => {
        const title = product.name || 'Essenshea product';
        const available = mapAvailability({
          title,
          category: category.title,
          priceValue: product.priceValue,
        });

        shopProducts.push({
          id: createProductId(category.title + '-' + title),
          title,
          category: category.title,
          priceText: product.price || 'Price on request',
          priceValue: product.priceValue,
          description: product.description || category.description || 'Natural skincare and fragrance products crafted for ritual use.',
          descriptionExcerpt: excerpt(product.description || category.description || 'Natural skincare and fragrance products crafted for ritual use.'),
          image: product.image,
          available,
          stock: product.stock ?? null,
          stockText: typeof product.stock === 'number' ? 'In stock: ' + product.stock : '',
          note: /custom/i.test(title)
            ? 'Custom product. We will confirm price and schedule production after your request.'
            : available
            ? 'Available now. Add to your request list and we will confirm availability.'
            : 'Made to order. We will confirm price and schedule production after your request.',
        });
      });
    });

    renderShopCollections();
    renderShopProducts();
  } catch (error) {
    if (shopProductsRoot) {
      shopProductsRoot.innerHTML = '<p class="cart-empty">The product list is being prepared. Please refresh shortly.</p>';
    }
    console.error('Unable to load shop product data', error);
  }
}

const cart = [];

function renderShopCollections() {
  if (!shopCollectionsRoot) return;
  shopCollectionsRoot.innerHTML = shopCollections
    .map(function(item) {
      return '<article class="discover-card">'
        + '<h3>' + item.title + '</h3>'
        + '<p>' + item.copy + '</p>'
        + '<a href="' + item.link + '">Browse collection</a>'
        + '</article>';
    })
    .join('');
}

function renderShopProducts() {
  if (!shopProductsRoot) return;
  shopProductsRoot.innerHTML = shopProducts
    .map(function(product) {
      return '<article class="product-card" data-id="' + product.id + '">'
        + '<img src="' + product.image + '" alt="' + product.title + '" loading="lazy" />'
        + '<div class="product-card__content">'
        + '<h3>' + product.title + '</h3>'
        + '<p>' + product.descriptionExcerpt + '</p>'
        + '</div>'
        + '<div class="product-card__meta">'
        + '<span class="product-card__price">' + product.priceText + '</span>'
        + '<span class="product-card__flag">' + (product.available ? 'Available' : 'Made to order') + '</span>'
        + '<button class="btn btn--sm btn--secondary product-open" data-id="' + product.id + '">View</button>'
        + '</div>'
        + '</article>';
    })
    .join('');
}

function renderCart() {
  if (!cartItemsRoot || !cartCount || !cartNote || !checkoutButton) return;

  if (!cart.length) {
    cartItemsRoot.innerHTML = '<p class="cart-empty">Your request list is empty. Open a product to add it.</p>';
    cartCount.textContent = '0 items';
    if (cartNote) cartNote.textContent = 'Ready to request when you are.';
    checkoutButton.disabled = true;
    return;
  }

  cartItemsRoot.innerHTML = cart
    .map(function(item) {
      return '<div class="cart-item">'
        + '<div class="cart-item__info">'
        + '<strong>' + item.quantity + 'x ' + item.title + '</strong>'
        + '<span>' + (item.available ? 'Available &mdash; will be prepared for shipment.' : 'Made to order &mdash; will be queued and scheduled.') + '</span>'
        + '</div>'
        + '<button class="btn btn--sm btn--secondary cart-remove" data-id="' + item.id + '">Remove</button>'
        + '</div>';
    })
    .join('');

  const totalCount = cart.reduce(function(sum, item) { return sum + item.quantity; }, 0);
  cartCount.textContent = totalCount + ' item' + (totalCount === 1 ? '' : 's');

  if (cartNote) {
    cartNote.textContent = 'Ready to submit. We will confirm pricing and availability within 24 hours.';
  }
  checkoutButton.disabled = false;
}

function openProductModal(productId) {
  const product = shopProducts.find(function(item) { return item.id === productId; });
  if (!product || !productModal) return;

  modalTitle.textContent = product.title;
  modalImage.src = product.image;
  modalImage.alt = product.title;
  modalDescription.textContent = product.description;
  modalDetails.textContent = product.priceText + ' &middot; ' + (product.available ? 'Available now' : 'Made to order') + (product.stockText ? ' &middot; ' + product.stockText : '') + ' &middot; ' + product.note;
  modalAction.textContent = 'Add to request';
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
  const product = shopProducts.find(function(item) { return item.id === productId; });
  if (!product) return;

  const existing = cart.find(function(item) { return item.id === productId; });
  if (existing) {
    existing.quantity += 1;
  } else {
    cart.push({ ...product, quantity: 1 });
  }

  renderCart();
  closeProductModal();
}

function removeFromCart(productId) {
  const index = cart.findIndex(function(item) { return item.id === productId; });
  if (index === -1) return;
  cart.splice(index, 1);
  renderCart();
}

async function submitCartRequest() {
  if (!cart.length) return;

  checkoutButton.disabled = true;
  checkoutButton.textContent = 'Sending…';

  const customerName = prompt('Your name:');
  if (!customerName || !customerName.trim()) {
    checkoutButton.disabled = false;
    checkoutButton.textContent = 'Send request';
    return;
  }

  const customerContact = prompt('Phone number or email:');
  if (!customerContact || !customerContact.trim()) {
    checkoutButton.disabled = false;
    checkoutButton.textContent = 'Send request';
    return;
  }

  try {
    const response = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: cart.map(function(item) {
          return {
            title: item.title,
            quantity: item.quantity,
            priceText: item.priceText,
          };
        }),
        customer: {
          name: customerName.trim(),
          contact: customerContact.trim(),
        },
        type: 'cart',
      }),
    });

    const result = await response.json();

    if (result.success) {
      alert(result.message);
      cart.length = 0;
      renderCart();
    } else {
      alert('Failed to submit: ' + (result.error || 'Unknown error'));
    }
  } catch (error) {
    alert('Failed to submit request: ' + error.message);
  } finally {
    checkoutButton.disabled = false;
    checkoutButton.textContent = 'Send request';
  }
}

async function handleCustomRequestSubmit(event) {
  event.preventDefault();
  const formData = new FormData(customRequestForm);
  const name = formData.get('name').trim();
  const email = formData.get('email').trim();
  const productType = formData.get('productType');
  const details = formData.get('details').trim();
  const notes = formData.getAll('notes');
  const submitBtn = document.getElementById('custom-submit');

  if (!name || !email || !details) {
    customRequestStatus.textContent = 'Please complete your name, email and request details.';
    return;
  }

  customRequestStatus.textContent = 'Sending your request…';
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Sending…'; }

  try {
    const response = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [
          {
            title: 'Custom request: ' + (productType || 'Unspecified'),
            quantity: 1,
            priceText: 'Price on request',
          },
        ],
        customer: {
          name: name,
          contact: email,
          email: email,
          notes: details + (notes.length ? ' | Fragrance notes: ' + notes.join(', ') : ''),
        },
        type: 'custom',
      }),
    });

    const result = await response.json();

    if (result.success) {
      customRequestStatus.textContent = result.message;
      customRequestForm.reset();
    } else {
      customRequestStatus.textContent = 'Failed to send: ' + (result.error || 'Unknown error');
    }
  } catch (error) {
    customRequestStatus.textContent = 'Failed to send request: ' + error.message;
  } finally {
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Request custom product'; }
  }
}

renderCart();
loadShopData();

document.addEventListener('click', function(event) {
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
