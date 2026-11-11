# MySpa — Biblioteca Digital (PWA)

> **Nombre de la aplicación: MySpa.** El dominio del proyecto es **bibliotecario**, exactamente como describe la guía de proyecto integrador suministrada por el usuario. No es un gestor de spas.

Aplicación web completa con **React 19 (JavaScript y hooks), Vite, Node.js, Express, MySQL 8, PWA instalable, control de acceso por rol, validación, sesiones seguras y datos de demostración**. Interfaz en español, responsive y con imágenes locales opcionales.

## Requisitos del equipo

- **Node.js 22 LTS** o >=20.19.0 (comprueba `node -v`).
- **MySQL Server 8.0+ instalado, encendido y accesible por TCP en el puerto 3306**. *MySQL Workbench es solamente la interfaz; no reemplaza el servidor MySQL.*
- MySQL Workbench 8.x (para abrir y revisar el SQL, modificar datos o consultar el modelo).
- Conexión a Internet **solo para instalar las dependencias** `npm install` y descargar las fuentes de Google opcionales; el backend no depende de servicios externos.

## Instalación fácil en Windows

Descomprime el ZIP **dentro de** `D:\heezl\Escritorio\rafa\MySpa` (el ZIP contiene directamente `package.json`, las carpetas `client`, `server`, `database`, etc.).

En **CMD**, ejecuta:

```bat
cd /d D:\heezl\Escritorio\rafa
mkdir MySpa
cd MySpa
rem Aquí extrae el contenido de MySpa.zip; si ya lo extrajiste, continúa.
npm install
npm run setup
npm run dev
```

**Atajo:** dentro de la carpeta del proyecto haz doble clic en `INSTALAR_MYSPA.cmd` (instala dependencias, crea tablas y carga datos) y después en `INICIAR_MYSPA.cmd`.

**Accesos locales:**

- Web React: **http://127.0.0.1:5173**
- API: **http://127.0.0.1:4000/api/health**
- Credenciales demo: abre **`CREDENCIALES_LOCALES.txt`**, generado automáticamente al ejecutar `npm run setup`. Hay cuentas de administrador, bibliotecario, afiliado verificado y afiliado pendiente.

### Conexión MySQL

Se genera `.env` desde `.env.example` automáticamente. Por los datos indicados para el desarrollo local, está preconfigurado con:

```dotenv
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=root
DB_NAME=myspa
```

Si MySQL está en otro puerto o usa otra contraseña, edita **solo** `.env`, guarda y vuelve a ejecutar `npm run setup`. El script genera automáticamente un secreto de sesión aleatorio, sin pedirte que escribas uno. No incluyas `.env` en repositorios.

### ¿Prefieres crear la BD desde MySQL Workbench?

1. Inicia MySQL Server y abre Workbench con tu conexión local `root` / `root`.
2. Abre `database/01_schema.sql` mediante **File > Open SQL Script** y ejecuta todo (icono de rayo).
3. Refresca **SCHEMAS**: aparecerá `myspa` con tablas, relaciones, índices y vista `vista_inventario`.
4. Desde CMD, en `MySpa`, ejecuta `npm install` y `npm run setup`. El setup comprueba las tablas existentes sin borrarlas y agrega datos de ejemplo si están vacías.
5. `npm run dev` para iniciar React y Express.

**Importante:** `npm run setup` también puede crear automáticamente la base de datos *sin Workbench* usando `database/01_schema.sql`, pero el archivo SQL está disponible para tu revisión y entrega académica.

## PWA instalable

La versión de desarrollo (`npm run dev`) permite trabajar cómodamente con React, pero para **probar la instalación real de la PWA** utiliza otra terminal:

```bat
cd /d D:\heezl\Escritorio\rafa\MySpa
npm run pwa
```

Se compila React, se genera el manifest y service worker, y se sirve todo desde **http://localhost:4000**. Abre esta dirección en Chrome o Edge. En navegadores compatibles aparecerá un botón **Instalar app** o la opción en el menú del navegador. En el servidor final usa **HTTPS** y configura cookies seguras; `scripts/serve.mjs` habilita cookies HTTP **solo para pruebas locales**.

La PWA almacena en caché **el shell (HTML/CSS/JS/íconos)** para poder abrir la interfaz sin conexión; deliberadamente **no guarda respuestas autenticadas de `/api`**, porque contienen datos personales y estados de préstamo. Las acciones con base de datos requieren conexión al servidor. Si MySQL o Express se apagan, la app puede abrir, pero las operaciones en línea no funcionarán.

## Scripts

| Comando | Qué hace |
|---|---|
| `npm install` | Instala dependencias de los workspaces React y Express. |
| `npm run setup` | Genera `.env`, ejecuta el SQL y añade demo sin destruir registros existentes. |
| `npm run dev` | Inicia Vite 5173 + Express 4000 con recarga automática. |
| `npm run build` | Compila React para producción. |
| `npm run pwa` | Compila y ejecuta PWA instalable en localhost:4000. |
| `npm run test` | Pruebas de negocio y de esquema sin modificar la BD. |
| `npm run smoke` | **Prueba integral real** contra API encendida (registra/cancela reserva y registra/devuelve préstamo en la BD). |
| `npm run seed` | Añade demo **si la BD está vacía**. Normalmente usa `npm run setup`. |

## Usuarios y permisos

| Funcionalidad | Visitante | Afiliado | Bibliotecario | Admin |
|---|:---:|:---:|:---:|:---:|
| Buscar títulos por título/autor/ISBN y consultar autores | ✓ | ✓ | ✓ | ✓ |
| Crear cuenta | ✓ | — | — | — |
| Reservar ejemplar por 24 horas y cancelar reserva propia | — | ✓¹ | — | — |
| Consultar préstamos y reservaciones propios | — | ✓ | — | — |
| Entregar reservación como préstamo, préstamo directo y devoluciones | — | — | ✓ | ✓ |
| Consultar afiliados | — | — | ✓ | ✓ |
| Aprobar identificación, penalizar o rehabilitar afiliados | — | — | — | ✓ |
| Registrar/editar/retirar libros y ejemplares, autores, géneros y editoriales | — | — | — | ✓ |
| Crear/editar/eliminar lógicamente empleados | — | — | — | ✓ |
| Dashboard y perfil | — | ✓ | ✓ | ✓ |

¹ El afiliado debe estar **ACTIVO** y **VERIFICADO**. En el registro público la verificación inicia en **PENDIENTE**, hasta presentar identificación presencialmente. Esto evita otorgar préstamos sin comprobar identidad y mantiene los tres estatus exigidos: ACTIVO, PENALIZADO, BAJA.

## Reglas de negocio

- **Títulos y ejemplares son cosas distintas**. Un título puede tener N ejemplares con código único (por ejemplo, `MSP-001-001`); estados: `DISPONIBLE`, `RESERVADO`, `PRESTADO`, `BAJA`.
- **Reservación (24h):** asigna **un ejemplar disponible** al afiliado activo/verificado. Si vence, se marca `EXPIRADA` y se libera el ejemplar. La API valida vigencia en cada intento y un proceso interno reconcilia estados cada 60 segundos, incluso sin navegador abierto, siempre que el servidor esté encendido.
- **Préstamo (7d):** lo registra un bibliotecario o admin, a partir de reservación vigente **o de modo directo** sin reserva previa. Un préstamo registra **exactamente un ejemplar**. La cuota es **máximo 5 préstamos no devueltos** por afiliado.
- **Devolución:** se registra con fecha y empleado; libera el ejemplar. Si llega tarde, el afiliado queda `PENALIZADO`.
- **Penalización automática:** la API y el proceso de 60 segundos penalizan cuentas con préstamos vencidos. La penalización **no se borra automáticamente** al devolver: el administrador puede rehabilitar al afiliado cuando no tenga préstamos vencidos. El documento no establece una duración de sanción; esta decisión conserva la sanción hasta revisión administrativa.
- **Baja de empleados:** se conserva la fila de cuenta para mantener integridad referencial, se marca `eliminada_en` y se revocan sesiones.
- **Identidad:** se registra el tipo de documento (INE, pasaporte, otro), fecha y empleado que verificó; **no se almacenan imágenes de documentos sensibles**. El empleado verifica el original presencialmente.
- **Correo de confirmación de reservas (opcional):** si configuras `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` y `SMTP_FROM` en `.env`, la API intenta enviar el mensaje; si no, las reservaciones siguen funcionando sin SMTP.
- Fechas en BD se operan en **UTC** y se muestran al usuario con la zona del navegador.

## Arquitectura y normalización

```text
MySpa/
├── client/
│   ├── src/components/       # layout, campos de persona, componentes visuales
│   ├── src/hooks/            # useAuth, useDebounce, useRemote, useInstallApp
│   ├── src/pages/            # público, registro, paneles, gestión, circulación
│   ├── public/               # íconos SVG y PNG de la PWA
│   └── vite.config.js        # manifest/service worker, proxy a API
├── server/
│   ├── src/
│   │   ├── index.js          # Express, CSP y manejo de errores
│   │   ├── auth.js           # sesiones, roles y CSRF
│   │   ├── core.js           # conexión segura, Zod, transacciones
│   │   ├── catalog.js        # libros, ejemplares, autores, referencias
│   │   ├── people.js         # empleados y verificación de afiliados
│   │   ├── circulation.js    # reservas, préstamos, devolución, estadísticas
│   │   ├── media.js          # imágenes locales de 2 MB verificadas
│   │   └── domain.js         # reglas puras de negocio
│   └── test/                 # pruebas automáticas
├── database/
│   ├── 01_schema.sql         # compatible con Workbench MySQL 8+
│   └── 02_consultas.sql     # consultas de comprobación
├── scripts/
│   ├── setup.mjs             # configuración de un comando
│   ├── seed.mjs              # 15 títulos, 8 autores, 4 cuentas demo
│   ├── smoke.mjs             # prueba integral contra API real
│   └── serve.mjs             # servidor PWA local
├── docs/REQUERIMIENTOS.md
├── .env.example
├── INSTALAR_MYSPA.cmd
├── INICIAR_MYSPA.cmd
└── package.json
```

**3NF**: perfiles personales en `personas`, credenciales y roles en `cuentas`, verificación y sanciones en `afiliados`, ficha bibliográfica en `libros`, entidades de autor/editorial/género separadas, autoría N:M en `libro_autores` y ejemplares físicos en `ejemplares`. Eventos independientes en `reservaciones` y `prestamos`, con FK, índices y auditoría. El estatus operativo del ejemplar se mantiene transaccionalmente junto con préstamo/reserva para facilitar bloqueo y evitar dobles asignaciones (estado materializado intencionalmente).

## Seguridad implementada

Contraseñas con **scrypt** (salt aleatorio y verificación en tiempo constante); **sesiones aleatorias almacenadas como SHA-256** en MySQL, cookie HttpOnly/SameSite y Secure bajo HTTPS real; token CSRF por sesión; comprobaciones de rol **en el backend**, además de las vistas React; `express-rate-limit` en registro e inicio de sesión; `helmet` y CSP; validación con Zod; consultas MySQL parametrizadas, transacciones InnoDB y bloqueo de filas para asignación de ejemplares; tamaño/tipo/firma de las imágenes; baja lógica, revocación de sesiones y auditoría.

Para publicar en Internet hay pasos adicionales de infraestructura (HTTPS con proxy inverso, credenciales propias de MySQL de mínimo privilegio, backups, variables secretas, monitoreo, evaluación de seguridad, protección de datos personales, SMTP autorizado y pruebas de carga). Esta entrega prioriza el funcionamiento **local para el proyecto escolar** y no sustituye una auditoría de producción.

## Diagnóstico rápido

- **`ER_ACCESS_DENIED_ERROR`**: revisa `DB_USER` y `DB_PASSWORD` en `.env`; contraseña `root` solo si así está tu MySQL local.
- **`ECONNREFUSED 127.0.0.1:3306`**: MySQL Server apagado o puerto incorrecto. Inícialo en Servicios de Windows.
- **`Unknown database myspa` / tablas inexistentes**: `npm run setup` o ejecuta `database/01_schema.sql` en Workbench.
- **API se cierra al arrancar**: normalmente falta MySQL; revisa mensajes de la terminal Express. No hace falta escribir manualmente `SESSION_SECRET`.
- **No puedes reservar**: entra con cuenta afiliada VERIFICADA y ACTIVA; revisa existencias y préstamos vencidos.
- **No aparece el botón PWA**: usa `npm run pwa`, abre `http://localhost:4000` en Chrome/Edge y comprueba que no esté instalada ya.
- **Archivo `CREDENCIALES_LOCALES.txt` no existe**: se crea en el **primer** `npm run setup` con una base de datos sin usuarios. Si usaste tu propia BD con usuarios, el setup los conserva.
- **La BD parece vacía en Workbench**: clic derecho sobre SCHEMAS > Refresh All, abre `myspa`, y ejecuta `SELECT * FROM libros;`.

## Pruebas incluidas y límites de validación

Las pruebas puras de ISBN, fechas, límite de préstamos, estado verificado y estructura SQL corren con `npm run test`. La prueba `npm run smoke` requiere **npm instalado, MySQL encendido, setup realizado, API ejecutándose y credenciales demo creadas**. La entrega fue revisada estáticamente y se ejecutaron las pruebas puras; en el entorno de preparación no está disponible un servidor MySQL operativo ni la instalación npm de los paquetes, por lo que la integración local con tus servicios debe verificarse ejecutando el smoke test en tu PC.

## Ampliación de catálogo (cómics, novelas y filosofía)

Este paquete agrega un importador seguro y repetible de 18 obras editoriales reales a una instalación MySpa ya existente.

```bat
cd /d D:\heezl\Escritorio\rafa\MySpa
npm run catalogo:revisar
npm run catalogo
npm run dev
```

No ejecuta borrados, no reemplaza ejemplares en préstamo y omite los ISBN existentes. Las ediciones elegidas tienen títulos originales en inglés (para asociar ISBN y portada correctos), sinopsis en español y géneros para filtrar. Las portadas cargan desde Open Library por HTTPS; cuando la fuente no tiene portada o no hay conexión, MySpa usa su diseño de cubierta propio. También se pueden subir JPG/PNG/WebP de hasta 2 MB desde la edición del libro. Las fichas de autores reales nuevos no publican correos ficticios; se guardan identificadores técnicos no contactables para satisfacer el campo obligatorio de la base de datos.

Consulta [ACTUALIZAR_CATALOGO.txt](./ACTUALIZAR_CATALOGO.txt) para instalar la actualización sobre tu carpeta actual **sin borrar `.env`, contraseñas ni datos de MySQL**.

Las fuentes de identificación bibliográfica de cada ISBN se documentan en [docs/FUENTES_EDICIONES.md](./docs/FUENTES_EDICIONES.md).
