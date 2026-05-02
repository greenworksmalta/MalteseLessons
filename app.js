/* =========================================================================
   Malti — multi-lesson Maltese learning app
   Six lessons, sectioned home, Duolingo-style exercises, Maltese audio
   on every word and sentence. Tuned for dyslexia/ADHD: short flows,
   big tap targets, instant feedback, one thing per screen.
   ========================================================================= */
(function(){
"use strict";

// Bumped whenever lesson JSONs / audio / overviews are updated, so the browser
// invalidates its cache for those assets. Add ?v=<VERSION> to fetch URLs.
const VERSION = "20260502q";
function v(url){ return url + (url.includes("?")?"&":"?") + "v=" + VERSION; }

// Lightweight UI strings table for the parts of the app that aren't data-driven.
// Keys are accessed via (I18N[State.lang] || I18N.en).<key>.
const I18N = {
  en: {
    done: "Done",
    sectionComplete: "Mela! Section complete.",
    brilliantWork: "Brilliant work!",
    xpEarned: "XP earned",
    totalXp: "Total XP",
    backToLesson: "Back to lesson",
    skip: "Skip →",
    next: "Next",
    nextArrow: "Next →",
    correct: "Sewwa!",
    notQuite: "Not quite.",
    correctIs: "Correct: ",
    checkForUpdates: "↻ Check for updates",
    updating: "Updating…",
    upToDate: "You're up to date",
    version: "Version",
    install: {
      title: "Add MaltiOnTheGo to your home screen",
      sub: "Faster to open, works offline, feels like a real app.",
      iosStep1: "Tap the Share button below ⬆️",
      iosStep2: "Choose 'Add to Home Screen'",
      androidStep1: "Tap the menu (⋮) above",
      androidStep2: "Choose 'Install app' or 'Add to Home screen'",
      maybeLater: "Maybe later",
      gotIt: "Got it",
    },
  },
  es: {
    done: "¡Listo!",
    sectionComplete: "¡Mela! Sección completa.",
    brilliantWork: "¡Buen trabajo!",
    xpEarned: "XP ganados",
    totalXp: "XP total",
    backToLesson: "Volver a la lección",
    skip: "Saltar →",
    next: "Siguiente",
    nextArrow: "Siguiente →",
    correct: "¡Sewwa!",
    notQuite: "No del todo.",
    correctIs: "Correcto: ",
    checkForUpdates: "↻ Buscar actualizaciones",
    updating: "Actualizando…",
    upToDate: "Estás al día",
    version: "Versión",
    install: {
      title: "Añade MaltiOnTheGo a tu pantalla de inicio",
      sub: "Se abre más rápido, funciona sin conexión y parece una app de verdad.",
      iosStep1: "Toca el botón Compartir abajo ⬆️",
      iosStep2: "Elige 'Añadir a la pantalla de inicio'",
      androidStep1: "Toca el menú (⋮) arriba",
      androidStep2: "Elige 'Instalar app' o 'Añadir a la pantalla de inicio'",
      maybeLater: "Quizás más tarde",
      gotIt: "Entendido",
    },
  },
};

// ── State ─────────────────────────────────────
const State = {
  index: null,           // {lessons:[...]}
  lessons: {},           // {<lid>:<lang>: {...}} keyed by lesson id + language
  overviews: {},         // {<lid>:<lang>: {transcript:[...]}}
  manifest: null,        // {mt: filename}
  progress: load("progress") || {},   // {lessonId: {sectionId: pct}}
  xp: load("xp") || 0,
  lang: load("preferred_lang") || "en",  // global language preference
};
function save(k,v){ try{localStorage.setItem("malti."+k, JSON.stringify(v));}catch(e){} }
function load(k){ try{const v=localStorage.getItem("malti."+k);return v?JSON.parse(v):null;}catch(e){return null;} }
// Resolve the cached lesson in the current language, falling back to English.
function currentLesson(lid){
  return State.lessons[lid + ":" + State.lang] || State.lessons[lid + ":en"] || State.lessons[lid];
}
function lessonProgress(lid){
  const p = State.progress[lid] || {};
  const lesson = currentLesson(lid);
  if(!lesson) return 0;
  const ids = lesson.sections.map(s=>s.id);
  if(!ids.length) return 0;
  const total = ids.reduce((a,id)=>a+(p[id]||0),0);
  return Math.round(total/ids.length);
}
function setSectionProgress(lid,sid,pct){
  if(!State.progress[lid]) State.progress[lid] = {};
  State.progress[lid][sid] = Math.max(State.progress[lid][sid]||0, Math.min(100, Math.round(pct)));
  save("progress", State.progress);
}
function addXp(n){ State.xp += n; save("xp", State.xp); }

// ── DOM helpers ───────────────────────────────
function el(tag, cls, txt){
  const e = document.createElement(tag);
  if(cls) e.className = cls;
  if(txt!==undefined) e.textContent = txt;
  return e;
}
const $app = () => document.getElementById("app");

// ── Audio ─────────────────────────────────────
const player = document.getElementById("player");
let currentBtn = null;
function play(mt){
  if(!mt) return;
  const file = State.manifest && State.manifest[mt];
  if(!file){ console.warn("No audio for:", mt); return; }
  if(currentBtn){ currentBtn.classList.remove("playing"); currentBtn=null; }
  try{
    player.pause();
    player.src = v("audio/"+file);
    player.currentTime = 0;
    const p = player.play();
    if(p && p.catch) p.catch(e=>console.warn("play failed", e));
  }catch(e){ console.warn(e); }
}
function playBtn(btn, mt){
  play(mt);
  if(currentBtn) currentBtn.classList.remove("playing");
  currentBtn = btn;
  btn.classList.add("playing");
}
player.addEventListener("ended", ()=>{ if(currentBtn){ currentBtn.classList.remove("playing"); currentBtn=null; } });
function audioBtn(mt, opts){
  opts = opts || {};
  const b = el("button", "audio-btn"+(opts.size?" "+opts.size:""), opts.label||"🔊");
  b.setAttribute("aria-label","Play "+mt);
  b.addEventListener("click", e=>{ e.stopPropagation(); playBtn(b, mt); });
  return b;
}

// ── Force update (clears SW + caches and reloads) ────
// Critical for PWAs saved to the home screen, where Safari/Chrome aggressively
// cache the bundle and the user has no easy way to refresh.
async function forceUpdate(button){
  const t = I18N[State.lang] || I18N.en;
  if(button){ button.textContent = t.updating; button.disabled = true; }
  try {
    if("serviceWorker" in navigator){
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
    }
    if("caches" in window){
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
  } catch(e){ console.warn("Update failed", e); }
  // Hard reload — bypass http cache. The query param ensures the HTML itself
  // is fetched fresh; the SW registration above means the next load builds
  // the cache from scratch with the new content.
  location.replace(location.pathname + "?u=" + Date.now() + location.hash);
}

// ── Install prompt ────────────────────────────
// Shown once per browser (until dismissed) to explain how to add the PWA to
// the home screen. iOS Safari needs manual instructions; Android Chrome can
// use beforeinstallprompt for a native dialog.
let deferredInstallPrompt = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  // Don't show immediately on first load — wait for user engagement.
  setTimeout(() => maybeShowInstallPrompt(), 4000);
});

function isStandalone(){
  return window.matchMedia && window.matchMedia("(display-mode: standalone)").matches
    || window.navigator.standalone === true;
}
function isIOS(){
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}
function isAndroid(){
  return /Android/.test(navigator.userAgent);
}

function maybeShowInstallPrompt(){
  if(isStandalone()) return;                         // already installed
  if(load("install_dismissed_at")) {
    // Suppress for 14 days after dismissal
    const since = Date.now() - load("install_dismissed_at");
    if(since < 14 * 24 * 60 * 60 * 1000) return;
  }
  showInstallPrompt();
}

function showInstallPrompt(){
  const t = (I18N[State.lang] || I18N.en).install;
  const el2 = document.getElementById("install-prompt");
  el2.innerHTML = "";

  const closeB = el("button","close","×");
  closeB.setAttribute("aria-label","Close");
  closeB.addEventListener("click", dismissInstallPrompt);
  el2.appendChild(closeB);

  el2.appendChild(el("h3","",t.title));
  el2.appendChild(el("p","",t.sub));

  const steps = [];
  if(isIOS()){
    steps.push([" 📤", t.iosStep1]);
    steps.push(["➕", t.iosStep2]);
  } else if(isAndroid() && deferredInstallPrompt){
    // Native install will be triggered by the primary button
  } else {
    steps.push(["⋮", t.androidStep1]);
    steps.push(["➕", t.androidStep2]);
  }
  steps.forEach(([ic, txt])=>{
    const r = el("div","row");
    const ico = el("div","icon-step", ic);
    const tx = el("div","step-text", txt);
    r.appendChild(ico); r.appendChild(tx);
    el2.appendChild(r);
  });

  const actions = el("div","actions");
  const later = el("button","",t.maybeLater);
  later.addEventListener("click", dismissInstallPrompt);
  actions.appendChild(later);

  if(deferredInstallPrompt){
    const installB = el("button","primary",t.gotIt);
    installB.addEventListener("click", async ()=>{
      try {
        deferredInstallPrompt.prompt();
        await deferredInstallPrompt.userChoice;
      } catch(e){}
      deferredInstallPrompt = null;
      dismissInstallPrompt();
    });
    actions.appendChild(installB);
  } else {
    const okB = el("button","primary",t.gotIt);
    okB.addEventListener("click", dismissInstallPrompt);
    actions.appendChild(okB);
  }
  el2.appendChild(actions);
  el2.classList.add("show");
  el2.setAttribute("aria-hidden","false");
}

function dismissInstallPrompt(){
  const el2 = document.getElementById("install-prompt");
  el2.classList.remove("show");
  el2.setAttribute("aria-hidden","true");
  save("install_dismissed_at", Date.now());
}

// ── Routing ───────────────────────────────────
function go(hash){ location.hash = hash; }
window.addEventListener("hashchange", route);

function route(){
  hideFeedback();
  const h = location.hash.replace(/^#\/?/, "") || "home";
  const parts = h.split("/").filter(Boolean);
  if(parts[0]==="home" || !parts.length) return renderHome();
  if(parts[0]==="lesson"){
    const lid = parts[1];
    if(!lid) return renderHome();
    return loadLesson(lid).then(()=>{
      if(parts[2]==="overview") return renderOverview(lid, parts[3] || "en");
      if(parts[2]==="section") return renderSection(lid, parts[3], parts[4]||"intro", parseInt(parts[5]||"0",10));
      return renderLessonHome(lid);
    }).catch(e=>{
      $app().innerHTML = "<p>Could not load lesson. Refresh and try again.</p><p class='muted'>"+(e.message||e)+"</p>";
    });
  }
  return renderHome();
}

async function loadLesson(lid, lang){
  lang = lang || State.lang || "en";
  const cacheKey = lid + ":" + lang;
  if(State.lessons[cacheKey]) return State.lessons[cacheKey];
  // For non-English, try the language-specific file first; fall back to English silently.
  if(lang !== "en"){
    try {
      const r = await fetch(v("lessons/" + lid + "." + lang + ".json"));
      if(r.ok){
        const data = await r.json();
        State.lessons[cacheKey] = data;
        return data;
      }
    } catch(e){ /* fall through to English */ }
  }
  const r = await fetch(v("lessons/" + lid + ".json"));
  if(!r.ok) throw new Error("Missing lesson: " + lid);
  const data = await r.json();
  State.lessons[lid + ":en"] = data;
  if(lang !== "en") State.lessons[cacheKey] = data; // mark Spanish lookup as fallback to English so we don't refetch
  return data;
}
async function loadOverview(lid, lang){
  lang = lang || "en";
  const cacheKey = lid + ":" + lang;
  if(State.overviews[cacheKey]) return State.overviews[cacheKey];
  // English uses the bare filename; other languages use lid.<lang>.json
  const filename = lang === "en" ? lid + ".json" : lid + "." + lang + ".json";
  const r = await fetch(v("lessons/overviews/" + filename));
  if(!r.ok) throw new Error("Missing overview: " + lid + " (" + lang + ")");
  const data = await r.json();
  State.overviews[cacheKey] = data;
  return data;
}

// ── Top bar / feedback ────────────────────────
function topbar(title, backHash){
  const bar = el("div","topbar");
  const back = el("button","back", backHash ? "←" : "");
  back.setAttribute("aria-label","Back");
  if(backHash){ back.addEventListener("click", ()=>go(backHash)); }
  else { back.style.visibility="hidden"; }
  bar.appendChild(back);
  bar.appendChild(el("div","title", title || "MaltiOnTheGo"));
  bar.appendChild(el("div","xp", "⭐ "+State.xp));
  return bar;
}
function progressBar(pct){
  const wrap = el("div","progress");
  const fill = el("div");
  fill.style.width = (pct||0)+"%";
  wrap.appendChild(fill);
  return wrap;
}

const $fb = () => document.getElementById("feedback");
function showFeedback(good, title, detail, onNext){
  const fb = $fb();
  fb.className = "feedback show "+(good?"good":"bad");
  fb.innerHTML = "";
  const row = el("div","row");
  const txt = el("div","");
  txt.appendChild(el("h3","",title));
  if(detail){ txt.appendChild(el("p","",detail)); }
  row.appendChild(txt);
  const nx = el("button","next","Next →");
  nx.addEventListener("click", ()=>{ hideFeedback(); onNext&&onNext(); });
  row.appendChild(nx);
  fb.appendChild(row);
}
function hideFeedback(){ $fb().classList.remove("show","good","bad"); }

// ── Home (all lessons) ────────────────────────
function renderHome(){
  const root = $app();
  root.innerHTML = "";
  root.appendChild(topbar("MaltiOnTheGo", null));

  // Branded splash hero — uses the generated splash.png so the wordmark + balcony
  // illustration hits the user the moment they open the app.
  const heroSplash = el("div","hero-branded");
  const img = document.createElement("img");
  img.src = v("splash.png");
  img.alt = "MaltiOnTheGo — Maltese for life and work in Malta";
  heroSplash.appendChild(img);
  root.appendChild(heroSplash);

  // Welcome card under the splash — calm cream gradient with navy headline
  // and a red accent. Pulls from the logo's full palette without dominating.
  const hero = el("div","hero-welcome");
  hero.appendChild(el("span","eyebrow","Merħba 👋  Welcome"));
  hero.appendChild(el("h1","","Settle in faster."));
  hero.appendChild(el("p","","Real Maltese for the café, the bus, the office, and your new neighbours. Three minutes a lesson, native audio, no fluff. Start with the free Welcome Lesson below 👇"));
  hero.appendChild(el("span","accent-bar"));
  root.appendChild(hero);

  // Group by module — numeric modules ("1", "2", "3") render as "Module N",
  // non-numeric ones ("Extras") render under their own label.
  const byMod = {};
  for(const L of State.index.lessons){
    (byMod[L.module] = byMod[L.module] || []).push(L);
  }
  // Sort: free / starter group first (so newcomers see it on top), then numeric
  // modules in order, then any other non-numeric groups alphabetically.
  const isStarter = (k) => /free|start here/i.test(String(k));
  const modKeys = Object.keys(byMod).sort((a, b) => {
    if(isStarter(a) && !isStarter(b)) return -1;
    if(!isStarter(a) && isStarter(b)) return 1;
    const an = parseInt(a), bn = parseInt(b);
    const aNum = !isNaN(an), bNum = !isNaN(bn);
    if(aNum && bNum) return an - bn;
    if(aNum && !bNum) return -1;
    if(!aNum && bNum) return 1;
    return String(a).localeCompare(String(b));
  });
  modKeys.forEach(mod=>{
    const isNumeric = !isNaN(parseInt(mod));
    const label = isNumeric ? "Module "+mod : String(mod);
    root.appendChild(el("div","module-label",label));
    const list = el("div","section-list");
    for(const L of byMod[mod]){
      const card = el("button","section-card" + (L.free ? " is-free" : ""));
      const ic = el("div","icon"); ic.textContent = L.icon || "📘";
      const meta = el("div","meta");
      // Title row carries an optional FREE pill so the free starter is visually marked.
      const titleRow = el("div","title-row");
      titleRow.appendChild(el("strong","", L.title));
      if(L.free){
        const badge = el("span","badge-free","FREE");
        titleRow.appendChild(badge);
      }
      meta.appendChild(titleRow);
      meta.appendChild(el("span","", L.subtitle));
      // progress (cached if lesson loaded; otherwise unknown)
      const pct = lessonProgress(L.id);
      const bw = el("div","barwrap"); const bf = el("div"); bf.style.width = pct+"%"; bw.appendChild(bf);
      meta.appendChild(bw);
      meta.appendChild(el("span","pct", pct>=100 ? "✓ Done" : (pct>0 ? pct+"%" : "Start")));
      const chev = el("div","chev","›");
      card.appendChild(ic); card.appendChild(meta); card.appendChild(chev);
      card.addEventListener("click", ()=>go("/lesson/"+L.id));
      list.appendChild(card);
    }
    root.appendChild(list);
  });

  // Footer with manual update + version display.
  const t = I18N[State.lang] || I18N.en;
  const footer = el("div","app-footer");
  const updBtn = el("button","update", t.checkForUpdates);
  updBtn.addEventListener("click", () => forceUpdate(updBtn));
  footer.appendChild(updBtn);
  footer.appendChild(el("span","ver", t.version + " " + VERSION));
  root.appendChild(footer);
}

// ── Lesson home (sections) ────────────────────
function renderLessonHome(lid){
  const lesson = currentLesson(lid);
  const root = $app();
  root.innerHTML = "";
  root.appendChild(topbar(lesson.title, "/home"));

  const hero = el("div","hero");
  hero.appendChild(el("h1","",lesson.title));
  hero.appendChild(el("p","",lesson.subtitle));
  root.appendChild(hero);

  // Language toggle — appears whenever the lesson supports more than one language.
  const lessonMeta = (State.index.lessons || []).find(l => l.id === lid) || {};
  const availableLangs = lessonMeta.languages || ["en"];
  if(availableLangs.length > 1){
    const labels = {en: "🇬🇧 English", es: "🇪🇸 Español"};
    const langWrap = el("div","lang-toggle");
    availableLangs.forEach(L => {
      const b = el("button","lang-btn"+(L === State.lang ? " active" : ""), labels[L] || L.toUpperCase());
      b.addEventListener("click", async ()=>{
        if(L === State.lang) return;
        State.lang = L;
        save("preferred_lang", L);
        // Pre-load the lesson in the new language so re-render reads from cache
        try { await loadLesson(lid, L); } catch(e){}
        renderLessonHome(lid);
      });
      langWrap.appendChild(b);
    });
    root.appendChild(langWrap);
  }

  root.appendChild(progressBar(lessonProgress(lid)));

  // Overview card — always shown first
  const oc = el("button","overview-card");
  const oi = el("div","icon"); oi.textContent = "🎧";
  const om = el("div","meta");
  om.appendChild(el("strong","","Overview"));
  om.appendChild(el("span","","Listen to the lesson explained in English"));
  const ochev = el("div","chev","›");
  oc.appendChild(oi); oc.appendChild(om); oc.appendChild(ochev);
  oc.addEventListener("click", ()=>go("/lesson/"+lid+"/overview"));
  root.appendChild(oc);

  const list = el("div","section-list");
  for(const sec of lesson.sections){
    const card = el("button","section-card");
    const pct = (State.progress[lid]||{})[sec.id]||0;
    if(pct>=100) card.classList.add("done");
    const ic = el("div","icon"); ic.textContent = sec.icon || "📘";
    const meta = el("div","meta");
    meta.appendChild(el("strong","",sec.title));
    meta.appendChild(el("span","",sec.subtitle||""));
    const bw = el("div","barwrap"); const bf = el("div"); bf.style.width = pct+"%"; bw.appendChild(bf);
    meta.appendChild(bw);
    meta.appendChild(el("span","pct", pct>=100 ? "✓ Done" : (pct>0 ? pct+"%" : "Start")));
    const chev = el("div","chev","›");
    card.appendChild(ic); card.appendChild(meta); card.appendChild(chev);
    card.addEventListener("click", ()=>go("/lesson/"+lid+"/section/"+sec.id));
    list.appendChild(card);
  }
  root.appendChild(list);
}

// ── Overview helpers ──────────────────────────
// Convert inline markdown-ish **word** to highlighted span. Escapes everything else.
function renderInline(text){
  if(!text) return "";
  // Escape HTML
  const esc = String(text)
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  // Replace **word** with <span class="hl">word</span>
  return esc.replace(/\*\*([^*]+?)\*\*/g, '<span class="hl">$1</span>');
}

// ── Overview / podcast player ─────────────────
async function renderOverview(lid, lang){
  lang = lang || "en";
  const root = $app();
  root.innerHTML = "";
  root.appendChild(topbar("Overview", "/lesson/"+lid));

  let ov;
  try { ov = await loadOverview(lid, lang); }
  catch(e){
    // Fall back to English if the requested language doesn't exist
    if(lang !== "en"){
      try { ov = await loadOverview(lid, "en"); lang = "en"; }
      catch(e2){
        root.appendChild(el("p","muted","Could not load this overview. Refresh and try again."));
        return;
      }
    } else {
      root.appendChild(el("p","muted","Could not load this overview. Refresh and try again."));
      return;
    }
  }
  const lesson = currentLesson(lid);
  // Discover available languages from the index entry; default to ["en"]
  const lessonMeta = (State.index.lessons || []).find(l => l.id === lid) || {};
  const availableLangs = lessonMeta.languages || ["en"];

  // Stop other audio
  if(currentBtn){ currentBtn.classList.remove("playing"); currentBtn=null; }
  player.pause();

  // Hero
  const hero = el("div","hero");
  hero.appendChild(el("div","sub","Listen as you go"));
  hero.appendChild(el("h1","",ov.title || (lesson.title+" — Overview")));
  hero.appendChild(el("p","",ov.subtitle || "An English-narrated walk-through with Maltese examples."));
  root.appendChild(hero);

  // Language toggle (only shown when the lesson has more than one language)
  if(availableLangs.length > 1){
    const langWrap = el("div","lang-toggle");
    const labels = {en: "🇬🇧 English", es: "🇪🇸 Español"};
    availableLangs.forEach(L=>{
      const b = el("button","lang-btn"+(L===lang?" active":""), labels[L] || L.toUpperCase());
      b.addEventListener("click", ()=>{
        if(L === lang) return;
        // Save preference globally + re-render at the requested language
        State.lang = L;
        save("preferred_lang", L);
        go("/lesson/"+lid+"/overview/"+L);
      });
      langWrap.appendChild(b);
    });
    root.appendChild(langWrap);
  }

  // Build segment timing estimates from char counts
  const segs = ov.transcript.filter(s => s && (s.en || s.mt));
  const totalChars = segs.reduce((a,s) => a + (s.en||s.mt||"").length + 6, 0);
  // We'll set real durations once metadata loads.

  // Audio element (separate from the small mt clip player)
  const audioFile = lang === "en" ? "narration_"+lid+".mp3" : "narration_"+lid+"_"+lang+".mp3";
  const audio = new Audio(v("audio/"+audioFile));
  audio.preload = "metadata";
  audio.playbackRate = parseFloat(load("speed_"+lid) || "1") || 1;

  // Player widget
  const pl = el("div","player");
  const ctrls = el("div","controls");
  const back15 = el("button","skip","-15");
  back15.setAttribute("aria-label","Back 15 seconds");
  const playB = el("button","play-big","▶");
  playB.setAttribute("aria-label","Play / Pause");
  const fwd15 = el("button","skip","+15");
  fwd15.setAttribute("aria-label","Forward 15 seconds");
  const meta = el("div","meta");
  meta.appendChild(el("div","t", ov.title || (lesson.title+" — Overview")));
  const subTime = el("div","s","loading…");
  meta.appendChild(subTime);
  ctrls.appendChild(back15); ctrls.appendChild(playB); ctrls.appendChild(fwd15); ctrls.appendChild(meta);
  pl.appendChild(ctrls);

  const bar = el("div","bar");
  const range = document.createElement("input");
  range.type = "range"; range.min = 0; range.max = 1000; range.value = 0; range.step = 1;
  range.setAttribute("aria-label","Seek");
  const tEl = el("div","time","0:00");
  bar.appendChild(tEl);
  bar.appendChild(range);
  const dEl = el("div","time","--:--");
  bar.appendChild(dEl);
  pl.appendChild(bar);

  // Track whether the user is actively dragging the slider, so timeupdate
  // doesn't snap the thumb back while they're moving it.
  let isSeeking = false;
  const startSeek = ()=>{ isSeeking = true; };
  const commitSeek = ()=>{
    if(audio.duration>0) audio.currentTime = (range.value/1000) * audio.duration;
    isSeeking = false;
  };
  range.addEventListener("pointerdown", startSeek);
  range.addEventListener("touchstart", startSeek, {passive:true});
  range.addEventListener("input", ()=>{
    // Live-preview the time label while dragging
    if(audio.duration>0) tEl.textContent = fmt((range.value/1000) * audio.duration);
  });
  range.addEventListener("change", commitSeek);
  range.addEventListener("pointerup", commitSeek);
  range.addEventListener("touchend", commitSeek);
  range.addEventListener("pointercancel", ()=>{ isSeeking = false; });

  const speedRow = el("div","speed");
  [0.85, 1.0, 1.15, 1.3].forEach(rate=>{
    const b = el("button","", rate.toFixed(2).replace(/\.?0+$/,"")+"×");
    if(Math.abs(audio.playbackRate - rate) < 0.01) b.classList.add("active");
    b.addEventListener("click", ()=>{
      audio.playbackRate = rate; save("speed_"+lid, String(rate));
      [...speedRow.children].forEach(x=>x.classList.remove("active"));
      b.classList.add("active");
    });
    speedRow.appendChild(b);
  });
  pl.appendChild(speedRow);
  root.appendChild(pl);

  // Chapter jump bar — derived from "header" segments. Sits below the player so
  // the listener can leap straight to a section without dragging the scrubber.
  const headerIdxs = [];
  segs.forEach((s, i) => { if (s.kind === "header") headerIdxs.push(i); });
  const chWrap = el("div","chapters");
  const chButtons = [];
  if(headerIdxs.length > 1){
    chWrap.appendChild(el("div","label","Jump to a section"));
    headerIdxs.forEach(i=>{
      const text = (segs[i].en || segs[i].mt || "").replace(/[^\p{L}\p{N} —&-]/gu," ").replace(/\s+/g," ").trim();
      const b = el("button","ch");
      const tt = el("span","tt", text.length>32 ? text.slice(0,32)+"…" : text);
      b.appendChild(tt);
      const tspan = el("span","t","");
      b.appendChild(tspan);
      b.addEventListener("click", ()=>{
        if(!segTimes[i]) return;
        audio.currentTime = segTimes[i].start;
        audio.play().catch(()=>{});
        // scroll the active segment into view
        if(segEls[i]){
          setTimeout(()=>segEls[i].scrollIntoView({behavior:"smooth", block:"center"}), 80);
        }
      });
      chWrap.appendChild(b);
      chButtons.push({segIdx: i, btn: b, timeEl: tspan});
    });
    root.appendChild(chWrap);
  }

  // Transcript — support kind classes (header, rule, key, tip, warn, fact, win)
  // and inline **word** → highlighted span.
  const tr = el("div","transcript");
  const segEls = segs.map(s => {
    const lang = s.en ? "en" : "mt";
    const kind = s.kind ? " "+s.kind : "";
    const e = el("div","seg "+lang+kind);
    e.innerHTML = renderInline(s.en || s.mt);
    tr.appendChild(e);
    return e;
  });
  root.appendChild(tr);

  // Click any segment to seek to its estimated time
  let segTimes = []; // [{start, end}] per segment, set on metadata load

  function recomputeTimes(){
    const dur = audio.duration;
    if(!dur || !isFinite(dur) || dur<=0) return;
    let t = 0;
    segTimes = segs.map(s=>{
      const len = (s.en||s.mt||"").length + 6;
      const slice = (len / totalChars) * dur;
      const start = t; const end = t + slice;
      t = end;
      return {start, end};
    });
  }

  function fmt(sec){
    if(!isFinite(sec) || sec<0) sec = 0;
    const m = Math.floor(sec/60), s = Math.floor(sec%60);
    return m+":"+(s<10?"0"+s:s);
  }

  audio.addEventListener("loadedmetadata", ()=>{
    recomputeTimes();
    dEl.textContent = fmt(audio.duration);
    subTime.textContent = "Duration "+fmt(audio.duration);
    // Fill in chapter time stamps now that we know durations
    chButtons.forEach(c=>{
      if(segTimes[c.segIdx]) c.timeEl.textContent = " · "+fmt(segTimes[c.segIdx].start);
    });
  });

  function updateChapterActive(idx){
    if(!chButtons.length) return;
    // Find the most recent header at or before idx
    let activeChapter = -1;
    chButtons.forEach((c, ci) => { if(c.segIdx <= idx) activeChapter = ci; });
    chButtons.forEach((c, ci)=>{
      c.btn.classList.toggle("active", ci===activeChapter);
    });
  }

  let lastIdx = -1;
  audio.addEventListener("timeupdate", ()=>{
    // While the user is dragging the scrubber, don't fight them by overwriting it
    if(!isSeeking && audio.duration>0){
      range.value = Math.round((audio.currentTime/audio.duration)*1000);
      tEl.textContent = fmt(audio.currentTime);
    }
    if(!segTimes.length) return;
    const t = audio.currentTime;
    let idx = segTimes.findIndex(r => t >= r.start && t < r.end);
    if(idx === -1 && t >= segTimes[segTimes.length-1].end) idx = segTimes.length-1;
    if(idx !== lastIdx && idx>=0){
      if(lastIdx>=0) segEls[lastIdx].classList.remove("active");
      segEls[idx].classList.add("active");
      for(let i=0;i<idx;i++) segEls[i].classList.add("played");
      // mark later segments as un-played in case the user scrubbed backwards
      for(let i=idx+1;i<segEls.length;i++) segEls[i].classList.remove("played");
      const rect = segEls[idx].getBoundingClientRect();
      if(rect.top < 200 || rect.bottom > window.innerHeight - 80){
        segEls[idx].scrollIntoView({behavior:"smooth", block:"center"});
      }
      updateChapterActive(idx);
      lastIdx = idx;
    }
  });
  // Also update on seeked (when the user drops the scrubber) so the highlight follows immediately
  audio.addEventListener("seeked", ()=>{
    if(!segTimes.length) return;
    const t = audio.currentTime;
    let idx = segTimes.findIndex(r => t >= r.start && t < r.end);
    if(idx === -1) idx = 0;
    if(lastIdx>=0) segEls[lastIdx].classList.remove("active");
    segEls[idx].classList.add("active");
    for(let i=0;i<segEls.length;i++) segEls[i].classList.toggle("played", i<idx);
    updateChapterActive(idx);
    lastIdx = idx;
  });

  audio.addEventListener("play", ()=>{ playB.textContent = "❚❚"; });
  audio.addEventListener("pause", ()=>{ playB.textContent = "▶"; });
  audio.addEventListener("ended", ()=>{
    playB.textContent = "▶";
    setSectionProgress(lid, "_overview", 100);
    addXp(15);
    showFeedback(true,"Done!", "Overview finished. +15 XP", ()=>{});
  });

  playB.addEventListener("click", ()=>{
    if(audio.paused) audio.play().catch(e=>console.warn(e));
    else audio.pause();
  });
  back15.addEventListener("click", ()=>{ audio.currentTime = Math.max(0, audio.currentTime - 15); });
  fwd15.addEventListener("click", ()=>{ audio.currentTime = Math.min(audio.duration||0, audio.currentTime + 15); });

  segEls.forEach((e, i)=>{
    e.addEventListener("click", ()=>{
      if(!segTimes[i]) return;
      audio.currentTime = segTimes[i].start;
      audio.play().catch(()=>{});
    });
  });

  // Pause this player and free it when leaving the page
  window.addEventListener("hashchange", function once(){
    audio.pause();
    audio.src = "";
    window.removeEventListener("hashchange", once);
  });
}

// ── Section dispatcher ────────────────────────
function renderSection(lid, sid, step, idx){
  const lesson = currentLesson(lid);
  const sec = lesson.sections.find(s=>s.id===sid);
  if(!sec) return go("/lesson/"+lid);

  const root = $app();
  root.innerHTML = "";
  root.appendChild(topbar(sec.title, "/lesson/"+lid));

  const flow = SECTION_FLOWS[sid] || [];
  if((step==="intro" || !step) && flow.length){
    step = flow[0]; idx = 0;
  }
  const stepIdx = flow.indexOf(step);
  if(flow.length){
    root.appendChild(progressBar(Math.round((stepIdx/flow.length)*100)));
  }

  const renderer = STEP_RENDERERS[sid+":"+step];
  if(!renderer){
    root.appendChild(el("p","muted","(This step isn't available yet.)"));
    const back = el("button","btn","Back to lesson");
    back.addEventListener("click", ()=>go("/lesson/"+lid));
    root.appendChild(back);
    return;
  }
  renderer(root, sec, idx, ()=>nextStep(lid, sid, step, idx, sec, flow));
}

function nextStep(lid, sid, step, idx, sec, flow){
  const stepCount = (STEP_COUNTS[sid+":"+step] ? STEP_COUNTS[sid+":"+step](sec) : 1);
  if(idx+1 < stepCount){
    go("/lesson/"+lid+"/section/"+sid+"/"+step+"/"+(idx+1));
    return;
  }
  // update progress
  if(flow.length){
    const pct = Math.round(((flow.indexOf(step)+1)/flow.length)*100);
    setSectionProgress(lid, sid, pct);
  }
  const i = flow.indexOf(step);
  if(i+1 < flow.length){
    go("/lesson/"+lid+"/section/"+sid+"/"+flow[i+1]+"/0");
  } else {
    setSectionProgress(lid, sid, 100);
    addXp(20);
    showSectionDone(lid);
  }
}

function showSectionDone(lid){
  const t = I18N[State.lang] || I18N.en;
  const root = $app();
  root.innerHTML = "";
  root.appendChild(topbar(t.done, "/lesson/"+lid));
  const ds = el("div","done-screen");
  ds.appendChild(el("div","emoji","🎉"));
  ds.appendChild(el("h1","",t.sectionComplete));
  ds.appendChild(el("p","",t.brilliantWork));
  const stats = el("div","stats");
  const s1 = el("div","stat"); s1.appendChild(el("strong","","+20")); s1.appendChild(el("span","",t.xpEarned));
  const s2 = el("div","stat"); s2.appendChild(el("strong","",String(State.xp))); s2.appendChild(el("span","",t.totalXp));
  stats.appendChild(s1); stats.appendChild(s2);
  ds.appendChild(stats);
  const back = el("button","btn",t.backToLesson);
  back.addEventListener("click", ()=>go("/lesson/"+lid));
  ds.appendChild(back);
  root.appendChild(ds);
}

/* ============================================================
   Section flows + step counts
   ============================================================ */
const SECTION_FLOWS = {
  // Lesson 1
  phrases:        ["flash","listen","build"],
  alphabet:       ["letter","match","passage"],
  grammar:        ["rules","ex3","ex4","ex5"],
  days:           ["flash","match","scramble"],
  // Lesson 2
  serquni:        ["flash","dialogue","listen"],
  colours:        ["card"],
  adjectives:     ["pair"],
  numbers:        ["flash","ordinals"],
  months:         ["flash","match"],
  // Lesson 3
  pronouns:       ["flash","ex1"],
  demonstratives: ["rules","ex2","ex3"],
  syllables:      ["card"],
  // Lesson 4
  family:         ["flash","plurals"],
  hobbies:        ["flash","dialogue"],
  possessive:     ["examples","pronouns"],
  attached:       ["examples","ex6","ex7"],
  // Lesson 5
  fruit:          ["card"],
  vegetables:     ["card"],
  imperative:     ["card","ex8"],
  present:        ["rules","ex9"],
  // Lesson 6
  table:          ["card"],
  food:           ["flash"],
  questions:      ["flash","passage"],
  ghpresent:      ["rules","ex5","ex6"],
  // Lesson 7
  transport:      ["card"],
  weekend:        ["flash","dialogue"],
  seasons:        ["card"],
  particles:      ["flash","examples","ex7"],
  // Lesson 8
  datetime:       ["flash"],
  partarticle:    ["flash","ex3"],
  map:            ["facts","vocab","regions"],
  places:         ["flash"],
  // Lesson 9
  directions:     ["flash","dialogue","winds"],
  timeexp:        ["flash"],
  time:           ["hours","patterns","ex8"],
  // Extras
  polite:         ["flash","dialogue"],
  cafe:           ["flash","dialogue"],
  work:           ["flash","dialogue"],
  shopping:       ["flash","dialogue"],
};

const STEP_COUNTS = {
  // Lesson 1
  "phrases:flash": s => s.vocab.length,
  "phrases:listen": s => Math.min(8, s.dialogue.length),
  "phrases:build": s => Math.min(5, s.dialogue.length),
  "alphabet:letter": s => s.letters.length,
  "alphabet:match": s => 6,
  "alphabet:passage": s => 1,
  "grammar:rules": s => s.rules.length,
  "grammar:ex3": s => Math.min(10, s.exercises.find(e=>e.id==="ex3").items.length),
  "grammar:ex4": s => Math.min(10, s.exercises.find(e=>e.id==="ex4").items.length),
  "grammar:ex5": s => Math.min(10, s.exercises.find(e=>e.id==="ex5").items.length),
  "days:flash": s => s.items.length,
  "days:match": s => 1,
  "days:scramble": s => Math.min(5, s.items.length),
  // Lesson 2
  "serquni:flash": s => s.vocab.length,
  "serquni:dialogue": s => 1,
  "serquni:listen": s => Math.min(6, s.dialogue.length),
  "colours:card": s => s.items.length,
  "adjectives:pair": s => s.pairs.length,
  "numbers:flash": s => s.items.length,
  "numbers:ordinals": s => s.ordinals.length,
  "months:flash": s => s.items.length,
  "months:match": s => 1,
  // Lesson 3
  "pronouns:flash": s => s.items.length,
  "pronouns:ex1": s => Math.min(8, s.exercises[0].items.length),
  "demonstratives:rules": s => s.rules.length,
  "demonstratives:ex2": s => Math.min(10, s.exercises.find(e=>e.id==="ex2").items.length),
  "demonstratives:ex3": s => Math.min(10, s.exercises.find(e=>e.id==="ex3").items.length),
  "syllables:card": s => Math.min(12, s.items.length),
  // Lesson 4
  "family:flash": s => s.vocab.length,
  "family:plurals": s => Math.min(8, s.plurals.length),
  "hobbies:flash": s => s.vocab.length,
  "hobbies:dialogue": s => 1,
  "possessive:examples": s => 1,
  "possessive:pronouns": s => s.possessives.length,
  "attached:examples": s => 1,
  "attached:ex6": s => s.exercises.find(e=>e.id==="ex6").items.length,
  "attached:ex7": s => s.exercises.find(e=>e.id==="ex7").items.length,
  // Lesson 5
  "fruit:card": s => s.items.length,
  "vegetables:card": s => s.items.length,
  "imperative:card": s => s.items.length,
  "imperative:ex8": s => s.exercises[0].items.length,
  "present:rules": s => s.rules.length,
  "present:ex9": s => s.exercises[0].items.length,
  // Lesson 6
  "table:card": s => s.items.length,
  "food:flash": s => s.vocab.length,
  "questions:flash": s => s.items.length,
  "questions:passage": s => 1,
  "ghpresent:rules": s => s.rules.length,
  "ghpresent:ex5": s => s.exercises.find(e=>e.id==="ex5").items.length,
  "ghpresent:ex6": s => s.exercises.find(e=>e.id==="ex6").items.length,
  // Lesson 7
  "transport:card": s => s.items.length,
  "weekend:flash": s => s.vocab.length,
  "weekend:dialogue": s => 1,
  "seasons:card": s => s.items.length,
  "particles:flash": s => s.items.length,
  "particles:examples": s => 1,
  "particles:ex7": s => s.exercises[0].items.length,
  // Lesson 8
  "datetime:flash": s => s.vocab.length,
  "partarticle:flash": s => s.items.length,
  "partarticle:ex3": s => s.exercises[0].items.length,
  "map:facts": s => 1,
  "map:vocab": s => s.vocab.length,
  "map:regions": s => s.regions.length,
  "places:flash": s => s.items.length,
  // Lesson 9
  "directions:flash": s => s.vocab.length,
  "directions:dialogue": s => 1,
  "directions:winds": s => s.winds.length,
  "timeexp:flash": s => s.vocab.length,
  "time:hours": s => s.hours.length,
  "time:patterns": s => s.patterns.length,
  "time:ex8": s => s.exercises[0].items.length,
  // Extras — all four sections use the same vocab+dialogue pattern as 'weekend'
  "polite:flash": s => s.vocab.length, "polite:dialogue": s => 1,
  "cafe:flash": s => s.vocab.length, "cafe:dialogue": s => 1,
  "work:flash": s => s.vocab.length, "work:dialogue": s => 1,
  "shopping:flash": s => s.vocab.length, "shopping:dialogue": s => 1,
};

/* ============================================================
   Generic step renderers
   ============================================================ */

// vocab/items flashcard (mt + en visible)
function renderFlash(mt, en, hint, secondary){
  const card = el("div","flash");
  if(hint) card.appendChild(el("div","hint", hint));
  card.appendChild(el("div","mtword", mt));
  if(secondary) card.appendChild(el("div","alt", secondary));
  card.appendChild(el("div","enword", en));
  card.appendChild(audioBtn(mt));
  card.addEventListener("click", e=>{ if(e.target.tagName!=="BUTTON") play(mt); });
  return card;
}

function nextBtn(label, onNext){
  const b = el("button","btn",label||"Next");
  b.addEventListener("click", onNext);
  return b;
}

// Skip → small button that lets the learner advance to the next exercise without
// answering. Used by every interactive question renderer.
function skipBtn(onNext){
  const t = I18N[State.lang] || I18N.en;
  const b = el("button","btn-skip", t.skip);
  b.addEventListener("click", onNext);
  return b;
}

// Listen-and-pick with given items array (each having mt/en)
function makeListenStep(field){
  return (root, sec, idx, onNext) => {
    const items = sec[field];
    const correct = items[idx % items.length];
    const distractors = items.filter(x=>x!==correct).sort(()=>Math.random()-.5).slice(0,3);
    const opts = [correct, ...distractors].sort(()=>Math.random()-.5);
    const card = el("div","card");
    card.appendChild(el("h3","","Listen and pick the meaning"));
    const row = el("div","row");
    row.appendChild(audioBtn(correct.mt, {size:"lg"}));
    row.appendChild(el("div","grow muted","Tap the speaker, then choose."));
    card.appendChild(row);
    root.appendChild(card);
    const choices = el("div","choices col");
    opts.forEach(o=>{
      const b = el("button","choice", o.en);
      b.addEventListener("click", ()=>{
        if(o===correct){
          b.classList.add("right"); addXp(5);
          showFeedback(true,"Sewwa! Correct.", correct.mt+" → "+correct.en, onNext);
        } else {
          b.classList.add("wrong");
          showFeedback(false,"Not quite.", "Correct: "+correct.mt+" → "+correct.en, onNext);
        }
        [...choices.children].forEach(c=>{ if(c!==b) c.classList.add("dim"); c.disabled=true; });
      });
      choices.appendChild(b);
    });
    card.appendChild(choices);
    root.appendChild(skipBtn(onNext));
    setTimeout(()=>play(correct.mt), 300);
  };
}

// Tap-to-build sentence
function makeBuildStep(field){
  return (root, sec, idx, onNext) => {
    const items = sec[field];
    const item = items[idx % items.length];
    const tokens = item.mt.split(/\s+/);
    let shuffled = [...tokens].sort(()=>Math.random()-.5);
    if(shuffled.join(" ") === tokens.join(" ")) shuffled.reverse();
    const card = el("div","card");
    card.appendChild(el("h3","","Build the Maltese sentence"));
    card.appendChild(el("p","mtline", item.en));
    const built = el("div","built"); card.appendChild(built);
    const pool = el("div","pool"); card.appendChild(pool);
    root.appendChild(card);
    const placed = [];
    shuffled.forEach((t)=>{
      const tile = el("button","tile",t);
      tile.addEventListener("click", ()=>{
        if(tile.classList.contains("used")) return;
        tile.classList.add("used");
        const pt = el("button","tile",t);
        const entry = {tile, pt, t};
        placed.push(entry);
        pt.addEventListener("click", ()=>{
          const k = placed.indexOf(entry);
          if(k>=0){ entry.tile.classList.remove("used"); placed.splice(k,1); pt.remove(); }
        });
        built.appendChild(pt);
      });
      pool.appendChild(tile);
    });
    const check = el("button","btn","Check");
    check.addEventListener("click", ()=>{
      const got = placed.map(p=>p.t).join(" ").trim();
      const want = tokens.join(" ").trim();
      if(got===want){
        addXp(10); play(item.mt);
        showFeedback(true,"Mela! Spot on.", item.mt+" — "+item.en, onNext);
      } else {
        showFeedback(false,"Not quite.","Correct: "+item.mt, onNext);
      }
    });
    root.appendChild(check);
    root.appendChild(skipBtn(onNext));
  };
}

// Multiple-choice exercise (looking up exercises[].id)
function makeMcStep(exId, opts){
  opts = opts || {};
  const wordField = opts.wordField || "word";          // field that holds the displayed Maltese
  const subField = opts.subField || "en";              // english/secondary
  const audioCombine = opts.audioCombine || null;      // function(item)->string to play
  return (root, sec, idx, onNext) => {
    const ex = sec.exercises.find(e=>e.id===exId);
    const item = ex.items[idx % ex.items.length];
    const card = el("div","card");
    card.appendChild(el("h3","",ex.title));
    if(ex.instructions) card.appendChild(el("p","muted",ex.instructions));
    const wordRow = el("div","row");
    const audioStr = audioCombine ? audioCombine(item) : item[wordField];
    wordRow.appendChild(audioBtn(audioStr, {size:"lg"}));
    const w = el("div","grow");
    w.appendChild(el("div","mtline", opts.displayFn ? opts.displayFn(item) : ("____ "+item[wordField])));
    if(item[subField]) w.appendChild(el("div","muted", item[subField]));
    wordRow.appendChild(w);
    card.appendChild(wordRow);
    root.appendChild(card);

    const chips = el("div","chips");
    ex.choices.forEach(c=>{
      const b = el("button","chip", c);
      b.addEventListener("click", ()=>{
        if(c===item.answer){
          b.classList.add("right"); addXp(5); play(audioStr);
          showFeedback(true,"Sewwa!", item.answer+(opts.detailFn? " "+opts.detailFn(item):""), onNext);
        } else {
          b.classList.add("wrong");
          [...chips.children].forEach(x=>{ if(x.textContent===item.answer) x.classList.add("right"); });
          showFeedback(false,"Not quite.","Correct: "+item.answer, onNext);
        }
        [...chips.children].forEach(x=>x.disabled=true);
      });
      chips.appendChild(b);
    });
    card.appendChild(chips);
  root.appendChild(skipBtn(onNext));
    root.appendChild(skipBtn(onNext));
  };
}

// ── Lesson 1 renderers ─────────────────────────
const STEP_RENDERERS = {};

STEP_RENDERERS["phrases:flash"] = (root, sec, idx, onNext) => {
  const item = sec.vocab[idx];
  root.appendChild(renderFlash(item.mt, item.en, `Word ${idx+1} of ${sec.vocab.length}`));
  setTimeout(()=>play(item.mt), 250);
  root.appendChild(nextBtn("Next", onNext));
};
STEP_RENDERERS["phrases:listen"] = makeListenStep("dialogue");
STEP_RENDERERS["phrases:build"] = makeBuildStep("dialogue");

STEP_RENDERERS["alphabet:letter"] = (root, sec, idx, onNext) => {
  const L = sec.letters[idx];
  const card = el("div","letter-card");
  card.appendChild(el("div","big", L.upper));
  if(L.upper.toLowerCase() !== L.lower) card.appendChild(el("div","lower", L.lower));
  card.appendChild(audioBtn(L.lower, {label:"🔊 sound"}));
  const ex = el("div","examples");
  L.words.forEach(w=>{
    const r = el("div","ex");
    r.appendChild(audioBtn(w.mt));
    const tx = el("div",""); tx.appendChild(el("div","mt", w.mt));
    r.appendChild(tx);
    r.appendChild(el("div","en", w.en));
    r.addEventListener("click", e=>{ if(e.target.tagName!=="BUTTON") play(w.mt); });
    ex.appendChild(r);
  });
  card.appendChild(ex);
  root.appendChild(card);
  root.appendChild(el("p","muted center", (idx+1)+" / "+sec.letters.length));
  root.appendChild(nextBtn(idx+1===sec.letters.length ? "Done →" : "Next letter →", onNext));
  setTimeout(()=>play(L.lower), 250);
};

STEP_RENDERERS["alphabet:match"] = (root, sec, idx, onNext) => {
  const all = sec.letters;
  const letter = all[Math.floor(Math.random()*all.length)];
  const word = letter.words[Math.floor(Math.random()*letter.words.length)];
  const distractors = all.filter(l=>l!==letter).sort(()=>Math.random()-.5).slice(0,3).map(l=>l.upper);
  const opts = [letter.upper, ...distractors].sort(()=>Math.random()-.5);
  const card = el("div","card");
  card.appendChild(el("h3","","Listen — which letter does it start with?"));
  const row = el("div","row");
  row.appendChild(audioBtn(word.mt, {size:"lg"}));
  row.appendChild(el("div","grow muted","Tap to hear."));
  card.appendChild(row);
  root.appendChild(card);
  const grid = el("div","choices");
  opts.forEach(o=>{
    const b = el("button","choice", o);
    b.style.fontSize="1.6rem"; b.style.fontWeight="800";
    b.addEventListener("click", ()=>{
      if(o===letter.upper){
        b.classList.add("right"); addXp(5);
        showFeedback(true,"Sewwa!", word.mt+" → "+word.en+" (starts with "+letter.upper+")", onNext);
      } else {
        b.classList.add("wrong");
        showFeedback(false,"Not quite.", word.mt+" starts with "+letter.upper, onNext);
      }
      [...grid.children].forEach(c=>{ if(c!==b) c.classList.add("dim"); c.disabled=true; });
    });
    grid.appendChild(b);
  });
  card.appendChild(grid);
  setTimeout(()=>play(word.mt), 350);
};

STEP_RENDERERS["alphabet:passage"] = (root, sec, idx, onNext) => {
  const card = el("div","card");
  card.appendChild(el("h3","",sec.passage.title));
  card.appendChild(el("p","muted","Tap each line to hear it."));
  root.appendChild(card);
  sec.passage.lines.forEach(line=>{
    const r = el("div","passage-line");
    r.appendChild(audioBtn(line.mt));
    const t = el("div","txt");
    t.appendChild(el("span","mt", line.mt));
    t.appendChild(el("span","en", line.en));
    r.appendChild(t);
    r.addEventListener("click", e=>{ if(e.target.tagName!=="BUTTON") play(line.mt); });
    root.appendChild(r);
  });
  root.appendChild(nextBtn("Done →", onNext));
};

STEP_RENDERERS["grammar:rules"] = (root, sec, idx, onNext) => {
  const r = sec.rules[idx];
  const card = el("div","card rule");
  card.appendChild(el("h2","",r.title));
  card.appendChild(el("p","",r.explanation));
  if(r.letters && r.letters.length){
    const ll = el("div","letters");
    r.letters.forEach(L=>ll.appendChild(el("span","",L)));
    card.appendChild(ll);
  }
  const ex = el("div","examples-grid");
  (r.examples||[]).forEach(e=>{
    const row = el("div","ex");
    const audioStr = e.full || e.mt || e.phrase || e.word;
    row.appendChild(audioBtn(audioStr));
    const fx = el("div",""); fx.appendChild(el("span","full", e.full || e.phrase || e.mt || e.word));
    row.appendChild(fx);
    row.appendChild(el("div","en", e.en));
    row.addEventListener("click", evt=>{ if(evt.target.tagName!=="BUTTON") play(audioStr); });
    ex.appendChild(row);
  });
  card.appendChild(ex);
  root.appendChild(card);
  root.appendChild(nextBtn(idx+1===sec.rules.length ? "Try the exercises →" : "Next rule →", onNext));
};

STEP_RENDERERS["grammar:ex3"] = makeMcStep("ex3", {
  audioCombine: it => it.answer + it.word,
  detailFn: it => it.word
});
STEP_RENDERERS["grammar:ex4"] = makeMcStep("ex4", {
  audioCombine: it => it.answer + it.word,
  detailFn: it => it.word
});
STEP_RENDERERS["grammar:ex5"] = makeMcStep("ex5", {
  audioCombine: it => it.answer + it.word,
  detailFn: it => it.word
});

STEP_RENDERERS["days:flash"] = (root, sec, idx, onNext) => {
  const item = sec.items[idx];
  root.appendChild(renderFlash(item.mt, item.en, `Day ${idx+1} of ${sec.items.length}`));
  setTimeout(()=>play(item.mt), 250);
  root.appendChild(nextBtn("Next", onNext));
};

STEP_RENDERERS["days:match"] = makeMatchStep("items", "mt", "en", "Match the days");

STEP_RENDERERS["days:scramble"] = (root, sec, idx, onNext) => {
  const item = sec.items[idx % sec.items.length];
  const article = item.mt.split("-")[0]+"-";
  const dayName = item.mt.split("-")[1];
  const letters = (item.scrambled || dayName).split("");
  const card = el("div","card");
  card.appendChild(el("h3","","Unscramble the day"));
  const row = el("div","row");
  row.appendChild(audioBtn(item.mt, {size:"lg"}));
  row.appendChild(el("div","grow mtline", item.en+" → "+article+"___"));
  card.appendChild(row);
  const built = el("div","built"); card.appendChild(built);
  const pool = el("div","pool");
  const placed = [];
  letters.forEach(L=>{
    const t = el("button","tile",L);
    t.addEventListener("click", ()=>{
      if(t.classList.contains("used")) return;
      t.classList.add("used");
      const pt = el("button","tile",L);
      const e = {L, t, pt}; placed.push(e);
      pt.addEventListener("click", ()=>{
        const k = placed.indexOf(e);
        if(k>=0){ e.t.classList.remove("used"); placed.splice(k,1); pt.remove(); }
      });
      built.appendChild(pt);
    });
    pool.appendChild(t);
  });
  card.appendChild(pool);
  root.appendChild(card);
  const check = el("button","btn","Check");
  check.addEventListener("click", ()=>{
    const got = placed.map(p=>p.L).join("").toLowerCase();
    const want = dayName.toLowerCase();
    if(got===want){
      addXp(10); play(item.mt);
      showFeedback(true,"Sewwa! "+item.mt, item.en, onNext);
    } else {
      showFeedback(false,"Not quite.","Correct: "+item.mt, onNext);
    }
  });
  root.appendChild(check);
  root.appendChild(skipBtn(onNext));
};

// Generic match-pairs step
function makeMatchStep(itemsField, leftField, rightField, headline, getXp){
  return (root, sec, idx, onNext) => {
    const items = sec[itemsField].slice();
    const card = el("div","card");
    card.appendChild(el("h3","",headline));
    card.appendChild(el("p","muted","Tap a Maltese item, then tap its English."));
    root.appendChild(card);
    const wrapper = el("div","match");
    const left = items.map(i=>i[leftField]).sort(()=>Math.random()-.5);
    const right = items.map(i=>i[rightField]).sort(()=>Math.random()-.5);
    const lc = el("div",""); lc.style.display="grid"; lc.style.gap="8px";
    const rc = el("div",""); rc.style.display="grid"; rc.style.gap="8px";
    let selL=null, selR=null, matched=0;
    function check(){
      if(!selL || !selR) return;
      const l = selL.dataset.l, r = selR.dataset.r;
      const ok = items.some(i => i[leftField]===l && i[rightField]===r);
      if(ok){
        selL.classList.add("right"); selR.classList.add("right"); play(l);
        matched++; selL=null; selR=null;
        if(matched===items.length){
          addXp(getXp ? getXp(items) : 15);
          showFeedback(true,"Perfect!","All matched.", onNext);
        }
      } else {
        const a=selL,b=selR; a.classList.add("wrong"); b.classList.add("wrong");
        setTimeout(()=>{ a.classList.remove("wrong","sel"); b.classList.remove("wrong","sel"); },700);
        selL=null; selR=null;
      }
    }
    left.forEach(v=>{
      const b = el("button","",v); b.dataset.l=v;
      b.addEventListener("click", ()=>{
        if(b.classList.contains("right")) return;
        if(selL) selL.classList.remove("sel");
        selL=b; b.classList.add("sel"); play(v);
        check();
      });
      lc.appendChild(b);
    });
    right.forEach(v=>{
      const b = el("button","",v); b.dataset.r=v;
      b.addEventListener("click", ()=>{
        if(b.classList.contains("right")) return;
        if(selR) selR.classList.remove("sel");
        selR=b; b.classList.add("sel");
        check();
      });
      rc.appendChild(b);
    });
    wrapper.appendChild(lc); wrapper.appendChild(rc);
    card.appendChild(wrapper);
    root.appendChild(skipBtn(onNext));
  };
}

/* ============================================================
   Lesson 2 renderers
   ============================================================ */

STEP_RENDERERS["serquni:flash"] = (root, sec, idx, onNext) => {
  const item = sec.vocab[idx];
  root.appendChild(renderFlash(item.mt, item.en, `Word ${idx+1} of ${sec.vocab.length}`));
  setTimeout(()=>play(item.mt), 250);
  root.appendChild(nextBtn("Next", onNext));
};
STEP_RENDERERS["serquni:dialogue"] = (root, sec, idx, onNext) => {
  const card = el("div","card");
  card.appendChild(el("h3","","The dialogue — read & listen"));
  card.appendChild(el("p","muted","Tap each line to hear it spoken."));
  root.appendChild(card);
  sec.dialogue.forEach(line=>{
    const r = el("div","passage-line");
    r.appendChild(audioBtn(line.mt));
    const t = el("div","txt");
    t.appendChild(el("span","mt", line.mt));
    t.appendChild(el("span","en", line.en));
    r.appendChild(t);
    r.addEventListener("click", e=>{ if(e.target.tagName!=="BUTTON") play(line.mt); });
    root.appendChild(r);
  });
  root.appendChild(nextBtn("Done →", onNext));
};
STEP_RENDERERS["serquni:listen"] = makeListenStep("dialogue");

STEP_RENDERERS["colours:card"] = (root, sec, idx, onNext) => {
  const c = sec.items[idx];
  const card = el("div","card");
  const head = el("div","row");
  const sw = el("div","colour-swatch");
  sw.style.background = colourMap(c.en);
  head.appendChild(sw);
  const titleWrap = el("div","grow");
  titleWrap.appendChild(el("h2","",c.en));
  head.appendChild(titleWrap);
  head.appendChild(audioBtn(c.mt, {size:"lg"}));
  card.appendChild(head);
  const forms = el("div","forms");
  ["mt","feminine","plural"].forEach(k=>{
    if(!c[k]) return;
    const r = el("div","form-row");
    r.appendChild(audioBtn(c[k]));
    r.appendChild(el("div","label", k==="mt"?"Masc":(k==="feminine"?"Fem":"Plural")));
    r.appendChild(el("div","mtform", c[k]));
    forms.appendChild(r);
  });
  card.appendChild(forms);
  if(c.examples && c.examples.length){
    card.appendChild(el("h3","","Examples"));
    c.examples.forEach(e=>{
      const r = el("div","form-row");
      r.appendChild(audioBtn(e.mt));
      r.appendChild(el("div","mtform", e.mt));
      r.appendChild(el("div","en", e.en));
      forms.appendChild(r);
    });
  }
  root.appendChild(card);
  root.appendChild(el("p","muted center", (idx+1)+" / "+sec.items.length));
  root.appendChild(nextBtn(idx+1===sec.items.length ? "Done →" : "Next colour →", onNext));
  setTimeout(()=>play(c.mt), 250);
};
function colourMap(en){
  const m = {white:"#ffffff",black:"#222",red:"#d23e3e",yellow:"#f6c83b","light blue":"#7fc6e8",green:"#5fb86b",grey:"#9ea4ad",blue:"#3267cf",pink:"#f1a3c2",purple:"#824aa9",orange:"#e98e2a",brown:"#88542e"};
  return m[en.toLowerCase()] || "#ddd";
}

STEP_RENDERERS["adjectives:pair"] = (root, sec, idx, onNext) => {
  const p = sec.pairs[idx];
  const card = el("div","card");
  card.appendChild(el("h3","","Opposite pair"));
  [p.a, p.b].forEach((side,i)=>{
    const sub = el("div","");
    sub.style.padding = "12px"; sub.style.borderRadius = "12px";
    sub.style.background = i===0?"#e9f5f5":"#fff5e6";
    sub.style.marginBottom = "10px";
    const head = el("div","row");
    head.appendChild(audioBtn(side.mt, {size:"lg"}));
    head.appendChild(el("div","grow mtline", side.mt+" — "+side.en.replace(/ \(m\)/, "")));
    sub.appendChild(head);
    [["Masc",side.mt],["Fem",side.feminine],["Plural",side.plural]].forEach(([lbl,val])=>{
      if(!val) return;
      const r = el("div","form-row");
      r.appendChild(audioBtn(val));
      r.appendChild(el("div","label", lbl));
      r.appendChild(el("div","mtform", val));
      sub.appendChild(r);
    });
    card.appendChild(sub);
  });
  root.appendChild(card);
  root.appendChild(el("p","muted center", (idx+1)+" / "+sec.pairs.length));
  root.appendChild(nextBtn(idx+1===sec.pairs.length ? "Done →" : "Next pair →", onNext));
  setTimeout(()=>play(p.a.mt), 250);
};

STEP_RENDERERS["numbers:flash"] = (root, sec, idx, onNext) => {
  const item = sec.items[idx];
  const card = el("div","card number-card");
  card.appendChild(el("div","num", String(item.n)));
  card.appendChild(el("div","mtword", item.mt));
  card.appendChild(el("div","enword", item.en));
  card.appendChild(audioBtn(item.mt, {size:"lg"}));
  card.addEventListener("click", e=>{ if(e.target.tagName!=="BUTTON") play(item.mt); });
  root.appendChild(card);
  root.appendChild(el("p","muted center", (idx+1)+" / "+sec.items.length));
  root.appendChild(nextBtn("Next →", onNext));
  setTimeout(()=>play(item.mt), 250);
};
STEP_RENDERERS["numbers:ordinals"] = (root, sec, idx, onNext) => {
  const item = sec.ordinals[idx];
  root.appendChild(renderFlash(item.mt, item.en, `Ordinal ${idx+1} of ${sec.ordinals.length}`));
  setTimeout(()=>play(item.mt), 250);
  root.appendChild(nextBtn("Next →", onNext));
};

STEP_RENDERERS["months:flash"] = (root, sec, idx, onNext) => {
  const item = sec.items[idx];
  root.appendChild(renderFlash(item.mt, item.en, `Month ${idx+1} of ${sec.items.length}`));
  setTimeout(()=>play(item.mt), 250);
  root.appendChild(nextBtn("Next →", onNext));
};
STEP_RENDERERS["months:match"] = makeMatchStep("items", "mt", "en", "Match the months");

/* ============================================================
   Lesson 3 renderers
   ============================================================ */

STEP_RENDERERS["pronouns:flash"] = (root, sec, idx, onNext) => {
  const item = sec.items[idx];
  const second = item.alt && item.alt!==item.mt ? item.alt : null;
  root.appendChild(renderFlash(item.mt, item.en, `${idx+1} of ${sec.items.length}`, second));
  setTimeout(()=>play(item.mt), 250);
  root.appendChild(nextBtn("Next →", onNext));
};
STEP_RENDERERS["pronouns:ex1"] = (root, sec, idx, onNext) => {
  const ex = sec.exercises[0];
  const item = ex.items[idx % ex.items.length];
  const card = el("div","card");
  card.appendChild(el("h3","",ex.title));
  if(ex.instructions) card.appendChild(el("p","muted",ex.instructions));
  const row = el("div","row");
  row.appendChild(audioBtn(item.sentence, {size:"lg"}));
  const w = el("div","grow");
  w.appendChild(el("div","mtline", item.sentence));
  w.appendChild(el("div","muted", item.en));
  row.appendChild(w);
  card.appendChild(row);
  root.appendChild(card);
  const chips = el("div","chips");
  ex.choices.forEach(c=>{
    const b = el("button","chip", c);
    b.addEventListener("click", ()=>{
      if(c===item.answer){
        b.classList.add("right"); addXp(5); play(item.answer);
        showFeedback(true,"Sewwa!", item.answer+" replaces it.", onNext);
      } else {
        b.classList.add("wrong");
        [...chips.children].forEach(x=>{ if(x.textContent===item.answer) x.classList.add("right"); });
        showFeedback(false,"Not quite.", "Correct: "+item.answer, onNext);
      }
      [...chips.children].forEach(x=>x.disabled=true);
    });
    chips.appendChild(b);
  });
  card.appendChild(chips);
  root.appendChild(skipBtn(onNext));
  setTimeout(()=>play(item.sentence), 350);
};

STEP_RENDERERS["demonstratives:rules"] = (root, sec, idx, onNext) => {
  const r = sec.rules[idx];
  const card = el("div","card rule");
  card.appendChild(el("h2","",r.title));
  card.appendChild(el("p","",r.explanation));
  const forms = el("div","forms");
  r.items.forEach(it=>{
    const fr = el("div","form-row");
    fr.appendChild(audioBtn(it.mt));
    fr.appendChild(el("div","mtform", it.mt));
    fr.appendChild(el("div","en", it.en));
    forms.appendChild(fr);
  });
  card.appendChild(forms);
  card.appendChild(el("h3","","Examples"));
  const exg = el("div","examples-grid");
  r.examples.forEach(e=>{
    const row = el("div","ex");
    row.appendChild(audioBtn(e.phrase));
    const fx = el("div",""); fx.appendChild(el("span","full",e.phrase));
    row.appendChild(fx);
    row.appendChild(el("div","en", e.en));
    row.addEventListener("click", evt=>{ if(evt.target.tagName!=="BUTTON") play(e.phrase); });
    exg.appendChild(row);
  });
  card.appendChild(exg);
  root.appendChild(card);
  root.appendChild(nextBtn(idx+1===sec.rules.length ? "Try the exercises →" : "Next →", onNext));
};
STEP_RENDERERS["demonstratives:ex2"] = makeMcStep("ex2", { audioCombine: it=>it.answer+" "+it.word, detailFn: it=>it.word });
STEP_RENDERERS["demonstratives:ex3"] = makeMcStep("ex3", { audioCombine: it=>it.answer+" "+it.word, detailFn: it=>it.word });

STEP_RENDERERS["syllables:card"] = (root, sec, idx, onNext) => {
  const item = sec.items[idx];
  const card = el("div","card syllable-card");
  card.appendChild(el("div","word", item.word));
  const split = el("div","split","tap to reveal");
  card.appendChild(split);
  card.appendChild(audioBtn(item.word, {size:"lg"}));
  let revealed=false;
  card.addEventListener("click", e=>{
    if(e.target.tagName==="BUTTON") return;
    if(!revealed){ revealed=true; split.textContent = item.syllables; play(item.word); }
    else { play(item.word); }
  });
  root.appendChild(card);
  root.appendChild(el("p","muted center", (idx+1)+" / "+Math.min(12,sec.items.length)));
  root.appendChild(nextBtn("Next →", onNext));
  setTimeout(()=>play(item.word), 250);
};

/* ============================================================
   Lesson 4 renderers
   ============================================================ */

STEP_RENDERERS["family:flash"] = (root, sec, idx, onNext) => {
  const item = sec.vocab[idx];
  root.appendChild(renderFlash(item.mt, item.en, `Member ${idx+1} of ${sec.vocab.length}`));
  setTimeout(()=>play(item.mt), 250);
  root.appendChild(nextBtn("Next →", onNext));
};
STEP_RENDERERS["family:plurals"] = (root, sec, idx, onNext) => {
  const items = sec.plurals;
  const item = items[idx % items.length];
  const distractors = items.filter(x=>x!==item).sort(()=>Math.random()-.5).slice(0,3).map(x=>x.plural);
  const opts = [item.plural, ...distractors].sort(()=>Math.random()-.5);
  const card = el("div","card");
  card.appendChild(el("h3","","What's the plural?"));
  const row = el("div","row");
  row.appendChild(audioBtn(item.singular, {size:"lg"}));
  const w = el("div","grow");
  w.appendChild(el("div","mtline", item.singular));
  w.appendChild(el("div","muted", item.en));
  row.appendChild(w);
  card.appendChild(row);
  root.appendChild(card);
  const ch = el("div","choices col");
  opts.forEach(o=>{
    const b = el("button","choice", o);
    b.addEventListener("click", ()=>{
      if(o===item.plural){
        b.classList.add("right"); addXp(5); play(item.plural);
        showFeedback(true,"Sewwa!", item.singular+" → "+item.plural, onNext);
      } else {
        b.classList.add("wrong");
        showFeedback(false,"Not quite.", "Correct: "+item.plural, onNext);
      }
      [...ch.children].forEach(c=>{ if(c!==b) c.classList.add("dim"); c.disabled=true; });
    });
    ch.appendChild(b);
  });
  card.appendChild(ch);
  root.appendChild(skipBtn(onNext));
  setTimeout(()=>play(item.singular), 350);
};

STEP_RENDERERS["hobbies:flash"] = (root, sec, idx, onNext) => {
  const item = sec.vocab[idx];
  root.appendChild(renderFlash(item.mt, item.en, `Hobby ${idx+1} of ${sec.vocab.length}`));
  setTimeout(()=>play(item.mt), 250);
  root.appendChild(nextBtn("Next →", onNext));
};
STEP_RENDERERS["hobbies:dialogue"] = (root, sec, idx, onNext) => {
  const card = el("div","card");
  card.appendChild(el("h3","","Dialogue — read & listen"));
  root.appendChild(card);
  sec.dialogue.forEach(line=>{
    const r = el("div","passage-line");
    r.appendChild(audioBtn(line.mt));
    const t = el("div","txt");
    t.appendChild(el("span","mt", line.mt));
    t.appendChild(el("span","en", line.en));
    r.appendChild(t);
    r.addEventListener("click", e=>{ if(e.target.tagName!=="BUTTON") play(line.mt); });
    root.appendChild(r);
  });
  root.appendChild(nextBtn("Done →", onNext));
};

STEP_RENDERERS["possessive:examples"] = (root, sec, idx, onNext) => {
  const card = el("div","card");
  card.appendChild(el("h2","","Using ta'"));
  card.appendChild(el("p","",sec.intro));
  root.appendChild(card);
  root.appendChild(el("h3","","Examples"));
  sec.examples.forEach(e=>{
    const r = el("div","passage-line");
    r.appendChild(audioBtn(e.phrase));
    const t = el("div","txt");
    t.appendChild(el("span","mt", e.phrase));
    t.appendChild(el("span","en", e.en));
    r.appendChild(t);
    r.addEventListener("click", evt=>{ if(evt.target.tagName!=="BUTTON") play(e.phrase); });
    root.appendChild(r);
  });
  root.appendChild(nextBtn("Continue →", onNext));
};
STEP_RENDERERS["possessive:pronouns"] = (root, sec, idx, onNext) => {
  const item = sec.possessives[idx];
  const examplePhrase = sec.examples_pronouns ? sec.examples_pronouns[idx]?.phrase : null;
  const exampleEn = sec.examples_pronouns ? sec.examples_pronouns[idx]?.en : null;
  const card = el("div","card");
  const head = el("div","row");
  head.appendChild(audioBtn(item.mt, {size:"lg"}));
  const w = el("div","grow");
  w.appendChild(el("div","mtline", item.mt));
  w.appendChild(el("div","muted", item.en));
  head.appendChild(w);
  card.appendChild(head);
  if(examplePhrase){
    const r = el("div","form-row");
    r.appendChild(audioBtn(examplePhrase));
    r.appendChild(el("div","mtform", examplePhrase));
    r.appendChild(el("div","en", exampleEn));
    card.appendChild(r);
  }
  root.appendChild(card);
  root.appendChild(el("p","muted center", (idx+1)+" / "+sec.possessives.length));
  root.appendChild(nextBtn("Next →", onNext));
  setTimeout(()=>play(item.mt), 250);
};

STEP_RENDERERS["attached:examples"] = (root, sec, idx, onNext) => {
  const card = el("div","card");
  card.appendChild(el("h2","","Attached pronouns"));
  card.appendChild(el("p","",sec.intro));
  root.appendChild(card);
  sec.examples.forEach(e=>{
    const r = el("div","form-row");
    r.appendChild(audioBtn(e.short));
    r.appendChild(el("div","mtform", e.short));
    r.appendChild(el("div","en", e.long+" — "+e.en));
    root.appendChild(r);
  });
  root.appendChild(nextBtn("Try the exercises →", onNext));
};
STEP_RENDERERS["attached:ex6"] = makeMcStep("ex6", {
  wordField: "long",
  subField: "en",
  displayFn: it => it.long+" → ?",
  audioCombine: it => it.answer
});
STEP_RENDERERS["attached:ex7"] = makeMcStep("ex7", {
  wordField: "long",
  subField: "en",
  displayFn: it => it.long+" → ?",
  audioCombine: it => it.answer
});

/* ============================================================
   Lesson 5 renderers
   ============================================================ */

function multiFormFruitVeg(root, sec, idx, onNext){
  const item = sec.items[idx];
  const card = el("div","card");
  const head = el("div","row");
  head.appendChild(audioBtn(item.singular, {size:"lg"}));
  const w = el("div","grow");
  w.appendChild(el("div","mtline", item.singular));
  w.appendChild(el("div","muted", item.en));
  head.appendChild(w);
  card.appendChild(head);
  [["Singular",item.singular],["Collective",item.collective],["Plural",item.plural]].forEach(([lbl,val])=>{
    if(!val) return;
    const r = el("div","form-row");
    r.appendChild(audioBtn(val));
    r.appendChild(el("div","label", lbl));
    r.appendChild(el("div","mtform", val));
    card.appendChild(r);
  });
  root.appendChild(card);
  root.appendChild(el("p","muted center", (idx+1)+" / "+sec.items.length));
  root.appendChild(nextBtn(idx+1===sec.items.length ? "Done →" : "Next →", onNext));
  setTimeout(()=>play(item.singular), 250);
}
STEP_RENDERERS["fruit:card"] = multiFormFruitVeg;
STEP_RENDERERS["vegetables:card"] = multiFormFruitVeg;

STEP_RENDERERS["imperative:card"] = (root, sec, idx, onNext) => {
  const item = sec.items[idx];
  const card = el("div","card");
  const head = el("div","row");
  head.appendChild(audioBtn(item.singular, {size:"lg"}));
  const w = el("div","grow");
  w.appendChild(el("div","mtline", item.en));
  head.appendChild(w);
  card.appendChild(head);
  [["Singular",item.singular],["Plural",item.plural]].forEach(([lbl,val])=>{
    const r = el("div","form-row");
    r.appendChild(audioBtn(val));
    r.appendChild(el("div","label", lbl));
    r.appendChild(el("div","mtform", val));
    card.appendChild(r);
  });
  root.appendChild(card);
  root.appendChild(el("p","muted center", (idx+1)+" / "+sec.items.length));
  root.appendChild(nextBtn(idx+1===sec.items.length ? "Done →" : "Next →", onNext));
  setTimeout(()=>play(item.singular), 250);
};
STEP_RENDERERS["imperative:ex8"] = (root, sec, idx, onNext) => {
  const ex = sec.exercises[0];
  const item = ex.items[idx % ex.items.length];
  const card = el("div","card");
  card.appendChild(el("h3","",ex.title));
  if(ex.instructions) card.appendChild(el("p","muted",ex.instructions));
  const row = el("div","row");
  row.appendChild(audioBtn(item.imperative, {size:"lg"}));
  const w = el("div","grow");
  w.appendChild(el("div","mtline", item.imperative));
  w.appendChild(el("div","muted", item.en));
  row.appendChild(w);
  card.appendChild(row);
  root.appendChild(card);
  const ch = el("div","chips");
  ex.choices.forEach(c=>{
    const b = el("button","chip", c==="singular"?"singular (you)":"plural (you all)");
    b.dataset.v = c;
    b.addEventListener("click", ()=>{
      if(c===item.answer){
        b.classList.add("right"); addXp(5); play(item.imperative);
        showFeedback(true,"Sewwa!", item.imperative+" — "+item.answer, onNext);
      } else {
        b.classList.add("wrong");
        showFeedback(false,"Not quite.","Correct: "+item.answer, onNext);
      }
      [...ch.children].forEach(x=>x.disabled=true);
    });
    ch.appendChild(b);
  });
  card.appendChild(ch);
  root.appendChild(skipBtn(onNext));
  setTimeout(()=>play(item.imperative), 300);
};

function conjTableRule(root, rule, idx, total){
  const card = el("div","card rule");
  card.appendChild(el("h2","",rule.title));
  const t = el("div","conj-table");
  rule.rows.forEach(r=>{
    t.appendChild(el("div","person", r.person));
    t.appendChild(el("div","form-cell", r.form));
    t.appendChild(audioBtn(r.form));
  });
  card.appendChild(t);
  return card;
}
STEP_RENDERERS["present:rules"] = (root, sec, idx, onNext) => {
  root.appendChild(conjTableRule(root, sec.rules[idx], idx, sec.rules.length));
  root.appendChild(nextBtn(idx+1===sec.rules.length ? "Try the exercise →" : "Next rule →", onNext));
};
STEP_RENDERERS["present:ex9"] = (root, sec, idx, onNext) => {
  const ex = sec.exercises[0];
  const item = ex.items[idx % ex.items.length];
  const card = el("div","card");
  card.appendChild(el("h3","",ex.title));
  if(ex.instructions) card.appendChild(el("p","muted",ex.instructions));
  card.appendChild(el("div","mtline", item.pronoun+" __"));
  card.appendChild(el("div","muted", item.en));
  root.appendChild(card);
  const ch = el("div","chips");
  ex.choices.forEach(c=>{
    const b = el("button","chip", c);
    b.addEventListener("click", ()=>{
      if(c===item.answer){
        b.classList.add("right"); addXp(5); play(item.answer);
        showFeedback(true,"Sewwa!", item.pronoun+" "+item.answer, onNext);
      } else {
        b.classList.add("wrong");
        [...ch.children].forEach(x=>{ if(x.textContent===item.answer) x.classList.add("right"); });
        showFeedback(false,"Not quite.","Correct: "+item.answer, onNext);
      }
      [...ch.children].forEach(x=>x.disabled=true);
    });
    ch.appendChild(b);
  });
  card.appendChild(ch);
  root.appendChild(skipBtn(onNext));
};

/* ============================================================
   Lesson 6 renderers
   ============================================================ */

STEP_RENDERERS["table:card"] = (root, sec, idx, onNext) => {
  const item = sec.items[idx];
  const card = el("div","card");
  const head = el("div","row");
  head.appendChild(audioBtn(item.singular, {size:"lg"}));
  const w = el("div","grow");
  w.appendChild(el("div","mtline", item.singular));
  w.appendChild(el("div","muted", item.en));
  head.appendChild(w);
  card.appendChild(head);
  if(item.singular!==item.plural){
    const r = el("div","form-row");
    r.appendChild(audioBtn(item.plural));
    r.appendChild(el("div","label","Plural"));
    r.appendChild(el("div","mtform", item.plural));
    card.appendChild(r);
  }
  root.appendChild(card);
  root.appendChild(el("p","muted center", (idx+1)+" / "+sec.items.length));
  root.appendChild(nextBtn(idx+1===sec.items.length ? "Done →" : "Next →", onNext));
  setTimeout(()=>play(item.singular), 250);
};

STEP_RENDERERS["food:flash"] = (root, sec, idx, onNext) => {
  const item = sec.vocab[idx];
  root.appendChild(renderFlash(item.mt, item.en, `Dish ${idx+1} of ${sec.vocab.length}`));
  setTimeout(()=>play(item.mt), 250);
  root.appendChild(nextBtn("Next →", onNext));
};

STEP_RENDERERS["questions:flash"] = (root, sec, idx, onNext) => {
  const item = sec.items[idx];
  const card = el("div","card");
  const head = el("div","row");
  head.appendChild(audioBtn(item.mt, {size:"lg"}));
  const w = el("div","grow");
  w.appendChild(el("div","mtline", item.mt));
  w.appendChild(el("div","muted", item.en));
  head.appendChild(w);
  card.appendChild(head);
  if(item.example){
    const r = el("div","form-row");
    r.appendChild(audioBtn(item.example));
    r.appendChild(el("div","mtform", item.example));
    r.appendChild(el("div","en", item.example_en));
    card.appendChild(r);
  }
  root.appendChild(card);
  root.appendChild(el("p","muted center", (idx+1)+" / "+sec.items.length));
  root.appendChild(nextBtn(idx+1===sec.items.length ? "Done →" : "Next →", onNext));
  setTimeout(()=>play(item.mt), 250);
};
STEP_RENDERERS["questions:passage"] = (root, sec, idx, onNext) => {
  const card = el("div","card");
  card.appendChild(el("h3","",sec.passage.title));
  root.appendChild(card);
  sec.passage.lines.forEach(line=>{
    const r = el("div","passage-line");
    r.appendChild(audioBtn(line.mt));
    const t = el("div","txt");
    t.appendChild(el("span","mt", line.mt));
    t.appendChild(el("span","en", line.en));
    r.appendChild(t);
    r.addEventListener("click", e=>{ if(e.target.tagName!=="BUTTON") play(line.mt); });
    root.appendChild(r);
  });
  if(sec.passage.questions && sec.passage.questions.length){
    root.appendChild(el("h3","","Questions and answers"));
    sec.passage.questions.forEach(q=>{
      const c2 = el("div","card");
      const qr = el("div","row");
      qr.appendChild(audioBtn(q.q));
      const qw = el("div","grow");
      qw.appendChild(el("div","mtline", q.q));
      qw.appendChild(el("div","muted", q.qen));
      qr.appendChild(qw);
      c2.appendChild(qr);
      const ar = el("div","row");
      ar.style.marginTop="8px";
      ar.appendChild(audioBtn(q.a));
      const aw = el("div","grow");
      aw.appendChild(el("div","mtline", q.a));
      aw.appendChild(el("div","muted", q.aen));
      ar.appendChild(aw);
      c2.appendChild(ar);
      root.appendChild(c2);
    });
  }
  root.appendChild(nextBtn("Done →", onNext));
};

STEP_RENDERERS["ghpresent:rules"] = (root, sec, idx, onNext) => {
  root.appendChild(conjTableRule(root, sec.rules[idx], idx, sec.rules.length));
  root.appendChild(nextBtn(idx+1===sec.rules.length ? "Try the exercises →" : "Next rule →", onNext));
};
STEP_RENDERERS["ghpresent:ex5"] = (root, sec, idx, onNext) => {
  const ex = sec.exercises.find(e=>e.id==="ex5");
  const item = ex.items[idx % ex.items.length];
  const card = el("div","card");
  card.appendChild(el("h3","",ex.title));
  if(ex.instructions) card.appendChild(el("p","muted",ex.instructions));
  card.appendChild(el("div","mtline", item.pronoun+" __"));
  card.appendChild(el("div","muted", item.en));
  root.appendChild(card);
  const ch = el("div","chips");
  ex.choices.forEach(c=>{
    const b = el("button","chip", c);
    b.addEventListener("click", ()=>{
      if(c===item.answer){
        b.classList.add("right"); addXp(5); play(item.answer);
        showFeedback(true,"Sewwa!", item.pronoun+" "+item.answer, onNext);
      } else {
        b.classList.add("wrong");
        [...ch.children].forEach(x=>{ if(x.textContent===item.answer) x.classList.add("right"); });
        showFeedback(false,"Not quite.","Correct: "+item.answer, onNext);
      }
      [...ch.children].forEach(x=>x.disabled=true);
    });
    ch.appendChild(b);
  });
  card.appendChild(ch);
  root.appendChild(skipBtn(onNext));
};
STEP_RENDERERS["ghpresent:ex6"] = (root, sec, idx, onNext) => {
  const ex = sec.exercises.find(e=>e.id==="ex6");
  const item = ex.items[idx % ex.items.length];
  const card = el("div","card");
  card.appendChild(el("h3","",ex.title));
  if(ex.instructions) card.appendChild(el("p","muted",ex.instructions));
  card.appendChild(el("div","mtline", item.sentence));
  card.appendChild(el("div","muted", item.en));
  root.appendChild(card);
  const ch = el("div","chips");
  ex.choices.forEach(c=>{
    const b = el("button","chip", c);
    b.addEventListener("click", ()=>{
      if(c===item.answer){
        b.classList.add("right"); addXp(5); play(item.answer);
        showFeedback(true,"Sewwa!", item.answer+" — "+item.en, onNext);
      } else {
        b.classList.add("wrong");
        [...ch.children].forEach(x=>{ if(x.textContent===item.answer) x.classList.add("right"); });
        showFeedback(false,"Not quite.","Correct: "+item.answer, onNext);
      }
      [...ch.children].forEach(x=>x.disabled=true);
    });
    ch.appendChild(b);
  });
  card.appendChild(ch);
  root.appendChild(skipBtn(onNext));
};

/* ============================================================
   Lesson 7 renderers
   ============================================================ */

// transport:card — singular/plural pair (reuses lesson 6 pattern)
STEP_RENDERERS["transport:card"] = STEP_RENDERERS["table:card"];

STEP_RENDERERS["weekend:flash"] = (root, sec, idx, onNext) => {
  const item = sec.vocab[idx];
  root.appendChild(renderFlash(item.mt, item.en, `Phrase ${idx+1} of ${sec.vocab.length}`));
  setTimeout(()=>play(item.mt), 250);
  root.appendChild(nextBtn("Next →", onNext));
};
STEP_RENDERERS["weekend:dialogue"] = (root, sec, idx, onNext) => {
  const card = el("div","card");
  card.appendChild(el("h3","","Mini-dialogue"));
  card.appendChild(el("p","muted","Tap each line to hear it spoken."));
  root.appendChild(card);
  sec.dialogue.forEach(line=>{
    const r = el("div","passage-line");
    r.appendChild(audioBtn(line.mt));
    const t = el("div","txt");
    t.appendChild(el("span","mt", line.mt));
    t.appendChild(el("span","en", line.en));
    r.appendChild(t);
    r.addEventListener("click", e=>{ if(e.target.tagName!=="BUTTON") play(line.mt); });
    root.appendChild(r);
  });
  root.appendChild(nextBtn("Done →", onNext));
};

// seasons:card — one season + its vocab list per page
STEP_RENDERERS["seasons:card"] = (root, sec, idx, onNext) => {
  const item = sec.items[idx];
  const card = el("div","card");
  const head = el("div","row");
  head.appendChild(audioBtn(item.mt, {size:"lg"}));
  const w = el("div","grow");
  const title = el("div","mtline", (item.icon ? item.icon+" " : "") + item.mt);
  w.appendChild(title);
  w.appendChild(el("div","muted", item.en));
  head.appendChild(w);
  card.appendChild(head);
  if(item.vocab && item.vocab.length){
    const forms = el("div","forms");
    forms.style.marginTop = "10px";
    item.vocab.forEach(v=>{
      const r = el("div","form-row");
      r.appendChild(audioBtn(v.mt));
      r.appendChild(el("div","mtform", v.mt));
      r.appendChild(el("div","en", v.en));
      forms.appendChild(r);
    });
    card.appendChild(forms);
  }
  root.appendChild(card);
  root.appendChild(el("p","muted center", (idx+1)+" / "+sec.items.length));
  root.appendChild(nextBtn(idx+1===sec.items.length ? "Done →" : "Next season →", onNext));
  setTimeout(()=>play(item.mt), 250);
};

// particles:flash — small word + meaning
STEP_RENDERERS["particles:flash"] = (root, sec, idx, onNext) => {
  const item = sec.items[idx];
  root.appendChild(renderFlash(item.mt, item.en, `Particle ${idx+1} of ${sec.items.length}`));
  setTimeout(()=>play(item.mt), 250);
  root.appendChild(nextBtn("Next →", onNext));
};
STEP_RENDERERS["particles:examples"] = (root, sec, idx, onNext) => {
  const card = el("div","card");
  card.appendChild(el("h3","","Examples in real sentences"));
  card.appendChild(el("p","muted","Tap each line to hear it."));
  root.appendChild(card);
  sec.examples.forEach(e=>{
    const r = el("div","passage-line");
    r.appendChild(audioBtn(e.phrase));
    const t = el("div","txt");
    t.appendChild(el("span","mt", e.phrase));
    t.appendChild(el("span","en", e.en));
    r.appendChild(t);
    r.addEventListener("click", evt=>{ if(evt.target.tagName!=="BUTTON") play(e.phrase); });
    root.appendChild(r);
  });
  root.appendChild(nextBtn("Try the exercise →", onNext));
};
// Generic sentence multiple-choice — used by particles:ex7, partarticle:ex3, time:ex8
function makeSentenceMcStep(exId){
  return (root, sec, idx, onNext) => {
    const ex = sec.exercises.find(e=>e.id===exId) || sec.exercises[0];
    const item = ex.items[idx % ex.items.length];
    const card = el("div","card");
    card.appendChild(el("h3","",ex.title));
    if(ex.instructions) card.appendChild(el("p","muted",ex.instructions));
    const row = el("div","row");
    row.appendChild(audioBtn(item.sentence, {size:"lg"}));
    const w = el("div","grow");
    w.appendChild(el("div","mtline", item.sentence));
    if(item.en) w.appendChild(el("div","muted", item.en));
    row.appendChild(w);
    card.appendChild(row);
    root.appendChild(card);
    const ch = el("div","chips");
    ex.choices.forEach(c=>{
      const b = el("button","chip", c);
      b.addEventListener("click", ()=>{
        if(c===item.answer){
          b.classList.add("right"); addXp(5); play(item.answer);
          showFeedback(true,"Sewwa!", item.answer, onNext);
        } else {
          b.classList.add("wrong");
          [...ch.children].forEach(x=>{ if(x.textContent===item.answer) x.classList.add("right"); });
          showFeedback(false,"Not quite.","Correct: "+item.answer, onNext);
        }
        [...ch.children].forEach(x=>x.disabled=true);
      });
      ch.appendChild(b);
    });
    card.appendChild(ch);
    root.appendChild(skipBtn(onNext));
  root.appendChild(skipBtn(onNext));
    setTimeout(()=>play(item.sentence), 350);
  };
}
STEP_RENDERERS["particles:ex7"] = makeSentenceMcStep("ex7");

/* ============================================================
   Lesson 8 renderers
   ============================================================ */
STEP_RENDERERS["datetime:flash"] = (root, sec, idx, onNext) => {
  const item = sec.vocab[idx];
  root.appendChild(renderFlash(item.mt, item.en, `${idx+1} of ${sec.vocab.length}`));
  setTimeout(()=>play(item.mt), 250);
  root.appendChild(nextBtn("Next →", onNext));
};
// partarticle:flash — show long form → short fused form
STEP_RENDERERS["partarticle:flash"] = (root, sec, idx, onNext) => {
  const item = sec.items[idx];
  const card = el("div","card");
  const head = el("div","row");
  head.appendChild(audioBtn(item.short, {size:"lg"}));
  const w = el("div","grow");
  w.appendChild(el("div","mtline", item.long+" → "+item.short));
  w.appendChild(el("div","muted", item.en));
  head.appendChild(w);
  card.appendChild(head);
  root.appendChild(card);
  root.appendChild(el("p","muted center", (idx+1)+" / "+sec.items.length));
  root.appendChild(nextBtn("Next →", onNext));
  setTimeout(()=>play(item.short), 250);
};
STEP_RENDERERS["partarticle:ex3"] = makeSentenceMcStep("ex3");

STEP_RENDERERS["map:facts"] = (root, sec, idx, onNext) => {
  const card = el("div","card");
  card.appendChild(el("h2","","About Malta"));
  (sec.facts||[]).forEach(f=>{
    const p = el("p","",f);
    card.appendChild(p);
  });
  root.appendChild(card);
  root.appendChild(nextBtn("Continue →", onNext));
};
STEP_RENDERERS["map:vocab"] = (root, sec, idx, onNext) => {
  const item = sec.vocab[idx];
  root.appendChild(renderFlash(item.mt, item.en, `${idx+1} of ${sec.vocab.length}`));
  setTimeout(()=>play(item.mt), 250);
  root.appendChild(nextBtn("Next →", onNext));
};
// map:regions — show region name + list of localities (no audio per locality, just region)
STEP_RENDERERS["map:regions"] = (root, sec, idx, onNext) => {
  const region = sec.regions[idx];
  const card = el("div","card");
  card.appendChild(el("h2","",region.name));
  card.appendChild(el("p","muted","Localities in this area:"));
  const grid = el("div","");
  grid.style.display = "flex";
  grid.style.flexWrap = "wrap";
  grid.style.gap = "8px";
  region.places.forEach(p=>{
    const chip = el("div","");
    chip.style.padding = "8px 12px";
    chip.style.borderRadius = "99px";
    chip.style.background = "var(--bg)";
    chip.style.border = "1px solid var(--line)";
    chip.style.color = "var(--primary-2)";
    chip.style.fontWeight = "600";
    chip.style.fontSize = ".95rem";
    chip.textContent = p;
    grid.appendChild(chip);
  });
  card.appendChild(grid);
  root.appendChild(card);
  root.appendChild(el("p","muted center", (idx+1)+" / "+sec.regions.length));
  root.appendChild(nextBtn(idx+1===sec.regions.length ? "Done →" : "Next region →", onNext));
};

// places:flash — name + kind + descriptive note
STEP_RENDERERS["places:flash"] = (root, sec, idx, onNext) => {
  const item = sec.items[idx];
  const card = el("div","card");
  const head = el("div","row");
  head.appendChild(audioBtn(item.mt, {size:"lg"}));
  const w = el("div","grow");
  w.appendChild(el("div","mtline", item.mt));
  w.appendChild(el("div","muted", item.en));
  head.appendChild(w);
  card.appendChild(head);
  if(item.kind){
    const k = el("div","");
    k.style.marginTop = "10px";
    k.style.fontSize = ".82rem";
    k.style.fontWeight = "700";
    k.style.color = "var(--accent)";
    k.style.letterSpacing = ".04em";
    k.textContent = item.kind;
    card.appendChild(k);
  }
  if(item.note){
    const n = el("p","",item.note);
    n.style.marginTop = "6px";
    card.appendChild(n);
  }
  root.appendChild(card);
  root.appendChild(el("p","muted center", (idx+1)+" / "+sec.items.length));
  root.appendChild(nextBtn(idx+1===sec.items.length ? "Done →" : "Next →", onNext));
  setTimeout(()=>play(item.mt), 250);
};

/* ============================================================
   Lesson 9 renderers
   ============================================================ */
STEP_RENDERERS["directions:flash"] = (root, sec, idx, onNext) => {
  const item = sec.vocab[idx];
  root.appendChild(renderFlash(item.mt, item.en, `${idx+1} of ${sec.vocab.length}`));
  setTimeout(()=>play(item.mt), 250);
  root.appendChild(nextBtn("Next →", onNext));
};
STEP_RENDERERS["directions:dialogue"] = (root, sec, idx, onNext) => {
  const card = el("div","card");
  card.appendChild(el("h3","","Asking for directions"));
  card.appendChild(el("p","muted","Tap each line to hear it."));
  root.appendChild(card);
  sec.dialogue.forEach(line=>{
    const r = el("div","passage-line");
    r.appendChild(audioBtn(line.mt));
    const t = el("div","txt");
    t.appendChild(el("span","mt", line.mt));
    t.appendChild(el("span","en", line.en));
    r.appendChild(t);
    r.addEventListener("click", e=>{ if(e.target.tagName!=="BUTTON") play(line.mt); });
    root.appendChild(r);
  });
  root.appendChild(nextBtn("Continue →", onNext));
};
STEP_RENDERERS["directions:winds"] = (root, sec, idx, onNext) => {
  const item = sec.winds[idx];
  root.appendChild(renderFlash(item.mt, item.en, `Wind ${idx+1} of ${sec.winds.length}`));
  setTimeout(()=>play(item.mt), 250);
  root.appendChild(nextBtn("Next →", onNext));
};

STEP_RENDERERS["timeexp:flash"] = (root, sec, idx, onNext) => {
  const item = sec.vocab[idx];
  root.appendChild(renderFlash(item.mt, item.en, `${idx+1} of ${sec.vocab.length}`));
  setTimeout(()=>play(item.mt), 250);
  root.appendChild(nextBtn("Next →", onNext));
};
STEP_RENDERERS["time:hours"] = (root, sec, idx, onNext) => {
  const item = sec.hours[idx];
  const card = el("div","card number-card");
  card.appendChild(el("div","num", item.n===0 ? "12" : String(item.n)));
  card.appendChild(el("div","mtword", item.mt));
  card.appendChild(el("div","enword", item.en));
  card.appendChild(audioBtn(item.mt, {size:"lg"}));
  card.addEventListener("click", e=>{ if(e.target.tagName!=="BUTTON") play(item.mt); });
  root.appendChild(card);
  root.appendChild(el("p","muted center", (idx+1)+" / "+sec.hours.length));
  root.appendChild(nextBtn("Next →", onNext));
  setTimeout(()=>play(item.mt), 250);
};
STEP_RENDERERS["time:patterns"] = (root, sec, idx, onNext) => {
  const item = sec.patterns[idx];
  root.appendChild(renderFlash(item.mt, item.en, `Pattern ${idx+1} of ${sec.patterns.length}`));
  setTimeout(()=>play(item.mt), 250);
  root.appendChild(nextBtn("Next →", onNext));
};
STEP_RENDERERS["time:ex8"] = makeSentenceMcStep("ex8");

/* ============================================================
   Extras — survival Maltese
   ============================================================ */
// All four sections reuse the same flash + dialogue pattern as 'weekend'.
["polite", "cafe", "work", "shopping"].forEach(sid => {
  STEP_RENDERERS[sid+":flash"] = STEP_RENDERERS["weekend:flash"];
  STEP_RENDERERS[sid+":dialogue"] = STEP_RENDERERS["weekend:dialogue"];
});

/* ============================================================
   Boot
   ============================================================ */
async function boot(){
  try{
    const [index, manifest] = await Promise.all([
      fetch(v("lessons/index.json")).then(r=>r.json()),
      fetch(v("audio/manifest.json")).then(r=>r.json()),
    ]);
    State.index = index;
    State.manifest = manifest;
    // preload all lessons so home page shows accurate progress
    await Promise.all(index.lessons.map(L => loadLesson(L.id).catch(e=>console.warn(e))));
    route();
    // iOS Safari doesn't fire beforeinstallprompt — trigger the manual instructions
    // a few seconds after first load so it isn't immediately in the user's face.
    if(isIOS() && !isStandalone()){
      setTimeout(maybeShowInstallPrompt, 6000);
    }
  }catch(e){
    document.getElementById("app").innerHTML = "<p>Could not load. Check your connection and refresh.</p><p class='muted'>"+(e.message||e)+"</p>";
    console.error(e);
  }
}
boot();

})();
