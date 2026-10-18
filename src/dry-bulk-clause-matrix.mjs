/**
 * SeaCharter Core PRO — Matriz Bidireccional de Cláusulas (Dry Bulk Clause Matrix)
 *
 * Módulo de inyección de cláusulas legales y operativas dinámicas para el reporte
 * PDF ejecutivo de SeaCharter Core PRO (cargas secas y graneles).
 *
 * Determina las estipulaciones contractuales según:
 *   1. Tipo/categoría de carga (ej. Cemento/Clinker, Grano, Siderúrgico, etc.)
 *   2. Perspectiva comercial activa: Armador (Owner) vs Fletador (Charterer)
 */

export const DRY_BULK_CLAUSE_MATRIX = Object.freeze({
  cemento_clinker_minerales: Object.freeze({
    id: 'cemento_clinker_minerales',
    label: 'Cemento / Clinker / Minerales y Construcción',
    owner_terms: Object.freeze([
      "Charterers' stevedores to be considered as Owners' servants but Charterers remain fully responsible for any Stevedore Damage (including grab damage to tank top, ladders, and bulkheads).",
      "Loading and discharging operations to be performed using Charterers' grabs. Any time lost due to grab malfunction to count as laytime.",
      "All dust pollution fines, washing, and cleaning costs of holds after discharge to be strictly for Charterers' account. Washing time to count as laytime."
    ]),
    charterer_terms: Object.freeze([
      "Prior to NOR, holds must be presented completely clean, dry, free of loose rust scale, and fully swept (Grain Clean standard), subject to independent surveyor's approval.",
      "Vessel's cranes/derricks to be fully operational at all times. Any time lost due to vessel's gear breakdown to be deducted from laytime.",
      "Owners guarantee all hatch covers are fully watertight. Any cargo damage due to water ingress to be fully for Owners' account."
    ])
  }),

  granos_cereales_agri: Object.freeze({
    id: 'granos_cereales_agri',
    label: 'Cereales, Granos y Productos Agrícolas',
    owner_terms: Object.freeze([
      "Vessel to provide holds clean and dry, suitable for grain carriage in accordance with international standard, with inspection fees at POL for Charterers' account if holds passed on first inspection.",
      "Fumigation, if required, to be for Charterers' account and risk. Any time lost due to fumigation to count as laytime or time on demurrage.",
      "Charterers to be responsible for all trimming expenses, shifting boards, and securing of grain cargo as per IMO Grain Code regulations."
    ]),
    charterer_terms: Object.freeze([
      "Vessel holds to be completely grain-clean, free from odor, insect infestation, loose rust, and certified by National Cargo Bureau (NCB) or equivalent independent surveyor prior to NOR tendering.",
      "Any rejection of holds by surveyors at POL to result in immediate NOR cancellation; time to not count until re-inspection certificate issued, with all associated re-inspection and waiting expenses for Owners' account.",
      "Owners guarantee vessel is fully fitted for carriage of grain in bulk without requiring shifting boards or strapping, complying with international grain carriage stability requirements."
    ])
  }),

  siderurgico_metales: Object.freeze({
    id: 'siderurgico_metales',
    label: 'Carga Siderúrgica, Metales y Chatarra',
    owner_terms: Object.freeze([
      "Loading and stowage to strictly respect vessel's tank top maximum permissible load density (tons/m2). Heavy coil dunnaging to be performed by Charterers under Master's supervision.",
      "Charterers guarantee that scrap cargo is free from dangerous, explosive, or radioactive substances. Any delay or damage resulting from contaminated scrap strictly for Charterers' account.",
      "Stevedore damage to vessel's tank top, hopper plating, or coamings during grab/magnet handling to be reported within 24 hours and settled directly by Charterers."
    ]),
    charterer_terms: Object.freeze([
      "Owners guarantee vessel holds are completely dry, watertight, and suitable for steel cargo stowage. Dunnage and lashing material to be provided by Owners in good maritime standard.",
      "Master to ensure proper ventilation during transit to prevent cargo sweat and condensation. Any condensation damage or rust to be for Owners' account.",
      "Vessel's gear to be fully operational and capable of handling unit loads safely up to crane SWL limits. Any downtime during operations to be deducted from laytime."
    ])
  }),

  biomasa_combustibles: Object.freeze({
    id: 'biomasa_combustibles',
    label: 'Biomasa, Carbón y Combustibles Sólidos',
    owner_terms: Object.freeze([
      "Cargo temperature and gas emissions (methane / CO) to be monitored strictly in accordance with IMSBC Code. Any delay caused by cargo self-heating at berth to count as laytime.",
      "Charterers to ensure moisture content complies with transportable moisture limit (TML). Hold cleaning and residue disposal after discharge for Charterers' account.",
      "Continuous ventilation during voyage as per IMSBC guidelines; Owners not liable for inherent cargo deterioration or spontaneous combustion."
    ]),
    charterer_terms: Object.freeze([
      "Vessel to be equipped with gas detection equipment and proper ventilation compliant with IMSBC Code for solid fuels carriage.",
      "Holds must be washed with fresh water and thoroughly dried prior to loading to avoid sulfur or chemical contamination.",
      "Time lost due to inadequate hold preparation or vessel ventilation failure during voyage shall be for Owners' account."
    ])
  }),

  fertilizantes_quimicos: Object.freeze({
    id: 'fertilizantes_quimicos',
    label: 'Fertilizantes y Graneles Químicos',
    owner_terms: Object.freeze([
      "Holds to be presented lime-washed if required by cargo nature, with cost of special wash and subsequent hold cleaning to be for Charterers' account.",
      "Loading operations to be suspended immediately during rain or high humidity; time lost to count as laytime under FIO terms.",
      "Charterers to hold Owners harmless against any cargo caking or solidification resulting from cargo hygroscopic characteristics."
    ]),
    charterer_terms: Object.freeze([
      "Vessel holds to be completely clean, dry, odor-free and inspected before loading. Hatch covers must be proven watertight by hose test if requested by surveyor.",
      "Vessel must maintain hatch covers tightly closed during precipitation; any damage due to moisture ingress while hatches are open under Master's order to be for Owners' account.",
      "Owners guarantee no previous cargo residues that could cross-contaminate fertilizer cargo."
    ])
  }),

  general_dry_bulk: Object.freeze({
    id: 'general_dry_bulk',
    label: 'Carga General Seca / Granel Estándar',
    owner_terms: Object.freeze([
      "Loading, stowing, trimming and discharging to be performed by Charterers' stevedores free of expense and risk to Owners (FIOS terms).",
      "Any stevedore damage to be notified prior to vessel sailing and repaired at Charterers' time and expense.",
      "All dues, taxes, and port tariffs customarily assessed on the cargo to be for Charterers' account."
    ]),
    charterer_terms: Object.freeze([
      "Prior to NOR, holds must be presented completely clean, dry, free of loose rust scale, and fully swept, subject to independent surveyor's approval.",
      "Vessel's cranes and cargo handling gear to be fully operational at all times. Any time lost due to vessel's gear breakdown to be deducted from laytime.",
      "Owners warrant vessel is tight, staunch, and seaworthy, with hatch covers fully watertight throughout the voyage."
    ])
  })
});

/**
 * Normaliza una cadena de texto eliminando tildes, mayúsculas y caracteres especiales.
 */
function normalizeText(val) {
  return String(val ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Determina la categoría de carga seca a partir de la entrada recibida
 * (categoría, producto específico, taxonomy ID o texto libre).
 *
 * @param {string|object} cargoInput
 * @returns {string} ID de la categoría en DRY_BULK_CLAUSE_MATRIX
 */
export function resolveBulkCategory(cargoInput) {
  if (!cargoInput) return 'cemento_clinker_minerales'; // Predeterminado industrial SeaCharter

  let text = '';
  if (typeof cargoInput === 'object') {
    text = [
      cargoInput.bulk_category,
      cargoInput.bulkCategory,
      cargoInput.cargo_category,
      cargoInput.cargoCategory,
      cargoInput.cargoProduct,
      cargoInput.cargo_product,
      cargoInput.cargoType,
      cargoInput.cargo_type,
      cargoInput.commodity,
      cargoInput.name,
      cargoInput.id
    ].filter(Boolean).join(' ');
  } else {
    text = String(cargoInput);
  }

  const normalized = normalizeText(text);

  // 1. Biomasa, Carbón y Combustibles Sólidos (Spec 50 / 70)
  if (
    normalized === '70' || normalized === '50' ||
    /\b(biomasa|biomass|carbon|coal|antracita|coque|coke|pellet\w*|astilla\w*|grignon|lena|woodchips?)\b/.test(normalized) ||
    normalized.includes('biomasa y combustibles') ||
    normalized.includes('carbon mineral')
  ) {
    return 'biomasa_combustibles';
  }

  // 2. Granos, Cereales, Soja y Agricultura (Spec 60)
  if (
    normalized === '60' ||
    /\b(grano\w*|grain\w*|cereal\w*|trigo\w*|wheat\w*|maiz\w*|corn\w*|soja\w*|soy\w*|cebada\w*|barley\w*|arroz\w*|rice\w*|oleaginosa\w*|colza\w*|canola\w*|sorgo\w*|sorghum\w*)\b/.test(normalized) ||
    normalized.includes('cereales, granos')
  ) {
    return 'granos_cereales_agri';
  }

  // 3. Carga Siderúrgica, Acero, Metales y Chatarra (Spec 20)
  if (
    normalized === '20' ||
    /\b(acero\w*|steel\w*|hierro\w*|iron\w*|chatarra\w*|scrap\w*|bobina\w*|coil\w*|tubo\w*|pipe\w*|alambron\w*|billet\w*|palanquilla\w*|perfil\w*|rebar\w*|siderurg\w*)\b/.test(normalized) ||
    normalized.includes('carga siderurgica') ||
    normalized.includes('bobinas de acero') ||
    normalized.includes('tubos de acero')
  ) {
    return 'siderurgico_metales';
  }

  // 4. Fertilizantes y Graneles Químicos (Spec 30 / 80)
  if (
    normalized === '30' || normalized === '80' ||
    /\b(fertiliz\w*|abono\w*|urea\w*|fosfat\w*|phosphate\w*|potas\w*|potash\w*|dap|map|sulfat\w*|nitrat\w*|quimic\w*|chemical\w*)\b/.test(normalized) ||
    normalized.includes('fertilizantes y abonos')
  ) {
    return 'fertilizantes_quimicos';
  }

  // 5. Cemento, Clinker, Yeso, Cal y Minerales de Construcción (Spec 10)
  if (
    normalized === '10' ||
    /\b(cemento\w*|cement\w*|clinker\w*|clinquer\w*|yeso\w*|gypsum\w*|cal\b|lime\b|mineral\w*|arido\w*|sand\b|gravel\b|escoria\w*|slag\b|ceniza\w*|fly ash)\b/.test(normalized) ||
    normalized.includes('minerales y construccion') ||
    normalized.includes('cemento a granel') ||
    normalized.includes('big bags (minerales/cemento)')
  ) {
    return 'cemento_clinker_minerales';
  }

  // 6. Carga General Seca / Granel Estándar
  if (
    normalized === '100' ||
    /\b(general|estandar|standard|unitizada|breakbulk|otros?|miscellaneous)\b/.test(normalized) ||
    normalized.includes('granel general') ||
    normalized.includes('carga general')
  ) {
    return 'general_dry_bulk';
  }

  // Si se reconoce explícitamente una clave del diccionario
  if (DRY_BULK_CLAUSE_MATRIX[normalized]) {
    return normalized;
  }

  return 'cemento_clinker_minerales';
}

/**
 * Resuelve el rol comercial activo normalizándolo a 'owner' o 'charterer'.
 *
 * @param {string|object} roleInput
 * @returns {'owner'|'charterer'}
 */
export function resolveCommercialRole(roleInput) {
  if (!roleInput) return 'owner';

  let roleStr = '';
  if (typeof roleInput === 'object') {
    roleStr = roleInput.commercialRole || roleInput.commercial_role || roleInput.role || roleInput.viewMode || roleInput.mode || '';
  } else {
    roleStr = String(roleInput);
  }

  const normalized = normalizeText(roleStr);

  if (
    normalized === 'charterer' ||
    normalized === 'fletador' ||
    normalized === 'chr' ||
    normalized === 'charterers' ||
    normalized === 'affreteur' ||
    normalized.includes('fletador') ||
    normalized.includes('charterer')
  ) {
    return 'charterer';
  }

  return 'owner';
}

/**
 * Devuelve el título estipulado dinámico según el rol comercial.
 *
 * @param {'owner'|'charterer'|string} role
 * @returns {string}
 */
export function getDynamicClauseTitle(role) {
  const resolvedRole = resolveCommercialRole(role);
  return resolvedRole === 'charterer'
    ? "STIPULATED COMMERCIAL & OPERATIONAL CLAUSES (CHARTERERS' TERMS)"
    : "STIPULATED COMMERCIAL & OPERATIONAL CLAUSES (OWNERS' TERMS)";
}

/**
 * Obtiene el array de cláusulas estipuladas y metadatos según el tipo de carga y rol comercial.
 *
 * @param {string|object} cargoInput Tipo/categoría de carga
 * @param {string|object} roleInput Rol comercial (Owner vs Charterer)
 * @returns {{ title: string, clauses: string[], category: string, role: 'owner'|'charterer', categoryLabel: string }}
 */
export function getStipulatedClauses(cargoInput, roleInput) {
  const categoryKey = resolveBulkCategory(cargoInput);
  const role = resolveCommercialRole(roleInput);
  const categoryData = DRY_BULK_CLAUSE_MATRIX[categoryKey] || DRY_BULK_CLAUSE_MATRIX.cemento_clinker_minerales;
  const termsKey = `${role}_terms`;
  const clauses = categoryData[termsKey] || [];
  const title = getDynamicClauseTitle(role);

  return {
    title,
    clauses: [...clauses],
    category: categoryKey,
    categoryLabel: categoryData.label,
    role
  };
}

/**
 * Genera el fragmento HTML estilizado para la sección de cláusulas del PDF de SeaCharter Core PRO.
 *
 * @param {string|object} cargoInput
 * @param {string|object} roleInput
 * @param {object} [options]
 * @returns {string} HTML renderizado
 */
export function renderStipulatedClausesHtml(cargoInput, roleInput, options = {}) {
  const { title, clauses } = getStipulatedClauses(cargoInput, roleInput);
  const containerId = options.containerId || 'print-stipulated-clauses-section';
  const titleId = options.titleId || 'print-clauses-title';
  const listId = options.listId || 'print-clauses-list';

  const listItems = clauses
    .map(clause => `<li style="margin-bottom: 6px; padding-left: 2px;">${clause}</li>`)
    .join('\n            ');

  return `
<div id="${containerId}" style="margin-top: 22px; break-inside: avoid; page-break-inside: avoid; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
    <h2 id="${titleId}" style="font-size: 10.5pt; font-weight: 700; color: #0f172a; text-transform: uppercase; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; margin-bottom: 8px; display: flex; align-items: center; gap: 8px; letter-spacing: 0.3px;">
        <span style="background-color: #1e3a8a; color: white; display: inline-block; width: 6px; height: 14px; border-radius: 1px;"></span>
        <span>${title}</span>
    </h2>
    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 4px; padding: 10px 14px 8px 14px;">
        <ul id="${listId}" style="margin: 0; padding-left: 20px; font-size: 8pt; color: #334155; line-height: 1.5; list-style-type: disc;">
            ${listItems}
        </ul>
    </div>
</div>`.trim();
}

// Exponer en el entorno global de navegador para compatibilidad directa
if (typeof window !== 'undefined') {
  window.DRY_BULK_CLAUSE_MATRIX = DRY_BULK_CLAUSE_MATRIX;
  window.resolveBulkCategory = resolveBulkCategory;
  window.resolveCommercialRole = resolveCommercialRole;
  window.getDynamicClauseTitle = getDynamicClauseTitle;
  window.getStipulatedClauses = getStipulatedClauses;
  window.renderStipulatedClausesHtml = renderStipulatedClausesHtml;
}

export default DRY_BULK_CLAUSE_MATRIX;
