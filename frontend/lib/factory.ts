// Deployed on Arc Testnet 2026-05-14
// https://testnet.arcscan.app/address/0x18c0f8f2a6D29328F5ea62c6D6960CdC560B7830
export const FACTORY_ADDRESS =
  "0x18c0f8f2a6D29328F5ea62c6D6960CdC560B7830" as const;

export const FACTORY_ABI = [
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
