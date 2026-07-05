import { searchRag } from "../rag.js";
import { agentConfig } from "../config.js";

export function search_rag({ query, top_k }) {
  try {
    const results = searchRag(query, agentConfig, { topK: top_k });
    console.log(`✅ search_rag("${query}") — ${results.length} resultados`);

    if (results.length === 0) {
      return "RAG no encontro fragmentos relevantes. Usar web_search solo si falta evidencia.";
    }

    return results
      .map((result, index) => {
        const score = result.score.toFixed(3);
        return [
          `${index + 1}. ${result.metadata.title}`,
          `   score: ${score}`,
          `   fuente: ${result.metadata.source}`,
          `   archivo: ${result.metadata.file}`,
          `   chunk: ${result.metadata.chunk}`,
          `   contenido: ${result.text}`,
        ].join("\n");
      })
      .join("\n\n");
  } catch (err) {
    return `Error en search_rag: ${err.message}`;
  }
}
