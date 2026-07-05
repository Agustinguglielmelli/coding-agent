import { runAgentLoop } from "../agentLoop.js";
import { tools, toolFunctions } from "../tools/index.js";

// ============================================================
// SUBAGENTE: EXPLORER
// ============================================================
// Responsabilidad única: entender el repositorio (estructura, arquitectura,
// dependencias, convenciones, archivos relevantes). No propone ni escribe
// cambios de código — eso es del Implementer.
//
// Diseño "opción B": este subagente no conoce taskState.js. Recibe datos
// planos (`task`, y opcionalmente contexto de otros subagentes) y devuelve
// datos planos (`finalText`, `toolCalls`). Es el orquestador el que decide
// qué de esto entra al estado compartido.

const ALLOWED_TOOLS = ["list_files", "read_file", "search_rag", "read_project_memory"];

const SYSTEM_PROMPT = `Sos el subagente Explorer dentro de un sistema de coding agents.
Tu única responsabilidad es entender el repositorio: estructura de carpetas, arquitectura,
dependencias, convenciones y archivos relevantes para la tarea que te pasan.
No proponés ni escribís cambios de código: esa responsabilidad es de otro subagente (Implementer).
Antes de explorar el filesystem, consultá read_project_memory por si ya hay arquitectura
conocida de sesiones anteriores. Usá search_rag si necesitás confirmar convenciones del
ecosistema del proyecto (por ejemplo patrones de NestJS).
Terminá tu respuesta con un resumen conciso: stack detectado, archivos/módulos relevantes
para la tarea, y convenciones que el resto del equipo debe respetar.`;

function getAllowedTools() {
  return tools.filter((tool) => ALLOWED_TOOLS.includes(tool.function.name));
}

function getAllowedToolFunctions() {
  return Object.fromEntries(ALLOWED_TOOLS.map((name) => [name, toolFunctions[name]]));
}

// `task`: el pedido original del usuario.
// `context`: opcional, texto libre con lo que ya se sabe (por ejemplo, si el
// orquestador vuelve a llamar a Explorer con una pregunta más puntual).
export async function runExplorer({ task, context }) {
  const userMessage = context
    ? `Tarea del usuario: ${task}\n\nContexto adicional: ${context}`
    : `Tarea del usuario: ${task}\n\nExplorá el repositorio y dejá un resumen de lo que el resto del equipo necesita saber para resolverla.`;

  const { finalText, toolCalls } = await runAgentLoop({
    systemPrompt: SYSTEM_PROMPT,
    tools: getAllowedTools(),
    toolFunctions: getAllowedToolFunctions(),
    messages: [{ role: "user", content: userMessage }],
  });

  return { finalText, toolCalls };
}
