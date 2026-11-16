"""Build the synthetic demo exports used by the prototype.

All four files describe the same fictional project ("Riverside Depot") with
stable GlobalIds, the way one model looks when it is exported by different
people, with different exporter versions, for different recipients.
The authoring tool and exporter names are invented on purpose.

Run: python3 tools/build_samples.py   (writes samples/*.ifc and samples.js)
"""
import json
import os
import uuid

import ifcopenshell
import ifcopenshell.api
import ifcopenshell.api.owner.settings
import ifcopenshell.guid

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "samples")
NS = uuid.UUID("6f1d2c1e-0000-4000-8000-000000000001")


def gid(key):
    """Deterministic IFC GlobalId so every export shares element identity."""
    return ifcopenshell.guid.compress(uuid.uuid5(NS, key).hex)


def build(filename, schema, exporter, author, timestamp, view, degraded=False):
    f = ifcopenshell.api.run("project.create_file", version=schema)
    run = lambda *a, **k: ifcopenshell.api.run(a[0], f, **k)
    ifc4 = schema != "IFC2X3"

    def root(cls, key, name, **attrs):
        e = run("root.create_entity", ifc_class=cls, name=name)
        e.GlobalId = gid(key)
        for k, v in attrs.items():
            setattr(e, k, v)
        return e

    def pset(product, name, props, key):
        ps = run("pset.add_pset", product=product, name=name)
        ps.GlobalId = gid("pset:" + key + ":" + name)
        run("pset.edit_pset", pset=ps, properties=props)
        return ps

    # Owner history is mandatory in IFC2X3, so every export gets a user and application.
    person = run("owner.add_person", identification="modeller", family_name=author, given_name="")
    org = run("owner.add_organisation", identification="EE", name="Example Engineering")
    user = run("owner.add_person_and_organisation", person=person, organisation=org)
    app = run("owner.add_application", application_developer=org, version=exporter.split()[-1],
              application_full_name="ExampleCAD IFC Exporter", application_identifier="examplecad-ifc")
    ifcopenshell.api.owner.settings.get_user = lambda ifc: user
    ifcopenshell.api.owner.settings.get_application = lambda ifc: app

    project = root("IfcProject", "project", "Riverside Depot")
    run("unit.assign_unit")
    site = root("IfcSite", "site", "Site")
    building = root("IfcBuilding", "building", "Depot Building")
    storey = root("IfcBuildingStorey", "storey", "Level 00")
    run("aggregate.assign_object", products=[site], relating_object=project)
    run("aggregate.assign_object", products=[building], relating_object=site)
    run("aggregate.assign_object", products=[storey], relating_object=building)

    elements = []

    # Two walls inherit FireRating from their wall type, as many exporters do.
    wall_type = root("IfcWallType", "walltype", "WT-EXT-300 Concrete")
    pset(wall_type, "Pset_WallCommon", {"FireRating": "REI90"}, "walltype")
    for i in range(1, 7):
        w = root("IfcWall", f"wall{i}", f"Wall W-{i:02d}")
        props = {"Reference": f"W-{i:02d}", "IsExternal": i <= 4, "LoadBearing": i <= 4}
        if i > 2:
            props["FireRating"] = "REI90" if i <= 4 else "EI30"
        if degraded:  # older exporter writes the same properties in another order
            props = dict(reversed(list(props.items())))
        pset(w, "Pset_WallCommon", props, f"wall{i}")
        if i <= 2:
            run("type.assign_type", related_objects=[w], relating_type=wall_type)
        elements.append(w)

    for i in range(1, 5):
        d = root("IfcDoor", f"door{i}", f"Door D-{i:02d}")
        props = {"Reference": f"D-{i:02d}", "IsExternal": i == 1}
        if not degraded:  # older exporter silently drops this mapping
            props["FireRating"] = "EI30"
        pset(d, "Pset_DoorCommon", props, f"door{i}")
        # Office-specific property set, named in German with an umlaut.
        pset(d, "Büro_Türliste", {"Türnummer": f"T-{i:03d}", "Schließanlage": "SA-2"}, f"door{i}")
        elements.append(d)

    spaces = []
    for i, (name, long_name) in enumerate([("0.01", "Workshop"), ("0.02", "Parts store"), ("0.03", "Office")], 1):
        s = root("IfcSpace", f"space{i}", name, LongName=long_name)
        props = {"IsExternal": False, "PubliclyAccessible": i == 3}
        if not degraded:
            props = {"Reference": name, **props}
        pset(s, "Pset_SpaceCommon", props, f"space{i}")
        spaces.append(s)
    run("aggregate.assign_object", products=spaces, relating_object=storey)

    # Classes that only exist from IFC4 on. An IFC2X3 export has to turn them
    # into generic proxies, which is exactly the detail a recipient loses.
    extra = [("IfcChimney", "chimney", "Flue stack"), ("IfcShadingDevice", "shade1", "Brise-soleil south"),
             ("IfcShadingDevice", "shade2", "Brise-soleil west"), ("IfcGeographicElement", "tree", "Retained oak")]
    for cls, key, name in extra:
        e = root(cls if ifc4 else "IfcBuildingElementProxy", key, name)
        elements.append(e)

    run("spatial.assign_container", products=elements, relating_structure=storey)

    h = f.header
    h.file_description.description = (f"ViewDefinition [{view}]",)
    h.file_name.name = filename
    h.file_name.time_stamp = timestamp
    h.file_name.author = (author,)
    h.file_name.organization = ("Example Engineering",)
    h.file_name.preprocessor_version = exporter
    h.file_name.originating_system = "ExampleCAD 2026 (synthetic demo data)"
    h.file_name.authorization = "None"
    path = os.path.join(OUT, filename)
    f.write(path)
    return path


FILES = [
    ("depot_ARC_modeller-a.ifc", "IFC4", "ExampleCAD IFC Exporter 5.2.1", "Modeller A", "2026-11-09T09:12:00", "ReferenceView_V1.2", False),
    ("depot_ARC_modeller-b.ifc", "IFC4", "ExampleCAD IFC Exporter 5.1.0", "Modeller B", "2026-11-09T16:40:00", "ReferenceView_V1.2", True),
    ("depot_ARC_for-fabricator_2x3.ifc", "IFC2X3", "ExampleCAD IFC Exporter 5.2.1", "Modeller A", "2026-11-10T08:05:00", "CoordinationView_V2.0", False),
]

if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    bundle = []
    for args in FILES:
        p = build(*args)
        with open(p, encoding="utf-8") as fh:
            bundle.append({"name": args[0], "text": fh.read()})
        print("wrote", p, os.path.getsize(p), "bytes")
    with open(os.path.join(HERE, "..", "samples.js"), "w", encoding="utf-8") as fh:
        fh.write("// Generated by tools/build_samples.py. Synthetic demo exports, not a real project.\n")
        fh.write("window.DEMO_FILES = " + json.dumps(bundle, ensure_ascii=True) + ";\n")
