const defaultCity = 1526384;
const profileTabs = {people:msg("People"),districts:msg("Districts"),economy:msg("Economy"),sites:msg("Sites"),compare:msg("Compare")};
function zoomCity() {
  const previous=mobile.matches ? 8 : 6.35;
  if (view.fit<=0 || !['terrain','winter'].includes(state.layer)) return previous;
  const radius=clamp(view.width*.073,23,66);
  return clamp(radius/(view.fit*data.radius),previous,maxZoom);
}
const placeTypeLabel = city => city.placeType==='village'?msg("Village"):city.placeType==='settlement'?msg("Settlement"):msg("City");
const profileScope = city => city.capital?msg("National capital"):city.official?msg("City of republican significance"):
  city.id===1521368?msg("City with special status"):city.seat?msg("Regional centre"):placeTypeLabel(city);
const populationSource = city => city.popDate==='2026-10-01' ? msg("1 Oct 2026") :
  city.popDate==='2025-01-01' ? msg("1 Jan 2025") : msg("GeoNames estimate");
const categoryRanks = [['pop',msg("People")],['grp',msg("Output")],['capita',msg("Per person")],['realGrowth',msg("Growth")]];
function populationGlyphs(percent) {
  return '<div class="dots" aria-label="'+hmsg("{percent} urban",{percent:pct(percent)})+'">'+Array.from({length:20},(_,i)=>
    '<span aria-hidden="true" '+(i<Math.round(percent/5)?'class="filled"':'')+'>●</span>').join('')+'</div>';
}
function timeline(values,labels,heading) {
  const x = i=>20 + i*254/(values.length-1);
  const min=Math.min(...values), max=Math.max(...values);
  const y = v=>49-(v-min)/(max-min||1)*33;
  const points=values.map((v,i)=>[x(i),y(v)]);
  const coords=points.map(([sx,sy])=>sx+','+sy).join(' ');
  const change=(values.at(-1)-values[0])/values[0]*100;
  return '<div class="spark-box"><div class="bar-label"><span>'+heading+'</span><span class="'+(change>=0?'positive':'negative')+'">'+sign(Number(change.toFixed(1)))+'%</span></div>'
    +'<svg viewBox="0 0 294 73" role="img" aria-label="'+values.map((v,i)=>labels[i]+' '+fmt.format(v)).join(', ')+'"><path d="M20 49H274" stroke="var(--line)"/><polyline points="'+coords+'" fill="none" stroke="var(--chart)" stroke-width="1.7"/>'
    +points.map(([sx,sy],i)=>'<circle cx="'+sx+'" cy="'+sy+'" r="2.4" fill="var(--chart)"/><text x="'+sx+'" y="66" text-anchor="middle" font-size="9.5" fill="var(--muted)">'+labels[i]+'</text><text x="'+sx+'" y="'+(sy-6)+'" text-anchor="middle" font-size="9" fill="var(--text)">'+compact.format(values[i])+'</text>').join('')+'</svg></div>';
}
function peopleProfile(region) {
  const share=shareOf(region.urban,region.pop);
  const division=escape(regionDisplayName(region));
  return '<section class="section"><h3>'+hmsg("Population & migration")+'</h3><p class="chart-note">'+division+' · '+hmsg("January–September 2026")+'</p>'
    +timeline([region.startPop,region.pop],[hmsg("Jan 2026"),hmsg("Oct 2026")],hmsg("Population"))
    +'<div class="metric-grid">'+metric(hmsg("Net migration"),delta(region.migration))+metric(hmsg("Natural increase"),delta(region.natural))
    +metric(hmsg("Urban population"),fmt.format(region.urban))+metric(hmsg("Rural population"),fmt.format(region.pop-region.urban))+'</div></section>'
    +'<section class="section"><h3>'+hmsg("Urban share · {percent}",{percent:pct(share)})+'</h3>'+populationGlyphs(share)
    +'<p class="chart-note">'+hmsg("Each dot represents roughly 5% of residents.")+'</p></section>'
    +'<section class="section"><h3>'+hmsg("Labour market")+'</h3><p class="chart-note">'+hmsg("2025 · Labour Force Survey")+'</p>'
    +'<div class="metric-grid">'+metric(hmsg("Employed residents"),fmt.format(region.labor.employed.at(-1)))
    +metric(hmsg("Unemployment rate"),pct(unemployment(region)))+metric(hmsg("Labour force"),fmt.format(region.labor.force.at(-1)))
    +metric(hmsg("National unemployment"),pct(unemployment(countryStats)))+'</div>'
    +timeline(region.labor.employed,['2022','2023','2024','2025'],hmsg("Employed residents"))+'</section>';
}
function districtProfile(region,isCity) {
  const top=specializations(region);
  const cards=top.map(a=>'<button '+(isCity?'data-district="'+a.id+'"':'disabled')+' aria-pressed="'+(state.district===a.id)+'" style="--district:'+a.color+'">'
    +'<span class="district-icon" aria-hidden="true">'+a.glyph+'</span><span><strong>'+escape(a.name)+'</strong><small>'+hmsg("{amount} · {percent} of output",{amount:money(a.value),percent:pct(a.share)})+'</small></span>'
    +'<b>×'+ratio.format(a.lq)+'</b></button>').join('');
  const ranked=districts(region).sort((a,b)=>b.lq-a.lq);
  return '<section class="section"><h3>'+hmsg("Economic districts")+'</h3><p class="chart-note">'+escape(regionDisplayName(region))+' · 2025</p>'
    +(top.length ? '<div class="district-list">'+cards+'</div>' : '<p class="dataset-note">'+hmsg("This division has no district that meets both cutoffs.")+'</p>')
    +'<p class="dataset-note">'+hmsg("A district represents at least 2% of the division’s output and at least 1.15 times the activity’s national share. Map positions are schematic.")+'</p></section>'
    +'<section class="section"><h3>'+hmsg("Specialization by activity")+'</h3><table class="comparison"><thead><tr><th scope="col">'+hmsg("Activity")+'</th><th scope="col">'+hmsg("Local share")+'</th><th scope="col">'+hmsg("Vs. KZ")+'</th></tr></thead><tbody>'
    +ranked.map(a=>'<tr><th scope="row">'+escape(a.name)+'</th><td>'+pct(a.share)+'</td><td>×'+ratio.format(a.lq)+'</td></tr>').join('')
    +'</tbody></table></section>';
}
function outputStructure(region) {
  const industries=districts(region).sort((a,b)=>b.share-a.share);
  return '<section class="section"><h3>'+hmsg("Output by activity")+'</h3><p class="chart-note">'+hmsg("Share of 2025 output · markers show national shares")+'</p><div class="bars bns-bars">'
    +industries.map(a=>'<div><div class="bar-label"><span>'+escape(a.name)+'</span><em>'+money(a.value)+' · '+pct(a.share)+'</em></div>'
      +'<div class="track"><i style="width:'+a.share+'%"></i><span class="baseline" style="left:'+a.national+'%" title="'+hmsg("Kazakhstan {percent}",{percent:pct(a.national)})+'"></span></div></div>').join('')
    +'</div></section>';
}
function getSites(region,city) {
  return data.sites.map(s=>({...s,dist:city?Math.hypot(s.xy[0]-city.xy[0],s.xy[1]-city.xy[1])*data.metersPerUnit/1000:0}))
    .filter(s=>city?s.dist<=160:region.id?s.region===region.id:true)
    .sort((a,b)=>city?a.dist-b.dist:a.kind.localeCompare(b.kind)||a.name.localeCompare(b.name));
}
function siteLabel(site) {
  return site.mw?msg("{power} MW",{power:fmt.format(site.mw)}):contentMessage('site.tag.'+site.tag,site.tag);
}
function sitesProfile(region,city) {
  const points=getSites(region,city);
  const count=fmt.format(points.length);
  const heading=city ? (points.length===1 ? msg("{count} nearby mapped site",{count}) : msg("{count} nearby mapped sites",{count}))
    : (points.length===1 ? msg("{count} mapped site",{count}) : msg("{count} mapped sites",{count}));
  return '<section class="section"><h3>'+escape(heading)+'</h3>'
    +'<p class="chart-note">'+(city?hmsg("Within 160 km of {place}",{place:cityDisplayName(city)}):escape(regionDisplayName(region)))+' · '+hmsg("Select a site to locate it")+'</p>'
    +(points.length?'<ul class="place-list site-list">'+points.map(p=>
      '<li><button data-site="'+p.id+'"><span><i class="site-glyph" aria-hidden="true">'+siteStyle[p.kind].glyph+'</i>'+escape(p.name)+'</span>'
      +'<small>'+escape(siteLabel(p))+(city?' · '+hmsg("{distance} km",{distance:fmt.format(Math.round(p.dist))}):'')+'</small></button></li>').join('')+'</ul>':
      '<p class="dataset-note">'+hmsg("The current site inventory has no qualifying records here.")+'</p>')
    +'<p class="dataset-note">'+hmsg("The inventory covers scheduled airports, selected heritage sites, a port and archived power plants.")+'</p></section>';
}
function cityComparison(city) {
  const nearest=data.cities.filter(c=>c!==city).sort((a,b)=>Math.abs(a.pop-city.pop)-Math.abs(b.pop-city.pop)).slice(0,5);
  return '<section class="section"><h3>'+hmsg("Similar-sized settlements")+'</h3><p class="chart-note">'+hmsg("Six places ordered by population")+'</p><table class="comparison">'
    +'<thead><tr><th scope="col">'+hmsg("Locality")+'</th><th scope="col">'+hmsg("Population")+'</th><th scope="col">'+hmsg("Reference")+'</th></tr></thead><tbody>'
    +[city,...nearest].sort((a,b)=>b.pop-a.pop).map(c=>'<tr '+(c===city?'class="current"':'')+'><th scope="row"><button data-place="city" data-id="'+c.id+'">'
      +escape(cityDisplayName(c))+'</button></th><td>'+fmt.format(c.pop)+'</td><td>'+escape(populationSource(c))+'</td></tr>').join('')+'</tbody></table></section>';
}
function divisionsComparison(region) {
  const choices=region.id ? [region,...regions.filter(r=>r.id!==region.id).sort((a,b)=>Math.abs(a.pop-region.pop)-Math.abs(b.pop-region.pop)).slice(0,5)] : regions;
  return '<section class="section"><h3>'+ (region.id?hmsg("Comparable divisions"):hmsg("Administrative divisions"))+'</h3><p class="chart-note">'+hmsg("2026 population · 2025 regional product")+'</p><table class="comparison">'
    +'<thead><tr><th scope="col">'+hmsg("Division")+'</th><th scope="col">'+hmsg("People")+'</th><th scope="col">'+hmsg("GRP/person")+'</th><th scope="col">'+hmsg("Real growth")+'</th></tr></thead><tbody>'
    +choices.sort((a,b)=>b.pop-a.pop).map(r=>'<tr '+(r===region?'class="current"':'')+'><th scope="row"><button data-place="region" data-id="'+r.id+'">'
      +escape(regionDisplayName(r))+'</button></th><td>'+compact.format(r.pop)+'</td><td>₸'+compact.format(r.capita)+'</td><td>'+delta(r.realGrowth)+'%</td></tr>').join('')
    +'</tbody></table></section>';
}
function winterCityProfile(city) {
  const months=winter.cities[city.id];
  return '<section class="city-winter"><h3>'+hmsg("Winter in {place}",{place:cityDisplayName(city)})+'</h3>'
    +'<p>'+hmsg("Monthly mean air temperature · {period}",{period:winter.source.period})+'</p>'
    +'<dl>'+[msg("Dec"),msg("Jan"),msg("Feb")].map((month,i)=>'<div><dt>'+escape(month)+'</dt><dd>'+celsius(months[i])+'</dd></div>').join('')+'</dl>'
    +'<a href="'+escape(winter.source.url)+'" target="_blank" rel="noopener">'+escape(winter.source.name)+'</a></section>';
}
function cityFieldNote(city) {
  const landmark=cityLandmarks.get(city.id);
  const story=cityStories.get(city.id);
  const environment=cityEnvironment(city);
  const position=data.cities.indexOf(city)+1;
  const fieldName=landmark?.name ?? story?.title ?? msg("Around {place}",{place:cityDisplayName(city)});
  const title=escape(fieldName);
  const note=escape(landmark?.fact ?? story?.fact ?? landscapeStory(city));
  const distance=landmark ? Math.round(landmarkDistance(city,landmark)) : 0;
  const location=landmark ? (distance>=7 ? '<span class="field-scope field-distance">'+hmsg("{distance} km from the atlas centre",{distance:fmt.format(distance)})+'</span>' : '')
    +'<button class="field-location" data-landmark="'+city.id+'" aria-label="'+hmsg("Locate {landmark} on map",{landmark:fieldName})+'">'
    +'<span>'+hmsg("Locate on map")+'</span><i aria-hidden="true"></i></button>' :
    story ? '<a class="field-location" href="'+escape(story.source)+'" target="_blank" rel="noopener">'+hmsg("Source")+'</a>' :
      '<span class="field-scope">'+hmsg("110 km survey radius")+'</span>';
  const art='<img src="'+landmarkSprite(landmark?.style ?? story?.style ?? landscapeStyle(city),state.layer==='winter').url+'" alt="" width="74" height="74">';
  const elevation=environment.centreElevation===null?'': '<div><dt>'+hmsg("Centre hex elevation")+'</dt><dd>'+hmsg("{elevation} m",{elevation:fmt.format(environment.centreElevation)})+'</dd></div>';
  return '<section class="city-field-note"><div class="field-copy">'+art+'<div><h3>'+title+'</h3><p>'+note+'</p>'+location+'</div></div>'
    +'<dl class="city-facts"><div><dt>'+hmsg("Population rank in atlas")+'</dt><dd>'+hmsg("{rank} of {total}",{rank:fmt.format(position),total:fmt.format(data.cities.length)})+'</dd></div>'+elevation+'</dl></section>';
}
function placePopulationLabel(city) {
  if (city.placeType==='village') return msg("Village population");
  if (city.placeType==='settlement') return msg("Settlement population");
  return msg("City population");
}
function atlasProfile(region,city) {
  const title=city?cityDisplayName(city):regionDisplayName(region);
  const detailScope=city ? profileScope(city) : region.id ? msg("Division profile") : msg("National profile");
  const pop=city ? city.pop : region.pop;
  const nativeNames=city ? (city.kk===city.ru?['kk']:['kk','ru'])
    .filter(language=>locale==='en'||city[language]!==title)
    .map(language=>'<span lang="'+language+'">'+escape(city[language])+'</span>').join(' <span aria-hidden="true">·</span> ') : '';
  const nativeLine=nativeNames ? '<p class="sub city-names">'+nativeNames+'</p>' : '';
  const subtitle=city ? (city.official?'':msg("Statistics for {region}",{region:regionDisplayName(region)})) : (locale==='en'?(region.kk||'Қазақстан Республикасы'):region.id?'':msg("Republic of Kazakhstan"));
  const ranks=region.id ? '<div class="rank-row" aria-label="'+hmsg("Division rankings")+'">'+categoryRanks.map(([key,name])=>'<p><strong>#'+rankMetric(region,key)+'</strong>'+escape(name)+'</p>').join('')+'</div>' : '';
  const header='<header class="profile"><h2>'+escape(title)+'</h2>'+nativeLine+'<p class="sub">'+escape(detailScope)
    +(subtitle?' <span aria-hidden="true">·</span> '+escape(subtitle):'')+'</p>'
    +'<div class="profile-metrics">'+primary(escape(city?placePopulationLabel(city):msg("Population")),pop===null?'—':fmt.format(pop),city?escape(populationSource(city)):hmsg("1 Oct 2026"))
    +primary(region.id?hmsg("Regional product"):hmsg("GDP"),money(region.grp),hmsg("{amount} per person · 2025",{amount:'₸'+compact.format(region.capita)}))+'</div>'+ranks+'</header>';
  const tabs='<div class="panel-tabs" role="group" aria-label="'+hmsg("Profile sections")+'">'+Object.entries(profileTabs).map(([id,title])=>
    '<button data-tab="'+id+'" aria-pressed="'+(state.tab===id)+'">'+escape(title)+'</button>').join('')+'</div>';
  let body;
  if (state.tab==='districts') body=districtProfile(region,!!city);
  else if (state.tab==='economy') body=outputStructure(region)+regionalEconomy(region);
  else if (state.tab==='sites') body=sitesProfile(region,city);
  else if (state.tab==='compare') body=(city?cityComparison(city):'')+divisionsComparison(region);
  else body=peopleProfile(region);
  const scope = city && !city.official && ['people','districts','economy'].includes(state.tab) ?
    '<p class="dataset-note">'+hmsg("Charts and division rankings use {region} data.",{region:regionDisplayName(region)})+'</p>' : '';
  const fieldNote=city && state.tab==='people' ? cityFieldNote(city) : '';
  const climate=city && state.layer==='winter' ? winterCityProfile(city) : '';
  return header+tabs+'<div class="tab-body">'+climate+fieldNote+scope+body+'<p class="data-link"><button class="link-button" data-credits>'+hmsg("Data and methods")+'</button></p></div>';
}
function selectProfileTab(tab,restoreFocus=false) {
  if (!Object.hasOwn(profileTabs,tab)) return;
  state.tab=tab;
  renderDetails();
  updateLocation();
  if (restoreFocus) document.querySelector('[data-tab="'+tab+'"]')?.focus({preventScroll:true});
}
let inspectorEntrance = null;
function closeInspector(save=true) {
  inspectorEntrance?.cancel();
  inspectorEntrance=null;
  tilePulse=null;
  state.site=null;state.tile=null;state.district=null;state.landmark=null;
  $('inspector').hidden=true;
  if (save) updateLocation();
  requestDraw();
}
function renderInspector() {
  let body;
  if (state.landmark) {
    const item=cityLandmarks.get(state.landmark);
    const distance=Math.round(landmarkDistance(cityById.get(item.cityId),item));
    const place=distance>=7 ? msg("{distance} km from {place}",{distance:fmt.format(distance),place:item.city}) : item.city;
    body='<strong>'+escape(item.name)+'</strong><p>'+escape(place)+(item.localName?' · '+escape(item.localName):'')+'</p>'
      +'<p>'+escape(item.fact)+'</p><small>'+(cityHexLandmarks.has(item.cityId)
        ? hmsg("Illustrated in the city hex") : hmsg("Schematic miniature at the published location"))+'</small>'
      +'<p><a href="'+escape(item.source)+'" target="_blank" rel="noopener">'+hmsg("Landmark record")+'</a> · '
      +'<a href="'+escape(item.coordinateSource)+'" target="_blank" rel="noopener">'+hmsg("Coordinates")+'</a></p>';
  } else if (state.site) {
    const s=sitesById.get(state.site);
    const subtitle=s.kind==='energy'?msg("Archived nameplate capacity · WRI v1.3.0"):
      s.kind==='heritage'?msg("UNESCO World Heritage · inscribed {year}",{year:s.year}):
      s.kind==='airport'?msg("Scheduled airport · OurAirports"):msg("Port · public records");
    body='<strong>'+escape(s.name)+'</strong><p>'+escape(siteLabel(s))+'</p><p>'+escape(subtitle)+'</p>'
      +'<a href="'+escape(s.source)+'" target="_blank" rel="noopener">'+hmsg("Source record")+'</a>';
  } else if (state.district) {
    const city=cityById.get(state.city);
    const d=city && districts(regionById(city.region)).find(a=>a.id===state.district);
    if (d) body='<strong>'+hmsg("{activity} district",{activity:d.name})+'</strong><p>'+money(d.value)+' · '+hmsg("{percent} of division output",{percent:pct(d.share)})+'</p>'
      +'<p>'+hmsg("×{ratio} the national share",{ratio:ratio.format(d.lq)})+'</p><small>'+hmsg("Schematic pin · 2025 data")+'</small>';
  } else if (state.tile!==null) {
    const tile=data.tiles[state.tile];
    if (tile) {
      const r=regionById(tile[3]);
      const range=tile[2]===0?'':hmsg("{elevation} m sampled elevation",{elevation:fmt.format(tile[6])});
      const sample=data.worldPop.hexes[state.tile];
      const population=sample
        ? '<strong>'+hmsg("{count} residents",{count:estimatedPeople(sample[0])})+'</strong><span>'+escape(describeDensity(sample))+'</span>'
        : '<span>'+hmsg("Population unavailable for this hex")+'</span>';
      const temperature=winterTemperature(state.tile);
      const winterDetails=state.layer==='winter' ? '<div class="hex-population"><strong>'
        +(temperature===null?hmsg("No winter data"):celsius(temperature))+'</strong><span>'+hmsg("Dec–Feb mean · {period}",{period:winter.source.period})+'</span></div>' : '';
      const places=citiesByTile.get(state.tile) ?? [];
      const cityLinks=places.length ? '<p>'+hmsg("Places in this hex")+' · '+places.map(city=>
        '<button class="link-button" data-inspect-city="'+city.id+'">'+escape(cityDisplayName(city))+'</button>').join(' · ')+'</p>' : '';
      const landmarks=(landmarksByTile.get(state.tile) ?? []).map(item=>'<p><button class="link-button" data-inspect-landmark="'
        +item.cityId+'">'+escape(item.name)+'</button></p>').join('');
      body='<strong>'+escape(coverLabel[tile[7]])+'</strong><p>'+[range,r?hmsg("Hex centre: {region}",{region:regionDisplayName(r)}):'' ,r?'<button class="link-button" data-inspect-region="'+r.id+'">'+hmsg("Division profile")+'</button>':''].filter(Boolean).join(' · ')+'</p>'
        +winterDetails
        +'<div class="hex-population">'+population
        +'<a href="https://hub.worldpop.org/doi/10.5258/SOTON/WP00840" target="_blank" rel="noopener">'+hmsg("WorldPop {year} · modeled estimate",{year:data.worldPop.year})+'</a></div>'
        +cityLinks+landmarks
        +'<small>'+hmsg("Generalized land cover · ESA 2021")+'</small>';
    }
  }
  $('inspector').hidden=!body;
  if (body) $('inspector').innerHTML='<button data-inspect-close title="'+hmsg("Close map inspection")+'" aria-label="'+hmsg("Close map inspection")+'">×</button>'+body;
}
function inspectLandmark(id,focus,byPointer=false) {
  const item=cityLandmarks.get(id);
  if (!item) return;
  if (state.city!==id) select('city',id);
  closeInspector(false);
  state.landmark=id;
  if (focus) {
    if (!['terrain','winter'].includes(state.layer)) state.layer='terrain';
    [view.x,view.y]=cityHexLandmarks.has(id) ? cityHexPoint(cityById.get(id)) : item.xy;
    view.zoom=Math.max(view.zoom,zoomCity());
    if (mobile.matches) document.querySelector('.map').scrollIntoView({block:'start',behavior:navigationScrollBehavior(byPointer)});
  }
  $('announcement').textContent=item.name+' · '+item.city;
  updateUI();
  if (focus) $('inspector').querySelector('button').focus({preventScroll:true});
}
function inspectSite(id,focus,byPointer=false) {
  const s=sitesById.get(id);
  if (!s) return;
  closeInspector(false);
  state.site=id;mapOverlay.sites=true;
  $('show-sites').setAttribute('aria-pressed','true');
  if (focus) {
    if (state.layer==='density' || (['transport','heritage'].includes(state.layer) && !mapSiteVisible(s))) state.layer='terrain';
    [view.x,view.y]=s.xy;
    view.zoom=Math.max(view.zoom,zoomCity());
    if (mobile.matches) document.querySelector('.map').scrollIntoView({block:'start',behavior:navigationScrollBehavior(byPointer)});
  }
  updateUI();
}
function inspectDistrict(id) {
  const city=cityById.get(state.city);
  if (!city) return;
  closeInspector(false);
  state.district=id;
  state.layer='terrain';
  [view.x,view.y]=city.xy;
  view.zoom=Math.max(view.zoom,zoomCity());
  selectProfileTab('districts');
  updateUI();
}
function inspectTile(id,point) {
  const inspector=$('inspector');
  const opening=inspector.hidden;
  const newTile=state.tile!==id;
  closeInspector(false);
  state.tile=id;
  renderInspector();
  if (point) {
    if (newTile && !reducedMotion.matches) tilePulse={tile:id,started:performance.now()};
    if (opening && typeof inspector.animate==='function') {
      const start={opacity:.64}, end={opacity:1};
      if (!reducedMotion.matches) {
        const x=clamp(point.x-inspector.offsetLeft,0,inspector.offsetWidth);
        const y=clamp(point.y-inspector.offsetTop,0,inspector.offsetHeight);
        inspector.style.transformOrigin=x+'px '+y+'px';
        start.transform='scale(.97)';
        end.transform='scale(1)';
      }
      const animation=inspector.animate([start,end],{duration:tileFeedbackDuration,easing:mapEaseOut,fill:'none'});
      inspectorEntrance=animation;
      animation.onfinish=()=>{
        if (inspectorEntrance===animation) inspectorEntrance=null;
      };
    }
  }
  const sample=data.worldPop.hexes[id];
  $('announcement').textContent=sample
    ? msg("{count} residents. {density}. WorldPop {year}.",{count:estimatedPeople(sample[0]),density:describeDensity(sample),year:data.worldPop.year})
    : msg("Population unavailable for this hex.");
  updateLocation();
  requestDraw();
  atlasEvent('map_hex_inspected', {map_layer:state.layer});
}
let winterLegendExpanded=false;
let transportLegendExpanded=false;
function renderMapLegend() {
  const legend=$('legend');
  const [name,period]=layerInfo[state.layer];
  let content='<strong>'+escape(name)+'</strong>';
  const dot=(title,color)=>'<p><i class="swatch" style="background:'+color+'"></i>'+title+'</p>';
  const scheme=layerColor[state.layer];
  legend.classList.toggle('worldpop-legend',state.layer==='density');
  $('show-sites').disabled=state.layer==='density';
  if (state.layer==='winter') {
    const caption=escape(name)+' · °C';
    const key='<p>'+hmsg("Dec–Feb · {period}",{period:winter.source.period})+'</p>'
      +'<div class="winter-key">'+winterBands.map(band=>dot(escape(band.label),band.color)).join('')+'</div>'
      +dot(hmsg("No land sample"),winterMissing)+'<p class="winter-texture-note">'+hmsg("Snow is schematic")+'</p>';
    if (mobile.matches) {
      legend.innerHTML='<details class="winter-legend"'+(winterLegendExpanded?' open':'')+'><summary>'+caption+'</summary>'+key+'</details>';
      const disclosure=legend.firstElementChild;
      disclosure.addEventListener('toggle',()=>{
        winterLegendExpanded=disclosure.open;
        requestDraw();
      });
      return;
    }
    content='<strong>'+caption+'</strong>'+key;
  } else if (state.layer==='density') {
    const entries=densityClasses.map(bin=>dot(escape(bin.label),bin.color));
    entries.push(dot(hmsg("No data"),densityNoData));
    content+='<p>'+hmsg("People/km² · WorldPop {year}",{year:data.worldPop.year})+'</p><div class="worldpop-key">'+entries.join('')+'</div>';
  } else if (scheme) {
    const colors=[scheme.start,scheme.mid,scheme.end].filter(Boolean).map(rgbText);
    content+='<p>'+escape(period)+'</p><div class="gradient" style="background:linear-gradient(90deg,'+colors.join(',')+')"></div>'
      +'<div class="range"><span>'+escape(scheme.ends[0])+'</span><span>'+escape(scheme.ends[1])+'</span></div>';
  } else if (state.layer==='transport') {
    const line=(title,color,width,style='solid')=>'<p><i class="route-swatch" aria-hidden="true" style="border-top:'
      +width+'px '+style+' '+color+'"></i>'+title+'</p>';
    const date=new Intl.DateTimeFormat(locale,{day:'2-digit',month:'2-digit',year:'numeric',timeZone:'UTC'})
      .format(new Date(osmRoads.source.timestamp));
    const roads=mapOverlay.roads ? line(hmsg("Motorways"),roadStyles[0].day,3)
      +line(hmsg("Main routes"),roadStyles[1].day,2.5)
      +line(hmsg("Regional roads"),roadStyles[3].day,1.75)
      +line(hmsg("Local roads"),roadStyles[5].day,1)
      +'<p class="tool-note">'+hmsg("Zoom in for more roads.")+'</p>' : '';
    const key=roads+line(hmsg("Railway"),'#b9c9ce',2,'dashed')+dot(hmsg("Airport / port"),'#9ddadd')
      +'<p class="network-source">OpenStreetMap · '+escape(date)+'</p>';
    if (mobile.matches) {
      legend.innerHTML='<details class="transport-legend"'+(transportLegendExpanded?' open':'')+'><summary>'
        +escape(name)+'</summary>'+key+'</details>';
      const disclosure=legend.firstElementChild;
      disclosure.addEventListener('toggle',()=>{
        transportLegendExpanded=disclosure.open;
        requestDraw();
      });
      return;
    }
    content+=key;
  } else if (state.layer==='heritage') {
    content+='<p>'+hmsg("{count} selected sites",{count:data.sites.filter(s=>s.kind==='heritage').length})+'</p>'+dot(hmsg("UNESCO"),'#e2acb8');
  } else {
    const covers=state.layer==='land'?[10,20,30,40,50,60,70,80,90]:[10,30,40,60,80];
    content+=covers.map(id=>dot(escape(coverLabel[id]),rgbText(coverColor[id]))).join('');
    if (state.layer==='land') content+='<p class="tool-note">'+hmsg("ESA WorldCover 2021")+'</p>';
  }
  legend.innerHTML=content;
}
