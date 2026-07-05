// ============================================================
// FLAGS DE EJECUCIÓN — compartidos entre cli.js y agentLoop.js
// ============================================================

// Objeto mutable (no primitivos sueltos) para que cualquier módulo que lo
// importe vea siempre el valor actual, sin pasar el flag como parámetro
// por todos lados.
export const settings = {
  supervision: true, // pide confirmación antes de write_file y run_command
};

// Tools que requieren confirmación del usuario cuando settings.supervision === true.
// Aplica tanto al agente principal como a cualquier subagente que las use.
export const SUPERVISED_TOOLS = ["write_file", "run_command"];
