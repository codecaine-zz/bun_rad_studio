/**
 * IntuitionLab - Canvas Utilities & Interactive Graphics Engine
 * High-performance 60fps 2D Canvas tools with Retina/4K HiDPI scaling,
 * bidirectional Cartesian coordinate systems, glowing vector arrows with pill badges,
 * and multi-touch draggable handles.
 */

// Neon Color Palette Tokens matching IntuitionLab design spec
export const COLORS = {
    bgDark: '#070a12',
    cardBg: 'rgba(15, 23, 42, 0.65)',
    gridMinor: 'rgba(255, 255, 255, 0.04)',
    gridMajor: 'rgba(255, 255, 255, 0.12)',
    axis: 'rgba(255, 255, 255, 0.35)',
    axisText: 'rgba(255, 255, 255, 0.55)',
    cyan: '#06b6d4',
    cyanGlow: 'rgba(6, 182, 212, 0.45)',
    rose: '#f43f5e',
    roseGlow: 'rgba(244, 63, 94, 0.45)',
    emerald: '#10b981',
    emeraldGlow: 'rgba(16, 185, 129, 0.45)',
    amber: '#f59e0b',
    amberGlow: 'rgba(245, 158, 11, 0.45)',
    violet: '#8b5cf6',
    violetGlow: 'rgba(139, 92, 246, 0.45)',
    blue: '#3b82f6',
    blueGlow: 'rgba(59, 130, 246, 0.45)',
    white: '#ffffff',
    textDim: '#94a3b8'
};

/**
 * HiDPICanvas: Manages high-resolution scaling for Retina, 4K, and high-density screens.
 */
export class HiDPICanvas {
    constructor(canvas, onResize = null) {
        this.canvas = typeof canvas === 'string' ? document.querySelector(canvas) : canvas;
        if (!this.canvas) throw new Error('Canvas element not found');
        this.ctx = this.canvas.getContext('2d', { alpha: true });
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
            if (this.onResize) this.onResize(this.logicalWidth, this.logicalHeight);
        });
        this.resizeObserver.observe(this.canvas.parentElement || this.canvas);
        window.addEventListener('resize', () => {
            this.dpr = window.devicePixelRatio || 1;
            this.resize();
            if (this.onResize) this.onResize(this.logicalWidth, this.logicalHeight);
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

        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';

        // Reset and scale context matrix
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.scale(this.dpr, this.dpr);
        this.ctx.imageSmoothingEnabled = true;
        this.ctx.imageSmoothingQuality = 'high';
    }

    clear() {
        this.ctx.save();
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.restore();
    }
}

/**
 * CoordinateSystem: Bidirectional mathematical-to-pixel Cartesian mapping
 * with customizable gridlines, numeric labels, and origin positioning.
 */
export class CoordinateSystem {
    constructor(canvasUtil, options = {}) {
        this.cu = canvasUtil;
        this.options = Object.assign({
            originRatioX: 0.5, // 0 = left, 0.5 = center, 1 = right
            originRatioY: 0.5, // 0 = top, 0.5 = center, 1 = bottom
            unitsPerPixelX: 0.02,
            unitsPerPixelY: 0.02,
            xStep: 1,
            yStep: 1,
            minorSubdivisions: 5,
            showMinorGrid: true,
            showMajorGrid: true,
            showAxes: true,
            showLabels: true,
            xLabel: 'x',
            yLabel: 'y',
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
        this.originX = this.options.padding - (xMin / this.options.unitsPerPixelX);

        if (yMin !== null && yMax !== null) {
            const availableH = this.cu.logicalHeight - this.options.padding * 2;
            const spanY = yMax - yMin;
            this.options.unitsPerPixelY = spanY / availableH;
            this.originY = this.cu.logicalHeight - this.options.padding + (yMin / this.options.unitsPerPixelY);
        }
    }

    toScreenX(mathX) {
        return this.originX + (mathX / this.options.unitsPerPixelX);
    }

    toScreenY(mathY) {
        return this.originY - (mathY / this.options.unitsPerPixelY);
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

        // Minor gridlines
        if (this.options.showMinorGrid) {
            ctx.beginPath();
            ctx.strokeStyle = COLORS.gridMinor;
            ctx.lineWidth = 1;

            const firstMinorX = Math.floor(bounds.xMin / minorStepX) * minorStepX;
            for (let x = firstMinorX; x <= bounds.xMax; x += minorStepX) {
                const sx = Math.round(this.toScreenX(x)) + 0.5;
                ctx.moveTo(sx, 0);
                ctx.lineTo(sx, h);
            }

            const firstMinorY = Math.floor(bounds.yMin / minorStepY) * minorStepY;
            for (let y = firstMinorY; y <= bounds.yMax; y += minorStepY) {
                const sy = Math.round(this.toScreenY(y)) + 0.5;
                ctx.moveTo(0, sy);
                ctx.lineTo(w, sy);
            }
            ctx.stroke();
        }

        // Major gridlines
        if (this.options.showMajorGrid) {
            ctx.beginPath();
            ctx.strokeStyle = COLORS.gridMajor;
            ctx.lineWidth = 1;

            const firstMajorX = Math.floor(bounds.xMin / stepX) * stepX;
            for (let x = firstMajorX; x <= bounds.xMax; x += stepX) {
                if (Math.abs(x) < 1e-6) continue; // skip axis line
                const sx = Math.round(this.toScreenX(x)) + 0.5;
                ctx.moveTo(sx, 0);
                ctx.lineTo(sx, h);
            }

            const firstMajorY = Math.floor(bounds.yMin / stepY) * stepY;
            for (let y = firstMajorY; y <= bounds.yMax; y += stepY) {
                if (Math.abs(y) < 1e-6) continue;
                const sy = Math.round(this.toScreenY(y)) + 0.5;
                ctx.moveTo(0, sy);
                ctx.lineTo(w, sy);
            }
            ctx.stroke();
        }

        // Main Axes
        if (this.options.showAxes) {
            ctx.save();
            ctx.strokeStyle = COLORS.axis;
            ctx.lineWidth = 1.5;
            ctx.beginPath();

            // X Axis
            if (this.originY >= 0 && this.originY <= h) {
                const sy = Math.round(this.originY) + 0.5;
                ctx.moveTo(0, sy);
                ctx.lineTo(w, sy);
            }

            // Y Axis
            if (this.originX >= 0 && this.originX <= w) {
                const sx = Math.round(this.originX) + 0.5;
                ctx.moveTo(sx, 0);
                ctx.lineTo(sx, h);
            }
            ctx.stroke();

            // Labels and Ticks
            if (this.options.showLabels) {
                ctx.fillStyle = COLORS.axisText;
                ctx.font = '10px Inter, system-ui, sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';

                const firstMajorX = Math.floor(bounds.xMin / stepX) * stepX;
                for (let x = firstMajorX; x <= bounds.xMax; x += stepX) {
                    if (Math.abs(x) < 1e-6) continue;
                    const sx = this.toScreenX(x);
                    const sy = Math.max(14, Math.min(h - 18, this.originY + 6));
                    const label = Number(x.toFixed(2)).toString();
                    ctx.fillText(label, sx, sy);
                }

                ctx.textAlign = 'right';
                ctx.textBaseline = 'middle';
                const firstMajorY = Math.floor(bounds.yMin / stepY) * stepY;
                for (let y = firstMajorY; y <= bounds.yMax; y += stepY) {
                    if (Math.abs(y) < 1e-6) continue;
                    const sy = this.toScreenY(y);
                    const sx = Math.max(28, Math.min(w - 10, this.originX - 6));
                    const label = Number(y.toFixed(2)).toString();
                    ctx.fillText(label, sx, sy);
                }

                // Origin Label
                if (this.originX >= 0 && this.originX <= w && this.originY >= 0 && this.originY <= h) {
                    ctx.textAlign = 'right';
                    ctx.textBaseline = 'top';
                    ctx.fillText('0', this.originX - 6, this.originY + 6);
                }
            }
            ctx.restore();
        }
    }
}

/**
 * drawVector: Draws glowing directional vector arrows with normal-offset pill badges.
 */
export function drawVector(ctx, fromX, fromY, toX, toY, options = {}) {
    const opts = Object.assign({
        color: COLORS.cyan,
        glowColor: COLORS.cyanGlow,
        lineWidth: 2.5,
        arrowSize: 10,
        label: null,
        badgeOffset: 16,
        badgeBg: 'rgba(7, 10, 18, 0.88)',
        badgeBorder: 'rgba(255, 255, 255, 0.2)',
        dashed: false,
        dashPattern: [4, 4]
    }, options);

    const dx = toX - fromX;
    const dy = toY - fromY;
    const len = Math.hypot(dx, dy);

    if (len < 1) return;

    const angle = Math.atan2(dy, dx);
    const arrowLen = Math.min(opts.arrowSize, len * 0.4);

    ctx.save();

    // Glow filter
    if (opts.glowColor) {
        ctx.shadowColor = opts.glowColor;
        ctx.shadowBlur = 8;
    }

    ctx.strokeStyle = opts.color;
    ctx.fillStyle = opts.color;
    ctx.lineWidth = opts.lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (opts.dashed) {
        ctx.setLineDash(opts.dashPattern);
    } else {
        ctx.setLineDash([]);
    }

    // Shaft
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    // Shorten shaft slightly so it meets base of arrowhead cleanly
    const shaftEndX = toX - Math.cos(angle) * (arrowLen * 0.6);
    const shaftEndY = toY - Math.sin(angle) * (arrowLen * 0.6);
    ctx.lineTo(shaftEndX, shaftEndY);
    ctx.stroke();

    // Solid Arrowhead
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(
        toX - arrowLen * Math.cos(angle - Math.PI / 6),
        toY - arrowLen * Math.sin(angle - Math.PI / 6)
    );
    ctx.lineTo(
        toX - (arrowLen * 0.6) * Math.cos(angle),
        toY - (arrowLen * 0.6) * Math.sin(angle)
    );
    ctx.lineTo(
        toX - arrowLen * Math.cos(angle + Math.PI / 6),
        toY - arrowLen * Math.sin(angle + Math.PI / 6)
    );
    ctx.closePath();
    ctx.fill();

    // Pill Badge offset along normal vector
    if (opts.label) {
        ctx.shadowBlur = 0;
        const midX = (fromX + toX) / 2;
        const midY = (fromY + toY) / 2;

        // Perpendicular normal vector (-dy, dx) / len
        const nx = -dy / len;
        const ny = dx / len;

        const badgeX = midX + nx * opts.badgeOffset;
        const badgeY = midY + ny * opts.badgeOffset;

        ctx.font = 'bold 11px Inter, system-ui, sans-serif';
        const textMetrics = ctx.measureText(opts.label);
        const paddingH = 7;
        const paddingV = 4;
        const badgeW = textMetrics.width + paddingH * 2;
        const badgeH = 18;

        const bx = badgeX - badgeW / 2;
        const by = badgeY - badgeH / 2;
        const radius = 9;

        // Badge pill background
        ctx.fillStyle = opts.badgeBg;
        ctx.strokeStyle = opts.badgeBorder || opts.color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(bx, by, badgeW, badgeH, radius);
        ctx.fill();
        ctx.stroke();

        // Badge text
        ctx.fillStyle = opts.color;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(opts.label, badgeX, badgeY + 0.5);
    }

    ctx.restore();
}

/**
 * DraggableHandle: Interactive canvas handle with mouse/touch hitboxes,
 * pulse glow animations, hover states, and smooth drag mechanics.
 */
export class DraggableHandle {
    constructor(x, y, options = {}) {
        this.x = x;
        this.y = y;
        this.options = Object.assign({
            radius: 8,
            hitRadius: 22,
            color: COLORS.cyan,
            glowColor: COLORS.cyanGlow,
            label: '',
            pulse: true,
            cursor: 'grab',
            activeCursor: 'grabbing',
            constrain: null // function(x, y) => { x, y }
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
        const currentR = this.isDragging ? r + 3 : (this.isHovered ? r + 1.5 : r);

        // Ambient glow ring
        ctx.shadowColor = this.options.glowColor;
        ctx.shadowBlur = this.isDragging ? 18 : (this.isHovered ? 12 : 8);

        // Outer translucent ring
        ctx.beginPath();
        ctx.arc(this.x, this.y, currentR + 4 + pulse, 0, Math.PI * 2);
        ctx.fillStyle = this.options.glowColor;
        ctx.fill();

        // Main core circle
        ctx.beginPath();
        ctx.arc(this.x, this.y, currentR, 0, Math.PI * 2);
        ctx.fillStyle = this.isDragging ? '#ffffff' : this.options.color;
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Label if present
        if (this.options.label) {
            ctx.shadowBlur = 0;
            ctx.font = '600 11px Inter, system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillStyle = '#ffffff';
            ctx.fillText(this.options.label, this.x, this.y - currentR - 6);
        }

        ctx.restore();
    }
}

/**
 * HandleController: Binds mouse and touch drag interactions across a canvas.
 */
export class HandleController {
    constructor(canvas, handles = [], onChange = null) {
        this.canvas = typeof canvas === 'string' ? document.querySelector(canvas) : canvas;
        this.handles = handles;
        this.onChange = onChange;
        this.activeHandle = null;
        this.dragOffset = { x: 0, y: 0 };

        this.boundDown = this.onDown.bind(this);
        this.boundMove = this.onMove.bind(this);
        this.boundUp = this.onUp.bind(this);

        this.canvas.addEventListener('mousedown', this.boundDown);
        window.addEventListener('mousemove', this.boundMove);
        window.addEventListener('mouseup', this.boundUp);

        this.canvas.addEventListener('touchstart', this.boundDown, { passive: false });
        window.addEventListener('touchmove', this.boundMove, { passive: false });
        window.addEventListener('touchend', this.boundUp);
        window.addEventListener('touchcancel', this.boundUp);
    }

    addHandle(handle) {
        this.handles.push(handle);
    }

    removeHandle(handle) {
        const idx = this.handles.indexOf(handle);
        if (idx !== -1) this.handles.splice(idx, 1);
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
        // Find topmost matching handle (iterate backwards)
        for (let i = this.handles.length - 1; i >= 0; i--) {
            const h = this.handles[i];
            if (h.contains(pos.x, pos.y)) {
                if (e.cancelable) e.preventDefault();
                this.activeHandle = h;
                h.isDragging = true;
                this.dragOffset = { x: h.x - pos.x, y: h.y - pos.y };
                this.canvas.style.cursor = h.options.activeCursor || 'grabbing';
                if (soundSynth) soundSynth.playClick(600, 0.05);
                if (this.onChange) this.onChange(h, 'start');
                break;
            }
        }
    }

    onMove(e) {
        const pos = this.getPos(e);

        if (this.activeHandle) {
            if (e.cancelable) e.preventDefault();
            this.activeHandle.moveTo(pos.x + this.dragOffset.x, pos.y + this.dragOffset.y);
            if (this.onChange) this.onChange(this.activeHandle, 'drag');
            return;
        }

        // Hover test
        let foundHover = false;
        for (const h of this.handles) {
            const inside = h.contains(pos.x, pos.y);
            h.isHovered = inside;
            if (inside && !foundHover) {
                foundHover = true;
                this.canvas.style.cursor = h.options.cursor || 'grab';
            }
        }
        if (!foundHover) {
            this.canvas.style.cursor = 'default';
        }
    }

    onUp() {
        if (this.activeHandle) {
            this.activeHandle.isDragging = false;
            if (this.onChange) this.onChange(this.activeHandle, 'end');
            this.activeHandle = null;
            this.canvas.style.cursor = 'default';
        }
    }

    destroy() {
        this.canvas.removeEventListener('mousedown', this.boundDown);
        window.removeEventListener('mousemove', this.boundMove);
        window.removeEventListener('mouseup', this.boundUp);
        this.canvas.removeEventListener('touchstart', this.boundDown);
        window.removeEventListener('touchmove', this.boundMove);
        window.removeEventListener('touchend', this.boundUp);
        window.removeEventListener('touchcancel', this.boundUp);
    }
}

/**
 * SoundSynthesizer: Pure Web Audio API tactile audio micro-feedback.
 */
class SoundSynthesizer {
    constructor() {
        this.ctx = null;
        this.muted = false;
    }

    init() {
        if (!this.ctx && typeof window !== 'undefined') {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (AudioContext) this.ctx = new AudioContext();
        }
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    playClick(freq = 520, duration = 0.04) {
        if (this.muted) return;
        this.init();
        if (!this.ctx) return;

        try {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
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
        if (this.muted) return;
        this.init();
        if (!this.ctx) return;
        try {
            const now = this.ctx.currentTime;
            [523.25, 659.25, 783.99, 1046.50].forEach((freq, i) => {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'triangle';
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

export const soundSynth = new SoundSynthesizer();
