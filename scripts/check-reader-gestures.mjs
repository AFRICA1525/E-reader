// Exercise the actual input handlers with two simultaneous touch pointers.
// This checks pinch/pan state without requiring a physical touch screen.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const listeners = new Map(), elements = new Map();
const classes = () => ({toggle(){},add(){},remove(){}});
function element(id) {
  if (!elements.has(id)) elements.set(id,{
    style:{},dataset:{},classList:classes(),hidden:false,value:'',textContent:'',
    clientWidth:390,clientHeight:673,scrollLeft:0,scrollTop:0,offsetLeft:12,offsetTop:12,
    children:[],append(...children){this.children.push(...children);},remove(){this.removed=true;},
    querySelector:()=>element('span'),querySelectorAll:()=>[],setAttribute(){},
    addEventListener(type,fn){listeners.set(`${id}:${type}`,fn);},setPointerCapture(){},
    getBoundingClientRect(){return {left:0,top:0,width:390,height:673};},
    scrollTo(x,y){this.scrollLeft=x;this.scrollTop=y;}
  });
  return elements.get(id);
}
const canvas={style:{width:'366px',height:'518.5px'}};
const book=element('book');
book.querySelector=()=>null; book.querySelectorAll=()=>[canvas];
Object.defineProperties(book,{
  offsetWidth:{get:()=>parseFloat(canvas.style.width)},
  offsetHeight:{get:()=>parseFloat(canvas.style.height)}
});
book.getBoundingClientRect=()=>({left:12-element('stage').scrollLeft,top:12-element('stage').scrollTop,width:book.offsetWidth,height:book.offsetHeight});
const context=vm.createContext({
  console,performance,Map,Math,Number,Promise,setTimeout,clearTimeout,
  innerWidth:390,devicePixelRatio:1,
  matchMedia:query=>({matches:!query.includes('prefers-reduced-motion'),addEventListener(){}}),
  document:{getElementById:element,querySelector:element,querySelectorAll:()=>[],createElement:()=>element(`created-${elements.size}`),body:{classList:classes()},addEventListener(){}},
  window:{addEventListener(){}},
  localStorage:{setItem(){},getItem(){return '0';}},
  pdfjs:{GlobalWorkerOptions:{}},
  preparePageSound(){},prepareCurl(){},playPageSound(){},
  makeCurl:()=>({canvas:{isConnected:true,remove(){}},old:canvas,width:366,height:518.5,progress:0}),
  paintCurl:(sheet,progress)=>{sheet.progress=progress;},
  finishCurl:async sheet=>{sheet.canvas.remove();},
  requestAnimationFrame:fn=>fn(),
});
const source=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8')
  .replace(/^import .*;\r?\n/gm,'').replaceAll('import.meta.url',JSON.stringify('http://localhost/app.js')).replace(/loadBook\(\);\s*$/,'');
vm.runInContext(source,context);
vm.runInContext('pdf={}; profile={width:480,height:680}; pages=Array.from({length:215},(_,i)=>({source:i+1,width:480,height:680})); render=async()=>true;',context);
assert.equal(vm.runInContext('layout(0).entries.length',context),1,'cover must stand alone on a phone');
assert.equal(vm.runInContext('layout(1).entries.length',context),1,'phone reads one page');
vm.runInContext('phoneQuery.matches=false',context);
assert.equal(vm.runInContext('adjacentPage(1,0)',context),1);
assert.equal(vm.runInContext('adjacentPage(-1,1)',context),0);
assert.equal(vm.runInContext('adjacentPage(1,1)',context),3);
assert.equal(vm.runInContext('adjacentPage(-1,3)',context),1);
assert.equal(vm.runInContext('normalizePage(2)',context),1,'page three belongs to the first spread');
vm.runInContext('phoneQuery.matches=false',context);
assert.equal(vm.runInContext('layout(0).entries.length',context),1,'cover must stand alone on a desktop');
assert.equal(vm.runInContext('layout(1).entries.length',context),2);
vm.runInContext('phoneQuery.matches=true',context);
const pointer=(id,x,y)=>({pointerId:id,pointerType:'touch',clientX:x,clientY:y,button:0,target:{closest:()=>null},preventDefault(){}});
const dispatch=(type,event)=>listeners.get(`stage:${type}`)(event);
dispatch('pointerdown',pointer(1,100,200));
dispatch('pointerdown',pointer(2,200,200));
dispatch('pointermove',pointer(2,300,200));
assert.equal(vm.runInContext('zoom',context),2);
assert.equal(vm.runInContext('gesture',context),null,'pinch must not turn the page');
await dispatch('pointerup',pointer(2,300,200));
await dispatch('pointerup',pointer(1,100,200));
assert.equal(vm.runInContext('pinch',context),null);
dispatch('pointerdown',pointer(3,250,300));
dispatch('pointermove',pointer(3,150,220));
assert.ok(element('stage').scrollLeft>0);
assert.ok(element('stage').scrollTop>0);
await dispatch('pointerup',pointer(3,150,220));
assert.equal(vm.runInContext('index',context),0,'panning must not turn the page');
vm.runInContext('zoom=1;',context);
dispatch('pointerdown',pointer(4,100,200));
dispatch('pointerdown',pointer(5,110,200));
dispatch('pointermove',pointer(5,300,200));
assert.equal(vm.runInContext('zoom',context),4,'pinch zoom is capped at 400%');
await dispatch('pointercancel',pointer(5,300,200));
assert.equal(vm.runInContext('pinch',context),null);
vm.runInContext('pointers.clear(); zoom=1; index=0; canvasFor=async()=>document.createElement("canvas");',context);
dispatch('pointerdown',pointer(6,250,200));
dispatch('pointermove',pointer(6,200,200));
await new Promise(setImmediate);
assert.equal(vm.runInContext('curl.preview.children[0].dataset.previewPage',context),2,'next phone page appears while the pointer is still held');
assert.equal(canvas.style.visibility,'hidden','stationary old page must not show below the curl');
await vm.runInContext('cancelGesture()',context);
assert.equal(canvas.style.visibility,'','cancel restores the current page');
assert.equal(vm.runInContext('index',context),0);
vm.runInContext('pointers.clear(); phoneQuery.matches=false; index=3;',context);
dispatch('pointerdown',pointer(7,100,200));
dispatch('pointermove',pointer(7,150,200));
await new Promise(setImmediate);
assert.deepEqual(vm.runInContext('Array.from(curl.preview.children,p=>p.dataset.previewPage).join(",")',context),'2,3','previous desktop spread appears during a reverse drag');
await vm.runInContext('cancelGesture()',context);
assert.equal(canvas.style.visibility,'');
console.log('PASS: pinch, pan, zoom limit, next-page preview, reverse spread, cancellation.');
