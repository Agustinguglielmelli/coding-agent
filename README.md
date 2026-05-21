# todo.js

Este módulo de JavaScript proporciona una función simple para gestionar tareas.

## Funcionalidades

Actualmente, este módulo incluye la siguiente función:

### `addTask(task)`

Añade una nueva tarea a una lista (simulada por un `console.log` en esta versión).

**Parámetros:**

*   `task` (string): La descripción de la tarea a añadir.

**Ejemplo de uso:**

```javascript
const todo = require('./todo.js');

todo.addTask("Comprar víveres");
// Salida en la consola: "Task added"
```

## Instalación

No se requiere ninguna instalación especial, ya que es un archivo JavaScript simple. Puedes incluirlo directamente en tus proyectos Node.js.

## Uso

Para usar las funciones de este módulo, simplemente requiérelo en tu archivo JavaScript:

```javascript
const todo = require('./todo.js');

// Ahora puedes usar las funciones exportadas:
todo.addTask("Estudiar para el examen");
```