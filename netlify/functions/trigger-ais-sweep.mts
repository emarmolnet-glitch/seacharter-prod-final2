import type { Config } from "@netlify/functions";
import handleScanRequest from "./ais-scan-request.js";

export default handleScanRequest;

export const config: Config = {
  path: "/api/trigger-ais-sweep",
  method: "POST",
};
