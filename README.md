# Coding Agent Avanzado - TP Final

Agente de codigo construido sin frameworks de orquestacion. El caso de uso elegido es asistir tareas sobre un proyecto objetivo llamado **Rival Match**, dentro del ecosistema **NestJS + TypeScript**.

## Estado Por Fases

- Fase 0 - Decisiones de grupo: ecosistema definido en `agent.config.json` como NestJS + TypeScript y caso de uso Rival Match.
- Fase 1 - Base del TP anterior: `agent.js` mantiene harness interactivo, tools locales, supervision y plan mode.
- Fase 2 - Configuracion y politicas: `agent.config.json` define workspace, memoria, RAG y politicas de lectura, escritura, comandos prohibidos y aprobacion requerida.
- Fase 3 - Memoria persistente: `memory/projects/rival-match.json` guarda arquitectura, dependencias, comandos, convenciones, decisiones, bugs y resumenes.
- Fase 4 - RAG: `src/rag.js`, `scripts/build-rag.js`, `rag/sources/*` y `rag/vector-store.json` implementan chunking, embeddings locales por hashing, almacenamiento vectorial y recuperacion por similitud coseno.
- Fase 5 - Arquitectura multi-agente: `agent.js` incorpora un agente principal que coordina Explorer, Researcher, Implementer, Tester y Reviewer mediante estado compartido.
- Fase 6 - Observabilidad: pendiente de integrar con Langfuse u otra herramienta equivalente.
- Fase 7 - Pruebas del caso de uso: pendiente documentar ejecuciones completas con RAG, memoria, cambio de estrategia y observabilidad.
- Fase 8 - Entregables: pendiente completar evidencias, capturas y reflexion final.

## Instalacion

```bash
npm install
```

Variables esperadas en `.env`:

```bash
GEMINI_API_KEY=...
TAVILY_API_KEY=...
AGENT_WORKSPACE=../rivalmatch-back # opcional; sobreescribe agent.config.json
```

El workspace del proyecto objetivo también puede configurarse en `agent.config.json`.
Las tools de archivos y comandos resuelven paths relativos contra ese workspace.

## Uso

Iniciar el agente interactivo:

```bash
node agent.js
```

Comandos interactivos:

```txt
supervision on
supervision off
plan on
plan off
/multiagent <tarea>
exit
```

Ejemplo multi-agente:

```txt
/multiagent Analizar la arquitectura del repo y proponer comandos de verificacion para Rival Match
```

## Estructura

- `agent.js`: carga configuracion, coordina el loop conversacional, plan mode y arquitectura multi-agente.
- `tools/tool-interface.js`: interfaz comun de tools, matching, validacion de registry y ejecucion.
- `tools/local-tools.js`: implementaciones concretas de tools locales, RAG, web search y memoria.
- `tools/policies.js`: matching de politicas de lectura, escritura, comandos prohibidos y aprobacion.
- `project-memory/index.js`: memoria persistente, schema base y handlers extensibles por seccion.
- `src/rag.js`: chunking, embeddings locales, almacenamiento vectorial y busqueda por similitud.

## Arquitectura Multi-Agente

El agente principal recibe la tarea, crea un estado compartido y ejecuta los subagentes en orden:

- Explorer: entiende estructura, arquitectura, dependencias, convenciones y archivos relevantes.
- Researcher: consulta memoria y RAG primero; usa web search solo como fallback.
- Implementer: propone o realiza cambios de codigo segun los hallazgos compartidos por Explorer y Researcher. No lee memoria ni consulta RAG.
- Tester: valida con tests, build, lint, logs u otros checks usando el estado compartido. No lee memoria ni consulta RAG.
- Reviewer: revisa diff o cambios y verifica que respondan al pedido.

Cada subagente tiene una lista limitada de tools. El estado compartido registra:

- pedido original
- progreso
- resultados por subagente
- fuentes consultadas: repo, memoria, RAG, web o comandos
- archivos modificados
- observaciones relevantes
- acciones repetidas detectadas

Al finalizar una ejecucion multi-agente, el agente guarda un resumen en la memoria persistente del proyecto.

Para agregar agentes o ajustar permisos, editar `SUBAGENT_DEFINITIONS` en `agent.js`. Los permisos reutilizables estan en `TOOL_ACCESS_GROUPS`, definidos en `tools/local-tools.js`, y `validateToolRegistry()` falla al iniciar si un subagente referencia una tool inexistente.

Para agregar una tool nueva, crear una clase en `tools/local-tools.js` que extienda `Tool` e implemente, como minimo, `matches(toolCall)`, `validate(toolCall)` y `execute(toolCall)`. La clase tambien puede sobrescribir `requiresApproval(toolCall)` y `audit(...)`, o activar `supervised` / `disabledInPlanMode` en el constructor. El agente principal y los subagentes ejecutan tools a traves de `ToolRegistry` en `tools/tool-interface.js`, por lo que no hace falta agregar `if (toolName === "...")` en `agent.js`.

La memoria persistente vive en `project-memory/index.js`. Para agregar una nueva seccion o cambiar como se actualiza una clave de memoria, agregar un handler en `createProjectMemoryHandlers()`. Cada handler define `section`, `matches` y `update`, evitando un switch gigante en el agente.

## RAG

Reconstruir el indice:

```bash
npm run rag:build
```

El vector store queda en:

```txt
rag/vector-store.json
```

La tool `search_rag` devuelve fragmentos con titulo, fuente, archivo, chunk y score. El flujo esperado es consultar primero RAG y usar busqueda web solo cuando no haya evidencia suficiente.

## Checks

```bash
node --check agent.js
node --check src/rag.js
npm run rag:build
npm test
```

Nota: `npm test` usa Tavily y requiere red disponible.
