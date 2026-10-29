/* Finanças Pessoais — telas (painel, lançamentos, agenda, cartões, fluxo de caixa, orçamento, dívidas, metas e planejamento, relatórios, cadastros) */
(function () {
  "use strict";
  const { $, $$, esc, uid, brl, num, todayISO, fdate, monthKey, monthLabel, addMonths, parseNum, Store } = ERP;
  const F = ERP.fin;
  const D = F.D;
  const S = { mk: monthKey(todayISO()), q: "", tipo: "", sit: "", cat: "", origem: "", card: "", ano: new Date().getFullYear(), extra: 500, metodo: "avalanche", agenda: "pagar", dreAno: new Date().getFullYear(), sel: new Set() };
  const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const hist = (l, o) => { (l.hist = l.hist || []).push({ em: new Date().toISOString(), o }); };
  const salvar = (fn) => Store.change("financas", (d) => { fn(d); F.materializar(d); });

  /* ---------- peças de tela ---------- */
  const pill = (s) => `<span class="pill ${s.cls}">${esc(s.n)}</span>`;
  const sinal = (v) => `<span class="${v < 0 ? "neg" : v > 0 ? "pos" : ""}">${brl(v)}</span>`;
  const mesNav = () => `<button class="btn ghost sm" data-mes="-1" aria-label="Mês anterior">‹</button><b class="fin-mes">${monthLabel(S.mk)}</b><button class="btn ghost sm" data-mes="1" aria-label="Próximo mês">›</button>`;
  const bindMes = (root) => $$("[data-mes]", root).forEach((b) => (b.onclick = () => { S.mk = F.mesSeg(S.mk, +b.dataset.mes); ERP.render(); }));
  const catOpts = (tipo, sel) => { const out = []; let g = ""; D().categorias.filter((c) => c.ativa !== false && (!tipo || c.tipo === tipo || (tipo === "despesa" && c.tipo === "despesa"))).forEach((c) => { if (c.grupo !== g) { g = c.grupo; out.push(["__grp", g]); } out.push([c.id, c.nome]); }); return out; };
  const origemOpts = (comCartao) => F.contasAtivas().map((c) => ["ct:" + c.id, "🏦 " + c.nome]).concat(comCartao ? D().cartoes.filter((c) => c.ativo !== false).map((c) => ["cc:" + c.id, "💳 " + c.nome]) : []);
  const regimeTgl = () => `<div class="tabs fin-tgl" role="group" aria-label="Regime"><button class="${D().cfg.regime === "caixa" ? "on" : ""}" data-reg="caixa" title="Quando o dinheiro entra e sai da conta">Caixa</button><button class="${D().cfg.regime === "competencia" ? "on" : ""}" data-reg="competencia" title="Quando a despesa acontece (compra no cartão conta na data da compra; inclui previstos)">Competência</button></div>`;
  const bindReg = (root) => $$("[data-reg]", root).forEach((b) => (b.onclick = () => { Store.change("financas", (d) => { d.cfg.regime = b.dataset.reg; }); ERP.render(); }));

  /* gráfico de barras pares (azul = entradas, laranja = saídas) */
  function barras(pts) {
    const mx = Math.max(1, ...pts.map((p) => Math.max(p.a, p.b)));
    return `<div class="cols6">${pts.map((p) => `<div class="c"><div class="pair"><i style="height:${(p.a / mx) * 100}%" title="${esc(p.l)} · entradas ${brl(p.a)}"></i><i class="o" style="height:${(p.b / mx) * 100}%" title="${esc(p.l)} · saídas ${brl(p.b)}"></i></div><small>${esc(p.l)}</small></div>`).join("")}</div>`;
  }
  /* linha do saldo projetado (SVG, com linha do zero) */
  function linha(pts) {
    const W = 640, H = 170, pad = 30; if (!pts.length) return "";
    const vs = pts.map((p) => p.v); const mx = Math.max(0, ...vs), mn = Math.min(0, ...vs); const rg = mx - mn || 1;
    const x = (i) => pad + (i * (W - pad * 2)) / Math.max(1, pts.length - 1), y = (v) => 12 + ((mx - v) * (H - 34)) / rg;
    const path = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
    const area = path + ` L${x(pts.length - 1).toFixed(1)},${y(0).toFixed(1)} L${x(0).toFixed(1)},${y(0).toFixed(1)} Z`;
    return `<div class="tw" style="border:0"><svg viewBox="0 0 ${W} ${H}" class="fin-svg" role="img" aria-label="Saldo projetado">
      <path d="${area}" class="fin-area"/><line x1="${pad}" x2="${W - pad}" y1="${y(0)}" y2="${y(0)}" class="fin-zero"/>
      <path d="${path}" class="fin-line"/>${pts.map((p, i) => `<circle cx="${x(i)}" cy="${y(p.v)}" r="${i === pts.length - 1 ? 4 : 2.5}" class="${p.v < 0 ? "fin-dot neg" : "fin-dot"}"><title>${esc(p.l)} · ${brl(p.v)}</title></circle>`).join("")}
      ${pts.map((p, i) => (i % Math.ceil(pts.length / 6) === 0 || i === pts.length - 1) ? `<text x="${x(i)}" y="${H - 4}" text-anchor="middle" class="fin-tx">${esc(p.l)}</text>` : "").join("")}
      <text x="${pad - 4}" y="${y(mx) + 4}" text-anchor="end" class="fin-tx">${num(mx / 1000, 0)}k</text><text x="${pad - 4}" y="${y(mn) + 4}" text-anchor="end" class="fin-tx">${num(mn / 1000, 0)}k</text></svg></div>`;
  }

  /* ---------- lançamento: criar / editar ---------- */
  function lancForm(l, pre) {
    const d = D(); const novo = !l; pre = pre || {};
    if (l && F.travado(l)) { ERP.toast("Mês fechado: reabra o mês em Cadastros › Fechamento para alterar."); return; }
    l = l || { tipo: pre.tipo || "despesa", comp: todayISO(), venc: todayISO(), contaId: (F.contasAtivas()[0] || {}).id, catId: pre.catId || "" };
    const origem = l.cartaoId ? "cc:" + l.cartaoId : "ct:" + (l.contaId || "");
    const fields = [
      { k: "tipo", label: "Tipo", type: "select", value: l.tipo === "compra" ? "despesa" : l.tipo, options: [["despesa", "Despesa (−)"], ["receita", "Receita (+)"], ["transferencia", "Transferência entre contas"]] },
      { k: "valor", label: novo ? "Valor (R$) — no parcelado, o total" : "Valor (R$)", type: "number", step: "0.01", value: l.valor, required: true },
      { k: "desc", label: "Descrição", value: l.desc, full: true, required: true, placeholder: "Ex.: Mercado, Aluguel, Salário" },
      { k: "catId", label: "Categoria", type: "select", value: l.catId, options: catOpts("despesa") },
      { k: "origem", label: "Pago com / recebido em", type: "select", value: origem, options: origemOpts(true) },
      { k: "paraId", label: "Para a conta", type: "select", value: l.paraId || "", options: F.contasAtivas().map((c) => [c.id, c.nome]) },
      { k: "forma", label: "Forma de pagamento", type: "select", value: l.forma || "", options: [["", "—"], ["Pix", "Pix"], ["Débito", "Débito"], ["Boleto", "Boleto"], ["Débito automático", "Débito automático"], ["Transferência", "Transferência"], ["Dinheiro", "Dinheiro"], ["Cartão de crédito", "Cartão de crédito"]] },
      { k: "classe", label: "Classificação", type: "select", value: l.classe || "", options: [["", "Pela categoria"], ["fixo", "Custo fixo"], ["variavel", "Custo variável"]], hint: "Fixo se repete todo mês com valor estável; variável oscila com o consumo" },
      { k: "comp", label: "Data da compra / competência", type: "date", value: l.comp, hint: "Quando a despesa aconteceu" },
      { k: "venc", label: "Vencimento", type: "date", value: l.venc, hint: "Quando sai ou entra o dinheiro" },
    ];
    if (novo) fields.push({ k: "parcelas", label: "Parcelas", type: "number", step: "1", value: 1, hint: "No cartão, uma por fatura; na conta, uma por mês" }, { k: "repetir", label: "Recorrência mensal", type: "select", value: "0", options: [["0", "Não se repete"], ["3", "Repetir por 3 meses"], ["6", "Repetir por 6 meses"], ["12", "Repetir por 12 meses"], ["24", "Repetir por 24 meses"], ["1", "Repetir sempre (sem fim)"]] });
    fields.push({ k: "jaPago", label: "Já foi pago / recebido", type: "checkbox", value: novo ? l.venc <= todayISO() : !!l.pago }, { k: "notas", label: "Anotações", value: l.notas, full: true });
    if (!novo && l.serieId) fields.push({ k: "serie", label: "Aplicar a mudança de valor/descrição/categoria às próximas da recorrência", type: "checkbox", value: false, full: true });
    if (!novo && l.hist && l.hist.length) fields.push({ type: "html", k: "_h", html: `<details class="fin-hist"><summary>Histórico (${l.hist.length})</summary>${l.hist.slice().reverse().map((h) => `<div><span class="mut">${new Date(h.em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</span> · ${esc(h.o)}</div>`).join("")}</details>` });
    const m = ERP.form({
      title: novo ? "Novo lançamento" : "Editar lançamento" + (l.parcela ? ` (${l.parcela.n}/${l.parcela.t})` : ""), wide: true, fields,
      extra: !novo && l.serieId ? [{ label: "Cancelar a recorrência a partir deste mês", fn: (v, md) => { ERP.confirm(`Encerrar "${l.desc}" a partir de ${monthLabel(monthKey(l.venc))}? Os lançamentos em aberto deste mês em diante saem; os pagos ficam.`, "Encerrar").then((ok) => { if (!ok) return; md.close(); salvar((dd) => { const s2 = dd.series.find((y) => y.id === l.serieId); if (s2) s2.fim = addMonths(monthKey(l.venc) + "-01", -1); dd.lanc = dd.lanc.filter((y) => !(y.serieId === l.serieId && !y.pago && y.serieMes >= monthKey(l.venc))); }); ERP.toast("Recorrência encerrada."); ERP.render(); }); } }] : null,
      init(fm, md) {
        const sync = () => {
          const t = fm.elements.tipo.value; const o = fm.elements.origem.value; const cc = o.startsWith("cc:");
          fm.elements.catId.innerHTML = catOpts(t === "receita" ? "receita" : "despesa").map((x) => x[0] === "__grp" ? `<optgroup label="${esc(x[1])}"></optgroup>` : `<option value="${x[0]}">${esc(x[1])}</option>`).join("");
          if (l.catId && [...fm.elements.catId.options].some((op) => op.value === l.catId)) fm.elements.catId.value = l.catId;
          md.show("catId", t !== "transferencia"); md.show("paraId", t === "transferencia");
          [...fm.elements.origem.options].forEach((op) => { op.hidden = op.value.startsWith("cc:") && t !== "despesa"; });
          if (t !== "despesa" && cc) fm.elements.origem.value = (fm.elements.origem.options[0] || {}).value;
          md.show("venc", !cc); md.show("jaPago", !(fm.elements.origem.value.startsWith("cc:")));
          md.show("classe", t === "despesa" && !fm.elements.origem.value.startsWith("cc:")); md.show("forma", t !== "transferencia");
          if (fm.elements.origem.value.startsWith("cc:")) fm.elements.forma.value = "Cartão de crédito"; else if (fm.elements.forma.value === "Cartão de crédito") fm.elements.forma.value = "";
        };
        fm.elements.tipo.onchange = sync; fm.elements.origem.onchange = sync;
        fm.elements.comp.onchange = () => { if (novo && fm.elements.venc.value < fm.elements.comp.value) fm.elements.venc.value = fm.elements.comp.value; };
        sync();
      },
      onSubmit(v) {
        if (!(v.valor > 0)) { ERP.toast("Informe um valor maior que zero."); return false; }
        if (!v.desc.trim()) { ERP.toast("Informe a descrição."); return false; }
        const [ok, oid] = v.origem.split(":"); const cc = ok === "cc" && v.tipo === "despesa";
        if (v.tipo === "transferencia" && v.paraId === oid) { ERP.toast("Escolha contas diferentes na transferência."); return false; }
        if (!v.comp) v.comp = todayISO(); if (!v.venc || cc) v.venc = v.comp;
        if (novo && [v.comp, v.venc].some((dt) => F.mesFechado(monthKey(dt)))) { ERP.toast("Esse mês está fechado. Reabra em Cadastros › Fechamento."); return false; }
        salvar((dd) => {
          const base = { desc: v.desc.trim(), catId: v.tipo === "transferencia" ? "" : v.catId, notas: v.notas || "", forma: v.forma || (cc ? "Cartão de crédito" : ""), classe: v.tipo === "despesa" && !cc ? v.classe || "" : "" };
          if (!novo) {
            const x = dd.lanc.find((y) => y.id === l.id); const antes = x.valor;
            Object.assign(x, base, { valor: F.r2(v.valor), comp: v.comp });
            if (x.tipo === "compra") { /* compra no cartão: mantém a fatura das parcelas */ }
            else { x.tipo = v.tipo; x.venc = v.venc; x.contaId = oid; x.paraId = v.tipo === "transferencia" ? v.paraId : ""; if (v.jaPago && !x.pago) { x.pago = v.venc <= todayISO() ? v.venc : todayISO(); x.valorPago = x.valor; hist(x, "Marcado como pago na edição"); } if (!v.jaPago && x.pago) { x.pago = null; x.valorPago = null; hist(x, "Pagamento desfeito na edição"); } }
            hist(x, "Editado" + (antes !== x.valor ? ` (valor ${brl(antes)} → ${brl(x.valor)})` : ""));
            if (v.serie && x.serieId) { const s = dd.series.find((y) => y.id === x.serieId); if (s) { Object.assign(s, { valor: x.valor, desc: x.desc, catId: x.catId }); dd.lanc.forEach((y) => { if (y.serieId === s.id && !y.pago && y.venc > x.venc) { Object.assign(y, { valor: x.valor, desc: x.desc, catId: x.catId }); hist(y, "Atualizado pela recorrência"); } }); } }
            return;
          }
          const n = Math.max(1, Math.min(60, Math.round(v.parcelas || 1))); const rep = v.repetir;
          if (rep !== "0" && n === 1) {   /* recorrência */
            const s = { id: uid("s"), tipo: v.tipo, desc: base.desc, catId: base.catId, forma: base.forma, classe: base.classe, valor: F.r2(v.valor), dia: +v.venc.slice(8, 10), inicio: cc ? v.comp : v.venc, fim: rep === "1" ? null : addMonths(cc ? v.comp : v.venc, +rep - 1), contaId: cc ? "" : oid, cartaoId: cc ? oid : "", paraId: v.tipo === "transferencia" ? v.paraId : "", ativa: true };
            dd.series.push(s); F.materializar(dd);
            if (v.jaPago && !cc) { const p = dd.lanc.find((y) => y.serieId === s.id && y.serieMes === monthKey(s.inicio)); if (p) { p.pago = p.venc <= todayISO() ? p.venc : todayISO(); p.valorPago = p.valor; hist(p, "Pago no cadastro"); } }
            return;
          }
          const g = n > 1 ? uid("g") : null; const per = Math.floor((v.valor / n) * 100) / 100;
          for (let i = 0; i < n; i++) {
            const val = i === n - 1 ? F.r2(v.valor - per * (n - 1)) : per;
            const x = Object.assign({ id: uid("l"), valor: val, criado: Date.now() }, base, { desc: n > 1 ? `${base.desc} (${i + 1}/${n})` : base.desc });
            if (g) x.parcela = { g, n: i + 1, t: n };
            if (cc) { const c = F.cartao(oid); const f0 = F.faturaDe(c, v.comp); Object.assign(x, { tipo: "compra", cartaoId: oid, comp: addMonths(v.comp, i), venc: v.comp, fatura: F.mesSeg(f0.key, i), pago: null }); }
            else { Object.assign(x, { tipo: v.tipo, contaId: oid, paraId: v.tipo === "transferencia" ? v.paraId : "", comp: addMonths(v.comp, i), venc: addMonths(v.venc, i), pago: null }); if (v.jaPago && i === 0) { x.pago = x.venc <= todayISO() ? x.venc : todayISO(); x.valorPago = x.valor; } }
            hist(x, "Criado"); dd.lanc.push(x);
          }
        });
        ERP.toast(novo ? "Lançamento salvo." : "Alterações salvas."); ERP.render();
      },
      onDelete: novo ? null : async () => {
        let todas = false;
        if (l.parcela && l.parcela.t > 1) todas = await ERP.confirm(`Compra em ${l.parcela.t} parcelas. Excluir todas as parcelas em aberto? (Cancelar exclui só esta.)`, "Excluir todas");
        else if (l.serieId) todas = await ERP.confirm("Lançamento de uma recorrência. Encerrar a recorrência e excluir os próximos em aberto? (Cancelar exclui só este mês.)", "Encerrar recorrência");
        salvar((dd) => {
          if (todas && l.parcela) dd.lanc = dd.lanc.filter((y) => !(y.parcela && y.parcela.g === l.parcela.g && !y.pago && !F.travado(y)));
          else if (todas && l.serieId) { const s = dd.series.find((y) => y.id === l.serieId); if (s) s.fim = addMonths(l.venc, -1); dd.lanc = dd.lanc.filter((y) => !(y.serieId === l.serieId && !y.pago && y.venc >= l.venc)); }
          else { if (l.serieId) { const s = dd.series.find((y) => y.id === l.serieId); if (s) (s.pulados = s.pulados || []).push(l.serieMes); } dd.lanc = dd.lanc.filter((y) => y.id !== l.id); }
        });
        ERP.toast("Excluído."); ERP.render();
      },
    });
    return m;
  }

  /* pagar / receber (como na CAP: data, conta, juros e multa, desconto) */
  function pagar(id) {
    const l = D().lanc.find((x) => x.id === id); if (!l) return;
    if (F.travado(l)) { ERP.toast("Mês fechado."); return; }
    const rec = l.tipo === "receita";
    ERP.form({
      title: (rec ? "Receber · " : "Pagar · ") + l.desc, intro: `Valor previsto ${brl(l.valor)} · vencimento ${fdate(l.venc)}`,
      fields: [
        { k: "data", label: rec ? "Data do recebimento" : "Data do pagamento", type: "date", value: todayISO() },
        { k: "contaId", label: rec ? "Recebido na conta" : "Pago pela conta", type: "select", value: l.contaId, options: F.contasAtivas().map((c) => [c.id, c.nome]) },
        { k: "juros", label: rec ? "Acréscimos" : "Juros e multa", type: "number", step: "0.01", value: 0 },
        { k: "desconto", label: "Desconto", type: "number", step: "0.01", value: 0 },
      ],
      okLabel: rec ? "Registrar recebimento" : "Registrar pagamento",
      onSubmit(v) {
        if (F.mesFechado(monthKey(v.data))) { ERP.toast("O mês do pagamento está fechado."); return false; }
        salvar((d) => { const x = d.lanc.find((y) => y.id === id); x.pago = v.data; x.contaId = v.contaId; x.juros = F.r2(v.juros); x.desconto = F.r2(v.desconto); x.valorPago = F.r2(x.valor + x.juros - x.desconto); hist(x, `${rec ? "Recebido" : "Pago"} em ${fdate(v.data)}: ${brl(x.valorPago)}${x.juros ? ` (juros ${brl(x.juros)})` : ""}${x.desconto ? ` (desconto ${brl(x.desconto)})` : ""}`); });
        ERP.toast(rec ? "Recebimento registrado." : "Pagamento registrado."); ERP.render();
      },
    });
  }
  function estornar(id) {
    const l = D().lanc.find((x) => x.id === id); if (!l) return;
    if (F.travado(l)) { ERP.toast("Mês fechado."); return; }
    ERP.form({ title: "Desfazer pagamento · " + l.desc, intro: "O lançamento volta para em aberto. O motivo fica no histórico.", fields: [{ k: "motivo", label: "Motivo", full: true, required: true }], okLabel: "Desfazer",
      onSubmit(v) { if (!v.motivo.trim()) { ERP.toast("Escreva o motivo."); return false; } salvar((d) => { const x = d.lanc.find((y) => y.id === id); hist(x, `Pagamento de ${fdate(x.pago)} desfeito: ${v.motivo.trim()}`); x.pago = null; x.valorPago = null; x.juros = 0; x.desconto = 0; }); ERP.render(); } });
  }
  function pagarFatura(cid, key) {
    const c = F.cartao(cid); const f = F.faturas(cid).find((x) => x.key === key); if (!f) return;
    ERP.form({ title: `Pagar fatura ${c.nome} · ${monthLabel(key)}`, intro: `Total ${brl(f.total)} · vence ${fdate(f.vence)}. As compras já estão nas categorias; o pagamento só tira o dinheiro da conta.`,
      fields: [{ k: "data", label: "Data do pagamento", type: "date", value: todayISO() }, { k: "valor", label: "Valor pago (R$)", type: "number", step: "0.01", value: f.total }, { k: "contaId", label: "Conta", type: "select", value: c.contaId || (F.contasAtivas()[0] || {}).id, options: F.contasAtivas().map((x) => [x.id, x.nome]) }],
      okLabel: "Registrar pagamento",
      onSubmit(v) {
        salvar((d) => {
          let p = d.lanc.find((y) => y.tipo === "pagfatura" && y.cartaoId === cid && y.fatura === key);
          if (!p) { p = { id: uid("l"), tipo: "pagfatura", cartaoId: cid, fatura: key, desc: `Fatura ${c.nome} ${monthLabel(key)}`, valor: f.total, venc: f.vence, comp: f.vence, catId: "" }; d.lanc.push(p); }
          p.valor = f.total; p.pago = v.data; p.contaId = v.contaId; p.valorPago = F.r2(v.valor); hist(p, `Fatura paga em ${fdate(v.data)}: ${brl(v.valor)}`);
        });
        ERP.toast("Fatura paga."); ERP.render();
      } });
  }
  function desfazerFatura(cid, key) {
    ERP.confirm("Desfazer o pagamento desta fatura? Ela volta a ficar em aberto.", "Desfazer").then((ok) => { if (!ok) return; salvar((d) => { d.lanc = d.lanc.filter((y) => !(y.tipo === "pagfatura" && y.cartaoId === cid && y.fatura === key)); }); ERP.render(); });
  }

  /* lançamento rápido: "Mercado 250,90 @nubank 3x #alimentação 25/10" — "+" ou "recebi" no início = receita */
  function rapido(txt) {
    let t = " " + txt.trim() + " "; if (!txt.trim()) return;
    const d = D(); let tipo = "despesa", parc = 1, dt = todayISO(), origem = null, catId = "";
    if (/^\s*\+/.test(t) || /\b(recebi|receita)\b/i.test(t)) { tipo = "receita"; t = t.replace(/^\s*\+/, " ").replace(/\b(recebi|receita)\b/i, " "); }
    t = t.replace(/\s(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s/, (m0, dd, mm, yy) => { const y = yy ? (yy.length === 2 ? "20" + yy : yy) : String(new Date().getFullYear()); dt = y + "-" + ERP.p2(mm) + "-" + ERP.p2(dd); return " "; });
    t = t.replace(/\s(\d{1,2})x\s/i, (m0, n) => { parc = +n; return " "; });
    t = t.replace(/@(\S+)/, (m0, a) => { const k = norm(a); const cc = d.cartoes.find((c) => norm(c.nome).includes(k)); const ct = F.contasAtivas().find((c) => norm(c.nome).includes(k)); origem = cc && tipo === "despesa" ? "cc:" + cc.id : ct ? "ct:" + ct.id : null; return " "; });
    t = t.replace(/#(\S+)/, (m0, a) => { const k = norm(a); const c = d.categorias.find((x) => norm(x.nome).includes(k) && x.tipo === (tipo === "receita" ? "receita" : "despesa")); if (c) catId = c.id; return " "; });
    let valor = 0; t = t.replace(/\s(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s/, (m0, v) => { valor = parseNum(v); return " "; });
    const desc = t.replace(/\s+/g, " ").trim();
    if (!catId) { const w = norm(desc).split(" ").filter((x) => x.length > 3); const c = d.categorias.find((x) => x.tipo === (tipo === "receita" ? "receita" : "despesa") && w.some((p) => norm(x.nome).includes(p))); if (c) catId = c.id; }
    if (!valor || !desc) { ERP.toast("Escreva ao menos descrição e valor. Ex.: Mercado 250,90 @nubank"); return; }
    const pre = { tipo, catId };
    const m = lancForm(null, pre); if (!m) return; const fm = $("form", m.el);
    fm.elements.valor.value = valor; fm.elements.desc.value = desc; fm.elements.comp.value = dt; fm.elements.venc.value = dt; fm.elements.parcelas.value = parc;
    fm.elements.tipo.value = tipo; fm.elements.tipo.onchange(); if (origem) { fm.elements.origem.value = origem; fm.elements.origem.onchange(); } if (catId) fm.elements.catId.value = catId;
    fm.elements.jaPago.checked = dt <= todayISO();
  }

  /* ---------- 1. Painel ---------- */
  function pPainel(root) {
    const d = D(); const r = F.dreMes(S.mk); const pj = F.projecao(12); const pend = F.pendencias(); const h = todayISO();
    const venc = pend.filter((p) => p.data < h && p.tipo !== "receita"); const prox30 = pend.filter((p) => p.data >= h && p.data <= F.addDias(h, 30));
    const fimMes = pj.porMes[0] ? pj.porMes[0].saldo : pj.ini;
    const alertas = [];
    if (venc.length) alertas.push(["err", `${venc.length} conta(s) vencida(s), ${brl(venc.reduce((s, p) => s + p.valor, 0))}`, "#/financas/agenda"]);
    if (pj.min.v < 0) alertas.push(["err", `O saldo projetado fica negativo em ${fdate(pj.min.data)} (${brl(pj.min.v)})`, "#/financas/fluxo"]);
    d.cartoes.forEach((c) => { const u = F.usoCartao(c.id); if (c.limite > 0 && u / c.limite * 100 >= (d.cfg.alertaCartao || 80)) alertas.push(["warn", `${c.nome}: ${num(u / c.limite * 100, 0)}% do limite usado`, "#/financas/cartoes"]); });
    F.orcamentoMes(S.mk).filter((x) => x.orcado > 0 && x.pct > 100).forEach((x) => alertas.push(["warn", `Orçamento estourado em ${x.c.nome}: ${brl(x.realizado)} de ${brl(x.orcado)}`, "#/financas/orcamento"]));
    const vazio = d.lanc.length === 0;
    const six = []; for (let i = -5; i <= 0; i++) { const mk = F.mesSeg(S.mk, i); const x = F.dreMes(mk); six.push({ l: monthLabel(mk), a: x.rec, b: x.despesas + x.investimento }); }
    const cats = Object.entries(r.porCat).filter(([k]) => F.cat(k).tipo === "despesa").sort((a, b) => b[1] - a[1]).slice(0, 8); const mx = cats.length ? cats[0][1] : 1;
    root.innerHTML = ERP.pagehead("Finanças Pessoais", `${regimeTgl()}${mesNav()}<button class="btn orange" id="fNovo">+ Lançamento</button>`) + `
      ${vazio ? `<div class="card fin-onb"><h3>Comece por aqui</h3><ol><li><a href="#/financas/cadastros">Cadastre suas contas</a> com o saldo de hoje e os cartões com fechamento e vencimento.</li><li>Lance as <b>contas fixas</b> com “Repetir todo mês” (aluguel, condomínio, escola, assinaturas, salário).</li><li>Defina o <a href="#/financas/orcamento">orçamento</a> do mês por categoria.</li><li>Cadastre <a href="#/financas/dividas">dívidas</a> e <a href="#/financas/metas">metas</a>.</li></ol><p class="mut">No dia a dia, use o lançamento rápido em Lançamentos: <code>Mercado 250,90 @nubank 3x</code>.</p></div>` : ""}
      ${alertas.length ? `<div class="fin-alertas">${alertas.map(([c, t, hr]) => `<a class="note ${c === "err" ? "err" : ""}" href="${hr}">${esc(t)}</a>`).join("")}</div>` : ""}
      <div class="kpis">${ERP.kpi("Saldo em contas hoje", brl(pj.ini), F.contasAtivas().length + " conta(s)" + (F.saldoReservas() ? " · reservas " + brl(F.saldoReservas()) : ""), pj.ini < 0 ? "neg" : "")}${ERP.kpi("Receitas · " + monthLabel(S.mk), brl(r.rec), d.cfg.regime === "caixa" ? "recebidas" : "competência, com previstos", "pos")}${ERP.kpi("Despesas · " + monthLabel(S.mk), brl(r.despesas), `necessidades ${brl(r.essencial)} · estilo ${brl(r.estilo)}`, "neg")}${ERP.kpi("Sobra do mês", brl(r.resultado), r.rec ? "taxa de poupança " + num(r.poupanca, 1) + "%" : "", r.resultado >= 0 ? "pos" : "neg")}${ERP.kpi("A pagar em 30 dias", brl(prox30.filter((p) => p.tipo !== "receita").reduce((s, p) => s + p.valor, 0)), `a receber ${brl(prox30.filter((p) => p.tipo === "receita").reduce((s, p) => s + p.valor, 0))}`)}${ERP.kpi("Saldo previsto no fim do mês", brl(fimMes), "pelo fluxo de caixa", fimMes < 0 ? "neg" : "")}</div>
      <div class="grid2"><div class="card"><h3>Últimos 6 meses</h3>${barras(six)}<p class="mut fin-leg"><i class="sq a"></i>receitas <i class="sq b"></i>despesas e aportes</p></div>
      <div class="card"><h3>Para onde foi o dinheiro · ${monthLabel(S.mk)}</h3>${cats.length ? cats.map(([k, v]) => { const c = F.cat(k); const o = F.orcado(S.mk, k); return `<div class="hrow"><span class="n" title="${esc(c.grupo)}">${esc(c.nome)}</span><div class="bar"><i style="width:${(v / mx) * 100}%;background:${c.cor}"></i></div><span class="v">${brl(v)}${o ? `<small class="mut"> / ${num(o, 0)}</small>` : ""}</span></div>`; }).join("") : `<div class="empty">Sem despesas neste mês.</div>`}</div></div>
      <div class="grid2"><div class="card"><h3>Próximos vencimentos</h3>${prox30.length || venc.length ? `<div class="tw"><table><tbody>${venc.concat(prox30).slice(0, 10).map((p) => `<tr><td style="white-space:nowrap">${fdate(p.data).slice(0, 5)}</td><td>${esc(p.desc)}<div>${p.k === "l" ? pill(F.situacao(p.l)) : `<span class="pill ${p.data < h ? "err" : "info"}">fatura</span>`}</div></td><td class="r ${p.tipo === "receita" ? "pos" : ""}" style="white-space:nowrap">${brl(p.valor)}</td><td class="r">${p.k === "l" ? `<button class="btn sm" data-pay="${p.l.id}">${p.tipo === "receita" ? "Receber" : "Pagar"}</button>` : `<button class="btn sm" data-payf="${p.f.cartaoId}|${p.f.key}">Pagar</button>`}</td></tr>`).join("")}</tbody></table></div>` : `<div class="empty">Nada vencendo nos próximos 30 dias.</div>`}</div>
      <div class="card"><h3>Saldo projetado · 12 meses</h3>${linha([{ l: "hoje", v: pj.ini }].concat(pj.porMes.map((m) => ({ l: monthLabel(m.mk), v: m.saldo }))))}<p class="mut fin-leg">Menor saldo: <b class="${pj.min.v < 0 ? "neg" : ""}">${brl(pj.min.v)}</b> em ${fdate(pj.min.data)}. <a href="#/financas/fluxo">Abrir fluxo de caixa</a></p></div></div>`;
    bindMes(root); bindReg(root); $("#fNovo", root).onclick = () => lancForm();
    $$("[data-pay]", root).forEach((b) => (b.onclick = () => pagar(b.dataset.pay)));
    $$("[data-payf]", root).forEach((b) => (b.onclick = () => { const [c, k] = b.dataset.payf.split("|"); pagarFatura(c, k); }));
  }

  /* ---------- 2. Lançamentos ---------- */
  function pLanc(root) {
    const d = D(); const q = norm(S.q); const reg = d.cfg.regime;
    const rows = d.lanc.filter((l) => l.tipo !== "pagfatura" || true).filter((l) => monthKey(reg === "caixa" ? (l.tipo === "compra" ? l.comp : F.dataCaixa(l)) : F.dataComp(l)) === S.mk)
      .filter((l) => (!S.tipo || (S.tipo === "despesa" ? l.tipo === "despesa" || l.tipo === "compra" : l.tipo === S.tipo)) && (!S.cat || l.catId === S.cat) && (!S.origem || ("ct:" + l.contaId) === S.origem || ("cc:" + l.cartaoId) === S.origem) && (!S.sit || F.situacao(l).k === S.sit || (S.sit === "aberto" && !l.pago && l.tipo !== "compra")) && (!q || norm(l.desc + " " + (l.notas || "") + " " + F.cat(l.catId).nome).includes(q)))
      .sort((a, b) => (b.comp || b.venc).localeCompare(a.comp || a.venc));
    const tot = (f) => rows.filter(f).reduce((s, l) => s + l.valor, 0);
    root.innerHTML = ERP.pagehead("Lançamentos", `${regimeTgl()}${mesNav()}<button class="btn ghost" id="fCsv">Exportar CSV</button><button class="btn orange" id="fNovo">+ Lançamento</button>`) + `
      <div class="quick"><input id="fRap" placeholder="Lançamento rápido, ex.: Mercado 250,90 @nubank 3x #mercado 25/10 · + Salário 12000 @itaú" aria-label="Lançamento rápido"><button class="btn orange" id="fRapBtn">Lançar</button></div>
      <div class="toolbar"><input id="fQ" placeholder="Buscar" value="${esc(S.q)}" style="max-width:200px">
        <select id="fT"><option value="">Todos os tipos</option><option value="despesa">Despesas</option><option value="receita">Receitas</option><option value="transferencia">Transferências</option><option value="pagfatura">Pagamentos de fatura</option></select>
        <select id="fS"><option value="">Todas as situações</option><option value="aberto">Em aberto</option><option value="vencido">Vencidos</option><option value="pago">Pagos</option><option value="cartao">No cartão</option></select>
        <select id="fC"><option value="">Todas as categorias</option>${catOpts("").map((x) => x[0] === "__grp" ? `<optgroup label="${esc(x[1])}"></optgroup>` : `<option value="${x[0]}">${esc(x[1])}</option>`).join("")}</select>
        <select id="fO"><option value="">Todas as contas e cartões</option>${origemOpts(true).map((o) => `<option value="${o[0]}">${esc(o[1])}</option>`).join("")}</select></div>
      <p class="mut fin-leg">${reg === "caixa" ? "Regime de caixa: datas de pagamento (em aberto, pelo vencimento); compras no cartão pela data da compra." : "Competência: pela data da compra/competência, com os previstos."} · ${rows.length} lançamento(s) · receitas ${brl(tot((l) => l.tipo === "receita"))} · despesas ${brl(tot((l) => l.tipo === "despesa" || l.tipo === "compra"))}</p>
      ${rows.length ? `<div class="tw"><table class="lt"><thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Conta / cartão</th><th>Situação</th><th class="r">Valor</th><th></th></tr></thead><tbody>${rows.map((l) => {
        const c = F.cat(l.catId); const s = F.situacao(l); const orig = l.cartaoId ? "💳 " + esc((F.cartao(l.cartaoId) || {}).nome || "") + (l.tipo === "compra" ? ` <small class="mut">fatura ${monthLabel(l.fatura)}</small>` : "") : "🏦 " + esc((F.conta(l.contaId) || {}).nome || "") + (l.tipo === "transferencia" ? " → " + esc((F.conta(l.paraId) || {}).nome || "") : "");
        const v = l.valorPago != null ? l.valorPago : l.valor;
        return `<tr data-ed="${l.id}" class="fin-row"><td>${fdate(l.tipo === "compra" ? l.comp : F.dataCaixa(l))}</td><td><b>${esc(l.desc)}</b>${l.serieId ? ' <span class="tic" title="Recorrente">↻</span>' : ""}${F.travado(l) ? ' <span class="tic" title="Mês fechado">🔒</span>' : ""}${l.notas ? `<div class="mut fin-sub">${esc(l.notas)}</div>` : ""}</td><td>${l.catId ? `<span class="cat"><i style="background:${c.cor}"></i>${esc(c.nome)}</span>` : l.tipo === "pagfatura" ? '<span class="pill info">pagamento de fatura</span>' : ""}</td><td class="mut">${orig}</td><td>${pill(s)}</td><td class="r ${l.tipo === "receita" ? "pos" : l.tipo === "transferencia" ? "" : "neg"}">${l.tipo === "receita" ? "" : l.tipo === "transferencia" ? "" : "−"}${brl(v)}</td><td class="r" style="white-space:nowrap">${l.tipo === "compra" || l.tipo === "pagfatura" ? "" : l.pago ? `<button class="ib" data-est="${l.id}" title="Desfazer pagamento" aria-label="Desfazer pagamento">↺</button>` : `<button class="btn ghost sm" data-pay="${l.id}">${l.tipo === "receita" ? "Receber" : "Pagar"}</button>`}</td></tr>`;
      }).join("")}</tbody></table></div>` : `<div class="empty">Nenhum lançamento em ${monthLabel(S.mk)} com esses filtros.</div>`}`;
    bindMes(root); bindReg(root);
    $("#fT", root).value = S.tipo; $("#fS", root).value = S.sit; $("#fC", root).value = S.cat; $("#fO", root).value = S.origem;
    $("#fT", root).onchange = (e) => { S.tipo = e.target.value; ERP.render(); }; $("#fS", root).onchange = (e) => { S.sit = e.target.value; ERP.render(); };
    $("#fC", root).onchange = (e) => { S.cat = e.target.value; ERP.render(); }; $("#fO", root).onchange = (e) => { S.origem = e.target.value; ERP.render(); };
    $("#fQ", root).onchange = (e) => { S.q = e.target.value; ERP.render(); };
    $("#fNovo", root).onclick = () => lancForm();
    $("#fRapBtn", root).onclick = () => rapido($("#fRap", root).value); $("#fRap", root).onkeydown = (e) => { if (e.key === "Enter") rapido(e.target.value); };
    root.onclick = (e) => {
      const b = e.target.closest("[data-pay],[data-est]"); if (b) { e.stopPropagation(); if (b.dataset.pay) pagar(b.dataset.pay); else estornar(b.dataset.est); return; }
      const r = e.target.closest("[data-ed]"); if (r) { const l = D().lanc.find((x) => x.id === r.dataset.ed); if (l.tipo === "pagfatura") { S.card = l.cartaoId; ERP.nav("financas/cartoes"); return; } lancForm(l); }
    };
    $("#fCsv", root).onclick = () => { const qq = (s) => `"${String(s == null ? "" : s).replace(/"/g, '""')}"`; const L = [["competencia", "vencimento", "pagamento", "tipo", "descricao", "grupo", "categoria", "natureza", "conta_cartao", "fatura", "valor", "valor_pago"]].concat(d.lanc.slice().sort((a, b) => (a.comp || "").localeCompare(b.comp || "")).map((l) => { const c = F.cat(l.catId); return [l.comp, l.venc, l.pago || "", l.tipo, l.desc, l.catId ? c.grupo : "", l.catId ? c.nome : "", l.catId ? F.NAT[c.natureza] : "", l.cartaoId ? (F.cartao(l.cartaoId) || {}).nome : (F.conta(l.contaId) || {}).nome, l.fatura || "", String(l.valor).replace(".", ","), l.valorPago != null ? String(l.valorPago).replace(".", ",") : ""]; })); ERP.download(`financas-lancamentos-${todayISO()}.csv`, "﻿" + L.map((r) => r.map(qq).join(";")).join("\n"), "text/csv"); };
  }

  /* ---------- 3. Contas a pagar e a receber ---------- */
  function pAgenda(root) {
    const h = todayISO(); const all = F.pendencias().filter((p) => S.agenda === "receber" ? p.tipo === "receita" : p.tipo !== "receita");
    const faixas = [["Vencidas", (p) => p.data < h], ["Hoje", (p) => p.data === h], ["Próximos 7 dias", (p) => p.data > h && p.data <= F.addDias(h, 7)], ["Até 30 dias", (p) => p.data > F.addDias(h, 7) && p.data <= F.addDias(h, 30)], ["Depois", (p) => p.data > F.addDias(h, 30)]];
    const soma = (f) => all.filter(f).reduce((s, p) => s + p.valor, 0);
    const linhaP = (p) => `<tr><td>${fdate(p.data)}</td><td><b>${esc(p.desc)}</b>${p.k === "l" ? `<div class="mut fin-sub">${esc(F.cat(p.l.catId).nome)} · ${esc((F.conta(p.l.contaId) || {}).nome || "")}</div>` : `<div class="mut fin-sub">${p.f.itens.length} compra(s)</div>`}</td><td>${p.k === "l" ? pill(F.situacao(p.l)) : `<span class="pill ${p.data < h ? "err" : "info"}">fatura ${p.f.status}</span>`}</td><td class="r">${brl(p.valor)}</td><td class="r" style="white-space:nowrap">${p.k === "l" ? `<button class="btn ghost sm" data-ed="${p.l.id}">Editar</button> <button class="btn sm" data-pay="${p.l.id}">${p.tipo === "receita" ? "Receber" : "Pagar"}</button>` : `<button class="btn sm" data-payf="${p.f.cartaoId}|${p.f.key}">Pagar fatura</button>`}</td></tr>`;
    root.innerHTML = ERP.pagehead("Contas a pagar e a receber", `<button class="btn orange" id="fNovo">+ Lançamento</button>`) + `
      <div class="tabs"><button class="${S.agenda === "pagar" ? "on" : ""}" data-ag="pagar">A pagar</button><button class="${S.agenda === "receber" ? "on" : ""}" data-ag="receber">A receber</button></div>
      <div class="kpis">${faixas.slice(0, 4).map(([n, f], i) => ERP.kpi(n, brl(soma(f)), all.filter(f).length + " item(ns)", i === 0 && soma(f) > 0 ? "neg" : "")).join("")}</div>
      ${faixas.map(([n, f]) => { const it = all.filter(f); return it.length ? `<div class="card"><h3>${n} · ${brl(soma(f))}</h3><div class="tw"><table><tbody>${it.map(linhaP).join("")}</tbody></table></div></div>` : ""; }).join("") || `<div class="empty">Nada em aberto.</div>`}`;
    $$("[data-ag]", root).forEach((b) => (b.onclick = () => { S.agenda = b.dataset.ag; ERP.render(); }));
    $("#fNovo", root).onclick = () => lancForm(null, { tipo: S.agenda === "receber" ? "receita" : "despesa" });
    $$("[data-pay]", root).forEach((b) => (b.onclick = () => pagar(b.dataset.pay)));
    $$("[data-ed]", root).forEach((b) => (b.onclick = () => lancForm(D().lanc.find((x) => x.id === b.dataset.ed))));
    $$("[data-payf]", root).forEach((b) => (b.onclick = () => { const [c, k] = b.dataset.payf.split("|"); pagarFatura(c, k); }));
  }

  /* ---------- 4. Cartões ---------- */
  function pCartoes(root) {
    const d = D(); if (!S.card || !F.cartao(S.card)) S.card = (d.cartoes[0] || {}).id;
    const c = F.cartao(S.card);
    const tiles = d.cartoes.map((x) => { const u = F.usoCartao(x.id); const p = x.limite > 0 ? Math.min(100, (u / x.limite) * 100) : 0; return `<button class="fin-cc ${x.id === S.card ? "on" : ""}" data-cc="${x.id}"><b>${esc(x.nome)}</b><span class="mut">fecha dia ${x.fecha} · vence dia ${x.vence}</span><span class="fin-cc-v">${brl(u)}</span><div class="bar"><i style="width:${p}%;${p >= (d.cfg.alertaCartao || 80) ? "background:var(--err)" : ""}"></i></div><span class="mut">${x.limite ? "disponível " + brl(x.limite - u) : "sem limite cadastrado"}</span></button>`; }).join("");
    let body = `<div class="empty">Cadastre um cartão em <a href="#/financas/cadastros">Cadastros</a>.</div>`;
    if (c) {
      const fs = F.faturas(c.id);
      body = fs.length ? fs.map((f) => `<div class="card fin-fat"><div class="fin-fat-h"><div><h3 style="margin:0">Fatura ${monthLabel(f.key)}</h3><span class="mut">fecha ${fdate(f.fecha)} · vence ${fdate(f.vence)} · ${f.itens.length} lançamento(s)</span></div><span class="sp"></span><span class="pill ${f.status === "paga" ? "ok" : f.status === "vencida" ? "err" : f.status === "fechada" ? "warn" : "info"}">${f.status}</span><b class="fin-fat-v">${brl(f.total)}</b>${f.status === "paga" ? `<button class="btn ghost sm" data-unf="${f.key}">Desfazer pagamento</button>` : f.total > 0 ? `<button class="btn sm" data-payf="${f.key}">Pagar</button>` : ""}</div>
        ${f.pagto && f.pagto.pago ? `<p class="mut fin-sub">Paga em ${fdate(f.pagto.pago)} · ${brl(f.pagto.valorPago)}${Math.abs(f.pagto.valorPago - f.total) > 0.01 ? ` (diferença de ${brl(f.pagto.valorPago - f.total)})` : ""}</p>` : ""}
        <details ${f.status !== "paga" && f.key <= F.mesSeg(monthKey(todayISO()), 1) ? "open" : ""}><summary>Compras</summary><div class="tw"><table><tbody>${f.itens.map((l) => `<tr data-ed="${l.id}" class="fin-row"><td>${fdate(l.comp)}</td><td>${esc(l.desc)}</td><td class="mut">${esc(F.cat(l.catId).nome)}</td><td class="r ${l.tipo === "estorno" ? "pos" : ""}">${l.tipo === "estorno" ? "−" : ""}${brl(l.valor)}</td></tr>`).join("")}</tbody></table></div></details></div>`).join("") : `<div class="empty">Nenhuma compra neste cartão. Lance com “Pago com: 💳 ${esc(c.nome)}”.</div>`;
    }
    root.innerHTML = ERP.pagehead("Cartões e faturas", `<button class="btn ghost" id="fEst">Estorno / crédito</button><button class="btn orange" id="fNovo">+ Compra</button>`) + `<div class="fin-ccs">${tiles}</div>${body}`;
    $$("[data-cc]", root).forEach((b) => (b.onclick = () => { S.card = b.dataset.cc; ERP.render(); }));
    $("#fNovo", root).onclick = () => { const m = lancForm(); if (m && c) { const fm = $("form", m.el); fm.elements.origem.value = "cc:" + c.id; fm.elements.origem.onchange(); } };
    $("#fEst", root).onclick = () => { if (!c) return; ERP.form({ title: "Estorno ou crédito no " + c.nome, fields: [{ k: "desc", label: "Descrição", required: true, full: true }, { k: "valor", label: "Valor (R$)", type: "number", step: "0.01" }, { k: "data", label: "Data", type: "date", value: todayISO() }, { k: "catId", label: "Categoria da compra estornada", type: "select", options: catOpts("despesa") }], onSubmit(v) { if (!(v.valor > 0)) return false; salvar((dd) => dd.lanc.push({ id: uid("l"), tipo: "estorno", cartaoId: c.id, desc: v.desc, valor: F.r2(v.valor), comp: v.data, venc: v.data, fatura: F.faturaDe(c, v.data).key, catId: v.catId, pago: null, hist: [{ em: new Date().toISOString(), o: "Estorno lançado" }] })); ERP.render(); } }); };
    $$("[data-payf]", root).forEach((b) => (b.onclick = () => pagarFatura(c.id, b.dataset.payf)));
    $$("[data-unf]", root).forEach((b) => (b.onclick = () => desfazerFatura(c.id, b.dataset.unf)));
    $$("[data-ed]", root).forEach((r) => (r.onclick = () => { const l = D().lanc.find((x) => x.id === r.dataset.ed); if (l.tipo === "estorno") { ERP.confirm("Excluir este estorno?", "Excluir").then((ok) => { if (ok) { salvar((dd) => { dd.lanc = dd.lanc.filter((y) => y.id !== l.id); }); ERP.render(); } }); } else lancForm(l); }));
  }

  /* ---------- 5. Fluxo de caixa ---------- */
  function pFluxo(root) {
    const pj = F.projecao(12); const jur = pj.porMes.reduce((s, m) => s + m.juros, 0);
    const hist = []; for (let i = -6; i < 0; i++) { const mk = F.mesSeg(monthKey(todayISO()), i); const r = F.dreMes(mk, "caixa"); hist.push({ l: monthLabel(mk), a: r.rec, b: r.despesas + r.investimento }); }
    root.innerHTML = ERP.pagehead("Fluxo de caixa") + `
      <div class="kpis">${ERP.kpi("Saldo hoje", brl(pj.ini), "contas, sem as reservas", pj.ini < 0 ? "neg" : "")}${ERP.kpi("Em 3 meses", brl(pj.porMes[2].saldo), monthLabel(pj.porMes[2].mk), pj.porMes[2].saldo < 0 ? "neg" : "")}${ERP.kpi("Em 12 meses", brl(pj.porMes[11].saldo), monthLabel(pj.porMes[11].mk), pj.porMes[11].saldo < 0 ? "neg" : "")}${ERP.kpi("Menor saldo previsto", brl(pj.min.v), fdate(pj.min.data), pj.min.v < 0 ? "neg" : "")}${jur ? ERP.kpi("Juros de cheque especial", brl(jur), "estimativa em 12 meses", "neg") : ""}</div>
      <div class="card"><h3>Saldo projetado</h3>${linha([{ l: "hoje", v: pj.ini }].concat(pj.porMes.map((m) => ({ l: monthLabel(m.mk), v: m.saldo }))))}<p class="mut fin-leg">Contas e recebimentos em aberto (os atrasados entram hoje), faturas pelo vencimento e recorrências até 12 meses. Cadastre os fixos com “Repetir todo mês” para a projeção ficar completa.</p></div>
      <div class="card"><h3>Mês a mês</h3><div class="tw"><table><thead><tr><th>Mês</th><th class="r">Entradas</th><th class="r">Saídas</th><th class="r">Resultado</th><th class="r">Saldo no fim</th></tr></thead><tbody>
      <tr><td>Hoje</td><td></td><td></td><td></td><td class="r">${sinal(pj.ini)}</td></tr>${pj.porMes.map((m) => `<tr><td>${monthLabel(m.mk)}</td><td class="r pos">${brl(m.ent)}</td><td class="r neg">${brl(m.sai)}</td><td class="r">${sinal(m.ent - m.sai)}</td><td class="r"><b>${sinal(m.saldo)}</b></td></tr>`).join("")}</tbody></table></div></div>
      <div class="card"><h3>Realizado nos últimos 6 meses (caixa)</h3>${barras(hist)}</div>`;
  }

  /* ---------- 6. Orçamento ---------- */
  function pOrc(root) {
    const d = D(); const linhas = F.orcamentoMes(S.mk); const r = F.dreMes(S.mk, "competencia");
    const comO = linhas.filter((x) => x.orcado > 0); const totO = comO.reduce((s, x) => s + x.orcado, 0), totR = comO.reduce((s, x) => s + x.realizado, 0);
    const fora = linhas.filter((x) => !(x.orcado > 0)).reduce((s, x) => s + x.realizado, 0);
    const rec = r.rec || 0; const b5 = { nec: r.essencial + r.financeiro, est: r.estilo, inv: r.investimento };
    const cats = d.categorias.filter((c) => c.tipo === "despesa" && c.ativa !== false);
    root.innerHTML = ERP.pagehead("Orçamento", `${mesNav()}<button class="btn ghost" id="oCopy">Copiar do mês anterior</button><button class="btn orange" id="oEdit">Definir orçamento</button>`) + `
      <div class="kpis">${ERP.kpi("Orçado", brl(totO), monthLabel(S.mk))}${ERP.kpi("Realizado + previsto", brl(totR), totO ? num((totR / totO) * 100, 0) + "% do orçado (categorias orçadas)" : "", totO && totR > totO ? "neg" : "")}${ERP.kpi("Fora do orçamento", brl(fora), "categorias sem valor orçado", fora ? "neg" : "")}${ERP.kpi("Sobra planejada", brl(rec - totO - fora), "receitas " + brl(rec) + " − orçado − fora do orçamento", rec - totO - fora < 0 ? "neg" : "pos")}</div>
      <div class="card"><h3>Regra 50/30/20 · ${monthLabel(S.mk)}</h3><p class="mut" style="margin-bottom:8px">Referência: até 50% da renda em necessidades (incluindo dívidas), até 30% em estilo de vida e pelo menos 20% em investimentos.</p>
        ${[["Necessidades", b5.nec, 50], ["Estilo de vida", b5.est, 30], ["Investimentos e reservas", b5.inv, 20]].map(([n, v, ref], i) => { const p = rec ? (v / rec) * 100 : 0; const ruim = i === 2 ? p < ref : p > ref; return `<div class="hrow" style="grid-template-columns:170px 1fr 120px"><span class="n">${n}</span><div class="bar"><i style="width:${Math.min(100, p)}%;${ruim && rec ? "background:var(--err)" : ""}"></i></div><span class="v">${num(p, 0)}% <small class="mut">ref. ${ref}%</small></span></div>`; }).join("")}</div>
      <div class="card"><h3>Por categoria</h3>${linhas.length ? `<div class="tw"><table><thead><tr><th>Categoria</th><th class="r">Orçado</th><th class="r">Realizado + previsto</th><th class="r">Ainda a pagar</th><th>Uso</th><th class="r">Disponível</th></tr></thead><tbody>${linhas.sort((a, b) => b.pct - a.pct).map((x) => `<tr><td><b>${esc(x.c.nome)}</b><div class="mut fin-sub">${esc(x.c.grupo)}</div></td><td class="r">${brl(x.orcado)}</td><td class="r">${brl(x.realizado)}</td><td class="r mut">${x.pendente ? brl(x.pendente) : ""}</td><td style="min-width:140px"><div class="bar"><i style="width:${Math.min(100, x.pct)}%;${x.pct > 100 ? "background:var(--err)" : x.pct > 80 ? "background:var(--warn)" : ""}"></i></div></td><td class="r">${x.orcado ? sinal(x.orcado - x.realizado) : '<span class="pill warn">sem orçamento</span>'}</td></tr>`).join("")}</tbody></table></div>` : `<div class="empty">Sem orçamento e sem despesas neste mês. Clique em “Definir orçamento”.</div>`}</div>`;
    bindMes(root);
    $("#oCopy", root).onclick = () => { const ant = F.mesSeg(S.mk, -1); Store.change("financas", (dd) => { const m = {}; cats.forEach((c) => { const v = F.orcado(ant, c.id); if (v) m[c.id] = v; }); dd.orcamento.meses[S.mk] = m; }); ERP.toast("Orçamento copiado de " + monthLabel(ant) + "."); ERP.render(); };
    $("#oEdit", root).onclick = () => {
      const ult = {}; for (let i = 1; i <= 3; i++) { const x = F.dreMes(F.mesSeg(S.mk, -i), "competencia"); Object.entries(x.porCat).forEach(([k, v]) => (ult[k] = (ult[k] || 0) + v / 3)); }
      ERP.form({ title: "Orçamento de " + monthLabel(S.mk), wide: true, intro: "Valores por categoria. Deixe em branco o que não quer acompanhar. A dica ao lado é a média dos últimos 3 meses.",
        fields: [{ k: "padrao", label: "Usar estes valores como padrão para os próximos meses", type: "checkbox", value: true, full: true }].concat(cats.map((c) => ({ k: "o_" + c.id, label: c.grupo + " · " + c.nome, type: "number", step: "0.01", value: F.orcado(S.mk, c.id) || "", hint: ult[c.id] ? "média " + brl(ult[c.id]) : "" }))),
        onSubmit(v) { Store.change("financas", (dd) => { const m = {}; cats.forEach((c) => { const x = v["o_" + c.id]; if (x > 0) m[c.id] = F.r2(x); }); dd.orcamento.meses[S.mk] = m; if (v.padrao) dd.orcamento.padrao = Object.assign({}, m); }); ERP.toast("Orçamento salvo."); ERP.render(); } });
    };
  }

  /* ---------- 7. Dívidas ---------- */
  function dividaForm(dv) {
    const novo = !dv; dv = dv || { tipo: "emprestimo", prioridade: "Média", taxa: 0, dia: 10 };
    const inf = novo ? null : F.dividaInfo(dv);
    ERP.form({ title: novo ? "Nova dívida" : "Editar dívida", wide: true,
      intro: novo ? "As parcelas viram contas a pagar previstas (categoria Parcelas de dívidas) e aparecem no fluxo de caixa." : `Restam ${inf.rest} parcela(s) em aberto. Mudar parcela, quantidade ou dia refaz só as parcelas em aberto.`,
      fields: [
        { k: "nome", label: "Nome", value: dv.nome, required: true, placeholder: "Ex.: Financiamento do carro" }, { k: "credor", label: "Credor", value: dv.credor },
        { k: "tipo", label: "Tipo", type: "select", value: dv.tipo, options: [["emprestimo", "Empréstimo pessoal"], ["financiamento", "Financiamento"], ["consignado", "Consignado"], ["acordo", "Acordo / renegociação"], ["parcelamento", "Parcelamento de fatura"], ["outro", "Outro"]] },
        { k: "prioridade", label: "Prioridade", type: "select", value: dv.prioridade, options: [["Alta", "Alta"], ["Média", "Média"], ["Baixa", "Baixa"]] },
        { k: "parcela", label: "Valor da parcela (R$)", type: "number", step: "0.01", value: inf && inf.proxima ? inf.proxima.valor : dv.parcela },
        { k: "rest", label: "Parcelas restantes", type: "number", step: "1", value: inf ? inf.rest : "" },
        { k: "prox", label: "Próximo vencimento", type: "date", value: inf && inf.proxima ? inf.proxima.venc : F.diaNoMes(F.mesSeg(monthKey(todayISO()), 1), dv.dia) },
        { k: "taxa", label: "Juros (% ao mês)", type: "number", step: "0.01", value: dv.taxa, hint: "Usado no saldo devedor e no plano de quitação" },
        { k: "contaId", label: "Paga pela conta", type: "select", value: dv.contaId, options: F.contasAtivas().map((c) => [c.id, c.nome]) },
        { k: "obs", label: "Observação", value: dv.obs, full: true },
      ],
      onSubmit(v) {
        if (!v.nome.trim() || !(v.parcela > 0) || !(v.rest >= 0) || !v.prox) { ERP.toast("Informe nome, parcela, parcelas restantes e próximo vencimento."); return false; }
        salvar((d) => {
          let x = novo ? null : d.dividas.find((y) => y.id === dv.id);
          if (!x) { x = { id: uid("dv") }; d.dividas.push(x); }
          Object.assign(x, { nome: v.nome.trim(), credor: v.credor, tipo: v.tipo, prioridade: v.prioridade, taxa: v.taxa, contaId: v.contaId, obs: v.obs, dia: +v.prox.slice(8, 10) });
          d.lanc = d.lanc.filter((l) => !(l.dividaId === x.id && !l.pago));
          for (let i = 0; i < Math.round(v.rest); i++) { const dt = addMonths(v.prox, i); d.lanc.push({ id: uid("l"), tipo: "despesa", dividaId: x.id, desc: `${x.nome} · parcela`, catId: F.DIVIDA_CAT, valor: F.r2(v.parcela), contaId: v.contaId, comp: dt, venc: dt, pago: null, hist: [{ em: new Date().toISOString(), o: "Parcela gerada pela dívida" }] }); }
        });
        ERP.toast("Dívida salva."); ERP.render();
      },
      onDelete: novo ? null : () => { salvar((d) => { d.dividas = d.dividas.filter((y) => y.id !== dv.id); d.lanc = d.lanc.filter((l) => !(l.dividaId === dv.id && !l.pago)); }); ERP.render(); },
      deleteConfirm: "Excluir a dívida? As parcelas em aberto saem das contas a pagar; as pagas ficam no histórico." });
  }
  function pDividas(root) {
    const d = D(); const infos = d.dividas.map((dv) => Object.assign({ dv }, F.dividaInfo(dv))); const ativas = infos.filter((x) => x.rest > 0);
    const tot = ativas.reduce((s, x) => s + x.saldo, 0), mes = ativas.reduce((s, x) => s + (x.proxima ? x.proxima.valor : 0), 0);
    const rec = F.dreMes(monthKey(todayISO()), "competencia").rec;
    const base = F.simularDividas(0, S.metodo), com = F.simularDividas(S.extra, S.metodo);
    const PR = { Alta: 0, "Média": 1, Baixa: 2 };
    const ord = ativas.slice().sort((a, b) => S.metodo === "neve" ? a.saldo - b.saldo : S.metodo === "prioridade" ? PR[a.dv.prioridade] - PR[b.dv.prioridade] || a.saldo - b.saldo : (+b.dv.taxa || 0) - (+a.dv.taxa || 0) || a.saldo - b.saldo);
    /* aderência do mês (IDP do Piloto): parcelas pagas ÷ planejadas */
    const mkH = monthKey(todayISO()); const doMes = d.lanc.filter((l) => l.dividaId && monthKey(l.venc) === mkH);
    const plan = doMes.reduce((s2, l) => s2 + l.valor, 0), pagoM = doMes.filter((l) => l.pago).reduce((s2, l) => s2 + l.valor, 0); const idp = plan ? pagoM / plan : 0;
    const mesLbl = (n) => monthLabel(F.mesSeg(monthKey(todayISO()), n));
    root.innerHTML = ERP.pagehead("Dívidas", `<button class="btn orange" id="dNova">+ Dívida</button>`) + `
      <div class="kpis">${ERP.kpi("Saldo devedor", brl(tot), "valor presente das parcelas", tot ? "neg" : "")}${ERP.kpi("Parcelas por mês", brl(mes), rec ? num((mes / rec) * 100, 1) + "% da renda do mês" : "", rec && mes / rec > 0.3 ? "neg" : "")}${ERP.kpi("Juros embutidos", brl(ativas.reduce((s, x) => s + x.juros, 0)), "nominal − saldo")}${ERP.kpi("Quitação de tudo", base.meses ? mesLbl(base.meses) : "—", base.meses ? base.meses + " meses no ritmo atual" : "")}</div>
      ${ativas.length ? `<div class="card"><h3>Plano de quitação</h3>
        <div class="toolbar"><div class="tabs" style="margin:0"><button class="${S.metodo === "avalanche" ? "on" : ""}" data-met="avalanche" title="Paga primeiro a dívida com maior juros: gasta menos">Avalanche (maior juros)</button><button class="${S.metodo === "neve" ? "on" : ""}" data-met="neve" title="Paga primeiro a menor dívida: vitórias rápidas">Bola de neve (menor saldo)</button><button class="${S.metodo === "prioridade" ? "on" : ""}" data-met="prioridade" title="Pela prioridade que você definiu (Alta, Média, Baixa)">Por prioridade</button></div><label class="mut" for="dExtra">Extra por mês (R$)</label><input id="dExtra" type="number" step="50" value="${S.extra}" style="width:120px"></div>
        <div class="kpis" style="margin:10px 0">${ERP.kpi("Sem extra", base.meses + " meses", "juros " + brl(base.juros))}${ERP.kpi("Com " + brl(S.extra) + "/mês", com.meses + " meses", "juros " + brl(com.juros), "pos")}${ERP.kpi("Economia", brl(base.juros - com.juros), (base.meses - com.meses) + " meses antes", "pos")}</div>
        <ol class="fin-plano">${ord.map((x) => `<li><b>${esc(x.dv.nome)}</b> · saldo ${brl(x.saldo)} · ${num(+x.dv.taxa || 0, 2)}% a.m. · quita em <b>${com.quit[x.dv.id] ? mesLbl(com.quit[x.dv.id]) : "—"}</b>${x.atraso ? ` <span class="pill err">${x.atraso} em atraso</span>` : ""}</li>`).join("")}</ol>
        ${plan ? `<p class="fin-leg">Parcelas de ${monthLabel(mkH)}: pagas <b>${brl(pagoM)}</b> de <b>${brl(plan)}</b> planejadas · aderência <b class="${idp >= 0.98 ? "pos" : idp >= 0.9 ? "" : "neg"}">${Math.round(idp * 100)}% ● ${idp >= 0.98 ? "Aderente" : idp >= 0.9 ? "Atenção" : "Desvio"}</b></p>` : ""}
        <p class="mut fin-leg">Simulação: paga a parcela de todas e põe o extra (mais as parcelas de quem já quitou) na primeira da lista. Para pagar a mais de verdade, combine a amortização com o credor e ajuste as parcelas aqui.</p></div>` : ""}
      ${ativas.length ? `<div class="card"><h3>Projeção de desembolso mensal <small class="mut" style="font-weight:600">parcelas futuras · empilhado por dívida</small></h3><div class="fp-chart" style="height:240px"><canvas id="chDivProj"></canvas></div></div>` : ""}
      <div class="card"><h3>Dívidas cadastradas</h3>${infos.length ? `<div class="tw"><table><thead><tr><th>Dívida</th><th>Prioridade</th><th class="r">Parcela</th><th class="r">Restam</th><th class="r">Saldo devedor</th><th>Próximo vencimento</th><th>Última</th><th></th></tr></thead><tbody>${infos.map((x) => `<tr><td><b>${esc(x.dv.nome)}</b><div class="mut fin-sub">${esc(x.dv.credor || "")} ${x.dv.taxa ? "· " + num(+x.dv.taxa, 2) + "% a.m." : ""}</div></td><td><span class="pill ${x.dv.prioridade === "Alta" ? "err" : x.dv.prioridade === "Média" ? "warn" : ""}">${x.dv.prioridade}</span></td><td class="r">${x.proxima ? brl(x.proxima.valor) : ""}</td><td class="r">${x.rest ? x.rest + "x" : '<span class="pill ok">quitada</span>'}</td><td class="r">${brl(x.saldo)}</td><td>${x.proxima ? fdate(x.proxima.venc) + " " + pill(F.situacao(x.proxima)) : ""}</td><td>${x.ultima ? monthLabel(monthKey(x.ultima.venc)) : ""}</td><td class="r" style="white-space:nowrap">${x.proxima ? `<button class="btn sm" data-pay="${x.proxima.id}">Pagar parcela</button> ` : ""}<button class="btn ghost sm" data-dv="${x.dv.id}">Editar</button></td></tr>`).join("")}</tbody></table></div>` : `<div class="empty">Nenhuma dívida cadastrada. Cheque especial e cartão já aparecem no fluxo de caixa e nas faturas; cadastre aqui empréstimos, financiamentos e acordos.</div>`}</div>`;
    $("#dNova", root).onclick = () => dividaForm();
    $$("[data-dv]", root).forEach((b) => (b.onclick = () => dividaForm(d.dividas.find((x) => x.id === b.dataset.dv))));
    $$("[data-pay]", root).forEach((b) => (b.onclick = () => pagar(b.dataset.pay)));
    $$("[data-met]", root).forEach((b) => (b.onclick = () => { S.metodo = b.dataset.met; ERP.render(); }));
    if (ativas.length) {
      const H = Math.min(24, Math.max(6, ...ativas.map((x) => x.rest))); const ms = Array.from({ length: H }, (_, i) => F.mesSeg(mkH, i));
      const PAL = ["#3F6DB3", "#E0796F", "#C9922E", "#3A8F7E", "#8A63C2", "#7A8BA8"];
      const top = ativas.slice().sort((a, b) => b.saldo - a.saldo); const prim = top.slice(0, 5), resto = top.slice(5);
      const serie = (xs) => ms.map((mk) => d.lanc.filter((l) => xs.some((x) => x.dv.id === l.dividaId) && !l.pago && (l.venc < todayISO() ? mkH : monthKey(l.venc)) === mk).reduce((s2, l) => s2 + l.valor, 0));
      const ds = prim.map((x, i) => ({ label: x.dv.nome, data: serie([x]), backgroundColor: PAL[i], borderRadius: 3, stack: "s" })); if (resto.length) ds.push({ label: "Outras", data: serie(resto), backgroundColor: "#AEB6C2", stack: "s" });
      ERP.chart($("#chDivProj", root), { type: "bar", data: { labels: ms.map((m) => monthLabel(m)), datasets: ds }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { boxWidth: 10 } }, tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${brl(c.parsed.y)}`, footer: (its) => "Total do mês: " + brl(its.reduce((s2, i) => s2 + i.parsed.y, 0)) } } }, scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, grid: { color: () => ERP.cor("--line") } } } } });
    }
    const ex = $("#dExtra", root); if (ex) ex.onchange = (e) => { S.extra = Math.max(0, parseNum(e.target.value)); ERP.render(); };
  }

  /* ---------- 8. Metas e planejamento ---------- */
  function pMetas(root) {
    const d = D(); const c = d.cfg; const h = todayISO();
    const media = F.mediaEssencial(6); const alvoRes = media * (c.reservaMeses || 6);
    const metaRes = d.metas.find((m) => m.reserva); const guardRes = (metaRes ? +metaRes.guardado : 0) + F.saldoReservas();
    const pat = ERP.patrimonio ? ERP.patrimonio.total().net : 0;
    const anos = Math.max(1, (c.idadeApos || 60) - (c.idade || 40)); const n = anos * 12; const i = Math.pow(1 + (c.retornoReal || 4) / 100, 1 / 12) - 1;
    const alvoApos = (c.rendaDesejada || 0) * 12 / 0.04;
    const fvAtual = pat * Math.pow(1 + i, n); const falta = Math.max(0, alvoApos - fvAtual);
    const aporteNec = i > 0 ? falta * i / (Math.pow(1 + i, n) - 1) : falta / n;
    const proj = []; let v = pat; proj.push({ l: String(c.idade), v }); for (let k = 1; k <= n; k++) { v = v * (1 + i) + (+c.aporteApos || 0); if (k % 12 === 0 && (k / 12) % Math.max(1, Math.round(anos / 8)) === 0) proj.push({ l: String((c.idade || 40) + k / 12), v }); }
    const metaRow = (m) => { const p = m.alvo > 0 ? Math.min(100, (m.guardado / m.alvo) * 100) : 0; const meses = m.prazo ? Math.max(1, F.diasEntre(h, m.prazo) / 30.4) : 0; const porMes = meses ? Math.max(0, (m.alvo - m.guardado) / meses) : 0; return `<div class="fin-meta"><div><b>${esc(m.nome)}</b><div class="mut fin-sub">${brl(m.guardado)} de ${brl(m.alvo)}${m.prazo ? " · até " + fdate(m.prazo) : ""}${porMes ? " · guardar " + brl(porMes) + "/mês" : ""}</div><div class="bar"><i style="width:${p}%;background:${p >= 100 ? "var(--ok)" : "var(--orange)"}"></i></div></div><span class="v">${num(p, 0)}%</span><button class="btn sm" data-ap="${m.id}">Guardar</button><button class="btn ghost sm" data-me="${m.id}">Editar</button></div>`; };
    root.innerHTML = ERP.pagehead("Metas e planejamento", `<button class="btn orange" id="mNova">+ Meta</button>`) + `
      <div class="grid2"><div class="card"><h3>Reserva de emergência</h3>
        <div class="kpis" style="margin:0 0 10px">${ERP.kpi("Alvo", brl(alvoRes), `${c.reservaMeses || 6} meses × ${brl(media)} de custo essencial`)}${ERP.kpi("Guardado", brl(guardRes), alvoRes ? num((guardRes / alvoRes) * 100, 0) + "% · cobre " + num(media ? guardRes / media : 0, 1) + " meses" : "", guardRes >= alvoRes && alvoRes ? "pos" : "")}</div>
        <div class="bar"><i style="width:${alvoRes ? Math.min(100, (guardRes / alvoRes) * 100) : 0}%"></i></div>
        <p class="mut fin-leg">Conta como reserva o saldo das contas do tipo “Reserva” e a meta marcada como reserva. O custo essencial é a média de necessidades + financeiro dos últimos 6 meses.</p></div>
      <div class="card"><h3>Aposentadoria (independência financeira)</h3>
        <div class="kpis" style="margin:0 0 10px">${ERP.kpi("Patrimônio necessário", brl(alvoApos), `renda de ${brl(c.rendaDesejada)}/mês pela regra dos 4%`)}${ERP.kpi("Aporte mensal necessário", brl(aporteNec), `por ${anos} anos a ${num(c.retornoReal || 4, 1)}% a.a. real`, aporteNec > (c.aporteApos || 0) ? "neg" : "pos")}</div>
        ${linha(proj)}<p class="mut fin-leg">Projeção com patrimônio líquido de hoje (${brl(pat)}) e aporte de ${brl(c.aporteApos)}/mês. <a href="javascript:void 0" id="mApo">Ajustar premissas</a></p></div></div>
      <div class="card"><h3>Metas</h3>${d.metas.length ? d.metas.map(metaRow).join("") : `<div class="empty">Nenhuma meta. Exemplos: viagem, troca de carro, entrada de imóvel, reserva de emergência.</div>`}</div>`;
    const metaForm = (m) => { const nova = !m; m = m || { guardado: 0 }; ERP.form({ title: nova ? "Nova meta" : "Editar meta", fields: [{ k: "nome", label: "Nome", value: m.nome, required: true, full: true }, { k: "alvo", label: "Valor alvo (R$)", type: "number", step: "0.01", value: m.alvo }, { k: "guardado", label: "Já guardado (R$)", type: "number", step: "0.01", value: m.guardado }, { k: "prazo", label: "Prazo", type: "date", value: m.prazo }, { k: "reserva", label: "É a reserva de emergência", type: "checkbox", value: m.reserva }], onSubmit(v) { Store.change("financas", (dd) => { if (nova) dd.metas.push(Object.assign({ id: uid("mt"), hist: [] }, v)); else Object.assign(dd.metas.find((x) => x.id === m.id), v); }); ERP.render(); }, onDelete: nova ? null : () => { Store.change("financas", (dd) => { dd.metas = dd.metas.filter((x) => x.id !== m.id); }); ERP.render(); } }); };
    $("#mNova", root).onclick = () => metaForm();
    $$("[data-me]", root).forEach((b) => (b.onclick = () => metaForm(d.metas.find((x) => x.id === b.dataset.me))));
    $$("[data-ap]", root).forEach((b) => (b.onclick = () => { const m = d.metas.find((x) => x.id === b.dataset.ap); ERP.form({ title: "Guardar em " + m.nome, intro: "Opcional: lance também a saída da conta como aporte (categoria Investimentos e reservas).", fields: [{ k: "valor", label: "Valor (R$)", type: "number", step: "0.01" }, { k: "lanc", label: "Lançar como despesa de aporte", type: "checkbox", value: true }, { k: "contaId", label: "Saiu da conta", type: "select", options: F.contasAtivas().map((c2) => [c2.id, c2.nome]) }], onSubmit(v) { if (!v.valor) return false; salvar((dd) => { const x = dd.metas.find((y) => y.id === m.id); x.guardado = F.r2((+x.guardado || 0) + v.valor); (x.hist = x.hist || []).push({ em: todayISO(), v: v.valor }); if (v.lanc) { const cid = (dd.categorias.find((c2) => c2.natureza === "investimento" && (m.reserva ? /reserva/i.test(c2.nome) : /aporte/i.test(c2.nome))) || {}).id; dd.lanc.push({ id: uid("l"), tipo: "despesa", desc: "Aporte · " + m.nome, catId: cid, valor: F.r2(v.valor), contaId: v.contaId, comp: todayISO(), venc: todayISO(), pago: todayISO(), valorPago: F.r2(v.valor), hist: [{ em: new Date().toISOString(), o: "Aporte na meta" }] }); } }); ERP.render(); } }); }));
    $("#mApo", root).onclick = () => ERP.form({ title: "Premissas do planejamento", fields: [{ k: "idade", label: "Idade hoje", type: "number", value: c.idade }, { k: "idadeApos", label: "Idade para se aposentar", type: "number", value: c.idadeApos }, { k: "rendaDesejada", label: "Renda mensal desejada (R$ de hoje)", type: "number", step: "100", value: c.rendaDesejada }, { k: "retornoReal", label: "Retorno real (% a.a., acima da inflação)", type: "number", step: "0.1", value: c.retornoReal }, { k: "aporteApos", label: "Aporte mensal atual (R$)", type: "number", step: "100", value: c.aporteApos }, { k: "reservaMeses", label: "Meses de reserva de emergência", type: "number", value: c.reservaMeses }], onSubmit(v) { Store.change("financas", (dd) => Object.assign(dd.cfg, v)); ERP.render(); } });
  }

  /* ---------- 9. Relatórios (DRE pessoal e indicadores) ---------- */
  function pRel(root) {
    const reg = D().cfg.regime; const y = S.dreAno; const ms = Array.from({ length: 12 }, (_, i) => y + "-" + ERP.p2(i + 1)); const rs = ms.map((mk) => F.dreMes(mk, reg));
    const T = (k) => rs.reduce((s, r) => s + (r[k] || 0), 0);
    const linhaD = (n, k, cls, neg) => `<tr class="${cls || ""}"><td>${n}</td>${rs.map((r) => `<td class="r">${r[k] ? (neg ? "−" : "") + num(Math.abs(r[k]), 0) : ""}</td>`).join("")}<td class="r"><b>${(neg && T(k) ? "−" : "") + num(Math.abs(T(k)), 0)}</b></td></tr>`;
    const grupos = {}; D().categorias.forEach((c) => { if (c.tipo === "despesa") (grupos[c.natureza + "|" + c.grupo] = grupos[c.natureza + "|" + c.grupo] || []).push(c.id); });
    const linhaG = (nat) => Object.entries(grupos).filter(([k]) => k.startsWith(nat + "|")).map(([k, ids]) => { const vs = rs.map((r) => ids.reduce((s, id) => s + (r.porCat[id] || 0), 0)); const t = vs.reduce((a, b) => a + b, 0); return t ? `<tr class="fin-sub-row"><td>${esc(k.split("|")[1])}</td>${vs.map((v) => `<td class="r mut">${v ? num(v, 0) : ""}</td>`).join("")}<td class="r mut">${num(t, 0)}</td></tr>` : ""; }).join("");
    const rec = T("rec"), desp = T("despesas"), fin = T("financeiro"), inv = T("investimento"), res = T("resultado");
    const mesesAtivos = rs.filter((r) => r.n).length || 1;
    root.innerHTML = ERP.pagehead("Relatórios · " + y, `${regimeTgl()}<button class="btn ghost sm" data-ano="-1">‹ ${y - 1}</button><button class="btn ghost sm" data-ano="1">${y + 1} ›</button>`) + `
      <div class="kpis">${ERP.kpi("Receitas no ano", brl(rec), "média " + brl(rec / mesesAtivos) + "/mês", "pos")}${ERP.kpi("Despesas no ano", brl(desp), "média " + brl(desp / mesesAtivos) + "/mês", "neg")}${ERP.kpi("Taxa de poupança", rec ? num(((inv + Math.max(0, res - inv)) / rec) * 100, 1) + "%" : "—", "aportes + sobra ÷ receitas")}${ERP.kpi("Comprometimento com dívidas", rec ? num((fin / rec) * 100, 1) + "%" : "—", "financeiro ÷ receitas", rec && fin / rec > 0.3 ? "neg" : "")}${ERP.kpi("Custos fixos", desp ? num((T("fixo") / desp) * 100, 0) + "%" : "—", "das despesas")}</div>
      <div class="card"><h3>DRE pessoal · regime de ${reg === "caixa" ? "caixa" : "competência"}</h3><div class="tw"><table class="fin-dre"><thead><tr><th></th>${ms.map((m) => `<th class="r">${monthLabel(m)}</th>`).join("")}<th class="r">Total</th></tr></thead><tbody>
        ${linhaD("Receitas", "rec", "fin-pos")}
        ${linhaD("(−) Necessidades", "essencial", "", true)}${linhaG("essencial")}
        ${linhaD("(−) Estilo de vida", "estilo", "", true)}${linhaG("estilo")}
        ${linhaD("(=) Resultado antes do financeiro", "operacional", "total")}
        ${linhaD("(−) Financeiro (juros, tarifas, dívidas)", "financeiro", "", true)}${linhaG("financeiro")}
        ${linhaD("(=) Sobra do mês", "resultado", "total")}
        ${linhaD("(−) Investimentos e reservas", "investimento", "", true)}
        ${linhaD("(=) Saldo livre", "livre", "total")}</tbody></table></div>
        <p class="mut fin-leg">${reg === "caixa" ? "Caixa: o que foi pago e recebido; a fatura do cartão entra quando é paga, rateada pelas categorias das compras." : "Competência: quando a despesa aconteceu (compra no cartão na data da compra, parcelas mês a mês), com os previstos."}</p></div>`;
    bindReg(root); $$("[data-ano]", root).forEach((b) => (b.onclick = () => { S.dreAno += +b.dataset.ano; ERP.render(); }));
  }

  /* ---------- 10. Cadastros ---------- */
  function pCad(root) {
    const d = D(); const TIPOS = [["corrente", "Conta corrente"], ["poupanca", "Poupança"], ["reserva", "Reserva (fora do saldo do dia a dia)"], ["dinheiro", "Dinheiro"], ["digital", "Conta digital / carteira"]];
    const meses = []; for (let i = -6; i <= 0; i++) meses.push(F.mesSeg(monthKey(todayISO()), i));
    root.innerHTML = ERP.pagehead("Cadastros") + `
      <div class="card"><h3>Contas</h3><div class="tw"><table><thead><tr><th>Conta</th><th>Tipo</th><th class="r">Saldo inicial</th><th>Desde</th><th class="r">Saldo hoje</th></tr></thead><tbody>${d.contas.map((c) => `<tr class="fin-row" data-ct="${c.id}"><td><b>${esc(c.nome)}</b>${c.ativa === false ? ' <span class="pill">inativa</span>' : ""}<div class="mut fin-sub">${esc(c.banco || "")}${c.limite ? " · cheque especial " + brl(c.limite) : ""}</div></td><td class="mut">${esc((TIPOS.find((t) => t[0] === c.tipo) || [, ""])[1])}</td><td class="r">${brl(c.saldoIni)}</td><td>${fdate(c.dataIni)}</td><td class="r">${sinal(F.saldoConta(c.id))}</td></tr>`).join("")}</tbody></table></div><div class="toolbar" style="margin-top:10px"><button class="btn ghost sm" data-novo="ct">+ Conta</button><span class="mut fin-sub">Saldo inicial = o saldo do extrato no dia em “Desde”; daí em diante o ERP calcula.</span></div></div>
      <div class="card"><h3>Cartões de crédito</h3>${d.cartoes.length ? `<div class="tw"><table><thead><tr><th>Cartão</th><th>Fecha</th><th>Vence</th><th class="r">Limite</th><th>Paga pela conta</th></tr></thead><tbody>${d.cartoes.map((c) => `<tr class="fin-row" data-cc="${c.id}"><td><b>${esc(c.nome)}</b></td><td>dia ${c.fecha}</td><td>dia ${c.vence}</td><td class="r">${brl(c.limite)}</td><td class="mut">${esc((F.conta(c.contaId) || {}).nome || "")}</td></tr>`).join("")}</tbody></table></div>` : `<p class="mut">Nenhum cartão.</p>`}<div class="toolbar" style="margin-top:10px"><button class="btn ghost sm" data-novo="cc">+ Cartão</button></div></div>
      <div class="card"><h3>Recorrências</h3>${d.series.length ? `<div class="tw"><table><thead><tr><th>Descrição</th><th>Categoria</th><th>Dia</th><th>De</th><th>Até</th><th class="r">Valor</th></tr></thead><tbody>${d.series.map((s) => `<tr class="fin-row" data-sr="${s.id}"><td><b>${esc(s.desc)}</b>${s.ativa === false ? ' <span class="pill">pausada</span>' : ""}<div class="mut fin-sub">${s.cartaoId ? "💳 " + esc((F.cartao(s.cartaoId) || {}).nome || "") : "🏦 " + esc((F.conta(s.contaId) || {}).nome || "")}</div></td><td class="mut">${esc(F.cat(s.catId).nome)}</td><td>${s.dia}</td><td>${monthLabel(monthKey(s.inicio))}</td><td>${s.fim ? monthLabel(monthKey(s.fim)) : "sem fim"}</td><td class="r ${s.tipo === "receita" ? "pos" : ""}">${brl(s.valor)}</td></tr>`).join("")}</tbody></table></div>` : `<p class="mut">Nenhuma. Crie lançando com “Repetir todo mês”.</p>`}</div>
      <div class="card"><h3>Plano de contas</h3><p class="mut" style="margin-bottom:8px">Cada categoria tem uma natureza, que define a linha da DRE e a regra 50/30/20. Clique para editar.</p>${Object.entries(d.categorias.reduce((g, c) => ((g[c.grupo] = g[c.grupo] || []).push(c), g), {})).map(([g, cs]) => `<div class="fin-grp"><b>${esc(g)}</b> <span class="mut fin-sub">${esc(F.NAT[cs[0].natureza] || "")}</span><div>${cs.map((c) => `<button class="pill" data-cat="${c.id}" style="border:0;cursor:pointer;background:${c.cor}1f;color:${c.cor}${c.ativa === false ? ";opacity:.5" : ""}">${esc(c.nome)}${c.fixo ? " · fixo" : ""}</button>`).join(" ")}</div></div>`).join("")}<div class="toolbar" style="margin-top:10px"><button class="btn ghost sm" data-novo="cat">+ Categoria</button></div></div>
      <div class="card"><h3>Fechamento do mês</h3><p class="mut" style="margin-bottom:8px">Depois de conferir com o extrato, feche o mês: lançamentos do mês fechado não podem ser alterados nem excluídos até reabrir (com motivo).</p><div class="tw"><table><tbody>${meses.map((mk) => { const f = d.fechados[mk]; return `<tr><td><b>${monthLabel(mk)}</b></td><td>${f ? `<span class="pill ok">fechado em ${fdate(f.em.slice(0, 10))}</span>` : '<span class="pill">aberto</span>'}</td><td class="mut">${f ? "saldo das contas: " + brl(f.saldo) : ""}</td><td class="r">${f ? `<button class="btn ghost sm" data-reab="${mk}">Reabrir</button>` : mk < monthKey(todayISO()) ? `<button class="btn sm" data-fech="${mk}">Fechar</button>` : ""}</td></tr>`; }).join("")}</tbody></table></div></div>`;
    const contaF = (c) => ERP.form({ title: c ? "Editar conta" : "Nova conta", fields: [{ k: "nome", label: "Nome", value: c && c.nome, required: true }, { k: "banco", label: "Banco", value: c && c.banco }, { k: "tipo", label: "Tipo", type: "select", value: c && c.tipo, options: TIPOS }, { k: "saldoIni", label: "Saldo inicial (R$, negativo com −)", type: "number", step: "0.01", value: c ? c.saldoIni : 0 }, { k: "dataIni", label: "Saldo na data", type: "date", value: c ? c.dataIni : todayISO() }, { k: "limite", label: "Limite do cheque especial (R$)", type: "number", step: "0.01", value: c ? c.limite : 0 }, { k: "jurosCheque", label: "Juros do cheque especial (% a.m.)", type: "number", step: "0.01", value: c ? c.jurosCheque : 8 }, { k: "ativa", label: "Ativa", type: "checkbox", value: c ? c.ativa !== false : true }], onSubmit(v) { Store.change("financas", (dd) => { if (c) Object.assign(dd.contas.find((x) => x.id === c.id), v); else dd.contas.push(Object.assign({ id: uid("ct") }, v)); }); ERP.render(); }, onDelete: c ? () => { if (d.lanc.some((l) => l.contaId === c.id || l.paraId === c.id)) { ERP.toast("A conta tem lançamentos: marque como inativa."); return; } Store.change("financas", (dd) => { dd.contas = dd.contas.filter((x) => x.id !== c.id); }); ERP.render(); } : null });
    const cartaoF = (c) => ERP.form({ title: c ? "Editar cartão" : "Novo cartão", fields: [{ k: "nome", label: "Nome", value: c && c.nome, required: true, placeholder: "Ex.: Visa Santander 8038" }, { k: "limite", label: "Limite (R$)", type: "number", step: "0.01", value: c ? c.limite : 0 }, { k: "fecha", label: "Dia do fechamento", type: "number", value: c ? c.fecha : 1 }, { k: "vence", label: "Dia do vencimento", type: "number", value: c ? c.vence : 10 }, { k: "contaId", label: "Fatura paga pela conta", type: "select", value: c && c.contaId, options: F.contasAtivas().map((x) => [x.id, x.nome]) }], onSubmit(v) { if (!(v.fecha >= 1 && v.fecha <= 31 && v.vence >= 1 && v.vence <= 31)) { ERP.toast("Dias entre 1 e 31."); return false; } Store.change("financas", (dd) => { if (c) Object.assign(dd.cartoes.find((x) => x.id === c.id), v); else dd.cartoes.push(Object.assign({ id: uid("cc") }, v)); }); ERP.render(); }, onDelete: c ? () => { if (d.lanc.some((l) => l.cartaoId === c.id)) { ERP.toast("O cartão tem compras: não pode ser excluído."); return; } Store.change("financas", (dd) => { dd.cartoes = dd.cartoes.filter((x) => x.id !== c.id); }); ERP.render(); } : null });
    const catF = (c) => ERP.form({ title: c ? "Editar categoria" : "Nova categoria", fields: [{ k: "nome", label: "Nome", value: c && c.nome, required: true }, { k: "grupo", label: "Grupo", value: c ? c.grupo : "", placeholder: "Ex.: Moradia" }, { k: "natureza", label: "Natureza", type: "select", value: c ? c.natureza : "estilo", options: Object.entries(F.NAT) }, { k: "fixo", label: "Custo fixo (se repete todo mês)", type: "checkbox", value: c && c.fixo }, { k: "cor", label: "Cor (hex)", value: c ? c.cor : "#5B6068" }, { k: "ativa", label: "Ativa", type: "checkbox", value: c ? c.ativa !== false : true }], onSubmit(v) { v.tipo = v.natureza === "receita" ? "receita" : "despesa"; Store.change("financas", (dd) => { if (c) Object.assign(dd.categorias.find((x) => x.id === c.id), v); else dd.categorias.push(Object.assign({ id: uid("c") }, v)); }); ERP.render(); }, onDelete: c ? () => { if (d.lanc.some((l) => l.catId === c.id)) { ERP.toast("Categoria em uso: desative em vez de excluir."); return; } Store.change("financas", (dd) => { dd.categorias = dd.categorias.filter((x) => x.id !== c.id); }); ERP.render(); } : null });
    const serieF = (s) => ERP.form({ title: "Recorrência · " + s.desc, intro: "Alterações valem para os lançamentos em aberto a partir de hoje. Os já pagos não mudam.", fields: [{ k: "desc", label: "Descrição", value: s.desc, full: true }, { k: "valor", label: "Valor (R$)", type: "number", step: "0.01", value: s.valor }, { k: "dia", label: "Dia do mês", type: "number", value: s.dia }, { k: "fim", label: "Termina em (vazio = sem fim)", type: "date", value: s.fim || "" }, { k: "catId", label: "Categoria", type: "select", value: s.catId, options: catOpts(s.tipo === "receita" ? "receita" : "despesa") }, { k: "ativa", label: "Ativa", type: "checkbox", value: s.ativa !== false }],
      onSubmit(v) { salvar((dd) => { const x = dd.series.find((y) => y.id === s.id); Object.assign(x, { desc: v.desc, valor: F.r2(v.valor), dia: Math.min(31, Math.max(1, Math.round(v.dia))), fim: v.fim || null, catId: v.catId, ativa: v.ativa }); dd.lanc = dd.lanc.filter((l) => !(l.serieId === x.id && !l.pago && l.venc >= todayISO() && l.tipo !== "compra") && !(l.serieId === x.id && l.tipo === "compra" && l.comp >= todayISO())); }); ERP.toast("Recorrência atualizada."); ERP.render(); },
      onDelete() { salvar((dd) => { dd.lanc = dd.lanc.filter((l) => !(l.serieId === s.id && ((!l.pago && l.venc >= todayISO() && l.tipo !== "compra") || (l.tipo === "compra" && l.comp >= todayISO())))); dd.series = dd.series.filter((y) => y.id !== s.id); }); ERP.render(); }, deleteConfirm: "Excluir a recorrência e os próximos lançamentos em aberto? Os já pagos ficam." });
    root.onclick = (e) => {
      const b = e.target.closest("[data-ct],[data-cc],[data-cat],[data-sr],[data-novo],[data-fech],[data-reab]"); if (!b) return;
      if (b.dataset.ct) contaF(d.contas.find((x) => x.id === b.dataset.ct)); else if (b.dataset.cc) cartaoF(d.cartoes.find((x) => x.id === b.dataset.cc));
      else if (b.dataset.cat) catF(d.categorias.find((x) => x.id === b.dataset.cat)); else if (b.dataset.sr) serieF(d.series.find((x) => x.id === b.dataset.sr));
      else if (b.dataset.novo) ({ ct: contaF, cc: cartaoF, cat: catF })[b.dataset.novo](null);
      else if (b.dataset.fech) { const mk = b.dataset.fech; const ab = d.lanc.filter((l) => !l.pago && l.tipo !== "compra" && monthKey(l.venc) === mk); ERP.confirm(`Fechar ${monthLabel(mk)}?${ab.length ? ` Há ${ab.length} lançamento(s) desse mês ainda em aberto.` : ""} Depois, nada desse mês pode ser alterado sem reabrir.`, "Fechar o mês").then((ok) => { if (!ok) return; Store.change("financas", (dd) => { dd.fechados[mk] = { em: new Date().toISOString(), saldo: F.contasAtivas().reduce((s, c) => s + F.saldoConta(c.id, F.diaNoMes(mk, 31)), 0) }; }); ERP.render(); }); }
      else if (b.dataset.reab) { const mk = b.dataset.reab; ERP.form({ title: "Reabrir " + monthLabel(mk), fields: [{ k: "motivo", label: "Motivo", required: true, full: true }], okLabel: "Reabrir", onSubmit(v) { if (!v.motivo.trim()) return false; Store.change("financas", (dd) => { (dd.reaberturas = dd.reaberturas || []).push({ mk, em: new Date().toISOString(), motivo: v.motivo.trim() }); delete dd.fechados[mk]; }); ERP.render(); } }); }
    };
  }

  /* exemplo removível (para conhecer as telas) */
  ERP.finExemplo = function () {
    const h = todayISO(), mk = monthKey(h);
    salvar((d) => {
      const ct = { id: "ex_ct", nome: "Conta exemplo", tipo: "corrente", banco: "Banco exemplo", saldoIni: 3500, dataIni: F.diaNoMes(F.mesSeg(mk, -2), 1), limite: 5000, jurosCheque: 8, ativa: true, ex: 1 };
      const rs = { id: "ex_res", nome: "Reserva exemplo", tipo: "reserva", saldoIni: 12000, dataIni: ct.dataIni, ativa: true, ex: 1 };
      const cc = { id: "ex_cc", nome: "Cartão exemplo", limite: 8000, fecha: 5, vence: 12, contaId: "ex_ct", ex: 1 };
      d.contas.push(ct, rs); d.cartoes.push(cc);
      const c = (n) => (d.categorias.find((x) => x.nome === n) || {}).id;
      [["Salário exemplo", "receita", c("Salário / pró-labore"), 14000, 5], ["Aluguel exemplo", "despesa", c("Aluguel / financiamento"), 3200, 10], ["Condomínio exemplo", "despesa", c("Condomínio"), 850, 10], ["Energia exemplo", "despesa", c("Energia"), 320, 15], ["Plano de saúde exemplo", "despesa", c("Plano de saúde"), 1100, 20], ["Aporte exemplo", "despesa", c("Aportes em investimentos"), 1500, 6]].forEach(([desc, tipo, catId, valor, dia]) => d.series.push({ id: uid("s"), tipo, desc, catId, valor, dia, inicio: F.diaNoMes(F.mesSeg(mk, -2), dia), fim: null, contaId: "ex_ct", ativa: true, ex: 1 }));
      d.series.push({ id: uid("s"), tipo: "despesa", desc: "Streaming exemplo", catId: c("Assinaturas e streaming"), valor: 55.9, dia: 8, inicio: F.diaNoMes(F.mesSeg(mk, -2), 8), fim: null, cartaoId: "ex_cc", ativa: true, ex: 1 });
      F.materializar(d);
      d.lanc.forEach((l) => { if (l.serieId && d.series.find((s) => s.id === l.serieId && s.ex) && l.venc <= h && l.tipo !== "compra") { l.pago = l.venc; l.valorPago = l.valor; } if (l.serieId && d.series.find((s) => s.id === l.serieId && s.ex)) l.ex = 1; });
      [["Mercado exemplo", "Mercado", 612.4, -1], ["Restaurante exemplo", "Restaurantes e delivery", 186, -3], ["Farmácia exemplo", "Farmácia", 94.5, -8], ["Mercado exemplo", "Mercado", 538.2, -20], ["Viagem exemplo (3x)", "Viagens", 2400, -25]].forEach(([desc, cn, v, dd], i) => { const dt = F.addDias(h, dd); const n = i === 4 ? 3 : 1; const per = F.r2(v / n); for (let k = 0; k < n; k++) d.lanc.push({ id: uid("l"), tipo: "compra", cartaoId: "ex_cc", desc: n > 1 ? `${desc} ${k + 1}/${n}` : desc, catId: c(cn), valor: per, comp: addMonths(dt, k), venc: dt, fatura: F.mesSeg(F.faturaDe(cc, dt).key, k), parcela: n > 1 ? { g: "ex_g", n: k + 1, t: n } : undefined, pago: null, ex: 1 }); });
      const dv = { id: "ex_dv", nome: "Empréstimo exemplo", credor: "Banco exemplo", tipo: "emprestimo", prioridade: "Alta", taxa: 2.9, contaId: "ex_ct", dia: 18, ex: 1 }; d.dividas.push(dv);
      for (let i = 0; i < 14; i++) { const dt = F.diaNoMes(F.mesSeg(mk, i), 18); d.lanc.push({ id: uid("l"), tipo: "despesa", dividaId: "ex_dv", desc: "Empréstimo exemplo · parcela", catId: F.DIVIDA_CAT, valor: 780, contaId: "ex_ct", comp: dt, venc: dt, pago: null, ex: 1 }); }
      d.metas.push({ id: "ex_mt", nome: "Viagem de férias (exemplo)", alvo: 15000, guardado: 4200, prazo: F.diaNoMes(F.mesSeg(mk, 9), 1), ex: 1 });
      d.orcamento.meses[mk] = Object.assign({}, d.orcamento.meses[mk], { [c("Mercado")]: 1400, [c("Restaurantes e delivery")]: 600, [c("Farmácia")]: 200, [c("Viagens")]: 500 });
    });
    ERP.toast("Exemplo carregado. Para tirar: Sistema › Remover exemplos."); ERP.render();
  };
  ERP.finRemoverExemplo = function () {
    Store.change("financas", (d) => { d.lanc = d.lanc.filter((l) => !l.ex && !["ex_ct", "ex_cc"].includes(l.contaId) && l.cartaoId !== "ex_cc" && l.dividaId !== "ex_dv"); d.series = d.series.filter((s) => !s.ex); d.contas = d.contas.filter((c) => !c.ex); d.cartoes = d.cartoes.filter((c) => !c.ex); d.dividas = d.dividas.filter((c) => !c.ex); d.metas = d.metas.filter((c) => !c.ex); delete d.orcamento.meses[monthKey(todayISO())]; });
    ERP.toast("Exemplos removidos."); ERP.render();
  };
  ERP.temExemplo = () => D().contas.some((c) => c.ex);

  /* materializa recorrências ao abrir (sem marcar como alterado se nada mudou) */
  ERP.onBoot = (ERP.onBoot || []).concat(() => { const d = D(); const antes = d.lanc.length; F.materializar(d); if (d.lanc.length !== antes) Store.change("financas", () => {}); });

  ERP.finUI = { S, lancForm, pagar, estornar, pagarFatura, rapido, salvar, hist, pill, sinal, catOpts, origemOpts, barras, linha };
  ERP.register({ id: "financas", label: "Finanças Pessoais", short: "Finanças", icon: "wallet", group: "Finanças", pages: [
    { id: "painel", label: "Painel", render: pPainel }, { id: "lancamentos", label: "Lançamentos", render: pLanc }, { id: "agenda", label: "A pagar e a receber", render: pAgenda },
    { id: "cartoes", label: "Cartões", render: pCartoes }, { id: "fluxo", label: "Fluxo de caixa", render: pFluxo }, { id: "orcamento", label: "Orçamento", render: pOrc },
    { id: "dividas", label: "Dívidas", render: pDividas }, { id: "metas", label: "Metas e planejamento", render: pMetas }, { id: "relatorios", label: "Relatórios", render: pRel }, { id: "cadastros", label: "Cadastros", render: pCad } ] });
})();
