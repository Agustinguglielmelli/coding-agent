import OpenAI from "openai";
import dotenv from "dotenv";
import readline from "readline";
dotenv.config();

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const MODEL = "gpt-5-nano";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question) {
  return new Promise((resolve) => {
    rl.question(question, resolve);
  });
}

const messages = [
  {
    role: "system",
    content: "Sos un agente de código. Ayudás a explorar, analizar y modificar repositorios.",
  },
];

async function main() {
  console.log("Coding Agent listo. Escribí 'exit' para salir.\n");

  // Loop externo — mantiene la conversación viva
  while (true) {
    const input = await ask("> ");

    if (input.toLowerCase() === "exit") {
      console.log("Saliendo...");
      rl.close();
      break;
    }

    // Agregar mensaje del usuario al historial
    messages.push({
      role: "user",
      content: input,
    });

    // Llamar al LLM con todo el historial
    const response = await client.chat.completions.create({
      model: MODEL,
      messages: messages,
    });

    const assistantMessage = response.choices[0].message;

    // Agregar respuesta del asistente al historial
    messages.push(assistantMessage);

    console.log("\n" + assistantMessage.content + "\n");
  }
}

main().catch(console.error);