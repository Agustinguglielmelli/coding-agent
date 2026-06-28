# RAG - NestJS, TypeScript y Rival Match

Esta carpeta contiene la base RAG local del agente para la fase 4 del TP final.

## Fuentes

Las fuentes iniciales estan en `rag/sources`:

- `nestjs-core.md`: patrones centrales de NestJS: modulos, controllers, providers, services y DTOs.
- `nestjs-validation-testing.md`: validacion con DTOs y testing en NestJS.
- `typescript-nestjs-conventions.md`: convenciones TypeScript utiles para proyectos NestJS.
- `rival-match-project-notes.md`: notas internas editables del proyecto Rival Match.

Cuando se analice el repositorio real de Rival Match, se pueden agregar nuevas fuentes Markdown con hallazgos del repo o documentacion especifica.

## Chunking

El chunking se configura en `agent.config.json`:

- `chunk_size`: 900 caracteres.
- `chunk_overlap`: 150 caracteres.

El chunker intenta cortar por separaciones de parrafo para evitar fragmentos partidos en lugares dificiles de interpretar.

## Embeddings

La implementacion actual usa embeddings locales por hashing de tokens normalizados:

- No requiere dependencias externas.
- Genera vectores de dimension fija.
- Permite similitud coseno para recuperar fragmentos relevantes.

Esto cumple el flujo de embeddings y almacenamiento vectorial sin usar frameworks de orquestacion. En una mejora futura se puede reemplazar el provider por embeddings de un modelo externo.

## Almacenamiento Vectorial

El vector store se guarda en:

```txt
rag/vector-store.json
```

Incluye:

- metadata de embedding
- configuracion usada
- chunks
- embedding de cada chunk
- fuente, archivo y numero de chunk

## Uso

Reconstruir el indice:

```bash
npm run rag:build
```

El agente usa la tool `search_rag` para consultar esta base antes de usar busqueda web.
