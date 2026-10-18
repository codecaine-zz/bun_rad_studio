
		function contrastRatio(a, b) {
			const lum = (hex) => {
				const h = hex.replace("#", "");
				const f = (v) => { v = v / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
				return 0.2126 * f(parseInt(h.slice(0, 2), 16)) + 0.7152 * f(parseInt(h.slice(2, 4), 16)) + 0.0722 * f(parseInt(h.slice(4, 6), 16));
			};
			const x = lum(a), y = lum(b);
			return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
		}

		// Theme colors with the button text guaranteed readable: a theme's own button text color is kept when it
		// reaches the WCAG AA ratio (4.5:1) on the button fill, otherwise black or white, whichever reads better.
		function getThemeColors(theme) {
			const colors = getRawThemeColors(theme);
			if (contrastRatio(colors.btnFg, colors.btnBg) < 4.5) {
				const black = contrastRatio("#000000", colors.btnBg);
				const white = contrastRatio("#ffffff", colors.btnBg);
				colors.btnFg = black >= white ? "#000000" : "#ffffff";
			}
			return colors;
		}

		function getRawThemeColors(theme) {
			const fxPalette = typeof fxPaletteFor === "function" ? fxPaletteFor(theme) : null;
			if (fxPalette) return fxPalette;
			const clean = (theme || "").toLowerCase().replace(/[\s\-_]+/g, "_");
			if (clean === "sonoma_dark" || clean === "macos_sonoma") return { formBg: "#1e1e1e", formFg: "#ffffff", ctrlBg: "#2c2c2e", ctrlFg: "#ffffff", btnBg: "#007aff", btnFg: "#ffffff", panelBg: "#2c2c2e" };
			if (clean === "sonoma_light") return { formBg: "#f6f6f6", formFg: "#1d1d1f", ctrlBg: "#ffffff", ctrlFg: "#1d1d1f", btnBg: "#007aff", btnFg: "#ffffff", panelBg: "#e5e5e7" };
			if (clean === "fluent_dark" || clean === "windows_11_fluent") return { formBg: "#202020", formFg: "#ffffff", ctrlBg: "#2c2c2c", ctrlFg: "#ffffff", btnBg: "#60cdff", btnFg: "#000000", panelBg: "#2c2c2c" };
			if (clean === "fluent_light") return { formBg: "#f3f3f3", formFg: "#1b1b1b", ctrlBg: "#ffffff", ctrlFg: "#1b1b1b", btnBg: "#005fb8", btnFg: "#ffffff", panelBg: "#e5e5e5" };
			if (clean === "commodore64" || clean === "c64") return { formBg: "#40318d", formFg: "#8b80db", ctrlBg: "#352874", ctrlFg: "#8b80db", btnBg: "#8b80db", btnFg: "#40318d", panelBg: "#352874" };
			if (clean === "macintosh_system7" || clean === "system7") return { formBg: "#ffffff", formFg: "#000000", ctrlBg: "#f0f0f0", ctrlFg: "#000000", btnBg: "#000000", btnFg: "#ffffff", panelBg: "#e0e0e0" };
			if (clean === "matrix_phosphor" || clean === "matrix") return { formBg: "#0d1117", formFg: "#00ff41", ctrlBg: "#080c08", ctrlFg: "#00ff41", btnBg: "#00ff41", btnFg: "#000000", panelBg: "#080c08" };
			if (clean === "synthwave84" || clean === "synthwave_84") return { formBg: "#262335", formFg: "#f92aad", ctrlBg: "#1a1824", ctrlFg: "#f92aad", btnBg: "#f92aad", btnFg: "#000000", panelBg: "#1a1824" };
			if (clean === "sunset_orange") return { formBg: "#1a1412", formFg: "#fff3e0", ctrlBg: "#261e1b", ctrlFg: "#fff3e0", btnBg: "#ff6f00", btnFg: "#ffffff", panelBg: "#261e1b" };
			if (clean === "crimson") return { formBg: "#1a0c0e", formFg: "#ffebee", ctrlBg: "#261216", ctrlFg: "#ffebee", btnBg: "#ef4444", btnFg: "#ffffff", panelBg: "#261216" };
			if (clean === "emerald") return { formBg: "#0a1a12", formFg: "#e8f5e9", ctrlBg: "#10261b", ctrlFg: "#e8f5e9", btnBg: "#10b981", btnFg: "#000000", panelBg: "#10261b" };
			if (clean === "sapphire") return { formBg: "#0a121e", formFg: "#e3f2fd", ctrlBg: "#101d30", ctrlFg: "#e3f2fd", btnBg: "#3b82f6", btnFg: "#ffffff", panelBg: "#101d30" };
			if (clean === "amethyst") return { formBg: "#140e1e", formFg: "#f3e8ff", ctrlBg: "#1f1530", ctrlFg: "#f3e8ff", btnBg: "#a855f7", btnFg: "#ffffff", panelBg: "#1f1530" };
			if (clean === "charcoal") return { formBg: "#1c1c1e", formFg: "#ebebf5", ctrlBg: "#2c2c2e", ctrlFg: "#ebebf5", btnBg: "#636366", btnFg: "#ffffff", panelBg: "#2c2c2e" };
			if (clean === "slate") return { formBg: "#0f172a", formFg: "#f1f5f9", ctrlBg: "#1e293b", ctrlFg: "#f1f5f9", btnBg: "#64748b", btnFg: "#ffffff", panelBg: "#1e293b" };
			if (clean === "dark") return { formBg: "#1e1e2e", formFg: "#cdd6f4", ctrlBg: "#181825", ctrlFg: "#cdd6f4", btnBg: "#cba6f7", btnFg: "#000000", panelBg: "#181825" };
			if (clean === "light") return { formBg: "#ffffff", formFg: "#1a1a1a", ctrlBg: "#f2f2f7", ctrlFg: "#1a1a1a", btnBg: "#007aff", btnFg: "#ffffff", panelBg: "#f2f2f7" };
			if (theme === "CodeFreelance") {
				return { formBg: "#050505", formFg: "#ffffff", ctrlBg: "#121212", ctrlFg: "#ffffff", btnBg: "#0fb36a", btnFg: "#000000", panelBg: "#181818" };
			} else if (theme === "Raycast Dark") {
				return { formBg: "#0e0f12", formFg: "#f3f4f6", ctrlBg: "#18191e", ctrlFg: "#f3f4f6", btnBg: "#ff6363", btnFg: "#ffffff", panelBg: "#22242c" };
			} else if (theme === "Linear Studio") {
				return { formBg: "#0f1015", formFg: "#e2e4ed", ctrlBg: "#181922", ctrlFg: "#e2e4ed", btnBg: "#5e6ad2", btnFg: "#ffffff", panelBg: "#222432" };
			} else if (theme === "Vercel Geist") {
				return { formBg: "#000000", formFg: "#ededed", ctrlBg: "#0a0a0a", ctrlFg: "#ededed", btnBg: "#ffffff", btnFg: "#000000", panelBg: "#141414" };
			} else if (theme === "Unreal Engine 5") {
				return { formBg: "#18191c", formFg: "#e1e2e6", ctrlBg: "#222328", ctrlFg: "#e1e2e6", btnBg: "#0e86d4", btnFg: "#ffffff", panelBg: "#2c2d34" };
			} else if (theme === "Arc Velvet") {
				return { formBg: "#170f26", formFg: "#f8f6fc", ctrlBg: "#23183a", ctrlFg: "#f8f6fc", btnBg: "#f72585", btnFg: "#ffffff", panelBg: "#312250" };
			} else if (theme === "Abyss") {
				return { formBg: "#030712", formFg: "#f0fdfa", ctrlBg: "#0b1329", ctrlFg: "#f0fdfa", btnBg: "#06b6d4", btnFg: "#000000", panelBg: "#121e3f" };
			} else if (theme === "Cyberpunk Night City") {
				return { formBg: "#0e0e13", formFg: "#fcee0a", ctrlBg: "#171720", ctrlFg: "#fcee0a", btnBg: "#ff003c", btnFg: "#ffffff", panelBg: "#252535" };
			} else if (theme === "Horizon Sunset") {
				return { formBg: "#1c1e26", formFg: "#fdf0ed", ctrlBg: "#232530", ctrlFg: "#fdf0ed", btnBg: "#e95678", btnFg: "#ffffff", panelBg: "#2e3140" };
			} else if (theme === "Tailwind Slate Emerald") {
				return { formBg: "#0b1120", formFg: "#f1f5f9", ctrlBg: "#151e32", ctrlFg: "#f1f5f9", btnBg: "#10b981", btnFg: "#ffffff", panelBg: "#1e2b46" };
			} else if (theme === "Supabase Dark") {
				return { formBg: "#121212", formFg: "#f8fafc", ctrlBg: "#1c1c1c", ctrlFg: "#f8fafc", btnBg: "#3ecf8e", btnFg: "#000000", panelBg: "#262626" };
			} else if (theme === "OLED Laser Black") {
				return { formBg: "#000000", formFg: "#ffffff", ctrlBg: "#0a0a0a", ctrlFg: "#ffffff", btnBg: "#00e676", btnFg: "#000000", panelBg: "#1a1a1a" };
			} else if (theme === "Titanium Slate Pro") {
				return { formBg: "#131417", formFg: "#e5e5ea", ctrlBg: "#1c1d22", ctrlFg: "#e5e5ea", btnBg: "#ff6b22", btnFg: "#ffffff", panelBg: "#282930" };
			} else if (theme === "JetBrains Darcula") {
				return { formBg: "#2b2b2b", formFg: "#a9b7c6", ctrlBg: "#313335", ctrlFg: "#a9b7c6", btnBg: "#cc7832", btnFg: "#ffffff", panelBg: "#3c3f41" };
			} else if (theme === "Nordic Paper Light") {
				return { formBg: "#f7f7f5", formFg: "#202124", ctrlBg: "#ffffff", ctrlFg: "#202124", btnBg: "#2b5c8f", btnFg: "#ffffff", panelBg: "#ebe9e3" };
			} else if (theme === "Monokai Pro") {
				return { formBg: "#2d2a2e", formFg: "#fcfcfa", ctrlBg: "#221f22", ctrlFg: "#fcfcfa", btnBg: "#ffd866", btnFg: "#000000", panelBg: "#3a373b" };
			} else if (theme === "Tokyo Night") {
				return { formBg: "#1a1b26", formFg: "#c0caf5", ctrlBg: "#24283b", ctrlFg: "#c0caf5", btnBg: "#7aa2f7", btnFg: "#1a1b26", panelBg: "#2f354f" };
			} else if (theme === "One Dark Pro") {
				return { formBg: "#21252b", formFg: "#abb2bf", ctrlBg: "#282c34", ctrlFg: "#abb2bf", btnBg: "#61afef", btnFg: "#21252b", panelBg: "#323842" };
			} else if (theme === "Gruvbox Dark") {
				return { formBg: "#282828", formFg: "#ebdbb2", ctrlBg: "#1d2021", ctrlFg: "#ebdbb2", btnBg: "#fabd2f", btnFg: "#282828", panelBg: "#32302f" };
			} else if (theme === "Gruvbox Light") {
				return { formBg: "#fbf1c7", formFg: "#3c3836", ctrlBg: "#f2e5bc", ctrlFg: "#3c3836", btnBg: "#b57614", btnFg: "#fbf1c7", panelBg: "#ebdbb2" };
			} else if (theme === "Rosé Pine") {
				return { formBg: "#191724", formFg: "#e0def4", ctrlBg: "#21202e", ctrlFg: "#e0def4", btnBg: "#eb6f92", btnFg: "#191724", panelBg: "#2a283e" };
			} else if (theme === "Everforest Dark") {
				return { formBg: "#2d353b", formFg: "#d3c6aa", ctrlBg: "#232a2e", ctrlFg: "#d3c6aa", btnBg: "#a7c080", btnFg: "#2d353b", panelBg: "#374247" };
			} else if (theme === "Kanagawa") {
				return { formBg: "#1f1f28", formFg: "#dcd7ba", ctrlBg: "#16161d", ctrlFg: "#dcd7ba", btnBg: "#7e9cd8", btnFg: "#1f1f28", panelBg: "#2a2a37" };
			} else if (theme === "Cobalt2") {
				return { formBg: "#193549", formFg: "#ffffff", ctrlBg: "#15232d", ctrlFg: "#ffffff", btnBg: "#ffc600", btnFg: "#193549", panelBg: "#1f4662" };
			} else if (theme === "Light" || theme === "macOS Ventura Light") {
				return { formBg: "#f6f6f6", formFg: "#1d1d1f", ctrlBg: "#ffffff", ctrlFg: "#1d1d1f", btnBg: "#007aff", btnFg: "#ffffff", panelBg: "#e8e8ed" };
			} else if (theme === "macOS Sonoma Dark" || theme === "Apple Dark") {
				return { formBg: "#1e1e1e", formFg: "#f5f5f7", ctrlBg: "#2c2c2e", ctrlFg: "#ffffff", btnBg: "#0a84ff", btnFg: "#ffffff", panelBg: "#252528" };
			} else if (theme === "macOS Liquid Glass") {
				return { formBg: "#141923", formFg: "#f3f4f6", ctrlBg: "#1f2937", ctrlFg: "#f9fafb", btnBg: "#0284c7", btnFg: "#ffffff", panelBg: "#111827" };
			} else if (theme === "Midnight") {
				return { formBg: "#0b0f19", formFg: "#e2e8f0", ctrlBg: "#151c2c", ctrlFg: "#f3f4f6", btnBg: "#6366f1", btnFg: "#ffffff", panelBg: "#1e293b" };
			} else if (theme === "Apple Sunset") {
				return { formBg: "#2a1b2a", formFg: "#ffd166", ctrlBg: "#3c243c", ctrlFg: "#ffe5ec", btnBg: "#ff477e", btnFg: "#ffffff", panelBg: "#4a2c4a" };
			} else if (theme === "Sonoma Emerald") {
				return { formBg: "#062c21", formFg: "#a7f3d0", ctrlBg: "#0b4334", ctrlFg: "#d1fae5", btnBg: "#10b981", btnFg: "#ffffff", panelBg: "#0f5241" };
			} else if (theme === "Windows 11 Mica Light") {
				return { formBg: "#f3f3f3", formFg: "#1b1b1b", ctrlBg: "#ffffff", ctrlFg: "#1b1b1b", btnBg: "#0067c0", btnFg: "#ffffff", panelBg: "#e5e5e5" };
			} else if (theme === "Windows 11 Acrylic Dark") {
				return { formBg: "#202020", formFg: "#ffffff", ctrlBg: "#2c2c2c", ctrlFg: "#ffffff", btnBg: "#60cdff", btnFg: "#000000", panelBg: "#181818" };
			} else if (theme === "Windows 11 Fluent Slate") {
				return { formBg: "#1c2128", formFg: "#adbac7", ctrlBg: "#22272e", ctrlFg: "#adbac7", btnBg: "#4796e6", btnFg: "#ffffff", panelBg: "#2d333b" };
			} else if (theme === "Windows 11 Sun Valley") {
				return { formBg: "#0f172a", formFg: "#f8fafc", ctrlBg: "#1e293b", ctrlFg: "#ffffff", btnBg: "#38bdf8", btnFg: "#0f172a", panelBg: "#1e293b" };
			} else if (theme === "Ubuntu Yaru Dark" || theme === "Ubuntu") {
				return { formBg: "#242424", formFg: "#ffffff", ctrlBg: "#303030", ctrlFg: "#ffffff", btnBg: "#e95420", btnFg: "#ffffff", panelBg: "#2e2e2e" };
			} else if (theme === "Ubuntu Yaru Light") {
				return { formBg: "#f7f7f7", formFg: "#1e1e1e", ctrlBg: "#ffffff", ctrlFg: "#1e1e1e", btnBg: "#e95420", btnFg: "#ffffff", panelBg: "#ededed" };
			} else if (theme === "GNOME Adwaita Dark" || theme === "Adwaita") {
				return { formBg: "#242424", formFg: "#ffffff", ctrlBg: "#303030", ctrlFg: "#ffffff", btnBg: "#3584e4", btnFg: "#ffffff", panelBg: "#2e2e2e" };
			} else if (theme === "GNOME Adwaita Light") {
				return { formBg: "#fafafa", formFg: "#2e3436", ctrlBg: "#ffffff", ctrlFg: "#2e3436", btnBg: "#3584e4", btnFg: "#ffffff", panelBg: "#f0f0f0" };
			} else if (theme === "Linux Mint" || theme === "Linux Mint Dark") {
				return { formBg: "#2f343f", formFg: "#e0e2e4", ctrlBg: "#242831", ctrlFg: "#e0e2e4", btnBg: "#87a556", btnFg: "#ffffff", panelBg: "#383f4d" };
			} else if (theme === "Pop!_OS" || theme === "Pop!_OS Dark") {
				return { formBg: "#202222", formFg: "#f6f6f6", ctrlBg: "#2c2e2e", ctrlFg: "#f6f6f6", btnBg: "#48b9c7", btnFg: "#202222", panelBg: "#333636" };
			} else if (theme === "Fedora Blue") {
				return { formBg: "#1f232a", formFg: "#ffffff", ctrlBg: "#292e38", ctrlFg: "#ffffff", btnBg: "#51a2da", btnFg: "#1f232a", panelBg: "#242932" };
			} else if (theme === "Catppuccin") {
				return { formBg: "#1e1e2e", formFg: "#cdd6f4", ctrlBg: "#313244", ctrlFg: "#cdd6f4", btnBg: "#cba6f7", btnFg: "#1e1e2e", panelBg: "#45475a" };
			} else if (theme === "Dracula") {
				return { formBg: "#282a36", formFg: "#f8f8f2", ctrlBg: "#44475a", ctrlFg: "#f8f8f2", btnBg: "#ff79c6", btnFg: "#282a36", panelBg: "#383a59" };
			} else if (theme === "Cyberpunk") {
				return { formBg: "#0d0221", formFg: "#00f6ff", ctrlBg: "#190536", ctrlFg: "#00f6ff", btnBg: "#ff007f", btnFg: "#ffffff", panelBg: "#26094e" };
			} else if (theme === "Nord") {
				return { formBg: "#2e3440", formFg: "#eceff4", ctrlBg: "#3b4252", ctrlFg: "#eceff4", btnBg: "#88c0d0", btnFg: "#2e3440", panelBg: "#434c5e" };
			} else if (theme === "Solarized Light") {
				return { formBg: "#fdf6e3", formFg: "#657b83", ctrlBg: "#eee8d5", ctrlFg: "#073642", btnBg: "#b58900", btnFg: "#fdf6e3", panelBg: "#e0d8c3" };
			} else if (theme === "Solarized Dark") {
				return { formBg: "#002b36", formFg: "#839496", ctrlBg: "#073642", ctrlFg: "#93a1a1", btnBg: "#2aa198", btnFg: "#002b36", panelBg: "#094352" };
			} else if (theme === "High Contrast") {
				return { formBg: "#000000", formFg: "#00ff00", ctrlBg: "#111111", ctrlFg: "#00ff00", btnBg: "#00ff00", btnFg: "#000000", panelBg: "#1a1a1a" };
			} else { // Dark Mode (Default)
				return { formBg: "#0f172a", formFg: "#f8fafc", ctrlBg: "#1e293b", ctrlFg: "#ffffff", btnBg: "#0284c7", btnFg: "#ffffff", panelBg: "#1e293b" };
			}
		}

		function updateFormTheme() {
			saveHistoryState();
			const themeSelect = document.getElementById("propFormTheme");
			const theme = themeSelect ? themeSelect.value : "Dark";
			const colors = getThemeColors(theme);
			formSpec.theme = theme;
			formSpec.background_color = colors.formBg;
			formSpec.font_color = colors.formFg;

			// Harmonize all controls so their background & font colors complement the form background
			formSpec.controls.forEach(ctrl => {
				if (ctrl.control_type === "button") {
					ctrl.background_color = colors.btnBg;
					ctrl.font_color = colors.btnFg;
				} else if (ctrl.control_type === "panel") {
					ctrl.background_color = colors.panelBg;
					ctrl.font_color = colors.formFg;
				} else if (ctrl.control_type === "label") {
					ctrl.font_color = colors.formFg;
				} else if (ctrl.control_type !== "badge" && ctrl.control_type !== "progress" && ctrl.control_type !== "divider") {
					ctrl.background_color = colors.ctrlBg;
					ctrl.font_color = colors.ctrlFg;
				}
			});

			renderCanvas();
			renderCode();
			populateInspector();
			syncSpecToV();
			document.getElementById("statusMsg").textContent = "Applied " + theme + " theme color palette.";
		}

		function loadTemplate(name) {
			saveHistoryState();
			if (name === "login") {
				formSpec.title = "User Authentication Dialog";
				formSpec.width = 480;
				formSpec.height = 420;
				formSpec.controls = [
					{ id: "lbl_header", control_type: "label", x: 24, y: 24, width: 360, height: 32, text: "🔐 Account Sign In", font_size: 18, font_color: "#38bdf8", background_color: "" },
					{ id: "inp_email", control_type: "input", x: 24, y: 70, width: 360, height: 36, text: "admin@developer.org", event_handlers: { "onChange": "on_email_change" } },
					{ id: "inp_pass", control_type: "password", x: 24, y: 116, width: 360, height: 36, text: "password123", event_handlers: { "onChange": "on_pass_change" } },
					{ id: "chk_remember", control_type: "checkbox", x: 24, y: 162, width: 240, height: 24, text: "Remember login session", checked: true },
					{ id: "btn_signin", control_type: "button", x: 24, y: 200, width: 360, height: 42, text: "Sign In Now", background_color: "#0284c7", event_handlers: { "onClick": "on_signin_click" } }
				];
			} else if (name === "dash") {
				formSpec.title = "Fintech Analytics KPI Dashboard";
				formSpec.width = 960;
				formSpec.height = 580;
				formSpec.controls = [
					{ id: "lbl_dash", control_type: "label", x: 20, y: 20, width: 460, height: 32, text: "📊 Executive Performance Dashboard", font_size: 18, font_color: "#10b981" },
					{ id: "inp_target", control_type: "input", x: 20, y: 64, width: 280, height: 34, text: "Q3 Target: $4.2M" },
					{ id: "progress_target", control_type: "progress", x: 320, y: 64, width: 360, height: 34, value: 85 },
					{ id: "btn_refresh", control_type: "button", x: 20, y: 110, width: 160, height: 36, text: "Refresh Data", background_color: "#10b981", event_handlers: { "onClick": "on_refresh_click" } }
				];
			} else if (name === "settings") {
				formSpec.title = "Application Settings Studio";
				formSpec.width = 860;
				formSpec.height = 580;
				formSpec.controls = [
					{ id: "lbl_settings_header", control_type: "label", x: 24, y: 24, width: 420, height: 32, text: "⚙️ System Settings & Preferences", font_size: 18, font_color: "#38bdf8" },
					{ id: "panel_gen", control_type: "panel", x: 24, y: 70, width: 380, height: 220, text: "General Settings", background_color: "#1e293b" },
					{ id: "panel_sec", control_type: "panel", x: 430, y: 70, width: 400, height: 220, text: "Security & Telemetry", background_color: "#1e293b" },
					{ id: "inp_app_name", control_type: "input", x: 40, y: 110, width: 340, height: 36, text: "Vlang Studio App" },
					{ id: "slider_sec", control_type: "slider", x: 446, y: 110, width: 360, height: 28, value: 80 },
					{ id: "sw_gpu", control_type: "switch", x: 40, y: 160, width: 260, height: 28, text: "Enable GPU Acceleration", checked: true },
					{ id: "badge_status", control_type: "badge", x: 446, y: 160, width: 140, height: 28, text: "VERIFIED SECURE", background_color: "#059669" },
					{ id: "btn_save", control_type: "button", x: 24, y: 310, width: 200, height: 42, text: "Save Preferences", background_color: "#0284c7", event_handlers: { "onClick": "on_save_click" } }
				];
			} else if (name === "profile") {
				formSpec.title = "User Profile & Account Settings";
				formSpec.width = 720;
				formSpec.height = 560;
				formSpec.controls = [
					{ id: "lbl_profile_header", control_type: "label", x: 24, y: 20, width: 400, height: 32, text: "👤 User Profile & Account", font_size: 20, font_color: "#38bdf8" },
					{ id: "field_name", control_type: "form_field", x: 24, y: 64, width: 300, height: 44, text: "Full Name: Alex Mercer" },
					{ id: "field_username", control_type: "form_field", x: 344, y: 64, width: 300, height: 44, text: "Username: @alexmercer" },
					{ id: "field_bio", control_type: "form_textarea", x: 24, y: 120, width: 620, height: 100, text: "Senior Systems Engineer building desktop applications with Vlang and SimpleGUI." },
					{ id: "switch_notif", control_type: "form_switch", x: 24, y: 230, width: 280, height: 28, text: "System Push Notifications", checked: true },
					{ id: "dropdown_role", control_type: "form_dropdown", x: 344, y: 230, width: 300, height: 44, text: "Account Role" },
					{ id: "btn_save_profile", control_type: "button", x: 24, y: 290, width: 180, height: 42, text: "💾 Save Profile", background_color: "#0284c7" },
					{ id: "btn_cancel_profile", control_type: "button", x: 216, y: 290, width: 140, height: 42, text: "Cancel", background_color: "#334155" }
				];
			} else if (name === "crud") {
				formSpec.title = "Enterprise Product Data Grid & CRUD";
				formSpec.width = 920;
				formSpec.height = 620;
				formSpec.controls = [
					{ id: "lbl_crud_header", control_type: "label", x: 24, y: 20, width: 420, height: 32, text: "🗄️ Database Record Manager", font_size: 20, font_color: "#10b981" },
					{ id: "inp_search", control_type: "search", x: 24, y: 64, width: 320, height: 36, text: "Search products..." },
					{ id: "btn_add_record", control_type: "button", x: 360, y: 64, width: 140, height: 36, text: "➕ Add Record", background_color: "#10b981" },
					{ id: "btn_refresh_table", control_type: "button", x: 510, y: 64, width: 120, height: 36, text: "🔄 Refresh", background_color: "#0284c7" },
					{ id: "table_records", control_type: "table", x: 24, y: 116, width: 860, height: 360, text: "Product Database Grid" },
					{ id: "badge_count", control_type: "badge", x: 24, y: 490, width: 160, height: 28, text: "148 Records Total", background_color: "#38bdf8" },
					{ id: "status_db", control_type: "status_indicator", x: 200, y: 490, width: 180, height: 28, text: "PostgreSQL Online" }
				];
			} else if (name === "ticket") {
				formSpec.title = "Help Desk & Bug Ticket Reporter";
				formSpec.width = 760;
				formSpec.height = 600;
				formSpec.controls = [
					{ id: "lbl_ticket_header", control_type: "label", x: 24, y: 20, width: 420, height: 32, text: "🎫 Submit Support & Bug Ticket", font_size: 20, font_color: "#38bdf8" },
					{ id: "field_ticket_title", control_type: "form_field", x: 24, y: 64, width: 680, height: 44, text: "Issue Title: Canvas element overlap on high-DPI displays" },
					{ id: "dropdown_severity", control_type: "form_dropdown", x: 24, y: 120, width: 320, height: 44, text: "Severity Level" },
					{ id: "field_ticket_desc", control_type: "form_textarea", x: 24, y: 176, width: 680, height: 110, text: "Steps to reproduce:\n1. Open UI Designer\n2. Zoom to 150%\n3. Observe snap guidelines alignment." },
					{ id: "drop_attachment", control_type: "drop_zone", x: 24, y: 296, width: 680, height: 80, text: "Drag & drop log files or screenshots here" },
					{ id: "rating_priority", control_type: "rating", x: 24, y: 390, width: 140, height: 32, text: "Urgency Rating" },
					{ id: "btn_send_ticket", control_type: "button", x: 24, y: 435, width: 220, height: 44, text: "🚀 Submit Support Ticket", background_color: "#0284c7" }
				];
			} else if (name === "api_tester") {
				formSpec.title = "REST API Request & Response Tester";
				formSpec.width = 860;
				formSpec.height = 600;
				formSpec.controls = [
					{ id: "lbl_api_header", control_type: "label", x: 24, y: 20, width: 480, height: 32, text: "⚡ REST API Client & Endpoint Tester", font_size: 20, font_color: "#10b981" },
					{ id: "dropdown_method", control_type: "form_dropdown", x: 24, y: 64, width: 140, height: 44, text: "HTTP Method" },
					{ id: "field_url", control_type: "form_field", x: 176, y: 64, width: 480, height: 44, text: "Endpoint: https://api.vlang.org/v1/status" },
					{ id: "btn_send_api", control_type: "button", x: 668, y: 64, width: 140, height: 44, text: "▶ Send", background_color: "#10b981" },
					{ id: "status_api", control_type: "status_indicator", x: 24, y: 120, width: 220, height: 28, text: "200 OK (38ms)" },
					{ id: "code_response", control_type: "code_view", x: 24, y: 160, width: 784, height: 340, text: "JSON Response Payload" }
				];
			} else if (name === "media") {
				formSpec.title = "Hi-Fi Audio & Media Control Panel";
				formSpec.width = 640;
				formSpec.height = 520;
				formSpec.controls = [
					{ id: "lbl_media_header", control_type: "label", x: 24, y: 20, width: 400, height: 32, text: "🎵 Hi-Fi Audio Player", font_size: 20, font_color: "#38bdf8" },
					{ id: "lbl_track_name", control_type: "label", x: 24, y: 64, width: 400, height: 28, text: "Track: Vlang Symphony No. 9 in D Minor", font_size: 15 },
					{ id: "progress_playback", control_type: "progress", x: 24, y: 100, width: 560, height: 32, value: 64, text: "Playback Progress" },
					{ id: "btn_prev", control_type: "button", x: 24, y: 145, width: 100, height: 42, text: "⏮ Prev", background_color: "#334155" },
					{ id: "btn_play", control_type: "button", x: 136, y: 145, width: 140, height: 42, text: "⏸ Pause", background_color: "#0284c7" },
					{ id: "btn_next", control_type: "button", x: 288, y: 145, width: 100, height: 42, text: "⏭ Next", background_color: "#334155" },
					{ id: "slider_volume", control_type: "slider", x: 24, y: 205, width: 360, height: 28, value: 80, text: "Volume Level" },
					{ id: "rating_track", control_type: "rating", x: 24, y: 245, width: 140, height: 32, text: "Favorite Rating" }
				];
			} else if (name === "checkout") {
				formSpec.title = "E-Commerce Multi-Column Checkout";
				formSpec.width = 960;
				formSpec.height = 640;
				formSpec.controls = [
					{ id: "lbl_checkout", control_type: "label", x: 24, y: 20, width: 420, height: 32, text: "🛒 Order Checkout & Payment", font_size: 20, font_color: "#38bdf8" },
					{ id: "panel_billing", control_type: "panel", x: 24, y: 64, width: 440, height: 450, text: "Billing & Shipping Details", background_color: "#1e293b" },
					{ id: "panel_payment", control_type: "panel", x: 490, y: 64, width: 440, height: 450, text: "Payment Method & Summary", background_color: "#1e293b" },
					{ id: "inp_full_name", control_type: "input", x: 40, y: 104, width: 408, height: 36, text: "Ada Lovelace" },
					{ id: "inp_card", control_type: "input", x: 506, y: 104, width: 408, height: 36, text: "4532 •••• •••• 8892" },
					{ id: "inp_email_addr", control_type: "input", x: 40, y: 152, width: 408, height: 36, text: "ada@lovelace.org" },
					{ id: "badge_total", control_type: "badge", x: 506, y: 160, width: 408, height: 38, text: "TOTAL DUE: $299.00 USD", background_color: "#059669" },
					{ id: "inp_address", control_type: "input", x: 40, y: 200, width: 408, height: 36, text: "100 Innovation Way, Suite 400" },
					{ id: "btn_place_order", control_type: "button", x: 506, y: 216, width: 408, height: 44, text: "💳 Complete Payment & Order", background_color: "#0284c7", event_handlers: { "onClick": "on_pay_click" } }
				];
			} else {
				formSpec.title = "Delphi/VB RAD Enterprise Portal";
				formSpec.width = 940;
				formSpec.height = 620;
				formSpec.controls = [
					{ id: "lbl_title", control_type: "label", x: 24, y: 20, width: 460, height: 32, text: "📋 Customer Account & Portal Registration", font_size: 18, font_color: "#38bdf8" },
					{ id: "panel_profile", control_type: "panel", x: 24, y: 64, width: 420, height: 440, text: "Profile Information", background_color: "#1e293b" },
					{ id: "panel_prefs", control_type: "panel", x: 470, y: 64, width: 440, height: 440, text: "Security & Priority Settings", background_color: "#1e293b" },
					{ id: "input_fullname", control_type: "input", x: 40, y: 104, width: 388, height: 36, text: "Ada Lovelace" },
					{ id: "slider_priority", control_type: "slider", x: 486, y: 104, width: 408, height: 28, value: 75 },
					{ id: "input_email", control_type: "input", x: 40, y: 152, width: 388, height: 36, text: "ada@lovelace.org" },
					{ id: "sw_two_factor", control_type: "switch", x: 486, y: 148, width: 300, height: 28, text: "Enable 2FA Authentication", checked: true },
					{ id: "radio_plan_std", control_type: "radio", x: 486, y: 190, width: 180, height: 26, text: "Standard Account", checked: false },
					{ id: "radio_plan_pro", control_type: "radio", x: 486, y: 220, width: 180, height: 26, text: "Pro Developer Tier", checked: true },
					{ id: "radio_plan_ent", control_type: "radio", x: 486, y: 250, width: 180, height: 26, text: "Enterprise Studio", checked: false },
					{ id: "btn_submit", control_type: "button", x: 24, y: 520, width: 180, height: 42, text: "💾 Save Account", background_color: "#0284c7", event_handlers: { "onClick": "on_save_click" } }
				];
			}
			selectedIndices = [];
			document.getElementById("propFormTitle").value = formSpec.title;
			renderCanvas();
			renderCode();
			renderTree();
			populateInspector();
			document.getElementById("statusMsg").textContent = "Loaded " + name + " template layout.";
		}

		function setBgColor(hex) {
			const bgEl = document.getElementById("propBgColor");
			if (bgEl) {
				bgEl.value = hex;
				updateSelectedControl();
			}
		}

		function capitalize(str) {
			return str.charAt(0).toUpperCase() + str.slice(1);
		}
