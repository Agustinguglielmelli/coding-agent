import { runAgentLoop } from "../agentLoop.js";
import { tools, toolFunctions } from "../tools/index.js";

// ============================================================
// SUBAGENTE: RESEARCHER
// ============================================================
// Responsabilidad única: buscar información técnica para resolver la tarea.
// Consulta primero el RAG local del ecosistema (NestJS/TypeScript); solo usa
// web_search como fallback cuando el RAG no tiene evidencia suficiente,
// priorizando documentación oficial y fuentes técnicas confiables.
// No propone ni escribe código — eso es del Implementer.
//
// Diseño "opción B": no conoce taskState.js. Recibe datos planos y devuelve
// `{ finalText, toolCalls }`. El orquestador es quien recorre `toolCalls`
// para extraer qué se buscó en RAG/web y lo carga en `state.sources` con
// `addSource`, sin depender de que el texto final las mencione.

const ALLOWED_TOOLS = ["search_rag", "web_search", "read_project_memory"];

const SYSTEM_PROMPT = `Sos el subagente Researcher dentro de un sistema de coding agents.
Tu única responsabilidad es investigar información técnica relevante para la tarea que te pasan.
Reglas estrictas:
1. Consultá primero search_rag. Es la base de documentación del ecosistema del proyecto
   (NestJS/TypeScript) y notas propias del repo.
2. Usá web_search únicamente si el RAG no devolvió evidencia suficiente. Priorizá siempre
   documentación oficial y fuentes técnicas confiables por sobre blogs o foros.
3. No proponés ni escribís cambios de código: esa responsabilidad es de otro subagente
   (Implementer). Vos entregás información y contexto, no una solución implementada.
4. Sé explícito sobre el origen de cada dato: indicá si viene del RAG (con archivo y score)
   o de la web (con URL), y diferencialo de cualquier inferencia propia que agregues.
Terminá tu respuesta con un resumen conciso de los hallazgos y las fuentes usadas.`;

function getAllowedTools() {
  return tools.filter((tool) => ALLOWED_TOOLS.includes(tool.function.name));
}

function getAllowedToolFunctions() {
  return Object.fromEntries(ALLOWED_TOOLS.map((name) => [name, toolFunctions[name]]));
}

// `task`: el pedido original del usuario.
// `context`: opcional, texto libre con hallazgos de otros subagentes (por
// ejemplo, el resumen que dejó Explorer) para enfocar la búsqueda.
export async function runResearcher({ task, context }) {
  const userMessage = context
    ? `Tarea del usuario: ${task}\n\nContexto de otros subagentes: ${context}\n\nInvestigá lo necesario para resolver esta tarea.`
    : `Tarea del usuario: ${task}\n\nInvestigá lo necesario para resolver esta tarea.`;

  const { finalText, toolCalls } = await runAgentLoop({
    systemPrompt: SYSTEM_PROMPT,
    tools: getAllowedTools(),
    toolFunctions: getAllowedToolFunctions(),
    messages: [{ role: "user", content: userMessage }],
  });

  return { finalText, toolCalls };
}
