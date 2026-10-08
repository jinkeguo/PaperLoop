'use strict';
module.exports=async({command,evaluate,output})=>{
 const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),tests=[];
 const delay=ms=>new Promise(r=>setTimeout(r,ms));
 const change=(name,value)=>evaluate(`(()=>{const x=fixture.shadow.querySelector('.${name}');x.value='${value}';x.dispatchEvent(new Event('change'));})()`);
 const state=()=>evaluate('Zotero.PaperLoopSidebar.debugState()');
 const minimize=()=>evaluate('fixture.shadow.querySelector(".minimize").click()');
 const expand=()=>evaluate('fixture.shadow.querySelector(".mini").dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true}))');
 async function pointer(x,y,dx=0,dy=0){for(const p of [{type:'mouseMoved',x,y},{type:'mousePressed',x,y,button:'left',clickCount:1},{type:'mouseMoved',x:x+dx,y:y+dy,buttons:1,button:'left'},{type:'mouseReleased',x:x+dx,y:y+dy,button:'left',clickCount:1}])await command('Input.dispatchMouseEvent',p);}
 async function shot(name,rect){if(name.startsWith('pet-'))await evaluate('fixture.shadow.activeElement?.blur()');const r=await command('Page.captureScreenshot',{format:'png',clip:{x:Math.max(0,rect.x-4),y:Math.max(0,rect.y-4),width:rect.width+8,height:rect.height+8,scale:name.startsWith('pet-')?2:1}});fs.writeFileSync(path.join(output,name+'.png'),Buffer.from(r.data,'base64'));}
 await evaluate('fixture.designPreview()');
 const original=(await state()).noteHTML;
 for(const theme of ['sakura','apricot','lagoon'])for(const mode of ['light','dark'])for(const art of ['ink','watercolor']){
  await change('theme',theme);await change('mode',mode);await change('art',art);
  const check=await evaluate(`(async()=>{const s=fixture.shadow,p=s.querySelector('.panel'),img=s.querySelector('.theme-photo');await img.decode();return {bg:getComputedStyle(p).backgroundImage,width:img.naturalWidth,theme:p.dataset.theme,dark:p.dataset.dark};})()`);
  assert.equal(check.theme,theme);assert.equal(check.dark,String(mode==='dark'));assert.ok(check.bg.includes('radial-gradient'));assert.ok(check.width>0);assert.equal((await state()).noteHTML,original);
  tests.push(`${theme} ${mode} ${art}: assets, environment colors, unchanged note`);
  if(art==='ink')await shot('theme-0340-'+theme+'-'+mode,(await state()).rectangle);
 }
 await change('mode','light');await change('art','ink');await change('theme','apricot');await change('minimizeMode','pet');await change('pet','theme');
 const panel=(await state()).rectangle;await minimize();
 assert.equal(await evaluate('fixture.shadow.querySelector(".mini").dataset.animal'),'shiba');
 assert.equal(await evaluate('fixture.shadow.activeElement===fixture.shadow.querySelector(".mini")'),true);
 await evaluate('fixture.shadow.querySelector(".pet-image").decode()');await shot('pet-0340-shiba',(await state()).rectangle);tests.push('theme-matched Shiba pet with keyboard focus');
 const pet=(await state()).rectangle;await pointer(pet.x+52,pet.y+65,-165,130);const moved=(await state()).rectangle;
 assert.equal((await state()).minimized,true);assert.ok(moved.x<pet.x-100&&moved.y>pet.y+80);tests.push('pet freely drags without opening');
 await pointer(moved.x+52,moved.y+65);assert.equal((await state()).minimized,false);assert.deepEqual((await state()).rectangle,panel);assert.equal((await state()).noteHTML,original);tests.push('click restores exact panel geometry and note');
 await minimize();assert.deepEqual((await state()).rectangle,moved);await expand();tests.push('pet remembers its independent position; Enter restores panel');
 await change('pet','cowcat');await minimize();await evaluate('fixture.shadow.querySelector(".pet-image").decode()');assert.equal(await evaluate('fixture.shadow.querySelector(".mini").dataset.animal'),'cowcat');await shot('pet-0340-cowcat',(await state()).rectangle);await expand();tests.push('manual cow cat overrides theme');
 await change('minimizeMode','ribbon');await minimize();assert.equal((await state()).rectangle.width,34);assert.equal(await evaluate('getComputedStyle(fixture.shadow.querySelector(".pet-image")).display'),'none');await expand();tests.push('classic bookmark remains available');
 await change('minimizeMode','pet');await minimize();
 await command('Emulation.setDeviceMetricsOverride',{width:360,height:300,deviceScaleFactor:1,mobile:false});await delay(100);const narrow=(await state()).rectangle;assert.ok(narrow.x>=0&&narrow.right<=360&&narrow.bottom<=300);tests.push('pet stays reachable in narrow viewport');
 for(const animal of ['cowcat','shiba']){
  await command('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
  await evaluate(`(async()=>{const host=document.createElement('div');host.id='pet-animation-test';host.style.cssText='position:fixed;left:-300px;top:0;width:128px;height:128px';document.body.append(host);const root=host.attachShadow({mode:'open'}),text=await (await fetch('/images/paperloop-themes/pets/${animal}.svg')).text();root.append(document.importNode(new DOMParser().parseFromString(text,'image/svg+xml').documentElement,true));})()`);
  assert.equal(await evaluate('getComputedStyle(document.querySelector("#pet-animation-test").shadowRoot.querySelector(".eyes")).animationName'),'blink');
  assert.equal(await evaluate('getComputedStyle(document.querySelector("#pet-animation-test").shadowRoot.querySelector(".tail")).animationName'),animal==='shiba'?'wag':'tail');
  await command('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  assert.deepEqual(await evaluate('[...document.querySelector("#pet-animation-test").shadowRoot.querySelectorAll(".eyes,.tail,.body")].map(e=>getComputedStyle(e).animationName)'),['none','none','none']);
  await evaluate('document.querySelector("#pet-animation-test").remove()');await command('Emulation.setEmulatedMedia',{features:[]});tests.push(animal+': blink/tail animation and reduced-motion stop verified');
 }
 await command('Emulation.setEmulatedMedia',{features:[]});await command('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false});await expand();await delay(200);
 const saved=await evaluate('browser.storage.local.get("paperloop:appearance:v1")');assert.equal(saved['paperloop:appearance:v1'].pet,'cowcat');assert.equal(saved['paperloop:appearance:v1'].minimizeMode,'pet');assert.equal(saved['paperloop:appearance:v1'].theme,'apricot');assert.equal(saved['paperloop:appearance:v1'].petLeft,moved.x);tests.push('pet settings and separate position persist to browser storage');
 await evaluate('Zotero.PaperLoopSidebar.close();fixture.uiSetup()');assert.equal((await state()).theme,'apricot');await minimize();assert.equal(await evaluate('fixture.shadow.querySelector(".mini").dataset.animal'),'cowcat');await expand();tests.push('reopen retains pet and theme');
 await change('theme','cowcat');await change('pet','theme');
 await evaluate('Zotero.PaperLoopSidebar.debugSetThought("宠物模式测试：尚未点击保存的记录")');const draft=(await state()).noteHTML;await minimize();await expand();assert.equal((await state()).noteHTML,draft);tests.push('minimize and restore retain newly typed draft');
 console.log(JSON.stringify({passed:tests.length,tests}));return tests;
};
