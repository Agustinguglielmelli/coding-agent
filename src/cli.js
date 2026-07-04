import readline from "readline";
import { client, MODEL } from "./llmClient.js";
import { agentConfig, PROJECT_MEMORY_PATH } from "./config.js";
import { validateToolCall, commandRequiresApproval } from "./policies.js";
import { ensureProjectMemory } from "./memory.js";
import { tools, toolFunctions } from "./tools/index.js";

// ============================================================
// FLAGS — activar/desactivar acá
// ============================================================
let SUPERVISION = true; // pide confirmación antes de write_file y run_command
let PLAN_MODE = true; // genera un plan antes de ejecutar cualquier tool

const SUPERVISED_TOOLS = ["write_file", "run_command"];
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
      "Sos un agente de código especializado en el proyecto configurado. Podés leer y escribir archivos, ejecutar comandos, listar directorios, consultar RAG, buscar en la web y usar memoria persistente del proyecto. Antes de trabajar sobre una tarea del proyecto, consultá read_project_memory. Para dudas tecnicas de NestJS, TypeScript o patrones del proyecto, consultá primero search_rag y mostra que fuentes usaste. Usá web_search solo como fallback cuando el RAG no tenga evidencia suficiente. Cuando detectes arquitectura, comandos útiles, decisiones, convenciones, bugs o un resumen importante de sesión, guardalo con update_project_memory indicando si la fuente fue repo, usuario, RAG, web, inferencia o agente.",
  },
];

export async function main() {
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
