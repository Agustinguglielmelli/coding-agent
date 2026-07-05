# Rival Match Project Notes
Fuente: analisis local del repositorio /Users/pedrodelaguila/faculty/ia/rivalmatch-back
Tipo: notas internas del proyecto

Este documento es la fuente RAG principal de conocimiento especifico de Rival Match. Debe usarse junto con el codigo real del repositorio. Si estas notas contradicen el codigo, el codigo tiene prioridad.

## Caso De Uso

Rival Match es una API backend para conectar equipos deportivos que buscan rivales para jugar partidos. Un equipo se registra, configura su perfil deportivo, crea una busqueda de rival con fecha y ubicacion, revisa candidatos compatibles, acepta o rechaza rivales, genera partidos, conversa por chat y carga resultados historicos.

El objetivo del agente en este proyecto es poder modificar funcionalidades del backend NestJS de forma acotada y verificable: endpoints, validaciones, reglas de negocio, repositories, DTOs, tests y comandos de validacion.

## Stack Tecnico

- NestJS con TypeScript.
- Prisma ORM.
- PostgreSQL.
- JWT y Passport para autenticacion.
- class-validator y class-transformer para validacion de inputs.
- Jest para tests unitarios y e2e.
- Socket.IO para chat en tiempo real.
- Docker Compose para base de datos de integracion.

## Estructura Principal

El codigo de dominio vive en `src/modules`.

- `auth`: registro, login, hashing de password y emision de JWT.
- `team`: consulta y actualizacion del perfil de equipo.
- `rival-search`: modulo central del dominio; crea busquedas de rival, lista resultados compatibles, acepta, rechaza y cancela busquedas.
- `match`: consulta partidos y encapsula persistencia de partidos.
- `history`: carga resultados de partidos y calcula historial/estadisticas.
- `chat`: salas, mensajes y websocket.
- `database`: `PrismaService`.
- `public`: guards, decorators, DTOs comunes, estrategias JWT y paginacion.
- `common`: utilidades compartidas como cantidad de jugadores permitida.

## Modelo De Dominio

Entidades Prisma principales:

- `Team`: equipo registrado. Tiene email, password, deporte, rango de edad, nivel, genero y cantidad de jugadores.
- `RivalSearch`: busqueda activa de un equipo para encontrar rival. Incluye latitude, longitude, date, expiryDate, status, teamId y locationString.
- `RejectedRivalSearch`: relacion entre una busqueda que rechaza y una busqueda rechazada.
- `Match`: partido entre dos RivalSearch. Tiene rivalSearchAId, rivalSearchBId, acceptedA, acceptedB, status y matchDate.
- `ChatRoom`, `ChatRoomParticipant`, `Message`: chat entre equipos.
- `MatchResult`: resultado cargado por equipo para un partido.

Enums importantes:

- `Sport`: FOOTBALL, TENNIS, PADEL, VOLLEY.
- `RivalSearchStatus`: ONGOING, EXPIRED, MATCHED.
- `MatchStatus`: PENDING, CONFIRMED, CANCELLED.

## Flujo Funcional Principal

1. Un equipo se registra en `auth`.
2. El equipo configura perfil deportivo en `team`.
3. El equipo crea una `RivalSearch` con fecha, ubicacion y vencimiento.
4. El modulo `rival-search` busca candidatos compatibles.
5. El equipo puede rechazar candidatos para que no vuelvan a aparecer.
6. El equipo puede aceptar una busqueda rival.
7. Si existe match pendiente, se actualiza aceptacion; si no existe, se crea.
8. Cuando ambas partes aceptan, el match puede pasar a confirmado segun la regla del servicio.
9. Los equipos pueden chatear.
10. Luego se cargan resultados en `history`.

## Convenciones Del Repo

- Inputs de request viven en carpetas `input/`.
- DTOs de respuesta viven en carpetas `dto/`.
- Controllers son delgados y delegan a services.
- Services contienen reglas de negocio y coordinan repositories.
- Repositories encapsulan acceso Prisma.
- Interfaces de repositories viven en `repository/*.interface.ts`.
- Controllers usan `ValidationPipe({ transform: true })` en body/query.
- En `main.ts` tambien existe validacion global con `ValidationPipe`.
- Para fechas en inputs se usa `@Type(() => Date)` junto con `@IsDate()`.
- Para UUIDs se usa `@IsUUID()`.
- Para campos requeridos se usa `@IsNotEmpty()` cuando el repo necesita rechazar explicitamente valores faltantes.
- Antes de crear abstracciones nuevas, revisar archivos vecinos y seguir el patron existente.

## Archivos Clave Por Modulo

### Auth

- `src/modules/auth/controller/auth.controller.ts`
- `src/modules/auth/service/auth.service.ts`
- `src/modules/auth/repository/auth.repository.ts`
- `src/modules/auth/input/create-team.input.ts`
- `src/modules/auth/input/login.input.ts`

### Team

- `src/modules/team/controller/team.controller.ts`
- `src/modules/team/service/team.service.ts`
- `src/modules/team/repository/team.repository.ts`
- `src/modules/team/input/update-team.input.ts`

### Rival Search

- `src/modules/rival-search/controller/rival-search.controller.ts`
- `src/modules/rival-search/service/rival-search.service.ts`
- `src/modules/rival-search/repository/rival-search.repository.ts`
- `src/modules/rival-search/input/create-rivalsearch.input.ts`
- `src/modules/rival-search/input/accept-rivalsearch.input.ts`
- `src/modules/rival-search/input/reject-rivalsearch.input.ts`
- `src/modules/rival-search/input/cancel-rivalsearch.input.ts`

### Match

- `src/modules/match/controller/match.controller.ts`
- `src/modules/match/service/match.service.ts`
- `src/modules/match/repository/match.repository.ts`
- `src/modules/match/repository/match.repository.interface.ts`
- `src/modules/match/dto/rival-search.match.ts`

### History

- `src/modules/history/controller/history.controller.ts`
- `src/modules/history/service/history.service.ts`
- `src/modules/history/repository/history.repository.ts`
- `src/modules/history/input/CreateMatchResultInput.ts`
- `src/modules/history/dto/history.result.ts`

### Chat

- `src/modules/chat/controller/chat.controller.ts`
- `src/modules/chat/service/chat.service.ts`
- `src/modules/chat/repository/chat.repository.ts`
- `src/modules/chat/gateways/chat.gateway.ts`
- `src/modules/chat/input/send-message.input.ts`
- `src/modules/chat/input/get-messages.input.ts`

## Guia Para El Agente

- Si la tarea habla de validacion de request, revisar primero `input/` y `ValidationPipe`.
- Si la tarea habla de response shape, revisar `dto/`.
- Si la tarea habla de endpoints, revisar `controller` y luego `service`.
- Si la tarea habla de reglas de negocio, revisar `service`.
- Si la tarea habla de queries o persistencia, revisar `repository` y `prisma/schema.prisma`.
- Si la tarea habla de aceptar, rechazar o cancelar rivales, revisar `rival-search.service.ts`.
- Si la tarea habla de partidos ya creados, revisar `match.service.ts` y `match.repository.ts`.
- Si la tarea habla de resultados historicos, revisar `history`.
- Si la tarea habla de mensajes o salas, revisar `chat`.

## Comandos Confirmados

- `npm run test`: corre tests unitarios. En la prueba multiagente paso con 4 suites y 49 tests.
- `npm run test:e2e`: levanta base de integracion, corre migraciones y ejecuta e2e.
- `npm run build`: compila el proyecto NestJS.
- `npm run lint`: ejecuta ESLint con `--fix`; puede modificar archivos automaticamente. Usarlo con cuidado y revisar diff.
- `npm run db:generate`: genera Prisma Client.
- `npm run db:migrate`: corre migraciones de desarrollo.
- `npm run db:apply`: aplica migraciones.

## Riesgos Y Cuidados

- No modificar `.env`.
- No modificar `package-lock.json` salvo que la tarea sea especificamente de dependencias.
- Si se corre `npm run lint`, revisar si aplico fixes automaticos en archivos no relacionados.
- Para e2e se necesita Docker y `.env.test`.
- El repo usa Prisma; cambios en `schema.prisma` normalmente requieren migracion.
- El README actual del backend es casi el starter de NestJS, por lo que para contexto del agente conviene priorizar estas notas internas.
