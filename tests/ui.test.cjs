const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const uiPath = path.resolve(__dirname, '../ui.js');
const ui = fs.existsSync(uiPath) ? require(uiPath) : {};
const view = {innerWidth:1400,innerHeight:900,getComputedStyle:el => el.style || {}};
function element(options={}) {
  return {isConnected:true,tagName:'MARINARA-CAPABILITY-GACHA-FORGE',nodeType:1,parentElement:null,style:{},
    getAttribute:()=>null,getRootNode:()=>({}),getClientRects:()=>[{}],getBoundingClientRect:()=>({left:0,top:0,right:1200,bottom:800,width:1200,height:800}),...options};
}
function ready() {assert.equal(typeof ui.isGachaVisible,'function','Visibility rules are not implemented');}
test('shows controls only for a connected visible Gacha Forge browser view',()=>{ready();assert.equal(ui.isGachaVisible(element(),view),true);});
test('hides controls after leaving Gacha Forge even when old host remains connected',()=>{ready();assert.equal(ui.isGachaVisible(element({getClientRects:()=>[]}),view),false);});
test('hides controls when the Gacha Forge element has been unmounted',()=>{ready();assert.equal(ui.isGachaVisible(element({isConnected:false}),view),false);});
test('hides controls under an aria-hidden or inert ancestor',()=>{ready();for(const attr of ['aria-hidden','inert']) {const parent=element({tagName:'DIV',getAttribute:name=>name===attr?(attr==='aria-hidden'?'true':''):null});assert.equal(ui.isGachaVisible(element({parentElement:parent}),view),false);}});
test('hides controls under CSS-hidden ancestors including across shadow roots',()=>{ready();const parent=element({tagName:'DIV',style:{visibility:'hidden'}});assert.equal(ui.isGachaVisible(element({getRootNode:()=>({host:parent})}),view),false);});
test('does not show controls in unrelated capability views or outside the viewport',()=>{ready();assert.equal(ui.isGachaVisible(element({getAttribute:()=> 'settings'}),view),false);assert.equal(ui.isGachaVisible(element({getBoundingClientRect:()=>({left:1500,top:0,right:1600,bottom:100,width:100,height:100})}),view),false);});
test('counts and filters the same snapshot, with trash excluded from all',()=>{assert.equal(typeof ui.summarize,'function','Snapshot helpers are not implemented');const rows=[{key:'1',status:'active',title:'봄',desc:'Pink'},{key:'2',status:'inactive',title:'겨울',desc:'Snow'},{key:'3',status:'trash',title:'삭제',desc:'Old'}];const snapshot=ui.summarize(rows,'all','snow');assert.deepEqual(snapshot.counts,{active:1,inactive:1,all:2,trash:1});assert.deepEqual(snapshot.visible.map(row=>row.key),['2']);});

test('world result distinguishes additions, already applied, and skipped for capacity',()=>{
  assert.equal(typeof ui.worldResultMessage,'function');
  const message=ui.worldResultMessage({enabled:true,done:2,already:1,capacitySkipped:3,worldCount:64});
  assert.match(message,/2개 추가/);assert.match(message,/이미 적용 중 1개/);assert.match(message,/자리 부족.*3개/);assert.match(message,/64\/64/);
  assert.match(ui.worldResultMessage({enabled:false,done:1,worldCount:2}),/1개 해제/);
});

function slots() {
  const matches=(child,selector)=>selector.split(',').some(part=>child.attrs[part.trim().slice(1,-1)]!==undefined);
  const create=tag=>({tag,attrs:{},children:[],events:{},setAttribute(k,v){this.attrs[k]=v;},addEventListener(k,fn){this.events[k]=fn;},appendChild(child){child.parent=this;this.children.push(child);},remove(){this.parent.children=this.parent.children.filter(child=>child!==this);},querySelector(selector){return this.querySelectorAll(selector)[0]||null;},querySelectorAll(selector){return this.children.flatMap(child=>[...(matches(child,selector)?[child]:[]),...child.querySelectorAll(selector)]);}});
  const settings=create('div'), library=create('div'), scope=create('root');
  scope.ownerDocument={createElement:create};
  scope.children.push(settings,library);settings.parent=scope;library.parent=scope;
  const queryAll=scope.querySelectorAll.bind(scope);
  scope.querySelectorAll=selector=>selector==='.tp-foot, .th-acts'?[settings,library]:queryAll(selector);
  return {scope,settings,library};
}
test('places a settings icon in both native outfit-theme settings and library toolbars; clicking opens manager',()=>{
  assert.equal(typeof ui.mountThemeButtons,'function','Inline settings icon is not implemented');
  const {scope,settings,library}=slots();let opened=0;
  ui.mountThemeButtons(scope,()=>opened++);
  assert.equal(settings.children.length,1);assert.equal(library.children.length,1);
  const button=settings.querySelector('[data-gf-outfit-manager]');
  assert.equal(button.attrs['aria-label'],'의상 테마 일괄 관리');
  button.events.click({preventDefault(){},stopPropagation(){}});assert.equal(opened,1);
});
test('does not duplicate icons on rerender and removes injected UI when disabled',()=>{
  assert.equal(typeof ui.mountThemeButtons,'function','Inline settings icon is not implemented');
  const {scope,settings,library}=slots();ui.mountThemeButtons(scope,()=>{});ui.mountThemeButtons(scope,()=>{});
  assert.equal(settings.children.length,1);assert.equal(library.children.length,1);assert.equal(scope.children.length,3);
  ui.removeThemeButtons(scope);assert.equal(settings.children.length,0);assert.equal(library.children.length,0);assert.equal(scope.children.length,2);
});

test('keeps native toolbar buttons and layout untouched and gives the manager a separate slot',()=>{
  const {scope,settings,library}=slots();
  const native=scope.ownerDocument.createElement('button');native.setAttribute('data-theme-library','');let clicked=0;native.addEventListener('click',()=>clicked++);settings.appendChild(native);
  const before={...native.attrs};ui.mountThemeButtons(scope,()=>{});
  assert.equal(settings.children[0],native);assert.deepEqual(native.attrs,before);native.events.click();assert.equal(clicked,1);
  assert.ok(settings.querySelector('[data-gf-outfit-manager-slot]'));
  const css=scope.querySelector('[data-gf-outfit-manager-style]').textContent;
  assert.equal(css.includes('.tp-foot'),false,'must not rewrite the game grid');
  assert.equal(css.includes('.th-acts'),false,'must not rewrite the game toolbar');
  ui.removeThemeButtons(scope);assert.deepEqual(settings.children,[native]);assert.equal(library.children.length,0);
});
test('popup input events stay inside the popup without cancelling native input defaults',()=>{
  const {scope}=slots();assert.equal(typeof ui.isolateEvents,'function');ui.isolateEvents(scope);
  for(const type of ['click','pointerdown','keydown','keyup','input','change','submit']){
    let stopped=0;scope.events[type]({stopPropagation(){stopped++;},preventDefault(){throw Error('input default cancelled');}});assert.equal(stopped,1,type);
  }
});
test('unchanged markup preserves live DOM and focus while changed markup is applied',()=>{
  assert.equal(typeof ui.setMarkup,'function');let writes=0,value='';const target={get innerHTML(){return value;},set innerHTML(next){writes++;value=next;}};
  ui.setMarkup(target,'<button>A</button>');ui.setMarkup(target,'<button>A</button>');assert.equal(writes,1);
  ui.setMarkup(target,'<button>B</button>');assert.equal(writes,2);assert.equal(value,'<button>B</button>');
});
test('changed markup restores focus to the same manager control so Escape stays inside the popup',()=>{
  let focus=null;const button=key=>({getAttribute:name=>name==='data-inspect'?key:null,focus(options){focus=this;assert.equal(options.preventScroll,true);}});
  const old=button('active:a'),replacement=button('active:a');focus=old;
  const target={getRootNode:()=>({activeElement:focus}),contains:element=>element===old,querySelectorAll:()=>[replacement],set innerHTML(value){focus=null;}};
  ui.setMarkup(target,'<button data-inspect="active:a">updated row</button>');assert.equal(focus,replacement);
});
test('removing the focused more button falls back to a remaining enabled control',()=>{
  let focus;const old={getAttribute:name=>name==='data-act'?'more':null};const replacement={disabled:false,getAttribute:()=>null,focus(){focus=this;}};focus=old;
  const target={getRootNode:()=>({activeElement:focus}),contains:()=>true,querySelectorAll:()=>[replacement],set innerHTML(value){focus=null;}};
  ui.setMarkup(target,'<button>last page</button>');assert.equal(focus,replacement);
});
test('after busy controls lose focus the popup can restore focus to search',()=>{
  assert.equal(typeof ui.restoreFocus,'function');let focused=0;const search={focus(){focused++;}};
  ui.restoreFocus({activeElement:null},search);ui.restoreFocus({activeElement:{disabled:true}},search);assert.equal(focused,2);
  ui.restoreFocus({activeElement:{disabled:false}},search);assert.equal(focused,2);
});
test('Tab wraps inside the manager and ignores disabled or hidden controls',()=>{
  assert.equal(typeof ui.trapTab,'function');let focused=null,prevented=0;
  const control=(id,disabled=false,visible=true)=>({id,disabled,getClientRects:()=>visible?[{}]:[],focus(){focused=id;}});
  const a=control('first'),b=control('last');const scope={activeElement:b,querySelectorAll:()=>[a,control('disabled',true),control('hidden',false,false),b]};
  ui.trapTab({key:'Tab',shiftKey:false,preventDefault(){prevented++;}},scope);assert.equal(focused,'first');scope.activeElement=a;
  ui.trapTab({key:'Tab',shiftKey:true,preventDefault(){prevented++;}},scope);assert.equal(focused,'last');assert.equal(prevented,2);
});
test('row snapshots are reused until the manager library or saved data changes',()=>{
  assert.equal(typeof ui.createRowsReader,'function');let reads=0;const manager={library:[],data:{},rows(){reads++;return [{key:String(reads)}];}},read=ui.createRowsReader();
  assert.deepEqual(read(null),[]);const first=read(manager);assert.equal(read(manager),first);assert.equal(reads,1);
  manager.data={};assert.notEqual(read(manager),first);manager.library=[];read(manager);assert.equal(reads,3);
});

function overlayFixture() {
  const container=()=>({children:[],appendChild(node){if(node.parentNode)node.parentNode.children=node.parentNode.children.filter(child=>child!==node);this.children.push(node);node.parentNode=this;}});
  const body=container(), shadow=container(), fullscreen=container();fullscreen.shadowRoot=shadow;
  const doc={body,fullscreenElement:null}, node={parentNode:null,state:{popupOpen:true}};
  return {body,shadow,fullscreen,doc,node,container};
}
test('fullscreen popup is placed inside the custom element shadow tree, not invisible light DOM',()=>{
  assert.equal(typeof ui.placeOverlay,'function','Fullscreen overlay placement is not implemented');
  const {shadow,fullscreen,doc,node}=overlayFixture();doc.fullscreenElement=fullscreen;ui.placeOverlay(node,doc);
  assert.equal(node.parentNode,shadow);assert.equal(fullscreen.children.length,0);
});
test('fullscreen rerender restores the same open popup and fullscreen exit returns it to body',()=>{
  assert.equal(typeof ui.placeOverlay,'function','Fullscreen overlay placement is not implemented');
  const {body,shadow,fullscreen,doc,node}=overlayFixture();ui.placeOverlay(node,doc);assert.equal(node.parentNode,body);
  doc.fullscreenElement=fullscreen;ui.placeOverlay(node,doc);ui.placeOverlay(node,doc);assert.equal(shadow.children.length,1);
  shadow.children=[];node.parentNode=null;ui.placeOverlay(node,doc);assert.equal(node.parentNode,shadow);assert.equal(node.state.popupOpen,true);
  doc.fullscreenElement=null;ui.placeOverlay(node,doc);assert.equal(node.parentNode,body);assert.equal(shadow.children.length,0);
});
test('supports ordinary fullscreen containers and hides Gacha controls under unrelated fullscreen content',()=>{
  assert.equal(typeof ui.placeOverlay,'function','Fullscreen overlay placement is not implemented');
  const {doc,node,container}=overlayFixture();const fullscreen=container();doc.fullscreenElement=fullscreen;ui.placeOverlay(node,doc);assert.equal(node.parentNode,fullscreen);
  assert.equal(ui.isGachaVisible(element(),{...view,document:{fullscreenElement:element({tagName:'DIV'})}}),false);
});
