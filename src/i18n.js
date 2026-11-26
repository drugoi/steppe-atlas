'use strict';
const localeNames = {en:'English',kk:'Қазақша',ru:'Русский'};
const catalogs = JSON.parse(document.getElementById('locale-data').textContent);
const requestedLocale = new URL(location.href).searchParams.get('lang');
const locale = requestedLocale==='en' || Object.hasOwn(catalogs,requestedLocale) ? requestedLocale : document.documentElement.lang;
const messages = catalogs[locale] ?? {};
const substitute = (text, values) => text.replace(/\{([a-z][a-z0-9_]*)\}/gi,
  (token,key)=>Object.hasOwn(values,key) ? String(values[key]) : token);
const msg = (text,values={}) => substitute(messages[text] ?? text,values);
const contentMessage = (key,text) => messages[key] ?? text;
const placeName = place => place?.[locale] ?? place?.name;

document.documentElement.lang=locale;
for (const element of document.querySelectorAll('[data-message]')) {
  const links = [...element.children].map((link,index)=>[String(index+1),link]);
  const source=element.dataset.message || element.textContent;
  const message=msg(source);
  const parts=message.split(/(\{link[0-9]+\})/g);
  const linkByNumber=new Map(links);
  element.replaceChildren(...parts.map(part=>linkByNumber.get(part.match(/^\{link(\d+)\}$/)?.[1]) ?? part));
}
for (const element of document.querySelectorAll('[data-title], [data-aria-label], [data-placeholder], [data-content]')) {
  for (const attribute of ['title','aria-label','placeholder','content']) {
    if (element.hasAttribute('data-'+attribute)) element.setAttribute(attribute,msg(element.getAttribute(attribute)));
  }
}
document.title=msg(document.title);
if (locale==='ru') {
  const tagline=document.querySelector('.brand-country');
  tagline.lang=locale;
  tagline.textContent=msg("Kazakhstan");
}

const languagePicker=document.getElementById('language');
const availableLocales=Object.keys(localeNames).filter(id=>id==='en'||Object.hasOwn(catalogs,id));
if (availableLocales.length>1) {
  for (const id of availableLocales) {
    const option=new Option(localeNames[id],id,id===locale,id===locale);
    option.lang=id;
    languagePicker.append(option);
  }
  languagePicker.hidden=false;
  languagePicker.addEventListener('change',()=>{
    const url=new URL(location.href);
    if (url.protocol==='file:') url.searchParams.set('lang',languagePicker.value);
    else {
      url.pathname=languagePicker.value==='en' ? '/' : '/'+languagePicker.value+'/';
      url.searchParams.delete('lang');
    }
    location.assign(url);
  });
}
