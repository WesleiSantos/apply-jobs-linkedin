# LinkedIn Auto-Apply Bot 🤖

Uma extensão para navegadores baseados em Chromium (Google Chrome, Edge, Brave, etc.) que automatiza o processo de candidatura a vagas na plataforma LinkedIn. O bot navega pelas vagas da pesquisa automaticamente, preenche os formulários utilizando uma integração inteligente de IA através do **n8n** e avança pelas páginas de resultados de forma totalmente autônoma.

## 🌟 Funcionalidades

- **Candidatura Automática**: Varre a lista de vagas abertas na sua pesquisa atual e clica em "Candidatura Simplificada".
- **Integração com IA (n8n)**: Envia as perguntas do formulário para o webhook do n8n, que retorna as respostas ideais com base no seu currículo e perfil.
- **Navegação Inteligente**: Evita comportamentos de looping infinito filtrando as referências repetidas da mesma vaga na interface do LinkedIn.
- **Auto-Paginação**: Avança automaticamente para a próxima página de resultados após finalizar as vagas da página atual.
- **Preenchimento Dinâmico**: Lida com diferentes tipos de inputs do LinkedIn, incluindo caixas de texto, `selects`, `checkboxes`, botões de rádio e campos de auto-completar (*Typeahead*).
- **Detecção de Bloqueios**: Aborta vagas de forma inteligente quando encontra exigências de arquivos manuais (como uploads de um currículo PDF específico) ou travamentos não previstos.
- **Interface Flutuante Injetada**: Conta com um painel no LinkedIn (canto inferior direito) para controle e configuração, permitindo:
  - Definir e testar a URL de Webhook do n8n.
  - Acompanhar os logs simulados em tempo real na aba da página.
  - Iniciar/Parar a robô a qualquer momento.

## 🛠️ Instalação (Como Extensão Descompactada)

1. Faça o download ou clone este repositório para o seu computador.
2. Abra o Google Chrome (ou derivados).
3. Na barra de endereços, digite `chrome://extensions/` e pressione Enter.
4. No canto superior direito, ative a opção **Modo do desenvolvedor** (Developer mode).
5. Clique no botão **Carregar sem compactação** (Load unpacked) no topo à esquerda.
6. Selecione a pasta onde estão os arquivos `manifest.json` e `content.js`, e confirme. A extensão será instalada.

## 🚀 Como Usar e Configurar

### Configurando o Webhook (IA / n8n)
O robô precisa de uma "mente" para preencher as respostas!
1. Crie um fluxo no [n8n](https://n8n.io/) (com um node de **Webhook** no início) que receba o JSON da extensão, gere as respostas para o formulário através de IA (ex: OpenAI, Anthropic, Gemini) e devolva o JSON estruturado para o navegador.
2. Abra o LinkedIn e faça uma pesquisa de vagas (`https://www.linkedin.com/jobs/search/...`) aplicando os filtros: "Candidatura Simplificada".
3. O painel flutuante ("🤖 LinkedIn Auto-Apply Bot") abrirá no canto da tela.
4. Em **Endpoint IA (n8n Webhook URL)**, insira a URL do seu webhook n8n (ex: `https://meu-n8n.com/webhook/linkedin-ia`).
5. Clique em **🔌 Testar**. O painel retornará se a conectividade com o seu webhook está funcionado (Status 200). Se apresentar falha de CORS, será necessário ajustar as permissões no cabeçalho do webhook.

### Iniciando as Candidaturas
1. Com a URL configurada e testada, clique no botão verde **▶ Iniciar**.
2. A extensão assumirá o controle: vai escanear a lista de vagas da página, tentar o auto-preenchimento validando botão por botão, e seguir interagindo até finalizar todas as páginas.
3. Você pode cancelar à qualquer momento acionando o botão vermelho **🛑 Parar**.

## ⚠️ Avisos e Precauções Importantes

- **Limites e Diretrizes (Anti-Spam)**: O LinkedIn possui regras rígidas contra ferramentas de automação na sua plataforma. **Sempre use com moderação**. Configurações de tempo e pausas humanas já foram pensadas no script (`esperar()`) para simular uma velocidade mais real. Se feito em alta frequência, o LinkedIn pode limitar a conta.
- O payload devolvido pelo webhook precisa ser no formato JSON para injeção programada no DOM.
- A automação simplifica o trabalho braçal da pesquisa, mas **não substitui revisões e interações manuais específicas** (como anexar trabalhos de portfólio customizados).

## 📄 Estrutura do Projeto

* `manifest.json`: Metadados e permissões da Extensão do Chrome, ativando as rotinas no escopo de *host* do `linkedin.com/jobs`.
* `content.js`: O Script principal. Contém as lógicas de extração do formulário, processamento no DOM, integração fetch/POST e a renderização da interface (UI).

---

*Desenvolvido para automatizar e otimizar processos tediosos de preenchimento. Boa sorte nas candidaturas!* 🚀