import fs from "fs";
import { dirname } from "path";
import {
  agentConfig,
  PROJECT_MEMORY_PATH,
  MAX_SESSION_SUMMARIES,
  MAX_ITEMS_PER_SECTION,
} from "./config.js";

// ============================================================
// MEMORIA PERSISTENTE POR PROYECTO
// ============================================================

export function nowIso() {
  return new Date().toISOString();
}

export function createDefaultProjectMemory() {
  return {
    schemaVersion: 1,
    project: agentConfig.project || {},
    workspace: agentConfig.workspace || ".",
    architecture: {
      summary: "",
      detectedAt: null,
      stack: [],
      importantFiles: [],
      modules: [],
    },
    dependencies: [],
    commands: [],
    conventions: [],
    decisions: [],
    bugs: [],
    sessionSummaries: [],
    usefulFindings: [],
    updatedAt: nowIso(),
  };
}

export function ensureProjectMemory() {
  try {
    if (!fs.existsSync(PROJECT_MEMORY_PATH)) {
      fs.mkdirSync(dirname(PROJECT_MEMORY_PATH), { recursive: true });
      fs.writeFileSync(
        PROJECT_MEMORY_PATH,
        JSON.stringify(createDefaultProjectMemory(), null, 2),
        "utf-8"
      );
    }

    return JSON.parse(fs.readFileSync(PROJECT_MEMORY_PATH, "utf-8"));
  } catch (err) {
    return {
      ...createDefaultProjectMemory(),
      usefulFindings: [
        {
          title: "Error leyendo memoria persistente",
          content: err.message,
          source: "agent",
          tags: ["memory-error"],
          createdAt: nowIso(),
        },
      ],
    };
  }
}

export function saveProjectMemory(memory) {
  memory.updatedAt = nowIso();
  fs.mkdirSync(dirname(PROJECT_MEMORY_PATH), { recursive: true });
  fs.writeFileSync(PROJECT_MEMORY_PATH, JSON.stringify(memory, null, 2), "utf-8");
}

export function normalizeTags(tags) {
  if (!tags) return [];
  if (Array.isArray(tags)) return tags.map(String);
  return [String(tags)];
}

export function trimMemoryList(items, maxItems = MAX_ITEMS_PER_SECTION) {
  return items.slice(Math.max(items.length - maxItems, 0));
}

export function buildMemoryEntry({ title, content, source, tags, metadata }) {
  return {
    title: title || "Entrada sin titulo",
    content,
    source: source || "agent",
    tags: normalizeTags(tags),
    metadata: metadata || {},
    createdAt: nowIso(),
  };
}

export function read_project_memory() {
  const memory = ensureProjectMemory();
  console.log(`✅ read_project_memory("${PROJECT_MEMORY_PATH}")`);
  return JSON.stringify(memory, null, 2);
}

export function update_project_memory(args) {
  const { section, title, content, source, tags, metadata } = args;
  const memory = ensureProjectMemory();
  const entry = buildMemoryEntry({ title, content, source, tags, metadata });

  switch (section) {
    case "architecture":
      memory.architecture.summary = content;
      memory.architecture.detectedAt = nowIso();
      if (metadata?.stack) memory.architecture.stack = metadata.stack;
      if (metadata?.importantFiles) memory.architecture.importantFiles = metadata.importantFiles;
      if (metadata?.modules) memory.architecture.modules = metadata.modules;
      break;
    case "dependency":
      memory.dependencies.push(entry);
      memory.dependencies = trimMemoryList(memory.dependencies);
      break;
    case "command":
      memory.commands.push(entry);
      memory.commands = trimMemoryList(memory.commands);
      break;
    case "convention":
      memory.conventions.push(entry);
      memory.conventions = trimMemoryList(memory.conventions);
      break;
    case "decision":
      memory.decisions.push(entry);
      memory.decisions = trimMemoryList(memory.decisions);
      break;
    case "bug":
      memory.bugs.push(entry);
      memory.bugs = trimMemoryList(memory.bugs);
      break;
    case "session_summary":
      memory.sessionSummaries.push(entry);
      memory.sessionSummaries = trimMemoryList(memory.sessionSummaries, MAX_SESSION_SUMMARIES);
      break;
    case "useful_finding":
      memory.usefulFindings.push(entry);
      memory.usefulFindings = trimMemoryList(memory.usefulFindings);
      break;
    default:
      return `Error: sección de memoria inválida: ${section}`;
  }

  saveProjectMemory(memory);
  console.log(`✅ update_project_memory("${section}")`);
  return `Memoria actualizada en ${PROJECT_MEMORY_PATH}: ${section}`;
}
