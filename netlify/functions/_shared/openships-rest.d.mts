export type OpenShipsVessel = Record<string, unknown>;

export type OpenShipsFetchOptions = {
  env?: Record<string, string | undefined>;
  latitude: number;
  longitude: number;
  radiusDegrees?: number;
  limit?: number;
  aisTypes?: number[];
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

export type OpenShipsFetchResult = {
  vessels: OpenShipsVessel[];
  count: number;
  fetchedAt: string;
  providerMeta: unknown;
  providerDiagnostics: {
    payloadType: string;
    topLevelKeys: string[];
    extractedRows: number;
    requestUrl: string;
  };
};

export function normalizeOpenShipsVessel(value: unknown, index?: number): OpenShipsVessel;
export function fetchOpenShipsLive(options?: OpenShipsFetchOptions): Promise<OpenShipsFetchResult>;
