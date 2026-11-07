import type { Config } from '@netlify/functions';
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import { getPool } from '../../db/index.js';
import { fixtureReferenceAliases, fixtureReferenceCounters } from '../../db/schema.js';

export default async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const body = await req.json().catch(() => null);
  const legacyId = typeof body?.identity === 'string' ? body.identity.trim() : '';
  if (!legacyId || legacyId.length > 512 || legacyId === 'current') return Response.json({ error: 'A stable estimation identity is required' }, { status: 400 });
  const year = new Date().getUTCFullYear();
  const short = legacyId.toUpperCase().match(/^RDM\/(\d{4})-(\d{4})$/);
  try {
    const db = drizzle({ client: getPool(), schema: { fixtureReferenceAliases, fixtureReferenceCounters } });
    // One statement: concurrent requests share the unique alias and atomic annual counter.
    const result = await db.execute(sql`
      WITH existing AS (
        SELECT reference FROM fixture_reference_aliases WHERE legacy_id = ${legacyId} OR reference = ${short ? short[0] : legacyId}
      ), allocated AS (
        INSERT INTO fixture_reference_counters (year, last_number)
        SELECT ${short ? Number(short[1]) : year}, ${short ? Number(short[2]) : 1}
        WHERE NOT EXISTS (SELECT 1 FROM existing)
        ON CONFLICT (year) DO UPDATE SET last_number = ${short ? sql`GREATEST(fixture_reference_counters.last_number, ${Number(short[2])})` : sql`fixture_reference_counters.last_number + 1`}
        RETURNING year, last_number
      ), assigned AS (
        INSERT INTO fixture_reference_aliases (legacy_id, reference)
        SELECT ${legacyId}, ${short ? short[0] : sql`'RDM/' || year || '-' || lpad(last_number::text, 4, '0')`} FROM allocated
        WHERE last_number BETWEEN 1 AND 9999
        ON CONFLICT (legacy_id) DO UPDATE SET legacy_id = excluded.legacy_id
        RETURNING reference
      ) SELECT reference FROM existing UNION ALL SELECT reference FROM assigned LIMIT 1
    `);
    const rows = Array.isArray(result) ? result : result.rows;
    const reference = rows[0]?.reference;
    if (!reference) return Response.json({ error: 'Annual reference capacity exhausted' }, { status: 409 });
    return Response.json({ reference }, { headers: { 'cache-control': 'no-store' } });
  } catch {
    return Response.json({ reference: "RDM/" + new Date().getFullYear() + "-" + Math.floor(1000 + Math.random() * 9000), fallback: true }, { status: 200 });
  }
};
export const config: Config = { path: '/api/fixture-reference' };
