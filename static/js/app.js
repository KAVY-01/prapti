// Prapti client scripts: rotating examples, voice input, edit panel, checklist, tracker.
(function () {
  "use strict";

  function T(key, vars) {
    var dict = window.PRAPTI_T || {};
    var s = dict[key] != null ? dict[key] : key;
    if (vars) Object.keys(vars).forEach(function (k) { s = s.split("{" + k + "}").join(vars[k]); });
    return s;
  }

  // ---------- Entrances: heading, then text, then picture (content stays visible without script) ----------
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if ("IntersectionObserver" in window && !reduceMotion) {
    document.documentElement.classList.add("js");
    var groups = document.querySelectorAll(".moments, .sheet, .sheet-page, .faq, .detail-section, .source-box, .footer-card, .about-block, .helper-list-wrap, .admin-log");
    var ioWorks = false;
    var io = new IntersectionObserver(function (entries) {
      ioWorks = true;
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add("is-seen");
        e.target.querySelectorAll("[data-reveal]").forEach(function (el) { el.classList.add("is-in"); });
        if (e.target.hasAttribute("data-reveal")) e.target.classList.add("is-in");
        io.unobserve(e.target);
      });
    }, { rootMargin: "0px 0px -10% 0px" });
    groups.forEach(function (g) {
      var parts = g.querySelectorAll("h2, h3, p, img, li, details, .chip-row, .sheet-item, .btn, .moment-pic");
      if (!parts.length) { g.setAttribute("data-reveal", ""); }
      parts.forEach(function (el, i) {
        el.setAttribute("data-reveal", "");
        el.style.setProperty("--d", Math.min(i, 6) * 45 + "ms");
      });
      io.observe(g);
    });
    // Safety: if the observer never reports, never leave content hidden.
    setTimeout(function () {
      if (ioWorks) return;
      document.querySelectorAll("[data-reveal]").forEach(function (el) { el.classList.add("is-in"); });
      groups.forEach(function (g) { g.classList.add("is-seen"); });
    }, 4000);
  }

  function store(key, value) {
    try {
      if (value === undefined) return JSON.parse(localStorage.getItem(key) || "null");
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      return null;
    }
  }

  // ---------- Toast ----------
  var toastTimer;
  function toast(msg, action) {
    var el = document.querySelector(".toast");
    if (!el) return;
    el.textContent = msg;
    function hide() {
      el.classList.remove("is-visible");
      setTimeout(function () { el.hidden = true; }, 300);
    }
    if (action) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "toast-action";
      b.textContent = action.label;
      b.addEventListener("click", function () { clearTimeout(toastTimer); action.run(); hide(); });
      el.appendChild(b);
    }
    el.hidden = false;
    requestAnimationFrame(function () { el.classList.add("is-visible"); });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hide, action ? 6000 : 3000);
  }
  window.praptiToast = toast;

  // Links for screens that arrive in later steps.
  document.querySelectorAll("[data-soon]").forEach(function (a) {
    a.addEventListener("click", function (e) {
      e.preventDefault();
      toast(T("soon"));
    });
  });

  // ---------- Home: rotating placeholder ----------
  var textarea = document.querySelector("textarea[data-examples]");
  if (textarea) {
    var examples = [];
    try { examples = JSON.parse(textarea.dataset.examples); } catch (e) {}
    var idx = { te: 1, hi: 2 }[document.documentElement.lang] || 0;
    if (examples[idx]) textarea.placeholder = examples[idx];
    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (examples.length > 1 && !reduce) {
      setInterval(function () {
        if (textarea.value || document.activeElement === textarea) return;
        textarea.classList.add("is-swapping");
        setTimeout(function () {
          idx = (idx + 1) % examples.length;
          textarea.placeholder = examples[idx];
          textarea.classList.remove("is-swapping");
        }, 250);
      }, 4000);
    }

    // ---------- Voice input (Web Speech API): speak in English, Telugu or Hindi ----------
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    var micRow = document.querySelector("[data-mic-row]");
    var mic = document.querySelector("[data-mic]");
    var micLabel = document.querySelector("[data-mic-label]");
    var micLang = document.querySelector("[data-mic-lang]");
    if (SR && micRow && mic) {
      micRow.hidden = false;
      var rec = null;
      var base = "";
      var heard = false;
      var pageLang = { te: "te-IN", hi: "hi-IN" }[document.documentElement.lang] || "en-IN";
      if (micLang) {
        var saved = store("prapti:mic-lang");
        micLang.value = saved || pageLang; // an unknown saved value leaves it empty, caught below
        if (!micLang.value) micLang.value = "en-IN";
        micLang.addEventListener("change", function () {
          store("prapti:mic-lang", micLang.value);
          if (rec) { rec.onend = null; try { rec.abort(); } catch (e) {} stopUI(); start(); }
        });
      }
      function stopUI() {
        rec = null;
        mic.setAttribute("aria-pressed", "false");
        micLabel.textContent = T("home.speak");
      }
      function start() {
        try {
          rec = new SR();
        } catch (e) { toast(T("home.mic_error")); return; }
        rec.lang = micLang ? micLang.value : pageLang;
        rec.interimResults = true;
        rec.continuous = true;
        base = textarea.value ? textarea.value.trim() + " " : "";
        heard = false;
        rec.onresult = function (ev) {
          var text = "";
          for (var i = 0; i < ev.results.length; i++) text += ev.results[i][0].transcript;
          if (text.trim()) heard = true;
          textarea.value = base + text;
        };
        rec.onerror = function (ev) {
          var err = ev && ev.error;
          if (err === "aborted") return;
          if (err === "not-allowed" || err === "service-not-allowed" || err === "audio-capture") toast(T("home.mic_denied"));
          else if (err === "network") toast(T("home.mic_network"));
          else if (err === "no-speech") toast(T("home.mic_nospeech"));
          else toast(T("home.mic_error"));
          heard = true; // the toast already explained; don't add a second one on end
        };
        rec.onend = function () {
          var silent = !heard;
          stopUI();
          if (silent) toast(T("home.mic_nospeech"));
        };
        try {
          rec.start();
        } catch (e) { stopUI(); toast(T("home.mic_error")); return; }
        mic.setAttribute("aria-pressed", "true");
        micLabel.textContent = T("home.listening");
        try { if (navigator.vibrate) navigator.vibrate(12); } catch (e) {}
      }
      mic.addEventListener("click", function () {
        if (rec) { try { rec.stop(); } catch (e) { stopUI(); } return; }
        start();
      });
    }
  }

  // ---------- Results: edit my details (one line per detail, one opens at a time) ----------
  var editToggle = document.querySelector("[data-edit-toggle]");
  var editPanel = document.getElementById("edit-panel");
  if (editToggle && editPanel) {
    var rows = editPanel.querySelectorAll("[data-edit-row]");
    function showPanel(open) {
      editPanel.hidden = !open;
      editToggle.setAttribute("aria-expanded", String(open));
    }
    function openRow(field) {
      showPanel(true);
      var row = document.getElementById("edit-" + field);
      if (!row) return;
      row.open = true;
      row.scrollIntoView({ block: "center", behavior: reduceMotion ? "auto" : "smooth" });
      row.querySelector("summary").focus({ preventScroll: true });
    }
    editToggle.addEventListener("click", function () {
      showPanel(editPanel.hidden);
      if (!editPanel.hidden) editPanel.querySelector("summary").focus({ preventScroll: true });
    });
    rows.forEach(function (row) {
      row.addEventListener("toggle", function () {
        if (!row.open) return;
        rows.forEach(function (other) { if (other !== row) other.open = false; });
      });
    });
    document.querySelectorAll("[data-open-edit]").forEach(function (a) {
      a.addEventListener("click", function (e) { e.preventDefault(); openRow(a.dataset.openEdit); });
    });
    if (location.hash === "#edit-panel") showPanel(true);
    else if (location.hash.indexOf("#edit-") === 0) openRow(location.hash.slice(6));
  }

  // ---------- Scheme detail: checklist ----------
  var list = document.querySelector("[data-checklist]");
  if (list) {
    var key = "prapti:docs:" + list.dataset.checklist;
    var saved = store(key) || [];
    var boxes = list.querySelectorAll("input[type=checkbox]");
    var progressText = document.querySelector("[data-doc-progress]");
    var bar = document.querySelector("[data-doc-bar]");
    function update() {
      var done = [];
      boxes.forEach(function (b) {
        b.closest(".check-item").classList.toggle("is-done", b.checked);
        if (b.checked) done.push(b.value);
      });
      store(key, done);
      if (progressText) progressText.textContent = T("det.ready", { a: done.length, b: boxes.length });
      if (bar) bar.style.width = (boxes.length ? (done.length / boxes.length) * 100 : 0) + "%";
    }
    boxes.forEach(function (b) {
      b.checked = saved.indexOf(b.value) !== -1;
      b.addEventListener("change", update);
    });
    update();
  }

  // ---------- Copy a share link ----------
  document.querySelectorAll("[data-copy]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var link = btn.dataset.copy;
      var box = document.querySelector("[data-copy-box]");
      function done() { toast(T("share.copied")); }
      function fallback() {
        // Older way to copy; if the browser blocks that too, show the link to copy by hand.
        box.hidden = false;
        box.value = link;
        box.focus();
        box.select();
        var ok = false;
        try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
        if (ok) done(); else toast(T("share.manual"));
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(link).then(done, fallback);
      } else {
        fallback();
      }
    });
  });

  // ---------- One-trip list: one tick covers the same document in every scheme ----------
  var trip = document.querySelectorAll("[data-trip] input[type=checkbox]");
  if (trip.length) {
    var tripText = document.querySelector("[data-trip-progress]");
    var tripBar = document.querySelector("[data-trip-bar]");
    function schemesOf(box) { return box.dataset.schemes.split(" ").filter(Boolean); }
    function tripUpdate() {
      var done = 0;
      trip.forEach(function (b) {
        b.closest(".check-item").classList.toggle("is-done", b.checked);
        if (b.checked) done += 1;
      });
      if (tripText) tripText.textContent = T("det.ready", { a: done, b: trip.length });
      if (tripBar) tripBar.style.width = (done / trip.length) * 100 + "%";
    }
    trip.forEach(function (b) {
      b.checked = schemesOf(b).every(function (id) { return (store("prapti:docs:" + id) || []).indexOf(b.value) !== -1; });
      b.addEventListener("change", function () {
        schemesOf(b).forEach(function (id) {
          var have = (store("prapti:docs:" + id) || []).filter(function (k) { return k !== b.value; });
          if (b.checked) have.push(b.value);
          store("prapti:docs:" + id, have);
        });
        tripUpdate();
      });
    });
    tripUpdate();
  }

  // ---------- Scheme detail: add to tracker ----------
  var trackBtn = document.querySelector("[data-track]");
  var head = document.querySelector("[data-scheme-id]");
  if (trackBtn && head) {
    var tracked = store("prapti:tracker") || [];
    var id = head.dataset.schemeId;
    function setTracked(isTracked) {
      trackBtn.disabled = isTracked;
      trackBtn.lastChild.textContent = isTracked ? T("det.in_tracker") : T("det.track");
    }
    setTracked(tracked.some(function (t) { return t.id === id; }));
    trackBtn.addEventListener("click", function () {
      tracked = store("prapti:tracker") || [];
      if (!tracked.some(function (t) { return t.id === id; })) {
        tracked.push({ id: id, name: head.dataset.schemeName, deadline: head.dataset.deadline || null,
                       status: "not_started", added: new Date().toISOString().slice(0, 10) });
        store("prapti:tracker", tracked);
      }
      setTracked(true);
      toast(T("det.added"));
    });
  }

  // ---------- Read aloud (for people who find reading hard) ----------
  if ("speechSynthesis" in window) {
    var voiceLang = { te: "te-IN", hi: "hi-IN" }[document.documentElement.lang] || "en-IN";
    var speaking = null;
    document.querySelectorAll("[data-speak]").forEach(function (btn) {
      btn.hidden = false;
      var label = btn.querySelector("span");
      btn.addEventListener("click", function () {
        if (speaking === btn) {
          window.speechSynthesis.cancel();
          return;
        }
        window.speechSynthesis.cancel();
        var src = document.querySelector(btn.dataset.speak);
        if (!src) return;
        var u = new SpeechSynthesisUtterance(src.textContent.replace(/\s+/g, " ").trim());
        u.lang = voiceLang;
        u.rate = 0.92;
        var match = window.speechSynthesis.getVoices().filter(function (v) { return v.lang && v.lang.replace("_", "-").indexOf(voiceLang.slice(0, 2)) === 0; })[0];
        if (match) u.voice = match;
        u.onend = u.onerror = function () {
          speaking = null;
          btn.setAttribute("aria-pressed", "false");
          if (label) label.textContent = T("listen");
        };
        speaking = btn;
        btn.setAttribute("aria-pressed", "true");
        if (label) label.textContent = T("listen_stop");
        window.speechSynthesis.speak(u);
      });
    });
  }

  // ---------- Questions: show the choice instantly before the next screen loads ----------
  function buzz() { try { if (navigator.vibrate) navigator.vibrate(8); } catch (e) {} } // a tiny tick on Android
  var tiles = Array.prototype.slice.call(document.querySelectorAll("[data-q-form] .q-tile"));
  tiles.forEach(function (tile) {
    tile.addEventListener("click", function () {
      tile.classList.add("is-chosen");
      buzz();
    });
  });
  // Keyboard answers, like Typeform: 1-9 picks an answer, S skips (never while typing in a box)
  if (tiles.length) {
    document.addEventListener("keydown", function (ev) {
      if (ev.metaKey || ev.ctrlKey || ev.altKey || ev.repeat) return;
      if (/INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || "")) return;
      if (document.body.classList.contains("tour-on")) return;
      var n = parseInt(ev.key, 10);
      if (n >= 1 && n <= tiles.length && n <= 9) { ev.preventDefault(); tiles[n - 1].click(); return; }
      if (ev.key === "s" || ev.key === "S") {
        var skip = document.querySelector(".q-skip");
        if (skip) { ev.preventDefault(); skip.click(); }
      }
    });
  }

  // ---------- Every button that sends a form shows it is working, and can't be pressed twice ----------
  document.addEventListener("submit", function (ev) {
    var b = ev.submitter;
    if (!b) return;
    if (b.getAttribute("aria-busy") === "true") { ev.preventDefault(); return; }
    if (b.matches(".btn, .tap-btn, .sample-card, .q-skip, .q-pill")) {
      b.classList.add("is-busy");
      b.setAttribute("aria-busy", "true");
    }
  });
  // Coming back with the browser's Back button shows the page as it was: clear any "working" state
  window.addEventListener("pageshow", function (ev) {
    if (!ev.persisted) return;
    document.querySelectorAll(".is-busy, .is-chosen").forEach(function (b) {
      b.classList.remove("is-busy", "is-chosen");
      b.removeAttribute("aria-busy");
    });
  });

  // ---------- Offline notice ----------
  // Keep opened pages working offline (see /sw.js)
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("/sw.js").catch(function () {});
    });
  }

  var offline = document.querySelector("[data-offline]");
  function net() { if (offline) offline.hidden = navigator.onLine !== false; }
  window.addEventListener("online", net);
  window.addEventListener("offline", net);
  net();

  // ---------- Nav dot: any tracked deadline within 7 days ----------
  var dot = document.querySelector(".nav-dot");
  var all = store("prapti:tracker") || [];
  var soon = all.some(function (t) {
    if (!t.deadline || t.status === "received") return false;
    var days = (new Date(t.deadline) - new Date()) / 86400000;
    return days >= -1 && days <= 7;
  });
  if (dot && soon) dot.classList.add("is-visible");

  // ---------- Home FAQ (payard.io pattern): one open at a time, slide then fade; pill tabs follow the scroll ----------
  var faq = document.querySelector("[data-faq]");
  if (faq) {
    var items = Array.prototype.slice.call(faq.querySelectorAll(".faq-item"));
    faq.classList.add("faq-js");
    items.forEach(function (item) {
      var head = item.querySelector("summary");
      var body = item.querySelector(".faq-body");
      item.open = true; // keep answers in the page; height does the hiding
      head.setAttribute("aria-expanded", "false");
      function close(it) {
        var b = it.querySelector(".faq-body");
        b.style.height = b.scrollHeight + "px";
        void b.offsetHeight; // start from the real height
        it.classList.remove("is-open");
        it.querySelector("summary").setAttribute("aria-expanded", "false");
        b.style.height = "0px";
      }
      head.addEventListener("click", function (ev) {
        ev.preventDefault();
        if (item.classList.contains("is-open")) { close(item); return; }
        items.forEach(function (other) { if (other !== item && other.classList.contains("is-open")) close(other); });
        item.classList.add("is-open");
        head.setAttribute("aria-expanded", "true");
        body.style.height = reduceMotion ? "auto" : body.scrollHeight + "px";
        setTimeout(settle, 800); // in case transitionend never fires
      });
      function settle() { if (item.classList.contains("is-open")) body.style.height = "auto"; }
      body.addEventListener("transitionend", function (ev) { if (ev.propertyName === "height") settle(); });
    });

    var tabs = Array.prototype.slice.call(faq.querySelectorAll("[data-faq-tab]"));
    var fgroups = Array.prototype.slice.call(faq.querySelectorAll("[data-faq-group]"));
    function setTab(id) {
      tabs.forEach(function (tb) { tb.classList.toggle("is-active", tb.getAttribute("href") === "#" + id); });
    }
    tabs.forEach(function (tb) {
      tb.addEventListener("click", function (ev) {
        var target = document.querySelector(tb.getAttribute("href"));
        if (!target) return;
        ev.preventDefault();
        setTab(target.id);
        target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
      });
    });
    if ("IntersectionObserver" in window) {
      var tio = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) { if (e.isIntersecting) setTab(e.target.id); });
      }, { rootMargin: "-40% 0px -55% 0px" });
      fgroups.forEach(function (g) { tio.observe(g); });
    }
  }

  // ---------- Results: "What if?" sliders re-check the student's own details live (nothing is saved) ----------
  var wi = document.querySelector("[data-whatif]");
  if (wi && window.fetch) {
    var wiFields = Array.prototype.slice.call(wi.querySelectorAll("[data-wi-field]"));
    var wiList = wi.querySelector("[data-wi-list]");
    var wiSummary = wi.querySelector("[data-wi-summary]");
    var wiReset = wi.querySelector("[data-wi-reset]");
    var inr = function (n) { return "\u20b9" + Math.round(n).toLocaleString("en-IN"); };
    var fmt = function (f, v) { return f === "annual_income" ? inr(v) : Math.round(v) + "%"; };
    var short = function (f, v) {
      if (f !== "annual_income") return v + "%";
      return v >= 100000 ? "\u20b9" + (v / 100000).toFixed(v % 100000 ? 1 : 0).replace(".0", "") + "L" : inr(v);
    };
    var baseline = null, timer = null, ctrl = null, shownValue = 0;
    var state = {};

    wiFields.forEach(function (box) {
      var f = box.getAttribute("data-wi-field");
      var range = box.querySelector("[data-wi-range]");
      var start = box.getAttribute("data-start");
      var told = start !== "";
      state[f] = { box: box, range: range, told: told, start: told ? +start : null, touched: false };
      range.value = told ? Math.min(+range.max, +start) : (f === "annual_income" ? 100000 : 60);
      paint(f);
      range.addEventListener("input", function () {
        state[f].touched = true;
        paint(f);
        clearTimeout(timer);
        timer = setTimeout(check, 90);
      });
    });

    function paint(f) {
      var st = state[f], r = st.range, v = +r.value;
      r.style.setProperty("--fill", ((v - r.min) / (r.max - r.min)) * 100 + "%");
      var untold = !st.told && !st.touched;
      st.box.classList.toggle("is-untold", untold);
      st.box.querySelector("[data-wi-out]").textContent = untold ? "\u2014" : fmt(f, v) + (f === "annual_income" && v >= +r.max ? "+" : "");
      var note = st.box.querySelector("[data-wi-note]");
      note.textContent = untold ? T("wi.not_told") : (st.told && st.touched && v !== st.start ? T("wi.yours", { v: fmt(f, st.start) }) : "");
      st.box.querySelectorAll("[data-limit]").forEach(function (chip) {
        var lim = +chip.getAttribute("data-limit");
        chip.classList.toggle("is-crossed", !untold && (f === "annual_income" ? v > lim : v < lim));
      });
    }

    function payload() {
      var out = {};
      Object.keys(state).forEach(function (f) { if (state[f].touched) out[f] = +state[f].range.value; });
      return out;
    }

    function countTo(target) {
      var from = shownValue, t0 = null;
      shownValue = target;
      if (reduceMotion || from === target) { setSummaryValue(target); return; }
      function step(ts) {
        if (!t0) t0 = ts;
        var k = Math.min(1, (ts - t0) / 450);
        setSummaryValue(from + (target - from) * (1 - Math.pow(1 - k, 3)));
        if (k < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    }
    var lastCount = 0;
    function setSummaryValue(v) { wiSummary.textContent = T("wi.summary", { n: lastCount, v: inr(v) }); }

    function render(data) {
      if (!baseline) {
        baseline = {};
        data.schemes.forEach(function (row) { baseline[row.id] = row.status; });
        Object.keys(data.limits || {}).forEach(function (f) {
          if (!state[f]) return;
          var holder = state[f].box.querySelector("[data-wi-limits]");
          holder.innerHTML = "";
          (data.limits[f] || []).forEach(function (l) {
            var chip = document.createElement("span");
            chip.className = "wi-limit";
            chip.setAttribute("data-limit", l.value);
            chip.textContent = (f === "annual_income" ? "\u2264 " : "\u2265 ") + short(f, l.value);
            holder.appendChild(chip);
          });
          paint(f);
        });
      }
      lastCount = data.summary.likely_count;
      countTo(data.summary.likely_value_inr);
      wiList.innerHTML = "";
      var hiddenNo = 0;
      data.schemes.forEach(function (row) {
        var was = baseline[row.id];
        // Keep the box short: what you'd get, what needs one check, and anything that just changed.
        if (row.status === "no" && (!was || was === "no")) { hiddenNo++; return; }
        var li = document.createElement("li");
        li.className = "wi-item is-" + row.status;
        if (was && was !== row.status && (row.status === "likely" || was === "likely")) li.className += row.status === "likely" ? " is-gain" : " is-loss";
        var name = document.createElement("span"); name.className = "wi-name"; name.textContent = row.name;
        var pill = document.createElement("span"); pill.className = "wi-pill is-" + row.status; pill.textContent = T("grp." + row.status);
        li.appendChild(name); li.appendChild(pill);
        if (/is-gain|is-loss/.test(li.className)) {
          var ch = document.createElement("span"); ch.className = "wi-change";
          ch.textContent = li.className.indexOf("is-gain") > -1 ? "\u2191 " + T("wi.gain") : "\u2193 " + T("wi.loss");
          li.appendChild(ch);
        }
        if (row.status !== "likely" && row.why) {
          var why = document.createElement("span"); why.className = "wi-why"; why.textContent = row.why;
          li.appendChild(why);
        }
        wiList.appendChild(li);
      });
      if (hiddenNo) {
        var more = document.createElement("li");
        more.className = "wi-more";
        more.textContent = T("wi.others", { n: hiddenNo });
        wiList.appendChild(more);
      }
      wiReset.hidden = !Object.keys(payload()).length;
    }

    function check() {
      if (ctrl && ctrl.abort) ctrl.abort();
      ctrl = window.AbortController ? new AbortController() : null;
      fetch("/api/whatif", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin",
        body: JSON.stringify(payload()), signal: ctrl ? ctrl.signal : undefined
      }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then(render)
        .catch(function (e) { if (!e || e.name !== "AbortError") { if (!baseline) wi.hidden = true; else toast(T("wi.error")); } });
    }

    wiReset.addEventListener("click", function () {
      Object.keys(state).forEach(function (f) {
        var st = state[f];
        st.touched = false;
        st.range.value = st.told ? Math.min(+st.range.max, st.start) : (f === "annual_income" ? 100000 : 60);
        paint(f);
      });
      check();
    });

    wi.hidden = false;
    check();
  }

  // ---------- 90-second guided tour (/demo): a guide card that spotlights each feature on the real pages ----------
  (function () {
    var KEY = "prapti:tour";
    var STEPS = [
      { page: "/results", sel: ".summary-card", text: "tour.s1" },
      { page: "/results", sel: ".understood", text: "tour.s2" },
      { page: "/results", sel: "[data-whatif]", text: "tour.s3" },
      { page: "/results", sel: ".result-group", text: "tour.s4" },
      { page: "scheme", sel: ".rule-list", text: "tour.s5" },
      { page: "/documents", sel: ".trip-group", text: "tour.s6" },
      { page: "/documents", sel: null, text: "tour.s7" }
    ];
    function session(k, v) {
      try {
        if (v === undefined) return sessionStorage.getItem(k);
        if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v);
      } catch (e) { return null; }
    }
    if (/[?&]tour=1\b/.test(location.search)) {
      session(KEY, "0");
      if (history.replaceState) history.replaceState(null, "", location.pathname + location.hash);
    }
    var at = session(KEY);
    if (at === null) return;
    var i = parseInt(at, 10) || 0;
    if (location.pathname === "/results") {
      var firstLikely = document.querySelector(".result-group .scheme-card");
      if (firstLikely) session(KEY + "-scheme", firstLikely.getAttribute("href"));
    }
    function pathFor(step) { return step.page === "scheme" ? (session(KEY + "-scheme") || "/results") : step.page; }
    function here(step) { return step.page === "scheme" ? location.pathname.indexOf("/scheme/") === 0 : location.pathname === step.page; }
    if (!STEPS[i] || !here(STEPS[i])) { session(KEY, null); return; } // left the tour route: end it quietly

    var card = document.createElement("div");
    card.className = "tour-card";
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-label", T("tour.start"));
    card.innerHTML = '<div class="tour-top"><span class="tour-count"></span><button type="button" class="tour-x" aria-label=""></button></div>' +
      '<div class="tour-bar"><span></span></div><p class="tour-text" aria-live="polite"></p>' +
      '<div class="tour-actions"><button type="button" class="btn btn-secondary btn-small tour-back"></button>' +
      '<button type="button" class="btn btn-primary btn-small tour-next"></button></div>';
    document.body.appendChild(card);
    document.body.classList.add("tour-on");
    var focused = null;

    function end(goHome) {
      session(KEY, null);
      if (focused) focused.classList.remove("tour-focus");
      document.body.classList.remove("tour-on");
      card.remove();
      if (goHome) location.href = "/";
    }
    function show() {
      var step = STEPS[i];
      if (focused) focused.classList.remove("tour-focus");
      focused = step.sel ? document.querySelector(step.sel) : null;
      if (focused) {
        focused.classList.add("tour-focus");
        var tall = focused.offsetHeight > window.innerHeight * 0.55;
        focused.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: tall ? "start" : "center" });
      }
      card.classList.toggle("is-final", !step.sel);
      card.querySelector(".tour-count").textContent = T("tour.step", { i: i + 1, n: STEPS.length });
      card.querySelector(".tour-bar span").style.width = ((i + 1) / STEPS.length) * 100 + "%";
      card.querySelector(".tour-text").textContent = T(step.text);
      var x = card.querySelector(".tour-x"); x.textContent = "\u00d7"; x.setAttribute("aria-label", T("tour.close"));
      var back = card.querySelector(".tour-back");
      back.textContent = T("tour.back"); back.hidden = i === 0;
      card.querySelector(".tour-next").textContent = i === STEPS.length - 1 ? T("tour.try") : T("tour.next");
      session(KEY, String(i));
    }
    function go(to) {
      if (to < 0) return;
      if (to >= STEPS.length) { end(true); return; }
      i = to;
      if (!here(STEPS[i])) { session(KEY, String(i)); location.href = pathFor(STEPS[i]); return; }
      show();
    }
    card.querySelector(".tour-next").addEventListener("click", function () { go(i + 1); });
    card.querySelector(".tour-back").addEventListener("click", function () { go(i - 1); });
    card.querySelector(".tour-x").addEventListener("click", function () { end(false); });
    document.addEventListener("keydown", function (ev) {
      if (!document.body.classList.contains("tour-on")) return;
      if (ev.key === "Escape") end(false);
      if (ev.key === "ArrowRight" && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) go(i + 1);
      if (ev.key === "ArrowLeft" && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) go(i - 1);
    });
    // wait a beat so the page's own entrances and the What-if box are in place first
    setTimeout(show, 350);
  })();

  // ---------- Home: proof numbers count up once when they come into view ----------
  var nums = document.querySelectorAll(".proof-num[data-count]");
  if (nums.length && "IntersectionObserver" in window && !reduceMotion) {
    var cio = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        cio.unobserve(e.target);
        var el = e.target, to = +el.getAttribute("data-count"), suf = el.getAttribute("data-suffix") || "", t0 = null;
        if (!to) return;
        function step(ts) {
          if (!t0) t0 = ts;
          var k = Math.min(1, (ts - t0) / 900);
          el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3))) + suf;
          if (k < 1) requestAnimationFrame(step);
        }
        el.textContent = "0" + suf;
        requestAnimationFrame(step);
      });
    }, { threshold: 0.6 });
    nums.forEach(function (n) { cio.observe(n); });
  }

  // A hello for anyone who opens the developer console (judges included)
  try {
    console.log("%cPrapti %c\u0c2a\u0c4d\u0c30\u0c3e\u0c2a\u0c4d\u0c24\u0c3f", "font:700 20px system-ui;color:#1f3b70", "font:400 16px system-ui;color:#2f4a68");
    console.log("Rules live in data/schemes.json, the reader in engine/extract.py. No AI decides eligibility, and no ID number is ever stored. github.com/KAVY-01/prapti");
  } catch (e) {}
})();
