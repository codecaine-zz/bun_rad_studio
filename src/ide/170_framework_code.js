
		// Modern Framework Code Generators (React + Tailwind, Vue 3, Python CustomTkinter)
		function generateReactTailwindCode() {
			const title = formSpec.title || "RAD Studio Form";
			let code = `import React, { useState } from 'react';\n\nexport default function ${title.replace(/[^a-zA-Z0-9]/g, '') || 'App'}Form() {\n`;
			code += `  // Form Component State\n  const [formState, setFormState] = useState({\n`;
			(formSpec.controls || []).forEach(c => {
				code += `    ${c.id}: ${JSON.stringify(c.value !== undefined ? c.value : c.text || '')},\n`;
			});
			code += `  });\n\n`;
			code += `  return (\n    <div className="relative w-[${formSpec.width || 840}px] min-h-[${formSpec.height || 560}px] bg-[${formSpec.background_color || '#0f172a'}] text-[${formSpec.font_color || '#f8fafc'}] rounded-xl shadow-2xl p-6 overflow-hidden">\n`;
			code += `      <h2 className="text-xl font-bold border-b border-white/10 pb-3 mb-4">${title}</h2>\n`;

			(formSpec.controls || []).forEach(c => {
				const style = `left: '${c.x}px', top: '${c.y + 30}px', width: '${c.width}px', height: '${c.height}px'`;
				if (c.control_type === 'button') {
					code += `      <button id="${c.id}" style={{ position: 'absolute', ${style} }} className="bg-sky-600 hover:bg-sky-500 text-white font-semibold rounded-lg shadow-md transition flex items-center justify-center">${c.text || 'Button'}</button>\n`;
				} else if (c.control_type === 'label') {
					code += `      <span id="${c.id}" style={{ position: 'absolute', ${style} }} className="font-medium flex items-center">${c.text || 'Label'}</span>\n`;
				} else if (c.control_type === 'input') {
					code += `      <input id="${c.id}" type="text" style={{ position: 'absolute', ${style} }} className="bg-white/5 border border-white/15 rounded-lg px-3 outline-none focus:border-sky-400" placeholder="${c.placeholder || ''}" defaultValue="${c.text || ''}" />\n`;
				} else if (c.control_type === 'search') {
					code += `      <input id="${c.id}" type="search" style={{ position: 'absolute', ${style} }} className="bg-white/5 border border-white/15 rounded-lg px-3 outline-none focus:border-sky-400" placeholder="${c.placeholder || 'Search...'}" defaultValue="${c.text || ''}" />\n`;
				} else if (c.control_type === 'password') {
					code += `      <input id="${c.id}" type="password" style={{ position: 'absolute', ${style} }} className="bg-white/5 border border-white/15 rounded-lg px-3 outline-none focus:border-sky-400" placeholder="${c.placeholder || ''}" defaultValue="${c.text || ''}" />\n`;
				} else if (c.control_type === 'textarea') {
					code += `      <textarea id="${c.id}" style={{ position: 'absolute', ${style} }} className="bg-white/5 border border-white/15 rounded-lg p-3 outline-none focus:border-sky-400 resize-none" placeholder="${c.placeholder || ''}" defaultValue="${c.text || ''}" />\n`;
				} else if (c.control_type === 'checkbox') {
					code += `      <label id="${c.id}" style={{ position: 'absolute', ${style} }} className="flex items-center gap-2 cursor-pointer"><input type="checkbox" defaultChecked={${!!c.checked}} className="rounded accent-sky-500" /><span>${c.text || ''}</span></label>\n`;
				} else if (c.control_type === 'radio') {
					code += `      <label id="${c.id}" style={{ position: 'absolute', ${style} }} className="flex items-center gap-2 cursor-pointer"><input type="radio" name="form_radios" defaultChecked={${!!c.checked}} className="accent-sky-500" /><span>${c.text || ''}</span></label>\n`;
				} else if (c.control_type === 'number' || c.control_type === 'form_number') {
					code += `      <input id="${c.id}" type="number" style={{ position: 'absolute', ${style} }} className="bg-white/5 border border-white/15 rounded-lg px-3 outline-none" defaultValue={${c.value !== undefined ? c.value : 0}} />\n`;
				} else if (c.control_type === 'date' || c.control_type === 'date_picker' || c.control_type === 'form_date') {
					code += `      <input id="${c.id}" type="date" style={{ position: 'absolute', ${style} }} className="bg-white/5 border border-white/15 rounded-lg px-3 outline-none" />\n`;
				} else if (c.control_type === 'color') {
					code += `      <input id="${c.id}" type="color" style={{ position: 'absolute', ${style} }} className="bg-transparent rounded-lg cursor-pointer" defaultValue="${c.value || '#38bdf8'}" />\n`;
				} else if (c.control_type === 'slider' || c.control_type === 'form_slider') {
					code += `      <input id="${c.id}" type="range" style={{ position: 'absolute', ${style} }} className="w-full accent-sky-400" defaultValue={${c.value !== undefined ? c.value : 50}} />\n`;
				} else if (c.control_type === 'segmented_control') {
					code += `      <div id="${c.id}" style={{ position: 'absolute', ${style} }} className="bg-white/10 p-1 rounded-lg flex gap-1">${(c.text || 'Overview, Analytics, Reports').split(',').map(s=>`<button className="flex-1 py-1 text-xs font-semibold rounded-md bg-sky-600 text-white">${s.trim()}</button>`).join('')}</div>\n`;
				} else if (c.control_type === 'stat_chart') {
					code += `      <div id="${c.id}" style={{ position: 'absolute', ${style} }} className="bg-slate-800/80 border border-white/10 p-3 rounded-xl flex flex-col justify-between"><div className="flex justify-between text-xs opacity-70"><span>${c.text || 'Revenue'}</span><span className="text-emerald-400 font-bold">+18.4%</span></div><div className="text-xl font-extrabold text-sky-400">$48,290</div></div>\n`;
				} else if (c.control_type === 'toast_card') {
					code += `      <div id="${c.id}" style={{ position: 'absolute', ${style} }} className="bg-slate-800 border-l-4 border-emerald-500 rounded-lg p-3 flex items-center justify-between shadow-xl"><span>✅ ${c.text || 'Notification'}</span></div>\n`;
				} else if (c.control_type === 'time_picker') {
					code += `      <input id="${c.id}" type="time" style={{ position: 'absolute', ${style} }} className="bg-white/5 border border-white/15 rounded-lg px-3 outline-none" defaultValue="${c.value || '09:30'}" />\n`;
				} else if (c.control_type === 'property_grid') {
					code += `      <div id="${c.id}" style={{ position: 'absolute', ${style} }} className="bg-slate-800 border border-white/10 rounded-xl p-3 flex flex-col justify-between"><div className="text-xs font-bold text-sky-400 border-b border-white/10 pb-1 mb-1">📋 Property Inspector</div><div className="text-xs font-mono opacity-80">${c.text || 'Theme: Dark, Font: 13px'}</div></div>\n`;
				} else if (c.control_type === 'popup_menu') {
					code += `      <div id="${c.id}" style={{ position: 'absolute', ${style} }} className="bg-slate-800 border border-white/10 rounded-xl p-2 shadow-2xl flex flex-col gap-1 text-xs"><div className="p-1 font-semibold">✂️ Cut ⌘X</div><div className="p-1 font-semibold">📋 Copy ⌘C</div></div>\n`;
				} else if (c.control_type === 'calendar_view') {
					code += `      <div id="${c.id}" style={{ position: 'absolute', ${style} }} className="bg-slate-800 border border-white/10 rounded-xl p-3 flex flex-col justify-between text-xs"><div className="font-bold text-center border-b border-white/10 pb-1">July 2026</div><div className="grid grid-cols-7 text-center gap-1 mt-1 opacity-70"><span>Su</span><span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span></div></div>\n`;
				} else if (c.control_type === 'color_swatch') {
					code += `      <div id="${c.id}" style={{ position: 'absolute', ${style} }} className="flex items-center gap-2"><div className="w-5 h-5 rounded-full bg-sky-500 ring-2 ring-white"></div><div className="w-5 h-5 rounded-full bg-emerald-500"></div><div className="w-5 h-5 rounded-full bg-amber-500"></div></div>\n`;
				} else if (c.control_type === 'file_path_bar') {
					code += `      <div id="${c.id}" style={{ position: 'absolute', ${style} }} className="bg-white/5 border border-white/15 rounded-lg px-3 flex items-center justify-between text-xs font-mono"><span>📁 ${c.text || '/Users/app/src'}</span><button className="bg-sky-600 text-white px-2 py-0.5 rounded font-sans font-bold text-[10px]">Browse</button></div>\n`;
				} else if (c.control_type === 'kanban_board') {
					code += `      <div id="${c.id}" style={{ position: 'absolute', ${style} }} className="bg-slate-800 border border-white/10 rounded-xl p-2 flex gap-2 text-xs"><div className="flex-1 bg-white/5 p-2 rounded-lg font-bold text-sky-400">To Do (3)</div><div className="flex-1 bg-white/5 p-2 rounded-lg font-bold text-sky-400">Done (4)</div></div>\n`;
				} else if (c.control_type === 'shortcut_recorder') {
					code += `      <div id="${c.id}" style={{ position: 'absolute', ${style} }} className="bg-slate-800 border border-white/10 rounded-lg px-3 flex items-center justify-between text-xs font-mono"><span className="bg-white/10 px-2 py-0.5 rounded font-bold text-sky-400">⌘ Shift P</span></div>\n`;
				} else if (c.control_type === 'split_button') {
					code += `      <div id="${c.id}" style={{ position: 'absolute', ${style} }} className="bg-sky-600 rounded-lg flex items-stretch text-white text-xs font-bold"><button className="px-3 py-1.5 flex-1">${c.text || 'Save Changes'}</button><div className="w-[1px] bg-white/30"></div><button className="px-2">▼</button></div>\n`;
				} else if (c.control_type === 'sparkline_table') {
					code += `      <div id="${c.id}" style={{ position: 'absolute', ${style} }} className="bg-slate-800 border border-white/10 rounded-xl p-3 flex flex-col justify-around text-xs"><div className="flex justify-between"><span>Revenue</span><span className="font-bold text-emerald-400">$48.2k</span></div></div>\n`;
				} else if (c.control_type === 'metric_comparison') {
					code += `      <div id="${c.id}" style={{ position: 'absolute', ${style} }} className="bg-slate-800 border border-white/10 rounded-xl p-3 flex flex-col justify-between text-xs"><div className="flex justify-between font-bold"><span>MRR</span><span className="text-emerald-400">+14.2%</span></div><div className="text-lg font-extrabold text-sky-400">$84,250</div></div>\n`;
				} else if (c.control_type === 'activity_feed') {
					code += `      <div id="${c.id}" style={{ position: 'absolute', ${style} }} className="bg-slate-800 border border-white/10 rounded-xl p-3 flex flex-col gap-2 text-xs"><div className="font-bold text-sky-400">⚡ Activity Stream</div></div>\n`;
				} else if (c.control_type === 'file_tree_tabs') {
					code += `      <div id="${c.id}" style={{ position: 'absolute', ${style} }} className="bg-white/5 rounded-lg p-1 flex gap-1 text-xs"><div className="bg-sky-600 text-white px-2 py-1 rounded font-bold">⚡ index.ts*</div></div>\n`;
				} else {
					code += `      <div id="${c.id}" style={{ position: 'absolute', ${style} }} className="border border-white/10 rounded-lg p-2 flex items-center">${c.text || c.id}</div>\n`;
				}
			});

			code += `    </div>\n  );\n}\n`;
			return code;
		}

		function generateVueCode() {
			const title = formSpec.title || "RAD Studio Form";
			let code = `<template>\n  <div class="rad-form-window">\n    <h2 class="form-title">${title}</h2>\n`;
			(formSpec.controls || []).forEach(c => {
				const style = `position: absolute; left: ${c.x}px; top: ${c.y + 30}px; width: ${c.width}px; height: ${c.height}px;`;
				if (c.control_type === 'button') {
					code += `    <button id="${c.id}" style="${style}" class="rad-btn">${c.text || 'Button'}</button>\n`;
				} else if (c.control_type === 'label') {
					code += `    <span id="${c.id}" style="${style}" class="rad-label">${c.text || 'Label'}</span>\n`;
				} else if (c.control_type === 'input') {
					code += `    <input id="${c.id}" style="${style}" type="text" class="rad-input" placeholder="${c.placeholder || ''}" :value="'${c.text || ''}'" />\n`;
				} else if (c.control_type === 'search') {
					code += `    <input id="${c.id}" style="${style}" type="search" class="rad-input" placeholder="${c.placeholder || 'Search...'}" :value="'${c.text || ''}'" />\n`;
				} else if (c.control_type === 'password') {
					code += `    <input id="${c.id}" style="${style}" type="password" class="rad-input" placeholder="${c.placeholder || ''}" />\n`;
				} else if (c.control_type === 'textarea') {
					code += `    <textarea id="${c.id}" style="${style}" class="rad-input" placeholder="${c.placeholder || ''}">${c.text || ''}</textarea>\n`;
				} else if (c.control_type === 'checkbox') {
					code += `    <label id="${c.id}" style="${style}" class="rad-checkbox"><input type="checkbox" ${c.checked ? 'checked' : ''} /> <span>${c.text || ''}</span></label>\n`;
				} else {
					code += `    <div id="${c.id}" style="${style}" class="rad-ctrl">${c.text || c.id}</div>\n`;
				}
			});
			code += `  </div>\n</template>\n\n<` + `script setup>\nimport { ref } from 'vue';\n// Form Logic Here\n<` + `/script>\n\n<style scoped>\n.rad-form-window { position: relative; width: ${formSpec.width || 840}px; height: ${formSpec.height || 560}px; background: ${formSpec.background_color || '#0f172a'}; color: ${formSpec.font_color || '#f8fafc'}; border-radius: 12px; padding: 20px; }\n</style>\n`;
			return code;
		}

		function generatePythonTkinterCode() {
			const title = formSpec.title || "RAD Studio App";
			let code = `import customtkinter as ctk\n\n# Initialize Application Window\nctk.set_appearance_mode("dark")\nroot = ctk.CTk()\nroot.title("${title}")\nroot.geometry("${formSpec.width || 840}x${formSpec.height || 560}")\n\n`;
			(formSpec.controls || []).forEach(c => {
				if (c.control_type === 'button') {
					code += `# ${c.id}\nbtn_${c.id} = ctk.CTkButton(root, text="${c.text || 'Button'}", width=${c.width}, height=${c.height})\nbtn_${c.id}.place(x=${c.x}, y=${c.y})\n\n`;
				} else if (c.control_type === 'label') {
					code += `# ${c.id}\nlbl_${c.id} = ctk.CTkLabel(root, text="${c.text || 'Label'}")\nlbl_${c.id}.place(x=${c.x}, y=${c.y})\n\n`;
				} else if (c.control_type === 'input') {
					code += `# ${c.id}\nentry_${c.id} = ctk.CTkEntry(root, width=${c.width}, height=${c.height}, placeholder_text="${c.placeholder || ''}")\nentry_${c.id}.place(x=${c.x}, y=${c.y})\n\n`;
				} else if (c.control_type === 'search') {
					code += `# ${c.id}\nsearch_${c.id} = ctk.CTkEntry(root, width=${c.width}, height=${c.height}, placeholder_text="${c.placeholder || 'Search...'}")\nsearch_${c.id}.place(x=${c.x}, y=${c.y})\n\n`;
				} else if (c.control_type === 'password') {
					code += `# ${c.id}\npass_${c.id} = ctk.CTkEntry(root, width=${c.width}, height=${c.height}, show="*")\npass_${c.id}.place(x=${c.x}, y=${c.y})\n\n`;
				} else if (c.control_type === 'checkbox') {
					code += `# ${c.id}\nchk_${c.id} = ctk.CTkCheckBox(root, text="${c.text || ''}")\nchk_${c.id}.place(x=${c.x}, y=${c.y})\n\n`;
				} else if (c.control_type === 'switch' || c.control_type === 'form_switch') {
					code += `# ${c.id}\nsw_${c.id} = ctk.CTkSwitch(root, text="${c.text || ''}")\nsw_${c.id}.place(x=${c.x}, y=${c.y})\n\n`;
				} else if (c.control_type === 'slider' || c.control_type === 'form_slider') {
					code += `# ${c.id}\nslider_${c.id} = ctk.CTkSlider(root, from_=0, to=100)\nslider_${c.id}.place(x=${c.x}, y=${c.y})\n\n`;
				} else if (c.control_type === 'segmented_control') {
					code += `# ${c.id}\nseg_${c.id} = ctk.CTkSegmentedButton(root, values=["Overview", "Analytics", "Reports"])\nseg_${c.id}.place(x=${c.x}, y=${c.y})\n\n`;
				} else if (c.control_type === 'stat_chart' || c.control_type === 'toast_card' || c.control_type === 'accordion') {
					code += `# ${c.id}\nframe_${c.id} = ctk.CTkFrame(root, width=${c.width}, height=${c.height})\nframe_${c.id}.place(x=${c.x}, y=${c.y})\nctk.CTkLabel(frame_${c.id}, text="${c.text || c.id}").pack(padx=10, pady=10)\n\n`;
				} else {
					code += `# ${c.id}\nwidget_${c.id} = ctk.CTkLabel(root, text="${c.text || c.id}")\nwidget_${c.id}.place(x=${c.x}, y=${c.y})\n\n`;
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
