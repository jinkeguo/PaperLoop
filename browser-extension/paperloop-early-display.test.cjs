'use strict';
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const policy=require('./paperloop-auto-display-policy.js');
async function run(url,categories={literature:true,webpage:true},child=false,successful=false){
 const calls=[],window={location:{href:url}};window.top=child?{}:window;
 const context={URL,window,setTimeout,clearTimeout,instanceID:1,document:{location:window.location,title:'Test article',contentType:'text/html',querySelector:()=>null},PaperLoopAutoDisplayPolicy:policy,browser:{storage:{local:{get:async key=>({[key]:categories})}}},Zotero:{logError:()=>{},TranslateWeb:{detect:async()=>[]},Connector_Browser:{onTranslators(){}},PaperLoopSidebar:{autoDisplay:async props=>calls.push(['show',props.documentKey])}}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'inject/pageSaving.js'),'utf8'),context);
 context.Zotero.PageSaving._paperLoopWaitForMetadata=async()=>{};
 context.Zotero.PageSaving._initTranslate=async()=>{calls.push(['detect']);if(successful)return {};throw new Error('offscreen still starting');};
 await context.Zotero.PageSaving.onPageLoad();return calls;
}
(async()=>{
 for(const url of ['https://kns.cnki.net/kcms2/article/abstract?v=test','https://kns.cnki.net/kcms/detail/detail.aspx?dbcode=CJFD','https://d.wanfangdata.com.cn/details/detail.do?_type=perio&id=test']){const calls=await run(url);assert.equal(calls[0][0],'show',url+' waits for detection');assert.equal(calls[1][0],'detect');}
 for(const url of ['https://kns.cnki.net/kns8s/defaultresult/index?kw=test','https://kns.cnki.net/kns/brief/default_result.aspx','https://s.wanfangdata.com.cn/search.aspx?q=test']){const calls=await run(url);assert.equal(calls.some(x=>x[0]==='show'),false,'search auto opened');}
 for(const url of ['https://kns.cnki.net/kns8s/defaultresult/index?kw=test','https://kns.cnki.net/kns/brief/default_result.aspx'])assert.equal((await run(url,undefined,false,true)).some(x=>x[0]==='show'),false,'search remains closed when detection finishes successfully with no items');
 assert.equal((await run('https://kns.cnki.net/kcms2/article/abstract',{literature:false,webpage:true})).some(x=>x[0]==='show'),false);
 assert.equal((await run('https://kns.cnki.net/kcms2/article/abstract',undefined,true)).some(x=>x[0]==='show'),false);
 console.log('Early display: 10 cases passed (failed/empty detection, current/legacy search exclusion, preferences, iframe)');
})().catch(e=>{console.error(e);process.exitCode=1;});
