'use strict';
module.exports=async({command,evaluate})=>{
 const assert=require('node:assert/strict'),results=[];
 const run=async(name,fn)=>{try{await fn();results.push({name,ok:true});}catch(e){results.push({name,ok:false,error:e.message});}};
 const reset=async()=>evaluate(`(async()=>{Zotero.PaperLoopSidebar.close();await fixture.delay(100);delete memory['paperloop:notebookDraft:v1:'+location.href];note.setNote('<div data-schema-version="9"><h1>PaperLoop 思考</h1><p></p></div>');await fixture.uiSetup();const f=fixture.shadow.querySelector('.font');f.value='standard';f.dispatchEvent(new Event('change'));})()`);
 const add=async()=>{const rect=await evaluate(`(()=>{const b=fixture.shadow.querySelector('.flow-add');b.scrollIntoView({block:'center'});return b.getBoundingClientRect().toJSON();})()`);const x=rect.x+rect.width/2,y=rect.y+rect.height/2;await command('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',clickCount:1});await command('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',clickCount:1});};
 await run('new paragraph starts in normal body font and shows no default title',async()=>{
  await reset();await add();await command('Input.insertText',{text:'普通正文abc'});
  const state=await evaluate(`(()=>{const e=[...fixture.shadow.querySelectorAll('.paperloop-entry')].at(-1),p=e.querySelector('p'),h=e.querySelector('h3'),c=h&&getComputedStyle(h,'::before');return {text:p.textContent,font:getComputedStyle(p).fontFamily,weight:getComputedStyle(p).fontWeight,hint:h&&getComputedStyle(h).display!=='none'&&c.content!=='none'&&c.content!=='normal',html:Zotero.PaperLoopSidebar.debugState().noteHTML};})()`);
  assert.equal(state.text,'普通正文abc');assert.ok(state.font.includes('Segoe UI'));assert.equal(state.weight,'400');assert.equal(!!state.hint,false,'empty default title stays visible next to new body text');assert.ok(!state.html.includes('新的笔记'));
 });
 await run('typing continues at the same caret after automatic save',async()=>{
  await reset();await add();await command('Input.insertText',{text:'第一句'});await evaluate(`fixture.until(()=>note.getNote().includes('第一句')&&!Zotero.PaperLoopSidebar.debugState().saving&&!Zotero.PaperLoopSidebar.debugState().dirty,6000)`);await command('Input.insertText',{text:'接着输入'});
  assert.ok(await evaluate(`[...fixture.shadow.querySelectorAll('.paperloop-entry p')].some(p=>p.textContent==='第一句接着输入')`),'auto-save reset the caret or changed its paragraph');
 });
 await run('Chinese composition commits once in a new paragraph',async()=>{
  await reset();await add();await command('Input.imeSetComposition',{text:'zhong',selectionStart:5,selectionEnd:5});await command('Input.imeSetComposition',{text:'中文',selectionStart:2,selectionEnd:2});await command('Input.insertText',{text:'中文'});await command('Input.insertText',{text:'正文'});
  assert.ok(await evaluate(`[...fixture.shadow.querySelectorAll('.paperloop-entry p')].some(p=>p.textContent==='中文正文')`),'Chinese composition lost or duplicated text');
 });
 await run('first input replaces empty help without saving default text',async()=>{
  await reset();await evaluate(`(()=>{const e=fixture.shadow.querySelector('.editor');e.focus();const range=document.createRange();range.selectNodeContents(e.querySelector('p'));range.collapse(true);const sel=fixture.shadow.getSelection();sel.removeAllRanges();sel.addRange(range);})()`);await command('Input.insertText',{text:'第一次输入'});
  const state=await evaluate(`(()=>{const e=fixture.shadow.querySelector('.editor');return {helpVisible:!!fixture.shadow.querySelector('.editor-help:not([hidden])'),prompt:getComputedStyle(e,'::before').content,text:e.innerText,html:Zotero.PaperLoopSidebar.debugState().noteHTML};})()`);assert.equal(state.helpVisible,false);assert.ok(['none','normal','""'].includes(state.prompt),JSON.stringify(state));assert.ok(!/记下这一页|Ctrl \\+ V|新的笔记|段落标题/.test(state.text+state.html));await evaluate(`Zotero.PaperLoopSidebar.save()`);assert.ok(await evaluate(`!note.getNote().includes('Ctrl + V')&&note.getNote().includes('第一次输入')`));
 });
 await run('new paragraph does not inherit bold heading or handwriting when standard font is selected',async()=>{
  await reset();await evaluate(`(()=>{const e=fixture.shadow.querySelector('.editor');e.innerHTML='<h3><strong>已有加粗标题</strong></h3>';e.dispatchEvent(new Event('input'));e.focus();const range=document.createRange();range.selectNodeContents(e.querySelector('strong'));range.collapse(false);const sel=fixture.shadow.getSelection();sel.removeAllRanges();sel.addRange(range);})()`);await add();await command('Input.insertText',{text:'普通新段落'});const state=await evaluate(`(()=>{const e=[...fixture.shadow.querySelectorAll('.paperloop-entry')].at(-1),p=e.querySelector('p'),sel=fixture.shadow.getSelection(),n=sel.anchorNode.nodeType===3?sel.anchorNode.parentElement:sel.anchorNode;return {text:p.textContent,weight:getComputedStyle(n).fontWeight,font:getComputedStyle(n).fontFamily};})()`);assert.equal(state.text,'普通新段落');assert.equal(state.weight,'400');assert.ok(state.font.includes('Segoe UI'));
 });
 console.log(JSON.stringify(results,null,2));assert.ok(results.every(r=>r.ok),'typing regression failed');return results.map(r=>r.name);
};
