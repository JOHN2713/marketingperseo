# 11 · Horario laboral y archivo de tareas

Cuarta etapa. Script SQL: [`supabase/work-hours.sql`](../supabase/work-hours.sql). Se ejecuta después de `events-audit.sql` y se puede volver a correr sin perder lo configurado.

---

## Decisiones tomadas

| Tema | Decisión |
|---|---|
| Horario laboral | Lunes a viernes, 09:00 a 18:00, hora de Ecuador. Lo cambia el jefe desde **Tareas → Horario y archivo** |
| Tiempo de una tarea | Solo las horas entre inicio y fin que caen dentro del horario |
| Archivo | Una tarea completada pasa a **Archivadas** a los 3 días corridos de completada |
| Métricas | Las tareas archivadas cuentan igual que las demás |
| Cómo se guarda | No se guarda: el tiempo y el archivo se calculan al leer |

---

## Tiempo en horas laborales

El cálculo vive en [`assets/js/worktime.js`](../assets/js/worktime.js): recorre los días entre el inicio y el fin de la tarea y suma solo el tramo de cada día laboral que cae dentro del horario.

| Inicio | Fin | Reloj | Laboral |
|---|---|---|---|
| lunes 10:00 | lunes 12:30 | 2 h 30 min | **2 h 30 min** |
| martes 16:00 | miércoles 11:30 | 19 h 30 min | **4 h 30 min** |
| viernes 17:00 | lunes 10:00 | 65 h | **2 h** |
| sábado 10:00 | sábado 14:00 | 4 h | **0 min** |
| lunes 09:00 | viernes 18:00 | 105 h | **45 h** |

Reglas:

- **Zona fija.** El horario se aplica con la hora de Ecuador (UTC−5), no con la del navegador: el mismo par de fechas da el mismo resultado se abra donde se abra.
- **Sin días.** El tiempo se muestra en horas y minutos ("14 h 30 min"). No se convierte a días porque "1 d" sería ambiguo: ¿24 horas o una jornada de 9?
- **Trabajo fuera de horario.** Una tarea hecha entera un sábado o de noche mide 0 minutos y entra así al promedio. Es la consecuencia directa de la regla; ver *Pendiente de definir*.
- **Se aplica en todas partes**: lista de tareas, ficha de la tarea y los tres promedios de Métricas (por integrante, por tipo y por área).

### Por qué se calcula y no se guarda

Guardar las horas en una columna las congelaría con el horario del día en que se completó la tarea. Calculadas al leer, cambiar el horario recalcula todo —también lo pasado— y no pueden quedar desincronizadas de las fechas si alguien corrige el inicio o el fin a mano. Para el volumen de un equipo de marketing el costo es despreciable.

---

## Archivo de tareas

Una tarea está archivada cuando su estado es **Completado** y su fecha de fin es anterior a *ahora − N días* (N = 3 por defecto). No hay columna `archivada` ni proceso programado.

- **Tareas → Archivadas**: lista de la más reciente a la más antigua, con la fecha en que se completó. Funcionan la búsqueda y los filtros de responsable, prioridad, tipo y área.
- **Reactivar**: abrir la tarea y cambiarle el estado. El trigger `set_task_times` borra la fecha de fin y la tarea vuelve sola a las activas.
- **Lista y Kanban** muestran lo no completado y lo completado en los últimos N días. La columna *Completado* del Kanban lo indica.
- **Inicio** usa las mismas tareas activas.
- **Métricas** consulta todas, archivadas incluidas: archivar no cambia ningún total ni promedio.
- Los enlaces directos a una tarea (`#/tareas?tarea=<id>`) abren su ficha aunque esté archivada.

---

## Configuración

Tabla `app_settings`, con una sola fila:

```
work_days           smallint[]   día ISO, 1 = lunes … 7 = domingo   {1,2,3,4,5}
work_start          time                                            09:00
work_end            time                                            18:00
archive_after_days  integer      de 1 a 365                         3
```

| Acción | Quién |
|---|---|
| Leer | Todo el equipo |
| Cambiar | Jefe de área o admin |
| Crear otra fila o borrarla | Nadie |

Cada cambio queda en la **Auditoría** con el valor anterior y el nuevo: mover el horario mueve todas las métricas de tiempo.

Si la tabla todavía no existe, la app usa los valores por defecto y sigue funcionando; solo falla al intentar guardar un horario nuevo.

---

## Pendiente de definir

Cosas que la regla "lunes a viernes de 9 a 18" no resuelve y hoy quedan así:

1. **Almuerzo.** La jornada cuenta 9 horas seguidas; no se descuenta la hora de almuerzo.
2. **Feriados.** Un feriado entre semana cuenta como día laboral.
3. **Trabajo fuera de horario.** Mide 0 minutos y baja el promedio. La alternativa es dejarlo fuera del promedio.
4. **Días de archivo.** Son corridos: una tarea completada un viernes se archiva el lunes.

---

## Puesta en marcha

1. En el SQL Editor de Supabase, ejecutar [`supabase/work-hours.sql`](../supabase/work-hours.sql) (después de `events-audit.sql`).
2. Revisar el horario en **Tareas → Horario y archivo**.
