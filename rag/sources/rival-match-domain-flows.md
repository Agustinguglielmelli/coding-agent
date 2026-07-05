# Rival Match Domain Flows
Fuente: analisis local de controllers, services y schema Prisma de Rival Match
Tipo: notas internas de dominio

Este documento describe los flujos de negocio de Rival Match para que el agente no dependa solo de nombres de archivos o documentacion generica de NestJS.

## Flujo De Registro Y Autenticacion

El modulo `auth` maneja registro y login de equipos. Los inputs principales son:

- `CreateTeamInput`: datos de creacion del equipo.
- `LoginInput`: credenciales de login.

El resultado esperado del login incluye token JWT para consumir endpoints protegidos. Los guards y decorators comunes viven en `src/modules/public`.

Cuando una tarea toque autenticacion:

- Revisar `auth.controller.ts` para rutas.
- Revisar `auth.service.ts` para reglas.
- Revisar `auth.repository.ts` para persistencia.
- Revisar `public/guards` y `public/strategies` si el problema esta en autorizacion.

## Flujo De Busqueda De Rival

El modulo `rival-search` es el centro del producto.

Crear busqueda:

- Endpoint: `POST /rival-searches`.
- Input: `CreateRivalSearchInput`.
- Campos: latitude, longitude, date, expiryDate, locationString.
- El `teamId` no viene en el body; se obtiene con `@GetTeamId()`.

Consultar mis busquedas:

- Endpoint: `GET /rival-searches`.
- Usa paginacion con `GetPaginatedInput`.

Consultar resultados compatibles:

- Endpoint: `GET /rival-searches/:rivalSearchId/results`.
- El service toma una busqueda de referencia y busca rivales compatibles por fecha, deporte y cantidad de jugadores.

Aceptar rival:

- Endpoint: `POST /rival-searches/:rivalSearchId/accept`.
- Input: `AcceptRivalSearchInput`.
- El body contiene `acceptedRivalSearchId`.
- El service valida ids, ownership, compatibilidad y estado.
- Puede crear o actualizar un `Match`.

Rechazar rival:

- Endpoint: `POST /rival-searches/:rivalSearchId/reject`.
- Input: `RejectRivalSearchInput`.
- Registra relacion de rechazo y puede cancelar match existente.

Cancelar busqueda/match:

- Endpoint: `POST /rival-searches/:rivalSearchId/cancelSearch`.
- Input: `CancelSearchInput`.
- Usa `opponentRivalSearchId` para identificar el match/busqueda rival.

## Flujo De Match

Un `Match` no es simplemente un endpoint de creacion directo. En el flujo actual se crea o actualiza principalmente desde `rival-search.service.ts` cuando un equipo acepta una busqueda rival.

El modulo `match` se usa para consultar partidos y encapsular operaciones sobre matches:

- `match.controller.ts`: expone `GET /matches`.
- `match.service.ts`: arma DTOs para el equipo autenticado.
- `match.repository.ts`: queries Prisma sobre `Match`.

Un match une dos RivalSearch:

- `rivalSearchAId`
- `rivalSearchBId`
- `acceptedA`
- `acceptedB`
- `status`
- `matchDate`

Si la tarea pide "crear partido", revisar primero si en realidad corresponde modificar el flujo de aceptar rival en `rival-search.service.ts`.

Si la tarea pide "cancelar partido", revisar:

- `rival-search.service.ts`
- `match.repository.ts`
- `MatchStatus.CANCELLED`
- `findMatch`, `findMatchById` y `cancelMatch`

## Flujo De Chat

El modulo `chat` permite crear o encontrar salas, listar mensajes y enviar mensajes. Tambien tiene websocket gateway.

Archivos clave:

- `chat.controller.ts`
- `chat.service.ts`
- `chat.repository.ts`
- `chat.gateway.ts`
- inputs en `src/modules/chat/input`

Si la tarea pide cambios de websocket o eventos, revisar `chat.gateway.ts`. Si pide endpoints REST, revisar `chat.controller.ts`.

## Flujo De Historial

El modulo `history` gestiona resultados de partidos.

Archivos clave:

- `history.controller.ts`
- `history.service.ts`
- `history.repository.ts`
- `CreateMatchResultInput`
- DTOs en `history.result.ts`

Si la tarea pide estadisticas, victorias/derrotas, historial o score, empezar por `history.service.ts`.

## Consultas Tipicas Para RAG

Consultas utiles para que el agente recupere este documento:

- "Rival Match aceptar rival"
- "cancelar partido por id Rival Match"
- "crear busqueda de rival"
- "flujo de match rival search"
- "acceptedRivalSearchId"
- "CreateRivalSearchInput date locationString"
- "MatchStatus CANCELLED"
