/* Test-only: refuses to run against any personal profile or data directory. */
async function startup(addonData) {
  await Zotero.initializationPromise;
  const profile=Services.dirsvc.get('ProfD',Ci.nsIFile),root=profile.parent;
  const normalize=value=>String(value).replace(/\\/g,'/').toLowerCase();
  if(!/^paperloop-native-test-[a-f0-9-]+$/.test(root.leafName)||profile.leafName!=='profile'
    ||normalize(Zotero.DataDirectory.dir)!==normalize(root.path+'/data'))return;
  const result={ok:false,host:Zotero.version,tests:[]};
  let editor;
  const check=(value,label)=>{if(!value)throw new Error(label);result.tests.push(label);};
  try {
    for(let i=0;i<200&&!Zotero.Server.Endpoints['/connector/paperloop/notebook'];i++)await Zotero.Promise.delay(100);
    const Resolve=Zotero.Server.Endpoints['/connector/paperloop/resolve'];
    const Notebook=Zotero.Server.Endpoints['/connector/paperloop/notebook'];
    const request=async(Type,data)=>{const response=await new Type().init({data});if(response[0]!==200)throw new Error(JSON.stringify(response));return JSON.parse(response[2]);};
    check(!!Resolve&&!!Notebook,'packaged plugin endpoints loaded');
    const lib=Zotero.Libraries.userLibraryID,target='L'+lib;
    const collection=new Zotero.Collection();collection.libraryID=lib;collection.name='Isolated fallback collection';await collection.saveTx();
    const targetID='C'+collection.id;
    const sessionID=Zotero.Utilities.randomString(24),id='fallback-no-doi';
    const incoming={id,itemType:'journalArticle',title:'Isolated Embedded Metadata fallback without DOI',url:'https://example.invalid/fallback',creators:[],tags:[],notes:[],attachments:[]};
    const base={eventID:Zotero.Utilities.randomString(24),targetID,note:'<h1>PaperLoop 思考</h1>',items:[incoming]};
    const before=await request(Resolve,base);
    check(before.sessionResolution&&before.items[0].status==='new','no-DOI item is not guessed before saving');
    const session=Zotero.Server.Connector.SessionManager.create(sessionID,'saveItems',{data:{sessionID,uri:incoming.url,items:[incoming]},headers:{}});
    await session.update(target);await session.saveItems(target);await session.update(targetID);
    const item=session.getItemByConnectorKey(id);
    check(item?.isRegularItem()&&!item.getField('DOI'),'real Connector session saves DOI-less metadata');
    const resolved=await request(Resolve,{...base,sessionID});
    const identity=resolved.items[0];
    check(identity.itemKey===item.key&&identity.libraryID===lib&&!!identity.noteKey,'session identity resolves native parent and PaperLoop note');
    check(item.getCollections().includes(collection.id),'selected collection is retained');
    const repeated=await request(Resolve,{...base,sessionID});
    check(repeated.items[0].noteKey===identity.noteKey&&item.getNotes().length===1,'repeating resolution reuses one note');
    const invalid=await request(Resolve,{...base,sessionID,items:[{...incoming,id:'wrong-connector-key'}]});
    check(invalid.items[0].status==='new','unrelated connector key is not linked by title');
    const expired=await request(Resolve,{...base,sessionID:'nonexistent-session'});
    check(expired.items[0].status==='new','missing session does not guess a parent');
    const win=Zotero.getMainWindow(),canvas=win.document.createElementNS('http://www.w3.org/1999/xhtml','canvas');canvas.width=160;canvas.height=100;canvas.getContext('2d').fillRect(0,0,160,100);
    const nativeTarget={libraryID:lib,itemKey:item.key};
    let state=await request(Notebook,{...nativeTarget,action:'add-image',base64:canvas.toDataURL('image/png').split(',')[1],width:160,height:100,caption:'Fallback figure'});
    const html='<div data-schema-version="9"><h1>PaperLoop 思考</h1><table><tbody><tr><th data-colwidth="330"><p>PaperLoop · 笔记</p></th><th data-colwidth="270"><p>关联图片</p></th></tr><tr><td data-colwidth="330"><p>Saved after translator fallback</p></td><td data-colwidth="270"><p><img data-attachment-key="'+state.imageKey+'" width="160" height="100"></p></td></tr></tbody></table></div>';
    state=await request(Notebook,{...nativeTarget,action:'save',baseHTML:state.noteHTML,noteHTML:html});
    const note=await Zotero.Items.getByLibraryAndKeyAsync(lib,state.noteKey);
    check(note.getNote().includes('Saved after translator fallback')&&note.getAttachments().length===1,'DOI-less saved parent accepts real text and image note');
    editor=win.document.createXULElement('note-editor');editor.style.cssText='position:fixed;left:0;top:0;width:1000px;height:800px';win.document.documentElement.append(editor);editor.mode='edit';editor.item=note;
    await editor._initPromise;await Zotero.Promise.delay(500);
    const iw=editor._editorInstance._iframeWindow.wrappedJSObject,cells=[...iw.document.querySelector('.ProseMirror table').rows[0].cells];
    const widths=cells.map(cell=>cell.getBoundingClientRect().width);result.widths=widths;
    check(cells.length===2&&iw.document.querySelector('.ProseMirror img'),'real native editor retains two-column structure and image');
    if(widths.every(width=>width>0))check(Math.abs(widths[0]/widths[1]-330/270)<.12,'visible native columns retain 55:45 geometry');
    else result.geometryNotMeasured='Test window is hidden; DOM/content checks only';
    editor.remove();editor=null;
    const scope={Zotero:{},document:new win.DOMParser().parseFromString('<body></body>','text/html'),DOMParser:win.DOMParser,crypto:win.crypto};
    for(const name of ['paperLoopFlow_inject.js','paperLoopSync_inject.js'])Services.scriptloader.loadSubScript(addonData.rootURI+name,scope);
    const keys=[new win.DOMParser().parseFromString(note.getNote(),'text/html').querySelector('img').getAttribute('data-attachment-key')];
    for(const color of ['#ad623b','#6487a3']){canvas.getContext('2d').fillStyle=color;canvas.getContext('2d').fillRect(0,0,160,100);state=await request(Notebook,{...nativeTarget,action:'add-image',base64:canvas.toDataURL('image/png').split(',')[1],width:160,height:100,caption:'Sync fixture'});keys.push(state.imageKey);}
    const makeFlow=html=>{const flow=Object.create(scope.Zotero.PaperLoopFlow.prototype);Object.assign(flow,{editor:scope.document.createElement('div'),store:scope.document.createElement('div'),mapping:{},update(){}});flow.editor.innerHTML=html;flow.reset();return flow;};
    const source='<div class="paperloop-entry pl-entry-native-test pl-ref-'+keys[0]+' pl-ref-'+keys[1]+'"><h3>First paragraph</h3><p><strong>Native base text</strong></p></div><div class="paperloop-entry pl-ref-'+keys[2]+'"><h3>Second paragraph</h3><p>Browser base text</p></div>'+keys.map((key,i)=>'<p><img data-attachment-key="'+key+'" alt="Test image '+i+'" width="160" height="100"></p>').join('');
    state=await request(Notebook,{...nativeTarget,action:'save',baseHTML:state.noteHTML,noteHTML:'<div data-schema-version="9"><h1>PaperLoop 思考</h1>'+makeFlow(source).serialized()+'</div>'});
    const baseForSync=state.noteHTML;
    editor=win.document.createXULElement('note-editor');editor.style.cssText='position:fixed;left:0;top:0;width:1000px;height:800px';win.document.documentElement.append(editor);editor.mode='edit';editor.item=note;await editor._initPromise;await Zotero.Promise.delay(700);
    const syncWindow=editor._editorInstance._iframeWindow.wrappedJSObject;
    const normalized=syncWindow.getDataSync(false).html;
    result.sync={baseHTML:baseForSync,normalizedHTML:normalized};
    check(scope.Zotero.PaperLoopSync.equal(baseForSync,normalized),'actual native normalization is semantically equal to browser HTML');
    const core=syncWindow._currentEditorInstance._editorCore,json=JSON.parse(JSON.stringify(core.view.state.doc.toJSON()));let insertion;
    function locate(node,pos,isRoot=false){if(node.type==='text'){if(insertion===undefined&&node.text.includes('Native base text'))insertion=pos+node.text.length;return node.text.length;}let size=0;for(const child of node.content||[])size+=locate(child,pos+(isRoot?0:1)+size);return node.content?size+2:1;}
    locate(json,0,true);check(insertion!==undefined,'actual native editable paragraph located');
    core.view.dispatch(core.view.state.tr.insertText(' + native change',insertion));await editor._editorInstance._save(JSON.parse(JSON.stringify(syncWindow.getDataSync(false))));await Zotero.Promise.delay(200);
    const nativeChanged=note.getNote(),browserChanged=baseForSync.replace('Browser base text','Browser base text + browser change');
    const merged=scope.Zotero.PaperLoopSync.merge(baseForSync,browserChanged,nativeChanged);
    check(merged.ok&&merged.html.includes('+ native change')&&merged.html.includes('+ browser change'),'actual native and browser edits merge without dropping either side');
    const mergedDoc=new win.DOMParser().parseFromString(merged.html,'text/html');mergedDoc.querySelector('h1').remove();
    const finalHTML='<div data-schema-version="9"><h1>PaperLoop 思考</h1>'+makeFlow(mergedDoc.querySelector('div[data-schema-version]').innerHTML).serialized()+'</div>';
    state=await request(Notebook,{...nativeTarget,action:'save',baseHTML:nativeChanged,noteHTML:finalHTML});
    check(state.noteKey===note.key&&note.getAttachments().length===3&&note.getNote().includes('+ native change')&&note.getNote().includes('+ browser change'),'merged note reuses one native note and all three image attachments');
    for(const key of keys){const image=await request(Notebook,{...nativeTarget,action:'image',imageKey:key});check(image.dataURI.startsWith('data:image/png'),'native image readable after merged save '+key);}
    result.sync={baseHTML:baseForSync,normalizedHTML:normalized,nativeHTML:nativeChanged,mergedHTML:state.noteHTML};
    result.ok=true;
  }catch(error){result.error=String(error)+'\n'+(error.stack||'');Zotero.logError(error);}
  try{editor?.remove();}catch(_){}
  result.passed=result.tests.length;const reportFile=root.clone();reportFile.append('report.json');await IOUtils.writeJSON(reportFile.path,result);
  if(normalize(Zotero.DataDirectory.dir)===normalize(root.path+'/data'))Services.startup.quit(Services.startup.eForceQuit);
}
function shutdown(){}function install(){}function uninstall(){}
