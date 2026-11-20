'use strict';
const policy = require('./governance.cjs').retention;
// Candidatos à revisão, nunca instruções de exclusão nem inferência de encerramento.
module.exports = function reviewRetention(load, now = new Date()) {
  const candidates = [], missingClosureDate = {};
  const rules = [
    ['animals', policy.listingsAfterClosureDays, (x) => ['adotado','indisponivel'].includes(x.status) || x.archivedAt, ['closedAt','archivedAt','adoptedAt']],
    ['missing', policy.listingsAfterClosureDays, (x) => x.found, ['foundAt','closedAt']],
    ['campaigns', policy.listingsAfterClosureDays, (x) => x.liveState === 'closed' || x.status === 'closed' || x.closedAt, ['closedAt']],
    ['requests', policy.requestDetailsAfterClosureDays, (x) => ['concluida','reprovada','recusada','cancelada','encerrada'].includes(x.status), ['closedAt','completedAt','rejectedAt','canceledAt','cancelledAt']],
    ['reports', policy.contactAfterResolutionDays, (x) => x.status === 'resolvida', ['resolvedAt']],
    ['adminLog', policy.administrativeLogDays, () => true, ['createdAt']],
  ];
  for (const [category, days, closed, fields] of rules) {
    for (const row of load(category) || []) {
      if (!closed(row)) continue;
      const date = fields.map((field) => row[field]).find((value) => typeof value === 'string' && Number.isFinite(Date.parse(value)));
      if (!date) { missingClosureDate[category] = (missingClosureDate[category] || 0) + 1; continue; }
      const due = new Date(Date.parse(date) + days * 86400000);
      if (due <= now) candidates.push({ category, id: row.id, referenceDate: date,
        reviewDue: due.toISOString(), action: 'manual_review_only' });
    }
  }
  return { generatedAt: now.toISOString(), readOnly: true, automaticDeletion: false,
    coverage: 'selected_collections_with_explicit_dates', candidates, missingClosureDate };
};
