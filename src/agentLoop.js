import { client, MODEL } from "./llmClient.js";
import { validateToolCall, commandRequiresApproval } from "./policies.js";
import { ask } from "./io.js";
import { settings, SUPERVISED_TOOLS } from "./settings.js";
import { startActiveObservation } from "@langfuse/tracing";

// ============================================================
// LOOP GENÉRICO DE AGENTE
// ============================================================
// Lo usa tanto el agente principal (cli.js) como cada subagente.
// Cada llamada:
//  1. Llama al LLM con los `tools` y `messages` que le pasaron.
//  2. Si pide tool_calls: valida política, pide supervisión si corresponde,
//     ejecuta la tool con `toolFunctions`, y vuelve a llamar al LLM.
//  3. Repite hasta que el LLM responde texto en vez de tool_calls.
//  4. Si detecta que la misma tool con los mismos argumentos devuelve el
//     mismo resultado varias veces seguidas (`maxConsecutiveRepeats`),
//     corta el loop y fuerza una respuesta de texto pidiéndole al modelo
//     que explique el bloqueo en vez de seguir reintentando a ciegas.
//
// Devuelve:
//  - messages: el historial completo (útil si el caller quiere seguir
//    la conversación, como hace cli.js turno a turno).
//  - finalText: la respuesta final en texto plano.
//  - toolCalls: el registro de cada tool ejecutada (nombre, args, resultado,
//    si fue permitida o no). El orquestador usa esto para poblar el estado
//    compartido (fuentes consultadas, archivos modificados) sin depender
//    de que el subagente lo mencione en su texto.
//  - loopDetected: true si se cortó el loop por repetición sin avanzar.
export async function runAgentLoop({
  systemPrompt,
  tools,
  toolFunctions,
  messages,
  maxConsecutiveRepeats = 2,
}) {
  const hasSystemMessage = messages.some((message) => message.role === "system");
  const fullMessages =
    systemPrompt && !hasSystemMessage
      ? [{ role: "system", content: systemPrompt }, ...messages]
      : [...messages];

  const toolCalls = [];
  let lastSignature = null;
  let repeatCount = 0;
  let loopDetected = false;

  outer: while (true) {
    const response = await client.chat.completions.create({
      model: MODEL,
      messages: fullMessages,
      tools,
      tool_choice: "auto",
    });

    const message = response.choices[0].message;

    if (!message.tool_calls) {
      fullMessages.push(message);
      return { messages: fullMessages, finalText: message.content, toolCalls, loopDetected };
    }

    fullMessages.push(message);

    for (const toolCall of message.tool_calls) {
      const toolName = toolCall.function.name;
      const args = JSON.parse(toolCall.function.arguments);

      console.log(`\n🔧 ${toolName}(${JSON.stringify(args)})`);

      const policyResult = validateToolCall(toolName, args);
      if (!policyResult.allowed) {
        console.log(`🚫 ${policyResult.reason}\n`);
        fullMessages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: policyResult.reason,
        });
        toolCalls.push({ name: toolName, args, result: policyResult.reason, allowed: false });
        continue;
      }

      // ── SUPERVISIÓN ──────────────────────────────────────
      const approvalPattern =
        toolName === "run_command" ? commandRequiresApproval(args.command) : null;
      const needsSupervision = settings.supervision && SUPERVISED_TOOLS.includes(toolName);
      const needsPolicyApproval = Boolean(approvalPattern);

      if (needsSupervision || needsPolicyApproval) {
        const reason = needsPolicyApproval
          ? `requiere aprobación por política "${approvalPattern}"`
          : "requiere aprobación por supervisión";
        const confirm = await ask(`⚠️  ¿Confirmás ejecutar ${toolName}? (${reason}) (s/n): `);
        if (confirm.toLowerCase() !== "s") {
          console.log("🚫 Acción rechazada por el usuario\n");
          const rejection = `El usuario rechazó ejecutar ${toolName}. No realices esta acción.`;
          fullMessages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: rejection,
          });
          toolCalls.push({ name: toolName, args, result: rejection, allowed: false });
          continue;
        }
      }
      // ─────────────────────────────────────────────────────

      const toolFn = toolFunctions[toolName];
      const result = await traceToolCall(toolName, args, async () =>
        toolFn ? await toolFn(args) : `Error: tool "${toolName}" no existe`
      );
      const resultText = String(result);

      fullMessages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: resultText,
      });
      toolCalls.push({ name: toolName, args, result: resultText, allowed: true });

      // ── DETECCIÓN DE LOOPS ────────────────────────────────
      // Misma tool + mismos argumentos + mismo resultado, varias veces
      // seguidas: no tiene sentido seguir reintentando. Se corta el loop
      // y se fuerza una respuesta de texto explicando el bloqueo.
      const signature = `${toolName}::${JSON.stringify(args)}`;
      if (signature === lastSignature?.signature && resultText === lastSignature.result) {
        repeatCount += 1;
      } else {
        repeatCount = 0;
      }
      lastSignature = { signature, result: resultText };

      if (repeatCount >= maxConsecutiveRepeats) {
        loopDetected = true;
        console.log(
          `\n⛔ Loop detectado: "${toolName}" repitió el mismo resultado ${repeatCount + 1} veces seguidas.\n`
        );
        fullMessages.push({
          role: "user",
          content: `Se detectó que repetiste la acción "${toolName}" con los mismos argumentos y obtuviste el mismo resultado ${repeatCount + 1} veces seguidas. No la repitas de nuevo. Explicá qué intentaste, qué información falta o qué está bloqueado, y qué necesitás para seguir. No pidas más tools.`,
        });
        break outer;
      }
      // ─────────────────────────────────────────────────────
    }
  }

  // Se cortó por loop: forzamos una respuesta de texto (sin tools) para
  // que el agente explique el bloqueo en vez de seguir intentando.
  const response = await client.chat.completions.create({
    model: MODEL,
    messages: fullMessages,
  });
  const message = response.choices[0].message;
  fullMessages.push(message);
  return { messages: fullMessages, finalText: message.content, toolCalls, loopDetected };
}

function compactValue(value, max = 4000) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max)}\n[...truncado para Langfuse...]` : text;
}

async function traceToolCall(toolName, args, fn) {
  return startActiveObservation(
    `tool:${toolName}`,
    async (span) => {
      span.update({
        input: args,
        metadata: {
          toolName,
        },
      });

      try {
        const result = await fn();
        span.update({
          output: compactValue(result),
          metadata: {
            toolName,
            outputLength: String(result).length,
          },
        });
        return result;
      } catch (err) {
        span.update({
          level: "ERROR",
          statusMessage: err.message,
          output: { error: err.message },
          metadata: {
            toolName,
          },
        });
        throw err;
      }
    },
    { asType: "tool" }
  );
}
