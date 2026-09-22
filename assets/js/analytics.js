/* Anonymous, first-party 한베커플 analytics. No form contents or full referrer URLs. */
(() => {
  if (!['hanviet.co.kr', 'www.hanviet.co.kr'].includes(location.hostname)) return;
  // Apply exclusion before creating a session or sending this page's first event.
  if (new URLSearchParams(location.search).get('tracking') === 'off') {
    try { localStorage.setItem('hanviet-analytics-opt-out', '1'); } catch {}
    return;
  }
  if (window.__hanvietAnalytics || navigator.doNotTrack === '1') return;
  window.__hanvietAnalytics = true;
  const uuid = () => crypto.randomUUID();
  let session;
  try {
    if (localStorage.getItem('hanviet-analytics-opt-out') === '1') return;
    session = JSON.parse(localStorage.getItem('hanviet-analytics-session') || 'null');
  } catch {}
  if (!session || typeof session.id !== 'string' || !Number.isFinite(session.time) || Date.now() - session.time > 1800000) {
    let referrer = '';
    try { referrer = new URL(document.referrer).hostname; } catch {}
    const params = new URLSearchParams(location.search);
    session = { id: uuid(), referrer: referrer === location.hostname ? '' : referrer,
      source: (params.get('utm_source') || '').slice(0, 100), campaign: (params.get('utm_campaign') || '').slice(0, 100), time: Date.now() };
  }
  const touch = () => { session.time = Date.now(); try { localStorage.setItem('hanviet-analytics-session', JSON.stringify(session)); } catch {} };
  touch();
  const send = (event) => {
    // Also respect exclusion enabled in another tab after this page was opened.
    try { if (localStorage.getItem('hanviet-analytics-opt-out') === '1') return; } catch {}
    if (Date.now() - session.time > 1800000) session = {id:uuid(),time:Date.now(),referrer:'',source:'',campaign:''};
    touch();
    if (!window.HANVIET_SUPABASE_URL || !window.HANVIET_SUPABASE_KEY) return;
    fetch(`${window.HANVIET_SUPABASE_URL}/rest/v1/rpc/hanviet_track_event`, {
      method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json', apikey: window.HANVIET_SUPABASE_KEY },
      body: JSON.stringify({ p_session: session.id, p_event: event, p_path: location.pathname.slice(0, 500),
        p_referrer: session.referrer, p_source: session.source, p_campaign: session.campaign,
        p_language: 'ko', p_device: matchMedia('(max-width: 767px)').matches ? 'mobile' : 'desktop' })
    }).catch(() => {});
  };
  function start() {
    send('pageview');
    document.addEventListener('click', e => {
      const link = e.target.closest?.('a[href]');
      if (link?.protocol === 'tel:') send('phone');
      if (link?.protocol === 'mailto:') send('email');
    });
    window.addEventListener('application:success', () => send('inquiry'));
  }
  if (window.HANVIET_SUPABASE_KEY) start();
  else {
    const config = document.createElement('script');
    config.src = '/assets/js/supabase-config.js'; config.onload = start;
    document.head.appendChild(config);
  }
})();
