"""Write what ifcopenshell reads from each test file, as the reference the
browser parser is compared against. Usage: ground_truth.py file.ifc ... > truth.json"""
import collections
import json
import sys

import ifcopenshell
import ifcopenshell.util.element as eu

out = {}
for path in sys.argv[1:]:
    f = ifcopenshell.open(path)
    counts = collections.Counter(e.is_a().upper() for e in f)
    elements = {}
    for e in f.by_type("IfcObject"):
        if e.is_a("IfcProject"):
            continue
        psets = eu.get_psets(e, psets_only=True)
        keys = sorted(f"{ps}.{p}" for ps, props in psets.items() for p in props if p != "id")
        elements[e.GlobalId] = {"type": e.is_a().upper(), "name": e.Name or "", "props": keys}
    out[path.split("/")[-1]] = {
        "schema": f.schema, "entityCount": len(list(f)), "typeCounts": dict(counts), "elements": elements,
        "project": f.by_type("IfcProject")[0].GlobalId,
    }
json.dump(out, sys.stdout)
