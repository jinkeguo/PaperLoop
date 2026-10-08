'use strict';
// Save-reliability regressions: frame-targeted translate, no silent success,
// bounded save lock, messaging reset, gallery busy release, same-article URL rule.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=name=>fs.readFileSync(path.join(__dirname,name),'utf8');
const background=read('background.js');
const slice=(source,from,to)=>{const start=source.indexOf(from),end=source.indexOf(to,start+from.length);assert.ok(start>=0&&end>start,'slice '+from);return source.slice(start,end);};
const cases=[];
const test=(name,fn)=>cases.push([name,fn]);

test('PaperLoop translate targets the translator frame; standard saves still broadcast',async()=>{
	const sent=[];
	const ctx={Zotero:{Messaging:{sendMessage:async(name,args,tab,frameId)=>{sent.push(frameId);return [];}}}};
	vm.createContext(ctx);
	vm.runInContext('globalThis.subject=new function(){const tabInfo={translators:[{translatorID:"t"}],instanceID:7,translatorFrameId:3};this.getTabInfo=()=>tabInfo;'
		+slice(background,'\tthis.saveWithTranslator = function','\tthis.saveAsWebpage')+'};',ctx);
	await ctx.subject.saveWithTranslator({id:1},0,{paperLoop:{eventID:'e'}});
	await ctx.subject.saveWithTranslator({id:1},0,{});
	assert.deepEqual(sent,[3,null]);
});

test('onTranslators records the reporting frame',()=>{
	assert.match(slice(background,'\tthis.onTranslators = function','\t/**'),/translatorFrameId: frameId/);
});

test('Translator priority updates keep the matching instance and frame together',()=>{
	const info={},ctx={_tabInfo:info,_enableForTab(){},_paperLoopPublishState:async()=>{},_paperLoopMaybeAutoOpen:async()=>{},Zotero:{logError(){}}};vm.createContext(ctx);
	vm.runInContext('Zotero.Connector_Browser=new function(){this.getTabInfo=id=>_tabInfo[id]||(_tabInfo[id]={});this._updateExtensionUI=()=>{};'+slice(background,'\tthis.onTranslators = function','\t/**')+'};',ctx);
	const report=(priority,instance,frame)=>ctx.Zotero.Connector_Browser.onTranslators([{priority}],instance,'text/html',{id:1},frame);
	report(100,33,3);report(200,11,0);assert.equal(info[1].instanceID,33);assert.equal(info[1].translatorFrameId,3);
	report(100,11,0);report(100,44,4);assert.equal(info[1].instanceID,11);assert.equal(info[1].translatorFrameId,0);
});

test('Unknown translator frame cannot silently fall back to a broadcast',()=>{
	let sent=false;const ctx={Zotero:{Messaging:{sendMessage(){sent=true;}}}};vm.createContext(ctx);
	vm.runInContext('globalThis.subject=new function(){this.getTabInfo=()=>({translators:[{translatorID:"t"}],instanceID:7});'+slice(background,'\tthis.saveWithTranslator = function','\tthis.saveAsWebpage')+'};',ctx);
	assert.throws(()=>ctx.subject.saveWithTranslator({id:1},0,{paperLoop:{}}),/框架/);assert.equal(sent,false);
});

function saveThought({saveWithTranslator,fastTimers=false}){
	const calls={translate:0};
	const timers=fastTimers?{setTimeout:(fn,ms)=>setTimeout(fn,ms>=100000?20:ms),clearTimeout}:{setTimeout,clearTimeout};
	const ctx={Map,Promise,Error,Array,...timers,_paperLoopSavesInFlight:new Map(),
		_paperLoopDocumentKey:tab=>tab.url,_paperLoopNoteHTML:()=>'<h1>PaperLoop 思考</h1>',
		_paperLoopReadCollections:async()=>({targets:[{targetID:'C1',libraryID:1}]}),
		_paperLoopReadLink:async()=>null,_paperLoopWriteLink:async()=>{},_paperLoopNormalizeDOI:value=>value,
		_paperLoopFindResolution:items=>items.find(Boolean),_paperLoopRecoverResolution:async()=>null,
		_paperLoopIsMissingItemError:()=>false,_paperLoopSupplementSnapshot:async()=>undefined,
		Zotero:{Utilities:{randomString:()=>'event'},Connector:{callMethod:async()=>{throw new Error('unexpected');}},
			Connector_Browser:{getTabInfo:()=>({translators:[{label:'Wiley',itemType:'journalArticle'}]}),
				saveWithTranslator:(...args)=>{calls.translate++;return saveWithTranslator(...args);}}}};
	vm.createContext(ctx);
	vm.runInContext('globalThis.subject=new function(){'+slice(background,'\tthis.paperLoopSaveThought = async function','\n\t/**')+'};',ctx);
	const run=(extra={})=>ctx.subject.paperLoopSaveThought({targetID:'C1',deferSnapshot:true,...extra},{id:1,url:'https://example.invalid/a'},0);
	return {run,calls,inFlight:ctx._paperLoopSavesInFlight};
}

test('An empty answer from the page is an error, not a saved item',async()=>{
	const {run}=saveThought({saveWithTranslator:async()=>undefined});
	await assert.rejects(run(),/没有返回保存结果/);
});

test('An empty translated item array must not report success',async()=>{
	const {run}=saveThought({saveWithTranslator:async()=>[]});
	await assert.rejects(run(),/没有返回保存结果/);
});

test('A retry with a different note or target must not consume an old save result',async()=>{
	let finish;const {run,calls}=saveThought({fastTimers:true,saveWithTranslator:()=>new Promise(resolve=>{finish=resolve;})});
	const first=run({thought:'old draft'});
	first.catch(()=>{});
	await new Promise(resolve=>setTimeout(resolve,0));
	try{await assert.rejects(run({thought:'new draft',targetID:'C2'}),/上一笔/);}
	finally{finish([{paperLoop:{status:'existing',itemKey:'ITEM0001',libraryID:1}}]);}
	await first;assert.equal(calls.translate,1);
});

test('A stalled save times out, keeps its lock for retries, then releases it',async()=>{
	let finish;
	const {run,calls,inFlight}=saveThought({fastTimers:true,saveWithTranslator:()=>new Promise(resolve=>{finish=resolve;})});
	await assert.rejects(run(),/3 分钟/);
	assert.equal(inFlight.size,1,'lock kept while the page may still be saving');
	await assert.rejects(run(),/3 分钟/);
	assert.equal(calls.translate,1,'retry joins the running save instead of starting a duplicate');
	finish([{paperLoop:{status:'existing',itemKey:'ITEM0001',libraryID:1}}]);
	await new Promise(resolve=>setTimeout(resolve,0));
	assert.equal(inFlight.size,0,'lock released once the save settles');
});

test('Messaging reset fails requests that were waiting for a reply',async()=>{
	const ctx={Zotero:{Utilities:{randomString:()=>String(Math.random())}},console};
	vm.createContext(ctx);vm.runInContext(read('messagingGeneric.js'),ctx);
	const messaging=new ctx.Zotero.MessagingGeneric({sendMessage(){},addMessageListener(){}});
	const pending=messaging.sendMessage('Translate.translate',[]);
	messaging.reinit({sendMessage(){},addMessageListener(){}});
	await assert.rejects(pending,/reset before a response/);
});

test('Messaging send rejection and synchronous throw both release pending replies',async()=>{
	for(const sendMessage of [()=>Promise.reject(new Error('disconnected')),()=>{throw new Error('disconnected');}]){
		const ctx={Zotero:{Utilities:{randomString:()=>String(Math.random())}},console};vm.createContext(ctx);vm.runInContext(read('messagingGeneric.js'),ctx);
		const messaging=new ctx.Zotero.MessagingGeneric({sendMessage,addMessageListener(){}});
		await assert.rejects(messaging.sendMessage('test',[]),/disconnected/);assert.equal(Object.keys(messaging._responseListeners).length,0);
	}
});

test('Hidden iframe timeout settles even when injection and cleanup never reply',async()=>{
	const ctx={Zotero:{debug(){},getExtensionURL:()=>'',BrowserAttachmentMonitor:{}},browser:{runtime:{onMessage:{addListener(){},removeListener(){}}},scripting:{executeScript:()=>new Promise(()=>{})}},setTimeout:(fn,ms)=>setTimeout(fn,ms>=20000?10:ms),clearTimeout};
	vm.createContext(ctx);vm.runInContext(read('botBypass.js'),ctx);
	await assert.rejects(ctx.Zotero.BotBypass.passJSDetectionViaHiddenIframe('https://example.invalid/pdf',{id:1},'application/pdf'),/timed out/);
});

test('A timed-out snapshot reports failure and its late capture cannot save',async()=>{
	let finish,saved=0;const statuses=[];
	const ctx={Zotero:{logError(){},SingleFile:{retrievePageData:()=>new Promise(resolve=>{finish=resolve;})},Connector:{saveSingleFile:async()=>{saved++;}}},setTimeout:(fn,ms)=>setTimeout(fn,ms>=60000?10:ms),clearTimeout};
	vm.createContext(ctx);vm.runInContext(read('itemSaver.js'),ctx);
	const saver=new ctx.Zotero.ItemSaver({sessionID:'test'});saver._items=[{url:'https://example.invalid/article'}];saver._snapshotAttachment={title:'snapshot'};
	await saver._executeSingleFile((_,status)=>statuses.push(status));assert.deepEqual(statuses,[0,false]);
	finish('<html>late capture</html>');await new Promise(resolve=>setTimeout(resolve,0));assert.equal(saved,0);
});

test('Gallery busy state set from a pending list is released by a later list',()=>{
	const ctx={Zotero:{}};vm.createContext(ctx);vm.runInContext(read('inject/paperLoopGallery_inject.js'),ctx);
	const busy=[];
	const gallery=Object.assign(Object.create(ctx.Zotero.PaperLoopGallery.prototype),
		{options:{onBusy:value=>busy.push(value)},selected:new Set(),seen:new Set(),render(){}});
	gallery.setPending([{id:'a',status:'saving'}]);
	assert.equal(gallery.busy,true);
	gallery.setPending([{id:'a',status:'pending'}]);
	assert.equal(gallery.busy,false);
	assert.deepEqual(busy,[true,false]);
	gallery.busy=true;gallery.pendingBusy=false;
	gallery.setPending([]);
	assert.equal(gallery.busy,true,'a lock owned by an explicit save is not released by the list');
	gallery.progressData={done:0,total:1,finished:false};gallery.setPending([]);assert.equal(gallery.busy,false,'lost final progress must recover from the pending list');
	gallery.busy=true;gallery.localBusy=true;gallery.progressData={finished:false};gallery.setPending([]);assert.equal(gallery.busy,true,'polling must not release a local request lock');
});

test('Same-article URL rule matches in the sidebar and the background',()=>{
	const extract=(file,pattern)=>{const match=read(file).match(pattern);assert.ok(match,file);return vm.runInNewContext('('+match[1]+')',{URL});};
	const background=extract('paperloop-images.js',/const sameDocument = (\(a,b\) => \{[\s\S]*?\n\t\});/);
	const sidebar=extract('inject/paperLoopSidebar_inject.js',/(function sameDocument\(a, b\) \{[\s\S]*?\n\t\})/);
	const rows=[
		['https://www.sciencedirect.com/science/article/pii/S1','https://www.sciencedirect.com/science/article/pii/S1?via%3Dihub',true],
		['https://x.org/a?id=1&via=ihub','https://x.org/a?id=1',true],
		['https://kns.cnki.net/kcms2/article/abstract?v=AAA','https://kns.cnki.net/kcms2/article/abstract?v=BBB',false],
		['https://onlinelibrary.wiley.com/doi/abs/10.1/x','https://onlinelibrary.wiley.com/doi/full/10.1/x',false],
		['https://a.org/p','https://b.org/p',false]
		,['https://x.org/article','https://x.org/article?id=2',false]
		,['https://x.org/article?id=1','https://x.org/article',false]
		,['https://x.org/article?v=AAA','https://x.org/article?v=AAA&v=BBB',false]
		,['https://x.org/article?id=1','https://x.org/article?id=1&utm_source=mail',true]
		,['https://x.org/article?utm_source=one','https://x.org/article?utm_source=two',true]
	];
	for(const [a,b,expected] of rows){
		assert.equal(background(a,b),expected,'background '+a+' -> '+b);
		assert.equal(sidebar(a,b),expected,'sidebar '+a+' -> '+b);
	}
});

test('A failed save on a robot-check page says to complete the check, not the translator error',()=>{
	const source=read('inject/paperLoopSidebar_inject.js');
	const lines=['const errorText','const botCheckPage','const saveErrorText'].map(name=>{const line=source.split('\n').find(l=>l.trim().startsWith(name+' ='));assert.ok(line,name);return line;});
	assert.match(source,/message\(saveErrorText\(e\),'error'\);if\(e\.status===409\)/);
	const check=(title,path,body)=>vm.runInNewContext(lines.join('\n')+';saveErrorText(new Error("Could not scrape metadata via known methods"))',
		{t:zh=>zh,document:{title,body:{innerText:body}},location:{pathname:path}});
	assert.match(check('请稍候…','/science/article/pii/S1','Are you a robot?'),/人机验证/);
	assert.match(check('安全验证','/verify/home',''),/人机验证/);
	assert.match(check('Just a moment...','/a',''),/人机验证/);
	assert.equal(check('Deep learning in neural networks - ScienceDirect','/science/article/pii/S1','Abstract'),'Could not scrape metadata via known methods');
});

(async()=>{
	let failed=0;
	for(const [name,fn] of cases){
		try{await fn();console.log('PASS',name);}
		catch(error){failed++;console.log('FAIL',name);console.log(error);}
	}
	assert.equal(failed,0,failed+' save-reliability cases failed');
	console.log('Save reliability: '+cases.length+' cases passed (in-memory doubles, not live websites)');
})();
