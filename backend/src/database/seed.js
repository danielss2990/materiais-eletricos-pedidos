const crypto = require('node:crypto');
const db = require('./connection');
const { hashPassword } = require('../utils/security');

function generateId(prefix = 'id') {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}

function runSeed() {
  console.log('--- Iniciando Seed do Banco de Dados ---');

  db.transaction(() => {
    // Limpeza de tabelas transacionais para garantir re-execução 100% limpa e idempotente
    db.exec(`
      DELETE FROM supplier_proposal_items;
      DELETE FROM supplier_proposals;
      DELETE FROM quotation_items;
      DELETE FROM quotations;
      DELETE FROM order_items;
      DELETE FROM attachments;
      DELETE FROM orders;
      DELETE FROM messages;
      DELETE FROM processing_tasks;
      DELETE FROM audit_logs;
    `);

    // 1. USUÁRIOS
    const users = [
      { id: 'usr_admin', username: 'admin', password: 'admin123', name: 'Administrador do Sistema', email: 'admin@eletricabrasil.com.br', role: 'ADMIN' },
      { id: 'usr_vendedor', username: 'vendedor1', password: 'vendas123', name: 'Carlos Vendedor', email: 'carlos.vendas@eletricabrasil.com.br', role: 'ATTENDANT' },
      { id: 'usr_analista', username: 'analista1', password: 'cotacao123', name: 'Juliana Cotações', email: 'juliana.cotacao@eletricabrasil.com.br', role: 'QUOTATION_ANALYST' }
    ];

    for (const u of users) {
      db.run(`
        INSERT OR REPLACE INTO users (id, username, password_hash, full_name, email, role)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [u.id, u.username, hashPassword(u.password), u.name, u.email, u.role]);
    }
    console.log(`✓ ${users.length} usuários inseridos/atualizados.`);

    // 2. CANAIS
    const channels = [
      {
        id: 'chan_wa_coex',
        type: 'WHATSAPP_BUSINESS',
        name: 'WhatsApp Vendas Balcão (Coexistência)',
        identifier: '+55 11 98888-7777',
        status: 'ACTIVE',
        config_json: JSON.stringify({
          provider: 'Meta Cloud API Coexistence v21.0',
          app_id: '10982347891234',
          embedded_signup_version: 'v4',
          coexistence_enabled: true,
          webhook_events: ['messages', 'smb_message_echoes', 'smb_app_state_sync']
        }),
        last_event_at: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
        last_sync_at: new Date().toISOString()
      },
      {
        id: 'chan_wa_personal',
        type: 'WHATSAPP_PERSONAL',
        name: 'WhatsApp Pessoal Vendedor Carlos',
        identifier: '+55 11 97777-6666',
        status: 'UNAVAILABLE_OFFICIAL',
        config_json: JSON.stringify({
          restriction: 'A Meta Platforms não disponibiliza API oficial para contas WhatsApp Pessoal. Uso de scraping ou emulação do WhatsApp Web é proibido para evitar banimento do número telefônico.',
          contingency_workflow: 'Entrada manual assistida e upload direto de áudios/fotos pelo funcionário.'
        }),
        last_event_at: null,
        last_sync_at: null,
        error_details: 'Sem suporte a API oficial pela Meta. Modo contingência ativado.'
      },
      {
        id: 'chan_email_pedidos',
        type: 'EMAIL',
        name: 'E-mail Comercial Pedidos',
        identifier: 'pedidos@eletricabrasil.com.br',
        status: 'ACTIVE',
        config_json: JSON.stringify({
          protocol: 'IMAP sobre TLS',
          host: 'imap.eletricabrasil.com.br',
          port: 993,
          tls: true,
          poll_interval_seconds: 60,
          deduplication: 'RFC 5322 Message-ID'
        }),
        last_event_at: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
        last_sync_at: new Date().toISOString()
      },
      {
        id: 'chan_manual_balcao',
        type: 'MANUAL_ENTRY',
        name: 'Entrada Manual & Upload Balcão',
        identifier: 'balcao-loja',
        status: 'ACTIVE',
        config_json: JSON.stringify({
          description: 'Canal de contingência para registro direto de pedidos de clientes presenciais ou recebidos via canais não integrados.'
        }),
        last_event_at: new Date().toISOString(),
        last_sync_at: new Date().toISOString()
      }
    ];

    for (const c of channels) {
      db.run(`
        INSERT OR REPLACE INTO channels (id, type, name, identifier, status, config_json, last_event_at, last_sync_at, error_details)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [c.id, c.type, c.name, c.identifier, c.status, c.config_json, c.last_event_at, c.last_sync_at, c.error_details || null]);
    }
    console.log(`✓ ${channels.length} canais inseridos/atualizados.`);

    // 3. CLIENTES
    const clients = [
      { id: 'cli_volt', name: 'Instaladora Elétrica Volt Ltda', phone: '+55 11 98888-1111', email: 'compras@eletricavolt.com.br', doc: '12.345.678/0001-90', notes: 'Cliente preferencial. Obras prediais.' },
      { id: 'cli_santana', name: 'Engenharia & Construções Santana', phone: '+55 11 98888-2222', email: 'obras@engsantana.com.br', doc: '98.765.432/0001-10', notes: 'Geralmente pede fita isolante 3M e disjuntores DIN.' },
      { id: 'cli_carlos_elet', name: 'Marcos Silva Eletricista Autônomo', phone: '+55 11 98888-3333', email: 'marcos.eletrica@gmail.com', doc: '123.456.789-00', notes: 'Costuma mandar áudios curtos de pedidos de balcão.' }
    ];

    for (const cl of clients) {
      db.run(`
        INSERT OR REPLACE INTO clients (id, name, phone, email, document, notes)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [cl.id, cl.name, cl.phone, cl.email, cl.doc, cl.notes]);
    }
    console.log(`✓ ${clients.length} clientes inseridos/atualizados.`);

    // 4. PRODUTOS DO CATÁLOGO DE MATERIAIS ELÉTRICOS
    const products = [
      {
        id: 'prod_cab_25_az',
        sku: 'CAB-FLEX-2.5-AZ',
        name: 'Cabo de Cobre Flexível 2,5 mm² 750V Azul Claro Neutro',
        desc: 'Cabo unipolar isolado em PVC 70°C antichama 750V. NBR NM 247-3. Rolo com 100m.',
        synonyms: ['fio de duas e meia', 'cabo 2.5', 'fio 2.5 azul', 'cabo 2 e meio', 'fio duas e meia azul', 'fio 2,5mm'],
        unit: 'ROLO_100M',
        cat: 'CONDUTORES',
        specs: { secao: '2.5mm²', tensao: '750V', cor: 'Azul', comprimento_padrao: '100m', norma: 'NBR NM 247-3' }
      },
      {
        id: 'prod_cab_25_pr',
        sku: 'CAB-FLEX-2.5-PR',
        name: 'Cabo de Cobre Flexível 2,5 mm² 750V Preto Fase',
        desc: 'Cabo unipolar isolado em PVC 70°C antichama 750V. NBR NM 247-3. Rolo com 100m.',
        synonyms: ['fio de duas e meia preto', 'cabo 2.5 preto', 'fio preto 2,5', 'cabo 2 e meio preto'],
        unit: 'ROLO_100M',
        cat: 'CONDUTORES',
        specs: { secao: '2.5mm²', tensao: '750V', cor: 'Preto', comprimento_padrao: '100m', norma: 'NBR NM 247-3' }
      },
      {
        id: 'prod_cab_25_vd',
        sku: 'CAB-FLEX-2.5-VD',
        name: 'Cabo de Cobre Flexível 2,5 mm² 750V Verde Terra',
        desc: 'Cabo unipolar isolado em PVC 70°C antichama 750V. NBR NM 247-3. Rolo com 100m.',
        synonyms: ['fio de duas e meia terra', 'fio terra 2.5', 'cabo verde 2 e meio', 'fio verde 2.5'],
        unit: 'ROLO_100M',
        cat: 'CONDUTORES',
        specs: { secao: '2.5mm²', tensao: '750V', cor: 'Verde', comprimento_padrao: '100m', norma: 'NBR NM 247-3' }
      },
      {
        id: 'prod_cab_40_pr',
        sku: 'CAB-FLEX-4.0-PR',
        name: 'Cabo de Cobre Flexível 4,0 mm² 750V Preto Fase',
        desc: 'Cabo unipolar isolado em PVC 70°C antichama 750V. NBR NM 247-3. Rolo com 100m.',
        synonyms: ['fio de 4', 'cabo 4mm preto', 'fio 4mm', 'cabo 4 e meio', 'fio de quatro'],
        unit: 'ROLO_100M',
        cat: 'CONDUTORES',
        specs: { secao: '4.0mm²', tensao: '750V', cor: 'Preto', comprimento_padrao: '100m' }
      },
      {
        id: 'prod_cab_60_pr',
        sku: 'CAB-FLEX-6.0-PR',
        name: 'Cabo de Cobre Flexível 6,0 mm² 750V Preto Fase',
        desc: 'Cabo unipolar isolado em PVC 70°C antichama 750V. Rolo com 100m.',
        synonyms: ['fio de 6', 'cabo 6mm', 'fio 6 preto', 'cabo 6'],
        unit: 'ROLO_100M',
        cat: 'CONDUTORES',
        specs: { secao: '6.0mm²', tensao: '750V', cor: 'Preto' }
      },
      {
        id: 'prod_disj_1p_20a',
        sku: 'DISJ-DIN-1P-20A',
        name: 'Disjuntor Termomagnético DIN Monopolar 20A Curva C',
        desc: 'Mini disjuntor padrão DIN monopolar 20A curva de disparo C, capacidade 3kA/4.5kA.',
        synonyms: ['disjuntor de 20', 'disjuntor 20a', 'disjuntor din 20', 'disjuntor monopolar 20', 'disjuntor 20 monopolar'],
        unit: 'PC',
        cat: 'PROTECAO_E_COMANDO',
        specs: { polos: 1, corrente: '20A', curva: 'C', norma: 'NBR NM 60898' }
      },
      {
        id: 'prod_disj_2p_32a',
        sku: 'DISJ-DIN-2P-32A',
        name: 'Disjuntor Termomagnético DIN Bipolar 32A Curva C',
        desc: 'Mini disjuntor padrão DIN bipolar 32A curva C para chuveiros e cargas bifásicas.',
        synonyms: ['disjuntor bifasico 32', 'disjuntor bipolar de 32', 'disjuntor 32a duplo', 'disjuntor bipolar 32'],
        unit: 'PC',
        cat: 'PROTECAO_E_COMANDO',
        specs: { polos: 2, corrente: '32A', curva: 'C' }
      },
      {
        id: 'prod_elet_corr_34',
        sku: 'ELET-CORR-34-50M',
        name: 'Eletroduto Corrugado Flexível PVC Amarelo 3/4" (25mm) Rolo 50m',
        desc: 'Eletroduto corrugado leve amarelo para alvenaria embutida. NBR 15465. Rolo com 50 metros.',
        synonyms: ['conduite amarelo de 3/4', 'eletroduto corrugado 3/4', 'mangueira amarela 3/4', 'conduíte 25mm', 'eletroduto amarelo 3/4'],
        unit: 'ROLO_50M',
        cat: 'ELETRODUTOS',
        specs: { bitola: '3/4" (25mm)', material: 'PVC Antichama', comprimento: '50m', cor: 'Amarelo' }
      },
      {
        id: 'prod_cx_4x2',
        sku: 'CX-EMB-4X2-AM',
        name: 'Caixa de Embutir 4x2 PVC Amarela para Alvenaria',
        desc: 'Caixa plástica de derivação e passagem 4x2 com entradas para eletrodutos de 1/2, 3/4 e 1 pol.',
        synonyms: ['caixinha 4x2', 'caixa 4x2', 'caixa amarela 4x2', 'caixa de tomada 4x2'],
        unit: 'PC',
        cat: 'ELETRODUTOS',
        specs: { dimensao: '4x2', cor: 'Amarela', tipo: 'Embutir alvenaria' }
      },
      {
        id: 'prod_passa_fio_15m',
        sku: 'PASSA-FIO-15M',
        name: 'Passa-Fio / Sonda Guia de Aço Revestido com Alma de Aço 15 Metros',
        desc: 'Passa-fio profissional com ponta metálica flexível redonda e alma de aço resistente. 15 metros.',
        synonyms: ['passa-fio', 'passa fio', 'sonda', 'sonda passa fio', 'guia de passar fio', 'passa-fio de 15m', 'sonda 15 metros'],
        unit: 'PC',
        cat: 'ACESSORIOS',
        specs: { comprimento: '15m', material: 'Aço revestido em polipropileno' }
      },
      {
        id: 'prod_passa_fio_20m',
        sku: 'PASSA-FIO-20M',
        name: 'Passa-Fio / Sonda Guia de Aço Revestido com Alma de Aço 20 Metros',
        desc: 'Passa-fio profissional com ponta metálica flexível redonda e alma de aço resistente. 20 metros.',
        synonyms: ['passa-fio 20m', 'sonda 20m', 'sonda 20 metros', 'passa fio 20m'],
        unit: 'PC',
        cat: 'ACESSORIOS',
        specs: { comprimento: '20m', material: 'Aço revestido' }
      },
      {
        id: 'prod_fita_3m',
        sku: 'FITA-ISOL-3M-20M',
        name: 'Fita Isolante Imperial 3M 19mm x 20m Antichama',
        desc: 'Fita isolante de PVC antichama até 750V, largura 19mm, comprimento 20 metros.',
        synonyms: ['fita isolante 3m', 'fita isolante 20m', 'fita preta 3m', 'fita isolante imperial'],
        unit: 'ROLO',
        cat: 'ACESSORIOS',
        specs: { largura: '19mm', comprimento: '20m', isolacao: '750V', marca: '3M' }
      },
      {
        id: 'prod_rabicho',
        sku: 'RABICHO-PLUG-10A',
        name: 'Rabicho / Chicote de Ligação Bipolar 2P 10A com Plugue Injetado 1,5m',
        desc: 'Cabo paralelo 2x0,75mm² com plugue 2P 10A macho injetado para ligação de luminárias e eletrodomésticos.',
        synonyms: ['rabicho', 'rabicho 10a', 'chicote com plugue', 'cabo rabicho', 'rabicho de tomada'],
        unit: 'PC',
        cat: 'ACESSORIOS',
        specs: { corrente: '10A', pinos: '2P', comprimento: '1,5m' }
      },
      {
        id: 'prod_tom_10a',
        sku: 'MOD-TOM-2PT-10A',
        name: 'Módulo de Tomada 2P+T 10A 250V Branco',
        desc: 'Módulo de tomada padrão brasileiro NBR 14136 10A 250V acabamento branco alto brilho.',
        synonyms: ['tomada 10a', 'modulo tomada 10', 'tomada comum', 'tomada 10 amperes'],
        unit: 'PC',
        cat: 'ACESSORIOS',
        specs: { corrente: '10A', tensao: '250V', padrao: 'NBR 14136' }
      },
      {
        id: 'prod_tom_20a',
        sku: 'MOD-TOM-2PT-20A',
        name: 'Módulo de Tomada 2P+T 20A 250V Branco',
        desc: 'Módulo de tomada padrão brasileiro NBR 14136 20A para micro-ondas e ar-condicionado.',
        synonyms: ['tomada de 20', 'tomada 20a', 'tomada grossa', 'modulo tomada 20'],
        unit: 'PC',
        cat: 'ACESSORIOS',
        specs: { corrente: '20A', tensao: '250V', padrao: 'NBR 14136' }
      }
    ];

    for (const p of products) {
      db.run(`
        INSERT OR REPLACE INTO products (id, sku, name, technical_description, synonyms_array, default_unit, category, specifications_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [p.id, p.sku, p.name, p.desc, JSON.stringify(p.synonyms), p.unit, p.cat, JSON.stringify(p.specs)]);
    }
    console.log(`✓ ${products.length} produtos do catálogo inseridos/atualizados.`);

    // 5. FORNECEDORES
    const suppliers = [
      { id: 'sup_cobre_brasil', name: 'Distribuidora Cabos do Brasil Ltda', cnpj: '11.222.333/0001-44', contact: 'Rodrigo', phone: '11 3456-7890', email: 'vendas@cabosbrasil.com.br', terms: '28 DDL', delivery: 2 },
      { id: 'sup_eletrica_nac', name: 'Elétrica Nacional Atacadista', cnpj: '22.333.444/0001-55', contact: 'Mariana', phone: '11 3322-1100', email: 'cotacoes@eletricanacional.com.br', terms: 'À vista com 5%', delivery: 1 },
      { id: 'sup_lider', name: 'Materiais Elétricos Líder S/A', cnpj: '33.444.555/0001-66', contact: 'Fernando', phone: '11 4004-9988', email: 'vendas@eletretailider.com.br', terms: '14/28 DDL', delivery: 3 }
    ];

    for (const s of suppliers) {
      db.run(`
        INSERT OR REPLACE INTO suppliers (id, name, cnpj_cpf, contact_name, phone, email, payment_terms, delivery_days)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [s.id, s.name, s.cnpj, s.contact, s.phone, s.email, s.terms, s.delivery]);
    }
    console.log(`✓ ${suppliers.length} fornecedores inseridos/atualizados.`);

    // 6. PEDIDOS DE EXEMPLO COM DIFERENTES ESTADOS E ORIGENS
    // Pedido 1: Recebido via WhatsApp Business com Coexistência - Pendente de Revisão (tem ambiguidade: "fio de duas e meia" sem cor informada)
    const order1Id = 'ord_wa_demo_01';
    const msg1Id = 'msg_wa_01';
    const extId1 = 'wam_demo_2026_001_meta';

    db.run(`
      INSERT OR REPLACE INTO messages (id, channel_id, external_id, sender_id, sender_name, direction, content_type, raw_payload, raw_text, received_at)
      VALUES (?, ?, ?, ?, ?, 'INBOUND', 'TEXT', ?, ?, ?)
    `, [
      msg1Id,
      'chan_wa_coex',
      extId1,
      '+55 11 98888-1111',
      'Instaladora Volt (Eng. Paulo)',
      JSON.stringify({ wam_id: extId1, from: '5511988881111', text: { body: 'Boa tarde Carlos! Preciso com urgência para amanhã cedo:\n- 2 rolo de fio de duas e meia\n- 5 disjuntor de 20\n- 1 rolo de conduite amarelo de 3/4\n- 10 caixinha 4x2\n- 1 passa-fio' } }),
      'Boa tarde Carlos! Preciso com urgência para amanhã cedo:\n- 2 rolo de fio de duas e meia\n- 5 disjuntor de 20\n- 1 rolo de conduite amarelo de 3/4\n- 10 caixinha 4x2\n- 1 passa-fio',
      new Date(Date.now() - 30 * 60 * 1000).toISOString()
    ]);

    db.run(`
      INSERT OR REPLACE INTO orders (id, order_code, client_id, message_id, channel_id, entry_method, status, original_text, review_notes)
      VALUES (?, 'PED-2026-0001', 'cli_volt', ?, 'chan_wa_coex', 'AUTOMATIC_WHATSAPP', 'PENDING_REVIEW', ?, ?)
    `, [
      order1Id,
      msg1Id,
      'Boa tarde Carlos! Preciso com urgência para amanhã cedo:\n- 2 rolo de fio de duas e meia\n- 5 disjuntor de 20\n- 1 rolo de conduite amarelo de 3/4\n- 10 caixinha 4x2\n- 1 passa-fio',
      'Detectadas ambiguidades em fio de 2.5 (falta cor) e passa-fio (falta comprimento: 15m ou 20m).'
    ]);

    const order1Items = [
      {
        id: generateId('item'),
        orderId: order1Id,
        orig: '2 rolo de fio de duas e meia',
        norm: 'Cabo de Cobre Flexível 2,5 mm² 750V',
        qty: 2,
        unit: 'ROLO_100M',
        specs: JSON.stringify({ secao: '2.5mm²', tensao: '750V' }),
        sugProd: 'prod_cab_25_az',
        matchedProd: null,
        conf: 0.85,
        review: 1,
        reason: 'Ambiguidade: cor da isolação não informada no pedido original (azul, preto, verde ou vermelho).',
        missing: JSON.stringify(['cor_condutor'])
      },
      {
        id: generateId('item'),
        orderId: order1Id,
        orig: '5 disjuntor de 20',
        norm: 'Disjuntor Termomagnético DIN Monopolar 20A Curva C',
        qty: 5,
        unit: 'PC',
        specs: JSON.stringify({ corrente: '20A', polos: 1, curva: 'C' }),
        sugProd: 'prod_disj_1p_20a',
        matchedProd: 'prod_disj_1p_20a',
        conf: 0.95,
        review: 0,
        reason: null,
        missing: JSON.stringify([])
      },
      {
        id: generateId('item'),
        orderId: order1Id,
        orig: '1 rolo de conduite amarelo de 3/4',
        norm: 'Eletroduto Corrugado Flexível PVC Amarelo 3/4" (25mm) Rolo 50m',
        qty: 1,
        unit: 'ROLO_50M',
        specs: JSON.stringify({ bitola: '3/4"', cor: 'Amarelo' }),
        sugProd: 'prod_elet_corr_34',
        matchedProd: 'prod_elet_corr_34',
        conf: 0.98,
        review: 0,
        reason: null,
        missing: JSON.stringify([])
      },
      {
        id: generateId('item'),
        orderId: order1Id,
        orig: '10 caixinha 4x2',
        norm: 'Caixa de Embutir 4x2 PVC Amarela para Alvenaria',
        qty: 10,
        unit: 'PC',
        specs: JSON.stringify({ dimensao: '4x2' }),
        sugProd: 'prod_cx_4x2',
        matchedProd: 'prod_cx_4x2',
        conf: 0.98,
        review: 0,
        reason: null,
        missing: JSON.stringify([])
      },
      {
        id: generateId('item'),
        orderId: order1Id,
        orig: '1 passa-fio',
        norm: 'Passa-Fio / Sonda Guia de Aço Revestido',
        qty: 1,
        unit: 'PC',
        specs: JSON.stringify({ material: 'Aço' }),
        sugProd: 'prod_passa_fio_15m',
        matchedProd: null,
        conf: 0.70,
        review: 1,
        reason: 'Ambiguidade: comprimento da sonda/passa-fio não especificado (opções: 15 metros ou 20 metros).',
        missing: JSON.stringify(['comprimento_metros'])
      }
    ];

    for (const item of order1Items) {
      db.run(`
        INSERT OR REPLACE INTO order_items (id, order_id, original_text, normalized_name, quantity, unit, technical_specs, suggested_product_id, matched_product_id, confidence_score, needs_review, review_reason, missing_specs)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [item.id, item.orderId, item.orig, item.norm, item.qty, item.unit, item.specs, item.sugProd, item.matchedProd, item.conf, item.review, item.reason, item.missing]);
    }

    // Pedido 2: Recebido via E-mail - Já Aprovado e em Cotação
    const order2Id = 'ord_email_demo_02';
    const msg2Id = 'msg_email_02';
    const extId2 = '<202610201530.msg02@engsantana.com.br>';

    db.run(`
      INSERT OR REPLACE INTO messages (id, channel_id, external_id, sender_id, sender_name, direction, content_type, raw_payload, raw_text, received_at)
      VALUES (?, ?, ?, ?, ?, 'INBOUND', 'TEXT', ?, ?, ?)
    `, [
      msg2Id,
      'chan_email_pedidos',
      extId2,
      'obras@engsantana.com.br',
      'Eng. Santana Compras',
      JSON.stringify({ message_id: extId2, subject: 'Cotação de Materiais - Obra Edifício Jardins', body: 'Segue pedido para cotação:\n- 3 rolos de cabo flexível 2.5 preto\n- 2 rolos de cabo flexível 2.5 azul\n- 4 fitas isolantes 3M de 20m\n- 2 disjuntores bipolares de 32A' }),
      'Segue pedido para cotação:\n- 3 rolos de cabo flexível 2.5 preto\n- 2 rolos de cabo flexível 2.5 azul\n- 4 fitas isolantes 3M de 20m\n- 2 disjuntores bipolares de 32A',
      new Date(Date.now() - 2 * 3600 * 1000).toISOString()
    ]);

    db.run(`
      INSERT OR REPLACE INTO orders (id, order_code, client_id, message_id, channel_id, entry_method, status, original_text, reviewed_by, reviewed_at)
      VALUES (?, 'PED-2026-0002', 'cli_santana', ?, 'chan_email_pedidos', 'AUTOMATIC_EMAIL', 'IN_QUOTATION', ?, 'usr_analista', ?)
    `, [
      order2Id,
      msg2Id,
      'Segue pedido para cotação:\n- 3 rolos de cabo flexível 2.5 preto\n- 2 rolos de cabo flexível 2.5 azul\n- 4 fitas isolantes 3M de 20m\n- 2 disjuntores bipolares de 32A',
      new Date().toISOString()
    ]);

    const order2Items = [
      { id: generateId('item'), orig: '3 rolos de cabo flexível 2.5 preto', norm: 'Cabo de Cobre Flexível 2,5 mm² 750V Preto Fase', qty: 3, unit: 'ROLO_100M', prod: 'prod_cab_25_pr' },
      { id: generateId('item'), orig: '2 rolos de cabo flexível 2.5 azul', norm: 'Cabo de Cobre Flexível 2,5 mm² 750V Azul Claro Neutro', qty: 2, unit: 'ROLO_100M', prod: 'prod_cab_25_az' },
      { id: generateId('item'), orig: '4 fitas isolantes 3M de 20m', norm: 'Fita Isolante Imperial 3M 19mm x 20m Antichama', qty: 4, unit: 'ROLO', prod: 'prod_fita_3m' },
      { id: generateId('item'), orig: '2 disjuntores bipolares de 32A', norm: 'Disjuntor Termomagnético DIN Bipolar 32A Curva C', qty: 2, unit: 'PC', prod: 'prod_disj_2p_32a' }
    ];

    for (const item of order2Items) {
      db.run(`
        INSERT OR REPLACE INTO order_items (id, order_id, original_text, normalized_name, quantity, unit, technical_specs, suggested_product_id, matched_product_id, confidence_score, needs_review, status)
        VALUES (?, ?, ?, ?, ?, ?, '{}', ?, ?, 0.99, 0, 'APPROVED')
      `, [item.id, order2Id, item.orig, item.norm, item.qty, item.unit, item.prod, item.prod]);
    }

    // Criar Cotação para o Pedido 2
    const quotId = 'quot_demo_01';
    db.run(`
      INSERT OR REPLACE INTO quotations (id, order_id, quotation_code, status, total_amount, notes)
      VALUES (?, ?, 'COT-2026-0001', 'SENT_TO_SUPPLIERS', 1485.50, 'Cotação em andamento enviada para Cabos Brasil e Elétrica Nacional.')
    `, [quotId, order2Id]);

    for (const item of order2Items) {
      const qItemId = generateId('qitem');
      db.run(`
        INSERT OR REPLACE INTO quotation_items (id, quotation_id, order_item_id, product_id, quantity, target_price)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [qItemId, quotId, item.id, item.prod, item.qty, 100.0]);
    }

    // Proposta do Fornecedor 1
    const prop1Id = 'prop_cabos_brasil_01';
    db.run(`
      INSERT OR REPLACE INTO supplier_proposals (id, quotation_id, supplier_id, proposal_code, total_amount, payment_terms, delivery_deadline_days, validity_date)
      VALUES (?, ?, 'sup_cobre_brasil', 'PROP-CB-8819', 1440.00, '28 DDL', 2, '2026-10-30')
    `, [prop1Id, quotId]);

    // Proposta do Fornecedor 2
    const prop2Id = 'prop_eletrica_nac_02';
    db.run(`
      INSERT OR REPLACE INTO supplier_proposals (id, quotation_id, supplier_id, proposal_code, total_amount, payment_terms, delivery_deadline_days, validity_date)
      VALUES (?, ?, 'sup_eletrica_nac', 'ORC-EN-4412', 1410.00, 'À vista com 5%', 1, '2026-10-25')
    `, [prop2Id, quotId]);

    // Insere itens das propostas para comparação de preços
    const qItems = db.all('SELECT * FROM quotation_items WHERE quotation_id = ?', [quotId]);
    for (const qItem of qItems) {
      db.run(`
        INSERT INTO supplier_proposal_items (id, supplier_proposal_id, quotation_item_id, unit_price, total_price, brand_offered, availability, delivery_days)
        VALUES (?, ?, ?, ?, ?, ?, 'PRONTA_ENTREGA', 2)
      `, [generateId('propitem'), prop1Id, qItem.id, 120.00, 120.00 * qItem.quantity, 'Sil']);

      db.run(`
        INSERT INTO supplier_proposal_items (id, supplier_proposal_id, quotation_item_id, unit_price, total_price, brand_offered, availability, delivery_days)
        VALUES (?, ?, ?, ?, ?, ?, 'PRONTA_ENTREGA', 1)
      `, [generateId('propitem'), prop2Id, qItem.id, 115.00, 115.00 * qItem.quantity, 'Cobrecom']);
    }

    console.log(`✓ 2 pedidos de exemplo com itens e cotações inseridos.`);
  });

  console.log('--- Seed Concluído com Sucesso ---');
}

if (require.main === module) {
  runSeed();
}

module.exports = runSeed;
