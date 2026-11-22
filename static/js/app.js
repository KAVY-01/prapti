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
        el.style.setProperty("--d", Math.min(i, 8) * 75 + "ms");
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
  function toast(msg) {
    var el = document.querySelector(".toast");
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
    requestAnimationFrame(function () { el.classList.add("is-visible"); });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.classList.remove("is-visible");
      setTimeout(function () { el.hidden = true; }, 300);
    }, 3000);
  }

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
  document.querySelectorAll("[data-q-form] .q-tile").forEach(function (tile) {
    tile.addEventListener("click", function () {
      tile.classList.add("is-chosen");
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
})();
