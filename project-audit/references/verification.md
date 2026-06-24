# Adversarial Verification Protocol

The single most important phase. Most "bugs" a finder reports are real; a meaningful fraction are plausible-but-wrong (the finder misread a guard, missed a caller that handles the case, or invented a payload field). Reporting those destroys trust and wastes fix effort. Every finding must survive this gate to be reported.

## The rule
**A finding is guilty until proven real.** The verifier's job is to *refute* it, not to confirm it. Under uncertainty, the verdict is "not a real bug."

## Single-verifier protocol (default, for Medium/Low)
Spawn one independent agent per finding with a prompt shaped like:

> Here is a claimed bug: `<finding: file:line, scenario, why it's claimed>`.
> Re-read the actual code path yourself. Try to REFUTE this claim. Check specifically:
> - Is the triggering condition actually reachable? Trace the callers.
> - Is there a guard, default, try/catch, or upstream check that already handles it?
> - Does the cited line/field/behavior actually exist as described?
> - Would the bad outcome really occur, or is the finder wrong about the runtime behavior?
> Default to `isReal: false` if you are not clearly convinced. Return `{isReal, confidence, evidence, corrected_severity}`.

The verifier MUST open the real files — never rule from the finding's summary alone.

## Multi-lens panel (for Critical / High — money, security, data loss)
Spawn 2–3 verifiers, each with a **different lens**, and keep the finding only on a **majority "real"**:
- **Correctness lens** — does the logic actually do the wrong thing?
- **Reproduction lens** — construct the concrete input/sequence that triggers it; if you can't, it's not real.
- **Security/impact lens** — assume an adversary or worst-case timing; does the blast radius hold up?

Diverse lenses catch failure modes that identical refuters miss. Three identical skeptics is redundancy; three different ones is coverage.

## What survives
- Verdict `isReal: true` with concrete evidence (the reproducing path/input).
- The verifier may **downgrade or upgrade** severity — take their corrected severity.
- If verifiers disagree on a Critical, keep it but mark it "needs human confirmation" rather than silently dropping or auto-fixing.

## What gets dropped
- Anything the verifier refutes, or can't construct a trigger for.
- "Defensive hardening with no actual failure path" → not a bug; at most a Low note.
- Findings whose cited code/field doesn't exist (finder hallucination).

## Anti-patterns
- ❌ Verifying from the finder's description without reading the code.
- ❌ One verifier rubber-stamping (prompt for refutation, not confirmation).
- ❌ Letting a confident-sounding finding skip verification because it "obviously" looks real — the obvious-looking ones are exactly where misreads hide.
- ❌ Dropping a survivor just because the fix is hard. Severity ≠ effort.
