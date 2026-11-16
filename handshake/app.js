/* app.js: state, storage and rendering for the Handshake prototype. */
(function () {
  "use strict";
  var C = window.Checks, SCHEMAS = window.IFC_SCHEMAS;
  var STORE_KEY = "handshake.v1";
  var FRAMED = (function () { try { return window.self !== window.top; } catch (e) { return true; } })();

  // ---- state ----------------------------------------------------------------
  var files = [];                 // {model, sha, demo}   (never persisted)
  var sel = { file: 0, recipient: null };
  var driftRef = {};              // project guid -> reference file name
  var state = load() || defaults();

  function defaults() {
    return {
      recipients: [
        { id: "r-fab", name: "Steel fabricator", role: "Supplier", software: "Detailing software, older release", accepts: ["IFC2X3"], view: "",
          maxMb: "", requires: [], basis: "confirmed", confirmedOn: "2026-10-21", notes: "Found by trial: could not open IFC4. Example profile, edit or delete.", example: true },
        { id: "r-client", name: "Client BIM team", role: "Client", software: "Model checker", accepts: ["IFC4"], view: "ReferenceView",
          maxMb: "", requires: [{ cls: "IfcDoor", pset: "Pset_DoorCommon", prop: "FireRating" }, { cls: "IfcSpace", pset: "Pset_SpaceCommon", prop: "Reference" }, { cls: "IfcWall", pset: "Pset_WallCommon", prop: "LoadBearing" }],
          basis: "confirmed", confirmedOn: "2026-09-02", notes: "From the client's information requirements. Example profile.", example: true },
        { id: "r-fm", name: "FM consultant", role: "Consultant", software: "Not known yet", accepts: ["IFC2X3", "IFC4"], view: "",
          maxMb: "", requires: [{ cls: "IfcSpace", pset: "Pset_SpaceCommon", prop: "Reference" }], basis: "assumed", confirmedOn: "", notes: "Nobody has asked them yet. Example profile.", example: true }
      ],
      baseline: "",
      log: [],
      roster: [
        { id: "p1", person: "Modeller A", office: "Prague", tool: "ExampleCAD 2026.2", ifc: "5.2.1", nwc: "2026.1", example: true },
        { id: "p2", person: "Modeller B", office: "Milan", tool: "ExampleCAD 2026.2", ifc: "5.1.0", nwc: "2026.0", example: true },
        { id: "p3", person: "Modeller C", office: "Brno", tool: "ExampleCAD 2026.2", ifc: "5.2.1", nwc: "2026.1", example: true }
      ],
      rosterBaseline: { tool: "ExampleCAD 2026.2", ifc: "5.2.1", nwc: "2026.1" }
    };
  }
  function load() { try { return JSON.parse(localStorage.getItem(STORE_KEY)); } catch (e) { return null; } }
  function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* storage unavailable: keep working in memory */ } }

  // ---- helpers --------------------------------------------------------------
  function esc(v) {
    return String(v === null || v === undefined ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function $(id) { return document.getElementById(id); }
  function uid(p) { return p + "-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  var VERDICT = { blocked: "Blocked", check: "Check first", clear: "No known blockers" };
  var LEVEL = { block: "Blocker", warn: "Check", pass: "OK", info: "Note" };
  function stamp(v) { return '<span class="stamp ' + v + '">' + VERDICT[v] + "</span>"; }

  var toastTimer;
  function toast(msg) {
    var t = $("toast"); t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, 3200);
  }

  function ctxFor(model) {
    return {
      schemas: SCHEMAS, baseline: state.baseline, log: state.log,
      siblings: files.map(function (f) { return f.model; }).filter(function (m) { return m.project.guid && m.project.guid === model.project.guid; })
    };
  }
  function evalPair(f, r) { return C.evaluate(f.model, r, ctxFor(f.model)); }

  function sha256(buffer) {
    if (!window.crypto || !crypto.subtle) return Promise.resolve("");
    return crypto.subtle.digest("SHA-256", buffer).then(function (d) {
      return Array.prototype.map.call(new Uint8Array(d), function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
    }).catch(function () { return ""; });
  }

  // ---- loading files --------------------------------------------------------
  function addText(name, text, size, buffer, demo) {
    var model = window.IfcLite.parse(text, { name: name, size: size });
    var entry = { model: model, sha: "", demo: !!demo };
    var at = files.findIndex(function (f) { return f.model.name === name; });
    if (at === -1) files.push(entry); else files[at] = entry;
    return sha256(buffer).then(function (h) { entry.sha = h; });
  }

  function addFiles(list) {
    var picked = Array.prototype.slice.call(list).filter(function (f) { return /\.ifc$/i.test(f.name); });
    var skipped = list.length - picked.length;
    if (!picked.length) { toast("Only plain .ifc files can be read here. ifcZIP and ifcXML are not supported yet."); return; }
    if (files.some(function (f) { return f.demo; })) { // real files replace the demo set and its baseline
      files = [];
      if (state.baselineFromDemo) { state.baseline = ""; state.baselineFromDemo = false; save(); }
    }
    Promise.all(picked.map(function (file) {
      return file.arrayBuffer().then(function (buf) {
        var text = new TextDecoder("utf-8").decode(buf);
        return addText(file.name, text, file.size, buf, false);
      });
    })).then(function () {
      sel.file = 0;
      toast(picked.length + " file" + (picked.length === 1 ? "" : "s") + " read" + (skipped ? ", " + skipped + " skipped (not .ifc)" : "") + ".");
      render();
    }).catch(function (err) { toast("Could not read a file: " + err.message); });
  }

  function loadDemo() {
    files = [];
    var enc = new TextEncoder();
    Promise.all(window.DEMO_FILES.map(function (d) {
      var buf = enc.encode(d.text).buffer;
      return addText(d.name, d.text, d.text.length, buf, true);
    })).then(function () {
      if (!state.baseline && files[0]) { state.baseline = C.toolchainKey(files[0].model); state.baselineFromDemo = true; save(); }
      sel = { file: 0, recipient: null };
      render();
    });
  }

  // ---- views ----------------------------------------------------------------
  function viewName() {
    var h = (location.hash || "").replace("#", "");
    return ["deliveries", "drift", "recipients", "log"].indexOf(h) !== -1 ? h : "deliveries";
  }

  function render() {
    var v = viewName();
    document.querySelectorAll(".tabs a").forEach(function (a) {
      if (a.dataset.view === v) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    var demo = files.length && files.every(function (f) { return f.demo; });
    var b = $("banner");
    b.hidden = !demo;
    if (demo) b.textContent = "You are looking at three synthetic exports of one invented project, with example recipients. Add your own IFC files to replace them.";
    $("view").innerHTML = { deliveries: deliveries, drift: drift, recipients: recipients, log: logView }[v]();
  }

  // Deliveries: the export x recipient matrix and one opened pair.
  function deliveries() {
    if (!files.length) return '<div class="empty">No exports loaded. Add IFC files, drop them anywhere on this page, or load the demo exports.</div>';
    var recs = state.recipients;
    if (!recs.length) return '<div class="empty">No recipients yet. Add the people who receive your models under <a href="#recipients">Recipients</a>.</div>';
    if (sel.file >= files.length) sel.file = 0;
    if (!recs.some(function (r) { return r.id === sel.recipient; })) sel.recipient = recs[0].id;

    var tally = { blocked: 0, check: 0, clear: 0 };
    var rows = files.map(function (f, i) {
      var fp = C.fingerprint(f.model);
      var cells = recs.map(function (r) {
        var res = evalPair(f, r); tally[res.verdict]++;
        var on = sel.file === i && sel.recipient === r.id;
        return '<td><button type="button" class="stamp cell ' + res.verdict + '" data-act="select" data-file="' + i + '" data-rec="' + esc(r.id) +
          '" aria-pressed="' + on + '">' + VERDICT[res.verdict] + "</button></td>";
      }).join("");
      return "<tr><td><div class=\"file-name\">" + esc(f.model.name) + "</div><div class=\"sub\"><span class=\"chip\">" + esc(C.label(f.model.schema)) + "</span> " +
        esc(fp.exporter || "exporter not stated") + (fp.author ? " · " + esc(fp.author) : "") + (f.demo ? ' <span class="chip demo">demo</span>' : "") +
        ' <button type="button" class="btn small quiet" data-act="remove-file" data-file="' + i + '">Remove</button></div></td>' + cells + "</tr>";
    }).join("");

    var head = recs.map(function (r) {
      return "<th>" + esc(r.name) + '<div class="sub" style="text-transform:none;letter-spacing:0;font-weight:400">' +
        esc((r.accepts || []).map(C.label).join(", ") || "version not recorded") + (r.basis === "confirmed" ? "" : " · assumed") + "</div></th>";
    }).join("");

    var f = files[sel.file], r = recs.filter(function (x) { return x.id === sel.recipient; })[0];
    var res = evalPair(f, r), fp = C.fingerprint(f.model);

    var checks = res.checks.map(function (c) {
      var extra = "";
      if (c.loss && c.loss.length) {
        extra = '<div class="scroll"><table><thead><tr><th>Class with no ' + esc(C.label(c.target)) + ' equivalent</th><th class="num">Instances</th><th>Kind</th></tr></thead><tbody>' +
          c.loss.slice(0, 15).map(function (l) { return "<tr><td class=\"mono\">" + esc(l.type) + '</td><td class="num">' + l.count + "</td><td>" + esc(l.kind) + "</td></tr>"; }).join("") +
          "</tbody></table></div>" + (c.loss.length > 15 ? '<p class="detail">and ' + (c.loss.length - 15) + " more classes.</p>" : "") +
          '<p class="detail">Exporters usually turn these into generic proxies or drop them. Decide with the recipient whether that is acceptable before you re-export.</p>';
      }
      return '<li class="' + c.level + '"><span class="lvl">' + LEVEL[c.level] + '</span><span class="title">' + esc(c.title) + "</span>" +
        (c.detail ? '<div class="detail">' + esc(c.detail) + "</div>" : "") + extra + "</li>";
    }).join("");

    var passportText = C.passport(f.model, r, res, f.sha);

    return '<p class="lede">One model, several recipients, and each of them opens it with different software. Pick a cell to see why an export is or is not ready for that recipient.</p>' +
      '<section class="sheet"><header><h2>Export × recipient</h2><div class="tally"><span><b>' + tally.blocked + "</b> blocked</span><span><b>" + tally.check +
      "</b> to check</span><span><b>" + tally.clear + '</b> with no known blockers</span></div></header><div class="scroll"><table><thead><tr><th>Export</th>' + head +
      "</tr></thead><tbody>" + rows + "</tbody></table></div></section>" +

      '<section class="sheet"><header><div><h2>' + esc(f.model.name) + " → " + esc(r.name) + "</h2><p>" + esc(r.software || "software not recorded") + "</p></div>" + stamp(res.verdict) + "</header>" +
      '<dl class="titleblock">' +
      tb("IFC version", C.label(fp.schema) + (f.model.schemaRaw && f.model.schemaRaw !== fp.schema ? " (" + f.model.schemaRaw + ")" : "")) + tb("Model view", fp.view || "not declared") +
      tb("Authoring tool", fp.authoringTool || "not stated") + tb("Exporter", fp.exporter || "not stated") + tb("Exported by", fp.author || "not stated") +
      tb("Export time", fp.timeStamp || "not stated") + tb("Contents", f.model.entityCount + " instances, " + f.model.elements.length + " elements") +
      tb("SHA-256", f.sha ? f.sha.slice(0, 16) + "…" : "not available") + "</dl>" +
      '<ul class="checks">' + checks + "</ul>" +
      '<div class="body"><div class="row"><button type="button" class="btn primary" data-act="record">Record as sent to ' + esc(r.name) + "</button>" +
      '<button type="button" class="btn" data-act="copy-passport">Copy delivery passport</button>' +
      (FRAMED ? "" : '<button type="button" class="btn" data-act="download-passport">Download passport (.txt)</button>') +
      (C.toolchainKey(f.model) !== state.baseline ? '<button type="button" class="btn quiet" data-act="pin" data-file="' + sel.file + '">Pin this exporter as project baseline</button>' : "") +
      '</div><pre class="passport" id="passport">' + esc(passportText) + "</pre>" +
      '<p class="sub">“No known blockers” means every check this tool can run has passed. It does not prove the recipient’s software opens the file. Record what actually happened in the delivery log and the next check gets sharper.</p></div></section>';
  }
  function tb(k, v) { return "<div><dt>" + esc(k) + "</dt><dd>" + esc(v) + "</dd></div>"; }

  // Export drift: toolchains, same-model comparisons, team roster.
  function drift() {
    var out = '<p class="lede">The same model can leave the office in different shapes, depending on who pressed export and which exporter version they had installed. This view shows that before a client does.</p>';

    if (files.length) {
      var rows = files.map(function (f, i) {
        var fp = C.fingerprint(f.model), key = C.toolchainKey(f.model), match = state.baseline && key === state.baseline;
        return "<tr><td class=\"file-name\">" + esc(f.model.name) + "</td><td>" + esc(fp.author || "not stated") + "</td><td class=\"mono\">" + esc(fp.authoringTool || "not stated") +
          "</td><td class=\"mono\">" + esc(fp.exporter || "not stated") + "</td><td>" + esc(C.label(fp.schema)) + "</td><td>" +
          (!state.baseline ? '<span class="sub">no baseline</span>' : match ? '<span class="good">matches baseline</span>' : '<span class="flag">differs from baseline</span>') +
          '</td><td><button type="button" class="btn small" data-act="pin" data-file="' + i + '">' + (match ? "Pinned" : "Pin as baseline") + "</button></td></tr>";
      }).join("");
      out += '<section class="sheet"><header><div><h2>What exported each file</h2><p>Read from each file’s header. Baseline: <span class="mono">' +
        esc(state.baseline ? state.baseline.replace(" | ", ", ") : "none pinned") + '</span></p></div></header><div class="scroll"><table><thead><tr><th>Export</th><th>By</th><th>Authoring tool</th><th>Exporter</th><th>IFC</th><th>Baseline</th><th></th></tr></thead><tbody>' +
        rows + "</tbody></table></div></section>";

      // group by project
      var groups = {};
      files.forEach(function (f) { var g = f.model.project.guid || "?" + f.model.name; (groups[g] = groups[g] || []).push(f); });
      Object.keys(groups).forEach(function (g) {
        var set = groups[g];
        if (set.length < 2) return;
        var refName = driftRef[g];
        var ref = set.filter(function (f) { return f.model.name === refName; })[0] ||
          set.filter(function (f) { return C.toolchainKey(f.model) === state.baseline; })[0] || set[0];
        var opts = set.map(function (f) { return '<option value="' + esc(f.model.name) + '"' + (f === ref ? " selected" : "") + ">" + esc(f.model.name) + "</option>"; }).join("");
        var cards = set.filter(function (f) { return f !== ref; }).map(function (f) {
          var cmp = C.compareExports(SCHEMAS, ref.model, f.model);
          var crossSchema = ref.model.schema !== f.model.schema;
          var head = cmp.lostTotal === 0 && cmp.reorderedTotal === 0 && cmp.onlyRef === 0 && cmp.retypedTotal === 0
            ? '<span class="good">Carries everything the reference carries</span>'
            : '<span class="flag' + (cmp.lostTotal ? " bad" : "") + '">' + [cmp.lostTotal ? cmp.lostTotal + " property values missing" : "", cmp.reorderedTotal ? cmp.reorderedTotal + " property sets in a different order" : "", cmp.retypedTotal ? cmp.retypedTotal + " elements changed class" : "",
              cmp.onlyRef ? cmp.onlyRef + " elements missing" : ""].filter(Boolean).join(", ") + "</span>";
          var body = "";
          if (cmp.lost.length) body += tableOf("Missing in this export", cmp.lost, "Elements");
          if (cmp.retyped.length) body += tableOf("Became this class", cmp.retyped, "Elements").replace("<th>Class</th>", "<th>Was</th>");
          if (cmp.reordered.length) body += tableOf("Same properties, different order", cmp.reordered, "Elements");
          if (cmp.gained.length) body += tableOf("Only in this export", cmp.gained, "Elements");
          return '<div class="body" style="border-top:1px solid var(--rule)"><div class="row"><h3 class="file-name">' + esc(f.model.name) + "</h3>" + head + "</div>" +
            '<p class="sub">' + cmp.shared + " elements matched by GlobalId. " + (cmp.sameToolchain ? "Same exporter as the reference." : "Different exporter: " + esc(C.fingerprint(f.model).exporter || "not stated") + " against " + esc(C.fingerprint(ref.model).exporter || "not stated") + ".") +
            (crossSchema ? " Different IFC version, so some differences are expected." : "") + "</p>" + body + "</div>";
        }).join("");
        out += '<section class="sheet"><header><div><h2>Same model, different export: ' + esc(set[0].model.project.name || "unnamed project") + "</h2><p>" + set.length +
          ' exports share this project’s GlobalId.</p></div><label class="field" style="min-width:240px"><span>Compare against</span><select id="ref-' + esc(g) + '" data-act="set-ref" data-group="' + esc(g) + '">' + opts + "</select></label></header>" + cards + "</section>";
      });
    } else {
      out += '<div class="empty">Load at least two exports of the same model to compare them.</div>';
    }

    // roster
    var rb = state.rosterBaseline;
    var rrows = state.roster.map(function (p) {
      function cell(k) {
        var off = rb[k] && p[k] && p[k] !== rb[k];
        return '<td><input type="text" id="ro-' + esc(p.id) + "-" + k + '" data-act="roster" data-id="' + esc(p.id) + '" data-key="' + k + '" value="' + esc(p[k]) + '" aria-label="' + k + '">' +
          (off ? '<div class="flag">baseline is ' + esc(rb[k]) + "</div>" : "") + "</td>";
      }
      return "<tr>" + cell("person") + cell("office") + cell("tool") + cell("ifc") + cell("nwc") +
        '<td><button type="button" class="btn small quiet" data-act="roster-del" data-id="' + esc(p.id) + '">Remove</button></td></tr>';
    }).join("");
    var off = state.roster.filter(function (p) { return ["tool", "ifc", "nwc"].some(function (k) { return rb[k] && p[k] && p[k] !== rb[k]; }); }).length;
    out += '<section class="sheet"><header><div><h2>Team toolchain</h2><p>Formats this tool cannot read, such as NWD, still depend on the exporter each person has installed. ' +
      (off ? '<span class="flag">' + off + " of " + state.roster.length + " people differ from the baseline.</span>" : '<span class="good">Everyone matches the baseline.</span>') +
      '</p></div><button type="button" class="btn small" data-act="roster-add">Add person</button></header><div class="scroll"><table><thead><tr><th>Person</th><th>Office</th><th>Authoring tool build</th><th>IFC exporter</th><th>NWC exporter</th><th></th></tr></thead><tbody>' +
      '<tr><td colspan="2"><b>Project baseline</b></td>' + ["tool", "ifc", "nwc"].map(function (k) {
        return '<td><input type="text" id="rb-' + k + '" data-act="roster-base" data-key="' + k + '" value="' + esc(rb[k]) + '" aria-label="baseline ' + k + '"></td>';
      }).join("") + "<td></td></tr>" + rrows + '</tbody></table></div><div class="body"><p class="sub">Typed in by hand in this prototype. The product version would collect it from a small add-in on each workstation at export time.</p></div></section>';
    return out;
  }
  function tableOf(title, rows, unit) {
    return '<div class="scroll"><table><thead><tr><th>' + esc(title) + "</th><th>Class</th><th class=\"num\">" + unit + "</th></tr></thead><tbody>" +
      rows.slice(0, 12).map(function (x) { return '<tr><td class="mono">' + esc(x.name) + "</td><td>" + esc(x.cls) + '</td><td class="num">' + x.count + "</td></tr>"; }).join("") +
      (rows.length > 12 ? '<tr><td colspan="3" class="sub">and ' + (rows.length - 12) + " more</td></tr>" : "") + "</tbody></table></div>";
  }

  // Recipients register.
  function recipients() {
    var cards = state.recipients.map(function (r) {
      var id = esc(r.id);
      var boxes = C.SCHEMA_ORDER.map(function (s) {
        return '<label><input type="checkbox" id="acc-' + id + "-" + s + '" data-act="rec-accept" data-id="' + id + '" data-schema="' + s + '"' + ((r.accepts || []).indexOf(s) !== -1 ? " checked" : "") + "> " + C.label(s) + "</label>";
      }).join("");
      function text(key, lbl, hint, type) {
        return '<label class="field"><span>' + lbl + '</span><input type="' + (type || "text") + '" id="rec-' + id + "-" + key + '" data-act="rec-field" data-id="' + id + '" data-key="' + key + '" value="' + esc(r[key]) + '">' + (hint ? "<small>" + hint + "</small>" : "") + "</label>";
      }
      return '<section class="sheet"><header><h2>' + esc(r.name || "Unnamed recipient") + (r.example ? ' <span class="chip demo">example</span>' : "") + '</h2><button type="button" class="btn small quiet" data-act="rec-del" data-id="' + id + '">Delete</button></header><div class="body"><div class="grid">' +
        text("name", "Name") + text("role", "Role") + text("software", "Software and version", "What they open your model with.") +
        '<fieldset><legend>Opens these IFC versions</legend><div class="checkrow">' + boxes + "</div></fieldset>" +
        '<label class="field"><span>How do we know</span><select id="rec-' + id + '-basis" data-act="rec-field" data-id="' + id + '" data-key="basis"><option value="assumed"' + (r.basis !== "confirmed" ? " selected" : "") + '>Assumed, nobody asked</option><option value="confirmed"' + (r.basis === "confirmed" ? " selected" : "") + ">Confirmed with a test file or in writing</option></select><small>An assumed profile never gives a clear verdict.</small></label>" +
        text("confirmedOn", "Confirmed on", "", "date") + text("view", "Model view they ask for", "For example ReferenceView. Leave empty if none.") + text("maxMb", "Largest file they accept (MB)", "", "number") +
        '<label class="field span2"><span>Properties they need</span><textarea id="rec-' + id + '-requires" data-act="rec-req" data-id="' + id + '" spellcheck="false" placeholder="IfcDoor: Pset_DoorCommon.FireRating">' + esc(C.formatRequirements(r.requires)) + "</textarea><small>One per line, as Class: PropertySet.Property. Subclasses are included.</small></label>" +
        '<label class="field span2"><span>Notes</span><input type="text" id="rec-' + id + '-notes" data-act="rec-field" data-id="' + id + '" data-key="notes" value="' + esc(r.notes) + '"></label>' +
        "</div></div></section>";
    }).join("");
    return '<p class="lede">What you know about each person who opens your models. Most teams carry this in someone’s head and relearn it by sending files until one works. Write it down once.</p>' +
      '<div class="row"><button type="button" class="btn primary" data-act="rec-add">Add recipient</button></div>' + (cards || '<div class="empty">No recipients yet.</div>');
  }

  // Delivery log.
  function logView() {
    if (!state.log.length) return '<p class="lede">Every delivery you record lands here. When you later mark whether the recipient could open it, that answer feeds the next check for the same recipient, IFC version and exporter.</p><div class="empty">Nothing recorded yet. Open a pair under <a href="#deliveries">Deliveries</a> and choose “Record as sent”.</div>';
    var rows = state.log.slice().reverse().map(function (e) {
      var rec = state.recipients.filter(function (r) { return r.id === e.recipientId; })[0];
      var opts = [["pending", "Waiting for feedback"], ["opened", "Opened and usable"], ["failed", "Could not open it"], ["rejected", "Opened, then rejected"]].map(function (o) {
        return '<option value="' + o[0] + '"' + (e.outcome === o[0] ? " selected" : "") + ">" + o[1] + "</option>";
      }).join("");
      return "<tr><td class=\"mono\">" + esc(e.when.slice(0, 16).replace("T", " ")) + '</td><td><div class="file-name">' + esc(e.file) + '</div><div class="sub mono">' + esc(e.sha ? e.sha.slice(0, 12) + "…" : "") + "</div></td><td>" + esc(rec ? rec.name : "deleted recipient") +
        '</td><td><span class="chip">' + esc(C.label(e.schema)) + '</span><div class="sub">' + esc(e.toolchain.split(" | ")[1] || "") + "</div></td><td>" + stamp(e.verdict) +
        '</td><td><select id="out-' + esc(e.id) + '" data-act="log-outcome" data-id="' + esc(e.id) + '" aria-label="Outcome">' + opts + '</select></td><td><input type="text" id="note-' + esc(e.id) + '" data-act="log-note" data-id="' + esc(e.id) + '" value="' + esc(e.note) + '" placeholder="What happened" aria-label="Note"></td></tr>';
    }).join("");
    var known = state.log.filter(function (e) { return e.outcome === "opened" || e.outcome === "failed"; }).length;
    return '<p class="lede">Every delivery you record lands here. When you mark whether the recipient could open it, that answer feeds the next check for the same recipient, IFC version and exporter.</p>' +
      '<section class="sheet"><header><h2>Recorded deliveries</h2><p>' + state.log.length + " recorded, " + known + ' with a known outcome</p></header><div class="scroll"><table><thead><tr><th>Sent</th><th>File</th><th>Recipient</th><th>IFC, exporter</th><th>Verdict at send</th><th>What happened</th><th>Note</th></tr></thead><tbody>' + rows + "</tbody></table></div></section>";
  }

  // ---- events ---------------------------------------------------------------
  function recById(id) { return state.recipients.filter(function (r) { return r.id === id; })[0]; }

  document.addEventListener("click", function (ev) {
    var t = ev.target.closest("[data-act]");
    if (!t || t.tagName === "SELECT" || t.tagName === "INPUT" || t.tagName === "TEXTAREA") return;
    var act = t.dataset.act;
    if (act === "select") { sel = { file: +t.dataset.file, recipient: t.dataset.rec }; render(); }
    else if (act === "remove-file") { files.splice(+t.dataset.file, 1); sel.file = 0; render(); }
    else if (act === "pin") { state.baseline = C.toolchainKey(files[+t.dataset.file].model); state.baselineFromDemo = false; save(); toast("Project baseline pinned."); render(); }
    else if (act === "copy-passport") {
      var text = $("passport").textContent;
      (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () { toast("Passport copied."); })
        .catch(function () { toast("Copying is blocked here. Select the text below and copy it by hand."); });
    } else if (act === "download-passport") {
      var a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([$("passport").textContent], { type: "text/plain" }));
      a.download = files[sel.file].model.name.replace(/\.ifc$/i, "") + "_passport.txt";
      a.click(); URL.revokeObjectURL(a.href);
    } else if (act === "record") {
      var f = files[sel.file], r = recById(sel.recipient);
      state.log.push({ id: uid("d"), when: new Date().toISOString(), file: f.model.name, sha: f.sha, recipientId: r.id, schema: f.model.schema,
        toolchain: C.toolchainKey(f.model), verdict: evalPair(f, r).verdict, outcome: "pending", note: "" });
      save(); toast("Recorded. Mark the outcome in the delivery log when you hear back."); render();
    } else if (act === "rec-add") {
      state.recipients.push({ id: uid("r"), name: "New recipient", role: "", software: "", accepts: [], view: "", maxMb: "", requires: [], basis: "assumed", confirmedOn: "", notes: "" });
      save(); render();
    } else if (act === "rec-del") { state.recipients = state.recipients.filter(function (r) { return r.id !== t.dataset.id; }); save(); render(); }
    else if (act === "roster-add") { state.roster.push({ id: uid("p"), person: "", office: "", tool: "", ifc: "", nwc: "" }); save(); render(); }
    else if (act === "roster-del") { state.roster = state.roster.filter(function (p) { return p.id !== t.dataset.id; }); save(); render(); }
  });

  // Field edits save on change, so typing is never interrupted by a re-render.
  document.addEventListener("change", function (ev) {
    var t = ev.target, act = t.dataset && t.dataset.act;
    if (!act) return;
    var r, e;
    if (act === "rec-field") { r = recById(t.dataset.id); r[t.dataset.key] = t.value; delete r.example; }
    else if (act === "rec-accept") {
      r = recById(t.dataset.id);
      r.accepts = (r.accepts || []).filter(function (s) { return s !== t.dataset.schema; });
      if (t.checked) r.accepts.push(t.dataset.schema);
    } else if (act === "rec-req") {
      r = recById(t.dataset.id);
      var parsed = C.parseRequirements(t.value);
      r.requires = parsed.requirements;
      if (parsed.invalid.length) toast("Could not read: " + parsed.invalid[0] + ". Use Class: PropertySet.Property.");
    } else if (act === "log-outcome") {
      e = state.log.filter(function (x) { return x.id === t.dataset.id; })[0]; e.outcome = t.value;
      r = recById(e.recipientId);
      if (r && t.value === "opened" && (r.accepts || []).indexOf(e.schema) !== -1 && r.basis !== "confirmed") {
        r.basis = "confirmed"; r.confirmedOn = e.when.slice(0, 10);
        toast(r.name + " is now confirmed for " + C.label(e.schema) + ".");
      } else if (t.value === "failed") toast("Noted. The same combination will be blocked for this recipient next time.");
    } else if (act === "log-note") { e = state.log.filter(function (x) { return x.id === t.dataset.id; })[0]; e.note = t.value; }
    else if (act === "roster") { state.roster.filter(function (p) { return p.id === t.dataset.id; })[0][t.dataset.key] = t.value; }
    else if (act === "roster-base") { state.rosterBaseline[t.dataset.key] = t.value; }
    else if (act === "set-ref") { driftRef[t.dataset.group] = t.value; render(); return; }
    else return;
    save(); render();
  });

  $("file-input").addEventListener("change", function (ev) { addFiles(ev.target.files); ev.target.value = ""; });
  $("demo-btn").addEventListener("click", loadDemo);
  var armed = false;
  $("reset-btn").addEventListener("click", function () {
    if (!armed) { armed = true; this.textContent = "Click again to erase recipients and log"; var b = this; setTimeout(function () { armed = false; b.textContent = "Reset everything"; }, 4000); return; }
    armed = false; this.textContent = "Reset everything";
    state = defaults(); save(); loadDemo(); toast("Back to the demo state.");
  });

  var depth = 0;
  window.addEventListener("dragenter", function (e) { if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types, "Files") !== -1) { depth++; $("drop-veil").hidden = false; } });
  window.addEventListener("dragleave", function () { depth = Math.max(0, depth - 1); if (!depth) $("drop-veil").hidden = true; });
  window.addEventListener("dragover", function (e) { e.preventDefault(); });
  window.addEventListener("drop", function (e) { e.preventDefault(); depth = 0; $("drop-veil").hidden = true; if (e.dataTransfer && e.dataTransfer.files.length) addFiles(e.dataTransfer.files); });
  window.addEventListener("hashchange", render);

  // Open in a working state: the demo exports, clearly marked.
  loadDemo();
})();
