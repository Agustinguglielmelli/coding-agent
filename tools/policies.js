import { basename } from "path";
import { allowToolCall, denyToolCall } from "./tool-interface.js";

export function normalizePathForPolicy(path) {
  return String(path).replaceAll("\\", "/").replace(/^\.\//, "");
}

function globToRegExp(pattern) {
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

function matchesPolicyPattern(pattern, value) {
  const normalizedValue = normalizePathForPolicy(value);
  const normalizedPattern = normalizePathForPolicy(pattern);
  const regex = globToRegExp(normalizedPattern);

  if (regex.test(normalizedValue)) return true;
  if (!normalizedPattern.includes("/")) return regex.test(basename(normalizedValue));
  return false;
}

export function createPolicyGuards(agentConfig) {
  function isPathDenied(path, action) {
    const denyPatterns = agentConfig.permissions?.[action]?.deny || [];
    return denyPatterns.find((pattern) => matchesPolicyPattern(pattern, path));
  }

  function isCommandDenied(command) {
    const denyPatterns = agentConfig.permissions?.commands?.deny || [];
    return denyPatterns.find((pattern) => command.includes(pattern));
  }

  function commandRequiresApproval(command) {
    const approvalPatterns = agentConfig.permissions?.commands?.require_approval || [];
    return approvalPatterns.find((pattern) => command.includes(pattern));
  }

  function validateReadPath(path) {
    const deniedBy = isPathDenied(path, "read");
    if (!deniedBy) return allowToolCall();
    return denyToolCall(`Politica de lectura bloqueo "${path}" por patron "${deniedBy}".`);
  }

  function validateWritePath(path) {
    const deniedBy = isPathDenied(path, "write");
    if (!deniedBy) return allowToolCall();
    return denyToolCall(`Politica de escritura bloqueo "${path}" por patron "${deniedBy}".`);
  }

  function validateCommand(command) {
    const deniedBy = isCommandDenied(command);
    if (!deniedBy) return allowToolCall();
    return denyToolCall(`Politica de comandos bloqueo "${command}" por patron "${deniedBy}".`);
  }

  return {
    commandRequiresApproval,
    validateReadPath,
    validateWritePath,
    validateCommand,
  };
}
