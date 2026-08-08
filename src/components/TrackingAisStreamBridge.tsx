import { useEffect, useState } from "react";
import { trackingStore } from "../stores/tracking-store.js";

type TrackingState = ReturnType<typeof trackingStore.getState>;
type Vessel = Record<string, unknown>;

function useTrackingState() {
  const [state, setState] = useState<TrackingState>(() => trackingStore.getState());
  useEffect(() => trackingStore.subscribe((nextState: TrackingState) => setState(nextState)), []);
  return state;
}

function normalizeMmsi(value: unknown) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length === 9 ? digits : "";
}

function contractVessel(contractPayload: unknown): Vessel {
  const payload = contractPayload && typeof contractPayload === "object" ? contractPayload as Vessel : {};
  const contract = payload.contract && typeof payload.contract === "object" ? payload.contract as Vessel : {};
  return {
    vesselName: contract.vesselName,
    imo: contract.vesselImo,
    mmsi: contract.vesselMmsi,
  };
}

function currentTrackingVessel(state: TrackingState) {
  const vessel = state.vessel && typeof state.vessel === "object" ? state.vessel as Vessel : {};
  return Object.keys(vessel).length > 0 ? vessel : contractVessel(state.contractPayload);
}

export default function TrackingAisStreamBridge() {
  const state = useTrackingState();
  const [trackingOpen, setTrackingOpen] = useState(false);
  const vessel = currentTrackingVessel(state);
  const mmsi = normalizeMmsi(vessel.mmsi ?? vessel.MMSI);

  useEffect(() => {
    const open = () => setTrackingOpen(true);
    const close = () => setTrackingOpen(false);
    document.addEventListener("tracking-live:open", open);
    document.addEventListener("tracking-live:close", close);
    setTrackingOpen(document.getElementById("tracking-live-overlay")?.classList.contains("is-open") === true);
    return () => {
      document.removeEventListener("tracking-live:open", open);
      document.removeEventListener("tracking-live:close", close);
    };
  }, []);

  useEffect(() => {
    if (!trackingOpen || !mmsi) {
      window.MapLoader?.closeAisStreamSocket?.();
      return;
    }
    const result = window.MapLoader?.startPersistentAisStream?.({
      mmsi,
      scope: "tracking",
      boundingBoxes: [[[-90, -180], [90, 180]]],
    });
    window.dispatchEvent(new CustomEvent("tracking:aisstream-status", {
      detail: { ...(result || { started: false, reason: "map-loader-unavailable" }), mmsi },
    }));
    return () => window.MapLoader?.closeAisStreamSocket?.();
  }, [trackingOpen, mmsi]);

  useEffect(() => {
    const handleUpdate = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      const incoming = detail.vessel && typeof detail.vessel === "object" ? detail.vessel as Vessel : null;
      if (!incoming || normalizeMmsi(incoming.mmsi ?? incoming.MMSI) !== mmsi) return;
      trackingStore.getState().setVessel({ ...vessel, ...incoming, positionSource: "AISSTREAM_CLIENT" });
    };
    window.addEventListener("tracking:aisstream-update", handleUpdate);
    return () => window.removeEventListener("tracking:aisstream-update", handleUpdate);
  }, [mmsi, vessel]);

  return null;
}

declare global {
  interface Window {
    MapLoader?: {
      startPersistentAisStream?: (options: Record<string, unknown>) => Record<string, unknown> | void;
      closeAisStreamSocket?: () => void;
    };
  }
}
