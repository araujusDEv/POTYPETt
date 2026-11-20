document.getElementById('contact-form').addEventListener(
  'submit',
  App.form(async (e) => {
    e.preventDefault();
    const wrapper = document.getElementById('contact-wrapper');
    try {
      const message = document.getElementById('c-message').value;
      if (message.length > 5000)
        throw new Error(
          'A mensagem deve ter até 5000 caracteres. Seu texto foi preservado; revise antes de enviar.',
        );
      const result = await Store.sendContact({
        name: document.getElementById('c-name').value,
        email: document.getElementById('c-email').value,
        message,
      });
      wrapper.innerHTML = `<div class="alert alert-success" role="status"><b>Mensagem registrada para a Equipe PotyPet.</b><p style="color:inherit;">Protocolo: <strong>${escapeHTML(result.protocol)}</strong></p><p style="color:inherit;">Guarde esse número. A equipe analisa as mensagens conforme a disponibilidade, sem horário fixo nem prazo fixo para dúvidas e sugestões.</p><p style="color:inherit;">Para acompanhar sua mensagem, escreva para <a href="mailto:potypett@gmail.com">potypett@gmail.com</a> e informe o protocolo. O formulário não envia confirmação automática por e-mail.</p></div>`;
    } catch (err) {
      let alert = document.getElementById('contact-alert');
      if (!alert) {
        alert = document.createElement('div');
        alert.id = 'contact-alert';
        e.currentTarget.prepend(alert);
      }
      alert.innerHTML = `<div class="alert alert-error">${escapeHTML(err.message)}</div>`;
    }
  }),
);
