"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startDaemonServer = startDaemonServer;
const tslib_1 = require("tslib");
const path_1 = tslib_1.__importDefault(require("path"));
const promises_1 = tslib_1.__importDefault(require("fs/promises"));
const util_1 = require("../util");
const crypto_1 = require("crypto");
const express_1 = tslib_1.__importDefault(require("express"));
async function _generateModifiedIndexHtmlWithRpcSettings(webuiPath, webuiName, ipfsGatewayPort) {
    const indexHtmlString = (await promises_1.default.readFile(path_1.default.join(webuiPath, "index.html"))).toString();
    const defaultRpcOptionString = `[window.location.origin.replace("https://", "wss://").replace("http://", "ws://") + window.location.pathname.split('/' + '${webuiName}')[0]]`;
    // Ipfs media only locally because ipfs gateway doesn't allow remote connections
    const defaultIpfsMedia = `if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")window.defaultMediaIpfsGatewayUrl = 'http://' + window.location.hostname + ':' + ${ipfsGatewayPort}`;
    const defaultOptionsString = `<script>window.defaultPlebbitOptions = {plebbitRpcClientsOptions: ${defaultRpcOptionString}};${defaultIpfsMedia};console.log(window.defaultPlebbitOptions, window.defaultMediaIpfsGatewayUrl)</script>`;
    const modifiedIndexHtmlContent = "<!DOCTYPE html>" + defaultOptionsString + indexHtmlString.replace("<!DOCTYPE html>", "");
    return modifiedIndexHtmlContent;
}
async function _generateRpcAuthKeyIfNotExisting(plebbitDataPath) {
    // generate plebbit rpc auth key if doesn't exist
    const plebbitRpcAuthKeyPath = path_1.default.join(plebbitDataPath, "auth-key");
    let plebbitRpcAuthKey;
    try {
        plebbitRpcAuthKey = await promises_1.default.readFile(plebbitRpcAuthKeyPath, "utf-8");
    }
    catch (e) {
        plebbitRpcAuthKey = (0, crypto_1.randomBytes)(32).toString("base64").replace(/[/+=]/g, "").substring(0, 40);
        await promises_1.default.writeFile(plebbitRpcAuthKeyPath, plebbitRpcAuthKey, { flag: "wx" });
    }
    return plebbitRpcAuthKey;
}
// The daemon server will host both RPC and webui on the same port
async function startDaemonServer(rpcUrl, ipfsGatewayUrl, plebbitOptions) {
    // Start plebbit-js RPC
    const log = (await (0, util_1.getPlebbitLogger)())("plebbit-cli:daemon:startDaemonServer");
    const webuiExpressApp = (0, express_1.default)();
    const httpServer = webuiExpressApp.listen(Number(rpcUrl.port));
    log("HTTP server is running on", "0.0.0.0" + ":" + rpcUrl.port);
    const rpcAuthKey = await _generateRpcAuthKeyIfNotExisting(plebbitOptions.dataPath);
    const PlebbitWsServer = await import("@plebbit/plebbit-js/dist/node/rpc/src/index.js");
    // Will add ability to edit later, but it's hard coded for now
    log("Will be passing plebbit options to RPC server", plebbitOptions);
    const rpcServer = await PlebbitWsServer.default.PlebbitWsServer({
        server: httpServer,
        plebbitOptions: plebbitOptions,
        authKey: rpcAuthKey
    });
    const webuisDir = path_1.default.join(__dirname, "..", "..", "dist", "webuis");
    const webUiNames = (await promises_1.default.readdir(webuisDir, { withFileTypes: true })).filter((file) => file.isDirectory()).map((file) => file.name);
    const webuis = [];
    log("Discovered webuis", webUiNames);
    for (const webuiNameWithVersion of webUiNames) {
        const webuiDirPath = path_1.default.join(webuisDir, webuiNameWithVersion);
        const webuiName = webuiNameWithVersion.split("-")[0]; // should be "seedit", "plebchan", "plebones"
        const modifiedIndexHtmlString = await _generateModifiedIndexHtmlWithRpcSettings(webuiDirPath, webuiName, Number(ipfsGatewayUrl.port));
        const endpointLocal = `/${webuiName}`;
        webuiExpressApp.use(endpointLocal, express_1.default.static(webuiDirPath, { index: false }));
        webuiExpressApp.get(endpointLocal, (req, res, next) => {
            const isLocal = req.socket.localAddress && req.socket.localAddress === req.socket.remoteAddress;
            log("Received local connection request for webui", endpointLocal, "with socket.localAddress", req.socket.localAddress, "and socket.remoteAddress", req.socket.remoteAddress);
            if (!isLocal)
                res.status(403).send("This endpoint does not exist for remote connections");
            else
                res.type("html").send(modifiedIndexHtmlString);
        });
        const endpointRemote = `/${rpcAuthKey}/${webuiName}`;
        webuiExpressApp.use(endpointRemote, express_1.default.static(webuiDirPath, { index: false }));
        webuiExpressApp.get(endpointRemote, (req, res, next) => {
            const isLocal = req.socket.localAddress && req.socket.localAddress === req.socket.remoteAddress;
            log("Received remote connection request for webui", endpointLocal, "with socket.localAddress", req.socket.localAddress, "and socket.remoteAddress", req.socket.remoteAddress, "with req.url", req.url);
            if (isLocal) {
                res.redirect(`http://localhost:${rpcUrl.port}/${webuiName}`);
            }
            else
                res.type("html").send(modifiedIndexHtmlString);
        });
        webuis.push({ name: webuiName, endpointLocal, endpointRemote });
    }
    process.on("exit", async () => {
        await rpcServer.destroy();
        httpServer.close();
    });
    const handlRpcExit = async (signal) => {
        log(`Detecting exit signal ${signal}, shutting down rpc server and webui`);
        await rpcServer.destroy();
        httpServer.close();
        process.exit();
    };
    ["SIGINT", "SIGTERM", "SIGHUP", "beforeExit"].forEach((exitSignal) => process.on(exitSignal, handlRpcExit));
    return { rpcAuthKey, listedSub: rpcServer.plebbit.subplebbits, webuis };
}
