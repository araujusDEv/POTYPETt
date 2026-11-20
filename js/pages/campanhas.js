'use strict';
let workspaceCampaigns = [],
  workspaceAdmin = false,
  currentReview = null,
  reviewStep = 1,
  reviewFeedback = '';
const historyLabels = {
  draft: 'Rascunho salvo',
  submit: 'Enviado para análise',
  check: 'Verificação registrada',
  approve: 'Aprovado',
  changes: 'Ajustes solicitados',
  reject: 'Reprovado',
  pause: 'Pausado',
  close: 'Encerrado',
  resume: 'Reativado',
  archive: 'Rascunho arquivado',
  restore: 'Rascunho restaurado',
  stale_pause: 'Pausa por falta de prestação de contas',
  evidence_add: 'Evidência adicionada',
  evidence_remove: 'Retirada de evidência',
};
async function loadWorkspace() {
  workspaceCampaigns = await fundApi(
    'GET',
    workspaceAdmin ? '/api/campaigns/manage' : '/api/campaigns/mine',
  );
  renderWorkspace();
}
function renderWorkspace() {
  const filter = document.getElementById('workflow-filter').value;
  const list = workspaceCampaigns
    .filter(
      (c) =>
        !filter ||
        (filter === 'corrections'
          ? c.status === 'changes' || (c.status === 'review' && c.approved)
          : filter === 'active'
            ? c.approved && c.liveState === 'active'
            : c.status === filter),
    )
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  document.getElementById('workspace-list').innerHTML = list.length
    ? list
        .map((c) => {
          const last = [...c.history]
            .reverse()
            .find((h) => ['changes', 'reject', 'pause', 'close'].includes(h.action));
          const editable =
            !Auth.getCurrentUser()?.historicalAccess && !['review', 'archived'].includes(c.status);
          const lifecycle =
            !Auth.getCurrentUser()?.historicalAccess && !c.approved && c.status !== 'review'
              ? '<button type="button" class="btn btn-outline" data-lifecycle="' +
                (c.status === 'archived' ? 'restore' : 'archive') +
                '" data-campaign="' +
                c.id +
                '">' +
                (c.status === 'archived' ? 'Restaurar rascunho' : 'Arquivar rascunho') +
                '</button>'
              : '';
          return (
            '<article class="workspace-card"><div class="workspace-meta">' +
            fundBadge(c.status) +
            '<span>#' +
            c.id +
            ' · ' +
            fundEscape(c.draft.kind === 'ongoing' ? 'Apoio contínuo' : 'Campanha') +
            ' · ' +
            fundDate(c.updatedAt) +
            '</span></div><h2>' +
            fundEscape(c.draft.title || 'Campanha sem título') +
            '</h2><p>' +
            fundEscape(c.draft.beneficiaryName || 'Beneficiário não informado') +
            '</p><div class="next-step">' +
            fundEscape(
              workspaceAdmin
                ? {
                    review: 'Confira as evidências, registre verificações e decida.',
                    changes: 'Aguarde as correções do responsável.',
                    draft: 'Rascunho ainda não enviado pelo responsável.',
                    active: 'Acompanhe a publicação e analise novas atualizações.',
                    rejected: 'Solicitação reprovada. Consulte a justificativa.',
                    paused: 'Confira as pendências antes de reativar.',
                    closed: 'Recebimento encerrado. Novas prestações de contas não reabrem o Pix.',
                    archived: 'Rascunho preservado. Restaure-o para continuar.',
                  }[c.status]
                : CAMPAIGN_STEPS[c.status],
            ) +
            '</div>' +
            (last && ['changes', 'rejected', 'paused', 'closed'].includes(c.status)
              ? '<p><strong>Justificativa:</strong> ' + fundEscape(last.reason) + '</p>'
              : '') +
            (c.approved
              ? '<p class="live-notice">Versão pública: ' +
                fundEscape(CAMPAIGN_STATES[c.liveState]) +
                '. Edições pendentes não alteram o Pix aprovado.</p>'
              : '') +
            '<div class="workspace-actions"><button type="button" class="btn btn-primary" data-review="' +
            c.id +
            '">' +
            (workspaceAdmin ? 'Analisar e gerenciar' : 'Histórico e detalhes') +
            '</button>' +
            (editable
              ? '<a class="btn btn-outline" href="solicitar-campanha.html?id=' +
                c.id +
                '">' +
                (c.approved
                  ? c.liveState === 'closed'
                    ? 'Enviar prestação de contas'
                    : 'Propor atualização'
                  : 'Continuar solicitação') +
                '</a>'
              : '') +
            (c.publicVersion
              ? '<a class="btn btn-ghost" href="doacoes.html?campanha=' +
                c.id +
                '">Ver publicação</a>'
              : '') +
            lifecycle +
            '</div></article>'
          );
        })
        .join('')
    : '<div class="campaign-empty"><h2>Nenhuma campanha nesta situação</h2><p>Uma solicitação pode ajudar um pet, vários animais ou o trabalho de uma organização.</p><a class="btn btn-outline" href="solicitar-campanha.html">Solicitar campanha</a></div>';
  if (Auth.getCurrentUser()?.historicalAccess)
    document.querySelectorAll('a[href^="solicitar-campanha.html"]').forEach((el) => el.remove());
}
async function openReview(id) {
  currentReview = await fundApi('GET', '/api/campaigns/' + Number(id));
  reviewStep = 1;
  reviewFeedback = '';
  renderReview();
  const dialog = document.getElementById('campaign-review');
  if (!dialog.open) dialog.showModal();
}
function reviewRequirements(c) {
  if (c.reviewRequirements) return c.reviewRequirements;
  const d = c.draft, hasAccounts = d.accountabilityDate || d.expenseDescription ||
    d.raisedCents !== (c.approved?.raisedCents || 0) || d.closeRequested;
  const requiredScopes = Object.keys(CAMPAIGN_CHECK_SCOPES).filter(
    (key) => key !== 'accountability' || hasAccounts,
  );
  const latestResults = {};
  for (const check of c.checks || []) {
    if (check.cycle !== c.reviewCycle) continue;
    for (const scope of check.scopes || []) latestResults[scope] = check.result;
  }
  const remainingScopes = requiredScopes.filter((key) => latestResults[key] !== 'consistent');
  return { requiredScopes, latestResults, remainingScopes, readyToApprove: !remainingScopes.length };
}
function reviewProgress(c) {
  const r = reviewRequirements(c), complete = r.requiredScopes.length - r.remainingScopes.length;
  return '<div class="review-progress" id="review-progress"><div><strong>' + complete +
    ' de ' + r.requiredScopes.length + ' assuntos com conferência coerente</strong><p>' +
    (r.readyToApprove ? 'Verificações necessárias salvas. Você já pode seguir para a decisão.' :
      'Registre os assuntos abaixo antes de aprovar. Você também pode pedir ajustes ou reprovar na etapa 3.') +
    '</p></div><ul class="review-requirements">' + r.requiredScopes.map((key) => {
      const result = r.latestResults[key];
      const status = result === 'consistent' ? 'Conferido' : result === 'uncertain' ?
        'Não confirmado' : result === 'inconsistent' ? 'Divergência encontrada' : 'Ainda não registrado';
      return '<li><span>' + fundEscape(CAMPAIGN_CHECK_SCOPES[key]) + '</span><b class="review-check-state ' +
        (result === 'consistent' ? 'is-complete' : 'is-pending') + '">' + status + '</b></li>';
    }).join('') + '</ul>' + (r.readyToApprove ?
      '<button type="button" class="btn btn-primary" data-go-review-step="3">Continuar para decisão</button>' : '') + '</div>';
}
function privateChecks(c) {
  const r = reviewRequirements(c);
  const history = (c.checks || []).map((v) => '<li><strong>' + fundEscape(v.actorName) +
    '</strong> · ' + fundDate(v.at) + ' · ciclo ' + Number(v.cycle || 0) + '<p>' +
    fundEscape((v.scopes || []).map((s) => CAMPAIGN_CHECK_SCOPES[s]).join(', ') ||
      'Registro anterior, sem assuntos separados') + ' · ' +
    fundEscape(CAMPAIGN_CHECK_RESULTS[v.result] || 'Resultado não estruturado') +
    '</p><p class="preserve-lines">' + fundEscape(v.note) + '</p>' +
    (v.external ? '<p>Fonte independente utilizada: ' + fundEscape(v.source) + '</p>' :
      '<p>Sem fonte independente registrada nesta conferência.</p>') +
    (v.evidence || []).map((f) => '<p class="preserve-lines">Evidência: ' + fundEscape(f.name) +
      ' · SHA-256: ' + fundEscape(f.sha256) + '</p>').join('') + '</li>').join('');
  return '<section id="review-checks"><h3>Verificações da campanha</h3>' +
    (c.status === 'review' ? reviewProgress(c) : '') +
    (c.status === 'review' ? '<details class="review-check-editor"' + (r.readyToApprove ? '' : ' open') +
      '><summary>' + (r.readyToApprove ? 'Adicionar ou atualizar uma verificação (opcional)' : 'Preencher uma verificação') +
      '</summary><form id="check-form" class="workspace-card">' +
      '<h3>Salvar uma conferência</h3><p>Marque apenas o que você realmente conferiu. Assuntos com o mesmo resultado podem ser registrados juntos.</p>' +
      '<p class="review-save-hint">Selecionar as caixas não salva a conferência. Ao terminar, clique em <strong>Salvar verificação</strong>.</p>' +
      '<fieldset><legend>1. O que você conferiu?</legend>' + r.requiredScopes.map((key) =>
        '<label class="check-label"><input type="checkbox" name="check-scope" value="' + key +
        '"><span>' + fundEscape(CAMPAIGN_CHECK_SCOPES[key]) + '</span></label>').join('') +
      '</fieldset><label for="check-result">2. Qual foi o resultado?</label><select id="check-result" required>' +
      '<option value="">Escolha o resultado da conferência</option>' + Object.entries(CAMPAIGN_CHECK_RESULTS).map(
        ([key, label]) => '<option value="' + key + '">' + label + '</option>').join('') +
      '</select><label for="check-note">3. Descreva o que conferiu e como chegou ao resultado</label>' +
      '<textarea id="check-note" required minlength="10" maxlength="2000" placeholder="Informe o que foi analisado, o método utilizado e o resultado observado."></textarea>' +
      '<fieldset><legend>4. Quais arquivos você utilizou?</legend><p class="review-field-hint">Selecione os arquivos que abriu e analisou. Ao conferir as evidências do caso, selecione pelo menos um.</p>' +
      c.files.filter((f) => !f.withdrawnAt).map((f) => '<label class="check-label"><input type="checkbox" name="check-file" value="' +
        f.id + '"><span>' + fundEscape(f.name) + '</span></label>').join('') +
      '</fieldset><label class="check-label"><input type="checkbox" id="check-external"><span>Também consultei uma fonte independente (opcional).</span></label>' +
      '<div id="check-source-group" hidden><label for="check-source">Qual fonte consultou, como e qual foi o resultado?</label>' +
      '<input id="check-source" minlength="5" maxlength="500"></div>' +
      '<small>Registre somente a conferência realizada. Arquivos legíveis e e-mail confirmado não comprovam a autenticidade do caso. O PotyPet não consulta o banco nem garante a detecção de imagens de IA ou documentos falsificados.</small>' +
      '<button type="submit" class="btn btn-primary">Salvar verificação</button></form></details>' : '') +
    '<details class="review-history"><summary>Verificações já salvas (' + (c.checks || []).length +
    ')</summary>' + (history ? '<ul class="history-list">' + history + '</ul>' :
      '<p>Nenhuma verificação foi salva nesta campanha.</p>') + '</details></section>';
}
function privateDecisions(c) {
  return (
    '<h3>Decisões e versões preservadas</h3><ul class="history-list">' +
    (c.decisions || [])
      .map(
        (v) =>
          '<li><strong>' +
          fundEscape(historyLabels[v.decision]) +
          '</strong> · ' +
          fundEscape(v.actorName) +
          ' · ' +
          fundDate(v.at) +
          '<p>' +
          fundEscape(v.reason || v.summary) +
          '</p><details><summary>Consultar a versão utilizada na decisão</summary>' +
          campaignPreview(v.proposedVersion) +
          '<p>Pix analisado: ' +
          fundEscape(v.proposedVersion.pixKey) +
          '</p><p class="preserve-lines">' +
          fundEscape(
            [v.proposedVersion.expenseDescription, v.proposedVersion.progressNote]
              .filter(Boolean)
              .join('\n'),
          ) +
          '</p><p>' +
          v.evidenceIds.length +
          ' evidências preservadas nesta decisão.</p></details></li>',
      )
      .join('') +
    '</ul>'
  );
}
function decisionForm(c) {
  if (c.status !== 'review' && (!c.approved || c.liveState === 'closed')) return '';
  const r = reviewRequirements(c);
  const options = (c.status === 'review' ? '<option value="approve"' + (r.readyToApprove ? '' : ' disabled') +
    '>Aprovar campanha' + (r.readyToApprove ? '' : ' — faltam verificações') +
    '</option><option value="changes">Pedir ajustes</option><option value="reject">Reprovar solicitação</option>' : '') +
    (c.approved && c.liveState !== 'closed' ? '<option value="pause">Pausar recebimento</option><option value="close">Encerrar campanha</option>' +
      (c.liveState === 'paused' ? '<option value="resume">Reativar versão aprovada</option>' : '') : '');
  return '<form id="decision-form" class="workspace-card"><h3>Qual decisão deseja registrar?</h3>' +
    (c.status === 'review' && !r.readyToApprove ? '<div class="review-decision-pending"><p><strong>Para aprovar, ainda falta conferir:</strong> ' +
      r.remainingScopes.map((key) => fundEscape(CAMPAIGN_CHECK_SCOPES[key])).join(', ') +
      '.</p><button class="btn btn-outline btn-sm" type="button" data-go-review-step="2">Voltar às verificações</button>' +
      '<p>Você pode pedir ajustes ou reprovar sem completar todas as verificações.</p></div>' : '') +
    '<label for="review-decision">Decisão</label><select id="review-decision" required><option value="">Escolha o que deseja fazer</option>' + options + '</select>' +
    '<p id="review-decision-help" class="review-field-hint" aria-live="polite">Selecione uma decisão para ver os campos necessários.</p>' +
    '<details id="review-private-section" hidden><summary id="review-private-title">Justificativa da decisão</summary>' +
    '<label for="review-reason">Mensagem privada para o responsável</label><textarea id="review-reason" maxlength="1500"></textarea></details>' +
    '<div id="review-summary-group" hidden><label for="review-summary">Resumo público da análise</label>' +
    '<textarea id="review-summary" minlength="30" maxlength="600" placeholder="Descreva o que foi conferido, o alcance e as limitações da análise."></textarea>' +
    '<small>Este texto aparecerá na campanha. Use pelo menos 30 caracteres e não inclua contatos, documentos, links privados ou dados bancários.</small>' +
    '<label class="check-label"><input type="checkbox" id="review-summary-confirmed"><span>Revisei o resumo público e confirmei que não contém documentos, contatos privados ou dados pessoais.</span></label></div>' +
    '<div id="review-public-note-group" hidden><label for="review-public-note">Explicação pública da pausa ou encerramento (opcional)</label>' +
    '<textarea id="review-public-note" maxlength="600"></textarea><small>Não inclua fontes privadas, dados bancários ou dados pessoais.</small></div>' +
    '<p id="review-decision-effect" class="review-field-hint"></p><button class="btn btn-primary" type="submit" disabled>Selecione uma decisão</button></form>';
}
function reviewDecisionEffect(c, decision) {
  if (decision === 'approve' && c.draft.closeRequested)
    return 'Esta proposta inclui um pedido de encerramento. Sua aprovação encerrará o recebimento.';
  if (decision === 'approve' && c.approved && c.liveState === 'paused')
    return 'A aprovação da atualização mantém a campanha pausada; a reativação é uma decisão separada.';
  return ['pause', 'close'].includes(decision) ?
    'Códigos Pix copiados anteriormente não são cancelados pelo PotyPet.' : '';
}
function syncDecisionForm() {
  const form = document.getElementById('decision-form');
  if (!form) return;
  const value = document.getElementById('review-decision').value;
  const needsReason = ['changes', 'reject', 'pause', 'close'].includes(value);
  const isApproval = value === 'approve';
  const privateSection = document.getElementById('review-private-section');
  privateSection.hidden = !value;
  privateSection.open = needsReason;
  document.getElementById('review-private-title').textContent = needsReason ?
    'Justificativa obrigatória para o responsável' : 'Adicionar observação privada (opcional)';
  const reason = document.getElementById('review-reason');
  reason.disabled = !value;
  reason.required = needsReason;
  reason.minLength = needsReason ? 10 : 0;
  reason.placeholder = needsReason ? 'Explique o motivo e, se necessário, o que o responsável precisa corrigir (mínimo de 10 caracteres).' : '';
  document.getElementById('review-summary-group').hidden = !isApproval;
  document.getElementById('review-summary').required = isApproval;
  document.getElementById('review-summary').disabled = !isApproval;
  document.getElementById('review-summary-confirmed').required = isApproval;
  document.getElementById('review-summary-confirmed').disabled = !isApproval;
  document.getElementById('review-public-note-group').hidden = !['pause', 'close'].includes(value);
  document.getElementById('review-public-note').disabled = !['pause', 'close'].includes(value);
  const help = {
    approve: 'Complete o resumo público e confirme a revisão do texto para publicar a versão proposta.',
    changes: 'Explique o que precisa ser corrigido. O responsável poderá ajustar e reenviar.',
    reject: 'Explique por que a solicitação não foi aprovada.',
    pause: 'Informe o motivo. O site deixará de gerar novos códigos Pix para esta campanha.',
    close: 'Informe o motivo. Uma campanha encerrada não poderá ser reativada.',
    resume: 'A versão já aprovada voltará a receber novas gerações de Pix, se estiver elegível.',
  };
  const labels = { approve: 'Aprovar campanha', changes: 'Enviar pedido de ajustes', reject: 'Reprovar solicitação',
    pause: 'Pausar recebimento', close: 'Encerrar campanha', resume: 'Reativar campanha' };
  document.getElementById('review-decision-help').textContent = help[value] || 'Selecione uma decisão para ver os campos necessários.';
  document.getElementById('review-decision-effect').textContent = reviewDecisionEffect(currentReview, value);
  const button = form.querySelector('[type=submit]');
  button.textContent = labels[value] || 'Selecione uma decisão';
  button.disabled = !value || (isApproval && !reviewRequirements(currentReview).readyToApprove);
}
function goToReviewStep(step, focus = true) {
  reviewStep = Math.max(1, Math.min(3, Number(step)));
  const flow = document.getElementById('review-flow');
  if (!flow) return;
  flow.querySelectorAll('[data-review-pane]').forEach((pane) => {
    pane.hidden = Number(pane.dataset.reviewPane) !== reviewStep;
  });
  flow.querySelectorAll('[data-review-step]').forEach((button) => {
    const current = Number(button.dataset.reviewStep) === reviewStep;
    button.classList.toggle('is-current', current);
    if (current) button.setAttribute('aria-current', 'step');
    else button.removeAttribute('aria-current');
  });
  const back = flow.querySelector('[data-review-back]'), next = flow.querySelector('[data-review-next]');
  back.hidden = reviewStep === 1;
  next.hidden = reviewStep === 3;
  next.textContent = reviewStep === 1 ? 'Continuar para verificações' :
    reviewRequirements(currentReview).readyToApprove ? 'Continuar para decisão' : 'Ir para decisão ou pedir ajustes';
  flow.querySelector('#review-step-position').textContent = 'Etapa ' + reviewStep + ' de 3';
  if (focus) {
    const heading = flow.querySelector('[data-review-pane="' + reviewStep + '"] > h3');
    heading?.focus();
    flow.scrollIntoView({ block: 'start', behavior: 'instant' });
  }
}
function setupReviewFlow(c) {
  const content = document.getElementById('review-content');
  if (workspaceAdmin && c.status === 'review') {
    const flow = document.createElement('div');
    flow.id = 'review-flow';
    flow.innerHTML = '<nav class="review-flow-steps" aria-label="Etapas da análise">' +
      ['Conferir campanha', 'Salvar verificações', 'Registrar decisão'].map((label, index) =>
        '<button type="button" data-review-step="' + (index + 1) + '"><b>' + (index + 1) +
        '</b><span>' + label + '</span></button>').join('') + '</nav>';
    const ids = ['review-details', 'review-checks', 'decision-form'];
    const titles = ['Confira os dados e abra as evidências', 'Registre o que foi conferido', 'Escolha e confirme a decisão'];
    ids.forEach((id, index) => {
      const pane = document.createElement('section');
      pane.dataset.reviewPane = index + 1;
      pane.innerHTML = '<h3 tabindex="-1">' + titles[index] + '</h3>' + (index === 0 ?
        '<p>Leia a solicitação e abra os arquivos. Depois, continue para salvar as verificações realizadas.</p>' : '');
      pane.append(document.getElementById(id));
      flow.append(pane);
    });
    flow.insertAdjacentHTML('beforeend', '<div class="review-flow-actions"><button type="button" class="btn btn-outline" data-review-back>Voltar</button>' +
      '<span id="review-step-position"></span><button type="button" class="btn btn-primary" data-review-next>Continuar</button></div>');
    content.prepend(flow);
    flow.querySelectorAll('[data-review-step]').forEach((button) => button.addEventListener('click', () => goToReviewStep(button.dataset.reviewStep)));
    flow.querySelector('[data-review-back]').addEventListener('click', () => goToReviewStep(reviewStep - 1));
    flow.querySelector('[data-review-next]').addEventListener('click', () => goToReviewStep(reviewStep + 1));
    goToReviewStep(reviewStep, false);
  }
  content.querySelectorAll('[data-go-review-step]').forEach((button) => button.addEventListener('click', () => goToReviewStep(button.dataset.goReviewStep)));
  if (reviewFeedback) {
    const notice = document.createElement('p');
    notice.id = 'review-save-notice';
    notice.className = 'review-save-notice';
    notice.setAttribute('role', 'status');
    notice.tabIndex = -1;
    notice.textContent = reviewFeedback;
    const pane = content.querySelector('[data-review-pane="' + reviewStep + '"]');
    if (pane) pane.prepend(notice);
    else content.prepend(notice);
  }
}
function renderReview(options = {}) {
  const c = currentReview,
    d = c.draft;
  const same = document.getElementById('review-content').dataset.campaign === String(c.id),
    decisionDraft = same
      ? Object.fromEntries(
          ['review-decision', 'review-reason', 'review-summary', 'review-public-note'].map((id) => [
            id,
            document.getElementById(id)?.value || '',
          ]),
        )
      : {};
  const confirmed = same && document.getElementById('review-summary-confirmed')?.checked;
  const checkDraft = same && !options.resetChecks && document.getElementById('check-form') ? {
    scopes: [...document.querySelectorAll('[name="check-scope"]:checked')].map((el) => el.value),
    files: [...document.querySelectorAll('[name="check-file"]:checked')].map((el) => el.value),
    result: document.getElementById('check-result').value,
    note: document.getElementById('check-note').value,
    external: document.getElementById('check-external').checked,
    source: document.getElementById('check-source').value,
  } : null;
  document.getElementById('review-content').dataset.campaign = c.id;
  document.getElementById('review-error').hidden = true;
  document.getElementById('review-title').textContent = d.title || 'Solicitação #' + c.id;
  const comparison = c.approved
    ? '<div class="review-comparison"><div><h3>Versão pública aprovada</h3>' +
      campaignPreview(c.approved) +
      '<p><strong>Pix aprovado:</strong> ' +
      fundEscape(c.approved.pixKey) +
      '</p></div><div><h3>Versão proposta</h3>' +
      campaignPreview(d) +
      '<p><strong>Pix proposto:</strong> ' +
      fundEscape(d.pixKey) +
      '</p></div></div>'
    : campaignPreview(d) + '<p><strong>Chave proposta:</strong> ' + fundEscape(d.pixKey) + '</p>';
  const identity =
    workspaceAdmin && c.organizerAccount
      ? '<section class="workspace-card"><h3>Conta do organizador · privado</h3><p>Conta #' +
        c.organizerAccount.id +
        ' · ' +
        fundEscape(c.organizerAccount.name) +
        ' · ' +
        fundEscape(c.organizerAccount.accountType) +
        '</p><p>' +
        fundEscape(c.organizerAccount.email) +
        ' · ' +
        fundEscape(c.organizerAccount.phone || 'Telefone não informado') +
        '</p><p>E-mail confirmado: ' +
        (c.organizerAccount.emailVerified ? 'sim' : 'não') +
        '. A confirmação de e-mail não comprova identidade civil.</p></section>'
      : '';
  document.getElementById('review-content').innerHTML =
    fundBadge(c.status) +
    '<section id="review-details">' +
    identity +
    comparison +
    (d.closeRequested
      ? '<p class="next-step">O responsável solicita encerramento. Aprovar esta versão encerrará o recebimento.</p>'
      : '') +
    '<h3>Recebedor</h3><p>' +
    fundEscape(d.receiverRelation) +
    ' · ' +
    fundEscape(d.receiverReason || '') +
    '</p><p>Autorização declarada pelo solicitante: ' +
    (d.receiverAuthorization ? 'sim' : 'não se aplica / não informada') +
    '. A declaração não comprova titularidade.</p>' +
    '<h3>Evidências privadas</h3><p>Validação técnica de formato e legibilidade; autenticidade depende de conferência humana. Somente a capa autorizada pode ficar pública.</p><ul class="file-list">' +
    c.files
      .map(
        (f) =>
          '<li><a href="/api/campaign-files/' +
          f.id +
          '" download>' +
          fundEscape(f.name) +
          '</a><span>' +
          Math.ceil(f.size / 1024) +
          ' KB' +
          (f.withdrawnAt
            ? ' · retirada, preservada'
            : f.retained
              ? ' · utilizada em decisão'
              : ' · ativa') +
          '</span></li>',
      )
      .join('') +
    '</ul>' +
    (d.updateText || d.expenseDescription || d.progressNote
      ? '<h3>Atualização e apuração propostas</h3><p class="preserve-lines">' +
        fundEscape(
          [d.updateText, d.expenseDescription, d.progressNote].filter(Boolean).join('\n'),
        ) +
        '</p><p>Total proposto: ' +
        fundMoney(d.raisedCents) +
        '</p>'
      : '') +
    '</section><details class="review-history" id="review-history"><summary>Histórico e decisões anteriores</summary><h3>Histórico</h3><ul class="history-list">' +
    c.history
      .map(
        (h) =>
          '<li><strong>' +
          fundEscape(historyLabels[h.action] || h.action) +
          '</strong> · ' +
          fundEscape(h.actorName) +
          '<time>' +
          fundDate(h.at) +
          '</time><p>' +
          fundEscape(h.reason) +
          '</p></li>',
      )
      .join('') +
    '</ul>' + (workspaceAdmin ? privateDecisions(c) : '') + '</details>' +
    (workspaceAdmin ? privateChecks(c) + decisionForm(c) : '');
  setupReviewFlow(c);
  document.getElementById('check-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('[type=submit]');
    const scopes = [...document.querySelectorAll('[name="check-scope"]:checked')].map((i) => i.value);
    const files = [...document.querySelectorAll('[name="check-file"]:checked')].map((i) => i.value);
    if (!scopes.length) {
      fundError(new Error('Marque pelo menos um assunto que você conferiu antes de salvar.'), 'review-error');
      return;
    }
    if (scopes.includes('evidence') && !files.length) {
      fundError(new Error('Selecione pelo menos um arquivo utilizado para conferir as evidências do caso.'), 'review-error');
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Salvando verificação…';
    try {
      currentReview = await fundApi('POST', '/api/campaigns/' + c.id + '/checks', {
        revision: currentReview.revision,
        note: document.getElementById('check-note').value,
        external: document.getElementById('check-external').checked,
        source: document.getElementById('check-source').value,
        scopes: [...document.querySelectorAll('[name="check-scope"]:checked')].map((i) => i.value),
        result: document.getElementById('check-result').value,
        fileIds: [...document.querySelectorAll('[name="check-file"]:checked')].map((i) => i.value),
      });
      const r = reviewRequirements(currentReview);
      reviewFeedback = 'Verificação salva no histórico. ' + (r.readyToApprove ?
        'Todos os assuntos necessários estão conferidos; continue para a etapa 3.' :
        'Ainda faltam conferências para aprovar: ' + r.remainingScopes.map((key) => CAMPAIGN_CHECK_SCOPES[key]).join(', ') + '.');
      reviewStep = 2;
      renderReview({ resetChecks: true });
      document.getElementById('review-save-notice')?.focus();
      await loadWorkspace().catch(() => showToast('A verificação foi salva. Recarregue a lista para atualizar as campanhas.'));
    } catch (err) {
      fundError(err, 'review-error');
      btn.disabled = false;
      btn.textContent = 'Salvar verificação';
    }
  });
  document.getElementById('decision-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('[type=submit]');
    btn.disabled = true;
    btn.textContent = 'Registrando decisão…';
    try {
      currentReview = await fundApi('POST', '/api/campaigns/' + c.id + '/review', {
        revision: currentReview.revision,
        decision: document.getElementById('review-decision').value,
        reason: document.getElementById('review-reason').value,
        summary: document.getElementById('review-summary').value,
        publicSummaryConfirmed: document.getElementById('review-summary-confirmed').checked,
        publicNote: document.getElementById('review-public-note').value,
      });
      reviewFeedback = 'Decisão registrada. Situação atual: ' + CAMPAIGN_STATES[currentReview.status] + '.';
      renderReview();
      await loadWorkspace().catch(() => showToast('A decisão foi salva. Recarregue a lista para atualizar as campanhas.'));
    } catch (err) {
      fundError(err, 'review-error');
      syncDecisionForm();
    }
  });
  for (const [id, value] of Object.entries(decisionDraft))
    if (document.getElementById(id)) document.getElementById(id).value = value;
  if (document.getElementById('review-summary-confirmed'))
    document.getElementById('review-summary-confirmed').checked = !!confirmed;
  if (checkDraft && document.getElementById('check-form')) {
    document.querySelectorAll('[name="check-scope"]').forEach((el) => { el.checked = checkDraft.scopes.includes(el.value); });
    document.querySelectorAll('[name="check-file"]').forEach((el) => { el.checked = checkDraft.files.includes(el.value); });
    document.getElementById('check-result').value = checkDraft.result;
    document.getElementById('check-note').value = checkDraft.note;
    document.getElementById('check-external').checked = checkDraft.external;
    document.getElementById('check-source').value = checkDraft.source;
  }
  const external = document.getElementById('check-external');
  if (external) {
    const syncSource = () => {
      document.getElementById('check-source-group').hidden = !external.checked;
      document.getElementById('check-source').required = external.checked;
      document.getElementById('check-source').disabled = !external.checked;
    };
    external.addEventListener('change', syncSource);
    syncSource();
  }
  document.getElementById('review-decision')?.addEventListener('change', syncDecisionForm);
  syncDecisionForm();
}
App.ready(async () => {
  const user = Auth.requireAuth();
  if (!user) return;
  if (user.historicalAccess)
    document.querySelectorAll('a[href^="solicitar-campanha.html"]').forEach((el) => el.remove());
  workspaceAdmin =
    new URLSearchParams(location.search).get('admin') === '1' && user.role === 'admin';
  if (workspaceAdmin) {
    document.getElementById('workspace-title').textContent = 'Análise de campanhas';
    document.getElementById('workspace-eyebrow').textContent = 'Administração';
    document.getElementById('workspace-description').textContent =
      'Confira evidências, registre verificações e acompanhe as versões aprovadas.';
    document.getElementById('workflow-filter').value = 'review';
  }
  document.getElementById('workflow-filter').addEventListener('change', renderWorkspace);
  document.getElementById('workspace-list').addEventListener(
    'click',
    App.click(async (e) => {
      const button = e.target.closest('[data-review]');
      if (button) {
        try {
          await openReview(button.dataset.review);
        } catch (err) {
          fundError(err);
        }
      }
    }),
  );
  document.getElementById('workspace-list').addEventListener(
    'click',
    App.click(async (e) => {
      const button = e.target.closest('[data-lifecycle]');
      if (!button) return;
      const c = workspaceCampaigns.find((c) => c.id === Number(button.dataset.campaign));
      try {
        await fundApi('POST', '/api/campaigns/' + c.id + '/' + button.dataset.lifecycle, {
          revision: c.revision,
        });
        await loadWorkspace();
      } catch (err) {
        fundError(err);
      }
    }),
  );
  document
    .getElementById('close-review')
    .addEventListener('click', () => document.getElementById('campaign-review').close());
  try {
    await loadWorkspace();
  } catch (e) {
    fundError(e);
  }
});
