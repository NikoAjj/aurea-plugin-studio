export const AVIUTL_EASING_PRESETS = {
  linear: { label: 'Linear (0)', fn: t => t },
  hold: { label: 'Instant / Hold', fn: t => (t < 1 ? 0 : 1) },
  sineInOut: { label: 'Smooth (Sine)', fn: t => -(Math.cos(Math.PI * t) - 1) / 2 },
  quadIn: { label: 'Accel (Quad In)', fn: t => t * t },
  quadOut: { label: 'Decel (Quad Out)', fn: t => 1 - (1 - t) * (1 - t) },
  quadInOut: { label: 'Quad In-Out', fn: t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2) },
  cubicIn: { label: 'Cubic In', fn: t => t * t * t },
  cubicOut: { label: 'Cubic Out', fn: t => 1 - Math.pow(1 - t, 3) },
  cubicInOut: { label: 'Cubic In-Out', fn: t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2) },
  expoOut: { label: 'Snap (Expo Out)', fn: t => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)) },
  expoInOut: { label: 'Expo In-Out', fn: t => (t === 0 ? 0 : t === 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2) },
  backOut: { label: 'Overshoot (Back)', fn: t => { const c1 = 1.70158; const c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); } },
  elasticOut: { label: 'Elastic', fn: t => (t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1) },
  bounceOut: {
    label: 'Bounce',
    fn: t => {
      const n1 = 7.5625, d1 = 2.75;
      if (t < 1 / d1) return n1 * t * t;
      if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
      if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
      return n1 * (t -= 2.625 / d1) * t + 0.984375;
    }
  }
};

export const BLEND_MODES = [
  { id: 'source-over', label: 'Normal' },
  { id: 'multiply', label: 'Multiply' },
  { id: 'screen', label: 'Screen' },
  { id: 'overlay', label: 'Overlay' },
  { id: 'darken', label: 'Darken' },
  { id: 'lighten', label: 'Lighten' },
  { id: 'color-dodge', label: 'Color Dodge' },
  { id: 'color-burn', label: 'Color Burn' },
  { id: 'hard-light', label: 'Hard Light' },
  { id: 'soft-light', label: 'Soft Light' },
  { id: 'difference', label: 'Difference' },
  { id: 'exclusion', label: 'Exclusion' },
  { id: 'hue', label: 'Hue' },
  { id: 'saturation', label: 'Saturation' },
  { id: 'color', label: 'Color' },
  { id: 'luminosity', label: 'Luminosity' }
];

export class AureaTimeline {
  constructor({ containerEl, timecodeEl, onSeek, onSelectLayer, onStateMutated }) {
    this.containerEl = containerEl;
    this.timecodeEl = timecodeEl;
    this.onSeek = onSeek;
    this.onSelectLayer = onSelectLayer;
    this.onStateMutated = onStateMutated;

    this.duration = 10.0;
    this.currentTime = 0.0;
    this.zoom = 1.0;
    this.isScrubbing = false;
    this.isPanning = false;
    this.panStartX = 0;
    this.panInitialScroll = 0;

    this.layers = [
      this.createLayerObject('Media', {
        id: 1,
        name: 'Preview_Checker',
        isDefaultChecker: true,
        start: 0.0,
        length: 10.0
      })
    ];

    this.selectedLayerId = 1;
    this.layerDragMode = null;
    this.draggingLayer = null;
    this.dragStartX = 0;
    this.dragStartY = 0;
    this.dragInitialStart = 0;
    this.dragInitialLength = 0;
    this.draggingKeyframe = null;

    this.compCanvas = document.createElement('canvas');
    this.compCanvas.width = 640;
    this.compCanvas.height = 360;
    this.compCtx = this.compCanvas.getContext('2d', { alpha: true });

    this.initEvents();
    this.render();
  }

  createLayerObject(type, overrides = {}) {
    const count = this.layers ? this.layers.length + 1 : 1;
    const now = Number((this.currentTime || 0).toFixed(2));
    const safeStart = overrides.start !== undefined ? overrides.start : Math.min(now, Math.max(0, this.duration - 1.0));
    const defaultLen = type === 'Adjustment' ? this.duration - safeStart : Math.min(5.0, this.duration - safeStart);

    return {
      id: overrides.id || Date.now() + Math.floor(Math.random() * 1000),
      type,
      name: overrides.name || `${type}_${count}`,
      isDefaultChecker: Boolean(overrides.isDefaultChecker),
      text: type === 'Text' ? 'AUREA FX' : '',
      start: safeStart,
      length: overrides.length !== undefined ? overrides.length : Math.max(1.0, defaultLen),
      x: 0.5,
      y: 0.5,
      scale: 1.0,
      rotation: 0,
      blendMode: 'source-over',
      color: type === 'Shape' ? '#78d96f' : '#ffffff',
      image: null,
      hasEffect: false,
      paramValues: {},
      paramKeyframes: {},
      transformKeyframes: {}
    };
  }

  getSelectedLayer() {
    return this.layers.find(l => l.id === this.selectedLayerId) || this.layers[0] || null;
  }

  deleteLayer(layerId) {
    if (this.onStateMutated) this.onStateMutated();
    this.layers = this.layers.filter(l => l.id !== layerId);
    if (!this.layers.some(l => l.id === this.selectedLayerId)) {
      this.selectedLayerId = this.layers[0]?.id ?? null;
    }
    this.render();
    if (this.onSelectLayer) this.onSelectLayer(this.getSelectedLayer());
    if (this.onSeek) this.onSeek(this.currentTime);
  }

  exportSnapshot() {
    return JSON.stringify({
      layers: this.layers.map(({ image, ...rest }) => rest),
      selectedLayerId: this.selectedLayerId
    });
  }

  importSnapshot(rawJson) {
    const data = JSON.parse(rawJson);
    const oldImages = new Map(this.layers.map(l => [l.id, l.image]));
    this.layers = (data.layers || []).map(l => ({ ...l, image: oldImages.get(l.id) || null }));
    this.selectedLayerId = data.selectedLayerId || (this.layers[0]?.id ?? null);
    this.render();
  }

  setTime(sec, triggerSeek = false) {
    this.currentTime = Math.max(0, Math.min(this.duration, sec));
    this.updateTimecodeDisplay();
    this.updatePlayheadPosition();
    if (triggerSeek && this.onSeek) this.onSeek(this.currentTime);
  }

  setZoom(nextZoom) {
    const clamped = Math.max(1.0, Math.min(5.0, Number(nextZoom.toFixed(2))));
    if (clamped === this.zoom) return;
    this.zoom = clamped;
    this.render();
  }

  updateTimecodeDisplay() {
    if (!this.timecodeEl) return;
    const mins = Math.floor(this.currentTime / 60).toString().padStart(2, '0');
    const secs = Math.floor(this.currentTime % 60).toString().padStart(2, '0');
    const frames = Math.floor((this.currentTime * 60) % 60).toString().padStart(2, '0');
    this.timecodeEl.textContent = `${mins}:${secs}:${frames}`;
  }

  updatePlayheadPosition() {
    const needle = this.containerEl.querySelector('.tl-playhead-needle');
    if (!needle) return;
    const pct = (this.currentTime / this.duration) * 100;
    needle.style.left = `calc(${pct}% - 1px)`;
  }

  toggleKey(layer, group, key, currentValue) {
    if (!layer) return;
    if (this.onStateMutated) this.onStateMutated();
    const map = group === 'transform' ? layer.transformKeyframes : layer.paramKeyframes;
    if (!map[key]) map[key] = [];
    const t = Number(this.currentTime.toFixed(2));
    const idx = map[key].findIndex(k => Math.abs(k.time - t) < 0.06);
    if (idx >= 0) {
      map[key].splice(idx, 1);
    } else {
      map[key].push({ time: t, value: JSON.parse(JSON.stringify(currentValue)), easing: 'sineInOut' });
      map[key].sort((a, b) => a.time - b.time);
    }
    this.render();
  }

  setKeyEasing(layer, group, key, easingKey) {
    if (!layer) return;
    const map = group === 'transform' ? layer.transformKeyframes : layer.paramKeyframes;
    const list = map[key];
    if (!list || list.length === 0) return;
    if (this.onStateMutated) this.onStateMutated();
    let target = list.find(k => Math.abs(k.time - this.currentTime) < 0.06);
    if (!target) {
      const prevs = list.filter(k => k.time <= this.currentTime);
      target = prevs.length > 0 ? prevs[prevs.length - 1] : list[0];
    }
    if (target) target.easing = easingKey;
  }

  evaluateTrackList(list, t, fallback) {
    if (!list || list.length === 0) return fallback;
    if (list.length === 1 || t <= list[0].time) return JSON.parse(JSON.stringify(list[0].value));
    const last = list[list.length - 1];
    if (t >= last.time) return JSON.parse(JSON.stringify(last.value));
    for (let i = 0; i < list.length - 1; i++) {
      const k1 = list[i], k2 = list[i + 1];
      if (t >= k1.time && t <= k2.time) {
        const rawAlpha = (k2.time - k1.time) > 0 ? (t - k1.time) / (k2.time - k1.time) : 0;
        const preset = AVIUTL_EASING_PRESETS[k1.easing || 'linear'] || AVIUTL_EASING_PRESETS.linear;
        const alpha = preset.fn(Math.max(0, Math.min(1, rawAlpha)));
        return this.lerpAny(k1.value, k2.value, alpha);
      }
    }
    return fallback;
  }

  evaluateLayerAt(layer, t) {
    const x = this.evaluateTrackList(layer.transformKeyframes.x, t, layer.x);
    const y = this.evaluateTrackList(layer.transformKeyframes.y, t, layer.y);
    const scale = this.evaluateTrackList(layer.transformKeyframes.scale, t, layer.scale);
    const rotation = this.evaluateTrackList(layer.transformKeyframes.rotation, t, layer.rotation);

    const params = { ...layer.paramValues };
    Object.entries(layer.paramKeyframes).forEach(([pId, list]) => {
      if (list && list.length > 0) params[pId] = this.evaluateTrackList(list, t, params[pId]);
    });

    return { x, y, scale, rotation, params };
  }

  lerpAny(a, b, alpha) {
    if (typeof a === 'number' && typeof b === 'number') return Number((a + (b - a) * alpha).toFixed(3));
    if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) {
      return a.map((v, i) => Number((v + (b[i] - v) * alpha).toFixed(3)));
    }
    if (typeof a === 'string' && a.startsWith('#') && typeof b === 'string' && b.startsWith('#')) {
      const c1 = parseInt(a.slice(1, 7), 16), c2 = parseInt(b.slice(1, 7), 16);
      const r = Math.round(((c1 >> 16) & 255) + (((c2 >> 16) & 255) - ((c1 >> 16) & 255)) * alpha);
      const g = Math.round(((c1 >> 8) & 255) + (((c2 >> 8) & 255) - ((c1 >> 8) & 255)) * alpha);
      const bl = Math.round((c1 & 255) + ((c2 & 255) - (c1 & 255)) * alpha);
      return `#${((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1)}`;
    }
    return alpha < 0.5 ? a : b;
  }

  renderCompositeWithEffects(t, applyPluginShader) {
    const ctx = this.compCtx;
    const w = this.compCanvas.width;
    const h = this.compCanvas.height;

    // Kanvas dasar harus CLEAR (transparan murni), bukan warna solid
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, w, h);

    // Render dari BAWAH ke ATAS (index akhir -> index 0)
    for (let i = this.layers.length - 1; i >= 0; i--) {
      const layer = this.layers[i];
      if (t < layer.start - 0.001 || t > layer.start + layer.length + 0.001) continue;

      const evalState = this.evaluateLayerAt(layer, t);

      if (layer.type === 'Adjustment') {
        if (layer.hasEffect && applyPluginShader) {
          const effectedCanvas = applyPluginShader(this.compCanvas, t, evalState.params);
          if (effectedCanvas) {
            ctx.save();
            ctx.globalCompositeOperation = 'source-over';
            ctx.clearRect(0, 0, w, h);
            ctx.drawImage(effectedCanvas, 0, 0, w, h);
            ctx.restore();
          }
        }
        continue;
      }

      if (layer.hasEffect && applyPluginShader) {
        // Render layer ke buffer transparan terpisah agar alpha luar gambar tetap 0
        const temp = document.createElement('canvas');
        temp.width = w;
        temp.height = h;
        const tCtx = temp.getContext('2d', { alpha: true });
        tCtx.clearRect(0, 0, w, h);
        this.drawLayerVisual(tCtx, layer, evalState, w, h);

        const effected = applyPluginShader(temp, t, evalState.params);
        if (effected) {
          // Mask ulang dengan alpha asli layer supaya efek shader tidak membocorkan warna ke area transparan
          const masked = document.createElement('canvas');
          masked.width = w;
          masked.height = h;
          const mCtx = masked.getContext('2d', { alpha: true });
          mCtx.drawImage(effected, 0, 0, w, h);
          mCtx.globalCompositeOperation = 'destination-in';
          mCtx.drawImage(temp, 0, 0, w, h);

          ctx.save();
          ctx.globalCompositeOperation = layer.blendMode || 'source-over';
          ctx.drawImage(masked, 0, 0, w, h);
          ctx.restore();
        }
      } else {
        ctx.save();
        ctx.globalCompositeOperation = layer.blendMode || 'source-over';
        this.drawLayerVisual(ctx, layer, evalState, w, h);
        ctx.restore();
      }
    }

    return this.compCanvas;
  }

  drawLayerVisual(ctx, layer, evalState, w, h) {
    ctx.save();
    ctx.translate(evalState.x * w, evalState.y * h);
    ctx.rotate((evalState.rotation * Math.PI) / 180);
    ctx.scale(evalState.scale, evalState.scale);

    if (layer.type === 'Media') {
      if (layer.image) {
        const aspect = layer.image.width / layer.image.height;
        const drawH = h * 0.85;
        const drawW = drawH * aspect;
        ctx.drawImage(layer.image, -drawW / 2, -drawH / 2, drawW, drawH);
      } else if (layer.isDefaultChecker) {
        const tile = 32;
        for (let y = -h / 2; y < h / 2; y += tile) {
          for (let x = -w / 2; x < w / 2; x += tile) {
            const isEven = (Math.floor((x + w / 2) / tile) + Math.floor((y + h / 2) / tile)) % 2 === 0;
            ctx.fillStyle = isEven ? '#274225' : '#182917';
            ctx.fillRect(x, y, tile, tile);
          }
        }
        ctx.font = '700 26px "Plus Jakarta Sans", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#78d96f';
        ctx.fillText('Preview plugin mode', 0, 0);
      } else {
        ctx.fillStyle = layer.color || '#3b6e35';
        ctx.fillRect(-140, -80, 280, 160);
        ctx.strokeStyle = '#78d96f';
        ctx.lineWidth = 3;
        ctx.strokeRect(-140, -80, 280, 160);
      }
    } else if (layer.type === 'Shape') {
      ctx.fillStyle = layer.color || '#78d96f';
      ctx.beginPath();
      ctx.roundRect(-75, -75, 150, 150, 20);
      ctx.fill();
    } else if (layer.type === 'Text') {
      ctx.font = '800 44px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 6;
      ctx.strokeStyle = 'rgba(0,0,0,0.65)';
      ctx.strokeText(layer.text || 'TEXT', 0, 0);
      ctx.fillStyle = layer.color || '#ffffff';
      ctx.fillText(layer.text || 'TEXT', 0, 0);
    }
    ctx.restore();
  }

  addLayer(type = 'Media', imageObj = null) {
    if (this.onStateMutated) this.onStateMutated();
    const newLayer = this.createLayerObject(type);
    if (imageObj) {
      newLayer.image = imageObj;
      newLayer.name = 'Image_Layer';
    }
    this.layers.unshift(newLayer);
    this.selectedLayerId = newLayer.id;
    this.render();
    if (this.onSelectLayer) this.onSelectLayer(newLayer);
    if (this.onSeek) this.onSeek(this.currentTime);
  }

  staggerLayers() {
    if (this.onStateMutated) this.onStateMutated();
    this.layers.forEach((layer, idx) => {
      layer.start = Math.min(idx * 0.6, this.duration - 2.0);
      layer.length = Math.max(2.0, this.duration - layer.start);
    });
    this.render();
  }

  getLayerKeyframesFlat(layer) {
    const items = [];
    Object.entries(layer.paramKeyframes || {}).forEach(([key, list]) => {
      (list || []).forEach(kf => items.push({ group: 'param', key, kfRef: kf }));
    });
    Object.entries(layer.transformKeyframes || {}).forEach(([key, list]) => {
      (list || []).forEach(kf => items.push({ group: 'transform', key, kfRef: kf }));
    });
    return items;
  }

  initEvents() {
    const scrubFromClientX = clientX => {
      const trackCanvas = this.containerEl.querySelector('.tl-zoom-canvas');
      if (!trackCanvas) return;
      const rect = trackCanvas.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      this.setTime(ratio * this.duration, true);
    };

    this.containerEl.addEventListener('wheel', e => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        this.setZoom(this.zoom + (e.deltaY < 0 ? 0.35 : -0.35));
      } else if (this.zoom > 1.0 && Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        this.containerEl.scrollLeft += e.deltaY;
      }
    }, { passive: false });

    this.containerEl.addEventListener('pointerdown', e => {
      if (e.button === 1 || e.shiftKey) {
        e.preventDefault();
        this.isPanning = true;
        this.panStartX = e.clientX;
        this.panInitialScroll = this.containerEl.scrollLeft;
        this.containerEl.setPointerCapture(e.pointerId);
        return;
      }
      if (e.target.closest('.dummy-layer-bar') || e.target.closest('.tl-kf-diamond')) return;
      this.isScrubbing = true;
      this.containerEl.setPointerCapture(e.pointerId);
      scrubFromClientX(e.clientX);
    });

    this.containerEl.addEventListener('pointermove', e => {
      const trackCanvas = this.containerEl.querySelector('.tl-zoom-canvas');
      if (!trackCanvas) return;
      const rect = trackCanvas.getBoundingClientRect();

      if (this.isPanning) {
        this.containerEl.scrollLeft = this.panInitialScroll - (e.clientX - this.panStartX);
      } else if (this.isScrubbing) {
        scrubFromClientX(e.clientX);
      } else if (this.draggingKeyframe) {
        const { layer, group, key, kfRef } = this.draggingKeyframe;
        const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        kfRef.time = Number((ratio * this.duration).toFixed(2));
        const map = group === 'transform' ? layer.transformKeyframes : layer.paramKeyframes;
        map[key].sort((a, b) => a.time - b.time);
        this.render();
        if (this.onSeek) this.onSeek(this.currentTime);
      } else if (this.draggingLayer) {
        const deltaSec = ((e.clientX - this.dragStartX) / rect.width) * this.duration;

        if (this.layerDragMode === 'move') {
          const maxStart = Math.max(0, this.duration - this.draggingLayer.length);
          this.draggingLayer.start = Math.max(0, Math.min(maxStart, this.dragInitialStart + deltaSec));

          const deltaY = e.clientY - this.dragStartY;
          const curIdx = this.layers.indexOf(this.draggingLayer);
          if (deltaY < -18 && curIdx > 0) {
            this.layers.splice(curIdx, 1);
            this.layers.splice(curIdx - 1, 0, this.draggingLayer);
            this.dragStartY = e.clientY;
          } else if (deltaY > 18 && curIdx < this.layers.length - 1) {
            this.layers.splice(curIdx, 1);
            this.layers.splice(curIdx + 1, 0, this.draggingLayer);
            this.dragStartY = e.clientY;
          }
        } else if (this.layerDragMode === 'trim-left') {
          const endPos = this.dragInitialStart + this.dragInitialLength;
          const nextStart = Math.max(0, Math.min(endPos - 0.3, this.dragInitialStart + deltaSec));
          this.draggingLayer.start = nextStart;
          this.draggingLayer.length = endPos - nextStart;
        } else if (this.layerDragMode === 'trim-right') {
          const maxLen = this.duration - this.dragInitialStart;
          this.draggingLayer.length = Math.max(0.3, Math.min(maxLen, this.dragInitialLength + deltaSec));
        }
        this.render();
        if (this.onSeek) this.onSeek(this.currentTime);
      }
    });

    const endInteraction = () => {
      if ((this.draggingLayer || this.draggingKeyframe) && this.onSeek) {
        this.onSeek(this.currentTime);
      }
      this.isPanning = false;
      this.isScrubbing = false;
      this.draggingLayer = null;
      this.layerDragMode = null;
      this.draggingKeyframe = null;
    };

    this.containerEl.addEventListener('pointerup', endInteraction);
    this.containerEl.addEventListener('pointercancel', endInteraction);
  }

  render() {
    const prevScroll = this.containerEl.scrollLeft;
    this.containerEl.innerHTML = '';
    this.containerEl.style.overflowX = 'auto';
    this.containerEl.style.overflowY = 'auto';
    this.containerEl.style.maxHeight = '132px';
    this.containerEl.style.userSelect = 'none';

    const canvas = document.createElement('div');
    canvas.className = 'tl-zoom-canvas';
    canvas.style.cssText = `position:relative;width:${this.zoom * 100}%;min-height:86px;display:flex;flex-direction:column;gap:4px;`;

    const rulerRow = document.createElement('div');
    rulerRow.style.cssText = 'position:relative;height:16px;border-bottom:1px solid var(--border-subtle);background:rgba(0,0,0,0.28);';
    const step = this.zoom >= 2.5 ? 0.5 : 1.0;
    for (let s = 0; s <= this.duration; s += step) {
      const tick = document.createElement('span');
      tick.textContent = `${s}s`;
      tick.style.cssText = `position:absolute;left:${(s / this.duration) * 100}%;font-size:9px;font-family:var(--font-code);color:var(--text-muted);padding-left:2px;border-left:1px solid var(--border-subtle);pointer-events:none;`;
      rulerRow.appendChild(tick);
    }
    canvas.appendChild(rulerRow);

    this.layers.forEach((layer, index) => {
      const track = document.createElement('div');
      track.style.cssText = 'position:relative;height:22px;width:100%;';

      const isSelected = layer.id === this.selectedLayerId;
      const bar = document.createElement('div');
      bar.className = 'dummy-layer-bar';
      bar.style.cssText = `position:absolute;top:1px;height:20px;left:${(layer.start / this.duration) * 100}%;width:${(layer.length / this.duration) * 100}%;cursor:grab;border:${isSelected ? '1.5px solid #ffffff' : '1px solid var(--border-strong)'};background:${isSelected ? 'rgba(120,217,111,0.35)' : 'var(--accent-badge)'};padding:0;justify-content:space-between;overflow:hidden;`;

      const leftHandle = document.createElement('span');
      leftHandle.textContent = '◀';
      leftHandle.style.cssText = 'display:flex;align-items:center;justify-content:center;width:14px;height:100%;font-size:8px;background:rgba(0,0,0,0.35);color:var(--accent-primary);cursor:ew-resize;flex-shrink:0;z-index:3;';
      leftHandle.addEventListener('pointerdown', e => {
        e.stopPropagation();
        if (this.onStateMutated) this.onStateMutated();
        this.selectedLayerId = layer.id;
        this.draggingLayer = layer;
        this.layerDragMode = 'trim-left';
        this.dragStartX = e.clientX;
        this.dragInitialStart = layer.start;
        this.dragInitialLength = layer.length;
        this.containerEl.setPointerCapture(e.pointerId);
        if (this.onSelectLayer) this.onSelectLayer(layer);
      });

      const fxTag = layer.hasEffect ? ' [FX]' : '';
      const label = document.createElement('span');
      label.textContent = `#${index + 1} ${layer.type === 'Text' ? `T:"${layer.text}"` : layer.name}${fxTag}`;
      label.style.cssText = 'font-size:9px;font-weight:700;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:0 4px;pointer-events:none;z-index:2;';

      const rightHandle = document.createElement('span');
      rightHandle.textContent = '▶';
      rightHandle.style.cssText = 'display:flex;align-items:center;justify-content:center;width:14px;height:100%;font-size:8px;background:rgba(0,0,0,0.35);color:var(--accent-primary);cursor:ew-resize;flex-shrink:0;z-index:3;';
      rightHandle.addEventListener('pointerdown', e => {
        e.stopPropagation();
        if (this.onStateMutated) this.onStateMutated();
        this.selectedLayerId = layer.id;
        this.draggingLayer = layer;
        this.layerDragMode = 'trim-right';
        this.dragStartX = e.clientX;
        this.dragInitialStart = layer.start;
        this.dragInitialLength = layer.length;
        this.containerEl.setPointerCapture(e.pointerId);
        if (this.onSelectLayer) this.onSelectLayer(layer);
      });

      bar.appendChild(leftHandle);
      bar.appendChild(label);
      bar.appendChild(rightHandle);

      const ownKfs = this.getLayerKeyframesFlat(layer);
      ownKfs.forEach(({ group, key, kfRef }) => {
        if (kfRef.time >= layer.start && kfRef.time <= layer.start + layer.length) {
          const relPct = ((kfRef.time - layer.start) / layer.length) * 100;
          const innerKf = document.createElement('span');
          innerKf.className = 'tl-kf-diamond';
          innerKf.title = `${key} @ ${kfRef.time}s`;
          innerKf.style.cssText = `position:absolute;top:6px;left:calc(${relPct}% - 4px);width:7px;height:7px;transform:rotate(45deg);background:${Math.abs(kfRef.time - this.currentTime) < 0.06 ? '#ffffff' : 'var(--accent-primary)'};border:1px solid #0f1c0e;cursor:ew-resize;z-index:4;`;
          innerKf.addEventListener('pointerdown', e => {
            e.stopPropagation();
            if (this.onStateMutated) this.onStateMutated();
            this.selectedLayerId = layer.id;
            this.draggingKeyframe = { layer, group, key, kfRef };
            this.containerEl.setPointerCapture(e.pointerId);
          });
          bar.appendChild(innerKf);
        }
      });

      bar.addEventListener('pointerdown', e => {
        if (e.button === 1 || e.shiftKey) return;
        e.stopPropagation();
        if (this.onStateMutated) this.onStateMutated();
        this.selectedLayerId = layer.id;
        this.draggingLayer = layer;
        this.layerDragMode = 'move';
        this.dragStartX = e.clientX;
        this.dragStartY = e.clientY;
        this.dragInitialStart = layer.start;
        this.dragInitialLength = layer.length;
        this.containerEl.setPointerCapture(e.pointerId);
        this.render();
        if (this.onSelectLayer) this.onSelectLayer(layer);
      });

      track.appendChild(bar);
      canvas.appendChild(track);
    });

    const needle = document.createElement('div');
    needle.className = 'tl-playhead-needle';
    needle.style.cssText = 'position:absolute;top:0;bottom:0;width:2px;background-color:var(--playhead-pink);pointer-events:none;z-index:9;';
    canvas.appendChild(needle);

    this.containerEl.appendChild(canvas);
    this.containerEl.scrollLeft = prevScroll;
    this.updatePlayheadPosition();
  }
}