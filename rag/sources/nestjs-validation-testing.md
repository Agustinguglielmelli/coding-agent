# NestJS Validation And Testing
Fuente: https://docs.nestjs.com/techniques/validation y https://docs.nestjs.com/fundamentals/testing
Tipo: documentacion oficial resumida

NestJS suele validar datos de entrada con DTOs, `class-validator`, `class-transformer` y `ValidationPipe`. Un DTO representa la forma esperada del request y concentra reglas como required, string, number, enum, min, max o formato.

En `main.ts`, una aplicacion puede activar validacion global con `app.useGlobalPipes(new ValidationPipe(...))`. Opciones frecuentes son `whitelist`, `forbidNonWhitelisted` y `transform`. `whitelist` elimina propiedades no declaradas en el DTO. `forbidNonWhitelisted` rechaza requests con campos extra. `transform` convierte payloads a instancias del DTO.

Para testear NestJS, se usa `@nestjs/testing` y `Test.createTestingModule`. En unit tests, normalmente se instancia el provider bajo prueba y se reemplazan dependencias por mocks. En e2e tests, se crea una aplicacion Nest y se hacen requests contra endpoints reales.

Un cambio de codigo deberia validarse con los comandos definidos por el proyecto. En proyectos NestJS comunes suelen existir `npm test`, `npm run test:e2e`, `npm run lint` y `npm run build`, pero el agente debe revisar primero `package.json` porque cada repo puede definir nombres distintos.
