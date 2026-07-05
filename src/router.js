import { client, MODEL } from "./llmClient.js";

// ============================================================
// ROUTER — decide qué tanto del pipeline hace falta correr
// ============================================================
// Una llamada corta al LLM, sin tools, para clasificar el pedido antes de
// decidir la cadena de subagentes. Evita correr Implementer/Tester/Reviewer
// sobre tareas puramente informativas (donde Explorer + Researcher ya
// alcanzan para responder), y evita que ese caso se etiquete como
// "blocked" solo porque Implementer no tuvo nada que escribir.

const CLASSIFY_PROMPT = `Sos un clasificador de tareas para un sistema de coding agents.
Te llega el pedido original de un usuario sobre un repositorio de código.
Respondé ÚNICAMENTE con una palabra, sin explicaciones ni puntuación:
- IMPLEMENTACION si el pedido requiere crear, modificar, arreglar, refactorizar o escribir
  código/archivos del repositorio.
- INFORMATIVA si el pedido es una pregunta, una explicación, un análisis o un reporte que se
  puede responder sin cambiar ningún archivo.
Ante la duda, si hay cualquier posibilidad de que haga falta tocar código, respondé IMPLEMENTACION.`;

export async function classifyTask(task) {
  try {
    const response = await client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: CLASSIFY_PROMPT },
        { role: "user", content: task },
      ],
    });

    const answer = (response.choices[0].message.content || "").trim().toUpperCase();
    console.log(`\n🧭 Router clasificó la tarea como: ${answer}\n`);

    // Ante cualquier respuesta ambigua o inesperada, preferimos el camino
    // completo (más seguro subestimar el ahorro que perderse un cambio real).
    return answer.includes("INFORMATIVA") ? "informative" : "implementation";
  } catch (err) {
    console.log(`⚠️  Router falló (${err.message}), sigo con el pipeline completo por seguridad.`);
    return "implementation";
  }
}
