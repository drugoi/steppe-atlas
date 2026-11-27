import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { Script } from 'node:vm';
import { localizeDocument, readLocalizations, translationInventory } from './localization.mjs';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');
const [template, css, snapshot, ...scripts] = await Promise.all([
  'src/index.html', 'src/atlas.css', 'data/atlas-data.json',
  'src/i18n.js', 'src/app.js', 'src/map.js', 'src/roads.js', 'src/terrain-detail.js', 'src/winter-map.js',
  'src/cities.js', 'src/profile.js', 'src/analytics.js', 'src/startup.js',
].map(read));

const analyticsId = process.env.GA4_MEASUREMENT_ID?.trim() ?? '';
if (analyticsId && !/^G-[A-Z0-9]+$/.test(analyticsId)) {
  throw new Error('GA4_MEASUREMENT_ID must be a GA4 web Measurement ID.');
}
const atlas = JSON.parse(snapshot);
if (!atlas.tiles?.length || atlas.worldPop?.hexes?.length !== atlas.tiles.length ||
    !Object.values(atlas.regions ?? {}).length || !atlas.cities?.length) {
  throw new Error('The atlas snapshot is incomplete or its WorldPop hexes do not match the grid.');
}
const javascript = scripts.join('');
new Script(javascript, { filename: 'atlas.js' });
const [relief, font, fontLicense, landmarks, stories, winter, roads] = await Promise.all([
  read('data/terrain-relief.json').then(JSON.parse),
  readFile(new URL('src/assets/crimson-pro-latin.woff2', root)),
  read('src/assets/crimson-pro-OFL.txt'),
  read('data/city-landmarks.json').then(JSON.parse),
  read('data/city-stories.json').then(JSON.parse),
  read('data/winter.json').then(JSON.parse),
  read('data/osm-roads.json').then(JSON.parse),
]);
if (roads.version!==1 || roads.classes?.join('|')!=='motorway|trunk|primary|secondary|tertiary|local' ||
    !roads.quantization || !roads.blockSize || roads.overview?.length!==6 || !Object.keys(roads.blocks??{}).length ||
    !Number.isFinite(Date.parse(roads.source?.timestamp))) {
  throw new Error('The OpenStreetMap road snapshot is missing a road class or source timestamp.');
}
const cityIds = new Set(atlas.cities.map(city => city.id));
const editorialIds = [...landmarks, ...stories].map(item => item.cityId);
const https = value => typeof value === 'string' && URL.canParse(value) && new URL(value).protocol === 'https:';
if (new Set(editorialIds).size !== editorialIds.length ||
    !landmarks.every(item => cityIds.has(item.cityId) && item.name && item.fact && https(item.source) &&
      https(item.coordinateSource) && item.xy?.length === 2 && item.xy.every(Number.isFinite)) ||
    !stories.every(item => cityIds.has(item.cityId) && item.title && item.fact && https(item.source)) ||
    !atlas.cities.every(city => city.kk && city.ru && /^\d{9}$/.test(city.kato) &&
      ['city','settlement','village'].includes(city.placeType)) ||
    new Set(atlas.cities.map(city=>city.kato)).size !== atlas.cities.length ||
    winter.hexes.length !== atlas.tiles.length ||
    !atlas.cities.every(city => winter.cities[city.id]?.length === 3)) {
  throw new Error('Place names, stories or winter data do not match the atlas snapshot.');
}
const majorCities=JSON.parse(await read('data/major-cities.json'));
const seats=atlas.cities.filter(city=>city.seat && city.id!==1521368); // Baikonur has a separate status.
const sites=new Set(atlas.sites.map(site=>site.id));
const plates=new Map(majorCities.map(plate=>[plate.cityId,plate]));
if (seats.length!==20 || majorCities.length!==seats.length || !seats.every(city=>{
  const plate=plates.get(city.id);
  return plate?.theme && landmarks.some(item=>item.cityId===city.id) && plate.sites.length &&
    plate.sites.every(id=>sites.has(id));
})) throw new Error('Each regional centre and republican city needs a landmark, a theme and mapped sites.');
// Use the same projected 110 km survey radius as the city map.
const distanceKm=(a,b)=>Math.hypot(a.xy[0]-b.xy[0],a.xy[1]-b.xy[1])*atlas.metersPerUnit/1000;
const landmarkIds=new Set(landmarks.map(landmark=>landmark.cityId));
const neighboringCities=[];
for (const city of atlas.cities) {
  if (city.placeType!=='city' || plates.has(city.id)) continue;
  const centre=seats.reduce((best,next)=>distanceKm(city,next)<distanceKm(city,best)?next:best);
  if (distanceKm(city,centre)>110) continue;
  if (!landmarkIds.has(city.id)) throw new Error(`Missing portrait landmark for ${city.name} (${city.id}).`);
  const nearby=atlas.sites.map(site=>({id:site.id,km:distanceKm(city,site)}))
    .filter(site=>site.km<=110).sort((a,b)=>a.km-b.km).slice(0,2);
  neighboringCities.push({cityId:city.id,centreId:centre.id,sites:nearby.map(site=>site.id)});
}
const inventory = translationInventory(template,javascript,atlas,[...landmarks,...stories]);
for (const plate of majorCities) inventory.set('city.theme.'+plate.cityId,plate.theme);
const locales = await readLocalizations(root,inventory);
const embeddedJSON = value => JSON.stringify(value).replaceAll('</','<\\/');
async function artwork(imageSource) {
  const seasonalPair=async base=>{
    const [image,winterImage]=await Promise.all([imageSource(base+'.webp'),imageSource(base+'-winter.webp')]);
    return {image,winterImage};
  };
  const [cityPlates, terrain, ground]=await Promise.all([
    Promise.all([...majorCities,...neighboringCities].map(async plate=>{
      const base='city-plates/'+plate.cityId;
      const result={...plate,...await seasonalPair(base)};
      // Saryagash's mineral springs are in Kokterek. Give the town its own settlement art.
      if (plate.cityId===1519673) result.settlement=await seasonalPair(base+'-town');
      return result;
    })),
    Promise.all([imageSource('terrain-relief.webp'),imageSource('winter-relief.webp')]),
    Promise.all([imageSource('ground-summer.webp'),imageSource('ground-winter.webp')]),
  ]);
  return {
    RELIEF: embeddedJSON({...relief,image:terrain[0],winter:terrain[1]}),
    MATERIALS: embeddedJSON({summer:ground[0],winter:ground[1]}),
    CITY_PLATES: embeddedJSON(cityPlates),
  };
}
const imageFiles=new Set();
const [hostedArtwork, standaloneArtwork]=await Promise.all([
  artwork(path=>{
    imageFiles.add(path);
    return '/assets/'+path;
  }),
  artwork(async path=>'data:image/webp;base64,'+(await readFile(new URL('src/assets/'+path,root))).toString('base64')),
]);
const values = {
  CSS: '/*\n'+fontLicense.trim()+'\n*/\n'+css.replace('__DISPLAY_FONT__', 'data:font/woff2;base64,'+font.toString('base64')),
  DATA: snapshot.trimEnd().replaceAll('</', '<\\/'),
  LANDMARKS: embeddedJSON(landmarks),
  STORIES: embeddedJSON(stories),
  WINTER: embeddedJSON(winter),
  ROAD_TIMESTAMP: new Date(roads.source.timestamp).toISOString(),
  LANGUAGES: embeddedJSON(locales),
  GA4: analyticsId,
  APP: javascript,
};
function renderDocument(locale, variants) {
  return localizeDocument(template,locale,locales)
    .replace(/__(CSS|DATA|RELIEF|LANDMARKS|CITY_PLATES|MATERIALS|STORIES|WINTER|ROADS|ROAD_TIMESTAMP|LANGUAGES|GA4|APP)__/g,
      (_, name) => variants[name] ?? values[name]);
}
await Promise.all(['en',...Object.keys(locales)].map(async locale=>{
  const directory=new URL(locale==='en'?'dist/':'dist/'+locale+'/',root);
  await mkdir(directory,{recursive:true});
  await writeFile(new URL('index.html',directory),renderDocument(locale,{...hostedArtwork,ROADS:''}));
}));
await mkdir(new URL('dist/assets/city-plates/',root),{recursive:true});
await Promise.all([
  writeFile(new URL('dist/standalone.html',root),renderDocument('en',{...standaloneArtwork,ROADS:embeddedJSON(roads)})),
  ...[...imageFiles].map(path=>copyFile(new URL('src/assets/'+path,root),new URL('dist/assets/'+path,root))),
  copyFile(new URL('src/assets/social-card.jpg',root),new URL('dist/social-card.jpg',root)),
  copyFile(new URL('data/osm-roads.json',root),new URL('dist/osm-roads.json',root)),
]);
