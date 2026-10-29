/* Finanças Pessoais — modelo de dados e cálculos (sem tela).
   Ideias trazidas do Piloto 3.0 (regimes caixa × competência, faturas pelo fechamento, dívidas com plano, aposentadoria)
   e do ERP Nova Macabu (plano de contas que alimenta a DRE, natureza do gasto, situação da conta com histórico e estorno,
   juros/desconto no pagamento, fechamento do mês com trava, fluxo de caixa projetado, indicadores). */
(function () {
  "use strict";
  const { uid, todayISO, monthKey, addMonths, p2, Store } = ERP;

  /* ---------- plano de contas pessoal ----------
     natureza: essencial (necessidades) · estilo (estilo de vida) · financeiro (juros, tarifas, dívidas) · investimento (destinação, fora do resultado)
     fixo: true = se repete todo mês com valor estável */
  const PLANO = [
    ["Receitas", "receita", null, [["Salário / pró-labore", 1], ["Distribuição de lucros", 0], ["Renda extra / freelance", 0], ["Rendimentos financeiros", 0], ["Aluguéis recebidos", 1], ["Reembolsos", 0], ["Outras receitas", 0]]],
    ["Moradia", "despesa", "essencial", [["Aluguel / financiamento", 1], ["Condomínio", 1], ["IPTU", 1], ["Energia", 1], ["Água", 1], ["Gás", 1], ["Internet e telefone", 1], ["Manutenção da casa", 0]]],
    ["Alimentação", "despesa", "essencial", [["Mercado", 0], ["Feira e padaria", 0]]],
    ["Transporte", "despesa", "essencial", [["Combustível", 0], ["Estacionamento e pedágio", 0], ["Aplicativo / táxi", 0], ["Seguro, IPVA e licenciamento", 1], ["Manutenção do veículo", 0]]],
    ["Saúde", "despesa", "essencial", [["Plano de saúde", 1], ["Farmácia", 0], ["Consultas e exames", 0]]],
    ["Educação", "despesa", "essencial", [["Cursos e faculdade", 1], ["Livros e material", 0]]],
    ["Família e pets", "despesa", "essencial", [["Pets", 0], ["Família", 0]]],
    ["Estilo de vida", "despesa", "estilo", [["Restaurantes e delivery", 0], ["Lazer", 0], ["Viagens", 0], ["Assinaturas e streaming", 1], ["Vestuário", 0], ["Cuidados pessoais", 0], ["Academia e esporte", 1], ["Presentes", 0], ["Compras diversas", 0]]],
    ["Impostos", "despesa", "essencial", [["Imposto de renda", 0], ["Outros impostos e taxas", 0]]],
    ["Financeiro", "despesa", "financeiro", [["Juros e multas", 0], ["Tarifas bancárias", 1], ["Cheque especial e IOF", 0], ["Parcelas de dívidas", 1]]],
    ["Investimentos e reservas", "despesa", "investimento", [["Aportes em investimentos", 1], ["Reserva de emergência", 1], ["Previdência", 1]]],
    ["Doações", "despesa", "estilo", [["Doações e dízimo", 0]]],
    ["Investimentos e reservas", "receita", "investimento", [["Resgates de investimentos", 0]]],   /* resgate: volta para a conta sem ser receita do mês */
  ];
  const CORES = { Receitas: "#197A46", Moradia: "#0E5E6F", "Alimentação": "#C2643B", Transporte: "#3F6DB3", "Saúde": "#B44B6E", "Educação": "#3A8F7E", "Família e pets": "#A0703C", "Estilo de vida": "#8A63C2", Impostos: "#7A7A7A", Financeiro: "#B3271E", "Investimentos e reservas": "#0B1628", "Doações": "#5E7C8D" };
  function planoPadrao() {
    const cats = []; let i = 0;
    PLANO.forEach(([grupo, tipo, nat, itens]) => itens.forEach(([nome, fixo]) => cats.push({ id: "c" + (++i), nome, grupo, tipo, natureza: tipo === "receita" ? (nat || "receita") : nat, fixo: !!fixo, cor: CORES[grupo] || "#5B6068", ativa: true })));
    return cats;
  }
  const NAT = { receita: "Receita", essencial: "Necessidades", estilo: "Estilo de vida", financeiro: "Financeiro", investimento: "Investimentos e reservas" };
  const DIVIDA_CAT = "c" + (PLANO.slice(0, 10).reduce((s, g) => s + g[3].length, 0)); /* "Parcelas de dívidas" */

  ERP.defaults.financas = {
    schema: 1,
    cfg: { reservaMeses: 6, regime: "caixa", idade: 40, idadeApos: 60, rendaDesejada: 15000, retornoReal: 4, aporteApos: 2000, alertaCartao: 80 },
    contas: [{ id: "ct_principal", nome: "Conta principal", tipo: "corrente", banco: "", saldoIni: 0, dataIni: todayISO(), limite: 0, jurosCheque: 8, ativa: true }],
    cartoes: [], categorias: planoPadrao(), lanc: [], series: [], dividas: [], orcamento: { padrao: {}, meses: {} }, metas: [], fechados: {},
  };
  const D = () => Store.get("financas");

  /* ---------- utilitários de data ---------- */
  const hoje = () => todayISO();
  const addDias = (iso, n) => { const [y, m, d] = iso.split("-").map(Number); const t = new Date(y, m - 1, d + n); return t.getFullYear() + "-" + p2(t.getMonth() + 1) + "-" + p2(t.getDate()); };
  const diaNoMes = (mk, dia) => { const [y, m] = mk.split("-").map(Number); return mk + "-" + p2(Math.min(+dia || 1, new Date(y, m, 0).getDate())); };
  const mesSeg = (mk, n) => monthKey(addMonths(mk + "-01", n));
  const diasEntre = (a, b) => Math.round((new Date(b + "T12:00") - new Date(a + "T12:00")) / 864e5);
  const r2 = (v) => Math.round((+v || 0) * 100) / 100;

  /* ---------- consultas ---------- */
  const cat = (id) => D().categorias.find((c) => c.id === id) || { nome: "Sem categoria", grupo: "—", natureza: "estilo", cor: "#9AA5B1", tipo: "despesa" };
  const conta = (id) => D().contas.find((c) => c.id === id);
  const cartao = (id) => D().cartoes.find((c) => c.id === id);

  /* fatura de uma compra: fecha no dia "fecha"; compra no dia do fechamento ou depois vai para a fatura seguinte (Piloto 3.0) */
  function faturaDe(c, iso) {
    const [y, m, d] = iso.split("-").map(Number); let mk = y + "-" + p2(m);
    if (d >= (+c.fecha || 1)) mk = mesSeg(mk, 1);
    const fecha = diaNoMes(mk, c.fecha);
    const vmk = (+c.vence || 10) <= (+c.fecha || 1) ? mesSeg(mk, 1) : mk;
    return { key: mk, fecha, vence: diaNoMes(vmk, c.vence) };
  }
  /* situação de um lançamento (a mesma linguagem da CAP) */
  function situacao(l) {
    if (l.tipo === "compra") return { k: "cartao", n: "No cartão", cls: "info" };
    if (l.tipo === "estorno") return { k: "cartao", n: "Estorno no cartão", cls: "ok" };
    if (l.tipo === "ajuste") return { k: "pago", n: "Ajuste", cls: "" };
    if (l.pago) return { k: "pago", n: l.tipo === "receita" ? "Recebido" : "Pago", cls: "ok" };
    const h = hoje();
    if (l.venc < h) return { k: "vencido", n: "Vencido", cls: "err" };
    if (l.venc === h) return { k: "hoje", n: "Vence hoje", cls: "warn" };
    if (l.venc <= addDias(h, 7)) return { k: "semana", n: "Em " + diasEntre(h, l.venc) + " dia(s)", cls: "warn" };
    return { k: "previsto", n: "Previsto", cls: "" };
  }
  /* data do lançamento em cada regime */
  const dataCaixa = (l) => l.pago || l.venc;
  const dataComp = (l) => l.comp || l.venc;
  const naDRE = (l) => l.tipo === "receita" || l.tipo === "despesa" || l.tipo === "compra" || l.tipo === "estorno";

  /* faturas de um cartão */
  function faturas(cid) {
    const d = D(); const c = cartao(cid); if (!c) return [];
    const map = {};
    d.lanc.forEach((l) => {
      if (l.cartaoId !== cid || (l.tipo !== "compra" && l.tipo !== "estorno")) return;
      const k = l.fatura; const f = (map[k] = map[k] || Object.assign(faturaPorChave(c, k), { itens: [], total: 0 }));
      f.itens.push(l); f.total += l.tipo === "estorno" ? -l.valor : l.valor;
    });
    d.lanc.forEach((l) => { if (l.tipo === "pagfatura" && l.cartaoId === cid && !map[l.fatura]) map[l.fatura] = Object.assign(faturaPorChave(c, l.fatura), { itens: [], total: 0 }); });
    const h = hoje();
    return Object.values(map).map((f) => {
      f.total = r2(f.total);
      f.pagto = d.lanc.find((l) => l.tipo === "pagfatura" && l.cartaoId === cid && l.fatura === f.key) || null;
      f.status = f.pagto && f.pagto.pago ? "paga" : f.vence < h ? "vencida" : h >= f.fecha ? "fechada" : "aberta";
      f.itens.sort((a, b) => b.comp.localeCompare(a.comp));
      return f;
    }).sort((a, b) => b.key.localeCompare(a.key));
  }
  function faturaPorChave(c, mk) { const vmk = (+c.vence || 10) <= (+c.fecha || 1) ? mesSeg(mk, 1) : mk; return { key: mk, fecha: diaNoMes(mk, c.fecha), vence: diaNoMes(vmk, c.vence), cartaoId: c.id }; }
  const faturasAbertas = () => D().cartoes.flatMap((c) => faturas(c.id).filter((f) => f.status !== "paga" && f.total > 0.004).map((f) => Object.assign({ cartao: c }, f)));
  const usoCartao = (cid) => faturas(cid).filter((f) => f.status !== "paga").reduce((s, f) => s + f.total, 0);

  /* saldo de uma conta numa data (inclusive) — só o que foi pago/recebido */
  function saldoConta(id, ate) {
    const c = conta(id); if (!c) return 0; ate = ate || hoje(); let s = +c.saldoIni || 0;
    D().lanc.forEach((l) => {
      if (!l.pago || l.pago > ate || l.pago < (c.dataIni || "0000")) return;
      if (l.tipo === "transferencia") { if (l.contaId === id) s -= l.valor; if (l.paraId === id) s += l.valor; return; }
      if (l.tipo === "ajuste") { if (l.contaId === id) s += l.valor; return; }   /* conferência com o extrato (valor com sinal) */
      if (l.contaId !== id) return;
      const v = l.valorPago != null ? l.valorPago : l.valor;
      if (l.tipo === "receita") s += v; else if (l.tipo === "despesa" || l.tipo === "pagfatura") s -= v;
    });
    return r2(s);
  }
  const contasAtivas = () => D().contas.filter((c) => c.ativa !== false);
  const saldoTotal = () => contasAtivas().filter((c) => c.tipo !== "reserva").reduce((s, c) => s + saldoConta(c.id), 0);
  const saldoReservas = () => contasAtivas().filter((c) => c.tipo === "reserva").reduce((s, c) => s + saldoConta(c.id), 0);

  /* resultado de um mês (DRE pessoal), no regime pedido */
  function dreMes(mk, regime) {
    regime = regime || D().cfg.regime;
    const r = { rec: 0, essencial: 0, estilo: 0, financeiro: 0, investimento: 0, fixo: 0, variavel: 0, cartao: 0, porCat: {}, porCatRec: {}, n: 0, nE: 0, nS: 0 };
    const cls = (l, c, v, noCartao) => { if (c.natureza === "investimento") return; const k = noCartao ? "cartao" : (l.classe || (c.fixo ? "fixo" : "variavel")); r[k] += v; };
    D().lanc.forEach((l) => {
      if (!naDRE(l)) return;
      if (regime === "caixa" && (l.tipo === "compra" || l.tipo === "estorno")) return;   /* no caixa, o cartão entra pelo pagamento da fatura */
      if (regime === "caixa" && !l.pago) return;
      const dt = regime === "caixa" ? dataCaixa(l) : dataComp(l);
      if (monthKey(dt) !== mk) return;
      const c = cat(l.catId); const v = l.tipo === "estorno" ? -l.valor : (l.valorPago != null && regime === "caixa" ? l.valorPago : l.valor);
      r.n++;
      if (l.tipo === "receita") { if (c.natureza === "investimento") { r.investimento -= v; return; } r.rec += v; r.nE++; r.porCatRec[l.catId] = (r.porCatRec[l.catId] || 0) + v; return; }
      r.nS++; r[c.natureza] = (r[c.natureza] || 0) + v; r.porCat[l.catId] = (r.porCat[l.catId] || 0) + v;
      cls(l, c, v, l.tipo === "compra" || l.tipo === "estorno");
    });
    if (regime === "caixa") {   /* pagamento de fatura: despesa de cartão no caixa, rateada pelas categorias das compras */
      D().lanc.forEach((l) => {
        if (l.tipo !== "pagfatura" || !l.pago || monthKey(l.pago) !== mk) return;
        const f = faturas(l.cartaoId).find((x) => x.key === l.fatura); const pago = l.valorPago != null ? l.valorPago : l.valor;
        const base = f && f.total > 0 ? f.itens : []; r.n++; r.nS++;
        if (!base.length) { r.estilo += pago; r.cartao += pago; return; }
        const fator = pago / f.total;
        base.forEach((it) => { const c = cat(it.catId); const v = (it.tipo === "estorno" ? -it.valor : it.valor) * fator; r[c.natureza] = (r[c.natureza] || 0) + v; r.porCat[it.catId] = (r.porCat[it.catId] || 0) + v; cls(it, c, v, true); });
      });
    }
    r.consumo = r.essencial + r.estilo;
    r.operacional = r.rec - r.consumo;
    r.resultado = r.operacional - r.financeiro;
    r.livre = r.resultado - r.investimento;
    r.despesas = r.consumo + r.financeiro;
    r.poupanca = r.rec > 0 ? (r.investimento + Math.max(0, r.livre)) / r.rec * 100 : 0;
    return r;
  }

  /* soma de vários meses (ano todo ou janela) */
  function drePeriodo(mks, regime) {
    const t = { porCat: {}, porCatRec: {} }; const nums = ["rec", "essencial", "estilo", "financeiro", "investimento", "fixo", "variavel", "cartao", "n", "nE", "nS", "consumo", "operacional", "resultado", "livre", "despesas"];
    nums.forEach((k) => (t[k] = 0));
    mks.forEach((mk) => { const r = dreMes(mk, regime); nums.forEach((k) => (t[k] += r[k] || 0)); ["porCat", "porCatRec"].forEach((g) => Object.entries(r[g]).forEach(([k, v]) => (t[g][k] = (t[g][k] || 0) + v))); });
    t.poupanca = t.rec > 0 ? (t.investimento + Math.max(0, t.livre)) / t.rec * 100 : 0;
    return t;
  }
  /* saldo das contas do dia a dia numa data (sem as reservas) — base do gráfico de desempenho */
  const saldoEm = (dt) => contasAtivas().filter((c) => c.tipo !== "reserva").reduce((s, c) => s + saldoConta(c.id, dt), 0);
  function historicoSaldo(ini) {
    const h = hoje(); const ids = new Set(contasAtivas().filter((c) => c.tipo !== "reserva").map((c) => c.id));
    const datas = [...new Set(D().lanc.filter((l) => l.pago && l.pago > ini && l.pago <= h && (ids.has(l.contaId) || ids.has(l.paraId))).map((l) => l.pago))].sort();
    return [ini].concat(datas).concat(datas[datas.length - 1] === h || ini === h ? [] : [h]).map((d) => ({ d, v: r2(saldoEm(d)) }));
  }

  /* pendências (contas a pagar e a receber) + faturas */
  function pendencias() {
    const itens = D().lanc.filter((l) => !l.pago && (l.tipo === "receita" || l.tipo === "despesa" || l.tipo === "transferencia")).map((l) => ({ k: "l", l, data: l.venc, valor: l.valor, desc: l.desc, tipo: l.tipo }));
    faturasAbertas().forEach((f) => { if (f.pagto && f.pagto.pago) return; itens.push({ k: "f", f, data: f.vence, valor: f.total, desc: "Fatura " + f.cartao.nome + " · " + ERP.monthLabel(f.key), tipo: "despesa" }); });
    return itens.sort((a, b) => a.data.localeCompare(b.data));
  }

  /* fluxo de caixa projetado: saldo de hoje + pendências por data (atrasadas contam hoje) */
  function projecao(meses) {
    meses = meses || 12; const h = hoje(); const ini = saldoTotal(); const fim = diaNoMes(mesSeg(monthKey(h), meses - 1), 31);
    const ev = pendencias().map((p) => {
      let v = p.tipo === "receita" ? p.valor : -p.valor;
      if (p.k === "l" && p.l.tipo === "transferencia") { const de = conta(p.l.contaId), para = conta(p.l.paraId); v = 0; if (de && de.tipo !== "reserva") v -= p.valor; if (para && para.tipo !== "reserva") v += p.valor; }
      return { data: p.data < h ? h : p.data, v, desc: p.desc };
    }).filter((e) => e.data <= fim).sort((a, b) => a.data.localeCompare(b.data));
    const porMes = []; let s = ini, min = { v: ini, data: h };
    for (let i = 0; i < meses; i++) {
      const mk = mesSeg(monthKey(h), i); const es = ev.filter((e) => monthKey(e.data) === mk);
      const ent = es.filter((e) => e.v > 0).reduce((a, e) => a + e.v, 0), sai = -es.filter((e) => e.v < 0).reduce((a, e) => a + e.v, 0);
      es.forEach((e) => { s += e.v; if (s < min.v) min = { v: s, data: e.data }; });
      porMes.push({ mk, ent, sai, saldo: s });
    }
    /* juros estimados do cheque especial: saldo negativo médio do mês × taxa */
    const jurosAm = (contasAtivas()[0] || {}).jurosCheque || 0;
    porMes.forEach((m) => { m.juros = m.saldo < 0 ? -m.saldo * jurosAm / 100 : 0; });
    return { ini, porMes, min, ev };
  }

  /* orçamento do mês por categoria */
  const orcado = (mk, cid) => { const o = D().orcamento; const m = o.meses[mk] || {}; return m[cid] != null ? +m[cid] : +(o.padrao[cid] || 0); };
  function orcamentoMes(mk) {
    const real = dreMes(mk, "competencia"); const d = D();
    const prev = {}; d.lanc.forEach((l) => { if (!l.pago && l.tipo === "despesa" && monthKey(l.venc) === mk) prev[l.catId] = (prev[l.catId] || 0) + l.valor; });
    return d.categorias.filter((c) => c.tipo === "despesa" && c.ativa !== false).map((c) => {
      const o = orcado(mk, c.id), r = real.porCat[c.id] || 0, p = prev[c.id] || 0;   /* previstos já entram na competência; "p" mostra o que falta pagar */
      return { c, orcado: o, realizado: r, pendente: p, pct: o > 0 ? r / o * 100 : (r > 0 ? 999 : 0) };
    }).filter((x) => x.orcado > 0 || x.realizado > 0);
  }

  /* média mensal das despesas essenciais (últimos 6 meses fechados, competência) — base da reserva de emergência */
  function mediaEssencial(n) {
    n = n || 6; let s = 0, k = 0; const mk = monthKey(hoje());
    for (let i = 1; i <= n; i++) { const r = dreMes(mesSeg(mk, -i), "competencia"); if (r.n) { s += r.essencial + r.financeiro; k++; } }
    if (!k) { const r = dreMes(mk, "competencia"); return r.essencial + r.financeiro; }
    return s / k;
  }

  /* ---------- dívidas ---------- */
  function dividaInfo(dv) {
    const ls = D().lanc.filter((l) => l.dividaId === dv.id && l.tipo === "despesa");
    const abertas = ls.filter((l) => !l.pago).sort((a, b) => a.venc.localeCompare(b.venc)), pagas = ls.filter((l) => l.pago);
    const i = (+dv.taxa || 0) / 100;
    const nominal = abertas.reduce((s, l) => s + l.valor, 0);
    const saldo = i > 0 ? abertas.reduce((s, l, k) => s + l.valor / Math.pow(1 + i, k + 1), 0) : nominal;   /* valor presente das parcelas */
    return { abertas, pagas, rest: abertas.length, nominal: r2(nominal), saldo: r2(saldo), juros: r2(nominal - saldo), proxima: abertas[0] || null, ultima: abertas[abertas.length - 1] || null, atraso: abertas.filter((l) => l.venc < hoje()).length };
  }
  /* simulação: pagar o mínimo de todas + um extra mensal na dívida da vez (avalanche = maior juros; bola de neve = menor saldo) */
  function simularDividas(extra, metodo) {
    const ds = D().dividas.map((dv) => { const inf = dividaInfo(dv); return { id: dv.id, nome: dv.nome, saldo: inf.saldo, taxa: (+dv.taxa || 0) / 100, parcela: inf.proxima ? inf.proxima.valor : 0, prio: { Alta: 0, "Média": 1, Baixa: 2 }[dv.prioridade] ?? 1 }; }).filter((x) => x.saldo > 0.01 && x.parcela > 0);
    let mes = 0, juros = 0; const quit = {};
    const ordem = () => ds.filter((x) => x.saldo > 0.01).sort((a, b) => metodo === "neve" ? a.saldo - b.saldo : metodo === "prioridade" ? a.prio - b.prio || a.saldo - b.saldo : b.taxa - a.taxa || a.saldo - b.saldo);
    while (ds.some((x) => x.saldo > 0.01) && mes < 600) {
      mes++; let sobra = +extra || 0;
      ds.forEach((x) => { if (x.saldo <= 0.01) return; const j = x.saldo * x.taxa; juros += j; x.saldo += j; const pg = Math.min(x.parcela, x.saldo); x.saldo -= pg; if (x.saldo <= 0.01) { sobra += x.parcela - pg; } });
      for (const x of ordem()) { if (sobra <= 0) break; const pg = Math.min(sobra, x.saldo); x.saldo -= pg; sobra -= pg; }
      ds.forEach((x) => { if (x.saldo <= 0.01 && !quit[x.id]) { quit[x.id] = mes; x.saldo = 0; sobra += 0; } });
      /* parcela de quem quitou vira extra para as próximas (efeito bola de neve) */
      ds.forEach((x) => { if (quit[x.id] === mes) extra = (+extra || 0) + x.parcela; });
    }
    return { meses: mes, juros: r2(juros), quit };
  }

  /* ---------- recorrências: materializa os previstos até 12 meses à frente ---------- */
  function materializar(d) {
    const lim = mesSeg(monthKey(hoje()), 12); let mudou = false;
    d.series.forEach((s) => {
      if (s.ativa === false) return;
      let mk = monthKey(s.inicio); const fim = s.fim ? monthKey(s.fim) : lim; const ate = fim < lim ? fim : lim;
      const ja = new Set(d.lanc.filter((l) => l.serieId === s.id).map((l) => l.serieMes));
      const pul = new Set(s.pulados || []);
      while (mk <= ate) {
        if (!ja.has(mk) && !pul.has(mk)) { d.lanc.push(novoLanc(s, mk)); mudou = true; }
        mk = mesSeg(mk, 1);
      }
    });
    return mudou;
  }
  function novoLanc(s, mk) {
    const dt = diaNoMes(mk, s.dia); const base = { id: uid("l"), serieId: s.id, serieMes: mk, desc: s.desc, catId: s.catId, forma: s.forma || "", classe: s.classe || "", valor: r2(s.valor), criado: Date.now(), hist: [{ em: new Date().toISOString(), o: "Criado pela recorrência" }] };
    if (s.cartaoId) { const c = cartao(s.cartaoId) || D().cartoes.find((x) => x.id === s.cartaoId); return Object.assign(base, { tipo: "compra", cartaoId: s.cartaoId, comp: dt, venc: dt, fatura: c ? faturaDe(c, dt).key : mk, pago: null }); }
    return Object.assign(base, { tipo: s.tipo, contaId: s.contaId, paraId: s.paraId || "", comp: dt, venc: dt, pago: null });
  }

  /* ---------- fechamento do mês (trava, como na CAP) ---------- */
  const mesFechado = (mk) => !!D().fechados[mk];
  function travado(l) { return [dataComp(l), dataCaixa(l), l.pago].filter(Boolean).some((dt) => mesFechado(monthKey(dt))); }

  /* categorias novas do plano padrão entram nos dados já existentes (pelo nome) */
  ERP.onBoot = (ERP.onBoot || []).concat(() => { const d = D(); const faltam = planoPadrao().filter((c) => !d.categorias.some((x) => x.nome === c.nome)); if (faltam.length) Store.change("financas", (dd) => faltam.forEach((c) => dd.categorias.push(Object.assign({}, c, { id: uid("c") })))); });

  ERP.fin = { D, PLANO, NAT, DIVIDA_CAT, cat, drePeriodo, saldoEm, historicoSaldo, conta, cartao, faturaDe, faturaPorChave, faturas, faturasAbertas, usoCartao, situacao, dataCaixa, dataComp, saldoConta, saldoTotal, saldoReservas, contasAtivas,
    dreMes, pendencias, projecao, orcado, orcamentoMes, mediaEssencial, dividaInfo, simularDividas, materializar, novoLanc, mesFechado, travado, hoje, addDias, diaNoMes, mesSeg, diasEntre, r2 };
  /* compatibilidade com Início e Patrimônio */
  ERP.custos = { monthFlow: (mk) => { const r = dreMes(mk); return { rec: r.rec, desp: r.despesas + r.investimento }; }, accounts: () => contasAtivas().map((c) => ({ id: c.id, type: c.tipo })), accBalance: (id) => saldoConta(id), billsOpen: () => pendencias().filter((p) => p.tipo === "despesa").map((p) => ({ due: p.data, desc: p.desc, amount: p.valor })) };
})();
