# Lightweight Decision Capture

Not every project starts with a full GVP workflow. Sometimes you just want to
capture decisions as you go and build a library over time. This guide covers a
lightweight approach that takes ~5 minutes after each planning session.

## The Approach

```
Brainstorm / plan normally
    ↓
After the session, invoke the decision-tracking skill (~5 min)
    ↓
DECISIONS.md accumulates across sessions
    ↓
Periodically, synthesize DECISIONS.md files into a GVP library
```

This is the on-ramp to GVP. You don't need a library to start capturing
decisions. You don't even need to install `gvp`. Just capture, accumulate,
and synthesize when you're ready.

## Step 1: Capture Decisions After Brainstorming

After any planning or design session with Claude, invoke the
`decision-tracking-markdown` skill (included in this repo at
`skills/decision-tracking-markdown.md`):

> "Can you capture the decisions we just made?"

The skill will:
1. Extract every decision from the conversation
2. Use **verbatim quotes** for rationale (never paraphrased)
3. Document considered alternatives and why they were rejected
4. Flag decisions missing rationale and ask you about them
5. Infer tentative GVP elements (goals, values, principles) if no library exists yet
6. Write or append to `DECISIONS.md`

This takes ~5 minutes and produces a structured record of everything you decided.

## Step 2: Accumulate Across Sessions

Each subsequent planning session for the same project appends a new section to
the same `DECISIONS.md`. Over time, you build a rich history:

```markdown
# My Project — Decisions

## Session: 2026-03-15 — Initial Architecture
### Use PostgreSQL
### REST API with Express
...

## Session: 2026-03-22 — Auth System Design
### JWT tokens over sessions
### Role-based access control
...

## Session: 2026-04-01 — Performance Optimization
### Add Redis caching layer
### Denormalize user profile queries
...
```

## Step 3: Synthesize into a GVP Library

When you have a few `DECISIONS.md` files — from one project or across
multiple projects — ask an agent to synthesize them into a GVP library:

> "Read all my DECISIONS.md files and synthesize the overarching goals,
> values, principles, and heuristics that emerge across projects. Create
> a GVP library from them."

This works because:
- Individual project decisions reveal **project-level** GVPs
- Patterns across multiple projects reveal **personal/org-level** GVPs
- The decision-tracking skill already infers tentative GVPs — synthesis
  refines them

After synthesis:
```bash
gvp init
# Copy the synthesized library into .gvp/library/
gvp validate
```

## Step 4: Graduate to the Full Workflow

Once you have a GVP library, you can adopt the
[full workflow](workflow.md) for new projects — or keep using
lightweight capture for quick sessions and the full workflow for
major initiatives. Both feed into the same library.

## Tools

### Decision Tracking Skill

The `decision-tracking-markdown` Claude skill is included at
`skills/decision-tracking-markdown.md`. It handles the capture process,
including verbatim rationale, alternatives tracking, and GVP mapping.

### Git Hook

Use `scripts/gvp-hook.sh` as a pre-commit hook to validate your GVP
library on every commit:

```bash
ln -sf ../../scripts/gvp-hook.sh .git/hooks/pre-commit
```

The hook runs `gvp validate`, warns about stale elements, and supports
`--coverage`, `--strict`, and `--ci` flags.

### Cross-Project Synthesis

When you've accumulated `DECISIONS.md` files across projects, collect them:

```bash
# Gather all decision docs
find ~/projects -name "DECISIONS.md" -exec echo {} \;

# Ask Claude to synthesize
# "Read these decision docs and identify the overarching GVPs..."
```

The patterns that emerge across projects — recurring values, consistent
principles, repeated heuristics — are your personal or organizational GVP
library.
