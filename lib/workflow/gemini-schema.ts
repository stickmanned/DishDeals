/** Gemini supports a subset of JSON Schema. Keep Zod's complete validation
 * locally, and send only supported structural constraints to the provider.
 * Nested bounds and Zod's generated regexes can exceed provider limits.
 */
export function geminiJsonSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(geminiJsonSchema);
  if (!value || typeof value !== "object") return value;
  const schema = value as Record<string, unknown>;
  if (Array.isArray(schema.anyOf) && schema.anyOf.length === 2) {
    const nonNull = schema.anyOf.find(item => item.type !== "null");
    if (schema.anyOf.some(item => item.type === "null") && typeof nonNull?.type === "string") {
      return { ...(geminiJsonSchema(nonNull) as object), type: [nonNull.type, "null"] };
    }
  }
  return Object.fromEntries(Object.entries(schema)
    .filter(([key]) => !["$schema", "pattern", "minLength", "maxLength", "maxItems", "minItems", "minimum", "maximum", "format"].includes(key))
    .map(([key, item]) => [key, geminiJsonSchema(item)]));
}
