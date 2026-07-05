import { runAgentLoop } from "../agentLoop.js";
import { tools, toolFunctions } from "../tools/index.js";

// ============================================================
// SUBAGENTE: TESTER
// ============================================================
// Responsabilidad única: validar el resultado del Implementer mediante
// checks concretos (tests, build, lint, logs). No escribe código: si algo
// falla, lo reporta para que el Implementer (u otro subagente) lo corrija.
//
// La detección de "mismo comando, mismo error, sin avanzar" vive en
// runAgentLoop (genérica, aplica a cualquier subagente), pero es acá donde
// más se espera que dispare: correr el mismo test que sigue fallando igual.
//
// Diseño "opción B": no conoce taskState.js. Recibe datos planos y devuelve
// `{ finalText, toolCalls, loopDetected }`. El orquestador decide, en base a
// `loopDetected` y al contenido de `finalText`, si marca el estado de la
// tarea como "blocked" y corta la cadena antes de llegar a Reviewer.

const ALLOWED_TOOLS = ["run_command", "read_file"];

const SYSTEM_PROMPT = `Sos el subagente Tester dentro de un sistema de coding agents.
Tu única responsabilidad es validar los cambios que hizo el Implementer, corriendo los checks
que correspondan: tests, build, lint, u otras verificaciones definidas para este proyecto.
No proponés ni escribís cambios de código: si algo falla, tu trabajo es reportarlo con claridad
(qué comando corriste, qué error salió, en qué archivo/línea si el output lo indica) para que
otro subagente lo corrija.
Reglas:
1. Corré el check más relevante para lo que se implementó, no toda la suite si no hace falta.
2. Si un comando falla, leé el output con cuidado antes de decidir si hace falta más información.
3. Si ya corriste el mismo comando y da el mismo error, no lo repitas esperando un resultado
   distinto: reportá el bloqueo con el detalle del error y qué información falta para resolverlo.
4. Sé explícito sobre el resultado final: si todo pasó, decilo claramente ("checks OK"); si algo
   falló, decilo igual de claro ("checks fallaron") y no lo suavices.
Terminá tu respuesta con un veredicto claro: OK o BLOQUEADO, y por qué.`;

function getAllowedTools() {
  return tools.filter((tool) => ALLOWED_TOOLS.includes(tool.function.name));
}

function getAllowedToolFunctions() {
  return Object.fromEntries(ALLOWED_TOOLS.map((name) => [name, toolFunctions[name]]));
}

// `task`: el pedido original del usuario.
// `context`: qué se implementó (resumen del Implementer), para saber qué
// checks tienen sentido correr.
export async function runTester({ task, context }) {
  const userMessage = context
    ? `Tarea del usuario: ${task}\n\nCambios implementados:\n${context}\n\nValidá que los cambios funcionen.`
    : `Tarea del usuario: ${task}\n\nNo hay detalle de qué se implementó. Corré los checks generales del proyecto y reportá el resultado.`;

  const { finalText, toolCalls, loopDetected } = await runAgentLoop({
    systemPrompt: SYSTEM_PROMPT,
    tools: getAllowedTools(),
    toolFunctions: getAllowedToolFunctions(),
    messages: [{ role: "user", content: userMessage }],
  });

  return { finalText, toolCalls, loopDetected };
}
