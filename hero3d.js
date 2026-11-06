/* =========================================================
   LUCIEN ANIME — 3D hero character
   ---------------------------------------------------------
   Loads a real, rigged anime (VRM) character and spins her a
   full 360° when you drag across the hero. She follows the
   cursor with her head, blinks, breathes, her hair swings with
   the spring bones, and clicking her makes her wave.

   Outfit: the plain white tee + shorts from the sample are
   repainted at runtime into the LUCIEN kit (near-black fabric
   with neon-green trim) so no extra downloads are needed.

   Open-source pieces used:
   • three.js          — MIT, https://threejs.org
   • @pixiv/three-vrm  — MIT, https://github.com/pixiv/three-vrm
   • VRM1_Constraint_Twist_Sample — (c) 2022 pixiv Inc.
     VRM 1.0 license: redistribution + commercial use allowed,
     credit not required (see vrm.dev/licenses/1.0)

   Swap CHARACTER_URL for any .vrm to change the character.
   ========================================================= */

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";

const hero = document.querySelector(".hero");
const host = document.getElementById("hero3d");

const CHARACTER_URL =
  "https://cdn.jsdelivr.net/gh/pixiv/three-vrm@dev/packages/three-vrm/examples/models/VRM1_Constraint_Twist_Sample.vrm";

/* radians of spin per pixel dragged */
const SPIN_PER_PX = 0.011;
/* how quickly a fling loses speed */
const INERTIA = 0.9;
/* vertical tilt limit (radians) */
const MAX_PITCH = 0.22;
/* gentle idle sway (radians) once the visitor stops dragging */
const SWAY_AMOUNT = 0.26;
const SWAY_SPEED = 0.6;
/* how long the wave animation runs */
const WAVE_TIME = 2.2;

const NEON = "#3dff2f";
const FABRIC = "#0b0f0c";
const FABRIC_DARK = "#080b09";

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------------------------------------------------------
   Outfit repaint
   --------------------------------------------------------- */

/**
 * Take an existing clothing texture, tint it to the LUCIEN
 * palette and draw neon trim on top, using the UV islands of
 * the VRM sample as a guide.
 */
function paintFabric(source, paint) {
  const img = source.image;
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;

  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);
  paint(ctx, canvas.width, canvas.height);
  return canvas;
}

function neon(ctx, alpha = 0.95) {
  ctx.fillStyle = alpha >= 1 ? NEON : `rgba(61, 255, 47, ${alpha})`;
}

function tintFabric(ctx, w, h, color) {
  ctx.globalCompositeOperation = "multiply";
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = "source-over";
}

function topAccents(ctx, w, h) {
  /* the sample stacks the two mirrored halves vertically */
  const half = h / 2;

  for (let oy = 0; oy < h; oy += half) {
    if (oy + half > h) break;

    /* double racing stripe across the chest */
    neon(ctx, 0.95);
    ctx.fillRect(238, oy + 288, 548, 9);
    neon(ctx, 0.6);
    ctx.fillRect(238, oy + 304, 548, 3);

    /* sleeve cuffs */
    neon(ctx, 0.95);
    ctx.fillRect(40, oy + 392, 100, 58);
    ctx.fillRect(884, oy + 392, 106, 58);

    /* glowing hem */
    neon(ctx, 0.9);
    ctx.fillRect(60, oy + 752, 890, 8);

    /* emblem on the chest and back */
    for (const cx of [375, 650]) {
      const cy = oy + 402;
      ctx.beginPath();
      ctx.moveTo(cx, cy - 34);
      ctx.lineTo(cx + 30, cy);
      ctx.lineTo(cx, cy + 34);
      ctx.lineTo(cx - 30, cy);
      ctx.closePath();
      ctx.strokeStyle = NEON;
      ctx.lineWidth = 6;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(cx, cy, 5, 0, Math.PI * 2);
      ctx.fillStyle = NEON;
      ctx.fill();
    }
  }
}

function bottomsAccents(ctx, w, h) {
  /*
   * The shorts' UV islands only cover y ≈ 170–355 of the
   * 1024×1024 sheet, so the trim is a waistband line plus a
   * glowing hem right at the leg openings.
   */
  neon(ctx, 0.95);
  ctx.fillRect(0, 174, w, 7);

  neon(ctx, 0.8);
  ctx.fillRect(0, 336, w, 10);
}

function shoesAccents(ctx, w, h) {
  neon(ctx, 0.5);
  ctx.fillRect(0, h * 0.6, w, h * 0.08);
}

/*
 * `shade` matters as much as `fabric`: MToon ships with a pale
 * blue-grey shadeColorFactor, and every surface that is not fully
 * lit gets painted with it — which is why a near-black texture
 * still rendered as light slate. Overriding it to a dark green
 * keeps the kit black in both the lit and the shaded bands.
 */
const OUTFIT = {
  Tops_01_CLOTH: { fabric: FABRIC, shade: "#16261b", accents: topAccents, glow: 2.2 },
  Bottoms_01_CLOTH: { fabric: FABRIC_DARK, shade: "#111c15", accents: bottomsAccents, glow: 1.4 },
  Shoes_01_CLOTH: { fabric: "#070d09", shade: "#0e1712", accents: shoesAccents, glow: 0.4 }
};

/**
 * Replace the base-colour map of every material whose name
 * matches, so the main pass and the MToon outline pass agree.
 */
function repaintClothing(vrm, renderer) {
  const groups = new Map();

  vrm.scene.traverse((node) => {
    if (!node.isMesh) return;
    const mats = Array.isArray(node.material) ? node.material : [node.material];
    for (const mat of mats) {
      const base = mat.name.replace(" (Outline)", "");
      if (!OUTFIT[base]) continue;
      if (!mat.map || !mat.map.image) continue;
      if (!groups.has(base)) groups.set(base, []);
      groups.get(base).push(mat);
    }
  });

  function texture(canvas, source) {
    const tex = new THREE.CanvasTexture(canvas);
    tex.flipY = source.flipY;
    tex.colorSpace = source.colorSpace || THREE.SRGBColorSpace;
    tex.wrapS = source.wrapS;
    tex.wrapT = source.wrapT;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    tex.needsUpdate = true;
    return tex;
  }

  for (const [base, mats] of groups) {
    const recipe = OUTFIT[base];
    const source = mats[0].map;

    const canvas = paintFabric(source, (ctx, w, h) => {
      tintFabric(ctx, w, h, recipe.fabric);
      recipe.accents(ctx, w, h);

      /* a little fabric grain so the flat fills do not look plastic */
      const grain = ctx.createLinearGradient(0, 0, 0, h);
      grain.addColorStop(0, "rgba(255,255,255,.06)");
      grain.addColorStop(0.5, "rgba(255,255,255,0)");
      grain.addColorStop(1, "rgba(0,0,0,.18)");
      ctx.fillStyle = grain;
      ctx.fillRect(0, 0, w, h);
    });

    /* the trim doubles as an emissive map so it actually glows */
    const glow = document.createElement("canvas");
    glow.width = canvas.width;
    glow.height = canvas.height;
    const gctx = glow.getContext("2d");
    gctx.fillStyle = "#000000";
    gctx.fillRect(0, 0, glow.width, glow.height);
    recipe.accents(gctx, glow.width, glow.height);

    const mapTex = texture(canvas, source);
    const glowTex = texture(glow, source);

    for (const mat of mats) {
      mat.map = mapTex;

      /* kill MToon's pale default shade tint on this garment */
      if (mat.uniforms && mat.uniforms.shadeColorFactor) {
        mat.uniforms.shadeColorFactor.value.setStyle(recipe.shade);
      }

      if (mat.emissiveMap !== undefined) {
        mat.emissiveMap = glowTex;
        if (mat.emissive) mat.emissive.setHex(0xffffff);
        mat.emissiveIntensity = recipe.glow;
      }
      mat.needsUpdate = true;
    }
  }
}

function init() {
  if (!hero || !host) return;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance"
    });
  } catch (err) {
    return; /* no WebGL — the static hero image stays */
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearAlpha(0);
  renderer.domElement.setAttribute("aria-hidden", "true");
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  camera.position.set(0, 0, 6);

  scene.add(new THREE.AmbientLight(0xffffff, 1.0));

  const key = new THREE.DirectionalLight(0xffffff, 2.1);
  key.position.set(2.5, 4, 5);
  scene.add(key);

  /* soft front fill so the face never falls into shadow */
  const fill = new THREE.PointLight(0xffe8d4, 10, 14, 2);
  fill.position.set(-1.5, 1.6, 3);
  scene.add(fill);

  /* pale rim to separate her from the dark stage without tinting the kit */
  const rim = new THREE.DirectionalLight(0xf2fbff, 0.55);
  rim.position.set(-4, 2, -3);
  scene.add(rim);

  /* model holder: everything rotates around this pivot */
  const pivot = new THREE.Group();
  scene.add(pivot);

  let vrm = null;
  let pendant = null;
  let gem = null;

  function viewHeight() {
    return 2 * Math.tan((camera.fov * Math.PI) / 360) * camera.position.z;
  }

  /* ---------- sizing ---------- */

  let natural = null;

  function measure() {
    const root = vrm.scene;
    root.scale.setScalar(1);
    root.position.set(0, 0, 0);
    root.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(root);
    natural = {
      size: box.getSize(new THREE.Vector3()),
      cx: (box.min.x + box.max.x) / 2,
      cz: (box.min.z + box.max.z) / 2,
      minY: box.min.y
    };
  }

  function fit() {
    const w = host.clientWidth;
    const h = host.clientHeight;
    if (!w || !h) return;

    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();

    if (!vrm || !natural) return;

    const vh = viewHeight();
    /*
     * 0.90 leaves headroom so a waving hand never clips the panel.
     * Narrow (stacked) stages are shorter, so leave a little more
     * room at the top for the hint pill.
     */
    const fill = host.clientWidth < 520 ? 0.84 : 0.9;
    const target = vh * fill;
    const scale = target / (natural.size.y || 1);

    vrm.scene.scale.setScalar(scale);
    vrm.scene.position.x = -natural.cx * scale;
    vrm.scene.position.z = -natural.cz * scale;
    vrm.scene.position.y = -vh / 2 + vh * 0.03 - natural.minY * scale;
  }

  new ResizeObserver(fit).observe(hero);
  fit();

  /* ---------- drag to spin ---------- */

  let spin = 0;
  let velocity = 0;
  let pitch = 0;
  let pitchTarget = 0;

  let dragging = false;
  let pointerId = null;
  let lastX = 0;
  let lastY = 0;
  let dragDist = 0;
  let armed = false;
  let interacted = false;
  let idleClock = 0;

  /* head tracking / wave state */
  let headYaw = 0;
  let headPitch = 0;
  let headYawTarget = 0;
  let headPitchTarget = 0;
  let waveTime = -1;

  const hint = document.createElement("div");
  hint.className = "hero-3d-hint";
  hint.setAttribute("aria-hidden", "true");
  hint.textContent = "DRAG TO ROTATE · CLICK TO WAVE";
  /* appended once the character is on stage, so the static
     fallback never shows a hint for a model that never loaded */

  const clamp = (v, max) => Math.max(-max, Math.min(max, v));

  /* eyes and head follow the pointer */
  const lookTarget = new THREE.Object3D();
  lookTarget.position.set(0, 1.2, 2);
  scene.add(lookTarget);

  const aimPoint = new THREE.Vector3();
  const headPoint = new THREE.Vector3();

  function aimHead() {
    if (!vrm) return;
    const head = vrm.humanoid.getNormalizedBoneNode("head");
    if (!head || !head.parent) return;

    head.parent.updateWorldMatrix(true, false);
    aimPoint.copy(lookTarget.position);
    head.parent.worldToLocal(aimPoint);

    const dx = aimPoint.x - head.position.x;
    const dy = aimPoint.y - head.position.y;
    const dz = aimPoint.z - head.position.z;

    let yaw = Math.atan2(dx, dz);
    const pitch = Math.atan2(dy, Math.hypot(dx, dz));

    /* if she has been spun away from the cursor, do not crane her neck */
    if (Math.abs(yaw) > 1.35) {
      headYawTarget = 0;
      headPitchTarget = 0;
      return;
    }

    headYawTarget = clamp(yaw, 0.55);
    headPitchTarget = clamp(pitch, 0.3);
  }

  function onDown(event) {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    if (event.target.closest("a, button, input, select, textarea")) return;

    dragging = true;
    armed = true;
    dragDist = 0;
    pointerId = event.pointerId;
    lastX = event.clientX;
    lastY = event.clientY;
    hero.classList.add("is-dragging");
    hint.classList.add("is-gone");

    try { hero.setPointerCapture(pointerId); } catch (err) { /* ignore */ }

    if (!interacted) interacted = true;
  }

  function onMove(event) {
    const box = hero.getBoundingClientRect();
    const nx = ((event.clientX - box.left) / box.width) * 2 - 1;
    const ny = ((event.clientY - box.top) / box.height) * 2 - 1;
    lookTarget.position.set(nx * 1.6, 1.35 - ny * 0.5, 2);
    aimHead();

    if (!dragging || event.pointerId !== pointerId) return;

    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;

    dragDist += Math.abs(dx) + Math.abs(dy);

    spin += dx * SPIN_PER_PX;
    velocity = clamp(dx * SPIN_PER_PX, 0.05);
    pitchTarget = clamp(pitchTarget + dy * 0.0035, MAX_PITCH);
  }

  function onUp(event) {
    if (!dragging || (pointerId !== null && event.pointerId !== pointerId)) return;
    dragging = false;
    pointerId = null;
    hero.classList.remove("is-dragging");
    pitchTarget = 0;

    /* a tap, not a drag: say hello */
    if (armed && dragDist < 8) {
      waveTime = 0;
    }
    armed = false;
  }

  hero.addEventListener("pointerdown", onDown);
  hero.addEventListener("pointermove", onMove);
  hero.addEventListener("pointerup", onUp);
  hero.addEventListener("pointercancel", onUp);
  hero.addEventListener("dragstart", (e) => e.preventDefault());
  hero.addEventListener("pointerenter", () => {
    if (!interacted) hint.classList.remove("is-gone");
  });

  /* ---------- render loop ---------- */

  let visible = true;
  let raf = 0;
  let elapsed = 0;
  let last = 0;
  let nextBlink = 2.4;

  function frame() {
    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    elapsed += dt;

    if (!dragging) {
      spin += velocity;
      velocity *= INERTIA;
      if (Math.abs(velocity) < 0.0006) velocity = 0;
      pitchTarget *= 0.94;

      /* a gentle sway once the visitor stops — the angle they chose is kept */
      if (velocity === 0 && !reduceMotion) {
        idleClock += dt;
      }
    } else {
      idleClock = 0;
    }

    pitch += (pitchTarget - pitch) * 0.1;

    const swayIn = Math.min(1, Math.max(0, (idleClock - 1.2) / 2));
    const sway = reduceMotion ? 0 : Math.sin(elapsed * SWAY_SPEED) * SWAY_AMOUNT * swayIn;

    pivot.rotation.y = spin + sway;
    pivot.rotation.x = pitch;

    if (vrm) {
      const humanoid = vrm.humanoid;
      const exp = vrm.expressionManager;

      /* --- wave --- */
      let wave = 0;
      if (waveTime >= 0) {
        waveTime += dt;
        if (waveTime > WAVE_TIME) {
          waveTime = -1;
        } else {
          const rise = Math.min(1, waveTime / 0.3);
          const fall = Math.min(1, (WAVE_TIME - waveTime) / 0.45);
          wave = Math.max(0, Math.min(rise, fall));
          wave = wave * wave * (3 - 2 * wave);
        }
      }

      /* --- arms: rest pose, idle swing, wave blend --- */
      const lArm = humanoid.getNormalizedBoneNode("leftUpperArm");
      const rArm = humanoid.getNormalizedBoneNode("rightUpperArm");
      const lFore = humanoid.getNormalizedBoneNode("leftLowerArm");
      const rFore = humanoid.getNormalizedBoneNode("rightLowerArm");
      const swing = reduceMotion ? 0 : Math.sin(elapsed * 0.9) * 0.03;

      if (lArm) {
        lArm.rotation.z = -1.22 + swing;
        lArm.rotation.x = wave * -0.12;
      }
      if (rArm) {
        /* rest = down; negative z lifts the arm above shoulder height */
        rArm.rotation.z = 1.22 + (-0.35 - 1.22) * wave - swing;
        rArm.rotation.x = wave * -0.12;
      }
      if (lFore) lFore.rotation.z = -0.12 - wave * 0.3;
      if (rFore) {
        /* fold the forearm upright, then swing it side to side */
        rFore.rotation.z = 0.12 + (-1.3 - 0.12) * wave
          + Math.sin(waveTime * 9) * 0.2 * wave;
        rFore.rotation.y = 0;
      }

      /* --- head follows the cursor --- */
      const ease = Math.min(1, dt * 7);
      headYaw += (headYawTarget - headYaw) * ease;
      headPitch += (headPitchTarget - headPitch) * ease;

      const head = humanoid.getNormalizedBoneNode("head");
      const neck = humanoid.getNormalizedBoneNode("neck");
      if (neck) {
        neck.rotation.y = headYaw * 0.35;
        neck.rotation.x = headPitch * 0.3;
      }
      if (head) {
        head.rotation.y = headYaw * 0.65;
        head.rotation.x = headPitch * 0.7;
      }

      /* --- breathing + a little weight shift --- */
      if (!reduceMotion) {
        const chest = humanoid.getNormalizedBoneNode("chest");
        if (chest) {
          chest.rotation.x = Math.sin(elapsed * 1.5) * 0.02;
          chest.rotation.y = Math.sin(elapsed * 0.45) * 0.025;
        }
        const hips = humanoid.getNormalizedBoneNode("hips");
        if (hips) hips.rotation.y = Math.sin(elapsed * 0.45 + Math.PI) * 0.03;
      }

      /* --- neon pendant swings with the spin --- */
      if (pendant) {
        const lag = clamp(velocity * 18, 0.55);
        pendant.rotation.z += (lag - pendant.rotation.z) * 0.12;
        pendant.rotation.x = Math.sin(elapsed * 1.2) * 0.05;
        if (gem) gem.rotation.y += dt * 0.8;
      }

      /* --- blink + smile --- */
      if (exp) {
        if (elapsed > nextBlink) {
          const shut = elapsed < nextBlink + 0.12;
          if (exp.getExpression("blink")) exp.setValue("blink", shut ? 1 : 0);
          if (!shut) nextBlink = elapsed + 2 + Math.random() * 4;
        }
        if (exp.getExpression("happy")) {
          exp.setValue("happy", wave * 0.85);
        }
      }

      vrm.update(dt);
    }

    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }

  function start() {
    if (raf || !visible || document.hidden) return;
    last = performance.now();
    frame();
  }

  function stop() {
    if (!raf) return;
    cancelAnimationFrame(raf);
    raf = 0;
  }

  if ("IntersectionObserver" in window) {
    new IntersectionObserver((entries) => {
      visible = entries[0].isIntersecting;
      visible ? start() : stop();
    }, { threshold: 0 }).observe(hero);
  }

  document.addEventListener("visibilitychange", () => {
    document.hidden ? stop() : start();
  });

  /* ---------- floating neon charm ---------- */

  function addCharm() {
    const chest = vrm.humanoid.getNormalizedBoneNode("upperChest");
    if (!chest) return;

    /* a little neon pendant hanging from the collar */
    pendant = new THREE.Group();
    pendant.position.set(0, 0.03, 0.165);
    chest.add(pendant);

    const cord = new THREE.Mesh(
      new THREE.CylinderGeometry(0.005, 0.003, 0.1, 6),
      new THREE.MeshBasicMaterial({ color: 0x3a5340 })
    );
    cord.position.y = -0.05;
    pendant.add(cord);

    gem = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.023, 0),
      new THREE.MeshStandardMaterial({
        color: 0x39ff14,
        emissive: 0x39ff14,
        emissiveIntensity: 2.4,
        metalness: 0.2,
        roughness: 0.25
      })
    );
    gem.position.y = -0.115;
    gem.scale.set(0.78, 1.25, 0.78);
    pendant.add(gem);

    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(0.04, 0.0025, 8, 32),
      new THREE.MeshBasicMaterial({ color: 0x39ff14, transparent: true, opacity: 0.5 })
    );
    halo.position.y = -0.115;
    pendant.add(halo);
  }

  /* ---------- load the character ---------- */

  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser));

  loader.load(
    CHARACTER_URL,
    (gltf) => {
      vrm = gltf.userData.vrm;
      if (!vrm) return;

      VRMUtils.removeUnnecessaryVertices(gltf.scene);
      VRMUtils.combineSkeletons(gltf.scene);

      gltf.scene.traverse((node) => {
        node.frustumCulled = false;
      });

      /* outfit swap before the first frame */
      repaintClothing(vrm, renderer);

      /* relax the T-pose into a natural stance */
      const bones = vrm.humanoid;
      const lArm = bones.getNormalizedBoneNode("leftUpperArm");
      const rArm = bones.getNormalizedBoneNode("rightUpperArm");
      const lFore = bones.getNormalizedBoneNode("leftLowerArm");
      const rFore = bones.getNormalizedBoneNode("rightLowerArm");
      if (lArm) lArm.rotation.z = -1.22;
      if (rArm) rArm.rotation.z = 1.22;
      if (lFore) lFore.rotation.z = -0.12;
      if (rFore) rFore.rotation.z = 0.12;

      if (vrm.lookAt) vrm.lookAt.target = lookTarget;

      pivot.add(gltf.scene);
      vrm.update(0);   /* bake the pose before measuring */
      addCharm();
      measure();
      fit();

      hero.classList.add("is-3d");
      (hero.querySelector(".hero-content") || hero).appendChild(hint);
      window.setTimeout(() => hint.classList.add("is-gone"), 9000);
      start();
    },
    undefined,
    () => {
      /* model failed to load — the static hero image stays in place */
      renderer.dispose();
    }
  );
}

init();
