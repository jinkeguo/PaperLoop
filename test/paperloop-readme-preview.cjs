'use strict';
module.exports=async({command,evaluate,output})=>{
 const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
 await evaluate(`(async()=>{await fixture.collect([0,1]);await Zotero.PaperLoopSidebar.save();await fixture.designPreview();})()`);
 const appearance=async mode=>{
  const result=await evaluate(`(async()=>{const s=fixture.shadow;for(const [name,value] of [['theme','cowcat'],['art','ink'],['mode','${mode}']]){const e=s.querySelector('.'+name);e.value=value;e.dispatchEvent(new Event('change'));}await s.querySelector('.theme-photo').decode();await fixture.delay(100);return {theme:Zotero.PaperLoopSidebar.debugState().theme,src:s.querySelector('.theme-photo').getAttribute('src')};})()`);
  assert.equal(result.theme,'cowcat');assert.ok(result.src.includes('cowcat.svg'));
 };
 const capture=async label=>{
  const r=await evaluate('fixture.shadow.querySelector(".panel").getBoundingClientRect().toJSON()');
  const shot=await command('Page.captureScreenshot',{format:'png',clip:{x:r.x-3,y:r.y-3,width:r.width+6,height:r.height+6,scale:1}});
  const filename=path.join(output,'readme-cowcat-'+label+'.png');fs.writeFileSync(filename,Buffer.from(shot.data,'base64'));console.log(filename);
 };
 for(const mode of ['light','dark']){await appearance(mode);await capture(mode);}
 await appearance('light');await evaluate(`(async()=>{await fixture.galleryPreview();fixture.shadow.querySelector('.media-area').scrollIntoView({block:'start'});await fixture.delay(150);})()`);await capture('gallery');
};
