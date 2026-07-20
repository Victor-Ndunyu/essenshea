var currentCategory = null;
var categoryModal = document.getElementById('category-modal');
var categoryModalTitle = document.getElementById('category-modal-title');
var categoryModalImage = document.getElementById('category-modal-image');
var categoryModalDescription = document.getElementById('category-modal-description');
var categoryModalDetails = document.getElementById('category-modal-details');
var categoryModalAction = document.getElementById('category-modal-action');
var categoryModalClose = document.getElementById('category-modal-close');
var categoryProductGrid = document.getElementById('category-product-grid');

function getQueryParam(name) {
  var params = new URLSearchParams(window.location.search);
  return params.get(name);
}

function openCategoryProductModal(productSlug) {
  if (!currentCategory || !categoryModal) return;
  var product = null;
  for (var i = 0; i < currentCategory.products.length; i++) {
    if (currentCategory.products[i].slug === productSlug) {
      product = currentCategory.products[i];
      break;
    }
  }
  if (!product) return;

  categoryModalTitle.textContent = product.name;
  categoryModalImage.src = product.image;
  categoryModalImage.alt = product.name;
  categoryModalDescription.textContent = product.description;
  var available = typeof product.priceValue === 'number';
  var stockText = typeof product.stock === 'number' ? 'In stock: ' + product.stock : 'Stock pending';
  categoryModalDetails.textContent = (product.price || 'Price on request') + ' · ' + (available ? 'Available now' : 'Request only') + ' · ' + stockText + ' · ' + (available ? 'Seller will ship or confirm pickup options.' : 'Seller will review and confirm pricing and availability.');
  categoryModal.classList.remove('hidden');
  categoryModal.setAttribute('aria-hidden', 'false');
}

function closeCategoryProductModal() {
  if (!categoryModal) return;
  categoryModal.classList.add('hidden');
  categoryModal.setAttribute('aria-hidden', 'true');
}

function handleCategoryProductClick(event) {
  var btn = event.target.closest('.category-product-open');
  if (btn) {
    openCategoryProductModal(btn.getAttribute('data-product'));
  }
}

function setupCategoryEvents() {
  if (categoryProductGrid) {
    categoryProductGrid.addEventListener('click', handleCategoryProductClick);
  }
  if (categoryModal) {
    categoryModal.addEventListener('click', function (event) {
      if (event.target === categoryModal || event.target === categoryModalClose || event.target === categoryModalAction) {
        closeCategoryProductModal();
      }
    });
  }
  window.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && categoryModal && !categoryModal.classList.contains('hidden')) {
      closeCategoryProductModal();
    }
  });
}

function loadCategoryData() {
  var slug = getQueryParam('slug');
  if (!slug) return;
  if (window.EssensheaAgent && window.EssensheaAgent.data && window.EssensheaAgent.data.catalog) {
    var catalog = window.EssensheaAgent.data.catalog;
    for (var i = 0; i < (catalog.categories || []).length; i++) {
      if (catalog.categories[i].slug === slug) {
        currentCategory = catalog.categories[i];
        break;
      }
    }
  }
}

loadCategoryData();
setupCategoryEvents();
