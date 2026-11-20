'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'login.html'), 'utf8');
const script = fs.readFileSync(path.join(root, 'js/pages/login.js'), 'utf8');

// Exercita os controles reais do login com DOM isolado e transporte de autenticação simulado.
function createPage(search = '') {
  const elements = new Map(), requests = [];
  for (const tag of html.matchAll(/<([a-z][\w-]*)\b([^>]*)>/gi)) {
    const id = tag[2].match(/\bid="([^"]+)"/)?.[1];
    if (!id) continue;
    const listeners = {};
    elements.set(id, {
      id, value: '', hidden: /(?:^|\s)hidden(?:\s|$)/.test(tag[2]), innerHTML: '', textContent: '',
      disabled: false, checked: false,
      setAttribute(name, value) { this[name] = value; },
      addEventListener(event, handler) { listeners[event] = handler; },
      focus() {},
      async dispatch(type) {
        if (listeners[type]) await listeners[type]({ preventDefault() {}, currentTarget: this });
      },
      click() { return this.dispatch('click'); },
    });
  }
  const Auth = {
    captureDestination: () => null,
    async resendVerification(email) {
      requests.push({ operation: 'confirmation', email });
      return { message: 'Se houver uma confirmação pendente, enviaremos orientações.' };
    },
    async forgotPassword(email) {
      requests.push({ operation: 'recovery', email });
      return { message: 'Se houver uma conta, enviaremos um link para redefinir a senha.' };
    },
  };
  const context = vm.createContext({
    document: { getElementById: (id) => elements.get(id), querySelectorAll: () => [] },
    App: { form: (handler) => handler }, Auth, URLSearchParams, location: { search },
    window: { location: {} }, escapeHTML: (value) => String(value).replaceAll('<', '&lt;'),
  });
  vm.runInContext(script, context);
  return { elements, requests, element: (id) => elements.get(id) };
}

(async () => {
  const page = createPage();
  page.element('email').value = 'pessoa@example.test';
  await page.element('forgot-toggle').click();
  assert.equal(page.element('auth-title').textContent, 'Recuperar senha');
  assert.equal(page.element('forgot-form').hidden, false);
  assert.equal(page.element('verify-form').hidden, true);
  assert.equal(page.element('auth-confirm-link').hidden, true);
  assert.equal(page.element('forgot-email').value, 'pessoa@example.test');
  await page.element('login-back').click();
  assert.equal(page.element('login-form').hidden, false);
  await page.element('resend-toggle').click();
  assert.equal(page.element('auth-title').textContent, 'Confirmar cadastro');
  assert.equal(page.element('verify-form').hidden, false);
  assert.equal(page.element('forgot-form').hidden, true);
  page.element('verify-email').value = 'ong@example.test';
  await page.element('verify-form').dispatch('submit');
  assert.deepEqual(page.requests, [{ operation: 'confirmation', email: 'ong@example.test' }]);
  await page.element('verify-recover').click();
  assert.equal(page.element('auth-title').textContent, 'Recuperar senha');
  assert.equal(page.element('forgot-email').value, 'ong@example.test');
  assert.equal(page.element('alert-area').innerHTML, '');
  await page.element('forgot-form').dispatch('submit');
  assert.deepEqual(page.requests[1], { operation: 'recovery', email: 'ong@example.test' });
  assert.equal(page.element('forgot-submit').disabled, false);
  await page.element('login-back').click();
  assert.equal(page.element('email').value, 'ong@example.test');
  const recovery = createPage('?recovery');
  assert.equal(recovery.element('forgot-form').hidden, false);
  assert.equal(recovery.element('auth-title').textContent, 'Recuperar senha');
  const confirmation = createPage('?verify');
  assert.equal(confirmation.element('verify-form').hidden, false);
  assert.equal(confirmation.element('auth-title').textContent, 'Confirmar cadastro');
  assert.match(html, /Contas já confirmadas não recebem outra confirmação/);
  console.log('OK login — confirmação e recuperação separadas; atalho preserva e-mail e chama a operação correta; links diretos preservados.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
