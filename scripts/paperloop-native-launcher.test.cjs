'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'paperloop-launcher-check-'));
const helper=path.join(__dirname,'wait-paperloop-native-report.ps1'),hash='a'.repeat(64);
const run=(name,report)=>{
  const file=path.join(root,name+'.json');if(report!==undefined)fs.writeFileSync(file,JSON.stringify(report));
  const result=spawnSync('pwsh.exe',['-NoProfile','-NonInteractive','-File',helper,'-ReportPath',file,'-ExpectedPackageSHA256',hash,'-TimeoutSeconds','0'],{encoding:'utf8',windowsHide:true});
  if(result.error)throw result.error;return result;
};
assert.equal(run('complete',{ok:true,packageSHA256:hash}).status,0);
for(const [name,report] of [['failed',{ok:false,packageSHA256:hash}],['truthy',{ok:'true',packageSHA256:hash}],['missing-ok',{packageSHA256:hash}],['wrong-package',{ok:true,packageSHA256:'b'.repeat(64)}],['missing-report',undefined]]){
  assert.notEqual(run(name,report).status,0,name+' must not be reported as passing');
}
console.log('Native launcher: complete/hash-bound report passes; failed, truthy, missing, mismatched and timed-out reports fail');
