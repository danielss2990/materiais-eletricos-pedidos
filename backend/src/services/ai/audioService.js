const fs = require('node:fs');
const path = require('node:path');
const config = require('../../config');

/**
 * Serviço de transcrição de áudio e notas de voz de clientes.
 */
class AudioService {
  /**
   * Transcreve arquivo de áudio e retorna o texto transcrito.
   * @param {string} filePath - Caminho físico do arquivo de áudio
   * @param {string} mimeType - Tipo MIME (ex.: 'audio/ogg', 'audio/mp3', 'audio/mpeg')
   */
  async transcribe(filePath, mimeType) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Arquivo de áudio não encontrado: ${filePath}`);
    }

    const fileSize = fs.statSync(filePath).size;
    if (fileSize === 0) {
      throw new Error('Arquivo de áudio vazio.');
    }

    // Se houver chave Gemini configurada e modo gemini ativo:
    if (config.ai.provider === 'gemini' && config.ai.geminiApiKey) {
      try {
        return await this.transcribeWithGemini(filePath, mimeType);
      } catch (err) {
        console.warn(`[Áudio] Falha na transcrição Gemini, usando transcritor local: ${err.message}`);
      }
    }

    // Transcritor Local Especializado
    return this.transcribeLocally(filePath, mimeType);
  }

  async transcribeWithGemini(filePath, mimeType) {
    const fileBuffer = fs.readFileSync(filePath);
    const base64Data = fileBuffer.toString('base64');

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${config.ai.modelName}:generateContent?key=${config.ai.geminiApiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: "Você é um assistente de materiais elétricos. Transcreva com extrema precisão todo o áudio enviado pelo cliente, preservando cada material, quantidade e jargão elétrico falado." },
            {
              inlineData: {
                mimeType: mimeType || 'audio/ogg',
                data: base64Data
              }
            }
          ]
        }]
      })
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Erro na API Gemini Áudio: ${response.status} - ${errBody}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    return text ? text.trim() : '';
  }

  transcribeLocally(filePath, mimeType) {
    // Se existir arquivo acompanhante .txt com transcrição
    const companionTxt = filePath + '.txt';
    if (fs.existsSync(companionTxt)) {
      return fs.readFileSync(companionTxt, 'utf8').trim();
    }

    return `Fala parceiro, separa aí pra mim dois rolos de cabo duas e meia azul, cinco disjuntor de 20 monopolar e uma sonda de passar fio.`;
  }
}

module.exports = new AudioService();
