'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const background=fs.readFileSync(__dirname+'/background.js','utf8');
const messaging=fs.readFileSync(__dirname+'/messaging.js','utf8');
const start=background.indexOf('\tconst PAPERLOOP_TRANSLATOR_REFRESH_TIMEOUT');
const end=background.indexOf('\n\tasync function _paperLoopLoadAutoDisplayCategories',start);
const tab={id:1,url:'https://kns.cnki.net/kcms2/article/abstract?v=test'},identity={libraryID:1,itemKey:'ITEM0001'};
function setup(send){
 const timers=new Map();let id=0,calls=0;
 const ctx={URL,Promise,setTimeout:(fn,ms)=>{const key=++id;timers.set(key,{fn,ms});return key;},clearTimeout:key=>timers.delete(key),
  PaperLoopAutoDisplayPolicy:{normalizeCategories:()=>({})},browser:{tabs:{sendMessage:async(...args)=>{calls++;return send(...args);}}},
  Zotero:{debug(){},logError(){},Connector_Browser:{getTabInfo:()=>({translators:[]})}}};
 vm.createContext(ctx);vm.runInContext(messaging,ctx);vm.runInContext(background.slice(start,end),ctx);
 return {ctx,timers,calls:()=>calls,save:()=>ctx.paperLoopSupplementSnapshot(tab,identity)};
}
(async()=>{
 for(const response of [undefined,null,{}, {status:'saved'}, {status:'saved',attachmentKey:'invalid'}, {status:'skipped',reason:'PAGE_CHANGED'}]){
  const f=setup(async()=>response),result=await f.save();assert.equal(result.status,'failed','unconfirmed capture must not report success');assert.match(result.message,/笔记已保存/);assert.equal(f.timers.size,0);
 }
 const missing=setup(async()=>{throw new Error('Could not establish connection. Receiving end does not exist.');});
 assert.equal((await missing.save()).status,'failed','actual Messaging swallow of transport error is handled');
 for(const response of [{status:'saved',attachmentKey:'SNAP0001'},{status:'present',attachmentKey:'SNAP0001'},{status:'skipped',reason:'AUTOMATIC_SNAPSHOTS_DISABLED'},{status:'skipped',reason:'FILES_NOT_EDITABLE'}]){
  const f=setup(async()=>response);assert.deepEqual(await f.save(),response);assert.equal(f.timers.size,0);
 }
 let release,attempt=0;const f=setup(()=>++attempt===1?new Promise(resolve=>release=resolve):{status:'saved',attachmentKey:'SNAP0002'});
 const blocked=f.save();await Promise.resolve();const timer=[...f.timers.values()].find(t=>t.ms===45000);assert.ok(timer,'complete RPC deadline exists');timer.fn();
 assert.equal((await blocked).status,'failed');assert.equal(f.timers.size,0);
 assert.equal((await f.save()).attachmentKey,'SNAP0002','retry proceeds after timeout');release({status:'saved',attachmentKey:'SNAP0001'});await Promise.resolve();
 const ignored=setup(()=>{throw new Error('should not capture search page');});
 assert.equal(await ignored.ctx.paperLoopSupplementSnapshot({...tab,url:'https://kns.cnki.net/kns8s/defaultresult/index'},identity),undefined);assert.equal(ignored.calls(),0);
 assert.match(ignored.ctx._paperLoopDetectionError({paperLoopDetection:{status:'timeout'}}),/重新识别/);
 console.log('Snapshot transport: actual messaging disconnect, malformed/empty replies, bounded wait, retry and explicit acknowledgements passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
