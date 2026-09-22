'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),cp=require('node:child_process'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const ext=path.join(root,'browser-extension'),addon=path.join(root,'zotero-plugin');
const releaseVersion=JSON.parse(fs.readFileSync(path.join(ext,'manifest.json'),'utf8')).version,releaseTag=releaseVersion.replaceAll('.','');
const output=path.join(root,'paperloop-release/browser-validation');fs.mkdirSync(output,{recursive:true});
const profile=fs.mkdtempSync(path.join(output,'edge-test-'));
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const flowVersion=fs.existsSync(path.join(ext,'inject/paperLoopFlow_inject.js'));
const fixtureFile='../test/paperloop-notebook-fixture.js';
const scripts=[path.join(__dirname,fixtureFile),path.join(addon,'notebook.js'),path.join(ext,'paperloop-images.js'),path.join(ext,'lib/dompurify.js'),path.join(ext,'inject/paperLoopGallery_inject.js'),...(flowVersion?[path.join(ext,'inject/paperLoopFlow_inject.js')]:[]),path.join(ext,'inject/paperLoopSidebar_inject.js')];
const html='<!doctype html><meta charset="utf-8"><title>PaperLoop 本机自动化测试</title><style>body{margin:0;background:#f4f5f1;color:#475343;font:16px/1.9 "Segoe UI","Microsoft YaHei",sans-serif}main{max-width:730px;padding:85px 80px}small{letter-spacing:2px;color:#8d9783}h1{font-weight:500;font-size:32px;line-height:1.5}p{color:#839079}hr{border:0;border-top:1px solid #dfe5d7;margin:35px 0}</style><main><small>READ · COLLECT · THINK</small><h1>让阅读留下线索，<br>让思考自然生长。</h1><hr><p>本页是独立的自动化测试文献，<br>不会读写你的 Zotero 文库。</p></main>'+scripts.map((_,i)=>`<script src="/script-${i}.js"></script>`).join('');
const server=http.createServer((req,res)=>{const asset=/^\/images\/paperloop-themes\/(cowcat|shiba|iris|tide)\.jpg$/.exec(req.url);if(asset){res.setHeader('Content-Type','image/jpeg');res.end(fs.readFileSync(path.join(ext,'images/paperloop-themes',asset[1]+'.jpg')));return;}const m=/^\/script-(\d+)\.js$/.exec(req.url);res.setHeader('Content-Type',m?'text/javascript; charset=utf-8':'text/html; charset=utf-8');res.end(m?fs.readFileSync(scripts[+m[1]]):html);});
let child,socket,seq=0,stderr='';
async function command(method,params={}){const id=++seq;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{socket.removeEventListener('message',listen);reject(new Error('CDP timeout '+method));},60000);function listen(e){const r=JSON.parse(e.data);if(r.id!==id)return;clearTimeout(timer);socket.removeEventListener('message',listen);r.error?reject(new Error(r.error.message)):resolve(r.result);}socket.addEventListener('message',listen);socket.send(JSON.stringify({id,method,params}));});}
async function evaluate(expression){const r=await command('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||JSON.stringify(r.exceptionDetails));return r.result.value;}
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const pageURL=`http://127.0.0.1:${server.address().port}/`;
 child=cp.spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0',`--user-data-dir=${profile}`,'--window-size=1440,960',pageURL],{windowsHide:true,stdio:['ignore','ignore','pipe']});
 child.stderr.on('data',chunk=>stderr=(stderr+chunk).slice(-6000));
 let port;for(let i=0;i<100;i++){await delay(150);try{port=fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split(/\r?\n/)[0];break;}catch(_){}}
 if(!port)throw new Error('Edge did not start; exit='+child.exitCode+'; '+stderr);const tabs=await (await fetch(`http://127.0.0.1:${port}/json`)).json();const tab=tabs.find(t=>t.type==='page');
 socket=new WebSocket(tab.webSocketDebuggerUrl);await new Promise((r,j)=>{socket.addEventListener('open',r,{once:true});socket.addEventListener('error',j,{once:true});});
 await command('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false});
 for(let i=0;i<100;i++){if(await evaluate('!!(window.fixture && window.fixture.uiTests && window.Zotero?.PaperLoopSidebar)'))break;await delay(100);}
 await evaluate('(async()=>{await fixture.setup();await fixture.backendTests();await fixture.uiSetup();return true;})()');
 const shot=await command('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(output,'sidebar-preview.png'),Buffer.from(shot.data,'base64'));
 const report=await evaluate('fixture.uiTests()');
 const galleryTests=await evaluate('fixture.galleryTests()');report.push(...galleryTests);
 const saveTests=await evaluate('fixture.saveRegressionTests()');report.push(...saveTests);
 if(flowVersion){const flowTests=await evaluate('fixture.flowTests()');report.push(...flowTests);}
 if(Number(releaseVersion.split('.')[2])>=25)report.push(...await evaluate('fixture.editingTests()'));
 if(Number(releaseVersion.split('.')[2])>=26)report.push(...await evaluate('fixture.columnTests()'));
 await evaluate('fixture.galleryPreview()');await delay(250);
 const galleryShot=await command('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(output,'gallery-preview.png'),Buffer.from(galleryShot.data,'base64'));
 const galleryBounds=await evaluate('Zotero.PaperLoopSidebar.debugState().rectangle');const cropped=await command('Page.captureScreenshot',{format:'png',clip:{x:galleryBounds.x-5,y:galleryBounds.y-5,width:galleryBounds.width+10,height:galleryBounds.height+10,scale:1}});fs.writeFileSync(path.join(output,'gallery-sidebar.png'),Buffer.from(cropped.data,'base64'));
 await evaluate('fixture.shadow.querySelector(".media-preview").click()');await delay(150);
 const viewerShot=await command('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(output,'gallery-viewer-preview.png'),Buffer.from(viewerShot.data,'base64'));
 await evaluate('fixture.shadow.querySelector(".media-viewer-close").click()');
 // Real pointer drag/resize through Chromium, not through application debug helpers.
 const before=await evaluate('Zotero.PaperLoopSidebar.debugState().rectangle');
 async function drag(x,y,dx,dy){await command('Input.dispatchMouseEvent',{type:'mouseMoved',x,y});await command('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',clickCount:1});await command('Input.dispatchMouseEvent',{type:'mouseMoved',x:x+dx,y:y+dy,button:'left',buttons:1});await command('Input.dispatchMouseEvent',{type:'mouseReleased',x:x+dx,y:y+dy,button:'left',clickCount:1});}
 await drag(before.x+110,before.y+25,-180,55);const moved=await evaluate('Zotero.PaperLoopSidebar.debugState().rectangle');assert.ok(moved.x<before.x-100&&moved.y>before.y+30,'drag did not move panel');report.push('real pointer drag');
 await drag(moved.right-8,moved.bottom-8,50,70);const resized=await evaluate('Zotero.PaperLoopSidebar.debugState().rectangle');assert.ok(resized.width>moved.width+25&&resized.height>moved.height+35,'resize failed');report.push('real pointer resize');
 await evaluate('fixture.shadow.querySelector(".minimize").click()');const mini=await evaluate('Zotero.PaperLoopSidebar.debugState().rectangle');await drag(mini.x+15,mini.y+50,0,90);assert.equal(await evaluate('Zotero.PaperLoopSidebar.debugState().minimized'),true);await command('Input.dispatchMouseEvent',{type:'mousePressed',x:mini.x+15,y:mini.y+135,button:'left',clickCount:1});await command('Input.dispatchMouseEvent',{type:'mouseReleased',x:mini.x+15,y:mini.y+135,button:'left',clickCount:1});assert.equal(await evaluate('Zotero.PaperLoopSidebar.debugState().minimized'),false);report.push('minimized tab drag and click expand');
 await delay(180);await evaluate('Zotero.PaperLoopSidebar.close(); fixture.uiSetup()');const reopened=await evaluate('Zotero.PaperLoopSidebar.debugState().rectangle');assert.equal(reopened.width,resized.width);report.push('geometry persists across reopen');
 await command('Emulation.setDeviceMetricsOverride',{width:360,height:640,deviceScaleFactor:1,mobile:false});await delay(80);const small=await evaluate('Zotero.PaperLoopSidebar.debugState().rectangle');assert.ok(small.left>=0&&small.right<=360&&small.bottom<=640,'panel escaped viewport');report.push('narrow viewport clamping');
 if(flowVersion){
  const bar=await evaluate('(()=>{const s=fixture.shadow,b=s.querySelector(".bar").getBoundingClientRect(),close=s.querySelector(".close").getBoundingClientRect();return {right:b.right,close:close.right};})()');assert.ok(bar.close<=bar.right,'narrow header clips controls');report.push('narrow header keeps theme and close reachable');
  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false});await evaluate('fixture.designPreview()');
  for(const mode of ['light','dark']){await evaluate(`(()=>{const x=fixture.shadow.querySelector('.mode');x.value='${mode}';x.dispatchEvent(new Event('change'));})()`);const r=await evaluate('Zotero.PaperLoopSidebar.debugState().rectangle');const shot=await command('Page.captureScreenshot',{format:'png',clip:{x:r.x-3,y:r.y-3,width:r.width+6,height:r.height+6,scale:1}});fs.writeFileSync(path.join(output,'release-'+releaseTag+'-'+mode+'.png'),Buffer.from(shot.data,'base64'));}
 }
 fs.writeFileSync(path.join(output,'test-report.json'),JSON.stringify({passed:report.length,tests:report,scope:'Real headless Edge DOM/IndexedDB/fetch with test-only Zotero objects. Real native Connector/session checks use test-paperloop-native.ps1.'},null,2));console.log(JSON.stringify({passed:report.length,tests:report,preview:path.join(output,'gallery-preview.png')},null,2));
})().catch(async e=>{console.error(e);if(socket)try{console.error(await evaluate('({notices:fixture.notices.slice(-12),images:[...fixture.shadow.querySelectorAll(".editor img")].map(i=>({key:i.dataset.attachmentKey,title:i.title,src:i.getAttribute("src")?.slice(0,80)})),state:Zotero.PaperLoopSidebar.debugState()})'));}catch(_){}process.exitCode=1;}).finally(async()=>{
 if(socket){try{await command('Browser.close');}catch(_){}socket.close();}if(child){await delay(500);if(child.exitCode===null)child.kill();}
 server.close();await delay(300);
 // Only remove this run's generated, resolved profile under the validation directory.
 if(path.dirname(path.resolve(profile))===path.resolve(output)&&path.basename(profile).startsWith('edge-test-')){try{fs.rmSync(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});}catch(e){console.error('Temporary profile retained:',profile);}}
});
