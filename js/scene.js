/**
 * scene.js — Three.js scene, lighting, ground, and building loading
 *
 * Exports (globals used by app.js):
 *   initScene(canvas)           — set up renderer, scene, camera, lights, ground
 *   loadBuilding(modular, cb)   — load GLTF/GLB or fall back to placeholder
 *   rebuildStreet(instances)    — clear & re-place all buildings in order
 *   renderer, scene, camera     — used by controls.js + render loop
 */

// ─── Constants ────────────────────────────────────────────────────────────────

const FLOOR_H = 1.5;   // world-units per floor
const GAP = 0.0;   // gap between buildings (0 = flush)

// Standard LEGO dimensions (mm):
//   1 floor height = 96mm (3 bricks + plate)
//   1 module width = 256mm (32 studs × 8mm)
//
// We scale every model so 96mm = FLOOR_H world units.
// That means 1mm = FLOOR_H/96 world units, and one module width is always:
//   256mm × (FLOOR_H / 96) world units — regardless of export scale.
const MM_TO_WU = FLOOR_H / 87;          // millimetres → world units
const MODULE_W = 256 * MM_TO_WU;        // one 32-stud module in world units

// ─── Scene globals ────────────────────────────────────────────────────────────

let renderer, scene, camera;
let gltfLoader;

const buildingMeshes = new Map(); // index → THREE.Group

// Clipping plane for floor cutaway — cuts everything above this Y
const clipPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), Infinity);

// Model cache: modularId → THREE.Group (cloned per instance)
// Each GLTF is loaded once; subsequent adds clone the cached group.
const modelCache = new Map();
const loadingQueue = new Map(); // modularId → [callbacks] (dedupes parallel loads)

// Horizontal clipping plane — clips everything above a given Y world coordinate.
// Set via setFloorClip(y). Null = no clipping (show full building).
const _clipPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
let _clipEnabled = false;

// ─── Init ─────────────────────────────────────────────────────────────────────

function initScene(canvas) {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.localClippingEnabled = true; // required for clipping planes on materials
  renderer.setClearColor(0xd6e8f5, 1); // soft sky blue

  // sRGB output — required for correct texture colours
  renderer.outputEncoding = THREE.sRGBEncoding;

  // Enable global clipping planes (used by the floor cutoff control)
  renderer.localClippingEnabled = true;

  // ReinhardToneMapping gives a warmer, more natural result than Linear
  // without crushing dark materials the way ACES does.
  // Exposure > 1 brightens the overall scene to compensate for the
  // darker tone curve.
  renderer.toneMapping = THREE.ReinhardToneMapping;
  renderer.toneMappingExposure = 1.8;

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(45, 1, 0.1, 2000);
  camera.position.set(0, 12, 28);
  camera.lookAt(0, 4, 0);

  gltfLoader = new THREE.GLTFLoader();

  _addEnvironment();
  _addLights();
  _handleResize();
  window.addEventListener('resize', _handleResize);
}

// ─── Environment ──────────────────────────────────────────────────────────────

function _addEnvironment() {
  try {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTexture = pmrem.fromScene(new THREE.RoomEnvironment(), 0.5).texture;
    scene.environment = envTexture;
    pmrem.dispose();
  } catch (e) {
    console.warn('[ModularStreet] RoomEnvironment unavailable — PBR reflections disabled:', e.message);
  }
}

// ─── Lights ───────────────────────────────────────────────────────────────────

function _addLights() {
  // Warm ambient — simulates bounced indoor/studio light
  // Slightly yellow-white rather than pure white to counter the cold cast
  scene.add(new THREE.AmbientLight(0xfff5e0, 0.6));

  // Key light — warm afternoon sun from upper-right
  const sun = new THREE.DirectionalLight(0xffe8c0, 0.9);
  sun.position.set(10, 30, 20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 200;
  sun.shadow.camera.left = -60;
  sun.shadow.camera.right = 60;
  sun.shadow.camera.top = 40;
  sun.shadow.camera.bottom = -20;
  scene.add(sun);

  // Fill light — soft cool bounce from the left/back to separate shadows
  // Keep it subtle so it doesn't wash out the key light warmth
  const fill = new THREE.DirectionalLight(0xc8dff5, 0.35);
  fill.position.set(-10, 8, -8);
  scene.add(fill);
}


// ─── Resize ───────────────────────────────────────────────────────────────────

function _handleResize() {
  const vp = document.getElementById('viewport');
  const w = vp.clientWidth;
  const h = vp.clientHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

// ─── Building loading ─────────────────────────────────────────────────────────

function loadBuilding(modular, onLoaded) {
  // Return a deep clone from cache if already loaded — instant, no network hit
  if (modelCache.has(modular.id)) {
    const cached = modelCache.get(modular.id);
    onLoaded(cached.clone());
    return;
  }

  // If a load for this id is already in-flight, queue the callback
  // so we don't fire duplicate network requests
  if (loadingQueue.has(modular.id)) {
    loadingQueue.get(modular.id).push(onLoaded);
    return;
  }

  // First request for this modular — start loading and set up the queue
  loadingQueue.set(modular.id, [onLoaded]);

  const gltfUrl = `models/${modular.id}/${modular.id}.gltf`;
  const glbUrl = `models/${modular.id}.glb`;

  _tryLoad(gltfUrl, glbUrl, modular, (group) => {
    // Store the original in cache, then flush all waiting callbacks with clones
    modelCache.set(modular.id, group);
    const callbacks = loadingQueue.get(modular.id) || [];
    loadingQueue.delete(modular.id);
    callbacks.forEach((cb, i) => {
      // First callback gets the original, rest get clones
      cb(i === 0 ? group : group.clone());
    });
  });
}

function _tryLoad(primaryUrl, fallbackUrl, modular, onLoaded) {
  const url = primaryUrl;
  console.log(`[ModularStreet] Loading: ${url}`);

  gltfLoader.load(
    url,

    (gltf) => {
      console.log(`[ModularStreet] ✓ ${url}`);
      _updateStatus(`Loaded: ${modular.name}`);

      const group = gltf.scene;

      // GLTF already references its own textures — just enable shadows.
      // Do not touch materials or textures; Three.js + GLTFLoader handle it.
      group.traverse((child) => {
        if (!child.isMesh) return;
        child.castShadow = true;
        child.receiveShadow = true;
      });

      // Scale using a fixed physical reference: 96mm per floor = FLOOR_H world units.
      // This makes every model use the same mm→world-unit conversion regardless
      // of how it was exported, so MODULE_W snapping is always consistent.
      const rawBox = new THREE.Box3().setFromObject(group);
      const rawSize = rawBox.getSize(new THREE.Vector3());

      // Estimate raw mm height: assume standard 96mm per floor
      const expectedRawH = modular.floors * 96; // mm
      // Use actual raw height if it's close to expected (within 30%),
      // otherwise fall back to fitting by raw height
      const refH = rawSize.y;
      const scale = modular.scaleOverride || (
        (expectedRawH * 0.7 < refH && refH < expectedRawH * 1.3)
          ? MM_TO_WU
          : (modular.floors * FLOOR_H) / refH
      );

      group.scale.setScalar(scale);
      console.log(`[ModularStreet] ${modular.name} scale: ${scale.toFixed(5)}, module width: ${(MODULE_W * modular.widthU).toFixed(3)} wu`);

      // Lift to ground
      const scaledBox = new THREE.Box3().setFromObject(group);
      group.position.y = -scaledBox.min.y;

      onLoaded(group);
    },

    undefined,

    (err) => {
      // Log the full error so we can see exactly what failed
      console.error(`[ModularStreet] ✗ Failed to load: ${url}`, err);
      if (err && err.target) console.error('  HTTP status:', err.target.status, err.target.responseURL);

      if (fallbackUrl) {
        console.warn(`[ModularStreet] Trying fallback: ${fallbackUrl}`);
        _tryLoad(fallbackUrl, null, modular, onLoaded);
      } else {
        _updateStatus(`Failed to load ${modular.name} — using placeholder`);
        onLoaded(_buildPlaceholder(modular));
      }
    }
  );
}

function _updateStatus(msg) {
  const el = document.getElementById('model-status');
  if (el) el.textContent = msg;
}

// ─── Placeholder geometry ─────────────────────────────────────────────────────

function _buildPlaceholder(modular) {
  const UNIT = 2.56;
  const group = new THREE.Group();
  const w = modular.widthU * UNIT;
  const d = UNIT;
  const h = modular.floors * FLOOR_H;

  const mk = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mk(modular.color));
  body.position.y = h / 2;
  body.castShadow = body.receiveShadow = true;
  group.add(body);

  const roof = new THREE.Mesh(new THREE.BoxGeometry(w, 0.25, d + 0.1), mk(modular.roofColor));
  roof.position.y = h + 0.125;
  roof.castShadow = true;
  group.add(roof);

  for (let f = 1; f < modular.floors; f++) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, d + 0.02), mk(modular.accent));
    stripe.position.y = f * FLOOR_H;
    group.add(stripe);
  }

  const winMat = mk(0xc8e0f8);
  const frameMat = mk(modular.roofColor);
  const cols = modular.widthU * 2;

  for (let col = 0; col < cols; col++) {
    for (let row = 0; row < modular.floors; row++) {
      const wx = -w / 2 + (col + 0.5) * (w / cols);
      const wy = FLOOR_H * row + FLOOR_H * 0.55;
      const z = d / 2 + 0.01;
      const frame = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.65, 0.04), frameMat);
      frame.position.set(wx, wy, z - 0.005);
      group.add(frame);
      const win = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.55, 0.05), winMat);
      win.position.set(wx, wy, z);
      group.add(win);
    }
  }

  const door = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.85, 0.06), frameMat);
  door.position.set(0, 0.425, d / 2 + 0.01);
  group.add(door);

  return group;
}

// ─── Floor clipping ──────────────────────────────────────────────────────────

/**
 * Clip the scene at a given world-space Y height, hiding everything above.
 * Pass Infinity (or call with no argument) to show the full building.
 *
 * @param {number} y  — world Y to clip at (Infinity = show all)
 */
function setFloorClip(y) {
  if (y === Infinity || y === null) {
    _clipEnabled = false;
    renderer.clippingPlanes = [];
  } else {
    _clipEnabled = true;
    _clipPlane.constant = y; // plane: 0*x + -1*y + 0*z + y = 0 → clips above y
    renderer.clippingPlanes = [_clipPlane];
  }
}

// ─── Street rebuild ───────────────────────────────────────────────────────────

/**
 * Place all buildings in street order.
 *
 * Cached groups are repositioned instantly. Only genuinely new modular IDs
 * trigger a network load. This means adding a second building never reloads
 * the first, and adding the same modular twice only fetches it once.
 */
function rebuildStreet(instances, camControls, onDone) {
  // Remove all current meshes from scene (but keep them in memory)
  buildingMeshes.forEach((mesh) => scene.remove(mesh));
  buildingMeshes.clear();

  if (instances.length === 0) {
    document.getElementById('viewport-hint').style.opacity = '1';
    if (onDone) onDone();
    return;
  }

  document.getElementById('viewport-hint').style.opacity = '0';

  let loaded = 0;
  const groups = new Array(instances.length).fill(null);

  instances.forEach((inst, idx) => {
    const modular = MODULARS.find((m) => m.id === inst.modularId);
    if (!modular) { loaded++; _place(); return; }

    // loadBuilding returns from cache immediately if already loaded
    loadBuilding(modular, (group) => {
      groups[idx] = { group, modular };
      loaded++;
      _place();
    });
  });

  function _place() {
    if (loaded < instances.length) return;

    let cursorX = 0;

    groups.forEach((entry, idx) => {
      if (!entry) return;
      const { group, modular: m } = entry;

      // Snap width is always MODULE_W × widthU — fixed in world units,
      // independent of how any individual model was exported or scaled.
      const snapW = MODULE_W * m.widthU;

      // Place using the fixed physical footprint — no bounding box involved.
      // Every modular is exactly 32 studs wide (MODULE_W world units) per widthU.
      // The model origin in Blender should sit at the front-left corner of the
      // baseplate; if it doesn't, fix it in Blender rather than measuring here.
      group.position.x = cursorX;
      group.position.z = 0;

      scene.add(group);
      buildingMeshes.set(idx, group);
      cursorX += snapW;
    });

    // Re-centre camera on the street midpoint
    camControls.target.set(cursorX / 2, FLOOR_H * 2, 0);
    camControls.spherical.radius = Math.max(20, cursorX * 1.2);
    camControls.updateCamera();

    if (onDone) onDone();
  }
}