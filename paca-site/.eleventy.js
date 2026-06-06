module.exports = function (eleventyConfig) {
  // Copy static assets and the CMS admin straight through to the build
  eleventyConfig.addPassthroughCopy({ "src/assets": "assets" });
  eleventyConfig.addPassthroughCopy({ "src/admin": "admin" });

  // Shows collection, sorted by start date
  eleventyConfig.addCollection("shows", (api) =>
    api.getFilteredByGlob("src/shows/*.md").sort((a, b) => {
      return new Date(a.data.date_start || 0) - new Date(b.data.date_start || 0);
    })
  );

  // --- Filters ---
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
  };
  eleventyConfig.addFilter("disccolor", (d) => DISC[d] || "var(--magenta)");

  eleventyConfig.addFilter("year", () => new Date().getFullYear());

  return {
    dir: { input: "src", output: "_site", includes: "_includes", data: "_data" },
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
  };
};
