import * as fs from "fs";
import * as path from "path";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

// SnitchPass, SnitchWardrobe, SnitchPots. Sepolia uses Zama's cUSDT mock; local runs deploy a TestDollar.
// npx hardhat deploy --network sepolia --tags Shop
const CUSDT_MOCK_SEPOLIA = "0x4E7B06D78965594eB5EF5414c357ca21E1554491";
const PASS_PRICE = 4_990_000; // $4.99 (6 decimals)

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const chainId = (await hre.ethers.provider.getNetwork()).chainId.toString();
  const snitch = await hre.deployments.get("Snitch");
  const rooms = await hre.deployments.get("SnitchRooms");
  const token =
    chainId === "11155111" ? CUSDT_MOCK_SEPOLIA : (await hre.deployments.deploy("TestDollar", { from: deployer, log: true })).address;

  const pass = await hre.deployments.deploy("SnitchPass", { from: deployer, args: [token, PASS_PRICE], log: true });
  const wardrobe = await hre.deployments.deploy("SnitchWardrobe", { from: deployer, args: [snitch.address, "items/{id}.json"], log: true });
  const pots = await hre.deployments.deploy("SnitchPots", { from: deployer, args: [rooms.address, token, deployer], log: true });
  console.log(`Shop on ${hre.network.name}: pass ${pass.address}, wardrobe ${wardrobe.address}, pots ${pots.address}, dollar ${token}`);

  const outDir = path.join(__dirname, "..", "abi");
  for (const [name, d] of [
    ["SnitchPass", pass],
    ["SnitchWardrobe", wardrobe],
    ["SnitchPots", pots],
  ] as const)
    fs.writeFileSync(path.join(outDir, `${name}.json`), JSON.stringify(d.abi, null, 2) + "\n");
  if (hre.network.name === "hardhat") return;
  const addrFile = path.join(outDir, "addresses.json");
  const addrs = fs.existsSync(addrFile) ? JSON.parse(fs.readFileSync(addrFile, "utf8")) : {};
  addrs[chainId] = {
    ...(addrs[chainId] ?? {}),
    SnitchPass: pass.address,
    SnitchWardrobe: wardrobe.address,
    SnitchPots: pots.address,
    Dollar: token,
    shopBlock: pass.receipt?.blockNumber,
  };
  fs.writeFileSync(addrFile, JSON.stringify(addrs, null, 2) + "\n");
};
export default func;
func.id = "deploy_snitch_shop";
func.tags = ["Shop"];
func.dependencies = ["Snitch", "SnitchRooms"];
