---
id: 0013
status: open
opened: 2026-10-06
spawned_by: conversation (CR2 origin story)
tested_by: []
tags: [maintenance, review-cadence, era-drift]
---

# Guiding elements have threat models, and threat models age with the model era

The maintainer, on CR2's origin (2026-10-06, verbatim):

> "this is in large part a shift in my own approach to AI-driven development
> -- started with more oversight, now i have more trust and generally let
> claude go quite a bit more. especially in the Sonnet days, scaffolding was
> a huge problem. you'd ask for XYZ, and you'd get the scaffolding for XYZ +
> tests that do nothing but throw superficial green checkmarks, and it would
> look like everything was done until you went to run it xD hence CR2. H5 and
> P17 were borne out of the Opus era."

So CR2 is a Sonnet-era control in an Opus-era library: its "No exceptions"
is armor against a rationalization pattern that has since weakened, while
H5/P17 encode the newer trust level — and the A8 contest between them is
really two eras' threat models colliding in one document. General claim: an
element written against a model-generation-specific failure mode should
record that provenance, and `cairn review`'s staleness machinery has a
natural trigger nobody uses — **re-stamp rules when the model era shifts.**

Testable someday: tag elements with origin era; measure which eras' rules
agents actually cite vs route around.
