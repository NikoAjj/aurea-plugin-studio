# 🍵 Aurea Plugin Studio

[![Open Source](https://img.shields.io/badge/Open%20Source-Community%20First-78d96f?style=flat-square&logo=github&logoColor=0f1c0e)](https://github.com/NikoAjj)
[![Aurea Format](https://img.shields.io/badge/Aurea%20Plugin-V1%20%7C%20V2%20%7C%20V3-274424?style=flat-square)](https://github.com/NikoAjj)
[![Zero Dependencies](https://img.shields.io/badge/Build-Vanilla%20ES%20Modules%20%2B%20WebGL2-4b8d45?style=flat-square)](https://github.com/NikoAjj)

**Aurea Plugin Studio** is a lightweight, zero-dependency, web-based IDE and live WebGL2 previewer tailored specifically for developing plugins for the **Aurea** mobile video editor (**Format V1, V2, and V3**). Built from the ground up with a comfortable **Matcha Dark** aesthetic, it lets creators write shaders, test parameters in real time, validate manifests, and package ready-to-install `.aureaplugin` archives directly from mobile or desktop browsers.

> *"This is an open-source project—don't distribute it for money because I don't want any money for this project, just 'from community to community'."* — **NikoAjj**

---

## 📋 Table of Contents

- [✨ Core Features](#-core-features)
- [🎨 Design & Workspace Philosophy](#-design--workspace-philosophy)
- [⚡ Supported Aurea Specifications (V1 – V3)](#-supported-aurea-specifications-v1--v3)
- [🧩 Dynamic Parameter Mapping](#-dynamic-parameter-mapping)
- [🚀 Getting Started & Deployment](#-getting-started--deployment)
- [🛠️ Plugin Creation Workflow](#️-plugin-creation-workflow)
- [📂 Project Architecture](#-project-architecture)
- [🗺️ Roadmap](#️-roadmap)
- [🙌 Credits & License](#-credits--license)

---

## ✨ Core Features

### 1. Mobile-First Code Editor
- **Multi-File Project Tabs:** Seamlessly switch between `plugin.json`, `shader.frag`, `frame.js`, `main.js`, or add/remove custom files (`+` to add, right-click/long-press tab to delete).
- **GLSL Quick-Insert Syntax Chips:** Bottom shortcut bar (`float`, `vec2`, `vec3`, `vec4`, `aurea_source`, `aurea_px_to_uv`, `aurea.time`) designed to speed up shader coding on touchscreen keyboards.
- **Auto-Persistence & Line Numbers:** Synchronized line numbering, `Tab` indentation support, and automatic local saving (`localStorage`) so work is never lost on refresh.

### 2. Live WebGL2 Shader Engine
- **Automatic Aurea Header Injection:** Compiles raw Aurea fragment shaders (`vec4 aurea_main(vec2 uv)`) directly in WebGL2 without requiring manual `#version 300 es` boilerplate.
- **Real-Time Error Diagnostics:** Displays manifest validation errors and GLSL compilation line errors directly in the editor status bar before entering preview mode.
- **Custom Media Testing:** Swap the default Matcha checkerboard preview layer with any local image (`🖼`) to test color grading, distortion, and blending effects on real footage.

### 3. Dynamic Parameter Renderer & Timeline Simulation
- **Auto-Generated Controls:** Reads the `params` array from `plugin.json` and renders interactive Aurea-styled UI widgets automatically.
- **5-Layer Timeline & Timecode:** Includes a live `MM:SS:FF` playhead (`00:00:00`), play/pause toggle, and a 5-layer keyframe stack visualization.

### 4. Built-In Manifest Validator & `.aureaplugin` Packager
- **Strict Rule Checking (`✓`):** Validates reverse-domain IDs (`com.author.plugin`), format versions (`1`–`3`), required entry files, and Aurea's 32-parameter ceiling.
- **Pure-JS ZIP Bundler (`⇪`):** Generates valid, uncompressed `.aureaplugin` archives natively in the browser using a custom CRC-32 ZIP writer—zero external libraries required.

---

## 🎨 Design & Workspace Philosophy

Designed originally in **Penpot**, the interface prioritizes low eye strain during late-night shader sessions and clear visual hierarchy on compact screens:
- **Matcha Dark (Default):** Deep forest surfaces (`#182716`, `#121e11`) paired with vibrant matcha green accents (`#78d96f`) and high-contrast timecode markers (`#ff5c77`).
- **Pure Dark Mode:** Instant one-tap theme switching inside **Settings** for OLED displays or high-contrast environments.
- **PWA Ready:** Includes `manifest.json` and `sw.js` for offline caching and home-screen installation on Android and desktop browsers.

---

## ⚡ Supported Aurea Specifications (V1 – V3)

The WebGL2 compiler automatically exposes Aurea's built-in uniforms and helper functions to your `shader.frag`:

| Built-in Identifier | GLSL Type | Description |
| :--- | :--- | :--- |
| `aurea_main(vec2 uv)` | `vec4` | Required fragment entry function returning RGBA output. |
| `aurea_source` | `sampler2D` | Input texture of the current layer or preceding effect in the stack. |
| `aurea.resolution` | `vec4` | `xy`: viewport width & height in pixels; `zw`: `1.0 / resolution.xy`. |
| `aurea.time` | `vec4` | `x`: elapsed time in seconds; `y`: delta time; `z`: frame count. |
| `aurea.layer` | `vec4` | Layer dimensions and transform metadata. |
| `aurea_px_to_uv(vec2 px)` | `vec2` | Converts pixel coordinates/offsets into normalized `[0.0, 1.0]` UV space. |
| `u_<param_id>` | Varies | Auto-bound uniform matching each parameter `id` defined in `plugin.json`. |

---

## 🧩 Dynamic Parameter Mapping

Defining parameters inside `plugin.json` automatically generates the corresponding UI control and GLSL uniform:

| `type` in `plugin.json` | Rendered Studio Control | Bound GLSL Uniform | Example JSON Definition |
| :--- | :--- | :--- | :--- |
| `bool` | Pill Toggle Switch | `uniform float u_<id>;` (`0.0` / `1.0`) | `{ "id": "enabled", "type": "bool", "default": true }` |
| `float` | Range Slider + Value Box | `uniform float u_<id>;` | `{ "id": "intensity", "type": "float", "min": 0, "max": 1, "default": 0.65 }` |
| `int` | Stepped Slider + Integer Box | `uniform int u_<id>;` | `{ "id": "steps", "type": "int", "min": 1, "max": 16, "default": 4 }` |
| `angle` | Degree Slider (`°`) | `uniform float u_<id>;` | `{ "id": "rot", "type": "angle", "min": -360, "max": 360, "default": 0 }` |
| `ruler` | Precision Slider + Unit | `uniform float u_<id>;` | `{ "id": "offset", "type": "ruler", "min": -100, "max": 100, "default": 0 }` |
| `color` | RGB Readout + Color Picker | `uniform vec4 u_<id>;` (RGBA `0..1`) | `{ "id": "tint", "type": "color", "default": "#78d96f" }` |
| `point` | Dual `X` / `Y` Numeric Inputs | `uniform vec2 u_<id>;` | `{ "id": "center", "type": "point", "default": [0.5, 0.5] }` |
| `enum` / `choice` | Segmented Bar / Dropdown | `uniform int u_<id>;` (`0`-indexed) | `{ "id": "mode", "type": "enum", "options": ["A", "B"], "default": 0 }` |

---

## 🚀 Getting Started & Deployment

Because **Aurea Plugin Studio** uses native ES Modules (`<script type="module">`), it must be served over HTTP/HTTPS rather than opened directly via `file://` or Android `content://` URIs.

### Option 1: Live Web App (GitHub Pages)
1. Fork or upload this repository to your GitHub account.
2. Go to **Settings → Pages**.
3. Under **Build and deployment → Branch**, select **`main`** and folder **`/ (root)`**, then click **Save**.
4. Access your live studio at `https://<username>.github.io/aurea-plugin-studio/`.

### Option 2: Local Development (PC & Android)
- **PC (VS Code):** Open the project folder and click **Go Live** using the *Live Server* extension.
- **Android (Acode):** Open `index.html` in Acode and tap the **Play (`▶`)** button in the top toolbar to launch a local server automatically.

---

## 🛠️ Plugin Creation Workflow

1. **Create a Project:** Tap the floating **`+`** button on the Home Screen, enter your plugin name (e.g., `M_MatchaCC`), creator handle, and target Aurea format version (**V1**, **V2**, or **V3**).
2. **Configure `plugin.json`:** Define your plugin metadata (`id`, `name`, `author`, `kind`, `entry`) and declare your user-adjustable `params`.
3. **Write Shader Logic:** Switch to the `shader.frag` tab and implement `vec4 aurea_main(vec2 uv)` using the quick-insert GLSL chips.
4. **Compile & Preview:** Tap the floating **Play (`▶`)** button to compile your shader. Adjust sliders, colors, and toggles live against the viewport.
5. **Validate & Export:** Tap **`✓`** to verify manifest compliance, then tap **`⇪`** to download your `.aureaplugin` package and import it directly into **Aurea**.

---

## 📂 Project Architecture

```text
aurea-plugin-studio/
├── index.html                  # Main SPA shell (Home, Editor, Preview, Settings, Modals)
├── manifest.json               # PWA web app manifest for standalone installation
├── sw.js                       # Service worker for offline asset caching
├── README.md                   # Project documentation
├── css/
│   ├── tokens.css              # Design tokens & theme variables (Matcha Dark & Pure Dark)
│   ├── base.css                # CSS reset, responsive mobile frame, scrollbars, buttons
│   ├── screens.css             # Screen-specific layouts (Home, Editor, Preview, Settings)
│   └── components.css          # Reusable Aurea UI controls (Toggles, Sliders, Modals)
└── js/
    ├── app.js                  # Application state, routing, & lifecycle orchestration
    ├── editor/
    │   └── code-editor.js      # Multi-file tab manager, line numbers, & GLSL syntax chips
    ├── preview/
    │   ├── webgl-engine.js     # WebGL2 compiler & Aurea built-in uniform/header injector
    │   └── param-renderer.js   # Dynamic plugin.json -> interactive UI control generator
    └── exporter/
        └── packager.js         # Manifest V1–V3 validator & zero-dependency ZIP packager
