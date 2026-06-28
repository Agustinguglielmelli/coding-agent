import fs from "fs";
import path from "path";

const DEFAULT_RAG_CONFIG = {
  sources_dir: "rag/sources",
  vector_store: "rag/vector-store.json",
  chunk_size: 900,
  chunk_overlap: 150,
  embedding_dimensions: 128,
  top_k: 4,
};

function getRagConfig(agentConfig = {}) {
  return {
    ...DEFAULT_RAG_CONFIG,
    ...(agentConfig.rag || {}),
  };
}

function normalizeText(text) {
  return String(text)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function tokenize(text) {
  return normalizeText(text).match(/[a-z0-9_.-]+/g) || [];
}

function hashToken(token) {
  let hash = 5381;
  for (let i = 0; i < token.length; i += 1) {
    hash = (hash * 33) ^ token.charCodeAt(i);
  }
  return Math.abs(hash);
}

export function embedText(text, dimensions = DEFAULT_RAG_CONFIG.embedding_dimensions) {
  const vector = Array.from({ length: dimensions }, () => 0);
  const tokens = tokenize(text);

  for (const token of tokens) {
    const index = hashToken(token) % dimensions;
    vector[index] += 1;
  }

  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (magnitude === 0) return vector;
  return vector.map((value) => value / magnitude);
}

function cosineSimilarity(left, right) {
  return left.reduce((sum, value, index) => sum + value * right[index], 0);
}

function listMarkdownSources(sourcesDir) {
  if (!fs.existsSync(sourcesDir)) return [];

  return fs
    .readdirSync(sourcesDir)
    .filter((file) => file.endsWith(".md"))
    .map((file) => path.join(sourcesDir, file));
}

function chunkDocument(content, chunkSize, chunkOverlap) {
  const normalized = content.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  const chunks = [];
  let start = 0;

  while (start < normalized.length) {
    let end = Math.min(start + chunkSize, normalized.length);
    const nextBreak = normalized.lastIndexOf("\n\n", end);

    if (nextBreak > start + chunkSize * 0.5) {
      end = nextBreak;
    }

    const text = normalized.slice(start, end).trim();
    if (text) chunks.push(text);

    if (end >= normalized.length) break;
    start = Math.max(end - chunkOverlap, start + 1);
  }

  return chunks;
}

function readSourceMetadata(content, filePath) {
  const titleMatch = content.match(/^#\s+(.+)$/m);
  const sourceMatch = content.match(/^Fuente:\s*(.+)$/m);
  const typeMatch = content.match(/^Tipo:\s*(.+)$/m);

  return {
    file: filePath,
    title: titleMatch ? titleMatch[1].trim() : path.basename(filePath),
    source: sourceMatch ? sourceMatch[1].trim() : "fuente local",
    type: typeMatch ? typeMatch[1].trim() : "documentacion",
  };
}

export function buildRagIndex(agentConfig = {}) {
  const ragConfig = getRagConfig(agentConfig);
  const sourceFiles = listMarkdownSources(ragConfig.sources_dir);
  const documents = [];

  for (const filePath of sourceFiles) {
    const content = fs.readFileSync(filePath, "utf-8");
    const metadata = readSourceMetadata(content, filePath);
    const chunks = chunkDocument(content, ragConfig.chunk_size, ragConfig.chunk_overlap);

    chunks.forEach((chunk, index) => {
      documents.push({
        id: `${path.basename(filePath)}#${index + 1}`,
        text: chunk,
        embedding: embedText(chunk, ragConfig.embedding_dimensions),
        metadata: {
          ...metadata,
          chunk: index + 1,
        },
      });
    });
  }

  const vectorStore = {
    schemaVersion: 1,
    embedding: {
      provider: "local-hashing",
      dimensions: ragConfig.embedding_dimensions,
      description:
        "Embedding local por hashing de tokens normalizados. No requiere dependencias externas.",
    },
    config: ragConfig,
    documents,
    builtAt: new Date().toISOString(),
  };

  fs.mkdirSync(path.dirname(ragConfig.vector_store), { recursive: true });
  fs.writeFileSync(ragConfig.vector_store, JSON.stringify(vectorStore, null, 2), "utf-8");

  return vectorStore;
}

export function loadOrBuildRagIndex(agentConfig = {}) {
  const ragConfig = getRagConfig(agentConfig);

  if (!fs.existsSync(ragConfig.vector_store)) {
    return buildRagIndex(agentConfig);
  }

  return JSON.parse(fs.readFileSync(ragConfig.vector_store, "utf-8"));
}

export function searchRag(query, agentConfig = {}, options = {}) {
  const ragConfig = getRagConfig(agentConfig);
  const vectorStore = loadOrBuildRagIndex(agentConfig);
  const topK = options.topK || ragConfig.top_k;
  const queryEmbedding = embedText(query, vectorStore.embedding.dimensions);

  return vectorStore.documents
    .map((document) => ({
      id: document.id,
      score: cosineSimilarity(queryEmbedding, document.embedding),
      text: document.text,
      metadata: document.metadata,
    }))
    .filter((result) => result.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, topK);
}
