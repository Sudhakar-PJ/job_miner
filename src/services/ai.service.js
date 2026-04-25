const { GoogleGenAI } = require("@google/genai");
require("dotenv").config();
const { logger } = require("../config/logger");

class AIService {
  constructor() {
    this.client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }

  async generateEmbedding(text) {
    if (!text) return null;

    try {
      const result = await this.client.models.embedContent({
        model: "gemini-embedding-001",
        contents: [text],
        config: { outputDimensionality: 768 }
      });
      
      if (!result.embeddings || result.embeddings.length === 0) {
        throw new Error("No embeddings returned from Gemini");
      }

      return result.embeddings[0].values;
    } catch (error) {
      logger.error("Gemini Embedding Failed, using fallback", { 
        message: error.message,
      });
      return this.generateFallbackEmbedding(text);
    }
  }

  generateFallbackEmbedding(text) {
    const dim = 768;
    const seed = this.hashCode(text);
    const values = new Array(dim);
    
    for (let i = 0; i < dim; i++) {
      const x = Math.sin(seed + i * 0.1) * 10000;
      values[i] = (x - Math.floor(x)) * 2 - 1;
    }
    
    const magnitude = Math.sqrt(values.reduce((sum, v) => sum + v * v, 0));
    return values.map(v => v / magnitude);
  }

  hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }
}

module.exports = new AIService();
