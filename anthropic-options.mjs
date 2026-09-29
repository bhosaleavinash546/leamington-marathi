// ─────────────────────────────────────────────────────────────────────────────
// Options every Anthropic client in this app is built with.
//
// ANTHROPIC_WORKSPACE_ID. An API key created at the ORGANIZATION level (not
// inside a workspace) is refused by Anthropic with 400: "This API key is not
// scoped to a workspace, so this request must include the
// anthropic-workspace-id header". That stopped a management demo on 29 Sept
// 2026. Two fixes exist: use a key created inside a workspace, or name the
// workspace — this reads it from ANTHROPIC_WORKSPACE_ID (e.g. in
// .brainspark-local.env, which start-macos.command loads) and sends the header
// on every request. Unset, nothing is added and workspace keys work as before.
// ─────────────────────────────────────────────────────────────────────────────

export function workspaceId(env = process.env) {
  const id = String(env.ANTHROPIC_WORKSPACE_ID ?? '').trim();
  return id || null;
}

/** Extra constructor options for `new Anthropic({...})`. */
export function anthropicClientOptions(env = process.env) {
  const id = workspaceId(env);
  return id ? { defaultHeaders: { 'anthropic-workspace-id': id } } : {};
}
