/**
 * IntuitionLab - Linear Algebra & Geometry Simulation Engine
 * 1. 2D Matrix Transformations (3Blue1Brown style grid warping, basis handles î and ĵ, det(A) orientation flip, eigenvector spans)
 * 2. Quadratic Functions & Discriminant (Vertex form, symmetry axis, Δ = b² - 4ac gauge, complex roots)
 * 3. Unit Circle & Trigonometric Waves (Rotating θ, cyan cos bar, rose sin bar, unwinding running sine graph)
 * 4. Systems of Linear Equations (Geometric intersection, Cramer's rule determinant classification)
 */

import { HiDPICanvas, CoordinateSystem, DraggableHandle, HandleController, drawVector, COLORS, soundSynth } from './canvas-utils.js';

export class AlgebraLab {
    constructor() {
        this.activeSub = 'matrix';
        this.animFrame = null;
        this.time = 0;

        // 1. Matrix state: A = [ [a, c], [b, d] ] where î -> [a, b]^T, ĵ -> [c, d]^T
        this.matrixState = {
            a: 1.0, // î.x
            b: 0.0, // î.y
            c: 0.0, // ĵ.x
            d: 1.0, // ĵ.y
            animating: false,
            animProgress: 0,
            targetMatrix: null,
            startMatrix: null
        };

        // Presets for Matrix
        this.matrixPresets = {
            identity: { a: 1, b: 0, c: 0, d: 1, name: 'Identity Matrix' },
            rotation45: { a: Math.SQRT1_2, b: Math.SQRT1_2, c: -Math.SQRT1_2, d: Math.SQRT1_2, name: 'Rotation 45°' },
            shearX: { a: 1, b: 0, c: 1.2, d: 1, name: 'Horizontal Shear' },
            reflection: { a: -1, b: 0, c: 0, d: 1, name: 'Y-Axis Reflection (det < 0)' },
            projection: { a: 1, b: 0, c: 0, d: 0, name: 'X-Projection (det = 0)' },
            scale: { a: 1.5, b: 0, c: 0, d: 1.5, name: 'Uniform Scaling 1.5x' }
        };

        // 2. Quadratic state: f(x) = a x² + b x + c
        this.quadState = {
            a: 1.0,
            b: -2.0,
            c: -1.0
        };

        // 3. Unit Circle & Trig state
        this.trigState = {
            theta: Math.PI / 4, // 45 degrees
            speed: 0.8,
            autoRotate: true,
            wavePoints: []
        };

        // 4. Linear Systems state: L1: a1 x + b1 y = c1, L2: a2 x + b2 y = c2
        this.linearState = {
            a1: 1, b1: 1, c1: 3,
            a2: 1, b2: -1, c2: 1
        };
    }

    init() {
        this.initMatrix();
        this.initQuadratic();
        this.initUnitCircle();
        this.initLinearSystems();
        this.startLoop();
    }

    /* =========================================================================
     * 1. 2D MATRIX TRANSFORMATIONS (3Blue1Brown Grid Warping & Eigenvectors)
     * ========================================================================= */
    initMatrix() {
        const canvas = document.getElementById('matrixCanvas');
        if (!canvas) return;

        this.matrixCu = new HiDPICanvas(canvas);
        this.matrixCoord = new CoordinateSystem(this.matrixCu, {
            originRatioX: 0.5,
            originRatioY: 0.5,
            unitsPerPixelX: 0.015,
            unitsPerPixelY: 0.015,
            xStep: 1,
            yStep: 1
        });

        // Draggable Handle for basis vector î tip [a, b]
        this.iHatHandle = new DraggableHandle(0, 0, {
            radius: 9,
            hitRadius: 26,
            color: COLORS.cyan,
            glowColor: COLORS.cyanGlow,
            label: 'î',
            constrain: (nx, ny) => {
                const mx = this.matrixCoord.toMathX(nx);
                const my = this.matrixCoord.toMathY(ny);
                this.matrixState.a = mx;
                this.matrixState.b = my;
                return { x: nx, y: ny };
            }
        });

        // Draggable Handle for basis vector ĵ tip [c, d]
        this.jHatHandle = new DraggableHandle(0, 0, {
            radius: 9,
            hitRadius: 26,
            color: COLORS.rose,
            glowColor: COLORS.roseGlow,
            label: 'ĵ',
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
        const presetSelect = document.getElementById('matrixPresetSelect');
        if (presetSelect) {
            presetSelect.addEventListener('change', e => {
                const p = this.matrixPresets[e.target.value];
                if (p) this.animateToMatrix(p);
            });
        }

        const resetBtn = document.getElementById('matrixResetBtn');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
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
        // Trace and Determinant
        const tr = a + d;
        const det = a * d - b * c;
        const disc = tr * tr - 4 * det;

        if (disc < -1e-6) {
            // Complex eigenvalues (pure rotation or spiral)
            return null;
        }

        const sqrtDisc = Math.sqrt(Math.max(0, disc));
        const l1 = (tr + sqrtDisc) / 2;
        const l2 = (tr - sqrtDisc) / 2;

        const getVec = lambda => {
            if (Math.abs(c) > 1e-4) {
                return { x: lambda - d, y: c };
            } else if (Math.abs(b) > 1e-4) {
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

        const aVal = document.getElementById('matrixAVal');
        const bVal = document.getElementById('matrixBVal');
        const cVal = document.getElementById('matrixCVal');
        const dVal = document.getElementById('matrixDVal');
        if (aVal) aVal.textContent = a.toFixed(2);
        if (bVal) bVal.textContent = b.toFixed(2);
        if (cVal) cVal.textContent = c.toFixed(2);
        if (dVal) dVal.textContent = d.toFixed(2);

        const detVal = document.getElementById('matrixDetVal');
        if (detVal) {
            let note = '';
            if (Math.abs(det) < 1e-4) note = ' (Singular / 1D Collapse!)';
            else if (det < 0) note = ' (Flipped Orientation!)';
            detVal.textContent = `${det.toFixed(3)}${note}`;
            detVal.style.color = det < 0 ? COLORS.rose : (Math.abs(det) < 1e-4 ? COLORS.amber : COLORS.emerald);
        }

        // Eigenvalues
        const eigen = this.computeEigenvectors(a, b, c, d);
        const eigenValEl = document.getElementById('matrixEigenVal');
        if (eigenValEl) {
            if (!eigen) {
                eigenValEl.textContent = 'Complex (Rotation with no invariant lines)';
            } else {
                eigenValEl.textContent = `λ₁ = ${eigen.l1.toFixed(2)}, λ₂ = ${eigen.l2.toFixed(2)}`;
            }
        }

        const latexEl = document.getElementById('matrixLatex');
        if (latexEl && window.katex) {
            try {
                window.katex.render(
                    `A = \\begin{pmatrix} ${a.toFixed(2)} & ${c.toFixed(2)} \\\\ ${b.toFixed(2)} & ${d.toFixed(2)} \\end{pmatrix}, \\quad \\det(A) = ad - bc = ${det.toFixed(2)}`,
                    latexEl,
                    { displayMode: false, throwOnError: false }
                );
            } catch (_) {}
        }
    }

    renderMatrix(dt) {
        if (!this.matrixCu) return;
        const ctx = this.matrixCu.ctx;
        const coord = this.matrixCoord;

        // Smooth matrix interpolation animation
        if (this.matrixState.animating) {
            this.matrixState.animProgress += dt * 2.0;
            if (this.matrixState.animProgress >= 1) {
                this.matrixState.animProgress = 1;
                this.matrixState.animating = false;
                this.matrixState.a = this.matrixState.targetMatrix.a;
                this.matrixState.b = this.matrixState.targetMatrix.b;
                this.matrixState.c = this.matrixState.targetMatrix.c;
                this.matrixState.d = this.matrixState.targetMatrix.d;
            } else {
                const ease = t => t * t * (3 - 2 * t);
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

        // 1. Draw Original Faint Background Grid
        coord.options.showAxes = false;
        coord.options.showMinorGrid = false;
        coord.drawGrid();

        const { a, b, c, d } = this.matrixState;
        const det = a * d - b * c;
        const bounds = coord.getBounds();

        // 2. Draw Transformed Warped Coordinate Grid (3Blue1Brown Style)
        ctx.save();
        ctx.lineWidth = 1;

        const gridRange = 6;
        for (let i = -gridRange; i <= gridRange; i++) {
            // Transformed vertical lines: x = i, y ranges from -gridRange to gridRange
            // Transformed (x, y) = x * [a, b]^T + y * [c, d]^T
            ctx.strokeStyle = i === 0 ? COLORS.cyan : 'rgba(6, 182, 212, 0.22)';
            ctx.beginPath();
            const p1x = i * a - gridRange * c;
            const p1y = i * b - gridRange * d;
            const p2x = i * a + gridRange * c;
            const p2y = i * b + gridRange * d;
            ctx.moveTo(coord.toScreenX(p1x), coord.toScreenY(p1y));
            ctx.lineTo(coord.toScreenX(p2x), coord.toScreenY(p2y));
            ctx.stroke();

            // Transformed horizontal lines: y = i, x ranges from -gridRange to gridRange
            ctx.strokeStyle = i === 0 ? COLORS.rose : 'rgba(244, 63, 94, 0.22)';
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

        // 3. Draw Transformed Unit Square Area (Determinant Area Parallelogram)
        const s0x = coord.toScreenX(0);
        const s0y = coord.toScreenY(0);
        const sIx = coord.toScreenX(a);
        const sIy = coord.toScreenY(b);
        const sCornerX = coord.toScreenX(a + c);
        const sCornerY = coord.toScreenY(b + d);
        const sJx = coord.toScreenX(c);
        const sJy = coord.toScreenY(d);

        ctx.save();
        // Glow and tint based on orientation (det > 0: emerald/cyan, det < 0: rose flipped!)
        ctx.fillStyle = det >= 0 ? 'rgba(16, 185, 129, 0.25)' : 'rgba(244, 63, 94, 0.3)';
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

        // Determinant Label inside unit square
        const midSquareX = (s0x + sCornerX) / 2;
        const midSquareY = (s0y + sCornerY) / 2;
        ctx.shadowBlur = 0;
        ctx.font = 'bold 12px Inter, system-ui, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`Area = ${Math.abs(det).toFixed(2)}`, midSquareX, midSquareY);
        ctx.restore();

        // 4. Draw Eigenvector Invariant Span Axes (if real)
        const eigen = this.computeEigenvectors(a, b, c, d);
        if (eigen) {
            ctx.save();
            ctx.strokeStyle = COLORS.amber;
            ctx.lineWidth = 1.8;
            ctx.setLineDash([6, 4]);

            [eigen.v1, eigen.v2].forEach(v => {
                const len = Math.hypot(v.x, v.y);
                if (len > 1e-4) {
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

        // 5. Draw Transformed Basis Vectors î and ĵ
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

        // 6. Draw Draggable Basis Vector Tips
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

    /* =========================================================================
     * 2. QUADRATIC FUNCTIONS & DISCRIMINANT GAUGE
     * ========================================================================= */
    initQuadratic() {
        const canvas = document.getElementById('quadCanvas');
        if (!canvas) return;

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
        ['a', 'b', 'c'].forEach(coeff => {
            const slider = document.getElementById(`quad${coeff.toUpperCase()}Slider`);
            if (slider) {
                slider.addEventListener('input', e => {
                    this.quadState[coeff] = parseFloat(e.target.value);
                    const valEl = document.getElementById(`quad${coeff.toUpperCase()}Val`);
                    if (valEl) valEl.textContent = this.quadState[coeff].toFixed(2);
                    this.updateQuadUI();
                });
            }
        });
    }

    updateQuadUI() {
        const { a, b, c } = this.quadState;
        const delta = b * b - 4 * a * c;

        // Vertex: h = -b / (2a), k = f(h)
        const h = -b / (2 * a);
        const k = a * h * h + b * h + c;

        const discValEl = document.getElementById('quadDiscVal');
        const rootDescEl = document.getElementById('quadRootDesc');

        if (discValEl) {
            discValEl.textContent = delta.toFixed(3);
            discValEl.style.color = delta > 0 ? COLORS.emerald : (Math.abs(delta) < 1e-4 ? COLORS.amber : COLORS.rose);
        }

        if (rootDescEl) {
            if (delta > 1e-4) {
                const r1 = (-b - Math.sqrt(delta)) / (2 * a);
                const r2 = (-b + Math.sqrt(delta)) / (2 * a);
                rootDescEl.textContent = `Two Real Roots: x₁ = ${r1.toFixed(2)}, x₂ = ${r2.toFixed(2)}`;
            } else if (Math.abs(delta) <= 1e-4) {
                rootDescEl.textContent = `Double Root: x = ${h.toFixed(2)}`;
            } else {
                const realPart = -b / (2 * a);
                const imagPart = Math.sqrt(-delta) / (2 * Math.abs(a));
                rootDescEl.textContent = `Complex Conjugates: ${realPart.toFixed(2)} ± ${imagPart.toFixed(2)}i`;
            }
        }

        const latexEl = document.getElementById('quadLatex');
        if (latexEl && window.katex) {
            try {
                window.katex.render(
                    `f(x) = ${a.toFixed(1)}x^2 + (${b.toFixed(1)})x + (${c.toFixed(1)}), \\quad \\Delta = b^2 - 4ac = ${delta.toFixed(2)}`,
                    latexEl,
                    { displayMode: false, throwOnError: false }
                );
            } catch (_) {}
        }
    }

    renderQuadratic() {
        if (!this.quadCu) return;
        const ctx = this.quadCu.ctx;
        const coord = this.quadCoord;
        this.quadCu.clear();
        coord.drawGrid();

        const { a, b, c } = this.quadState;
        const delta = b * b - 4 * a * c;
        const bounds = coord.getBounds();

        // 1. Draw Parabola Curve
        ctx.save();
        ctx.strokeStyle = delta >= 0 ? COLORS.cyan : COLORS.violet;
        ctx.lineWidth = 3;
        ctx.shadowColor = delta >= 0 ? COLORS.cyanGlow : COLORS.violetGlow;
        ctx.shadowBlur = 10;
        ctx.beginPath();

        let started = false;
        const step = (bounds.xMax - bounds.xMin) / 250;
        for (let x = bounds.xMin; x <= bounds.xMax; x += step) {
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

        // 2. Axis of Symmetry (Dashed vertical line)
        const h = -b / (2 * a);
        const k = a * h * h + b * h + c;
        const sHx = coord.toScreenX(h);

        ctx.save();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(sHx, 0);
        ctx.lineTo(sHx, this.quadCu.logicalHeight);
        ctx.stroke();
        ctx.restore();

        // 3. Vertex Point
        const sHy = coord.toScreenY(k);
        ctx.save();
        ctx.fillStyle = COLORS.amber;
        ctx.shadowColor = COLORS.amberGlow;
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(sHx, sHy, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.shadowBlur = 0;
        ctx.font = 'bold 11px Inter, system-ui, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.fillText(`Vertex (${h.toFixed(1)}, ${k.toFixed(1)})`, sHx, sHy - 12);
        ctx.restore();

        // 4. Roots (Real roots on x-axis)
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
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 2;
                ctx.stroke();

                ctx.shadowBlur = 0;
                ctx.font = 'bold 11px Inter, system-ui, sans-serif';
                ctx.fillStyle = COLORS.emerald;
                ctx.textAlign = 'center';
                ctx.fillText(`x_${idx + 1} = ${root.toFixed(2)}`, sRootX, sZeroY + 16);
                ctx.restore();
            });
        }
    }

    /* =========================================================================
     * 3. UNIT CIRCLE & TRIGONOMETRIC WAVES
     * ========================================================================= */
    initUnitCircle() {
        const circleCanvas = document.getElementById('trigCircleCanvas');
        const waveCanvas = document.getElementById('trigWaveCanvas');
        if (!circleCanvas || !waveCanvas) return;

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

        // Draggable Angle Point Handle on Unit Circle
        this.trigAngleHandle = new DraggableHandle(0, 0, {
            radius: 8,
            hitRadius: 24,
            color: COLORS.rose,
            glowColor: COLORS.roseGlow,
            label: 'P(θ)',
            constrain: (nx, ny) => {
                const ox = this.trigCircleCoord.originX;
                const oy = this.trigCircleCoord.originY;
                const dx = nx - ox;
                const dy = oy - ny; // math Y is upward
                const theta = Math.atan2(dy, dx);
                this.trigState.theta = theta < 0 ? theta + Math.PI * 2 : theta;
                this.trigState.autoRotate = false;

                const R = this.trigCircleCoord.toScreenDist(1.0);
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
        const R = this.trigCircleCoord.toScreenDist(1.0);
        this.trigAngleHandle.x = ox + Math.cos(this.trigState.theta) * R;
        this.trigAngleHandle.y = oy - Math.sin(this.trigState.theta) * R;
    }

    bindTrigControls() {
        const toggleBtn = document.getElementById('trigAutoToggle');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
                this.trigState.autoRotate = !this.trigState.autoRotate;
                toggleBtn.textContent = this.trigState.autoRotate ? '⏸ Pause Spin' : '▶ Auto Spin';
            });
        }
    }

    updateTrigUI() {
        const th = this.trigState.theta;
        const deg = ((th * 180) / Math.PI) % 360;
        const cosVal = Math.cos(th);
        const sinVal = Math.sin(th);
        const tanVal = Math.tan(th);

        const thValEl = document.getElementById('trigThetaVal');
        const cosValEl = document.getElementById('trigCosVal');
        const sinValEl = document.getElementById('trigSinVal');
        const tanValEl = document.getElementById('trigTanVal');

        if (thValEl) thValEl.textContent = `${deg.toFixed(1)}° (${th.toFixed(2)} rad)`;
        if (cosValEl) cosValEl.textContent = cosVal.toFixed(3);
        if (sinValEl) sinValEl.textContent = sinVal.toFixed(3);
        if (tanValEl) tanValEl.textContent = Math.abs(cosVal) > 1e-4 ? tanVal.toFixed(3) : 'Undefined (±∞)';

        const latexEl = document.getElementById('trigLatex');
        if (latexEl && window.katex) {
            try {
                window.katex.render(
                    `P(\\theta) = (\\cos\\theta, \\sin\\theta) = (${cosVal.toFixed(2)}, ${sinVal.toFixed(2)}), \\quad \\cos^2\\theta + \\sin^2\\theta = 1`,
                    latexEl,
                    { displayMode: false, throwOnError: false }
                );
            } catch (_) {}
        }
    }

    renderUnitCircle(dt) {
        if (!this.trigCircleCu || !this.trigWaveCu) return;

        if (this.trigState.autoRotate && !this.trigAngleHandle.isDragging) {
            this.trigState.theta = (this.trigState.theta + dt * this.trigState.speed) % (Math.PI * 2);
            this.updateTrigHandle();
            this.updateTrigUI();
        }

        // =====================================================================
        // LEFT CANVAS: Unit Circle & Cosine / Sine Projection Bars
        // =====================================================================
        const ctxC = this.trigCircleCu.ctx;
        const coordC = this.trigCircleCoord;
        this.trigCircleCu.clear();
        coordC.drawGrid();

        const ox = coordC.originX;
        const oy = coordC.originY;
        const R = coordC.toScreenDist(1.0);
        const th = this.trigState.theta;
        const cosVal = Math.cos(th);
        const sinVal = Math.sin(th);

        // 1. Draw Unit Circle
        ctxC.save();
        ctxC.strokeStyle = 'rgba(255, 255, 255, 0.35)';
        ctxC.lineWidth = 2;
        ctxC.beginPath();
        ctxC.arc(ox, oy, R, 0, Math.PI * 2);
        ctxC.stroke();

        // 2. Angle Arc
        ctxC.strokeStyle = COLORS.amber;
        ctxC.lineWidth = 2;
        ctxC.beginPath();
        ctxC.arc(ox, oy, R * 0.25, -th, 0);
        ctxC.stroke();
        ctxC.restore();

        const px = ox + cosVal * R;
        const py = oy - sinVal * R;

        // 3. Horizontal Cosine Bar (Cyan) on X-axis
        ctxC.save();
        ctxC.strokeStyle = COLORS.cyan;
        ctxC.lineWidth = 3.5;
        ctxC.shadowColor = COLORS.cyanGlow;
        ctxC.shadowBlur = 10;
        ctxC.beginPath();
        ctxC.moveTo(ox, oy);
        ctxC.lineTo(px, oy);
        ctxC.stroke();

        // 4. Vertical Sine Bar (Rose)
        ctxC.strokeStyle = COLORS.rose;
        ctxC.shadowColor = COLORS.roseGlow;
        ctxC.beginPath();
        ctxC.moveTo(px, oy);
        ctxC.lineTo(px, py);
        ctxC.stroke();

        // 5. Radius vector (Amber)
        ctxC.strokeStyle = 'rgba(255, 255, 255, 0.7)';
        ctxC.lineWidth = 1.8;
        ctxC.beginPath();
        ctxC.moveTo(ox, oy);
        ctxC.lineTo(px, py);
        ctxC.stroke();
        ctxC.restore();

        // Draw Angle Handle
        if (!this.trigAngleHandle.isDragging) {
            this.trigAngleHandle.x = px;
            this.trigAngleHandle.y = py;
        }
        this.trigAngleHandle.draw(ctxC, this.time);

        // =====================================================================
        // RIGHT CANVAS: Unwinding Sine Wave Graph with Horizontal Tracer Line
        // =====================================================================
        const ctxW = this.trigWaveCu.ctx;
        const ww = this.trigWaveCu.logicalWidth;
        const wh = this.trigWaveCu.logicalHeight;
        this.trigWaveCu.clear();

        const wZeroY = wh / 2;

        // Draw running sine wave
        ctxW.save();
        ctxW.strokeStyle = 'rgba(255, 255, 255, 0.15)';
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
        for (let x = 0; x < ww; x += 2) {
            const phaseX = (x / ww) * (cycles * Math.PI * 2) - th;
            const y = wZeroY - Math.sin(-phaseX) * waveScaleY;
            if (x === 0) ctxW.moveTo(x, y);
            else ctxW.lineTo(x, y);
        }
        ctxW.stroke();

        // Horizontal Sync Tracer Line from Circle P(θ) across to Wave
        const tracerY = wZeroY - sinVal * waveScaleY;
        ctxW.strokeStyle = 'rgba(244, 63, 94, 0.6)';
        ctxW.lineWidth = 1.5;
        ctxW.setLineDash([4, 4]);
        ctxW.beginPath();
        ctxW.moveTo(0, tracerY);
        ctxW.lineTo(ww, tracerY);
        ctxW.stroke();

        // Glowing dot on wave at x = 0
        ctxW.fillStyle = '#ffffff';
        ctxW.beginPath();
        ctxW.arc(0, tracerY, 6, 0, Math.PI * 2);
        ctxW.fill();
        ctxW.restore();
    }

    /* =========================================================================
     * 4. SYSTEMS OF LINEAR EQUATIONS (Geometric Intersection & Cramer's Rule)
     * ========================================================================= */
    initLinearSystems() {
        const canvas = document.getElementById('linearCanvas');
        if (!canvas) return;

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
        ['a1', 'b1', 'c1', 'a2', 'b2', 'c2'].forEach(param => {
            const slider = document.getElementById(`linear${param.toUpperCase()}Slider`);
            if (slider) {
                slider.addEventListener('input', e => {
                    this.linearState[param] = parseFloat(e.target.value);
                    const valEl = document.getElementById(`linear${param.toUpperCase()}Val`);
                    if (valEl) valEl.textContent = this.linearState[param].toFixed(1);
                    this.updateLinearUI();
                });
            }
        });
    }

    updateLinearUI() {
        const { a1, b1, c1, a2, b2, c2 } = this.linearState;
        // Determinant: D = a1 * b2 - a2 * b1
        const D = a1 * b2 - a2 * b1;
        const Dx = c1 * b2 - c2 * b1;
        const Dy = a1 * c2 - a2 * c1;

        const dValEl = document.getElementById('linearDVal');
        const solValEl = document.getElementById('linearSolVal');

        if (dValEl) dValEl.textContent = D.toFixed(3);

        if (solValEl) {
            if (Math.abs(D) > 1e-4) {
                const xStar = Dx / D;
                const yStar = Dy / D;
                solValEl.textContent = `Unique Intersection: (${xStar.toFixed(2)}, ${yStar.toFixed(2)})`;
                solValEl.style.color = COLORS.emerald;
            } else {
                if (Math.abs(Dx) < 1e-4 && Math.abs(Dy) < 1e-4) {
                    solValEl.textContent = 'Dependent: Coincident Lines (Infinitely many solutions)';
                    solValEl.style.color = COLORS.cyan;
                } else {
                    solValEl.textContent = 'Inconsistent: Parallel Lines (No solution)';
                    solValEl.style.color = COLORS.rose;
                }
            }
        }

        const latexEl = document.getElementById('linearLatex');
        if (latexEl && window.katex) {
            try {
                window.katex.render(
                    `\\begin{cases} ${a1.toFixed(1)}x + ${b1.toFixed(1)}y = ${c1.toFixed(1)} \\\\ ${a2.toFixed(1)}x + ${b2.toFixed(1)}y = ${c2.toFixed(1)} \\end{cases} \\quad D = ${D.toFixed(2)}`,
                    latexEl,
                    { displayMode: false, throwOnError: false }
                );
            } catch (_) {}
        }
    }

    renderLinearSystems() {
        if (!this.linearCu) return;
        const ctx = this.linearCu.ctx;
        const coord = this.linearCoord;
        this.linearCu.clear();
        coord.drawGrid();

        const { a1, b1, c1, a2, b2, c2 } = this.linearState;
        const D = a1 * b2 - a2 * b1;
        const bounds = coord.getBounds();

        // Line 1: a1 x + b1 y = c1
        ctx.save();
        ctx.strokeStyle = COLORS.cyan;
        ctx.lineWidth = 2.5;
        ctx.shadowColor = COLORS.cyanGlow;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        if (Math.abs(b1) > 1e-4) {
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

        // Line 2: a2 x + b2 y = c2
        ctx.strokeStyle = COLORS.rose;
        ctx.shadowColor = COLORS.roseGlow;
        ctx.beginPath();
        if (Math.abs(b2) > 1e-4) {
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

        // Intersection Point (if unique)
        if (Math.abs(D) > 1e-4) {
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
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.stroke();

            ctx.shadowBlur = 0;
            ctx.font = 'bold 11px Inter, system-ui, sans-serif';
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'left';
            ctx.fillText(`(${xStar.toFixed(2)}, ${yStar.toFixed(2)})`, sx + 10, sy - 8);
            ctx.restore();
        }
    }

    /* =========================================================================
     * MAIN ANIMATION LOOP
     * ========================================================================= */
    startLoop() {
        let lastTime = performance.now();
        const render = now => {
            const dt = Math.min(0.05, (now - lastTime) / 1000);
            lastTime = now;
            this.time += dt;

            if (this.activeSub === 'matrix') {
                this.renderMatrix(dt);
            } else if (this.activeSub === 'quadratic') {
                this.renderQuadratic();
            } else if (this.activeSub === 'trig') {
                this.renderUnitCircle(dt);
            } else if (this.activeSub === 'linear') {
                this.renderLinearSystems();
            }

            this.animFrame = requestAnimationFrame(render);
        };
        this.animFrame = requestAnimationFrame(render);
    }

    destroy() {
        if (this.animFrame) cancelAnimationFrame(this.animFrame);
        if (this.matrixController) this.matrixController.destroy();
        if (this.trigController) this.trigController.destroy();
    }
}
