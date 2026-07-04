import fs from "fs";
import { execSync } from "child_process";
import { dirname } from "path";
import { createToolDefinition } from "./tool-interface.js";
import { createPolicyGuards } from "./policies.js";

export const TOOL_NAMES = Object.freeze({
  READ_FILE: "read_file",
  WRITE_FILE: "write_file",
  RUN_COMMAND: "run_command",
  LIST_FILES: "list_files",
  WEB_SEARCH: "web_search",
  SEARCH_RAG: "search_rag",
  READ_PROJECT_MEMORY: "read_project_memory",
  UPDATE_PROJECT_MEMORY: "update_project_memory",
});

export const TOOL_ACCESS_GROUPS = {
  memoryRead: [TOOL_NAMES.READ_PROJECT_MEMORY],
  repoRead: [TOOL_NAMES.LIST_FILES, TOOL_NAMES.READ_FILE],
  codeChange: [TOOL_NAMES.READ_FILE, TOOL_NAMES.WRITE_FILE, TOOL_NAMES.RUN_COMMAND],
  research: [TOOL_NAMES.SEARCH_RAG, TOOL_NAMES.WEB_SEARCH],
  verification: [TOOL_NAMES.RUN_COMMAND, TOOL_NAMES.READ_FILE],
  review: [TOOL_NAMES.RUN_COMMAND, TOOL_NAMES.READ_FILE, TOOL_NAMES.SEARCH_RAG],
};

export function toolSet(...groups) {
  return [...new Set(groups.flat())];
}

function readFile(path) {
  try {
    const content = fs.readFileSync(path, "utf-8");
    console.log(`✅ read_file("${path}")`);
    return content;
  } catch (err) {
    if (err.code === "ENOENT") return `Error: File not found at ${path}`;
    return `Error reading file ${path}: ${err.message}`;
  }
}

function writeFile({ path, content }) {
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

function runCommand({ command }) {
  try {
    console.log(`✅ run_command("${command}")`);
    const stdout = execSync(command, { encoding: "utf-8", timeout: 10000 });
    return stdout || "(sin output)";
  } catch (err) {
    const output = (err.stdout || "") + (err.stderr || "");
    console.log("⚠️  run_command salió con error");
    return output || err.message;
  }
}

function listFiles({ directory }) {
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

async function webSearch({ query }) {
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

function searchRagTool({ query, top_k }, { agentConfig, searchRag }) {
  try {
    const results = searchRag(query, agentConfig, { topK: top_k });
    console.log(`✅ search_rag("${query}") — ${results.length} resultados`);

    if (results.length === 0) {
      return "RAG no encontro fragmentos relevantes. Usar web_search solo si falta evidencia.";
    }

    return results
      .map((result, index) => {
        const score = result.score.toFixed(3);
        return [
          `${index + 1}. ${result.metadata.title}`,
          `   score: ${score}`,
          `   fuente: ${result.metadata.source}`,
          `   archivo: ${result.metadata.file}`,
          `   chunk: ${result.metadata.chunk}`,
          `   contenido: ${result.text}`,
        ].join("\n");
      })
      .join("\n\n");
  } catch (err) {
    return `Error en search_rag: ${err.message}`;
  }
}

export function createLocalToolDefinitions({ agentConfig, projectMemory, searchRag }) {
  const policies = createPolicyGuards(agentConfig);

  return [
    createToolDefinition({
      schema: {
        name: TOOL_NAMES.READ_FILE,
        description: "Lee el contenido de un archivo dado su path.",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string", description: "Path del archivo a leer." },
          },
          required: ["path"],
        },
      },
      validate: ({ args }) => policies.validateReadPath(args.path),
      execute: ({ args }) => readFile(args.path),
      audit: ({ args }) => ({
        sources: [
          {
            type: "repo",
            path: args.path,
            detail: `Archivo leido: ${args.path}`,
          },
        ],
      }),
    }),
    createToolDefinition({
      schema: {
        name: TOOL_NAMES.WRITE_FILE,
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
      supervised: true,
      disabledInPlanMode: true,
      validate: ({ args }) => policies.validateWritePath(args.path),
      execute: ({ args }) => writeFile(args),
      audit: ({ args }) => ({
        modifiedFile: args.path,
      }),
    }),
    createToolDefinition({
      schema: {
        name: TOOL_NAMES.RUN_COMMAND,
        description: "Ejecuta un comando de terminal y devuelve el output (stdout y stderr).",
        parameters: {
          type: "object",
          properties: {
            command: { type: "string", description: "Comando a ejecutar." },
          },
          required: ["command"],
        },
      },
      supervised: true,
      validate: ({ args }) => policies.validateCommand(args.command),
      requiresApproval: ({ args }) => policies.commandRequiresApproval(args.command),
      execute: ({ args }) => runCommand(args),
      audit: ({ args, resultPreview }) => ({
        sources: [
          {
            type: "repo-command",
            command: args.command,
            detail: resultPreview,
          },
        ],
      }),
    }),
    createToolDefinition({
      schema: {
        name: TOOL_NAMES.LIST_FILES,
        description: "Lista los archivos y carpetas en un directorio.",
        parameters: {
          type: "object",
          properties: {
            directory: { type: "string", description: "Path del directorio a listar." },
          },
          required: ["directory"],
        },
      },
      validate: ({ args }) => policies.validateReadPath(args.directory),
      execute: ({ args }) => listFiles(args),
      audit: ({ args }) => ({
        sources: [
          {
            type: "repo",
            path: args.directory,
            detail: `Directorio listado: ${args.directory}`,
          },
        ],
      }),
    }),
    createToolDefinition({
      schema: {
        name: TOOL_NAMES.WEB_SEARCH,
        description:
          "Busca información en la web. Usá esta tool cuando necesites información externa o documentación.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Consulta de búsqueda." },
          },
          required: ["query"],
        },
      },
      execute: ({ args }) => webSearch(args),
      audit: ({ args, resultPreview }) => ({
        sources: [
          {
            type: "web",
            query: args.query,
            detail: resultPreview,
          },
        ],
      }),
    }),
    createToolDefinition({
      schema: {
        name: TOOL_NAMES.SEARCH_RAG,
        description:
          "Busca primero en la base RAG local de NestJS, TypeScript y notas del proyecto. Devuelve fragmentos recuperados con fuente, archivo, chunk y score.",
        parameters: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Consulta tecnica para recuperar contexto relevante.",
            },
            top_k: {
              type: "number",
              description: "Cantidad maxima de fragmentos a recuperar.",
            },
          },
          required: ["query"],
        },
      },
      execute: ({ args }) => searchRagTool(args, { agentConfig, searchRag }),
      audit: ({ args, resultPreview }) => ({
        sources: [
          {
            type: "RAG",
            query: args.query,
            detail: resultPreview,
          },
        ],
      }),
    }),
    createToolDefinition({
      schema: {
        name: TOOL_NAMES.READ_PROJECT_MEMORY,
        description:
          "Lee la memoria persistente del proyecto actual: arquitectura, decisiones, bugs, comandos, convenciones y resúmenes previos.",
        parameters: {
          type: "object",
          properties: {},
        },
      },
      execute: () => projectMemory.read(),
      audit: () => ({
        sources: [
          {
            type: "memory",
            detail: `Memoria persistente leida desde ${projectMemory.path}`,
          },
        ],
      }),
    }),
    createToolDefinition({
      schema: {
        name: TOOL_NAMES.UPDATE_PROJECT_MEMORY,
        description:
          "Guarda una observación persistente del proyecto para futuras sesiones del agente.",
        parameters: {
          type: "object",
          properties: {
            section: {
              type: "string",
              enum: projectMemory.sectionHandlers.map((handler) => handler.section),
              description: "Sección de memoria donde guardar la información.",
            },
            title: { type: "string", description: "Título breve de la entrada." },
            content: {
              type: "string",
              description: "Contenido concreto que debe persistir.",
            },
            source: {
              type: "string",
              description:
                "Origen de la información: repo, usuario, RAG, web, inferencia o agente.",
            },
            tags: {
              type: "array",
              items: { type: "string" },
              description: "Etiquetas para recuperar esta entrada luego.",
            },
            metadata: {
              type: "object",
              description:
                "Datos estructurados opcionales. Para architecture puede incluir stack, importantFiles y modules.",
            },
          },
          required: ["section", "content"],
        },
      },
      execute: ({ args }) => projectMemory.update(args),
    }),
  ];
}
