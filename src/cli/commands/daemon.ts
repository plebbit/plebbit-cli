import { Flags, Command } from "@oclif/core";
import Logger from "@plebbit/plebbit-logger";
import { ChildProcessWithoutNullStreams } from "child_process";
import { startApi } from "../../api/server.js";
import defaults from "../../common-utils/defaults.js";
import { startIpfsNode } from "../../ipfs/startIpfs.js";
import lodash from "lodash";
import fetch from "node-fetch";

export default class Daemon extends Command {
    static override description = "Run a network-connected Plebbit node";

    static override flags = {
        plebbitDataPath: Flags.directory({
            description: "Path to plebbit data path where subplebbits and ipfs node are stored",
            required: true,
            default: defaults.PLEBBIT_DATA_PATH
        }),

        seed: Flags.string({
            description:
                "The subplebbits to seed and support. Seeding helps subplebbits distribute their publications and latest updates, as well as receiving new publications. If the argument --seed is used without a list of subplebbit addresses then the default subs will be seeded",
            required: false
        }),

        plebbitApiPort: Flags.integer({
            description: "Specify Plebbit API port to listen on",
            required: true,
            default: defaults.PLEBBIT_API_PORT
        }),
        ipfsApiPort: Flags.integer({
            description: "Specify the API port of the ipfs node to listen on",
            required: true,
            default: defaults.IPFS_API_PORT
        }),
        ipfsGatewayPort: Flags.integer({
            description: "Specify the gateway port of the ipfs node to listen on",
            required: true,
            default: defaults.IPFS_GATEWAY_PORT
        })
    };

    static override examples = [
        "plebbit daemon",
        "plebbit daemon --seed",
        "plebbit daemon --seed mysub.eth, myothersub.eth, 12D3KooWEKA6Fhp6qtyttMvNKcNCtqH2N7ZKpPy5rfCeM1otr5qU"
    ];

    async run() {
        const { flags } = await this.parse(Daemon);

        const log = Logger("plebbit-cli:daemon");
        log(`flags: `, flags);

        let mainProcessExited = false;
        // Ipfs Node may fail randomly, we need to set a listener so when it exits because of an error we restart it
        let ipfsProcess: ChildProcessWithoutNullStreams;
        const keepIpfsUp = async () => {
            ipfsProcess = await startIpfsNode(flags.ipfsApiPort, flags.ipfsGatewayPort, false);
            log(`Started ipfs process with pid (${ipfsProcess.pid})`);
            ipfsProcess.on("exit", async () => {
                // Restart IPFS process because it failed
                log(`Ipfs node with pid (${ipfsProcess.pid}) exited`);
                if (!mainProcessExited) await keepIpfsUp();
                else ipfsProcess.removeAllListeners();
            });
        };

        let subsToSeed: string[] | undefined;

        if (flags.seed) {
            if (lodash.isEmpty(flags.seed)) {
                // load default subs here
                const res = await fetch("https://raw.githubusercontent.com/plebbit/temporary-default-subplebbits/master/subplebbits.json");
                const subs: { title: string; address: string }[] = await res.json();
                subsToSeed = subs.map((sub) => sub.address);
            } else subsToSeed = flags.seed.split(",");
        }

        log.trace(`subs to seed:`, subsToSeed);

        await keepIpfsUp();

        process.on("exit", () => (mainProcessExited = true) && process.kill(<number>ipfsProcess.pid));
        await startApi(
            flags.plebbitApiPort,
            `http://localhost:${flags.ipfsApiPort}/api/v0`,
            `http://localhost:${flags.ipfsApiPort}/api/v0`,
            flags.plebbitDataPath,
            subsToSeed
        );
    }
}
