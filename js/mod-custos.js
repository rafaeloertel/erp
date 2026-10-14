/* Módulo Custos Pessoais — lançamentos, contas a pagar, cartões (faturas e parcelas), relatórios, cadastros */
(function () {
  "use strict";
  const { $, $$, esc, uid, brl, num, todayISO, fdate, monthKey, monthLabel, addMonths, Store } = ERP;

  const CATS = [
    ["Moradia", "despesa", "#0E5E6F"], ["Alimentação", "despesa", "#C2643B"], ["Transporte", "despesa", "#3F6DB3"], ["Saúde", "despesa", "#B44B6E"],
    ["Lazer", "despesa", "#8A63C2"], ["Educação", "despesa", "#3A8F7E"], ["Assinaturas", "despesa", "#5E7C8D"], ["Compras", "despesa", "#D08A2A"],
    ["Impostos e taxas", "despesa", "#7A7A7A"], ["Pets", "despesa", "#A0703C"], ["Investimentos (aporte)", "despesa", "#0B1628"], ["Outros gastos", "despesa", "#9AA5B1"],
    ["Salário", "receita", "#177A4D"], ["Pró-labore / Distribuição", "receita", "#2E9E6B"], ["Rendimentos", "receita", "#4CAF84"], ["Outras receitas", "receita", "#88C9A7"],
  ];
  ERP.defaults.custos = {
    accounts: [{ id: "acc_principal", name: "Conta principal", type: "corrente", opening: 0 }],
    cards: [],
    categories: CATS.map(([name, type, color], i) => ({ id: "cat_" + i, name, type, color })),
    tx: [], bills: [],
  };
  const D = () => Store.get("custos");
  const S = { month: monthKey(todayISO()), q: "", type: "", cat: "", card: "", year: new Date().getFullYear() };
  const ACC_T = [["corrente", "Conta corrente"], ["poupanca", "Poupança"], ["dinheiro", "Dinheiro"], ["pagamento", "Conta de pagamento"], ["exterior", "Conta no exterior"]];
  const CLS = [["fixo", "Fixo"], ["variavel", "Variável"]];

  const cat = (id) => D().categories.find((c) => c.id === id) || { name: "—", color: "#ccc" };
  const acc = (id) => D().accounts.find((a) => a.id === id);
  const card = (id) => D().cards.find((c) => c.id === id);

  /* fatura de uma compra: se o dia da compra >= dia de fechamento, cai na fatura do mês seguinte */
  function invoiceOf(c, iso) { const d = +iso.slice(8, 10); let mk = monthKey(iso); if (d >= (+c.closeDay || 1)) mk = monthKey(addMonths(mk + "-01", 1)); return mk; }
  function invoiceDue(c, mk) { const [y, m] = mk.split("-").map(Number); const last = new Date(y, m, 0).getDate(); return mk + "-" + ERP.p2(Math.min(+c.dueDay || 10, last)); }
  function invoiceTotal(cid, mk) { return D().tx.filter((t) => t.cardId === cid && t.invoice === mk).reduce((s, t) => s + (t.type === "receita" ? -t.amount : t.amount), 0); }
  function invoicePaid(cid, mk) { return D().tx.some((t) => t.payInvoice && t.payInvoice.card === cid && t.payInvoice.month === mk); }
  function accBalance(aid) { const a = acc(aid); let s = +(a && a.opening) || 0; D().tx.forEach((t) => { if (t.cardId || t.status !== "pago") return; if (t.type === "transferencia") { if (t.accountId === aid) s -= t.amount; if (t.toAccountId === aid) s += t.amount; } else if (t.accountId === aid) s += t.type === "receita" ? t.amount : -t.amount; }); return s; }
  /* efeito no caixa do mês: despesas em conta + pagamentos de fatura; compras no cartão não entram (evita duplicar) */
  function monthFlow(mk) {
    let rec = 0, desp = 0; const byCat = {};
    D().tx.forEach((t) => {
      if (t.type === "transferencia") return;
      const competence = t.cardId ? t.invoice : monthKey(t.date);
      if (competence !== mk || t.payInvoice) return;
      if (t.type === "receita") rec += t.amount; else { desp += t.amount; byCat[t.categoryId] = (byCat[t.categoryId] || 0) + t.amount; }
    });
    return { rec, desp, byCat };
  }
  ERP.custos = { monthFlow, accBalance, accounts: () => D().accounts, billsOpen: () => D().bills.filter((b) => !b.paid), invoiceTotal };

  /* ---------- formulários ---------- */
  function txForm(t) {
    const d = D(); const isNew = !t; t = t || { date: todayISO(), type: "despesa", status: "pago", cls: "variavel", accountId: (d.accounts[0] || {}).id, installments: 1 };
    const fields = [
      { k: "type", label: "Tipo", type: "select", value: t.type, options: [["despesa", "Despesa (−)"], ["receita", "Receita (+)"], ["transferencia", "Transferência entre contas"]] },
      { k: "date", label: "Data", type: "date", value: t.date, required: true },
      { k: "desc", label: "Descrição", value: t.desc, full: true, required: true },
      { k: "amount", label: isNew ? "Valor total (R$)" : "Valor (R$)", type: "number", step: "0.01", value: t.amount, required: true },
      { k: "categoryId", label: "Categoria", type: "select", value: t.categoryId, options: d.categories.map((c) => [c.id, (c.type === "receita" ? "＋ " : "") + c.name]) },
      { k: "origin", label: "Pago com", type: "select", value: t.cardId ? "card:" + t.cardId : "acc:" + (t.accountId || ""), options: d.accounts.map((a) => ["acc:" + a.id, "🏦 " + a.name]).concat(d.cards.map((c) => ["card:" + c.id, "💳 " + c.name])) },
      { k: "toAccountId", label: "Para a conta (transferência)", type: "select", value: t.toAccountId || "", options: [["", "—"]].concat(d.accounts.map((a) => [a.id, a.name])) },
      { k: "cls", label: "Classe", type: "select", value: t.cls, options: CLS },
      { k: "status", label: "Situação", type: "select", value: t.status, options: [["pago", "Realizado"], ["previsto", "Previsto"]] },
    ];
    if (isNew) fields.push({ k: "installments", label: "Parcelas (cartão)", type: "number", value: 1, step: "1" });
    fields.push({ k: "notes", label: "Observação", value: t.notes, full: true });
    ERP.form({
      title: isNew ? "Novo lançamento" : "Editar lançamento", wide: true, fields,
      onSubmit(v) {
        if (!v.amount || v.amount <= 0) { ERP.toast("Informe um valor maior que zero."); return false; }
        const [ok, oid] = v.origin.split(":"); const base = { type: v.type, desc: v.desc.trim(), categoryId: v.type === "transferencia" ? "" : v.categoryId, cls: v.cls, status: v.status, notes: v.notes || "" };
        Store.change("custos", (dd) => {
          if (!isNew) {
            const x = dd.tx.find((y) => y.id === t.id); Object.assign(x, base, { date: v.date, amount: v.amount, toAccountId: v.toAccountId });
            if (ok === "card") { const c = dd.cards.find((y) => y.id === oid); x.cardId = oid; x.accountId = ""; if (!x.instTotal || x.instTotal === 1) x.invoice = invoiceOf(c, v.date); } else { x.cardId = ""; x.accountId = oid; x.invoice = ""; }
            return;
          }
          if (ok === "card" && v.type === "despesa") {
            const c = dd.cards.find((y) => y.id === oid); const n = Math.max(1, Math.min(48, Math.round(v.installments || 1))); const g = uid("g"); const first = invoiceOf(c, v.date);
            const per = Math.floor((v.amount / n) * 100) / 100;
            for (let i = 0; i < n; i++) {
              const amt = i === n - 1 ? Math.round((v.amount - per * (n - 1)) * 100) / 100 : per;
              dd.tx.push(Object.assign({ id: uid("tx"), date: v.date, amount: amt, cardId: oid, accountId: "", invoice: monthKey(addMonths(first + "-01", i)), group: g, instNo: i + 1, instTotal: n }, base, { desc: n > 1 ? `${base.desc} (${i + 1}/${n})` : base.desc, status: "pago" }));
            }
          } else dd.tx.push(Object.assign({ id: uid("tx"), date: v.date, amount: v.amount, accountId: ok === "acc" ? oid : "", cardId: ok === "card" ? oid : "", invoice: ok === "card" ? invoiceOf(dd.cards.find((y) => y.id === oid), v.date) : "", toAccountId: v.type === "transferencia" ? v.toAccountId : "" }, base));
        });
        ERP.render();
      },
      onDelete: isNew ? null : async () => {
        let all = false; if (t.group && t.instTotal > 1) all = await ERP.confirm(`Esta compra tem ${t.instTotal} parcelas. Excluir todas? (Cancelar exclui só esta)`, "Excluir todas");
        Store.change("custos", (dd) => { dd.tx = dd.tx.filter((y) => (all ? y.group !== t.group : y.id !== t.id)); }); ERP.render();
      },
    });
  }
  function billForm(b) {
    const d = D(); const isNew = !b; b = b || { due: todayISO(), recurring: true, accountId: (d.accounts[0] || {}).id };
    ERP.form({
      title: isNew ? "Nova conta a pagar" : "Editar conta a pagar",
      fields: [
        { k: "desc", label: "Descrição", value: b.desc, full: true, required: true },
        { k: "amount", label: "Valor (R$)", type: "number", step: "0.01", value: b.amount, required: true },
        { k: "due", label: "Vencimento", type: "date", value: b.due, required: true },
        { k: "categoryId", label: "Categoria", type: "select", value: b.categoryId, options: d.categories.filter((c) => c.type === "despesa").map((c) => [c.id, c.name]) },
        { k: "accountId", label: "Pagar pela conta", type: "select", value: b.accountId, options: d.accounts.map((a) => [a.id, a.name]) },
        { k: "recurring", label: "Recorrente (mensal)", type: "checkbox", value: b.recurring },
      ],
      onSubmit(v) { Store.change("custos", (dd) => { if (isNew) dd.bills.push(Object.assign({ id: uid("bill"), paid: false }, v)); else Object.assign(dd.bills.find((x) => x.id === b.id), v); }); ERP.render(); },
      onDelete: isNew ? null : () => { Store.change("custos", (dd) => { dd.bills = dd.bills.filter((x) => x.id !== b.id); }); ERP.render(); },
    });
  }
  function payBill(id) {
    Store.change("custos", (dd) => {
      const b = dd.bills.find((x) => x.id === id); if (!b) return;
      dd.tx.push({ id: uid("tx"), type: "despesa", date: todayISO(), desc: b.desc, amount: b.amount, categoryId: b.categoryId, accountId: b.accountId, cardId: "", status: "pago", cls: b.recurring ? "fixo" : "variavel", billId: b.id });
      b.paid = true; b.paidAt = todayISO();
      if (b.recurring) dd.bills.push({ id: uid("bill"), desc: b.desc, amount: b.amount, due: addMonths(b.due, 1), categoryId: b.categoryId, accountId: b.accountId, recurring: true, paid: false });
    });
    ERP.toast("Conta paga e lançada." ); ERP.render();
  }
  function payInvoice(cid, mk) {
    const c = card(cid); const total = invoiceTotal(cid, mk); const d = D();
    ERP.form({
      title: `Pagar fatura ${c.name} · ${monthLabel(mk)}`, intro: "O pagamento sai da conta escolhida. As compras já contam como despesa pela fatura; o pagamento não duplica.",
      fields: [{ k: "amount", label: "Valor pago (R$)", type: "number", step: "0.01", value: Math.round(total * 100) / 100 }, { k: "date", label: "Data", type: "date", value: todayISO() }, { k: "accountId", label: "Conta", type: "select", value: c.payAccountId || (d.accounts[0] || {}).id, options: d.accounts.map((a) => [a.id, a.name]) }],
      onSubmit(v) { Store.change("custos", (dd) => dd.tx.push({ id: uid("tx"), type: "despesa", date: v.date, desc: `Fatura ${c.name} ${monthLabel(mk)}`, amount: v.amount, accountId: v.accountId, cardId: "", categoryId: "", status: "pago", cls: "fixo", payInvoice: { card: cid, month: mk } })); ERP.render(); },
    });
  }

  /* ---------- páginas ---------- */
  function monthNav() { return `<button class="btn ghost sm" data-m="-1">‹</button><b style="min-width:80px;text-align:center;color:var(--navy)">${monthLabel(S.month)}</b><button class="btn ghost sm" data-m="1">›</button>`; }
  function bindMonth(root) { $$("[data-m]", root).forEach((b) => (b.onclick = () => { S.month = monthKey(addMonths(S.month + "-01", +b.dataset.m)); ERP.render(); })); }

  function pResumo(root) {
    const f = monthFlow(S.month); const d = D();
    const saldo = d.accounts.reduce((s, a) => s + (a.type === "exterior" ? 0 : accBalance(a.id)), 0);
    const open = d.bills.filter((b) => !b.paid && monthKey(b.due) <= S.month);
    const fat = d.cards.reduce((s, c) => s + (invoicePaid(c.id, S.month) ? 0 : invoiceTotal(c.id, S.month)), 0);
    const cats = Object.entries(f.byCat).sort((a, b) => b[1] - a[1]); const max = cats.length ? cats[0][1] : 1;
    const six = []; for (let i = -5; i <= 0; i++) { const mk = monthKey(addMonths(S.month + "-01", i)); six.push([mk, monthFlow(mk)]); } const m6 = Math.max(1, ...six.map(([, x]) => Math.max(x.rec, x.desp)));
    root.innerHTML = ERP.pagehead("Custos Pessoais", `${monthNav()}<button class="btn orange" id="cNew">+ Lançamento</button>`) + `
      <div class="kpis">${ERP.kpi("Receitas do mês", brl(f.rec), "", "pos")}${ERP.kpi("Despesas do mês", brl(f.desp), "inclui compras no cartão pela fatura", "neg")}${ERP.kpi("Resultado", brl(f.rec - f.desp), f.rec ? num(((f.rec - f.desp) / f.rec) * 100, 1) + "% da receita" : "", f.rec - f.desp >= 0 ? "pos" : "neg")}${ERP.kpi("Saldo em contas (BR)", brl(saldo), d.accounts.length + " conta(s)")}${ERP.kpi("A pagar até o fim do mês", brl(open.reduce((s, b) => s + +b.amount, 0) + fat), open.length + " conta(s) + faturas")}</div>
      <div class="grid2"><div class="card"><h3>Despesas por categoria</h3>${cats.length ? cats.map(([id, v]) => `<div class="hrow"><span class="n">${esc(cat(id).name)}</span><div class="bar"><i style="width:${(v / max) * 100}%;background:${cat(id).color}"></i></div><span class="v">${brl(v)}</span></div>`).join("") : `<div class="empty">Sem despesas neste mês.</div>`}</div>
      <div class="card"><h3>Últimos 6 meses</h3><div class="cols6">${six.map(([mk, x]) => `<div class="c"><div class="pair"><i style="height:${(x.rec / m6) * 100}%" title="Receitas ${brl(x.rec)}"></i><i class="o" style="height:${(x.desp / m6) * 100}%" title="Despesas ${brl(x.desp)}"></i></div><small>${monthLabel(mk)}</small></div>`).join("")}</div><p class="mut" style="font-size:12px;margin-top:6px">■ receitas (azul) · ■ despesas (laranja)</p></div></div>
      <div class="card"><h3>Vencimentos próximos</h3>${open.length ? `<div class="tw"><table><tbody>${open.sort((a, b) => a.due.localeCompare(b.due)).map((b) => `<tr><td>${fdate(b.due)}</td><td>${esc(b.desc)}</td><td class="r">${brl(b.amount)}</td><td class="r"><button class="btn sm" data-pay="${b.id}">Pagar</button></td></tr>`).join("")}</tbody></table></div>` : `<div class="empty">Nada vencendo neste mês.</div>`}</div>`;
    bindMonth(root); $("#cNew", root).onclick = () => txForm(); $$("[data-pay]", root).forEach((b) => (b.onclick = () => payBill(b.dataset.pay)));
  }

  function pLanc(root) {
    const d = D(); const q = S.q.toLowerCase();
    const rows = d.tx.filter((t) => (t.cardId ? t.invoice : monthKey(t.date)) === S.month).filter((t) => (!S.type || t.type === S.type) && (!S.cat || t.categoryId === S.cat) && (!q || (t.desc + " " + (t.notes || "")).toLowerCase().includes(q))).sort((a, b) => b.date.localeCompare(a.date));
    const tot = rows.reduce((s, t) => s + (t.type === "receita" ? t.amount : t.type === "despesa" && !t.payInvoice ? -t.amount : 0), 0);
    root.innerHTML = ERP.pagehead("Lançamentos", `${monthNav()}<button class="btn ghost" id="cCsv">Exportar CSV</button><button class="btn orange" id="cNew">+ Lançamento</button>`) + `
      <div class="toolbar"><input id="cQ" placeholder="Buscar descrição" value="${esc(S.q)}"><select id="cT"><option value="">Todos os tipos</option><option value="despesa">Despesas</option><option value="receita">Receitas</option><option value="transferencia">Transferências</option></select><select id="cC"><option value="">Todas as categorias</option>${d.categories.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join("")}</select></div>
      ${rows.length ? `<div class="tw"><table><thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Origem</th><th>Classe</th><th class="r">Valor</th></tr></thead><tbody>${rows.map((t) => `<tr data-tx="${t.id}" style="cursor:pointer"><td>${fdate(t.date)}</td><td>${esc(t.desc)}${t.status === "previsto" ? ' <span class="pill warn">previsto</span>' : ""}${t.payInvoice ? ' <span class="pill info">pgto fatura</span>' : ""}</td><td>${t.categoryId ? `<span class="pill" style="background:${cat(t.categoryId).color}22;color:${cat(t.categoryId).color}">${esc(cat(t.categoryId).name)}</span>` : ""}</td><td class="mut">${t.cardId ? "💳 " + esc((card(t.cardId) || {}).name || "") : "🏦 " + esc((acc(t.accountId) || {}).name || "")}${t.type === "transferencia" ? " → " + esc((acc(t.toAccountId) || {}).name || "") : ""}</td><td class="mut">${t.cls === "fixo" ? "Fixo" : "Variável"}</td><td class="r ${t.type === "receita" ? "pos" : t.type === "despesa" ? "neg" : ""}">${t.type === "despesa" ? "−" : ""}${brl(t.amount)}</td></tr>`).join("")}<tr class="total"><td colspan="5">Resultado do filtro (sem pagamentos de fatura)</td><td class="r">${brl(tot)}</td></tr></tbody></table></div>` : `<div class="empty">Nenhum lançamento neste mês.</div>`}`;
    bindMonth(root); $("#cT", root).value = S.type; $("#cC", root).value = S.cat;
    $("#cNew", root).onclick = () => txForm();
    $("#cT", root).onchange = (e) => { S.type = e.target.value; ERP.render(); }; $("#cC", root).onchange = (e) => { S.cat = e.target.value; ERP.render(); };
    $("#cQ", root).onchange = (e) => { S.q = e.target.value; ERP.render(); };
    $$("[data-tx]", root).forEach((r) => (r.onclick = () => txForm(d.tx.find((t) => t.id === r.dataset.tx))));
    $("#cCsv", root).onclick = () => { const qq = (s) => `"${String(s == null ? "" : s).replace(/"/g, '""')}"`; const L = [["data", "tipo", "descricao", "categoria", "origem", "fatura", "classe", "situacao", "valor"]].concat(d.tx.slice().sort((a, b) => a.date.localeCompare(b.date)).map((t) => [t.date, t.type, t.desc, cat(t.categoryId).name, t.cardId ? (card(t.cardId) || {}).name : (acc(t.accountId) || {}).name, t.invoice || "", t.cls, t.status, (t.type === "receita" ? t.amount : -t.amount).toFixed(2).replace(".", ",")])); ERP.download(`lancamentos-${todayISO()}.csv`, "﻿" + L.map((r) => r.map(qq).join(";")).join("\n"), "text/csv"); };
  }

  function pContas(root) {
    const d = D(); const open = d.bills.filter((b) => !b.paid).sort((a, b) => a.due.localeCompare(b.due)); const paid = d.bills.filter((b) => b.paid).sort((a, b) => (b.paidAt || "").localeCompare(a.paidAt || "")).slice(0, 30); const t = todayISO();
    const st = (b) => (b.due < t ? '<span class="pill err">vencida</span>' : b.due <= addMonths(t, 0).slice(0, 8) + "31" && monthKey(b.due) === monthKey(t) ? '<span class="pill warn">este mês</span>' : '<span class="pill">a vencer</span>');
    root.innerHTML = ERP.pagehead("Contas a pagar", `<button class="btn orange" id="bNew">+ Conta</button>`) + `
      <div class="kpis">${ERP.kpi("Em aberto", brl(open.reduce((s, b) => s + +b.amount, 0)), open.length + " conta(s)")}${ERP.kpi("Vencidas", brl(open.filter((b) => b.due < t).reduce((s, b) => s + +b.amount, 0)), open.filter((b) => b.due < t).length + " conta(s)", open.some((b) => b.due < t) ? "neg" : "")}</div>
      <div class="card"><h3>Em aberto</h3>${open.length ? `<div class="tw"><table><thead><tr><th>Vencimento</th><th>Descrição</th><th>Categoria</th><th>Situação</th><th class="r">Valor</th><th></th></tr></thead><tbody>${open.map((b) => `<tr><td>${fdate(b.due)}</td><td><a href="javascript:void 0" data-eb="${b.id}">${esc(b.desc)}</a>${b.recurring ? ' <span class="pill info">mensal</span>' : ""}</td><td class="mut">${esc(cat(b.categoryId).name)}</td><td>${st(b)}</td><td class="r">${brl(b.amount)}</td><td class="r"><button class="btn sm" data-pay="${b.id}">Pagar</button></td></tr>`).join("")}</tbody></table></div>` : `<div class="empty">Nenhuma conta em aberto.</div>`}</div>
      ${paid.length ? `<div class="card"><h3>Pagas recentemente</h3><div class="tw"><table><tbody>${paid.map((b) => `<tr><td>${fdate(b.paidAt)}</td><td>${esc(b.desc)}</td><td class="r">${brl(b.amount)}</td></tr>`).join("")}</tbody></table></div></div>` : ""}`;
    $("#bNew", root).onclick = () => billForm();
    $$("[data-pay]", root).forEach((b) => (b.onclick = () => payBill(b.dataset.pay)));
    $$("[data-eb]", root).forEach((b) => (b.onclick = () => billForm(d.bills.find((x) => x.id === b.dataset.eb))));
  }

  function pCartoes(root) {
    const d = D(); if (!S.card && d.cards[0]) S.card = d.cards[0].id; const c = card(S.card);
    let body = `<div class="empty">Cadastre um cartão em Custos › Cadastros.</div>`;
    if (c) {
      const items = d.tx.filter((t) => t.cardId === c.id && t.invoice === S.month).sort((a, b) => a.date.localeCompare(b.date));
      const total = invoiceTotal(c.id, S.month); const paid = invoicePaid(c.id, S.month);
      const future = d.tx.filter((t) => t.cardId === c.id && t.invoice > monthKey(todayISO())).reduce((s, t) => s + t.amount, 0);
      const usedOpen = d.tx.filter((t) => t.cardId === c.id && !invoicePaid(c.id, t.invoice)).reduce((s, t) => s + (t.type === "receita" ? -t.amount : t.amount), 0);
      body = `<div class="kpis">${ERP.kpi("Fatura " + monthLabel(S.month), brl(total), "vence " + fdate(invoiceDue(c, S.month)), paid ? "pos" : "")}${ERP.kpi("Situação", paid ? "Paga" : "Em aberto")}${ERP.kpi("Limite disponível", brl((+c.limit || 0) - usedOpen), "limite " + brl(c.limit))}${ERP.kpi("Parcelas futuras", brl(future))}</div>
        <div class="toolbar">${paid ? "" : `<button class="btn orange" id="pInv">Pagar fatura</button>`}</div>
        ${items.length ? `<div class="tw"><table><thead><tr><th>Compra</th><th>Descrição</th><th>Categoria</th><th class="r">Valor</th></tr></thead><tbody>${items.map((t) => `<tr data-tx="${t.id}" style="cursor:pointer"><td>${fdate(t.date)}</td><td>${esc(t.desc)}</td><td class="mut">${esc(cat(t.categoryId).name)}</td><td class="r">${brl(t.amount)}</td></tr>`).join("")}<tr class="total"><td colspan="3">Total</td><td class="r">${brl(total)}</td></tr></tbody></table></div>` : `<div class="empty">Nenhuma compra nesta fatura.</div>`}`;
    }
    root.innerHTML = ERP.pagehead("Cartões", `${monthNav()}<select id="cardSel">${d.cards.map((x) => `<option value="${x.id}"${x.id === S.card ? " selected" : ""}>${esc(x.name)}</option>`).join("")}</select><button class="btn orange" id="cNew">+ Compra</button>`) + body;
    bindMonth(root); $("#cNew", root).onclick = () => txForm();
    const sel = $("#cardSel", root); if (sel) sel.onchange = (e) => { S.card = e.target.value; ERP.render(); };
    const pi = $("#pInv", root); if (pi) pi.onclick = () => payInvoice(c.id, S.month);
    $$("[data-tx]", root).forEach((r) => (r.onclick = () => txForm(d.tx.find((t) => t.id === r.dataset.tx))));
  }

  function pRel(root) {
    const y = S.year; const months = Array.from({ length: 12 }, (_, i) => y + "-" + ERP.p2(i + 1)); const fl = months.map(monthFlow);
    const byCat = {}; fl.forEach((f) => Object.entries(f.byCat).forEach(([k, v]) => (byCat[k] = (byCat[k] || 0) + v)));
    const fx = { fixo: 0, variavel: 0 }; D().tx.forEach((t) => { if (t.type !== "despesa" || t.payInvoice) return; const mk = t.cardId ? t.invoice : monthKey(t.date); if (mk.slice(0, 4) === String(y)) fx[t.cls === "fixo" ? "fixo" : "variavel"] += t.amount; });
    const R = fl.reduce((s, f) => s + f.rec, 0), Dp = fl.reduce((s, f) => s + f.desp, 0);
    root.innerHTML = ERP.pagehead("Relatórios " + y, `<button class="btn ghost sm" data-y="-1">‹ ${y - 1}</button><button class="btn ghost sm" data-y="1">${y + 1} ›</button><button class="btn ghost" onclick="print()">Imprimir / PDF</button>`) + `
      <div class="kpis">${ERP.kpi("Receitas no ano", brl(R), "", "pos")}${ERP.kpi("Despesas no ano", brl(Dp), "", "neg")}${ERP.kpi("Resultado", brl(R - Dp), "", R - Dp >= 0 ? "pos" : "neg")}${ERP.kpi("Custos fixos × variáveis", Dp ? num((fx.fixo / Dp) * 100, 0) + "% fixos" : "—", brl(fx.fixo) + " / " + brl(fx.variavel))}</div>
      <div class="card"><h3>Mês a mês (DRE simplificada)</h3><div class="tw"><table><thead><tr><th></th>${months.map((m) => `<th class="r">${monthLabel(m)}</th>`).join("")}<th class="r">Total</th></tr></thead><tbody>
      <tr><td>Receitas</td>${fl.map((f) => `<td class="r pos">${num(f.rec, 0)}</td>`).join("")}<td class="r pos"><b>${num(R, 0)}</b></td></tr>
      ${Object.keys(byCat).sort((a, b) => byCat[b] - byCat[a]).map((k) => `<tr><td class="mut">${esc(cat(k).name)}</td>${fl.map((f) => `<td class="r">${f.byCat[k] ? num(f.byCat[k], 0) : ""}</td>`).join("")}<td class="r">${num(byCat[k], 0)}</td></tr>`).join("")}
      <tr><td>Despesas</td>${fl.map((f) => `<td class="r neg">${num(f.desp, 0)}</td>`).join("")}<td class="r neg"><b>${num(Dp, 0)}</b></td></tr>
      <tr class="total"><td>Resultado</td>${fl.map((f) => `<td class="r">${num(f.rec - f.desp, 0)}</td>`).join("")}<td class="r">${num(R - Dp, 0)}</td></tr></tbody></table></div></div>`;
    $$("[data-y]", root).forEach((b) => (b.onclick = () => { S.year += +b.dataset.y; ERP.render(); }));
  }

  function pCad(root) {
    const d = D();
    root.innerHTML = ERP.pagehead("Cadastros") + `
      <div class="card"><h3>Contas</h3><div class="tw"><table><thead><tr><th>Nome</th><th>Tipo</th><th class="r">Saldo inicial</th><th class="r">Saldo atual</th></tr></thead><tbody>${d.accounts.map((a) => `<tr data-acc="${a.id}" style="cursor:pointer"><td>${esc(a.name)}</td><td class="mut">${esc((ACC_T.find((x) => x[0] === a.type) || [, ""])[1])}</td><td class="r">${brl(a.opening)}</td><td class="r">${brl(accBalance(a.id))}</td></tr>`).join("")}</tbody></table></div><div class="toolbar" style="margin-top:10px"><button class="btn ghost sm" data-new="acc">+ Conta</button></div></div>
      <div class="card"><h3>Cartões de crédito</h3>${d.cards.length ? `<div class="tw"><table><thead><tr><th>Nome</th><th>Fecha dia</th><th>Vence dia</th><th class="r">Limite</th></tr></thead><tbody>${d.cards.map((c) => `<tr data-card="${c.id}" style="cursor:pointer"><td>${esc(c.name)}</td><td>${c.closeDay}</td><td>${c.dueDay}</td><td class="r">${brl(c.limit)}</td></tr>`).join("")}</tbody></table></div>` : `<p class="mut">Nenhum cartão.</p>`}<div class="toolbar" style="margin-top:10px"><button class="btn ghost sm" data-new="card">+ Cartão</button></div></div>
      <div class="card"><h3>Categorias</h3><div style="display:flex;flex-wrap:wrap;gap:6px">${d.categories.map((c) => `<button class="pill" data-cat="${c.id}" style="border:0;background:${c.color}22;color:${c.color}">${esc(c.name)}${c.type === "receita" ? " ＋" : ""}</button>`).join("")}</div><div class="toolbar" style="margin-top:10px"><button class="btn ghost sm" data-new="cat">+ Categoria</button></div></div>`;
    const accF = (a) => ERP.form({ title: a ? "Editar conta" : "Nova conta", fields: [{ k: "name", label: "Nome", value: a && a.name, required: true }, { k: "type", label: "Tipo", type: "select", value: a && a.type, options: ACC_T }, { k: "opening", label: "Saldo inicial (R$)", type: "number", step: "0.01", value: a ? a.opening : 0 }], onSubmit(v) { Store.change("custos", (dd) => { if (a) Object.assign(dd.accounts.find((x) => x.id === a.id), v); else dd.accounts.push(Object.assign({ id: uid("acc") }, v)); }); ERP.render(); }, onDelete: a ? () => { if (d.tx.some((t) => t.accountId === a.id || t.toAccountId === a.id)) { ERP.toast("Esta conta tem lançamentos — não pode ser excluída."); return; } Store.change("custos", (dd) => { dd.accounts = dd.accounts.filter((x) => x.id !== a.id); }); ERP.render(); } : null });
    const cardF = (c) => ERP.form({ title: c ? "Editar cartão" : "Novo cartão", fields: [{ k: "name", label: "Nome", value: c && c.name, required: true }, { k: "limit", label: "Limite (R$)", type: "number", step: "0.01", value: c ? c.limit : 0 }, { k: "closeDay", label: "Dia de fechamento", type: "number", value: c ? c.closeDay : 1 }, { k: "dueDay", label: "Dia de vencimento", type: "number", value: c ? c.dueDay : 10 }, { k: "payAccountId", label: "Pago pela conta", type: "select", value: c && c.payAccountId, options: d.accounts.map((a) => [a.id, a.name]) }], onSubmit(v) { Store.change("custos", (dd) => { if (c) Object.assign(dd.cards.find((x) => x.id === c.id), v); else dd.cards.push(Object.assign({ id: uid("card") }, v)); }); ERP.render(); }, onDelete: c ? () => { if (d.tx.some((t) => t.cardId === c.id)) { ERP.toast("Este cartão tem compras — não pode ser excluído."); return; } Store.change("custos", (dd) => { dd.cards = dd.cards.filter((x) => x.id !== c.id); }); ERP.render(); } : null });
    const catF = (c) => ERP.form({ title: c ? "Editar categoria" : "Nova categoria", fields: [{ k: "name", label: "Nome", value: c && c.name, required: true }, { k: "type", label: "Tipo", type: "select", value: c && c.type, options: [["despesa", "Despesa"], ["receita", "Receita"]] }, { k: "color", label: "Cor (hex)", value: c ? c.color : "#5E7C8D" }], onSubmit(v) { Store.change("custos", (dd) => { if (c) Object.assign(dd.categories.find((x) => x.id === c.id), v); else dd.categories.push(Object.assign({ id: uid("cat") }, v)); }); ERP.render(); }, onDelete: c ? () => { if (d.tx.some((t) => t.categoryId === c.id)) { ERP.toast("Categoria em uso — não pode ser excluída."); return; } Store.change("custos", (dd) => { dd.categories = dd.categories.filter((x) => x.id !== c.id); }); ERP.render(); } : null });
    root.onclick = (e) => { const b = e.target.closest("[data-acc],[data-card],[data-cat],[data-new]"); if (!b) return; if (b.dataset.acc) accF(d.accounts.find((x) => x.id === b.dataset.acc)); else if (b.dataset.card) cardF(d.cards.find((x) => x.id === b.dataset.card)); else if (b.dataset.cat) catF(d.categories.find((x) => x.id === b.dataset.cat)); else ({ acc: accF, card: cardF, cat: catF })[b.dataset.new](null); };
  }

  ERP.register({ id: "custos", label: "Custos Pessoais", icon: "💰", group: "Finanças", pages: [
    { id: "resumo", label: "Resumo do mês", render: pResumo }, { id: "lancamentos", label: "Lançamentos", render: pLanc }, { id: "contas", label: "Contas a pagar", render: pContas },
    { id: "cartoes", label: "Cartões", render: pCartoes }, { id: "relatorios", label: "Relatórios", render: pRel }, { id: "cadastros", label: "Cadastros", render: pCad } ] });
})();
