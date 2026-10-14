# Changelog

## [0.0.105](https://github.com/pkcprotocol/pkc-js/compare/v0.0.104...v0.0.105) (2026-10-14)

### Bug Fixes

* **community:** retry IPNS resolve on undici connect timeout instead of stopping updates ([#384](https://github.com/pkcprotocol/pkc-js/issues/384)) ([#385](https://github.com/pkcprotocol/pkc-js/issues/385)) ([bc7fd42](https://github.com/pkcprotocol/pkc-js/commit/bc7fd4254e92fa561ef921cd42e9c62bbf39c81c)), closes [#265](https://github.com/pkcprotocol/pkc-js/issues/265) [#383](https://github.com/pkcprotocol/pkc-js/issues/383) [#346](https://github.com/pkcprotocol/pkc-js/issues/346) [#383](https://github.com/pkcprotocol/pkc-js/issues/383) [#265](https://github.com/pkcprotocol/pkc-js/issues/265) [#265](https://github.com/pkcprotocol/pkc-js/issues/265)
* **node:** stop listCommunitiesSync leaking an fd per directory under communities/ ([#382](https://github.com/pkcprotocol/pkc-js/issues/382)) ([ab2f3be](https://github.com/pkcprotocol/pkc-js/commit/ab2f3be3ca6011251d51f4c1da165c3df55943c1)), closes [#380](https://github.com/pkcprotocol/pkc-js/issues/380) [#380](https://github.com/pkcprotocol/pkc-js/issues/380)

## [0.0.104](https://github.com/pkcprotocol/pkc-js/compare/v0.0.103...v0.0.104) (2026-10-11)

### Bug Fixes

* **community:** report why an author name could not be verified, not a silent non-match ([#358](https://github.com/pkcprotocol/pkc-js/issues/358)) ([f35bff0](https://github.com/pkcprotocol/pkc-js/commit/f35bff09eb3f6c49cb374d160442cd92dc29706a)), closes [#353](https://github.com/pkcprotocol/pkc-js/issues/353) [#354](https://github.com/pkcprotocol/pkc-js/issues/354) [#353](https://github.com/pkcprotocol/pkc-js/issues/353) [#353](https://github.com/pkcprotocol/pkc-js/issues/353) [#354](https://github.com/pkcprotocol/pkc-js/issues/354) [#353](https://github.com/pkcprotocol/pkc-js/issues/353) [#353](https://github.com/pkcprotocol/pkc-js/issues/353) [#353](https://github.com/pkcprotocol/pkc-js/issues/353) [#353](https://github.com/pkcprotocol/pkc-js/issues/353) [#353](https://github.com/pkcprotocol/pkc-js/issues/353) [#353](https://github.com/pkcprotocol/pkc-js/issues/353)

## [0.0.103](https://github.com/pkcprotocol/pkc-js/compare/v0.0.102...v0.0.103) (2026-10-11)

### Bug Fixes

* **community:** make CommunityEdit.name owner-only like the legacy address field ([#374](https://github.com/pkcprotocol/pkc-js/issues/374)) ([2855535](https://github.com/pkcprotocol/pkc-js/commit/2855535028dcd02ab48ff944d6402ea0c5921c8d)), closes [#373](https://github.com/pkcprotocol/pkc-js/issues/373) [#373](https://github.com/pkcprotocol/pkc-js/issues/373)

## [0.0.102](https://github.com/pkcprotocol/pkc-js/compare/v0.0.101...v0.0.102) (2026-10-11)

### Features

* **community:** add features.noArchive to block archiving posts ([#366](https://github.com/pkcprotocol/pkc-js/issues/366)) ([c088cd2](https://github.com/pkcprotocol/pkc-js/commit/c088cd299d947d1c5efc9d456769c5f09db70c1e))

## [0.0.101](https://github.com/pkcprotocol/pkc-js/compare/v0.0.100...v0.0.101) (2026-09-08)

### Bug Fixes

* **community:** bind excludes, roles and address lists to the signer and drop exclude.address ([#294](https://github.com/pkcprotocol/pkc-js/issues/294)) ([1c8fb8e](https://github.com/pkcprotocol/pkc-js/commit/1c8fb8e09e05b1429b6411641b3bbf00ed44c371)), closes [#295](https://github.com/pkcprotocol/pkc-js/issues/295) [#333](https://github.com/pkcprotocol/pkc-js/issues/333)

## [0.0.100](https://github.com/pkcprotocol/pkc-js/compare/v0.0.99...v0.0.100) (2026-09-07)

### Bug Fixes

* **publication:** drop duplicate challenge deliveries and reject a second challenge answer ([#349](https://github.com/pkcprotocol/pkc-js/issues/349)) ([#350](https://github.com/pkcprotocol/pkc-js/issues/350)) ([2522fae](https://github.com/pkcprotocol/pkc-js/commit/2522fae41550c5bc7508f995d5d0893bfe727b64)), closes [#340](https://github.com/pkcprotocol/pkc-js/issues/340)

### Performance

* **community:** pace gateway polls on max-age, fix If-None-Match, publish 20s record ttl ([#338](https://github.com/pkcprotocol/pkc-js/issues/338)) ([bdec5c3](https://github.com/pkcprotocol/pkc-js/commit/bdec5c3f1d079afda8cb402505b70276d1cda096)), closes [#328](https://github.com/pkcprotocol/pkc-js/issues/328) [#328](https://github.com/pkcprotocol/pkc-js/issues/328) [#328](https://github.com/pkcprotocol/pkc-js/issues/328) [#328](https://github.com/pkcprotocol/pkc-js/issues/328)

