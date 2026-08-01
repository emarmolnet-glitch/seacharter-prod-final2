import { neon } from "@neondatabase/serverless";
import type { Config, Context } from "@netlify/functions";

type TrackingRow = Record<string, unknown>;

const ROUTE_PREFIX = "/api/v1/voyage/tracking/";
const ERROR_MESSAGE = "No fue posible recuperar el seguimiento operativo.";
const DATABASE_URL_ERROR = "La variable de entorno DATABASE_URL no está configurada.";

function errorResponse(status: number, error = ERROR_MESSAGE): Response {
  return Response.json(
    { success: false, error },
    { status },
  );
}

function getContractRef(request: Request): string | null {
  const pathname = new URL(request.url).pathname;

  if (!pathname.startsWith(ROUTE_PREFIX)) {
    return null;
  }

  const encodedContractRef = pathname.slice(ROUTE_PREFIX.length);

  if (!encodedContractRef) {
    return null;
  }

  try {
    return decodeURIComponent(encodedContractRef);
  } catch (error) {
    console.error("[voyage-tracking] Contract reference decoding failed.", {
      encodedContractRef,
      error,
    });
    return null;
  }
}

function getErrorDescription(error: unknown): string {
  if (!(error instanceof Error)) {
    return "Ocurrió un error interno desconocido.";
  }

  return error.message.replace(
    /postgres(?:ql)?:\/\/[^\s]+/gi,
    "[DATABASE_URL ocultada]",
  );
}

export default async function voyageTracking(
  request: Request,
  context: Context,
): Promise<Response> {
  const pathname = new URL(request.url).pathname;

  console.log("[voyage-tracking] Request received.", {
    requestId: context.requestId,
    method: request.method,
    pathname,
  });

  const contractRef = getContractRef(request);

  if (!contractRef) {
    console.log("[voyage-tracking] Contract reference was not found in the route.", {
      requestId: context.requestId,
      pathname,
    });
    return errorResponse(404);
  }

  console.log("[voyage-tracking] Contract reference decoded.", {
    requestId: context.requestId,
    contractRef,
  });

  try {
    const databaseUrl = process.env.DATABASE_URL;

    if (!databaseUrl) {
      throw new Error(DATABASE_URL_ERROR);
    }

    console.log("[voyage-tracking] Querying voyages_tracking.", {
      requestId: context.requestId,
      contractRef,
    });

    const sql = neon(databaseUrl);
    const rows = await sql`
      SELECT *
      FROM voyages_tracking
      WHERE contract_ref = ${contractRef}
         OR "contractRef" = ${contractRef}
      LIMIT 1
    `;
    const row = rows[0] as TrackingRow | undefined;

    if (!row) {
      console.log("[voyage-tracking] Tracking record not found.", {
        requestId: context.requestId,
        contractRef,
      });
      return errorResponse(404);
    }

    console.log("[voyage-tracking] Tracking record retrieved.", {
      requestId: context.requestId,
      contractRef,
    });

    return Response.json({ success: true, data: row });
  } catch (error) {
    const description = getErrorDescription(error);

    console.error("[voyage-tracking] Failed to retrieve tracking data.", {
      requestId: context.requestId,
      contractRef,
      description,
      error,
    });

    return errorResponse(500, description);
  }
}

export const config: Config = {
  path: "/api/v1/voyage/tracking/*",
  method: "GET",
};
