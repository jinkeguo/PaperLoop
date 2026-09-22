'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
async function scenario({item,sessionID='session',doi='',found=[]}={}){
  let writes=0;
  const Zotero={Server:{Connector:{SessionManager:{get:id=>id==='session'?{getItemByConnectorKey:key=>key==='right'?item:null}:null}}}};
  const ctx=vm.createContext({Zotero});vm.runInContext(fs.readFileSync(path.join(__dirname,'paperloop.js'),'utf8'),ctx);
  const bridge=ctx.PaperLoopDOIBridge;
  Object.assign(bridge,{
    normalizeDOI:v=>String(v||'').toLowerCase(),resolveSaveTarget:()=>({library:{libraryID:1,editable:true},editable:true}),
    findExisting:async()=>found,addToCollection:async()=>({}),upsertNote:async()=>{writes++;return{noteKey:'NOTE0001'};},findUsablePDF:async()=>null
  });
  const response=await new bridge.Endpoint().init({data:{sessionID,items:[{id:'right',DOI:doi}]}});
  assert.equal(response[0],200);return {result:JSON.parse(response[2]).items[0],writes};
}
(async()=>{
  const item={key:'ITEM0001',libraryID:1,isRegularItem:()=>true,getField:()=>''};
  assert.equal((await scenario({item})).result.itemKey,item.key);
  for(const options of [
    {item:null},{item,sessionID:'expired'},{item:{...item,deleted:true}},
    {item:{...item,libraryID:2}},{item:{...item,isRegularItem:()=>false}},
    {item,doi:'10.1234/different'}
  ]){const {result,writes}=await scenario(options);assert.equal(result.status,'new');assert.equal(writes,0);}
  const existing={...item,getField:()=> '10.1234/paper'};
  assert.equal((await scenario({sessionID:'expired',doi:'10.1234/paper',found:[existing]})).result.itemKey,item.key);
  console.log('Native session-resolution validation: 8 cases passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
