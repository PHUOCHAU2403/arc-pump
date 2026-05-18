// Factory addresses + ABIs (v1 and v2).
//
// v1 was deployed 2026-05-14 (PEPE and pre-feature-update tokens).
// v2 was deployed 2026-05-18 with per-token configurable max supply
// and trade fee (80% creator / 20% protocol, capped at 5%).
//
// Both factories coexist on chain. Frontend reads from both and tags
// each TokenInfo with its `version`. The Create page always deploys v2.

export const FACTORY_V1_ADDRESS =
  "0x18c0f8f2a6D29328F5ea62c6D6960CdC560B7830" as const;

export const FACTORY_V2_ADDRESS =
  "0x4dCf3238dd90E571e82bC07fD876B384f170546c" as const;

/** Default factory used by Create page (always points to latest version). */
export const FACTORY_ADDRESS = FACTORY_V2_ADDRESS;

/**
 * v1 factory ABI.
 * createToken: (name, symbol, imageURI, description) -> (token, curve)
 * TokenInfo: { token, curve, creator, name, symbol, imageURI, createdAt }
 */
export const FACTORY_V1_ABI = [
  {
    type: "function",
    name: "createToken",
    inputs: [
      { name: "name", type: "string" },
      { name: "symbol", type: "string" },
      { name: "imageURI", type: "string" },
      { name: "description", type: "string" },
    ],
    outputs: [
      { name: "token", type: "address" },
      { name: "curve", type: "address" },
    ],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "totalTokens",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "tokensBatch",
    inputs: [
      { name: "offset", type: "uint256" },
      { name: "limit", type: "uint256" },
    ],
    outputs: [
      {
        type: "tuple[]",
        components: [
          { name: "token", type: "address" },
          { name: "curve", type: "address" },
          { name: "creator", type: "address" },
          { name: "name", type: "string" },
          { name: "symbol", type: "string" },
          { name: "imageURI", type: "string" },
          { name: "createdAt", type: "uint256" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "createFee",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "curveOf",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "TokenCreated",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "token", type: "address", indexed: true },
      { name: "creator", type: "address", indexed: true },
      { name: "curve", type: "address", indexed: false },
      { name: "name", type: "string", indexed: false },
      { name: "symbol", type: "string", indexed: false },
      { name: "imageURI", type: "string", indexed: false },
    ],
  },
] as const;

/**
 * v2 factory ABI.
 * createToken: (name, symbol, imageURI, description, maxSupply, tradeFeeBps) -> (token, curve)
 * TokenInfo: v1 fields + { maxSupply, tradeFeeBps }
 */
export const FACTORY_V2_ABI = [
  {
    type: "function",
    name: "createToken",
    inputs: [
      { name: "name", type: "string" },
      { name: "symbol", type: "string" },
      { name: "imageURI", type: "string" },
      { name: "description", type: "string" },
      { name: "maxSupply", type: "uint256" },
      { name: "tradeFeeBps", type: "uint16" },
    ],
    outputs: [
      { name: "token", type: "address" },
      { name: "curve", type: "address" },
    ],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "totalTokens",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "tokensBatch",
    inputs: [
      { name: "offset", type: "uint256" },
      { name: "limit", type: "uint256" },
    ],
    outputs: [
      {
        type: "tuple[]",
        components: [
          { name: "token", type: "address" },
          { name: "curve", type: "address" },
          { name: "creator", type: "address" },
          { name: "name", type: "string" },
          { name: "symbol", type: "string" },
          { name: "imageURI", type: "string" },
          { name: "createdAt", type: "uint256" },
          { name: "maxSupply", type: "uint256" },
          { name: "tradeFeeBps", type: "uint16" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "createFee",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "curveOf",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "MIN_MAX_SUPPLY",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "MAX_MAX_SUPPLY",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "MAX_TRADE_FEE_BPS",
    inputs: [],
    outputs: [{ name: "", type: "uint16" }],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "TokenCreated",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "token", type: "address", indexed: true },
      { name: "creator", type: "address", indexed: true },
      { name: "curve", type: "address", indexed: false },
      { name: "name", type: "string", indexed: false },
      { name: "symbol", type: "string", indexed: false },
      { name: "imageURI", type: "string", indexed: false },
      { name: "maxSupply", type: "uint256", indexed: false },
      { name: "tradeFeeBps", type: "uint16", indexed: false },
    ],
  },
] as const;

/**
 * Legacy alias for components that haven't been migrated yet.
 * Points to v1 ABI to preserve existing behaviour. New code should use
 * FACTORY_V1_ABI or FACTORY_V2_ABI explicitly.
 */
export const FACTORY_ABI = FACTORY_V1_ABI;
