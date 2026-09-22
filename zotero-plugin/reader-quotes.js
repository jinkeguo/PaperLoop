var PaperLoopReaderQuotes = {
	version: "0.5.1",
	pluginID: "paperloop-doi-bridge@paperloop.app",
	stateEndpointPath: "/connector/paperloop/reader-quote-state",
	maxQuoteLength: 4000,
	targetNoteByPaper: new Map(),
	completedQuotes: new Set(),
	pendingQuotes: new Map(),
	pendingSelections: new Map(),
	diagnostic: null,
	_handler: null,

	register(pluginID) {
		if (this._handler) return;
		this.pluginID = pluginID || this.pluginID;
		this._handler = event => this.renderTextSelectionPopup(event);
		PaperLoopZoteroCompat.registerEndpoint(this.stateEndpointPath, this.StateEndpoint);
		PaperLoopZoteroCompat.registerReaderListener(
			"renderTextSelectionPopup",
			this._handler,
			this.pluginID
		);
		this.resetDiagnostic(true);
		this.log("registered");
	},

	unregister() {
		if (!this._handler) return;
		PaperLoopZoteroCompat.unregisterReaderListener(
			"renderTextSelectionPopup",
			this._handler,
			this.pluginID
		);
		PaperLoopZoteroCompat.unregisterEndpoint(this.stateEndpointPath, this.StateEndpoint);
		this._handler = null;
		this.targetNoteByPaper.clear();
		this.completedQuotes.clear();
		this.pendingQuotes.clear();
		this.pendingSelections.clear();
		this.resetDiagnostic(false);
		this.log("unregistered");
	},

	log(message) {
		Zotero.debug(`PaperLoop Reader Quote: ${message}`);
	},

	resetDiagnostic(registered) {
		this.diagnostic = {
			version: this.version,
			registered: !!registered,
			status: registered ? "ready" : "stopped",
			updatedAt: new Date().toISOString(),
			popupCount: 0,
			attemptCount: 0,
			successCount: 0,
			failureCount: 0,
			last: null
		};
	},

	safeErrorCode(error) {
		const message = String(error && error.message || "");
		return /^[A-Z][A-Z0-9_]{0,63}$/.test(message)
			? message
			: "UNEXPECTED_ERROR";
	},

	updateDiagnostic(status, fields = {}) {
		if (!this.diagnostic) this.resetDiagnostic(!!this._handler);
		if (status === "popup-ready") this.diagnostic.popupCount++;
		if (status === "attempt") this.diagnostic.attemptCount++;
		if (status === "success") this.diagnostic.successCount++;
		if (status === "failure") this.diagnostic.failureCount++;
		const last = {
			status,
			timestamp: new Date().toISOString(),
			selectionLength: Math.max(0, Number(fields.selectionLength) || 0),
			pageLabel: String(fields.pageLabel || "").slice(0, 64),
			attachmentKey: String(fields.attachmentKey || "").slice(0, 32),
			parentItemKey: String(fields.parentItemKey || "").slice(0, 32),
			noteKey: String(fields.noteKey || "").slice(0, 32),
			targetReason: String(fields.targetReason || "").slice(0, 32),
			duplicate: !!fields.duplicate,
			errorCode: String(fields.errorCode || "").slice(0, 64)
		};
		this.diagnostic.status = status;
		this.diagnostic.updatedAt = last.timestamp;
		this.diagnostic.last = last;
	},

	getDiagnosticState() {
		if (!this.diagnostic) this.resetDiagnostic(!!this._handler);
		return this.clone({
			...this.diagnostic,
			endpointPath: this.stateEndpointPath,
			maxQuoteLength: this.maxQuoteLength
		});
	},

	clone(value) {
		return JSON.parse(JSON.stringify(value));
	},

	normalizeText(value) {
		return String(value || "").replace(/\s+/g, " ").trim();
	},

	escapeHTML(value) {
		return String(value || "")
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;")
			.replace(/'/g, "&#39;");
	},

	buildEditableQuoteHTML(annotation) {
		if (!Zotero.EditorInstanceUtilities
				|| typeof Zotero.EditorInstanceUtilities.serializeAnnotations !== "function") {
			throw new Error("NOTE_SERIALIZER_UNAVAILABLE");
		}
		const serialized = Zotero.EditorInstanceUtilities.serializeAnnotations([annotation]);
		const parser = new DOMParser();
		const doc = parser.parseFromString(String(serialized && serialized.html || ""), "text/html");
		const sourceLink = doc.querySelector("[data-annotation]");
		if (!sourceLink) throw new Error("NOTE_SERIALIZER_UNAVAILABLE");
		sourceLink.textContent = `↩ 返回原文 · p.${annotation.pageLabel || "?"}`;
		const citation = doc.querySelector(".citation[data-citation]");
		const sourceHTML = [
			sourceLink.outerHTML,
			citation && citation.outerHTML
		].filter(Boolean).join(" ");
		return [
			"<blockquote>",
			`<p>${this.escapeHTML(annotation.text)}</p>`,
			`<p>${sourceHTML}</p>`,
			"</blockquote>"
		].join("");
	},

	insertEditableQuote(instance, annotation) {
		if (!instance || typeof instance._postMessage !== "function") {
			throw new Error("NOTE_EDITOR_UNAVAILABLE");
		}
		const html = this.buildEditableQuoteHTML(annotation);
		instance._postMessage({ action: "insertHTML", pos: null, html });
		return html;
	},

	hashString(value) {
		let hash = 2166136261;
		for (let i = 0; i < value.length; i++) {
			hash ^= value.charCodeAt(i);
			hash = Math.imul(hash, 16777619);
		}
		return (hash >>> 0).toString(16).padStart(8, "0");
	},

	paperKey(parentItem) {
		return `${parentItem.libraryID}:${parentItem.key || parentItem.id}`;
	},

	noteBelongsToPaper(note, parentItem) {
		if (!note || note.deleted || typeof note.isNote !== "function" || !note.isNote()) {
			return false;
		}
		const parentID = note.parentItemID || note.parentID || 0;
		return note.libraryID === parentItem.libraryID && parentID === parentItem.id;
	},

	isEditable(item) {
		if (!item || item.deleted) return false;
		const library = Zotero.Libraries.get(item.libraryID);
		if (!library || !library.editable) return false;
		return typeof item.isEditable !== "function" || item.isEditable();
	},

	getReaderItems(reader) {
		const attachment = Zotero.Items.get(reader && reader.itemID);
		if (!attachment || attachment.deleted || !attachment.isAttachment()) {
			throw new Error("ATTACHMENT_NOT_FOUND");
		}
		const contentType = String(attachment.attachmentContentType || "").toLowerCase();
		const filename = typeof attachment.getFilename === "function"
			? String(attachment.getFilename() || "").toLowerCase()
			: "";
		if (contentType !== "application/pdf" && !filename.endsWith(".pdf")) {
			throw new Error("PDF_ONLY");
		}
		const parentID = attachment.parentItemID || attachment.parentID;
		const parentItem = parentID ? Zotero.Items.get(parentID) : null;
		if (!parentItem || parentItem.deleted || !parentItem.isRegularItem()) {
			throw new Error("PARENT_PAPER_NOT_FOUND");
		}
		if (!this.isEditable(parentItem)) {
			throw new Error("LIBRARY_NOT_EDITABLE");
		}
		return { attachment, parentItem };
	},

	prepareAnnotation(rawAnnotation, attachment) {
		const annotation = this.clone(rawAnnotation || {});
		annotation.text = this.normalizeText(annotation.text);
		if (!annotation.text) throw new Error("EMPTY_SELECTION");
		if (annotation.text.length > this.maxQuoteLength) {
			throw new Error("SELECTION_TOO_LONG");
		}
		if (!annotation.position || typeof annotation.position !== "object") {
			throw new Error("SELECTION_POSITION_MISSING");
		}
		if (!Number.isInteger(annotation.position.pageIndex)) {
			throw new Error("SELECTION_POSITION_MISSING");
		}
		annotation.id = String(annotation.id || this.hashString(
			`${attachment.key}:${annotation.text}:${JSON.stringify(annotation.position)}`
		)).slice(0, 32);
		annotation.type = annotation.type || "highlight";
		annotation.color = annotation.color || "#ffd400";
		annotation.pageLabel = String(
			annotation.pageLabel
			|| (Number.isInteger(annotation.position.pageIndex)
				? annotation.position.pageIndex + 1
				: "")
		);
		annotation.attachmentItemID = attachment.id;
		return annotation;
	},

	getContextPane(reader) {
		const win = reader && reader._window;
		return win && win.ZoteroContextPane ? win.ZoteroContextPane : null;
	},

	getActiveMatchingEditor(reader, parentItem) {
		const contextPane = this.getContextPane(reader);
		const editor = contextPane && contextPane.activeEditor;
		return editor
			&& this.noteBelongsToPaper(editor.item, parentItem)
			&& this.isEditable(editor.item)
			? editor
			: null;
	},

	validateEditorHost(reader) {
		const contextPane = this.getContextPane(reader);
		if (!contextPane || !contextPane.context
				|| typeof contextPane.context._getCurrentNotesContext !== "function") {
			throw new Error("READER_TAB_REQUIRED");
		}
		return contextPane;
	},

	async getChildNotes(parentItem) {
		const ids = typeof parentItem.getNotes === "function" ? parentItem.getNotes() : [];
		const notes = ids.length ? await Zotero.Items.getAsync(ids) : [];
		return notes
			.filter(note => this.noteBelongsToPaper(note, parentItem) && this.isEditable(note))
			.sort((a, b) =>
				String(a.dateAdded || "").localeCompare(String(b.dateAdded || ""))
				|| (a.id || 0) - (b.id || 0)
			);
	},

	noteTitle(note) {
		const title = typeof note.getNoteTitle === "function" ? note.getNoteTitle() : "";
		return this.normalizeText(title) || "未命名笔记";
	},

	chooseNote(reader, parentItem, notes) {
		const win = reader && reader._window ? reader._window : null;
		const paperTitle = this.normalizeText(parentItem.getDisplayTitle()) || "未命名文献";
		const labels = notes.map(note => this.noteTitle(note));
		labels.push("＋ 新建 PaperLoop 阅读笔记");
		const selected = { value: 0 };
		const accepted = Services.prompt.select(
			win,
			"PaperLoop：选择目标笔记",
			`当前文献：${paperTitle}\n本次会话将记住你的选择。`,
			labels.length,
			labels,
			selected
		);
		if (!accepted) throw new Error("NOTE_SELECTION_CANCELLED");
		return selected.value === notes.length ? null : notes[selected.value];
	},

	async createReadingNote(parentItem) {
		const note = new Zotero.Item("note");
		note.libraryID = parentItem.libraryID;
		note.parentItemID = parentItem.id;
		note.setNote("<h1>PaperLoop 阅读笔记</h1>");
		await note.saveTx({
			notifierData: { autoSyncDelay: Zotero.Notes.AUTO_SYNC_DELAY }
		});
		return note;
	},

	async resolveTargetNote(reader, parentItem) {
		const activeEditor = this.getActiveMatchingEditor(reader, parentItem);
		if (activeEditor) {
			this.targetNoteByPaper.set(this.paperKey(parentItem), activeEditor.item.key);
			return { note: activeEditor.item, editor: activeEditor, reason: "active" };
		}

		const notes = await this.getChildNotes(parentItem);
		const rememberedKey = this.targetNoteByPaper.get(this.paperKey(parentItem));
		const remembered = rememberedKey
			? notes.find(note => note.key === rememberedKey)
			: null;
		if (remembered) return { note: remembered, editor: null, reason: "remembered" };

		let note;
		let reason;
		if (notes.length === 0) {
			note = await this.createReadingNote(parentItem);
			reason = "created";
		}
		else if (notes.length === 1) {
			note = notes[0];
			reason = "only-child";
		}
		else {
			note = this.chooseNote(reader, parentItem, notes);
			if (!note) {
				note = await this.createReadingNote(parentItem);
				reason = "chooser-created";
			}
			else {
				reason = "chooser";
			}
		}
		this.targetNoteByPaper.set(this.paperKey(parentItem), note.key);
		return { note, editor: null, reason };
	},

	async openTargetEditor(reader, note, existingEditor) {
		if (existingEditor && existingEditor.item && existingEditor.item.id === note.id) {
			return existingEditor;
		}

		const contextPane = this.getContextPane(reader);
		if (!contextPane || !contextPane.context) {
			throw new Error("READER_TAB_REQUIRED");
		}
		contextPane.collapsed = false;
		contextPane.context.mode = "notes";
		const notesContext = contextPane.context._getCurrentNotesContext();
		if (!notesContext || typeof notesContext._setPinnedNote !== "function") {
			throw new Error("NOTE_EDITOR_UNAVAILABLE");
		}
		notesContext._setPinnedNote(note);
		const editor = contextPane.activeEditor;
		if (!editor) throw new Error("NOTE_EDITOR_UNAVAILABLE");
		return editor;
	},

	async waitForEditorInstance(editor) {
		let instance = null;
		for (let i = 0; i < 150; i++) {
			instance = editor && editor.getCurrentInstance();
			if (instance) break;
			await Zotero.Promise.delay(10);
		}
		if (!instance || typeof instance._postMessage !== "function") {
			throw new Error("NOTE_EDITOR_UNAVAILABLE");
		}
		if (instance._initPromise) await instance._initPromise;
		return instance;
	},

	quoteKey(attachment, note, annotation) {
		return [
			attachment.libraryID,
			attachment.key || attachment.id,
			note.key || note.id,
			this.hashString(annotation.text),
			this.hashString(JSON.stringify(annotation.position))
		].join(":");
	},

	selectionKey(attachment, annotation) {
		return [
			attachment.libraryID,
			attachment.key || attachment.id,
			this.hashString(annotation.text),
			this.hashString(JSON.stringify(annotation.position))
		].join(":");
	},

	async _insertPreparedQuote(reader, attachment, parentItem, annotation) {
		const target = await this.resolveTargetNote(reader, parentItem);
		const key = this.quoteKey(attachment, target.note, annotation);
		if (this.completedQuotes.has(key)) {
			return { ...target, duplicate: true };
		}
		if (this.pendingQuotes.has(key)) return this.pendingQuotes.get(key);

		const operation = (async () => {
			try {
				const editor = await this.openTargetEditor(reader, target.note, target.editor);
				const instance = await this.waitForEditorInstance(editor);
				this.insertEditableQuote(instance, annotation);
				if (typeof reader.focus === "function") await reader.focus();
				this.completedQuotes.add(key);
				this.log(
					`inserted attachment=${attachment.key} note=${target.note.key} `
					+ `page=${annotation.pageLabel || "?"} length=${annotation.text.length} `
					+ `target=${target.reason}`
				);
				return { ...target, duplicate: false };
			}
			catch (error) {
				if (["created", "chooser-created"].includes(target.reason)
						&& target.note && target.note.id
						&& typeof target.note.eraseTx === "function") {
					try {
						await target.note.eraseTx();
						this.targetNoteByPaper.delete(this.paperKey(parentItem));
					}
					catch (rollbackError) {
						this.log("rollback-failed");
					}
				}
				throw error;
			}
		})();
		this.pendingQuotes.set(key, operation);
		try {
			return await operation;
		}
		finally {
			if (this.pendingQuotes.get(key) === operation) this.pendingQuotes.delete(key);
		}
	},

	async insertQuote(reader, rawAnnotation) {
		const diagnosticFields = {
			selectionLength: this.normalizeText(rawAnnotation && rawAnnotation.text).length,
			pageLabel: rawAnnotation && rawAnnotation.pageLabel
		};
		this.updateDiagnostic("attempt", diagnosticFields);
		try {
			const { attachment, parentItem } = this.getReaderItems(reader);
			const annotation = this.prepareAnnotation(rawAnnotation, attachment);
			this.validateEditorHost(reader);
			Object.assign(diagnosticFields, {
				selectionLength: annotation.text.length,
				pageLabel: annotation.pageLabel,
				attachmentKey: attachment.key,
				parentItemKey: parentItem.key
			});
			const key = this.selectionKey(attachment, annotation);
			let operation = this.pendingSelections.get(key);
			if (!operation) {
				operation = this._insertPreparedQuote(
					reader,
					attachment,
					parentItem,
					annotation
				);
				this.pendingSelections.set(key, operation);
			}
			try {
				const result = await operation;
				Object.assign(diagnosticFields, {
					noteKey: result.note && result.note.key,
					targetReason: result.reason,
					duplicate: result.duplicate
				});
				this.updateDiagnostic("success", diagnosticFields);
				return result;
			}
			finally {
				if (this.pendingSelections.get(key) === operation) {
					this.pendingSelections.delete(key);
				}
			}
		}
		catch (error) {
			const errorCode = this.safeErrorCode(error);
			this.updateDiagnostic("failure", { ...diagnosticFields, errorCode });
			throw error;
		}
	},

	errorLabel(error) {
		switch (error && error.message) {
			case "EMPTY_SELECTION": return "请先选择文字";
			case "SELECTION_TOO_LONG": return `选区过长（最多 ${this.maxQuoteLength} 字）`;
			case "SELECTION_POSITION_MISSING": return "选区缺少定位信息";
			case "PDF_ONLY": return "当前仅支持 PDF";
			case "LIBRARY_NOT_EDITABLE": return "当前文库不可编辑";
			case "NOTE_SELECTION_CANCELLED": return "已取消";
			case "READER_TAB_REQUIRED": return "请在 Zotero 主窗口的 PDF 标签页使用";
			case "NOTE_EDITOR_UNAVAILABLE": return "无法打开目标笔记";
			case "NOTE_SERIALIZER_UNAVAILABLE": return "无法生成返回原文链接";
			default: return "加入失败";
		}
	},

	renderTextSelectionPopup(event) {
		const { reader, doc, params, append } = event || {};
		const annotation = params && params.annotation;
		if (!reader || !doc || !annotation || !this.normalizeText(annotation.text)) return;
		if (doc.querySelector && doc.querySelector("[data-paperloop-reader-quote]")) return;
		this.updateDiagnostic("popup-ready", {
			selectionLength: this.normalizeText(annotation.text).length,
			pageLabel: annotation.pageLabel,
			attachmentKey: (() => {
				const attachment = Zotero.Items.get(reader.itemID);
				return attachment && attachment.key;
			})()
		});

		const button = doc.createElement("button");
		button.className = "toolbar-button wide-button";
		button.setAttribute("data-tabstop", "1");
		button.setAttribute("data-paperloop-reader-quote", "true");
		button.textContent = "可编辑摘录";
		button.title = "以可加粗、可改色的普通文字加入笔记，并保留独立返回原文链接";
		button.addEventListener("click", async clickEvent => {
			clickEvent.preventDefault();
			clickEvent.stopPropagation();
			if (button.disabled) return;
			button.disabled = true;
			button.textContent = "正在加入…";
			try {
				const result = await this.insertQuote(reader, annotation);
				button.textContent = result.duplicate ? "已存在" : "已加入可编辑摘录";
			}
			catch (error) {
				button.textContent = this.errorLabel(error);
				button.disabled = error && error.message !== "NOTE_SELECTION_CANCELLED";
				this.log(`failed code=${this.safeErrorCode(error)}`);
			}
		});
		append(button);
	}
};

PaperLoopReaderQuotes.StateEndpoint = function () {};

PaperLoopReaderQuotes.StateEndpoint.prototype = {
	supportedMethods: ["GET", "POST"],
	supportedDataTypes: ["application/json"],
	permitBookmarklet: false,

	init(requestData) {
		return [200, "application/json", JSON.stringify(
			PaperLoopReaderQuotes.getDiagnosticState()
		)];
	}
};
