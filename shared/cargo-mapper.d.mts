export type NormalizedCargoMapping = {
  categoriaCarga: string;
  productoEspecifico: string;
  especificacionCarga: string;
  especificacionCargaId: string;
  hasBigBags: boolean;
  rawCargo: string;
};

export const CARGO_CATEGORIES: readonly string[];
export const CARGO_PRODUCTS: readonly string[];
export const CARGO_SPECIFICATION_IDS: readonly string[];
export const CARGO_SPECIFICATIONS: Readonly<Record<string, string>>;
export const CARGO_METHODS: readonly string[];
export const LAYTIME_TERMS: readonly string[];

export function mapCargoDescription(value: unknown): NormalizedCargoMapping;
export function normalizeCargoMethod(value: unknown): string;
export function normalizeLaytimeTerm(value: unknown): string;
export function normalizeNlpVoyagePayload(
  payload?: Record<string, unknown>,
  sourceText?: string,
): Record<string, unknown>;
