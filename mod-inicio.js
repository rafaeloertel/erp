/* Início — resumo do dia: posição financeira, contas a pagar e tarefas */
(function () {
  "use strict";
  const { esc, brl, usd, fdate, monthKey, monthLabel, todayISO, $ } = ERP;
  const DIAS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
  const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

  function render(root) {
    const hoje = todayISO(); const mk = monthKey(hoje); const dt = new Date();
    const f = ERP.custos.monthFlow(mk); const inv = ERP.investimentos.carteira(); const pat = ERP.patrimonio.total();
    const saldo = ERP.fin.saldoTotal(); const res = f.rec - f.desp;
    const due = ERP.reminders.dueToday(); const abertas = ERP.reminders.openCount();
    const lim = ERP.fin.addDias(hoje, 30);
    const bills = ERP.custos.billsOpen().filter((b) => b.due <= lim).sort((a, b) => a.due.localeCompare(b.due));
    const venc = bills.filter((b) => b.due < hoje); const totBills = bills.reduce((s, b) => s + b.amount, 0);
    const h = dt.getHours(); const hi = h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
    const data = `${DIAS[dt.getDay()]}, ${dt.getDate()} de ${MESES[dt.getMonth()]}`;

    root.innerHTML = `
      <div class="pagehead"><div><h1>${hi}, Rafael</h1><p class="mut" style="margin-top:2px">${esc(data)}</p></div><span class="sp"></span>
        <button class="btn ghost" id="iTarefa">+ Tarefa</button><button class="btn orange" id="iLanc">+ Lançamento</button></div>

      <section class="ini-hero" aria-label="Resumo financeiro">
        <a class="ini-main" href="#/patrimonio"><span class="l">Patrimônio líquido</span><span class="v">${brl(pat.net)}</span><span class="s">contas, investimentos e bens, menos dívidas</span></a>
        <a class="ini-st" href="#/financas/painel"><span class="l">Saldo em contas</span><span class="v">${brl(saldo)}</span></a>
        <a class="ini-st" href="#/financas/relatorios"><span class="l">Resultado de ${monthLabel(mk)}</span><span class="v ${res >= 0 ? "pos" : "neg"}">${res >= 0 ? "+" : "−"}${brl(Math.abs(res))}</span></a>
        <a class="ini-st" href="#/investimentos"><span class="l">Investimentos no exterior</span><span class="v">${usd(inv.mvUSD + inv.cashUSD)}</span><span class="s">${brl(inv.totalBRL)}</span></a>
      </section>

      <div class="grid2 ini-cols">
        <div class="card">
          <div class="card-h"><h3>A pagar em 30 dias</h3><span class="mut">${bills.length ? brl(totBills) : ""}</span></div>
          ${venc.length ? `<a class="note err" href="#/financas/agenda" style="text-decoration:none;margin-bottom:10px">${venc.length} conta${venc.length > 1 ? "s" : ""} vencida${venc.length > 1 ? "s" : ""}, ${brl(venc.reduce((s, b) => s + b.amount, 0))}</a>` : ""}
          ${bills.length ? `<div class="ini-list">${bills.slice(0, 8).map((b) => `<a class="ini-row" href="#/financas/agenda"><span class="d ${b.due < hoje ? "neg" : ""}">${fdate(b.due).slice(0, 5)}</span><span class="n">${esc(b.desc)}</span><span class="v">${brl(b.amount)}</span></a>`).join("")}</div>${bills.length > 8 ? `<a class="ini-more" href="#/financas/agenda">Ver as ${bills.length} contas</a>` : ""}` : `<div class="empty">Nenhuma conta nos próximos 30 dias.</div>`}
        </div>
        <div class="card">
          <div class="card-h"><h3>Tarefas para hoje</h3><span class="mut">${abertas} em aberto</span></div>
          ${due.length ? `<div class="ini-list">${due.slice(0, 8).map((t) => { const l = ERP.reminders.listOf(t.listId); return `<a class="ini-row" href="#/reminders"><span class="ini-ck"></span><span class="n">${esc(t.title)}${l ? `<small class="mut">${esc(l.name)}</small>` : ""}</span><span class="pill ${t.due < hoje ? "err" : "warn"}">${t.due < hoje ? "atrasada" : "hoje"}</span></a>`; }).join("")}</div>` : `<div class="empty">Nada para hoje.<br><a href="#/reminders">Ver todas as tarefas</a></div>`}
        </div>
      </div>`;
    $("#iLanc", root).onclick = () => ERP.finUI.lancForm();
    $("#iTarefa", root).onclick = () => ERP.nav("reminders");
  }
  ERP.register({ id: "inicio", label: "Início", icon: "house", group: "Geral", render });
})();
