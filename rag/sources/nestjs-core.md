# NestJS Core Patterns
Fuente: https://docs.nestjs.com/
Tipo: documentacion oficial resumida

NestJS organiza aplicaciones con modulos, controllers y providers. Un modulo agrupa capacidades relacionadas y se declara con el decorador `@Module`. Los controllers reciben requests HTTP y delegan logica de negocio a providers o services. Los providers se registran en el contenedor de inyeccion de dependencias y se inyectan por constructor.

Para una funcionalidad nueva en un proyecto NestJS, el flujo habitual es crear o modificar un modulo, agregar un controller para la superficie HTTP, agregar un service para la logica, y definir DTOs para validar los datos de entrada. El modulo debe exportar providers cuando otros modulos necesitan consumirlos.

Los controllers suelen usar decoradores como `@Controller`, `@Get`, `@Post`, `@Patch`, `@Delete`, `@Param`, `@Body` y `@Query`. La logica de negocio no deberia quedar dentro del controller; el controller deberia ser delgado y coordinar entrada/salida.

Los services suelen anotarse con `@Injectable`. Si un service depende de otro provider, se recibe por constructor. Esto facilita testing porque se pueden reemplazar dependencias con mocks.

En una arquitectura NestJS mantenible, las responsabilidades se separan por dominio o feature. Por ejemplo, `matches`, `users`, `auth` o `rankings` pueden tener su propio modulo, controller, service, DTOs y tests.
