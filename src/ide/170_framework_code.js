
		// Modern Framework Code Generators (React + Tailwind, Vue 3, Python CustomTkinter)
		function generateReactTailwindCode() {
			const escAttr = (v) =>
				String(v === undefined || v === null ? "" : v)
					.replace(/&/g, "&amp;")
					.replace(/</g, "&lt;")
					.replace(/>/g, "&gt;")
					.replace(/"/g, "&quot;");
			const escJsx = (v) =>
				escAttr(v)
					.replace(/\{/g, "&#123;")
					.replace(/\}/g, "&#125;");
			const safeTwToken = (v, fb) => {
				const s = String(v || fb).replace(/[^#a-zA-Z0-9.,_%()-]/g, "");
				return s || fb;
			};
			const title = formSpec.title || "RAD Studio Form";
			const compSuffix = String(title).replace(/[^a-zA-Z0-9]/g, "") || "App";
			const compName = (/^[0-9]/.test(compSuffix) ? "Form" + compSuffix : compSuffix) + "Form";
			const formW = Number(formSpec.width) || 840;
			const formH = Number(formSpec.height) || 560;
			const bgTok = safeTwToken(formSpec.background_color, "#0f172a");
			const fgTok = safeTwToken(formSpec.font_color, "#f8fafc");
			let code = `import React, { useState } from 'react';\n\nexport default function ${compName}() {\n`;
			code += `  // Form Component State\n  const [formState, setFormState] = useState({\n`;
			(formSpec.controls || []).forEach(c => {
				code += `    ${JSON.stringify(String(c.id || ""))}: ${JSON.stringify(c.value !== undefined ? c.value : c.text || '')},\n`;
			});
			code += `  });\n\n`;
			code += `  return (\n    <div className="relative w-[${formW}px] min-h-[${formH}px] bg-[${bgTok}] text-[${fgTok}] rounded-xl shadow-2xl p-6 overflow-hidden">\n`;
			code += `      <h2 className="text-xl font-bold border-b border-white/10 pb-3 mb-4">${escJsx(title)}</h2>\n`;

			(formSpec.controls || []).forEach(c => {
				const cid = escAttr(c.id);
				const cx = Number(c.x) || 0;
				const cy = (Number(c.y) || 0) + 30;
				const cw = Number(c.width) || 100;
				const ch = Number(c.height) || 32;
				const style = `left: '${cx}px', top: '${cy}px', width: '${cw}px', height: '${ch}px'`;
				const txt = escJsx(c.text || "");
				const attrTxt = escAttr(c.text || "");
				const attrPh = escAttr(c.placeholder || "");
				if (c.control_type === 'button') {
					code += `      <button id="${cid}" style={{ position: 'absolute', ${style} }} className="bg-sky-600 hover:bg-sky-500 text-white font-semibold rounded-lg shadow-md transition flex items-center justify-center">${escJsx(c.text || 'Button')}</button>\n`;
				} else if (c.control_type === 'label') {
					code += `      <span id="${cid}" style={{ position: 'absolute', ${style} }} className="font-medium flex items-center">${escJsx(c.text || 'Label')}</span>\n`;
				} else if (c.control_type === 'input') {
					code += `      <input id="${cid}" type="text" style={{ position: 'absolute', ${style} }} className="bg-white/5 border border-white/15 rounded-lg px-3 outline-none focus:border-sky-400" placeholder="${attrPh}" defaultValue="${attrTxt}" />\n`;
				} else if (c.control_type === 'search') {
					code += `      <input id="${cid}" type="search" style={{ position: 'absolute', ${style} }} className="bg-white/5 border border-white/15 rounded-lg px-3 outline-none focus:border-sky-400" placeholder="${escAttr(c.placeholder || 'Search...')}" defaultValue="${attrTxt}" />\n`;
				} else if (c.control_type === 'password') {
					code += `      <input id="${cid}" type="password" style={{ position: 'absolute', ${style} }} className="bg-white/5 border border-white/15 rounded-lg px-3 outline-none focus:border-sky-400" placeholder="${attrPh}" defaultValue="${attrTxt}" />\n`;
				} else if (c.control_type === 'textarea') {
					code += `      <textarea id="${cid}" style={{ position: 'absolute', ${style} }} className="bg-white/5 border border-white/15 rounded-lg p-3 outline-none focus:border-sky-400 resize-none" placeholder="${attrPh}" defaultValue="${attrTxt}" />\n`;
				} else if (c.control_type === 'checkbox') {
					code += `      <label id="${cid}" style={{ position: 'absolute', ${style} }} className="flex items-center gap-2 cursor-pointer"><input type="checkbox" defaultChecked={${!!c.checked}} className="rounded accent-sky-500" /><span>${txt}</span></label>\n`;
				} else if (c.control_type === 'radio') {
					code += `      <label id="${cid}" style={{ position: 'absolute', ${style} }} className="flex items-center gap-2 cursor-pointer"><input type="radio" name="form_radios" defaultChecked={${!!c.checked}} className="accent-sky-500" /><span>${txt}</span></label>\n`;
				} else if (c.control_type === 'number' || c.control_type === 'form_number') {
					const numVal = Number.isFinite(Number(c.value)) ? Number(c.value) : 0;
					code += `      <input id="${cid}" type="number" style={{ position: 'absolute', ${style} }} className="bg-white/5 border border-white/15 rounded-lg px-3 outline-none" defaultValue={${numVal}} />\n`;
				} else if (c.control_type === 'date' || c.control_type === 'date_picker' || c.control_type === 'form_date') {
					code += `      <input id="${cid}" type="date" style={{ position: 'absolute', ${style} }} className="bg-white/5 border border-white/15 rounded-lg px-3 outline-none" />\n`;
				} else if (c.control_type === 'color') {
					code += `      <input id="${cid}" type="color" style={{ position: 'absolute', ${style} }} className="bg-transparent rounded-lg cursor-pointer" defaultValue="${escAttr(c.value || '#38bdf8')}" />\n`;
				} else if (c.control_type === 'slider' || c.control_type === 'form_slider') {
					const sliderVal = Number.isFinite(Number(c.value)) ? Number(c.value) : 50;
					code += `      <input id="${cid}" type="range" style={{ position: 'absolute', ${style} }} className="w-full accent-sky-400" defaultValue={${sliderVal}} />\n`;
				} else if (c.control_type === 'segmented_control') {
					code += `      <div id="${cid}" style={{ position: 'absolute', ${style} }} className="bg-white/10 p-1 rounded-lg flex gap-1">${String(c.text || 'Overview, Analytics, Reports').split(',').map(s=>`<button className="flex-1 py-1 text-xs font-semibold rounded-md bg-sky-600 text-white">${escJsx(s.trim())}</button>`).join('')}</div>\n`;
				} else if (c.control_type === 'stat_chart') {
					code += `      <div id="${cid}" style={{ position: 'absolute', ${style} }} className="bg-slate-800/80 border border-white/10 p-3 rounded-xl flex flex-col justify-between"><div className="flex justify-between text-xs opacity-70"><span>${escJsx(c.text || 'Revenue')}</span><span className="text-emerald-400 font-bold">+18.4%</span></div><div className="text-xl font-extrabold text-sky-400">$48,290</div></div>\n`;
				} else if (c.control_type === 'toast_card') {
					code += `      <div id="${cid}" style={{ position: 'absolute', ${style} }} className="bg-slate-800 border-l-4 border-emerald-500 rounded-lg p-3 flex items-center justify-between shadow-xl"><span>✅ ${escJsx(c.text || 'Notification')}</span></div>\n`;
				} else if (c.control_type === 'time_picker') {
					code += `      <input id="${cid}" type="time" style={{ position: 'absolute', ${style} }} className="bg-white/5 border border-white/15 rounded-lg px-3 outline-none" defaultValue="${escAttr(c.value || '09:30')}" />\n`;
				} else if (c.control_type === 'property_grid') {
					code += `      <div id="${cid}" style={{ position: 'absolute', ${style} }} className="bg-slate-800 border border-white/10 rounded-xl p-3 flex flex-col justify-between"><div className="text-xs font-bold text-sky-400 border-b border-white/10 pb-1 mb-1">📋 Property Inspector</div><div className="text-xs font-mono opacity-80">${escJsx(c.text || 'Theme: Dark, Font: 13px')}</div></div>\n`;
				} else if (c.control_type === 'popup_menu') {
					code += `      <div id="${cid}" style={{ position: 'absolute', ${style} }} className="bg-slate-800 border border-white/10 rounded-xl p-2 shadow-2xl flex flex-col gap-1 text-xs"><div className="p-1 font-semibold">✂️ Cut ⌘X</div><div className="p-1 font-semibold">📋 Copy ⌘C</div></div>\n`;
				} else if (c.control_type === 'calendar_view') {
					code += `      <div id="${cid}" style={{ position: 'absolute', ${style} }} className="bg-slate-800 border border-white/10 rounded-xl p-3 flex flex-col justify-between text-xs"><div className="font-bold text-center border-b border-white/10 pb-1">July 2026</div><div className="grid grid-cols-7 text-center gap-1 mt-1 opacity-70"><span>Su</span><span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span></div></div>\n`;
				} else if (c.control_type === 'color_swatch') {
					code += `      <div id="${cid}" style={{ position: 'absolute', ${style} }} className="flex items-center gap-2"><div className="w-5 h-5 rounded-full bg-sky-500 ring-2 ring-white"></div><div className="w-5 h-5 rounded-full bg-emerald-500"></div><div className="w-5 h-5 rounded-full bg-amber-500"></div></div>\n`;
				} else if (c.control_type === 'file_path_bar') {
					code += `      <div id="${cid}" style={{ position: 'absolute', ${style} }} className="bg-white/5 border border-white/15 rounded-lg px-3 flex items-center justify-between text-xs font-mono"><span>📁 ${escJsx(c.text || '/Users/app/src')}</span><button className="bg-sky-600 text-white px-2 py-0.5 rounded font-sans font-bold text-[10px]">Browse</button></div>\n`;
				} else if (c.control_type === 'kanban_board') {
					code += `      <div id="${cid}" style={{ position: 'absolute', ${style} }} className="bg-slate-800 border border-white/10 rounded-xl p-2 flex gap-2 text-xs"><div className="flex-1 bg-white/5 p-2 rounded-lg font-bold text-sky-400">To Do (3)</div><div className="flex-1 bg-white/5 p-2 rounded-lg font-bold text-sky-400">Done (4)</div></div>\n`;
				} else if (c.control_type === 'shortcut_recorder') {
					code += `      <div id="${cid}" style={{ position: 'absolute', ${style} }} className="bg-slate-800 border border-white/10 rounded-lg px-3 flex items-center justify-between text-xs font-mono"><span className="bg-white/10 px-2 py-0.5 rounded font-bold text-sky-400">⌘ Shift P</span></div>\n`;
				} else if (c.control_type === 'split_button') {
					code += `      <div id="${cid}" style={{ position: 'absolute', ${style} }} className="bg-sky-600 rounded-lg flex items-stretch text-white text-xs font-bold"><button className="px-3 py-1.5 flex-1">${escJsx(c.text || 'Save Changes')}</button><div className="w-[1px] bg-white/30"></div><button className="px-2">▼</button></div>\n`;
				} else if (c.control_type === 'sparkline_table') {
					code += `      <div id="${cid}" style={{ position: 'absolute', ${style} }} className="bg-slate-800 border border-white/10 rounded-xl p-3 flex flex-col justify-around text-xs"><div className="flex justify-between"><span>Revenue</span><span className="font-bold text-emerald-400">$48.2k</span></div></div>\n`;
				} else if (c.control_type === 'metric_comparison') {
					code += `      <div id="${cid}" style={{ position: 'absolute', ${style} }} className="bg-slate-800 border border-white/10 rounded-xl p-3 flex flex-col justify-between text-xs"><div className="flex justify-between font-bold"><span>MRR</span><span className="text-emerald-400">+14.2%</span></div><div className="text-lg font-extrabold text-sky-400">$84,250</div></div>\n`;
				} else if (c.control_type === 'activity_feed') {
					code += `      <div id="${cid}" style={{ position: 'absolute', ${style} }} className="bg-slate-800 border border-white/10 rounded-xl p-3 flex flex-col gap-2 text-xs"><div className="font-bold text-sky-400">⚡ Activity Stream</div></div>\n`;
				} else if (c.control_type === 'file_tree_tabs') {
					code += `      <div id="${cid}" style={{ position: 'absolute', ${style} }} className="bg-white/5 rounded-lg p-1 flex gap-1 text-xs"><div className="bg-sky-600 text-white px-2 py-1 rounded font-bold">⚡ index.ts*</div></div>\n`;
				} else {
					code += `      <div id="${cid}" style={{ position: 'absolute', ${style} }} className="border border-white/10 rounded-lg p-2 flex items-center">${escJsx(c.text || c.id)}</div>\n`;
				}
			});

			code += `    </div>\n  );\n}\n`;
			return code;
		}

		function generateVueCode() {
			const escAttr = (v) =>
				String(v === undefined || v === null ? "" : v)
					.replace(/&/g, "&amp;")
					.replace(/</g, "&lt;")
					.replace(/>/g, "&gt;")
					.replace(/"/g, "&quot;")
					.replace(/'/g, "&#39;");
			const escVue = (v) =>
				escAttr(v)
					.replace(/\{\{/g, "&#123;&#123;")
					.replace(/\}\}/g, "&#125;&#125;");
			const safeCssVal = (v, fb) => {
				const s = String(v || fb).replace(/[;<>{}"'\\]/g, "");
				return s || fb;
			};
			const title = formSpec.title || "RAD Studio Form";
			const formW = Number(formSpec.width) || 840;
			const formH = Number(formSpec.height) || 560;
			const bgCss = safeCssVal(formSpec.background_color, "#0f172a");
			const fgCss = safeCssVal(formSpec.font_color, "#f8fafc");
			let code = `<template>\n  <div class="rad-form-window">\n    <h2 class="form-title">${escVue(title)}</h2>\n`;
			(formSpec.controls || []).forEach(c => {
				const cid = escAttr(c.id);
				const cx = Number(c.x) || 0;
				const cy = (Number(c.y) || 0) + 30;
				const cw = Number(c.width) || 100;
				const ch = Number(c.height) || 32;
				const style = `position: absolute; left: ${cx}px; top: ${cy}px; width: ${cw}px; height: ${ch}px;`;
				const attrTxt = escAttr(c.text || "");
				const attrPh = escAttr(c.placeholder || "");
				if (c.control_type === 'button') {
					code += `    <button id="${cid}" style="${style}" class="rad-btn">${escVue(c.text || 'Button')}</button>\n`;
				} else if (c.control_type === 'label') {
					code += `    <span id="${cid}" style="${style}" class="rad-label">${escVue(c.text || 'Label')}</span>\n`;
				} else if (c.control_type === 'input') {
					code += `    <input id="${cid}" style="${style}" type="text" class="rad-input" placeholder="${attrPh}" value="${attrTxt}" />\n`;
				} else if (c.control_type === 'search') {
					code += `    <input id="${cid}" style="${style}" type="search" class="rad-input" placeholder="${escAttr(c.placeholder || 'Search...')}" value="${attrTxt}" />\n`;
				} else if (c.control_type === 'password') {
					code += `    <input id="${cid}" style="${style}" type="password" class="rad-input" placeholder="${attrPh}" />\n`;
				} else if (c.control_type === 'textarea') {
					code += `    <textarea id="${cid}" style="${style}" class="rad-input" placeholder="${attrPh}">${escVue(c.text || '')}</textarea>\n`;
				} else if (c.control_type === 'checkbox') {
					code += `    <label id="${cid}" style="${style}" class="rad-checkbox"><input type="checkbox" ${c.checked ? 'checked' : ''} /> <span>${escVue(c.text || '')}</span></label>\n`;
				} else {
					code += `    <div id="${cid}" style="${style}" class="rad-ctrl">${escVue(c.text || c.id)}</div>\n`;
				}
			});
			code += `  </div>\n</template>\n\n<` + `script setup>\nimport { ref } from 'vue';\n// Form Logic Here\n<` + `/script>\n\n<style scoped>\n.rad-form-window { position: relative; width: ${formW}px; height: ${formH}px; background: ${bgCss}; color: ${fgCss}; border-radius: 12px; padding: 20px; }\n</style>\n`;
			return code;
		}

		function generatePythonTkinterCode() {
			const pyStr = (v) => JSON.stringify(String(v === undefined || v === null ? "" : v));
			const pyIdent = (v, idx) => {
				const cleaned = String(v || "").replace(/[^a-zA-Z0-9_]/g, "_");
				return cleaned || `ctrl_${idx}`;
			};
			const pyComment = (v) => String(v || "").replace(/[\r\n]+/g, " ");
			const title = formSpec.title || "RAD Studio App";
			const formW = Math.round(Number(formSpec.width) || 840);
			const formH = Math.round(Number(formSpec.height) || 560);
			let code = `import customtkinter as ctk\n\n# Initialize Application Window\nctk.set_appearance_mode("dark")\nroot = ctk.CTk()\nroot.title(${pyStr(title)})\nroot.geometry(${pyStr(`${formW}x${formH}`)})\n\n`;
			(formSpec.controls || []).forEach((c, idx) => {
				const ident = pyIdent(c.id, idx);
				const comment = pyComment(c.id);
				const cx = Math.round(Number(c.x) || 0);
				const cy = Math.round(Number(c.y) || 0);
				const cw = Math.round(Number(c.width) || 100);
				const ch = Math.round(Number(c.height) || 32);
				if (c.control_type === 'button') {
					code += `# ${comment}\nbtn_${ident} = ctk.CTkButton(root, text=${pyStr(c.text || 'Button')}, width=${cw}, height=${ch})\nbtn_${ident}.place(x=${cx}, y=${cy})\n\n`;
				} else if (c.control_type === 'label') {
					code += `# ${comment}\nlbl_${ident} = ctk.CTkLabel(root, text=${pyStr(c.text || 'Label')})\nlbl_${ident}.place(x=${cx}, y=${cy})\n\n`;
				} else if (c.control_type === 'input') {
					code += `# ${comment}\nentry_${ident} = ctk.CTkEntry(root, width=${cw}, height=${ch}, placeholder_text=${pyStr(c.placeholder || '')})\nentry_${ident}.place(x=${cx}, y=${cy})\n\n`;
				} else if (c.control_type === 'search') {
					code += `# ${comment}\nsearch_${ident} = ctk.CTkEntry(root, width=${cw}, height=${ch}, placeholder_text=${pyStr(c.placeholder || 'Search...')})\nsearch_${ident}.place(x=${cx}, y=${cy})\n\n`;
				} else if (c.control_type === 'password') {
					code += `# ${comment}\npass_${ident} = ctk.CTkEntry(root, width=${cw}, height=${ch}, show="*")\npass_${ident}.place(x=${cx}, y=${cy})\n\n`;
				} else if (c.control_type === 'checkbox') {
					code += `# ${comment}\nchk_${ident} = ctk.CTkCheckBox(root, text=${pyStr(c.text || '')})\nchk_${ident}.place(x=${cx}, y=${cy})\n\n`;
				} else if (c.control_type === 'switch' || c.control_type === 'form_switch') {
					code += `# ${comment}\nsw_${ident} = ctk.CTkSwitch(root, text=${pyStr(c.text || '')})\nsw_${ident}.place(x=${cx}, y=${cy})\n\n`;
				} else if (c.control_type === 'slider' || c.control_type === 'form_slider') {
					code += `# ${comment}\nslider_${ident} = ctk.CTkSlider(root, from_=0, to=100)\nslider_${ident}.place(x=${cx}, y=${cy})\n\n`;
				} else if (c.control_type === 'segmented_control') {
					const segVals = String(c.text || "Overview, Analytics, Reports").split(",").map(s => pyStr(s.trim())).join(", ");
					code += `# ${comment}\nseg_${ident} = ctk.CTkSegmentedButton(root, values=[${segVals}])\nseg_${ident}.place(x=${cx}, y=${cy})\n\n`;
				} else if (c.control_type === 'stat_chart' || c.control_type === 'toast_card' || c.control_type === 'accordion') {
					code += `# ${comment}\nframe_${ident} = ctk.CTkFrame(root, width=${cw}, height=${ch})\nframe_${ident}.place(x=${cx}, y=${cy})\nctk.CTkLabel(frame_${ident}, text=${pyStr(c.text || c.id)}).pack(padx=10, pady=10)\n\n`;
				} else {
					code += `# ${comment}\nwidget_${ident} = ctk.CTkLabel(root, text=${pyStr(c.text || c.id)})\nwidget_${ident}.place(x=${cx}, y=${cy})\n\n`;
				}
			});
			code += `root.mainloop()\n`;
			return code;
		}

		function copyReactCode(btn) {
			const code = generateReactTailwindCode();
			const targetBtn = btn || (typeof event !== 'undefined' && event && event.currentTarget);
			copyTextToClipboard(code, "Copied React + Tailwind TSX code to clipboard!", targetBtn);
			switchTab("tabReact");
		}

		function copyVueCode(btn) {
			const code = generateVueCode();
			const targetBtn = btn || (typeof event !== 'undefined' && event && event.currentTarget);
			copyTextToClipboard(code, "Copied Vue 3 SFC code to clipboard!", targetBtn);
			switchTab("tabVue");
		}

		function copyPythonCode(btn) {
			const code = generatePythonTkinterCode();
			const targetBtn = btn || (typeof event !== 'undefined' && event && event.currentTarget);
			copyTextToClipboard(code, "Copied Python CustomTkinter code to clipboard!", targetBtn);
			switchTab("tabPython");
		}

		function copyJSONCode(btn) {
			const code = JSON.stringify(formSpec, null, 2);
			const targetBtn = btn || (typeof event !== 'undefined' && event && event.currentTarget);
			copyTextToClipboard(code, "Copied FormSpec JSON layout to clipboard!", targetBtn);
			switchTab("tabJSON");
		}
