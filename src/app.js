'use strict';
const $ = id => document.getElementById(id);
const data = JSON.parse($('atlas-data').textContent);
for (const site of data.sites) {
  site.originalName=site.name;
  site.name=contentMessage('site.'+site.id+'.name',site.name);
}
const regions = Object.values(data.regions);
const regionDisplayName = region => placeName(region) ?? msg("Kazakhstan");
const cityDisplayName = city => placeName(city);
const hmsg = (source,values) => escape(msg(source,values));
const regionById = id => data.regions[id];
const cityById = new Map(data.cities.map(city => [city.id, city]));
const cityNameCounts = new Map();
for (const city of data.cities) cityNameCounts.set(cityDisplayName(city),(cityNameCounts.get(cityDisplayName(city)) ?? 0)+1);
const repeatedCityName = city => cityNameCounts.get(cityDisplayName(city))>1;
const qualifiedPlaceType = city => msg("{type} · {region}",{type:placeTypeLabel(city),region:regionDisplayName(regionById(city.region))});
const canvas = $('map');
const context = canvas.getContext('2d');
const maxZoom = 9;
const mobile = matchMedia('(max-width:760px)');
// Match Kazakhstan's statistical releases where the browser's Kazakh formatter uses English punctuation.
const numberLocale = locale==='kk' ? 'ru-KZ' : locale;
const fmt = new Intl.NumberFormat(numberLocale);
const compactNumber = new Intl.NumberFormat(numberLocale,{notation:'compact',maximumFractionDigits:1});
const shortNumber = new Intl.NumberFormat(numberLocale,{maximumFractionDigits:1});
const kazakhUnits = [[1e12,'трлн'],[1e9,'млрд'],[1e6,'млн'],[1e3,'мың']];
const compact = {format(value) {
  if (locale!=='kk') return compactNumber.format(value);
  const unit=kazakhUnits.find(([scale])=>Math.abs(value)>=scale);
  return unit ? shortNumber.format(value/unit[0])+'\u00a0'+unit[1] : shortNumber.format(value);
}};
const terrainColors = [[48,98,103],[111,126,82],[163,139,92],[125,111,85],[172,157,128]];
const layerInfo = {
  terrain: [msg("Elevation and terrain"), ''],
  winter: [msg("Winter temperature"), ''],
  population: [msg("Population by division"), msg("1 Oct 2026")],
  economy: [msg("GRP per person"), msg("2025 · tenge")],
  industry: [msg("Industrial value added"), msg("2025 · dominant share")],
  land:[msg("Land cover"),'2021'],
  density:[msg("Population density"),msg("WorldPop 2025")],
  migration:[msg("Net migration"),msg("January–September 2026")],
  labor:[msg("Unemployment rate"),'2025'],
  transport:[msg("Transport connections"),''],
  heritage:[msg("World Heritage"),'']
};
const state = {layer:'terrain', mode:'cities', city:null, region:null, tab:'people', site:null, tile:null, district:null, landmark:null};
const view = {width:0,height:0,fit:1,zoom:1,x:data.width/2,y:data.height/2};
const paths = new Map();
let frame, hits = [], hover = null;
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clamp = (value,min,max) => Math.max(min,Math.min(max,value));
const sign = value => (value>=0 ? '+' : '−') + fmt.format(Math.abs(value));
const money = (millions) => '₸' + compact.format(millions * 1e6);
const shareOf = (part,total) => total ? 100*part/total : 0;
const decimal = new Intl.NumberFormat(numberLocale,{minimumFractionDigits:1,maximumFractionDigits:1});
const ratio = new Intl.NumberFormat(numberLocale,{minimumFractionDigits:2,maximumFractionDigits:2});
const pct = number => decimal.format(number)+'%';
const countryStats = data.national;
const buttons = selector => [...document.querySelectorAll(selector)];

function path(lines,close) {
  const result = new Path2D();
  for (const [first,...rest] of lines) {
    result.moveTo(...first);
    for (const point of rest) result.lineTo(...point);
    if (close) result.closePath();
  }
  return result;
}
const country = path(data.country,true);
const rivers = path(data.rivers,false);
for (const region of regions) paths.set(region.id,path(region.shape,true));

function readLocation() {
  const params = new URLSearchParams(location.hash.slice(1));
  const city = Number(params.get('city'));
  const region = Number(params.get('region'));
  state.layer = Object.hasOwn(layerInfo,params.get('layer')) ? params.get('layer') : 'terrain';
  state.mode = ['overview','regions','cities'].includes(params.get('view')) ? params.get('view') : 'cities';
  state.city = cityById.has(city) ? city : params.size ? null : defaultCity;
  state.region = regionById(region) ? region : null;
  if (state.city) state.mode = 'cities';
  else if (state.region) state.mode = 'regions';
  state.tab=Object.hasOwn(profileTabs,params.get('tab'))?params.get('tab'):'people';
  const tile=Number(params.get('tile'));
  state.tile=params.has('tile') && Number.isInteger(tile) && data.tiles[tile] ? tile : null;
  const site=Number(params.get('site'));
  state.site=sitesById.has(site)?site:null;
  const district=params.get('district');
  state.district=state.city && activity.has(district)?district:null;
  const landmark=Number(params.get('landmark'));
  state.landmark=landmark===state.city && cityLandmarks.has(landmark)?landmark:null;
  if (state.landmark) state.site=state.tile=state.district=null;
  setFit(false);
  if (state.city) {
    [view.x,view.y]=cityFocusPoint(cityById.get(state.city));
    view.zoom=zoomCity();
  }
  const camera = params.get('at')?.split(',').map(Number);
  if (camera?.length===3 && camera.every(Number.isFinite)) {
    [view.x,view.y,view.zoom] = camera;
    view.zoom = clamp(view.zoom,0.8,maxZoom);
    constrainCamera();
  }
}
function updateLocation() {
  const params = new URLSearchParams({view:state.mode,layer:state.layer,tab:state.tab,
    at:[view.x,view.y,view.zoom].map(n=>Number(n.toFixed(2))).join(',')});
  if (state.city) params.set('city',state.city);
  if (state.region) params.set('region',state.region);
  if (state.site) params.set('site',state.site);
  if (state.tile!==null) params.set('tile',state.tile);
  if (state.district) params.set('district',state.district);
  if (state.landmark) params.set('landmark',state.landmark);
  history.replaceState(null,'','#'+params);
}
function setFit(refresh=true) {
  view.x = data.width/2;
  view.y = data.height/2 + (mobile.matches ? 92 : -28);
  view.zoom = 1;
  if (refresh) {closeInspector(false); updateLocation(); requestDraw();}
}
function constrainCamera() {
  view.x = clamp(view.x,-90,data.width+90);
  view.y = clamp(view.y,-90,data.height+90);
}
function scale() { return view.fit * view.zoom; }
function viewPoint([x,y]) {
  return [(x-view.x)*scale()+view.width/2,(y-view.y)*scale()+view.height/2];
}
function mapPoint(x,y) {
  return [(x-view.width/2)/scale()+view.x,(y-view.height/2)/scale()+view.y];
}
function zoomAt(factor,x=view.width/2,y=view.height/2) {
  const [mx,my] = mapPoint(x,y);
  view.zoom = clamp(view.zoom*factor,0.8,maxZoom);
  view.x = mx - (x-view.width/2)/scale();
  view.y = my - (y-view.height/2)/scale();
  constrainCamera();
  updateLocation();
  requestDraw();
}
function resize() {
  const {width,height} = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(width*dpr);
  canvas.height = Math.round(height*dpr);
  view.width = width;
  view.height = height;
  view.fit = Math.min((width-(mobile.matches ? 36 : 105))/data.width,(height-(mobile.matches ? 145 : 205))/data.height);
  requestDraw();
}
function requestDraw() {
  if (!frame) frame = requestAnimationFrame(draw);
}
function mix(a,b,t) { return a.map((v,i)=>v+(b[i]-v)*t); }

const hexOffsets = Array.from({length:6},(_,i)=>{
  const angle = Math.PI*(i/3+1/6);
  return [Math.cos(angle)*(data.radius+.13),Math.sin(angle)*(data.radius+.13)];
});
function traceHex(target,x,y) {
  hexOffsets.forEach(([dx,dy],i)=>i ? target.lineTo(x+dx,y+dy) : target.moveTo(x+dx,y+dy));
  target.closePath();
}
function drawHex(x,y) {
  context.beginPath();
  traceHex(context,x,y);
}
function draw() {
  frame = null;
  if (view.fit<=0) return;
  const dpr = window.devicePixelRatio || 1;
  const s = scale();
  context.setTransform(dpr,0,0,dpr,0,0);
  const winterView=state.layer==='winter';
  context.fillStyle = winterView ? '#263c4e' : '#213a37';
  context.fillRect(0,0,view.width,view.height);
  const local=localCity();
  const surveyBorder=local && (state.layer==='terrain' || winterView) ? new Path2D() : null;
  const cities=shownCityMarkers();
  const [left,top] = mapPoint(-20,-20);
  const [right,bottom] = mapPoint(view.width+12,view.height+12);
  context.save();
  context.translate(view.width/2,view.height/2);
  context.scale(s,s);
  context.translate(-view.x,-view.y);
  const hasRelief=drawReliefSurface(winterView);
  const [reliefX,reliefY,reliefWidth,reliefHeight]=reliefAsset.bounds;
  const visible=[];
  for (const [index,tile] of data.tiles.entries()) {
    const [x,y]=tile;
    if (x>=left && x<=right && y>=top && y<=bottom) visible.push([index,tile]);
  }
  if (winterView) drawWinterTint(visible,hasRelief);
  for (const [i,tile] of visible) {
    const [x,y,terrain,,inside]=tile;
    const inSurvey=nearby(tile,local);
    const textured=hasRelief && x>=reliefX && x<=reliefX+reliefWidth && y>=reliefY && y<=reliefY+reliefHeight;
    if (winterView) {
      if (inside || s>=1.20) {
        drawHex(x,y);
        context.lineWidth=(s>=1.45 ? .90 : .64)/s;
        context.strokeStyle=inside?'#20384d81':'#20384d43';
        context.stroke();
      }
      if (textured && s>=1.45) shadeHexEdge(x,y,s,terrain===0 || tile[7]===80,true);
      if (textured) drawWinterArtwork(tile,s);
    } else {
      drawHex(x,y);
      if (!textured) {
        context.fillStyle = state.layer==='density' ? densityColor(i) : terrainColor(tile,local);
        context.fill();
      } else if (local) {
        context.fillStyle=inSurvey ? '#e7dea024' : '#14293f35';
        context.fill();
      }
      context.lineWidth = textured ? (s<1.2 ? .68 : .82)/s : view.zoom>2.45 ? .32 : .52;
      context.strokeStyle = textured ? (s<1.2 ? '#263d333c' : '#263d334f') : inside ? '#243b2a76' : '#12251965';
      context.stroke();
      if (textured && s>=1.45) shadeHexEdge(x,y,s,terrain===0);
      tileArtwork(tile,s);
    }
    if (state.layer!=='density' && inSurvey) {
      drawHex(x,y);
      context.lineWidth=.26;
      context.strokeStyle=winterView ? '#d9f5ff65' : surveyBorder ? '#e4edb57d' : '#f4de976d';
      context.stroke();
      for (let j=0;j<6;j++) {
        const [dx,dy]=hexOffsets[j], [ex,ey]=hexOffsets[(j+1)%6];
        const neighbor=data.tiles[nearestTile(x+dx+ex,y+dy+ey)];
        if (!neighbor || !nearby(neighbor,local)) {
          if (surveyBorder) {
            surveyBorder.moveTo(x+dx,y+dy);
            surveyBorder.lineTo(x+ex,y+ey);
            continue;
          }
          context.beginPath();
          context.moveTo(x+dx,y+dy);
          context.lineTo(x+ex,y+ey);
          context.strokeStyle='#e6d697ba';
          context.lineWidth=.40;
          context.stroke();
        }
      }
    }
    if (state.tile===i) {
      drawHex(x,y);
      if (state.layer==='density' || winterView) {
        context.lineWidth=4.5/s;
        context.strokeStyle='#182b31';
        context.stroke();
      }
      context.lineWidth=2/s;
      context.strokeStyle=state.layer==='density'?'#fff5d2':'#f8dc94';
      context.stroke();
    }
  }
  if (surveyBorder) drawSurveyBorder(surveyBorder,s,winterView);
  drawNetwork(s,local);
  context.lineWidth = 1.35/s;
  context.strokeStyle = winterView ? '#295978b8' : view.zoom>=2.5 ? '#5cb4c5c2' : '#66a5a183';
  context.stroke(rivers);
  context.lineWidth = .8/s;
  context.strokeStyle = winterView ? '#2e435953' : state.layer==='terrain' ? '#ddd1a557' : '#171e187c';
  for (const region of regions) context.stroke(paths.get(region.id));
  if (state.region) {
    const selected = paths.get(state.region);
    context.fillStyle = '#f4d58c30';
    context.fill(selected,'evenodd');
    context.strokeStyle = '#f4d58c';
    context.lineWidth = 2/s;
    context.stroke(selected);
  }
  context.lineWidth = 3.6/s;
  context.strokeStyle = winterView ? '#253b50de' : '#203135d9';
  context.stroke(country);
  context.lineWidth = 1.65/s;
  context.strokeStyle = winterView ? '#d5e6edda' : '#dfc196c2';
  context.stroke(country);
  const outlying=visibleOutlyingLandmark(s);
  const markers=cityMapMarkers(cities,s,outlying);
  for (const {city,xy,landmark,pointOnly} of [...markers].reverse()) {
    const [x,y]=xy;
    if (pointOnly || state.layer==='density' || x<left || x>right || y<top || y>bottom) continue;
    if (landmark) drawLandmark(landmark,xy,s,true);
    else drawSettlement(city,xy,s);
  }
  if (outlying) drawLandmark(outlying,outlying.xy,s);
  context.restore();
  drawLabels(cities,local,markers,outlying);
  drawMinimap();
  drawMapTitle();
  const scaleBar = document.querySelector('.scale');
  const approx = data.metersPerUnit / s * Math.min(88,scaleBar.clientWidth) / 1000;
  const km = [10,20,25,50,100,200,250,500,1000,2000].filter(x=>x<=approx).at(-1) || 5;
  scaleBar.firstElementChild.textContent = msg("{distance} km",{distance:fmt.format(km)});
  scaleBar.lastElementChild.style.width = (km*1000/data.metersPerUnit*s)+'px';
  $('zoom-in').disabled = view.zoom>=maxZoom;
  $('zoom-out').disabled = view.zoom<=.8;
}
function label(text,x,y,style,fill,shadow) {
  context.font = style;
  context.textBaseline = 'middle';
  context.textAlign = 'center';
  context.lineJoin = 'round';
  context.lineWidth = 3.5;
  context.strokeStyle = shadow;
  context.strokeText(text,x,y);
  context.fillStyle = fill;
  context.fillText(text,x,y);
}
function drawLabels(cities,local,markers,outlying) {
  hits = [];
  if (view.zoom<2.75 && (!mobile.matches || view.zoom>=1.6)) {
    for (const [name,xy] of data.labels) {
      const [x,y] = viewPoint(xy);
      if (x<58 || x>view.width-58 || y<18 || y>view.height-18) continue;
      const water = name.includes('Sea') || name.includes('Lake');
      label(contentMessage('geography.'+name,name),x,y,water ? 'italic 13px Georgia' : '10px monospace',water?'#abd1c6':'#a6b895','#263b31');
    }
  }
  if (view.zoom<2.45 && (state.layer!=='terrain' || state.mode==='regions')) {
    for (const r of regions) {
      if (r.kind==='city' || (mobile.matches && view.zoom<1.45)) continue;
      const [x,y] = viewPoint(r.xy);
      label(regionDisplayName(r).replace(/ Region$/,''),x,y,'600 11px system-ui','#f0e8c2','#3a4739');
    }
  }
  if (state.layer==='density') drawDensityLabels(cities);
  else {
    if (outlying) hits.push({landmark:outlying.cityId,box:landmarkBounds(outlying.xy,scale(),false)});
    for (const {city,landmark,box} of markers) {
      if (!box) continue;
      const hit=landmark && city.id===state.city ? {landmark:landmark.cityId} : {city:city.id};
      hits.push({...hit,box});
    }
    drawCityBanners(markers);
    drawAssets(local);
  }
}
function keyTarget(x,y,allowTile=true) {
  const banner=hits.find(({box})=>box && x>box[0] && x<box[2] && y>box[1] && y<box[3]);
  const [mx,my] = mapPoint(x,y);
  if (state.layer==='density' && allowTile) {
    const tileId=nearestTile(mx,my);
    if (tileId!==undefined) return {tile:tileId};
  }
  const hit = banner || [...hits].reverse().find(({x:mx,y:my,r})=>Math.hypot(x-mx,y-my)<=r);
  if (hit) {
    if (hit.landmark) return {landmark:hit.landmark};
    if (hit.city) return {city:hit.city};
    if (hit.site) return {site:hit.site};
    return {district:hit.district};
  }
  if (allowTile && (state.layer==='winter' || (view.zoom>=2.5 && state.mode!=='regions'))) {
    const tileId=nearestTile(mx,my);
    if (tileId!==undefined) return {tile:tileId};
  }
  context.save();
  context.setTransform(1,0,0,1,0,0);
  const match = regions.find(r=>context.isPointInPath(paths.get(r.id),mx,my,'evenodd'));
  context.restore();
  if (match) return {region:match.id};
  return null;
}
function hideTooltip() {
  $('tooltip').hidden = true;
  canvas.classList.remove('over');
  hover = null;
  requestDraw();
}
function updateTooltip(x,y) {
  hover = keyTarget(x,y);
  if (!hover) {hideTooltip(); return;}
  const t = $('tooltip');
  if (hover.city) t.textContent=cityDisplayName(cityById.get(hover.city));
  else if (hover.landmark) t.textContent=cityLandmarks.get(hover.landmark).name;
  else if (hover.site) {
    const site=sitesById.get(hover.site);
    t.textContent=site.name+' · '+siteLabel(site);
  } else if (hover.district) t.textContent=msg("{activity} district · schematic",{activity:activity.get(hover.district).name});
  else if (hover.tile!==undefined) {
    const tile=data.tiles[hover.tile];
    const sample=data.worldPop.hexes[hover.tile];
    if (state.layer==='density') t.textContent=sample?describeDensity(sample):msg("No WorldPop data");
    else if (state.layer==='winter') {
      const value=winterTemperature(hover.tile);
      t.textContent=value===null?msg("No winter temperature data"):msg("{temperature} · Dec–Feb mean",{temperature:celsius(value)});
    }
    else t.textContent=coverLabel[tile[7]]+(tile[2]===0?'':' · '+msg("{elevation} m",{elevation:fmt.format(tile[6])}));
  } else {
    const r=regionById(hover.region);
    const values={population:fmt.format(r.pop),economy:msg("{amount} per person",{amount:'₸'+compact.format(r.capita)}),
                  migration:sign(r.migration),labor:pct(unemployment(r)),industry:r.mining>r.manufacturing?msg("Mining"):msg("Manufacturing")};
    t.textContent=regionDisplayName(r)+(values[state.layer]?' · '+values[state.layer]:'');
  }
  t.hidden = false;
  t.style.left = Math.max(5,Math.min(x+13,view.width-t.offsetWidth-5))+'px';
  t.style.top = Math.max(6,y-t.offsetHeight-12)+'px';
  canvas.classList.add('over');
  requestDraw();
}
function select(type,id,focus=false) {
  const item = type === 'city' ? cityById.get(id) : regionById(id);
  if (!item) return;
  state.mode = type==='city' ? 'cities' : 'regions';
  state.city = type==='city' ? id : null;
  state.region = type==='region' ? id : null;
  if (focus || type==='city') {
    [view.x,view.y] = type==='city' ? cityFocusPoint(item) : item.xy;
    view.zoom = type==='city' ? zoomCity() : 1.9;
  }
  state.tab='people';
  closeInspector(false);
  hideTooltip();
  $('announcement').textContent = msg("{place} selected",{place:type==='city'?cityDisplayName(item):regionDisplayName(item)});
  updateUI();
  atlasEvent('atlas_place_opened', {place_type:type});
  if (focus && mobile.matches) {
    if (type==='city') window.scrollTo(0,0);
    else document.querySelector('.panel').scrollIntoView({block:'start'});
  }
}

function metric(label,value) {
  return '<div class="metric"><span>'+label+'</span><strong>'+value+'</strong></div>';
}
function primary(label,value,note) {
  return '<div class="primary"><span class="primary-label">'+label+'</span><strong>'+value+'</strong><small>'+note+'</small></div>';
}
function delta(value) {
  return '<span class="'+(value>=0?'positive':'negative')+'">'+sign(value)+'</span>';
}
function industryChart(region) {
  const industries = [[region.mining,msg("Mining")],[region.manufacturing,msg("Manufacturing")],
    [Math.max(0,region.industrial-region.mining-region.manufacturing),msg("Utilities & other industry")]].sort((a,b)=>b[0]-a[0]);
  const drivers = [['oil',msg("Oil & gas extraction")],['ores',msg("Metal ore mining")],['coal',msg("Coal mining")],
    ['food',msg("Food manufacturing")],['refining',msg("Petroleum refining")],['chemicals',msg("Chemical manufacturing")],['metallurgy',msg("Metallurgy")]];
  const top = drivers.sort((a,b)=>(region[b[0]]||0)-(region[a[0]]||0))[0];
  const bars = industries.map(([v,title])=>{
    const share = shareOf(v,region.industrial);
    return '<div><div class="bar-label"><span>'+title+'</span><em>'+pct(share)+'</em></div><div class="track"><i style="width:'+share+'%"></i></div></div>';
  }).join('');
  return '<section class="section"><h3>'+hmsg("Industry mix")+'</h3><p class="chart-note">'+hmsg("Share of industrial value added · 2025")+'</p><div class="bars">'+bars+'</div>'
    + (region[top[0]] ? '<div class="metric-grid">'+metric(hmsg("Largest of 7 tracked subsectors"),escape(top[1]))+metric(hmsg("Value added"),money(region[top[0]]))+'</div>' : '')+'</section>';
}
function regionalEconomy(region,title=msg("Economy")) {
  return '<section class="section"><h3>'+escape(title)+'</h3><p class="chart-note">'+hmsg("2025 · current tenge")+'</p><div class="metric-grid">'
    +metric(hmsg("Regional product"),money(region.grp))+metric(hmsg("Per person"),'₸'+compact.format(region.capita))
    +metric(hmsg("Real growth"),delta(region.realGrowth)+'%')+'</div></section>'+industryChart(region);
}
function list(places,type) {
  return '<ul class="place-list">'+places.map(p=>{
    const qualifier=type==='city' && repeatedCityName(p) ? '<small class="place-qualifier">'+escape(qualifiedPlaceType(p))+'</small>' : '';
    return '<li><button data-place="'+type+'" data-id="'+p.id+'"><span>'+escape(type==='city'?cityDisplayName(p):regionDisplayName(p))+qualifier+'</span><small>'
      +(p.pop ? compact.format(p.pop) : '—')+'</small></button></li>';
  }).join('')+'</ul>';
}
function renderDetails() {
  const detail=$('detail');
  const city=cityById.get(state.city);
  const region=regionById(state.region || city?.region);
  if (state.mode==='cities' && !city) {
    detail.innerHTML='<div class="gov-list"><h2>'+hmsg("Cities & towns")+'</h2><p class="sub">'+hmsg("Ranked by reported population")+'</p>'+list(data.cities,'city')+'</div>';
  } else if (state.mode==='regions' && !region) {
    detail.innerHTML='<div class="gov-list"><h2>'+hmsg("Regions")+'</h2><p class="sub">'+hmsg("17 regions and 3 cities of republican significance")+'</p>'+list([...regions].sort((a,b)=>b.pop-a.pop),'region')+'</div>';
  } else detail.innerHTML=atlasProfile(region||countryStats,city);
  document.querySelector('.panel').scrollTop=0;
}
function updateUI(save=true) {
  buttons('[data-layer]').forEach(btn=>btn.setAttribute('aria-pressed',btn.dataset.layer===state.layer));
  buttons('[data-mode]').forEach(btn=>btn.setAttribute('aria-pressed',btn.dataset.mode===state.mode));
  renderMapLegend();
  renderDetails();
  renderInspector();
  if (save) updateLocation();
  requestDraw();
}
const search = $('search');
const results = $('results');
const normalized = value => value.normalize('NFKD').toLowerCase().replace(/[\u0300-\u036f]/g,'').trim();
const places = [
  ...data.cities.map(item=>{
    const names=new Set([item.name,cityDisplayName(item),...item.aliases]);
    const {name,kk,ru}=regionById(item.region);
    return {item,type:'city',terms:[...names,...[...names].flatMap(alias=>[name,kk,ru].map(region=>alias+' '+region))]};
  }),
  ...regions.map(item=>({item,type:'region',terms:[item.name,item.kk,item.ru]})),
  ...data.sites.map(item=>({item,type:'site',terms:[item.originalName,item.name,item.tag]}))
].map(entry=>({...entry,terms:entry.terms.map(normalized)}));
let matches = [], activeIndex = -1;
function closeSearch() {
  results.hidden = true;
  search.setAttribute('aria-expanded','false');
  search.removeAttribute('aria-activedescendant');
}
function setActive(index) {
  activeIndex = index;
  const children = [...results.querySelectorAll('[role=option]')];
  children.forEach((child,i)=>child.setAttribute('aria-selected',i===index));
  if (children[index]) {
    search.setAttribute('aria-activedescendant',children[index].id);
    children[index].scrollIntoView({block:'nearest'});
  } else search.removeAttribute('aria-activedescendant');
}
function renderSearch() {
  const term = normalized(search.value);
  if (!term) {closeSearch(); return;}
  matches = places.map(entry=>{
    const score = Math.min(...entry.terms.map(name=>name===term?0:name.startsWith(term)?1:name.includes(term)?2:3));
    return {...entry,score};
  }).filter(entry=>entry.score<3).sort((a,b)=>a.score-b.score || (b.item.pop||0)-(a.item.pop||0)).slice(0,10);
  results.innerHTML = matches.length ? matches.map(({item,type},i)=>{
    const kind=type==='city' ? (repeatedCityName(item) ? qualifiedPlaceType(item) : placeTypeLabel(item)) :
      type==='site' ? msg("Site") : item.kind==='city' ? msg("City division") : msg("Region");
    const name=type==='city'?cityDisplayName(item):type==='region'?regionDisplayName(item):item.name;
    return '<button type="button" tabindex="-1" role="option" id="result-'+i+'" data-match="'+i+'" aria-selected="false"><span>'
      +escape(name)+'</span><small>'+escape(kind)+'</small></button>';
  }).join('') :
    '<p role="status">'+hmsg("No places match your search.")+'</p>';
  results.hidden = false;
  search.setAttribute('aria-expanded','true');
  setActive(-1);
}
function chooseResult(index) {
  const match = matches[index];
  if (!match) return;
  if (match.type==='site') inspectSite(match.item.id,true);
  else select(match.type,match.item.id,true);
  search.value = '';
  closeSearch();
  search.blur();
}
search.addEventListener('input',renderSearch);
search.addEventListener('focus',renderSearch);
search.addEventListener('keydown',event=>{
  if (event.key==='Escape') {closeSearch(); search.blur(); return;}
  if (results.hidden) return;
  if (event.key==='ArrowDown' || event.key==='ArrowUp') {
    event.preventDefault();
    if (!matches.length) return;
    const next = activeIndex + (event.key==='ArrowDown'?1:-1);
    setActive(activeIndex===-1 && event.key==='ArrowUp' ? matches.length-1 : (next+matches.length)%matches.length);
  }
  if (event.key==='Enter') {event.preventDefault(); chooseResult(Math.max(0,activeIndex));}
});
results.addEventListener('pointerdown',event=>event.preventDefault());
results.addEventListener('click',event=>{
  const button = event.target.closest('[data-match]');
  if (button) chooseResult(Number(button.dataset.match));
});
document.addEventListener('pointerdown',event=>{
  if (!event.target.closest('.search')) closeSearch();
});
document.addEventListener('keydown',event=>{
  if (event.key==='/' && !event.altKey && !event.metaKey && !event.ctrlKey && event.target!==search && !$('credits').open) {
    event.preventDefault();
    search.focus();
  }
});

const pointers = new Map();
let dragStart, dragged;
function eventPosition(event) {
  const bounds = canvas.getBoundingClientRect();
  return {x:event.clientX-bounds.left,y:event.clientY-bounds.top};
}
function pinchFrame(points) {
  const [a,b] = points;
  return {x:(a.x+b.x)/2,y:(a.y+b.y)/2,dist:Math.hypot(a.x-b.x,a.y-b.y)};
}
canvas.addEventListener('pointerdown',event=>{
  if (event.button!==0) return;
  const point = eventPosition(event);
  canvas.setPointerCapture(event.pointerId);
  pointers.set(event.pointerId,point);
  if (pointers.size===1) {dragStart=point; dragged=false;}
  else dragged = true;
  hideTooltip();
});
canvas.addEventListener('pointermove',event=>{
  const point = eventPosition(event);
  if (!pointers.has(event.pointerId)) {
    if (event.pointerType==='mouse') updateTooltip(point.x,point.y);
    return;
  }
  const before = pointers.get(event.pointerId);
  const previousPositions = [...pointers.values()];
  pointers.set(event.pointerId,point);
  if (pointers.size===2) {
    const old = pinchFrame(previousPositions), current = pinchFrame([...pointers.values()]);
    if (old.dist>0) zoomAt(current.dist/old.dist,old.x,old.y);
    view.x -= (current.x-old.x)/scale();
    view.y -= (current.y-old.y)/scale();
  } else if (pointers.size===1) {
    if (!dragged && Math.hypot(point.x-dragStart.x,point.y-dragStart.y)<4) return;
    view.x -= (point.x-before.x)/scale();
    view.y -= (point.y-before.y)/scale();
  } else return;
  dragged = true;
  canvas.classList.add('dragging');
  constrainCamera();
  requestDraw();
});
function finishPointer(event) {
  if (!pointers.delete(event.pointerId)) return;
  if (pointers.size) return;
  canvas.classList.remove('dragging');
  if (dragged) updateLocation();
}
canvas.addEventListener('pointerup',finishPointer);
canvas.addEventListener('pointercancel',finishPointer);
canvas.addEventListener('lostpointercapture',finishPointer);
canvas.addEventListener('click',event=>{
  if (dragged) return;
  // Wait for the click before showing controls below a touch point.
  const {x,y}=eventPosition(event);
  const item=keyTarget(x,y);
  if (item?.landmark) inspectLandmark(item.landmark,false);
  else if (item?.city) select('city',item.city);
  else if (item?.site) inspectSite(item.site,false);
  else if (item?.district) inspectDistrict(item.district);
  else if (item?.tile!==undefined) inspectTile(item.tile);
  else if (item?.region) select('region',item.region);
  updateLocation();
});
canvas.addEventListener('pointerleave',hideTooltip);
canvas.addEventListener('wheel',event=>{
  event.preventDefault();
  const {x,y} = eventPosition(event);
  const factor = event.deltaMode===1 ? 16 : event.deltaMode===2 ? view.height : 1;
  zoomAt(Math.exp(-clamp(event.deltaY*factor,-135,135)*.003),x,y);
},{passive:false});
canvas.addEventListener('keydown',event=>{
  const moves = {ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
  if (Object.hasOwn(moves,event.key)) {
    const [x,y]=moves[event.key];
    view.x += x*60/scale();
    view.y += y*60/scale();
    constrainCamera();
    updateLocation();
    requestDraw();
  } else if (['+','='].includes(event.key)) zoomAt(1.35);
  else if (['-','_'].includes(event.key)) zoomAt(1/1.35);
  else if (event.key==='Home') setFit();
  else if (event.key==='Enter' && (view.zoom>=2.5 || ['density','winter'].includes(state.layer))) {
    const id=nearestTile(view.x,view.y);
    if (id!==undefined) inspectTile(id);
  } else if (event.key==='Escape') closeInspector();
  else return;
  event.preventDefault();
});
$('zoom-in').onclick = ()=>zoomAt(1.38);
$('zoom-out').onclick = ()=>zoomAt(1/1.38);
$('reset').onclick = ()=>setFit();
function selectLayer(layer) {
  const previous=state.layer;
  state.layer=layer;
  if (state.landmark && !['terrain','winter'].includes(layer)) closeInspector(false);
  buttons('[data-layer]').forEach(btn=>btn.setAttribute('aria-pressed',btn.dataset.layer===state.layer));
  renderMapLegend();
  if (previous==='winter' || layer==='winter') {
    renderDetails();
    renderInspector();
  }
  drawMapTitle();
  updateLocation();
  requestDraw();
  if (previous!==layer) atlasEvent('map_layer_changed', {map_layer:layer});
}
buttons('[data-layer]').forEach(button=>button.addEventListener('click',()=>{
  const layer=button.dataset.layer;
  selectLayer(layer==='winter' && state.layer==='winter'?'terrain':layer);
}));
buttons('[data-mode]').forEach(button=>button.addEventListener('click',()=>{
  state.mode = button.dataset.mode;
  state.city = state.region = null;
  state.tab='people';
  closeInspector(false);
  setFit(false);
  updateUI();
}));
$('detail').addEventListener('click',event=>{
  const place = event.target.closest('[data-place]');
  if (place) select(place.dataset.place,Number(place.dataset.id),true);
  const tab=event.target.closest('[data-tab]');
  if (tab) selectProfileTab(tab.dataset.tab,true);
  const site=event.target.closest('[data-site]');
  if (site) inspectSite(Number(site.dataset.site),true);
  const district=event.target.closest('[data-district]');
  if (district) inspectDistrict(district.dataset.district);
  const landmark=event.target.closest('[data-landmark]');
  if (landmark) inspectLandmark(Number(landmark.dataset.landmark),true);
  if (event.target.closest('[data-credits]')) $('credits').showModal();
});
$('sources').onclick = ()=>$('credits').showModal();
$('close-sources').onclick = ()=>$('credits').close();
let shareTimer;
$('share').onclick = async ()=>{
  updateLocation();
  const hash = location.hash;
  const text = location.protocol==='file:' ? (locale==='en' ? hash : '?lang='+locale+hash) : location.href;
  try {
    await navigator.clipboard.writeText(text);
    $('share').textContent = msg("Copied");
    $('announcement').textContent = location.protocol==='file:' ? msg("View fragment copied. Append it to your copy of the atlas.") : msg("View link copied.");
    clearTimeout(shareTimer);
    shareTimer = setTimeout(()=>$('share').textContent=msg("Copy link"),1800);
    atlasEvent('share_link_copied');
  } catch {
    window.prompt(msg("Copy this atlas view"),text);
  }
};
if (location.protocol==='file:') $('share').title = msg("Copy the view fragment to append to a local copy of the atlas");
