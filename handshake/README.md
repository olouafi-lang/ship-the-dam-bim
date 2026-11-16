# Handshake (prototype)

Checks each model export against the person who has to open it, before it is sent. It is the rebuilt product direction that came out of the Ship the BIM retrospective; the reasoning is in [`docs/05-product-concept.md`](../docs/05-product-concept.md).

## Run it

Open `index.html` in a browser. There is no build step, no server and no API key. It opens with three synthetic demo exports and three example recipients.

Files are read inside the browser tab. Nothing is uploaded.

## What it does

| View | Use |
|---|---|
| **Deliveries** | Grid of exports against recipients. Each cell is *Blocked*, *Check first* or *No known blockers*. Open a cell for the reasons, the export fingerprint and a delivery passport you can copy or download. |
| **Export drift** | What exported each file, compared with a pinned project baseline. Exports of the same model are compared element by element: missing properties, reordered property sets, changed classes. A team toolchain table covers formats the tool cannot read. |
| **Recipients** | What each recipient's software opens, what they need, and whether that is confirmed or assumed. |
| **Delivery log** | What was sent to whom. Marking an outcome feeds the next check: a recorded failure blocks the same combination, a recorded success confirms the recipient profile. |

## Try the two incidents it was designed around

1. **A recipient who cannot open the file.** In *Deliveries*, open `depot_ARC_modeller-a.ifc` → *Steel fabricator*. The file is IFC4 and the recipient opens IFC2x3. The check lists the classes a re-export would lose.
2. **Exports that differ inside one team.** In *Export drift*, `depot_ARC_modeller-b.ifc` was made with an older exporter. Seven property values are missing and six property sets are in a different order.

Then drop in your own `.ifc` files. `../example_files/Building-Architecture.ifc` works.

## Files

| File | Purpose |
|---|---|
| `ifc-lite.js` | IFC STEP reader: header, class counts, elements with property values (including type-inherited ones) |
| `checks.js` | The checks, as pure functions |
| `app.js`, `styles.css`, `index.html` | Interface and local storage |
| `schema-data.js` | Entity classes of IFC2x3, IFC4 and IFC4.3, generated from ifcOpenShell |
| `samples/`, `samples.js` | Synthetic demo exports (invented project and invented authoring tool) |
| `tools/` | Generators for the schema data and the samples |
| `tests/` | Node tests; the reader is compared with ifcOpenShell |

## Tests

```bash
node tests/run.js
```

49 assertions. The reader must match ifcOpenShell on four files for instance count, per-class counts, element names and property keys. To regenerate the reference after changing samples:

```bash
pip install ifcopenshell
```

```bash
python3 tools/build_samples.py
```

```bash
python3 tests/ground_truth.py samples/*.ifc ../example_files/Building-Architecture.ifc > tests/truth.json
```

## Limits

- Reads plain `.ifc` only. No ifcZIP, ifcXML, NWD or native formats.
- Loads the whole file into memory. Tested on files up to a few hundred kilobytes; large models need a streaming reader in a worker.
- Does not check geometry or full schema validity. Use the buildingSMART validation service for that.
- The downgrade loss list shows classes missing from the target version. Real exporters may map some of them differently.
- A clear verdict means no known blocker. It does not prove the recipient's software opens the file.
- Recipients, baseline and log are kept in this browser's local storage only.
- The team toolchain table is typed by hand.
