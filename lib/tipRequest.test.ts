import { describe, it, expect } from "vitest";
import {
  decodeBase58,
  encodeBase58,
  validateSolanaAddress,
  isValidSolanaAddress,
  validateSolAmount,
  isValidSolAmount,
  createTipRequest,
  parseTipRequestUri,
  DEFAULT_TIP_AMOUNT,
  DEFAULT_TIP_LABEL,
  DEFAULT_TIP_MESSAGE,
  EXPECTED_SOLANA_NETWORK,
} from "./tipRequest";

// Synthetic test public keys (explicitly synthetic, NOT real team or personal wallets):
// 1. System Program equivalent (32 zero bytes):
const SYNTHETIC_ZERO_ADDRESS = "11111111111111111111111111111111";
// 2. Synthetic recipient public key (Token program address: 32 bytes):
const SYNTHETIC_RECIPIENT = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
// 3. Synthetic reference public key (Memo program address: 32 bytes):
const SYNTHETIC_REFERENCE = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";

describe("Base58 Codec", () => {
  it("encodes and decodes 32 zero bytes as 32 ones", () => {
    const zeroBytes = new Uint8Array(32);
    const encoded = encodeBase58(zeroBytes);
    expect(encoded).toBe(SYNTHETIC_ZERO_ADDRESS);
    const decoded = decodeBase58(encoded);
    expect(decoded.length).toBe(32);
    expect(decoded.every((b) => b === 0)).toBe(true);
  });

  it("roundtrips arbitrary 32-byte buffers with leading zeros", () => {
    const bytes = new Uint8Array(32);
    bytes[0] = 0;
    bytes[1] = 0;
    bytes[2] = 42;
    bytes[31] = 255;
    const encoded = encodeBase58(bytes);
    const decoded = decodeBase58(encoded);
    expect(decoded).toEqual(bytes);
  });

  it("throws on empty or non-base58 characters", () => {
    expect(() => decodeBase58("")).toThrow(/Invalid base58 string/);
    expect(() => decodeBase58("0")).toThrow(/Invalid base58 character '0'/);
    expect(() => decodeBase58("O")).toThrow(/Invalid base58 character 'O'/);
    expect(() => decodeBase58("I")).toThrow(/Invalid base58 character 'I'/);
    expect(() => decodeBase58("l")).toThrow(/Invalid base58 character 'l'/);
    expect(() => decodeBase58("abc+def")).toThrow(/Invalid base58 character '\+'/);
  });
});

describe("Address Syntactic Validation", () => {
  it("accepts valid 32-byte base58 addresses", () => {
    expect(isValidSolanaAddress(SYNTHETIC_ZERO_ADDRESS)).toBe(true);
    expect(isValidSolanaAddress(SYNTHETIC_RECIPIENT)).toBe(true);
    expect(isValidSolanaAddress(SYNTHETIC_REFERENCE)).toBe(true);

    const bytes = validateSolanaAddress(SYNTHETIC_RECIPIENT);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBe(32);
  });

  it("rejects addresses with wrong decoded length", () => {
    // 31 zero bytes -> 31 ones
    const thirtyOneOnes = "1".repeat(31);
    expect(isValidSolanaAddress(thirtyOneOnes)).toBe(false);
    expect(() => validateSolanaAddress(thirtyOneOnes)).toThrow(/decoded to 31 bytes, expected exactly 32 bytes/);

    // 33 zero bytes -> 33 ones
    const thirtyThreeOnes = "1".repeat(33);
    expect(isValidSolanaAddress(thirtyThreeOnes)).toBe(false);
    expect(() => validateSolanaAddress(thirtyThreeOnes)).toThrow(/decoded to 33 bytes, expected exactly 32 bytes/);
  });

  it("rejects invalid characters, empty strings, and whitespace", () => {
    expect(isValidSolanaAddress("")).toBe(false);
    expect(isValidSolanaAddress("   ")).toBe(false);
    expect(isValidSolanaAddress(null)).toBe(false);
    expect(isValidSolanaAddress(undefined)).toBe(false);
    expect(isValidSolanaAddress(12345)).toBe(false);

    // Leading / trailing whitespace
    expect(() => validateSolanaAddress(` ${SYNTHETIC_RECIPIENT}`)).toThrow(/whitespace/);
    expect(() => validateSolanaAddress(`${SYNTHETIC_RECIPIENT} `)).toThrow(/whitespace/);

    // Disallowed Base58 characters (0, O, I, l)
    expect(() => validateSolanaAddress("0".repeat(32))).toThrow(/Invalid address base58 encoding/);
    expect(() => validateSolanaAddress("O".repeat(32))).toThrow(/Invalid address base58 encoding/);
    expect(() => validateSolanaAddress("I".repeat(32))).toThrow(/Invalid address base58 encoding/);
    expect(() => validateSolanaAddress("l".repeat(32))).toThrow(/Invalid address base58 encoding/);
  });
});

describe("SOL Amount Validation", () => {
  it("accepts valid decimal amounts up to 9 decimal places", () => {
    expect(validateSolAmount("0.01")).toBe("0.01");
    expect(validateSolAmount("0.000000001")).toBe("0.000000001"); // 1 lamport
    expect(validateSolAmount("1")).toBe("1");
    expect(validateSolAmount("1.0")).toBe("1.0");
    expect(validateSolAmount("5.50")).toBe("5.50");
    expect(validateSolAmount("100.123456789")).toBe("100.123456789");

    expect(isValidSolAmount("0.01")).toBe(true);
    expect(isValidSolAmount("0.000000001")).toBe(true);
    expect(isValidSolAmount("10")).toBe(true);
  });

  it("rejects amounts with more than 9 decimal places", () => {
    expect(isValidSolAmount("0.0000000001")).toBe(false); // 10 decimal places
    expect(() => validateSolAmount("0.0000000001")).toThrow(/up to 9 decimal places/);
  });

  it("rejects zero or non-positive amounts", () => {
    expect(isValidSolAmount("0")).toBe(false);
    expect(isValidSolAmount("0.0")).toBe(false);
    expect(isValidSolAmount("0.000000000")).toBe(false);
    expect(() => validateSolAmount("0")).toThrow(/strictly greater than zero/);
    expect(() => validateSolAmount("0.0")).toThrow(/strictly greater than zero/);
  });

  it("rejects signed numbers, scientific notation, and malformed strings", () => {
    expect(isValidSolAmount("-0.01")).toBe(false);
    expect(isValidSolAmount("+0.01")).toBe(false);
    expect(isValidSolAmount("1e-2")).toBe(false);
    expect(isValidSolAmount("1E5")).toBe(false);
    expect(isValidSolAmount(".01")).toBe(false); // missing leading zero before decimal
    expect(isValidSolAmount("01.5")).toBe(false); // invalid leading zero on integer
    expect(isValidSolAmount(" 0.01 ")).toBe(false);
    expect(isValidSolAmount("NaN")).toBe(false);
    expect(isValidSolAmount("Infinity")).toBe(false);
    expect(isValidSolAmount(0.01)).toBe(false); // must be string
    expect(isValidSolAmount(null)).toBe(false);
  });
});

describe("Tip Request URI Generation (createTipRequest)", () => {
  it("creates standard Solana Pay transfer request URI with defaults", () => {
    const result = createTipRequest({
      recipient: SYNTHETIC_RECIPIENT,
      reference: SYNTHETIC_REFERENCE,
    });

    expect(result.amount).toBe(DEFAULT_TIP_AMOUNT);
    expect(result.label).toBe(DEFAULT_TIP_LABEL);
    expect(result.message).toBe(DEFAULT_TIP_MESSAGE);
    expect(result.expectedNetwork).toBe(EXPECTED_SOLANA_NETWORK);

    // Exact URI verification
    const expectedUri = `solana:${SYNTHETIC_RECIPIENT}?amount=0.01&reference=${SYNTHETIC_REFERENCE}&label=DishDeals&message=Thanks%20for%20the%20deal`;
    expect(result.uri).toBe(expectedUri);
  });

  it("preserves exact custom amount, label, and message", () => {
    const result = createTipRequest({
      recipient: SYNTHETIC_RECIPIENT,
      reference: SYNTHETIC_REFERENCE,
      amount: "0.000000001",
      label: "Campus Sushi",
      message: "Half price roll deal!",
    });

    expect(result.amount).toBe("0.000000001");
    expect(result.label).toBe("Campus Sushi");
    expect(result.message).toBe("Half price roll deal!");
    expect(result.uri).toBe(
      `solana:${SYNTHETIC_RECIPIENT}?amount=0.000000001&reference=${SYNTHETIC_REFERENCE}&label=Campus%20Sushi&message=Half%20price%20roll%20deal!`
    );
  });

  it("allows recipient and reference to be the same 32-byte address without artificial restriction", () => {
    const result = createTipRequest({
      recipient: SYNTHETIC_RECIPIENT,
      reference: SYNTHETIC_RECIPIENT,
    });
    expect(result.recipient).toBe(SYNTHETIC_RECIPIENT);
    expect(result.reference).toBe(SYNTHETIC_RECIPIENT);
    expect(result.uri).toContain(`solana:${SYNTHETIC_RECIPIENT}?`);
    expect(result.uri).toContain(`reference=${SYNTHETIC_RECIPIENT}`);
  });

  it("rejects missing or invalid recipient", () => {
    expect(() =>
      createTipRequest({
        recipient: "",
        reference: SYNTHETIC_REFERENCE,
      })
    ).toThrow(/Missing or empty recipient/);

    expect(() =>
      createTipRequest({
        recipient: "not-a-valid-address",
        reference: SYNTHETIC_REFERENCE,
      })
    ).toThrow(/Invalid recipient/);
  });

  it("rejects missing or invalid reference", () => {
    expect(() =>
      createTipRequest({
        recipient: SYNTHETIC_RECIPIENT,
        reference: "",
      })
    ).toThrow(/Missing or empty reference/);

    expect(() =>
      createTipRequest({
        recipient: SYNTHETIC_RECIPIENT,
        reference: "invalid-reference",
      })
    ).toThrow(/Invalid reference/);
  });

  it("rejects malformed custom amount", () => {
    expect(() =>
      createTipRequest({
        recipient: SYNTHETIC_RECIPIENT,
        reference: SYNTHETIC_REFERENCE,
        amount: "0",
      })
    ).toThrow(/strictly greater than zero/);

    expect(() =>
      createTipRequest({
        recipient: SYNTHETIC_RECIPIENT,
        reference: SYNTHETIC_REFERENCE,
        amount: "0.0000000001",
      })
    ).toThrow(/up to 9 decimal places/);
  });
});

describe("Tip Request URI Parsing & Roundtrip (parseTipRequestUri)", () => {
  it("roundtrips created tip requests with exact fidelity", () => {
    const original = createTipRequest({
      recipient: SYNTHETIC_RECIPIENT,
      reference: SYNTHETIC_REFERENCE,
      amount: "0.05",
      label: "DishDeals",
      message: "Thanks for the deal",
    });

    const parsed = parseTipRequestUri(original.uri);
    expect(parsed.recipient).toBe(original.recipient);
    expect(parsed.reference).toBe(original.reference);
    expect(parsed.amount).toBe(original.amount);
    expect(parsed.label).toBe(original.label);
    expect(parsed.message).toBe(original.message);
    expect(parsed.expectedNetwork).toBe("devnet");
    expect(parsed.uri).toBe(original.uri);
  });

  it("rejects non-solana protocol scheme", () => {
    expect(() => parseTipRequestUri("https://solana.com/pay")).toThrow(/must start with "solana:" protocol scheme/);
    expect(() => parseTipRequestUri("solana")).toThrow(/must start with "solana:" protocol scheme/);
  });

  it("rejects missing reference parameter", () => {
    const invalidUri = `solana:${SYNTHETIC_RECIPIENT}?amount=0.01&label=DishDeals`;
    expect(() => parseTipRequestUri(invalidUri)).toThrow(/Missing required query parameter: reference/);
  });

  it("rejects arbitrary or forbidden query parameters (cluster bypass / callbacks)", () => {
    // Attempting cluster bypass via query parameter
    const clusterBypassUri = `solana:${SYNTHETIC_RECIPIENT}?amount=0.01&reference=${SYNTHETIC_REFERENCE}&cluster=devnet`;
    expect(() => parseTipRequestUri(clusterBypassUri)).toThrow(/Disallowed or unexpected query parameter "cluster"/);

    // Attempting callback injection
    const callbackUri = `solana:${SYNTHETIC_RECIPIENT}?amount=0.01&reference=${SYNTHETIC_REFERENCE}&callback=https://evil.com`;
    expect(() => parseTipRequestUri(callbackUri)).toThrow(/Disallowed or unexpected query parameter "callback"/);
  });
});
