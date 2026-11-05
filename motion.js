/* =========================================================
   LUCIEN ANIME — motion.js
   ========================================================= */

/* ---------- Block 1: scroll, embers, reveal, cards ---------- */
(() => {
  "use strict";

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const topbar = document.querySelector(".topbar");
  const hero = document.querySelector(".hero");

  /* 1. Scroll progress bar + topbar shrink */

  const bar = document.createElement("div");
  bar.className = "scroll-progress";
  bar.setAttribute("aria-hidden", "true");
  document.body.appendChild(bar);

  let ticking = false;

  function onScroll() {
    if (ticking) return;
    ticking = true;

    requestAnimationFrame(() => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const progress = max > 0 ? Math.min(window.scrollY / max, 1) : 0;

      bar.style.transform = `scaleX(${progress})`;
      if (topbar) topbar.classList.toggle("scrolled", window.scrollY > 20);

      ticking = false;
    });
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* 2. Hero embers */

  if (!reduce && hero) {
    const wrap = document.createElement("div");
    wrap.className = "hero-embers";
    wrap.setAttribute("aria-hidden", "true");

    for (let i = 0; i < 22; i++) {
      const ember = document.createElement("span");
      const size = 2 + Math.random() * 4;

      ember.className = "ember";
      ember.style.cssText = `
        left: ${(Math.random() * 100).toFixed(1)}%;
        width: ${size.toFixed(1)}px;
        height: ${size.toFixed(1)}px;
        --dx: ${(Math.random() * 120 - 60).toFixed(0)}px;
        --o: ${(0.35 + Math.random() * 0.55).toFixed(2)};
        animation-duration: ${(7 + Math.random() * 9).toFixed(1)}s;
        animation-delay: ${(-Math.random() * 14).toFixed(1)}s;
      `;

      wrap.appendChild(ember);
    }

    hero.appendChild(wrap);
  }

  /* 3. Scroll reveal */

  if (!reduce && "IntersectionObserver" in window) {
    const io = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add("in-view");
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15 });

    document
      .querySelectorAll(".section-heading, .empty-message, footer")
      .forEach(el => {
        el.classList.add("reveal");
        io.observe(el);
      });
  }

  /* 4. Loading skeletons + staggered card entrance */

  const SKELETONS = '<div class="skeleton-card"></div>'.repeat(8);

  function handleGrid(grid) {
    if (!grid || grid.querySelector(".skeleton-card")) return;

    if (
      grid.children.length === 1 &&
      grid.firstElementChild.tagName === "P" &&
      /^\s*Loading/i.test(grid.firstElementChild.textContent)
    ) {
      grid._sig = "";
      grid.innerHTML = SKELETONS;
      return;
    }

    const cards = [...grid.querySelectorAll(".anime-card")];

    if (!cards.length) {
      grid._sig = "";
      return;
    }

    const sig = cards
      .map(card => card.querySelector("[data-watch]")?.dataset.watch)
      .join(",");

    if (sig === grid._sig) return;
    grid._sig = sig;

    if (reduce) return;

    cards.forEach((card, index) => {
      card.style.setProperty("--i", index);
      card.classList.add("enter");
    });
  }

  ["animeGrid", "watchlistGrid"].forEach(id => {
    const grid = document.getElementById(id);
    if (!grid) return;

    new MutationObserver(() => handleGrid(grid))
      .observe(grid, { childList: true });

    handleGrid(grid);
  });
})();

/* ---------- Block 2: animated hero text ---------- */
(() => {
  "use strict";

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) return;

  const title = document.querySelector(".hero h1");
  const description = document.querySelector(".hero-description");

  /* Split text into words (and optionally letters), keeping <br> */
  function split(el, { chars }) {
    const label = el.textContent.replace(/\s+/g, " ").trim();
    const nodes = [...el.childNodes];
    const frag = document.createDocumentFragment();

    let charIndex = 0;
    let wordIndex = 0;

    nodes.forEach(node => {
      if (node.nodeType !== Node.TEXT_NODE) {
        frag.appendChild(node.cloneNode(true)); // <br>
        return;
      }

      node.textContent.split(/(\s+)/).forEach(part => {
        if (!part) return;

        if (/^\s+$/.test(part)) {
          frag.appendChild(document.createTextNode(" "));
          return;
        }

        const word = document.createElement("span");
        word.className = "split-word";
        word.setAttribute("aria-hidden", "true");
        word.style.setProperty("--w", wordIndex++);

        if (chars) {
          [...part].forEach(letter => {
            const c = document.createElement("span");
            c.className = "split-char";
            c.style.setProperty("--c", charIndex++);
            c.textContent = letter;
            word.appendChild(c);
          });
        } else {
          word.textContent = part;
        }

        frag.appendChild(word);
      });
    });

    el.textContent = "";
    el.setAttribute("aria-label", label);
    el.appendChild(frag);
    el.classList.add("split");
  }

  if (title) split(title, { chars: true });
  if (description) split(description, { chars: false });
})();

/* ---------- Block 3: styled genre dropdown (Tom Select) ---------- */
(() => {
  "use strict";

  const select = document.getElementById("genreFilter");

  // If the CDN is blocked, the normal <select> keeps working.
  if (!select || !window.TomSelect || select.tomselect) return;

  new TomSelect(select, {
    controlInput: null,        // no typing, just pick
    create: false,
    maxOptions: null,
    closeAfterSelect: true,
    dropdownParent: "body",    // never clipped by a section or card
    render: {
      option: (data, escape) =>
        `<div class="genre-option"><span>${escape(data.text)}</span></div>`,
      item: (data, escape) =>
        `<div>${escape(data.text)}</div>`
    }
  });
})();