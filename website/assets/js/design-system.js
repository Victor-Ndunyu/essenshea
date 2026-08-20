(function () {
  'use strict';

  const root = document.documentElement;
  const body = document.body;
  const header = document.querySelector('.topbar, .eco-admin-topbar');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  root.classList.add('atelier-ready');

  const progress = document.createElement('div');
  progress.className = 'atelier-progress';
  progress.setAttribute('aria-hidden', 'true');
  progress.innerHTML = '<span></span>';
  body.appendChild(progress);

  const updateScrollState = () => {
    const scrollTop = window.scrollY || root.scrollTop;
    const range = Math.max(root.scrollHeight - window.innerHeight, 1);
    root.style.setProperty('--page-progress', Math.min(scrollTop / range, 1).toFixed(4));
    if (header) header.classList.toggle('is-scrolled', scrollTop > 24);
  };

  let scrollFrame = 0;
  window.addEventListener('scroll', () => {
    if (scrollFrame) return;
    scrollFrame = window.requestAnimationFrame(() => {
      updateScrollState();
      scrollFrame = 0;
    });
  }, { passive: true });
  window.addEventListener('resize', updateScrollState, { passive: true });
  updateScrollState();

  const revealTargets = document.querySelectorAll([
    'main > section',
    '.product-trio__card',
    '.collection-tile',
    '.catalog-collection-card',
    '.category-product-card',
    '.product-card',
    '.review-card',
    '.fragrance-note-card',
    '.principles-list__item'
  ].join(','));

  if (!reduceMotion && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('atelier-visible');
        observer.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });

    revealTargets.forEach((target, index) => {
      target.classList.add('atelier-reveal');
      target.style.setProperty('--reveal-order', String(index % 4));
      observer.observe(target);
    });
  } else {
    revealTargets.forEach((target) => target.classList.add('atelier-visible'));
  }

  const syncModalState = () => {
    const activeModal = document.querySelector('.modal-overlay:not(.hidden)');
    body.classList.toggle('has-atelier-modal', Boolean(activeModal));
  };

  const modalObserver = new MutationObserver(syncModalState);
  document.querySelectorAll('.modal-overlay').forEach((modal) => {
    modalObserver.observe(modal, { attributes: true, attributeFilter: ['class', 'aria-hidden'] });
  });
  syncModalState();

  document.querySelectorAll('.topnav a').forEach((link) => {
    link.addEventListener('click', () => {
      const nav = link.closest('.topnav');
      const toggle = document.querySelector('.nav-toggle');
      nav?.classList.remove('is-open');
      toggle?.setAttribute('aria-expanded', 'false');
    });
  });
})();
