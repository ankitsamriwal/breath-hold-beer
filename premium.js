// Hold My Beer - premium layer: auth, $5 unlock, glass/beer picker, attested leaderboard.
// Loaded as an ES module; fails silent if config or CDN is missing so the free game never breaks.

const SUPABASE_URL = 'https://sulcagggqawyhakkhonw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN1bGNhZ2dncWF3eWhha2tob253Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg5NjIyMTYsImV4cCI6MjEwNDUzODIxNn0.IqHPVY4KOcj99tcu4yPxqV7w-C4au-JGlprHqE-8u2w';
const PRICE = '$5';

const CONFIGURED = !SUPABASE_URL.includes('YOUR_PROJECT_REF');
let sb = null, session = null, profile = null, holdSessionId = null;

const $ = (id) => document.getElementById(id);
const modal = $('modal'), modalCard = $('modalCard');

function openModal(html){
  modalCard.innerHTML = html;
  modal.classList.add('on');
}
function closeModal(){ modal.classList.remove('on'); }
$('modalX').addEventListener('click', closeModal);
modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

function esc(s){ return String(s ?? '').replace(/[&<>"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

async function fn(name, body){
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${session?.access_token ?? SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(body ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
  return data;
}

async function refreshProfile(){
  if (!session) { profile = null; return; }
  const { data } = await sb.from('profiles').select('*').eq('id', session.user.id).single();
  profile = data;
}

function paintHeader(){
  const prem = $('premBtn'), auth = $('authLink');
  if (!CONFIGURED){ prem.style.display = 'none'; $('boardBtn').style.display = 'none'; auth.style.display = 'none'; return; }
  prem.textContent = profile?.paid ? 'Pro ✦' : 'Premium';
  auth.textContent = session ? `Sign out${profile?.display_name ? ' · ' + profile.display_name : ''}` : 'Sign in';
}

// ---------- flows ----------
function premiumModal(){
  if (!session){
    openModal(`
      <h2>Join the board</h2>
      <div class="sub">One email, one magic link. No password, nothing to remember.</div>
      <input class="field" id="emailField" type="email" placeholder="you@email.com" autocomplete="email" inputmode="email">
      <button class="btn primary" id="magicBtn" style="width:100%">Send magic link</button>
      <div class="sub" style="font-size:11px">Signing in is free. Premium (${PRICE} one-time) comes after, only if you want it.</div>
    `);
    const btn = $('magicBtn'), field = $('emailField');
    field.focus();
    btn.addEventListener('click', async () => {
      const email = field.value.trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){ field.style.borderColor = 'var(--red)'; return; }
      btn.disabled = true; btn.textContent = 'Sending…';
      try {
        const { error } = await sb.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: location.origin + location.pathname },
        });
        if (error) throw error;
        openModal(`
          <h2>Check your email</h2>
          <div class="sub">We sent a sign-in link to <b style="color:var(--cream)">${esc(email)}</b>. Open it on this device and you land back here, signed in.</div>
        `);
      } catch (e) {
        btn.disabled = false; btn.textContent = 'Try again';
      }
    });
    return;
  }
  if (!profile?.paid){
    openModal(`
      <h2>Premium pour</h2>
      <div class="price-line"><span class="amount">${PRICE}</span><span class="per">one-time, forever</span></div>
      <div class="perk">Choose your glass - mug, pint, stein or tulip.</div>
      <div class="perk">Choose your beer - lager, IPA, stout or wheat.</div>
      <div class="perk">Your holds go on the leaderboard, timed by our server - no fake pours.</div>
      <div class="perk">Friends can vouch for a hold they watched.</div>
      <label class="agecheck"><input type="checkbox" id="ageBox"><span>I am of legal drinking age where I live. This is a breath-hold game with a virtual pint - no alcohol is sold or served.</span></label>
      <button class="btn primary" id="buyBtn" style="width:100%" disabled>Unlock for ${PRICE}</button>
      <div class="sub" style="font-size:11px">Secure checkout by Dodo Payments. Instant unlock. No subscriptions, ever.</div>
    `);
    const box = $('ageBox'), btn = $('buyBtn');
    box.addEventListener('change', () => { btn.disabled = !box.checked; });
    btn.addEventListener('click', async () => {
      btn.disabled = true; btn.textContent = 'Opening checkout…';
      try {
        const { checkout_url } = await fn('create-checkout');
        location.href = checkout_url;
      } catch (e) {
        btn.disabled = false; btn.textContent = 'Try again';
      }
    });
    return;
  }
  pickerModal();
}

function pickerModal(){
  const style = JSON.parse(localStorage.getItem('hmb_style_v1') || '{}');
  let glass = style.glass || 'mug', beer = style.beer || 'lager';
  const glasses = [
    ['mug', 'Mug', 'The classic'],
    ['pint', 'Pint', 'Clean taper'],
    ['stein', 'Stein', 'Heavy ridges'],
    ['tulip', 'Tulip', 'Stem & foot'],
  ];
  const beers = [
    ['lager', 'Lager', 'Golden', '#f0a41f'],
    ['ipa', 'IPA', 'Deep copper', '#d97e1a'],
    ['stout', 'Stout', 'Near black', '#2a1508'],
    ['wheat', 'Wheat', 'Pale haze', '#efc24d'],
  ];
  openModal(`
    <h2>Your pour, your way</h2>
    <div class="sub">Glass</div>
    <div class="pick-grid" id="glassGrid">${glasses.map(([v, n, d]) =>
      `<button class="pick${v === glass ? ' on' : ''}" data-v="${v}"><div class="nm">${n}</div><div class="ds">${d}</div></button>`).join('')}
    </div>
    <div class="sub">Beer</div>
    <div class="pick-grid" id="beerGrid">${beers.map(([v, n, d, c]) =>
      `<button class="pick${v === beer ? ' on' : ''}" data-v="${v}"><div class="sw" style="background:linear-gradient(180deg,${c},#0a0906)"></div><div class="nm">${n}</div><div class="ds">${d}</div></button>`).join('')}
    </div>
    <div class="sub" style="font-size:11px">Applies instantly to your next pour.</div>
  `);
  $('glassGrid').addEventListener('click', (e) => {
    const b = e.target.closest('.pick'); if (!b) return;
    glass = b.dataset.v;
    $('glassGrid').querySelectorAll('.pick').forEach((x) => x.classList.toggle('on', x === b));
    window.HMB_SET_STYLE?.(glass, beer);
  });
  $('beerGrid').addEventListener('click', (e) => {
    const b = e.target.closest('.pick'); if (!b) return;
    beer = b.dataset.v;
    $('beerGrid').querySelectorAll('.pick').forEach((x) => x.classList.toggle('on', x === b));
    window.HMB_SET_STYLE?.(glass, beer);
  });
}

async function leaderboardModal(){
  openModal(`<h2>The board</h2><div class="lb-empty">Pouring…</div>`);
  const { data, error } = await sb.from('leaderboard').select('*');
  if (error || !data?.length){
    openModal(`<h2>The board</h2><div class="lb-empty">No pours yet.<br>The first name on this board is still up for grabs.</div>`);
    return;
  }
  const rows = data.map((r, i) => {
    const mine = session && r.user_id === session.user.id;
    const secs = (r.duration_ms / 1000).toFixed(1);
    const wit = Number(r.witness_count) > 0 ? ` · witnessed ×${r.witness_count}` : '';
    const btn = (session && profile?.paid && !mine)
      ? `<button class="lb-wit" data-id="${r.id}">I watched this</button>` : '';
    return `<div class="lb-row">
      <div class="lb-rank${i < 3 ? ' top' : ''}">${i + 1}</div>
      <div class="lb-main"><div class="lb-name">${esc(r.display_name)}</div>
      <div class="lb-meta">${esc(r.glass)} · ${esc(r.beer)}${wit}</div></div>
      <div class="lb-time">${secs}s</div>${btn}
    </div>`;
  }).join('');
  openModal(`
    <h2>The board</h2>
    <div class="sub">Every score here was timed by our server, not the player's phone.</div>
    <div>${rows}</div>
    <div class="sub" style="font-size:10.5px">Top scores are human-reviewed. Suspicious pours get pulled. Admins can hide any entry.</div>
  `);
  modalCard.querySelectorAll('.lb-wit').forEach((b) => b.addEventListener('click', async () => {
    b.disabled = true;
    try { await fn('witness', { score_id: b.dataset.id }); b.textContent = 'Witnessed ✓'; b.classList.add('seen'); }
    catch (e) { b.textContent = e.message.includes('own') ? 'Your own pour' : 'Not now'; }
  }));
}

function nameModal(){
  return new Promise((resolve) => {
    openModal(`
      <h2>Name your pour</h2>
      <div class="sub">The name the leaderboard shows. Keep it clean - it's public.</div>
      <input class="field" id="nameField" maxlength="24" placeholder="e.g. PintSized">
      <button class="btn primary" id="nameBtn" style="width:100%">That's me</button>
    `);
    const f = $('nameField'); f.focus();
    $('nameBtn').addEventListener('click', () => {
      const v = f.value.trim();
      if (v.length < 2){ f.style.borderColor = 'var(--red)'; return; }
      closeModal(); resolve(v);
    });
  });
}

// ---------- game hooks ----------
let holdStartPromise = null;
window.HMB = {
  async holdStart(){
    holdSessionId = null;
    if (!session || !profile?.paid) return;
    holdStartPromise = (async () => {
      try { const r = await fn('hold-start'); holdSessionId = r.session_id; } catch (e) { /* play on */ }
    })();
    await holdStartPromise;
  },
  async holdEnd(seconds){
    const extra = $('rExtra');
    if (!session || !profile?.paid){
      extra.innerHTML = session
        ? `Local score - <a href="#" id="rUpsell" style="color:var(--gold)">go premium</a> to put it on the board.`
        : `Local score - <a href="#" id="rUpsell" style="color:var(--gold)">sign in</a> to make it count.`;
      extra.querySelector('#rUpsell')?.addEventListener('click', (e) => { e.preventDefault(); premiumModal(); });
      return;
    }
    if (!holdSessionId && holdStartPromise){
      await Promise.race([holdStartPromise, new Promise((r) => setTimeout(r, 4000))]);
    }
    if (!holdSessionId){ extra.innerHTML = 'Could not attest this hold - go again to post it.'; return; }
    try {
      if (!profile?.display_name) profile.display_name = await nameModal();
      const style = JSON.parse(localStorage.getItem('hmb_style_v1') || '{}');
      const r = await fn('hold-end', {
        session_id: holdSessionId, display_name: profile.display_name,
        glass: style.glass || 'mug', beer: style.beer || 'lager',
      });
      holdSessionId = null;
      const { count } = await sb.from('leaderboard').select('id', { count: 'exact', head: true })
        .gt('duration_ms', r.duration_ms);
      extra.innerHTML = `<span class="attest">✓ server-attested</span><br>On the board${count != null ? ` - <b>#${count + 1}</b> of all pours` : ''}. <a href="#" id="rBoard" style="color:var(--gold)">See the board</a>`;
      extra.querySelector('#rBoard')?.addEventListener('click', (e) => { e.preventDefault(); leaderboardModal(); });
    } catch (e) {
      extra.innerHTML = esc(e.message || 'Could not post this score.');
    }
  },
};

// ---------- checkout return ----------
async function handleCheckoutReturn(){
  if (!new URLSearchParams(location.search).get('checkout')) return;
  history.replaceState(null, '', location.pathname);
  openModal(`<h2>Confirming your pour…</h2><div class="sub">The payment landed. Waiting for the till to ring - a few seconds.</div>`);
  for (let i = 0; i < 15; i++){
    await new Promise((r) => setTimeout(r, 2000));
    await refreshProfile();
    if (profile?.paid){
      paintHeader();
      if (!profile.display_name){ const n = await nameModal(); if (n) profile.display_name = n; }
      openModal(`<h2>You're in ✦</h2><div class="sub">Premium unlocked, forever. Pick your glass and your beer - your next pour counts.</div>
        <button class="btn primary" id="pickNow" style="width:100%">Choose my pour</button>`);
      $('pickNow').addEventListener('click', pickerModal);
      return;
    }
  }
  openModal(`<h2>Still pouring…</h2><div class="sub">Payment received but the unlock is taking longer than usual. It lands automatically - check back in a minute. If it doesn't, email the receipt to yourself and we'll make it right.</div>`);
}

// ---------- boot ----------
(async () => {
  if (!CONFIGURED){ paintHeader(); return; }
  try {
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
    sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data } = await sb.auth.getSession();
    session = data.session;
    await refreshProfile();
    sb.auth.onAuthStateChange(async (_e, s) => { session = s; await refreshProfile(); paintHeader(); });
    paintHeader();
    $('premBtn').addEventListener('click', premiumModal);
    $('boardBtn').addEventListener('click', leaderboardModal);
    $('authLink').addEventListener('click', async () => {
      if (session){ await sb.auth.signOut(); session = null; profile = null; paintHeader(); }
      else premiumModal();
    });
    handleCheckoutReturn();
  } catch (e) {
    paintHeader(); // premium UI hidden; free game unaffected
  }
})();

window.HMB_DEBUG = () => ({ paid: profile?.paid ?? null, signedIn: !!session, holdSessionId });
