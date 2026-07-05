import { read_file, write_file, list_files } from "./fileTools.js";
import { run_command } from "./commandTools.js";
import { web_search } from "./webTools.js";
import { search_rag } from "./ragTool.js";
import { read_project_memory, update_project_memory } from "../memory.js";
import { loadPlugins } from "./plugin-loader.js";
import { agentConfig } from "../config.js";
// ============================================================
// SCHEMAS — tools base (hardcodeadas)
// ============================================================

const baseTools = [
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
  {
    type: "function",
    function: {
      name: "search_rag",
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
  },
  {
    type: "function",
    function: {
      name: "read_project_memory",
      description:
          "Lee la memoria persistente del proyecto actual: arquitectura, decisiones, bugs, comandos, convenciones y resúmenes previos.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_project_memory",
      description:
          "Guarda una observación persistente del proyecto para futuras sesiones del agente.",
      parameters: {
        type: "object",
        properties: {
          section: {
            type: "string",
            enum: [
              "architecture",
              "dependency",
              "command",
              "convention",
              "decision",
              "bug",
              "session_summary",
              "useful_finding",
            ],
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
  },
];

// Funciones base
const baseToolFunctions = {
  read_file: (args) => read_file(args.path),
  write_file,
  run_command,
  list_files,
  web_search,
  search_rag,
  read_project_memory,
  update_project_memory,
};

// ============================================================
// CARGA DE PLUGINS — auto-discovery
// ============================================================

const pluginInstances = await loadPlugins(agentConfig);

// Agregar schemas de plugins al array de tools
for (const plugin of pluginInstances) {
  baseTools.push(plugin.toOpenAITool());
}

// Agregar funciones de plugins al mapa
const pluginFunctions = Object.fromEntries(
    pluginInstances.map((plugin) => [
      plugin.name,
      (args) => plugin.execute({ args }),
    ])
);

// ============================================================
// EXPORTS — tools y funciones unificadas (base + plugins)
// ============================================================

export const tools = baseTools;

export const toolFunctions = {
  ...baseToolFunctions,
  ...pluginFunctions,
};