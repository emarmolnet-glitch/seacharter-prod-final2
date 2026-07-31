import type { Config } from "@netlify/functions";
import { getPool } from "../../db/index.js";

const CONTACT_ROLES = ["OWNER", "BROKER", "AGENT", "LOGISTICS", "CHARTERER"] as const;
type ContactRole = typeof CONTACT_ROLES[number];

const jsonHeaders = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
};

function cleanText(value: unknown, maxLength = 500) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function cleanList(value: unknown, maxItems = 8, maxLength = 320) {
  const rawValues = Array.isArray(value) ? value : String(value ?? "").split(/[\n,;]+/);
  return [...new Set(rawValues
    .map((item) => cleanText(item, maxLength))
    .filter(Boolean))]
    .slice(0, maxItems);
}

function cleanRole(value: unknown): ContactRole | null {
  const role = cleanText(value, 24).toUpperCase();
  return CONTACT_ROLES.includes(role as ContactRole) ? role as ContactRole : null;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function normalizePayload(body: Record<string, unknown>) {
  const companyName = cleanText(body.company_name ?? body.companyName, 180);
  const contactName = cleanText(body.contact_name ?? body.contactName, 180) || null;
  const emails = cleanList(body.emails ?? body.email, 8, 254);
  const phones = cleanList(body.phones ?? body.phone, 8, 80);
  const country = cleanText(body.country, 100) || null;
  const notes = cleanText(body.notes, 2000) || null;
  const contactRole = cleanRole(body.contact_role ?? body.contactRole);

  return { companyName, contactName, emails, phones, country, notes, contactRole };
}

function validationError(contact: ReturnType<typeof normalizePayload>) {
  if (!contact.companyName) return "La empresa es obligatoria.";
  if (!contact.contactRole) return "Selecciona una categoría comercial válida.";
  if (contact.emails.length === 0) return "Añade al menos un correo electrónico.";
  const invalidEmail = contact.emails.find((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
  if (invalidEmail) return `El correo ${invalidEmail} no tiene un formato válido.`;
  return null;
}

function mapContact(row: Record<string, unknown>) {
  const emails = cleanList(Array.isArray(row.emails) && row.emails.length > 0 ? row.emails : row.email);
  const phones = cleanList(Array.isArray(row.phones) && row.phones.length > 0 ? row.phones : row.phone);
  return {
    id: row.id,
    company_name: row.company_name,
    contact_name: row.contact_name,
    emails,
    phones,
    country: row.country,
    contact_role: row.contact_role,
    notes: row.notes,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

export default async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: jsonHeaders });

  const pool = getPool();

  try {
    if (req.method === "GET") {
      const url = new URL(req.url);
      const search = cleanText(url.searchParams.get("q"), 180);
      const role = cleanRole(url.searchParams.get("role"));
      const values: string[] = [];
      const conditions: string[] = [];

      if (search) {
        values.push(`%${search}%`);
        conditions.push(`(
          company_name ILIKE $${values.length}
          OR COALESCE(contact_name, '') ILIKE $${values.length}
          OR COALESCE(country, '') ILIKE $${values.length}
        )`);
      }
      if (role) {
        values.push(role);
        conditions.push(`contact_role::text = $${values.length}`);
      }

      const result = await pool.query(
        `SELECT id, company_name, contact_name, email, phone, emails, phones, country,
                contact_role::text AS contact_role, notes, "createdAt", "updatedAt"
         FROM "Market_Contacts"
         ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
         ORDER BY company_name ASC, contact_name ASC NULLS LAST
         LIMIT 500`,
        values,
      );

      return Response.json({ success: true, contacts: result.rows.map(mapContact) }, { headers: jsonHeaders });
    }

    if (req.method === "POST") {
      const body = await req.json().catch(() => ({})) as Record<string, unknown>;
      const contact = normalizePayload(body);
      const error = validationError(contact);
      if (error) return Response.json({ success: false, error }, { status: 400, headers: jsonHeaders });

      const result = await pool.query(
        `INSERT INTO "Market_Contacts"
          (company_name, contact_name, email, phone, emails, phones, country, contact_role, notes, "updatedAt")
         VALUES ($1, $2, $3, $4, $5::text[], $6::text[], $7, $8::"ContactRole", $9, CURRENT_TIMESTAMP)
         RETURNING id, company_name, contact_name, email, phone, emails, phones, country,
                   contact_role::text AS contact_role, notes, "createdAt", "updatedAt"`,
        [
          contact.companyName,
          contact.contactName,
          contact.emails[0],
          contact.phones[0] || null,
          contact.emails,
          contact.phones,
          contact.country,
          contact.contactRole,
          contact.notes,
        ],
      );

      return Response.json({ success: true, contact: mapContact(result.rows[0]) }, { status: 201, headers: jsonHeaders });
    }

    if (req.method === "PATCH") {
      const body = await req.json().catch(() => ({})) as Record<string, unknown>;
      const id = cleanText(body.id, 50);
      if (!isUuid(id)) {
        return Response.json({ success: false, error: "El identificador del contacto no es válido." }, { status: 400, headers: jsonHeaders });
      }

      const contact = normalizePayload(body);
      const error = validationError(contact);
      if (error) return Response.json({ success: false, error }, { status: 400, headers: jsonHeaders });

      const result = await pool.query(
        `UPDATE "Market_Contacts"
         SET company_name = $2,
             contact_name = $3,
             email = $4,
             phone = $5,
             emails = $6::text[],
             phones = $7::text[],
             country = $8,
             contact_role = $9::"ContactRole",
             notes = $10,
             "updatedAt" = CURRENT_TIMESTAMP
         WHERE id = $1::uuid
         RETURNING id, company_name, contact_name, email, phone, emails, phones, country,
                   contact_role::text AS contact_role, notes, "createdAt", "updatedAt"`,
        [
          id,
          contact.companyName,
          contact.contactName,
          contact.emails[0],
          contact.phones[0] || null,
          contact.emails,
          contact.phones,
          contact.country,
          contact.contactRole,
          contact.notes,
        ],
      );

      if (result.rowCount === 0) {
        return Response.json({ success: false, error: "No se encontró el contacto solicitado." }, { status: 404, headers: jsonHeaders });
      }

      return Response.json({ success: true, contact: mapContact(result.rows[0]) }, { headers: jsonHeaders });
    }

    return Response.json({ success: false, error: "Método no permitido." }, { status: 405, headers: jsonHeaders });
  } catch (error) {
    console.error("[market-contacts] Error procesando el directorio.", error);
    return Response.json(
      { success: false, error: "No se pudo completar la operación sobre la agenda." },
      { status: 500, headers: jsonHeaders },
    );
  }
};

export const config: Config = {
  path: "/api/market-contacts",
};
