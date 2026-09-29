'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(__dirname+'/notebook.js','utf8');
function fixture(version='7.0.32'){
 let html='base',live='base',failSave=false;
 const element={isConnected:true,value:'true',getAttribute(){return this.value},setAttribute(_,v){this.value=v},removeAttribute(){this.value=null}};
 const note={id:1,getNote(){return html},setNote(v){html=v},async saveTx(){if(failSave)throw Error('disk error');}};
 const editor={_item:note,_readOnly:false,_disableSaving:false,
  _iframeWindow:{wrappedJSObject:{getDataSync(){return {html:live}}},document:{querySelector(){return element}}},
  async _save(data){note.setNote(data.html)}
 };
 const context={Zotero:{version,Notes:{_editorInstances:[editor],AUTO_SYNC_DELAY:15}}};
 vm.runInNewContext(source,context);
 return {bridge:context.PaperLoopNotebook,note,editor,element,context,setLive(v){live=v},fail(){failSave=true}};
}
(async()=>{
 {const f=fixture();f.setLive('native unsaved');const snapshots=await f.bridge.flushLegacyEditor(f.note);assert.equal(f.note.getNote(),'native unsaved');await f.bridge.commitHTML(f.note,'merged','native unsaved',snapshots);assert.equal(f.note.getNote(),'merged');assert.equal(f.editor._disableSaving,true);assert.equal(f.element.value,'true');}
 {const f=fixture();const snapshots=await f.bridge.flushLegacyEditor(f.note);f.setLive('typed while validating');await assert.rejects(f.bridge.commitHTML(f.note,'browser','base',snapshots),e=>e.status===409);assert.equal(f.note.getNote(),'base');assert.equal(f.editor._disableSaving,false);}
 {const f=fixture();const snapshots=await f.bridge.flushLegacyEditor(f.note);f.fail();await assert.rejects(f.bridge.commitHTML(f.note,'browser','base',snapshots),/disk error/);assert.equal(f.editor._disableSaving,false);assert.equal(f.element.value,'true');}
 {const f=fixture();f.context.Zotero.Notes._editorInstances.push({...f.editor});assert.equal((await f.bridge.flushLegacyEditor(f.note)).length,2);}
 {const f=fixture();f.context.Zotero.Notes._editorInstances.push({...f.editor,_iframeWindow:{document:f.editor._iframeWindow.document,wrappedJSObject:{getDataSync(){return {html:'different native draft'}}}}});await assert.rejects(f.bridge.flushLegacyEditor(f.note),e=>e.status===409);assert.equal(f.note.getNote(),'base');}
 for(const version of ['8.0.4','9.0.6','10.0.3']){const f=fixture(version);assert.equal((await f.bridge.flushLegacyEditor(f.note)).length,0);await f.bridge.commitHTML(f.note,'new','base');assert.equal(f.editor._disableSaving,false);}
 console.log('Native editor coordination: unsaved edits, concurrent typing, save failure, multiple windows, and 8–10 isolation passed');
})().catch(error=>{console.error(error);process.exitCode=1});
