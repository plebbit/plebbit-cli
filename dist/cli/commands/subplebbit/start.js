"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const util_js_1 = require("../../../util.js");
const base_command_js_1 = require("../../base-command.js");
const core_1 = require("@oclif/core");
class Start extends base_command_js_1.BaseCommand {
    static description = "Start a subplebbit";
    static strict = false; // To allow for variable length arguments
    static args = {
        addresses: core_1.Args.string({
            name: "addresses", // name of arg to show in help and reference with args[name]
            required: true,
            description: "Addresses of subplebbits to start. Separated by space"
        })
    };
    static examples = [];
    async run() {
        const { argv, flags } = await this.parse(Start);
        const addresses = argv;
        const log = (await (0, util_js_1.getPlebbitLogger)())("plebbit-cli:commands:subplebbit:start");
        log(`addresses: `, addresses);
        log(`flags: `, flags);
        const plebbit = await this._connectToPlebbitRpc(flags.plebbitRpcApiUrl.toString());
        for (const address of addresses) {
            await plebbit.plebbitRpcClient.startSubplebbit(address);
            this.log(address);
        }
        await plebbit.destroy();
    }
}
exports.default = Start;
