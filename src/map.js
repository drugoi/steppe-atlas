const localRadius = 110000 / data.metersPerUnit;
const railPath = path(data.rail,false);
const sitesById = new Map(data.sites.map(site=>[site.id,site]));
const siteStyle = {
  airport:{glyph:'✈',label:'Scheduled airport',color:'#97d8db'},
  port:{glyph:'⚓',label:'Seaport',color:'#97d8db'},
  energy:{glyph:'ϟ',label:'Power plant',color:'#eac279'},
  heritage:{glyph:'✧',label:'World Heritage',color:'#e2acb8'}
};
const coverLabel = {
  0:'Unclassified',10:'Tree cover',20:'Shrubland',30:'Grassland',40:'Cropland',50:'Built-up',
  60:'Bare or sparse vegetation',70:'Snow and ice',80:'Water',90:'Herbaceous wetland',95:'Mangroves',100:'Moss and lichen'
};
const coverColor = {
  0:[90,106,74],10:[61,107,70],20:[142,124,78],30:[110,133,76],40:[165,159,78],50:[152,129,109],
  60:[180,144,99],70:[217,215,196],80:[52,111,118],90:[83,127,102],95:[69,127,91],100:[151,145,116]
};
const densityClasses = [
  {label:'0',color:'#27313f'},
  {label:'<0.1',color:'#303955',min:0},
  {label:'0.1–<1',color:'#424f7d',min:.1},
  {label:'1–<5',color:'#4c789b',min:1},
  {label:'5–<20',color:'#58a6a3',min:5},
  {label:'20–<100',color:'#a1ce8d',min:20},
  {label:'100–<500',color:'#dbd181',min:100},
  {label:'≥500',color:'#fae495',min:500}
];
const densityNoData = '#202b29';
const densityNumber = new Intl.NumberFormat('en',{maximumFractionDigits:2});

function hexDensity([people,area]) { return people/area; }

function densityColor(index) {
  const sample=data.worldPop.hexes[index];
  if (!sample) return densityNoData;
  const density=hexDensity(sample);
  if (density===0) return densityClasses[0].color;
  return densityClasses.findLast(bin=>bin.min<=density).color;
}
function estimatedPeople(count) {
  if (count===0) return '0';
  if (count<1) return '<1';
  return '≈ '+fmt.format(Math.round(count));
}
function describeDensity(sample) {
  const density=hexDensity(sample);
  return (density>0 && density<.01 ? '<0.01' : densityNumber.format(density))+' people/km²';
}
const layerColor = {
  population:{start:[58,88,83],end:[227,177,77],max:2.4e6,key:'pop',ends:['0','2.4M']},
  economy:{start:[62,80,108],end:[201,151,207],max:24e6,key:'capita',ends:['₸0','₸24M']},
  industry:{start:[70,129,132],end:[202,119,65],ends:['Manufacturing','Mining']},
  migration:{start:[162,73,67],mid:[107,101,83],end:[82,175,137],max:60000,key:'migration',ends:['−60K','+60K']},
  labor:{start:[61,135,130],end:[196,107,72],max:6,min:3.5,ends:['3.5%','6.0%']}
};
const activity = new Map(data.activities.map(([id,name,glyph,color])=>[id,{id,name,glyph,color}]));
const tileRows = new Map();
data.tiles.forEach((tile,i)=>{
  const row = Math.round(tile[1]/(data.radius*1.5));
  const column = Math.round(tile[0]/(Math.sqrt(3)*data.radius)-(row%2+2)%2/2);
  if (!tileRows.has(row)) tileRows.set(row,new Map());
  tileRows.get(row).set(column,i);
});
const mapOverlay = {sites:true,rail:true};
function nearby(tile,city) {
  return city && Math.hypot(tile[0]-city.xy[0],tile[1]-city.xy[1])<=localRadius;
}
function rasterNoise(x,y,seed=0) {
  const value = Math.sin((x+697)*13.287 + (y+619)*27.451 + seed*31.331)*43758.545;
  return value-Math.floor(value);
}
function nearestTile(x,y) {
  const row = Math.round(y/(data.radius*1.5));
  const found = [];
  for (let r=row-1;r<=row+1;r++) {
    const column = Math.round(x/(Math.sqrt(3)*data.radius)-(r%2+2)%2/2);
    const tileId = tileRows.get(r)?.get(column);
    if (tileId!==undefined) {
      const tile = data.tiles[tileId];
      found.push([tileId,Math.hypot(tile[0]-x,tile[1]-y)]);
    }
  }
  return found.sort((a,b)=>a[1]-b[1])[0]?.[0];
}
function localCity() {
  return view.zoom>=2.5 && state.city ? cityById.get(state.city) : null;
}
function rankMetric(region,key) {
  if (key==='unemployment') return 1+regions.filter(r=>unemployment(r)<unemployment(region)).length;
  return 1+regions.filter(r=>r[key]>region[key]).length;
}
function unemployment(region) {
  return 100*(1-region.labor.employed.at(-1)/region.labor.force.at(-1));
}
function rgbText(rgb) { return 'rgb('+rgb.map(v=>Math.round(clamp(v,0,255))).join(',')+')'; }
function terrainColor(tile,local) {
  const [x,y,terrain,id,inside,shade,z,cover] = tile;
  const coverRGB = coverColor[cover];
  let rgb = cover ? coverRGB : terrainColors[terrain];
  if (cover!==80) {
    if (z>=1100 && state.layer!=='land') {
      rgb = mix(rgb, z>=2700 ? [190,172,139] : [133,125,97],clamp((z-800)/2200,0,.83));
    }
    if (!inside) rgb = mix([35,52,46],rgb,.60);
  } else if (!inside) rgb = mix([30,64,70],rgb,.8);
  const lens = layerColor[state.layer];
  if (id && lens) {
    const r = regionById(id);
    const value = state.layer==='labor' ? unemployment(r) : r[lens.key];
    let regionColor;
    if (state.layer==='industry') regionColor = mix(lens.start,lens.end,r.mining/(r.mining+r.manufacturing || 1));
    else if (lens.mid) regionColor = mix(lens.mid,value>=0?lens.end:lens.start,Math.abs(value)/lens.max);
    else regionColor = mix(lens.start,lens.end,clamp((value-(lens.min||0))/(lens.max-(lens.min||0)),0,1));
    rgb = mix(rgb,regionColor,.77);
  }
  if (state.layer==='transport' || state.layer==='heritage') rgb = mix(rgb,[33,58,52],.3);
  if (local && state.layer==='terrain') rgb = nearby(tile,local) ? mix(rgb,[166,160,102],.15) : mix(rgb,[29,49,42],.24);
  const relief = state.layer==='land' ? shade*.16 : shade*(inside?.82:.62);
  return rgbText(rgb.map(c=>c+relief+(rasterNoise(x,y)-.5)*14));
}
function shapeFill(points,fill,stroke,weight=.13) {
  context.beginPath();
  points.forEach(([x,y],i)=>i?context.lineTo(x,y):context.moveTo(x,y));
  context.closePath();
  context.fillStyle = fill;
  context.fill();
  if (stroke) {
    context.strokeStyle = stroke;
    context.lineWidth = weight;
    context.stroke();
  }
}
function ellipse(x,y,rx,ry,color) {
  context.beginPath();
  context.ellipse(x,y,rx,ry,0,0,Math.PI*2);
  context.fillStyle=color;
  context.fill();
}
const reliefAsset = JSON.parse($('terrain-relief').textContent);
const reliefImage = new Image();
const outsideCountry = new Path2D(country);
outsideCountry.rect(...reliefAsset.bounds);
reliefImage.addEventListener('load', requestDraw, {once:true});
reliefImage.src = reliefAsset.image;

function drawReliefSurface() {
  if (state.layer !== 'terrain' || !reliefImage.naturalWidth) return false;
  context.drawImage(reliefImage,...reliefAsset.bounds);
  context.fillStyle='#112a251c';
  context.fill(outsideCountry,'evenodd');
  return true;
}

function shadeHexEdge(x,y,scale) {
  for (const [edges,color] of [[[2,3,4],'#f6ecc338'],[[5,0,1],'#15261e59']]) {
    context.beginPath();
    for (const edge of edges) {
      const [ax,ay]=hexOffsets[edge], [bx,by]=hexOffsets[(edge+1)%6];
      context.moveTo(x+ax*.966,y+ay*.966);
      context.lineTo(x+bx*.966,y+by*.966);
    }
    context.strokeStyle=color;
    context.lineWidth=.85/scale;
    context.stroke();
  }
}

function tree(x,y,size,variant) {
  ellipse(x+.76*size,y+.32*size,1.48*size,.40*size,'#142b2690');
  ellipse(x+.18*size,y+.34*size,.92*size,.29*size,'#1d35289c');
  context.fillStyle='#66503a';
  context.fillRect(x-.1*size,y-.48*size,.20*size,.95*size);
  if (variant) {
    for (let branch=0;branch<3;branch++) {
      const top=y-(1.12+branch*.36)*size;
      const base=y+(.37-branch*.40)*size;
      const width=(.66-branch*.14)*size;
      shapeFill([[x-width,base],[x-.09*size,top],[x+width,base-.09*size]],'#294e39','#213b30');
      shapeFill([[x-width,base],[x-.09*size,top],[x+.04*size,base-.12*size]],'#6c8b55');
    }
    return;
  }
  ellipse(x+.10*size,y-.53*size,.89*size,.80*size,'#274d37');
  ellipse(x-.29*size,y-.76*size,.65*size,.62*size,'#6b8950');
  ellipse(x+.27*size,y-.96*size,.54*size,.55*size,'#557d49');
  ellipse(x-.35*size,y-.98*size,.28*size,.30*size,'#9aab64');
}

function fieldStrip(x,y,w,h,tone,skew) {
  const [a,b,c,d]=[[x,y],[x+w,y+skew],[x+w-.55,y+h+skew],[x-.55,y+h]];
  shapeFill([a,b,c,d],tone,'#293b2b80',.17);
  context.lineWidth=.10;
  context.strokeStyle='#f6e7ac65';
  context.beginPath();
  for (let row=1;row<5;row++) {
    const k=row/5;
    context.moveTo(a[0]+(d[0]-a[0])*k,a[1]+(d[1]-a[1])*k);
    context.lineTo(b[0]+(c[0]-b[0])*k,b[1]+(c[1]-b[1])*k);
  }
  context.stroke();
}

const landscapeLayers = new Set(['terrain','land','transport','heritage']);
function tileArtwork(tile,s) {
  const [x,y,terrain,,,shade,z,cover,trees,crops] = tile;
  if (s<1.20 || !landscapeLayers.has(state.layer)) return;
  const detail=clamp((s-1.20)/.90,0,1);
  const choice=rasterNoise(x,y,12);
  context.save();
  context.globalAlpha=detail*(state.layer==='terrain'?1:.58);
  if (cover===80 || terrain===0) {
    context.lineWidth=.13;
    for (let i=0;i<4;i++) {
      const ox=(rasterNoise(x,y,i)-.5)*10,oy=(rasterNoise(x,y,i+9)-.5)*8;
      const w=.9+rasterNoise(x,y,i+13)*2.5;
      context.beginPath();
      context.moveTo(x+ox-w/2,y+oy);
      context.quadraticCurveTo(x+ox,y+oy-.15,x+ox+w/2,y+oy+.06);
      context.strokeStyle=i%2?'#a8d7c782':'#1d587087';
      context.stroke();
    }
  } else {
    if (crops>=5 && z<1750) {
      const colors=['#ac9e5b','#b9b375','#7c9256','#8d9c59'];
      const ox=(choice-.5)*2, oy=(rasterNoise(x,y,11)-.5)*2;
      const tilt=(rasterNoise(x,y,16)-.5)*1.7;
      const width=1.78 + Math.min(crops,25)*.061;
      context.save();
      context.translate(x+ox,y+oy);
      context.rotate((rasterNoise(x,y,27)-.5)*1.26);
      fieldStrip(-3.6,-.5,width,.95+choice*.65,colors[Math.floor(choice*4)],tilt);
      fieldStrip(-.45,-.5+tilt,width*.78,1.6,colors[Math.floor(choice*4+.9)%4],tilt*.6);
      if (crops>=10) fieldStrip(-3.92,1.38,width+.95,1.20+choice*.24,colors[1],tilt*.5);
      if (crops>=17) fieldStrip(.16,1.38+tilt*.5,width*.78,1.35,colors[2],tilt);
      context.restore();
    }
    if (trees) {
      const count=Math.min(12,Math.ceil(trees*.62));
      const ox=(choice-.5)*3,oy=(rasterNoise(x,y,31)-.5)*3;
      const grove=Array.from({length:count},(_,i)=>[
        x+ox+(rasterNoise(x,y,i+40)-.5)*7.3,
        y+oy+(rasterNoise(x,y,i+57)-.5)*6.1,
        .46+rasterNoise(x,y,i+70)*.62,
      ]).sort((a,b)=>a[1]-b[1]);
      for (const [tx,ty,size] of grove) tree(tx,ty,size,z>1250);
    }
    if (crops<6 && trees<4 && z<2300) {
      const dry=cover===60 || cover===20;
      const marks=cover===30 || cover===90 ? 5 : dry ? 3 : 0;
      for (let i=0;i<marks;i++) {
        const ox=(rasterNoise(x,y,i+23)-.5)*10,oy=(rasterNoise(x,y,i+35)-.5)*9;
        const width=.55+rasterNoise(x,y,i+89)*1.35;
        context.lineWidth=dry?.19:.15;
        context.lineCap='round';
        context.beginPath();
        context.moveTo(x+ox-width*.5,y+oy+.15);
        context.quadraticCurveTo(x+ox,y+oy-.44,x+ox+width*.5,y+oy+.05);
        context.strokeStyle=dry?'#815f40a3':'#405a389f';
        context.stroke();
        if (shade>-8) {
          context.beginPath();
          context.moveTo(x+ox-width*.5,y+oy);
          context.quadraticCurveTo(x+ox,y+oy-.50,x+ox+width*.5,y+oy-.07);
          context.strokeStyle=dry?'#f1d1979e':'#c3c880a9';
          context.stroke();
        }
      }
    }
  }
  context.restore();
}
function building(x,y,w,d,h,style) {
  const [face,side,roof] = style;
  shapeFill([[x-w*.53,y-h],[x+w*.33,y-h+d*.27],[x+w*.33,y+d*.32],[x-w*.53,y]],face,'#25382c');
  shapeFill([[x+w*.33,y-h+d*.27],[x+w*.61,y-h-d*.06],[x+w*.61,y-d*.04],[x+w*.33,y+d*.32]],side,'#203329');
  shapeFill([[x-w*.53,y-h],[x-w*.24,y-h-d*.30],[x+w*.61,y-h-d*.06],[x+w*.33,y-h+d*.27]],roof,'#535f4c');
  context.fillStyle='#fcde8d8a';
  for (let sy=y-h+1;sy<y-.2;sy+=.68) {
    for (let sx=x-w*.34;sx<x+w*.19;sx+=.48) context.fillRect(sx,sy,.17,.26);
  }
}
function drawSettlement(city,s) {
  const active = city.id===state.city;
  const [x,y] = city.xy;
  if (s<1.42) return;
  const size=city.official?1:city.seat?.83:.60;
  context.save();
  context.translate(x,y);
  context.scale(size,size);
  ellipse(0,1.2,7.2,3.7,'#243729a6');
  shapeFill([[-6,-1.2],[0,-4],[6,-1.2],[6,2.4],[0,4.8],[-6,2.4]],'#98916f','#ede1a1a0',.38);
  const schemes = [['#a7b7a7','#6c8c7c','#d9c9a5'],['#88aaae','#4f7881','#c0d3bc'],
    ['#b29b77','#80795d','#e0c398'],['#9db1bd','#5b7f90','#ccd4bf']];
  const houses=[[-4.1,-.6,1.4,1.25],[-1.6,-1.9,1.85,3],[.6,-1.3,1.7,2.2],[3.1,-.2,1.7,2],[-2.7,1.0,1.7,1.9],
    [1.7,1.25,2.0,3.3],[-.4,2.7,1.9,1.7],[4.3,1.8,1.4,1.3]];
  for (const [i,[bx,by,w,h]] of houses.entries()) {
    const scale = city.official ? 1.58 : 1;
    building(bx,by,w,1.4,h*scale,schemes[(city.id+i)%schemes.length]);
  }
  if (city.capital) {
    context.strokeStyle='#e0d1a4'; context.lineWidth=.43;
    for (const tip of [-.65,.65]) {
      context.beginPath();context.moveTo(.55+tip,1.05);context.lineTo(.55,-7);context.stroke();
    }
    ellipse(.55,-7.15,.93,.93,'#e6bd66');
    ellipse(.29,-7.42,.40,.34,'#fff1b6');
  }
  if (active) {
    context.strokeStyle='#f7d98d';
    context.lineWidth=.30;
    context.beginPath(); context.ellipse(0,1.35,7.5,4.2,0,0,Math.PI*2); context.stroke();
  }
  context.restore();
}
function marker(x,y,glyph,color,options={}) {
  const r=options.r || 10;
  const points=Array.from({length:6},(_,i)=>[x+Math.cos(Math.PI/3*i)*r,y+Math.sin(Math.PI/3*i)*r]);
  shapeFill(points,'#162720eb',color,options.active?2:1.25);
  context.fillStyle=color;
  context.font='700 '+Math.round(r*1.16)+'px system-ui';
  context.textAlign='center';context.textBaseline='middle';
  context.fillText(glyph,x,y+.35);
}
function districts(region) {
  return [...activity.values()].filter(a=>region.gva[a.id] > 0 && countryStats.gva[a.id] > 0).map(a=>{
    const share=shareOf(region.gva[a.id],region.grp);
    const national=shareOf(countryStats.gva[a.id],countryStats.grp);
    return {...a,share,national,lq:share/national,value:region.gva[a.id]};
  });
}
function specializations(region) {
  return districts(region).filter(a=>a.lq>=1.15 && a.share>=2).sort((a,b)=>b.lq-a.lq).slice(0,4);
}
function mapDistrictPositions(city) {
  const region=regionById(city.region);
  const offsets=[[-19,-16],[18,-14],[18,14],[-17,17]];
  return specializations(region).map((d,i)=>{
    const [dx,dy]=offsets[i];
    const [x,y]=city.xy;
    return {...d,xy:[x+dx,y+dy]};
  });
}
function shownCityMarkers() {
  const main = state.city ? cityById.get(state.city) : null;
  const limit = view.zoom>=1.65 ? data.cities.length : mobile.matches? 10 : 21;
  const chunk = data.cities.slice(0,limit);
  return main ? [main,...chunk.filter(c=>c!==main)] : chunk;
}
function mapSiteVisible(site) {
  if (!mapOverlay.sites && !['transport','heritage'].includes(state.layer)) return false;
  if (state.layer==='density') return false;
  if (state.layer==='transport') return site.kind==='airport'||site.kind==='port';
  if (state.layer==='heritage') return site.kind==='heritage';
  if (view.zoom<1.9) return false;
  return view.zoom>=3.3 || site.kind==='heritage'||(site.kind==='energy' && site.mw>=220);
}
function drawNetwork(s,local) {
  if (state.layer!=='transport' && !(mapOverlay.rail && view.zoom>=1.85)) return;
  context.save();
  context.lineJoin='round';
  context.lineCap='round';
  const detailed=s>2.3 && state.layer==='terrain';
  context.lineWidth=detailed ? .68 : Math.max(.42,1.35/s);
  context.strokeStyle=detailed ? '#202b24ad' : '#292c20ab';
  context.stroke(railPath);
  context.lineWidth=detailed ? .42 : Math.max(.18,.62/s);
  context.strokeStyle=local ? '#e2c395af' : '#ddc594a7';
  context.stroke(railPath);
  if (s>2.3) {
    if (detailed) context.lineCap='butt';
    context.setLineDash(detailed ? [.13,.45] : [.18,.62]);
    context.strokeStyle=detailed ? '#574731ba' : '#523f2c';
    context.stroke(railPath);
  }
  context.restore();
}
function drawAssets(local) {
  const candidates=data.sites.filter(mapSiteVisible).sort((a,b)=>
    Number(b.id===state.site)-Number(a.id===state.site) || (b.mw||0)-(a.mw||0));
  const occupied=[];
  const banners=hits.filter(hit=>hit.box).map(hit=>hit.box);
  function place(x,y) {
    const shifts=[[0,0],[0,-16],[14,10],[-14,10],[18,-11],[-18,-11],[0,22]];
    for (const [dx,dy] of shifts) {
      const px=x+dx,py=y+dy;
      if (px<10||px>view.width-10||py<10||py>view.height-10) continue;
      if (occupied.some(([xx,yy])=>Math.hypot(px-xx,py-yy)<21)) continue;
      if (banners.some(([a,b,c,d])=>px>a-10&&px<c+10&&py>b-9&&py<d+9)) continue;
      occupied.push([px,py]);
      if (dx||dy) {
        context.beginPath();
        context.moveTo(x,y);
        context.lineTo(px,py);
        context.strokeStyle='#eddfb29c';
        context.lineWidth=1;
        context.stroke();
      }
      return [px,py];
    }
    return null;
  }
  if (local && ['terrain','land'].includes(state.layer)) {
    for (const d of mapDistrictPositions(local)) {
      const point=place(...viewPoint(d.xy));
      if (!point) continue;
      const [x,y]=point;
      marker(x,y,d.glyph,d.color,{r:11,active:state.district===d.id});
      hits.push({district:d.id,x,y,r:12});
    }
  }
  for (const site of candidates) {
    const point=place(...viewPoint(site.xy));
    if (!point) continue;
    const [x,y]=point;
    const style=siteStyle[site.kind];
    marker(x,y,style.glyph,style.color,{active:state.site===site.id,r:site.id===state.site?12:9});
    hits.push({site:site.id,x,y,r:10});
  }
}
function drawDensityLabels(cities) {
  const taken=[];
  for (const city of cities) {
    if (!city.official && !city.seat && city.id!==state.city) continue;
    const [x,y]=viewPoint(city.xy);
    if (x<16 || x>view.width-16 || y<30 || y>view.height-25) continue;
    context.font='600 11px system-ui';
    const halfWidth=context.measureText(city.name).width/2+4;
    if (taken.some(([px,py,w])=>Math.abs(py-y)<15 && Math.abs(px-x)<w+halfWidth)) continue;
    taken.push([x,y,halfWidth]);
    label(city.name,x,y-9,'600 11px system-ui','#f3efe1','#263238');
    ellipse(x,y,1.8,1.8,'#f3efe1');
  }
}
function drawCityBanners(cities) {
  const taken=[];
  const s=scale();
  for (const city of cities) {
    const [x,y]=viewPoint(city.xy);
    if (x<-100||x>view.width+100||y<-30||y>view.height+55) continue;
    const active=city.id===state.city, large=active||city.official;
    const size=large?12:11;
    const baseline=y-(s>=1.42 ? (city.official?9:city.seat?5.5:3.8)*s : 7)-10;
    const name=(active||city.official)?city.name.toUpperCase():city.name;
    context.font=(large?'700 ':'600 ')+size+'px Georgia';
    const textWidth=context.measureText(name).width;
    const people=compact.format(city.pop);
    context.font='700 10px system-ui';
    const numberWidth=context.measureText(people).width+12;
    const w=textWidth+numberWidth+17;
    const left=x-w/2;
    const bounds=[left,baseline-9,left+w,baseline+9];
    const overlaps=taken.some(([a,b,c,d])=>bounds[0]<c&&bounds[2]>a&&bounds[1]<d&&bounds[3]>b);
    if (!overlaps || active) {
      taken.push(bounds);
      shapeFill([[left-3,baseline],[left,baseline-8],[left+w,baseline-8],[left+w+3,baseline],[left+w,baseline+8],[left,baseline+8]],
        active?'#e5c480':'#192c22ee',active?'#fff0b0':city.official?'#c4b883':'#889978b0',active?1.3:.8);
      context.fillStyle=active?'#efdba1':'#354b3b';
      context.fillRect(left+4,baseline-6,numberWidth-2,12);
      context.textBaseline='middle';context.textAlign='center';
      context.fillStyle=active?'#263227':'#e2e7c6';
      context.font='700 10px system-ui';
      context.fillText(people,left+3+numberWidth/2,baseline+.3);
      context.fillStyle=active?'#243225':'#f1e3bb';
      context.font=(large?'700 ':'600 ')+size+'px Georgia';
      context.fillText(name,left+numberWidth+6+textWidth/2,baseline+.3);
      hits.push({city:city.id,x,y,r:Math.max(10,s*5.8),box:bounds});
    } else hits.push({city:city.id,x,y,r:Math.max(6,s*4)});
    if (s<1.42) marker(x,y,city.capital?'✧':'·',active?'#ffe3a7':'#e8d397',{r:large?5.2:3.3,active});
  }
}
const minimap=$('minimap');
const miniContext=minimap.getContext('2d');
const miniBounds={};
function drawMinimap() {
  const width=minimap.clientWidth,height=minimap.clientHeight;
  if (!width || !height) return;
  const dpr=window.devicePixelRatio || 1;
  if (minimap.width!==Math.round(width*dpr)||minimap.height!==Math.round(height*dpr)) {
    minimap.width=Math.round(width*dpr);minimap.height=Math.round(height*dpr);
  }
  const ratio=Math.min((width-10)/data.width,(height-9)/data.height);
  const x=(width-data.width*ratio)/2,y=(height-data.height*ratio)/2;
  Object.assign(miniBounds,{x,y,ratio});
  miniContext.setTransform(dpr,0,0,dpr,0,0);
  miniContext.fillStyle='#101d18';miniContext.fillRect(0,0,width,height);
  miniContext.save();miniContext.translate(x,y);miniContext.scale(ratio,ratio);
  miniContext.fillStyle='#718a66';miniContext.fill(country,'evenodd');
  miniContext.strokeStyle='#293e31';
  miniContext.lineWidth=1/ratio;
  for (const r of regions) miniContext.stroke(paths.get(r.id));
  if (state.city) {
    const [px,py]=cityById.get(state.city).xy;
    miniContext.fillStyle='#f2ca82';miniContext.fillRect(px-2/ratio,py-2/ratio,4/ratio,4/ratio);
  }
  const [left,top]=mapPoint(0,0);
  const [right,bottom]=mapPoint(view.width,view.height);
  miniContext.strokeStyle='#eed095';
  miniContext.lineWidth=1.2/ratio;
  miniContext.strokeRect(left,top,right-left,bottom-top);
  miniContext.restore();
}
function drawMapTitle() {
  const city=localCity(),r=regionById(state.region);
  $('map-kicker').textContent=city?'Local survey':r?'Administrative division':'Қазақстан';
  $('map-title').textContent=city?.name || r?.name || 'Kazakhstan';
  $('subtitle').textContent=state.layer==='density'?'Select a hex · WorldPop '+data.worldPop.year:
    city?'110 km survey radius · select a hex or site':
    data.cities.length+' places · '+regions.length+' divisions';
}
