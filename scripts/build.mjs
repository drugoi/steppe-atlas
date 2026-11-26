import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { Script } from 'node:vm';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');
const [template, css, snapshot, ...scripts] = await Promise.all([
  'src/index.html', 'src/atlas.css', 'data/atlas-data.json',
  'src/app.js', 'src/map.js', 'src/profile.js', 'src/startup.js',
].map(read));

const atlas = JSON.parse(snapshot);
if (!atlas.tiles?.length || atlas.worldPop?.hexes?.length !== atlas.tiles.length ||
    !Object.values(atlas.regions ?? {}).length || !atlas.cities?.length) {
  throw new Error('The atlas snapshot is incomplete or its WorldPop hexes do not match the grid.');
}
const javascript = scripts.join('');
new Script(javascript, { filename: 'atlas.js' });
const [relief, texture, font, fontLicense] = await Promise.all([
  read('data/terrain-relief.json'),
  readFile(new URL('src/assets/terrain-relief.webp', root)),
  readFile(new URL('src/assets/crimson-pro-latin.woff2', root)),
  read('src/assets/crimson-pro-OFL.txt'),
]);
const values = {
  CSS: '/*\n'+fontLicense.trim()+'\n*/\n'+css.replace('__DISPLAY_FONT__', 'data:font/woff2;base64,'+font.toString('base64')),
  DATA: snapshot.trimEnd().replaceAll('</', '<\\/'),
  RELIEF: JSON.stringify({...JSON.parse(relief), image:'data:image/webp;base64,'+texture.toString('base64')}),
  APP: javascript,
};
const html = template.replace(/__(CSS|DATA|RELIEF|APP)__/g, (_, name) => values[name]);
await mkdir(new URL('dist/', root), { recursive: true });
await Promise.all([
  writeFile(new URL('dist/index.html', root), html),
  copyFile(new URL('src/assets/social-card.jpg', root), new URL('dist/social-card.jpg', root)),
]);
