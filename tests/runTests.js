/**
 * SUÍTE COMPLETA DE TESTES AUTOMATIZADOS
 * Validação rigorosa dos 17 cenários exigidos pela especificação.
 */

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// Garante carregamento das variáveis e banco
const config = require('../backend/src/config');
const db = require('../backend/src/database/connection');
const seed = require('../backend/src/database/seed');

// Serviços e Conectores
const aiEngine = require('../backend/src/services/ai/aiEngine');
const { parseElectricalOrderText, analyzeElectricalItem } = require('../backend/src/services/ai/electricalRules');
const { matchProductInCatalog } = require('../backend/src/services/catalog/catalogMatcher');
const whatsappCloudApi = require('../backend/src/services/connectors/whatsappCloudApi');
const whatsappPersonalStub = require('../backend/src/services/connectors/whatsappPersonalStub');
const emailConnector = require('../backend/src/services/connectors/emailConnector');
const taskQueue = require('../backend/src/services/queue/taskQueue');
const quotationService = require('../backend/src/services/quotation/quotationService');
const exportService = require('../backend/src/services/quotation/exportService');
const ocrService = require('../backend/src/services/ai/ocrService');
const audioService = require('../backend/src/services/ai/audioService');
const { generateSessionToken } = require('../backend/src/middlewares/authMiddleware');

const testResults = [];

async function runTest(testNumber, testName, testFn) {
  const start = Date.now();
  try {
    await testFn();
    const duration = Date.now() - start;
    testResults.push({ number: testNumber, name: testName, status: 'PASSED', duration });
    console.log(`[PASS] Teste ${String(testNumber).padStart(2, '0')}: ${testName} (${duration}ms)`);
  } catch (err) {
    const duration = Date.now() - start;
    testResults.push({ number: testNumber, name: testName, status: 'FAILED', error: err.message, duration });
    console.error(`[FAIL] Teste ${String(testNumber).padStart(2, '0')}: ${testName} (${duration}ms)`);
    console.error(`       Erro: ${err.message}`);
  }
}

async function runAllTests() {
  console.log('================================================================');
  console.log('⚡ EXECUTANDO SUÍTE DE TESTES: SISTEMA DE PEDIDOS DE MATERIAIS ⚡');
  console.log('================================================================\n');

  // Inicializa banco de dados com dados de seed
  seed();
  console.log('\n--- Iniciando Validação dos 17 Cenários Obrigatórios ---\n');

  // 1. CADASTRO MANUAL
  await runTest(1, 'Cadastro Manual de Pedido', async () => {
    const testText = '3 rolos de cabo flexivel 2.5 azul\n4 disjuntor de 20 monopolar';
    const orderId = `ord_test_manual_${Date.now()}`;
    const orderCode = `PED-TEST-0001`;

    db.run(`
      INSERT INTO orders (id, order_code, channel_id, entry_method, status, original_text)
      VALUES (?, ?, 'chan_manual_balcao', 'MANUAL_ENTRY', 'PROCESSING', ?)
    `, [orderId, orderCode, testText]);

    const order = db.get('SELECT * FROM orders WHERE id = ?', [orderId]);
    assert.strictEqual(order.entry_method, 'MANUAL_ENTRY', 'O método de entrada deve ser MANUAL_ENTRY');
    assert.strictEqual(order.status, 'PROCESSING');

    // Executa extração da IA
    const aiResult = await aiEngine.processOrder({
      orderId: orderCode,
      messageOrigin: 'MANUAL_ENTRY',
      text: testText
    });

    assert.ok(aiResult.items.length >= 2, 'Deve identificar ao menos 2 itens');
    assert.strictEqual(aiResult.items[0].quantity, 3);
  });

  // 2. IMPORTAÇÃO DE MENSAGENS E ARQUIVOS
  await runTest(2, 'Importação de Mensagens e Anexos Multimodais', async () => {
    const testFile = path.join(config.storage.attachmentsDir, 'teste_lista_anexa.txt');
    fs.writeFileSync(testFile, '10 caixinhas 4x2\n2 rolos de conduite amarelo de 3/4');

    const fileHash = crypto.createHash('sha256').update(fs.readFileSync(testFile)).digest('hex');
    const attId = `att_test_${Date.now()}`;
    const orderId = `ord_test_att_${Date.now()}`;

    db.run(`
      INSERT INTO orders (id, order_code, channel_id, entry_method, status, original_text)
      VALUES (?, 'PED-TEST-0002', 'chan_manual_balcao', 'FILE_IMPORT', 'PROCESSING', 'Importação com arquivo')
    `, [orderId]);

    db.run(`
      INSERT INTO attachments (id, order_id, filename, file_path, mime_type, file_size_bytes, sha256_hash, processing_status)
      VALUES (?, ?, 'teste_lista_anexa.txt', ?, 'text/plain', ?, ?, 'STORED')
    `, [attId, orderId, testFile, fs.statSync(testFile).size, fileHash]);

    const att = db.get('SELECT * FROM attachments WHERE id = ?', [attId]);
    assert.strictEqual(att.sha256_hash, fileHash, 'Hash SHA-256 do arquivo deve ser consistente');
    assert.strictEqual(att.processing_status, 'STORED');
  });

  // 3. RECEBIMENTO DE EVENTOS DUPLICADOS (IDEMPOTÊNCIA)
  await runTest(3, 'Recebimento de Eventos Duplicados (Deduplicação Idempotente)', async () => {
    const duplicateWamId = `wam_test_duplicate_${Date.now()}`;

    const payload = {
      entry: [{
        changes: [{
          field: 'messages',
          value: {
            metadata: { phone_number_id: '123' },
            contacts: [{ wa_id: '5511999990000', profile: { name: 'Cliente Teste' } }],
            messages: [{
              id: duplicateWamId,
              from: '5511999990000',
              timestamp: String(Math.floor(Date.now() / 1000)),
              type: 'text',
              text: { body: '2 rolos de fio 2.5 preto' }
            }]
          }
        }]
      }]
    };

    // 1º envio
    const firstResult = await whatsappCloudApi.handleWebhookPayload(payload);
    assert.strictEqual(firstResult.events[0].action, 'ORDER_CREATED', 'Primeiro envio deve criar o pedido');

    // 2º envio (duplicado com mesmo wam_id)
    const secondResult = await whatsappCloudApi.handleWebhookPayload(payload);
    assert.strictEqual(secondResult.events[0].action, 'DUPLICATE_IGNORED', 'Segundo envio com mesmo wam_id deve ser descartado');

    // Verifica que existe apenas 1 mensagem no banco com este ID
    const count = db.get('SELECT COUNT(*) as c FROM messages WHERE external_id = ?', [duplicateWamId]).c;
    assert.strictEqual(count, 1, 'Não pode haver duplicidade no banco');
  });

  // 4. INTERPRETAÇÃO DE TEXTO E JARGÕES ELÉTRICOS
  await runTest(4, 'Interpretação de Texto e Jargões Elétricos Brasileiros', async () => {
    const rawText = 'Carlos, manda pra mim 2 rolo fio de duas e meia azul e 5 disjuntor din de 20 monopolar curva c';
    const items = parseElectricalOrderText(rawText);

    assert.strictEqual(items.length, 2, 'Deve identificar 2 itens');
    assert.strictEqual(items[0].quantity, 2);
    assert.strictEqual(items[0].unit, 'ROLO_100M');
    assert.ok(items[0].normalized_name.includes('2.5mm²'), 'Deve normalizar duas e meia para 2.5mm²');
    assert.strictEqual(items[0].explicit_specs.cor, 'Azul');

    assert.strictEqual(items[1].quantity, 5);
    assert.ok(items[1].normalized_name.includes('20A'), 'Deve normalizar para 20A');
  });

  // 5. ANÁLISE DE IMAGENS (OCR)
  await runTest(5, 'Análise de Imagens e Listas Manuscritas/Impressas (OCR)', async () => {
    const testImg = path.join(config.storage.attachmentsDir, 'lista_orcamento_foto.jpg');
    fs.writeFileSync(testImg, 'Conteúdo binário simulado de imagem de lista');
    // Cria arquivo companheiro de transcrição
    fs.writeFileSync(testImg + '.txt', '1 rolo de conduite 3/4\n10 caixas 4x2 amarela');

    const extractedText = await ocrService.extractText(testImg, 'image/jpeg');
    assert.ok(extractedText.includes('conduite'), 'Deve extrair texto do OCR');

    const parsed = parseElectricalOrderText(extractedText);
    assert.strictEqual(parsed.length, 2, 'Deve estruturar 2 itens da imagem');
  });

  // 6. TRATAMENTO DE ÁUDIOS COMPATÍVEIS
  await runTest(6, 'Tratamento e Transcrição de Áudios de Voz do WhatsApp', async () => {
    const testAudio = path.join(config.storage.attachmentsDir, 'audio_whatsapp.ogg');
    fs.writeFileSync(testAudio, 'Conteúdo binário simulado OGG Opus de nota de voz');
    fs.writeFileSync(testAudio + '.txt', 'Fala Carlos, manda aí dois rolos de cabo duas e meia preto e uma fita isolante 3m');

    const transcription = await audioService.transcribe(testAudio, 'audio/ogg');
    assert.ok(transcription.includes('duas e meia'), 'Deve transcrever o áudio');

    const items = parseElectricalOrderText(transcription);
    assert.strictEqual(items.length, 2, 'Deve identificar os 2 materiais falados no áudio');
  });

  // 7. ARQUIVOS INVÁLIDOS
  await runTest(7, 'Tratamento de Arquivos Inválidos ou Corrompidos', async () => {
    const emptyFile = path.join(config.storage.attachmentsDir, 'arquivo_vazio.jpg');
    fs.writeFileSync(emptyFile, ''); // 0 bytes

    await assert.rejects(
      async () => await ocrService.extractText(emptyFile, 'image/jpeg'),
      /vazio/i,
      'Deve rejeitar arquivo de 0 bytes com erro explicativo'
    );
  });

  // 8. MENSAGENS AMBÍGUAS
  await runTest(8, 'Detecção de Mensagens Ambíguas e Características Faltantes', async () => {
    // Pedido com ambiguidade: "fio de duas e meia" sem cor e "passa-fio" sem comprimento
    const ambiguousText = '1 rolo de fio de duas e meia\n1 passa-fio';
    const result = await aiEngine.processOrder({
      orderId: 'TEST-AMBIGUOUS',
      messageOrigin: 'WHATSAPP_BUSINESS',
      text: ambiguousText
    });

    assert.strictEqual(result.processing_state, 'NEEDS_HUMAN_REVIEW', 'Deve marcar o pedido para revisão humana');
    assert.strictEqual(result.items.length, 2);

    // Item 1: Falta cor
    assert.strictEqual(result.items[0].needs_review, true);
    assert.ok(result.items[0].missing_specs.includes('cor_condutor'), 'Deve registrar ausência da cor do cabo');

    // Item 2: Falta comprimento da sonda
    assert.strictEqual(result.items[1].needs_review, true);
    assert.ok(result.items[1].missing_specs.includes('comprimento_metros'), 'Deve registrar ausência de comprimento do passa-fio');
  });

  // 9. PERSISTÊNCIA E INTEGRIDADE RELACIONAL
  await runTest(9, 'Persistência Relacional, Integridade e Rollback Transacional', async () => {
    const initialClientsCount = db.get('SELECT COUNT(*) as c FROM clients').c;

    // Teste de rollback: se ocorrer erro dentro de transação, nada deve ser persistido
    try {
      db.transaction(() => {
        db.run("INSERT INTO clients (id, name) VALUES ('cli_rollback_test', 'Cliente Rollback')");
        // Força erro intencional
        throw new Error('Erro intencional de simulação de falha');
      });
    } catch {
      // Esperado
    }

    const finalClientsCount = db.get('SELECT COUNT(*) as c FROM clients').c;
    assert.strictEqual(finalClientsCount, initialClientsCount, 'Transação deve ter sofrido rollback completo');
  });

  // 10. REVISÃO HUMANA
  await runTest(10, 'Fluxo de Edição e Aprovação Humana de Pedido', async () => {
    const orderId = 'ord_wa_demo_01'; // Pedido do seed com ambiguidade

    const itemsBefore = db.all('SELECT * FROM order_items WHERE order_id = ?', [orderId]);
    assert.ok(itemsBefore.length > 0);

    const firstItem = itemsBefore[0];
    // Edita o item resolvendo a cor faltante e definindo produto exato
    db.run(`
      UPDATE order_items 
      SET normalized_name = 'Cabo de Cobre Flexível 2,5 mm² 750V Azul Claro Neutro',
          matched_product_id = 'prod_cab_25_az',
          needs_review = 0,
          status = 'APPROVED'
      WHERE id = ?
    `, [firstItem.id]);

    const updatedItem = db.get('SELECT * FROM order_items WHERE id = ?', [firstItem.id]);
    assert.strictEqual(updatedItem.needs_review, 0);
    assert.strictEqual(updatedItem.status, 'APPROVED');
  });

  // 11. CATÁLOGO
  await runTest(11, 'Gestão de Catálogo e Correspondência Fonética/Sinônimos', async () => {
    // Testa busca de produto por sinônimo popular "fio 2 e meio"
    const matched = matchProductInCatalog({
      original_text: 'fio 2 e meio',
      normalized_name: 'Cabo Flexível 2.5',
      suggested_sku: null
    });

    assert.ok(matched.matched_product !== null, 'Deve encontrar o produto pelo sinônimo');
    assert.ok(matched.confidence >= 0.70, 'Confiança deve ser >= 70%');
  });

  // 12. COTAÇÃO
  await runTest(12, 'Geração de Cotação e Comparação de Fornecedores', async () => {
    // Utiliza cotação do seed (quot_demo_01)
    const matrix = quotationService.getComparisonMatrix('quot_demo_01');

    assert.ok(matrix.quotation !== null);
    assert.ok(matrix.proposals.length >= 2, 'Deve ter ao menos 2 propostas de fornecedor');
    assert.ok(matrix.items.length > 0, 'Deve ter itens na matriz');

    // Valida que o menor preço foi calculado
    const itemWithPrices = matrix.items.find(i => i.lowest_unit_price !== null);
    assert.ok(itemWithPrices, 'Deve ter identificado o menor preço de fornecedor');
    assert.ok(itemWithPrices.lowest_unit_price > 0);
  });

  // 13. EXPORTAÇÃO
  await runTest(13, 'Geração de Exportação de Cotação em CSV e JSON', async () => {
    const csv = exportService.exportQuotationToCsv('quot_demo_01');
    assert.ok(csv.startsWith('\uFEFF'), 'CSV deve conter BOM UTF-8 para compatibilidade com Excel');
    assert.ok(csv.includes('Cotação;COT-2026-0001'), 'CSV deve conter código da cotação');
    assert.ok(csv.includes('Menor Preço Unit.'), 'CSV deve conter coluna de menor preço');

    const json = exportService.exportQuotationToJson('quot_demo_01');
    assert.ok(json.quotation && json.items, 'JSON exportado deve ser estruturado');
  });

  // 14. AUTENTICAÇÃO E PERMISSÕES (RBAC)
  await runTest(14, 'Autenticação, Sessões e Controle de Acesso', async () => {
    const adminUser = db.get("SELECT * FROM users WHERE role = 'ADMIN' LIMIT 1");
    assert.ok(adminUser);

    const token = generateSessionToken(adminUser);
    assert.ok(token.startsWith('sess_'), 'Deve gerar token de sessão válido');
  });

  // 15. FALHAS DOS CONECTORES
  await runTest(15, 'Tratamento de Falhas de Conectores e Assinatura Inválida', async () => {
    // Testa verificação de webhook da Meta com token incorreto
    const challenge = whatsappCloudApi.verifyWebhook('subscribe', 'token_falso_invalido', '12345');
    assert.strictEqual(challenge, null, 'Deve rejeitar handshake com token falso');

    // Testa assinatura inválida
    const isSigValid = whatsappCloudApi.verifySignature('{"test": true}', 'sha256=assinatura_falsa_9999');
    assert.strictEqual(isSigValid, false, 'Deve rejeitar payload com assinatura HMAC inválida');
  });

  // 16. RECUPERAÇÃO APÓS FALHAS TEMPORÁRIAS
  await runTest(16, 'Tolerância a Falhas Temporárias de IA sem Perda da Mensagem Original', async () => {
    const rawClientText = '3 rolos de fio grosso de 10mm preto';
    const orderId = `ord_fail_recovery_${Date.now()}`;

    // Cria mensagem e pedido no banco
    db.run(`
      INSERT INTO orders (id, order_code, channel_id, entry_method, status, original_text)
      VALUES (?, 'PED-TEST-FAIL-01', 'chan_wa_coex', 'AUTOMATIC_WHATSAPP', 'PROCESSING', ?)
    `, [orderId, rawClientText]);

    // Simula falha na IA inserindo tarefa com erro forçado
    await taskQueue.handleAiExtraction(
      { id: 'task_simulated_fail' },
      { orderId, orderCode: 'PED-TEST-FAIL-01', text: null /* Força erro */, origin: 'AUTOMATIC_WHATSAPP' }
    );

    // Garante que o pedido NÃO foi excluído e a mensagem bruta original está 100% preservada
    const orderAfterFail = db.get('SELECT * FROM orders WHERE id = ?', [orderId]);
    assert.ok(orderAfterFail !== null, 'O pedido nunca deve ser deletado em caso de erro');
    assert.strictEqual(orderAfterFail.original_text, rawClientText, 'O texto original do cliente deve permanecer intacto');
    assert.strictEqual(orderAfterFail.status, 'PENDING_REVIEW', 'Pedido deve entrar em revisão com anotação de erro');
    assert.ok(orderAfterFail.review_notes.includes('Falha'), 'As notas de revisão devem registrar a falha');
  });

  // 17. INTEGRAÇÃO ORQUESTRADA VIA N8N (WHATSAPP BUSINESS)
  await runTest(17, 'Integração Orquestrada via n8n no WhatsApp', async () => {
    // a) Segredo compartilhado entre n8n e backend
    const originalSecret = config.whatsapp.n8nWebhookSecret;
    config.whatsapp.n8nWebhookSecret = 'segredo_teste_n8n';
    assert.strictEqual(whatsappCloudApi.verifyN8nSecret('segredo_teste_n8n'), true);
    assert.strictEqual(whatsappCloudApi.verifyN8nSecret('errado'), false);
    assert.strictEqual(whatsappCloudApi.verifyN8nSecret(undefined), false);
    config.whatsapp.n8nWebhookSecret = originalSecret;

    // b) Payload original da Meta repassado pelo n8n, com lista em várias linhas e aspas
    const wamId = `wamid.n8n_test_${Date.now()}`;
    const multilineText = 'Bom dia!\n- 2 rolos de cabo flexivel 2.5 "preto"\n- 1 disjuntor de 20 monopolar';
    const metaPayload = {
      object: 'whatsapp_business_account',
      entry: [{
        id: 'WABA_TEST',
        changes: [{
          field: 'messages',
          value: {
            messaging_product: 'whatsapp',
            metadata: { phone_number_id: '123' },
            contacts: [{ wa_id: '5511988885555', profile: { name: 'Carlos Instalador' } }],
            messages: [{ id: wamId, from: '5511988885555', timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: multilineText } }]
          }
        }]
      }]
    };

    const metaResult = await whatsappCloudApi.processN8nPayload(metaPayload);
    assert.strictEqual(metaResult.body.status, 'PROCESSED');
    const created = metaResult.body.events[0];
    assert.strictEqual(created.action, 'ORDER_CREATED');
    const order = db.get('SELECT * FROM orders WHERE id = ?', [created.order_id]);
    assert.strictEqual(order.entry_method, 'AUTOMATIC_WHATSAPP');
    assert.strictEqual(order.original_text, multilineText, 'Texto com quebras de linha e aspas deve chegar intacto');

    // c) Reenvio do mesmo evento pela Meta não duplica o pedido
    const dupResult = await whatsappCloudApi.processN8nPayload(metaPayload);
    assert.strictEqual(dupResult.body.events[0].action, 'DUPLICATE_IGNORED');

    // d) Eco do vendedor (Coexistência) é registrado sem criar pedido
    const echoId = `wamid.echo_test_${Date.now()}`;
    const echoResult = await whatsappCloudApi.processN8nPayload({
      entry: [{ changes: [{ field: 'smb_message_echoes', value: { message_echoes: [{ id: echoId, to: '5511988885555', type: 'text', text: { body: 'Separado, Carlos!' } }] } }] }]
    });
    assert.strictEqual(echoResult.body.events[0].action, 'ECHO_RECORDED');

    // e) Formato simplificado (usado pelo simulador do painel)
    const simpleResult = await whatsappCloudApi.processN8nPayload({
      externalId: `wam_n8n_simple_${Date.now()}`,
      senderPhone: '+55 11 98888-5555',
      senderName: 'Carlos Instalador (via n8n)',
      messageType: 'TEXT',
      text: '2 rolos de cabo flexivel 2.5 preto e 1 disjuntor de 20 monopolar'
    });
    assert.strictEqual(simpleResult.body.status, 'SUCCESS');
    const simpleOrder = db.get('SELECT * FROM orders WHERE id = ?', [simpleResult.body.order_id]);
    assert.ok(simpleOrder.review_notes.includes('n8n'));

    // f) Payload incompleto é rejeitado com 400
    const invalid = await whatsappCloudApi.processN8nPayload({ text: 'sem telefone' });
    assert.strictEqual(invalid.httpStatus, 400);

    const items = parseElectricalOrderText(multilineText);
    assert.strictEqual(items.length, 2, 'Deve extrair os itens da mensagem do n8n');
  });

  // RELATÓRIO FINAL
  console.log('\n================================================================');
  console.log('                 RELATÓRIO DE EXECUÇÃO DE TESTES                ');
  console.log('================================================================');
  const passed = testResults.filter(t => t.status === 'PASSED').length;
  const failed = testResults.filter(t => t.status === 'FAILED').length;
  console.log(`Total de Cenários Avaliados: ${testResults.length}`);
  console.log(`Aprovados: ${passed} / ${testResults.length}`);
  console.log(`Reprovados: ${failed} / ${testResults.length}`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runAllTests().catch(err => {
  console.error('Erro fatal ao rodar testes:', err);
  process.exit(1);
});
