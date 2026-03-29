/**
 * controls.js — mouse, wheel & touch camera controls + view presets
 *
 * Exports (globals):
 *   initControls(canvas)  — attach all event listeners
 *   camControls           — object with { target, spherical, updateCamera }
 *
 * Uses the `camera` global set by scene.js.
 */

// ─── State ────────────────────────────────────────────────────────────────────

const camControls = {
  target: new THREE.Vector3(0, 3, 0),

  spherical: {
    theta: 0.4,          // horizontal angle (radians)
    phi: Math.PI / 4,  // vertical angle
    radius: 28,           // distance from target
  },

  _dragging: false,
  _panning: false,
  _lastX: 0,
  _lastY: 0,

  updateCamera() {
    const { theta, phi, radius } = this.spherical;
    camera.position.set(
      this.target.x + radius * Math.sin(phi) * Math.sin(theta),
      this.target.y + radius * Math.cos(phi),
      this.target.z + radius * Math.sin(phi) * Math.cos(theta)
    );
    camera.lookAt(this.target);
  },
};

// ─── Init ─────────────────────────────────────────────────────────────────────

function initControls(canvas) {
  camControls.updateCamera();

  // ── Mouse ────────────────────────────────────────────────────────────────
  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 2) camControls._panning = true;
    else camControls._dragging = true;
    camControls._lastX = e.clientX;
    camControls._lastY = e.clientY;
    e.preventDefault();
  });

  window.addEventListener('mouseup', () => {
    camControls._dragging = false;
    camControls._panning = false;
  });

  window.addEventListener('mousemove', (e) => {
    const dx = e.clientX - camControls._lastX;
    const dy = e.clientY - camControls._lastY;
    camControls._lastX = e.clientX;
    camControls._lastY = e.clientY;

    if (camControls._dragging) {
      camControls.spherical.theta -= dx * 0.008;
      camControls.spherical.phi = Math.max(
        0.1,
        Math.min(Math.PI / 2.2, camControls.spherical.phi - dy * 0.008)
      );
      camControls.updateCamera();
    }

    if (camControls._panning) {
      const right = new THREE.Vector3();
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      right.crossVectors(dir, camera.up).normalize();
      camControls.target.addScaledVector(right, -dx * 0.04);
      camControls.target.y += dy * 0.04;
      camControls.updateCamera();
    }
  });

  canvas.addEventListener('wheel', (e) => {
    camControls.spherical.radius = Math.max(
      5,
      Math.min(80, camControls.spherical.radius + e.deltaY * 0.04)
    );
    camControls.updateCamera();
    e.preventDefault();
  }, { passive: false });

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  // ── Touch ────────────────────────────────────────────────────────────────
  // 1 finger  → orbit
  // 2 fingers spreading/pinching → zoom
  // 2 fingers moving together    → pan
  let lastTouchDist = null;
  let lastTouchMidX = null;
  let lastTouchMidY = null;

  canvas.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      camControls._dragging = true;
      camControls._panning = false;
      camControls._lastX = e.touches[0].clientX;
      camControls._lastY = e.touches[0].clientY;
    }
    if (e.touches.length === 2) {
      camControls._dragging = false;
      lastTouchDist = _touchDist(e);
      lastTouchMidX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      lastTouchMidY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
    }
    e.preventDefault();
  }, { passive: false });

  canvas.addEventListener('touchend', (e) => {
    if (e.touches.length < 2) {
      lastTouchDist = null;
      lastTouchMidX = null;
      lastTouchMidY = null;
    }
    if (e.touches.length === 0) {
      camControls._dragging = false;
    }
  });

  canvas.addEventListener('touchmove', (e) => {
    // ── 1 finger: orbit ──────────────────────────────────────────────────
    if (e.touches.length === 1 && camControls._dragging) {
      const dx = e.touches[0].clientX - camControls._lastX;
      const dy = e.touches[0].clientY - camControls._lastY;
      camControls._lastX = e.touches[0].clientX;
      camControls._lastY = e.touches[0].clientY;
      camControls.spherical.theta -= dx * 0.008;
      camControls.spherical.phi = Math.max(
        0.1,
        Math.min(Math.PI / 2.2, camControls.spherical.phi - dy * 0.008)
      );
      camControls.updateCamera();
    }

    // ── 2 fingers: pinch-zoom + pan ───────────────────────────────────────
    if (e.touches.length === 2) {
      const dist = _touchDist(e);
      const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;

      // Zoom — fingers spreading/pinching
      if (lastTouchDist !== null) {
        camControls.spherical.radius = Math.max(
          5,
          Math.min(80, camControls.spherical.radius - (dist - lastTouchDist) * 0.08)
        );
      }

      // Pan — midpoint of the two fingers moving
      if (lastTouchMidX !== null) {
        const pdx = midX - lastTouchMidX;
        const pdy = midY - lastTouchMidY;
        const right = new THREE.Vector3();
        const dir = new THREE.Vector3();
        camera.getWorldDirection(dir);
        right.crossVectors(dir, camera.up).normalize();
        camControls.target.addScaledVector(right, -pdx * 0.05);
        camControls.target.y += pdy * 0.05;
      }

      lastTouchDist = dist;
      lastTouchMidX = midX;
      lastTouchMidY = midY;
      camControls.updateCamera();
    }

    e.preventDefault();
  }, { passive: false });

  // ── View preset buttons ──────────────────────────────────────────────────
  document.querySelectorAll('.view-btn').forEach((btn) => {
    btn.addEventListener('click', () => setView(btn.dataset.view));
  });
}

// ─── View presets ─────────────────────────────────────────────────────────────

function setView(mode) {
  const s = camControls.spherical;
  switch (mode) {
    case 'front': s.theta = 0; s.phi = Math.PI / 5; s.radius = 30; break;
    case 'side': s.theta = Math.PI / 2; s.phi = Math.PI / 5; s.radius = 30; break;
    case 'top': s.theta = 0; s.phi = 0.12; s.radius = 35; break;
    case 'reset': s.theta = 0.4; s.phi = Math.PI / 4; s.radius = 28; break;
  }
  camControls.updateCamera();
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _touchDist(e) {
  return Math.hypot(
    e.touches[0].clientX - e.touches[1].clientX,
    e.touches[0].clientY - e.touches[1].clientY
  );
}

let _loaderInterval;

function _showLoader(modularName = '') {
  const loader = document.getElementById('loader');
  if (!loader) return;
  loader.classList.remove('hidden');

  const text = document.getElementById('loader-text');
  if (!text) return;

  let dotCount = 0;

  _loaderInterval = setInterval(() => {
    dotCount = (dotCount % 3) + 1;
    text.textContent = `Building ${modularName}${'.'.repeat(dotCount)}`;
  }, 500);
}

function _hideLoader() {
  document.getElementById('loader')?.classList.add('hidden');
  clearInterval(_loaderInterval);
}