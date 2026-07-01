// components.js: El ADN visual compartido
const UI = {
    card: "bg-white p-6 rounded-lg border border-gray-200 shadow-sm",
    input: "w-full p-2 border border-gray-300 rounded text-sm focus:border-blue-500 outline-none transition",
    label: "text-xs font-bold text-gray-500 uppercase mb-1 block",
    btnPrimary: "bg-indigo-900 text-white py-3 px-4 rounded font-bold hover:bg-black transition w-full",
    formGrid: "grid grid-cols-1 md:grid-cols-2 gap-6 mt-4 border-t border-slate-200 pt-4"
};

function renderizarAtributosFormulario(attrs = {}) {
    return Object.entries(attrs)
        .filter(([, value]) => value !== undefined && value !== null && value !== false)
        .map(([key, value]) => value === true ? key : `${key}="${String(value).replace(/"/g, '&quot;')}"`)
        .join(" ");
}

function escaparHtmlFormulario(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function renderizarTooltipFormulario(tooltip) {
    if (!tooltip) return '';
    const text = escaparHtmlFormulario(tooltip);
    return `
        <span class="field-tooltip-trigger" tabindex="0" role="button" aria-label="${text}">
            <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" focusable="false">
                <circle cx="10" cy="10" r="8" stroke="currentColor" stroke-width="1.7"></circle>
                <path d="M10 8.8v5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"></path>
                <circle cx="10" cy="6" r="1" fill="currentColor"></circle>
            </svg>
            <span class="field-tooltip-content">${text}</span>
        </span>
    `;
}

// Función para inyectar bloques comunes
function renderizarBloqueFormulario(id, label, placeholder, options = {}) {
    const {
        type = "text",
        value,
        className = UI.input,
        wrapperClass = "",
        labelClass = UI.label,
        tooltip,
        attrs = {}
    } = options;
    const inputAttrs = renderizarAtributosFormulario({
        type,
        id,
        class: className,
        placeholder,
        value,
        ...attrs
    });
    const labelClasses = tooltip ? `${labelClass} inline-flex items-center gap-1` : labelClass;

    return `
        <div class="${wrapperClass}">
            <label class="${labelClasses}" for="${id}">${label}${renderizarTooltipFormulario(tooltip)}</label>
            <input ${inputAttrs}>
        </div>
    `;
}
