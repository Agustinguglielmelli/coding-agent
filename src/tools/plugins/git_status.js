import { execSync } from "child_process";
import { Tool } from "../../../tools/tool-interface.js";
import { getWorkspaceRoot } from "../../workspace.js";

export default class GitStatusTool extends Tool {
    constructor() {
        super({
            name: "git_status",
            description:
                "Muestra el estado actual del repositorio git: archivos modificados, staged, y branch actual. Usá esta tool cuando necesites saber qué cambios hay en el repo.",
            parameters: {
                type: "object",
                properties: {},
            },
        });
    }

    execute() {
        const cwd = getWorkspaceRoot();
        try {
            const status = execSync("git status", { encoding: "utf-8", cwd });
            const branch = execSync("git branch --show-current", { encoding: "utf-8", cwd }).trim();
            console.log(`✅ git_status() cwd="${cwd}"`);
            return `Branch actual: ${branch}\n\n${status}`;
        } catch (err) {
            return `Error ejecutando git status: ${err.message}`;
        }
    }
}
