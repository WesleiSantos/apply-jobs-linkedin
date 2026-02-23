// 1. Funções de Espera e Busca
const esperar = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function encontrarBotaoPorTexto(texto) {
    const elementos = Array.from(document.querySelectorAll('button, span.artdeco-button__text'));
    return elementos.find(el => el.innerText.trim().toLowerCase().includes(texto.toLowerCase()));
}

// 2. Função para extrair dados da tela para o n8n
function extrairPerguntasDaTela() {
    const perguntas = {};
    const labels = document.querySelectorAll('label');

    labels.forEach(label => {
        const texto = label.innerText.trim();
        const idCampo = label.getAttribute('for');
        
        if (idCampo) {
            const campo = document.getElementById(idCampo);
            if (campo) {
                perguntas[idCampo] = {
                    pergunta: texto,
                    tipo: campo.tagName.toLowerCase()
                };
            }
        }
    });
    return perguntas;
}

// 3. Comunicação com o n8n
async function processarFormularioViaN8n() {
    const perguntas = extrairPerguntasDaTela();
    if (Object.keys(perguntas).length === 0) return false;

    console.log("Enviando perguntas para o n8n...", perguntas);

    try {
        // ⚠️ INSIRA A URL DO SEU WEBHOOK DO N8N AQUI
        const respostaN8n = await fetch('http://192.168.1.101:5678/webhook-test/linkedin-ia', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ campos: perguntas })
        });

        const respostasDaIA = await respostaN8n.json();
        console.log("Respostas recebidas da IA:", respostasDaIA);

        for (const [idDoCampo, valorResposta] of Object.entries(respostasDaIA)) {
            const campo = document.getElementById(idDoCampo);
            if (!campo) continue;

            campo.value = valorResposta;
            
            // Dispara os eventos do React para o botão Avançar acender
            campo.dispatchEvent(new Event('input', { bubbles: true }));
            campo.dispatchEvent(new Event('change', { bubbles: true }));
            campo.dispatchEvent(new Event('blur', { bubbles: true }));
        }
        
        return true;
    } catch (erro) {
        console.error("Erro no Webhook do n8n:", erro);
        throw erro;
    }
}

// 4. O LOOP PRINCIPAL (Atualizado para a tela de Pesquisa)
async function iniciarAutomacao() {
    try {
        console.log("🤖 Iniciando o bot do LinkedIn na tela de pesquisa...");

    // NOVO SELETOR: Busca exatamente os cards de vaga na coluna da esquerda
    const cardsDeVagas = document.querySelectorAll('.job-card-container');
    
    if (cardsDeVagas.length === 0) {
        alert("Nenhuma vaga encontrada. Certifique-se de que a lista de vagas carregou na esquerda.");
        return;
    }

    console.log(`Encontradas ${cardsDeVagas.length} vagas visíveis. Iniciando loop...`);

    for (let i = 0; i < cardsDeVagas.length; i++) {
        console.log(`\n➤ Processando vaga ${i + 1} de ${cardsDeVagas.length}...`);
        const card = cardsDeVagas[i];
        
        // Rola a lista da esquerda para a vaga atual ficar visível
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await esperar(1000); // Pausa dramática para o scroll
        
        // NOVO SELETOR: Clica exatamente no título da vaga
        const linkClicavel = card.querySelector('.job-card-list__title--link') || card.querySelector('a'); 
        if (linkClicavel) linkClicavel.click();
        
        // Aguarda a vaga carregar na coluna da direita
        await esperar(3000); 

        // NOVO SELETOR: Busca o botão azul principal da vaga
        const btnCandidatura = document.querySelector('.jobs-apply-button');
        
        if (!btnCandidatura) {
            console.log("Botão de Candidatura Simplificada não encontrado ou você já se candidatou. Pulando.");
            continue;
        }

        btnCandidatura.click();
        await esperar(2000); // Aguarda o modal do formulário abrir

        // Loop de Páginas do Formulário
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

        // Fecha a modal de sucesso se ela existir
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

// Injeta o botão na tela
function injetarBotaoStart() {
    // Remove o botão anterior se ele já existir (para evitar botões duplicados ao recarregar a extensão)
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

// Aguarda 2 segundos para garantir que o React carregou antes de injetar o botão
setTimeout(injetarBotaoStart, 2000);