/* A local-first, image-aware notebook. Never changes the host page's layout. */
Zotero.PaperLoopSidebar = new function () {
	const sidebar = this;
	// Use the existing wire protocol directly: the injected Zotero namespace is
	// temporarily incomplete during startup/reinjection, while runtime is ready.
	const api = new Proxy({}, {get:(_,method)=>async(...args)=>{
		try {
			const result = await browser.runtime.sendMessage(['Connector_Browser.'+method,args]);
			if (Array.isArray(result) && result[0] === 'error') {
				const detail=JSON.parse(result[1]);const error=new Error(detail.message);Object.assign(error,detail);throw error;
			}
			if (result === undefined) throw new Error('PaperLoop 后台未响应，请重新加载扩展并刷新当前网页');
			return result;
		} catch(error) {
			if (/Extension context invalidated|Receiving end does not exist/i.test(error.message||'')) throw new Error('PaperLoop 已更新，请刷新当前网页后继续；本机草稿仍保留');
			throw error;
		}
	}});
	const DRAFT = 'paperloop:notebookDraft:v1:';
	const APPEARANCE = 'paperloop:appearance:v1';
	const EMPTY = '<div data-schema-version="9"><h1>PaperLoop 思考</h1><p></p></div>';
	const TAGS = 'div p h1 h2 h3 h4 h5 h6 br strong b em i u s strike sub sup span a img blockquote ul ol li table thead tbody tr td th hr pre code'.split(' ');
	let host, shadow, el = {}, state, generation = 0, dismissedDocumentKey;
	let baseHTML = '', savedHTML = '', shellHTML = EMPTY, dirty = false, saving = false;
	let draftTimer, refreshTimer, refreshJob, showQueue = Promise.resolve(), writes = Promise.resolve();
	let targets = [], remoteConflict = null, lang = 'zh';
	let appearance = {font:'standard',theme:'cowcat',mode:'light',width:480,height:760,left:null,top:24};
	let prefPromise, geometryTimer;
	let syncEpoch=0;
	let gallery, flow, activeView='notes', imagesBusy=false, pendingRead=0, pendingCount=0, savedImageCount=0;
	const t = (zh,en) => lang === 'en' ? en : zh;
	const currentKey = () => { const u = new URL(location.href); u.hash = ''; return u.href; };
	const valid = token => !!host && token === generation;
	const allImages = () => flow?flow.images():[...el.editor.querySelectorAll('img[data-attachment-key]')];
	const escape = value => String(value || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
	const errorText = e => e && e.message || t('操作失败，请确认 Zotero 已打开','Operation failed. Check Zotero is open.');
	function params(extra={}) {
		let doi = '';
		for (const node of document.querySelectorAll('meta[name="citation_doi"],meta[name="dc.identifier"],meta[name="DC.Identifier"],meta[name="prism.doi"]')) {
			const match = String(node.content).match(/10\.\d{4,9}\/[^\s"'<>?#]+/i); if (match) { doi = match[0]; break; }
		}
		return {documentKey:state.documentKey, targetID:state.selectedTarget && state.selectedTarget.targetID, doi, ...extra};
	}
	function clean(html) {
		const safe = DOMPurify.sanitize(String(html || ''), {ALLOWED_TAGS:TAGS,
			ALLOWED_ATTR:['data-schema-version','data-citation-items','data-citation','data-annotation','data-attachment-key','data-colwidth','class','title','alt','width','height','colspan','rowspan','href','style'],
			ADD_URI_SAFE_ATTR:['data-schema-version','data-citation-items','data-citation','data-annotation','data-attachment-key','data-colwidth','width','height','colspan','rowspan'],
			ALLOW_DATA_ATTR:false, ALLOW_ARIA_ATTR:false, FORBID_ATTR:['src','srcset','id'], ALLOWED_URI_REGEXP:/^(https?:\/\/|zotero:\/\/|#)/i});
		const doc = new DOMParser().parseFromString(safe, 'text/html');
		for (const node of doc.querySelectorAll('[style]')) {
			const style = node.getAttribute('style').split(';').filter(v => /^(color|background-color|text-align|font-weight|font-style|text-decoration|width|height)\s*:\s*[\w\s#.,%()\-]+$/i.test(v.trim())).join(';');
			if (style) node.setAttribute('style',style); else node.removeAttribute('style');
		}
		// DOMPurify can reverse attribute order on successive passes. Compare and
		// serialize one canonical order so harmless image markup never conflicts.
		for(const node of doc.querySelectorAll('*')){
			if(node.hasAttribute('class')&&!node.getAttribute('class').trim())node.removeAttribute('class');
			const attrs=[...node.attributes].map(a=>[a.name,a.value]).sort((a,b)=>a[0].localeCompare(b[0]));
			for(const attr of [...node.attributes])node.removeAttribute(attr.name);
			for(const [name,value]of attrs)node.setAttribute(name,value);
		}
		return doc.body.innerHTML;
	}
	function parts(html) {
		const doc = new DOMParser().parseFromString(clean(html || EMPTY),'text/html');
		let root = doc.querySelector('body > div[data-schema-version]');
		if (!root) { root = doc.createElement('div'); root.setAttribute('data-schema-version','9'); root.append(...doc.body.childNodes); doc.body.append(root); }
		const heading = root.firstElementChild;
		const header = heading && heading.tagName === 'H1' && /^PaperLoop 思考\s*$/.test(heading.textContent) ? heading.outerHTML : '<h1>PaperLoop 思考</h1>';
		if (heading && heading.outerHTML === header) heading.remove();
		return {root, header, content:root.innerHTML};
	}
	function serialize() {
		const part = parts(shellHTML);
		part.root.innerHTML = part.header + clean(flow?flow.serialized():el.editor.innerHTML);
		return part.root.outerHTML;
	}
	function comparable(html) {
		const part=parts(html);part.root.innerHTML=part.header+part.content;
		return part.root.outerHTML;
	}
	function emptyNote(html) {
		const part=parts(html);
		return !part.root.textContent.trim() && !part.root.querySelector('img,table,a,hr,[data-citation],[data-annotation]');
	}
	function invalidateSync() { syncEpoch++;refreshJob=null; }
	function message(value, kind='neutral') {
		if (!host) return; el.status.textContent = value; el.status.dataset.kind = kind;
	}
	function render() {
		if (!host) return;
		el.title.textContent = state.title || document.title || t('当前网页','Current page');
		el.meta.textContent = state.translatorLabel || state.translatorName || new URL(state.documentKey).hostname;
		el.target.textContent = '⌑  ' + (state.selectedTarget && (state.selectedTarget.path || state.selectedTarget.name) || t('选择保存分类','Choose collection')) + '  ›';
		el.target.title = el.target.textContent;
		el.save.textContent = saving ? t('保存中…','Saving…') : t('保存到 Zotero','Save to Zotero');
		el.save.disabled = saving || imagesBusy || !state.selectedTarget || !!remoteConflict;
		el.target.disabled = saving || imagesBusy;
		el.editor.contentEditable = saving || imagesBusy ? 'false' : 'true';
		el.conflict.hidden = !remoteConflict;
		el.panel.dataset.font = appearance.font;
		el.font.value = appearance.font;
		el.theme.value=appearance.theme||'cowcat';el.mode.value=appearance.mode||'light';Zotero.PaperLoopThemes.apply(shadow,appearance);
		el.literature.checked = state.autoDisplayCategories ? state.autoDisplayCategories.literature !== false : true;
		el.webpage.checked = state.autoDisplayCategories ? state.autoDisplayCategories.webpage !== false : true;
		el.panel.hidden = !!state.minimized; el.mini.hidden = !state.minimized;
		for (const node of shadow.querySelectorAll('[data-zh]')) node.textContent = t(node.dataset.zh,node.dataset.en);
		el.editor.dataset.placeholder = t('记下这一页值得留下的想法…\n收图：右键网页图片 → 添加到 PaperLoop','Keep an idea worth returning to…\nTo collect an image: right-click → Add to PaperLoop');
		imageCount(pendingCount,savedImageCount);if(gallery)gallery.controls();
		if(flow)flow.update();
	}
	function persist() {
		clearTimeout(draftTimer);
		if (!host || !state) return writes;
		const token = generation, key = DRAFT + state.documentKey;
		const value = {html:serialize(),baseHTML,dirty,removedImages:flow?flow.excludedIDs():[],imageNames:flow?flow.pendingNames():{},updatedAt:Date.now()};
		el.draft.textContent = t('保存草稿…','Saving draft…');
		writes = writes.catch(() => {}).then(() => browser.storage.local.set({[key]:value}));
		writes.then(() => { if (valid(token)) el.draft.textContent = dirty ? t('草稿已存本机','Draft saved locally') : t('已与 Zotero 同步','Synced with Zotero'); }, () => {
			if (valid(token)) { el.draft.textContent = t('草稿未存，请复制备份','Draft not saved; copy a backup'); message(t('本机草稿保存失败，可在 ··· 中复制笔记备份','Local draft failed. Copy a backup from ···.'),'error'); }
		});
		return writes;
	}
	function changed() {
		if(flow){flow.extract();flow.update();}
		dirty = serialize() !== savedHTML || !!flow?.hasDraftChanges();
		if(gallery)gallery.setSaved(allImages());
		el.draft.textContent = t('尚未写入 Zotero','Not yet saved to Zotero');
		clearTimeout(draftTimer); draftTimer = setTimeout(persist,180);
	}
	async function hydrate(token=generation) {
		if(flow)flow.extract();const nodes=allImages();
		for (const node of nodes) {
			if (!valid(token)) return;
			if (node.hasAttribute('src')) continue;
			try {
				const result = await api.paperLoopNotebook(params({action:'image',imageKey:node.dataset.attachmentKey}));
				if (valid(token) && node.isConnected && /^data:image\/(png|jpeg|gif|webp);base64,/.test(result.dataURI)) node.src = result.dataURI;
			} catch (e) { if (valid(token) && node.isConnected) node.title = errorText(e); }
		}
		if(valid(token)&&gallery)gallery.setSaved(allImages());
	}
	function loadHTML(html) {
		shellHTML = html || EMPTY;
		el.editor.innerHTML = parts(shellHTML).content || '<p></p>';
		if(flow)flow.reset();
		savedHTML = serialize();
		if(gallery)gallery.setSaved(allImages());
		hydrate().catch(Zotero.logError);
	}
	// Only append-only image changes can be merged automatically with a local draft.
	function appendRemoteImages(nextHTML) {
		if (!baseHTML) return false;
		const before = parts(baseHTML), after = parts(nextHTML);
		if (!after.content.startsWith(before.content)) return false;
		const tail = after.content.slice(before.content.length);
		if (!tail.includes('data-attachment-key')) return false;
		el.editor.insertAdjacentHTML('beforeend',tail);
		shellHTML = nextHTML; baseHTML = nextHTML;
		hydrate().catch(Zotero.logError);
		return true;
	}
	async function refresh(force=false) {
		if (!host || !state.selectedTarget || saving || (!force && (document.hidden || imagesBusy))) return;
		if (refreshJob && refreshJob.token === generation) return refreshJob.promise;
		const token = generation, epoch=syncEpoch, targetID = state.selectedTarget.targetID;
		const promise = (async () => {
			try {
				const remote = await api.paperLoopGetDocumentState(params());
				if (!valid(token) || epoch!==syncEpoch || state.selectedTarget.targetID !== targetID || saving) return;
				state.remote = remote;
				if (remote.status === 'existing' && remote.noteHTML) {
					const same=serialize()===comparable(remote.noteHTML);
					if (!dirty || (same && !flow.hasDraftChanges())) {
						baseHTML = remote.noteHTML;if(!same)loadHTML(remote.noteHTML);dirty=flow.hasDraftChanges();remoteConflict=null;
					} else if (comparable(remote.noteHTML) === comparable(baseHTML) || (!baseHTML && emptyNote(remote.noteHTML))) {
						baseHTML=remote.noteHTML;remoteConflict=null;
					} else if (appendRemoteImages(remote.noteHTML)) remoteConflict=null;
					else remoteConflict=remote;
					if (remoteConflict) message(t('Zotero 中的笔记已变化；你的草稿已保留','The Zotero note changed. Your draft is preserved.'),'error');
					else message(t('已关联 Zotero 笔记','Linked to the Zotero note'),'ready');
				} else {
					message(remote.status === 'deleted' ? t('原条目在回收站，保存将重新关联','The item is in the trash. Save to reconnect.') : t('确认分类后，即可收藏这页并保存笔记','Choose a collection, then save this page and note.'));
				}
				render(); await persist();
			} catch (e) { if (valid(token) && epoch===syncEpoch) message(errorText(e),'error'); }
		})();
		refreshJob = {token,promise};
		try { return await promise; } finally { if (refreshJob && refreshJob.promise === promise) refreshJob = null; }
	}
	async function loadRemote() {
		if (!remoteConflict || saving || imagesBusy) return;
		invalidateSync();
		const token=generation, remote=remoteConflict, backup={html:serialize(),baseHTML,removedImages:flow?flow.excludedIDs():[],imageNames:flow?flow.pendingNames():{},updatedAt:Date.now()};
		await browser.storage.local.set({['paperloop:recovery:v1:'+state.documentKey]:backup});
		if (!valid(token)) return;
		baseHTML=remote.noteHTML; loadHTML(baseHTML); dirty=false; remoteConflict=null; render(); await persist();
		message(t('已载入最新笔记；原草稿可在 ··· 中恢复','Latest note loaded; recover your draft from ···.'),'ready');
	}
	async function restoreDraft() {
		if(saving||imagesBusy)return;
		invalidateSync();
		const token=generation, key='paperloop:recovery:v1:'+state.documentKey;
		const stored=await browser.storage.local.get(key);
		if(!valid(token))return;
		if(!stored[key]){message(t('没有待恢复的草稿','No recovery draft available'));return;}
		flow.restoreDraft(stored[key].removedImages,stored[key].imageNames);loadHTML(stored[key].html); dirty=true; remoteConflict=null; render(); await persist();
		message(t('已恢复草稿；保存将替换当前 Zotero 内容，请先检查','Draft recovered. Review before replacing the Zotero note.'),'error');
	}
	async function selectTarget(target) {
		if(saving||imagesBusy)return;
		if(dirty && state.selectedTarget && target.libraryID !== state.selectedTarget.libraryID){message(t('请先保存或备份当前草稿，再切换文库','Save or back up your draft before switching libraries.'),'error');return;}
		const token=generation;
		invalidateSync();
		try {
			const result=await api.paperLoopSetTarget({targetID:target.targetID});
			if(!valid(token))return;
			if(state.selectedTarget && target.libraryID !== state.selectedTarget.libraryID){baseHTML='';loadHTML(EMPTY);dirty=false;remoteConflict=null;}
			state.selectedTarget=result.target||target; el.picker.hidden=true; render(); await refresh(true);
		}catch(e){if(valid(token))message(errorText(e),'error');}
	}
	function results() {
		el.results.replaceChildren();
		const query=el.query.value.toLocaleLowerCase();
		for(const target of targets.filter(x=>(x.path||x.name).toLocaleLowerCase().includes(query))){
			const b=document.createElement('button');b.type='button';b.className='result';b.textContent=target.path||target.name;
			b.onclick=()=>selectTarget(target);el.results.append(b);
		}
		if(!el.results.childElementCount)el.results.textContent=t('没有可用分类','No collections found');
	}
	async function loadTargets() {
		const token=generation;
		try{
			const result=await api.paperLoopGetCollections({});
			if(!valid(token))return;
			targets=result.targets||[];
			if(!state.selectedTarget)state.selectedTarget=targets.find(x=>x.targetID===result.selectedTargetID)||null;
			results();render();await refresh(true);
		}catch(e){if(valid(token))message(errorText(e),'error');}
	}
	async function pendingImages() {
		if(!host)return;
		const token=generation, read=++pendingRead;
		try{
			const list=await api.paperLoopNotebook(params({action:'pending'}));
			if(!valid(token)||read!==pendingRead)return;
			gallery.setPending(list);
			const mapping=await api.paperLoopNotebook(params({action:'image-map'}));
			if(!valid(token)||read!==pendingRead)return;flow.setMap(mapping);gallery.setPending(list);gallery.setSaved(allImages());
		}catch(e){if(valid(token))message(errorText(e),'error');}
	}
	function imageCount(pending,saved){
		pendingCount=pending;savedImageCount=saved;if(!host||!el['tab-images'])return;
		el['tab-images'].textContent=t('图片','Images')+' '+(pending+saved);
		el['tab-images'].dataset.pending=String(pending>0);
		el['tab-images'].title=pending?t(`${pending} 张待保存到 Zotero`,`${pending} images not yet saved to Zotero`):t('查看所有图片','View all images');
		el['tab-notes'].textContent=t('笔记','Notes')+(dirty?' ·':'');
	}
	function setView(view,focus=false){
		activeView=view==='images'?'images':'notes';if(!host)return;
		el.panel.dataset.view=activeView;
		el.content.hidden=false;el['media-area'].hidden=false;el.footer.hidden=false;
		if(view==='images')el['media-area'].scrollIntoView({block:'nearest'});
		for(const name of ['notes','images']){const tab=el['tab-'+name];tab.setAttribute('aria-selected',String(name===activeView));tab.tabIndex=name===activeView?0:-1;}
		if(focus)el['tab-'+activeView].focus();
	}
	async function preferences() {
		if(!prefPromise)prefPromise=browser.storage.local.get([APPEARANCE,'paperloop:language:v1']).then(s=>{
			appearance={...appearance,...s[APPEARANCE]};lang=s['paperloop:language:v1']==='en'?'en':'zh';
			appearance.font=appearance.font==='hand'?'hand':'standard';
			if(!Zotero.PaperLoopThemes.palettes[appearance.theme])appearance.theme='cowcat';
			if(!['light','dark','auto'].includes(appearance.mode))appearance.mode='light';
		}).catch(Zotero.logError);
		return prefPromise;
	}
	function geometry() {
		if(!host)return;
		const gap=8,w=Math.min(Math.max(240,Number(appearance.width)||480),Math.max(120,innerWidth-gap*2)),h=Math.min(Math.max(260,Number(appearance.height)||760),Math.max(180,innerHeight-gap*2));
		let left=appearance.left===null?innerWidth-w-24:Number(appearance.left)||0,top=Number(appearance.top)||24;
		left=Math.max(gap,Math.min(left,innerWidth-w-gap));top=Math.max(gap,Math.min(top,innerHeight-h-gap));
		Object.assign(host.style,{left:left+'px',top:top+'px',width:w+'px',height:h+'px'});
		el.panel.dataset.compact=String(w<370);
		if(state.minimized)Object.assign(host.style,{left:(left+w/2<innerWidth/2?gap:innerWidth-42)+'px',width:'34px',height:'112px'});
	}
	function persistGeometry(){clearTimeout(geometryTimer);geometryTimer=setTimeout(()=>browser.storage.local.set({[APPEARANCE]:appearance}).catch(Zotero.logError),120);}
	function drag(handle, mode) {
		handle.onpointerdown=e=>{
			if(e.button!==0||e.target.closest('button'))return;
			e.preventDefault();const rect=host.getBoundingClientRect(),startX=e.clientX,startY=e.clientY;let moved=false;
			handle.setPointerCapture(e.pointerId);
			const move=v=>{
				const dx=v.clientX-startX,dy=v.clientY-startY;if(Math.abs(dx)+Math.abs(dy)>4)moved=true;
				if(mode==='resize'){appearance.width=Math.max(320,rect.width+dx);appearance.height=Math.max(360,rect.height+dy);}
				else{appearance.top=Math.max(8,rect.top+dy);if(mode!=='mini')appearance.left=Math.max(8,rect.left+dx);}
				geometry();
			};
			const end=()=>{
				handle.removeEventListener('pointermove',move);handle.removeEventListener('pointerup',end);handle.removeEventListener('pointercancel',cancel);
				if(mode==='mini'&&!moved)setMinimized(false);
				const r=host.getBoundingClientRect();if(mode!=='mini'){appearance.left=r.left;appearance.top=r.top;appearance.width=r.width;appearance.height=r.height;}
				persistGeometry();
			};
			const cancel=()=>{moved=true;end();};
			handle.addEventListener('pointermove',move);handle.addEventListener('pointerup',end,{once:true});handle.addEventListener('pointercancel',cancel,{once:true});
		};
	}
	function setMinimized(value){state.minimized=value;render();geometry();api.paperLoopSetMinimized(value).catch(Zotero.logError);}
	function create() {
		host=document.createElement('div');host.setAttribute('data-paperloop-sidebar-host','');
		host.style.cssText='all:initial;position:fixed;z-index:2147483646;display:block;color-scheme:light;';
		shadow=host.attachShadow({mode:'closed'});
		shadow.innerHTML=`<style>
		:host{all:initial} *{box-sizing:border-box} [hidden]{display:none!important} button,input,select{font:inherit} button{cursor:pointer;color:inherit} button:disabled{opacity:.45;cursor:default}
		button:focus-visible,input:focus-visible,select:focus-visible,[tabindex]:focus-visible{outline:2px solid #638573;outline-offset:3px} button{border:0;background:none;border-radius:6px} button:hover{background:#edf0e8} a{color:#466653}
		.panel{height:100%;display:flex;flex-direction:column;overflow:hidden;position:relative;background:#fbfbf7;color:#303a33;border:1px solid #e1e5da;border-radius:14px;box-shadow:0 16px 55px #16231a20,0 2px 6px #16231a0c;font:13px/1.5 'Segoe UI','Microsoft YaHei',sans-serif}
		.bar{display:flex;align-items:center;gap:4px;padding:13px 15px 8px;cursor:grab;touch-action:none;user-select:none}.grip{color:#a8afa5;font-size:16px;padding:0 5px 0 1px}.brand{font:20px/1.4 'Segoe Print',cursive;letter-spacing:-.8px;flex:1;color:#3d5947}.icon{font:20px/1 'Segoe UI',sans-serif;width:28px;height:28px;color:#778174}.icon:hover{color:#303a33}
		.context{padding:7px 23px 15px;border-bottom:1px solid #e6e9df}.meta{font-size:10px;color:#8c9589;margin-bottom:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.title{margin:0;font-size:14px;line-height:1.65;font-weight:600;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.target{display:block;margin:8px 0 -3px -5px;padding:4px 5px;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:left;font-size:11px;color:#687862}
		.content{flex:1;overflow:auto;overscroll-behavior:contain;padding:19px 23px}.label{font-size:10px;letter-spacing:1.5px;color:#929c8d;margin-bottom:16px}.editor{outline:0;min-height:180px;overflow-wrap:anywhere;font:19px/1.9 KaiTi,STKaiti,'Segoe Print',cursive;color:#364338}.panel[data-font=standard] .editor{font:15px/1.85 'Segoe UI','Microsoft YaHei',sans-serif}.editor:empty:before,.editor:has(>p:only-child:empty):before{content:attr(data-placeholder);white-space:pre-line;color:#adb5a8;pointer-events:none;font-size:16px}.editor p{margin:0 0 14px}.editor img{display:block;max-width:100%;height:auto;min-height:40px;border-radius:5px;background:#edf0e7;cursor:zoom-in;margin:10px 0}.editor h1,.editor h2,.editor h3{font-size:1.12em;line-height:1.65}.editor a{font-size:.8em;text-decoration:none;border-bottom:1px solid #ced7c7}.editor blockquote{margin:12px 0;border-left:2px solid #b4c3aa;padding-left:12px}.editor table{max-width:100%;border-collapse:collapse}.editor td,.editor th{border:1px solid #dce1d4;padding:5px}.editor pre{white-space:pre-wrap}.editor ul,.editor ol{padding-left:24px}
		.editor .paperloop-image-caption,.editor .paperloop-image-source{font:11px/1.65 'Segoe UI','Microsoft YaHei',sans-serif;color:#85927c;margin:5px 0}.editor .paperloop-image-source{margin-bottom:20px}.editor .paperloop-image-source a{font-size:inherit}.content{scrollbar-width:thin;scrollbar-color:#ced7c7 transparent}
		.status{font-size:10px;color:#85917e;line-height:1.6;padding:6px 23px 0;overflow-wrap:anywhere}.status:before{content:'·';font-weight:700;margin-right:5px}.status[data-kind=error]{color:#a5614e}.status[data-kind=ready]{color:#68815e}.footer{padding:10px 23px 18px;display:flex;align-items:center;gap:8px}.draft{font-size:10px;color:#99a18f;flex:1}.save{background:#48684f;color:#fff;border-radius:7px;padding:10px 15px;font-size:12px;white-space:nowrap}.save:hover{background:#3e5b44}
		.settings,.picker{background:#f3f5ed;border-bottom:1px solid #e1e6d9;padding:12px 23px;max-height:260px;overflow:auto;font-size:12px}.settings label{display:flex;align-items:center;justify-content:space-between;margin:6px 0;gap:12px}.settings select{max-width:145px;background:#fbfbf7;border:1px solid #d9dfd1;padding:4px;border-radius:5px}.settings input{accent-color:#597853}.hint{font-size:10px;color:#8c9685;margin:9px 0}.actions{display:flex;gap:6px;flex-wrap:wrap}.actions button{font-size:10px;padding:4px 5px;color:#687d5e}.query{width:100%;background:#fbfbf7;border:1px solid #d9dfd1;border-radius:5px;padding:7px;outline-color:#638573}.results{margin-top:7px;max-height:145px;overflow:auto}.result{display:block;padding:7px 2px;text-align:left;width:100%;font-size:11px;color:#536748}.conflict{font-size:11px;background:#f7efe7;color:#945e48;padding:9px 23px}.conflict button{text-decoration:underline;padding:0 4px}
		.pending{border-bottom:1px solid #e1e6d9;padding:10px 23px;max-height:185px;overflow:auto}.pending-card{display:flex;gap:10px;align-items:center;padding:5px 0}.pending-card img{width:64px;height:50px;object-fit:cover;border-radius:4px;background:#e9eee3}.pending-card p{margin:0 0 3px;font-size:11px;max-height:48px;overflow:auto;overflow-wrap:anywhere}.pending-card button{font-size:10px;color:#507044;padding:3px 6px}.warning{color:#a5614e}.resize{position:absolute;right:2px;bottom:3px;width:16px;height:16px;cursor:nwse-resize;touch-action:none;color:#b2bba8;user-select:none}.mini{height:112px;width:34px;background:#fbfbf7;color:#597451;border:1px solid #dce3d3;border-radius:9px;box-shadow:0 4px 20px #24361c18;writing-mode:vertical-rl;text-align:center;font:13px/32px 'Segoe Print',cursive;cursor:grab;touch-action:none;user-select:none}
		.viewer{position:absolute;inset:0;background:#fbfbf7f7;padding:15px;display:flex;flex-direction:column;gap:10px;z-index:2}.viewer img{width:100%;height:0;flex:1;object-fit:contain}.viewer div{display:flex;justify-content:space-between;gap:10px}.viewer a,.viewer button{font-size:12px;padding:5px}
		.notebook-tabs{display:flex;gap:22px;padding:0 23px;border-bottom:1px solid #e6e9df;flex-shrink:0}.notebook-tabs button{position:relative;padding:12px 0 10px;font-size:11px;color:#a0a995;border-radius:0}.notebook-tabs button:hover{background:none;color:#58734c}.notebook-tabs button[aria-selected=true]{color:#4e6c42}.notebook-tabs button[aria-selected=true]:after{content:'';position:absolute;left:0;right:0;bottom:-1px;height:2px;background:#779768;border-radius:3px}.tab-images[data-pending=true]:before{content:'';position:absolute;width:4px;height:4px;border-radius:50%;background:#95a984;right:-8px;top:13px}.panel[data-view=images]>.status{padding:0 23px 12px}.media-empty-hint{white-space:pre-line}
		</style><section class="panel" role="region" aria-label="PaperLoop 阅读笔记">
		<div class="bar"><span class="grip" title="拖动窗口">⠿</span><span class="brand">PaperLoop</span><button class="theme-toggle" aria-label="选择整体主题">奶牛猫⌄</button><button class="icon more" aria-label="设置" title="设置">···</button><button class="icon minimize" aria-label="收起" title="收起">−</button><button class="icon close" aria-label="关闭" title="关闭">×</button></div>
		<div class="context"><img class="theme-photo" alt="" aria-hidden="true"><div class="meta"></div><h2 class="title"></h2><button class="target" title="选择分类"></button></div>
		<div class="settings" hidden><label><span data-zh="笔记字体" data-en="Note font"></span><select class="font" aria-label="笔记字体"><option value="hand">手写 · 楷体</option><option value="standard">标准 · 清晰</option></select></label><label><span data-zh="自动显示 · 文献" data-en="Auto-open · Literature"></span><input type="checkbox" class="literature"></label><label><span data-zh="自动显示 · 网页" data-en="Auto-open · Webpages"></span><input type="checkbox" class="webpage"></label><p class="hint" data-zh="搜索列表仍保持手动打开。图片可通过网页右键保存。" data-en="Search lists stay manual. Right-click webpage images to save."></p><div class="actions"><button class="refresh" data-zh="刷新笔记" data-en="Refresh"></button><button class="reset" data-zh="复位窗口" data-en="Reset position"></button><button class="copy" data-zh="复制备份" data-en="Copy backup"></button><button class="recover" data-zh="恢复草稿" data-en="Recover draft"></button><button class="language">EN / 中</button></div></div>
		<div class="picker" hidden><input class="query" placeholder="搜索分类…" aria-label="搜索分类"><div class="results"></div></div>
		<div class="conflict" hidden><span data-zh="两端内容不一致。" data-en="Versions differ."></span><button class="remote" data-zh="备份草稿并载入 Zotero" data-en="Back up draft & load Zotero"></button></div>
		<div class="notebook-tabs" role="tablist" aria-label="笔记与图片"><button class="tab-notes" id="pl-tab-notes" role="tab" aria-controls="pl-notes" aria-selected="true">笔记</button><button class="tab-images" id="pl-tab-images" role="tab" aria-controls="pl-images" aria-selected="false" tabindex="-1">图片 0</button></div>
		<div class="content" id="pl-notes" role="tabpanel" aria-labelledby="pl-tab-notes"><div class="label" data-zh="阅读笔记" data-en="READING NOTES"></div><div class="editor" contenteditable="true" role="textbox" aria-multiline="true" aria-label="阅读笔记" spellcheck="false"></div></div>
		<div class="media-area" id="pl-images" role="tabpanel" aria-labelledby="pl-tab-images" hidden></div>
		<div class="status" role="status" aria-live="polite"></div><div class="footer"><span class="draft"></span><button class="save"></button></div><div class="resize" title="调整窗口大小">◢</div>
		</section><div class="mini" hidden role="button" tabindex="0" aria-label="展开 PaperLoop">PaperLoop</div>`;
		for(const name of ['panel','bar','title','meta','target','settings','font','literature','webpage','picker','query','results','conflict','content','editor','status','draft','footer','save','resize','mini','tab-notes','tab-images','media-area'])el[name]=shadow.querySelector('.'+name);
		const choices=document.createElement('div');choices.innerHTML='<label>整体主题<select class="theme" aria-label="整体主题"><option value="cowcat">奶牛猫 · 暖灰与雾蓝</option><option value="shiba">柴犬 · 陶土与灰蓝</option><option value="iris">鸢尾 · 紫灰与香槟</option><option value="tide">潮汐 · 深海与珊瑚</option></select></label><label>明暗外观<select class="mode" aria-label="明暗外观"><option value="light">浅色</option><option value="dark">深色</option><option value="auto">跟随系统</option></select></label>';el.settings.prepend(choices);el.theme=shadow.querySelector('.theme');el.mode=shadow.querySelector('.mode');
		const notebook=document.createElement('div');notebook.className='notebook-flow';el.content.before(notebook);notebook.append(el.content,el['media-area']);el.content.removeAttribute('role');el.content.removeAttribute('aria-labelledby');el['media-area'].removeAttribute('role');el['media-area'].removeAttribute('aria-labelledby');
		const token=generation;
		gallery=new Zotero.PaperLoopGallery(el['media-area'],el.panel,{
			t,request:extra=>{if(!valid(token))return Promise.reject(new Error('页面已切换'));return api.paperLoopNotebook(params(extra));},
			onCount:imageCount,onBusy:value=>{if(valid(token)){if(imagesBusy!==value)invalidateSync();imagesBusy=value;render();}},
			noteSaving:()=>saving,hasTarget:()=>!!state.selectedTarget,
			chooseTarget:()=>{el.picker.hidden=false;el.settings.hidden=true;message(t('请先选择保存分类','Choose a collection first'),'error');},
			reload:async()=>{if(valid(token))await refresh(true);if(valid(token))await pendingImages();},message,
			isExcluded:id=>flow?.excluded.has(id),onRemove:r=>flow.remove(r),onOpen:r=>{if(flow?.linking){flow.attach(r);return true;}return false;},
			links:r=>flow?flow.associated(r):[],onLink:r=>flow.attach(r),onUnlink:(entry,r)=>flow.unlink(entry,r.id),heading:r=>flow?flow.caption(r):r.caption,
			imageName:r=>flow?flow.imageName(r):r.caption,onRename:(r,name)=>flow.rename(r,name)
		});
		flow=new Zotero.PaperLoopFlow(shadow,el.editor,{locked:()=>saving||imagesBusy,gallery:()=>gallery,changed,refreshGallery:()=>{gallery.setPending(gallery.rawPending||[]);gallery.setSaved(allImages());flow.update();},message});
		for(const view of ['notes','images'])el['tab-'+view].onclick=()=>setView(view);
		shadow.querySelector('.notebook-tabs').onkeydown=e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();setView(activeView==='notes'?'images':'notes',true);}};
		const bind=(name,fn)=>shadow.querySelector('.'+name).addEventListener('click',fn);
		bind('more',()=>{el.settings.hidden=!el.settings.hidden;el.picker.hidden=true;});
		bind('theme-toggle',()=>{el.settings.hidden=!el.settings.hidden;el.picker.hidden=true;if(!el.settings.hidden)el.theme.focus();});
		for(const name of ['theme','mode'])el[name].onchange=()=>{appearance[name]=el[name].value;render();persistGeometry();};
		bind('target',()=>{el.picker.hidden=!el.picker.hidden;el.settings.hidden=true;if(!el.picker.hidden){loadTargets();el.query.focus();}});
		bind('close',()=>{dismissedDocumentKey=state.documentKey;api.paperLoopSetPinned(false).catch(Zotero.logError);sidebar.close();});
		bind('minimize',()=>setMinimized(true));bind('save',()=>sidebar.save());bind('remote',()=>loadRemote().catch(e=>message(errorText(e),'error')));
		bind('refresh',()=>{loadTargets();pendingImages();});bind('reset',()=>{appearance={...appearance,width:480,height:760,left:null,top:24};geometry();persistGeometry();});
		bind('copy',()=>navigator.clipboard.writeText(el.editor.innerText).then(()=>message(t('文字已复制；图片仍保留在笔记和草稿中','Text copied; images remain in the note and draft.'),'ready'),e=>message(errorText(e),'error')));
		bind('recover',()=>restoreDraft().catch(e=>message(errorText(e),'error')));
		bind('language',()=>{lang=lang==='en'?'zh':'en';browser.storage.local.set({'paperloop:language:v1':lang}).catch(Zotero.logError);render();});
		el.font.onchange=()=>{appearance.font=el.font.value;render();persistGeometry();};el.query.oninput=results;
		for(const input of [el.literature,el.webpage])input.onchange=async()=>{
			const token=generation, previous={...state.autoDisplayCategories};
			state.autoDisplayCategories={literature:el.literature.checked,webpage:el.webpage.checked};
			try{await api.paperLoopSetAutoDisplayCategories(state.autoDisplayCategories);}catch(e){if(valid(token)){state.autoDisplayCategories=previous;render();message(errorText(e),'error');}}
		};
		el.editor.oninput=changed;
		el.editor.onpaste=e=>{e.preventDefault();const value=e.clipboardData.getData('text/plain');if(value)document.execCommand('insertText',false,value);else message(t('图片请在网页中右键保存到 PaperLoop','Right-click a webpage image to save it.'));};
		el.editor.ondrop=e=>{e.preventDefault();message(t('图片请使用网页右键保存；正文支持文字编辑','Use the image context menu; edit text directly here.'));};
		el.editor.onclick=e=>{
			const img=e.target.closest('img');const link=e.target.closest('a');
			if(link){e.preventDefault();if((e.ctrlKey||e.metaKey)&&/^https?:\/\//.test(link.href))window.open(link.href,'_blank','noopener,noreferrer');return;}
			if(!img||!img.dataset.attachmentKey)return;
			gallery.setSaved(allImages());gallery.open('saved:'+img.dataset.attachmentKey);
		};
		el.mini.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setMinimized(false);}};
		shadow.addEventListener('keydown',e=>{if(!gallery.viewer.hidden)return;if(e.key==='Escape'){el.settings.hidden=true;el.picker.hidden=true;flow.linking=false;flow.update();}if((e.ctrlKey||e.metaKey)&&e.key==='s'){e.preventDefault();sidebar.save();}});
		drag(el.bar,'move');drag(el.resize,'resize');drag(el.mini,'mini');
		(document.body||document.documentElement).append(host);window.addEventListener('resize',geometry);
	}
	this.show = function (props={}) {
		showQueue=showQueue.catch(()=>{}).then(async()=>{
			await preferences();
			const key=props.documentKey||currentKey();
			if(host&&state.documentKey===key){const minimized=state.minimized;state={...state,...props,minimized};render();return {open:true};}
			if(host){await persist().catch(()=>{});this.close();}
			const token=++generation;state={...props,documentKey:key,open:true,minimized:!!props.minimized};
			baseHTML='';dirty=false;saving=false;imagesBusy=false;pendingCount=0;savedImageCount=0;remoteConflict=null;targets=[];create();loadHTML(EMPTY);render();geometry();setView(props.view||'notes');
			message(t('正在连接 Zotero…','Connecting to Zotero…'));
			try {
				const keyNew=DRAFT+key,keyOld='paperloop:draft:v1:'+key.slice(0,1800),keySync='paperloop:sync:v1:'+key.slice(0,1800);
				const stored=await browser.storage.local.get([keyNew,keyOld,keySync]);
				if(!valid(token))return {open:false};
				if(stored[keyNew]&&typeof stored[keyNew].html==='string'){
					flow.restoreDraft(stored[keyNew].removedImages,stored[keyNew].imageNames);loadHTML(stored[keyNew].html);baseHTML=stored[keyNew].baseHTML||'';dirty=!!stored[keyNew].dirty;
				}else if(typeof stored[keyOld]==='string'&&stored[keyOld]){
					loadHTML('<h1>PaperLoop 思考</h1><p>'+escape(stored[keyOld]).replace(/\n/g,'<br>')+'</p>');
					dirty=!(stored[keySync]&&stored[keySync].syncedText===stored[keyOld]);
				}
			}catch(e){if(valid(token))message(t('无法读取本机草稿：','Could not read draft: ')+errorText(e),'error');}
			if(!valid(token))return {open:false};
			await loadTargets();if(!valid(token))return {open:false};await pendingImages();
			if(valid(token)){clearInterval(refreshTimer);refreshTimer=setInterval(()=>refresh(),15000);}
			return {open:!!host};
		});
		return showQueue;
	};
	this.update = props => props && props.open===false ? this.close() : this.show(props);
	this.autoDisplay = props => {
		if(!props || props.open===false)return Promise.resolve({open:false});
		if(dismissedDocumentKey && dismissedDocumentKey === props.documentKey)return Promise.resolve({open:false,dismissed:true});
		return this.show(props);
	};
	this.close = () => {
		if(host&&!saving&&!imagesBusy)gallery?.finishRename();
		if(host)persist().catch(Zotero.logError);
		generation++;invalidateSync();clearTimeout(draftTimer);clearInterval(refreshTimer);window.removeEventListener('resize',geometry);
		if(gallery)gallery.dispose();gallery=null;
		if(flow)flow.dispose();flow=null;
		if(host)host.remove();host=null;shadow=null;el={};state=null;saving=false;imagesBusy=false;return {open:false};
	};
	this.status = () => ({open:!!host,minimized:!!(state&&state.minimized),documentKey:state&&state.documentKey});
	this.save = async () => {
		if(!host||saving||imagesBusy||!state.selectedTarget||remoteConflict)return;
		if(!gallery.finishRename())return;
		const token=generation, html=serialize();invalidateSync();saving=true;render();message(t('正在写入 Zotero…','Saving to Zotero…'));
		try {
			await persist();if(!valid(token))return;
			let result=await api.paperLoopNotebook(params({action:'save',noteHTML:html,baseHTML,includePendingImages:true,excludedImageIDs:flow.excludedIDs(),imageCaptions:flow.pendingNames()}));
			if(!valid(token))return;
			invalidateSync();baseHTML=result.noteHTML;loadHTML(result.noteHTML);state.remote={...result,status:'existing'};remoteConflict=null;await pendingImages();if(!valid(token))return;
			// The native image bridge appends provenance. Normalize the presentation
			// through the same optimistic-lock endpoint, without changing that bridge.
			const formatted=serialize();dirty=formatted!==comparable(baseHTML)||flow.hasDraftChanges();await persist();
			if(formatted!==comparable(baseHTML)){const formattedResult=await api.paperLoopNotebook(params({action:'save',noteHTML:formatted,baseHTML,includePendingImages:false}));if(!valid(token))return;result={...result,...formattedResult,images:result.images};baseHTML=result.noteHTML;loadHTML(result.noteHTML);}
			dirty=flow.hasDraftChanges();state.remote={...result,status:'existing'};await persist();
			const excluded=flow.excludedIDs();if(excluded.length){const discarded=await api.paperLoopNotebook(params({action:'discard-images',ids:excluded}));if(!valid(token))return;flow.restoreDraft(discarded.failed.map(r=>r.id),flow.pendingNames());await pendingImages();dirty=flow.hasDraftChanges();await persist();}
			if(valid(token)) {
				const failed=result.images&&result.images.failed.length||0;
				message(failed?t(`文字已保存；${failed} 张图片未保存，已保留，可再次点击保存重试`,`Text saved; ${failed} images retained for retry.`):t('图文笔记已保存到 Zotero','Note and images saved to Zotero'),failed?'error':'ready');
			}
		}catch(e){if(valid(token)){message(errorText(e),'error');if(e.status===409){saving=false;invalidateSync();await refresh(true);}}}
		finally{if(valid(token)){saving=false;invalidateSync();render();}}
	};
	this.debugState = () => host ? {open:true,documentKey:state.documentKey,minimized:!!state.minimized,thought:el.editor.innerText,noteHTML:serialize(),baseHTML,dirty,saving,font:appearance.font,theme:appearance.theme,mode:appearance.mode,themeImageLoaded:shadow.querySelector('.theme-photo').naturalWidth>0,excludedImages:flow?flow.excludedIDs():[],selectedTargetID:state.selectedTarget&&state.selectedTarget.targetID,status:el.status.textContent,draftStatus:el.draft.textContent,remoteConflict:!!remoteConflict,autoDisplaySettingsOpen:!el.settings.hidden,autoDisplayCategories:state.autoDisplayCategories,rectangle:host.getBoundingClientRect().toJSON(),images:allImages().length,pendingCount,activeView,selectedImages:gallery?[...gallery.selected]:[],imagesBusy} : {open:false};
	this.debugSetThought = value => {el.editor.innerHTML='<p>'+escape(value).replace(/\n/g,'<br>')+'</p>';changed();};
	this.debugClickClose = () => shadow.querySelector('.close').click();
	this.debugClickMinimize = () => setMinimized(true);
	this.debugClickMiniTab = () => setMinimized(false);
	this.debugToggleAutoDisplaySettings = () => shadow.querySelector('.more').click();
	this.debugClickChoose = () => el.target.click();
	this.debugClickSave = () => this.save();
	this.debugRefreshZotero = () => refresh(true);
	this.debugLoadRemote = loadRemote;
	this.debugResetPosition = () => shadow.querySelector('.reset').click();
	this.debugSelectResult = (index=0) => selectTarget(targets[index]);
	this.debugSetLanguage = value => {lang=value==='en'?'en':'zh';render();};
	this.debugDragBy = (dx,dy) => {const r=host.getBoundingClientRect();appearance.left=r.left+dx;appearance.top=r.top+dy;geometry();persistGeometry();};
	window.addEventListener('pagehide',()=>persist().catch(Zotero.logError));
	document.addEventListener('visibilitychange',()=>{if(document.hidden)persist().catch(Zotero.logError);});
	browser.runtime.onMessage.addListener(messageData=>{
		if(!messageData||messageData.type!=='paperloop:image-status'||messageData.documentKey!==currentKey())return;
		(async()=>{
			if(messageData.show&&!host)await this.show({documentKey:currentKey(),title:document.title,view:messageData.gallery?'images':'notes'});
			if(host){
				const token=generation;
				if(messageData.batch)gallery.progress(messageData.batch);
				await pendingImages();if(!valid(token))return;
				if(messageData.kind==='ready'||(messageData.batch&&messageData.batch.finished))await refresh(true);
				if(valid(token))message(messageData.message,messageData.kind);
			}
			else {
				const toast=document.createElement('div');toast.style.cssText='all:initial;position:fixed;right:24px;bottom:24px;z-index:2147483647;padding:12px 18px;background:#fbfbf7;color:#466653;border:1px solid #dfe5d7;border-radius:9px;box-shadow:0 5px 25px #21331c16;font:13px/1.5 "Microsoft YaHei",sans-serif;max-width:380px;';
				toast.textContent=messageData.message;document.documentElement.append(toast);setTimeout(()=>toast.remove(),4500);
			}
		})().catch(Zotero.logError);
	});
};
