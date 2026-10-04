import * as pdfjs from './vendor/pdf.mjs';
import {makeCurl,paintCurl,finishCurl,prepareCurl} from './curl.js';
import {analyzePage,textBounds} from './page-layout.js';
import {attachPageLinks} from './pdf-links.js';
import {preparePageSound,playPageSound} from './page-sound.js';
pdfjs.GlobalWorkerOptions.workerSrc = './vendor/pdf.worker.mjs';
const $=id=>document.getElementById(id);
let pdf=null,bytes=null,name='',pages=[],index=0,zoom=1,tab='pages',marks=[],generation=0,renderGeneration=0,busy=false,searchGeneration=0,thumbObserver;
let bookProfile=null;
const cache=new Map();
const inFlight=new Map();let warmTimer,manualSplitSources=new Set(),lastTap=null,lastZoomGestureTime=0;
let wholeSources=new Set(),curl=null,gesture=null,suppressClickUntil=0;
function createCurl(direction){
 const sheet=makeCurl($('book'),direction,gesture?.y);if(!sheet)return null;curl=sheet;
 if(gesture){const next=pages[index+direction*count()];if(next)canvasFor(next,Math.min(2400,next.width*layoutAt(index+direction*count()).scale*layoutAt(index+direction*count()).ratio)).then(preview=>{if(curl!==sheet||!gesture)return;preview.className='curl-preview';preview.style.width=sheet.width+'px';preview.style.height=sheet.height+'px';preview.style.left=sheet.left+'px';sheet.preview=preview;sheet.old.style.visibility='hidden';$('book').insertBefore(preview,sheet.canvas)}).catch(()=>{});}
 return sheet;
}
function drawCurl(sheet,p){sheet.progress=p;sheet.pendingProgress=p;if(!sheet.gestureFrame)sheet.gestureFrame=requestAnimationFrame(()=>{sheet.gestureFrame=0;paintCurl(sheet,sheet.pendingProgress)})}
async function settleCurl(sheet,target){await finishCurl(sheet,target,bookSound);sheet.old.style.visibility='';sheet.preview?.remove();if(curl===sheet)curl=null;}
const safeStore={get(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}},set(key,value){try{localStorage.setItem(key,JSON.stringify(value))}catch{}}};
const key=()=>`list:${pdf?.fingerprints[0]}`;
const countAt=i=>pages[i]?.wholeSpread?1:($('view').value==='double'&&innerWidth>760&&!pages[i+1]?.wholeSpread?2:1);
const count=()=>countAt(index);
function toast(text){$('toast').textContent=text;$('toast').classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').classList.remove('show'),3500)}
function loading(on,text='Открываем книгу…'){$('loading').hidden=!on;$('loadingText').textContent=text}
function remember(){if(pdf)safeStore.set(key(),{index,marks,wholeSources:[...wholeSources],manualSplitSources:[...manualSplitSources],location:pages[index]?{source:pages[index].source,half:pages[index].half}:null})}
function bookSound(){if($('sound').checked)playPageSound()}
async function openPDF(data,filename,profile=null){const token=++generation;loading(true);try{const docTask=pdfjs.getDocument({data:data.slice(),cMapUrl:'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/cmaps/',cMapPacked:true,standardFontDataUrl:'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/standard_fonts/'});docTask.onPassword=(update,reason)=>{const password=prompt(reason===1?'Введите пароль PDF':'Неверный пароль. Попробуйте ещё раз');if(password===null)docTask.destroy();else update(password)};const doc=await docTask.promise;if(token!==generation){await doc.destroy();return}const previous=pdf;pdf=doc;bytes=data;name=filename;bookProfile=profile;await previous?.destroy();cache.clear();index=0;const saved=safeStore.get(key(),{});marks=saved.marks||[];wholeSources=new Set(saved.wholeSources||[]);manualSplitSources=new Set(saved.manualSplitSources||[]);await rebuild();
let location=saved.location;
if(!location&&saved.index){const legacy=[];for(let p=1;p<=pdf.numPages;p++){const v=(await pdf.getPage(p)).getViewport({scale:1});const split=!wholeSources.has(p)&&v.width/v.height>=1.2;for(let h=0;h<(split?2:1);h++)legacy.push({source:p,half:split?h:null})}location=legacy[saved.index]}
index=location?Math.max(0,pages.findIndex(e=>e.source===location.source&&(e.half===null||e.half===location.half))):0;$('title').textContent=name.replace(/\.pdf$/i,'');$('welcome').hidden=true;$('open').hidden=true;document.body.classList.add('reading');$('reader').hidden=false;$('navigation').hidden=false;$('progress').hidden=false;await render();await sidebar();}catch(error){console.error(error);toast('Не удалось открыть PDF. '+(error.name==='PasswordException'?'Нужен верный пароль.':'Проверьте, что файл не повреждён.'))}finally{if(token===generation)loading(false)}}
async function fileOpen(file){if(!file)return;if(!/\.pdf$/i.test(file.name)&&file.type!=='application/pdf'){toast('Выберите файл PDF');return}await openPDF(new Uint8Array(await file.arrayBuffer()),file.name)}
async function rebuild(){
 if(!pdf)return;const token=generation,doc=pdf,mode=$('split').value,next=[];
 for(let p=1;p<=doc.numPages;p++){
  if(p%8===0){$('loadingText').textContent='Проверяем развороты: '+p+' / '+doc.numPages;await new Promise(r=>setTimeout(r,0))}
  const prepared=bookProfile?.pages?.[p-1];const info=prepared?{shared:prepared.kind==='spread',width:prepared.width,height:prepared.height,reason:prepared.reason}:mode==='auto'?await analyzePage(doc,p):null;
  const v=info|| (await doc.getPage(p)).getViewport({scale:1});if(token!==generation)return;
  const wide=v.width/v.height>=1.2;
  const split=!wholeSources.has(p)&&(prepared?manualSplitSources.has(p)&&wide:(mode==='all'||mode==='auto'&&wide&&(!info.shared||manualSplitSources.has(p))));
  for(let half=0;half<(split?2:1);half++)next.push({source:p,half:split?half:null,width:split?v.width/2:v.width,height:v.height,wholeSpread:!split&&wide,reason:!split?info?.reason:null});
 }
 pages=next;cache.clear();inFlight.clear();index=Math.min(index,pages.length-1);$('status').textContent='PDF · '+pdf.numPages+' листов · '+pages.length+' страниц';$('progress').max=pages.length-1;$('pageTotal').textContent='/ '+pages.length;marks=marks.filter(m=>m<pages.length);
}
function canvasKey(entry,width){return entry.source+':'+entry.half+':'+Math.round(width)}
async function canvasFor(entry,width){
 const doc=pdf,token=generation,key=canvasKey(entry,width);let source=cache.get(key);
 if(!source){
  if(!inFlight.has(key))inFlight.set(key,(async()=>{const page=await doc.getPage(entry.source),viewport=page.getViewport({scale:width/entry.width}),canvas=document.createElement('canvas');canvas.width=Math.ceil(width);canvas.height=Math.ceil(entry.height*width/entry.width);await page.render({canvasContext:canvas.getContext('2d'),viewport,transform:[1,0,0,1,entry.half===1?-width:0,0],background:'#fff'}).promise;if(token===generation){cache.set(key,canvas);if(cache.size>8)cache.delete(cache.keys().next().value)}return canvas})());
  try{source=await inFlight.get(key)}finally{if(token===generation)inFlight.delete(key)}
 }
 const copy=document.createElement('canvas');copy.width=source.width;copy.height=source.height;copy.dataset.cacheKey=doc.fingerprints[0]+':'+key;copy.getContext('2d').drawImage(source,0,0);return copy;
}
function layoutAt(i){
 const n=countAt(i),entries=pages.slice(i,i+n),stage=$('stage'),width=Math.max(100,stage.clientWidth-(innerWidth<=760?8:40)),height=Math.max(100,stage.clientHeight-(innerWidth<=760?16:40));
 const total=entries.reduce((s,e)=>s+e.width,0),tallest=Math.max(...entries.map(e=>e.height));
 const scale=Math.min(width/(n===2&&entries.length===1?entries[0].width*2:total),height/tallest)*zoom;
 return {n,entries,scale,ratio:Math.min(devicePixelRatio||1,innerWidth<=760?1.5:2)};
}
function warmNeighbours(){
 clearTimeout(warmTimer);const token=generation,current=index;
 warmTimer=setTimeout(async()=>{prepareCurl();for(const i of [current+countAt(current),current-1]){
  if(token!==generation||current!==index||i<0||i>=pages.length)return;
  const l=layoutAt(i);for(const e of l.entries){if(token!==generation||current!==index)return;const width=Math.min(2400,e.width*l.scale*l.ratio);if(!cache.has(canvasKey(e,width)))try{await canvasFor(e,width)}catch{}}
 }},80);
}
async function render(direction=0){if(!pdf||!pages.length)return;const token=++renderGeneration;const book=$('book'),{n,entries,scale,ratio}=layoutAt(index);const canvases=await Promise.all(entries.map(async e=>{const c=await canvasFor(e,Math.min(2400,e.width*scale*ratio));c.style.width=`${e.width*scale}px`;c.style.height=`${e.height*scale}px`;return c}));if(token!==renderGeneration)return;let turning=curl;
if(direction&&$('animate').checked&&!matchMedia('(prefers-reduced-motion: reduce)').matches&&!turning)turning=createCurl(direction);
book.replaceChildren(...canvases);book.classList.toggle('double',n===2&&canvases.length===2);
if(turning){book.append(turning.canvas);await settleCurl(turning,1)}else if(direction){bookSound()}
attachPageLinks(pdf,pages,entries,canvases,book,()=>token===renderGeneration,target=>{if(!busy&&performance.now()>=suppressClickUntil)go(target)}).catch(()=>{});if(token!==renderGeneration)return;
$('pageInput').value=index+1;$('progress').value=index;$('bookInfo').textContent=`${index+1}${entries.length>1?'–'+(index+2):''} из ${pages.length} страниц`;$('prev').disabled=index===0;$('next').disabled=index+n>=pages.length;$('bookmark').textContent=marks.includes(index)?'★':'☆';$('wholeSpread').textContent=pages[index].wholeSpread?'Разделить этот разворот на страницы':'Показать этот разворот целиком';$('wholeSpread').disabled=!pages[index].wholeSpread&&pages[index].half===null;document.querySelectorAll('.thumb').forEach(el=>el.classList.toggle('active',Number(el.dataset.page)===index));remember();warmNeighbours()}
async function go(target,direction=0){if(!pdf||busy||!Number.isFinite(target))return;busy=true;try{const next=Math.max(0,Math.min(pages.length-1,target));if(next===index){if(curl)await settleCurl(curl,0);return}index=next;await render(direction)}catch(e){console.error(e);toast('Ошибка отображения страницы')}finally{busy=false}}
async function sidebar(){thumbObserver?.disconnect();$('sideContent').replaceChildren();if(!pdf){$('sideContent').textContent='Откройте PDF, чтобы увидеть страницы.';return}const content=$('sideContent');if(tab==='pages'){const token=generation;thumbObserver=new IntersectionObserver(async records=>{for(const item of records){if(!item.isIntersecting)continue;thumbObserver.unobserve(item.target);const i=Number(item.target.dataset.page);try{const c=await canvasFor(pages[i],150);if(token===generation&&item.target.isConnected)item.target.prepend(c)}catch{}}},{root:content,rootMargin:'200px'});pages.forEach((e,i)=>{const b=document.createElement('button');b.className='thumb'+(i===index?' active':'');b.dataset.page=i;b.style.minHeight='110px';const label=document.createElement('span');label.textContent=`Страница ${i+1}${e.half!==null?' · '+(e.half===0?'левая':'правая')+' половина':''}`;b.append(label);b.onclick=()=>go(i);content.append(b);thumbObserver.observe(b)})}else if(tab==='marks'){if(!marks.length)content.textContent='Нажмите ☆, чтобы сохранить страницу.';marks.slice().sort((a,b)=>a-b).forEach(i=>{const row=document.createElement('div'),b=document.createElement('button'),remove=document.createElement('button');b.textContent=`Страница ${i+1}`;b.onclick=()=>go(i);remove.textContent='×';remove.title='Удалить закладку';remove.onclick=()=>{marks=marks.filter(m=>m!==i);remember();sidebar();render()};row.append(b,remove);content.append(row)})}else{const input=document.createElement('input');input.className='search-input';input.placeholder='Найти в книге…';input.setAttribute('aria-label','Поиск по тексту');const results=document.createElement('div');content.append(input,results);let timer;input.oninput=()=>{clearTimeout(timer);++searchGeneration;timer=setTimeout(()=>search(input.value,results),350)};input.focus();const note=document.createElement('p');note.textContent='Для сканов без текстового слоя поиск недоступен.';note.style.color='var(--muted)';note.style.fontSize='11px';content.append(note)}}
async function search(query,results){const token=++searchGeneration,doc=pdf;results.replaceChildren();if(!query.trim())return;results.textContent='Ищем…';const found=[];for(let p=1;p<=doc.numPages;p++){const data=await(await doc.getPage(p)).getTextContent();if(token!==searchGeneration||doc!==pdf)return;const searchPage=await doc.getPage(p),searchView=searchPage.getViewport({scale:1});const matching=data.items.filter(t=>{if(!t.str?.toLocaleLowerCase().includes(query.toLocaleLowerCase()))return false;const b=textBounds(t,searchView);return b.left<searchView.width&&b.right>0&&b.top<searchView.height&&b.bottom>0});for(const match of matching){const page=await doc.getPage(p),v=page.getViewport({scale:1}),point=v.convertToViewportPoint(match.transform[4],match.transform[5]);const i=pages.findIndex(e=>e.source===p&&(e.half===null||e.half===(point[0]>=v.width/2?1:0)));found.push({i,text:match.str})}}if(token!==searchGeneration)return;results.replaceChildren();if(!found.length)results.textContent='Совпадений не найдено';found.slice(0,200).forEach(hit=>{const b=document.createElement('button');b.className='result';b.textContent=`Стр. ${hit.i+1} · ${hit.text}`;b.onclick=()=>go(hit.i);results.append(b)})}
function download(data,filename,type='application/pdf'){const url=URL.createObjectURL(new Blob([data],{type})),a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000)}
$('open').onclick=$('welcomeOpen').onclick=()=>$('file').click();$('file').onchange=async e=>{await fileOpen(e.target.files[0]);e.target.value=''};
$('demo').onclick=()=>loadDefaultBook();
$('prev').onclick=()=>go(index-count(),-1);$('next').onclick=()=>go(index+count(),1);$('first').onclick=()=>go(0,-1);$('last').onclick=()=>go(pages.length-1,1);$('pageInput').onchange=e=>go(Number(e.target.value)-1);$('progress').oninput=e=>go(Number(e.target.value));
$('sidebar').classList.add('collapsed');$('sideToggle').onclick=()=>{$('sidebar').classList.toggle('collapsed');requestAnimationFrame(()=>render())};$('closeSide').onclick=()=>{$('sidebar').classList.add('collapsed');render()};
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{tab=b.dataset.tab;++searchGeneration;document.querySelectorAll('[data-tab]').forEach(t=>t.classList.toggle('active',t===b));sidebar()});
$('bookmark').onclick=()=>{if(!pdf)return;marks=marks.includes(index)?marks.filter(m=>m!==index):[...marks,index];remember();render();if(tab==='marks')sidebar()};
$('theme').onclick=()=>{document.body.classList.toggle('dark');safeStore.set('list:dark',document.body.classList.contains('dark'))};document.body.classList.toggle('dark',safeStore.get('list:dark',false));
$('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen()}catch{toast('Полноэкранный режим недоступен')}};
$('settingsToggle').onclick=()=>$('settings').hidden=!$('settings').hidden;
$('view').onchange=()=>render();$('split').onchange=async()=>{if(!pdf)return;loading(true,'Разделяем страницы…');try{++searchGeneration;await rebuild();await render();await sidebar();toast(`Готово: ${pages.length} страниц`)}catch(e){toast('Не удалось разделить PDF')}finally{loading(false)}};
async function setZoom(value){zoom=Math.min(3,Math.max(.5,value));document.body.classList.toggle('zoomed',zoom!==1);$('zoomReset').textContent=Math.round(zoom*100)+'%';await render()}$('zoomIn').onclick=()=>setZoom(zoom+.25);$('zoomOut').onclick=()=>setZoom(zoom-.25);$('zoomReset').onclick=()=>setZoom(1);
$('download').onclick=()=>bytes?download(bytes,name):toast('Сначала откройте PDF');
$('export').onclick=async()=>{if(!pdf)return toast('Сначала откройте PDF');loading(true,'Создаём PDF с отдельными страницами…');try{const {PDFDocument,degrees}=PDFLib,src=await PDFDocument.load(bytes),out=await PDFDocument.create();const copied=await out.copyPages(src,pages.map(e=>e.source-1));for(const [pageIndex,entry] of pages.entries()){const page=copied[pageIndex];const box=page.getCropBox(),rotation=((page.getRotation().angle%360)+360)%360;if(entry.half!==null){let{x,y,width,height}=box;if(rotation===90||rotation===270){height/=2;y+=(rotation===90?entry.half===1:entry.half===0)?height:0}else{width/=2;x+=(rotation===180?1-entry.half:entry.half)*width}page.setMediaBox(x,y,width,height);page.setCropBox(x,y,width,height)}out.addPage(page)}download(await out.save(),name.replace(/\.pdf$/i,'')+' — отдельные страницы.pdf');toast('Разделённый PDF сохранён')}catch(e){console.error(e);toast('Не удалось сохранить PDF. Для защищённых файлов экспорт может быть недоступен.')}finally{loading(false)}};
$('print').onclick=()=>{if(!bytes)return toast('Сначала откройте PDF');const url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));const win=window.open(url);if(!win)toast('Разрешите всплывающее окно для печати');else win.onload=()=>win.print();setTimeout(()=>URL.revokeObjectURL(url),120000)};
document.addEventListener('keydown',e=>{if(/INPUT|SELECT|TEXTAREA/.test(e.target.tagName))return;if(e.key==='ArrowRight'){e.preventDefault();go(index+count(),1)}if(e.key==='ArrowLeft'){e.preventDefault();go(index-count(),-1)}if(e.key.toLowerCase()==='f')$('fullscreen').click();if(e.key==='+'||e.key==='=')setZoom(zoom+.25);if(e.key==='-')setZoom(zoom-.25);if(e.key==='Escape'){$('settings').hidden=true;$('sidebar').classList.add('collapsed');render()}});
let resizeTimer;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>render(),160)});
// Pointer gestures distinguish horizontal page turns from scrolling and zoomed panning.
$('stage').addEventListener('pointerdown',e=>{if(!pdf||busy||zoom!==1||e.pointerType==='mouse'&&e.button!==0)return;if(gesture){cancelGesture();return}gesture={id:e.pointerId,x:e.clientX,y:e.clientY,time:performance.now(),direction:0};});
$('stage').addEventListener('pointermove',e=>{if(!gesture||gesture.id!==e.pointerId)return;const dx=e.clientX-gesture.x,dy=e.clientY-gesture.y;if(!gesture.direction){if(Math.abs(dy)>12&&Math.abs(dy)>Math.abs(dx)){gesture=null;return}if(Math.abs(dx)<10||Math.abs(dx)<Math.abs(dy)*1.2)return;const direction=dx<0?1:-1;if(direction>0&&index+count()>=pages.length||direction<0&&index===0){gesture=null;return}gesture.direction=direction;$('stage').setPointerCapture(e.pointerId);if($('animate').checked&&!matchMedia('(prefers-reduced-motion: reduce)').matches)curl=createCurl(direction);}if(gesture.direction){e.preventDefault();gesture.distance=Math.max(0,dx*-gesture.direction);if(curl){curl.dragY=Math.max(-.4,Math.min(.4,dy/curl.height));drawCurl(curl,Math.min(.88,gesture.distance/curl.width));}}});
$('stage').addEventListener('pointerup',e=>{if(!gesture||gesture.id!==e.pointerId)return;const current=gesture;gesture=null;if(!current.direction){if(e.pointerType==='touch'&&performance.now()-current.time<280){const now=performance.now();if(lastTap&&now-lastTap.time<320&&Math.hypot(e.clientX-lastTap.x,e.clientY-lastTap.y)<24){lastTap=null;lastZoomGestureTime=now;zoomAt(e)}else lastTap={time:now,x:e.clientX,y:e.clientY}}return;}suppressClickUntil=performance.now()+600;const elapsed=performance.now()-current.time,distance=current.distance||0;if(distance>Math.min(90,$('stage').clientWidth*.22)||distance>28&&distance/elapsed>.35)go(index+current.direction*count(),current.direction);else if(curl)cancelGesture();});
async function cancelGesture(){gesture=null;if(curl){busy=true;try{await settleCurl(curl,0)}finally{busy=false}}}
$('stage').addEventListener('pointercancel',cancelGesture);
let dragDepth=0;window.addEventListener('dragenter',e=>{e.preventDefault();if(e.dataTransfer.types.includes('Files')){dragDepth++;document.body.classList.add('drag')}});window.addEventListener('dragover',e=>e.preventDefault());window.addEventListener('dragleave',()=>{if(--dragDepth<=0)document.body.classList.remove('drag')});window.addEventListener('drop',e=>{e.preventDefault();dragDepth=0;document.body.classList.remove('drag');fileOpen(e.dataTransfer.files[0])});
$('book').addEventListener('click',e=>{if(e.target.closest('.pdf-link'))return;if(innerWidth<=760||performance.now()<suppressClickUntil||zoom!==1||busy)return;const box=$('book').getBoundingClientRect(),x=e.clientX-box.left;if(x<box.width*.2)go(index-count(),-1);else if(x>box.width*.8)go(index+count(),1)});
sidebar();

$('changeFile').onclick=()=>{$('settings').hidden=true;$('file').click()};
$('wholeSpread').onclick=async()=>{if(!pdf)return;const source=pages[index].source,wasWhole=pages[index].wholeSpread;const marked=marks.map(i=>pages[i]).filter(Boolean);if(wasWhole){wholeSources.delete(source);manualSplitSources.add(source)}else{wholeSources.add(source);manualSplitSources.delete(source)}loading(true,'Обновляем разворот…');try{await rebuild();index=pages.findIndex(e=>e.source===source);marks=marked.map(m=>pages.findIndex(e=>e.source===m.source&&(m.half===null||e.half===m.half||e.half===null))).filter(i=>i>=0);await render();await sidebar();$('settings').hidden=true;toast(wasWhole?'Разворот разделён на страницы':'Этот разворот сохранён целиком')}finally{loading(false)}};

$('sound').checked=safeStore.get('list:sound',true);
function unlockPageSound(){if($('sound').checked)preparePageSound()}
document.addEventListener('pointerdown',unlockPageSound,{passive:true});
document.addEventListener('keydown',unlockPageSound);
$('sound').addEventListener('change',()=>{safeStore.set('list:sound',$('sound').checked);unlockPageSound()});

$('stage').addEventListener('dblclick',e=>{if(performance.now()-lastZoomGestureTime<500)return;zoomAt(e)});

async function zoomAt(e){if(!pdf||busy||e.target.closest('.pdf-link'))return;e.preventDefault();const box=$('book').getBoundingClientRect(),x=(e.clientX-box.left)/box.width,y=(e.clientY-box.top)/box.height;await setZoom(zoom===1?(pages[index].wholeSpread?2:1.5):1);if(zoom>1){const stage=$('stage');stage.scrollLeft=x*$('book').offsetWidth-stage.clientWidth/2;stage.scrollTop=y*$('book').offsetHeight-stage.clientHeight/2}}

async function loadDefaultBook(){
 $('welcome').hidden=true;loading(true,'Открываем книгу…');
 try{
  const response=await fetch(new URL('./output/pdf/book.json',import.meta.url));if(!response.ok)throw Error('Не найден book.json');
  const profile=await response.json(),file=await fetch(new URL(profile.pdf,import.meta.url));if(!file.ok)throw Error('Не найден подготовленный PDF');
  await openPDF(new Uint8Array(await file.arrayBuffer()),profile.title+'.pdf',profile);
 }catch(e){console.error(e);toast('Не удалось загрузить книгу. Проверьте, что папка output/pdf опубликована вместе с сайтом.');$('welcome').hidden=false;}
 finally{loading(false)}
}
loadDefaultBook();
