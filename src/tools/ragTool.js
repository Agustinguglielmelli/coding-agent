import { searchRag } from "../rag.js";
import { agentConfig } from "../config.js";
import { startObservation } from "@langfuse/tracing";

export function search_rag({ query, top_k }) {
  const observation = startObservation(
    "retriever:rag",
    {
      input: { query, top_k },
      metadata: {
        source: "RAG",
      },
    },
    { asType: "retriever" }
  );

  try {
    const results = searchRag(query, agentConfig, { topK: top_k });
    console.log(`✅ search_rag("${query}") — ${results.length} resultados`);

    if (results.length === 0) {
      observation
        .update({
          output: [],
          metadata: {
            source: "RAG",
            resultsCount: 0,
            topK: top_k,
          },
        })
        .end();
      return "RAG no encontro fragmentos relevantes. Usar web_search solo si falta evidencia.";
    }

    const formattedResults = results
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

    observation
      .update({
        output: results.map((result) => ({
          id: result.id,
          title: result.metadata.title,
          score: Number(result.score.toFixed(3)),
          source: result.metadata.source,
          file: result.metadata.file,
          chunk: result.metadata.chunk,
        })),
        metadata: {
          source: "RAG",
          resultsCount: results.length,
          topK: top_k,
        },
      })
      .end();

    return formattedResults;
  } catch (err) {
    observation
      .update({
        level: "ERROR",
        statusMessage: err.message,
        output: { error: err.message },
        metadata: {
          source: "RAG",
        },
      })
      .end();
    return `Error en search_rag: ${err.message}`;
  }
}
