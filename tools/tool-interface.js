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

export class Tool {
  constructor({
    name,
    description,
    parameters,
    supervised = false,
    disabledInPlanMode = false,
  }) {
    if (new.target === Tool) {
      throw new Error("Tool is an interface base class and cannot be instantiated directly.");
    }

    this.name = name;
    this.schema = {
      name,
      description,
      parameters,
    };
    this.supervised = supervised;
    this.disabledInPlanMode = disabledInPlanMode;
  }

  matches(toolCall) {
    return toolCall.name === this.name;
  }

  validate() {
    return allowToolCall();
  }

  requiresApproval() {
    return null;
  }

  async execute() {
    throw new Error(`Tool "${this.name}" must implement execute(toolCall).`);
  }

  audit() {
    return {};
  }

  toOpenAITool() {
    return {
      type: "function",
      function: this.schema,
    };
  }
}

export class ToolRegistry {
  constructor(tools) {
    this.tools = tools;
    this.openAiTools = tools.map((tool) => tool.toOpenAITool());
  }

  find(toolCall) {
    return this.tools.find((tool) => tool.matches(toolCall));
  }

  get definitions() {
    return this.tools;
  }

  getOpenAiTools() {
    return this.openAiTools;
  }

  getOpenAiToolsByName(toolNames) {
    return this.openAiTools.filter((tool) => toolNames.includes(tool.function.name));
  }

  getPlanModeDisabledToolNames() {
    return this.tools
      .filter((tool) => tool.disabledInPlanMode)
      .map((tool) => tool.name);
  }

  getOpenAiToolsForMode({ planMode }) {
    if (!planMode) return this.openAiTools;
    return this.tools
      .filter((tool) => !tool.disabledInPlanMode)
      .map((tool) => tool.toOpenAITool());
  }
}

export function createToolRegistry(tools) {
  return new ToolRegistry(tools);
}

export function validateToolRegistry({ toolRegistry, subagentDefinitions }) {
  const toolNames = toolRegistry.definitions.map((tool) => tool.name);
  const toolNameSet = new Set(toolNames);
  const errors = [];

  for (const tool of toolRegistry.definitions) {
    if (!(tool instanceof Tool)) {
      errors.push(`"${tool?.name || "tool sin nombre"}" no extiende Tool.`);
      continue;
    }
    if (!tool.name || !tool.schema?.name) {
      errors.push("Hay una tool sin nombre o sin schema.name.");
    }
    if (tool.name && toolNames.filter((name) => name === tool.name).length > 1) {
      errors.push(`Tool duplicada: "${tool.name}".`);
    }
    if (!tool.matches(createToolCall({ name: tool.name, args: {}, actor: "registry" }))) {
      errors.push(`La tool "${tool.name}" no matchea su propio nombre.`);
    }
  }

  const agentIds = new Set();
  for (const definition of subagentDefinitions) {
    if (agentIds.has(definition.id)) {
      errors.push(`Subagente duplicado: "${definition.id}".`);
    }
    agentIds.add(definition.id);

    for (const toolName of definition.allowedTools) {
      if (!toolNameSet.has(toolName)) {
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

  console.log(`\n🔧 [${actor}] ${toolCall.name}(${JSON.stringify(toolCall.args)})`);

  const tool = toolRegistry.find(toolCall);
  if (!tool) {
    const missingTool = `Error: tool "${toolCall.name}" no existe`;
    if (state) addObservation(state, actor, missingTool, { toolName, args: toolCall.args });
    return missingTool;
  }

  const validation = tool.validate(toolCall);
  if (!validation.allowed) {
    console.log(`🚫 ${validation.reason}\n`);
    if (state) {
      addObservation(state, actor, validation.reason, {
        toolName,
        args: toolCall.args,
      });
    }
    return validation.reason;
  }

  const approvalPattern = tool.requiresApproval(toolCall);
  const needsSupervision = supervision && tool.supervised;
  const needsPolicyApproval = Boolean(approvalPattern);

  if (needsSupervision || needsPolicyApproval) {
    const reason = needsPolicyApproval
      ? `requiere aprobación por política "${approvalPattern}"`
      : "requiere aprobación por supervisión";
    const confirm = await ask(`⚠️  ¿Confirmás ejecutar ${toolCall.name}? (${reason}) (s/n): `);
    if (confirm.toLowerCase() !== "s") {
      const rejection = `El usuario rechazó ejecutar ${toolCall.name}. No realices esta acción.`;
      console.log("🚫 Acción rechazada por el usuario\n");
      if (state) addObservation(state, actor, rejection, { toolName, args: toolCall.args });
      return rejection;
    }
  }

  const result = await tool.execute(toolCall);
  if (state) recordToolUse(state, tool, toolCall, result);
  return String(result);
}
