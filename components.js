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

// Función para inyectar bloques comunes
function renderizarBloqueFormulario(id, label, placeholder, options = {}) {
    const {
        type = "text",
        value,
        className = UI.input,
        wrapperClass = "",
        labelClass = UI.label,
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

    return `
        <div class="${wrapperClass}">
            <label class="${labelClass}" for="${id}">${label}</label>
            <input ${inputAttrs}>
        </div>
    `;
}
