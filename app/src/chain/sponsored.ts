import { createSmartAccountClient } from "permissionless";
import { to7702SimpleSmartAccount } from "permissionless/accounts";
import { createPimlicoClient } from "permissionless/clients/pimlico";
import { http, type Address, type Hex, type PublicClient } from "viem";
import { entryPoint08Address } from "viem/account-abstraction";
import { sepolia } from "viem/chains";
import { gameAccount } from "./wallet";

// Game-wallet moves go out as EIP-7702 user ops via a Pimlico paymaster. Under 7702 msg.sender stays
// the player, so Zama ACLs and input proofs still work.
// The Pimlico key lives on the server: /api/pimlico adds it (see server/pimlico.ts).
export const sponsorshipReady = () => import.meta.env.VITE_GASLESS !== "off";

type Send = (call: { to: Address; data: Hex }) => Promise<Hex>;
let sender: Promise<Send> | null = null;

export function sponsored(pub: PublicClient): Promise<Send> {
  sender ??= (async () => {
    const url = `${location.origin}/api/pimlico`;
    const pimlico = createPimlicoClient({ transport: http(url), entryPoint: { address: entryPoint08Address, version: "0.8" } });
    const owner = gameAccount();
    const account = await to7702SimpleSmartAccount({ client: pub, owner, entryPoint: { address: entryPoint08Address, version: "0.8" } });
    const client = createSmartAccountClient({
      account,
      chain: sepolia,
      client: pub,
      bundlerTransport: http(url),
      paymaster: pimlico,
      userOperation: { estimateFeesPerGas: async () => (await pimlico.getUserOperationGasPrice()).fast },
    });
    // viem only puts a placeholder 7702 authorization on the first move, so sign the real one.
    const upgrade = async () =>
      (await account.isDeployed()) ? undefined : owner.signAuthorization({ address: account.authorization.address, chainId: sepolia.id, nonce: await pub.getTransactionCount({ address: owner.address }) });
    return async (call) => client.sendTransaction({ to: call.to, data: call.data, value: 0n, authorization: await upgrade() });
  })();
  return sender;
}
