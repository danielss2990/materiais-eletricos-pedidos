const config = require('../../config');
const { SYSTEM_PROMPT } = require('./promptTemplates');
const { parseElectricalOrderText } = require('./electricalRules');
const { matchProductInCatalog } = require('../catalog/catalogMatcher');
const ocrService = require('./ocrService');
const audioService = require('./audioService');

/**
 * Motor Multimodal de Inteligência Artificial para Pedidos de Materiais Elétricos.
 */
class AiEngine {
  /**
   * Processa uma solicitação multimodal e retorna o contrato JSON estruturado.
   * @param {Object} params
   * @param {string} params.orderId - Código ou ID do pedido
   * @param {string} params.messageOrigin - 'WHATSAPP_BUSINESS', 'WHATSAPP_PERSONAL', 'EMAIL', 'MANUAL_ENTRY', 'FILE_IMPORT'
   * @param {string} [params.text] - Texto original da mensagem
   * @param {Array<Object>} [params.attachments] - Anexos recebidos ({ filePath, mimeType, filename })
   * @param {string} [params.receivedAt] - ISO timestamp
   */
  async processOrder({ orderId, messageOrigin, text = '', attachments = [], receivedAt = null }) {
    const errors = [];
    let combinedText = text ? text.trim() : '';

    // 1. Processamento de Anexos Multimodais
    for (const att of attachments) {
      try {
        const mime = (att.mimeType || '').toLowerCase();
        if (mime.startsWith('image/') || mime === 'application/pdf') {
          const extractedOcr = await ocrService.extractText(att.filePath, mime);
          if (extractedOcr) {
            combinedText = combinedText ? `${combinedText}\n[Texto extraído de ${att.filename || 'anexo'}]:\n${extractedOcr}` : extractedOcr;
          }
        } else if (mime.startsWith('audio/')) {
          const transcribed = await audioService.transcribe(att.filePath, mime);
          if (transcribed) {
            combinedText = combinedText ? `${combinedText}\n[Transcrição de áudio]:\n${transcribed}` : transcribed;
          }
        }
      } catch (err) {
        errors.push(`Falha no anexo ${att.filename || 'sem nome'}: ${err.message}`);
      }
    }

    if (!combinedText) {
      return {
        order_id: String(orderId),
        message_origin: messageOrigin,
        original_text: text || '',
        received_at: receivedAt || new Date().toISOString(),
        items: [],
        processing_state: "FAILED",
        processing_errors: errors.concat(["Nenhum texto identificável ou mídia legível encontrada na solicitação."])
      };
    }

    // 2. Extração Estruturada dos Itens
    let items = [];

    // Se estiver configurado com provedor externo (ex: Gemini ou OpenAI)
    if (config.ai.provider === 'gemini' && config.ai.geminiApiKey) {
      try {
        items = await this.callGeminiStructured(combinedText);
      } catch (err) {
        console.warn(`[AI Engine] Erro na API externa Gemini, acionando motor de regras elétricas interno: ${err.message}`);
        errors.push(`API Externa indisponível, utilizado motor de regras interno: ${err.message}`);
        items = parseElectricalOrderText(combinedText);
      }
    } else {
      // Motor de Regras Elétricas Brasileiro (determinístico e autônomo)
      items = parseElectricalOrderText(combinedText);
    }

    // 3. Associação e Validação com o Catálogo Interno
    let hasReviewPending = false;

    const validatedItems = items.map(item => {
      // Cruza com o catálogo
      const catalogMatch = matchProductInCatalog(item);
      
      let matchedProdId = null;
      let sugSku = item.suggested_sku;

      if (catalogMatch.matched_product) {
        sugSku = catalogMatch.matched_product.sku;
        // Se a confiança for muito alta e não houver ambiguidades graves, sugere o match
        if (catalogMatch.confidence >= 0.90 && !item.needs_review) {
          matchedProdId = catalogMatch.matched_product.id;
        }
      }

      // Se houver necessidade de revisão declarada
      if (item.needs_review) {
        hasReviewPending = true;
      }

      return {
        original_text: item.original_text,
        normalized_name: item.normalized_name,
        quantity: typeof item.quantity === 'number' ? item.quantity : 1,
        unit: item.unit || 'PC',
        explicit_specs: item.explicit_specs || {},
        inferred_specs: item.inferred_specs || {},
        missing_specs: Array.isArray(item.missing_specs) ? item.missing_specs : [],
        ambiguities: Array.isArray(item.ambiguities) ? item.ambiguities : [],
        suggested_sku: sugSku || null,
        matched_product_id: matchedProdId,
        confidence_score: typeof item.confidence_score === 'number' ? item.confidence_score : 0.7,
        needs_review: Boolean(item.needs_review),
        review_reason: item.review_reason || null
      };
    });

    const processingState = errors.length > 0 && validatedItems.length === 0
      ? "FAILED"
      : (hasReviewPending ? "NEEDS_HUMAN_REVIEW" : "COMPLETED");

    return {
      order_id: String(orderId),
      message_origin: messageOrigin,
      original_text: combinedText,
      received_at: receivedAt || new Date().toISOString(),
      items: validatedItems,
      processing_state: processingState,
      processing_errors: errors
    };
  }

  async callGeminiStructured(text) {
    const prompt = `${SYSTEM_PROMPT}\n\nTexto recebido do cliente:\n"""\n${text}\n"""\n\nRetorne EXCLUSIVAMENTE um array JSON contendo os itens identificados, seguindo estritamente as regras de preservação do texto original, normalização, unidades, especificações e detecção de ambiguidades.`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${config.ai.modelName}:generateContent?key=${config.ai.geminiApiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: config.ai.temperature,
          responseMimeType: "application/json"
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Gemini HTTP ${response.status}: ${await response.text()}`);
    }

    const data = await response.json();
    const rawJson = data.candidates?.[0]?.content?.parts?.[0]?.text;
    const parsed = JSON.parse(rawJson);
    return Array.isArray(parsed) ? parsed : (parsed.items || []);
  }
}

module.exports = new AiEngine();
