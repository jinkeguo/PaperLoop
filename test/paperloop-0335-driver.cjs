'use strict';
module.exports=async({command,evaluate})=>{
 const assert=require('node:assert/strict'),results=[];
 const run=async(name,fn)=>{try{await fn();results.push({name,ok:true});}catch(e){results.push({name,ok:false,error:e.message});}};
 const reset=async()=>evaluate(`(async()=>{Zotero.PaperLoopSidebar.close();await fixture.delay(100);delete memory['paperloop:notebookDraft:v1:'+location.href];note.setNote('<div data-schema-version="9"><h1>PaperLoop 思考</h1><p></p></div>');await fixture.uiSetup();})()`);
 const point=async selector=>evaluate(`(()=>{const b=fixture.shadow.querySelector(${JSON.stringify(selector)});if(!b)throw Error('Missing '+${JSON.stringify(selector)});b.scrollIntoView({block:'nearest'});const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,disabled:b.disabled};})()`);
 const mouse=async(type,p)=>command('Input.dispatchMouseEvent',{type,x:p.x,y:p.y,...(type==='mouseMoved'?{}:{button:'left',clickCount:1})});
 const click=async selector=>{const p=await point(selector);assert.ok(!p.disabled,'disabled: '+selector);await mouse('mouseMoved',p);await mouse('mousePressed',p);await mouse('mouseReleased',p);await evaluate('fixture.delay(30)');};
 await evaluate(`window.interactionErrors=[];window.addEventListener('error',e=>interactionErrors.push(e.message));window.addEventListener('unhandledrejection',e=>interactionErrors.push(String(e.reason)))`);
 await run('primary buttons keep themed background on hover and press',async()=>{
  await reset();const failures=[];
  for(const theme of ['cowcat','shiba','iris','paper','sage','ink','tide'])for(const mode of ['light','dark']){
   await evaluate(`(()=>{for(const [key,value] of Object.entries(${JSON.stringify({theme,mode})})){const s=fixture.shadow.querySelector('.'+key);s.value=value;s.dispatchEvent(new Event('change'));}})()`);
   for(const selector of ['.save','.image-import']){
    await mouse('mouseMoved',{x:5,y:5});const before=await evaluate(`getComputedStyle(fixture.shadow.querySelector('${selector}')).backgroundColor`);const p=await point(selector);await mouse('mouseMoved',p);
    const hover=await evaluate(`getComputedStyle(fixture.shadow.querySelector('${selector}')).backgroundColor`);await mouse('mousePressed',p);
    const pressed=await evaluate(`getComputedStyle(fixture.shadow.querySelector('${selector}')).backgroundColor`);await mouse('mouseMoved',{x:5,y:5});await mouse('mouseReleased',{x:5,y:5});
    if(before!==hover||before!==pressed)failures.push({theme,mode,selector,before,hover,pressed});
   }
  }assert.deepEqual(failures,[]);
 });
 await run('real clicks add, type, delete and undo consecutive paragraphs',async()=>{
  await reset();
  for(const text of ['第一段正文','第二段正文','第三段正文']){await click('.flow-add');await command('Input.insertText',{text});}
  assert.equal(await evaluate(`fixture.shadow.querySelectorAll('.paperloop-entry').length`),3);
  await click('.flow-remove-current');assert.ok(await evaluate(`!Zotero.PaperLoopSidebar.debugState().thought.includes('第三段正文')`));
  await click('.flow-undo');assert.ok(await evaluate(`Zotero.PaperLoopSidebar.debugState().thought.includes('第三段正文')`));
 });
 await run('new empty paragraph remains visible after refresh and can be removed',async()=>{
  await reset();await click('.flow-add');await evaluate(`Zotero.PaperLoopSidebar.debugRefreshZotero()`);
  assert.equal(await evaluate(`fixture.shadow.querySelectorAll('.paperloop-entry').length`),1);await click('.flow-remove-current');
  assert.equal(await evaluate(`fixture.shadow.querySelectorAll('.paperloop-entry').length`),0);
 });
 await run('keyboard-only first input selects its paragraph for delete',async()=>{
  await reset();await evaluate(`fixture.shadow.querySelector('.editor').focus()`);await command('Input.insertText',{text:'键盘输入后删除'});
  await click('.flow-remove-current');assert.ok(await evaluate(`!Zotero.PaperLoopSidebar.debugState().thought.includes('键盘输入后删除')`));
 });
 await run('paragraph delete click survives a background render between press and release',async()=>{
  await reset();await click('.flow-add');await command('Input.insertText',{text:'按下期间刷新'});
  const p=await point('.flow-entry-delete');await mouse('mouseMoved',p);await mouse('mousePressed',p);
  await evaluate(`Zotero.PaperLoopSidebar.show({})`);await mouse('mouseReleased',p);
  assert.ok(await evaluate(`!Zotero.PaperLoopSidebar.debugState().thought.includes('按下期间刷新')`));
 });
 await run('background automatic save does not disable paragraph editing',async()=>{
  await reset();await click('.flow-add');await command('Input.insertText',{text:'后台保存时继续编辑'});
  await evaluate(`(()=>{fixture.originalInteractionAPI=fixture.bridgeAPI.paperLoopNotebook;fixture.bridgeAPI.paperLoopNotebook=async p=>{if(p.action==='save'){fixture.interactionSaveEntered=true;await new Promise(r=>fixture.releaseInteractionSave=r);}return fixture.originalInteractionAPI(p);};fixture.interactionSaveJob=Zotero.PaperLoopSidebar.save({automatic:true});})()`);
  try{await evaluate(`fixture.until(()=>fixture.interactionSaveEntered)`);await click('.flow-add');await command('Input.insertText',{text:'保存过程中的新段落'});}
  finally{await evaluate(`(async()=>{fixture.bridgeAPI.paperLoopNotebook=fixture.originalInteractionAPI;fixture.releaseInteractionSave();await fixture.interactionSaveJob;})()`);}
  await evaluate(`fixture.until(()=>note.getNote().includes('保存过程中的新段落')&&!Zotero.PaperLoopSidebar.debugState().dirty&&!Zotero.PaperLoopSidebar.debugState().saving)`);
  assert.ok(await evaluate(`!Zotero.PaperLoopSidebar.debugState().remoteConflict&&note.getNote().includes('后台保存时继续编辑')`));
 });
 await run('deleting a saved paragraph during automatic save persists without conflict',async()=>{
  await reset();await click('.flow-add');await command('Input.insertText',{text:'保存后删除的段落'});await evaluate(`Zotero.PaperLoopSidebar.save()`);
  await evaluate(`(()=>{fixture.interactionSaveEntered=false;fixture.originalInteractionAPI=fixture.bridgeAPI.paperLoopNotebook;fixture.bridgeAPI.paperLoopNotebook=async p=>{if(p.action==='save'){fixture.interactionSaveEntered=true;await new Promise(r=>fixture.releaseInteractionSave=r);}return fixture.originalInteractionAPI(p);};fixture.interactionSaveJob=Zotero.PaperLoopSidebar.save({automatic:true});})()`);
  try{await evaluate(`fixture.until(()=>fixture.interactionSaveEntered)`);await click('.flow-remove-current');}
  finally{await evaluate(`(async()=>{fixture.bridgeAPI.paperLoopNotebook=fixture.originalInteractionAPI;fixture.releaseInteractionSave();await fixture.interactionSaveJob;})()`);}
  await evaluate(`fixture.until(()=>!note.getNote().includes('保存后删除的段落')&&!Zotero.PaperLoopSidebar.debugState().saving&&!Zotero.PaperLoopSidebar.debugState().dirty)`);
  assert.ok(await evaluate(`!Zotero.PaperLoopSidebar.debugState().remoteConflict`));
 });
 await run('real Add images click opens the file input once',async()=>{
  await reset();await evaluate(`(()=>{fixture.fileInputClicks=0;fixture.shadow.querySelector('.image-files').addEventListener('click',e=>{fixture.fileInputClicks++;e.preventDefault();});})()`);
  await click('.image-import');assert.equal(await evaluate('fixture.fileInputClicks'),1);
 });
 await run('renaming one image then clicking another image works on the first click',async()=>{
  await reset();await evaluate(`fixture.collect([81,82])`);await evaluate(`fixture.until(()=>fixture.shadow.querySelectorAll('.media-card').length===2)`);
  await click('.media-card:first-child .media-rename');await command('Input.insertText',{text:'第一张图的新名字'});
  const p=await point('.media-card:nth-child(2) .media-preview');await mouse('mouseMoved',p);await mouse('mousePressed',p);await evaluate(`fixture.delay(180)`);await mouse('mouseReleased',p);await evaluate(`fixture.delay(30)`);
  assert.ok(await evaluate(`!fixture.shadow.querySelector('.media-viewer').hidden`),'blur rerender swallowed the image preview click');
  await click('.media-viewer-close');assert.ok(await evaluate(`[...fixture.shadow.querySelectorAll('.media-caption')].some(p=>p.textContent==='第一张图的新名字')`));
 });
 await run('image rename can be cancelled or completed with real buttons',async()=>{
  await click('.media-card:first-child .media-rename');await command('Input.insertText',{text:'不应保留的名字'});await click('.media-name-cancel');
  assert.ok(await evaluate(`[...fixture.shadow.querySelectorAll('.media-caption')].some(p=>p.textContent==='第一张图的新名字')`));
  await click('.media-card:first-child .media-rename');await command('Input.insertText',{text:'最终图片名'});await click('.media-name-apply');
  assert.ok(await evaluate(`[...fixture.shadow.querySelectorAll('.media-caption')].some(p=>p.textContent==='最终图片名')`));
 });
 await run('clicking the next rename button commits the first name and opens the next field',async()=>{
  await click('.media-card:first-child .media-rename');await command('Input.insertText',{text:'再次改名'});await click('.media-card:nth-child(2) .media-rename');
  assert.ok(await evaluate(`!!fixture.shadow.querySelector('.media-card:nth-child(2) .media-name-input')`));
  await command('Input.insertText',{text:'第二张图片名'});await click('.media-name-apply');
  assert.ok(await evaluate(`[...fixture.shadow.querySelectorAll('.media-caption')].map(p=>p.textContent).join('|')==='再次改名|第二张图片名'`));
 });
 await run('renaming then deleting that image responds on the first click and can be undone',async()=>{
  await click('.media-card:first-child .media-rename');await command('Input.insertText',{text:'删除前的名字'});await click('.media-card:first-child .media-delete');
  assert.equal(await evaluate(`fixture.shadow.querySelectorAll('.media-card').length`),1);await click('.flow-undo');
  assert.equal(await evaluate(`fixture.shadow.querySelectorAll('.media-card').length`),2);
  assert.ok(await evaluate(`[...fixture.shadow.querySelectorAll('.media-caption')].some(p=>p.textContent==='删除前的名字')`));
 });
 await run('image unlink, delete and undo work with real clicks',async()=>{
  await reset();await click('.flow-add');await command('Input.insertText',{text:'关联图片的段落'});
  await click('.media-card:first-child .media-link-add');assert.equal(await evaluate(`fixture.shadow.querySelectorAll('.editor .flow-chip').length`),1);
  const p=await point('.editor .flow-unlink');await mouse('mouseMoved',p);await mouse('mousePressed',p);await evaluate(`Zotero.PaperLoopSidebar.show({})`);await mouse('mouseReleased',p);
  assert.equal(await evaluate(`fixture.shadow.querySelectorAll('.editor .flow-chip').length`),0);
  const before=await evaluate(`fixture.shadow.querySelectorAll('.media-card').length`);await click('.media-card:first-child .media-delete');assert.equal(await evaluate(`fixture.shadow.querySelectorAll('.media-card').length`),before-1);
  await click('.flow-undo');assert.equal(await evaluate(`fixture.shadow.querySelectorAll('.media-card').length`),before);
 });
 await run('manual Save button preserves text and both images',async()=>{
  await click('.save');await evaluate(`fixture.until(()=>!Zotero.PaperLoopSidebar.debugState().saving&&!Zotero.PaperLoopSidebar.debugState().imagesBusy&&Zotero.PaperLoopSidebar.debugState().pendingCount===0)`);
  assert.ok(await evaluate(`note.getNote().includes('关联图片的段落')&&Zotero.PaperLoopSidebar.debugState().images===2&&!Zotero.PaperLoopSidebar.debugState().remoteConflict`));
 });
 await run('backup panel, settings and size controls respond without changing the note',async()=>{
  const before=await evaluate(`Zotero.PaperLoopSidebar.debugState().noteHTML`);await click('.backup-open');assert.ok(await evaluate(`!fixture.shadow.querySelector('.backups').hidden`));await click('.backup-close');
  await click('.theme-toggle');assert.ok(await evaluate(`!fixture.shadow.querySelector('.settings').hidden`));await click('.theme-toggle');
  const width=await evaluate(`Zotero.PaperLoopSidebar.debugState().rectangle.width`);await click('.panel-smaller');assert.ok(await evaluate(`Zotero.PaperLoopSidebar.debugState().rectangle.width<${width}`));await click('.panel-larger');
  assert.equal(await evaluate(`Zotero.PaperLoopSidebar.debugState().noteHTML`),before);
 });
 await run('pointer actions do not emit unhandled UI errors',async()=>assert.deepEqual(await evaluate('interactionErrors'),[]));
 console.log(JSON.stringify(results,null,2));assert.ok(results.every(r=>r.ok),'pointer interaction regression failed');return results.map(r=>r.name);
};
