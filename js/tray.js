/**
 * tray.js — bottom street tray: render, drag-reorder (mouse + touch), remove
 *
 * Desktop: HTML5 drag and drop
 * Mobile:  touch-based long-press + drag with a floating ghost element
 */

let _dragSrcUid = null;

// ─── Touch drag state ─────────────────────────────────────────────────────────

const _touch = {
  uid: null,   // uid of the slot being dragged
  ghost: null,   // cloned element following the finger
  srcEl: null,   // original slot element
  startX: 0,
  startY: 0,
  moved: false,
  longPress: null,   // setTimeout handle
};

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
    slotsEl.appendChild(_createSlot(inst, modular));
  });
}

// ─── Slot element ─────────────────────────────────────────────────────────────

function _createSlot(inst, modular) {
  const el = document.createElement('div');
  el.className = 'tray-slot';
  el.draggable = true;
  el.dataset.uid = inst.uid;

  const thumbUrl = `models/${modular.category}/${modular.id}/thumbnail.jpg`;
  const rotLabel = inst.rotation ? `${inst.rotation}°` : '↻';

  el.innerHTML = `
    <div class="slot-thumb" style="background: ${modular.color};">
      <img src="${thumbUrl}" alt="${modular.name}" onerror="this.style.display='none';" />
    </div>
    <div class="slot-label">${modular.name}</div>
    <button class="remove-slot" aria-label="Remove ${modular.name}">✕</button>
    <button class="rotate-slot" aria-label="Rotate ${modular.name}">${rotLabel}</button>
  `;

  // ── Action buttons ──────────────────────────────────────────────────────────
  el.querySelector('.remove-slot').addEventListener('click', (e) => {
    e.stopPropagation();
    onTrayRemove(inst.uid);
  });

  el.querySelector('.rotate-slot').addEventListener('click', (e) => {
    e.stopPropagation();
    onTrayRotate(inst.uid);
  });

  // ── Desktop drag & drop ────────────────────────────────────────────────────
  el.addEventListener('dragstart', (e) => {
    _dragSrcUid = inst.uid;
    el.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });

  el.addEventListener('dragend', () => {
    el.classList.remove('dragging');
    _dragSrcUid = null;
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

  // ── Touch drag & drop ──────────────────────────────────────────────────────
  el.addEventListener('touchstart', (e) => {
    // Don't hijack taps on the action buttons
    if (e.target.closest('.remove-slot, .rotate-slot')) return;

    _touch.startX = e.touches[0].clientX;
    _touch.startY = e.touches[0].clientY;
    _touch.uid = inst.uid;
    _touch.srcEl = el;
    _touch.moved = false;

    // Long-press (300ms) activates drag mode
    _touch.longPress = setTimeout(() => {
      _touchBeginDrag(el, e.touches[0]);
    }, 300);

  }, { passive: true });

  el.addEventListener('touchmove', (e) => {
    const dx = e.touches[0].clientX - _touch.startX;
    const dy = e.touches[0].clientY - _touch.startY;

    // Cancel long-press if the finger moved significantly before it fired
    if (!_touch.ghost && Math.hypot(dx, dy) > 8) {
      clearTimeout(_touch.longPress);
      _touch.longPress = null;
      _touch.uid = null;
      return;
    }

    if (!_touch.ghost) return;

    e.preventDefault(); // prevent page scroll while dragging
    _touch.moved = true;

    // Move ghost with finger
    _touch.ghost.style.left = `${e.touches[0].clientX - _touch.ghost._offsetX}px`;
    _touch.ghost.style.top = `${e.touches[0].clientY - _touch.ghost._offsetY}px`;

    // Highlight slot under finger
    _highlightSlotUnder(e.touches[0].clientX, e.touches[0].clientY);

  }, { passive: false });

  el.addEventListener('touchend', (e) => {
    clearTimeout(_touch.longPress);
    _touch.longPress = null;

    if (!_touch.ghost) {
      _touch.uid = null;
      return;
    }

    // Find which slot the finger landed on
    const touch = e.changedTouches[0];
    const target = _slotUnder(touch.clientX, touch.clientY);
    const dstUid = target ? target.dataset.uid : null;

    if (dstUid && dstUid !== _touch.uid) {
      onTrayReorder(_touch.uid, dstUid);
    }

    _touchEndDrag();
  });

  return el;
}

// ─── Touch drag helpers ───────────────────────────────────────────────────────

function _touchBeginDrag(el, touch) {
  const rect = el.getBoundingClientRect();

  const ghost = el.cloneNode(true);
  ghost.style.cssText = `
    position: fixed;
    z-index: 9999;
    pointer-events: none;
    opacity: 0.85;
    width: ${rect.width}px;
    height: ${rect.height}px;
    left: ${rect.left}px;
    top: ${rect.top}px;
    transform: scale(1.08);
    box-shadow: 0 8px 24px rgba(0,0,0,0.25);
    transition: transform 0.1s;
    border-radius: 6px;
    overflow: hidden;
  `;

  // Store finger offset from ghost top-left
  ghost._offsetX = touch.clientX - rect.left;
  ghost._offsetY = touch.clientY - rect.top;

  document.body.appendChild(ghost);
  _touch.ghost = ghost;

  el.classList.add('dragging');
}

function _touchEndDrag() {
  if (_touch.ghost) {
    _touch.ghost.remove();
    _touch.ghost = null;
  }
  if (_touch.srcEl) {
    _touch.srcEl.classList.remove('dragging');
  }

  // Clear all drag-over highlights
  document.querySelectorAll('.tray-slot.drag-over').forEach((s) => {
    s.classList.remove('drag-over');
  });

  _touch.uid = null;
  _touch.srcEl = null;
  _touch.moved = false;
}

function _slotUnder(x, y) {
  // Temporarily hide ghost so elementFromPoint finds the slot beneath
  if (_touch.ghost) _touch.ghost.style.display = 'none';
  const el = document.elementFromPoint(x, y);
  if (_touch.ghost) _touch.ghost.style.display = '';
  return el ? el.closest('.tray-slot') : null;
}

function _highlightSlotUnder(x, y) {
  document.querySelectorAll('.tray-slot.drag-over').forEach((s) => {
    s.classList.remove('drag-over');
  });
  const slot = _slotUnder(x, y);
  if (slot && slot.dataset.uid !== _touch.uid) {
    slot.classList.add('drag-over');
  }
}

// ─── Callbacks (overridden by app.js) ─────────────────────────────────────────

function onTrayReorder(srcUid, dstUid) { }
function onTrayRemove(uid) { }
function onTrayRotate(uid) { }