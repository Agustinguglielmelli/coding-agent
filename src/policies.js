import { basename } from "path";
import { agentConfig } from "./config.js";
import { pathForPolicy } from "./workspace.js";

// ============================================================
// POLITICAS DESDE agent.config.json
// ============================================================

export function normalizePathForPolicy(path) {
  return String(path).replaceAll("\\", "/").replace(/^\.\//, "");
}

export function globToRegExp(pattern) {
  const normalizedPattern = normalizePathForPolicy(pattern);
  let regex = "";

  for (let i = 0; i < normalizedPattern.length; i += 1) {
    const char = normalizedPattern[i];
    const nextChar = normalizedPattern[i + 1];

    if (char === "*" && nextChar === "*") {
      regex += ".*";
      i += 1;
      continue;
    }

    if (char === "*") {
      regex += "[^/]*";
      continue;
    }

    if ("\\^$+?.()|{}[]".includes(char)) {
      regex += `\\${char}`;
      continue;
    }

    regex += char;
  }

  return new RegExp(`^${regex}$`);
}

export function matchesPolicyPattern(pattern, value) {
  const normalizedValue = normalizePathForPolicy(value);
  const normalizedPattern = normalizePathForPolicy(pattern);
  const regex = globToRegExp(normalizedPattern);

  if (regex.test(normalizedValue)) return true;
  if (!normalizedPattern.includes("/")) return regex.test(basename(normalizedValue));
  return false;
}

export function isPathDenied(path, action) {
  const denyPatterns = agentConfig.permissions?.[action]?.deny || [];
  const policyPath = pathForPolicy(path);
  return denyPatterns.find((pattern) => matchesPolicyPattern(pattern, policyPath));
}

export function isCommandDenied(command) {
  const denyPatterns = agentConfig.permissions?.commands?.deny || [];
  return denyPatterns.find((pattern) => command.includes(pattern));
}

export function commandRequiresApproval(command) {
  const approvalPatterns = agentConfig.permissions?.commands?.require_approval || [];
  return approvalPatterns.find((pattern) => command.includes(pattern));
}

export function validateToolCall(toolName, args) {
  if (toolName === "read_file") {
    const deniedBy = isPathDenied(args.path, "read");
    if (deniedBy) {
      return {
        allowed: false,
        reason: `Politica de lectura bloqueo "${args.path}" por patron "${deniedBy}".`,
      };
    }
  }

  if (toolName === "list_files") {
    const deniedBy = isPathDenied(args.directory, "read");
    if (deniedBy) {
      return {
        allowed: false,
        reason: `Politica de lectura bloqueo "${args.directory}" por patron "${deniedBy}".`,
      };
    }
  }

  if (toolName === "write_file") {
    const deniedBy = isPathDenied(args.path, "write");
    if (deniedBy) {
      return {
        allowed: false,
        reason: `Politica de escritura bloqueo "${args.path}" por patron "${deniedBy}".`,
      };
    }
  }

  if (toolName === "run_command") {
    const deniedBy = isCommandDenied(args.command);
    if (deniedBy) {
      return {
        allowed: false,
        reason: `Politica de comandos bloqueo "${args.command}" por patron "${deniedBy}".`,
      };
    }
  }

  return { allowed: true };
}
