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
  matchMedia:()=>({matches:true,addEventListener(){}}),
  document:{getElementById:element,querySelector:element,querySelectorAll:()=>[],body:{classList:classes()},addEventListener(){}},
  window:{addEventListener(){}},
  localStorage:{setItem(){},getItem(){return '0';}},
  pdfjs:{GlobalWorkerOptions:{}},
  preparePageSound(){},prepareCurl(){},playPageSound(){},
  requestAnimationFrame:fn=>fn(),
});
const source=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8')
  .replace(/^import .*;\r?\n/gm,'').replaceAll('import.meta.url',JSON.stringify('http://localhost/app.js')).replace(/loadBook\(\);\s*$/,'');
vm.runInContext(source,context);
vm.runInContext('pdf={}; profile={width:480,height:680}; pages=Array.from({length:215},(_,i)=>({source:i+1})); render=async()=>true;',context);
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
console.log('PASS: pinch, pan, zoom limit, pointer cleanup; no accidental page turn.');
