import { Args, Flags } from "@oclif/core";
import { BaseCommand } from "../../base-command.js";
import defaults from "../../../common-utils/defaults.js";
import { removePackage, PackageNotInstalledError } from "../../../common-utils/package-registry.js";
import { CHALLENGE_PACKAGE_KIND, reloadChallengesInDaemon } from "../../../challenge-packages/challenge-utils.js";

export default class Remove extends BaseCommand {
    static override description = "Remove an installed challenge package";

    static override aliases = ["challenge:uninstall", "challenge:rm", "challenge:un"];

    static override args = {
        name: Args.string({
            description: "The challenge package name (e.g., my-challenge or @scope/my-challenge)",
            required: true
        })
    };

    static override flags = {
        "pkcOptions.dataPath": Flags.directory({
            description: "Data path where challenges are installed",
            required: false
        })
    };

    static override examples = [
        "bitsocial challenge remove my-challenge",
        "bitsocial challenge remove @scope/my-challenge"
    ];

    async run(): Promise<void> {
        const { args, flags } = await this.parse(Remove);
        const dataPath = flags["pkcOptions.dataPath"] || defaults.PKC_DATA_PATH;

        let removed: { version?: string };
        try {
            removed = await removePackage(CHALLENGE_PACKAGE_KIND, { name: args.name, dataPath });
        } catch (err) {
            if (err instanceof PackageNotInstalledError) this.error(err.message);
            throw err;
        }

        this.log(`removed ${args.name}${removed.version ? `@${removed.version}` : ""}`);

        // Best-effort reload in the daemon at --pkcRpcUrl, so the removal takes effect
        // without a restart
        await reloadChallengesInDaemon(flags.pkcRpcUrl);
    }
}
