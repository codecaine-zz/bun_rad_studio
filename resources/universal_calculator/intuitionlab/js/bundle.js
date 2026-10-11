// resources/universal_calculator/intuitionlab/js/canvas-utils.js
var COLORS = {
  bgDark: "#070a12",
  cardBg: "rgba(15, 23, 42, 0.65)",
  gridMinor: "rgba(255, 255, 255, 0.04)",
  gridMajor: "rgba(255, 255, 255, 0.12)",
  axis: "rgba(255, 255, 255, 0.35)",
  axisText: "rgba(255, 255, 255, 0.55)",
  cyan: "#06b6d4",
  cyanGlow: "rgba(6, 182, 212, 0.45)",
  rose: "#f43f5e",
  roseGlow: "rgba(244, 63, 94, 0.45)",
  emerald: "#10b981",
  emeraldGlow: "rgba(16, 185, 129, 0.45)",
  amber: "#f59e0b",
  amberGlow: "rgba(245, 158, 11, 0.45)",
  violet: "#8b5cf6",
  violetGlow: "rgba(139, 92, 246, 0.45)",
  blue: "#3b82f6",
  blueGlow: "rgba(59, 130, 246, 0.45)",
  white: "#ffffff",
  textDim: "#94a3b8"
};

class HiDPICanvas {
  constructor(canvas, onResize = null) {
    this.canvas = typeof canvas === "string" ? document.querySelector(canvas) : canvas;
    if (!this.canvas)
      throw new Error("Canvas element not found");
    this.ctx = this.canvas.getContext("2d", { alpha: true });
    this.onResize = onResize;
    this.dpr = window.devicePixelRatio || 1;
    this.logicalWidth = 0;
    this.logicalHeight = 0;
    this.initResizeObserver();
    this.resize();
  }
  initResizeObserver() {
    this.resizeObserver = new ResizeObserver(() => {
      this.resize();
      if (this.onResize)
        this.onResize(this.logicalWidth, this.logicalHeight);
    });
    this.resizeObserver.observe(this.canvas.parentElement || this.canvas);
    window.addEventListener("resize", () => {
      this.dpr = window.devicePixelRatio || 1;
      this.resize();
      if (this.onResize)
        this.onResize(this.logicalWidth, this.logicalHeight);
    });
  }
  resize(customWidth = null, customHeight = null) {
    const rect = this.canvas.getBoundingClientRect();
    const displayWidth = Math.max(10, Math.floor(customWidth || rect.width || this.canvas.parentElement?.clientWidth || 600));
    const displayHeight = Math.max(10, Math.floor(customHeight || rect.height || this.canvas.parentElement?.clientHeight || 400));
    this.logicalWidth = displayWidth;
    this.logicalHeight = displayHeight;
    this.dpr = window.devicePixelRatio || 1;
    const bufferWidth = Math.round(displayWidth * this.dpr);
    const bufferHeight = Math.round(displayHeight * this.dpr);
    if (this.canvas.width !== bufferWidth || this.canvas.height !== bufferHeight) {
      this.canvas.width = bufferWidth;
      this.canvas.height = bufferHeight;
    }
    this.canvas.style.width = "100%";
    this.canvas.style.height = "100%";
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(this.dpr, this.dpr);
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = "high";
  }
  clear() {
    this.ctx.save();
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.restore();
  }
}

class CoordinateSystem {
  constructor(canvasUtil, options = {}) {
    this.cu = canvasUtil;
    this.options = Object.assign({
      originRatioX: 0.5,
      originRatioY: 0.5,
      unitsPerPixelX: 0.02,
      unitsPerPixelY: 0.02,
      xStep: 1,
      yStep: 1,
      minorSubdivisions: 5,
      showMinorGrid: true,
      showMajorGrid: true,
      showAxes: true,
      showLabels: true,
      xLabel: "x",
      yLabel: "y",
      padding: 30
    }, options);
    this.originX = 0;
    this.originY = 0;
    this.updateOrigin();
  }
  updateOrigin() {
    this.originX = this.cu.logicalWidth * this.options.originRatioX;
    this.originY = this.cu.logicalHeight * this.options.originRatioY;
  }
  setUnitsPerPixel(ux, uy = null) {
    this.options.unitsPerPixelX = ux;
    this.options.unitsPerPixelY = uy === null ? ux : uy;
  }
  setDomain(xMin, xMax, yMin = null, yMax = null) {
    const availableW = this.cu.logicalWidth - this.options.padding * 2;
    const spanX = xMax - xMin;
    this.options.unitsPerPixelX = spanX / availableW;
    this.originX = this.options.padding - xMin / this.options.unitsPerPixelX;
    if (yMin !== null && yMax !== null) {
      const availableH = this.cu.logicalHeight - this.options.padding * 2;
      const spanY = yMax - yMin;
      this.options.unitsPerPixelY = spanY / availableH;
      this.originY = this.cu.logicalHeight - this.options.padding + yMin / this.options.unitsPerPixelY;
    }
  }
  toScreenX(mathX) {
    return this.originX + mathX / this.options.unitsPerPixelX;
  }
  toScreenY(mathY) {
    return this.originY - mathY / this.options.unitsPerPixelY;
  }
  toMathX(screenX) {
    return (screenX - this.originX) * this.options.unitsPerPixelX;
  }
  toMathY(screenY) {
    return (this.originY - screenY) * this.options.unitsPerPixelY;
  }
  toScreenDist(mathDist) {
    return mathDist / this.options.unitsPerPixelX;
  }
  toMathDist(screenDist) {
    return screenDist * this.options.unitsPerPixelX;
  }
  getBounds() {
    return {
      xMin: this.toMathX(0),
      xMax: this.toMathX(this.cu.logicalWidth),
      yMin: this.toMathY(this.cu.logicalHeight),
      yMax: this.toMathY(0)
    };
  }
  drawGrid() {
    const ctx = this.cu.ctx;
    const w = this.cu.logicalWidth;
    const h = this.cu.logicalHeight;
    this.updateOrigin();
    const bounds = this.getBounds();
    const stepX = this.options.xStep;
    const stepY = this.options.yStep;
    const minorStepX = stepX / this.options.minorSubdivisions;
    const minorStepY = stepY / this.options.minorSubdivisions;
    if (this.options.showMinorGrid) {
      ctx.beginPath();
      ctx.strokeStyle = COLORS.gridMinor;
      ctx.lineWidth = 1;
      const firstMinorX = Math.floor(bounds.xMin / minorStepX) * minorStepX;
      for (let x = firstMinorX;x <= bounds.xMax; x += minorStepX) {
        const sx = Math.round(this.toScreenX(x)) + 0.5;
        ctx.moveTo(sx, 0);
        ctx.lineTo(sx, h);
      }
      const firstMinorY = Math.floor(bounds.yMin / minorStepY) * minorStepY;
      for (let y = firstMinorY;y <= bounds.yMax; y += minorStepY) {
        const sy = Math.round(this.toScreenY(y)) + 0.5;
        ctx.moveTo(0, sy);
        ctx.lineTo(w, sy);
      }
      ctx.stroke();
    }
    if (this.options.showMajorGrid) {
      ctx.beginPath();
      ctx.strokeStyle = COLORS.gridMajor;
      ctx.lineWidth = 1;
      const firstMajorX = Math.floor(bounds.xMin / stepX) * stepX;
      for (let x = firstMajorX;x <= bounds.xMax; x += stepX) {
        if (Math.abs(x) < 0.000001)
          continue;
        const sx = Math.round(this.toScreenX(x)) + 0.5;
        ctx.moveTo(sx, 0);
        ctx.lineTo(sx, h);
      }
      const firstMajorY = Math.floor(bounds.yMin / stepY) * stepY;
      for (let y = firstMajorY;y <= bounds.yMax; y += stepY) {
        if (Math.abs(y) < 0.000001)
          continue;
        const sy = Math.round(this.toScreenY(y)) + 0.5;
        ctx.moveTo(0, sy);
        ctx.lineTo(w, sy);
      }
      ctx.stroke();
    }
    if (this.options.showAxes) {
      ctx.save();
      ctx.strokeStyle = COLORS.axis;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      if (this.originY >= 0 && this.originY <= h) {
        const sy = Math.round(this.originY) + 0.5;
        ctx.moveTo(0, sy);
        ctx.lineTo(w, sy);
      }
      if (this.originX >= 0 && this.originX <= w) {
        const sx = Math.round(this.originX) + 0.5;
        ctx.moveTo(sx, 0);
        ctx.lineTo(sx, h);
      }
      ctx.stroke();
      if (this.options.showLabels) {
        ctx.fillStyle = COLORS.axisText;
        ctx.font = "10px Inter, system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        const firstMajorX = Math.floor(bounds.xMin / stepX) * stepX;
        for (let x = firstMajorX;x <= bounds.xMax; x += stepX) {
          if (Math.abs(x) < 0.000001)
            continue;
          const sx = this.toScreenX(x);
          const sy = Math.max(14, Math.min(h - 18, this.originY + 6));
          const label = Number(x.toFixed(2)).toString();
          ctx.fillText(label, sx, sy);
        }
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        const firstMajorY = Math.floor(bounds.yMin / stepY) * stepY;
        for (let y = firstMajorY;y <= bounds.yMax; y += stepY) {
          if (Math.abs(y) < 0.000001)
            continue;
          const sy = this.toScreenY(y);
          const sx = Math.max(28, Math.min(w - 10, this.originX - 6));
          const label = Number(y.toFixed(2)).toString();
          ctx.fillText(label, sx, sy);
        }
        if (this.originX >= 0 && this.originX <= w && this.originY >= 0 && this.originY <= h) {
          ctx.textAlign = "right";
          ctx.textBaseline = "top";
          ctx.fillText("0", this.originX - 6, this.originY + 6);
        }
      }
      ctx.restore();
    }
  }
}
function drawVector(ctx, fromX, fromY, toX, toY, options = {}) {
  const opts = Object.assign({
    color: COLORS.cyan,
    glowColor: COLORS.cyanGlow,
    lineWidth: 2.5,
    arrowSize: 10,
    label: null,
    badgeOffset: 16,
    badgeBg: "rgba(7, 10, 18, 0.88)",
    badgeBorder: "rgba(255, 255, 255, 0.2)",
    dashed: false,
    dashPattern: [4, 4]
  }, options);
  const dx = toX - fromX;
  const dy = toY - fromY;
  const len = Math.hypot(dx, dy);
  if (len < 1)
    return;
  const angle = Math.atan2(dy, dx);
  const arrowLen = Math.min(opts.arrowSize, len * 0.4);
  ctx.save();
  if (opts.glowColor) {
    ctx.shadowColor = opts.glowColor;
    ctx.shadowBlur = 8;
  }
  ctx.strokeStyle = opts.color;
  ctx.fillStyle = opts.color;
  ctx.lineWidth = opts.lineWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (opts.dashed) {
    ctx.setLineDash(opts.dashPattern);
  } else {
    ctx.setLineDash([]);
  }
  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  const shaftEndX = toX - Math.cos(angle) * (arrowLen * 0.6);
  const shaftEndY = toY - Math.sin(angle) * (arrowLen * 0.6);
  ctx.lineTo(shaftEndX, shaftEndY);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(toX, toY);
  ctx.lineTo(toX - arrowLen * Math.cos(angle - Math.PI / 6), toY - arrowLen * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(toX - arrowLen * 0.6 * Math.cos(angle), toY - arrowLen * 0.6 * Math.sin(angle));
  ctx.lineTo(toX - arrowLen * Math.cos(angle + Math.PI / 6), toY - arrowLen * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
  if (opts.label) {
    ctx.shadowBlur = 0;
    const midX = (fromX + toX) / 2;
    const midY = (fromY + toY) / 2;
    const nx = -dy / len;
    const ny = dx / len;
    const badgeX = midX + nx * opts.badgeOffset;
    const badgeY = midY + ny * opts.badgeOffset;
    ctx.font = "bold 11px Inter, system-ui, sans-serif";
    const textMetrics = ctx.measureText(opts.label);
    const paddingH = 7;
    const paddingV = 4;
    const badgeW = textMetrics.width + paddingH * 2;
    const badgeH = 18;
    const bx = badgeX - badgeW / 2;
    const by = badgeY - badgeH / 2;
    const radius = 9;
    ctx.fillStyle = opts.badgeBg;
    ctx.strokeStyle = opts.badgeBorder || opts.color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(bx, by, badgeW, badgeH, radius);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = opts.color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(opts.label, badgeX, badgeY + 0.5);
  }
  ctx.restore();
}

class DraggableHandle {
  constructor(x, y, options = {}) {
    this.x = x;
    this.y = y;
    this.options = Object.assign({
      radius: 8,
      hitRadius: 22,
      color: COLORS.cyan,
      glowColor: COLORS.cyanGlow,
      label: "",
      pulse: true,
      cursor: "grab",
      activeCursor: "grabbing",
      constrain: null
    }, options);
    this.isHovered = false;
    this.isDragging = false;
    this.pulsePhase = Math.random() * Math.PI * 2;
  }
  contains(px, py) {
    const dist = Math.hypot(px - this.x, py - this.y);
    return dist <= this.options.hitRadius;
  }
  moveTo(nx, ny) {
    if (this.options.constrain) {
      const constrained = this.options.constrain(nx, ny);
      this.x = constrained.x;
      this.y = constrained.y;
    } else {
      this.x = nx;
      this.y = ny;
    }
  }
  draw(ctx, time = 0) {
    ctx.save();
    const r = this.options.radius;
    const pulse = this.options.pulse ? Math.sin(time * 3 + this.pulsePhase) * 2 : 0;
    const currentR = this.isDragging ? r + 3 : this.isHovered ? r + 1.5 : r;
    ctx.shadowColor = this.options.glowColor;
    ctx.shadowBlur = this.isDragging ? 18 : this.isHovered ? 12 : 8;
    ctx.beginPath();
    ctx.arc(this.x, this.y, currentR + 4 + pulse, 0, Math.PI * 2);
    ctx.fillStyle = this.options.glowColor;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(this.x, this.y, currentR, 0, Math.PI * 2);
    ctx.fillStyle = this.isDragging ? "#ffffff" : this.options.color;
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.stroke();
    if (this.options.label) {
      ctx.shadowBlur = 0;
      ctx.font = "600 11px Inter, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillStyle = "#ffffff";
      ctx.fillText(this.options.label, this.x, this.y - currentR - 6);
    }
    ctx.restore();
  }
}

class HandleController {
  constructor(canvas, handles = [], onChange = null) {
    this.canvas = typeof canvas === "string" ? document.querySelector(canvas) : canvas;
    this.handles = handles;
    this.onChange = onChange;
    this.activeHandle = null;
    this.dragOffset = { x: 0, y: 0 };
    this.boundDown = this.onDown.bind(this);
    this.boundMove = this.onMove.bind(this);
    this.boundUp = this.onUp.bind(this);
    this.canvas.addEventListener("mousedown", this.boundDown);
    window.addEventListener("mousemove", this.boundMove);
    window.addEventListener("mouseup", this.boundUp);
    this.canvas.addEventListener("touchstart", this.boundDown, { passive: false });
    window.addEventListener("touchmove", this.boundMove, { passive: false });
    window.addEventListener("touchend", this.boundUp);
    window.addEventListener("touchcancel", this.boundUp);
  }
  addHandle(handle) {
    this.handles.push(handle);
  }
  removeHandle(handle) {
    const idx = this.handles.indexOf(handle);
    if (idx !== -1)
      this.handles.splice(idx, 1);
  }
  getPos(e) {
    const rect = this.canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  }
  onDown(e) {
    const pos = this.getPos(e);
    for (let i = this.handles.length - 1;i >= 0; i--) {
      const h = this.handles[i];
      if (h.contains(pos.x, pos.y)) {
        if (e.cancelable)
          e.preventDefault();
        this.activeHandle = h;
        h.isDragging = true;
        this.dragOffset = { x: h.x - pos.x, y: h.y - pos.y };
        this.canvas.style.cursor = h.options.activeCursor || "grabbing";
        if (soundSynth)
          soundSynth.playClick(600, 0.05);
        if (this.onChange)
          this.onChange(h, "start");
        break;
      }
    }
  }
  onMove(e) {
    const pos = this.getPos(e);
    if (this.activeHandle) {
      if (e.cancelable)
        e.preventDefault();
      this.activeHandle.moveTo(pos.x + this.dragOffset.x, pos.y + this.dragOffset.y);
      if (this.onChange)
        this.onChange(this.activeHandle, "drag");
      return;
    }
    let foundHover = false;
    for (const h of this.handles) {
      const inside = h.contains(pos.x, pos.y);
      h.isHovered = inside;
      if (inside && !foundHover) {
        foundHover = true;
        this.canvas.style.cursor = h.options.cursor || "grab";
      }
    }
    if (!foundHover) {
      this.canvas.style.cursor = "default";
    }
  }
  onUp() {
    if (this.activeHandle) {
      this.activeHandle.isDragging = false;
      if (this.onChange)
        this.onChange(this.activeHandle, "end");
      this.activeHandle = null;
      this.canvas.style.cursor = "default";
    }
  }
  destroy() {
    this.canvas.removeEventListener("mousedown", this.boundDown);
    window.removeEventListener("mousemove", this.boundMove);
    window.removeEventListener("mouseup", this.boundUp);
    this.canvas.removeEventListener("touchstart", this.boundDown);
    window.removeEventListener("touchmove", this.boundMove);
    window.removeEventListener("touchend", this.boundUp);
    window.removeEventListener("touchcancel", this.boundUp);
  }
}

class SoundSynthesizer {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }
  init() {
    if (!this.ctx && typeof window !== "undefined") {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext)
        this.ctx = new AudioContext;
    }
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume();
    }
  }
  playClick(freq = 520, duration = 0.04) {
    if (this.muted)
      return;
    this.init();
    if (!this.ctx)
      return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.4, this.ctx.currentTime + duration);
      gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch (_) {}
  }
  playSuccess() {
    if (this.muted)
      return;
    this.init();
    if (!this.ctx)
      return;
    try {
      const now = this.ctx.currentTime;
      [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = "triangle";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.05, now + i * 0.07);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.07 + 0.18);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now + i * 0.07);
        osc.stop(now + i * 0.07 + 0.18);
      });
    } catch (_) {}
  }
}
var soundSynth = new SoundSynthesizer;

// resources/universal_calculator/intuitionlab/js/calculus.js
class CalculusLab {
  constructor() {
    this.activeSub = "derivatives";
    this.animFrame = null;
    this.time = 0;
    this.derivState = {
      fnKey: "cubic",
      x0: 1.2,
      dx: 1.5,
      targetDx: 1.5,
      isLimiting: false,
      limitProgress: 0,
      zoom: 1
    };
    this.riemannState = {
      fnKey: "parabola",
      a: -1.5,
      b: 2,
      n: 12,
      rule: "midpoint",
      meltProgress: 0,
      isMelting: false
    };
    this.ftcState = {
      fnKey: "poly",
      x: 1.6,
      minX: -2.5,
      maxX: 3.5
    };
    this.gdState = {
      preset: "bowl",
      ballX: 2.2,
      ballY: 1.8,
      vx: 0,
      vy: 0,
      lr: 0.08,
      momentum: 0.85,
      running: false,
      trail: [],
      lossHistory: []
    };
    this.functions = {
      cubic: {
        label: "Cubic: f(x) = x³ - 3x",
        f: (x) => x * x * x - 3 * x,
        df: (x) => 3 * x * x - 3,
        formula: "f(x) = x^3 - 3x",
        dFormula: "f'(x) = 3x^2 - 3"
      },
      sine: {
        label: "Sine Wave: f(x) = 2 sin(x)",
        f: (x) => 2 * Math.sin(x),
        df: (x) => 2 * Math.cos(x),
        formula: "f(x) = 2\\sin(x)",
        dFormula: "f'(x) = 2\\cos(x)"
      },
      parabola: {
        label: "Parabola: f(x) = 0.5x² - 1",
        f: (x) => 0.5 * x * x - 1,
        df: (x) => x,
        formula: "f(x) = 0.5x^2 - 1",
        dFormula: "f'(x) = x"
      },
      gaussian: {
        label: "Gaussian: f(x) = 3 e^(-x²)",
        f: (x) => 3 * Math.exp(-x * x),
        df: (x) => -6 * x * Math.exp(-x * x),
        formula: "f(x) = 3e^{-x^2}",
        dFormula: "f'(x) = -6x e^{-x^2}"
      }
    };
    this.potentialSurfaces = {
      bowl: {
        f: (x, y) => 0.5 * (x * x + 2 * y * y),
        grad: (x, y) => ({ dx: x, dy: 2 * y }),
        name: "Elliptic Bowl f(x,y) = 0.5(x² + 2y²)"
      },
      saddle: {
        f: (x, y) => 0.5 * (x * x - y * y),
        grad: (x, y) => ({ dx: x, dy: -y }),
        name: "Saddle Surface f(x,y) = 0.5(x² - y²)"
      },
      doublewell: {
        f: (x, y) => 0.3 * (x * x * x * x - 3 * x * x + y * y + 2),
        grad: (x, y) => ({ dx: 0.3 * (4 * x * x * x - 6 * x), dy: 0.6 * y }),
        name: "Double-Well Potential"
      },
      rosenbrock: {
        f: (x, y) => 0.1 * ((1 - x) ** 2 + 10 * (y - x * x) ** 2),
        grad: (x, y) => ({
          dx: 0.1 * (-2 * (1 - x) - 40 * x * (y - x * x)),
          dy: 0.1 * (20 * (y - x * x))
        }),
        name: "Rosenbrock Banana Valley"
      }
    };
  }
  init() {
    this.initDerivatives();
    this.initRiemann();
    this.initFTC();
    this.initGradientDescent();
    this.startLoop();
  }
  initDerivatives() {
    const topCanvas = document.getElementById("derivMainCanvas");
    const botCanvas = document.getElementById("derivTraceCanvas");
    if (!topCanvas || !botCanvas)
      return;
    this.derivTopCu = new HiDPICanvas(topCanvas);
    this.derivBotCu = new HiDPICanvas(botCanvas);
    this.derivTopCoord = new CoordinateSystem(this.derivTopCu, {
      originRatioX: 0.5,
      originRatioY: 0.5,
      unitsPerPixelX: 0.015,
      unitsPerPixelY: 0.015,
      xStep: 1,
      yStep: 1
    });
    this.derivBotCoord = new CoordinateSystem(this.derivBotCu, {
      originRatioX: 0.5,
      originRatioY: 0.5,
      unitsPerPixelX: 0.015,
      unitsPerPixelY: 0.015,
      xStep: 1,
      yStep: 2
    });
    this.derivH1 = new DraggableHandle(0, 0, {
      color: COLORS.cyan,
      glowColor: COLORS.cyanGlow,
      label: "x₀",
      constrain: (nx, ny) => {
        const mathX = this.derivTopCoord.toMathX(nx);
        const clampedX = Math.max(-3.5, Math.min(3.5, mathX));
        this.derivState.x0 = clampedX;
        const fn = this.functions[this.derivState.fnKey].f;
        return {
          x: this.derivTopCoord.toScreenX(clampedX),
          y: this.derivTopCoord.toScreenY(fn(clampedX))
        };
      }
    });
    this.derivH2 = new DraggableHandle(0, 0, {
      color: COLORS.rose,
      glowColor: COLORS.roseGlow,
      label: "x₀+Δx",
      constrain: (nx, ny) => {
        const mathX = this.derivTopCoord.toMathX(nx);
        let newDx = mathX - this.derivState.x0;
        if (Math.abs(newDx) < 0.05)
          newDx = newDx >= 0 ? 0.05 : -0.05;
        this.derivState.dx = Math.max(-3, Math.min(3, newDx));
        const fn = this.functions[this.derivState.fnKey].f;
        const curX2 = this.derivState.x0 + this.derivState.dx;
        return {
          x: this.derivTopCoord.toScreenX(curX2),
          y: this.derivTopCoord.toScreenY(fn(curX2))
        };
      }
    });
    this.derivController = new HandleController(topCanvas, [this.derivH1, this.derivH2], () => {
      this.updateDerivUI();
    });
    this.updateDerivHandlePositions();
    this.bindDerivControls();
    this.updateDerivUI();
  }
  updateDerivHandlePositions() {
    const fn = this.functions[this.derivState.fnKey].f;
    const x1 = this.derivState.x0;
    const x2 = this.derivState.x0 + this.derivState.dx;
    this.derivH1.x = this.derivTopCoord.toScreenX(x1);
    this.derivH1.y = this.derivTopCoord.toScreenY(fn(x1));
    this.derivH2.x = this.derivTopCoord.toScreenX(x2);
    this.derivH2.y = this.derivTopCoord.toScreenY(fn(x2));
  }
  bindDerivControls() {
    const select = document.getElementById("derivFnSelect");
    if (select) {
      select.addEventListener("change", (e) => {
        this.derivState.fnKey = e.target.value;
        this.updateDerivHandlePositions();
        this.updateDerivUI();
      });
    }
    const dxSlider = document.getElementById("derivDxSlider");
    if (dxSlider) {
      dxSlider.addEventListener("input", (e) => {
        this.derivState.dx = parseFloat(e.target.value);
        this.updateDerivHandlePositions();
        this.updateDerivUI();
      });
    }
    const limitBtn = document.getElementById("derivLimitBtn");
    if (limitBtn) {
      limitBtn.addEventListener("click", () => {
        this.triggerLimitAnimation();
      });
    }
    const resetBtn = document.getElementById("derivResetBtn");
    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        this.derivState.dx = 1.5;
        this.derivState.x0 = 1;
        this.updateDerivHandlePositions();
        this.updateDerivUI();
        soundSynth.playClick(440, 0.05);
      });
    }
  }
  triggerLimitAnimation() {
    if (this.derivState.isLimiting)
      return;
    this.derivState.isLimiting = true;
    this.derivState.limitProgress = 0;
    this.derivState.startDx = this.derivState.dx;
    soundSynth.playSuccess();
  }
  updateDerivUI() {
    const fnObj = this.functions[this.derivState.fnKey];
    const x0 = this.derivState.x0;
    const dx = this.derivState.dx;
    const y0 = fnObj.f(x0);
    const y1 = fnObj.f(x0 + dx);
    const secantSlope = (y1 - y0) / dx;
    const tangentSlope = fnObj.df(x0);
    const dxValEl = document.getElementById("derivDxVal");
    if (dxValEl)
      dxValEl.textContent = dx.toFixed(3);
    const secSlopeEl = document.getElementById("derivSecSlope");
    if (secSlopeEl)
      secSlopeEl.textContent = secantSlope.toFixed(4);
    const tanSlopeEl = document.getElementById("derivTanSlope");
    if (tanSlopeEl)
      tanSlopeEl.textContent = tangentSlope.toFixed(4);
    const diffEl = document.getElementById("derivSlopeDiff");
    if (diffEl) {
      const err = Math.abs(secantSlope - tangentSlope);
      diffEl.textContent = err < 0.0001 ? "0.0000 (Exact Tangent!)" : err.toFixed(4);
    }
    const mathFormulaEl = document.getElementById("derivMathFormula");
    if (mathFormulaEl && window.katex) {
      try {
        window.katex.render(`f'(${x0.toFixed(2)}) = \\lim_{\\Delta x \\to 0} \\frac{f(${x0.toFixed(2)}+\\Delta x) - f(${x0.toFixed(2)})}{\\Delta x} = ${tangentSlope.toFixed(3)}`, mathFormulaEl, { displayMode: false, throwOnError: false });
      } catch (_) {}
    }
  }
  renderDerivatives(dt) {
    if (!this.derivTopCu || !this.derivBotCu)
      return;
    if (this.derivState.isLimiting) {
      this.derivState.limitProgress += dt * 1.5;
      if (this.derivState.limitProgress >= 1) {
        this.derivState.isLimiting = false;
        this.derivState.dx = 0.001;
      } else {
        const ease = (t) => t * t * (3 - 2 * t);
        const t = ease(this.derivState.limitProgress);
        this.derivState.dx = this.derivState.startDx * (1 - t) + 0.001 * t;
      }
      this.updateDerivHandlePositions();
      this.updateDerivUI();
    }
    const fnObj = this.functions[this.derivState.fnKey];
    const ctxTop = this.derivTopCu.ctx;
    const coordTop = this.derivTopCoord;
    this.derivTopCu.clear();
    coordTop.drawGrid();
    const bounds = coordTop.getBounds();
    ctxTop.save();
    ctxTop.strokeStyle = COLORS.cyan;
    ctxTop.lineWidth = 3;
    ctxTop.shadowColor = COLORS.cyanGlow;
    ctxTop.shadowBlur = 10;
    ctxTop.beginPath();
    const step = (bounds.xMax - bounds.xMin) / 300;
    let started = false;
    for (let x = bounds.xMin;x <= bounds.xMax; x += step) {
      const y = fnObj.f(x);
      const sx = coordTop.toScreenX(x);
      const sy = coordTop.toScreenY(y);
      if (!started) {
        ctxTop.moveTo(sx, sy);
        started = true;
      } else {
        ctxTop.lineTo(sx, sy);
      }
    }
    ctxTop.stroke();
    ctxTop.restore();
    const x0 = this.derivState.x0;
    const dx = this.derivState.dx;
    const x1 = x0 + dx;
    const y0 = fnObj.f(x0);
    const y1 = fnObj.f(x1);
    const secSlope = (y1 - y0) / dx;
    const tanSlope = fnObj.df(x0);
    const sx0 = coordTop.toScreenX(x0);
    const sy0 = coordTop.toScreenY(y0);
    const sx1 = coordTop.toScreenX(x1);
    const sy1 = coordTop.toScreenY(y1);
    const sxCorner = coordTop.toScreenX(x1);
    const syCorner = coordTop.toScreenY(y0);
    ctxTop.save();
    ctxTop.fillStyle = "rgba(244, 63, 94, 0.12)";
    ctxTop.beginPath();
    ctxTop.moveTo(sx0, sy0);
    ctxTop.lineTo(sxCorner, syCorner);
    ctxTop.lineTo(sx1, sy1);
    ctxTop.closePath();
    ctxTop.fill();
    ctxTop.strokeStyle = COLORS.amber;
    ctxTop.lineWidth = 2;
    ctxTop.setLineDash([4, 3]);
    ctxTop.beginPath();
    ctxTop.moveTo(sx0, sy0);
    ctxTop.lineTo(sxCorner, syCorner);
    ctxTop.stroke();
    ctxTop.strokeStyle = COLORS.rose;
    ctxTop.beginPath();
    ctxTop.moveTo(sxCorner, syCorner);
    ctxTop.lineTo(sx1, sy1);
    ctxTop.stroke();
    ctxTop.setLineDash([]);
    ctxTop.font = "bold 11px Inter, system-ui, sans-serif";
    ctxTop.textAlign = "center";
    ctxTop.textBaseline = "top";
    ctxTop.fillStyle = COLORS.amber;
    ctxTop.fillText(`Δx = ${dx.toFixed(2)}`, (sx0 + sxCorner) / 2, syCorner + 6);
    ctxTop.textAlign = "left";
    ctxTop.textBaseline = "middle";
    ctxTop.fillStyle = COLORS.rose;
    ctxTop.fillText(`Δy = ${(y1 - y0).toFixed(2)}`, sxCorner + 6, (syCorner + sy1) / 2);
    ctxTop.restore();
    ctxTop.save();
    ctxTop.strokeStyle = "rgba(244, 63, 94, 0.7)";
    ctxTop.lineWidth = 1.8;
    ctxTop.setLineDash([6, 4]);
    ctxTop.beginPath();
    const secYLeft = y0 + secSlope * (bounds.xMin - x0);
    const secYRight = y0 + secSlope * (bounds.xMax - x0);
    ctxTop.moveTo(coordTop.toScreenX(bounds.xMin), coordTop.toScreenY(secYLeft));
    ctxTop.lineTo(coordTop.toScreenX(bounds.xMax), coordTop.toScreenY(secYRight));
    ctxTop.stroke();
    ctxTop.restore();
    ctxTop.save();
    ctxTop.strokeStyle = COLORS.emerald;
    ctxTop.lineWidth = 2.5;
    ctxTop.shadowColor = COLORS.emeraldGlow;
    ctxTop.shadowBlur = 8;
    ctxTop.beginPath();
    const tanYLeft = y0 + tanSlope * (bounds.xMin - x0);
    const tanYRight = y0 + tanSlope * (bounds.xMax - x0);
    ctxTop.moveTo(coordTop.toScreenX(bounds.xMin), coordTop.toScreenY(tanYLeft));
    ctxTop.lineTo(coordTop.toScreenX(bounds.xMax), coordTop.toScreenY(tanYRight));
    ctxTop.stroke();
    ctxTop.restore();
    if (!this.derivH1.isDragging) {
      this.derivH1.x = sx0;
      this.derivH1.y = sy0;
    }
    if (!this.derivH2.isDragging) {
      this.derivH2.x = sx1;
      this.derivH2.y = sy1;
    }
    this.derivH1.draw(ctxTop, this.time);
    this.derivH2.draw(ctxTop, this.time);
    const ctxBot = this.derivBotCu.ctx;
    const coordBot = this.derivBotCoord;
    this.derivBotCu.clear();
    coordBot.drawGrid();
    const botBounds = coordBot.getBounds();
    ctxBot.save();
    ctxBot.strokeStyle = COLORS.violet;
    ctxBot.lineWidth = 3;
    ctxBot.shadowColor = COLORS.violetGlow;
    ctxBot.shadowBlur = 8;
    ctxBot.beginPath();
    started = false;
    const botStep = (botBounds.xMax - botBounds.xMin) / 300;
    for (let x = botBounds.xMin;x <= botBounds.xMax; x += botStep) {
      const dy = fnObj.df(x);
      const sx = coordBot.toScreenX(x);
      const sy = coordBot.toScreenY(dy);
      if (!started) {
        ctxBot.moveTo(sx, sy);
        started = true;
      } else {
        ctxBot.lineTo(sx, sy);
      }
    }
    ctxBot.stroke();
    ctxBot.restore();
    const sBotX = coordBot.toScreenX(x0);
    const sBotY = coordBot.toScreenY(tanSlope);
    ctxBot.save();
    ctxBot.strokeStyle = "rgba(255, 255, 255, 0.2)";
    ctxBot.setLineDash([4, 4]);
    ctxBot.beginPath();
    ctxBot.moveTo(sBotX, coordBot.toScreenY(0));
    ctxBot.lineTo(sBotX, sBotY);
    ctxBot.stroke();
    ctxBot.shadowColor = COLORS.emeraldGlow;
    ctxBot.shadowBlur = 14;
    ctxBot.fillStyle = COLORS.emerald;
    ctxBot.beginPath();
    ctxBot.arc(sBotX, sBotY, 7, 0, Math.PI * 2);
    ctxBot.fill();
    ctxBot.strokeStyle = "#ffffff";
    ctxBot.lineWidth = 2;
    ctxBot.stroke();
    ctxBot.shadowBlur = 0;
    ctxBot.font = "bold 11px Inter, system-ui, sans-serif";
    ctxBot.fillStyle = "#ffffff";
    ctxBot.textAlign = "left";
    ctxBot.fillText(`f'(${x0.toFixed(2)}) = ${tanSlope.toFixed(2)}`, sBotX + 10, sBotY);
    ctxBot.restore();
  }
  initRiemann() {
    const canvas = document.getElementById("riemannCanvas");
    if (!canvas)
      return;
    this.riemannCu = new HiDPICanvas(canvas);
    this.riemannCoord = new CoordinateSystem(this.riemannCu, {
      originRatioX: 0.45,
      originRatioY: 0.65,
      unitsPerPixelX: 0.015,
      unitsPerPixelY: 0.015,
      xStep: 1,
      yStep: 1
    });
    this.riemannHa = new DraggableHandle(0, 0, {
      color: COLORS.amber,
      glowColor: COLORS.amberGlow,
      label: "a",
      constrain: (nx, ny) => {
        const mathX = this.riemannCoord.toMathX(nx);
        const clamped = Math.max(-4, Math.min(this.riemannState.b - 0.2, mathX));
        this.riemannState.a = clamped;
        return {
          x: this.riemannCoord.toScreenX(clamped),
          y: this.riemannCoord.toScreenY(0)
        };
      }
    });
    this.riemannHb = new DraggableHandle(0, 0, {
      color: COLORS.cyan,
      glowColor: COLORS.cyanGlow,
      label: "b",
      constrain: (nx, ny) => {
        const mathX = this.riemannCoord.toMathX(nx);
        const clamped = Math.max(this.riemannState.a + 0.2, Math.min(4, mathX));
        this.riemannState.b = clamped;
        return {
          x: this.riemannCoord.toScreenX(clamped),
          y: this.riemannCoord.toScreenY(0)
        };
      }
    });
    this.riemannController = new HandleController(canvas, [this.riemannHa, this.riemannHb], () => {
      this.updateRiemannUI();
    });
    this.updateRiemannHandles();
    this.bindRiemannControls();
    this.updateRiemannUI();
  }
  updateRiemannHandles() {
    this.riemannHa.x = this.riemannCoord.toScreenX(this.riemannState.a);
    this.riemannHa.y = this.riemannCoord.toScreenY(0);
    this.riemannHb.x = this.riemannCoord.toScreenX(this.riemannState.b);
    this.riemannHb.y = this.riemannCoord.toScreenY(0);
  }
  bindRiemannControls() {
    const nSlider = document.getElementById("riemannNSlider");
    if (nSlider) {
      nSlider.addEventListener("input", (e) => {
        this.riemannState.n = parseInt(e.target.value, 10);
        this.updateRiemannUI();
      });
    }
    const ruleSelect = document.getElementById("riemannRuleSelect");
    if (ruleSelect) {
      ruleSelect.addEventListener("change", (e) => {
        this.riemannState.rule = e.target.value;
        this.updateRiemannUI();
      });
    }
    const fnSelect = document.getElementById("riemannFnSelect");
    if (fnSelect) {
      fnSelect.addEventListener("change", (e) => {
        this.riemannState.fnKey = e.target.value;
        this.updateRiemannUI();
      });
    }
    const meltBtn = document.getElementById("riemannMeltBtn");
    if (meltBtn) {
      meltBtn.addEventListener("click", () => {
        this.riemannState.isMelting = true;
        this.riemannState.meltProgress = 0;
        soundSynth.playSuccess();
      });
    }
  }
  calcExactIntegral(a, b, fn, samples = 2000) {
    const dx = (b - a) / samples;
    let sum = 0;
    for (let i = 0;i < samples; i++) {
      const x = a + (i + 0.5) * dx;
      sum += fn(x) * dx;
    }
    return sum;
  }
  updateRiemannUI() {
    const fn = this.functions[this.riemannState.fnKey].f;
    const a = this.riemannState.a;
    const b = this.riemannState.b;
    const n = this.riemannState.n;
    const rule = this.riemannState.rule;
    const dx = (b - a) / n;
    let riemannSum = 0;
    for (let i = 0;i < n; i++) {
      const xLeft = a + i * dx;
      const xRight = xLeft + dx;
      let sampleY = 0;
      if (rule === "left")
        sampleY = fn(xLeft);
      else if (rule === "right")
        sampleY = fn(xRight);
      else if (rule === "midpoint")
        sampleY = fn((xLeft + xRight) / 2);
      else if (rule === "trapezoid")
        sampleY = (fn(xLeft) + fn(xRight)) / 2;
      riemannSum += sampleY * dx;
    }
    const exact = this.calcExactIntegral(a, b, fn);
    const err = Math.abs(riemannSum - exact);
    const pctErr = Math.abs(exact) > 0.0001 ? err / Math.abs(exact) * 100 : 0;
    const nValEl = document.getElementById("riemannNVal");
    if (nValEl)
      nValEl.textContent = n;
    const sumValEl = document.getElementById("riemannSumVal");
    if (sumValEl)
      sumValEl.textContent = riemannSum.toFixed(4);
    const exactValEl = document.getElementById("riemannExactVal");
    if (exactValEl)
      exactValEl.textContent = exact.toFixed(4);
    const errValEl = document.getElementById("riemannErrVal");
    if (errValEl)
      errValEl.textContent = `${err.toFixed(4)} (${pctErr.toFixed(1)}%)`;
    const latexEl = document.getElementById("riemannLatex");
    if (latexEl && window.katex) {
      try {
        window.katex.render(`\\int_{${a.toFixed(2)}}^{${b.toFixed(2)}} f(x)\\,dx \\approx \\sum_{i=1}^{${n}} f(x_i^*)\\,\\Delta x = ${riemannSum.toFixed(3)}`, latexEl, { displayMode: false, throwOnError: false });
      } catch (_) {}
    }
  }
  renderRiemann(dt) {
    if (!this.riemannCu)
      return;
    const ctx = this.riemannCu.ctx;
    const coord = this.riemannCoord;
    if (this.riemannState.isMelting) {
      this.riemannState.meltProgress += dt * 0.8;
      if (this.riemannState.meltProgress >= 1) {
        this.riemannState.meltProgress = 1;
        this.riemannState.isMelting = false;
      }
    }
    this.riemannCu.clear();
    coord.drawGrid();
    const fn = this.functions[this.riemannState.fnKey].f;
    const a = this.riemannState.a;
    const b = this.riemannState.b;
    const n = this.riemannState.n;
    const rule = this.riemannState.rule;
    const dx = (b - a) / n;
    const melt = this.riemannState.meltProgress;
    const sZeroY = coord.toScreenY(0);
    for (let i = 0;i < n; i++) {
      const xL = a + i * dx;
      const xR = xL + dx;
      const sxL = coord.toScreenX(xL);
      const sxR = coord.toScreenX(xR);
      let sampleY = 0;
      if (rule === "left")
        sampleY = fn(xL);
      else if (rule === "right")
        sampleY = fn(xR);
      else if (rule === "midpoint")
        sampleY = fn((xL + xR) / 2);
      else if (rule === "trapezoid") {
        const yL = fn(xL);
        const yR = fn(xR);
        const syL = coord.toScreenY(yL);
        const syR = coord.toScreenY(yR);
        ctx.save();
        ctx.fillStyle = i % 2 === 0 ? "rgba(6, 182, 212, 0.22)" : "rgba(59, 130, 246, 0.18)";
        ctx.strokeStyle = COLORS.cyan;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(sxL, sZeroY);
        ctx.lineTo(sxL, syL);
        ctx.lineTo(sxR, syR);
        ctx.lineTo(sxR, sZeroY);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
        continue;
      }
      const syBar = coord.toScreenY(sampleY);
      const barH = sZeroY - syBar;
      ctx.save();
      ctx.fillStyle = i % 2 === 0 ? "rgba(6, 182, 212, 0.25)" : "rgba(139, 92, 246, 0.22)";
      ctx.strokeStyle = "rgba(6, 182, 212, 0.6)";
      ctx.lineWidth = 1;
      if (melt > 0) {
        ctx.beginPath();
        ctx.moveTo(sxL, sZeroY);
        const subSamples = 6;
        for (let s = 0;s <= subSamples; s++) {
          const subX = xL + s / subSamples * dx;
          const curveY = fn(subX);
          const interpY = sampleY * (1 - melt) + curveY * melt;
          ctx.lineTo(coord.toScreenX(subX), coord.toScreenY(interpY));
        }
        ctx.lineTo(sxR, sZeroY);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.rect(sxL, syBar, sxR - sxL, barH);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }
    const bounds = coord.getBounds();
    ctx.save();
    ctx.strokeStyle = COLORS.emerald;
    ctx.lineWidth = 3;
    ctx.shadowColor = COLORS.emeraldGlow;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    let started = false;
    const step = (bounds.xMax - bounds.xMin) / 300;
    for (let x = bounds.xMin;x <= bounds.xMax; x += step) {
      const y = fn(x);
      const sx = coord.toScreenX(x);
      const sy = coord.toScreenY(y);
      if (!started) {
        ctx.moveTo(sx, sy);
        started = true;
      } else {
        ctx.lineTo(sx, sy);
      }
    }
    ctx.stroke();
    ctx.restore();
    if (!this.riemannHa.isDragging) {
      this.riemannHa.x = coord.toScreenX(a);
      this.riemannHa.y = sZeroY;
    }
    if (!this.riemannHb.isDragging) {
      this.riemannHb.x = coord.toScreenX(b);
      this.riemannHb.y = sZeroY;
    }
    this.riemannHa.draw(ctx, this.time);
    this.riemannHb.draw(ctx, this.time);
  }
  initFTC() {
    const topCanvas = document.getElementById("ftcTopCanvas");
    const botCanvas = document.getElementById("ftcBotCanvas");
    if (!topCanvas || !botCanvas)
      return;
    this.ftcTopCu = new HiDPICanvas(topCanvas);
    this.ftcBotCu = new HiDPICanvas(botCanvas);
    this.ftcTopCoord = new CoordinateSystem(this.ftcTopCu, {
      originRatioX: 0.35,
      originRatioY: 0.6,
      unitsPerPixelX: 0.015,
      unitsPerPixelY: 0.015,
      xStep: 1,
      yStep: 1
    });
    this.ftcBotCoord = new CoordinateSystem(this.ftcBotCu, {
      originRatioX: 0.35,
      originRatioY: 0.7,
      unitsPerPixelX: 0.015,
      unitsPerPixelY: 0.015,
      xStep: 1,
      yStep: 2
    });
    this.ftcHandle = new DraggableHandle(0, 0, {
      color: COLORS.amber,
      glowColor: COLORS.amberGlow,
      label: "x",
      constrain: (nx, ny) => {
        const mathX = this.ftcTopCoord.toMathX(nx);
        const clamped = Math.max(0.1, Math.min(3.5, mathX));
        this.ftcState.x = clamped;
        return {
          x: this.ftcTopCoord.toScreenX(clamped),
          y: this.ftcTopCoord.toScreenY(0)
        };
      }
    });
    this.ftcController = new HandleController(topCanvas, [this.ftcHandle], () => {
      this.updateFTCUI();
    });
    this.updateFTCHandle();
    this.bindFTCControls();
    this.updateFTCUI();
  }
  updateFTCHandle() {
    this.ftcHandle.x = this.ftcTopCoord.toScreenX(this.ftcState.x);
    this.ftcHandle.y = this.ftcTopCoord.toScreenY(0);
  }
  bindFTCControls() {
    const xSlider = document.getElementById("ftcXSlider");
    if (xSlider) {
      xSlider.addEventListener("input", (e) => {
        this.ftcState.x = parseFloat(e.target.value);
        this.updateFTCHandle();
        this.updateFTCUI();
      });
    }
  }
  ftcFunction(t) {
    return 0.5 * t * t + 0.5;
  }
  ftcIntegral(x) {
    return 0.5 / 3 * x * x * x + 0.5 * x;
  }
  updateFTCUI() {
    const x = this.ftcState.x;
    const fx = this.ftcFunction(x);
    const Fx = this.ftcIntegral(x);
    const xValEl = document.getElementById("ftcXVal");
    if (xValEl)
      xValEl.textContent = x.toFixed(2);
    const fxValEl = document.getElementById("ftcFxVal");
    if (fxValEl)
      fxValEl.textContent = fx.toFixed(3);
    const bigFxValEl = document.getElementById("ftcBigFxVal");
    if (bigFxValEl)
      bigFxValEl.textContent = Fx.toFixed(3);
    const latexEl = document.getElementById("ftcLatex");
    if (latexEl && window.katex) {
      try {
        window.katex.render(`\\frac{d}{dx} \\left[ \\int_0^x f(t)\\,dt \\right] = f(x) = ${fx.toFixed(2)} \\quad \\Longleftrightarrow \\quad \\text{Slope of } F(x) = ${fx.toFixed(2)}`, latexEl, { displayMode: false, throwOnError: false });
      } catch (_) {}
    }
  }
  renderFTC() {
    if (!this.ftcTopCu || !this.ftcBotCu)
      return;
    const ctxTop = this.ftcTopCu.ctx;
    const coordTop = this.ftcTopCoord;
    const x = this.ftcState.x;
    const fx = this.ftcFunction(x);
    const Fx = this.ftcIntegral(x);
    this.ftcTopCu.clear();
    coordTop.drawGrid();
    const boundsTop = coordTop.getBounds();
    const sZeroY = coordTop.toScreenY(0);
    ctxTop.save();
    ctxTop.fillStyle = "rgba(6, 182, 212, 0.28)";
    ctxTop.beginPath();
    const sZeroX = coordTop.toScreenX(0);
    ctxTop.moveTo(sZeroX, sZeroY);
    const areaSteps = 100;
    for (let i = 0;i <= areaSteps; i++) {
      const t = i / areaSteps * x;
      ctxTop.lineTo(coordTop.toScreenX(t), coordTop.toScreenY(this.ftcFunction(t)));
    }
    ctxTop.lineTo(coordTop.toScreenX(x), sZeroY);
    ctxTop.closePath();
    ctxTop.fill();
    ctxTop.strokeStyle = COLORS.cyan;
    ctxTop.lineWidth = 1.5;
    ctxTop.stroke();
    ctxTop.restore();
    ctxTop.save();
    ctxTop.strokeStyle = COLORS.cyan;
    ctxTop.lineWidth = 3;
    ctxTop.shadowColor = COLORS.cyanGlow;
    ctxTop.shadowBlur = 8;
    ctxTop.beginPath();
    let started = false;
    const step = (boundsTop.xMax - boundsTop.xMin) / 250;
    for (let t = boundsTop.xMin;t <= boundsTop.xMax; t += step) {
      const y = this.ftcFunction(t);
      const sx = coordTop.toScreenX(t);
      const sy = coordTop.toScreenY(y);
      if (!started) {
        ctxTop.moveTo(sx, sy);
        started = true;
      } else {
        ctxTop.lineTo(sx, sy);
      }
    }
    ctxTop.stroke();
    ctxTop.restore();
    const sx = coordTop.toScreenX(x);
    const sy = coordTop.toScreenY(fx);
    ctxTop.save();
    ctxTop.strokeStyle = COLORS.rose;
    ctxTop.lineWidth = 2.5;
    ctxTop.shadowColor = COLORS.roseGlow;
    ctxTop.shadowBlur = 6;
    ctxTop.beginPath();
    ctxTop.moveTo(sx, sZeroY);
    ctxTop.lineTo(sx, sy);
    ctxTop.stroke();
    ctxTop.fillStyle = COLORS.rose;
    ctxTop.beginPath();
    ctxTop.arc(sx, sy, 5, 0, Math.PI * 2);
    ctxTop.fill();
    ctxTop.font = "bold 11px Inter, system-ui, sans-serif";
    ctxTop.textAlign = "left";
    ctxTop.fillText(`Height f(x) = ${fx.toFixed(2)}`, sx + 8, (sy + sZeroY) / 2);
    ctxTop.restore();
    if (!this.ftcHandle.isDragging) {
      this.ftcHandle.x = sx;
      this.ftcHandle.y = sZeroY;
    }
    this.ftcHandle.draw(ctxTop, this.time);
    const ctxBot = this.ftcBotCu.ctx;
    const coordBot = this.ftcBotCoord;
    this.ftcBotCu.clear();
    coordBot.drawGrid();
    const boundsBot = coordBot.getBounds();
    ctxBot.save();
    ctxBot.strokeStyle = COLORS.violet;
    ctxBot.lineWidth = 3;
    ctxBot.shadowColor = COLORS.violetGlow;
    ctxBot.shadowBlur = 8;
    ctxBot.beginPath();
    started = false;
    const botStep = (boundsBot.xMax - boundsBot.xMin) / 250;
    for (let bx = boundsBot.xMin;bx <= boundsBot.xMax; bx += botStep) {
      const y = this.ftcIntegral(bx);
      const sxB = coordBot.toScreenX(bx);
      const syB = coordBot.toScreenY(y);
      if (!started) {
        ctxBot.moveTo(sxB, syB);
        started = true;
      } else {
        ctxBot.lineTo(sxB, syB);
      }
    }
    ctxBot.stroke();
    ctxBot.restore();
    const sBotX = coordBot.toScreenX(x);
    const sBotY = coordBot.toScreenY(Fx);
    ctxBot.save();
    ctxBot.strokeStyle = COLORS.rose;
    ctxBot.lineWidth = 2.5;
    ctxBot.shadowColor = COLORS.roseGlow;
    ctxBot.shadowBlur = 8;
    ctxBot.beginPath();
    const tanSpan = 1.2;
    const xL = x - tanSpan;
    const xR = x + tanSpan;
    const yL = Fx - fx * tanSpan;
    const yR = Fx + fx * tanSpan;
    ctxBot.moveTo(coordBot.toScreenX(xL), coordBot.toScreenY(yL));
    ctxBot.lineTo(coordBot.toScreenX(xR), coordBot.toScreenY(yR));
    ctxBot.stroke();
    ctxBot.fillStyle = "#ffffff";
    ctxBot.beginPath();
    ctxBot.arc(sBotX, sBotY, 6, 0, Math.PI * 2);
    ctxBot.fill();
    ctxBot.strokeStyle = COLORS.rose;
    ctxBot.lineWidth = 2;
    ctxBot.stroke();
    ctxBot.font = "bold 11px Inter, system-ui, sans-serif";
    ctxBot.fillStyle = COLORS.rose;
    ctxBot.textAlign = "left";
    ctxBot.fillText(`Slope F'(x) = ${fx.toFixed(2)} (Exactly equals f(x)!)`, sBotX + 12, sBotY);
    ctxBot.restore();
  }
  initGradientDescent() {
    const canvas = document.getElementById("gdCanvas");
    if (!canvas)
      return;
    this.gdCu = new HiDPICanvas(canvas);
    this.gdCoord = new CoordinateSystem(this.gdCu, {
      originRatioX: 0.5,
      originRatioY: 0.5,
      unitsPerPixelX: 0.012,
      unitsPerPixelY: 0.012,
      xStep: 1,
      yStep: 1
    });
    this.gdBallHandle = new DraggableHandle(0, 0, {
      radius: 9,
      hitRadius: 24,
      color: COLORS.rose,
      glowColor: COLORS.roseGlow,
      label: "θ (Loss Ball)",
      constrain: (nx, ny) => {
        const mx = this.gdCoord.toMathX(nx);
        const my = this.gdCoord.toMathY(ny);
        this.gdState.ballX = mx;
        this.gdState.ballY = my;
        this.gdState.vx = 0;
        this.gdState.vy = 0;
        this.gdState.trail = [];
        return { x: nx, y: ny };
      }
    });
    this.gdController = new HandleController(canvas, [this.gdBallHandle], () => {
      this.updateGDUI();
    });
    this.updateGDBallHandle();
    this.bindGDControls();
    this.updateGDUI();
  }
  updateGDBallHandle() {
    this.gdBallHandle.x = this.gdCoord.toScreenX(this.gdState.ballX);
    this.gdBallHandle.y = this.gdCoord.toScreenY(this.gdState.ballY);
  }
  bindGDControls() {
    const presetSelect = document.getElementById("gdPresetSelect");
    if (presetSelect) {
      presetSelect.addEventListener("change", (e) => {
        this.gdState.preset = e.target.value;
        this.gdState.trail = [];
        this.gdState.vx = 0;
        this.gdState.vy = 0;
        if (this.gdState.preset === "rosenbrock") {
          this.gdState.ballX = -1.2;
          this.gdState.ballY = 1;
        } else {
          this.gdState.ballX = 2;
          this.gdState.ballY = 1.8;
        }
        this.updateGDBallHandle();
        this.updateGDUI();
      });
    }
    const lrSlider = document.getElementById("gdLrSlider");
    if (lrSlider) {
      lrSlider.addEventListener("input", (e) => {
        this.gdState.lr = parseFloat(e.target.value);
        const lrVal = document.getElementById("gdLrVal");
        if (lrVal)
          lrVal.textContent = this.gdState.lr.toFixed(3);
      });
    }
    const momSlider = document.getElementById("gdMomSlider");
    if (momSlider) {
      momSlider.addEventListener("input", (e) => {
        this.gdState.momentum = parseFloat(e.target.value);
        const momVal = document.getElementById("gdMomVal");
        if (momVal)
          momVal.textContent = this.gdState.momentum.toFixed(2);
      });
    }
    const playBtn = document.getElementById("gdPlayBtn");
    if (playBtn) {
      playBtn.addEventListener("click", () => {
        this.gdState.running = !this.gdState.running;
        playBtn.textContent = this.gdState.running ? "⏸ Pause Optimization" : "▶ Start Gradient Descent";
        playBtn.classList.toggle("active", this.gdState.running);
        if (this.gdState.running)
          soundSynth.playClick(500, 0.04);
      });
    }
    const resetBtn = document.getElementById("gdResetBtn");
    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        this.gdState.ballX = 2;
        this.gdState.ballY = 1.8;
        this.gdState.vx = 0;
        this.gdState.vy = 0;
        this.gdState.trail = [];
        this.gdState.running = false;
        if (playBtn) {
          playBtn.textContent = "▶ Start Gradient Descent";
          playBtn.classList.remove("active");
        }
        this.updateGDBallHandle();
        this.updateGDUI();
        soundSynth.playClick(400, 0.05);
      });
    }
  }
  updateGDUI() {
    const surf = this.potentialSurfaces[this.gdState.preset];
    const loss = surf.f(this.gdState.ballX, this.gdState.ballY);
    const grad = surf.grad(this.gdState.ballX, this.gdState.ballY);
    const gradNorm = Math.hypot(grad.dx, grad.dy);
    const lossValEl = document.getElementById("gdLossVal");
    if (lossValEl)
      lossValEl.textContent = loss.toFixed(4);
    const gradValEl = document.getElementById("gdGradVal");
    if (gradValEl)
      gradValEl.textContent = gradNorm.toFixed(4);
    const posValEl = document.getElementById("gdPosVal");
    if (posValEl)
      posValEl.textContent = `(${this.gdState.ballX.toFixed(2)}, ${this.gdState.ballY.toFixed(2)})`;
  }
  renderGradientDescent(dt) {
    if (!this.gdCu)
      return;
    const ctx = this.gdCu.ctx;
    const coord = this.gdCoord;
    const surf = this.potentialSurfaces[this.gdState.preset];
    if (this.gdState.running && !this.gdBallHandle.isDragging) {
      const stepsPerFrame = 2;
      for (let s = 0;s < stepsPerFrame; s++) {
        const grad = surf.grad(this.gdState.ballX, this.gdState.ballY);
        this.gdState.vx = this.gdState.momentum * this.gdState.vx - this.gdState.lr * grad.dx;
        this.gdState.vy = this.gdState.momentum * this.gdState.vy - this.gdState.lr * grad.dy;
        this.gdState.ballX += this.gdState.vx;
        this.gdState.ballY += this.gdState.vy;
        this.gdState.trail.push({ x: this.gdState.ballX, y: this.gdState.ballY });
        if (this.gdState.trail.length > 300)
          this.gdState.trail.shift();
        if (Math.hypot(this.gdState.vx, this.gdState.vy) < 0.0001 && Math.hypot(grad.dx, grad.dy) < 0.001) {
          this.gdState.running = false;
          const playBtn = document.getElementById("gdPlayBtn");
          if (playBtn) {
            playBtn.textContent = "✓ Minimum Reached";
            playBtn.classList.remove("active");
          }
          soundSynth.playSuccess();
          break;
        }
      }
      this.updateGDBallHandle();
      this.updateGDUI();
    }
    this.gdCu.clear();
    coord.drawGrid();
    const bounds = coord.getBounds();
    const gridStep = 0.55;
    const startX = Math.floor(bounds.xMin / gridStep) * gridStep;
    const startY = Math.floor(bounds.yMin / gridStep) * gridStep;
    for (let gx = startX;gx <= bounds.xMax; gx += gridStep) {
      for (let gy = startY;gy <= bounds.yMax; gy += gridStep) {
        const g = surf.grad(gx, gy);
        const dgx = -g.dx;
        const dgy = -g.dy;
        const norm = Math.hypot(dgx, dgy);
        if (norm < 0.00001)
          continue;
        const arrowLengthMath = Math.min(0.28, Math.max(0.08, norm * 0.15));
        const dirX = dgx / norm * arrowLengthMath;
        const dirY = dgy / norm * arrowLengthMath;
        const fromX = coord.toScreenX(gx);
        const fromY = coord.toScreenY(gy);
        const toX = coord.toScreenX(gx + dirX);
        const toY = coord.toScreenY(gy + dirY);
        const alpha = Math.min(0.55, 0.15 + norm * 0.12);
        drawVector(ctx, fromX, fromY, toX, toY, {
          color: `rgba(6, 182, 212, ${alpha})`,
          glowColor: null,
          lineWidth: 1.2,
          arrowSize: 5
        });
      }
    }
    if (this.gdState.trail.length > 1) {
      ctx.save();
      ctx.strokeStyle = COLORS.rose;
      ctx.lineWidth = 2.5;
      ctx.shadowColor = COLORS.roseGlow;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      const t0 = this.gdState.trail[0];
      ctx.moveTo(coord.toScreenX(t0.x), coord.toScreenY(t0.y));
      for (let i = 1;i < this.gdState.trail.length; i++) {
        const pt = this.gdState.trail[i];
        ctx.lineTo(coord.toScreenX(pt.x), coord.toScreenY(pt.y));
      }
      ctx.stroke();
      ctx.restore();
    }
    if (!this.gdBallHandle.isDragging) {
      this.gdBallHandle.x = coord.toScreenX(this.gdState.ballX);
      this.gdBallHandle.y = coord.toScreenY(this.gdState.ballY);
    }
    this.gdBallHandle.draw(ctx, this.time);
  }
  startLoop() {
    let lastTime = performance.now();
    const render = (now) => {
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;
      this.time += dt;
      if (this.activeSub === "derivatives") {
        this.renderDerivatives(dt);
      } else if (this.activeSub === "riemann") {
        this.renderRiemann(dt);
      } else if (this.activeSub === "ftc") {
        this.renderFTC();
      } else if (this.activeSub === "gradient") {
        this.renderGradientDescent(dt);
      }
      this.animFrame = requestAnimationFrame(render);
    };
    this.animFrame = requestAnimationFrame(render);
  }
  destroy() {
    if (this.animFrame)
      cancelAnimationFrame(this.animFrame);
    if (this.derivController)
      this.derivController.destroy();
    if (this.riemannController)
      this.riemannController.destroy();
    if (this.ftcController)
      this.ftcController.destroy();
    if (this.gdController)
      this.gdController.destroy();
  }
}

// resources/universal_calculator/intuitionlab/js/physics.js
class PhysicsLab {
  constructor() {
    this.activeSub = "projectile";
    this.animFrame = null;
    this.time = 0;
    this.projState = {
      v0: 18,
      angleDeg: 45,
      launchHeight: 1.5,
      gPreset: "earth",
      g: 9.81,
      inFlight: false,
      flightTime: 0,
      simSpeed: 1,
      strobeInterval: 0.25,
      strobes: [],
      targetX: 25,
      targetY: 4,
      targetRadius: 1.6,
      score: 0,
      hitTarget: false,
      ballPos: { x: 0, y: 1.5, vx: 0, vy: 0 }
    };
    this.planets = {
      earth: { name: "Earth (9.81 m/s²)", g: 9.81 },
      moon: { name: "Moon (1.62 m/s²)", g: 1.62 },
      mars: { name: "Mars (3.72 m/s²)", g: 3.72 },
      jupiter: { name: "Jupiter (24.79 m/s²)", g: 24.79 }
    };
    this.pendState = {
      length: 2.2,
      mass: 1,
      damping: 0.15,
      theta: Math.PI / 3,
      omega: 0,
      g: 9.81,
      running: true,
      phaseHistory: [],
      maxPhasePoints: 400
    };
    this.opticsState = {
      n1: 1.5,
      n2: 1,
      incidentAngleDeg: 35,
      raySourceRadius: 4.5,
      isTIR: false,
      criticalAngleDeg: null
    };
    this.waveState = {
      sourceDist: 2.8,
      wavelength: 0.9,
      frequency: 1.8,
      phaseShift: 0,
      showScreen: true
    };
  }
  init() {
    this.initProjectile();
    this.initPendulum();
    this.initOptics();
    this.initWave();
    this.startLoop();
  }
  initProjectile() {
    const canvas = document.getElementById("projCanvas");
    if (!canvas)
      return;
    this.projCu = new HiDPICanvas(canvas);
    this.projCoord = new CoordinateSystem(this.projCu, {
      originRatioX: 0.08,
      originRatioY: 0.82,
      unitsPerPixelX: 0.045,
      unitsPerPixelY: 0.045,
      xStep: 5,
      yStep: 5
    });
    this.targetHandle = new DraggableHandle(0, 0, {
      radius: 12,
      hitRadius: 28,
      color: COLORS.amber,
      glowColor: COLORS.amberGlow,
      label: "\uD83C\uDFAF Target",
      constrain: (nx, ny) => {
        const mx = Math.max(5, Math.min(38, this.projCoord.toMathX(nx)));
        const my = Math.max(1, Math.min(18, this.projCoord.toMathY(ny)));
        this.projState.targetX = mx;
        this.projState.targetY = my;
        return {
          x: this.projCoord.toScreenX(mx),
          y: this.projCoord.toScreenY(my)
        };
      }
    });
    this.projController = new HandleController(canvas, [this.targetHandle], () => {
      this.updateProjUI();
    });
    this.updateTargetHandle();
    this.bindProjControls();
    this.resetProjectile();
    this.updateProjUI();
  }
  updateTargetHandle() {
    this.targetHandle.x = this.projCoord.toScreenX(this.projState.targetX);
    this.targetHandle.y = this.projCoord.toScreenY(this.projState.targetY);
  }
  bindProjControls() {
    const v0Slider = document.getElementById("projV0Slider");
    if (v0Slider) {
      v0Slider.addEventListener("input", (e) => {
        this.projState.v0 = parseFloat(e.target.value);
        this.resetProjectile();
        this.updateProjUI();
      });
    }
    const angleSlider = document.getElementById("projAngleSlider");
    if (angleSlider) {
      angleSlider.addEventListener("input", (e) => {
        this.projState.angleDeg = parseFloat(e.target.value);
        this.resetProjectile();
        this.updateProjUI();
      });
    }
    const planetSelect = document.getElementById("projPlanetSelect");
    if (planetSelect) {
      planetSelect.addEventListener("change", (e) => {
        this.projState.gPreset = e.target.value;
        this.projState.g = this.planets[e.target.value].g;
        this.resetProjectile();
        this.updateProjUI();
      });
    }
    const launchBtn = document.getElementById("projLaunchBtn");
    if (launchBtn) {
      launchBtn.addEventListener("click", () => {
        this.launchProjectile();
      });
    }
    const resetBtn = document.getElementById("projResetBtn");
    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        this.resetProjectile();
        soundSynth.playClick(400, 0.05);
      });
    }
  }
  launchProjectile() {
    const rad = this.projState.angleDeg * Math.PI / 180;
    this.projState.inFlight = true;
    this.projState.flightTime = 0;
    this.projState.strobes = [];
    this.projState.hitTarget = false;
    this.projState.ballPos = {
      x: 0,
      y: this.projState.launchHeight,
      vx: this.projState.v0 * Math.cos(rad),
      vy: this.projState.v0 * Math.sin(rad)
    };
    soundSynth.playClick(320, 0.08);
  }
  resetProjectile() {
    const rad = this.projState.angleDeg * Math.PI / 180;
    this.projState.inFlight = false;
    this.projState.flightTime = 0;
    this.projState.strobes = [];
    this.projState.hitTarget = false;
    this.projState.ballPos = {
      x: 0,
      y: this.projState.launchHeight,
      vx: this.projState.v0 * Math.cos(rad),
      vy: this.projState.v0 * Math.sin(rad)
    };
  }
  updateProjUI() {
    const rad = this.projState.angleDeg * Math.PI / 180;
    const v0 = this.projState.v0;
    const g = this.projState.g;
    const h = this.projState.launchHeight;
    const vx0 = v0 * Math.cos(rad);
    const vy0 = v0 * Math.sin(rad);
    const tPeak = vy0 / g;
    const hMax = h + vy0 * vy0 / (2 * g);
    const tTotal = (vy0 + Math.sqrt(vy0 * vy0 + 2 * g * h)) / g;
    const range = vx0 * tTotal;
    const v0Val = document.getElementById("projV0Val");
    if (v0Val)
      v0Val.textContent = v0.toFixed(1);
    const angleVal = document.getElementById("projAngleVal");
    if (angleVal)
      angleVal.textContent = `${this.projState.angleDeg.toFixed(0)}°`;
    const vxVal = document.getElementById("projVxVal");
    if (vxVal)
      vxVal.textContent = vx0.toFixed(2);
    const vyVal = document.getElementById("projVyVal");
    if (vyVal)
      vyVal.textContent = vy0.toFixed(2);
    const rangeVal = document.getElementById("projRangeVal");
    if (rangeVal)
      rangeVal.textContent = `${range.toFixed(2)} m`;
    const hMaxVal = document.getElementById("projHMaxVal");
    if (hMaxVal)
      hMaxVal.textContent = `${hMax.toFixed(2)} m`;
    const scoreEl = document.getElementById("projScoreVal");
    if (scoreEl)
      scoreEl.textContent = this.projState.score;
    const latexEl = document.getElementById("projLatex");
    if (latexEl && window.katex) {
      try {
        window.katex.render(`x(t) = v_{0x} t, \\quad y(t) = h + v_{0y} t - \\frac{1}{2} g t^2 \\quad (g = ${g.toFixed(2)}\\text{ m/s}^2)`, latexEl, { displayMode: false, throwOnError: false });
      } catch (_) {}
    }
  }
  renderProjectile(dt) {
    if (!this.projCu)
      return;
    const ctx = this.projCu.ctx;
    const coord = this.projCoord;
    const ball = this.projState.ballPos;
    if (this.projState.inFlight) {
      const subSteps = 10;
      const subDt = dt * this.projState.simSpeed / subSteps;
      for (let s = 0;s < subSteps; s++) {
        this.projState.flightTime += subDt;
        ball.x += ball.vx * subDt;
        ball.y += ball.vy * subDt;
        ball.vy -= this.projState.g * subDt;
        const strobeCount = Math.floor(this.projState.flightTime / this.projState.strobeInterval);
        if (strobeCount > this.projState.strobes.length) {
          this.projState.strobes.push({
            x: ball.x,
            y: ball.y,
            vx: ball.vx,
            vy: ball.vy,
            t: this.projState.flightTime
          });
        }
        const distToTarget = Math.hypot(ball.x - this.projState.targetX, ball.y - this.projState.targetY);
        if (!this.projState.hitTarget && distToTarget <= this.projState.targetRadius) {
          this.projState.hitTarget = true;
          this.projState.score += 100;
          soundSynth.playSuccess();
        }
        if (ball.y <= 0) {
          ball.y = 0;
          this.projState.inFlight = false;
          break;
        }
      }
      this.updateProjUI();
    }
    this.projCu.clear();
    coord.drawGrid();
    const sZeroY = coord.toScreenY(0);
    ctx.save();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, sZeroY);
    ctx.lineTo(this.projCu.logicalWidth, sZeroY);
    ctx.stroke();
    ctx.strokeStyle = "rgba(16, 185, 129, 0.3)";
    ctx.lineWidth = 1;
    for (let gx = 0;gx < this.projCu.logicalWidth; gx += 12) {
      ctx.beginPath();
      ctx.moveTo(gx, sZeroY);
      ctx.lineTo(gx - 6, sZeroY + 8);
      ctx.stroke();
    }
    ctx.restore();
    const sTargetX = coord.toScreenX(this.projState.targetX);
    const sTargetY = coord.toScreenY(this.projState.targetY);
    const sTargetR = coord.toScreenDist(this.projState.targetRadius);
    ctx.save();
    ctx.shadowColor = this.projState.hitTarget ? COLORS.emeraldGlow : COLORS.amberGlow;
    ctx.shadowBlur = this.projState.hitTarget ? 24 : 14;
    ctx.strokeStyle = this.projState.hitTarget ? COLORS.emerald : COLORS.amber;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(sTargetX, sTargetY, sTargetR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = this.projState.hitTarget ? "rgba(16, 185, 129, 0.3)" : "rgba(245, 158, 11, 0.18)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(sTargetX, sTargetY + sTargetR);
    ctx.lineTo(sTargetX, sZeroY);
    ctx.stroke();
    ctx.restore();
    if (!this.targetHandle.isDragging) {
      this.targetHandle.x = sTargetX;
      this.targetHandle.y = sTargetY;
    }
    this.targetHandle.draw(ctx, this.time);
    this.projState.strobes.forEach((strobe, idx) => {
      const sx = coord.toScreenX(strobe.x);
      const sy = coord.toScreenY(strobe.y);
      ctx.save();
      ctx.fillStyle = "rgba(6, 182, 212, 0.45)";
      ctx.beginPath();
      ctx.arc(sx, sy, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = "9px Inter, system-ui, sans-serif";
      ctx.fillStyle = COLORS.textDim;
      ctx.textAlign = "center";
      ctx.fillText(`${strobe.t.toFixed(2)}s`, sx, sy - 8);
      ctx.restore();
    });
    const rad = this.projState.angleDeg * Math.PI / 180;
    const v0 = this.projState.v0;
    const g = this.projState.g;
    const h0 = this.projState.launchHeight;
    const vx0 = v0 * Math.cos(rad);
    const vy0 = v0 * Math.sin(rad);
    ctx.save();
    ctx.strokeStyle = "rgba(6, 182, 212, 0.35)";
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(coord.toScreenX(0), coord.toScreenY(h0));
    const dtSim = 0.05;
    let simT = 0;
    while (simT < 8) {
      simT += dtSim;
      const px = vx0 * simT;
      const py = h0 + vy0 * simT - 0.5 * g * simT * simT;
      if (py < 0) {
        ctx.lineTo(coord.toScreenX(px), coord.toScreenY(0));
        break;
      }
      ctx.lineTo(coord.toScreenX(px), coord.toScreenY(py));
    }
    ctx.stroke();
    ctx.restore();
    const sBallX = coord.toScreenX(ball.x);
    const sBallY = coord.toScreenY(ball.y);
    const vectorScale = 1.2;
    const vxScreen = coord.toScreenDist(ball.vx * vectorScale);
    const vyScreen = -coord.toScreenDist(ball.vy * vectorScale);
    drawVector(ctx, sBallX, sBallY, sBallX + vxScreen, sBallY, {
      color: COLORS.emerald,
      glowColor: COLORS.emeraldGlow,
      lineWidth: 2,
      arrowSize: 8,
      label: `v_x = ${ball.vx.toFixed(1)}`,
      badgeOffset: -14
    });
    drawVector(ctx, sBallX, sBallY, sBallX, sBallY + vyScreen, {
      color: COLORS.rose,
      glowColor: COLORS.roseGlow,
      lineWidth: 2,
      arrowSize: 8,
      label: `v_y = ${ball.vy.toFixed(1)}`,
      badgeOffset: 14
    });
    drawVector(ctx, sBallX, sBallY, sBallX + vxScreen, sBallY + vyScreen, {
      color: COLORS.cyan,
      glowColor: COLORS.cyanGlow,
      lineWidth: 2.5,
      arrowSize: 9,
      label: `v = ${Math.hypot(ball.vx, ball.vy).toFixed(1)}`
    });
    ctx.save();
    ctx.shadowColor = COLORS.cyanGlow;
    ctx.shadowBlur = 16;
    ctx.fillStyle = COLORS.cyan;
    ctx.beginPath();
    ctx.arc(sBallX, sBallY, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }
  initPendulum() {
    const physCanvas = document.getElementById("pendPhysCanvas");
    const phaseCanvas = document.getElementById("pendPhaseCanvas");
    if (!physCanvas || !phaseCanvas)
      return;
    this.pendPhysCu = new HiDPICanvas(physCanvas);
    this.pendPhaseCu = new HiDPICanvas(phaseCanvas);
    this.pendPhysCoord = new CoordinateSystem(this.pendPhysCu, {
      originRatioX: 0.5,
      originRatioY: 0.22,
      unitsPerPixelX: 0.012,
      unitsPerPixelY: 0.012,
      showAxes: false,
      showMinorGrid: false,
      showMajorGrid: false
    });
    this.pendPhaseCoord = new CoordinateSystem(this.pendPhaseCu, {
      originRatioX: 0.5,
      originRatioY: 0.5,
      unitsPerPixelX: 0.015,
      unitsPerPixelY: 0.02,
      xStep: 1,
      yStep: 2,
      xLabel: "θ (rad)",
      yLabel: "ω (rad/s)"
    });
    this.pendBobHandle = new DraggableHandle(0, 0, {
      radius: 12,
      hitRadius: 28,
      color: COLORS.rose,
      glowColor: COLORS.roseGlow,
      label: "Bob",
      constrain: (nx, ny) => {
        const ox = this.pendPhysCoord.originX;
        const oy = this.pendPhysCoord.originY;
        const dx = nx - ox;
        const dy = ny - oy;
        const angle = Math.atan2(dx, dy);
        this.pendState.theta = angle;
        this.pendState.omega = 0;
        this.pendState.phaseHistory = [];
        const rScreen = this.pendPhysCoord.toScreenDist(this.pendState.length);
        return {
          x: ox + Math.sin(angle) * rScreen,
          y: oy + Math.cos(angle) * rScreen
        };
      }
    });
    this.pendController = new HandleController(physCanvas, [this.pendBobHandle], () => {
      this.updatePendUI();
    });
    this.updatePendHandle();
    this.bindPendControls();
    this.updatePendUI();
  }
  updatePendHandle() {
    const ox = this.pendPhysCoord.originX;
    const oy = this.pendPhysCoord.originY;
    const rScreen = this.pendPhysCoord.toScreenDist(this.pendState.length);
    this.pendBobHandle.x = ox + Math.sin(this.pendState.theta) * rScreen;
    this.pendBobHandle.y = oy + Math.cos(this.pendState.theta) * rScreen;
  }
  bindPendControls() {
    const dampSlider = document.getElementById("pendDampSlider");
    if (dampSlider) {
      dampSlider.addEventListener("input", (e) => {
        this.pendState.damping = parseFloat(e.target.value);
        const dampVal = document.getElementById("pendDampVal");
        if (dampVal)
          dampVal.textContent = this.pendState.damping.toFixed(2);
      });
    }
    const lenSlider = document.getElementById("pendLenSlider");
    if (lenSlider) {
      lenSlider.addEventListener("input", (e) => {
        this.pendState.length = parseFloat(e.target.value);
        this.updatePendHandle();
        this.updatePendUI();
      });
    }
    const playBtn = document.getElementById("pendPlayBtn");
    if (playBtn) {
      playBtn.addEventListener("click", () => {
        this.pendState.running = !this.pendState.running;
        playBtn.textContent = this.pendState.running ? "⏸ Pause" : "▶ Play";
      });
    }
    const resetBtn = document.getElementById("pendResetBtn");
    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        this.pendState.theta = Math.PI / 3;
        this.pendState.omega = 0;
        this.pendState.phaseHistory = [];
        this.updatePendHandle();
        this.updatePendUI();
        soundSynth.playClick(440, 0.05);
      });
    }
  }
  updatePendUI() {
    const m = this.pendState.mass;
    const L = this.pendState.length;
    const g = this.pendState.g;
    const theta = this.pendState.theta;
    const omega = this.pendState.omega;
    const Ek = 0.5 * m * (L * omega) * (L * omega);
    const Ep = m * g * L * (1 - Math.cos(theta));
    const Etot = Ek + Ep;
    const ekBar = document.getElementById("pendEkBar");
    const epBar = document.getElementById("pendEpBar");
    const ekVal = document.getElementById("pendEkVal");
    const epVal = document.getElementById("pendEpVal");
    const etotVal = document.getElementById("pendEtotVal");
    const maxDisplayE = Math.max(10, Etot * 1.2);
    const ekPct = Math.min(100, Ek / maxDisplayE * 100);
    const epPct = Math.min(100, Ep / maxDisplayE * 100);
    if (ekBar)
      ekBar.style.width = `${ekPct}%`;
    if (epBar)
      epBar.style.width = `${epPct}%`;
    if (ekVal)
      ekVal.textContent = `${Ek.toFixed(2)} J`;
    if (epVal)
      epVal.textContent = `${Ep.toFixed(2)} J`;
    if (etotVal)
      etotVal.textContent = `${Etot.toFixed(2)} J`;
    const latexEl = document.getElementById("pendLatex");
    if (latexEl && window.katex) {
      try {
        window.katex.render(`\\frac{d^2\\theta}{dt^2} + \\gamma \\frac{d\\theta}{dt} + \\frac{g}{L} \\sin\\theta = 0 \\quad (E = E_k + E_p = ${Etot.toFixed(2)}\\text{ J})`, latexEl, { displayMode: false, throwOnError: false });
      } catch (_) {}
    }
  }
  renderPendulum(dt) {
    if (!this.pendPhysCu || !this.pendPhaseCu)
      return;
    if (this.pendState.running && !this.pendBobHandle.isDragging) {
      const steps = 10;
      const subDt = dt / steps;
      const g = this.pendState.g;
      const L = this.pendState.length;
      const b = this.pendState.damping;
      const derivatives = (th, om) => ({
        dTheta: om,
        dOmega: -(g / L) * Math.sin(th) - b * om
      });
      for (let i = 0;i < steps; i++) {
        const k1 = derivatives(this.pendState.theta, this.pendState.omega);
        const k2 = derivatives(this.pendState.theta + 0.5 * subDt * k1.dTheta, this.pendState.omega + 0.5 * subDt * k1.dOmega);
        const k3 = derivatives(this.pendState.theta + 0.5 * subDt * k2.dTheta, this.pendState.omega + 0.5 * subDt * k2.dOmega);
        const k4 = derivatives(this.pendState.theta + subDt * k3.dTheta, this.pendState.omega + subDt * k3.dOmega);
        this.pendState.theta += subDt / 6 * (k1.dTheta + 2 * k2.dTheta + 2 * k3.dTheta + k4.dTheta);
        this.pendState.omega += subDt / 6 * (k1.dOmega + 2 * k2.dOmega + 2 * k3.dOmega + k4.dOmega);
      }
      this.pendState.phaseHistory.push({
        theta: this.pendState.theta,
        omega: this.pendState.omega
      });
      if (this.pendState.phaseHistory.length > this.pendState.maxPhasePoints) {
        this.pendState.phaseHistory.shift();
      }
      this.updatePendHandle();
      this.updatePendUI();
    }
    const ctxPhys = this.pendPhysCu.ctx;
    this.pendPhysCu.clear();
    const ox = this.pendPhysCoord.originX;
    const oy = this.pendPhysCoord.originY;
    const rScreen = this.pendPhysCoord.toScreenDist(this.pendState.length);
    const bobX = ox + Math.sin(this.pendState.theta) * rScreen;
    const bobY = oy + Math.cos(this.pendState.theta) * rScreen;
    ctxPhys.save();
    ctxPhys.fillStyle = "rgba(255, 255, 255, 0.2)";
    ctxPhys.fillRect(ox - 35, oy - 8, 70, 8);
    ctxPhys.strokeStyle = "rgba(255, 255, 255, 0.4)";
    ctxPhys.strokeRect(ox - 35, oy - 8, 70, 8);
    ctxPhys.strokeStyle = "rgba(255, 255, 255, 0.15)";
    ctxPhys.setLineDash([4, 4]);
    ctxPhys.beginPath();
    ctxPhys.moveTo(ox, oy);
    ctxPhys.lineTo(ox, oy + rScreen + 20);
    ctxPhys.stroke();
    ctxPhys.setLineDash([]);
    ctxPhys.strokeStyle = COLORS.cyan;
    ctxPhys.lineWidth = 3;
    ctxPhys.shadowColor = COLORS.cyanGlow;
    ctxPhys.shadowBlur = 10;
    ctxPhys.beginPath();
    ctxPhys.moveTo(ox, oy);
    ctxPhys.lineTo(bobX, bobY);
    ctxPhys.stroke();
    ctxPhys.fillStyle = "#ffffff";
    ctxPhys.beginPath();
    ctxPhys.arc(ox, oy, 5, 0, Math.PI * 2);
    ctxPhys.fill();
    ctxPhys.restore();
    if (!this.pendBobHandle.isDragging) {
      this.pendBobHandle.x = bobX;
      this.pendBobHandle.y = bobY;
    }
    this.pendBobHandle.draw(ctxPhys, this.time);
    const ctxPhase = this.pendPhaseCu.ctx;
    const phaseCoord = this.pendPhaseCoord;
    this.pendPhaseCu.clear();
    phaseCoord.drawGrid();
    const hist = this.pendState.phaseHistory;
    if (hist.length > 1) {
      ctxPhase.save();
      ctxPhase.lineWidth = 2;
      for (let i = 1;i < hist.length; i++) {
        const p0 = hist[i - 1];
        const p1 = hist[i];
        const alpha = i / hist.length;
        ctxPhase.strokeStyle = `rgba(139, 92, 246, ${alpha})`;
        ctxPhase.beginPath();
        ctxPhase.moveTo(phaseCoord.toScreenX(p0.theta), phaseCoord.toScreenY(p0.omega));
        ctxPhase.lineTo(phaseCoord.toScreenX(p1.theta), phaseCoord.toScreenY(p1.omega));
        ctxPhase.stroke();
      }
      ctxPhase.restore();
    }
    const curPhaseX = phaseCoord.toScreenX(this.pendState.theta);
    const curPhaseY = phaseCoord.toScreenY(this.pendState.omega);
    ctxPhase.save();
    ctxPhase.shadowColor = COLORS.roseGlow;
    ctxPhase.shadowBlur = 16;
    ctxPhase.fillStyle = COLORS.rose;
    ctxPhase.beginPath();
    ctxPhase.arc(curPhaseX, curPhaseY, 6, 0, Math.PI * 2);
    ctxPhase.fill();
    ctxPhase.strokeStyle = "#ffffff";
    ctxPhase.lineWidth = 2;
    ctxPhase.stroke();
    ctxPhase.restore();
  }
  initOptics() {
    const canvas = document.getElementById("opticsCanvas");
    if (!canvas)
      return;
    this.opticsCu = new HiDPICanvas(canvas);
    this.opticsCoord = new CoordinateSystem(this.opticsCu, {
      originRatioX: 0.5,
      originRatioY: 0.5,
      unitsPerPixelX: 0.015,
      unitsPerPixelY: 0.015,
      showAxes: false,
      showMinorGrid: false,
      showMajorGrid: false
    });
    this.rayHandle = new DraggableHandle(0, 0, {
      radius: 10,
      hitRadius: 26,
      color: COLORS.amber,
      glowColor: COLORS.amberGlow,
      label: "Emitter",
      constrain: (nx, ny) => {
        const ox = this.opticsCoord.originX;
        const oy = this.opticsCoord.originY;
        const dx = nx - ox;
        const dy = ny - oy;
        const clampedDy = Math.min(-20, dy);
        const angle = Math.atan2(dx, -clampedDy);
        this.opticsState.incidentAngleDeg = Math.max(0.5, Math.min(88, Math.abs(angle * 180 / Math.PI)));
        const R = this.opticsCoord.toScreenDist(this.opticsState.raySourceRadius);
        const rad = this.opticsState.incidentAngleDeg * Math.PI / 180;
        return {
          x: ox - Math.sin(rad) * R,
          y: oy - Math.cos(rad) * R
        };
      }
    });
    this.opticsController = new HandleController(canvas, [this.rayHandle], () => {
      this.updateOpticsUI();
    });
    this.updateRayHandle();
    this.bindOpticsControls();
    this.updateOpticsUI();
  }
  updateRayHandle() {
    const ox = this.opticsCoord.originX;
    const oy = this.opticsCoord.originY;
    const R = this.opticsCoord.toScreenDist(this.opticsState.raySourceRadius);
    const rad = this.opticsState.incidentAngleDeg * Math.PI / 180;
    this.rayHandle.x = ox - Math.sin(rad) * R;
    this.rayHandle.y = oy - Math.cos(rad) * R;
  }
  bindOpticsControls() {
    const n1Select = document.getElementById("opticsN1Select");
    if (n1Select) {
      n1Select.addEventListener("change", (e) => {
        this.opticsState.n1 = parseFloat(e.target.value);
        this.updateRayHandle();
        this.updateOpticsUI();
      });
    }
    const n2Select = document.getElementById("opticsN2Select");
    if (n2Select) {
      n2Select.addEventListener("change", (e) => {
        this.opticsState.n2 = parseFloat(e.target.value);
        this.updateRayHandle();
        this.updateOpticsUI();
      });
    }
    const angleSlider = document.getElementById("opticsAngleSlider");
    if (angleSlider) {
      angleSlider.addEventListener("input", (e) => {
        this.opticsState.incidentAngleDeg = parseFloat(e.target.value);
        this.updateRayHandle();
        this.updateOpticsUI();
      });
    }
  }
  updateOpticsUI() {
    const n1 = this.opticsState.n1;
    const n2 = this.opticsState.n2;
    const theta1Rad = this.opticsState.incidentAngleDeg * Math.PI / 180;
    let critDeg = null;
    if (n1 > n2) {
      critDeg = Math.asin(n2 / n1) * 180 / Math.PI;
    }
    this.opticsState.criticalAngleDeg = critDeg;
    const sinTheta2 = n1 / n2 * Math.sin(theta1Rad);
    this.opticsState.isTIR = sinTheta2 > 1;
    let theta2Deg = null;
    if (!this.opticsState.isTIR) {
      theta2Deg = Math.asin(sinTheta2) * 180 / Math.PI;
    }
    const theta1El = document.getElementById("opticsTheta1Val");
    if (theta1El)
      theta1El.textContent = `${this.opticsState.incidentAngleDeg.toFixed(1)}°`;
    const theta2El = document.getElementById("opticsTheta2Val");
    if (theta2El) {
      theta2El.textContent = this.opticsState.isTIR ? "TIR (Reflected!)" : `${theta2Deg.toFixed(1)}°`;
    }
    const critEl = document.getElementById("opticsCritVal");
    if (critEl) {
      critEl.textContent = critDeg !== null ? `${critDeg.toFixed(1)}°` : "None (n1 ≤ n2)";
    }
    const latexEl = document.getElementById("opticsLatex");
    if (latexEl && window.katex) {
      try {
        const rightSide = this.opticsState.isTIR ? `\\sin\\theta_2 > 1 \\implies \\text{\\textbf{Total Internal Reflection}}` : `\\theta_2 = ${theta2Deg.toFixed(1)}^\\circ`;
        window.katex.render(`n_1 \\sin\\theta_1 = n_2 \\sin\\theta_2 \\quad (${n1.toFixed(2)} \\cdot \\sin(${this.opticsState.incidentAngleDeg.toFixed(1)}^\\circ) = ${n2.toFixed(2)} \\cdot \\sin\\theta_2) \\implies ${rightSide}`, latexEl, { displayMode: false, throwOnError: false });
      } catch (_) {}
    }
  }
  renderOptics() {
    if (!this.opticsCu)
      return;
    const ctx = this.opticsCu.ctx;
    this.opticsCu.clear();
    const w = this.opticsCu.logicalWidth;
    const h = this.opticsCu.logicalHeight;
    const ox = this.opticsCoord.originX;
    const oy = this.opticsCoord.originY;
    ctx.save();
    ctx.fillStyle = "rgba(15, 23, 42, 0.4)";
    ctx.fillRect(0, 0, w, oy);
    const densityTint = Math.min(0.65, this.opticsState.n2 / 2.5 * 0.45);
    ctx.fillStyle = `rgba(6, 182, 212, ${densityTint})`;
    ctx.fillRect(0, oy, w, h - oy);
    ctx.strokeStyle = COLORS.cyan;
    ctx.lineWidth = 2;
    ctx.shadowColor = COLORS.cyanGlow;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(0, oy);
    ctx.lineTo(w, oy);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(ox, 20);
    ctx.lineTo(ox, h - 20);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
    ctx.font = "600 12px Inter, system-ui, sans-serif";
    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "left";
    ctx.fillText(`Medium 1 (n₁ = ${this.opticsState.n1.toFixed(2)}, speed v₁ = ${(1 / this.opticsState.n1).toFixed(2)}c)`, 20, oy - 16);
    ctx.fillText(`Medium 2 (n₂ = ${this.opticsState.n2.toFixed(2)}, speed v₂ = ${(1 / this.opticsState.n2).toFixed(2)}c)`, 20, oy + 26);
    const rad1 = this.opticsState.incidentAngleDeg * Math.PI / 180;
    const R = this.opticsCoord.toScreenDist(this.opticsState.raySourceRadius);
    const emitX = ox - Math.sin(rad1) * R;
    const emitY = oy - Math.cos(rad1) * R;
    drawVector(ctx, emitX, emitY, ox, oy, {
      color: COLORS.amber,
      glowColor: COLORS.amberGlow,
      lineWidth: 3,
      arrowSize: 12,
      label: `θ₁ = ${this.opticsState.incidentAngleDeg.toFixed(0)}°`
    });
    const sinTheta2 = this.opticsState.n1 / this.opticsState.n2 * Math.sin(rad1);
    if (sinTheta2 > 1) {
      const reflX = ox + Math.sin(rad1) * R;
      const reflY = oy - Math.cos(rad1) * R;
      drawVector(ctx, ox, oy, reflX, reflY, {
        color: COLORS.rose,
        glowColor: COLORS.roseGlow,
        lineWidth: 3.5,
        arrowSize: 12,
        label: `TIR Reflected (θ_r = ${this.opticsState.incidentAngleDeg.toFixed(0)}°)`
      });
    } else {
      const rad2 = Math.asin(sinTheta2);
      const refrX = ox + Math.sin(rad2) * R;
      const refrY = oy + Math.cos(rad2) * R;
      drawVector(ctx, ox, oy, refrX, refrY, {
        color: COLORS.emerald,
        glowColor: COLORS.emeraldGlow,
        lineWidth: 3,
        arrowSize: 12,
        label: `θ₂ = ${(rad2 * 180 / Math.PI).toFixed(0)}°`
      });
      const reflX = ox + Math.sin(rad1) * R;
      const reflY = oy - Math.cos(rad1) * R;
      ctx.save();
      ctx.strokeStyle = "rgba(244, 63, 94, 0.35)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.lineTo(reflX, reflY);
      ctx.stroke();
      ctx.restore();
    }
    if (!this.rayHandle.isDragging) {
      this.rayHandle.x = emitX;
      this.rayHandle.y = emitY;
    }
    this.rayHandle.draw(ctx, this.time);
  }
  initWave() {
    const tankCanvas = document.getElementById("waveTankCanvas");
    const screenCanvas = document.getElementById("waveScreenCanvas");
    if (!tankCanvas || !screenCanvas)
      return;
    this.waveTankCu = new HiDPICanvas(tankCanvas);
    this.waveScreenCu = new HiDPICanvas(screenCanvas);
    this.bindWaveControls();
    this.updateWaveUI();
  }
  bindWaveControls() {
    const dSlider = document.getElementById("waveDSlider");
    if (dSlider) {
      dSlider.addEventListener("input", (e) => {
        this.waveState.sourceDist = parseFloat(e.target.value);
        this.updateWaveUI();
      });
    }
    const lambdaSlider = document.getElementById("waveLambdaSlider");
    if (lambdaSlider) {
      lambdaSlider.addEventListener("input", (e) => {
        this.waveState.wavelength = parseFloat(e.target.value);
        this.updateWaveUI();
      });
    }
  }
  updateWaveUI() {
    const d = this.waveState.sourceDist;
    const lambda = this.waveState.wavelength;
    const dVal = document.getElementById("waveDVal");
    if (dVal)
      dVal.textContent = `${d.toFixed(2)} m`;
    const lambdaVal = document.getElementById("waveLambdaVal");
    if (lambdaVal)
      lambdaVal.textContent = `${lambda.toFixed(2)} m`;
    const latexEl = document.getElementById("waveLatex");
    if (latexEl && window.katex) {
      try {
        window.katex.render(`d \\sin\\theta = m\\lambda \\quad (\\text{Constructive Fringe: } y_m \\approx \\frac{m \\lambda L}{d})`, latexEl, { displayMode: false, throwOnError: false });
      } catch (_) {}
    }
  }
  renderWaveInterference() {
    if (!this.waveTankCu || !this.waveScreenCu)
      return;
    const ctxTank = this.waveTankCu.ctx;
    const w = this.waveTankCu.logicalWidth;
    const h = this.waveTankCu.logicalHeight;
    this.waveTankCu.clear();
    const s1y = h / 2 - this.waveState.sourceDist * 28;
    const s2y = h / 2 + this.waveState.sourceDist * 28;
    const sX = 50;
    const k = 2 * Math.PI / (this.waveState.wavelength * 35);
    const omega = this.waveState.frequency * 3.5;
    const maxR = Math.hypot(w - sX, h);
    const phase = this.time * omega % (2 * Math.PI);
    const ringStep = 2 * Math.PI / k;
    ctxTank.save();
    ctxTank.lineWidth = 1.5;
    for (let r = phase / k;r < maxR; r += ringStep) {
      const alpha = Math.max(0, 0.45 * (1 - r / maxR));
      ctxTank.strokeStyle = `rgba(6, 182, 212, ${alpha})`;
      ctxTank.beginPath();
      ctxTank.arc(sX, s1y, r, -Math.PI / 2, Math.PI / 2);
      ctxTank.stroke();
    }
    for (let r = phase / k;r < maxR; r += ringStep) {
      const alpha = Math.max(0, 0.45 * (1 - r / maxR));
      ctxTank.strokeStyle = `rgba(244, 63, 94, ${alpha})`;
      ctxTank.beginPath();
      ctxTank.arc(sX, s2y, r, -Math.PI / 2, Math.PI / 2);
      ctxTank.stroke();
    }
    ctxTank.shadowColor = COLORS.cyanGlow;
    ctxTank.shadowBlur = 14;
    ctxTank.fillStyle = COLORS.cyan;
    ctxTank.beginPath();
    ctxTank.arc(sX, s1y, 6, 0, Math.PI * 2);
    ctxTank.fill();
    ctxTank.shadowColor = COLORS.roseGlow;
    ctxTank.fillStyle = COLORS.rose;
    ctxTank.beginPath();
    ctxTank.arc(sX, s2y, 6, 0, Math.PI * 2);
    ctxTank.fill();
    ctxTank.restore();
    const ctxScreen = this.waveScreenCu.ctx;
    const sw = this.waveScreenCu.logicalWidth;
    const sh = this.waveScreenCu.logicalHeight;
    this.waveScreenCu.clear();
    const screenL = w - sX;
    ctxScreen.save();
    ctxScreen.strokeStyle = COLORS.cyan;
    ctxScreen.lineWidth = 2;
    ctxScreen.beginPath();
    let started = false;
    for (let py = 0;py < sh; py += 2) {
      const dy = py - sh / 2;
      const theta = Math.atan2(dy, screenL);
      const pathDiff = this.waveState.sourceDist * 28 * Math.sin(theta);
      const phaseDiff = k * pathDiff;
      const I = Math.cos(phaseDiff / 2) ** 2;
      const plotX = sw * 0.15 + I * (sw * 0.7);
      if (!started) {
        ctxScreen.moveTo(plotX, py);
        started = true;
      } else {
        ctxScreen.lineTo(plotX, py);
      }
      ctxScreen.fillStyle = `rgba(6, 182, 212, ${I * 0.9})`;
      ctxScreen.fillRect(0, py, sw * 0.12, 2);
    }
    ctxScreen.stroke();
    ctxScreen.restore();
  }
  startLoop() {
    let lastTime = performance.now();
    const render = (now) => {
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;
      this.time += dt;
      if (this.activeSub === "projectile") {
        this.renderProjectile(dt);
      } else if (this.activeSub === "pendulum") {
        this.renderPendulum(dt);
      } else if (this.activeSub === "optics") {
        this.renderOptics();
      } else if (this.activeSub === "wave") {
        this.renderWaveInterference();
      }
      this.animFrame = requestAnimationFrame(render);
    };
    this.animFrame = requestAnimationFrame(render);
  }
  destroy() {
    if (this.animFrame)
      cancelAnimationFrame(this.animFrame);
    if (this.projController)
      this.projController.destroy();
    if (this.pendController)
      this.pendController.destroy();
    if (this.opticsController)
      this.opticsController.destroy();
  }
}

// resources/universal_calculator/intuitionlab/js/algebra.js
class AlgebraLab {
  constructor() {
    this.activeSub = "matrix";
    this.animFrame = null;
    this.time = 0;
    this.matrixState = {
      a: 1,
      b: 0,
      c: 0,
      d: 1,
      animating: false,
      animProgress: 0,
      targetMatrix: null,
      startMatrix: null
    };
    this.matrixPresets = {
      identity: { a: 1, b: 0, c: 0, d: 1, name: "Identity Matrix" },
      rotation45: { a: Math.SQRT1_2, b: Math.SQRT1_2, c: -Math.SQRT1_2, d: Math.SQRT1_2, name: "Rotation 45°" },
      shearX: { a: 1, b: 0, c: 1.2, d: 1, name: "Horizontal Shear" },
      reflection: { a: -1, b: 0, c: 0, d: 1, name: "Y-Axis Reflection (det < 0)" },
      projection: { a: 1, b: 0, c: 0, d: 0, name: "X-Projection (det = 0)" },
      scale: { a: 1.5, b: 0, c: 0, d: 1.5, name: "Uniform Scaling 1.5x" }
    };
    this.quadState = {
      a: 1,
      b: -2,
      c: -1
    };
    this.trigState = {
      theta: Math.PI / 4,
      speed: 0.8,
      autoRotate: true,
      wavePoints: []
    };
    this.linearState = {
      a1: 1,
      b1: 1,
      c1: 3,
      a2: 1,
      b2: -1,
      c2: 1
    };
  }
  init() {
    this.initMatrix();
    this.initQuadratic();
    this.initUnitCircle();
    this.initLinearSystems();
    this.startLoop();
  }
  initMatrix() {
    const canvas = document.getElementById("matrixCanvas");
    if (!canvas)
      return;
    this.matrixCu = new HiDPICanvas(canvas);
    this.matrixCoord = new CoordinateSystem(this.matrixCu, {
      originRatioX: 0.5,
      originRatioY: 0.5,
      unitsPerPixelX: 0.015,
      unitsPerPixelY: 0.015,
      xStep: 1,
      yStep: 1
    });
    this.iHatHandle = new DraggableHandle(0, 0, {
      radius: 9,
      hitRadius: 26,
      color: COLORS.cyan,
      glowColor: COLORS.cyanGlow,
      label: "î",
      constrain: (nx, ny) => {
        const mx = this.matrixCoord.toMathX(nx);
        const my = this.matrixCoord.toMathY(ny);
        this.matrixState.a = mx;
        this.matrixState.b = my;
        return { x: nx, y: ny };
      }
    });
    this.jHatHandle = new DraggableHandle(0, 0, {
      radius: 9,
      hitRadius: 26,
      color: COLORS.rose,
      glowColor: COLORS.roseGlow,
      label: "ĵ",
      constrain: (nx, ny) => {
        const mx = this.matrixCoord.toMathX(nx);
        const my = this.matrixCoord.toMathY(ny);
        this.matrixState.c = mx;
        this.matrixState.d = my;
        return { x: nx, y: ny };
      }
    });
    this.matrixController = new HandleController(canvas, [this.iHatHandle, this.jHatHandle], () => {
      this.updateMatrixUI();
    });
    this.updateMatrixHandles();
    this.bindMatrixControls();
    this.updateMatrixUI();
  }
  updateMatrixHandles() {
    this.iHatHandle.x = this.matrixCoord.toScreenX(this.matrixState.a);
    this.iHatHandle.y = this.matrixCoord.toScreenY(this.matrixState.b);
    this.jHatHandle.x = this.matrixCoord.toScreenX(this.matrixState.c);
    this.jHatHandle.y = this.matrixCoord.toScreenY(this.matrixState.d);
  }
  bindMatrixControls() {
    const presetSelect = document.getElementById("matrixPresetSelect");
    if (presetSelect) {
      presetSelect.addEventListener("change", (e) => {
        const p = this.matrixPresets[e.target.value];
        if (p)
          this.animateToMatrix(p);
      });
    }
    const resetBtn = document.getElementById("matrixResetBtn");
    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        this.animateToMatrix({ a: 1, b: 0, c: 0, d: 1 });
        soundSynth.playClick(440, 0.05);
      });
    }
  }
  animateToMatrix(target) {
    this.matrixState.animating = true;
    this.matrixState.animProgress = 0;
    this.matrixState.startMatrix = {
      a: this.matrixState.a,
      b: this.matrixState.b,
      c: this.matrixState.c,
      d: this.matrixState.d
    };
    this.matrixState.targetMatrix = target;
    soundSynth.playSuccess();
  }
  computeEigenvectors(a, b, c, d) {
    const tr = a + d;
    const det = a * d - b * c;
    const disc = tr * tr - 4 * det;
    if (disc < -0.000001) {
      return null;
    }
    const sqrtDisc = Math.sqrt(Math.max(0, disc));
    const l1 = (tr + sqrtDisc) / 2;
    const l2 = (tr - sqrtDisc) / 2;
    const getVec = (lambda) => {
      if (Math.abs(c) > 0.0001) {
        return { x: lambda - d, y: c };
      } else if (Math.abs(b) > 0.0001) {
        return { x: b, y: lambda - a };
      } else {
        return lambda === a ? { x: 1, y: 0 } : { x: 0, y: 1 };
      }
    };
    const v1 = getVec(l1);
    const v2 = getVec(l2);
    return { l1, l2, v1, v2 };
  }
  updateMatrixUI() {
    const { a, b, c, d } = this.matrixState;
    const det = a * d - b * c;
    const aVal = document.getElementById("matrixAVal");
    const bVal = document.getElementById("matrixBVal");
    const cVal = document.getElementById("matrixCVal");
    const dVal = document.getElementById("matrixDVal");
    if (aVal)
      aVal.textContent = a.toFixed(2);
    if (bVal)
      bVal.textContent = b.toFixed(2);
    if (cVal)
      cVal.textContent = c.toFixed(2);
    if (dVal)
      dVal.textContent = d.toFixed(2);
    const detVal = document.getElementById("matrixDetVal");
    if (detVal) {
      let note = "";
      if (Math.abs(det) < 0.0001)
        note = " (Singular / 1D Collapse!)";
      else if (det < 0)
        note = " (Flipped Orientation!)";
      detVal.textContent = `${det.toFixed(3)}${note}`;
      detVal.style.color = det < 0 ? COLORS.rose : Math.abs(det) < 0.0001 ? COLORS.amber : COLORS.emerald;
    }
    const eigen = this.computeEigenvectors(a, b, c, d);
    const eigenValEl = document.getElementById("matrixEigenVal");
    if (eigenValEl) {
      if (!eigen) {
        eigenValEl.textContent = "Complex (Rotation with no invariant lines)";
      } else {
        eigenValEl.textContent = `λ₁ = ${eigen.l1.toFixed(2)}, λ₂ = ${eigen.l2.toFixed(2)}`;
      }
    }
    const latexEl = document.getElementById("matrixLatex");
    if (latexEl && window.katex) {
      try {
        window.katex.render(`A = \\begin{pmatrix} ${a.toFixed(2)} & ${c.toFixed(2)} \\\\ ${b.toFixed(2)} & ${d.toFixed(2)} \\end{pmatrix}, \\quad \\det(A) = ad - bc = ${det.toFixed(2)}`, latexEl, { displayMode: false, throwOnError: false });
      } catch (_) {}
    }
  }
  renderMatrix(dt) {
    if (!this.matrixCu)
      return;
    const ctx = this.matrixCu.ctx;
    const coord = this.matrixCoord;
    if (this.matrixState.animating) {
      this.matrixState.animProgress += dt * 2;
      if (this.matrixState.animProgress >= 1) {
        this.matrixState.animProgress = 1;
        this.matrixState.animating = false;
        this.matrixState.a = this.matrixState.targetMatrix.a;
        this.matrixState.b = this.matrixState.targetMatrix.b;
        this.matrixState.c = this.matrixState.targetMatrix.c;
        this.matrixState.d = this.matrixState.targetMatrix.d;
      } else {
        const ease = (t) => t * t * (3 - 2 * t);
        const t = ease(this.matrixState.animProgress);
        const s = this.matrixState.startMatrix;
        const e = this.matrixState.targetMatrix;
        this.matrixState.a = s.a * (1 - t) + e.a * t;
        this.matrixState.b = s.b * (1 - t) + e.b * t;
        this.matrixState.c = s.c * (1 - t) + e.c * t;
        this.matrixState.d = s.d * (1 - t) + e.d * t;
      }
      this.updateMatrixHandles();
      this.updateMatrixUI();
    }
    this.matrixCu.clear();
    coord.options.showAxes = false;
    coord.options.showMinorGrid = false;
    coord.drawGrid();
    const { a, b, c, d } = this.matrixState;
    const det = a * d - b * c;
    const bounds = coord.getBounds();
    ctx.save();
    ctx.lineWidth = 1;
    const gridRange = 6;
    for (let i = -gridRange;i <= gridRange; i++) {
      ctx.strokeStyle = i === 0 ? COLORS.cyan : "rgba(6, 182, 212, 0.22)";
      ctx.beginPath();
      const p1x = i * a - gridRange * c;
      const p1y = i * b - gridRange * d;
      const p2x = i * a + gridRange * c;
      const p2y = i * b + gridRange * d;
      ctx.moveTo(coord.toScreenX(p1x), coord.toScreenY(p1y));
      ctx.lineTo(coord.toScreenX(p2x), coord.toScreenY(p2y));
      ctx.stroke();
      ctx.strokeStyle = i === 0 ? COLORS.rose : "rgba(244, 63, 94, 0.22)";
      ctx.beginPath();
      const q1x = -gridRange * a + i * c;
      const q1y = -gridRange * b + i * d;
      const q2x = gridRange * a + i * c;
      const q2y = gridRange * b + i * d;
      ctx.moveTo(coord.toScreenX(q1x), coord.toScreenY(q1y));
      ctx.lineTo(coord.toScreenX(q2x), coord.toScreenY(q2y));
      ctx.stroke();
    }
    ctx.restore();
    const s0x = coord.toScreenX(0);
    const s0y = coord.toScreenY(0);
    const sIx = coord.toScreenX(a);
    const sIy = coord.toScreenY(b);
    const sCornerX = coord.toScreenX(a + c);
    const sCornerY = coord.toScreenY(b + d);
    const sJx = coord.toScreenX(c);
    const sJy = coord.toScreenY(d);
    ctx.save();
    ctx.fillStyle = det >= 0 ? "rgba(16, 185, 129, 0.25)" : "rgba(244, 63, 94, 0.3)";
    ctx.strokeStyle = det >= 0 ? COLORS.emerald : COLORS.rose;
    ctx.lineWidth = 2;
    ctx.shadowColor = det >= 0 ? COLORS.emeraldGlow : COLORS.roseGlow;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(s0x, s0y);
    ctx.lineTo(sIx, sIy);
    ctx.lineTo(sCornerX, sCornerY);
    ctx.lineTo(sJx, sJy);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    const midSquareX = (s0x + sCornerX) / 2;
    const midSquareY = (s0y + sCornerY) / 2;
    ctx.shadowBlur = 0;
    ctx.font = "bold 12px Inter, system-ui, sans-serif";
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`Area = ${Math.abs(det).toFixed(2)}`, midSquareX, midSquareY);
    ctx.restore();
    const eigen = this.computeEigenvectors(a, b, c, d);
    if (eigen) {
      ctx.save();
      ctx.strokeStyle = COLORS.amber;
      ctx.lineWidth = 1.8;
      ctx.setLineDash([6, 4]);
      [eigen.v1, eigen.v2].forEach((v) => {
        const len = Math.hypot(v.x, v.y);
        if (len > 0.0001) {
          const ux = v.x / len;
          const uy = v.y / len;
          const spanR = 7;
          ctx.beginPath();
          ctx.moveTo(coord.toScreenX(-ux * spanR), coord.toScreenY(-uy * spanR));
          ctx.lineTo(coord.toScreenX(ux * spanR), coord.toScreenY(uy * spanR));
          ctx.stroke();
        }
      });
      ctx.restore();
    }
    drawVector(ctx, s0x, s0y, sIx, sIy, {
      color: COLORS.cyan,
      glowColor: COLORS.cyanGlow,
      lineWidth: 3,
      arrowSize: 10,
      label: `î = [${a.toFixed(1)}, ${b.toFixed(1)}]`
    });
    drawVector(ctx, s0x, s0y, sJx, sJy, {
      color: COLORS.rose,
      glowColor: COLORS.roseGlow,
      lineWidth: 3,
      arrowSize: 10,
      label: `ĵ = [${c.toFixed(1)}, ${d.toFixed(1)}]`
    });
    if (!this.iHatHandle.isDragging) {
      this.iHatHandle.x = sIx;
      this.iHatHandle.y = sIy;
    }
    if (!this.jHatHandle.isDragging) {
      this.jHatHandle.x = sJx;
      this.jHatHandle.y = sJy;
    }
    this.iHatHandle.draw(ctx, this.time);
    this.jHatHandle.draw(ctx, this.time);
  }
  initQuadratic() {
    const canvas = document.getElementById("quadCanvas");
    if (!canvas)
      return;
    this.quadCu = new HiDPICanvas(canvas);
    this.quadCoord = new CoordinateSystem(this.quadCu, {
      originRatioX: 0.5,
      originRatioY: 0.5,
      unitsPerPixelX: 0.018,
      unitsPerPixelY: 0.018,
      xStep: 1,
      yStep: 2
    });
    this.bindQuadControls();
    this.updateQuadUI();
  }
  bindQuadControls() {
    ["a", "b", "c"].forEach((coeff) => {
      const slider = document.getElementById(`quad${coeff.toUpperCase()}Slider`);
      if (slider) {
        slider.addEventListener("input", (e) => {
          this.quadState[coeff] = parseFloat(e.target.value);
          const valEl = document.getElementById(`quad${coeff.toUpperCase()}Val`);
          if (valEl)
            valEl.textContent = this.quadState[coeff].toFixed(2);
          this.updateQuadUI();
        });
      }
    });
  }
  updateQuadUI() {
    const { a, b, c } = this.quadState;
    const delta = b * b - 4 * a * c;
    const h = -b / (2 * a);
    const k = a * h * h + b * h + c;
    const discValEl = document.getElementById("quadDiscVal");
    const rootDescEl = document.getElementById("quadRootDesc");
    if (discValEl) {
      discValEl.textContent = delta.toFixed(3);
      discValEl.style.color = delta > 0 ? COLORS.emerald : Math.abs(delta) < 0.0001 ? COLORS.amber : COLORS.rose;
    }
    if (rootDescEl) {
      if (delta > 0.0001) {
        const r1 = (-b - Math.sqrt(delta)) / (2 * a);
        const r2 = (-b + Math.sqrt(delta)) / (2 * a);
        rootDescEl.textContent = `Two Real Roots: x₁ = ${r1.toFixed(2)}, x₂ = ${r2.toFixed(2)}`;
      } else if (Math.abs(delta) <= 0.0001) {
        rootDescEl.textContent = `Double Root: x = ${h.toFixed(2)}`;
      } else {
        const realPart = -b / (2 * a);
        const imagPart = Math.sqrt(-delta) / (2 * Math.abs(a));
        rootDescEl.textContent = `Complex Conjugates: ${realPart.toFixed(2)} ± ${imagPart.toFixed(2)}i`;
      }
    }
    const latexEl = document.getElementById("quadLatex");
    if (latexEl && window.katex) {
      try {
        window.katex.render(`f(x) = ${a.toFixed(1)}x^2 + (${b.toFixed(1)})x + (${c.toFixed(1)}), \\quad \\Delta = b^2 - 4ac = ${delta.toFixed(2)}`, latexEl, { displayMode: false, throwOnError: false });
      } catch (_) {}
    }
  }
  renderQuadratic() {
    if (!this.quadCu)
      return;
    const ctx = this.quadCu.ctx;
    const coord = this.quadCoord;
    this.quadCu.clear();
    coord.drawGrid();
    const { a, b, c } = this.quadState;
    const delta = b * b - 4 * a * c;
    const bounds = coord.getBounds();
    ctx.save();
    ctx.strokeStyle = delta >= 0 ? COLORS.cyan : COLORS.violet;
    ctx.lineWidth = 3;
    ctx.shadowColor = delta >= 0 ? COLORS.cyanGlow : COLORS.violetGlow;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    let started = false;
    const step = (bounds.xMax - bounds.xMin) / 250;
    for (let x = bounds.xMin;x <= bounds.xMax; x += step) {
      const y = a * x * x + b * x + c;
      const sx = coord.toScreenX(x);
      const sy = coord.toScreenY(y);
      if (!started) {
        ctx.moveTo(sx, sy);
        started = true;
      } else {
        ctx.lineTo(sx, sy);
      }
    }
    ctx.stroke();
    ctx.restore();
    const h = -b / (2 * a);
    const k = a * h * h + b * h + c;
    const sHx = coord.toScreenX(h);
    ctx.save();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(sHx, 0);
    ctx.lineTo(sHx, this.quadCu.logicalHeight);
    ctx.stroke();
    ctx.restore();
    const sHy = coord.toScreenY(k);
    ctx.save();
    ctx.fillStyle = COLORS.amber;
    ctx.shadowColor = COLORS.amberGlow;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(sHx, sHy, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.font = "bold 11px Inter, system-ui, sans-serif";
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.fillText(`Vertex (${h.toFixed(1)}, ${k.toFixed(1)})`, sHx, sHy - 12);
    ctx.restore();
    const sZeroY = coord.toScreenY(0);
    if (delta > 0) {
      const r1 = (-b - Math.sqrt(delta)) / (2 * a);
      const r2 = (-b + Math.sqrt(delta)) / (2 * a);
      [r1, r2].forEach((root, idx) => {
        const sRootX = coord.toScreenX(root);
        ctx.save();
        ctx.fillStyle = COLORS.emerald;
        ctx.shadowColor = COLORS.emeraldGlow;
        ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.arc(sRootX, sZeroY, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.font = "bold 11px Inter, system-ui, sans-serif";
        ctx.fillStyle = COLORS.emerald;
        ctx.textAlign = "center";
        ctx.fillText(`x_${idx + 1} = ${root.toFixed(2)}`, sRootX, sZeroY + 16);
        ctx.restore();
      });
    }
  }
  initUnitCircle() {
    const circleCanvas = document.getElementById("trigCircleCanvas");
    const waveCanvas = document.getElementById("trigWaveCanvas");
    if (!circleCanvas || !waveCanvas)
      return;
    this.trigCircleCu = new HiDPICanvas(circleCanvas);
    this.trigWaveCu = new HiDPICanvas(waveCanvas);
    this.trigCircleCoord = new CoordinateSystem(this.trigCircleCu, {
      originRatioX: 0.5,
      originRatioY: 0.5,
      unitsPerPixelX: 0.009,
      unitsPerPixelY: 0.009,
      xStep: 1,
      yStep: 1
    });
    this.trigAngleHandle = new DraggableHandle(0, 0, {
      radius: 8,
      hitRadius: 24,
      color: COLORS.rose,
      glowColor: COLORS.roseGlow,
      label: "P(θ)",
      constrain: (nx, ny) => {
        const ox = this.trigCircleCoord.originX;
        const oy = this.trigCircleCoord.originY;
        const dx = nx - ox;
        const dy = oy - ny;
        const theta = Math.atan2(dy, dx);
        this.trigState.theta = theta < 0 ? theta + Math.PI * 2 : theta;
        this.trigState.autoRotate = false;
        const R = this.trigCircleCoord.toScreenDist(1);
        return {
          x: ox + Math.cos(this.trigState.theta) * R,
          y: oy - Math.sin(this.trigState.theta) * R
        };
      }
    });
    this.trigController = new HandleController(circleCanvas, [this.trigAngleHandle], () => {
      this.updateTrigUI();
    });
    this.updateTrigHandle();
    this.bindTrigControls();
    this.updateTrigUI();
  }
  updateTrigHandle() {
    const ox = this.trigCircleCoord.originX;
    const oy = this.trigCircleCoord.originY;
    const R = this.trigCircleCoord.toScreenDist(1);
    this.trigAngleHandle.x = ox + Math.cos(this.trigState.theta) * R;
    this.trigAngleHandle.y = oy - Math.sin(this.trigState.theta) * R;
  }
  bindTrigControls() {
    const toggleBtn = document.getElementById("trigAutoToggle");
    if (toggleBtn) {
      toggleBtn.addEventListener("click", () => {
        this.trigState.autoRotate = !this.trigState.autoRotate;
        toggleBtn.textContent = this.trigState.autoRotate ? "⏸ Pause Spin" : "▶ Auto Spin";
      });
    }
  }
  updateTrigUI() {
    const th = this.trigState.theta;
    const deg = th * 180 / Math.PI % 360;
    const cosVal = Math.cos(th);
    const sinVal = Math.sin(th);
    const tanVal = Math.tan(th);
    const thValEl = document.getElementById("trigThetaVal");
    const cosValEl = document.getElementById("trigCosVal");
    const sinValEl = document.getElementById("trigSinVal");
    const tanValEl = document.getElementById("trigTanVal");
    if (thValEl)
      thValEl.textContent = `${deg.toFixed(1)}° (${th.toFixed(2)} rad)`;
    if (cosValEl)
      cosValEl.textContent = cosVal.toFixed(3);
    if (sinValEl)
      sinValEl.textContent = sinVal.toFixed(3);
    if (tanValEl)
      tanValEl.textContent = Math.abs(cosVal) > 0.0001 ? tanVal.toFixed(3) : "Undefined (±∞)";
    const latexEl = document.getElementById("trigLatex");
    if (latexEl && window.katex) {
      try {
        window.katex.render(`P(\\theta) = (\\cos\\theta, \\sin\\theta) = (${cosVal.toFixed(2)}, ${sinVal.toFixed(2)}), \\quad \\cos^2\\theta + \\sin^2\\theta = 1`, latexEl, { displayMode: false, throwOnError: false });
      } catch (_) {}
    }
  }
  renderUnitCircle(dt) {
    if (!this.trigCircleCu || !this.trigWaveCu)
      return;
    if (this.trigState.autoRotate && !this.trigAngleHandle.isDragging) {
      this.trigState.theta = (this.trigState.theta + dt * this.trigState.speed) % (Math.PI * 2);
      this.updateTrigHandle();
      this.updateTrigUI();
    }
    const ctxC = this.trigCircleCu.ctx;
    const coordC = this.trigCircleCoord;
    this.trigCircleCu.clear();
    coordC.drawGrid();
    const ox = coordC.originX;
    const oy = coordC.originY;
    const R = coordC.toScreenDist(1);
    const th = this.trigState.theta;
    const cosVal = Math.cos(th);
    const sinVal = Math.sin(th);
    ctxC.save();
    ctxC.strokeStyle = "rgba(255, 255, 255, 0.35)";
    ctxC.lineWidth = 2;
    ctxC.beginPath();
    ctxC.arc(ox, oy, R, 0, Math.PI * 2);
    ctxC.stroke();
    ctxC.strokeStyle = COLORS.amber;
    ctxC.lineWidth = 2;
    ctxC.beginPath();
    ctxC.arc(ox, oy, R * 0.25, -th, 0);
    ctxC.stroke();
    ctxC.restore();
    const px = ox + cosVal * R;
    const py = oy - sinVal * R;
    ctxC.save();
    ctxC.strokeStyle = COLORS.cyan;
    ctxC.lineWidth = 3.5;
    ctxC.shadowColor = COLORS.cyanGlow;
    ctxC.shadowBlur = 10;
    ctxC.beginPath();
    ctxC.moveTo(ox, oy);
    ctxC.lineTo(px, oy);
    ctxC.stroke();
    ctxC.strokeStyle = COLORS.rose;
    ctxC.shadowColor = COLORS.roseGlow;
    ctxC.beginPath();
    ctxC.moveTo(px, oy);
    ctxC.lineTo(px, py);
    ctxC.stroke();
    ctxC.strokeStyle = "rgba(255, 255, 255, 0.7)";
    ctxC.lineWidth = 1.8;
    ctxC.beginPath();
    ctxC.moveTo(ox, oy);
    ctxC.lineTo(px, py);
    ctxC.stroke();
    ctxC.restore();
    if (!this.trigAngleHandle.isDragging) {
      this.trigAngleHandle.x = px;
      this.trigAngleHandle.y = py;
    }
    this.trigAngleHandle.draw(ctxC, this.time);
    const ctxW = this.trigWaveCu.ctx;
    const ww = this.trigWaveCu.logicalWidth;
    const wh = this.trigWaveCu.logicalHeight;
    this.trigWaveCu.clear();
    const wZeroY = wh / 2;
    ctxW.save();
    ctxW.strokeStyle = "rgba(255, 255, 255, 0.15)";
    ctxW.beginPath();
    ctxW.moveTo(0, wZeroY);
    ctxW.lineTo(ww, wZeroY);
    ctxW.stroke();
    ctxW.strokeStyle = COLORS.rose;
    ctxW.lineWidth = 3;
    ctxW.shadowColor = COLORS.roseGlow;
    ctxW.shadowBlur = 8;
    ctxW.beginPath();
    const cycles = 2.5;
    const waveScaleY = R;
    for (let x = 0;x < ww; x += 2) {
      const phaseX = x / ww * (cycles * Math.PI * 2) - th;
      const y = wZeroY - Math.sin(-phaseX) * waveScaleY;
      if (x === 0)
        ctxW.moveTo(x, y);
      else
        ctxW.lineTo(x, y);
    }
    ctxW.stroke();
    const tracerY = wZeroY - sinVal * waveScaleY;
    ctxW.strokeStyle = "rgba(244, 63, 94, 0.6)";
    ctxW.lineWidth = 1.5;
    ctxW.setLineDash([4, 4]);
    ctxW.beginPath();
    ctxW.moveTo(0, tracerY);
    ctxW.lineTo(ww, tracerY);
    ctxW.stroke();
    ctxW.fillStyle = "#ffffff";
    ctxW.beginPath();
    ctxW.arc(0, tracerY, 6, 0, Math.PI * 2);
    ctxW.fill();
    ctxW.restore();
  }
  initLinearSystems() {
    const canvas = document.getElementById("linearCanvas");
    if (!canvas)
      return;
    this.linearCu = new HiDPICanvas(canvas);
    this.linearCoord = new CoordinateSystem(this.linearCu, {
      originRatioX: 0.5,
      originRatioY: 0.5,
      unitsPerPixelX: 0.02,
      unitsPerPixelY: 0.02,
      xStep: 1,
      yStep: 1
    });
    this.bindLinearControls();
    this.updateLinearUI();
  }
  bindLinearControls() {
    ["a1", "b1", "c1", "a2", "b2", "c2"].forEach((param) => {
      const slider = document.getElementById(`linear${param.toUpperCase()}Slider`);
      if (slider) {
        slider.addEventListener("input", (e) => {
          this.linearState[param] = parseFloat(e.target.value);
          const valEl = document.getElementById(`linear${param.toUpperCase()}Val`);
          if (valEl)
            valEl.textContent = this.linearState[param].toFixed(1);
          this.updateLinearUI();
        });
      }
    });
  }
  updateLinearUI() {
    const { a1, b1, c1, a2, b2, c2 } = this.linearState;
    const D = a1 * b2 - a2 * b1;
    const Dx = c1 * b2 - c2 * b1;
    const Dy = a1 * c2 - a2 * c1;
    const dValEl = document.getElementById("linearDVal");
    const solValEl = document.getElementById("linearSolVal");
    if (dValEl)
      dValEl.textContent = D.toFixed(3);
    if (solValEl) {
      if (Math.abs(D) > 0.0001) {
        const xStar = Dx / D;
        const yStar = Dy / D;
        solValEl.textContent = `Unique Intersection: (${xStar.toFixed(2)}, ${yStar.toFixed(2)})`;
        solValEl.style.color = COLORS.emerald;
      } else {
        if (Math.abs(Dx) < 0.0001 && Math.abs(Dy) < 0.0001) {
          solValEl.textContent = "Dependent: Coincident Lines (Infinitely many solutions)";
          solValEl.style.color = COLORS.cyan;
        } else {
          solValEl.textContent = "Inconsistent: Parallel Lines (No solution)";
          solValEl.style.color = COLORS.rose;
        }
      }
    }
    const latexEl = document.getElementById("linearLatex");
    if (latexEl && window.katex) {
      try {
        window.katex.render(`\\begin{cases} ${a1.toFixed(1)}x + ${b1.toFixed(1)}y = ${c1.toFixed(1)} \\\\ ${a2.toFixed(1)}x + ${b2.toFixed(1)}y = ${c2.toFixed(1)} \\end{cases} \\quad D = ${D.toFixed(2)}`, latexEl, { displayMode: false, throwOnError: false });
      } catch (_) {}
    }
  }
  renderLinearSystems() {
    if (!this.linearCu)
      return;
    const ctx = this.linearCu.ctx;
    const coord = this.linearCoord;
    this.linearCu.clear();
    coord.drawGrid();
    const { a1, b1, c1, a2, b2, c2 } = this.linearState;
    const D = a1 * b2 - a2 * b1;
    const bounds = coord.getBounds();
    ctx.save();
    ctx.strokeStyle = COLORS.cyan;
    ctx.lineWidth = 2.5;
    ctx.shadowColor = COLORS.cyanGlow;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    if (Math.abs(b1) > 0.0001) {
      const yLeft = (c1 - a1 * bounds.xMin) / b1;
      const yRight = (c1 - a1 * bounds.xMax) / b1;
      ctx.moveTo(coord.toScreenX(bounds.xMin), coord.toScreenY(yLeft));
      ctx.lineTo(coord.toScreenX(bounds.xMax), coord.toScreenY(yRight));
    } else {
      const xFixed = c1 / a1;
      ctx.moveTo(coord.toScreenX(xFixed), 0);
      ctx.lineTo(coord.toScreenX(xFixed), this.linearCu.logicalHeight);
    }
    ctx.stroke();
    ctx.strokeStyle = COLORS.rose;
    ctx.shadowColor = COLORS.roseGlow;
    ctx.beginPath();
    if (Math.abs(b2) > 0.0001) {
      const yLeft = (c2 - a2 * bounds.xMin) / b2;
      const yRight = (c2 - a2 * bounds.xMax) / b2;
      ctx.moveTo(coord.toScreenX(bounds.xMin), coord.toScreenY(yLeft));
      ctx.lineTo(coord.toScreenX(bounds.xMax), coord.toScreenY(yRight));
    } else {
      const xFixed = c2 / a2;
      ctx.moveTo(coord.toScreenX(xFixed), 0);
      ctx.lineTo(coord.toScreenX(xFixed), this.linearCu.logicalHeight);
    }
    ctx.stroke();
    ctx.restore();
    if (Math.abs(D) > 0.0001) {
      const Dx = c1 * b2 - c2 * b1;
      const Dy = a1 * c2 - a2 * c1;
      const xStar = Dx / D;
      const yStar = Dy / D;
      const sx = coord.toScreenX(xStar);
      const sy = coord.toScreenY(yStar);
      ctx.save();
      ctx.fillStyle = COLORS.emerald;
      ctx.shadowColor = COLORS.emeraldGlow;
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.arc(sx, sy, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.font = "bold 11px Inter, system-ui, sans-serif";
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "left";
      ctx.fillText(`(${xStar.toFixed(2)}, ${yStar.toFixed(2)})`, sx + 10, sy - 8);
      ctx.restore();
    }
  }
  startLoop() {
    let lastTime = performance.now();
    const render = (now) => {
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;
      this.time += dt;
      if (this.activeSub === "matrix") {
        this.renderMatrix(dt);
      } else if (this.activeSub === "quadratic") {
        this.renderQuadratic();
      } else if (this.activeSub === "trig") {
        this.renderUnitCircle(dt);
      } else if (this.activeSub === "linear") {
        this.renderLinearSystems();
      }
      this.animFrame = requestAnimationFrame(render);
    };
    this.animFrame = requestAnimationFrame(render);
  }
  destroy() {
    if (this.animFrame)
      cancelAnimationFrame(this.animFrame);
    if (this.matrixController)
      this.matrixController.destroy();
    if (this.trigController)
      this.trigController.destroy();
  }
}

// resources/universal_calculator/intuitionlab/js/expansion.js
class ExpansionSimulations {
  constructor() {
    this.activeSim = null;
    this.animFrame = null;
    this.initComplexEuler();
    this.initTaylorSeries();
    this.initOrbitalMechanics();
  }
  startSim(simName) {
    if (this.animFrame)
      cancelAnimationFrame(this.animFrame);
    this.activeSim = simName;
    if (simName === "complex")
      this.drawComplex();
    if (simName === "taylor")
      this.drawTaylor();
    if (simName === "orbital")
      this.loopOrbital();
  }
  stopSim() {
    if (this.animFrame)
      cancelAnimationFrame(this.animFrame);
    this.activeSim = null;
  }
  initComplexEuler() {
    this.complexState = { theta: 0.79, r: 1 };
    const canvas = document.getElementById("complexCanvas");
    if (!canvas)
      return;
    this.complexCtx = canvas.getContext("2d");
    const thetaSlider = document.getElementById("complexThetaSlider");
    const rSlider = document.getElementById("complexRSlider");
    if (thetaSlider) {
      thetaSlider.addEventListener("input", (e) => {
        this.complexState.theta = parseFloat(e.target.value);
        document.getElementById("complexThetaVal").textContent = `${this.complexState.theta.toFixed(2)} rad`;
        if (this.activeSim === "complex")
          this.drawComplex();
      });
    }
    if (rSlider) {
      rSlider.addEventListener("input", (e) => {
        this.complexState.r = parseFloat(e.target.value);
        document.getElementById("complexRVal").textContent = this.complexState.r.toFixed(1);
        if (this.activeSim === "complex")
          this.drawComplex();
      });
    }
  }
  drawComplex() {
    const ctx = this.complexCtx;
    const canvas = ctx.canvas;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const cx = w / 2;
    const cy = h / 2;
    const scale = Math.min(w, h) / 4;
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, cy);
    ctx.lineTo(w, cy);
    ctx.moveTo(cx, 0);
    ctx.lineTo(cx, h);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, scale, 0, Math.PI * 2);
    ctx.stroke();
    const { theta, r } = this.complexState;
    const px = cx + Math.cos(theta) * (r * scale);
    const py = cy - Math.sin(theta) * (r * scale);
    ctx.strokeStyle = "#06b6d4";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(px, py);
    ctx.stroke();
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = "#ff2d55";
    ctx.beginPath();
    ctx.moveTo(px, cy);
    ctx.lineTo(px, py);
    ctx.stroke();
    ctx.strokeStyle = "#30d158";
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(px, cy);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(px, py, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.font = "14px monospace";
    ctx.fillText(`Real: ${(r * Math.cos(theta)).toFixed(2)}`, 20, 30);
    ctx.fillText(`Imag: ${(r * Math.sin(theta)).toFixed(2)}i`, 20, 50);
  }
  initTaylorSeries() {
    this.taylorState = { n: 3, a: 0 };
    const canvas = document.getElementById("taylorCanvas");
    if (!canvas)
      return;
    this.taylorCtx = canvas.getContext("2d");
    const nSlider = document.getElementById("taylorNSlider");
    const aSlider = document.getElementById("taylorASlider");
    if (nSlider) {
      nSlider.addEventListener("input", (e) => {
        this.taylorState.n = parseInt(e.target.value);
        document.getElementById("taylorNVal").textContent = this.taylorState.n;
        if (this.activeSim === "taylor")
          this.drawTaylor();
      });
    }
    if (aSlider) {
      aSlider.addEventListener("input", (e) => {
        this.taylorState.a = parseFloat(e.target.value);
        document.getElementById("taylorAVal").textContent = this.taylorState.a.toFixed(1);
        if (this.activeSim === "taylor")
          this.drawTaylor();
      });
    }
  }
  fact(num) {
    let rval = 1;
    for (let i = 2;i <= num; i++)
      rval = rval * i;
    return rval;
  }
  drawTaylor() {
    const ctx = this.taylorCtx;
    const canvas = ctx.canvas;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const cx = w / 2;
    const cy = h / 2;
    const scale = 40;
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, cy);
    ctx.lineTo(w, cy);
    ctx.moveTo(cx, 0);
    ctx.lineTo(cx, h);
    ctx.stroke();
    const f = (x) => Math.sin(x);
    const d_f = (x, n) => {
      const m = n % 4;
      if (m === 0)
        return Math.sin(x);
      if (m === 1)
        return Math.cos(x);
      if (m === 2)
        return -Math.sin(x);
      if (m === 3)
        return -Math.cos(x);
    };
    const { n, a } = this.taylorState;
    const taylor = (x) => {
      let sum = 0;
      for (let i = 0;i <= n; i++) {
        sum += d_f(a, i) / this.fact(i) * Math.pow(x - a, i);
      }
      return sum;
    };
    ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let px = 0;px < w; px++) {
      const x = (px - cx) / scale;
      const y = f(x);
      const py = cy - y * scale;
      if (px === 0)
        ctx.moveTo(px, py);
      else
        ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.strokeStyle = "#ff2d55";
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let px = 0;px < w; px++) {
      const x = (px - cx) / scale;
      const y = taylor(x);
      const py = cy - y * scale;
      if (px === 0)
        ctx.moveTo(px, py);
      else
        ctx.lineTo(px, py);
    }
    ctx.stroke();
    const pxa = cx + a * scale;
    const pya = cy - f(a) * scale;
    ctx.fillStyle = "#06b6d4";
    ctx.beginPath();
    ctx.arc(pxa, pya, 6, 0, Math.PI * 2);
    ctx.fill();
  }
  initOrbitalMechanics() {
    this.orbState = {
      v0: 1.2,
      x: 150,
      y: 0,
      vx: 0,
      vy: 1.2,
      massStar: 50000,
      G: 0.1
    };
    const canvas = document.getElementById("orbitalCanvas");
    if (!canvas)
      return;
    this.orbCtx = canvas.getContext("2d");
    this.orbTrail = [];
    const v0Slider = document.getElementById("orbV0Slider");
    const resetBtn = document.getElementById("resetOrbitBtn");
    if (v0Slider) {
      v0Slider.addEventListener("input", (e) => {
        this.orbState.v0 = parseFloat(e.target.value);
        document.getElementById("orbV0Val").textContent = this.orbState.v0.toFixed(2);
        this.resetOrbit();
      });
    }
    if (resetBtn) {
      resetBtn.addEventListener("click", () => this.resetOrbit());
    }
  }
  resetOrbit() {
    this.orbState.x = 150;
    this.orbState.y = 0;
    this.orbState.vx = 0;
    this.orbState.vy = this.orbState.v0;
    this.orbTrail = [];
  }
  loopOrbital() {
    if (this.activeSim !== "orbital")
      return;
    this.updateOrbit();
    this.drawOrbit();
    this.animFrame = requestAnimationFrame(() => this.loopOrbital());
  }
  updateOrbit() {
    const dt = 0.5;
    const steps = 4;
    for (let i = 0;i < steps; i++) {
      const r2 = this.orbState.x * this.orbState.x + this.orbState.y * this.orbState.y;
      const r = Math.sqrt(r2);
      const f = this.orbState.G * this.orbState.massStar / r2;
      const ax = -f * (this.orbState.x / r);
      const ay = -f * (this.orbState.y / r);
      this.orbState.vx += ax * dt;
      this.orbState.vy += ay * dt;
      this.orbState.x += this.orbState.vx * dt;
      this.orbState.y += this.orbState.vy * dt;
    }
    this.orbTrail.push({ x: this.orbState.x, y: this.orbState.y });
    if (this.orbTrail.length > 300)
      this.orbTrail.shift();
  }
  drawOrbit() {
    const ctx = this.orbCtx;
    const canvas = ctx.canvas;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const cx = w / 2;
    const cy = h / 2;
    ctx.strokeStyle = "rgba(6, 182, 212, 0.4)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0;i < this.orbTrail.length; i++) {
      const pt = this.orbTrail[i];
      if (i === 0)
        ctx.moveTo(cx + pt.x, cy + pt.y);
      else
        ctx.lineTo(cx + pt.x, cy + pt.y);
    }
    ctx.stroke();
    ctx.fillStyle = "#ffcc00";
    ctx.shadowColor = "#ffcc00";
    ctx.shadowBlur = 20;
    ctx.beginPath();
    ctx.arc(cx, cy, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    const px = cx + this.orbState.x;
    const py = cy + this.orbState.y;
    ctx.fillStyle = "#06b6d4";
    ctx.beginPath();
    ctx.arc(px, py, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#ff2d55";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + this.orbState.vx * 20, py + this.orbState.vy * 20);
    ctx.stroke();
  }
}
window.ExpansionApp = new ExpansionSimulations;

// resources/universal_calculator/intuitionlab/js/app.js
class IntuitionApp {
  constructor() {
    this.currentSubject = "calculus";
    this.currentSub = "derivatives";
    this.calculusLab = null;
    this.physicsLab = null;
    this.algebraLab = null;
    this.searchPaletteOpen = false;
    this.guideModalOpen = false;
    this.simulations = [
      { id: "derivatives", subject: "calculus", title: "Derivatives & Tangent Limits", desc: "Secant-to-tangent limit Δx → 0 with synchronized derivative f'(x) curve trace.", tags: ["derivative", "tangent", "secant", "limit", "slope", "calculus"] },
      { id: "riemann", subject: "calculus", title: "Definite Integrals & Riemann Sums", desc: "Left/Right/Midpoint/Trapezoid sums, draggable a & b boundaries, and animated slice melting.", tags: ["integral", "riemann", "area", "trapezoid", "sum", "calculus"] },
      { id: "ftc", subject: "calculus", title: "Fundamental Theorem of Calculus", desc: "Area accumulation F(x) = ∫ f(t)dt with dynamic slope synchronization F'(x) = f(x).", tags: ["ftc", "fundamental", "accumulation", "slope", "calculus"] },
      { id: "gradient", subject: "calculus", title: "2D Gradient Descent Optimization", desc: "Downhill gradient vector field -∇f with momentum, learning rate, and contour terrains.", tags: ["gradient", "descent", "optimization", "machine learning", "vector field", "calculus"] },
      { id: "taylor", subject: "calculus", title: "Taylor Series Approximations", desc: "Wrap polynomial degrees around a function to approximate it around a center point a.", tags: ["taylor", "series", "polynomial", "approximation", "calculus"] },
      { id: "revolution", subject: "calculus", title: "Volume of Revolution", desc: "Sweep a 2D function area around an axis to construct a 3D solid.", tags: ["volume", "revolution", "solid", "disk", "washer", "calculus"] },
      { id: "projectile", subject: "physics", title: "Projectile Kinematics & Target Game", desc: "Real-time velocity decomposition (vx, vy), Δt=0.25s strobes, draggable hoop, and planetary gravities.", tags: ["projectile", "kinematics", "gravity", "velocity", "target", "physics"] },
      { id: "pendulum", subject: "physics", title: "Damped Pendulum & Phase Space", desc: "Real-time Ek vs Ep energy bars with synchronized phase space orbit plot (θ, ω).", tags: ["pendulum", "phase space", "energy", "damping", "harmonic", "physics"] },
      { id: "optics", subject: "physics", title: "Optics & Snell's Law Refraction", desc: "Refraction across media, wavefront speed change, and Total Internal Reflection at critical angle θc.", tags: ["optics", "snell", "refraction", "tir", "light", "physics"] },
      { id: "wave", subject: "physics", title: "Dual-Source Wave Interference", desc: "2D ripple tank with constructive peaks, destructive nodes, and fringe projection screen.", tags: ["wave", "interference", "double slit", "ripple", "fringes", "physics"] },
      { id: "orbital", subject: "physics", title: "Orbital Mechanics & Kepler's Laws", desc: "Simulate a planet orbiting a star. Watch the velocity vector change and see equal areas swept in equal times.", tags: ["orbital", "gravity", "kepler", "space", "physics"] },
      { id: "spring", subject: "physics", title: "Spring-Mass Harmonic Oscillator", desc: "Drag the mass to stretch the spring. Watch the continuous exchange of Kinetic and Potential Energy.", tags: ["spring", "mass", "oscillator", "hooke", "energy", "physics"] },
      { id: "matrix", subject: "algebra", title: "2D Matrix Transformations", desc: "3Blue1Brown grid warping, basis handles î & ĵ, det(A) orientation flip, and eigenvector span axes.", tags: ["matrix", "linear algebra", "determinant", "eigenvector", "transformation", "algebra"] },
      { id: "quadratic", subject: "algebra", title: "Quadratic Functions & Discriminant", desc: "Vertex form, axis of symmetry, and real-time discriminant gauge Δ = b² - 4ac (real vs complex roots).", tags: ["quadratic", "parabola", "discriminant", "roots", "algebra"] },
      { id: "trig", subject: "algebra", title: "Unit Circle & Trigonometric Waves", desc: "Rotating angle θ projecting cyan cosine and rose sine bars, unwinding into live running sine graph.", tags: ["unit circle", "trigonometry", "sine", "cosine", "wave", "algebra"] },
      { id: "linear", subject: "algebra", title: "Systems of Linear Equations", desc: "Geometric intersection of two lines with Cramer's rule determinant classification.", tags: ["linear system", "cramer", "intersection", "determinant", "algebra"] },
      { id: "complex", subject: "algebra", title: "Complex Plane & Euler's Formula", desc: "Visualize e^(iθ) = cos(θ) + i sin(θ) and the relationship between circular motion, real, and imaginary components.", tags: ["complex", "euler", "imaginary", "real", "algebra"] },
      { id: "eigen", subject: "algebra", title: "Eigenvectors & Eigenvalues", desc: "Discover the invariant vectors that remain on their original span during a linear transformation.", tags: ["eigenvector", "eigenvalue", "matrix", "transformation", "algebra"] }
    ];
  }
  init() {
    this.calculusLab = new CalculusLab;
    this.calculusLab.init();
    this.physicsLab = new PhysicsLab;
    this.physicsLab.init();
    this.algebraLab = new AlgebraLab;
    this.algebraLab.init();
    this.bindNavigation();
    this.bindKeyboardShortcuts();
    this.bindSearchPalette();
    this.bindModalGuide();
    this.bindExtraTools();
    window.addEventListener("hashchange", () => {
      this.handleHashChange();
    });
    window.addEventListener("message", (e) => {
      if (e.data && (e.data.type === "NAVIGATE" || e.data.simId)) {
        this.goToHash(e.data.hash || e.data.simId);
      }
    });
    document.addEventListener("click", (e) => {
      const link = e.target.closest("a");
      if (link) {
        const href = link.getAttribute("href");
        if (href && href.startsWith("#")) {
          e.preventDefault();
          this.goToHash(href);
        } else if (href && href.includes("#")) {
          const hash = href.split("#")[1];
          if (hash && this.simulations.some((s) => s.id === hash)) {
            e.preventDefault();
            this.goToHash(hash);
          }
        }
      }
    });
    if (window.location.hash) {
      this.goToHash(window.location.hash);
    } else {
      this.switchSubject("calculus");
      this.switchSub("derivatives");
    }
  }
  handleHashChange() {
    if (window.location.hash) {
      this.goToHash(window.location.hash);
    }
  }
  goToHash(hash) {
    if (!hash)
      return;
    const cleanHash = hash.replace(/^#/, "");
    const match = this.simulations.find((s) => s.id === cleanHash);
    if (match) {
      if (this.currentSubject !== match.subject) {
        this.currentSubject = match.subject;
        document.querySelectorAll("[data-subject-tab]").forEach((tab) => {
          const isActive = tab.dataset.subjectTab === match.subject;
          tab.classList.toggle("active", isActive);
          tab.setAttribute("aria-selected", isActive ? "true" : "false");
        });
        document.querySelectorAll("[data-subject-section]").forEach((sec) => {
          const isMatch = sec.dataset.subjectSection === match.subject;
          if (isMatch) {
            sec.removeAttribute("hidden");
            sec.classList.add("active");
          } else {
            sec.setAttribute("hidden", "");
            sec.classList.remove("active");
          }
        });
        document.querySelectorAll("[data-sub-tab]").forEach((btn) => {
          const subId = btn.dataset.subTab;
          const sim = this.simulations.find((s) => s.id === subId);
          const isMatch = sim && sim.subject === match.subject;
          if (isMatch) {
            btn.removeAttribute("hidden");
          } else {
            btn.setAttribute("hidden", "");
          }
        });
      }
      this.switchSub(match.id);
      if (window.location.hash !== "#" + cleanHash) {
        try {
          history.replaceState(null, "", "#" + cleanHash);
        } catch (_) {
          window.location.hash = cleanHash;
        }
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }
  bindNavigation() {
    document.querySelectorAll("[data-subject-tab]").forEach((tab) => {
      tab.addEventListener("click", (e) => {
        const sub = tab.dataset.subjectTab;
        this.switchSubject(sub);
        soundSynth.playClick(500, 0.04);
      });
    });
    document.querySelectorAll("[data-sub-tab]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const sub = btn.dataset.subTab;
        this.switchSub(sub);
        soundSynth.playClick(560, 0.03);
      });
    });
  }
  switchSubject(subjectName) {
    this.currentSubject = subjectName;
    document.querySelectorAll("[data-subject-tab]").forEach((tab) => {
      const isActive = tab.dataset.subjectTab === subjectName;
      tab.classList.toggle("active", isActive);
      tab.setAttribute("aria-selected", isActive ? "true" : "false");
    });
    document.querySelectorAll("[data-subject-section]").forEach((sec) => {
      const isMatch = sec.dataset.subjectSection === subjectName;
      if (isMatch) {
        sec.removeAttribute("hidden");
        sec.classList.add("active");
      } else {
        sec.setAttribute("hidden", "");
        sec.classList.remove("active");
      }
    });
    document.querySelectorAll("[data-sub-tab]").forEach((btn) => {
      const subId = btn.dataset.subTab;
      const sim = this.simulations.find((s) => s.id === subId);
      const isMatch = sim && sim.subject === subjectName;
      if (isMatch) {
        btn.removeAttribute("hidden");
      } else {
        btn.setAttribute("hidden", "");
      }
    });
    const validSubs = this.simulations.filter((s) => s.subject === subjectName).map((s) => s.id);
    if (!validSubs.includes(this.currentSub)) {
      this.switchSub(validSubs[0]);
    } else {
      this.switchSub(this.currentSub);
    }
  }
  switchSub(subId) {
    const sim = this.simulations.find((s) => s.id === subId);
    if (sim && sim.subject !== this.currentSubject) {
      this.currentSub = subId;
      this.switchSubject(sim.subject);
      return;
    }
    this.currentSub = subId;
    if (window.location.hash !== "#" + subId) {
      try {
        history.replaceState(null, "", "#" + subId);
      } catch (_) {
        window.location.hash = subId;
      }
    }
    if (this.calculusLab)
      this.calculusLab.activeSub = subId;
    if (this.physicsLab)
      this.physicsLab.activeSub = subId;
    if (this.algebraLab)
      this.algebraLab.activeSub = subId;
    if (window.ExpansionApp)
      window.ExpansionApp.startSim(subId);
    document.querySelectorAll("[data-sub-tab]").forEach((btn) => {
      const isActive = btn.dataset.subTab === subId;
      btn.classList.toggle("active", isActive);
    });
    document.querySelectorAll("[data-sub-panel]").forEach((panel) => {
      const isMatch = panel.dataset.subPanel === subId;
      if (isMatch) {
        panel.removeAttribute("hidden");
        panel.classList.add("active");
      } else {
        panel.setAttribute("hidden", "");
        panel.classList.remove("active");
      }
    });
    window.dispatchEvent(new Event("resize"));
    setTimeout(() => {
      window.dispatchEvent(new Event("resize"));
    }, 50);
  }
  bindKeyboardShortcuts() {
    window.addEventListener("keydown", (e) => {
      if (e.target.matches("input, select, textarea"))
        return;
      if (e.key === "1") {
        e.preventDefault();
        this.switchSubject("calculus");
      } else if (e.key === "2") {
        e.preventDefault();
        this.switchSubject("physics");
      } else if (e.key === "3") {
        e.preventDefault();
        this.switchSubject("algebra");
      } else if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        this.toggleActiveSimulation();
      } else if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        this.resetActiveSimulation();
      } else if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        this.toggleSearchPalette();
      } else if (e.key === "?" || e.shiftKey && e.key === "/") {
        e.preventDefault();
        this.toggleGuideModal();
      } else if (e.key === "Escape") {
        if (this.searchPaletteOpen)
          this.toggleSearchPalette(false);
        if (this.guideModalOpen)
          this.toggleGuideModal(false);
      }
    });
  }
  toggleActiveSimulation() {
    if (this.currentSub === "gradient") {
      const playBtn = document.getElementById("gdPlayBtn");
      if (playBtn)
        playBtn.click();
    } else if (this.currentSub === "projectile") {
      const launchBtn = document.getElementById("projLaunchBtn");
      if (launchBtn)
        launchBtn.click();
    } else if (this.currentSub === "pendulum") {
      const playBtn = document.getElementById("pendPlayBtn");
      if (playBtn)
        playBtn.click();
    } else if (this.currentSub === "trig") {
      const autoBtn = document.getElementById("trigAutoToggle");
      if (autoBtn)
        autoBtn.click();
    } else if (this.currentSub === "derivatives") {
      const limitBtn = document.getElementById("derivLimitBtn");
      if (limitBtn)
        limitBtn.click();
    } else if (this.currentSub === "riemann") {
      const meltBtn = document.getElementById("riemannMeltBtn");
      if (meltBtn)
        meltBtn.click();
    }
  }
  resetActiveSimulation() {
    if (this.currentSub === "derivatives") {
      const btn = document.getElementById("derivResetBtn");
      if (btn)
        btn.click();
    } else if (this.currentSub === "gradient") {
      const btn = document.getElementById("gdResetBtn");
      if (btn)
        btn.click();
    } else if (this.currentSub === "projectile") {
      const btn = document.getElementById("projResetBtn");
      if (btn)
        btn.click();
    } else if (this.currentSub === "pendulum") {
      const btn = document.getElementById("pendResetBtn");
      if (btn)
        btn.click();
    } else if (this.currentSub === "matrix") {
      const btn = document.getElementById("matrixResetBtn");
      if (btn)
        btn.click();
    }
  }
  bindSearchPalette() {
    const triggerBtn = document.getElementById("searchPaletteTrigger");
    const overlay = document.getElementById("searchPaletteOverlay");
    const input = document.getElementById("searchPaletteInput");
    const resultsList = document.getElementById("searchPaletteResults");
    if (triggerBtn) {
      triggerBtn.addEventListener("click", () => this.toggleSearchPalette(true));
    }
    if (overlay) {
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay)
          this.toggleSearchPalette(false);
      });
    }
    this.paletteSelectedIndex = 0;
    this.currentMatches = [];
    if (input) {
      input.addEventListener("input", (e) => {
        this.renderSearchResults(e.target.value);
      });
      input.addEventListener("keydown", (e) => {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          if (this.currentMatches.length > 0) {
            this.paletteSelectedIndex = (this.paletteSelectedIndex + 1) % this.currentMatches.length;
            this.updatePaletteSelection();
          }
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          if (this.currentMatches.length > 0) {
            this.paletteSelectedIndex = (this.paletteSelectedIndex - 1 + this.currentMatches.length) % this.currentMatches.length;
            this.updatePaletteSelection();
          }
        } else if (e.key === "Enter") {
          e.preventDefault();
          if (this.currentMatches[this.paletteSelectedIndex]) {
            const item = this.currentMatches[this.paletteSelectedIndex];
            this.switchSubject(item.subject);
            this.switchSub(item.id);
            this.toggleSearchPalette(false);
            soundSynth.playClick(640, 0.05);
          }
        } else if (e.key === "Escape") {
          e.preventDefault();
          this.toggleSearchPalette(false);
        }
      });
    }
  }
  updatePaletteSelection() {
    const resultsList = document.getElementById("searchPaletteResults");
    if (!resultsList)
      return;
    const items = resultsList.querySelectorAll(".search-item");
    items.forEach((item, idx) => {
      item.classList.toggle("selected", idx === this.paletteSelectedIndex);
      if (idx === this.paletteSelectedIndex) {
        item.scrollIntoView({ block: "nearest" });
      }
    });
  }
  toggleSearchPalette(forceState = null) {
    const overlay = document.getElementById("searchPaletteOverlay");
    const input = document.getElementById("searchPaletteInput");
    if (!overlay)
      return;
    this.searchPaletteOpen = forceState !== null ? forceState : !this.searchPaletteOpen;
    overlay.hidden = !this.searchPaletteOpen;
    overlay.classList.toggle("open", this.searchPaletteOpen);
    if (this.searchPaletteOpen) {
      this.paletteSelectedIndex = 0;
      if (input) {
        input.value = "";
        input.focus();
      }
      this.renderSearchResults("");
      soundSynth.playClick(600, 0.04);
    }
  }
  renderSearchResults(query) {
    const resultsList = document.getElementById("searchPaletteResults");
    if (!resultsList)
      return;
    const q = query.trim().toLowerCase();
    this.currentMatches = this.simulations.filter((s) => {
      if (!q)
        return true;
      return s.title.toLowerCase().includes(q) || s.desc.toLowerCase().includes(q) || s.tags.some((t) => t.toLowerCase().includes(q));
    });
    this.paletteSelectedIndex = 0;
    resultsList.innerHTML = "";
    if (this.currentMatches.length === 0) {
      resultsList.innerHTML = `<li class="search-empty">No simulations match "${query}". Try "calculus", "matrix", "optics", or "projectile".</li>`;
      return;
    }
    this.currentMatches.forEach((item, index) => {
      const li = document.createElement("li");
      li.className = `search-item ${index === 0 ? "selected" : ""}`;
      const subjectColor = item.subject === "calculus" ? COLORS.cyan : item.subject === "physics" ? COLORS.amber : COLORS.rose;
      li.innerHTML = `
                <div class="search-item-info">
                    <span class="search-item-badge" style="color: ${subjectColor}; border-color: ${subjectColor}44;">${item.subject.toUpperCase()}</span>
                    <strong>${item.title}</strong>
                    <p>${item.desc}</p>
                </div>
                <span class="search-item-enter">↵</span>
            `;
      li.addEventListener("click", () => {
        this.switchSubject(item.subject);
        this.switchSub(item.id);
        this.toggleSearchPalette(false);
        soundSynth.playClick(640, 0.05);
      });
      resultsList.appendChild(li);
    });
  }
  bindModalGuide() {
    const guideBtn = document.getElementById("modalGuideTrigger");
    const overlay = document.getElementById("modalGuideOverlay");
    const closeBtn = document.getElementById("modalGuideClose");
    if (guideBtn) {
      guideBtn.addEventListener("click", () => this.toggleGuideModal(true));
    }
    if (closeBtn) {
      closeBtn.addEventListener("click", () => this.toggleGuideModal(false));
    }
    if (overlay) {
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay)
          this.toggleGuideModal(false);
      });
    }
  }
  toggleGuideModal(forceState = null) {
    const overlay = document.getElementById("modalGuideOverlay");
    if (!overlay)
      return;
    this.guideModalOpen = forceState !== null ? forceState : !this.guideModalOpen;
    overlay.hidden = !this.guideModalOpen;
    overlay.classList.toggle("open", this.guideModalOpen);
    if (this.guideModalOpen) {
      soundSynth.playClick(500, 0.05);
    }
  }
  bindExtraTools() {
    const soundBtn = document.getElementById("soundToggleBtn");
    if (soundBtn) {
      soundBtn.addEventListener("click", () => {
        soundSynth.muted = !soundSynth.muted;
        soundBtn.textContent = soundSynth.muted ? "\uD83D\uDD07 Sound Off" : "\uD83D\uDD0A Sound On";
        soundBtn.classList.toggle("muted", soundSynth.muted);
        if (!soundSynth.muted)
          soundSynth.playClick(600, 0.05);
      });
    }
    const exportBtn = document.getElementById("exportCanvasBtn");
    if (exportBtn) {
      exportBtn.addEventListener("click", () => {
        this.exportCurrentCanvas();
      });
    }
  }
  exportCurrentCanvas() {
    const activePanel = document.querySelector("[data-sub-panel].active");
    if (!activePanel)
      return;
    const canvas = activePanel.querySelector("canvas");
    if (!canvas)
      return;
    try {
      const link = document.createElement("a");
      link.download = `IntuitionLab-${this.currentSub}-${Date.now()}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
      soundSynth.playSuccess();
    } catch (_) {}
  }
}
document.addEventListener("DOMContentLoaded", () => {
  window.intuitionLabApp = new IntuitionApp;
  window.intuitionLabApp.init();
});
