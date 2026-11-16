/* ifc-lite.js
 * A small IFC (STEP physical file, ISO 10303-21) reader that runs in the
 * browser, so model files never leave the machine.
 *
 * It does not build geometry and does not validate against the schema. It
 * reads what a delivery check needs:
 *   - the header (schema, model view, exporter, authoring tool, author, time)
 *   - how many instances of each class the file holds
 *   - every rooted element with its GlobalId, name and property values,
 *     including properties inherited from the element's type
 *
 * Works as a browser global (window.IfcLite) and as a Node module (tests).
 */
(function (root) {
  "use strict";

  // ---- STEP string decoding -------------------------------------------------
  // IFC text is 7-bit. Anything else is escaped: \X2\00FC\X0\ (UTF-16),
  // \X4\0001F600\X0\ (UTF-32), \X\FC (ISO 8859-1), \S\c (code + 128).
  function decodeString(raw) {
    if (raw.indexOf("\\") === -1 && raw.indexOf("''") === -1) return raw;
    var s = raw.replace(/''/g, "'");
    s = s.replace(/\\X2\\([0-9A-Fa-f]*)\\X0\\/g, function (_, hex) {
      var out = "";
      for (var i = 0; i + 4 <= hex.length; i += 4) out += String.fromCharCode(parseInt(hex.substr(i, 4), 16));
      return out;
    });
    s = s.replace(/\\X4\\([0-9A-Fa-f]*)\\X0\\/g, function (_, hex) {
      var out = "";
      for (var i = 0; i + 8 <= hex.length; i += 8) out += String.fromCodePoint(parseInt(hex.substr(i, 8), 16));
      return out;
    });
    s = s.replace(/\\X\\([0-9A-Fa-f]{2})/g, function (_, hex) { return String.fromCharCode(parseInt(hex, 16)); });
    s = s.replace(/\\S\\(.)/g, function (_, c) { return String.fromCharCode(c.charCodeAt(0) + 128); });
    return s.replace(/\\\\/g, "\\");
  }

  // ---- Argument parser ------------------------------------------------------
  // Values come back as: string -> JS string, #12 -> {r:12}, .T. -> {e:"T"},
  // $ and * -> null, numbers -> number, IFCLABEL('x') -> {t:"IFCLABEL", v:[...]},
  // (a,b) -> array.
  function parseArgs(src) {
    var i = 0, n = src.length;

    function skipWs() { while (i < n && src.charCodeAt(i) <= 32) i++; }

    function value() {
      skipWs();
      var c = src[i];
      if (c === "'") {
        var start = ++i;
        while (i < n) {
          if (src[i] === "'") {
            if (src[i + 1] === "'") { i += 2; continue; }
            break;
          }
          i++;
        }
        var str = decodeString(src.slice(start, i));
        i++;
        return str;
      }
      if (c === "#") {
        var s0 = ++i;
        while (i < n && src.charCodeAt(i) >= 48 && src.charCodeAt(i) <= 57) i++;
        return { r: parseInt(src.slice(s0, i), 10) };
      }
      if (c === "$" || c === "*") { i++; return null; }
      if (c === "(") { i++; return list(); }
      if (c === ".") {
        var e0 = ++i;
        while (i < n && src[i] !== ".") i++;
        var en = src.slice(e0, i);
        i++;
        return { e: en };
      }
      if (c === '"') { // binary literal
        var b0 = ++i;
        while (i < n && src[i] !== '"') i++;
        i++;
        return src.slice(b0, i - 1);
      }
      var t0 = i;
      while (i < n && ",()".indexOf(src[i]) === -1 && src.charCodeAt(i) > 32) i++;
      var tok = src.slice(t0, i);
      skipWs();
      if (src[i] === "(" && /^[A-Za-z_]/.test(tok)) { i++; return { t: tok.toUpperCase(), v: list() }; }
      var num = Number(tok);
      return isNaN(num) ? tok : num;
    }

    function list() {
      var out = [];
      skipWs();
      if (src[i] === ")") { i++; return out; }
      while (i < n) {
        out.push(value());
        skipWs();
        if (src[i] === ",") { i++; continue; }
        if (src[i] === ")") { i++; break; }
        i++; // tolerate malformed input rather than loop forever
      }
      return out;
    }

    var top = [];
    skipWs();
    while (i < n) {
      top.push(value());
      skipWs();
      if (src[i] === ",") { i++; continue; }
      break;
    }
    return top;
  }

  function refs(v) {
    var out = [];
    if (Array.isArray(v)) for (var k = 0; k < v.length; k++) if (v[k] && typeof v[k] === "object" && "r" in v[k]) out.push(v[k].r);
    return out;
  }

  function showValue(v) {
    if (v === null || v === undefined) return "";
    if (typeof v === "string") return v;
    if (typeof v === "number") return String(v);
    if (Array.isArray(v)) return v.map(showValue).join(", ");
    if ("e" in v) return v.e === "T" ? "TRUE" : v.e === "F" ? "FALSE" : v.e === "U" ? "UNKNOWN" : v.e;
    if ("t" in v) return v.v.map(showValue).join(", ");
    if ("r" in v) return "#" + v.r;
    return "";
  }

  function normaliseSchema(raw) {
    var s = String(raw || "").toUpperCase().trim();
    if (s.indexOf("IFC4X3") === 0) return "IFC4X3";
    if (s.indexOf("IFC2X3") === 0) return "IFC2X3";
    if (s === "IFC4" || /^IFC4_ADD/.test(s)) return "IFC4";
    return s || "UNKNOWN";
  }

  var PROPERTY_TYPES = {
    IFCPROPERTYSINGLEVALUE: 1, IFCPROPERTYENUMERATEDVALUE: 1, IFCPROPERTYLISTVALUE: 1,
    IFCPROPERTYBOUNDEDVALUE: 1, IFCPROPERTYTABLEVALUE: 1, IFCPROPERTYREFERENCEVALUE: 1, IFCCOMPLEXPROPERTY: 1
  };

  /**
   * Parse IFC text.
   * @param {string} text  file content
   * @param {{name?: string, size?: number}} meta
   */
  function parse(text, meta) {
    meta = meta || {};
    var model = {
      name: meta.name || "model.ifc",
      size: meta.size || text.length,
      header: { description: [], name: "", timeStamp: "", author: [], organization: [], preprocessor: "", originatingSystem: "", authorization: "", schemas: [] },
      schemaRaw: "", schema: "UNKNOWN", view: "",
      applications: [],
      project: { guid: "", name: "" },
      entityCount: 0,
      typeCounts: {},
      elements: [],          // {id, type, guid, name, props:{ "Pset.Prop": {v, inherited} }, order:{ Pset: [Prop,...] }}
      byGuid: {},
      rawNonAscii: 0,
      isStep: /^\s*ISO-10303-21\s*;/.test(text.slice(0, 200)),
      warnings: []
    };

    var psets = {};        // id -> {name, props:[ids]}
    var props = {};        // id -> {name, value}
    var typeObjects = {};  // id -> [pset ids]
    var elementsById = {};
    var relProps = [];     // [ [objectIds], psetId ]
    var relTypes = [];     // [ [objectIds], typeId ]

    function header(stmt) {
      var m = /^([A-Z_]+)\s*\(([\s\S]*)\)\s*$/.exec(stmt);
      if (!m) return;
      var a = parseArgs(m[2]);
      var strs = function (v) { return Array.isArray(v) ? v.filter(function (x) { return typeof x === "string" && x !== ""; }) : []; };
      if (m[1] === "FILE_DESCRIPTION") model.header.description = strs(a[0]);
      else if (m[1] === "FILE_NAME") {
        model.header.name = showValue(a[0]);
        model.header.timeStamp = showValue(a[1]);
        model.header.author = strs(a[2]);
        model.header.organization = strs(a[3]);
        model.header.preprocessor = showValue(a[4]);
        model.header.originatingSystem = showValue(a[5]);
        model.header.authorization = showValue(a[6]);
      } else if (m[1] === "FILE_SCHEMA") model.header.schemas = strs(a[0]);
    }

    function data(stmt) {
      var m = /^#(\d+)\s*=\s*([A-Za-z0-9_]+)\s*\(/.exec(stmt);
      if (!m) return;
      var id = parseInt(m[1], 10), type = m[2].toUpperCase();
      model.entityCount++;
      model.typeCounts[type] = (model.typeCounts[type] || 0) + 1;

      var body = stmt.slice(m[0].length, stmt.lastIndexOf(")"));
      var a;

      if (PROPERTY_TYPES[type]) {
        a = parseArgs(body);
        props[id] = { name: showValue(a[0]), value: type === "IFCPROPERTYSINGLEVALUE" ? showValue(a[2]) : type === "IFCCOMPLEXPROPERTY" ? "(complex)" : showValue(a[2]) };
        return;
      }
      if (type === "IFCAPPLICATION") {
        a = parseArgs(body);
        model.applications.push({ version: showValue(a[1]), fullName: showValue(a[2]), identifier: showValue(a[3]) });
        return;
      }
      // Rooted entities start with a 22-character GlobalId.
      if (body.charCodeAt(0) !== 39 || body.charCodeAt(23) !== 39) return;

      if (type === "IFCRELDEFINESBYPROPERTIES") {
        a = parseArgs(body);
        if (a[5] && a[5].r) relProps.push([refs(a[4]), a[5].r]);
      } else if (type === "IFCRELDEFINESBYTYPE") {
        a = parseArgs(body);
        if (a[5] && a[5].r) relTypes.push([refs(a[4]), a[5].r]);
      } else if (type === "IFCPROPERTYSET") {
        a = parseArgs(body);
        psets[id] = { name: showValue(a[2]), props: refs(a[4]) };
      } else if (type === "IFCPROJECT") {
        a = parseArgs(body);
        model.project = { guid: showValue(a[0]), name: showValue(a[2]) };
      } else if (type.indexOf("IFCREL") === 0 || type.indexOf("IFCPROPERTY") === 0 || type === "IFCELEMENTQUANTITY") {
        return;
      } else if (/(TYPE|STYLE)$/.test(type)) {
        a = parseArgs(body);
        typeObjects[id] = refs(a[5]);
      } else {
        a = parseArgs(body);
        var el = { id: id, type: type, guid: showValue(a[0]), name: showValue(a[2]), props: {}, order: {} };
        elementsById[id] = el;
        model.elements.push(el);
      }
    }

    // ---- statement scanner ----
    var n = text.length, i = 0, start = 0, inString = false, section = "";
    while (i < n) {
      var c = text.charCodeAt(i);
      if (c > 126) model.rawNonAscii++;
      if (inString) {
        if (c === 39) inString = false; // a doubled quote simply re-enters the string
      } else if (c === 39) {
        inString = true;
      } else if (c === 47 && text.charCodeAt(i + 1) === 42) { // comment
        var end = text.indexOf("*/", i + 2);
        if (end === -1) break;
        text = text.slice(0, i) + " " + text.slice(end + 2);
        n = text.length;
        continue;
      } else if (c === 59) { // ;
        var stmt = text.slice(start, i).trim();
        start = i + 1;
        if (stmt.charCodeAt(0) === 35) data(stmt);
        else if (stmt === "HEADER") section = "H";
        else if (stmt === "DATA") section = "D";
        else if (stmt === "ENDSEC") section = "";
        else if (section === "H") header(stmt);
      }
      i++;
    }

    // ---- resolve property sets onto elements ----
    function attach(el, psetId, inherited) {
      var ps = psets[psetId];
      if (!ps) return;
      var order = el.order[ps.name] || (el.order[ps.name] = []);
      for (var k = 0; k < ps.props.length; k++) {
        var p = props[ps.props[k]];
        if (!p) continue;
        var key = ps.name + "." + p.name;
        if (inherited && el.props[key] && !el.props[key].inherited) continue; // occurrence wins
        if (!el.props[key]) order.push(p.name);
        el.props[key] = { v: p.value, inherited: !!inherited };
      }
    }
    relProps.forEach(function (r) { r[0].forEach(function (oid) { if (elementsById[oid]) attach(elementsById[oid], r[1], false); }); });
    relTypes.forEach(function (r) {
      var ids = typeObjects[r[1]] || [];
      r[0].forEach(function (oid) { if (elementsById[oid]) ids.forEach(function (pid) { attach(elementsById[oid], pid, true); }); });
    });
    model.elements.forEach(function (el) { if (el.guid) model.byGuid[el.guid] = el; });

    model.schemaRaw = model.header.schemas[0] || "";
    model.schema = normaliseSchema(model.schemaRaw);
    var view = /ViewDefinition\s*\[([^\]]*)\]/i.exec(model.header.description.join(" "));
    model.view = view ? view[1].trim() : "";
    if (!model.isStep) model.warnings.push("The file does not start with ISO-10303-21, so it is not a plain IFC STEP file (ifcXML and ifcZIP are not read by this prototype).");
    return model;
  }

  var api = { parse: parse, parseArgs: parseArgs, decodeString: decodeString, normaliseSchema: normaliseSchema };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.IfcLite = api;
})(typeof window !== "undefined" ? window : globalThis);
