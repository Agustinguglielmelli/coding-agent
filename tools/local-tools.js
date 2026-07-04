import fs from "fs";
import { execSync } from "child_process";
import { dirname } from "path";
import { Tool } from "./tool-interface.js";
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

function objectParameters(properties, required = []) {
  return {
    type: "object",
    properties,
    required,
  };
}

class ReadFileTool extends Tool {
  constructor({ policies }) {
    super({
      name: TOOL_NAMES.READ_FILE,
      description: "Lee el contenido de un archivo dado su path.",
      parameters: objectParameters(
        {
          path: { type: "string", description: "Path del archivo a leer." },
        },
        ["path"]
      ),
    });
    this.policies = policies;
  }

  validate({ args }) {
    return this.policies.validateReadPath(args.path);
  }

  execute({ args }) {
    try {
      const content = fs.readFileSync(args.path, "utf-8");
      console.log(`✅ read_file("${args.path}")`);
      return content;
    } catch (err) {
      if (err.code === "ENOENT") return `Error: File not found at ${args.path}`;
      return `Error reading file ${args.path}: ${err.message}`;
    }
  }

  audit({ args }) {
    return {
      sources: [
        {
          type: "repo",
          path: args.path,
          detail: `Archivo leido: ${args.path}`,
        },
      ],
    };
  }
}

class WriteFileTool extends Tool {
  constructor({ policies }) {
    super({
      name: TOOL_NAMES.WRITE_FILE,
      description: "Escribe contenido en un archivo, reemplazando su contenido actual.",
      parameters: objectParameters(
        {
          path: { type: "string", description: "Path del archivo a escribir." },
          content: { type: "string", description: "Contenido a escribir en el archivo." },
        },
        ["path", "content"]
      ),
      supervised: true,
      disabledInPlanMode: true,
    });
    this.policies = policies;
  }

  validate({ args }) {
    return this.policies.validateWritePath(args.path);
  }

  execute({ args }) {
    try {
      fs.mkdirSync(dirname(args.path), { recursive: true });
      fs.writeFileSync(args.path, args.content, "utf-8");
      console.log(`✅ write_file("${args.path}")`);
      return `Archivo escrito exitosamente: ${args.path}`;
    } catch (err) {
      console.log(`❌ write_file error: ${err.message}`);
      return `Error writing file ${args.path}: ${err.message}`;
    }
  }

  audit({ args }) {
    return { modifiedFile: args.path };
  }
}

class RunCommandTool extends Tool {
  constructor({ policies }) {
    super({
      name: TOOL_NAMES.RUN_COMMAND,
      description: "Ejecuta un comando de terminal y devuelve el output (stdout y stderr).",
      parameters: objectParameters(
        {
          command: { type: "string", description: "Comando a ejecutar." },
        },
        ["command"]
      ),
      supervised: true,
    });
    this.policies = policies;
  }

  validate({ args }) {
    return this.policies.validateCommand(args.command);
  }

  requiresApproval({ args }) {
    return this.policies.commandRequiresApproval(args.command);
  }

  execute({ args }) {
    try {
      console.log(`✅ run_command("${args.command}")`);
      const stdout = execSync(args.command, { encoding: "utf-8", timeout: 10000 });
      return stdout || "(sin output)";
    } catch (err) {
      const output = (err.stdout || "") + (err.stderr || "");
      console.log("⚠️  run_command salió con error");
      return output || err.message;
    }
  }

  audit({ args, resultPreview }) {
    return {
      sources: [
        {
          type: "repo-command",
          command: args.command,
          detail: resultPreview,
        },
      ],
    };
  }
}

class ListFilesTool extends Tool {
  constructor({ policies }) {
    super({
      name: TOOL_NAMES.LIST_FILES,
      description: "Lista los archivos y carpetas en un directorio.",
      parameters: objectParameters(
        {
          directory: { type: "string", description: "Path del directorio a listar." },
        },
        ["directory"]
      ),
    });
    this.policies = policies;
  }

  validate({ args }) {
    return this.policies.validateReadPath(args.directory);
  }

  execute({ args }) {
    try {
      const items = fs.readdirSync(args.directory, { withFileTypes: true });
      const result = items.map((item) =>
        item.isDirectory() ? `📁 ${item.name}/` : `📄 ${item.name}`
      );
      console.log(`✅ list_files("${args.directory}") — ${result.length} items`);
      return result.join("\n");
    } catch (err) {
      console.log(`❌ list_files error: ${err.message}`);
      return `Error listing directory ${args.directory}: ${err.message}`;
    }
  }

  audit({ args }) {
    return {
      sources: [
        {
          type: "repo",
          path: args.directory,
          detail: `Directorio listado: ${args.directory}`,
        },
      ],
    };
  }
}

class WebSearchTool extends Tool {
  constructor() {
    super({
      name: TOOL_NAMES.WEB_SEARCH,
      description:
        "Busca información en la web. Usá esta tool cuando necesites información externa o documentación.",
      parameters: objectParameters(
        {
          query: { type: "string", description: "Consulta de búsqueda." },
        },
        ["query"]
      ),
    });
  }

  async execute({ args }) {
    try {
      console.log(`✅ web_search("${args.query}")`);
      const res = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: process.env.TAVILY_API_KEY,
          query: args.query,
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

  audit({ args, resultPreview }) {
    return {
      sources: [
        {
          type: "web",
          query: args.query,
          detail: resultPreview,
        },
      ],
    };
  }
}

class SearchRagTool extends Tool {
  constructor({ agentConfig, searchRag }) {
    super({
      name: TOOL_NAMES.SEARCH_RAG,
      description:
        "Busca primero en la base RAG local de NestJS, TypeScript y notas del proyecto. Devuelve fragmentos recuperados con fuente, archivo, chunk y score.",
      parameters: objectParameters(
        {
          query: {
            type: "string",
            description: "Consulta tecnica para recuperar contexto relevante.",
          },
          top_k: {
            type: "number",
            description: "Cantidad maxima de fragmentos a recuperar.",
          },
        },
        ["query"]
      ),
    });
    this.agentConfig = agentConfig;
    this.searchRag = searchRag;
  }

  execute({ args }) {
    try {
      const results = this.searchRag(args.query, this.agentConfig, { topK: args.top_k });
      console.log(`✅ search_rag("${args.query}") — ${results.length} resultados`);

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

  audit({ args, resultPreview }) {
    return {
      sources: [
        {
          type: "RAG",
          query: args.query,
          detail: resultPreview,
        },
      ],
    };
  }
}

class ReadProjectMemoryTool extends Tool {
  constructor({ projectMemory }) {
    super({
      name: TOOL_NAMES.READ_PROJECT_MEMORY,
      description:
        "Lee la memoria persistente del proyecto actual: arquitectura, decisiones, bugs, comandos, convenciones y resúmenes previos.",
      parameters: objectParameters({}),
    });
    this.projectMemory = projectMemory;
  }

  execute() {
    return this.projectMemory.read();
  }

  audit() {
    return {
      sources: [
        {
          type: "memory",
          detail: `Memoria persistente leida desde ${this.projectMemory.path}`,
        },
      ],
    };
  }
}

class UpdateProjectMemoryTool extends Tool {
  constructor({ projectMemory }) {
    super({
      name: TOOL_NAMES.UPDATE_PROJECT_MEMORY,
      description:
        "Guarda una observación persistente del proyecto para futuras sesiones del agente.",
      parameters: objectParameters(
        {
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
        ["section", "content"]
      ),
    });
    this.projectMemory = projectMemory;
  }

  execute({ args }) {
    return this.projectMemory.update(args);
  }
}

export function createLocalTools({ agentConfig, projectMemory, searchRag }) {
  const policies = createPolicyGuards(agentConfig);

  return [
    new ReadFileTool({ policies }),
    new WriteFileTool({ policies }),
    new RunCommandTool({ policies }),
    new ListFilesTool({ policies }),
    new WebSearchTool(),
    new SearchRagTool({ agentConfig, searchRag }),
    new ReadProjectMemoryTool({ projectMemory }),
    new UpdateProjectMemoryTool({ projectMemory }),
  ];
}
