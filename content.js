// 1. Funções de Espera e Busca
const esperar = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function encontrarBotaoPorTexto(texto) {
    const elementos = Array.from(document.querySelectorAll('button, span.artdeco-button__text'));
    return elementos.find(el => el.innerText.trim().toLowerCase().includes(texto.toLowerCase()));
}

// 2. Função Aprimorada para Extrair Dados
function extrairPerguntasDaTela() {
    const perguntas = {};
    const areaDoFormulario = document.querySelector('.artdeco-modal') || document;
    
    // Busca inputs, selects e textareas
    const elementos = areaDoFormulario.querySelectorAll('input:not([type="hidden"]), select, textarea');
    const textosIgnorados = ['alerta de vaga', 'cidade, estado', 'pesquisar cargo', 'pesquisar', 'configurar alerta'];

    elementos.forEach(campo => {
        const idCampo = campo.id;
        const tipoHTML = campo.tagName.toLowerCase();
        const tipoInput = campo.type ? campo.type.toLowerCase() : '';
        
        // 🟢 NOVA TRAVA: Ignora inputs de arquivo por segurança do navegador
        if (tipoInput === 'file') return;

        // Ignora campos de pesquisa de fundo
        if (!idCampo || idCampo.includes('search') || idCampo.includes('adToggle')) return;

        let textoPergunta = "";
        let opcoes = [];

        // 🟢 Múltipla Escolha (Radio Buttons)
        if (tipoInput === 'radio') {
            const fieldset = campo.closest('fieldset');
            if (fieldset) {
                const legend = fieldset.querySelector('legend span[aria-hidden="true"]') || fieldset.querySelector('legend');
                if (legend) textoPergunta = legend.innerText.trim().split('\n')[0];
                
                const nomeDoGrupo = campo.name; 
                
                if (perguntas[nomeDoGrupo]) return;

                const radiosDoGrupo = fieldset.querySelectorAll(`input[name="${nomeDoGrupo}"]`);
                radiosDoGrupo.forEach(radio => {
                    const labelDoRadio = fieldset.querySelector(`label[for="${radio.id}"]`);
                    if (labelDoRadio) opcoes.push(labelDoRadio.innerText.trim());
                });

                perguntas[nomeDoGrupo] = {
                    pergunta: textoPergunta,
                    tipo: "radio",
                    opcoes_disponiveis: opcoes
                };
                return;
            }
        } 
        
        // 🟢 Campos normais (Texto, Select)
        const label = areaDoFormulario.querySelector(`label[for="${idCampo}"]`);
        if (label) {
            textoPergunta = label.innerText.trim().split('\n')[0];
        } else if (campo.ariaLabel) {
            textoPergunta = campo.ariaLabel;
        }

        if (!textoPergunta) return;

        const textoMin = textoPergunta.toLowerCase();
        if (textosIgnorados.some(ignorado => textoMin.includes(ignorado))) return;

        if (tipoHTML === 'select') {
            const elementosOption = campo.querySelectorAll('option');
            elementosOption.forEach(opt => {
                const valorVisivel = opt.innerText.trim();
                if (valorVisivel && valorVisivel !== "Selecione uma opção" && valorVisivel !== "Select an option") {
                    opcoes.push(valorVisivel);
                }
            });
        }

        perguntas[idCampo] = {
            pergunta: textoPergunta,
            tipo: tipoHTML,
        };

        if (opcoes.length > 0) {
            perguntas[idCampo].opcoes_disponiveis = opcoes;
        }
    });

    return perguntas;
}

// 3. A Função com Retentativa Inteligente e Controle de Limites (Rate Limit)
async function processarFormularioViaN8n() {
    const perguntas = extrairPerguntasDaTela();
    if (Object.keys(perguntas).length === 0) return false;

    console.log("Enviando perguntas direto para o n8n...", perguntas);

    const URL_WEBHOOK_N8N = 'http://localhost:5678/webhook/linkedin-ia';
    
    let tentativas = 0;
    const maxTentativas = 3;

    while (tentativas < maxTentativas) {
        try {
            // 🛑 FREIO DE MÃO: Pausa de 5 segundos ANTES de cada chamada para aliviar a API
            console.log("Respirando 30 segundos para respeitar o limite da API free...");
            await esperar(30000);

            const resposta = await fetch(URL_WEBHOOK_N8N, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ campos: perguntas })
            });

            // 🟢 TRATAMENTO DO ERRO DE API LIMITADA
            if (resposta.status === 429 || resposta.status === 500) {
                console.warn(`⚠️ A API da IA engasgou (Too Many Requests). Aguardando 20 segundos... (Tentativa ${tentativas + 1} de ${maxTentativas})`);
                await esperar(20000); // Espera 20 segundos e tenta de novo
                tentativas++;
                continue; 
            }

            if (!resposta.ok) {
                throw new Error(`Erro HTTP: ${resposta.status}`);
            }

            const textoRetornado = await resposta.text();
            
            if (!textoRetornado || textoRetornado.trim() === "") {
                console.error("O n8n devolveu uma resposta vazia.");
            }

            let dadosRetornados;
            try {
                dadosRetornados = JSON.parse(textoRetornado);
            } catch (erroParse) {
                console.error("O n8n não devolveu um JSON válido:", textoRetornado);
                throw new Error("O n8n não devolveu um JSON válido:", textoRetornado);  
            }

            console.log("Respostas injetadas na tela:", dadosRetornados);

            for (const [chave, valorResposta] of Object.entries(dadosRetornados)) {
                
                // Injeta Radio Buttons (Múltipla Escolha)
                const radios = document.querySelectorAll(`input[type="radio"][name="${chave}"]`);
                if (radios.length > 0) {
                    radios.forEach(radio => {
                        const labelBox = document.querySelector(`label[for="${radio.id}"]`);
                        if (labelBox && labelBox.innerText.trim().toLowerCase() === String(valorResposta).toLowerCase()) {
                            radio.click();
                            radio.dispatchEvent(new Event('change', { bubbles: true }));
                        }
                    });
                    continue; 
                }

                // Injeta campos normais (input de texto ou select)
                const campo = document.getElementById(chave);
                if (!campo) continue;

                // 🟢 NOVA TRAVA DE INJEÇÃO
                if (campo.type && campo.type.toLowerCase() === 'file') {
                    console.log("Ignorando campo de arquivo (bloqueado pelo navegador).");
                    continue;
                }

                if (campo.tagName.toLowerCase() === 'select') {
                    const option = Array.from(campo.options).find(opt => opt.innerText.trim().toLowerCase() === String(valorResposta).toLowerCase());
                    if (option) {
                        campo.value = option.value;
                    } else {
                        campo.value = valorResposta;
                    }
                } else {
                    campo.value = valorResposta;
                }
                
                campo.dispatchEvent(new Event('input', { bubbles: true }));
                campo.dispatchEvent(new Event('change', { bubbles: true }));
                campo.dispatchEvent(new Event('blur', { bubbles: true }));
            }
            
            // Sucesso! Sai do loop de tentativas e retorna true
            return true; 
            
        } catch (erro) {
            console.error("Falha na rede ao conectar com n8n:", erro);
            // Espera e tenta de novo se for falha de rede
            await esperar(10000);
            tentativas++;
        }
    }
    
    console.error("🚨 Desistindo após 3 tentativas. A API da IA não está respondendo.");
    throw new Error("🚨 Desistindo após 3 tentativas. A API da IA não está respondendo.");
}

// 4. O LOOP PRINCIPAL
async function iniciarAutomacao() {
    try {
        console.log("🤖 Iniciando o bot do LinkedIn na tela de pesquisa...");

        const cardsDeVagas = document.querySelectorAll('.job-card-container');
        
        if (cardsDeVagas.length === 0) {
            alert("Nenhuma vaga encontrada. Certifique-se de que a lista de vagas carregou na esquerda.");
            return;
        }

        console.log(`Encontradas ${cardsDeVagas.length} vagas visíveis. Iniciando loop...`);

        for (let i = 0; i < cardsDeVagas.length; i++) {
            console.log(`\n➤ Processando vaga ${i + 1} de ${cardsDeVagas.length}...`);
            const card = cardsDeVagas[i];
            
            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await esperar(1000); 
            
            const linkClicavel = card.querySelector('.job-card-list__title--link') || card.querySelector('a'); 
            if (linkClicavel) linkClicavel.click();
            
            await esperar(3000); 

            const btnCandidatura = document.querySelector('.jobs-apply-button');
            
            if (!btnCandidatura) {
                console.log("Botão de Candidatura Simplificada não encontrado ou você já se candidatou. Pulando.");
                continue;
            }

            btnCandidatura.click();
            await esperar(2000); 

            let formAberto = true;
            let tentativasSeguidasSemAvanco = 0;

            while (formAberto) {
                await processarFormularioViaN8n();
                await esperar(1500);

                let btnAvancar = encontrarBotaoPorTexto('Avançar') || encontrarBotaoPorTexto('Revisar');
                let btnEnviar = encontrarBotaoPorTexto('Enviar candidatura');

                if (btnAvancar && !btnAvancar.disabled) {
                    const btnAvancarReal = btnAvancar.closest('button') || btnAvancar;
                    btnAvancarReal.click();
                    console.log("➡️ Avançando página...");
                    await esperar(2000);
                    tentativasSeguidasSemAvanco = 0;
                } else if (btnEnviar && !btnEnviar.disabled) {
                    console.log("✅ Tela final alcançada. Candidatura pronta para envio!");
                    
                    // ⚠️ ATENÇÃO: Descomente a linha abaixo quando quiser que o bot envie de verdade
                    // (btnEnviar.closest('button') || btnEnviar).click(); 
                    
                    await esperar(3000);
                    formAberto = false;
                } else {
                    tentativasSeguidasSemAvanco++;
                    console.log("Aguardando liberação do botão...");
                    await esperar(2000);

                    if (tentativasSeguidasSemAvanco > 3) {
                        console.log("⚠️ Formulário exigiu intervenção manual ou travou. Fechando e pulando.");
                        const btnFechar = document.querySelector('button[aria-label="Ignorar"]');
                        if (btnFechar) btnFechar.click();
                        await esperar(1000);
                        const btnDescartar = encontrarBotaoPorTexto('Descartar');
                        if (btnDescartar) btnDescartar.closest('button').click();
                        
                        formAberto = false;
                    }
                }
            }

            const btnFecharSucesso = document.querySelector('button[aria-label="Ignorar"]');
            if (btnFecharSucesso) btnFecharSucesso.click();

            console.log(`Vaga ${i + 1} concluída. Pausando por segurança...`);
            await esperar(4000); 
        }

        alert("Automação concluída para as vagas carregadas!");
    } catch (erro) {
        console.error("Automação interrompida por erro:", erro);
        alert("Erro na execução! O script foi parado: " + erro.message);
        throw erro;
    }
}

// 5. Injeta o botão na tela
function injetarBotaoStart() {
    const btnExistente = document.getElementById('btn-bot-linkedin');
    if (btnExistente) btnExistente.remove();

    const botao = document.createElement('button');
    botao.id = 'btn-bot-linkedin';
    botao.innerText = '▶️ Iniciar Automação';
    botao.style.cssText = 'position:fixed; bottom:20px; right:20px; z-index:9999; padding:15px 20px; background:#01754f; color:white; border:none; border-radius:8px; cursor:pointer; font-weight:bold; box-shadow: 0 4px 6px rgba(0,0,0,0.2); transition: 0.2s;';
    
    botao.addEventListener('mouseover', () => botao.style.background = '#025c3e');
    botao.addEventListener('mouseout', () => botao.style.background = '#01754f');
    botao.addEventListener('click', iniciarAutomacao);
    
    document.body.appendChild(botao);
}

setTimeout(injetarBotaoStart, 2000);