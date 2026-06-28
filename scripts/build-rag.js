import fs from "fs";
import { buildRagIndex } from "../src/rag.js";

const CONFIG_PATH = "./agent.config.json";
const agentConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
const vectorStore = buildRagIndex(agentConfig);

console.log(`RAG index construido en ${agentConfig.rag.vector_store}`);
console.log(`Fuentes: ${new Set(vectorStore.documents.map((doc) => doc.metadata.file)).size}`);
console.log(`Chunks: ${vectorStore.documents.length}`);
