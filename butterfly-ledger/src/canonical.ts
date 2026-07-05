/**
 * Deterministic JSON canonicalization.
 *
 * Hashing is only meaningful if two logically-equal objects always serialize to
 * the exact same bytes. `JSON.stringify` does not guarantee key order, so we
 * emit object keys sorted lexicographically, recursively. Arrays keep their
 * order (it is semantically meaningful); `undefined` values are dropped the way
 * `JSON.stringify` drops them.
 */
export function canonicalize(value: unknown): string {
  return serialize(value);
}

function serialize(value: unknown): string {
  if (value === null) return "null";

  const t = typeof value;
  if (t === "number") {
    if (!Number.isFinite(value as number)) {
      throw new TypeError("Cannot canonicalize non-finite number");
    }
    return JSON.stringify(value);
  }
  if (t === "boolean" || t === "string") {
    return JSON.stringify(value);
  }
  if (t === "bigint") {
    throw new TypeError("Cannot canonicalize bigint");
  }

  if (Array.isArray(value)) {
    return `[${value.map((v) => serialize(v === undefined ? null : v)).join(",")}]`;
  }

  if (t === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj)
      .filter((k) => obj[k] !== undefined)
      .sort();
    const body = keys.map((k) => `${JSON.stringify(k)}:${serialize(obj[k])}`).join(",");
    return `{${body}}`;
  }

  // undefined / function / symbol
  throw new TypeError(`Cannot canonicalize value of type ${t}`);
}
