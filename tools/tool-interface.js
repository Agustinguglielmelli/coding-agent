export function createToolCall({ name, args, actor }) {
  return {
    name,
    args: args || {},
    actor,
  };
}

export function allowToolCall() {
  return { allowed: true };
}

export function denyToolCall(reason) {
  return { allowed: false, reason };
}

export function createToolDefinition({
  schema,
  execute,
  matches,
  validate,
  requiresApproval,
  audit,
  supervised = false,
  disabledInPlanMode = false,
}) {
  return {
    name: schema.name,
    schema,
    supervised,
    disabledInPlanMode,
    matches: matches || ((toolCall) => toolCall.name === schema.name),
    validate: validate || (() => allowToolCall()),
    requiresApproval: requiresApproval || (() => null),
    execute,
    audit,
    toOpenAITool() {
      return {
        type: "function",
        function: this.schema,
      };
    },
  };
}

export function createToolRegistry(toolDefinitions) {
  const openAiTools = toolDefinitions.map((toolDefinition) =>
    toolDefinition.toOpenAITool()
  );

  function find(toolCall) {
    return toolDefinitions.find((toolDefinition) => toolDefinition.matches(toolCall));
  }

  function getOpenAiTools() {
    return openAiTools;
  }

  function getOpenAiToolsByName(toolNames) {
    return openAiTools.filter((tool) => toolNames.includes(tool.function.name));
  }

  function getPlanModeDisabledToolNames() {
    return toolDefinitions
      .filter((toolDefinition) => toolDefinition.disabledInPlanMode)
      .map((toolDefinition) => toolDefinition.name);
  }

  function getOpenAiToolsForMode({ planMode }) {
    if (!planMode) return openAiTools;
    return toolDefinitions
      .filter((toolDefinition) => !toolDefinition.disabledInPlanMode)
      .map((toolDefinition) => toolDefinition.toOpenAITool());
  }

  return {
    definitions: toolDefinitions,
    find,
    getOpenAiTools,
    getOpenAiToolsByName,
    getPlanModeDisabledToolNames,
    getOpenAiToolsForMode,
  };
}

export function validateToolRegistry({ toolRegistry, subagentDefinitions }) {
  const toolSchemaNames = toolRegistry.definitions.map(
    (toolDefinition) => toolDefinition.schema.name
  );
  const toolSchemaNameSet = new Set(toolSchemaNames);
  const errors = [];

  for (const toolDefinition of toolRegistry.definitions) {
    if (!toolDefinition.name || !toolDefinition.schema?.name) {
      errors.push("Hay una tool sin nombre o sin schema.name.");
    }
    if (
      toolDefinition.name &&
      toolSchemaNames.filter((name) => name === toolDefinition.name).length > 1
    ) {
      errors.push(`Tool duplicada: "${toolDefinition.name}".`);
    }
    if (typeof toolDefinition.matches !== "function") {
      errors.push(`La tool "${toolDefinition.name}" no define matches().`);
    } else if (
      !toolDefinition.matches(
        createToolCall({
          name: toolDefinition.schema.name,
          args: {},
          actor: "registry-validation",
        })
      )
    ) {
      errors.push(`La tool "${toolDefinition.name}" no matchea su propio schema.name.`);
    }
    if (typeof toolDefinition.execute !== "function") {
      errors.push(`La tool "${toolDefinition.name}" no define execute().`);
    }
    if (typeof toolDefinition.validate !== "function") {
      errors.push(`La tool "${toolDefinition.name}" no define validate().`);
    }
  }

  const agentIds = new Set();
  for (const definition of subagentDefinitions) {
    if (agentIds.has(definition.id)) {
      errors.push(`Subagente duplicado: "${definition.id}".`);
    }
    agentIds.add(definition.id);

    for (const toolName of definition.allowedTools) {
      if (!toolSchemaNameSet.has(toolName)) {
        errors.push(
          `Subagente "${definition.name}" referencia una tool inexistente: "${toolName}".`
        );
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(`Configuracion multi-agente invalida:\n- ${errors.join("\n- ")}`);
  }
}

export async function executeToolCall({
  toolRegistry,
  toolName,
  args,
  actor,
  supervision,
  ask,
  state,
  addObservation,
  recordToolUse,
}) {
  const toolCall = createToolCall({ name: toolName, args, actor });

  console.log(`\n🔧 [${actor}] ${toolName}(${JSON.stringify(toolCall.args)})`);

  const toolDefinition = toolRegistry.find(toolCall);
  if (!toolDefinition) {
    const missingTool = `Error: tool "${toolName}" no existe`;
    if (state) addObservation(state, actor, missingTool, { toolName, args: toolCall.args });
    return missingTool;
  }

  const policyResult = toolDefinition.validate(toolCall);
  if (!policyResult.allowed) {
    console.log(`🚫 ${policyResult.reason}\n`);
    if (state) {
      addObservation(state, actor, policyResult.reason, {
        toolName,
        args: toolCall.args,
      });
    }
    return policyResult.reason;
  }

  const approvalPattern = toolDefinition.requiresApproval(toolCall);
  const needsSupervision = supervision && toolDefinition.supervised;
  const needsPolicyApproval = Boolean(approvalPattern);

  if (needsSupervision || needsPolicyApproval) {
    const reason = needsPolicyApproval
      ? `requiere aprobación por política "${approvalPattern}"`
      : "requiere aprobación por supervisión";
    const confirm = await ask(`⚠️  ¿Confirmás ejecutar ${toolName}? (${reason}) (s/n): `);
    if (confirm.toLowerCase() !== "s") {
      const rejection = `El usuario rechazó ejecutar ${toolName}. No realices esta acción.`;
      console.log("🚫 Acción rechazada por el usuario\n");
      if (state) addObservation(state, actor, rejection, { toolName, args: toolCall.args });
      return rejection;
    }
  }

  const result = await toolDefinition.execute(toolCall);
  if (state) recordToolUse(state, toolCall, result);
  return String(result);
}
