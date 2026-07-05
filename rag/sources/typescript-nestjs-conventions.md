# TypeScript Conventions For NestJS
Fuente: https://www.typescriptlang.org/docs/ y practicas comunes de NestJS
Tipo: documentacion tecnica resumida

En proyectos NestJS con TypeScript conviene preservar tipos explicitos en bordes publicos: DTOs, returns de services cuando aportan claridad, interfaces de repositorios, y contratos entre modulos. El agente debe mirar las convenciones existentes antes de imponer una nueva.

Los imports deberian respetar el estilo del repo: paths relativos, alias de `tsconfig`, ordenamiento y convenciones de nombres. Antes de editar, conviene revisar archivos vecinos para imitar estructura y estilo.

Para cambios chicos, es preferible modificar archivos existentes antes de crear abstracciones nuevas. Para cambios de feature, se puede crear modulo, controller, service, DTOs y spec si el repo ya sigue ese patron.

Cuando una funcion toca datos externos, requests HTTP, base de datos o autenticacion, el agente debe ser conservador: revisar guards, pipes, interceptors y providers existentes antes de cambiar comportamiento.

## Convenciones Practicas Para Rival Match

- Mantener nombres existentes aunque tengan mezcla de `RivalSearch`, `rivalsearch` y `match`.
- Preferir cambios minimos y localizados.
- No renombrar archivos o clases salvo que la tarea lo pida.
- Mantener imports relativos como en archivos vecinos.
- En inputs, agregar validadores sin quitar los existentes.
- En services, preservar excepciones NestJS existentes como `BadRequestException`, `NotFoundException` y `ConflictException`.
- En repositories Prisma, mantener queries cerca de las operaciones existentes.

Si una tarea menciona "equipo rival" en contexto de Rival Match, puede referirse a `acceptedRivalSearchId`, `rejectedRivalSearchId`, `opponentRivalSearchId`, `rivalSearchAId`, `rivalSearchBId` o `rivalTeamId`. El agente debe revisar el flujo antes de asumir un nombre generico como `rivalTeamId`.
