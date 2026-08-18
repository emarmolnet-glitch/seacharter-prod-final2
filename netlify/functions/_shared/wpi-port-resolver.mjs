import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

let catalogPromise;

function parseCsvLine(line) {
  const values = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"' && quoted && line[index + 1] === '"') {
      value += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      values.push(value.trim());
      value = "";
    } else {
      value += character;
    }
  }
  values.push(value.trim());
  return values;
}

export function normalizeWpiPortName(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\b(?:PORT|PUERTO|HARBOU?R)\s+(?:OF|DE|DEL|DA|DO)\s+/g, "")
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function inputCountryCode(value) {
  const matches = String(value ?? "").toUpperCase().match(/(?:\(|,|\s)([A-Z]{2})\)?\s*$/);
  return matches?.[1] || "";
}

function comparableInput(value) {
  const countryCode = inputCountryCode(value);
  const withoutCountry = countryCode
    ? String(value).replace(new RegExp(`(?:\\(|,|\\s)${countryCode}\\)?\\s*$`, "i"), "")
    : value;
  return { normalizedName: normalizeWpiPortName(withoutCountry), countryCode };
}

function levenshteinDistance(left, right) {
  if (!left.length) return right.length;
  if (!right.length) return left.length;
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitution = previous[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1);
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        substitution,
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length];
}

function similarity(left, right) {
  if (left === right) return 1;
  const longest = Math.max(left.length, right.length);
  if (!longest) return 0;
  const editScore = 1 - (levenshteinDistance(left, right) / longest);
  if (left.includes(right) || right.includes(left)) {
    return Math.max(editScore, Math.min(left.length, right.length) / longest * 0.92);
  }
  return editScore;
}

function toPublicRecord(record) {
  return {
    indexNo: record.indexNo,
    regionNo: record.regionNo,
    name: record.name,
    officialLabel: record.officialLabel,
    countryCode: record.countryCode,
    latitude: record.latitude,
    longitude: record.longitude,
    source: "WPI",
  };
}

async function readWpiCsv() {
  const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(process.cwd(), "wpi.csv"),
    path.resolve(process.cwd(), "public/WPI.csv"),
    path.resolve(moduleDirectory, "../../../wpi.csv"),
  ];
  for (const candidate of candidates) {
    try {
      return await readFile(candidate, "utf8");
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  throw new Error("WPI.csv is not available in the function bundle.");
}

export async function loadWpiCatalog() {
  if (!catalogPromise) {
    catalogPromise = readWpiCsv().then((csv) => csv
      .split(/\r?\n/)
      .slice(1)
      .map(parseCsvLine)
      .filter((columns) => columns.length > 5 && columns[2])
      .map((columns) => {
        const latitude = Number(columns[4]);
        const longitude = Number(columns[5]);
        const name = String(columns[2]).trim();
        const countryCode = String(columns[3]).trim().toUpperCase();
        return {
          indexNo: Number.parseInt(columns[0], 10) || null,
          regionNo: Number.parseInt(columns[1], 10) || null,
          name,
          normalizedName: normalizeWpiPortName(name),
          officialLabel: `${name} (${countryCode || "INT"})`,
          countryCode,
          latitude,
          longitude,
        };
      })
      .filter((record) => record.normalizedName && Number.isFinite(record.latitude) && Number.isFinite(record.longitude)));
  }
  return catalogPromise;
}

export function resolveWpiPortFromCatalog(query, catalog, options = {}) {
  const rawQuery = String(query ?? "").trim();
  const { normalizedName, countryCode } = comparableInput(rawQuery);
  const suggestionLimit = Number(options.suggestionLimit) || 3;
  if (!normalizedName) return { status: "not_found", query: rawQuery, suggestions: [] };

  const countryMatches = countryCode
    ? catalog.filter((record) => record.countryCode === countryCode)
    : catalog;
  const exactMatches = countryMatches.filter((record) => record.normalizedName === normalizedName);
  if (exactMatches.length === 1) {
    return { status: "resolved", query: rawQuery, match: toPublicRecord(exactMatches[0]), suggestions: [] };
  }
  if (exactMatches.length > 1) {
    return {
      status: "ambiguous",
      query: rawQuery,
      suggestions: exactMatches.slice(0, suggestionLimit).map(toPublicRecord),
    };
  }

  const ranked = countryMatches
    .map((record) => ({ record, score: similarity(normalizedName, record.normalizedName) }))
    .filter(({ score }) => score >= 0.68)
    .sort((left, right) => right.score - left.score || left.record.officialLabel.localeCompare(right.record.officialLabel));
  const [best, second] = ranked;
  const suggestions = ranked.slice(0, suggestionLimit).map(({ record }) => toPublicRecord(record));
  if (!best) return { status: "not_found", query: rawQuery, suggestions: [] };

  const confidenceGap = best.score - (second?.score ?? 0);
  if (best.score >= 0.82 && (confidenceGap >= 0.08 || !second)) {
    return { status: "resolved", query: rawQuery, match: toPublicRecord(best.record), suggestions };
  }
  return { status: "ambiguous", query: rawQuery, suggestions };
}

export async function resolveWpiPort(query, options = {}) {
  return resolveWpiPortFromCatalog(query, await loadWpiCatalog(), options);
}

function issueMessage(role, resolution) {
  const label = role === "pol" ? "POL" : "POD";
  const suggestionText = resolution.suggestions?.length
    ? ` ¿Te refieres a ${resolution.suggestions.map((port) => port.officialLabel).join(" o ")}?`
    : "";
  if (resolution.status === "ambiguous") {
    return `Hay varias coincidencias WPI posibles para ${label} “${resolution.query}”.${suggestionText}`;
  }
  return `No encuentro el ${label} “${resolution.query}” en el índice mundial WPI.${suggestionText}`;
}

export async function validateWpiVoyagePorts(pol, pod) {
  const catalog = await loadWpiCatalog();
  const [polResolution, podResolution] = [
    resolveWpiPortFromCatalog(pol, catalog),
    resolveWpiPortFromCatalog(pod, catalog),
  ];
  const issues = [
    ...(polResolution.status === "resolved" ? [] : [issueMessage("pol", polResolution)]),
    ...(podResolution.status === "resolved" ? [] : [issueMessage("pod", podResolution)]),
  ];
  return {
    valid: issues.length === 0,
    pol: polResolution,
    pod: podResolution,
    clarification: issues.join(" "),
  };
}
