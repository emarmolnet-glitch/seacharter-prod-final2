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
