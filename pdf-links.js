const cache=new WeakMap();
function cached(doc,key,build){if(!cache.has(doc))cache.set(doc,new Map());const entries=cache.get(doc);if(!entries.has(key))entries.set(key,Promise.resolve().then(build));return entries.get(key);}
export async function resolveDestination(doc,destination){
 if(!destination)return null;
 return cached(doc,'dest:'+JSON.stringify(destination),async()=>{
  const dest=typeof destination==='string'?await doc.getDestination(destination):destination;if(!Array.isArray(dest))return null;
  const source=typeof dest[0]==='number'?dest[0]+1:await doc.getPageIndex(dest[0])+1;
  if(source<1||source>doc.numPages)return null;
  const page=await doc.getPage(source),view=page.getViewport({scale:1}),type=dest[1]?.name;
  let x=page.view[0],y=page.view[3];
  if(type==='XYZ'||type==='FitR'){if(Number.isFinite(dest[2]))x=dest[2];if(Number.isFinite(dest[3]))y=dest[3];}
  else if(type==='FitH'||type==='FitBH'){if(Number.isFinite(dest[2]))y=dest[2];}
  else if(type==='FitV'||type==='FitBV'){if(Number.isFinite(dest[2]))x=dest[2];}
  const point=view.convertToViewportPoint(x,y);return{source,half:point[0]>=view.width/2?1:0};
 });
}
export function destinationIndex(pages,target){return pages.findIndex(e=>e.source===target.source&&(e.half===null||e.half===target.half));}
export async function pageLinks(doc,entry){
 return cached(doc,`links:${entry.source}:${entry.half}`,async()=>{
  const page=await doc.getPage(entry.source),view=page.getViewport({scale:1}),annotations=await page.getAnnotations({intent:'display'}),links=[];
  const cropLeft=entry.half===1?view.width/2:0,cropWidth=entry.half===null?view.width:view.width/2;
  for(const annotation of annotations){
   if(annotation.subtype!=='Link'||!annotation.dest||!annotation.rect)continue;
   const box=view.convertToViewportRectangle(annotation.rect),left=Math.max(cropLeft,Math.min(box[0],box[2])),right=Math.min(cropLeft+cropWidth,Math.max(box[0],box[2])),top=Math.max(0,Math.min(box[1],box[3])),bottom=Math.min(view.height,Math.max(box[1],box[3]));
   if(right<=left||bottom<=top)continue;
   try{const target=await resolveDestination(doc,annotation.dest);if(target)links.push({x:(left-cropLeft)/cropWidth,y:top/view.height,width:(right-left)/cropWidth,height:(bottom-top)/view.height,target});}catch{}
  }
  return links;
 });
}
export async function attachPageLinks(doc,pages,entries,canvases,book,isCurrent,navigate){
 const groups=await Promise.all(entries.map(e=>pageLinks(doc,e)));if(!isCurrent())return;
 book.querySelector('.pdf-links')?.remove();const layer=document.createElement('div');layer.className='pdf-links';let offset=0;
 groups.forEach((links,i)=>{const width=parseFloat(canvases[i].style.width),height=parseFloat(canvases[i].style.height);
  links.forEach(link=>{const index=destinationIndex(pages,link.target);if(index<0)return;const button=document.createElement('button');button.type='button';button.className='pdf-link';button.setAttribute('aria-label',`Перейти к странице ${index+1}`);button.title=`Перейти к странице ${index+1}`;button.style.cssText=`left:${offset+link.x*width}px;top:${link.y*height}px;width:${link.width*width}px;height:${link.height*height}px`;button.onclick=e=>{e.stopPropagation();navigate(index)};layer.append(button)});offset+=width;
 });book.append(layer);
}
