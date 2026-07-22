/* Optional upright image rangefinder with heuristic scene depth. */
window.HeuristicRangefinder = (() => {
  const ROOT_CLASS = 'heuristic-rangefinder-active';
  const DEFAULT_SOURCE = 'https://media.craiyon.com/2025-09-28/U_sUqYxjTEuZhc0UIYffDg.webp';
  const PALETTE = [
    [42, 2, 5], [104, 5, 12], [176, 10, 18], [243, 24, 24],
    [255, 84, 32], [255, 174, 72], [255, 242, 220]
  ];

  const settings = {
    depth: 1.2,
    focus: 4,
    yaw: 0,
    zoom: 1.75,
    softness: 0.22,
    showBase: true,
    recolour: true
  };

  let root;
  let canvas;
  let ctx;
  let status;
  let image;
  let baseCanvas;
  let bands = [];
  let ready = false;
  let active = false;
  let raf = 0;
  let width = 0;
  let height = 0;
  let dpr = 1;
  let pulse = 0;
  let dragging = false;
  let pointerId = null;
  let lastX = 0;
  let lastY = 0;
  let dragDistance = 0;
  let targetLook = { x: 0, y: 0 };
  let look = { x: 0, y: 0 };
  let targetInspection = { u: 0.5, v: 0.5 };
  let inspection = { u: 0.5, v: 0.5 };
  let targetZoom = settings.zoom;
  let currentZoom = settings.zoom;

  const clamp01 = value => Math.max(0, Math.min(1, value));
  const luminance = (r, g, b) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

  function button() {
    return document.querySelector('#heuristic-rangefinder-toggle');
  }

  function createRoot() {
    const node = document.createElement('section');
    node.className = 'heuristic-rangefinder-system';
    node.setAttribute('aria-label', 'Heuristic image rangefinder');

    canvas = document.createElement('canvas');
    canvas.className = 'heuristic-rangefinder-canvas';
    canvas.setAttribute('aria-label', 'Projected image depth view');

    status = document.createElement('div');
    status.className = 'heuristic-rangefinder-status';
    status.textContent = 'RANGEFINDER STANDBY';

    node.append(canvas, status);
    document.body.prepend(node);
    ctx = canvas.getContext('2d', { alpha: false });
    return node;
  }

  function mount() {
    if (root) return;
    root = createRoot();
    addEventListener('resize', resize, { passive: true });
    canvas.addEventListener('pointerdown', pointerDown);
    canvas.addEventListener('pointermove', pointerMove);
    canvas.addEventListener('pointerup', pointerUp);
    canvas.addEventListener('pointercancel', pointerUp);
    canvas.addEventListener('wheel', wheel, { passive: false });
    resize();
  }

  function resize() {
    if (!canvas) return;
    dpr = Math.min(devicePixelRatio || 1, 2);
    width = innerWidth;
    height = innerHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
  }

  function setStatus(message, fade = true) {
    if (!status) return;
    status.style.opacity = '1';
    status.textContent = message;
    if (fade) setTimeout(() => { if (status) status.style.opacity = '.35'; }, 1100);
  }

  function buildBands() {
    bands = [];
    baseCanvas = document.createElement('canvas');
    baseCanvas.width = image.naturalWidth;
    baseCanvas.height = image.naturalHeight;
    const baseContext = baseCanvas.getContext('2d');
    baseContext.drawImage(image, 0, 0);

    let source;
    try {
      source = baseContext.getImageData(0, 0, baseCanvas.width, baseCanvas.height);
    } catch (error) {
      setStatus('IMAGE HOST BLOCKED CANVAS ACCESS', false);
      throw error;
    }

    const w = baseCanvas.width;
    const h = baseCanvas.height;
    const count = w * h;
    const gray = new Float32Array(count);
    const edge = new Float32Array(count);
    const contrast = new Float32Array(count);
    const depthScore = new Float32Array(count);

    for (let pixel = 0; pixel < count; pixel += 1) {
      const index = pixel * 4;
      gray[pixel] = luminance(source.data[index], source.data[index + 1], source.data[index + 2]);
    }

    let edgeMax = 0.0001;
    for (let y = 1; y < h - 1; y += 1) {
      for (let x = 1; x < w - 1; x += 1) {
        const p = y * w + x;
        const gx = -gray[p-w-1] + gray[p-w+1] - 2*gray[p-1] + 2*gray[p+1] - gray[p+w-1] + gray[p+w+1];
        const gy = -gray[p-w-1] - 2*gray[p-w] - gray[p-w+1] + gray[p+w-1] + 2*gray[p+w] + gray[p+w+1];
        edge[p] = Math.sqrt(gx * gx + gy * gy);
        edgeMax = Math.max(edgeMax, edge[p]);
      }
    }

    let contrastMax = 0.0001;
    const radius = 3;
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        let sum = 0;
        let sumSquares = 0;
        let samples = 0;
        for (let yy = Math.max(0, y-radius); yy <= Math.min(h-1, y+radius); yy += 2) {
          for (let xx = Math.max(0, x-radius); xx <= Math.min(w-1, x+radius); xx += 2) {
            const value = gray[yy*w+xx];
            sum += value;
            sumSquares += value * value;
            samples += 1;
          }
        }
        const mean = sum / samples;
        const value = Math.sqrt(Math.max(0, sumSquares / samples - mean * mean));
        contrast[y*w+x] = value;
        contrastMax = Math.max(contrastMax, value);
      }
    }

    const horizon = 0.43;
    for (let y = 0; y < h; y += 1) {
      const vertical = y / Math.max(1, h - 1);
      const below = clamp01((vertical - horizon) / (1 - horizon));
      const above = clamp01((horizon - vertical) / horizon);

      for (let x = 0; x < w; x += 1) {
        const p = y*w+x;
        const horizontal = x / Math.max(1, w - 1);
        const centreBias = 1 - Math.min(1, Math.abs(horizontal - 0.5) * 2);
        const e = clamp01(edge[p] / edgeMax * 2.2);
        const c = clamp01(contrast[p] / contrastMax * 1.9);
        const dark = 1 - gray[p];
        let near = below*.58 + e*.20 + c*.14 + dark*.08 - above*centreBias*.22;
        near += (1-centreBias)*above*(e*.55+c*.45)*.28;
        depthScore[p] = clamp01(near);
      }
    }

    for (let bandIndex = 0; bandIndex < 7; bandIndex += 1) {
      const layer = document.createElement('canvas');
      layer.width = w;
      layer.height = h;
      const layerContext = layer.getContext('2d');
      const output = layerContext.createImageData(w, h);
      const low = bandIndex / 7;
      const high = (bandIndex + 1) / 7;
      const centre = (low + high) * 0.5;
      const half = (high - low) * 0.5;

      for (let pixel = 0; pixel < count; pixel += 1) {
        const distance = Math.abs(depthScore[pixel] - centre);
        const alpha = distance <= half
          ? 1
          : Math.max(0, 1 - (distance - half) / Math.max(0.0001, half * settings.softness * 2.5));
        if (alpha <= 0) continue;

        const index = pixel * 4;
        const red = source.data[index];
        const green = source.data[index + 1];
        const blue = source.data[index + 2];
        const energyIndex = Math.max(0, Math.min(6, Math.floor(gray[pixel] * 7)));
        const colour = PALETTE[energyIndex];
        output.data[index] = settings.recolour ? colour[0] : red;
        output.data[index + 1] = settings.recolour ? colour[1] : green;
        output.data[index + 2] = settings.recolour ? colour[2] : blue;
        output.data[index + 3] = Math.round(source.data[index + 3] * alpha);
      }

      layerContext.putImageData(output, 0, 0);
      bands.push(layer);
    }
  }

  function load(source = DEFAULT_SOURCE) {
    mount();
    ready = false;
    setStatus('ANALYSING STREET DEPTH', false);
    image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      try {
        buildBands();
        ready = true;
        setStatus('HEURISTIC DEPTH RESOLVED');
      } catch (error) {
        console.error('HeuristicRangefinder:', error);
      }
    };
    image.onerror = () => setStatus('IMAGE COULD NOT LOAD', false);
    image.src = source;
  }

  function planeRect(z) {
    const aspect = image.naturalWidth / image.naturalHeight;
    let h = Math.min(height * .98, width / aspect * .98) * currentZoom;
    let w = h * aspect;
    const zNormal = z * settings.depth;
    const perspective = 1 / (1 + zNormal * .055);
    w *= perspective;
    h *= perspective;
    const yawRadians = settings.yaw * Math.PI / 180;
    const shear = Math.sin(yawRadians) * w * .18;
    const pivotX = inspection.u * w;
    const pivotY = inspection.v * h;
    const x = width/2 - pivotX + look.x*(zNormal*.055) + zNormal*Math.sin(yawRadians)*7;
    const y = height/2 - pivotY + look.y*(zNormal*.042) - zNormal*.7;
    return { x, y, w, h, shear };
  }

  function drawPlane(source, z, alpha, glow) {
    const rect = planeRect(z);
    ctx.save();
    ctx.globalAlpha = alpha;
    if (glow > 0) {
      ctx.shadowColor = 'rgba(255,55,35,.82)';
      ctx.shadowBlur = glow;
    }
    ctx.setTransform(dpr, 0, rect.shear / rect.h, dpr, dpr * rect.x, dpr * rect.y);
    ctx.drawImage(source, 0, 0, rect.w, rect.h);
    ctx.restore();
  }

  function drawChamber() {
    ctx.save();
    ctx.strokeStyle = 'rgba(140,18,13,.2)';
    ctx.lineWidth = 1;
    const margin = 22;
    ctx.strokeRect(margin, margin, width-margin*2, height-margin*2);
    for (let index = 1; index < 7; index += 1) {
      const n = index / 7;
      const inset = margin + n * Math.min(width, height) * .12;
      ctx.globalAlpha = 1 - n * .11;
      ctx.strokeRect(inset, inset*.72, width-inset*2, height-inset*1.44);
    }
    ctx.restore();
  }

  function drawReticle() {
    const x = width / 2;
    const y = height / 2;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,92,78,.88)';
    ctx.fillStyle = 'rgba(255,92,78,.9)';
    ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI*2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x-18,y); ctx.lineTo(x-5,y); ctx.moveTo(x+5,y); ctx.lineTo(x+18,y);
    ctx.moveTo(x,y-18); ctx.lineTo(x,y-5); ctx.moveTo(x,y+5); ctx.lineTo(x,y+18);
    ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, 1.5, 0, Math.PI*2); ctx.fill();
    ctx.restore();
  }

  function draw() {
    if (!active) { raf = 0; return; }
    look.x += (targetLook.x - look.x) * .13;
    look.y += (targetLook.y - look.y) * .13;
    inspection.u += (targetInspection.u - inspection.u) * .18;
    inspection.v += (targetInspection.v - inspection.v) * .18;
    currentZoom += (targetZoom - currentZoom) * .12;
    pulse *= .94;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#020202';
    ctx.fillRect(0, 0, width, height);
    drawChamber();

    if (ready) {
      if (settings.showBase) drawPlane(baseCanvas, 7.6, .2, .5 + pulse*3);
      bands.forEach((layer, index) => {
        const z = 6 - index;
        const focusDistance = Math.abs(index - settings.focus);
        const focused = Math.max(0, 1 - focusDistance / 3.2);
        drawPlane(layer, z, .2 + focused*.76, 1 + focused*11 + pulse*(7+focused*25));
      });
    }
    drawReticle();
    raf = requestAnimationFrame(draw);
  }

  function pointToImage(clientX, clientY) {
    if (!ready) return null;
    const rect = planeRect(0);
    const v = (clientY - rect.y) / Math.max(1, rect.h);
    const u = (clientX - rect.x - rect.shear * v) / Math.max(1, rect.w);
    if (u < 0 || u > 1 || v < 0 || v > 1) return null;
    return { u, v };
  }

  function pointerDown(event) {
    dragging = true;
    pointerId = event.pointerId;
    lastX = event.clientX;
    lastY = event.clientY;
    dragDistance = 0;
    canvas.classList.add('is-dragging');
    canvas.setPointerCapture(pointerId);
  }

  function pointerMove(event) {
    if (!dragging || event.pointerId !== pointerId) return;
    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    dragDistance += Math.hypot(dx, dy);
    targetLook.x += dx;
    targetLook.y += dy;
    lastX = event.clientX;
    lastY = event.clientY;
  }

  function pointerUp(event) {
    if (!dragging || event.pointerId !== pointerId) return;
    dragging = false;
    pointerId = null;
    canvas.classList.remove('is-dragging');
    if (dragDistance < 10) {
      const point = pointToImage(event.clientX, event.clientY);
      if (point) {
        targetInspection = point;
        targetLook = { x: 0, y: 0 };
        pulse = 1;
        setStatus(`INSPECTION POINT ${Math.round(point.u*100)} / ${Math.round(point.v*100)}`);
      }
    }
  }

  function wheel(event) {
    if (!active) return;
    event.preventDefault();
    targetZoom = Math.max(.45, Math.min(3.5, targetZoom * Math.exp(-event.deltaY * .0012)));
  }

  function setButtonState() {
    const control = button();
    if (!control) return;
    control.setAttribute('aria-pressed', String(active));
    control.textContent = active ? 'Range On' : 'Range Off';
  }

  function enable(source) {
    mount();
    if (source || !image) load(source || DEFAULT_SOURCE);
    active = true;
    document.documentElement.classList.add(ROOT_CLASS);
    setButtonState();
    if (!raf) raf = requestAnimationFrame(draw);
  }

  function disable() {
    active = false;
    document.documentElement.classList.remove(ROOT_CLASS);
    setButtonState();
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  function toggle() {
    active ? disable() : enable();
  }

  function configure(options = {}) {
    Object.assign(settings, options);
    if (Number.isFinite(options.zoom)) {
      targetZoom = options.zoom;
      currentZoom = options.zoom;
    }
    if (ready && ('softness' in options || 'recolour' in options)) buildBands();
  }

  document.addEventListener('click', event => {
    if (event.target.closest('#heuristic-rangefinder-toggle')) toggle();
  });

  return { enable, disable, toggle, load, configure, settings };
})();
