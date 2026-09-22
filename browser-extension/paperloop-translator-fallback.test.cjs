'use strict';
// Runs production fallback/save glue with in-memory transport and library doubles.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = name => fs.readFileSync(path.join(__dirname, name), 'utf8');

async function scenario({label='ScienceDirect', doi=true, existing=false, oldSession=false, allFail=false, saveFail=false, oldPlugin=false}={}) {
  const records=[], sessions=new Map(), calls=[], notices=[];
  const page='https://example.invalid/paper/1';
  const library={libraryID:1,editable:true,filesEditable:false,treeViewID:'L1'};
  const collection={treeViewID:'C7',libraryID:1};
  const nativeZotero={Server:{Connector:{SessionManager:{get:id=>sessions.get(id)}}}};
  const native=vm.createContext({Zotero:nativeZotero,console});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../zotero-plugin/paperloop.js'),'utf8'),native);
  const bridge=native.PaperLoopDOIBridge;
  Object.assign(bridge,{
    normalizeDOI:value=>String(value||'').toLowerCase(),
    resolveSaveTarget:()=>({library,collection,editable:true}),
    findExisting:async(id,value)=>records.filter(item=>item.libraryID===id&&item.DOI===value),
    addToCollection:async item=>{item.collection='C7';return {collectionAdded:true};},
    upsertNote:async(item,html)=>{if(!item.note)item.note=html;return {noteKey:'NOTE'+item.key};},
    findUsablePDF:async()=>null
  });
  function record(json){const item={...json,libraryID:1,key:'ITEM'+String(records.length+1).padStart(4,'0'),isRegularItem:()=>true,getField(field){return this[field]||'';}};records.push(item);return item;}
  if(existing)record({DOI:'10.1234/fallback',title:'Already saved',note:'<h1>PaperLoop 思考</h1>'});
  let counter=0,link=null;
  const primary={translatorID:'specific',label,itemType:'journalArticle'};
  const secondary={translatorID:'embedded',label:'Embedded Metadata',itemType:'journalArticle'};
  let selected;
  const fakeTranslate={
    setHandler(){},setDocument(){},setLocation(){},setCookieSandbox(){},
    setTranslator(translator){selected=translator;},getProxy:async()=>null,
    async translate(){calls.push('translator:'+selected.label);if(selected===primary||allFail)throw new Error('translator failed');return [{id:'connector1',itemType:'journalArticle',title:'Fallback paper',DOI:doi?'10.1234/fallback':'',url:page,notes:[],attachments:[]}];}
  };
  const Z={
    isManifestV3:true,isSafari:false,debug(){},logError(){},getString:s=>s,getExtensionURL:s=>s,
    Translate:{ItemSaver:function(){}},Proxy:function(){},
    Promise:{delay:async()=>{}},ItemTypes:{getImageSrc:s=>s},
    Utilities:{randomString:()=>String(++counter),deepCopy:v=>JSON.parse(JSON.stringify(v)),cleanTags:s=>s},
    Messaging:{sendMessage:async(name,value)=>{notices.push([name,value]);}},
    Inject:{checkActionToServer:async()=>true},
    Connector:{getPref:async()=>false,async callMethod(options,data){
      const method=typeof options==='string'?options:options.method;calls.push(method);
      if(method==='paperloop/resolve'){
        const response=await new bridge.Endpoint().init({data});
        const result=JSON.parse(response[2]);if(response[0]!==200)throw new Error(result.error);if(oldPlugin)delete result.sessionResolution;return result;
      }
      if(method==='saveItems'){
        if(saveFail)throw new Error('saveItems failed');
        if(sessions.has(data.sessionID))throw new Error('SESSION_EXISTS');
        const mapped=new Map(data.items.map(item=>[item.id,record(item)]));
        sessions.set(data.sessionID,{getItemByConnectorKey:id=>mapped.get(id)});return {};
      }
      if(method==='updateSession')return {};
      if(method==='getSelectedCollection')return {filesEditable:false};
      if(method==='paperloop/append-note')return {noteKey:'NOTE'+data.itemKey,itemKey:data.itemKey,libraryID:1};
      throw new Error('Unexpected endpoint '+method);
    }},
    Connector_Browser:{getTabInfo:()=>({translators:[primary,secondary]})}
  };
  const ctx=vm.createContext({Zotero:Z,console,URL,setTimeout,clearTimeout,document:{location:{href:page},contentType:'text/html'},
    _paperLoopSavesInFlight:new Map(),_paperLoopDocumentKey:tab=>tab.url,
    _paperLoopReadCollections:async()=>({targets:[{targetID:'C7',libraryID:1}]}),
    _paperLoopReadLink:async()=>link,_paperLoopWriteLink:async(key,value)=>{link=value;},
    _paperLoopNoteHTML:()=>'<h1>PaperLoop 思考</h1>',_paperLoopIsMissingItemError:()=>false
  });
  for(const filename of ['translateWeb.js','itemSaver.js','inject/pageSaving.js'])vm.runInContext(read(filename),ctx,{filename});
  Z.PageSaving._initTranslate=async()=>fakeTranslate;
  Z.PageSaving.translators=[primary,secondary];
  if(oldSession){Z.PageSaving.sessionDetails={id:'previous',url:page,translatorID:'specific',saveOptions:{}};sessions.set('previous',{getItemByConnectorKey:()=>null});}
  Z.Connector_Browser.saveWithTranslator=(tab,index,options)=>Z.PageSaving.onTranslate(primary.translatorID,options);
  const source=read('background.js');
  const helpers=source.slice(source.indexOf('\tfunction _paperLoopNormalizeDOI('),source.indexOf('\tfunction _paperLoopPanelState('));
  vm.runInContext(helpers,ctx);
  const start=source.indexOf('\tthis.paperLoopSaveThought = async function');
  const end=source.indexOf('\n\t/**',start);
  vm.runInContext('globalThis.subject=new function(){'+source.slice(start,end)+'};',ctx);
  const save=()=>ctx.subject.paperLoopSaveThought({targetID:'C7',documentKey:page,noteOnly:true},{id:1,url:page},0);
  if(allFail||saveFail||oldPlugin){await assert.rejects(save(),oldPlugin?/0\.5\.4/:/failed/);assert.equal(link,null);assert.equal(records.length,0);return {calls,records,notices};}
  const result=await save();
  assert.ok(result.itemKey,'fallback must return the actual saved Zotero item key, including without a DOI');
  assert.equal(link.itemKey,result.itemKey,'browser must retain the native association');
  assert.equal(records.length,1,'only one parent item should exist');
  assert.ok(records[0].note,'PaperLoop note must exist');
  assert.equal(records[0].collection,'C7','selected collection must survive fallback');
  await save();
  assert.equal(records.length,1,'second note save must reuse the associated item');
  assert.equal(calls.filter(x=>x==='translator:'+label).length,1,'second note save must not retranslate');
  assert.equal(calls.filter(x=>x==='translator:Embedded Metadata').length,1);
  assert.equal(notices.filter(([name,value])=>name==='progressWindow.error'&&value[0]==='fallback').length,1);
  return {calls,records,notices};
}

(async()=>{
  const cases=[
    ['ScienceDirect fallback with DOI',{}],
    ['ScienceDirect fallback without DOI',{doi:false}],
    ['CNKI fallback without DOI',{label:'CNKI',doi:false}],
    ['Wanfang fallback without DOI',{label:'Wanfang',doi:false}],
    ['Existing DOI reuse after fallback',{existing:true}],
    ['Previous standard save session does not leak',{oldSession:true}],
    ['All translators fail without a fake success',{allFail:true}],
    ['Native save failure is propagated',{saveFail:true}],
    ['Old plugin is detected before saving a DOI-less item',{oldPlugin:true,doi:false}]
  ];
  let failed=0;
  for(const [name,options] of cases){try{await scenario(options);console.log('PASS '+name);}catch(error){failed++;console.error('FAIL '+name+': '+error.message);}}
  assert.equal(failed,0,`${failed} fallback regression cases failed`);
  console.log('Translator fallback/save integration: 9 cases passed (transport/library doubles, not live websites)');
})().catch(error=>{console.error(error.message);process.exitCode=1;});
