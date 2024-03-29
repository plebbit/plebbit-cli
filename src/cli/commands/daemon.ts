import { Flags, Command } from "@oclif/core";
import { ChildProcessWithoutNullStreams } from "child_process";
// import { seedSubplebbits } from "../../seeder";

import defaults from "../../common-utils/defaults.js";
import { startIpfsNode } from "../../ipfs/startIpfs.js";
import path from "path";
import { randomBytes } from "crypto";
import fs from "fs/promises";
import tcpPortUsed from "tcp-port-used";
import { getPlebbitLogger } from "../../util.js";

export default class Daemon extends Command {
    static override description =
        "Run a network-connected Plebbit node. Once the daemon is running you can create and start your subplebbits and receive publications from users";

    static override flags = {
        plebbitDataPath: Flags.directory({
            description: "Path to plebbit data path where subplebbits and ipfs node are stored",
            required: true,
            default: defaults.PLEBBIT_DATA_PATH
        }),

        plebbitRpcPort: Flags.integer({
            description: "Specify Plebbit RPC port to listen on",
            required: true,
            default: defaults.PLEBBIT_RPC_API_PORT
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
        "plebbit daemon --plebbitRpcPort 80"
        // "plebbit daemon --seed",
        // "plebbit daemon --seed --seedSubs mysub.eth, myothersub.eth, 12D3KooWEKA6Fhp6qtyttMvNKcNCtqH2N7ZKpPy5rfCeM1otr5qU"
    ];

    private async _generateRpcAuthKeyIfNotExisting(plebbitDataPath: string) {
        // generate plebbit rpc auth key if doesn't exist
        const plebbitRpcAuthKeyPath = path.join(plebbitDataPath, "auth-key");
        let plebbitRpcAuthKey: string;
        try {
            plebbitRpcAuthKey = await fs.readFile(plebbitRpcAuthKeyPath, "utf-8");
        } catch (e) {
            plebbitRpcAuthKey = randomBytes(32).toString("base64").replace(/[/+=]/g, "").substring(0, 40);
            await fs.writeFile(plebbitRpcAuthKeyPath, plebbitRpcAuthKey, { flag: "wx" });
        }
        return plebbitRpcAuthKey;
    }

    async run() {
        const { flags } = await this.parse(Daemon);

        const log = (await getPlebbitLogger())("plebbit-cli:daemon");
        log(`flags: `, flags);

        const ipfsApiEndpoint = `http://localhost:${flags.ipfsApiPort}/api/v0`;
        const ipfsGatewayEndpoint = `http://localhost:${flags.ipfsGatewayPort}`;

        let mainProcessExited = false;
        // Ipfs Node may fail randomly, we need to set a listener so when it exits because of an error we restart it
        let ipfsProcess: ChildProcessWithoutNullStreams | undefined;
        const keepIpfsUp = async () => {
            if (ipfsProcess || usingDifferentProcessRpc) return; // already started, no need to intervene
            const isIpfsApiPortTaken = await tcpPortUsed.check(flags.ipfsApiPort, "127.0.0.1");
            if (isIpfsApiPortTaken) {
                log(
                    `Ipfs API already running on port (${flags.ipfsApiPort}) by another program. Plebbit-cli will use the running ipfs daemon instead of starting a new one`
                );
                return;
            }
            ipfsProcess = await startIpfsNode(flags.ipfsApiPort, flags.ipfsGatewayPort);
            log(`Started ipfs process with pid (${ipfsProcess.pid})`);
            console.log(`IPFS API listening on: ${ipfsApiEndpoint}`);
            console.log(`IPFS Gateway listening on: ${ipfsGatewayEndpoint}`);
            ipfsProcess.on("exit", async () => {
                // Restart IPFS process because it failed
                log(`Ipfs node with pid (${ipfsProcess?.pid}) exited`);
                if (!mainProcessExited) {
                    ipfsProcess = undefined;
                    await keepIpfsUp();
                } else ipfsProcess!.removeAllListeners();
            });
        };

        let startedOwnRpc = false;
        let usingDifferentProcessRpc = false;

        const createOrConnectRpc = async () => {
            if (startedOwnRpc) return;
            const isRpcPortTaken = await tcpPortUsed.check(flags.plebbitRpcPort, "127.0.0.1");
            if (isRpcPortTaken && usingDifferentProcessRpc) return;
            if (isRpcPortTaken) {
                log(
                    `Plebbit RPC is already running on port (${flags.plebbitRpcPort}) by another program. Plebbit-cli will use the running RPC server, and if shuts down, plebbit-cli will start a new RPC instance`
                );
                const plebbitRpcApiUrl = `ws://localhost:${flags.plebbitRpcPort}`;
                console.log("Using the already started RPC server at:", plebbitRpcApiUrl);
                console.log("plebbit-cli daemon will monitor the plebbit RPC and ipfs API to make sure they're always up");
                const Plebbit = await import("@plebbit/plebbit-js");
                const plebbit = await Plebbit.default({ plebbitRpcClientsOptions: [plebbitRpcApiUrl] });
                plebbit.on("error", () => {});
                console.log(`Subplebbits in data path: `, await plebbit.listSubplebbits());
                usingDifferentProcessRpc = true;
                return;
            }

            const rpcAuthKey = await this._generateRpcAuthKeyIfNotExisting(flags.plebbitDataPath);
            const PlebbitWsServer = await import("@plebbit/plebbit-js/dist/node/rpc/src/index.js");
            const rpcServer = await PlebbitWsServer.default.PlebbitWsServer({
                port: flags.plebbitRpcPort,
                plebbitOptions: {
                    ipfsHttpClientsOptions: [ipfsApiEndpoint],
                    dataPath: flags.plebbitDataPath
                },
                authKey: rpcAuthKey
            });
            usingDifferentProcessRpc = false;
            startedOwnRpc = true;
            console.log(`plebbit rpc: listening on ws://localhost:${flags.plebbitRpcPort} (local connections only)`);
            console.log(
                `plebbit rpc: listening on ws://localhost:${flags.plebbitRpcPort}/${rpcAuthKey} (secret auth key for remote connections)`
            );
            console.log(`Plebbit data path: ${path.resolve(<string>rpcServer.plebbit.dataPath)}`);
            console.log(`Subplebbits in data path: `, await rpcServer.plebbit.listSubplebbits());

            const handlRpcExit = async (signal: NodeJS.Signals) => {
                log(`in handle exit (${signal})`);
                await rpcServer.destroy();
                process.exit();
            };

            ["SIGINT", "SIGTERM", "SIGHUP", "beforeExit"].forEach((exitSignal) => process.on(exitSignal, handlRpcExit));
        };

        await keepIpfsUp();
        await createOrConnectRpc();

        setInterval(async () => {
            await keepIpfsUp();
            await createOrConnectRpc();
        }, 5000);

        process.on("exit", () => {
            mainProcessExited = true;
            if (typeof ipfsProcess?.pid === "number" && !ipfsProcess.killed) process.kill(ipfsProcess.pid);
        });
    }
}
