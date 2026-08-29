# Reglas de Gobernanza y Directrices Operativas del Proyecto

## 1. Separación Estricta entre Procesos Automáticos y Controles Manuales

### Módulo "MOTOR DE RIESGO HISTÓRICO"
* **Activación Exclusivamente Manual:** Queda estrictamente prohibido sugerir, simular o disparar de manera autónoma cualquier acción, llamada a endpoint o botón asociado a este módulo.
* **Acciones Restringidas al Usuario:**
  * Cargar Histórico / Consultar Radar En Vivo.
  * Finalizar Viaje / Cierre de Operación.
  * Barridos de radar AIS y peticiones a la API de Datalastic / AISStream.
* **Comportamiento del Sistema/IA:** El sistema o asistente nunca debe invocar estos procesos por su cuenta en background o como paso implícito de cálculo.

### Botón y Proceso "Generar Informe Master"
* **Activación Deliberada por el Usuario:** El sistema/IA no debe disparar, asumir la compilación en segundo plano ni automatizar la generación de este informe.
* Su ejecución responde única y exclusivamente al clic manual y deliberado del operador humano en la interfaz.
