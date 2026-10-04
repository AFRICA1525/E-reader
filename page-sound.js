// Recorded paper sound, stored locally; no third-party request during reading.
let context,buffer,decoding,last=-1;
let sample=fetch(new URL('./assets/page-turn.mp3',import.meta.url)).then(r=>{if(!r.ok)throw Error('Page sound unavailable');return r.arrayBuffer()}).catch(()=>null);
export function preparePageSound(){
 try{
  context??=new(window.AudioContext||window.webkitAudioContext)();
  if(context.state==='suspended')context.resume().catch(()=>{});
  if(!buffer&&!decoding)decoding=sample.then(data=>data?context.decodeAudioData(data.slice(0)):null).then(decoded=>{buffer=decoded}).catch(()=>{}).finally(()=>{decoding=null});
 }catch{}
}
export function playPageSound(){
 if(!context||context.state!=='running'||!buffer)return;
 const variants=[{rate:.95,gain:.6},{rate:1,gain:.55},{rate:1.06,gain:.5}];
 let i=Math.floor(Math.random()*(variants.length-1));if(i>=last)i++;last=i;
 const source=context.createBufferSource(),gain=context.createGain();source.buffer=buffer;source.playbackRate.value=variants[i].rate;gain.gain.value=variants[i].gain;
 source.connect(gain);gain.connect(context.destination);source.onended=()=>{source.disconnect();gain.disconnect()};source.start();
}
