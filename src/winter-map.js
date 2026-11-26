const winter = JSON.parse($('winter-data').textContent);
const winterBands = [
  {label:'≥0', color:'#dfc3a0', tint:'#d1a36a', min:0},
  {label:'−5…<0', color:'#b0cec2', tint:'#78ae9c', min:-5},
  {label:'−10…<−5', color:'#9ec8d7', tint:'#61a7c2', min:-10},
  {label:'−15…<−10', color:'#91aecb', tint:'#678eb6', min:-15},
  {label:'−20…<−15', color:'#818fb4', tint:'#4e609d', min:-20},
  {label:'<−20', color:'#9786ac', tint:'#766093', min:-Infinity},
];
const winterMissing = '#334859';
const temperature = new Intl.NumberFormat(numberLocale,{maximumFractionDigits:1,minimumFractionDigits:1,signDisplay:'exceptZero'});
const celsius = value => temperature.format(value).replace('-', '−')+' °C';
const winterTemperature = tile => winter.hexes[tile] ?? null;

function drawWinterTint(visible,textured) {
  const palette=[...winterBands,{color:winterMissing,tint:winterMissing}];
  const areas=palette.map(()=>new Path2D());
  for (const [index,tile] of visible) {
    if (!tile[4]) continue;
    const value=winterTemperature(index);
    const band=value===null ? winterBands.length : winterBands.findIndex(entry=>value>=entry.min);
    traceHex(areas[band],tile[0],tile[1]);
  }
  for (const [index,area] of areas.entries()) {
    context.globalAlpha=textured ? (index===winterBands.length ? .51 : .53) : 1;
    context.fillStyle=textured ? palette[index].tint : palette[index].color;
    context.fill(area);
  }
  context.globalAlpha=1;
}

function winterTree(x,y,size) {
  ellipse(x+size*.8,y+size*.37,size*1.4,size*.34,'#17364757');
  context.fillStyle='#584c48';
  context.fillRect(x-size*.09,y-size*.35,size*.18,size*.76);
  for (let tier=0;tier<3;tier++) {
    const top=y-(1.0+tier*.37)*size;
    const base=y+(.28-tier*.39)*size;
    const width=(.64-tier*.105)*size;
    shapeFill([[x-width,base],[x,top],[x+width,base-size*.12]],'#34535b','#223c49',.08);
    shapeFill([[x-width*.80,base-size*.14],[x,top],[x+width*.76,base-size*.26],[x+width*.04,base-size*.36]],
      tier===2?'#e5eff1':'#b5d1d8');
  }
}

function winterFields(x,y,crops,offset) {
  const count=crops>=13 ? 3 : 2;
  const rotation=(offset-.5)*1.16;
  context.save();
  context.translate(x,y);
  context.rotate(rotation);
  for (let i=0;i<count;i++) {
    fieldStrip(-3.75+(i%2)*3.78,-1.4+(i>1?1.9:0),3.15+i*.16,1.48, i%2?'#9eaaab':'#bec4bd',
      (offset-.5)*.68, ['#e6eff0bc','#536e7a72']);
  }
  context.restore();
}

function drawWinterArtwork(tile,s) {
  const [x,y,terrain,,,,z,cover,trees,crops] = tile;
  if (s<1.25) return;
  context.save();
  context.globalAlpha=clamp((s-1.25)/.62,0,1);
  context.lineCap='round';
  const seed=rasterNoise(x,y,12);
  if (cover===80 || terrain===0) {
    for (let i=0;i<4;i++) {
      const ox=(rasterNoise(x,y,i+3)-.5)*8,oy=(rasterNoise(x,y,i+27)-.5)*7;
      const width=.88+rasterNoise(x,y,i+8)*2.2;
      context.beginPath();
      context.moveTo(x+ox-width/2,y+oy);
      context.quadraticCurveTo(x+ox,y+oy-.26,x+ox+width/2,y+oy+.04);
      context.lineWidth=.16;
      context.strokeStyle=i%2?'#abc5d792':'#b8deea5e';
      context.stroke();
    }
  } else if (trees>=3) {
    const count=Math.min(8,Math.ceil(trees*.68));
    const stand=Array.from({length:count},(_,i)=>[
      x+(rasterNoise(x,y,i+40)-.5)*7.2,
      y+(rasterNoise(x,y,i+57)-.5)*5.8,
      .57+rasterNoise(x,y,i+70)*.69,
    ]).sort((a,b)=>a[1]-b[1]);
    for (const [tx,ty,size] of stand) winterTree(tx,ty,size);
  } else if (crops>=5 && z<1750) {
    winterFields(x,y,crops,seed);
  } else if (s>=1.75 && z<1900 && seed>.38) {
    const marks=seed>.72 ? 3 : 1;
    for (let i=0;i<marks;i++) {
      const px=x+(rasterNoise(x,y,i+15)-.5)*9;
      const py=y+(rasterNoise(x,y,i+33)-.5)*8;
      const angle=(rasterNoise(x,y,i+64)-.5)*.55;
      const size=.30+rasterNoise(x,y,i+70)*.39;
      context.save();
      context.translate(px,py);
      context.rotate(angle);
      ellipse(.64*size,0,1.7*size,.31*size,'#4c607a2e');
      context.beginPath();
      for (const [dx,dy] of [[-.69,-.72],[.22,-1.05],[.81,-.54]]) {
        context.moveTo(0,0);
        context.quadraticCurveTo(dx*.24*size,dy*.64*size,dx*size,dy*size);
      }
      context.lineWidth=.11;
      context.strokeStyle='#5967687c';
      context.stroke();
      context.restore();
    }
  }
  context.restore();
}
