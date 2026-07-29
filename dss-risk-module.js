import { z } from 'zod';
import {
  defaultDSSState,
  calculateMarketFreightWithRisk,
  dssCommitSchema,
  handleCommitConditions
} from './dss-risk-module.mjs';

export {
  defaultDSSState,
  calculateMarketFreightWithRisk,
  dssCommitSchema,
  handleCommitConditions
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    defaultDSSState,
    calculateMarketFreightWithRisk,
    dssCommitSchema,
    handleCommitConditions
  };
}
