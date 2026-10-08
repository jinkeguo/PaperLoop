'use strict';
module.exports=function summarize({live=[],controlledPassed=false}={}){
  const passed=live.filter(entry=>entry.ok===true).length;
  const blocked=live.filter(entry=>entry.ok!==true&&entry.detection?.status==='verification').length;
  const failed=live.length-passed-blocked;
  const ok=controlledPassed===true&&passed>0&&failed===0;
  return {ok,status:ok?'passed':controlledPassed===true&&blocked===live.length&&blocked>0?'blocked':'failed',
    live:{total:live.length,passed,blocked,failed},controlled:{passed:controlledPassed===true}};
};
