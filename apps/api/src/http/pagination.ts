/** Parse list pagination from Express query (defaults match GET /projects). */
export function parsePaginationQuery(query: Record<string, unknown>): {
  limit: number;
  offset: number;
} {
  const rawLimit = query["limit"];
  const rawOffset = query["offset"];
  const limit = Math.min(Math.max(Number(rawLimit) || 50, 1), 100);
  const offset = Math.max(Number(rawOffset) || 0, 0);
  return { limit, offset };
}
