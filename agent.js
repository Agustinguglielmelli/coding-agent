import { startObservability, shutdownObservability } from "./src/observability.js";
import { main } from "./src/cli.js";

startObservability();

main()
  .catch(console.error)
  .finally(shutdownObservability);
