/*
	***** BEGIN LICENSE BLOCK *****
	
	Copyright © 2024 Corporation for Digital Scholarship
					Vienna, Virginia, USA
					http://zotero.org
	
	This file is part of Zotero.
	
	Zotero is free software: you can redistribute it and/or modify
	it under the terms of the GNU Affero General Public License as published by
	the Free Software Foundation, either version 3 of the License, or
	(at your option) any later version.
	
	Zotero is distributed in the hope that it will be useful,
	but WITHOUT ANY WARRANTY; without even the implied warranty of
	MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
	GNU Affero General Public License for more details.

	You should have received a copy of the GNU Affero General Public License
	along with Zotero.  If not, see <http://www.gnu.org/licenses/>.
	
	***** END LICENSE BLOCK *****
*/

// Used to display a different message for failing translations on pages
// with site-access limits
const SITE_ACCESS_LIMIT_TRANSLATORS = new Set([
	"57a00950-f0d1-4b41-b6ba-44ff0fc30289" // GoogleScholar
]);

const PAPERLOOP_CONTENT_DETECTION_TIMEOUT = 20000;
const PAPERLOOP_SNAPSHOT_CAPTURE_TIMEOUT = 20000;

function determineAttachmentIcon(attachment) {
	if(attachment.linkMode === "linked_url") {
		return Zotero.ItemTypes.getImageSrc("attachment-web-link");
	}
	var contentType = attachment.contentType || attachment.mimeType;
	return Zotero.ItemTypes.getImageSrc(
		contentType === "application/pdf" ? "attachment-pdf" : "attachment-snapshot"
	);
}

function determineAttachmentType(attachment) {
	if (attachment.linkMode === "linked_url") return Zotero.getString("itemType_link");
	var contentType = attachment.contentType || attachment.mimeType;
	if (contentType == "application/pdf") return Zotero.getString("itemType_pdf");
	if (contentType == "application/epub+zip") return Zotero.getString("itemType_epub");
	if (contentType == "text/html") return Zotero.getString("itemType_snapshot");
	return Zotero.getString("itemType_attachment");
}

/**
 * Namespace for page saving related functions injected into pages by the connector
 */
let PageSaving = {
	sessionDetails: {},
	translators: [],
	
	/**
	 * @param itemType
	 * @returns {Promise<Zotero.Translate.Web>}
	 * @private
	 */
	async _initTranslate(itemType=null) {
		let translate;
		if (Zotero.isManifestV3) {
			try {
				translate = await Zotero.VirtualOffscreenTranslate.create();
			} catch (e) {
				Zotero.logError(new Error(`Inject: Initializing translate failed at ${document.location.href}`));
				Zotero.logError(e);
				throw e;
			}
		}
		else {
			translate = new Zotero.Translate.Web();
		}
		translate.setHandler('pageModified', () => {
			Zotero.Messaging.sendMessage("pageModified", true);
		});
		// Async in MV3
		if (Zotero.isManifestV3) {
			await translate.setDocument(document, itemType === 'multiple');
		}
		else {
			translate.setDocument(document);
		}
		return translate;
	},

	/**
	 * Checks for valid page translators and notifies background page
	 * @param force
	 * @returns {Promise<void|*>}
	 */
	async onPageLoad(force) {
		const url = document.location.href;
		const current = this._paperLoopDetectionToken;
		if (this._paperLoopDetectionRefresh?.url === url
			&& this._paperLoopDetectionRefresh.token === current) return this._paperLoopDetectionRefresh.promise;
		if (this._paperLoopDetectionJob && this._paperLoopDetectionURL === url) {
			const copy = this._paperLoopDetectionCopy;
			if (force && copy?.url === url && copy.signature !== this._paperLoopDocumentSignature()) {
				// The offscreen copy predates this request. Coalesce changed-page
				// requests into one fresh detection after the old job has finished.
				const active = this._paperLoopDetectionJob;
				const refresh = {url, token: current};
				this._paperLoopDetectionRefresh = refresh;
				refresh.promise = (async () => {
					try {
						await active;
						if (this._paperLoopDetectionRefresh === refresh) this._paperLoopDetectionRefresh = null;
						if (document.location.href === url && this._paperLoopDetectionToken === refresh.token) {
							return this.onPageLoad(true);
						}
					}
					finally {
						if (this._paperLoopDetectionRefresh === refresh) this._paperLoopDetectionRefresh = null;
					}
				})();
				return refresh.promise;
			}
			return this._paperLoopDetectionJob;
		}
		if (current) current.active = false;
		const token = {url, active: true, generation: (current?.generation || 0) + 1};
		this._paperLoopDetectionToken = token;
		this._paperLoopDetectionRefresh = null;
		this._paperLoopDetectionURL = url;
		this._paperLoopDetectionCopy = null;
		const job = this._paperLoopWithDeadline(this._detectPageTranslators(force, token),
			PAPERLOOP_CONTENT_DETECTION_TIMEOUT, '文献识别超时，请重试').catch(error => {
			if (!this._paperLoopIsCurrentDetection(token)) return;
			this.translators = [];
			this._paperLoopDetection = {status: 'timeout', url};
			token.active = false;
			Zotero.logError(error);
		});
		this._paperLoopDetectionJob = job;
		try { return await job; }
		finally {
			token.active = false;
			if (this._paperLoopDetectionJob === job) this._paperLoopDetectionJob = null;
		}
	},

	_paperLoopIsCurrentDetection(token) {
		return token.active && this._paperLoopDetectionToken === token && document.location.href === token.url;
	},

	async _paperLoopWithDeadline(operation, milliseconds, message) {
		let timer;
		try {
			return await Promise.race([operation, new Promise((_, reject) => {
				timer = setTimeout(() => reject(new Error(message)), milliseconds);
			})]);
		}
		finally { clearTimeout(timer); }
	},

	_paperLoopDocumentSignature() {
		return document.documentElement?.outerHTML || JSON.stringify([
			document.location.href, document.title,
			...['#paramdbcode', '#paramdbname', '#paramfilename'].map(selector =>
				document.querySelector(selector)?.getAttribute('value') || '')
		]);
	},

	_paperLoopPageState() {
		const url = document.location.href;
		const cnki = /^https?:\/\/(?:[a-z0-9-]+\.)*cnki\.net\//i.test(url);
		const article = cnki && /\/kcms2?\/(?:article\/abstract|detail\/detail\.aspx)/i.test(url);
		const metadataReady = !!document.querySelector('#paramdbcode')?.getAttribute('value');
		const verification = cnki && (/\/verify(?:\/|[?#]|$)/i.test(url)
			|| (!metadataReady && /^(?:请(?:完成|进行))?(?:安全验证|访问验证|验证码)(?:\s*[-–—|｜]\s*(?:中国知网|知网|CNKI))?$/i.test((document.title || '').trim())));
		return {url, article, verification, ready: document.readyState, metadataReady};
	},

	async _paperLoopWaitForMetadata(token) {
		const initial = this._paperLoopPageState();
		if (!initial.article || initial.verification || initial.metadataReady) return;
		// CNKI fills hidden fields asynchronously. Wait before the offscreen
		// document copy is made, without changing the supplied Translator.
		const deadline = Date.now() + 10000;
		do {
			await Zotero.Promise.delay(200);
			if (token && !this._paperLoopIsCurrentDetection(token)) return;
			const state = this._paperLoopPageState();
			if (state.url !== initial.url || state.verification || state.metadataReady) return;
		} while (Date.now() < deadline);
	},

	async _detectPageTranslators(force, token) {
		// Keep direct callers on the same bounded, generation-aware path.
		if (!token) return this.onPageLoad(force);
		if (document.location == "about:blank") return;
		if (!this._paperLoopIsCurrentDetection(token)) return;
		const detectionURL = token.url;
		this._paperLoopDetection = {status: 'loading', url: detectionURL};
		// Article routes can display the notebook while slow/offscreen metadata
		// detection is still starting. Search pages keep the existing exclusion.
		if (globalThis.PaperLoopAutoDisplayPolicy?.classifyURL(window.location.href)==='literature') {
			try { await this._paperLoopAutoDisplay(this.translators, token); } catch(error) { Zotero.logError(error); }
		}
		if (!this._paperLoopIsCurrentDetection(token)) return;

		// Reset session on every init so a new save is triggered after JS-based changes
		// (monitorDOMChanges/ZoteroItemUpdated)
		this.sessionDetails = {};

		// wrap this in try/catch so that errors will reach logError
		try {
			if (this.translators.length) {
				if (force) {
					this.translators = [];
				}
				else {
					this._paperLoopDetection = {status: 'ready', url: detectionURL};
					return;
				}
			}

			await this._paperLoopWaitForMetadata(token);
			if (!this._paperLoopIsCurrentDetection(token)) return;
			if (this._paperLoopPageState().verification) {
				this.translators = [];
				this._paperLoopDetection = {status: 'verification', url: detectionURL};
				return;
			}
			this._paperLoopDetectionCopy = {url: detectionURL, signature: this._paperLoopDocumentSignature()};
			let translate = await this._initTranslate();
			if (!this._paperLoopIsCurrentDetection(token)) return;
			let translators = await Zotero.TranslateWeb.detect({ translate });
			if (!this._paperLoopIsCurrentDetection(token)) return;
			this.translators = translators;
			const state = this._paperLoopPageState();
			this._paperLoopDetection = {status: translators.length ? 'ready'
				: state.article && !state.metadataReady ? 'missing-metadata' : 'unrecognized', url: detectionURL};
			Zotero.Connector_Browser.onTranslators(translators, instanceID, document.contentType);
			await this._paperLoopAutoDisplay(translators, token);
		} catch (e) {
			if (!this._paperLoopIsCurrentDetection(token)) return;
			this._paperLoopDetection = {status: 'error', url: detectionURL};
			Zotero.logError(e);
		}
	},

	async paperLoopDetect() {
		await this.onPageLoad(true);
		return {...this._paperLoopDetection, ...this._paperLoopPageState(), count: this.translators.length};
	},

	async paperLoopSaveSnapshot(data) {
		const state = this._paperLoopPageState();
		if (state.url !== data.url) return {status: 'skipped', reason: 'PAGE_CHANGED'};
		if (!state.article || state.verification || state.ready !== 'complete') {
			throw new Error('文献页面尚未加载完成，请回到详情页后重试快照');
		}
		if (!await Zotero.Connector.getPref('automaticSnapshots')) {
			return {status: 'skipped', reason: 'AUTOMATIC_SNAPSHOTS_DISABLED'};
		}
		const remote = await Zotero.Connector.callMethod('paperloop/state', {
			libraryID: data.libraryID, itemKey: data.itemKey
		});
		if (remote.status !== 'existing' || remote.itemKey !== data.itemKey) throw new Error('快照目标条目已失效');
		if (remote.hasSnapshot) return {status: 'present', attachmentKey: remote.snapshotAttachmentKey};
		if (remote.filesEditable === false) return {status: 'skipped', reason: 'FILES_NOT_EDITABLE'};
		if (remote.hasSnapshot === undefined) throw new Error('请安装 PaperLoop for Zotero 0.5.6 后补存快照');
		// Bound only the capture stage: an abandoned SingleFile promise may finish,
		// but it no longer has a continuation capable of uploading its result.
		const content = await this._paperLoopWithDeadline(Zotero.SingleFile.retrievePageData(),
			PAPERLOOP_SNAPSHOT_CAPTURE_TIMEOUT, '快照采集超时，请重试补存快照');
		const snapshotDoc = new DOMParser().parseFromString(content, 'text/html');
		for (const node of snapshotDoc.querySelectorAll('[data-paperloop-sidebar-host]')) node.remove();
		const snapshotContent = '<!DOCTYPE html>' + snapshotDoc.documentElement.outerHTML;
		if (document.location.href !== state.url) throw new Error('网页已切换，请返回原文后补存快照');
		const result = await Zotero.Connector.saveSingleFile({
			method: 'paperloop/add-snapshot', timeout: 120000,
			headers: {'Content-Type': 'application/json'}
		}, {libraryID: data.libraryID, itemKey: data.itemKey, url: state.url,
			title: 'Snapshot', snapshotContent});
		return {status: result.created ? 'saved' : 'present', attachmentKey: result.attachmentKey};
	},

	/**
	 * Display PaperLoop from the content-script side after detection. Chromium
	 * MV3 can lose a background-to-tab message while the service worker is
	 * waking; detection itself already runs in this document, so rendering here
	 * removes that unnecessary return trip.
	 */
	async _paperLoopAutoDisplay(translators, token) {
		if (token && !this._paperLoopIsCurrentDetection(token)) return;
		if (window.top && window.top !== window) return;
		if (!Zotero.PaperLoopSidebar || !globalThis.PaperLoopAutoDisplayPolicy) return;
		const key = 'paperloop:autoDisplayCategories:v2';
		let categories;
		try {
			const stored = await browser.storage.local.get(key);
			categories = PaperLoopAutoDisplayPolicy.normalizeCategories(stored[key]);
		}
		catch (error) {
			Zotero.logError(error);
			categories = PaperLoopAutoDisplayPolicy.normalizeCategories();
		}
		if (token && !this._paperLoopIsCurrentDetection(token)) return;

		const pageCategory = PaperLoopAutoDisplayPolicy.classifyTabInfo({
			translators,
			isPDF: document.contentType === 'application/pdf',
			url: window.location.href
		});
		if (!PaperLoopAutoDisplayPolicy.shouldAutoDisplay(pageCategory, categories)) return;

		let documentKey = window.location.href;
		try {
			const url = new URL(documentKey);
			url.hash = '';
			documentKey = url.href;
		}
		catch (error) {}
		return Zotero.PaperLoopSidebar.autoDisplay({
			open: true,
			pending: false,
			documentKey,
			url: window.location.href,
			title: document.title || '当前文献',
			canSave: translators.length > 0,
			translatorLabel: translators
				.map(translator => translator && translator.label)
				.filter(Boolean)
				.join(' · '),
			pageCategory,
			autoOpen: categories.literature && categories.webpage,
			autoDisplayCategories: {...categories},
			minimized: false,
			position: null
		});
	},

	_initSession(translatorID, saveOptions) {
		if (!saveOptions.resave && this.sessionDetails.id) {
			return this.sessionDetails.id;
		}
		const sessionID = Zotero.Utilities.randomString();
		this.sessionDetails = {
			id: sessionID,
			url: document.location.href,
			translatorID,
			saveOptions
		};
		return sessionID;
	},

	_clearSession() {
		this.sessionDetails = {};
	},

	_shouldReopenProgressWindow(translatorID, options, itemType=null) {
		// We have already saved something on this page
		return this.sessionDetails.id
			// Same page (no history push)
			&& document.location.href == this.sessionDetails.url
			// Same translator
			&& translatorID == this.sessionDetails.translatorID
			// Not a multiple page
			&& itemType != 'multiple'
			// Not "Create Zotero Item and Note from Selection"
			&& !options.note
			// Not from the context menu, which always triggers a resave
			&& !options.resave
	},

	/**
	 * Handles saving when highlighting text on the page and saving via right-click
	 * option "Create Zotero Item and Note from Selection"
	 * @param items
	 */	
	_processNote(items) {
		const saveOptions = this.sessionDetails.saveOptions;
		if (saveOptions && saveOptions.note && items.length) {
			for (let item of items) {
				if (!Array.isArray(item.notes)) {
					item.notes = [];
				}
				item.notes.push({note: saveOptions.note});
			}
		}
		return items;
	},
	
	_onAttachmentProgress(attachment, progress) {
		const sessionID = PageSaving.sessionDetails.id;
		Zotero.Messaging.sendMessage(
			"progressWindow.itemProgress",
			{
				sessionID,
				id: attachment.id,
				iconSrc: determineAttachmentIcon(attachment),
				title: attachment.title,
				parentItem: attachment.parentItem,
				progress,
				itemType: determineAttachmentType(attachment)
			}
		);
	},

	/**
	 * Runs translation and attempts to save items to Zotero or Zotero account
	 * @param translators {Array}
	 * @returns {Promise<*>}
	 */
	async translateAndSave(translators, fallbackOnFailure = false) {
		const sessionID = this.sessionDetails.id;
		let itemsTotal = 0;
		let itemsSaved = 0;
		
		// Translate handlers
		const onSelect = (obj, items, callback) => {
			// Close the progress window before displaying Select Items
			Zotero.Messaging.sendMessage("progressWindow.close", null);

			// If the handler returns a non-undefined value then it is passed
			// back to the callback due to backwards compat code in translate.js
			(async () => {
				var returnItems = await Zotero.Connector_Browser.onSelect(items);

				// If items were selected, reopen the save popup
				if (returnItems && !Zotero.Utilities.isEmpty(returnItems)) {
					let sessionID = this.sessionDetails.id;
					// Record how many items are being saved so that progress window can know
					// when all top-level items are loaded
					itemsTotal = Object.keys(returnItems).length;
					itemsSaved = 0;
					Zotero.Messaging.sendMessage("progressWindow.show", [sessionID]);
				}
				callback(returnItems);
			})();
		};
		const onItemSaving = (obj, item) => {
			itemsSaved += 1;
			// this relays an item from this tab to the top level of the window
			Zotero.Messaging.sendMessage(
				"progressWindow.itemProgress",
				{
					sessionID,
					id: item.id,
					iconSrc: Zotero.ItemTypes.getImageSrc(item.itemType),
					title: item.title,
					itemsLoaded: itemsSaved >= itemsTotal ? itemsSaved : false,
					itemType: item.itemType
				}
			);
		};
		const onTranslatorFallback = (oldTranslator, newTranslator) => {
			Zotero.debug(`Saving with ${oldTranslator.label} failed. Trying ${newTranslator.label}`);
			Zotero.Messaging.sendMessage("progressWindow.error",
				['fallback', oldTranslator.label, newTranslator.label]);
		}
		
		// Item saver handlers
		const onItemsSaved = () => {
			for (let item of items) {
				// this relays an item from this frame to the top level of the window
				Zotero.Messaging.sendMessage(
					"progressWindow.itemProgress",
					{
						sessionID,
						id: item.id,
						iconSrc: Zotero.ItemTypes.getImageSrc(item.itemType),
						title: item.title,
						progress: 100,
						itemsLoaded: items.length,
						itemType: item.itemType
					}
				);
				
				if (item.notes) {
					for (let note of item.notes) {
						Zotero.Messaging.sendMessage(
							'progressWindow.itemProgress',
							{
								sessionID,
								id: null,
								iconSrc: Zotero.getExtensionURL("images/treeitem-note.png"),
								title: Zotero.Utilities.cleanTags(note.note),
								parentItem: item.id,
								progress: 100,
								itemType: Zotero.getString("itemType_note")
							}
						)
					}
				}
			}
		}

		let translate = await this._initTranslate(translators[0].itemType);
		let options = { translate, translators: translators.slice(), onSelect, onItemSaving, onTranslatorFallback };
		try {
			var { items, proxy } = await Zotero.TranslateWeb.translate(options);
		} catch (e) {
			if (translators[0].itemType != 'multiple' && fallbackOnFailure) {
				if (this.sessionDetails.saveOptions && this.sessionDetails.saveOptions.paperLoop) {
					throw e;
				}
				Zotero.Messaging.sendMessage("progressWindow.error", ['fallback', this.translators.at(-1).label, "Save as Webpage"]);
				Zotero.debug(`Saving with ${translators[0].label} failed. Falling back to saving as webpage`);
				return this.saveAsWebpage({ snapshot: true });
			}
			throw e;
		}
		if (Zotero.isManifestV3) {
			proxy = await translate.getProxy();
			if (proxy) proxy = new Zotero.Proxy(proxy);
		}
		items = this._processNote(items);
		this.sessionDetails.items = items;
		let itemType = translators[0].itemType;
		const saveOptions = this.sessionDetails.saveOptions || {};
		let itemSaver = new Zotero.ItemSaver({
			sessionID,
			itemType,
			baseURI: document.location.href,
			proxy,
			paperLoop: saveOptions.paperLoop
				? {
					...saveOptions.paperLoop,
					note: saveOptions.paperLoop.note || saveOptions.note || ""
				}
				: null
		});
		this.sessionDetails.itemSaver = itemSaver;
		return itemSaver.saveItems(items, PageSaving._onAttachmentProgress, onItemsSaved)
	},

	/**
	 * Saves the website without a translator which creates a webpage item in Zotero
	 * and optionally attaches the snapshot using SingleFile
	 * @param sessionID
	 * @param title
	 * @param saveSnapshot
	 * @returns {Promise<*>}
	 */
	async saveAsWebpage({ title=document.title, snapshot: saveSnapshot=true } = {}) {
		var result = await Zotero.Inject.checkActionToServer();
		if (!result) return;

		var isTextLike = document.contentType.startsWith('text')
			|| document.contentType.includes('html');
		if (!isTextLike) {
			return await this._saveAsStandaloneAttachment({title, saveSnapshot});
		}
		return await this._saveAsWebpage({title, saveSnapshot});
	},
	
	async _saveAsWebpage({ title, saveSnapshot } = {}) {
		const sessionID = this.sessionDetails.id;
		var translatorID = 'webpage' + (saveSnapshot ? 'WithSnapshot' : '');
		var data = {
			sessionID,
			url: document.location.toString(),
			referrer: document.referrer,
			title: title,
		};

		var image;
		if (document.contentType == 'application/pdf') {
			data.pdf = true;
			image = "attachment-pdf";
		} else {
			image = "webpage";
		}

		Zotero.Messaging.sendMessage("progressWindow.show", [sessionID]);
		let items = [{
			sessionID,
			id: 1,
			iconSrc: Zotero.ItemTypes.getImageSrc(image),
			title: title
		}];
		this.sessionDetails.items = items;
		Zotero.Messaging.sendMessage("progressWindow.itemProgress", items[0]);

		try {
			var result = await Zotero.Connector.callMethod("saveSnapshot", data);
			Zotero.Messaging.sendMessage("progressWindow.sessionCreated", { sessionID });
			items[0] = { ...items[0], progress: 100, itemsLoaded: 1 };
			Zotero.Messaging.sendMessage("progressWindow.itemProgress", items[0]);

			if (saveSnapshot) {
				await this._saveSingleFile(items[0], data);
			}

			Zotero.Messaging.sendMessage("progressWindow.done", [true]);
			Object.assign(this.sessionDetails, {
				id: sessionID,
				url: document.location.href,
				translatorID
			});
			return result;
		} catch (e) {
			// Client unavailable
			if (e.status === 0) {
				let itemSaver = new Zotero.ItemSaver({});
				this.sessionDetails.itemSaver = itemSaver;
				let result = await itemSaver.saveAsWebpage();
				items[0].key = result[0].key;
				Zotero.Messaging.sendMessage("progressWindow.itemProgress", { ...items[0], progress: 100 });
				const automaticSnapshots = await Zotero.Prefs.getAsync("automaticSnapshots")
				if (automaticSnapshots) {
					await this._saveSingleFile(items[0], data, true);
				}
				Zotero.Messaging.sendMessage("progressWindow.done", [true]);
				return;
			}
			// Unexpected error, including a timeout (which we don't want to
			// result in a save to the server, because it's possible the request
			// will still be processed)
			else if (!e.value || e.value.libraryEditable != false) {
				Zotero.Messaging.sendMessage("progressWindow.done", [false, 'unexpectedError']);
			}
			throw e;
		}
	},

	async _saveSingleFile(item, data, toServer = false) {
		let isSingleFileAvailable = document.contentType.startsWith("text")
			|| document.contentType.includes("html");
		// Once snapshot item is created, if requested, run SingleFile
		if (isSingleFileAvailable) {
			item.attachments = [{
				sessionID: data.sessionID,
				id: 2,
				iconSrc: Zotero.ItemTypes.getImageSrc("attachment-snapshot"),
				title: "Snapshot",
				parentItem: 1,
				parentKey: item.key,
				progress: 0,
				itemType: Zotero.getString("itemType_snapshot"),
				mimeType: "text/html",
				linkMode: "imported_url",
				itemsLoaded: 1
			}]
			let snapshotItem = item.attachments[0];

			Zotero.Messaging.sendMessage("progressWindow.itemProgress", snapshotItem);

			const snapshotContent = await Zotero.SingleFile.retrievePageData();

			if (toServer) {
				snapshotItem.data = snapshotContent;
				await Zotero.ItemSaver.saveAttachmentToServer(snapshotItem);
			}
			else {
				data.snapshotContent = snapshotContent;
				await Zotero.Connector.saveSingleFile({
						method: "saveSingleFile",
						headers: {"Content-Type": "application/json"}
					},
					data
				);
			}

			Zotero.Messaging.sendMessage("progressWindow.itemProgress", { ...snapshotItem, progress: 100 });
		}
	},

	async _saveAsStandaloneAttachment({ title=document.title } = {}) {
		const sessionID = this.sessionDetails.id;
		// document.title is empty on Safari
		if (!title) {
			title = new URL(document.location.href).pathname.split('/').pop();
		}
		let itemType = "webpage";
		if (document.contentType === 'application/pdf') {
			itemType = "pdf"
		}
		else if (document.contentType === 'application/epub+zip') {
			itemType = "epub";
		}

		let progressItem = {
			sessionID,
			id: 1,
			iconSrc: Zotero.ItemTypes.getImageSrc(`attachment-${itemType}`),
			title,
			progress: 0,
			// TODO passed to ProgressWindow for accessibility messages. Needs to be updated there
			itemType: Zotero.getString(`itemType_${itemType}`),
		};

		Zotero.Messaging.sendMessage("progressWindow.show", [sessionID, null, false, true]);
		Zotero.Messaging.sendMessage(
			"progressWindow.itemProgress",
			progressItem
		);

		let standaloneAttachment = {
			url: document.location.toString(),
			mimeType: document.contentType,
			title,
			linkMode: "imported_url",
			referrer: document.referrer
		}

		try {
			await Zotero.ItemSaver.fetchAttachmentSafari(standaloneAttachment);
			let { canRecognize } = await Zotero.ItemSaver.saveStandaloneAttachmentToZotero(standaloneAttachment, sessionID)
			Zotero.Messaging.sendMessage("progressWindow.sessionCreated", { sessionID });
			progressItem.progress = 100;
			Zotero.Messaging.sendMessage("progressWindow.itemProgress", { ...progressItem, ...{ progress: 100 } });

			if (canRecognize) {
				let item = await Zotero.Connector.callMethod("getRecognizedItem", { sessionID: sessionID });
				if (item) {
					item.id = 2;
					item.iconSrc = Zotero.ItemTypes.getImageSrc(item.itemType);
					progressItem.parentItem = 2;
					Zotero.Messaging.sendMessage("progressWindow.itemProgress", { ...item, ...{ progress: 100 } });
					setTimeout(() => {
						Zotero.Messaging.sendMessage("progressWindow.itemProgress", { ...progressItem, ...{ progress: 100 } });
					}, 50);
				}
			}

			Zotero.Messaging.sendMessage("progressWindow.done", [true]);
			Object.assign(this.sessionDetails, {
				id: sessionID,
				url: document.location.href,
			});
		} catch (e) {
			// Client unavailable
			if (e.status === 0) {
				Zotero.Messaging.sendMessage("progressWindow.itemProgress", { ...progressItem, ...{ progress: 0 } });
				await Zotero.ItemSaver.saveAttachmentToServer(standaloneAttachment);
				Zotero.Messaging.sendMessage("progressWindow.itemProgress", { ...progressItem, ...{ progress: 100 } });
				Zotero.Messaging.sendMessage("progressWindow.done", [true]);
				return;
			}
			else if (!e.value || e.value.libraryEditable != false) {
				// Unexpected error, including a timeout (which we don't want to
				// result in a save to the server, because it's possible the request
				// will still be processed)
				Zotero.Messaging.sendMessage("progressWindow.done", [false, 'unexpectedError']);
			}
			throw e;
		}
	},

	/**
	 * Entry point for translation initiated by clicking on the Zotero button or via the
	 * browser extension context menu by selecting a specific translator or saving
	 * with selection as a note.
	 */
	async onTranslate(translatorID, options={}) {
		let result = await Zotero.Inject.checkActionToServer();
		if (!result) return;
		let translatorIndex = this.translators.findIndex(t => t.translatorID === translatorID);
		let translator = this.translators[translatorIndex];
		Zotero.debug(`PageSaving.onTranslate: Translating with ${translator.label}, ${JSON.stringify(options)}`);
		
		// Always resave if a different translator/mode
		if (this.sessionDetails.translatorID && translatorID != this.sessionDetails.translatorID) {
			options.resave = true;
		}
		
		// In some cases, we just reopen the popup instead of saving again
		if (!options.paperLoop
			&& this._shouldReopenProgressWindow(translatorID, options, translator.itemType)) {
			Zotero.debug(`PageSaving.onTranslate: Reopening popup`);
			return Zotero.Messaging.sendMessage("progressWindow.show", [this.sessionDetails.id]);
		}

		// Each save on multiple should be a new session (do not reopen the popup)
		if (translator.itemType === 'multiple' && this.sessionDetails.id && !options.resave) {
			options.resave = true;
		}

		const sessionID = this._initSession(translatorID, options);

		// If we're likely to show the Select Items window, delay the opening of the
		// popup until we've had a chance to hide it (which happens in the 'select'
		// callback in progressWindow_inject.js).
		let delay = translator.itemType == 'multiple' ? 100 : 0;
		let sendShowMessage = () => {
			Zotero.Messaging.sendMessage(
				"progressWindow.show",
				[
					sessionID,
					null,
					false,
				]
			);
		}
		// If tab is not focused (e.g. when saving multiple), setTimeout with 0 delay actually waits for
		// a long time, probably due to how non-focused tabs are deprioritized in the event loop and causes
		// the progress window to not be displayed/updated properly
		if (options.paperLoop) {
			// PaperLoop already provides a persistent target selector and save status.
			// Keep the native translator/save session, but do not open a second target UI.
		}
		else if (delay) {
			setTimeout(sendShowMessage, delay)
		}
		else {
			sendShowMessage();
		}
		
		try {
			let translators = this.translators.slice(translatorIndex);
			// If no fallback on failure, only provide the selected translator
			if (!options.fallbackOnFailure) {
				translators = translators.slice(0, 1)
			}
			let items = await this.translateAndSave(translators, options.fallbackOnFailure);
			if (!options.paperLoop) {
				Zotero.Messaging.sendMessage("progressWindow.done", [true]);
			}
			return items;
		} catch (e) {
			Zotero.logError(e);
			// Clear session details on failure, so another save click tries again
			this._clearSession();
			// We delay opening the progressWindow for multiple items so we don't have to flash it
			// for the select dialog. But it comes back to bite us in the butt if a translation
			// error occurs immediately since the below command will execute before the progressWindow show,
			// and then the delayed progressWindow.show will pop up another empty progress window.
			// Cannot have that!
			await Zotero.Promise.delay(500);
			const isAccessLimitingTranslator = SITE_ACCESS_LIMIT_TRANSLATORS.has(translator.translatorID);
			const errorMessage = e.toString();
			let statusCode = '';
			try {
				statusCode = errorMessage.match(/status code ([0-9]{3})/)[1];
			} catch (e) {}
			const isHTTPErrorForbidden = statusCode == '403';
			const isHTTPErrorTooManyRequests = statusCode == '429';
			if (options.paperLoop) {
				throw e;
			}
			if ((isAccessLimitingTranslator && isHTTPErrorForbidden) || isHTTPErrorTooManyRequests) {
				Zotero.Messaging.sendMessage("progressWindow.done", [false, 'siteAccessLimits', translator.label]);
			}
			else {
				Zotero.Messaging.sendMessage("progressWindow.done", [false]);
			}
		}
	},

	/**
	 * Entry point for clicking on the Zotero button to save when no translators are available
	 */
	async onSaveAsWebpage([ title=document.title, options={} ]) {
		var result = await Zotero.Inject.checkActionToServer();
		if (!result) return;

		Zotero.debug(`PageSaving.onSaveAsWebpage: Saving webpage, ${JSON.stringify(options)}`);

		var translatorID = 'webpage' + (options.snapshot ? 'WithSnapshot' : '');
		options.snapshot = !!options.snapshot;
		// Always resave if a different translator/mode
		if (this.sessionDetails.translatorID && translatorID != this.sessionDetails.translatorID) {
			options.resave = true;
		}
		
		// In some cases, we just reopen the popup instead of saving again
		if (this._shouldReopenProgressWindow(translatorID, options)) {
			return Zotero.Messaging.sendMessage("progressWindow.show", [this.sessionDetails.id]);
		}
		
		var sessionID = this._initSession(translatorID, options);
		return await this.saveAsWebpage({sessionID, title, snapshot: options.snapshot, resave: options.resave});
	},

	/**
	 * Updates the session with the given data.
	 * @param {Object} data - The data to update the session with.
	 * @param {String} data.targetId - The target ID
	 * @param {Boolean} data.resaveAttachments - Whether attachments should be resaved
	 * @param {Boolean} data.removeAttachments - Whether attachments should be removed
	 * @param {String[]} data.tags - A list of tags
	 * @param {String[]} data.note - A child note to add to the items
	 */
	async onUpdateSession(data) {
		// This message is received in every frame from the progress window
		// iframe due to how messaging is set up, and we need to ignore it
		// on all but the frame that has sessionDetails.id - is translating.
		if (!this.sessionDetails.id) return;
		// PaperLoop's sidebar target is the sole source of truth for its save.
		// Ignore delayed/stale target changes from the standard progress UI;
		// ItemSaver applies the PaperLoop target directly through updateSession.
		if (this.sessionDetails.saveOptions
			&& this.sessionDetails.saveOptions.paperLoop) return;
		await Zotero.Connector.callMethod(
			"updateSession",
			{
				sessionID: this.sessionDetails.id,
				target: data.target,
				tags: data.tags,
				note: data.note
			}
		);

		if (data.resaveAttachments && this.sessionDetails.itemSaver) {
			Zotero.Messaging.sendMessage("progressWindow.show", [this.sessionDetails.id]);
			await this.sessionDetails.itemSaver.saveAttachmentsToZotero(
				PageSaving._onAttachmentProgress
			);
			Zotero.Messaging.sendMessage("progressWindow.done", [true]);
		}
		else if (data.removeAttachments) {
			for (let item of this.sessionDetails.items) {
				for (let attachment of item.attachments) {
					Zotero.Messaging.sendMessage(
						"progressWindow.itemProgress",
						{
							sessionID: this.sessionDetails.id,
							id: attachment.id,
							progress: -1,
						}
					);
				}
			}
		}
	}
}

Zotero.PageSaving = PageSaving;
