import React, { useCallback, useEffect, useRef, useState } from "react";

export interface DraftValidationResponse {
  portIndexNo?: number;
  portName: string;
  portDepthCode: string;
  safeDepthMeters: number;
  vesselDraft: number;
  status: "CLEARED" | "OVERSIZED";
  message: string;
}

type PortRole = "POL" | "POD";

interface RouteSelection {
  role: PortRole;
  portName: string;
  portIndexNo?: number;
  vesselDraft: number;
}

interface RouteConfiguratorProps {
  onConfirm?: (validation: DraftValidationResponse) => void;
}

interface ApiErrorResponse {
  error?: string;
}

interface CalculatorState {
  pol?: string;
  pod?: string;
  draft?: number;
}

interface SeaCharterStore {
  getState?: () => CalculatorState;
  subscribe?: (listener: (state: CalculatorState) => void) => (() => void) | void;
}

interface CalculatorWindow extends Window {
  SeaCharterStore?: SeaCharterStore;
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
  const vesselDraftInput = document.getElementById("vessel-draft") as HTMLInputElement | null;
  const statePortName = role === "POD" ? calculatorState.pod : calculatorState.pol;
  const inputDraft = Number(vesselDraftInput?.value);
  const stateDraft = Number(calculatorState.draft);

  return {
    role,
    portName: String(portInput?.value || statePortName || "").trim(),
    portIndexNo: readPortIndex(portInput),
    vesselDraft: Number.isFinite(inputDraft) && inputDraft > 0
      ? inputDraft
      : (Number.isFinite(stateDraft) ? stateDraft : 0),
  };
}

function readInitialSelection() {
  const podSelection = readRouteSelection("POD");
  return podSelection.portName ? podSelection : readRouteSelection("POL");
}

export default function RouteConfigurator({ onConfirm }: RouteConfiguratorProps) {
  const [selection, setSelection] = useState<RouteSelection>(readInitialSelection);
  const [validation, setValidation] = useState<DraftValidationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const activeRoleRef = useRef<PortRole>(selection.role);
  const hasValidatedRef = useRef(false);
  const requestControllerRef = useRef<AbortController | null>(null);

  const syncSelection = useCallback((role = activeRoleRef.current) => {
    activeRoleRef.current = role;
    setSelection(readRouteSelection(role));
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

    const vesselDraftInput = document.getElementById("vessel-draft");
    const handleDraftChange = () => syncSelection();
    vesselDraftInput?.addEventListener("input", handleDraftChange);
    vesselDraftInput?.addEventListener("change", handleDraftChange);
    disposers.push(() => {
      vesselDraftInput?.removeEventListener("input", handleDraftChange);
      vesselDraftInput?.removeEventListener("change", handleDraftChange);
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

    const unsubscribe = calculatorWindow.SeaCharterStore?.subscribe?.(() => syncSelection());
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
    requestControllerRef.current?.abort();

    if (!hasValidatedRef.current || !selection.portName || selection.vesselDraft <= 0) return;
    const timer = window.setTimeout(() => void validateActivePort(), 450);
    return () => window.clearTimeout(timer);
  }, [selection.portIndexNo, selection.portName, selection.role, selection.vesselDraft, validateActivePort]);

  const confirmCharterParty = () => {
    if (!validation || validation.status !== "CLEARED") return;

    onConfirm?.(validation);
    window.dispatchEvent(new CustomEvent("seacharter:charter-party-confirmed", {
      detail: validation,
    }));
  };

  const isCleared = validation?.status === "CLEARED";
  const validationStatusLabel = isCleared ? "CALADO OK" : "OVERSIZED";
  const canValidate = Boolean(selection.portName && selection.vesselDraft > 0 && !isLoading);
  const canConfirm = Boolean(isCleared && !isLoading);

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
            {" · Calado "}{selection.vesselDraft > 0 ? `${selection.vesselDraft.toFixed(1)} m` : "pendiente"}
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
          <div role="alert" className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-[inset_3px_0_0_rgba(15,118,110,0.65)]">
            {error}
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
              <div><dt className="text-slate-500">Calado del buque</dt><dd className="mt-0.5 font-bold text-slate-800">{validation.vesselDraft.toFixed(1)} m</dd></div>
            </dl>
            <p className="mt-3 border-t border-slate-200 pt-3 text-xs leading-relaxed text-slate-600">{validation.message}</p>
          </div>
        )}

        <button
          type="button"
          onClick={confirmCharterParty}
          disabled={!canConfirm}
          className="w-full rounded-lg border border-teal-800 bg-teal-800 px-4 py-3 text-xs font-extrabold uppercase tracking-[0.12em] text-white transition hover:border-teal-700 hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-600/30 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
        >
          Confirmar y Generar Charter Party
        </button>
      </div>
    </section>
  );
}
