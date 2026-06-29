import WebSocket from 'ws';
import type { Config } from '@netlify/functions';

type VesselMessage = Record<string, unknown>;

const AIS_STREAM_URL = 'wss://stream.aisstream.io/v0/stream';
const DEFAULT_TIMEOUT_MS = 8500;
const MAX_TIMEOUT_MS = 12000;
const DEFAULT_QUANTITY = 1000;
const MAX_QUANTITY = 45000;

let vesselCache: VesselMessage[] = [];
let cacheUpdatedAt = 0;

const jsonHeaders = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
};

function numberParam(url: URL, names: string[], fallback: number) {
  for (const name of names) {
    const value = Number(url.searchParams.get(name));
    if (Number.isFinite(value)) return value;
  }
  return fallback;
}

function getRequestedBounds(url: URL) {
  if (url.searchParams.get('mode') === 'global') {
    return [
      [-180.0, -90.0],
      [180.0, 90.0],
    ];
  }

  const minLat = numberParam(url, ['minLat', 'latMin'], NaN);
  const maxLat = numberParam(url, ['maxLat', 'latMax'], NaN);
  const minLon = numberParam(url, ['minLon', 'lonMin'], NaN);
  const maxLon = numberParam(url, ['maxLon', 'lonMax'], NaN);

  if ([minLat, maxLat, minLon, maxLon].every(Number.isFinite)) {
    return [
      [Math.min(minLon, maxLon), Math.min(minLat, maxLat)],
      [Math.max(minLon, maxLon), Math.max(minLat, maxLat)],
    ];
  }

  return [
    [-12.0, 30.0],
    [42.0, 47.5],
  ];
}

function getApiKey() {
  return String(process.env.AISSTREAM_API_KEY || process.env.AISTREAM_API_KEY || '').trim();
}

function getVesselKey(message: VesselMessage) {
  const metadata = (message.MetaData || {}) as Record<string, unknown>;
  return String(
    metadata.MMSI ||
    metadata.mmsi ||
    message.MMSI ||
    message.mmsi ||
    metadata.IMO ||
    message.IMO ||
    ''
  ).trim();
}

function asRecord(value: unknown) {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function firstDefined(...values: unknown[]) {
  return values.find((value) => value !== undefined && value !== null && value !== '');
}

function normalizeNumber(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function normalizeVesselMessage(message: VesselMessage) {
  const metadata = asRecord(message.MetaData);
  const nestedMessage = asRecord(message.Message);
  const positionReport = asRecord(message.PositionReport || nestedMessage.PositionReport);
  const staticData = asRecord(message.ShipStaticData || nestedMessage.ShipStaticData);

  const latitude = normalizeNumber(firstDefined(
    message.latitude,
    message.AIS_Live_Lat,
    metadata.latitude,
    metadata.AIS_Live_Lat,
    positionReport.Latitude,
    positionReport.latitude
  ));
  const longitude = normalizeNumber(firstDefined(
    message.longitude,
    message.AIS_Live_Lon,
    metadata.longitude,
    metadata.AIS_Live_Lon,
    positionReport.Longitude,
    positionReport.longitude
  ));
  const mmsi = firstDefined(message.MMSI, message.mmsi, metadata.MMSI, metadata.mmsi, positionReport.UserID, staticData.UserID);
  const shipName = firstDefined(message.ShipName, message.vesselName, message.name, metadata.ShipName, metadata.shipName, staticData.Name);
  const imo = firstDefined(message.IMO, message.imo, metadata.IMO, metadata.imo, staticData.ImoNumber);
  const shipType = firstDefined(message.ShipType, message.shipType, metadata.ShipType, metadata.shipType, staticData.Type);
  const speed = normalizeNumber(firstDefined(message.speed, metadata.speed, positionReport.Sog, positionReport.SOG));
  const navigationalStatus = firstDefined(message.NavigationalStatus, metadata.NavigationalStatus, positionReport.NavigationalStatus);

  return {
    ...message,
    MMSI: mmsi,
    mmsi,
    ShipName: shipName,
    vesselName: shipName,
    IMO: imo || (mmsi ? 'N/A' : undefined),
    imo: imo || (mmsi ? 'N/A' : undefined),
    ShipType: shipType,
    shipType,
    latitude,
    longitude,
    AIS_Live_Lat: latitude,
    AIS_Live_Lon: longitude,
    speed,
    NavigationalStatus: navigationalStatus,
    MetaData: {
      ...metadata,
      MMSI: firstDefined(metadata.MMSI, mmsi),
      ShipName: firstDefined(metadata.ShipName, shipName),
      IMO: firstDefined(metadata.IMO, imo, mmsi ? 'N/A' : undefined),
      ShipType: firstDefined(metadata.ShipType, shipType),
      latitude: firstDefined(metadata.latitude, latitude),
      longitude: firstDefined(metadata.longitude, longitude),
      speed: firstDefined(metadata.speed, speed),
      NavigationalStatus: firstDefined(metadata.NavigationalStatus, navigationalStatus),
    },
  };
}

function mergeDefinedVesselFields(current: VesselMessage | undefined, incoming: VesselMessage) {
  const merged: VesselMessage = { ...(current || {}) };
  Object.entries(incoming).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      if (key === 'MetaData' && typeof value === 'object' && value && typeof merged.MetaData === 'object' && merged.MetaData) {
        merged.MetaData = mergeDefinedVesselFields(merged.MetaData as VesselMessage, value as VesselMessage);
      } else {
        merged[key] = value;
      }
    }
  });
  return merged;
}

function collectVessels(url: URL, apiKey: string) {
  const quantity = Math.min(MAX_QUANTITY, Math.max(1, numberParam(url, ['quantity', 'limit'], DEFAULT_QUANTITY)));
  const timeoutMs = Math.min(MAX_TIMEOUT_MS, Math.max(2500, numberParam(url, ['timeoutMs'], DEFAULT_TIMEOUT_MS)));
  const bounds = getRequestedBounds(url);

  return new Promise<VesselMessage[]>((resolve, reject) => {
    const vesselsByKey = new Map<string, VesselMessage>();
    const ws = new WebSocket(AIS_STREAM_URL);
    let settled = false;
    let timer: ReturnType<typeof setTimeout>;

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        ws.close();
      } catch (_) {}
      if (error && vesselsByKey.size === 0) {
        reject(error);
        return;
      }
      resolve(Array.from(vesselsByKey.values()).slice(0, quantity));
    };

    timer = setTimeout(() => finish(), timeoutMs);

    ws.on('open', () => {
      ws.send(JSON.stringify({
        APIKey: apiKey,
        BoundingBoxes: [bounds],
        VesselTypes: [],
        FilterMessageTypes: ['PositionReport', 'ShipStaticData'],
      }));
    });

    ws.on('message', (data) => {
      try {
        const message = normalizeVesselMessage(JSON.parse(data.toString()) as VesselMessage);
        const key = getVesselKey(message);
        if (!key) return;
        vesselsByKey.set(key, mergeDefinedVesselFields(vesselsByKey.get(key), message));
        if (vesselsByKey.size >= quantity) finish();
      } catch (_) {}
    });

    ws.on('error', () => finish(new Error('AIS stream connection failed.')));
    ws.on('close', () => finish());
  });
}

export default async (req: Request) => {
  const url = new URL(req.url);

  if (url.searchParams.get('action') === 'reset-cache') {
    vesselCache = [];
    cacheUpdatedAt = 0;
    return Response.json({ ok: true, reset: true }, { headers: jsonHeaders });
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    return Response.json(
      { vessels: vesselCache, error: 'AIS stream API key is not configured on the server.' },
      { status: vesselCache.length ? 200 : 503, headers: jsonHeaders }
    );
  }

  try {
    const vessels = await collectVessels(url, apiKey);
    if (vessels.length > 0) {
      vesselCache = vessels;
      cacheUpdatedAt = Date.now();
    }

    return Response.json(
      { vessels: vessels.length ? vessels : vesselCache, updatedAt: cacheUpdatedAt },
      {
        headers: {
          ...jsonHeaders,
          'x-ais-persisted-count': String(vesselCache.length),
          'x-ais-target-count': String(Math.min(MAX_QUANTITY, numberParam(url, ['quantity', 'limit'], DEFAULT_QUANTITY))),
        },
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AIS stream request failed.';
    return Response.json(
      { vessels: vesselCache, error: message, updatedAt: cacheUpdatedAt },
      { status: vesselCache.length ? 200 : 502, headers: jsonHeaders }
    );
  }
};

export const config: Config = {
  method: ['GET', 'POST'],
};
