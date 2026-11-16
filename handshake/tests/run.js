/* Node tests: the browser parser must agree with ifcopenshell (tests/truth.json),
 * and the checks must reach the expected verdicts on the demo exports.
 * Run: node tests/run.js   (regenerate truth with tests/ground_truth.py) */
const fs = require("fs"), path = require("path"), vm = require("vm");
const IfcLite = require("../ifc-lite.js"), Checks = require("../checks.js");
const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../schema-data.js"), "utf8"), ctx);
const schemas = ctx.window.IFC_SCHEMAS;
const truth = JSON.parse(fs.readFileSync(path.join(__dirname, "truth.json"), "utf8"));

let failed = 0, passed = 0;
function ok(cond, msg) { if (cond) passed++; else { failed++; console.error("FAIL: " + msg); } }
function eq(a, b, msg) { ok(JSON.stringify(a) === JSON.stringify(b), msg + "\n   got      " + JSON.stringify(a) + "\n   expected " + JSON.stringify(b)); }

const files = {
  "depot_ARC_modeller-a.ifc": "../samples/depot_ARC_modeller-a.ifc",
  "depot_ARC_modeller-b.ifc": "../samples/depot_ARC_modeller-b.ifc",
  "depot_ARC_for-fabricator_2x3.ifc": "../samples/depot_ARC_for-fabricator_2x3.ifc",
  "Building-Architecture.ifc": "../../example_files/Building-Architecture.ifc",
};
const models = {};
for (const [name, rel] of Object.entries(files)) {
  const text = fs.readFileSync(path.join(__dirname, rel), "utf8");
  const m = models[name] = IfcLite.parse(text, { name, size: text.length });
  const t = truth[name];
  eq(m.schema, IfcLite.normaliseSchema(t.schema), name + ": schema");
  eq(m.entityCount, t.entityCount, name + ": instance count");
  eq(Object.entries(m.typeCounts).sort(), Object.entries(t.typeCounts).sort(), name + ": per-class counts");
  eq(m.project.guid, t.project, name + ": project GlobalId");
  let mismatched = 0;
  for (const [guid, el] of Object.entries(t.elements)) {
    const mine = m.byGuid[guid];
    if (!mine || mine.type !== el.type || mine.name !== el.name ||
        JSON.stringify(Object.keys(mine.props).sort()) !== JSON.stringify(el.props)) {
      mismatched++;
      if (mismatched < 4) console.error("   element differs:", guid, el.type, el.name, mine && Object.keys(mine.props).sort(), el.props);
    }
  }
  eq(mismatched, 0, name + ": elements, names and property keys match ifcopenshell (" + Object.keys(t.elements).length + " elements)");
}

// String decoding
eq(IfcLite.decodeString("B\\X2\\00FC\\X0\\ro"), "Büro", "X2 escape");
eq(IfcLite.decodeString("it''s \\X\\E9"), "it's é", "quote and X escape");
ok(Object.keys(models["depot_ARC_modeller-a.ifc"].elements.find(e => e.type === "IFCDOOR").props).includes("Büro_Türliste.Türnummer"), "umlaut property set decoded");

// Type inheritance: walls 1-2 get FireRating from their wall type.
const A = models["depot_ARC_modeller-a.ifc"], B = models["depot_ARC_modeller-b.ifc"], X = models["depot_ARC_for-fabricator_2x3.ifc"];
const w1 = A.elements.find(e => e.name === "Wall W-01");
ok(w1.props["Pset_WallCommon.FireRating"] && w1.props["Pset_WallCommon.FireRating"].inherited, "type-inherited property");
eq(w1.props["Pset_WallCommon.LoadBearing"].v, "TRUE", "boolean value");

// Schema knowledge
ok(Checks.isSubtype(schemas, "IFC4", "IFCWALLSTANDARDCASE", "IfcWall"), "subtype resolution");
ok(!Checks.isSubtype(schemas, "IFC4", "IFCDOOR", "IfcWall"), "non-subtype");
const loss = Checks.classesMissingIn(schemas, A, "IFC2X3");
eq(loss.filter(l => l.kind === "element").map(l => l.type + ":" + l.count).sort(), ["IfcChimney:1", "IfcGeographicElement:1", "IfcShadingDevice:2"], "IFC4 classes with no IFC2x3 equivalent");
eq(Checks.unknownClasses(schemas, A), [], "no unknown classes in a clean file");

// Export comparison: B is the same model from an older exporter.
const cmp = Checks.compareExports(schemas, A, B);
eq(cmp.shared, A.elements.length, "all elements shared by GlobalId");
eq(cmp.lost.map(l => `${l.cls} ${l.name} ${l.count}`), ["IfcDoor Pset_DoorCommon.FireRating 4", "IfcSpace Pset_SpaceCommon.Reference 3"], "properties dropped by the older exporter");
eq(cmp.reordered.map(l => `${l.cls} ${l.name} ${l.count}`), ["IfcWall Pset_WallCommon 6"], "property order differences");
eq(Checks.compareExports(schemas, A, A).lostTotal, 0, "a file does not differ from itself");

eq(Checks.compareExports(schemas, A, X).retyped.map(l => `${l.cls}>${l.name}:${l.count}`).sort(), ["IfcChimney>IfcBuildingElementProxy:1", "IfcGeographicElement>IfcBuildingElementProxy:1", "IfcShadingDevice>IfcBuildingElementProxy:2"], "class changes across IFC versions are reported");

// Coverage
eq(Checks.coverage(schemas, A, { cls: "IfcDoor", pset: "Pset_DoorCommon", prop: "FireRating" }), { total: 4, have: 4, missing: [] }, "coverage full");
eq(Checks.coverage(schemas, B, { cls: "IfcDoor", pset: "Pset_DoorCommon", prop: "FireRating" }).have, 0, "coverage none");

// Verdicts
const fabricator = { id: "r1", name: "Fabricator", accepts: ["IFC2X3"], basis: "confirmed", requires: [] };
const client = { id: "r2", name: "Client", accepts: ["IFC4"], basis: "confirmed", view: "ReferenceView",
  requires: [{ cls: "IfcDoor", pset: "Pset_DoorCommon", prop: "FireRating" }] };
const base = { schemas, baseline: Checks.toolchainKey(A), siblings: [A, B, X], log: [] };
eq(Checks.evaluate(A, fabricator, base).verdict, "blocked", "IFC4 to an IFC2x3-only recipient is blocked");
ok(Checks.evaluate(A, fabricator, base).checks.find(c => c.id === "schema").loss.length > 0, "blocked verdict lists what a downgrade loses");
eq(Checks.evaluate(X, fabricator, base).verdict, "clear", "IFC2x3 export to the fabricator is clear");
eq(Checks.evaluate(A, client, base).verdict, "clear", "good IFC4 export to the client is clear");
eq(Checks.evaluate(B, client, base).verdict, "blocked", "export missing a required property is blocked");
ok(Checks.evaluate(B, client, base).checks.some(c => c.id === "toolchain" && c.level === "warn"), "older exporter is flagged against the baseline");
ok(Checks.evaluate(B, client, base).checks.some(c => c.id === "drift" && c.level === "warn"), "drift against sibling export is flagged");
eq(Checks.evaluate(X, client, base).verdict, "blocked", "IFC2x3 to an IFC4-only recipient is blocked");
const assumed = Object.assign({}, fabricator, { basis: "assumed" });
eq(Checks.evaluate(X, assumed, base).verdict, "check", "an unconfirmed recipient profile never yields a clear verdict");
const log = [{ recipientId: "r1", schema: "IFC2X3", toolchain: Checks.toolchainKey(X), outcome: "failed", file: "old.ifc", when: "2026-11-01T10:00:00", note: "" }];
eq(Checks.evaluate(X, fabricator, Object.assign({}, base, { log })).verdict, "blocked", "a recorded failure blocks the same combination next time");

// Requirements parsing
eq(Checks.parseRequirements("IfcDoor: Pset_DoorCommon.FireRating\n\nnonsense").requirements.length, 1, "requirement parsing");
eq(Checks.parseRequirements("nonsense").invalid, ["nonsense"], "invalid requirement reported");
ok(Checks.passport(A, fabricator, Checks.evaluate(A, fabricator, base), "abc").includes("BLOCKED"), "passport text");

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
