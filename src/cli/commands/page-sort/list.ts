import { Flags, Command } from "@oclif/core";
import { EOL } from "os";
import path from "path";
import defaults from "../../../common-utils/defaults.js";
import { formatPackageNameVersion } from "../../../common-utils/package-registry.js";
import { getPageSortsDir, listInstalledPageSorts } from "../../../page-sort-packages/page-sort-utils.js";

export default class List extends Command {
    static override description = "List installed page sort packages";

    static override aliases = ["page-sort:ls"];

    static override flags = {
        quiet: Flags.boolean({ char: "q", summary: "Only display page sort names" }),
        "pkcOptions.dataPath": Flags.directory({
            description: "Data path where page sorts are installed",
            required: false
        })
    };

    static override examples = ["bitsocial page-sort list", "bitsocial page-sort list -q"];

    async run(): Promise<void> {
        const { flags } = await this.parse(List);
        const dataPath = flags["pkcOptions.dataPath"] || defaults.PKC_DATA_PATH;

        // Sort alphabetically like npm ls (readdir order is filesystem-dependent)
        const pageSorts = (await listInstalledPageSorts(dataPath)).sort((a, b) => a.name.localeCompare(b.name));

        if (pageSorts.length === 0) {
            this.log("No page sort packages installed.");
            return;
        }

        if (flags.quiet) {
            this.log(pageSorts.map((p) => p.name).join(EOL));
        } else {
            // npm-ls-style tree: page sorts dir header, then name@version entries
            this.log(path.resolve(getPageSortsDir(dataPath)));
            pageSorts.forEach((p, i) => {
                const branch = i === pageSorts.length - 1 ? "└── " : "├── ";
                this.log(`${branch}${formatPackageNameVersion(p)}`);
            });
        }
    }
}
