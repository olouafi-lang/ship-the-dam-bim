# Research report: why model deliveries fail at the handover

*November 2026. Scope: exchange of building models between organisations using IFC and related formats. Evidence: the Ship the BIM codebase, one practitioner interview, schema data computed from ifcOpenShell 0.9, and published sources listed at the end.*

**Status of the evidence.** The interview is a single case. Schema figures were computed directly and are reproducible (`handshake/tools/build_schema_data.py`). Published sources were located by web search in November 2026; re-read them before quoting.

## 1. The question

Ship the BIM set out to answer: *do language and naming differences between native models and IFC deliveries cause rejected deliveries?* The interview suggests a wider question is the useful one:

> When a model leaves one organisation and fails at another, what was different between the two ends?

Language is one possible difference. Software versions, exchange schema, export settings and unstated expectations are others.

## 2. Concepts

**IFC and its versions.** IFC is the open exchange schema maintained by buildingSMART and standardised as ISO 16739. Three generations are in circulation: IFC2x3 (2006), IFC4 (ISO 16739:2013) and IFC4.3, published as ISO 16739-1:2024 in March 2024 and extended to roads, rail and bridges [1]. A file declares exactly one schema in its header. Software that does not implement that schema cannot read the file reliably.

**The versions are not supersets.** Computed from the schemas shipped with ifcOpenShell:

| | Entity classes | Not in the previous version | Removed from the previous version |
|---|---|---|---|
| IFC2x3 | 653 | | |
| IFC4 | 776 | 237 | 114 |
| IFC4.3 | 876 | 116 | 16 |

A model that uses `IfcChimney`, `IfcShadingDevice` or `IfcGeographicElement` cannot be expressed in IFC2x3 without turning those elements into generic proxies. Tessellated geometry (`IfcTriangulatedFaceSet`) has no IFC2x3 form either. This is the mechanism behind the interviewee's complaint that exporting to an older version loses detail.

**Model view definitions.** A view (Coordination View, Reference View, Design Transfer View) is a subset of the schema agreed for a purpose. The view is named in the file header. Two IFC4 files with different views can differ in geometry type and content.

**The file header.** Every IFC file states its schema, view, timestamp, author, the authoring application and the exporter ("preprocessor") version. buildingSMART's forum notes there has been little guidance on filling these fields, and its validation service has been adding a header policy check [2]. The header is the only place a file records what produced it, and almost no workflow reads it.

**Requirements: EIR/AIA, IDS, bSDD.** Clients state what data they need in an information requirements document (EIR; AIA in Germany). IDS 1.0, a machine-readable format for those requirements, became a final buildingSMART standard in June 2024 [3]. bSDD is buildingSMART's dictionary service for classes and properties, with translations. Germany's federal BIM-Portal publishes property definitions, object templates and AIA modules [4].

**Text encoding.** IFC STEP files are 7-bit. Characters such as ü or é must be escaped (`\X2\00FC\X0\`). Exporters that write raw characters produce files that some importers garble or reject. This is the one place where language becomes a file-opening problem.

## 3. What the code experiment showed

Detailed evidence is in the [retrospective](01-retrospective.md). The findings that matter for research:

1. **Rule checking against a profile is tractable and cheap.** A few hundred lines of Python on ifcOpenShell do it. IDS now standardises the rule format, and free and commercial IDS checkers exist. A new product in this space competes with a standard.
2. **Automated "fixing" is unsafe as designed.** Choosing the first allowed value satisfies the check and falsifies the model. Any correction of model data needs a human decision and a record.
3. **Translation was aimed at the wrong layer.** Standard IFC property names are English by definition (`Pset_DoorCommon.FireRating`). Localisation belongs in dictionaries and in the user interface. Writing German terms into property values changes data that other software matches on.
4. **LLM explanation without evidence is filler.** Guidance was generated from the rule name alone, so it could not be specific to the model.
5. **A readiness percentage hides coverage.** Rules that examined no elements and rules that flagged everything both distorted the score.

## 4. What the interview showed

One senior BIM engineer at an international practice, modelling in English, delivering NWD and IFC from Revit, Rhino and Civil 3D. Paraphrased; no quotation is authorised.

**Incident A: exports that differed inside one team.** Models exported to Navisworks format showed parameters correctly for some files and missing or reordered for others. The client noticed when reviewing the set together and rejected it. After about a week of tests involving the whole team, the cause was found: people had different versions of the exporter plug-in installed, and one intermediate version had defects. Everyone updated and re-exported.

**Incident B: a recipient who could not open the file.** A supplier's detailing software failed on the IFC. The sender could open it without trouble. Around ten variants were sent over a week before one worked. The supplier's software was an old release that did not support the newer IFC version.

**Shared features.**

- The cause was a version difference, once on the sending side and once on the receiving side.
- The recipient found the problem. Internal checks had passed.
- Diagnosis took far longer than the fix.
- Each happened once, and each cost about a working week spread over several people.
- The lasting workarounds are manual: regular version audits across offices and time zones, and a separate export per recipient.
- The residual pain is the audit effort, lost detail in older IFC, and several copies of the same model.
- A client budget line absorbs the cost. The delay to other submissions is what hurts.

Public forums corroborate incident A as a known pattern: missing Revit parameters in Navisworks resolved by installing the matching exporter utility, which is distributed separately from Revit [5]. On incident B, current Tekla documentation still lists IFC2x3 as the recommended schema for reference import, with IFC4 supported [6].

## 5. Relevant research

- **Cost of poor interoperability.** NIST estimated $15.8 billion per year for the US capital facilities industry in 2002, two-thirds borne by owners and operators [7]. The figure is old and US-only, and it is still the most cited anchor.
- **IFC exchange in practice.** Lai and Deng (2018) exported and re-imported architectural, structural and MEP models between tools and found that software represents the same geometry, properties and relations differently, and misreads objects from other disciplines [8]. Their conclusion matches incident B: a valid file is not the same as a usable one.
- **Validation.** buildingSMART's validation service checks STEP syntax, schema compliance and normative rules; its bSDD check is listed as disabled in the open-source repository [2]. It answers "is this a correct IFC file", which is necessary and different from "can this recipient use it".

**Gap.** Standards and tools cover *file against schema* and *file against requirement*. We did not find a tool that checks *file against a specific recipient's software*, or *export against the team's own other exports*. That absence needs a proper competitor review before it is relied on.

## 6. Technical insights from the prototype

1. **The checks that matter can run without a server.** A 300-line STEP reader in the browser extracts the header, class counts and property sets. It matches ifcOpenShell on all four test files (instance counts, per-class counts, element names and property keys).
2. **Downgrade loss is computable in advance.** Comparing the classes used in a file with the target schema gives a list of what cannot survive a re-export, before anyone exports.
3. **Exports of one model can be compared by GlobalId.** Elements keep their identifiers across exports, so missing properties, reordered property sets and changed classes can be reported per element class.
4. **The exporter fingerprint is already in the file.** Pinning one fingerprint as the project baseline turns version drift into a visible warning.
5. **Recipient knowledge is small and durable.** A few fields per recipient (versions accepted, how we know, required properties) plus a log of what opened and what failed replace the trial-and-error loop.
6. **Limits.** The reader handles plain `.ifc` only. It cannot read NWD or other proprietary formats, where drift can only be tracked through the installed toolchain. It does not validate geometry or prove that any particular software will open a file.

## 7. Product opportunities

| Opportunity | Evidence | Risk |
|---|---|---|
| Recipient-aware preflight | Incident B; schema differences | Recipient profiles must be gathered; cold start |
| Export drift detection | Incident A; forum reports | Proprietary formats need a workstation agent |
| Delivery record (what was sent to whom, with a hash) | Multiple copies per recipient; no provenance in the old fixer | Overlaps with CDE platforms |
| Downgrade loss preview | Interviewee's complaint about older IFC | Exporter behaviour varies; a preview is an estimate |
| IDS-based requirement checks | Standard exists | Crowded; best treated as an import feature |
| Multilingual naming assistance | Original hypothesis; BIM-Portal | Unvalidated; one interview found no such pain |

## 8. Open questions

1. How often do version incidents occur across a larger sample? Both of ours happened once.
2. Does the language problem appear where the interviewee's context differs: German-language public projects with an AIA from the BIM-Portal?
3. Who would buy: the delivering practice, or the client who receives twenty teams' models?
4. Would IT policy allow a workstation add-in that reports installed exporter versions?
5. Can recipient capability be shared across firms (a public register of what each software release opens), or is it always learned per project?
6. What do existing checkers and CDEs already do at the recipient end?

## Sources

1. ISO, *ISO 16739-1:2024* — https://www.iso.org/standard/84123.html ; coverage: https://bimplus.co.uk/bim-in-brief-02-04-24-ifc-4-3-standard-published
2. buildingSMART validation service — https://github.com/buildingSMART/validate ; https://forums.buildingsmart.org/t/validation-service-updates/4992 ; header discussion: https://forums.buildingsmart.org/t/about-ifc-header-section/2522
3. IDS 1.0 — https://www.buildingsmart.org/information-delivery-specification-ids-gains-approval-as-candidate-standard/ ; final approval reported at https://www.ingenieur.de/fachmedien/bauingenieur/digitalisierung-bauingenieur/neuer-standard-ids-v1-0-von-buildingsmart/
4. BIM-Portal overview — https://www.baunetzwissen.de/integrales-planen/tipps/news/gebuendelte-informationen-im-bim-portal-9976724
5. Navisworks parameter loss and exporter utility — https://ukcommunity.arkance.world/hc/en-us/articles/21574623309586-Navisworks-2024-Revit-Parameters-Missing-in-Navisworks ; https://forums.autodesk.com/t5/navisworks-forum/revit-to-navisworks-element-parameters-lost/m-p/6054747
6. Tekla Structures IFC reference import — https://support.tekla.com/doc/tekla-structures/2025/int_ifc_import ; https://support.tekla.com/doc/tekla-structures/2026/rel_int_enhanced_ifc_interoperability
7. Gallaher et al., *Cost Analysis of Inadequate Interoperability in the U.S. Capital Facilities Industry*, NIST GCR 04-867 (2004) — https://nvlpubs.nist.gov/nistpubs/gcr/2004/NIST.GCR.04-867.pdf
8. Lai, H. and Deng, X. (2018), "Interoperability analysis of IFC-based data exchange between heterogeneous BIM software", *Journal of Civil Engineering and Management* 24(7) — https://journals.vilniustech.lt/index.php/JCEM/article/view/6132
