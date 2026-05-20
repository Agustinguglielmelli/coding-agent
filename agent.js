import OpenAI from "openai";
import dotenv from "dotenv";
import readline from "readline";
import fs from "fs";
import { execSync } from "child_process";
import { dirname } from "path";
dotenv.config();

const client = new OpenAI({
  apiKey: process.env.GEMINI_API_KEY,
  baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
});

const MODEL = "models/gemini-2.5-flash";

// ============================================================
// FLAGS — activar/desactivar acá
// ============================================================
let SUPERVISION = true;  // pide confirmación antes de write_file y run_command
let PLAN_MODE = true;    // genera un plan antes de ejecutar cualquier tool

const SUPERVISED_TOOLS = ["write_file", "run_command"];

// ============================================================
// TOOLS — implementación
// ============================================================

function read_file(path) {
  try {
    const content = fs.readFileSync(path, "utf-8");
    console.log(`✅ read_file("${path}")`);
    return content;
  } catch (err) {
    if (err.code === "ENOENT") return `Error: File not found at ${path}`;
    return `Error reading file ${path}: ${err.message}`;
  }
}

function write_file({ path, content }) {
  try {
    fs.mkdirSync(dirname(path), { recursive: true });
    fs.writeFileSync(path, content, "utf-8");
    console.log(`✅ write_file("${path}")`);
    return `Archivo escrito exitosamente: ${path}`;
  } catch (err) {
    console.log(`❌ write_file error: ${err.message}`);
    return `Error writing file ${path}: ${err.message}`;
  }
}

function run_command({ command }) {
  try {
    console.log(`✅ run_command("${command}")`);
    const stdout = execSync(command, { encoding: "utf-8", timeout: 10000 });
    return stdout || "(sin output)";
  } catch (err) {
    const output = (err.stdout || "") + (err.stderr || "");
    console.log(`⚠️  run_command salió con error`);
    return output || err.message;
  }
}

function list_files({ directory }) {
  try {
    const items = fs.readdirSync(directory, { withFileTypes: true });
    const result = items.map((item) =>
      item.isDirectory() ? `📁 ${item.name}/` : `📄 ${item.name}`
    );
    console.log(`✅ list_files("${directory}") — ${result.length} items`);
    return result.join("\n");
  } catch (err) {
    console.log(`❌ list_files error: ${err.message}`);
    return `Error listing directory ${directory}: ${err.message}`;
  }
}

async function web_search({ query }) {
  try {
    console.log(`✅ web_search("${query}")`);
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: process.env.TAVILY_API_KEY,
        query,
        max_results: 3,
      }),
    });
    const data = await res.json();
    if (!data.results) {
      return `Error: Tavily no devolvió resultados. Detalle: ${JSON.stringify(data)}`;
    }
    const results = data.results
      .map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.content}`)
      .join("\n\n");
    return results || "Sin resultados";
  } catch (err) {
    return `Error en web_search: ${err.message}`;
  }
}

// ============================================================
// SCHEMAS
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
          path: { type: "string", description: "Path del archivo a leer." },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Escribe contenido en un archivo, reemplazando su contenido actual.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Path del archivo a escribir." },
          content: { type: "string", description: "Contenido a escribir en el archivo." },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_command",
      description: "Ejecuta un comando de terminal y devuelve el output (stdout y stderr).",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "Comando a ejecutar." },
        },
        required: ["command"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_files",
      description: "Lista los archivos y carpetas en un directorio.",
      parameters: {
        type: "object",
        properties: {
          directory: { type: "string", description: "Path del directorio a listar." },
        },
        required: ["directory"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "web_search",
      description: "Busca información en la web. Usá esta tool cuando necesites información externa o documentación.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Consulta de búsqueda." },
        },
        required: ["query"],
      },
    },
  },
];

const toolFunctions = {
  read_file: (args) => read_file(args.path),
  write_file,
  run_command,
  list_files,
  web_search,
};

// ============================================================
// PLAN MODE — pedir plan al LLM antes de ejecutar
// ============================================================

async function getPlan(userMessage) {
  const response = await client.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: "system",
        content:
          "Sos un agente de código. Cuando recibas una tarea, describí el plan de pasos que seguirías para completarla. Listá los pasos numerados, sin ejecutar nada todavía. Sé concreto: mencioná qué tools usarías en cada paso.",
      },
      {
        role: "user",
        content: userMessage,
      },
    ],
  });
  return response.choices[0].message.content;
}

// ============================================================
// LOOP DE CONVERSACIÓN
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
    content:
      "Sos un agente de código. Podés leer y escribir archivos, ejecutar comandos, listar directorios y buscar en la web. Usá las tools que necesites para completar las tareas.",
  },
];

async function main() {
  console.log(`Coding Agent listo.`);
  console.log(`  Supervisión: ${SUPERVISION ? "✅ activada" : "❌ desactivada"}`);
  console.log(`  Plan mode:   ${PLAN_MODE ? "✅ activado" : "❌ desactivado"}`);
  console.log(`\nComandos: 'supervision on/off' | 'plan on/off' | 'exit'\n`);

  // Loop externo
  while (true) {
    const input = await ask("> ");

    // Comandos de control
    if (input.toLowerCase() === "exit") {
      console.log("Saliendo...");
      rl.close();
      break;
    }
    if (input.toLowerCase() === "supervision on") {
      SUPERVISION = true;
      console.log("✅ Supervisión activada\n");
      continue;
    }
    if (input.toLowerCase() === "supervision off") {
      SUPERVISION = false;
      console.log("❌ Supervisión desactivada\n");
      continue;
    }
    if (input.toLowerCase() === "plan on") {
      PLAN_MODE = true;
      console.log("✅ Plan mode activado\n");
      continue;
    }
    if (input.toLowerCase() === "plan off") {
      PLAN_MODE = false;
      console.log("❌ Plan mode desactivado\n");
      continue;
    }

    // ── PLAN MODE ────────────────────────────────────────────
    if (PLAN_MODE) {
      console.log("\n📋 Generando plan...\n");
      const plan = await getPlan(input);
      console.log(plan);

      const answer = await ask("\n¿Aprobás el plan? (s = ejecutar / n = cancelar / m = modificar): ");

      if (answer.toLowerCase() === "n") {
        console.log("🚫 Tarea cancelada.\n");
        continue;
      }

      if (answer.toLowerCase() === "m") {
        const modification = await ask("Escribí tu modificación: ");
        messages.push({
          role: "user",
          content: `${input}\n\nPlan sugerido:\n${plan}\n\nModificación del usuario: ${modification}`,
        });
      } else {
        // aprobado — agregar mensaje original
        messages.push({ role: "user", content: input });
      }
    } else {
      messages.push({ role: "user", content: input });
    }
    // ─────────────────────────────────────────────────────────

    // Loop interno — ejecuta tools hasta que el LLM responde sin pedir ninguna
    while (true) {
      const response = await client.chat.completions.create({
        model: MODEL,
        messages,
        tools,
        tool_choice: "auto",
      });

      const message = response.choices[0].message;

      if (message.tool_calls) {
        messages.push(message);

        for (const toolCall of message.tool_calls) {
          const toolName = toolCall.function.name;
          const args = JSON.parse(toolCall.function.arguments);

          console.log(`\n🔧 ${toolName}(${JSON.stringify(args)})`);

          // ── SUPERVISIÓN ──────────────────────────────────────
          if (SUPERVISION && SUPERVISED_TOOLS.includes(toolName)) {
            const confirm = await ask(`⚠️  ¿Confirmás ejecutar ${toolName}? (s/n): `);
            if (confirm.toLowerCase() !== "s") {
              console.log("🚫 Acción rechazada por el usuario\n");
              messages.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: `El usuario rechazó ejecutar ${toolName}. No realices esta acción.`,
              });
              continue;
            }
          }
          // ─────────────────────────────────────────────────────

          const toolFn = toolFunctions[toolName];
          const result = toolFn
            ? await toolFn(args)
            : `Error: tool "${toolName}" no existe`;

          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: String(result),
          });
        }
      } else {
        messages.push(message);
        console.log("\n" + message.content + "\n");
        break;
      }
    }
  }
}

main().catch(console.error);