/**
 * Query de versión para registrar el SW: al subir un cambio en `public/sw.js`,
 * incrementa este número para que el navegador descargue el script nuevo y no
 * quede un worker viejo (p. ej. con `event.data.json()` que rompía en push vacío).
 */
export const SERVICE_WORKER_SCRIPT = "/sw.js?v=4";
