/**
 * IntuitionLab - Physics Simulation Engine
 * 1. Projectile Kinematics (vx, vy decomposition, Δt=0.25s strobe markers, draggable target hoop game, planetary gravities)
 * 2. Damped Pendulum & Phase Space (Ek vs Ep real-time energy bars, synchronized (θ, ω) phase space orbit plot)
 * 3. Optics & Snell's Law (Refraction, wavefront speeds, Total Internal Reflection at critical angle θc)
 * 4. Wave Interference (2D dual-source ripple tank, constructive/destructive fringes, projection screen intensity)
 */

import { HiDPICanvas, CoordinateSystem, DraggableHandle, HandleController, drawVector, COLORS, soundSynth } from './canvas-utils.js';

export class PhysicsLab {
    constructor() {
        this.activeSub = 'projectile';
        this.animFrame = null;
        this.time = 0;

        // 1. Projectile Kinematics state
        this.projState = {
            v0: 18,
            angleDeg: 45,
            launchHeight: 1.5,
            gPreset: 'earth',
            g: 9.81,
            inFlight: false,
            flightTime: 0,
            simSpeed: 1.0,
            strobeInterval: 0.25,
            strobes: [],
            targetX: 25,
            targetY: 4,
            targetRadius: 1.6,
            score: 0,
            hitTarget: false,
            ballPos: { x: 0, y: 1.5, vx: 0, vy: 0 }
        };

        // Planetary Gravities (m/s²)
        this.planets = {
            earth: { name: 'Earth (9.81 m/s²)', g: 9.81 },
            moon: { name: 'Moon (1.62 m/s²)', g: 1.62 },
            mars: { name: 'Mars (3.72 m/s²)', g: 3.72 },
            jupiter: { name: 'Jupiter (24.79 m/s²)', g: 24.79 }
        };

        // 2. Damped Pendulum & Phase Space state
        this.pendState = {
            length: 2.2, // meters
            mass: 1.0,   // kg
            damping: 0.15, // b damping coefficient
            theta: Math.PI / 3, // initial angle
            omega: 0.0,         // angular velocity
            g: 9.81,
            running: true,
            phaseHistory: [],   // array of { theta, omega }
            maxPhasePoints: 400
        };

        // 3. Optics & Snell's Law state
        this.opticsState = {
            n1: 1.50, // glass
            n2: 1.00, // air
            incidentAngleDeg: 35, // degrees relative to normal
            raySourceRadius: 4.5,
            isTIR: false,
            criticalAngleDeg: null
        };

        // 4. Wave Interference state
        this.waveState = {
            sourceDist: 2.8, // distance between dual sources
            wavelength: 0.9,
            frequency: 1.8,
            phaseShift: 0, // radians
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

    /* =========================================================================
     * 1. PROJECTILE KINEMATICS & TARGET HOOP GAME
     * ========================================================================= */
    initProjectile() {
        const canvas = document.getElementById('projCanvas');
        if (!canvas) return;

        this.projCu = new HiDPICanvas(canvas);
        this.projCoord = new CoordinateSystem(this.projCu, {
            originRatioX: 0.08,
            originRatioY: 0.82,
            unitsPerPixelX: 0.045,
            unitsPerPixelY: 0.045,
            xStep: 5,
            yStep: 5
        });

        // Draggable target hoop handle
        this.targetHandle = new DraggableHandle(0, 0, {
            radius: 12,
            hitRadius: 28,
            color: COLORS.amber,
            glowColor: COLORS.amberGlow,
            label: '🎯 Target',
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
        const v0Slider = document.getElementById('projV0Slider');
        if (v0Slider) {
            v0Slider.addEventListener('input', e => {
                this.projState.v0 = parseFloat(e.target.value);
                this.resetProjectile();
                this.updateProjUI();
            });
        }

        const angleSlider = document.getElementById('projAngleSlider');
        if (angleSlider) {
            angleSlider.addEventListener('input', e => {
                this.projState.angleDeg = parseFloat(e.target.value);
                this.resetProjectile();
                this.updateProjUI();
            });
        }

        const planetSelect = document.getElementById('projPlanetSelect');
        if (planetSelect) {
            planetSelect.addEventListener('change', e => {
                this.projState.gPreset = e.target.value;
                this.projState.g = this.planets[e.target.value].g;
                this.resetProjectile();
                this.updateProjUI();
            });
        }

        const launchBtn = document.getElementById('projLaunchBtn');
        if (launchBtn) {
            launchBtn.addEventListener('click', () => {
                this.launchProjectile();
            });
        }

        const resetBtn = document.getElementById('projResetBtn');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                this.resetProjectile();
                soundSynth.playClick(400, 0.05);
            });
        }
    }

    launchProjectile() {
        const rad = (this.projState.angleDeg * Math.PI) / 180;
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
        const rad = (this.projState.angleDeg * Math.PI) / 180;
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
        const rad = (this.projState.angleDeg * Math.PI) / 180;
        const v0 = this.projState.v0;
        const g = this.projState.g;
        const h = this.projState.launchHeight;

        const vx0 = v0 * Math.cos(rad);
        const vy0 = v0 * Math.sin(rad);

        // Theoretical range R and peak height H
        const tPeak = vy0 / g;
        const hMax = h + (vy0 * vy0) / (2 * g);
        const tTotal = (vy0 + Math.sqrt(vy0 * vy0 + 2 * g * h)) / g;
        const range = vx0 * tTotal;

        const v0Val = document.getElementById('projV0Val');
        if (v0Val) v0Val.textContent = v0.toFixed(1);

        const angleVal = document.getElementById('projAngleVal');
        if (angleVal) angleVal.textContent = `${this.projState.angleDeg.toFixed(0)}°`;

        const vxVal = document.getElementById('projVxVal');
        if (vxVal) vxVal.textContent = vx0.toFixed(2);

        const vyVal = document.getElementById('projVyVal');
        if (vyVal) vyVal.textContent = vy0.toFixed(2);

        const rangeVal = document.getElementById('projRangeVal');
        if (rangeVal) rangeVal.textContent = `${range.toFixed(2)} m`;

        const hMaxVal = document.getElementById('projHMaxVal');
        if (hMaxVal) hMaxVal.textContent = `${hMax.toFixed(2)} m`;

        const scoreEl = document.getElementById('projScoreVal');
        if (scoreEl) scoreEl.textContent = this.projState.score;

        const latexEl = document.getElementById('projLatex');
        if (latexEl && window.katex) {
            try {
                window.katex.render(
                    `x(t) = v_{0x} t, \\quad y(t) = h + v_{0y} t - \\frac{1}{2} g t^2 \\quad (g = ${g.toFixed(2)}\\text{ m/s}^2)`,
                    latexEl,
                    { displayMode: false, throwOnError: false }
                );
            } catch (_) {}
        }
    }

    renderProjectile(dt) {
        if (!this.projCu) return;
        const ctx = this.projCu.ctx;
        const coord = this.projCoord;
        const ball = this.projState.ballPos;

        // In-Flight Physics Integration
        if (this.projState.inFlight) {
            const subSteps = 10;
            const subDt = (dt * this.projState.simSpeed) / subSteps;
            for (let s = 0; s < subSteps; s++) {
                this.projState.flightTime += subDt;
                ball.x += ball.vx * subDt;
                ball.y += ball.vy * subDt;
                ball.vy -= this.projState.g * subDt;

                // Strobe capture every 0.25s
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

                // Target Hoop Hit-Test
                const distToTarget = Math.hypot(ball.x - this.projState.targetX, ball.y - this.projState.targetY);
                if (!this.projState.hitTarget && distToTarget <= this.projState.targetRadius) {
                    this.projState.hitTarget = true;
                    this.projState.score += 100;
                    soundSynth.playSuccess();
                }

                // Ground Collision
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

        // 1. Draw Ground Line
        const sZeroY = coord.toScreenY(0);
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, sZeroY);
        ctx.lineTo(this.projCu.logicalWidth, sZeroY);
        ctx.stroke();

        // Ground Grass/Soil Hash Pattern
        ctx.strokeStyle = 'rgba(16, 185, 129, 0.3)';
        ctx.lineWidth = 1;
        for (let gx = 0; gx < this.projCu.logicalWidth; gx += 12) {
            ctx.beginPath();
            ctx.moveTo(gx, sZeroY);
            ctx.lineTo(gx - 6, sZeroY + 8);
            ctx.stroke();
        }
        ctx.restore();

        // 2. Draw Target Hoop
        const sTargetX = coord.toScreenX(this.projState.targetX);
        const sTargetY = coord.toScreenY(this.projState.targetY);
        const sTargetR = coord.toScreenDist(this.projState.targetRadius);

        ctx.save();
        ctx.shadowColor = this.projState.hitTarget ? COLORS.emeraldGlow : COLORS.amberGlow;
        ctx.shadowBlur = this.projState.hitTarget ? 24 : 14;

        // Outer Ring
        ctx.strokeStyle = this.projState.hitTarget ? COLORS.emerald : COLORS.amber;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(sTargetX, sTargetY, sTargetR, 0, Math.PI * 2);
        ctx.stroke();

        // Center Bullseye
        ctx.fillStyle = this.projState.hitTarget ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.18)';
        ctx.fill();

        // Hoop Post down to ground
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(sTargetX, sTargetY + sTargetR);
        ctx.lineTo(sTargetX, sZeroY);
        ctx.stroke();
        ctx.restore();

        // Target Draggable Handle
        if (!this.targetHandle.isDragging) {
            this.targetHandle.x = sTargetX;
            this.targetHandle.y = sTargetY;
        }
        this.targetHandle.draw(ctx, this.time);

        // 3. Draw Constant-Time Strobe Markers (Δt = 0.25s)
        this.projState.strobes.forEach((strobe, idx) => {
            const sx = coord.toScreenX(strobe.x);
            const sy = coord.toScreenY(strobe.y);

            // Small ghost circle
            ctx.save();
            ctx.fillStyle = 'rgba(6, 182, 212, 0.45)';
            ctx.beginPath();
            ctx.arc(sx, sy, 4, 0, Math.PI * 2);
            ctx.fill();

            // Strobe time pill badge
            ctx.font = '9px Inter, system-ui, sans-serif';
            ctx.fillStyle = COLORS.textDim;
            ctx.textAlign = 'center';
            ctx.fillText(`${strobe.t.toFixed(2)}s`, sx, sy - 8);
            ctx.restore();
        });

        // 4. Draw Trajectory Path
        const rad = (this.projState.angleDeg * Math.PI) / 180;
        const v0 = this.projState.v0;
        const g = this.projState.g;
        const h0 = this.projState.launchHeight;
        const vx0 = v0 * Math.cos(rad);
        const vy0 = v0 * Math.sin(rad);

        ctx.save();
        ctx.strokeStyle = 'rgba(6, 182, 212, 0.35)';
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

        // 5. Draw Projectile Ball with Live Velocity Decomposition Vectors
        const sBallX = coord.toScreenX(ball.x);
        const sBallY = coord.toScreenY(ball.y);

        // Velocity vectors
        const vectorScale = 1.2;
        const vxScreen = coord.toScreenDist(ball.vx * vectorScale);
        const vyScreen = -coord.toScreenDist(ball.vy * vectorScale); // inverted Y in screen space

        // Horizontal velocity vector (vx) in Emerald
        drawVector(ctx, sBallX, sBallY, sBallX + vxScreen, sBallY, {
            color: COLORS.emerald,
            glowColor: COLORS.emeraldGlow,
            lineWidth: 2,
            arrowSize: 8,
            label: `v_x = ${ball.vx.toFixed(1)}`,
            badgeOffset: -14
        });

        // Vertical velocity vector (vy) in Rose
        drawVector(ctx, sBallX, sBallY, sBallX, sBallY + vyScreen, {
            color: COLORS.rose,
            glowColor: COLORS.roseGlow,
            lineWidth: 2,
            arrowSize: 8,
            label: `v_y = ${ball.vy.toFixed(1)}`,
            badgeOffset: 14
        });

        // Resultant Velocity Vector in Cyan
        drawVector(ctx, sBallX, sBallY, sBallX + vxScreen, sBallY + vyScreen, {
            color: COLORS.cyan,
            glowColor: COLORS.cyanGlow,
            lineWidth: 2.5,
            arrowSize: 9,
            label: `v = ${Math.hypot(ball.vx, ball.vy).toFixed(1)}`
        });

        // Glowing Ball
        ctx.save();
        ctx.shadowColor = COLORS.cyanGlow;
        ctx.shadowBlur = 16;
        ctx.fillStyle = COLORS.cyan;
        ctx.beginPath();
        ctx.arc(sBallX, sBallY, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
    }

    /* =========================================================================
     * 2. DAMPED PENDULUM & PHASE SPACE ORBIT PLOT
     * ========================================================================= */
    initPendulum() {
        const physCanvas = document.getElementById('pendPhysCanvas');
        const phaseCanvas = document.getElementById('pendPhaseCanvas');
        if (!physCanvas || !phaseCanvas) return;

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
            xLabel: 'θ (rad)',
            yLabel: 'ω (rad/s)'
        });

        // Draggable Pendulum Bob Handle
        this.pendBobHandle = new DraggableHandle(0, 0, {
            radius: 12,
            hitRadius: 28,
            color: COLORS.rose,
            glowColor: COLORS.roseGlow,
            label: 'Bob',
            constrain: (nx, ny) => {
                const ox = this.pendPhysCoord.originX;
                const oy = this.pendPhysCoord.originY;
                const dx = nx - ox;
                const dy = ny - oy;
                const angle = Math.atan2(dx, dy); // angle from downward vertical
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
        const dampSlider = document.getElementById('pendDampSlider');
        if (dampSlider) {
            dampSlider.addEventListener('input', e => {
                this.pendState.damping = parseFloat(e.target.value);
                const dampVal = document.getElementById('pendDampVal');
                if (dampVal) dampVal.textContent = this.pendState.damping.toFixed(2);
            });
        }

        const lenSlider = document.getElementById('pendLenSlider');
        if (lenSlider) {
            lenSlider.addEventListener('input', e => {
                this.pendState.length = parseFloat(e.target.value);
                this.updatePendHandle();
                this.updatePendUI();
            });
        }

        const playBtn = document.getElementById('pendPlayBtn');
        if (playBtn) {
            playBtn.addEventListener('click', () => {
                this.pendState.running = !this.pendState.running;
                playBtn.textContent = this.pendState.running ? '⏸ Pause' : '▶ Play';
            });
        }

        const resetBtn = document.getElementById('pendResetBtn');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
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

        // Kinetic Energy: Ek = 0.5 * m * (L * omega)²
        const Ek = 0.5 * m * (L * omega) * (L * omega);
        // Potential Energy (zero at lowest point): Ep = m * g * L * (1 - cos(theta))
        const Ep = m * g * L * (1 - Math.cos(theta));
        const Etot = Ek + Ep;

        // Update Energy Bars in HTML
        const ekBar = document.getElementById('pendEkBar');
        const epBar = document.getElementById('pendEpBar');
        const ekVal = document.getElementById('pendEkVal');
        const epVal = document.getElementById('pendEpVal');
        const etotVal = document.getElementById('pendEtotVal');

        const maxDisplayE = Math.max(10, Etot * 1.2);
        const ekPct = Math.min(100, (Ek / maxDisplayE) * 100);
        const epPct = Math.min(100, (Ep / maxDisplayE) * 100);

        if (ekBar) ekBar.style.width = `${ekPct}%`;
        if (epBar) epBar.style.width = `${epPct}%`;
        if (ekVal) ekVal.textContent = `${Ek.toFixed(2)} J`;
        if (epVal) epVal.textContent = `${Ep.toFixed(2)} J`;
        if (etotVal) etotVal.textContent = `${Etot.toFixed(2)} J`;

        const latexEl = document.getElementById('pendLatex');
        if (latexEl && window.katex) {
            try {
                window.katex.render(
                    `\\frac{d^2\\theta}{dt^2} + \\gamma \\frac{d\\theta}{dt} + \\frac{g}{L} \\sin\\theta = 0 \\quad (E = E_k + E_p = ${Etot.toFixed(2)}\\text{ J})`,
                    latexEl,
                    { displayMode: false, throwOnError: false }
                );
            } catch (_) {}
        }
    }

    renderPendulum(dt) {
        if (!this.pendPhysCu || !this.pendPhaseCu) return;

        // Physical Integration: Runge-Kutta 4th order (RK4) for non-linear pendulum
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

            for (let i = 0; i < steps; i++) {
                const k1 = derivatives(this.pendState.theta, this.pendState.omega);
                const k2 = derivatives(
                    this.pendState.theta + 0.5 * subDt * k1.dTheta,
                    this.pendState.omega + 0.5 * subDt * k1.dOmega
                );
                const k3 = derivatives(
                    this.pendState.theta + 0.5 * subDt * k2.dTheta,
                    this.pendState.omega + 0.5 * subDt * k2.dOmega
                );
                const k4 = derivatives(
                    this.pendState.theta + subDt * k3.dTheta,
                    this.pendState.omega + subDt * k3.dOmega
                );

                this.pendState.theta += (subDt / 6) * (k1.dTheta + 2 * k2.dTheta + 2 * k3.dTheta + k4.dTheta);
                this.pendState.omega += (subDt / 6) * (k1.dOmega + 2 * k2.dOmega + 2 * k3.dOmega + k4.dOmega);
            }

            // Record phase space orbit point (θ, ω)
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

        // =====================================================================
        // LEFT CANVAS: Real-Time Physical Pendulum Rig
        // =====================================================================
        const ctxPhys = this.pendPhysCu.ctx;
        this.pendPhysCu.clear();

        const ox = this.pendPhysCoord.originX;
        const oy = this.pendPhysCoord.originY;
        const rScreen = this.pendPhysCoord.toScreenDist(this.pendState.length);
        const bobX = ox + Math.sin(this.pendState.theta) * rScreen;
        const bobY = oy + Math.cos(this.pendState.theta) * rScreen;

        // Ceiling Mount Anchor
        ctxPhys.save();
        ctxPhys.fillStyle = 'rgba(255, 255, 255, 0.2)';
        ctxPhys.fillRect(ox - 35, oy - 8, 70, 8);
        ctxPhys.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctxPhys.strokeRect(ox - 35, oy - 8, 70, 8);

        // Equilibrium center dashed guideline
        ctxPhys.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctxPhys.setLineDash([4, 4]);
        ctxPhys.beginPath();
        ctxPhys.moveTo(ox, oy);
        ctxPhys.lineTo(ox, oy + rScreen + 20);
        ctxPhys.stroke();
        ctxPhys.setLineDash([]);

        // Pendulum Rod (Carbon / Neon Rod)
        ctxPhys.strokeStyle = COLORS.cyan;
        ctxPhys.lineWidth = 3;
        ctxPhys.shadowColor = COLORS.cyanGlow;
        ctxPhys.shadowBlur = 10;
        ctxPhys.beginPath();
        ctxPhys.moveTo(ox, oy);
        ctxPhys.lineTo(bobX, bobY);
        ctxPhys.stroke();

        // Pivot bearing
        ctxPhys.fillStyle = '#ffffff';
        ctxPhys.beginPath();
        ctxPhys.arc(ox, oy, 5, 0, Math.PI * 2);
        ctxPhys.fill();
        ctxPhys.restore();

        // Draw Draggable Bob
        if (!this.pendBobHandle.isDragging) {
            this.pendBobHandle.x = bobX;
            this.pendBobHandle.y = bobY;
        }
        this.pendBobHandle.draw(ctxPhys, this.time);

        // =====================================================================
        // RIGHT CANVAS: Phase Space Orbit Plot (θ, ω)
        // =====================================================================
        const ctxPhase = this.pendPhaseCu.ctx;
        const phaseCoord = this.pendPhaseCoord;
        this.pendPhaseCu.clear();
        phaseCoord.drawGrid();

        // Draw Inward Spiral or Closed Ellipse Orbit Trail
        const hist = this.pendState.phaseHistory;
        if (hist.length > 1) {
            ctxPhase.save();
            ctxPhase.lineWidth = 2;
            for (let i = 1; i < hist.length; i++) {
                const p0 = hist[i - 1];
                const p1 = hist[i];
                const alpha = (i / hist.length); // fade tail
                ctxPhase.strokeStyle = `rgba(139, 92, 246, ${alpha})`;
                ctxPhase.beginPath();
                ctxPhase.moveTo(phaseCoord.toScreenX(p0.theta), phaseCoord.toScreenY(p0.omega));
                ctxPhase.lineTo(phaseCoord.toScreenX(p1.theta), phaseCoord.toScreenY(p1.omega));
                ctxPhase.stroke();
            }
            ctxPhase.restore();
        }

        // Current phase state glowing point (θ, ω)
        const curPhaseX = phaseCoord.toScreenX(this.pendState.theta);
        const curPhaseY = phaseCoord.toScreenY(this.pendState.omega);

        ctxPhase.save();
        ctxPhase.shadowColor = COLORS.roseGlow;
        ctxPhase.shadowBlur = 16;
        ctxPhase.fillStyle = COLORS.rose;
        ctxPhase.beginPath();
        ctxPhase.arc(curPhaseX, curPhaseY, 6, 0, Math.PI * 2);
        ctxPhase.fill();
        ctxPhase.strokeStyle = '#ffffff';
        ctxPhase.lineWidth = 2;
        ctxPhase.stroke();
        ctxPhase.restore();
    }

    /* =========================================================================
     * 3. OPTICS & SNELL'S LAW (Refraction & Total Internal Reflection)
     * ========================================================================= */
    initOptics() {
        const canvas = document.getElementById('opticsCanvas');
        if (!canvas) return;

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

        // Draggable ray emitter handle
        this.rayHandle = new DraggableHandle(0, 0, {
            radius: 10,
            hitRadius: 26,
            color: COLORS.amber,
            glowColor: COLORS.amberGlow,
            label: 'Emitter',
            constrain: (nx, ny) => {
                const ox = this.opticsCoord.originX;
                const oy = this.opticsCoord.originY;
                const dx = nx - ox;
                const dy = ny - oy;
                // Emitter must stay in top medium (y < oy in screen space)
                const clampedDy = Math.min(-20, dy);
                const angle = Math.atan2(dx, -clampedDy); // angle relative to vertical normal
                this.opticsState.incidentAngleDeg = Math.max(0.5, Math.min(88, Math.abs((angle * 180) / Math.PI)));

                const R = this.opticsCoord.toScreenDist(this.opticsState.raySourceRadius);
                const rad = (this.opticsState.incidentAngleDeg * Math.PI) / 180;
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
        const rad = (this.opticsState.incidentAngleDeg * Math.PI) / 180;
        this.rayHandle.x = ox - Math.sin(rad) * R;
        this.rayHandle.y = oy - Math.cos(rad) * R;
    }

    bindOpticsControls() {
        const n1Select = document.getElementById('opticsN1Select');
        if (n1Select) {
            n1Select.addEventListener('change', e => {
                this.opticsState.n1 = parseFloat(e.target.value);
                this.updateRayHandle();
                this.updateOpticsUI();
            });
        }

        const n2Select = document.getElementById('opticsN2Select');
        if (n2Select) {
            n2Select.addEventListener('change', e => {
                this.opticsState.n2 = parseFloat(e.target.value);
                this.updateRayHandle();
                this.updateOpticsUI();
            });
        }

        const angleSlider = document.getElementById('opticsAngleSlider');
        if (angleSlider) {
            angleSlider.addEventListener('input', e => {
                this.opticsState.incidentAngleDeg = parseFloat(e.target.value);
                this.updateRayHandle();
                this.updateOpticsUI();
            });
        }
    }

    updateOpticsUI() {
        const n1 = this.opticsState.n1;
        const n2 = this.opticsState.n2;
        const theta1Rad = (this.opticsState.incidentAngleDeg * Math.PI) / 180;

        // Critical angle θc = arcsin(n2 / n1) if n1 > n2
        let critDeg = null;
        if (n1 > n2) {
            critDeg = (Math.asin(n2 / n1) * 180) / Math.PI;
        }
        this.opticsState.criticalAngleDeg = critDeg;

        // Snell's Law: n1 * sin(θ1) = n2 * sin(θ2) => sin(θ2) = (n1/n2)*sin(θ1)
        const sinTheta2 = (n1 / n2) * Math.sin(theta1Rad);
        this.opticsState.isTIR = sinTheta2 > 1.0;

        let theta2Deg = null;
        if (!this.opticsState.isTIR) {
            theta2Deg = (Math.asin(sinTheta2) * 180) / Math.PI;
        }

        const theta1El = document.getElementById('opticsTheta1Val');
        if (theta1El) theta1El.textContent = `${this.opticsState.incidentAngleDeg.toFixed(1)}°`;

        const theta2El = document.getElementById('opticsTheta2Val');
        if (theta2El) {
            theta2El.textContent = this.opticsState.isTIR ? 'TIR (Reflected!)' : `${theta2Deg.toFixed(1)}°`;
        }

        const critEl = document.getElementById('opticsCritVal');
        if (critEl) {
            critEl.textContent = critDeg !== null ? `${critDeg.toFixed(1)}°` : 'None (n1 ≤ n2)';
        }

        const latexEl = document.getElementById('opticsLatex');
        if (latexEl && window.katex) {
            try {
                const rightSide = this.opticsState.isTIR
                    ? `\\sin\\theta_2 > 1 \\implies \\text{\\textbf{Total Internal Reflection}}`
                    : `\\theta_2 = ${theta2Deg.toFixed(1)}^\\circ`;
                window.katex.render(
                    `n_1 \\sin\\theta_1 = n_2 \\sin\\theta_2 \\quad (${n1.toFixed(2)} \\cdot \\sin(${this.opticsState.incidentAngleDeg.toFixed(1)}^\\circ) = ${n2.toFixed(2)} \\cdot \\sin\\theta_2) \\implies ${rightSide}`,
                    latexEl,
                    { displayMode: false, throwOnError: false }
                );
            } catch (_) {}
        }
    }

    renderOptics() {
        if (!this.opticsCu) return;
        const ctx = this.opticsCu.ctx;
        this.opticsCu.clear();

        const w = this.opticsCu.logicalWidth;
        const h = this.opticsCu.logicalHeight;
        const ox = this.opticsCoord.originX;
        const oy = this.opticsCoord.originY;

        // 1. Medium 1 (Top) & Medium 2 (Bottom) Backdrops
        ctx.save();
        ctx.fillStyle = 'rgba(15, 23, 42, 0.4)';
        ctx.fillRect(0, 0, w, oy);

        // Medium 2 tint based on refractive index n2
        const densityTint = Math.min(0.65, (this.opticsState.n2 / 2.5) * 0.45);
        ctx.fillStyle = `rgba(6, 182, 212, ${densityTint})`;
        ctx.fillRect(0, oy, w, h - oy);

        // Boundary Interface
        ctx.strokeStyle = COLORS.cyan;
        ctx.lineWidth = 2;
        ctx.shadowColor = COLORS.cyanGlow;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.moveTo(0, oy);
        ctx.lineTo(w, oy);
        ctx.stroke();

        // Normal Line (Vertical dashed line)
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(ox, 20);
        ctx.lineTo(ox, h - 20);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();

        // Media labels
        ctx.font = '600 12px Inter, system-ui, sans-serif';
        ctx.fillStyle = '#94a3b8';
        ctx.textAlign = 'left';
        ctx.fillText(`Medium 1 (n₁ = ${this.opticsState.n1.toFixed(2)}, speed v₁ = ${(1 / this.opticsState.n1).toFixed(2)}c)`, 20, oy - 16);
        ctx.fillText(`Medium 2 (n₂ = ${this.opticsState.n2.toFixed(2)}, speed v₂ = ${(1 / this.opticsState.n2).toFixed(2)}c)`, 20, oy + 26);

        // 2. Incident Ray (Amber/Yellow)
        const rad1 = (this.opticsState.incidentAngleDeg * Math.PI) / 180;
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

        // 3. Refracted Ray OR Total Internal Reflection Ray
        const sinTheta2 = (this.opticsState.n1 / this.opticsState.n2) * Math.sin(rad1);
        if (sinTheta2 > 1.0) {
            // Total Internal Reflection (TIR) - Ray reflects back into Medium 1 at θ1
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
            // Refracted Ray into Medium 2
            const rad2 = Math.asin(sinTheta2);
            const refrX = ox + Math.sin(rad2) * R;
            const refrY = oy + Math.cos(rad2) * R;
            drawVector(ctx, ox, oy, refrX, refrY, {
                color: COLORS.emerald,
                glowColor: COLORS.emeraldGlow,
                lineWidth: 3,
                arrowSize: 12,
                label: `θ₂ = ${((rad2 * 180) / Math.PI).toFixed(0)}°`
            });

            // Partial reflection (Fresnel)
            const reflX = ox + Math.sin(rad1) * R;
            const reflY = oy - Math.cos(rad1) * R;
            ctx.save();
            ctx.strokeStyle = 'rgba(244, 63, 94, 0.35)';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.moveTo(ox, oy);
            ctx.lineTo(reflX, reflY);
            ctx.stroke();
            ctx.restore();
        }

        // Draw Emitter Handle
        if (!this.rayHandle.isDragging) {
            this.rayHandle.x = emitX;
            this.rayHandle.y = emitY;
        }
        this.rayHandle.draw(ctx, this.time);
    }

    /* =========================================================================
     * 4. WAVE INTERFERENCE (2D Dual-Source Ripple Tank & Projection Screen)
     * ========================================================================= */
    initWave() {
        const tankCanvas = document.getElementById('waveTankCanvas');
        const screenCanvas = document.getElementById('waveScreenCanvas');
        if (!tankCanvas || !screenCanvas) return;

        this.waveTankCu = new HiDPICanvas(tankCanvas);
        this.waveScreenCu = new HiDPICanvas(screenCanvas);

        this.bindWaveControls();
        this.updateWaveUI();
    }

    bindWaveControls() {
        const dSlider = document.getElementById('waveDSlider');
        if (dSlider) {
            dSlider.addEventListener('input', e => {
                this.waveState.sourceDist = parseFloat(e.target.value);
                this.updateWaveUI();
            });
        }

        const lambdaSlider = document.getElementById('waveLambdaSlider');
        if (lambdaSlider) {
            lambdaSlider.addEventListener('input', e => {
                this.waveState.wavelength = parseFloat(e.target.value);
                this.updateWaveUI();
            });
        }
    }

    updateWaveUI() {
        const d = this.waveState.sourceDist;
        const lambda = this.waveState.wavelength;

        const dVal = document.getElementById('waveDVal');
        if (dVal) dVal.textContent = `${d.toFixed(2)} m`;

        const lambdaVal = document.getElementById('waveLambdaVal');
        if (lambdaVal) lambdaVal.textContent = `${lambda.toFixed(2)} m`;

        const latexEl = document.getElementById('waveLatex');
        if (latexEl && window.katex) {
            try {
                window.katex.render(
                    `d \\sin\\theta = m\\lambda \\quad (\\text{Constructive Fringe: } y_m \\approx \\frac{m \\lambda L}{d})`,
                    latexEl,
                    { displayMode: false, throwOnError: false }
                );
            } catch (_) {}
        }
    }

    renderWaveInterference() {
        if (!this.waveTankCu || !this.waveScreenCu) return;
        const ctxTank = this.waveTankCu.ctx;
        const w = this.waveTankCu.logicalWidth;
        const h = this.waveTankCu.logicalHeight;

        this.waveTankCu.clear();

        const s1y = h / 2 - (this.waveState.sourceDist * 28);
        const s2y = h / 2 + (this.waveState.sourceDist * 28);
        const sX = 50;

        const k = (2 * Math.PI) / (this.waveState.wavelength * 35);
        const omega = this.waveState.frequency * 3.5;

        // Draw Animated Concentric Wavefront Rings from S1 and S2
        const maxR = Math.hypot(w - sX, h);
        const phase = (this.time * omega) % (2 * Math.PI);
        const ringStep = (2 * Math.PI) / k;

        ctxTank.save();
        ctxTank.lineWidth = 1.5;

        // Rings from S1
        for (let r = (phase / k); r < maxR; r += ringStep) {
            const alpha = Math.max(0, 0.45 * (1 - r / maxR));
            ctxTank.strokeStyle = `rgba(6, 182, 212, ${alpha})`;
            ctxTank.beginPath();
            ctxTank.arc(sX, s1y, r, -Math.PI / 2, Math.PI / 2);
            ctxTank.stroke();
        }

        // Rings from S2
        for (let r = (phase / k); r < maxR; r += ringStep) {
            const alpha = Math.max(0, 0.45 * (1 - r / maxR));
            ctxTank.strokeStyle = `rgba(244, 63, 94, ${alpha})`;
            ctxTank.beginPath();
            ctxTank.arc(sX, s2y, r, -Math.PI / 2, Math.PI / 2);
            ctxTank.stroke();
        }

        // Dual Point Sources S1 and S2
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

        // =====================================================================
        // RIGHT CANVAS: Intensity Projection Fringe Screen
        // =====================================================================
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
        for (let py = 0; py < sh; py += 2) {
            const dy = py - sh / 2;
            const theta = Math.atan2(dy, screenL);
            const pathDiff = (this.waveState.sourceDist * 28) * Math.sin(theta);
            const phaseDiff = k * pathDiff;
            // Intensity I = I0 * cos²(phaseDiff / 2)
            const I = Math.cos(phaseDiff / 2) ** 2;

            const plotX = sw * 0.15 + I * (sw * 0.7);
            if (!started) {
                ctxScreen.moveTo(plotX, py);
                started = true;
            } else {
                ctxScreen.lineTo(plotX, py);
            }

            // Draw bright fringe strip on left edge
            ctxScreen.fillStyle = `rgba(6, 182, 212, ${I * 0.9})`;
            ctxScreen.fillRect(0, py, sw * 0.12, 2);
        }
        ctxScreen.stroke();
        ctxScreen.restore();
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

            if (this.activeSub === 'projectile') {
                this.renderProjectile(dt);
            } else if (this.activeSub === 'pendulum') {
                this.renderPendulum(dt);
            } else if (this.activeSub === 'optics') {
                this.renderOptics();
            } else if (this.activeSub === 'wave') {
                this.renderWaveInterference();
            }

            this.animFrame = requestAnimationFrame(render);
        };
        this.animFrame = requestAnimationFrame(render);
    }

    destroy() {
        if (this.animFrame) cancelAnimationFrame(this.animFrame);
        if (this.projController) this.projController.destroy();
        if (this.pendController) this.pendController.destroy();
        if (this.opticsController) this.opticsController.destroy();
    }
}
