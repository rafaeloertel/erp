/* Módulo Reminders — Central de Demandas (listas, prazos, checklist, visão Lista e Kanban) */
(function () {
  "use strict";
  const { $, $$, esc, uid, todayISO, fdate, Store } = ERP;
  ERP.defaults.reminders = { lists: [], tasks: [], seq: 0 };

  const ST = [["todo", "A fazer"], ["doing", "Em andamento"], ["wait", "Aguardando"], ["block", "Bloqueado"], ["done", "Concluído"]];
  const STN = Object.fromEntries(ST);
  const PR = [["none", "Sem prioridade"], ["low", "Baixa"], ["med", "Média"], ["high", "Alta"]];
  const PRN = Object.fromEntries(PR);
  const BLOCKS = [["hoje", "Hoje"], ["agendadas", "Agendadas"], ["todas", "Todas"], ["sinal", "Sinalizadas"], ["andamento", "Em andamento"], ["concluidas", "Concluídas"]];
  const COLORS = ["#b94ee0", "#f1612f", "#2b5ba8", "#197a46", "#c9a100", "#d6336c", "#0b1628", "#5b6068"];
  const S = { sel: "todas", view: "lista", q: "" };

  const D = () => Store.get("reminders");
  const open = (t) => t.status !== "done";
  const filt = (t) => {
    const s = S.sel, today = todayISO();
    if (s === "hoje") return open(t) && t.due && t.due <= today;
    if (s === "agendadas") return open(t) && !!t.due;
    if (s === "todas") return open(t);
    if (s === "sinal") return open(t) && t.flagged;
    if (s === "andamento") return t.status === "doing";
    if (s === "concluidas") return t.status === "done";
    return t.listId === s && (S.view === "kanban" || open(t));
  };
  const count = (id) => { const old = S.sel; S.sel = id; const n = D().tasks.filter((t) => filt(t) && (!["todas"].includes(id) || true)).length; S.sel = old; return n; };

  function parseQuick(txt) {
    let title = txt, owner = "", priority = "none", due = "", tags = [];
    title = title.replace(/@(\S+)/g, (m, a) => { owner = a; return ""; });
    title = title.replace(/!(alta|media|média|baixa)/gi, (m, a) => { a = a.toLowerCase(); priority = a === "alta" ? "high" : a === "baixa" ? "low" : "med"; return ""; });
    title = title.replace(/#(\S+)/g, (m, a) => { tags.push(a); return ""; });
    title = title.replace(/\b(hoje|amanh[ãa])\b/gi, (m, a) => { const d = new Date(); if (/amanh/i.test(a)) d.setDate(d.getDate() + 1); due = d.getFullYear() + "-" + ERP.p2(d.getMonth() + 1) + "-" + ERP.p2(d.getDate()); return ""; });
    title = title.replace(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/, (m, d, mo, y) => { const yy = y ? (y.length === 2 ? "20" + y : y) : String(new Date().getFullYear()); due = yy + "-" + ERP.p2(mo) + "-" + ERP.p2(d); return ""; });
    return { title: title.replace(/\s+/g, " ").trim(), owner, priority, due, tags };
  }

  function addTask(txt) {
    const p = parseQuick(txt); if (!p.title) return;
    const sel = S.sel; const lid = D().lists.some((l) => l.id === sel) ? sel : (D().lists[0] || {}).id || "";
    Store.change("reminders", (d) => {
      d.seq = Math.max(d.seq || 0, ...d.tasks.map((t) => t.num || 0)) + 1;
      const now = Date.now();
      d.tasks.push({ id: uid("t"), num: d.seq, key: "DEM-" + String(d.seq).padStart(2, "0"), title: p.title, notes: "", listId: lid, status: "todo", priority: p.priority, due: p.due, time: "", owner: p.owner, tags: p.tags, subtasks: [], flagged: false, order: d.seq, createdAt: now, updatedAt: now, doneAt: null });
    });
    ERP.render();
  }
  function setStatus(id, status) {
    Store.change("reminders", (d) => { const t = d.tasks.find((x) => x.id === id); if (!t) return; t.status = status; t.updatedAt = Date.now(); t.doneAt = status === "done" ? Date.now() : null; });
  }

  function editTask(id) {
    const d = D(); const t = d.tasks.find((x) => x.id === id); if (!t) return;
    const subs = (t.subtasks || []).map((s) => (s.done ? "[x] " : "[ ] ") + s.t).join("\n");
    ERP.form({
      title: `${t.key} · Editar demanda`, wide: true,
      fields: [
        { k: "title", label: "Título", value: t.title, full: true, required: true },
        { k: "listId", label: "Lista", type: "select", value: t.listId, options: d.lists.map((l) => [l.id, l.icon + " " + l.name]) },
        { k: "status", label: "Status", type: "select", value: t.status, options: ST },
        { k: "priority", label: "Prioridade", type: "select", value: t.priority, options: PR },
        { k: "owner", label: "Responsável", value: t.owner },
        { k: "due", label: "Prazo", type: "date", value: t.due },
        { k: "time", label: "Horário", type: "time", value: t.time },
        { k: "tags", label: "Etiquetas (separadas por vírgula)", value: (t.tags || []).join(", "), full: true },
        { k: "notes", label: "Anotações", type: "textarea", value: t.notes, full: true },
        { k: "subs", label: "Checklist (uma etapa por linha; [x] marca como feita)", type: "textarea", value: subs, full: true },
        { k: "flagged", label: "Sinalizada", type: "checkbox", value: t.flagged },
      ],
      onSubmit(v) {
        Store.change("reminders", (dd) => {
          const x = dd.tasks.find((y) => y.id === id); if (!x) return;
          Object.assign(x, { title: v.title.trim(), listId: v.listId, priority: v.priority, owner: v.owner.trim(), due: v.due, time: v.time, notes: v.notes, flagged: v.flagged, updatedAt: Date.now() });
          x.tags = v.tags.split(",").map((s) => s.trim()).filter(Boolean);
          x.subtasks = v.subs.split("\n").map((l) => l.trim()).filter(Boolean).map((l, i) => ({ id: "s" + (i + 1), done: /^\[x\]/i.test(l), t: l.replace(/^\[[ xX]\]\s*/, "") }));
          if (v.status !== x.status) { x.status = v.status; x.doneAt = v.status === "done" ? Date.now() : null; }
        });
        ERP.render();
      },
      onDelete() { Store.change("reminders", (dd) => { dd.tasks = dd.tasks.filter((x) => x.id !== id); }); ERP.render(); },
    });
  }
  function editList(id) {
    const d = D(); const l = d.lists.find((x) => x.id === id) || { name: "", icon: "📋", color: COLORS[0] };
    ERP.form({
      title: id ? "Editar lista" : "Nova lista",
      fields: [
        { k: "name", label: "Nome", value: l.name, required: true },
        { k: "icon", label: "Emoji", value: l.icon },
        { k: "color", label: "Cor", type: "select", value: l.color, options: COLORS.map((c) => [c, c]) },
      ],
      onSubmit(v) {
        Store.change("reminders", (dd) => {
          if (id) Object.assign(dd.lists.find((x) => x.id === id), { name: v.name.trim(), icon: v.icon.trim() || "📋", color: v.color });
          else dd.lists.push({ id: uid("l"), name: v.name.trim(), icon: v.icon.trim() || "📋", color: v.color, order: dd.lists.length + 1 });
        });
        ERP.render();
      },
      onDelete: id ? () => { Store.change("reminders", (dd) => { dd.lists = dd.lists.filter((x) => x.id !== id); dd.tasks.forEach((t) => { if (t.listId === id) t.listId = ""; }); }); S.sel = "todas"; ERP.render(); } : null,
    });
  }

  function dueMeta(t) {
    if (!t.due) return "";
    const late = open(t) && t.due < todayISO();
    return `<span class="pill ${late ? "err" : t.due === todayISO() ? "warn" : ""}">${fdate(t.due)}${t.time ? " " + t.time : ""}</span>`;
  }

  function render(root) {
    const d = D();
    const lists = d.lists.slice().sort((a, b) => (a.order || 0) - (b.order || 0));
    const listBy = Object.fromEntries(lists.map((l) => [l.id, l]));
    root.innerHTML = ERP.pagehead("Reminders", `<button class="btn ghost" id="rNewList">+ Lista</button>`) + `
      <div class="rem"><aside class="rem-side">
        <div class="blocks">${BLOCKS.map(([id, n]) => `<button class="blk ${S.sel === id ? "on" : ""}" data-sel="${id}"><b>${count(id)}</b>${n}</button>`).join("")}</div>
        ${lists.map((l) => `<button class="lst ${S.sel === l.id ? "on" : ""}" data-sel="${l.id}"><span class="dot" style="background:${esc(l.color)}"></span>${esc(l.icon)} ${esc(l.name)}<span class="ct">${d.tasks.filter((t) => t.listId === l.id && open(t)).length}</span></button>`).join("")}
        ${S.sel && listBy[S.sel] ? `<button class="btn ghost sm" style="margin-top:8px" data-editlist="${S.sel}">Editar lista</button>` : ""}
      </aside><section>
        <div class="quick"><input id="rQuick" placeholder="Nova demanda — ex.: Renovar passaporte @Rafael 10/06 !alta #documentos" aria-label="Nova demanda"><button class="btn orange" id="rAdd">Adicionar</button></div>
        <div class="toolbar"><div class="tabs" style="margin:0;border:0"><button class="${S.view === "lista" ? "on" : ""}" data-view="lista">Lista</button><button class="${S.view === "kanban" ? "on" : ""}" data-view="kanban">Kanban</button></div><input id="rQ" placeholder="Buscar" value="${esc(S.q)}" style="max-width:220px"></div>
        <div id="rBody"></div></section></div>`;
    const q = S.q.trim().toLowerCase();
    const tasks = d.tasks.filter(filt).filter((t) => !q || (t.title + " " + (t.notes || "") + " " + (t.tags || []).join(" ")).toLowerCase().includes(q)).sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999") || (a.order || 0) - (b.order || 0));
    const body = $("#rBody", root);
    if (S.view === "lista") {
      body.innerHTML = tasks.length ? `<div class="tw">${tasks.map((t) => {
        const l = listBy[t.listId]; const sub = (t.subtasks || []);
        return `<div class="trow ${t.status === "done" ? "done" : ""}"><button class="ck" data-ck="${t.id}" aria-label="Concluir"></button><div class="tt" data-edit="${t.id}">${t.flagged ? "🚩 " : ""}${esc(t.title)}<div class="meta">${l ? `<span>${esc(l.icon)} ${esc(l.name)}</span>` : ""}${dueMeta(t)}${t.priority !== "none" ? `<span class="pill ${t.priority === "high" ? "err" : t.priority === "med" ? "warn" : ""}">${PRN[t.priority]}</span>` : ""}${t.status !== "todo" && t.status !== "done" ? `<span class="pill info">${STN[t.status]}</span>` : ""}${sub.length ? `<span>☑ ${sub.filter((s) => s.done).length}/${sub.length}</span>` : ""}${t.owner ? `<span>@${esc(t.owner)}</span>` : ""}${(t.tags || []).map((g) => `<span>#${esc(g)}</span>`).join("")}</div></div></div>`;
      }).join("")}</div>` : `<div class="empty">Nenhuma demanda aqui. Escreva acima e tecle Enter.</div>`;
    } else {
      body.innerHTML = `<div class="kan">${ST.map(([k, n]) => `<div class="kcol" data-col="${k}"><h4>${n} · ${tasks.filter((t) => t.status === k).length}</h4>${tasks.filter((t) => t.status === k).map((t) => `<div class="kcard" draggable="true" data-id="${t.id}" data-edit="${t.id}">${esc(t.title)}<div class="meta mut">${listBy[t.listId] ? esc(listBy[t.listId].icon) : ""} ${dueMeta(t)}</div></div>`).join("")}</div>`).join("")}</div>`;
      $$(".kcard", body).forEach((c) => c.addEventListener("dragstart", (e) => e.dataTransfer.setData("text/plain", c.dataset.id)));
      $$(".kcol", body).forEach((c) => {
        c.addEventListener("dragover", (e) => { e.preventDefault(); c.classList.add("over"); });
        c.addEventListener("dragleave", () => c.classList.remove("over"));
        c.addEventListener("drop", (e) => { e.preventDefault(); const id = e.dataTransfer.getData("text/plain"); if (id) { setStatus(id, c.dataset.col); ERP.render(); } });
      });
    }
    root.addEventListener("click", (e) => {
      const b = e.target.closest("[data-sel],[data-view],[data-ck],[data-edit],[data-editlist]"); if (!b) return;
      if (b.dataset.sel) { S.sel = b.dataset.sel; ERP.render(); }
      else if (b.dataset.view) { S.view = b.dataset.view; ERP.render(); }
      else if (b.dataset.ck) { const t = D().tasks.find((x) => x.id === b.dataset.ck); setStatus(t.id, t.status === "done" ? "todo" : "done"); ERP.render(); }
      else if (b.dataset.edit) editTask(b.dataset.edit);
      else if (b.dataset.editlist) editList(b.dataset.editlist);
    });
    $("#rNewList", root).onclick = () => editList(null);
    $("#rAdd", root).onclick = () => { const i = $("#rQuick", root); addTask(i.value); };
    $("#rQuick", root).onkeydown = (e) => { if (e.key === "Enter") addTask(e.target.value); };
    $("#rQ", root).oninput = (e) => { S.q = e.target.value; const p = e.target.selectionStart; ERP.render(); const n = $("#rQ"); n.focus(); n.setSelectionRange(p, p); };
  }

  ERP.reminders = { openCount: () => D().tasks.filter(open).length, dueToday: () => D().tasks.filter((t) => open(t) && t.due && t.due <= todayISO()), listOf: (id) => D().lists.find((l) => l.id === id) };
  ERP.register({ id: "reminders", label: "Reminders", icon: "✅", group: "Organização", render });
})();
