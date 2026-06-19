module.exports = {
  eleventyComputed: {
    permalink: (data) => {
      if (!data.title) return false;
      const slug = String(data.title)
        .toLowerCase()
        .replace(/['\u2018\u2019]/g, "")   // remove straight + curly apostrophes
        .replace(/&#?\w+;/g, "")            // remove any HTML entities
        .replace(/[^a-z0-9]+/g, "-")        // anything else -> hyphen
        .replace(/^-+|-+$/g, "");           // trim leading/trailing hyphens
      return "/past/" + slug + "/";
    }
  }
};
