'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const context={ZOTERO_CONFIG:{CONNECTOR_COMPATIBILITY_VERSION:'6.0'},Zotero:{isBrowserExt:true,version:'0.3.33',debug(){},logError(){},Prefs:{get(){return 'http://127.0.0.1:23119/'}},HTTP:{StatusError:class extends Error{},async request(method,url,options){
 assert.equal(method,'POST');assert.equal(url,'http://127.0.0.1:23119/connector/paperloop/notebook');
 assert.equal(options.headers['Zotero-Allowed-Request'],'1');assert.equal(options.headers['Content-Type'],'application/json');
 assert.equal(JSON.parse(options.body).action,'capabilities');
 return {status:200,responseText:'{"ok":true}',getResponseHeader(name){return name==='Content-Type'?'application/json':'10.0.3'}};
}}}};
vm.runInNewContext(fs.readFileSync(__dirname+'/connector.js','utf8'),context);
context.Zotero.Connector.onStateChange=()=>{};
context.Zotero.Connector._handleIntegrationTabClosed=()=>{};
context.Zotero.Connector.callMethod({method:'paperloop/notebook'},{action:'capabilities'}).then(result=>{assert.equal(result.ok,true);console.log('Actual Connector request carries Zotero 10 opt-in header');}).catch(error=>{console.error(error);process.exitCode=1});
