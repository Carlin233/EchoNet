'use strict';
(() => {
  const form = document.getElementById('changePasswordForm');
  const status = document.getElementById('passwordStatus');
  const button = document.getElementById('changePasswordButton');
  if (!form || !status || !button) return;
  const notify = (message, isError = false) => {
    status.textContent = message;
    status.hidden = false;
    status.classList.toggle('error', isError);
  };
  if (new URLSearchParams(location.search).get('senha') === 'alterada') {
    notify('Sua senha foi alterada com sucesso!');
    history.replaceState(null, '', '/configuracoes');
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(form));
    if (payload.novaSenha !== payload.confirmarSenha) {
      notify('As novas senhas não coincidem.', true);
      return;
    }
    button.disabled = true;
    button.textContent = 'Salvando...';
    status.hidden = true;
    try {
      await window.echoRequest('/api/conta/alterar-senha', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      // O servidor renovou a sessão e o CSRF, portanto recarregamos a página.
      form.reset();
      window.location.assign('/configuracoes?senha=alterada');
    } catch(error) {
      notify(error.message || 'Não foi possível alterar a senha.', true);
      button.disabled = false;
      button.textContent = 'Salvar nova senha';
    }
  });
})();
