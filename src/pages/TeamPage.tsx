// Organisation members and invites.
//
// routes/orgs.mjs has had the member list, the invite endpoint and role changes
// since it was written, and only GET /api/orgs was ever called — by a scope
// dropdown in DFM Studio. So a workspace owner could not add a colleague
// without a curl command, and the Help page said so out loud: "invite
// colleagues by email from the API". Half a feature is worse than none.
import { useEffect, useState } from 'react';
import { Users, Loader2, UserPlus, ShieldCheck } from 'lucide-react';

const ROLES = ['viewer', 'member', 'admin', 'owner'] as const;
type Role = typeof ROLES[number];

interface Org { id: string; name: string; role: Role; members: number }
interface Member { email: string; role: Role; status: string; createdAt: string }

export default function TeamPage() {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [orgId, setOrgId] = useState('');
  const [members, setMembers] = useState<Member[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('member');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  const token = localStorage.getItem('brainspark_auth');
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  const me = orgs.find(o => o.id === orgId);
  const canInvite = me?.role === 'admin' || me?.role === 'owner';
  const canSetRole = me?.role === 'owner';

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/orgs', { headers });
        if (!r.ok) return;
        const list: Org[] = await r.json();
        setOrgs(list);
        if (list.length && !orgId) setOrgId(list[0].id);
      } catch { /* signed out or offline */ }
    })();
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, []);

  async function loadMembers(id: string) {
    if (!id) return;
    try {
      const r = await fetch(`/api/orgs/${id}/members`, { headers });
      setMembers(r.ok ? await r.json() : []);
    } catch { setMembers([]); }
  }
  useEffect(() => { loadMembers(orgId); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [orgId]);

  async function invite() {
    setBusy(true); setError(''); setNote('');
    try {
      const r = await fetch(`/api/orgs/${orgId}/invites`, { method: 'POST', headers, body: JSON.stringify({ email: email.trim(), role }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Could not send that invite.');
      setEmail(''); setNote(d.note || 'Invite recorded.');
      await loadMembers(orgId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send that invite.');
    } finally { setBusy(false); }
  }

  async function changeRole(memberEmail: string, next: Role) {
    setError(''); setNote('');
    try {
      const r = await fetch(`/api/orgs/${orgId}/members/${encodeURIComponent(memberEmail)}`, {
        method: 'PATCH', headers, body: JSON.stringify({ role: next }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Could not change that role.');
      await loadMembers(orgId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not change that role.');
    }
  }

  return (
    <div className="min-h-screen bg-navy-950 pt-20 pb-16 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-teal-500/15 border border-teal-500/25 mb-4">
            <Users size={28} className="text-teal-400" />
          </div>
          <h1 className="text-4xl font-black text-white mb-3">Team</h1>
          <p className="text-slate-400">Who can see this workspace, and what they can do in it.</p>
        </div>

        {orgs.length === 0 ? (
          <div className="bg-navy-900 border border-white/10 rounded-2xl p-8 text-center text-slate-400 text-sm">
            You are not a member of a workspace yet. Analyses stay private to your account
            until you belong to one.
          </div>
        ) : (
          <div className="space-y-5">
            {orgs.length > 1 && (
              <select
                value={orgId} onChange={e => setOrgId(e.target.value)}
                className="w-full bg-navy-900 border border-white/10 rounded-lg px-3 py-2 text-white text-sm"
              >
                {orgs.map(o => <option key={o.id} value={o.id}>{o.name} — you are {o.role}</option>)}
              </select>
            )}

            <div className="bg-navy-900 border border-white/10 rounded-2xl overflow-hidden">
              <div className="px-5 py-3 border-b border-white/10 flex items-center gap-2">
                <h2 className="text-white font-semibold text-sm">Members</h2>
                <span className="text-slate-500 text-xs">{members.length}</span>
              </div>
              {members.length === 0 ? (
                <p className="px-5 py-5 text-slate-500 text-sm">No members loaded.</p>
              ) : members.map(m => (
                <div key={m.email} className="px-5 py-3 border-b border-white/5 last:border-0 flex flex-wrap items-center gap-3">
                  <span className="text-slate-200 text-sm truncate flex-1 min-w-0">{m.email}</span>
                  {/* A pending invite is not a member, and the list must not
                      let the two read the same. */}
                  {m.status !== 'active' && (
                    <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-gold-500/10 text-gold-300 border border-gold-500/25">
                      {m.status}
                    </span>
                  )}
                  {canSetRole ? (
                    <select
                      value={m.role} onChange={e => changeRole(m.email, e.target.value as Role)}
                      className="bg-navy-950 border border-white/10 rounded-lg px-2 py-1 text-slate-300 text-xs"
                    >
                      {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  ) : (
                    <span className="text-slate-400 text-xs">{m.role}</span>
                  )}
                </div>
              ))}
            </div>

            {canInvite ? (
              <div className="bg-navy-900 border border-white/10 rounded-2xl p-5 space-y-3">
                <h2 className="text-white font-semibold text-sm flex items-center gap-2">
                  <UserPlus size={15} className="text-teal-400" /> Invite a colleague
                </h2>
                <div className="flex flex-wrap gap-2">
                  <input
                    type="email" value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="name@company.com"
                    className="flex-1 min-w-[200px] bg-navy-950 border border-white/10 rounded-lg px-3 py-2 text-white text-sm"
                  />
                  <select
                    value={role} onChange={e => setRole(e.target.value as Role)}
                    className="bg-navy-950 border border-white/10 rounded-lg px-3 py-2 text-white text-sm"
                  >
                    {ROLES.filter(r => r !== 'owner').map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <button
                    onClick={invite} disabled={busy || !email.includes('@')}
                    className="flex items-center gap-2 bg-gold-500 hover:bg-gold-400 disabled:opacity-40 text-navy-950 font-semibold rounded-lg px-4 py-2 text-sm transition-colors"
                  >
                    {busy ? <Loader2 size={15} className="animate-spin" /> : <UserPlus size={15} />} Invite
                  </button>
                </div>
                {note && <p className="text-slate-400 text-xs">{note}</p>}
                {error && <p className="text-danger-400 text-xs">{error}</p>}
              </div>
            ) : (
              <div className="flex items-start gap-2.5 p-4 rounded-xl bg-white/5 border border-white/10">
                <ShieldCheck size={16} className="text-slate-400 flex-shrink-0 mt-0.5" />
                <p className="text-slate-400 text-sm">
                  You are {me?.role} in this workspace. Inviting colleagues and changing roles
                  needs admin or owner.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
