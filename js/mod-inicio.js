/* Início — painel com o resumo de todos os módulos */
(function () {
  "use strict";
  const { esc, brl, usd, fdate, monthKey, todayISO, $$ } = ERP;
  function render(root) {
    const mk = monthKey(todayISO());
    const f = ERP.custos.monthFlow(mk); const inv = ERP.investimentos.carteira(); const pat = ERP.patrimonio.total();
    const due = ERP.reminders.dueToday(); const bills = ERP.custos.billsOpen().filter((b) => b.due <= todayISO().slice(0, 8) + "31").sort((a, b) => a.due.localeCompare(b.due));
    const h = new Date().getHours(); const hi = h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
    root.innerHTML = ERP.pagehead(hi + ", Rafael") + `
      <div class="kpis">${ERP.kpi("Patrimônio líquido", brl(pat.net), "contas + investimentos + bens − dívidas")}${ERP.kpi("Resultado do mês", brl(f.rec - f.desp), "receitas " + brl(f.rec) + " · despesas " + brl(f.desp), f.rec - f.desp >= 0 ? "pos" : "neg")}${ERP.kpi("Investimentos no exterior", usd(inv.mvUSD + inv.cashUSD), brl(inv.totalBRL) + " ao câmbio atual")}${ERP.kpi("Demandas abertas", String(ERP.reminders.openCount()), due.length + " para hoje ou atrasadas", due.length ? "neg" : "")}</div>
      <div class="grid2"><div class="card"><h3>Para hoje</h3>${due.length ? due.slice(0, 8).map((t) => { const l = ERP.reminders.listOf(t.listId); return `<div class="hrow" style="grid-template-columns:1fr auto"><span class="n">${l ? esc(l.icon) + " " : ""}${esc(t.title)}</span><span class="pill ${t.due < todayISO() ? "err" : "warn"}">${fdate(t.due)}</span></div>`; }).join("") : `<div class="empty">Nada vencendo hoje. <a href="#/reminders">Abrir Reminders</a></div>`}</div>
      <div class="card"><h3>Contas deste mês</h3>${bills.length ? bills.slice(0, 8).map((b) => `<div class="hrow" style="grid-template-columns:80px 1fr auto"><span class="mut">${fdate(b.due)}</span><span class="n">${esc(b.desc)}</span><span class="v">${brl(b.amount)}</span></div>`).join("") : `<div class="empty">Sem contas em aberto. <a href="#/custos/contas">Contas a pagar</a></div>`}</div></div>
      <div class="card"><h3>Módulos</h3><div class="kpis" style="margin:0">${ERP.modules.filter((m) => m.id !== "inicio").map((m) => `<a class="kpi" href="#/${m.id}" style="text-decoration:none"><div class="l">${esc(m.group)}</div><div class="v" style="font-size:17px">${m.icon} ${esc(m.label)}</div></a>`).join("")}</div></div>`;
  }
  ERP.register({ id: "inicio", label: "Início", icon: "🏠", group: "Geral", render });
})();
