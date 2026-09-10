/**
 * What to tell someone when a CAD analysis fails.
 *
 * The panel used to give one piece of advice for every failure: "Ensure the API
 * server is running and ANTHROPIC_API_KEY is configured." That is right for a
 * missing key and wrong for everything else. On a deployment that runs with no
 * AI at all — which is how this ships to JLR — it is worse than unhelpful: a
 * process with no rule pack yet reads as "this tool needs AI", in front of the
 * person being shown that it does not.
 *
 * The server's own message is already clear and is shown above this line. This
 * only decides what to do about it.
 */
export function analysisErrorHint(message: string): string {
  if (/no deterministic rules exist/i.test(message)) {
    return 'This process has no rule pack yet, so it cannot be filled from the model. '
      + 'Pick one of the processes listed above, or cost it on its own form — every '
      + 'process here can be costed by hand.';
  }
  if (/ANTHROPIC_API_KEY|api key/i.test(message)) {
    return 'Set a key in .env, or leave Analysis mode on "Rules only — no AI call", '
      + 'which needs no key.';
  }
  if (/does not look like a|missing ISO-10303-21|not a valid|unsupported file/i.test(message)) {
    return 'The file itself could not be read. STEP (.step/.stp), IGES (.igs/.iges) '
      + 'and STL are supported — re-export from CAD as STEP AP214 if in doubt.';
  }
  if (/not a closed solid|free edge|open boundary/i.test(message)) {
    return 'This is a surface model, not a solid. Cost needs a volume, and an open '
      + 'shell has none — re-export it as a solid body, or stitch and thicken the '
      + 'surfaces in CAD first.';
  }
  if (/timed out|timeout/i.test(message)) {
    return 'The geometry kernel took too long on this model. Try again, or simplify '
      + 'the file — very large assemblies can exceed the limit.';
  }
  return 'Check the API server is running (<code>npm run server</code>).';
}
