# Ship the BIM: retrospective

*Written November 2026, nine months after the hackathon. Based on the repository history, a re-run of the original code against its own sample model, and one written interview with a senior BIM engineer.*

## Summary

Ship the BIM was built in about 26 hours (31 January 11:27 to 1 February 13:39, 44 commits). It checks an IFC model against a rule profile, scores its "readiness", translates terminology into German and writes "fixes" back into the file.

Three conclusions:

1. **The engineering was faster than the learning.** A full stack shipped in a weekend: FastAPI, ifcOpenShell, an MCP server, three LLM providers, Supabase, a Next.js dashboard. Nobody outside the team was asked whether the problem existed until nine months later.
2. **The first practitioner we asked described a different problem.** Asked for the last time a language or naming difference caused trouble, the interviewee described two incidents that had nothing to do with language: exporter versions that differed inside the team, and a supplier whose software could not open the IFC version sent. Each cost about a week. Both were found by the recipient.
3. **The product's most impressive feature is its most dangerous one.** Re-running the code shows that auto-fix writes invented values into models, and that 12 of the 16 issues reported on the sample model are artefacts of the checker.

The rest of this document gives the evidence.

## What was built

| Layer | What it does | State at the end |
|---|---|---|
| Deterministic scanner | Checks property existence, allowed values, numeric minimum, per IFC class | Works, with two logic defects (below) |
| AI agent (LangGraph + MCP) | Evaluates free-text `CUSTOM` rules by calling IFC tools | Never runs in the demo: the only profile has no `CUSTOM` rule |
| Reasoner | Deduplicates, asks an LLM for "why it matters", translates terms to German via bSDD then LLM | Works; guidance is generated from the rule name alone |
| Fixer | Writes suggested values and German terms into the IFC | Works mechanically; writes wrong data |
| Storage | Supabase tables for reports, issues, terminology | Works |
| Frontend | Dashboard, report tabs, terminology review, exports | Works; parts show hard-coded content |

## What worked

- **A deterministic core.** The team put rule checking in plain code and kept the LLM for explanation. That split is correct and survives into the new product.
- **Rules as data.** A profile is a JSON list of class, property set, property and allowed values. This is the same shape as buildingSMART's IDS, reached independently.
- **Human approval for terminology.** Proposed terms have a status, and approved terms are fed into the next scan. It is the one place where the tool learns from its user.
- **Cutting on evidence.** Manus was integrated at 06:26 for a sponsor track and removed at 10:49 because it was slow and less accurate. The team measured and reversed within four hours.
- **It shipped.** Upload, scan, report, export and fix all run end to end.

## What failed

Each item below was reproduced by running the repository's scanner and fixer on `example_files/Building-Architecture.ifc`.

### 1. Most reported issues are not issues

The sample model produces 16 issues and a readiness score of 20%.

- **6 are false positives from one bug.** `_has_property` returns `False` whenever a rule has no property set. Rules DE-S01 (space `LongName`) and DE-W02 (wall `Material`) therefore fail for every element in every model. The two spaces do have long names.
- **6 are not failures at all.** Naming and terminology rules with no allowed values flag every element as "Review", and each flag counts as a failed check.
- **4 are real.** Two spaces lack `Reference` and `OccupancyType`.

A user who trusts the score is misled. A user who checks the first few rows stops trusting the tool.

### 2. Auto-fix invents data

When a value is missing, the suggested fix is the first entry of the rule's allowed list. In the committed `Building-Architecture_fixed.ifc`:

- A **living room** and an **entry hall** both received `OccupancyType = Office`.
- Had the model contained doors, each would have received `FireRating = EI30`, a fire-safety value nobody assessed.
- The German translation of the room name was written as a new property called `LongName` inside `Pset_SpaceCommon`. That property does not belong there, and the rule it was meant to satisfy still fails.
- The score rose from 20% to 30%.
- The file header is unchanged. The fixed file still says it was exported from SketchUp in November 2024. Nothing records that it was modified, by what, or why.

The feature makes a model pass a check by making it less true. In a domain where model data feeds fire strategy and procurement, that is a liability.

### 3. Rules that check nothing pass silently

The sample model has no doors. Four of eleven rules examined zero elements, and the report does not say so.

### 4. The interface claims more than the system does

- The rule detail panel shows an "AI suggestion" with 85% confidence. It comes from a function named `getMockSuggestion`.
- The terminology table fills its "Type" and "Source" columns from fixed arrays.
- "BCF export" produces a zip of CSV files, which no BCF tool can read.
- Category scores are assigned by searching rule names for the words "type", "name" and "property".
- The README lists the AI agent as a headline feature. It does not execute with the shipped profile.

### 5. No tests, one model

There is no test in the repository and one sample file. Every defect above would have been caught by one assertion on that file.

## What was missing

- **A user.** No interview, observation or real delivery informed the build. The profile is called "Germany Demo Profile" and cites no client requirement.
- **A real requirement document.** The team never held an actual AIA/EIR, so the rule set encodes guesses.
- **The other end of the exchange.** The product looks only at the file. It knows nothing about who receives it or what they open it with. The interview shows that this is where deliveries break.
- **Provenance.** No hash, no record of what was sent to whom, no trace of edits.
- **A privacy position.** Models are uploaded to a server and element names are sent to third-party LLMs. Many AEC contracts forbid this.

## The assumption that broke

The project assumed that models fail delivery because modellers name things in their own language and the receiving check expects other names. It may be true for German public-sector projects. It is not what the one practitioner we asked experiences.

| | Assumed | Reported by the interviewee |
|---|---|---|
| Cause | Language and naming | Software versions, on both sides of the exchange |
| Where it breaks | Property names in the model | Export step and import step |
| Who finds it | The modeller, with a checker | The client and the supplier |
| Cost | Rework of properties | About a week per incident, whole team involved |
| Frequency | Every delivery | Once each |
| Current fix | Mapping tables | Version checks by hand; one export per recipient |
| What still hurts | Translation effort | Keeping versions aligned across offices; losing detail in older IFC; many copies of one model |

Three caveats keep this honest. It is one interview. The interviewee works in English at an international practice, the setting where language problems are least likely. And both incidents happened once, so the pain is sharp but rare.

## Process mistakes

1. **Build first, ask later.** The interview came nine months after the code.
2. **Sponsor-driven scope.** Three LLM providers, an agent framework and MCP were added partly because sponsors offered them. None was required by a user need.
3. **A demo profile as ground truth.** With no real requirement, the team could not tell a real failure from an artefact.
4. **No time reserved to look at output.** The last twelve hours went to UI and README. Nobody opened the fixed file.
5. **The interview sheet led the witness.** Question 4 asks about "a language or naming difference" and gives an example. The interviewee answered a different question anyway, which is the most useful thing in the dataset. The sheet also went out with a placeholder where the return address should be.
6. **Consent.** The interviewee agreed to a follow-up call and did not tick the box allowing anonymous quotation. Nothing in these documents quotes or names them. Publication of quotes needs their agreement first.

## Lessons

1. Ask for the last real incident before choosing the problem. Then build for the incident, even when it contradicts the pitch.
2. A checker must be right before it is clever. Test every rule on a model whose answer is known.
3. Never write a value into a model that a person has not chosen.
4. Report what was not checked as clearly as what failed.
5. If the screen shows a number, it must come from the data.
6. A delivery has two ends. Model the recipient as carefully as the file.

The follow-on documents turn these into a method ([playbook](02-playbook.md)), background ([research report](03-research-report.md)), an [essay](04-essay.md), a [product direction](05-product-concept.md) and a working [prototype](../handshake/README.md).
