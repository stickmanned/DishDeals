/**
 * Solana Pay Transfer Request Protocol Helper (T-15A)
 *
 * Implements a pure, zero-dependency, headless protocol helper for generating
 * and validating Solana Pay v1 transfer request URIs for tipping deal posters on Solana Devnet.
 *
 * Specification References:
 * - Solana Pay Transfer Request Specification: https://solana.com/docs/tools/solana-pay/specification/version1
 * - Solana Pay Transfer Requests Quickstart: https://solana.com/docs/tools/solana-pay/quickstart/transfer-requests
 *
 * Protocol & Architectural Constraints:
 * 1. Standard transfer request URI format:
 *    solana:<recipient>?amount=<amount>&reference=<reference>&label=<label>&message=<message>
 * 2. Network Selector Notice: Standard Solana Pay transfer request URIs carry NO cluster or network
 *    selector query parameter and CANNOT programmatically force a user's mobile wallet onto Devnet.
 *    Targeting Devnet requires explicit manual configuration in the user's mobile wallet.
 * 3. Reference Security: The reference is a fresh, public, 32-byte Ed25519 public key identifier used
 *    by clients to find and match the transaction on-chain via `findReference`. It is NEVER a private
 *    key or secret. Fresh randomness must be generated per request in the native client using a secure
 *    entropy source; this helper does not generate weak pseudo-randomness.
 * 4. Syntactic Validation Only: Base58 decoding validates that the public key is exactly 32 bytes.
 *    It cannot verify whether the account exists, is initialized, is funded, or is owned by a recipient.
 * 5. Decimal Units: Amounts are validated and preserved as exact decimal strings up to 9 decimal places
 *    (1 lamport = 0.000000001 SOL). Float arithmetic and fiat currency conversions are strictly avoided.
 * 6. No External Dependencies: Self-contained Base58 decoding in pure JavaScript/TypeScript.
 */

export const DEFAULT_TIP_AMOUNT = "0.01";
export const DEFAULT_TIP_LABEL = "DishDeals";
export const DEFAULT_TIP_MESSAGE = "Thanks for the deal";
export const EXPECTED_SOLANA_NETWORK = "devnet" as const;

/**
 * Bitcoin / Solana Base58 Alphabet (58 alphanumeric characters, omitting 0, O, I, l).
 */
const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const BASE58_MAP = new Map<string, number>();
for (let i = 0; i < BASE58_ALPHABET.length; i++) {
  BASE58_MAP.set(BASE58_ALPHABET[i], i);
}

/**
 * Decodes a Base58 string into raw bytes.
 * Preserves leading zero bytes (represented as '1's in Base58).
 *
 * @throws {Error} If the string is empty or contains non-Base58 characters.
 */
export function decodeBase58(str: string): Uint8Array {
  if (typeof str !== "string" || str.length === 0) {
    throw new Error("Invalid base58 string: input must be a non-empty string");
  }

  let leadingZeros = 0;
  for (let i = 0; i < str.length && str[i] === "1"; i++) {
    leadingZeros++;
  }

  let num = BigInt(0);
  const BIG_58 = BigInt(58);
  const BIG_8 = BigInt(8);
  const BIG_0 = BigInt(0);
  const BIG_FF = BigInt(0xff);

  for (let i = leadingZeros; i < str.length; i++) {
    const val = BASE58_MAP.get(str[i]);
    if (val === undefined) {
      throw new Error(`Invalid base58 character '${str[i]}' at index ${i}`);
    }
    num = num * BIG_58 + BigInt(val);
  }

  const bytes: number[] = [];
  while (num > BIG_0) {
    bytes.push(Number(num & BIG_FF));
    num = num >> BIG_8;
  }
  bytes.reverse();

  const result = new Uint8Array(leadingZeros + bytes.length);
  result.fill(0, 0, leadingZeros);
  result.set(bytes, leadingZeros);
  return result;
}

/**
 * Encodes a byte array into a Base58 string.
 * Preserves leading zero bytes as '1's.
 */
export function encodeBase58(bytes: Uint8Array): string {
  let leadingZeros = 0;
  for (let i = 0; i < bytes.length && bytes[i] === 0; i++) {
    leadingZeros++;
  }

  let num = BigInt(0);
  const BIG_58 = BigInt(58);
  const BIG_8 = BigInt(8);
  const BIG_0 = BigInt(0);

  for (let i = leadingZeros; i < bytes.length; i++) {
    num = (num << BIG_8) + BigInt(bytes[i]);
  }

  let str = "";
  while (num > BIG_0) {
    const rem = Number(num % BIG_58);
    num = num / BIG_58;
    str = BASE58_ALPHABET[rem] + str;
  }

  return "1".repeat(leadingZeros) + str;
}

/**
 * Validates that a string is a syntactically valid 32-byte Base58 Solana public key.
 *
 * @param address Candidate address string.
 * @param fieldName Label used in error messages (default: "address").
 * @returns Decoded 32-byte Uint8Array.
 * @throws {Error} If address is missing, contains invalid characters, or does not decode to exactly 32 bytes.
 */
export function validateSolanaAddress(address: unknown, fieldName = "address"): Uint8Array {
  if (typeof address !== "string" || address.trim().length === 0) {
    throw new Error(`Missing or empty ${fieldName}: expected valid 32-byte base58 string`);
  }
  if (address.trim() !== address) {
    throw new Error(`Invalid ${fieldName}: leading or trailing whitespace is not allowed`);
  }

  let bytes: Uint8Array;
  try {
    bytes = decodeBase58(address);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid ${fieldName} base58 encoding: ${msg}`);
  }

  if (bytes.length !== 32) {
    throw new Error(
      `Invalid ${fieldName} length: decoded to ${bytes.length} bytes, expected exactly 32 bytes`
    );
  }

  return bytes;
}

/**
 * Returns true if the input is a valid 32-byte Base58 Solana public key.
 */
export function isValidSolanaAddress(address: unknown): boolean {
  try {
    validateSolanaAddress(address);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates a SOL amount string.
 *
 * Rules:
 * - Must be a string.
 * - Non-negative, strictly positive (at least one non-zero digit).
 * - Up to 9 decimal places (fractional digits).
 * - Strict integer formatting (0 or [1-9]\d*; no leading zeros like "01.5", and no leading "." like ".01").
 * - No signs (+ or -), no whitespace, no scientific notation (1e-2), no NaN, no Infinity.
 *
 * @param amount Candidate amount string.
 * @returns The validated amount string.
 * @throws {Error} If amount violates formatting or precision rules.
 */
export function validateSolAmount(amount: unknown): string {
  if (typeof amount !== "string") {
    throw new Error("Amount must be a string representing exact SOL units");
  }

  const AMOUNT_REGEX = /^(?:0|[1-9]\d*)(?:\.\d{1,9})?$/;
  if (!AMOUNT_REGEX.test(amount)) {
    throw new Error(
      `Invalid amount "${amount}": must be a positive decimal string with up to 9 decimal places, leading zero before decimal point, and no signs, whitespace, or scientific notation`
    );
  }

  // Ensure strictly positive (> 0)
  if (!/[1-9]/.test(amount)) {
    throw new Error(`Invalid amount "${amount}": amount must be strictly greater than zero`);
  }

  return amount;
}

/**
 * Returns true if the input is a valid SOL amount string.
 */
export function isValidSolAmount(amount: unknown): boolean {
  try {
    validateSolAmount(amount);
    return true;
  } catch {
    return false;
  }
}

export interface TipRequestParams {
  /**
   * Base58 public key of the recipient (e.g. deal author's wallet address).
   * Must decode to exactly 32 bytes.
   */
  recipient: string;

  /**
   * Base58 fresh public key reference for tracking the transaction on-chain.
   * Must decode to exactly 32 bytes.
   */
  reference: string;

  /**
   * Amount in SOL as an exact decimal string (default: "0.01").
   * Maximum 9 decimal places.
   */
  amount?: string;

  /**
   * Human-readable label for the transaction in wallet UI (default: "DishDeals").
   */
  label?: string;

  /**
   * Human-readable message explaining the tip (default: "Thanks for the deal").
   */
  message?: string;
}

export interface TipRequestResult {
  /**
   * Full Solana Pay transfer request URI.
   * Format: solana:<recipient>?amount=<amount>&reference=<reference>&label=<label>&message=<message>
   */
  uri: string;

  /**
   * Validated Base58 recipient address.
   */
  recipient: string;

  /**
   * Validated Base58 reference public key.
   */
  reference: string;

  /**
   * Validated exact SOL amount.
   */
  amount: string;

  /**
   * Human-readable label.
   */
  label: string;

  /**
   * Human-readable message.
   */
  message: string;

  /**
   * Expected network target ("devnet").
   * Note: The standard URI carries NO network parameter and cannot force wallet cluster.
   */
  expectedNetwork: typeof EXPECTED_SOLANA_NETWORK;
}

/**
 * Creates a standard Solana Pay v1 transfer request URI for tipping a deal poster.
 *
 * @param params Tip request parameters.
 * @returns TipRequestResult containing the constructed URI and validated fields.
 * @throws {Error} If parameters fail validation or contain disallowed attributes.
 */
export function createTipRequest(params: TipRequestParams): TipRequestResult {
  if (!params || typeof params !== "object") {
    throw new Error("Tip request parameters must be an object");
  }

  // Validate recipient and reference addresses (syntax only: exactly 32 bytes Base58)
  validateSolanaAddress(params.recipient, "recipient");
  validateSolanaAddress(params.reference, "reference");

  // Validate or default amount
  const amount = params.amount !== undefined ? validateSolAmount(params.amount) : DEFAULT_TIP_AMOUNT;

  // Validate or default label
  const label = params.label !== undefined ? params.label : DEFAULT_TIP_LABEL;
  if (typeof label !== "string" || label.trim().length === 0) {
    throw new Error("Label must be a non-empty string");
  }

  // Validate or default message
  const message = params.message !== undefined ? params.message : DEFAULT_TIP_MESSAGE;
  if (typeof message !== "string" || message.trim().length === 0) {
    throw new Error("Message must be a non-empty string");
  }

  // Build standard Solana Pay URI
  // Strict query construction: amount, reference, label, message
  // Using encodeURIComponent preserves RFC-3986 percent-encoding (spaces become %20)
  const queryParts = [
    `amount=${encodeURIComponent(amount)}`,
    `reference=${encodeURIComponent(params.reference)}`,
    `label=${encodeURIComponent(label)}`,
    `message=${encodeURIComponent(message)}`,
  ];

  const uri = `solana:${params.recipient}?${queryParts.join("&")}`;

  return {
    uri,
    recipient: params.recipient,
    reference: params.reference,
    amount,
    label,
    message,
    expectedNetwork: EXPECTED_SOLANA_NETWORK,
  };
}

/**
 * Parses and validates a Solana Pay tip request URI.
 *
 * @param uri Full solana: URI string.
 * @returns Parsed and validated TipRequestResult.
 * @throws {Error} If URI scheme is invalid, parameters fail validation, or unexpected query params exist.
 */
export function parseTipRequestUri(uri: string): TipRequestResult {
  if (typeof uri !== "string" || !uri.startsWith("solana:")) {
    throw new Error('Invalid tip request URI: must start with "solana:" protocol scheme');
  }

  const rawPath = uri.slice("solana:".length);
  const qIndex = rawPath.indexOf("?");
  const recipient = qIndex === -1 ? rawPath : rawPath.slice(0, qIndex);
  const queryString = qIndex === -1 ? "" : rawPath.slice(qIndex + 1);

  validateSolanaAddress(recipient, "recipient");

  const searchParams = new URLSearchParams(queryString);
  const allowedKeys = new Set(["amount", "reference", "label", "message"]);

  for (const key of searchParams.keys()) {
    if (!allowedKeys.has(key)) {
      throw new Error(
        `Disallowed or unexpected query parameter "${key}" in tip request URI (arbitrary callbacks and cluster bypass are prohibited)`
      );
    }
  }

  const reference = searchParams.get("reference");
  if (!reference) {
    throw new Error("Missing required query parameter: reference");
  }
  validateSolanaAddress(reference, "reference");

  const rawAmount = searchParams.get("amount");
  const amount = rawAmount !== null ? validateSolAmount(rawAmount) : DEFAULT_TIP_AMOUNT;

  const rawLabel = searchParams.get("label");
  const label = rawLabel !== null ? rawLabel : DEFAULT_TIP_LABEL;
  if (label.trim().length === 0) {
    throw new Error("Label cannot be empty");
  }

  const rawMessage = searchParams.get("message");
  const message = rawMessage !== null ? rawMessage : DEFAULT_TIP_MESSAGE;
  if (message.trim().length === 0) {
    throw new Error("Message cannot be empty");
  }

  return {
    uri,
    recipient,
    reference,
    amount,
    label,
    message,
    expectedNetwork: EXPECTED_SOLANA_NETWORK,
  };
}
