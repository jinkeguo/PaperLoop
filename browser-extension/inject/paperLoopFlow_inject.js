/* Presentation and reversible note/image associations. Native attachment keys remain authoritative. */
Zotero.PaperLoopFlow = class {
 constructor(shadow, editor, options) {
  this.shadow=shadow;this.editor=editor;this.options=options;this.active=null;this.undo=[];this.excluded=new Set();this.mapping={};this.names={};this.linking=false;
  this.store=document.createElement('div');this.store.className='flow-image-store';this.store.hidden=true;editor.after(this.store);
  const style=document.createElement('style');style.textContent=`
  .panel{--bg:#eeeae5;--paper:#fcfbf8;--gallery:#dfeaf0;--text:#29343e;--muted:#636d75;--line:#e2e0dc;--accent:#415b70;--soft:#edf2f5;--on:#fff;--pop:#aa5638;--warm:#f8e9e1;background:var(--bg);color:var(--text);border-color:var(--line);border-radius:17px}
  :where(.panel) button:hover:not(:disabled){background:var(--soft)}.panel button:focus-visible,.panel input:focus-visible,.panel select:focus-visible,.panel [contenteditable]:focus-visible{outline:2px solid var(--accent);outline-offset:2px}.panel a{color:var(--accent)}
  .bar{background:var(--paper);padding:11px 13px;flex-shrink:0}.brand{font:28px/1.2 'Segoe Print','Bradley Hand',cursive;font-style:italic;color:var(--accent)}.grip,.icon{color:var(--muted)}.theme-toggle{font-size:11px;padding:6px 8px;border:1px solid var(--line);background:var(--paper);white-space:nowrap}
  .context{position:relative;isolation:isolate;overflow:hidden;background:var(--bg);padding:19px 21px;border:0;flex-shrink:0;min-height:117px}.theme-photo{position:absolute;inset:0 0 0 auto;width:62%;height:100%;object-fit:cover;object-position:center 35%;opacity:.38;mask-image:linear-gradient(90deg,transparent,#000 68%);z-index:-1;pointer-events:none}.context .title{font-size:16px;max-width:86%;font-weight:500}.meta,.target{color:var(--muted)}
  .notebook-tabs{display:none}.notebook-flow{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:var(--line) transparent;padding:0 10px 10px}.content{flex:none;overflow:visible;padding:14px;background:var(--paper);border-radius:12px}.label{font-size:13px;letter-spacing:0;font-weight:500;color:var(--text);margin:0}.writing-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px}.flow-link,.flow-add,.flow-undo{font-size:11px;color:var(--pop);padding:5px}.flow-add{color:var(--muted);margin-top:8px}.flow-undo{color:var(--accent)}
  .editor,.panel[data-font=standard] .editor{font:14px/1.85 'Segoe UI','Microsoft YaHei',sans-serif;color:var(--text);min-height:92px}.panel[data-font=hand] .editor{font:17px/1.85 KaiTi,STKaiti,serif}.editor p{margin:0 0 12px}.editor h3{font:500 14px/1.6 'Segoe UI','Microsoft YaHei',sans-serif;margin:0 0 7px}.editor .paperloop-entry{padding:13px 10px 8px 12px;margin:0 0 7px;border-bottom:1px solid var(--line);border-left:2px solid transparent;border-radius:5px}.editor .flow-active{border-left:2px solid var(--pop);background:var(--soft)}
  .editor-stack{display:grid;min-width:0}.editor-stack>.editor,.editor-help{grid-area:1/1;min-width:0}.editor-help{align-self:start;white-space:pre-line;overflow-wrap:anywhere;pointer-events:none;user-select:none;font:13px/1.75 'Segoe UI','Microsoft YaHei',sans-serif;color:var(--muted);padding-bottom:8px}.editor-stack>.editor{display:flow-root}.flow-actions{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:12px;padding-top:8px;border-top:1px solid var(--line);position:relative}.flow-actions button{margin:0;font:11px/1.6 'Segoe UI','Microsoft YaHei',sans-serif;padding:6px 8px}
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
  // Both layers participate in grid sizing: long help text must reserve real
  // height instead of overflowing an absolutely positioned pseudo-element.
  this.editorStack=document.createElement('div');this.editorStack.className='editor-stack';editor.before(this.editorStack);
  this.editorHelp=document.createElement('div');this.editorHelp.className='editor-help';this.editorHelp.contentEditable='false';this.editorHelp.setAttribute('aria-hidden','true');this.editorStack.append(editor,this.editorHelp);
  this.actionBar=document.createElement('div');this.actionBar.className='flow-actions';this.actionBar.setAttribute('role','group');this.actionBar.setAttribute('aria-label','段落操作');this.editorStack.after(this.actionBar);
  this.addButton=this.button('flow-add','＋ 新的一段',()=>this.add());this.actionBar.append(this.addButton);
  this.removeButton=this.button('flow-remove-current','− 删除本段',()=>{if(this.active)this.removeEntry(this.active);});this.actionBar.append(this.removeButton);
  this.undoButton=this.button('flow-undo','撤销',()=>{if(this.locked())return;const fn=this.undo.pop();if(fn){fn();this.notify();}});this.undoButton.hidden=true;shadow.querySelector('.status').after(this.undoButton);
  this.hint=document.createElement('div');this.hint.className='flow-link-hint';this.hint.hidden=true;shadow.querySelector('.media-area').prepend(this.hint);
  editor.addEventListener('click',e=>{if(!e.target.closest('.pl-ui'))this.select(e.target);});
  editor.addEventListener('keyup',()=>{const selection=shadow.getSelection?.()||document.getSelection();if(selection?.anchorNode)this.select(selection.anchorNode);});
  // Paste/IME/accessibility input can commit without a keyup or a prior click.
  editor.addEventListener('input',()=>this.selectCaret());
 }
 locked(){return this.options.locked();}
 editLocked(){return this.options.editLocked?this.options.editLocked():this.locked();}
 selectCaret(){const selection=this.shadow.getSelection?.()||document.getSelection();if(selection?.anchorNode&&this.editor.contains(selection.anchorNode))this.select(selection.anchorNode);}
 images(){return [...this.store.querySelectorAll('img[data-attachment-key]')];}
 generatedImageSource(node){
  if(!node)return false;const links=[...node.querySelectorAll('a')],rest=node.cloneNode(true);rest.querySelectorAll('a,.pl-ui').forEach(a=>a.remove());
  return links.length>0&&links.length<=2&&links.every(a=>['↗ 图片来源','原图链接'].includes(a.textContent.trim())&&/^https?:\/\//i.test(a.getAttribute('href')||''))&&!rest.textContent.replace(/[\s·]/g,'')&&!rest.querySelector('img,table,[data-citation],[data-annotation]');
 }
 cleanImageMetadata(){
  // Native Zotero may strip custom classes. Identify only the exact generated
  // caption directly after its embedded image, never arbitrary measurements.
  for(const img of this.editor.querySelectorAll('img[data-attachment-key]')){
   const block=img.parentElement?.matches('p')?img.parentElement:img,caption=block.nextElementSibling;
   if(!caption?.matches('p')||caption.querySelector('img,a,table,[data-citation],[data-annotation]'))continue;
   const match=/^([\s\S]*) · (\d{1,5}) × (\d{1,5})$/.exec(caption.textContent.trim());
   if(!match||!(match[1]===(img.getAttribute('alt')||'')||match[1]==='图片'&&img.alt==='文献图片'))continue;
   const source=caption.nextElementSibling;
   if(source?.matches('p')&&this.generatedImageSource(source))source.remove();
   caption.remove();
  }
 }
 extract(){this.cleanImageMetadata();for(const img of this.editor.querySelectorAll('img[data-attachment-key]')){const parent=img.parentElement;if(this.images().some(old=>old.dataset.attachmentKey===img.dataset.attachmentKey))img.remove();else this.store.append(img);if(parent!==this.editor&&parent.tagName==='P'&&!parent.textContent.trim()&&!parent.childElementCount)parent.remove();}this.ensureEditable();}
 ensureEditable(){
  for(const p of this.editor.querySelectorAll('p'))if(!p.firstChild)p.append(document.createElement('br'));
  const ignored='.pl-ui,.paperloop-image-source,.paperloop-image-caption,.paperloop-gallery-title,.paperloop-figure-title,.paperloop-ref-summary,img';
  const visible=[...this.editor.childNodes].filter(n=>n.nodeType===3?n.textContent.trim():n.nodeType===1&&!n.matches(ignored));
  if(!visible.length){const p=document.createElement('p');p.append(document.createElement('br'));this.editor.append(p);}
  for(const entry of this.editor.querySelectorAll('.paperloop-entry'))if(![...entry.childNodes].some(n=>n.nodeType===3?n.textContent.trim():n.nodeType===1&&!n.matches(ignored))){const p=document.createElement('p');p.append(document.createElement('br'));entry.prepend(p);}
 }
 importColumns(){
  // Zotero's native editor removes arbitrary classes/div wrappers. Recognize
  // our visible table header too, and reconstruct links from each right cell.
  const tables=[...this.editor.children].filter(node=>node.tagName==='TABLE'&&(node.classList.contains('paperloop-columns')||(node.rows[0]?.cells.length===2&&node.rows[0].cells[0].textContent.trim()==='PaperLoop · 笔记'&&node.rows[0].cells[1].textContent.trim()==='关联图片')));
  if(!tables.length)return;
  // Repair old exports where these two generated paragraphs had already become
  // separate empty-right-column rows. Require the exact pair and a real image name.
  const imageNames=new Set([...this.editor.querySelectorAll('img[data-attachment-key]')].map(img=>img.alt));if(imageNames.has('文献图片'))imageNames.add('图片');
  for(const table of tables)for(const row of [...table.rows].slice(1)){
   const next=row.nextElementSibling;if(!row.isConnected||row.cells.length!==2||next?.cells?.length!==2)continue;
   if([...row.cells,...next.cells].some(cell=>cell.colSpan!==1||cell.rowSpan!==1))continue;
   const match=/^([\s\S]*) · (\d{1,5}) × (\d{1,5})$/.exec(row.cells[0].textContent.trim());
   if(!match||!imageNames.has(match[1])||row.cells[0].querySelector('img,a,table,[data-citation],[data-annotation]'))continue;
   if([row.cells[1],next.cells[1]].some(cell=>cell.textContent.trim()||cell.querySelector('img,a,table,hr,[data-citation],[data-annotation]')))continue;
   if(this.generatedImageSource(next.cells[0])){row.remove();next.remove();}
  }
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
  // Keep controls mounted: refreshes must not remove a pressed/focused button
  // between pointerdown and click, or steal the caret on every keystroke.
  this.editor.querySelectorAll('.flow-active').forEach(n=>n.classList.remove('flow-active'));
  if(this.active)this.active.classList.add('flow-active');
  const gallery=this.options.gallery();const items=gallery?.items||[];
  for(const entry of this.entries()){
   if(entry.matches('div,p,h2,h3,h4,h5,h6,blockquote')){
    entry.classList.add('flow-deletable');let tools=entry.querySelector(':scope > .flow-entry-tools');
    if(!tools){tools=document.createElement('span');tools.className='pl-ui flow-entry-tools';tools.contentEditable='false';const remove=this.button('flow-entry-delete','−',()=>this.removeEntry(entry));remove.title='删除本段，保留图片；保存前可撤销';tools.append(remove);entry.append(tools);}
    const remove=tools.querySelector('button');remove.setAttribute('aria-label','删除段落：'+this.title(entry));remove.disabled=this.editLocked();
   }
   const refs=this.refs(entry).filter((r,i,a)=>a.findIndex(x=>x.id===r.id)===i);let row=entry.querySelector(':scope > .flow-refs');
   if(!refs.length){row?.remove();continue;}
   if(!row){row=document.createElement('span');row.className='pl-ui flow-refs';row.contentEditable='false';entry.append(row);}
   const signature=JSON.stringify(refs.map(r=>[r.id,items.findIndex(p=>p.id===r.id),items.find(p=>p.id===r.id)?.key]));
   if(row.flowSignature!==signature){row.replaceChildren();row.flowSignature=signature;for(const r of refs){const record=items.find(p=>p.id===r.id);const label=record?'图 '+(items.indexOf(record)+1):'待保存图片';row.append(this.chip(label,()=>record&&gallery.open(record.key,this.title(entry)),()=>this.unlink(entry,r.id)));}}
   row.querySelectorAll('.flow-unlink').forEach(b=>b.disabled=this.locked());
  }
  this.linkButton.textContent=this.linking?'完成关联':'关联图片';this.linkButton.setAttribute('aria-pressed',String(this.linking));this.hint.hidden=!this.linking;this.hint.textContent='为「'+(this.active?this.title(this.active):'请先选择一段文字')+'」选择图片，可连续选择';this.undoButton.hidden=!this.undo.length;
  for(const button of [this.linkButton,this.undoButton])button.disabled=this.locked();this.addButton.disabled=this.editLocked();this.removeButton.disabled=this.editLocked()||!this.active||!this.entries().includes(this.active);
  this.removeButton.title=this.active?'删除当前段落，保留图片；保存前可撤销':'先点击要删除的段落';
  // CSS :only-child ignores text nodes, so it can show an empty hint even
  // after Chromium inserts text before the sole paragraph. Inspect content.
  const content=this.editor.cloneNode(true);content.querySelectorAll('.pl-ui,.paperloop-image-source,.paperloop-image-caption,.paperloop-gallery-title,.paperloop-figure-title,.paperloop-ref-summary').forEach(n=>n.remove());
  this.editor.dataset.empty=String(!content.textContent.trim()&&!content.querySelector('.paperloop-entry,img,a,table,hr,[data-citation],[data-annotation]'));
  this.syncHelp();
 }
 syncHelp(){
  if(!this.editorHelp)return;const text=this.editor.dataset.placeholder||'';
  // First line is the writing prompt; the rest are tips. Rebuild only when the
  // language changes so layout checks measure a stable, non-editable layer.
  if(this.helpSource!==text){
   this.helpSource=text;const [lead='',...tips]=text.split('\n');const p=document.createElement('p');p.className='help-lead';p.textContent=lead;
   const list=document.createElement('ul');list.className='help-tips';
   for(const tip of tips){
    const li=document.createElement('li'),label=/^([^：:]{1,16})([：:]\s*)([\s\S]*)$/.exec(tip);let rest=tip;
    if(label){const b=document.createElement('b');b.textContent=label[1];li.append(b,label[2]);rest=label[3];}
    for(const part of rest.split(/((?:Win|Ctrl|Shift|Alt|Cmd)(?: \+ (?:Win|Ctrl|Shift|Alt|Cmd|[A-Z]))+)/)){
     if(!/^(?:Win|Ctrl|Shift|Alt|Cmd) \+ /.test(part)){if(part)li.append(part);continue;}
     part.split(' + ').forEach((key,i)=>{if(i)li.append(' + ');const kbd=document.createElement('kbd');kbd.textContent=key;li.append(kbd);});
    }
    list.append(li);
   }
   this.editorHelp.replaceChildren(p,...(tips.length?[list]:[]));
  }
  this.editorHelp.hidden=this.editor.dataset.empty!=='true';
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
 removeEntry(entry){if(this.editLocked()||entry.parentNode!==this.editor)return;const next=entry.nextSibling,previous=entry.previousSibling,title=this.title(entry);entry.remove();if(this.active===entry)this.active=null;this.push(()=>{if(next?.parentNode===this.editor)this.editor.insertBefore(entry,next);else if(previous?.parentNode===this.editor)previous.after(entry);else this.editor.append(entry);this.active=entry;});this.notify();this.options.message('已删除「'+title+'」；图片保留，保存前可撤销');}
 add(){if(this.editLocked())return;const div=document.createElement('div');div.className='paperloop-entry';div.innerHTML='<p><br></p>';this.id(div);this.editor.append(div);this.active=div;this.notify();this.editor.focus();const range=document.createRange();range.selectNodeContents(div.querySelector('p'));range.collapse(true);const selection=this.shadow.getSelection?.()||document.getSelection();selection.removeAllRanges();selection.addRange(range);div.scrollIntoView({block:'nearest'});}
 reset(){this.store.replaceChildren();this.cleanImageMetadata();this.importColumns();this.extract();this.active=null;this.undo=[];this.linking=false;this.update();}
 dispose(){this.undo=[];}
};

// Seven themes, each with its own hand-drawn illustration (ink line + wash) or a
// watercolor square-collage version of it, chosen per viewer in the settings.
Zotero.PaperLoopThemes={
 // Token order: bg, paper, gallery, text, muted, line, accent, soft, on, pop, warm.
 palettes:{
  cowcat:{name:'奶牛猫',light:['#f6f5f3','#fffefb','#fbefef','#1f2226','#6d6f73','#e4e0da','#2a2c30','#fbefef','#ffffff','#b8565a','#fde9e9'],dark:['#1d1f22','#26292d','#2f2a2c','#eeeeee','#b3b5b8','#3e4146','#f0a3a5','#3a2e30','#1d1f22','#f0a3a5','#3f2f31']},
  shiba:{name:'柴犬',light:['#fbf3e8','#fffdf9','#fcf0e4','#3a2a1f','#8a7263','#eeddc9','#df8a45','#fcf0e4','#ffffff','#c8452f','#fde3d3'],dark:['#2a2421','#302a27','#3a2e25','#f3ece6','#c5b9b1','#4f443d','#edb294','#3f3129','#372217','#f0a58a','#4b3629']},
  iris:{name:'鸢尾',light:['#f3f1f8','#fdfcff','#f0ecf8','#2c2340','#6f6782','#e2ddec','#6247b3','#f2eefa','#ffffff','#6247b3','#efe9fa'],dark:['#242229','#2e2a33','#393143','#efeaf4','#c2b7c9','#4b4254','#cdb4e1','#41364d','#302039','#dec497','#49402f']},
  tide:{name:'潮汐',light:['#f2f6fa','#fcfdff','#e8f0f8','#17324f','#5f7288','#d9e4ef','#2e67a3','#eef4fa','#ffffff','#c0714a','#fbeee3'],dark:['#20272b','#293236','#273e49','#e9f1f5','#b1c2ca','#43545c','#abcddd','#344c58','#192f3c','#efb09c','#503832']},
  paper:{name:'暖纸',light:['#f6f2ea','#fffdf8','#f8eee3','#302e2b','#746f66','#e4dccf','#c8623f','#f8eee3','#ffffff','#b0703f','#f5e3d6'],dark:['#25231f','#302d28','#353129','#eeebe4','#bdb6aa','#514a40','#e4a080','#44372e','#2a211b','#e4a080','#4b362b']},
  sage:{name:'雾松',light:['#f2f4ef','#fbfcf8','#eef2ea','#2c3629','#697463','#d9dfd2','#4d6a45','#eef2ea','#ffffff','#9e6847','#f1e6d8'],dark:['#212820','#2b3229','#303c2e','#e9eee2','#b2c0a9','#465340','#b5cba4','#374631','#22301f','#d7b18b','#443b2c']},
  ink:{name:'墨蓝',light:['#f1f3f5','#fcfdfd','#edf1f6','#1f2d40','#6b747f','#d6dce3','#2c3f58','#edf1f6','#ffffff','#b86b4b','#f2e4db'],dark:['#21262c','#2a3038','#2d3945','#edf0f4','#b6c0cc','#45515e','#aec6df','#354559','#202d3b','#e0af90','#473a31']}
 },
 // Theme ids saved by 0.3.29–0.3.32 before the paper themes were renamed.
 legacy:{claude:'paper','claude-sage':'sage','claude-ink':'ink'},
 arts:['ink','watercolor'],
 resolve(id){id=this.legacy[id]||id;return this.palettes[id]?id:'cowcat';},
 colors(id,dark){const keys=['bg','paper','gallery','text','muted','line','accent','soft','on','pop','warm'],values=this.palettes[this.resolve(id)][dark?'dark':'light'];return Object.fromEntries(keys.map((key,i)=>[key,values[i]]));},
 illustration(id,art){return 'images/paperloop-themes/'+(art==='watercolor'?'watercolor/'+id+'.png':'illustrations/'+id+'.svg');},
 apply(shadow,appearance){
  const id=this.resolve(appearance.theme),theme=this.palettes[id],art=this.arts.includes(appearance.art)?appearance.art:'ink';
  const dark=appearance.mode==='dark'||appearance.mode!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches;
  const panel=shadow.querySelector('.panel'),colors=this.colors(id,dark),motif=this.motifs[id];
  const tokens={...colors,ink:dark?colors.muted:motif.ink,edge:dark?'#00000070':motif.edge,mark:motif.mark,trail:motif.trail,ear:this.ears[motif.ear],'ear-color':motif.earColor||colors.accent};
  // The minimized ribbon sits outside .panel, so it needs the same tokens.
  for(const node of [panel,shadow.querySelector('.mini')])if(node)for(const [key,value] of Object.entries(tokens))node.style.setProperty('--'+key,value);
  panel.style.colorScheme=dark?'dark':'light';Object.assign(panel.dataset,{theme:id,art,ear:motif.ear,dark:String(dark)});shadow.querySelector('.theme-toggle').textContent=theme.name+'⌄';
  const img=shadow.querySelector('.theme-photo');img.hidden=false;
  const url=browser.runtime.getURL(this.illustration(id,art));if(img.getAttribute('src')!==url)img.src=url;
 }
};
{
 const T=Zotero.PaperLoopThemes;
 const url=(body,vb='0 0 24 24')=>`url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='${vb}'>${body}</svg>`)}")`;
 const stroke=(body,vb)=>url(`<g fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'>${body}</g>`,vb);
 const PAW="<ellipse cx='12' cy='16' rx='5.5' ry='4.6'/><ellipse cx='5.2' cy='10.2' rx='2.1' ry='2.7'/><ellipse cx='9.5' cy='6.4' rx='2.1' ry='2.8'/><ellipse cx='14.5' cy='6.4' rx='2.1' ry='2.8'/><ellipse cx='18.8' cy='10.2' rx='2.1' ry='2.7'/>";
 const icons={
  paw:url(PAW),
  flower:url("<ellipse cx='12' cy='7' rx='3.6' ry='6'/><ellipse cx='12' cy='7' rx='3.6' ry='6' transform='rotate(120 12 12.5)'/><ellipse cx='12' cy='7' rx='3.6' ry='6' transform='rotate(240 12 12.5)'/>"),
  boat:url("<path d='M3 15h18l-4 5H7z'/><path d='M12 15V3l7 11z'/><path d='M11 15V6l-6 8z'/>"),
  cup:url("<path d='M4 9h13v3a6.5 6.5 0 0 1-13 0z'/><path d='M17 10.5h1.5a2.5 2.5 0 0 1 0 5H16' fill='none' stroke='black' stroke-width='2'/><path d='M8 2c-1 2 1 3 0 5M12 2c-1 2 1 3 0 5' fill='none' stroke='black' stroke-width='1.6'/>"),
  pine:stroke("<path d='M12 22V9'/><path d='M12 9L5 3M12 9l7-6M12 13L4 8M12 13l8-5M12 17L5 13M12 17l7-4'/>"),
  moon:url("<path d='M15 3a9 9 0 1 0 6 13A7.5 7.5 0 1 1 15 3z'/>")
 };
 const trails={
  paws:url(`<g transform='translate(4 0) scale(.42)'>${PAW}</g>`,'0 0 30 10'),
  leaves:url("<path d='M2 6 C8 1 14 1 18 6 C14 10 8 10 2 6Z'/>",'0 0 26 12'),
  waves:stroke("<path d='M0 6q7.5-5 15 0t15 0'/>",'0 0 30 10'),
  beads:url("<circle cx='5' cy='5' r='1.6'/><circle cx='13' cy='5' r='1'/>",'0 0 16 10'),
  needles:url("<path d='M1 6h24M6 6l-3-4M12 6l-3-4M18 6l-3-4M24 6l-3-4' stroke='black' stroke-width='1.2' fill='none'/>",'0 0 26 10'),
  stars:url("<circle cx='4' cy='5' r='1.3'/><path d='M14 2v6M11 5h6' stroke='black' stroke-width='1.2'/>",'0 0 22 10')
 };
 // Small "ears" that grow from the top of the save button.
 T.ears={
  cat:url("<path d='M0 10L7 0l7 10z'/>",'0 0 14 10'),
  dog:url("<path d='M0 10Q1 0 7 0q6 0 7 10z'/>",'0 0 14 10'),
  leaf:url("<path d='M1 10C3 3 10 0 15 1C14 7 8 11 1 10Z'/>",'0 0 16 11'),
  wave:url("<path d='M0 8Q4.5 0 9 8z'/>",'0 0 9 8'),
  steam:stroke("<path d='M4 10c-2-3 2-4 0-8M11 10c-2-3 2-4 0-8M18 10c-2-3 2-4 0-8'/>",'0 0 22 10'),
  moon:url("<path d='M15 3a9 9 0 1 0 6 13A7.5 7.5 0 1 1 15 3z'/>")
 };
 T.motifs={
  cowcat:{ink:'#2a2c30',edge:'#0f1012',mark:icons.paw,trail:trails.paws,ear:'cat'},
  shiba:{ink:'#4a3222',edge:'#b8672a',mark:icons.paw,trail:trails.paws,ear:'dog'},
  iris:{ink:'#3a2a66',edge:'#46308a',mark:icons.flower,trail:trails.leaves,ear:'leaf',earColor:'#79a84a'},
  tide:{ink:'#1c3a5e',edge:'#1c4a7c',mark:icons.boat,trail:trails.waves,ear:'wave'},
  paper:{ink:'#4a3526',edge:'#9a4529',mark:icons.cup,trail:trails.beads,ear:'steam'},
  sage:{ink:'#2f3f2c',edge:'#34502e',mark:icons.pine,trail:trails.needles,ear:'leaf',earColor:'#79a84a'},
  ink:{ink:'#1f2d40',edge:'#1a2a3d',mark:icons.moon,trail:trails.stars,ear:'moon',earColor:'#d9b24c'}
 };
 const glyph=(u,size=14)=>`content:'';display:inline-block;width:${size}px;height:${size}px;flex-shrink:0;background:currentColor;-webkit-mask:${u} center/contain no-repeat;mask:${u} center/contain no-repeat`;
 const mark=size=>`content:'';display:inline-block;width:${size}px;height:${size}px;flex-shrink:0;background:currentColor;-webkit-mask:var(--mark) center/contain no-repeat;mask:var(--mark) center/contain no-repeat`;
 const folder=stroke("<path d='M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2h9A1.5 1.5 0 0 1 21 9.5v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z'/>"),
  history=stroke("<path d='M4 12a8 8 0 1 0 2.4-5.7'/><path d='M4 4v4h4'/><path d='M12 8v4l3 2'/>"),fit=stroke("<path d='M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5'/>");
 const grain=url("<filter id='g'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 .3  0 0 0 0 .28  0 0 0 0 .25  0 0 0 .05 0'/></filter><rect width='100%' height='100%' filter='url(#g)'/>",'0 0 160 160');
 // Design layer, appended after the structural styles. Surfaces are outlined in
 // each theme's own ink (hand-drawn look); buttons are layered paper cut-outs.
 T.css=`
 .panel{--sans:'Segoe UI','Microsoft YaHei',sans-serif;--serif:Georgia,'Noto Serif SC','Source Han Serif SC','Songti SC',SimSun,serif;--mono:'Cascadia Mono',Consolas,'SF Mono',ui-monospace,monospace;--hand:'Segoe Print','Bradley Hand',KaiTi,STKaiti,cursive;--danger:#b43c4c;--gutter:28px;border-radius:18px;background-image:${grain};box-shadow:0 22px 46px -18px #1a1d2250,0 4px 12px -4px #1a1d221c}
 .panel[data-dark=true]{background-image:none}
 .bar{gap:5px;padding:9px 9px 9px 12px;border-bottom:1px solid var(--line)}
 .grip{display:inline-flex;align-items:center;justify-content:center;width:24px;height:26px;padding:0;color:var(--accent);cursor:grab}.grip::before{${mark(17)}}
 .brand{font-size:24px;line-height:1.15;letter-spacing:-.4px;white-space:nowrap;color:var(--text)}.brand b{font-weight:inherit;color:var(--pop)}
 .theme-toggle{display:inline-flex;align-items:center;gap:5px;border-radius:999px;padding:5px 10px;color:var(--text);border:1.2px solid var(--ink)}.theme-toggle::before{${mark(12)};color:var(--accent)}
 .icon{border-radius:8px}.icon:hover{color:var(--text)}
 .context{padding:16px 16px 14px;min-height:134px;background:transparent}
 .theme-photo{position:absolute;inset:auto -2px 0 auto;width:58%;height:100%;object-fit:contain;object-position:right bottom;opacity:1;z-index:-1;pointer-events:none;-webkit-mask-image:linear-gradient(90deg,transparent,#000 24%),linear-gradient(180deg,transparent,#000 22%);-webkit-mask-composite:source-in;mask-image:linear-gradient(90deg,transparent,#000 24%),linear-gradient(180deg,transparent,#000 22%);mask-composite:intersect}
 .panel[data-art=watercolor] .context::before{content:'';position:absolute;inset:0 0 0 auto;width:66%;z-index:-2;pointer-events:none;background:radial-gradient(ellipse at 76% 64%,color-mix(in srgb,var(--pop) 22%,transparent),transparent 67%),radial-gradient(ellipse at 58% 42%,color-mix(in srgb,var(--accent) 12%,transparent),transparent 66%)}
 .panel[data-art=watercolor] .theme-photo{mix-blend-mode:normal}
 .panel[data-art=watercolor][data-dark=true] .context::before{opacity:.72}
 .panel[data-dark=true] .theme-photo{mix-blend-mode:normal;opacity:.92}
 .meta{display:none}
 .context .title{font:500 15.5px/1.5 var(--serif);letter-spacing:-.01em;max-width:44%;margin:0 0 10px;color:var(--text)}
 .target{display:inline-flex;align-items:center;gap:6px;max-width:48%;margin:0 0 0 -2px;padding:3px 10px 3px 8px;border:1.2px solid var(--ink);border-radius:999px;background:var(--paper);font-size:11px;color:var(--muted)}
 .target span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.target::before{${glyph(folder,13)}}.target::after{content:'›';font-size:13px;line-height:1}.target:hover{color:var(--text);background:var(--paper)}
 .panel-tools{align-items:center;padding:9px 12px;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
 .panel-tools>div:first-child{gap:0;border:1.2px solid var(--ink);border-radius:10px;background:var(--paper);overflow:hidden}
 .panel-tools>div:first-child button{border:0;border-radius:0;min-width:30px;height:28px;padding:0 9px;background:none;box-shadow:none}.panel-tools>div:first-child button+button{border-left:1px solid var(--line)}
 .panel-size{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}
 .panel-fit{display:inline-flex;align-items:center;gap:5px}.panel-fit::before{${glyph(fit,12)}}
 .panel-tools .image-import,.panel-tools .backup-open{display:inline-flex;align-items:center;gap:6px;height:31px;border-radius:12px;padding:0 13px;border:0;background:var(--paper);box-shadow:0 2px 0 var(--line),0 0 0 1px var(--line)}.backup-open::before{${glyph(history,13)}}
 .panel-tools .image-import{background:var(--accent);color:var(--on);font-weight:600;box-shadow:0 3px 0 var(--edge)}.image-import::before{${mark(13)}}
 .panel .image-import:hover,.panel .image-import:active,.panel .save:hover,.panel .save:active{background:var(--accent);color:var(--on)}
 .panel-tools button:hover:not(:disabled){filter:brightness(1.06)}.panel-tools .image-import:active:not(:disabled),.save:active:not(:disabled){transform:translateY(2px);box-shadow:0 1px 0 var(--edge)}
 .notebook-flow{padding:10px}
 .content{border:1.4px solid var(--ink);border-radius:16px;padding:13px 13px 11px}
 .label{display:inline-flex;align-items:center;gap:7px;font:600 12px/1 var(--sans);letter-spacing:.04em;color:var(--muted)}
 .flow-link{border-radius:999px;padding:4px 10px;color:var(--pop)}.flow-link[aria-pressed=true]{background:var(--warm)}
 .editor-stack{position:relative;padding-left:var(--gutter)}
 .editor{counter-reset:pl-entry}.editor>.flow-deletable{counter-increment:pl-entry}
 .editor>.flow-deletable::before{content:counter(pl-entry,decimal-leading-zero);position:absolute;left:calc(-1 * var(--gutter));top:.5em;width:calc(var(--gutter) - 10px);text-align:right;font:500 10px/1.4 var(--mono);color:var(--muted);opacity:.7;pointer-events:none;user-select:none}
 .editor>.paperloop-entry.flow-deletable::before{top:15px}
 .editor>.flow-active::before{content:'';width:17px;height:17px;left:calc(-1 * var(--gutter) + 2px);top:.35em;opacity:1;background:var(--accent);-webkit-mask:var(--mark) center/contain no-repeat;mask:var(--mark) center/contain no-repeat}
 .editor>.paperloop-entry.flow-active::before{top:13px}
 .editor .paperloop-entry{border-bottom:0;border-radius:12px}.editor .flow-active{border-left-color:transparent;background:linear-gradient(90deg,var(--soft),transparent 85%)}
 .editor>.flow-deletable::after{content:'';position:absolute;left:12px;right:28px;bottom:-1px;height:9px;background:var(--muted);opacity:.3;-webkit-mask:var(--trail) left center/auto 9px repeat-x;mask:var(--trail) left center/auto 9px repeat-x;pointer-events:none}
 .editor>.flow-deletable:last-child::after{display:none}
 .editor-help{white-space:normal;font:13px/1.7 var(--sans);padding:0 0 10px}
 .help-lead{margin:0 0 10px;font:italic 16px/1.6 var(--serif);color:var(--muted)}.panel[data-font=hand] .help-lead{font:19px/1.6 KaiTi,STKaiti,serif}
 .help-tips{list-style:none;margin:0;padding:10px 0 0;border-top:1px dashed var(--line);display:grid;gap:4px;font-size:12px;color:var(--muted)}
 .help-tips li{position:relative;padding-left:16px}.help-tips li::before{content:'';position:absolute;left:0;top:.45em;width:11px;height:11px;background:var(--accent);opacity:.55;-webkit-mask:var(--mark) center/contain no-repeat;mask:var(--mark) center/contain no-repeat}
 .help-tips b{font-weight:600;color:var(--text)}
 .editor-help kbd{display:inline-block;font:600 10px/1 var(--mono);padding:3px 5px 2px;margin:0 1px;border:1px solid var(--line);border-bottom-width:2px;border-radius:4px;background:var(--paper);color:var(--text)}
 .flow-actions{margin-left:var(--gutter);border-top:1px dashed var(--line);gap:8px}
 .flow-actions button{border-radius:12px;padding:5px 12px}.flow-add{margin:0;color:var(--text);background:var(--paper);box-shadow:0 2px 0 var(--line),0 0 0 1px var(--line)}
 .flow-refs .flow-chip{background:var(--paper);border:1.2px solid var(--ink);border-radius:999px;color:var(--ink)}.flow-refs .flow-open{display:inline-flex;align-items:center;gap:4px;padding-left:8px}.flow-refs .flow-open::before{${mark(11)}}
 .flow-chip .flow-unlink:hover,.flow-entry-delete:hover,.flow-remove-current:hover,.media-delete:hover{color:var(--danger)}
 .media-area{border:1.4px solid var(--ink);border-radius:16px;padding:13px 11px}
 .media-top h3{font:500 15px/1.3 var(--serif);color:var(--text)}.media-top p{margin-top:3px}
 .media-section{font:600 10px/1.4 var(--mono);letter-spacing:.1em;text-transform:uppercase;margin:4px 0 12px}
 .media-grid{gap:12px 10px}
 .media-card,.media-card[data-selected=true]{overflow:hidden;border:1.3px solid var(--ink);border-radius:11px;padding:5px 5px 2px;background:var(--paper);box-shadow:2px 2px 0 var(--ink)}
 .media-card[data-kind=pending]{border-style:dashed}
 .media-preview,.media-preview:hover{height:100px;padding:6px;border-radius:7px}
 .media-number{top:9px;left:9px;padding:1px 4px;border:0;border-radius:5px;font:600 9.5px/1.3 var(--mono);color:var(--on);background:var(--accent)}
 .media-delete{top:6px;right:6px;width:24px;height:24px;font-size:15px}
 .media-name-row{margin:6px 2px 0 3px}.media-caption{font:13px/1.45 var(--hand);color:var(--text)}
 .media-detail{padding:0 3px 6px}.media-links{padding:0 2px}
 .media-empty svg{width:76px;height:64px;stroke:var(--accent);opacity:.8}.media-empty svg .front{fill:var(--paper)}.media-empty svg .clip{stroke:var(--pop)}
 .media-empty-title{display:block;font:italic 15px/1.5 var(--serif);color:var(--text)}
 .status{padding:6px 18px 0}.status:empty,.status[data-echo=true]{display:none}
 .status:before{content:'';display:inline-block;width:5px;height:5px;margin:0 7px 1px 0;border-radius:50%;background:currentColor;vertical-align:middle}.status[data-kind=error]{color:var(--danger)}
 .footer{gap:10px;padding:14px 12px 12px 18px;border-top:1px solid var(--line)}
 .draft{display:flex;align-items:center;gap:7px;min-width:0}.draft:empty::before{display:none}.draft::before{${mark(11)};color:var(--muted);opacity:.6}
 .draft[data-state=synced]::before{color:var(--pop);opacity:.9}.draft[data-state=pending]::before{color:var(--accent);opacity:1}.draft[data-state=error]{color:var(--danger)}.draft[data-state=error]::before{color:var(--danger);opacity:1}
 .save,.save:hover{position:relative;overflow:visible;display:inline-flex;align-items:center;gap:7px;padding:10px 20px 10px 16px;border-radius:12px;font-weight:600;background:var(--accent);color:var(--on);box-shadow:0 3px 0 var(--edge)}.save::before{${mark(14)}}.save:hover:not(:disabled){filter:brightness(1.08)}
 .save::after{content:'';position:absolute;left:12px;right:12px;top:-9px;height:10px;background:var(--ear-color);pointer-events:none;-webkit-mask:var(--ear) left bottom/14px 10px no-repeat,var(--ear) right bottom/14px 10px no-repeat;mask:var(--ear) left bottom/14px 10px no-repeat,var(--ear) right bottom/14px 10px no-repeat}
 .panel[data-ear=leaf] .save::after{right:auto;width:16px;height:11px;top:-10px;-webkit-mask:var(--ear) center/contain no-repeat;mask:var(--ear) center/contain no-repeat}
 .panel[data-ear=moon] .save::after{right:auto;width:15px;height:15px;top:-10px;-webkit-mask:var(--ear) center/contain no-repeat;mask:var(--ear) center/contain no-repeat}
 .panel[data-ear=steam] .save::after{left:20px;right:auto;width:26px;height:11px;top:-12px;-webkit-mask:var(--ear) center/contain no-repeat;mask:var(--ear) center/contain no-repeat}
 .panel[data-ear=wave] .save::after{left:8px;right:8px;height:6px;top:-5px;-webkit-mask:var(--ear) left bottom/18px 6px repeat-x;mask:var(--ear) left bottom/18px 6px repeat-x}
 .save:disabled::after{opacity:.5}
 .backups h3{font:500 18px/1.3 var(--serif)}
 .mini{width:34px;height:112px;padding:8px 0 0;border:0;border-radius:0;background:var(--accent);color:var(--on);box-shadow:none;clip-path:polygon(0 0,100% 0,100% 100%,50% 92%,0 100%);display:flex;flex-direction:column;align-items:center;gap:4px;font:11.5px/1 'Segoe Print','Bradley Hand',cursive;writing-mode:horizontal-tb;overflow:hidden}
 .mini-mark{${mark(15)}}.mini span{writing-mode:vertical-rl;letter-spacing:-.2px}
 .panel[data-compact=true]{--gutter:22px}.panel[data-compact=true] .brand{font-size:20px}.panel[data-compact=true] .context .title{font-size:14.5px;max-width:48%}.panel[data-compact=true] .editor>.flow-deletable::before{font-size:9px}
 @media(prefers-reduced-motion:reduce){.save:active:not(:disabled),.panel-tools .image-import:active:not(:disabled){transform:none}}
 `;
}
