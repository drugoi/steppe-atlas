const analyticsPanel = $('analytics-choice');
const measurementId = analyticsPanel.dataset.measurement;
const analyticsAvailable = measurementId && location.origin==='https://kazakhstan.drugoi.dev';
const analyticsKey = 'steppe-atlas-analytics-'+measurementId;
const atlasCookiePrefix = 'steppe_atlas';
let analyticsChoice = null;
let analyticsEnabled = false;

function atlasEvent(name, parameters={}) {
  if (analyticsEnabled) window.gtag('event', name, parameters);
}

function atlasAnalyticsLocation() {
  const url = new URL('/', location.origin);
  const query = new URLSearchParams(location.search);
  const launchCampaign = {utm_source:'threads', utm_medium:'social', utm_campaign:'steppe_atlas_launch'};
  for (const [name,value] of Object.entries(launchCampaign)) {
    if (query.get(name)===value) url.searchParams.set(name,value);
  }
  return url.href;
}

function setAtlasAnalytics(allow) {
  analyticsEnabled = allow;
  window['ga-disable-'+measurementId] = !allow;
  if (!allow) {
    try {
      for (const cookie of document.cookie.split(';')) {
        const name = cookie.split('=',1)[0].trim();
        if (!name.startsWith(atlasCookiePrefix+'_ga')) continue;
        const expired = name+'=; Max-Age=0; Path=/; Secure';
        document.cookie = expired;
        document.cookie = expired+'; Domain='+location.hostname;
      }
    } catch {
      // Collection remains disabled if the browser blocks cookie access.
    }
    return;
  }
  if (!window.gtag) {
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('consent','default',{
      analytics_storage:'denied', ad_storage:'denied', ad_user_data:'denied', ad_personalization:'denied',
    });
    window.gtag('consent','update',{analytics_storage:'granted'});
    window.gtag('js',new Date());
    window.gtag('config',measurementId,{
      allow_google_signals:false,
      allow_ad_personalization_signals:false,
      cookie_prefix:atlasCookiePrefix,
      cookie_domain:location.hostname,
      cookie_flags:'SameSite=Lax;Secure',
      page_location:atlasAnalyticsLocation(),
      page_referrer:document.referrer ? new URL(document.referrer).origin : '',
    });
    const tag = document.createElement('script');
    tag.async = true;
    tag.src = 'https://www.googletagmanager.com/gtag/js?id='+measurementId;
    document.head.append(tag);
  }
}

if (analyticsAvailable) {
  try {
    analyticsChoice = localStorage.getItem(analyticsKey);
  } catch {
    // The in-page choice is still respected when storage is unavailable.
  }
  const settings = $('analytics-settings');
  settings.hidden = false;
  settings.onclick = () => {
    $('credits').close();
    analyticsPanel.hidden = false;
    $(analyticsChoice==='allowed' ? 'analytics-decline' : 'analytics-allow').focus();
  };
  analyticsPanel.hidden = analyticsChoice==='allowed' || analyticsChoice==='declined';
  setAtlasAnalytics(analyticsChoice==='allowed');
  function saveAnalyticsChoice(allow) {
    analyticsChoice = allow ? 'allowed' : 'declined';
    try {
      localStorage.setItem(analyticsKey,analyticsChoice);
    } catch {
      // Retain the choice for this page.
    }
    setAtlasAnalytics(allow);
    analyticsPanel.hidden = true;
    $('announcement').textContent = allow ? 'Analytics allowed.' : 'Analytics declined.';
  }
  $('analytics-allow').onclick = () => saveAnalyticsChoice(true);
  $('analytics-decline').onclick = () => saveAnalyticsChoice(false);
}
