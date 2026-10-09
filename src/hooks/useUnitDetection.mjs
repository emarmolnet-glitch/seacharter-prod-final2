/**
 * useUnitDetection Hook & Observer Utilities
 * 
 * Detects unit systems (METRIC vs IMPERIAL) and currency (EUR vs USD)
 * dynamically based on origin and destination locations.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';

export const EU_COUNTRIES = ['ES', 'FR', 'DE', 'IT', 'PT', 'NL', 'BE', 'UK', 'GB', 'IE', 'PL', 'SE', 'DK', 'FI', 'AT', 'GR'];

/**
 * Extracts a 2-letter ISO country code from location input text.
 * Checks for:
 * 1. Explicit 2-letter country prefix or ISO in parenthesis (e.g., "(USNYC)" -> "US", "US" -> "US")
 * 2. US state codes or USA mentions (e.g., "Houston, TX", "Chicago, IL", "USA", "United States", "US")
 * 3. Standard UN/LOCODE or IATA/ICAO pattern where first 2 letters indicate ISO country (e.g. "USMIA", "JFK" with US context)
 * 4. European mentions or codes
 * 
 * @param {string} locationRaw 
 * @returns {string} 2-letter uppercase ISO country code or empty string
 */
export function extractCountryCode(locationRaw) {
  const str = String(locationRaw || '').trim().toUpperCase();
  if (!str) return '';

  // Check explicit (XX) pattern e.g. (US), (ES), (CN)
  const exactTwoLetterParen = str.match(/\(([A-Z]{2})\)/);
  if (exactTwoLetterParen) {
    return exactTwoLetterParen[1];
  }

  // Check known European cities/ports/countries keywords and other countries
  if (/\b(CHINA|SHENZHEN|NINGBO|SHANGHAI|GUANGZHOU|QINGDAO)\b/i.test(str)) return 'CN';
  if (/\b(SPAIN|ESPAÑA|VALENCIA|BARCELONA|MADRID|ALGECIRAS|BILBAO|MAD|BCN|VLC)\b/i.test(str)) return 'ES';
  if (/\b(FRANCE|FRANCIA|PARIS|LE HAVRE|MARSEILLE|CDG|ORY)\b/i.test(str)) return 'FR';
  if (/\b(GERMANY|ALEMANIA|HAMBURG|BREMEN|FRANKFURT|BERLIN|FRA|HAM)\b/i.test(str)) return 'DE';
  if (/\b(ITALY|ITALIA|GENOVA|GENOA|MILAN|ROMA|TRIESTE|MXP|FCO)\b/i.test(str)) return 'IT';
  if (/\b(NETHERLANDS|ROTTERDAM|AMSTERDAM|HOLANDA|AMS|RTM)\b/i.test(str)) return 'NL';
  if (/\b(BELGIUM|BELGICA|ANTWERP|BRUSSELS|BRU)\b/i.test(str)) return 'BE';
  if (/\b(PORTUGAL|LISBON|LISBOA|LEIXOES|PORTO|LIS)\b/i.test(str)) return 'PT';
  if (/\b(UK|UNITED KINGDOM|REINO UNIDO|LONDON|FELIXSTOWE|SOUTHAMPTON|LHR|LGW)\b/i.test(str)) return 'GB';

  // Check UN/LOCODE in parenthesis e.g. (USNYC), (ESVLC), (CNSZX)
  const locodeParen = str.match(/\(([A-Z]{2})[A-Z0-9]{2,3}\)/);
  if (locodeParen) {
    return locodeParen[1];
  }

  // Check US ZIP codes or US states (e.g. TX, IL, CA, NY, FL, etc., or 5-digit zip)
  const usStateZipRegex = /\b(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)\b|\b\d{5}(-\d{4})?\b|\b(USA|UNITED STATES|EE\.?\s*UU\.?|EEUU)\b/i;
  if (usStateZipRegex.test(str)) {
    return 'US';
  }

  // Check US airport / port known indicators
  if (/\b(JFK|LAX|ORD|MIA|ATL|DFW|EWR|SFO|SEA|BOS|IAH|ONT8|LGB3|CLT2)\b/i.test(str)) {
    return 'US';
  }
  if (/\b(NETHERLANDS|ROTTERDAM|AMSTERDAM|HOLANDA|AMS|RTM)\b/i.test(str)) return 'NL';
  if (/\b(BELGIUM|BELGICA|ANTWERP|BRUSSELS|BRU)\b/i.test(str)) return 'BE';
  if (/\b(PORTUGAL|LISBON|LISBOA|LEIXOES|PORTO|LIS)\b/i.test(str)) return 'PT';
  if (/\b(UK|UNITED KINGDOM|REINO UNIDO|LONDON|FELIXSTOWE|SOUTHAMPTON|LHR|LGW)\b/i.test(str)) return 'GB';

  // If starts with 2 letters followed by code e.g. USNYC, ESBCN, DEHAM, CNSZX
  const codeMatch = str.match(/^([A-Z]{2})[A-Z0-9]{2,3}\b/);
  if (codeMatch) {
    return codeMatch[1];
  }

  // Check if starts directly with 2-letter country code
  const twoLetter = str.slice(0, 2);
  if (/^[A-Z]{2}$/.test(twoLetter) && str.length === 2) {
    return twoLetter;
  }

  // Fallback to first 2 letters if alphabetical
  if (/^[A-Z]{2}/.test(str)) {
    return str.slice(0, 2);
  }

  return '';
}

/**
 * Detects whether the active system should be METRIC or IMPERIAL based on origin & destination.
 * If ISO code (or first 2 letters) of Origen or Destino is 'US', returns 'IMPERIAL'.
 * Otherwise returns 'METRIC'.
 * 
 * @param {string} origin 
 * @param {string} destination 
 * @returns {'METRIC' | 'IMPERIAL'}
 */
export function detectUnitSystem(origin, destination) {
  const originIso = extractCountryCode(origin);
  const destIso = extractCountryCode(destination);

  if (originIso === 'US' || destIso === 'US') {
    return 'IMPERIAL';
  }
  return 'METRIC';
}

/**
 * Detects currency based on origin and destination.
 * If origin or destination country code is within Europe (EU_COUNTRIES), returns 'EUR'.
 * If US, LatAm, Asia, or default, returns 'USD'.
 * 
 * @param {string} origin 
 * @param {string} destination 
 * @returns {'EUR' | 'USD'}
 */
export function detectCurrency(origin, destination) {
  const originIso = extractCountryCode(origin);
  const destIso = extractCountryCode(destination);

  // If European origin or destination -> EUR
  if (EU_COUNTRIES.includes(originIso) || EU_COUNTRIES.includes(destIso)) {
    // If either is explicitly US and the other is not European, USD
    if ((originIso === 'US' && !EU_COUNTRIES.includes(destIso)) || (destIso === 'US' && !EU_COUNTRIES.includes(originIso))) {
      return 'USD';
    }
    return 'EUR';
  }

  return 'USD';
}

/**
 * Returns unit representations for the given unit system.
 * 
 * @param {'METRIC' | 'IMPERIAL'} currentSystem 
 */
export function getUnitsForSystem(currentSystem) {
  const isImperial = currentSystem === 'IMPERIAL';
  return {
    system: currentSystem,
    weightUnit: isImperial ? 'lbs' : 'kg',
    dimensionUnit: isImperial ? 'in' : 'cm',
    distanceUnit: isImperial ? 'mi' : 'km',
    weightLabel: isImperial ? 'lbs' : 'kg',
    dimensionLabel: isImperial ? 'in' : 'cm',
    distanceLabel: isImperial ? 'mi' : 'km',
  };
}

/**
 * React Hook to observe Origin and Destination inputs and detect units + currency reactively.
 * 
 * @param {string} origin 
 * @param {string} destination 
 */
export function useUnitDetection(origin = '', destination = '') {
  const [currentOrigin, setCurrentOrigin] = useState(origin);
  const [currentDestination, setCurrentDestination] = useState(destination);

  useEffect(() => {
    setCurrentOrigin(origin);
  }, [origin]);

  useEffect(() => {
    setCurrentDestination(destination);
  }, [destination]);

  const currentSystem = useMemo(() => {
    return detectUnitSystem(currentOrigin, currentDestination);
  }, [currentOrigin, currentDestination]);

  const units = useMemo(() => {
    return getUnitsForSystem(currentSystem);
  }, [currentSystem]);

  const currency = useMemo(() => {
    return detectCurrency(currentOrigin, currentDestination);
  }, [currentOrigin, currentDestination]);

  const currencySymbol = currency === 'EUR' ? '€' : '$';

  const updateLocations = useCallback((newOrigin, newDestination) => {
    if (newOrigin !== undefined) setCurrentOrigin(newOrigin);
    if (newDestination !== undefined) setCurrentDestination(newDestination);
  }, []);

  return {
    currentSystem,
    isImperial: currentSystem === 'IMPERIAL',
    isMetric: currentSystem === 'METRIC',
    weightUnit: units.weightUnit,
    dimensionUnit: units.dimensionUnit,
    distanceUnit: units.distanceUnit,
    currency,
    currencySymbol,
    originCountry: extractCountryCode(currentOrigin),
    destCountry: extractCountryCode(currentDestination),
    updateLocations,
    setOrigin: setCurrentOrigin,
    setDestination: setCurrentDestination,
  };
}

export default useUnitDetection;
