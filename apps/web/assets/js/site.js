/* BCHS public site — shared behaviour for index.html and admissions.html.
   Deliberately small: navigation, a quiet scroll reveal and toasts. No decorative motion. */
(() => {
  // ---------- Sticky nav state ----------
  const nav = document.getElementById('siteNav');
  if (nav) {
    const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 8);
    document.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  // ---------- Mobile menu ----------
  const burger = document.getElementById('burgerBtn');
  const drawer = document.getElementById('mobileDrawer');
  const setMenu = (open) => {
    drawer.classList.toggle('open', open);
    burger.classList.toggle('open', open);
    burger.setAttribute('aria-expanded', String(open));
  };
  if (burger && drawer) {
    burger.addEventListener('click', () => setMenu(!drawer.classList.contains('open')));
    drawer.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => setMenu(false)));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false); });
  }

  // ---------- Scroll reveal (fade-up, skipped for reduced motion) ----------
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reduced && 'IntersectionObserver' in window) {
    document.documentElement.classList.add('reveal-on');
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    document.querySelectorAll('[data-reveal]').forEach((el) => observer.observe(el));
  }

  // ---------- Toast ----------
  const toast = document.getElementById('toast');
  window.showToast = (msg) => {
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(window.showToast._t);
    window.showToast._t = setTimeout(() => toast.classList.remove('show'), 2600);
  };

  // ---------- Newsletter ----------
  const footerForm = document.getElementById('footerForm');
  if (footerForm) {
    footerForm.addEventListener('submit', (e) => {
      e.preventDefault();
      window.showToast('Thank you. You will receive BCHS Nkwen updates by email.');
      footerForm.reset();
    });
  }
})();
