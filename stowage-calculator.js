import {
  normalizarMedidasBulto,
  normalizePackingListItem,
  resolverGeometriaBodegas,
  calcularEstibaTentativaH18,
  calcularProjectCargoFallbackH18,
  generarCargoPlanSvgH18,
  generarProjectCargoPlanSvgH18,
  sendH18SimulationToDataBridge,
} from './stowage-calculator.mjs';

export {
  normalizarMedidasBulto,
  normalizePackingListItem,
  resolverGeometriaBodegas,
  calcularEstibaTentativaH18,
  calcularProjectCargoFallbackH18,
  generarCargoPlanSvgH18,
  generarProjectCargoPlanSvgH18,
  sendH18SimulationToDataBridge,
};

if (typeof window !== 'undefined') {
  window.normalizarMedidasBulto = normalizarMedidasBulto;
  window.normalizePackingListItem = normalizePackingListItem;
  window.resolverGeometriaBodegas = resolverGeometriaBodegas;
  window.calcularEstibaTentativaH18 = calcularEstibaTentativaH18;
  window.calcularProjectCargoFallbackH18 = calcularProjectCargoFallbackH18;
  window.generarCargoPlanSvgH18 = generarCargoPlanSvgH18;
  window.generarProjectCargoPlanSvgH18 = generarProjectCargoPlanSvgH18;
  window.sendH18SimulationToDataBridge = sendH18SimulationToDataBridge;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    normalizarMedidasBulto,
    normalizePackingListItem,
    resolverGeometriaBodegas,
    calcularEstibaTentativaH18,
    calcularProjectCargoFallbackH18,
    generarCargoPlanSvgH18,
    generarProjectCargoPlanSvgH18,
    sendH18SimulationToDataBridge,
  };
}
