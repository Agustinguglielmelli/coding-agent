import OpenAI from "openai";
import dotenv from "dotenv";
import readline from "readline";
import fs from "fs";
import { searchRag } from "./src/rag.js";
import { createProjectMemoryStore, nowIso } from "./project-memory/index.js";
import {
  TOOL_ACCESS_GROUPS,
  createLocalToolDefinitions,
  toolSet,
} from "./tools/local-tools.js";
import {
  createToolRegistry,
  executeToolCall,
  validateToolRegistry,
} from "./tools/tool-interface.js";
import { normalizePathForPolicy } from "./tools/policies.js";

dotenv.config();

const client = new OpenAI({
  apiKey: process.env.GEMINI_API_KEY,
  baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
});

const MODEL = "models/gemini-2.5-flash";
const CONFIG_PATH = "./agent.config.json";
const MULTI_AGENT_MAX_TOOL_ROUNDS = 6;
const MULTI_AGENT_COMMANDS = ["/multiagent", "multiagent"];

let SUPERVISION = true;
let PLAN_MODE = true;

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
const projectMemory = createProjectMemoryStore(agentConfig);

const SUBAGENT_DEFINITIONS = [
  {
    id: "explorer",
    name: "Explorer",
    responsibility:
      "Entiende el repositorio: estructura, arquitectura, dependencias, convenciones y archivos relevantes.",
    allowedTools: toolSet(TOOL_ACCESS_GROUPS.memoryRead, TOOL_ACCESS_GROUPS.repoRead),
    guidance:
      "Debe dejar suficiente contexto en el estado compartido para que Implementer y Tester no necesiten leer memoria.",
  },
  {
    id: "researcher",
    name: "Researcher",
    responsibility:
      "Busca evidencia primero en RAG y memoria. Usa web_search solo si el RAG no alcanza.",
    allowedTools: toolSet(TOOL_ACCESS_GROUPS.memoryRead, TOOL_ACCESS_GROUPS.research),
    guidance: "Debe resumir fuentes y decisiones tecnicas para los agentes ejecutores.",
  },
  {
    id: "implementer",
    name: "Implementer",
    responsibility:
      "Propone o realiza cambios concretos de codigo a partir de los hallazgos disponibles.",
    allowedTools: toolSet(TOOL_ACCESS_GROUPS.codeChange),
    guidance:
      "No lee memoria ni consulta RAG. Ejecuta con el contexto que dejaron Explorer y Researcher en el estado compartido.",
  },
  {
    id: "tester",
    name: "Tester",
    responsibility:
      "Valida el resultado con tests, build, lint, logs u otros checks definidos por el proyecto.",
    allowedTools: toolSet(TOOL_ACCESS_GROUPS.verification),
    guidance:
      "No lee memoria ni consulta RAG. Valida usando el pedido, el estado compartido y los cambios registrados.",
  },
  {
    id: "reviewer",
    name: "Reviewer",
    responsibility:
      "Revisa el diff o los cambios realizados y valida que respondan al pedido del usuario.",
    allowedTools: toolSet(TOOL_ACCESS_GROUPS.memoryRead, TOOL_ACCESS_GROUPS.review),
    guidance:
      "Puede consultar memoria o RAG solo para validar criterios que no esten claros en el estado compartido.",
  },
];

const toolRegistry = createToolRegistry(
  createLocalToolDefinitions({
    agentConfig,
    projectMemory,
    searchRag,
  })
);

validateToolRegistry({
  toolRegistry,
  subagentDefinitions: SUBAGENT_DEFINITIONS,
});

function preview(value, maxLength = 700) {
  const text = String(value || "");
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...`;
}

function createSharedTaskState(originalRequest) {
  return {
    id: `task-${Date.now()}`,
    originalRequest,
    status: "running",
    startedAt: nowIso(),
    completedAt: null,
    progress: [],
    subagents: {},
    sourcesConsulted: [],
    filesModified: [],
    observations: [],
    toolCalls: [],
    repeatedActions: [],
  };
}

function addProgress(state, actor, message) {
  state.progress.push({
    at: nowIso(),
    actor,
    message,
  });
}

function addObservation(state, actor, message, metadata = {}) {
  state.observations.push({
    at: nowIso(),
    actor,
    message,
    metadata,
  });
}

function addSource(state, source) {
  state.sourcesConsulted.push({
    at: nowIso(),
    ...source,
  });
}

function addModifiedFile(state, path, actor) {
  if (!state.filesModified.some((entry) => entry.path === path)) {
    state.filesModified.push({ path, firstModifiedBy: actor, at: nowIso() });
  }
}

function recordToolUse(state, actor, toolName, args, result) {
  const normalizedArgs = args || {};
  const resultPreview = preview(result, 900);

  state.toolCalls.push({
    at: nowIso(),
    actor,
    toolName,
    args: normalizedArgs,
    resultPreview,
  });

  const toolDefinition = toolRegistry.find(toolName);
  if (!toolDefinition?.audit) return;

  const audit = toolDefinition.audit({ args: normalizedArgs, resultPreview }) || {};
  for (const source of audit.sources || []) {
    addSource(state, { actor, ...source });
  }

  if (audit.modifiedFile) {
    addModifiedFile(state, audit.modifiedFile, actor);
  }
}

function buildStateForPrompt(state) {
  return {
    id: state.id,
    originalRequest: state.originalRequest,
    status: state.status,
    progress: state.progress.slice(-12),
    completedSubagents: Object.fromEntries(
      Object.entries(state.subagents).map(([name, value]) => [
        name,
        {
          status: value.status,
          summary: preview(value.summary, 1200),
        },
      ])
    ),
    sourcesConsulted: state.sourcesConsulted.slice(-12),
    filesModified: state.filesModified,
    observations: state.observations.slice(-12),
    repeatedActions: state.repeatedActions.slice(-8),
  };
}

function getMultiAgentTask(input) {
  const trimmed = input.trim();
  const command = MULTI_AGENT_COMMANDS.find(
    (item) => trimmed === item || trimmed.startsWith(`${item} `)
  );

  if (!command) return null;
  return trimmed.slice(command.length).trim();
}

function taskRequestsReadOnly(originalRequest) {
  const normalized = normalizePathForPolicy(originalRequest).toLowerCase();
  return [
    "solo lectura",
    "read-only",
    "read only",
    "no modifiques archivos",
    "no modificar archivos",
    "no cambies archivos",
    "no escribir archivos",
  ].some((phrase) => normalized.includes(phrase));
}

function ask(question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

async function executeToolForActor(toolName, args, actor, state = null) {
  return executeToolCall({
    toolRegistry,
    toolName,
    args,
    actor,
    supervision: SUPERVISION,
    ask,
    state,
    addObservation,
    recordToolUse,
  });
}

function buildSubagentSystemPrompt(definition) {
  return [
    `Sos ${definition.name}, un subagente especializado dentro de un coding agent multi-agente.`,
    `Responsabilidad: ${definition.responsibility}`,
    `Guia de handoff: ${definition.guidance}`,
    `Tools permitidas: ${definition.allowedTools.join(", ")}.`,
    "Trabajas sobre el estado compartido de la tarea. No inventes evidencia.",
    "Diferenciá repo, memoria, RAG, web e inferencias propias cuando informes hallazgos.",
    "Si repetis una accion sin avanzar, cambiá de estrategia o explica que falta evidencia.",
    "Respondé al final con un resumen breve en español: hallazgos, evidencia usada, riesgos y siguiente paso recomendado.",
  ].join("\n");
}

async function runSubagent(definition, state) {
  addProgress(state, definition.name, "Inicio de subagente.");
  console.log(`\n🤖 ${definition.name}: ${definition.responsibility}`);

  const allowedTools = toolRegistry.getOpenAiToolsByName(definition.allowedTools);
  const localMessages = [
    {
      role: "system",
      content: buildSubagentSystemPrompt(definition),
    },
    {
      role: "user",
      content: [
        `Pedido original: ${state.originalRequest}`,
        "Estado compartido actual:",
        JSON.stringify(buildStateForPrompt(state), null, 2),
        "Trabaja solo en tu responsabilidad. Usa tools si hace falta evidencia.",
      ].join("\n\n"),
    },
  ];
  const seenToolCalls = new Set();

  for (let round = 1; round <= MULTI_AGENT_MAX_TOOL_ROUNDS; round += 1) {
    const response = await client.chat.completions.create({
      model: MODEL,
      messages: localMessages,
      tools: allowedTools,
      tool_choice: "auto",
    });

    const message = response.choices[0].message;

    if (!message.tool_calls) {
      const summary = message.content || "(sin resumen)";
      state.subagents[definition.name] = {
        status: "completed",
        summary,
        completedAt: nowIso(),
      };
      addProgress(state, definition.name, "Finalizó con resumen.");
      console.log(`\n${summary}\n`);
      return summary;
    }

    localMessages.push(message);

    for (const toolCall of message.tool_calls) {
      const toolName = toolCall.function.name;
      const args = JSON.parse(toolCall.function.arguments || "{}");

      if (!definition.allowedTools.includes(toolName)) {
        const rejection = `${definition.name} no tiene permiso para usar ${toolName}.`;
        localMessages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: rejection,
        });
        addObservation(state, definition.name, rejection, { toolName, args });
        continue;
      }

      const callKey = `${toolName}:${JSON.stringify(args)}`;
      if (seenToolCalls.has(callKey)) {
        const loopMessage =
          `Accion repetida detectada en ${definition.name}: ${callKey}. ` +
          "Cambia de estrategia o explica que falta evidencia.";
        state.repeatedActions.push({
          at: nowIso(),
          actor: definition.name,
          toolName,
          args,
        });
        addObservation(state, definition.name, loopMessage, { toolName, args });
        localMessages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: loopMessage,
        });
        continue;
      }

      seenToolCalls.add(callKey);
      const result = await executeToolForActor(toolName, args, definition.name, state);
      localMessages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: result,
      });
    }
  }

  const summary =
    `${definition.name} alcanzo el limite de ${MULTI_AGENT_MAX_TOOL_ROUNDS} rondas ` +
    "sin cerrar una respuesta final.";
  state.subagents[definition.name] = {
    status: "stopped",
    summary,
    completedAt: nowIso(),
  };
  addObservation(state, definition.name, summary);
  console.log(`\n⚠️  ${summary}\n`);
  return summary;
}

function formatMultiAgentReport(state) {
  const lines = [
    "\n================ MULTI-AGENT TASK STATE ================",
    `ID: ${state.id}`,
    `Pedido: ${state.originalRequest}`,
    `Estado: ${state.status}`,
    "",
    "Subagentes:",
  ];

  for (const definition of SUBAGENT_DEFINITIONS) {
    const result = state.subagents[definition.name];
    lines.push(`- ${definition.name}: ${result?.status || "sin ejecutar"}`);
    if (result?.summary) lines.push(`  ${preview(result.summary, 350)}`);
  }

  lines.push("", "Fuentes consultadas:");
  const sources = state.sourcesConsulted.slice(-10);
  if (sources.length === 0) {
    lines.push("- Ninguna registrada.");
  } else {
    for (const source of sources) {
      const label = source.path || source.query || source.command || source.detail;
      lines.push(`- ${source.type} (${source.actor}): ${preview(label, 180)}`);
    }
  }

  lines.push("", "Archivos modificados:");
  if (state.filesModified.length === 0) {
    lines.push("- Ninguno.");
  } else {
    for (const file of state.filesModified) {
      lines.push(`- ${file.path} (${file.firstModifiedBy})`);
    }
  }

  if (state.repeatedActions.length > 0) {
    lines.push("", "Acciones repetidas detectadas:");
    for (const action of state.repeatedActions.slice(-5)) {
      lines.push(`- ${action.actor}: ${action.toolName} ${JSON.stringify(action.args)}`);
    }
  }

  lines.push("========================================================\n");
  return lines.join("\n");
}

async function runMultiAgentWorkflow(originalRequest) {
  const state = createSharedTaskState(originalRequest);
  addProgress(state, "MainAgent", "Tarea recibida y estado compartido creado.");
  console.log(`\n🧭 MainAgent: coordinando tarea multi-agente ${state.id}`);

  for (const definition of SUBAGENT_DEFINITIONS) {
    await runSubagent(definition, state);
  }

  state.status = "completed";
  state.completedAt = nowIso();
  addProgress(state, "MainAgent", "Todos los subagentes finalizaron.");

  const report = formatMultiAgentReport(state);

  if (taskRequestsReadOnly(originalRequest)) {
    console.log("ℹ️  Tarea en modo solo lectura: no se guarda resumen en memoria persistente.");
  } else {
    projectMemory.update({
      section: "session_summary",
      title: `Ejecucion multi-agente ${state.id}`,
      content: report,
      source: "agent",
      tags: ["phase-5", "multi-agent"],
      metadata: {
        taskId: state.id,
        filesModified: state.filesModified.map((file) => file.path),
        sources: state.sourcesConsulted.map((source) => source.type),
        subagents: Object.keys(state.subagents),
      },
    });
  }

  console.log(report);
  return state;
}

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

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const messages = [
  {
    role: "system",
    content:
      "Sos un agente de código especializado en el proyecto configurado. Podés leer y escribir archivos, ejecutar comandos, listar directorios, consultar RAG, buscar en la web y usar memoria persistente del proyecto. Antes de trabajar sobre una tarea del proyecto, consultá read_project_memory. Para dudas tecnicas de NestJS, TypeScript o patrones del proyecto, consultá primero search_rag y mostra que fuentes usaste. Usá web_search solo como fallback cuando el RAG no tenga evidencia suficiente. Cuando detectes arquitectura, comandos útiles, decisiones, convenciones, bugs o un resumen importante de sesión, guardalo con update_project_memory indicando si la fuente fue repo, usuario, RAG, web, inferencia o agente.",
  },
];

async function main() {
  projectMemory.ensure();
  console.log("Coding Agent listo.");
  console.log(`  Proyecto:     ${agentConfig.project?.name || "sin nombre"}`);
  console.log(`  Memoria:      ${projectMemory.path}`);
  console.log(`  Supervisión: ${SUPERVISION ? "✅ activada" : "❌ desactivada"}`);
  console.log(`  Plan mode:   ${PLAN_MODE ? "✅ activado" : "❌ desactivado"}`);
  if (PLAN_MODE) {
    console.log(`  Tools off:    ${toolRegistry.getPlanModeDisabledToolNames().join(", ")}`);
  }
  console.log(`\nComandos: 'supervision on/off' | 'plan on/off' | '/multiagent <tarea>' | 'exit'\n`);

  while (true) {
    const input = await ask("> ");

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
      console.log(
        `Tools deshabilitadas en plan mode: ${toolRegistry
          .getPlanModeDisabledToolNames()
          .join(", ")}\n`
      );
      continue;
    }
    if (input.toLowerCase() === "plan off") {
      PLAN_MODE = false;
      console.log("❌ Plan mode desactivado\n");
      continue;
    }

    const multiAgentTask = getMultiAgentTask(input);
    if (multiAgentTask !== null) {
      if (!multiAgentTask) {
        console.log("Uso: /multiagent <tarea a resolver>\n");
        continue;
      }

      await runMultiAgentWorkflow(multiAgentTask);
      continue;
    }

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
        messages.push({ role: "user", content: input });
      }
    } else {
      messages.push({ role: "user", content: input });
    }

    while (true) {
      const response = await client.chat.completions.create({
        model: MODEL,
        messages,
        tools: toolRegistry.getOpenAiToolsForMode({ planMode: PLAN_MODE }),
        tool_choice: "auto",
      });

      const message = response.choices[0].message;

      if (message.tool_calls) {
        messages.push(message);

        for (const toolCall of message.tool_calls) {
          const toolName = toolCall.function.name;
          const args = JSON.parse(toolCall.function.arguments);
          const result = await executeToolForActor(toolName, args, "MainAgent");

          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: String(result),
          });
        }
      } else {
        messages.push(message);
        console.log(`\n${message.content}\n`);
        break;
      }
    }
  }
}

main().catch(console.error);
