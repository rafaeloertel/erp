/* Sistema — dados e sincronização (OneDrive), backup, importação de dados iniciais, sobre */
(function () {
  "use strict";
  const { $, esc, todayISO, Store, Cloud } = ERP;

  function importFile(file, mode) {
    const r = new FileReader();
    r.onload = async () => {
      let j; try { j = JSON.parse(r.result); } catch (e) { ERP.toast("Arquivo inválido."); return; }
      const docs = j.docs || (j.doc && j.data ? { [j.doc]: j.data } : null);
      if (!docs) { ERP.toast("Este arquivo não é um backup do ERP Rafael."); return; }
      const names = Object.keys(docs).filter((n) => ERP.defaults[n]);
      const label = names.join(", ");
      if (!(await ERP.confirm(`${mode === "merge" ? "Juntar" : "Substituir"} os dados de: ${label}? ${mode === "merge" ? "Itens com o mesmo ID são atualizados; os demais são mantidos." : "Os dados atuais desses módulos serão trocados."}`, "Importar"))) return;
      names.forEach((n) => Store.change(n, (cur) => {
        const inc = docs[n];
        Object.keys(inc).forEach((k) => {
          if (mode === "merge" && Array.isArray(inc[k]) && Array.isArray(cur[k])) { const by = new Map(cur[k].map((x) => [x.id, x])); inc[k].forEach((x) => by.set(x.id, Object.assign(by.get(x.id) || {}, x))); cur[k] = Array.from(by.values()); }
          else if (mode === "merge" && inc[k] && typeof inc[k] === "object" && !Array.isArray(inc[k]) && cur[k] && typeof cur[k] === "object") cur[k] = Object.assign({}, cur[k], inc[k], k === "fx" ? { ptax: Object.assign({}, cur[k].ptax, inc[k].ptax) } : {});
          else cur[k] = inc[k];
        });
      }));
      ERP.toast("Importado: " + label); ERP.render();
    };
    r.readAsText(file);
  }

  function pDados(root) {
    const cfg = Cloud.cfg();
    const st = Store.names().map((n) => { const m = Store.meta[n]; return `<tr><td>${esc(n)}.json</td><td>${m.updatedAt ? new Date(m.updatedAt).toLocaleString("pt-BR") : "—"}</td><td>${m.dirty ? '<span class="pill warn">pendente</span>' : m.etag ? '<span class="pill ok">no OneDrive</span>' : '<span class="pill">só local</span>'}</td></tr>`; }).join("");
    root.innerHTML = ERP.pagehead("Dados e sincronização") + `
      <div class="card"><h3>OneDrive (fonte oficial dos dados)</h3>
        <p style="margin-bottom:10px">Os dados ficam num arquivo JSON por módulo na pasta <b>ERP Rafael</b> do OneDrive da conta Microsoft pessoal. Cada aparelho guarda uma cópia de trabalho e sincroniza ao abrir e ao editar. O código no GitHub é público e não contém dados.</p>
        <p class="mut" style="margin-bottom:10px">O login aceita só contas Microsoft <b>pessoais</b> (rafael.oertel@gmail.com). Contas corporativas, como a da Nova Macabu, são recusadas pela própria Microsoft — os dados nunca vão para o OneDrive da empresa.</p>
        <p class="mut" style="margin-bottom:12px">Situação: <b>${esc(Cloud.msg)}</b>${Cloud.account ? " · conta " + esc(Cloud.account.username) : ""}</p>
        <div class="fg" style="max-width:640px"><div class="f full"><label for="cid">ID do aplicativo (Microsoft Entra · “Application (client) ID”)</label><input id="cid" value="${esc(cfg.clientId || "")}" placeholder="00000000-0000-0000-0000-000000000000"></div></div>
        <div class="toolbar" style="margin-top:12px"><button class="btn ghost" id="cSave">Salvar ID</button>${Cloud.account ? `<button class="btn" id="cSync">Sincronizar agora</button><button class="btn ghost" id="cOut">Sair da conta</button>` : `<button class="btn orange" id="cIn">Entrar com Microsoft</button>`}</div>
        <p class="mut" style="font-size:12.5px;margin-top:8px">Endereço de retorno para cadastrar no aplicativo: <code>${esc(Cloud.redirectUri())}</code> (tipo “Aplicativo de página única — SPA”).</p></div>
      <div class="card"><h3>Arquivos</h3><div class="tw"><table><thead><tr><th>Arquivo</th><th>Última alteração</th><th>Situação</th></tr></thead><tbody>${st}</tbody></table></div></div>
      <div class="card"><h3>Backup e importação</h3>
        <p class="mut" style="margin-bottom:10px">Use “Juntar” para carregar os dados iniciais (arquivo enviado pelo Claude) sem apagar o que já existe.</p>
        <div class="toolbar"><button class="btn ghost" id="bExp">Baixar backup completo</button><label class="btn ghost" style="cursor:pointer">Importar e juntar<input type="file" accept=".json,application/json" id="iMerge" hidden></label><label class="btn ghost" style="cursor:pointer">Importar e substituir<input type="file" accept=".json,application/json" id="iRep" hidden></label></div></div>
      <div class="card"><h3>Dados de exemplo</h3><p class="mut" style="margin-bottom:10px">Para conhecer Finanças Pessoais com números: carrega uma conta, um cartão, recorrências, compras, um empréstimo e uma meta, todos marcados como exemplo. Remover apaga só eles.</p><div class="toolbar">${ERP.temExemplo() ? `<button class="btn ghost" id="exRem">Remover exemplos</button>` : `<button class="btn ghost" id="exAdd">Carregar exemplo</button>`}</div></div>
      <div class="card"><h3>Aparência</h3><p class="mut" style="margin-bottom:12px">Automático acompanha o modo claro ou escuro do aparelho. O botão de lua/sol no menu alterna na hora.</p><div class="tabs" id="aTheme" style="margin:0">${[["auto", "Automático"], ["light", "Claro"], ["dark", "Escuro"]].map(([k, n]) => `<button data-th="${k}" class="${ERP.theme() === k ? "on" : ""}">${n}</button>`).join("")}</div></div>
      <div class="card"><h3>Sobre</h3><p>ERP Rafael ${esc(ERP.version)} · módulos: ${ERP.modules.map((m) => esc(m.label)).join(", ")}.</p></div>`;
    $("#aTheme", root).onclick = (e) => { const b = e.target.closest("[data-th]"); if (b) ERP.setTheme(b.dataset.th); };
    $("#cSave", root).onclick = () => { ERP.lsSet("cloud", { clientId: $("#cid", root).value.trim() }); ERP.toast("ID salvo. Recarregando…"); setTimeout(() => location.reload(), 600); };
    const i = $("#cIn", root); if (i) i.onclick = () => Cloud.login();
    const s = $("#cSync", root); if (s) s.onclick = async () => { await Cloud.pullAll(); for (const n of Store.names()) if (Store.meta[n].dirty) await Cloud.push(n).catch(() => {}); ERP.render(); };
    const o = $("#cOut", root); if (o) o.onclick = () => Cloud.logout();
    const ea = $("#exAdd", root); if (ea) ea.onclick = () => ERP.finExemplo();
    const er = $("#exRem", root); if (er) er.onclick = () => ERP.confirm("Remover todos os dados de exemplo?", "Remover").then((ok) => ok && ERP.finRemoverExemplo());
    $("#bExp", root).onclick = () => { const docs = {}; Store.names().forEach((n) => (docs[n] = Store.get(n))); ERP.download(`erp-rafael-backup-${todayISO()}.json`, JSON.stringify({ app: "erp-rafael", version: ERP.version, savedAt: new Date().toISOString(), docs }, null, 2)); };
    $("#iMerge", root).onchange = (e) => e.target.files[0] && importFile(e.target.files[0], "merge");
    $("#iRep", root).onchange = (e) => e.target.files[0] && importFile(e.target.files[0], "replace");
  }
  ERP.register({ id: "sistema", label: "Sistema", icon: "settings", group: "Sistema", pages: [{ id: "dados", label: "Dados e sincronização", render: pDados }] });
})();
