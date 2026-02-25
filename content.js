// 1. Funções de Espera e Busca
const esperar = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function encontrarBotaoPorTexto(texto) {
    // Procura primeiro em spans que contêm o texto, e depois em botões diretos
    const elementos = Array.from(document.querySelectorAll('button, span.artdeco-button__text'));
    return elementos.find(el => el.innerText.trim().toLowerCase() === texto.toLowerCase() || el.innerText.trim().toLowerCase().includes(texto.toLowerCase()));
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
        
        // 🟢 Checkbox (Termos, Consentimento, etc)
        if (tipoInput === 'checkbox') {
            const fieldset = campo.closest('fieldset');
            if (fieldset) {
                const legend = fieldset.querySelector('legend span[aria-hidden="true"]') || fieldset.querySelector('legend');
                if (legend) textoPergunta = legend.innerText.trim().split('\n')[0];
            }

            const labelDoCheckbox = areaDoFormulario.querySelector(`label[for="${idCampo}"]`) || campo.closest('label');
            const textoLabel = labelDoCheckbox ? labelDoCheckbox.innerText.trim() : "";

            if (!textoPergunta) {
                textoPergunta = textoLabel;
            } else if (textoLabel && textoPergunta.toLowerCase() !== textoLabel.toLowerCase()) {
                textoPergunta = textoPergunta + " - Opção: " + textoLabel;
            }

            if (!textoPergunta) return;

            perguntas[idCampo] = {
                pergunta: textoPergunta,
                tipo: "checkbox",
                opcoes_disponiveis: ["Yes", "No"] // Força a IA a dar uma resposta afirmativa/negativa clara
            };
            return;
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

                // 🟢 Lida com campos de "Typeahead" (busca enquanto digita, ex: Cidade/Localização)
                if (campo.getAttribute('role') === 'combobox') {
                    console.log(`Preenchendo auto-complete ${chave} com: ${valorResposta}`);
                    campo.focus();
                    campo.value = valorResposta;
                    campo.dispatchEvent(new Event('input', { bubbles: true }));
                    campo.dispatchEvent(new Event('change', { bubbles: true }));
                    
                    // Simula seta para baixo para forçar exibir o menu
                    campo.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 }));
                    
                    // Espera 2 segundos para dar tempo do LinkedIn buscar as opções
                    await esperar(2000);
                    
                    // Tenta clicar na primeira opção sugerida
                    const containerDoCampo = campo.closest('div') || document;
                    const opcoesTypeahead = containerDoCampo.querySelectorAll('.basic-typeahead__selectable, [role="option"]');
                    
                    if (opcoesTypeahead.length > 0) {
                        opcoesTypeahead[0].click();
                        await esperar(500);
                    } else {
                        // Se não encontrou opções visíveis, aperta Enter para confirmar
                        campo.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter', code: 'Enter', keyCode: 13 }));
                    }

                    campo.dispatchEvent(new Event('blur', { bubbles: true }));
                    continue;
                }

                if (campo.type && campo.type.toLowerCase() === 'checkbox') {
                    const resp = String(valorResposta).toLowerCase().trim();
                    if (['yes', 'true', '1', 'sim', 'checked', 'marcar'].includes(resp)) {
                        campo.checked = true;
                    } else {
                        campo.checked = false;
                    }
                } else if (campo.tagName.toLowerCase() === 'select') {
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
            
            // Garante que nenhum modal anterior travou aberto
            const modalAberto = document.querySelector('.artdeco-modal');
            if (modalAberto) {
                const btnFecharModal = document.querySelector('button[aria-label="Fechar"]') || document.querySelector('button[aria-label="Dismiss"]');
                if (btnFecharModal) btnFecharModal.click();
                await esperar(1000);
                const btnDescartarModal = encontrarBotaoPorTexto('Descartar');
                if (btnDescartarModal) btnDescartarModal.closest('button').click();
                await esperar(1000);
            }

            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await esperar(1000); 
            
            const linkClicavel = card.querySelector('.job-card-list__title--link') || card.querySelector('a'); 
            if (linkClicavel) linkClicavel.click();
            
            // Aguarda até o botão de Candidatura aparecer
            let btnCandidatura = null;
            for (let j = 0; j < 5; j++) {
                await esperar(1000);
                btnCandidatura = document.querySelector('.jobs-apply-button');
                if (btnCandidatura) break;
            }
            
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

                // 🟢 VERIFICA SE EXPLODIU ERRO NA TELA (EX: ARQUIVO OBRIGATÓRIO)
                const painelDeErro = document.querySelector('.artdeco-inline-feedback--error');
                if (painelDeErro) {
                    const textoErro = painelDeErro.innerText.toLowerCase();
                    if (textoErro.includes('file') || textoErro.includes('arquivo') || textoErro.includes('obrigatório') || textoErro.includes('required') || textoErro.includes('currículo') || textoErro.includes('resume')) {
                        console.log("⚠️ Campo de arquivo obrigatório não preenchido ou erro insolúvel detectado. Pulando vaga...");
                        const btnFechar = document.querySelector('button[aria-label="Fechar"]') || document.querySelector('button[aria-label="Dismiss"]');
                        if (btnFechar) btnFechar.click();
                        await esperar(1000);
                        const btnDescartar = encontrarBotaoPorTexto('Descartar');
                        if (btnDescartar) btnDescartar.closest('button').click();
                        
                        formAberto = false;
                        continue;
                    }
                }

                let btnAvancar = encontrarBotaoPorTexto('Avançar') || encontrarBotaoPorTexto('Revisar');
                let btnEnviar = encontrarBotaoPorTexto('Enviar candidatura');

                if (btnAvancar && !btnAvancar.disabled) {
                    const btnAvancarReal = btnAvancar.closest('button') || btnAvancar;
                    btnAvancarReal.click();
                    console.log(`➡️ Avançando página (Clicou em: ${btnAvancar.innerText.trim()})...`);
                    await esperar(2000);
                    tentativasSeguidasSemAvanco = 0;
                } else if (btnEnviar && !btnEnviar.disabled) {
                    console.log("✅ Tela final alcançada. Candidatura pronta para envio!");
                    
                    // ⚠️ ATENÇÃO: Descomente a linha abaixo quando quiser que o bot envie de verdade
                    (btnEnviar.closest('button') || btnEnviar).click(); 
                    
                    await esperar(3000);
                    formAberto = false;
                } else {
                    tentativasSeguidasSemAvanco++;
                    console.log("Aguardando liberação do botão...");
                    await esperar(20000);

                    if (tentativasSeguidasSemAvanco > 3) {
                        console.log("⚠️ Formulário exigiu intervenção manual ou travou. Fechando e pulando.");
                        const btnFechar = document.querySelector('button[aria-label="Fechar"]') || document.querySelector('button[aria-label="Dismiss"]');
                        if (btnFechar) btnFechar.click();
                        await esperar(1000);
                        const btnDescartar = encontrarBotaoPorTexto('Descartar');
                        if (btnDescartar) btnDescartar.closest('button').click();
                        
                        formAberto = false;
                    }
                }
            }

            const btnFecharSucesso = document.querySelector('button[aria-label="Fechar"]') || document.querySelector('button[aria-label="Dismiss"]');
            if (btnFecharSucesso) btnFecharSucesso.click();
            await esperar(1000);
            const btnConcluido = encontrarBotaoPorTexto('Concluído') || encontrarBotaoPorTexto('Done');
            if (btnConcluido) btnConcluido.closest('button').click();

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