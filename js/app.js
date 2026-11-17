import { AureaCodeEditor } from './editor/code-editor.js';
import { AureaWebGLEngine } from './preview/webgl-engine.js';
import { renderDynamicParams } from './preview/param-renderer.js';
import { AureaTimeline, AVIUTL_EASING_PRESETS, BLEND_MODES } from './preview/timeline.js';
import { validatePluginProject, exportAureaPlugin } from './exporter/packager.js';

const DEFAULT_PROJECTS = [
  {
    id: 'com.nikoajj.matchacc',
    name: 'M_MatchaCC',
    author: 'NikoAjj',
    version: '3',
    size: '2.6KB',
    files: {
      'plugin.json': JSON.stringify({
        formatVersion: 3,
        id: 'com.nikoajj.matchacc',
        name: 'M_MatchaCC',
        author: 'NikoAjj',
        kind: 'shader',
        entry: 'shader.frag',
        params: [
          { id: 'enabled', label: 'Active', type: 'bool', default: true },
          { id: 'intensity', label: 'Intensity', type: 'float', min: 0, max: 1, default: 0.45 },
          { id: 'tint', label: 'Tint Color', type: 'color', default: '#78d96f' },
          { id: 'mode', label: 'Blend Mode', type: 'enum', options: ['Normal', 'Matcha', 'Invert'], default: 1 }
        ]
      }, null, 2),
      'shader.frag': `vec4 aurea_main(vec2 uv) {\n  vec4 src = texture(aurea_source, uv);\n  if (u_enabled < 0.5) return src;\n  float wave = 0.5 + 0.5 * sin(uv.x * 8.0 + aurea.time.x * 2.5);\n  vec3 fx = u_tint.rgb * wave;\n  if (u_mode == 2) fx = 1.0 - src.rgb;\n  vec3 col = mix(src.rgb, fx, u_intensity);\n  return vec4(col, src.a);\n}`,
      'frame.js': `// Per-frame logic (Aurea V2/V3)\nexport function onFrame(ctx) {\n  // Read or animate uniforms here\n}`,
      'main.js': `// Batch / timeline utility script\nexport function run(project) {\n  console.log("Running M_MatchaCC helper");\n}`
    }
  },
  {
    id: 'com.nikoajj.shake',
    name: 'M_shake',
    author: 'NikoAjj',
    version: '2',
    size: '2.6KB',
    files: {
      'plugin.json': JSON.stringify({
        formatVersion: 2,
        id: 'com.nikoajj.shake',
        name: 'M_shake',
        author: 'NikoAjj',
        kind: 'shader',
        entry: 'shader.frag',
        params: [
          { id: 'amp', label: 'Amplitude', type: 'float', min: 0, max: 0.1, default: 0.02 }
        ]
      }, null, 2),
      'shader.frag': `vec4 aurea_main(vec2 uv) {\n  vec2 offset = vec2(sin(aurea.time.x * 30.0), cos(aurea.time.x * 25.0)) * u_amp;\n  return texture(aurea_source, clamp(uv + offset, 0.0, 1.0));\n}`
    }
  }
];

const PREVIEW_SCALES = [0.25, 0.5, 0.75, 1.0];

const state = {
  projects: JSON.parse(localStorage.getItem('aurea_studio_projects')) || DEFAULT_PROJECTS,
  recycleBin: JSON.parse(localStorage.getItem('aurea_studio_trash')) || [],
  activeProject: null,
  isPlaying: true,
  isObjectInspectorOpen: true,
  previewScaleIdx: 1,
  lastFrameTime: performance.now(),
  editor: null,
  engine: null,
  timeline: null,
  parsedManifest: null,
  undoStack: [],
  redoStack: []
};

function saveProjects() {
  localStorage.setItem('aurea_studio_projects', JSON.stringify(state.projects));
  localStorage.setItem('aurea_studio_trash', JSON.stringify(state.recycleBin));
}

function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(screenId).classList.add('active');
}

function syncProjectManifestMeta(proj) {
  const cleanAuthor = (proj.author || 'nikoajj').toLowerCase().replace(/[^a-z0-9]/g, '') || 'creator';
  const cleanName = (proj.name || 'untitled').toLowerCase().replace(/[^a-z0-9]/g, '') || 'plugin';
  proj.id = `com.${cleanAuthor}.${cleanName}`;

  if (proj.files && proj.files['plugin.json']) {
    try {
      const parsed = JSON.parse(proj.files['plugin.json']);
      parsed.id = proj.id;
      parsed.name = proj.name;
      parsed.author = proj.author;
      proj.files['plugin.json'] = JSON.stringify(parsed, null, 2);
    } catch (_) {
      // Ignore if JSON is currently invalid while editing
    }
  }
}

function getDefaultParamValues() {
  const defaults = {};
  (state.parsedManifest?.params || []).forEach(p => {
    defaults[p.id] = p.default;
  });
  return defaults;
}

function pushUndoSnapshot() {
  if (!state.timeline) return;
  state.undoStack.push(state.timeline.exportSnapshot());
  if (state.undoStack.length > 40) state.undoStack.shift();
  state.redoStack = [];
}

function performUndo() {
  if (state.undoStack.length === 0 || !state.timeline) return;
  state.redoStack.push(state.timeline.exportSnapshot());
  state.timeline.importSnapshot(state.undoStack.pop());
  refreshParamControls();
  renderSelectedLayerInspector();
  renderPreviewFrame(state.timeline.currentTime);
}

function performRedo() {
  if (state.redoStack.length === 0 || !state.timeline) return;
  state.undoStack.push(state.timeline.exportSnapshot());
  state.timeline.importSnapshot(state.redoStack.pop());
  refreshParamControls();
  renderSelectedLayerInspector();
  renderPreviewFrame(state.timeline.currentTime);
}

function showProjectActionMenu(proj, idx, anchorBtn) {
  const existing = document.getElementById('project-action-popover');
  if (existing) {
    const isSame = existing.dataset.targetIdx === String(idx);
    existing.remove();
    if (isSame) return;
  }

  const rect = anchorBtn.getBoundingClientRect();
  const menu = document.createElement('div');
  menu.id = 'project-action-popover';
  menu.dataset.targetIdx = String(idx);
  menu.style.cssText = `
    position: fixed;
    top: ${Math.min(window.innerHeight - 230, rect.bottom + 6)}px;
    right: ${Math.max(16, window.innerWidth - rect.right)}px;
    min-width: 195px;
    background: var(--bg-surface);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-md);
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 3px;
    z-index: 999;
    box-shadow: 0 10px 28px rgba(0,0,0,0.65);
  `;

  const actions = [
    {
      label: '✏️ Rename Project',
      color: 'var(--text-primary)',
      onClick: () => {
        const nextName = prompt('New Project Name:', proj.name);
        if (!nextName || !nextName.trim()) return;
        proj.name = nextName.trim();
        syncProjectManifestMeta(proj);
        saveProjects();
        renderProjectList();
      }
    },
    {
      label: '👤 Rename Creator',
      color: 'var(--text-primary)',
      onClick: () => {
        const nextAuthor = prompt('New Creator Name:', proj.author);
        if (!nextAuthor || !nextAuthor.trim()) return;
        proj.author = nextAuthor.trim();
        syncProjectManifestMeta(proj);
        saveProjects();
        renderProjectList();
      }
    },
    {
      label: '📋 Duplicate Project',
      color: 'var(--text-primary)',
      onClick: () => {
        const copy = JSON.parse(JSON.stringify(proj));
        copy.name = `${proj.name}_Copy`;
        syncProjectManifestMeta(copy);
        state.projects.splice(idx + 1, 0, copy);
        saveProjects();
        renderProjectList();
      }
    },
    {
      label: '♻️ Delete (Recycle Bin)',
      color: '#f2c94c',
      onClick: () => {
        const removed = state.projects.splice(idx, 1)[0];
        removed.deletedAt = new Date().toLocaleString('en-US');
        state.recycleBin.unshift(removed);
        saveProjects();
        renderProjectList();
        renderSettings();
      }
    },
    {
      label: '🗑️ Delete Permanently',
      color: 'var(--danger)',
      onClick: () => {
        if (!confirm(`Permanently delete project "${proj.name}"? This action cannot be undone.`)) return;
        state.projects.splice(idx, 1);
        saveProjects();
        renderProjectList();
      }
    }
  ];

  actions.forEach(act => {
    const btn = document.createElement('button');
    btn.textContent = act.label;
    btn.style.cssText = `
      text-align: left;
      padding: 8px 12px;
      font-size: 12px;
      font-weight: 600;
      border-radius: var(--radius-sm);
      color: ${act.color};
      background: transparent;
      transition: background 0.15s ease;
    `;
    btn.onmouseenter = () => (btn.style.backgroundColor = 'var(--accent-badge)');
    btn.onmouseleave = () => (btn.style.backgroundColor = 'transparent');
    btn.addEventListener('click', e => {
      e.stopPropagation();
      menu.remove();
      act.onClick();
    });
    menu.appendChild(btn);
  });

  document.body.appendChild(menu);

  setTimeout(() => {
    const closeOutside = e => {
      if (!menu.contains(e.target) && e.target !== anchorBtn) {
        menu.remove();
        document.removeEventListener('click', closeOutside);
      }
    };
    document.addEventListener('click', closeOutside);
  }, 10);
}

function renderProjectList() {
  const listEl = document.getElementById('project-list');
  listEl.innerHTML = '';

  if (state.projects.length === 0) {
    listEl.innerHTML = `<p style="text-align:center;color:var(--text-muted);font-size:13px;padding:32px 16px;">No projects yet. Tap the green <b>+</b> button at the bottom right to create a new plugin.</p>`;
    return;
  }

  state.projects.forEach((proj, idx) => {
    const totalBytes = Object.values(proj.files).reduce((sum, txt) => sum + String(txt).length, 0);
    const sizeKb = `${Math.max(0.4, (totalBytes / 1024)).toFixed(1)}KB`;

    const card = document.createElement('div');
    card.className = 'project-card';
    card.innerHTML = `
      <div class="project-thumb"></div>
      <div class="project-info">
        <div class="project-card-title">${proj.name}</div>
        <div class="project-card-author">${proj.author}</div>
        <div class="project-card-meta">${sizeKb} - Plugin V${proj.version}</div>
      </div>
      <button class="btn-project-menu" title="Project Options" style="color: var(--accent-primary); font-size: 20px; padding: 6px 10px; border-radius: 8px; line-height: 1;">≡</button>
    `;

    card.addEventListener('click', () => openProject(proj));

    const menuBtn = card.querySelector('.btn-project-menu');
    menuBtn.addEventListener('click', e => {
      e.stopPropagation();
      showProjectActionMenu(proj, idx, menuBtn);
    });

    listEl.appendChild(card);
  });
}

function openProject(proj) {
  state.activeProject = proj;
  state.undoStack = [];
  state.redoStack = [];

  document.getElementById('editor-project-name').textContent = proj.name;
  document.getElementById('editor-version-badge').textContent = `V${proj.version}`;
  document.getElementById('preview-project-name').textContent = proj.name;
  document.getElementById('preview-version-badge').textContent = `V${proj.version}`;

  state.editor.loadProject(proj);
  showScreen('screen-editor');
}

function compileActiveProject() {
  if (!state.activeProject) return false;
  const statusEl = document.getElementById('editor-status');

  const check = validatePluginProject(state.activeProject);
  if (!check.valid) {
    statusEl.textContent = `Manifest Error: ${check.errors[0]}`;
    statusEl.style.color = 'var(--danger)';
    return false;
  }

  state.parsedManifest = check.manifest;
  const fragCode = state.activeProject.files[state.parsedManifest.entry || 'shader.frag'] || '';
  const params = state.parsedManifest.params || [];

  if (!state.engine) {
    state.engine = new AureaWebGLEngine(document.getElementById('gl-canvas'));
  }

  const res = state.engine.compile(fragCode, params);
  if (!res.ok) {
    statusEl.textContent = `GLSL Error: ${res.error.split('\n')[0]}`;
    statusEl.style.color = 'var(--danger)';
    return false;
  }

  statusEl.textContent = 'Compiled OK • WebGL2 Ready';
  statusEl.style.color = 'var(--accent-primary)';
  return true;
}

function renderPreviewFrame(t) {
  if (!state.timeline) return;
  const glCanvas = document.getElementById('gl-canvas');
  const params = state.parsedManifest?.params || [];

  const applyPluginShader = (sourceCanvas, timeSec, layerParamVals) => {
    if (!state.engine) return null;
    state.engine.uploadSourceImage(sourceCanvas);
    state.engine.render(timeSec, params, layerParamVals);
    return glCanvas;
  };

  const finalComp = state.timeline.renderCompositeWithEffects(t, applyPluginShader);

  if (state.engine) {
    state.engine.setPreviewScale(PREVIEW_SCALES[state.previewScaleIdx] || 0.5);
    state.engine.drawCanvasDirectly(finalComp);
  }
}

function refreshParamControls() {
  const container = document.getElementById('param-controls-container');
  container.innerHTML = '';

  const layer = state.timeline?.getSelectedLayer();
  if (!layer) {
    container.innerHTML = `<p style="color:var(--text-muted);font-size:12px;text-align:center;padding:12px;">Timeline is empty. Click + to add an object.</p>`;
    return;
  }

  if (!layer.hasEffect) {
    const emptyBox = document.createElement('div');
    emptyBox.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:14px;background:var(--bg-surface);border:1px dashed var(--border-strong);border-radius:var(--radius-md);';
    emptyBox.innerHTML = `
      <span style="font-size:11px;color:var(--text-secondary);">No Plugin Effect attached to <b>${layer.name}</b></span>
      <button id="btn-attach-plugin-fx" class="primary-pill-btn" style="padding:8px 16px;font-size:12px;">+ Add ${state.activeProject?.name || 'Plugin'} Effect</button>
    `;
    emptyBox.querySelector('#btn-attach-plugin-fx').addEventListener('click', () => {
      pushUndoSnapshot();
      layer.hasEffect = true;
      layer.paramValues = { ...getDefaultParamValues(), ...layer.paramValues };
      state.timeline.render();
      refreshParamControls();
      renderPreviewFrame(state.timeline.currentTime);
    });
    container.appendChild(emptyBox);
    return;
  }

  const fxHeader = document.createElement('div');
  fxHeader.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:4px 8px;background:var(--accent-badge);border-radius:6px;font-size:11px;font-weight:700;color:var(--accent-primary);';
  fxHeader.innerHTML = `
    <span>✦ Effect: ${state.activeProject?.name || 'Plugin'} (on ${layer.name})</span>
    <button id="btn-remove-plugin-fx" title="Remove effect from this layer" style="color:var(--danger);font-weight:800;font-size:12px;padding:0 4px;">✕</button>
  `;
  fxHeader.querySelector('#btn-remove-plugin-fx').addEventListener('click', () => {
    pushUndoSnapshot();
    layer.hasEffect = false;
    state.timeline.render();
    refreshParamControls();
    renderPreviewFrame(state.timeline.currentTime);
  });
  container.appendChild(fxHeader);

  const paramsListWrap = document.createElement('div');
  paramsListWrap.style.cssText = 'display:flex;flex-direction:column;gap:8px;';
  container.appendChild(paramsListWrap);

  const nowTime = state.timeline.currentTime;
  const evalState = state.timeline.evaluateLayerAt(layer, nowTime);

  renderDynamicParams(
    paramsListWrap,
    state.parsedManifest,
    evalState.params,
    layer.paramKeyframes,
    nowTime,
    (id, newValue) => {
      layer.paramValues[id] = newValue;
      const list = layer.paramKeyframes[id];
      const kfAtNow = list?.find(k => Math.abs(k.time - nowTime) < 0.06);
      if (kfAtNow) {
        kfAtNow.value = newValue;
        refreshParamControls();
      }
      if (!state.isPlaying) renderPreviewFrame(nowTime);
    },
    paramId => {
      state.timeline.toggleKey(layer, 'param', paramId, evalState.params[paramId]);
      refreshParamControls();
    },
    (paramId, kfRef, newTime) => {
      kfRef.time = newTime;
      layer.paramKeyframes[paramId].sort((a, b) => a.time - b.time);
      state.timeline.render();
      refreshParamControls();
      renderPreviewFrame(nowTime);
    },
    (paramId, easingKey) => {
      state.timeline.setKeyEasing(layer, 'param', paramId, easingKey);
      refreshParamControls();
      renderPreviewFrame(nowTime);
    }
  );
}

function renderSelectedLayerInspector() {
  let box = document.getElementById('layer-object-inspector');
  if (!box) {
    box = document.createElement('div');
    box.id = 'layer-object-inspector';
    box.style.cssText = 'margin:0 16px 8px;padding:7px 10px;background:var(--bg-surface);border:1px solid var(--border-subtle);border-radius:var(--radius-md);display:flex;flex-direction:column;gap:6px;';
    const paramsArea = document.getElementById('param-controls-container');
    paramsArea.parentNode.insertBefore(box, paramsArea);
  }

  const layer = state.timeline?.getSelectedLayer();
  if (!layer) {
    box.innerHTML = '';
    return;
  }

  const nowTime = state.timeline.currentTime;
  const evalState = state.timeline.evaluateLayerAt(layer, nowTime);

  const blendOptsHtml = BLEND_MODES.map(m =>
    `<option value="${m.id}" ${layer.blendMode === m.id ? 'selected' : ''}>${m.label}</option>`
  ).join('');

  const buildTransformRow = (key, label, currentVal, step, suffix = '') => {
    const list = layer.transformKeyframes[key] || [];
    const hasKfNow = list.some(k => Math.abs(k.time - nowTime) < 0.06);
    const prevs = list.filter(k => k.time <= nowTime);
    const activeKf = list.find(k => Math.abs(k.time - nowTime) < 0.06) || (prevs.length ? prevs[prevs.length - 1] : list[0]);
    const easingKey = activeKf?.easing || 'sineInOut';

    const easingOpts = Object.entries(AVIUTL_EASING_PRESETS).map(([k, p]) =>
      `<option value="${k}" ${k === easingKey ? 'selected' : ''}>${p.label}</option>`
    ).join('');

    return `
      <div style="display:flex;align-items:center;gap:4px;font-size:10px;color:var(--text-secondary);">
        <span style="width:42px;font-weight:700;color:var(--text-primary);">${label}</span>
        <input data-tkey="${key}" class="inp-transform-val param-value-box" type="number" step="${step}" value="${Number(currentVal).toFixed(key === 'rotation' ? 0 : 2)}" style="width:54px;border:none;padding:3px 4px;font-size:11px;" />
        <button data-tkey="${key}" class="btn-transform-kf" title="Keyframe ${label}" style="width:22px;height:22px;border-radius:4px;font-size:11px;font-weight:700;background:${hasKfNow ? 'var(--accent-primary)' : 'var(--bg-card)'};color:${hasKfNow ? '#0f1c0e' : 'var(--accent-primary)'};border:1px solid var(--border-strong);">${hasKfNow ? '◆' : '◇'}</button>
        ${list.length > 0 ? `<select data-tkey="${key}" class="sel-transform-easing" style="flex:1;background:var(--bg-card);color:var(--accent-primary);border:1px solid var(--border-subtle);border-radius:4px;font-size:9px;padding:2px;">${easingOpts}</select>` : `<span style="flex:1;font-size:9px;color:var(--text-muted);">${suffix}</span>`}
      </div>
    `;
  };

  box.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;">
      <button id="btn-toggle-obj-inspector" style="display:flex;align-items:center;gap:6px;font-size:11px;font-weight:700;color:var(--accent-primary);text-align:left;flex:1;">
        <span>${state.isObjectInspectorOpen ? '▴' : '▾'}</span>
        <span>Object: ${layer.type} (${layer.name})</span>
      </button>
      <button id="btn-delete-selected-layer" class="tl-btn" title="Delete this object" style="width:26px;height:24px;font-size:11px;color:var(--danger);border-color:var(--border-subtle);">🗑</button>
    </div>
    ${state.isObjectInspectorOpen ? `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;padding-top:4px;border-top:1px solid var(--border-subtle);">
        <span style="font-size:10px;color:var(--text-secondary);">Blend:</span>
        <select id="sel-layer-blend" style="flex:1;background:var(--bg-card);color:var(--accent-primary);border:1px solid var(--border-subtle);border-radius:6px;font-size:11px;font-weight:700;padding:3px 6px;">${blendOptsHtml}</select>
        ${layer.type === 'Media' ? `<button id="btn-layer-upload-img" class="tl-btn" style="width:auto;height:24px;padding:0 8px;font-size:10px;">🖼 Image</button>` : ''}
        <input type="color" id="inp-layer-color" value="${layer.color || '#ffffff'}" style="width:24px;height:24px;border:none;background:none;cursor:pointer;" />
      </div>
      ${layer.type === 'Text' ? `
        <input type="text" id="inp-layer-text" value="${layer.text || ''}" placeholder="Enter text here..." class="pill-input" style="border-radius:6px;padding:5px 8px;font-size:12px;text-align:left;background:var(--bg-card);color:var(--text-primary);border:1px solid var(--border-subtle);" />
      ` : ''}
      <div style="display:flex;flex-direction:column;gap:4px;">
        ${buildTransformRow('x', 'Pos X', evalState.x, 0.02)}
        ${buildTransformRow('y', 'Pos Y', evalState.y, 0.02)}
        ${buildTransformRow('scale', 'Scale', evalState.scale, 0.05)}
        ${buildTransformRow('rotation', 'Rot °', evalState.rotation, 5)}
      </div>
    ` : ''}
  `;

  box.querySelector('#btn-toggle-obj-inspector')?.addEventListener('click', () => {
    state.isObjectInspectorOpen = !state.isObjectInspectorOpen;
    renderSelectedLayerInspector();
  });

  box.querySelector('#btn-delete-selected-layer')?.addEventListener('click', () => {
    if (state.timeline) state.timeline.deleteLayer(layer.id);
  });

  const syncRender = () => {
    state.timeline.render();
    renderPreviewFrame(state.timeline.currentTime);
  };

  box.querySelector('#sel-layer-blend')?.addEventListener('change', e => {
    pushUndoSnapshot();
    layer.blendMode = e.target.value;
    syncRender();
  });

  box.querySelector('#inp-layer-color')?.addEventListener('input', e => {
    layer.color = e.target.value;
    layer.isDefaultChecker = false;
    syncRender();
  });

  box.querySelector('#inp-layer-text')?.addEventListener('input', e => {
    layer.text = e.target.value;
    syncRender();
  });

  box.querySelectorAll('.inp-transform-val').forEach(inp => {
    inp.addEventListener('input', e => {
      const k = e.target.dataset.tkey;
      const num = parseFloat(e.target.value) || 0;
      layer[k] = k === 'scale' ? Math.max(0.05, num) : num;
      const kfAtNow = layer.transformKeyframes[k]?.find(item => Math.abs(item.time - nowTime) < 0.06);
      if (kfAtNow) kfAtNow.value = layer[k];
      syncRender();
    });
  });

  box.querySelectorAll('.btn-transform-kf').forEach(btn => {
    btn.addEventListener('click', e => {
      const k = e.target.dataset.tkey;
      state.timeline.toggleKey(layer, 'transform', k, evalState[k]);
      renderSelectedLayerInspector();
    });
  });

  box.querySelectorAll('.sel-transform-easing').forEach(sel => {
    sel.addEventListener('change', e => {
      const k = e.target.dataset.tkey;
      state.timeline.setKeyEasing(layer, 'transform', k, e.target.value);
      syncRender();
    });
  });

  box.querySelector('#btn-layer-upload-img')?.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = ev => {
      const file = ev.target.files[0];
      if (!file) return;
      const img = new Image();
      img.onload = () => {
        pushUndoSnapshot();
        layer.image = img;
        layer.isDefaultChecker = false;
        syncRender();
      };
      img.src = URL.createObjectURL(file);
    };
    input.click();
  });
}

function renderPreviewUI() {
  state.timeline = new AureaTimeline({
    containerEl: document.getElementById('dummy-layers'),
    timecodeEl: document.getElementById('timecode-display'),
    onStateMutated: () => pushUndoSnapshot(),
    onSelectLayer: () => {
      renderSelectedLayerInspector();
      refreshParamControls();
    },
    onSeek: newTime => {
      renderSelectedLayerInspector();
      refreshParamControls();
      renderPreviewFrame(newTime);
    }
  });

  const specBadge = document.querySelector('#screen-preview .preview-meta-bar span:last-child');
  if (specBadge && !specBadge.dataset.scaleBound) {
    specBadge.dataset.scaleBound = '1';
    specBadge.style.cursor = 'pointer';
    specBadge.style.textDecoration = 'underline dotted';
    specBadge.title = 'Click to cycle Preview Scale (0.25x - 1.00x)';
    const updateScaleLabel = () => {
      const sc = PREVIEW_SCALES[state.previewScaleIdx].toFixed(2);
      specBadge.textContent = `${sc}x [16:9] @60FPS`;
    };
    updateScaleLabel();
    specBadge.addEventListener('click', () => {
      state.previewScaleIdx = (state.previewScaleIdx + 1) % PREVIEW_SCALES.length;
      updateScaleLabel();
      renderPreviewFrame(state.timeline.currentTime);
    });
  }

  const leftGroup = document.querySelector('#screen-preview .tl-group');
  if (leftGroup && !document.getElementById('btn-tl-zoom-in')) {
    const zoomOutBtn = document.createElement('button');
    zoomOutBtn.id = 'btn-tl-zoom-out';
    zoomOutBtn.className = 'tl-btn';
    zoomOutBtn.textContent = '−';
    zoomOutBtn.title = 'Zoom Out Timeline';
    zoomOutBtn.addEventListener('click', () => state.timeline.setZoom(state.timeline.zoom - 0.5));

    const zoomInBtn = document.createElement('button');
    zoomInBtn.id = 'btn-tl-zoom-in';
    zoomInBtn.className = 'tl-btn';
    zoomInBtn.textContent = '🔍+';
    zoomInBtn.title = 'Zoom In Timeline';
    zoomInBtn.addEventListener('click', () => state.timeline.setZoom(state.timeline.zoom + 0.5));

    leftGroup.appendChild(zoomOutBtn);
    leftGroup.appendChild(zoomInBtn);
  }

  const kfGlobalBtn = document.getElementById('btn-add-keyframe');
  if (kfGlobalBtn && !document.getElementById('btn-preview-undo')) {
    const rightGroup = kfGlobalBtn.parentElement;
    kfGlobalBtn.remove();

    const undoBtn = document.createElement('button');
    undoBtn.id = 'btn-preview-undo';
    undoBtn.className = 'tl-btn';
    undoBtn.textContent = '↶';
    undoBtn.title = 'Undo (Ctrl+Z)';
    undoBtn.addEventListener('click', performUndo);

    const redoBtn = document.createElement('button');
    redoBtn.id = 'btn-preview-redo';
    redoBtn.className = 'tl-btn';
    redoBtn.textContent = '↷';
    redoBtn.title = 'Redo (Ctrl+Y)';
    redoBtn.addEventListener('click', performRedo);

    rightGroup.appendChild(undoBtn);
    rightGroup.appendChild(redoBtn);
  }

  renderSelectedLayerInspector();
  refreshParamControls();
  renderPreviewFrame(0);
}

function startCanvasLoop() {
  function frame(now) {
    const dt = (now - state.lastFrameTime) * 0.001;
    state.lastFrameTime = now;

    if (state.isPlaying && state.engine && state.timeline) {
      let nextTime = state.timeline.currentTime + dt;
      if (nextTime >= state.timeline.duration) nextTime = 0;
      state.timeline.setTime(nextTime, false);
      renderPreviewFrame(nextTime);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

function showAddObjectMenu(anchorBtn) {
  const existing = document.getElementById('tl-object-menu');
  if (existing) { existing.remove(); return; }

  const menu = document.createElement('div');
  menu.id = 'tl-object-menu';
  menu.style.cssText = 'position:absolute;left:16px;bottom:240px;background:var(--bg-surface);border:1px solid var(--border-strong);border-radius:var(--radius-md);padding:6px;display:flex;flex-direction:column;gap:4px;z-index:40;box-shadow:0 8px 24px rgba(0,0,0,0.5);';

  const options = [
    { type: 'Adjustment', label: '✦ Adjustment Layer' },
    { type: 'Media', label: '🖼 Media / Image Layer' },
    { type: 'Text', label: 'T Text / Title Layer' },
    { type: 'Shape', label: '◼ Shape / Solid Layer' }
  ];

  const finishAdd = (type, img = null) => {
    state.timeline.addLayer(type, img);
    renderSelectedLayerInspector();
    refreshParamControls();
    requestAnimationFrame(() => renderPreviewFrame(state.timeline.currentTime));
  };

  options.forEach(opt => {
    const btn = document.createElement('button');
    btn.textContent = opt.label;
    btn.style.cssText = 'text-align:left;padding:7px 12px;font-size:12px;font-weight:600;border-radius:var(--radius-sm);color:var(--text-primary);';
    btn.onmouseenter = () => (btn.style.backgroundColor = 'var(--accent-badge)');
    btn.onmouseleave = () => (btn.style.backgroundColor = 'transparent');
    btn.addEventListener('click', () => {
      menu.remove();
      if (!state.timeline) return;
      if (opt.type === 'Media') {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = ev => {
          const file = ev.target.files[0];
          if (!file) { finishAdd('Media'); return; }
          const img = new Image();
          img.onload = () => finishAdd('Media', img);
          img.src = URL.createObjectURL(file);
        };
        input.click();
      } else {
        finishAdd(opt.type);
      }
    });
    menu.appendChild(btn);
  });

  document.getElementById('screen-preview').appendChild(menu);
  setTimeout(() => {
    const closeHandler = e => {
      if (!menu.contains(e.target) && e.target !== anchorBtn) {
        menu.remove();
        document.removeEventListener('click', closeHandler);
      }
    };
    document.addEventListener('click', closeHandler);
  }, 10);
}

function renderSettings() {
  const trashCount = state.recycleBin.length;
  const trashItemsHtml = trashCount === 0
    ? `<p style="font-size:11px;color:var(--text-muted);text-align:center;padding:8px;">Recycle bin is empty.</p>`
    : state.recycleBin.map((item, i) => `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;background:var(--bg-card);border:1px solid var(--border-subtle);border-radius:8px;">
        <div style="min-width:0;flex:1;">
          <div style="font-size:12px;font-weight:700;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${item.name}</div>
          <div style="font-size:10px;color:var(--text-muted);">${item.author} • Deleted: ${item.deletedAt || '-'}</div>
        </div>
        <button class="btn-restore-trash" data-tidx="${i}" style="font-size:11px;font-weight:700;color:var(--accent-primary);padding:4px 8px;border:1px solid var(--border-strong);border-radius:6px;">Restore</button>
        <button class="btn-perm-trash" data-tidx="${i}" style="font-size:11px;font-weight:700;color:var(--danger);padding:4px 8px;border:1px solid var(--border-subtle);border-radius:6px;">Delete</button>
      </div>
    `).join('');

  document.getElementById('settings-content').innerHTML = `
    <button class="settings-menu-btn" id="btn-toggle-theme">Appearance & Workspace (Switch Theme)</button>
    <button class="settings-menu-btn" id="btn-cycle-scale-settings">Preview Scale: ${(PREVIEW_SCALES[state.previewScaleIdx]).toFixed(2)}x (Tap to Cycle)</button>
    <button class="settings-menu-btn" id="btn-toggle-trash">♻️ Recycle Bin (${trashCount} Projects)</button>
    <div id="recycle-bin-panel" style="display:none;flex-direction:column;gap:6px;padding:10px;background:var(--bg-surface);border:1px solid var(--border-subtle);border-radius:var(--radius-md);">
      ${trashItemsHtml}
    </div>
    <button class="settings-menu-btn danger-text" id="btn-reset-defaults">Reset Default Demo Projects</button>
    <div style="margin-top:28px;text-align:center;font-size:12px;color:var(--text-secondary);line-height:1.6;">
      <p>this is open-source project, don't distribute with money<br>cuz i don't want any money for this project, just-<br>"from community to community"</p>
      <p style="margin-top:20px;font-weight:700;color:var(--accent-primary);">Aurea Plugin Studio (NikoAjj)<br>Aurea (@Ruanwizto)</p>
    </div>
  `;

  document.getElementById('btn-toggle-theme').addEventListener('click', () => {
    const html = document.documentElement;
    html.setAttribute('data-theme', html.getAttribute('data-theme') === 'matcha-dark' ? 'pure-dark' : 'matcha-dark');
  });

  document.getElementById('btn-cycle-scale-settings').addEventListener('click', e => {
    state.previewScaleIdx = (state.previewScaleIdx + 1) % PREVIEW_SCALES.length;
    e.target.textContent = `Preview Scale: ${(PREVIEW_SCALES[state.previewScaleIdx]).toFixed(2)}x (Tap to Cycle)`;
  });

  document.getElementById('btn-toggle-trash').addEventListener('click', () => {
    const panel = document.getElementById('recycle-bin-panel');
    panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
  });

  document.querySelectorAll('.btn-restore-trash').forEach(btn => {
    btn.addEventListener('click', e => {
      const i = Number(e.target.dataset.tidx);
      const restored = state.recycleBin.splice(i, 1)[0];
      delete restored.deletedAt;
      state.projects.unshift(restored);
      saveProjects();
      renderProjectList();
      renderSettings();
      document.getElementById('recycle-bin-panel').style.display = 'flex';
    });
  });

  document.querySelectorAll('.btn-perm-trash').forEach(btn => {
    btn.addEventListener('click', e => {
      const i = Number(e.target.dataset.tidx);
      if (!confirm('Permanently delete this project from the Recycle Bin?')) return;
      state.recycleBin.splice(i, 1);
      saveProjects();
      renderSettings();
      document.getElementById('recycle-bin-panel').style.display = 'flex';
    });
  });

  document.getElementById('btn-reset-defaults').addEventListener('click', () => {
    if (confirm('Restore default demo projects?')) {
      localStorage.removeItem('aurea_studio_projects');
      localStorage.removeItem('aurea_studio_trash');
      location.reload();
    }
  });
}

function init() {
  state.editor = new AureaCodeEditor({
    textarea: document.getElementById('code-textarea'),
    lineNumbersEl: document.getElementById('line-numbers'),
    fileTabsEl: document.getElementById('file-tabs'),
    chipsContainer: document.getElementById('syntax-chips'),
    onSave: () => { saveProjects(); renderProjectList(); }
  });

  renderProjectList();
  renderSettings();
  startCanvasLoop();

  document.getElementById('btn-fab-new').addEventListener('click', () => document.getElementById('modal-new-project').classList.remove('hidden'));
  document.getElementById('modal-new-project').addEventListener('click', e => {
    if (e.target.id === 'modal-new-project') e.target.classList.add('hidden');
  });

  document.getElementById('btn-create-project').addEventListener('click', () => {
    const nameInput = document.getElementById('input-project-name').value.trim() || 'M_UntitledFX';
    const authorInput = document.getElementById('input-creator-name').value.trim() || 'NikoAjj';
    const version = document.getElementById('select-plugin-version').value;
    const cleanId = `com.${authorInput.toLowerCase().replace(/[^a-z0-9]/g, '')}.${nameInput.toLowerCase().replace(/[^a-z0-9]/g, '')}`;

    const newProj = {
      id: cleanId,
      name: nameInput,
      author: authorInput,
      version,
      size: '1.4KB',
      files: {
        'plugin.json': JSON.stringify({
          formatVersion: Number(version),
          id: cleanId,
          name: nameInput,
          author: authorInput,
          kind: 'shader',
          entry: 'shader.frag',
          params: [{ id: 'intensity', label: 'Intensity', type: 'float', min: 0, max: 1, default: 0.5 }]
        }, null, 2),
        'shader.frag': `vec4 aurea_main(vec2 uv) {\n  vec4 col = texture(aurea_source, uv);\n  return col;\n}`
      }
    };

    state.projects.unshift(newProj);
    saveProjects();
    renderProjectList();
    document.getElementById('modal-new-project').classList.add('hidden');
    openProject(newProj);
  });

  document.getElementById('btn-files').addEventListener('click', () => state.editor.promptNewFile());

  document.getElementById('btn-change-media').addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = e => {
      const file = e.target.files[0];
      if (!file || !state.timeline) return;
      const img = new Image();
      img.onload = () => {
        pushUndoSnapshot();
        const selected = state.timeline.getSelectedLayer();
        if (selected && selected.type === 'Media') {
          selected.image = img;
          selected.isDefaultChecker = false;
        } else {
          state.timeline.addLayer('Media', img);
        }
        state.timeline.render();
        renderSelectedLayerInspector();
        renderPreviewFrame(state.timeline.currentTime);
      };
      img.src = URL.createObjectURL(file);
    };
    input.click();
  });

  const glCanvas = document.getElementById('gl-canvas');
  let draggingOnCanvas = false;
  glCanvas.style.cursor = 'move';
  glCanvas.addEventListener('pointerdown', e => {
    if (!state.timeline) return;
    const layer = state.timeline.getSelectedLayer();
    if (!layer || layer.type === 'Adjustment') return;
    pushUndoSnapshot();
    draggingOnCanvas = true;
    glCanvas.setPointerCapture(e.pointerId);
  });
  glCanvas.addEventListener('pointermove', e => {
    if (!draggingOnCanvas || !state.timeline) return;
    const layer = state.timeline.getSelectedLayer();
    if (!layer) return;
    const rect = glCanvas.getBoundingClientRect();
    layer.x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    layer.y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    renderSelectedLayerInspector();
    renderPreviewFrame(state.timeline.currentTime);
  });
  glCanvas.addEventListener('pointerup', () => { draggingOnCanvas = false; });
  glCanvas.addEventListener('pointercancel', () => { draggingOnCanvas = false; });

  window.addEventListener('keydown', e => {
    if (!document.getElementById('screen-preview').classList.contains('active')) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) performRedo();
      else performUndo();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      performRedo();
    }
  });

  const handleExport = () => {
    if (!state.activeProject) return;
    const res = exportAureaPlugin(state.activeProject);
    const statusEl = document.getElementById('editor-status');
    if (!res.ok) {
      statusEl.textContent = `Export Failed: ${res.errors[0]}`;
      statusEl.style.color = 'var(--danger)';
      alert(`Validation failed:\n- ${res.errors.join('\n- ')}`);
    } else {
      statusEl.textContent = `Exported ${res.filename}`;
      statusEl.style.color = 'var(--accent-primary)';
    }
  };

  document.getElementById('btn-validate').addEventListener('click', () => {
    if (!state.activeProject) return;
    const check = validatePluginProject(state.activeProject);
    const statusEl = document.getElementById('editor-status');
    if (check.valid) {
      statusEl.textContent = `Manifest V${check.manifest.formatVersion || 1} Valid ✓`;
      statusEl.style.color = 'var(--accent-primary)';
    } else {
      statusEl.textContent = `Invalid: ${check.errors[0]}`;
      statusEl.style.color = 'var(--danger)';
    }
  });

  document.getElementById('btn-export-plugin').addEventListener('click', handleExport);
  document.getElementById('btn-export-preview').addEventListener('click', handleExport);

  const addDummyBtn = document.getElementById('btn-add-dummy');
  addDummyBtn.addEventListener('click', () => showAddObjectMenu(addDummyBtn));

  document.getElementById('btn-stagger-dummy').addEventListener('click', () => {
    if (state.timeline) {
      state.timeline.staggerLayers();
      renderPreviewFrame(state.timeline.currentTime);
    }
  });

  document.getElementById('btn-prev-frame').addEventListener('click', () => {
    if (!state.timeline) return;
    state.isPlaying = false;
    document.getElementById('btn-play-pause').textContent = '▶';
    state.timeline.setTime(state.timeline.currentTime - 1 / 60, true);
  });

  document.getElementById('btn-next-frame').addEventListener('click', () => {
    if (!state.timeline) return;
    state.isPlaying = false;
    document.getElementById('btn-play-pause').textContent = '▶';
    state.timeline.setTime(state.timeline.currentTime + 1 / 60, true);
  });

  document.getElementById('btn-editor-back').addEventListener('click', () => showScreen('screen-home'));
  document.getElementById('btn-run-preview').addEventListener('click', () => {
    if (compileActiveProject()) {
      renderPreviewUI();
      showScreen('screen-preview');
    }
  });
  document.getElementById('btn-preview-back').addEventListener('click', () => showScreen('screen-editor'));
  document.getElementById('btn-open-settings').addEventListener('click', () => {
    renderSettings();
    showScreen('screen-settings');
  });
  document.getElementById('btn-settings-back').addEventListener('click', () => showScreen('screen-home'));

  document.getElementById('btn-play-pause').addEventListener('click', e => {
    state.isPlaying = !state.isPlaying;
    e.target.textContent = state.isPlaying ? '⏸' : '▶';
  });
}

init();