
/* Independent scroll-reveal bootstrap: runs even if app.js has an unrelated runtime error. */
(function () {
  const reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const selectors = [
    ".hero-copy", ".hero-visual", ".hero-bottom", ".hero-stats > div", ".trust-strip > *",
    ".section-head", ".catalog-toolbar", ".price-control", ".catalog-footer", ".car-card",
    ".feature-image", ".feature-copy", ".feature-list > div", ".finance-layout > *",
    ".compare-summary", ".compare-table-wrap", ".gallery-stage", ".gallery-caption",
    ".gallery-thumbs > *", ".about-content", ".about-metrics > *", ".contact-copy",
    ".contact-copy .contact-points > div", ".contact-form"
  ];
  const watched = new WeakSet();
  let sequence = 0;
  let observer = null;

  function prepare(el) {
    if (!(el instanceof Element) || watched.has(el)) return;
    watched.add(el);
    el.classList.add("scroll-animate");
    el.style.setProperty("--scroll-reveal-delay", ((sequence++ % 5) * 65) + "ms");
    if (observer) observer.observe(el);
    else el.classList.add("is-in-view");
  }

  function scan(root) {
    selectors.forEach(function (selector) {
      if (root instanceof Element && root.matches(selector)) prepare(root);
      if (root.querySelectorAll) root.querySelectorAll(selector).forEach(prepare);
    });
  }

  try {
    if (!reduced && "IntersectionObserver" in window) {
      observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-in-view");
          observer.unobserve(entry.target);
        });
      }, { threshold: 0.08, rootMargin: "0px 0px -36px 0px" });
      document.documentElement.classList.add("scroll-motion-ready");
    }

    scan(document);

    // Catalog cards may be replaced when searching, filtering, sorting or editing inventory.
    if ("MutationObserver" in window && document.body) {
      const mutations = new MutationObserver(function (records) {
        records.forEach(function (record) {
          record.addedNodes.forEach(function (node) {
            if (node.nodeType === 1) scan(node);
          });
        });
      });
      mutations.observe(document.body, { childList: true, subtree: true });
    }
  } catch (error) {
    // Fail open: if motion setup fails, never leave content hidden.
    document.documentElement.classList.remove("scroll-motion-ready");
    document.querySelectorAll(".scroll-animate").forEach(function (el) {
      el.classList.add("is-in-view");
    });
    console.warn("VELOCITY scroll animations fell back to visible content.", error);
  }
})();
