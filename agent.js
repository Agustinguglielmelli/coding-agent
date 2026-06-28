import OpenAI from "openai";
import dotenv from "dotenv";
import readline from "readline";
import fs from "fs";
import { execSync } from "child_process";
import { basename, dirname } from "path";
dotenv.config();

const client = new OpenAI({
  apiKey: process.env.GEMINI_API_KEY,
  baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
});

const MODEL = "models/gemini-2.5-flash";
const CONFIG_PATH = "./agent.config.json";

function loadAgentConfig() {
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

const agentConfig = loadAgentConfig();
const PROJECT_MEMORY_PATH =
  agentConfig.memory?.project_file || "memory/projects/default.json";
const MAX_SESSION_SUMMARIES = agentConfig.memory?.max_session_summaries || 20;
const MAX_ITEMS_PER_SECTION = agentConfig.memory?.max_items_per_section || 50;

// ============================================================
// FLAGS — activar/desactivar acá
// ============================================================
let SUPERVISION = true;  // pide confirmación antes de write_file y run_command
let PLAN_MODE = true;    // genera un plan antes de ejecutar cualquier tool

const SUPERVISED_TOOLS = ["write_file", "run_command"];
const PLAN_MODE_DISABLED_TOOLS = ["write_file"];

// ============================================================
// POLITICAS DESDE agent.config.json
// ============================================================

function normalizePathForPolicy(path) {
  return String(path).replaceAll("\\", "/").replace(/^\.\//, "");
}

function globToRegExp(pattern) {
  const normalizedPattern = normalizePathForPolicy(pattern);
  let regex = "";

  for (let i = 0; i < normalizedPattern.length; i += 1) {
    const char = normalizedPattern[i];
    const nextChar = normalizedPattern[i + 1];

    if (char === "*" && nextChar === "*") {
      regex += ".*";
      i += 1;
      continue;
    }

    if (char === "*") {
      regex += "[^/]*";
      continue;
    }

    if ("\\^$+?.()|{}[]".includes(char)) {
      regex += `\\${char}`;
      continue;
    }

    regex += char;
  }

  return new RegExp(`^${regex}$`);
}

function matchesPolicyPattern(pattern, value) {
  const normalizedValue = normalizePathForPolicy(value);
  const normalizedPattern = normalizePathForPolicy(pattern);
  const regex = globToRegExp(normalizedPattern);

  if (regex.test(normalizedValue)) return true;
  if (!normalizedPattern.includes("/")) return regex.test(basename(normalizedValue));
  return false;
}

function isPathDenied(path, action) {
  const denyPatterns = agentConfig.permissions?.[action]?.deny || [];
  return denyPatterns.find((pattern) => matchesPolicyPattern(pattern, path));
}

function isCommandDenied(command) {
  const denyPatterns = agentConfig.permissions?.commands?.deny || [];
  return denyPatterns.find((pattern) => command.includes(pattern));
}

function commandRequiresApproval(command) {
  const approvalPatterns = agentConfig.permissions?.commands?.require_approval || [];
  return approvalPatterns.find((pattern) => command.includes(pattern));
}

function validateToolCall(toolName, args) {
  if (toolName === "read_file") {
    const deniedBy = isPathDenied(args.path, "read");
    if (deniedBy) {
      return {
        allowed: false,
        reason: `Politica de lectura bloqueo "${args.path}" por patron "${deniedBy}".`,
      };
    }
  }

  if (toolName === "list_files") {
    const deniedBy = isPathDenied(args.directory, "read");
    if (deniedBy) {
      return {
        allowed: false,
        reason: `Politica de lectura bloqueo "${args.directory}" por patron "${deniedBy}".`,
      };
    }
  }

  if (toolName === "write_file") {
    const deniedBy = isPathDenied(args.path, "write");
    if (deniedBy) {
      return {
        allowed: false,
        reason: `Politica de escritura bloqueo "${args.path}" por patron "${deniedBy}".`,
      };
    }
  }

  if (toolName === "run_command") {
    const deniedBy = isCommandDenied(args.command);
    if (deniedBy) {
      return {
        allowed: false,
        reason: `Politica de comandos bloqueo "${args.command}" por patron "${deniedBy}".`,
      };
    }
  }

  return { allowed: true };
}

// ============================================================
// MEMORIA PERSISTENTE POR PROYECTO
// ============================================================

function nowIso() {
  return new Date().toISOString();
}

function createDefaultProjectMemory() {
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

function ensureProjectMemory() {
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

function saveProjectMemory(memory) {
  memory.updatedAt = nowIso();
  fs.mkdirSync(dirname(PROJECT_MEMORY_PATH), { recursive: true });
  fs.writeFileSync(PROJECT_MEMORY_PATH, JSON.stringify(memory, null, 2), "utf-8");
}

function normalizeTags(tags) {
  if (!tags) return [];
  if (Array.isArray(tags)) return tags.map(String);
  return [String(tags)];
}

function trimMemoryList(items, maxItems = MAX_ITEMS_PER_SECTION) {
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

function read_project_memory() {
  const memory = ensureProjectMemory();
  console.log(`✅ read_project_memory("${PROJECT_MEMORY_PATH}")`);
  return JSON.stringify(memory, null, 2);
}

function update_project_memory(args) {
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

// ============================================================
// TOOLS — implementación
// ============================================================

function read_file(path) {
  try {
    const content = fs.readFileSync(path, "utf-8");
    console.log(`✅ read_file("${path}")`);
    return content;
  } catch (err) {
    if (err.code === "ENOENT") return `Error: File not found at ${path}`;
    return `Error reading file ${path}: ${err.message}`;
  }
}

function write_file({ path, content }) {
  try {
    fs.mkdirSync(dirname(path), { recursive: true });
    fs.writeFileSync(path, content, "utf-8");
    console.log(`✅ write_file("${path}")`);
    return `Archivo escrito exitosamente: ${path}`;
  } catch (err) {
    console.log(`❌ write_file error: ${err.message}`);
    return `Error writing file ${path}: ${err.message}`;
  }
}

function run_command({ command }) {
  try {
    console.log(`✅ run_command("${command}")`);
    const stdout = execSync(command, { encoding: "utf-8", timeout: 10000 });
    return stdout || "(sin output)";
  } catch (err) {
    const output = (err.stdout || "") + (err.stderr || "");
    console.log(`⚠️  run_command salió con error`);
    return output || err.message;
  }
}

function list_files({ directory }) {
  try {
    const items = fs.readdirSync(directory, { withFileTypes: true });
    const result = items.map((item) =>
      item.isDirectory() ? `📁 ${item.name}/` : `📄 ${item.name}`
    );
    console.log(`✅ list_files("${directory}") — ${result.length} items`);
    return result.join("\n");
  } catch (err) {
    console.log(`❌ list_files error: ${err.message}`);
    return `Error listing directory ${directory}: ${err.message}`;
  }
}

async function web_search({ query }) {
  try {
    console.log(`✅ web_search("${query}")`);
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: process.env.TAVILY_API_KEY,
        query,
        max_results: 3,
      }),
    });
    const data = await res.json();
    if (!data.results) {
      return `Error: Tavily no devolvió resultados. Detalle: ${JSON.stringify(data)}`;
    }
    const results = data.results
      .map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.content}`)
      .join("\n\n");
    return results || "Sin resultados";
  } catch (err) {
    return `Error en web_search: ${err.message}`;
  }
}

// ============================================================
// SCHEMAS
// ============================================================

const tools = [
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Lee el contenido de un archivo dado su path.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Path del archivo a leer." },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Escribe contenido en un archivo, reemplazando su contenido actual.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Path del archivo a escribir." },
          content: { type: "string", description: "Contenido a escribir en el archivo." },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_command",
      description: "Ejecuta un comando de terminal y devuelve el output (stdout y stderr).",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "Comando a ejecutar." },
        },
        required: ["command"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_files",
      description: "Lista los archivos y carpetas en un directorio.",
      parameters: {
        type: "object",
        properties: {
          directory: { type: "string", description: "Path del directorio a listar." },
        },
        required: ["directory"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "web_search",
      description: "Busca información en la web. Usá esta tool cuando necesites información externa o documentación.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Consulta de búsqueda." },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_project_memory",
      description:
        "Lee la memoria persistente del proyecto actual: arquitectura, decisiones, bugs, comandos, convenciones y resúmenes previos.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_project_memory",
      description:
        "Guarda una observación persistente del proyecto para futuras sesiones del agente.",
      parameters: {
        type: "object",
        properties: {
          section: {
            type: "string",
            enum: [
              "architecture",
              "dependency",
              "command",
              "convention",
              "decision",
              "bug",
              "session_summary",
              "useful_finding",
            ],
            description: "Sección de memoria donde guardar la información.",
          },
          title: { type: "string", description: "Título breve de la entrada." },
          content: {
            type: "string",
            description: "Contenido concreto que debe persistir.",
          },
          source: {
            type: "string",
            description:
              "Origen de la información: repo, usuario, RAG, web, inferencia o agente.",
          },
          tags: {
            type: "array",
            items: { type: "string" },
            description: "Etiquetas para recuperar esta entrada luego.",
          },
          metadata: {
            type: "object",
            description:
              "Datos estructurados opcionales. Para architecture puede incluir stack, importantFiles y modules.",
          },
        },
        required: ["section", "content"],
      },
    },
  },
];

const toolFunctions = {
  read_file: (args) => read_file(args.path),
  write_file,
  run_command,
  list_files,
  web_search,
  read_project_memory,
  update_project_memory,
};

function getToolsForCurrentMode() {
  if (!PLAN_MODE) return tools;

  return tools.filter(
    (tool) => !PLAN_MODE_DISABLED_TOOLS.includes(tool.function.name)
  );
}

// ============================================================
// PLAN MODE — pedir plan al LLM antes de ejecutar
// ============================================================

async function getPlan(userMessage) {
  const response = await client.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: "system",
        content:
          "Sos un agente de código. Cuando recibas una tarea, describí el plan de pasos que seguirías para completarla. Listá los pasos numerados, sin ejecutar nada todavía. Sé concreto: mencioná qué tools usarías en cada paso.",
      },
      {
        role: "user",
        content: userMessage,
      },
    ],
  });
  return response.choices[0].message.content;
}

// ============================================================
// LOOP DE CONVERSACIÓN
// ============================================================

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

const messages = [
  {
    role: "system",
    content:
      "Sos un agente de código especializado en el proyecto configurado. Podés leer y escribir archivos, ejecutar comandos, listar directorios, buscar en la web y usar memoria persistente del proyecto. Antes de trabajar sobre una tarea del proyecto, consultá read_project_memory. Cuando detectes arquitectura, comandos útiles, decisiones, convenciones, bugs o un resumen importante de sesión, guardalo con update_project_memory indicando si la fuente fue repo, usuario, RAG, web, inferencia o agente.",
  },
];

async function main() {
  ensureProjectMemory();
  console.log(`Coding Agent listo.`);
  console.log(`  Proyecto:     ${agentConfig.project?.name || "sin nombre"}`);
  console.log(`  Memoria:      ${PROJECT_MEMORY_PATH}`);
  console.log(`  Supervisión: ${SUPERVISION ? "✅ activada" : "❌ desactivada"}`);
  console.log(`  Plan mode:   ${PLAN_MODE ? "✅ activado" : "❌ desactivado"}`);
  if (PLAN_MODE) {
    console.log(`  Tools off:    ${PLAN_MODE_DISABLED_TOOLS.join(", ")}`);
  }
  console.log(`\nComandos: 'supervision on/off' | 'plan on/off' | 'exit'\n`);

  // Loop externo
  while (true) {
    const input = await ask("> ");

    // Comandos de control
    if (input.toLowerCase() === "exit") {
      console.log("Saliendo...");
      rl.close();
      break;
    }
    if (input.toLowerCase() === "supervision on") {
      SUPERVISION = true;
      console.log("✅ Supervisión activada\n");
      continue;
    }
    if (input.toLowerCase() === "supervision off") {
      SUPERVISION = false;
      console.log("❌ Supervisión desactivada\n");
      continue;
    }
    if (input.toLowerCase() === "plan on") {
      PLAN_MODE = true;
      console.log("✅ Plan mode activado\n");
      console.log(`Tools deshabilitadas en plan mode: ${PLAN_MODE_DISABLED_TOOLS.join(", ")}\n`);
      continue;
    }
    if (input.toLowerCase() === "plan off") {
      PLAN_MODE = false;
      console.log("❌ Plan mode desactivado\n");
      continue;
    }

    // ── PLAN MODE ────────────────────────────────────────────
    if (PLAN_MODE) {
      console.log("\n📋 Generando plan...\n");
      const plan = await getPlan(input);
      console.log(plan);

      const answer = await ask("\n¿Aprobás el plan? (s = ejecutar / n = cancelar / m = modificar): ");

      if (answer.toLowerCase() === "n") {
        console.log("🚫 Tarea cancelada.\n");
        continue;
      }

      if (answer.toLowerCase() === "m") {
        const modification = await ask("Escribí tu modificación: ");
        messages.push({
          role: "user",
          content: `${input}\n\nPlan sugerido:\n${plan}\n\nModificación del usuario: ${modification}`,
        });
      } else {
        // aprobado — agregar mensaje original
        messages.push({ role: "user", content: input });
      }
    } else {
      messages.push({ role: "user", content: input });
    }
    // ─────────────────────────────────────────────────────────

    // Loop interno — ejecuta tools hasta que el LLM responde sin pedir ninguna
    while (true) {
      const response = await client.chat.completions.create({
        model: MODEL,
        messages,
        tools: getToolsForCurrentMode(),
        tool_choice: "auto",
      });

      const message = response.choices[0].message;

      if (message.tool_calls) {
        messages.push(message);

        for (const toolCall of message.tool_calls) {
          const toolName = toolCall.function.name;
          const args = JSON.parse(toolCall.function.arguments);

          console.log(`\n🔧 ${toolName}(${JSON.stringify(args)})`);

          const policyResult = validateToolCall(toolName, args);
          if (!policyResult.allowed) {
            console.log(`🚫 ${policyResult.reason}\n`);
            messages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content: policyResult.reason,
            });
            continue;
          }

          // ── SUPERVISIÓN ──────────────────────────────────────
          const approvalPattern =
            toolName === "run_command" ? commandRequiresApproval(args.command) : null;
          const needsSupervision = SUPERVISION && SUPERVISED_TOOLS.includes(toolName);
          const needsPolicyApproval = Boolean(approvalPattern);

          if (needsSupervision || needsPolicyApproval) {
            const reason = needsPolicyApproval
              ? `requiere aprobación por política "${approvalPattern}"`
              : "requiere aprobación por supervisión";
            const confirm = await ask(`⚠️  ¿Confirmás ejecutar ${toolName}? (${reason}) (s/n): `);
            if (confirm.toLowerCase() !== "s") {
              console.log("🚫 Acción rechazada por el usuario\n");
              messages.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: `El usuario rechazó ejecutar ${toolName}. No realices esta acción.`,
              });
              continue;
            }
          }
          // ─────────────────────────────────────────────────────

          const toolFn = toolFunctions[toolName];
          const result = toolFn
            ? await toolFn(args)
            : `Error: tool "${toolName}" no existe`;

          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: String(result),
          });
        }
      } else {
        messages.push(message);
        console.log("\n" + message.content + "\n");
        break;
      }
    }
  }
}

main().catch(console.error);
