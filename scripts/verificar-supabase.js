'use strict';
// Checagem de leitura, não faz inserts, updates ou deletes.
if (!process.env.DATABASE_URL || !process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
  console.error('Faltam DATABASE_URL, SUPABASE_URL ou SUPABASE_SECRET_KEY no ambiente local.');
  process.exit(1);
}
(async () => {
  const { createPostgresAdapter } = require('../db/postgres');
  const { createClient } = require('@supabase/supabase-js');
  const db = createPostgresAdapter(process.env.DATABASE_URL);
  const supabase = createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SECRET_KEY, { auth:{persistSession:false,autoRefreshToken:false} });
  try {
    for (const table of ['users','posts','messages','comments','follows','stories','notifications']) {
      const { rows } = await db.query(`SELECT COUNT(*)::integer AS count FROM public."${table}"`);
      console.log(`${table}: ${rows[0].count}`);
    }
    const bucket = process.env.SUPABASE_STORAGE_BUCKET || 'echonet-media';
    const { data,error } = await supabase.storage.getBucket(bucket);
    if (error || !data?.public) throw new Error(`Storage: bucket público "${bucket}" não encontrado/sem acesso.`);
    console.log(`Storage: bucket "${bucket}" disponível.`);
    console.log('Conexão verificada; nenhum dado foi alterado.');
  } catch (error) {
    console.error('Falha na verificação:',error.message);
    process.exitCode = 1;
  } finally { await db.pool.end(); }
})();
