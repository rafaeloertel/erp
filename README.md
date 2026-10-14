# ERP Rafael

ERP pessoal no mesmo padrão do ERP Nova Macabu: página estática no GitHub Pages, login Microsoft (MSAL) e dados oficiais na nuvem Microsoft de **rafael.oertel@gmail.com**.

Endereço: https://rafaeloertel.github.io/erp-rafael/

## Módulos

| Módulo | O que faz |
|---|---|
| Início | Painel com patrimônio, resultado do mês, investimentos, demandas e contas do dia |
| Reminders | Central de Demandas: listas, prazos, prioridade, checklist, sinalizadas, visão Lista e Kanban, lançamento rápido (`@pessoa 10/06 !alta #etiqueta`) |
| Custos Pessoais | Lançamentos, contas a pagar recorrentes, cartões (fatura pelo dia de fechamento, parcelas até 48x, pagamento de fatura sem duplicar despesa), DRE anual, fixos × variáveis, CSV |
| Investimentos | Carteira (IBKR e outras corretoras), preço médio, resultado, movimentações, PTAX, apoio ao IRPF (Bens e Direitos, ganhos, dividendos, estimativa de 15%) |
| Patrimônio (piloto) | Junta contas + investimentos + bens − dívidas, com fotos mensais da evolução |
| Sistema | Login Microsoft, sincronização OneDrive, backup e importação |

## Dados

**Nada de dados pessoais vai para este repositório** (ele é público). Os dados ficam:

1. No **OneDrive** da conta pessoal, pasta `ERP Rafael/`, um arquivo por módulo (`reminders.json`, `custos.json`, `investimentos.json`, `patrimonio.json`). Esta é a fonte oficial.
2. Numa cópia de trabalho no navegador de cada aparelho, que sincroniza ao abrir e ~2,5 s depois de cada edição. Se dois aparelhos editarem o mesmo módulo ao mesmo tempo, o sistema pergunta qual versão manter.

Por que OneDrive e não Microsoft Lists/SharePoint: na conta Microsoft pessoal (Family), a API de listas do Microsoft Graph não é suportada ("Delegated (personal Microsoft account): Not supported"). O OneDrive pessoal é suportado (`Files.ReadWrite`).

Configuração do login: ver [docs/SETUP.md](docs/SETUP.md).

## Estrutura

```
index.html              casca da página
assets/app.css          visual (tokens do ERP Nova Macabu)
assets/msal-browser.min.js  login Microsoft (MSAL v5)
js/core.js              núcleo: armazenamento local + OneDrive, rotas, modais
js/mod-*.js             um arquivo por módulo (ERP.register)
```

Para criar um módulo novo: um arquivo `js/mod-x.js` que define `ERP.defaults.x` (vira `x.json` no OneDrive) e chama `ERP.register({ id, label, icon, group, pages|render })`, e uma linha no `index.html`.
