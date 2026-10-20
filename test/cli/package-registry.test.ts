import { describe, it, expect } from "vitest";
import path from "path";
import { packageNameToDir } from "../../src/common-utils/package-registry.js";

// A package name becomes a directory under ${dataPath}/<subdir>. Without validation, `remove ../communities` resolved
// to ${dataPath}/communities and deleted it, and a package.json name with `..` could install anywhere.

describe("packageNameToDir", () => {
    const packagesDir = path.join(path.sep, "data", "page-sorts");

    it("maps unscoped and scoped npm names inside the packages dir", () => {
        expect(packageNameToDir(packagesDir, "active-page-sort")).toBe(path.join(packagesDir, "active-page-sort"));
        expect(packageNameToDir(packagesDir, "@pkcprotocol/active-page-sort")).toBe(path.join(packagesDir, "@pkcprotocol", "active-page-sort"));
        expect(packageNameToDir(packagesDir, "a.b_c-d~e")).toBe(path.join(packagesDir, "a.b_c-d~e"));
    });

    for (const name of [
        "../communities",
        "..",
        ".",
        "@scope/..",
        "@../x",
        "a/b",
        "@scope",
        "@scope/a/b",
        "foo\\..\\..\\bar",
        "",
        "/etc",
        ".hidden"
    ]) {
        it(`rejects ${JSON.stringify(name)}`, () => {
            expect(() => packageNameToDir(packagesDir, name)).toThrow(/Invalid package name/);
        });
    }
});
