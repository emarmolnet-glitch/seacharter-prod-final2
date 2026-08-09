import React, { useCallback, useEffect, useRef, useState } from "react";
import { voyageStore } from "../stores/voyage-store.js";

export interface DraftValidationResponse {
  portIndexNo?: number;
  portName: string;
  portDepthCode: string;
  safeDepthMeters: number;
  vesselDraft: number;
  actualDraft: number | null;
  maxDraft: number | null;
  draftBasis: "ACTUAL" | "MAXIMUM";
  status: "CLEARED" | "OVERSIZED";
  message: string;
}

type PortRole = "POL" | "POD";

interface RouteSelection {
  role: PortRole;
  portName: string;
  portIndexNo?: number;
  vesselDraft: number;
  actualDraft: number;
  maxDraft: number;
}

interface RouteConfiguratorProps {
  onConfirm?: (validation: DraftValidationResponse) => void;
}

interface ApiErrorResponse {
  error?: string;
  reference?: string;
}

interface CalculatorState {
  pol?: string;
  pod?: string;
  draft?: number;
  laydays?: string;
  laycanDate?: string;
  cancelling?: string;
  cancellingDate?: string;
  polCoordinates?: unknown;
  podCoordinates?: unknown;
  cargoQuantity?: number;
  cargoQty?: number;
  cargo?: number;
  cargoType?: string;
  cargoProduct?: string;
  distBallast?: number;
}

type UnknownRecord = Record<string, unknown>;

interface ContractReferenceManager {
  getActiveContractRef?: () => string;
  setActiveContractRef?: (reference: string) => string;
}

interface CharterPartyPayload {
  contractRef: string;
  imoNumber: string;
  vesselName: string;
  polName: string;
  polLatitude?: number;
  polLongitude?: number;
  podName: string;
  podLatitude?: number;
  podLongitude?: number;
  laydaysStartAt: string;
  cancellingAt: string;
  cargoName: string;
  cargoQuantityMt: number;
  ballastDistanceNm: number;
}

interface SeaCharterStore {
  getState?: () => CalculatorState;
  subscribe?: {
    (listener: (state: CalculatorState) => void): (() => void) | void;
    <Slice>(
      selector: (state: CalculatorState) => Slice,
      listener: (slice: Slice, previousSlice: Slice) => void,
      equalityFn?: (left: Slice, right: Slice) => boolean,
    ): (() => void) | void;
  };
}

interface CalculatorWindow extends Window {
  SeaCharterStore?: SeaCharterStore;
  ContractRefManager?: ContractReferenceManager;
  GlobalStore?: UnknownRecord;
  activeVessel?: UnknownRecord;
  objetoCalculadoraPrincipal?: UnknownRecord;
  coreProMatchingRouteContext?: UnknownRecord;
  readValidatedCargoOperationState?: () => UnknownRecord;
  resetTotalEstimation?: (options?: { silent?: boolean }) => void;
}

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : {};
}

function readTextValue(...ids: string[]) {
  for (const id of ids) {
    const element = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
    const value = String(element?.value || "").trim();
    if (value) return value;
  }
  return "";
}

function firstText(...values: unknown[]) {
  return values.map((value) => String(value ?? "").trim()).find(Boolean) || "";
}

function readCoordinates(value: unknown) {
  const coordinates = asRecord(value);
  const latitude = Number(coordinates.lat ?? coordinates.latitude ?? coordinates.Latitude);
  const longitude = Number(coordinates.lon ?? coordinates.lng ?? coordinates.longitude ?? coordinates.Longitude);
  return Number.isFinite(latitude) && Number.isFinite(longitude)
    ? { latitude, longitude }
    : {};
}

function readCharterPartyPayload(validation: DraftValidationResponse): CharterPartyPayload {
  const calculatorWindow = window as CalculatorWindow;
  const calculatorState = calculatorWindow.SeaCharterStore?.getState?.() || {};
  const draftVoyage = voyageStore.getState().draft;
  const globalStore = asRecord(calculatorWindow.GlobalStore);
  const activeVessel = asRecord(
    draftVoyage.vessel
      || globalStore.calculatorVessel
      || globalStore.activeVessel
      || calculatorWindow.activeVessel
      || calculatorWindow.objetoCalculadoraPrincipal,
  );
  const cargoState = asRecord(calculatorWindow.readValidatedCargoOperationState?.());
  const routeContext = asRecord(calculatorWindow.coreProMatchingRouteContext);
  const polCoordinates = readCoordinates(
    calculatorState.polCoordinates || globalStore.polCoordinates || routeContext.polCoordinates,
  );
  const podCoordinates = readCoordinates(
    calculatorState.podCoordinates || globalStore.podCoordinates || routeContext.podCoordinates,
  );
  const imoNumber = firstText(
    readTextValue("vessel-identity-imo"),
    activeVessel.imo,
    activeVessel.IMO,
    activeVessel.imoNumber,
    activeVessel.imo_number,
  ).replace(/\D/g, "");
  const vesselName = firstText(
    activeVessel.vesselName,
    activeVessel.vessel_name,
    activeVessel.ShipName,
    activeVessel.name,
    imoNumber ? `Buque IMO ${imoNumber}` : "",
  );
  const cargoQuantityMt = Number(
    readTextValue("cargo-qty")
      || cargoState.cargoQuantity
      || calculatorState.cargoQuantity
      || calculatorState.cargoQty
      || calculatorState.cargo
      || 0,
  );
  const ballastDistanceNm = Number(draftVoyage.ballastDistanceNm ?? calculatorState.distBallast ?? 0);

  return {
    contractRef: firstText(
      calculatorWindow.ContractRefManager?.getActiveContractRef?.(),
      readTextValue("quick-ref", "gc-ref", "asb-ref"),
    ).toUpperCase(),
    imoNumber,
    vesselName,
    polName: firstText(readTextValue("port-pol"), calculatorState.pol),
    polLatitude: polCoordinates.latitude,
    polLongitude: polCoordinates.longitude,
    podName: firstText(readTextValue("port-pod"), calculatorState.pod),
    podLatitude: podCoordinates.latitude,
    podLongitude: podCoordinates.longitude,
    laydaysStartAt: firstText(
      calculatorState.laydays,
      calculatorState.laycanDate,
      readTextValue("map-laycan-date", "gc-laycan-date", "asb-laycan-date"),
    ),
    cancellingAt: firstText(
      calculatorState.cancelling,
      calculatorState.cancellingDate,
      readTextValue("map-cancelling-date", "gc-cancel-date", "asb-cancel-date"),
    ),
    cargoName: firstText(
      cargoState.cargoProduct,
      cargoState.cargoType,
      calculatorState.cargoProduct,
      calculatorState.cargoType,
      readTextValue("cargo-product", "cargo-type"),
      "Carga contractual",
    ),
    cargoQuantityMt: Number.isFinite(cargoQuantityMt) && cargoQuantityMt > 0 ? cargoQuantityMt : 0,
    ballastDistanceNm: Number.isFinite(ballastDistanceNm) && ballastDistanceNm > 0 ? ballastDistanceNm : 0,
  };
}

function readPortInput(role: PortRole) {
  return document.getElementById(role === "POD" ? "port-pod" : "port-pol") as HTMLInputElement | null;
}

function readPortIndex(input: HTMLInputElement | null) {
  const portIndexNo = Number(input?.dataset.selectedPortIndexNo);
  return Number.isInteger(portIndexNo) && portIndexNo > 0 ? portIndexNo : undefined;
}

function readRouteSelection(role: PortRole): RouteSelection {
  const calculatorWindow = window as CalculatorWindow;
  const calculatorState = calculatorWindow.SeaCharterStore?.getState?.() || {};
  const portInput = readPortInput(role);
  const actualDraftInput = document.getElementById("current-draft") as HTMLInputElement | null;
  const maxDraftInput = document.getElementById("vessel-draft") as HTMLInputElement | null;
  const statePortName = role === "POD" ? calculatorState.pod : calculatorState.pol;
  const actualDraft = Number(actualDraftInput?.value);
  const maxDraft = Number(maxDraftInput?.value);
  const stateDraft = Number(calculatorState.draft);
  const normalizedActualDraft = Number.isFinite(actualDraft) && actualDraft > 0 ? actualDraft : 0;
  const normalizedMaxDraft = Number.isFinite(maxDraft) && maxDraft > 0
    ? maxDraft
    : (Number.isFinite(stateDraft) && stateDraft > 0 ? stateDraft : 0);

  return {
    role,
    portName: String(portInput?.value || statePortName || "").trim(),
    portIndexNo: readPortIndex(portInput),
    vesselDraft: normalizedActualDraft || normalizedMaxDraft,
    actualDraft: normalizedActualDraft,
    maxDraft: normalizedMaxDraft,
  };
}

function readInitialSelection() {
  const podSelection = readRouteSelection("POD");
  return podSelection.portName ? podSelection : readRouteSelection("POL");
}

function selectRouteState(state: CalculatorState) {
  return { pol: state.pol, pod: state.pod, draft: state.draft };
}

function routeStateEqual(left: CalculatorState, right: CalculatorState) {
  return left.pol === right.pol && left.pod === right.pod && left.draft === right.draft;
}

function routeSelectionEqual(left: RouteSelection, right: RouteSelection) {
  return left.role === right.role
    && left.portName === right.portName
    && left.portIndexNo === right.portIndexNo
    && left.vesselDraft === right.vesselDraft
    && left.actualDraft === right.actualDraft
    && left.maxDraft === right.maxDraft;
}

export default function RouteConfigurator({ onConfirm }: RouteConfiguratorProps) {
  const [selection, setSelection] = useState<RouteSelection>(readInitialSelection);
  const [validation, setValidation] = useState<DraftValidationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const activeRoleRef = useRef<PortRole>(selection.role);
  const hasValidatedRef = useRef(false);
  const requestControllerRef = useRef<AbortController | null>(null);

  const syncSelection = useCallback((role = activeRoleRef.current) => {
    activeRoleRef.current = role;
    setSelection((currentSelection: RouteSelection) => {
      const nextSelection = readRouteSelection(role);
      return routeSelectionEqual(currentSelection, nextSelection) ? currentSelection : nextSelection;
    });
  }, []);

  useEffect(() => {
    const calculatorWindow = window as CalculatorWindow;
    const disposers: Array<() => void> = [];

    (["POL", "POD"] as PortRole[]).forEach((role) => {
      const input = readPortInput(role);
      if (!input) return;

      const handlePortActivity = () => syncSelection(role);
      input.addEventListener("focus", handlePortActivity);
      input.addEventListener("input", handlePortActivity);
      input.addEventListener("change", handlePortActivity);
      disposers.push(() => {
        input.removeEventListener("focus", handlePortActivity);
        input.removeEventListener("input", handlePortActivity);
        input.removeEventListener("change", handlePortActivity);
      });
    });

    const draftInputs = [
      document.getElementById("current-draft"),
      document.getElementById("vessel-draft"),
    ].filter((input): input is HTMLElement => Boolean(input));
    const handleDraftChange = () => syncSelection();
    draftInputs.forEach((input) => {
      input.addEventListener("input", handleDraftChange);
      input.addEventListener("change", handleDraftChange);
    });
    disposers.push(() => {
      draftInputs.forEach((input) => {
        input.removeEventListener("input", handleDraftChange);
        input.removeEventListener("change", handleDraftChange);
      });
    });

    const handleRouteEvent = (event: Event) => {
      const detail = (event as CustomEvent<{ role?: PortRole }>).detail;
      syncSelection(detail?.role === "POD" ? "POD" : detail?.role === "POL" ? "POL" : activeRoleRef.current);
    };
    window.addEventListener("route:port-coordinates-updated", handleRouteEvent);
    window.addEventListener("port:suggestion-selected", handleRouteEvent);
    disposers.push(() => {
      window.removeEventListener("route:port-coordinates-updated", handleRouteEvent);
      window.removeEventListener("port:suggestion-selected", handleRouteEvent);
    });

    const unsubscribe = calculatorWindow.SeaCharterStore?.subscribe?.(
      selectRouteState,
      () => syncSelection(),
      routeStateEqual,
    );
    if (typeof unsubscribe === "function") disposers.push(unsubscribe);

    return () => {
      requestControllerRef.current?.abort();
      disposers.forEach((dispose) => dispose());
    };
  }, [syncSelection]);

  const validateActivePort = useCallback(async () => {
    if (!selection.portName) {
      setError(`Selecciona un puerto ${selection.role} antes de validar.`);
      return;
    }
    if (!Number.isFinite(selection.vesselDraft) || selection.vesselDraft <= 0) {
      setError("Introduce un calado de buque válido antes de ejecutar la auditoría NGA.");
      return;
    }

    requestControllerRef.current?.abort();
    const controller = new AbortController();
    requestControllerRef.current = controller;
    hasValidatedRef.current = true;
    setIsLoading(true);
    setError(null);
    setValidation(null);

    try {
      const response = await fetch("/api/v1/ports/validate-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          portName: selection.portName,
          portIndexNo: selection.portIndexNo,
          vesselDraft: selection.vesselDraft,
          actualDraft: selection.actualDraft || null,
          maxDraft: selection.maxDraft || null,
        }),
      });

      if (!response.ok) {
        const apiError = await response.json().catch(() => ({})) as ApiErrorResponse;
        throw new Error(apiError.error || "No fue posible validar el puerto activo.");
      }

      setValidation(await response.json() as DraftValidationResponse);
    } catch (requestError) {
      if (requestError instanceof DOMException && requestError.name === "AbortError") return;
      setError(requestError instanceof Error
        ? requestError.message
        : "No fue posible validar el puerto activo.");
    } finally {
      if (requestControllerRef.current === controller) {
        requestControllerRef.current = null;
        setIsLoading(false);
      }
    }
  }, [selection]);

  useEffect(() => {
    setValidation(null);
    setError(null);
    setSuccessMessage(null);
    requestControllerRef.current?.abort();

    if (!hasValidatedRef.current || !selection.portName || selection.vesselDraft <= 0) return;
    const timer = window.setTimeout(() => void validateActivePort(), 450);
    return () => window.clearTimeout(timer);
  }, [selection.actualDraft, selection.maxDraft, selection.portIndexNo, selection.portName, selection.role, selection.vesselDraft, validateActivePort]);

  const confirmCharterParty = async () => {
    if (!validation || validation.status !== "CLEARED") return;

    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const payload = readCharterPartyPayload(validation);
      const sanitizedPayload: CharterPartyPayload = {
        contractRef: payload.contractRef,
        imoNumber: payload.imoNumber,
        vesselName: payload.vesselName,
        polName: payload.polName,
        polLatitude: payload.polLatitude,
        polLongitude: payload.polLongitude,
        podName: payload.podName,
        podLatitude: payload.podLatitude,
        podLongitude: payload.podLongitude,
        laydaysStartAt: payload.laydaysStartAt,
        cancellingAt: payload.cancellingAt,
        cargoName: payload.cargoName,
        cargoQuantityMt: payload.cargoQuantityMt,
        ballastDistanceNm: payload.ballastDistanceNm,
      };
      const missingFields = [
        ["referencia contractual", payload.contractRef],
        ["IMO del buque", payload.imoNumber],
        ["POL", payload.polName],
        ["POD", payload.podName],
        ["fecha de Laydays", payload.laydaysStartAt],
        ["fecha de Cancelling", payload.cancellingAt],
        ["distancia real de lastre", payload.ballastDistanceNm],
      ].filter(([, value]) => !value).map(([label]) => label);
      if (missingFields.length > 0) {
        throw new Error(`Faltan datos obligatorios: ${missingFields.join(", ")}.`);
      }

      const response = await fetch("/api/v1/charter-party", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(sanitizedPayload),
      });
      const responseBody = await response.json().catch(() => ({})) as ApiErrorResponse;
      if (!response.ok) {
        throw new Error(responseBody.error || `No fue posible guardar el Charter Party (HTTP ${response.status}).`);
      }

      const savedReference = responseBody.reference || payload.contractRef;
      calculatorWindow.resetTotalEstimation?.({ silent: true });
      calculatorWindow.ContractRefManager?.setActiveContractRef?.(savedReference);
      voyageStore.getState().clearDraft();
      setSuccessMessage(`Charter Party ${savedReference} generado y guardado con éxito`);
      onConfirm?.(validation);
      window.dispatchEvent(new CustomEvent("seacharter:charter-party-confirmed", {
        detail: { ...validation, reference: savedReference },
      }));
    } catch (requestError) {
      setError(requestError instanceof Error
        ? requestError.message
        : "No fue posible guardar el Charter Party.");
    } finally {
      setIsSaving(false);
    }
  };

  const isCleared = validation?.status === "CLEARED";
  const validationStatusLabel = isCleared ? "CALADO OK" : "OVERSIZED";
  const canValidate = Boolean(selection.portName && selection.vesselDraft > 0 && !isLoading);
  const canConfirm = Boolean(isCleared && !isLoading && !isSaving);

  return (
    <section className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
      <div className="flex flex-col gap-4 border-b border-slate-200 bg-slate-50/70 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-teal-700">NGA World Port Index</p>
          <h3 className="mt-1 text-sm font-semibold text-slate-900">Validación reactiva de profundidad y calado</h3>
          <p className="mt-1 text-xs text-slate-600">
            <span className="font-bold text-slate-800">{selection.role}</span>
            {" · "}{selection.portName || "Sin puerto seleccionado"}
            {selection.portIndexNo ? ` · NGA #${selection.portIndexNo}` : ""}
            {selection.actualDraft > 0
              ? ` · Calado operativo ${selection.actualDraft.toFixed(2)} m`
              : ` · Calado máximo ${selection.maxDraft > 0 ? `${selection.maxDraft.toFixed(2)} m` : "pendiente"}`}
          </p>
        </div>

        <button
          type="button"
          onClick={() => void validateActivePort()}
          disabled={!canValidate}
          className="inline-flex min-w-40 items-center justify-center rounded-lg border border-teal-800 bg-teal-800 px-4 py-2 text-xs font-bold uppercase tracking-wide text-white shadow-sm transition hover:border-teal-700 hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-600/30 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none"
        >
          {isLoading ? "Verificando..." : `Validar ${selection.role}`}
        </button>
      </div>

      <div className="space-y-3 p-4" aria-live="polite">
        {!validation && !error && !isLoading && (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-xs text-slate-600">
            La auditoría sigue el último puerto POL o POD seleccionado y se actualiza cuando cambia la ruta o el calado.
          </div>
        )}

        {isLoading && (
          <div className="animate-pulse rounded-lg border border-slate-200 bg-white p-4">
            <div className="h-3 w-32 rounded bg-slate-300" />
            <div className="mt-3 h-2 w-full rounded bg-slate-200" />
            <div className="mt-2 h-2 w-4/5 rounded bg-slate-200" />
          </div>
        )}

        {error && (
          <div role="alert" className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800 shadow-[inset_3px_0_0_rgba(185,28,28,0.75)]">
            {error}
          </div>
        )}

        {successMessage && (
          <div role="status" className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800 shadow-[inset_3px_0_0_rgba(5,150,105,0.75)]">
            {successMessage}
          </div>
        )}

        {validation && (
          <div className={`rounded-lg border bg-white px-4 py-3 text-slate-700 ${isCleared
            ? "border-teal-200 shadow-[inset_3px_0_0_rgba(15,118,110,0.65)]"
            : "border-slate-200 shadow-[inset_3px_0_0_rgba(180,83,9,0.5)]"
          }`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center border text-sm font-black ${isCleared
                  ? "border-teal-200 bg-teal-50 text-teal-700"
                  : "border-amber-200 bg-amber-50 text-amber-700"
                }`} aria-hidden="true">
                  {isCleared ? "✓" : "!"}
                </span>
                <div>
                  <strong className="text-sm text-slate-900">{validation.portName}</strong>
                  <p className="mt-0.5 text-[10px] uppercase tracking-[0.16em] text-slate-500">Auditoría técnica NGA · {selection.role}</p>
                </div>
              </div>
              <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold tracking-widest ${isCleared
                ? "border-teal-200 bg-teal-50 text-teal-800"
                : "border-amber-200 bg-amber-50 text-amber-800"
              }`}>
                {validationStatusLabel}
              </span>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-slate-200 pt-3 text-xs sm:grid-cols-3">
              <div><dt className="text-slate-500">Código NGA</dt><dd className="mt-0.5 font-bold text-slate-800">{validation.portDepthCode || "VACÍO"}</dd></div>
              <div><dt className="text-slate-500">Profundidad segura</dt><dd className="mt-0.5 font-bold text-slate-800">{validation.safeDepthMeters.toFixed(1)} m</dd></div>
              <div><dt className="text-slate-500">{validation.draftBasis === "ACTUAL" ? "Calado operativo calculado" : "Calado máximo (fallback)"}</dt><dd className="mt-0.5 font-bold text-slate-800">{validation.vesselDraft.toFixed(2)} m</dd></div>
            </dl>
            <p className="mt-3 border-t border-slate-200 pt-3 text-xs leading-relaxed text-slate-600">{validation.message}</p>
          </div>
        )}

        <button
          type="button"
          onClick={() => void confirmCharterParty()}
          disabled={!canConfirm}
          className="w-full rounded-lg border border-teal-800 bg-teal-800 px-4 py-3 text-xs font-extrabold uppercase tracking-[0.12em] text-white transition hover:border-teal-700 hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-600/30 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
        >
          {isSaving ? "Guardando Charter Party..." : "Confirmar y Generar Charter Party"}
        </button>
      </div>
    </section>
  );
}
