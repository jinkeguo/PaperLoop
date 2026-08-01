/*
 * PaperLoop persistent reading sidebar.
 *
 * This deliberately does not reuse ModalPrompt: the host article must remain
 * scrollable and selectable while the user writes. The panel is isolated in a
 * Shadow DOM and never changes documentElement/body overflow or page position.
 */
Zotero.PaperLoopSidebar = new function () {
	const WIDTH = 420;
	const GAP = 12;
	const DRAFT_PREFIX = 'paperloop:draft:v1:';
	const SYNC_PREFIX = 'paperloop:sync:v1:';
	const LANGUAGE_KEY = 'paperloop:language:v1';
	const STRINGS = {
		zh: {
			currentPaper: '当前文献',
			waitingForZotero: '等待 Zotero 识别',
			libraryRootSuffix: '（根目录）',
			libraryRoot: '文库根目录',
			noEditableTargets: '没有找到可编辑的 Zotero 分类',
			targetSelected: '当前论文将保存到：{target}',
			classificationFailed: '分类选择失败：{detail}',
			searching: '搜索中…',
			search: '搜索',
			readTargetsFailed: '无法读取 Zotero 分类：{detail}',
			confirmZotero: '请确认 Zotero 已启动',
			conflict: 'Zotero 笔记和浏览器草稿都已变化；已保留浏览器草稿，请选择是否载入 Zotero 内容',
			deleted: 'Zotero 中的关联条目位于回收站；再次收藏时将重新建立有效条目关联',
			recognizing: '正在识别当前页面…',
			recognizedTarget: '已识别；将完整收藏到：{target}',
			loadingTargets: '已识别；正在读取 Zotero 分类…',
			chooseTarget: '请先选择保存到哪个 Zotero 分类',
			unrecognized: '当前页面暂未识别，不会创建残缺条目',
			syncAgain: '再次同步思考',
			saveSelected: '一键收藏到所选分类',
			expand: '展开 PaperLoop',
			panelAria: 'PaperLoop 文献收藏与思考',
			reset: '复位到右侧',
			minimize: '最小化到网页边缘',
			minimizeAria: '最小化 PaperLoop',
			close: '彻底隐藏',
			closeAria: '彻底隐藏 PaperLoop',
			loadZoteroNote: '载入 Zotero 笔记',
			chooseZoteroTarget: '选择 Zotero 分类',
			refreshZotero: '刷新 Zotero',
			autoOpen: '自动识别后打开',
			searchPlaceholder: '分类名称，如 生物、化学',
			cancelSelection: '取消选择',
			thoughtLabel: '阅读思考',
			thoughtPlaceholder: '为什么重要？可用于论文哪一部分？与哪些工作相关？',
			draftHint: '草稿自动保存在当前浏览器；写入 Zotero 仍由下方按钮明确触发。',
			saveToZotero: '一键收藏到 Zotero',
			switchLanguage: 'Switch to English',
			autoOpenFailed: '自动打开设置保存失败',
			writing: '正在写入 Zotero…',
			translatorSaving: '正在用 Zotero Translator 收藏到：{target}…',
			pdfAdded: '思考已同步，并已向原 Zotero 条目补充 PDF（{target}）',
			pdfFailed: '思考已同步，但 PDF 补充失败：{detail}',
			noPdf: '思考已同步；当前 Translator 没有提供可下载 PDF',
			autoAttachmentsDisabled: '思考已同步；Zotero 的“自动下载关联文件”当前已关闭',
			classified: '已加入 {target}；原有分类保留',
			repeatedContent: '思考内容没有变化；已保持同一条 Zotero 笔记（{target}）',
			updatedThought: '已更新同一条 PaperLoop 思考（{target}）',
			savedThought: '已写入 {target}；后续修改会更新同一条思考',
			saveFailed: '保存失败：{detail}'
		},
		en: {
			currentPaper: 'Current paper',
			waitingForZotero: 'Waiting for Zotero detection',
			libraryRootSuffix: ' (root)',
			libraryRoot: 'Library root',
			noEditableTargets: 'No editable Zotero libraries or collections found',
			targetSelected: 'This paper will be saved to: {target}',
			classificationFailed: 'Destination selection failed: {detail}',
			searching: 'Searching…',
			search: 'Search',
			readTargetsFailed: 'Could not read Zotero destinations: {detail}',
			confirmZotero: 'Make sure Zotero is running',
			conflict: 'Both the Zotero note and browser draft changed. The browser draft was preserved; choose whether to load the Zotero version.',
			deleted: 'The linked Zotero item is in the trash. Saving again will create or reconnect a valid item.',
			recognizing: 'Detecting the current page…',
			recognizedTarget: 'Paper detected; ready to save to: {target}',
			loadingTargets: 'Paper detected; loading Zotero destinations…',
			chooseTarget: 'Choose a Zotero library or collection first',
			unrecognized: 'This page is not recognized; no incomplete item will be created',
			syncAgain: 'Sync thought again',
			saveSelected: 'Save to selected destination',
			expand: 'Expand PaperLoop',
			panelAria: 'PaperLoop paper capture and thoughts',
			reset: 'Reset to the right',
			minimize: 'Minimize to page edge',
			minimizeAria: 'Minimize PaperLoop',
			close: 'Hide completely',
			closeAria: 'Hide PaperLoop completely',
			loadZoteroNote: 'Load Zotero note',
			chooseZoteroTarget: 'Choose Zotero destination',
			refreshZotero: 'Refresh Zotero',
			autoOpen: 'Open after paper detection',
			searchPlaceholder: 'Collection name, e.g. Biology',
			cancelSelection: 'Clear selection',
			thoughtLabel: 'Reading thought',
			thoughtPlaceholder: 'Why does this matter? Where could it support the paper? What work is it related to?',
			draftHint: 'The draft is saved in this browser. Writing to Zotero only happens when you press the button below.',
			saveToZotero: 'Save to Zotero',
			switchLanguage: '切换到中文',
			autoOpenFailed: 'Could not save the automatic-opening setting',
			writing: 'Writing to Zotero…',
			translatorSaving: 'Saving with Zotero Translator to: {target}…',
			pdfAdded: 'Thought synchronized and a PDF was added to the existing Zotero item ({target})',
			pdfFailed: 'Thought synchronized, but PDF backfill failed: {detail}',
			noPdf: 'Thought synchronized; the current translator did not provide a downloadable PDF',
			autoAttachmentsDisabled: 'Thought synchronized; Zotero automatic attachment downloads are disabled',
			classified: 'Added to {target}; existing collections were preserved',
			repeatedContent: 'The thought is unchanged; the same Zotero note was kept ({target})',
			updatedThought: 'Updated the same PaperLoop thought ({target})',
			savedThought: 'Saved to {target}; later edits will update the same thought',
			saveFailed: 'Save failed: {detail}'
		}
	};
	let host = null;
	let shadow = null;
	let elements = {};
	let state = null;
	let saveTimer = null;
	let documentToken = 0;
	let saving = false;
	let pickerLoading = false;
	let targetsLoaded = false;
	let dragState = null;
	let resizeHandler = null;
	let refreshTimer = null;
	let refreshPending = false;
	let language = 'zh';
	let languageLoaded = false;
	let lastTargets = [];
	const draftCache = new Map();

	function text(key, values={}) {
		const messages = STRINGS[language] || STRINGS.zh;
		const template = messages[key] || STRINGS.zh[key] || key;
		return template.replace(/\{([A-Za-z0-9_]+)\}/g, (match, name) =>
			Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : match
		);
	}

	function detectedLanguage() {
		let value = '';
		try {
			value = browser.i18n && browser.i18n.getUILanguage
				? browser.i18n.getUILanguage()
				: navigator.language;
		}
		catch (e) {
			value = navigator.language;
		}
		return /^zh(?:-|$)/i.test(String(value || '')) ? 'zh' : 'en';
	}

	async function readLanguage() {
		if (languageLoaded) return language;
		try {
			const stored = await browser.storage.local.get(LANGUAGE_KEY);
			const value = stored[LANGUAGE_KEY];
			language = value === 'zh' || value === 'en' ? value : detectedLanguage();
		}
		catch (e) {
			Zotero.logError(e);
			language = detectedLanguage();
		}
		languageLoaded = true;
		return language;
	}

	function draftKey(documentKey) {
		return DRAFT_PREFIX + String(documentKey || window.location.href).slice(0, 1800);
	}

	function syncKey(documentKey) {
		return SYNC_PREFIX + String(documentKey || window.location.href).slice(0, 1800);
	}

	async function readSyncMeta(documentKey) {
		try {
			const key = syncKey(documentKey);
			const stored = await browser.storage.local.get(key);
			const value = stored[key];
			return value && typeof value === 'object' ? value : null;
		}
		catch (e) {
			Zotero.logError(e);
			return null;
		}
	}

	async function writeSyncMeta(documentKey, remote) {
		if (!remote || !remote.noteKey) return;
		const key = syncKey(documentKey);
		await browser.storage.local.set({[key]: {
			syncedText: String(remote.thought || ''),
			noteKey: remote.noteKey,
			noteModified: remote.noteModified || ''
		}});
	}

	function detectedDOI() {
		const selectors = [
			'meta[name="citation_doi"]',
			'meta[name="dc.identifier"]',
			'meta[name="DC.Identifier"]',
			'meta[name="prism.doi"]',
			'meta[property="citation_doi"]'
		];
		const values = selectors
			.map(selector => document.querySelector(selector))
			.filter(Boolean)
			.map(element => element.content || '');
		values.push(window.location.href);
		for (const value of values) {
			let decoded = String(value || '');
			try { decoded = decodeURIComponent(decoded); }
			catch (e) {}
			const match = decoded.match(/10\.\d{4,9}\/[^\s"'<>?#]+/i);
			if (match) return match[0].replace(/[.,;:)}\]]+$/, '').toLowerCase();
		}
		return '';
	}

	async function readDraft(documentKey) {
		try {
			const key = draftKey(documentKey);
			if (draftCache.has(key)) return draftCache.get(key);
			const stored = await browser.storage.local.get(key);
			const value = typeof stored[key] === 'string' ? stored[key] : '';
			draftCache.set(key, value);
			return value;
		}
		catch (e) {
			Zotero.logError(e);
			return '';
		}
	}

	async function writeDraftValue(key, value) {
		try {
			if (value) {
				await browser.storage.local.set({[key]: value});
			}
			else {
				await browser.storage.local.remove(key);
			}
		}
		catch (e) {
			Zotero.logError(e);
		}
	}

	function persistDraft() {
		if (!state || !elements.thought) return;
		const key = draftKey(state.documentKey);
		const value = elements.thought.value;
		draftCache.set(key, value);
		clearTimeout(saveTimer);
		saveTimer = setTimeout(() => writeDraftValue(key, value), 250);
	}

	function flushDraft() {
		if (!state) return null;
		const key = draftKey(state.documentKey);
		const value = draftCache.has(key)
			? draftCache.get(key)
			: (elements.thought ? elements.thought.value : '');
		draftCache.set(key, value);
		clearTimeout(saveTimer);
		return writeDraftValue(key, value);
	}

	function setStatus(kind, value, messageKey=null, messageValues={}) {
		if (!elements.status) return;
		elements.status.dataset.kind = kind || 'neutral';
		elements.status.textContent = value || '';
		if (state) {
			state.statusKind = kind || 'neutral';
			state.statusMessageKey = messageKey;
			state.statusMessageValues = messageValues;
		}
		if (elements.miniDot) elements.miniDot.dataset.kind = kind || 'neutral';
	}

	function setLocalizedStatus(kind, key, values={}) {
		setStatus(kind, text(key, values), key, values);
	}

	function targetMeta(target) {
		return target && (target.path || target.name || target.targetID) || '';
	}

	async function refreshZoteroState() {
		if (refreshPending || !state || !state.documentKey || !state.selectedTarget) return null;
		if (!Zotero.Connector_Browser.paperLoopGetDocumentState) return null;
		refreshPending = true;
		const token = documentToken;
		try {
			const remote = await Zotero.Connector_Browser.paperLoopGetDocumentState({
				documentKey: state.documentKey,
				targetID: state.selectedTarget.targetID,
				doi: detectedDOI()
			});
			if (token !== documentToken || !host || !state) return null;
			state.remote = remote;
			state.remoteDeleted = remote.status === 'deleted';
			state.remoteConflict = false;
			elements.remoteLoad.hidden = true;
			if (remote.noteKey) {
				const localText = elements.thought.value;
				const remoteText = String(remote.thought || '');
				const syncMeta = await readSyncMeta(state.documentKey);
				if (!localText || (syncMeta && localText === String(syncMeta.syncedText || ''))) {
					elements.thought.value = remoteText;
					persistDraft();
					await writeSyncMeta(state.documentKey, remote);
				}
				else if (localText === remoteText) {
					await writeSyncMeta(state.documentKey, remote);
				}
				else {
					state.remoteConflict = true;
					elements.remoteLoad.hidden = false;
				}
			}
			renderState();
			return remote;
		}
		catch (e) {
			// Bridge 0.1.14 and older do not expose the read-only state endpoint.
			Zotero.debug(`PaperLoop Zotero state refresh unavailable: ${e.message}`);
			return null;
		}
		finally {
			refreshPending = false;
		}
	}

	function startRefreshTimer() {
		clearInterval(refreshTimer);
		refreshTimer = setInterval(() => refreshZoteroState(), 15000);
	}

	function renderSelectedTarget() {
		const target = state && state.selectedTarget;
		elements.selected.hidden = !target;
		if (!target) return;
		elements.selectedTitle.textContent = target.type === 'library'
			? `${target.name}${text('libraryRootSuffix')}`
			: target.name;
		elements.selectedMeta.textContent = targetMeta(target);
	}

	function renderResults(targets) {
		lastTargets = targets;
		elements.results.textContent = '';
		if (!targets.length) {
			const empty = document.createElement('div');
			empty.className = 'empty';
			empty.textContent = text('noEditableTargets');
			elements.results.appendChild(empty);
			return;
		}
		for (const target of targets) {
			const button = document.createElement('button');
			button.type = 'button';
			button.className = 'result';
			const title = document.createElement('span');
			title.className = 'result-title';
			title.textContent = `${'　'.repeat(Math.max(0, target.level - 1))}${target.name}`;
			const meta = document.createElement('span');
			meta.className = 'result-meta';
			meta.textContent = target.type === 'library' ? text('libraryRoot') : target.path;
			button.append(title, meta);
			button.addEventListener('click', async () => {
				try {
					const response = await Zotero.Connector_Browser.paperLoopSetTarget({
						targetID: target.targetID
					});
					state.selectedTarget = response.target || target;
					elements.picker.hidden = true;
					renderSelectedTarget();
					setLocalizedStatus('ready', 'targetSelected', {target: targetMeta(state.selectedTarget)});
					renderState();
					await refreshZoteroState();
				}
				catch (e) {
					setLocalizedStatus('error', 'classificationFailed', {
						detail: e && e.message ? e.message : text('confirmZotero')
					});
				}
			});
			elements.results.appendChild(button);
		}
	}

	async function loadTargets() {
		if (pickerLoading) return;
		pickerLoading = true;
		elements.search.disabled = true;
		elements.search.textContent = text('searching');
		elements.results.textContent = '';
		try {
			const response = await Zotero.Connector_Browser.paperLoopGetCollections({
				query: elements.query.value
			});
			const targets = response.targets || [];
			if (!state.selectedTarget && response.selectedTargetID) {
				state.selectedTarget = targets.find(target =>
					target.targetID === response.selectedTargetID
				) || null;
			}
			targetsLoaded = true;
			renderResults(targets);
			renderState();
			if (state.selectedTarget) await refreshZoteroState();
		}
		catch (e) {
			const empty = document.createElement('div');
			empty.className = 'empty error-text';
			empty.textContent = text('readTargetsFailed', {
				detail: e && e.message ? e.message : text('confirmZotero')
			});
			elements.results.appendChild(empty);
			setLocalizedStatus('error', 'readTargetsFailed', {
				detail: e && e.message ? e.message : text('confirmZotero')
			});
		}
		finally {
			pickerLoading = false;
			elements.search.disabled = false;
			elements.search.textContent = text('search');
		}
	}

	function applyStaticText() {
		if (!host) return;
		elements.mini.title = text('expand');
		elements.mini.setAttribute('aria-label', text('expand'));
		elements.panel.setAttribute('aria-label', text('panelAria'));
		elements.language.textContent = language === 'zh' ? 'EN' : '中';
		elements.language.title = text('switchLanguage');
		elements.language.setAttribute('aria-label', text('switchLanguage'));
		elements.reset.title = text('reset');
		elements.reset.setAttribute('aria-label', text('reset'));
		elements.minimize.title = text('minimize');
		elements.minimize.setAttribute('aria-label', text('minimizeAria'));
		elements.close.title = text('close');
		elements.close.setAttribute('aria-label', text('closeAria'));
		elements.remoteLoad.textContent = text('loadZoteroNote');
		elements.choose.textContent = text('chooseZoteroTarget');
		elements.refresh.textContent = text('refreshZotero');
		elements.autoLabel.textContent = text('autoOpen');
		elements.query.placeholder = text('searchPlaceholder');
		elements.search.textContent = pickerLoading ? text('searching') : text('search');
		elements.selectedClear.title = text('cancelSelection');
		elements.selectedClear.setAttribute('aria-label', text('cancelSelection'));
		elements.thoughtLabel.textContent = text('thoughtLabel');
		elements.thought.placeholder = text('thoughtPlaceholder');
		elements.hint.textContent = text('draftHint');
		elements.save.textContent = state && state.saved ? text('syncAgain') : text('saveSelected');
	}

	function applyLanguage() {
		if (!host) return;
		applyStaticText();
		if (!state) return;
		elements.title.textContent = state.title || text('currentPaper');
		elements.source.textContent = state.translatorLabel || text('waitingForZotero');
		renderSelectedTarget();
		if (targetsLoaded) renderResults(lastTargets);
		if (state.statusMessageKey) {
			setLocalizedStatus(
				state.statusKind,
				state.statusMessageKey,
				state.statusMessageValues || {}
			);
		}
		else {
			renderState();
		}
	}

	async function setLanguage(nextLanguage) {
		if (nextLanguage !== 'zh' && nextLanguage !== 'en') return false;
		language = nextLanguage;
		languageLoaded = true;
		await browser.storage.local.set({[LANGUAGE_KEY]: language});
		applyLanguage();
		return true;
	}

	function renderState() {
		if (!state || !host) return;
		elements.title.textContent = state.title || text('currentPaper');
		elements.title.title = state.title || '';
		elements.source.textContent = state.translatorLabel || text('waitingForZotero');
		if (state.remoteConflict) {
			setLocalizedStatus('conflict', 'conflict');
		}
		else if (state.remoteDeleted) {
			setLocalizedStatus('pending', 'deleted');
		}
		else if (state.pending) {
			setLocalizedStatus('pending', 'recognizing');
		}
		else if (state.canSave && state.selectedTarget) {
			setLocalizedStatus('ready', 'recognizedTarget', {target: targetMeta(state.selectedTarget)});
		}
		else if (state.canSave && !targetsLoaded) {
			setLocalizedStatus('pending', 'loadingTargets');
		}
		else if (state.canSave) {
			setLocalizedStatus('error', 'chooseTarget');
		}
		else {
			setLocalizedStatus('error', 'unrecognized');
		}
		elements.save.disabled = saving || !state.canSave || !state.selectedTarget;
		elements.save.textContent = state.saved ? text('syncAgain') : text('saveSelected');
		if (elements.autoOpen) elements.autoOpen.checked = state.autoOpen !== false;
		renderSelectedTarget();
	}

	function renderViewMode() {
		if (!host || !state) return;
		const minimized = !!state.minimized;
		elements.panel.hidden = minimized;
		elements.mini.hidden = !minimized;
		if (minimized) {
			host.style.width = '36px';
			host.style.height = '72px';
			host.style.left = 'auto';
			host.style.right = '0';
			host.style.top = `${Math.max(12, Math.min(
				Number(state.position && state.position.top) || 96,
				window.innerHeight - 84
			))}px`;
		}
		else {
			host.style.width = `min(${WIDTH}px, 100vw)`;
			host.style.height = 'min(760px, calc(100vh - 24px))';
			applyPosition(state.position);
		}
		if (elements.miniDot) {
			elements.miniDot.dataset.kind = state.remoteConflict
				? 'conflict'
				: (state.statusKind || 'ready');
		}
	}

	function applyPosition(position) {
		if (!host) return null;
		if (!position || !Number.isFinite(position.left) || !Number.isFinite(position.top)) {
			host.style.left = 'auto';
			host.style.right = `${window.innerWidth <= WIDTH + GAP * 2 ? 0 : GAP}px`;
			host.style.top = `${window.innerHeight <= 520 ? 0 : GAP}px`;
			if (state) state.position = null;
			return null;
		}
		const rect = host.getBoundingClientRect();
		const left = Math.max(0, Math.min(Number(position.left), window.innerWidth - rect.width));
		const top = Math.max(0, Math.min(Number(position.top), window.innerHeight - rect.height));
		host.style.left = `${Math.round(left)}px`;
		host.style.right = 'auto';
		host.style.top = `${Math.round(top)}px`;
		const clamped = {left: Math.round(left), top: Math.round(top)};
		if (state) state.position = clamped;
		return clamped;
	}

	function beginDrag(event) {
		if (!host || event.button !== 0 || event.target.closest('button, input, textarea')) return;
		const rect = host.getBoundingClientRect();
		dragState = {
			pointerId: event.pointerId,
			startX: event.clientX,
			startY: event.clientY,
			left: rect.left,
			top: rect.top
		};
		event.preventDefault();
		elements.header.classList.add('dragging');
	}

	function moveDrag(event) {
		if (!dragState || event.pointerId !== dragState.pointerId) return;
		applyPosition({
			left: dragState.left + event.clientX - dragState.startX,
			top: dragState.top + event.clientY - dragState.startY
		});
	}

	function endDrag(event) {
		if (!dragState || event.pointerId !== dragState.pointerId) return;
		dragState = null;
		if (elements.header) elements.header.classList.remove('dragging');
		Zotero.Connector_Browser.paperLoopSetPosition(state && state.position)
			.catch(Zotero.logError);
	}

	function createPanel() {
		if (host) return;
		host = document.createElement('div');
		host.setAttribute('data-paperloop-sidebar-host', '');
		host.style.cssText = [
			'position:fixed',
			`top:${GAP}px`,
			`right:${GAP}px`,
			`width:min(${WIDTH}px, 100vw)`,
			'height:min(760px, calc(100vh - 24px))',
			'z-index:2147483647',
			'background:transparent',
			'contain:layout style paint',
			'color-scheme:light'
		].join(';');
		shadow = host.attachShadow({mode: 'closed'});
		shadow.innerHTML = `
			<style>
				:host { all: initial; }
				* { box-sizing: border-box; }
				[hidden] { display:none !important; }
				.mini-tab { width:36px; height:72px; padding:7px 4px; border:0; border-radius:12px 0 0 12px; background:linear-gradient(160deg,#17305e,#3479db); color:white; box-shadow:0 8px 24px rgba(24,55,108,.28); cursor:pointer; font:750 12px/1 Inter,"Segoe UI",sans-serif; letter-spacing:.5px; }
				.mini-dot { display:block; width:8px; height:8px; margin:0 auto 10px; border-radius:50%; background:#70d39a; box-shadow:0 0 0 3px rgba(255,255,255,.15); }
				.mini-dot[data-kind="pending"] { background:#ffd166; }
				.mini-dot[data-kind="conflict"] { background:#ff9f43; }
				.mini-dot[data-kind="error"] { background:#ff6b6b; }
				.panel {
					height: 100%; display: flex; flex-direction: column;
					font-family: Inter, "Segoe UI", "Microsoft YaHei", sans-serif;
					color: #172033; background: rgba(250, 252, 255, .98);
					border: 1px solid rgba(95, 115, 150, .22); border-radius:16px;
					box-shadow: 0 18px 48px rgba(32, 50, 82, .20);
					backdrop-filter: blur(16px); overflow: hidden;
				}
				.header { padding: 18px 18px 14px; background: linear-gradient(145deg, #172a52, #2958a7); color: white; cursor:grab; touch-action:none; user-select:none; }
				.header.dragging { cursor:grabbing; }
				.header-row { display:flex; align-items:center; justify-content:space-between; gap:12px; }
				.brand { font-size: 18px; font-weight: 750; letter-spacing: .2px; }
				.window-actions { display:flex; gap:7px; }
				.window-button { min-width:32px; height:32px; border:0; border-radius:10px; color:white; background:rgba(255,255,255,.13); cursor:pointer; font-size:16px; line-height:1; }
				.window-button.language { font-size:11px; font-weight:800; letter-spacing:.2px; }
				.window-button:hover { background:rgba(255,255,255,.23); }
				.title { margin-top:15px; font-size:14px; font-weight:650; line-height:1.45; overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; }
				.source { margin-top:9px; display:inline-flex; max-width:100%; padding:5px 9px; border-radius:999px; background:rgba(255,255,255,.13); font-size:11px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
				.body { min-height:0; flex:1; display:flex; flex-direction:column; gap:13px; padding:18px 20px; overflow:auto; overscroll-behavior:contain; }
				.status { padding:10px 12px; border-radius:11px; font-size:12px; line-height:1.45; background:#eef3fb; color:#52627c; }
				.status[data-kind="ready"] { background:#e9f7ef; color:#17643b; }
				.status[data-kind="pending"] { background:#fff6df; color:#7c5714; }
				.status[data-kind="conflict"] { background:#fff0dd; color:#8b4a08; }
				.status[data-kind="error"] { background:#fff0ef; color:#9a302b; }
				.tools { display:flex; gap:9px; }
				.secondary { min-height:38px; border:1px solid #c8d4e6; border-radius:10px; padding:8px 11px; background:#fff; color:#29466f; font-size:12px; font-weight:700; cursor:pointer; }
				.secondary:hover { border-color:#7695c6; background:#f4f7fc; }
				.remote-load { border-color:#e5a750; color:#81470c; background:#fff8ed; }
				.auto-row { margin-left:auto; display:flex; align-items:center; gap:7px; font-size:11px; font-weight:600; color:#65738a; }
				.auto-row input { accent-color:#2e67bd; }
				.picker { padding:11px; border:1px solid #d8e1ef; border-radius:12px; background:#f7f9fd; }
				.search-row { display:flex; gap:7px; }
				.query { min-width:0; flex:1; height:37px; border:1px solid #cbd6e7; border-radius:9px; padding:0 10px; font:12px Inter, "Segoe UI", "Microsoft YaHei", sans-serif; }
				.results { margin-top:9px; display:flex; flex-direction:column; gap:6px; max-height:210px; overflow:auto; }
				.result { display:flex; flex-direction:column; gap:3px; width:100%; border:1px solid transparent; border-radius:9px; padding:9px; background:#fff; text-align:left; cursor:pointer; }
				.result:hover { border-color:#85a3d1; background:#f7faff; }
				.result-title { color:#243551; font-size:12px; font-weight:700; line-height:1.35; }
				.result-meta,.selected-meta { color:#78859a; font-size:10px; line-height:1.35; }
				.empty { padding:10px; color:#78859a; font-size:11px; text-align:center; }
				.error-text { color:#9a302b; }
				.selected { position:relative; padding:10px 34px 10px 11px; border:1px solid #b9d5c4; border-radius:11px; background:#eff8f2; }
				.selected-title { color:#1d5335; font-size:12px; font-weight:750; line-height:1.35; }
				.selected-clear { position:absolute; top:7px; right:7px; width:24px; height:24px; border:0; border-radius:7px; background:transparent; color:#517060; cursor:pointer; }
				label { font-size:12px; font-weight:700; color:#35445e; }
				textarea { width:100%; min-height:260px; flex:1; resize:vertical; border:1px solid #ced8e8; border-radius:14px; padding:14px; background:white; color:#172033; font:14px/1.65 Inter, "Segoe UI", "Microsoft YaHei", sans-serif; outline:none; box-shadow:0 1px 2px rgba(28,45,75,.04); }
				textarea:focus { border-color:#4f78c8; box-shadow:0 0 0 3px rgba(79,120,200,.13); }
				.hint { font-size:11px; line-height:1.5; color:#7a879b; }
				.footer { padding:14px 20px 18px; border-top:1px solid #e2e8f1; background:#fff; }
				.save { width:100%; min-height:44px; border:0; border-radius:12px; padding:11px 14px; color:white; background:linear-gradient(135deg,#2857a5,#3479db); font-size:14px; font-weight:720; cursor:pointer; box-shadow:0 8px 20px rgba(42,92,172,.22); }
				.save:hover:not(:disabled) { filter:brightness(1.05); transform:translateY(-1px); }
				.save:disabled { cursor:not-allowed; background:#aeb9ca; box-shadow:none; }
			</style>
			<button class="mini-tab" type="button" title="展开 PaperLoop" aria-label="展开 PaperLoop" hidden><span class="mini-dot"></span>PL</button>
			<aside class="panel" role="complementary" aria-label="PaperLoop 文献收藏与思考">
				<header class="header">
					<div class="header-row"><div class="brand">PaperLoop</div><div class="window-actions"><button class="window-button language" type="button">EN</button><button class="window-button reset" type="button" title="复位到右侧" aria-label="复位到右侧">⇥</button><button class="window-button minimize" type="button" title="最小化到网页边缘" aria-label="最小化 PaperLoop">—</button><button class="window-button close" type="button" title="彻底隐藏" aria-label="彻底隐藏 PaperLoop">×</button></div></div>
					<div class="title"></div><div class="source"></div>
				</header>
				<div class="body">
					<div class="status" aria-live="polite"></div>
					<button class="secondary remote-load" type="button" hidden>载入 Zotero 笔记</button>
					<div class="tools">
						<button class="secondary choose" type="button">选择 Zotero 分类</button>
						<button class="secondary refresh" type="button">刷新 Zotero</button>
						<label class="auto-row"><input class="auto-open" type="checkbox"><span class="auto-label">自动识别后打开</span></label>
					</div>
					<div class="picker" hidden>
						<div class="search-row"><input class="query" type="search" maxlength="240" placeholder="分类名称，如 生物、化学"><button class="secondary search" type="button">搜索</button></div>
						<div class="results"></div>
					</div>
					<div class="selected" hidden><div class="selected-title"></div><div class="selected-meta"></div><button class="selected-clear" type="button" title="取消选择">×</button></div>
					<label class="thought-label" for="paperloop-thought">阅读思考</label>
					<textarea id="paperloop-thought" maxlength="20000" placeholder="为什么重要？可用于论文哪一部分？与哪些工作相关？"></textarea>
					<div class="hint">草稿自动保存在当前浏览器；写入 Zotero 仍由下方按钮明确触发。</div>
				</div>
				<footer class="footer"><button class="save" type="button">一键收藏到 Zotero</button></footer>
			</aside>`;
		elements = {
			mini: shadow.querySelector('.mini-tab'),
			miniDot: shadow.querySelector('.mini-dot'),
			panel: shadow.querySelector('.panel'),
			header: shadow.querySelector('.header'),
			language: shadow.querySelector('.language'),
			reset: shadow.querySelector('.reset'),
			minimize: shadow.querySelector('.minimize'),
			close: shadow.querySelector('.close'),
			title: shadow.querySelector('.title'),
			source: shadow.querySelector('.source'),
			status: shadow.querySelector('.status'),
			remoteLoad: shadow.querySelector('.remote-load'),
			choose: shadow.querySelector('.choose'),
			refresh: shadow.querySelector('.refresh'),
			autoOpen: shadow.querySelector('.auto-open'),
			autoLabel: shadow.querySelector('.auto-label'),
			picker: shadow.querySelector('.picker'),
			query: shadow.querySelector('.query'),
			search: shadow.querySelector('.search'),
			results: shadow.querySelector('.results'),
			selected: shadow.querySelector('.selected'),
			selectedTitle: shadow.querySelector('.selected-title'),
			selectedMeta: shadow.querySelector('.selected-meta'),
			selectedClear: shadow.querySelector('.selected-clear'),
			thoughtLabel: shadow.querySelector('.thought-label'),
			thought: shadow.querySelector('textarea'),
			hint: shadow.querySelector('.hint'),
			save: shadow.querySelector('.save')
		};
		elements.language.addEventListener('click', () => {
			setLanguage(language === 'zh' ? 'en' : 'zh').catch(Zotero.logError);
		});
		elements.header.addEventListener('pointerdown', beginDrag);
		window.addEventListener('pointermove', moveDrag, true);
		window.addEventListener('pointerup', endDrag, true);
		window.addEventListener('pointercancel', endDrag, true);
		resizeHandler = () => applyPosition(state && state.position);
		window.addEventListener('resize', resizeHandler);
		elements.reset.addEventListener('click', () => {
			applyPosition(null);
			Zotero.Connector_Browser.paperLoopSetPosition(null).catch(Zotero.logError);
		});
		elements.minimize.addEventListener('click', () => {
			persistDraft();
			state.minimized = true;
			renderViewMode();
			Zotero.Connector_Browser.paperLoopSetMinimized(true).catch(Zotero.logError);
		});
		elements.mini.addEventListener('click', () => {
			state.minimized = false;
			renderViewMode();
			Zotero.Connector_Browser.paperLoopSetMinimized(false).catch(Zotero.logError);
			refreshZoteroState();
		});
		elements.close.addEventListener('click', () => {
			Zotero.Connector_Browser.paperLoopSetPinned(false).catch(Zotero.logError);
			Zotero.PaperLoopSidebar.close();
		});
		elements.choose.addEventListener('click', () => {
			elements.picker.hidden = !elements.picker.hidden;
			if (!elements.picker.hidden && !elements.results.childNodes.length) loadTargets();
		});
		elements.refresh.addEventListener('click', () => refreshZoteroState());
		elements.remoteLoad.addEventListener('click', async () => {
			if (!state || !state.remote || !state.remote.noteKey) return;
			elements.thought.value = String(state.remote.thought || '');
			state.remoteConflict = false;
			elements.remoteLoad.hidden = true;
			persistDraft();
			await writeSyncMeta(state.documentKey, state.remote);
			renderState();
		});
		elements.search.addEventListener('click', loadTargets);
		elements.query.addEventListener('keydown', event => {
			if (event.key === 'Enter') loadTargets();
		});
		elements.selectedClear.addEventListener('click', () => {
			state.selectedTarget = null;
			renderState();
		});
		elements.autoOpen.addEventListener('change', async () => {
			const enabled = elements.autoOpen.checked;
			state.autoOpen = enabled;
			try {
				await Zotero.Connector_Browser.paperLoopSetAutoOpen(enabled);
			}
			catch (e) {
				state.autoOpen = !enabled;
				elements.autoOpen.checked = !enabled;
				setLocalizedStatus('error', 'autoOpenFailed');
			}
		});
		elements.thought.addEventListener('input', () => {
			if (state && state.remote && elements.thought.value === String(state.remote.thought || '')) {
				state.remoteConflict = false;
				elements.remoteLoad.hidden = true;
				writeSyncMeta(state.documentKey, state.remote).catch(Zotero.logError);
			}
			persistDraft();
			renderState();
		});
		elements.save.addEventListener('click', () => Zotero.PaperLoopSidebar.save());
		(document.body || document.documentElement).appendChild(host);
		applyStaticText();
	}

	this.show = async function (props) {
		const previousDocumentKey = state && state.documentKey;
		const nextDocumentKey = props && props.documentKey;
		const documentChanged = previousDocumentKey && nextDocumentKey
			&& previousDocumentKey !== nextDocumentKey;
		if (documentChanged) saving = false;
		state = Object.assign(
			{},
			documentChanged
				? {saved: false, remote: null, remoteConflict: false, remoteDeleted: false}
				: (state || {}),
			props || {},
			{open: true}
		);
		await readLanguage();
		createPanel();
		renderViewMode();
		renderState();
		if (previousDocumentKey !== state.documentKey) {
			const token = ++documentToken;
			elements.thought.value = '';
			const draft = await readDraft(state.documentKey);
			if (token === documentToken && host) {
				elements.thought.value = draft;
				renderState();
			}
		}
		if (!state.selectedTarget && !pickerLoading) {
			await loadTargets();
		}
		else {
			await refreshZoteroState();
		}
		startRefreshTimer();
		return {open: true};
	};

	this.update = async function (props) {
		if (props && props.open === false) {
			this.close();
			return {open: false};
		}
		return this.show(props);
	};

	this.close = function () {
		const draftWrite = flushDraft();
		if (draftWrite) draftWrite.catch(Zotero.logError);
		clearTimeout(saveTimer);
		clearInterval(refreshTimer);
		window.removeEventListener('pointermove', moveDrag, true);
		window.removeEventListener('pointerup', endDrag, true);
		window.removeEventListener('pointercancel', endDrag, true);
		if (resizeHandler) window.removeEventListener('resize', resizeHandler);
		dragState = null;
		resizeHandler = null;
		if (host) host.remove();
		host = null;
		shadow = null;
		elements = {};
		state = null;
		return {open: false};
	};

	this.status = function () {
		return {
			open: !!host,
			minimized: !!(state && state.minimized),
			documentKey: state && state.documentKey
		};
	};

	this.save = async function () {
		if (!state || saving || !state.canSave || !state.selectedTarget) return;
		saving = true;
		persistDraft();
		elements.save.disabled = true;
		elements.save.textContent = text('writing');
		setLocalizedStatus('pending', 'translatorSaving', {target: targetMeta(state.selectedTarget)});
		try {
			const response = await Zotero.Connector_Browser.paperLoopSaveThought({
				thought: elements.thought.value,
				documentKey: state.documentKey,
				targetID: state.selectedTarget.targetID,
				doi: detectedDOI()
			});
			state.saved = true;
			state.remoteDeleted = false;
			state.remoteConflict = false;
			elements.remoteLoad.hidden = true;
			await refreshZoteroState();
			if (response.pdfAdded) {
				setLocalizedStatus('ready', 'pdfAdded', {target: targetMeta(state.selectedTarget)});
			}
			else if (response.pdfError) {
				setLocalizedStatus('error', 'pdfFailed', {detail: response.pdfError});
			}
			else if (response.pdfMissing && response.pdfAvailable === false) {
				setLocalizedStatus('ready', 'noPdf');
			}
			else if (response.pdfSkipped === 'DOWNLOAD_ASSOCIATED_FILES_DISABLED') {
				setLocalizedStatus('ready', 'autoAttachmentsDisabled');
			}
			else if (response.mode === 'classify') {
				setLocalizedStatus('ready', 'classified', {target: targetMeta(state.selectedTarget)});
			}
			else if (response.repeatedContent) {
				setLocalizedStatus('ready', 'repeatedContent', {target: targetMeta(state.selectedTarget)});
			}
			else if (response.mode === 'sync' && response.updated) {
				setLocalizedStatus('ready', 'updatedThought', {target: targetMeta(state.selectedTarget)});
			}
			else {
				setLocalizedStatus('ready', 'savedThought', {target: targetMeta(state.selectedTarget)});
			}
		}
		catch (e) {
			setLocalizedStatus('error', 'saveFailed', {
				detail: e && e.message ? e.message : text('confirmZotero')
			});
		}
		finally {
			saving = false;
			elements.save.disabled = !state.canSave || !state.selectedTarget;
			elements.save.textContent = state.saved ? text('syncAgain') : text('saveSelected');
			renderSelectedTarget();
		}
	};

	// Test-only observability without opening the Shadow DOM to arbitrary pages.
	this.debugState = function () {
		if (!host) return {open: false};
		const rect = host.getBoundingClientRect();
		return {
			open: true,
			minimized: !!(state && state.minimized),
			width: rect.width,
			height: rect.height,
			left: rect.left,
			top: rect.top,
			right: rect.right,
			documentKey: state && state.documentKey,
			thought: elements.thought.value,
			canSave: !!(state && state.canSave),
			autoOpen: !!(state && state.autoOpen !== false),
			selectedTargetID: state && state.selectedTarget && state.selectedTarget.targetID,
			selectedTargetPath: state && state.selectedTarget && targetMeta(state.selectedTarget),
			pickerOpen: elements.picker && !elements.picker.hidden,
			remoteStatus: state && state.remote && state.remote.status,
			remoteNoteKey: state && state.remote && state.remote.noteKey,
			remoteConflict: !!(state && state.remoteConflict),
			remoteLoadVisible: !!(elements.remoteLoad && !elements.remoteLoad.hidden),
			language,
			languageButtonText: elements.language.textContent,
			chooseText: elements.choose.textContent,
			refreshText: elements.refresh.textContent,
			autoLabelText: elements.autoLabel.textContent,
			thoughtLabelText: elements.thoughtLabel.textContent,
			thoughtPlaceholder: elements.thought.placeholder,
			saveText: elements.save.textContent,
			status: elements.status.textContent,
			htmlOverflow: document.documentElement.style.overflow,
			bodyOverflow: document.body && document.body.style.overflow
		};
	};

	this.debugSetLanguage = function (value) {
		return setLanguage(value);
	};

	this.debugClickLanguage = function () {
		if (!elements.language) return false;
		elements.language.click();
		return true;
	};

	this.debugSetThought = function (value) {
		if (!elements.thought) return false;
		elements.thought.value = String(value || '');
		elements.thought.dispatchEvent(new Event('input', {bubbles: true}));
		return true;
	};

	this.debugClickClose = function () {
		if (!elements.close) return false;
		elements.close.click();
		return true;
	};

	this.debugClickMinimize = function () {
		if (!elements.minimize) return false;
		elements.minimize.click();
		return true;
	};

	this.debugClickMiniTab = function () {
		if (!elements.mini) return false;
		elements.mini.click();
		return true;
	};

	this.debugLoadRemote = function () {
		if (!elements.remoteLoad || elements.remoteLoad.hidden) return false;
		elements.remoteLoad.click();
		return true;
	};

	this.debugRefreshZotero = function () {
		return refreshZoteroState();
	};

	this.debugClickChoose = function () {
		if (!elements.choose) return false;
		elements.choose.click();
		return true;
	};

	this.debugClickSave = function () {
		if (!elements.save) return false;
		elements.save.click();
		return true;
	};

	this.debugDragBy = function (deltaX, deltaY) {
		if (!elements.header || !host) return false;
		const rect = host.getBoundingClientRect();
		const pointerId = 71;
		elements.header.dispatchEvent(new PointerEvent('pointerdown', {
			bubbles: true,
			button: 0,
			pointerId,
			clientX: rect.left + 40,
			clientY: rect.top + 20
		}));
		window.dispatchEvent(new PointerEvent('pointermove', {
			pointerId,
			clientX: rect.left + 40 + Number(deltaX || 0),
			clientY: rect.top + 20 + Number(deltaY || 0)
		}));
		window.dispatchEvent(new PointerEvent('pointerup', {
			pointerId,
			clientX: rect.left + 40 + Number(deltaX || 0),
			clientY: rect.top + 20 + Number(deltaY || 0)
		}));
		return true;
	};

	this.debugResetPosition = function () {
		if (!elements.reset) return false;
		elements.reset.click();
		return true;
	};

	this.debugSelectResult = function (index=0) {
		const result = elements.results && elements.results.querySelectorAll('.result')[index];
		if (!result) return false;
		result.click();
		return true;
	};
};
