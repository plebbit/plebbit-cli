// Release-time helper (issue #160): when a release upgrades @pkcprotocol/pkc-js, pull the pkc-js changelog
// entries for every version in the upgrade range into the newest section of docs/CHANGELOG.md, nested under
// the upgrade bullet, and print that section so release-it can use it as the GitHub release body.
//
// Usage (see config/.release-it.json):
//   node --loader ts-node/esm ci-bin/pkc-js-changelog.ts enrich --previous-tag v0.19.101
//       [--changelog docs/CHANGELOG.md] [--from 0.0.103] [--to 0.0.105] [--source <url or file>]
//   node --loader ts-node/esm ci-bin/pkc-js-changelog.ts release-notes [--changelog docs/CHANGELOG.md]
//
// `enrich` never fails the release: a missing tag, an unreachable GitHub or an unparseable changelog only
// log a warning and leave docs/CHANGELOG.md untouched.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const PKC_JS_PACKAGE = "@pkcprotocol/pkc-js";
export const PKC_JS_REPO_URL = "https://github.com/pkcprotocol/pkc-js";
export const DEFAULT_CHANGELOG_PATH = "docs/CHANGELOG.md";

export const pkcJsChangelogUrl = (version: string): string => `https://raw.githubusercontent.com/pkcprotocol/pkc-js/v${version}/docs/CHANGELOG.md`;

export interface PkcJsEntry {
    /** Conventional commit type derived from the changelog section (`fix`, `feat`, `perf`, ...). */
    type: string;
    /** The bullet text as written in the pkc-js changelog, without the leading `* `. */
    text: string;
}

export interface PkcJsRelease {
    version: string;
    date?: string;
    entries: PkcJsEntry[];
}

const VERSION_HEADING = /^##\s+(?:<small>\s*)?\[?v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\]?/;
const DATE_IN_HEADING = /\((\d{4}-\d{2}-\d{2})\)/;
const SECTION_HEADING = /^###\s+(.+?)\s*$/;
const BULLET = /^[*-]\s+(.*)$/;
const TOP_LEVEL_HEADING = /^## /;

// Inverse of the section titles conventional-changelog presets emit, so the nested entries read like the
// flat `type(scope): subject` lines bitsocial-cli's own changelog uses.
const SECTION_TYPES: Record<string, string> = {
    features: "feat",
    "bug fixes": "fix",
    "performance improvements": "perf",
    performance: "perf",
    reverts: "revert",
    "build system": "build",
    documentation: "docs",
    "code refactoring": "refactor",
    tests: "test",
    styles: "style",
    "miscellaneous chores": "chore",
    "continuous integration": "ci",
    "⚠ breaking changes": "BREAKING CHANGE",
    "breaking changes": "BREAKING CHANGE"
};

export const compareVersions = (a: string, b: string): number => {
    const [aMain, aPre] = a.split("-", 2);
    const [bMain, bPre] = b.split("-", 2);
    const aParts = aMain.split(".").map(Number);
    const bParts = bMain.split(".").map(Number);
    for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
        const diff = (aParts[i] ?? 0) - (bParts[i] ?? 0);
        if (diff !== 0) return Math.sign(diff);
    }
    // A pre-release sorts before the release it precedes.
    if (!aPre && bPre) return 1;
    if (aPre && !bPre) return -1;
    return 0;
};

export const parsePkcJsChangelog = (markdown: string): PkcJsRelease[] => {
    const releases: PkcJsRelease[] = [];
    let current: PkcJsRelease | undefined;
    let type = "";
    for (const rawLine of markdown.split(/\r?\n/)) {
        const line = rawLine.trimEnd();
        const versionMatch = VERSION_HEADING.exec(line);
        if (versionMatch) {
            current = { version: versionMatch[1], entries: [] };
            const date = DATE_IN_HEADING.exec(line)?.[1];
            if (date) current.date = date;
            releases.push(current);
            type = "";
            continue;
        }
        const sectionMatch = SECTION_HEADING.exec(line);
        if (sectionMatch) {
            const title = sectionMatch[1].toLowerCase();
            type = SECTION_TYPES[title] ?? title;
            continue;
        }
        const bulletMatch = BULLET.exec(line);
        if (bulletMatch && current && !/^\s/.test(rawLine)) {
            current.entries.push({ type, text: bulletMatch[1].trim() });
        }
    }
    return releases;
};

/** Releases with `from < version <= to`, in the order they appear in the changelog (newest first). */
export const releasesInRange = (releases: PkcJsRelease[], from: string, to: string): PkcJsRelease[] =>
    releases.filter(({ version }) => compareVersions(version, from) > 0 && compareVersions(version, to) <= 0);

const formatEntry = ({ type, text }: PkcJsEntry): string => {
    // conventional-changelog writes scoped entries as `**scope:** subject`.
    const scoped = /^\*\*([^*]+?):\*\*\s*(.*)$/.exec(text);
    if (scoped) return type ? `${type}(${scoped[1]}): ${scoped[2]}` : `${scoped[1]}: ${scoped[2]}`;
    return type ? `${type}: ${text}` : text;
};

const pkcJsVersionBullet = (version: string) => `pkc-js [${version}](${PKC_JS_REPO_URL}/releases/tag/v${version})`;

export const renderPkcJsReleases = (releases: PkcJsRelease[], indent = "  "): string[] => {
    const lines: string[] = [];
    for (const release of releases) {
        lines.push(`${indent}* ${pkcJsVersionBullet(release.version)}${release.date ? ` (${release.date})` : ""}`);
        for (const entry of release.entries) lines.push(`${indent}  * ${formatEntry(entry)}`);
    }
    return lines;
};

const newestSectionBounds = (lines: string[]): { start: number; end: number } | undefined => {
    const start = lines.findIndex((line) => TOP_LEVEL_HEADING.test(line));
    if (start === -1) return undefined;
    let end = lines.findIndex((line, index) => index > start && TOP_LEVEL_HEADING.test(line));
    if (end === -1) end = lines.length;
    return { start, end };
};

/** The newest `## ...` section of a changelog, as release-it would use it for the GitHub release body. */
export const newestSection = (changelog: string): string => {
    const lines = changelog.split(/\r?\n/);
    const bounds = newestSectionBounds(lines);
    if (!bounds) return "";
    return lines.slice(bounds.start, bounds.end).join("\n").trim();
};

export interface InsertOptions {
    from: string;
    to: string;
}

/**
 * Insert the pkc-js releases as a nested list under the pkc-js upgrade bullet of the newest changelog section.
 * Adds an upgrade bullet when the section has none, and is a no-op when the section already lists `to`.
 */
export const insertPkcJsReleases = (changelog: string, releases: PkcJsRelease[], { from, to }: InsertOptions): string => {
    if (releases.length === 0) return changelog;
    const lines = changelog.split(/\r?\n/);
    const bounds = newestSectionBounds(lines);
    if (!bounds) return changelog;
    const section = lines.slice(bounds.start, bounds.end);

    const alreadyListed = new RegExp(`^\\s+\\* ${pkcJsVersionBullet(to).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);
    if (section.some((line) => alreadyListed.test(line))) return changelog;

    const block = renderPkcJsReleases(releases);
    const bulletIndex = section.findIndex((line) => /^\* .*pkc-js/i.test(line));
    if (bulletIndex !== -1) {
        // Skip continuation lines (indented) that already belong to the bullet.
        let insertAt = bulletIndex + 1;
        while (insertAt < section.length && /^\s+\S/.test(section[insertAt])) insertAt++;
        section.splice(insertAt, 0, ...block);
    } else {
        // Keep the blank lines that separate this section from the next one after the new bullet.
        let insertAt = section.length;
        while (insertAt > 0 && section[insertAt - 1].trim() === "") insertAt--;
        const needsBlankBefore = insertAt > 0 && !/^[*-] /.test(section[insertAt - 1]);
        section.splice(insertAt, 0, ...(needsBlankBefore ? [""] : []), `* chore(deps): upgrade ${PKC_JS_PACKAGE} from ${from} to ${to}`, ...block);
    }

    return [...lines.slice(0, bounds.start), ...section, ...lines.slice(bounds.end)].join("\n");
};

export const pkcJsVersionFromPackageJson = (packageJson: string): string | undefined => {
    const parsed = JSON.parse(packageJson) as Record<string, Record<string, string> | undefined>;
    for (const field of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
        const spec = parsed[field]?.[PKC_JS_PACKAGE];
        if (spec) return spec.replace(/^[\^~=v]+/, "");
    }
    return undefined;
};

const parseFlags = (argv: string[]): Record<string, string> => {
    const flags: Record<string, string> = {};
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (!arg.startsWith("--")) continue;
        const [key, inlineValue] = arg.slice(2).split("=", 2);
        flags[key] = inlineValue ?? argv[++i] ?? "";
    }
    return flags;
};

const loadSource = async (source: string): Promise<string> => {
    if (/^https?:\/\//.test(source)) {
        const response = await fetch(source, { signal: AbortSignal.timeout(30_000) });
        if (!response.ok) throw new Error(`GET ${source} returned HTTP ${response.status}`);
        return response.text();
    }
    return fs.readFileSync(source, "utf-8");
};

const warn = (message: string) => console.warn(`[pkc-js-changelog] ${message}`);

const enrich = async (flags: Record<string, string>): Promise<void> => {
    const changelogPath = flags.changelog || DEFAULT_CHANGELOG_PATH;
    const to = flags.to || pkcJsVersionFromPackageJson(fs.readFileSync("package.json", "utf-8"));
    if (!to) return warn(`${PKC_JS_PACKAGE} is not a dependency, nothing to do`);

    let from: string | undefined = flags.from;
    if (!from) {
        if (!flags["previous-tag"]) return warn("neither --from nor --previous-tag given, skipping");
        try {
            from = pkcJsVersionFromPackageJson(execFileSync("git", ["show", `${flags["previous-tag"]}:package.json`], { encoding: "utf-8", stdio: "pipe" }));
        } catch (error) {
            return warn(`could not read package.json at ${flags["previous-tag"]} (${(error as Error).message.trim()}), skipping`);
        }
        if (!from) return warn(`${PKC_JS_PACKAGE} was not a dependency at ${flags["previous-tag"]}, skipping`);
    }
    if (compareVersions(from, to) >= 0) return console.log(`[pkc-js-changelog] ${PKC_JS_PACKAGE} ${from} -> ${to}: not an upgrade, nothing to do`);

    const source = flags.source || pkcJsChangelogUrl(to);
    let releases: PkcJsRelease[];
    try {
        releases = releasesInRange(parsePkcJsChangelog(await loadSource(source)), from, to);
    } catch (error) {
        return warn(`could not load the pkc-js changelog from ${source} (${(error as Error).message}), skipping`);
    }
    if (releases.length === 0) return warn(`no pkc-js releases between ${from} and ${to} found in ${source}, skipping`);

    const changelog = fs.readFileSync(changelogPath, "utf-8");
    const enriched = insertPkcJsReleases(changelog, releases, { from, to });
    if (enriched === changelog) return console.log(`[pkc-js-changelog] ${changelogPath} already lists pkc-js ${to}, nothing to do`);
    fs.writeFileSync(changelogPath, enriched);
    console.log(`[pkc-js-changelog] added ${releases.length} pkc-js release(s) (${from} -> ${to}) to ${changelogPath}`);
};

const main = async (argv: string[]): Promise<void> => {
    const [command, ...rest] = argv;
    const flags = parseFlags(rest);
    if (command === "enrich") return enrich(flags);
    if (command === "release-notes") {
        process.stdout.write(newestSection(fs.readFileSync(flags.changelog || DEFAULT_CHANGELOG_PATH, "utf-8")) + "\n");
        return;
    }
    console.error(`Usage: ${path.basename(process.argv[1] ?? "pkc-js-changelog.ts")} <enrich|release-notes> [--flag value ...]`);
    process.exitCode = 2;
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main(process.argv.slice(2)).catch((error) => {
        // Enrichment is best effort; never block a release on it.
        warn(`unexpected error: ${(error as Error).stack ?? error}`);
    });
}
