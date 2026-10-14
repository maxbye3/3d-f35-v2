import { installFlightMode } from './flight.js';
import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';
import { RoomEnvironment } from './vendor/RoomEnvironment.js';
const $=id=>document.getElementById(id);
const wrap=$('canvas-wrap'), slider=$('explode'), reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const groups=new Map(), raycaster=new THREE.Raycaster(), pointer=new THREE.Vector2();
let renderer,scene,camera,controls,model,selected=null,isolate=false,ready=false,amount=1,targetAmount=1,playing=false,playDirection=-1,lastTime=0,renderMode=false,focusMotion=null,isolationMotion=null,isolationView=null;
let flightActive=false,flightStarted=0,flightControlsEnabled=true;
const descriptions={
'Nose cone':'The forward radome shell, separated from the nose section. Radar internals are not included in the source.',
'Forward fuselage':'The forward exterior shell and attached fittings, cut from the original body mesh.',
'Center fuselage':'The central exterior shell, including the lift fan detail present in the source model.',
'Rear fuselage':'The aft fuselage shell and surrounding panels. A complete internal engine is not supplied.',
'Canopy':'The original transparent canopy and its surrounding frame.',
'Ejection seat':'The supplied cockpit seat, lifted clear of the cockpit for inspection.',
'Cockpit instruments':'The instrument panel and cockpit controls included in the supplied model.',
'Exhaust nozzle':'The articulated rear exhaust nozzle and its individual surrounding segments.',
'Lift fan intake door':'The upper lift fan door in the supplied open-door pose.',
'Lift fan door actuators':'The supporting actuator components for the upper lift fan door.',
'Forward sensor window':'The small forward sensor window retained from the original model.'};
function description(name,count){return descriptions[name]||(`${name.includes('wing')||name.includes('stabilizer')?'An exterior flight surface':name.includes('gear')?'Landing gear or bay-door components':name.includes('store')||name.includes('bomb')||name.includes('missile')?'A store from the supplied model':'Original aircraft components'}, separated as an editable assembly. ${count} component ${count===1?'mesh':'meshes'}.`);}
function category(name){if(/bomb|missile|store/i.test(name))return'STORES';if(/gear/i.test(name))return'LANDING GEAR';if(/Canopy|seat|Cockpit|Lift fan|Auxiliary|sensor/i.test(name))return'COCKPIT & LIFT SYSTEM';return'AIRFRAME';}
function buildList(){const query=$('search').value.toLowerCase().trim();$('components').replaceChildren();let found=0;for(const cat of ['AIRFRAME','COCKPIT & LIFT SYSTEM','LANDING GEAR','STORES']){const entries=[...groups.values()].filter(g=>category(g.name)===cat&&g.name.toLowerCase().includes(query));if(!entries.length)continue;const heading=document.createElement('p');heading.className='list-group';heading.textContent=cat;$('components').append(heading);for(const g of entries){found++;const row=document.createElement('button');row.className='part-row'+(selected===g.name?' selected':'');row.dataset.assembly=g.name;row.setAttribute('aria-pressed',String(selected===g.name));const label=document.createElement('span');label.textContent=g.name;const count=document.createElement('span');count.className='mesh-count';count.textContent=String(g.meshes.length).padStart(2,'0');row.append(label,count);row.addEventListener('click',()=>select(g.name));$('components').append(row);}}if(!found){const empty=document.createElement('p');empty.className='list-placeholder';empty.textContent='No matching assemblies.';$('components').append(empty);}}
function applySelection(){for(const g of groups.values()){for(const mesh of g.meshes){for(const m of (Array.isArray(mesh.material)?mesh.material:[mesh.material]))if(m.emissive){m.emissive.copy(m.userData.baseEmissive);m.emissiveIntensity=m.userData.baseIntensity;if(g.name===selected){m.emissive.set('#075de8');m.emissiveIntensity=.35;}}}}$('isolate-part').setAttribute('aria-pressed',String(isolate));$('isolate-part').textContent=isolate?'Show all parts':'Isolate part';}
function select(name){cancelFocus();if(name&&renderMode)setRenderMode(false);selected=name;const g=groups.get(name);$('selected-name').textContent=g?name:'Explore an assembly';$('selected-description').textContent=g?description(name,g.meshes.length):'Select a part in the model or component index to highlight it.';$('clear-selection').hidden=!g;$('selection-actions').hidden=!g;if(isolate)setIsolation(Boolean(g));applySelection();buildList();}
function changeAmount(value,instant=false){targetAmount=Math.max(0,Math.min(1,value));if(instant||reduced)amount=targetAmount;slider.value=String(Math.round(targetAmount*100));$('explode-value').textContent=Math.round(targetAmount*100)+'%';$('view-state').textContent=isolate?'ISOLATED PART':targetAmount===0?'ASSEMBLED VIEW':targetAmount===1?'EXPLODED VIEW':'ASSEMBLY TRANSITION';$('assembled').classList.toggle('active',targetAmount===0);$('exploded').classList.toggle('active',targetAmount===1);}
function setPlaying(value){playing=value;$('animate').setAttribute('aria-pressed',String(value));$('animate').innerHTML=value?'Ⅱ <span>Pause</span>':'▶ <span>Animate</span>';if(value)playDirection=targetAmount>.5?-1:1;}
slider.addEventListener('input',()=>{setPlaying(false);changeAmount(Number(slider.value)/100,true);});$('assembled').onclick=()=>{setPlaying(false);changeAmount(0);};$('exploded').onclick=()=>{setPlaying(false);changeAmount(1);};$('animate').onclick=()=>{if(ready)setPlaying(!playing);};
$('search').addEventListener('input',buildList);$('clear-selection').onclick=()=>select(null);$('isolate-part').onclick=()=>{if(selected)setIsolation(!isolate);};
function assemblyCenter(group){
  return group.center.clone().addScaledVector(group.offset,amount);
}
function escapeOffset(group,index,endCamera){
  // Move parallel to the screen, far enough for the entire bounding sphere to leave it.
  camera.updateMatrixWorld();
  const right=new THREE.Vector3(1,0,0).applyQuaternion(camera.quaternion);
  const up=new THREE.Vector3(0,1,0).applyQuaternion(camera.quaternion);
  const forward=new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion);
  const center=assemblyCenter(group),anchor=selected?assemblyCenter(groups.get(selected)):controls.target.clone();
  const screen=center.clone().project(camera),origin=anchor.clone().project(camera);
  let dx=(screen.x-origin.x)*camera.aspect,dy=screen.y-origin.y;
  if(!Number.isFinite(dx)||!Number.isFinite(dy)||Math.hypot(dx,dy)<.01){
    const angle=index*Math.PI*(3-Math.sqrt(5));dx=Math.cos(angle);dy=Math.sin(angle);
  }
  const length=Math.hypot(dx,dy);dx/=length;dy/=length;
  const tangent=Math.tan(THREE.MathUtils.degToRad(camera.fov/2));
  function exitDistance(position){
    const relative=center.clone().sub(position),depth=Math.max(0,relative.dot(forward));
    const halfHeight=(depth+group.radius)*tangent+group.radius;
    const halfWidth=(depth+group.radius)*tangent*camera.aspect+group.radius;
    const x=relative.dot(right),y=relative.dot(up);
    const horizontal=Math.abs(dx)>.0001?((dx>0?halfWidth:-halfWidth)-x)/dx:Infinity;
    const vertical=Math.abs(dy)>.0001?((dy>0?halfHeight:-halfHeight)-y)/dy:Infinity;
    return Math.max(0,Math.min(horizontal,vertical));
  }
  const distance=Math.max(exitDistance(camera.position),exitDistance(endCamera))+2;
  return right.multiplyScalar(dx*distance).addScaledVector(up,dy*distance);
}
function setIsolation(value){
  if(!ready||value&&!selected)return;
  cancelFocus();if(value&&!isolationView)isolationView={position:camera.position.clone(),target:controls.target.clone()};isolate=value;
  if(value){setPlaying(false);changeAmount(amount,true);}
  const chosen=selected?groups.get(selected):null;
  const endCamera=value&&chosen?assemblyCenter(chosen).addScaledVector(
    camera.position.clone().sub(controls.target).normalize(),Math.max(7,chosen.radius*3.5)):isolationView?isolationView.position.clone():camera.position.clone();
  const parts=[];let index=0;
  for(const group of groups.values()){
    const escape=escapeOffset(group,index++,endCamera);
    if(!group.object.visible)group.isolationShift.copy(escape);
    group.object.visible=true;
    parts.push({group,from:group.isolationShift.clone(),to:value&&group.name!==selected?escape:new THREE.Vector3()});
  }
  isolationMotion={started:performance.now(),duration:reduced?0:500,parts};
  renderer.domElement.dataset.isolationProgress='0.000';applySelection();
  $('view-state').textContent=value?'ISOLATING PART':targetAmount===0?'ASSEMBLED VIEW':targetAmount===1?'EXPLODED VIEW':'ASSEMBLY TRANSITION';
  if(value)$('focus-part').click();
  else if(isolationView){
    focusMotion={started:performance.now(),duration:reduced?0:500,
      fromTarget:controls.target.clone(),fromPosition:camera.position.clone(),
      toTarget:isolationView.target.clone(),toPosition:isolationView.position.clone(),autoRotate:controls.autoRotate};
    controls.autoRotate=false;renderer.domElement.dataset.focusProgress='0.000';
    if(reduced)updateFocus(performance.now());
  }
  if(reduced)updateIsolation(performance.now());
}
function updateIsolation(time){
  if(!isolationMotion)return;
  const motion=isolationMotion,progress=motion.duration===0?1:Math.min(1,Math.max(0,(time-motion.started)/motion.duration));
  const ease=progress*progress*(3-2*progress);
  for(const part of motion.parts){
    part.group.isolationShift.lerpVectors(part.from,part.to,ease);
    // Cull only after the outward flight completes; returning parts start offscreen.
    if(progress===1)part.group.object.visible=!isolate||part.group.name===selected;
  }
  renderer.domElement.dataset.isolationProgress=progress.toFixed(3);
  if(progress===1){
    isolationMotion=null;if(!isolate)isolationView=null;
    $('view-state').textContent=isolate?'ISOLATED PART':targetAmount===0?'ASSEMBLED VIEW':targetAmount===1?'EXPLODED VIEW':'ASSEMBLY TRANSITION';
  }
}
function cancelFocus(){
  if(!focusMotion)return;
  // Clear residual orbit damping without moving the camera that the visitor sees.
  const position=camera.position.clone(),target=controls.target.clone(),damping=controls.enableDamping;
  controls.enableDamping=false;controls.autoRotate=false;controls.update();
  camera.position.copy(position);controls.target.copy(target);camera.lookAt(target);
  controls.enableDamping=damping;controls.autoRotate=focusMotion.autoRotate;focusMotion=null;
}
function updateFocus(time){
  if(!focusMotion)return;
  const motion=focusMotion,progress=motion.duration===0?1:Math.min(1,Math.max(0,(time-motion.started)/motion.duration));
  const ease=progress*progress*(3-2*progress);
  // Follow the selected assembly if its separation is still animating.
  const center=motion.object?assemblyCenter(motion.group):motion.toTarget;
  const destination=motion.object?center.clone().addScaledVector(motion.direction,motion.distance):motion.toPosition;
  controls.target.lerpVectors(motion.fromTarget,center,ease);
  camera.position.lerpVectors(motion.fromPosition,destination,ease);camera.lookAt(controls.target);
  renderer.domElement.dataset.focusProgress=progress.toFixed(3);
  if(progress===1)cancelFocus();
}
$('focus-part').onclick=()=>{
  if(!selected||!ready)return;
  cancelFocus();
  const object=groups.get(selected).object,bounds=new THREE.Box3().setFromObject(object);
  focusMotion={object,group:groups.get(selected),started:performance.now(),duration:reduced?0:500,
    fromTarget:controls.target.clone(),fromPosition:camera.position.clone(),
    direction:camera.position.clone().sub(controls.target).normalize(),
    distance:Math.max(7,bounds.getBoundingSphere(new THREE.Sphere()).radius*3.5),autoRotate:controls.autoRotate};
  controls.autoRotate=false;renderer.domElement.dataset.focusProgress='0.000';
  if(reduced)updateFocus(performance.now());
};
function resetCamera(){if(!ready)return;cancelFocus();const center=new THREE.Vector3(0,.25,-.5),ratio=wrap.clientWidth/wrap.clientHeight;const distance=ratio<1?36/ratio:23;controls.target.copy(center);camera.position.copy(center).addScaledVector(new THREE.Vector3(24,19,15).normalize(),distance);controls.update();}
$('reset-camera').onclick=resetCamera;$('rotate').onclick=()=>{if(!controls)return;cancelFocus();controls.autoRotate=!controls.autoRotate;$('rotate').setAttribute('aria-pressed',String(controls.autoRotate));};
function zoom(factor){if(!controls)return;cancelFocus();const delta=camera.position.clone().sub(controls.target);delta.multiplyScalar(factor);delta.clampLength(controls.minDistance,controls.maxDistance);camera.position.copy(controls.target).add(delta);controls.update();}$('zoom-in').onclick=()=>zoom(.8);$('zoom-out').onclick=()=>zoom(1.25);
function setRenderMode(value){cancelFocus();renderMode=value;$('view-title').textContent=value?'Labeled Exploded View':'F-35B Assembly';document.querySelector('.view-tag').textContent=value?'Reference Render':'Interactive 3D';for(const [id,active] of [['rail-model',!value],['rail-render',value]]){$(id).classList.toggle('active',active);$(id).setAttribute('aria-pressed',String(active));}$('canvas-wrap').hidden=value;$('render-view').hidden=!value;for(const id of ['stage-info','tools','explosion-panel','hint'])$(id).hidden=value;if(value)setPlaying(false);}
$('rail-model').onclick=()=>setRenderMode(false);$('rail-render').onclick=()=>setRenderMode(true);
document.addEventListener('keydown',e=>{if(e.key==='/'&&e.target.tagName!=='INPUT'){e.preventDefault();$('search').focus();}if(e.key==='Escape'){select(null);$('search').blur();}});
function frame(time){requestAnimationFrame(frame);if(!renderer||!ready||renderMode||flightActive)return;const dt=Math.min((time-lastTime)/1000,.05)||.016;lastTime=time;if(playing){targetAmount+=dt*.24*playDirection;if(targetAmount<=0||targetAmount>=1){targetAmount=Math.max(0,Math.min(1,targetAmount));playDirection*=-1;}changeAmount(targetAmount);}amount+=(targetAmount-amount)*Math.min(1,dt*9);if(Math.abs(amount-targetAmount)<.0001)amount=targetAmount;updateIsolation(time);for(const g of groups.values())g.object.position.copy(g.base).addScaledVector(g.offset,amount).add(g.isolationShift);controls.update(dt);updateFocus(time);renderer.render(scene,camera);renderer.domElement.dataset.separation=amount.toFixed(3);renderer.domElement.dataset.visibleAssemblies=String([...groups.values()].filter(g=>g.object.visible).length);}
async function init(){try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));renderer.setSize(wrap.clientWidth,wrap.clientHeight);renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;wrap.append(renderer.domElement);renderer.domElement.setAttribute('aria-label','Rotatable 3D F-35B aircraft model');renderer.domElement.setAttribute('role','img');scene=new THREE.Scene();scene.background=new THREE.Color('#ffffff');camera=new THREE.PerspectiveCamera(38,wrap.clientWidth/wrap.clientHeight,.1,250);controls=new OrbitControls(camera,renderer.domElement);controls.enabled=!flightActive;controls.enableDamping=true;controls.dampingFactor=.08;controls.minDistance=5;controls.maxDistance=125;controls.autoRotateSpeed=.6;controls.addEventListener('start',cancelFocus);const pmrem=new THREE.PMREMGenerator(renderer);scene.environment=pmrem.fromScene(new RoomEnvironment(),.04).texture;scene.environmentIntensity=.8;pmrem.dispose();scene.add(new THREE.HemisphereLight('#ffffff','#c0c9db',1.6));const sun=new THREE.DirectionalLight('#ffffff',3);sun.position.set(10,18,12);scene.add(sun);const fill=new THREE.DirectionalLight('#d2e4f7',1.5);fill.position.set(-15,8,-12);scene.add(fill);
const loader=new GLTFLoader();const gltf=await loader.loadAsync('./assets/F35B-assembled.glb',e=>{if(e.total){const p=Math.round(e.loaded/e.total*100);$('progress').style.width=p+'%';$('loading-text').textContent=p<100?`Loading model · ${p}%`:'Preparing textures…';}});model=gltf.scene;scene.add(model);
model.traverse(o=>{if(o.userData.assemblyName)groups.set(o.userData.assemblyName,{name:o.userData.assemblyName,object:o,base:o.position.clone(),offset:new THREE.Vector3(...o.userData.explodeOffset),isolationShift:new THREE.Vector3(),meshes:[]});if(o.isMesh){o.material=Array.isArray(o.material)?o.material.map(m=>m.clone()):o.material.clone();for(const m of (Array.isArray(o.material)?o.material:[o.material])){m.side=THREE.DoubleSide;if(m.emissive){m.userData.baseEmissive=m.emissive.clone();m.userData.baseIntensity=m.emissiveIntensity;}}}});
for(const g of groups.values())g.object.traverse(o=>{if(o.isMesh){g.meshes.push(o);o.userData.assembly=g.name;}});for(const g of groups.values()){const bounds=new THREE.Box3().setFromObject(g.object);g.center=bounds.getCenter(new THREE.Vector3());g.radius=bounds.getBoundingSphere(new THREE.Sphere()).radius;}if(groups.size!==38)throw new Error('The component index is incomplete.');ready=true;slider.disabled=false;$('loading').hidden=true;renderer.domElement.dataset.modelReady='true';renderer.domElement.dataset.assemblies=String(groups.size);resetCamera();buildList();changeAmount(1,true);
let down=null;renderer.domElement.addEventListener('pointerdown',e=>{down=[e.clientX,e.clientY];});renderer.domElement.addEventListener('pointerup',e=>{if(!down||Math.hypot(e.clientX-down[0],e.clientY-down[1])>5)return;const r=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);raycaster.setFromCamera(pointer,camera);const hits=raycaster.intersectObject(model,true).filter(h=>{let o=h.object;while(o){if(!o.visible)return false;o=o.parent;}return true;});if(hits[0])select(hits[0].object.userData.assembly);});
new ResizeObserver(()=>{if(!wrap.clientWidth||!wrap.clientHeight)return;renderer.setSize(wrap.clientWidth,wrap.clientHeight);camera.aspect=wrap.clientWidth/wrap.clientHeight;camera.updateProjectionMatrix();if(flightActive)renderer.render(scene,camera);}).observe(wrap);
}catch(error){console.error('Model viewer:',error);$('loading-text').textContent='The 3D viewer could not start.';$('loading').querySelector('small').textContent='Open the labeled render or download a model.';$('progress').style.width='100%';$('components').innerHTML='<p class="list-placeholder">3D components unavailable. The labeled render is still available.</p>';for(const id of ['animate','assembled','exploded','rotate','zoom-in','zoom-out','reset-camera'])$(id).disabled=true;}}
installFlightMode({getModel:()=>model,setActive(value){
  if(value){flightStarted=performance.now();flightControlsEnabled=controls?.enabled??true;if(controls)controls.enabled=false;}
  else{const paused=performance.now()-flightStarted;if(focusMotion)focusMotion.started+=paused;if(isolationMotion)isolationMotion.started+=paused;if(controls)controls.enabled=flightControlsEnabled;lastTime=performance.now();}
  flightActive=value;
}});
requestAnimationFrame(frame);init();
