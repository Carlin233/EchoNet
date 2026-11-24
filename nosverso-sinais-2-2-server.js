'use strict';
// Sinais 2.2 — mídia privada, recibos de entrega/leitura, sem alterar os endpoints 2.0.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const EMOJIS = new Set(['❤️', '😂', '😮', '😢', '👏', '🔥']);
const TYPES = Object.freeze({
  'image/jpeg': { kind: 'imagem', ext: '.jpg', max: 8 * 1024 * 1024 },
  'image/png': { kind: 'imagem', ext: '.png', max: 8 * 1024 * 1024 },
  'image/webp': { kind: 'imagem', ext: '.webp', max: 8 * 1024 * 1024 },
  'image/gif': { kind: 'imagem', ext: '.gif', max: 8 * 1024 * 1024 },
  'video/mp4': { kind: 'video', ext: '.mp4', max: 18 * 1024 * 1024 },
  'video/webm': { kind: 'video', ext: '.webm', max: 18 * 1024 * 1024 },
  'video/quicktime': { kind: 'video', ext: '.mov', max: 18 * 1024 * 1024 },
  'audio/webm': { kind: 'audio', ext: '.webm', max: 8 * 1024 * 1024 },
  'audio/ogg': { kind: 'audio', ext: '.ogg', max: 8 * 1024 * 1024 },
  'audio/mp4': { kind: 'audio', ext: '.m4a', max: 8 * 1024 * 1024 },
  'audio/mpeg': { kind: 'audio', ext: '.mp3', max: 8 * 1024 * 1024 }
});
const SHORT_NAMES = { imagem: 'uma foto', video: 'um vídeo', audio: 'um áudio', texto: 'uma mensagem' };
const validNumber = value => /^[1-9]\d*$/.test(String(value)) && Number.isSafeInteger(Number(value));
const eq = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
const safeMime = mime => TYPES[mime] ? mime : null;
function validMagic(buffer, mime) {
  if (!buffer || buffer.length < 12) return false;
  const text = (start, length) => buffer.toString('ascii', start, start + length);
  if (mime === 'image/jpeg') return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mime === 'image/png') return buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if (mime === 'image/gif') return ['GIF87a','GIF89a'].includes(text(0,6));
  if (mime === 'image/webp') return text(0,4) === 'RIFF' && text(8,4) === 'WEBP';
  if (mime.endsWith('webm')) return buffer.subarray(0,4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3]));
  if (mime === 'audio/ogg') return text(0,4) === 'OggS';
  if (mime === 'audio/mpeg') return text(0,3) === 'ID3' || (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0);
  if (mime === 'video/mp4' || mime === 'video/quicktime' || mime === 'audio/mp4') return text(4,4) === 'ftyp';
  return false;
}
function register({ app, run, get, all, requireLogin, withErrors, notify, usingPostgres, postgresPool, supabaseAdmin, cloudinary, multer, privateDir, uploadDir, publicRoot, bucket = 'echonet-chat-private', durableLocal = false }) {
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(bucket)) throw new Error('SINAIS_MEDIA_BUCKET inválido.');
  const within = (item, parent) => parent && (path.resolve(item) === path.resolve(parent) || path.resolve(item).startsWith(path.resolve(parent)+path.sep));
  if (privateDir && (within(privateDir,uploadDir) || within(privateDir,publicRoot)))
    throw new Error('SINAIS_PRIVATE_UPLOAD_DIR deve ficar FORA de public/ e UPLOAD_DIR: mensagens privadas não podem ser públicas.');
  const uploads = multer({ storage: multer.memoryStorage(), limits: { fileSize: 18*1024*1024, files: 1, fields: 5 },
    fileFilter: (req, file, cb) => safeMime(file.mimetype) ? cb(null, true) : cb(new Error('Formato de arquivo não permitido.')) });
  const buckets = { ready: false };
  const hit = new Map();
  const side = (a, b) => [a, b, b, a];
  async function peerFor(req) {
    const target = req.params.destinatario;
    if (typeof target !== 'string' || target.length > 80) return null;
    const user = await get('SELECT id,username FROM users WHERE username=? COLLATE NOCASE', [target]);
    return user && !eq(user.username, req.session.user.username) ? user : null;
  }
  async function initialize() {
    if (usingPostgres) {
      await postgresPool.query(`
        ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS media_tipo TEXT NOT NULL DEFAULT 'texto';
        ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS media_mime TEXT;
        ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS media_chave TEXT;
        ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS media_provedor TEXT;
        ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS media_formato TEXT;
        ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS duracao_segundos INTEGER;
        ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS entregue_em TIMESTAMPTZ;
        ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS lido_em TIMESTAMPTZ;
        CREATE INDEX IF NOT EXISTS idx_sinais22_receipts ON public.messages(destinatario,remetente,id);
      `);
    } else {
      const fields = new Set((await all('PRAGMA table_info(messages)')).map(f => f.name));
      const columns = [
        ['media_tipo', "TEXT NOT NULL DEFAULT 'texto'"], ['media_mime','TEXT'],
        ['media_chave','TEXT'], ['media_provedor','TEXT'],['media_formato','TEXT'],
        ['duracao_segundos','INTEGER'], ['entregue_em','DATETIME'], ['lido_em','DATETIME']
      ];
      for (const [name, spec] of columns) if (!fields.has(name)) await run(`ALTER TABLE messages ADD COLUMN ${name} ${spec}`);
      await run('CREATE INDEX IF NOT EXISTS idx_sinais22_receipts ON messages(destinatario,remetente,id)');
    }
    // Nunca disponibiliza arquivos do chat como pasta estática de public/uploads.
    if (!supabaseAdmin && !cloudinary) {
      if (!privateDir) throw new Error('Diretório de mídia privada não configurado.');
      fs.mkdirSync(privateDir, {recursive:true, mode:0o700});
      if (!durableLocal) console.warn('[Sinais 2.2] Mídias locais sem disco persistente: poderão desaparecer após redeploy. Configure Supabase Storage, Cloudinary ou SINAIS_PRIVATE_UPLOAD_DIR persistente.');
    }
  }
  async function ensurePrivateBucket() {
    if (buckets.ready) return;
    let {data, error} = await supabaseAdmin.storage.getBucket(bucket);
    if (error || !data) {
      const created = await supabaseAdmin.storage.createBucket(bucket, { public:false, fileSizeLimit:'18MB' });
      if (created.error) throw new Error('Não foi possível criar bucket privado do Sinais: ' + created.error.message);
      const check = await supabaseAdmin.storage.getBucket(bucket);
      data = check.data; error = check.error;
    }
    if (error || !data || data.public) throw new Error('O bucket do chat precisa ser PRIVADO. Verifique ' + bucket + ' no Supabase.');
    buckets.ready = true;
  }
  async function store(file, type) {
    const key = crypto.randomBytes(22).toString('hex') + type.ext;
    if (supabaseAdmin) {
      await ensurePrivateBucket();
      const result = await supabaseAdmin.storage.from(bucket).upload(`messages/${key}`, file.buffer, { contentType:file.mimetype, upsert:false });
      if (result.error) throw new Error('Erro ao salvar mídia no Supabase: ' + result.error.message);
      return {provider:'supabase',key:`messages/${key}`,format:type.ext.slice(1)};
    }
    if (cloudinary) {
      const resource_type = type.kind === 'imagem' ? 'image' : 'video';
      const public_id = 'echonet/sinais-privados/' + key.slice(0,-type.ext.length);
      const uploaded = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream({ public_id, resource_type, type:'authenticated', overwrite:false, format:type.ext.slice(1) }, (error, result) => error ? reject(error) : resolve(result));
        stream.end(file.buffer);
      });
      if (uploaded.type && uploaded.type !== 'authenticated') throw new Error('O upload do Cloudinary não ficou privado.');
      return {provider:'cloudinary',key:uploaded.public_id,format:uploaded.format || type.ext.slice(1)};
    }
    await fs.promises.mkdir(privateDir, {recursive:true, mode:0o700});
    await fs.promises.writeFile(path.join(privateDir,key),file.buffer,{flag:'wx',mode:0o600});
    return {provider:'local',key,format:type.ext.slice(1)};
  }
  async function discard(stored, kind) {
    if (!stored) return;
    try {
      if (stored.provider === 'supabase') await supabaseAdmin.storage.from(bucket).remove([stored.key]);
      if (stored.provider === 'cloudinary') await cloudinary.uploader.destroy(stored.key, {type:'authenticated', resource_type:kind === 'imagem' ? 'image' : 'video',invalidate:true});
      if (stored.provider === 'local') await fs.promises.unlink(path.join(privateDir,stored.key));
    } catch (err) { console.warn('[Sinais 2.2] Falha ao limpar mídia órfã:',err.message); }
  }
  app.get('/api/sinais22/:destinatario', requireLogin, withErrors(async (req,res)=>{
    const peer = await peerFor(req);
    if (!peer) return res.status(404).json({success:false,message:'Conversa não encontrada.'});
    const me = req.session.user.username;
    res.set('Cache-Control','no-store');
    const rows = (await all(`SELECT m.id,m.remetente,m.destinatario,m.conteudo,m.enviado_em,
      m.reply_to_id,p.conteudo AS reply_conteudo,p.remetente AS reply_remetente,p.media_tipo AS reply_media_tipo,
      m.media_tipo,m.media_mime,m.duracao_segundos,m.entregue_em,m.lido_em
      FROM messages m LEFT JOIN messages p ON p.id=m.reply_to_id AND
      ((p.remetente=m.remetente AND p.destinatario=m.destinatario) OR (p.remetente=m.destinatario AND p.destinatario=m.remetente))
      WHERE (m.remetente=? AND m.destinatario=?) OR (m.remetente=? AND m.destinatario=?)
      ORDER BY m.id DESC LIMIT 150`,side(me,peer.username))).reverse();
    const ids = rows.map(m=>Number(m.id));
    // 'Entregue' significa que a conversa foi sincronizada no cliente destinatário.
    const newestIncoming = rows.filter(m=>eq(m.destinatario, me)).at(-1);
    if (newestIncoming) await run("UPDATE messages SET entregue_em=COALESCE(entregue_em,datetime('now')) WHERE remetente=? AND destinatario=? AND id<=? AND entregue_em IS NULL",[peer.username,me,newestIncoming.id]);
    const reactionRows = ids.length ? await all(`SELECT message_id,user_id,emoji FROM message_reactions WHERE message_id IN (${ids.map(()=>'?').join(',')})`,ids) : [];
    const byMessage = new Map();
    for(const r of reactionRows) {
      if(!EMOJIS.has(r.emoji)) continue;
      let bucket = byMessage.get(Number(r.message_id));
      if(!bucket){bucket=new Map();byMessage.set(Number(r.message_id),bucket);}
      let stat=bucket.get(r.emoji);
      if(!stat){stat={emoji:r.emoji,count:0,mine:false};bucket.set(r.emoji,stat);}
      stat.count++;
      if(Number(r.user_id)===Number(req.session.user.id)) stat.mine=true;
    }
    res.json({success:true,mensagens:rows.map(m=>({ ...m, media_url: m.media_tipo !== 'texto' ? `/api/sinais22/midia/${m.id}` : null,
      reactions:[...(byMessage.get(Number(m.id))?.values() || [])] }))});
  }));
  app.post('/api/sinais22/:destinatario/ler',requireLogin,withErrors(async(req,res)=>{
    const peer=await peerFor(req);
    if(!peer)return res.status(404).json({success:false,message:'Conversa não encontrada.'});
    if(!validNumber(req.body?.ate_id)) return res.status(400).json({success:false,message:'Mensagem inválida.'});
    const me=req.session.user.username;
    // Somente mensagens ENVIADAS pelo interlocutor e endereçadas ao usuário autenticado.
    const result=await run("UPDATE messages SET lido_em=COALESCE(lido_em,datetime('now')),entregue_em=COALESCE(entregue_em,datetime('now')) WHERE remetente=? AND destinatario=? AND id<=? AND lido_em IS NULL",[peer.username,me,Number(req.body.ate_id)]);
    res.json({success:true,atualizadas:result.changes});
  }));
  app.post('/api/sinais22/:destinatario/arquivo',requireLogin,(req,res,next)=>{
    uploads.single('arquivo')(req,res,err=> {
      if(!err)return next();
      res.status(err instanceof multer.MulterError && err.code==='LIMIT_FILE_SIZE' ? 413 : 400).json({success:false,message:err.code==='LIMIT_FILE_SIZE'?'Arquivo muito grande (limite de 18 MB).':'Arquivo não permitido.'});
    });
  },withErrors(async(req,res)=>{
    const peer=await peerFor(req);
    if(!peer)return res.status(404).json({success:false,message:'Conversa não encontrada.'});
    if(process.env.NODE_ENV==='production' && !supabaseAdmin && !cloudinary && !durableLocal)
      return res.status(503).json({success:false,message:'Para salvar áudio, fotos e vídeos no Render, configure Supabase Storage, Cloudinary ou disco persistente (SINAIS_PRIVATE_UPLOAD_DIR).'});
    const file=req.file, type=file && TYPES[file.mimetype];
    if(!file||!type||!validMagic(file.buffer,file.mimetype)||file.size>type.max) return res.status(400).json({success:false,message:'Arquivo inválido ou acima do limite para este formato.'});
    const now=Date.now(),id=req.session.user.id;
    const state=hit.get(id)||{started:now,count:0};
    if(now-state.started>10*60*1000){state.started=now;state.count=0;}
    if(state.count>=12) return res.status(429).json({success:false,message:'Limite temporário de envios de mídia atingido.'});
    hit.set(id,state); if(hit.size>3000) for(const [k,v] of hit) if(now-v.started>10*60*1000)hit.delete(k);
    const raw=req.body?.reply_to_id;
    let parent=null;
    if(raw!==undefined && raw!==null && raw!==''){
      if(!validNumber(raw))return res.status(400).json({success:false,message:'Resposta inválida.'});
      const found=await get('SELECT id FROM messages WHERE id=? AND ((remetente=? AND destinatario=?) OR (remetente=? AND destinatario=?))',[Number(raw),...side(req.session.user.username,peer.username)]);
      if(!found) return res.status(400).json({success:false,message:'Mensagem citada não pertence a esta conversa.'});
      parent=Number(raw);
    }
    const caption=typeof req.body?.conteudo==='string'?req.body.conteudo.trim():'';
    if(caption.length>2000) return res.status(400).json({success:false,message:'Legenda muito longa.'});
    const duration = type.kind==='audio' && Number.isFinite(Number(req.body?.duracao_segundos)) ? Math.min(90,Math.max(0,Math.round(Number(req.body.duracao_segundos)))) : null;
    let stored;
    try {
      stored=await store(file,type);
      const inserted=await run('INSERT INTO messages(remetente,destinatario,conteudo,reply_to_id,media_tipo,media_mime,media_chave,media_provedor,media_formato,duracao_segundos) VALUES(?,?,?,?,?,?,?,?,?,?)',
        [req.session.user.username,peer.username,caption,parent,type.kind,file.mimetype,stored.key,stored.provider,stored.format,duration]);
      state.count++;
      // A mensagem já está salva; falha de notificação não deve gerar duplicatas ao reenviar.
      try{await notify(peer.id,req.session.user,'message',`enviou ${SHORT_NAMES[type.kind]}.`,`/mensagens/${encodeURIComponent(req.session.user.username)}`);}catch(err){console.warn('[Sinais 2.2] Notificação indisponível:',err.message);}
      res.status(201).json({success:true,id:inserted.lastID});
    }catch(err){await discard(stored,type.kind);throw err;}
  }));
  app.get('/api/sinais22/midia/:id',requireLogin,withErrors(async(req,res)=>{
    if(!validNumber(req.params.id)) return res.sendStatus(404);
    const m=await get('SELECT remetente,destinatario,media_tipo,media_mime,media_chave,media_provedor,media_formato FROM messages WHERE id=?',[Number(req.params.id)]);
    if(!m||(!eq(m.remetente,req.session.user.username)&&!eq(m.destinatario,req.session.user.username))||!TYPES[m.media_mime]||m.media_tipo==='texto'||!m.media_chave) return res.sendStatus(404);
    res.set({'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});
    if(m.media_provedor==='supabase'&&supabaseAdmin){
      const {data,error}=await supabaseAdmin.storage.from(bucket).createSignedUrl(m.media_chave,120);
      if(error||!data?.signedUrl) return res.status(503).send('Mídia indisponível.');
      return res.redirect(302,data.signedUrl);
    }
    if(m.media_provedor==='cloudinary'&&cloudinary){
      const url=cloudinary.utils.private_download_url(m.media_chave,m.media_formato,{resource_type:m.media_tipo==='imagem'?'image':'video',type:'authenticated',expires_at:Math.floor(Date.now()/1000)+120});
      return res.redirect(302,url);
    }
    if(m.media_provedor!=='local'||!/^[a-f0-9]{44}\.(jpg|png|webp|gif|mp4|webm|mov|ogg|m4a|mp3)$/.test(m.media_chave)) return res.sendStatus(404);
    const filePath=path.join(privateDir,m.media_chave);
    let stat;
    try{stat=await fs.promises.stat(filePath);}catch{return res.sendStatus(404);}
    const length=stat.size;
    res.set({'Content-Type':m.media_mime,'Accept-Ranges':'bytes','Content-Disposition':'inline'});
    const range=req.headers.range;
    if(range){
      const match=/^bytes=(\d*)-(\d*)$/.exec(range);
      if(!match||(!match[1]&&!match[2]))return res.status(416).set('Content-Range',`bytes */${length}`).end();
      let start,end;
      if(!match[1]){const suffix=Number(match[2]);start=Math.max(0,length-suffix);end=length-1;}
      else {start=Number(match[1]);end=match[2]?Number(match[2]):length-1;}
      if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>=length||end<start)return res.status(416).set('Content-Range',`bytes */${length}`).end();
      end=Math.min(end,length-1);
      res.status(206).set({'Content-Range':`bytes ${start}-${end}/${length}`,'Content-Length':String(end-start+1)});
      return fs.createReadStream(filePath,{start,end}).on('error',()=>res.destroy()).pipe(res);
    }
    res.set('Content-Length',String(length));
    fs.createReadStream(filePath).on('error',()=>res.destroy()).pipe(res);
  }));
  return {initialize};
}
module.exports={register,validMagic,TYPES};
