/* Save reliability tests in an isolated browser, not a personal library. */
fixture.saveReliabilityTests=async()=>{
 const ui=Zotero.PaperLoopSidebar,a=fixture.assert,tests=[],originalURL=location.href,originalTab={...fixture.tab},originalMemory=structuredClone(memory),originalHTML=note.getNote(),originalAttachments=[...attachments],originalNotebook=Zotero.Connector_Browser.paperLoopNotebook;
 const wait=async fn=>{for(let i=0;i<100;i++){if(await fn())return;await fixture.delay(30);}throw new Error('save reliability condition timed out');};
 const db=()=>new Promise((resolve,reject)=>{const r=indexedDB.open('paperloop-media-v1',2);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
 const records=async name=>{const d=await db();try{return await new Promise((resolve,reject)=>{const r=d.transaction(name).objectStore(name).getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}finally{d.close();}};
 const call=payload=>originalNotebook({targetID:'C1',documentKey:location.href,...payload});
 const route=path=>{history.replaceState(null,'',path);fixture.tab.url=location.href;};
 let index=0;
 async function reset(){ui.close();await fixture.delay(250);Zotero.Connector_Browser.paperLoopNotebook=originalNotebook;route('/reliability-'+(++index));linked=false;attachments=[];note.setNote('<div data-schema-version="9"><h1>PaperLoop 思考</h1><p></p></div>');for(const k of Object.keys(memory))if(k.startsWith('paperloop:')&&!k.includes('appearance'))delete memory[k];const d=await db();try{await new Promise((resolve,reject)=>{const tx=d.transaction(['pending','history','recoveryMedia'],'readwrite');for(const n of ['pending','history','recoveryMedia'])tx.objectStore(n).clear();tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}finally{d.close();}}
 try{
  await reset();const from=location.href;const image=await call({action:'import-image',dataURI:fixture.dataURI,name:'route-image.png'});await fixture.uiSetup();ui.debugSetThought('带着图片继续保存');await wait(()=>memory['paperloop:notebookDraft:v1:'+from]?.html.includes('带着图片'));
  memory['paperloop:notebookDraft:v2:2:'+from]={html:'<p>第二文库草稿</p>',libraryID:2,targetID:'C2',dirty:true};memory['paperloop:link:v2:1:'+from]={itemKey:'PARENT01',libraryID:1};
  route(from+'?utm_source=mail');await ui.save();a(ui.debugState().documentKey===location.href,'did not follow safe tracking URL');a(ui.debugState().thought.includes('带着图片')&&!ui.debugState().dirty,'tracking rewrite lost text or save');a(ui.debugState().images===1,'tracking rewrite lost pending image');a(memory['paperloop:notebookDraft:v2:2:'+location.href]?.html.includes('第二文库'),'other library draft lost');a(memory['paperloop:link:v2:1:'+location.href]?.itemKey==='PARENT01','DOI-less link lost');a((await records('history')).some(r=>r.documentKey===location.href),'backup did not migrate');tests.push('tracking rewrite preserves text, pending image, backups, all library drafts and DOI-less link');

  await reset();await fixture.uiSetup();ui.debugSetThought('旧文章独有草稿');await wait(()=>memory['paperloop:notebookDraft:v1:'+location.href]?.html.includes('旧文章'));
  const old=location.href;await call({action:'import-image',dataURI:fixture.dataURI,name:'old.png'});route(old+'?id=2');await ui.show({documentKey:location.href,title:document.title});a(!ui.debugState().thought.includes('旧文章'),'stale title allowed article-id migration');a((await records('pending')).some(r=>r.documentKey===old),'old article image was moved');a(memory['paperloop:notebookDraft:v1:'+old].html.includes('旧文章'),'original draft lost');tests.push('new article id with stale title cannot inherit old draft or staged image');

  await reset();await fixture.uiSetup();ui.debugSetThought('源地址草稿');await wait(()=>memory['paperloop:notebookDraft:v1:'+location.href]?.html.includes('源地址'));
  const source=location.href,destination=source+'?utm_source=other';memory['paperloop:notebookDraft:v1:'+destination]={html:'<p>目标地址已有内容</p>',dirty:true,libraryID:1,targetID:'C1'};route(destination);const refused=await ui.show({documentKey:destination});a(refused.migrationFailed&&ui.debugState().documentKey===source,'migration conflict did not retain original panel');a(memory['paperloop:notebookDraft:v1:'+destination].html.includes('目标地址'),'destination draft overwritten');tests.push('existing destination draft blocks migration without overwriting either version');

  await reset();const routeBefore=location.href;await call({action:'import-image',dataURI:fixture.dataURI,name:'atomic.png'});await call({action:'backup',html:'<p>备份</p>',dirty:true});const beforePending=await records('pending'),beforeHistory=await records('history'),beforeMedia=await records('recoveryMedia');route(routeBefore+'?utm_source=atomic');
  const originalPut=IDBObjectStore.prototype.put;let forced=false;IDBObjectStore.prototype.put=function(value,...rest){const r=originalPut.call(this,value,...rest);if(!forced&&this.name==='history'&&value.documentKey===location.href){forced=true;this.transaction.abort();}return r;};
  let rejected=false;try{await call({action:'rekey',fromKey:routeBefore});}catch(_){rejected=true;}finally{IDBObjectStore.prototype.put=originalPut;}
  a(rejected&&forced,'transaction fault not exercised');for(const [name,rows] of [['pending',beforePending],['history',beforeHistory],['recoveryMedia',beforeMedia]])a(JSON.stringify(await records(name))===JSON.stringify(rows),'partial migration in '+name);tests.push('an aborted media migration leaves all three IndexedDB stores unchanged');

  await reset();const linkFrom=location.href;memory['paperloop:link:v2:1:'+linkFrom]={itemKey:'PARENT01',libraryID:1};const linkTo=linkFrom+'?utm_source=linked';memory['paperloop:link:v2:1:'+linkTo]={itemKey:'OTHER001',libraryID:1};await call({action:'import-image',dataURI:fixture.dataURI,name:'link.png'});route(linkTo);rejected=false;try{await call({action:'rekey',fromKey:linkFrom});}catch(_){rejected=true;}a(rejected&&(await records('pending'))[0].documentKey===linkFrom,'different native item link was overwritten');tests.push('conflicting native item links stop migration before media moves');

  await reset();await fixture.uiSetup();const draftKey='paperloop:notebookDraft:v1:'+location.href;let releaseBackup;const blocked=new Promise(r=>{releaseBackup=r;});Zotero.Connector_Browser.paperLoopNotebook=payload=>payload.action==='backup'?blocked:originalNotebook(payload);ui.debugSetThought('第一段');await wait(()=>memory[draftKey]?.html.includes('第一段'));ui.debugSetThought('第二段仍能保存在本机');await wait(()=>memory[draftKey]?.html.includes('第二段'));releaseBackup({ok:true});Zotero.Connector_Browser.paperLoopNotebook=originalNotebook;tests.push('a stalled remote backup cannot block subsequent local draft writes');

  await reset();await fixture.uiSetup();const editor=fixture.shadow.querySelector('.editor');editor.dispatchEvent(new CompositionEvent('compositionstart'));ui.debugSetThought('输入法失焦恢复');await ui.save();a(ui.debugState().status.includes('组字'),'manual IME save is silent');editor.dispatchEvent(new FocusEvent('blur'));await ui.save();a(!ui.debugState().dirty&&note.getNote().includes('输入法失焦恢复'),'blur did not release IME save lock');tests.push('manual save explains composition state and blur restores saving');

  await reset();await fixture.uiSetup();ui.debugSetThought('超时前的文字');let expire,rejectOld,calls=0;
  const realTimeout=window.setTimeout,realClear=window.clearTimeout;
  window.setTimeout=(fn,ms,...args)=>{const id=realTimeout(fn,ms,...args);if(ms===240000)expire=()=>{realClear(id);fn();};return id;};
  Zotero.Connector_Browser.paperLoopNotebook=payload=>{if(payload.action==='save'&&++calls===1)return new Promise((_,reject)=>{rejectOld=reject;});return originalNotebook(payload);};
  let oldSave;
  try{oldSave=ui.save();await wait(()=>!!rejectOld&&!!expire);expire();a(!ui.debugState().saving,'watchdog did not release panel');}
  finally{window.setTimeout=realTimeout;}
  ui.debugSetThought('超时后新写的内容');await ui.save();const stable=ui.debugState().noteHTML,beforeLateCalls=calls;const conflict=new Error('late conflict');conflict.status=409;rejectOld(conflict);await oldSave;
  a(calls===beforeLateCalls&&ui.debugState().noteHTML===stable&&!ui.debugState().remoteConflict,'superseded 409 retried or changed latest save');a(note.getNote().includes('超时后新写'),'latest draft lost');tests.push('late 409 after watchdog never retries or changes a newer save');
  return tests;
 }finally{Zotero.Connector_Browser.paperLoopNotebook=originalNotebook;ui.close();await fixture.delay(250);route(originalURL);fixture.tab=originalTab;linked=true;note.setNote(originalHTML);attachments=originalAttachments;for(const k of Object.keys(memory))delete memory[k];Object.assign(memory,originalMemory);}
};
