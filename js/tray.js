/**
 * tray.js — bottom street tray: render, drag-reorder, remove
 *
 * Relies on:
 *   streetInstances  (array, managed in app.js)
 *   MODULARS         (data.js)
 *
 * Calls back into app.js via:
 *   onTrayReorder(srcUid, dstUid)
 *   onTrayRemove(uid)
 */

let _dragSrcUid = null;

// ─── Render ───────────────────────────────────────────────────────────────────

function renderTray(instances) {
  const slotsEl = document.getElementById('tray-slots');
  const countEl = document.getElementById('tray-count');

  countEl.textContent =
    instances.length + ' building' + (instances.length !== 1 ? 's' : '');

  if (instances.length === 0) {
    slotsEl.innerHTML =
      '<div class="tray-empty">Add buildings from the panel to start your street</div>';
    return;
  }

  slotsEl.innerHTML = '';

  instances.forEach((inst) => {
    const modular = MODULARS.find((m) => m.id === inst.modularId);
    if (!modular) return;

    const el = _createSlot(inst, modular);
    slotsEl.appendChild(el);
  });
}

// ─── Slot element ─────────────────────────────────────────────────────────────

function _createSlot(inst, modular) {
  const el = document.createElement('div');
  el.className = 'tray-slot';
  el.draggable = true;
  el.dataset.uid = inst.uid;

  const thumbUrl = `models/${modular.id}/thumbnail.jpg`;
  el.innerHTML = `
    <div class="slot-thumb" style="background: ${modular.color};">
      <img
        src="${thumbUrl}"
        alt="${modular.name}"
        onerror="this.style.display='none';"
      />
    </div>
    <div class="slot-label">${modular.name}</div>
    <button class="remove-slot" aria-label="Remove ${modular.name}">✕</button>
  `;

  // Remove button
  el.querySelector('.remove-slot').addEventListener('click', (e) => {
    e.stopPropagation();
    onTrayRemove(inst.uid);
  });

  // Drag events
  el.addEventListener('dragstart', (e) => {
    _dragSrcUid = inst.uid;
    el.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });

  el.addEventListener('dragend', () => {
    el.classList.remove('dragging');
  });

  el.addEventListener('dragover', (e) => {
    e.preventDefault();
    el.classList.add('drag-over');
  });

  el.addEventListener('dragleave', () => {
    el.classList.remove('drag-over');
  });

  el.addEventListener('drop', (e) => {
    e.preventDefault();
    el.classList.remove('drag-over');
    if (_dragSrcUid && _dragSrcUid !== inst.uid) {
      onTrayReorder(_dragSrcUid, inst.uid);
    }
    _dragSrcUid = null;
  });

  return el;
}

// ─── Callbacks (overridden by app.js) ─────────────────────────────────────────

// These are no-ops by default; app.js sets them after load.
function onTrayReorder(srcUid, dstUid) { }
function onTrayRemove(uid) { }