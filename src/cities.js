const cityLandmarks = new Map(JSON.parse($('city-landmarks').textContent).map(item=>[item.cityId,item]));
const landmarksByTile = new Map();
for (const item of cityLandmarks.values()) {
  const tile=nearestTile(...item.xy);
  const entries=landmarksByTile.get(tile) ?? [];
  entries.push(item);
  landmarksByTile.set(tile,entries);
}
const winter = JSON.parse($('winter-data').textContent);
const winterBands = [
  {label:'≥ 0 °C', color:'#edcf9d', min:0},
  {label:'−5 to <0 °C', color:'#9fd6ca', min:-5},
  {label:'−10 to <−5 °C', color:'#6ab4c4', min:-10},
  {label:'−15 to <−10 °C', color:'#5188bc', min:-15},
  {label:'−20 to <−15 °C', color:'#42568f', min:-20},
  {label:'< −20 °C', color:'#514779', min:-Infinity},
];
const winterMissing = '#283c47';
const temperature = new Intl.NumberFormat('en',{maximumFractionDigits:1,minimumFractionDigits:1,signDisplay:'exceptZero'});
const celsius = value => temperature.format(value).replace('-', '−')+' °C';
const winterTemperature = tile => winter.hexes[tile] ?? null;
const winterTileColor = value => value===null ? winterMissing : winterBands.find(band=>value>=band.min).color;

const environments = new Map();
function cityEnvironment(city) {
  if (!environments.has(city.id)) {
    const tiles = data.tiles.filter(tile=>nearby(tile,city));
    const land = tiles.filter(tile=>tile[2]!==0 && tile[7]!==80);
    const coverCounts = new Map();
    for (const tile of land) {
      if (tile[7]) coverCounts.set(tile[7],(coverCounts.get(tile[7])||0)+1);
    }
    const dominant = [...coverCounts].sort((a,b)=>b[1]-a[1])[0]?.[0];
    const elevations = land.map(tile=>tile[6]);
    const centre = data.tiles[nearestTile(...city.xy)];
    environments.set(city.id,{
      dominant,
      waterShare: tiles.length ? (tiles.length-land.length)/tiles.length : 0,
      span: elevations.length ? [Math.min(...elevations),Math.max(...elevations)] : null,
      centreElevation: centre?.[2] && centre[7]!==80 ? centre[6] : null,
    });
  }
  return environments.get(city.id);
}

function landscapeStory(city) {
  const {dominant,span,waterShare} = cityEnvironment(city);
  const cover = coverLabel[dominant]?.toLowerCase();
  if (span && span[1]-span[0]>=800) {
    return 'Nearby land hexes span '+fmt.format(span[0])+' to '+fmt.format(span[1])+' m in sampled elevation.';
  }
  if (waterShare>=.20) return fmt.format(Math.round(waterShare*100))+'% of the surrounding hex centres fall on water.';
  return cover ? 'The most common mapped land cover around '+city.name+' is '+cover+'.' :
    'Explore the terrain in the hexes surrounding '+city.name+'.';
}

function landscapeStyle(city) {
  const {dominant,span,waterShare}=cityEnvironment(city);
  if (span && span[1]-span[0]>=800) return 'landscape';
  if (waterShare>=.20) return 'waterside';
  if (dominant===10) return 'woodland';
  if (dominant===40) return 'farmland';
  return dominant===60 ? 'dryland' : 'steppe';
}

const landmarkSprites = new Map();
function landmarkSprite(style) {
  if (landmarkSprites.has(style)) return landmarkSprites.get(style);
  const surface = document.createElement('canvas');
  surface.width=surface.height=192;
  const art = surface.getContext('2d');
  art.scale(2,2);
  art.lineJoin='round';
  art.lineCap='round';
  const polygon = (points,fill,outline='#203839',width=1.3) => {
    art.beginPath();
    points.forEach(([x,y],i)=>i ? art.lineTo(x,y) : art.moveTo(x,y));
    art.closePath();
    if (fill) {art.fillStyle=fill; art.fill();}
    if (outline) {art.strokeStyle=outline;art.lineWidth=width;art.stroke();}
  };
  const line = (points,color,width=1.3) => {
    art.beginPath();
    points.forEach(([x,y],i)=>i ? art.lineTo(x,y) : art.moveTo(x,y));
    art.strokeStyle=color;
    art.lineWidth=width;
    art.stroke();
  };
  const oval = (x,y,rx,ry,color) => {
    art.beginPath();
    art.ellipse(x,y,rx,ry,0,0,Math.PI*2);
    art.fillStyle=color;
    art.fill();
  };
  const box = (x,y,w,h,fill,side,roof,depth=7) => {
    polygon([[x+w,y],[x+w+depth,y-depth*.55],[x+w+depth,y+h-depth*.55],[x+w,y+h]],side);
    polygon([[x,y],[x+depth,y-depth*.55],[x+w+depth,y-depth*.55],[x+w,y]],roof);
    polygon([[x,y],[x+w,y],[x+w,y+h],[x,y+h]],fill);
  };
  const opening = (x,y,w,h,color) => {
    art.beginPath();
    art.moveTo(x,y+h);
    art.lineTo(x,y+w/2);
    art.quadraticCurveTo(x+w/2,y-w*.43,x+w,y+w/2);
    art.lineTo(x+w,y+h);
    art.closePath();
    art.fillStyle=color;
    art.fill();
  };
  const teal='#3b8e87', jade='#75b9a4', gold='#e8ba61', cream='#f3d799', dark='#213b42';
  const clay='#b47852', lightClay='#d5a16b';
  oval(52,77,39,12,'#11252b72');
  polygon([[12,68],[48,56],[85,67],[85,75],[49,87],[12,76]],'#5e6656');
  polygon([[12,68],[48,55],[85,67],[49,80]],'#c3a980','#f5dba3');
  if (style==='cathedral') {
    box(23,52,44,19,'#e5b65c','#a57543','#e5c981');
    for (let x=27;x<66;x+=8) opening(x,55,3.3,10,'#40676a');
    const spire = (x,y,w,h) => {
      box(x-w/2,y,w,h,'#f0c575','#b88650','#f4dea5',4);
      opening(x-2,y+3,4,h-3,'#536e66');
      polygon([[x-w*.71,y],[x-w*.48,y-6],[x,y-16],[x+w*.55,y-5],[x+w*.72,y]],teal);
      line([[x-w*.51,y],[x-1,y-12]],jade);
      line([[x,y-16],[x,y-23]],gold,1.8);
      line([[x-2.5,y-20],[x+2.5,y-20]],gold,1.8);
    };
    spire(66,47,12,20);
    spire(35,47,14,21);
    spire(49,36,17,34);
  } else if (style==='bayterek') {
    box(32,67,28,6,'#e5d7b0','#a29879','#fbefc6');
    polygon([[40,67],[36,49],[25,25],[32,25],[48,48],[64,25],[70,25],[60,48],[55,67]],'#f8edd6');
    for (const x of [27,34,41,48,55,62,69]) line([[x,25],[48+(x-48)*.24,65]],'#acb9ab',.9);
    line([[39,51],[58,51]],cream,2);
    const sphere = art.createRadialGradient(43,17,1,50,25,19);
    sphere.addColorStop(0,'#fff4b7');
    sphere.addColorStop(.48,'#e8bb56');
    sphere.addColorStop(1,'#985a38');
    oval(48,22,18,18,sphere);
    art.beginPath();art.ellipse(48,22,18,18,0,0,Math.PI*2);
    art.strokeStyle='#d39a4c';art.lineWidth=1.3;art.stroke();
    line([[35,22],[42,27],[52,28],[62,25]],'#f7d586',1);
    line([[30,28],[42,36],[56,35],[67,26]],cream,2);
  } else if (style==='citadel') {
    box(17,54,56,14,clay,'#85573f',lightClay);
    box(23,45,13,24,lightClay,'#8e5540','#e0b47c');
    box(63,45,13,18,lightClay,'#8e5540','#e0b47c');
    box(37,47,23,22,'#d29766','#8a563d','#e7b67b');
    opening(44,50,10,19,'#57433a');
    for (const x of [23,31,38,47,55,64,72]) box(x,43,5,4,cream,clay,cream,2);
    line([[20,64],[36,64],[39,67],[56,67],[61,63],[72,63]],'#f3ca9788');
  } else if (style==='dome') {
    box(27,49,43,23,'#c8965d','#946040','#e5bf88');
    box(38,36,25,13,teal,'#345e61',jade,4);
    oval(50,35,16,14,teal);
    for (const x of [-9,-4,2,8]) line([[50,22],[50+x,31],[50+x,41]],jade);
    line([[50,22],[50,17]],gold,1.8);
    box(26,41,32,30,'#ddb581','#a3704b','#f1cfa0',6);
    opening(34,45,16,26,'#325460');
    opening(38,49,8,22,'#192f3a');
    line([[30,44],[30,68],[54,68],[54,44]],'#ac7d53',1);
    line([[32,47],[42,40],[52,47]],'#805b4a',1.6);
  } else if (style==='karakhan') {
    oval(51,50,18,16,'#a9774d');
    box(28,46,42,25,'#b98a5e','#826949','#d0a979',8);
    box(24,44,8,27,'#c29a6d','#8a694a','#e3bd8b',4);
    box(64,44,8,27,'#c29a6d','#8a694a','#e3bd8b',4);
    opening(39,48,18,22,'#724b39');
    opening(44,53,8,17,'#372c2d');
    for (const x of [35,38,58,61]) line([[x,49],[x,69]],'#d5ac83',.85);
  } else if (['nur-gasyr','pavlodar','aitbay'].includes(style)) {
    const tent=style==='pavlodar';
    const goldDome=style==='nur-gasyr';
    const shell=goldDome?'#e3b858':'#3c9bac';
    const towerTop=tent?21:goldDome?27:29;
    const minaret = (x,y) => {
      box(x-2.5,y,5,60-y,'#e0c590','#98886d','#ead5a6',2);
      polygon([[x-3.5,y],[x,y-10],[x+3.5,y]],shell);
      line([[x,y-10],[x,y-14]],'#baa16c');
    };
    if (style!=='aitbay') {minaret(28,towerTop-4);minaret(71,towerTop-3);}
    box(26,51,46,18,'#e5cb9e','#a28c71','#ecdbb7',5);
    if (tent) {
      polygon([[31,53],[41,41],[51,27],[60,42],[69,53]],shell);
      line([[33,52],[51,27],[57,52]],'#b1ddd0',1.4);
      oval(51,26,4,2,'#d0be83');
    } else {
      oval(50,50,17,14,shell);
      line([[38,49],[42,40],[50,36]],goldDome?'#fff0a3':'#9cd8d7',1.6);
    }
    box(36,55,25,15,'#f3dab0','#b89b75','#f5ddb6',3);
    opening(44,56,9,14,'#6b7772');
    minaret(21,towerTop);
    if (style!=='aitbay') minaret(74,towerTop+3);
  } else if (style==='oral') {
    box(26,50,47,24,'#e2d9b6','#8c9a8e','#f4e7c5',6);
    polygon([[28,49],[49,39],[77,47],[72,52]],'#6a9d79');
    box(45,39,18,24,'#f4e8ce','#a8afa0','#ece4c4',4);
    oval(55,38,11,10,'#5e947e');
    line([[55,28],[55,22]],gold,1.8);
    line([[52.5,24],[57.5,24]],gold,1.7);
    box(29,47,12,23,'#f0e2c5','#83958b','#dce0bf',3);
    polygon([[27,47],[35,32],[43,47]],teal);
    opening(51,47,6,12,'#697a73');
  } else if (style==='lighthouse') {
    polygon([[13,68],[30,63],[57,73],[51,79],[27,74]],'#4d9396',null);
    line([[23,70],[31,69],[40,72],[49,71]],'#b7dec5');
    box(35,48,40,20,'#c8be9e','#827e67','#e8d8ad',5);
    for (const y of [53,59]) for (const x of [39,47,55,63]) box(x,y,3,2,'#43737a','#43737a','#43737a',0);
    box(53,33,12,15,'#e9d8ac','#9c9b86',cream,4);
    box(51,29,16,6,'#4f8390','#365d6b',cream,3);
    polygon([[49,29],[60,22],[71,29]],'#bd694d');
    line([[55,33],[64,33]],gold,2.9);
  } else if (style==='bridge') {
    polygon([[12,67],[25,62],[60,59],[85,66],[72,75],[49,81]],'#407d97',null);
    line([[16,70],[31,68],[48,73],[57,73],[73,67]],'#91ccc6');
    line([[16,69],[79,50]],dark,8);
    line([[16,68],[79,49]],'#c5c7ae',4);
    for (const [x,y] of [[32,63],[65,53]]) {
      line([[x-3,y+4],[x-3,y-20],[x+4,y-22],[x+4,y+2]],'#e2d5ac',3);
      line([[x-4,y-14],[x+4,y-16]],'#697e80',2);
    }
    line([[18,67],[31,42],[42,49],[51,48],[65,32],[79,49]],'#f4db9d',1.3);
    for (const [x,y] of [[37,47],[44,49],[51,48],[58,42]]) line([[x,y],[x,66-(x-16)*.30]],cream,.9);
  } else if (style==='monument') {
    box(26,61,42,7,'#a4aaa0','#657574','#d8d5b3');
    box(33,55,29,8,'#c9c2a4','#899584','#ede2b9');
    for (const [x,y] of [[41,43],[56,43]]) {
      oval(x,y-4,4,5,'#8c8265');
      polygon([[x-4,y],[x+4,y],[x+6,y+13],[x-5,y+14]],'#738477');
      line([[x,y+3],[48,y-12]],'#b0a37e',4);
    }
    polygon([[39,34],[45,29],[54,29],[59,34],[53,39],[44,38]],'#596764');
    line([[40,33],[48,31],[55,33]],'#c4bf9e',1);
  } else if (style==='riders') {
    box(23,60,50,8,'#b9ad95','#7d7768','#e5cfaa',5);
    for (const [x,y] of [[37,47],[61,45]]) {
      oval(x,y,10,5,'#667c70');
      polygon([[x+5,y+2],[x+8,y-9],[x+14,y-11],[x+14,y-6],[x+10,y-3]],'#728779');
      line([[x-7,y+3],[x-9,y+12],[x-5,y+15]],'#52665a',2.2);
      line([[x+6,y+3],[x+10,y+9],[x+9,y+13]],'#5e7263',2.2);
      line([[x-1,y],[x,y-9],[x+5,y-15]],'#a5ab8b',3);
      oval(x+4,y-14,3,3.4,'#939978');
      line([[x+1,y-7],[x+9,y-8]],'#b1b08b',1.6);
    }
  } else if (style==='yurt') {
    oval(52,65,24,8,'#877456');
    polygon([[28,57],[31,53],[45,43],[53,42],[72,51],[76,58],[76,65],[53,72],[28,65]],'#e9d9b5');
    line([[28,59],[52,65],[76,58]],'#b47b5c',2.1);
    opening(48,57,9,13,'#755447');
    oval(53,44,6,2,clay);
    for (const x of [39,65]) line([[53,45],[x,57]],'#b39b77');
  } else if (style==='fishing') {
    polygon([[15,68],[36,61],[64,64],[80,67],[51,80]],'#4f9692',null);
    polygon([[22,62],[76,57],[67,70],[37,72]],'#7c5844');
    polygon([[22,61],[60,55],[76,57],[66,63],[37,66]],'#c29868');
    box(42,48,17,13,'#eee0a9','#a29470','#e7c890',4);
    line([[52,50],[54,32],[69,37]],cream,2);
    polygon([[54,34],[63,36],[55,42]],'#b87450',null);
    line([[21,72],[32,72],[43,76],[59,74]],jade,1.5);
  } else if (style==='soyuz') {
    box(32,66,31,8,'#b7afa1','#7b7d75','#e1d4b6',6);
    polygon([[44,66],[44,30],[50,14],[55,30],[55,66]],'#e3d7b8');
    polygon([[50,14],[55,30],[55,66],[51,66],[51,28]],'#b4bdb0',null);
    polygon([[37,67],[39,49],[44,39],[46,55],[45,67]],'#d3caba');
    polygon([[54,67],[55,49],[60,39],[63,55],[63,67]],'#aeb7ab');
    line([[38,61],[44,61]],'#a35845',2.5);
    line([[56,60],[62,60]],'#a35845',2.5);
    line([[49,14],[49,9]],'#eee2ba',1.4);
  } else if (style==='landscape') {
    polygon([[19,68],[38,38],[47,52],[58,32],[78,66],[55,75]],'#8f9679');
    polygon([[19,68],[38,38],[41,56],[35,68]],'#b5ac84',null);
    polygon([[48,56],[58,32],[66,45],[58,43],[53,48]],'#e6dfc5',null);
    line([[25,66],[38,65],[46,69],[57,69],[68,63]],jade,2);
  } else if (['waterside','woodland','farmland','steppe','dryland'].includes(style)) {
    polygon([[13,67],[48,53],[83,65],[48,78]],style==='dryland'?'#c29860':'#9da56a');
    if (style==='waterside') {
      polygon([[13,67],[39,60],[61,63],[73,62],[83,65],[48,78]],'#479493',null);
      line([[16,67],[39,61],[61,64],[73,63]],'#d4d4a0',2);
      line([[28,68],[41,67],[54,72],[68,68]],'#a0d4c5',1.9);
    } else if (style==='woodland') {
      for (const [x,y] of [[34,61],[56,58],[60,68],[45,72]]) {
        oval(x+3,y,10,3,'#4e684d88');
        polygon([[x-8,y],[x,y-17],[x+8,y]],'#396b58');
        line([[x-5,y-2],[x,y-14]],jade,1.2);
      }
    } else if (style==='farmland') {
      for (const [x,y,color] of [[24,65,'#dad08b'],[38,70,'#b5bd76'],[45,60,'#d3b770']]) {
        polygon([[x,y],[x+18,y-6],[x+27,y-2],[x+9,y+4]],color,'#5e6b43');
        line([[x+3,y+1],[x+21,y-5]],'#706a42');
      }
    } else {
      for (const [x,y] of [[24,67],[33,63],[53,64],[45,70],[62,69],[68,64]]) {
        line([[x-2,y],[x-1,y-4],[x,y],[x+3,y-3]],style==='dryland'?'#836045':'#586f42',1.3);
      }
    }
  } else {
    box(25,51,49,19,lightClay,'#876747',cream);
    box(39,44,19,27,'#e9bf88','#aa835f','#f7ddaa',4);
    polygon([[24,52],[43,45],[37,37],[22,48]],teal);
    polygon([[28,51],[46,39],[61,46],[48,52]],'#52938b');
    polygon([[59,49],[69,43],[78,50],[75,54]],teal);
    opening(46,53,7,18,'#4c5551');
    for (const x of [29,35,60,68]) opening(x,56,3,9,'#51686a');
  }
  const sprite = {surface,url:surface.toDataURL('image/png')};
  landmarkSprites.set(style,sprite);
  return sprite;
}

function mappedLandmark(city,s) {
  if (!city || city.id!==state.city || view.zoom<2.5 || s<1.42 ||
      !['terrain','winter'].includes(state.layer)) return null;
  return cityLandmarks.get(city.id);
}
function landmarkBox(s) {
  const size = clamp(16*s,47,86);
  return {size,anchorX:size*.50,anchorY:size*.77};
}
function drawLandmark(item,s) {
  const {size,anchorX,anchorY} = landmarkBox(s);
  const [x,y] = item.xy;
  if (state.landmark===item.cityId) {
    ellipse(x,y+1,9,5,'#fff1aa64');
    ellipse(x,y+1,7,3.8,'#bbdac080');
  }
  context.drawImage(landmarkSprite(item.style).surface,x-anchorX/s,y-anchorY/s,size/s,size/s);
}
function addLandmarkHit(city,s) {
  const item=mappedLandmark(city,s);
  if (!item) return;
  const [x,y] = viewPoint(item.xy);
  const {size,anchorX,anchorY} = landmarkBox(s);
  const box=[x-anchorX*.82,y-anchorY*.87,x+(size-anchorX)*.86,y+(size-anchorY)*.43];
  hits.push({landmark:item.cityId,x,y,r:Math.max(12,size*.32),box});
}
