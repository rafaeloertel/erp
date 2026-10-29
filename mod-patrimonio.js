/* Patrimônio & Aposentadoria — no formato do Piloto 3.0: patrimônio bruto, rentabilidade, dívidas de curto prazo, líquido,
   cobertura, composição por espécie, projeto de aposentadoria, ativos e aplicações (R$/US$) com aportes e resgates,
   bens e dívidas, fotos mensais da evolução. Lê sozinho as contas e dívidas de Finanças e a carteira de Investimentos. */
(function () {
  "use strict";
  const { $, $$, esc, uid, brl, usd, num, todayISO, fdate, monthLabel, Store } = ERP;
  ERP.defaults.patrimonio = { items: [], snapshots: [] };
  const KIND = [["aplicacao", "Aplicação financeira"], ["imovel", "Imóvel"], ["veiculo", "Veículo"], ["previdencia", "Previdência"], ["participacao", "Participação societária"], ["outro_bem", "Outro bem"], ["divida", "Dívida / financiamento (fora de Finanças)"]];
  const KN = Object.fromEntries(KIND);
  const ESPECIES = ["Poupança", "CDB / Renda fixa", "Tesouro Direto", "Fundos", "Ações BR", "FIIs", "Ações / ETFs EUA", "Cripto", "Previdência privada", "Caixa / Conta", "Outros"];
  const PC = ["#8FA8C6", "#74C69D", "#7BA7DE", "#B49BE4", "#E0B060", "#E58F94", "#7FC4BD", "#C9A0E8", "#E9C46A", "#A5AFBD", "#9BB0C9", "#C3CCD9"];
  const D = () => Store.get("patrimonio");
  const fx = () => (ERP.investimentos ? +ERP.investimentos.fx() || 0 : 0);
  const emBRL = (i) => (i.moeda === "USD" ? (+i.value || 0) * fx() : +i.value || 0);
  const invBRL = (i) => (i.investido == null || i.investido === "" ? null : i.moeda === "USD" ? +i.investido * fx() : +i.investido);

  function total() {
    const F = ERP.fin; const h = todayISO(); const lim30 = F.addDias(h, 30);
    const contas = F.contasAtivas().map((c) => F.saldoConta(c.id));
    const accPos = contas.filter((v) => v > 0).reduce((s, v) => s + v, 0), accNeg = -contas.filter((v) => v < 0).reduce((s, v) => s + v, 0);
    const cart = ERP.investimentos.carteira(); const inv = cart.totalBRL;
    const items = D().items; const ativos = items.filter((i) => i.kind !== "divida");
    const bens = ativos.reduce((s, i) => s + emBRL(i), 0);
    const pend = F.pendencias().filter((p) => p.tipo !== "receita" && p.tipo !== "transferencia");
    const curto = accNeg + pend.filter((p) => p.data <= lim30).reduce((s, p) => s + p.valor, 0);
    const dividas = F.D().dividas.reduce((s, dv) => s + F.dividaInfo(dv).saldo, 0);
    const parc30 = F.D().lanc.filter((l) => l.dividaId && !l.pago && l.venc <= lim30).reduce((s, l) => s + l.valor, 0);
    const longo = Math.max(0, dividas - parc30) + items.filter((i) => i.kind === "divida").reduce((s, i) => s + (+i.value || 0), 0);
    const bruto = accPos + inv + bens; const usdBRL = (cart.mvUSD + cart.cashUSD) * fx() + ativos.filter((i) => i.moeda === "USD").reduce((s, i) => s + emBRL(i), 0);
    /* rentabilidade: aplicações com "investido" + carteira do exterior (custo em US$ ao câmbio de hoje) */
    const comBase = ativos.filter((i) => invBRL(i) != null); let investido = comBase.reduce((s, i) => s + invBRL(i), 0), atual = comBase.reduce((s, i) => s + emBRL(i), 0);
    cart.rows.forEach((r) => { if (r.a.currency === "USD") { investido += r.p.costCur * fx(); atual += r.mv * fx(); } });
    return { acc: accPos - accNeg, accPos, accNeg, inv, bens, bruto, usdBRL, curto, longo, div: curto + longo, net: bruto - curto - longo, investido, atual, rent: atual - investido, rentPct: investido > 0 ? ((atual - investido) / investido) * 100 : 0 };
  }
  ERP.patrimonio = { total };

  function itemForm(it) {
    const isNew = !it; it = it || { kind: "aplicacao", moeda: "BRL", especie: "CDB / Renda fixa", date: todayISO() };
    ERP.form({ title: isNew ? "Novo ativo, bem ou dívida" : "Editar · " + it.name, wide: true, fields: [
      { k: "name", label: "Descrição", value: it.name, full: true, required: true, placeholder: "Ex.: CDB Santander 110% CDI, Apartamento, Carro" },
      { k: "kind", label: "Tipo", type: "select", value: it.kind, options: KIND },
      { k: "especie", label: "Espécie (aplicações)", type: "select", value: it.especie || "Outros", options: ESPECIES.map((e) => [e, e]) },
      { k: "moeda", label: "Moeda", type: "select", value: it.moeda || "BRL", options: [["BRL", "R$"], ["USD", "US$"]] },
      { k: "investido", label: "Total investido (aplicações) — base da rentabilidade", type: "number", step: "0.01", value: it.investido },
      { k: "value", label: "Valor atual (dívida: saldo devedor)", type: "number", step: "0.01", value: it.value },
      { k: "date", label: "Valor atualizado em", type: "date", value: it.date },
      { k: "cost", label: "Custo de aquisição em R$ (para o IRPF)", type: "number", step: "0.01", value: it.cost },
      { k: "notes", label: "Observação", value: it.notes, full: true } ],
      init(fm, md) { const sync = () => { const ap = fm.elements.kind.value === "aplicacao" || fm.elements.kind.value === "previdencia"; md.show("especie", ap); md.show("investido", ap); md.show("moeda", fm.elements.kind.value !== "divida"); }; fm.elements.kind.onchange = sync; sync(); },
      onSubmit(v) { if (v.investido === 0 && !String(it.investido || "")) v.investido = null; Store.change("patrimonio", (d) => { if (isNew) d.items.push(Object.assign({ id: uid("pt"), hist: [] }, v)); else Object.assign(d.items.find((x) => x.id === it.id), v); }); ERP.render(); },
      onDelete: isNew ? null : () => { Store.change("patrimonio", (d) => { d.items = d.items.filter((x) => x.id !== it.id); }); ERP.render(); } });
  }
  /* aporte / resgate (Piloto 3.0): ajusta investido e valor e, se quiser, lança em Finanças fora da DRE */
  function movForm(it, tipo) {
    const F = ERP.fin; const ap = tipo === "aporte";
    ERP.form({ title: (ap ? "Aporte em " : "Resgate de ") + it.name, intro: `Atual: ${it.moeda === "USD" ? usd(it.value) : brl(it.value)}${it.investido != null ? " · investido " + (it.moeda === "USD" ? usd(it.investido) : brl(it.investido)) : ""}.`,
      fields: [{ k: "valor", label: `Valor (${it.moeda === "USD" ? "US$" : "R$"})`, type: "number", step: "0.01" }, { k: "data", label: "Data", type: "date", value: todayISO() }, { k: "lanc", label: ap ? "Lançar a saída da conta em Finanças" : "Lançar a entrada na conta em Finanças", type: "checkbox", value: it.moeda !== "USD" }, { k: "contaId", label: "Conta", type: "select", options: F.contasAtivas().map((c) => [c.id, c.nome]) }],
      okLabel: ap ? "Registrar aporte" : "Registrar resgate",
      onSubmit(v) {
        if (!(v.valor > 0)) { ERP.toast("Informe o valor."); return false; }
        Store.change("patrimonio", (d) => { const x = d.items.find((y) => y.id === it.id); const s = ap ? 1 : -1; x.value = F.r2((+x.value || 0) + s * v.valor); if (x.investido != null || ap) x.investido = F.r2(Math.max(0, (+x.investido || 0) + s * v.valor)); x.date = v.data; (x.hist = x.hist || []).push({ em: v.data, tipo, v: v.valor }); });
        if (v.lanc) { const cats = F.D().categorias; const cid = (cats.find((c) => (ap ? /Aportes em investimentos/ : /Resgates de investimentos/).test(c.nome)) || {}).id; const brlV = it.moeda === "USD" ? v.valor * fx() : v.valor;
          ERP.finUI.salvar((dd) => dd.lanc.push({ id: uid("l"), tipo: ap ? "despesa" : "receita", desc: (ap ? "Aporte · " : "Resgate · ") + it.name, catId: cid, valor: F.r2(brlV), contaId: v.contaId, comp: v.data, venc: v.data, pago: v.data, valorPago: F.r2(brlV), forma: "Transferência", hist: [{ em: new Date().toISOString(), o: "Lançado pelo Patrimônio" }] })); }
        ERP.toast(ap ? "Aporte registrado." : "Resgate registrado."); ERP.render();
      } });
  }

  function render(root) {
    const t = total(); const d = D(); const F = ERP.fin; const c = F.D().cfg;
    const ativos = d.items.filter((i) => i.kind !== "divida");
    /* composição por espécie */
    const por = {}; const add = (k, v) => { if (v > 0) por[k] = (por[k] || 0) + v; };
    add("Caixa / Conta", t.accPos); add("Ações / ETFs EUA (Investimentos)", t.inv); ativos.forEach((i) => add(i.kind === "aplicacao" ? i.especie || "Outros" : KN[i.kind], emBRL(i)));
    const ents = Object.entries(por).sort((a, b) => b[1] - a[1]);
    /* aposentadoria (parâmetros de Metas e planejamento) */
    const anos = Math.max(1, (c.idadeApos || 60) - (c.idade || 40)); const i = Math.pow(1 + (c.retornoReal || 4) / 100, 1 / 12) - 1;
    let fv = Math.max(0, t.net); const serie = [{ x: 0, v: fv }]; for (let k = 1; k <= anos * 12; k++) { fv = fv * (1 + i) + (+c.aporteApos || 0); if (k % 12 === 0) serie.push({ x: k / 12, v: fv }); }
    const snaps = d.snapshots.slice().sort((a, b) => a.month.localeCompare(b.month)).slice(-24);
    root.innerHTML = ERP.pagehead("Patrimônio & Aposentadoria", `<button class="btn ghost" id="pSnap">Registrar foto do mês</button><button class="btn orange" id="pNew">+ Novo ativo</button>`) + `
      <div class="fp-stats"><span>Patrimônio bruto<b>${brl(t.bruto)}</b></span><span>Patrimônio líquido<b class="${t.net < 0 ? "neg" : "pos"}">${brl(t.net)}</b></span><span>Ativos<b>${ativos.length + (t.inv ? 1 : 0) + (t.accPos ? 1 : 0)}</b></span></div>
      <div class="kpis fp-4">
        ${ERP.kpi("Patrimônio bruto", brl(t.bruto), `contas ${brl(t.accPos)} · exterior ${brl(t.inv)} · aplicações e bens ${brl(t.bens)}<br>em dólar ${brl(t.usdBRL)} (${t.bruto ? num((t.usdBRL / t.bruto) * 100, 1) : "0"}%)`)}
        ${ERP.kpi("Rentabilidade", t.investido ? (t.rent >= 0 ? "+" : "−") + brl(Math.abs(t.rent)) : "—", t.investido ? `${t.rent >= 0 ? "+" : ""}${num(t.rentPct, 1)}% sobre ${brl(t.investido)} investidos` : 'Informe o "total investido" nas aplicações', t.investido ? (t.rent >= 0 ? "pos" : "neg") : "")}
        ${ERP.kpi("Dívidas de curto prazo", brl(t.curto), "conta negativa + contas e faturas dos próximos 30 dias", t.curto ? "neg" : "")}
        ${ERP.kpi("Patrimônio líquido", brl(t.net), `bruto − curto prazo − longo prazo (${brl(t.longo)})`, t.net < 0 ? "neg" : "pos")}</div>
      <p class="mut fin-leg" style="margin:-6px 0 14px">${t.curto > 0 ? (t.bruto >= t.curto ? `Cobertura: seus ativos cobrem <b>${num((t.bruto / t.curto) * 100, 0)}%</b> das dívidas de curto prazo.` : `Cobertura: os ativos cobrem <b>${t.bruto > 0 ? num((t.bruto / t.curto) * 100, 0) : 0}%</b> das dívidas de curto prazo — faltam <b>${brl(t.curto - t.bruto)}</b>.`) : "Sem dívidas de curto prazo."}</p>
      <div class="grid2"><div class="card"><h3 class="fp-h3">Composição por espécie <small>convertido para R$ · US$ 1 = R$ ${num(fx(), 4)}</small></h3>${ents.length ? `<div class="fp-chart" style="height:260px"><canvas id="chPatCls"></canvas></div>` : `<div class="empty">Nenhum ativo — use “+ Novo ativo”.</div>`}</div>
      <div class="card"><h3 class="fp-h3">Projeto de aposentadoria <small>juros compostos · <a href="#/financas/metas">ajustar premissas</a></small></h3>
        <div class="fp-stats" style="margin:4px 0 6px"><span>Aporte mensal<b>${brl(c.aporteApos)}</b></span><span>Retorno real<b>${num(c.retornoReal || 4, 1)}% a.a.</b></span><span>Prazo<b>${anos} anos</b></span><span>Patrimônio projetado<b>${brl(fv)}</b></span><span>Retirada mensal esperada<b class="pos">${brl((fv * 0.04) / 12)}</b></span></div>
        <div class="fp-chart" style="height:200px"><canvas id="chApo"></canvas></div><p class="mut fin-leg">Parte do patrimônio líquido de hoje com aporte constante. Renda pela regra dos 4% ao ano.</p></div></div>
      <div class="card" style="padding:0"><div class="toolbar" style="padding:12px 14px 0"><b style="color:var(--navy)">Ativos e aplicações</b><span class="sp"></span><button class="btn sm" id="pNew2">+ Novo ativo</button></div>
        <div class="tw" style="border:0"><table><thead><tr><th>Ativo</th><th>Espécie</th><th class="r">Investido</th><th class="r">Valor atual</th><th class="r">Em R$</th><th class="r">Retorno</th><th></th></tr></thead><tbody>
        ${t.inv ? `<tr><td><b>Carteira no exterior</b><div class="mut fin-sub">módulo Investimentos (IBKR)</div></td><td>Ações / ETFs EUA</td><td class="r mut" colspan="2"><a href="#/investimentos/carteira">abrir carteira</a></td><td class="r">${brl(t.inv)}</td><td></td><td></td></tr>` : ""}
        ${ativos.map((i) => { const f = (v) => (i.moeda === "USD" ? usd(v) : brl(v)); const ib = invBRL(i); const ret = ib != null ? emBRL(i) - ib : null; return `<tr><td><b>${esc(i.name)}</b><div class="mut fin-sub">${fdate(i.date)}${i.hist && i.hist.length ? " · " + i.hist.length + " movimento(s)" : ""}</div></td><td>${esc(i.kind === "aplicacao" ? i.especie || "Outros" : KN[i.kind])}</td><td class="r">${i.investido != null && i.investido !== "" ? f(i.investido) : "—"}</td><td class="r">${f(i.value)}</td><td class="r">${brl(emBRL(i))}</td><td class="r ${ret == null ? "" : ret >= 0 ? "pos" : "neg"}">${ret == null ? "—" : (ret >= 0 ? "+" : "") + num(ib ? (ret / ib) * 100 : 0, 1) + "%"}</td><td class="r fp-acts">${i.kind === "aplicacao" || i.kind === "previdencia" ? `<button class="ib ok" data-ap="${i.id}" title="Aporte">＋</button><button class="ib" data-rs="${i.id}" title="Resgate">−</button>` : ""}<button class="ib" data-it="${i.id}" title="Editar">✎</button></td></tr>`; }).join("") || (t.inv ? "" : `<tr><td colspan="7" class="empty">Nenhum ativo cadastrado. Lance poupança, CDB, Tesouro, fundos, imóveis e veículos em R$ ou US$.</td></tr>`)}</tbody></table></div></div>
      ${d.items.some((i) => i.kind === "divida") ? `<div class="card"><h3>Outras dívidas (fora de Finanças)</h3><div class="tw"><table><tbody>${d.items.filter((i) => i.kind === "divida").map((i) => `<tr data-it="${i.id}" class="fin-row"><td>${esc(i.name)}</td><td>${fdate(i.date)}</td><td class="r neg">−${brl(i.value)}</td></tr>`).join("")}</tbody></table></div></div>` : ""}
      <div class="card"><h3 class="fp-h3">Evolução do patrimônio líquido <small>fotos mensais</small></h3>${snaps.length ? `<div class="fp-chart" style="height:200px"><canvas id="chSnap"></canvas></div>` : `<div class="empty">Use “Registrar foto do mês” no fim de cada mês para acompanhar a evolução.</div>`}</div>`;
    $("#pNew", root).onclick = () => itemForm(); $("#pNew2", root).onclick = () => itemForm();
    $$("[data-it]", root).forEach((r) => (r.onclick = () => itemForm(d.items.find((x) => x.id === r.dataset.it))));
    $$("[data-ap]", root).forEach((b) => (b.onclick = () => movForm(d.items.find((x) => x.id === b.dataset.ap), "aporte")));
    $$("[data-rs]", root).forEach((b) => (b.onclick = () => movForm(d.items.find((x) => x.id === b.dataset.rs), "resgate")));
    $("#pSnap", root).onclick = () => { const m = todayISO().slice(0, 7); Store.change("patrimonio", (dd) => { dd.snapshots = dd.snapshots.filter((s) => s.month !== m); dd.snapshots.push(Object.assign({ month: m, at: todayISO() }, total())); }); ERP.toast("Foto de " + monthLabel(m) + " registrada."); ERP.render(); };
    if (ents.length) ERP.chart($("#chPatCls", root), { type: "doughnut", data: { labels: ents.map((e) => e[0]), datasets: [{ data: ents.map((e) => e[1]), backgroundColor: ents.map((e, k) => PC[k % PC.length]), borderColor: ERP.cor("--white"), borderWidth: 2 }] }, options: { responsive: true, maintainAspectRatio: false, cutout: "62%", plugins: { legend: { position: "right", labels: { boxWidth: 10 } }, tooltip: { callbacks: { label: (x) => ` ${x.label}: ${brl(x.parsed)}` } } } } });
    ERP.chart($("#chApo", root), { type: "line", data: { labels: serie.map((s) => "Ano " + s.x), datasets: [{ data: serie.map((s) => s.v), borderColor: "#8FA8C6", backgroundColor: "rgba(143,168,198,.15)", fill: true, tension: 0.25, borderWidth: 2, pointRadius: 2 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (x) => " " + brl(x.parsed.y) } } }, scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 8 } }, y: { grid: { color: () => ERP.cor("--line") }, ticks: { callback: (v) => num(v / 1000, 0) + " mil" } } } } });
    if (snaps.length) ERP.chart($("#chSnap", root), { type: "line", data: { labels: snaps.map((s) => monthLabel(s.month)), datasets: [{ data: snaps.map((s) => s.net), borderColor: ERP.cor("--orange"), backgroundColor: "rgba(241,97,47,.10)", fill: true, tension: 0.25, pointRadius: 3 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (x) => " " + brl(x.parsed.y) } } }, scales: { x: { grid: { display: false } }, y: { grid: { color: () => ERP.cor("--line") } } } } });
  }
  ERP.register({ id: "patrimonio", label: "Patrimônio", icon: "landmark", group: "Finanças", render });
})();
