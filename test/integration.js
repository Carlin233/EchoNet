'use strict';
// Testes de integração sem dados pessoais. Execute: npm test
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'echonet-test-'));
process.env.DB_PATH = path.join(testDir, 'database.sqlite');
const { app, initialize, db } = require('../server');
const { once } = require('node:events');

class Client {
  constructor(origin) { this.origin = origin; this.cookie = ''; this.csrf = ''; }
  async request(url, { method = 'GET', body, json = false, csrf = true } = {}) {
    const headers = {};
    if (this.cookie) headers.Cookie = this.cookie;
    if (csrf && method !== 'GET') headers['X-CSRF-Token'] = this.csrf;
    if (json) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(body); }
    else if (body && !(body instanceof FormData) && !(body instanceof URLSearchParams)) { body = new URLSearchParams(body); }
    const res = await fetch(this.origin + url, { method, body, headers, redirect: 'manual' });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) this.cookie = setCookie.split(';')[0];
    return res;
  }
  async getCsrf(url = '/login.html') {
    const res = await this.request(url);
    assert.equal(res.status, 200, `GET ${url}`);
    const html = await res.text();
    const match = html.match(/<meta name="csrf-token" content="([a-f0-9]+)"/);
    assert.ok(match, 'CSRF meta presente');
    this.csrf = match[1];
    return html;
  }
  async json(url, options) { const res = await this.request(url, options); let obj; try { obj = await res.json(); } catch { obj = { message: res.statusText }; } return Array.isArray(obj) ? { status: res.status, list: obj } : { status: res.status, ...obj }; }
}
(async () => {
  await initialize();
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  const alice = new Client(origin), bruno = new Client(origin);
  const suffix = Math.random().toString(36).slice(2,8), first = `alice_${suffix}`, second = `bruno_${suffix}`;
  try {
    let res = await alice.request('/'); assert.equal(res.status, 302); assert.equal(res.headers.get('location'), '/login.html');
    await alice.getCsrf(); await bruno.getCsrf();
    let result = await alice.json('/register', { method: 'POST', json: true, csrf: false, body: { username: first, email: `${first}@example.test`, password: 'StrongPass123!', confirmPassword: 'StrongPass123!' } }); assert.equal(result.status, 403); console.log('✓ CSRF bloqueia cadastro sem token');
    for (const [client, name] of [[alice,first],[bruno,second]]) {
      result = await client.json('/register', { method: 'POST', json: true, body: { username: name, email: `${name}@example.test`, password: 'StrongPass123!', confirmPassword: 'StrongPass123!' } });
      assert.equal(result.status, 201, JSON.stringify(result));
      res = await client.request('/login', { method: 'POST', body: { email: `${name}@example.test`, password: 'StrongPass123!', _csrf: client.csrf } });
      assert.equal(res.status, 302, `login ${name}`);
      assert.equal(res.headers.get('location'), '/');
      const home = await client.getCsrf('/'); assert.match(home,/Publicar foto/);
    }
    console.log('✓ Cadastro, login, sessão e páginas EJS');
    const tinyPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/oLEAAAAASUVORK5CYII=', 'base64');
    const form = new FormData(); form.append('legenda', 'Post de teste!'); form.append('imagem', new Blob([tinyPng], { type: 'image/png' }), 'tiny.png');
    result = await alice.json('/postar', { method:'POST', body:form }); assert.equal(result.status, 200,JSON.stringify(result));
    let home = await alice.getCsrf('/'); const match = home.match(/data-post-id="(\d+)"/); assert.ok(match, 'post listado'); const id = match[1];
    result = await bruno.json(`/api/posts/${id}/like`, { method:'POST' }); assert.equal(result.count,1); assert.equal(result.liked,true);
    result = await bruno.json(`/api/posts/${id}/save`, { method:'POST' }); assert.equal(result.saved,true);
    result = await bruno.json(`/api/posts/${id}/comments`, { method:'POST',json:true,body:{conteudo:'Muito bom!'} }); assert.equal(result.count,1);
    result = await bruno.json(`/api/posts/${id}/comments`); assert.equal(result.comments[0].conteudo,'Muito bom!');
    result = await bruno.json('/api/follow/' + first, { method:'POST' }); assert.equal(result.following,true); assert.equal(result.followers,1);
    result = await bruno.json(`/api/posts/${id}/like`, { method:'POST' }); assert.equal(result.count,0); assert.equal(result.liked,false);
    home = await bruno.getCsrf('/perfil'); assert.match(home, /Salvos/);
    console.log('✓ Upload, post, curtidas, salvamentos, comentários e seguir');
    result = await alice.json('/api/perfil', { method:'POST',json:true, body:{ display_name:'Alice Teste',bio:'Biografia de teste'} }); assert.equal(result.success,true);
    res = await alice.request('/perfil'); assert.match(await res.text(),/Alice Teste/);
    // Fotos de perfil: envio válido, visibilidade pública, troca, remoção e validação.
    const avatarForm = new FormData(); avatarForm.append('avatar', new Blob([tinyPng], { type: 'image/png' }), 'perfil.png');
    result = await alice.json('/api/perfil/avatar', { method: 'POST', body: avatarForm });
    assert.equal(result.status, 200, JSON.stringify(result));
    assert.match(result.avatar, /^\/uploads\/avatars\/[\w-]+\.png$/);
    const avatar1 = result.avatar;
    assert.equal(fs.existsSync(path.join(__dirname, '../public', avatar1)), true);
    let profileHtml = await (await bruno.request('/perfil/' + first)).text();
    assert.ok(profileHtml.includes(avatar1), 'Visitante vê foto de perfil');
    assert.ok(profileHtml.includes('Foto de perfil de'), 'Imagem com texto acessível');
    home = await alice.getCsrf('/');
    assert.ok(home.includes(avatar1), 'Avatar do autor aparece no feed');
    let suggestions = await bruno.json('/online-users');
    assert.equal(suggestions.list.find(u => u.username === first).avatar, avatar1);
    const invalidAvatar = new FormData(); invalidAvatar.append('avatar', new Blob([Buffer.from('nao e uma imagem')], { type: 'image/png' }), 'falsa.png');
    result = await alice.json('/api/perfil/avatar', { method: 'POST', body: invalidAvatar });
    assert.equal(result.status, 400, 'Arquivo falsificado deve ser rejeitado');
    const largeAvatar = new FormData(); largeAvatar.append('avatar', new Blob([Buffer.alloc(3 * 1024 * 1024 + 1)], { type: 'image/png' }), 'grande.png');
    result = await alice.json('/api/perfil/avatar', { method: 'POST', body: largeAvatar });
    assert.equal(result.status, 400, 'Imagem maior que 3 MB deve ser rejeitada');
    const avatarForm2 = new FormData(); avatarForm2.append('avatar', new Blob([tinyPng], { type: 'image/png' }), 'perfil2.png');
    result = await alice.json('/api/perfil/avatar', { method: 'POST', body: avatarForm2 });
    assert.equal(result.status, 200);
    assert.notEqual(result.avatar, avatar1, 'Nova foto usa nome único');
    assert.equal(fs.existsSync(path.join(__dirname, '../public', avatar1)), false, 'Foto anterior é removida');
    const avatar2 = result.avatar;
    const brunoProfile = await (await bruno.request('/perfil')).text();
    assert.equal(brunoProfile.includes(avatar2), false, 'Foto pertence somente ao usuário');
    result = await alice.json('/api/perfil/avatar/remover', { method: 'POST' });
    assert.equal(result.avatar, '/img/default-avatar.svg');
    assert.equal(fs.existsSync(path.join(__dirname, '../public', avatar2)), false, 'Foto removida do disco');
    profileHtml = await (await bruno.request('/perfil/' + first)).text();
    assert.ok(profileHtml.includes('/img/default-avatar.svg'), 'Volta à foto padrão');
    console.log('✓ Foto de perfil: envio, exibição, substituição, proteção e remoção');
    result = await bruno.json('/mensagens', { method:'POST', json:true, body:{ destinatario:first,conteudo:'Olá!'} }); assert.equal(result.status,201);
    result = await alice.json('/api/mensagens/' + second); assert.equal(result.mensagens.at(-1).conteudo,'Olá!');
    result = await alice.json('/atualizar-ativo', { method:'POST' }); assert.equal(result.success,true);
    result = await bruno.json('/online-users'); assert.equal(result.list.some(x=>x.username===first),true);
    console.log('✓ Perfil editável, mensagens, status online e sugestões');
    result = await bruno.json(`/api/posts/${id}/archive`, { method:'POST' }); assert.equal(result.status,404);
    result = await alice.json(`/api/posts/${id}/archive`, { method:'POST' }); assert.equal(result.archived,true);
    result = await bruno.json(`/api/posts/${id}/like`, { method:'POST' }); assert.equal(result.status,404);
    result = await alice.json(`/api/posts/${id}/archive`, { method:'POST' }); assert.equal(result.archived,false);
    res = await bruno.request(`/deletar-post/${id}`, { method:'POST' }); assert.equal(res.status,404);
    res = await alice.request(`/deletar-post/${id}`, { method:'POST' }); assert.equal(res.status,302);
    console.log('✓ Arquivo, restauração, exclusão e permissões');
    console.log('TODOS OS TESTES PASSARAM');
  } finally {
    await new Promise(resolve => server.close(resolve));
    await new Promise(resolve => db.close(resolve));
    fs.rmSync(testDir, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
