import { runAgentLoop } from "../agentLoop.js";
import { tools, toolFunctions } from "../tools/index.js";

// ============================================================
// SUBAGENTE: REVIEWER
// ============================================================
// Responsabilidad única: revisar el diff/los cambios realizados por el
// Implementer (ya validados por Tester) y confirmar que respondan al pedido
// original del usuario. No escribe código — si algo no cumple, lo reporta
// para que otro subagente lo corrija, no lo arregla él mismo.
//
// Sin `write_file` en sus tools: es un chequeo de solo lectura por diseño,
// para que no pueda "corregir" nada de paso y termine mezclando revisión
// con implementación.
//
// Diseño "opción B": no conoce taskState.js. Recibe datos planos y devuelve
// `{ finalText, toolCalls }`. El orquestador decide, en base al veredicto de
// `finalText`, si marca la tarea como "done" o "blocked".

const ALLOWED_TOOLS = ["read_file", "run_command"];

const SYSTEM_PROMPT = `Sos el subagente Reviewer dentro de un sistema de coding agents.
Tu única responsabilidad es revisar los cambios que ya hizo el Implementer (y que Tester ya
validó) y confirmar si responden al pedido original del usuario. No escribís ni corregís código:
si encontrás un problema, lo reportás con precisión para que otro subagente lo resuelva.
Reglas:
1. Usá run_command para ver el diff real (por ejemplo "git diff" o "git diff --stat"), no te
   bases solo en lo que dijeron los otros subagentes que hicieron.
2. Usá read_file si necesitás ver el contexto completo de un archivo modificado.
3. Comparás el diff contra el pedido original: ¿cubre el caso pedido? ¿rompe alguna convención
   detectada antes? ¿falta algo (por ejemplo, el caso 404, la validación, el test)?
4. Si el diff no está disponible o no alcanza para decidir con confianza, decilo en vez de
   aprobar a ciegas.
Terminá tu respuesta con un veredicto claro: APROBADO u OBSERVADO, y por qué.`;

function getAllowedTools() {
  return tools.filter((tool) => ALLOWED_TOOLS.includes(tool.function.name));
}

function getAllowedToolFunctions() {
  return Object.fromEntries(ALLOWED_TOOLS.map((name) => [name, toolFunctions[name]]));
}

// `task`: el pedido original del usuario.
// `context`: resumen de lo que hicieron Implementer y Tester, para saber
// qué se supone que hay que encontrar en el diff.
export async function runReviewer({ task, context }) {
  const userMessage = context
    ? `Tarea del usuario: ${task}\n\nResumen de Implementer/Tester:\n${context}\n\nRevisá el diff y validá que cumpla el pedido.`
    : `Tarea del usuario: ${task}\n\nNo hay resumen previo disponible. Revisá el estado actual del repo (por ejemplo con git diff) y evaluá qué encontrás.`;

  const { finalText, toolCalls } = await runAgentLoop({
    systemPrompt: SYSTEM_PROMPT,
    tools: getAllowedTools(),
    toolFunctions: getAllowedToolFunctions(),
    messages: [{ role: "user", content: userMessage }],
  });

  return { finalText, toolCalls };
}
