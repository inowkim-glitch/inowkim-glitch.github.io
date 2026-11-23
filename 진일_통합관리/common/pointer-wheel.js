/* JINIL V72: Pointer-first wheel scrolling for nested block lists, stock tables, and pages. */
(()=>{
  'use strict';
  if(window.__jinilPointerWheelInstalled)return;
  window.__jinilPointerWheelInstalled=true;
  const activeDialog=()=>[...document.querySelectorAll('dialog[open],[role="dialog"][aria-modal="true"]')]
    .reverse().find(n=>!n.hidden&&getComputedStyle(n).display!=='none');
  const movable=(el,axis,delta)=>{
    if(!(el instanceof Element))return false;
    const style=getComputedStyle(el);
    const overflow=axis==='y'?style.overflowY:style.overflowX;
    if(!/^(auto|scroll|overlay)$/.test(overflow))return false;
    const size=axis==='y'?el.scrollHeight:el.scrollWidth;
    const client=axis==='y'?el.clientHeight:el.clientWidth;
    const pos=axis==='y'?el.scrollTop:el.scrollLeft;
    return size>client+2&&(delta>0?pos<size-client-1:pos>1);
  };
  document.addEventListener('wheel',e=>{
    if(e.defaultPrevented||!e.cancelable||e.ctrlKey||e.shiftKey)return;
    const scale=e.deltaMode===1?16:e.deltaMode===2?window.innerHeight:1;
    const dy=e.deltaY*scale,dx=e.deltaX*scale;
    if(!dy&&!dx)return;
    const axis=Math.abs(dy)>=Math.abs(dx)?'y':'x';
    const delta=axis==='y'?dy:dx;
    if(!delta)return;
    const dialog=activeDialog();
    // The scroll target is determined by the pointer, not by focused block or tab.
    const path=e.composedPath().filter(n=>n instanceof Element);
    if(dialog&&!path.some(n=>n===dialog||dialog.contains(n)))return;
    for(const el of path){
      if(dialog&&el!==dialog&&!dialog.contains(el))break;
      if(movable(el,axis,delta)){
        e.preventDefault();
        if(axis==='y')el.scrollTop+=delta;
        else el.scrollLeft+=delta;
        return;
      }
      if(el===dialog)break;
    }
    if(dialog)return; // Modal wheel must never scroll the page behind it.
    const root=document.scrollingElement||document.documentElement;
    const max=(axis==='y'?root.scrollHeight-root.clientHeight:root.scrollWidth-root.clientWidth);
    const pos=axis==='y'?root.scrollTop:root.scrollLeft;
    if(max>2&&(delta>0?pos<max-1:pos>1)){
      e.preventDefault();
      if(axis==='y')root.scrollTop+=delta;
      else root.scrollLeft+=delta;
    }
  },{capture:true,passive:false});
})();
