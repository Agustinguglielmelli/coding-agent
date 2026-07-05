import fs from "fs";
import path from "path";

// ============================================================
// ESTADO COMPARTIDO DE TAREA
// ============================================================
// Diseño "opción B": estas funciones las usa únicamente el orquestador
// (src/orchestrator.js, todavía no implementado). Los subagentes no
// importan este módulo ni tocan el estado directamente: reciben datos
// planos y devuelven un resultado + historial de tool calls. Es el
// orquestador el que interpreta ese resultado y decide qué entra acá.
//
// Esto es el "estado compartido" que pide la consigna (distinto de la
// memoria persistente por proyecto en src/memory.js): vive y muere con
// una sola tarea, no con todas las sesiones del agente.

export function createTaskState(originalRequest) {
  const now = new Date().toISOString();
  return {
    id: `task-${Date.now()}`,
    originalRequest,
    subagentResults: {},
    sources: [],
    filesModified: [],
    observations: [],
    status: "in_progress", // in_progress | done | blocked
    createdAt: now,
    updatedAt: now,
  };
}

function touch(state) {
  state.updatedAt = new Date().toISOString();
  return state;
}

export function updateTaskState(state, patch) {
  Object.assign(state, patch);
  return touch(state);
}

export function addSource(state, source) {
  state.sources.push({ ...source, addedAt: new Date().toISOString() });
  return touch(state);
}

export function addFileModified(state, file) {
  state.filesModified.push({ ...file, addedAt: new Date().toISOString() });
  return touch(state);
}

export function addObservation(state, text) {
  state.observations.push({ text, at: new Date().toISOString() });
  return touch(state);
}

// Opcional: deja un snapshot en disco para debug/evidencia de observabilidad.
// No se usa para que el agente "recuerde" nada entre tareas — para eso está
// la memoria persistente del proyecto (src/memory.js).
export function saveTaskState(state, dir = "memory/tasks") {
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${state.id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2), "utf-8");
  return filePath;
}
