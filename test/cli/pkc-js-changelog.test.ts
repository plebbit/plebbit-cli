import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { directory as randomDirectory } from "tempy";
import {
    compareVersions,
    insertPkcJsReleases,
    newestSection,
    parsePkcJsChangelog,
    pkcJsVersionFromPackageJson,
    releasesInRange,
    renderPkcJsReleases
} from "../../ci-bin/pkc-js-changelog.js";

// Issue #160: a pkc-js upgrade should carry the pkc-js changelog for every version in the upgrade range,
// nested under the upgrade bullet, both in docs/CHANGELOG.md and in the GitHub release body.

const fixturePath = path.join(process.cwd(), "test", "fixtures", "pkc-js-changelog.md");
const pkcJsChangelog = fs.readFileSync(fixturePath, "utf-8");

const bitsocialChangelog = `# Changelog

## <small>0.19.102 (2026-10-15)</small>

* chore(deps): upgrade @pkcprotocol/pkc-js to 0.0.105 ([d359769](https://github.com/bitsocialnet/bitsocial-cli/commit/d359769))
* fix(daemon): something unrelated ([1111111](https://github.com/bitsocialnet/bitsocial-cli/commit/1111111))

## <small>0.19.101 (2026-10-14)</small>

* chore(deps): upgrade @pkcprotocol/pkc-js to 0.0.103 ([92a513d](https://github.com/bitsocialnet/bitsocial-cli/commit/92a513d))
`;

describe("pkc-js changelog in release notes", () => {
    it("parses the pkc-js changelog into releases with conventional types", () => {
        const releases = parsePkcJsChangelog(pkcJsChangelog);
        expect(releases.map((release) => release.version)).toEqual(["0.0.105", "0.0.104", "0.0.103", "0.0.102", "0.0.101", "0.0.100"]);
        expect(releases[0].date).toBe("2026-10-14");
        expect(releases[0].entries).toHaveLength(2);
        expect(releases[0].entries[0].type).toBe("fix");
        expect(releases[0].entries[0].text).toMatch(/^\*\*community:\*\* retry IPNS resolve/);
        // 0.0.100 has both a Bug Fixes and a Performance section.
        const perf = releases.find((release) => release.version === "0.0.100")!;
        expect(perf.entries.map((entry) => entry.type)).toEqual(["fix", "perf"]);
        expect(releases.find((release) => release.version === "0.0.102")!.entries[0].type).toBe("feat");
    });

    it("selects only the versions in (from, to]", () => {
        const releases = releasesInRange(parsePkcJsChangelog(pkcJsChangelog), "0.0.103", "0.0.105");
        expect(releases.map((release) => release.version)).toEqual(["0.0.105", "0.0.104"]);
        expect(releasesInRange(parsePkcJsChangelog(pkcJsChangelog), "0.0.105", "0.0.105")).toEqual([]);
    });

    it("compares versions numerically, not lexically", () => {
        expect(compareVersions("0.0.105", "0.0.99")).toBe(1);
        expect(compareVersions("0.1.0", "0.0.200")).toBe(1);
        expect(compareVersions("1.0.0-rc.1", "1.0.0")).toBe(-1);
        expect(compareVersions("0.0.105", "0.0.105")).toBe(0);
    });

    it("renders entries as type(scope): subject with the original pkc-js links", () => {
        const [release] = releasesInRange(parsePkcJsChangelog(pkcJsChangelog), "0.0.104", "0.0.105");
        const lines = renderPkcJsReleases([release]);
        expect(lines[0]).toBe("  * pkc-js [0.0.105](https://github.com/pkcprotocol/pkc-js/releases/tag/v0.0.105) (2026-10-14)");
        expect(lines[1]).toMatch(/^    \* fix\(community\): retry IPNS resolve on undici connect timeout/);
        expect(lines[1]).toContain("https://github.com/pkcprotocol/pkc-js/issues/384");
        expect(lines[2]).toMatch(/^    \* fix\(node\): stop listCommunitiesSync leaking an fd/);
        expect(lines).toHaveLength(3);
    });

    it("nests the pkc-js releases under the upgrade bullet of the newest section only", () => {
        const releases = releasesInRange(parsePkcJsChangelog(pkcJsChangelog), "0.0.103", "0.0.105");
        const enriched = insertPkcJsReleases(bitsocialChangelog, releases, { from: "0.0.103", to: "0.0.105" });
        const lines = enriched.split("\n");
        const upgradeIndex = lines.findIndex((line) => line.startsWith("* chore(deps): upgrade @pkcprotocol/pkc-js to 0.0.105"));
        expect(lines[upgradeIndex + 1]).toMatch(/^  \* pkc-js \[0\.0\.105\]/);
        expect(lines[upgradeIndex + 2]).toMatch(/^    \* fix\(community\): retry IPNS/);
        expect(lines[upgradeIndex + 3]).toMatch(/^    \* fix\(node\):/);
        expect(lines[upgradeIndex + 4]).toMatch(/^  \* pkc-js \[0\.0\.104\]/);
        expect(lines[upgradeIndex + 5]).toMatch(/^    \* fix\(community\): report why an author name/);
        expect(lines[upgradeIndex + 6]).toBe("* fix(daemon): something unrelated ([1111111](https://github.com/bitsocialnet/bitsocial-cli/commit/1111111))");
        // The older section is untouched.
        expect(enriched.split("## <small>0.19.101")[1]).toBe(bitsocialChangelog.split("## <small>0.19.101")[1]);
    });

    it("is idempotent", () => {
        const releases = releasesInRange(parsePkcJsChangelog(pkcJsChangelog), "0.0.103", "0.0.105");
        const once = insertPkcJsReleases(bitsocialChangelog, releases, { from: "0.0.103", to: "0.0.105" });
        expect(insertPkcJsReleases(once, releases, { from: "0.0.103", to: "0.0.105" })).toBe(once);
    });

    it("adds an upgrade bullet when the newest section has none", () => {
        const withoutBullet = bitsocialChangelog.replace(/^\* chore\(deps\): upgrade @pkcprotocol\/pkc-js to 0\.0\.105.*\n/m, "");
        const releases = releasesInRange(parsePkcJsChangelog(pkcJsChangelog), "0.0.104", "0.0.105");
        const section = newestSection(insertPkcJsReleases(withoutBullet, releases, { from: "0.0.104", to: "0.0.105" }));
        expect(section.split("\n").slice(-5)).toEqual([
            "* fix(daemon): something unrelated ([1111111](https://github.com/bitsocialnet/bitsocial-cli/commit/1111111))",
            "* chore(deps): upgrade @pkcprotocol/pkc-js from 0.0.104 to 0.0.105",
            "  * pkc-js [0.0.105](https://github.com/pkcprotocol/pkc-js/releases/tag/v0.0.105) (2026-10-14)",
            expect.stringMatching(/^    \* fix\(community\): retry IPNS/),
            expect.stringMatching(/^    \* fix\(node\): stop listCommunitiesSync/)
        ]);
    });

    it("extracts the newest section as release notes", () => {
        const notes = newestSection(bitsocialChangelog);
        expect(notes.startsWith("## <small>0.19.102 (2026-10-15)</small>")).toBe(true);
        expect(notes).toContain("* fix(daemon): something unrelated");
        expect(notes).not.toContain("0.19.101");
        expect(notes.endsWith("\n")).toBe(false);
    });

    it("reads the pinned pkc-js version out of package.json", () => {
        expect(pkcJsVersionFromPackageJson(JSON.stringify({ dependencies: { "@pkcprotocol/pkc-js": "0.0.105" } }))).toBe("0.0.105");
        expect(pkcJsVersionFromPackageJson(JSON.stringify({ devDependencies: { "@pkcprotocol/pkc-js": "^0.0.99" } }))).toBe("0.0.99");
        expect(pkcJsVersionFromPackageJson(JSON.stringify({ dependencies: {} }))).toBeUndefined();
        expect(pkcJsVersionFromPackageJson(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf-8"))).toMatch(/^\d+\.\d+\.\d+$/);
    });

    // The release-it hooks run the script through the ts-node ESM loader; make sure that whole path works.
    describe.skipIf(process.platform === "win32")("CLI", () => {
        const script = path.join(process.cwd(), "ci-bin", "pkc-js-changelog.ts");
        // Run from the repo root, like the release-it hooks do: the ts-node loader is resolved from cwd.
        const run = (...args: string[]) =>
            execFileSync(process.execPath, ["--no-warnings", "--loader", "ts-node/esm", script, ...args], { cwd: process.cwd(), encoding: "utf-8", stdio: "pipe" });

        it("enriches the changelog from a local source and prints the release notes", () => {
            const cwd = randomDirectory();
            const changelogPath = path.join(cwd, "CHANGELOG.md");
            fs.writeFileSync(changelogPath, bitsocialChangelog);

            run("enrich", "--changelog", changelogPath, "--from", "0.0.103", "--to", "0.0.105", "--source", fixturePath);
            const enriched = fs.readFileSync(changelogPath, "utf-8");
            expect(enriched).toContain("  * pkc-js [0.0.105]");
            expect(enriched).toContain("  * pkc-js [0.0.104]");
            expect(enriched).not.toContain("pkc-js [0.0.103]");

            const notes = run("release-notes", "--changelog", changelogPath);
            expect(notes).toBe(newestSection(enriched) + "\n");
            expect(notes).toContain("    * fix(node): stop listCommunitiesSync");
        });

        it("leaves the changelog alone and exits 0 when the source cannot be loaded", () => {
            const cwd = randomDirectory();
            const changelogPath = path.join(cwd, "CHANGELOG.md");
            fs.writeFileSync(changelogPath, bitsocialChangelog);
            run("enrich", "--changelog", changelogPath, "--from", "0.0.103", "--to", "0.0.105", "--source", path.join(cwd, "missing.md"));
            expect(fs.readFileSync(changelogPath, "utf-8")).toBe(bitsocialChangelog);
        });
    });
});
