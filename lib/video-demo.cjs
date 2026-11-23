'use strict';
// Cenário privado e identificado para o vídeo; nunca altera datas de adoções reais.
const SCENARIO = 'potypet-video-followups-v1';
function isDemo(request) {
  return request?.demonstration === true && request.demoScenario === SCENARIO;
}
function available(request, day, at = Date.now()) {
  if (isDemo(request)) return [30, 90].includes(request.demoDay) && request.demoDay >= day;
  const start = Date.parse(request.completedAt || request.acceptedAt);
  return Number.isFinite(start) && at >= start + day * 86400000;
}
module.exports = function videoDemo(ctx) {
  const { db, loadState, saveState, newId, now, addAdminLog, eventMail } = ctx;
  const find = () => loadState('requests').find(isDemo);
  function view(r) {
    if (!r) return { exists: false };
    return { exists: true, animalId: r.animalId, requestId: r.id, day: r.demoDay,
      ownerEmail: 'ongpotypet@gmail.com', adopterEmail: 'hypestoreoofc@gmail.com',
      message: 'Acompanhamento de Nino preparado.' };
  }
  function create(admin) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const previous = find();
      if (previous) {
        if (previous.presentationVersion !== 2) {
          const animals = loadState('animals'), animal = animals.find((a) => a.id === previous.animalId && a.demoScenario === SCENARIO);
          if (!animal) throw Object.assign(Error('Cadastro de Nino não encontrado para atualização.'), { status: 409 });
          Object.assign(animal, { name: 'Nino', description: 'Nino é dócil e está se adaptando à rotina da família.', archiveReason: 'Acompanhamento pós-adoção.' });
          saveState('animals', animals);
          Object.assign(previous, { animalName: 'Nino', presentationVersion: 2 });
          saveState('requests', loadState('requests').map((r) => r.id === previous.id ? previous : r));
          const followups = loadState('followups');
          for (const f of followups.filter((f) => f.requestId === previous.id && [7, 30].includes(f.day))) {
            f.health = f.health.replace(/^Demonstração:\s*/u, '');
            f.behavior = f.behavior.replace(/^Demonstração:\s*/u, '');
            eventMail(previous.ownerId, 'followup', `followup:${f.id}:presentation-v2:received`, 'painel-doador.html?tab=acompanhamentos', { day: f.day });
            eventMail(previous.requesterId, 'followupReceipt', `followup:${f.id}:presentation-v2:receipt`, 'minhas-solicitacoes.html', { day: f.day });
          }
          saveState('followups', followups);
          addAdminLog(admin, `Atualizou a apresentação do acompanhamento de Nino #${previous.id} e reenviou os avisos de 7 e 30 dias.`);
        }
        db.exec('COMMIT'); return view(previous);
      }
      const owner = db.prepare('SELECT * FROM users WHERE email=? COLLATE NOCASE').get('ongpotypet@gmail.com');
      const adopter = db.prepare('SELECT * FROM users WHERE email=? COLLATE NOCASE').get('hypestoreoofc@gmail.com');
      for (const user of [owner, adopter])
        if (!user?.email_verified_at || user.approval_status !== 'aprovado' || user.account_suspended_at || user.role === 'admin')
          throw Object.assign(Error('Confirme e aprove as duas contas antes de preparar o acompanhamento.'), { status: 409 });
      const at = now(), animalId = newId('animals'), requestId = newId('requests');
      const marker = { demonstration: true, demoScenario: SCENARIO };
      const animals = loadState('animals');
      animals.push({ ...marker, id: animalId, ownerId: owner.id, name: 'Nino',
        species: 'cachorro', breed: 'Sem raça definida', gender: 'macho', size: 'medio', age_group: 'adulto',
        city: 'Apodi', state: 'RN', photos: ['img/animal1.png'],
        description: 'Nino é dócil e está se adaptando à rotina da família.',
        status: 'adotado', approvalStatus: 'approved', createdAt: at,
        archivedAt: at, archivedBy: admin.id, archiveReason: 'Acompanhamento pós-adoção.' });
      saveState('animals', animals);
      const request = { ...marker, id: requestId, animalId, animalName: 'Nino',
        ownerId: owner.id, requesterId: adopter.id, full_name: adopter.name,
        status: 'concluida', stage: 'concluida', createdAt: at, completedAt: at,
        demoDay: 30, demoCreatedBy: admin.id, storyPublic: false, presentationVersion: 2,
        demoHistory: [{ day: 30, at, actorId: admin.id }] };
      const requests = loadState('requests'); requests.push(request); saveState('requests', requests);
      const followups = loadState('followups');
      for (const day of [7, 30]) {
        const record = { ...marker, id: newId('followups'), requestId, animalId, adopterId: adopter.id,
          day, adaptation: 'boa', health: 'Alimentação e cuidados em dia.',
          behavior: 'Adaptação tranquila à rotina.', needsHelp: false, photo: null, createdAt: at };
        followups.push(record); saveState('followups', followups);
        eventMail(owner.id, 'followup', `followup:${record.id}:received`, 'painel-doador.html?tab=acompanhamentos', { day, demonstration: true });
        eventMail(adopter.id, 'followupReceipt', `followup:${record.id}:receipt`, 'minhas-solicitacoes.html', { day, demonstration: true });
      }
      addAdminLog(admin, `Preparou o acompanhamento de Nino: animal #${animalId}, pedido #${requestId}, etapas de 7 e 30 dias.`);
      db.exec('COMMIT'); return view(request);
    } catch (err) { db.exec('ROLLBACK'); throw err; }
  }
  function advance(admin) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const requests = loadState('requests'), r = requests.find(isDemo);
      if (!r) throw Object.assign(Error('Prepare primeiro o acompanhamento de Nino.'), { status: 409 });
      if (r.demoDay !== 90) {
        r.demoDay = 90;
        r.demoHistory.push({ day: 90, at: now(), actorId: admin.id });
        saveState('requests', requests);
        eventMail(r.requesterId, 'followupDue', `request:${r.id}:due:90`, 'minhas-solicitacoes.html', { day: 90, demonstration: true });
        addAdminLog(admin, `Liberou o acompanhamento de 90 dias de Nino, pedido #${r.id}; resposta a cargo do adotante.`);
      }
      db.exec('COMMIT'); return view(r);
    } catch (err) { db.exec('ROLLBACK'); throw err; }
  }
  return { status: () => view(find()), create, advance };
};
module.exports.isDemo = isDemo;
module.exports.available = available;
