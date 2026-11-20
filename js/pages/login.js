function setLoading(button, loading, label) {
  button.disabled = loading;
  button.setAttribute('aria-busy', String(loading));
  button.textContent = loading ? 'Aguarde' : label;
}
function showAuthMessage(message, type = 'error') {
  document.getElementById('alert-area').innerHTML =
    `<div class="alert alert-${type}">${escapeHTML(message)}</div>`;
}
document.querySelectorAll('[data-password-target]').forEach((button) =>
  button.addEventListener('click', () => {
    const input = document.getElementById(button.dataset.passwordTarget);
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    button.innerHTML = svgIcon(show ? 'eye-off' : 'eye');
    button.setAttribute('aria-label', show ? 'Ocultar senha' : 'Mostrar senha');
    input.focus();
  }),
);
function openAuthPanel(panel) {
  const forms = { login: 'login-form', recovery: 'forgot-form', verification: 'verify-form' };
  const fields = { login: 'email', recovery: 'forgot-email', verification: 'verify-email' };
  const previous = Object.keys(forms).find((key) => !document.getElementById(forms[key]).hidden) || 'login';
  const address = document.getElementById(fields[previous]).value;
  for (const [key, id] of Object.entries(forms)) document.getElementById(id).hidden = key !== panel;
  document.getElementById(fields[panel]).value = address;
  document.getElementById('auth-confirm-link').hidden = panel !== 'login';
  const copy = {
    login: ['Acesse sua conta', 'Entre para continuar cuidando de cada etapa da adoção.'],
    recovery: ['Recuperar senha', 'Receba um link para escolher uma nova senha do PotyPet.'],
    verification: ['Confirmar cadastro', 'Esta opção confirma o e-mail de um cadastro novo. Ela não troca sua senha.'],
  };
  document.getElementById('auth-title').textContent = copy[panel][0];
  document.getElementById('auth-subtitle').textContent = copy[panel][1];
  document.getElementById('alert-area').innerHTML = '';
  document.getElementById(fields[panel]).focus();
}
document.getElementById('forgot-toggle').addEventListener('click', () => openAuthPanel('recovery'));
document.getElementById('resend-toggle').addEventListener('click', () => openAuthPanel('verification'));
document.getElementById('verify-back').addEventListener('click', () => openAuthPanel('login'));
document.getElementById('verify-recover').addEventListener('click', () => openAuthPanel('recovery'));

document.getElementById('verify-form').addEventListener(
  'submit',
  App.form(async (event) => {
    event.preventDefault();
    const button = document.getElementById('verify-submit');
    setLoading(button, true, 'Reenviar confirmação');
    try {
      const result = await Auth.resendVerification(document.getElementById('verify-email').value);
      showAuthMessage(result.message, 'success');
    } catch (err) {
      showAuthMessage(err.message);
    } finally {
      setLoading(button, false, 'Reenviar confirmação');
    }
  }),
);
document.getElementById('login-back').addEventListener('click', () => openAuthPanel('login'));

document.getElementById('login-form').addEventListener(
  'submit',
  App.form(async (event) => {
    event.preventDefault();
    const button = document.getElementById('login-submit');
    document.getElementById('alert-area').innerHTML = '';
    setLoading(button, true, 'Entrar');
    try {
      const user = await Auth.login(
        document.getElementById('email').value,
        document.getElementById('password').value,
        document.getElementById('remember').checked,
      );
      window.location.href = Auth.nextPage(user.role === 'admin' ? 'admin.html' : 'index.html');
    } catch (err) {
      showAuthMessage(err.message);
      setLoading(button, false, 'Entrar');
    }
  }),
);
document.getElementById('forgot-form').addEventListener(
  'submit',
  App.form(async (event) => {
    event.preventDefault();
    const button = document.getElementById('forgot-submit');
    setLoading(button, true, 'Solicitar recuperação');
    try {
      const result = await Auth.forgotPassword(document.getElementById('forgot-email').value);
      showAuthMessage(result.message, 'success');
    } catch (err) {
      showAuthMessage(err.message);
    } finally {
      setLoading(button, false, 'Solicitar recuperação');
    }
  }),
);

const loginNext = Auth.captureDestination();
if (loginNext)
  document
    .querySelectorAll('a[href="registro.html"]')
    .forEach((a) => (a.href = 'registro.html?next=' + encodeURIComponent(loginNext)));
if (new URLSearchParams(location.search).has('recovery'))
  document.getElementById('forgot-toggle').click();
else if (new URLSearchParams(location.search).has('verify'))
  document.getElementById('resend-toggle').click();
