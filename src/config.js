import fs from "fs";

export const CONFIG_PATH = "./agent.config.json";

export function loadAgentConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
  } catch (err) {
    console.log(`⚠️  No se pudo leer ${CONFIG_PATH}: ${err.message}`);
    return {
      project: { name: "Proyecto sin nombre", ecosystem: "No definido" },
      workspace: ".",
      memory: { project_file: "memory/projects/default.json" },
    };
  }
}

export const agentConfig = loadAgentConfig();

export const PROJECT_MEMORY_PATH =
  agentConfig.memory?.project_file || "memory/projects/default.json";
export const MAX_SESSION_SUMMARIES = agentConfig.memory?.max_session_summaries || 20;
export const MAX_ITEMS_PER_SECTION = agentConfig.memory?.max_items_per_section || 50;
