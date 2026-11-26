const osmRoads = JSON.parse($('osm-roads').textContent);
const roadStyles = [
  {day:'#ffc65f',snow:'#fbd080',edge:'#423125',width:2.55,casing:1.7,transport:0,scenery:1.10},
  {day:'#eaa259',snow:'#eeb071',edge:'#49372d',width:2.05,casing:1.42,transport:0,scenery:1.10},
  {day:'#e6cf9f',snow:'#f0d4ab',edge:'#503e32',width:1.53,casing:1.12,transport:0,scenery:1.50},
  {day:'#bbb594',snow:'#c7c7c0',edge:'#475047',width:1.16,casing:.88,transport:1.22,scenery:2.45},
  {day:'#a7a78a',snow:'#a2b2ba',edge:'#535b4e',width:.91,casing:.60,transport:2.10,scenery:3.60},
  {day:'#b9b49d',snow:'#9caeb6',edge:'#4f605b',width:.62,casing:.28,transport:3.72,scenery:6.4},
];
const roadBlockCache = new Map();
const routeShields = osmRoads.labels.map(([kind,sourceRef,x,y])=>[
  kind,
  // Some OSM ref values use Cyrillic letters in the officially Latin prefix.
  sourceRef.replace(/^[KК]([AА]?)[ZЗ]\s*(?=\d)/iu,(_,middle)=>middle ? 'KAZ' : 'KZ'),
  x,y,
]);
let roadViewport = null;
let overviewRoads;

function addRoadLines(path,lines) {
  const unit=osmRoads.quantization;
  for (const line of lines) {
    path.moveTo(line[0]/unit,line[1]/unit);
    for (let i=2;i<line.length;i+=2) path.lineTo(line[i]/unit,line[i+1]/unit);
  }
  return path;
}

function roadPaths(s,left,top,right,bottom,maxClass) {
  if (s<1.2) {
    overviewRoads ??= osmRoads.overview.map(lines=>lines.length ? addRoadLines(new Path2D(),lines) : null);
    return overviewRoads;
  }
  const block=osmRoads.blockSize;
  const [col0,row0,col1,row1]=[left,top,right,bottom].map(value=>Math.floor(value/block));
  const key=[col0,row0,col1,row1,maxClass].join(',');
  if (roadViewport?.key===key) return roadViewport.paths;
  const paths=Array(maxClass+1).fill(null);
  for (let row=row0;row<=row1;row++) {
    for (let col=col0;col<=col1;col++) {
      const id=col+','+row;
      const blockLines=osmRoads.blocks[id];
      if (!blockLines) continue;
      if (!roadBlockCache.has(id)) roadBlockCache.set(id,[]);
      const blockPaths=roadBlockCache.get(id);
      for (let kind=0;kind<paths.length;kind++) {
        if (blockPaths[kind]===undefined) {
          const lines=blockLines[kind];
          blockPaths[kind]=lines.length ? addRoadLines(new Path2D(),lines) : null;
        }
        if (!blockPaths[kind]) continue;
        paths[kind] ??= new Path2D();
        paths[kind].addPath(blockPaths[kind]);
      }
    }
  }
  roadViewport={key,paths};
  return paths;
}

function roadView(s) {
  if (!mapOverlay.roads) return null;
  if (state.layer==='transport') return 'transport';
  return view.zoom>=2.5 && s>=1.10 &&
    (state.layer==='terrain' || state.layer==='winter') ? 'scenery' : null;
}

function drawRoads(s,left,top,right,bottom) {
  const mode=roadView(s);
  if (!mode) return;
  const maxClass=roadStyles.findLastIndex(style=>s>=style[mode]);
  const paths=roadPaths(s,left,top,right,bottom,maxClass);
  const snow=state.layer==='winter';
  const scaleWidth=clamp(Math.pow(s,.32),.56,1.37);
  context.save();
  context.lineJoin=context.lineCap='round';
  for (let kind=maxClass;kind>=0;kind--) {
    const style=roadStyles[kind], path=paths[kind];
    if (!path || s<style[mode]) continue;
    const width=style.width*scaleWidth;
    context.globalAlpha=kind===5 ? .58 : mode==='scenery' && kind>2 ? .74 : .95;
    context.lineWidth=(width+style.casing*scaleWidth)/s;
    context.strokeStyle=snow ? '#3c4d56' : style.edge;
    context.stroke(path);
    context.lineWidth=width/s;
    context.strokeStyle=snow ? style.snow : style.day;
    context.stroke(path);
  }
  context.restore();
}

function drawRouteShields() {
  const s=scale(),mode=roadView(s);
  if (!mode || s<(mode==='transport' ? 1.16 : 3.5)) return;
  const mapRect=canvas.getBoundingClientRect();
  const occupied=Array.from(document.querySelectorAll('.map :is(.title,.legend,.minimap,.controls,.winter-toggle,.inspector:not([hidden]))'),element=>{
    const rect=element.getBoundingClientRect();
    return [rect.left-mapRect.left,rect.top-mapRect.top,rect.right-mapRect.left,rect.bottom-mapRect.top];
  });
  for (const {box,x,y,r} of hits) {
    if (box) occupied.push(box);
    else occupied.push([x-r,y-r,x+r,y+r]);
  }
  const refs=new Set();
  const dockTop=document.querySelector('.layers').offsetTop;
  const limit=mobile.matches ? 3 : mode==='transport' ? 8 : 5;
  const unit=osmRoads.quantization;
  context.save();
  context.font='700 10px system-ui';
  context.textAlign='center';
  context.textBaseline='middle';
  for (const [kind,ref,x,y] of routeShields) {
    if (refs.has(ref) || s<roadStyles[kind][mode]) continue;
    const [px,py]=viewPoint([x/unit,y/unit]);
    if (px<20 || px>view.width-20 || py<25 || py>dockTop-10) continue;
    const w=context.measureText(ref).width/2+7;
    const bounds=[px-w-3,py-11,px+w+3,py+11];
    if (bounds[0]<5 || bounds[2]>view.width-5 ||
        occupied.some(box=>mapBoundsOverlap(box,bounds))) continue;
    occupied.push(bounds);
    refs.add(ref);
    const style=roadStyles[kind];
    const tone=state.layer==='winter' ? style.snow : style.day;
    shapeFill([[px-w,py-5],[px-w+3,py-8],[px+w-3,py-8],[px+w,py-5],
      [px+w,py+5],[px+w-3,py+8],[px-w+3,py+8],[px-w,py+5]],'#1b343c',tone,.95);
    context.fillStyle='#f6e8cc';
    context.fillText(ref,px,py+.4);
    if (refs.size===limit) break;
  }
  context.restore();
}
