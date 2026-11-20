import * as fs from "fs";
import * as path from "path";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

// npx hardhat deploy --network sepolia --tags Snitch
const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const snitch = await hre.deployments.deploy("Snitch", { from: deployer, log: true });
  console.log(`Snitch: ${snitch.address} on ${hre.network.name}`);

  // Chapters 1-3 are in the constructor; 4-8 come from chapters.json (app/scripts/export-chapters.ts).
  const k = await hre.ethers.getContractAt("Snitch", snitch.address);
  const chapters = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "chapters.json"), "utf8")) as {
    id: number;
    name: string;
    crew: number;
    teams: number[];
    takes: number[];
    flags: number[];
    needs: number[];
    bans: number[];
    hasSkimmer: boolean;
    hasWiretap: boolean;
    rules: number;
    recruitAt: number;
  }[];
  for (const c of chapters) {
    if (Number(await k.chapterCount()) >= c.id) continue;
    const tx = await k.addChapter(c.name, c.crew, c.teams, c.takes, c.flags, c.needs, c.bans, c.hasSkimmer, c.hasWiretap, c.rules, c.recruitAt);
    await tx.wait();
    console.log(`  chapter ${c.id}: ${c.name}`);
  }

  // Export ABI + address for the frontend.
  const outDir = path.join(__dirname, "..", "abi");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "Snitch.json"), JSON.stringify(snitch.abi, null, 2) + "\n");
  if (hre.network.name === "hardhat") return;
  const addrFile = path.join(outDir, "addresses.json");
  const addrs = fs.existsSync(addrFile) ? JSON.parse(fs.readFileSync(addrFile, "utf8")) : {};
  const chainId = (await hre.ethers.provider.getNetwork()).chainId.toString();
  addrs[chainId] = {
    ...(addrs[chainId] ?? {}),
    network: hre.network.name,
    Snitch: snitch.address,
    snitchBlock: snitch.receipt?.blockNumber,
  };
  fs.writeFileSync(addrFile, JSON.stringify(addrs, null, 2) + "\n");
};
export default func;
func.id = "deploy_snitch";
func.tags = ["Snitch"];
