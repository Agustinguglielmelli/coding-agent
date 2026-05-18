import OpenAI from "openai";
import dotenv from "dotenv";
import readline from "readline";
import fs from "fs";
dotenv.config();

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const MODEL = "gpt-5-nano";

// ============================================================
// ETAPA 5 — Tool: read_file
// ============================================================

function read_file(path) {
  try {
    const content = fs.readFileSync(path, "utf-8");
    console.log(`✅ Tool ejecutada: read_file("${path}")`);
    return content;
  } catch (err) {
    if (err.code === "ENOENT") return `Error: File not found at ${path}`;
    return `Error reading file ${path}: ${err.message}`;
  }
}

// ============================================================
// ETAPA 6 — Schema de la tool para el LLM
// ============================================================

const tools = [
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Lee el contenido de un archivo dado su path.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Path del archivo a leer. Ej: README.md o src/index.js",
          },
        },
        required: ["path"],
      },
    },
  },
];

// Mapa nombre → función (cuando haya más tools, se agregan acá)
const toolFunctions = {
  read_file: read_file,
};

// ============================================================
// Loop de conversación
// ============================================================

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

const messages = [
  {
    role: "system",
    content: "Sos un agente de código. Podés leer archivos para responder preguntas sobre el código.",
  },
];

async function main() {
  console.log("Coding Agent listo. Escribí 'exit' para salir.\n");

  // Loop externo — mantiene la conversación viva
  while (true) {
    const input = await ask("> ");

    if (input.toLowerCase() === "exit") {
      console.log("Saliendo...");
      rl.close();
      break;
    }

    messages.push({ role: "user", content: input });

    // Loop interno — ejecuta tools hasta que el LLM responde sin pedir ninguna
    while (true) {
      const response = await client.chat.completions.create({
        model: MODEL,
        messages: messages,
        tools: tools,
        tool_choice: "auto",
      });

      // ETAPA 7 — Detectar si el LLM quiere usar una tool
      const message = response.choices[0].message;

      if (message.tool_calls) {
        // ETAPA 8 — Ejecutar la tool
        const toolCall = message.tool_calls[0];
        const args = JSON.parse(toolCall.function.arguments);
        const toolName = toolCall.function.name;

        console.log(`\n🔧 El agente quiere usar: ${toolName}(${JSON.stringify(args)})`);

        const toolFn = toolFunctions[toolName];
        const result = toolFn ? toolFn(args.path) : `Error: tool "${toolName}" no existe`;

        // ETAPA 9 — Devolver resultado al LLM
        messages.push(message);
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: result,
        });

        // Volver a llamar al LLM con el resultado — sigue el loop interno

      } else {
        // El LLM respondió sin pedir tools → fin del turno
        messages.push(message);
        console.log("\n" + message.content + "\n");
        break;
      }
    }
  }
}

main().catch(console.error);