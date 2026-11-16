# Playbook: from hackathon build to evidence-led product

A reusable method, written from one experiment: a weekend build (Ship the BIM), one practitioner interview that contradicted it, and a rebuild (Handshake). Use it for any project that starts as a technical idea in a specialist field.

Each stage has a goal, steps, an output and a gate. Do not pass a gate on enthusiasm.

## Stage 0: Write the bet down

**Goal:** make the assumption visible so it can be wrong.

1. Write one sentence: *"[Who] loses [what] when [situation], because [cause]."*
   Ours was: "BIM modellers lose deliveries when they model in their own language, because the receiving check expects different names."
2. List what must be true for that sentence to hold. Mark each item as *known*, *heard* or *guessed*.
3. Write what evidence would change your mind.

**Output:** a half-page bet. **Gate:** at least one "guessed" item is scheduled to be tested before any code.

*What we did instead:* skipped it. Every item was a guess and none was labelled.

## Stage 1: Collect incidents

**Goal:** five real, recent cases told step by step.

1. Recruit people who do the work, across at least two roles (sender and receiver) and two company types.
2. Ask about the last time something went wrong at the handover. **Do not name your hypothesis in the question.** Use this core set:
   - What was the last delivery that came back or could not be used? What happened, step by step?
   - Who noticed first, and how?
   - How was it fixed? How long did it take, and who was involved?
   - How often does it happen?
   - What do you do now to prevent it? What is still annoying about that?
   - Who pays when it happens?
3. Only after those answers, ask about your hypothesis directly.
4. Prefer a 20-minute call to a form. A form gets tidy answers; a call gets the detail around them.
5. Handle consent properly: separate boxes for quoting, follow-up and naming. Use only what was ticked. Check the sheet for placeholders before it goes out.

**Output:** an incident table with one row per case: trigger, where it broke, who found it, cost, frequency, workaround, residual pain.
**Gate:** at least three incidents share a cause. If they do not, keep interviewing or narrow the audience.

*What we learned:* one interview was enough to show the bet was shaky. It is not enough to choose the next bet. Treat n=1 as a direction to test.

## Stage 2: Decide what the incidents say

**Goal:** separate what you hoped from what you heard.

1. Put the assumption and the reports side by side in a table (cause, place, finder, cost, frequency, current fix).
2. For each incident, ask whether your product would have prevented it. Be literal.
3. Score the problem on two axes: cost per incident and frequency. Rare and expensive problems need a product that costs almost nothing to keep running. Frequent and cheap problems need speed.
4. Note who pays. If the cost is absorbed by someone else's budget, the buyer is not who you think.

**Output:** a one-page problem statement with the evidence behind each line.
**Gate:** you can name a real incident your product would have caught, and the person it happened to agrees.

## Stage 3: Smallest honest build

**Goal:** a tool that is correct on a known case.

1. **Get real inputs first:** a real file, a real requirement document, a real recipient. Synthetic data only for demos, and labelled as such.
2. **Deterministic first.** Anything that can be computed is computed. Use an LLM only for language tasks, and only on top of facts the code has already established.
3. **Build a ground-truth test before the feature.** For file parsing, compare against a reference implementation. For checks, write the expected verdict for a file you understand, then write the check.
4. **Report coverage.** Every result says how many items were examined. Zero examined is its own state.
5. **Never write unreviewed values.** A tool may propose. A person decides. Anything written records who, when and why.
6. **No decoration in the data path.** If a number or label appears on screen, it is computed. Placeholders are marked as placeholders.
7. **Decide the data boundary early.** For confidential project data, default to processing on the user's machine.

**Output:** a working tool plus tests that pass.
**Gate:** someone other than the author runs it on a real file and the result matches what they know to be true.

*What we did instead:* built upload-scan-score-fix in one pass, never opened the fixed file, and shipped a score in which 75% of the failures were artefacts.

## Stage 4: Review the output, not the code

**Goal:** catch the errors that only show in results.

1. Open every artefact the tool produces. Read it as the recipient would.
2. Pick ten results at random and verify each by hand.
3. Look for the flattering failure: did a metric improve because the thing got better, or because the tool changed what it measures?
4. Compare the README with what runs. Delete every claim that does not execute.

**Output:** a defect list with reproduction steps. **Gate:** no known wrong output in the default path.

## Stage 5: Put it back in front of the source

**Goal:** close the loop with the people from Stage 1.

1. Show the tool running on a case shaped like their incident.
2. Ask what they would have done differently that week if they had had it.
3. Ask what would stop them using it: installation rights, client rules, time.
4. Record the answers in the same incident table.

**Output:** a second-round note per interviewee. **Gate:** at least one person asks to try it on live work.

## Stage 6: Write it up while it is fresh

Produce four things within a week:

- **Retrospective:** what was built, what the evidence showed, defects with proof.
- **Playbook update:** change this document where it failed you.
- **Research note:** concepts, standards, sources, open questions.
- **Public piece:** one essay or post. Writing for outsiders exposes weak reasoning.

## Working with an AI model in this process

What worked in this experiment, and where it needs supervision.

| Task | Use | Guard |
|---|---|---|
| Code review of an old project | Ask it to run the code on the project's own sample and report what the output contains | Require reproduction steps for every finding |
| Reading an interview | Ask for an assumption-versus-report table | Check it kept the caveats: sample size, context, frequency |
| Building a prototype | Ask for a reference-checked parser and tests before UI | Run the tests yourself; open the result |
| Research | Ask for sources with links | Re-read sources before quoting; search summaries drift |
| Writing | Draft from the evidence table | Remove any claim you cannot trace to a row |

Three rules for the session itself:

1. Give it the primary material: the repository, the interview, the sample files. Summaries hide the interesting parts.
2. Ask it what it could not verify. Publish that list with the work.
3. Keep personal data out of outputs. Interviewee names and contact details stay in the source document.

## Checklists

**Before building**
- [ ] The bet is written in one sentence
- [ ] Five incidents collected, three share a cause
- [ ] A real file, a real requirement and a real recipient are in hand
- [ ] The data boundary is decided

**Before demoing**
- [ ] Every rule tested on a file with a known answer
- [ ] Every output file opened and read
- [ ] Zero-coverage results are visible
- [ ] No mock values on screen
- [ ] README matches behaviour

**Before publishing research**
- [ ] Consent boxes checked against what is used
- [ ] No names, employers or contact details
- [ ] Sample size and context stated next to every finding
- [ ] Sources re-read

## Anti-patterns seen in this project

- **Sponsor gravity:** adding a technology because it is offered. Ask which incident it prevents.
- **Score theatre:** a single percentage that moves when nothing real changed.
- **Fix by fabrication:** making a check pass by writing a plausible value.
- **Leading the witness:** putting the hypothesis in the interview question.
- **Demo profile as truth:** inventing the requirement and then validating against it.
- **Interview as epilogue:** talking to users after the build, to confirm.
