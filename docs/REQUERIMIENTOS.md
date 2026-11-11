# Trazabilidad: guía integradora → MySpa

Documento base: **«Requerimientos MySpa(2).docx»**, guía institucional de proyecto integrador, páginas **3 a 5 del contenido** (páginas 4–6 del archivo).

| Requerimiento de la guía | Implementación |
|---|---|
| Control de libro: título, año, edición, ISBN, género, autores, editorial | `libros`, `libro_autores`, `autores`, `generos`, `editoriales`; formularios admin y búsqueda pública |
| Varios ejemplares con identificador y estado | `ejemplares` con código único y 4 estados |
| Búsqueda por título o autor | `GET /api/catalog/books?q=...` (también ISBN, género, disponibilidad) |
| Catálogo de autores con nombres, género, nacimiento, domicilio completo, CP, ciudad, estado, país, email, teléfono, fotografía y fecha | `personas` + `autores`; formularios y subida de fotografía; el público ve datos de contacto sin domicilio exacto o fecha de nacimiento por privacidad |
| Afiliados con datos personales y documento probatorio de identidad | `personas`, `cuentas`, `afiliados`; registro propio y verificación presencial con tipo de identificación y autor de verificación |
| Usuario del afiliado = correo y contraseña elegida por él | registro propio, email como username único en cuentas, scrypt |
| Empleado administrador: alta, cambios, baja lógica de empleados | `GET/POST/PATCH/DELETE /api/people/staff`, `eliminada_en`, sesiones revocadas |
| Empleado bibliotecario: entregar, prestar y devolver | UI Circulación, endpoints protegidos con rol, registro de usuario operativo |
| Perfil de empleado con datos personales, usuario, contraseña, rol | `personas` + `cuentas`, formularios admin y fotografía |
| Un solo ejemplar por préstamo | `prestamos.ejemplar_id` y API de préstamo individual |
| Inicio préstamo hoy, vence en 7 días | SQL `NOW()` + `INTERVAL 7 DAY`, retorno registrado |
| Máximo 5 préstamos activos por afiliado | Conteo y bloqueo transaccional del afiliado antes de cada préstamo |
| Reservación web por 24 horas | `reservaciones.vence_en`, estado reservado y actualización automática de expiraciones |
| Préstamo puede venir o no de reservación | `prestamos.reservacion_id` nullable, botones Entregar y Préstamo directo |
| Afiliados: BAJA, ACTIVO, PENALIZADO | Enum `afiliados.estatus` y `verificacion` como estado independiente de aprobación de identidad |
| Penalización al sobrepasar fecha de devolución | Reconciliación periódica, chequeo previo y sanción al devolver tarde |
| Ejemplares: DISPONIBLE, RESERVADO, PRESTADO, BAJA | Enum en `ejemplares.estatus` |
| Solo afiliados Activo pueden reservar o recibir préstamo | `eligible()` además exige verificación documental |
| Correo tras reservar (NO obligatorio) | `nodemailer` SMTP configurable; no se requiere para el funcionamiento normal |
| Imagen institucional por el equipo | Marca MySpa propia, colores esmeralda/papel, iconografía y diseño responsive |
| Requisitos añadidos por el usuario: React/Node/MySQL, hooks, PWA, seguridad, normalización | frontend React JS con hooks, backend Express, InnoDB, Zod, PWA con manifest+SW, tests y setup automático |

## Decisiones donde la guía no establece una regla exacta

- **Auto-registro:** no se especifica expresamente. Se admite, pero **bloquea la reservación** hasta verificación presencial, sin añadir un cuarto estatus de afiliado; `ACTIVO + PENDIENTE` es un perfil pendiente de validación, no disponible para préstamos.
- **Sanción:** la guía no fija duración ni política de condonación; permanece hasta acción del administrador y solo se rehabilita si no quedan préstamos vencidos.
- **Selección de ejemplar:** reserva el primer ejemplar disponible con bloqueo de filas; no permite dos reservas activas del mismo título para el mismo afiliado.
- **Datos de identidad:** se verifica físicamente y se almacena el tipo de documento, pero no una copia digital; la guía exige presentarlo, no almacenarlo.
- **Contacto con autores:** público ve nombre, email, teléfono, ciudad y estado; domicilio exacto y nacimiento quedan restringidos a administración.
- **Fotos:** PNG/JPG/WebP hasta 2 MB, sirven desde el propio backend. Los campos sin imagen muestran iniciales o portadas diseñadas en CSS.
- **Offline:** PWA permite cargar la interfaz, pero reservas, préstamos y datos privados requieren conexión al servidor (sin cachear endpoints autenticados).
