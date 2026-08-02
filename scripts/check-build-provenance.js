import {
  assertNoAmbiguousBuildInfo,
  loadCurrentReistBuild,
} from "./lib/build-provenance.js";

assertNoAmbiguousBuildInfo();
const build = loadCurrentReistBuild();

console.log(
  `Build-Provenienz geprüft: ${build.buildInfoId}, ` +
    `solc ${build.compilerLongVersion}, SHA-256 ${build.inputSha256}.`
);
