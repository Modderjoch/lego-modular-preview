# LEGO® Modular Previewer

**[modular.modderjoch.nl](https://modular.modderjoch.nl)** — Plan your LEGO® modular buildings street before you build it.

<img width="1864" height="960" alt="preview" src="https://github.com/user-attachments/assets/e44cd9d7-d9ee-43bc-9eb4-5300398d5911" />

## What it is

The Modular LEGO® Previewer is a browser-based 3D tool that lets you compose a virtual street from LEGO® modular buildings and see how they look side by side before committing to the real thing.

Pick any combination of sets, arrange them in any order, rotate individual buildings, and explore the result from any angle. No install, no account, no fuss. It runs entirely in the browser.

## Features

### 🏙️ 3D street preview
Buildings snap together in a shared 3D scene rendered with Three.js. Orbit, zoom, and pan freely to inspect your street from any angle.

### 📦 35+ sets included
The library covers every official LEGO® Modular Building from Café Corner (2007) through to Tudor Corner (2025), plus a curated selection of compatible modulars like Ninjago City, Avengers Tower, Sanctum Sanctorum, the Daily Bugle, and more.

### 🔄 Drag to reorder
Rearrange buildings by dragging slots in the tray at the bottom of the screen.

### ↻ Per-building rotation
Rotate any building in 90° steps to handle corner pieces or just experiment with different orientations.

### 🏢 Floor cutaway
The Stories control lets you clip the scene at any floor level — handy for inspecting interiors without the upper floors getting in the way.

### 📷 Screenshot export
Download the current 3D view as a PNG with one click.

### 💾 Save & load layouts
Export your street as a small JSON file and reload it later — or share it with someone else. The file only stores set IDs and rotations, so it's tiny and human-readable.

### 📱 Mobile-friendly
The interface adapts for smaller screens: the building panel becomes a horizontally scrollable strip, camera controls move to a swipeable bottom bar, and touch gestures handle orbit, pinch-zoom, and two-finger pan.


## Controls

| Action | Desktop | Mobile |
|---|---|---|
| Orbit | Left-drag | 1-finger drag |
| Zoom | Scroll wheel | Pinch |
| Pan | Right-drag | 2-finger drag |
| Add building | Click panel card | Tap panel card |
| Reorder | Drag tray slot | Long-press + drag |
| Rotate | Click ↻ on slot | Tap ↻ on slot |
| Remove | Click ✕ on slot | Tap ✕ on slot |


## How it works

The app is plain HTML, CSS, and JavaScript — no framework, no build step.

```
index.html        Entry point and markup
js/
  data.js         Set definitions (id, name, year, set number, floor count, width)
  scene.js        Three.js scene, lighting, GLTF loading, floor clipping
  controls.js     Camera orbit / zoom / pan + view presets
  tray.js         Bottom tray: render, drag-reorder, remove, rotate
  app.js          Main entry point that wires everything together
css/
  reset.css       Base reset and CSS variables
  layout.css      App grid and mobile layout
  panel.css       Left panel and tab system
  viewport.css    3D viewport and overlay controls
  tray.css        Bottom tray and slot styles
models/
  official/       GLTF models for official sets
  unofficial/     GLTF models for unofficial sets
  road/           GLTF models for road plates
```

Models are loaded on demand and cached in memory, so adding a second copy of a building you've already placed is instant.


## Models

3D models are sourced from [Mecabricks](https://www.mecabricks.com) and processed through Blender for export as GLTF. Each model lives in its own subfolder under `models/<category>/<id>/` alongside a `thumbnail.jpg` used in the panel.


## Disclaimer

This project is not affiliated with, endorsed by, or associated with the LEGO Group. LEGO® is a trademark of the LEGO Group, which does not sponsor, authorise, or endorse this site.


Made by [Modderjoch](https://www.modderjoch.nl). Visit the previewer [here](https://modular.modderjoch.nl/)
