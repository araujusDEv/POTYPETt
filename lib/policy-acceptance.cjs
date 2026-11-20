'use strict';
module.exports = function policyAcceptance({ db, version, now = () => new Date().toISOString() }) {
  db.exec(`CREATE TABLE IF NOT EXISTS policy_acceptances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    policy_version TEXT NOT NULL,
    accepted_at TEXT NOT NULL,
    source TEXT NOT NULL,
    UNIQUE(user_id, policy_version)
  )`);
  function status(user) {
    const current = db.prepare('SELECT accepted_at FROM policy_acceptances WHERE user_id=? AND policy_version=?').get(user.id, version);
    return { version, accepted: Boolean(current || user.terms_version === version),
      acceptedAt: current?.accepted_at || (user.terms_version === version ? user.terms_accepted_at : null) || null };
  }
  function accept(user, body) {
    if (!body || typeof body !== 'object' || Array.isArray(body) || body.version !== version || body.accepted !== true)
      throw Object.assign(Error('Leia a versão atual dos documentos e confirme o aceite explicitamente.'), { status: 400 });
    db.prepare('INSERT OR IGNORE INTO policy_acceptances(user_id,policy_version,accepted_at,source) VALUES(?,?,?,?)')
      .run(user.id, version, now(), 'explicit_account');
    return status(user);
  }
  return { status, accept };
};
