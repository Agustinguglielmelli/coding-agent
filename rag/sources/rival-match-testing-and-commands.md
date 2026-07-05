# Rival Match Testing And Commands
Fuente: package.json y pruebas ejecutadas sobre /Users/pedrodelaguila/faculty/ia/rivalmatch-back
Tipo: notas internas de comandos y validacion

Este documento resume comandos reales del backend Rival Match y criterios para que el agente elija checks adecuados.

## Comandos De Desarrollo

- `npm install`: instala dependencias.
- `npm run start`: inicia NestJS.
- `npm run start:dev`: inicia NestJS en watch mode.
- `npm run start:prod`: ejecuta `dist/main`.
- `npm run build`: compila con Nest CLI.

## Comandos De Base De Datos

- `npm run db:generate`: ejecuta `npx prisma generate`.
- `npm run db:migrate`: ejecuta `npx prisma migrate dev`.
- `npm run db:apply`: ejecuta `npx prisma migrate deploy`.
- `npm run db:dev`: genera cliente Prisma y aplica migraciones.

## Comandos De Testing

- `npm run test`: corre Jest unitario.
- `npm run test:watch`: modo watch; no conviene usarlo desde el agente porque puede quedar abierto.
- `npm run test:cov`: coverage.
- `npm run test:e2e`: levanta base de integracion con Docker Compose, aplica migraciones y corre Jest e2e.

En la prueba multiagente de validacion con class-validator, `npm run test` paso correctamente:

- 4 test suites passed.
- 49 tests passed.

## Comando De Lint

`npm run lint` ejecuta:

```bash
eslint "{src,apps,libs,test}/**/*.ts" --fix
```

Importante: usa `--fix`, por lo que puede modificar archivos no relacionados. Si el agente corre lint, debe revisar `git diff` despues y no mezclar fixes automaticos con el cambio principal.

En una prueba previa, lint cambio `let` por `const` en tests e2e no relacionados. Ese tipo de cambio debe revertirse o mencionarse como ruido del check.

## Estrategia De Validacion Para El Agente

- Para cambios pequenos en inputs, DTOs o services, empezar con `npm run test`.
- Para cambios de tipos o build, usar `npm run build`.
- Para cambios de endpoints HTTP, considerar `npm run test:e2e` si Docker y `.env.test` estan disponibles.
- Evitar `npm run test:watch` en modo agente.
- Si un comando falla, reportar el output y no repetir el mismo comando sin cambios.
- Si un comando modifica archivos automaticamente, revisar `git diff`.

## Archivos De Tests

Los tests viven bajo `test/modules`.

Ejemplos:

- `test/modules/auth/unit/auth.service.spec.ts`
- `test/modules/chat/unit/chat.spec.ts`
- `test/modules/team/unit/team.service.spec.ts`
- `test/modules/rival-search/unit/rival-search.spec.ts`
- `test/modules/match/e2e/match.e2e-spec.ts`
- `test/modules/rival-search/e2e/get-rival-search.e2e-spec.ts`

Para tareas acotadas, el agente debe preferir el check mas cercano y evitar correr suites largas si no aportan evidencia adicional.
