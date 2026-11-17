import { AVIUTL_EASING_PRESETS } from './timeline.js';

export function renderDynamicParams(
  container,
  manifest,
  values,
  keyframeMap = {},
  currentTime = 0,
  onChange,
  onToggleKeyframe,
  onMoveKeyframe,
  onChangeEasing
) {
  container.innerHTML = '';
  const params = manifest?.params || [];

  if (params.length === 0) {
    container.innerHTML = `<p style="color: var(--text-muted); font-size: 12px; text-align: center; padding: 12px;">Tidak ada parameter di plugin.json</p>`;
    return;
  }

  params.forEach(param => {
    const val = values[param.id] ?? param.default;
    const paramKfs = (keyframeMap && keyframeMap[param.id]) || [];
    const hasKfAtNow = paramKfs.some(k => Math.abs(k.time - currentTime) < 0.06);

    const wrapper = document.createElement('div');
    wrapper.style.display = 'flex';
    wrapper.style.flexDirection = 'column';
    wrapper.style.gap = '4px';

    const row = document.createElement('div');
    row.className = 'param-row';

    // Tombol Keyframe khusus parameter ini (◇ / ◆)
    const kfBtn = document.createElement('button');
    kfBtn.textContent = hasKfAtNow ? '◆' : '◇';
    kfBtn.title = hasKfAtNow ? 'Hapus keyframe di detik ini' : 'Tambah keyframe parameter ini';
    kfBtn.style.cssText = `min-width:28px;height:28px;border-radius:6px;font-size:13px;font-weight:700;flex-shrink:0;background:${hasKfAtNow ? 'var(--accent-primary)' : 'var(--bg-card)'};color:${hasKfAtNow ? '#0f1c0e' : 'var(--accent-primary)'};border:1px solid var(--border-strong);`;
    kfBtn.addEventListener('click', () => {
      if (onToggleKeyframe) onToggleKeyframe(param.id);
    });

    // 1. BOOL -> Toggle Switch (rata kanan rapi sebelum tombol keyframe)
    if (param.type === 'bool') {
      row.innerHTML = `
        <span style="font-weight: 600; font-size: 13px; flex: 1;">${param.label || param.id}</span>
        <div class="toggle-switch ${val ? 'on' : ''}" style="margin-left: auto; flex-shrink: 0;"></div>
      `;
      const toggle = row.querySelector('.toggle-switch');
      toggle.addEventListener('click', () => {
        toggle.classList.toggle('on');
        onChange(param.id, toggle.classList.contains('on'));
      });
    }

    // 2. FLOAT / INT / ANGLE / RULER -> Slider + Kotak Nilai
    else if (param.type === 'float' || param.type === 'int' || param.type === 'angle' || param.type === 'ruler') {
      const min = param.min ?? (param.type === 'angle' ? -360 : 0);
      const max = param.max ?? (param.type === 'int' ? 100 : param.type === 'angle' ? 360 : 1);
      const step = param.step ?? (param.type === 'int' || param.type === 'angle' ? 1 : 0.01);
      const suffix = param.type === 'angle' ? '°' : (param.unit || '');

      row.innerHTML = `
        <span class="param-badge-label">${param.label || param.id}</span>
        <input class="matcha-slider" type="range" min="${min}" max="${max}" step="${step}" value="${val}" />
        <span class="param-value-box">${val}${suffix}</span>
      `;
      const slider = row.querySelector('.matcha-slider');
      const readout = row.querySelector('.param-value-box');
      slider.addEventListener('input', e => {
        const num = param.type === 'int' ? parseInt(e.target.value, 10) : parseFloat(e.target.value);
        readout.textContent = `${num}${suffix}`;
        onChange(param.id, num);
      });
    }

    // 3. COLOR -> RGB Readout + Color Picker
    else if (param.type === 'color') {
      const hexVal = typeof val === 'string' && val.startsWith('#') ? val.slice(0, 7) : '#78d96f';
      const rgbText = hexToRgbString(hexVal);

      row.innerHTML = `
        <span class="param-badge-label">${param.label || param.id}</span>
        <span style="flex:1; font-family: var(--font-code); font-size: 12px; color: var(--text-primary);">${rgbText}</span>
        <input type="color" value="${hexVal}" style="width: 34px; height: 34px; border: none; border-radius: 6px; background: none; cursor: pointer;" />
      `;
      const picker = row.querySelector('input[type="color"]');
      const labelRgb = row.querySelector('span:nth-child(2)');
      picker.addEventListener('input', e => {
        labelRgb.textContent = hexToRgbString(e.target.value);
        onChange(param.id, e.target.value);
      });
    }

    // 4. POINT (2D X/Y)
    else if (param.type === 'point') {
      const pt = Array.isArray(val) ? val : [0.5, 0.5];
      row.innerHTML = `
        <span class="param-badge-label">${param.label || param.id}</span>
        <div style="flex:1; display:flex; gap:6px; align-items:center; justify-content:flex-end;">
          <span style="font-size:11px; color:var(--accent-primary);">X:</span>
          <input type="number" step="0.01" value="${pt[0]}" class="param-value-box" style="width:62px; border:none;" />
          <span style="font-size:11px; color:var(--accent-primary);">Y:</span>
          <input type="number" step="0.01" value="${pt[1]}" class="param-value-box" style="width:62px; border:none;" />
        </div>
      `;
      const [inX, inY] = row.querySelectorAll('input');
      const updatePt = () => onChange(param.id, [parseFloat(inX.value) || 0, parseFloat(inY.value) || 0]);
      inX.addEventListener('input', updatePt);
      inY.addEventListener('input', updatePt);
    }

    // 5. ENUM / CHOICE
    else if (param.type === 'enum' || param.type === 'choice') {
      const options = param.options || ['Option 1', 'Option 2'];
      const currentIdx = Number(val) || 0;

      if (options.length <= 3) {
        const btns = options.map((opt, idx) =>
          `<button class="segmented-btn ${idx === currentIdx ? 'active' : ''}" data-idx="${idx}">${opt}</button>`
        ).join('');
        row.innerHTML = `
          <span class="param-badge-label">${param.label || param.id}</span>
          <div class="segmented-group">${btns}</div>
        `;
        row.querySelectorAll('.segmented-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            row.querySelectorAll('.segmented-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            onChange(param.id, Number(btn.dataset.idx));
          });
        });
      } else {
        const optsHtml = options.map((opt, idx) =>
          `<option value="${idx}" ${idx === currentIdx ? 'selected' : ''}>${opt}</option>`
        ).join('');
        row.innerHTML = `
          <span class="param-badge-label">${param.label || param.id}</span>
          <select class="pill-input" style="flex:1; border-radius: var(--radius-sm); text-align:left; background: var(--bg-card); color: var(--accent-primary); border: 1px solid var(--border-subtle);">${optsHtml}</select>
        `;
        row.querySelector('select').addEventListener('change', e => {
          onChange(param.id, Number(e.target.value));
        });
      }
    }

    row.appendChild(kfBtn);
    wrapper.appendChild(row);

    // Mini-track Keyframe + Kurva Preset AviUtl jika parameter ini punya keyframe
    if (paramKfs.length > 0) {
      const kfBar = document.createElement('div');
      kfBar.style.cssText = 'display:flex;align-items:center;gap:6px;margin:0 4px 2px 4px;';

      const miniTrack = document.createElement('div');
      miniTrack.style.cssText = 'position:relative;flex:1;height:12px;background:rgba(120,217,111,0.14);border-radius:4px;border:1px solid var(--border-subtle);';

      paramKfs.forEach(kf => {
        const dot = document.createElement('span');
        dot.className = 'kf-diamond';
        dot.title = `${param.label || param.id} = ${kf.value} @ ${kf.time}s`;
        dot.style.cssText = `position:absolute;top:1px;left:calc(${(kf.time / 10.0) * 100}% - 4px);cursor:ew-resize;background:${Math.abs(kf.time - currentTime) < 0.06 ? '#ffffff' : 'var(--accent-primary)'};`;

        dot.addEventListener('pointerdown', e => {
          e.stopPropagation();
          dot.setPointerCapture(e.pointerId);
          const onMove = ev => {
            const rect = miniTrack.getBoundingClientRect();
            const ratio = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
            const newTime = Number((ratio * 10.0).toFixed(2));
            if (onMoveKeyframe) onMoveKeyframe(param.id, kf, newTime);
          };
          const onUp = () => {
            dot.removeEventListener('pointermove', onMove);
            dot.removeEventListener('pointerup', onUp);
          };
          dot.addEventListener('pointermove', onMove);
          dot.addEventListener('pointerup', onUp);
        });

        miniTrack.appendChild(dot);
      });

      const prevs = paramKfs.filter(k => k.time <= currentTime);
      const activeKf = paramKfs.find(k => Math.abs(k.time - currentTime) < 0.06) || (prevs.length ? prevs[prevs.length - 1] : paramKfs[0]);
      const currentEasing = activeKf?.easing || 'sineInOut';

      const curveSvg = buildEasingPreviewSvg(currentEasing);
      const selectEasing = document.createElement('select');
      selectEasing.title = 'Kurva Interpolasi Keyframe (Preset AviUtl)';
      selectEasing.style.cssText = 'background:var(--bg-card);color:var(--accent-primary);border:1px solid var(--border-subtle);border-radius:6px;font-size:10px;font-weight:700;padding:2px 4px;';

      Object.entries(AVIUTL_EASING_PRESETS).forEach(([key, preset]) => {
        const opt = document.createElement('option');
        opt.value = key;
        opt.textContent = preset.label;
        if (key === currentEasing) opt.selected = true;
        selectEasing.appendChild(opt);
      });

      selectEasing.addEventListener('change', e => {
        if (onChangeEasing) onChangeEasing(param.id, e.target.value);
      });

      kfBar.appendChild(miniTrack);
      kfBar.appendChild(curveSvg);
      kfBar.appendChild(selectEasing);
      wrapper.appendChild(kfBar);
    }

    container.appendChild(wrapper);
  });
}

function buildEasingPreviewSvg(easingKey) {
  const preset = AVIUTL_EASING_PRESETS[easingKey] || AVIUTL_EASING_PRESETS.linear;
  const pts = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    const v = Math.max(-0.2, Math.min(1.2, preset.fn(t)));
    const x = 2 + t * 20;
    const y = 16 - v * 12;
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  const wrap = document.createElement('div');
  wrap.innerHTML = `<svg width="24" height="20" viewBox="0 0 24 20" style="background:var(--bg-card);border:1px solid var(--border-subtle);border-radius:4px;display:block;">
    <polyline fill="none" stroke="var(--accent-primary)" stroke-width="1.6" points="${pts.join(' ')}" />
  </svg>`;
  return wrap.firstChild;
}

function hexToRgbString(hex) {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16) || 0;
  const g = parseInt(clean.slice(2, 4), 16) || 0;
  const b = parseInt(clean.slice(4, 6), 16) || 0;
  return `${r} ${g} ${b}`;
}