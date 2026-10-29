/* Finanças Pessoais — Painel e Extratos no formato do Piloto 3.0 (posição bancária, desempenho, resultado do período,
   composição das saídas, demonstrativos, fluxo de caixa 12 + 12 meses, evolução do saldo, análise gráfica, lançamentos ±30 dias). */
(function () {
  "use strict";
  const { $, $$, esc, uid, brl, num, todayISO, fdate, monthKey, monthLabel, Store } = ERP;
  const F = ERP.fin, U = ERP.finUI, D = F.D, S = U.S;
  const MES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  S.pAno = S.pAno || new Date().getFullYear(); if (S.pMes == null) S.pMes = 0;   /* 0 = ano todo, como no Piloto */
  S.perfHor = S.perfHor || "mtd"; S.fluxoVis = S.fluxoVis || "tudo"; S.ext = S.ext || "entradas"; S.pq = S.pq || ""; S.pt = S.pt || "";

  const reg = () => D().cfg.regime;
  const mks = () => (S.pMes ? [S.pAno + "-" + ERP.p2(S.pMes)] : MES.map((_, i) => S.pAno + "-" + ERP.p2(i + 1)));
  const perLbl = () => (S.pMes ? MES[S.pMes - 1] + "/" + String(S.pAno).slice(2) : "ano de " + S.pAno);
  const alpha = (hex, a) => { const h = hex.replace("#", ""); if (h.length < 6) return hex; return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`; };
  const kfmt = (v) => (Math.abs(v) >= 1000 ? num(v / 1000, Math.abs(v) >= 10000 ? 0 : 1) + " mil" : num(v, 0));
  const CORES = () => ({ ent: ERP.cor("--ok"), sai: ERP.cor("--err"), acu: ERP.cor("--orange"), navy: ERP.cor("--navy"), ink2: ERP.cor("--ink-2"), line: ERP.cor("--line"), fixo: "#3F6DB3", variavel: "#C9922E", cartao: "#8A63C2" });
  const DL = { display: (c) => !!c.dataset.data[c.dataIndex], anchor: "end", align: "top", offset: -2, clamp: true, font: { size: 9, weight: "700" }, formatter: (v) => (v ? Math.round(v).toLocaleString("pt-BR") : "") };
  const eixoR$ = { ticks: { callback: (v) => kfmt(v) }, grid: { color: () => ERP.cor("--line") } };
  const tip = { callbacks: { label: (c) => ` ${c.dataset.label || c.label}: ${brl(c.parsed.y != null ? c.parsed.y : c.parsed)}` } };

  /* ---------- lançamentos do período, no regime escolhido (mesma base dos números do painel) ---------- */
  function lancsPeriodo(kind) {
    const set = new Set(mks()); const r = reg(); const out = [];
    D().lanc.forEach((l) => {
      const c = F.cat(l.catId); const inv = c.natureza === "investimento";
      let dt, v;
      if (r === "caixa") { if (!l.pago || !["receita", "despesa", "pagfatura"].includes(l.tipo)) return; dt = l.pago; v = l.valorPago != null ? l.valorPago : l.valor; }
      else { if (!["receita", "despesa", "compra", "estorno"].includes(l.tipo)) return; dt = F.dataComp(l); v = l.tipo === "estorno" ? -l.valor : l.valor; }
      if (!set.has(monthKey(dt))) return;
      const cartao = l.tipo === "compra" || l.tipo === "estorno" || l.tipo === "pagfatura";
      const cls = cartao ? "cartao" : l.classe || (c.fixo ? "fixo" : "variavel");
      const ok = kind === "entradas" ? l.tipo === "receita" && !inv
        : kind === "saidas" ? l.tipo !== "receita" && !inv
        : kind === "fixos" ? !cartao && l.tipo === "despesa" && !inv && cls === "fixo"
        : kind === "variaveis" ? !cartao && l.tipo === "despesa" && !inv && cls === "variavel"
        : kind === "cartao" ? cartao : true;
      if (ok) out.push({ l, dt, v });
    });
    return out.sort((a, b) => b.dt.localeCompare(a.dt));
  }
  /* caixa realizado de um mês (entradas e saídas das contas do dia a dia) */
  function caixaMes(mk) {
    let ent = 0, sai = 0; const ids = new Set(F.contasAtivas().filter((c) => c.tipo !== "reserva").map((c) => c.id));
    D().lanc.forEach((l) => { if (!l.pago || monthKey(l.pago) !== mk || !ids.has(l.contaId)) return; const v = l.valorPago != null ? l.valorPago : l.valor; if (l.tipo === "receita") ent += v; else if (l.tipo === "despesa" || l.tipo === "pagfatura") sai += v; });
    return { ent, sai };
  }

  /* ---------- peças ---------- */
  function filtros() {
    const anos = new Set([new Date().getFullYear(), S.pAno]); D().lanc.forEach((l) => anos.add(+String(F.dataComp(l)).slice(0, 4)));
    return `<div class="card fp-filtros"><label for="fpAno" class="fp-lbl">Ano</label><select id="fpAno">${[...anos].filter(Boolean).sort().map((a) => `<option ${a === S.pAno ? "selected" : ""}>${a}</option>`).join("")}</select>
      <div class="fp-meses"><button class="${S.pMes === 0 ? "on" : ""}" data-pm="0">Ano todo</button>${MES.map((m, i) => `<button class="${S.pMes === i + 1 ? "on" : ""}" data-pm="${i + 1}">${m}</button>`).join("")}</div>
      <div class="tabs fin-tgl" role="group" aria-label="Regime"><button class="${reg() === "caixa" ? "on" : ""}" data-reg="caixa" title="Só o que foi pago e recebido, nas datas do pagamento">Regime de caixa</button><button class="${reg() === "competencia" ? "on" : ""}" data-reg="competencia" title="Pela data da compra/competência, incluindo os previstos">Incluir previstos</button></div></div>`;
  }
  function bindFiltros(root) {
    $("#fpAno", root).onchange = (e) => { S.pAno = +e.target.value; ERP.render(); };
    $$("[data-pm]", root).forEach((b) => (b.onclick = () => { S.pMes = +b.dataset.pm; if (S.pMes) S.mk = S.pAno + "-" + ERP.p2(S.pMes); ERP.render(); }));
    $$("[data-reg]", root).forEach((b) => (b.onclick = () => { Store.change("financas", (d) => { d.cfg.regime = b.dataset.reg; }); ERP.render(); }));
  }
  const sec = (t, n) => `<h2 class="fp-sec">${esc(t)}${n ? ` <small>${esc(n)}</small>` : ""}</h2>`;
  const kpiL = (l, v, s, cls, href, cor) => `<${href ? `a href="${href}"` : "div"} class="kpi fp-k ${cls || ""}" ${cor ? `style="--kc:${cor}"` : ""}><div class="l">${l}${href ? " ↗" : ""}</div><div class="v">${v}</div>${s ? `<div class="s">${s}</div>` : ""}</${href ? "a" : "div"}>`;
  const canvas = (id, h) => `<div class="fp-chart" style="height:${h || 240}px"><canvas id="${id}"></canvas></div>`;

  function conferirSaldo(id) {
    const c = F.conta(id); const atual = F.saldoConta(id);
    ERP.form({ title: "Conferir saldo · " + c.nome, intro: `Pelo ERP, o saldo hoje é <b>${brl(atual)}</b>. Digite o saldo do extrato do banco; a diferença vira um lançamento de ajuste (fora da DRE), registrado no histórico.`,
      fields: [{ k: "saldo", label: "Saldo do extrato hoje (R$, negativo com −)", type: "number", step: "0.01", value: atual }, { k: "obs", label: "Observação", full: true, placeholder: "Ex.: tarifa não lançada" }],
      okLabel: "Ajustar saldo",
      onSubmit(v) { const dif = F.r2(v.saldo - atual); if (!dif) { ERP.toast("Saldo já confere com o extrato."); return; } U.salvar((d) => d.lanc.push({ id: uid("l"), tipo: "ajuste", contaId: id, valor: dif, desc: "Ajuste de saldo (conferência com o extrato)", notas: v.obs || "", comp: todayISO(), venc: todayISO(), pago: todayISO(), hist: [{ em: new Date().toISOString(), o: `Saldo conferido: ERP ${brl(atual)} → extrato ${brl(v.saldo)} (${dif > 0 ? "+" : ""}${brl(dif)})` }] })); ERP.toast("Saldo ajustado."); ERP.render(); } });
  }

  /* ---------- PAINEL ---------- */
  function pPainel(root) {
    const d = D(); const h = todayISO(); const R = F.drePeriodo(mks()); const C = CORES();
    const pend = F.pendencias(); const fat = F.faturasAbertas(); const fatTot = fat.reduce((s, f) => s + f.total, 0);
    const pj = F.projecao(12);
    const contas = F.contasAtivas().filter((c) => c.tipo !== "reserva");
    const venc = pend.filter((p) => p.tipo !== "receita" && p.data < h); const ap = pend.filter((p) => p.tipo !== "receita");
    const ap15 = ap.filter((p) => p.data >= h && p.data <= F.addDias(h, 15)).reduce((s, p) => s + p.valor, 0);
    const mLim = S.pMes || 12; let acu = 0; for (let i = 1; i <= mLim; i++) acu += F.dreMes(S.pAno + "-" + ERP.p2(i)).resultado;
    const pc = (v) => (R.despesas > 0 ? num((v / R.despesas) * 100, 0) + "% das saídas" : "—");
    /* alertas */
    const alertas = [];
    if (venc.length) alertas.push(["err", `${venc.length} conta(s) vencida(s), ${brl(venc.reduce((s, p) => s + p.valor, 0))}`, "#/financas/agenda"]);
    if (pj.min.v < 0 && pj.ini >= 0) alertas.push(["err", `O saldo projetado fica negativo em ${fdate(pj.min.data)} (${brl(pj.min.v)})`, "#/financas/fluxo"]);
    d.cartoes.forEach((c) => { const u = F.usoCartao(c.id); if (c.limite > 0 && (u / c.limite) * 100 >= (d.cfg.alertaCartao || 80)) alertas.push(["warn", `${c.nome}: ${num((u / c.limite) * 100, 0)}% do limite usado`, "#/financas/cartoes"]); });
    if (S.pMes) F.orcamentoMes(mks()[0]).filter((x) => x.orcado > 0 && x.pct > 100).forEach((x) => alertas.push(["warn", `Orçamento estourado em ${x.c.nome}: ${brl(x.realizado)} de ${brl(x.orcado)}`, "#/financas/orcamento"]));
    /* janela ±30 dias */
    const a = F.addDias(h, -30), b = F.addDias(h, 30); const q = S.pq.toLowerCase();
    const jan = d.lanc.filter((l) => l.tipo !== "ajuste" || true).filter((l) => { const dt = l.tipo === "compra" || l.tipo === "estorno" ? l.comp : F.dataCaixa(l); return dt >= a && dt <= b; })
      .filter((l) => (!S.pt || (S.pt === "despesa" ? ["despesa", "compra", "pagfatura"].includes(l.tipo) : l.tipo === S.pt)) && (!q || (l.desc + " " + F.cat(l.catId).nome).toLowerCase().includes(q)))
      .sort((x, y) => (y.tipo === "compra" ? y.comp : F.dataCaixa(y)).localeCompare(x.tipo === "compra" ? x.comp : F.dataCaixa(x)));
    const liq = jan.reduce((s, l) => s + (l.tipo === "receita" ? 1 : l.tipo === "ajuste" ? Math.sign(l.valor) : l.tipo === "transferencia" ? 0 : -1) * Math.abs(l.valor), 0);

    root.innerHTML = ERP.pagehead("Controle de Finanças", `<button class="btn ghost" id="fpConf">Conferir saldo</button><button class="btn orange" id="fpNovo">+ Novo lançamento</button>`) + filtros() + `
      ${alertas.length ? `<div class="fin-alertas">${alertas.map(([c, t, hr]) => `<a class="note ${c === "err" ? "err" : ""}" href="${hr}">${esc(t)}</a>`).join("")}</div>` : ""}
      ${sec("Posição bancária", "saldos reais de hoje")}
      <div class="kpis fp-2">${contas.map((c) => { const s = F.saldoConta(c.id); const lim = +c.limite || 0; return `<button class="kpi fp-k fp-btn ${s < 0 ? "neg" : ""}" data-conf="${c.id}" style="--kc:var(${s < 0 ? "--err" : "--ok"})" title="Conferir com o extrato"><div class="l">Saldo em conta · ${esc(c.nome)} ✎</div><div class="v">${brl(s)}</div><div class="s">${s < 0 && lim ? `Usando o cheque especial · disponível <b>${brl(lim + s)}</b> de <b>${brl(lim)}</b>` : lim ? `Cheque especial de ${brl(lim)} disponível` : esc(c.banco || "Toque para conferir com o extrato")}</div></button>`; }).join("")}
        ${kpiL("Faturas futuras já comprometidas", brl(fatTot), fat.length ? `${fat.length} fatura(s) · ${fdate(fat.map((f) => f.vence).sort()[0]).slice(0, 5)} a ${fdate(fat.map((f) => f.vence).sort().pop()).slice(0, 5)}` : "nenhuma fatura em aberto", "", "#/financas/cartoes", "var(--warn)")}</div>
      ${sec("Desempenho", "só o que já foi pago ou recebido")}
      <div class="card"><div class="fp-perf"><div><div class="fp-big" id="fpBig">—</div><div class="mut fp-sub" id="fpPerfSub"></div></div><div class="tabs fin-tgl">${[["7", "1 sem"], ["mtd", "MTD"], ["30", "1 m"], ["90", "3 m"], ["ytd", "YTD"], ["tudo", "Tudo"]].map(([k, n]) => `<button class="${S.perfHor === k ? "on" : ""}" data-hor="${k}">${n}</button>`).join("")}</div></div>${canvas("chPerf", 260)}</div>
      ${sec("Resultado do período")}
      <div class="kpis fp-4">${kpiL("Entradas (+)", brl(R.rec), `<b>${R.nE}</b> lançamento(s) · ${perLbl()}`, "pos", "#/financas/extratos", "var(--ok)")}${kpiL("Saídas (−)", brl(R.despesas), `<b>${R.nS}</b> lançamento(s) · ${perLbl()}`, "neg", "#/financas/extratos", "var(--err)")}${kpiL("Resultado (=)", brl(R.resultado), R.rec > 0 ? `Margem de <b>${num((R.resultado / R.rec) * 100, 1)}%</b> sobre as entradas` : "—", R.resultado >= 0 ? "pos" : "neg")}${kpiL("Saldo acumulado no ano", brl(acu), `Soma dos resultados de Jan a ${MES[mLim - 1]}/${String(S.pAno).slice(2)} · não inclui o saldo bancário`, acu < 0 ? "neg" : "")}</div>
      ${sec("Composição das saídas")}
      <div class="kpis fp-4">${kpiL("Custos fixos", brl(R.fixo), pc(R.fixo), "", "#/financas/extratos", C.fixo)}${kpiL("Custos variáveis", brl(R.variavel), pc(R.variavel), "", "#/financas/extratos", C.variavel)}${kpiL("Cartão de crédito", brl(R.cartao), pc(R.cartao), "", "#/financas/cartoes", C.cartao)}${kpiL("Contas a pagar · 30 dias", brl(ap.filter((p) => p.data <= F.addDias(h, 30)).reduce((s, p) => s + p.valor, 0)), `${venc.length ? `<b class="neg">${venc.length} vencida(s)</b> · ` : ""}${brl(ap15)} nos próximos 15 dias<br>previsto em 12 meses: ${brl(ap.reduce((s, p) => s + p.valor, 0))}`, venc.length ? "neg" : "", "#/financas/agenda", "var(--navy)")}</div>
      ${sec("Demonstrativos contábeis")}
      <div class="fp-dem"><div class="card"><h3 class="fp-h3">DRE pessoal <small>${perLbl()}</small></h3><div class="fp-dre">
        ${[["Receitas do período", R.rec], ["(−) Necessidades", -R.essencial], ["(−) Estilo de vida", -R.estilo], ["(−) Financeiro (juros, tarifas, dívidas)", -R.financeiro]].map(([n, v]) => `<div class="row"><span>${n}</span><span class="${v < 0 ? "neg" : ""}">${v < 0 ? "− " + brl(-v) : brl(v)}</span></div>`).join("")}
        <div class="row total"><span>(=) Resultado</span><span class="${R.resultado >= 0 ? "pos" : "neg"}">${brl(R.resultado)}</span></div>
        <div class="row sub"><span>Margem sobre as receitas</span><span>${R.rec > 0 ? num((R.resultado / R.rec) * 100, 1) + "%" : "—"}</span></div>
        <div class="row"><span>(−) Investimentos e reservas</span><span>${R.investimento ? "− " + brl(R.investimento) : brl(0)}</span></div>
        <div class="row total"><span>(=) Saldo livre</span><span class="${R.livre >= 0 ? "pos" : "neg"}">${brl(R.livre)}</span></div>
        <div class="row sub"><span>Fixos · variáveis · cartão</span><span>${brl(R.fixo)} · ${brl(R.variavel)} · ${brl(R.cartao)}</span></div></div></div>
      <div class="fp-col"><div class="fp-right"><div class="tabs fin-tgl">${[["tudo", "Tudo"], ["res", "Resultado"], ["es", "Entrada × Saída"]].map(([k, n]) => `<button class="${S.fluxoVis === k ? "on" : ""}" data-fv="${k}">${n}</button>`).join("")}</div></div>
        <div class="card"><h3 class="fp-h3">Fluxo dos últimos 12 meses <small>realizado · entradas × saídas × acumulado</small></h3>${canvas("chHist", 220)}<p class="mut fin-leg" id="fpHistLg"></p></div>
        <div class="card"><h3 class="fp-h3">Fluxo dos próximos 12 meses <small>previstos cadastrados + faturas em aberto</small></h3>${canvas("chProj", 220)}<p class="mut fin-leg" id="fpProjLg"></p></div></div></div>
      <div class="card"><h3 class="fp-h3">Evolução do saldo <small>mês a mês: saldo anterior + entradas − saídas · previstos + faturas</small></h3><div class="tw"><table><thead><tr><th>Mês</th><th class="r">Entradas (+)</th><th class="r">Saídas (−)</th><th class="r">Resultado</th><th class="r">Acumulado</th><th class="r">Saldo</th></tr></thead><tbody>
        <tr><td>Posição hoje</td><td class="r mut">—</td><td class="r mut">—</td><td class="r mut">—</td><td class="r mut">—</td><td class="r">${U.sinal(pj.ini)}</td></tr>
        ${(() => { let ac = 0; return pj.porMes.map((m) => { const r = m.ent - m.sai; ac += r; return `<tr><td>${monthLabel(m.mk)}</td><td class="r pos">${m.ent ? "+ " + brl(m.ent) : "—"}</td><td class="r neg">${m.sai ? "− " + brl(m.sai) : "—"}</td><td class="r">${U.sinal(r)}</td><td class="r">${U.sinal(ac)}</td><td class="r"><b>${U.sinal(m.saldo)}</b>${m.juros ? `<div class="mut fin-sub">juros cheque esp. ~${brl(m.juros)}</div>` : ""}</td></tr>`; }).join(""); })()}</tbody></table></div></div>
      ${sec("Análise gráfica")}
      <div class="grid2">
        <div class="card"><h3 class="fp-h3">Evolução das Receitas por mês <small>${S.pAno}</small></h3>${canvas("chRecMes")}</div>
        <div class="card"><h3 class="fp-h3">Evolução das Despesas por mês <small>${S.pAno}</small></h3>${canvas("chDesMes")}</div>
        <div class="card"><h3 class="fp-h3">Receitas × Despesas <small>${perLbl()}</small></h3>${canvas("chRxD")}<p class="mut fin-leg">Receitas ${brl(R.rec)} · Despesas ${brl(R.despesas)}</p></div>
        <div class="card"><h3 class="fp-h3">Saídas por classificação <small>fixo · variável · cartão</small></h3>${canvas("chCls")}<p class="mut fin-leg">Fixo ${brl(R.fixo)} · Variável ${brl(R.variavel)} · Cartão ${brl(R.cartao)}</p></div>
        <div class="card"><h3 class="fp-h3">Análise das Receitas <small>por categoria · ${perLbl()}</small></h3>${canvas("chRecCat")}</div>
        <div class="card"><h3 class="fp-h3">Análise das Despesas <small>por categoria · ${perLbl()}</small></h3>${canvas("chDesCat", 280)}</div>
      </div>
      <div class="card"><h3 class="fp-h3">Contas a Receber × Contas a Pagar <small>previstos + faturas · próximos 12 meses</small></h3>${canvas("chCRP", 240)}</div>
      ${sec("Lançamentos próximos", "30 dias antes e depois de hoje")}
      <div class="card" style="padding:0"><div class="toolbar" style="padding:12px 14px 0"><input id="fpQ" placeholder="Buscar descrição ou categoria…" value="${esc(S.pq)}" style="flex:1;min-width:160px"><select id="fpT"><option value="">Tipo: todos</option><option value="receita">Receitas</option><option value="despesa">Despesas</option><option value="transferencia">Transferências</option></select></div>
        ${jan.length ? `<div class="tw" style="border:0"><table><thead><tr><th>Data</th><th>Descrição</th><th>Tipo</th><th>Classe</th><th>Forma</th><th>Situação</th><th class="r">Valor</th><th></th></tr></thead><tbody>${jan.map((l) => { const c = F.cat(l.catId); const s = F.situacao(l); const card = l.tipo === "compra" || l.tipo === "estorno" || l.tipo === "pagfatura"; const cls = card ? "cartao" : c.natureza === "investimento" ? "" : l.classe || (c.fixo ? "fixo" : "variavel"); return `<tr><td>${fdate(card && l.tipo !== "pagfatura" ? l.comp : F.dataCaixa(l)).replace(/\/20(\d\d)$/, "/$1")}</td><td><b>${esc(l.desc)}</b><div class="mut fin-sub">${l.catId ? esc(c.nome) : l.tipo === "ajuste" ? "Ajuste de saldo" : l.tipo === "pagfatura" ? "Pagamento de fatura" : ""}</div></td><td><span class="pill ${l.tipo === "receita" ? "ok" : l.tipo === "transferencia" || l.tipo === "ajuste" ? "" : "err"}">${{ receita: "Receita", despesa: "Despesa", compra: "Despesa", estorno: "Estorno", pagfatura: "Fatura", transferencia: "Transferência", ajuste: "Ajuste" }[l.tipo]}</span></td><td>${l.tipo === "receita" || l.tipo === "ajuste" || l.tipo === "transferencia" || !cls ? "" : `<span class="pill fp-${cls}">${{ fixo: "Fixo", variavel: "Variável", cartao: "Cartão" }[cls]}</span>`}</td><td class="mut">${esc(l.forma || (l.cartaoId ? "Cartão de crédito" : ""))}</td><td>${U.pill(s)}</td><td class="r ${l.tipo === "receita" || (l.tipo === "ajuste" && l.valor > 0) ? "pos" : l.tipo === "transferencia" ? "" : "neg"}"><b>${l.tipo === "receita" || (l.tipo === "ajuste" && l.valor > 0) ? "+ " : l.tipo === "transferencia" ? "" : "− "}${brl(Math.abs(l.valorPago != null ? l.valorPago : l.valor))}</b></td><td class="r fp-acts">${!card && l.tipo !== "ajuste" ? (l.pago ? `<button class="ib" data-est="${l.id}" title="Desfazer pagamento">↺</button>` : `<button class="ib ok" data-pay="${l.id}" title="${l.tipo === "receita" ? "Registrar recebimento" : "Registrar pagamento"}">✓</button>`) : ""}${l.tipo !== "pagfatura" && l.tipo !== "ajuste" && l.tipo !== "estorno" ? `<button class="ib" data-ed="${l.id}" title="Editar">✎</button>` : ""}<button class="ib del" data-del="${l.id}" title="Excluir">✕</button></td></tr>`; }).join("")}</tbody></table></div>` : `<div class="empty">Nenhum lançamento entre ${fdate(a)} e ${fdate(b)}. Use “+ Novo lançamento”.</div>`}
        <div class="fp-foot"><span>${jan.length} lançamento(s) · janela de 60 dias</span><span>Líquido da lista: <b>${brl(liq)}</b></span></div></div>`;

    bindFiltros(root);
    $("#fpNovo", root).onclick = () => U.lancForm();
    $("#fpConf", root).onclick = () => (contas.length === 1 ? conferirSaldo(contas[0].id) : ERP.form({ title: "Conferir saldo", fields: [{ k: "c", label: "Conta", type: "select", options: contas.map((c) => [c.id, c.nome]) }], okLabel: "Continuar", onSubmit(v) { setTimeout(() => conferirSaldo(v.c), 0); } }));
    $$("[data-conf]", root).forEach((b) => (b.onclick = () => conferirSaldo(b.dataset.conf)));
    $$("[data-hor]", root).forEach((b) => (b.onclick = () => { S.perfHor = b.dataset.hor; ERP.render(); }));
    $$("[data-fv]", root).forEach((b) => (b.onclick = () => { S.fluxoVis = b.dataset.fv; ERP.render(); }));
    $$(".fp-k[href]", root).forEach((k) => k.addEventListener("click", () => { const t = k.querySelector(".l").textContent; S.ext = /Entradas/.test(t) ? "entradas" : /Saídas/.test(t) ? "saidas" : /fixos/.test(t) ? "fixos" : /variáveis/.test(t) ? "variaveis" : S.ext; }));
    $("#fpQ", root).onchange = (e) => { S.pq = e.target.value; ERP.render(); }; $("#fpT", root).value = S.pt; $("#fpT", root).onchange = (e) => { S.pt = e.target.value; ERP.render(); };
    acoesLista(root);

    /* ---- gráficos ---- */
    /* desempenho */
    const ini = (() => { const t = new Date(); const iso = (x) => x.getFullYear() + "-" + ERP.p2(x.getMonth() + 1) + "-" + ERP.p2(x.getDate()); if (S.perfHor === "mtd") return h.slice(0, 8) + "01"; if (S.perfHor === "ytd") return h.slice(0, 5) + "01-01"; if (S.perfHor === "tudo") return contas.map((c) => c.dataIni || h).sort()[0] || h; t.setDate(t.getDate() - +S.perfHor); return iso(t); })();
    const hs = F.historicoSaldo(ini); const v0 = hs[0].v, vf = hs[hs.length - 1].v, dlt = vf - v0, pct = v0 ? (dlt / Math.abs(v0)) * 100 : 0;
    const big = $("#fpBig", root); big.textContent = `${dlt >= 0 ? "+" : "−"}${brl(Math.abs(dlt))} (${dlt >= 0 ? "+" : "−"}${num(Math.abs(pct), 2)}%)`; big.className = "fp-big " + (dlt >= 0 ? "pos" : "neg");
    $("#fpPerfSub", root).innerHTML = `Variação do saldo em conta no período, só com lançamentos <b>realizados</b> até hoje (sem previstos, sem projeção).<br>De <b>${brl(v0)}</b> em ${fdate(ini).slice(0, 5)} para <b>${brl(vf)}</b> hoje. % sobre o saldo inicial do período.`;
    const cp = dlt >= 0 ? C.ent : C.sai;
    ERP.chart($("#chPerf", root), { type: "line", data: { labels: hs.map((p) => fdate(p.d).slice(0, 5)), datasets: [{ data: hs.map((p) => p.v), borderColor: cp, backgroundColor: alpha(cp, 0.1), fill: true, tension: 0.25, borderWidth: 2, pointRadius: hs.length > 40 ? 0 : 3, stepped: false }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => " " + brl(c.parsed.y) } } }, scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 8 } }, y: Object.assign({}, eixoR$, Math.max(...hs.map((p) => p.v)) - Math.min(...hs.map((p) => p.v)) < 1 ? { min: v0 - 1000, max: v0 + 1000 } : {}) } } });
    /* fluxo 12 + 12 */
    const histM = []; for (let i = -11; i <= 0; i++) { const mk = F.mesSeg(monthKey(h), i); const x = caixaMes(mk); histM.push({ mk, ent: x.ent, sai: x.sai }); }
    const fluxo = (el, arr, lgEl, lgTxt) => {
      let ac = 0; const acu = arr.map((m) => (ac += m.ent - m.sai)); const lbl = arr.map((m) => MES[+m.mk.slice(5) - 1]);
      const ds = [];
      if (S.fluxoVis !== "res") ds.push({ type: "bar", label: "Entradas", data: arr.map((m) => m.ent), backgroundColor: alpha(C.ent, 0.75), borderRadius: 3, order: 2 }, { type: "bar", label: "Saídas", data: arr.map((m) => -m.sai), backgroundColor: alpha(C.sai, 0.7), borderRadius: 3, order: 2 });
      if (S.fluxoVis === "res") ds.push({ type: "bar", label: "Resultado do mês", data: arr.map((m) => m.ent - m.sai), backgroundColor: arr.map((m) => alpha(m.ent - m.sai >= 0 ? C.ent : C.sai, 0.75)), borderRadius: 3, order: 2 });
      if (S.fluxoVis !== "es") ds.push({ type: "line", label: "Resultado acumulado", data: acu, borderColor: C.acu, backgroundColor: C.acu, borderDash: [5, 4], tension: 0.25, pointRadius: 3, order: 1, datalabels: { display: true, align: "top", color: C.acu, font: { size: 9, weight: "700" }, formatter: (v) => kfmt(v) } });
      ERP.chart(el, { data: { labels: lbl, datasets: ds }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: true, labels: { boxWidth: 10 } }, tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${brl(Math.abs(c.parsed.y))}` } } }, scales: { x: { grid: { display: false } }, y: eixoR$ } } });
      lgEl.innerHTML = lgTxt(acu[acu.length - 1], lbl[lbl.length - 1]);
    };
    fluxo($("#chHist", root), histM, $("#fpHistLg", root), (v, m) => `Resultado acumulado até ${m}: <b class="${v < 0 ? "neg" : "pos"}">${brl(v)}</b> · só lançamentos realizados das contas do dia a dia.`);
    fluxo($("#chProj", root), pj.porMes, $("#fpProjLg", root), (v, m) => `Acumulado até ${m}: <b class="${v < 0 ? "neg" : "pos"}">${brl(v)}</b> · contas e recebimentos previstos + faturas no vencimento; juros do banco só entram se lançados.`);
    /* análise gráfica */
    const meses = MES.map((_, i) => F.dreMes(S.pAno + "-" + ERP.p2(i + 1)));
    const barra = (el, data, cor, labels, horiz) => ERP.chart(el, { type: "bar", data: { labels: labels || MES, datasets: [{ data, backgroundColor: Array.isArray(cor) ? cor : alpha(cor, 0.75), borderRadius: 4 }] }, options: { indexAxis: horiz ? "y" : "x", responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => " " + brl(horiz ? c.parsed.x : c.parsed.y) } }, datalabels: Object.assign({}, DL, horiz ? { anchor: "end", align: "right" } : {}) }, scales: horiz ? { x: Object.assign({}, eixoR$, { grace: "12%" }), y: { grid: { display: false } } } : { x: { grid: { display: false } }, y: Object.assign({}, eixoR$, { grace: "10%" }) } } });
    barra($("#chRecMes", root), meses.map((r) => r.rec), C.ent); barra($("#chDesMes", root), meses.map((r) => r.despesas), C.sai);
    const donut = (el, labels, data, cores) => ERP.chart(el, { type: "doughnut", data: { labels, datasets: [{ data, backgroundColor: cores, borderColor: ERP.cor("--white"), borderWidth: 2 }] }, options: { responsive: true, maintainAspectRatio: false, cutout: "60%", plugins: { legend: { position: "bottom", labels: { boxWidth: 10 } }, tooltip: { callbacks: { label: (c) => ` ${c.label}: ${brl(c.parsed)}` } }, datalabels: { display: (c) => c.dataset.data[c.dataIndex] > 0, color: ERP.cor("--ink"), font: { weight: "800", size: 11 }, formatter: (v, c) => { const t = c.dataset.data.reduce((a2, b2) => a2 + b2, 0); return t ? Math.round((v / t) * 100) + "%" : ""; } } } } });
    donut($("#chRxD", root), ["Receitas", "Despesas"], [R.rec, R.despesas], [alpha(C.ent, 0.8), alpha(C.sai, 0.55)]);
    donut($("#chCls", root), ["Fixo", "Variável", "Cartão"], [R.fixo, R.variavel, R.cartao], [C.fixo, C.variavel, C.cartao]);
    const rc = Object.entries(R.porCatRec).sort((x, y) => y[1] - x[1]); const dc = Object.entries(R.porCat).filter(([k]) => F.cat(k).natureza !== "investimento").sort((x, y) => y[1] - x[1]).slice(0, 12);
    barra($("#chRecCat", root), rc.map((x) => x[1]), rc.map((x) => alpha(F.cat(x[0]).cor, 0.8)), rc.map((x) => F.cat(x[0]).nome));
    barra($("#chDesCat", root), dc.map((x) => x[1]), dc.map((x) => alpha(F.cat(x[0]).cor, 0.8)), dc.map((x) => F.cat(x[0]).nome), true);
    const crp = Array.from({ length: 12 }, (_, i) => F.mesSeg(monthKey(h), i)); const pr = crp.map(() => 0), pp = crp.map(() => 0);
    pend.forEach((p) => { const mk = p.data < h ? monthKey(h) : monthKey(p.data); const i = crp.indexOf(mk); if (i < 0 || p.tipo === "transferencia") return; if (p.tipo === "receita") pr[i] += p.valor; else pp[i] += p.valor; });
    ERP.chart($("#chCRP", root), { type: "bar", data: { labels: crp.map((m) => MES[+m.slice(5) - 1]), datasets: [{ label: "Contas a Receber", data: pr, backgroundColor: alpha(C.ent, 0.6), borderRadius: 3 }, { label: "Contas a Pagar", data: pp, backgroundColor: alpha(C.acu, 0.6), borderRadius: 3 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { boxWidth: 10 } }, tooltip: tip, datalabels: DL }, scales: { x: { grid: { display: false } }, y: Object.assign({}, eixoR$, { grace: "10%" }) } } });
  }

  /* ações da lista (✓ pagar · ↺ desfazer · ✎ editar · ✕ excluir) */
  function acoesLista(root) {
    $$("[data-pay]", root).forEach((b) => (b.onclick = () => U.pagar(b.dataset.pay)));
    $$("[data-est]", root).forEach((b) => (b.onclick = () => U.estornar(b.dataset.est)));
    $$("[data-ed]", root).forEach((b) => (b.onclick = () => U.lancForm(D().lanc.find((x) => x.id === b.dataset.ed))));
    $$("[data-del]", root).forEach((b) => (b.onclick = () => {
      const l = D().lanc.find((x) => x.id === b.dataset.del); if (!l) return;
      if (F.travado(l)) { ERP.toast("Mês fechado: reabra em Cadastros › Fechamento."); return; }
      if (l.tipo !== "pagfatura" && l.tipo !== "ajuste" && l.tipo !== "estorno") { const m = U.lancForm(l); if (m) { const del = $("[data-del]", m.el); if (del) del.click(); } return; }
      ERP.confirm(`Excluir "${l.desc}"?`, "Excluir").then((ok) => { if (!ok) return; U.salvar((d) => { d.lanc = d.lanc.filter((x) => x.id !== l.id); }); ERP.render(); });
    }));
  }

  /* ---------- EXTRATOS (Entradas, Saídas, Fixos, Variáveis, Cartão) ---------- */
  const EXT = { entradas: ["Extrato de Entradas", "--ok"], saidas: ["Extrato de Saídas", "--err"], fixos: ["Custos Fixos", null, "fixo"], variaveis: ["Custos Variáveis", null, "variavel"], cartao: ["Cartão de crédito", null, "cartao"] };
  function pExtratos(root) {
    const C = CORES(); const [tit, tok, ck] = EXT[S.ext]; const cor = tok ? ERP.cor(tok) : C[ck];
    const L = lancsPeriodo(S.ext); const tot = L.reduce((s, x) => s + x.v, 0); const nM = new Set(L.map((x) => monthKey(x.dt))).size || 1;
    const fim = S.pMes ? S.pAno + "-" + ERP.p2(S.pMes) : (S.pAno === new Date().getFullYear() ? monthKey(todayISO()) : S.pAno + "-12");
    const seis = Array.from({ length: 6 }, (_, i) => F.mesSeg(fim, i - 5));
    const salvo = { pMes: S.pMes, pAno: S.pAno };
    const porMes = seis.map((mk) => { S.pAno = +mk.slice(0, 4); S.pMes = +mk.slice(5); return lancsPeriodo(S.ext).reduce((s, x) => s + x.v, 0); }); Object.assign(S, salvo);
    root.innerHTML = ERP.pagehead("Extratos") + `<div class="fp-tabs">${Object.entries(EXT).map(([k, v]) => `<button class="${S.ext === k ? "on" : ""}" data-ext="${k}">${v[0].replace("Extrato de ", "")}</button>`).join("")}<a href="#/financas/agenda">A pagar</a><a href="#/financas/dividas">Dívidas</a><a href="#/patrimonio">Patrimônio</a></div>
      <h2 class="fp-ttl" style="--vc:${cor}">${tit}</h2>
      <div class="fp-stats"><span>Total no período<b>${brl(tot)}</b></span><span>Lançamentos<b>${L.length}</b></span>${!S.pMes && nM > 1 ? `<span>Média por mês ativo<b>${brl(tot / nM)}</b></span>` : ""}<span>Período<b>${perLbl()}</b></span><span>Regime<b>${reg() === "caixa" ? "Caixa (realizados)" : "Com previstos"}</b></span></div>
      ${filtros()}
      <div class="card"><h3 class="fp-h3">Evolução por mês <small>últimos 6 meses · ${esc(tit)}</small></h3>${canvas("chExt", 230)}</div>
      <div class="card" style="padding:0">${L.length ? `<div class="tw" style="border:0"><table><thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Conta / cartão</th><th>Situação</th><th class="r">Valor</th><th></th></tr></thead><tbody>${L.map(({ l, dt, v }) => `<tr><td>${fdate(dt)}</td><td><b>${esc(l.desc)}</b>${l.notas ? `<div class="mut fin-sub">${esc(l.notas)}</div>` : ""}</td><td class="mut">${l.catId ? esc(F.cat(l.catId).nome) : l.tipo === "pagfatura" ? "Pagamento de fatura" : ""}</td><td class="mut">${l.cartaoId ? "💳 " + esc((F.cartao(l.cartaoId) || {}).nome || "") : "🏦 " + esc((F.conta(l.contaId) || {}).nome || "")}</td><td>${U.pill(F.situacao(l))}</td><td class="r ${l.tipo === "receita" ? "pos" : "neg"}"><b>${brl(v)}</b></td><td class="r fp-acts">${["receita", "despesa"].includes(l.tipo) ? (l.pago ? `<button class="ib" data-est="${l.id}" title="Desfazer pagamento">↺</button>` : `<button class="ib ok" data-pay="${l.id}" title="Pagar / receber">✓</button>`) : ""}${["receita", "despesa", "compra"].includes(l.tipo) ? `<button class="ib" data-ed="${l.id}" title="Editar">✎</button>` : ""}</td></tr>`).join("")}</tbody></table></div><div class="fp-foot"><span>${L.length} lançamento(s) · ${perLbl()}</span><span>Total: <b>${brl(tot)}</b></span></div>` : `<div class="empty">Nada em ${esc(tit.toLowerCase())} no período.</div>`}</div>`;
    $$("[data-ext]", root).forEach((b) => (b.onclick = () => { S.ext = b.dataset.ext; ERP.render(); }));
    bindFiltros(root); acoesLista(root);
    ERP.chart($("#chExt", root), { type: "bar", data: { labels: seis.map((m) => monthLabel(m)), datasets: [{ data: porMes, backgroundColor: alpha(cor, 0.8), borderRadius: 4 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => " " + brl(c.parsed.y) } }, datalabels: DL }, scales: { x: { grid: { display: false } }, y: Object.assign({}, eixoR$, { grace: "10%" }) } } });
  }

  /* encaixa no módulo: o Painel passa a ser este; Extratos entra logo depois */
  const mod = ERP.modules.find((m) => m.id === "financas");
  mod.pages[0] = { id: "painel", label: "Painel", render: pPainel };
  mod.pages.splice(1, 0, { id: "extratos", label: "Extratos", render: pExtratos });
  ERP.finPainel = { lancsPeriodo, caixaMes, conferirSaldo };
})();
