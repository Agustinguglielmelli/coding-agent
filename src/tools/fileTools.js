import fs from "fs";
import { dirname } from "path";
import { resolveWorkspacePath } from "../workspace.js";

export function read_file(path) {
  const resolvedPath = resolveWorkspacePath(path);
  try {
    const content = fs.readFileSync(resolvedPath, "utf-8");
    console.log(`✅ read_file("${path}" -> "${resolvedPath}")`);
    return content;
  } catch (err) {
    if (err.code === "ENOENT") return `Error: File not found at ${resolvedPath}`;
    return `Error reading file ${resolvedPath}: ${err.message}`;
  }
}

export function write_file({ path, content }) {
  const resolvedPath = resolveWorkspacePath(path);
  try {
    fs.mkdirSync(dirname(resolvedPath), { recursive: true });
    fs.writeFileSync(resolvedPath, content, "utf-8");
    console.log(`✅ write_file("${path}" -> "${resolvedPath}")`);
    return `Archivo escrito exitosamente: ${resolvedPath}`;
  } catch (err) {
    console.log(`❌ write_file error: ${err.message}`);
    return `Error writing file ${resolvedPath}: ${err.message}`;
  }
}

export function list_files({ directory }) {
  const resolvedDirectory = resolveWorkspacePath(directory);
  try {
    const items = fs.readdirSync(resolvedDirectory, { withFileTypes: true });
    const result = items.map((item) =>
      item.isDirectory() ? `📁 ${item.name}/` : `📄 ${item.name}`
    );
    console.log(`✅ list_files("${directory}" -> "${resolvedDirectory}") — ${result.length} items`);
    return result.join("\n");
  } catch (err) {
    console.log(`❌ list_files error: ${err.message}`);
    return `Error listing directory ${resolvedDirectory}: ${err.message}`;
  }
}
