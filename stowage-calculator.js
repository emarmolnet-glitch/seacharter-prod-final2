import {
  normalizarMedidasBulto,
  resolverGeometriaBodegas,
  calcularEstibaTentativaH18,
  generarCargoPlanSvgH18,
  sendH18SimulationToDataBridge,
} from './stowage-calculator.mjs';

export {
  normalizarMedidasBulto,
  resolverGeometriaBodegas,
  calcularEstibaTentativaH18,
  generarCargoPlanSvgH18,
  sendH18SimulationToDataBridge,
};

if (typeof window !== 'undefined') {
  window.normalizarMedidasBulto = normalizarMedidasBulto;
  window.resolverGeometriaBodegas = resolverGeometriaBodegas;
  window.calcularEstibaTentativaH18 = calcularEstibaTentativaH18;
  window.generarCargoPlanSvgH18 = generarCargoPlanSvgH18;
  window.sendH18SimulationToDataBridge = sendH18SimulationToDataBridge;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    normalizarMedidasBulto,
    resolverGeometriaBodegas,
    calcularEstibaTentativaH18,
    generarCargoPlanSvgH18,
    sendH18SimulationToDataBridge,
  };
}
