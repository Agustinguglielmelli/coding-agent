import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function loadPlugins(agentConfig = {}) {
    const pluginsDir = path.resolve(__dirname, "plugins");
    const enabledPlugins = agentConfig.plugins?.enabled || [];
    const disabledPlugins = agentConfig.plugins?.disabled || [];
    const plugins = [];

    if (!fs.existsSync(pluginsDir)) return plugins;

    const files = fs.readdirSync(pluginsDir).filter((f) => f.endsWith(".js"));

    for (const file of files) {
        const pluginName = file.replace(".js", "");

        if (disabledPlugins.includes(pluginName)) {
            console.log(`⏭️  Plugin deshabilitado: ${pluginName}`);
            continue;
        }

        if (enabledPlugins.length > 0 && !enabledPlugins.includes(pluginName)) {
            console.log(`⏭️  Plugin no habilitado: ${pluginName}`);
            continue;
        }

        try {
            const fullPath = path.resolve(pluginsDir, file);
            const module = await import(fullPath);
            const PluginClass = module.default;
            const instance = new PluginClass();
            plugins.push(instance);
            console.log(`🔌 Plugin cargado: ${instance.name}`);
        } catch (err) {
            console.warn(`⚠️  Error cargando plugin ${pluginName}: ${err.message}`);
        }
    }

    return plugins;
}