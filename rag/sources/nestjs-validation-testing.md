# NestJS Validation And Testing
Fuente: https://docs.nestjs.com/techniques/validation y https://docs.nestjs.com/fundamentals/testing
Tipo: documentacion oficial resumida

NestJS suele validar datos de entrada con DTOs, `class-validator`, `class-transformer` y `ValidationPipe`. Un DTO representa la forma esperada del request y concentra reglas como required, string, number, enum, min, max o formato.

En `main.ts`, una aplicacion puede activar validacion global con `app.useGlobalPipes(new ValidationPipe(...))`. Opciones frecuentes son `whitelist`, `forbidNonWhitelisted` y `transform`. `whitelist` elimina propiedades no declaradas en el DTO. `forbidNonWhitelisted` rechaza requests con campos extra. `transform` convierte payloads a instancias del DTO.

## Decoradores Frecuentes De class-validator

- `@IsNotEmpty()`: exige que el campo exista y no este vacio. Es util cuando se quiere que falte explicitamente un campo requerido falle validacion.
- `@IsString()`: exige string.
- `@IsNumber()`: exige number. Si el dato llega como string y se usa `transform`, puede requerir `@Type(() => Number)`.
- `@IsDate()`: exige instancia Date. En requests JSON suele combinarse con `@Type(() => Date)` de class-transformer.
- `@IsUUID()`: valida formato UUID.
- `@IsOptional()`: marca el campo como opcional; no debe combinarse con `@IsNotEmpty()` salvo que haya una razon clara.
- `@Min()` y `@Max()`: validan rangos numericos.

En Rival Match, varios controllers usan `new ValidationPipe({ transform: true })`, por lo que los DTOs/input classes son el lugar correcto para reglas de formato y required. Para fechas, el patron existente es:

```ts
@IsDate()
@Type(() => Date)
date: Date;
```

Si se necesita rechazar faltantes de forma explicita, se agrega `@IsNotEmpty()` manteniendo los validadores existentes.

Para testear NestJS, se usa `@nestjs/testing` y `Test.createTestingModule`. En unit tests, normalmente se instancia el provider bajo prueba y se reemplazan dependencias por mocks. En e2e tests, se crea una aplicacion Nest y se hacen requests contra endpoints reales.

Un cambio de codigo deberia validarse con los comandos definidos por el proyecto. En proyectos NestJS comunes suelen existir `npm test`, `npm run test:e2e`, `npm run lint` y `npm run build`, pero el agente debe revisar primero `package.json` porque cada repo puede definir nombres distintos.

## Criterio Para El Agente

Cuando el usuario pida agregar validacion:

1. Identificar si el dato entra por `@Body`, `@Query` o `@Param`.
2. Buscar el input/DTO correspondiente.
3. Mantener decoradores existentes.
4. Agregar solo los decoradores necesarios.
5. Validar con tests o build segun el alcance.
