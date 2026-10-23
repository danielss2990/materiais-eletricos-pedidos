// Prompt oficial do motor de Inteligência Artificial e Schema JSON estrito

const SYSTEM_PROMPT = `Você é um assistente especializado em materiais elétricos e interpretação de pedidos comerciais.

Receberá mensagens em português brasileiro, transcrições de áudios, fotografias, documentos e outros arquivos compatíveis.

Sua tarefa é identificar os materiais solicitados e estruturar as informações para que a equipe comercial prepare uma cotação.

Para cada material:
- Preserve o texto original que originou a identificação.
- Normalize o nome do produto.
- Extraia quantidade e unidade.
- Extraia as especificações explicitamente informadas.
- Diferencie informações observadas de inferências.
- Identifique características ausentes.
- Detecte ambiguidades.
- Sugira correspondências no catálogo quando houver evidência suficiente.
- Não invente SKU, preço, estoque, marca ou especificações.
- Não transforme semelhança textual em equivalência técnica.
- Não converta unidades incompatíveis sem uma regra validada.
- Não escolha automaticamente entre alternativas tecnicamente distintas.
- Identifique expressões regionais que exijam interpretação contextual.
- Solicite revisão humana quando a evidência for insuficiente.

Considere expressões como 'fio de duas e meia', 'passa-fio', 'sonda' e 'rabicho' como entradas que podem exigir contexto adicional.

Retorne somente os dados estruturados conforme o esquema definido pela aplicação.

Se não for possível determinar um item com segurança, registre a incerteza em vez de inventar uma resposta.`;

const JSON_SCHEMA_OUTPUT = {
  type: "object",
  required: [
    "order_id",
    "message_origin",
    "original_text",
    "received_at",
    "items",
    "processing_state",
    "processing_errors"
  ],
  properties: {
    order_id: { type: "string" },
    message_origin: {
      type: "string",
      enum: ["WHATSAPP_BUSINESS", "WHATSAPP_PERSONAL", "EMAIL", "MANUAL_ENTRY", "FILE_IMPORT"]
    },
    original_text: { type: "string" },
    received_at: { type: "string" },
    items: {
      type: "array",
      items: {
        type: "object",
        required: [
          "original_text",
          "normalized_name",
          "quantity",
          "unit",
          "explicit_specs",
          "inferred_specs",
          "missing_specs",
          "ambiguities",
          "suggested_sku",
          "confidence_score",
          "needs_review",
          "review_reason"
        ],
        properties: {
          original_text: { type: "string" },
          normalized_name: { type: "string" },
          quantity: { type: "number" },
          unit: { type: "string" },
          explicit_specs: { type: "object" },
          inferred_specs: { type: "object" },
          missing_specs: { type: "array", items: { type: "string" } },
          ambiguities: { type: "array", items: { type: "string" } },
          suggested_sku: { type: ["string", "null"] },
          confidence_score: { type: "number", minimum: 0, maximum: 1 },
          needs_review: { type: "boolean" },
          review_reason: { type: ["string", "null"] }
        }
      }
    },
    processing_state: {
      type: "string",
      enum: ["COMPLETED", "NEEDS_HUMAN_REVIEW", "FAILED"]
    },
    processing_errors: {
      type: "array",
      items: { type: "string" }
    }
  }
};

module.exports = {
  SYSTEM_PROMPT,
  JSON_SCHEMA_OUTPUT
};
