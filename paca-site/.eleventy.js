module.exports = function (eleventyConfig) {
  // Copy static assets and the CMS admin straight through to the build
  eleventyConfig.addPassthroughCopy({ "src/assets": "assets" });
  eleventyConfig.addPassthroughCopy({ "src/admin": "admin" });

  // Shows collection, sorted by start date
  eleventyConfig.addCollection("shows", (api) =>
    api.getFilteredByGlob("src/shows/*.md").sort((a, b) => {
      return new Date(a.data.date_start || "2999-12-31") - new Date(b.data.date_start || "2999-12-31");
    })
  );

  // Sponsors collection, sorted by order
  eleventyConfig.addCollection("sponsors", (api) =>
    api.getFilteredByGlob("src/sponsors/*.md").sort((a, b) => (a.data.order || 0) - (b.data.order || 0))
  );

  // Cast bios for the unlisted /bios/ page, sorted by order field
  eleventyConfig.addCollection("bios_people", (api) =>
    api.getFilteredByGlob("src/bios-people/*.md").sort((a, b) => (a.data.order || 0) - (b.data.order || 0))
  );

  // Tech SOPs, grouped by category in a sensible running order
  eleventyConfig.addCollection("sopGroups", (api) => {
    const items = api.getFilteredByGlob("src/sops/*.md").sort((a, b) => (a.data.order || 0) - (b.data.order || 0));
    const order = ["Lighting", "Sound", "Stage / Rigging", "Projection / Video", "Front of House", "Opening / Closing", "General", "Other"];
    const groups = {};
    items.forEach((i) => { const c = i.data.category || "Other"; (groups[c] = groups[c] || []).push(i); });
    return Object.keys(groups)
      .sort((a, b) => ((order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99)) || a.localeCompare(b))
      .map((c) => ({ category: c, items: groups[c] }));
  });

  // Past productions: archive entries + shows marked "past", grouped by year (newest first)
  const mdLib = require("markdown-it")({ html: true, breaks: true, linkify: true });
  eleventyConfig.addFilter("markdownify", (str) => (str ? mdLib.render(str) : ""));

  eleventyConfig.addFilter("extlink", (u) => {
    if (!u) return "";
    u = String(u).trim();
    if (/^(https?:|mailto:|tel:)/i.test(u)) return u;
    if (/^\/\//.test(u)) return "https:" + u;
    return "https://" + u.replace(/^\/+/, "");
  });

  eleventyConfig.addFilter("absUrl", (path, base) => {
    if (!path) return "";
    if (/^https?:\/\//i.test(path)) return path;
    base = String(base || "").replace(/\/+$/, "");
    return base + "/" + String(path).replace(/^\/+/, "");
  });

  eleventyConfig.addFilter("schemaDate", (d) => {
    if (!d) return "";
    const dt = new Date(d);
    if (isNaN(dt)) return "";
    const p = (n) => String(n).padStart(2, "0");
    const Y = dt.getUTCFullYear(), M = p(dt.getUTCMonth() + 1), D = p(dt.getUTCDate());
    const h = dt.getUTCHours(), m = dt.getUTCMinutes();
    return (h === 0 && m === 0) ? `${Y}-${M}-${D}` : `${Y}-${M}-${D}T${p(h)}:${p(m)}:00`;
  });

  eleventyConfig.addCollection("pastByYear", (api) => {
    const arch = api.getFilteredByGlob("src/archive/*.md").map((i) => ({
      title: i.data.title, year: parseInt(i.data.year, 10) || 0, discipline: i.data.discipline,
      image: i.data.image, blurb: i.data.blurb, playbill: i.data.playbill || null, url: i.url }));
    const shows = api.getFilteredByGlob("src/shows/*.md")
      .filter((s) => (s.data.status || "") === "past")
      .map((s) => ({ title: s.data.title, year: s.data.date_start ? new Date(s.data.date_start).getUTCFullYear() : 0,
        discipline: s.data.discipline, image: s.data.image, blurb: s.data.summary, playbill: s.data.playbill || null, url: s.url }));
    const all = arch.concat(shows).filter((x) => x.year);
    const byYear = {};
    all.forEach((x) => { (byYear[x.year] = byYear[x.year] || []).push(x); });
    return Object.keys(byYear).sort((a, b) => b - a).map((y) => ({
      year: parseInt(y, 10), items: byYear[y].sort((a, b) => (a.title || "").localeCompare(b.title || "")) }));
  });

  // --- Filters ---
  eleventyConfig.addFilter("isActive", (pageUrl, prefixes) =>
    (prefixes || []).some((p) => pageUrl === p || pageUrl.indexOf(p) === 0)
  );

  // Add-to-calendar links (treats stored time as wall-clock / floating local)
  const _stamp = (d) => { const x = new Date(d); const p = (n) => String(n).padStart(2, "0");
    return x.getUTCFullYear() + p(x.getUTCMonth() + 1) + p(x.getUTCDate()) + "T" + p(x.getUTCHours()) + p(x.getUTCMinutes()) + "00"; };
  const _end = (s, e) => { if (e) return new Date(e); const x = new Date(s); x.setUTCHours(x.getUTCHours() + 2); return x; };
  const _clean = (s) => String(s || "").replace(/[\r\n,;]+/g, " ").trim();
  eleventyConfig.addFilter("gcalHref", (start, end, title, desc, loc) => {
    if (!start) return "";
    const params = new URLSearchParams({ action: "TEMPLATE", text: _clean(title),
      dates: _stamp(start) + "/" + _stamp(_end(start, end)), details: _clean(desc), location: _clean(loc) });
    return "https://calendar.google.com/calendar/render?" + params.toString();
  });
  eleventyConfig.addFilter("icsHref", (start, end, title, desc, loc) => {
    if (!start) return "";
    const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//PACA//EN", "BEGIN:VEVENT",
      "UID:" + _stamp(start) + "@paca1505.org", "DTSTART:" + _stamp(start), "DTEND:" + _stamp(_end(start, end)),
      "SUMMARY:" + _clean(title), "DESCRIPTION:" + _clean(desc), "LOCATION:" + _clean(loc), "END:VEVENT", "END:VCALENDAR"].join("\r\n");
    return "data:text/calendar;charset=utf8," + encodeURIComponent(ics);
  });
  eleventyConfig.addFilter("featured", (arr) => (arr || []).filter((i) => i.data.featured));
  eleventyConfig.addFilter("notPast", (arr) => (arr || []).filter((i) => (i.data.status || "upcoming") !== "past"));
  eleventyConfig.addFilter("limit", (arr, n) => (arr || []).slice(0, n));
  eleventyConfig.addFilter("byDiscipline", (arr, name) => (arr || []).filter((i) => i.data.discipline === name));

  eleventyConfig.addFilter("dateDisp", (d) => {
    if (!d) return "";
    return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  });

  // Discipline -> brand color variable
  const DISC = {
    "Theatre": "var(--magenta)",
    "Music": "var(--orange)",
    "Visual Art": "var(--lime)",
    "Prose": "var(--cyan)",
    "Dance": "var(--purple)",
    "Event": "var(--yellow)",
    "Party": "var(--orange)",
    "Auditions": "var(--cyan)",
  };
  eleventyConfig.addFilter("disccolor", (d) => DISC[d] || "var(--magenta)");

  eleventyConfig.addFilter("year", () => new Date().getFullYear());

  return {
    dir: { input: "src", output: "_site", includes: "_includes", data: "_data" },
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
  };
};
