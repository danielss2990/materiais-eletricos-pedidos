const db = require('../../database/connection');

/**
 * Busca no catálogo interno de produtos com base no texto, nome normalizado ou SKU.
 */
function matchProductInCatalog(item) {
  // 1. Busca direta por SKU sugerido se já fornecido
  if (item.suggested_sku) {
    const productBySku = db.get('SELECT * FROM products WHERE sku = ? AND active = 1', [item.suggested_sku]);
    if (productBySku) {
      return {
        matched_product: productBySku,
        confidence: 0.98,
        match_type: 'EXACT_SKU'
      };
    }
  }

  const allProducts = db.all('SELECT * FROM products WHERE active = 1');

  const normalizeForMatch = (str) => {
    return (str || '')
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/duas e meia|dois e meio|2 e meio/g, '2.5')
      .replace(/uma e meia|um e meio|1 e meio/g, '1.5')
      .replace(/\b(?:de|da|do|flexivel|flexiveis)\b/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  };

  const searchText = normalizeForMatch((item.normalized_name || '') + ' ' + (item.original_text || ''));

  let bestMatch = null;
  let highestScore = 0;
  let matchType = 'NONE';

  for (const prod of allProducts) {
    let synonyms = [];
    try {
      synonyms = JSON.parse(prod.synonyms_array || '[]');
    } catch {
      synonyms = [];
    }

    // Match exato ou normalizado com algum sinônimo
    for (const syn of synonyms) {
      const synClean = normalizeForMatch(syn);
      if (searchText.includes(synClean) || synClean.includes(searchText)) {
        const score = 0.90 + (synClean.length / 100);
        if (score > highestScore) {
          highestScore = score;
          bestMatch = prod;
          matchType = 'SYNONYM_MATCH';
        }
      }
    }

    // Match com nome do produto
    const prodNameLower = prod.name.toLowerCase();
    if (searchText.includes(prodNameLower)) {
      if (0.95 > highestScore) {
        highestScore = 0.95;
        bestMatch = prod;
        matchType = 'NAME_MATCH';
      }
    }
  }

  if (bestMatch && highestScore >= 0.70) {
    return {
      matched_product: bestMatch,
      confidence: Math.min(Math.round(highestScore * 100) / 100, 1.0),
      match_type: matchType
    };
  }

  return {
    matched_product: null,
    confidence: 0.0,
    match_type: 'NOT_FOUND'
  };
}

module.exports = {
  matchProductInCatalog
};
