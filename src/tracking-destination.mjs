const AIS_DESTINATION_PREFIX = /^(?:DEST(?:INATION)?|TO|FOR|PORT)\s*[:\-]?\s*/i;
const UNLOCODE_PATTERN = /^[A-Z]{2}[A-Z0-9]{3}$/;

const COMMON_UNLOCODES = Object.freeze({
    ESVLC: 'Valencia (ES)',
    ESBCN: 'Barcelona (ES)',
    ESALG: 'Algeciras (ES)',
    ESBIO: 'Bilbao (ES)',
    ESCTG: 'Cartagena (ES)',
    ESLEI: 'Almería (ES)',
    ESVGO: 'Vigo (ES)',
    NLRTM: 'Rotterdam (NL)',
    BEANR: 'Antwerp (BE)',
    DEHAM: 'Hamburg (DE)',
    GBFXT: 'Felixstowe (GB)',
    GBLGP: 'London Gateway (GB)',
    FRMRS: 'Marseille (FR)',
    FRLEH: 'Le Havre (FR)',
    ITGOA: 'Genoa (IT)',
    GRPIR: 'Piraeus (GR)',
    TRMER: 'Mersin (TR)',
    AEAUH: 'Abu Dhabi (AE)',
    AEJEA: 'Jebel Ali (AE)',
    SGSIN: 'Singapore (SG)',
    CNSHA: 'Shanghai (CN)',
    CNNGB: 'Ningbo (CN)',
    CNYTN: 'Yantian (CN)',
    HKHKG: 'Hong Kong (HK)',
    JPTYO: 'Tokyo (JP)',
    KRPUS: 'Busan (KR)',
    USNYC: 'New York (US)',
    USLAX: 'Los Angeles (US)',
    USHOU: 'Houston (US)',
    BRSSZ: 'Santos (BR)',
    MAPTM: 'Tanger Med (MA)',
    DZBJA: 'Bejaia (DZ)',
    PTAVE: 'Aveiro (PT)',
});

function cleanDestination(value) {
    return String(value || '')
        .normalize('NFKC')
        .replace(/\0/g, '')
        .trim()
        .replace(AIS_DESTINATION_PREFIX, '')
        .replace(/\s+/g, ' ')
        .replace(/^[>/]+|[</]+$/g, '')
        .trim();
}

export function normalizeAisDestination(value) {
    const raw = cleanDestination(value);
    if (!raw) return null;
    const locodeCandidate = raw.toUpperCase().replace(/^UN\/LOCODE\s*[:\-]?\s*/i, '').replace(/[^A-Z0-9]/g, '');
    if (UNLOCODE_PATTERN.test(locodeCandidate)) {
        const name = COMMON_UNLOCODES[locodeCandidate] || locodeCandidate;
        return {
            raw,
            name,
            locode: locodeCandidate,
            isLocode: true,
            searchQuery: COMMON_UNLOCODES[locodeCandidate] || locodeCandidate,
        };
    }
    return {
        raw,
        name: raw,
        locode: null,
        isLocode: false,
        searchQuery: raw,
    };
}
