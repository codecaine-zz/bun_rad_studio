/**
 * IntuitionLab - Calculus Visualizer Engine
 * 1. Derivatives & Tangents (Secant to Tangent Limit Δx → 0 with synchronized f'(x) trace)
 * 2. Definite Integrals & Riemann Sums (N=1..100, Left/Right/Midpoint/Trapezoid, draggable a/b, Melt Slices)
 * 3. Fundamental Theorem of Calculus (Area accumulation F(x) = ∫ f(t)dt with slope synchronization)
 * 4. Gradient Descent (2D potential terrain contours, gradient vector field, momentum & learning rate)
 */

import { HiDPICanvas, CoordinateSystem, DraggableHandle, HandleController, drawVector, COLORS, soundSynth } from './canvas-utils.js';

export class CalculusLab {
    constructor() {
        this.activeSub = 'derivatives';
        this.animFrame = null;
        this.time = 0;

        // 1. Derivatives state
        this.derivState = {
            fnKey: 'cubic',
            x0: 1.2,
            dx: 1.5,
            targetDx: 1.5,
            isLimiting: false,
            limitProgress: 0,
            zoom: 1
        };

        // 2. Riemann state
        this.riemannState = {
            fnKey: 'parabola',
            a: -1.5,
            b: 2.0,
            n: 12,
            rule: 'midpoint', // 'left', 'right', 'midpoint', 'trapezoid'
            meltProgress: 0, // 0 = discrete slices, 1 = melted smooth
            isMelting: false
        };

        // 3. FTC state
        this.ftcState = {
            fnKey: 'poly',
            x: 1.6,
            minX: -2.5,
            maxX: 3.5
        };

        // 4. Gradient Descent state
        this.gdState = {
            preset: 'bowl', // 'bowl', 'saddle', 'doublewell', 'rosenbrock'
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
                label: 'Cubic: f(x) = x³ - 3x',
                f: x => x * x * x - 3 * x,
                df: x => 3 * x * x - 3,
                formula: 'f(x) = x^3 - 3x',
                dFormula: "f'(x) = 3x^2 - 3"
            },
            sine: {
                label: 'Sine Wave: f(x) = 2 sin(x)',
                f: x => 2 * Math.sin(x),
                df: x => 2 * Math.cos(x),
                formula: 'f(x) = 2\\sin(x)',
                dFormula: "f'(x) = 2\\cos(x)"
            },
            parabola: {
                label: 'Parabola: f(x) = 0.5x² - 1',
                f: x => 0.5 * x * x - 1,
                df: x => x,
                formula: 'f(x) = 0.5x^2 - 1',
                dFormula: "f'(x) = x"
            },
            gaussian: {
                label: 'Gaussian: f(x) = 3 e^(-x²)',
                f: x => 3 * Math.exp(-x * x),
                df: x => -6 * x * Math.exp(-x * x),
                formula: 'f(x) = 3e^{-x^2}',
                dFormula: "f'(x) = -6x e^{-x^2}"
            }
        };

        this.potentialSurfaces = {
            bowl: {
                f: (x, y) => 0.5 * (x * x + 2 * y * y),
                grad: (x, y) => ({ dx: x, dy: 2 * y }),
                name: 'Elliptic Bowl f(x,y) = 0.5(x² + 2y²)'
            },
            saddle: {
                f: (x, y) => 0.5 * (x * x - y * y),
                grad: (x, y) => ({ dx: x, dy: -y }),
                name: 'Saddle Surface f(x,y) = 0.5(x² - y²)'
            },
            doublewell: {
                f: (x, y) => 0.3 * (x * x * x * x - 3 * x * x + y * y + 2),
                grad: (x, y) => ({ dx: 0.3 * (4 * x * x * x - 6 * x), dy: 0.6 * y }),
                name: 'Double-Well Potential'
            },
            rosenbrock: {
                f: (x, y) => 0.1 * ((1 - x) ** 2 + 10 * (y - x * x) ** 2),
                grad: (x, y) => ({
                    dx: 0.1 * (-2 * (1 - x) - 40 * x * (y - x * x)),
                    dy: 0.1 * (20 * (y - x * x))
                }),
                name: 'Rosenbrock Banana Valley'
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

    /* =========================================================================
     * 1. DERIVATIVES & TANGENTS
     * ========================================================================= */
    initDerivatives() {
        const topCanvas = document.getElementById('derivMainCanvas');
        const botCanvas = document.getElementById('derivTraceCanvas');
        if (!topCanvas || !botCanvas) return;

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

        // Draggable Handle for x0 on top canvas
        this.derivH1 = new DraggableHandle(0, 0, {
            color: COLORS.cyan,
            glowColor: COLORS.cyanGlow,
            label: 'x₀',
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

        // Draggable Handle for x0 + dx on top canvas
        this.derivH2 = new DraggableHandle(0, 0, {
            color: COLORS.rose,
            glowColor: COLORS.roseGlow,
            label: 'x₀+Δx',
            constrain: (nx, ny) => {
                const mathX = this.derivTopCoord.toMathX(nx);
                let newDx = mathX - this.derivState.x0;
                if (Math.abs(newDx) < 0.05) newDx = newDx >= 0 ? 0.05 : -0.05;
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
        const select = document.getElementById('derivFnSelect');
        if (select) {
            select.addEventListener('change', e => {
                this.derivState.fnKey = e.target.value;
                this.updateDerivHandlePositions();
                this.updateDerivUI();
            });
        }

        const dxSlider = document.getElementById('derivDxSlider');
        if (dxSlider) {
            dxSlider.addEventListener('input', e => {
                this.derivState.dx = parseFloat(e.target.value);
                this.updateDerivHandlePositions();
                this.updateDerivUI();
            });
        }

        const limitBtn = document.getElementById('derivLimitBtn');
        if (limitBtn) {
            limitBtn.addEventListener('click', () => {
                this.triggerLimitAnimation();
            });
        }

        const resetBtn = document.getElementById('derivResetBtn');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                this.derivState.dx = 1.5;
                this.derivState.x0 = 1.0;
                this.updateDerivHandlePositions();
                this.updateDerivUI();
                soundSynth.playClick(440, 0.05);
            });
        }
    }

    triggerLimitAnimation() {
        if (this.derivState.isLimiting) return;
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

        const dxValEl = document.getElementById('derivDxVal');
        if (dxValEl) dxValEl.textContent = dx.toFixed(3);

        const secSlopeEl = document.getElementById('derivSecSlope');
        if (secSlopeEl) secSlopeEl.textContent = secantSlope.toFixed(4);

        const tanSlopeEl = document.getElementById('derivTanSlope');
        if (tanSlopeEl) tanSlopeEl.textContent = tangentSlope.toFixed(4);

        const diffEl = document.getElementById('derivSlopeDiff');
        if (diffEl) {
            const err = Math.abs(secantSlope - tangentSlope);
            diffEl.textContent = err < 1e-4 ? '0.0000 (Exact Tangent!)' : err.toFixed(4);
        }

        const mathFormulaEl = document.getElementById('derivMathFormula');
        if (mathFormulaEl && window.katex) {
            try {
                window.katex.render(
                    `f'(${x0.toFixed(2)}) = \\lim_{\\Delta x \\to 0} \\frac{f(${x0.toFixed(2)}+\\Delta x) - f(${x0.toFixed(2)})}{\\Delta x} = ${tangentSlope.toFixed(3)}`,
                    mathFormulaEl,
                    { displayMode: false, throwOnError: false }
                );
            } catch (_) {}
        }
    }

    renderDerivatives(dt) {
        if (!this.derivTopCu || !this.derivBotCu) return;

        // Handle Limit Animation
        if (this.derivState.isLimiting) {
            this.derivState.limitProgress += dt * 1.5;
            if (this.derivState.limitProgress >= 1) {
                this.derivState.isLimiting = false;
                this.derivState.dx = 0.001;
            } else {
                const ease = t => t * t * (3 - 2 * t);
                const t = ease(this.derivState.limitProgress);
                this.derivState.dx = this.derivState.startDx * (1 - t) + 0.001 * t;
            }
            this.updateDerivHandlePositions();
            this.updateDerivUI();
        }

        const fnObj = this.functions[this.derivState.fnKey];
        const ctxTop = this.derivTopCu.ctx;
        const coordTop = this.derivTopCoord;

        // TOP CANVAS: f(x), Secant line, Tangent line, Δx/Δy triangle
        this.derivTopCu.clear();
        coordTop.drawGrid();

        const bounds = coordTop.getBounds();

        // 1. Draw f(x) curve
        ctxTop.save();
        ctxTop.strokeStyle = COLORS.cyan;
        ctxTop.lineWidth = 3;
        ctxTop.shadowColor = COLORS.cyanGlow;
        ctxTop.shadowBlur = 10;
        ctxTop.beginPath();
        const step = (bounds.xMax - bounds.xMin) / 300;
        let started = false;
        for (let x = bounds.xMin; x <= bounds.xMax; x += step) {
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

        // 2. Draw secant delta triangle
        ctxTop.save();
        ctxTop.fillStyle = 'rgba(244, 63, 94, 0.12)';
        ctxTop.beginPath();
        ctxTop.moveTo(sx0, sy0);
        ctxTop.lineTo(sxCorner, syCorner);
        ctxTop.lineTo(sx1, sy1);
        ctxTop.closePath();
        ctxTop.fill();

        // Delta x line (horizontal)
        ctxTop.strokeStyle = COLORS.amber;
        ctxTop.lineWidth = 2;
        ctxTop.setLineDash([4, 3]);
        ctxTop.beginPath();
        ctxTop.moveTo(sx0, sy0);
        ctxTop.lineTo(sxCorner, syCorner);
        ctxTop.stroke();

        // Delta y line (vertical)
        ctxTop.strokeStyle = COLORS.rose;
        ctxTop.beginPath();
        ctxTop.moveTo(sxCorner, syCorner);
        ctxTop.lineTo(sx1, sy1);
        ctxTop.stroke();
        ctxTop.setLineDash([]);

        // Delta labels
        ctxTop.font = 'bold 11px Inter, system-ui, sans-serif';
        ctxTop.textAlign = 'center';
        ctxTop.textBaseline = 'top';
        ctxTop.fillStyle = COLORS.amber;
        ctxTop.fillText(`Δx = ${dx.toFixed(2)}`, (sx0 + sxCorner) / 2, syCorner + 6);

        ctxTop.textAlign = 'left';
        ctxTop.textBaseline = 'middle';
        ctxTop.fillStyle = COLORS.rose;
        ctxTop.fillText(`Δy = ${(y1 - y0).toFixed(2)}`, sxCorner + 6, (syCorner + sy1) / 2);
        ctxTop.restore();

        // 3. Draw Secant Line (Rose)
        ctxTop.save();
        ctxTop.strokeStyle = 'rgba(244, 63, 94, 0.7)';
        ctxTop.lineWidth = 1.8;
        ctxTop.setLineDash([6, 4]);
        ctxTop.beginPath();
        const secYLeft = y0 + secSlope * (bounds.xMin - x0);
        const secYRight = y0 + secSlope * (bounds.xMax - x0);
        ctxTop.moveTo(coordTop.toScreenX(bounds.xMin), coordTop.toScreenY(secYLeft));
        ctxTop.lineTo(coordTop.toScreenX(bounds.xMax), coordTop.toScreenY(secYRight));
        ctxTop.stroke();
        ctxTop.restore();

        // 4. Draw True Tangent Line (Emerald)
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

        // 5. Draw Handles
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

        // =====================================================================
        // BOTTOM CANVAS: Derivative f'(x) curve and synchronized tracking dot
        // =====================================================================
        const ctxBot = this.derivBotCu.ctx;
        const coordBot = this.derivBotCoord;
        this.derivBotCu.clear();
        coordBot.drawGrid();

        const botBounds = coordBot.getBounds();

        // Draw f'(x) trace curve
        ctxBot.save();
        ctxBot.strokeStyle = COLORS.violet;
        ctxBot.lineWidth = 3;
        ctxBot.shadowColor = COLORS.violetGlow;
        ctxBot.shadowBlur = 8;
        ctxBot.beginPath();
        started = false;
        const botStep = (botBounds.xMax - botBounds.xMin) / 300;
        for (let x = botBounds.xMin; x <= botBounds.xMax; x += botStep) {
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

        // Synchronized dot at (x0, f'(x0))
        const sBotX = coordBot.toScreenX(x0);
        const sBotY = coordBot.toScreenY(tanSlope);

        ctxBot.save();
        // Drop vertical guide line
        ctxBot.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctxBot.setLineDash([4, 4]);
        ctxBot.beginPath();
        ctxBot.moveTo(sBotX, coordBot.toScreenY(0));
        ctxBot.lineTo(sBotX, sBotY);
        ctxBot.stroke();

        // Glowing dot
        ctxBot.shadowColor = COLORS.emeraldGlow;
        ctxBot.shadowBlur = 14;
        ctxBot.fillStyle = COLORS.emerald;
        ctxBot.beginPath();
        ctxBot.arc(sBotX, sBotY, 7, 0, Math.PI * 2);
        ctxBot.fill();
        ctxBot.strokeStyle = '#ffffff';
        ctxBot.lineWidth = 2;
        ctxBot.stroke();

        // Label pill
        ctxBot.shadowBlur = 0;
        ctxBot.font = 'bold 11px Inter, system-ui, sans-serif';
        ctxBot.fillStyle = '#ffffff';
        ctxBot.textAlign = 'left';
        ctxBot.fillText(`f'(${x0.toFixed(2)}) = ${tanSlope.toFixed(2)}`, sBotX + 10, sBotY);
        ctxBot.restore();
    }

    /* =========================================================================
     * 2. DEFINITE INTEGRALS & RIEMANN SUMS
     * ========================================================================= */
    initRiemann() {
        const canvas = document.getElementById('riemannCanvas');
        if (!canvas) return;

        this.riemannCu = new HiDPICanvas(canvas);
        this.riemannCoord = new CoordinateSystem(this.riemannCu, {
            originRatioX: 0.45,
            originRatioY: 0.65,
            unitsPerPixelX: 0.015,
            unitsPerPixelY: 0.015,
            xStep: 1,
            yStep: 1
        });

        // Draggable boundary handles on x-axis: a and b
        this.riemannHa = new DraggableHandle(0, 0, {
            color: COLORS.amber,
            glowColor: COLORS.amberGlow,
            label: 'a',
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
            label: 'b',
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
        const nSlider = document.getElementById('riemannNSlider');
        if (nSlider) {
            nSlider.addEventListener('input', e => {
                this.riemannState.n = parseInt(e.target.value, 10);
                this.updateRiemannUI();
            });
        }

        const ruleSelect = document.getElementById('riemannRuleSelect');
        if (ruleSelect) {
            ruleSelect.addEventListener('change', e => {
                this.riemannState.rule = e.target.value;
                this.updateRiemannUI();
            });
        }

        const fnSelect = document.getElementById('riemannFnSelect');
        if (fnSelect) {
            fnSelect.addEventListener('change', e => {
                this.riemannState.fnKey = e.target.value;
                this.updateRiemannUI();
            });
        }

        const meltBtn = document.getElementById('riemannMeltBtn');
        if (meltBtn) {
            meltBtn.addEventListener('click', () => {
                this.riemannState.isMelting = true;
                this.riemannState.meltProgress = 0;
                soundSynth.playSuccess();
            });
        }
    }

    calcExactIntegral(a, b, fn, samples = 2000) {
        const dx = (b - a) / samples;
        let sum = 0;
        for (let i = 0; i < samples; i++) {
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
        for (let i = 0; i < n; i++) {
            const xLeft = a + i * dx;
            const xRight = xLeft + dx;
            let sampleY = 0;
            if (rule === 'left') sampleY = fn(xLeft);
            else if (rule === 'right') sampleY = fn(xRight);
            else if (rule === 'midpoint') sampleY = fn((xLeft + xRight) / 2);
            else if (rule === 'trapezoid') sampleY = (fn(xLeft) + fn(xRight)) / 2;
            riemannSum += sampleY * dx;
        }

        const exact = this.calcExactIntegral(a, b, fn);
        const err = Math.abs(riemannSum - exact);
        const pctErr = Math.abs(exact) > 1e-4 ? (err / Math.abs(exact)) * 100 : 0;

        const nValEl = document.getElementById('riemannNVal');
        if (nValEl) nValEl.textContent = n;

        const sumValEl = document.getElementById('riemannSumVal');
        if (sumValEl) sumValEl.textContent = riemannSum.toFixed(4);

        const exactValEl = document.getElementById('riemannExactVal');
        if (exactValEl) exactValEl.textContent = exact.toFixed(4);

        const errValEl = document.getElementById('riemannErrVal');
        if (errValEl) errValEl.textContent = `${err.toFixed(4)} (${pctErr.toFixed(1)}%)`;

        const latexEl = document.getElementById('riemannLatex');
        if (latexEl && window.katex) {
            try {
                window.katex.render(
                    `\\int_{${a.toFixed(2)}}^{${b.toFixed(2)}} f(x)\\,dx \\approx \\sum_{i=1}^{${n}} f(x_i^*)\\,\\Delta x = ${riemannSum.toFixed(3)}`,
                    latexEl,
                    { displayMode: false, throwOnError: false }
                );
            } catch (_) {}
        }
    }

    renderRiemann(dt) {
        if (!this.riemannCu) return;
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

        // 1. Draw Discrete Slices or Melted Smooth Curve
        for (let i = 0; i < n; i++) {
            const xL = a + i * dx;
            const xR = xL + dx;
            const sxL = coord.toScreenX(xL);
            const sxR = coord.toScreenX(xR);

            let sampleY = 0;
            if (rule === 'left') sampleY = fn(xL);
            else if (rule === 'right') sampleY = fn(xR);
            else if (rule === 'midpoint') sampleY = fn((xL + xR) / 2);
            else if (rule === 'trapezoid') {
                const yL = fn(xL);
                const yR = fn(xR);
                const syL = coord.toScreenY(yL);
                const syR = coord.toScreenY(yR);

                ctx.save();
                ctx.fillStyle = i % 2 === 0 ? 'rgba(6, 182, 212, 0.22)' : 'rgba(59, 130, 246, 0.18)';
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

            // When melting, interpolate rectangle height to continuous curve underneath
            ctx.save();
            ctx.fillStyle = i % 2 === 0 ? 'rgba(6, 182, 212, 0.25)' : 'rgba(139, 92, 246, 0.22)';
            ctx.strokeStyle = 'rgba(6, 182, 212, 0.6)';
            ctx.lineWidth = 1;

            if (melt > 0) {
                ctx.beginPath();
                ctx.moveTo(sxL, sZeroY);
                // Sample sub-points along curve
                const subSamples = 6;
                for (let s = 0; s <= subSamples; s++) {
                    const subX = xL + (s / subSamples) * dx;
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

        // 2. Draw Continuous f(x) curve
        const bounds = coord.getBounds();
        ctx.save();
        ctx.strokeStyle = COLORS.emerald;
        ctx.lineWidth = 3;
        ctx.shadowColor = COLORS.emeraldGlow;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        let started = false;
        const step = (bounds.xMax - bounds.xMin) / 300;
        for (let x = bounds.xMin; x <= bounds.xMax; x += step) {
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

        // 3. Draw draggable boundary handles
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

    /* =========================================================================
     * 3. FUNDAMENTAL THEOREM OF CALCULUS (FTC)
     * ========================================================================= */
    initFTC() {
        const topCanvas = document.getElementById('ftcTopCanvas');
        const botCanvas = document.getElementById('ftcBotCanvas');
        if (!topCanvas || !botCanvas) return;

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

        // Draggable point x on top canvas
        this.ftcHandle = new DraggableHandle(0, 0, {
            color: COLORS.amber,
            glowColor: COLORS.amberGlow,
            label: 'x',
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
        const xSlider = document.getElementById('ftcXSlider');
        if (xSlider) {
            xSlider.addEventListener('input', e => {
                this.ftcState.x = parseFloat(e.target.value);
                this.updateFTCHandle();
                this.updateFTCUI();
            });
        }
    }

    ftcFunction(t) {
        // Smooth test function: f(t) = 0.5 t² + 0.5
        return 0.5 * t * t + 0.5;
    }

    ftcIntegral(x) {
        // Analytical antiderivative: F(x) = ∫_0^x (0.5 t² + 0.5) dt = (0.5/3)x³ + 0.5x
        return (0.5 / 3) * x * x * x + 0.5 * x;
    }

    updateFTCUI() {
        const x = this.ftcState.x;
        const fx = this.ftcFunction(x);
        const Fx = this.ftcIntegral(x);

        const xValEl = document.getElementById('ftcXVal');
        if (xValEl) xValEl.textContent = x.toFixed(2);

        const fxValEl = document.getElementById('ftcFxVal');
        if (fxValEl) fxValEl.textContent = fx.toFixed(3);

        const bigFxValEl = document.getElementById('ftcBigFxVal');
        if (bigFxValEl) bigFxValEl.textContent = Fx.toFixed(3);

        const latexEl = document.getElementById('ftcLatex');
        if (latexEl && window.katex) {
            try {
                window.katex.render(
                    `\\frac{d}{dx} \\left[ \\int_0^x f(t)\\,dt \\right] = f(x) = ${fx.toFixed(2)} \\quad \\Longleftrightarrow \\quad \\text{Slope of } F(x) = ${fx.toFixed(2)}`,
                    latexEl,
                    { displayMode: false, throwOnError: false }
                );
            } catch (_) {}
        }
    }

    renderFTC() {
        if (!this.ftcTopCu || !this.ftcBotCu) return;

        const ctxTop = this.ftcTopCu.ctx;
        const coordTop = this.ftcTopCoord;
        const x = this.ftcState.x;
        const fx = this.ftcFunction(x);
        const Fx = this.ftcIntegral(x);

        // =====================================================================
        // TOP: f(t) curve with shaded area ∫_0^x f(t)dt
        // =====================================================================
        this.ftcTopCu.clear();
        coordTop.drawGrid();

        const boundsTop = coordTop.getBounds();
        const sZeroY = coordTop.toScreenY(0);

        // 1. Shaded Area from 0 to x
        ctxTop.save();
        ctxTop.fillStyle = 'rgba(6, 182, 212, 0.28)';
        ctxTop.beginPath();
        const sZeroX = coordTop.toScreenX(0);
        ctxTop.moveTo(sZeroX, sZeroY);

        const areaSteps = 100;
        for (let i = 0; i <= areaSteps; i++) {
            const t = (i / areaSteps) * x;
            ctxTop.lineTo(coordTop.toScreenX(t), coordTop.toScreenY(this.ftcFunction(t)));
        }
        ctxTop.lineTo(coordTop.toScreenX(x), sZeroY);
        ctxTop.closePath();
        ctxTop.fill();

        // Shimmer gradient edge
        ctxTop.strokeStyle = COLORS.cyan;
        ctxTop.lineWidth = 1.5;
        ctxTop.stroke();
        ctxTop.restore();

        // 2. Continuous f(t) curve
        ctxTop.save();
        ctxTop.strokeStyle = COLORS.cyan;
        ctxTop.lineWidth = 3;
        ctxTop.shadowColor = COLORS.cyanGlow;
        ctxTop.shadowBlur = 8;
        ctxTop.beginPath();
        let started = false;
        const step = (boundsTop.xMax - boundsTop.xMin) / 250;
        for (let t = boundsTop.xMin; t <= boundsTop.xMax; t += step) {
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

        // 3. Height marker at x: height = f(x)
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

        ctxTop.font = 'bold 11px Inter, system-ui, sans-serif';
        ctxTop.textAlign = 'left';
        ctxTop.fillText(`Height f(x) = ${fx.toFixed(2)}`, sx + 8, (sy + sZeroY) / 2);
        ctxTop.restore();

        // Draw draggable handle at base
        if (!this.ftcHandle.isDragging) {
            this.ftcHandle.x = sx;
            this.ftcHandle.y = sZeroY;
        }
        this.ftcHandle.draw(ctxTop, this.time);

        // =====================================================================
        // BOTTOM: Accumulation F(x) = ∫_0^x f(t)dt with matching tangent slope
        // =====================================================================
        const ctxBot = this.ftcBotCu.ctx;
        const coordBot = this.ftcBotCoord;
        this.ftcBotCu.clear();
        coordBot.drawGrid();

        const boundsBot = coordBot.getBounds();

        // 1. Draw F(x) curve
        ctxBot.save();
        ctxBot.strokeStyle = COLORS.violet;
        ctxBot.lineWidth = 3;
        ctxBot.shadowColor = COLORS.violetGlow;
        ctxBot.shadowBlur = 8;
        ctxBot.beginPath();
        started = false;
        const botStep = (boundsBot.xMax - boundsBot.xMin) / 250;
        for (let bx = boundsBot.xMin; bx <= boundsBot.xMax; bx += botStep) {
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

        // 2. Synchronized Tangent Line with slope m = f(x)
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

        // Glowing tangent point
        ctxBot.fillStyle = '#ffffff';
        ctxBot.beginPath();
        ctxBot.arc(sBotX, sBotY, 6, 0, Math.PI * 2);
        ctxBot.fill();
        ctxBot.strokeStyle = COLORS.rose;
        ctxBot.lineWidth = 2;
        ctxBot.stroke();

        // Slope badge
        ctxBot.font = 'bold 11px Inter, system-ui, sans-serif';
        ctxBot.fillStyle = COLORS.rose;
        ctxBot.textAlign = 'left';
        ctxBot.fillText(`Slope F'(x) = ${fx.toFixed(2)} (Exactly equals f(x)!)`, sBotX + 12, sBotY);
        ctxBot.restore();
    }

    /* =========================================================================
     * 4. GRADIENT DESCENT (2D Potential Contour Terrain & Vector Field)
     * ========================================================================= */
    initGradientDescent() {
        const canvas = document.getElementById('gdCanvas');
        if (!canvas) return;

        this.gdCu = new HiDPICanvas(canvas);
        this.gdCoord = new CoordinateSystem(this.gdCu, {
            originRatioX: 0.5,
            originRatioY: 0.5,
            unitsPerPixelX: 0.012,
            unitsPerPixelY: 0.012,
            xStep: 1,
            yStep: 1
        });

        // Draggable ball on 2D terrain
        this.gdBallHandle = new DraggableHandle(0, 0, {
            radius: 9,
            hitRadius: 24,
            color: COLORS.rose,
            glowColor: COLORS.roseGlow,
            label: 'θ (Loss Ball)',
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
        const presetSelect = document.getElementById('gdPresetSelect');
        if (presetSelect) {
            presetSelect.addEventListener('change', e => {
                this.gdState.preset = e.target.value;
                this.gdState.trail = [];
                this.gdState.vx = 0;
                this.gdState.vy = 0;
                if (this.gdState.preset === 'rosenbrock') {
                    this.gdState.ballX = -1.2;
                    this.gdState.ballY = 1.0;
                } else {
                    this.gdState.ballX = 2.0;
                    this.gdState.ballY = 1.8;
                }
                this.updateGDBallHandle();
                this.updateGDUI();
            });
        }

        const lrSlider = document.getElementById('gdLrSlider');
        if (lrSlider) {
            lrSlider.addEventListener('input', e => {
                this.gdState.lr = parseFloat(e.target.value);
                const lrVal = document.getElementById('gdLrVal');
                if (lrVal) lrVal.textContent = this.gdState.lr.toFixed(3);
            });
        }

        const momSlider = document.getElementById('gdMomSlider');
        if (momSlider) {
            momSlider.addEventListener('input', e => {
                this.gdState.momentum = parseFloat(e.target.value);
                const momVal = document.getElementById('gdMomVal');
                if (momVal) momVal.textContent = this.gdState.momentum.toFixed(2);
            });
        }

        const playBtn = document.getElementById('gdPlayBtn');
        if (playBtn) {
            playBtn.addEventListener('click', () => {
                this.gdState.running = !this.gdState.running;
                playBtn.textContent = this.gdState.running ? '⏸ Pause Optimization' : '▶ Start Gradient Descent';
                playBtn.classList.toggle('active', this.gdState.running);
                if (this.gdState.running) soundSynth.playClick(500, 0.04);
            });
        }

        const resetBtn = document.getElementById('gdResetBtn');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                this.gdState.ballX = 2.0;
                this.gdState.ballY = 1.8;
                this.gdState.vx = 0;
                this.gdState.vy = 0;
                this.gdState.trail = [];
                this.gdState.running = false;
                if (playBtn) {
                    playBtn.textContent = '▶ Start Gradient Descent';
                    playBtn.classList.remove('active');
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

        const lossValEl = document.getElementById('gdLossVal');
        if (lossValEl) lossValEl.textContent = loss.toFixed(4);

        const gradValEl = document.getElementById('gdGradVal');
        if (gradValEl) gradValEl.textContent = gradNorm.toFixed(4);

        const posValEl = document.getElementById('gdPosVal');
        if (posValEl) posValEl.textContent = `(${this.gdState.ballX.toFixed(2)}, ${this.gdState.ballY.toFixed(2)})`;
    }

    renderGradientDescent(dt) {
        if (!this.gdCu) return;
        const ctx = this.gdCu.ctx;
        const coord = this.gdCoord;
        const surf = this.potentialSurfaces[this.gdState.preset];

        // Gradient Descent Physics Step
        if (this.gdState.running && !this.gdBallHandle.isDragging) {
            const stepsPerFrame = 2;
            for (let s = 0; s < stepsPerFrame; s++) {
                const grad = surf.grad(this.gdState.ballX, this.gdState.ballY);
                // Momentum update: v = beta * v - lr * grad
                this.gdState.vx = this.gdState.momentum * this.gdState.vx - this.gdState.lr * grad.dx;
                this.gdState.vy = this.gdState.momentum * this.gdState.vy - this.gdState.lr * grad.dy;

                this.gdState.ballX += this.gdState.vx;
                this.gdState.ballY += this.gdState.vy;

                // Record trail
                this.gdState.trail.push({ x: this.gdState.ballX, y: this.gdState.ballY });
                if (this.gdState.trail.length > 300) this.gdState.trail.shift();

                // Stop if converged
                if (Math.hypot(this.gdState.vx, this.gdState.vy) < 1e-4 && Math.hypot(grad.dx, grad.dy) < 1e-3) {
                    this.gdState.running = false;
                    const playBtn = document.getElementById('gdPlayBtn');
                    if (playBtn) {
                        playBtn.textContent = '✓ Minimum Reached';
                        playBtn.classList.remove('active');
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

        // 1. Draw Downhill Gradient Vector Field (Negative Gradient -∇f)
        const gridStep = 0.55;
        const startX = Math.floor(bounds.xMin / gridStep) * gridStep;
        const startY = Math.floor(bounds.yMin / gridStep) * gridStep;

        for (let gx = startX; gx <= bounds.xMax; gx += gridStep) {
            for (let gy = startY; gy <= bounds.yMax; gy += gridStep) {
                const g = surf.grad(gx, gy);
                // Downhill direction = -grad
                const dgx = -g.dx;
                const dgy = -g.dy;
                const norm = Math.hypot(dgx, dgy);
                if (norm < 1e-5) continue;

                // Scale vector arrow visually
                const arrowLengthMath = Math.min(0.28, Math.max(0.08, norm * 0.15));
                const dirX = (dgx / norm) * arrowLengthMath;
                const dirY = (dgy / norm) * arrowLengthMath;

                const fromX = coord.toScreenX(gx);
                const fromY = coord.toScreenY(gy);
                const toX = coord.toScreenX(gx + dirX);
                const toY = coord.toScreenY(gy + dirY);

                // Intensity color mapping
                const alpha = Math.min(0.55, 0.15 + norm * 0.12);
                drawVector(ctx, fromX, fromY, toX, toY, {
                    color: `rgba(6, 182, 212, ${alpha})`,
                    glowColor: null,
                    lineWidth: 1.2,
                    arrowSize: 5
                });
            }
        }

        // 2. Draw Trajectory Trail
        if (this.gdState.trail.length > 1) {
            ctx.save();
            ctx.strokeStyle = COLORS.rose;
            ctx.lineWidth = 2.5;
            ctx.shadowColor = COLORS.roseGlow;
            ctx.shadowBlur = 8;
            ctx.beginPath();
            const t0 = this.gdState.trail[0];
            ctx.moveTo(coord.toScreenX(t0.x), coord.toScreenY(t0.y));
            for (let i = 1; i < this.gdState.trail.length; i++) {
                const pt = this.gdState.trail[i];
                ctx.lineTo(coord.toScreenX(pt.x), coord.toScreenY(pt.y));
            }
            ctx.stroke();
            ctx.restore();
        }

        // 3. Draw Loss Ball
        if (!this.gdBallHandle.isDragging) {
            this.gdBallHandle.x = coord.toScreenX(this.gdState.ballX);
            this.gdBallHandle.y = coord.toScreenY(this.gdState.ballY);
        }
        this.gdBallHandle.draw(ctx, this.time);
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

            if (this.activeSub === 'derivatives') {
                this.renderDerivatives(dt);
            } else if (this.activeSub === 'riemann') {
                this.renderRiemann(dt);
            } else if (this.activeSub === 'ftc') {
                this.renderFTC();
            } else if (this.activeSub === 'gradient') {
                this.renderGradientDescent(dt);
            }

            this.animFrame = requestAnimationFrame(render);
        };
        this.animFrame = requestAnimationFrame(render);
    }

    destroy() {
        if (this.animFrame) cancelAnimationFrame(this.animFrame);
        if (this.derivController) this.derivController.destroy();
        if (this.riemannController) this.riemannController.destroy();
        if (this.ftcController) this.ftcController.destroy();
        if (this.gdController) this.gdController.destroy();
    }
}
