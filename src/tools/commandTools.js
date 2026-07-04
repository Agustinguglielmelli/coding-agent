import { execSync } from "child_process";

export function run_command({ command }) {
  try {
    console.log(`✅ run_command("${command}")`);
    const stdout = execSync(command, { encoding: "utf-8", timeout: 10000 });
    return stdout || "(sin output)";
  } catch (err) {
    const output = (err.stdout || "") + (err.stderr || "");
    console.log(`⚠️  run_command salió con error`);
    return output || err.message;
  }
}
