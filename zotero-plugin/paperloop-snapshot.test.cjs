'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const parent={id:1,libraryID:1,key:'ITEM0001',isRegularItem:()=>true,getNotes:()=>[],getField:()=>'',getAttachments:()=>attachments.map(a=>a.id)};
const attachments=[];let imports=0,shouldFail=false;
const library={editable:true,filesEditable:true};
const Zotero={debug(){},logError(){},Utilities:{cleanDOI:()=>''},Libraries:{get:()=>library},Items:{getAsync:async()=>attachments,getByLibraryAndKeyAsync:async(lib,key)=>key===parent.key&&lib===1?parent:null},Attachments:{LINK_MODE_IMPORTED_URL:1,LINK_MODE_LINKED_URL:3,async importFromSnapshotContent(options){
  assert.equal(options.parentItemID,1);assert.equal(options.url,data.url);assert.ok(options.snapshotContent.includes('Article text'));
  if(shouldFail)throw new Error('disk unavailable');imports++;await new Promise(resolve=>setImmediate(resolve));
  const attachment={id:imports+1,key:'SNAP000'+imports,attachmentContentType:'text/html',attachmentLinkMode:1,getField:field=>field==='url'?options.url:'',fileExists:async()=>true};attachments.push(attachment);return attachment;
}}};
const ctx=vm.createContext({Zotero});vm.runInContext(fs.readFileSync(__dirname+'/paperloop.js','utf8'),ctx);
const bridge=ctx.PaperLoopDOIBridge,data={libraryID:1,itemKey:'ITEM0001',url:'https://kns.cnki.net/kcms2/article/abstract?v=fixture',snapshotContent:'<!doctype html><html><body>Article text</body></html>'};
const call=payload=>new bridge.AddSnapshotEndpoint().init({data:payload});
(async()=>{
  for(const [index,properties] of [
    {attachmentLinkMode:0,getField:()=>data.url},
    {attachmentLinkMode:2,getField:()=>data.url},
    {attachmentLinkMode:3,getField:()=>data.url},
    {attachmentLinkMode:1,getField:()=>''},
    {attachmentLinkMode:1,getField:()=> 'file:///C:/plain.html'},
    {attachmentLinkMode:1},
    {attachmentLinkMode:1,getField:()=>data.url,attachmentContentType:'text/plain'},
    {attachmentLinkMode:1,getField:()=>data.url,deleted:true}
  ].entries()){
    const attachment={id:100+index,key:'LOCAL00'+index,attachmentContentType:'text/html',fileExists:async()=>true,...properties};
    attachments.push(attachment);assert.equal(await bridge.findUsableSnapshot(parent),null,'ordinary HTML or invalid webpage attachment cannot suppress a snapshot');
  }
  assert.equal((await bridge.documentState(data)).hasSnapshot,false,'document state does not report local HTML as a webpage snapshot');
  const both=await Promise.all([call(data),call(data)]);assert.ok(both.every(r=>r[0]===200));assert.equal(imports,1,'concurrent saves create one snapshot');assert.equal(JSON.parse(both[1][2]).created,false);
  assert.equal((await bridge.findUsableSnapshot(parent)).key,'SNAP0001');
  assert.equal((await bridge.documentState(data)).snapshotAttachmentKey,'SNAP0001','document state points to the imported webpage snapshot');
  const saved=attachments.find(attachment=>attachment.key==='SNAP0001');
  saved.getField=()=> 'https://kns.cnki.net/kcms/detail/detail.aspx?dbcode=CJFD&filename=older';
  saved.attachmentContentType='application/xhtml+xml';
  assert.equal((await call(data))[0],200);assert.equal(imports,1,'valid older webpage snapshot is reused despite a different encrypted URL');
  assert.equal((await bridge.findUsableSnapshot(parent)).key,'SNAP0001','XHTML webpage snapshots remain supported');
  saved.fileExists=async()=>false;assert.equal(await bridge.findUsableSnapshot(parent),null,'missing disk file can be backfilled');
  shouldFail=true;assert.equal((await call(data))[0],500);assert.equal(bridge.pendingSnapshots.size,0,'failed request does not poison retries');
  shouldFail=false;assert.equal((await call(data))[0],200);assert.equal(imports,2);
  for(const bad of [{...data,itemKey:'WRONG001'},{...data,url:'https://kns.cnki.net/verify/home'},{...data,url:'https://fake-cnki.net/kcms2/article/abstract'},{...data,snapshotContent:'not html'}])assert.ok((await call(bad))[0]>=400);
  library.filesEditable=false;assert.equal((await call(data))[0],409);library.filesEditable=true;
  parent.deleted=true;assert.equal((await call(data))[0],404);parent.deleted=false;
  assert.equal(imports,2,'invalid requests cannot create attachments');
  console.log('Native snapshot tests: ordinary HTML rejection, HTTP imported-webpage/XHTML reuse, concurrent deduplication, missing file backfill, retry, invalid target/page/content and file permissions passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
