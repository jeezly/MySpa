-- MySpa | Ejecutable en MySQL Workbench 8.0+
-- Sistema bibliotecario: 3FN, claves foráneas, restricciones, índices y auditoría.
-- Idempotente: no borra datos existentes.
CREATE DATABASE IF NOT EXISTS myspa CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE myspa;

CREATE TABLE IF NOT EXISTS personas (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 primer_nombre VARCHAR(80) NOT NULL,
 segundo_nombre VARCHAR(80) NULL,
 apellido_paterno VARCHAR(80) NOT NULL,
 apellido_materno VARCHAR(80) NULL,
 genero ENUM('MUJER','HOMBRE','NO_BINARIO','OTRO','PREFIERO_NO_DECIR') NOT NULL DEFAULT 'PREFIERO_NO_DECIR',
 fecha_nacimiento DATE NULL,
 domicilio VARCHAR(240) NULL,
 codigo_postal VARCHAR(12) NULL,
 ciudad VARCHAR(100) NULL,
 estado VARCHAR(100) NULL,
 pais VARCHAR(100) NOT NULL DEFAULT 'México',
 email VARCHAR(254) NOT NULL,
 telefono VARCHAR(25) NULL,
 fotografia VARCHAR(255) NULL,
 fecha_registro DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 INDEX idx_personas_nombre (apellido_paterno, primer_nombre),
 INDEX idx_personas_email (email)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS cuentas (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 persona_id BIGINT UNSIGNED NOT NULL UNIQUE,
 email VARCHAR(254) NOT NULL UNIQUE,
 password_hash VARCHAR(255) NOT NULL,
 rol ENUM('ADMIN','BIBLIOTECARIO','AFILIADO') NOT NULL,
 habilitada BOOLEAN NOT NULL DEFAULT TRUE,
 eliminada_en DATETIME NULL,
 ultimo_acceso DATETIME NULL,
 creada_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT fk_cuentas_personas FOREIGN KEY (persona_id) REFERENCES personas(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS afiliados (
 cuenta_id BIGINT UNSIGNED PRIMARY KEY,
 estatus ENUM('ACTIVO','PENALIZADO','BAJA') NOT NULL DEFAULT 'ACTIVO',
 verificacion ENUM('PENDIENTE','VERIFICADO','RECHAZADO') NOT NULL DEFAULT 'PENDIENTE',
 documento_tipo ENUM('INE','PASAPORTE','OTRO') NULL,
 verificado_por BIGINT UNSIGNED NULL,
 verificado_en DATETIME NULL,
 CONSTRAINT fk_afiliados_cuenta FOREIGN KEY (cuenta_id) REFERENCES cuentas(id),
 CONSTRAINT fk_afiliados_verificado FOREIGN KEY (verificado_por) REFERENCES cuentas(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS autores (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 persona_id BIGINT UNSIGNED NOT NULL UNIQUE,
 biografia TEXT NULL,
 activo BOOLEAN NOT NULL DEFAULT TRUE,
 CONSTRAINT fk_autores_persona FOREIGN KEY (persona_id) REFERENCES personas(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS generos (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 nombre VARCHAR(90) NOT NULL UNIQUE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS editoriales (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 nombre VARCHAR(130) NOT NULL UNIQUE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS libros (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 titulo VARCHAR(250) NOT NULL,
 anio_publicacion SMALLINT UNSIGNED NOT NULL,
 edicion VARCHAR(80) NOT NULL,
 isbn VARCHAR(13) NOT NULL UNIQUE,
 genero_id BIGINT UNSIGNED NOT NULL,
 editorial_id BIGINT UNSIGNED NOT NULL,
 sinopsis TEXT NULL,
 portada VARCHAR(255) NULL,
 activo BOOLEAN NOT NULL DEFAULT TRUE,
 creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT fk_libros_genero FOREIGN KEY (genero_id) REFERENCES generos(id),
 CONSTRAINT fk_libros_editorial FOREIGN KEY (editorial_id) REFERENCES editoriales(id),
 INDEX idx_libros_titulo (titulo),
 INDEX idx_libros_genero (genero_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS libro_autores (
 libro_id BIGINT UNSIGNED NOT NULL,
 autor_id BIGINT UNSIGNED NOT NULL,
 PRIMARY KEY (libro_id, autor_id),
 CONSTRAINT fk_la_libro FOREIGN KEY (libro_id) REFERENCES libros(id),
 CONSTRAINT fk_la_autor FOREIGN KEY (autor_id) REFERENCES autores(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS ejemplares (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 libro_id BIGINT UNSIGNED NOT NULL,
 codigo VARCHAR(40) NOT NULL UNIQUE,
 estatus ENUM('DISPONIBLE','RESERVADO','PRESTADO','BAJA') NOT NULL DEFAULT 'DISPONIBLE',
 adquirido_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT fk_ejemplares_libro FOREIGN KEY (libro_id) REFERENCES libros(id),
 INDEX idx_ejemplares_libro_estado (libro_id, estatus)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS reservaciones (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 afiliado_id BIGINT UNSIGNED NOT NULL,
 ejemplar_id BIGINT UNSIGNED NOT NULL,
 estatus ENUM('ACTIVA','CUMPLIDA','EXPIRADA','CANCELADA') NOT NULL DEFAULT 'ACTIVA',
 creada_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 vence_en DATETIME NOT NULL,
 terminada_en DATETIME NULL,
 CONSTRAINT fk_reservaciones_afiliado FOREIGN KEY (afiliado_id) REFERENCES afiliados(cuenta_id),
 CONSTRAINT fk_reservaciones_ejemplar FOREIGN KEY (ejemplar_id) REFERENCES ejemplares(id),
 INDEX idx_reservaciones_vence (estatus, vence_en),
 INDEX idx_reservaciones_afiliado (afiliado_id, estatus)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS prestamos (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 afiliado_id BIGINT UNSIGNED NOT NULL,
 ejemplar_id BIGINT UNSIGNED NOT NULL,
 reservacion_id BIGINT UNSIGNED NULL UNIQUE,
 prestado_por BIGINT UNSIGNED NOT NULL,
 devuelto_por BIGINT UNSIGNED NULL,
 inicio_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 vence_en DATETIME NOT NULL,
 devuelto_en DATETIME NULL,
 CONSTRAINT fk_prestamos_afiliado FOREIGN KEY (afiliado_id) REFERENCES afiliados(cuenta_id),
 CONSTRAINT fk_prestamos_ejemplar FOREIGN KEY (ejemplar_id) REFERENCES ejemplares(id),
 CONSTRAINT fk_prestamos_reservacion FOREIGN KEY (reservacion_id) REFERENCES reservaciones(id),
 CONSTRAINT fk_prestamos_prestado_por FOREIGN KEY (prestado_por) REFERENCES cuentas(id),
 CONSTRAINT fk_prestamos_devuelto_por FOREIGN KEY (devuelto_por) REFERENCES cuentas(id),
 INDEX idx_prestamos_afiliado (afiliado_id, devuelto_en),
 INDEX idx_prestamos_vencimiento (devuelto_en, vence_en),
 INDEX idx_prestamos_ejemplar (ejemplar_id, devuelto_en)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS sesiones (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 cuenta_id BIGINT UNSIGNED NOT NULL,
 token_hash CHAR(64) NOT NULL UNIQUE,
 csrf_token CHAR(64) NOT NULL,
 creada_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 expira_en DATETIME NOT NULL,
 revocada_en DATETIME NULL,
 CONSTRAINT fk_sesiones_cuenta FOREIGN KEY (cuenta_id) REFERENCES cuentas(id),
 INDEX idx_sesiones_expira (expira_en)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS auditoria (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 actor_id BIGINT UNSIGNED NULL,
 accion VARCHAR(80) NOT NULL,
 entidad VARCHAR(40) NOT NULL,
 entidad_id BIGINT UNSIGNED NULL,
 detalle JSON NULL,
 creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT fk_auditoria_actor FOREIGN KEY (actor_id) REFERENCES cuentas(id),
 INDEX idx_auditoria_fecha (creado_en)
) ENGINE=InnoDB;

CREATE OR REPLACE VIEW vista_inventario AS
 SELECT l.id AS libro_id, l.titulo, SUM(CASE WHEN e.estatus<>'BAJA' THEN 1 ELSE 0 END) AS total,
 SUM(CASE WHEN e.estatus='DISPONIBLE' THEN 1 ELSE 0 END) AS disponibles,
 SUM(CASE WHEN e.estatus='RESERVADO' THEN 1 ELSE 0 END) AS reservados,
 SUM(CASE WHEN e.estatus='PRESTADO' THEN 1 ELSE 0 END) AS prestados
 FROM libros l LEFT JOIN ejemplares e ON e.libro_id=l.id GROUP BY l.id,l.titulo;

CREATE TABLE IF NOT EXISTS archivos (
 id CHAR(36) PRIMARY KEY,
 tipo ENUM('AUTOR','LIBRO','PERFIL') NOT NULL,
 entidad_id BIGINT UNSIGNED NOT NULL,
 nombre_archivo VARCHAR(100) NOT NULL UNIQUE,
 mime VARCHAR(32) NOT NULL,
 subido_por BIGINT UNSIGNED NOT NULL,
 creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT fk_archivos_subidor FOREIGN KEY (subido_por) REFERENCES cuentas(id),
 INDEX idx_archivos_owner (tipo,entidad_id)
) ENGINE=InnoDB;
