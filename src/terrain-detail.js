const sceneryLayers = new Set(['terrain','land','transport','heritage','winter']);
const scenerySprites = new Map();
const sceneryCacheFloor = 192;
const sceneryBatchSize = 20;
const sceneryFrameBudgetMs = 3;
const scenerySize = 192;
const sceneryExtent = data.radius*2;
const sceneryClip = new Path2D();
traceHex(sceneryClip,0,0);
let sceneryPass = null;

function beginTerrainDetails(s) {
  sceneryPass = s>1.2 && sceneryLayers.has(state.layer)
    ? {visible:new Set(), remaining:sceneryBatchSize, generationMs:0, pending:false}
    : null;
}

function finishTerrainDetails() {
  if (!sceneryPass) return;
  const {visible,pending}=sceneryPass;
  sceneryPass=null;
  // Keep the whole visible working set, even when a wide view needs more sprites than the usual cache.
  const limit=Math.max(sceneryCacheFloor,visible.size);
  for (const key of scenerySprites.keys()) {
    if (scenerySprites.size<=limit) break;
    if (!visible.has(key)) scenerySprites.delete(key);
  }
  if (pending) requestDraw();
}

function sceneryRandom(seed) {
  return () => {
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    return seed/0x100000000;
  };
}

function sceneryPolygon(art,points,fill,stroke,width=.12) {
  art.beginPath();
  for (const [index,[x,y]] of points.entries()) {
    if (index) art.lineTo(x,y);
    else art.moveTo(x,y);
  }
  art.closePath();
  art.fillStyle=fill;
  art.fill();
  if (stroke) {
    art.strokeStyle=stroke;
    art.lineWidth=width;
    art.stroke();
  }
}

function sceneryOval(art,x,y,rx,ry,color,angle=0) {
  art.beginPath();
  art.ellipse(x,y,rx,ry,angle,0,2*Math.PI);
  art.fillStyle=color;
  art.fill();
}

function sceneryStroke(art,color,width,points) {
  art.beginPath();
  art.moveTo(...points[0]);
  for (const point of points.slice(1)) art.lineTo(...point);
  art.strokeStyle=color;
  art.lineWidth=width;
  art.stroke();
}

const groundPaint = {
  steppe:['#c5c38265','#263e2864','#acc16f','#385d3d'],
  sand:['#edc79365','#694f3a61','#d5b277','#765d3d'],
  rock:['#d3bf9b5a','#373c3670','#c4ad8d','#686450'],
  alpine:['#edf0d855','#303e4465','#dbded0','#777c76'],
  marsh:['#b7b77b66','#284c426d','#bdc879','#365c4d']
};
const frozenGround = ['#f7fcf384','#344f6663','#e4eddf','#687e84'];

function groundDetails(art,kind,random,winterView) {
  const [sun,shade,tip,root]=winterView ? frozenGround : groundPaint[kind];
  const glaze=art.createLinearGradient(-6,-6,5,7);
  glaze.addColorStop(0,sun);
  glaze.addColorStop(.48,'#82836500');
  glaze.addColorStop(1,shade);
  art.globalAlpha=.55;
  art.fillStyle=glaze;
  art.fillRect(-8,-8,16,16);
  art.globalAlpha=1;

  for (let i=0;i<22;i++) {
    const x=(random()-.5)*14.4,y=(random()-.5)*14.2;
    const width=.22+random()*.79,height=.075+random()*.12;
    sceneryOval(art,x+.18,y+.14,width,height,shade,-.12);
    if (i%3!==0) sceneryOval(art,x,y,width*.62,height*.65,sun,-.12);
  }
  if (kind==='rock' || kind==='alpine') return;
  if (kind==='sand') {
    for (let i=0;i<4;i++) {
      const x=(random()-.5)*6,y=(i-1.5)*2.8;
      const width=2.5+random()*1.9;
      art.beginPath();
      art.moveTo(x-width,y+.56);
      art.bezierCurveTo(x-width*.35,y-1.6,x+width*.40,y+.65,x+width,y-.30);
      art.quadraticCurveTo(x+width*.4,y+1.07,x-width,y+.56);
      art.fillStyle=shade;
      art.fill();
      art.beginPath();
      art.moveTo(x-width,y+.53);
      art.bezierCurveTo(x-width*.35,y-1.57,x+width*.40,y+.53,x+width,y-.32);
      art.strokeStyle=sun;
      art.lineWidth=.25;
      art.stroke();
    }
  }

  const tuftCount=winterView || kind==='sand' ? 8 : 15;
  for (let i=0;i<tuftCount;i++) {
    const x=(random()-.5)*13,y=(random()-.5)*13;
    const h=(.28+random()*.66)*(winterView?.72:1);
    sceneryOval(art,x+.22,y+.05,h*.86,h*.26,shade);
    sceneryStroke(art,root,.16,[[x-h*.65,y-h*.46],[x,y],[x+h*.34,y-h]]);
    sceneryStroke(art,tip,.12,[[x,y-.08],[x-h*.14,y-h*.87]]);
  }
  if (kind==='marsh') {
    for (let i=0;i<3;i++) {
      const x=(random()-.5)*8,y=(i-1)*3.75;
      sceneryOval(art,x+.18,y+.20,1.5,.53,shade,-.18);
      sceneryOval(art,x,y,1.44,.47,winterView?'#8cb8c5':'#4d8990',-.18);
      sceneryStroke(art,sun,.13,[[x-1,y],[x-.1,y-.18],[x+.72,y-.26]]);
    }
  }
}

function waterDetails(art,random,winterView) {
  const glint=winterView?'#d5edf1b5':'#b6e4da9e';
  const depth=winterView?'#263d6979':'#173c5578';
  for (let i=0;i<17;i++) {
    const x=(random()-.5)*15,y=(random()-.5)*15;
    const width=.72+random()*2.8;
    art.beginPath();
    art.moveTo(x-width/2,y);
    art.bezierCurveTo(x-width*.21,y-.26,x+width*.17,y+.25,x+width/2,y-.10);
    art.lineWidth=i%3===0?.18:.10;
    art.strokeStyle=i%4===0 ? depth : glint;
    art.stroke();
  }
}

function ridgeDetails(art,random,alpine,winterView) {
  const snow=winterView || alpine;
  const angle=(random()-.5)*1.23;
  const span=3.7+random()*1.7;
  const count=2+Math.floor(random()*3);
  const hills=Array.from({length:count},(_,index)=> {
    const offset=(index/(count-1)-.5)*span;
    return [Math.cos(angle)*offset+(random()-.5)*1.0,
      Math.sin(angle)*offset+(random()-.5)*2.8-.62,.71+random()*.55];
  }).sort((a,b)=>a[1]-b[1]);
  for (const [x,y,size] of hills) {
    const z=1.40+random()*1.77,width=1.94+random()*.62;
    const lean=(random()-.5)*.9;
    art.save();
    art.translate(x,y);
    art.scale(size,size);
    const peak=[lean,-z],shoulder=[.55+lean,-z*.60],side=[width,.82],heel=[-width,.59];
    const saddle=[lean+.23,-z*.57],face=[lean+.03,-z*.36];
    const lit=art.createLinearGradient(0,-z,0,1);
    lit.addColorStop(0,snow?'#dde5de':'#c4b79d');
    lit.addColorStop(.8,snow?'#a7b9b9':'#8e8872');
    lit.addColorStop(1,snow?'#a2b5b900':'#8e887200');
    sceneryOval(art,.70,.91,width*1.05,.58,'#172c3b55',.12);
    sceneryPolygon(art,[heel,[-width*.67,.05],[-1.13,-z*.39],[-.54,-z*.59],peak,
      saddle,shoulder,[width*.69,.17],side,[1.18,1.11],[-.35,1.18]],lit);
    sceneryPolygon(art,[peak,saddle,shoulder,[width*.69,.17],side,[1.18,.90],[.53,.67],face],
      snow?'#879da6':'#71796b');
    sceneryPolygon(art,[peak,face,[.45,.56],[-.30,.85],[-.69,.60],[-.22,-z*.21],[-.58,-z*.40]],
      snow?'#c9d7d4':'#a9a186');
    sceneryPolygon(art,[shoulder,[width*.69,.17],side,[1.40,.75]],snow?'#728b9c':'#566359');
    if (snow) sceneryPolygon(art,[[-.54,-z*.59],peak,saddle,shoulder,[.97,-z*.28],
      [.47,-z*.40],[.23,-z*.20],[lean-.02,-z*.52],[-.49,-z*.35]],'#f0f1e5');
    for (let i=0;i<3;i++) {
      const n=.32+i*.2;
      const grain=(random()-.5)*.25;
      sceneryStroke(art,snow?'#45667861':'#3d514c83',.12,[[n+lean,-z*(.37-i*.07)],
        [n+.20,-.32],[n+.32+grain,.14],[n+.66+i*.20,.55]]);
      sceneryStroke(art,snow?'#f6f8e875':'#ecce987b',.09,[[-n,-z*(.54-i*.10)],
        [-n-.16,-.20],[-n-.27+grain,.17],[-n-.60,.53]]);
    }
    art.restore();
  }
}

function fieldDetails(art,random,coverage,winterView) {
  const colors=winterView ? ['#b9c8bd','#cad5c8','#a7b5b3','#d5d9c1'] : ['#a99656','#b7a15e','#769351','#93a75f'];
  art.save();
  art.translate((random()-.5)*1.8, (random()-.5)*2.3);
  art.rotate((random()-.5)*1.15);
  for (let i=0;i<coverage*2;i++) {
    const x=(i%2-1)*4.31+.15,y=(Math.floor(i/2)-coverage/2)*2.7+.35;
    const w=3.49+random()*.56,h=1.82+random()*.62;
    const skew=(random()-.5)*.58;
    sceneryPolygon(art,[[x+.25,y+.15],[x+w+.48,y+skew+.26],[x+w+.32,y+h+skew+.29],[x+.10,y+h+.24]],'#22392e51');
    sceneryPolygon(art,[[x,y],[x+w,y+skew],[x+w-.24,y+h+skew],[x-.24,y+h]],colors[(i+Math.floor(random()*4))%4],'#3d4e3a9c');
    for (let row=1;row<8;row++) {
      const t=row/8;
      const start=[x-.24*t,y+h*t];
      const end=[start[0]+w,start[1]+skew];
      sceneryStroke(art,winterView?'#58707982':'#354f306e',.095,[start,end]);
      sceneryStroke(art,winterView?'#f3f7e58d':'#f2df9e7a',.10,[[start[0],start[1]+.13],[end[0],end[1]+.13]]);
    }
  }
  art.restore();
}

function canopyTree(art,x,y,size,pine,winterView,variant) {
  art.save();
  art.translate(x,y);
  art.scale(size,size);
  sceneryOval(art,.57,.17,1.39,.42,'#162e3b63',.13);
  sceneryStroke(art,winterView?'#526264':'#605440',.19,[[0,.16],[-.05,-1.02]]);
  if (pine) {
    const dark=winterView?'#3e6268':'#2c574b';
    const light=winterView?'#cfdfd7':variant>.45?'#7b9a5b':'#669361';
    for (let i=0;i<3;i++) {
      const tip=-1.08-i*.57,base=.05-i*.56,width=.74-i*.18;
      sceneryPolygon(art,[[-width,base-.07],[-.02,tip],[width,base+.14],[.13,base+.29]],dark,'#193c3a',.09);
      sceneryPolygon(art,[[-width+.09,base-.09],[-.02,tip],[.12,base+.11],[-.15,base+.08]],light);
    }
  } else if (winterView) {
    sceneryStroke(art,'#667774',.17,[[.02,.05],[.02,-.67],[-.23,-1.73]]);
    sceneryStroke(art,'#7f8d83',.12,[[-.04,-.41],[-.58,-.86],[-.75,-1.46]]);
    sceneryStroke(art,'#6c817e',.13,[[.03,-.72],[.55,-1.12],[.68,-1.62]]);
    sceneryStroke(art,'#e7eee5bf',.10,[[-.61,-.91],[-.09,-.76],[.46,-1.15],[.63,-1.57]]);
    sceneryOval(art,.02,.08,.67,.25,'#e5eee2a9');
  } else {
    const crown=art.createRadialGradient(-.40,-1.67,.12,.05,-1.20,1.15);
    crown.addColorStop(0,variant>.6?'#b8b965':'#a0b77a');
    crown.addColorStop(.55,variant>.6?'#82944f':'#669157');
    crown.addColorStop(1,'#305740');
    sceneryOval(art,.18,-.92,1.02,.80,'#234636');
    sceneryOval(art,-.14,-1.30,.94,.89,crown);
    sceneryOval(art,.44,-1.11,.68,.62,crown);
    sceneryOval(art,-.46,-1.56,.24,.18,'#d5d9906e');
  }
  art.restore();
}

function woodsDetails(art,random,coverage,pine,winterView) {
  const count=[0,3,7,12][coverage];
  const cx=(random()-.5)*3.6,cy=(random()-.5)*2.6;
  const trees=Array.from({length:count},()=>[
    cx+(random()-.5)*(4.3+coverage*1.9),
    cy+(random()-.5)*(4.5+coverage*1.6)+.88,
    .67+random()*.64,
    random()
  ]).sort((a,b)=>a[1]-b[1]);
  for (const [x,y,size,variant] of trees) canopyTree(art,x,y,size,pine || variant>.83,winterView,variant);
}

function scenerySprite(kind,woods,fields,variant,winterView) {
  const key=[kind,woods,fields,variant,winterView].join('/');
  sceneryPass.visible.add(key);
  const cached=scenerySprites.get(key);
  if (cached) return cached;
  if (!sceneryPass.remaining || sceneryPass.generationMs>=sceneryFrameBudgetMs) {
    sceneryPass.pending=true;
    return null;
  }
  const start=performance.now();
  const surface=document.createElement('canvas');
  surface.width=surface.height=scenerySize;
  const art=surface.getContext('2d');
  const ratio=scenerySize/sceneryExtent;
  art.setTransform(ratio,0,0,ratio,scenerySize/2,scenerySize/2);
  art.lineJoin=art.lineCap='round';
  art.scale(.94,.94);
  art.clip(sceneryClip);
  const random=sceneryRandom(88427+variant*5591);
  if (kind==='water') {
    waterDetails(art,random,winterView);
  } else {
    groundDetails(art,kind,random,winterView);
    if (kind==='alpine' || kind==='rock') ridgeDetails(art,random,kind==='alpine',winterView);
    if (fields) fieldDetails(art,random,fields,winterView);
    if (woods) woodsDetails(art,random,woods,kind==='alpine' || kind==='rock',winterView);
  }
  scenerySprites.set(key,surface);
  sceneryPass.remaining--;
  sceneryPass.generationMs+=performance.now()-start;
  return surface;
}

function sceneryKind(tile) {
  const [,,terrain,,,shade,z,cover]=tile;
  if (terrain===0 || cover===80) return 'water';
  if (z>2650 || cover===70) return 'alpine';
  if (z>1500 || (z>700 && Math.abs(shade)>12)) return 'rock';
  if (cover===90) return 'marsh';
  if (cover===20 || cover===60) return 'sand';
  return 'steppe';
}

function drawTerrainDetail(tile,index,s,local,inSurvey) {
  if (!sceneryPass) return;
  const [x,y,,,,,z,cover,trees,crops]=tile;
  const kind=sceneryKind(tile);
  const winterView=state.layer==='winter';
  const woods=trees>=14 || cover===10 ? 3 : trees>=6 ? 2 : trees>=1 ? 1 : 0;
  const fields=z<1750 ? (crops>=17 ? 3 : crops>=9 ? 2 : crops>=4 ? 1 : 0) : 0;
  const variant=Math.floor(rasterNoise(x,y,12)*12);
  const sprite=scenerySprite(kind,woods,fields,variant,winterView);
  if (!sprite) return;
  const fade=clamp((s-1.2)/1.35,0,1);
  const baseOpacity=winterView || state.layer==='terrain' ? 1 : .57;
  const sceneOpacity=citiesByTile.has(index) ? .43 : local && !inSurvey ? .69 : 1;
  context.globalAlpha=fade*baseOpacity*sceneOpacity;
  context.drawImage(sprite,x-data.radius,y-data.radius,sceneryExtent,sceneryExtent);
  context.globalAlpha=1;
}
