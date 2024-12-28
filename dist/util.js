"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPlebbitLogger = getPlebbitLogger;
exports.getLanIpV4Address = getLanIpV4Address;
exports.loadIpfsConfigFile = loadIpfsConfigFile;
exports.parseMultiAddrIpfsApiToUrl = parseMultiAddrIpfsApiToUrl;
exports.parseMultiAddrIpfsGatewayToUrl = parseMultiAddrIpfsGatewayToUrl;
const tslib_1 = require("tslib");
const os_1 = tslib_1.__importDefault(require("os"));
const path_1 = tslib_1.__importDefault(require("path"));
const fs_1 = tslib_1.__importDefault(require("fs"));
const fsPromises = tslib_1.__importStar(require("fs/promises"));
async function getPlebbitLogger() {
    const Logger = await import("@plebbit/plebbit-logger");
    return Logger.default;
}
function getLanIpV4Address() {
    const allInterfaces = os_1.default.networkInterfaces();
    for (const k in allInterfaces) {
        const specificInterfaceInfos = allInterfaces[k];
        if (!specificInterfaceInfos)
            continue;
        const lanAddress = specificInterfaceInfos.filter((info) => info.family === "IPv4" && !info.internal)[0]
            ?.address;
        if (lanAddress)
            return lanAddress;
    }
    return undefined;
}
async function loadIpfsConfigFile(plebbitDataPath) {
    const ipfsFilePath = path_1.default.join(plebbitDataPath, ".ipfs-plebbit-cli", "config");
    if (!fs_1.default.existsSync(ipfsFilePath))
        return undefined;
    const ipfsConfig = JSON.parse((await fsPromises.readFile(ipfsFilePath)).toString());
    return ipfsConfig;
}
async function parseMultiAddr(multiAddrString) {
    const module = await import("@multiformats/multiaddr");
    return module.multiaddr(multiAddrString);
}
async function parseMultiAddrIpfsApiToUrl(ipfsApimultiAddrString) {
    const multiAddrObj = await parseMultiAddr(ipfsApimultiAddrString);
    return new URL(`http://${multiAddrObj.nodeAddress().address}:${multiAddrObj.nodeAddress().port}/api/v0`);
}
async function parseMultiAddrIpfsGatewayToUrl(ipfsGatewaymultiAddrString) {
    const multiAddrObj = await parseMultiAddr(ipfsGatewaymultiAddrString);
    return new URL(`http://${multiAddrObj.nodeAddress().address}:${multiAddrObj.nodeAddress().port}`);
}
