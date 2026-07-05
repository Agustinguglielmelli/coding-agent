import readline from "readline";

// Una sola instancia de readline para todo el proceso: la usa el loop
// principal en cli.js y, cuando haga falta pedir confirmación de
// supervisión, también agentLoop.js (y por lo tanto cualquier subagente).
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

export function ask(question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

export function closeIO() {
  rl.close();
}
