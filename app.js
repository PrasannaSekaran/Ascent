/* ============================================================
   Ascent — app logic (vanilla JS, no build step)
   ============================================================ */
(() => {
  "use strict";

  const C = window.COURSE;
  const MODS = C.modules;
  const ALL_PROJECTS = [...C.projects, C.grand];
  const XP = { topic: 10, quiz: 15, module: 100, scenario: 50 };
  const SLOT_COLORS = { a: "#4F46E5", b: "#0D9488" };
  const STORE = "ascent.v1";
  const API = "/api/squad";
  const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const LEVELS = [
    [0, "Cloud Curious"], [300, "Shell Explorer"], [700, "Commit Crafter"], [1200, "Container Captain"],
    [1800, "Pipeline Pilot"], [2600, "Cloud Builder"], [3500, "Cluster Commander"], [4500, "Infra Architect"],
    [5600, "Reliability Engineer"], [6800, "Platform Legend"],
  ];

  const TOPIC_TOTAL = MODS.reduce((n, m) => n + m.topics.length, 0);
  const QUIZ_TOTAL = MODS.reduce((n, m) => n + m.quiz.length, 0);

  const BADGES = [
    { id: "first", ic: "◆", t: "First Step", d: "Complete your first checkpoint", test: (s) => s.topicsDone >= 1 },
    { id: "ten", ic: "➶", t: "Momentum", d: "Complete 10 checkpoints", test: (s) => s.topicsDone >= 10 },
    { id: "half", ic: "◐", t: "Halfway Up", d: "Half of all checkpoints done", test: (s) => s.topicsDone >= TOPIC_TOTAL / 2 },
    ...C.stages.map((st) => ({
      id: "stage" + st.id, ic: ["Ⅰ", "Ⅱ", "Ⅲ", "Ⅳ", "Ⅴ"][st.id - 1], t: st.name + " Cleared", d: `Finish every module in Stage ${st.id}`,
      test: (s) => MODS.filter((m) => m.stage === st.id).every((m) => s.perMod[m.id].complete),
    })),
    { id: "quiz", ic: "?", t: "Quiz Whiz", d: "Answer 15 quiz questions correctly", test: (s) => s.quizCorrect >= 15 },
    { id: "flawless", ic: "✦", t: "Flawless", d: "Every quiz question correct", test: (s) => s.quizCorrect === QUIZ_TOTAL },
    { id: "builder", ic: "⚒", t: "Builder", d: "Ship your first project", test: (s) => s.projDone >= 1 },
    { id: "shipper", ic: "⛴", t: "Serial Shipper", d: "Ship 5 projects", test: (s) => s.projDone >= 5 },
    { id: "grand", ic: "♛", t: "Grand Architect", d: "Complete the Grand Capstone", test: (s, L) => !!L.projects.grand },
    { id: "fire", ic: "⚑", t: "Firefighter", d: "Solve 5 War Room drills", test: (s) => s.drills >= 5 },
    { id: "ic", ic: "⚡", t: "Incident Commander", d: "Solve every War Room drill", test: (s) => s.drills === C.scenarios.length },
    { id: "streak3", ic: "≋", t: "On a Roll", d: "3-day learning streak", test: (s) => s.bestStreak >= 3 },
    { id: "streak7", ic: "☼", t: "Week Warrior", d: "7-day learning streak", test: (s) => s.bestStreak >= 7 },
    { id: "scribe", ic: "✎", t: "Scribe", d: "Write notes in 5 modules", test: (s) => s.notedMods >= 5 },
    { id: "duo", ic: "∞", t: "Better Together", d: "You and your buddy both finish the same module", test: (s, L, b) => !!b && MODS.some((m) => s.perMod[m.id].complete && b.perMod[m.id].complete) },
  ];

  /* ------------------------- state ------------------------- */
  const blank = (name) => ({ name, topics: {}, quiz: {}, projects: {}, scenarios: {}, notes: {}, updated: 0 });
  const normalize = (L, fallbackName) => ({ ...blank(fallbackName || "Learner"), ...(L || {}) });

  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(STORE));
      if (s && s.learners) {
        s.learners.a = normalize(s.learners.a, "Learner 1");
        s.learners.b = normalize(s.learners.b, "Learner 2");
        return s;
      }
    } catch (e) { /* ignore */ }
    return { setup: false, me: "a", squad: "", learners: { a: blank("Learner 1"), b: blank("Learner 2") } };
  }
  let S = load();
  const ui = { noteTab: "me", revealed: {}, notesFilter: "", pendingRender: false, notePreview: false };

  const save = () => localStorage.setItem(STORE, JSON.stringify(S));
  const meId = () => S.me;
  const budId = () => (S.me === "a" ? "b" : "a");
  const me = () => S.learners[meId()];
  const bud = () => S.learners[budId()];
  const colorOf = (id) => SLOT_COLORS[id];

  function touch() {
    me().updated = Date.now();
    save();
    schedulePush();
  }

  /* ------------------------- stats ------------------------- */
  const dayKey = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };

  function streaks(L) {
    const stamps = [
      ...Object.values(L.topics), ...Object.values(L.projects), ...Object.values(L.scenarios),
      ...Object.values(L.quiz).map((q) => q.ts), ...Object.values(L.notes).map((n) => n.ts),
    ].filter(Boolean);
    const days = new Set(stamps.map(dayKey));
    if (!days.size) return { cur: 0, best: 0, days: 0 };
    // current streak
    let cur = 0; const d = new Date();
    if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1);
    while (days.has(dayKey(d))) { cur++; d.setDate(d.getDate() - 1); }
    // best streak
    const sorted = [...new Set(stamps.map((t) => { const x = new Date(t); x.setHours(0, 0, 0, 0); return x.getTime(); }))].sort((a, b) => a - b);
    let best = 1, run = 1;
    for (let i = 1; i < sorted.length; i++) {
      const diff = Math.round((sorted[i] - sorted[i - 1]) / 864e5);
      run = diff === 1 ? run + 1 : 1; best = Math.max(best, run);
    }
    return { cur, best: Math.max(best, cur), days: days.size };
  }

  function stats(L) {
    let xp = 0, topicsDone = 0, modsDone = 0, quizCorrect = 0, projDone = 0, notedMods = 0;
    const perMod = {};
    for (const m of MODS) {
      const done = m.topics.filter((t) => L.topics[`${m.id}.${t.id}`]).length;
      const qc = m.quiz.filter((_, i) => L.quiz[`${m.id}.${i}`]?.correct).length;
      const qa = m.quiz.filter((_, i) => L.quiz[`${m.id}.${i}`]).length;
      const complete = done === m.topics.length;
      topicsDone += done; quizCorrect += qc;
      xp += done * XP.topic + qc * XP.quiz + (complete ? XP.module : 0);
      if (complete) modsDone++;
      if ((L.notes[m.id]?.text || "").trim().length > 10) notedMods++;
      perMod[m.id] = { done, total: m.topics.length, pct: done / m.topics.length, complete, qc, qa };
    }
    for (const p of ALL_PROJECTS) if (L.projects[p.id]) { projDone++; xp += p.pts; }
    const drills = C.scenarios.filter((s) => L.scenarios[s.id]).length;
    xp += drills * XP.scenario;
    const st = streaks(L);
    let li = 0; for (let i = 0; i < LEVELS.length; i++) if (xp >= LEVELS[i][0]) li = i;
    const next = LEVELS[li + 1];
    const lvl = {
      n: li + 1, title: LEVELS[li][1], floor: LEVELS[li][0], next: next ? next[0] : null,
      pct: next ? (xp - LEVELS[li][0]) / (next[0] - LEVELS[li][0]) : 1,
    };
    const s = { xp, topicsDone, modsDone, quizCorrect, projDone, drills, notedMods, perMod, lvl, streak: st.cur, bestStreak: st.best, activeDays: st.days, pct: topicsDone / TOPIC_TOTAL };
    return s;
  }

  function badgesOf(id) {
    const L = S.learners[id], s = stats(L), b = stats(S.learners[id === "a" ? "b" : "a"]);
    return BADGES.filter((x) => x.test(s, L, b)).map((x) => x.id);
  }

  function events(id, limit = 40) {
    const L = S.learners[id], ev = [];
    for (const m of MODS) {
      for (const t of m.topics) { const ts = L.topics[`${m.id}.${t.id}`]; if (ts) ev.push({ ts, id, kind: "topic", text: `checked off <b>${esc(t.t)}</b>`, sub: m.title }); }
      const s = stats(L).perMod[m.id];
      if (s.complete) { const ts = Math.max(...m.topics.map((t) => L.topics[`${m.id}.${t.id}`])); ev.push({ ts: ts + 1, id, kind: "module", text: `completed module <b>${esc(m.title)}</b>`, sub: `+${XP.module} XP bonus` }); }
    }
    for (const p of ALL_PROJECTS) if (L.projects[p.id]) ev.push({ ts: L.projects[p.id], id, kind: "project", text: `shipped <b>${esc(p.title)}</b>`, sub: `+${p.pts} XP` });
    for (const sc of C.scenarios) if (L.scenarios[sc.id]) ev.push({ ts: L.scenarios[sc.id], id, kind: "drill", text: `solved drill <b>${esc(sc.title)}</b>`, sub: sc.tag });
    return ev.sort((a, b) => b.ts - a.ts).slice(0, limit);
  }

  /* ------------------------- helpers ------------------------- */
  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  const fmtCode = (s) => esc(s).replace(/`([^`]+)`/g, "<code>$1</code>");
  const initials = (n) => (n || "?").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };
  const ago = (ts) => {
    const s = (Date.now() - ts) / 1000;
    if (s < 60) return "just now"; if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`; if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`;
    return new Date(ts).toLocaleDateString();
  };
  const SHORT = { linux: "Linux", net: "Network", git: "Git", script: "Scripting", docker: "Docker", cicd: "CI/CD", aws: "AWS", azure: "Azure", k8s: "K8s", iac: "IaC", obs: "Observe", sec: "DevSecOps" };
  const stageOf = (id) => C.stages.find((s) => s.id === id);

  function avatar(id, size = "md") {
    const L = S.learners[id];
    return `<span class="av av-${size}" style="--c:${colorOf(id)}" title="${esc(L.name)}">${esc(initials(L.name))}</span>`;
  }

  function ring(pct, size = 64, stroke = 7, color = "var(--brand)", label = "") {
    const r = (size - stroke) / 2, c = 2 * Math.PI * r, off = c * (1 - Math.max(0, Math.min(1, pct)));
    return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="var(--line)" stroke-width="${stroke}" fill="none"/>
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="${color}" stroke-width="${stroke}" fill="none"
        stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${off}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
      ${label ? `<text x="50%" y="50%" dominant-baseline="central" text-anchor="middle">${label}</text>` : ""}
    </svg>`;
  }

  function duoBars(mid) {
    return ["a", "b"].map((id) => {
      const p = stats(S.learners[id]).perMod[mid];
      return `<div class="duo-bar" title="${esc(S.learners[id].name)}: ${p.done}/${p.total}">
        <span class="duo-bar-name" style="color:${colorOf(id)}">${esc(initials(S.learners[id].name))}</span>
        <span class="bar"><i style="width:${p.pct * 100}%;background:${colorOf(id)}"></i></span>
        <span class="duo-bar-n">${p.done}/${p.total}</span>
      </div>`;
    }).join("");
  }

  function md(text) {
    const blocks = String(text || "").split(/```/);
    return blocks.map((b, i) => {
      if (i % 2) return `<pre>${esc(b.replace(/^\w*\n/, ""))}</pre>`;
      let html = "", inList = false;
      for (const raw of b.split("\n")) {
        let line = esc(raw)
          .replace(/`([^`]+)`/g, "<code>$1</code>")
          .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
          .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
        const li = line.match(/^\s*[-*]\s+(.*)/);
        if (li) { if (!inList) { html += "<ul>"; inList = true; } html += `<li>${li[1]}</li>`; continue; }
        if (inList) { html += "</ul>"; inList = false; }
        const h = line.match(/^(#{1,3})\s+(.*)/);
        if (h) html += `<h${h[1].length + 3}>${h[2]}</h${h[1].length + 3}>`;
        else if (line.trim()) html += `<p>${line}</p>`;
      }
      if (inList) html += "</ul>";
      return html;
    }).join("");
  }

  /* ------------------------- celebration ------------------------- */
  const PALETTE = ["#4F46E5", "#06B6D4", "#F59E0B", "#10B981", "#EC4899", "#8B5CF6"];
  function burst(x = 0.5, y = 0.5, n = 40) {
    if (REDUCED || !window.confetti) return;
    window.confetti({ particleCount: n, spread: 60, startVelocity: 26, scalar: 0.8, ticks: 120, origin: { x, y }, colors: PALETTE, disableForReducedMotion: true });
  }
  function bigBoom() {
    if (REDUCED || !window.confetti) return;
    const end = Date.now() + 1100;
    (function frame() {
      window.confetti({ particleCount: 5, angle: 60, spread: 65, origin: { x: 0, y: 0.7 }, colors: PALETTE });
      window.confetti({ particleCount: 5, angle: 120, spread: 65, origin: { x: 1, y: 0.7 }, colors: PALETTE });
      if (Date.now() < end) requestAnimationFrame(frame);
    })();
    window.confetti({ particleCount: 160, spread: 100, origin: { y: 0.55 }, colors: PALETTE });
  }

  function toast(html, kind = "") {
    const el = document.createElement("div");
    el.className = `toast ${kind}`;
    el.innerHTML = html;
    document.getElementById("toasts").appendChild(el);
    setTimeout(() => el.classList.add("out"), 2600);
    setTimeout(() => el.remove(), 3100);
  }

  function snapshot() { return { s: stats(me()), b: badgesOf(meId()) }; }

  function celebrate(before, origin) {
    const after = snapshot();
    const gained = after.s.xp - before.s.xp;
    if (gained > 0) {
      toast(`<span class="xp-chip">+${gained} XP</span> Nice work`, "good");
      if (origin) burst(origin.x, origin.y, 26);
    }
    const newMods = MODS.filter((m) => after.s.perMod[m.id].complete && !before.s.perMod[m.id].complete);
    const newBadges = after.b.filter((b) => !before.b.includes(b)).map((id) => BADGES.find((x) => x.id === id));
    if (after.s.lvl.n > before.s.lvl.n) {
      setTimeout(() => { bigBoom(); toast(`<b>Level up!</b> You're now Level ${after.s.lvl.n} · ${esc(after.s.lvl.title)}`, "level"); }, 300);
    }
    if (newMods.length) setTimeout(() => moduleCompleteModal(newMods[0], newBadges), 350);
    else newBadges.forEach((b, i) => setTimeout(() => { burst(0.5, 0.2, 60); toast(`<span class="badge-ic sm">${b.ic}</span> Badge unlocked: <b>${esc(b.t)}</b>`, "badge"); }, 400 + i * 500));
  }

  function moduleCompleteModal(m, newBadges) {
    bigBoom();
    const idx = MODS.indexOf(m), next = MODS[idx + 1];
    openModal(`
      <div class="celebrate">
        <div class="tile tile-xl" style="--c:${m.color}">${m.code}</div>
        <p class="eyebrow">Module complete</p>
        <h2>${esc(m.title)}</h2>
        <p class="muted">Every checkpoint done. That's real progress — take a breath and enjoy it.</p>
        <div class="celebrate-xp"><span class="xp-chip big">+${XP.module} XP bonus</span></div>
        ${newBadges.length ? `<div class="celebrate-badges">${newBadges.map((b) => `<div class="badge earned"><span class="badge-ic">${b.ic}</span><b>${esc(b.t)}</b><small>${esc(b.d)}</small></div>`).join("")}</div>` : ""}
        <div class="row-gap center">
          ${m.quiz.some((_, i) => !me().quiz[`${m.id}.${i}`]) ? `<button class="btn ghost" data-act="close-modal" data-go="#/module/${m.id}#quiz">Take the quiz</button>` : ""}
          ${next ? `<button class="btn primary" data-act="close-modal" data-go="#/module/${next.id}">Next: ${esc(next.title)} →</button>` : `<button class="btn primary" data-act="close-modal" data-go="#/projects">On to the projects →</button>`}
        </div>
      </div>`);
  }

  /* ------------------------- modal ------------------------- */
  function openModal(html, opts = {}) {
    const wrap = document.getElementById("modal");
    wrap.innerHTML = `<div class="modal-backdrop" ${opts.locked ? "" : 'data-act="close-modal"'}></div><div class="modal ${opts.wide ? "wide" : ""}" role="dialog" aria-modal="true">${opts.locked ? "" : '<button class="modal-x" data-act="close-modal" aria-label="Close">×</button>'}${html}</div>`;
    wrap.hidden = false;
    requestAnimationFrame(() => wrap.classList.add("open"));
  }
  function closeModal() {
    const wrap = document.getElementById("modal");
    wrap.classList.remove("open");
    setTimeout(() => { wrap.hidden = true; wrap.innerHTML = ""; }, 180);
  }

  function randomCode() {
    const a = "abcdefghjkmnpqrstuvwxyz23456789";
    let s = ""; const r = crypto.getRandomValues(new Uint8Array(12));
    r.forEach((x) => (s += a[x % a.length]));
    return `ascent-${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}`;
  }

  function settingsModal(first = false) {
    const code = S.squad || randomCode();
    openModal(`
      <div class="setup">
        <p class="eyebrow">${first ? "Welcome aboard" : "Squad settings"}</p>
        <h2>${first ? "Set up your learning duo" : "You, your buddy & sync"}</h2>
        <p class="muted">${first ? "Ascent tracks two learners side-by-side. Each of you uses your own device, picks a different slot and enters the <b>same squad code</b> — progress and notes then sync between you." : "Change names, switch slot or join a different squad."}</p>
        <form id="setupForm" class="form">
          <div class="field">
            <label>Which slot are you?</label>
            <div class="seg">
              <label><input type="radio" name="slot" value="a" ${S.me === "a" ? "checked" : ""}/><span><i style="background:${SLOT_COLORS.a}"></i>Learner 1</span></label>
              <label><input type="radio" name="slot" value="b" ${S.me === "b" ? "checked" : ""}/><span><i style="background:${SLOT_COLORS.b}"></i>Learner 2</span></label>
            </div>
            <small>Your buddy picks the other slot on their device.</small>
          </div>
          <div class="grid2">
            <div class="field"><label for="f-me">Your name</label><input id="f-me" name="me" maxlength="24" required value="${esc(first ? "" : me().name)}" placeholder="e.g. Rohit"/></div>
            <div class="field"><label for="f-bud">Buddy's name</label><input id="f-bud" name="bud" maxlength="24" value="${esc(first ? "" : bud().name)}" placeholder="Syncs from their device"/></div>
          </div>
          <div class="field">
            <label for="f-code">Squad code</label>
            <div class="code-row">
              <input id="f-code" name="code" maxlength="64" value="${esc(code)}" spellcheck="false" autocomplete="off"/>
              <button type="button" class="btn ghost sm" data-act="copy-code">Copy</button>
              <button type="button" class="btn ghost sm" data-act="new-code">New</button>
            </div>
            <small>Share this with your buddy. Treat it like a password — anyone with the code can see your squad. Leave empty to stay local-only.</small>
          </div>
          <div class="row-gap end"><button class="btn primary" type="submit">${first ? "Start the climb →" : "Save"}</button></div>
        </form>
        ${first ? "" : `
        <div class="setup-extra">
          <h4>Backup & portability</h4>
          <p class="muted sm">Works even without cloud sync: export a file and send it to your buddy to import.</p>
          <div class="row-gap">
            <button class="btn ghost sm" data-act="export">Export progress (.json)</button>
            <label class="btn ghost sm file-btn">Import .json<input type="file" accept="application/json" id="importFile" hidden/></label>
            <button class="btn danger sm" data-act="reset">Reset my progress</button>
          </div>
          <p class="muted sm sync-explain">${syncExplain()}</p>
        </div>`}
      </div>`, { locked: first });
  }

  /* ------------------------- sync ------------------------- */
  let syncState = "local", pushTimer = null, pulling = false;
  const SYNC_LABEL = {
    local: ["Local only", "off"], syncing: ["Syncing…", "busy"], synced: ["Synced", "ok"],
    offline: ["Offline", "warn"], nostore: ["Storage not set up", "warn"], error: ["Sync error", "warn"],
  };
  function syncExplain() {
    return {
      local: "No squad code set — progress is saved in this browser only.",
      synced: "Cloud sync is on. Changes are pushed within seconds and pulled every 15s.",
      syncing: "Syncing with your squad…",
      offline: "Couldn't reach the sync API (offline, or opened as a local file). Progress is still saved in this browser.",
      nostore: "The /api/squad function is deployed but no Redis store is connected. In Vercel: Storage → add Upstash Redis → connect to this project → redeploy.",
      error: "The sync API returned an error. Progress is still saved locally.",
    }[syncState];
  }
  function setSync(s) {
    syncState = s;
    const [label, cls] = SYNC_LABEL[s];
    const el = document.getElementById("syncPill");
    el.className = `sync-pill ${cls}`;
    el.innerHTML = `<i></i>${label}`;
    el.title = syncExplain();
  }

  async function pull() {
    if (!S.squad) { setSync("local"); return; }
    if (pulling) return; pulling = true;
    try {
      const r = await fetch(`${API}?code=${encodeURIComponent(S.squad)}`, { cache: "no-store" });
      if (r.status === 501) { setSync("nostore"); return; }
      if (!r.ok) { setSync("error"); return; }
      const d = await r.json();
      let changed = false;
      for (const id of ["a", "b"]) {
        const remote = d[id];
        if (remote && (remote.updated || 0) > (S.learners[id].updated || 0)) {
          S.learners[id] = normalize(remote, S.learners[id].name); changed = true;
        }
      }
      const myRemote = d[meId()];
      if (!myRemote || (myRemote.updated || 0) < (me().updated || 0)) schedulePush(50);
      save(); setSync("synced");
      if (changed) safeRender();
    } catch (e) { setSync("offline"); }
    finally { pulling = false; }
  }

  function schedulePush(delay = 1200) {
    if (!S.squad) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(push, delay);
  }
  async function push() {
    if (!S.squad) return;
    setSync("syncing");
    try {
      const r = await fetch(`${API}?code=${encodeURIComponent(S.squad)}&learner=${meId()}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(me()),
      });
      if (r.status === 501) return setSync("nostore");
      setSync(r.ok ? "synced" : "error");
    } catch (e) { setSync("offline"); }
  }

  function safeRender() {
    const a = document.activeElement;
    if (a && (a.tagName === "TEXTAREA" || a.tagName === "INPUT") && document.getElementById("view").contains(a)) { ui.pendingRender = true; return; }
    render();
  }

  /* ------------------------- views ------------------------- */
  function nextUp(L) {
    for (const m of MODS) {
      const t = m.topics.find((t) => !L.topics[`${m.id}.${t.id}`]);
      if (t) return { m, t };
    }
    return null;
  }

  function greeting() {
    const h = new Date().getHours();
    return h < 5 ? "Burning the midnight oil" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  }

  function learnerCard(id) {
    const L = S.learners[id], s = stats(L), isMe = id === meId();
    return `<div class="learner-card" style="--c:${colorOf(id)}">
      <div class="lc-head">
        ${avatar(id, "lg")}
        <div>
          <div class="lc-name">${esc(L.name)} ${isMe ? '<span class="you">you</span>' : ""}</div>
          <div class="lc-level">Level ${s.lvl.n} · ${esc(s.lvl.title)}</div>
        </div>
        <div class="lc-xp"><b>${s.xp.toLocaleString()}</b><span>XP</span></div>
      </div>
      <div class="lc-bar"><span class="bar thick"><i style="width:${s.lvl.pct * 100}%;background:linear-gradient(90deg,var(--c),color-mix(in srgb,var(--c) 55%,#06B6D4))"></i></span>
        <small>${s.lvl.next ? `${(s.lvl.next - s.xp).toLocaleString()} XP to Level ${s.lvl.n + 1}` : "Max level — legend status"}</small></div>
      <div class="lc-stats">
        <div><b>${s.topicsDone}<em>/${TOPIC_TOTAL}</em></b><span>Checkpoints</span></div>
        <div><b>${s.modsDone}<em>/${MODS.length}</em></b><span>Modules</span></div>
        <div><b>${s.projDone}</b><span>Projects</span></div>
        <div><b>${s.streak}<em>d</em></b><span>Streak</span></div>
      </div>
    </div>`;
  }

  function viewDashboard() {
    const L = me(), s = stats(L), n = nextUp(L), sb = stats(bud());
    const stage = n ? stageOf(n.m.stage) : null;
    const diff = s.xp - sb.xp;
    const race = diff === 0 ? "Neck and neck — perfectly matched." : diff > 0 ? `You're ahead by ${diff} XP. Keep the pace!` : `${esc(bud().name)} leads by ${-diff} XP. Time to catch up!`;
    const feed = [...events("a", 12), ...events("b", 12)].sort((a, b) => b.ts - a.ts).slice(0, 10);
    const myBadges = badgesOf(meId());

    return `
    <section class="hero">
      <div class="hero-main">
        <p class="eyebrow">${greeting()}, ${esc(L.name)}</p>
        <h1>From your first terminal command to <span class="grad">production-grade cloud</span>.</h1>
        <p class="lead">${MODS.length} modules · ${TOPIC_TOTAL} checkpoints · ${C.projects.length + 1} real projects · ${C.scenarios.length} incident drills. Climb it together.</p>
        ${n ? `
        <a class="continue" href="#/module/${n.m.id}">
          <span class="tile" style="--c:${n.m.color}">${n.m.code}</span>
          <span class="continue-text"><small>Up next · Stage ${stage.id}: ${esc(stage.name)}</small><b>${esc(n.t.t)}</b><span>${esc(n.m.title)}</span></span>
          <span class="continue-go">Continue →</span>
        </a>` : `
        <a class="continue" href="#/projects"><span class="tile" style="--c:#4F46E5">★</span><span class="continue-text"><small>All modules complete</small><b>Time to build the capstones</b><span>Projects</span></span><span class="continue-go">Go →</span></a>`}
      </div>
      <div class="hero-ring">
        ${ring(s.pct, 168, 14, "url(#heroGrad)", "")}
        <svg width="0" height="0" style="position:absolute"><defs><linearGradient id="heroGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4F46E5"/><stop offset="1" stop-color="#06B6D4"/></linearGradient></defs></svg>
        <div class="hero-ring-label"><b>${Math.round(s.pct * 100)}%</b><span>of the path</span></div>
      </div>
    </section>

    <section class="duo">
      ${learnerCard(meId())}
      <div class="duo-vs"><span>VS</span><small>${race}</small></div>
      ${learnerCard(budId())}
    </section>

    <section class="card">
      <div class="card-head"><h3>The climb</h3><a href="#/path" class="link">Full path →</a></div>
      <div class="climb">
        ${C.stages.map((st) => `
          <div class="climb-stage">
            <div class="climb-label"><span>Stage ${st.id}</span><b>${esc(st.name)}</b></div>
            <div class="climb-nodes">
              ${MODS.filter((m) => m.stage === st.id).map((m) => {
                const pm = s.perMod[m.id], pb = sb.perMod[m.id];
                return `<a class="node ${pm.complete ? "done" : pm.done ? "active" : ""}" href="#/module/${m.id}" style="--c:${m.color}" title="${esc(m.title)}">
                  ${ring(pm.pct, 58, 5, m.color, "")}<span class="node-code">${pm.complete ? "✓" : m.code}</span>
                  ${pb.done ? `<span class="node-bud" style="--b:${colorOf(budId())}" title="${esc(bud().name)}: ${pb.done}/${pb.total}">${pb.complete ? "✓" : Math.round(pb.pct * 100) + "%"}</span>` : ""}
                  <span class="node-name">${esc(SHORT[m.id] || m.code)}</span>
                </a>`;
              }).join("")}
            </div>
          </div>`).join('<div class="climb-sep"></div>')}
        <div class="climb-sep"></div>
        <div class="climb-stage"><div class="climb-label"><span>Finale</span><b>Capstone</b></div>
          <div class="climb-nodes"><a class="node ${L.projects.grand ? "done" : ""}" href="#/projects" style="--c:#F59E0B" title="Grand Capstone">${ring(L.projects.grand ? 1 : 0, 58, 5, "#F59E0B")}<span class="node-code">♛</span><span class="node-name">Grand</span></a></div>
        </div>
      </div>
    </section>

    <section class="grid-2">
      <div class="card">
        <div class="card-head"><h3>Squad activity</h3></div>
        ${feed.length ? `<ul class="feed">${feed.map((e) => `
          <li>${avatar(e.id, "sm")}<div><p><b>${esc(S.learners[e.id].name)}</b> ${e.text}</p><small>${esc(e.sub)} · ${ago(e.ts)}</small></div>
          <span class="feed-kind k-${e.kind}">${e.kind}</span></li>`).join("")}</ul>`
        : `<div class="empty"><p>No activity yet.</p><small>Check off your first checkpoint — it'll show up here for both of you.</small></div>`}
      </div>
      <div class="card">
        <div class="card-head"><h3>Your badges</h3><span class="muted sm">${myBadges.length}/${BADGES.length}</span></div>
        <div class="badge-grid compact">${BADGES.map((b) => `<div class="badge ${myBadges.includes(b.id) ? "earned" : ""}" title="${esc(b.d)}"><span class="badge-ic">${b.ic}</span><b>${esc(b.t)}</b></div>`).join("")}</div>
        <div class="xp-legend">
          <span><b>+${XP.topic}</b> checkpoint</span><span><b>+${XP.quiz}</b> correct answer</span><span><b>+${XP.module}</b> module</span><span><b>+${XP.scenario}</b> drill</span><span><b>+150–1000</b> project</span>
        </div>
      </div>
    </section>`;
  }

  function moduleCard(m) {
    const s = stats(me()).perMod[m.id];
    return `<a class="mod-card ${s.complete ? "complete" : ""}" href="#/module/${m.id}" style="--c:${m.color}">
      <div class="mod-card-top">
        <span class="tile" style="--c:${m.color}">${m.code}</span>
        ${s.complete ? '<span class="chip done">✓ Complete</span>' : s.done ? '<span class="chip prog">In progress</span>' : ""}
      </div>
      <h4>${esc(m.title)}</h4>
      <p>${esc(m.tagline)}</p>
      <div class="mod-meta"><span>≈ ${m.hours} h</span><span>${m.topics.length} checkpoints</span><span>${m.quiz.length} quiz</span></div>
      <div class="duo-bars">${duoBars(m.id)}</div>
    </a>`;
  }

  function viewPath() {
    const total = MODS.reduce((n, m) => n + m.hours, 0);
    return `
    <section class="page-head">
      <p class="eyebrow">The path</p>
      <h1>Five stages. ${MODS.length} modules. One summit.</h1>
      <p class="lead">Roughly ${total} focused hours — about 6–8 months at 8–10 hours a week. Go in order; each stage builds on the last. Every module has checkpoints, curated free resources, a hands-on lab and a quick quiz.</p>
    </section>
    ${C.stages.map((st) => `
      <section class="stage">
        <div class="stage-head"><span class="stage-num">${String(st.id).padStart(2, "0")}</span><div><h2>${esc(st.name)}</h2><p>${esc(st.sub)}</p></div></div>
        <div class="mod-grid">${MODS.filter((m) => m.stage === st.id).map(moduleCard).join("")}</div>
      </section>`).join("")}
    <section class="stage">
      <div class="stage-head"><span class="stage-num">★</span><div><h2>Finale — Build & prove it</h2><p>Real GitHub projects and incident drills to cement everything.</p></div></div>
      <div class="grid-2">
        <a class="cta-card" href="#/projects"><b>${C.projects.length + 1} capstone projects</b><span>From the Cloud Resume Challenge to Kubernetes the Hard Way →</span></a>
        <a class="cta-card alt" href="#/drills"><b>${C.scenarios.length} War Room drills</b><span>Realistic outages and incidents to practice debugging →</span></a>
      </div>
    </section>`;
  }

  function viewModule(id) {
    const m = MODS.find((x) => x.id === id);
    if (!m) return `<div class="empty big"><h2>Module not found</h2><a class="btn primary" href="#/path">Back to the path</a></div>`;
    const L = me(), B = bud(), st = stageOf(m.stage), idx = MODS.indexOf(m);
    const prev = MODS[idx - 1], next = MODS[idx + 1];
    const s = stats(L).perMod[m.id];
    const answered = m.quiz.filter((_, i) => L.quiz[`${m.id}.${i}`]);
    const hasWrong = m.quiz.some((_, i) => L.quiz[`${m.id}.${i}`] && !L.quiz[`${m.id}.${i}`].correct);
    const myNote = L.notes[m.id]?.text || "", budNote = B.notes[m.id]?.text || "";

    return `
    <nav class="crumbs"><a href="#/path">Path</a><span>/</span><span>Stage ${st.id} · ${esc(st.name)}</span></nav>
    <section class="mod-hero" style="--c:${m.color}">
      <span class="tile tile-xl" style="--c:${m.color}">${m.code}</span>
      <div class="mod-hero-text">
        <h1>${esc(m.title)}</h1>
        <p class="lead">${esc(m.tagline)}</p>
        <div class="mod-meta"><span>≈ ${m.hours} hours</span><span>${m.topics.length} checkpoints</span><span>${m.resources.length} resources</span><span>1 lab</span><span>${m.quiz.length}-question quiz</span></div>
      </div>
      <div class="mod-hero-prog">${ring(s.pct, 92, 9, m.color, `${s.done}/${s.total}`)}<div class="duo-bars">${duoBars(m.id)}</div></div>
    </section>

    <div class="mod-layout">
      <div class="mod-main">
        <section class="grid-2 tight">
          <div class="callout"><h4>Why it matters</h4><p>${esc(m.why)}</p></div>
          <div class="callout spark"><h4>Curiosity spark</h4><p>${fmtCode(m.spark)}</p></div>
        </section>

        <section class="card">
          <div class="card-head"><h3>Checkpoints</h3><span class="muted sm">+${XP.topic} XP each · +${XP.module} XP when all done</span></div>
          <ol class="topics">
            ${m.topics.map((t, i) => {
              const key = `${m.id}.${t.id}`, done = !!L.topics[key], bdone = !!B.topics[key];
              return `<li class="topic ${done ? "done" : ""}">
                <button class="check" data-act="topic" data-key="${key}" aria-pressed="${done}" aria-label="Mark ${esc(t.t)} ${done ? "not done" : "done"}">
                  <svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>
                </button>
                <div class="topic-body">
                  <div class="topic-title"><span class="topic-n">${String(i + 1).padStart(2, "0")}</span>${esc(t.t)}</div>
                  <p>${fmtCode(t.d)}</p>
                </div>
                <div class="topic-side">
                  ${bdone ? `<span class="bud-done" style="--b:${colorOf(budId())}" title="${esc(B.name)} finished this">${esc(initials(B.name))} ✓</span>` : ""}
                  ${t.u ? `<a class="learn" href="${esc(t.u)}" target="_blank" rel="noopener">Learn ↗</a>` : ""}
                </div>
              </li>`;
            }).join("")}
          </ol>
        </section>

        <section class="card">
          <div class="card-head"><h3>Curated resources</h3><span class="muted sm">Free or free-tier</span></div>
          <div class="res-grid">
            ${m.resources.map((r) => `<a class="res" href="${esc(r.u)}" target="_blank" rel="noopener">
              <span class="res-type t-${r.type.toLowerCase()}">${esc(r.type)}</span>
              <b>${esc(r.t)}</b><small>${esc(host(r.u))} ↗</small></a>`).join("")}
          </div>
        </section>

        <section class="card lab">
          <div class="card-head"><h3>Hands-on lab</h3><span class="chip">Do it together</span></div>
          <h4 class="lab-title">${esc(m.lab.title)}</h4>
          <ol class="steps">${m.lab.steps.map((x) => `<li>${fmtCode(x)}</li>`).join("")}</ol>
        </section>

        <section class="card" id="quiz">
          <div class="card-head"><h3>Quick quiz</h3><span class="muted sm">${answered.length}/${m.quiz.length} answered · +${XP.quiz} XP per correct</span></div>
          ${m.quiz.map((q, qi) => {
            const a = L.quiz[`${m.id}.${qi}`], ba = B.quiz[`${m.id}.${qi}`];
            return `<div class="q ${a ? (a.correct ? "right" : "wrong") : ""}">
              <p class="q-text"><span>Q${qi + 1}</span>${fmtCode(q.q)}</p>
              <div class="opts">${q.o.map((o, oi) => {
                let cls = "";
                if (a) { if (oi === q.a) cls = "correct"; else if (oi === a.pick) cls = "picked"; }
                return `<button class="opt ${cls}" ${a ? "disabled" : ""} data-act="quiz" data-m="${m.id}" data-q="${qi}" data-o="${oi}"><span>${"ABCD"[oi]}</span>${fmtCode(o)}</button>`;
              }).join("")}</div>
              ${a ? `<p class="q-why"><b>${a.correct ? "Correct." : "Not quite."}</b> ${fmtCode(q.why)}</p>` : ""}
              ${ba ? `<small class="q-bud" style="--b:${colorOf(budId())}">${esc(B.name)} answered ${ba.correct ? "correctly" : "incorrectly"}</small>` : ""}
            </div>`;
          }).join("")}
          ${hasWrong ? `<div class="row-gap end"><button class="btn ghost sm" data-act="quiz-retry" data-m="${m.id}">Retry wrong answers</button></div>` : ""}
        </section>

        <nav class="pager">
          ${prev ? `<a href="#/module/${prev.id}"><small>← Previous</small><b>${esc(prev.title)}</b></a>` : "<span></span>"}
          ${next ? `<a class="right" href="#/module/${next.id}"><small>Next →</small><b>${esc(next.title)}</b></a>` : `<a class="right" href="#/projects"><small>Next →</small><b>Capstone projects</b></a>`}
        </nav>
      </div>

      <aside class="mod-side">
        <div class="card notes-card">
          <div class="tabs">
            <button class="${ui.noteTab === "me" ? "on" : ""}" data-act="note-tab" data-tab="me">${avatar(meId(), "xs")} My notes</button>
            <button class="${ui.noteTab === "bud" ? "on" : ""}" data-act="note-tab" data-tab="bud">${avatar(budId(), "xs")} ${esc(B.name)}'s</button>
          </div>
          ${ui.noteTab === "me" ? `
            ${ui.notePreview
              ? `<div class="note-render">${myNote.trim() ? md(myNote) : '<p class="muted">Nothing yet.</p>'}</div>`
              : `<textarea class="note-area" data-note="${m.id}" placeholder="Capture what clicked, commands you'll forget, questions for your buddy…&#10;&#10;Supports - lists, **bold**, \`code\`, \`\`\` blocks and links.">${esc(myNote)}</textarea>`}
            <div class="note-foot"><span class="note-status" id="noteStatus">${L.notes[m.id]?.ts ? "Saved " + ago(L.notes[m.id].ts) : "Autosaves as you type"}</span>
              <button class="link-btn" data-act="note-preview">${ui.notePreview ? "Edit" : "Preview"}</button></div>`
          : `<div class="note-render">${budNote.trim() ? md(budNote) : `<p class="muted">${esc(B.name)} hasn't written notes for this module yet.</p>`}</div>
             ${B.notes[m.id]?.ts ? `<div class="note-foot"><span class="note-status">Updated ${ago(B.notes[m.id].ts)}</span></div>` : ""}`}
        </div>
        <div class="card side-tip">
          <h4>Study tip</h4>
          <p>Finish a checkpoint, then explain it to your buddy in two minutes. If you can't explain it simply, revisit it — that's the fastest way to really learn.</p>
        </div>
      </aside>
    </div>`;
  }

  function viewProjects() {
    const L = me(), B = bud(), g = C.grand;
    const lvlOrder = ["Beginner", "Intermediate", "Advanced", "Expert", "Challenge"];
    return `
    <section class="page-head">
      <p class="eyebrow">Build & prove it</p>
      <h1>Projects that turn knowledge into a portfolio.</h1>
      <p class="lead">Real repos on GitHub. Fork them, deploy them, break them, document them. Each one earns serious XP — mark it done when it's live and written up in your README.</p>
    </section>

    <section class="grand ${L.projects.grand ? "done" : ""}">
      <div class="grand-text">
        <span class="chip gold">Finale · +${g.pts} XP</span>
        <h2>${esc(g.title)}</h2>
        <p>${esc(g.desc)}</p>
        <ol class="steps">${g.steps.map((x) => `<li>${fmtCode(x)}</li>`).join("")}</ol>
      </div>
      <div class="grand-side">
        <div class="duo-status">
          ${["a", "b"].map((id) => `<div class="ds ${S.learners[id].projects.grand ? "yes" : ""}">${avatar(id, "sm")}<span>${esc(S.learners[id].name)}</span><b>${S.learners[id].projects.grand ? "Shipped ✓" : "Not yet"}</b></div>`).join("")}
        </div>
        <button class="btn ${L.projects.grand ? "ghost" : "gold"}" data-act="project" data-id="grand">${L.projects.grand ? "Mark as not done" : "I shipped it ♛"}</button>
      </div>
    </section>

    ${lvlOrder.map((lv) => {
      const ps = C.projects.filter((p) => p.level === lv);
      if (!ps.length) return "";
      return `<section class="stage"><div class="stage-head slim"><h2>${lv}</h2></div><div class="proj-grid">${ps.map((p) => {
        const mine = !!L.projects[p.id], his = !!B.projects[p.id];
        return `<div class="proj ${mine ? "done" : ""}">
          <div class="proj-top"><span class="lvl lvl-${lv.toLowerCase()}">${lv}</span><span class="xp-chip">+${p.pts} XP</span></div>
          <h4>${esc(p.title)}</h4>
          <p>${esc(p.desc)}</p>
          <div class="tags">${p.stack.map((x) => `<span>${esc(x)}</span>`).join("")}</div>
          <div class="proj-foot">
            <a class="link" href="${esc(p.u)}" target="_blank" rel="noopener">${host(p.u) === "github.com" ? "View on GitHub" : "Open project"} ↗</a>
            <div class="proj-actions">
              ${his ? `<span class="bud-done" style="--b:${colorOf(budId())}" title="${esc(B.name)} shipped this">${esc(initials(B.name))} ✓</span>` : ""}
              <button class="btn sm ${mine ? "ghost" : "primary"}" data-act="project" data-id="${p.id}">${mine ? "Done ✓" : "Mark shipped"}</button>
            </div>
          </div>
        </div>`;
      }).join("")}</div></section>`;
    }).join("")}

    <section class="card">
      <div class="card-head"><h3>Keep going</h3><span class="muted sm">More practice & interview prep</span></div>
      <div class="res-grid">${C.extras.map((r) => `<a class="res" href="${esc(r.u)}" target="_blank" rel="noopener"><b>${esc(r.t)}</b><small>${esc(host(r.u))} ↗</small></a>`).join("")}</div>
    </section>`;
  }

  function viewDrills() {
    const L = me(), B = bud();
    const solved = C.scenarios.filter((s) => L.scenarios[s.id]).length;
    return `
    <section class="page-head">
      <p class="eyebrow">War Room</p>
      <h1>Incidents happen. Practice before they do.</h1>
      <p class="lead">Realistic outages you'll meet on the job. Read the brief, write your plan, then reveal the playbook and compare. Try them as a pair: one plays on-call, the other plays the system.</p>
      <div class="drill-progress"><span class="bar thick"><i style="width:${(solved / C.scenarios.length) * 100}%"></i></span><small>${solved}/${C.scenarios.length} solved · +${XP.scenario} XP each</small></div>
    </section>
    <div class="drill-grid">
      ${C.scenarios.map((sc) => {
        const open = ui.revealed[sc.id], done = !!L.scenarios[sc.id], bd = !!B.scenarios[sc.id];
        const plan = L.notes["drill:" + sc.id]?.text || "";
        return `<article class="drill ${done ? "done" : ""}">
          <div class="drill-top"><span class="sev sev-${sc.sev.slice(-1)}">${sc.sev}</span><span class="tagline">${esc(sc.tag)}</span>
            ${bd ? `<span class="bud-done" style="--b:${colorOf(budId())}">${esc(initials(B.name))} ✓</span>` : ""}</div>
          <h4>${esc(sc.title)}</h4>
          <p class="brief">${fmtCode(sc.brief)}</p>
          <textarea class="plan" data-note="drill:${sc.id}" rows="3" placeholder="Your plan: what would you check first?">${esc(plan)}</textarea>
          ${open ? `<div class="playbook"><b>Playbook</b><ol>${sc.play.map((x) => `<li>${fmtCode(x)}</li>`).join("")}</ol></div>` : ""}
          <div class="drill-foot">
            <button class="btn ghost sm" data-act="reveal" data-id="${sc.id}">${open ? "Hide playbook" : "Reveal playbook"}</button>
            <button class="btn sm ${done ? "ghost" : "primary"}" data-act="drill" data-id="${sc.id}" ${!open && !done ? "disabled title='Reveal and compare first'" : ""}>${done ? "Solved ✓" : "Mark solved"}</button>
          </div>
        </article>`;
      }).join("")}
    </div>`;
  }

  function viewNotes() {
    const q = ui.notesFilter.toLowerCase();
    const rows = MODS.map((m) => {
      const a = S.learners.a.notes[m.id]?.text || "", b = S.learners.b.notes[m.id]?.text || "";
      if (!a.trim() && !b.trim()) return "";
      if (q && !(a + b + m.title).toLowerCase().includes(q)) return "";
      return `<section class="card note-row">
        <div class="card-head"><a href="#/module/${m.id}" class="note-mod"><span class="tile sm" style="--c:${m.color}">${m.code}</span><h3>${esc(m.title)}</h3></a></div>
        <div class="grid-2 tight">${["a", "b"].map((id) => {
          const n = S.learners[id].notes[m.id];
          return `<div class="note-col" style="--c:${colorOf(id)}"><div class="note-col-head">${avatar(id, "xs")}<b>${esc(S.learners[id].name)}</b>${n?.ts ? `<small>${ago(n.ts)}</small>` : ""}</div>
            <div class="note-render">${n?.text?.trim() ? md(n.text) : '<p class="muted">No notes.</p>'}</div></div>`;
        }).join("")}</div>
      </section>`;
    }).join("");
    return `
    <section class="page-head">
      <p class="eyebrow">Shared notebook</p>
      <h1>Everything you two have written down.</h1>
      <p class="lead">Notes are written on each module page and synced here side-by-side. Search across both of you, or export yours as Markdown.</p>
      <div class="row-gap">
        <input class="search" id="noteSearch" placeholder="Search notes…" value="${esc(ui.notesFilter)}"/>
        <button class="btn ghost" data-act="export-md">Download my notes (.md)</button>
      </div>
    </section>
    ${rows.trim() || `<div class="empty big"><h3>${q ? "No matches." : "No notes yet."}</h3><p class="muted">Open any module and use the notes panel on the right.</p><a class="btn primary" href="#/path">Open the path</a></div>`}`;
  }

  function viewSquad() {
    const sa = stats(S.learners.a), sb = stats(S.learners.b);
    const ba = badgesOf("a"), bb = badgesOf("b");
    return `
    <section class="page-head">
      <p class="eyebrow">Squad</p>
      <h1>Two learners, one summit.</h1>
      <p class="lead">Friendly competition, shared progress. Compare module by module and see who's carrying which badge.</p>
    </section>
    <section class="duo">${learnerCard("a")}<div class="duo-vs"><span>VS</span></div>${learnerCard("b")}</section>

    <section class="card">
      <div class="card-head"><h3>Module by module</h3></div>
      <div class="table">
        <div class="tr th"><span>Module</span><span>${esc(S.learners.a.name)}</span><span>${esc(S.learners.b.name)}</span></div>
        ${MODS.map((m) => {
          const a = sa.perMod[m.id], b = sb.perMod[m.id];
          const cell = (p, id) => `<span class="cell"><span class="bar"><i style="width:${p.pct * 100}%;background:${colorOf(id)}"></i></span><small>${p.complete ? "✓" : `${p.done}/${p.total}`} · quiz ${p.qc}/${m.quiz.length}</small></span>`;
          return `<a class="tr" href="#/module/${m.id}"><span class="tm"><span class="tile sm" style="--c:${m.color}">${m.code}</span>${esc(m.title)}</span>${cell(a, "a")}${cell(b, "b")}</a>`;
        }).join("")}
      </div>
    </section>

    <section class="grid-2">
      ${[["a", ba], ["b", bb]].map(([id, list]) => `
        <div class="card"><div class="card-head"><h3>${avatar(id, "xs")} ${esc(S.learners[id].name)}'s badges</h3><span class="muted sm">${list.length}/${BADGES.length}</span></div>
        <div class="badge-grid">${BADGES.map((b) => `<div class="badge ${list.includes(b.id) ? "earned" : ""}"><span class="badge-ic">${b.ic}</span><b>${esc(b.t)}</b><small>${esc(b.d)}</small></div>`).join("")}</div></div>`).join("")}
    </section>

    <section class="card">
      <div class="card-head"><h3>Sync & settings</h3><span class="sync-pill inline ${SYNC_LABEL[syncState][1]}"><i></i>${SYNC_LABEL[syncState][0]}</span></div>
      <p class="muted">${syncExplain()}</p>
      <p class="muted sm">Squad code: <code>${S.squad ? esc(S.squad) : "— none —"}</code> · You are <b>${esc(me().name)}</b> (Learner ${meId() === "a" ? 1 : 2}).</p>
      <div class="row-gap"><button class="btn primary" data-act="open-settings">Open settings</button><button class="btn ghost" data-act="sync-now">Sync now</button></div>
    </section>`;
  }

  /* ------------------------- router & render ------------------------- */
  function route() {
    const h = location.hash.replace(/^#\/?/, "");
    const [path, sub] = h.split("#")[0].split("/");
    return { path: path || "", sub };
  }

  function render() {
    ui.pendingRender = false;
    const { path, sub } = route();
    const v = document.getElementById("view");
    const views = { "": viewDashboard, path: viewPath, module: () => viewModule(sub), projects: viewProjects, drills: viewDrills, notes: viewNotes, squad: viewSquad };
    v.innerHTML = (views[path] || viewDashboard)();
    document.querySelectorAll("#nav a").forEach((a) => a.classList.toggle("on", a.dataset.route === (path === "module" ? "path" : path)));
    document.getElementById("duoAvatars").innerHTML = `${avatar(meId(), "sm")}${avatar(budId(), "sm")}`;
    const titles = { "": "Dashboard", path: "Path", projects: "Projects", drills: "War Room", notes: "Notes", squad: "Squad" };
    const mod = path === "module" && MODS.find((m) => m.id === sub);
    document.title = `${mod ? mod.title : titles[path] || "Dashboard"} · Ascent`;
  }

  let lastRoute = null;
  function onRoute() {
    const h = location.hash;
    const r = route();
    render();
    const anchor = h.split("#")[2];
    if (anchor) setTimeout(() => document.getElementById(anchor)?.scrollIntoView({ behavior: "smooth", block: "start" }), 30);
    else if (lastRoute !== r.path + r.sub) window.scrollTo(0, 0);
    lastRoute = r.path + r.sub;
  }

  /* ------------------------- actions ------------------------- */
  function originOf(el) {
    const r = el.getBoundingClientRect();
    return { x: (r.left + r.width / 2) / innerWidth, y: (r.top + r.height / 2) / innerHeight };
  }

  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-act]");
    if (!el) return;
    const act = el.dataset.act, L = me();
    const before = snapshot();

    switch (act) {
      case "topic": {
        const k = el.dataset.key;
        if (L.topics[k]) delete L.topics[k]; else L.topics[k] = Date.now();
        touch(); const o = originOf(el); render(); if (L.topics[k]) celebrate(before, o);
        break;
      }
      case "quiz": {
        const { m, q, o } = el.dataset;
        const mod = MODS.find((x) => x.id === m), pick = +o;
        const correct = pick === mod.quiz[+q].a;
        L.quiz[`${m}.${q}`] = { pick, correct, ts: Date.now() };
        touch(); const or = originOf(el); render();
        if (correct) celebrate(before, or); else toast("Not quite — read the explanation and try again later.", "warn");
        break;
      }
      case "quiz-retry": {
        const m = el.dataset.m;
        Object.keys(L.quiz).forEach((k) => { if (k.startsWith(m + ".") && !L.quiz[k].correct) delete L.quiz[k]; });
        touch(); render(); break;
      }
      case "project": {
        const id = el.dataset.id;
        if (L.projects[id]) delete L.projects[id]; else L.projects[id] = Date.now();
        touch(); const o = originOf(el); render();
        if (L.projects[id]) { if (id === "grand") bigBoom(); celebrate(before, o); }
        break;
      }
      case "reveal": ui.revealed[el.dataset.id] = !ui.revealed[el.dataset.id]; render(); break;
      case "drill": {
        const id = el.dataset.id;
        if (L.scenarios[id]) delete L.scenarios[id]; else L.scenarios[id] = Date.now();
        touch(); const o = originOf(el); render(); if (L.scenarios[id]) celebrate(before, o);
        break;
      }
      case "note-tab": ui.noteTab = el.dataset.tab; render(); break;
      case "note-preview": ui.notePreview = !ui.notePreview; render(); break;
      case "open-settings": settingsModal(false); break;
      case "close-modal": closeModal(); if (el.dataset.go) location.hash = el.dataset.go; break;
      case "copy-code": {
        const inp = document.getElementById("f-code");
        navigator.clipboard?.writeText(inp.value).then(() => toast("Squad code copied — send it to your buddy."));
        break;
      }
      case "new-code": document.getElementById("f-code").value = randomCode(); break;
      case "sync-now": pull(); break;
      case "export": {
        download(`ascent-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(S, null, 2), "application/json");
        break;
      }
      case "export-md": {
        let out = `# ${L.name}'s Ascent notes\n\n`;
        for (const m of MODS) if (L.notes[m.id]?.text?.trim()) out += `## ${m.title}\n\n${L.notes[m.id].text.trim()}\n\n`;
        for (const sc of C.scenarios) if (L.notes["drill:" + sc.id]?.text?.trim()) out += `## Drill: ${sc.title}\n\n${L.notes["drill:" + sc.id].text.trim()}\n\n`;
        download(`ascent-notes-${L.name.replace(/\W+/g, "-").toLowerCase()}.md`, out, "text/markdown");
        break;
      }
      case "reset": {
        if (el.dataset.confirm !== "1") { el.dataset.confirm = "1"; el.textContent = "Click again to confirm"; return; }
        const name = L.name;
        S.learners[meId()] = { ...blank(name), updated: Date.now() };
        save(); schedulePush(50); closeModal(); render(); toast("Your progress was reset.");
        break;
      }
    }
  });

  function download(name, text, type) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // notes autosave
  let noteTimer = null;
  document.addEventListener("input", (e) => {
    const t = e.target;
    if (t.dataset && t.dataset.note) {
      const L = me(), key = t.dataset.note;
      const before = snapshot();
      L.notes[key] = { text: t.value, ts: Date.now() };
      if (!t.value.trim()) delete L.notes[key];
      L.updated = Date.now(); save();
      const st = document.getElementById("noteStatus"); if (st) st.textContent = "Saving…";
      clearTimeout(noteTimer);
      noteTimer = setTimeout(() => {
        if (st) st.textContent = "Saved just now";
        schedulePush(0);
        const nb = badgesOf(meId()).filter((b) => !before.b.includes(b));
        if (nb.length) celebrate(before);
      }, 700);
    }
    if (t.id === "noteSearch") {
      ui.notesFilter = t.value;
      const pos = t.selectionStart; render();
      const n = document.getElementById("noteSearch"); n.focus(); n.setSelectionRange(pos, pos);
    }
  });
  document.addEventListener("focusout", (e) => {
    if (ui.pendingRender && e.target.matches && e.target.matches("textarea,input")) setTimeout(() => { if (ui.pendingRender) safeRender(); }, 50);
  });

  document.addEventListener("change", (e) => {
    if (e.target.id !== "importFile") return;
    const f = e.target.files[0]; if (!f) return;
    f.text().then((txt) => {
      try {
        const d = JSON.parse(txt);
        if (!d.learners) throw new Error("bad");
        for (const id of ["a", "b"]) {
          const r = d.learners[id];
          if (r && (r.updated || 0) > (S.learners[id].updated || 0)) S.learners[id] = normalize(r, S.learners[id].name);
        }
        save(); schedulePush(50); closeModal(); render(); toast("Import complete — newest progress kept for each learner.", "good");
      } catch { toast("That file doesn't look like an Ascent backup.", "warn"); }
    });
  });

  document.addEventListener("submit", (e) => {
    if (e.target.id !== "setupForm") return;
    e.preventDefault();
    const f = new FormData(e.target);
    const slot = f.get("slot") === "b" ? "b" : "a";
    const myName = String(f.get("me") || "").trim().slice(0, 24) || "Me";
    const budName = String(f.get("bud") || "").trim().slice(0, 24);
    const code = String(f.get("code") || "").trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
    if (code && code.length < 8) { toast("Squad code must be at least 8 characters.", "warn"); return; }
    const slotChanged = slot !== S.me;
    S.me = slot;
    if (slotChanged && !S.setup) { /* first run: nothing to move */ }
    me().name = myName; me().updated = Date.now();
    const other = bud();
    if (budName && (!other.updated || other.name.startsWith("Learner"))) other.name = budName;
    S.squad = code; S.setup = true;
    save(); closeModal(); render();
    if (code) { pull().then(() => schedulePush(50)); } else setSync("local");
    toast(`Welcome, ${esc(myName)}. Let's climb.`, "good");
  });

  /* ------------------------- boot ------------------------- */
  window.addEventListener("hashchange", onRoute);
  window.addEventListener("focus", () => pull());
  document.addEventListener("visibilitychange", () => { if (!document.hidden) pull(); });
  setInterval(() => { if (!document.hidden) pull(); }, 15000);
  window.addEventListener("keydown", (e) => { if (e.key === "Escape" && !document.getElementById("modal").hidden && S.setup) closeModal(); });

  setSync(S.squad ? "syncing" : "local");
  onRoute();
  if (!S.setup) settingsModal(true); else pull();
})();
