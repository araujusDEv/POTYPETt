'use strict';
module.exports = Object.freeze({
  version: '2026-11-22-potypet-operacao-2',
  operator: 'Equipe PotyPet',
  email: 'potypett@gmail.com',
  serviceDays: 'segunda a quinta-feira',
  backup: {
    strategy: 'github_actions',
    scheduleUtc: '17 6 * * *',
    retentionDays: 7,
    verification: 'download_and_restore_in_separate_job',
    productionVerified: false,
  },
  retention: {
    listingsAfterClosureDays: 365,
    requestDetailsAfterClosureDays: 365,
    contactAfterResolutionDays: 365,
    minimumHistoryAfterClosureDays: 730,
    administrativeLogDays: 730,
    incidentRegisterMinimumYears: 5,
    backupDays: 7,
    reviewFrequency: 'monthly',
    automaticDeletion: false,
  },
});
