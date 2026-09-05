import React, { useState, useEffect } from 'react';

/**
 * ForwarderWorkspace - Módulo B2B para Transitarios (Forwarders).
 * Permite gestionar expedientes comerciales, listar proyectos desde Neon DB
 * y preparar servicios logísticos multimodales.
 */
export function ForwarderWorkspace() {
  const [projects, setProjects] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState(null);
  const [activeProject, setActiveProject] = useState(null);

  const fetchProjects = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/.netlify/functions/forwarder-projects', {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: No se pudo recuperar los proyectos.`);
      }

      const data = await res.json();
      const list = Array.isArray(data) ? data : (data.projects || []);
      setProjects(list);

      // Si había un proyecto activo, mantenerlo actualizado con datos frescos
      if (activeProject) {
        const updated = list.find((p) => p.id === activeProject.id || p.project_ref === activeProject.project_ref);
        if (updated) {
          setActiveProject(updated);
        }
      }
    } catch (err) {
      console.error('[ForwarderWorkspace] Error al consultar proyectos:', err);
      setError(err?.message || 'Error de conexión al cargar proyectos.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const handleCreateProject = async () => {
    const input = window.prompt('Introduce el nombre del cliente para el nuevo proyecto / expediente:');
    if (input === null) return; // Cancelado por el usuario
    const clientName = input.trim();
    if (!clientName) {
      window.alert('El nombre del cliente no puede estar vacío.');
      return;
    }

    setIsCreating(true);
    try {
      const res = await fetch('/.netlify/functions/forwarder-projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ client_name: clientName }),
      });

      if (!res.ok) {
        const errorPayload = await res.json().catch(() => ({}));
        throw new Error(errorPayload.error || `Error ${res.status} al crear el proyecto.`);
      }

      const payload = await res.json();
      const createdProject = payload.project || payload;

      // Actualizar la lista en memoria y seleccionar el nuevo proyecto
      setProjects((prev) => [createdProject, ...prev]);
      setActiveProject(createdProject);
    } catch (err) {
      console.error('[ForwarderWorkspace] Error al crear proyecto:', err);
      window.alert(`No se pudo crear el proyecto: ${err?.message || 'Error desconocido'}`);
    } finally {
      setIsCreating(false);
    }
  };

  const renderStatusBadge = (status) => {
    const rawStatus = String(status || 'BORRADOR').toUpperCase();
    let badgeClasses = 'bg-amber-500/10 text-amber-400 border-amber-500/30';

    if (rawStatus === 'ACTIVO' || rawStatus === 'CONFIRMADO' || rawStatus === 'COMPLETADO') {
      badgeClasses = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
    } else if (rawStatus === 'EN PROCESO' || rawStatus === 'COTIZACION') {
      badgeClasses = 'bg-sky-500/10 text-sky-400 border-sky-500/30';
    } else if (rawStatus === 'CANCELADO') {
      badgeClasses = 'bg-rose-500/10 text-rose-400 border-rose-500/30';
    }

    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold border tracking-wider uppercase ${badgeClasses}`}>
        <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80"></span>
        {rawStatus}
      </span>
    );
  };

  const formatCreationDate = (item) => {
    if (item.date) return item.date;
    if (item.created_at) {
      try {
        const d = new Date(item.created_at);
        if (!isNaN(d.getTime())) {
          return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
        }
      } catch (_) {}
    }
    return 'Reciente';
  };

  return (
    <div className="w-full h-full flex overflow-hidden bg-slate-950 text-slate-100 font-sans">
      {/* ======================================================== */}
      {/* COLUMNA IZQUIERDA (Sidebar - ancho fijo w-80)           */}
      {/* ======================================================== */}
      <aside className="w-80 shrink-0 bg-slate-900 border-r border-slate-800 flex flex-col h-full overflow-hidden">
        {/* Cabecera Sidebar y Botón Principal */}
        <div className="p-4 border-b border-slate-800">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-lg" aria-hidden="true">💼</span>
              <div>
                <h2 className="text-xs font-black text-slate-100 uppercase tracking-wider">Transitarios B2B</h2>
                <p className="text-[10px] text-slate-400 font-medium">Expedientes & Proyectos</p>
              </div>
            </div>
            <span className="text-[10px] font-bold text-sky-400 bg-sky-950/80 px-2 py-0.5 rounded border border-sky-800/60 font-mono">
              {projects.length} {projects.length === 1 ? 'PROYECTO' : 'PROYECTOS'}
            </span>
          </div>

          <button
            type="button"
            id="btn-create-forwarder-project"
            onClick={handleCreateProject}
            disabled={isCreating}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-bold text-xs uppercase tracking-wider rounded-lg shadow-md hover:shadow-blue-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {isCreating ? (
              <>
                <span className="animate-spin inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full" aria-hidden="true"></span>
                <span>Creando proyecto...</span>
              </>
            ) : (
              <>
                <span className="text-sm" aria-hidden="true">➕</span>
                <span>+ Nuevo Proyecto</span>
              </>
            )}
          </button>
        </div>

        {/* Lista escroleable de proyectos */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400 space-y-3">
              <div className="animate-spin w-6 h-6 border-2 border-sky-500 border-t-transparent rounded-full" aria-hidden="true"></div>
              <p className="text-xs font-semibold">Cargando proyectos...</p>
            </div>
          ) : error ? (
            <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-200 text-xs">
              <p className="font-bold mb-1">No se pudieron cargar los expedientes</p>
              <p className="text-[11px] opacity-80 mb-3">{error}</p>
              <button
                type="button"
                onClick={fetchProjects}
                className="w-full py-1.5 bg-rose-800/60 hover:bg-rose-700/60 rounded text-[11px] font-bold text-white transition cursor-pointer"
              >
                Reintentar
              </button>
            </div>
          ) : projects.length === 0 ? (
            <div className="py-16 px-4 text-center">
              <div className="w-10 h-10 rounded-full bg-slate-800/80 border border-slate-700 flex items-center justify-center mx-auto mb-3 text-slate-400" aria-hidden="true">
                📁
              </div>
              <p className="text-xs font-bold text-slate-300">No hay proyectos registrados</p>
              <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                Pulsa en "+ Nuevo Proyecto" para crear tu primer expediente comercial.
              </p>
            </div>
          ) : (
            projects.map((proj) => {
              const isSelected = activeProject && (activeProject.id === proj.id || activeProject.project_ref === proj.project_ref);
              return (
                <div
                  key={proj.id || proj.project_ref}
                  onClick={() => setActiveProject(proj)}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer text-left ${
                    isSelected
                      ? 'bg-slate-800/95 border-blue-500 shadow-md ring-1 ring-blue-500/40'
                      : 'bg-slate-900/60 hover:bg-slate-800/60 border-slate-800/80 hover:border-slate-700'
                  }`}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      setActiveProject(proj);
                    }
                  }}
                  aria-pressed={isSelected ? 'true' : 'false'}
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="font-mono text-[11px] font-bold text-sky-400 tracking-wider">
                      {proj.project_ref || 'EXP-SIN-REF'}
                    </span>
                    {renderStatusBadge(proj.status)}
                  </div>
                  <h3 className="font-bold text-slate-200 text-sm truncate" title={proj.client_name}>
                    {proj.client_name || 'Cliente sin nombre'}
                  </h3>
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-800/70 text-[10px] text-slate-400">
                    <span className="flex items-center gap-1 font-mono">
                      <span aria-hidden="true">📅</span> {formatCreationDate(proj)}
                    </span>
                    {proj.global_margin_percentage ? (
                      <span className="font-semibold text-emerald-400">
                        {proj.global_margin_percentage}% margen
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </aside>

      {/* ======================================================== */}
      {/* LIENZO CENTRAL (Main Area - flex-1)                     */}
      {/* ======================================================== */}
      <main className="flex-1 bg-slate-950 flex flex-col h-full overflow-y-auto">
        {!activeProject ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <div className="w-16 h-16 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-3xl mb-4 shadow-inner" aria-hidden="true">
              💼
            </div>
            <h3 className="text-xl font-black text-slate-200 tracking-tight">Expediente de Transitario</h3>
            <p className="mt-2 max-w-md text-xs leading-relaxed text-slate-400 font-medium">
              Selecciona un proyecto de la lista lateral o crea un nuevo expediente pulsando el botón <strong className="text-sky-400 font-bold">+ Nuevo Proyecto</strong> para gestionar servicios logísticos y tarifas multimodales.
            </p>
          </div>
        ) : (
          <div className="flex-1 flex flex-col p-6 md:p-8 space-y-6">
            {/* Cabecera limpia con client_name grande, project_ref y status */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-800/80">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <span className="font-mono text-xs font-bold text-sky-400 bg-sky-950/70 px-2.5 py-0.5 rounded border border-sky-800/60">
                    {activeProject.project_ref || 'EXP-SIN-REF'}
                  </span>
                  {renderStatusBadge(activeProject.status)}
                </div>
                <h1 className="text-2xl md:text-3xl font-black text-slate-100 tracking-tight">
                  {activeProject.client_name || 'Cliente sin nombre'}
                </h1>
              </div>

              <div className="flex items-center gap-3">
                <div className="text-left sm:text-right text-[11px] text-slate-400 font-mono">
                  <span className="block text-[9px] uppercase tracking-wider text-slate-500 font-bold">Fecha Apertura</span>
                  <span className="font-bold text-slate-300">{formatCreationDate(activeProject)}</span>
                </div>
              </div>
            </div>

            {/* Área de servicios logísticos con diseño de bordes discontinuos */}
            <div className="border-2 border-dashed border-slate-800 hover:border-slate-700/80 rounded-2xl p-12 md:p-16 flex flex-col items-center justify-center text-center bg-slate-900/30 transition-all">
              <div className="w-14 h-14 rounded-2xl bg-slate-900/90 border border-slate-800 flex items-center justify-center text-2xl mb-4 text-slate-400 shadow-inner" aria-hidden="true">
                📦
              </div>
              <h4 className="text-base font-bold text-slate-200 mb-1">
                No hay servicios logísticos añadidos a este proyecto
              </h4>
              <p className="text-xs text-slate-400 max-w-md mb-6 leading-relaxed">
                Comienza agregando fletes marítimos, transporte terrestre, despachos de aduana o servicios de almacenamiento para estructurar la cotización.
              </p>
              <button
                type="button"
                id="btn-add-forwarder-service"
                onClick={() => {
                  window.alert?.('El módulo de adición de servicios logísticos se habilitará en la siguiente fase de desarrollo.');
                }}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-bold text-xs uppercase tracking-wider rounded-lg shadow-md hover:shadow-blue-500/25 transition-all cursor-pointer"
              >
                <span>➕ Añadir Servicio</span>
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default ForwarderWorkspace;

