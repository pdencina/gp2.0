// Genera supabase/v2/aplicar_en_orden.sql: el paso previo (con la confirmación activada)
// seguido del esquema nuevo, para pegar y ejecutar de una sola vez en el SQL Editor.
const fs = require("fs");
const path = require("path");

const dir = path.join(__dirname, "..", "supabase", "v2");
const pre = fs.readFileSync(path.join(dir, "000_preparar_desde_v1.sql"), "utf8")
  .replace("-- set app.confirmo_borrar_v1 = 'si';", "set app.confirmo_borrar_v1 = 'si';");
const schema = fs.readFileSync(path.join(dir, "001_schema.sql"), "utf8");
const speed = fs.readFileSync(path.join(dir, "004_rendimiento.sql"), "utf8")
  + "\n\n" + fs.readFileSync(path.join(dir, "005_panel.sql"), "utf8");

const header = `-- ============================================================================
-- ACTUALIZACIÓN DE LA VERSIÓN 1 A LA 2 (archivo generado; no editar a mano)
-- Regenerar con: node scripts/build-apply-sql.js
--
-- Ejecuta, en este orden y de una sola vez:
--   1. 000_preparar_desde_v1.sql  (borra las tablas de la versión 1; conserva cuentas, perfiles y roles)
--   2. 001_schema.sql             (crea el modelo nuevo)
--   3. 004_rendimiento.sql        (reglas de acceso rápidas con muchos datos)
--   4. 005_panel.sql              (consultas del panel de seguimiento)
--
-- ANTES: haz un respaldo y confirma que la aplicación web ya está en la versión 2.
-- ============================================================================

`;

fs.writeFileSync(path.join(dir, "aplicar_en_orden.sql"), header + pre + "\n\n" + schema + "\n\n" + speed);
console.log("Generado supabase/v2/aplicar_en_orden.sql");
