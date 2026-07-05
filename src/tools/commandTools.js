import { execSync } from "child_process";
import { getWorkspaceRoot } from "../workspace.js";

export function run_command({ command }) {
  const cwd = getWorkspaceRoot();
  try {
    console.log(`✅ run_command("${command}") cwd="${cwd}"`);
    const stdout = execSync(command, { encoding: "utf-8", timeout: 10000, cwd });
    return stdout || "(sin output)";
  } catch (err) {
    const output = (err.stdout || "") + (err.stderr || "");
    console.log(`⚠️  run_command salió con error`);
    return output || err.message;
  }
}
