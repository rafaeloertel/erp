/* Controles próprios: lista suspensa e calendário no padrão visual do ERP.
   Os <select> e <input type=date> originais continuam no HTML (ocultos) e guardam o valor,
   então nenhum módulo precisa mudar. */
(function () {
  "use strict";
  const CHEV = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
  const CHK = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';
  const CAL = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4.5" width="18" height="16" rx="2"/><path d="M8 2.5v4M16 2.5v4M3 10h18"/></svg>';
  const PREV = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>';
  const NEXT = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>';
  const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  const p2 = (n) => String(n).padStart(2, "0");
  const iso = (y, m, d) => y + "-" + p2(m + 1) + "-" + p2(d);
  const hoje = () => { const t = new Date(); return iso(t.getFullYear(), t.getMonth(), t.getDate()); };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  let pop = null, popOwner = null, popPos = null;
  function closePop() { if (pop) { pop.remove(); pop = null; if (popOwner) popOwner.classList.remove("open"); popOwner = null; popPos = null; } }
  function place(anchor, el) {
    const r = anchor.getBoundingClientRect(); const vw = innerWidth, vh = innerHeight;
    el.style.minWidth = Math.max(r.width, 0) + "px";
    const w = el.offsetWidth, h = el.offsetHeight;
    let left = Math.min(Math.max(8, r.left), vw - w - 8);
    let top = r.bottom + 6; if (top + h > vh - 8 && r.top - h - 6 > 8) top = r.top - h - 6;
    if (top + h > vh - 8) { el.style.maxHeight = Math.max(160, vh - top - 8) + "px"; }
    el.style.left = left + "px"; el.style.top = top + "px";
  }
  function open(owner, el) {
    closePop(); pop = el; popOwner = owner; owner.classList.add("open");
    document.body.appendChild(el); popPos = () => place(owner, el); popPos();
  }
  document.addEventListener("mousedown", (e) => { if (pop && !pop.contains(e.target) && !(popOwner && popOwner.contains(e.target))) closePop(); }, true);
  addEventListener("resize", () => closePop());
  addEventListener("scroll", (e) => { if (pop && !pop.contains(e.target)) { popPos ? popPos() : closePop(); } }, true);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && pop) { e.stopPropagation(); const o = popOwner; closePop(); o && o.querySelector && o.focus && o.focus(); } }, true);

  /* hook: quando código externo muda .value, o controle atualiza */
  function hookValue(el, refresh) {
    const d = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value"); if (!d) return;
    Object.defineProperty(el, "value", { get() { return d.get.call(this); }, set(v) { d.set.call(this, v); refresh(); }, configurable: true });
  }
  const fire = (el) => { el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); };

  /* ---------- lista suspensa ---------- */
  function enhanceSelect(sel) {
    if (sel.dataset.xs || sel.multiple || sel.size > 1) return; sel.dataset.xs = "1";
    const btn = document.createElement("button"); btn.type = "button"; btn.className = "xs-btn " + (sel.className || "");
    btn.setAttribute("aria-haspopup", "listbox"); btn.style.cssText = sel.style.cssText;
    sel.parentNode.insertBefore(btn, sel); sel.classList.add("xs-native"); sel.tabIndex = -1;
    const label = () => { const o = sel.options[sel.selectedIndex]; btn.innerHTML = `<span class="xs-t">${o ? esc(o.textContent) : ""}</span>${CHEV}`; btn.disabled = sel.disabled; };
    label(); hookValue(sel, label);
    sel.addEventListener("change", label);
    new MutationObserver(label).observe(sel, { childList: true, subtree: true, attributes: true, attributeFilter: ["disabled"] });
    const lb = sel.id && document.querySelector(`label[for="${sel.id}"]`); if (lb) lb.addEventListener("click", (e) => { e.preventDefault(); btn.focus(); });

    function show() {
      const el = document.createElement("div"); el.className = "xs-pop"; el.setAttribute("role", "listbox");
      let act = sel.selectedIndex;
      el.innerHTML = Array.from(sel.options).map((o, i) => o.parentNode.tagName === "OPTGROUP" && o === o.parentNode.firstElementChild ? `<div class="xs-g">${esc(o.parentNode.label)}</div>${item(o, i)}` : item(o, i)).join("");
      function item(o, i) { return `<div class="xs-i${i === sel.selectedIndex ? " on" : ""}${o.disabled ? " off" : ""}" role="option" data-i="${i}"><span>${esc(o.textContent)}</span>${i === sel.selectedIndex ? CHK : ""}</div>`; }
      open(btn, el);
      const items = () => Array.from(el.querySelectorAll(".xs-i"));
      const mark = () => items().forEach((n, i) => n.classList.toggle("hv", i === act));
      const cur = el.querySelector(".xs-i.on"); if (cur) cur.scrollIntoView({ block: "nearest" });
      const pick = (i) => { const o = sel.options[i]; if (!o || o.disabled) return; closePop(); if (sel.selectedIndex !== i) { sel.selectedIndex = i; label(); fire(sel); } btn.focus(); };
      el.addEventListener("mousedown", (e) => e.preventDefault());
      el.addEventListener("click", (e) => { const n = e.target.closest(".xs-i"); if (n) pick(+n.dataset.i); });
      el.addEventListener("mousemove", (e) => { const n = e.target.closest(".xs-i"); if (n) { act = +n.dataset.i; mark(); } });
      el._key = (e) => {
        const max = sel.options.length - 1;
        if (e.key === "ArrowDown") { act = Math.min(max, act + 1); } else if (e.key === "ArrowUp") { act = Math.max(0, act - 1); } else if (e.key === "Enter" || e.key === " ") { pick(act); } else if (e.key === "Home") act = 0; else if (e.key === "End") act = max; else return;
        e.preventDefault(); mark(); const n = items()[act]; n && n.scrollIntoView({ block: "nearest" });
      };
    }
    btn.addEventListener("click", () => { if (pop && popOwner === btn) closePop(); else show(); });
    btn.addEventListener("keydown", (e) => {
      if (pop && popOwner === btn && pop._key) return pop._key(e);
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) { e.preventDefault(); show(); }
    });
  }

  /* ---------- calendário ---------- */
  const fmt = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v.slice(8) + "/" + v.slice(5, 7) + "/" + v.slice(0, 4) : "");
  function parseBR(s) {
    const m = String(s).trim().match(/^(\d{1,2})\D+(\d{1,2})\D+(\d{4})$/); if (!m) return null;
    const d = +m[1], mo = +m[2], y = +m[3]; const t = new Date(y, mo - 1, d);
    return t.getFullYear() === y && t.getMonth() === mo - 1 && t.getDate() === d ? iso(y, mo - 1, d) : null;
  }
  function enhanceDate(inp) {
    if (inp.dataset.xs) return; inp.dataset.xs = "1";
    const wrap = document.createElement("span"); wrap.className = "xd " + (inp.className || ""); wrap.style.cssText = inp.style.cssText;
    const txt = document.createElement("input"); txt.type = "text"; txt.className = "xd-t"; txt.placeholder = "dd/mm/aaaa"; txt.inputMode = "numeric"; txt.autocomplete = "off"; txt.maxLength = 10;
    const ic = document.createElement("button"); ic.type = "button"; ic.className = "xd-i"; ic.tabIndex = -1; ic.setAttribute("aria-label", "Abrir calendário"); ic.innerHTML = CAL;
    wrap.append(txt, ic); inp.parentNode.insertBefore(wrap, inp); inp.classList.add("xs-native"); inp.tabIndex = -1;
    const sync = () => { txt.value = fmt(inp.value); txt.disabled = inp.disabled; ic.disabled = inp.disabled; };
    sync(); hookValue(inp, sync); inp.addEventListener("change", sync);
    new MutationObserver(sync).observe(inp, { attributes: true, attributeFilter: ["disabled"] });
    if (inp.id) { const lb = document.querySelector(`label[for="${inp.id}"]`); if (lb) lb.addEventListener("click", (e) => { e.preventDefault(); txt.focus(); }); }
    const setV = (v) => { if (inp.value !== v) { inp.value = v; fire(inp); } sync(); };
    txt.addEventListener("input", () => {
      let d = txt.value.replace(/\D/g, "").slice(0, 8); let o = d;
      if (d.length > 4) o = d.slice(0, 2) + "/" + d.slice(2, 4) + "/" + d.slice(4); else if (d.length > 2) o = d.slice(0, 2) + "/" + d.slice(2);
      txt.value = o; if (o.length === 10) { const v = parseBR(o); if (v) setV(v); }
    });
    txt.addEventListener("blur", () => { if (!txt.value.trim()) setV(""); else { const v = parseBR(txt.value); if (v) setV(v); else sync(); } });
    txt.addEventListener("keydown", (e) => { if (e.key === "Enter") { const v = parseBR(txt.value); if (v) setV(v); } if (e.key === "ArrowDown" && !pop) { e.preventDefault(); show(); } });

    function show() {
      const sel = inp.value || ""; const base = sel || hoje(); let vy = +base.slice(0, 4), vm = +base.slice(5, 7) - 1, mode = "dias";
      const el = document.createElement("div"); el.className = "xc"; el.addEventListener("mousedown", (e) => e.preventDefault());
      const draw = () => {
        if (mode === "meses") {
          el.innerHTML = `<div class="xc-h"><button type="button" class="xc-n" data-a="py">${PREV}</button><button type="button" class="xc-m" data-a="dias">${vy}</button><button type="button" class="xc-n" data-a="ny">${NEXT}</button></div><div class="xc-meses">${MESES.map((m, i) => `<button type="button" class="${i === vm ? "on" : ""}" data-m="${i}">${m.slice(0, 3)}</button>`).join("")}</div>`;
        } else {
          const first = new Date(vy, vm, 1).getDay(), dim = new Date(vy, vm + 1, 0).getDate(), prevDim = new Date(vy, vm, 0).getDate(); const t = hoje(); let cells = "";
          for (let i = 0; i < 42; i++) {
            let d = i - first + 1, y = vy, m = vm, out = false;
            if (d < 1) { d += prevDim; m--; out = true; } else if (d > dim) { d -= dim; m++; out = true; }
            if (m < 0) { m = 11; y--; } if (m > 11) { m = 0; y++; }
            const v = iso(y, m, d); cells += `<button type="button" class="xc-d${out ? " out" : ""}${v === sel ? " on" : ""}${v === t ? " today" : ""}" data-v="${v}">${d}</button>`;
            if (i === 34 && cells && !(first + dim > 35)) break;
          }
          el.innerHTML = `<div class="xc-h"><button type="button" class="xc-n" data-a="pm" aria-label="Mês anterior">${PREV}</button><button type="button" class="xc-m" data-a="meses">${MESES[vm]} de ${vy} ${CHEV}</button><button type="button" class="xc-n" data-a="nm" aria-label="Próximo mês">${NEXT}</button></div><div class="xc-w">${["D", "S", "T", "Q", "Q", "S", "S"].map((x) => `<span>${x}</span>`).join("")}</div><div class="xc-g">${cells}</div><div class="xc-f"><button type="button" data-a="limpar">Limpar</button><button type="button" class="hoje" data-a="hoje">Hoje</button></div>`;
        }
      };
      draw();
      el.addEventListener("click", (e) => {
        const b = e.target.closest("button"); if (!b) return;
        if (b.dataset.v) { closePop(); setV(b.dataset.v); txt.focus(); return; }
        if (b.dataset.m) { vm = +b.dataset.m; mode = "dias"; return draw(); }
        const a = b.dataset.a;
        if (a === "pm") { if (--vm < 0) { vm = 11; vy--; } } else if (a === "nm") { if (++vm > 11) { vm = 0; vy++; } }
        else if (a === "py") vy--; else if (a === "ny") vy++; else if (a === "meses") mode = "meses"; else if (a === "dias") mode = "dias";
        else if (a === "limpar") { closePop(); setV(""); return; } else if (a === "hoje") { closePop(); setV(hoje()); return; }
        draw();
      });
      open(wrap, el); wrap.classList.add("open");
    }
    ic.addEventListener("click", () => { if (pop && popOwner === wrap) closePop(); else show(); });
    txt.addEventListener("focus", () => { /* abre só pelo ícone ou seta para baixo */ });
  }

  function scan(root) {
    if (!root || root.nodeType !== 1) return;
    if (root.matches && root.matches("select")) enhanceSelect(root); else if (root.matches && root.matches('input[type="date"]')) enhanceDate(root);
    root.querySelectorAll && root.querySelectorAll('select:not([data-xs]),input[type="date"]:not([data-xs])').forEach((n) => (n.tagName === "SELECT" ? enhanceSelect(n) : enhanceDate(n)));
  }
  let busy = false;
  new MutationObserver((ms) => { if (busy) return; busy = true; try { ms.forEach((m) => m.addedNodes.forEach((n) => { if (n.nodeType === 1 && !(n.classList && (n.classList.contains("xs-pop") || n.classList.contains("xc")))) scan(n); })); } finally { busy = false; } }).observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener("DOMContentLoaded", () => scan(document.body));
  if (document.body) scan(document.body);
})();
