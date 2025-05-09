import { Flags, ux } from "@oclif/core";
import { BaseCommand } from "../../base-command.js";
import { EOL } from "os";
import { getPlebbitLogger } from "../../../util.js";

export default class List extends BaseCommand {
    static override description = "List your subplebbits";

    static override examples = ["plebbit subplebbit list -q", "plebbit subplebbit list"];

    static override flags = {
        quiet: Flags.boolean({ char: "q", summary: "Only display subplebbit addresses" }),
        ...ux.table.flags()
    };

    async run(): Promise<void> {
        const { flags } = await this.parse(List);

        const log = (await getPlebbitLogger())("plebbit-cli:commands:subplebbit:list");
        log(`flags: `, flags);
        const plebbit = await this._connectToPlebbitRpc(flags.plebbitRpcUrl.toString());
        const subs = plebbit.subplebbits;
        if (flags.quiet) {
            this.log(subs.join(EOL));
        } else {
            const subsWithStarted = await Promise.all(
                subs.map(async (subAddress) => {
                    const subInstance = await plebbit.createSubplebbit({ address: subAddress });
                    return { address: subInstance.address, started: subInstance.started };
                })
            );
            ux.table(
                subsWithStarted,
                { address: {}, started: {} },
                {
                    printLine: this.log.bind(this),
                    ...flags,
                    sort: "-started"
                }
            );
        }
        await plebbit.destroy();
    }
}
