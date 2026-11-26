const defaultCity = 1526384;
const profileTabs = {people:'People',districts:'Districts',economy:'Economy',sites:'Sites',compare:'Compare'};
const zoomCity = () => mobile.matches ? 8.0 : 6.35;
const profileScope = city => city.capital?'National capital':city.official?'City of republican significance':
  city.id===1521368?'City with special status':city.seat?'Regional centre':'City or town';
const populationSource = city => city.popDate==='2026-10-01' ? '1 Oct 2026' :
  city.popDate==='2025-01-01' ? '1 Jan 2025' : 'GeoNames estimate';
const categoryRanks = [['pop','People'],['grp','Output'],['capita','Per person'],['realGrowth','Growth']];
function populationGlyphs(percent) {
  return '<div class="dots" aria-label="'+pct(percent)+' urban">'+Array.from({length:20},(_,i)=>
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
  const division=region.id?escape(region.name):'Kazakhstan';
  return '<section class="section"><h3>Population &amp; migration</h3><p class="chart-note">'+division+' · January–September 2026</p>'
    +timeline([region.startPop,region.pop],['Jan 2026','Oct 2026'],'Population')
    +'<div class="metric-grid">'+metric('Net migration',delta(region.migration))+metric('Natural increase',delta(region.natural))
    +metric('Urban population',fmt.format(region.urban))+metric('Rural population',fmt.format(region.pop-region.urban))+'</div></section>'
    +'<section class="section"><h3>Urban share · '+pct(share)+'</h3>'+populationGlyphs(share)
    +'<p class="chart-note">Each dot represents roughly 5% of residents.</p></section>'
    +'<section class="section"><h3>Labour market</h3><p class="chart-note">2025 · Labour Force Survey</p>'
    +'<div class="metric-grid">'+metric('Employed residents',fmt.format(region.labor.employed.at(-1)))
    +metric('Unemployment rate',pct(unemployment(region)))+metric('Labour force',fmt.format(region.labor.force.at(-1)))
    +metric('National unemployment',pct(unemployment(countryStats)))+'</div>'
    +timeline(region.labor.employed,['2022','2023','2024','2025'],'Employed residents')+'</section>';
}
function districtProfile(region,isCity) {
  const top=specializations(region);
  const cards=top.map(a=>'<button '+(isCity?'data-district="'+a.id+'"':'disabled')+' aria-pressed="'+(state.district===a.id)+'" style="--district:'+a.color+'">'
    +'<span class="district-icon" aria-hidden="true">'+a.glyph+'</span><span><strong>'+a.name+'</strong><small>'+money(a.value)+' · '+pct(a.share)+' of output</small></span>'
    +'<b>×'+a.lq.toFixed(2)+'</b></button>').join('');
  const ranked=districts(region).sort((a,b)=>b.lq-a.lq);
  return '<section class="section"><h3>Economic districts</h3><p class="chart-note">'+escape(region.name)+' · 2025</p>'
    +(top.length ? '<div class="district-list">'+cards+'</div>' : '<p class="dataset-note">This division has no district that meets both cutoffs.</p>')
    +'<p class="dataset-note">A district represents at least 2% of the division’s output and at least 1.15 times the activity’s national share. Map positions are schematic.</p></section>'
    +'<section class="section"><h3>Specialization by activity</h3><table class="comparison"><thead><tr><th scope="col">Activity</th><th scope="col">Local share</th><th scope="col">Vs. KZ</th></tr></thead><tbody>'
    +ranked.map(a=>'<tr><th scope="row">'+a.name+'</th><td>'+pct(a.share)+'</td><td>×'+a.lq.toFixed(2)+'</td></tr>').join('')
    +'</tbody></table></section>';
}
function outputStructure(region) {
  const industries=districts(region).sort((a,b)=>b.share-a.share);
  return '<section class="section"><h3>Output by activity</h3><p class="chart-note">Share of 2025 output · markers show national shares</p><div class="bars bns-bars">'
    +industries.map(a=>'<div><div class="bar-label"><span>'+a.name+'</span><em>'+money(a.value)+' · '+pct(a.share)+'</em></div>'
      +'<div class="track"><i style="width:'+a.share+'%"></i><span class="baseline" style="left:'+a.national+'%" title="Kazakhstan '+pct(a.national)+'"></span></div></div>').join('')
    +'</div></section>';
}
function getSites(region,city) {
  return data.sites.map(s=>({...s,dist:city?Math.hypot(s.xy[0]-city.xy[0],s.xy[1]-city.xy[1])*data.metersPerUnit/1000:0}))
    .filter(s=>city?s.dist<=160:region.id?s.region===region.id:true)
    .sort((a,b)=>city?a.dist-b.dist:a.kind.localeCompare(b.kind)||a.name.localeCompare(b.name));
}
function siteLabel(site) {
  return site.mw?fmt.format(site.mw)+' MW':site.tag;
}
function sitesProfile(region,city) {
  const points=getSites(region,city);
  return '<section class="section"><h3>'+points.length+' '+(city?'nearby ':'')+'mapped '+(points.length===1?'site':'sites')+'</h3>'
    +'<p class="chart-note">'+(city?'Within 160 km of '+escape(city.name):escape(region.name||'Kazakhstan'))+' · select a site to locate it</p>'
    +(points.length?'<ul class="place-list site-list">'+points.map(p=>
      '<li><button data-site="'+p.id+'"><span><i class="site-glyph" aria-hidden="true">'+siteStyle[p.kind].glyph+'</i>'+escape(p.name)+'</span>'
      +'<small>'+escape(siteLabel(p))+(city?' · '+Math.round(p.dist)+' km':'')+'</small></button></li>').join('')+'</ul>':
      '<p class="dataset-note">The current site inventory has no qualifying records here.</p>')
    +'<p class="dataset-note">The inventory covers scheduled airports, selected heritage sites, a port and archived power plants.</p></section>';
}
function cityComparison(city) {
  const nearest=data.cities.filter(c=>c!==city).sort((a,b)=>Math.abs(a.pop-city.pop)-Math.abs(b.pop-city.pop)).slice(0,5);
  return '<section class="section"><h3>Similar-sized settlements</h3><p class="chart-note">Six places ordered by population</p><table class="comparison">'
    +'<thead><tr><th scope="col">Settlement</th><th scope="col">Population</th><th scope="col">Reference</th></tr></thead><tbody>'
    +[city,...nearest].sort((a,b)=>b.pop-a.pop).map(c=>'<tr '+(c===city?'class="current"':'')+'><th scope="row"><button data-place="city" data-id="'+c.id+'">'
      +escape(c.name)+'</button></th><td>'+fmt.format(c.pop)+'</td><td>'+populationSource(c)+'</td></tr>').join('')+'</tbody></table></section>';
}
function divisionsComparison(region) {
  const choices=region.id ? [region,...regions.filter(r=>r.id!==region.id).sort((a,b)=>Math.abs(a.pop-region.pop)-Math.abs(b.pop-region.pop)).slice(0,5)] : regions;
  return '<section class="section"><h3>'+ (region.id?'Comparable divisions':'Administrative divisions')+'</h3><p class="chart-note">2026 population · 2025 regional product</p><table class="comparison">'
    +'<thead><tr><th scope="col">Division</th><th scope="col">People</th><th scope="col">GRP/person</th><th scope="col">Real growth</th></tr></thead><tbody>'
    +choices.sort((a,b)=>b.pop-a.pop).map(r=>'<tr '+(r===region?'class="current"':'')+'><th scope="row"><button data-place="region" data-id="'+r.id+'">'
      +escape(r.name)+'</button></th><td>'+compact.format(r.pop)+'</td><td>₸'+compact.format(r.capita)+'</td><td>'+delta(r.realGrowth)+'%</td></tr>').join('')
    +'</tbody></table></section>';
}
function winterCityProfile(city) {
  const months=winter.cities[city.id];
  return '<section class="city-winter"><h3>Winter in '+escape(city.name)+'</h3>'
    +'<p>Monthly mean air temperature · '+escape(winter.source.period)+'</p>'
    +'<dl>'+['Dec','Jan','Feb'].map((month,i)=>'<div><dt>'+month+'</dt><dd>'+celsius(months[i])+'</dd></div>').join('')+'</dl>'
    +'<a href="'+escape(winter.source.url)+'" target="_blank" rel="noopener">'+escape(winter.source.name)+'</a></section>';
}
function cityFieldNote(city) {
  const landmark=cityLandmarks.get(city.id);
  const environment=cityEnvironment(city);
  const position=data.cities.indexOf(city)+1;
  const title=landmark ? escape(landmark.name) : 'Around '+escape(city.name);
  const note=landmark ? escape(landmark.fact) : escape(landscapeStory(city));
  const location=landmark ? '<button class="field-location" data-landmark="'+city.id+'" aria-label="Locate '+title+' on map">'
    +'<span>Locate on map</span><i aria-hidden="true"></i></button>' : '<span class="field-scope">110 km survey radius</span>';
  const art='<img src="'+landmarkSprite(landmark?.style ?? landscapeStyle(city)).url+'" alt="" width="74" height="74">';
  const elevation=environment.centreElevation===null?'': '<div><dt>Centre hex elevation</dt><dd>'+fmt.format(environment.centreElevation)+' m</dd></div>';
  return '<section class="city-field-note"><div class="field-copy">'+art+'<div><h3>'+title+'</h3><p>'+note+'</p>'+location+'</div></div>'
    +'<dl class="city-facts"><div><dt>Population rank in atlas</dt><dd>'+position+' of '+data.cities.length+'</dd></div>'+elevation+'</dl></section>';
}
function atlasProfile(region,city) {
  const title=city?.name || region.name || 'Kazakhstan';
  const detailScope=city ? profileScope(city) : region.id ? 'Division profile' : 'National profile';
  const pop=city ? city.pop : region.pop;
  const subtitle=city ? (city.official ? region.kk : 'Statistics for '+region.name) : (region.kk||'Қазақстан Республикасы');
  const ranks=region.id ? '<div class="rank-row" aria-label="Division rankings">'+categoryRanks.map(([key,name])=>'<p><strong>#'+rankMetric(region,key)+'</strong>'+name+'</p>').join('')+'</div>' : '';
  const header='<header class="profile"><h2>'+escape(title)+'</h2><p class="sub">'+detailScope+' <span aria-hidden="true">·</span> '+escape(subtitle)+'</p>'
    +'<div class="profile-metrics">'+primary(city?'City population':'Population',pop===null?'—':fmt.format(pop),city?populationSource(city):'1 Oct 2026')
    +primary(region.id?'Regional product':'GDP',money(region.grp),'₸'+compact.format(region.capita)+' per person · 2025')+'</div>'+ranks+'</header>';
  const tabs='<div class="panel-tabs" role="group" aria-label="Profile sections">'+Object.entries(profileTabs).map(([id,title])=>
    '<button data-tab="'+id+'" aria-pressed="'+(state.tab===id)+'">'+title+'</button>').join('')+'</div>';
  let body;
  if (state.tab==='districts') body=districtProfile(region,!!city);
  else if (state.tab==='economy') body=outputStructure(region)+regionalEconomy(region);
  else if (state.tab==='sites') body=sitesProfile(region,city);
  else if (state.tab==='compare') body=(city?cityComparison(city):'')+divisionsComparison(region);
  else body=peopleProfile(region);
  const scope = city && !city.official && ['people','districts','economy'].includes(state.tab) ?
    '<p class="dataset-note">Charts and division rankings use '+escape(region.name)+' data.</p>' : '';
  const fieldNote=city && state.tab==='people' ? cityFieldNote(city) : '';
  const climate=city && state.layer==='winter' ? winterCityProfile(city) : '';
  return header+tabs+'<div class="tab-body">'+climate+fieldNote+scope+body+'<p class="data-link"><button class="link-button" data-credits>Data and methods</button></p></div>';
}
function selectProfileTab(tab,restoreFocus=false) {
  if (!Object.hasOwn(profileTabs,tab)) return;
  state.tab=tab;
  renderDetails();
  updateLocation();
  if (restoreFocus) document.querySelector('[data-tab="'+tab+'"]')?.focus({preventScroll:true});
}
function closeInspector(save=true) {
  state.site=null;state.tile=null;state.district=null;state.landmark=null;
  $('inspector').hidden=true;
  if (save) updateLocation();
  requestDraw();
}
function renderInspector() {
  let body;
  if (state.landmark) {
    const item=cityLandmarks.get(state.landmark);
    body='<strong>'+escape(item.name)+'</strong><p>'+escape(item.city)+(item.localName?' · '+escape(item.localName):'')+'</p>'
      +'<p>'+escape(item.fact)+'</p><small>Schematic miniature at the published location</small>'
      +'<p><a href="'+escape(item.source)+'" target="_blank" rel="noopener">Landmark record</a> · '
      +'<a href="'+escape(item.coordinateSource)+'" target="_blank" rel="noopener">Coordinates</a></p>';
  } else if (state.site) {
    const s=sitesById.get(state.site);
    const subtitle=s.kind==='energy'?'Archived nameplate capacity · WRI v1.3.0':
      s.kind==='heritage'?'UNESCO World Heritage · inscribed '+s.year:
      s.kind==='airport'?'Scheduled airport · OurAirports':'Port · public records';
    body='<strong>'+escape(s.name)+'</strong><p>'+escape(siteLabel(s))+'</p><p>'+subtitle+'</p>'
      +'<a href="'+escape(s.source)+'" target="_blank" rel="noopener">Source record</a>';
  } else if (state.district) {
    const city=cityById.get(state.city);
    const d=city && districts(regionById(city.region)).find(a=>a.id===state.district);
    if (d) body='<strong>'+d.name+' district</strong><p>'+money(d.value)+' · '+pct(d.share)+' of division output</p>'
      +'<p>×'+d.lq.toFixed(2)+' the national share</p><small>Schematic pin · 2025 data</small>';
  } else if (state.tile!==null) {
    const tile=data.tiles[state.tile];
    if (tile) {
      const r=regionById(tile[3]);
      const range=tile[2]===0?'':fmt.format(tile[6])+' m sampled elevation';
      const sample=data.worldPop.hexes[state.tile];
      const population=sample
        ? '<strong>'+escape(estimatedPeople(sample[0]))+' residents</strong><span>'+escape(describeDensity(sample))+'</span>'
        : '<span>Population unavailable for this hex</span>';
      const temperature=winterTemperature(state.tile);
      const winterDetails=state.layer==='winter' ? '<div class="hex-population"><strong>'
        +(temperature===null?'No winter data':celsius(temperature))+'</strong><span>Dec–Feb mean · '+escape(winter.source.period)+'</span></div>' : '';
      const landmarks=(landmarksByTile.get(state.tile) ?? []).map(item=>'<p><button class="link-button" data-inspect-landmark="'
        +item.cityId+'">'+escape(item.name)+'</button></p>').join('');
      body='<strong>'+coverLabel[tile[7]]+'</strong><p>'+[range,r?'Hex centre: '+escape(r.name):'',r?'<button class="link-button" data-inspect-region="'+r.id+'">Division profile</button>':''].filter(Boolean).join(' · ')+'</p>'
        +winterDetails
        +'<div class="hex-population">'+population
        +'<a href="https://hub.worldpop.org/doi/10.5258/SOTON/WP00840" target="_blank" rel="noopener">WorldPop '+data.worldPop.year+' · modeled estimate</a></div>'
        +landmarks
        +'<small>Generalized land cover · ESA 2021</small>';
    }
  }
  $('inspector').hidden=!body;
  if (body) $('inspector').innerHTML='<button data-inspect-close title="Close map inspection" aria-label="Close map inspection">×</button>'+body;
}
function inspectLandmark(id,focus) {
  const item=cityLandmarks.get(id);
  if (!item || state.city!==id) return;
  closeInspector(false);
  state.landmark=id;
  if (focus) {
    if (!['terrain','winter'].includes(state.layer)) state.layer='terrain';
    [view.x,view.y]=item.xy;
    view.zoom=Math.max(view.zoom,zoomCity());
    if (mobile.matches) document.querySelector('.map').scrollIntoView({block:'start'});
  }
  $('announcement').textContent=item.name+' in '+item.city;
  updateUI();
  if (focus) $('inspector').querySelector('button').focus({preventScroll:true});
}
function inspectSite(id,focus) {
  const s=sitesById.get(id);
  if (!s) return;
  closeInspector(false);
  state.site=id;mapOverlay.sites=true;
  $('show-sites').setAttribute('aria-pressed','true');
  if (focus) {
    if (state.layer==='density' || (['transport','heritage'].includes(state.layer) && !mapSiteVisible(s))) state.layer='terrain';
    [view.x,view.y]=s.xy;
    view.zoom=Math.max(view.zoom,zoomCity());
    if (mobile.matches) document.querySelector('.map').scrollIntoView({block:'start'});
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
function inspectTile(id) {
  closeInspector(false);
  state.tile=id;
  renderInspector();
  const sample=data.worldPop.hexes[id];
  $('announcement').textContent=sample
    ? estimatedPeople(sample[0])+' residents. '+describeDensity(sample)+'. WorldPop '+data.worldPop.year+'.'
    : 'Population unavailable for this hex.';
  updateLocation();
  requestDraw();
  atlasEvent('map_hex_inspected', {map_layer:state.layer});
}
function renderMapLegend() {
  const legend=$('legend');
  const [name,period]=layerInfo[state.layer];
  let content='<strong>'+name+'</strong>';
  const dot=(title,color)=>'<p><i class="swatch" style="background:'+color+'"></i>'+title+'</p>';
  const scheme=layerColor[state.layer];
  legend.classList.toggle('worldpop-legend',state.layer==='density');
  $('show-sites').disabled=state.layer==='density';
  if (state.layer==='winter') {
    content+='<p>Dec–Feb · '+escape(winter.source.period)+'</p>'
      +winterBands.map(band=>dot(band.label,band.color)).join('')+dot('No land sample',winterMissing);
  } else if (state.layer==='density') {
    const entries=densityClasses.map(bin=>dot(escape(bin.label),bin.color));
    entries.push(dot('No data',densityNoData));
    content+='<p>People/km² · WorldPop '+data.worldPop.year+'</p><div class="worldpop-key">'+entries.join('')+'</div>';
  } else if (scheme) {
    const colors=[scheme.start,scheme.mid,scheme.end].filter(Boolean).map(rgbText);
    content+='<p>'+period+'</p><div class="gradient" style="background:linear-gradient(90deg,'+colors.join(',')+')"></div>'
      +'<div class="range"><span>'+scheme.ends[0]+'</span><span>'+scheme.ends[1]+'</span></div>';
  } else if (state.layer==='transport') {
    content+=[['Railway','#d1b886'],['Airport / port','#9ddadd']].map(([n,c])=>dot(n,c)).join('');
  } else if (state.layer==='heritage') {
    content+='<p>'+data.sites.filter(s=>s.kind==='heritage').length+' selected sites</p>'+dot('UNESCO','#e2acb8');
  } else {
    const covers=state.layer==='land'?[10,20,30,40,50,60,70,80,90]:[10,30,40,60,80];
    content+=covers.map(id=>dot(coverLabel[id],rgbText(coverColor[id]))).join('');
    if (state.layer==='land') content+='<p class="tool-note">ESA WorldCover 2021</p>';
  }
  legend.innerHTML=content;
}
