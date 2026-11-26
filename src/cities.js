function localizedStories(id) {
  return new Map(JSON.parse($(id).textContent).map(item=>{
    const key='story.'+item.cityId+'.';
    const titleKey=item.name ? 'name' : 'title';
    item[titleKey]=contentMessage(key+'title',item[titleKey]);
    item.fact=contentMessage(key+'fact',item.fact);
    if (item.city) item.city=cityDisplayName(cityById.get(item.cityId));
    if (item.localName===item.name) item.localName=null;
    return [item.cityId,item];
  }));
}
const cityLandmarks = localizedStories('city-landmarks');
const cityStories = localizedStories('city-stories');
const cityHexes = new Map();
const citiesByTile = new Map();
for (const city of data.cities) {
  const tile=nearestTile(...city.xy);
  cityHexes.set(city.id,tile);
  const cities=citiesByTile.get(tile) ?? [];
  cities.push(city);
  citiesByTile.set(tile,cities);
}

const cityHexLandmarks = new Map();
const landmarksByTile = new Map();
for (const item of cityLandmarks.values()) {
  const city=cityById.get(item.cityId);
  const cityTile=cityHexes.get(city.id);
  let tile=nearestTile(...item.xy);
  if (tile===cityTile || landmarkDistance(city,item)<7) {
    cityHexLandmarks.set(city.id,item);
    tile=cityTile;
  }
  const entries=landmarksByTile.get(tile) ?? [];
  entries.push(item);
  landmarksByTile.set(tile,entries);
}

function cityHexPoint(city) {
  const tile=data.tiles[cityHexes.get(city.id)];
  return tile ? tile.slice(0,2) : city.xy;
}
function cityFocusPoint(city) {
  return ['terrain','winter'].includes(state.layer) ? cityHexPoint(city) : city.xy;
}

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
      coverShare: dominant ? coverCounts.get(dominant) / land.length : 0,
      waterShare: tiles.length ? (tiles.length-land.length)/tiles.length : 0,
      span: elevations.length ? [Math.min(...elevations),Math.max(...elevations)] : null,
      centreElevation: centre?.[2] && centre[7]!==80 ? centre[6] : null,
    });
  }
  return environments.get(city.id);
}

function landscapeStory(city) {
  const {dominant,coverShare,span,waterShare} = cityEnvironment(city);
  const cover = coverLabel[dominant]?.toLowerCase();
  if (span && span[1]-span[0]>=800) {
    return msg("Nearby land hexes span {low} to {high} m in sampled elevation.",{low:fmt.format(span[0]),high:fmt.format(span[1])});
  }
  if (waterShare>=.20) return msg("{percent}% of the surrounding hex centres fall on water.",{percent:fmt.format(Math.round(waterShare*100))});
  if (cover) return msg("About {percent}% of nearby land hexes are classified as {cover}.",{percent:fmt.format(Math.round(coverShare*100)),cover});
  return msg("The January temperature normal at {place} is {temperature}.",{place:cityDisplayName(city),temperature:celsius(winter.cities[city.id][1])});
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
function landmarkSprite(style,winterView=false,cityScene=false) {
  const key=style+'|'+winterView+'|'+cityScene;
  if (landmarkSprites.has(key)) return landmarkSprites.get(key);
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
  if (cityScene) {
    oval(49,76,45,12,'#11252b72');
    polygon([[5,62],[27,47],[69,46],[91,59],[91,72],[69,84],[28,87],[5,74]],
      winterView?'#54687b':'#5e6656');
    polygon([[5,62],[27,47],[69,46],[91,59],[69,77],[27,80]],winterView?'#c0d5dd':'#c3a980',
      winterView?'#e6f2f2':'#f5dba3');
    line([[8,63],[28,72],[64,72],[85,61]],winterView?'#ecf5f2':'#e8cb8f',1.1);
    // Small blocks share the city platform and frame its landmark.
    box(12,53,10,13,'#91a9a3','#536f73',winterView?'#edf3f1':'#c2d0b9',3);
    box(18,48,8,14,'#cfba96','#856f62',winterView?'#e8edeb':'#d6c18e',3);
    box(74,53,9,13,'#acb0a0','#5a7573',winterView?'#e8eeed':'#b9bd9c',3);
    box(80,57,6,9,'#c4a689','#806f65',winterView?'#e8eeed':'#d6b689',3);
    for (const [x,y] of [[15,58],[20,53],[77,57],[82,61]]) line([[x,y],[x,y+2.6]],dark,1.1);
  } else {
    oval(52,77,39,12,'#11252b72');
    polygon([[12,68],[48,56],[85,67],[85,75],[49,87],[12,76]],winterView?'#52677b':'#5e6656');
    polygon([[12,68],[48,55],[85,67],[49,80]],winterView?'#c5dce4':'#c3a980',winterView?'#ebf4f2':'#f5dba3');
  }
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
  } else if (style==='pagoda') {
    const eave=(x,y,w,h)=> {
      polygon([[x-w/2,y],[x-w*.31,y-3],[x-w*.18,y-h],[x+w*.14,y-h-1],[x+w*.32,y-4],[x+w/2,y-3],
        [x+w*.43,y+2],[x,y+6],[x-w*.43,y+3]],'#3d7764');
      line([[x-w/2,y],[x,y+4],[x+w/2,y-3]],'#bb9861',1.8);
    };
    box(24,57,52,13,'#a75c44','#63493e','#c8895c',7);
    for (const x of [29,38,50,64,72]) line([[x,59],[x,69]],cream,1.4);
    eave(51,57,66,13);
    box(40,40,23,16,'#b8734e','#805043',lightClay,4);
    eave(52,42,42,11);
    box(46,28,12,12,lightClay,clay,cream,3);
    eave(52,29,27,8);
    line([[52,21],[52,15]],gold,1.8);
  } else if (style==='rail') {
    for (let i=0;i<8;i++) {
      const x=18+i*7,y=66-i*1.8;
      line([[x,y],[x+11,y+6]],'#795947',3.2);
    }
    line([[16,68],[76,51]],'#ddd2a8',1.8);
    line([[26,74],[82,57]],'#a1a999',1.8);
    for (const [x,y,r] of [[33,66,3.6],[44,63,4.8],[55,60,4.4],[69,56,3.9]]) oval(x,y,r,r*.88,'#233d41');
    box(29,47,40,12,'#627e70','#2e5354',jade,6);
    box(54,36,16,18,'#3a6663','#1f4549','#83a18c',5);
    polygon([[54,42],[60,41],[60,47],[55,48]],cream,null);
    box(36,40,6,11,'#395f63','#25474e','#85988c',3);
    oval(30,54,6,6,'#305456');
    oval(28,54,2,2,gold);
    line([[29,60],[46,57],[71,51]],'#b66b4e',2.1);
  } else if (style==='tower') {
    box(42,47,14,24,'#aa7657','#775349','#cab48a',5);
    opening(46,62,5,8,dark);
    box(37,33,25,19,'#b4815b','#8f5848','#e1bd87',6);
    for (const x of [40,48,56]) opening(x,37,3.5,9,'#4c5d53');
    polygon([[33,34],[39,25],[48,19],[57,21],[67,30],[57,35],[42,36]],'#536d67');
    line([[36,33],[47,35],[62,31]],cream,1.2);
  } else if (style==='theatre' || style==='estate' || style==='literature') {
    const theatre=style==='theatre';
    box(20,50,54,20,theatre?'#e1bf90':'#b47b51','#90634f','#e6c498',7);
    polygon([[16,50],[35,38],[62,37],[80,46],[70,50]],theatre?'#607a73':'#39685f');
    if (theatre) {
      polygon([[29,55],[48,41],[68,53],[63,56],[33,56]],'#f3d6a0');
      for (const x of [32,41,53,62]) line([[x,56],[x,69]],'#f6e0b7',3);
      opening(45,59,7,11,'#536964');
    } else {
      for (const x of [26,37,54,65]) {
        polygon([[x-1,54],[x+6,54],[x+6,63],[x-1,63]],'#e3ca95');
        line([[x+2.5,55],[x+2.5,62]],'#646d5b',.9);
      }
      opening(44,54,6,16,dark);
    }
    if (style==='literature') {
      polygon([[58,69],[68,65],[79,65],[79,72],[69,74],[59,75]],'#f0ddb1',clay);
      line([[68,66],[69,73]],'#a98761',1);
    }
  } else if (style==='industry' || style==='mine') {
    if (style==='mine') {
      polygon([[16,69],[27,46],[42,37],[53,45],[65,65],[47,76]],'#8c9277');
      opening(36,52,14,22,'#354849');
      line([[42,68],[42,75],[57,78]],'#9a805d',2);
      box(55,59,16,9,'#796d55','#4f6058','#b29867',4);
      oval(57,70,2.6,2.6,dark); oval(68,68,2.6,2.6,dark);
    } else {
      box(22,53,51,17,'#8ba49a','#485f5c','#cad0b3',8);
      for (const [x,y] of [[23,50],[34,50],[47,48]]) {
        polygon([[x,y],[x+9,y-7],[x+12,y-2],[x+12,y+3]],'#b9bf9c');
      }
      for (const [x,y] of [[58,30],[67,23]]) {
        polygon([[x-2,y],[x+4,y-1],[x+6,61],[x-4,63]],'#9e6750');
        line([[x-2,y+6],[x+4,y+5]],cream,2);
      }
      line([[27,60],[50,59]],'#57716c',3);
    }
  } else if (style==='dam') {
    polygon([[13,67],[49,54],[84,66],[50,78]],'#478c91');
    for (const [x,y] of [[19,64],[35,68],[57,69]]) line([[x,y],[x+8,y-2],[x+14,y-1]],jade,1.3);
    polygon([[24,57],[67,45],[75,49],[75,58],[32,72],[24,65]],'#aaa88f');
    polygon([[24,57],[67,45],[75,49],[32,62]],'#e8cb98');
    for (const x of [37,46,55,64]) line([[x,61-(x-37)*.29],[x,69-(x-37)*.29]],'#536b65',2.4);
  } else if (style==='wind') {
    polygon([[13,67],[48,53],[84,65],[49,79]],'#a6a775');
    for (const [x,y,h] of [[29,64,23],[69,63,30],[49,71,40]]) {
      oval(x+4,y,10,2.3,'#737c5f');
      line([[x,y],[x,y-h]],'#ede8cc',2.5);
      for (const [dx,dy] of [[0,-h*.45],[-h*.37,h*.23],[h*.35,h*.22]]) {
        line([[x,y-h],[x+dx,y-h+dy]],'#ece2be',2);
      }
      oval(x,y-h,2.2,2.2,'#68857c');
    }
  } else if (style==='garden' || style==='lakeside' || style==='spring') {
    polygon([[14,67],[48,53],[84,65],[48,79]],'#82915f');
    if (style==='garden') {
      line([[43,73],[51,68],[43,62],[55,57],[57,51]],'#e3c58f',3.2);
      for (const [x,y,h] of [[28,63,20],[57,59,24],[67,68,27],[46,73,15]]) {
        oval(x,y,9,3,'#546e51');
        line([[x,y],[x,y-5]],'#81604b',2);
        polygon([[x-7,y-3],[x,y-h],[x+7,y-3]],'#3f735b');
        line([[x-4,y-5],[x,y-h+3]],jade,1);
      }
    } else {
      oval(49,66,27,8,'#456b67');
      oval(49,65,23,6.2,'#539c9b');
      line([[31,65],[42,63],[53,64],[66,63]],'#aed6c0',1.25);
      if (style==='spring') {
        for (const x of [40,49,58]) line([[x,59],[x+3,55],[x,51],[x+1,47]],'#ede3c8',1.15);
      } else {
        polygon([[25,59],[35,53],[39,55],[30,62]],'#d9c397',null);
        polygon([[66,62],[72,53],[78,62]],'#547b5d');
      }
    }
  } else if (style==='rock-cut' || style==='burial-mounds') {
    if (style==='rock-cut') {
      polygon([[16,66],[23,50],[37,43],[41,35],[58,35],[76,51],[82,66],[59,73]],'#a58d61');
      line([[22,56],[36,53],[44,46],[63,45],[72,50]],'#dbc094',2);
      line([[19,62],[38,60],[53,52],[76,53]],'#d9b986',2);
      opening(42,53,14,17,'#424b43');
    } else {
      art.fillStyle='#99a16c';
      art.beginPath(); art.moveTo(17,66); art.quadraticCurveTo(29,47,41,61);
      art.quadraticCurveTo(56,36,76,66); art.lineTo(51,78); art.closePath(); art.fill(); art.stroke();
      line([[44,59],[54,52],[63,55],[69,62]],'#bfb587',1.6);
      oval(50,69,6,2,'#e1bd73');
    }
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
  let url;
  const sprite={surface,get url() { return url ??= surface.toDataURL('image/png'); }};
  landmarkSprites.set(key,sprite);
  return sprite;
}

function cityHexArtVisible(s) {
  return view.zoom>=2.5 && s>=1.42 && ['terrain','winter'].includes(state.layer);
}
function landmarkDistance(city,item) {
  return Math.hypot(city.xy[0]-item.xy[0],city.xy[1]-item.xy[1])*data.metersPerUnit/1000;
}
function landmarkDimensions(s,cityScene) {
  const size=cityScene ? Math.min(92,data.radius*1.78*s) : clamp(16*s,47,86);
  return {size,anchorX:size*.50,anchorY:size*.77};
}
function landmarkBounds(xy,s,cityScene) {
  const [x,y]=viewPoint(xy);
  const {size,anchorX,anchorY}=landmarkDimensions(s,cityScene);
  return [x-anchorX*.94,y-anchorY*.96,x+(size-anchorX)*.94,y+(size-anchorY)*.69];
}
function drawLandmark(item,xy,s,cityScene=false) {
  const {size,anchorX,anchorY}=landmarkDimensions(s,cityScene);
  const [x,y]=xy;
  if (state.landmark===item.cityId) {
    ellipse(x,y+1,size*.48/s,size*.23/s,'#fff1aa80');
  }
  context.drawImage(landmarkSprite(item.style,state.layer==='winter',cityScene).surface,
    x-anchorX/s,y-anchorY/s,size/s,size/s);
}
