'use strict';
const { available, isDemo } = require('./video-demo.cjs');
module.exports = function reminders({ db, loadState, saveState, eventMail }) {
  function scan() {
    db.exec('BEGIN IMMEDIATE');
    try {
      const requests = loadState('requests'), followups = loadState('followups');
      let changed = false;
      for (const r of requests) {
        if (r.status !== 'concluida' || isDemo(r)) continue;
        const day = [7, 30, 90].find((d) => !followups.some((f) => f.requestId === r.id && f.day === d));
        if (!day || !available(r, day) || r.followupReminderDays?.includes(day)) continue;
        if (eventMail(r.requesterId, 'followupDue', `request:${r.id}:due:${day}`, 'minhas-solicitacoes.html', { day })) {
          r.followupReminderDays = [...(r.followupReminderDays || []), day];
          changed = true;
        }
      }
      if (changed) saveState('requests', requests);
      db.exec('COMMIT');
    } catch (err) { db.exec('ROLLBACK'); throw err; }
  }
  return { scan, start() {
    const tick = () => { try { scan(); } catch { console.error('PotyPet: lembretes de acompanhamento temporariamente indisponíveis.'); } };
    tick();
    setInterval(tick, 60000).unref();
  } };
};
