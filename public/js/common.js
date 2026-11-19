'use strict';
(() => {
  const csrf = document.querySelector('meta[name="csrf-token"]')?.content;
  window.echoRequest = async (url, opts = {}) => {
    const response = await fetch(url, {
      credentials: 'same-origin',
      ...opts,
      headers: { 'X-CSRF-Token': csrf, ...(opts.headers || {}) }
    });
    let data;
    try { data = await response.json(); } catch { data = { message: `Erro HTTP ${response.status}` }; }
    if (!response.ok || data.success === false) throw new Error(data.message || `Erro HTTP ${response.status}`);
    return data;
  };
  // Evita que o status online fique permanentemente falso quando um usuário está navegando.
  const heartbeat = () => { if (!document.hidden) window.echoRequest('/atualizar-ativo', { method: 'POST' }).catch(() => {}); };
  heartbeat();
  setInterval(heartbeat, 45000);
})();
