-- =====================================================================
-- MKT PROCESS · 04 · Plantilla "Masterclass"
-- Ejecutar después de policies.sql
-- Idempotente: si la plantilla ya existe, no hace nada.
-- =====================================================================

do $$
declare
  v_tpl uuid;
begin
  if exists (select 1 from public.process_templates where name = 'Masterclass') then
    raise notice 'La plantilla "Masterclass" ya existe. No se hizo nada.';
    return;
  end if;

  insert into public.process_templates (name, description, icon, color)
  values (
    'Masterclass',
    'Ciclo completo de una masterclass en vivo: definición de la oferta, producción de contenido, captación, secuencias de email, pauta, ejecución y cierre de carrito.',
    '🎓',
    '#6D28D9'
  )
  returning id into v_tpl;

  insert into public.template_steps
    (template_id, sort_order, title, description, type, priority, default_duration_days)
  values
  -- FASE 1 · Definición
  (v_tpl,  1, 'Definir tema, promesa y público objetivo',
   'Una sola promesa, medible y concreta. Escribe en una frase qué sabrá hacer el asistente al terminar que hoy no puede hacer.',
   'Estrategia', 'urgente', 2),

  (v_tpl,  2, 'Definir oferta, precio y condiciones del cierre',
   'Producto que se vende al final, precio, bonos, garantía y hasta cuándo dura el carrito abierto.',
   'Estrategia', 'urgente', 2),

  (v_tpl,  3, 'Fijar fecha, hora y duración del evento',
   'Considera zona horaria de la audiencia principal. Reserva 20 minutos extra para preguntas.',
   'Estrategia', 'alta', 1),

  (v_tpl,  4, 'Fijar metas de registros, asistencia e ingresos',
   'Número de registros, tasa de asistencia esperada, tasa de conversión y presupuesto máximo de pauta.',
   'Estrategia', 'alta', 1),

  -- FASE 2 · Contenido
  (v_tpl,  5, 'Escribir el guion de la masterclass',
   'Apertura con la promesa, tres bloques de contenido, transición a la oferta y cierre. Marca los tiempos por bloque.',
   'Contenido', 'urgente', 4),

  (v_tpl,  6, 'Diseñar las diapositivas',
   'Una idea por lámina. Deja las láminas de la oferta al final, separadas del contenido.',
   'Diseño', 'alta', 3),

  -- FASE 3 · Captación
  (v_tpl,  7, 'Escribir el copy de la landing de registro',
   'Titular con la promesa, tres viñetas de beneficio, prueba social, fecha y hora visibles, un solo botón.',
   'Contenido', 'alta', 2),

  (v_tpl,  8, 'Montar la landing de registro',
   'Revisa que cargue en móvil en menos de 3 segundos y que el formulario funcione en incógnito.',
   'Web', 'alta', 2),

  (v_tpl,  9, 'Montar la página de gracias con instrucciones',
   'Confirma el registro, indica fecha y hora, ofrece agregar al calendario y pide que revisen spam.',
   'Web', 'media', 1),

  (v_tpl, 10, 'Instalar píxel y CAPI, verificar el evento de registro',
   'Comprueba en el Test Events de Meta que el evento Lead llegue por navegador y por servidor, sin duplicar.',
   'Técnico', 'urgente', 1),

  -- FASE 4 · Email
  (v_tpl, 11, 'Conectar el formulario con la lista de correo',
   'Etiqueta a los registrados con el nombre de esta edición para poder segmentarlos después.',
   'Técnico', 'alta', 1),

  (v_tpl, 12, 'Escribir la secuencia de recordatorios',
   'Confirmación inmediata, recordatorio a 3 días, a 1 día y 1 hora antes con el enlace de acceso.',
   'Email', 'alta', 2),

  (v_tpl, 13, 'Escribir la secuencia post-evento',
   'Replay, resumen de la oferta, manejo de objeciones, testimonios y aviso de cierre de carrito.',
   'Email', 'alta', 3),

  -- FASE 5 · Tráfico
  (v_tpl, 14, 'Producir los creativos para anuncios',
   'Mínimo 3 ángulos distintos en formato vertical y cuadrado. Incluye al menos un video de cámara frontal.',
   'Diseño', 'alta', 3),

  (v_tpl, 15, 'Escribir el copy de los anuncios',
   'Un copy por ángulo, con gancho en la primera línea. Evita prometer resultados que la masterclass no entrega.',
   'Contenido', 'alta', 1),

  (v_tpl, 16, 'Configurar la campaña de captación en Meta Ads',
   'Objetivo de conversión sobre el evento de registro. Un conjunto amplio y uno de públicos similares.',
   'Ads', 'urgente', 1),

  (v_tpl, 17, 'Programar las publicaciones orgánicas de anuncio',
   'Publicaciones en feed, historias y comunidad propia. Fija la publicación de anuncio en el perfil.',
   'Contenido', 'media', 1),

  -- FASE 6 · Preparación
  (v_tpl, 18, 'Monitorear costo por registro y ajustar la pauta',
   'Revisa a diario. Si el costo por registro supera la meta dos días seguidos, cambia el creativo antes que el presupuesto.',
   'Ads', 'alta', 5),

  (v_tpl, 19, 'Configurar la sala y probar audio, video y pantalla',
   'Prueba desde la misma computadora y conexión que usarás en vivo. Ten un plan B de transmisión.',
   'Técnico', 'alta', 1),

  (v_tpl, 20, 'Ensayo general con cronómetro',
   'Corrida completa incluyendo la transición a la oferta, que es la parte que más se descuadra en tiempo.',
   'Ejecución', 'alta', 1),

  -- FASE 7 · Ejecución y cierre
  (v_tpl, 21, 'Transmitir la masterclass en vivo',
   'Alguien del equipo modera el chat y publica el enlace de compra en el momento acordado.',
   'Ejecución', 'urgente', 1),

  (v_tpl, 22, 'Enviar el replay y abrir el carrito',
   'Mismo día del evento. Incluye el enlace de compra en el primer tercio del correo.',
   'Email', 'urgente', 1),

  (v_tpl, 23, 'Dar seguimiento a los registrados que no compraron',
   'Segmenta por asistió / no asistió. Mensajes distintos para cada grupo.',
   'Email', 'alta', 3),

  (v_tpl, 24, 'Cerrar el carrito y publicar el reporte de resultados',
   'Registros, asistencia, ventas, costo por registro, costo por venta y tres aprendizajes para la próxima edición.',
   'Análisis', 'alta', 2);

  raise notice 'Plantilla "Masterclass" creada con 24 pasos.';
end $$;
