# Handshake: product direction

*The improved concept, derived from the [retrospective](01-retrospective.md) and one practitioner interview. A working prototype is in [`handshake/`](../handshake/README.md).*

## One sentence

Handshake tells a delivery team, before they send a model, whether the person receiving it will be able to open and use it, and whether it matches what the rest of the team exports.

## What changed from Ship the BIM

| | Ship the BIM | Handshake |
|---|---|---|
| Unit of analysis | One file | One file for one recipient |
| Core question | Does the model meet the rules? | Will this delivery work at the other end? |
| Main failure addressed | Naming and language mismatch (assumed) | Version mismatch at export and at import (reported) |
| Output | Readiness score | A verdict per export and recipient, with reasons |
| AI | Agent, three providers, translation | None in the checks |
| Editing the model | Auto-fix | Never |
| Data location | Server, database, external LLMs | The user's browser |
| Memory | Approved terms | Recipient profiles and delivery outcomes |

## Assumptions challenged

1. **"The model is the problem."** In both reported incidents the model was correct. The export and import environments differed.
2. **"A checker's job is to find more issues."** The team had already checked several times. The gap was a check from the recipient's point of view.
3. **"AI should fix the file."** The old fixer wrote invented values. The useful intelligence here is bookkeeping: remembering what each recipient can open.
4. **"A score communicates readiness."** A percentage hid both false failures and unchecked rules. Recipients either can use the file or cannot.
5. **"Language is the differentiator."** Unproven. It stays as a small module until an interview supports it.
6. **"Models can be uploaded."** Many project contracts say otherwise. Local processing removes the objection.

## Users and jobs

**Primary: BIM lead or senior engineer in a delivering practice.** Sends models to clients, suppliers and consultants, across offices.

- *When I export for a supplier, tell me whether their software can open this version, so I do not send ten variants.*
- *When several people export models for one submission, tell me whether their exports are consistent, so the client does not find out first.*
- *When I have to export an older version, tell me what will be lost, so I can warn the recipient.*
- *When I keep several copies of one model for different recipients, keep track of which went where.*

**Secondary: client-side information manager.** Receives models from many teams. Would use the same checks on arrival, and could publish their own recipient profile for senders.

## The product

### 1. Recipient register
For each recipient: software, IFC versions it opens, model view asked for, properties needed, size limit, and whether each fact is **confirmed** or **assumed**. An assumed profile can never produce a clear verdict. Profiles can be exported and shared, so a client can hand one to every delivery team.

### 2. Preflight matrix
Exports down the side, recipients across the top. Each cell is *Blocked*, *Check first* or *No known blockers*, with the reasons one click away. Checks, all deterministic:

- file version against versions the recipient opens
- what a re-export to an older version would lose, by class and count
- classes the declared version does not define
- model view declared against the view requested
- exporter against the project's pinned baseline
- properties missing compared with another export of the same model
- required properties present on every relevant element
- text encoding that older importers reject
- office-specific property sets the recipient will not know to look for

### 3. Export drift
Reads the exporter fingerprint from every file and compares exports of the same model element by element: missing properties, reordered property sets, changed classes. For formats the tool cannot read, a team toolchain table shows who is off the project baseline. In the product this table is filled by a small workstation add-in at export time.

### 4. Delivery passport and log
A plain-text record per delivery: file hash, fingerprint, recipient, checks and verdict. The log records what happened next. "Could not open" blocks the same combination next time. "Opened" confirms the recipient profile. This is the part that compounds: every delivery makes the next check better.

### 5. Requirements import (later)
Read an IDS file into a recipient's required properties. Use the standard; do not compete with it.

## What it will not do

- Edit a model, or suggest values for missing data.
- Claim that a file will open. A clear verdict means no known blocker.
- Send model content to a server or a language model.
- Produce a single readiness score.

## Why this could win

- **It occupies a gap.** Existing validators compare a file with a schema or a requirement. We did not find one that compares a file with a named recipient, though that needs a proper competitor review.
- **It is cheap to keep running.** No server, no upload, nothing to approve with IT for the core checks. That matters because the incidents are rare.
- **Its data gets more valuable with use.** Recipient profiles and outcomes are the asset. Across many firms they become a shared map of what each software release can open.

## Risks

| Risk | Mitigation |
|---|---|
| Evidence is one interview | Five more interviews before further build; include German public-sector projects |
| Incidents are rare, so willingness to pay is low | Free local tool; charge for team features and shared recipient data |
| Recipient profiles are empty at the start | Seed from the first failed delivery; let clients publish theirs |
| Proprietary formats (NWD) are opaque | Track the toolchain, not the file; workstation add-in |
| Downgrade preview differs from real exporter behaviour | Label it an estimate; validate against real re-exports |
| CDE vendors add the feature | Stay format-neutral and vendor-neutral; interoperate |

## Validation plan

1. **Return to the interviewee** (a follow-up call was agreed). Replay both incidents in the prototype. Ask what they would have done differently and what would stop adoption.
2. **Five more incident interviews** using the neutral question set in the [playbook](02-playbook.md): two recipients, two senders from other firms, one German public-sector project.
3. **Real-file trial.** Three practices run their next delivery through the prototype. Measure: blockers found before sending, false blockers, time spent.
4. **Decision point.** Continue if at least three of six interviews report a version or recipient incident in the past year and one practice asks to keep using the tool.

## Metrics

- Deliveries returned by a recipient for a reason the tool checks (target: none)
- Share of recipient profiles that are confirmed
- Variants sent per successful delivery
- Share of recorded deliveries with a known outcome

## Roadmap

| Stage | Contents |
|---|---|
| Now (prototype) | Browser reader, recipient register, matrix, drift comparison, passport, log |
| Next | IDS import, ifcZIP, larger files via a worker, shareable recipient profiles, export of the log |
| Later | Workstation add-in for exporter versions, team sync, public register of software capabilities |
| Only with evidence | Multilingual naming assistance |
