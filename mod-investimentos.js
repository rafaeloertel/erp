/* Módulo Investimentos — carteira no exterior (IBKR) e no Brasil, movimentações, dividendos e apoio ao IRPF */
(function () {
  "use strict";
  const { $, $$, esc, uid, brl, usd, num, pct, todayISO, fdate, Store } = ERP;

  const CLASSES = [["acoes", "Ações / ETF de ações"], ["rf", "Renda fixa / ETF de títulos"], ["commod", "Commodities"], ["cripto", "Criptoativos"], ["fii", "FIIs"], ["outro", "Outro"]];
  const CLN = Object.fromEntries(CLASSES);
  ERP.defaults.investimentos = {
    brokers: [{ id: "ibkr", name: "Interactive Brokers", country: "EUA", currency: "USD" }],
    assets: [],          /* {id,ticker,name,cls,brokerId,currency,price,priceAt,irpf} */
    moves: [],           /* {id,date,kind:compra|venda|dividendo|juros|imposto|deposito|saque|taxa,assetId,brokerId,qty,price,amount,fees,fx,notes} */
    fx: { current: 5.40, currentAt: "", ptax: { "2025-12-31": 5.5024 } },
    cash: { ibkr: 0 },
  };
  const D = () => Store.get("investimentos");
  const S = { year: new Date().getFullYear() - 1, broker: "" };
  const KIND = [["compra", "Compra"], ["venda", "Venda"], ["dividendo", "Dividendo (bruto)"], ["imposto", "Imposto retido no exterior"], ["juros", "Juros"], ["deposito", "Depósito (remessa)"], ["saque", "Saque"], ["taxa", "Taxa / corretagem"]];
  const KN = Object.fromEntries(KIND);
  const asset = (id) => D().assets.find((a) => a.id === id) || { ticker: "?", name: "" };

  /* posição pelo custo médio: retorna por ativo {qty, costCur, costBRL, realized[]} */
  function positions(until) {
    const P = {};
    D().moves.filter((m) => (!until || m.date <= until) && (m.kind === "compra" || m.kind === "venda")).sort((a, b) => a.date.localeCompare(b.date) || (a.kind === "compra" ? -1 : 1)).forEach((m) => {
      const p = (P[m.assetId] = P[m.assetId] || { qty: 0, costCur: 0, costBRL: 0, realized: [] });
      const fx = +m.fx || ptaxOn(m.date);
      if (m.kind === "compra") { const c = m.qty * m.price + (+m.fees || 0); p.qty += m.qty; p.costCur += c; p.costBRL += c * fx; }
      else {
        const share = p.qty > 0 ? Math.min(1, m.qty / p.qty) : 0; const cCur = p.costCur * share, cBRL = p.costBRL * share;
        const procCur = m.qty * m.price - (+m.fees || 0);
        p.realized.push({ date: m.date, qty: m.qty, procCur, procBRL: procCur * fx, costCur: cCur, costBRL: cBRL, gainBRL: procCur * fx - cBRL });
        p.qty -= m.qty; p.costCur -= cCur; p.costBRL -= cBRL; if (p.qty < 1e-9) { p.qty = 0; p.costCur = 0; p.costBRL = 0; }
      }
    });
    return P;
  }
  function ptaxOn(date) { const t = D().fx.ptax; const ks = Object.keys(t).filter((k) => k <= date).sort(); return ks.length ? +t[ks[ks.length - 1]] : +D().fx.current || 0; }
  function carteira() {
    const P = positions(); const d = D(); const rows = [];
    d.assets.forEach((a) => { const p = P[a.id]; if (!p || p.qty <= 0) return; const mv = p.qty * (+a.price || 0); rows.push({ a, p, mv, pnl: mv - p.costCur }); });
    const mvUSD = rows.filter((r) => r.a.currency === "USD").reduce((s, r) => s + r.mv, 0);
    const mvBRL = rows.filter((r) => r.a.currency === "BRL").reduce((s, r) => s + r.mv, 0);
    const cashUSD = Object.values(d.cash || {}).reduce((s, v) => s + (+v || 0), 0);
    return { rows, mvUSD, mvBRL, cashUSD, totalBRL: (mvUSD + cashUSD) * (+d.fx.current || 0) + mvBRL };
  }
  ERP.investimentos = { carteira, fx: () => D().fx.current };

  /* ---------- formulários ---------- */
  function moveForm(m) {
    const d = D(); const isNew = !m; m = m || { date: todayISO(), kind: "compra", brokerId: (d.brokers[0] || {}).id, fees: 0 };
    ERP.form({
      title: isNew ? "Nova movimentação" : "Editar movimentação", wide: true,
      intro: "Valores na moeda do ativo. Câmbio (PTAX) da data: se vazio, usa a tabela de PTAX em Configurações.",
      fields: [
        { k: "kind", label: "Tipo", type: "select", value: m.kind, options: KIND },
        { k: "date", label: "Data", type: "date", value: m.date, required: true },
        { k: "assetId", label: "Ativo", type: "select", value: m.assetId, options: [["", "— (caixa)"]].concat(d.assets.map((a) => [a.id, a.ticker + " · " + a.name])) },
        { k: "brokerId", label: "Corretora", type: "select", value: m.brokerId, options: d.brokers.map((b) => [b.id, b.name]) },
        { k: "qty", label: "Quantidade (compra/venda)", type: "number", step: "any", value: m.qty },
        { k: "price", label: "Preço unitário", type: "number", step: "any", value: m.price },
        { k: "amount", label: "Valor (dividendo, imposto, juros, depósito, taxa)", type: "number", step: "0.01", value: m.amount },
        { k: "fees", label: "Corretagem", type: "number", step: "0.01", value: m.fees },
        { k: "fx", label: "PTAX da data (R$ por US$)", type: "number", step: "0.0001", value: m.fx },
        { k: "notes", label: "Observação", value: m.notes, full: true },
      ],
      onSubmit(v) {
        if ((v.kind === "compra" || v.kind === "venda") && (!v.assetId || !v.qty || !v.price)) { ERP.toast("Compra/venda precisa de ativo, quantidade e preço."); return false; }
        if (v.kind === "venda") { const p = positions(v.date)[v.assetId]; const have = (p ? p.qty : 0) + (!isNew && m.kind === "venda" && m.assetId === v.assetId ? +m.qty : 0); if (v.qty > have + 1e-6) { ERP.toast(`Quantidade maior que a posição (${num(have, 4)}).`); return false; } }
        Store.change("investimentos", (dd) => { if (isNew) dd.moves.push(Object.assign({ id: uid("mv") }, v)); else Object.assign(dd.moves.find((x) => x.id === m.id), v); });
        ERP.render();
      },
      onDelete: isNew ? null : () => { Store.change("investimentos", (dd) => { dd.moves = dd.moves.filter((x) => x.id !== m.id); }); ERP.render(); },
    });
  }
  function assetForm(a) {
    const d = D(); const isNew = !a; a = a || { currency: "USD", cls: "acoes", brokerId: (d.brokers[0] || {}).id };
    ERP.form({
      title: isNew ? "Novo ativo" : "Editar ativo " + a.ticker,
      fields: [
        { k: "ticker", label: "Ticker", value: a.ticker, required: true }, { k: "name", label: "Nome", value: a.name },
        { k: "cls", label: "Classe", type: "select", value: a.cls, options: CLASSES }, { k: "currency", label: "Moeda", type: "select", value: a.currency, options: [["USD", "USD"], ["BRL", "BRL"], ["EUR", "EUR"]] },
        { k: "brokerId", label: "Corretora", type: "select", value: a.brokerId, options: d.brokers.map((b) => [b.id, b.name]) },
        { k: "price", label: "Cotação atual", type: "number", step: "any", value: a.price }, { k: "priceAt", label: "Data da cotação", type: "date", value: a.priceAt || todayISO() },
        { k: "irpf", label: "IRPF — Grupo/Código (confira no programa do ano)", value: a.irpf, full: true },
      ],
      onSubmit(v) { v.ticker = v.ticker.trim().toUpperCase(); Store.change("investimentos", (dd) => { if (isNew) dd.assets.push(Object.assign({ id: uid("as") }, v)); else Object.assign(dd.assets.find((x) => x.id === a.id), v); }); ERP.render(); },
      onDelete: isNew ? null : () => { if (d.moves.some((m) => m.assetId === a.id)) { ERP.toast("Ativo com movimentações — exclua-as antes."); return; } Store.change("investimentos", (dd) => { dd.assets = dd.assets.filter((x) => x.id !== a.id); }); ERP.render(); },
    });
  }

  /* ---------- páginas ---------- */
  function pCarteira(root) {
    const d = D(); const c = carteira(); const fx = +d.fx.current || 0;
    const cost = c.rows.filter((r) => r.a.currency === "USD").reduce((s, r) => s + r.p.costCur, 0);
    const pnl = c.mvUSD - cost;
    const byCls = {}; c.rows.forEach((r) => { const v = r.a.currency === "USD" ? r.mv * fx : r.mv; byCls[r.a.cls] = (byCls[r.a.cls] || 0) + v; });
    const tot = Object.values(byCls).reduce((s, v) => s + v, 0) || 1;
    const divY = d.moves.filter((m) => m.kind === "dividendo" && m.date.slice(0, 4) === String(new Date().getFullYear())).reduce((s, m) => s + +m.amount, 0);
    root.innerHTML = ERP.pagehead("Investimentos", `<button class="btn ghost" id="iQuotes">Atualizar cotações</button><button class="btn orange" id="iNew">+ Movimentação</button>`) + `
      <div class="kpis">${ERP.kpi("Patrimônio investido", brl(c.totalBRL), `câmbio ${num(fx, 4)}${d.fx.currentAt ? " em " + fdate(d.fx.currentAt) : ""}`)}${ERP.kpi("Exterior (USD)", usd(c.mvUSD + c.cashUSD), "ativos " + usd(c.mvUSD) + " · caixa " + usd(c.cashUSD))}${ERP.kpi("Resultado não realizado", usd(pnl), cost ? pct((pnl / cost) * 100) + " sobre o custo" : "", pnl >= 0 ? "pos" : "neg")}${ERP.kpi("Dividendos no ano (bruto)", usd(divY))}</div>
      <div class="grid2"><div class="card"><h3>Distribuição por classe</h3>${Object.entries(byCls).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<div class="hrow"><span class="n">${esc(CLN[k] || k)}</span><div class="bar"><i style="width:${(v / tot) * 100}%"></i></div><span class="v">${num((v / tot) * 100, 1)}%</span></div>`).join("") || `<div class="empty">Sem posições.</div>`}</div>
      <div class="card"><h3>Maiores posições</h3>${c.rows.slice().sort((a, b) => b.mv - a.mv).slice(0, 6).map((r) => `<div class="hrow"><span class="n">${esc(r.a.ticker)}</span><div class="bar"><i style="width:${(r.mv / (c.mvUSD || 1)) * 100}%;background:var(--navy)"></i></div><span class="v">${usd(r.mv)}</span></div>`).join("") || `<div class="empty">—</div>`}</div></div>
      <div class="card"><h3>Carteira</h3>${c.rows.length ? `<div class="tw"><table><thead><tr><th>Ativo</th><th>Classe</th><th class="r">Qtd.</th><th class="r">Preço médio</th><th class="r">Cotação</th><th class="r">Valor de mercado</th><th class="r">Resultado</th><th class="r">%</th></tr></thead><tbody>${c.rows.sort((a, b) => a.a.ticker.localeCompare(b.a.ticker)).map((r) => { const f = r.a.currency === "USD" ? usd : brl; const pm = r.p.costCur / r.p.qty; return `<tr data-as="${r.a.id}" style="cursor:pointer"><td><b>${esc(r.a.ticker)}</b><div class="mut" style="font-size:12px">${esc(r.a.name)}</div></td><td class="mut">${esc(CLN[r.a.cls] || "")}</td><td class="r">${num(r.p.qty, 4)}</td><td class="r">${f(pm)}</td><td class="r">${f(r.a.price)}</td><td class="r">${f(r.mv)}</td><td class="r ${r.pnl >= 0 ? "pos" : "neg"}">${f(r.pnl)}</td><td class="r ${r.pnl >= 0 ? "pos" : "neg"}">${pct((r.pnl / r.p.costCur) * 100)}</td></tr>`; }).join("")}<tr class="total"><td colspan="5">Total exterior</td><td class="r">${usd(c.mvUSD)}</td><td class="r">${usd(pnl)}</td><td class="r">${cost ? pct((pnl / cost) * 100) : ""}</td></tr></tbody></table></div>` : `<div class="empty">Nenhuma posição. Importe os dados iniciais em Sistema › Dados ou lance as compras.</div>`}
      <div class="toolbar" style="margin-top:10px"><button class="btn ghost sm" id="iAsset">+ Ativo</button><span class="mut" style="font-size:12px">Clique num ativo para editar cotação, classe e código do IRPF.</span></div></div>`;
    $("#iNew", root).onclick = () => moveForm(); $("#iAsset", root).onclick = () => assetForm();
    $$("[data-as]", root).forEach((r) => (r.onclick = () => assetForm(d.assets.find((a) => a.id === r.dataset.as))));
    $("#iQuotes", root).onclick = quotesForm;
  }
  function quotesForm() {
    const d = D(); const held = carteira().rows.map((r) => r.a);
    const fields = [{ k: "fx", label: "Câmbio atual (R$/US$)", type: "number", step: "0.0001", value: d.fx.current }, { k: "cash", label: "Caixa na IBKR (US$)", type: "number", step: "0.01", value: (d.cash || {}).ibkr }]
      .concat(held.map((a) => ({ k: "p_" + a.id, label: a.ticker + " (" + a.currency + ")", type: "number", step: "any", value: a.price })));
    ERP.form({ title: "Atualizar cotações", intro: "Digite as cotações do dia (ex.: do app da IBKR). Peça ao Claude no chat para trazer as posições da IBKR e atualizar o arquivo.", fields, wide: true, onSubmit(v) { Store.change("investimentos", (dd) => { dd.fx.current = v.fx; dd.fx.currentAt = todayISO(); dd.cash = dd.cash || {}; dd.cash.ibkr = v.cash; dd.assets.forEach((a) => { if (v["p_" + a.id] !== undefined) { a.price = v["p_" + a.id]; a.priceAt = todayISO(); } }); }); ERP.render(); } });
  }

  function pMov(root) {
    const d = D(); const rows = d.moves.filter((m) => !S.broker || m.brokerId === S.broker).sort((a, b) => b.date.localeCompare(a.date));
    root.innerHTML = ERP.pagehead("Movimentações", `<button class="btn orange" id="iNew">+ Movimentação</button>`) + (rows.length ? `<div class="tw"><table><thead><tr><th>Data</th><th>Tipo</th><th>Ativo</th><th class="r">Qtd.</th><th class="r">Preço</th><th class="r">Valor</th><th class="r">PTAX</th><th>Obs.</th></tr></thead><tbody>${rows.map((m) => { const a = asset(m.assetId); const val = m.kind === "compra" || m.kind === "venda" ? m.qty * m.price : +m.amount; return `<tr data-mv="${m.id}" style="cursor:pointer"><td>${fdate(m.date)}</td><td><span class="pill ${m.kind === "compra" ? "info" : m.kind === "venda" ? "warn" : m.kind === "dividendo" ? "ok" : ""}">${KN[m.kind]}</span></td><td>${m.assetId ? esc(a.ticker) : "—"}</td><td class="r">${m.qty ? num(m.qty, 4) : ""}</td><td class="r">${m.price ? num(m.price, 2) : ""}</td><td class="r">${num(val, 2)}</td><td class="r mut">${m.fx ? num(m.fx, 4) : "tabela"}</td><td class="mut">${esc(m.notes || "")}</td></tr>`; }).join("")}</tbody></table></div>` : `<div class="empty">Nenhuma movimentação.</div>`);
    $("#iNew", root).onclick = () => moveForm();
    $$("[data-mv]", root).forEach((r) => (r.onclick = () => moveForm(d.moves.find((m) => m.id === r.dataset.mv))));
  }

  function pIR(root) {
    const d = D(); const y = S.year; const end = y + "-12-31"; const ptaxEnd = d.fx.ptax[end];
    const P = positions(end); const Pprev = positions((y - 1) + "-12-31");
    const bens = d.assets.map((a) => ({ a, p: P[a.id], pp: Pprev[a.id] })).filter((x) => (x.p && x.p.qty > 0) || (x.pp && x.pp.qty > 0));
    const real = []; Object.entries(positions(end)).forEach(([id, p]) => p.realized.filter((r) => r.date.slice(0, 4) === String(y)).forEach((r) => real.push(Object.assign({ a: asset(id) }, r))));
    const gain = real.reduce((s, r) => s + r.gainBRL, 0);
    const ofY = (k) => d.moves.filter((m) => m.kind === k && m.date.slice(0, 4) === String(y));
    const divBRL = ofY("dividendo").reduce((s, m) => s + +m.amount * (+m.fx || ptaxOn(m.date)), 0);
    const jurBRL = ofY("juros").reduce((s, m) => s + +m.amount * (+m.fx || ptaxOn(m.date)), 0);
    const taxBRL = ofY("imposto").reduce((s, m) => s + +m.amount * (+m.fx || ptaxOn(m.date)), 0);
    const divUSD = ofY("dividendo").reduce((s, m) => s + +m.amount, 0), taxUSD = ofY("imposto").reduce((s, m) => s + +m.amount, 0);
    const base = Math.max(0, gain + divBRL + jurBRL); const imposto15 = base * 0.15; const credito = Math.min(taxBRL, (divBRL + jurBRL) * 0.15);
    const devido = Math.max(0, imposto15 - credito);
    const cashUSD = (d.cash || {}).ibkr || 0;
    root.innerHTML = ERP.pagehead("IR do ano-base " + y, `<button class="btn ghost sm" data-y="-1">‹ ${y - 1}</button><button class="btn ghost sm" data-y="1">${y + 1} ›</button><button class="btn ghost" onclick="print()">Imprimir / PDF</button>`) + `
      <div class="note info">Regra usada: aplicações no exterior de pessoa física (Lei 14.754/2023, a partir de 2024) — ganhos, dividendos e juros somados no ano e tributados a 15% na declaração anual, com crédito do imposto retido lá fora até o limite do imposto brasileiro sobre esses rendimentos. Custo e venda convertidos pela PTAX de cada data. É um apoio de cálculo: confira com seu contador antes de entregar.</div>
      ${ptaxEnd ? "" : `<div class="note">Falta a PTAX de 31/12/${y} em Configurações (usada para o saldo em conta).</div>`}
      <div class="kpis">${ERP.kpi("Ganho de capital realizado", brl(gain), real.length + " venda(s)", gain >= 0 ? "" : "neg")}${ERP.kpi("Dividendos + juros", brl(divBRL + jurBRL), usd(divUSD) + " brutos")}${ERP.kpi("Imposto pago no exterior", brl(taxBRL), usd(taxUSD))}${ERP.kpi("Estimativa a pagar (15%)", brl(devido), "base " + brl(base) + (gain < 0 ? " · prejuízo compensa rendimentos do ano" : ""), devido > 0 ? "neg" : "pos")}</div>
      <div class="card"><h3>Bens e direitos em 31/12 <small class="mut" style="font-weight:400">custo de aquisição em R$</small></h3><div class="tw"><table><thead><tr><th>Ativo</th><th>Grupo/Código</th><th>Discriminação sugerida</th><th class="r">31/12/${y - 1}</th><th class="r">31/12/${y}</th></tr></thead><tbody>
      ${bens.map(({ a, p, pp }) => `<tr><td><b>${esc(a.ticker)}</b></td><td>${a.irpf ? esc(a.irpf) : '<span class="pill warn">definir</span>'}</td><td class="mut" style="font-size:12px">${num(p ? p.qty : 0, 4)} cotas ${esc(a.ticker)} (${esc(a.name)}), custodiadas na ${esc(((d.brokers.find((b) => b.id === a.brokerId) || {}).name) || "")}, EUA. Custo US$ ${num(p ? p.costCur : 0)}.</td><td class="r">${brl(pp ? pp.costBRL : 0)}</td><td class="r">${brl(p ? p.costBRL : 0)}</td></tr>`).join("")}
      <tr><td><b>Caixa IBKR</b></td><td class="mut">conta no exterior</td><td class="mut" style="font-size:12px">Saldo em conta na Interactive Brokers: US$ ${num(cashUSD)} × PTAX ${ptaxEnd ? num(ptaxEnd, 4) : "?"}. (Saldo atual — ajuste para o de 31/12.)</td><td class="r"></td><td class="r">${ptaxEnd ? brl(cashUSD * ptaxEnd) : "—"}</td></tr>
      <tr class="total"><td colspan="3">Total</td><td class="r">${brl(bens.reduce((s, x) => s + (x.pp ? x.pp.costBRL : 0), 0))}</td><td class="r">${brl(bens.reduce((s, x) => s + (x.p ? x.p.costBRL : 0), 0))}</td></tr></tbody></table></div></div>
      <div class="card"><h3>Vendas no ano</h3>${real.length ? `<div class="tw"><table><thead><tr><th>Data</th><th>Ativo</th><th class="r">Qtd.</th><th class="r">Venda (R$)</th><th class="r">Custo (R$)</th><th class="r">Ganho (R$)</th></tr></thead><tbody>${real.map((r) => `<tr><td>${fdate(r.date)}</td><td>${esc(r.a.ticker)}</td><td class="r">${num(r.qty, 4)}</td><td class="r">${brl(r.procBRL)}</td><td class="r">${brl(r.costBRL)}</td><td class="r ${r.gainBRL >= 0 ? "pos" : "neg"}">${brl(r.gainBRL)}</td></tr>`).join("")}</tbody></table></div>` : `<div class="empty">Nenhuma venda em ${y}.</div>`}</div>`;
    $$("[data-y]", root).forEach((b) => (b.onclick = () => { S.year += +b.dataset.y; ERP.render(); }));
  }

  function pConf(root) {
    const d = D(); const rows = Object.entries(d.fx.ptax).sort((a, b) => b[0].localeCompare(a[0]));
    root.innerHTML = ERP.pagehead("Configurações de investimentos") + `
      <div class="card"><h3>Tabela de PTAX (venda, Banco Central)</h3><p class="mut" style="margin-bottom:10px">Usada quando a movimentação não tem câmbio próprio: vale a PTAX da data mais recente até o dia. Inclua sempre a de 31/12 de cada ano.</p>
      <div class="tw"><table><thead><tr><th>Data</th><th class="r">R$ por US$</th><th></th></tr></thead><tbody>${rows.map(([k, v]) => `<tr><td>${fdate(k)}</td><td class="r">${num(v, 4)}</td><td class="r"><button class="btn ghost sm" data-delptax="${k}">Remover</button></td></tr>`).join("")}</tbody></table></div>
      <div class="toolbar" style="margin-top:10px"><input type="date" id="pxD"><input id="pxV" placeholder="5,5024" style="width:110px"><button class="btn sm" id="pxAdd">Adicionar</button></div></div>
      <div class="card"><h3>Corretoras</h3>${d.brokers.map((b) => `<div>${esc(b.name)} <span class="mut">· ${esc(b.country)} · ${esc(b.currency)}</span></div>`).join("")}<div class="toolbar" style="margin-top:10px"><button class="btn ghost sm" id="brAdd">+ Corretora</button></div></div>`;
    $("#pxAdd", root).onclick = () => { const k = $("#pxD", root).value, v = ERP.parseNum($("#pxV", root).value); if (!k || !v) { ERP.toast("Informe data e valor."); return; } Store.change("investimentos", (dd) => { dd.fx.ptax[k] = v; }); ERP.render(); };
    $$("[data-delptax]", root).forEach((b) => (b.onclick = () => { Store.change("investimentos", (dd) => { delete dd.fx.ptax[b.dataset.delptax]; }); ERP.render(); }));
    $("#brAdd", root).onclick = () => ERP.form({ title: "Nova corretora", fields: [{ k: "name", label: "Nome", required: true }, { k: "country", label: "País", value: "Brasil" }, { k: "currency", label: "Moeda", type: "select", value: "BRL", options: [["BRL", "BRL"], ["USD", "USD"], ["EUR", "EUR"]] }], onSubmit(v) { Store.change("investimentos", (dd) => dd.brokers.push(Object.assign({ id: uid("br") }, v))); ERP.render(); } });
  }

  ERP.register({ id: "investimentos", label: "Investimentos", tab: "Investir", icon: "trending-up", group: "Finanças", pages: [
    { id: "carteira", label: "Carteira", render: pCarteira }, { id: "movimentacoes", label: "Movimentações", render: pMov },
    { id: "ir", label: "Imposto de Renda", render: pIR }, { id: "config", label: "Configurações", render: pConf } ] });
})();
