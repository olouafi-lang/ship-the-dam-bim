/* checks.js
 * The delivery checks. Pure functions over parsed models (see ifc-lite.js),
 * recipient profiles and the delivery log, so they can be tested without a UI.
 *
 * Every check is deterministic and explains itself. Nothing here guesses a
 * value or edits a model.
 */
(function (root) {
  "use strict";

  var SCHEMA_LABEL = { IFC2X3: "IFC2x3", IFC4: "IFC4", IFC4X3: "IFC4.3" };
  var SCHEMA_ORDER = ["IFC2X3", "IFC4", "IFC4X3"];

  function label(schema) { return SCHEMA_LABEL[schema] || schema; }

  // Case-insensitive lookup tables per schema: UPPER -> ProperName.
  var upperCache = {};
  function upperMap(schemas, schema) {
    if (!upperCache[schema]) {
      var map = {}, src = schemas[schema] || {};
      Object.keys(src).forEach(function (k) { map[k.toUpperCase()] = k; });
      upperCache[schema] = map;
    }
    return upperCache[schema];
  }

  function properName(schemas, schema, upper) {
    return upperMap(schemas, schema)[upper] || upper;
  }

  /** True when `type` (any case) is `ancestor` or one of its subtypes in `schema`. */
  function isSubtype(schemas, schema, type, ancestor) {
    var src = schemas[schema];
    if (!src) return type.toUpperCase() === ancestor.toUpperCase();
    var cur = upperMap(schemas, schema)[type.toUpperCase()];
    var want = ancestor.toUpperCase();
    while (cur) {
      if (cur.toUpperCase() === want) return true;
      cur = src[cur];
    }
    return type.toUpperCase() === want;
  }

  /** What a file's exporter says about itself. */
  function fingerprint(model) {
    var app = model.applications[0] || {};
    return {
      schema: model.schema,
      view: model.view,
      exporter: model.header.preprocessor || [app.fullName, app.version].filter(Boolean).join(" "),
      authoringTool: model.header.originatingSystem,
      author: model.header.author.join(", "),
      organization: model.header.organization.join(", "),
      timeStamp: model.header.timeStamp
    };
  }

  function toolchainKey(model) {
    var f = fingerprint(model);
    return [f.authoringTool, f.exporter].join(" | ");
  }

  /**
   * Classes used in the file that the target schema does not define.
   * These are what a re-export to that schema has to drop or flatten.
   */
  function classesMissingIn(schemas, model, target) {
    var have = upperMap(schemas, target);
    if (!schemas[target] || !schemas[model.schema]) return null;
    var out = [];
    Object.keys(model.typeCounts).forEach(function (t) {
      if (have[t]) return;
      var known = upperMap(schemas, model.schema)[t];
      if (!known) return; // not a class of the file's own schema either; reported separately
      out.push({
        type: known,
        count: model.typeCounts[t],
        kind: isSubtype(schemas, model.schema, t, "IfcProduct") ? "element"
          : isSubtype(schemas, model.schema, t, "IfcRoot") ? "object" : "resource"
      });
    });
    var rank = { element: 0, object: 1, resource: 2 };
    out.sort(function (a, b) { return rank[a.kind] - rank[b.kind] || b.count - a.count; });
    return out;
  }

  /** Classes in the file that its own declared schema does not define. */
  function unknownClasses(schemas, model) {
    if (!schemas[model.schema]) return [];
    var have = upperMap(schemas, model.schema);
    return Object.keys(model.typeCounts).filter(function (t) { return !have[t]; })
      .map(function (t) { return { type: t, count: model.typeCounts[t] }; });
  }

  /** How many instances of a class carry a non-empty property. */
  function coverage(schemas, model, req) {
    var total = 0, have = 0, missing = [];
    var key = req.pset + "." + req.prop;
    model.elements.forEach(function (el) {
      if (!isSubtype(schemas, model.schema, el.type, req.cls)) return;
      total++;
      var p = el.props[key];
      if (p && String(p.v).trim() !== "") have++;
      else if (missing.length < 5) missing.push(el.name || el.guid);
    });
    return { total: total, have: have, missing: missing };
  }

  /**
   * Compare two exports of the same model, element by element (by GlobalId).
   * Returns the property values `ref` carries that `other` lacks, the reverse,
   * and property sets whose properties come in a different order.
   */
  function compareExports(schemas, ref, other) {
    var shared = 0, onlyRef = 0, onlyOther = 0;
    var lost = {}, gained = {}, reordered = {}, retyped = {};
    function bump(map, cls, name) {
      var k = cls + "\u0000" + name;
      map[k] = (map[k] || 0) + 1;
    }
    ref.elements.forEach(function (a) {
      var b = other.byGuid[a.guid];
      if (!b) { onlyRef++; return; }
      shared++;
      var cls = properName(schemas, ref.schema, a.type);
      if (a.type !== b.type) bump(retyped, cls, properName(schemas, other.schema, b.type));
      Object.keys(a.props).forEach(function (k) { if (!b.props[k]) bump(lost, cls, k); });
      Object.keys(b.props).forEach(function (k) { if (!a.props[k]) bump(gained, cls, k); });
      Object.keys(a.order).forEach(function (ps) {
        var x = a.order[ps], y = b.order[ps];
        if (!y || x.length !== y.length) return;
        var same = x.slice().sort().join("\u0001") === y.slice().sort().join("\u0001");
        if (same && x.join("\u0001") !== y.join("\u0001")) bump(reordered, cls, ps);
      });
    });
    other.elements.forEach(function (b) { if (!ref.byGuid[b.guid]) onlyOther++; });
    function rows(map) {
      return Object.keys(map).map(function (k) {
        var parts = k.split("\u0000");
        return { cls: parts[0], name: parts[1], count: map[k] };
      }).sort(function (p, q) { return q.count - p.count || (p.cls + p.name < q.cls + q.name ? -1 : 1); });
    }
    var sum = function (r) { return r.reduce(function (s, x) { return s + x.count; }, 0); };
    var l = rows(lost), g = rows(gained), r = rows(reordered), t = rows(retyped);
    return {
      shared: shared, onlyRef: onlyRef, onlyOther: onlyOther,
      lost: l, gained: g, reordered: r, retyped: t,
      lostTotal: sum(l), gainedTotal: sum(g), reorderedTotal: sum(r), retypedTotal: sum(t),
      sameToolchain: toolchainKey(ref) === toolchainKey(other)
    };
  }

  /** Parse "IfcDoor: Pset_DoorCommon.FireRating" lines into requirement objects. */
  function parseRequirements(text) {
    var out = [], bad = [];
    String(text || "").split(/\n/).forEach(function (line) {
      var t = line.trim();
      if (!t) return;
      var m = /^([A-Za-z0-9_]+)\s*:\s*([^.]+)\.(.+)$/.exec(t);
      if (m) out.push({ cls: m[1].trim(), pset: m[2].trim(), prop: m[3].trim() });
      else bad.push(t);
    });
    return { requirements: out, invalid: bad };
  }

  function formatRequirements(reqs) {
    return (reqs || []).map(function (r) { return r.cls + ": " + r.pset + "." + r.prop; }).join("\n");
  }

  /**
   * Evaluate one export for one recipient.
   * ctx: { schemas, baseline (toolchain key or ""), siblings [models of the same project], log [entries] }
   * Returns { verdict: "blocked" | "check" | "clear", checks: [...] }.
   */
  function evaluate(model, recipient, ctx) {
    var schemas = ctx.schemas, checks = [];
    function add(id, level, title, detail, extra) {
      var c = { id: id, level: level, title: title, detail: detail || "" };
      if (extra) Object.keys(extra).forEach(function (k) { c[k] = extra[k]; });
      checks.push(c);
    }
    var fp = fingerprint(model);
    var accepts = recipient.accepts || [];
    var assumed = recipient.basis !== "confirmed";

    // 1. Is it an IFC file at all?
    if (!model.isStep || model.schema === "UNKNOWN") {
      add("format", "block", "Not a readable IFC STEP file", "No ISO-10303-21 header or FILE_SCHEMA was found. Send a plain .ifc file.");
    }

    // 2. Schema the recipient's software can open.
    if (accepts.length === 0) {
      add("schema", "warn", "No accepted IFC version recorded for this recipient",
        "Ask which IFC versions their software imports and record the answer under Recipients.");
    } else if (accepts.indexOf(model.schema) !== -1) {
      add("schema", assumed ? "warn" : "pass",
        "File is " + label(model.schema) + ", which the recipient " + (assumed ? "is assumed to accept" : "has confirmed"),
        assumed ? "Nobody has confirmed this with the recipient yet. A short test file settles it before the real delivery."
          : (recipient.confirmedOn ? "Confirmed on " + recipient.confirmedOn + "." : ""));
    } else {
      var targets = accepts.slice().sort(function (a, b) { return SCHEMA_ORDER.indexOf(b) - SCHEMA_ORDER.indexOf(a); });
      var target = targets[0];
      var loss = classesMissingIn(schemas, model, target);
      var detail = "The recipient accepts " + accepts.map(label).join(" or ") + ". Their software will likely refuse this file or open it empty.";
      var extra = { target: target };
      if (loss && loss.length) {
        var inst = loss.reduce(function (s, x) { return s + x.count; }, 0);
        detail += " Re-exporting as " + label(target) + " is not free: " + inst + " instance" + (inst === 1 ? "" : "s") + " of " +
          loss.length + " class" + (loss.length === 1 ? "" : "es") + " in this file do not exist in " + label(target) + ".";
        extra.loss = loss;
      } else if (loss) {
        detail += " Every class used in this file also exists in " + label(target) + ", so a re-export should keep the same structure.";
      }
      add("schema", "block", "Recipient cannot open " + label(model.schema), detail, extra);
    }

    // 3. Classes the file's own schema does not know (a broken or mislabelled export).
    var unknown = unknownClasses(schemas, model);
    if (unknown.length) {
      add("unknown", "warn", unknown.length + " class" + (unknown.length === 1 ? "" : "es") + " not defined in " + label(model.schema),
        "The header declares " + (model.schemaRaw || "no schema") + ", but the file uses " +
        unknown.slice(0, 6).map(function (u) { return u.type; }).join(", ") + (unknown.length > 6 ? " and more" : "") +
        ". Strict importers reject files like this.");
    }

    // 4. Model view definition.
    if (recipient.view) {
      var want = recipient.view.toLowerCase().replace(/[\s_]/g, "");
      var got = model.view.toLowerCase().replace(/[\s_]/g, "");
      if (!model.view) add("view", "warn", "No model view declared in the file header", "The recipient asks for " + recipient.view + ".");
      else if (got.indexOf(want) === -1) add("view", "warn", "Model view is " + model.view + ", recipient asks for " + recipient.view,
        "A different view changes which geometry and data the exporter writes. Check the export setup.");
      else add("view", "pass", "Model view " + model.view + " matches", "");
    }

    // 5. What happened last time: the delivery log.
    var history = (ctx.log || []).filter(function (e) { return e.recipientId === recipient.id && e.schema === model.schema; });
    var failed = history.filter(function (e) { return e.outcome === "failed" && e.toolchain === toolchainKey(model); })[0];
    var opened = history.filter(function (e) { return e.outcome === "opened" && e.toolchain === toolchainKey(model); })[0];
    if (failed) {
      add("history", "block", "The recipient could not open the last file like this",
        failed.file + " (" + label(failed.schema) + ", same exporter) was recorded as failed on " + failed.when.slice(0, 10) + "." +
        (failed.note ? " Note: " + failed.note : ""));
    } else if (opened) {
      add("history", "pass", "A file with this IFC version and exporter opened fine before",
        opened.file + " was recorded as opened on " + opened.when.slice(0, 10) + ".");
    }

    // 6. Exporter matches the project baseline.
    if (ctx.baseline) {
      if (toolchainKey(model) === ctx.baseline) add("toolchain", "pass", "Exported with the project's pinned toolchain", fp.exporter);
      else add("toolchain", "warn", "Exported with a different toolchain than the project baseline",
        "This file: " + (fp.authoringTool || "unknown tool") + ", " + (fp.exporter || "unknown exporter") + ". Baseline: " + ctx.baseline.replace(" | ", ", ") +
        ". Different exporter versions are a known cause of exports that differ from an identical model.");
    } else if (!fp.exporter && !fp.authoringTool) {
      add("toolchain", "warn", "The file does not say what exported it", "FILE_NAME in the header has no authoring tool or exporter. Drift between team members cannot be traced.");
    }

    // 7. Another export of the same model carries more data.
    var worst = null;
    (ctx.siblings || []).forEach(function (sib) {
      if (sib === model || sib.schema !== model.schema) return;
      var cmp = compareExports(schemas, sib, model);
      if (cmp.shared && cmp.lostTotal > 0 && (!worst || cmp.lostTotal > worst.cmp.lostTotal)) worst = { sib: sib, cmp: cmp };
    });
    if (worst) {
      add("drift", "warn", worst.cmp.lostTotal + " property value" + (worst.cmp.lostTotal === 1 ? "" : "s") + " missing compared with another export of this model",
        worst.sib.name + " carries them on the same elements. Top gaps: " +
        worst.cmp.lost.slice(0, 3).map(function (x) { return x.cls + " " + x.name + " (" + x.count + ")"; }).join("; ") + ".",
        { against: worst.sib.name });
    }

    // 8. Properties this recipient needs.
    (recipient.requires || []).forEach(function (req, idx) {
      var cov = coverage(schemas, model, req);
      var name = req.cls + " → " + req.pset + "." + req.prop;
      if (cov.total === 0) add("req" + idx, "info", name + ": no " + req.cls + " in this file", "");
      else if (cov.have === cov.total) add("req" + idx, "pass", name + ": on all " + cov.total, "");
      else add("req" + idx, cov.have === 0 ? "block" : "warn", name + ": on " + cov.have + " of " + cov.total,
        "Missing on " + cov.missing.join(", ") + (cov.total - cov.have > cov.missing.length ? " and " + (cov.total - cov.have - cov.missing.length) + " more" : "") + ".");
    });

    // 9. File size.
    if (recipient.maxMb) {
      var mb = model.size / 1048576;
      if (mb > recipient.maxMb) add("size", "warn", "File is " + mb.toFixed(1) + " MB, limit is " + recipient.maxMb + " MB", "");
    }

    // 10. Text encoding. IFC is 7-bit; raw umlauts and accents break strict importers.
    if (model.rawNonAscii > 0) {
      add("encoding", "warn", model.rawNonAscii + " raw non-ASCII character" + (model.rawNonAscii === 1 ? "" : "s") + " in the file",
        "IFC text must escape characters such as ü or é (\\X2\\00FC\\X0\\). Unescaped characters show up as garbled names or stop older importers.");
    }

    // 11. Property sets outside the standard, for information.
    var custom = {};
    model.elements.forEach(function (el) {
      Object.keys(el.order).forEach(function (ps) { if (!/^(Pset_|Qto_)/.test(ps)) custom[ps] = (custom[ps] || 0) + 1; });
    });
    var customNames = Object.keys(custom);
    if (customNames.length) {
      add("custom", "info", customNames.length + " office-specific property set" + (customNames.length === 1 ? "" : "s"),
        customNames.slice(0, 5).join(", ") + (customNames.length > 5 ? " and more" : "") +
        ". The recipient only finds these if they know the names. Share the list with the delivery.");
    }

    var verdict = checks.some(function (c) { return c.level === "block"; }) ? "blocked"
      : checks.some(function (c) { return c.level === "warn"; }) ? "check" : "clear";
    return { verdict: verdict, checks: checks };
  }

  /** Plain-text delivery passport: what was sent, to whom, and what was known. */
  function passport(model, recipient, result, sha) {
    var fp = fingerprint(model), lines = [];
    var mark = { pass: "[ok]   ", info: "[info] ", warn: "[check]", block: "[BLOCK]" };
    var verdict = { blocked: "BLOCKED", check: "CHECK FIRST", clear: "NO KNOWN BLOCKERS" }[result.verdict];
    lines.push("DELIVERY PASSPORT");
    lines.push("Verdict:    " + verdict);
    lines.push("File:       " + model.name + " (" + (model.size / 1024).toFixed(0) + " kB)");
    if (sha) lines.push("SHA-256:    " + sha);
    lines.push("Project:    " + (model.project.name || "unnamed") + (model.project.guid ? " [" + model.project.guid + "]" : ""));
    lines.push("Recipient:  " + recipient.name + (recipient.software ? " / " + recipient.software : ""));
    lines.push("Accepts:    " + ((recipient.accepts || []).map(label).join(", ") || "not recorded") + " (" + (recipient.basis === "confirmed" ? "confirmed" : "assumed") + ")");
    lines.push("");
    lines.push("Export fingerprint");
    lines.push("  IFC version:    " + label(fp.schema) + (fp.view ? ", " + fp.view : ""));
    lines.push("  Authoring tool: " + (fp.authoringTool || "not stated"));
    lines.push("  Exporter:       " + (fp.exporter || "not stated"));
    lines.push("  Exported by:    " + (fp.author || "not stated") + (fp.timeStamp ? " on " + fp.timeStamp : ""));
    lines.push("  Contents:       " + model.entityCount + " instances, " + model.elements.length + " elements");
    lines.push("");
    lines.push("Checks");
    result.checks.forEach(function (c) {
      lines.push("  " + mark[c.level] + " " + c.title);
      if (c.detail) lines.push("          " + c.detail);
      (c.loss || []).slice(0, 12).forEach(function (l) { lines.push("            - " + l.type + " x" + l.count + " (" + l.kind + ")"); });
    });
    lines.push("");
    lines.push("Checked in the browser by Handshake (prototype). A clear verdict means no known blocker, not a guarantee.");
    return lines.join("\n");
  }

  var api = {
    label: label, isSubtype: isSubtype, properName: properName, fingerprint: fingerprint, toolchainKey: toolchainKey,
    classesMissingIn: classesMissingIn, unknownClasses: unknownClasses, coverage: coverage,
    compareExports: compareExports, parseRequirements: parseRequirements, formatRequirements: formatRequirements,
    evaluate: evaluate, passport: passport, SCHEMA_ORDER: SCHEMA_ORDER
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Checks = api;
})(typeof window !== "undefined" ? window : globalThis);
