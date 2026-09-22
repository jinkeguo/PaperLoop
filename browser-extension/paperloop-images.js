/* Native image capture and a durable, bounded pending queue. */
Zotero.PaperLoopImages = new function () {
	const MAX_BYTES = 12 * 1024 * 1024;
	const busy = new Map();
	const batches = new Map();
	const mutations = new Map();
	const identicalRequests = new Map();
	let queueWrites = Promise.resolve();
	let captureOrder = 0;
	const encode = bytes => {
		let binary = ''; for (let i=0; i<bytes.length; i+=32768) binary += String.fromCharCode(...bytes.subarray(i,i+32768));
		return btoa(binary);
	};
	const keyFor = value => { const url = new URL(value); url.hash = ''; return url.href; };
	const emptyPlaceholder = html => !/<(?:img|table|a|hr)\b|data-(?:citation|annotation)/i.test(html||'')
		&& !String(html||'').replace(/<!--[\s\S]*?-->/g,'').replace(/<[^>]*>/g,'').replace(/&nbsp;|&#160;|\u00a0/g,' ').replace(/^\s*PaperLoop 思考\s*/,'').trim();
	const errorText = error => {
		let value = error && error.value;
		try { if (typeof value === 'string') value = JSON.parse(value); } catch (_) {}
		return value && value.error || error && error.message || '操作失败，请确认 Zotero 已打开';
	};
	function db() {
		return new Promise((resolve,reject) => {
			const req = indexedDB.open('paperloop-media-v1', 1);
			req.onupgradeneeded = () => req.result.createObjectStore('pending', {keyPath:'id'});
			req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
		});
	}
	async function storage(method, value) {
		const database = await db();
		try {
			return await new Promise((resolve,reject) => {
				const tx = database.transaction('pending', /^(get|getAll)$/.test(method) ? 'readonly' : 'readwrite');
				const req = tx.objectStore('pending')[method](value);
				let result; req.onsuccess = () => { result = req.result; };
				tx.oncomplete = () => resolve(result); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
			});
		} finally { database.close(); }
	}
	async function current(tab, documentKey) {
		const fresh = await browser.tabs.get(tab.id);
		if (keyFor(fresh.url) !== documentKey) throw new Error('页面已切换，图片已留在原页面的待保存列表');
		return fresh;
	}
	async function notify(tab, message, kind='ready', extra={}) {
		try { await browser.tabs.sendMessage(tab.id, {type:'paperloop:image-status',message,kind,...extra}, {frameId:0}); }
		catch (_) { await browser.action.setBadgeText({tabId:tab.id, text: kind === 'error' ? '!' : '✓'}); }
	}
	async function bridge(data) {
		try { return await Zotero.Connector.callMethod({method:'paperloop/notebook', timeout:30000}, data); }
		catch (error) { const e = new Error(error.status === 404 && data.action === 'capabilities'
			? '请安装 PaperLoop for Zotero 0.5.2 后使用图片和图文笔记' : errorText(error)); e.status = error.status; throw e; }
	}
	async function fetchImage(candidate, pageURL) {
		const u = new URL(candidate.url);
		if (!/^(https?:|data:)$/.test(u.protocol)) throw new Error('此图片地址不能直接保存');
		if (u.protocol === 'data:' && candidate.url.length > MAX_BYTES * 1.4) throw new Error('图片超过 12 MB');
		const abort = new AbortController(); const timer = setTimeout(() => abort.abort(), 15000);
		try {
			const response = await fetch(u.href, {credentials:'include', signal:abort.signal, referrer:pageURL, referrerPolicy:'strict-origin-when-cross-origin'});
			if (!response.ok) throw new Error(`图片下载失败 (${response.status})`);
			if (Number(response.headers.get('content-length')) > MAX_BYTES) throw new Error('图片超过 12 MB');
			let chunks=[], length=0;
			if (response.body) {
				const reader=response.body.getReader();
				for (;;) { const part=await reader.read(); if(part.done) break; length+=part.value.length;
					if(length>MAX_BYTES){await reader.cancel();throw new Error('图片超过 12 MB');} chunks.push(part.value); }
			} else { const bytes=new Uint8Array(await response.arrayBuffer()); chunks=[bytes]; length=bytes.length; }
			if (!length || length > MAX_BYTES) throw new Error('图片数据为空或超过 12 MB');
			const bytes=new Uint8Array(length); let offset=0; for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
			let mime=''; const ascii=(a,b)=>String.fromCharCode(...bytes.subarray(a,b));
			if(bytes[0]===137 && ascii(1,8)==='PNG\r\n\x1a\n')mime='image/png';
			else if(bytes[0]===255 && bytes[1]===216 && bytes[2]===255)mime='image/jpeg';
			else if(/^GIF8[79]a/.test(ascii(0,6)))mime='image/gif';
			else if(ascii(0,4)==='RIFF' && ascii(8,12)==='WEBP')mime='image/webp';
			if(!mime)throw new Error('地址返回的不是 PNG、JPEG、GIF 或 WebP 图片');
			const bitmap=await createImageBitmap(new Blob([bytes],{type:mime}));
			const width=bitmap.width, height=bitmap.height; bitmap.close();
			if(width*height>80000000 || width>12000 || height>12000)throw new Error('图片尺寸过大');
			return {bytes, mime, width, height, imageURL:response.url || u.href, sourceKind:candidate.kind};
		} finally { clearTimeout(timer); }
	}
	async function saveQueued(record, payload, tab) {
		if(busy.has(record.id))return busy.get(record.id);
		const operation=(async()=>{
			await bridge({action:'capabilities'});
			tab=await current(tab, record.documentKey);
			let state=await Zotero.Connector_Browser.paperLoopGetDocumentState({...payload,documentKey:record.documentKey},tab,0);
			if(state.status!=='existing'){
				if(!payload.confirmCreate)throw new Error('请先确认文献和分类，再保存图片');
				const info=Zotero.Connector_Browser.getTabInfo(tab.id);
				if ((info.translators||[]).some(t=>t.itemType==='multiple')) throw new Error('请到单篇文献详情页保存图片');
				await Zotero.Connector_Browser.paperLoopSaveThought({...payload, thought:'', documentKey:record.documentKey},tab,0);
				tab=await current(tab,record.documentKey);
				state=await Zotero.Connector_Browser.paperLoopGetDocumentState({...payload,documentKey:record.documentKey},tab,0);
			}
			if(state.status!=='existing'||!state.itemKey)throw new Error('尚未确认文献条目，图片已保留，请勿重复收藏');
			const result=await bridge({action:'add-image',libraryID:state.libraryID,itemKey:state.itemKey,
				base64:encode(new Uint8Array(record.bytes)),caption:record.caption,width:record.width,height:record.height,
				pageURL:record.pageURL,imageURL:record.imageURL});
			// Persist the queue-id -> native attachment mapping before removing bytes.
			// A closed tab can then recover pending associations without guessing captions.
			const mapKey='paperloop:image-map:v1:'+record.documentKey;
			const storedMap=(await browser.storage.local.get(mapKey))[mapKey]||{};
			storedMap[record.id]={imageKey:result.imageKey,libraryID:state.libraryID,itemKey:state.itemKey};
			const entries=Object.entries(storedMap).slice(-512);await browser.storage.local.set({[mapKey]:Object.fromEntries(entries)});
			await storage('delete',record.id);
			if(!payload.quiet)await notify(tab,`${result.repeated?'图片已在笔记中':'图片已保存'} · ${record.width} × ${record.height}`, 'ready', {documentKey:record.documentKey});
			return result;
		})();
		busy.set(record.id,operation);
		try{return await operation;}
		catch(error){record.error=errorText(error);await storage('put',record);throw error;}
		finally{busy.delete(record.id);}
	}
	this.capture=async(info,tab)=>{
		const capturedAt=Date.now(), order=++captureOrder;
		try{
			const documentKey=keyFor(tab.url);
			await notify(tab,'正在获取图片…','pending',{documentKey});
			let meta;
			try{meta=await browser.tabs.sendMessage(tab.id,{type:'paperloop:image-context',srcUrl:info.srcUrl},{frameId:info.frameId||0});}catch(_){}
			const candidates=meta && meta.candidates || [{url:info.srcUrl,kind:'displayed'}];
			let image, lastError;
			for(const candidate of candidates){
				try{const fetched=await fetchImage(candidate,tab.url);
					if(!image||fetched.width*fetched.height>image.width*image.height)image=fetched;
					if(fetched.width>=(meta&&meta.width||0) && candidate.kind!=='displayed')break;
				}catch(error){lastError=error;}
			}
			if(!image)throw lastError||new Error('无法获取图片，请尝试打开原图后保存');
			// Serialize insertions when multiple image downloads finish together.
			const insertion=queueWrites.catch(()=>{}).then(async()=>{
				const all=await storage('getAll');
				if(all.some(r=>r.documentKey===documentKey && r.imageURL===image.imageURL))return;
				if(all.length>=12)throw new Error('已有 12 张待保存图片，请先处理图片页中的图片');
				await storage('put',{id:crypto.randomUUID(),documentKey,pageURL:tab.url,pageTitle:tab.title,
					caption:meta&&meta.caption||'',createdAt:capturedAt,order,...image});
			});
			queueWrites=insertion;await insertion;
			tab=await current(tab,documentKey);
			const count=(await storage('getAll')).filter(r=>r.documentKey===documentKey).length;
			await notify(tab,`已加入图片夹 · ${count} 张待保存到 Zotero`,'pending',{documentKey,show:true,gallery:true});
		}catch(error){await notify(tab,errorText(error),'error',{show:true,documentKey:keyFor(tab.url)});Zotero.logError(error);}
	};
	async function request(payload,tab,frameId){
		if(!tab||frameId!==0)throw new Error('请在文献主页面操作');
		const documentKey=keyFor(tab.url);
		if(payload.documentKey && payload.documentKey!==documentKey)throw new Error('页面已切换，请等待侧栏更新');
		const action=payload.action;
		// Snapshot the staged set at the start of this save. Later captures remain
		// pending for the next click, rather than silently joining an in-flight save.
		const staged=action==='save'&&payload.includePendingImages
			?(await storage('getAll')).filter(r=>r.documentKey===documentKey&&!(Array.isArray(payload.excludedImageIDs)&&payload.excludedImageIDs.includes(r.id))).sort((a,b)=>a.createdAt-b.createdAt||(a.order||0)-(b.order||0)):[];
		// Names are document-scoped draft overrides. Apply only to this save's
		// validated pending records; native note/attachment handling stays unchanged.
		for(const record of staged){const name=payload.imageCaptions&&Object.hasOwn(payload.imageCaptions,record.id)&&payload.imageCaptions[record.id];if(typeof name==='string'&&name.trim())record.caption=name.replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,120);}
		if(action==='image-map'){
			const state=await Zotero.Connector_Browser.paperLoopGetDocumentState(payload,tab,0);if(state.status!=='existing')return {};
			const key='paperloop:image-map:v1:'+documentKey,stored=(await browser.storage.local.get(key))[key]||{};
			return Object.fromEntries(Object.entries(stored).filter(([,v])=>v&&v.libraryID===state.libraryID&&v.itemKey===state.itemKey&&/^[A-Z0-9]{8}$/.test(v.imageKey)).map(([id,v])=>[id,v.imageKey]));
		}
		if(action==='pending')return (await storage('getAll')).filter(r=>r.documentKey===documentKey)
			.sort((a,b)=>a.createdAt-b.createdAt || (a.order||0)-(b.order||0) || a.id.localeCompare(b.id))
			.map(({bytes,imageURL,...r})=>({...r,imageURL:/^https?:/.test(imageURL)?imageURL:'',status:busy.has(r.id)?'saving':r.error?'error':'pending'}));
		if(action==='save-images' || action==='discard-images'){
			if(!Array.isArray(payload.ids)||!payload.ids.length||payload.ids.length>12)throw new Error('请选择 1–12 张图片');
			const ids=[...new Set(payload.ids)];
			const batchKey=`${tab.id}:${documentKey}`;
			if(batches.has(batchKey))throw new Error('已有一组图片正在处理，请等待完成');
			if(action==='save-images'&&!payload.targetID)throw new Error('请先选择保存分类');
			const operation=(async()=>{
				const result={ok:true,saved:0,removed:0,failed:[],total:ids.length};
				for(const id of ids){
					try{
						await current(tab,documentKey);
						const record=await storage('get',id);
						if(!record||record.documentKey!==documentKey)throw new Error('图片已处理或不属于当前页面');
						if(action==='discard-images'){
							if(busy.has(id))throw new Error('此图片正在保存');
							await storage('delete',id);result.removed++;
						}else{await saveQueued(record,{...payload,quiet:true},tab);result.saved++;}
					}catch(error){result.failed.push({id,error:errorText(error)});}
					if(action==='save-images')await notify(tab,`正在保存图片 ${result.saved+result.failed.length}/${ids.length}`,'batch',
						{documentKey,batch:{...result,done:result.saved+result.failed.length}});
				}
				result.ok=!result.failed.length;
				if(action==='save-images')await notify(tab,`已保存 ${result.saved} 张${result.failed.length?` · ${result.failed.length} 张未保存，可重试`:''}`,
					result.ok?'ready':'error',{documentKey,batch:{...result,done:ids.length,finished:true}});
				return result;
			})();
			batches.set(batchKey,operation);
			try{return await operation;}finally{if(batches.get(batchKey)===operation)batches.delete(batchKey);}
		}
		if(['pending-preview','save-image','discard-image'].includes(action)){
			const record=await storage('get',payload.id);if(!record||record.documentKey!==documentKey)throw new Error('找不到当前页面的待保存图片');
			if(action==='pending-preview')return {dataURI:`data:${record.mime};base64,${encode(new Uint8Array(record.bytes))}`};
			if(action==='discard-image'){if(busy.has(record.id))throw new Error('图片正在保存');await storage('delete',record.id);return{ok:true};}
			return saveQueued(record,payload,tab);
		}
		await bridge({action:'capabilities'});
		let state=await Zotero.Connector_Browser.paperLoopGetDocumentState(payload,tab,0);
		if(action==='save' && state.status==='existing'){
			const hadNote=!!state.noteHTML;
			// Keep the existing collection/PDF workflow, but never send rich content
			// through the legacy full-text overwrite endpoint.
			await Zotero.Connector_Browser.paperLoopSaveThought({...payload,thought:'',noteOnly:true},tab,0);
			tab=await current(tab,documentKey);
			state=await Zotero.Connector_Browser.paperLoopGetDocumentState(payload,tab,0);
			if(!hadNote&&payload.baseHTML===''){
				if(!emptyPlaceholder(state.noteHTML)){const error=new Error('笔记已在其他窗口更新，草稿已保留');error.status=409;throw error;}
				payload={...payload,baseHTML:state.noteHTML};
			}
		}
		if(action==='save' && state.status!=='existing'){
			await Zotero.Connector_Browser.paperLoopSaveThought({...payload,thought:''},tab,0);
			tab=await current(tab,documentKey);
			state=await Zotero.Connector_Browser.paperLoopGetDocumentState(payload,tab,0);
			if(!emptyPlaceholder(state.noteHTML)){const error=new Error('文献已有笔记，请先载入现有笔记再保存');error.status=409;throw error;}
			payload={...payload,baseHTML:state.noteHTML};
		}
		if(state.status!=='existing')throw new Error('请先收藏当前文献');
		let result=await bridge({action,libraryID:state.libraryID,itemKey:state.itemKey,noteHTML:payload.noteHTML,baseHTML:payload.baseHTML,imageKey:payload.imageKey});
		if(action!=='save'||!payload.includePendingImages)return result;
		// Write text before appending images, so the editor's older HTML can never
		// overwrite images added during this same operation. A failed image stays local.
		const images={ok:true,saved:0,failed:[],total:staged.length};
		for(const record of staged){
			try{await current(tab,documentKey);result=await saveQueued(record,{...payload,confirmCreate:false,quiet:true},tab);images.saved++;}
			catch(error){images.failed.push({id:record.id,error:errorText(error)});}
			await notify(tab,`正在保存图片 ${images.saved+images.failed.length}/${images.total}`,'batch',
				{documentKey,batch:{...images,done:images.saved+images.failed.length}});
		}
		images.ok=!images.failed.length;
		if(staged.length)await notify(tab,images.ok?'图文笔记已保存到 Zotero':`文字已保存；${images.failed.length} 张图片未保存，可重试`,
			images.ok?'ready':'error',{documentKey,batch:{...images,done:images.total,finished:true}});
		return {...result,ok:images.ok,textSaved:true,images};
	}
	this.request=(payload={},tab,frameId)=>{
		if(!tab||frameId!==0)return Promise.reject(new Error('请在文献主页面操作'));
		const key=keyFor(tab.url);
		if(payload.documentKey&&payload.documentKey!==key)return Promise.reject(new Error('页面已切换，请等待侧栏更新'));
		if(!['save','save-images','save-image','discard-images','discard-image'].includes(payload.action))return request(payload,tab,frameId);
		// Serialize mutations across tabs showing the same document, and coalesce
		// identical retries. Different drafts still pass through optimistic locking.
		const signature=key+':'+JSON.stringify(payload);
		if(identicalRequests.has(signature))return identicalRequests.get(signature);
		const operation=(mutations.get(key)||Promise.resolve()).catch(()=>{}).then(async()=>request(payload,await current(tab,key),frameId));
		mutations.set(key,operation);identicalRequests.set(signature,operation);
		const cleanup=()=>{if(mutations.get(key)===operation)mutations.delete(key);if(identicalRequests.get(signature)===operation)identicalRequests.delete(signature);};
		operation.then(cleanup,cleanup);
		return operation;
	};
};
Zotero.Connector_Browser.paperLoopNotebook=function(payload={},tab,frameId){return Zotero.PaperLoopImages.request(payload,tab,frameId);};
