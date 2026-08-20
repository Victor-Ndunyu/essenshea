(function () {
  'use strict';

  const root = document.documentElement;
  const body = document.body;
  const header = document.querySelector('.topbar, .eco-admin-topbar');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let previousScrollTop = window.scrollY || root.scrollTop;

  root.classList.add('atelier-ready');

  const updateScrollState = () => {
    const scrollTop = window.scrollY || root.scrollTop;
    if (header) {
      const moved = scrollTop - previousScrollTop;
      const isPastTop = scrollTop > 24;
      header.classList.toggle('is-scrolled', isPastTop);

      const navigationIsActive = header.matches(':focus-within') || Boolean(header.querySelector('.topnav.is-open'));
      if (!isPastTop || moved < -5 || navigationIsActive) {
        header.classList.remove('is-hidden');
      } else if (scrollTop > 140 && moved > 8) {
        header.classList.add('is-hidden');
      }

      if (!isPastTop || moved < -6) {
        header.classList.remove('is-compact');
      } else if (scrollTop > 120 && moved > 6) {
        header.classList.add('is-compact');
      }
    }
    previousScrollTop = scrollTop;
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

  const careTiles = document.querySelectorAll('#collections .collection-tile');
  if (!reduceMotion && 'IntersectionObserver' in window && careTiles.length) {
    const careObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('care-tile-visible');
        careObserver.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.14 });

    careTiles.forEach((tile, index) => {
      tile.classList.add('care-tile-reveal');
      tile.style.setProperty('--care-order', String(index));
      careObserver.observe(tile);
    });
  } else {
    careTiles.forEach((tile) => tile.classList.add('care-tile-visible'));
  }

  const revealSelector = [
    'main > section',
    '.product-trio__card',
    '.catalog-collection-card',
    '.category-product-card',
    '.product-card',
    '.principles-list__item'
  ].join(',');
  const revealTargets = document.querySelectorAll(revealSelector);

  if (!reduceMotion && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('atelier-visible');
        observer.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });

    let revealOrder = 0;
    const observeRevealTarget = (target) => {
      if (target.classList.contains('atelier-reveal') || target.classList.contains('atelier-visible')) return;
      target.classList.add('atelier-reveal');
      target.style.setProperty('--reveal-order', String(revealOrder % 4));
      revealOrder += 1;
      observer.observe(target);
    };

    revealTargets.forEach(observeRevealTarget);

    const revealMutationObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (!(node instanceof Element)) return;
          if (node.matches(revealSelector)) observeRevealTarget(node);
          node.querySelectorAll(revealSelector).forEach(observeRevealTarget);
        });
      });
    });
    revealMutationObserver.observe(document.querySelector('main') || body, { childList: true, subtree: true });
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

  document.querySelectorAll('input[type="password"]').forEach((input) => {
    if (input.closest('.password-input-shell')) return;

    const shell = document.createElement('span');
    shell.className = 'password-input-shell';
    input.parentNode.insertBefore(shell, input);
    shell.appendChild(input);

    const toggle = document.createElement('button');
    toggle.className = 'password-toggle';
    toggle.type = 'button';
    toggle.setAttribute('aria-label', 'Show password');
    toggle.setAttribute('aria-pressed', 'false');
    toggle.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.75"/></svg>';
    shell.appendChild(toggle);

    toggle.addEventListener('click', () => {
      const showing = input.type === 'text';
      input.type = showing ? 'password' : 'text';
      toggle.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
      toggle.setAttribute('aria-pressed', String(!showing));
    });
  });

  document.querySelectorAll('.topnav a').forEach((link) => {
    link.addEventListener('click', () => {
      const nav = link.closest('.topnav');
      const toggle = document.querySelector('.nav-toggle');
      nav?.classList.remove('is-open');
      toggle?.setAttribute('aria-expanded', 'false');
    });
  });
})();
