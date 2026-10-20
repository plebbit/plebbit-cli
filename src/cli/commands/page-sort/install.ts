import { Args, Flags } from "@oclif/core";
import { BaseCommand } from "../../base-command.js";
import defaults from "../../../common-utils/defaults.js";
import { validatePageSortFileFactory } from "@pkcprotocol/pkc-js/page-sorts";
import { importPackageFactory, installPackage, InvalidPackageArchiveError, InvalidPackageNameError, type InstallPackageResult } from "../../../common-utils/package-registry.js";
import { PAGE_SORT_PACKAGE_KIND, reloadPageSortsInDaemon } from "../../../page-sort-packages/page-sort-utils.js";

export default class Install extends BaseCommand {
    static override description = "Install a page sort package (npm package name, git URL, tarball URL, or local path)";

    static override aliases = ["page-sort:i", "page-sort:add"];

    static override args = {
        package: Args.string({
            description: "Package specifier — anything npm can install (name, name@version, git URL, tarball URL, local path)",
            required: true
        })
    };

    static override flags = {
        "pkcOptions.dataPath": Flags.directory({
            description: "Data path to install the page sort into",
            required: false
        })
    };

    static override examples = [
        "bitsocial page-sort install @pkcprotocol/active-page-sort",
        "bitsocial page-sort install @pkcprotocol/active-page-sort@1.0.0",
        "bitsocial page-sort install ./my-local-page-sort"
    ];

    async run(): Promise<void> {
        const startTime = Date.now();
        const { args, flags } = await this.parse(Install);
        const dataPath = flags["pkcOptions.dataPath"] || defaults.PKC_DATA_PATH;

        let installed: InstallPackageResult;
        try {
            installed = await installPackage(PAGE_SORT_PACKAGE_KIND, {
                packageSpec: args.package,
                dataPath,
                // Refuse anything a community would reject (e.g. a challenge package) before it replaces an install
                validate: async (pkgDir, pkg) =>
                    void validatePageSortFileFactory(await importPackageFactory(PAGE_SORT_PACKAGE_KIND, pkgDir, pkg), { name: pkg.name })
            });
        } catch (err) {
            if (err instanceof InvalidPackageArchiveError || err instanceof InvalidPackageNameError) this.error(err.message);
            throw err;
        }

        // Print success (npm-style)
        const version = installed.version ? `@${installed.version}` : "";
        const elapsedSeconds = Math.max(1, Math.round((Date.now() - startTime) / 1000));
        this.log(`${installed.replaced ? "changed" : "added"} ${installed.name}${version} in ${elapsedSeconds}s`);

        // Best-effort reload in the daemon at --pkcRpcUrl, so the install takes effect
        // without a restart
        if (await reloadPageSortsInDaemon(flags.pkcRpcUrl)) {
            this.log(`reloaded ${installed.name}${version} in the daemon at ${flags.pkcRpcUrl}`);
        }
    }
}
