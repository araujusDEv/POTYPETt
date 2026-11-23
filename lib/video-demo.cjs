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
      message: 'Demonstração com tempo simulado; não representa uma adoção real.' };
  }
  function create(admin) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const previous = find();
      if (previous) { db.exec('COMMIT'); return view(previous); }
      const owner = db.prepare('SELECT * FROM users WHERE email=? COLLATE NOCASE').get('ongpotypet@gmail.com');
      const adopter = db.prepare('SELECT * FROM users WHERE email=? COLLATE NOCASE').get('hypestoreoofc@gmail.com');
      for (const user of [owner, adopter])
        if (!user?.email_verified_at || user.approval_status !== 'aprovado' || user.account_suspended_at || user.role === 'admin')
          throw Object.assign(Error('Confirme e aprove as duas contas de teste documentadas antes de preparar o cenário.'), { status: 409 });
      const at = now(), animalId = newId('animals'), requestId = newId('requests');
      const marker = { demonstration: true, demoScenario: SCENARIO };
      const animals = loadState('animals');
      animals.push({ ...marker, id: animalId, ownerId: owner.id, name: 'Nino — demonstração',
        species: 'cachorro', breed: 'Sem raça definida', gender: 'macho', size: 'medio', age_group: 'adulto',
        city: 'Apodi', state: 'RN', photos: ['img/animal1.png'],
        description: 'Animal fictício para demonstração dos acompanhamentos no vídeo do TCC.',
        status: 'adotado', approvalStatus: 'approved', createdAt: at,
        archivedAt: at, archivedBy: admin.id, archiveReason: 'Demonstração privada; sem adoção real.' });
      saveState('animals', animals);
      const request = { ...marker, id: requestId, animalId, animalName: 'Nino — demonstração',
        ownerId: owner.id, requesterId: adopter.id, full_name: adopter.name,
        status: 'concluida', stage: 'concluida', createdAt: at, completedAt: at,
        demoDay: 30, demoCreatedBy: admin.id, storyPublic: false,
        demoHistory: [{ day: 30, at, actorId: admin.id }] };
      const requests = loadState('requests'); requests.push(request); saveState('requests', requests);
      const followups = loadState('followups');
      for (const day of [7, 30]) {
        const record = { ...marker, id: newId('followups'), requestId, animalId, adopterId: adopter.id,
          day, adaptation: 'boa', health: 'Demonstração: alimentação e cuidados em dia.',
          behavior: 'Demonstração: adaptação tranquila à rotina.', needsHelp: false, photo: null, createdAt: at };
        followups.push(record); saveState('followups', followups);
        eventMail(owner.id, 'followup', `followup:${record.id}:received`, 'painel-doador.html?tab=acompanhamentos', { day, demonstration: true });
        eventMail(adopter.id, 'followupReceipt', `followup:${record.id}:receipt`, 'minhas-solicitacoes.html', { day, demonstration: true });
      }
      addAdminLog(admin, `Preparou cenário privado de vídeo: animal #${animalId}, pedido #${requestId}, dias 7 e 30 simulados. Sem termo ou adoção real.`);
      db.exec('COMMIT'); return view(request);
    } catch (err) { db.exec('ROLLBACK'); throw err; }
  }
  function advance(admin) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const requests = loadState('requests'), r = requests.find(isDemo);
      if (!r) throw Object.assign(Error('Prepare primeiro o cenário de demonstração.'), { status: 409 });
      if (r.demoDay !== 90) {
        r.demoDay = 90;
        r.demoHistory.push({ day: 90, at: now(), actorId: admin.id });
        saveState('requests', requests);
        eventMail(r.requesterId, 'followupDue', `request:${r.id}:due:90`, 'minhas-solicitacoes.html', { day: 90, demonstration: true });
        addAdminLog(admin, `Avançou somente o cenário de vídeo #${r.id} ao dia 90 simulado; resposta permanece a cargo do adotante.`);
      }
      db.exec('COMMIT'); return view(r);
    } catch (err) { db.exec('ROLLBACK'); throw err; }
  }
  return { status: () => view(find()), create, advance };
};
module.exports.isDemo = isDemo;
module.exports.available = available;
