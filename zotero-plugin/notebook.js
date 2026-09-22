/* PaperLoop rich-note bridge. Uses Zotero's native embedded-image attachments. */
var PaperLoopNotebook = {
	path: '/connector/paperloop/notebook',
	maxBytes: 12 * 1024 * 1024,
	register() { PaperLoopZoteroCompat.registerEndpoint(this.path, this.Endpoint); this.installColumnLayout(); },
	unregister() { PaperLoopZoteroCompat.unregisterEndpoint(this.path, this.Endpoint); this.removeColumnLayout(); },
	installColumnLayout() {
		if (this.columnInit || !Zotero.EditorInstance?.prototype?.init) return;
		this.columnDocuments = new Map(); this.columnActive = true;
		const owner = this, original = Zotero.EditorInstance.prototype.init;
		this.originalColumnInit = original;
		this.columnInit = function (...args) {
			const result = original.apply(this, args), instance = this;
			Promise.resolve(result).then(() => instance._initPromise).then(() => {
				if (owner.columnActive) owner.styleColumnEditor(instance);
			}).catch(error => Zotero.logError(error));
			return result;
		};
		Zotero.EditorInstance.prototype.init = this.columnInit;
	},
	styleColumnEditor(instance) {
		const win = instance._iframeWindow, doc = win?.document;
		if (!doc || this.columnDocuments.has(doc)) return;
		const style = doc.createElement('style');
		const selector='.ProseMirror table:has(>tbody>tr:first-child>th:first-child[data-colwidth="330"]):has(>tbody>tr:first-child>th:nth-child(2)[data-colwidth="270"])';
		style.textContent = `
		${selector}{table-layout:fixed;width:100%}
		${selector}>tbody>tr>th:first-child,${selector}>tbody>tr>td:first-child{width:55%}
		${selector}>tbody>tr>th:nth-child(2),${selector}>tbody>tr>td:nth-child(2){width:45%}
		${selector}>tbody>tr>td{vertical-align:top;overflow-wrap:anywhere}
		${selector} .resized-wrapper{max-width:100%}
		`;
		doc.head.append(style);
		const update = () => {
			// Never mutate ProseMirror's content DOM: even a data attribute can be
			// mistaken for a user edit by its DOM observer. Only toggle head CSS.
			const matches=[...doc.querySelectorAll('.ProseMirror table')].some(table=>{
				const cells = table.rows[0]?.cells;
				return cells?.length===2 && cells[0].textContent.trim()==='PaperLoop · 笔记' && cells[1].textContent.trim()==='关联图片';
			});
			style.disabled=!matches;
		};
		const observer = new win.MutationObserver(update); update(); observer.observe(doc.body,{childList:true,subtree:true,characterData:true});
		const cleanup = () => { observer.disconnect(); style.remove(); this.columnDocuments.delete(doc); win.removeEventListener('unload',cleanup); };
		this.columnDocuments.set(doc,cleanup); win.addEventListener('unload',cleanup,{once:true});
	},
	removeColumnLayout() {
		this.columnActive = false;
		if (this.columnInit && Zotero.EditorInstance?.prototype?.init===this.columnInit) Zotero.EditorInstance.prototype.init=this.originalColumnInit;
		for (const cleanup of [...(this.columnDocuments?.values()||[])]) { try { cleanup(); } catch (_) {} }
		this.columnDocuments?.clear(); this.columnInit=null; this.originalColumnInit=null;
	},
	fail(message, status=400) { const error = new Error(message); error.status = status; throw error; },
	escape(value) { return String(value || '').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c])); },
	url(value) { try { const u = new URL(String(value)); return /^https?:$/.test(u.protocol) ? u.href.slice(0, 8000) : ''; } catch (_) { return ''; } },
	window() { const win = Zotero.getMainWindow(); if (!win) this.fail('Zotero 主窗口尚未就绪，请稍后重试', 503); return win; },
	parse(html) { return new (this.window().DOMParser)().parseFromString(String(html || ''), 'text/html'); },
	root(doc) { return doc.querySelector('body > div[data-schema-version]') || doc.body; },
	async locked(parent, fn) {
		const key = `${parent.libraryID}:${parent.id}`;
		const queue = PaperLoopDOIBridge.pendingUpserts;
		const operation = (queue.get(key) || Promise.resolve()).catch(() => {}).then(fn);
		queue.set(key, operation);
		try { return await operation; }
		finally { if (queue.get(key) === operation) queue.delete(key); }
	},
	async noteFor(parent, create=false) {
		let note = await PaperLoopDOIBridge.findCanonicalPaperLoopNote(parent);
		if (!note && create) {
			note = new Zotero.Item('note');
			note.libraryID = parent.libraryID;
			note.parentID = parent.id;
			note.setNote('<div data-schema-version="9"><h1>PaperLoop 思考</h1><p></p></div>');
			await note.saveTx();
		}
		return note;
	},
	async sanitize(html, note) {
		if (typeof html !== 'string' || html.length > 200000) this.fail('笔记内容过长');
		const doc = this.parse(html);
		const tags = new Set('DIV P H1 H2 H3 H4 H5 H6 BR STRONG B EM I U S STRIKE SUB SUP SPAN A IMG BLOCKQUOTE UL OL LI TABLE THEAD TBODY TR TD TH HR PRE CODE'.split(' '));
		for (const node of [...doc.body.querySelectorAll('*')]) {
			if (!tags.has(node.tagName)) {
				if (/^(SCRIPT|STYLE|IFRAME|OBJECT|EMBED|FORM|SVG|MATH)$/.test(node.tagName)) node.remove();
				else node.replaceWith(...node.childNodes);
				continue;
			}
			for (const attr of [...node.attributes]) {
				const name = attr.name.toLowerCase();
				const allowed = /^(data-(schema-version|citation-items|citation|annotation|attachment-key|colwidth)|class|title|alt|width|height|colspan|rowspan|href|style)$/.test(name);
				if (!allowed) node.removeAttribute(attr.name);
			}
			if (node.hasAttribute('href') && !/^(https?:\/\/|zotero:\/\/|#)/i.test(node.getAttribute('href'))) node.removeAttribute('href');
			if (node.hasAttribute('data-colwidth')) {
				const widths = node.getAttribute('data-colwidth');
				if (!/^(TD|TH)$/.test(node.tagName) || !/^\d{1,4}(,\d{1,4}){0,31}$/.test(widths) || widths.split(',').some(value => Number(value)<1 || Number(value)>4096)) node.removeAttribute('data-colwidth');
			}
			if (node.hasAttribute('style')) {
				const style = node.getAttribute('style').split(';').filter(value => /^(color|background-color|text-align|font-weight|font-style|text-decoration|width|height)\s*:\s*[\w\s#.,%()\-]+$/i.test(value.trim())).join(';');
				if (style) node.setAttribute('style', style); else node.removeAttribute('style');
			}
			if (node.tagName === 'IMG') {
				const key = node.getAttribute('data-attachment-key') || '';
				if (!/^[A-Z0-9]{8}$/.test(key)) this.fail('图片尚未保存到 Zotero，请通过右键菜单收图');
				const image = await Zotero.Items.getByLibraryAndKeyAsync(note.libraryID, key);
				if (!image || image.deleted || image.parentID !== note.id || !image.isEmbeddedImageAttachment()) this.fail('图片不属于当前笔记');
			}
		}
		let root = this.root(doc);
		if (root === doc.body) {
			const wrapper = doc.createElement('div');
			wrapper.setAttribute('data-schema-version', '9');
			wrapper.append(...doc.body.childNodes);
			doc.body.append(wrapper);
			root = wrapper;
		}
		if (!root.querySelector('h1')) {
			const heading = doc.createElement('h1'); heading.textContent = 'PaperLoop 思考'; root.prepend(heading);
		}
		return doc.body.innerHTML;
	},
	async snapshot(parent, note) {
		return {
			ok: true, notebookVersion: 1, libraryID: parent.libraryID, itemKey: parent.key,
			noteKey: note && note.key, noteHTML: note ? note.getNote() : '',
			noteModified: note && note.dateModified || '', title: parent.getField('title') || ''
		};
	},
	async save(parent, data) {
		return this.locked(parent, async () => {
			const previous = await this.noteFor(parent);
			const note = previous || await this.noteFor(parent, true);
			const current = String(note.getNote() || '');
			if (!previous && data.baseHTML === '') data = {...data, baseHTML:current};
			const clean = await this.sanitize(data.noteHTML, note);
			if (clean === current) return this.snapshot(parent, note);
			if (typeof data.baseHTML !== 'string' || data.baseHTML !== current) this.fail('笔记已在其他窗口更新，草稿已保留。请载入 Zotero 最新内容后再保存。', 409);
			// Recheck after asynchronous attachment validation.
			if (note.getNote() !== current) this.fail('笔记刚刚发生变化，请重新载入后再保存', 409);
			note.setNote(clean);
			await note.saveTx({notifierData: {autoSyncDelay: Zotero.Notes.AUTO_SYNC_DELAY}});
			return this.snapshot(parent, note);
		});
	},
	imageBytes(data) {
		if (typeof data.base64 !== 'string' || data.base64.length > Math.ceil(this.maxBytes / 3) * 4) this.fail('图片超过 12 MB，请选择较小的图片', 413);
		let raw;
		try { raw = this.window().atob(data.base64); } catch (_) { this.fail('图片数据不完整'); }
		const bytes = Uint8Array.from(raw, c => c.charCodeAt(0));
		let mime = '';
		if (bytes[0] === 137 && raw.slice(1,8) === 'PNG\r\n\x1a\n') mime = 'image/png';
		else if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) mime = 'image/jpeg';
		else if (/^GIF8[79]a/.test(raw)) mime = 'image/gif';
		else if (raw.slice(0,4) === 'RIFF' && raw.slice(8,12) === 'WEBP') mime = 'image/webp';
		if (!mime || bytes.length < 16) this.fail('未获取到有效图片（支持 PNG、JPEG、GIF、WebP）');
		return {bytes, mime};
	},
	hash(bytes) {
		const hash = Components.classes['@mozilla.org/security/hash;1'].createInstance(Components.interfaces.nsICryptoHash);
		hash.init(hash.SHA256); hash.update(bytes, bytes.length);
		return [...hash.finish(false)].map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join('');
	},
	async addImage(parent, data) {
		const {bytes, mime} = this.imageBytes(data);
		const hash = this.hash(bytes);
		return this.locked(parent, async () => {
			const note = await this.noteFor(parent, true);
			const title = `PaperLoop image ${hash}`;
			const attachments = await Zotero.Items.getAsync(note.getAttachments());
			let attachment = attachments.find(item => !item.deleted && item.isEmbeddedImageAttachment() && item.getField('title') === title);
			if (attachment && !(await attachment.fileExists())) attachment = null;
			if (!attachment) {
				attachment = await Zotero.Attachments.importEmbeddedImage({blob: new (this.window().Blob)([bytes], {type: mime}), parentItemID: note.id});
				attachment.setField('title', title);
				if (this.url(data.imageURL)) attachment.setField('url', this.url(data.imageURL));
				await attachment.saveTx();
			}
			// Read after attachment import so live Zotero editor changes are retained.
			const current = note.getNote();
			const doc = this.parse(current);
			if (doc.querySelector(`img[data-attachment-key="${attachment.key}"]`)) return {...await this.snapshot(parent, note), imageKey: attachment.key, repeated: true};
			const root = this.root(doc);
			const p = doc.createElement('p');
			const img = doc.createElement('img'); img.setAttribute('data-attachment-key', attachment.key);
			img.setAttribute('alt', String(data.caption || '文献图片').slice(0, 2000));
			const width = Math.max(1, Math.min(Number(data.width) || 640, 12000));
			const height = Math.max(1, Math.min(Number(data.height) || 480, 12000));
			img.setAttribute('width', String(Math.min(640, width)));
			img.setAttribute('height', String(Math.round(height * Math.min(640, width) / width)));
			p.append(img); root.append(p);
			const caption = doc.createElement('p');
			caption.className = 'paperloop-image-caption';
			caption.textContent = String(data.caption || '图片').slice(0, 2000) + ` · ${width} × ${height}`;
			root.append(caption);
			const source = this.url(data.pageURL);
			const provenance = doc.createElement('p'); provenance.className = 'paperloop-image-source';
			if (source) { const a = doc.createElement('a'); a.href = source; a.textContent = '↗ 图片来源'; provenance.append(a); }
			if (this.url(data.imageURL)) { const a = doc.createElement('a'); a.href = this.url(data.imageURL); a.textContent = '原图链接'; if (provenance.childNodes.length) provenance.append(' · '); provenance.append(a); }
			if (provenance.childNodes.length) root.append(provenance);
			const clean = await this.sanitize(doc.body.innerHTML, note);
			if (note.getNote() !== current) this.fail('笔记刚刚发生变化，图片仍在待保存列表，请重试', 409);
			note.setNote(clean);
			await note.saveTx();
			return {...await this.snapshot(parent, note), imageKey: attachment.key, repeated: false};
		});
	},
	async image(parent, data) {
		const note = await this.noteFor(parent);
		if (!note) this.fail('笔记不存在', 404);
		const key = String(data.imageKey || '');
		if (!/^[A-Z0-9]{8}$/.test(key)) this.fail('图片标识无效');
		const doc = this.parse(note.getNote());
		if (!doc.querySelector(`img[data-attachment-key="${key}"]`)) this.fail('图片不属于此笔记', 404);
		const image = await Zotero.Items.getByLibraryAndKeyAsync(note.libraryID, key);
		if (!image || image.deleted || image.parentID !== note.id || !image.isEmbeddedImageAttachment()) this.fail('图片不存在', 404);
		const path = await image.getFilePathAsync();
		if (!path || !(await image.fileExists())) this.fail('图片尚未下载到此设备', 404);
		const stat = await IOUtils.stat(path);
		if (stat.size > this.maxBytes) this.fail('图片超过侧栏预览大小，请在 Zotero 查看', 413);
		return {ok: true, imageKey: key, dataURI: await image.attachmentDataURI};
	}
};

PaperLoopNotebook.Endpoint = function () {};
PaperLoopNotebook.Endpoint.prototype = {
	supportedMethods: ['POST'], supportedDataTypes: ['application/json'], permitBookmarklet: false,
	async init(requestData) {
		try {
			const data = requestData.data || {};
			if (data.action === 'capabilities') return [200, 'application/json', JSON.stringify({ok:true, notebookVersion:1})];
			const lookup = await PaperLoopDOIBridge.findItemByKey(data.libraryID, data.itemKey);
			const parent = lookup.item;
			if (!parent || parent.deleted || !parent.isRegularItem()) PaperLoopNotebook.fail('找不到可编辑的文献', 404);
			const library = Zotero.Libraries.get(parent.libraryID);
			if (!library || !library.editable) PaperLoopNotebook.fail('文库不可编辑', 403);
			if (data.action === 'add-image' && library.filesEditable === false) PaperLoopNotebook.fail('此文库不允许添加图片文件', 403);
			let result;
			if (data.action === 'save') result = await PaperLoopNotebook.save(parent, data);
			else if (data.action === 'add-image') result = await PaperLoopNotebook.addImage(parent, data);
			else if (data.action === 'image') result = await PaperLoopNotebook.image(parent, data);
			else if (data.action === 'read') result = await PaperLoopNotebook.snapshot(parent, await PaperLoopNotebook.noteFor(parent));
			else PaperLoopNotebook.fail('不支持的笔记操作');
			return [200, 'application/json', JSON.stringify(result)];
		}
		catch (error) {
			Zotero.logError(error);
			return [error.status || 500, 'application/json', JSON.stringify({error: error.message || '笔记保存失败'})];
		}
	}
};
