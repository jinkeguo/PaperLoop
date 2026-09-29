'use strict';
module.exports=async({command,evaluate,output})=>{
 const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),results=[];
 await evaluate('fixture.designPreview()');
 const before=await evaluate('Zotero.PaperLoopSidebar.debugState().noteHTML');
 for(const mode of ['light','dark'])for(const theme of ['cowcat','shiba','iris','tide','paper','sage','ink']){
  const state=await evaluate(`(async()=>{const s=fixture.shadow;for(const [name,value] of [['art','watercolor'],['mode','${mode}'],['theme','${theme}']]){const x=s.querySelector('.'+name);x.value=value;x.dispatchEvent(new Event('change'));}const img=s.querySelector('.theme-photo');await img.decode();const canvas=document.createElement('canvas');canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;const c=canvas.getContext('2d');c.drawImage(img,0,0);const pixels=c.getImageData(0,0,canvas.width,canvas.height).data;let clear=0,white=0;for(let i=0;i<pixels.length;i+=4){if(pixels[i+3]===0)clear++;if(pixels[i]>220&&pixels[i+1]>220&&pixels[i+2]>220&&pixels[i+3]>220)white++;}const glow=getComputedStyle(s.querySelector('.context'),'::before');return {clear:clear/(pixels.length/4),white,corners:[pixels[3],pixels[(canvas.width-1)*4+3],pixels[pixels.length-1]],blend:getComputedStyle(img).mixBlendMode,glow:glow.backgroundImage,pointer:glow.pointerEvents,noteHTML:Zotero.PaperLoopSidebar.debugState().noteHTML};})()`);
  assert.ok(state.clear>.15,theme+' needs real alpha');assert.deepEqual(state.corners,[0,0,0]);
  if(theme==='cowcat')assert.ok(state.white>100,'white cat pieces must remain opaque');
  assert.equal(state.blend,'normal');assert.ok(state.glow.includes('radial-gradient'));assert.equal(state.pointer,'none');assert.equal(state.noteHTML,before);
  results.push('transparent watercolor and isolated theme halo: '+theme+' '+mode);
  if(['cowcat','shiba'].includes(theme)){
   const rect=await evaluate('fixture.shadow.querySelector(".panel").getBoundingClientRect().toJSON()');
   const shot=await command('Page.captureScreenshot',{format:'png',clip:{x:rect.x,y:rect.y,width:rect.width,height:Math.min(250,rect.height),scale:2}});
   fs.writeFileSync(path.join(output,'watercolor-'+theme+'-'+mode+'.png'),Buffer.from(shot.data,'base64'));
  }
 }
 await evaluate(`(()=>{const x=fixture.shadow.querySelector('.art');x.value='ink';x.dispatchEvent(new Event('change'));})()`);
 assert.equal(await evaluate(`getComputedStyle(fixture.shadow.querySelector('.context'),'::before').content`),'none');
 results.push('ink illustration style unchanged');console.log(JSON.stringify(results));return results;
};
