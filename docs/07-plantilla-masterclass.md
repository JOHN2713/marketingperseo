# 07 · Plantilla Masterclass

El checklist maestro del primer proceso. Está cargado por [`seed-masterclass.sql`](../supabase/seed-masterclass.sql) y el admin lo edita desde la app.

- **24 pasos** en 7 fases
- **45 días** de duración si se ejecutan en secuencia estricta
- Ícono `🎓`, color `#6D28D9`

---

## Los 24 pasos

### Fase 1 · Definición (6 días)

| # | Paso | Tipo | Prioridad | Días |
|---|---|---|---|---|
| 01 | Definir tema, promesa y público objetivo | Estrategia | urgente | 2 |
| 02 | Definir oferta, precio y condiciones del cierre | Estrategia | urgente | 2 |
| 03 | Fijar fecha, hora y duración del evento | Estrategia | alta | 1 |
| 04 | Fijar metas de registros, asistencia e ingresos | Estrategia | alta | 1 |

> Esta fase decide el resultado de todo lo demás. Si la promesa es difusa, ninguna cantidad de pauta lo arregla.

### Fase 2 · Contenido (7 días)

| # | Paso | Tipo | Prioridad | Días |
|---|---|---|---|---|
| 05 | Escribir el guion de la masterclass | Contenido | urgente | 4 |
| 06 | Diseñar las diapositivas | Diseño | alta | 3 |

### Fase 3 · Captación (6 días)

| # | Paso | Tipo | Prioridad | Días |
|---|---|---|---|---|
| 07 | Escribir el copy de la landing de registro | Contenido | alta | 2 |
| 08 | Montar la landing de registro | Web | alta | 2 |
| 09 | Montar la página de gracias con instrucciones | Web | media | 1 |
| 10 | Instalar píxel y CAPI, verificar el evento de registro | Técnico | urgente | 1 |

### Fase 4 · Email (6 días)

| # | Paso | Tipo | Prioridad | Días |
|---|---|---|---|---|
| 11 | Conectar el formulario con la lista de correo | Técnico | alta | 1 |
| 12 | Escribir la secuencia de recordatorios | Email | alta | 2 |
| 13 | Escribir la secuencia post-evento | Email | alta | 3 |

### Fase 5 · Tráfico (6 días)

| # | Paso | Tipo | Prioridad | Días |
|---|---|---|---|---|
| 14 | Producir los creativos para anuncios | Diseño | alta | 3 |
| 15 | Escribir el copy de los anuncios | Contenido | alta | 1 |
| 16 | Configurar la campaña de captación en Meta Ads | Ads | urgente | 1 |
| 17 | Programar las publicaciones orgánicas de anuncio | Contenido | media | 1 |

### Fase 6 · Preparación (7 días)

| # | Paso | Tipo | Prioridad | Días |
|---|---|---|---|---|
| 18 | Monitorear costo por registro y ajustar la pauta | Ads | alta | 5 |
| 19 | Configurar la sala y probar audio, video y pantalla | Técnico | alta | 1 |
| 20 | Ensayo general con cronómetro | Ejecución | alta | 1 |

### Fase 7 · Ejecución y cierre (7 días)

| # | Paso | Tipo | Prioridad | Días |
|---|---|---|---|---|
| 21 | Transmitir la masterclass en vivo | Ejecución | urgente | 1 |
| 22 | Enviar el replay y abrir el carrito | Email | urgente | 1 |
| 23 | Dar seguimiento a los registrados que no compraron | Email | alta | 3 |
| 24 | Cerrar el carrito y publicar el reporte de resultados | Análisis | alta | 2 |

---

## Sobre las duraciones

La cascada de fechas es **secuencial**: el paso 8 arranca cuando termina el 7. En la práctica, los pasos 5 y 6 se hacen en paralelo con el 7 y el 8, así que el cronograma real es más corto que 45 días.

El clonado genera el escenario conservador a propósito. Es más fácil comprimir un cronograma que estirarlo cuando ya prometiste una fecha.

Si tu equipo tiene un ritmo distinto, ajusta `default_duration_days` en la plantilla desde el panel de admin. Los procesos ya creados no cambian.

---

## Tipos usados

`Estrategia` · `Contenido` · `Diseño` · `Web` · `Técnico` · `Email` · `Ads` · `Ejecución` · `Análisis`

El campo `type` es texto libre. Estos nueve son los que trae la plantilla y aparecen como sugerencias, pero puedes escribir otros.

---

## Cómo agregar un proceso nuevo al sistema

El objetivo del diseño es que esto no requiera programar. Desde **Plantillas → Nueva plantilla**:

1. Nombre, descripción, ícono, color y link de recurso general
2. Agregar pasos uno por uno con título, descripción, tipo, prioridad, duración y link
3. Reordenar arrastrando hasta que la secuencia tenga sentido
4. Guardar

A partir de ahí aparece en el selector de "Crear proceso desde plantilla".

Atajo útil: **duplicar** Masterclass y editarla. Un proceso de "Webinar" o "Lanzamiento de producto" comparte el 70% de los pasos.

### Ideas de próximas plantillas

| Plantilla | Pasos aprox. | Reutiliza de Masterclass |
|---|---|---|
| Lanzamiento de producto | 30 | Fases 3, 4, 5 casi completas |
| Webinar de ventas | 18 | Todo salvo la fase de contenido |
| Campaña de captación de leads | 14 | Fases 3 y 5 |
| Contenido mensual de redes | 12 | Nada; es un ciclo distinto |
| Reactivación de base de datos | 10 | Fase 4 |
