export type ComtradeHsCode = Readonly<{
  code: string;
  label: string;
}>;

export type ComtradeHsCodeFamily = Readonly<{
  defaultCode: string;
  codes: readonly ComtradeHsCode[];
}>;

export const COMTRADE_HS_CODES_BY_CARGO_TYPE: Readonly<Record<string, ComtradeHsCodeFamily>> = Object.freeze({
  '10': Object.freeze({
    defaultCode: '252310',
    codes: Object.freeze([
      Object.freeze({ code: '252310', label: 'Clínker de cemento' }),
      Object.freeze({ code: '252321', label: 'Cemento Portland blanco' }),
      Object.freeze({ code: '252329', label: 'Los demás cementos Portland' }),
      Object.freeze({ code: '252390', label: 'Otros cementos hidráulicos' }),
      Object.freeze({ code: '2523', label: 'Cementos hidráulicos (agregado)' }),
    ]),
  }),
  '20': Object.freeze({
    defaultCode: '7208',
    codes: Object.freeze([
      Object.freeze({ code: '7204', label: 'Desperdicios y desechos de hierro o acero' }),
      Object.freeze({ code: '7208', label: 'Productos laminados planos de hierro o acero sin alear' }),
      Object.freeze({ code: '7210', label: 'Laminados planos revestidos de hierro o acero sin alear' }),
      Object.freeze({ code: '7213', label: 'Alambrón de hierro o acero sin alear' }),
      Object.freeze({ code: '7304', label: 'Tubos y perfiles huecos sin soldadura' }),
      Object.freeze({ code: '7306', label: 'Los demás tubos y perfiles huecos de hierro o acero' }),
    ]),
  }),
  '30': Object.freeze({
    defaultCode: '3105',
    codes: Object.freeze([
      Object.freeze({ code: '3101', label: 'Abonos de origen animal o vegetal' }),
      Object.freeze({ code: '3102', label: 'Abonos minerales o químicos nitrogenados' }),
      Object.freeze({ code: '3103', label: 'Abonos minerales o químicos fosfatados' }),
      Object.freeze({ code: '3104', label: 'Abonos minerales o químicos potásicos' }),
      Object.freeze({ code: '3105', label: 'Abonos con dos o tres elementos fertilizantes' }),
    ]),
  }),
  '40': Object.freeze({
    defaultCode: '7601',
    codes: Object.freeze([
      Object.freeze({ code: '7601', label: 'Aluminio en bruto' }),
      Object.freeze({ code: '7602', label: 'Desperdicios y desechos de aluminio' }),
      Object.freeze({ code: '7604', label: 'Barras y perfiles de aluminio' }),
      Object.freeze({ code: '7606', label: 'Chapas y tiras de aluminio' }),
      Object.freeze({ code: '7607', label: 'Hojas y tiras delgadas de aluminio' }),
    ]),
  }),
  '50': Object.freeze({
    defaultCode: '4403',
    codes: Object.freeze([
      Object.freeze({ code: '4401', label: 'Leña, astillas, pellets y desperdicios de madera' }),
      Object.freeze({ code: '4403', label: 'Madera en bruto' }),
      Object.freeze({ code: '4407', label: 'Madera aserrada o desbastada longitudinalmente' }),
      Object.freeze({ code: '4408', label: 'Hojas para chapado y contrachapado' }),
      Object.freeze({ code: '4701', label: 'Pasta mecánica de madera' }),
      Object.freeze({ code: '4703', label: 'Pasta química de madera a la sosa o al sulfato' }),
    ]),
  }),
  '60': Object.freeze({
    defaultCode: '1001',
    codes: Object.freeze([
      Object.freeze({ code: '1001', label: 'Trigo y morcajo' }),
      Object.freeze({ code: '1003', label: 'Cebada' }),
      Object.freeze({ code: '1005', label: 'Maíz' }),
      Object.freeze({ code: '1006', label: 'Arroz' }),
      Object.freeze({ code: '1201', label: 'Habas de soja' }),
    ]),
  }),
  '70': Object.freeze({
    defaultCode: '2701',
    codes: Object.freeze([
      Object.freeze({ code: '2701', label: 'Hulla y combustibles sólidos de hulla' }),
      Object.freeze({ code: '2704', label: 'Coque y semicoque' }),
      Object.freeze({ code: '2709', label: 'Aceites crudos de petróleo o mineral bituminoso' }),
      Object.freeze({ code: '2710', label: 'Aceites de petróleo, excepto crudos' }),
      Object.freeze({ code: '2711', label: 'Gas de petróleo y demás hidrocarburos gaseosos' }),
    ]),
  }),
  '80': Object.freeze({
    defaultCode: '3901',
    codes: Object.freeze([
      Object.freeze({ code: '2809', label: 'Pentóxido de difósforo y ácidos fosfóricos' }),
      Object.freeze({ code: '2814', label: 'Amoníaco anhidro o en disolución acuosa' }),
      Object.freeze({ code: '2901', label: 'Hidrocarburos acíclicos' }),
      Object.freeze({ code: '3901', label: 'Polímeros de etileno en formas primarias' }),
      Object.freeze({ code: '3902', label: 'Polímeros de propileno en formas primarias' }),
    ]),
  }),
  '90': Object.freeze({
    defaultCode: '8429',
    codes: Object.freeze([
      Object.freeze({ code: '8429', label: 'Topadoras, excavadoras y maquinaria autopropulsada' }),
      Object.freeze({ code: '8431', label: 'Partes de maquinaria de las partidas 8425 a 8430' }),
      Object.freeze({ code: '8501', label: 'Motores y generadores eléctricos' }),
      Object.freeze({ code: '8701', label: 'Tractores' }),
      Object.freeze({ code: '8704', label: 'Vehículos para transporte de mercancías' }),
    ]),
  }),
});

export function getComtradeHsCodeFamily(cargoTypeId: unknown): ComtradeHsCodeFamily | null {
  return COMTRADE_HS_CODES_BY_CARGO_TYPE[String(cargoTypeId || '').trim()] || null;
}
