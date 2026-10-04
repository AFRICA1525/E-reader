// One connected, textured sheet. Shared mesh vertices prevent cracks between faces.
let surface;
const vertexSource=`
attribute vec2 uv;
uniform vec2 size,screen;
uniform float progress,anchor,dragY,direction,margin,padding;
varying vec2 tex;
varying float facing,bend;
void main(){
 float pi=3.14159265,flex=sin(progress*pi),corner=(anchor-.5)*2.;
 float a=(progress-.31*flex+corner*(uv.y-.5)*flex*.48)*pi;
 float b=.62*flex*pi,angle=a+b*uv.x;
 float x,z;
 if(abs(b)<.0001){x=size.x*uv.x*cos(a);z=size.x*uv.x*sin(a);}
 else{x=size.x*(sin(angle)-sin(a))/b;z=size.x*(cos(a)-cos(angle))/b;}
 bend=sin(pi*uv.x)*flex;
 float y=uv.y*size.y+bend*(corner*(1.-uv.x)*size.y*.075+dragY*size.y*.15);
 if(direction<0.)x=size.x-x;
 gl_Position=vec4((margin+x)/screen.x*2.-1.,1.-(padding+y)/screen.y*2.,-z/(size.x*2.),1.);
 tex=vec2(direction>0.?uv.x:1.-uv.x,uv.y);facing=cos(angle);
}`;
const fragmentSource=`
precision mediump float;
uniform sampler2D page;
uniform float opacity;
varying vec2 tex;
varying float facing,bend;
void main(){
 vec3 ink=texture2D(page,tex).rgb;
 vec3 paper=mix(vec3(.97,.96,.93),ink,.075);
 vec3 color=facing<0.?paper:ink;
 float shade=1.-.13*(1.-abs(facing))-.035*bend;
 gl_FragColor=vec4(color*shade,opacity);
}`;
function renderer(){
 if(surface&&!surface.gl.isContextLost())return surface;
 const canvas=document.createElement('canvas'),gl=canvas.getContext('webgl',{alpha:true,antialias:true,premultipliedAlpha:false});
 if(!gl)return null;
 function shader(type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;}
 const vs=shader(gl.VERTEX_SHADER,vertexSource),fs=shader(gl.FRAGMENT_SHADER,fragmentSource),program=gl.createProgram();
 gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));gl.deleteShader(vs);gl.deleteShader(fs);gl.useProgram(program);
 const cols=128,rows=16,vertices=[],indices=[];
 for(let y=0;y<=rows;y++)for(let x=0;x<=cols;x++)vertices.push(x/cols,y/rows);
 for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){const a=y*(cols+1)+x,b=a+1,c=a+cols+1,d=c+1;indices.push(a,c,b,b,c,d);}
 const vb=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,vb);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices),gl.STATIC_DRAW);
 const attribute=gl.getAttribLocation(program,'uv');gl.enableVertexAttribArray(attribute);gl.vertexAttribPointer(attribute,2,gl.FLOAT,false,0,0);
 const ib=gl.createBuffer();gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ib);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(indices),gl.STATIC_DRAW);
 const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
 const uniforms=Object.fromEntries(['size','screen','progress','anchor','dragY','direction','margin','padding','opacity'].map(n=>[n,gl.getUniformLocation(program,n)]));
 gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.clearColor(0,0,0,0);
 surface={canvas,gl,uniforms,texture,count:indices.length};return surface;
}
export function makeCurl(book,direction,grabY){
 const leaves=[...book.querySelectorAll(':scope > canvas:not(.curl-sheet):not(.curl-preview)')],old=leaves[direction>0?leaves.length-1:0];if(!old)return null;
 const width=parseFloat(old.style.width),height=parseFloat(old.style.height),rect=old.getBoundingClientRect();
 const anchor=Number.isFinite(grabY)?Math.max(0,Math.min(1,(grabY-rect.top)/rect.height)):.5;
 let gpu;try{gpu=renderer()}catch(e){console.warn('Continuous page fallback:',e.message)}
 const canvas=gpu?.canvas||document.createElement('canvas'),margin=width,padding=80,ratio=Math.min(devicePixelRatio||1,1.5);
 canvas.className='curl-sheet';canvas.width=Math.ceil((width+2*margin)*ratio);canvas.height=Math.ceil((height+2*padding)*ratio);
 canvas.style.cssText=`position:absolute;width:${width+2*margin}px;height:${height+2*padding}px;top:${-padding}px;opacity:1`;
 const left=direction>0&&leaves.length>1?parseFloat(leaves[0].style.width):0;canvas.style.left=left-margin+'px';
 if(gpu){const{gl}=gpu;gl.bindTexture(gl.TEXTURE_2D,gpu.texture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,old);}
 book.append(canvas);return{canvas,old,width,height,margin,padding,direction,anchor,dragY:0,progress:0,left,gpu};
}
function fallback(sheet,p){
 const{canvas,old,width,height,margin,padding,direction,anchor}=sheet,ctx=canvas.getContext('2d'),ratio=canvas.width/(width+2*margin),flex=Math.sin(p*Math.PI);
 ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,width+2*margin,height+2*padding);ctx.save();ctx.translate(margin,padding);
 if(direction<0){ctx.translate(width,0);ctx.scale(-1,1)}
 const tilt=(anchor-.5)*flex*width*.25,fold=width*(1-p),top=fold+tilt,bottom=fold-tilt;
 ctx.save();ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(Math.max(0,top),0);ctx.lineTo(Math.max(0,bottom),height);ctx.lineTo(0,height);ctx.closePath();ctx.clip();
 if(direction<0){ctx.translate(width,0);ctx.scale(-1,1)}ctx.drawImage(old,0,0,width,height);ctx.restore();
 ctx.beginPath();ctx.moveTo(top,0);ctx.lineTo(bottom,height);ctx.lineTo(bottom-width*p,height);ctx.quadraticCurveTo(top-width*p*.85,height*anchor,top-width*p,0);ctx.closePath();
 const shade=ctx.createLinearGradient(fold-width*p,0,fold,0);shade.addColorStop(0,'#f8f6ef');shade.addColorStop(.7,'#e5e1d7');shade.addColorStop(1,'#bdb9b0');ctx.fillStyle=shade;ctx.fill();ctx.restore();
}
export function paintCurl(sheet,progress){
 const p=Math.max(0,Math.min(1,progress));sheet.progress=p;const opacity=p>.94?(1-p)/.06:1;
 if(sheet.gpu&&!sheet.gpu.gl.isContextLost()){
  const{gl,uniforms:u}=sheet.gpu;gl.viewport(0,0,sheet.canvas.width,sheet.canvas.height);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  gl.uniform2f(u.size,sheet.width,sheet.height);gl.uniform2f(u.screen,sheet.width+sheet.margin*2,sheet.height+sheet.padding*2);
  for(const [name,value] of Object.entries({progress:p,anchor:sheet.anchor,dragY:sheet.dragY,direction:sheet.direction,margin:sheet.margin,padding:sheet.padding,opacity}))gl.uniform1f(u[name],value);
  gl.drawElements(gl.TRIANGLES,sheet.gpu.count,gl.UNSIGNED_SHORT,0);
 }else{
  if(sheet.gpu){const replacement=document.createElement('canvas');replacement.width=sheet.canvas.width;replacement.height=sheet.canvas.height;replacement.className=sheet.canvas.className;replacement.style.cssText=sheet.canvas.style.cssText;sheet.canvas.replaceWith(replacement);sheet.canvas=replacement;sheet.gpu=null;surface=null;}
  fallback(sheet,p);sheet.canvas.style.opacity=String(opacity);
 }
}
export function finishCurl(sheet,target,onTurn){
 if(sheet.animation)cancelAnimationFrame(sheet.animation);
 const from=sheet.progress,start=performance.now(),duration=Math.max(140,Math.abs(target-from)*560);let sounded=false;
 return new Promise(resolve=>{function frame(now){const t=Math.min(1,(now-start)/duration),ease=t*t*(3-2*t),p=from+(target-from)*ease;paintCurl(sheet,p);if(target===1&&!sounded&&p>=.52){sounded=true;onTurn?.()}if(t<1)sheet.animation=requestAnimationFrame(frame);else{sheet.canvas.remove();resolve()}}sheet.animation=requestAnimationFrame(frame)});
}
