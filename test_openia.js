import OpenAI from "openai";
import dotenv from "dotenv";
dotenv.config();

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function main() {
  console.log("Probando conexión con OpenAI...\n");

  const response = await client.chat.completions.create({
    model: "gpt-5-nano",
    messages: [
      {
        role: "user",
        content: "Respondé solo con la palabra: funciona",
      },
    ],
  });

  const mensaje = response.choices[0].message.content;
  console.log("Respuesta del LLM:", mensaje);
  console.log("\n✅ API key funcionando correctamente");
}

main().catch((err) => {
  console.error("❌ Error al conectar con OpenAI:");
  console.error(err.message);

  if (err.message.includes("API key")) {
    console.error("\nRevisá que el .env tenga: OPENAI_API_KEY=sk-...");
  }
});