/**
 * IntuitionLab - Main Application Controller
 * Subject routing, sub-navigation tabs, search filtering, modal visual guide,
 * keyboard shortcuts (1, 2, 3, Space, R), and KaTeX math auto-rendering.
 */

import { CalculusLab } from './calculus.js';
import { PhysicsLab } from './physics.js';
import { AlgebraLab } from './algebra.js';
import { soundSynth, COLORS } from './canvas-utils.js';
import './expansion.js';

class IntuitionApp {
    constructor() {
        this.currentSubject = 'calculus'; // 'calculus', 'physics', 'algebra'
        this.currentSub = 'derivatives';

        this.calculusLab = null;
        this.physicsLab = null;
        this.algebraLab = null;

        this.searchPaletteOpen = false;
        this.guideModalOpen = false;

        this.simulations = [
            // Calculus
            { id: 'derivatives', subject: 'calculus', title: 'Derivatives & Tangent Limits', desc: 'Secant-to-tangent limit Δx → 0 with synchronized derivative f\'(x) curve trace.', tags: ['derivative', 'tangent', 'secant', 'limit', 'slope', 'calculus'] },
            { id: 'riemann', subject: 'calculus', title: 'Definite Integrals & Riemann Sums', desc: 'Left/Right/Midpoint/Trapezoid sums, draggable a & b boundaries, and animated slice melting.', tags: ['integral', 'riemann', 'area', 'trapezoid', 'sum', 'calculus'] },
            { id: 'ftc', subject: 'calculus', title: 'Fundamental Theorem of Calculus', desc: 'Area accumulation F(x) = ∫ f(t)dt with dynamic slope synchronization F\'(x) = f(x).', tags: ['ftc', 'fundamental', 'accumulation', 'slope', 'calculus'] },
            { id: 'gradient', subject: 'calculus', title: '2D Gradient Descent Optimization', desc: 'Downhill gradient vector field -∇f with momentum, learning rate, and contour terrains.', tags: ['gradient', 'descent', 'optimization', 'machine learning', 'vector field', 'calculus'] },
            { id: 'taylor', subject: 'calculus', title: 'Taylor Series Approximations', desc: 'Wrap polynomial degrees around a function to approximate it around a center point a.', tags: ['taylor', 'series', 'polynomial', 'approximation', 'calculus'] },
            { id: 'revolution', subject: 'calculus', title: 'Volume of Revolution', desc: 'Sweep a 2D function area around an axis to construct a 3D solid.', tags: ['volume', 'revolution', 'solid', 'disk', 'washer', 'calculus'] },

            // Physics
            { id: 'projectile', subject: 'physics', title: 'Projectile Kinematics & Target Game', desc: 'Real-time velocity decomposition (vx, vy), Δt=0.25s strobes, draggable hoop, and planetary gravities.', tags: ['projectile', 'kinematics', 'gravity', 'velocity', 'target', 'physics'] },
            { id: 'pendulum', subject: 'physics', title: 'Damped Pendulum & Phase Space', desc: 'Real-time Ek vs Ep energy bars with synchronized phase space orbit plot (θ, ω).', tags: ['pendulum', 'phase space', 'energy', 'damping', 'harmonic', 'physics'] },
            { id: 'optics', subject: 'physics', title: 'Optics & Snell\'s Law Refraction', desc: 'Refraction across media, wavefront speed change, and Total Internal Reflection at critical angle θc.', tags: ['optics', 'snell', 'refraction', 'tir', 'light', 'physics'] },
            { id: 'wave', subject: 'physics', title: 'Dual-Source Wave Interference', desc: '2D ripple tank with constructive peaks, destructive nodes, and fringe projection screen.', tags: ['wave', 'interference', 'double slit', 'ripple', 'fringes', 'physics'] },
            { id: 'orbital', subject: 'physics', title: 'Orbital Mechanics & Kepler\'s Laws', desc: 'Simulate a planet orbiting a star. Watch the velocity vector change and see equal areas swept in equal times.', tags: ['orbital', 'gravity', 'kepler', 'space', 'physics'] },
            { id: 'spring', subject: 'physics', title: 'Spring-Mass Harmonic Oscillator', desc: 'Drag the mass to stretch the spring. Watch the continuous exchange of Kinetic and Potential Energy.', tags: ['spring', 'mass', 'oscillator', 'hooke', 'energy', 'physics'] },

            // Algebra
            { id: 'matrix', subject: 'algebra', title: '2D Matrix Transformations', desc: '3Blue1Brown grid warping, basis handles î & ĵ, det(A) orientation flip, and eigenvector span axes.', tags: ['matrix', 'linear algebra', 'determinant', 'eigenvector', 'transformation', 'algebra'] },
            { id: 'quadratic', subject: 'algebra', title: 'Quadratic Functions & Discriminant', desc: 'Vertex form, axis of symmetry, and real-time discriminant gauge Δ = b² - 4ac (real vs complex roots).', tags: ['quadratic', 'parabola', 'discriminant', 'roots', 'algebra'] },
            { id: 'trig', subject: 'algebra', title: 'Unit Circle & Trigonometric Waves', desc: 'Rotating angle θ projecting cyan cosine and rose sine bars, unwinding into live running sine graph.', tags: ['unit circle', 'trigonometry', 'sine', 'cosine', 'wave', 'algebra'] },
            { id: 'linear', subject: 'algebra', title: 'Systems of Linear Equations', desc: 'Geometric intersection of two lines with Cramer\'s rule determinant classification.', tags: ['linear system', 'cramer', 'intersection', 'determinant', 'algebra'] },
            { id: 'complex', subject: 'algebra', title: 'Complex Plane & Euler\'s Formula', desc: 'Visualize e^(iθ) = cos(θ) + i sin(θ) and the relationship between circular motion, real, and imaginary components.', tags: ['complex', 'euler', 'imaginary', 'real', 'algebra'] },
            { id: 'eigen', subject: 'algebra', title: 'Eigenvectors & Eigenvalues', desc: 'Discover the invariant vectors that remain on their original span during a linear transformation.', tags: ['eigenvector', 'eigenvalue', 'matrix', 'transformation', 'algebra'] }
        ];
    }

    init() {
        // Initialize labs
        this.calculusLab = new CalculusLab();
        this.calculusLab.init();

        this.physicsLab = new PhysicsLab();
        this.physicsLab.init();

        this.algebraLab = new AlgebraLab();
        this.algebraLab.init();

        this.bindNavigation();
        this.bindKeyboardShortcuts();
        this.bindSearchPalette();
        this.bindModalGuide();
        this.bindExtraTools();

        // Listen for browser hash changes
        window.addEventListener('hashchange', () => {
            this.handleHashChange();
        });

        // Listen for cross-frame messages from parent
        window.addEventListener('message', e => {
            if (e.data && (e.data.type === 'NAVIGATE' || e.data.simId)) {
                this.goToHash(e.data.hash || e.data.simId);
            }
        });

        // Intercept any <a> clicks on page
        document.addEventListener('click', e => {
            const link = e.target.closest('a');
            if (link) {
                const href = link.getAttribute('href');
                if (href && href.startsWith('#')) {
                    e.preventDefault();
                    this.goToHash(href);
                } else if (href && href.includes('#')) {
                    const hash = href.split('#')[1];
                    if (hash && this.simulations.some(s => s.id === hash)) {
                        e.preventDefault();
                        this.goToHash(hash);
                    }
                }
            }
        });

        // Check URL hash for direct deep-link or default to derivatives
        if (window.location.hash) {
            this.goToHash(window.location.hash);
        } else {
            this.switchSubject('calculus');
            this.switchSub('derivatives');
        }
    }

    handleHashChange() {
        if (window.location.hash) {
            this.goToHash(window.location.hash);
        }
    }

    goToHash(hash) {
        if (!hash) return;
        const cleanHash = hash.replace(/^#/, '');
        const match = this.simulations.find(s => s.id === cleanHash);
        if (match) {
            if (this.currentSubject !== match.subject) {
                this.currentSubject = match.subject;

                // Update top navigation buttons
                document.querySelectorAll('[data-subject-tab]').forEach(tab => {
                    const isActive = tab.dataset.subjectTab === match.subject;
                    tab.classList.toggle('active', isActive);
                    tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
                });

                // Toggle subject container sections
                document.querySelectorAll('[data-subject-section]').forEach(sec => {
                    const isMatch = sec.dataset.subjectSection === match.subject;
                    if (isMatch) {
                        sec.removeAttribute('hidden');
                        sec.classList.add('active');
                    } else {
                        sec.setAttribute('hidden', '');
                        sec.classList.remove('active');
                    }
                });

                // Filter sub navigation pills for active subject
                document.querySelectorAll('[data-sub-tab]').forEach(btn => {
                    const subId = btn.dataset.subTab;
                    const sim = this.simulations.find(s => s.id === subId);
                    const isMatch = sim && sim.subject === match.subject;
                    if (isMatch) {
                        btn.removeAttribute('hidden');
                    } else {
                        btn.setAttribute('hidden', '');
                    }
                });
            }

            this.switchSub(match.id);
            if (window.location.hash !== '#' + cleanHash) {
                try {
                    history.replaceState(null, '', '#' + cleanHash);
                } catch (_) {
                    window.location.hash = cleanHash;
                }
            }
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }

    bindNavigation() {
        // Main subject tabs (Calculus, Physics, Algebra)
        document.querySelectorAll('[data-subject-tab]').forEach(tab => {
            tab.addEventListener('click', e => {
                const sub = tab.dataset.subjectTab;
                this.switchSubject(sub);
                soundSynth.playClick(500, 0.04);
            });
        });

        // Sub-navigation buttons
        document.querySelectorAll('[data-sub-tab]').forEach(btn => {
            btn.addEventListener('click', e => {
                const sub = btn.dataset.subTab;
                this.switchSub(sub);
                soundSynth.playClick(560, 0.03);
            });
        });
    }

    switchSubject(subjectName) {
        this.currentSubject = subjectName;

        // Update top navigation buttons
        document.querySelectorAll('[data-subject-tab]').forEach(tab => {
            const isActive = tab.dataset.subjectTab === subjectName;
            tab.classList.toggle('active', isActive);
            tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });

        // Toggle subject container sections
        document.querySelectorAll('[data-subject-section]').forEach(sec => {
            const isMatch = sec.dataset.subjectSection === subjectName;
            if (isMatch) {
                sec.removeAttribute('hidden');
                sec.classList.add('active');
            } else {
                sec.setAttribute('hidden', '');
                sec.classList.remove('active');
            }
        });

        // Filter sub navigation pills for active subject
        document.querySelectorAll('[data-sub-tab]').forEach(btn => {
            const subId = btn.dataset.subTab;
            const sim = this.simulations.find(s => s.id === subId);
            const isMatch = sim && sim.subject === subjectName;
            if (isMatch) {
                btn.removeAttribute('hidden');
            } else {
                btn.setAttribute('hidden', '');
            }
        });

        // Pick first sub simulation for the subject if current sub doesn't belong
        const validSubs = this.simulations.filter(s => s.subject === subjectName).map(s => s.id);
        if (!validSubs.includes(this.currentSub)) {
            this.switchSub(validSubs[0]);
        } else {
            this.switchSub(this.currentSub);
        }
    }

    switchSub(subId) {
        const sim = this.simulations.find(s => s.id === subId);
        if (sim && sim.subject !== this.currentSubject) {
            this.currentSub = subId;
            this.switchSubject(sim.subject);
            return;
        }

        this.currentSub = subId;
        if (window.location.hash !== '#' + subId) {
            try {
                history.replaceState(null, '', '#' + subId);
            } catch (_) {
                window.location.hash = subId;
            }
        }

        // Update active lab state
        if (this.calculusLab) this.calculusLab.activeSub = subId;
        if (this.physicsLab) this.physicsLab.activeSub = subId;
        if (this.algebraLab) this.algebraLab.activeSub = subId;
        
        if (window.ExpansionApp) window.ExpansionApp.startSim(subId);

        // Update sub navigation pills
        document.querySelectorAll('[data-sub-tab]').forEach(btn => {
            const isActive = btn.dataset.subTab === subId;
            btn.classList.toggle('active', isActive);
        });

        // Toggle simulation panel cards
        document.querySelectorAll('[data-sub-panel]').forEach(panel => {
            const isMatch = panel.dataset.subPanel === subId;
            if (isMatch) {
                panel.removeAttribute('hidden');
                panel.classList.add('active');
            } else {
                panel.setAttribute('hidden', '');
                panel.classList.remove('active');
            }
        });

        // Trigger resize on active canvases so they adapt immediately
        window.dispatchEvent(new Event('resize'));
        setTimeout(() => {
            window.dispatchEvent(new Event('resize'));
        }, 50);
    }

    bindKeyboardShortcuts() {
        window.addEventListener('keydown', e => {
            // Ignore keystrokes in input or textarea
            if (e.target.matches('input, select, textarea')) return;

            if (e.key === '1') {
                e.preventDefault();
                this.switchSubject('calculus');
            } else if (e.key === '2') {
                e.preventDefault();
                this.switchSubject('physics');
            } else if (e.key === '3') {
                e.preventDefault();
                this.switchSubject('algebra');
            } else if (e.key === ' ' || e.code === 'Space') {
                e.preventDefault();
                this.toggleActiveSimulation();
            } else if (e.key === 'r' || e.key === 'R') {
                e.preventDefault();
                this.resetActiveSimulation();
            } else if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                this.toggleSearchPalette();
            } else if (e.key === '?' || (e.shiftKey && e.key === '/')) {
                e.preventDefault();
                this.toggleGuideModal();
            } else if (e.key === 'Escape') {
                if (this.searchPaletteOpen) this.toggleSearchPalette(false);
                if (this.guideModalOpen) this.toggleGuideModal(false);
            }
        });
    }

    toggleActiveSimulation() {
        if (this.currentSub === 'gradient') {
            const playBtn = document.getElementById('gdPlayBtn');
            if (playBtn) playBtn.click();
        } else if (this.currentSub === 'projectile') {
            const launchBtn = document.getElementById('projLaunchBtn');
            if (launchBtn) launchBtn.click();
        } else if (this.currentSub === 'pendulum') {
            const playBtn = document.getElementById('pendPlayBtn');
            if (playBtn) playBtn.click();
        } else if (this.currentSub === 'trig') {
            const autoBtn = document.getElementById('trigAutoToggle');
            if (autoBtn) autoBtn.click();
        } else if (this.currentSub === 'derivatives') {
            const limitBtn = document.getElementById('derivLimitBtn');
            if (limitBtn) limitBtn.click();
        } else if (this.currentSub === 'riemann') {
            const meltBtn = document.getElementById('riemannMeltBtn');
            if (meltBtn) meltBtn.click();
        }
    }

    resetActiveSimulation() {
        if (this.currentSub === 'derivatives') {
            const btn = document.getElementById('derivResetBtn');
            if (btn) btn.click();
        } else if (this.currentSub === 'gradient') {
            const btn = document.getElementById('gdResetBtn');
            if (btn) btn.click();
        } else if (this.currentSub === 'projectile') {
            const btn = document.getElementById('projResetBtn');
            if (btn) btn.click();
        } else if (this.currentSub === 'pendulum') {
            const btn = document.getElementById('pendResetBtn');
            if (btn) btn.click();
        } else if (this.currentSub === 'matrix') {
            const btn = document.getElementById('matrixResetBtn');
            if (btn) btn.click();
        }
    }

    bindSearchPalette() {
        const triggerBtn = document.getElementById('searchPaletteTrigger');
        const overlay = document.getElementById('searchPaletteOverlay');
        const input = document.getElementById('searchPaletteInput');
        const resultsList = document.getElementById('searchPaletteResults');

        if (triggerBtn) {
            triggerBtn.addEventListener('click', () => this.toggleSearchPalette(true));
        }

        if (overlay) {
            overlay.addEventListener('click', e => {
                if (e.target === overlay) this.toggleSearchPalette(false);
            });
        }

        this.paletteSelectedIndex = 0;
        this.currentMatches = [];

        if (input) {
            input.addEventListener('input', e => {
                this.renderSearchResults(e.target.value);
            });

            input.addEventListener('keydown', e => {
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    if (this.currentMatches.length > 0) {
                        this.paletteSelectedIndex = (this.paletteSelectedIndex + 1) % this.currentMatches.length;
                        this.updatePaletteSelection();
                    }
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    if (this.currentMatches.length > 0) {
                        this.paletteSelectedIndex = (this.paletteSelectedIndex - 1 + this.currentMatches.length) % this.currentMatches.length;
                        this.updatePaletteSelection();
                    }
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    if (this.currentMatches[this.paletteSelectedIndex]) {
                        const item = this.currentMatches[this.paletteSelectedIndex];
                        this.switchSubject(item.subject);
                        this.switchSub(item.id);
                        this.toggleSearchPalette(false);
                        soundSynth.playClick(640, 0.05);
                    }
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    this.toggleSearchPalette(false);
                }
            });
        }
    }

    updatePaletteSelection() {
        const resultsList = document.getElementById('searchPaletteResults');
        if (!resultsList) return;
        const items = resultsList.querySelectorAll('.search-item');
        items.forEach((item, idx) => {
            item.classList.toggle('selected', idx === this.paletteSelectedIndex);
            if (idx === this.paletteSelectedIndex) {
                item.scrollIntoView({ block: 'nearest' });
            }
        });
    }

    toggleSearchPalette(forceState = null) {
        const overlay = document.getElementById('searchPaletteOverlay');
        const input = document.getElementById('searchPaletteInput');
        if (!overlay) return;

        this.searchPaletteOpen = forceState !== null ? forceState : !this.searchPaletteOpen;
        overlay.hidden = !this.searchPaletteOpen;
        overlay.classList.toggle('open', this.searchPaletteOpen);

        if (this.searchPaletteOpen) {
            this.paletteSelectedIndex = 0;
            if (input) {
                input.value = '';
                input.focus();
            }
            this.renderSearchResults('');
            soundSynth.playClick(600, 0.04);
        }
    }

    renderSearchResults(query) {
        const resultsList = document.getElementById('searchPaletteResults');
        if (!resultsList) return;

        const q = query.trim().toLowerCase();
        this.currentMatches = this.simulations.filter(s => {
            if (!q) return true;
            return s.title.toLowerCase().includes(q) ||
                s.desc.toLowerCase().includes(q) ||
                s.tags.some(t => t.toLowerCase().includes(q));
        });

        this.paletteSelectedIndex = 0;
        resultsList.innerHTML = '';
        if (this.currentMatches.length === 0) {
            resultsList.innerHTML = `<li class="search-empty">No simulations match "${query}". Try "calculus", "matrix", "optics", or "projectile".</li>`;
            return;
        }

        this.currentMatches.forEach((item, index) => {
            const li = document.createElement('li');
            li.className = `search-item ${index === 0 ? 'selected' : ''}`;
            const subjectColor = item.subject === 'calculus' ? COLORS.cyan : (item.subject === 'physics' ? COLORS.amber : COLORS.rose);
            li.innerHTML = `
                <div class="search-item-info">
                    <span class="search-item-badge" style="color: ${subjectColor}; border-color: ${subjectColor}44;">${item.subject.toUpperCase()}</span>
                    <strong>${item.title}</strong>
                    <p>${item.desc}</p>
                </div>
                <span class="search-item-enter">↵</span>
            `;
            li.addEventListener('click', () => {
                this.switchSubject(item.subject);
                this.switchSub(item.id);
                this.toggleSearchPalette(false);
                soundSynth.playClick(640, 0.05);
            });
            resultsList.appendChild(li);
        });
    }

    bindModalGuide() {
        const guideBtn = document.getElementById('modalGuideTrigger');
        const overlay = document.getElementById('modalGuideOverlay');
        const closeBtn = document.getElementById('modalGuideClose');

        if (guideBtn) {
            guideBtn.addEventListener('click', () => this.toggleGuideModal(true));
        }

        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.toggleGuideModal(false));
        }

        if (overlay) {
            overlay.addEventListener('click', e => {
                if (e.target === overlay) this.toggleGuideModal(false);
            });
        }
    }

    toggleGuideModal(forceState = null) {
        const overlay = document.getElementById('modalGuideOverlay');
        if (!overlay) return;

        this.guideModalOpen = forceState !== null ? forceState : !this.guideModalOpen;
        overlay.hidden = !this.guideModalOpen;
        overlay.classList.toggle('open', this.guideModalOpen);

        if (this.guideModalOpen) {
            soundSynth.playClick(500, 0.05);
        }
    }

    bindExtraTools() {
        // Sound mute toggle
        const soundBtn = document.getElementById('soundToggleBtn');
        if (soundBtn) {
            soundBtn.addEventListener('click', () => {
                soundSynth.muted = !soundSynth.muted;
                soundBtn.textContent = soundSynth.muted ? '🔇 Sound Off' : '🔊 Sound On';
                soundBtn.classList.toggle('muted', soundSynth.muted);
                if (!soundSynth.muted) soundSynth.playClick(600, 0.05);
            });
        }

        // Export PNG Snapshot of current canvas
        const exportBtn = document.getElementById('exportCanvasBtn');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                this.exportCurrentCanvas();
            });
        }
    }

    exportCurrentCanvas() {
        // Find visible canvas in the active simulation panel
        const activePanel = document.querySelector('[data-sub-panel].active');
        if (!activePanel) return;

        const canvas = activePanel.querySelector('canvas');
        if (!canvas) return;

        try {
            const link = document.createElement('a');
            link.download = `IntuitionLab-${this.currentSub}-${Date.now()}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
            soundSynth.playSuccess();
        } catch (_) {}
    }
}

// Auto-boot on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    window.intuitionLabApp = new IntuitionApp();
    window.intuitionLabApp.init();
});
