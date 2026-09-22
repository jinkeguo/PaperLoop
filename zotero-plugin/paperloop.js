var PaperLoopDOIBridge = {
	version: "0.1.22",
	blankNoteHTML: "<h1>PaperLoop 思考</h1>",
	endpointPath: "/connector/paperloop/resolve",
	appendEndpointPath: "/connector/paperloop/append-note",
	searchEndpointPath: "/connector/paperloop/search-items",
	stateEndpointPath: "/connector/paperloop/state",
	addPDFEndpointPath: "/connector/paperloop/add-pdf",
	pendingNotes: new Map(),
	pendingUpserts: new Map(),
	pendingPDFs: new Map(),

	register() {
		PaperLoopZoteroCompat.registerEndpoint(this.endpointPath, this.Endpoint);
		PaperLoopZoteroCompat.registerEndpoint(this.appendEndpointPath, this.AppendNoteEndpoint);
		PaperLoopZoteroCompat.registerEndpoint(this.searchEndpointPath, this.SearchItemsEndpoint);
		PaperLoopZoteroCompat.registerEndpoint(this.stateEndpointPath, this.StateEndpoint);
		PaperLoopZoteroCompat.registerEndpoint(this.addPDFEndpointPath, this.AddPDFEndpoint);
	},

	unregister() {
		PaperLoopZoteroCompat.unregisterEndpoint(this.endpointPath, this.Endpoint);
		PaperLoopZoteroCompat.unregisterEndpoint(this.appendEndpointPath, this.AppendNoteEndpoint);
		PaperLoopZoteroCompat.unregisterEndpoint(this.searchEndpointPath, this.SearchItemsEndpoint);
		PaperLoopZoteroCompat.unregisterEndpoint(this.stateEndpointPath, this.StateEndpoint);
		PaperLoopZoteroCompat.unregisterEndpoint(this.addPDFEndpointPath, this.AddPDFEndpoint);
	},

	normalizeDOI(value) {
		return (Zotero.Utilities.cleanDOI(value || "") || "").toLowerCase();
	},

	isBlankPaperLoopNoteHTML(noteHTML) {
		const content = String(noteHTML || "")
			.replace(/^<!-- paperloop-event:[A-Za-z0-9_-]* -->/, "")
			.trim();
		return !content || content === this.blankNoteHTML;
	},

	normalizePaperLoopNoteHTML(noteHTML) {
		return this.isBlankPaperLoopNoteHTML(noteHTML)
			? this.blankNoteHTML
			: String(noteHTML);
	},

	async findExisting(libraryID, doi) {
		let search = new Zotero.Search();
		search.libraryID = libraryID;
		search.addCondition("DOI", "contains", doi);
		let ids = await search.search();
		let items = await Zotero.Items.getAsync(ids);
		items = items.filter(item =>
			item
			&& item.isRegularItem()
			&& !item.deleted
			&& this.normalizeDOI(item.getField("DOI")) === doi
		);
		items.sort((a, b) =>
			String(a.dateAdded || "").localeCompare(String(b.dateAdded || ""))
			|| a.id - b.id
		);
		return items;
	},

	resolveSaveTarget(targetID) {
		if (!targetID) {
			return Zotero.Server.Connector.getSaveTarget();
		}
		return Zotero.Server.Connector.resolveTarget(String(targetID));
	},

	async addToCollection(item, collection) {
		if (!collection) {
			return {collectionAdded: false, collectionAlreadyPresent: false};
		}
		if (collection.libraryID !== item.libraryID) {
			throw new Error("COLLECTION_LIBRARY_MISMATCH");
		}
		await collection.loadDataType("childItems");
		const collectionAlreadyPresent = collection.hasItem(item.id);
		if (!collectionAlreadyPresent) {
			await Zotero.DB.executeTransaction(() => collection.addItem(item.id));
		}
		return {
			collectionAdded: !collectionAlreadyPresent,
			collectionAlreadyPresent,
			collectionID: collection.id,
			collectionKey: collection.key,
			collectionName: collection.name
		};
	},

	async findItemByKey(libraryID, itemKey) {
		const key = String(itemKey || "").trim().toUpperCase();
		if (!key) return { item: null, ambiguous: false };

		if (libraryID !== undefined && libraryID !== null && libraryID !== "") {
			const parsedLibraryID = Number(libraryID);
			const library = Zotero.Libraries.get(parsedLibraryID);
			if (!library || !library.editable) {
				return { item: null, ambiguous: false, notEditable: true };
			}
			const item = await Zotero.Items.getByLibraryAndKeyAsync(parsedLibraryID, key);
			return { item: item || null, ambiguous: false };
		}

		const matches = [];
		for (const library of Zotero.Libraries.getAll()) {
			if (!library.editable) continue;
			const item = await Zotero.Items.getByLibraryAndKeyAsync(library.libraryID, key);
			if (item) matches.push(item);
		}
		return {
			item: matches.length === 1 ? matches[0] : null,
			ambiguous: matches.length > 1
		};
	},

	itemSummary(item) {
		const library = Zotero.Libraries.get(item.libraryID);
		return {
			libraryID: item.libraryID,
			libraryName: library ? library.name : "",
			itemKey: item.key,
			itemType: Zotero.ItemTypes.getName(item.itemTypeID),
			title: item.getField("title") || "未命名条目",
			creator: item.getField("firstCreator") || "",
			year: String(item.getField("date") || "").match(/\d{4}/)?.[0] || "",
			doi: this.normalizeDOI(item.getField("DOI")),
			dateModified: item.dateModified || "",
			dateAdded: item.dateAdded || ""
		};
	},

	async searchItems(query, limit=20) {
		const normalizedQuery = String(query || "").trim().slice(0, 240);
		const loweredQuery = normalizedQuery.toLocaleLowerCase();
		const normalizedDOI = this.normalizeDOI(normalizedQuery);
		const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 50));
		let matches = [];
		for (const library of Zotero.Libraries.getAll()) {
			if (!library.editable) continue;
			// Zotero 7 installations differ in which Search condition aliases they
			// expose (notably creator/quicksearch). Enumerating the editable library
			// and filtering regular items avoids a runtime 500 while preserving the
			// same title/author/year/DOI behavior.
			let search = new Zotero.Search();
			search.libraryID = library.libraryID;
			const ids = await search.search();
			let items = await Zotero.Items.getAsync(ids);
			for (const item of items) {
				if (!item || !item.isRegularItem() || item.deleted) continue;
				if (normalizedQuery) {
					const fields = [
						item.getField("title"),
						item.getField("firstCreator"),
						item.getField("date")
					].map(value => String(value || "").toLocaleLowerCase());
					const itemDOI = this.normalizeDOI(item.getField("DOI"));
					const textMatch = fields.some(value => value.includes(loweredQuery));
					const doiMatch = normalizedDOI && itemDOI.includes(normalizedDOI);
					if (!textMatch && !doiMatch) continue;
				}
				matches.push(item);
			}
		}
		matches.sort((a, b) =>
			String(b.dateModified || b.dateAdded || "").localeCompare(
				String(a.dateModified || a.dateAdded || "")
			)
			|| b.id - a.id
		);
		return matches.slice(0, safeLimit).map(item => this.itemSummary(item));
	},

	async findMatchingNote(parentItem, marker, noteHTML) {
		let noteIDs = parentItem.getNotes();
		if (!noteIDs.length) return null;
		let notes = await Zotero.Items.getAsync(noteIDs);
		for (const note of notes) {
			const html = note.getNote();
			if (marker && html.includes(marker)) {
				return { note, reason: "event" };
			}
			const content = html.replace(/^<!-- paperloop-event:[A-Za-z0-9_-]* -->/, "");
			if (content === noteHTML) {
				return { note, reason: "content" };
			}
		}
		return null;
	},

	async _appendNoteOnce(parentItem, noteHTML, safeEventID) {
		if (!noteHTML) return { noteKey: null, repeatedEvent: false };

		const marker = `<!-- paperloop-event:${safeEventID} -->`;
		const match = await this.findMatchingNote(
			parentItem,
			safeEventID ? marker : "",
			noteHTML
		);
		if (match) {
			return {
				noteKey: match.note.key,
				repeatedEvent: match.reason === "event",
				repeatedContent: match.reason === "content"
			};
		}

		let note = new Zotero.Item("note");
		note.libraryID = parentItem.libraryID;
		note.parentItemID = parentItem.id;
		note.setNote(`${marker}${noteHTML}`);
		await note.saveTx({
			notifierData: {
				autoSyncDelay: Zotero.Notes.AUTO_SYNC_DELAY
			}
		});
		return {
			noteKey: note.key,
			repeatedEvent: false,
			repeatedContent: false,
			inFlightReuse: false
		};
	},

	async appendNote(parentItem, noteHTML, eventID) {
		if (!noteHTML) {
			return {
				noteKey: null,
				repeatedEvent: false,
				repeatedContent: false,
				inFlightReuse: false
			};
		}

		const safeEventID = String(eventID || "").replace(/[^A-Za-z0-9_-]/g, "");
		const prefix = `${parentItem.libraryID}:${parentItem.id}`;
		const eventKey = safeEventID ? `${prefix}:event:${safeEventID}` : null;
		const contentKey = `${prefix}:content:${noteHTML}`;
		const lookupKeys = eventKey ? [eventKey, contentKey] : [contentKey];

		for (const key of lookupKeys) {
			const pending = this.pendingNotes.get(key);
			if (!pending) continue;
			const result = await pending;
			return {
				...result,
				repeatedEvent: result.repeatedEvent || key === eventKey,
				repeatedContent: result.repeatedContent || key === contentKey,
				inFlightReuse: true
			};
		}

		const operation = this._appendNoteOnce(parentItem, noteHTML, safeEventID);
		for (const key of lookupKeys) {
			this.pendingNotes.set(key, operation);
		}

		try {
			return await operation;
		}
		finally {
			for (const key of lookupKeys) {
				if (this.pendingNotes.get(key) === operation) {
					this.pendingNotes.delete(key);
				}
			}
		}
	},

	async findCanonicalPaperLoopNote(parentItem) {
		const noteIDs = parentItem.getNotes();
		if (!noteIDs.length) return null;
		const notes = (await Zotero.Items.getAsync(noteIDs)).filter(note => {
			const html = String(note.getNote() || "");
			return html.includes("paperloop-event:")
				|| html.includes("<h1>PaperLoop 思考</h1>");
		});
		notes.sort((a, b) =>
			String(a.dateAdded || "").localeCompare(String(b.dateAdded || ""))
			|| (a.id || 0) - (b.id || 0)
		);
		return notes[0] || null;
	},

	async findUsablePDF(parentItem) {
		const attachmentIDs = typeof parentItem.getAttachments === "function"
			? parentItem.getAttachments()
			: [];
		if (!attachmentIDs.length) return null;
		const attachments = await Zotero.Items.getAsync(attachmentIDs);
		for (const attachment of attachments) {
			if (!attachment || attachment.deleted) continue;
			const contentType = String(attachment.attachmentContentType || "").toLowerCase();
			const filename = typeof attachment.getFilename === "function"
				? String(attachment.getFilename() || "")
				: "";
			if (contentType !== "application/pdf" && !filename.toLowerCase().endsWith(".pdf")) {
				continue;
			}
			if (typeof attachment.fileExists === "function") {
				try {
					if (!await attachment.fileExists()) continue;
				}
				catch (e) {
					continue;
				}
			}
			return attachment;
		}
		return null;
	},

	decodePDFBase64(base64) {
		const binary = atob(String(base64 || ""));
		const bytes = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) {
			bytes[i] = binary.charCodeAt(i);
		}
		if (bytes.length < 5
				|| bytes[0] !== 0x25
				|| bytes[1] !== 0x50
				|| bytes[2] !== 0x44
				|| bytes[3] !== 0x46
				|| bytes[4] !== 0x2D) {
			throw new Error("INVALID_PDF_DATA");
		}
		return bytes;
	},

	async _importPDFOnce(parentItem, data) {
		const existing = await this.findUsablePDF(parentItem);
		if (existing) {
			return {
				attachmentKey: existing.key,
				created: false,
				alreadyPresent: true,
				hasPDF: true
			};
		}
		let phase = "decode";
		const bytes = this.decodePDFBase64(data.base64);
		const tempFile = Zotero.getTempDirectory();
		tempFile.append(`paperloop-${Zotero.Utilities.randomString(16)}.pdf`);
		const tempPath = tempFile.path;
		try {
			phase = "write-temp";
			const mainWindow = Zotero.getMainWindow();
			if (!mainWindow || typeof mainWindow.Blob !== "function") {
				throw new Error("ZOTERO_BLOB_UNAVAILABLE");
			}
			await Zotero.File.putContentsAsync(
				tempPath,
				new mainWindow.Blob([bytes], {type: "application/pdf"})
			);
			phase = "import-attachment";
			const attachment = await Zotero.Attachments.importFromFile({
				file: tempPath,
				parentItemID: parentItem.id,
				title: String(data.title || "Full Text PDF").trim().slice(0, 240)
					|| "Full Text PDF",
				contentType: "application/pdf"
			});
			if (data.url && typeof attachment.setField === "function") {
				phase = "save-url";
				attachment.setField("url", String(data.url).slice(0, 4000));
				await attachment.saveTx();
			}
			return {
				attachmentKey: attachment.key,
				created: true,
				alreadyPresent: false,
				hasPDF: true
			};
		}
		catch (e) {
			e.paperLoopPhase = phase;
			throw e;
		}
		finally {
			await Zotero.File.removeIfExists(tempPath);
		}
	},

	async importPDF(parentItem, data) {
		const key = `${parentItem.libraryID}:${parentItem.id}`;
		const previous = this.pendingPDFs.get(key) || Promise.resolve();
		const operation = previous
			.catch(() => {})
			.then(() => this._importPDFOnce(parentItem, data));
		this.pendingPDFs.set(key, operation);
		try {
			return await operation;
		}
		finally {
			if (this.pendingPDFs.get(key) === operation) {
				this.pendingPDFs.delete(key);
			}
		}
	},

	noteHTMLToText(noteHTML) {
		return String(noteHTML || "")
			.replace(/^<!-- paperloop-event:[A-Za-z0-9_-]* -->/, "")
			.replace(/<h1[^>]*>\s*PaperLoop 思考\s*<\/h1>/i, "")
			.replace(/<br\s*\/?\s*>/gi, "\n")
			.replace(/<\/p>\s*<p[^>]*>/gi, "\n\n")
			.replace(/<\/div>\s*<div[^>]*>/gi, "\n")
			.replace(/<li[^>]*>/gi, "• ")
			.replace(/<\/li>/gi, "\n")
			.replace(/<[^>]+>/g, "")
			.replace(/&nbsp;/gi, " ")
			.replace(/&lt;/gi, "<")
			.replace(/&gt;/gi, ">")
			.replace(/&quot;/gi, '"')
			.replace(/&#0*39;|&apos;/gi, "'")
			.replace(/&amp;/gi, "&")
			.replace(/\r/g, "")
			.replace(/\n{3,}/g, "\n\n")
			.trim();
	},

	async documentState(data={}) {
		let target = null;
		if (data.targetID) {
			try {
				target = this.resolveSaveTarget(data.targetID);
			}
			catch (e) {
				return {error: "SAVE_TARGET_INVALID"};
			}
		}
		let libraryID = target && target.library
			? target.library.libraryID
			: Number(data.libraryID || 0);
		if (!libraryID) libraryID = 1;
		const library = Zotero.Libraries.get(libraryID);
		if (!library || !library.editable) return {error: "LIBRARY_NOT_EDITABLE"};

		let item = null;
		const itemKey = String(data.itemKey || "").trim().toUpperCase();
		if (itemKey) {
			item = await Zotero.Items.getByLibraryAndKeyAsync(libraryID, itemKey);
			if (item && !item.isRegularItem()) item = null;
		}
		const doi = this.normalizeDOI(data.doi || "");
		if (!item && doi) {
			item = (await this.findExisting(libraryID, doi))[0] || null;
		}
		if (!item) {
			return {status: "missing", libraryID, doi, itemKey: itemKey || null};
		}

		const note = await this.findCanonicalPaperLoopNote(item);
		const pdf = await this.findUsablePDF(item);
		const noteHTML = note ? String(note.getNote() || "") : "";
		return {
			status: item.deleted ? "deleted" : "existing",
			libraryID: item.libraryID,
			itemKey: item.key,
			doi: this.normalizeDOI(item.getField("DOI")),
			itemModified: item.dateModified || "",
			noteKey: note ? note.key : null,
			noteModified: note ? (note.dateModified || "") : "",
			noteHTML,
			notebookVersion: 1,
			thought: this.noteHTMLToText(noteHTML),
			hasPDF: !!pdf,
			pdfAttachmentKey: pdf ? pdf.key : null
		};
	},

	async _upsertNoteOnce(parentItem, noteHTML, eventID) {
		const incomingBlank = this.isBlankPaperLoopNoteHTML(noteHTML);
		noteHTML = this.normalizePaperLoopNoteHTML(noteHTML);
		const safeEventID = String(eventID || "").replace(/[^A-Za-z0-9_-]/g, "");
		const marker = `<!-- paperloop-event:${safeEventID} -->`;
		const existing = await this.findCanonicalPaperLoopNote(parentItem);
		if (existing) {
			const currentHTML = String(existing.getNote() || "");
			const currentContent = currentHTML.replace(
				/^<!-- paperloop-event:[A-Za-z0-9_-]* -->/,
				""
			);
			// Saving without a thought must ensure a PaperLoop note exists, but it
			// must never erase text that the user already wrote in that note.
			if (incomingBlank) {
				return {
					noteKey: existing.key,
					created: false,
					updated: false,
					repeatedEvent: !!safeEventID && currentHTML.includes(marker),
					repeatedContent: this.isBlankPaperLoopNoteHTML(currentContent)
				};
			}
			if (safeEventID && currentHTML.includes(marker)) {
				return {
					noteKey: existing.key,
					created: false,
					updated: false,
					repeatedEvent: true,
					repeatedContent: currentContent === noteHTML
				};
			}
			if (currentContent === noteHTML) {
				return {
					noteKey: existing.key,
					created: false,
					updated: false,
					repeatedEvent: !!safeEventID && currentHTML.includes(marker),
					repeatedContent: true
				};
			}
			// Legacy text-only clients cannot round-trip embedded images or rich notes.
			// A blank save above still safely reuses the existing note.
			if (/<img\b|data-schema-version=/i.test(currentHTML)) {
				throw new Error("此笔记含图文内容，请使用 PaperLoop 浏览器扩展 0.3.21 或更新版本保存");
			}
			existing.setNote(`${marker}${noteHTML}`);
			await existing.saveTx({
				notifierData: {autoSyncDelay: Zotero.Notes.AUTO_SYNC_DELAY}
			});
			return {
				noteKey: existing.key,
				created: false,
				updated: true,
				repeatedEvent: false,
				repeatedContent: false
			};
		}

		const created = await this._appendNoteOnce(parentItem, noteHTML, safeEventID);
		return {...created, created: true, updated: false};
	},

	async upsertNote(parentItem, noteHTML, eventID) {
		const key = `${parentItem.libraryID}:${parentItem.id}`;
		const previous = this.pendingUpserts.get(key) || Promise.resolve();
		const operation = previous
			.catch(() => {})
			.then(() => this._upsertNoteOnce(parentItem, noteHTML, eventID));
		this.pendingUpserts.set(key, operation);
		try {
			return await operation;
		}
		finally {
			if (this.pendingUpserts.get(key) === operation) {
				this.pendingUpserts.delete(key);
			}
		}
	},

	Endpoint: function () {}
};

PaperLoopDOIBridge.Endpoint.prototype = {
	supportedMethods: ["POST"],
	supportedDataTypes: ["application/json"],
	permitBookmarklet: false,

	async init(requestData) {
		const data = requestData.data || {};
		let target;
		try {
			target = PaperLoopDOIBridge.resolveSaveTarget(data.targetID);
		}
		catch (e) {
			return [400, "application/json", JSON.stringify({
				error: "SAVE_TARGET_INVALID"
			})];
		}
		const { library, collection, editable } = target || {};
		if (!library || editable === false || !library.editable) {
			return [409, "application/json", JSON.stringify({
				error: "SAVE_TARGET_NOT_EDITABLE"
			})];
		}

		let results = [];
		for (const incoming of data.items || []) {
			const doi = PaperLoopDOIBridge.normalizeDOI(incoming.DOI);
			// Native Connector identity remains available even when a fallback
			// translator has no DOI. Never guess by title or current selection.
			let savedItem = null;
			if (data.sessionID && incoming.id) {
				const session = Zotero.Server.Connector.SessionManager?.get(String(data.sessionID));
				savedItem = session?.getItemByConnectorKey?.(incoming.id) || null;
				if (savedItem && (savedItem.deleted || !savedItem.isRegularItem()
					|| savedItem.libraryID !== library.libraryID
					|| (doi && PaperLoopDOIBridge.normalizeDOI(savedItem.getField('DOI')) !== doi))) {
					savedItem = null;
				}
			}
			if (!doi && !savedItem) {
				results.push({ id: incoming.id, status: "new", reason: "NO_DOI" });
				continue;
			}

			const matches = savedItem ? [savedItem]
				: await PaperLoopDOIBridge.findExisting(library.libraryID, doi);
			if (!matches.length) {
				results.push({ id: incoming.id, status: "new", doi });
				continue;
			}

			const canonical = matches[0];
			const collectionResult = await PaperLoopDOIBridge.addToCollection(
				canonical,
				collection
			);
			const noteResult = await PaperLoopDOIBridge.upsertNote(
				canonical,
				data.note || "",
				data.eventID || ""
			);
			const pdf = await PaperLoopDOIBridge.findUsablePDF(canonical);
			results.push({
				id: incoming.id,
				status: "existing",
				libraryID: canonical.libraryID,
				doi,
				itemKey: canonical.key,
				noteKey: noteResult.noteKey,
				repeatedEvent: noteResult.repeatedEvent,
				repeatedContent: noteResult.repeatedContent,
				inFlightReuse: noteResult.inFlightReuse,
				duplicateCount: matches.length,
				hasPDF: !!pdf,
				pdfAttachmentKey: pdf ? pdf.key : null,
				filesEditable: library.filesEditable !== false,
				...collectionResult
			});
		}

		return [200, "application/json", JSON.stringify({
			version: PaperLoopDOIBridge.version,
			sessionResolution: true,
			libraryID: library.libraryID,
			targetID: data.targetID || (collection ? collection.treeViewID : library.treeViewID),
			items: results
		})];
	}
};

PaperLoopDOIBridge.AppendNoteEndpoint = function () {};

PaperLoopDOIBridge.AppendNoteEndpoint.prototype = {
	supportedMethods: ["POST"],
	supportedDataTypes: ["application/json"],
	permitBookmarklet: false,

	async init(requestData) {
		const data = requestData.data || {};
		const itemKey = String(data.itemKey || "").trim().toUpperCase();
		const noteHTML = String(data.note || "");
		if (!itemKey || (!noteHTML && !data.targetID)) {
			return [400, "application/json", JSON.stringify({
				error: "ITEM_KEY_AND_NOTE_OR_TARGET_REQUIRED"
			})];
		}
		if (noteHTML.length > 200000) {
			return [413, "application/json", JSON.stringify({
				error: "NOTE_TOO_LARGE"
			})];
		}

		const lookup = await PaperLoopDOIBridge.findItemByKey(data.libraryID, itemKey);
		if (lookup.notEditable) {
			return [409, "application/json", JSON.stringify({
				error: "LIBRARY_NOT_EDITABLE"
			})];
		}
		if (lookup.ambiguous) {
			return [409, "application/json", JSON.stringify({
				error: "ITEM_KEY_AMBIGUOUS",
				itemKey
			})];
		}
		const parentItem = lookup.item;
		if (!parentItem || !parentItem.isRegularItem() || parentItem.deleted) {
			return [404, "application/json", JSON.stringify({
				error: "ITEM_NOT_FOUND",
				itemKey
			})];
		}

		let collectionResult = {};
		if (data.targetID) {
			let target;
			try {
				target = PaperLoopDOIBridge.resolveSaveTarget(data.targetID);
			}
			catch (e) {
				return [400, "application/json", JSON.stringify({error: "SAVE_TARGET_INVALID"})];
			}
			if (!target.library || target.editable === false || !target.library.editable) {
				return [409, "application/json", JSON.stringify({error: "SAVE_TARGET_NOT_EDITABLE"})];
			}
			if (target.library.libraryID !== parentItem.libraryID) {
				return [409, "application/json", JSON.stringify({error: "TARGET_LIBRARY_MISMATCH"})];
			}
			collectionResult = await PaperLoopDOIBridge.addToCollection(
				parentItem,
				target.collection
			);
		}

		const shouldEnsureNote = data.mode === "upsert";
		const noteResult = noteHTML || shouldEnsureNote
			? (data.mode === "upsert"
				? await PaperLoopDOIBridge.upsertNote(parentItem, noteHTML, data.eventID || "")
				: await PaperLoopDOIBridge.appendNote(parentItem, noteHTML, data.eventID || ""))
			: {
				noteKey: null,
				repeatedEvent: false,
				repeatedContent: false,
				inFlightReuse: false,
				created: false,
				updated: false
			};
		return [200, "application/json", JSON.stringify({
			version: PaperLoopDOIBridge.version,
			status: "ok",
			libraryID: parentItem.libraryID,
			itemKey: parentItem.key,
			noteKey: noteResult.noteKey,
			repeatedEvent: noteResult.repeatedEvent,
			repeatedContent: noteResult.repeatedContent,
			inFlightReuse: noteResult.inFlightReuse,
			created: !!noteResult.created,
			updated: !!noteResult.updated,
			classifiedOnly: !noteHTML,
			...collectionResult
		})];
	}
};

PaperLoopDOIBridge.SearchItemsEndpoint = function () {};

PaperLoopDOIBridge.SearchItemsEndpoint.prototype = {
	supportedMethods: ["POST"],
	supportedDataTypes: ["application/json"],
	permitBookmarklet: false,

	async init(requestData) {
		const data = requestData.data || {};
		const items = await PaperLoopDOIBridge.searchItems(data.query, data.limit);
		return [200, "application/json", JSON.stringify({
			version: PaperLoopDOIBridge.version,
			items
		})];
	}
};

PaperLoopDOIBridge.StateEndpoint = function () {};

PaperLoopDOIBridge.StateEndpoint.prototype = {
	supportedMethods: ["POST"],
	supportedDataTypes: ["application/json"],
	permitBookmarklet: false,

	async init(requestData) {
		const state = await PaperLoopDOIBridge.documentState(requestData.data || {});
		const status = state.error
			? (state.error === "SAVE_TARGET_INVALID" ? 400 : 409)
			: 200;
		return [status, "application/json", JSON.stringify({
			version: PaperLoopDOIBridge.version,
			...state
		})];
	}
};

PaperLoopDOIBridge.AddPDFEndpoint = function () {};

PaperLoopDOIBridge.AddPDFEndpoint.prototype = {
	supportedMethods: ["POST"],
	supportedDataTypes: ["application/json"],
	permitBookmarklet: false,

	async init(requestData) {
		const data = requestData.data || {};
		const itemKey = String(data.itemKey || "").trim().toUpperCase();
		const base64 = String(data.base64 || "");
		if (!itemKey || !base64) {
			return [400, "application/json", JSON.stringify({
				error: "ITEM_KEY_AND_PDF_REQUIRED"
			})];
		}
		// 64 MiB binary becomes at most ~89.5M Base64 characters.
		if (base64.length > 89478488) {
			return [413, "application/json", JSON.stringify({error: "PDF_TOO_LARGE"})];
		}
		const lookup = await PaperLoopDOIBridge.findItemByKey(data.libraryID, itemKey);
		if (lookup.notEditable) {
			return [409, "application/json", JSON.stringify({error: "LIBRARY_NOT_EDITABLE"})];
		}
		if (lookup.ambiguous) {
			return [409, "application/json", JSON.stringify({error: "ITEM_KEY_AMBIGUOUS"})];
		}
		const parentItem = lookup.item;
		if (!parentItem || !parentItem.isRegularItem() || parentItem.deleted) {
			return [404, "application/json", JSON.stringify({error: "ITEM_NOT_FOUND"})];
		}
		const library = Zotero.Libraries.get(parentItem.libraryID);
		if (!library || !library.editable || library.filesEditable === false) {
			return [409, "application/json", JSON.stringify({error: "FILES_NOT_EDITABLE"})];
		}
		let result;
		try {
			result = await PaperLoopDOIBridge.importPDF(parentItem, data);
		}
		catch (e) {
			const error = e && e.message === "INVALID_PDF_DATA"
				? "INVALID_PDF_DATA"
				: "PDF_IMPORT_FAILED";
			return [error === "INVALID_PDF_DATA" ? 400 : 500, "application/json", JSON.stringify({
				error,
				phase: e && e.paperLoopPhase ? e.paperLoopPhase : null,
				detail: e && e.message ? String(e.message).slice(0, 500) : ""
			})];
		}
		return [200, "application/json", JSON.stringify({
			version: PaperLoopDOIBridge.version,
			status: "ok",
			libraryID: parentItem.libraryID,
			itemKey: parentItem.key,
			...result
		})];
	}
};
