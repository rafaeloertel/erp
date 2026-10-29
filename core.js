/* ERP Rafael — núcleo: utilitários, armazenamento (local + OneDrive), shell, rotas, modais */
(function () {
  "use strict";
  const ERP = (window.ERP = { version: "v0.4.6", modules: [], defaults: {}, cfg: {} });

  /* ---------- utilitários ---------- */
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const p2 = (n) => String(n).padStart(2, "0");
  const uid = (p) => (p || "id") + "_" + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);
  const brl = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const usd = (v) => Number(v || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
  const num = (v, d) => Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: d == null ? 2 : d, maximumFractionDigits: d == null ? 2 : d });
  const pct = (v) => (v >= 0 ? "+" : "") + num(v, 2) + "%";
  const todayISO = () => { const d = new Date(); return d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate()); };
  const fdate = (iso) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(8, 10) + "/" + iso.slice(5, 7) + "/" + iso.slice(0, 4) : "");
  const monthKey = (iso) => String(iso || "").slice(0, 7);
  const monthLabel = (mk) => { const [y, m] = mk.split("-"); return ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"][+m - 1] + "/" + y.slice(2); };
  const addMonths = (iso, n) => { const [y, m, d] = iso.split("-").map(Number); const t = new Date(y, m - 1 + n, 1); const last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate(); return t.getFullYear() + "-" + p2(t.getMonth() + 1) + "-" + p2(Math.min(d, last)); };
  const parseNum = (s) => { if (typeof s === "number") return s; s = String(s || "").trim().replace(/[^\d,.\-]/g, ""); if (!s) return 0; if (s.includes(",")) s = s.replace(/\./g, "").replace(",", "."); return Number(s) || 0; };
  Object.assign(ERP, { $, $$, esc, uid, brl, usd, num, pct, todayISO, fdate, monthKey, monthLabel, addMonths, parseNum, p2 });

  function toast(msg, ms) {
    const t = document.createElement("div"); t.className = "toast"; t.textContent = msg; document.body.appendChild(t);
    setTimeout(() => t.remove(), ms || 2600);
  }
  ERP.toast = toast;

  /* ---------- modal e formulário ---------- */
  function modal(html, opt) {
    opt = opt || {};
    const ov = document.createElement("div"); ov.className = "ov";
    ov.innerHTML = `<div class="modal${opt.wide ? " wide" : ""}" role="dialog" aria-modal="true">${html}</div>`;
    ov.addEventListener("mousedown", (e) => { if (e.target === ov) close(); });
    const onKey = (e) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    function close() { document.removeEventListener("keydown", onKey); ov.remove(); }
    document.body.appendChild(ov); if (ERP.iconify) ERP.iconify(ov);
    const f = $("input,select,textarea", ov); if (f && !opt.noFocus) f.focus();
    return { el: ov, close };
  }
  ERP.modal = modal;

  function confirmBox(msg, okLabel) {
    return new Promise((res) => {
      const m = modal(`<h2>Confirmar</h2><p>${esc(msg)}</p><div class="act"><span class="sp"></span><button class="btn ghost" data-n>Cancelar</button><button class="btn orange" data-y>${esc(okLabel || "Confirmar")}</button></div>`, { noFocus: true });
      $("[data-n]", m.el).onclick = () => { m.close(); res(false); };
      $("[data-y]", m.el).onclick = () => { m.close(); res(true); };
    });
  }
  ERP.confirm = confirmBox;

  /* fields: [{k,label,type:text|number|date|month|select|textarea|checkbox|html,options:[[v,label]],value,full,required,step,placeholder,hint,html}]
     opt.init(fm, modal) roda depois de montar (campos dependentes); opt.extra = botões extras [{label, fn}] */
  function form(opt) {
    const fl = opt.fields.map((f) => {
      if (f.type === "html") return `<div class="f full" data-fk="${esc(f.k || "")}">${f.html || ""}</div>`;
      const id = "f_" + f.k; const v = f.value == null ? "" : f.value; let inp;
      if (f.type === "select") inp = `<select id="${id}" name="${f.k}">${(f.options || []).map((o) => o[0] === "__grp" ? `<optgroup label="${esc(o[1])}"></optgroup>` : `<option value="${esc(o[0])}"${String(o[0]) === String(v) ? " selected" : ""}>${esc(o[1])}</option>`).join("")}</select>`;
      else if (f.type === "textarea") inp = `<textarea id="${id}" name="${f.k}" rows="3">${esc(v)}</textarea>`;
      else if (f.type === "checkbox") inp = `<input id="${id}" name="${f.k}" type="checkbox" ${v ? "checked" : ""} style="width:20px;height:20px">`;
      else inp = `<input id="${id}" name="${f.k}" type="${f.type || "text"}" value="${esc(v)}" ${f.step ? `step="${f.step}"` : ""} ${f.placeholder ? `placeholder="${esc(f.placeholder)}"` : ""} ${f.required ? "required" : ""} ${f.type === "number" ? 'inputmode="decimal"' : ""}>`;
      return `<div class="f${f.full ? " full" : ""}" data-fk="${esc(f.k)}"><label for="${id}">${esc(f.label)}</label>${inp}${f.hint ? `<small class="mut" style="font-size:11.5px">${f.hint}</small>` : ""}</div>`;
    }).join("");
    const m = modal(`<h2>${esc(opt.title)}</h2>${opt.intro ? `<p class="mut" style="margin-bottom:12px">${opt.intro}</p>` : ""}<form novalidate><div class="fg">${fl}</div><div class="act">${opt.onDelete ? `<button type="button" class="btn danger" data-del>${esc(opt.deleteLabel || "Excluir")}</button>` : ""}${(opt.extra || []).map((x, i) => `<button type="button" class="btn ghost" data-extra="${i}">${esc(x.label)}</button>`).join("")}<span class="sp"></span><button type="button" class="btn ghost" data-cancel>Cancelar</button><button class="btn orange">${esc(opt.okLabel || "Salvar")}</button></div></form>`, { wide: opt.wide });
    const fm = $("form", m.el);
    const read = () => { const v = {}; opt.fields.forEach((f) => { if (f.type === "html") return; const el = fm.elements[f.k]; if (!el) return; v[f.k] = f.type === "checkbox" ? el.checked : f.type === "number" ? parseNum(el.value) : el.value; }); return v; };
    $("[data-cancel]", m.el).onclick = m.close;
    if (opt.onDelete) $("[data-del]", m.el).onclick = async () => { if (opt.deleteNoConfirm || await confirmBox(opt.deleteConfirm || "Excluir este registro?", opt.deleteLabel || "Excluir")) { m.close(); opt.onDelete(); } };
    (opt.extra || []).forEach((x, i) => { $(`[data-extra="${i}"]`, m.el).onclick = () => x.fn(read(), m); });
    fm.onsubmit = (e) => { e.preventDefault(); if (opt.onSubmit(read(), m) !== false) m.close(); };
    m.read = read; m.show = (k, on) => { const el = $(`[data-fk="${k}"]`, m.el); if (el) el.hidden = !on; };
    if (opt.init) opt.init(fm, m);
    return m;
  }
  ERP.form = form;

  /* ---------- armazenamento ---------- */
  const LS = (k) => "erp.rafael." + k;
  const lsGet = (k, d) => { try { const v = localStorage.getItem(LS(k)); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(LS(k), JSON.stringify(v)); return true; } catch (e) { toast("Armazenamento do navegador cheio — exporte um backup."); return false; } };
  ERP.lsGet = lsGet; ERP.lsSet = lsSet;

  const Store = (ERP.Store = {
    docs: {}, meta: {}, timers: {}, listeners: [],
    names() { return Object.keys(ERP.defaults); },
    load() {
      this.names().forEach((n) => {
        const env = lsGet("doc." + n, null);
        this.meta[n] = lsGet("meta." + n, { updatedAt: null, etag: null, dirty: false });
        this.docs[n] = env && env.data ? env.data : JSON.parse(JSON.stringify(ERP.defaults[n]));
        const def = ERP.defaults[n]; Object.keys(def).forEach((k) => { if (this.docs[n][k] === undefined) this.docs[n][k] = JSON.parse(JSON.stringify(def[k])); });
      });
    },
    get(n) { return this.docs[n]; },
    envelope(n) { return { app: "erp-rafael", doc: n, schema: 1, updatedAt: this.meta[n].updatedAt || new Date().toISOString(), data: this.docs[n] }; },
    /* aplica uma alteração e agenda a gravação (local na hora, nuvem com atraso) */
    change(n, fn) {
      fn(this.docs[n]);
      this.meta[n].updatedAt = new Date().toISOString(); this.meta[n].dirty = true;
      lsSet("doc." + n, this.envelope(n)); lsSet("meta." + n, this.meta[n]);
      this.listeners.forEach((f) => f(n));
      Cloud.schedule(n);
    },
    replace(n, data, updatedAt) {
      this.docs[n] = data; this.meta[n].updatedAt = updatedAt || new Date().toISOString();
      lsSet("doc." + n, this.envelope(n)); lsSet("meta." + n, this.meta[n]);
      this.listeners.forEach((f) => f(n));
    },
    saveMeta(n) { lsSet("meta." + n, this.meta[n]); },
  });

  /* ---------- nuvem: OneDrive pessoal via Microsoft Graph ---------- */
  const GRAPH = "https://graph.microsoft.com/v1.0";
  const FOLDER = "ERP Rafael";
  const SCOPES = ["User.Read", "Files.ReadWrite"];
  /* app "ERP Rafael" registrado no locatário próprio (Diretório padrão de rafael.oertel@gmail.com), só contas pessoais.
     O ID do aplicativo não é segredo; pode ser trocado em Sistema › Dados e sincronização. */
  const CLIENT_ID = "f45355ad-8d2b-4d0d-aba3-55b9ac8d2ed9";
  const Cloud = (ERP.Cloud = {
    pca: null, account: null, status: "local", msg: "Somente neste aparelho", timers: {},
    cfg() { const c = lsGet("cloud", {}) || {}; return Object.assign({}, c, { clientId: (c.clientId || "").trim() || CLIENT_ID }); },
    redirectUri() { return location.origin + location.pathname.replace(/index\.html$/, ""); },
    setStatus(s, m) { this.status = s; this.msg = m; $$(".sync").forEach((c) => { c.className = "chip sync " + (s === "ok" ? "ok" : s === "err" ? "err" : s === "busy" ? "warn" : ""); c.innerHTML = `<i></i><span>${esc(m)}</span>`; c.title = m; }); },
    async init() {
      const cfg = this.cfg();
      if (!cfg.clientId || typeof msal === "undefined") { this.setStatus("local", "Somente neste aparelho"); return; }
      try {
        this.pca = new msal.PublicClientApplication({ auth: { clientId: cfg.clientId, authority: "https://login.microsoftonline.com/consumers", redirectUri: this.redirectUri(), navigateToLoginRequestUrl: false }, cache: { cacheLocation: "localStorage" } });
        await this.pca.initialize();
        const r = await this.pca.handleRedirectPromise();
        if (r && r.account) this.pca.setActiveAccount(r.account);
        this.account = this.pca.getActiveAccount() || this.pca.getAllAccounts()[0] || null;
        if (this.account) { this.pca.setActiveAccount(this.account); this.setStatus("busy", "Sincronizando…"); await this.pullAll(); }
        else this.setStatus("local", "Entrar para sincronizar");
      } catch (e) { console.error(e); this.setStatus("err", "Erro de login: " + (e.errorCode || e.message)); }
    },
    login() { if (!this.pca) { toast("Informe o ID do aplicativo em Sistema › Dados e sincronização."); return; } this.pca.loginRedirect({ scopes: SCOPES, prompt: "select_account" }); },
    logout() { if (this.pca && this.account) this.pca.logoutRedirect({ account: this.account, postLogoutRedirectUri: this.redirectUri() }); },
    async token() {
      const req = { scopes: SCOPES, account: this.account };
      try { return (await this.pca.acquireTokenSilent(req)).accessToken; }
      catch (e) { await this.pca.acquireTokenRedirect(req); return null; }
    },
    async api(path, opt) {
      const t = await this.token(); if (!t) throw new Error("Sessão expirada");
      const h = Object.assign({ Authorization: "Bearer " + t }, (opt && opt.headers) || {});
      const res = await fetch(GRAPH + path, Object.assign({}, opt, { headers: h }));
      return res;
    },
    pathOf(n) { return `/me/drive/root:/${encodeURIComponent(FOLDER)}/${n}.json`; },
    async pullAll() {
      let conflicts = [];
      for (const n of Store.names()) {
        try { const c = await this.pull(n); if (c) conflicts.push(n); } catch (e) { console.error(n, e); this.setStatus("err", "Falha ao ler " + n); return; }
      }
      this.setStatus("ok", "Sincronizado " + new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }));
      if (conflicts.length) this.askConflict(conflicts);
      ERP.render();
    },
    /* retorna true se há conflito (alterações locais e na nuvem) */
    async pull(n) {
      const meta = Store.meta[n];
      const r = await this.api(this.pathOf(n) + "?select=id,eTag,lastModifiedDateTime");
      if (r.status === 404) { if (Store.meta[n].updatedAt) await this.push(n, true); return false; }
      if (!r.ok) throw new Error("GET " + r.status);
      const it = await r.json();
      if (meta.etag === it.eTag && !meta.dirty) return false;
      const c = await this.api(this.pathOf(n) + ":/content");
      if (!c.ok) throw new Error("content " + c.status);
      const env = await c.json();
      if (meta.dirty && meta.etag && meta.etag !== it.eTag) { meta.remote = { env, etag: it.eTag }; return true; }
      if (!meta.updatedAt || !env.updatedAt || env.updatedAt >= meta.updatedAt || !meta.dirty) { Store.replace(n, env.data, env.updatedAt); meta.etag = it.eTag; meta.dirty = false; Store.saveMeta(n); }
      else await this.push(n, true);
      return false;
    },
    schedule(n) {
      if (!this.account) return;
      clearTimeout(this.timers[n]); this.setStatus("busy", "Alterações pendentes…");
      this.timers[n] = setTimeout(() => this.push(n).catch(() => {}), 2500);
    },
    async push(n, force) {
      if (!this.account) return;
      const meta = Store.meta[n];
      try {
        this.setStatus("busy", "Salvando no OneDrive…");
        const headers = { "Content-Type": "application/json" };
        if (meta.etag && !force) headers["If-Match"] = meta.etag;
        const r = await this.api(this.pathOf(n) + ":/content?@microsoft.graph.conflictBehavior=replace", { method: "PUT", headers, body: JSON.stringify(Store.envelope(n)) });
        if (r.status === 412) { await this.pull(n).then((c) => c && this.askConflict([n])); return; }
        if (!r.ok) throw new Error("PUT " + r.status);
        const it = await r.json(); meta.etag = it.eTag; meta.dirty = false; Store.saveMeta(n);
        this.setStatus("ok", "Sincronizado " + new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }));
      } catch (e) { console.error(e); this.setStatus("err", "Não salvou na nuvem (dados seguros neste aparelho)"); throw e; }
    },
    askConflict(list) {
      const m = modal(`<h2>Alterações em dois lugares</h2><p>Os módulos <b>${esc(list.join(", "))}</b> foram alterados neste aparelho e também no OneDrive. Qual versão manter?</p><div class="act"><span class="sp"></span><button class="btn ghost" data-cloud>Usar a do OneDrive</button><button class="btn orange" data-local>Manter a deste aparelho</button></div>`, { noFocus: true });
      $("[data-cloud]", m.el).onclick = () => { list.forEach((n) => { const r = Store.meta[n].remote; if (r) { Store.replace(n, r.env.data, r.env.updatedAt); Store.meta[n].etag = r.etag; Store.meta[n].dirty = false; delete Store.meta[n].remote; Store.saveMeta(n); } }); m.close(); ERP.render(); };
      $("[data-local]", m.el).onclick = async () => { for (const n of list) { delete Store.meta[n].remote; await this.push(n, true); } m.close(); };
    },
  });

  /* ---------- módulos, shell e rotas ---------- */
  ERP.register = (mod) => ERP.modules.push(mod);
  ERP.nav = (path) => { location.hash = "#/" + path; };

  function route() {
    const h = (location.hash || "#/inicio").replace(/^#\//, "").split("?")[0].split("/");
    const mod = ERP.modules.find((m) => m.id === h[0]) || ERP.modules[0];
    const page = (mod.pages || []).find((p) => p.id === h[1]) || (mod.pages || [])[0];
    return { mod, page };
  }
  /* gráficos (Chart.js, carregado do cdnjs): destruídos a cada troca de tela */
  ERP._charts = [];
  ERP.cor = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim() || "#888";
  ERP.chart = function (el, cfg) {
    if (!el || typeof Chart === "undefined") { if (el) el.parentElement.innerHTML = '<p class="mut" style="padding:20px;text-align:center">Gráfico indisponível sem internet.</p>'; return null; }
    if (!ERP._dl && typeof ChartDataLabels !== "undefined") { Chart.register(ChartDataLabels); Chart.defaults.set("plugins.datalabels", { display: false }); ERP._dl = 1; }
    Chart.defaults.font.family = getComputedStyle(document.body).fontFamily; Chart.defaults.color = ERP.cor("--ink-2"); Chart.defaults.borderColor = ERP.cor("--line");
    const c = new Chart(el, cfg); ERP._charts.push(c); return c;
  };
  /* símbolos e emojis viram ícones de linha; emojis sem equivalente são removidos */
  const SYM = { "💳": "credit-card", "🏦": "landmark", "⚡": "zap", "🔒": "lock", "↻": "repeat", "✎": "pencil", "↺": "undo-2", "✓": "check", "✔": "check", "✕": "x", "✖": "x", "↗": "arrow-up-right", "→": "arrow-right", "🚩": "flag", "💰": "wallet", "📋": "list", "☑": "square-check", "✅": "circle-check", "📈": "trending-up", "🏛": "landmark", "⚙": "settings", "🏠": "house", "‹": "chevron-left", "›": "chevron-right" };
  const SYM_RE = /(\p{Extended_Pictographic}|[✎↺✓✕↗→↻‹›])[\uFE0F\u200D\u2640\u2642\u{1F3FB}-\u{1F3FF}]*/gu;
  ERP.iconify = function (root) {
    if (!root || !ERP.ic) return;
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); const hits = [];
    while (w.nextNode()) { const n = w.currentNode; SYM_RE.lastIndex = 0; if (SYM_RE.test(n.nodeValue)) hits.push(n); }
    hits.forEach((n) => {
      const par = n.parentNode; if (!par) return;
      const inCtl = par.closest && par.closest("option,select,textarea,title,script,style");
      const t = n.nodeValue;
      if (inCtl) { n.nodeValue = t.replace(SYM_RE, "").replace(/^\s+/, ""); return; }
      /* "‹" e "›" só viram ícone quando sozinhos num botão (navegação de mês); em texto corrido ficam */
      const solo = t.trim().length <= 2;
      const html = esc(t).replace(SYM_RE, (m0, ch) => { if ((ch === "‹" || ch === "›") && !solo && !/^[‹›]\s|\s[‹›]$/.test(t.trim())) return ch; if (ch === "→" && !solo && par.closest && !par.closest("td,.btn,.ib")) return ch; const nm = SYM[ch]; return nm ? ERP.ic(nm, 15) : ""; });
      const span = document.createElement("span"); span.innerHTML = html.replace(/^\s+(?=<svg)/, "");
      par.replaceChild(span, n); span.replaceWith(...span.childNodes);
    });
    /* botões "+ Algo": troca o "+" por ícone */
    $$(".btn", root).forEach((b) => { const f = b.firstChild; if (f && f.nodeType === 3 && /^\s*\+\s*/.test(f.nodeValue)) { f.nodeValue = f.nodeValue.replace(/^\s*\+\s*/, ""); b.insertAdjacentHTML("afterbegin", ERP.ic("plus", 16)); } });
  };

  /* aparência: "auto" segue o aparelho; "light"/"dark" fixam */
  const mqDark = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : { matches: false };
  ERP.theme = () => lsGet("theme", "auto") || "auto";
  ERP.isDark = () => { const t = ERP.theme(); return t === "dark" || (t === "auto" && mqDark.matches); };
  ERP.setTheme = function (t) {
    lsSet("theme", t);
    if (t === "light" || t === "dark") document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
    ERP.paintTheme(); ERP.render();
  };
  ERP.paintTheme = function () {
    const dark = ERP.isDark();
    $$(".themebtn").forEach((b) => { const lbl = dark ? "Usar modo claro" : "Usar modo escuro"; b.innerHTML = (ERP.ic ? ERP.ic(dark ? "sun" : "moon", b.classList.contains("iconbtn") ? 20 : 16) : "") + (b.classList.contains("chip") ? `<span>${dark ? "Modo claro" : "Modo escuro"}</span>` : ""); b.title = lbl; b.setAttribute("aria-label", lbl); });
    $$('meta[name="theme-color"]').forEach((m) => { m.removeAttribute("media"); m.content = dark ? "#0C1320" : "#FFFFFF"; });
  };
  if (mqDark.addEventListener) mqDark.addEventListener("change", () => { if (ERP.theme() === "auto") { ERP.paintTheme(); ERP.render(); } });

  ERP.render = function () {
    ERP._charts.forEach((c) => { try { c.destroy(); } catch (e) {} }); ERP._charts = [];
    const { mod, page } = route();
    const ic = (n, s) => (ERP.ic ? ERP.ic(n, s) : "");
    const ORD = ["inicio", "financas", "reminders", "investimentos", "patrimonio"];
    const vis = ERP.modules.filter((m) => m.id !== "sistema").sort((x, y) => (ORD.indexOf(x.id) + 1 || 99) - (ORD.indexOf(y.id) + 1 || 99));
    $("#nav").innerHTML = vis.map((m) => `<a href="#/${m.id}" class="${m.id === mod.id ? "on" : ""}"${m.id === mod.id ? ' aria-current="page"' : ""}>${ic(m.icon, 18)}<span>${esc(m.short || m.label)}</span></a>`).join("");
    const sis = ERP.modules.find((m) => m.id === "sistema");
    if (sis) { const a = $("#navSis"); a.className = mod.id === "sistema" ? "on" : ""; a.innerHTML = `${ic(sis.icon, 18)}<span>${esc(sis.label)}</span>`; const ms = $("#mSis"); ms.innerHTML = ic(sis.icon, 20); ms.className = "iconbtn" + (mod.id === "sistema" ? " on" : ""); }
    $("#tabbar").innerHTML = vis.slice(0, 5).map((m) => `<a href="#/${m.id}" class="${m.id === mod.id ? "on" : ""}">${ic(m.icon, 22)}<span>${esc(m.tab || m.short || m.label)}</span></a>`).join("");
    $("#mTitle").textContent = mod.short || mod.label;
    const main = $("#main"); main.innerHTML = "";
    if (mod.pages && mod.pages.length > 1) {
      const head = document.createElement("div"); head.className = "modhead";
      head.innerHTML = `<nav class="subnav" aria-label="${esc(mod.label)}">${mod.pages.map((p) => `<a href="#/${mod.id}/${p.id}" class="${p.id === page.id ? "on" : ""}">${esc(p.label)}</a>`).join("")}</nav>`;
      main.appendChild(head);
      const on = $(".subnav a.on", head); if (on) requestAnimationFrame(() => on.scrollIntoView({ block: "nearest", inline: "nearest" }));
    }
    const body = document.createElement("div"); main.appendChild(body);
    try { (page ? page.render : mod.render)(body, { mod, page }); } catch (e) { console.error(e); body.innerHTML = `<div class="note err">Não foi possível abrir esta tela: ${esc(e.message)}</div>`; }
    ERP.iconify(body);
    document.title = (page && mod.pages && mod.pages.length > 1 ? page.label + " · " : "") + (mod.short || mod.label) + " · ERP Rafael";
  };
  /* re-renderizações parciais dentro das telas também ganham ícones */
  new MutationObserver((ms) => { if (ERP._iconBusy) return; ERP._iconBusy = true; try { ms.forEach((m) => m.addedNodes.forEach((n) => { if (n.nodeType === 1 && !(n.closest && n.closest("svg"))) ERP.iconify(n); })); } finally { ERP._iconBusy = false; } }).observe(document.getElementById("main") || document.documentElement, { childList: true, subtree: true });
  ERP.pagehead = (title, actions) => `<div class="pagehead"><h1>${esc(title)}</h1><span class="sp"></span>${actions ? `<div class="pha">${actions}</div>` : ""}</div>`;
  ERP.kpi = (l, v, s, cls) => `<div class="kpi ${cls || ""}"><div class="l">${esc(l)}</div><div class="v">${v}</div>${s ? `<div class="s">${s}</div>` : ""}</div>`;
  ERP.download = (name, content, type) => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([content], { type: type || "application/json" })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1500); };

  ERP.boot = async function () {
    Store.load();
    (ERP.onBoot || []).forEach((f) => { try { f(); } catch (e) { console.error(e); } });
    $$(".sync").forEach((c) => (c.onclick = () => ERP.nav("sistema/dados")));
    $$(".themebtn").forEach((c) => (c.onclick = () => ERP.setTheme(ERP.isDark() ? "light" : "dark")));
    ERP.paintTheme();
    window.addEventListener("hashchange", ERP.render);
    ERP.render();
    try { if ("serviceWorker" in navigator && location.protocol === "https:" && /github\.io$/.test(location.hostname)) navigator.serviceWorker.register("sw.js"); } catch (e) {}   /* app instalável (PWA) */
    await Cloud.init();
    window.addEventListener("online", () => Cloud.account && Store.names().forEach((n) => Store.meta[n].dirty && Cloud.schedule(n)));
  };
})();
