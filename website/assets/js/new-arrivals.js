(function () {
  'use strict';
  var section = document.getElementById('new-arrivals');
  if (!section) return;
  var rail = section.querySelector('.arrivals__rail');
  var controls = section.querySelector('.arrivals__controls');
  var previous = section.querySelector('[data-arrivals-prev]');
  var next = section.querySelector('[data-arrivals-next]');
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var products = [], expiryTimer, refreshTimer, observed = false;
  var WEEK = 7 * 24 * 60 * 60 * 1000;
  function active(product, now) {
    var published = Date.parse(product.publishedAt || '');
    return !product.hidden && Number.isFinite(published) && published <= now && now < published + WEEK;
  }
  function element(tag, className, text) {
    var node = document.createElement(tag); node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }
  function card(product, index) {
    var link = element('a', 'arrival');
    link.href = '/shop?product=' + encodeURIComponent(product.slug);
    link.style.setProperty('--arrival-index', String(Math.min(index, 4)));
    var media = element('div', 'arrival__media');
    var image = element('img', 'arrival__image');
    image.src = product.image; image.alt = product.name;
    image.loading = 'lazy'; image.decoding = 'async'; image.width = 700; image.height = 700;
    media.append(image, element('span', 'arrival__badge', 'Just arrived'));
    var body = element('div', 'arrival__body');
    body.append(element('span', 'arrival__category', product.categoryTitle), element('h3', 'arrival__name', product.name));
    var description = String(product.description || '').replace(/\s+/g, ' ').trim();
    body.append(element('p', 'arrival__description', description));
    var meta = element('div', 'arrival__meta');
    meta.append(element('span', 'arrival__price', product.price || 'Price on request'));
    if (product.size) meta.append(element('span', 'arrival__size', product.size));
    var status = product.availableByOrder ? 'Available by order' : product.stock === 0 ? 'Out of stock' : 'Available now';
    body.append(meta, element('span', 'arrival__availability', status), element('span', 'arrival__action', 'Discover this arrival ↗'));
    link.append(media, body); return link;
  }
  function updateControls() {
    var overflowing = rail.scrollWidth > rail.clientWidth + 2;
    controls.hidden = !overflowing;
    previous.disabled = rail.scrollLeft <= 2;
    next.disabled = rail.scrollLeft + rail.clientWidth >= rail.scrollWidth - 2;
  }
  function render() {
    clearTimeout(expiryTimer);
    var now = Date.now();
    var fresh = products.filter(function (p) { return active(p, now); });
    if (!fresh.length) { section.hidden = true; rail.replaceChildren(); return; }
    var signature = JSON.stringify(fresh);
    if (rail.dataset.signature !== signature) {
      var fragment = document.createDocumentFragment();
      fresh.forEach(function (p, index) { fragment.append(card(p, index)); });
      rail.replaceChildren(fragment); rail.dataset.signature = signature;
      section.dataset.count = String(fresh.length);
    }
    section.hidden = false;
    if (!observed) {
      observed = true;
      if ('IntersectionObserver' in window && !reduceMotion.matches) {
        var observer = new IntersectionObserver(function (entries) {
          if (entries.some(function (entry) { return entry.isIntersecting; })) {
            section.classList.add('arrivals--entered'); observer.disconnect();
          }
        }, { threshold: 0.12 });
        observer.observe(section);
      } else section.classList.add('arrivals--entered');
    }
    requestAnimationFrame(updateControls);
    var expires = Math.min.apply(null, fresh.map(function (p) { return Date.parse(p.publishedAt) + WEEK; }));
    expiryTimer = setTimeout(render, Math.max(1, expires - now + 10));
  }
  function refresh() {
    clearTimeout(refreshTimer);
    return fetch('/api/catalog', { cache: 'no-store' }).then(function (response) {
      if (!response.ok) throw new Error('Catalogue unavailable'); return response.json();
    }).then(function (data) {
      products = [];
      (data.categories || []).forEach(function (category) {
        (category.products || []).forEach(function (product) {
          products.push(Object.assign({}, product, { categoryTitle: category.title }));
        });
      });
      products.sort(function (a, b) { return (Date.parse(b.publishedAt || '') || 0) - (Date.parse(a.publishedAt || '') || 0); });
      render();
    }).catch(function () { section.hidden = true; }).finally(function () {
      if (!document.hidden) refreshTimer = setTimeout(refresh, 60000);
    });
  }
  previous.addEventListener('click', function () { rail.scrollBy({ left: -rail.clientWidth * 0.8, behavior: reduceMotion.matches ? 'auto' : 'smooth' }); });
  next.addEventListener('click', function () { rail.scrollBy({ left: rail.clientWidth * 0.8, behavior: reduceMotion.matches ? 'auto' : 'smooth' }); });
  rail.addEventListener('scroll', updateControls, { passive: true });
  if ('ResizeObserver' in window) new ResizeObserver(updateControls).observe(rail);
  else window.addEventListener('resize', updateControls, { passive: true });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) clearTimeout(refreshTimer); else { render(); refresh(); }
  });
  refresh();
})();
