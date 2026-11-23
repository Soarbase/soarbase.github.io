// Soarbase website: phone menu, phone-aware download buttons, Premium waitlist.
(() => {
  // ---------------------------------------------------------------- phone menu
  const btn = document.querySelector('.menu-btn');
  const nav = document.getElementById('nav');
  const setOpen = (open) => {
    nav.classList.toggle('open', open);
    btn.setAttribute('aria-expanded', String(open));
  };
  btn.addEventListener('click', () => setOpen(!nav.classList.contains('open')));
  nav.addEventListener('click', (e) => { if (e.target.closest('a')) setOpen(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false); });

  // ---------------------------------------------------------------- phones
  // iPhone, iPad (which reports as Mac with touch), and Android (Samsung and others) can't run
  // the Windows .exe, so the download buttons open the phone version of Soarbase instead.
  const ua = navigator.userAgent;
  const isPhoneOrTablet = /iPhone|iPad|iPod|Android/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (isPhoneOrTablet) {
    document.documentElement.classList.add('is-mobile');
    document.querySelectorAll('.phone-note').forEach((p) => (p.hidden = false));
    document.querySelectorAll('a.dl').forEach((a) => {
      a.removeAttribute('download');
      a.setAttribute('href', 'app/');
      const label = a.querySelector('.dl-label');
      if (label) label.textContent = 'Open Soarbase on this phone';
      else a.textContent = 'Open Soarbase';
    });
  }

  // ---------------------------------------------------------------- Premium waitlist
  // Inserts into the Soarbase Supabase project. The publishable key is designed to be public;
  // the table only allows anonymous INSERT (no reading), enforced by Row Level Security.
  const SUPABASE_URL = 'https://oektxqatiuzwwpfhiqow.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_Jp7CQxMuRRAZ8G-MAEXTwA_LBfJzPxo';
  const form = document.querySelector('.waitlist');
  const msg = form.querySelector('.waitlist-msg');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = form.querySelector('input[type=email]');
    const email = input.value.trim();
    msg.className = 'waitlist-msg';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      msg.textContent = 'Please enter a valid email address.';
      msg.classList.add('bad');
      return;
    }
    const button = form.querySelector('button');
    button.disabled = true;
    msg.textContent = 'Adding you…';
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/premium_waitlist`, {
        method: 'POST',
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ email, source: 'website' }),
      });
      if (res.ok || res.status === 409) {
        msg.textContent = res.ok ? "You're on the list. We'll email you when Premium launches." : "You're already on the list.";
        msg.classList.add('good');
        input.value = '';
      } else {
        throw new Error(String(res.status));
      }
    } catch {
      msg.textContent = "Couldn't add you right now. Please try again in a moment.";
      msg.classList.add('bad');
    } finally {
      button.disabled = false;
    }
  });

  // ---------------------------------------------------------------- toast
  function toast(text) {
    let t = document.querySelector('.toast');
    if (!t) {
      t = document.createElement('div');
      t.className = 'toast';
      t.setAttribute('role', 'status');
      document.body.appendChild(t);
    }
    t.textContent = text;
    t.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.remove('show'), 3500);
  }
})();
