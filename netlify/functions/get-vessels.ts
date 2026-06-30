import { readVessels, sortByLastSeen, type VesselRecord } from "./vessel-store.js";

export default async (req: Request) => {
  try {
    // Solo leemos lo que ya existe en el Blob, sin intentar hidratar
    const rows = await readVessels();
    return Response.json({ 
      vessels: rows, 
      count: rows.length 
    });
  } catch (err) {
    console.error("[get-vessels] Error:", err);
    return Response.json({ vessels: [] });
  }
};
