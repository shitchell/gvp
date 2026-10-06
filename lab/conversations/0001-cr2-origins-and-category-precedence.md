# Conversation 0001 — tie-breaks, CR2's origin, category precedence

> **With:** Shaun. **Date:** 2026-10-06. **Format:** verbatim quotes with
> minimal connective tissue; the maintainer's words are the data here
> (rationale-capture mandate: quote, never paraphrase).
> **Produced:** proposal `lab/proposals/0001-tiebreak-library/`, musings
> 0013/0014, probe P0003.

## Context

P0001 surfaced three contests (A4 extraction timing, A8 scaffolding
sign-off, A6 rigor allocation) and queued them for the maintainer per
`personal:P15`. This conversation is the ruling.

## On A4, and the real decision machinery (sliding threshold)

> "to be fair, a 'principle' is intentionally not always applicable. that's
> the point, there is some subjective judgment. it is not a rule. that said,
> a heuristic is. if they contradict, then the heuristic should always win
> since it does define a more rigid set of instructions. the heuristic at a
> minimum probably ought to be reworded. possibly the principle, though my
> ideal would be to leave it the same and re-inforce the idea that
> 'principle = sometimes true, sometimes not, use judgment'. the
> piece/pieces i use to differentiate: short-term vs long-term cost and
> anticipated need. and the cheaper it is to do now, the lower the threshold
> becomes for anticipated need (i.e.: if it takes ~10 extra chars and 5
> seconds to implement now and saves hours or days of work in the long-term
> should it become helpful, then i might need only 5% certainty we will need
> it; if it takes a little extra thought and planning and ~20 minutes now to
> implement + a whole extra class, then i might want ~50% certainty we might
> need it down the line (all numbers pulled out of my ass)). hence the
> judgment bit :p idk how to quantify all of that into a heuristic lol.
> maybe we need a less rigid form of heuristic lol or to just loosen the
> requirement on what a heuristic is? or to work that into the principle
> description? for the heuristic, i would say it's largely only relevant
> when the short-term cost is high and the anticipated need is low. but then
> that's kinda just what you get out of the principle if you consider the
> loose heuristic i just gave. could potentially collapse it all"

Driver's response (summary): don't loosen heuristics — a heuristic can be a
rigid procedure over subjective inputs (estimates are judgment, the
comparison is not), which preserves the hard/soft test. The threshold
matches what trial 3's runs did unprompted. Landed as the H3 rewrite.

## On A8 — CR2's origin story

> "this is in large part a shift in my own approach to AI-driven
> development -- started with more oversight, now i have more trust and
> generally let claude go quite a bit more. especially in the Sonnet days,
> scaffolding was a huge problem. you'd ask for XYZ, and you'd get the
> scaffolding for XYZ + tests that do nothing but throw superficial green
> checkmarks, and it would look like everything was done until you went to
> run it xD hence CR2. H5 and P17 were borne out of the Opus era. that said,
> i wouldn't say a 'throwawy consumer' is the same as 'scaffolding', at
> least, certainly not the type of scaffolding i was talking about in CR2."

> "so the thing being targeted was mostly just: 'stop building a broken
> shell/husk of a project/component when this step calls for the actual
> thing to be built'."

And, deciding the variant question by delegation:

> "well, i can imagine we might still use sonnet subagents in some
> development. so there's probably still consideration to be given to
> ensuring that the false completion scaffolding doesn't reappear. but i
> think there are better ways to resolve that without CR2."

> "as far as the variant, i'd let you pick (or try different approaches).
> you *probably* have more controlled data at this point on how specific
> variations affect agent behavior."

Driver's pick: variant A (honesty rule), hardened by a new
`code-testing:TH2` (prove every success definition falsifiable) — the
deterministic anti-husk defense, model-generation-proof, and already the
trials' own floor discipline.

## On A6 — principles as judgment

> "yeah, principles are judgment calls :p i'd prefer automated tests that
> are robust everywhere. 100% coverage. who wouldn't? but sometimes we
> don't get that, so... 'some people do not have good ideas, so they have
> principles' :p"

No patch to TP1/P16; the gap is delivery of category semantics, addressed by
the README preamble + `personal:R3`.

## On noticing tensions at all

> "perhaps there should be some rule or something where, if an agent isn't
> sure, it should read the description? but my suspicion is that there won't
> readily be a noticed 'feeling of uncertainty' unless prompted at every
> turn -- are you sure you know how to resolve this? are you sure now? what
> about this decision? is anything in tension? are you sure? what about
> this? :p perhaps that is a step for the parent agent to do? or one
> targeted review that tries to find those tensions and resolve them by
> peeking at the descriptions?"

Matches trial 3 (0/12 unprompted) + P0001 (prompted: near-total recall)
exactly; mechanized as the offline axes pass + bind-time injection
(roadmap 4.1/4.3), not per-turn interrogation (`ai-common:C4`).

## Working arrangement set in the same exchange

> "you are the driver now ... keep a file in your scratchpad for any
> questions you might have for me and a 2 bullet log of the last item done
> + what's running now, and watch it with glow formatting in a pane to the
> right"

> "i'd love if you made whatever tweaks you felt appropriate to my personal
> gvp lib *in a separate location*. because it's a copy and not the actual
> personal lib, you can just go ham."
