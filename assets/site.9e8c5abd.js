/* Dates'n Tamr storefront – vanilla JS, no dependencies */
(function () {
  "use strict";
  var S = window.SITE || { base: "", lang: "ar" };
  var EN = S.lang === "en";
  var KEY = "tamr_cart";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  // ---------- helpers ----------
  function num(p) {
    var neg = p < 0; p = Math.abs(p);
    var w = Math.floor(p / 100), f = p % 100;
    var s = String(w).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    if (f) s += "." + (f < 10 ? "0" : "") + f;
    return (neg ? "-" : "") + s;
  }
  function money(p) { return EN ? "EGP " + num(p) : num(p) + " ج.م"; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function load() { try { var c = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(c) ? c : []; } catch (e) { return []; } }
  function save(c) { localStorage.setItem(KEY, JSON.stringify(c)); badge(); }
  function badge() {
    var n = load().reduce(function (a, i) { return a + (i.q || 0); }, 0);
    $$(".cart-count").forEach(function (b) { b.textContent = n; b.hidden = n === 0; });
  }
  function add(id, choices, qty) {
    var c = load(), k = choices.join(","), found = false;
    c.forEach(function (i) { if (i.id === id && i.c.join(",") === k) { i.q = Math.min(99, i.q + qty); found = true; } });
    if (!found) c.push({ id: id, c: choices, q: qty });
    save(c);
  }
  var toastTimer;
  function toast(html) {
    var t = $("#toast"); if (!t) return;
    t.innerHTML = html; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, 3500);
  }
  function addedToast() {
    toast((EN ? "Added to cart ✓" : "تمت الإضافة للسلة ✓") + ' <a href="' + S.cart + '">' + (EN ? "Checkout" : "إتمام الطلب") + "</a>");
  }

  badge();
  window.addEventListener("storage", badge);

  // ---------- quick add (grid) ----------
  $$(".add-quick").forEach(function (b) {
    b.addEventListener("click", function () {
      var ch = (b.dataset.choices || "").split(",").filter(Boolean).map(Number);
      add(Number(b.dataset.id), ch, 1);
      addedToast();
    });
  });

  // ---------- catalog search & sort ----------
  var grid = $("#grid");
  if (grid) {
    var cards = $$(".card", grid), q = $("#q"), sort = $("#sort");
    var collator = new Intl.Collator(EN ? "en" : "ar");
    var norm = function (s) { return s.toLowerCase().replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي"); };
    var apply = function () {
      var term = norm(q.value.trim()), mode = sort.value, shown = 0;
      cards.sort(function (a, b) {
        var A = a.dataset, B = b.dataset;
        switch (mode) {
          case "best": return B.best - A.best;
          case "new": return B["new"] < A["new"] ? -1 : 1;
          case "pa": return A.price - B.price;
          case "pd": return B.price - A.price;
          case "na": return collator.compare(a.querySelector("h3").textContent, b.querySelector("h3").textContent);
          case "nd": return collator.compare(b.querySelector("h3").textContent, a.querySelector("h3").textContent);
          default: return A.rec - B.rec;
        }
      });
      cards.forEach(function (c) {
        var ok = !term || norm(c.dataset.name).indexOf(term) >= 0;
        c.hidden = !ok; if (ok) shown++;
        grid.appendChild(c);
      });
      $("#noresults").hidden = shown > 0;
    };
    q.addEventListener("input", apply);
    sort.addEventListener("change", apply);
  }

  // ---------- product page ----------
  var pdEl = $("#pd");
  if (pdEl) {
    var pd = JSON.parse(pdEl.textContent);
    var form = $("#addForm"), priceEl = $("#price"), qtyIn = form.querySelector("[name=qty]");
    var main = $("#mainImg"), lb = $("#lightbox");
    $$(".thumbs button").forEach(function (t) {
      t.addEventListener("click", function () {
        $$(".thumbs button").forEach(function (x) { x.classList.remove("on"); });
        t.classList.add("on");
        main.href = t.dataset.full; main.querySelector("img").src = t.dataset.full;
      });
    });
    if (main && lb && lb.showModal) {
      main.addEventListener("click", function (e) { e.preventDefault(); lb.querySelector("img").src = main.href; lb.showModal(); });
      lb.addEventListener("click", function () { lb.close(); });
    }
    var selects = $$("select", form);
    var update = function () {
      var p = pd.price;
      selects.forEach(function (s) { p += Number(s.selectedOptions[0].dataset.d || 0); });
      priceEl.textContent = money(p);
    };
    selects.forEach(function (s) { s.addEventListener("change", update); });
    $$(".qty button", form).forEach(function (b) {
      b.addEventListener("click", function () {
        qtyIn.value = Math.max(1, Math.min(99, (parseInt(qtyIn.value, 10) || 1) + Number(b.dataset.step)));
      });
    });
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var qn = Math.max(1, Math.min(99, parseInt(qtyIn.value, 10) || 1));
      add(pd.id, selects.map(function (s) { return Number(s.value); }), qn);
      form.querySelector(".after-add").hidden = false;
      addedToast();
    });
  }

  // ---------- cart & checkout ----------
  var app = $("#cartApp");
  if (!app) return;
  var T = JSON.parse($("#i18n").textContent);
  var cat = null, api = null, online = false;
  var itemsEl = $("#cartItems"), form2 = $("#checkout"), areaSel = $("#areaSel");
  $$("[data-t]", form2).forEach(function (el) { el.textContent = T[el.dataset.t]; });
  $("#placeBtn").textContent = T.place_order;

  function lines() {
    var out = [];
    load().forEach(function (it, idx) {
      var p = cat.products.filter(function (x) { return x.id === it.id; })[0];
      var line = { idx: idx, it: it, p: p, ok: false, unit: 0, labels: [] };
      if (p && p.stock && it.c.length === p.groups.length) {
        line.ok = true; line.unit = p.price;
        p.groups.forEach(function (g, gi) {
          var ch = g.c.filter(function (c) { return c.id === it.c[gi]; })[0];
          if (!ch) { line.ok = false; return; }
          line.unit += ch.d;
          line.labels.push((EN && g.en ? g.en : g.ar) + ": " + (EN && ch.en ? ch.en : ch.ar));
        });
      }
      out.push(line);
    });
    return out;
  }
  function area() {
    var id = Number(areaSel.value);
    return cat.areas.filter(function (a) { return a.id === id; })[0];
  }
  function totals(ls) {
    var sub = ls.reduce(function (a, l) { return a + (l.ok ? l.unit * l.it.q : 0); }, 0);
    var a = area(), fee = a ? a.fee : 0;
    return { sub: sub, fee: fee, total: sub + fee, area: a };
  }

  function render() {
    var ls = lines();
    if (!ls.length) {
      itemsEl.innerHTML = '<div class="panel center"><p>' + T.cart_empty + '</p><a class="btn" href="' + S.base + (EN ? "/en" : "") + '/#shop">' + T.back + "</a></div>";
      form2.hidden = true; return;
    }
    form2.hidden = false;
    itemsEl.innerHTML = ls.map(function (l) {
      var name = l.p ? (EN && l.p.en ? l.p.en : l.p.ar) : "—";
      var href = l.p ? S.base + (EN ? "/en" : "") + "/p/" + l.p.slug + "/" : "#";
      return '<div class="ci' + (l.ok ? "" : " bad") + '">' +
        (l.p && l.p.img ? '<img src="' + esc(l.p.img) + '" alt="">' : "<span></span>") +
        '<div><h3><a href="' + href + '">' + esc(name) + "</a></h3>" +
        (l.labels.length ? '<div class="opts">' + esc(l.labels.join(" · ")) + "</div>" : "") +
        "<div>" + (l.ok ? money(l.unit) : T.unavailable) + "</div></div>" +
        '<div class="end"><div class="qty sm"><button type="button" data-i="' + l.idx + '" data-s="-1">−</button>' +
        '<input value="' + l.it.q + '" readonly><button type="button" data-i="' + l.idx + '" data-s="1">+</button></div>' +
        "<b>" + (l.ok ? money(l.unit * l.it.q) : "") + "</b>" +
        '<button type="button" class="rm" data-rm="' + l.idx + '">' + T.remove + "</button></div></div>";
    }).join("");
    var t = totals(ls);
    $("#tSub").textContent = money(t.sub);
    $("#tDel").textContent = t.area ? money(t.fee) : "—";
    $("#tTot").textContent = money(t.total);
    var err = $("#formErr");
    if (cat.min > 0 && t.sub < cat.min) { err.textContent = T.min_order + ": " + money(cat.min); err.hidden = false; $("#placeBtn").disabled = true; }
    else { if (err.dataset.min !== "x") err.hidden = true; $("#placeBtn").disabled = false; }
  }

  itemsEl.addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (!b) return;
    var c = load();
    if (b.dataset.rm != null) c.splice(Number(b.dataset.rm), 1);
    else if (b.dataset.i != null) {
      var it = c[Number(b.dataset.i)];
      it.q = Math.max(1, Math.min(99, it.q + Number(b.dataset.s)));
    }
    save(c); render();
  });
  areaSel.addEventListener("change", render);

  function formData() {
    var f = form2.elements;
    return { name: f.name.value.trim(), phone: f.phone.value.trim(), email: f.email.value.trim(), area: Number(f.area.value) || 0, address: f.address.value.trim(), notes: f.notes.value.trim(), website: f.website.value };
  }
  function normPhone(s) {
    s = s.replace(/[٠-٩]/g, function (d) { return "٠١٢٣٤٥٦٧٨٩".indexOf(d); }).replace(/\D/g, "");
    if (s.indexOf("0020") === 0) s = "0" + s.slice(4);
    else if (s.indexOf("20") === 0 && s.length === 12) s = "0" + s.slice(2);
    else if (s.length === 10 && s[0] === "1") s = "0" + s;
    return /^01[0125]\d{8}$/.test(s) ? s : "";
  }
  function validate(d) {
    $$(".bad", form2).forEach(function (x) { x.classList.remove("bad"); });
    var f = form2.elements, e = null;
    if (!d.name) e = [f.name, T.err_name];
    else if (!normPhone(d.phone)) e = [f.phone, T.err_phone];
    else if (d.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email)) e = [f.email, T.err_email];
    else if (!d.area) e = [f.area, T.err_area];
    else if (d.address.length < 5) e = [f.address, T.err_address];
    if (e) { e[0].classList.add("bad"); e[0].focus(); showErr(e[1]); return false; }
    $("#formErr").hidden = true; return true;
  }
  function showErr(m) { var el = $("#formErr"); el.textContent = m; el.hidden = false; }

  function waText(d, ls, t, orderId) {
    var out = [(orderId ? (EN ? "Order #" : "طلب رقم #") + orderId : (EN ? "New order" : "طلب جديد")) + " – " + document.title.split("|").pop().trim()];
    ls.forEach(function (l) { if (l.ok) out.push("• " + (EN && l.p.en ? l.p.en : l.p.ar) + (l.labels.length ? " (" + l.labels.join("، ") + ")" : "") + " × " + l.it.q + " = " + money(l.unit * l.it.q)); });
    out.push(T.subtotal + ": " + money(t.sub), T.delivery + ": " + money(t.fee), T.total + ": " + money(t.total), "");
    out.push(d.name, normPhone(d.phone) || d.phone);
    if (t.area) out.push(EN ? t.area.en || t.area.ar : t.area.ar);
    out.push(d.address);
    if (d.notes) out.push(d.notes);
    return "https://wa.me/" + cat.wa + "?text=" + encodeURIComponent(out.join("\n"));
  }

  function setOffline() {
    online = false;
    var o = $("#offline");
    o.innerHTML = "<p>" + T.offline + "</p>";
    o.hidden = false;
    $("#placeBtn").textContent = T.wa_order;
  }

  form2.addEventListener("submit", function (e) {
    e.preventDefault();
    var d = formData(), ls = lines(), t = totals(ls);
    if (!validate(d)) return;
    if (!ls.some(function (l) { return l.ok; })) return;
    if (!online) { window.open(waText(d, ls, t), "_blank"); return; }
    var btn = $("#placeBtn"); btn.disabled = true; btn.textContent = T.placing;
    var body = {
      name: d.name, phone: d.phone, email: d.email, area: d.area, address: d.address, notes: d.notes, website: d.website, lang: S.lang,
      items: ls.filter(function (l) { return l.ok; }).map(function (l) { return { id: l.it.id, choices: l.it.c, qty: l.it.q }; })
    };
    fetch(api + "/api/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error(res.j && res.j.message ? res.j.message : T.err_generic);
        var j = res.j;
        localStorage.removeItem(KEY); badge();
        app.hidden = true;
        var done = $("#done");
        done.innerHTML = "<h2>✅</h2><p>" + T.order_ok + "</p><p>" + T.order_no + '</p><div class="big-no">#' + j.id + "</div>" +
          "<p>" + T.total + ": <b>" + money(j.total) + "</b></p>" +
          '<p><a class="btn wa" target="_blank" rel="noopener" href="' + waText(d, ls, { sub: j.subtotal, fee: j.delivery_fee, total: j.total, area: t.area }, j.id) + '">' + T.wa_confirm + "</a></p>" +
          '<p><a class="btn ghost" href="' + S.base + (EN ? "/en" : "") + '/">' + T["continue"] + "</a></p>";
        done.hidden = false;
        window.scrollTo(0, 0);
      })
      .catch(function (err) {
        btn.disabled = false; btn.textContent = T.place_order;
        if (err instanceof TypeError) { setOffline(); showErr(T.offline); } else showErr(err.message);
      });
  });

  function withTimeout(p, ms) {
    return Promise.race([p, new Promise(function (_, rej) { setTimeout(function () { rej(new Error("timeout")); }, ms); })]);
  }
  var local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  Promise.all([
    fetch(S.base + "/catalog.json?v=" + Math.floor(Date.now() / 60000)).then(function (r) { return r.json(); }),
    local ? Promise.resolve({ api: "" }) : fetch(S.base + "/api.json?t=" + Date.now()).then(function (r) { return r.json(); }).catch(function () { return { api: null }; })
  ]).then(function (res) {
    cat = res[0];
    api = res[1].api;
    areaSel.innerHTML = (cat.areas.length > 1 ? '<option value="">' + T.choose_area + "</option>" : "") +
      cat.areas.map(function (a) { return '<option value="' + a.id + '">' + esc(EN && a.en ? a.en : a.ar) + " (+" + money(a.fee) + ")</option>"; }).join("");
    render();
    if (api === null || (api === "" && !local)) { setOffline(); return; }
    withTimeout(fetch(api + "/api/health", { cache: "no-store" }), 6000)
      .then(function (r) { if (!r.ok) throw 0; online = true; })
      .catch(setOffline);
  }).catch(function () { itemsEl.innerHTML = '<p class="err">' + T.err_generic + "</p>"; });
})();
