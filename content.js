// 0. Estado Global e Interface
let botExecutando = false;

function logNoPainel(mensagem, tipo = 'info') {
    console.log(mensagem);
    const logsContainer = document.getElementById('bot-linkedin-logs');
    if (!logsContainer) return;
    
    const p = document.createElement('p');
    p.textContent = `[${new Date().toLocaleTimeString('pt-BR', {hour12:false})}] ${mensagem}`;
    p.style.margin = '4px 0';
    p.style.lineHeight = '1.3';
    
    if (tipo === 'error') p.style.color = '#ff4d4d';
    else if (tipo === 'success') p.style.color = '#4caf50';
    else if (tipo === 'warning') p.style.color = '#ff9800';
    else p.style.color = '#e0e0e0';
    
    logsContainer.appendChild(p);
    logsContainer.scrollTop = logsContainer.scrollHeight;
}

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
    logNoPainel("📡 Consultando IA (n8n) para preencher a tela...", 'info');

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

            if (resposta.status === 429 || resposta.status === 500) {
                logNoPainel(`⚠️ Servidor do n8n limitado/ocupado. Aguardando 20 segundos... (Tentativa ${tentativas + 1} de ${maxTentativas})`, 'warning');
                await esperar(20000); // Espera 20 segundos e tenta de novo
                tentativas++;
                continue; 
            }

            if (!resposta.ok) throw new Error(`Erro HTTP: ${resposta.status}`);

            const textoRetornado = await resposta.text();
            if (!textoRetornado || textoRetornado.trim() === "") throw new Error("n8n devolveu resposta vazia");

            let dadosRetornados;
            try { dadosRetornados = JSON.parse(textoRetornado); } 
            catch (erroParse) { throw new Error("JSON n8n inválido: " + textoRetornado); }

            logNoPainel("✅ Respostas da IA recebidas, injetando na tela.", 'success');

            for (const [chave, valorResposta] of Object.entries(dadosRetornados)) {
                if (!botExecutando) break;
                
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
            console.error("Falha ao comunicar com n8n:", erro);
            logNoPainel(`❌ Falha na conexão com n8n: ${erro.message}`, 'error');
            await esperar(10000);
            tentativas++;
        }
    }
    
    logNoPainel("🚨 IA não respondeu após 3 tentativas.", 'error');
    throw new Error("API n8n não está respondendo.");
}

// 4. O LOOP PRINCIPAL
async function iniciarAutomacao() {
    if (botExecutando) {
        logNoPainel("O bot já está em execução.", 'warning');
        return;
    }
    botExecutando = true;
    atualizarBotoesUI();

    try {
        logNoPainel("🚀 Procurando vagas na tela de pesquisa...", 'info');
        const cardsDeVagas = document.querySelectorAll('.job-card-container');
        
        if (cardsDeVagas.length === 0) {
            logNoPainel("❌ Nenhuma vaga visível carregada na lateral.", 'error');
            botExecutando = false;
            atualizarBotoesUI();
            return;
        }

        logNoPainel(`Encontradas ${cardsDeVagas.length} vagas visíveis. Iniciando varredura.`, 'info');

        for (let i = 0; i < cardsDeVagas.length; i++) {
            if (!botExecutando) {
                logNoPainel("🛑 Loop principal parado pelo usuário.", 'warning');
                break;
            }

            logNoPainel(`\n➤ Abrindo vaga ${i + 1} de ${cardsDeVagas.length}...`, 'info');
            const statusVaga = document.getElementById('bot-linkedin-status-vaga');
            if (statusVaga) statusVaga.innerText = `Vaga: ${i + 1} / ${cardsDeVagas.length}`;
            
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
                if (!botExecutando) break;
                await esperar(1000);
                btnCandidatura = document.querySelector('.jobs-apply-button');
                if (btnCandidatura) break;
            }

            if (!botExecutando) break;
            
            if (!btnCandidatura) {
                logNoPainel("Botão de Candidatura Simplificada não encontrado (Você já se candidatou?). Pulando esta vaga.", 'warning');
                continue;
            }

            btnCandidatura.click();
            await esperar(2000); 

            let formAberto = true;
            let tentativasSeguidasSemAvanco = 0;

            while (formAberto) {
                if (!botExecutando) {
                    logNoPainel("🛑 Interrupção exigida: abortando envio de formulário...", 'warning');
                    formAberto = false;
                    const btnFecharAbort = document.querySelector('button[aria-label="Fechar"]') || document.querySelector('button[aria-label="Dismiss"]');
                    if (btnFecharAbort) btnFecharAbort.click();
                    break;
                }

                await processarFormularioViaN8n();
                await esperar(1500);

                // 🟢 VERIFICA SE EXPLODIU ERRO NA TELA (EX: ARQUIVO OBRIGATÓRIO)
                const painelDeErro = document.querySelector('.artdeco-inline-feedback--error');
                if (painelDeErro) {
                    const textoErro = painelDeErro.innerText.toLowerCase();
                    if (textoErro.includes('file') || textoErro.includes('arquivo') || textoErro.includes('obrigatório') || textoErro.includes('required') || textoErro.includes('currículo') || textoErro.includes('resume')) {
                        logNoPainel("⚠️ Erro Fatal no formulário (ex: Arquivo obrigatório). Pulando vaga...", 'error');
                        const btnFechar = document.querySelector('button[aria-label="Fechar"]') || document.querySelector('button[aria-label="Dismiss"]');
                        if (btnFechar) btnFechar.click();
                        await esperar(1000);
                        const btnDescartar = encontrarBotaoPorTexto('Descartar');
                        if (btnDescartar) btnDescartar.closest('button').click();
                        
                        formAberto = false;
                        continue;
                    }
                }

                if (!botExecutando) break;

                let btnAvancar = encontrarBotaoPorTexto('Avançar') || encontrarBotaoPorTexto('Revisar');
                let btnEnviar = encontrarBotaoPorTexto('Enviar candidatura');

                if (btnAvancar && !btnAvancar.disabled) {
                    const btnAvancarReal = btnAvancar.closest('button') || btnAvancar;
                    btnAvancarReal.click();
                    logNoPainel(`👉 Modificando aba (Clicado em: ${btnAvancar.innerText.trim()})`, 'info');
                    await esperar(2000);
                    tentativasSeguidasSemAvanco = 0;
                } else if (btnEnviar && !btnEnviar.disabled) {
                    logNoPainel("✅ Formulário validado! Finalizando envio da candidatura...", 'success');
                    
                    // ⚠️ ATENÇÃO: Descomente a linha abaixo quando quiser que o bot envie de verdade
                    (btnEnviar.closest('button') || btnEnviar).click(); 
                    
                    await esperar(3000);
                    formAberto = false;
                } else {
                    tentativasSeguidasSemAvanco++;
                    logNoPainel("⏳ Formulário dependente... Aguardando liberação do botão manual.", 'warning');
                    await esperar(20000);

                    if (tentativasSeguidasSemAvanco > 3) {
                        logNoPainel("⚠️ Formulário exigiu longa intervenção manual ou travou. Fechando/pulando.", 'error');
                        const btnFechar = document.querySelector('button[aria-label="Fechar"]') || document.querySelector('button[aria-label="Dismiss"]');
                        if (btnFechar) btnFechar.click();
                        await esperar(1000);
                        const btnDescartar = encontrarBotaoPorTexto('Descartar');
                        if (btnDescartar) btnDescartar.closest('button').click();
                        
                        formAberto = false;
                    }
                }
            }

            if (!botExecutando) {
                logNoPainel("🛑 Robô inativo para próximas vagas.", 'warning');
                break;
            }

            const btnFecharSucesso = document.querySelector('button[aria-label="Fechar"]') || document.querySelector('button[aria-label="Dismiss"]');
            if (btnFecharSucesso) btnFecharSucesso.click();
            await esperar(1000);
            const btnConcluido = encontrarBotaoPorTexto('Concluído') || encontrarBotaoPorTexto('Done');
            if (btnConcluido) btnConcluido.closest('button').click();

            logNoPainel("🛡️ Pausando 4 segundos por segurança antes da próxima...", 'info');
            await esperar(4000); 
        }

        if (botExecutando) {
            logNoPainel("🏆 Automação concluída em todas as vagas carregadas!", 'success');
            alert("Sucesso! O Bot verificou todas as vagas carregadas nesta página.");
        }
    } catch (erro) {
        logNoPainel(`❌ Erro Inesperado: ${erro.message}`, 'error');
        alert("Ops! O robô sofreu um acidente: " + erro.message);
    } finally {
        botExecutando = false;
        atualizarBotoesUI();
    }
}

// 5. Interface Gráfica / Painel Flutuante
function injetarPainelAutomacao() {
    const painelExistente = document.getElementById('bot-linkedin-painel');
    if (painelExistente) painelExistente.remove();

    const painel = document.createElement('div');
    painel.id = 'bot-linkedin-painel';
    painel.style.cssText = `
        position: fixed; bottom: 20px; right: 20px; width: 360px;
        background: #1e1e24; color: #fff; border: 1px solid #3a3a44;
        border-radius: 12px; box-shadow: 0 10px 35px rgba(0,0,0,0.6);
        z-index: 9999; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
        display: flex; flex-direction: column; overflow: hidden;
    `;

    painel.innerHTML = `
        <div style="background: #0a66c2; padding: 12px 18px; font-weight: bold; font-size: 15px; display: flex; justify-content: space-between; align-items: center;">
            <span>🤖 Auto-Apply Helper</span>
            <span id="bot-linkedin-status" style="font-size: 11px; font-weight: normal; background: rgba(0,0,0,0.3); padding: 4px 10px; border-radius: 15px;">Aguardando...</span>
        </div>
        <div style="padding: 10px 18px; font-size: 13px; background: #2a2a35; border-bottom: 1px solid #3a3a44; display: flex; justify-content: space-between; align-items: center;">
            <span style="color: #999;">Progresso atual:</span>
            <strong id="bot-linkedin-status-vaga" style="background: #1e1e24; padding: 4px 10px; border-radius: 6px; border: 1px solid #3a3a44;">0 / 0</strong>
        </div>
        <div id="bot-linkedin-logs" style="height: 180px; overflow-y: auto; padding: 12px 18px; font-size: 12px; font-family: ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, Consolas, monospace; background: #16161b; color: #ccc;">
            <p style="margin: 0; color: #666; font-style: italic;">Clique em iniciar para carregar o bot...</p>
        </div>
        <div style="padding: 14px; display: flex; gap: 12px; background: #2a2a35; border-top: 1px solid #3a3a44;">
            <button id="btn-bot-iniciar" style="flex: 1; padding: 12px; background: #057a55; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 14px; transition: all 0.2s;">▶ Iniciar</button>
            <button id="btn-bot-parar" disabled style="flex: 1; padding: 12px; background: #e02424; color: white; border: none; border-radius: 6px; cursor: not-allowed; font-weight: bold; font-size: 14px; opacity: 0.5; transition: all 0.2s;">🛑 Parar</button>
        </div>
    `;

    document.body.appendChild(painel);

    document.getElementById('btn-bot-iniciar').addEventListener('click', iniciarAutomacao);
    document.getElementById('btn-bot-parar').addEventListener('click', pararAutomacao);
    
    // Animação hover
    document.getElementById('btn-bot-iniciar').addEventListener('mouseover', function() { if(!this.disabled) this.style.backgroundColor = '#046c4e'; });
    document.getElementById('btn-bot-iniciar').addEventListener('mouseout', function() { if(!this.disabled) this.style.backgroundColor = '#057a55'; });
    document.getElementById('btn-bot-parar').addEventListener('mouseover', function() { if(!this.disabled) this.style.backgroundColor = '#c81e1e'; });
    document.getElementById('btn-bot-parar').addEventListener('mouseout', function() { if(!this.disabled) this.style.backgroundColor = '#e02424'; });
}

function atualizarBotoesUI() {
    const btnIniciar = document.getElementById('btn-bot-iniciar');
    const btnParar = document.getElementById('btn-bot-parar');
    const status = document.getElementById('bot-linkedin-status');
    if (!btnIniciar || !btnParar) return;

    if (botExecutando) {
        btnIniciar.disabled = true;  btnIniciar.style.opacity = '0.5'; btnIniciar.style.cursor = 'not-allowed';
        btnParar.disabled = false;   btnParar.style.opacity = '1';     btnParar.style.cursor = 'pointer';
        if (status) { status.innerText = 'Rodando...'; status.style.background = '#057a55'; }
    } else {
        btnIniciar.disabled = false; btnIniciar.style.opacity = '1';   btnIniciar.style.cursor = 'pointer';
        btnParar.disabled = true;    btnParar.style.opacity = '0.5';   btnParar.style.cursor = 'not-allowed';
        if (status) { status.innerText = 'Aguardando...'; status.style.background = 'rgba(0,0,0,0.3)'; }
    }
}

function pararAutomacao() {
    if (botExecutando) {
        botExecutando = false;
        logNoPainel("🛑 SINAL DE PARADA ENVIADO. Aguardando a instrução atual cancelar o loop...", 'warning');
        atualizarBotoesUI();
    }
}

setTimeout(injetarPainelAutomacao, 2000);