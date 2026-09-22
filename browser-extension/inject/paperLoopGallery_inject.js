/* Image collection UI. The editor remains the source of truth for note HTML. */
Zotero.PaperLoopGallery = class {
	constructor(root, panel, options) {
		this.root=root; this.options=options; this.pending=[]; this.saved=[];
		this.selected=new Set(); this.seen=new Set(); this.thumbnails=new Map();
		this.busy=false; this.dead=false; this.jobs=[]; this.workers=0; this.signature='';
		root.innerHTML=`<style>
		.media-area{flex:1;min-height:0;display:flex;flex-direction:column}.media-top{padding:17px 23px 11px;display:flex;align-items:center;justify-content:space-between;gap:10px}.media-top h3{font-size:13px;font-weight:600;margin:0}.media-top p{font-size:10px;color:#829078;margin:4px 0 0}.media-select-all{font-size:11px;color:#66805b;padding:5px 0}.media-scroll{padding:0 23px 15px;overflow:auto;min-height:0;flex:1;scrollbar-width:thin;scrollbar-color:#ced7c7 transparent;overscroll-behavior:contain}.media-section{display:flex;justify-content:space-between;font-size:10px;letter-spacing:.6px;color:#8b9783;margin:6px 0 10px}.media-section:not(:first-child){margin-top:22px}.media-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(136px,1fr));gap:12px 10px;align-content:start}.media-card{min-width:0;border-radius:9px;border:1px solid #e1e6db;background:#fff;position:relative;overflow:hidden}.media-card[data-selected=true]{border-color:#8aa17f;box-shadow:0 0 0 1px #8aa17f35}.media-card[data-state=error]{border-color:#cda995}.media-preview{display:block;position:relative;width:100%;height:105px;border-radius:0;overflow:hidden;padding:9px;background:linear-gradient(135deg,#f3f5ee,#e9eee4);color:#99a48f}.media-preview:hover{background:#e9eee4}.media-preview img{width:100%;height:100%;object-fit:contain;display:block;transition:transform .18s ease}.media-preview:hover img{transform:scale(1.025)}.media-preview img:not([src]){visibility:hidden}.media-number{position:absolute;bottom:6px;left:8px;font-size:9px;line-height:1;color:#63745b;background:#fbfbf7db;padding:4px 5px;border-radius:4px}.media-preview-hint{position:absolute;bottom:6px;right:8px;opacity:0;background:#fbfbf7e8;padding:2px 5px;border-radius:4px;font-size:9px}.media-preview:hover .media-preview-hint,.media-preview:focus-visible .media-preview-hint{opacity:1}.media-check{position:absolute;top:7px;left:7px;background:#fbfbf7f2;border-radius:50%;width:23px;height:23px;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 5px #25361a0d}.media-check input{width:14px;height:14px;accent-color:#537148;margin:0;cursor:pointer}.media-caption{font:11px/1.5 'Segoe UI','Microsoft YaHei',sans-serif;margin:9px 9px 4px;white-space:nowrap;text-overflow:ellipsis;overflow:hidden;color:#45583d}.media-detail{display:flex;justify-content:space-between;align-items:center;gap:4px;padding:0 9px 9px;font-size:9px;color:#929d89}.media-card[data-state=error] .media-state{color:#a7674c}.media-card[data-state=saved] .media-state{color:#648158}.media-card[data-state=saving] .media-state{color:#597b4c}.media-empty{text-align:center;padding:37px 4px;color:#89977e;font-size:12px}.media-empty svg{width:56px;height:56px;display:block;margin:0 auto 17px;stroke:#a4b798;fill:none;stroke-width:1.3}.media-empty p{font-size:10px;line-height:1.8;color:#9da793}.media-bottom{padding:12px 23px 17px;border-top:1px solid #e6e9df;background:#f9faf5;flex-shrink:0}.media-selection{display:flex;align-items:center;justify-content:space-between;gap:7px;font-size:10px;color:#87947b;margin-bottom:9px}.media-remove{font-size:10px;padding:3px 0;color:#929b89}.media-remove.confirm{color:#a4624a}.media-save{display:block;width:100%;padding:11px 10px;border-radius:7px;background:#48684f;color:white;font-size:12px}.media-save:hover{background:#3e5b44}.media-save:disabled{opacity:.48}.media-progress{height:3px;border-radius:3px;background:#e4e9dd;overflow:hidden;margin:0 0 10px}.media-progress-fill{height:100%;background:#78976a;transition:width .15s ease}.media-note{font-size:10px;color:#8f9b85;margin:9px 0 0;line-height:1.6}.media-empty-actions{font-size:10px;color:#8f9b85;padding:5px 0}
		.media-viewer{position:absolute;inset:0;z-index:4;background:#fafbf7;display:flex;flex-direction:column;padding:16px;border-radius:14px}.media-viewer-head{display:flex;align-items:center;justify-content:space-between;color:#85947a;font-size:11px}.media-viewer-close{font-size:20px;width:28px;height:28px;color:#7e8c74}.media-viewer-stage{position:relative;flex:1;min-height:0;display:flex;align-items:center;justify-content:center;margin:14px 0;background:#eef2e7;border:1px solid #e4eadb;border-radius:9px}.media-viewer-image{display:block;width:100%;height:100%;object-fit:contain;padding:9px}.media-viewer-image:not([src]){visibility:hidden}.media-viewer-message{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:28px;text-align:center;font-size:12px;color:#929e86}.media-viewer-prev,.media-viewer-next{position:absolute;top:50%;transform:translateY(-50%);width:29px;height:35px;background:#fbfbf7ef;border:1px solid #dce4d4;color:#657d59;border-radius:6px;font-size:22px;box-shadow:0 2px 6px #324c2310}.media-viewer-prev{left:4px}.media-viewer-next{right:4px}.media-viewer-caption{font-size:12px;line-height:1.65;max-height:64px;overflow:auto;margin:0 0 5px;color:#4a6141}.media-viewer-info{font-size:10px;color:#91a087;margin:0 0 12px}.media-viewer-actions{display:flex;gap:8px;justify-content:space-between;align-items:center}.media-viewer-select{padding:8px 10px;font-size:11px;color:#617e54;background:#edf2e6}.media-viewer-download{color:#536f47;border:1px solid #dce5d2;border-radius:6px;font-size:11px;padding:8px 12px;text-decoration:none}.media-viewer-download[aria-disabled=true]{pointer-events:none;opacity:.4}@media(prefers-reduced-motion:reduce){.media-preview img,.media-progress-fill{transition:none}}
		.media-top{padding-top:14px;padding-bottom:8px}.media-preview{height:88px}.media-caption{margin-top:7px;margin-bottom:3px}.media-detail{padding-bottom:7px}.media-viewer.expanded{position:fixed;inset:24px;box-shadow:0 12px 100px #152b2150}.media-viewer-head>span{flex:1}.media-viewer-expand{width:30px;height:28px;font-size:19px;color:#7e8c74;margin-right:6px}
		</style><div class="media-top"><div><h3 class="media-title"></h3><p class="media-subtitle"></p></div><button class="media-select-all" type="button"></button></div>
		<div class="media-scroll"><div class="media-items"></div><div class="media-empty" hidden><svg viewBox="0 0 56 56" aria-hidden="true"><rect x="7" y="13" width="36" height="31" rx="4"/><path d="M15 8h30a4 4 0 0 1 4 4v26M8 36l10-10 10 9 6-5 8 8"/><circle cx="32" cy="22" r="3"/></svg><span class="media-empty-title"></span><p class="media-empty-hint"></p></div></div>
		<div class="media-bottom"><div class="media-progress" hidden><div class="media-progress-fill"></div></div><div class="media-selection"><span class="media-selection-text"></span><button class="media-remove" type="button"></button></div><button class="media-save" type="button"></button><p class="media-note"></p></div>`;
		this.el={}; for(const name of ['title','subtitle','select-all','scroll','items','empty','empty-title','empty-hint','bottom','progress','progress-fill','selection','selection-text','remove','save','note'])this.el[name]=root.querySelector('.media-'+name);
		this.viewer=document.createElement('div'); this.viewer.className='media-viewer'; this.viewer.hidden=true;
		this.viewer.setAttribute('role','dialog'); this.viewer.setAttribute('aria-modal','true'); this.viewer.setAttribute('aria-label','图片预览');
		this.viewer.innerHTML=`<div class="media-viewer-head"><span class="media-viewer-count"></span><button type="button" class="media-viewer-expand" aria-label="展开或缩小预览" aria-expanded="false" title="展开预览">⛶</button><button type="button" class="media-viewer-close" aria-label="关闭预览">×</button></div><div class="media-viewer-stage"><img class="media-viewer-image" alt=""><div class="media-viewer-message"></div><button type="button" class="media-viewer-prev" aria-label="上一张">‹</button><button type="button" class="media-viewer-next" aria-label="下一张">›</button></div><p class="media-viewer-caption"></p><p class="media-viewer-info"></p><div class="media-viewer-actions"><button type="button" class="media-viewer-select"></button><a class="media-viewer-download" download="paperloop-image.png"></a></div>`;
		panel.append(this.viewer); this.ve={}; for(const name of ['count','expand','close','image','message','prev','next','caption','info','select','download'])this.ve[name]=this.viewer.querySelector('.media-viewer-'+name);
		this.el['select-all'].onclick=()=>{if(this.busy||this.options.noteSaving())return;const all=this.selected.size===this.pending.length;this.selected=new Set(all?[]:this.pending.map(r=>r.id));this.confirmRemoval=false;this.controls();};
		this.el.save.onclick=()=>this.save(); this.el.remove.onclick=()=>this.remove();
		this.ve.close.onclick=()=>this.closeViewer();this.ve.prev.onclick=()=>this.openAt(this.viewerIndex-1);this.ve.next.onclick=()=>this.openAt(this.viewerIndex+1);
		this.ve.expand.onclick=()=>{const expanded=this.viewer.classList.toggle('expanded');this.ve.expand.setAttribute('aria-expanded',String(expanded));this.ve.expand.title=expanded?this.t('缩小预览','Reduce preview'):this.t('展开预览','Expand preview');};
		this.ve.select.onclick=()=>{const r=this.viewerItems[this.viewerIndex];if(r.kind==='pending')this.toggle(r.id);};
		this.viewer.addEventListener('keydown',e=>{
			if(e.key==='Escape'){e.preventDefault();e.stopPropagation();this.closeViewer();}
			if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();e.stopPropagation();this.openAt(this.viewerIndex+(e.key==='ArrowRight'?1:-1));}
			if(e.key==='Tab'){const focus=[...this.viewer.querySelectorAll('button:not([disabled]):not([hidden]),a[href]')];const current=this.viewer.getRootNode().activeElement;const next=e.shiftKey?focus[focus.length-1]:focus[0];if((e.shiftKey&&current===focus[0])||(!e.shiftKey&&current===focus[focus.length-1])){e.preventDefault();next.focus();}}
		});
		this.render();
	}
	t(zh,en){return this.options.t(zh,en);}
	setPending(records){
		if(this.dead)return;
		this.rawPending=records;records=records.filter(r=>!this.options.isExcluded?.(r.id));
		if(records.some(r=>r.status==='saving')&&!this.busy){this.busy=true;this.options.onBusy(true);}
		this.pending=records.map(r=>({...r,caption:this.options.imageName?.({...r,kind:'pending'})??r.caption,kind:'pending',key:'pending:'+r.id}));
		const ids=new Set(records.map(r=>r.id));
		for(const id of this.selected)if(!ids.has(id))this.selected.delete(id);
		for(const r of records)if(!this.seen.has(r.id)){this.seen.add(r.id);this.selected.add(r.id);}
		this.render();
	}
	setSaved(nodes){
		if(this.dead)return;
		const seen=new Set();this.saved=[];
		for(const img of nodes){const id=img.dataset.attachmentKey;if(!id||seen.has(id))continue;seen.add(id);
			this.saved.push({kind:'saved',key:'saved:'+id,id,caption:img.alt||this.t('笔记图片','Note image'),width:img.naturalWidth||0,height:img.naturalHeight||0});}
		this.render();
	}
	toggle(id){if(this.busy||this.options.noteSaving())return;this.selected.has(id)?this.selected.delete(id):this.selected.add(id);this.confirmRemoval=false;this.controls();}
	render(){
		if(this.dead)return;
		if(this.renameEditor){this.controls();return;}
		this.items=[...this.saved,...this.pending];
		const signature=JSON.stringify(this.items.map(r=>[r.key,r.caption,r.error,r.status,(this.options.links?.(r)||[]).map(l=>l.title)]));
		if(signature!==this.signature){
			this.signature=signature; const scroll=this.el.scroll.scrollTop;this.el.items.replaceChildren();
			for(const [records,label] of [[this.saved,this.t('笔记中的图片','IN NOTE')],[this.pending,this.t('待保存','TO SAVE')]]){
				if(!records.length)continue;
				const section=document.createElement('div');section.className='media-section';section.textContent=label+' · '+records.length;
				const grid=document.createElement('div');grid.className='media-grid';
				for(const record of records)grid.append(this.card(record));this.el.items.append(section,grid);
			}
			this.el.scroll.scrollTop=scroll;
			const keys=new Set(this.items.map(r=>r.key));for(const key of this.thumbnails.keys())if(!keys.has(key))this.thumbnails.delete(key);
		}
		this.controls();this.options.onCount(this.pending.length,this.saved.length);
	}
	card(record){
		const card=document.createElement('article');card.className='media-card';card.dataset.id=record.id;card.dataset.kind=record.kind;card.dataset.state=record.kind==='saved'?'saved':record.status||'pending';
		const preview=document.createElement('button');preview.className='media-preview';preview.type='button';preview.setAttribute('aria-label',this.t('预览：','Preview: ')+(record.caption||this.t('图片','Image')));
		const img=document.createElement('img');img.alt='';const number=document.createElement('span');number.className='media-number';number.textContent=String(this.items.indexOf(record)+1).padStart(2,'0');
		const hint=document.createElement('span');hint.className='media-preview-hint';hint.textContent=this.t('放大 ↗','View ↗');preview.append(img,number,hint);preview.onclick=()=>{if(!this.options.onOpen?.(record))this.open(record.key);};card.append(preview);
		if(this.options.onRemove){const remove=document.createElement('button');remove.type='button';remove.className='media-delete';remove.textContent='×';remove.setAttribute('aria-label',this.t('从笔记移除图片，保存前可撤销','Remove image from draft; undo before saving'));remove.onclick=()=>{if(!this.busy&&!this.options.noteSaving())this.options.onRemove(record);};card.append(remove);}
		if(record.kind==='pending'){
			const label=document.createElement('label');label.className='media-check';const input=document.createElement('input');input.type='checkbox';input.dataset.id=record.id;input.setAttribute('aria-label',this.t('选择：','Select: ')+(record.caption||this.t('图片','Image')));input.onchange=()=>this.toggle(record.id);label.append(input);card.append(label);
		}
		const caption=document.createElement('p');caption.className='media-caption';caption.textContent=record.caption||this.t('未命名图片','Untitled image');caption.title=caption.textContent;
		const detail=document.createElement('div');detail.className='media-detail';const status=document.createElement('span');status.className='media-state';status.textContent=record.kind==='saved'?this.t('✓ 已保存','✓ Saved'):record.error?this.t('未保存 · 可重试','Retry needed'):record.status==='saving'?this.t('保存中…','Saving…'):this.t('待保存','Pending');status.title=record.error||'';
		const dimensions=document.createElement('span');dimensions.className='media-dimensions';dimensions.textContent=record.width?`${record.width} × ${record.height}`:'…';detail.append(status,dimensions);
		if(this.options.onRename){const row=document.createElement('div');row.className='media-name-row';const rename=document.createElement('button');rename.type='button';rename.className='media-rename';rename.textContent=this.t('改名','Rename');rename.setAttribute('aria-label',this.t('重命名图片：','Rename image: ')+caption.textContent);rename.onclick=()=>this.beginRename(record,card,row);caption.onclick=()=>this.beginRename(record,card,row);row.append(caption,rename);card.append(row);}else card.append(caption);card.append(detail);
		if(this.options.links){const row=document.createElement('div');row.className='media-links';const refs=this.options.links(record);for(const ref of refs){const chip=document.createElement('span');chip.className='flow-chip';const label=document.createElement('button');label.type='button';label.textContent=ref.title;label.onclick=()=>this.open(record.key,ref.title);const x=document.createElement('button');x.type='button';x.className='flow-unlink';x.textContent='×';x.setAttribute('aria-label','解除与「'+ref.title+'」的关联');x.onclick=()=>{if(!this.busy&&!this.options.noteSaving())this.options.onUnlink(ref.entry,record);};chip.append(label,x);row.append(chip);}if(!refs.length){const link=document.createElement('button');link.type='button';link.className='media-link-add';link.textContent=this.t('关联当前段落','Link current paragraph');link.onclick=()=>{if(!this.busy&&!this.options.noteSaving())this.options.onLink(record);};row.append(link);}card.append(row);}
		this.loadThumbnail(record,img,dimensions);return card;
	}
	beginRename(record,card,row){
		if(this.dead||this.busy||this.options.noteSaving())return;if(this.renameEditor){if(this.renameEditor.record.key===record.key)return;if(!this.finishRename())return;const current=this.el.items.querySelector('.media-card[data-id="'+record.id+'"]');if(!current)return;card=current;row=current.querySelector('.media-name-row');}
		const form=document.createElement('div');form.className='media-name-editor';const input=document.createElement('input');input.className='media-name-input';input.type='text';input.maxLength=120;input.value=record.caption||'';input.setAttribute('aria-label',this.t('图片名称','Image name'));input.placeholder=this.t('给图片起个名字','Name this image');
		const apply=document.createElement('button');apply.type='button';apply.className='media-name-apply';apply.textContent=this.t('完成','Done');apply.onclick=()=>this.finishRename();const cancel=document.createElement('button');cancel.type='button';cancel.className='media-name-cancel';cancel.textContent=this.t('取消','Cancel');cancel.onclick=()=>this.finishRename(false);const error=document.createElement('span');error.className='media-name-error';error.setAttribute('role','alert');
		form.append(input,apply,cancel,error);row.hidden=true;row.after(form);this.renameEditor={record,card,row,form,input,error};
		form.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key==='Escape'){event.preventDefault();event.stopPropagation();this.finishRename(event.key==='Enter');}});
		form.addEventListener('focusout',event=>{if(this.renameEditor?.form===form&&!form.contains(event.relatedTarget))this.finishRename();});input.focus();input.select();
	}
	finishRename(apply=true){
		const edit=this.renameEditor;if(!edit)return true;
		if(apply){if(this.busy||this.options.noteSaving())return false;const value=edit.input.value.replace(/[\u0000-\u001f\u007f]/g,' ').trim();if(!value){edit.error.textContent=this.t('名称不能为空；按 Esc 可取消','Enter a name or press Esc to cancel');edit.input.setAttribute('aria-invalid','true');return false;}}
		this.renameEditor=null;let ok=true;if(apply)ok=this.options.onRename(edit.record,edit.input.value)!==false;edit.form.remove();edit.row.hidden=false;this.signature='';this.render();if(!ok)this.options.message(this.t('图片已变化，请刷新后再命名','Image changed; refresh and try again.'),'error');return ok;
	}
	controls(){
		if(this.dead)return;
		const count=this.selected.size,pending=this.pending.length,locked=this.busy||this.options.noteSaving();
		this.el.title.textContent=this.t('图片收藏','Image collection');this.el.subtitle.textContent=this.t('右键连续收图，在这里一起整理','Collect with right-click. Organize here.');
		this.el['select-all'].textContent=count===pending&&pending?this.t('取消全选','Deselect all'):this.t('全选待保存','Select pending');this.el['select-all'].disabled=locked||!pending;
		this.el.empty.hidden=!!this.items.length;this.el['empty-title'].textContent=this.t('留住值得细看的图片','Keep an image worth a closer look');this.el['empty-hint'].textContent=this.t('在网页图片上右键 → 添加图片到 PaperLoop\n可以连续添加多张，再一起保存。','Right-click a webpage image → Add to PaperLoop.\nCollect several, then save together.');
		this.el.selection.hidden=!pending;this.el.save.hidden=!pending;this.el.note.textContent=pending?this.t('图片已暂存本机，保存后写入当前文献笔记。','Images are staged locally until saved to this note.'):this.t('点击缩略图放大，使用 ← → 翻看。','Open a thumbnail; use ← → to browse.');
		this.el['selection-text'].textContent=this.progressData&&!this.progressData.finished?this.t(`保存进度 ${this.progressData.done} / ${this.progressData.total}`,`Saving ${this.progressData.done} / ${this.progressData.total}`):this.t(`已选 ${count} / ${pending} 张`,`Selected ${count} of ${pending}`);
		this.el.remove.textContent=this.confirmRemoval?this.t(`确认移除 ${count} 张？`,`Remove ${count} images?`):this.t('移除所选','Remove selected');this.el.remove.classList.toggle('confirm',!!this.confirmRemoval);this.el.remove.disabled=locked||!count;
		this.el.save.textContent=this.busy?this.t('正在保存…','Saving…'):this.t(`保存所选 ${count} 张到 Zotero`,`Save ${count} selected to Zotero`);this.el.save.disabled=this.busy||!count||this.options.noteSaving();
		for(const card of this.el.items.querySelectorAll('.media-card[data-kind=pending]')){card.dataset.selected=this.selected.has(card.dataset.id);const input=card.querySelector('input');input.checked=this.selected.has(card.dataset.id);input.disabled=locked;}
		for(const b of this.el.items.querySelectorAll('.media-delete,.flow-unlink,.media-link-add,.media-rename,.media-name-input,.media-name-apply,.media-name-cancel'))b.disabled=locked;
		if(!this.viewer.hidden){const r=this.viewerItems[this.viewerIndex];this.ve.select.hidden=r.kind!=='pending';this.ve.select.disabled=locked;this.ve.select.textContent=this.selected.has(r.id)?this.t('✓ 已选择','✓ Selected'):this.t('选择此图','Select image');}
	}
	async source(record){
		if(this.dead)throw new Error('Gallery closed');
		const result=await this.options.request(record.kind==='pending'?{action:'pending-preview',id:record.id}:{action:'image',imageKey:record.id});
		if(!/^data:image\/(png|jpeg|gif|webp);base64,/.test(result.dataURI||''))throw new Error(this.t('图片预览不可用','Image preview unavailable'));
		return result.dataURI;
	}
	loadThumbnail(record,node,dimensions){
		const apply=value=>{if(this.dead||!node.isConnected)return;node.src=value.url;dimensions.textContent=`${value.width} × ${value.height}`;};
		this.jobs.push(async()=>{
			if(this.dead||!node.isConnected)return;
			try{
				let value=this.thumbnails.get(record.key);
				if(!value){const src=await this.source(record);if(this.dead)return;const img=new Image();img.src=src;await img.decode();
					const canvas=document.createElement('canvas');const scale=Math.min(1,400/Math.max(img.naturalWidth,img.naturalHeight));canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));const ctx=canvas.getContext('2d');ctx.fillStyle='#f4f6ef';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
					value={url:canvas.toDataURL('image/jpeg',.85),width:img.naturalWidth,height:img.naturalHeight};this.thumbnails.set(record.key,value);}
				apply(value);
			}catch(e){if(!this.dead&&node.isConnected){node.parentElement.title=e.message;dimensions.textContent=this.t('预览不可用','No preview');}}
		});
		queueMicrotask(()=>this.pump());
	}
	pump(){while(!this.dead&&this.workers<2&&this.jobs.length){this.workers++;this.jobs.shift()().finally(()=>{this.workers--;this.pump();});}}
	open(key,heading){
		this.viewerItems=[...this.items];const index=this.viewerItems.findIndex(r=>r.key===key);if(index<0)return;
		this.explicitHeading=heading?{key,heading}:null;
		this.previousFocus=this.root.getRootNode().activeElement;this.viewer.hidden=false;this.ve.close.focus();return this.openAt(index);
	}
	async openAt(index){
		if(this.dead||index<0||index>=this.viewerItems.length)return;
		this.viewerIndex=index;const record=this.viewerItems[index];const token=(this.previewToken||0)+1;this.previewToken=token;
		this.ve.count.textContent=(this.explicitHeading?.key===record.key?this.explicitHeading.heading:this.options.heading?.(record)||this.t('图片','Image'))+` · ${index+1} / ${this.viewerItems.length}`;this.ve.prev.disabled=index===0;this.ve.next.disabled=index===this.viewerItems.length-1;
		this.ve.image.removeAttribute('src');this.ve.image.alt=record.caption||'';this.ve.message.textContent=this.t('正在读取原图…','Loading original…');this.ve.message.hidden=false;
		this.ve.caption.textContent=record.caption||this.t('未命名图片','Untitled image');this.ve.info.textContent=record.kind==='pending'?this.t('暂存本机 · 尚未写入 Zotero','Local staging · Not yet in Zotero'):this.t('已保存到 Zotero 笔记','Saved in the Zotero note');
		this.ve.download.textContent=this.t('下载原图 ↓','Download original ↓');this.ve.download.removeAttribute('href');this.ve.download.setAttribute('aria-disabled','true');this.controls();
		try{const src=await this.source(record);if(this.dead||this.previewToken!==token)return;this.ve.image.src=src;await this.ve.image.decode();if(this.dead||this.previewToken!==token)return;
			this.ve.message.hidden=true;this.ve.info.textContent+=` · ${this.ve.image.naturalWidth} × ${this.ve.image.naturalHeight}`;this.ve.download.href=src;this.ve.download.download='paperloop-'+record.id+'.'+({jpeg:'jpg',png:'png',gif:'gif',webp:'webp'}[src.match(/^data:image\/(\w+)/)[1]]);this.ve.download.setAttribute('aria-disabled','false');
		}catch(e){if(!this.dead&&this.previewToken===token)this.ve.message.textContent=e.message||this.t('无法预览此图片','Unable to preview this image');}
	}
	closeViewer(){this.previewToken=(this.previewToken||0)+1;this.viewer.hidden=true;this.viewer.classList.remove('expanded');this.ve.expand.setAttribute('aria-expanded','false');this.ve.image.removeAttribute('src');this.ve.download.removeAttribute('href');if(this.previousFocus&&this.previousFocus.isConnected)this.previousFocus.focus();}
	progress(data){if(this.dead)return;this.progressData=data;this.busy=!data.finished;this.options.onBusy(this.busy);this.el.progress.hidden=!!data.finished;this.el['progress-fill'].style.width=Math.round(100*data.done/data.total)+'%';this.controls();}
	async save(){
		if(this.dead||this.busy||!this.selected.size||this.options.noteSaving())return;
		if(!this.options.hasTarget()){this.options.chooseTarget();return;}
		const ids=[...this.selected];this.confirmRemoval=false;this.busy=true;this.options.onBusy(true);this.controls();
		try{const result=await this.options.request({action:'save-images',ids,confirmCreate:true});if(this.dead)return;
			await this.options.reload();if(this.dead)return;
			this.options.message(this.t(`已保存 ${result.saved} 张${result.failed.length?`，${result.failed.length} 张未保存，可重试`:''}`,`Saved ${result.saved}; ${result.failed.length} failed.`),result.ok?'ready':'error');
		}catch(e){if(!this.dead)this.options.message(e.message,'error');}
		finally{if(!this.dead){this.busy=false;this.options.onBusy(false);this.el.progress.hidden=true;this.controls();}}
	}
	async remove(){
		if(this.dead||this.busy||this.options.noteSaving()||!this.selected.size)return;
		if(!this.confirmRemoval){this.confirmRemoval=true;this.controls();return;}
		this.busy=true;this.options.onBusy(true);this.controls();
		try{const result=await this.options.request({action:'discard-images',ids:[...this.selected]});if(this.dead)return;
			await this.options.reload();if(!this.dead)this.options.message(this.t(`已移除 ${result.removed} 张暂存图片，不影响 Zotero 中的图片`,`Removed ${result.removed} staged images; Zotero images are unchanged.`),result.ok?'ready':'error');
		}catch(e){if(!this.dead)this.options.message(e.message,'error');}
		finally{if(!this.dead){this.busy=false;this.confirmRemoval=false;this.options.onBusy(false);this.controls();}}
	}
	dispose(){this.dead=true;this.renameEditor=null;this.jobs=[];this.thumbnails.clear();this.previewToken=(this.previewToken||0)+1;this.viewer.remove();}
};
