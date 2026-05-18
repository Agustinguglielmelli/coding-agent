import dotenv from "dotenv";
dotenv.config();

console.log("TAVILY_API_KEY:", process.env.TAVILY_API_KEY ? "cargada ✅" : "no encontrada ❌");

const res = await fetch("https://api.tavily.com/search", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    api_key: process.env.TAVILY_API_KEY,
    query: "test",
    max_results: 1,
  }),
});

const data = await res.json();
console.log("Status:", res.status);
console.log("Respuesta completa:", JSON.stringify(data, null, 2));