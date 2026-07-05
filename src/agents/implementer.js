import { runAgentLoop } from "../agentLoop.js";
import { tools, toolFunctions } from "../tools/index.js";

// ============================================================
// SUBAGENTE: IMPLEMENTER
// ============================================================
// Responsabilidad única: proponer o aplicar cambios de código concretos a
// partir de los hallazgos de Explorer (arquitectura/convenciones) y
// Researcher (documentación/patrones). No explora el repo desde cero ni
// investiga documentación: usa lo que ya le dejaron los otros subagentes.
//
// `write_file` sigue pasando por los mismos filtros de siempre dentro de
// runAgentLoop: política de escritura (agent.config.json) y supervisión
// interactiva (settings.supervision) — un subagente no puede saltarse eso.
//
// Diseño "opción B": no conoce taskState.js. Recibe datos planos y devuelve
// `{ finalText, toolCalls }`. El orquestador recorre `toolCalls` y, por cada
// `write_file` permitido, llama `addFileModified` sobre el estado compartido.

const ALLOWED_TOOLS = ["read_file", "write_file", "list_files"];

const SYSTEM_PROMPT = `Sos el subagente Implementer dentro de un sistema de coding agents.
Tu única responsabilidad es aplicar cambios de código concretos y acotados para resolver la
tarea pedida, basándote en los hallazgos que te pasan (arquitectura, convenciones, documentación
relevante). No explorás el repo desde cero ni investigás documentación: si te falta contexto
para decidir con confianza, decilo explícitamente en tu respuesta en vez de adivinar.
Reglas:
1. Antes de escribir, leé con read_file los archivos que vas a modificar para no pisar código
   existente a ciegas.
2. Respetá las convenciones detectadas por Explorer y los patrones que trajo Researcher.
3. Hacé el cambio mínimo necesario para cumplir el pedido, no refactors extra no pedidos.
4. Si el pedido es ambiguo, las convenciones no alcanzan, o el cambio es riesgoso (por ejemplo,
   afecta muchos archivos o falta información clave), no escribas nada: explicá qué te falta y
   qué necesitás para continuar.
Terminá tu respuesta con un resumen de qué archivos modificaste y qué cambiaste en cada uno.`;

function getAllowedTools() {
  return tools.filter((tool) => ALLOWED_TOOLS.includes(tool.function.name));
}

function getAllowedToolFunctions() {
  return Object.fromEntries(ALLOWED_TOOLS.map((name) => [name, toolFunctions[name]]));
}

// `task`: el pedido original del usuario.
// `context`: hallazgos de Explorer/Researcher que el Implementer necesita
// para no partir de cero.
export async function runImplementer({ task, context }) {
  const userMessage = context
    ? `Tarea del usuario: ${task}\n\nHallazgos de otros subagentes:\n${context}\n\nAplicá el cambio necesario.`
    : `Tarea del usuario: ${task}\n\nNo hay hallazgos previos disponibles. Si los necesitás para actuar con confianza, decilo en vez de adivinar.`;

  const { finalText, toolCalls } = await runAgentLoop({
    systemPrompt: SYSTEM_PROMPT,
    tools: getAllowedTools(),
    toolFunctions: getAllowedToolFunctions(),
    messages: [{ role: "user", content: userMessage }],
  });

  return { finalText, toolCalls };
}
