// ============================================================================
// INTUITION LAB - EXPANSION SIMULATIONS
// Contains logic for Taylor Series, Orbital Mechanics, and Complex Euler
// ============================================================================

class ExpansionSimulations {
    constructor() {
        this.activeSim = null;
        this.animFrame = null;
        this.initComplexEuler();
        this.initTaylorSeries();
        this.initOrbitalMechanics();
    }

    startSim(simName) {
        if (this.animFrame) cancelAnimationFrame(this.animFrame);
        this.activeSim = simName;
        if (simName === 'complex') this.drawComplex();
        if (simName === 'taylor') this.drawTaylor();
        if (simName === 'orbital') this.loopOrbital();
    }

    stopSim() {
        if (this.animFrame) cancelAnimationFrame(this.animFrame);
        this.activeSim = null;
    }

    // ==========================================
    // COMPLEX EULER
    // ==========================================
    initComplexEuler() {
        this.complexState = { theta: 0.79, r: 1.0 };
        const canvas = document.getElementById('complexCanvas');
        if (!canvas) return;
        this.complexCtx = canvas.getContext('2d');
        
        const thetaSlider = document.getElementById('complexThetaSlider');
        const rSlider = document.getElementById('complexRSlider');
        
        if (thetaSlider) {
            thetaSlider.addEventListener('input', e => {
                this.complexState.theta = parseFloat(e.target.value);
                document.getElementById('complexThetaVal').textContent = `${this.complexState.theta.toFixed(2)} rad`;
                if (this.activeSim === 'complex') this.drawComplex();
            });
        }
        if (rSlider) {
            rSlider.addEventListener('input', e => {
                this.complexState.r = parseFloat(e.target.value);
                document.getElementById('complexRVal').textContent = this.complexState.r.toFixed(1);
                if (this.activeSim === 'complex') this.drawComplex();
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
        const scale = Math.min(w, h) / 4; // 1 unit = scale pixels
        
        // Draw Axes
        ctx.strokeStyle = "rgba(255,255,255,0.1)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, cy); ctx.lineTo(w, cy); // Real
        ctx.moveTo(cx, 0); ctx.lineTo(cx, h); // Imaginary
        ctx.stroke();
        
        // Draw Unit Circle
        ctx.beginPath();
        ctx.arc(cx, cy, scale, 0, Math.PI * 2);
        ctx.stroke();
        
        const { theta, r } = this.complexState;
        const px = cx + Math.cos(theta) * (r * scale);
        const py = cy - Math.sin(theta) * (r * scale); // y is inverted
        
        // Draw Vector
        ctx.strokeStyle = "#06b6d4"; // Cyan
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(px, py);
        ctx.stroke();
        
        // Draw Components
        ctx.setLineDash([5, 5]);
        ctx.strokeStyle = "#ff2d55"; // Pink (Imaginary)
        ctx.beginPath();
        ctx.moveTo(px, cy); ctx.lineTo(px, py);
        ctx.stroke();
        
        ctx.strokeStyle = "#30d158"; // Green (Real)
        ctx.beginPath();
        ctx.moveTo(cx, cy); ctx.lineTo(px, cy);
        ctx.stroke();
        ctx.setLineDash([]);
        
        // Point
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(px, py, 6, 0, Math.PI * 2);
        ctx.fill();
        
        // Text
        ctx.fillStyle = "rgba(255,255,255,0.8)";
        ctx.font = "14px monospace";
        ctx.fillText(`Real: ${(r * Math.cos(theta)).toFixed(2)}`, 20, 30);
        ctx.fillText(`Imag: ${(r * Math.sin(theta)).toFixed(2)}i`, 20, 50);
    }

    // ==========================================
    // TAYLOR SERIES
    // ==========================================
    initTaylorSeries() {
        this.taylorState = { n: 3, a: 0 };
        const canvas = document.getElementById('taylorCanvas');
        if (!canvas) return;
        this.taylorCtx = canvas.getContext('2d');
        
        const nSlider = document.getElementById('taylorNSlider');
        const aSlider = document.getElementById('taylorASlider');
        
        if (nSlider) {
            nSlider.addEventListener('input', e => {
                this.taylorState.n = parseInt(e.target.value);
                document.getElementById('taylorNVal').textContent = this.taylorState.n;
                if (this.activeSim === 'taylor') this.drawTaylor();
            });
        }
        if (aSlider) {
            aSlider.addEventListener('input', e => {
                this.taylorState.a = parseFloat(e.target.value);
                document.getElementById('taylorAVal').textContent = this.taylorState.a.toFixed(1);
                if (this.activeSim === 'taylor') this.drawTaylor();
            });
        }
    }
    
    fact(num) {
        let rval = 1;
        for (let i = 2; i <= num; i++) rval = rval * i;
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
        
        // Axes
        ctx.strokeStyle = "rgba(255,255,255,0.1)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, cy); ctx.lineTo(w, cy);
        ctx.moveTo(cx, 0); ctx.lineTo(cx, h);
        ctx.stroke();
        
        // Base Function: sin(x)
        const f = (x) => Math.sin(x);
        // Derivatives of sin(x): sin, cos, -sin, -cos
        const d_f = (x, n) => {
            const m = n % 4;
            if (m === 0) return Math.sin(x);
            if (m === 1) return Math.cos(x);
            if (m === 2) return -Math.sin(x);
            if (m === 3) return -Math.cos(x);
        };
        
        const { n, a } = this.taylorState;
        
        // Taylor polynomial sum
        const taylor = (x) => {
            let sum = 0;
            for (let i = 0; i <= n; i++) {
                sum += (d_f(a, i) / this.fact(i)) * Math.pow((x - a), i);
            }
            return sum;
        };
        
        // Draw actual function
        ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let px = 0; px < w; px++) {
            const x = (px - cx) / scale;
            const y = f(x);
            const py = cy - y * scale;
            if (px === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.stroke();
        
        // Draw Taylor Approx
        ctx.strokeStyle = "#ff2d55"; // Rose
        ctx.lineWidth = 3;
        ctx.beginPath();
        for (let px = 0; px < w; px++) {
            const x = (px - cx) / scale;
            const y = taylor(x);
            const py = cy - y * scale;
            if (px === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.stroke();
        
        // Draw Center Point (a)
        const pxa = cx + a * scale;
        const pya = cy - f(a) * scale;
        ctx.fillStyle = "#06b6d4";
        ctx.beginPath();
        ctx.arc(pxa, pya, 6, 0, Math.PI * 2);
        ctx.fill();
    }

    // ==========================================
    // ORBITAL MECHANICS
    // ==========================================
    initOrbitalMechanics() {
        this.orbState = { 
            v0: 1.2, 
            x: 150, y: 0, 
            vx: 0, vy: 1.2,
            massStar: 50000, G: 0.1
        };
        const canvas = document.getElementById('orbitalCanvas');
        if (!canvas) return;
        this.orbCtx = canvas.getContext('2d');
        this.orbTrail = [];
        
        const v0Slider = document.getElementById('orbV0Slider');
        const resetBtn = document.getElementById('resetOrbitBtn');
        
        if (v0Slider) {
            v0Slider.addEventListener('input', e => {
                this.orbState.v0 = parseFloat(e.target.value);
                document.getElementById('orbV0Val').textContent = this.orbState.v0.toFixed(2);
                this.resetOrbit();
            });
        }
        if (resetBtn) {
            resetBtn.addEventListener('click', () => this.resetOrbit());
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
        if (this.activeSim !== 'orbital') return;
        this.updateOrbit();
        this.drawOrbit();
        this.animFrame = requestAnimationFrame(() => this.loopOrbital());
    }

    updateOrbit() {
        // Simple Euler integration
        const dt = 0.5;
        const steps = 4; // Sub-steps for stability
        
        for (let i=0; i<steps; i++) {
            const r2 = this.orbState.x*this.orbState.x + this.orbState.y*this.orbState.y;
            const r = Math.sqrt(r2);
            
            // F = G * M / r^2
            const f = (this.orbState.G * this.orbState.massStar) / r2;
            const ax = -f * (this.orbState.x / r);
            const ay = -f * (this.orbState.y / r);
            
            this.orbState.vx += ax * dt;
            this.orbState.vy += ay * dt;
            this.orbState.x += this.orbState.vx * dt;
            this.orbState.y += this.orbState.vy * dt;
        }
        
        this.orbTrail.push({x: this.orbState.x, y: this.orbState.y});
        if (this.orbTrail.length > 300) this.orbTrail.shift();
    }

    drawOrbit() {
        const ctx = this.orbCtx;
        const canvas = ctx.canvas;
        const w = canvas.width;
        const h = canvas.height;
        ctx.clearRect(0, 0, w, h);
        
        const cx = w / 2;
        const cy = h / 2;
        
        // Trail
        ctx.strokeStyle = "rgba(6, 182, 212, 0.4)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < this.orbTrail.length; i++) {
            const pt = this.orbTrail[i];
            if (i === 0) ctx.moveTo(cx + pt.x, cy + pt.y);
            else ctx.lineTo(cx + pt.x, cy + pt.y);
        }
        ctx.stroke();
        
        // Star (Center)
        ctx.fillStyle = "#ffcc00";
        ctx.shadowColor = "#ffcc00";
        ctx.shadowBlur = 20;
        ctx.beginPath();
        ctx.arc(cx, cy, 15, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        
        // Planet
        const px = cx + this.orbState.x;
        const py = cy + this.orbState.y;
        ctx.fillStyle = "#06b6d4";
        ctx.beginPath();
        ctx.arc(px, py, 6, 0, Math.PI * 2);
        ctx.fill();
        
        // Velocity Vector
        ctx.strokeStyle = "#ff2d55";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + this.orbState.vx * 20, py + this.orbState.vy * 20);
        ctx.stroke();
    }
}

window.ExpansionApp = new ExpansionSimulations();
