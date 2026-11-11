// Inicia servidor de producción local con cookies HTTP aptas para localhost.
// Para despliegue real utilizar HTTPS y NO definir LOCAL_HTTP.
process.env.NODE_ENV='production';
process.env.LOCAL_HTTP='true';
await import('../server/src/index.js');
