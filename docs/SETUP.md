# Ligar o login Microsoft e o OneDrive (uma vez só, ~5 min)

O ERP usa o login da conta Microsoft pessoal **rafael.oertel@gmail.com** para gravar no OneDrive dela. Para isso é preciso registrar um "aplicativo" gratuito no Microsoft Entra.

1. Entre em https://entra.microsoft.com com uma conta **corporativa** que já tenha um locatário (tenant), por exemplo a de administrador da Nova Macabu.
   - Conta pessoal (Gmail/Outlook) não abre o Entra: dá o erro "A conta de usuário selecionada não existe no locatário 'Microsoft Services'". O registro do app só precisa morar num locatário qualquer; quem faz login no ERP continua sendo a conta pessoal, e os dados vão para o OneDrive dela.
2. **App registrations › New registration**
   - Name: `ERP Rafael`
   - Supported account types: **Personal Microsoft accounts only**
   - Redirect URI: plataforma **Single-page application (SPA)**, endereço `https://rafaeloertel.github.io/erp-rafael/`
   - Register.
3. Copie o **Application (client) ID** da tela que abrir.
4. Em **API permissions**, confira que existem `User.Read` e adicione `Files.ReadWrite` (Microsoft Graph › Delegated). Conta pessoal não precisa de consentimento de administrador.
5. Abra o ERP › **Sistema › Dados e sincronização**, cole o ID, **Salvar ID**, depois **Entrar com Microsoft**.

Na primeira entrada, o ERP cria a pasta `ERP Rafael` no OneDrive e envia os módulos que já tiverem dados. Nos outros aparelhos basta colar o mesmo ID e entrar.

## Dados iniciais

O arquivo `erp-rafael-dados-iniciais.json` (enviado no chat, não fica no GitHub) traz as 9 listas e 19 itens do Reminders e a carteira da IBKR. Em **Sistema › Backup e importação › Importar e juntar**.

## Make (opcional)

Não é necessário para gravar dados. Fica para automações futuras (ex.: atualizar cotações ou enviar lembretes por e-mail), numa conta Make de rafael.oertel@gmail.com.
