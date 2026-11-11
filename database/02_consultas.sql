-- Diagnóstico opcional para MySQL Workbench: solo consultas, no modifica datos.
USE myspa;
SELECT 'Tablas y catálogo' AS seccion;
SELECT l.id,l.titulo,l.isbn,g.nombre AS genero,ed.nombre AS editorial FROM libros l JOIN generos g ON g.id=l.genero_id JOIN editoriales ed ON ed.id=l.editorial_id ORDER BY l.id;
SELECT * FROM vista_inventario ORDER BY libro_id;
SELECT 'Afiliados y verificación' AS seccion;
SELECT c.id,p.primer_nombre,p.apellido_paterno,c.email,a.estatus,a.verificacion,a.documento_tipo,a.verificado_en
 FROM afiliados a JOIN cuentas c ON c.id=a.cuenta_id JOIN personas p ON p.id=c.persona_id ORDER BY c.id;
SELECT 'Reservas vigentes' AS seccion;
SELECT r.id,r.estatus,r.vence_en,e.codigo,l.titulo FROM reservaciones r JOIN ejemplares e ON e.id=r.ejemplar_id JOIN libros l ON l.id=e.libro_id ORDER BY r.creada_en DESC;
SELECT 'Préstamos vencidos' AS seccion;
SELECT pr.id,pr.afiliado_id,e.codigo,pr.inicio_en,pr.vence_en,TIMESTAMPDIFF(DAY,pr.vence_en,NOW()) AS dias_retraso FROM prestamos pr
 JOIN ejemplares e ON e.id=pr.ejemplar_id WHERE pr.devuelto_en IS NULL AND pr.vence_en<NOW();
SELECT 'Acciones auditadas' AS seccion;
SELECT a.id,a.accion,a.entidad,a.entidad_id,a.creado_en FROM auditoria a ORDER BY a.creado_en DESC LIMIT 30;
