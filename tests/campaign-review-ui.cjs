'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = vm.createContext({ App: { ready() {} } });
vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/pages/campanhas.js'), 'utf8'), context);
function effect(campaign, decision) {
  context.campaign = campaign;
  context.decision = decision;
  return vm.runInContext('reviewDecisionEffect(campaign, decision)', context);
}
// Uma campanha nova pode ter liveState=paused antes da primeira aprovação.
const firstSubmission = { draft: {}, approved: null, liveState: 'paused' };
assert.equal(effect(firstSubmission, 'approve'), '');
const pausedCampaign = { draft: {}, approved: { title: 'Versão aprovada' }, liveState: 'paused' };
assert.match(effect(pausedCampaign, 'approve'), /mantém a campanha pausada/);
assert.match(effect({ ...pausedCampaign, draft: { closeRequested: true } }, 'approve'), /encerrará o recebimento/);
assert.equal(effect(firstSubmission, 'changes'), '');
assert.equal(effect(firstSubmission, 'reject'), '');
assert.match(effect(pausedCampaign, 'pause'), /não são cancelados/);
assert.match(effect(pausedCampaign, 'close'), /não são cancelados/);
assert.equal(effect(pausedCampaign, 'resume'), '');
console.log('OK interface de campanhas — avisos distinguem primeira aprovação, atualização pausada e encerramento.');
