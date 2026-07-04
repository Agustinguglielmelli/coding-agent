export async function web_search({ query }) {
  try {
    console.log(`✅ web_search("${query}")`);
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: process.env.TAVILY_API_KEY,
        query,
        max_results: 3,
      }),
    });
    const data = await res.json();
    if (!data.results) {
      return `Error: Tavily no devolvió resultados. Detalle: ${JSON.stringify(data)}`;
    }
    const results = data.results
      .map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.content}`)
      .join("\n\n");
    return results || "Sin resultados";
  } catch (err) {
    return `Error en web_search: ${err.message}`;
  }
}
