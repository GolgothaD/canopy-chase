// WebAudio chiptune + jungle percussion, all synthesized.
(function(root){
const A={ctx:null,on:true,music:null,master:null};
A.init=function(){if(A.ctx){if(A.ctx.state==='suspended')A.ctx.resume();return}const C=window.AudioContext||window.webkitAudioContext;if(!C)return;A.ctx=new C();A.master=A.ctx.createGain();A.master.gain.value=0.5;A.master.connect(A.ctx.destination)};
A.setOn=function(v){A.on=v;if(A.master)A.master.gain.value=v?0.5:0};
function tone(f,d,type,vol,t0,slide){const c=A.ctx;if(!c||!A.on)return;const t=(t0||c.currentTime),o=c.createOscillator(),g=c.createGain();o.type=type||'square';o.frequency.setValueAtTime(f,t);if(slide)o.frequency.exponentialRampToValueAtTime(slide,t+d);g.gain.setValueAtTime(vol||0.12,t);g.gain.exponentialRampToValueAtTime(0.0008,t+d);o.connect(g);g.connect(A.master);o.start(t);o.stop(t+d+0.02)}
function noise(d,vol,t0,hp){const c=A.ctx;if(!c||!A.on)return;const t=t0||c.currentTime,b=c.createBuffer(1,Math.max(1,c.sampleRate*d|0),c.sampleRate),a=b.getChannelData(0);for(let i=0;i<a.length;i++)a[i]=Math.random()*2-1;const s=c.createBufferSource();s.buffer=b;const f=c.createBiquadFilter();f.type='bandpass';f.frequency.value=hp||1800;const g=c.createGain();g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(0.001,t+d);s.connect(f);f.connect(g);g.connect(A.master);s.start(t)}
let alt=0;
A.sfx=function(n,x){if(!A.ctx)return;const t=A.ctx.currentTime;switch(n){
 case 'seed':alt^=1;tone(alt?520:390,0.06,'triangle',0.09);break;
 case 'power':[0,1,2,3].forEach(i=>tone(330*Math.pow(1.26,i),0.12,'square',0.08,t+i*0.06));break;
 case 'eatGhost':tone(200,0.35,'square',0.1,t,1400);break;
 case 'fruit':[0,1,2].forEach(i=>tone(660+i*220,0.1,'triangle',0.1,t+i*0.07));break;
 case 'death':tone(700,1.2,'sawtooth',0.1,t,60);noise(0.5,0.12,t+0.6,600);break;
 case 'clear':[523,659,784,1046,784,1046].forEach((f,i)=>tone(f,0.16,'square',0.08,t+i*0.11));break;
 case 'extra':[784,988,1175,1568].forEach((f,i)=>tone(f,0.12,'triangle',0.1,t+i*0.08));break;
 case 'start':[392,523,659,523,784].forEach((f,i)=>tone(f,0.18,'square',0.07,t+i*0.14));break;
 case 'tap':tone(880,0.05,'triangle',0.06);break;}};
// music: looping 16-step pattern scheduler (marimba lead + log drums + shaker)
const LEAD=[[72,0],[0],[75,0],[77,0],[79,0],[0],[77,0],[75,0],[72,0],[0],[70,0],[72,0],[75,0],[0],[0],[0]];
const LEAD2=[[79],[0],[77],[75],[77],[0],[75],[72],[70],[0],[72],[0],[67],[0],[0],[0]];
const BASS=[48,0,0,48,0,0,51,0,43,0,0,43,0,0,46,0];
const DRUM=[1,0,2,0,1,1,2,0,1,0,2,0,1,0,2,2];
let step=0,next=0,timer=null,mode='chase',bar=0;
A.setMode=function(m){mode=m};
A.startMusic=function(){if(!A.ctx||timer)return;next=A.ctx.currentTime+0.05;step=0;timer=setInterval(sched,40)};
A.stopMusic=function(){clearInterval(timer);timer=null};
const mtof=m=>440*Math.pow(2,(m-69)/12);
function sched(){const c=A.ctx;if(!c)return;const fr=mode==='fright',spb=fr?0.105:0.13;
 while(next<c.currentTime+0.15){const i=step%16;if(i===0)bar++;
  const L=(bar%2?LEAD2:LEAD)[i][0];if(L){if(fr)tone(mtof(L+5),0.09,'square',0.03,next,mtof(L-2));else{tone(mtof(L),0.22,'triangle',0.05,next);tone(mtof(L+12),0.05,'sine',0.02,next)}}
  if(BASS[i])tone(mtof(BASS[i]+(fr?3:0)),0.2,'triangle',0.09,next);
  if(DRUM[i]===1){tone(110,0.16,'sine',0.14,next,55)}if(DRUM[i]===2)tone(240,0.09,'sine',0.07,next,160);
  if(i%2===1)noise(0.03,0.025,next,7000);
  next+=spb;step++}}
root.SND=A;
})(this);
