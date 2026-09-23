/* Test-only browser fixture. Not included in either release. */
window.fixture = {assert(value,message){if(!value)throw new Error(message);}, tests:[], notices:[], delay:ms=>new Promise(r=>setTimeout(r,ms))};
const attachShadow = Element.prototype.attachShadow;
Element.prototype.attachShadow = function(options) { const root=attachShadow.call(this,options); if(this.hasAttribute('data-paperloop-sidebar-host'))fixture.shadow=root; return root; };
const memory = {};
const listeners = [];
let count=10, note=null, linked=true, attachments=[], creations=0;
const parent={id:1,key:'PARENT01',libraryID:1,getField:()=>document.title,isRegularItem:()=>true};
const target={targetID:'C1',name:'evtol 低空',path:'我的文库 / evtol 低空',libraryID:1};
window.browser={
 storage:{local:{async get(keys){keys=typeof keys==='string'?[keys]:keys;return Object.fromEntries(keys.filter(k=>k in memory).map(k=>[k,memory[k]]));},async set(value){Object.assign(memory,structuredClone(value));},async remove(key){delete memory[key];}}},
 runtime:{getURL:path=>location.origin+'/'+path,onMessage:{addListener:fn=>listeners.push(fn)},async sendMessage([method,args]){try{return await fixture.bridgeAPI[method.split('.')[1]](...args);}catch(e){return ['error',JSON.stringify({message:e.message,status:e.status})];}}},
 tabs:{async get(){return fixture.tab;},async sendMessage(id,data){if(data.type==='paperloop:image-context')return fixture.contexts?.get(data.srcUrl)||fixture.imageContext;fixture.notices.push(data);for(const l of listeners)l(data);}},
 action:{async setBadgeText(){}}, i18n:{getUILanguage:()=> 'zh-CN'}
};
window.Zotero={getMainWindow:()=>window,logError:e=>fixture.notices.push({error:e.message}),debug(){},Notes:{AUTO_SYNC_DELAY:1},
 Libraries:{get:()=>({editable:true,filesEditable:true})},
 Items:{async getAsync(ids){return attachments.filter(a=>ids.includes(a.id));},async getByLibraryAndKeyAsync(lib,key){return attachments.find(a=>a.key===key&&a.libraryID===lib);}},
 Item:function(){this.id=2;this.key='NOTE0001';this.libraryID=1;this.setNote=html=>this.html=html;this.getNote=()=>this.html;this.saveTx=async()=>{note=this;};this.getAttachments=()=>attachments.filter(a=>a.parentID===this.id).map(a=>a.id);},
 Attachments:{async importEmbeddedImage({blob,parentItemID}){
  const a={id:++count,key:'IMG'+String(count).padStart(5,'0'),parentID:parentItemID,libraryID:1,fields:{},setField(k,v){this.fields[k]=v;},getField(k){return this.fields[k];},saveTx:async()=>{},isEmbeddedImageAttachment:()=>true,fileExists:async()=>true,getFilePathAsync:async()=>'/fixture.png'};
  a.attachmentDataURI=await new Promise(resolve=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.readAsDataURL(blob);});attachments.push(a);return a;
 }},
 Connector_Browser:{async paperLoopGetCollections(){return {targets:[target],selectedTargetID:'C1'};},async paperLoopSetTarget(){return {target};},
 async paperLoopGetDocumentState(payload){if(fixture.requireTarget&&!payload?.targetID)throw new Error('请先选择要查询的 Zotero 文库或分类');return {status:linked?'existing':'missing',...await PaperLoopNotebook.snapshot(parent,note)};},
 async paperLoopSaveThought(){creations++;linked=true;await PaperLoopNotebook.noteFor(parent,true);return {ok:true};},
 getTabInfo:()=>({translators:[{itemType:'journalArticle'}]}),async paperLoopSetMinimized(){},async paperLoopSetPinned(){},async paperLoopSetAutoDisplayCategories(categories){return {categories};}},
 Connector:{async callMethod(_,data){if(fixture.failBridge || (data.action==='add-image'&&fixture.failCaption===data.caption))throw new Error('模拟断线');if(data.action==='add-image'&&fixture.beforeImage)await fixture.beforeImage(data);const [status,,body]=await new PaperLoopNotebook.Endpoint().init({data});if(status!==200){const e=new Error(JSON.parse(body).error);e.status=status;throw e;}return JSON.parse(body);}}
};
window.PaperLoopDOIBridge={pendingUpserts:new Map(),findCanonicalPaperLoopNote:async()=>note,findItemByKey:async()=>({item:parent})};
window.PaperLoopZoteroCompat={registerEndpoint(){},unregisterEndpoint(){}};
window.IOUtils={stat:async()=>({size:100})};
fixture.setup=async()=>{
 fixture.tab={id:1,url:location.href,title:document.title};
 fixture.bridgeAPI=Zotero.Connector_Browser;
 PaperLoopNotebook.hash=bytes=>Array.from(bytes).reduce((s,b)=>(s*31+b)>>>0,0).toString(16);
 Zotero.Connector_Browser.paperLoopNotebook=payload=>Zotero.PaperLoopImages.request(payload,fixture.tab,0);
 await PaperLoopNotebook.noteFor(parent,true);
 fixture.canvas=document.createElement('canvas');fixture.canvas.width=1280;fixture.canvas.height=720;
 const ctx=fixture.canvas.getContext('2d');ctx.fillStyle='#eef3e8';ctx.fillRect(0,0,1280,720);ctx.fillStyle='#56784e';ctx.font='38px Segoe UI';ctx.fillText('eVTOL · research notes',70,95);ctx.strokeStyle='#6a855f';ctx.lineWidth=4;
 ctx.beginPath();ctx.moveTo(80,580);ctx.lineTo(1160,580);ctx.moveTo(80,580);ctx.lineTo(80,170);ctx.stroke();ctx.strokeStyle='#8b9d77';ctx.beginPath();ctx.moveTo(80,550);ctx.bezierCurveTo(400,500,610,440,1120,210);ctx.stroke();ctx.fillStyle='#718864';ctx.font='24px Segoe UI';ctx.fillText('Figure 1. A local test figure',90,650);
 fixture.dataURI=fixture.canvas.toDataURL('image/png');fixture.base64=fixture.dataURI.split(',')[1];
 const small=document.createElement('canvas');small.width=320;small.height=180;small.getContext('2d').drawImage(fixture.canvas,0,0,320,180);fixture.smallURI=small.toDataURL('image/png');
 fixture.imageContext={candidates:[{url:fixture.dataURI,kind:'original'},{url:fixture.smallURI,kind:'displayed'}],caption:'图 1 · 低空飞行研究中的性能趋势（测试示意）',width:320,height:180};
};
fixture.test=async(name,fn)=>{fixture.currentTest=name;await fn();fixture.tests.push(name);};
fixture.backendTests=async()=>{
 const a=fixture.assert;
 await fixture.test('image-only save creates native attachment and provenance',async()=>{
  const result=await PaperLoopNotebook.addImage(parent,{base64:fixture.base64,width:1280,height:720,caption:'图 1 · 测试图片',pageURL:location.href,imageURL:'https://example.org/original.png'});
  a(result.noteHTML.includes('data-attachment-key'), 'missing native image key');a(result.noteHTML.includes('1280 × 720'),'missing dimensions');a(result.noteHTML.includes('图片来源'),'missing provenance');a(attachments.length===1,'expected one native image');
 });
 await fixture.test('duplicate image retry reuses one attachment',async()=>{const r=await PaperLoopNotebook.addImage(parent,{base64:fixture.base64});a(r.repeated&&attachments.length===1,'duplicate attachment');});
 await fixture.test('text edit round-trip preserves image and citation metadata',async()=>{
  const old=note.getNote();const html=old.replace('</div>','<p><strong>值得保留的发现</strong>：参数变化并不等同于因果关系。</p><p>下一步：比较不同构型的证据，再确定论证边界。</p><p><span data-citation="%7B%7D">(Author, 2026)</span></p></div>');
  const r=await PaperLoopNotebook.save(parent,{baseHTML:old,noteHTML:html});a(r.noteHTML.includes('data-attachment-key'),'lost image');a(r.noteHTML.includes('data-citation'),'lost citation');
 });
 await fixture.test('stale base rejects, never overwrites newer note',async()=>{
  const old=note.getNote();let status=0;try{await PaperLoopNotebook.save(parent,{baseHTML:'stale',noteHTML:old.replace('下一步','下一步修改')});}catch(e){status=e.status;}a(status===409,'must reject stale note');a(note.getNote()===old,'overwrote latest note');
 });
 await fixture.test('HTML scripts, event handlers and external image sources stripped',async()=>{
  const old=note.getNote();const r=await PaperLoopNotebook.save(parent,{baseHTML:old,noteHTML:old.replace('<img ','<img src="https://tracking.invalid/pixel" onerror="alert(1)" ')+'<script>alert(1)</script>'});a(!r.noteHTML.includes('tracking.invalid')&&!r.noteHTML.includes('script')&&!r.noteHTML.includes('onerror'),'unsafe html');
 });
 await fixture.test('foreign image attachment rejected',async()=>{let failed=false;try{await PaperLoopNotebook.save(parent,{baseHTML:note.getNote(),noteHTML:note.getNote().replace(/IMG\d{5}/,'FOREIGN1')});}catch(_){failed=true;}a(failed,'foreign image accepted');});
 await fixture.test('non-image HTML response rejected by backend',async()=>{let failed=false;try{await PaperLoopNotebook.addImage(parent,{base64:btoa('<html>not an image</html>')});}catch(_){failed=true;}a(failed,'HTML accepted as image');});
};
fixture.uiSetup=async()=>{
 await Zotero.PaperLoopSidebar.show({documentKey:location.href,title:'低空飞行器研究：从阅读到可复用的知识',translatorName:'Journal article',canSave:true,autoDisplayCategories:{literature:true,webpage:true}});
 await fixture.delay(150);
};
fixture.uiTests=async()=>{
 const ui=Zotero.PaperLoopSidebar,a=fixture.assert,s=()=>fixture.shadow;
 await fixture.test('rich editor reads native image; brand stays handwritten and body defaults clear',async()=>{a(ui.debugState().images===1,'image missing');a(s().querySelector('.flow-image-store img').src.startsWith('data:image/'),'image preview not hydrated');a(!s().querySelector('.editor img'),'native images must be outside editable text');a(ui.debugState().font==='standard','font not clear');a(getComputedStyle(s().querySelector('.brand')).fontFamily.includes('Segoe Print'),'brand font changed');});
 await fixture.test('inline text edit/save retains image attachment and metadata',async()=>{s().querySelector('.editor').insertAdjacentHTML('beforeend','<p>新增思考，不丢图。</p>');s().querySelector('.editor').dispatchEvent(new Event('input'));await ui.save();a(!ui.debugState().dirty,'save remains dirty');a(note.getNote().includes('新增思考')&&ui.debugState().images===1,'lost mixed content');});
 await fixture.test('settings collapsed; font selectable without changing note',async()=>{a(s().querySelector('.settings').hidden,'settings clutter main view');s().querySelector('.more').click();const before=note.getNote();s().querySelector('.font').value='standard';s().querySelector('.font').dispatchEvent(new Event('change'));a(ui.debugState().font==='standard','font toggle fails');a(before===note.getNote(),'appearance changed stored content');s().querySelector('.font').value='hand';s().querySelector('.font').dispatchEvent(new Event('change'));s().querySelector('.more').click();});
 await fixture.test('unsaved draft survives close/reopen with native image',async()=>{s().querySelector('.editor').insertAdjacentHTML('beforeend','<p>尚未同步的草稿</p>');s().querySelector('.editor').dispatchEvent(new Event('input'));ui.close();await fixture.delay(30);await fixture.uiSetup();a(ui.debugState().dirty&&ui.debugState().thought.includes('尚未同步'),'draft lost');a(ui.debugState().images===1,'draft lost image');await ui.save();});
 await fixture.test('remote append image merges safely with a dirty text draft',async()=>{s().querySelector('.editor').insertAdjacentHTML('beforeend','<p>正在写的段落</p>');s().querySelector('.editor').dispatchEvent(new Event('input'));fixture.canvas.getContext('2d').fillRect(10,10,10,10);const b64=fixture.canvas.toDataURL('image/png').split(',')[1];await PaperLoopNotebook.addImage(parent,{base64:b64,width:1280,height:720});await ui.debugRefreshZotero();a(ui.debugState().images===2&&ui.debugState().thought.includes('正在写'),'append merge lost content');a(!ui.debugState().remoteConflict,'append falsely conflicts');await ui.save();});
 await fixture.test('overlapping Zotero edit triggers conflict and backup before load',async()=>{s().querySelector('.editor').innerHTML=s().querySelector('.editor').innerHTML.replace('值得保留的发现','本地独有的发现');s().querySelector('.editor').dispatchEvent(new Event('input'));note.setNote(note.getNote().replace('值得保留的发现','Zotero 修改过的发现'));await ui.debugRefreshZotero();a(ui.debugState().remoteConflict&&s().querySelector('.save').disabled,'conflict did not block write');await ui.debugLoadRemote();a(ui.debugState().thought.includes('Zotero 修改'),'remote not loaded');a(memory['paperloop:recovery:v1:'+location.href].html.includes('本地独有'),'backup missing');});
 await fixture.test('close during save cannot mutate the next panel',async()=>{
  const original=Zotero.Connector_Browser.paperLoopNotebook;let release,entered;
  const ready=new Promise(r=>entered=r);Zotero.Connector_Browser.paperLoopNotebook=async p=>{if(p.action==='save'){entered();await new Promise(r=>release=r);}return original(p);};
  s().querySelector('.editor').insertAdjacentHTML('beforeend','<p>关闭期间保存</p>');s().querySelector('.editor').dispatchEvent(new Event('input'));const operation=ui.save();await ready;ui.close();await fixture.uiSetup();const before=ui.debugState().noteHTML;release();await operation;await fixture.delay(30);a(ui.debugState().noteHTML===before,'stale save changed reopened editor');Zotero.Connector_Browser.paperLoopNotebook=original;await ui.debugRefreshZotero();
 });
 await fixture.test('manual close blocks auto-open for same page',async()=>{ui.debugClickClose();const r=await ui.autoDisplay({documentKey:location.href,open:true});a(r.dismissed&&!ui.status().open,'manual dismissal ignored');await fixture.uiSetup();});
 await fixture.test('right-click stages the high-resolution candidate until selected save',async()=>{
  const before=attachments.length;await Zotero.PaperLoopImages.capture({srcUrl:fixture.smallURI,frameId:0},fixture.tab);await fixture.delay(150);const list=await Zotero.PaperLoopImages.request({action:'pending'},fixture.tab,0);a(list.length===1&&list[0].width===1280,'high-resolution image not staged');a(attachments.length===before,'capture saved without confirmation');const r=await Zotero.PaperLoopImages.request({action:'save-images',ids:[list[0].id],targetID:'C1',confirmCreate:true},fixture.tab,0);a(r.saved===1&&!r.failed.length,'selected image not saved');
 });
 await fixture.test('offline save retains bytes; retry succeeds without duplicate image',async()=>{
  fixture.failBridge=true;await Zotero.PaperLoopImages.capture({srcUrl:fixture.smallURI,frameId:0},fixture.tab);let list=await Zotero.PaperLoopImages.request({action:'pending'},fixture.tab,0);await Zotero.PaperLoopImages.request({action:'save-images',ids:[list[0].id],targetID:'C1'},fixture.tab,0);list=await Zotero.PaperLoopImages.request({action:'pending'},fixture.tab,0);a(list.length===1&&list[0].error,'offline image not retained');const preview=await Zotero.PaperLoopImages.request({action:'pending-preview',id:list[0].id},fixture.tab,0);a(preview.dataURI.startsWith('data:image/png'),'pending bytes missing');fixture.failBridge=false;const n=attachments.length;await Zotero.PaperLoopImages.request({action:'save-image',id:list[0].id,targetID:'C1'},fixture.tab,0);a(attachments.length===n,'retry duplicates attachment');
 });
 await fixture.test('new page image stays pending until explicit confirmation',async()=>{
  linked=false;const n=creations;await Zotero.PaperLoopImages.capture({srcUrl:fixture.smallURI,frameId:0},fixture.tab);const list=await Zotero.PaperLoopImages.request({action:'pending'},fixture.tab,0);a(list.length===1&&creations===n,'unconfirmed item created');await Zotero.PaperLoopImages.request({action:'save-image',id:list[0].id,targetID:'C1',confirmCreate:true},fixture.tab,0);a(creations===n+1,'confirmed creation not called');
 });
 await fixture.test('image preview supports original download',async()=>{await ui.debugRefreshZotero();await fixture.delay(50);s().querySelector('.media-preview').click();await fixture.until(()=>s().querySelector('.media-viewer-download').hasAttribute('href'));a(!s().querySelector('.media-viewer').hidden,'viewer missing');a(s().querySelector('.media-viewer-download').href.startsWith('data:image/png'),'download is only a remote link');s().querySelector('.media-viewer-close').click();});
 return [...fixture.tests];
};
fixture.until=async(fn,timeout=6000)=>{const end=Date.now()+timeout;while(Date.now()<end){if(await fn())return;await fixture.delay(30);}throw new Error('Fixture wait timed out');};
fixture.makeImage=index=>{
 fixture.contexts||=new Map();const c=document.createElement('canvas');c.width=960;c.height=index%3===1?640:540;const ctx=c.getContext('2d');
 const colors=[['#edf2e7','#708863'],['#f3eee3','#ac9469'],['#eaf0ef','#608d87'],['#eeeaf1','#9683a5'],['#f1eae4','#b68b72'],['#edf0e5','#929d68']][index%6];
 ctx.fillStyle=colors[0];ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle=colors[1];ctx.strokeStyle=colors[1];ctx.lineWidth=3;ctx.font='22px Segoe UI';ctx.fillText(['Lift / drag','Design space','Rotor response','Load spectrum','Material comparison','Flight envelope'][index%6],55,60);
 ctx.globalAlpha=.6;
 if(index%3===0){for(let i=0;i<6;i++)ctx.fillRect(90+i*130,440-(100+i*37),65,100+i*37);}
 else if(index%3===1){for(let i=0;i<4;i++){ctx.beginPath();ctx.ellipse(230+i*100,330,150,85,i*.8,0,Math.PI*2);ctx.stroke();}}
 else {ctx.beginPath();for(let x=70;x<890;x+=4){const y=280+Math.sin(x/90+index)*100;if(x===70)ctx.moveTo(x,y);else ctx.lineTo(x,y);}ctx.stroke();ctx.beginPath();ctx.moveTo(60,430);ctx.lineTo(900,430);ctx.stroke();}
 ctx.globalAlpha=1;ctx.font='16px Segoe UI';ctx.fillText('Figure '+(index+1)+' · Local validation fixture',55,c.height-35);
 const uri=c.toDataURL('image/png');const caption=['图 1 · 升阻性能对比','图 2 · 构型设计空间','图 3 · 旋翼响应曲线','图 4 · 载荷谱分析','图 5 · 材料性能比较','图 6 · 飞行包线'][index%6];
 fixture.contexts.set(uri,{candidates:[{url:uri,kind:'original'}],caption,width:c.width,height:c.height});return {uri,caption};
};
fixture.collect=async indices=>{await Promise.all(indices.map(index=>{const r=fixture.makeImage(index);return Zotero.PaperLoopImages.capture({srcUrl:r.uri,frameId:0},fixture.tab);}));await fixture.delay(120);};
fixture.galleryTests=async()=>{
 const start=fixture.tests.length,a=fixture.assert,ui=Zotero.PaperLoopSidebar,s=()=>fixture.shadow;
 const pending=()=>Zotero.PaperLoopImages.request({action:'pending'},fixture.tab,0);
 await fixture.test('consecutive captures queue six unique images without stealing note focus',async()=>{
  s().querySelector('.tab-notes').click();s().querySelector('.editor').focus();const before=note.getNote();await fixture.collect([0,1,2,3,4,5]);await fixture.until(()=>ui.debugState().pendingCount===6);
  a((await pending()).length===6,'multi-image queue incomplete');a(before===note.getNote(),'capture unexpectedly modified note');a(ui.debugState().activeView==='notes'&&s().activeElement===s().querySelector('.editor'),'capture stole reading focus');a(!('bytes' in (await pending())[0])&&!(await pending())[0].imageURL,'pending metadata leaks huge image data');a((await pending()).every((r,i)=>r.caption.startsWith('图 '+(i+1))),'download completion order changed capture order');
 });
 await fixture.test('gallery grid shows all images and preserves note HTML across tab switches',async()=>{
  const html=ui.debugState().noteHTML;s().querySelector('.tab-images').click();a(!s().querySelector('.media-area').hidden&&!s().querySelector('.content').hidden,'text and images must stay in one flow');
  a(s().querySelectorAll('.media-card[data-kind=pending]').length===6,'cards missing');a(ui.debugState().selectedImages.length===6,'new pending images not selected');a(ui.debugState().noteHTML===html,'switch changed note content');await fixture.until(()=>s().querySelectorAll('.media-card[data-kind=pending] img[src]').length===6);
 });
 await fixture.test('selection survives refresh; select-all and deselect-all work',async()=>{
  s().querySelector('.media-select-all').click();a(ui.debugState().selectedImages.length===0,'deselect all failed');const boxes=s().querySelectorAll('.media-card[data-kind=pending] input');boxes[0].click();boxes[2].click();boxes[4].click();a(ui.debugState().selectedImages.length===3,'subset selection failed');
  await Zotero.PaperLoopImages.capture({srcUrl:fixture.makeImage(0).uri,frameId:0},fixture.tab);await fixture.delay(100);a(ui.debugState().selectedImages.length===3,'refresh reset selection');a((await pending()).length===6,'repeat capture duplicated pending item');
 });
 await fixture.test('partial batch save retains only failed/unchecked images and reports per-image error',async()=>{
  const selected=ui.debugState().selectedImages;const records=await pending();fixture.failCaption=records.find(r=>r.id===selected[1]).caption;const before=attachments.length;
  s().querySelector('.media-save').click();await fixture.until(()=>!ui.debugState().imagesBusy&&ui.debugState().pendingCount===4);
  a(attachments.length===before+2,'batch did not continue after failure');const failed=(await pending()).filter(r=>r.error);a(failed.length===1,'failure detail missing');a(ui.debugState().selectedImages.length===1&&ui.debugState().selectedImages[0]===failed[0].id,'unchecked items were auto-selected');a(s().querySelectorAll('.media-card[data-state=error]').length===1,'failed card not marked');fixture.failCaption=null;
 });
 await fixture.test('retry only failed image then save remaining selection without duplicates',async()=>{
  const before=attachments.length;s().querySelector('.media-save').click();await fixture.until(()=>!ui.debugState().imagesBusy&&ui.debugState().pendingCount===3);a(attachments.length===before+1,'retry duplicated successful images');
  s().querySelector('.media-select-all').click();s().querySelector('.media-save').click();await fixture.until(()=>!ui.debugState().imagesBusy&&ui.debugState().pendingCount===0);a(s().querySelectorAll('.media-card[data-kind=saved]').length>=8,'saved gallery missing images');
 });
 await fixture.test('gallery preview navigates with arrows and keeps original download',async()=>{
  s().querySelector('.media-preview').click();await fixture.until(()=>s().querySelector('.media-viewer-download').hasAttribute('href'));a(s().querySelector('.media-viewer-prev').disabled,'first image should have no previous');
  s().querySelector('.media-viewer').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));await fixture.until(()=>s().querySelector('.media-viewer-download').hasAttribute('href'));a(s().querySelector('.media-viewer-count').textContent.includes('2 /'),'arrow navigation failed');a(!s().querySelector('.media-viewer-prev').disabled,'previous should enable');a(s().querySelector('.media-viewer-download').href.startsWith('data:image/png'),'download is not original');
  s().querySelector('.media-viewer').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));a(s().querySelector('.media-viewer').hidden,'escape did not close viewer');
 });
 await fixture.test('remove-selected requires confirmation and never deletes saved Zotero images',async()=>{
  await fixture.collect([6,7]);await fixture.until(()=>ui.debugState().pendingCount===2);s().querySelectorAll('.media-card[data-kind=pending] input')[1].click();const before=attachments.length;
  s().querySelector('.media-remove').click();a((await pending()).length===2,'first click removed without confirmation');a(s().querySelector('.media-remove').classList.contains('confirm'),'confirmation not visible');s().querySelector('.media-remove').click();await fixture.until(()=>!ui.debugState().imagesBusy&&ui.debugState().pendingCount===1);a(attachments.length===before,'removal touched Zotero images');
  const records=await pending();await Zotero.PaperLoopImages.request({action:'discard-images',ids:records.map(r=>r.id)},fixture.tab,0);s().querySelector('.refresh').click();await fixture.until(()=>ui.debugState().pendingCount===0);
 });
 await fixture.test('large preview expands beyond the sidebar and restores on close',async()=>{
  s().querySelector('.media-preview').click();await fixture.until(()=>s().querySelector('.media-viewer-download').hasAttribute('href'));s().querySelector('.media-viewer-expand').click();a(s().querySelector('.media-viewer').getBoundingClientRect().width>1000,'expanded image remains constrained to sidebar');s().querySelector('.media-viewer-close').click();a(!s().querySelector('.media-viewer').classList.contains('expanded'),'close did not reset expanded preview');
 });
 await fixture.test('batch continues after panel close, reopening shows in-flight state',async()=>{
  await fixture.collect([8,9,10]);await fixture.until(()=>ui.debugState().pendingCount===3);let entered,release;const started=new Promise(r=>entered=r);fixture.beforeImage=async()=>{fixture.beforeImage=null;entered();await new Promise(r=>release=r);};
  s().querySelector('.media-save').click();await started;ui.close();await fixture.uiSetup();a(ui.debugState().pendingCount===3&&ui.debugState().imagesBusy,'reopen lost running state');release();await fixture.until(()=>ui.debugState().pendingCount===0&&!ui.debugState().imagesBusy);
 });
 await fixture.test('background rejects cross-page batches without discarding staged images',async()=>{
  await fixture.collect([11]);const records=await pending();const original=fixture.tab;fixture.tab={...original,url:original.url+'different'};
  const r=await Zotero.PaperLoopImages.request({action:'discard-images',ids:[records[0].id]},fixture.tab,0);a(r.failed.length===1&&r.removed===0,'foreign page removed image');fixture.tab=original;a((await pending()).length===1,'original image lost');await Zotero.PaperLoopImages.request({action:'discard-images',ids:[records[0].id]},fixture.tab,0);
 });
 return fixture.tests.slice(start);
};
fixture.galleryPreview=async()=>{
 await fixture.collect([12,13,14,15,16,17]);await fixture.until(()=>Zotero.PaperLoopSidebar.debugState().pendingCount===6);fixture.shadow.querySelector('.tab-images').click();await fixture.until(()=>fixture.shadow.querySelectorAll('.media-card[data-kind=pending] img[src]').length===6);
 fixture.shadow.querySelectorAll('.media-card[data-kind=pending] input')[4].click();fixture.shadow.querySelectorAll('.media-card[data-kind=pending] input')[5].click();
};
fixture.saveRegressionTests=async()=>{
 const a=fixture.assert,ui=Zotero.PaperLoopSidebar,s=()=>fixture.shadow,start=fixture.tests.length;
 const edit=text=>{s().querySelector('.editor').insertAdjacentHTML('beforeend','<p>'+text+'</p>');s().querySelector('.editor').dispatchEvent(new Event('input'));};
 const pending=()=>Zotero.PaperLoopImages.request({action:'pending'},fixture.tab,0);
 await fixture.test('late pre-save refresh cannot conflict with or replace the saved revision',async()=>{
  await ui.debugRefreshZotero();const original=fixture.bridgeAPI.paperLoopGetDocumentState;let release,entered;const ready=new Promise(r=>entered=r);let first=true;
  fixture.bridgeAPI.paperLoopGetDocumentState=async(...args)=>{const result=await original(...args);if(first){first=false;entered();await new Promise(r=>release=r);}return result;};
  const oldRead=ui.debugRefreshZotero();await ready;edit('保存并发回归文字');await ui.save();edit('保存后的新草稿');release();await oldRead;fixture.bridgeAPI.paperLoopGetDocumentState=original;
  a(!ui.debugState().remoteConflict,'late pre-save response falsely conflicts');a(ui.debugState().thought.includes('保存后的新草稿'),'late response lost draft');await ui.save();
 });
 await fixture.test('HTML quoting differences update the base without a false conflict',async()=>{
  edit('格式变化不应阻止这段草稿');note.setNote(note.getNote().replace('data-schema-version="9"',"data-schema-version='9'"));await ui.debugRefreshZotero();
  a(!ui.debugState().remoteConflict,'equivalent HTML falsely conflicts');a(ui.debugState().dirty,'local draft lost dirty state');await ui.save();a(note.getNote().includes('格式变化不应阻止'),'draft not saved');
 });
 await fixture.test('existing empty placeholder accepts a restored draft with no baseline',async()=>{
  const previous=note.getNote();ui.close();await fixture.delay(40);note.setNote('<div data-schema-version="9"><h1>PaperLoop 思考</h1><p></p></div>');
  memory['paperloop:notebookDraft:v1:'+location.href]={html:'<div data-schema-version="9"><h1>PaperLoop 思考</h1><p>初次写入草稿</p></div>',baseHTML:'',dirty:true};await fixture.uiSetup();
  a(!ui.debugState().remoteConflict,'empty placeholder falsely conflicts');await ui.save();a(note.getNote().includes('初次写入草稿'),'initial draft missing');
  ui.close();await fixture.delay(40);note.setNote(previous);delete memory['paperloop:notebookDraft:v1:'+location.href];await fixture.uiSetup();
 });
 await fixture.test('main save writes text and all staged images without a gallery save',async()=>{
  const before=attachments.length;await fixture.collect([25,26]);await fixture.until(()=>ui.debugState().pendingCount===2);edit('主按钮同时保存图片和文字');await ui.save();
  a((await pending()).length===0,'main save leaves images staged');a(attachments.length===before+2,'main save misses native attachments');a(note.getNote().includes('主按钮同时保存'),'main save misses text');a(!ui.debugState().remoteConflict&&!ui.debugState().dirty,'combined save leaves false conflict/dirty state');
 });
 await fixture.test('existing paper without a PaperLoop note accepts its first nonempty save',async()=>{
  const previous=note;ui.close();await fixture.delay(40);note=null;delete memory['paperloop:notebookDraft:v1:'+location.href];await fixture.uiSetup();edit('已有文献的第一条笔记');await ui.save();
  a(note&&note.getNote().includes('已有文献的第一条笔记'),'new placeholder produces a stale-base error');a(!ui.debugState().dirty&&!ui.debugState().remoteConflict,'first note incorrectly conflicts');
  ui.close();await fixture.delay(40);note=previous;delete memory['paperloop:notebookDraft:v1:'+location.href];await fixture.uiSetup();
 });
 await fixture.test('main save retains failed image bytes, reports partial result and retries once',async()=>{
  await fixture.collect([27,28]);await fixture.until(()=>ui.debugState().pendingCount===2);const records=await pending();fixture.failCaption=records[1].caption;const before=attachments.length;edit('部分失败也保留文字');await ui.save();
  a(note.getNote().includes('部分失败也保留文字'),'text lost on image failure');a(attachments.length===before+1&&(await pending()).length===1,'partial save lost or duplicated images');a(/未保存/.test(ui.debugState().status),'partial result reported full success');
  fixture.failCaption=null;await ui.save();a(attachments.length===before+2&&(await pending()).length===0,'retry duplicates or loses an image');
 });
 await fixture.test('rapid repeated main-save clicks produce one note write',async()=>{
  const original=fixture.bridgeAPI.paperLoopNotebook;let count=0,release,entered;const ready=new Promise(r=>entered=r);
  fixture.bridgeAPI.paperLoopNotebook=async p=>{if(p.action==='save'){count++;entered();await new Promise(r=>release=r);}return original(p);};edit('连续点击仅写入一次');
  const first=ui.save();await ready;await ui.save();release();await first;fixture.bridgeAPI.paperLoopNotebook=original;a(count===1,'double click sends duplicate writes');a(!ui.debugState().remoteConflict,'double click creates conflict');
 });
 await fixture.test('pending selection and removal stay locked while main save is writing',async()=>{
  await fixture.collect([29]);await fixture.until(()=>ui.debugState().pendingCount===1);const original=fixture.bridgeAPI.paperLoopNotebook;let release,entered;const ready=new Promise(r=>entered=r);
  fixture.bridgeAPI.paperLoopNotebook=async p=>{if(p.action==='save'&&p.includePendingImages){entered();await new Promise(r=>release=r);}return original(p);};
  const operation=ui.save();await ready;a(s().querySelector('.media-remove').disabled&&s().querySelector('.media-select-all').disabled,'main save permits conflicting gallery mutations');a(s().querySelector('.editor').contentEditable==='false','editor remains editable during save');
  release();await operation;fixture.bridgeAPI.paperLoopNotebook=original;a((await pending()).length===0,'locked save failed');
 });
 await fixture.test('identical concurrent background saves share a single operation',async()=>{
  const original=Zotero.Connector.callMethod;let calls=0;Zotero.Connector.callMethod=async(...args)=>{if(args[1].action==='save'){calls++;await fixture.delay(35);}return original(...args);};
  const base=note.getNote(),payload={action:'save',targetID:'C1',documentKey:location.href,baseHTML:base,noteHTML:base.replace('</div>','<p>后台去重</p></div>'),includePendingImages:true};
  await Promise.all([Zotero.PaperLoopImages.request(payload,fixture.tab,0),Zotero.PaperLoopImages.request({...payload},fixture.tab,0)]);Zotero.Connector.callMethod=original;a(calls===1,'background sends duplicate save requests');await ui.debugRefreshZotero();
 });
 await fixture.test('different concurrent drafts still reject stale overwrite',async()=>{
  const base=note.getNote(),p={action:'save',targetID:'C1',documentKey:location.href,baseHTML:base};
  const results=await Promise.allSettled([Zotero.PaperLoopImages.request({...p,noteHTML:base.replace('</div>','<p>第一份并发草稿</p></div>')},fixture.tab,0),Zotero.PaperLoopImages.request({...p,noteHTML:base.replace('</div>','<p>第二份并发草稿</p></div>')},fixture.tab,0)]);
  a(results[0].status==='fulfilled'&&results[1].status==='rejected'&&results[1].reason.status===409,'different stale draft bypassed conflict protection');a(note.getNote().includes('第一份并发草稿')&&!note.getNote().includes('第二份并发草稿'),'newer note overwritten');await ui.debugRefreshZotero();
 });
 return fixture.tests.slice(start);
};
fixture.flowTests=async()=>{
 const start=fixture.tests.length,a=fixture.assert,ui=Zotero.PaperLoopSidebar,s=()=>fixture.shadow;
 const pending=()=>Zotero.PaperLoopImages.request({action:'pending'},fixture.tab,0);
 const cards=()=>[...s().querySelectorAll('.media-card')];
 await fixture.test('single-flow layout keeps writing above gallery; only main save is visible',async()=>{
  a(s().querySelector('.content').parentElement===s().querySelector('.media-area').parentElement,'not one scroll flow');a(!s().querySelector('.content').hidden&&!s().querySelector('.media-area').hidden,'section hidden');a(getComputedStyle(s().querySelector('.notebook-tabs')).display==='none','old tabs shown');a(getComputedStyle(s().querySelector('.media-save')).display==='none','duplicate save exposed');
 });
 await fixture.test('select-all text deletion cannot remove native images from the independent store',async()=>{
  const editor=s().querySelector('.editor'),original=editor.innerHTML,count=ui.debugState().images;editor.focus();const selection=s().getSelection(),range=document.createRange();range.selectNodeContents(editor);selection.removeAllRanges();selection.addRange(range);document.execCommand('delete');editor.dispatchEvent(new Event('input'));a(ui.debugState().images===count&&ui.debugState().noteHTML.includes('data-attachment-key'),'text delete removed images');editor.innerHTML=original;editor.dispatchEvent(new Event('input'));await ui.save();
 });
 await fixture.test('eight theme appearances change environment without changing note HTML',async()=>{
  const html=ui.debugState().noteHTML;for(const theme of ['cowcat','shiba','iris','tide'])for(const mode of ['light','dark']){for(const [key,value] of [['theme',theme],['mode',mode]]){s().querySelector('.'+key).value=value;s().querySelector('.'+key).dispatchEvent(new Event('change'));}await s().querySelector('.theme-photo').decode();a(s().querySelector('.theme-photo').naturalWidth>100,'photo missing');const colors=['.panel','.content','.media-area'].map(c=>getComputedStyle(s().querySelector(c)).backgroundColor);a(new Set(colors).size===3,'monotone theme');a(ui.debugState().noteHTML===html,'theme altered note');}s().querySelector('.theme').value='cowcat';s().querySelector('.theme').dispatchEvent(new Event('change'));s().querySelector('.mode').value='light';s().querySelector('.mode').dispatchEvent(new Event('change'));
 });
 await fixture.test('new paragraph preserves existing rich content and native images',async()=>{
  const old=ui.debugState().images,body=ui.debugState().thought;s().querySelector('.flow-add').click();const entry=[...s().querySelectorAll('.paperloop-entry')].at(-1);entry.querySelector('h3').textContent='关联测试标题';entry.querySelector('p').textContent='只在正文出现的测试文字';s().querySelector('.editor').dispatchEvent(new Event('input'));a(ui.debugState().images===old&&ui.debugState().thought.includes(body.split('\n')[0]),'add lost old content');
 });
 let stagedIds=[];
 await fixture.test('pending x is reversible and leaves bytes staged until main save',async()=>{
  await fixture.collect([40,41,42]);await fixture.until(()=>ui.debugState().pendingCount===3);stagedIds=(await pending()).map(r=>r.id);s().querySelector('.media-card[data-kind=pending] .media-delete').click();a(ui.debugState().pendingCount===2&&ui.debugState().dirty,'pending draft removal not tracked');a((await pending()).length===3,'x prematurely discarded bytes');s().querySelector('.flow-undo').click();a(ui.debugState().pendingCount===3,'undo did not restore pending image');
 });
 await fixture.test('pending images link continuously and resolve to native keys on unified save',async()=>{
  s().querySelector('.paperloop-entry h3').click();s().querySelector('.flow-link').click();const pendingCards=cards().filter(c=>c.dataset.kind==='pending');pendingCards[0].querySelector('.media-preview').click();cards().find(c=>c.dataset.id===stagedIds[1]).querySelector('.media-preview').click();a(s().querySelector('.flow-link').getAttribute('aria-pressed')==='true','link mode ended after first image');s().querySelector('.flow-link').click();await ui.save();a(!ui.debugState().dirty&&!ui.debugState().remoteConflict,'linked save not clean');const html=note.getNote();a(!/paperloop-image-source|paperloop-image-caption/.test(html),'noisy provenance remains visible');a(/pl-ref-IMG\d{5}/.test(html),'pending refs not native');a(!/pl-ref-[0-9a-f-]{36}/.test(html),'pending UUID refs not resolved');a((await pending()).length===0,'unified save did not save images');
 });
 await fixture.test('linked title preview excludes body; one-click unlink keeps image and text',async()=>{
  const card=cards().find(c=>c.querySelector('.flow-chip'));a(card,'linked card missing');card.querySelector('.flow-chip button').click();await fixture.until(()=>s().querySelector('.media-viewer-download').hasAttribute('href'));a(s().querySelector('.media-viewer-head').textContent.includes('关联测试标题'),'preview title missing');a(!s().querySelector('.media-viewer').textContent.includes('只在正文出现'),'preview duplicates body');s().querySelector('.media-viewer-close').click();const count=ui.debugState().images;card.querySelector('.flow-unlink').click();a(ui.debugState().images===count&&ui.debugState().thought.includes('只在正文出现'),'unlink deleted content');s().querySelector('.flow-undo').click();
 });
 await fixture.test('saved image removal undo preserves later text edits and native files',async()=>{
  const count=ui.debugState().images,files=attachments.length;cards().find(c=>c.querySelector('.flow-chip')).querySelector('.media-delete').click();a(ui.debugState().images===count-1,'saved image not removed');const p=s().querySelector('.paperloop-entry p');p.textContent+=' · 删除后的新文字';s().querySelector('.editor').dispatchEvent(new Event('input'));s().querySelector('.flow-undo').click();a(ui.debugState().images===count&&ui.debugState().thought.includes('删除后的新文字'),'undo overwrote later text');a(attachments.length===files,'native file deleted');await ui.save();
 });
 await fixture.test('associations and theme survive close/reopen and persisted note round-trip',async()=>{
  const keys=ui.debugState().noteHTML.match(/pl-ref-[A-Z0-9]{8}/g);ui.close();await fixture.delay(50);await fixture.uiSetup();a(JSON.stringify(ui.debugState().noteHTML.match(/pl-ref-[A-Z0-9]{8}/g))===JSON.stringify(keys),'association lost after reopen');a(ui.debugState().theme==='cowcat'&&!ui.debugState().remoteConflict,'theme/conflict changed');
 });
 await fixture.test('excluded pending image is not written by main save; bytes discard only on success',async()=>{
  await fixture.collect([43]);await fixture.until(()=>ui.debugState().pendingCount===1);const count=attachments.length;s().querySelector('.media-card[data-kind=pending] .media-delete').click();await ui.debugRefreshZotero();a(ui.debugState().dirty&&!s().querySelector('.flow-undo').hidden,'refresh erased pending-removal undo');fixture.failBridge=true;await ui.save();fixture.failBridge=false;a((await pending()).length===1,'failed save discarded bytes');await ui.save();a((await pending()).length===0&&attachments.length===count,'excluded image was saved or not discarded');
 });
 return fixture.tests.slice(start);
};
fixture.editingTests=async()=>{
 const start=fixture.tests.length,a=fixture.assert,ui=Zotero.PaperLoopSidebar,s=()=>fixture.shadow;
 const pending=()=>Zotero.PaperLoopImages.request({action:'pending'},fixture.tab,0);
 const card=id=>[...s().querySelectorAll('.media-card')].find(c=>c.dataset.id===id);
 const begin=(id,name)=>{card(id).querySelector('.media-rename').click();const input=s().querySelector('.media-name-input');a(input,'rename input not shown');input.value=name;return input;};
 const rename=(id,name)=>{begin(id,name).dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));};
 const native=()=>new DOMParser().parseFromString(note.getNote(),'text/html');
 const add=(title,body)=>{s().querySelector('.flow-add').click();const entry=[...s().querySelectorAll('.paperloop-entry')].at(-1);entry.querySelector('h3').textContent=title;entry.querySelector('p').textContent=body;s().querySelector('.editor').dispatchEvent(new Event('input'));return entry;};
 await fixture.test('paragraph minus removes only one block and its links; undo preserves later edits',async()=>{
  const entry=add('可删除的段落','需要暂时移出的文字'),other=add('独立保留段落','后续编辑');entry.querySelector('h3').click();s().querySelector('.media-link-add').click();const refs=entry.className.match(/pl-ref-[A-Z0-9]{8}/g);a(refs?.length,'test link missing');const images=ui.debugState().images,files=attachments.length;entry.querySelector('.flow-entry-delete').click();a(!entry.isConnected&&ui.debugState().images===images&&attachments.length===files,'paragraph delete touched images');other.querySelector('p').textContent+='仍然保留';s().querySelector('.editor').dispatchEvent(new Event('input'));s().querySelector('.flow-undo').click();a(entry.isConnected&&refs.every(ref=>entry.classList.contains(ref))&&ui.debugState().thought.includes('后续编辑仍然保留'),'undo lost links or later typing');await ui.save();
 });
 await fixture.test('paragraph deletion persists through save and reopening without deleting attachments',async()=>{
  const entry=[...s().querySelectorAll('.paperloop-entry')].find(e=>e.querySelector('h3')?.textContent==='可删除的段落'),images=ui.debugState().images;entry.querySelector('h3').click();s().querySelector('.flow-remove-current').click();await ui.save();a(!note.getNote().includes('需要暂时移出的文字'),'removed paragraph still saved');ui.close();await fixture.delay(40);await fixture.uiSetup();a(!ui.debugState().thought.includes('需要暂时移出的文字')&&ui.debugState().images===images,'deletion not retained or image lost');
 });
 await fixture.test('empty new paragraph still exposes minus and supports undo',async()=>{
  const entry=add('','');a(entry.querySelector('.flow-entry-delete'),'empty paragraph cannot be deleted');entry.querySelector('.flow-entry-delete').click();a(!entry.isConnected,'empty paragraph not deleted');s().querySelector('.flow-undo').click();a(entry.isConnected,'empty paragraph undo failed');entry.querySelector('.flow-entry-delete').click();await ui.save();
 });
 const savedKey=s().querySelector('.media-card[data-kind=saved]').dataset.id;
 const customName='低空航线 <对比> & "方案 A" 🐈';
 await fixture.test('saved image rename accepts plain Unicode text and undo preserves image identity',async()=>{
  const old=card(savedKey).querySelector('.media-caption').textContent,images=ui.debugState().images,html=ui.debugState().noteHTML;rename(savedKey,customName);a(card(savedKey).querySelector('.media-caption').textContent===customName,'caption not updated');a(!s().querySelector('.media-caption 对比')&&ui.debugState().noteHTML.includes('&lt;对比&gt;'),'name became markup');a(ui.debugState().images===images,'rename duplicated image');s().querySelector('.flow-undo').click();a(card(savedKey).querySelector('.media-caption').textContent===old,'rename undo failed');a(ui.debugState().noteHTML===html,'rename undo changed note');rename(savedKey,customName);
 });
 await fixture.test('saved image name survives local draft reopening and native note round-trip',async()=>{
  ui.close();await fixture.delay(50);await fixture.uiSetup();a(card(savedKey).querySelector('.media-caption').textContent===customName&&ui.debugState().dirty,'renamed draft lost');await ui.save();a(native().querySelector('img[data-attachment-key="'+savedKey+'"]').alt===customName,'native alt not renamed');a([...native().querySelectorAll('.paperloop-figure-title')].some(h=>h.textContent.includes(customName)),'native heading does not use image name');ui.close();await fixture.delay(50);await fixture.uiSetup();a(card(savedKey).querySelector('.media-caption').textContent===customName&&!ui.debugState().remoteConflict,'saved name reload failed');
 });
 await fixture.test('rename cancel and blank validation preserve the previous name',async()=>{
  const original=ui.debugState().noteHTML;begin(savedKey,'取消后的名字').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));a(ui.debugState().noteHTML===original&&!s().querySelector('.media-name-input'),'Escape did not cancel');begin(savedKey,'  ');s().querySelector('.media-name-apply').click();a(s().querySelector('.media-name-input').getAttribute('aria-invalid')==='true','blank name accepted');await ui.save();a(s().querySelector('.media-name-input')&&ui.debugState().noteHTML===original,'save ignored invalid name');s().querySelector('.media-name-cancel').click();a(card(savedKey).querySelector('.media-caption').textContent===customName,'blank replaced name');
 });
 let pendingID;
 await fixture.test('pending image name survives refresh, typed-name close, and reopening',async()=>{
  await fixture.collect([50]);await fixture.until(()=>ui.debugState().pendingCount===1);pendingID=(await pending())[0].id;begin(pendingID,'待保存的能耗曲线');ui.close();await fixture.delay(50);await fixture.uiSetup();a(card(pendingID).querySelector('.media-caption').textContent==='待保存的能耗曲线'&&ui.debugState().dirty,'pending draft name lost on close');await ui.debugRefreshZotero();a(!ui.debugState().remoteConflict&&card(pendingID).querySelector('.media-caption').textContent==='待保存的能耗曲线','refresh lost name or falsely conflicts');
 });
 await fixture.test('pending rename and image removal undo restore names without writing bytes',async()=>{
  rename(pendingID,'临时名称');s().querySelector('.flow-undo').click();a(card(pendingID).querySelector('.media-caption').textContent==='待保存的能耗曲线','pending rename undo failed');card(pendingID).querySelector('.media-delete').click();a(!card(pendingID)&&(await pending()).length===1,'draft delete wrote or lost bytes');s().querySelector('.flow-undo').click();a(card(pendingID).querySelector('.media-caption').textContent==='待保存的能耗曲线','remove undo lost name');
 });
 await fixture.test('renamed pending image survives failed upload then saves its name once',async()=>{
  const files=attachments.length;fixture.failCaption='待保存的能耗曲线';await ui.save();fixture.failCaption=null;a((await pending()).length===1&&ui.debugState().dirty,'failed name/image draft not retained');a(card(pendingID).querySelector('.media-caption').textContent==='待保存的能耗曲线','partial save changed name');await ui.save();a((await pending()).length===0&&attachments.length===files+1,'retry lost/duplicated image');const img=[...native().querySelectorAll('img')].find(i=>i.alt==='待保存的能耗曲线');a(img&&!ui.debugState().dirty&&!ui.debugState().remoteConflict,'renamed pending image not cleanly saved');a(!Object.keys(memory['paperloop:notebookDraft:v1:'+location.href].imageNames).length,'saved pending overrides linger');
 });
 await fixture.test('main save commits focused name input and preserves associations',async()=>{
  const key=s().querySelector('.media-card[data-kind=saved]').dataset.id;const refs=ui.debugState().noteHTML.match(/pl-ref-[A-Z0-9]{8}/g);begin(key,'直接保存的图名');await ui.save();a(native().querySelector('img[data-attachment-key="'+key+'"]').alt==='直接保存的图名','save skipped focused name');a(JSON.stringify(ui.debugState().noteHTML.match(/pl-ref-[A-Z0-9]{8}/g))===JSON.stringify(refs),'rename changed links');
 });
 await fixture.test('paragraph deletion and image naming lock during unified save',async()=>{
  const original=fixture.bridgeAPI.paperLoopNotebook;let release,entered;const ready=new Promise(r=>entered=r);fixture.bridgeAPI.paperLoopNotebook=async p=>{if(p.action==='save'&&p.includePendingImages){entered();await new Promise(r=>release=r);}return original(p);};const operation=ui.save();await ready;a([...s().querySelectorAll('.flow-entry-delete,.flow-remove-current,.media-rename')].every(b=>b.disabled),'edit control unlocked during save');const html=ui.debugState().noteHTML;s().querySelector('.flow-entry-delete').click();s().querySelector('.media-rename').click();a(html===ui.debugState().noteHTML&&!s().querySelector('.media-name-input'),'locked edit changed note');release();await operation;fixture.bridgeAPI.paperLoopNotebook=original;
 });
 return fixture.tests.slice(start);
};
fixture.columnTests=async()=>{
 const start=fixture.tests.length,a=fixture.assert,ui=Zotero.PaperLoopSidebar,s=()=>fixture.shadow;
 const keys=attachments.slice(0,3).map(img=>img.key),files=attachments.length;
 const parse=()=>new DOMParser().parseFromString(note.getNote(),'text/html');
 const source='<div data-schema-version="9"><h1>PaperLoop 思考</h1><div class="paperloop-entry pl-ref-'+keys[0]+' pl-ref-'+keys[1]+'"><h3>第一段列布局</h3><p><strong>保留加粗</strong>与<span class="citation" data-citation="%7B%7D">引用</span></p></div><div class="paperloop-entry pl-ref-'+keys[0]+'"><h3>共享图片段</h3><table><tbody><tr><td>原有数据</td><td>42</td></tr></tbody></table></div>'+keys.map((key,i)=>'<p><img data-attachment-key="'+key+'" alt="列布局图 '+(i+1)+'" width="640" height="360"></p>').join('')+'</div>';
 const reopen=async html=>{ui.close();await fixture.delay(40);delete memory['paperloop:notebookDraft:v1:'+location.href];if(html!==undefined)note.setNote(html);await fixture.uiSetup();};
 await fixture.test('native column export pairs each text paragraph with its associated images',async()=>{
  await reopen(source);a(note.getNote()===source,'opening migrated native note without explicit save');await ui.save();const doc=parse(),table=doc.querySelector('.paperloop-columns');a(table&&table.rows.length===3,'incorrect layout row count');a(table.rows[1].cells[0].textContent.includes('第一段列布局')&&table.rows[1].cells[1].querySelectorAll('img').length===2,'text/image sides not paired');a(table.rows[2].cells[1].querySelector('img').dataset.attachmentKey===keys[0],'shared image not placed beside second paragraph');a(table.rows[0].cells[0].dataset.colwidth==='330'&&table.rows[0].cells[1].dataset.colwidth==='270','column proportions missing');
 });
 await fixture.test('column export keeps rich text, citations and ordinary user tables',async()=>{
  const table=parse().querySelector('.paperloop-columns');a(table.rows[1].cells[0].querySelector('strong')&&table.rows[1].cells[0].querySelector('[data-citation]'),'rich metadata lost');a(table.rows[2].cells[0].querySelector('table').textContent.includes('42'),'ordinary table lost');
 });
 await fixture.test('shared image repeats only its reference; unassociated image stays at bottom',async()=>{
  const doc=parse();a(doc.querySelectorAll('img[data-attachment-key="'+keys[0]+'"]').length===2,'shared image not shown twice');a(attachments.length===files&&ui.debugState().images===3,'duplicated native file or gallery record');const standalone=doc.querySelector('img[data-attachment-key="'+keys[2]+'"]');a(!standalone.closest('table')&&doc.querySelector('h2').textContent==='未关联图片','unassociated image missing or wrongly paired');
 });
 await fixture.test('repeated column save and reopen is stable without nested layout tables',async()=>{
  const first=note.getNote();await ui.save();a(note.getNote()===first,'second save changed column content');await reopen();a(ui.debugState().images===3&&!s().querySelector('.editor .paperloop-columns'),'browser left export layout in editor');await ui.save();a(note.getNote()===first&&parse().querySelectorAll('.paperloop-columns').length===1,'reopen/save nested or changed layout');
 });
 await fixture.test('native class stripping still reconstructs per-row paragraphs and associations',async()=>{
  const doc=parse();for(const node of doc.querySelectorAll('[class]')){for(const name of [...node.classList])if(/^(paperloop-|pl-)/.test(name))node.classList.remove(name);}for(const div of [...doc.querySelectorAll('td>div')])div.replaceWith(...div.childNodes);const raw=doc.body.innerHTML;await reopen(raw);a(s().querySelectorAll('.editor>.paperloop-entry').length===2,'native editor paragraphs not recovered');const entries=[...s().querySelectorAll('.editor>.paperloop-entry')];a(entries[0].querySelectorAll('.flow-chip').length===2&&entries[1].querySelectorAll('.flow-chip').length===1,'native table links not recovered');a(ui.debugState().images===3&&s().querySelector('.editor table'),'native stripped import lost image or user table');await ui.save();a(!ui.debugState().remoteConflict,'native-normalized layout conflicts on save');
 });
 await fixture.test('native right-cell edits and image names survive browser import',async()=>{
  const doc=parse(),cell=doc.querySelector('.paperloop-columns').rows[1].cells[1];cell.querySelector('h3').textContent='图 1 · 在 Zotero 改的图名';const comment=doc.createElement('p');comment.textContent='在图片旁补充的原生文字';cell.append(comment);await reopen(doc.body.innerHTML);a(ui.debugState().thought.includes('在图片旁补充的原生文字'),'right-cell user text discarded');a([...s().querySelectorAll('.media-caption')].some(node=>node.textContent==='在 Zotero 改的图名'),'native caption edit ignored');await ui.save();a(note.getNote().includes('在图片旁补充的原生文字'),'native user edit not saved');
 });
 await fixture.test('deleting one paired paragraph keeps shared and unassociated image attachments',async()=>{
  s().querySelector('.editor>.paperloop-entry .flow-entry-delete').click();await ui.save();a(ui.debugState().images===3&&attachments.length===files,'paragraph delete removed image data');a(parse().querySelector('.paperloop-columns').rows.length===2,'deleted paragraph still in table');a(parse().querySelector('.paperloop-columns').rows[1].cells[1].querySelector('img').dataset.attachmentKey===keys[0],'remaining link removed');
 });
 await fixture.test('image-only column note round-trips without fabricated text paragraphs',async()=>{
  await reopen('<div data-schema-version="9"><h1>PaperLoop 思考</h1><p><img data-attachment-key="'+keys[2]+'" alt="仅图片" width="640" height="360"></p></div>');await ui.save();const html=note.getNote();await reopen();await ui.save();a(ui.debugState().images===1&&note.getNote()===html,'image-only layout grows fake paragraphs');
 });
 await fixture.test('bridge strips malformed column widths while preserving valid user widths',async()=>{
  const clean=await PaperLoopNotebook.sanitize('<div data-schema-version="9"><h1>PaperLoop 思考</h1><table><tr><td data-colwidth="330"><p>有效</p></td><td data-colwidth="999999"><p>无效</p></td></tr></table><p data-colwidth="270">错误节点</p></div>',note),doc=new DOMParser().parseFromString(clean,'text/html');a(doc.querySelectorAll('[data-colwidth]').length===1&&doc.querySelector('[data-colwidth]').dataset.colwidth==='330','column width validation failed');
 });
 await reopen(source);await ui.save();return fixture.tests.slice(start);
};
fixture.designPreview=async()=>{
 const ui=Zotero.PaperLoopSidebar,s=()=>fixture.shadow;ui.close();await fixture.delay(40);delete memory['paperloop:notebookDraft:v1:'+location.href];
 const keys=attachments.slice(0,3).map(a=>a.key);note.setNote('<div data-schema-version="9"><h1>PaperLoop 思考</h1><div class="paperloop-entry pl-ref-'+keys[0]+'"><h3>研究主线</h3><p>航线评价应同时考虑任务、路径约束与能耗。</p></div><div class="paperloop-entry pl-ref-'+keys[1]+'"><h3>约束条件</h3><p>比较实验时，需要保持风场与禁飞区条件一致。</p></div><div class="paperloop-entry pl-ref-'+keys[2]+'"><h3>自己的想法</h3><p>先保存证据，再整理自己的判断。</p></div>'+keys.map((key,i)=>'<p><img data-attachment-key="'+key+'" alt="'+['任务与能耗','约束区域','候选路径'][i]+'"></p>').join('')+'</div>');
 memory['paperloop:appearance:v1']={font:'standard',theme:'cowcat',mode:'light',width:520,height:860,left:860,top:25};await fixture.uiSetup();ui.debugResetPosition();s().querySelector('.font').value='standard';s().querySelector('.font').dispatchEvent(new Event('change'));await ui.save();s().querySelector('.notebook-flow').scrollTop=0;await fixture.delay(200);
};
