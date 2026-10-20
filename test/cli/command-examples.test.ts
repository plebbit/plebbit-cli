import { describe, it, expect } from "vitest";
import { Config } from "@oclif/core";

// Command examples are copy-pasted from `--help` and the README. An unquoted `[`/`]` (e.g. --settings.challenges[0].name)
// is a glob pattern, and zsh aborts with "no matches found" before bitsocial runs, so the example fails as written.

/** Characters that sit outside any quotes and would be expanded as a glob by the shell. */
function unquotedGlobChars(command: string): string[] {
    const found: string[] = [];
    let quote: string | undefined;
    for (const char of command) {
        if (quote) {
            if (char === quote) quote = undefined;
        } else if (char === "'" || char === '"') {
            quote = char;
        } else if (char === "[" || char === "]" || char === "*" || char === "?") {
            found.push(char);
        }
    }
    return found;
}

describe("command examples", () => {
    it("quote every glob character so they run as written in zsh", async () => {
        const config = await Config.load(process.cwd());
        const offending: string[] = [];
        for (const command of config.commands.filter((c) => c.pluginType === "core")) {
            const loaded = await command.load();
            for (const example of loaded.examples ?? []) {
                const line = typeof example === "string" ? example : example.command;
                if (unquotedGlobChars(line).length > 0) offending.push(`${command.id}: ${line}`);
            }
        }
        expect(offending).toEqual([]);
    });
});
