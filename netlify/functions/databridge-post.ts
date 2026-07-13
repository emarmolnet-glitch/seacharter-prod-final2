import type { Config } from "@netlify/functions";
import { handleVesselBatch } from "./receive-vessels.js";

export default handleVesselBatch;

export const config: Config = {
  path: ["/api/databridge-post", "/api/databridge-port", "/.netlify/functions/databridge-post"],
};
