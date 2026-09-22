var PaperLoopLiteratureMentions = {
	version: "0.5.1",
	pluginID: "paperloop-doi-bridge@paperloop.app",
	graphEndpointPath: "/connector/paperloop/literature-graph",
	stateEndpointPath: "/connector/paperloop/literature-mention-state",
	mentionTitle: "PaperLoop 文献提及",
	initialCandidateLimit: 50,
	maxQueryLength: 80,
	scanIntervalMS: 750,
	catalogTTLMS: 30000,
	bindings: new Set(),
	pendingEditors: new WeakSet(),
	_catalog: null,
	_catalogUpdatedAt: 0,
	_collectionOptions: [],
	_scanTimer: null,
	rootURI: "",
	diagnostic: {
		registered: false,
		attempts: 0,
		successes: 0,
		failures: 0,
		last: null,
		catalog: null,
		collectionUI: {
			renderedButtons: 0,
			pointerAttempts: 0,
			selections: 0
		}
	},

	register(pluginID, rootURI) {
		if (this._scanTimer) return;
		this.pluginID = pluginID || this.pluginID;
		this.rootURI = rootURI || this.rootURI;
		PaperLoopZoteroCompat.registerEndpoint(this.graphEndpointPath, this.GraphEndpoint);
		PaperLoopZoteroCompat.registerEndpoint(this.stateEndpointPath, this.StateEndpoint);
		this.diagnostic.registered = true;
		this._scanTimer = setInterval(() => {
			this.scanEditors().catch(() => this.log("editor-scan-failed"));
		}, this.scanIntervalMS);
		this.scanEditors().catch(() => this.log("editor-scan-failed"));
		this.getCatalog(true).catch(() => {
			this.diagnostic.catalog = {
				at: new Date().toISOString(), librariesScanned: 0,
				apiCollections: 0, dbCollections: 0, associations: 0,
				options: 0, source: "none", errorCode: "CATALOG_BUILD_FAILED"
			};
		});
		this.log("registered");
	},

	unregister() {
		if (this._scanTimer) {
			clearInterval(this._scanTimer);
			this._scanTimer = null;
		}
		for (const binding of Array.from(this.bindings)) {
			this.detachEditor(binding);
		}
		PaperLoopZoteroCompat.unregisterEndpoint(this.graphEndpointPath, this.GraphEndpoint);
		PaperLoopZoteroCompat.unregisterEndpoint(this.stateEndpointPath, this.StateEndpoint);
		this._catalog = null;
		this._catalogUpdatedAt = 0;
		this._collectionOptions = [];
		this.diagnostic.registered = false;
		this.log("unregistered");
	},

	log(message) {
		Zotero.debug(`PaperLoop Literature Mentions: ${message}`);
	},

	normalize(value) {
		let text = String(value || "");
		if (typeof text.normalize === "function") text = text.normalize("NFKC");
		return text.toLocaleLowerCase().replace(/\s+/g, " ").trim();
	},

	escapeHTML(value) {
		return String(value || "")
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;")
			.replace(/'/g, "&#39;");
	},

	async scanEditors() {
		const editors = Zotero.Notes && Array.isArray(Zotero.Notes._editorInstances)
			? Zotero.Notes._editorInstances
			: [];
		for (const editor of editors) {
			if (!editor || this.pendingEditors.has(editor)
					|| Array.from(this.bindings).some(binding => binding.editor === editor)) {
				continue;
			}
			this.pendingEditors.add(editor);
			try {
				await this.attachEditor(editor);
			}
			finally {
				this.pendingEditors.delete(editor);
			}
		}
	},

	async attachEditor(editor) {
		if (editor._initPromise) await editor._initPromise;
		if (!editor._item || typeof editor._item.isNote !== "function" || !editor._item.isNote()) {
			return null;
		}
		const rawWindow = editor._iframeWindow;
		const win = rawWindow && (rawWindow.wrappedJSObject || rawWindow);
		const doc = win && win.document;
		const root = doc && doc.querySelector(".primary-editor");
		if (!root) return null;
		this.ensureEditorHelper(rawWindow, win);

		const binding = {
			editor,
			win,
			doc,
			root,
			popup: null,
			formatPopup: null,
			style: null,
			candidates: [],
			query: "",
			searchQuery: "",
			selectedCollection: "",
			availableCollections: [],
			hasUnfiledItems: false,
			mentionContext: null,
			excludedItemID: 0,
			popupAnchorRect: null,
			visibleCount: this.initialCandidateLimit,
			formatSelection: null,
			selectedIndex: 0,
			requestToken: 0,
			updateTimer: null,
			panelSearchTimer: null,
			searchComposing: false
		};
		binding.onInput = () => {
			this.hideFormatPopup(binding);
			this.scheduleSuggestions(binding);
		};
		binding.onKeyDown = event => this.handleKeyDown(binding, event);
		binding.onKeyUp = event => {
			if (event.shiftKey || ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
				this.scheduleFormatPopup(binding);
			}
		};
		binding.onMouseUp = event => {
			if (event.button === 0) this.scheduleFormatPopup(binding);
		};
		binding.onClick = event => this.handleEditorClick(binding, event);
		binding.onDocumentMouseDown = event => {
			if (binding.formatPopup && !binding.formatPopup.hidden
					&& !binding.formatPopup.contains(event.target)) {
				this.hideFormatPopup(binding);
			}
			if (binding.popup && !binding.popup.hidden
					&& !binding.popup.contains(event.target) && !binding.root.contains(event.target)) {
				this.hidePopup(binding);
			}
		};
		root.addEventListener("input", binding.onInput, true);
		root.addEventListener("keydown", binding.onKeyDown, true);
		root.addEventListener("keyup", binding.onKeyUp, true);
		root.addEventListener("mouseup", binding.onMouseUp, true);
		root.addEventListener("click", binding.onClick, false);
		doc.addEventListener("mousedown", binding.onDocumentMouseDown, true);
		this.bindings.add(binding);
		return binding;
	},

	detachEditor(binding) {
		if (!binding) return;
		if (binding.updateTimer) clearTimeout(binding.updateTimer);
		if (binding.panelSearchTimer) clearTimeout(binding.panelSearchTimer);
		try {
			binding.root.removeEventListener("input", binding.onInput, true);
			binding.root.removeEventListener("keydown", binding.onKeyDown, true);
			binding.root.removeEventListener("keyup", binding.onKeyUp, true);
			binding.root.removeEventListener("mouseup", binding.onMouseUp, true);
			binding.root.removeEventListener("click", binding.onClick, false);
			binding.doc.removeEventListener("mousedown", binding.onDocumentMouseDown, true);
			if (binding.popup) binding.popup.remove();
			if (binding.formatPopup) binding.formatPopup.remove();
			if (binding.style) binding.style.remove();
		}
		catch (error) {
			this.log("editor-detach-failed");
		}
		this.bindings.delete(binding);
	},

	getEditorCore(editor) {
		const rawWindow = editor && editor._iframeWindow;
		const win = rawWindow && (rawWindow.wrappedJSObject || rawWindow);
		return win && win._currentEditorInstance && win._currentEditorInstance._editorCore;
	},

	ensureEditorHelper(rawWindow, win) {
		if (!win || win.PaperLoopEditorHelper) return true;
		if (!this.rootURI || typeof PaperLoopZoteroCompat === "undefined") return false;
		try {
			PaperLoopZoteroCompat.loadSubScript(this.rootURI + "editor-helper.js", win);
			return !!win.PaperLoopEditorHelper;
		}
		catch (error) {
			this.recordDiagnostic("failure", null, null, "EDITOR_HELPER_INJECTION_FAILED", "attach");
			return false;
		}
	},

	recordDiagnostic(kind, binding, candidate, errorCode = "", stage = "") {
		if (kind === "attempt") this.diagnostic.attempts++;
		if (kind === "success") this.diagnostic.successes++;
		if (kind === "failure") this.diagnostic.failures++;
		const note = binding && binding.editor && binding.editor._item;
		this.diagnostic.last = {
			at: new Date().toISOString(),
			kind,
			stage: String(stage || "").replace(/[^a-z0-9_-]/gi, "").slice(0, 32),
			errorCode: String(errorCode || "").replace(/[^A-Z0-9_]/g, "").slice(0, 48),
			noteKey: note && note.key || "",
			targetItemKey: candidate && candidate.itemKey || ""
		};
	},

	getDiagnosticState() {
		return {
			version: this.version,
			registered: this.diagnostic.registered,
			attempts: this.diagnostic.attempts,
			successes: this.diagnostic.successes,
			failures: this.diagnostic.failures,
			last: this.diagnostic.last ? { ...this.diagnostic.last } : null,
			catalog: this.diagnostic.catalog ? { ...this.diagnostic.catalog } : null,
			collectionUI: { ...this.diagnostic.collectionUI }
		};
	},

	handleEditorClick(binding, event) {
		const target = event && event.target;
		const mentionLink = target && typeof target.closest === "function"
			? target.closest("a[href]")
			: null;
		const mentionHref = mentionLink && mentionLink.getAttribute("title") === this.mentionTitle
			? String(mentionLink.getAttribute("href") || "")
			: "";
		if (/^zotero:\/\/select\//i.test(mentionHref) && this.canOpenMentionURI(binding)) {
			event.preventDefault();
			event.stopPropagation();
			this.openMentionURI(binding, mentionHref).catch(() => {});
			return true;
		}
		const source = target && typeof target.closest === "function"
			? target.closest(".highlight")
			: null;
		if (!source || !String(source.textContent || "").trim().startsWith("↩ 返回原文")) {
			return false;
		}
		setTimeout(() => {
			const core = this.getEditorCore(binding.editor);
			const popup = core && core.pluginState && core.pluginState.highlight
				&& core.pluginState.highlight.popup;
			if (popup && popup.active && typeof popup.open === "function") {
				popup.open();
				return;
			}
			const annotation = this.getSourceAnnotation(core, source);
			const editorInstance = binding.win && binding.win._currentEditorInstance;
			if (annotation && annotation.attachmentURI && annotation.position
					&& editorInstance && typeof editorInstance._postMessage === "function") {
				editorInstance._postMessage({
					action: "openAnnotation",
					attachmentURI: annotation.attachmentURI,
					position: annotation.position
				});
			}
		}, 0);
		return true;
	},

	canOpenMentionURI(binding) {
		const editorInstance = binding && binding.win && binding.win._currentEditorInstance;
		if (editorInstance && typeof editorInstance._postMessage === "function") return true;
		const pane = Zotero.getActiveZoteroPane && Zotero.getActiveZoteroPane();
		return !!(pane && typeof pane.loadURI === "function");
	},

	async openMentionURI(binding, selectURI) {
		let targetURI = String(selectURI || "");
		const catalog = await this.getCatalog();
		const entry = catalog.find(value => value.selectURI === targetURI);
		if (entry && entry.linkURI) targetURI = entry.linkURI;
		const editorInstance = binding && binding.win && binding.win._currentEditorInstance;
		if (editorInstance && typeof editorInstance._postMessage === "function") {
			editorInstance._postMessage({ action: "openURL", url: targetURI });
			return true;
		}
		const pane = Zotero.getActiveZoteroPane && Zotero.getActiveZoteroPane();
		if (pane && typeof pane.loadURI === "function") {
			pane.loadURI(targetURI);
			return true;
		}
		return false;
	},

	getSourceAnnotation(core, source) {
		const view = core && core.view;
		const state = view && view.state;
		if (!state || !state.doc || typeof state.doc.resolve !== "function"
				|| !view || typeof view.posAtDOM !== "function") {
			return null;
		}
		let domPos;
		try {
			domPos = view.posAtDOM(source, 0);
		}
		catch (error) {
			return null;
		}
		const maxPos = state.doc.content && Number.isInteger(state.doc.content.size)
			? state.doc.content.size
			: domPos + 1;
		for (const rawPos of [domPos, domPos + 1, domPos - 1]) {
			const pos = Math.max(0, Math.min(rawPos, maxPos));
			let resolved;
			try {
				resolved = state.doc.resolve(pos);
			}
			catch (error) {
				continue;
			}
			for (let depth = resolved.depth; depth >= 0; depth--) {
				const node = resolved.node(depth);
				if (node && ["highlight", "underline_annotation"].includes(node.type && node.type.name)
						&& node.attrs && node.attrs.annotation) {
					return node.attrs.annotation;
				}
			}
			const adjacent = typeof state.doc.nodeAt === "function" ? state.doc.nodeAt(pos) : null;
			if (adjacent && ["highlight", "underline_annotation"].includes(adjacent.type && adjacent.type.name)
					&& adjacent.attrs && adjacent.attrs.annotation) {
				return adjacent.attrs.annotation;
			}
		}
		return null;
	},

	getMentionContext(core) {
		const state = core && core.view && core.view.state;
		const selection = state && state.selection;
		if (!selection || !selection.empty || !selection.$from || !selection.$from.parent) {
			return null;
		}
		const parentOffset = selection.$from.parentOffset;
		const textBefore = selection.$from.parent.textBetween(0, parentOffset, "\n", "\uFFFC");
		const atIndex = textBefore.lastIndexOf("@");
		if (atIndex < 0) return null;
		const query = textBefore.slice(atIndex + 1);
		if (query.length > this.maxQueryLength || /[\r\n@]/.test(query)) return null;
		return {
			query,
			sourceText: `@${query}`,
			from: selection.from - query.length - 1,
			to: selection.from
		};
	},

	scheduleSuggestions(binding) {
		if (binding.updateTimer) clearTimeout(binding.updateTimer);
		binding.updateTimer = setTimeout(() => {
			binding.updateTimer = null;
			this.refreshSuggestions(binding).catch(() => this.hidePopup(binding));
		}, 60);
	},

	async refreshSuggestions(binding) {
		const core = this.getEditorCore(binding.editor);
		const context = this.getMentionContext(core);
		if (!context) {
			this.hidePopup(binding);
			return;
		}
		const requestToken = ++binding.requestToken;
		const excludedItemID = binding.editor._item.parentItemID || binding.editor._item.parentID || 0;
		const [candidates, collectionState] = await Promise.all([
			this.searchCandidates(context.query, excludedItemID),
			this.getCollectionFilterState(excludedItemID)
		]);
		if (requestToken !== binding.requestToken) return;
		binding.candidates = candidates;
		binding.query = context.query;
		binding.searchQuery = context.query;
		binding.selectedCollection = "";
		binding.availableCollections = collectionState.names;
		binding.hasUnfiledItems = collectionState.hasUnfiledItems;
		binding.mentionContext = context;
		binding.excludedItemID = excludedItemID;
		binding.popupAnchorRect = null;
		binding.visibleCount = this.initialCandidateLimit;
		binding.selectedIndex = 0;
		this.renderPopup(binding);
	},

	schedulePanelSearch(binding, focusControl) {
		if (binding.panelSearchTimer) clearTimeout(binding.panelSearchTimer);
		binding.panelSearchTimer = setTimeout(() => {
			binding.panelSearchTimer = null;
			this.refreshPanelCandidates(binding, focusControl).catch(() => this.hidePopup(binding));
		}, 80);
	},

	async refreshPanelCandidates(binding, focusControl = "") {
		if (!binding.mentionContext) return;
		const requestToken = ++binding.requestToken;
		const candidates = await this.searchCandidates(
			binding.searchQuery,
			binding.excludedItemID,
			binding.selectedCollection
		);
		if (requestToken !== binding.requestToken) return;
		binding.candidates = candidates;
		binding.visibleCount = this.initialCandidateLimit;
		binding.selectedIndex = 0;
		this.renderPopup(binding, focusControl);
	},

	scheduleFormatPopup(binding) {
		setTimeout(() => this.refreshFormatPopup(binding), 0);
	},

	refreshFormatPopup(binding) {
		const helper = binding.win && binding.win.PaperLoopEditorHelper;
		if (!helper || typeof helper.getSelectionStateJSON !== "function") {
			this.hideFormatPopup(binding);
			return;
		}
		let result;
		try {
			result = JSON.parse(helper.getSelectionStateJSON());
		}
		catch (error) {
			result = null;
		}
		if (!result || !result.ok || result.empty || !Number.isInteger(result.from)
				|| !Number.isInteger(result.to) || result.from >= result.to) {
			this.hideFormatPopup(binding);
			return;
		}
		binding.formatSelection = { from: result.from, to: result.to };
		this.renderFormatPopup(binding);
	},

	ensurePopup(binding) {
		if (binding.popup) return binding.popup;
		const style = binding.doc.createElement("style");
		style.textContent = `
			.paperloop-mention-popup { --pl-bg: #ffffff; --pl-text: #17202a; --pl-muted: #667085; --pl-border: #d6dae1; --pl-hover: #f2f5f9; --pl-selected: #e7f0ff; --pl-accent: #2563eb; position: fixed; z-index: 2147483000; width: min(620px, calc(100vw - 24px)); max-height: min(430px, calc(100vh - 24px)); overflow: auto; padding: 8px; border: 1px solid var(--pl-border); border-radius: 10px; background: var(--pl-bg); color: var(--pl-text); box-shadow: 0 12px 36px rgba(15,23,42,.22); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
			.paperloop-mention-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; padding: 4px 7px 8px; color: var(--pl-muted); font-size: 12px; font-weight: 600; }
			.paperloop-mention-heading { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
			.paperloop-mention-query { color: var(--pl-text); overflow-wrap: anywhere; }
			.paperloop-mention-hint { font-weight: 400; }
			.paperloop-mention-count { flex: none; white-space: nowrap; }
			.paperloop-mention-controls { display: flex; flex-direction: column; gap: 7px; padding: 0 7px 8px; }
			.paperloop-mention-search { box-sizing: border-box; width: 100%; min-height: 32px; border: 1px solid var(--pl-border); border-radius: 7px; background: var(--pl-bg); color: var(--pl-text); font: 12.5px/1.3 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; outline: none; }
			.paperloop-mention-search { padding: 6px 10px; }
			.paperloop-mention-search:focus { border-color: var(--pl-accent); box-shadow: 0 0 0 2px color-mix(in srgb, var(--pl-accent) 20%, transparent); }
			.paperloop-mention-collection-row { display: flex; align-items: flex-start; gap: 7px; }
			.paperloop-mention-collection-label { flex: none; padding-top: 5px; color: var(--pl-muted); font-size: 11px; font-weight: 600; }
			.paperloop-mention-collection-picker { display: flex; flex: 1; flex-wrap: wrap; gap: 5px; max-height: 88px; overflow: auto; padding: 1px; }
			.paperloop-mention-collection-button { max-width: 100%; padding: 4px 8px; border: 1px solid var(--pl-border); border-radius: 999px; background: var(--pl-bg); color: var(--pl-text); cursor: pointer; font: 11.5px/1.25 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; overflow-wrap: anywhere; }
			.paperloop-mention-collection-button:hover { background: var(--pl-hover); }
			.paperloop-mention-collection-button:focus-visible { outline: 2px solid var(--pl-accent); outline-offset: 1px; }
			.paperloop-mention-collection-button[aria-pressed="true"] { border-color: var(--pl-accent); background: var(--pl-selected); color: var(--pl-text); font-weight: 650; }
			.paperloop-mention-option { display: block; width: 100%; margin: 2px 0; padding: 9px 10px; border: 1px solid transparent; border-radius: 7px; background: transparent; color: inherit; text-align: left; cursor: pointer; }
			.paperloop-mention-option:hover { background: var(--pl-hover); }
			.paperloop-mention-option[aria-selected="true"] { border-color: #b7cff7; background: var(--pl-selected); box-shadow: inset 3px 0 0 var(--pl-accent); }
			.paperloop-mention-title { display: block; color: var(--pl-text); font-size: 13.5px; font-weight: 650; line-height: 1.4; white-space: normal; overflow-wrap: anywhere; }
			.paperloop-mention-meta { display: flex; flex-wrap: wrap; gap: 5px 9px; align-items: center; margin-top: 5px; color: var(--pl-muted); font-size: 12px; line-height: 1.3; }
			.paperloop-mention-library, .paperloop-mention-collection { padding: 1px 6px; border: 1px solid var(--pl-border); border-radius: 999px; background: var(--pl-hover); }
			.paperloop-mention-target { padding: 1px 6px; border: 1px solid var(--pl-border); border-radius: 999px; background: var(--pl-hover); color: var(--pl-text); }
			.paperloop-mention-collection::before { content: "分类 · "; color: var(--pl-muted); }
			.paperloop-mention-empty { padding: 16px 10px; color: var(--pl-muted); font-size: 13px; text-align: center; }
			.paperloop-mention-more { display: block; width: calc(100% - 8px); margin: 7px 4px 2px; padding: 8px; border: 1px solid var(--pl-border); border-radius: 7px; background: var(--pl-hover); color: var(--pl-text); cursor: pointer; font-size: 12px; font-weight: 600; }
			.paperloop-mention-error { margin: 7px 4px 3px; padding: 7px 9px; border-radius: 6px; background: #fff1f0; color: #b42318; font-size: 12px; line-height: 1.4; }
			.paperloop-format-popup { --pl-format-bg: #ffffff; --pl-format-text: #17202a; --pl-format-muted: #667085; --pl-format-border: #d6dae1; position: fixed; z-index: 2147483001; display: flex; align-items: center; gap: 7px; max-width: calc(100vw - 16px); padding: 7px 9px; border: 1px solid var(--pl-format-border); border-radius: 9px; background: var(--pl-format-bg); color: var(--pl-format-text); box-shadow: 0 8px 26px rgba(15,23,42,.2); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
			.paperloop-format-popup[hidden] { display: none; }
			.paperloop-format-group { display: flex; align-items: center; gap: 4px; }
			.paperloop-format-label { margin-right: 1px; color: var(--pl-format-muted); font-size: 11px; white-space: nowrap; }
			.paperloop-format-swatch { width: 22px; height: 22px; padding: 0; border: 1px solid var(--pl-format-border); border-radius: 50%; background: var(--pl-swatch); cursor: pointer; box-shadow: inset 0 0 0 2px rgba(255,255,255,.72); }
			.paperloop-format-swatch:hover { outline: 2px solid #7aa7ee; outline-offset: 1px; }
			.paperloop-format-clear { padding: 3px 7px; border: 1px solid var(--pl-format-border); border-radius: 6px; background: transparent; color: var(--pl-format-text); cursor: pointer; font-size: 11px; white-space: nowrap; }
			.paperloop-format-divider { width: 1px; height: 20px; background: var(--pl-format-border); }
			@media (prefers-color-scheme: dark) { .paperloop-mention-popup { --pl-bg: #22262d; --pl-text: #f2f4f7; --pl-muted: #aeb7c4; --pl-border: #46505e; --pl-hover: #2d333d; --pl-selected: #243b60; --pl-accent: #79aaff; box-shadow: 0 12px 36px rgba(0,0,0,.5); } .paperloop-mention-option[aria-selected="true"] { border-color: #526f99; } .paperloop-mention-error { background: #4a2525; color: #ffb4ab; } .paperloop-format-popup { --pl-format-bg: #22262d; --pl-format-text: #f2f4f7; --pl-format-muted: #aeb7c4; --pl-format-border: #46505e; box-shadow: 0 8px 26px rgba(0,0,0,.5); } }
		`;
		binding.doc.head.append(style);
		const popup = binding.doc.createElement("div");
		popup.className = "paperloop-mention-popup";
		popup.setAttribute("role", "dialog");
		popup.setAttribute("aria-label", "PaperLoop 文献搜索与分类筛选");
		popup.hidden = true;
		binding.doc.body.append(popup);
		binding.style = style;
		binding.popup = popup;
		return popup;
	},

	positionPopup(binding) {
		const popup = binding.popup;
		let rect = binding.popupAnchorRect;
		if (!rect) {
			try {
				const selection = binding.win.getSelection();
				if (selection && selection.rangeCount) rect = selection.getRangeAt(0).getBoundingClientRect();
			}
			catch (error) {}
			if (rect && (rect.width || rect.height)) binding.popupAnchorRect = rect;
		}
		if (!rect || (!rect.width && !rect.height)) rect = binding.root.getBoundingClientRect();
		const viewportWidth = binding.win.innerWidth || binding.doc.documentElement.clientWidth || 800;
		const left = Math.max(8, Math.min(rect.left, viewportWidth - 528));
		const viewportHeight = binding.win.innerHeight || binding.doc.documentElement.clientHeight || 600;
		const estimatedHeight = Math.min(430, Math.max(150, binding.candidates.length * 64 + 44));
		const top = rect.bottom + 6 + estimatedHeight <= viewportHeight
			? rect.bottom + 6
			: Math.max(8, rect.top - estimatedHeight - 6);
		popup.style.left = `${left}px`;
		popup.style.top = `${top}px`;
	},

	renderPopup(binding, focusControl = "") {
		const popup = this.ensurePopup(binding);
		const visibleCandidates = binding.candidates.slice(0, binding.visibleCount || this.initialCandidateLimit);
		const collectionChoices = [
			{ value: "", label: "全部分类" },
			...(binding.availableCollections || []).map(name => ({ value: name, label: name })),
			...(binding.hasUnfiledItems
				? [{ value: "__paperloop_unfiled__", label: "未分类" }]
				: [])
		];
		const collectionSignature = JSON.stringify(collectionChoices.map(choice => choice.value));
		let search = popup.querySelector(".paperloop-mention-search");
		let collectionPicker = popup.querySelector(".paperloop-mention-collection-picker");
		let results = popup.querySelector(".paperloop-mention-results");
		if (!search || !collectionPicker || !results
				|| collectionPicker.dataset.signature !== collectionSignature) {
			popup.textContent = "";
			const header = binding.doc.createElement("div");
			header.className = "paperloop-mention-header";
			const heading = binding.doc.createElement("span");
			heading.className = "paperloop-mention-heading";
			const query = binding.doc.createElement("span");
			query.className = "paperloop-mention-query";
			query.textContent = "选择要引用的文献";
			const hint = binding.doc.createElement("span");
			hint.className = "paperloop-mention-hint";
			hint.textContent = "在搜索框输入关键词，或从右侧选择分类";
			heading.append(query, hint);
			const count = binding.doc.createElement("span");
			count.className = "paperloop-mention-count";
			header.append(heading, count);
			popup.append(header);

			const controls = binding.doc.createElement("div");
			controls.className = "paperloop-mention-controls";
			search = binding.doc.createElement("input");
			search.type = "search";
			search.className = "paperloop-mention-search";
			search.setAttribute("aria-label", "搜索文献");
			search.placeholder = "搜索题名、作者、年份、DOI、文库或分类";
			search.value = binding.searchQuery || "";
			search.addEventListener("mousedown", event => event.stopPropagation());
			search.addEventListener("click", event => event.stopPropagation());
			search.addEventListener("compositionstart", event => {
				event.stopPropagation();
				binding.searchComposing = true;
				if (binding.panelSearchTimer) {
					clearTimeout(binding.panelSearchTimer);
					binding.panelSearchTimer = null;
				}
			});
			search.addEventListener("compositionend", event => {
				event.stopPropagation();
				binding.searchComposing = false;
				binding.searchQuery = search.value;
				this.schedulePanelSearch(binding, "search");
			});
			search.addEventListener("keydown", event => {
				event.stopPropagation();
				if (binding.searchComposing || event.isComposing || event.keyCode === 229) return;
				if (event.key === "Escape") {
					event.preventDefault();
					this.hidePopup(binding);
					const core = this.getEditorCore(binding.editor);
					if (core && core.view && typeof core.view.focus === "function") core.view.focus();
				}
				else if (event.key === "Enter" && binding.candidates.length) {
					event.preventDefault();
					this.selectCandidate(binding, binding.candidates[binding.selectedIndex] || binding.candidates[0], "search-enter");
				}
			});
			search.addEventListener("input", () => {
				binding.searchQuery = search.value;
				if (!binding.searchComposing) this.schedulePanelSearch(binding, "search");
			});

			const collectionRow = binding.doc.createElement("div");
			collectionRow.className = "paperloop-mention-collection-row";
			const collectionLabel = binding.doc.createElement("span");
			collectionLabel.className = "paperloop-mention-collection-label";
			collectionLabel.textContent = "分类";
			collectionPicker = binding.doc.createElement("div");
			collectionPicker.className = "paperloop-mention-collection-picker";
			collectionPicker.setAttribute("role", "group");
			collectionPicker.setAttribute("aria-label", "按 Zotero 分类筛选");
			collectionPicker.dataset.signature = collectionSignature;
			for (const choice of collectionChoices) {
				const button = binding.doc.createElement("button");
				button.type = "button";
				button.className = "paperloop-mention-collection-button";
				button.dataset.collectionValue = choice.value;
				button.textContent = choice.label;
				button.setAttribute("aria-pressed", choice.value === (binding.selectedCollection || "") ? "true" : "false");
				button.addEventListener("mousedown", event => {
					event.preventDefault();
					event.stopPropagation();
					this.diagnostic.collectionUI.pointerAttempts++;
					this.selectCollectionFilter(binding, choice.value, "pointer");
				});
				button.addEventListener("click", event => {
					event.preventDefault();
					event.stopPropagation();
				});
				button.addEventListener("keydown", event => {
					event.stopPropagation();
					if (event.key === "Enter" || event.key === " ") {
						event.preventDefault();
						this.selectCollectionFilter(binding, choice.value, "keyboard");
					}
				});
				collectionPicker.append(button);
			}
			this.diagnostic.collectionUI.renderedButtons = collectionChoices.length;
			collectionRow.append(collectionLabel, collectionPicker);
			controls.append(search, collectionRow);
			popup.append(controls);
			results = binding.doc.createElement("div");
			results.className = "paperloop-mention-results";
			popup.append(results);
		}
		if (binding.doc.activeElement !== search && !binding.searchComposing
				&& search.value !== (binding.searchQuery || "")) {
			search.value = binding.searchQuery || "";
		}
		for (const button of collectionPicker.querySelectorAll(".paperloop-mention-collection-button")) {
			button.setAttribute("aria-pressed",
				button.dataset.collectionValue === (binding.selectedCollection || "") ? "true" : "false");
		}
		const count = popup.querySelector(".paperloop-mention-count");
		if (count) count.textContent = `已显示 ${visibleCandidates.length} / 共 ${binding.candidates.length} 条`;
		results.textContent = "";
		visibleCandidates.forEach((candidate, index) => {
			const button = binding.doc.createElement("button");
			button.type = "button";
			button.className = "paperloop-mention-option";
			button.setAttribute("role", "option");
			button.setAttribute("aria-selected", index === binding.selectedIndex ? "true" : "false");
			button.setAttribute("aria-label", candidate.label);
			const title = binding.doc.createElement("span");
			title.className = "paperloop-mention-title";
			title.textContent = candidate.title || "未命名文献";
			button.append(title);
			const meta = binding.doc.createElement("span");
			meta.className = "paperloop-mention-meta";
			const identity = binding.doc.createElement("span");
			identity.textContent = [candidate.creator, candidate.year].filter(Boolean).join(" · ") || "作者与年份未知";
			meta.append(identity);
			if (candidate.libraryName) {
				const library = binding.doc.createElement("span");
				library.className = "paperloop-mention-library";
				library.textContent = candidate.libraryName;
				meta.append(library);
			}
			const target = binding.doc.createElement("span");
			target.className = "paperloop-mention-target";
			target.textContent = candidate.hasPDF ? "点击打开 PDF" : "无 PDF · 定位条目";
			meta.append(target);
			for (const collectionName of candidate.collectionNames || []) {
				const collection = binding.doc.createElement("span");
				collection.className = "paperloop-mention-collection";
				collection.textContent = collectionName;
				meta.append(collection);
			}
			button.append(meta);
			button.addEventListener("mousedown", event => {
				event.preventDefault();
				event.stopPropagation();
				this.selectCandidate(binding, candidate, "mouse");
			});
			results.append(button);
		});
		if (!binding.candidates.length) {
			const empty = binding.doc.createElement("div");
			empty.className = "paperloop-mention-empty";
			empty.textContent = "没有匹配条目；请修改搜索词或选择其他分类";
			results.append(empty);
		}
		else if (visibleCandidates.length < binding.candidates.length) {
			const more = binding.doc.createElement("button");
			more.type = "button";
			more.className = "paperloop-mention-more";
			more.textContent = `加载更多（剩余 ${binding.candidates.length - visibleCandidates.length} 条）`;
			more.addEventListener("mousedown", event => {
				event.preventDefault();
				event.stopPropagation();
				binding.visibleCount += this.initialCandidateLimit;
				this.renderPopup(binding, "more");
			});
			results.append(more);
		}
		popup.hidden = false;
		this.positionPopup(binding);
		if (focusControl === "search" && binding.doc.activeElement !== search) {
			search.focus();
			search.setSelectionRange(search.value.length, search.value.length);
		}
		else if (focusControl === "collection") {
			const selectedButton = Array.from(collectionPicker.querySelectorAll(".paperloop-mention-collection-button"))
				.find(button => button.dataset.collectionValue === (binding.selectedCollection || ""));
			if (selectedButton && binding.doc.activeElement !== selectedButton) selectedButton.focus();
		}
	},

	selectCollectionFilter(binding, value, source = "") {
		binding.selectedCollection = String(value || "");
		this.diagnostic.collectionUI.selections++;
		for (const button of binding.popup.querySelectorAll(".paperloop-mention-collection-button")) {
			button.setAttribute("aria-pressed",
				button.dataset.collectionValue === binding.selectedCollection ? "true" : "false");
		}
		this.refreshPanelCandidates(binding, "collection").catch(() => this.hidePopup(binding));
		return source;
	},

	hidePopup(binding) {
		binding.requestToken++;
		binding.candidates = [];
		binding.query = "";
		binding.searchQuery = "";
		binding.selectedCollection = "";
		binding.availableCollections = [];
		binding.hasUnfiledItems = false;
		binding.mentionContext = null;
		binding.excludedItemID = 0;
		binding.popupAnchorRect = null;
		binding.visibleCount = this.initialCandidateLimit;
		binding.selectedIndex = 0;
		binding.searchComposing = false;
		if (binding.popup) binding.popup.hidden = true;
	},

	moveSelection(binding, delta) {
		const renderedCount = Math.min(binding.candidates.length, binding.visibleCount || this.initialCandidateLimit);
		if (!renderedCount) return;
		binding.selectedIndex = (
			binding.selectedIndex + delta + renderedCount
		) % renderedCount;
		const options = binding.popup.querySelectorAll(".paperloop-mention-option");
		options.forEach((option, index) => {
			option.setAttribute("aria-selected", index === binding.selectedIndex ? "true" : "false");
		});
		if (options[binding.selectedIndex]) options[binding.selectedIndex].scrollIntoView({ block: "nearest" });
	},

	ensureFormatPopup(binding) {
		if (binding.formatPopup) return binding.formatPopup;
		this.ensurePopup(binding);
		const popup = binding.doc.createElement("div");
		popup.className = "paperloop-format-popup";
		popup.setAttribute("role", "toolbar");
		popup.setAttribute("aria-label", "PaperLoop 文字颜色与背景填充");
		popup.hidden = true;
		binding.doc.body.append(popup);
		binding.formatPopup = popup;
		return popup;
	},

	renderFormatPopup(binding) {
		const popup = this.ensureFormatPopup(binding);
		popup.textContent = "";
		const palettes = [
			{ label: "文字", markName: "textColor", colors: ["#17202a", "#d32f2f", "#ef6c00", "#2e7d32", "#1565c0", "#7b1fa2"] },
			{ label: "填充", markName: "backgroundColor", colors: ["#fff59d", "#c8e6c9", "#bbdefb", "#ffcdd2", "#e1bee7"] }
		];
		for (const [groupIndex, palette] of palettes.entries()) {
			if (groupIndex) {
				const divider = binding.doc.createElement("span");
				divider.className = "paperloop-format-divider";
				popup.append(divider);
			}
			const group = binding.doc.createElement("span");
			group.className = "paperloop-format-group";
			const label = binding.doc.createElement("span");
			label.className = "paperloop-format-label";
			label.textContent = palette.label;
			group.append(label);
			for (const color of palette.colors) {
				const button = binding.doc.createElement("button");
				button.type = "button";
				button.className = "paperloop-format-swatch";
				button.style.setProperty("--pl-swatch", color);
				button.setAttribute("aria-label", `${palette.label} ${color}`);
				button.title = `${palette.label} ${color}`;
				button.addEventListener("mousedown", event => {
					event.preventDefault();
					event.stopPropagation();
					this.applySelectionFormat(binding, palette.markName, color);
				});
				group.append(button);
			}
			popup.append(group);
		}
		const divider = binding.doc.createElement("span");
		divider.className = "paperloop-format-divider";
		popup.append(divider);
		const clear = binding.doc.createElement("button");
		clear.type = "button";
		clear.className = "paperloop-format-clear";
		clear.textContent = "清除颜色";
		clear.addEventListener("mousedown", event => {
			event.preventDefault();
			event.stopPropagation();
			this.applySelectionFormat(binding, "clearColors", "");
		});
		popup.append(clear);
		popup.hidden = false;
		this.positionFormatPopup(binding);
	},

	positionFormatPopup(binding) {
		const popup = binding.formatPopup;
		let rect = null;
		try {
			const selection = binding.win.getSelection();
			if (selection && selection.rangeCount) rect = selection.getRangeAt(0).getBoundingClientRect();
		}
		catch (error) {}
		if (!rect) rect = binding.root.getBoundingClientRect();
		const viewportWidth = binding.win.innerWidth || binding.doc.documentElement.clientWidth || 800;
		const viewportHeight = binding.win.innerHeight || binding.doc.documentElement.clientHeight || 600;
		const width = Math.min(popup.offsetWidth || 520, viewportWidth - 16);
		popup.style.left = `${Math.max(8, Math.min(rect.left, viewportWidth - width - 8))}px`;
		popup.style.top = `${rect.top > 54 ? rect.top - 46 : Math.min(viewportHeight - 46, rect.bottom + 6)}px`;
	},

	applySelectionFormat(binding, markName, color) {
		const helper = binding.win && binding.win.PaperLoopEditorHelper;
		if (!helper || typeof helper.applyTextStyleJSON !== "function" || !binding.formatSelection) return false;
		let result;
		try {
			result = JSON.parse(helper.applyTextStyleJSON(JSON.stringify({
				...binding.formatSelection,
				markName,
				color
			})));
		}
		catch (error) {
			return false;
		}
		if (!result || !result.ok) return false;
		this.scheduleFormatPopup(binding);
		return true;
	},

	hideFormatPopup(binding) {
		binding.formatSelection = null;
		if (binding.formatPopup) binding.formatPopup.hidden = true;
	},

	handleKeyDown(binding, event) {
		if (!binding.popup || binding.popup.hidden || !binding.candidates.length
				|| event.isComposing || event.keyCode === 229) {
			return;
		}
		if (event.key === "ArrowDown" || event.key === "ArrowUp") {
			event.preventDefault();
			event.stopPropagation();
			this.moveSelection(binding, event.key === "ArrowDown" ? 1 : -1);
		}
		else if (event.key === "Enter") {
			event.preventDefault();
			event.stopPropagation();
			this.selectCandidate(binding, binding.candidates[binding.selectedIndex], "keyboard");
		}
		else if (event.key === "Escape") {
			event.preventDefault();
			event.stopPropagation();
			this.hidePopup(binding);
		}
	},

	selectCandidate(binding, candidate, stage) {
		this.recordDiagnostic("attempt", binding, candidate, "", stage);
		try {
			if (!this.insertMention(binding, candidate)) throw new Error("MENTION_INSERT_FAILED");
			this.recordDiagnostic("success", binding, candidate, "", stage);
			return true;
		}
		catch (error) {
			const code = String(error && error.message || "MENTION_INSERT_FAILED")
				.replace(/[^A-Z0-9_]/g, "").slice(0, 48) || "MENTION_INSERT_FAILED";
			this.recordDiagnostic("failure", binding, candidate, code, stage);
			this.showInsertionError(binding, code);
			return false;
		}
	},

	showInsertionError(binding, code) {
		if (!binding.popup) this.ensurePopup(binding);
		if (binding.candidates.length) this.renderPopup(binding);
		const error = binding.doc.createElement("div");
		error.className = "paperloop-mention-error";
		error.textContent = `未能插入文献，请继续输入后重试（${code}）`;
		binding.popup.append(error);
		binding.popup.hidden = false;
		this.positionPopup(binding);
	},

	insertMention(binding, candidate) {
		const core = this.getEditorCore(binding.editor);
		const state = core && core.view && core.view.state;
		let context = binding.mentionContext || null;
		if (state && context) {
			try {
				const actual = state.doc.textBetween(context.from, context.to, "\n", "\uFFFC");
				if (actual !== context.sourceText) context = null;
			}
			catch (error) {
				context = null;
			}
		}
		if (!context) context = this.getMentionContext(core);
		const linkType = state && state.schema && state.schema.marks.link;
		if (!state || !context || !linkType || !candidate) {
			throw new Error(!state ? "EDITOR_STATE_UNAVAILABLE"
				: !context ? "MENTION_CONTEXT_LOST"
					: !linkType ? "LINK_MARK_UNAVAILABLE" : "MENTION_PAYLOAD_INVALID");
		}
		const mentionURI = String(candidate.linkURI || candidate.selectURI || "");
		if (!mentionURI) throw new Error("MENTION_PAYLOAD_INVALID");
		const helper = binding.win && binding.win.PaperLoopEditorHelper;
		if (helper && typeof helper.insertMentionJSON === "function") {
			let result;
			try {
				result = JSON.parse(helper.insertMentionJSON(JSON.stringify({
					label: String(candidate.label || ""),
					selectURI: mentionURI,
					mentionTitle: this.mentionTitle,
					maxQueryLength: this.maxQueryLength,
					from: context.from,
					to: context.to,
					sourceText: context.sourceText || `@${context.query || ""}`
				})));
			}
			catch (error) {
				throw new Error("EDITOR_HELPER_CALL_FAILED");
			}
			if (!result || !result.ok) throw new Error(result && result.errorCode || "MENTION_DISPATCH_FAILED");
			this.hidePopup(binding);
			return true;
		}
		const mark = linkType.create({ href: mentionURI, title: this.mentionTitle });
		let contextMarks = [];
		try {
			const $context = state.doc.resolve(context.to);
			contextMarks = $context && typeof $context.marks === "function" ? $context.marks() : [];
		}
		catch (error) {
			contextMarks = state.selection.$from && typeof state.selection.$from.marks === "function"
				? state.selection.$from.marks() : [];
		}
		const cursorMarks = state.storedMarks || contextMarks;
		const inheritedMarks = Array.from(cursorMarks || []).filter(value =>
			value && value.type !== linkType && (!value.type || value.type.name !== "link")
		);
		const node = state.schema.text(candidate.label, [...inheritedMarks, mark]);
		let transaction = state.tr.replaceWith(context.from, context.to, node);
		const afterMention = context.from + node.nodeSize;
		transaction = transaction.insertText(" ", afterMention);
		transaction = transaction.scrollIntoView();
		core.view.dispatch(transaction);
		this.hidePopup(binding);
		return true;
	},

	buildSelectURI(item) {
		const itemURI = Zotero.URI.getItemURI(item);
		const groupMatch = String(itemURI || "").match(/\/groups\/(\d+)\/items\/([A-Z0-9]+)$/i);
		if (groupMatch) {
			return `zotero://select/groups/${groupMatch[1]}/items/${item.key}`;
		}
		return `zotero://select/library/items/${item.key}`;
	},

	buildOpenPDFURI(attachment) {
		const itemURI = Zotero.URI.getItemURI(attachment);
		const groupMatch = String(itemURI || "").match(/\/groups\/(\d+)\/items\/([A-Z0-9]+)$/i);
		if (groupMatch) {
			return `zotero://open-pdf/groups/${groupMatch[1]}/items/${attachment.key}`;
		}
		return `zotero://open-pdf/library/items/${attachment.key}`;
	},

	async getPDFAttachments(item) {
		let attachments = [];
		try {
			if (typeof item.getBestAttachments === "function") {
				attachments = await item.getBestAttachments() || [];
			}
			else if (typeof item.getAttachments === "function") {
				const ids = item.getAttachments() || [];
				attachments = ids.length ? await Zotero.Items.getAsync(ids) : [];
			}
		}
		catch (error) {
			this.log(`pdf-attachment-read-failed:${item && item.id || 0}:${error && error.name || "error"}`);
			return [];
		}
		return attachments.filter(attachment => attachment && !attachment.deleted
			&& typeof attachment.isPDFAttachment === "function" && attachment.isPDFAttachment());
	},

	collectionPath(collection, collectionsByID) {
		const names = [];
		const visited = new Set();
		let current = collection;
		while (current && !visited.has(current.id)) {
			visited.add(current.id);
			const name = String(current.name || "").trim();
			if (name) names.unshift(name);
			current = current.parentID
				? (collectionsByID.get(current.parentID)
					|| (Zotero.Collections && Zotero.Collections.get(current.parentID)))
				: null;
		}
		return names.join(" / ");
	},

	async getLibraryCollectionIndex(libraryID) {
		const byItemID = new Map();
		const names = new Set();
		const collectionsByID = new Map();
		if (!Zotero.Collections || typeof Zotero.Collections.getByLibrary !== "function") {
			const fallback = await this.getLibraryCollectionIndexFromDB(libraryID);
			return fallback || {
				byItemID, names, collectionsByID, complete: false,
				source: "none", collectionCount: 0, associationCount: 0,
				errorCode: "COLLECTIONS_API_UNAVAILABLE"
			};
		}

		let collections;
		try {
			if (typeof Zotero.Collections.loadAll === "function") {
				await Zotero.Collections.loadAll(libraryID);
			}
			collections = Zotero.Collections.getByLibrary(libraryID, true) || [];
		}
		catch (error) {
			this.log(`collection-directory-failed:${libraryID}:${error && error.name || "error"}`);
			const fallback = await this.getLibraryCollectionIndexFromDB(libraryID);
			return fallback || {
				byItemID, names, collectionsByID, complete: false,
				source: "none", collectionCount: 0, associationCount: 0,
				errorCode: "COLLECTIONS_LOAD_FAILED"
			};
		}
		if (!collections.length) {
			const fallback = await this.getLibraryCollectionIndexFromDB(libraryID);
			if (fallback && fallback.collectionCount) return fallback;
		}
		for (const collection of collections) {
			if (collection && collection.id) collectionsByID.set(collection.id, collection);
		}

		let complete = true;
		let associationCount = 0;
		for (const collection of collections) {
			if (!collection || !collection.id) continue;
			const path = this.collectionPath(collection, collectionsByID);
			if (path) names.add(path);
			try {
				if (typeof collection.loadDataType === "function") {
					await collection.loadDataType("childItems");
				}
				const childItemIDs = typeof collection.getChildItems === "function"
					? (collection.getChildItems(true) || [])
					: [];
				for (const itemID of childItemIDs) {
					const itemNames = byItemID.get(itemID) || [];
					if (path && !itemNames.includes(path)) itemNames.push(path);
					byItemID.set(itemID, itemNames);
					associationCount++;
				}
			}
			catch (error) {
				complete = false;
				this.log(`collection-items-failed:${collection.id}:${error && error.name || "error"}`);
			}
		}
		if (!complete) {
			const fallback = await this.getLibraryCollectionIndexFromDB(libraryID);
			if (fallback) return fallback;
		}
		return {
			byItemID, names, collectionsByID, complete,
			source: "api", collectionCount: collectionsByID.size, associationCount,
			errorCode: complete ? "" : "COLLECTIONS_ITEMS_FAILED"
		};
	},

	async getLibraryCollectionIndexFromDB(libraryID) {
		if (!Zotero.DB || typeof Zotero.DB.queryAsync !== "function") return null;
		try {
			const rows = await Zotero.DB.queryAsync(
				"SELECT C.collectionID AS collectionID, C.collectionName AS collectionName, "
					+ "C.parentCollectionID AS parentCollectionID, CI.itemID AS itemID "
					+ "FROM collections C "
					+ "LEFT JOIN deletedCollections DC ON DC.collectionID=C.collectionID "
					+ "LEFT JOIN collectionItems CI ON CI.collectionID=C.collectionID "
					+ "WHERE C.libraryID=? AND DC.collectionID IS NULL "
					+ "ORDER BY C.collectionID",
				[libraryID]
			) || [];
			const collectionsByID = new Map();
			for (const row of rows) {
				const id = Number(row.collectionID);
				if (!id || collectionsByID.has(id)) continue;
				collectionsByID.set(id, {
					id,
					name: String(row.collectionName || ""),
					parentID: row.parentCollectionID === null ? 0 : Number(row.parentCollectionID)
				});
			}
			const names = new Set();
			const byItemID = new Map();
			let associationCount = 0;
			for (const collection of collectionsByID.values()) {
				const path = this.collectionPath(collection, collectionsByID);
				if (path) names.add(path);
			}
			for (const row of rows) {
				if (row.itemID === null || row.itemID === undefined) continue;
				const itemID = Number(row.itemID);
				const collection = collectionsByID.get(Number(row.collectionID));
				const path = this.collectionPath(collection, collectionsByID);
				const itemNames = byItemID.get(itemID) || [];
				if (path && !itemNames.includes(path)) itemNames.push(path);
				byItemID.set(itemID, itemNames);
				associationCount++;
			}
			return {
				byItemID, names, collectionsByID, complete: true,
				source: "db-readonly", collectionCount: collectionsByID.size,
				associationCount, errorCode: ""
			};
		}
		catch (error) {
			this.log(`collection-db-fallback-failed:${libraryID}:${error && error.name || "error"}`);
			return null;
		}
	},

	async getItemCollectionNames(item, collectionIndex) {
		if (collectionIndex.complete) {
			return (collectionIndex.byItemID.get(item.id) || []).slice();
		}
		if (typeof item.loadDataType === "function") {
			await item.loadDataType("collections");
		}
		if (typeof item.getCollections !== "function") return [];
		const names = [];
		for (const collectionID of item.getCollections() || []) {
			const collection = collectionIndex.collectionsByID.get(collectionID)
				|| (Zotero.Collections && Zotero.Collections.get(collectionID));
			const path = this.collectionPath(collection, collectionIndex.collectionsByID);
			if (path && !names.includes(path)) names.push(path);
		}
		return names;
	},

	async itemEntry(item, collectionNames = []) {
		const library = Zotero.Libraries.get(item.libraryID);
		const title = String(item.getField("title") || "未命名文献").trim();
		const creator = String(item.getField("firstCreator") || "").trim();
		const year = String(item.getField("date") || "").match(/\d{4}/)?.[0] || "";
		const prefix = [creator, year].filter(Boolean).join(", ");
		const label = `@${prefix ? `${prefix} — ` : ""}${title}`;
		collectionNames = Array.from(new Set(collectionNames.filter(Boolean)));
		const selectURI = this.buildSelectURI(item);
		const pdfAttachments = await this.getPDFAttachments(item);
		const pdfURIs = pdfAttachments.map(attachment => this.buildOpenPDFURI(attachment));
		return {
			item,
			libraryID: item.libraryID,
			itemKey: item.key,
			libraryName: library ? library.name : "",
			collectionNames,
			title,
			creator,
			year,
			label,
			selectURI,
			linkURI: pdfURIs[0] || selectURI,
			pdfURIs,
			searchText: this.normalize([title, creator, year, item.getField("DOI"), library ? library.name : "", ...collectionNames].join(" ")),
			dateSort: String(item.dateModified || item.dateAdded || "")
		};
	},

	async getCatalog(force = false) {
		const now = Date.now();
		if (!force && this._catalog && now - this._catalogUpdatedAt < this.catalogTTLMS) {
			return this._catalog;
		}
		const entries = [];
		const collectionOptions = new Set();
		const catalogDiagnostic = {
			at: new Date().toISOString(), librariesScanned: 0,
			apiCollections: 0, dbCollections: 0, associations: 0,
			options: 0, source: "none", errorCode: ""
		};
		const catalogSources = new Set();
		for (const library of Zotero.Libraries.getAll()) {
			if (!library || library.libraryType === "feed" || library.type === "feed" || library.isFeed) continue;
			catalogDiagnostic.librariesScanned++;
			const collectionIndex = await this.getLibraryCollectionIndex(library.libraryID);
			catalogSources.add(collectionIndex.source || "none");
			if (collectionIndex.source === "db-readonly") catalogDiagnostic.dbCollections += collectionIndex.collectionCount || 0;
			else catalogDiagnostic.apiCollections += collectionIndex.collectionCount || 0;
			catalogDiagnostic.associations += collectionIndex.associationCount || 0;
			if (!catalogDiagnostic.errorCode && collectionIndex.errorCode) {
				catalogDiagnostic.errorCode = collectionIndex.errorCode;
			}
			for (const name of collectionIndex.names) collectionOptions.add(name);
			const search = new Zotero.Search();
			search.libraryID = library.libraryID;
			const ids = await search.search();
			const items = ids.length ? await Zotero.Items.getAsync(ids) : [];
			for (const item of items) {
				if (!item || item.deleted || typeof item.isRegularItem !== "function" || !item.isRegularItem()) continue;
				const collectionNames = await this.getItemCollectionNames(item, collectionIndex);
				entries.push(await this.itemEntry(item, collectionNames));
			}
		}
		entries.sort((a, b) => b.dateSort.localeCompare(a.dateSort)
			|| String(a.title).localeCompare(String(b.title)));
		this._catalog = entries;
		this._catalogUpdatedAt = now;
		this._collectionOptions = Array.from(collectionOptions)
			.sort((a, b) => a.localeCompare(b));
		catalogDiagnostic.options = this._collectionOptions.length;
		catalogDiagnostic.source = Array.from(catalogSources).sort().join("+") || "none";
		this.diagnostic.catalog = catalogDiagnostic;
		return entries;
	},

	async getCollectionFilterState(excludedItemID = 0) {
		const catalog = await this.getCatalog();
		const names = new Set(this._collectionOptions || []);
		let hasUnfiledItems = false;
		for (const entry of catalog) {
			if (entry.item.id === excludedItemID) continue;
			if (entry.collectionNames.length) {
				for (const name of entry.collectionNames) names.add(name);
			}
			else {
				hasUnfiledItems = true;
			}
		}
		return {
			names: Array.from(names).sort((a, b) => a.localeCompare(b)),
			hasUnfiledItems
		};
	},

	async searchCandidates(query, excludedItemID = 0, selectedCollection = "") {
		const normalized = this.normalize(query);
		const catalog = await this.getCatalog();
		return catalog
			.filter(entry => entry.item.id !== excludedItemID
				&& (!normalized || entry.searchText.includes(normalized))
				&& (!selectedCollection
					|| (selectedCollection === "__paperloop_unfiled__"
						? !entry.collectionNames.length
						: entry.collectionNames.includes(selectedCollection))))
			.map(entry => ({
				libraryID: entry.libraryID,
				itemKey: entry.itemKey,
				libraryName: entry.libraryName,
				collectionNames: entry.collectionNames,
				title: entry.title,
				creator: entry.creator,
				year: entry.year,
				label: entry.label,
				selectURI: entry.selectURI,
				linkURI: entry.linkURI,
				hasPDF: entry.pdfURIs.length > 0
			}));
	},

	parseMentionURI(value) {
		const uri = String(value || "");
		let match = uri.match(/^zotero:\/\/select\/library\/items\/([A-Z0-9]+)$/i);
		if (match) return { type: "library", itemKey: match[1].toUpperCase(), selectURI: uri };
		match = uri.match(/^zotero:\/\/select\/groups\/(\d+)\/items\/([A-Z0-9]+)$/i);
		if (match) {
			return {
				type: "group",
				groupID: Number(match[1]),
				itemKey: match[2].toUpperCase(),
				selectURI: uri
			};
		}
		match = uri.match(/^zotero:\/\/open-pdf\/library\/items\/([A-Z0-9]+)(?:\?.*)?$/i);
		if (match) return { type: "library-pdf", attachmentKey: match[1].toUpperCase(), linkURI: uri };
		match = uri.match(/^zotero:\/\/open-pdf\/groups\/(\d+)\/items\/([A-Z0-9]+)(?:\?.*)?$/i);
		if (match) {
			return {
				type: "group-pdf",
				groupID: Number(match[1]),
				attachmentKey: match[2].toUpperCase(),
				linkURI: uri
			};
		}
		return null;
	},

	nodeSummary(entry) {
		return {
			id: `${entry.libraryID}:${entry.itemKey}`,
			libraryID: entry.libraryID,
			itemKey: entry.itemKey,
			title: entry.title,
			creator: entry.creator,
			year: entry.year,
			selectURI: entry.selectURI
		};
	},

	async buildGraph() {
		const catalog = await this.getCatalog(true);
		const byURI = new Map();
		for (const entry of catalog) {
			byURI.set(entry.selectURI, entry);
			byURI.set(entry.linkURI, entry);
			for (const pdfURI of entry.pdfURIs || []) byURI.set(pdfURI, entry);
		}
		const nodes = new Map();
		const edges = new Map();
		for (const source of catalog) {
			const noteIDs = typeof source.item.getNotes === "function" ? source.item.getNotes() : [];
			if (!noteIDs.length) continue;
			const notes = await Zotero.Items.getAsync(noteIDs);
			for (const note of notes) {
				if (!note || note.deleted || typeof note.isNote !== "function" || !note.isNote()) continue;
				const doc = new DOMParser().parseFromString(String(note.getNote() || ""), "text/html");
				for (const link of doc.querySelectorAll("a[href]")) {
					if (link.getAttribute("title") !== this.mentionTitle) continue;
					const href = link.getAttribute("href");
					const parsed = this.parseMentionURI(href);
					if (!parsed) continue;
					const target = byURI.get(href);
					if (!target) continue;
					const sourceID = `${source.libraryID}:${source.itemKey}`;
					const targetID = `${target.libraryID}:${target.itemKey}`;
					const edgeID = `${sourceID}->${targetID}`;
					nodes.set(sourceID, this.nodeSummary(source));
					nodes.set(targetID, this.nodeSummary(target));
					const edge = edges.get(edgeID) || {
						id: edgeID,
						source: sourceID,
						target: targetID,
						type: "mentions",
						mentionCount: 0,
						noteKeys: []
					};
					edge.mentionCount++;
					if (note.key && !edge.noteKeys.includes(note.key)) edge.noteKeys.push(note.key);
					edges.set(edgeID, edge);
				}
			}
		}
		return {
			version: this.version,
			generatedAt: new Date().toISOString(),
			nodes: Array.from(nodes.values()),
			edges: Array.from(edges.values()),
			stats: { nodeCount: nodes.size, edgeCount: edges.size }
		};
	}
};

PaperLoopLiteratureMentions.GraphEndpoint = function () {};

PaperLoopLiteratureMentions.GraphEndpoint.prototype = {
	supportedMethods: ["GET", "POST"],
	supportedDataTypes: ["application/json"],
	permitBookmarklet: false,

	async init(requestData) {
		try {
			const graph = await PaperLoopLiteratureMentions.buildGraph();
			return [200, "application/json", JSON.stringify(graph)];
		}
		catch (error) {
			return [500, "application/json", JSON.stringify({
				version: PaperLoopLiteratureMentions.version,
				status: "error",
				errorCode: "GRAPH_BUILD_FAILED"
			})];
		}
	}
};

PaperLoopLiteratureMentions.StateEndpoint = function () {};

PaperLoopLiteratureMentions.StateEndpoint.prototype = {
	supportedMethods: ["GET", "POST"],
	supportedDataTypes: ["application/json"],
	permitBookmarklet: false,

	async init(requestData) {
		try {
			await PaperLoopLiteratureMentions.getCatalog();
		}
		catch (error) {
			PaperLoopLiteratureMentions.diagnostic.catalog = {
				at: new Date().toISOString(), librariesScanned: 0,
				apiCollections: 0, dbCollections: 0, associations: 0,
				options: 0, source: "none", errorCode: "CATALOG_BUILD_FAILED"
			};
		}
		return [
			200,
			"application/json",
			JSON.stringify(PaperLoopLiteratureMentions.getDiagnosticState())
		];
	}
};
