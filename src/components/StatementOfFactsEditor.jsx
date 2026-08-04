import React, { useState } from 'react';

export default function StatementOfFactsEditor({ onEventsChange, terms = 'SHINC' }) {
  const [events, setEvents] = useState([]);
  const [formData, setFormData] = useState({
    type: 'WEATHER',
    startTime: '',
    endTime: '',
    description: ''
  });

  const eventTypes = [
    { id: 'WEATHER', label: 'Mal Tiempo (Lluvia/Viento)' },
    { id: 'WEEKEND', label: 'Fin de Semana / Festivo' },
    { id: 'BREAKDOWN', label: 'Avería de Grúa / Puerto' },
    { id: 'STRIKE', label: 'Huelga (Strike)' },
    { id: 'WAITING', label: 'Espera de Atraque / Congestión' },
    { id: 'INSPECTION', label: 'Inspección de Bodegas' },
    { id: 'SHIFTING', label: 'Movimiento de Muelle (Shifting)' }
  ];

  const calculateHours = (start, end) => {
    if (!start || !end) return 0;
    const diff = new Date(end) - new Date(start);
    return diff > 0 ? (diff / (1000 * 60 * 60)).toFixed(2) : 0;
  };

  const handleAddEvent = (e) => {
    e.preventDefault();
    if (!formData.startTime || !formData.endTime) return;

    if (terms === 'SHINC' && formData.type === 'WEEKEND') {
      alert(`Atención: El contrato actual opera bajo términos ${terms}. El tiempo cuenta de forma ininterrumpida y no se pueden deducir fines de semana ni festivos.`);
      return;
    }

    const hours = calculateHours(formData.startTime, formData.endTime);
    
    const newEvent = {
      id: Date.now(),
      ...formData,
      durationHours: parseFloat(hours)
    };

    const updatedEvents = [...events, newEvent];
    setEvents(updatedEvents);
    
    if (onEventsChange) onEventsChange(updatedEvents);
    setFormData({ ...formData, startTime: '', endTime: '', description: '' });
  };

  const handleRemoveEvent = (id) => {
    const updatedEvents = events.filter(ev => ev.id !== id);
    setEvents(updatedEvents);
    if (onEventsChange) onEventsChange(updatedEvents);
  };

  const totalDeductedHours = events.reduce((sum, ev) => sum + ev.durationHours, 0);

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm w-full">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-slate-100 pb-4 mb-4 gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Registro de Eventos (Statement of Facts)</h2>
          <p className="text-xs text-slate-500 mt-1">Transcribe las interrupciones del puerto para el cálculo de deducciones de plancha.</p>
        </div>
        
        <div className="flex gap-4 bg-slate-50 p-2.5 rounded-lg border border-slate-200 items-center shadow-sm">
          <div className="px-2">
            <span className="block text-[10px] font-semibold text-slate-500 uppercase mb-0.5">Regla Activa</span>
            <span className="inline-block text-xs font-mono font-bold bg-cyan-100 text-cyan-800 border border-cyan-200 px-2.5 py-0.5 rounded">
              {terms}
            </span>
          </div>
          <div className="pl-4 border-l border-slate-200 flex flex-col justify-center">
            <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 text-right">Deducciones</span>
            <span className="text-sm font-bold text-rose-600 text-right font-mono">{totalDeductedHours.toFixed(2)} Hrs</span>
          </div>
        </div>
      </div>

      <form onSubmit={handleAddEvent} className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
        <div className="md:col-span-1">
          <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Categoría</label>
          <select 
            className="w-full text-sm border border-slate-200 rounded-lg p-2 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 bg-slate-50 text-slate-900"
            value={formData.type}
            onChange={(e) => setFormData({...formData, type: e.target.value})}
          >
            {eventTypes.map(t => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
        </div>
        <div className="md:col-span-1">
          <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Inicio (Local)</label>
          <input 
            type="datetime-local" 
            className="w-full text-sm border border-slate-200 rounded-lg p-2 bg-slate-50 text-slate-900"
            value={formData.startTime}
            onChange={(e) => setFormData({...formData, startTime: e.target.value})}
            required
          />
        </div>
        <div className="md:col-span-1">
          <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Fin (Local)</label>
          <input 
            type="datetime-local" 
            className="w-full text-sm border border-slate-200 rounded-lg p-2 bg-slate-50 text-slate-900"
            value={formData.endTime}
            onChange={(e) => setFormData({...formData, endTime: e.target.value})}
            required
          />
        </div>
        <div className="md:col-span-1">
          <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Observaciones</label>
          <input 
            type="text" 
            placeholder="Ej. Inspección de bodegas..."
            className="w-full text-sm border border-slate-200 rounded-lg p-2 bg-slate-50 text-slate-900 placeholder:text-slate-400"
            value={formData.description}
            onChange={(e) => setFormData({...formData, description: e.target.value})}
          />
        </div>
        <div className="md:col-span-1 flex items-end">
          <button 
            type="submit"
            className="w-full bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-semibold py-2 px-4 rounded-lg transition-colors"
          >
            + Añadir Evento
          </button>
        </div>
      </form>

      <div className="overflow-x-auto border border-slate-200 rounded-lg">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wider">
              <th className="p-3 font-semibold border-b border-slate-200">Tipo</th>
              <th className="p-3 font-semibold border-b border-slate-200">Inicio</th>
              <th className="p-3 font-semibold border-b border-slate-200">Fin</th>
              <th className="p-3 font-semibold border-b border-slate-200">Observaciones</th>
              <th className="p-3 font-semibold border-b border-slate-200 text-right">Deducción</th>
              <th className="p-3 font-semibold border-b border-slate-200 text-center">Acción</th>
            </tr>
          </thead>
          <tbody className="text-sm text-slate-700 divide-y divide-slate-100">
            {events.length === 0 ? (
              <tr>
                <td colSpan="6" className="p-4 text-center text-slate-400 italic">
                  No se han registrado interrupciones operativas.
                </td>
              </tr>
            ) : (
              events.map((ev) => (
                <tr key={ev.id} className="hover:bg-slate-50">
                  <td className="p-3 font-medium text-slate-900">
                    {eventTypes.find(t => t.id === ev.type)?.label || ev.type}
                  </td>
                  <td className="p-3 font-mono text-xs">{new Date(ev.startTime).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}</td>
                  <td className="p-3 font-mono text-xs">{new Date(ev.endTime).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}</td>
                  <td className="p-3 text-slate-600">{ev.description || '-'}</td>
                  <td className="p-3 text-right font-mono text-rose-600 font-semibold">
                    -{ev.durationHours}h
                  </td>
                  <td className="p-3 text-center">
                    <button 
                      onClick={() => handleRemoveEvent(ev.id)}
                      className="text-slate-400 hover:text-rose-500 transition-colors"
                      title="Eliminar evento"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
