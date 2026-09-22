/* Presentation and reversible note/image associations. Native attachment keys remain authoritative. */
Zotero.PaperLoopFlow = class {
 constructor(shadow, editor, options) {
  this.shadow=shadow;this.editor=editor;this.options=options;this.active=null;this.undo=[];this.excluded=new Set();this.mapping={};this.names={};this.linking=false;
  this.store=document.createElement('div');this.store.className='flow-image-store';this.store.hidden=true;editor.after(this.store);
  const style=document.createElement('style');style.textContent=`
  .panel{--bg:#eeeae5;--paper:#fcfbf8;--gallery:#dfeaf0;--text:#29343e;--muted:#636d75;--line:#e2e0dc;--accent:#415b70;--soft:#edf2f5;--on:#fff;--pop:#aa5638;--warm:#f8e9e1;background:var(--bg);color:var(--text);border-color:var(--line);border-radius:17px}
  .panel button:hover{background:var(--soft)}.panel button:focus-visible,.panel input:focus-visible,.panel select:focus-visible,.panel [contenteditable]:focus-visible{outline:2px solid var(--accent);outline-offset:2px}.panel a{color:var(--accent)}
  .bar{background:var(--paper);padding:11px 13px;flex-shrink:0}.brand{font:28px/1.2 'Segoe Print','Bradley Hand',cursive;font-style:italic;color:var(--accent)}.grip,.icon{color:var(--muted)}.theme-toggle{font-size:11px;padding:6px 8px;border:1px solid var(--line);background:var(--paper);white-space:nowrap}
  .context{position:relative;isolation:isolate;overflow:hidden;background:var(--bg);padding:19px 21px;border:0;flex-shrink:0;min-height:117px}.theme-photo{position:absolute;inset:0 0 0 auto;width:62%;height:100%;object-fit:cover;object-position:center 35%;opacity:.38;mask-image:linear-gradient(90deg,transparent,#000 68%);z-index:-1;pointer-events:none}.context .title{font-size:16px;max-width:86%;font-weight:500}.meta,.target{color:var(--muted)}
  .notebook-tabs{display:none}.notebook-flow{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:var(--line) transparent;padding:0 10px 10px}.content{flex:none;overflow:visible;padding:14px;background:var(--paper);border-radius:12px}.label{font-size:13px;letter-spacing:0;font-weight:500;color:var(--text);margin:0}.writing-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px}.flow-link,.flow-add,.flow-undo{font-size:11px;color:var(--pop);padding:5px}.flow-add{color:var(--muted);margin-top:8px}.flow-undo{color:var(--accent)}
  .editor,.panel[data-font=standard] .editor{font:14px/1.85 'Segoe UI','Microsoft YaHei',sans-serif;color:var(--text);min-height:92px}.panel[data-font=hand] .editor{font:17px/1.85 KaiTi,STKaiti,serif}.editor:empty:before,.editor:has(>p:only-child:empty):before{color:var(--muted);font-size:13px}.editor p{margin:0 0 12px}.editor h3{font:500 14px/1.6 'Segoe UI','Microsoft YaHei',sans-serif;margin:0 0 7px}.editor .paperloop-entry{padding:13px 10px 8px 12px;margin:0 0 7px;border-bottom:1px solid var(--line);border-left:2px solid transparent;border-radius:5px}.editor .flow-active{border-left:2px solid var(--pop);background:var(--soft)}
  .editor img,.editor .paperloop-image-source,.editor .paperloop-image-caption,.editor .paperloop-gallery-title,.editor .paperloop-figure-title,.editor .paperloop-ref-summary,.editor p:has(>img:only-child){display:none}.editor td,.editor th{border-color:var(--line)}.editor blockquote{border-color:var(--accent)}
  .flow-refs,.media-links{display:flex;gap:5px;flex-wrap:wrap;margin:7px 0}.flow-chip{display:inline-flex;max-width:100%;align-items:center;background:var(--warm);color:var(--pop);border-radius:6px;font:11px/1.5 'Segoe UI','Microsoft YaHei',sans-serif;overflow:hidden}.flow-chip button{border-radius:0;padding:4px 6px;min-width:0;overflow-wrap:anywhere;text-align:left}.flow-chip .flow-unlink{font-size:16px;padding:2px 7px;align-self:stretch;flex-shrink:0}.flow-chip .flow-unlink:hover{color:#b43c4c}.flow-link-hint{font-size:11px;color:var(--accent);padding:9px 0}
  .media-area{display:block;flex:none;min-height:0;margin-top:11px;padding:12px;background:var(--gallery);border-radius:12px}.media-top{padding:0 0 9px}.media-top h3{font-size:13px;font-weight:500}.media-top p{font-size:11px;color:var(--muted)}.media-scroll{padding:0;overflow:visible;flex:none}.media-grid{grid-template-columns:repeat(auto-fill,minmax(113px,1fr));gap:9px}.media-section{font-size:11px;color:var(--muted);letter-spacing:0;margin-top:6px}.media-card{border:1px solid var(--line);border-radius:10px;background:var(--paper)}.media-card[data-selected=true]{border-color:var(--line);box-shadow:none}.media-preview,.media-preview:hover{height:112px;padding:27px 9px 9px;background:var(--soft)}.media-number{left:7px;top:7px;bottom:auto;background:var(--paper);color:var(--muted);font-size:10px}.media-caption{color:var(--text);font-size:12px;margin:7px 9px 3px}.media-detail{font-size:11px;color:var(--muted)}.media-dimensions,.media-check,.media-select-all,.media-bottom,.media-preview-hint{display:none!important}.media-links{padding:0 8px;margin:5px 0 9px}.media-links .flow-chip{background:var(--soft);color:var(--accent)}.media-link-add{font-size:11px;color:var(--muted);padding:4px 0}.media-delete{position:absolute;right:5px;top:5px;width:26px;height:26px;display:flex;align-items:center;justify-content:center;font-size:17px;border:1px solid var(--line);background:var(--paper);border-radius:50%;color:var(--muted)}.media-delete:hover{color:#b43c4c}.media-empty,.media-empty p{color:var(--muted);font-size:12px}.media-empty{padding:20px 2px}
  .status{color:var(--muted);padding:7px 20px 0;font-size:11px;max-height:64px;overflow:auto;flex-shrink:0}.status[data-kind=ready]{color:var(--accent)}.footer{background:var(--paper);padding:13px 20px;flex-shrink:0}.draft{font-size:11px;color:var(--muted)}.save,.save:hover{background:var(--accent);color:var(--on);border-radius:9px}.settings,.picker{background:var(--paper);border-color:var(--line);flex-shrink:0;padding:12px 20px}.settings select,.query{background:var(--paper);border-color:var(--line);color:var(--text)}.actions button,.hint,.result{color:var(--muted)}.settings input{accent-color:var(--accent)}.conflict{background:var(--warm);color:var(--pop);flex-shrink:0}.resize{color:var(--muted)}
  .media-viewer{background:var(--paper);color:var(--text)}.media-viewer-head,.media-viewer-caption,.media-viewer-info,.media-viewer-close,.media-viewer-expand{color:var(--text)}.media-viewer-head>span{font-size:14px;overflow-wrap:anywhere}.media-viewer-stage{background:var(--soft);border-color:var(--line)}.media-viewer-message{color:var(--muted)}.media-viewer-prev,.media-viewer-next{background:var(--paper);border-color:var(--line);color:var(--accent)}.media-viewer-info{display:none}.media-viewer-download,.media-viewer-select{color:var(--accent);background:var(--paper);border-color:var(--line)}.media-viewer-caption{font-size:11px;color:var(--muted)}
  .panel[data-compact=true] .brand{font-size:23px;min-width:0}.panel[data-compact=true] .bar{padding:10px 7px;gap:2px}.panel[data-compact=true] .theme-toggle{font-size:10px;padding:5px}.panel[data-compact=true] .icon{width:24px}.panel[data-compact=true] .content{padding:12px}.panel[data-compact=true] .media-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
  .editor .flow-deletable{position:relative;padding-right:30px}.flow-entry-tools{position:absolute;right:0;top:4px;line-height:1}.flow-entry-delete{width:27px;height:27px;font:18px/1 sans-serif;color:var(--muted);border-radius:6px}.flow-entry-delete:hover,.flow-remove-current:hover{color:#b43c4c;background:var(--warm)}.flow-remove-current{font-size:11px;color:var(--muted);padding:5px;margin-left:8px}.flow-remove-current:disabled{opacity:.4}
  .media-name-row{display:flex;align-items:center;gap:2px;margin:7px 7px 3px 9px;min-width:0}.media-name-row .media-caption{flex:1;margin:0;min-width:0}.media-rename{flex-shrink:0;color:var(--muted);font-size:11px;padding:4px}.media-name-editor{display:flex;flex-wrap:wrap;gap:4px;align-items:center;margin:7px 8px}.media-name-input{width:100%;min-width:0;font:12px/1.6 'Segoe UI','Microsoft YaHei',sans-serif;color:var(--text);background:var(--paper);border:1px solid var(--accent);border-radius:5px;padding:4px 6px}.media-name-editor button{font-size:11px;padding:4px 6px;color:var(--accent)}.media-name-error{font-size:10px;color:#b43c4c;width:100%}
  @media(pointer:coarse){.media-delete{width:44px;height:44px}.flow-chip button,.flow-add,.flow-link,.theme-toggle,.flow-entry-delete,.flow-remove-current,.media-rename,.media-name-editor button{min-height:44px}.flow-chip .flow-unlink{min-width:44px}.media-preview{padding-top:49px}.editor{font-size:16px}}
  `;shadow.append(style);
  const head=document.createElement('div');head.className='writing-head';const label=shadow.querySelector('.label');label.before(head);head.append(label);
  this.linkButton=this.button('flow-link','关联图片',()=>{if(this.locked())return;this.linking=!this.linking;if(!this.active)this.select(this.entries()[0]);this.update();if(this.linking)this.shadow.querySelector('.media-area').scrollIntoView({block:'nearest'});});head.append(this.linkButton);
  this.addButton=this.button('flow-add','＋ 新的一段',()=>this.add());editor.after(this.addButton);
  this.removeButton=this.button('flow-remove-current','− 删除本段',()=>{if(this.active)this.removeEntry(this.active);});this.addButton.after(this.removeButton);
  this.undoButton=this.button('flow-undo','撤销',()=>{if(this.locked())return;const fn=this.undo.pop();if(fn){fn();this.notify();}});this.undoButton.hidden=true;shadow.querySelector('.status').after(this.undoButton);
  this.hint=document.createElement('div');this.hint.className='flow-link-hint';this.hint.hidden=true;shadow.querySelector('.media-area').prepend(this.hint);
  editor.addEventListener('click',e=>{if(!e.target.closest('.pl-ui'))this.select(e.target);});
  editor.addEventListener('keyup',()=>{const selection=shadow.getSelection?.()||document.getSelection();if(selection?.anchorNode)this.select(selection.anchorNode);});
 }
 locked(){return this.options.locked();}
 images(){return [...this.store.querySelectorAll('img[data-attachment-key]')];}
 extract(){for(const img of this.editor.querySelectorAll('img[data-attachment-key]')){const parent=img.parentElement;if(this.images().some(old=>old.dataset.attachmentKey===img.dataset.attachmentKey))img.remove();else this.store.append(img);if(parent!==this.editor&&parent.tagName==='P'&&!parent.textContent.trim()&&!parent.childElementCount)parent.remove();}}
 importColumns(){
  // Zotero's native editor removes arbitrary classes/div wrappers. Recognize
  // our visible table header too, and reconstruct links from each right cell.
  const tables=[...this.editor.children].filter(node=>node.tagName==='TABLE'&&(node.classList.contains('paperloop-columns')||(node.rows[0]?.cells.length===2&&node.rows[0].cells[0].textContent.trim()==='PaperLoop · 笔记'&&node.rows[0].cells[1].textContent.trim()==='关联图片')));
  if(!tables.length)return;
  const collected=new Map();
  const collect=(container)=>{
   for(const img of [...container.querySelectorAll('img[data-attachment-key]')]){
    const key=img.dataset.attachmentKey,p=img.closest('p'),heading=p?.previousElementSibling;
    const match=heading?.matches('h3')&&/^图 (\d+) · ([\s\S]*)$/.exec(heading.textContent);
    if(match){img.alt=match[2];heading.remove();}
    if(!collected.has(key))collected.set(key,{img,index:match?Number(match[1]):Infinity});img.remove();
    if(p&&!p.textContent.trim()&&!p.childElementCount)p.remove();
   }
  };
  for(const table of tables){
   const fragment=document.createDocumentFragment();
   for(const row of [...table.rows].slice(1)){
    // A merged/restructured row is kept intact rather than losing user data.
    if(row.cells.length!==2||[...row.cells].some(cell=>cell.colSpan!==1||cell.rowSpan!==1)){const preserved=document.createElement('table');preserved.append(row.cloneNode(true));fragment.append(preserved);continue;}
    const [left,right]=row.cells,keys=[...new Set([...right.querySelectorAll('img[data-attachment-key]')].map(img=>img.dataset.attachmentKey))];
    collect(right);right.querySelectorAll('.paperloop-figure-title').forEach(n=>n.remove());
    let entry=left.children.length===1&&left.firstElementChild.matches('.paperloop-entry')?left.firstElementChild:document.createElement('div');
    if(entry.parentNode!==left)entry.append(...left.childNodes);entry.classList.add('paperloop-entry');
    for(const token of [...entry.classList])if(/^pl-ref-[A-Z0-9]{8}$/.test(token))entry.classList.remove(token);
    keys.forEach(key=>entry.classList.add('pl-ref-'+key));
    // Do not discard text a user added beside an image in Zotero.
    if(right.textContent.trim()||right.querySelector('table,a,hr'))entry.append(...right.childNodes);
    fragment.append(entry);
   }
   table.replaceWith(fragment);
  }
  // The unassociated image section belongs to this layout, not the text body.
  for(const heading of [...this.editor.children].filter(node=>node.matches('h2')&&node.textContent.trim()==='未关联图片'))heading.remove();
  collect(this.editor);
  [...collected.values()].sort((a,b)=>a.index-b.index).forEach(({img})=>this.editor.append(img));
 }
 button(cls,text,fn){const b=document.createElement('button');b.type='button';b.className=cls;b.textContent=text;b.onclick=e=>{e.preventDefault();e.stopPropagation();fn();};return b;}
 entries(){return [...this.editor.children].filter(e=>!e.matches('img,.paperloop-image-caption,.paperloop-image-source,.paperloop-gallery-title,.paperloop-figure-title,.pl-ui')&&!e.querySelector('img')&&(e.matches('.paperloop-entry')||e.textContent.trim()));}
 select(node){if(node?.nodeType===3)node=node.parentElement;while(node&&node.parentElement!==this.editor)node=node.parentElement;if(node&&node.parentElement===this.editor&&!node.querySelector('img')&&!node.matches('img,.pl-ui'))this.active=node;this.update();}
 id(entry){let id=[...entry.classList].find(c=>/^pl-entry-[a-z0-9-]+$/i.test(c));if(!id){id='pl-entry-'+crypto.randomUUID();entry.classList.add(id);}return id;}
 title(entry){const clone=entry.cloneNode(true);clone.querySelectorAll('.pl-ui,.paperloop-ref-summary').forEach(n=>n.remove());return (clone.querySelector('h2,h3,h4')?.textContent||clone.textContent||'未命名笔记').trim().slice(0,60);}
 resolve(id){return /^[A-Z0-9]{8}$/.test(this.mapping[id]||'')?this.mapping[id]:id;}
 refs(entry){return [...entry.classList].filter(c=>/^pl-ref-[A-Za-z0-9-]{8,64}$/.test(c)).map(c=>({token:c,id:this.resolve(c.slice(7))}));}
 associated(record){return this.entries().filter(e=>this.refs(e).some(r=>r.id===record.id)).map(entry=>({entry,title:this.title(entry)}));}
 caption(record){return this.associated(record)[0]?.title||record.caption||'图片';}
 setMap(map){this.mapping=map||{};for(const [id,name] of Object.entries(this.names)){const key=this.mapping[id],nodes=this.images().filter(img=>img.dataset.attachmentKey===key);if(nodes.length){nodes.forEach(img=>img.alt=name);delete this.names[id];}}this.update();}
 restoreDraft(ids,names={}){this.excluded=new Set(Array.isArray(ids)?ids.filter(id=>typeof id==='string'&&/^[a-z0-9-]{8,64}$/i.test(id)):[]);this.names=Object.fromEntries(Object.entries(names||{}).filter(([id,name])=>/^[a-z0-9-]{8,64}$/i.test(id)&&typeof name==='string'&&name.trim()).map(([id,name])=>[id,this.normalizeName(name)]));}
 excludedIDs(){return [...this.excluded];}
 pendingNames(){return {...this.names};}
 hasDraftChanges(){return !!this.excluded.size||!!Object.keys(this.names).length;}
 normalizeName(value){return String(value).replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,120);}
 imageName(record){return record.kind==='pending'&&Object.hasOwn(this.names,record.id)?this.names[record.id]:record.caption;}
 rename(record,value){
  if(this.locked())return false;const name=this.normalizeName(value);if(!name)return false;if(name===this.imageName(record))return true;
  if(record.kind==='pending'){const had=Object.hasOwn(this.names,record.id),old=this.names[record.id];this.names[record.id]=name;this.push(()=>{if(had)this.names[record.id]=old;else delete this.names[record.id];});}
  else {const nodes=this.images().filter(img=>img.dataset.attachmentKey===record.id);if(!nodes.length)return false;const old=nodes.map(img=>[img,img.getAttribute('alt')]);nodes.forEach(img=>img.alt=name);this.push(()=>old.forEach(([img,alt])=>{if(alt===null)img.removeAttribute('alt');else img.alt=alt;}));}
  this.notify();this.options.message('图片已命名为「'+name+'」，点击“保存到 Zotero”后写入笔记');return true;
 }
 snapshot(){const clone=this.editor.cloneNode(true);clone.querySelectorAll('.pl-ui').forEach(n=>n.remove());clone.querySelectorAll('.flow-active').forEach(n=>n.classList.remove('flow-active'));return clone.innerHTML+this.store.innerHTML;}
 serialized(){
  const clone=this.editor.cloneNode(true);clone.querySelectorAll('.pl-ui,.paperloop-ref-summary,.paperloop-image-source,.paperloop-image-caption,.paperloop-gallery-title,.paperloop-figure-title').forEach(n=>n.remove());
  for(const img of this.images())clone.append(img.cloneNode(true));
  clone.querySelectorAll('.flow-active,.flow-deletable').forEach(n=>n.classList.remove('flow-active','flow-deletable'));
  const imgs=[...clone.querySelectorAll('img[data-attachment-key]')];const keys=[...new Set(imgs.map(n=>n.dataset.attachmentKey))];
  for(const entry of clone.querySelectorAll('[class]')){const refs=this.refs(entry);for(const r of refs){entry.classList.remove(r.token);entry.classList.add('pl-ref-'+r.id);}}
  // Reorganize only native embedded images. Rich text, tables and citations stay intact.
  const figures=[];for(const img of imgs){const parent=img.parentElement;img.remove();if(parent!==clone&&!parent.textContent.trim()&&!parent.childElementCount)parent.remove();if(!figures.some(n=>n.dataset.attachmentKey===img.dataset.attachmentKey))figures.push(img);}
  if(figures.length){
   const used=new Set(),byKey=new Map(figures.map(img=>[img.dataset.attachmentKey,img]));
   const figure=(key,cell)=>{const source=byKey.get(key);if(!source)return;used.add(key);const h=document.createElement('h3');h.className='paperloop-figure-title';h.textContent='图 '+(keys.indexOf(key)+1)+' · '+(source.alt||'图片');const p=document.createElement('p'),img=source.cloneNode(true);const width=Number(img.getAttribute('width')),height=Number(img.getAttribute('height'));if(cell.tagName==='TD'&&width>240){img.width=240;if(height>0)img.height=Math.max(1,Math.round(height*240/width));}p.append(img);cell.append(h,p);};
   const entries=[...clone.childNodes].filter(node=>node.nodeType!==3||node.textContent.trim());
   clone.replaceChildren();
   {const table=document.createElement('table');table.className='paperloop-columns';const body=document.createElement('tbody'),header=document.createElement('tr');for(const [text,width] of [['PaperLoop · 笔记',330],['关联图片',270]]){const th=document.createElement('th');th.setAttribute('data-colwidth',String(width));const p=document.createElement('p');p.textContent=text;th.append(p);header.append(th);}body.append(header);
    for(const entry of entries){const row=document.createElement('tr'),left=document.createElement('td'),right=document.createElement('td');left.setAttribute('data-colwidth','330');right.setAttribute('data-colwidth','270');if(entry.nodeType===1&&entry.classList.contains('paperloop-entry'))left.append(entry);else{const wrapper=document.createElement('div');wrapper.className='paperloop-entry';wrapper.append(entry);if(entry.nodeType===1)for(const ref of this.refs(entry)){entry.classList.remove(ref.token);wrapper.classList.add('pl-ref-'+ref.id);}left.append(wrapper);}const ids=[left.firstElementChild,...left.querySelectorAll('[class]')].flatMap(node=>this.refs(node).map(ref=>ref.id));[...new Set(ids)].forEach(key=>figure(key,right));if(!right.childNodes.length)right.append(document.createElement('p'));row.append(left,right);body.append(row);}table.append(body);clone.append(table);
   }
   const unlinked=figures.filter(img=>!used.has(img.dataset.attachmentKey));if(unlinked.length){const h=document.createElement('h2');h.className='paperloop-gallery-title';h.textContent='未关联图片';clone.append(h);unlinked.forEach(img=>figure(img.dataset.attachmentKey,clone));}
  }
  return clone.innerHTML;
 }
 update(){
  if(!this.active?.isConnected)this.active=null;
  this.editor.querySelectorAll('.pl-ui').forEach(n=>n.remove());this.editor.querySelectorAll('.flow-active').forEach(n=>n.classList.remove('flow-active'));
  if(this.active)this.active.classList.add('flow-active');
  const gallery=this.options.gallery();const items=gallery?.items||[];
  for(const entry of this.entries()){
   if(entry.matches('div,p,h2,h3,h4,h5,h6,blockquote')){entry.classList.add('flow-deletable');const tools=document.createElement('span');tools.className='pl-ui flow-entry-tools';tools.contentEditable='false';const remove=this.button('flow-entry-delete','−',()=>this.removeEntry(entry));remove.title='删除本段，保留图片；保存前可撤销';remove.setAttribute('aria-label','删除段落：'+this.title(entry));remove.disabled=this.locked();tools.append(remove);entry.append(tools);}
   const refs=this.refs(entry).filter((r,i,a)=>a.findIndex(x=>x.id===r.id)===i);if(!refs.length)continue;
   const row=document.createElement('span');row.className='pl-ui flow-refs';row.contentEditable='false';
   for(const r of refs){const record=items.find(p=>p.id===r.id);const label=record?'图 '+(items.indexOf(record)+1):'待保存图片';row.append(this.chip(label,()=>record&&gallery.open(record.key,this.title(entry)),()=>this.unlink(entry,r.id)));}entry.append(row);
  }
  this.linkButton.textContent=this.linking?'完成关联':'关联图片';this.linkButton.setAttribute('aria-pressed',String(this.linking));this.hint.hidden=!this.linking;this.hint.textContent='为「'+(this.active?this.title(this.active):'请先选择一段文字')+'」选择图片，可连续选择';this.undoButton.hidden=!this.undo.length;
  for(const button of [this.linkButton,this.addButton,this.undoButton])button.disabled=this.locked();this.removeButton.disabled=this.locked()||!this.active||!this.entries().includes(this.active);
 }
 chip(label,open,unlink){const span=document.createElement('span');span.className='flow-chip';span.append(this.button('flow-open',label,open));const x=this.button('flow-unlink','×',()=>{if(!this.locked())unlink();});x.setAttribute('aria-label','解除与「'+label+'」的关联');x.disabled=this.locked();span.append(x);return span;}
 push(fn){this.undo.push(fn);if(this.undo.length>20)this.undo.shift();}
 notify(){this.update();this.options.changed();this.options.refreshGallery();}
 attach(record){if(this.locked())return;if(!this.active)this.select(this.entries()[0]);if(!this.active){this.options.message('请先新建一段文字，再关联图片');return;}const entry=this.active;if(this.refs(entry).some(r=>r.id===record.id))return;this.id(entry);const token='pl-ref-'+record.id;entry.classList.add(token);this.push(()=>{if(entry.isConnected)entry.classList.remove(token);});this.notify();this.options.message('已关联「'+this.title(entry)+'」，可继续选择图片');}
 unlink(entry,id){if(this.locked())return;const tokens=this.refs(entry).filter(r=>r.id===id).map(r=>r.token);entry.classList.remove(...tokens);this.push(()=>{if(entry.isConnected)entry.classList.add(...tokens);});this.notify();this.options.message('关联已解除，文字和图片保留；保存前可撤销');}
 remove(record){
  if(this.locked())return;const refs=this.entries().map(entry=>({entry,tokens:this.refs(entry).filter(r=>r.id===record.id).map(r=>r.token)}));
  refs.forEach(({entry,tokens})=>entry.classList.remove(...tokens));
  const removed=[],oldName=this.names[record.id];if(record.kind==='pending'){this.excluded.add(record.id);delete this.names[record.id];}else for(const img of this.images())if(img.dataset.attachmentKey===record.id){removed.push({img,parent:img.parentNode,next:img.nextSibling});img.remove();}
  this.push(()=>{this.excluded.delete(record.id);if(oldName!==undefined)this.names[record.id]=oldName;for(const r of removed){if(r.parent.isConnected)r.parent.insertBefore(r.img,r.next?.parentNode===r.parent?r.next:null);else this.store.append(r.img);}refs.forEach(({entry,tokens})=>{if(entry.isConnected)entry.classList.add(...tokens);});});
  this.notify();this.options.message('图片已从草稿移除；保存后生效，保存前可撤销');
 }
 removeEntry(entry){if(this.locked()||entry.parentNode!==this.editor)return;const next=entry.nextSibling,previous=entry.previousSibling,title=this.title(entry);entry.remove();if(this.active===entry)this.active=null;this.push(()=>{if(next?.parentNode===this.editor)this.editor.insertBefore(entry,next);else if(previous?.parentNode===this.editor)previous.after(entry);else this.editor.append(entry);this.active=entry;});this.notify();this.options.message('已删除「'+title+'」；图片保留，保存前可撤销');}
 add(){if(this.locked())return;const div=document.createElement('div');div.className='paperloop-entry';div.innerHTML='<h3>新的笔记</h3><p><br></p>';this.id(div);this.editor.append(div);this.active=div;this.notify();const range=document.createRange();range.selectNodeContents(div.querySelector('h3'));const selection=this.shadow.getSelection?.()||document.getSelection();selection.removeAllRanges();selection.addRange(range);this.editor.focus();div.scrollIntoView({block:'nearest'});}
 reset(){this.store.replaceChildren();this.importColumns();this.extract();this.active=null;this.undo=[];this.linking=false;this.update();}
 dispose(){this.undo=[];}
};

Zotero.PaperLoopThemes={
 palettes:{cowcat:{name:'奶牛猫',light:['#eeeae5','#fcfbf8','#dfeaf0','#29343e','#636d75','#e2e0dc','#415b70','#edf2f5','#ffffff','#aa5638','#f8e9e1'],dark:['#202327','#282d33','#243640','#edf0f2','#b4c0c8','#414a53','#a9c9dd','#334853','#172b38','#f2b394','#4d3730']},shiba:{name:'柴犬',light:['#efe5db','#fcfaf7','#e0e9ec','#39312e','#77665e','#e2d8ce','#95472f','#e8eff0','#ffffff','#526e7d','#f7e8dc'],dark:['#2a2421','#302a27','#273940','#f3ece6','#c5b9b1','#4f443d','#edb294','#34454b','#372217','#a9cbd9','#4b3629']},iris:{name:'鸢尾',light:['#eae6e1','#fcfaf8','#eae5f0','#38333e','#726877','#e2dce5','#69527c','#eee9f2','#ffffff','#866333','#f2e9da'],dark:['#242229','#2e2a33','#393143','#efeaf4','#c2b7c9','#4b4254','#cdb4e1','#41364d','#302039','#dec497','#49402f']},tide:{name:'潮汐',light:['#eae7df','#fafbf9','#dce9ef','#2e414a','#667a83','#d7e0e2','#35596f','#e6eff3','#ffffff','#b05d49','#f6e5de'],dark:['#20272b','#293236','#273e49','#e9f1f5','#b1c2ca','#43545c','#abcddd','#344c58','#192f3c','#efb09c','#503832']}},
 apply(shadow,appearance){const theme=this.palettes[appearance.theme]||this.palettes.cowcat;const dark=appearance.mode==='dark'||appearance.mode!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches;const panel=shadow.querySelector('.panel');['bg','paper','gallery','text','muted','line','accent','soft','on','pop','warm'].forEach((key,i)=>panel.style.setProperty('--'+key,theme[dark?'dark':'light'][i]));panel.style.colorScheme=dark?'dark':'light';panel.dataset.theme=appearance.theme||'cowcat';shadow.querySelector('.theme-toggle').textContent=theme.name+'⌄';const url=browser.runtime.getURL('images/paperloop-themes/'+(this.palettes[appearance.theme]?appearance.theme:'cowcat')+'.jpg');const img=shadow.querySelector('.theme-photo');if(img.getAttribute('src')!==url)img.src=url;}
};
