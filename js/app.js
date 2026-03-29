/**
 * app.js — main entry point
 *
 * Wires together: scene.js · controls.js · tray.js · data.js
 *
 * Responsibilities
 * ────────────────
 * - Initialise the scene and controls
 * - Build the left-panel building list
 * - Manage streetInstances state
 * - Handle add / remove / reorder actions
 * - Kick off the render loop
 */

// ─── State ────────────────────────────────────────────────────────────────────

// Each entry: { uid: string, modularId: string }
let streetInstances = [];
let uidCounter = 0;
let _activeCategory = null; // set to first category on buildPanel()

// ─── Boot ─────────────────────────────────────────────────────────────────────

(function init() {
  const canvas = document.getElementById('canvas3d');

  try {
    initScene(canvas);
  } catch (e) {
    console.error('[ModularStreet] Scene init failed:', e);
  }

  try {
    initControls(canvas);
  } catch (e) {
    console.error('[ModularStreet] Controls init failed:', e);
  }

  // Panel and tray must always work regardless of 3D errors
  buildPanel();
  wireUI();

  window.onTrayReorder = reorderBuilding;
  window.onTrayRemove = removeBuilding;
  window.onTrayRotate = rotateBuilding;

  startRenderLoop();
})();

// ─── Panel ────────────────────────────────────────────────────────────────────

function buildPanel() {
  const panel = document.getElementById('panel');

  // Derive ordered category list from data
  const categories = [];
  const grouped = {};
  MODULARS.forEach((m) => {
    const cat = m.category || 'official';
    if (!grouped[cat]) { grouped[cat] = []; categories.push(cat); }
    grouped[cat].push(m);
  });

  _activeCategory = categories[0];

  // ── Tab bar ────────────────────────────────────────────────────────────────
  const tabBar = document.createElement('div');
  tabBar.className = 'panel-tabs';
  tabBar.setAttribute('role', 'tablist');

  const LABELS = { official: 'Official', unofficial: 'Unofficial', road: 'Roads' };

  categories.forEach((cat) => {
    const tab = document.createElement('button');
    tab.className = 'panel-tab' + (cat === _activeCategory ? ' active' : '');
    tab.textContent = LABELS[cat] || cat.charAt(0).toUpperCase() + cat.slice(1);
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-selected', cat === _activeCategory ? 'true' : 'false');
    tab.dataset.cat = cat;
    tab.addEventListener('click', () => switchTab(cat));
    tabBar.appendChild(tab);
  });

  panel.appendChild(tabBar);

  // ── Building list container ────────────────────────────────────────────────
  const list = document.createElement('div');
  list.className = 'panel-list';
  list.id = 'panel-list';
  panel.appendChild(list);

  // ── Render all buttons, hidden by default unless in active category ────────
  categories.forEach((cat) => {
    grouped[cat].forEach((modular) => {
      const btn = document.createElement('button');
      btn.className = 'building-btn' + (cat !== _activeCategory ? ' panel-hidden' : '');
      btn.dataset.cat = cat;
      btn.setAttribute('aria-label', `Add ${modular.name}`);

      const thumbUrl = `models/${modular.category}/${modular.id}/thumbnail.jpg`;
      btn.innerHTML = `
        <div class="swatch">
          <img
            src="${thumbUrl}"
            alt="${modular.name}"
            onerror="this.style.display='none'; this.parentElement.style.background='${modular.color || '#ccc'}';"
          />
        </div>
        <div class="info">
          <div class="name">${modular.name}</div>
          <div class="meta">${modular.set} · ${modular.year}</div>
        </div>
        <div class="add-icon" aria-hidden="true">+</div>
      `;
      btn.addEventListener('click', () => addBuilding(modular.id));
      list.appendChild(btn);
    });
  });
}

function switchTab(cat) {
  _activeCategory = cat;

  // Update tab active states
  document.querySelectorAll('.panel-tab').forEach((t) => {
    const isActive = t.dataset.cat === cat;
    t.classList.toggle('active', isActive);
    t.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });

  // Show/hide building buttons
  document.querySelectorAll('#panel-list .building-btn').forEach((btn) => {
    btn.classList.toggle('panel-hidden', btn.dataset.cat !== cat);
  });

  // Reset scroll position so the list starts from the top
  const list = document.getElementById('panel-list');
  if (list) list.scrollTop = 0;
}

// ─── Actions ──────────────────────────────────────────────────────────────────

function addBuilding(modularId) {
  const uid = 'b' + (++uidCounter);
  streetInstances.push({ uid, modularId, rotation: 0 });
  renderTray(streetInstances);
  updateFloorControl();
  addBuildingToScene(streetInstances[streetInstances.length - 1], streetInstances.length - 1);
  document.getElementById('viewport-hint').style.opacity = '0';
}

function rotateBuilding(uid) {
  const inst = streetInstances.find((i) => i.uid === uid);
  if (!inst) return;
  inst.rotation = ((inst.rotation || 0) + 90) % 360;
  syncStreet();
}

function removeBuilding(uid) {
  streetInstances = streetInstances.filter((i) => i.uid !== uid);
  syncStreet();
}

function reorderBuilding(srcUid, dstUid) {
  const srcIdx = streetInstances.findIndex((i) => i.uid === srcUid);
  const dstIdx = streetInstances.findIndex((i) => i.uid === dstUid);
  if (srcIdx < 0 || dstIdx < 0) return;
  const [item] = streetInstances.splice(srcIdx, 1);
  streetInstances.splice(dstIdx, 0, item);
  syncStreet();
}

function clearStreet() {
  streetInstances = [];
  syncStreet();
  document.getElementById('viewport-hint').style.opacity = '1';
}

// ─── Sync ─────────────────────────────────────────────────────────────────────

/**
 * Single source of truth update — rebuilds both the 3D scene and the tray
 * whenever streetInstances changes.
 */
function syncStreet() {
  renderTray(streetInstances);
  updateFloorControl();           // uses streetInstances — no need to wait for 3D
  rebuildStreet(streetInstances, camControls);
}

// ─── UI wiring ────────────────────────────────────────────────────────────────

function wireUI() {
  document.getElementById('clear-btn').addEventListener('click', clearStreet);

  document.getElementById('export-btn').addEventListener('click', exportImage);

  document.getElementById('save-layout-btn').addEventListener('click', exportLayout);

  document.getElementById('load-layout-input').addEventListener('change', (e) => {
    importLayout(e.target.files[0]);
    e.target.value = ''; // reset so the same file can be re-imported
  });

  document.getElementById('load-layout-btn').addEventListener('click', () => {
    document.getElementById('load-layout-input').click();
  });
}

// ─── Layout save / load ───────────────────────────────────────────────────────

function exportLayout() {
  const payload = {
    version: 1,
    savedAt: new Date().toISOString(),
    instances: streetInstances.map(({ modularId, rotation }) => ({ modularId, rotation: rotation || 0 })),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'modular-street.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

function importLayout(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const payload = JSON.parse(e.target.result);
      const raw = Array.isArray(payload) ? payload : payload.instances;
      if (!Array.isArray(raw)) throw new Error('Invalid format');

      // Validate each entry refers to a known modular
      const valid = raw.filter(({ modularId }) => MODULARS.some((m) => m.id === modularId));
      if (valid.length === 0) throw new Error('No recognised buildings found');

      streetInstances = valid.map(({ modularId, rotation }) => ({
        uid: 'b' + (++uidCounter),
        modularId,
        rotation: rotation || 0,
      }));

      syncStreet();
      if (streetInstances.length > 0) {
        document.getElementById('viewport-hint').style.opacity = '0';
      }
    } catch (err) {
      alert('Could not load layout: ' + err.message);
    }
  };
  reader.readAsText(file);
}

// ─── Image export ─────────────────────────────────────────────────────────────

function exportImage() {
  const canvas = document.getElementById('canvas3d');

  const width = canvas.clientWidth;
  const height = canvas.clientHeight;

  // Sync renderer size with displayed size
  renderer.setSize(width, height, false);

  // Fix camera aspect ratio
  camera.aspect = width / height;
  camera.updateProjectionMatrix();

  renderer.render(scene, camera);

  const dataUrl = canvas.toDataURL('image/png');

  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = 'modular-street.png';
  a.click();
}

// ─── Floor control ────────────────────────────────────────────────────────────

// Track current clip floor so we can restore after a street rebuild
let _currentFloor = Infinity; // Infinity = all floors visible

/**
 * Rebuild the floor cutoff buttons based on the tallest building in the street.
 * Called after syncStreet so the button count always matches what's placed.
 */
function updateFloorControl() {
  const controlEl = document.getElementById('floor-control');
  const btnsEl = document.getElementById('floor-btns');
  if (!btnsEl || !controlEl) return;

  const maxFloors = streetInstances.reduce((max, inst) => {
    const m = MODULARS.find((m) => m.id === inst.modularId);
    return m ? Math.max(max, m.floors) : max;
  }, 0);

  btnsEl.innerHTML = '';

  if (maxFloors === 0) {
    controlEl.style.display = 'none';
    return;
  }

  controlEl.style.display = 'block';

  // "All floors" button
  const allBtn = _makeFloorBtn('All floors', 'All', maxFloors, maxFloors, () => {
    _currentFloor = Infinity;
    setFloorClip(Infinity);
    _setActive(allBtn);
  });
  btnsEl.appendChild(allBtn);

  // Buttons from top floor down to ground only
  for (let f = maxFloors - 1; f >= 1; f--) {
    const floor = f;
    const ordinal = floor === 1 ? 'Ground floor' : `${_ordinal(floor - 1)} floor`;
    const short = floor === 1 ? 'G' : `${floor}`;
    const btn = _makeFloorBtn(ordinal, short, floor, maxFloors, () => {
      _currentFloor = floor;
      setFloorClip(floor * FLOOR_HEIGHT);
      _setActive(btn);
    });
    btnsEl.appendChild(btn);
  }

  // Restore active state
  const clampedFloor = _currentFloor === Infinity
    ? Infinity
    : Math.min(_currentFloor, maxFloors);

  if (clampedFloor === Infinity) {
    _setActive(allBtn);
  } else {
    setFloorClip(clampedFloor * FLOOR_HEIGHT);
    const btns = Array.from(btnsEl.querySelectorAll('.floor-step'));
    // allBtn = index 0, then maxFloors-1, maxFloors-2 ... 1
    const targetIdx = maxFloors - clampedFloor;
    _setActive(btns[targetIdx] || allBtn);
  }
}

function _ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function _makeFloorBtn(label, shortLabel, visibleFloors, maxFloors, onClick) {
  const btn = document.createElement('button');
  btn.className = 'floor-step';
  btn.dataset.short = shortLabel ?? label;

  // Pip bars — one per floor, filled = visible
  const pips = document.createElement('div');
  pips.className = 'pips';
  for (let i = maxFloors; i >= 1; i--) {
    const pip = document.createElement('span');
    if (i <= visibleFloors) pip.classList.add('on');
    pips.appendChild(pip);
  }

  const lbl = document.createElement('span');
  lbl.className = 'floor-lbl';
  lbl.textContent = label;

  btn.appendChild(pips);
  btn.appendChild(lbl);
  btn.addEventListener('click', onClick);
  return btn;
}

function _setActive(btn) {
  document.querySelectorAll('.floor-step').forEach((b) => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
}

// ─── Render loop ──────────────────────────────────────────────────────────────

function startRenderLoop() {
  function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
  }
  animate();
}