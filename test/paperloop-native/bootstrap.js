/* Test-only: refuses to run against any personal profile or data directory. */
async function startup() {
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
    check(Math.abs(widths[0]/widths[1]-330/270)<.12&&iw.document.querySelector('.ProseMirror img'),'real native editor retains left-text/right-image layout');
    result.ok=true;
  }catch(error){result.error=String(error)+'\n'+(error.stack||'');Zotero.logError(error);}
  try{editor?.remove();}catch(_){}
  result.passed=result.tests.length;const reportFile=root.clone();reportFile.append('report.json');await IOUtils.writeJSON(reportFile.path,result);
  if(normalize(Zotero.DataDirectory.dir)===normalize(root.path+'/data'))Services.startup.quit(Services.startup.eForceQuit);
}
function shutdown(){}function install(){}function uninstall(){}
