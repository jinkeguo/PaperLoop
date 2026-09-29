/* Uses real Edge DOM, media decoding and IndexedDB; native library is a test double. */
fixture.newTests=async()=>{
 const ui=Zotero.PaperLoopSidebar,s=()=>fixture.shadow,a=fixture.assert,start=fixture.tests.length;
 const request=p=>fixture.bridgeAPI.paperLoopNotebook({documentKey:location.href,targetID:'C1',...p});
 const wrap=text=>'<div data-schema-version="9"><h1>PaperLoop 思考</h1><p>'+text+'</p></div>';
 const edit=text=>{s().querySelector('.editor').innerHTML='<p>'+text+'</p>';s().querySelector('.editor').dispatchEvent(new Event('input'));};
 await fixture.test('local screenshot import validates bytes and retains its filename',async()=>{
  const r=await request({action:'import-image',dataURI:fixture.smallURI,name:'自己的截图.png'});fixture.localImageID=r.id;
  const list=await request({action:'pending'});a(list.find(x=>x.id===r.id).caption==='自己的截图','filename missing');a(list.find(x=>x.id===r.id).imageURL==='','data URL leaked into note source');
  let failed=false;try{await request({action:'import-image',dataURI:'data:image/png;base64,'+btoa('<html>fake</html>')});}catch(_){failed=true;}a(failed,'fake image accepted');
 });
 await fixture.test('browser history recovers deleted pending-image bytes and text',async()=>{
  const row=await request({action:'backup',force:true,html:wrap('本机备份甲'),baseHTML:note.getNote()});fixture.backupID=row.id;
  await request({action:'discard-images',ids:[fixture.localImageID]});a(!(await request({action:'pending'})).some(x=>x.id===fixture.localImageID),'discard did not work');
  const restored=await request({action:'restore-backup',id:row.id});a(restored.html.includes('本机备份甲')&&restored.restored.includes(fixture.localImageID),'restore omitted content');
  a((await request({action:'pending'})).some(x=>x.id===fixture.localImageID),'bytes not restored');
 });
 await fixture.test('manual history checkpoint is not overwritten by subsequent auto-backup',async()=>{
  const old=await request({action:'backup',force:true,html:wrap('明确留下的版本')});await request({action:'backup',html:wrap('继续输入')});
  const rows=await request({action:'backups'});a(rows.some(x=>x.id===old.id&&x.preview.includes('明确留下')),'checkpoint coalesced away');a(rows.every(x=>!('fingerprint'in x)&&!('html'in x)),'large private payload returned unnecessarily');
 });
 await fixture.test('history rejects cross-document or cross-target restore',async()=>{
  let failed=false;try{await request({action:'restore-backup',id:fixture.backupID,targetID:'C2'});}catch(_){failed=true;}a(failed,'cross-target restore accepted');
  failed=false;try{await request({action:'restore-backup',id:fixture.backupID,documentKey:location.href+'wrong'});}catch(_){failed=true;}a(failed,'cross-page restore accepted');
 });
 await fixture.test('paste accepts a screenshot and leaves the text editor editable',async()=>{
  const blob=await(await fetch(fixture.dataURI)).blob(),file=new File([blob],'clipboard.png',{type:'image/png'}),dt=new DataTransfer();dt.items.add(file);const editor=s().querySelector('.editor');
  editor.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}));await fixture.until(()=>ui.debugState().pendingCount>=2&& !s().querySelector('.image-import').disabled);
  a(editor.contentEditable==='true','image import locked editor');await ui.save();a(note.getNote().includes('data-attachment-key'),'import did not save natively');
 });
 await fixture.test('browser history works while the native bridge is offline',async()=>{
  fixture.failBridge=true;try{const r=await request({action:'backup',force:true,html:wrap('离线版本')});a((await request({action:'backups'})).some(x=>x.id===r.id),'offline local history failed');}finally{fixture.failBridge=false;}
 });
 await fixture.test('restore UI keeps current version and does not auto-overwrite Zotero on focus',async()=>{
  const old=await request({action:'backup',force:true,html:wrap('准备恢复的旧版本')});edit('恢复前的新版本');await fixture.delay(300);s().querySelector('.backup-open').click();
  await fixture.until(()=>[...s().querySelectorAll('.backup-row')].some(x=>x.textContent.includes('准备恢复的旧版本')));
  [...s().querySelectorAll('.backup-row')].find(x=>x.textContent.includes('准备恢复的旧版本')).querySelector('button').click();
  await fixture.until(()=>ui.debugState().thought.includes('准备恢复的旧版本')&&s().querySelector('.backups').hidden);const before=note.getNote();window.dispatchEvent(new Event('focus'));await fixture.delay(2100);
  a(note.getNote()===before&&ui.debugState().thought.includes('准备恢复的旧版本'),'focus or autosave replaced review');a((await request({action:'backups'})).some(x=>x.preview.includes('恢复前的新版本')),'pre-restore draft not backed up');
  ui.close();await fixture.delay(80);await fixture.uiSetup();await fixture.delay(1900);a(note.getNote()===before&&ui.debugState().thought.includes('准备恢复的旧版本'),'reopen erased review');await ui.save();a(note.getNote().includes('准备恢复的旧版本'),'explicit save did not work');
 });
 await fixture.test('browser-local draft loss reloads the saved native note and images',async()=>{
  await fixture.collect([77,78]);await ui.save();a(!memory['paperloop:notebookDraft:v1:'+location.href].reviewRestore,'saved restore stays paused');const saved=note.getNote();ui.close();await fixture.delay(200);for(const key of Object.keys(memory))delete memory[key];
  await new Promise((resolve,reject)=>{const req=indexedDB.open('paperloop-media-v1',2);req.onerror=()=>reject(req.error);req.onsuccess=()=>{const db=req.result,tx=db.transaction(['pending','history','recoveryMedia'],'readwrite');for(const store of ['pending','history','recoveryMedia'])tx.objectStore(store).clear();tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>{db.close();reject(tx.error);};};});await fixture.uiSetup();
  a(ui.debugState().images>=2&&ui.debugState().thought.includes('准备恢复的旧版本'),'native restore lost text or images');a(note.getNote()===saved,'read recovery wrote a new note');
  s().querySelector('.backup-open').click();await fixture.until(()=>!s().querySelector('.backup-remote').disabled);s().querySelector('.backup-remote').click();await fixture.until(()=>s().querySelector('.backups').hidden);
 });
 await fixture.test('panel size buttons shrink, enlarge and fit without changing note data',async()=>{
  const before=ui.debugState().rectangle,html=ui.debugState().noteHTML;s().querySelector('.panel-smaller').click();const small=ui.debugState().rectangle;a(small.width<before.width&&small.height<before.height,'shrink failed');s().querySelector('.panel-larger').click();a(ui.debugState().rectangle.width>small.width,'enlarge failed');s().querySelector('.panel-fit').click();const fit=ui.debugState().rectangle;a(fit.left>=0&&fit.right<=innerWidth&&fit.bottom<=innerHeight,'fit escapes viewport');a(ui.debugState().noteHTML===html,'resize changed note');ui.debugResetPosition();
 });
 await fixture.test('three paper themes have distinct light/dark tokens and their own illustrations',async()=>{
  const html=ui.debugState().noteHTML,seen=new Set();for(const id of ['paper','sage','ink'])for(const mode of ['light','dark']){const theme=s().querySelector('.theme');theme.value=id;theme.dispatchEvent(new Event('change'));const m=s().querySelector('.mode');m.value=mode;m.dispatchEvent(new Event('change'));const img=s().querySelector('.theme-photo');a(!img.hidden&&img.getAttribute('src').endsWith('/illustrations/'+id+'.svg'),'paper theme illustration missing');await img.decode();a(img.naturalWidth>100,'paper theme illustration did not load');seen.add(getComputedStyle(s().querySelector('.panel')).getPropertyValue('--bg'));}a(seen.size===6,'themes look identical');a(ui.debugState().noteHTML===html,'theme changes content');s().querySelector('.theme').value='cowcat';s().querySelector('.theme').dispatchEvent(new Event('change'));s().querySelector('.mode').value='light';s().querySelector('.mode').dispatchEvent(new Event('change'));
 });
 await fixture.test('watercolor illustration style switches every theme and keeps the note unchanged',async()=>{
  const html=ui.debugState().noteHTML,art=s().querySelector('.art'),theme=s().querySelector('.theme'),img=()=>s().querySelector('.theme-photo');
  for(const style of ['watercolor','ink'])for(const id of ['cowcat','shiba','iris','tide','paper','sage','ink']){
   art.value=style;art.dispatchEvent(new Event('change'));theme.value=id;theme.dispatchEvent(new Event('change'));
   const want=style==='watercolor'?'/watercolor/'+id+'.png':'/illustrations/'+id+'.svg';a(img().getAttribute('src').endsWith(want),'wrong illustration for '+id+' '+style);
   await img().decode();a(img().naturalWidth>100,'illustration did not load: '+want);a(s().querySelector('.panel').dataset.art===style,'panel style flag not set');
  }
  a(ui.debugState().noteHTML===html,'illustration style changed the note');a(ui.debugState().art==='ink','illustration style not kept in appearance');
  theme.value='cowcat';theme.dispatchEvent(new Event('change'));
 });
 await fixture.test('theme ids saved before the paper themes were renamed still resolve',async()=>{
  const themes=Zotero.PaperLoopThemes;a(themes.resolve('claude')==='paper'&&themes.resolve('claude-sage')==='sage'&&themes.resolve('claude-ink')==='ink','legacy theme id lost');a(themes.resolve('missing')==='cowcat'&&themes.resolve('tide')==='tide','theme fallback changed');
  a(![...s().querySelectorAll('.theme option')].some(o=>/claude/i.test(o.value+o.textContent)),'theme menu still shows old naming');
 });
 await fixture.test('backup history is bounded to 20 versions',async()=>{
  for(let i=0;i<23;i++)await request({action:'backup',force:true,html:wrap('版本-'+i)});const list=await request({action:'backups'});a(list.length===20&&list[0].preview.includes('版本-22'),'history retention incorrect');
 });
 return fixture.tests.slice(start);
};
fixture.prepareImageFirst=async()=>{
 Zotero.PaperLoopSidebar.close();await fixture.delay(80);delete memory['paperloop:notebookDraft:v1:'+location.href];note.setNote('<div data-schema-version="9"><h1>PaperLoop 思考</h1><img data-attachment-key="'+attachments[0].key+'"></div>');await fixture.uiSetup();const editor=fixture.shadow.querySelector('.editor'),p=editor.querySelector('p');editor.focus();const range=document.createRange();range.selectNodeContents(p);range.collapse(true);const selection=fixture.shadow.getSelection();selection.removeAllRanges();selection.addRange(range);
};
