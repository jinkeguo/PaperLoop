'use strict';
const {execFileSync}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
for(const [dir,version] of [['browser-extension','0.3.27'],['zotero-plugin','0.5.4']]){
  assert.equal(JSON.parse(fs.readFileSync(path.join(root,dir,'manifest.json'))).version,version);
  for(const file of fs.readdirSync(path.join(root,dir)).filter(name=>name.endsWith('.test.cjs')).sort()){
    console.log('\n'+dir+'/'+file);
    execFileSync(process.execPath,[path.join(root,dir,file)],{stdio:'inherit'});
  }
}
console.log('\nPaperLoop release regression files passed');
