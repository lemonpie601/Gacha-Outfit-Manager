(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.GachaOutfitManagerUI=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function containsComposed(parent,child) {
    for(let element=child;element;element=element.parentElement || element.getRootNode?.().host || null) if(element===parent) return true;
    return false;
  }
  function placeOverlay(node,doc) {
    const fullscreen=doc.fullscreenElement;
    const parent=fullscreen ? fullscreen.shadowRoot || fullscreen : doc.body;
    if(node.parentNode!==parent) parent.appendChild(node);
    return parent;
  }
  function isGachaVisible(host,view) {
    if(!host?.isConnected || host.tagName!=='MARINARA-CAPABILITY-GACHA-FORGE') return false;
    const fullscreen=view.document?.fullscreenElement;
    if(fullscreen && !containsComposed(fullscreen,host) && !containsComposed(host,fullscreen)) return false;
    const mode=host.getAttribute('view');
    if(mode && mode!=='browser') return false;
    if(!host.getClientRects().length) return false;
    const rect=host.getBoundingClientRect();
    if(rect.width<2 || rect.height<2 || rect.right<=0 || rect.bottom<=0 || rect.left>=view.innerWidth || rect.top>=view.innerHeight) return false;
    for(let element=host;element;){
      if(element.nodeType===1){
        if(element.getAttribute('hidden')!==null || element.getAttribute('inert')!==null || element.getAttribute('aria-hidden')==='true') return false;
        const style=view.getComputedStyle(element);
        if(style.display==='none' || ['hidden','collapse'].includes(style.visibility) || style.opacity==='0' || style.contentVisibility==='hidden') return false;
      }
      element=element.parentElement || element.getRootNode?.().host || null;
    }
    return true;
  }
  function summarize(rows,tab,search) {
    const counts={active:0,inactive:0,all:0,trash:0};
    for(const row of rows){if(Object.hasOwn(counts,row.status))counts[row.status]++;if(row.status!=='trash')counts.all++;}
    const query=String(search||'').trim().toLowerCase();
    return {counts,visible:rows.filter(row=>tab==='all'?row.status!=='trash':row.status===tab).filter(row=>!query||(row.title+' '+row.desc).toLowerCase().includes(query))};
  }
  function worldResultMessage(result) {
    const parts=[result.enabled ? `${result.done}개 추가` : `${result.done}개 해제`];
    if(result.already) parts.push(`이미 적용 중 ${result.already}개`);
    if(result.capacitySkipped) parts.push(`자리 부족으로 ${result.capacitySkipped}개는 추가하지 않음`);
    parts.push(`현재 ${result.worldCount}/64개`);
    return parts.join(' · ')+'.';
  }
  const markupCache=new WeakMap();
  function setMarkup(element,markup) {
    if(markupCache.get(element)===markup) return false;
    const active=element.getRootNode?.()?.activeElement;
    const identity=active && active!==element && element.contains(active)
      ? ['id','data-inspect','data-tab','data-act','data-key'].map(name=>[name,active.getAttribute(name)]).find(([,value])=>value!==null)
      : null;
    element.innerHTML=markup;
    markupCache.set(element,markup);
    if(identity) {
      const [name,value]=identity;
      const controls=[...element.querySelectorAll('button,input,select,textarea,[tabindex]')];
      const replacement=controls.find(control=>control.getAttribute(name)===value && !control.disabled) || controls.find(control=>!control.disabled);
      replacement?.focus({preventScroll:true});
    }
    return true;
  }
  function restoreFocus(scope,fallback) {
    if(!scope.activeElement || scope.activeElement.disabled) fallback?.focus({preventScroll:true});
  }
  function trapTab(event,scope) {
    if(event.key!=='Tab') return;
    const controls=[...scope.querySelectorAll('button,input,select,textarea,summary,[tabindex="0"]')].filter(control=>!control.disabled && control.getClientRects().length);
    const first=controls[0],last=controls.at(-1);
    if(first && ((!event.shiftKey && scope.activeElement===last) || (event.shiftKey && scope.activeElement===first))) {
      event.preventDefault();(event.shiftKey?last:first).focus();
    }
  }
  function createRowsReader() {
    let previous=null,library=null,data=null,rows=[];
    return manager=>{
      if(!manager) return [];
      if(manager!==previous || manager.library!==library || manager.data!==data) {
        rows=manager.rows();previous=manager;library=manager.library;data=manager.data;
      }
      return rows;
    };
  }
  function isolateEvents(scope) {
    for(const type of ['click','dblclick','auxclick','pointerdown','pointerup','mousedown','mouseup','keydown','keyup','input','change','submit','contextmenu'])
      scope.addEventListener(type,event=>event.stopPropagation());
  }
  function mountThemeButtons(scope,onOpen) {
    if(!scope) return;
    const doc=scope.ownerDocument;
    if(!scope.querySelector('[data-gf-outfit-manager-style]')) {
      const style=doc.createElement('style');
      style.setAttribute('data-gf-outfit-manager-style','');
      style.textContent='[data-gf-outfit-manager-slot]{grid-column:1/-1;display:flex;justify-content:flex-end;align-items:center;flex:0 0 auto;position:static}[data-gf-outfit-manager]{all:unset;box-sizing:border-box;display:inline-flex;position:static;align-items:center;justify-content:center;flex:none;width:38px;min-width:38px;height:38px;padding:8px;border-radius:var(--radius-sm,6px);color:var(--text,#eeeaf7);background:transparent;border:1px solid var(--steel-dark,#665371);cursor:pointer;touch-action:manipulation}[data-gf-outfit-manager]:hover{color:var(--coral,#e8c876);border-color:var(--coral,#e8c876)}[data-gf-outfit-manager]:focus-visible{outline:2px solid var(--coral,#e8c876);outline-offset:2px}[data-gf-outfit-manager] svg{display:block;width:20px;height:20px;pointer-events:none}';
      scope.appendChild(style);
    }
    for(const target of scope.querySelectorAll('.tp-foot, .th-acts')) {
      if(target.querySelector('[data-gf-outfit-manager]')) continue;
      const slot=doc.createElement('span');
      slot.setAttribute('data-gf-outfit-manager-slot','');
      const button=doc.createElement('button');
      button.setAttribute('type','button');
      button.setAttribute('data-gf-outfit-manager','');
      button.setAttribute('aria-label','의상 테마 일괄 관리');
      button.setAttribute('title','의상 테마 일괄 관리');
      button.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2"/></svg>';
      button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();onOpen(button);});
      isolateEvents(slot);
      slot.appendChild(button);
      target.appendChild(slot);
    }
  }
  function removeThemeButtons(scope) {
    if(scope) for(const element of scope.querySelectorAll('[data-gf-outfit-manager-slot], [data-gf-outfit-manager], [data-gf-outfit-manager-style]')) element.remove();
  }
  return {isGachaVisible,summarize,worldResultMessage,mountThemeButtons,removeThemeButtons,placeOverlay,setMarkup,createRowsReader,isolateEvents,restoreFocus,trapTab};
});
