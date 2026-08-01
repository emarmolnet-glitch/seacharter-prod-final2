import React, { useState } from "react";

export interface DraftValidationResponse {
  portName: string;
  portDepthCode: string;
  safeDepthMeters: number;
  vesselDraft: number;
  status: "CLEARED" | "OVERSIZED";
  message: string;
}

interface RouteConfiguratorProps {
  portIndexNo?: number;
  vesselDraft?: number;
  onConfirm?: (validation: DraftValidationResponse) => void;
}

interface ApiErrorResponse {
  error?: string;
}

export default function RouteConfigurator({
  portIndexNo = 45570,
  vesselDraft = 8.2,
  onConfirm,
}: RouteConfiguratorProps) {
  const [validation, setValidation] = useState<DraftValidationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const validateDestination = async () => {
    setIsLoading(true);
    setError(null);
    setValidation(null);

    try {
      const response = await fetch("/api/v1/ports/validate-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ portIndexNo, vesselDraft }),
      });

      if (!response.ok) {
        const apiError = await response.json().catch(() => ({})) as ApiErrorResponse;
        throw new Error(apiError.error || "No fue posible validar el destino.");
      }

      setValidation(await response.json() as DraftValidationResponse);
    } catch (requestError) {
      setError(requestError instanceof Error
        ? requestError.message
        : "No fue posible validar el destino.");
    } finally {
      setIsLoading(false);
    }
  };

  const confirmCharterParty = () => {
    if (!validation || validation.status !== "CLEARED") return;

    onConfirm?.(validation);
    window.dispatchEvent(new CustomEvent("seacharter:charter-party-confirmed", {
      detail: validation,
    }));
  };

  const isCleared = validation?.status === "CLEARED";
  const canConfirm = Boolean(isCleared && !isLoading);

  return (
    <section className="mt-4 overflow-hidden rounded-xl border border-slate-700 bg-slate-950/80 shadow-[0_18px_45px_rgba(2,6,23,0.32)]">
      <div className="flex flex-col gap-4 border-b border-slate-800 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-cyan-400">NGA World Port Index</p>
          <h3 className="mt-1 text-sm font-semibold text-slate-100">Validación de calado del destino</h3>
          <p className="mt-1 text-xs text-slate-400">Puerto #{portIndexNo} · Calado declarado {vesselDraft.toFixed(1)} m</p>
        </div>

        <button
          type="button"
          onClick={validateDestination}
          disabled={isLoading}
          className="inline-flex min-w-40 items-center justify-center rounded-lg border border-cyan-500/50 bg-cyan-950/70 px-4 py-2 text-xs font-bold uppercase tracking-wide text-cyan-200 transition hover:border-cyan-400 hover:bg-cyan-900/70 focus:outline-none focus:ring-2 focus:ring-cyan-400/60 disabled:cursor-wait disabled:opacity-60"
        >
          {isLoading ? "Verificando..." : "Validar Destino"}
        </button>
      </div>

      <div className="space-y-3 p-4" aria-live="polite">
        {!validation && !error && !isLoading && (
          <div className="rounded-lg border border-dashed border-slate-700 bg-slate-900/60 px-4 py-3 text-xs text-slate-400">
            Ejecuta la validación antes de confirmar la Charter Party.
          </div>
        )}

        {isLoading && (
          <div className="animate-pulse rounded-lg border border-slate-700 bg-slate-900/70 p-4">
            <div className="h-3 w-32 rounded bg-slate-700" />
            <div className="mt-3 h-2 w-full rounded bg-slate-800" />
            <div className="mt-2 h-2 w-4/5 rounded bg-slate-800" />
          </div>
        )}

        {error && (
          <div role="alert" className="rounded-lg border border-amber-700/70 bg-amber-950/35 px-4 py-3 text-sm text-amber-200">
            {error}
          </div>
        )}

        {validation && (
          <div className={`rounded-lg border px-4 py-3 ${isCleared
            ? "border-emerald-600/70 bg-emerald-950/35 text-emerald-200"
            : "border-red-600/70 bg-red-950/35 text-red-200"
          }`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <strong className="text-sm">{validation.portName}</strong>
              <span className="rounded-full border border-current px-2.5 py-1 text-[10px] font-bold tracking-widest">
                {validation.status}
              </span>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
              <div><dt className="opacity-70">Código NGA</dt><dd className="mt-0.5 font-bold">{validation.portDepthCode || "VACÍO"}</dd></div>
              <div><dt className="opacity-70">Profundidad segura</dt><dd className="mt-0.5 font-bold">{validation.safeDepthMeters.toFixed(1)} m</dd></div>
              <div><dt className="opacity-70">Calado del buque</dt><dd className="mt-0.5 font-bold">{validation.vesselDraft.toFixed(1)} m</dd></div>
            </dl>
            <p className="mt-3 border-t border-current/20 pt-3 text-xs leading-relaxed">{validation.message}</p>
          </div>
        )}

        <button
          type="button"
          onClick={confirmCharterParty}
          disabled={!canConfirm}
          className="w-full rounded-lg bg-emerald-600 px-4 py-3 text-xs font-extrabold uppercase tracking-[0.12em] text-white transition hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2 focus:ring-offset-slate-950 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500 disabled:opacity-70"
        >
          Confirmar y Generar Charter Party
        </button>
      </div>
    </section>
  );
}
