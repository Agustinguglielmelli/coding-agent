# NestJS Controller Service Repository Layers
Fuente: https://docs.nestjs.com/controllers, https://docs.nestjs.com/providers y practicas comunes de arquitectura en NestJS
Tipo: documentacion tecnica resumida

En proyectos NestJS es comun separar responsabilidades en capas para que cada archivo tenga un motivo claro para cambiar. La division controller, service y repository ayuda a mantener endpoints delgados, logica de negocio testeable y acceso a datos aislado.

## Controller

El controller es la capa de entrada HTTP. Define rutas y metodos usando decoradores como `@Controller`, `@Get`, `@Post`, `@Patch`, `@Delete`, `@Param`, `@Body` y `@Query`.

Responsabilidades habituales:

- Recibir requests.
- Extraer parametros, query params y body.
- Aplicar DTOs y pipes de validacion.
- Delegar la logica de negocio al service.
- Devolver la respuesta al cliente.

El controller no deberia contener reglas complejas de negocio ni consultas directas a base de datos. Si un metodo de controller crece demasiado, normalmente esa logica pertenece al service.

Ejemplo conceptual:

```ts
@Controller('matches')
export class MatchesController {
  constructor(private readonly matchesService: MatchesService) {}

  @Post()
  create(@Body() dto: CreateMatchDto) {
    return this.matchesService.create(dto);
  }
}
```

## Service

El service representa la capa de logica de negocio. En NestJS suele declararse con `@Injectable` para poder inyectarse en controllers u otros providers.

Responsabilidades habituales:

- Implementar reglas de negocio.
- Coordinar varios repositories o providers.
- Validar condiciones del dominio que no son solamente formato del request.
- Preparar datos para persistencia o respuesta.
- Mantener la logica testeable sin depender directamente de HTTP.

El service puede llamar a repositories, clientes externos, otros services o utilidades del dominio. No deberia depender de detalles de request HTTP como `req`, `res` o headers, salvo que el proyecto tenga una convencion explicita para eso.

Ejemplo conceptual:

```ts
@Injectable()
export class MatchesService {
  constructor(private readonly matchesRepository: MatchesRepository) {}

  async create(dto: CreateMatchDto) {
    const match = await this.matchesRepository.create(dto);
    return match;
  }
}
```

## Repository

El repository encapsula el acceso a datos. Puede ser una clase propia, un provider que usa Prisma, TypeORM, Mongoose, un cliente HTTP o cualquier mecanismo de persistencia elegido por el proyecto.

Responsabilidades habituales:

- Ejecutar consultas o escrituras contra la fuente de datos.
- Traducir operaciones del dominio a operaciones de persistencia.
- Encapsular detalles de ORM, SQL, MongoDB, Prisma, TypeORM u otro cliente.
- Permitir que el service no conozca detalles de almacenamiento.

No todos los proyectos NestJS tienen una capa repository explicita. Algunos services llaman directamente a Prisma o TypeORM. El agente debe revisar la convencion del repo antes de crear repositories nuevos.

Ejemplo conceptual:

```ts
@Injectable()
export class MatchesRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateMatchDto) {
    return this.prisma.match.create({ data: dto });
  }
}
```

## Convenciones De Uso

Para agregar una funcionalidad, conviene seguir este orden:

1. Revisar si ya existe un modulo del dominio.
2. Revisar si el repo usa repositories explicitos o acceso a datos desde services.
3. Crear o modificar DTOs para entrada.
4. Agregar o modificar metodos del service.
5. Exponer el caso de uso desde el controller.
6. Registrar providers en el module si corresponde.
7. Agregar tests siguiendo el patron existente.

## Module

El module conecta las piezas. Un modulo NestJS declara controllers, providers, imports y exports.

Ejemplo conceptual:

```ts
@Module({
  controllers: [MatchesController],
  providers: [MatchesService, MatchesRepository],
  exports: [MatchesService],
})
export class MatchesModule {}
```

Si un provider se usa solo dentro del modulo, no hace falta exportarlo. Si otro modulo necesita usarlo, debe aparecer en `exports`.

## Criterio Para El Agente

Antes de implementar cambios en Rival Match, el agente debe mirar archivos vecinos y memoria del proyecto. Si el repo ya usa controller-service-repository, debe respetar esa separacion. Si el repo no usa repositories, no debe introducir esa capa sin una razon clara.

Cuando responda o implemente, debe distinguir:

- Controller: transporte HTTP.
- Service: reglas de negocio.
- Repository: persistencia o acceso a datos.
- DTO: contrato y validacion de entrada.
- Module: registro e inyeccion de dependencias.
