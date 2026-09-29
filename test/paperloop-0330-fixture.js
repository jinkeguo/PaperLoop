/* Regression for local screenshots leaking native image metadata into note text. */
fixture.metadataTests=async()=>{
 const ui=Zotero.PaperLoopSidebar,s=()=>fixture.shadow,a=fixture.assert,start=fixture.tests.length;
 const reopen=async html=>{ui.close();await fixture.delay(100);delete memory['paperloop:notebookDraft:v1:'+location.href];if(html!==undefined)note.setNote(html);await fixture.uiSetup();};
 await fixture.test('class-stripped native image metadata does not become editable paragraphs',async()=>{
  const key=attachments[0].key;await reopen('<div data-schema-version="9"><h1>PaperLoop 思考</h1><p>需要保留的正文</p><p><img data-attachment-key="'+key+'" alt="image" width="621" height="273"></p><p>image · 621 × 273</p><p><a href="https://www.sciencedirect.com/science/article/pii/S0957417424010339">↗ 图片来源</a></p><p>我的记录：621 × 273</p></div>');
  a(!ui.debugState().thought.includes('image · 621 × 273')&&!ui.debugState().thought.includes('图片来源'),'generated metadata leaked into editor');a(ui.debugState().thought.includes('我的记录：621 × 273'),'user measurements removed');await ui.save();a(!note.getNote().includes('↗ 图片来源')&&!note.getNote().includes('image · 621 × 273'),'generated metadata saved as body');
 });
 await fixture.test('previously saved metadata-only rows are repaired without deleting user measurements',async()=>{
  const row=html=>'<tr><td><div>'+html+'</div></td><td><p></p></td></tr>';await reopen('<div data-schema-version="9"><h1>PaperLoop 思考</h1><table><tbody><tr><th>PaperLoop · 笔记</th><th>关联图片</th></tr>'+row('<p>image · 621 × 273</p>')+row('<p><a href="https://example.org/article">↗ 图片来源</a></p>')+row('<p>image · 621 × 273 是我记录的尺寸，请保留</p>')+'</tbody></table><h2>未关联图片</h2><h3>图 1 · image</h3><p><img data-attachment-key="'+attachments[0].key+'" alt="image"></p></div>');a(!ui.debugState().thought.includes('图片来源')&&ui.debugState().thought.includes('是我记录的尺寸，请保留'),'legacy row cleanup failed or removed user text');await ui.save();a(!note.getNote().includes('↗ 图片来源')&&note.getNote().includes('是我记录的尺寸，请保留'),'legacy repair not saved');
 });
 await fixture.test('clipboard and file input save cleanly when Zotero strips generated classes',async()=>{
  const original=PaperLoopNotebook.sanitize,prior=fixture.beforeImage;let localCalls=0;
  PaperLoopNotebook.sanitize=async function(...args){const html=await original.apply(this,args),doc=new DOMParser().parseFromString(html,'text/html');doc.querySelectorAll('.paperloop-image-caption,.paperloop-image-source').forEach(n=>n.removeAttribute('class'));return doc.body.innerHTML;};
  fixture.beforeImage=async data=>{localCalls++;a(!data.pageURL&&!data.imageURL,'screenshot falsely uses current website as image source');};
  try{
   for(const mode of ['paste','file']){
    await reopen('<div data-schema-version="9"><h1>PaperLoop 思考</h1><p></p></div>');
    const canvas=document.createElement('canvas');canvas.width=621;canvas.height=273;canvas.getContext('2d').fillStyle=mode==='paste'?'#d84a3f':'#54a87a';canvas.getContext('2d').fillRect(0,0,621,273);const blob=await new Promise(r=>canvas.toBlob(r));const dt=new DataTransfer();dt.items.add(new File([blob],mode==='paste'?'image.png':'本地截屏.png',{type:'image/png'}));
    if(mode==='paste')s().querySelector('.editor').dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}));else{const input=s().querySelector('.image-files');input.files=dt.files;input.dispatchEvent(new Event('change'));}
    await fixture.until(()=>ui.debugState().pendingCount===1&&!s().querySelector('.image-import').disabled);await ui.save();
    a(!ui.debugState().thought.includes('×')&&!ui.debugState().thought.includes('图片来源'),'local media leaked metadata into editor');a(!/621\s*×\s*273|↗ 图片来源/.test(note.getNote()),'local metadata persisted');a(ui.debugState().images===1,'image lost');await reopen();a(ui.debugState().images===1&&!/621\s*×\s*273|图片来源/.test(ui.debugState().thought),'reopen leaked metadata');
   }
   a(localCalls===2,'test did not reach native image endpoint twice');
  }finally{PaperLoopNotebook.sanitize=original;fixture.beforeImage=prior;}
 });
 await fixture.test('empty-note help explains screenshot paste and local files without saving instructions',async()=>{
  await reopen('<div data-schema-version="9"><h1>PaperLoop 思考</h1><p></p></div>');const editor=s().querySelector('.editor'),help=s().querySelector('.editor-help');a(help.textContent.includes('Win + Shift + S')&&help.textContent.includes('Ctrl + V')&&help.textContent.includes('添加图片'),'screenshot instructions missing');a(!help.hidden&&help.getBoundingClientRect().height>0,'help is not visible');a(!editor.contains(help)&&!ui.debugState().noteHTML.includes('Ctrl + V'),'instructions persisted into note');
 });
 return fixture.tests.slice(start);
};
