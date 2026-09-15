/**
 * Utility for escaping user-supplied strings before constructing regular expressions.
 * Prevents ReDoS (Regular Expression Denial of Service), catastrophic backtracking,
 * and unintended wildcard matching in MongoDB $regex queries.
 */
export function escapeRegex(input: unknown): string {
  if (typeof input !== 'string') {
    return '';
  }
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
