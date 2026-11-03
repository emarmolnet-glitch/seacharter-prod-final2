# Bloqueo de publicación: creación de rama de Netlify Database

El despliegue de vista previa falló durante el aprovisionamiento de Netlify Database. La API devolvió HTTP 500 al crear la rama. El registro no contiene una excepción SQL ni un error de compilación de la aplicación. La causa interna del HTTP 500 no se puede determinar con este registro.

Datos del intento fallido, extraídos del registro:

- Proyecto: neon-seachartercorepro-4ce09d
- Site ID: d4c79070-f5a8-4c57-af3d-6c2c427762dd
- Deploy ID: 6ae8fdff519f8cb0b8d4e158
- Contexto: deploy-preview
- Rama de base de datos solicitada: agent-6ae8eade309
- Operación: createSiteDatabaseBranch
- Respuesta: HTTP 500, internal error
- Netlify Build: 37.7.3

## Comprobaciones realizadas

Las consultas previas de estado de Netlify Database indicaron que la rama solicitada no existía. La consulta previa de la publicación activa mostró la revisión e6087717bdabd8e020d4981624f4624c35722721, publicada el 2 de noviembre de 2026 a las 19:55:31 UTC. Estas consultas no acreditan una publicación posterior.

Se revisaron la ubicación y las dependencias de la migración de referencias cortas. Las tablas consultadas por esa migración estaban definidas en migraciones anteriores. La verificación completa de los cambios había terminado con 105 pruebas aprobadas; la comprobación posterior específica terminó con 31 pruebas aprobadas.

No se eliminaron migraciones, no se desactivó el aislamiento de la base de datos y no se conectó una vista previa a la base de producción para eludir el fallo. No se ejecutaron comandos manuales de compilación ni despliegue durante las revisiones del incidente.

## Acción pendiente de plataforma

Revisar los registros internos de la operación createSiteDatabaseBranch para este proyecto, despliegue y rama; determinar la causa del HTTP 500 y recuperar el aprovisionamiento. Después, reintentar el flujo de publicación y verificar la aplicación de migraciones, las pruebas del expediente y la revisión finalmente publicada en producción.

Este documento quedó preparado para adjuntarlo a una incidencia. No se envió a soporte ni a terceros.

## Intento posterior del reporte DSS

El despliegue `6ae97dfb8fa2307baf3f4a6e`, para la rama de vista previa `agent-6ae97dbae9c`, volvió a fallar en `createSiteDatabaseBranch` con HTTP 500 (`internal error`). El fallo se produjo durante el aprovisionamiento de Netlify Database, antes de la compilación de la aplicación. El registro enumeró las migraciones, pero no informó de un fallo al ejecutar SQL.

Se comprobó que el directorio de migraciones de Drizzle coincidía con `netlify/database/migrations` y que la sección DSS permanecía después de las cláusulas. No se identificó una corrección de código relacionada con este error de API. La recuperación del aprovisionamiento y un nuevo intento de despliegue quedaron pendientes de la plataforma. Este registro no acreditó que la versión DSS estuviera online.

## Reintento 6ae97e199bdc391975c16c79

El despliegue `6ae97e199bdc391975c16c79` volvió a recibir HTTP 500 (`internal error`) en `createSiteDatabaseBranch` al solicitar la rama `agent-6ae97dbae9c`. El registro completo confirmó que el proceso se detuvo durante el aprovisionamiento, antes de ejecutar `npm run build`. No incluyó una excepción de compilación ni un error SQL. La causa interna siguió sin estar disponible en el registro.

Se verificó que `executive-dss-recommendation` continuaba inmediatamente después de `executive-stipulated-clauses` y que ambas páginas devolvían `optimalDischargeRate` y `ritmoDescargaOptimizado` en `getDSSCurrentState()`. El nuevo registro no justificó modificar el componente, las migraciones o la configuración de la base de datos. Quedó pendiente revisar la operación fallida en la plataforma y recuperar la creación de la rama antes de reintentar el despliegue.

## Intento de corrección del selector DSS: 6ae98a86b0da812338d1e988

El despliegue de vista previa `6ae98a86b0da812338d1e988` falló al solicitar la rama de base de datos `agent-6ae9838372c`. La operación `createSiteDatabaseBranch` devolvió HTTP 500 con mensaje `internal error` durante el aprovisionamiento. El registro facilitado no mostró ejecución de `npm run build`, una excepción JSX ni un error SQL; enumerar las migraciones no acreditó su aplicación.

La revisión confirmó que el selector conservó los nombres de los cinco campos DSS solicitados y que tanto el selector del estado actual como el modal resolvieron el primer alias de descarga finito y positivo. La configuración Drizzle mantuvo `netlify/database/migrations` como directorio de salida, coincidente con el directorio cargado por la plataforma. No se identificó un cambio de código o de configuración que corrigiera el HTTP 500; no se alteraron las correcciones DSS ni las migraciones para eludirlo.

Quedó pendiente revisar los registros internos de creación de rama para este despliegue, recuperar el aprovisionamiento y reintentar la publicación. No se confirmó la publicación de estas correcciones en producción. Tras su publicación, la comprobación visual requiere una nueva Opción B, porque los snapshots anteriores conservan su HTML estático.

## Despliegue de la corrección de settings: 6ae995c0e0e7be818995e995

El despliegue de vista previa falló en `createSiteDatabaseBranch` al solicitar la rama `agent-6ae99591211`. Netlify devolvió HTTP 500 (`internal error`) durante el aprovisionamiento de Database. El registro recibido repetidamente correspondió al mismo intento; no acreditó nuevos despliegues ni un fallo SQL o de compilación.

La corrección de settings quedó aplicada: se eliminaron los redirects manuales de `/api/settings` y `/api/settings/*`, se conservaron ambas rutas en `config.path` y se añadieron las cuatro cabeceras anticaché solicitadas a las respuestas del handler. Las ocho pruebas de settings pasaron, incluidas las comprobaciones para respuestas 200, 401, 404 y 500.

Quedó pendiente revisar en Netlify la operación fallida para este despliegue, recuperar la creación de la rama y reintentar la publicación. La purga manual del 404 cacheado quedó pendiente tras publicar. No se identificó una modificación del repositorio que resolviera el error interno de la API.
