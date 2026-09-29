'use strict';
module.exports=async({command,evaluate})=>{
 const assert=require('node:assert/strict'),results=[];
 const reset=async()=>evaluate(`(async()=>{Zotero.PaperLoopSidebar.close();await fixture.delay(100);delete memory['paperloop:notebookDraft:v1:'+location.href];note.setNote('<div data-schema-version="9"><h1>PaperLoop 思考</h1><p></p></div>');await fixture.uiSetup();})()`);
 const measure=()=>evaluate(`(()=>{const s=fixture.shadow,e=s.querySelector('.editor'),buttons=['.flow-add','.flow-remove-current'].map(q=>s.querySelector(q).getBoundingClientRect()),help=s.querySelector('.editor-help');let bottom=e.getBoundingClientRect().bottom,helpBottom=null;if(help&&!help.hidden){helpBottom=help.getBoundingClientRect().bottom;bottom=Math.max(bottom,helpBottom);}else if(!help&&e.dataset.empty==='true'){const c=getComputedStyle(e,'::before'),probe=document.createElement('div');probe.textContent=e.dataset.placeholder;Object.assign(probe.style,{position:'absolute',top:'0',left:'0',width:e.clientWidth+'px',font:c.font,whiteSpace:'pre-line',overflowWrap:'anywhere',pointerEvents:'none'});e.append(probe);helpBottom=probe.getBoundingClientRect().bottom;bottom=Math.max(bottom,helpBottom);probe.remove();}const walker=document.createTreeWalker(e,NodeFilter.SHOW_TEXT);while(walker.nextNode()){const n=walker.currentNode;if(!n.textContent.trim()||n.parentElement.closest('.pl-ui'))continue;const range=document.createRange();range.selectNodeContents(n);for(const r of range.getClientRects())bottom=Math.max(bottom,r.bottom);}return {bottom,helpBottom,buttonTop:Math.min(...buttons.map(r=>r.top)),width:innerWidth,font:s.querySelector('.font').value};})()`);
 const check=async()=>{const r=await measure();assert.ok(r.buttonTop>=r.bottom-1,'text/help overlaps paragraph buttons: '+JSON.stringify(r));};
 await reset();
 for(const width of [1440,360])for(const font of ['standard','hand']){
  await command('Emulation.setDeviceMetricsOverride',{width,height:960,deviceScaleFactor:1,mobile:false});await evaluate(`(()=>{const f=fixture.shadow.querySelector('.font');f.value='${font}';f.dispatchEvent(new Event('change'));})()`);await check();results.push('empty-help layout '+width+' '+font);
 }
 await command('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false});await reset();
 for(const content of ['短正文','多行正文与长句自动换行。'.repeat(80),'long_unbroken_text_'.repeat(120)]){
  await evaluate(`(()=>{const e=fixture.shadow.querySelector('.editor');e.innerHTML='<p></p>';e.querySelector('p').textContent=${JSON.stringify(content)};e.dispatchEvent(new Event('input'));})()`);await check();results.push('body text stays above action row '+content.length);
 }
 await reset();await evaluate(`fixture.shadow.querySelector('.flow-add').click()`);await command('Input.insertText',{text:'新段落正文。'.repeat(60)});await check();results.push('new paragraph typing stays above actions');
 await evaluate(`fixture.shadow.querySelector('.flow-remove-current').click()`);await check();results.push('delete restores correctly sized empty-help layout');
 for(const zoom of [1.5,2]){await evaluate(`document.documentElement.style.zoom='${zoom}'`);await check();results.push('empty-help zoom '+zoom);}await evaluate(`document.documentElement.style.zoom=''`);
 const button=await evaluate(`(()=>{const b=fixture.shadow.querySelector('.flow-add');b.scrollIntoView({block:'center'});return b.getBoundingClientRect().toJSON();})()`);const x=button.x+button.width/2,y=button.y+button.height/2;await command('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',clickCount:1});await command('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',clickCount:1});assert.ok(await evaluate(`!!fixture.shadow.querySelector('.paperloop-entry')`),'action row not clickable');results.push('real click reaches new paragraph action');await reset();
 console.log(JSON.stringify(results,null,2));return results;
};
