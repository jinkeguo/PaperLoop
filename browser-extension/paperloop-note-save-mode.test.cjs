'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'background.js'),'utf8');
const start=source.indexOf('\tthis.paperLoopSaveThought = async function');
const end=source.indexOf('\n\t/**',start);
assert.ok(start>=0&&end>start);
async function scenario(noteOnly,hasLink){
 const calls={translate:0,append:0,state:0};
 const ctx={Map,Promise,Error,_paperLoopSavesInFlight:new Map(),
  _paperLoopDocumentKey:tab=>tab.url,_paperLoopNoteHTML:()=>'<h1>PaperLoop 思考</h1>',
  _paperLoopReadCollections:async()=>({targets:[{targetID:'C1',libraryID:1}]}),
  _paperLoopReadLink:async()=>hasLink?{libraryID:1,itemKey:'PARENT01'}:null,
  _paperLoopWriteLink:async()=>{},_paperLoopNormalizeDOI:value=>value,
  _paperLoopFindResolution:items=>items[0],_paperLoopIsMissingItemError:()=>false,
  Zotero:{Utilities:{randomString:()=> 'test'},Connector:{async callMethod({method}){
   if(method==='paperloop/state'){calls.state++;return {status:'existing',hasPDF:false,doi:'10.1/example'};}
   if(method==='paperloop/append-note'){calls.append++;return {noteKey:'NOTE0001'};}
   throw new Error('Unexpected endpoint '+method);
  }},Connector_Browser:{getTabInfo:()=>({translators:[{label:'ScienceDirect',itemType:'journalArticle'}]}),async saveWithTranslator(){calls.translate++;return [{paperLoop:{itemKey:'PARENT01',libraryID:1}}];}}}
 };
 vm.createContext(ctx);vm.runInContext('globalThis.subject=new function(){'+source.slice(start,end)+'};',ctx);
 await ctx.subject.paperLoopSaveThought({targetID:'C1',doi:'10.1/example',noteOnly},{id:1,url:'https://www.sciencedirect.com/science/article/pii/test'},0);
 return calls;
}
(async()=>{
 assert.deepEqual(await scenario(true,true),{translate:0,append:1,state:0},'rich-note saves must not retranslate an existing paper for a missing PDF');
 assert.equal((await scenario(false,true)).translate,1,'explicit paper save must retain original PDF enrichment');
 assert.equal((await scenario(true,false)).translate,1,'first collection must still run the supplied translator');
 console.log('PaperLoop note-only save mode: 3 cases passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
