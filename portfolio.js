(() => {
  "use strict";

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (selector, root = document) => root.querySelector(selector);

  const topbar = $(".topbar");
  const hero = $(".hero");
  const modal = $("#playerModal");

  /* =======================================================
     SOUND — synthesized with the Web Audio API (no files)
     ======================================================= */

  const Sound = (() => {
    let ctx = null;
    let master = null;
    let enabled = true;

    try {
      enabled = localStorage.getItem("lucienAudio") !== "off";
    } catch {}

    function ensure() {
      if (!enabled) return null;

      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;

        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = 0.14;
        master.connect(ctx.destination);
      }

      if (ctx.state === "suspended") ctx.resume();
      return ctx;
    }

    function tone({ type = "sine", from, to = from, dur = 0.08, vol = 1, delay = 0, filter }) {
      const c = ensure();
      if (!c) return;

      const t = c.currentTime + delay;
      const osc = c.createOscillator();
      const gain = c.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(from, t);
      if (to !== from) osc.frequency.exponentialRampToValueAtTime(to, t + dur);

      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(vol, t + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);

      if (filter) {
        const lowpass = c.createBiquadFilter();
        lowpass.type = "lowpass";
        lowpass.frequency.value = filter;
        osc.connect(lowpass);
        lowpass.connect(gain);
      } else {
        osc.connect(gain);
      }

      gain.connect(master);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    }

    return {
      get enabled() { return enabled; },

      set(on) {
        enabled = on;
        try { localStorage.setItem("lucienAudio", on ? "on" : "off"); } catch {}
        if (on) ensure();
      },

      click()      { tone({ type: "triangle", from: 1400, to: 900, dur: 0.05, vol: 0.6 }); },
      save()       {
        tone({ from: 880, dur: 0.25, vol: 0.5 });
        tone({ from: 1760, dur: 0.25, vol: 0.3, delay: 0.07 });
      },
      unsave()     { tone({ from: 660, to: 440, dur: 0.15, vol: 0.5 }); },
      modalOpen()  { tone({ from: 300, to: 620, dur: 0.18, vol: 0.55 }); },
      modalClose() { tone({ from: 620, to: 300, dur: 0.16, vol: 0.5 }); },
      warp() {
        tone({ from: 70, to: 520, dur: 0.9, vol: 0.9, filter: 900 });
        tone({ type: "sawtooth", from: 110, to: 55, dur: 0.9, vol: 0.18, filter: 500 });
        tone({ type: "triangle", from: 400, to: 1600, dur: 0.8, vol: 0.12, delay: 0.1 });
      }
    };
  })();

  /* =======================================================
     NAVIGATION HELPERS
     ======================================================= */

  function targetTop(target) {
    return target.getBoundingClientRect().top + window.scrollY -
      (topbar ? topbar.offsetHeight - 1 : 0);
  }

  function jump(target, smooth) {
    window.scrollTo({
      top: Math.max(0, targetTop(target)),
      behavior: smooth ? "smooth" : "instant"
    });
    history.replaceState(null, "", `#${target.id}`);
  }

  /* =======================================================
     1. CURSOR LENS REVEAL
     ======================================================= */

  if (hero) {
    const lens = document.createElement("div");
    lens.className = "hero-lens";
    lens.setAttribute("aria-hidden", "true");

    const ring = document.createElement("div");
    ring.className = "lens-ring";
    ring.setAttribute("aria-hidden", "true");

    hero.append(lens, ring);

    const R = 170;
    let x = 0, y = 0, r = 0;
    let tx = 0, ty = 0, tr = 0;
    let raf = 0;
    let visible = true;
    let touchTimer;

    function draw() {
      x += (tx - x) * 0.18;
      y += (ty - y) * 0.18;
      r += (tr - r) * 0.14;

      const on = r > 1;

      lens.style.setProperty("--x", `${x.toFixed(1)}px`);
      lens.style.setProperty("--y", `${y.toFixed(1)}px`);
      lens.style.setProperty("--r", `${Math.max(r, 0).toFixed(1)}px`);
      lens.style.opacity = on ? "1" : "0";

      ring.style.opacity = on ? "1" : "0";
      ring.style.transform =
        `translate3d(${(x - R).toFixed(1)}px, ${(y - R).toFixed(1)}px, 0) scale(${(Math.max(r, 0.01) / R).toFixed(3)})`;

      const settled =
        Math.abs(tx - x) < 0.3 &&
        Math.abs(ty - y) < 0.3 &&
        Math.abs(tr - r) < 0.3;

      raf = settled || !visible ? 0 : requestAnimationFrame(draw);
    }

    function kick() {
      if (!raf) raf = requestAnimationFrame(draw);
    }

    function aim(event) {
      const box = hero.getBoundingClientRect();
      tx = event.clientX - box.left;
      ty = event.clientY - box.top;
      if (r < 1) { x = tx; y = ty; }
    }

    hero.addEventListener("pointerenter", event => {
      if (event.pointerType === "touch") return;
      aim(event);
      tr = R;
      kick();
    });

    hero.addEventListener("pointermove", event => {
      aim(event);

      if (event.pointerType === "touch") {
        clearTimeout(touchTimer);
        tr = R * 0.8;
      }

      kick();
    });

    const release = event => {
      if (event.pointerType === "touch") {
        touchTimer = setTimeout(() => { tr = 0; kick(); }, 500);
      } else {
        tr = 0;
        kick();
      }
    };

    hero.addEventListener("pointerleave", release);
    hero.addEventListener("pointerup", release);
    hero.addEventListener("pointercancel", release);

    if ("IntersectionObserver" in window) {
      new IntersectionObserver(entries => {
        visible = entries[0].isIntersecting;
        if (visible) kick();
      }).observe(hero);
    }
  }

  /* =======================================================
     2. PORTAL WARP (EXPLORE ANIME button)
     ======================================================= */

  const portal = document.createElement("div");
  portal.className = "portal";
  portal.setAttribute("aria-hidden", "true");
  portal.innerHTML =
    '<span class="portal-swirl"></span>' +
    Array.from({ length: 7 }, (_, i) => `<span class="portal-ring" style="--i:${i}"></span>`).join("") +
    '<span class="portal-core"></span>' +
    '<p class="portal-label">ENTERING THE ARCHIVE</p>';
  document.body.appendChild(portal);

  let warping = false;

  function warpTo(target) {
    if (warping) return;
    warping = true;

    portal.classList.remove("run");
    void portal.offsetWidth; // restart the animation
    portal.classList.add("run");

    Sound.warp();

    setTimeout(() => jump(target, false), 600);

    setTimeout(() => {
      portal.classList.remove("run");
      warping = false;
    }, 1350);
  }

  document.addEventListener("click", event => {
    if (reduce) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    const link = event.target.closest('a.primary-button[href^="#"]');
    if (!link) return;

    const target = $(link.getAttribute("href"));
    if (!target) return;

    event.preventDefault();
    warpTo(target);
  });

  /* =======================================================
     3. HUD BAR (FPS, scroll, section, audio)
     ======================================================= */

  const hudEl = document.createElement("aside");
  hudEl.className = "hud";
  hudEl.setAttribute("aria-label", "Site telemetry");
  hudEl.innerHTML = `
    <span><b>FPS</b><i data-hud="fps">60</i></span>
    <span><b>SCROLL</b><i data-hud="scroll">000%</i></span>
    <span><b>SEC</b><i data-hud="sec">HOME</i></span>
    <span class="hud-keys"><b>KEYS</b><i>1 · 2 · 3 · M</i></span>
    <button class="hud-btn" type="button" data-hud-audio aria-pressed="true">AUDIO: ON</button>
  `;
  document.body.appendChild(hudEl);

  const hudFields = {};
  hudEl.querySelectorAll("[data-hud]").forEach(el => {
    hudFields[el.dataset.hud] = el;
  });

  function setHud(key, value) {
    const el = hudFields[key];
    if (el && el.textContent !== value) el.textContent = value;
  }

  /* FPS */
  let frames = 0;
  let lastTime = performance.now();

  function fpsLoop(now) {
    frames++;

    if (now - lastTime >= 500) {
      setHud("fps", String(Math.round((frames * 1000) / (now - lastTime))));
      frames = 0;
      lastTime = now;
    }

    requestAnimationFrame(fpsLoop);
  }

  requestAnimationFrame(fpsLoop);

  /* Scroll + section */
  const sections = ["home", "browse", "watchlist"]
    .map(id => document.getElementById(id))
    .filter(Boolean);

  let scrollTicking = false;

  function updateScrollHud() {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const pct = max > 0 ? Math.round((window.scrollY / max) * 100) : 0;
    setHud("scroll", `${String(Math.min(pct, 100)).padStart(3, "0")}%`);

    let name = "HOME";
    const line = window.innerHeight * 0.4;

    sections.forEach(section => {
      if (section.getBoundingClientRect().top <= line) {
        name = section.id.toUpperCase();
      }
    });

    setHud("sec", name);
    scrollTicking = false;
  }

  window.addEventListener("scroll", () => {
    if (scrollTicking) return;
    scrollTicking = true;
    requestAnimationFrame(updateScrollHud);
  }, { passive: true });

  updateScrollHud();

  /* Audio toggle */
  const audioBtn = $("[data-hud-audio]", hudEl);

  function paintAudio() {
    audioBtn.textContent = Sound.enabled ? "AUDIO: ON" : "AUDIO: OFF";
    audioBtn.setAttribute("aria-pressed", String(Sound.enabled));
  }

  function toggleAudio() {
    Sound.set(!Sound.enabled);
    paintAudio();
    Sound.click();
  }

  audioBtn.addEventListener("click", event => {
    event.stopPropagation(); // skip the generic click sound
    toggleAudio();
  });

  paintAudio();

  /* =======================================================
     4. SOUND TRIGGERS + HOTKEYS
     ======================================================= */

  // Capture phase: reads the saved state BEFORE script.js re-renders the card.
  document.addEventListener("click", event => {
    const save = event.target.closest("[data-save]");

    if (save) {
      save.classList.contains("is-saved") ? Sound.unsave() : Sound.save();
      return;
    }

    if (event.target.closest("[data-watch]")) return;     // modal sound plays instead
    if (event.target.closest("a.primary-button")) return; // portal sound plays instead

    if (event.target.closest("button, a, .option")) Sound.click();
  }, true);

  if (modal) {
    let wasOpen = modal.classList.contains("show");

    new MutationObserver(() => {
      const isOpen = modal.classList.contains("show");
      if (isOpen === wasOpen) return;

      wasOpen = isOpen;
      isOpen ? Sound.modalOpen() : Sound.modalClose();
    }).observe(modal, { attributes: true, attributeFilter: ["class"] });
  }

  const HOTKEYS = { "1": "home", "2": "browse", "3": "watchlist" };

  document.addEventListener("keydown", event => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    const tag = (event.target.tagName || "").toLowerCase();

    if (["input", "select", "textarea"].includes(tag)) return;
    if (event.target.isContentEditable) return;
    if (event.target.closest && event.target.closest(".ts-wrapper")) return;
    if (modal && modal.classList.contains("show")) return;

    const key = event.key.toLowerCase();

    if (HOTKEYS[key]) {
      const target = document.getElementById(HOTKEYS[key]);
      if (!target) return;

      Sound.click();
      jump(target, !reduce);
    }

    if (key === "m") toggleAudio();
  });
})();