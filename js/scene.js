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

const FLOOR_HEIGHT = 1.4;
const GAP = 0.0;

const MM_TO_WU = FLOOR_HEIGHT / 82;
const MODULE_WIDTH = 256 * MM_TO_WU;

// ─── Scene globals ────────────────────────────────────────────────────────────

let renderer, scene, camera;
let gltfLoader;

const buildingMeshes = new Map();

// Clipping plane for floor cutaway — cuts everything above this Y
const clipPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), Infinity);

// Model cache: modularId → THREE.Group (cloned per instance)
// Each GLTF is loaded once; subsequent adds clone the cached group
const modelCache = new Map();
const loadingQueue = new Map(); // modularId → [callbacks] (dedupes parallel loads)

// Horizontal clipping plane — clips everything above a given Y world coordinate.
// Set via setFloorClip(y). Null = no clipping (show full building).
const _clipPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
let _clipEnabled = false;

// ─── Init ─────────────────────────────────────────────────────────────────────

function initScene(canvas) {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.localClippingEnabled = true;
  renderer.setClearColor(0x050505, 1); // fallback if background texture fails

  renderer.outputEncoding = THREE.sRGBEncoding;

  // ACESFilmic gives rich, saturated colours with natural highlight rolloff —
  // ideal for a dark studio look. Exposure tuned to compensate for the dark bg.
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(45, 1, 0.1, 2000);
  camera.position.set(0, 12, 28);
  camera.lookAt(0, 4, 0);

  gltfLoader = new THREE.GLTFLoader();

  _addEnvironment();
  _addLights();
  _addBackgroundGradient();
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
  scene.add(new THREE.AmbientLight(0x221a0f, 0.8));

  const fill = new THREE.DirectionalLight(0xffe0b0, 0.4);
  fill.position.set(0, -4, 20);
  scene.add(fill);
}

// ─── Radial background gradient ──────────────────────────────────────────────────────

function _addBackgroundGradient() {
  const size = 512;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');

  const grad = ctx.createRadialGradient(
    size / 2, size / 2, 0,
    size / 2, size / 2, size / 2
  );
  grad.addColorStop(0.00, '#1a1a1a');
  grad.addColorStop(1.00, '#030302');

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(c);

  scene.background = tex;
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

function addBuildingToScene(inst, index) {
  const modular = MODULARS.find((m) => m.id === inst.modularId);
  if (!modular) return;

  _showLoader();

  loadBuilding(modular, (group) => {
    const snapW = MODULE_WIDTH * modular.widthU;

    // Compute X based on previous buildings
    let cursorX = 0;
    for (let i = 0; i < index; i++) {
      const prev = MODULARS.find((m) => m.id === streetInstances[i].modularId);
      if (prev) cursorX += MODULE_WIDTH * prev.widthU;
    }

    group.position.x = cursorX;
    group.position.z = 0;
    group.rotation.y = (inst.rotation || 0) * Math.PI / 180;

    scene.add(group);
    buildingMeshes.set(inst.uid, group);

    _updateLoaderProgress(1, 1);
    _hideLoader();
  });
}

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

  // Try in order:
  //   1. models/cafe-corner/cafe-corner.gltf  (subfolder GLTF — preferred)
  //   2. models/cafe-corner/cafe-corner.glb   (subfolder GLB)
  //   3. models/cafe-corner.glb               (root GLB — legacy fallback)
  const basePath = `models/${modular.category}/${modular.id}`;
  const gltfUrl = `${basePath}/${modular.id}.gltf`;
  const glbSubUrl = `${basePath}/${modular.id}.glb`;
  const glbRootUrl = `models/${modular.id}.glb`;

  _tryLoad([gltfUrl, glbSubUrl, glbRootUrl], modular, (group) => {
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

// _tryLoad(urls, modular, onLoaded) — tries each URL in the array in order.
function _tryLoad(urls, modular, onLoaded) {
  if (!urls.length) {
    console.warn(`[ModularStreet] No more fallbacks for ${modular.id} — using placeholder`);
    _updateStatus(`No model for ${modular.name} — using placeholder`);
    onLoaded(_buildPlaceholder(modular));
    return;
  }

  const url = urls[0];
  const remainingUrls = urls.slice(1);

  console.log(`[ModularStreet] Loading: ${url}`);

  _showLoader(modular.name);

  gltfLoader.load(
    url,

    (gltf) => {
      console.log(`[ModularStreet] ✓ ${url}`);
      _updateStatus(`Loaded: ${modular.name}`);

      const group = gltf.scene;

      // Enable shadows — GLTF/GLB handles its own materials and textures
      group.traverse((child) => {
        if (!child.isMesh) return;
        child.castShadow = true;
        child.receiveShadow = true;

        // Fix transparent materials rendering as black
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        mats.forEach((mat) => {
          if (mat.transparent || mat.alphaMap || mat.opacity < 1) {
            mat.transparent = true;
            mat.alphaTest = 0;
            mat.depthWrite = false;
            mat.side = THREE.DoubleSide;
            mat.needsUpdate = true;
          }
        });
      });

      // Scale: use scaleOverride from data.js if set, otherwise derive from
      // physical dimensions (96mm per LEGO floor = FLOOR_H world units).
      const rawBox = new THREE.Box3().setFromObject(group);
      const rawSize = rawBox.getSize(new THREE.Vector3());
      const refH = rawSize.y;

      let scale;
      if (modular.scaleOverride) {
        scale = modular.scaleOverride;
      } else {
        const expectedRawH = modular.floors * 96;
        scale = (expectedRawH * 0.7 < refH && refH < expectedRawH * 1.3)
          ? MM_TO_WU
          : (modular.floors * FLOOR_HEIGHT) / refH;
      }

      group.scale.setScalar(scale);
      console.log(`[ModularStreet] ${modular.name} scale: ${scale.toFixed(5)}, module width: ${(MODULE_WIDTH * modular.widthU).toFixed(3)} wu`);

      // Lift to ground level
      const scaledBox = new THREE.Box3().setFromObject(group);
      group.position.y = -scaledBox.min.y;

      onLoaded(group);
    },

    undefined,

    (err) => {
      console.warn(`[ModularStreet] ✗ ${url} failed`);
      _tryLoad(remainingUrls, modular, onLoaded);
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
  const h = modular.floors * FLOOR_HEIGHT;

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
    stripe.position.y = f * FLOOR_HEIGHT;
    group.add(stripe);
  }

  const winMat = mk(0xc8e0f8);
  const frameMat = mk(modular.roofColor);
  const cols = modular.widthU * 2;

  for (let col = 0; col < cols; col++) {
    for (let row = 0; row < modular.floors; row++) {
      const wx = -w / 2 + (col + 0.5) * (w / cols);
      const wy = FLOOR_HEIGHT * row + FLOOR_HEIGHT * 0.55;
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
      const inst = instances[idx];

      const snapW = MODULE_WIDTH * m.widthU;

      group.position.x = cursorX;
      group.position.z = 0;

      group.rotation.y = (inst.rotation || 0) * Math.PI / 180;

      scene.add(group);
      buildingMeshes.set(idx, group);
      cursorX += snapW;
    });

    if (onDone) onDone();
  }
}