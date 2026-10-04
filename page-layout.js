const analyses=new WeakMap();
export function textBounds(item,viewport){
 const t=item.transform,h=Math.hypot(t[2],t[3])||item.height||1,n=Math.hypot(t[0],t[1])||1;
 const dx=item.width*t[0]/n,dy=item.width*t[1]/n,hx=t[2]/h*(item.height||h),hy=t[3]/h*(item.height||h);
 const points=[[t[4],t[5]],[t[4]+dx,t[5]+dy],[t[4]+hx,t[5]+hy],[t[4]+dx+hx,t[5]+dy+hy]].map(p=>viewport.convertToViewportPoint(...p));
 return {left:Math.min(...points.map(p=>p[0])),right:Math.max(...points.map(p=>p[0])),top:Math.min(...points.map(p=>p[1])),bottom:Math.max(...points.map(p=>p[1]))};
}
export function inspectText(items,viewport){
 const center=viewport.width/2,margin=Math.max(1,viewport.width*.002);
 const crossings=items.filter(i=>i.str?.trim()).map(i=>({text:i.str,...textBounds(i,viewport)})).filter(b=>b.left<center-margin&&b.right>center+margin);
 return {shared:crossings.length>0,reason:crossings.some(b=>b.top>viewport.height*.15)?'Текст пересекает середину листа':crossings.length?'Общий заголовок на развороте':null};
}
export async function analyzePage(doc,source){
 if(!analyses.has(doc))analyses.set(doc,new Map());const cache=analyses.get(doc);if(cache.has(source))return cache.get(source);
 const work=(async()=>{
  const page=await doc.getPage(source),viewport=page.getViewport({scale:1});
  if(viewport.width/viewport.height<1.2)return {shared:false,width:viewport.width,height:viewport.height};
  const text=await page.getTextContent(),result=inspectText(text.items,viewport);
  // Cross-page tables/illustrations and scans may have no crossing text items.
  if(!result.shared&&typeof document!=='undefined'){
   const view=page.getViewport({scale:240/viewport.width}),canvas=document.createElement('canvas');canvas.width=Math.ceil(view.width);canvas.height=Math.ceil(view.height);
   await page.render({canvasContext:canvas.getContext('2d'),viewport:view,background:'#fff'}).promise;
   const data=canvas.getContext('2d',{willReadFrequently:true}).getImageData(0,0,canvas.width,canvas.height).data;
   const center=Math.floor(canvas.width/2);let activeRows=0,run=0,longest=0;
   for(let y=2;y<canvas.height-2;y++){
    let ink=0;for(let x=center-2;x<=center+2;x++){const p=(y*canvas.width+x)*4;if(data[p]*.3+data[p+1]*.59+data[p+2]*.11<160)ink++;}
    if(ink>=3){activeRows++;longest=Math.max(longest,++run)}else run=0;
   }
   if(activeRows>=4||longest>=3){result.shared=true;result.reason='Графика или таблица пересекает середину листа';}
   canvas.width=canvas.height=1;
  }
  return {...result,width:viewport.width,height:viewport.height};
 })();cache.set(source,work);return work;
}
