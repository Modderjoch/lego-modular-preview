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

  startRenderLoop();
})();

// ─── Panel ────────────────────────────────────────────────────────────────────

function buildPanel() {
  const panel = document.getElementById('panel');

  MODULARS.forEach((modular) => {
    const btn = document.createElement('button');
    btn.className = 'building-btn';
    btn.setAttribute('aria-label', `Add ${modular.name}`);

    // Try thumbnail.png from the model's folder; fall back to colour swatch
    const thumbUrl = `models/${modular.id}/thumbnail.jpg`;
    btn.innerHTML = `
      <div class="swatch">
        <img
          src="${thumbUrl}"
          alt="${modular.name}"
          onerror="this.style.display='none'; this.parentElement.style.background='${modular.color}';"
        />
      </div>
      <div class="info">
        <div class="name">${modular.name}</div>
        <div class="meta">${modular.set} · ${modular.year}</div>
      </div>
      <div class="add-icon" aria-hidden="true">+</div>
    `;
    btn.addEventListener('click', () => addBuilding(modular.id));
    panel.appendChild(btn);
  });
}

// ─── Actions ──────────────────────────────────────────────────────────────────

function addBuilding(modularId) {
  const uid = 'b' + (++uidCounter);
  streetInstances.push({ uid, modularId });
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
  const allBtn = _makeFloorBtn('All floors', maxFloors, maxFloors, () => {
    _currentFloor = Infinity;
    setFloorClip(Infinity);
    _setActive(allBtn);
  });
  btnsEl.appendChild(allBtn);

  // Buttons from top floor down to ground only
  for (let f = maxFloors - 1; f >= 1; f--) {
    const floor = f;
    const label = floor === 1 ? 'Ground floor only' : `${floor} floors`;
    const btn = _makeFloorBtn(label, floor, maxFloors, () => {
      _currentFloor = floor;
      setFloorClip(floor * FLOOR_H);
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
    setFloorClip(clampedFloor * FLOOR_H);
    const btns = Array.from(btnsEl.querySelectorAll('.floor-step'));
    // allBtn = index 0, then maxFloors-1, maxFloors-2 ... 1
    const targetIdx = maxFloors - clampedFloor;
    _setActive(btns[targetIdx] || allBtn);
  }
}

function _makeFloorBtn(label, visibleFloors, maxFloors, onClick) {
  const btn = document.createElement('button');
  btn.className = 'floor-step';

  // Build pip indicators — one bar per floor, filled = visible
  const pips = document.createElement('div');
  pips.className = 'pips';
  for (let i = maxFloors; i >= 1; i--) {
    const pip = document.createElement('span');
    if (i <= visibleFloors) pip.classList.add('on');
    pips.appendChild(pip);
  }

  const lbl = document.createElement('span');
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