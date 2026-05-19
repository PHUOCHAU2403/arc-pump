import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { http } from "wagmi";
import { arcTestnet } from "./chains";

export const config = getDefaultConfig({
  appName: "ARC.PUMP",
  // Free placeholder works for MetaMask injection. For WalletConnect-based wallets,
  // grab a real projectId from https://cloud.reown.com/ and set NEXT_PUBLIC_REOWN_PROJECT_ID.
  projectId:
    process.env.NEXT_PUBLIC_REOWN_PROJECT_ID || "arcpump-dev-placeholder",
  chains: [arcTestnet],
  // Explicit HTTP transport for our custom chain. getDefaultConfig usually
  // infers this from the chain definition, but pinning it defensively avoids
  // any provider-injection surprises (browsers running multiple wallet
  // extensions can race on window.ethereum and confuse the default client).
  transports: {
    [arcTestnet.id]: http(arcTestnet.rpcUrls.default.http[0], {
      batch: true,
      retryCount: 3,
      retryDelay: 200,
    }),
  },
  ssr: true,
});
