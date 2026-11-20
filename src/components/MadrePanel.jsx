import React from 'react';
import GlobalMadreDrawer, {
  MADRE_API_ENDPOINT,
  triggerLaserScanEffect,
  ejecutarEscaneoVisual,
  ejecutarEfectoLaserScan,
  extractStructuredCoreProData,
  extraerDatosEstructuradosCorePro,
  compactPayload,
  SCAN_COMMAND_REGEX,
  hasOperationalInputData,
  PENDING_OPERATION_MESSAGE,
  ejecutarEscaneoCompleto,
  ejecutarEscaneoDosTiempos,
  buildMotherExecutiveScript,
  formatMotherVerdict,
  playNeuralMotherVoice,
  capturarDomModuloActivo,
  detectarModuloActual,
  getCoreProUIContext,
  SEACHARTER_DOM_DICTIONARY,
  extractDynamicAuditContext,
  hasActiveDocumentOrAudit,
  MarkdownMessage,
  CopyReportButton
} from './GlobalMadreDrawer.jsx';

export {
  MADRE_API_ENDPOINT,
  triggerLaserScanEffect,
  ejecutarEscaneoVisual,
  ejecutarEfectoLaserScan,
  extractStructuredCoreProData,
  extraerDatosEstructuradosCorePro,
  compactPayload,
  SCAN_COMMAND_REGEX,
  hasOperationalInputData,
  PENDING_OPERATION_MESSAGE,
  ejecutarEscaneoCompleto,
  ejecutarEscaneoDosTiempos,
  buildMotherExecutiveScript,
  formatMotherVerdict,
  playNeuralMotherVoice,
  capturarDomModuloActivo,
  detectarModuloActual,
  getCoreProUIContext,
  SEACHARTER_DOM_DICTIONARY,
  extractDynamicAuditContext,
  hasActiveDocumentOrAudit,
  MarkdownMessage,
  CopyReportButton,
  GlobalMadreDrawer
};

export const MadrePanel = GlobalMadreDrawer;
export default MadrePanel;
