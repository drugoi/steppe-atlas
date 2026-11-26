$('national').innerHTML = [
  ['●',compact.format(countryStats.pop),'Population','National population'],
  ['₸',compact.format(countryStats.grp*1e6),'GDP','National GDP'],
  ['◆',compact.format(countryStats.labor.employed.at(-1)),'Employment','Employed residents'],
  ['◒',pct(unemployment(countryStats)),'Unemployment','Unemployment rate']
].map(([glyph,value,label,name])=>'<button title="'+name+'" aria-label="'+name+' '+value+'"><i aria-hidden="true">'+glyph+'</i><span><small>'+label+'</small><strong>'+value+'</strong></span></button>').join('');
$('national').onclick = event=>{
  if (event.target.closest('button')) document.querySelector('[data-mode="overview"]').click();
};
document.fonts.ready.then(requestDraw);
$('more-layers').onclick = ()=>{
  const menu=$('extra-layers'), hidden=!menu.hidden;
  menu.hidden=hidden;
  $('more-layers').setAttribute('aria-expanded',String(!hidden));
  if (!hidden) menu.querySelector('button')?.focus();
};
$('extra-layers').addEventListener('click',event=>{
  if (!event.target.closest('[data-layer]')) return;
  $('more-layers').click();
  $('more-layers').focus();
});
$('more-layers').addEventListener('keydown',event=>{
  if (event.key==='Escape' && !$('extra-layers').hidden) $('more-layers').click();
});
$('extra-layers').addEventListener('keydown',event=>{
  if (event.key==='Escape') {
    $('more-layers').click();
    $('more-layers').focus();
  }
});
$('show-sites').onclick = ()=>{
  mapOverlay.sites=!mapOverlay.sites;
  $('show-sites').setAttribute('aria-pressed',String(mapOverlay.sites));
  if (state.site) closeInspector();
  requestDraw();
};
$('rail-overlay').onclick = ()=>{
  mapOverlay.rail=!mapOverlay.rail;
  $('rail-overlay').setAttribute('aria-pressed',String(mapOverlay.rail));
  requestDraw();
};
$('minimap-reset').onclick = ()=>setFit();
minimap.addEventListener('click',event=>{
  const b=minimap.getBoundingClientRect(),{x,y,ratio}=miniBounds;
  if (!ratio) return;
  view.x=(event.clientX-b.left-x)/ratio;
  view.y=(event.clientY-b.top-y)/ratio;
  constrainCamera();
  updateLocation();
  requestDraw();
});
$('inspector').addEventListener('click',event=>{
  if (event.target.closest('[data-inspect-close]')) closeInspector();
  const region=event.target.closest('[data-inspect-region]');
  if (region) select('region',Number(region.dataset.inspectRegion));
});
window.addEventListener('hashchange',()=>{readLocation();updateUI(false);});
new ResizeObserver(resize).observe(canvas);
readLocation();
updateUI(false);
resize();
