import * as fs from "fs";
import * as path from "path";
import { artifacts } from "hardhat";

// Writes abi/Snitch.json and abi/SnitchRooms.json from the compiled artifacts.
// Usage: npx hardhat run scripts/export-abi.ts
async function main() {
  const outDir = path.join(__dirname, "..", "abi");
  fs.mkdirSync(outDir, { recursive: true });
  for (const name of ["Snitch", "SnitchRooms"]) {
    const a = await artifacts.readArtifact(name);
    fs.writeFileSync(path.join(outDir, `${name}.json`), JSON.stringify(a.abi, null, 2) + "\n");
  }
  console.log(`ABI written to ${outDir}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
