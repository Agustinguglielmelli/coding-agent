import fs from "fs";
import { dirname } from "path";

export function read_file(path) {
  try {
    const content = fs.readFileSync(path, "utf-8");
    console.log(`✅ read_file("${path}")`);
    return content;
  } catch (err) {
    if (err.code === "ENOENT") return `Error: File not found at ${path}`;
    return `Error reading file ${path}: ${err.message}`;
  }
}

export function write_file({ path, content }) {
  try {
    fs.mkdirSync(dirname(path), { recursive: true });
    fs.writeFileSync(path, content, "utf-8");
    console.log(`✅ write_file("${path}")`);
    return `Archivo escrito exitosamente: ${path}`;
  } catch (err) {
    console.log(`❌ write_file error: ${err.message}`);
    return `Error writing file ${path}: ${err.message}`;
  }
}

export function list_files({ directory }) {
  try {
    const items = fs.readdirSync(directory, { withFileTypes: true });
    const result = items.map((item) =>
      item.isDirectory() ? `📁 ${item.name}/` : `📄 ${item.name}`
    );
    console.log(`✅ list_files("${directory}") — ${result.length} items`);
    return result.join("\n");
  } catch (err) {
    console.log(`❌ list_files error: ${err.message}`);
    return `Error listing directory ${directory}: ${err.message}`;
  }
}
