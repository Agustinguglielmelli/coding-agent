# RAG - NestJS, TypeScript y Rival Match

Esta carpeta contiene la base RAG local del agente para las fases 4 y 5 del TP final. Combina documentacion tecnica de NestJS/TypeScript con notas especificas del proyecto Rival Match para que los subagentes puedan recuperar contexto antes de decidir o modificar codigo.

## Fuentes

Las fuentes iniciales estan en `rag/sources`:

- `nestjs-core.md`: patrones centrales de NestJS: modulos, controllers, providers, services y DTOs.
- `nestjs-controller-service-repository.md`: separacion controller/service/repository y criterio para aplicar esa arquitectura.
- `nestjs-validation-testing.md`: validacion con DTOs y testing en NestJS.
- `typescript-nestjs-conventions.md`: convenciones TypeScript utiles para proyectos NestJS.
- `rival-match-project-notes.md`: mapa general del dominio Rival Match, stack, modulos, modelos, convenciones y archivos clave.
- `rival-match-domain-flows.md`: flujos funcionales del producto: registro, busqueda de rivales, aceptacion/rechazo, match, chat e historial.
- `rival-match-testing-and-commands.md`: comandos reales del backend, estrategia de validacion y advertencias sobre lint/test.

Las fuentes de Rival Match deben actualizarse cuando cambie el repo o cuando una prueba revele que el agente no recupera suficiente contexto de dominio.

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

## Criterio De Uso En Modo Multiagente

- Explorer puede usar RAG para confirmar convenciones de NestJS o ubicar conocimiento previo del proyecto.
- Researcher debe consultar primero RAG y usar web como fallback si no hay evidencia suficiente.
- Implementer recibe el contexto resumido por Explorer y Researcher, por lo que el contenido de estas fuentes influye directamente en la precision de los cambios.
- El summary final del orquestador muestra las fuentes recuperadas para usarlo como evidencia del entregable.
