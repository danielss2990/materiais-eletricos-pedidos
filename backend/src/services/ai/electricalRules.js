// Regras de Domínio Elétrico Brasileiro (NBR 5410, NBR NM 247-3, NBR NM 60898)
// Normalização de jargões técnicos e detecção de ambiguidades

const NUMBER_WORDS = {
  'um': 1, 'uma': 1,
  'dois': 2, 'duas': 2,
  'tres': 3, 'três': 3,
  'quatro': 4,
  'cinco': 5,
  'seis': 6, 'meia': 6,
  'sete': 7,
  'oito': 8,
  'nove': 9,
  'dez': 10,
  'quinze': 15,
  'vinte': 20,
  'trinta': 30,
  'cinquenta': 50,
  'cem': 100
};

/**
 * Normaliza termos e extrai itens estruturados com base em regras elétricas.
 */
function analyzeElectricalItem(rawLine) {
  const line = rawLine.trim();
  if (!line) return null;

  const lower = line.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // remove acentos para matching
    .replace(/[•\-\*\+]/g, ' ')
    .trim();

  // 1. Extração de Quantidade
  let quantity = 1;
  let unit = 'PC';
  let remainingText = lower;

  // Regex para quantidade numérica ou por extenso no início
  const qtyMatch = remainingText.match(/^(\d+(?:[.,]\d+)?|\b(?:um|uma|dois|duas|tres|três|quatro|cinco|seis|sete|oito|nove|dez|quinze|vinte|trinta|cinquenta|cem)\b)\s*(.*)/i);
  if (qtyMatch) {
    const rawQty = qtyMatch[1].toLowerCase();
    if (NUMBER_WORDS[rawQty]) {
      quantity = NUMBER_WORDS[rawQty];
    } else {
      quantity = parseFloat(rawQty.replace(',', '.'));
    }
    remainingText = qtyMatch[2].trim();
  }

  // Extração de Unidade
  if (/^(rolo|rolos|rl)\b/i.test(remainingText)) {
    unit = 'ROLO_100M';
    remainingText = remainingText.replace(/^(rolo|rolos|rl)\s*(de\s*)?/i, '');
  } else if (/^(metro|metros|mt|mts|m)\b/i.test(remainingText)) {
    unit = 'M';
    remainingText = remainingText.replace(/^(metro|metros|mt|mts|m)\s*(de\s*)?/i, '');
  } else if (/^(barra|barras|br)\b/i.test(remainingText)) {
    unit = 'BARRA_3M';
    remainingText = remainingText.replace(/^(barra|barras|br)\s*(de\s*)?/i, '');
  } else if (/^(caixa|caixas|cx)\b/i.test(remainingText)) {
    unit = 'CX';
    remainingText = remainingText.replace(/^(caixa|caixas|cx)\s*(de\s*)?/i, '');
  } else if (/^(peca|pecas|pc|pcs|unidade|unidades|un)\b/i.test(remainingText)) {
    unit = 'PC';
    remainingText = remainingText.replace(/^(peca|pecas|pc|pcs|unidade|unidades|un)\s*(de\s*)?/i, '');
  }

  let normalizedName = line;
  let explicitSpecs = {};
  let inferredSpecs = {};
  let missingSpecs = [];
  let ambiguities = [];
  let suggestedSku = null;
  let confidenceScore = 0.5;
  let needsReview = false;
  let reviewReason = null;

  // 2. Análise por Categorias de Materiais Elétricos

  // A. PASSA-FIO / SONDA (ex.: "passa-fio", "sonda", "guia de passar fio")
  // Avaliado antes de condutores pois a palavra "fio" está contida em "passa-fio"
  if (/passa[\s-]?fio|sonda|guia(\s+de\s+passar)?/i.test(remainingText)) {
    let comp = null;
    if (/15\s*m|15\s*metros/i.test(remainingText)) comp = '15 Metros';
    else if (/20\s*m|20\s*metros/i.test(remainingText)) comp = '20 Metros';
    else if (/10\s*m|10\s*metros/i.test(remainingText)) comp = '10 Metros';

    if (comp) {
      explicitSpecs.comprimento = comp;
      normalizedName = `Passa-Fio / Sonda Guia de Aço Revestido com Alma de Aço ${comp}`;
      suggestedSku = comp === '15 Metros' ? 'PASSA-FIO-15M' : (comp === '20 Metros' ? 'PASSA-FIO-20M' : null);
      confidenceScore = 0.94;
    } else {
      // Ambiguidade: falta metragem da sonda
      normalizedName = `Passa-Fio / Sonda Guia de Aço Revestido com Alma de Aço (Metragem a definir)`;
      missingSpecs.push('comprimento_metros');
      ambiguities.push('Comprimento do passa-fio não especificado (opções comerciais habituais: 15 metros ou 20 metros).');
      needsReview = true;
      reviewReason = 'Ambiguidade: comprimento da sonda/passa-fio não especificado (15m ou 20m).';
      suggestedSku = 'PASSA-FIO-15M';
      confidenceScore = 0.72;
    }
  }

  // B. CABOS E CONDUTORES ELÉTRICOS (ex.: "fio de duas e meia", "cabo 4", "fio 6")
  else if (/(\bfio\b|\bcabo\b)/i.test(remainingText) || /duas e meia|um e meio|uma e meia/i.test(remainingText)) {
    let secao = null;
    let cor = null;

    if (/duas e meia|2[.,]5|dois e meio/i.test(remainingText)) {
      secao = '2.5mm²';
    } else if (/uma e meia|um e meio|1[.,]5/i.test(remainingText)) {
      secao = '1.5mm²';
    } else if (/\b4\b|\bquatro\b|4[.,]0|4mm/i.test(remainingText)) {
      secao = '4.0mm²';
    } else if (/\b6\b|\bseis\b|6[.,]0|6mm/i.test(remainingText)) {
      secao = '6.0mm²';
    } else if (/\b10\b|\bdez\b|10[.,]0|10mm/i.test(remainingText)) {
      secao = '10.0mm²';
    }

    if (/\bazul\b/i.test(remainingText)) cor = 'Azul';
    else if (/\bpreto\b/i.test(remainingText)) cor = 'Preto';
    else if (/\bverde\b|\bterra\b/i.test(remainingText)) cor = 'Verde';
    else if (/\bvermelho\b/i.test(remainingText)) cor = 'Vermelho';
    else if (/\bbranco\b/i.test(remainingText)) cor = 'Branco';

    if (secao) {
      explicitSpecs.secao = secao;
      inferredSpecs.tensao = '750V';
      inferredSpecs.tipo = 'Cobre Flexível Classe 5';

      if (cor) {
        explicitSpecs.cor = cor;
        normalizedName = `Cabo de Cobre Flexível ${secao} 750V ${cor}`;
        if (secao === '2.5mm²') {
          if (cor === 'Azul') suggestedSku = 'CAB-FLEX-2.5-AZ';
          else if (cor === 'Preto') suggestedSku = 'CAB-FLEX-2.5-PR';
          else if (cor === 'Verde') suggestedSku = 'CAB-FLEX-2.5-VD';
        } else if (secao === '4.0mm²' && cor === 'Preto') {
          suggestedSku = 'CAB-FLEX-4.0-PR';
        } else if (secao === '6.0mm²' && cor === 'Preto') {
          suggestedSku = 'CAB-FLEX-6.0-PR';
        }
        confidenceScore = 0.95;
      } else {
        // Ambiguidade clássica: falta a cor do cabo
        normalizedName = `Cabo de Cobre Flexível ${secao} 750V (Cor a definir)`;
        missingSpecs.push('cor_condutor');
        ambiguities.push(`Condutor ${secao} informado sem cor da isolação (ex.: Azul neutro, Preto/Vermelho fase, Verde terra).`);
        needsReview = true;
        reviewReason = `Ambiguidade: cor da isolação não informada no pedido original para o cabo ${secao}.`;
        suggestedSku = secao === '2.5mm²' ? 'CAB-FLEX-2.5-AZ' : null;
        confidenceScore = 0.80;
      }

      if (unit === 'PC') {
        unit = 'ROLO_100M'; // Prática comum de balcão quando não especificado
        inferredSpecs.unidade_padrao = 'Rolo 100m inferido por padrão comercial';
      }
    }
  }

  // B. DISJUNTORES (ex.: "disjuntor de 20", "disjuntor bifasico de 32")
  else if (/disjuntor/i.test(remainingText)) {
    let corrente = null;
    let polos = 1;
    let tipoPolo = 'Monopolar';

    const ampMatch = remainingText.match(/(\d+)\s*(?:a|amp|amperes)?/i);
    if (ampMatch) {
      corrente = `${ampMatch[1]}A`;
      explicitSpecs.corrente = corrente;
    }

    if (/bifasico|bipolar|duplo|2p/i.test(remainingText)) {
      polos = 2;
      tipoPolo = 'Bipolar';
    } else if (/trifasico|tripolar|triplo|3p/i.test(remainingText)) {
      polos = 3;
      tipoPolo = 'Tripolar';
    }

    explicitSpecs.polos = polos;
    inferredSpecs.curva = 'C';
    inferredSpecs.padrao = 'DIN';

    if (corrente) {
      normalizedName = `Disjuntor Termomagnético DIN ${tipoPolo} ${corrente} Curva C`;
      if (polos === 1 && corrente === '20A') {
        suggestedSku = 'DISJ-DIN-1P-20A';
        confidenceScore = 0.96;
      } else if (polos === 2 && corrente === '32A') {
        suggestedSku = 'DISJ-DIN-2P-32A';
        confidenceScore = 0.96;
      } else {
        confidenceScore = 0.88;
      }
    } else {
      normalizedName = `Disjuntor Termomagnético DIN ${tipoPolo} (Amperagem a definir)`;
      missingSpecs.push('amperagem');
      ambiguities.push('Amperagem nominal do disjuntor não foi informada.');
      needsReview = true;
      reviewReason = 'Ambiguidade: corrente nominal do disjuntor não informada.';
      confidenceScore = 0.65;
    }
  }

  // C. ELETRODUTOS / CONDUÍTES (ex.: "conduite amarelo de 3/4", "mangueira amarela")
  else if (/conduite|eletroduto|mangueira/i.test(remainingText)) {
    let bitola = '3/4" (25mm)';
    if (/1 polegada|\b1\b|32mm/i.test(remainingText)) bitola = '1" (32mm)';
    else if (/1\/2|20mm/i.test(remainingText)) bitola = '1/2" (20mm)';

    explicitSpecs.bitola = bitola;
    explicitSpecs.cor = /amarel/i.test(remainingText) ? 'Amarelo' : 'Laranja/Preto';
    inferredSpecs.material = 'PVC Corrugado Flexível';

    normalizedName = `Eletroduto Corrugado Flexível PVC Amarelo ${bitola} Rolo 50m`;
    unit = 'ROLO_50M';
    suggestedSku = bitola === '3/4" (25mm)' ? 'ELET-CORR-34-50M' : null;
    confidenceScore = 0.95;
  }

  // D. CAIXAS DE PASSAGEM / DERIVAÇÃO (ex.: "caixinha 4x2", "caixa 4x4")
  else if (/caix(a|inha)/i.test(remainingText)) {
    let dim = '4x2';
    if (/4x4/i.test(remainingText)) dim = '4x4';

    explicitSpecs.dimensao = dim;
    inferredSpecs.tipo = 'Embutir alvenaria PVC Amarela';

    normalizedName = `Caixa de Embutir ${dim} PVC Amarela para Alvenaria`;
    suggestedSku = dim === '4x2' ? 'CX-EMB-4X2-AM' : null;
    confidenceScore = 0.98;
  }

  // E. FITA ISOLANTE (ex.: "fita isolante 3m", "fita preta")
  else if (/fita(\s+isolante)?/i.test(remainingText)) {
    const is3m = /3m|imperial/i.test(remainingText);
    explicitSpecs.marca = is3m ? '3M' : 'Genérica';
    inferredSpecs.largura = '19mm';
    inferredSpecs.comprimento = '20m';
    inferredSpecs.isolacao = '750V Antichama';

    normalizedName = 'Fita Isolante Imperial 3M 19mm x 20m Antichama';
    suggestedSku = 'FITA-ISOL-3M-20M';
    unit = 'ROLO';
    confidenceScore = 0.97;
  }

  // G. RABICHO (ex.: "rabicho", "chicote com plugue")
  else if (/rabicho|chicote/i.test(remainingText)) {
    explicitSpecs.tipo = 'Chicote de Ligação com Plugue Injetado 1,5m';
    inferredSpecs.corrente = '10A';
    inferredSpecs.pinos = '2P';

    normalizedName = 'Rabicho / Chicote de Ligação Bipolar 2P 10A com Plugue Injetado 1,5m';
    suggestedSku = 'RABICHO-PLUG-10A';
    confidenceScore = 0.92;
  }

  // H. TOMADAS (ex.: "tomada 10a", "tomada de 20")
  else if (/tomada/i.test(remainingText)) {
    const is20a = /20\s*a|20\s*amperes|grossa/i.test(remainingText);
    const amp = is20a ? '20A' : '10A';
    explicitSpecs.corrente = amp;
    inferredSpecs.tensao = '250V';
    inferredSpecs.padrao = 'NBR 14136 2P+T';

    normalizedName = `Módulo de Tomada 2P+T ${amp} 250V Branco`;
    suggestedSku = is20a ? 'MOD-TOM-2PT-20A' : 'MOD-TOM-2PT-10A';
    confidenceScore = 0.95;
  }

  return {
    original_text: line,
    normalized_name: normalizedName,
    quantity,
    unit,
    explicit_specs: explicitSpecs,
    inferred_specs: inferredSpecs,
    missing_specs: missingSpecs,
    ambiguities,
    suggested_sku: suggestedSku,
    confidence_score: Math.round(confidenceScore * 100) / 100,
    needs_review: needsReview,
    review_reason: reviewReason
  };
}

/**
 * Processa texto completo contendo um ou múltiplos itens.
 */
function parseElectricalOrderText(rawText) {
  if (!rawText || typeof rawText !== 'string') return [];

  // Quebra por linhas, marcadores de lista, pontos e vírgulas quando aplicável
  // Quebra por linhas, marcadores de lista, pontos e vírgulas, e conjunções conectando múltiplos itens
  const lines = rawText.split(/\r?\n|;|\s+e\s+(?=(?:\d+|um|uma|dois|duas|tres|três|quatro|cinco|seis|sete|oito|nove|dez|quinze|vinte)\b)/i);
  const items = [];

  for (const rawLine of lines) {
    // Remove apenas marcadores de lista (como -, *, •, 1., 2)) SEM remover a quantidade
    let cleaned = rawLine.replace(/^[•\-\*]\s*|^\d+[\.\)]\s*/, '').trim();
    if (cleaned.length < 3) continue;

    // Remove preâmbulos conversacionais comuns de WhatsApp / balcão no início da frase
    cleaned = cleaned.replace(/^(?:fala|carlos|opa|ola|olá|bom dia|boa tarde|boa noite|amigo|parceiro|manda|separa|pra|mim|aí|preciso|de|segue|pedido|[,\s:])+/i, '').trim();

    if (cleaned.length < 3) continue;

    const item = analyzeElectricalItem(cleaned);
    if (item) {
      items.push(item);
    }
  }

  return items;
}

module.exports = {
  analyzeElectricalItem,
  parseElectricalOrderText
};
