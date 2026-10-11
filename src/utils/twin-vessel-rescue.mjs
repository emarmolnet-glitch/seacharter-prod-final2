/**
 * Lógica de rescate de buque gemelo y sincronización con Data Bridge (MADRE)
 * para SeaCharter Core PRO y Asistente Core.
 */

export function isTwinVesselRescueText(text) {
  if (typeof text !== "string") return false;
  return (
    text.includes("Alerta de Radar: Sin disponibilidad") ||
    text.includes("BARCO GEMELO") ||
    text.includes("Buque Gemelo") ||
    text.includes("Solución de Cotización (Buque Gemelo)")
  );
}

export function buildVesselRescueMessage(context = {}) {
  const ctx = context && typeof context === "object" ? context : {};
  const state = typeof window !== "undefined" ? (window.State || {}) : {};
  const pol = String(ctx.pol || ctx.polName || state.pol || "").trim();
  const pod = String(ctx.pod || ctx.podName || state.pod || "").trim();
  const tonnage = Number(ctx.tonnage || ctx.cargo_qty || ctx.cargoQty || state.cargoQty || state.tonnage || 0);
  const laydays = String(ctx.laydayStart || ctx.laydays || ctx.laycanStart || state.laydaysDate || state.laydays || "").trim();
  const cancelling = String(ctx.cancelling || ctx.laycanEnd || state.cancellingDate || state.cancelling || "").trim();

  let zoneText = "las zonas de POL y POD";
  if (pol && pod) {
    zoneText = `las zonas de POL (${pol}) y POD (${pod})`;
  } else if (pol) {
    zoneText = `la zona de POL (${pol}) y POD`;
  } else if (pod) {
    zoneText = `las zonas de POL y POD (${pod})`;
  }

  let laycanText = "tu *laycan*";
  if (laydays && cancelling && laydays !== cancelling) {
    laycanText = `tu *laycan* (${laydays} - ${cancelling})`;
  } else if (laydays) {
    laycanText = `tu *laycan* (${laydays})`;
  }

  let proformaText = "la proforma";
  if (Number.isFinite(tonnage) && tonnage > 0) {
    proformaText = `la proforma (${tonnage.toLocaleString("es-ES")} MT)`;
  }

  return `
⚠️ **Alerta de Radar: Sin disponibilidad en zona**
No hemos encontrado un barco operando en ${zoneText} que se ajuste a las fechas de ${laycanText}.

⚡ **Solución de Cotización (Buque Gemelo):**
Para que no paralices ${proformaText} y puedas cotizar a tu cliente con total precisión, te recomendamos utilizar un **BARCO GEMELO**.

💡 **Acción requerida:**
Abre el módulo **Data Bridge** en el panel lateral. La sesión se sincronizará automáticamente. Pídele a MADRE que localice el barco idóneo en la base de datos, revisa sus fotos verificadas y haz clic en "Calcular en Core PRO" para inyectar su IMO aquí.
`.trim();
}

export function isNoVesselsError(error) {
  if (!error) return false;
  if (typeof error === "object") {
    if (error.code === "NO_VESSELS_AVAILABLE" || error.type === "NO_VESSELS" || error.status === "empty") return true;
    if (error.noVessels === true || error.vesselsAvailable === false || error.hasAvailableVessels === false) return true;
    const msg = String(error.message || error.error || error.detail || "").toLowerCase();
    return (
      msg.includes("sin disponibilidad") ||
      msg.includes("no hemos encontrado") ||
      msg.includes("no hay buques") ||
      msg.includes("sin barcos") ||
      msg.includes("no viable vessels") ||
      msg.includes("no vessels available") ||
      msg.includes("vessel_validation_empty") ||
      msg.includes("vessel validation failed")
    );
  }
  if (typeof error === "string") {
    const s = error.toLowerCase();
    return (
      s.includes("sin disponibilidad") ||
      s.includes("no hemos encontrado") ||
      s.includes("no hay buques") ||
      s.includes("no viable vessels") ||
      s.includes("no vessels available")
    );
  }
  return false;
}

export async function evaluateVesselAvailability(context = {}) {
  const action = context.action || {};
  const actionResult = context.actionResult || {};
  const response = context.response || {};
  const p = action.payload || actionResult.payload || {};

  if (typeof window !== "undefined" && typeof window.checkVesselAvailabilityInZone === "function") {
    try {
      const customResult = await window.checkVesselAvailabilityInZone(context);
      if (customResult !== undefined) {
        if (customResult === false || customResult === null || (Array.isArray(customResult) && customResult.length === 0)) {
          return { hasViableVessels: false, vesselsCount: 0, status: "empty" };
        }
        if (typeof customResult === "object" && customResult.hasViableVessels === false) {
          return { hasViableVessels: false, vesselsCount: 0, status: "empty" };
        }
        if (typeof customResult === "object" && customResult.hasViableVessels === true) {
          return { hasViableVessels: true, vesselsCount: customResult.vesselsCount || 1, status: "available" };
        }
      }
    } catch (err) {
      console.warn("[AsistenteCore] Error en checkVesselAvailabilityInZone:", err);
    }
  }

  if (
    actionResult.hasAvailableVessels === false ||
    actionResult.vesselsAvailable === false ||
    response.hasAvailableVessels === false ||
    response.vesselsAvailable === false ||
    actionResult.noViableVessels === true ||
    response.noViableVessels === true
  ) {
    return { hasViableVessels: false, vesselsCount: 0, status: "empty" };
  }

  const directList = actionResult.vessels ?? actionResult.pairedMatches ?? actionResult.candidates ??
    response.vessels ?? response.availableVessels ?? response.pairedMatches ?? p.vessels ?? null;

  if (directList !== null) {
    if (!Array.isArray(directList) || directList.length === 0) {
      return { hasViableVessels: false, vesselsCount: 0, status: "empty" };
    }
    const viable = directList.filter((cand) => {
      if (cand?.laycanCompliant === false) return false;
      if (cand?.vesselOpenness?.laycanCompliant === false) return false;
      if (cand?.compatibilityScore !== undefined && cand.compatibilityScore <= 0) return false;
      return true;
    });
    if (viable.length === 0) {
      return { hasViableVessels: false, vesselsCount: 0, status: "empty" };
    }
    return { hasViableVessels: true, vesselsCount: viable.length, status: "available" };
  }

  if (typeof window !== "undefined" && window.CompatibilityModule) {
    const compCache = window.CompatibilityModule.cache;
    if (compCache && Array.isArray(compCache.pairedMatches)) {
      if (compCache.hasLiveCompatibleVessels === false || compCache.pairedMatches.length === 0) {
        return { hasViableVessels: false, vesselsCount: 0, status: "empty" };
      }
      const laycanCount = compCache.opennessSummary?.laycanCompliantCount;
      if (typeof laycanCount === "number" && laycanCount === 0) {
        return { hasViableVessels: false, vesselsCount: 0, status: "empty" };
      }
      if (compCache.topMatch) {
        return { hasViableVessels: true, vesselsCount: compCache.pairedMatches.length, status: "available" };
      }
    }
  }

  if (typeof window !== "undefined") {
    const liveFleet = (typeof window.getDensityReactiveVessels === "function" ? window.getDensityReactiveVessels() : null)
      || (Array.isArray(window.GlobalStore?.matchingVessels) ? window.GlobalStore.matchingVessels : null)
      || (Array.isArray(window.listaBarcos) ? window.listaBarcos : null);

    if (Array.isArray(liveFleet)) {
      if (liveFleet.length === 0 && (p.pol || window.State?.pol)) {
        return { hasViableVessels: false, vesselsCount: 0, status: "empty" };
      }
      if (liveFleet.length > 0) {
        const pol = String(p.pol || window.State?.pol || "").toLowerCase();
        const pod = String(p.pod || window.State?.pod || "").toLowerCase();
        if (pol || pod) {
          const matchingZoneAndLaycan = liveFleet.filter((v) => {
            const dest = String(v.destination || v.destino || "").toLowerCase();
            const zoneHit = (pol && dest.includes(pol)) || (pod && dest.includes(pod));
            const laycanHit = v.laycanCompliant === true || v.commercialTransit?.etaWithinLaycan === true || v.vesselOpenness?.laycanCompliant === true;
            return zoneHit && laycanHit;
          });
          if (matchingZoneAndLaycan.length === 0 && liveFleet.every(v => v.laycanCompliant === false || !v.destination)) {
            return { hasViableVessels: false, vesselsCount: 0, status: "empty" };
          }
        }
      }
    }
  }

  return { hasViableVessels: true, vesselsCount: 1, status: "default" };
}
