import { client, MODEL } from "./llmClient.js";
import { validateToolCall, commandRequiresApproval } from "./policies.js";
import { ask } from "./io.js";
import { settings, SUPERVISED_TOOLS } from "./settings.js";

// ============================================================
// LOOP GENÉRICO DE AGENTE
// ============================================================
// Lo usa tanto el agente principal (cli.js) como cada subagente.
// Cada llamada:
//  1. Llama al LLM con los `tools` y `messages` que le pasaron.
//  2. Si pide tool_calls: valida política, pide supervisión si corresponde,
//     ejecuta la tool con `toolFunctions`, y vuelve a llamar al LLM.
//  3. Repite hasta que el LLM responde texto en vez de tool_calls.
//
// Devuelve:
//  - messages: el historial completo (útil si el caller quiere seguir
//    la conversación, como hace cli.js turno a turno).
//  - finalText: la respuesta final en texto plano.
//  - toolCalls: el registro de cada tool ejecutada (nombre, args, resultado,
//    si fue permitida o no). El orquestador usa esto para poblar el estado
//    compartido (fuentes consultadas, archivos modificados) sin depender
//    de que el subagente lo mencione en su texto.
export async function runAgentLoop({ systemPrompt, tools, toolFunctions, messages }) {
  const hasSystemMessage = messages.some((message) => message.role === "system");
  const fullMessages =
    systemPrompt && !hasSystemMessage
      ? [{ role: "system", content: systemPrompt }, ...messages]
      : [...messages];

  const toolCalls = [];

  while (true) {
    const response = await client.chat.completions.create({
      model: MODEL,
      messages: fullMessages,
      tools,
      tool_choice: "auto",
    });

    const message = response.choices[0].message;

    if (!message.tool_calls) {
      fullMessages.push(message);
      return { messages: fullMessages, finalText: message.content, toolCalls };
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
      const result = toolFn ? await toolFn(args) : `Error: tool "${toolName}" no existe`;

      fullMessages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: String(result),
      });
      toolCalls.push({ name: toolName, args, result: String(result), allowed: true });
    }
  }
}
