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
const values = {
  CSS: css,
  DATA: snapshot.trimEnd().replaceAll('</', '<\\/'),
  APP: javascript,
};
const html = template.replace(/__(CSS|DATA|APP)__/g, (_, name) => values[name]);
await mkdir(new URL('dist/', root), { recursive: true });
await Promise.all([
  writeFile(new URL('dist/index.html', root), html),
  copyFile(new URL('src/assets/social-card.jpg', root), new URL('dist/social-card.jpg', root)),
]);
