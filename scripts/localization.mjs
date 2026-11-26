import { readFile } from 'node:fs/promises';

const supported = ['kk','ru'];
const decoded = value => value.replace(/&(amp|quot|lt|gt|#x27|#39);/g, (entity,name) =>
  ({amp:'&',quot:'"',lt:'<',gt:'>','#x27':"'",'#39':"'"}[name]));
const slots = text => [...new Set(text.match(/\{[a-z][a-z0-9_]*\}/gi))].sort().join();

export function translationInventory(template, javascript, atlas, stories) {
  const inventory = new Map();
  const include = (text,key=text) => inventory.set(key,text);
  for (const match of javascript.matchAll(/\b(?:msg|hmsg)\(\s*("(?:[^"\\]|\\.)*")/g)) {
    include(JSON.parse(match[1]));
  }
  for (const match of template.matchAll(/\bdata-message="([^"]+)"|\bdata-message>([^<]+)</g)) {
    include(decoded(match[1] ?? match[2]));
  }
  for (const match of template.matchAll(/\b(title|aria-label|placeholder|content)="([^"]+)" data-\1\b/g)) {
    include(decoded(match[2]));
  }
  include(decoded(template.match(/<title>([^<]+)<\/title>/)[1]));
  for (const [name] of atlas.labels) include(name,'geography.'+name);
  for (const site of atlas.sites) {
    include(site.name,'site.'+site.id+'.name');
    include(site.tag,'site.tag.'+site.tag);
  }
  for (const [id,name] of atlas.activities) include(name,'activity.'+id);
  for (const story of stories) {
    include(story.name ?? story.title,'story.'+story.cityId+'.title');
    include(story.fact,'story.'+story.cityId+'.fact');
  }
  return inventory;
}

export async function readLocalizations(root,inventory) {
  const catalogs = {};
  for (const locale of supported) {
    const file = new URL('locales/'+locale+'.json',root);
    const raw = await readFile(file,'utf8');
    const messages=JSON.parse(raw);
    const missing=[...inventory].filter(([key,text])=>
      typeof messages[key]!=='string' || !messages[key].trim() || slots(messages[key])!==slots(text));
    const stale=Object.keys(messages).filter(key=>!inventory.has(key));
    if (missing.length || stale.length) {
      throw new Error(locale+' catalogue has '+missing.length+' missing or invalid messages ('+
        missing.slice(0,8).map(([key])=>key).join(', ')+') and '+stale.length+' unused messages ('+stale.slice(0,8).join(', ')+').');
    }
    catalogs[locale]=messages;
  }
  return catalogs;
}

const encode = value => value.replace(/[&<>"]/g,character=>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[character]));

export function localizeDocument(template,locale,catalogs) {
  const base='https://kazakhstan.drugoi.dev/';
  const local=language=>base+(language==='en'?'':language+'/');
  const catalog=catalogs[locale] ?? {};
  const alternatives=['en',...supported,'x-default'].map(language=>
    '<link rel="alternate" hreflang="'+language+'" href="'+local(language==='x-default'?'en':language)+'">').join('\n');
  return template.replace('<html lang="en">','<html lang="'+locale+'">')
    .replace(/<title>([^<]+)<\/title>/, (_,title)=>'<title>'+encode(catalog[title] ?? title)+'</title>')
    .replace(/content="([^"]+)" data-content/g, (attribute,value)=>
      Object.hasOwn(catalog,decoded(value)) ? 'content="'+encode(catalog[decoded(value)])+'"' : attribute)
    .replace('<link rel="canonical" href="'+base+'">','<link rel="canonical" href="'+local(locale)+'">\n'+alternatives)
    .replace('property="og:url" content="'+base+'"','property="og:url" content="'+local(locale)+'"')
    .replace('<meta property="og:type" content="website">','<meta property="og:type" content="website">\n'+
      '<meta property="og:locale" content="'+({en:'en_US',kk:'kk_KZ',ru:'ru_KZ'}[locale])+'">');
}
