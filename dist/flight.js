import * as THREE from 'three';
import { RoomEnvironment } from './vendor/RoomEnvironment.js';

const KONAMI = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'];
const TARGETS = 'button,a,summary,.search,.metric-pill,.model-badge,.intro-emblem,h1,h2,h3,p,canvas,#render-view img,.selection,.sidebar-top';
const ARROWS = new Set(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight']);
const clamp = (value,min,max) => Math.max(min,Math.min(max,value));

function fallbackSprite(){
  const canvas=document.createElement('canvas');canvas.width=320;canvas.height=320;
  const c=canvas.getContext('2d');c.translate(160,160);c.fillStyle='#6e7f94';c.strokeStyle='#071c3b';c.lineWidth=2;
  c.beginPath();c.moveTo(0,-145);c.lineTo(18,-40);c.lineTo(114,48);c.lineTo(103,66);c.lineTo(22,35);c.lineTo(28,93);c.lineTo(69,129);c.lineTo(65,143);c.lineTo(13,115);c.lineTo(-13,115);c.lineTo(-65,143);c.lineTo(-69,129);c.lineTo(-28,93);c.lineTo(-22,35);c.lineTo(-103,66);c.lineTo(-114,48);c.lineTo(-18,-40);c.closePath();c.fill();c.stroke();
  c.fillStyle='#10264b';c.beginPath();c.ellipse(0,-64,9,26,0,0,Math.PI*2);c.fill();
  c.strokeStyle='#bcc8d8';c.beginPath();c.moveTo(0,-125);c.lineTo(0,110);c.stroke();
  return canvas;
}

async function aircraftSprite(model){
  const jet=model.clone(true),materials=[];
  jet.traverse(o=>{
    o.visible=true;
    if(o.userData.assemblyName)o.position.set(0,0,0);
    if(o.isMesh){
      const clone=source=>{
        const material=source.clone();
        if(material.emissive){
          const base=source.userData.baseEmissive;
          if(base?.isColor)material.emissive.copy(base);else material.emissive.set(0);
          material.emissiveIntensity=source.userData.baseIntensity??0;
        }
        materials.push(material);return material;
      };
      o.material=Array.isArray(o.material)?o.material.map(clone):clone(o.material);
    }
  });
  const scene=new THREE.Scene(),holder=new THREE.Group();
  jet.rotation.x=Math.PI/2;holder.rotation.z=Math.PI;holder.add(jet);scene.add(holder);
  holder.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(holder),size=bounds.getSize(new THREE.Vector3());
  holder.position.sub(bounds.getCenter(new THREE.Vector3()));
  const extent=Math.max(size.x,size.y)*.56;
  const camera=new THREE.OrthographicCamera(-extent,extent,extent,-extent,.1,200);camera.position.z=60;camera.lookAt(0,0,0);
  let renderer,environment,pmrem;
  try{
    renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true});renderer.setSize(384,384);renderer.setClearColor(0,0);renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.95;
    pmrem=new THREE.PMREMGenerator(renderer);const room=new RoomEnvironment();environment=pmrem.fromScene(room,.04).texture;room.dispose();scene.environment=environment;scene.environmentIntensity=.8;
    scene.add(new THREE.HemisphereLight('#ffffff','#8593ab',1.3));const light=new THREE.DirectionalLight('#ffffff',2.5);light.position.set(-10,20,35);scene.add(light);
    renderer.render(scene,camera);
    const image=new Image();image.src=renderer.domElement.toDataURL('image/png');await image.decode();return image;
  }finally{
    materials.forEach(m=>m.dispose());environment?.dispose();pmrem?.dispose();renderer?.dispose();renderer?.forceContextLoss();
  }
}

export function installFlightMode({getModel,setActive}){
  let layer,canvas,ctx,hud,scoreLabel,lastHitLabel,sprite=fallbackSprite(),spritePromise;
  let active=false,sequence=[],keys=new Set(),bombs=[],particles=[],blasts=[],damaged=new Set();
  let player,score=0,dropped=0,lastBomb=-Infinity,lastTime=0,frameId=0,oldOverflow='',oldFocus;
  let width=innerWidth,height=innerHeight;

  function resize(){
    width=innerWidth;height=innerHeight;
    if(!canvas)return;
    const ratio=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);canvas.style.width=width+'px';canvas.style.height=height+'px';ctx.setTransform(ratio,0,0,ratio,0,0);
    if(player){player.x=clamp(player.x,35,width-35);player.y=clamp(player.y,45,height-45);}
  }
  function updateHud(){scoreLabel.textContent=String(score).padStart(2,'0');layer.dataset.hits=String(score);layer.dataset.bombs=String(dropped);}
  function enter(){
    if(active)return;
    active=true;sequence=[];keys.clear();bombs=[];particles=[];blasts=[];damaged=new Set();score=0;dropped=0;lastBomb=-Infinity;oldOverflow=document.body.style.overflow;oldFocus=document.activeElement;
    oldFocus?.blur();document.body.style.overflow='hidden';document.body.classList.add('flight-active');setActive(true);
    layer=document.createElement('section');layer.id='flight-layer';layer.className='flight-layer';layer.setAttribute('aria-label','F-35 flight mode');layer.setAttribute('role','dialog');layer.setAttribute('aria-modal','true');layer.tabIndex=-1;
    canvas=document.createElement('canvas');canvas.className='flight-canvas';canvas.setAttribute('aria-label','Arrow keys fly the F-35; Space drops bombs; Escape restores the page');ctx=canvas.getContext('2d');layer.append(canvas);
    hud=document.createElement('div');hud.className='flight-hud';hud.innerHTML='<div class="flight-heading"><span class="flight-indicator"></span><strong>F-35B · FLIGHT MODE</strong><span class="flight-score">TARGETS HIT <b id="flight-score">00</b></span></div><p>Arrow keys to fly <span>·</span> Space to bomb <span>·</span> Esc to restore</p><div class="flight-bottom"><span id="flight-last-hit" aria-live="polite">Konami code accepted. All systems ready.</span><button id="flight-exit" type="button">Exit & restore ↗</button></div>';layer.append(hud);document.body.append(layer);
    layer.focus({preventScroll:true});scoreLabel=hud.querySelector('#flight-score');lastHitLabel=hud.querySelector('#flight-last-hit');hud.querySelector('#flight-exit').onclick=exit;
    player={x:innerWidth*.5,y:Math.min(210,innerHeight*.3),vx:0,vy:0,angle:0};resize();updateHud();
    const source=getModel();
    if(source&&!spritePromise){spritePromise=aircraftSprite(source).then(image=>{sprite=image;}).catch(error=>{console.warn('Flight sprite:',error);spritePromise=null;});}
    lastTime=performance.now();frameId=requestAnimationFrame(frame);
  }
  function exit(){
    if(!active)return;
    active=false;cancelAnimationFrame(frameId);keys.clear();
    damaged.forEach(element=>element.classList.remove('flight-destroyed'));damaged.clear();
    layer.remove();layer=null;canvas=null;ctx=null;document.body.classList.remove('flight-active');document.body.style.overflow=oldOverflow;setActive(false);
    if(oldFocus?.isConnected)oldFocus.focus({preventScroll:true});
  }
  function keydown(event){
    if(event.ctrlKey||event.metaKey||event.altKey)return;
    if(active){
      if(event.key==='Tab'){event.preventDefault();event.stopImmediatePropagation();hud.querySelector('#flight-exit').focus();return;}
      if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();exit();return;}
      if(ARROWS.has(event.key)||event.code==='Space'||event.key===' '){
        event.preventDefault();event.stopImmediatePropagation();keys.add(event.code==='Space'||event.key===' '?'Space':event.key);
        if(event.code==='Space'||event.key===' ')dropBomb(performance.now());
      }
      return;
    }
    if(event.repeat||event.target.closest?.('input,textarea,select,[contenteditable="true"]'))return;
    const key=event.key.length===1?event.key.toLowerCase():event.key;
    sequence.push(key);if(sequence.length>KONAMI.length)sequence.shift();
    if(sequence.length===KONAMI.length&&sequence.every((key,i)=>key===KONAMI[i])){event.preventDefault();event.stopImmediatePropagation();enter();}
  }
  document.addEventListener('keydown',keydown,true);
  document.addEventListener('keyup',event=>{keys.delete(event.code==='Space'||event.key===' '?'Space':event.key);if(active&&(ARROWS.has(event.key)||event.code==='Space'||event.key===' ')){event.preventDefault();event.stopImmediatePropagation();}},true);
  window.addEventListener('blur',()=>keys.clear());window.addEventListener('resize',resize);

  function aim(){return {x:clamp(player.x+player.vx*.08,8,width-8),y:clamp(player.y+72+player.vy*.04,8,height-8)};}
  function dropBomb(time){
    if(time-lastBomb<280)return;
    lastBomb=time;const target=aim();bombs.push({x:player.x,y:player.y+12,target,started:time,duration:420});dropped++;updateHud();
  }
  function targetAt(x,y){
    const hudBounds=hud.getBoundingClientRect();if(x>=hudBounds.left&&x<=hudBounds.right&&y>=hudBounds.top&&y<=hudBounds.bottom)return null;
    layer.style.pointerEvents='none';
    const hits=document.elementsFromPoint(x,y);layer.style.pointerEvents='';
    for(const element of hits){
      if(layer.contains(element)||element.closest('.flight-destroyed'))continue;
      let target=element.closest(TARGETS);
      if(target?.matches('input')||element.closest('.search'))target=element.closest('.search');
      if(!target||layer.contains(target)||damaged.has(target)||target.closest('.flight-destroyed'))continue;
      const box=target.getBoundingClientRect();if(box.width<3||box.height<3)continue;
      if(getComputedStyle(target).visibility==='hidden')continue;
      return target;
    }
    return null;
  }
  function explode(x,y,time){
    const target=targetAt(x,y);
    if(target){
      const label=(target.getAttribute('aria-label')||target.textContent||target.tagName).trim().replace(/\s+/g,' ').slice(0,45);
      damaged.add(target);target.classList.add('flight-destroyed');score++;updateHud();lastHitLabel.textContent='Hit: '+label;
      layer.dataset.lastTarget=target.id||target.tagName.toLowerCase();
    }else lastHitLabel.textContent='Miss. Line up the targeting reticle.';
    blasts.push({x,y,started:time});
    for(let i=0;i<(target?34:17);i++){
      const angle=Math.random()*Math.PI*2,speed=50+Math.random()*180;
      particles.push({x,y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed-30,angle:Math.random()*Math.PI,spin:(Math.random()-.5)*8,size:2+Math.random()*6,life:.55+Math.random()*.5,color:i%4===0?'#f1ad39':i%3===0?'#ffffff':i%2===0?'#075de8':'#071c3b'});
    }
  }
  function drawJet(time){
    ctx.save();ctx.translate(player.x+6,player.y+9);ctx.rotate(player.angle);ctx.globalAlpha=.15;ctx.filter='blur(5px)';ctx.drawImage(sprite,-64,-64,128,128);ctx.restore();
    const speed=Math.hypot(player.vx,player.vy);
    if(speed>30){
      ctx.save();ctx.translate(player.x,player.y);ctx.rotate(player.angle);ctx.fillStyle='#76c4ff';ctx.beginPath();ctx.moveTo(-4,45);ctx.lineTo(0,58+Math.sin(time*.04)*4+speed*.025);ctx.lineTo(4,45);ctx.closePath();ctx.fill();ctx.restore();
    }
    ctx.save();ctx.translate(player.x,player.y);ctx.rotate(player.angle);ctx.scale(1-Math.min(.14,Math.abs(player.vx)/2400),1);ctx.drawImage(sprite,-64,-64,128,128);ctx.restore();
    const target=aim();ctx.save();ctx.strokeStyle='#075de8';ctx.lineWidth=1;ctx.globalAlpha=.65;ctx.setLineDash([3,4]);ctx.beginPath();ctx.arc(target.x,target.y,14,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);ctx.beginPath();ctx.moveTo(target.x-21,target.y);ctx.lineTo(target.x-9,target.y);ctx.moveTo(target.x+9,target.y);ctx.lineTo(target.x+21,target.y);ctx.moveTo(target.x,target.y-21);ctx.lineTo(target.x,target.y-9);ctx.moveTo(target.x,target.y+9);ctx.lineTo(target.x,target.y+21);ctx.stroke();ctx.restore();
  }
  function frame(time){
    if(!active)return;
    const dt=Math.min((time-lastTime)/1000,.04);lastTime=time;
    let ax=Number(keys.has('ArrowRight'))-Number(keys.has('ArrowLeft')),ay=Number(keys.has('ArrowDown'))-Number(keys.has('ArrowUp'));
    const direction=Math.hypot(ax,ay);if(direction){ax/=direction;ay/=direction;}
    player.vx+=ax*1100*dt;player.vy+=ay*1100*dt;
    const drag=Math.exp(-(direction?2.2:7)*dt);player.vx*=drag;player.vy*=drag;
    const speed=Math.hypot(player.vx,player.vy);if(speed>350){player.vx*=350/speed;player.vy*=350/speed;}
    player.x=clamp(player.x+player.vx*dt,35,width-35);player.y=clamp(player.y+player.vy*dt,45,height-45);
    if(speed>15){const destination=Math.atan2(player.vy,player.vx)+Math.PI/2;let delta=destination-player.angle;delta=Math.atan2(Math.sin(delta),Math.cos(delta));player.angle+=delta*Math.min(1,dt*9);}
    if(keys.has('Space'))dropBomb(time);
    ctx.clearRect(0,0,width,height);
    for(let i=bombs.length-1;i>=0;i--){
      const bomb=bombs[i],t=clamp((time-bomb.started)/bomb.duration,0,1);
      if(t===1){explode(bomb.target.x,bomb.target.y,time);bombs.splice(i,1);continue;}
      const x=bomb.x+(bomb.target.x-bomb.x)*t,y=bomb.y+(bomb.target.y-bomb.y)*t*t;
      ctx.save();ctx.translate(x,y);ctx.rotate(t*4);ctx.fillStyle='#071c3b';ctx.strokeStyle='#ffffff';ctx.lineWidth=1.5;ctx.beginPath();ctx.ellipse(0,0,3+t*2,6+t*3,0,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.restore();
    }
    for(let i=blasts.length-1;i>=0;i--){
      const blast=blasts[i],age=(time-blast.started)/650;if(age>=1){blasts.splice(i,1);continue;}
      ctx.save();ctx.globalAlpha=(1-age)*.7;ctx.strokeStyle=age<.2?'#ffffff':'#075de8';ctx.lineWidth=3*(1-age);ctx.beginPath();ctx.arc(blast.x,blast.y,4+age*55,0,Math.PI*2);ctx.stroke();if(age<.2){ctx.fillStyle='#f1ad39';ctx.globalAlpha=(.2-age)*2;ctx.fill();}ctx.restore();
    }
    for(let i=particles.length-1;i>=0;i--){
      const p=particles[i];p.life-=dt;if(p.life<=0){particles.splice(i,1);continue;}p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=160*dt;p.angle+=p.spin*dt;
      ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.angle);ctx.globalAlpha=Math.min(1,p.life*2);ctx.fillStyle=p.color;ctx.fillRect(-p.size/2,-p.size/2,p.size,p.size*.65);ctx.restore();
    }
    drawJet(time);layer.dataset.x=player.x.toFixed(1);layer.dataset.y=player.y.toFixed(1);frameId=requestAnimationFrame(frame);
  }
}
