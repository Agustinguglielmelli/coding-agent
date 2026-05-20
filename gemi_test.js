import OpenAI from "openai";
import dotenv from "dotenv";
dotenv.config();

const client = new OpenAI({
  apiKey: process.env.GEMINI_API_KEY,
  baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
});

// Listar todos los modelos disponibles con tu key
const models = await client.models.list();
console.log("Modelos disponibles:\n");
for (const model of models.data) {
  console.log(" -", model.id);
}