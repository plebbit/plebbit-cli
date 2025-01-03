import { Flags, Command } from "@oclif/core";
import { ChildProcessWithoutNullStreams } from "child_process";

import defaults from "../../common-utils/defaults.js";
import { startIpfsNode } from "../../ipfs/startIpfs.js";
import path from "path";
import tcpPortUsed from "tcp-port-used";
import {
    getLanIpV4Address,
    getPlebbitLogger,
    loadIpfsConfigFile,
    parseMultiAddrIpfsApiToUrl,
    parseMultiAddrIpfsGatewayToUrl
} from "../../util.js";
import { startDaemonServer } from "../../webui/daemon-server.js";
import fs from "fs";
import fsPromise from "fs/promises";
import { EOL } from "node:os";
//@ts-expect-error
import type { InputPlebbitOptions } from "@plebbit/plebbit-js/dist/node/types.js";
//@ts-expect-error
import DataObjectParser from "dataobject-parser";

import * as remeda from "remeda";

const defaultPlebbitOptions: InputPlebbitOptions = {
    dataPath: defaults.PLEBBIT_DATA_PATH,
    httpRoutersOptions: defaults.HTTP_TRACKERS
};

export default class Daemon extends Command {
    static override description = `Run a network-connected Plebbit node. Once the daemon is running you can create and start your subplebbits and receive publications from users. The daemon will also serve web ui on http that can be accessed through a browser on any machine. Within the web ui users are able to browse, create and manage their subs fully P2P.
    Options can be passed to the RPC's instance through flag --plebbitOptions.optionName. For a list of plebbit options (https://github.com/plebbit/plebbit-js?tab=readme-ov-file#plebbitoptions)
    If you need to modify ipfs config, you should head to {plebbit-data-path}/.ipfs-plebbit-cli/config and modify the config file
    `;

    static override flags = {
        plebbitRpcUrl: Flags.url({
            description: "Specify Plebbit RPC URL to listen on",
            required: true,
            default: defaults.PLEBBIT_RPC_URL
        }),

        logPath: Flags.directory({
            description: "Specify a directory which will be used to store logs",
            required: true,
            default: defaults.PLEBBIT_LOG_PATH
        })
    };

    static override examples = [
        "plebbit daemon",
        "plebbit daemon --plebbitRpcUrl ws://localhost:53812",
        "plebbit daemon --plebbitOptions.dataPath /tmp/plebbit-datapath/",
        "plebbit daemon --plebbitOptions.chainProviders.eth[0].url https://ethrpc.com",
        "plebbit daemon --plebbitOptions.ipfsHttpClientsOptions[0] https://remoteipfsnode.com"
    ];

    private _setupLogger(Logger: any) {
        const envDebug: string | undefined = process.env["DEBUG"];
        const debugNamespace = envDebug === "0" || envDebug === "" ? undefined : envDebug || "plebbit*, -plebbit*trace";
        if (debugNamespace) {
            console.log("Debug logs is on with namespace", `"${debugNamespace}"`);
            Logger.enable(debugNamespace);
        } else {
            console.log("Debug logs are disabled");
            Logger.disable();
        }
    }

    private async _getNewLogfileByEvacuatingOldLogsIfNeeded(logPath: string) {
        try {
            await fsPromise.mkdir(logPath, { recursive: true });
        } catch (e) {
            //@ts-expect-error
            if (e.code !== "EEXIST") throw e;
        }
        const logFiles = (await fsPromise.readdir(logPath, { withFileTypes: true })).filter((file) =>
            file.name.startsWith("plebbit_cli_daemon")
        );
        const logfilesCapacity = 5; // we only store 5 log files
        if (logFiles.length >= logfilesCapacity) {
            // we need to pick the oldest log to delete
            const logFileToDelete = logFiles.map((logFile) => logFile.name).sort()[0]; // TODO need to test this, not sure if it works
            console.log(`Will remove log (${logFileToDelete}) because we reached capacity (${logfilesCapacity})`);
            await fsPromise.rm(path.join(logPath, logFileToDelete));
        }

        return path.join(logPath, `plebbit_cli_daemon_${new Date().toISOString().replace(/:/g, "-")}.log`);
    }

    private async _pipeDebugLogsToLogFile(logPath: string) {
        const logFilePath = await this._getNewLogfileByEvacuatingOldLogsIfNeeded(logPath);

        const logFile = fs.createWriteStream(logFilePath, { flags: "a" });
        const stdoutWrite = process.stdout.write.bind(process.stdout);
        const stderrWrite = process.stderr.write.bind(process.stderr);

        const removeColor = (data: string | Uint8Array) => {
            const parsedData = data instanceof Uint8Array ? Buffer.from(data).toString() : data;
            return parsedData.replaceAll(/\u001b\[.*?m/g, "");
        };

        const isLogFileOverLimit = () => logFile.bytesWritten > 20000000; // 20mb

        process.stdout.write = (...args) => {
            //@ts-expect-error
            const res = stdoutWrite(...args);
            if (!isLogFileOverLimit()) logFile.write(removeColor(args[0]) + EOL);
            return res;
        };

        process.stderr.write = (...args) => {
            //@ts-expect-error
            const res = stderrWrite(...args);
            if (!isLogFileOverLimit()) logFile.write(removeColor(args[0]).trimStart() + EOL);
            return res;
        };

        console.log("Will store stderr + stdout log to", logFilePath);

        // errors aren't console logged
        process.on("uncaughtException", console.error);
        process.on("unhandledRejection", console.error);

        process.on("exit", () => logFile.close());
    }

    async run() {
        const { flags } = await this.parse(Daemon);
        const Logger = await getPlebbitLogger();
        this._setupLogger(Logger);
        await this._pipeDebugLogsToLogFile(flags.logPath);
        const log = Logger("plebbit-cli:daemon");

        log(`flags: `, flags);

        const plebbitRpcUrl = new URL(flags.plebbitRpcUrl);

        const plebbitOptionsFlagNames = Object.keys(flags).filter((flag) => flag.startsWith("plebbitOptions"));
        const plebbitOptionsFromFlag: InputPlebbitOptions | undefined =
            plebbitOptionsFlagNames.length > 0
                ? DataObjectParser.transpose(remeda.pick(flags, plebbitOptionsFlagNames))["_data"]?.["plebbitOptions"]
                : undefined;

        if (plebbitOptionsFromFlag?.plebbitRpcClientsOptions && plebbitRpcUrl.toString() !== defaults.PLEBBIT_RPC_URL.toString()) {
            this.error(
                "Can't provide plebbitOptions.plebbitRpcClientsOptions and --plebbitRpcUrl simuatelounsly. You have to choose between connecting to an RPC or starting up a new RPC"
            );
        }

        if (plebbitOptionsFromFlag?.ipfsHttpClientsOptions && plebbitOptionsFromFlag.ipfsHttpClientsOptions.length !== 1)
            this.error("Can't provide plebbitOptions.ipfsHttpClientOptions as an array with more than 1 element, or as a non array");

        if (plebbitOptionsFromFlag?.ipfsGatewayUrls && plebbitOptionsFromFlag.ipfsGatewayUrls.length !== 1)
            this.error("Can't provide plebbitOptions.ipfsGatewayUrls as an array with more than 1 element, or as a non array");

        const ipfsConfig = await loadIpfsConfigFile(plebbitOptionsFromFlag?.dataPath || defaultPlebbitOptions.dataPath!);
        const ipfsApiEndpoint = plebbitOptionsFromFlag?.ipfsHttpClientsOptions
            ? new URL(plebbitOptionsFromFlag.ipfsHttpClientsOptions[0]!.toString())
            : ipfsConfig?.["Addresses"]?.["API"]
            ? await parseMultiAddrIpfsApiToUrl(ipfsConfig?.["Addresses"]?.["API"])
            : defaults.IPFS_API_URL;
        const ipfsGatewayEndpoint = plebbitOptionsFromFlag?.ipfsGatewayUrls
            ? new URL(plebbitOptionsFromFlag.ipfsGatewayUrls[0])
            : ipfsConfig?.["Addresses"]?.["Gateway"]
            ? await parseMultiAddrIpfsGatewayToUrl(ipfsConfig?.["Addresses"]?.["Gateway"])
            : defaults.IPFS_GATEWAY_URL;

        defaultPlebbitOptions.ipfsHttpClientsOptions = [ipfsApiEndpoint.toString()];
        const mergedPlebbitOptions = { ...defaultPlebbitOptions, ...plebbitOptionsFromFlag };
        log("Merged plebbit options that will be used for this node", mergedPlebbitOptions);

        let mainProcessExited = false;
        // Ipfs Node may fail randomly, we need to set a listener so when it exits because of an error we restart it
        let ipfsProcess: ChildProcessWithoutNullStreams | undefined;
        const keepIpfsUp = async () => {
            const ipfsApiPort = Number(ipfsApiEndpoint.port);
            if (ipfsProcess || usingDifferentProcessRpc) return; // already started, no need to intervene
            const isIpfsApiPortTaken = await tcpPortUsed.check(ipfsApiPort, ipfsApiEndpoint.hostname);
            if (isIpfsApiPortTaken) {
                log.trace(
                    `Ipfs API already running on port (${ipfsApiPort}) by another program. Plebbit-cli will use the running ipfs daemon instead of starting a new one`
                );
                return;
            }
            ipfsProcess = await startIpfsNode(ipfsApiEndpoint, ipfsGatewayEndpoint, mergedPlebbitOptions.dataPath!);
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
            const isRpcPortTaken = await tcpPortUsed.check(Number(plebbitRpcUrl.port), plebbitRpcUrl.hostname);
            if (isRpcPortTaken && usingDifferentProcessRpc) return;
            if (isRpcPortTaken) {
                log(
                    `Plebbit RPC is already running (${plebbitRpcUrl}) by another program. Plebbit-cli will use the running RPC server, and if shuts down, plebbit-cli will start a new RPC instance`
                );
                console.log("Using the already started RPC server at:", plebbitRpcUrl);
                console.log("plebbit-cli daemon will monitor the plebbit RPC and ipfs API to make sure they're always up");
                const Plebbit = await import("@plebbit/plebbit-js");
                const plebbit = await Plebbit.default({ plebbitRpcClientsOptions: [plebbitRpcUrl.toString()] });
                await new Promise((resolve) => plebbit.once("subplebbitschange", resolve));
                plebbit.on("error", () => {});
                console.log(`Subplebbits in data path: `, plebbit.subplebbits);
                usingDifferentProcessRpc = true;
                return;
            }

            const daemonServer = await startDaemonServer(plebbitRpcUrl, ipfsGatewayEndpoint, mergedPlebbitOptions);

            usingDifferentProcessRpc = false;
            startedOwnRpc = true;
            console.log(`plebbit rpc: listening on ${plebbitRpcUrl} (local connections only)`);
            console.log(`plebbit rpc: listening on ${plebbitRpcUrl}/${daemonServer.rpcAuthKey} (secret auth key for remote connections)`);

            console.log(`Plebbit data path: ${path.resolve(mergedPlebbitOptions.dataPath!)}`);
            console.log(`Subplebbits in data path: `, daemonServer.listedSub);

            const localIpAddress = "localhost";
            const remoteIpAddress = getLanIpV4Address() || localIpAddress;
            const rpcPort = plebbitRpcUrl.port;
            for (const webui of daemonServer.webuis) {
                console.log(`WebUI (${webui.name}): http://${localIpAddress}:${rpcPort}${webui.endpointLocal} (local connections only)`);
                console.log(
                    `WebUI (${webui.name}): http://${remoteIpAddress}:${rpcPort}${webui.endpointRemote} (secret auth key for remote connections)`
                );
            }
        };

        const isRpcPortTaken = await tcpPortUsed.check(Number(plebbitRpcUrl.port), plebbitRpcUrl.hostname);

        if (!plebbitOptionsFromFlag?.ipfsHttpClientsOptions && !isRpcPortTaken && !usingDifferentProcessRpc) await keepIpfsUp();
        await createOrConnectRpc();

        setInterval(async () => {
            const isRpcPortTaken = await tcpPortUsed.check(Number(plebbitRpcUrl.port), plebbitRpcUrl.hostname);
            if (!plebbitOptionsFromFlag?.ipfsHttpClientsOptions && !isRpcPortTaken && !usingDifferentProcessRpc) await keepIpfsUp();
            else if (plebbitOptionsFromFlag?.ipfsHttpClientsOptions && !usingDifferentProcessRpc) await keepIpfsUp();
            await createOrConnectRpc();
        }, 5000);

        process.on("exit", () => {
            mainProcessExited = true;
            if (typeof ipfsProcess?.pid === "number" && !ipfsProcess.killed) process.kill(ipfsProcess.pid);
        });
    }
}
