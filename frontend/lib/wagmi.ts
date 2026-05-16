import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { arcTestnet } from "./chains";

export const config = getDefaultConfig({
  appName: "ARC.PUMP",
  // Free placeholder works for MetaMask injection. For WalletConnect-based wallets,
  // grab a real projectId from https://cloud.reown.com/ and set NEXT_PUBLIC_REOWN_PROJECT_ID.
  projectId:
    process.env.NEXT_PUBLIC_REOWN_PROJECT_ID || "arcpump-dev-placeholder",
  chains: [arcTestnet],
  ssr: true,
});
