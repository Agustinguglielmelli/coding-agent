import {
  createTaskState,
  updateTaskState,
  addSource,
  addFileModified,
  addObservation,
  saveTaskState,
} from "./taskState.js";
import { update_project_memory } from "./memory.js";
import { classifyTask } from "./router.js";
import { runExplorer } from "./agents/explorer.js";
import { runResearcher } from "./agents/researcher.js";
import { runImplementer } from "./agents/implementer.js";
import { runTester } from "./agents/tester.js";
import { runReviewer } from "./agents/reviewer.js";
import { startActiveObservation } from "@langfuse/tracing";

// ============================================================
// ORQUESTADOR — el "agente principal"
// ============================================================
// Es el único que conoce y escribe taskState.js (diseño "opción B").
// Los subagentes reciben datos planos (`task`, `context`) y devuelven datos
// planos (`finalText`, `toolCalls`, y `loopDetected` en el caso de Tester).
// Acá se interpreta ese resultado: qué entra al estado compartido, y si se
// sigue a la próxima etapa o se corta la cadena.

const MAX_CONTEXT_CHARS = 5000;
const MAX_SUMMARY_AGENT_CHARS = 1500;

function truncate(text, max = MAX_CONTEXT_CHARS) {
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max)}\n[...truncado...]` : text;
}

function joinContext(sections) {
  return sections
    .filter(Boolean)
    .map(([label, text]) => `## ${label}\n${truncate(text)}`)
    .join("\n\n");
}

// Traduce el historial mecánico de tool calls de un subagente al estado
// compartido, sin depender de que el subagente lo mencione en su texto.
function recordToolCalls(state, subagentName, toolCalls) {
  for (const call of toolCalls) {
    if (!call.allowed) continue;

    if (call.name === "search_rag" || call.name === "web_search") {
      addSource(state, {
        subagent: subagentName,
        tool: call.name,
        query: call.args.query,
        preview: truncate(call.result, 300),
      });
    }

    if (call.name === "write_file") {
      addFileModified(state, {
        subagent: subagentName,
        path: call.args.path,
      });
    }
  }
}

function hasAllowedToolCall(toolCalls, name) {
  return toolCalls.some((call) => call.allowed && call.name === name);
}

export async function runTask(originalRequest) {
  return startActiveObservation("multiagent-task", async (span) => {
    span.update({
      input: { originalRequest },
      metadata: {
        mode: "multiagent",
        agents: ["explorer", "researcher", "implementer", "tester", "reviewer"],
      },
    });

    const state = createTaskState(originalRequest);

    // ── EXPLORER ─────────────────────────────────────────────
    console.log("\n🧭 Explorer explorando el repositorio...\n");
    const explorerResult = await traceSubagent("explorer", { task: originalRequest }, () =>
      runExplorer({ task: originalRequest })
    );
    updateTaskState(state, {
      subagentResults: { ...state.subagentResults, explorer: explorerResult.finalText },
    });
    recordToolCalls(state, "explorer", explorerResult.toolCalls);

    // ── RESEARCHER ───────────────────────────────────────────
    console.log("\n🔎 Researcher buscando información...\n");
    const researcherInput = {
      task: originalRequest,
      context: explorerResult.finalText,
    };
    const researcherResult = await traceSubagent("researcher", researcherInput, () =>
      runResearcher(researcherInput)
    );
    updateTaskState(state, {
      subagentResults: { ...state.subagentResults, researcher: researcherResult.finalText },
    });
    recordToolCalls(state, "researcher", researcherResult.toolCalls);

  // ── ROUTER ───────────────────────────────────────────────
  // Con Explorer y Researcher ya corridos (son de solo lectura y sirven
  // igual para cualquier tipo de pedido), decidimos si hace falta seguir
  // a Implementer/Tester/Reviewer o si esto era una consulta informativa
  // que ya quedó respondida. Evita que una pregunta termine marcada como
  // "blocked" solo porque Implementer no tuvo ningún archivo para tocar.
  const taskType = await classifyTask(originalRequest);
  if (taskType === "informative") {
    addObservation(
      state,
      "Router clasificó la tarea como informativa: Explorer y Researcher alcanzaron para responder, no se ejecutó Implementer/Tester/Reviewer."
    );
    updateTaskState(state, { status: "done" });
    return finishWithTrace(state, span);
  }

  // ── IMPLEMENTER ──────────────────────────────────────────
  console.log("\n🛠️  Implementer aplicando cambios...\n");
  const implementerContext = joinContext([
    ["Hallazgos de Explorer", explorerResult.finalText],
    ["Hallazgos de Researcher", researcherResult.finalText],
  ]);
      const implementerInput = {
          task: originalRequest,
          context: implementerContext,
      };
      const implementerResult = await traceSubagent("implementer", implementerInput, () =>
          runImplementer(implementerInput)
      );
  updateTaskState(state, {
    subagentResults: { ...state.subagentResults, implementer: implementerResult.finalText },
  });
  recordToolCalls(state, "implementer", implementerResult.toolCalls);

    // Señal mecánica (no de texto libre): si no hubo ningún write_file
    // permitido, el Implementer no aplicó cambios. Puede ser porque el
    // pedido era ambiguo, faltaba evidencia, o el cambio era riesgoso — en
    // cualquier caso, no tiene sentido correr Tester ni Reviewer sobre nada.
    if (!hasAllowedToolCall(implementerResult.toolCalls, "write_file")) {
      addObservation(
        state,
        `Implementer no aplicó cambios de archivo. Respuesta: ${implementerResult.finalText}`
      );
      updateTaskState(state, { status: "blocked" });
      return finishWithTrace(state, span);
    }

    // ── TESTER ───────────────────────────────────────────────
    console.log("\n🧪 Tester validando los cambios...\n");
    const testerInput = {
      task: originalRequest,
      context: implementerResult.finalText,
    };
    const testerResult = await traceSubagent("tester", testerInput, () => runTester(testerInput));
    updateTaskState(state, {
      subagentResults: { ...state.subagentResults, tester: testerResult.finalText },
    });
    recordToolCalls(state, "tester", testerResult.toolCalls);

    const testerBlocked =
      testerResult.loopDetected || /bloquead/i.test(testerResult.finalText || "");
    if (testerBlocked) {
      addObservation(
        state,
        testerResult.loopDetected
          ? `Tester detectó una acción repetida sin avanzar y se detuvo. Respuesta: ${testerResult.finalText}`
          : `Tester reportó que los checks fallaron. Respuesta: ${testerResult.finalText}`
      );
      updateTaskState(state, { status: "blocked" });
      return finishWithTrace(state, span);
    }

    // ── REVIEWER ─────────────────────────────────────────────
    console.log("\n✅ Reviewer revisando el diff...\n");
    const reviewerContext = joinContext([
      ["Cambios de Implementer", implementerResult.finalText],
      ["Resultado de Tester", testerResult.finalText],
    ]);
    const reviewerInput = {
      task: originalRequest,
      context: reviewerContext,
    };
    const reviewerResult = await traceSubagent("reviewer", reviewerInput, () =>
      runReviewer(reviewerInput)
    );
    updateTaskState(state, {
      subagentResults: { ...state.subagentResults, reviewer: reviewerResult.finalText },
    });
    recordToolCalls(state, "reviewer", reviewerResult.toolCalls);

    const reviewerObserved = /observad/i.test(reviewerResult.finalText || "");
    addObservation(
      state,
      reviewerObserved
        ? `Reviewer dejó observaciones sobre el diff: ${reviewerResult.finalText}`
        : `Reviewer aprobó el diff: ${reviewerResult.finalText}`
    );
    updateTaskState(state, { status: reviewerObserved ? "blocked" : "done" });

    return finishWithTrace(state, span);
  });
}

// Cierre común a cualquier camino (éxito o bloqueo): deja evidencia en disco
// y, si la tarea terminó, un resumen en la memoria persistente del proyecto.
function finish(state) {
  if (state.status !== "in_progress") {
    update_project_memory({
      section: "session_summary",
      title: `Tarea multiagente: ${state.originalRequest.slice(0, 60)}`,
      content: buildSummary(state),
      source: "agente",
      tags: ["multiagente", state.status],
    });
  }

  const savedTo = saveTaskState(state);
  return { state, summary: buildSummary(state), savedTo };
}

function finishWithTrace(state, span) {
  const result = finish(state);
  span.update({
    output: {
      status: state.status,
      summary: result.summary,
      savedTo: result.savedTo,
    },
    metadata: {
      sourcesCount: state.sources.length,
      filesModifiedCount: state.filesModified.length,
      observationsCount: state.observations.length,
    },
  });
  return result;
}

async function traceSubagent(name, input, fn) {
  return startActiveObservation(
    `subagent:${name}`,
    async (span) => {
      span.update({ input });
      const result = await fn();

      span.update({
        output: result.finalText,
        metadata: {
          subagent: name,
          toolCalls: result.toolCalls?.length || 0,
          loopDetected: result.loopDetected || false,
        },
      });

      return result;
    },
    { asType: "agent" }
  );
}

export function buildSummary(state) {
  const lines = [
    `Pedido: ${state.originalRequest}`,
    `Estado final: ${state.status}`,
    "",
    "Resultados por subagente:",
  ];

  for (const [name, text] of Object.entries(state.subagentResults)) {
    lines.push(`- ${name}: ${truncate(text, MAX_SUMMARY_AGENT_CHARS)}`);
  }

  lines.push("", `Fuentes consultadas: ${state.sources.length}`);
  for (const source of state.sources) {
    lines.push(`- [${source.subagent}] ${source.tool}("${source.query}")`);
  }

  lines.push("", `Archivos modificados: ${state.filesModified.length}`);
  for (const file of state.filesModified) {
    lines.push(`- [${file.subagent}] ${file.path}`);
  }

  if (state.observations.length > 0) {
    lines.push("", "Observaciones:");
    for (const observation of state.observations) {
      lines.push(`- ${observation.text}`);
    }
  }

  return lines.join("\n");
}
