'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const pageSource=fs.readFileSync(__dirname+'/inject/pageSaving.js','utf8');
const background=fs.readFileSync(__dirname+'/background.js','utf8');
const article='https://kns.cnki.net/kcms2/article/abstract?v=fixture';
function setup({metadata=false,appearAfter=Infinity,verification=false,fail=false,timers={setTimeout,clearTimeout}}={}){
  let elapsed=0,detects=0,captures=0,saves=0;
  const document={location:{href:verification?'https://kns.cnki.net/verify/home':article},title:verification?'安全验证':'A real article',readyState:'complete',
    querySelector:selector=>selector==='#paramdbcode'&&metadata?{getAttribute:()=> 'CJFD'}:null};
  const native={status:'existing',libraryID:1,itemKey:'ITEM0001',hasSnapshot:false,filesEditable:true};
  const Z={isManifestV3:false,Promise:{delay:async ms=>{elapsed+=ms;if(elapsed>=appearAfter)metadata=true;}},logError(){},
    Connector_Browser:{onTranslators(){}},TranslateWeb:{detect:async()=>{detects++;if(fail)throw new Error('offscreen down');return metadata?[{label:'CNKI',itemType:'journalArticle'}]:[];}},
    Connector:{getPref:async()=>true,callMethod:async()=>native,saveSingleFile:async(options,data)=>{saves++;assert.equal(options.method,'paperloop/add-snapshot');assert.equal(data.itemKey,'ITEM0001');assert.ok(!data.snapshotContent.includes('data-paperloop-sidebar-host'));return {created:true,attachmentKey:'SNAP0001'};}},
    SingleFile:{retrievePageData:async()=>{captures++;return '<!doctype html><html><body>Article text<div data-paperloop-sidebar-host>Private draft</div></body></html>';}}
  };
  class Clock extends Date {static now(){return elapsed;}}
  class DOMParser {parseFromString(){let removed=false;return {querySelectorAll:()=>[{remove(){removed=true;}}],documentElement:{get outerHTML(){return removed?'<html><body>Article text</body></html>':'<html data-paperloop-sidebar-host></html>';}}};}}
  const ctx={Zotero:Z,document,Date:Clock,instanceID:1,DOMParser,setTimeout:timers.setTimeout,clearTimeout:timers.clearTimeout};vm.createContext(ctx);vm.runInContext(pageSource,ctx);
  const subject=Z.PageSaving,realAutoDisplay=subject._paperLoopAutoDisplay;subject._initTranslate=async()=>({});subject._paperLoopAutoDisplay=async()=>{};
  return {subject,native,Z,document,ctx,realAutoDisplay,setMetadata:value=>{metadata=value;},counters:()=>({elapsed,detects,captures,saves})};
}
const nextTurn=()=>new Promise(resolve=>setImmediate(resolve));
function fakeTimers(){
  let sequence=0;const pending=new Map();
  return {setTimeout(callback,ms){const id=++sequence;pending.set(id,{callback,ms});return id;},
    clearTimeout(id){pending.delete(id);},
    expire(ms){const expired=[...pending].filter(([,timer])=>timer.ms===ms);assert.ok(expired.length,'expected deadline '+ms);for(const [id,timer] of expired){pending.delete(id);timer.callback();}},
    size:()=>pending.size};
}
function setupOuterHTMLRace(options={}){
  const f=setup({metadata:true,...options});
  let revision=0;
  f.document.documentElement={get outerHTML(){
    return `<html><head><title>${f.document.title}</title></head><body data-revision="${revision}"><input id="paramdbcode" value="CJFD"></body></html>`;
  }};
  const detections=[];
  f.subject._initTranslate=async()=>({url:f.document.location.href,signature:f.document.documentElement.outerHTML});
  f.Z.TranslateWeb.detect=({translate})=>new Promise((resolve,reject)=>detections.push({translate,resolve,reject}));
  return {...f,detections,changeDocument:()=>{revision++;}};
}
async function testDetectionDeadlinesAndGenerations(){
  let timers=fakeTimers(),f=setupOuterHTMLRace({timers});
  const notifications=[];f.Z.Connector_Browser.onTranslators=value=>notifications.push(value);
  const stalled=f.subject.paperLoopDetect();await nextTurn();
  assert.equal(f.detections.length,1);timers.expire(20000);
  assert.equal((await stalled).status,'timeout');assertDetectionIdle(f);
  assert.equal(timers.size(),0,'timeout timer is cleaned up');
  const retry=f.subject._detectPageTranslators(true);await nextTurn();
  assert.equal(f.detections.length,2,'direct callers can start a retry after timeout');
  f.detections[1].resolve([{label:'retry',itemType:'journalArticle'}]);await retry;
  f.detections[0].resolve([{label:'too late',itemType:'journalArticle'}]);await nextTurn();
  assert.equal(f.subject.translators[0].label,'retry');assert.equal(f.subject._paperLoopDetection.status,'ready');
  assert.equal(notifications.length,1,'late result cannot notify the background');assertDetectionIdle(f);assert.equal(timers.size(),0);

  timers=fakeTimers();f=setup({metadata:true,timers});let releaseInit;
  f.subject._initTranslate=()=>new Promise(resolve=>{releaseInit=resolve;});
  const initializing=f.subject.paperLoopDetect();await nextTurn();timers.expire(20000);
  assert.equal((await initializing).status,'timeout');releaseInit({});await nextTurn();
  assert.equal(f.counters().detects,0,'late offscreen initialization cannot start detection');
  f.subject._initTranslate=async()=>({});assert.equal((await f.subject.paperLoopDetect()).status,'ready');assert.equal(timers.size(),0);

  timers=fakeTimers();f=setup({timers});let releaseMetadata;
  f.Z.Promise.delay=()=>new Promise(resolve=>{releaseMetadata=resolve;});
  const metadataWait=f.subject.paperLoopDetect();await nextTurn();timers.expire(20000);
  assert.equal((await metadataWait).status,'timeout','deadline covers metadata wait, not just Translator execution');
  releaseMetadata();await nextTurn();assert.equal(f.counters().detects,0);

  for(const rejectOld of [false,true]){
    timers=fakeTimers();f=setupOuterHTMLRace({timers});
    const pageA=f.subject.onPageLoad(true);await nextTurn();f.changeDocument();
    const queuedA=f.subject.onPageLoad(true);
    f.document.location.href=article+'-B';const pageB=f.subject.onPageLoad(true);await nextTurn();
    f.document.location.href=article;const returnedA=f.subject.onPageLoad(true);await nextTurn();
    assert.equal(f.detections.length,3,'A to B to A starts a new generation even with the same final URL');
    f.detections[2].resolve([{label:'current A',itemType:'journalArticle'}]);await returnedA;
    if(rejectOld)f.detections[0].reject(new Error('late old A failure'));
    else f.detections[0].resolve([{label:'old A',itemType:'journalArticle'}]);
    f.detections[1].resolve([{label:'old B',itemType:'journalArticle'}]);await Promise.all([pageA,queuedA,pageB]);
    assert.equal(f.detections.length,3,'old queued refresh cannot resurrect after returning to its URL');
    assert.equal(f.subject.translators[0].label,'current A');assert.equal(f.subject._paperLoopDetection.status,'ready');
    assertDetectionIdle(f);assert.equal(timers.size(),0);
  }

  timers=fakeTimers();f=setup({metadata:true,timers});let releaseStorage,displayed=0;
  f.ctx.window={location:f.document.location};f.ctx.window.top=f.ctx.window;
  f.ctx.PaperLoopAutoDisplayPolicy={classifyURL:()=> 'literature',normalizeCategories:()=>({literature:true}),classifyTabInfo:()=> 'literature',shouldAutoDisplay:()=>true};
  f.ctx.browser={storage:{local:{get:()=>new Promise(resolve=>{releaseStorage=resolve;})}}};
  f.Z.PaperLoopSidebar={autoDisplay(){displayed++;}};
  f.subject._paperLoopAutoDisplay=f.realAutoDisplay;
  const storageWait=f.subject.paperLoopDetect();await nextTurn();timers.expire(20000);
  assert.equal((await storageWait).status,'timeout');releaseStorage({});await nextTurn();
  assert.equal(displayed,0,'late auto-display storage result cannot reopen the timed-out generation');
  assert.equal(f.counters().detects,0);assert.equal(timers.size(),0);
}

async function testSnapshotCaptureDeadline(){
  const timers=fakeTimers(),f=setup({metadata:true,timers});let releaseCapture;
  f.Z.SingleFile.retrievePageData=()=>new Promise(resolve=>{releaseCapture=resolve;});
  const data={url:article,libraryID:1,itemKey:'ITEM0001'};
  const capture=f.subject.paperLoopSaveSnapshot(data);const rejected=assert.rejects(capture,/快照采集超时.*重试/);
  await nextTurn();timers.expire(20000);await rejected;
  assert.equal(f.counters().saves,0,'capture timeout returns without uploading');assert.equal(timers.size(),0);
  f.Z.SingleFile.retrievePageData=async()=>'<html><body>Article text</body></html>';
  assert.equal((await f.subject.paperLoopSaveSnapshot(data)).status,'saved','capture timeout does not poison retries');
  releaseCapture('<html><body>Late old capture</body></html>');await nextTurn();
  assert.equal(f.counters().saves,1,'late timed-out capture cannot upload after a successful retry');assert.equal(timers.size(),0);
}
function assertDetectionIdle(f){
  assert.equal(f.subject._paperLoopDetectionJob,null,'completed detection releases the active job');
  assert.equal(f.subject._paperLoopDetectionRefresh,null,'completed detection releases the queued refresh');
}
async function testOuterHTMLDetectionRaces(){
  let deadline;
  try{
    await Promise.race([
      (async()=>{
        let f=setupOuterHTMLRace();
        const failedOld=f.subject.onPageLoad(true);await nextTurn();
        assert.equal(f.detections.length,1);
        f.changeDocument();
        const afterFailure=Promise.all([f.subject.paperLoopDetect(),f.subject.paperLoopDetect()]);
        assert.equal(f.detections.length,1,'changed outerHTML waits for the active copy');
        f.detections[0].reject(new Error('old offscreen detection failed'));await nextTurn();
        assert.equal(f.detections.length,2,'old failure does not poison the queued refresh');
        assert.notEqual(f.detections[1].translate.signature,f.detections[0].translate.signature,'refresh copies current outerHTML');
        f.detections[1].resolve([{label:'fresh after failure',itemType:'journalArticle'}]);
        const [,recovered]=await Promise.all([failedOld,afterFailure]);
        assert.ok(recovered.every(state=>state.status==='ready'&&state.count===1),'all queued callers receive recovered detection');
        assert.equal(f.subject.translators[0].label,'fresh after failure');assertDetectionIdle(f);

        f=setupOuterHTMLRace();
        const pageA=f.subject.onPageLoad(true);await nextTurn();f.changeDocument();
        const refreshA=f.subject.onPageLoad(true);
        const secondArticle=article+'-second';f.document.location.href=secondArticle;
        const pageB=f.subject.onPageLoad(true);await nextTurn();f.changeDocument();
        const refreshB=Promise.all([f.subject.onPageLoad(true),f.subject.onPageLoad(true)]);
        assert.equal(f.detections.length,2,'new page starts its detection while old page is pending');
        f.detections[0].resolve([{label:'stale page A',itemType:'journalArticle'}]);
        await Promise.all([pageA,refreshA]);
        assert.equal(f.detections.length,2,'leaving page A discards its queued refresh');
        assert.equal(f.subject.translators.length,0,'stale page A result cannot replace page B state');
        f.detections[1].resolve([]);await nextTurn();
        assert.equal(f.detections.length,3,'discarding A preserves the queued refresh for B');
        assert.equal(f.detections[2].translate.url,secondArticle);
        assert.notEqual(f.detections[2].translate.signature,f.detections[1].translate.signature);
        f.detections[2].resolve([{label:'current page B',itemType:'journalArticle'}]);
        await Promise.all([pageB,refreshB]);
        assert.equal(f.detections.length,3,'concurrent B requests share one fresh copy');
        assert.equal(f.subject.translators[0].label,'current page B');assertDetectionIdle(f);

        f=setupOuterHTMLRace();
        const original=f.subject.onPageLoad(true);await nextTurn();f.changeDocument();
        const firstRefresh=f.subject.onPageLoad(true);f.detections[0].resolve([]);await nextTurn();
        assert.equal(f.detections.length,2);
        f.changeDocument();
        const latestRefresh=Promise.all([f.subject.onPageLoad(true),f.subject.onPageLoad(true)]);
        assert.equal(f.detections.length,2,'another changed-page request waits for the running refresh');
        f.detections[1].resolve([]);await nextTurn();
        assert.equal(f.detections.length,3,'a change during refresh gets one additional fresh copy');
        assert.notEqual(f.detections[2].translate.signature,f.detections[1].translate.signature);
        f.detections[2].resolve([{label:'latest document',itemType:'journalArticle'}]);
        await Promise.all([original,firstRefresh,latestRefresh]);
        assert.equal(f.detections.length,3,'later concurrent requests coalesce rather than adding duplicate copies');
        assert.equal(f.subject.translators[0].label,'latest document');assertDetectionIdle(f);
      })(),
      new Promise((_,reject)=>{deadline=setTimeout(()=>reject(new Error('outerHTML detection race timed out: queued detection may be deadlocked')),5000);})
    ]);
  }finally{clearTimeout(deadline);}
}
(async()=>{
  let f=setup({appearAfter:5200});
  const states=await Promise.all([f.subject.paperLoopDetect(),f.subject.paperLoopDetect()]);
  assert.equal(states[0].status,'ready');assert.equal(f.counters().detects,1,'concurrent clicks share one detection');assert.ok(f.counters().elapsed>=5200,'fields arriving after old 4-second deadline are recognized');
  f=setup();assert.equal((await f.subject.paperLoopDetect()).status,'missing-metadata');
  f=setup({verification:true});assert.equal((await f.subject.paperLoopDetect()).status,'verification');assert.equal(f.counters().detects,0,'captcha is never translated');
  for(const title of ['基于深度学习的验证码识别研究 - 中国知网','安全验证方法研究 - 中国知网','验证码']){
    f=setup({metadata:true});f.document.title=title;
    assert.equal((await f.subject.paperLoopDetect()).status,'ready','valid article titles must not become captcha pages: '+title);
    assert.equal((await f.subject.paperLoopSaveSnapshot({url:article,libraryID:1,itemKey:'ITEM0001'})).status,'saved','valid article title does not block a snapshot');
  }
  f=setup();f.document.title='安全验证 - 中国知网';assert.equal((await f.subject.paperLoopDetect()).status,'verification','exact verification title without article metadata remains blocked');
  f=setup({verification:true,metadata:true});assert.equal((await f.subject.paperLoopDetect()).status,'verification','explicit verification route stays blocked even if fields exist');
  f=setup();let releaseOld,copies=0;
  f.subject._initTranslate=async()=>{copies++;return {ready:f.subject._paperLoopPageState().metadataReady};};
  f.Z.TranslateWeb.detect=({translate})=>copies===1?new Promise(resolve=>{releaseOld=()=>resolve([]);}):Promise.resolve(translate.ready?[{label:'CNKI',itemType:'journalArticle'}]:[]);
  const oldDetection=f.subject.onPageLoad(false);await new Promise(resolve=>setImmediate(resolve));
  assert.equal(copies,1);f.setMetadata(true);
  const refreshed=Promise.all([f.subject.paperLoopDetect(),f.subject.paperLoopDetect(),f.subject.paperLoopDetect()]);
  assert.equal(copies,1,'fresh detection waits for the stale copy rather than racing it');releaseOld();await oldDetection;
  const freshStates=await refreshed;
  assert.ok(freshStates.every(s=>s.status==='ready'&&s.count===1&&s.metadataReady),'save requests await detection of current metadata');
  assert.equal(copies,2,'changed-page concurrent requests coalesce to one fresh copy');
  f=setup({metadata:true});let releaseUnchanged;copies=0;
  f.subject._initTranslate=async()=>{copies++;return {};};
  f.Z.TranslateWeb.detect=()=>new Promise(resolve=>{releaseUnchanged=()=>resolve([{label:'CNKI',itemType:'journalArticle'}]);});
  const unchanged=f.subject.onPageLoad(true);await new Promise(resolve=>setImmediate(resolve));
  const sameState=f.subject.paperLoopDetect();releaseUnchanged();await Promise.all([unchanged,sameState]);
  assert.equal(copies,1,'unchanged-page concurrent requests still share one copy');
  f=setup();let releaseNavigated;copies=0;
  f.subject._initTranslate=async()=>{copies++;return {};};f.Z.TranslateWeb.detect=()=>new Promise(resolve=>{releaseNavigated=()=>resolve([]);});
  const beforeNavigation=f.subject.onPageLoad(false);await new Promise(resolve=>setImmediate(resolve));f.setMetadata(true);
  const queuedBeforeNavigation=f.subject.onPageLoad(true);f.document.location.href='https://example.invalid/new-page';releaseNavigated();
  await Promise.all([beforeNavigation,queuedBeforeNavigation]);assert.equal(copies,1,'queued refresh for a page left behind is discarded');
  await testOuterHTMLDetectionRaces();
  await testDetectionDeadlinesAndGenerations();
  await testSnapshotCaptureDeadline();
  f=setup({metadata:true,fail:true});assert.equal((await f.subject.paperLoopDetect()).status,'error');
  f=setup({metadata:true});let release;
  f.Z.TranslateWeb.detect=()=>new Promise(resolve=>{release=resolve;});
  const pending=f.subject.onPageLoad(true);await new Promise(resolve=>setImmediate(resolve));f.document.location.href='https://example.invalid/different';release([{label:'CNKI'}]);await pending;
  assert.equal(f.subject.translators.length,0,'results from a previous document are discarded');
  f=setup({metadata:true});let snap=await f.subject.paperLoopSaveSnapshot({url:article,libraryID:1,itemKey:'ITEM0001'});assert.equal(snap.status,'saved');
  f.native.hasSnapshot=true;assert.equal((await f.subject.paperLoopSaveSnapshot({url:article,libraryID:1,itemKey:'ITEM0001'})).status,'present');assert.equal(f.counters().captures,1,'existing snapshot is not captured again');
  f.native.hasSnapshot=false;f.Z.Connector.getPref=async()=>false;assert.equal((await f.subject.paperLoopSaveSnapshot({url:article,libraryID:1,itemKey:'ITEM0001'})).reason,'AUTOMATIC_SNAPSHOTS_DISABLED');assert.equal(f.counters().saves,1);
  f=setup({verification:true});await assert.rejects(f.subject.paperLoopSaveSnapshot({url:f.document.location.href,libraryID:1,itemKey:'ITEM0001'}),/详情页/);assert.equal(f.counters().captures,0);
  const start=background.indexOf('\tconst PAPERLOOP_TRANSLATOR_REFRESH_TIMEOUT'),end=background.indexOf('\n\tasync function _paperLoopLoadAutoDisplayCategories',start);
  const bgCtx={setTimeout,clearTimeout,URL,Promise,PaperLoopAutoDisplayPolicy:{normalizeCategories:()=>({})},_paperLoopDocumentKey:tab=>new URL(tab.url).href,
    Zotero:{debug(){},logError(){},Connector_Browser:{getTabInfo:()=>({translators:[]})},Messaging:{sendMessage:async name=>name==='paperLoopDetect'?{status:'verification',url:'https://kns.cnki.net/verify/home'}:Promise.reject(new Error('capture failed'))}}};
  vm.createContext(bgCtx);vm.runInContext(background.slice(start,end),bgCtx);
  const info=await bgCtx._paperLoopRefreshTranslatorState({id:1,url:article});assert.match(bgCtx._paperLoopDetectionError(info),/安全验证/);
  assert.equal((await bgCtx._paperLoopSupplementSnapshot({id:1,url:article},{libraryID:1,itemKey:'ITEM0001'})).status,'failed','snapshot failure is returned separately from the successful note save');
  assert.equal(await bgCtx._paperLoopSupplementSnapshot({id:1,url:'https://kns.cnki.net/kns8s/defaultresult/index'},{libraryID:1,itemKey:'ITEM0001'}),undefined,'search pages never get an article snapshot');
  console.log('CNKI recovery: metadata/offscreen/detection deadlines, retry and late-result isolation, A-B-A generations, auto-display isolation, snapshot capture deadline, delayed metadata and stale-copy races passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
