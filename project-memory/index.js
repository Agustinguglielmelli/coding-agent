import fs from "fs";
import { dirname } from "path";

export const MEMORY_SECTIONS = Object.freeze({
  ARCHITECTURE: "architecture",
  DEPENDENCY: "dependency",
  COMMAND: "command",
  CONVENTION: "convention",
  DECISION: "decision",
  BUG: "bug",
  SESSION_SUMMARY: "session_summary",
  USEFUL_FINDING: "useful_finding",
});

export function nowIso() {
  return new Date().toISOString();
}

function normalizeTags(tags) {
  if (!tags) return [];
  if (Array.isArray(tags)) return tags.map(String);
  return [String(tags)];
}

function trimMemoryList(items, maxItems) {
  return items.slice(Math.max(items.length - maxItems, 0));
}

function buildMemoryEntry({ title, content, source, tags, metadata }) {
  return {
    title: title || "Entrada sin titulo",
    content,
    source: source || "agent",
    tags: normalizeTags(tags),
    metadata: metadata || {},
    createdAt: nowIso(),
  };
}

function createDefaultProjectMemory(agentConfig) {
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

function createListSectionHandler({ section, memoryKey, maxItemsKey = "maxItemsPerSection" }) {
  return {
    section,
    matches: (candidate) => candidate === section,
    update({ memory, entry, limits }) {
      memory[memoryKey].push(entry);
      memory[memoryKey] = trimMemoryList(memory[memoryKey], limits[maxItemsKey]);
    },
  };
}

function createProjectMemoryHandlers() {
  return [
    {
      section: MEMORY_SECTIONS.ARCHITECTURE,
      matches: (candidate) => candidate === MEMORY_SECTIONS.ARCHITECTURE,
      update({ memory, content, metadata }) {
        memory.architecture.summary = content;
        memory.architecture.detectedAt = nowIso();
        if (metadata?.stack) memory.architecture.stack = metadata.stack;
        if (metadata?.importantFiles) memory.architecture.importantFiles = metadata.importantFiles;
        if (metadata?.modules) memory.architecture.modules = metadata.modules;
      },
    },
    createListSectionHandler({
      section: MEMORY_SECTIONS.DEPENDENCY,
      memoryKey: "dependencies",
    }),
    createListSectionHandler({
      section: MEMORY_SECTIONS.COMMAND,
      memoryKey: "commands",
    }),
    createListSectionHandler({
      section: MEMORY_SECTIONS.CONVENTION,
      memoryKey: "conventions",
    }),
    createListSectionHandler({
      section: MEMORY_SECTIONS.DECISION,
      memoryKey: "decisions",
    }),
    createListSectionHandler({
      section: MEMORY_SECTIONS.BUG,
      memoryKey: "bugs",
    }),
    createListSectionHandler({
      section: MEMORY_SECTIONS.SESSION_SUMMARY,
      memoryKey: "sessionSummaries",
      maxItemsKey: "maxSessionSummaries",
    }),
    createListSectionHandler({
      section: MEMORY_SECTIONS.USEFUL_FINDING,
      memoryKey: "usefulFindings",
    }),
  ];
}

export function createProjectMemoryStore(agentConfig) {
  const memoryPath = agentConfig.memory?.project_file || "memory/projects/default.json";
  const limits = {
    maxSessionSummaries: agentConfig.memory?.max_session_summaries || 20,
    maxItemsPerSection: agentConfig.memory?.max_items_per_section || 50,
  };
  const sectionHandlers = createProjectMemoryHandlers();

  function ensure() {
    try {
      if (!fs.existsSync(memoryPath)) {
        fs.mkdirSync(dirname(memoryPath), { recursive: true });
        fs.writeFileSync(
          memoryPath,
          JSON.stringify(createDefaultProjectMemory(agentConfig), null, 2),
          "utf-8"
        );
      }

      return JSON.parse(fs.readFileSync(memoryPath, "utf-8"));
    } catch (err) {
      return {
        ...createDefaultProjectMemory(agentConfig),
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

  function save(memory) {
    memory.updatedAt = nowIso();
    fs.mkdirSync(dirname(memoryPath), { recursive: true });
    fs.writeFileSync(memoryPath, JSON.stringify(memory, null, 2), "utf-8");
  }

  function read() {
    const memory = ensure();
    console.log(`✅ read_project_memory("${memoryPath}")`);
    return JSON.stringify(memory, null, 2);
  }

  function update(args) {
    const { section, title, content, source, tags, metadata } = args;
    const handler = sectionHandlers.find((candidate) => candidate.matches(section));
    if (!handler) return `Error: sección de memoria inválida: ${section}`;

    const memory = ensure();
    const entry = buildMemoryEntry({ title, content, source, tags, metadata });

    handler.update({
      memory,
      entry,
      content,
      metadata: metadata || {},
      limits,
    });

    save(memory);
    console.log(`✅ update_project_memory("${section}")`);
    return `Memoria actualizada en ${memoryPath}: ${section}`;
  }

  return {
    path: memoryPath,
    sectionHandlers,
    ensure,
    read,
    update,
  };
}
