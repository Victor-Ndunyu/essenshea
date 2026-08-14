(function() {
  'use strict';

  var root = document.getElementById('featured-care-grid');
  var dateLabel = document.getElementById('featured-care-date');
  if (!root) return;

  function nairobiDay() {
    try {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Africa/Nairobi', year: 'numeric', month: '2-digit', day: '2-digit',
      }).format(new Date());
    } catch (error) {
      return new Date().toISOString().slice(0, 10);
    }
  }

  function dayNumber(day) {
    return day.split('').reduce(function(total, character, index) {
      return total + character.charCodeAt(0) * (index + 3);
    }, 0);
  }

  function excerpt(value) {
    var clean = String(value || '')
      .replace(/ingredients?\s*:/i, '')
      .replace(/[•]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return clean.length > 118 ? clean.slice(0, 115).trim() + '…' : clean;
  }

  function pick(pool, seed, offset) {
    return pool.length ? pool[(seed + offset * 17) % pool.length] : null;
  }

  function makeCard(product, theme) {
    var link = document.createElement('a');
    link.className = 'product-trio__card featured-care-card';
    link.href = '/shop?product=' + encodeURIComponent(product.slug);
    link.setAttribute('aria-label', 'View ' + product.name + ' details');

    var image = document.createElement('img');
    image.src = product.image;
    image.alt = product.name;
    image.loading = 'lazy';
    image.decoding = 'async';

    var body = document.createElement('div');
    body.className = 'product-trio__body';
    var eyebrow = document.createElement('span');
    eyebrow.className = 'featured-care-card__theme';
    eyebrow.textContent = theme;
    var title = document.createElement('h3');
    title.textContent = product.name;
    var copy = document.createElement('p');
    copy.textContent = excerpt(product.description) || 'A considered Essenshea formula selected for today.';
    var footer = document.createElement('div');
    footer.className = 'featured-care-card__footer';
    var price = document.createElement('span');
    price.className = 'product-trio__price';
    price.textContent = product.price || 'Price on request';
    var action = document.createElement('span');
    action.className = 'featured-care-card__action';
    action.textContent = 'View details';
    footer.append(price, action);
    body.append(eyebrow, title, copy, footer);
    link.append(image, body);
    return link;
  }

  function render(categories) {
    var products = [];
    categories.forEach(function(category) {
      (category.products || []).forEach(function(product) {
        products.push(Object.assign({ categorySlug: category.slug, categoryTitle: category.title }, product));
      });
    });

    var calmPool = products.filter(function(product) {
      return /lavender|peppermint|chamomile|rose|raw whipped shea/i.test(product.name + ' ' + product.description)
        && /body-butters-and-balms|essential-oils/.test(product.categorySlug);
    });
    var hairPool = products.filter(function(product) {
      return product.categorySlug === 'haircare'
        || (/hair growth|scalp|rosemary|amla|castor/i.test(product.name + ' ' + product.description)
          && product.categorySlug === 'carrier-oils');
    });
    var bodyOilPool = products.filter(function(product) {
      return product.categorySlug === 'body-oils-and-tonics';
    });

    var day = nairobiDay();
    var seed = dayNumber(day);
    var choices = [
      { product: pick(calmPool, seed, 0), theme: 'Calm & lavender' },
      { product: pick(hairPool, seed, 1), theme: 'Hair & scalp care' },
      { product: pick(bodyOilPool, seed, 2), theme: 'Body oil edit' },
    ].filter(function(choice) { return choice.product; });

    var fragment = document.createDocumentFragment();
    choices.forEach(function(choice) { fragment.appendChild(makeCard(choice.product, choice.theme)); });
    root.replaceChildren(fragment);
    root.setAttribute('aria-busy', 'false');
    if (dateLabel) {
      dateLabel.textContent = 'Selected for ' + new Intl.DateTimeFormat('en-KE', {
        timeZone: 'Africa/Nairobi', day: 'numeric', month: 'long',
      }).format(new Date());
    }
  }

  fetch('/api/catalog')
    .then(function(response) {
      if (!response.ok) throw new Error('Catalogue unavailable');
      return response.json();
    })
    .then(function(data) { render(data.categories || []); })
    .catch(function() {
      root.setAttribute('aria-busy', 'false');
      root.innerHTML = '<p class="featured-care-error">Today’s edit is being prepared. <a href="/shop">Browse the full collection</a>.</p>';
    });
})();
