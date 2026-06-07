module.exports = {
  layout: "tenant.njk",
  tags: "tenant",
  permalink: "/whats-here/{{ page.fileSlug }}/",
  eleventyComputed: {
    title: (data) => data.name
  }
};
