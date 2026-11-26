import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { Script } from 'node:vm';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');
const [template, css, snapshot, ...scripts] = await Promise.all([
  'src/index.html', 'src/atlas.css', 'data/atlas-data.json',
  'src/app.js', 'src/map.js', 'src/cities.js', 'src/profile.js', 'src/analytics.js', 'src/startup.js',
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
const [relief, texture, font, fontLicense, landmarks, stories, winter] = await Promise.all([
  read('data/terrain-relief.json'),
  readFile(new URL('src/assets/terrain-relief.webp', root)),
  readFile(new URL('src/assets/crimson-pro-latin.woff2', root)),
  read('src/assets/crimson-pro-OFL.txt'),
  read('data/city-landmarks.json').then(JSON.parse),
  read('data/city-stories.json').then(JSON.parse),
  read('data/winter.json').then(JSON.parse),
]);
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
const embeddedJSON = value => JSON.stringify(value).replaceAll('</','<\\/');
const values = {
  CSS: '/*\n'+fontLicense.trim()+'\n*/\n'+css.replace('__DISPLAY_FONT__', 'data:font/woff2;base64,'+font.toString('base64')),
  DATA: snapshot.trimEnd().replaceAll('</', '<\\/'),
  RELIEF: JSON.stringify({...JSON.parse(relief), image:'data:image/webp;base64,'+texture.toString('base64')}),
  LANDMARKS: embeddedJSON(landmarks),
  STORIES: embeddedJSON(stories),
  WINTER: embeddedJSON(winter),
  GA4: analyticsId,
  APP: javascript,
};
const html = template.replace(/__(CSS|DATA|RELIEF|LANDMARKS|STORIES|WINTER|GA4|APP)__/g, (_, name) => values[name]);
await mkdir(new URL('dist/', root), { recursive: true });
await Promise.all([
  writeFile(new URL('dist/index.html', root), html),
  copyFile(new URL('src/assets/social-card.jpg', root), new URL('dist/social-card.jpg', root)),
]);
