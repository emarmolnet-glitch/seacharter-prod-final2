import { getUser } from '@netlify/identity';
import { drizzle } from 'drizzle-orm/netlify-db';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { tenantProfiles, tenantBankAccounts, tenantContacts } from '../../db/schema.js';

const field = z.string().trim().max(2000);
const email = field.refine(v => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'Email no válido');
const profileSchema = z.object({ company_name: field.min(1), nif: field, address: field, email, phone: field, logo_url: field.refine(v => !v || /^https?:\/\//i.test(v), 'URL no válida') }).strict();
const bankSchema = z.object({ bank_name: field.min(1), iban: field.min(1).max(34).transform(v => v.replace(/\s/g, '').toUpperCase()).refine(v => /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(v), 'IBAN no válido'), swift: field.transform(v => v.toUpperCase()).refine(v => !v || /^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(v), 'SWIFT no válido'), currency: z.string().regex(/^[A-Z]{3}$/), beneficiary: field.min(1) }).strict();
const contactSchema = z.object({ role: z.enum(['agent_pol', 'agent_pod', 'charterer', 'owner', 'broker']), company_name: field.min(1), address: field, email, pic_name: field }).strict();

export default async (req: Request) => {
  const respond = (data: unknown, status = 200) => Response.json(data, { status, headers: {
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Vary': 'Cookie, Authorization',
  } });
  try {
    const user = await getUser();
    if (!user) return respond({ error: 'Inicia sesión para acceder a la configuración de tu empresa.' }, 401);
    if (!['GET', 'POST', 'PUT'].includes(req.method)) return respond({ error: 'Método no permitido' }, 405);
    if (req.method !== 'GET' && req.headers.get('origin') && req.headers.get('origin') !== new URL(req.url).origin) return respond({ error: 'Origen no permitido' }, 403);
    const segments = new URL(req.url).pathname.split('/').filter(Boolean);
    const offset = segments.indexOf('settings');
    const resource = segments[offset + 1];
    const id = segments[offset + 2];
    if (segments.length > offset + 3 || (resource && !['profile', 'bank-accounts', 'contacts'].includes(resource))) return respond({ error: 'Ruta no encontrada' }, 404);
    const db = drizzle();
    if (req.method === 'GET') {
      if (id) return respond({ error: 'Ruta no encontrada' }, 404);
      const [profiles, banks, contacts] = await Promise.all([
        db.select().from(tenantProfiles).where(eq(tenantProfiles.id, user.id)),
        db.select().from(tenantBankAccounts).where(eq(tenantBankAccounts.tenant_id, user.id)).orderBy(tenantBankAccounts.bank_name),
        db.select().from(tenantContacts).where(eq(tenantContacts.tenant_id, user.id)).orderBy(tenantContacts.company_name),
      ]);
      const data = { profile: profiles[0] || null, 'bank-accounts': banks, contacts };
      return respond(resource ? data[resource as keyof typeof data] : data);
    }
    if (!resource) return respond({ error: 'Indica el recurso que deseas guardar' }, 400);
    if (!req.headers.get('content-type')?.includes('application/json')) return respond({ error: 'Se requiere JSON' }, 415);
    const raw = await req.text();
    if (raw.length > 20000) return respond({ error: 'Datos demasiado grandes' }, 413);
    let payload;
    try { payload = JSON.parse(raw); } catch { return respond({ error: 'JSON no válido' }, 400); }
    if (resource === 'profile') {
      if (id) return respond({ error: 'Ruta no encontrada' }, 404);
      const data = profileSchema.parse(payload);
      const [profile] = await db.insert(tenantProfiles).values({ ...data, id: user.id }).onConflictDoUpdate({ target: tenantProfiles.id, set: data }).returning();
      return respond(profile);
    }
    if ((req.method === 'PUT' && !id) || (req.method === 'POST' && id)) return respond({ error: 'Ruta no válida para este método' }, 400);
    if (id && !z.string().uuid().safeParse(id).success) return respond({ error: 'ID no válido' }, 400);
    if (resource === 'bank-accounts') {
      const data = bankSchema.parse(payload);
      if (req.method === 'PUT') {
        const [record] = await db.update(tenantBankAccounts).set(data).where(and(eq(tenantBankAccounts.tenant_id, user.id), eq(tenantBankAccounts.id, id!))).returning();
        return record ? respond(record) : respond({ error: 'Registro no encontrado' }, 404);
      }
      await db.insert(tenantProfiles).values({ id: user.id }).onConflictDoNothing();
      const [record] = await db.insert(tenantBankAccounts).values({ ...data, tenant_id: user.id }).returning();
      return respond(record, 201);
    }
    const data = contactSchema.parse(payload);
    if (req.method === 'PUT') {
      const [record] = await db.update(tenantContacts).set(data).where(and(eq(tenantContacts.tenant_id, user.id), eq(tenantContacts.id, id!))).returning();
      return record ? respond(record) : respond({ error: 'Registro no encontrado' }, 404);
    }
    await db.insert(tenantProfiles).values({ id: user.id }).onConflictDoNothing();
    const [record] = await db.insert(tenantContacts).values({ ...data, tenant_id: user.id }).returning();
    return respond(record, 201);
  } catch (error) {
    if (error instanceof z.ZodError) return respond({ error: error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ') }, 400);
    return respond({ error: 'No se pudo acceder a la configuración. Inténtalo de nuevo.' }, 500);
  }
};
export const config = { path: ['/api/settings', '/api/settings/*'] };
