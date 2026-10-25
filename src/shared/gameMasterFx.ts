/**
 * ⚡ Codecaine Game Master FX & Post-Processing Engine
 *
 * Universal GPU-accelerated visual enhancement layer, live post-processing shader suite,
 * interactive particle shockwave engine, automatic score/combo floating telemetry,
 * and arcade HUD controller for all 24 Codecaine Arcade Studio games.
 */

export const GAME_MASTER_SHADER_PRESETS = [
  { id: "cyber_bloom", label: "⚡ Cyber Bloom", badge: "HDR" },
  { id: "crt_arcade", label: "📺 CRT 1984", badge: "SCAN" },
  { id: "synthwave", label: "🌆 Synthwave", badge: "NEON" },
  { id: "matrix", label: "🟢 Matrix Grid", badge: "CODE" },
  { id: "golden_vip", label: "👑 Golden VIP", badge: "LUX" },
  { id: "clean", label: "🎯 Esports Raw", badge: "RAW" },
] as const;

export type GameMasterShaderPresetId = (typeof GAME_MASTER_SHADER_PRESETS)[number]["id"];

export const GAME_MASTER_FX_STYLE = `
<style id="codecaine-game-master-fx-style">
  :root {
    --in-oklab: ;
    --in-oklch: ;
    --gm-accent: #00f3ff;
    --gm-magenta: #ff007f;
    --gm-gold: #ffd700;
    --gm-emerald: #00ff88;
  }
  @supports (background: linear-gradient(in oklab, white, black)) {
    :root {
      --in-oklab: in oklab;
      --in-oklch: in oklch;
    }
  }

  /* Screen-Space Post-Process Overlay Layer */
  #gm-fx-postprocess {
    position: fixed !important;
    inset: 0 !important;
    width: 100vw !important;
    height: 100vh !important;
    pointer-events: none !important;
    z-index: 99990 !important;
    isolation: isolate;
    overflow: hidden;
    transition: opacity 0.25s ease;
  }

  html[data-gm-shader="clean"] #gm-fx-postprocess {
    opacity: 0;
    backdrop-filter: none;
  }

  html[data-gm-shader="cyber_bloom"] #gm-fx-postprocess {
    backdrop-filter: saturate(1.14) contrast(1.04);
    background:
      radial-gradient(var(--in-oklab) circle at 50% 0%, rgba(0, 243, 255, 0.08) 0%, transparent 62%),
      radial-gradient(var(--in-oklab) circle at 50% 100%, rgba(255, 0, 127, 0.07) 0%, transparent 60%);
    box-shadow: inset 0 0 65px rgba(0, 243, 255, 0.08), inset 0 0 120px rgba(3, 5, 14, 0.42);
  }

  html[data-gm-shader="crt_arcade"] #gm-fx-postprocess {
    backdrop-filter: contrast(1.1) saturate(1.15);
    background:
      repeating-linear-gradient(
        0deg,
        rgba(0, 0, 0, 0.22) 0px,
        rgba(0, 0, 0, 0.22) 1px,
        transparent 1px,
        transparent 3px
      ),
      repeating-linear-gradient(
        90deg,
        rgba(255, 0, 85, 0.03) 0px,
        rgba(0, 255, 136, 0.03) 1px,
        rgba(0, 243, 255, 0.03) 2px,
        transparent 3px
      );
    box-shadow: inset 0 0 90px rgba(0, 0, 0, 0.62), inset 0 0 28px rgba(0, 243, 255, 0.16);
  }

  html[data-gm-shader="synthwave"] #gm-fx-postprocess {
    backdrop-filter: saturate(1.24) contrast(1.06) hue-rotate(-6deg);
    background:
      linear-gradient(var(--in-oklab) 180deg, rgba(255, 0, 128, 0.09) 0%, transparent 45%, rgba(0, 243, 255, 0.11) 100%);
    box-shadow: inset 0 0 75px rgba(255, 0, 128, 0.14);
  }

  html[data-gm-shader="matrix"] #gm-fx-postprocess {
    backdrop-filter: hue-rotate(75deg) saturate(1.25) contrast(1.08);
    background:
      repeating-linear-gradient(
        0deg,
        rgba(0, 255, 102, 0.04) 0px,
        rgba(0, 255, 102, 0.04) 1px,
        transparent 1px,
        transparent 4px
      ),
      radial-gradient(circle at 50% 50%, transparent 55%, rgba(0, 20, 8, 0.48) 100%);
  }

  html[data-gm-shader="golden_vip"] #gm-fx-postprocess {
    backdrop-filter: sepia(0.18) saturate(1.3) contrast(1.06);
    background:
      radial-gradient(var(--in-oklab) circle at 50% 10%, rgba(255, 215, 0, 0.10) 0%, transparent 65%),
      radial-gradient(var(--in-oklab) circle at 50% 90%, rgba(255, 140, 0, 0.08) 0%, transparent 65%);
    box-shadow: inset 0 0 70px rgba(255, 200, 0, 0.12);
  }

  /* Interactive Particle & Shockwave Canvas */
  #gm-fx-canvas {
    position: fixed !important;
    inset: 0 !important;
    width: 100vw !important;
    height: 100vh !important;
    max-width: none !important;
    max-height: none !important;
    aspect-ratio: auto !important;
    background: transparent !important;
    background-color: transparent !important;
    border: none !important;
    box-shadow: none !important;
    pointer-events: none !important;
    z-index: 99991 !important;
  }

  /* Floating Score / Combo Callout Layer */
  #gm-fx-callouts {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 99992;
    overflow: hidden;
  }

  .gm-floating-callout {
    position: fixed;
    pointer-events: none;
    font-family: 'Orbitron', 'Inter', system-ui, sans-serif;
    font-weight: 900;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #00f3ff;
    filter: drop-shadow(0 0 10px rgba(0, 243, 255, 0.85));
    translate: -50% 0px;
    rotate: 0deg;
    scale: 1;
    animation: gmCalloutFloat 1.05s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    white-space: nowrap;
  }

  @keyframes gmCalloutFloat {
    0% {
      opacity: 0;
      translate: -50% 8px;
      scale: 0.65;
    }
    18% {
      opacity: 1;
      translate: -50% -6px;
      scale: 1.12;
    }
    100% {
      opacity: 0;
      translate: -50% -48px;
      scale: 0.94;
    }
  }

  /* Game Master Floating Dock & Pill */
  #gm-fx-dock {
    position: fixed;
    right: 12px;
    bottom: 12px;
    z-index: 99995;
    font-family: 'Orbitron', 'Inter', system-ui, sans-serif;
    user-select: none;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 8px;
  }

  #gm-fx-pill {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 6px 12px;
    border-radius: 999px;
    background: rgba(8, 12, 26, 0.86);
    border: 1px solid rgba(0, 243, 255, 0.42);
    color: #e8faff;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.07em;
    cursor: pointer;
    backdrop-filter: blur(12px);
    box-shadow: 0 4px 18px rgba(0, 0, 0, 0.55), 0 0 14px rgba(0, 243, 255, 0.22);
    translate: 0px 0px;
    rotate: 0deg;
    scale: 1;
    transition: scale 0.16s ease, border-color 0.2s ease, box-shadow 0.2s ease;
  }

  #gm-fx-pill:hover {
    scale: 1.05;
    border-color: #00f3ff;
    box-shadow: 0 6px 24px rgba(0, 243, 255, 0.38);
  }

  #gm-fx-fps-badge {
    font-family: 'Share Tech Mono', monospace;
    font-size: 10px;
    padding: 2px 6px;
    border-radius: 999px;
    background: rgba(0, 255, 136, 0.16);
    border: 1px solid rgba(0, 255, 136, 0.45);
    color: #00ff88;
  }

  #gm-fx-panel {
    width: 280px;
    padding: 12px;
    border-radius: 14px;
    background: rgba(7, 10, 22, 0.94);
    border: 1px solid rgba(0, 243, 255, 0.45);
    box-shadow: 0 16px 42px rgba(0, 0, 0, 0.78), 0 0 26px rgba(0, 243, 255, 0.2);
    backdrop-filter: blur(16px);
    color: #eef8ff;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  #gm-fx-panel[hidden] {
    display: none;
  }

  .gm-fx-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid rgba(0, 243, 255, 0.18);
    padding-bottom: 7px;
  }

  .gm-fx-title {
    font-size: 11px;
    font-weight: 900;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #00f3ff;
    filter: drop-shadow(0 0 6px rgba(0, 243, 255, 0.45));
  }

  .gm-fx-close {
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.18);
    color: #94a3b8;
    border-radius: 6px;
    padding: 2px 7px;
    font-size: 10px;
    cursor: pointer;
  }

  .gm-fx-shader-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
  }

  .gm-fx-btn {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 4px;
    padding: 6px 8px;
    border-radius: 8px;
    background: rgba(18, 25, 48, 0.85);
    border: 1px solid rgba(148, 163, 184, 0.25);
    color: #dbeafe;
    font-size: 10px;
    font-weight: 700;
    cursor: pointer;
    translate: 0px 0px;
    rotate: 0deg;
    scale: 1;
    transition: scale 0.14s ease, border-color 0.16s ease, background 0.16s ease;
  }

  .gm-fx-btn:hover {
    scale: 1.03;
    border-color: rgba(0, 243, 255, 0.65);
  }

  .gm-fx-btn.active {
    background: rgba(0, 243, 255, 0.18);
    border-color: #00f3ff;
    color: #ffffff;
    box-shadow: 0 0 12px rgba(0, 243, 255, 0.32);
  }

  .gm-fx-actions {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .gm-fx-action-btn {
    flex: 1;
    padding: 6px 8px;
    border-radius: 8px;
    background: rgba(255, 0, 127, 0.16);
    border: 1px solid rgba(255, 0, 127, 0.45);
    color: #ffd6eb;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.05em;
    cursor: pointer;
    translate: 0px 0px;
    rotate: 0deg;
    scale: 1;
    transition: scale 0.14s ease, background 0.16s ease;
  }

  .gm-fx-action-btn:hover {
    scale: 1.04;
    background: rgba(255, 0, 127, 0.28);
  }

  .gm-fx-action-btn.active {
    background: rgba(0, 255, 136, 0.18);
    border-color: rgba(0, 255, 136, 0.55);
    color: #d1fae5;
  }
</style>
`;

export const GAME_MASTER_FX_SCRIPT = `
<script id="codecaine-game-master-fx-script">
(function() {
  try {
    if (typeof window === "undefined" || typeof document === "undefined") return;
    if (window.CodecaineGameMaster) return;

    var STORAGE_KEY = "codecaine_gm_fx_config_v1";
    var state = {
      shader: "cyber_bloom",
      particles: true,
      shake: true,
      callouts: true,
      comboCount: 0,
      lastScoreTime: 0,
      fps: 60
    };

    try {
      var saved = window.localStorage && window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        var parsed = JSON.parse(saved);
        if (parsed && typeof parsed === "object") {
          if (typeof parsed.shader === "string") state.shader = parsed.shader;
          if (typeof parsed.particles === "boolean") state.particles = parsed.particles;
          if (typeof parsed.shake === "boolean") state.shake = parsed.shake;
        }
      }
    } catch (_) {}

    function saveConfig() {
      try {
        if (window.localStorage) {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
            shader: state.shader,
            particles: state.particles,
            shake: state.shake
          }));
        }
      } catch (_) {}
    }

    var particles = [];
    var shockwaves = [];
    var ambientDust = [];
    var canvas = null;
    var ctx = null;
    var calloutsEl = null;
    var fpsBadgeEl = null;

    function applyShader(shaderId) {
      state.shader = shaderId || "cyber_bloom";
      if (document.documentElement) {
        document.documentElement.setAttribute("data-gm-shader", state.shader);
      }
      if (document. querySelectorAll) {
        var btns = document.querySelectorAll(".gm-fx-btn[data-gm-preset]");
        for (var i = 0; i < btns.length; i++) {
          var b = btns[i];
          var isMatch = b.getAttribute("data-gm-preset") === state.shader;
          if (b.classList) b.classList.toggle("active", isMatch);
        }
      }
      saveConfig();
    }

    function spawnBurst(x, y, color, count) {
      if (!state.particles || !ctx) return;
      var n = count || 18;
      var palette = [color || "#00f3ff", "#ff007f", "#ffd700", "#00ff88", "#a855f7"];
      for (var i = 0; i < n; i++) {
        var angle = (Math.PI * 2 * i) / n + (Math.random() - 0.5) * 0.35;
        var speed = 1.6 + Math.random() * 5.2;
        particles.push({
          x: x,
          y: y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 0.6,
          size: 1.8 + Math.random() * 3.0,
          alpha: 1,
          decay: 0.022 + Math.random() * 0.02,
          color: color || palette[i % palette.length]
        });
      }
      shockwaves.push({
        x: x,
        y: y,
        radius: 4,
        maxRadius: 54 + Math.random() * 28,
        alpha: 0.78,
        color: color || "#00f3ff"
      });
    }

    function spawnFloatingCallout(text, x, y, color) {
      if (!state.callouts || !calloutsEl || !document.createElement) return;
      var el = document.createElement("div");
      el.className = "gm-floating-callout";
      el.textContent = text;
      el.style.left = Math.round(x) + "px";
      el.style.top = Math.round(y) + "px";
      if (color) {
        el.style.color = color;
        el.style.filter = "drop-shadow(0 0 10px " + color + ")";
      }
      calloutsEl.appendChild(el);
      setTimeout(function() {
        try {
          if (el && el.parentNode) el.parentNode.removeChild(el);
        } catch (_) {}
      }, 1100);
    }

    function triggerScreenShake(intensity) {
      if (!state.shake || !document.body) return;
      var mag = Math.min(12, Math.max(2, intensity || 5));
      var steps = 5;
      var step = 0;
      var iv = setInterval(function() {
        step++;
        if (!document.body) {
          clearInterval(iv);
          return;
        }
        if (step >= steps) {
          document.body.style.translate = "";
          clearInterval(iv);
        } else {
          var dx = Math.round((Math.random() - 0.5) * mag * 2);
          var dy = Math.round((Math.random() - 0.5) * mag * 2);
          document.body.style.translate = dx + "px " + dy + "px";
        }
      }, 28);
    }

    function triggerVictoryFireworks() {
      var w = window.innerWidth || 800;
      var h = window.innerHeight || 600;
      var colors = ["#00f3ff", "#ff007f", "#ffd700", "#00ff88", "#a855f7"];
      for (var i = 0; i < 5; i++) {
        (function(idx) {
          setTimeout(function() {
            var fx = w * (0.2 + Math.random() * 0.6);
            var fy = h * (0.2 + Math.random() * 0.45);
            spawnBurst(fx, fy, colors[idx % colors.length], 28);
          }, idx * 140);
        })(i);
      }
      spawnFloatingCallout("⚡ ARCADE OVERDRIVE! ⚡", w * 0.5, h * 0.28, "#ffd700");
    }

    function initDom() {
      if (!document.body || document.getElementById("gm-fx-dock")) return;

      applyShader(state.shader);

      var post = document.createElement("div");
      post.id = "gm-fx-postprocess";
      document.body.appendChild(post);

      canvas = document.createElement("canvas");
      canvas.id = "gm-fx-canvas";
      document.body.appendChild(canvas);

      calloutsEl = document.createElement("div");
      calloutsEl.id = "gm-fx-callouts";
      document.body.appendChild(calloutsEl);

      var dock = document.createElement("div");
      dock.id = "gm-fx-dock";
      dock.innerHTML =
        '<div id="gm-fx-panel" hidden>' +
          '<div class="gm-fx-header">' +
            '<span class="gm-fx-title">🕹️ Game Master FX</span>' +
            '<button type="button" class="gm-fx-close" id="gm-fx-close-btn">✕</button>' +
          '</div>' +
          '<div class="gm-fx-shader-grid">' +
            '<button type="button" class="gm-fx-btn" data-gm-preset="cyber_bloom"><span>⚡ Cyber Bloom</span></button>' +
            '<button type="button" class="gm-fx-btn" data-gm-preset="crt_arcade"><span>📺 CRT 1984</span></button>' +
            '<button type="button" class="gm-fx-btn" data-gm-preset="synthwave"><span>🌆 Synthwave</span></button>' +
            '<button type="button" class="gm-fx-btn" data-gm-preset="matrix"><span>🟢 Matrix Grid</span></button>' +
            '<button type="button" class="gm-fx-btn" data-gm-preset="golden_vip"><span>👑 Golden VIP</span></button>' +
            '<button type="button" class="gm-fx-btn" data-gm-preset="clean"><span>🎯 Esports Raw</span></button>' +
          '</div>' +
          '<div class="gm-fx-actions">' +
            '<button type="button" class="gm-fx-action-btn active" id="gm-fx-particles-btn">✨ Sparks: ON</button>' +
            '<button type="button" class="gm-fx-action-btn active" id="gm-fx-shake-btn">💥 Shake: ON</button>' +
            '<button type="button" class="gm-fx-action-btn" id="gm-fx-fireworks-btn">🎆 Pyro</button>' +
          '</div>' +
        '</div>' +
        '<button type="button" id="gm-fx-pill" title="Codecaine Game Master FX Suite (Alt+G)">' +
          '<span>🕹️ FX</span>' +
          '<span id="gm-fx-fps-badge">60 FPS</span>' +
        '</button>';

      document.body.appendChild(dock);
      fpsBadgeEl = document.getElementById("gm-fx-fps-badge");
      applyShader(state.shader);

      var pill = document.getElementById("gm-fx-pill");
      var panel = document.getElementById("gm-fx-panel");
      var closeBtn = document.getElementById("gm-fx-close-btn");
      var partBtn = document.getElementById("gm-fx-particles-btn");
      var shakeBtn = document.getElementById("gm-fx-shake-btn");
      var fwBtn = document.getElementById("gm-fx-fireworks-btn");

      function syncToggleButtons() {
        if (partBtn) {
          partBtn.textContent = state.particles ? "✨ Sparks: ON" : "✨ Sparks: OFF";
          partBtn.classList.toggle("active", state.particles);
        }
        if (shakeBtn) {
          shakeBtn.textContent = state.shake ? "💥 Shake: ON" : "💥 Shake: OFF";
          shakeBtn.classList.toggle("active", state.shake);
        }
      }
      syncToggleButtons();

      if (pill && panel) {
        pill.addEventListener("click", function(e) {
          e.stopPropagation();
          panel.hidden = !panel.hidden;
        });
      }
      if (closeBtn && panel) {
        closeBtn.addEventListener("click", function() {
          panel.hidden = true;
        });
      }
      if (partBtn) {
        partBtn.addEventListener("click", function() {
          state.particles = !state.particles;
          syncToggleButtons();
          saveConfig();
        });
      }
      if (shakeBtn) {
        shakeBtn.addEventListener("click", function() {
          state.shake = !state.shake;
          syncToggleButtons();
          saveConfig();
          if (state.shake) triggerScreenShake(5);
        });
      }
      if (fwBtn) {
        fwBtn.addEventListener("click", function() {
          triggerVictoryFireworks();
        });
      }

      var presetBtns = dock.querySelectorAll(".gm-fx-btn[data-gm-preset]");
      for (var i = 0; i < presetBtns.length; i++) {
        (function(btn) {
          btn.addEventListener("click", function() {
            var preset = btn.getAttribute("data-gm-preset");
            if (preset) applyShader(preset);
          });
        })(presetBtns[i]);
      }

      try {
        var ua = (window.navigator && window.navigator.userAgent) || "";
        if (canvas && typeof canvas.getContext === "function" && !/jsdom/i.test(ua)) {
          ctx = canvas.getContext("2d");
        }
      } catch (_) {
        ctx = null;
      }

      if (ctx) {
        var resizeCanvas = function() {
          if (!canvas) return;
          canvas.width = window.innerWidth || 1024;
          canvas.height = window.innerHeight || 768;
        };
        resizeCanvas();
        window.addEventListener("resize", resizeCanvas);

        for (var d = 0; d < 28; d++) {
          ambientDust.push({
            x: Math.random() * (canvas.width || 1024),
            y: Math.random() * (canvas.height || 768),
            vy: -0.18 - Math.random() * 0.35,
            vx: (Math.random() - 0.5) * 0.25,
            size: 1 + Math.random() * 1.8,
            alpha: 0.15 + Math.random() * 0.35,
            color: d % 3 === 0 ? "#00f3ff" : d % 3 === 1 ? "#ff007f" : "#ffd700"
          });
        }

        window.addEventListener("pointerdown", function(e) {
          if (!state.particles) return;
          if (e.clientX && e.clientY) {
            spawnBurst(e.clientX, e.clientY, "#00f3ff", 12);
          }
        }, { passive: true });

        var lastTime = (window.performance && window.performance.now) ? window.performance.now() : Date.now();
        var frames = 0;
        var raf = window.requestAnimationFrame;
        if (typeof raf === "function") {
          var tick = function(now) {
            frames++;
            var elapsed = now - lastTime;
            if (elapsed >= 600) {
              state.fps = Math.min(144, Math.max(1, Math.round((frames * 1000) / elapsed)));
              if (fpsBadgeEl) fpsBadgeEl.textContent = state.fps + " FPS";
              frames = 0;
              lastTime = now;
            }

            if (ctx && canvas) {
              ctx.clearRect(0, 0, canvas.width, canvas.height);

              if (state.particles && state.shader !== "clean") {
                for (var a = 0; a < ambientDust.length; a++) {
                  var p = ambientDust[a];
                  p.x += p.vx;
                  p.y += p.vy;
                  if (p.y < -10) p.y = canvas.height + 10;
                  if (p.x < -10) p.x = canvas.width + 10;
                  if (p.x > canvas.width + 10) p.x = -10;
                  ctx.globalAlpha = p.alpha;
                  ctx.fillStyle = p.color;
                  ctx.beginPath();
                  ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                  ctx.fill();
                }
              }

              for (var s = shockwaves.length - 1; s >= 0; s--) {
                var sw = shockwaves[s];
                sw.radius += (sw.maxRadius - sw.radius) * 0.18 + 1.4;
                sw.alpha *= 0.88;
                if (sw.alpha <= 0.03) {
                  shockwaves.splice(s, 1);
                  continue;
                }
                ctx.save();
                ctx.globalAlpha = sw.alpha;
                ctx.strokeStyle = sw.color;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
                ctx.stroke();
                ctx.restore();
              }

              for (var i = particles.length - 1; i >= 0; i--) {
                var pt = particles[i];
                pt.x += pt.vx;
                pt.y += pt.vy;
                pt.vy += 0.11;
                pt.alpha -= pt.decay;
                if (pt.alpha <= 0.02) {
                  particles.splice(i, 1);
                  continue;
                }
                ctx.save();
                ctx.globalAlpha = pt.alpha;
                ctx.fillStyle = pt.color;
                ctx.beginPath();
                ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
              }
            }
            raf(tick);
          };
          raf(tick);
        }
      }

      // Observe Score Elements for Automatic Floating Callouts & Combo Bursts
      try {
        var scoreValues = new Map();
        var checkScores = function() {
          var nodes = document.querySelectorAll(
            "#score, #scoreVal, #hudScore, #player1Score, #player2Score, #scoreX, #scoreO, #scoreP1, #scoreP2, .score-val, .hud-value, .stat-val"
          );
          for (var i = 0; i < nodes.length; i++) {
            var node = nodes[i];
            var raw = (node.textContent || "").replace(/[^0-9-]/g, "");
            if (!raw) continue;
            var val = parseInt(raw, 10);
            if (isNaN(val)) continue;
            if (!scoreValues.has(node)) {
              scoreValues.set(node, val);
              continue;
            }
            var prev = scoreValues.get(node);
            if (val > prev) {
              var delta = val - prev;
              scoreValues.set(node, val);
              var nowTs = Date.now();
              if (nowTs - state.lastScoreTime < 3800) {
                state.comboCount++;
              } else {
                state.comboCount = 1;
              }
              state.lastScoreTime = nowTs;
              var rect = node.getBoundingClientRect ? node.getBoundingClientRect() : null;
              var cx = rect && rect.width ? rect.left + rect.width * 0.5 : (window.innerWidth || 800) * 0.5;
              var cy = rect && rect.height ? rect.top : 90;
              var label = "+" + delta + (state.comboCount > 1 ? " 🔥x" + state.comboCount : "");
              spawnFloatingCallout(label, cx, Math.max(48, cy), state.comboCount > 2 ? "#ffd700" : "#00f3ff");
              spawnBurst(cx, Math.max(48, cy), state.comboCount > 2 ? "#ffd700" : "#00ff88", 16);
            } else if (val < prev) {
              scoreValues.set(node, val);
            }
          }
        };
        setInterval(checkScores, 450);
      } catch (_) {}
    }

    // Keyboard shortcut Alt+G to toggle Game Master FX Panel
    window.addEventListener("keydown", function(e) {
      if (e && e.altKey && (e.code === "KeyG" || e.key === "g" || e.key === "G")) {
        var panel = document.getElementById("gm-fx-panel");
        if (panel) {
          e.preventDefault();
          panel.hidden = !panel.hidden;
        }
      }
    });

    // Listen for parent frame messages (File Manager Codecaine Games Hub live shader control)
    window.addEventListener("message", function(e) {
      var data = e && e.data;
      if (!data || typeof data !== "object") return;
      if (typeof data.fmGameMasterFx === "string") {
        applyShader(data.fmGameMasterFx);
      }
      if (data.fmGameMasterAction === "fireworks") {
        triggerVictoryFireworks();
      }
    });

    window.CodecaineGameMaster = {
      setShader: applyShader,
      getShader: function() { return state.shader; },
      spawnBurst: spawnBurst,
      spawnFloatingCallout: spawnFloatingCallout,
      triggerScreenShake: triggerScreenShake,
      triggerVictoryFireworks: triggerVictoryFireworks
    };

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", initDom);
    } else {
      initDom();
    }
  } catch (_) {}
})();
</script>
`;

/**
 * Injects the Codecaine Game Master FX & Post-Processing Engine into an HTML document
 * if not already present.
 */
export function injectGameMasterFx(html: string): string {
  if (!html || html.includes("codecaine-game-master-fx-script")) {
    return html;
  }

  let out = html;
  if (out.includes("</head>")) {
    out = out.replace("</head>", `${GAME_MASTER_FX_STYLE}\n</head>`);
  } else {
    out = GAME_MASTER_FX_STYLE + out;
  }

  if (out.includes("</body>")) {
    out = out.replace("</body>", `${GAME_MASTER_FX_SCRIPT}\n</body>`);
  } else {
    out += GAME_MASTER_FX_SCRIPT;
  }

  return out;
}
