"use client";

import { createConfig, http } from "wagmi";
import { injected, metaMask, walletConnect } from "wagmi/connectors";
import { arcTestnet } from "./chains";

/**
 * Wagmi config built directly via createConfig instead of RainbowKit's
 * getDefaultConfig.
 *
 * Why: getDefaultConfig phones home to Reown/WalletConnect at init time. If
 * the projectId is missing/invalid (free placeholders return 403 from
 * api.web3modal.org), the resulting config never exposes a working public
 * client — usePublicClient returns undefined and every read silently no-ops.
 *
 * createConfig is deterministic and offline-safe: the HTTP transport is wired
 * up unconditionally so reads work even when no wallet is connected and
 * even when WalletConnect's backend is down.
 *
 * WalletConnect is added only when a real projectId is present in env. Without
 * it, users on browsers without an injected wallet can still browse the dApp
 * read-only and connect via MetaMask if installed.
 */

const projectId = process.env.NEXT_PUBLIC_REOWN_PROJECT_ID;

const connectors = [
  injected({ shimDisconnect: true }),
  metaMask(),
  ...(projectId
    ? [
        walletConnect({
          projectId,
          metadata: {
            name: "Arc Pump",
            description: "Where ideas become markets.",
            url: "https://arc-pump.vercel.app",
            icons: [],
          },
        }),
      ]
    : []),
];

export const config = createConfig({
  chains: [arcTestnet],
  transports: {
    [arcTestnet.id]: http(arcTestnet.rpcUrls.default.http[0], {
      batch: true,
      retryCount: 3,
      retryDelay: 200,
    }),
  },
  connectors,
  ssr: true,
});
