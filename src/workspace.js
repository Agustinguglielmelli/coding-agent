import path from "path";
import { agentConfig } from "./config.js";

export function getWorkspaceRoot() {
  const configuredWorkspace = process.env.AGENT_WORKSPACE || agentConfig.workspace || ".";
  return path.resolve(process.cwd(), configuredWorkspace);
}

export function resolveWorkspacePath(inputPath = ".") {
  const requestedPath = inputPath || ".";
  if (path.isAbsolute(requestedPath)) return path.normalize(requestedPath);
  return path.resolve(getWorkspaceRoot(), requestedPath);
}

export function pathForPolicy(inputPath = ".") {
  const resolvedPath = resolveWorkspacePath(inputPath);
  const relativePath = path.relative(getWorkspaceRoot(), resolvedPath);

  if (relativePath && !relativePath.startsWith("..") && !path.isAbsolute(relativePath)) {
    return relativePath;
  }

  return resolvedPath;
}
