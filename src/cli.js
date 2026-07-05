import { ask, closeIO } from "./io.js";
import { runAgentLoop } from "./agentLoop.js";
import { settings } from "./settings.js";
import { client, MODEL } from "./llmClient.js";
import { agentConfig, PROJECT_MEMORY_PATH } from "./config.js";
import { ensureProjectMemory } from "./memory.js";
import { tools, toolFunctions } from "./tools/index.js";
import { runTask } from "./orchestrator.js";

// ============================================================
// FLAGS — activar/desactivar acá
// ============================================================
let PLAN_MODE = true; // genera un plan antes de ejecutar cualquier tool
let MULTI_AGENT_MODE = false; // si está activo, cada input pasa por el orquestador (5 subagentes)

const PLAN_MODE_DISABLED_TOOLS = ["write_file"];

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
// LOOP DE CONVERSACIÓN — agente principal, un solo agente
// ============================================================

let messages = [
  {
    role: "system",
    content:
      "Sos un agente de código especializado en el proyecto configurado. Podés leer y escribir archivos, ejecutar comandos, listar directorios, consultar RAG, buscar en la web y usar memoria persistente del proyecto. Antes de trabajar sobre una tarea del proyecto, consultá read_project_memory. Para dudas tecnicas de NestJS, TypeScript o patrones del proyecto, consultá primero search_rag y mostra que fuentes usaste. Usá web_search solo como fallback cuando el RAG no tenga evidencia suficiente. Cuando detectes arquitectura, comandos útiles, decisiones, convenciones, bugs o un resumen importante de sesión, guardalo con update_project_memory indicando si la fuente fue repo, usuario, RAG, web, inferencia o agente.",
  },
];

export async function main() {
  ensureProjectMemory();
  console.log(`Coding Agent listo.`);
  console.log(`  Proyecto:     ${agentConfig.project?.name || "sin nombre"}`);
  console.log(`  Memoria:      ${PROJECT_MEMORY_PATH}`);
  console.log(`  Supervisión: ${settings.supervision ? "✅ activada" : "❌ desactivada"}`);
  console.log(`  Plan mode:   ${PLAN_MODE ? "✅ activado" : "❌ desactivado"}`);
  if (PLAN_MODE) {
    console.log(`  Tools off:    ${PLAN_MODE_DISABLED_TOOLS.join(", ")}`);
  }
  console.log(`  Multiagente: ${MULTI_AGENT_MODE ? "✅ activado (Explorer→Researcher→Implementer→Tester→Reviewer)" : "❌ desactivado (un solo agente)"}`);
  console.log(`\nComandos: 'supervision on/off' | 'plan on/off' | 'multiagente on/off' | 'exit'\n`);

  // Loop externo
  while (true) {
    const input = await ask("> ");

    // Comandos de control
    if (input.toLowerCase() === "exit") {
      console.log("Saliendo...");
      closeIO();
      break;
    }
    if (input.toLowerCase() === "supervision on") {
      settings.supervision = true;
      console.log("✅ Supervisión activada\n");
      continue;
    }
    if (input.toLowerCase() === "supervision off") {
      settings.supervision = false;
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
    if (input.toLowerCase() === "multiagente on") {
      MULTI_AGENT_MODE = true;
      console.log("✅ Modo multiagente activado — cada tarea corre Explorer→Researcher→Implementer→Tester→Reviewer\n");
      continue;
    }
    if (input.toLowerCase() === "multiagente off") {
      MULTI_AGENT_MODE = false;
      console.log("❌ Modo multiagente desactivado — volvés al agente único\n");
      continue;
    }

    // ── MODO MULTIAGENTE ─────────────────────────────────────
    // El orquestador maneja su propio taskState por tarea; no se mezcla
    // con el historial `messages` del agente único, y plan mode no aplica
    // acá (la supervisión de write_file/run_command sigue funcionando
    // igual dentro de cada subagente).
    if (MULTI_AGENT_MODE) {
      const { summary } = await runTask(input);
      console.log("\n" + summary + "\n");
      continue;
    }
    // ─────────────────────────────────────────────────────────

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

    // El historial ya trae el system message desde el arranque, así que
    // acá no hace falta pasar systemPrompt: runAgentLoop lo detecta y no
    // lo duplica.
    const { messages: updatedMessages, finalText } = await runAgentLoop({
      systemPrompt: null,
      tools: getToolsForCurrentMode(),
      toolFunctions,
      messages,
    });

    messages = updatedMessages;
    console.log("\n" + finalText + "\n");
  }
}
