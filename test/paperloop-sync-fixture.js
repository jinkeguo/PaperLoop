/* Regressions from real save/reopen reports; never talks to a personal library. */
fixture.syncTests=async()=>{
 const ui=Zotero.PaperLoopSidebar,a=fixture.assert,s=()=>fixture.shadow,results=[];
 const run=async(name,fn)=>{try{await fn();results.push({name,ok:true});}catch(e){results.push({name,ok:false,error:String(e)});}};
 const reset=async()=>{ui.close();await fixture.delay(40);delete memory['paperloop:notebookDraft:v1:'+location.href];fixture.requireTarget=true;await fixture.uiSetup();};
 await run('saved thumbnails load automatically on reopening with a restored draft',async()=>{
  await reset();await ui.save();ui.close();await fixture.delay(40);await fixture.uiSetup();
  await fixture.until(()=>[...s().querySelectorAll('.media-card[data-kind=saved] img')].every(img=>img.complete&&img.naturalWidth>0),2500);
  a(s().querySelectorAll('.media-card[data-kind=saved]').length>0,'fixture has no saved image');
 });
 await run('native markup normalization does not conflict with a browser edit',async()=>{
  await reset();await ui.save();
  s().querySelector('.editor').insertAdjacentHTML('beforeend','<p>浏览器正常新增内容</p>');s().querySelector('.editor').dispatchEvent(new Event('input'));
  const doc=new DOMParser().parseFromString(note.getNote(),'text/html');
  for(const node of doc.querySelectorAll('[class]')){for(const name of [...node.classList])if(/^(paperloop-|pl-)/.test(name))node.classList.remove(name);}
  for(const div of [...doc.querySelectorAll('td>div')])div.replaceWith(...div.childNodes);
  for(const cell of doc.querySelectorAll('td,th')){cell.setAttribute('colspan','1');cell.setAttribute('rowspan','1');}
  note.setNote(doc.body.innerHTML.replace(/>\s*</g,'>\n<'));await ui.debugRefreshZotero();
  a(!ui.debugState().remoteConflict,'format-only native changes falsely block the browser draft');await ui.save();
  a(note.getNote().includes('浏览器正常新增内容'),'browser edit did not reach native note');
 });
 const edit=(from,to)=>{const el=s().querySelector('.editor');el.innerHTML=el.innerHTML.replace(from,to);el.dispatchEvent(new Event('input'));};
 const simple=async()=>{ui.close();await fixture.delay(40);delete memory['paperloop:notebookDraft:v1:'+location.href];note.setNote('<div data-schema-version="9"><h1>PaperLoop 思考</h1><p>甲段原文</p><p>乙段原文</p></div>');await fixture.uiSetup();};
 await run('six saved thumbnails reopen together, even when requests finish out of order',async()=>{
  await simple();await fixture.collect([0,1,2,3,4,5]);await ui.save();
  const original=Zotero.Connector_Browser.paperLoopNotebook;let reads=0;
  Zotero.Connector_Browser.paperLoopNotebook=async p=>{if(p.action==='image'){reads++;await fixture.delay(reads%2?100:20);}return original(p);};
  try{for(let i=0;i<2;i++){ui.close();await fixture.delay(40);await fixture.uiSetup();await fixture.until(()=>s().querySelectorAll('.media-card[data-kind=saved]').length===6&&[...s().querySelectorAll('.media-card[data-kind=saved] img')].every(img=>img.complete&&img.naturalWidth>0));a(s().querySelector('.media-viewer').hidden,'test opened full image');}}
  finally{Zotero.Connector_Browser.paperLoopNotebook=original;}
 });
 await run('transient thumbnail failure retries without opening the viewer',async()=>{
  const original=Zotero.Connector_Browser.paperLoopNotebook;let failures=3;
  Zotero.Connector_Browser.paperLoopNotebook=async p=>{if(p.action==='image'&&failures-->0)throw new Error('图片暂时不可用');return original(p);};
  try{ui.close();await fixture.delay(40);await fixture.uiSetup();await ui.debugRefreshZotero();await fixture.until(()=>[...s().querySelectorAll('.media-card[data-kind=saved] img')].every(img=>img.complete&&img.naturalWidth>0));}
  finally{Zotero.Connector_Browser.paperLoopNotebook=original;}
 });
 await run('browser typing automatically updates the same existing native note',async()=>{
  await simple();const key=note.key;edit('甲段原文','甲段浏览器自动修改');await fixture.until(()=>note.getNote().includes('甲段浏览器自动修改')&&!ui.debugState().saving,5000);a(note.key===key&&!ui.debugState().dirty,'auto-save duplicated or stayed dirty');
 });
 await run('native edits arrive on focus without replacing the note identity',async()=>{
  const key=note.key;note.setNote(note.getNote().replace('乙段原文','乙段Zotero自动修改'));window.dispatchEvent(new Event('focus'));await fixture.until(()=>ui.debugState().thought.includes('乙段Zotero自动修改'));a(note.key===key&&!ui.debugState().remoteConflict,'native edit split the note');
 });
 await run('separate paragraph edits merge in both directions',async()=>{
  await simple();edit('甲段原文','甲段浏览器修改');note.setNote(note.getNote().replace('乙段原文','乙段Zotero修改'));await ui.debugRefreshZotero();a(!ui.debugState().remoteConflict&&ui.debugState().thought.includes('甲段浏览器修改')&&ui.debugState().thought.includes('乙段Zotero修改'),'disjoint merge lost a side');await ui.save();a(note.getNote().includes('甲段浏览器修改')&&note.getNote().includes('乙段Zotero修改'),'merged changes not persisted');
 });
 await run('save rebases a native change that occurred since the last poll',async()=>{
  await simple();edit('甲段原文','甲段本机修改');note.setNote(note.getNote().replace('乙段原文','乙段保存前变化'));await ui.save();a(!ui.debugState().remoteConflict&&note.getNote().includes('甲段本机修改')&&note.getNote().includes('乙段保存前变化'),'pre-save merge failed');
 });
 await run('a write-time 409 automatically retries a non-overlapping change',async()=>{
  await simple();edit('甲段原文','甲段发生竞争');const original=Zotero.Connector_Browser.paperLoopNotebook;let injected=false;
  Zotero.Connector_Browser.paperLoopNotebook=async p=>{if(p.action==='save'&&!injected){injected=true;note.setNote(note.getNote().replace('乙段原文','乙段并发修改'));}return original(p);};
  try{await ui.save();a(injected&&!ui.debugState().remoteConflict&&note.getNote().includes('甲段发生竞争')&&note.getNote().includes('乙段并发修改'),'409 retry lost edit');}finally{Zotero.Connector_Browser.paperLoopNotebook=original;}
 });
 await run('typing during automatic save is kept and subsequently synced',async()=>{
  await simple();edit('甲段原文','甲段第一笔');const original=Zotero.Connector_Browser.paperLoopNotebook;let injected=false;
  Zotero.Connector_Browser.paperLoopNotebook=async p=>{if(p.action==='save'&&!injected){injected=true;a(s().querySelector('.editor').contentEditable==='true','auto save locks typing');edit('甲段第一笔','甲段第一笔和继续输入');await fixture.delay(30);}return original(p);};
  try{await ui.save({automatic:true});a(ui.debugState().thought.includes('甲段第一笔和继续输入'),'in-flight typing lost');await fixture.until(()=>note.getNote().includes('甲段第一笔和继续输入')&&!ui.debugState().saving,5000);}finally{Zotero.Connector_Browser.paperLoopNotebook=original;}
 });
 await run('overlapping text edits preserve both versions and allow keeping the browser',async()=>{
  await simple();edit('甲段原文','甲段浏览器版本');note.setNote(note.getNote().replace('甲段原文','甲段Zotero版本'));await ui.debugRefreshZotero();a(ui.debugState().remoteConflict,'same text silently overwritten');s().querySelector('.local').click();await fixture.until(()=>!ui.debugState().remoteConflict&&!ui.debugState().saving);a(note.getNote().includes('甲段浏览器版本'),'browser choice did not save');const history=memory['paperloop:conflicts:v1:'+location.href];a(history.at(-1).html.includes('甲段浏览器版本')&&history.at(-1).remoteHTML.includes('甲段Zotero版本'),'both versions not backed up');
 });
 await run('offline automatic save keeps edits locally for the next connection',async()=>{
  await simple();fixture.failBridge=true;edit('甲段原文','甲段离线修改');await ui.save({automatic:true});a(ui.debugState().dirty&&memory['paperloop:notebookDraft:v1:'+location.href].html.includes('甲段离线修改'),'offline draft lost');fixture.failBridge=false;await ui.debugRefreshZotero();await fixture.until(()=>note.getNote().includes('甲段离线修改')&&!ui.debugState().saving,5000);
 });
 await run('Chinese IME composition is not auto-saved mid-composition',async()=>{
  await simple();s().querySelector('.editor').dispatchEvent(new Event('compositionstart'));edit('甲段原文','甲段输入中');await fixture.delay(1950);a(!note.getNote().includes('甲段输入中'),'saved partial composition');s().querySelector('.editor').dispatchEvent(new Event('compositionend'));await fixture.until(()=>note.getNote().includes('甲段输入中')&&!ui.debugState().saving,5000);
 });
 await run('first collection remains explicit rather than auto-creating a paper',async()=>{
  await simple();linked=false;await ui.debugRefreshZotero();const before=creations;edit('甲段原文','未收藏页面草稿');await fixture.delay(1950);a(creations===before,'auto-created an uncollected paper');linked=true;
 });
 await run('automatic multi-image save preserves associations and typing in flight',async()=>{
  await simple();await fixture.collect([46,47,48]);s().querySelector('.editor p').click();s().querySelector('.flow-link').click();s().querySelector('.media-card[data-kind=pending] .media-preview').click();s().querySelector('.flow-link').click();
  let changed=false;fixture.beforeImage=async()=>{if(!changed){changed=true;edit('乙段原文','乙段图片上传时输入');}};
  try{await ui.save({automatic:true});await fixture.until(()=>!ui.debugState().saving);a(!ui.debugState().remoteConflict&&note.getNote().includes('乙段图片上传时输入'),'multi-image upload lost in-flight text');a(ui.debugState().images===3&&/pl-ref-IMG\d{5}/.test(note.getNote()),'multi-image automatic save lost association');}
  finally{fixture.beforeImage=null;}
 });
 await run('merge preserves deletion, independent insertion, image rename, and rich text',async()=>{
  const sync=Zotero.PaperLoopSync,wrap=value=>'<div data-schema-version="9"><h1>PaperLoop 思考</h1>'+value+'</div>';
  const base=wrap('<p>甲</p><p>乙</p><p>丙</p>'),local=wrap('<p>甲</p><p>丙</p>'),remote=wrap('<p>甲</p><p>乙</p><p>丙</p><p><strong>新增</strong></p>');const m=sync.merge(base,local,remote);a(m.ok&&!m.html.includes('>乙<')&&m.html.includes('<strong>新增</strong>'),'independent delete/insert was lost');
  const photo='<p><img data-attachment-key="IMAGE001" alt="原图名" width="300" height="200"></p>',b=wrap('<p>文字</p>'+photo),l=wrap('<p>文字</p>'+photo.replace('原图名','新图名')),r=wrap('<p><em>新文字</em></p>'+photo),image=sync.merge(b,l,r);a(image.ok&&image.html.includes('新图名')&&image.html.includes('<em>新文字</em>')&&image.html.includes('width="300"'),'image rename or native geometry lost');
 });
 await run('overlapping deletion and editing or image renames require a choice',async()=>{
  const sync=Zotero.PaperLoopSync,base='<p>甲</p><p>乙</p>';a(!sync.merge(base,'<p>乙</p>','<p>甲的修改</p><p>乙</p>').ok,'delete/edit silently resolved');
  const image='<p><img data-attachment-key="IMAGE001" alt="原名"></p>';a(!sync.merge(image,image.replace('原名','浏览器名字'),image.replace('原名','Zotero名字')).ok,'different names silently overwritten');
 });
 return results;
};
