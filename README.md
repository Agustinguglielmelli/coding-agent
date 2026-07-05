# Coding Agent Avanzado - TP Final

Agente de codigo construido en Node.js, sin frameworks de orquestacion. El caso de uso elegido para el TP final es asistir tareas sobre un proyecto objetivo llamado **Rival Match**, dentro del ecosistema **NestJS + TypeScript**.

El agente puede:

- conversar por terminal usando un LLM;
- leer, listar y escribir archivos del workspace objetivo;
- ejecutar comandos locales con politicas de seguridad;
- consultar memoria persistente del proyecto;
- recuperar contexto desde una base RAG local;
- hacer busqueda web como fallback;
- trabajar en modo agente unico o en modo multiagente con Explorer, Researcher, Implementer, Tester y Reviewer;
- registrar trazas de observabilidad con Langfuse/OpenTelemetry.

## Requisitos

- Node.js 18 o superior.
- npm.
- Una API key de OpenAI o Gemini.
- Opcional: una API key de Tavily para habilitar busqueda web.
- Opcional: credenciales de Langfuse si se quieren visualizar trazas de observabilidad.
- Opcional: el repositorio objetivo `rivalmatch-back` ubicado al lado de este repo, o cualquier otro path configurado como workspace.

## Instalacion

Desde la raiz del repositorio:

```bash
npm install
```

El proyecto usa `package-lock.json`, por eso se recomienda `npm install` o `npm ci` si se quiere instalar exactamente lo bloqueado.

## Configuracion

### 1. Crear archivo `.env`

Crear un archivo `.env` en la raiz del repo. No se debe commitear este archivo porque contiene secretos.

Configuracion minima con OpenAI:

```bash
OPENAI_API_KEY=tu_api_key
OPENAI_MODEL=gpt-4.1-mini
```

Configuracion minima con Gemini usando la API compatible con OpenAI:

```bash
LLM_PROVIDER=gemini
GEMINI_API_KEY=tu_api_key
GEMINI_MODEL=models/gemini-2.5-flash
```

Variables opcionales:

```bash
TAVILY_API_KEY=tu_api_key
AGENT_WORKSPACE=../rivalmatch-back
```

Observabilidad con Langfuse, opcional:

```bash
LANGFUSE_PUBLIC_KEY=tu_public_key
LANGFUSE_SECRET_KEY=tu_secret_key
LANGFUSE_HOST=https://cloud.langfuse.com
```

Notas importantes:

- Si `LLM_PROVIDER` no esta definido y existe `OPENAI_API_KEY`, el agente usa OpenAI.
- Si `LLM_PROVIDER` no esta definido y no existe `OPENAI_API_KEY`, el agente intenta usar Gemini.
- `TAVILY_API_KEY` solo es necesaria cuando el agente usa la tool `web_search`.
- `AGENT_WORKSPACE` sobreescribe el workspace definido en `agent.config.json`.

### 2. Revisar `agent.config.json`

La configuracion principal del agente esta en:

```txt
agent.config.json
```

Campos principales:

- `project`: nombre, ecosistema y descripcion del proyecto objetivo.
- `workspace`: path del repo objetivo. Por defecto apunta a `../rivalmatch-back`.
- `memory.project_file`: archivo donde se guarda la memoria persistente.
- `rag`: ubicacion de fuentes, vector store, chunking y cantidad de resultados.
- `permissions`: politicas de lectura, escritura y comandos.
- `plugins`: plugins habilitados o deshabilitados.

Ejemplo de workspace:

```json
{
  "workspace": "../rivalmatch-back"
}
```

Todos los paths relativos que usa el agente en tools como `read_file`, `write_file`, `list_files` y `run_command` se resuelven contra ese workspace objetivo, no necesariamente contra este repositorio.

## Ejecucion

Para iniciar el agente:

```bash
npm start
```

Comando equivalente:

```bash
node agent.js
```

Al arrancar, la terminal muestra:

- proyecto configurado;
- workspace objetivo;
- archivo de memoria persistente;
- estado de supervision;
- estado de plan mode;
- estado del modo multiagente.

Para salir:

```txt
exit
```

## Comandos interactivos

Dentro del prompt del agente se pueden usar estos comandos:

```txt
supervision on
supervision off
plan on
plan off
multiagente on
multiagente off
exit
```

### Supervision

La supervision esta activada por defecto. Cuando esta activa, el agente pide confirmacion antes de ejecutar tools sensibles como:

- `write_file`
- `run_command`

Ejemplo:

```txt
supervision on
```

Para desactivarla:

```txt
supervision off
```

### Plan mode

El plan mode esta activado por defecto. Antes de ejecutar una tarea, el agente genera un plan y pide aprobacion:

```txt
plan on
```

Opciones al aprobar el plan:

- `s`: ejecutar el plan.
- `n`: cancelar la tarea.
- `m`: pedir una modificacion del plan.

En plan mode la tool `write_file` queda deshabilitada durante la generacion del plan.

### Modo multiagente

Para activar la ejecucion multiagente:

```txt
multiagente on
```

Para volver al agente unico:

```txt
multiagente off
```

En modo multiagente, cada tarea pasa por esta cadena:

1. `Explorer`: explora estructura, archivos relevantes y contexto del repo.
2. `Researcher`: consulta memoria, RAG y, si hace falta, web.
3. `Implementer`: aplica cambios o propone la implementacion.
4. `Tester`: valida con comandos, tests, build o checks disponibles.
5. `Reviewer`: revisa el resultado final y el diff.

Ejemplo:

```txt
multiagente on
Analizar la arquitectura del backend y proponer los comandos de verificacion mas importantes.
```

## Ejemplos de uso

Consulta informativa:

```txt
Explicame como esta organizado el modulo de usuarios y que archivos deberia revisar.
```

Tarea de implementacion:

```txt
Agregar validacion al DTO de creacion de partidos y correr los checks disponibles.
```

Uso con RAG:

```txt
Segun la base RAG local, que convenciones de NestJS deberia respetar para agregar un nuevo service?
```

Uso con memoria persistente:

```txt
Lee la memoria del proyecto y resumime decisiones tecnicas importantes antes de tocar codigo.
```

## RAG local

La base RAG local combina documentacion tecnica y notas del proyecto Rival Match.

Fuentes:

```txt
rag/sources/
```

Vector store generado:

```txt
rag/vector-store.json
```

Para reconstruir el indice:

```bash
npm run rag:build
```

El indice usa:

- chunking configurable desde `agent.config.json`;
- embeddings locales por hashing;
- similitud coseno para recuperar fragmentos relevantes;
- metadata de fuente, archivo, chunk y score.

El flujo esperado es:

1. Consultar memoria persistente cuando la tarea sea del proyecto.
2. Consultar RAG para dudas tecnicas o de dominio.
3. Usar web search solo si memoria y RAG no alcanzan.

Mas detalle en:

```txt
rag/README.md
```

## Memoria persistente

La memoria persistente guarda informacion reutilizable entre sesiones:

```txt
memory/projects/rival-match.json
```

Secciones principales:

- arquitectura;
- dependencias;
- comandos utiles;
- convenciones;
- decisiones;
- bugs;
- resumenes de sesiones;
- hallazgos utiles.

El agente puede leerla con `read_project_memory` y actualizarla con `update_project_memory`.

En modo multiagente, al terminar una tarea se guarda un resumen de sesion cuando corresponde.

## Estado compartido por tarea

Ademas de la memoria persistente, cada tarea multiagente genera un estado puntual con:

- pedido original;
- resultados por subagente;
- fuentes consultadas;
- archivos modificados;
- observaciones;
- estado final.

Esos snapshots se guardan en:

```txt
memory/tasks/
```

Esta carpeta sirve como evidencia y debugging de ejecuciones multiagente.

## Politicas de seguridad

Las politicas viven en `agent.config.json`.

Lectura bloqueada por defecto:

- `.env`
- `.env.*`
- `**/*.pem`
- `secrets/**`
- `node_modules/**`

Escritura bloqueada por defecto:

- `.env`
- `.env.*`
- `**/*.pem`
- `secrets/**`
- `.github/**`
- `package-lock.json`
- `node_modules/**`

Comandos bloqueados por defecto:

- `rm -rf`
- `git push`
- `sudo`
- `chmod 777`

Comandos que requieren aprobacion por politica:

- `npm install`
- `pnpm install`
- `yarn install`
- `pip install`
- `git commit`

Ademas, si `supervision` esta activada, `write_file` y `run_command` siempre piden confirmacion.

## Estructura del proyecto

```txt
.
|-- agent.js
|-- agent.config.json
|-- package.json
|-- src/
|   |-- agentLoop.js
|   |-- cli.js
|   |-- config.js
|   |-- llmClient.js
|   |-- memory.js
|   |-- observability.js
|   |-- orchestrator.js
|   |-- policies.js
|   |-- rag.js
|   |-- router.js
|   |-- settings.js
|   |-- taskState.js
|   |-- workspace.js
|   |-- agents/
|   `-- tools/
|-- rag/
|   |-- README.md
|   |-- sources/
|   `-- vector-store.json
|-- scripts/
|   `-- build-rag.js
`-- memory/
    |-- projects/
    `-- tasks/
```

Archivos clave:

- `agent.js`: punto de entrada; inicia observabilidad y ejecuta la CLI.
- `src/cli.js`: loop interactivo, comandos de control, plan mode y modo multiagente.
- `src/agentLoop.js`: loop generico de llamada al LLM, ejecucion de tools, supervision y deteccion de loops.
- `src/orchestrator.js`: coordina la arquitectura multiagente.
- `src/agents/`: definicion de Explorer, Researcher, Implementer, Tester y Reviewer.
- `src/tools/`: tools de archivos, comandos, RAG, web search y plugins.
- `src/memory.js`: memoria persistente por proyecto.
- `src/rag.js`: chunking, embeddings locales, vector store y busqueda.
- `src/policies.js`: validacion de politicas de lectura, escritura y comandos.
- `src/workspace.js`: resolucion del workspace objetivo.

## Arquitectura multiagente

El orquestador crea un estado compartido por tarea y ejecuta subagentes con responsabilidades separadas.

Flujo general:

1. Explorer analiza el repositorio.
2. Researcher busca informacion en memoria, RAG y web si hace falta.
3. Router clasifica si la tarea es informativa o requiere cambios.
4. Implementer modifica archivos si corresponde.
5. Tester valida los cambios.
6. Reviewer revisa el resultado.
7. El orquestador guarda evidencia y resumen.

El objetivo de esta separacion es evitar que todos los agentes tengan todos los permisos. Por ejemplo, Implementer recibe contexto ya procesado y no necesita consultar RAG directamente; Tester se enfoca en validacion; Reviewer revisa el resultado.

## Observabilidad

El proyecto inicializa OpenTelemetry y Langfuse desde `agent.js`:

```js
startObservability();
```

Se registran observaciones para:

- tareas multiagente;
- ejecucion de subagentes;
- llamadas a tools;
- errores en tools;
- cantidad de fuentes, archivos modificados y observaciones.

Si no se configuran credenciales de Langfuse, el agente puede ejecutarse igual, pero no se visualizaran trazas en el dashboard externo.

## Verificacion

Checks utiles para validar que el proyecto carga correctamente:

```bash
node --check agent.js
node --check src/cli.js
node --check src/agentLoop.js
node --check src/orchestrator.js
npm run rag:build
```

El proyecto no define actualmente un script `test` en `package.json`. Si se agregan tests, se recomienda sumar:

```json
{
  "scripts": {
    "test": "..."
  }
}
```

## Troubleshooting

### El agente intenta usar Gemini aunque quiero OpenAI

Definir explicitamente:

```bash
LLM_PROVIDER=openai
OPENAI_API_KEY=tu_api_key
```

### El agente no encuentra el repo objetivo

Revisar `AGENT_WORKSPACE` o `workspace` en `agent.config.json`.

Ejemplo:

```bash
AGENT_WORKSPACE=/ruta/absoluta/al/rivalmatch-back
```

### La busqueda web falla

Verificar que exista:

```bash
TAVILY_API_KEY=tu_api_key
```

Si no se necesita web search, se puede trabajar solo con memoria, repo y RAG local.

### El RAG devuelve resultados viejos

Reconstruir el indice:

```bash
npm run rag:build
```

Tambien revisar y actualizar los archivos en:

```txt
rag/sources/
```

### Una tool fue bloqueada por politica

Revisar la seccion `permissions` de `agent.config.json`. Las politicas estan pensadas para evitar lectura/escritura de secretos, cambios peligrosos y comandos destructivos.

### El agente pide muchas confirmaciones

La supervision esta activada. Se puede desactivar en la sesion:

```txt
supervision off
```

Para una entrega o demo se recomienda dejarla activada, porque muestra control humano sobre acciones sensibles.

## Entregables cubiertos por este README

Este README documenta:

- instalacion del proyecto;
- configuracion de variables de entorno;
- configuracion del workspace objetivo;
- ejecucion del agente;
- comandos interactivos;
- modo agente unico y multiagente;
- uso de memoria persistente;
- uso de RAG;
- politicas de seguridad;
- observabilidad;
- estructura del repositorio;
- comandos de verificacion;
- problemas comunes y soluciones.
