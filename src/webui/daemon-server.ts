import path from "path";
import fs from "fs/promises";
import { getPlebbitLogger } from "../util";
import { randomBytes } from "crypto";
import express from "express";

async function _generateModifiedIndexHtmlWithRpcSettings(webuiPath: string, webuiName: string, ipfsGatewayPort: number) {
    const indexHtmlString = (await fs.readFile(path.join(webuiPath, "index_backup_no_rpc.html"))).toString();
    const defaultRpcOptionString = `[window.location.origin.replace("https://", "wss://").replace("http://", "ws://") + window.location.pathname.split('/' + '${webuiName}')[0]]`;
    // Ipfs media only locally because ipfs gateway doesn't allow remote connections
    const defaultIpfsMedia = `if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1" || window.location.hostname === "0.0.0.0")window.defaultMediaIpfsGatewayUrl = 'http://' + window.location.hostname + ':' + ${ipfsGatewayPort}`;
    const defaultOptionsString = `<script>window.defaultPlebbitOptions = {plebbitRpcClientsOptions: ${defaultRpcOptionString}};${defaultIpfsMedia};console.log(window.defaultPlebbitOptions, window.defaultMediaIpfsGatewayUrl)</script>`;

    const modifiedIndexHtmlContent = "<!DOCTYPE html>" + defaultOptionsString + indexHtmlString.replace("<!DOCTYPE html>", "");

    return modifiedIndexHtmlContent;
}

async function _generateRpcAuthKeyIfNotExisting(plebbitDataPath: string) {
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

// The daemon server will host both RPC and webui on the same port
export async function startDaemonServer(rpcUrl: URL, ipfsGatewayUrl: URL, plebbitOptions: any) {
    // Start plebbit-js RPC
    const log = (await getPlebbitLogger())("plebbit-cli:daemon:startDaemonServer");
    const webuiExpressApp = express();
    const httpServer = webuiExpressApp.listen(Number(rpcUrl.port));
    log("HTTP server is running on", "0.0.0.0" + ":" + rpcUrl.port);
    const rpcAuthKey = await _generateRpcAuthKeyIfNotExisting(plebbitOptions.dataPath!);
    const PlebbitWsServer = await import("@plebbit/plebbit-js/rpc");

    // Will add ability to edit later, but it's hard coded for now

    log("Will be passing plebbit options to RPC server", plebbitOptions);

    const rpcServer = await PlebbitWsServer.default.PlebbitWsServer({
        server: httpServer,
        plebbitOptions: plebbitOptions,
        authKey: rpcAuthKey
    });

    const webuisDir = path.join(__dirname, "..", "..", "dist", "webuis");

    const webUiNames = (await fs.readdir(webuisDir, { withFileTypes: true })).filter((file) => file.isDirectory()).map((file) => file.name);

    const webuis: { name: string; endpointLocal: string; endpointRemote: string }[] = [];
    log("Discovered webuis", webUiNames);
    for (const webuiNameWithVersion of webUiNames) {
        const webuiDirPath = path.join(webuisDir, webuiNameWithVersion);
        const webuiName = webuiNameWithVersion.split("-")[0]; // should be "seedit", "plebchan", "plebones"

        const modifiedIndexHtmlString = await _generateModifiedIndexHtmlWithRpcSettings(
            webuiDirPath,
            webuiName,
            Number(ipfsGatewayUrl.port)
        );

        const endpointLocal = `/${webuiName}`;
        webuiExpressApp.use(endpointLocal, express.static(webuiDirPath, { index: false }));
        webuiExpressApp.get(endpointLocal, (req, res, next) => {
            const isLocal = req.socket.localAddress && req.socket.localAddress === req.socket.remoteAddress;
            log(
                "Received local connection request for webui",
                endpointLocal,
                "with socket.localAddress",
                req.socket.localAddress,
                "and socket.remoteAddress",
                req.socket.remoteAddress
            );
            if (!isLocal) res.status(403).send("This endpoint does not exist for remote connections");
            else {
                res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
                res.set("Expires", "-1");
                res.set("Pragma", "no-cache");
                res.type("html").send(modifiedIndexHtmlString);
            }
        });

        const endpointRemote = `/${rpcAuthKey}/${webuiName}`;
        webuiExpressApp.use(endpointRemote, express.static(webuiDirPath, { index: false }));
        webuiExpressApp.get(endpointRemote, (req, res, next) => {
            const isLocal = req.socket.localAddress && req.socket.localAddress === req.socket.remoteAddress;
            log(
                "Received remote connection request for webui",
                endpointLocal,
                "with socket.localAddress",
                req.socket.localAddress,
                "and socket.remoteAddress",
                req.socket.remoteAddress,
                "with req.url",
                req.url
            );

            if (isLocal) {
                res.redirect(`http://localhost:${rpcUrl.port}/${webuiName}`);
            } else {
                res.set("Cache-Control", "public, max-age=600"); // 600 seconds = 10 minutes
                res.type("html").send(modifiedIndexHtmlString);
            }
        });

        webuis.push({ name: webuiName, endpointLocal, endpointRemote });
    }
    let daemonServerDestroyed = false;

    const cleanupDaemonServer = async () => {
        if (daemonServerDestroyed) return;
        await rpcServer.destroy();
        httpServer.close();
        daemonServerDestroyed = true;
    };

    return { rpcAuthKey, listedSub: rpcServer.plebbit.subplebbits, webuis, destroy: cleanupDaemonServer };
}
