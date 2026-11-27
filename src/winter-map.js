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

function drawWinterTint(visible,reliefOpacity) {
  const palette=[...winterBands,{color:winterMissing,tint:winterMissing}];
  const areas=palette.map(()=>new Path2D());
  for (const [index,tile] of visible) {
    if (!tile[4]) continue;
    const value=winterTemperature(index);
    const band=value===null ? winterBands.length : winterBands.findIndex(entry=>value>=entry.min);
    traceHex(areas[band],tile[0],tile[1]);
  }
  for (const [index,area] of areas.entries()) {
    if (reliefOpacity<1) {
      context.globalAlpha=1-reliefOpacity;
      context.fillStyle=palette[index].color;
      context.fill(area);
    }
    if (reliefOpacity) {
      context.globalAlpha=reliefOpacity*(index===winterBands.length ? .51 : .53);
      context.fillStyle=palette[index].tint;
      context.fill(area);
    }
  }
  context.globalAlpha=1;
}
