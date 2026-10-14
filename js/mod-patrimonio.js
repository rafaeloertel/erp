/* Patrimônio (piloto) — consolida contas, investimentos, bens e dívidas; fotografias mensais da evolução */
(function () {
  "use strict";
  const { $, $$, esc, uid, brl, num, todayISO, fdate, monthLabel, Store } = ERP;
  ERP.defaults.patrimonio = { items: [], snapshots: [] };
  const KIND = [["imovel", "Imóvel"], ["veiculo", "Veículo"], ["previdencia", "Previdência"], ["participacao", "Participação societária"], ["outro_bem", "Outro bem"], ["divida", "Dívida / financiamento"]];
  const KN = Object.fromEntries(KIND);
  const D = () => Store.get("patrimonio");

  function total() {
    const acc = ERP.custos.accounts().filter((a) => a.type !== "exterior").reduce((s, a) => s + ERP.custos.accBalance(a.id), 0);
    const inv = ERP.investimentos.carteira().totalBRL;
    const bens = D().items.filter((i) => i.kind !== "divida").reduce((s, i) => s + +i.value, 0);
    const div = D().items.filter((i) => i.kind === "divida").reduce((s, i) => s + +i.value, 0);
    return { acc, inv, bens, div, net: acc + inv + bens - div };
  }
  ERP.patrimonio = { total };

  function itemForm(it) {
    const isNew = !it; it = it || { kind: "imovel", date: todayISO() };
    ERP.form({ title: isNew ? "Novo item" : "Editar item", fields: [
      { k: "name", label: "Descrição", value: it.name, full: true, required: true }, { k: "kind", label: "Tipo", type: "select", value: it.kind, options: KIND },
      { k: "value", label: "Valor atual (R$) — dívida: saldo devedor", type: "number", step: "0.01", value: it.value }, { k: "date", label: "Avaliado em", type: "date", value: it.date },
      { k: "cost", label: "Custo de aquisição (R$, para o IRPF)", type: "number", step: "0.01", value: it.cost }, { k: "notes", label: "Observação", value: it.notes, full: true } ],
      onSubmit(v) { Store.change("patrimonio", (d) => { if (isNew) d.items.push(Object.assign({ id: uid("pt") }, v)); else Object.assign(d.items.find((x) => x.id === it.id), v); }); ERP.render(); },
      onDelete: isNew ? null : () => { Store.change("patrimonio", (d) => { d.items = d.items.filter((x) => x.id !== it.id); }); ERP.render(); } });
  }

  function render(root) {
    const t = total(); const d = D(); const parts = [["Contas no Brasil", t.acc], ["Investimentos", t.inv], ["Bens", t.bens]]; const gross = parts.reduce((s, p) => s + Math.max(0, p[1]), 0) || 1;
    const snaps = d.snapshots.slice().sort((a, b) => a.month.localeCompare(b.month)).slice(-12); const mx = Math.max(1, ...snaps.map((s) => Math.abs(s.net)));
    root.innerHTML = ERP.pagehead("Patrimônio", `<button class="btn ghost" id="pSnap">Registrar foto do mês</button><button class="btn orange" id="pNew">+ Bem ou dívida</button>`) + `
      <div class="note info">Módulo piloto: junta automaticamente os saldos de Custos Pessoais e a carteira de Investimentos, e você cadastra o resto (imóveis, veículos, previdência, dívidas).</div>
      <div class="kpis">${ERP.kpi("Patrimônio líquido", brl(t.net), "", t.net >= 0 ? "pos" : "neg")}${ERP.kpi("Contas no Brasil", brl(t.acc))}${ERP.kpi("Investimentos", brl(t.inv), "câmbio " + num(ERP.investimentos.fx(), 4))}${ERP.kpi("Bens", brl(t.bens))}${ERP.kpi("Dívidas", brl(t.div), "", t.div ? "neg" : "")}</div>
      <div class="grid2"><div class="card"><h3>Composição</h3>${parts.map(([n, v]) => `<div class="hrow"><span class="n">${n}</span><div class="bar"><i style="width:${(Math.max(0, v) / gross) * 100}%"></i></div><span class="v">${num((Math.max(0, v) / gross) * 100, 1)}%</span></div>`).join("")}</div>
      <div class="card"><h3>Evolução (fotos mensais)</h3>${snaps.length ? `<div class="cols6">${snaps.map((s) => `<div class="c"><div class="pair"><i style="height:${(Math.abs(s.net) / mx) * 100}%;width:60%" title="${brl(s.net)}"></i></div><small>${monthLabel(s.month)}</small></div>`).join("")}</div>` : `<div class="empty">Registre a foto do mês para acompanhar a evolução.</div>`}</div></div>
      <div class="card"><h3>Bens e dívidas cadastrados</h3>${d.items.length ? `<div class="tw"><table><thead><tr><th>Descrição</th><th>Tipo</th><th>Avaliado em</th><th class="r">Valor</th></tr></thead><tbody>${d.items.map((i) => `<tr data-it="${i.id}" style="cursor:pointer"><td>${esc(i.name)}</td><td><span class="pill ${i.kind === "divida" ? "err" : ""}">${KN[i.kind]}</span></td><td>${fdate(i.date)}</td><td class="r ${i.kind === "divida" ? "neg" : ""}">${i.kind === "divida" ? "−" : ""}${brl(i.value)}</td></tr>`).join("")}</tbody></table></div>` : `<div class="empty">Nenhum item.</div>`}</div>`;
    $("#pNew", root).onclick = () => itemForm();
    $$("[data-it]", root).forEach((r) => (r.onclick = () => itemForm(d.items.find((x) => x.id === r.dataset.it))));
    $("#pSnap", root).onclick = () => { const m = todayISO().slice(0, 7); Store.change("patrimonio", (dd) => { dd.snapshots = dd.snapshots.filter((s) => s.month !== m); dd.snapshots.push(Object.assign({ month: m, at: todayISO() }, total())); }); ERP.toast("Foto de " + monthLabel(m) + " registrada."); ERP.render(); };
  }
  ERP.register({ id: "patrimonio", label: "Patrimônio", icon: "🏛️", group: "Finanças", render });
})();
