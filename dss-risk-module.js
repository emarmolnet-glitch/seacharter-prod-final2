import { z } from 'zod';
import {
  defaultDSSState,
  calculateMarketFreightWithRisk,
  dssCommitSchema,
  handleCommitConditions,
  isExportDeficitPOD,
  jwcRiskKeywords,
  isJWCRiskZone,
  evaluateJWCRisk,
  calculateAutoExportDeficitBallast,
  calculateAllInFreightGross
} from './dss-risk-module.mjs';

export {
  defaultDSSState,
  calculateMarketFreightWithRisk,
  dssCommitSchema,
  handleCommitConditions,
  isExportDeficitPOD,
  jwcRiskKeywords,
  isJWCRiskZone,
  evaluateJWCRisk,
  calculateAutoExportDeficitBallast,
  calculateAllInFreightGross
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    defaultDSSState,
    calculateMarketFreightWithRisk,
    dssCommitSchema,
    handleCommitConditions,
    isExportDeficitPOD,
    jwcRiskKeywords,
    isJWCRiskZone,
    evaluateJWCRisk,
    calculateAutoExportDeficitBallast,
    calculateAllInFreightGross
  };
}
