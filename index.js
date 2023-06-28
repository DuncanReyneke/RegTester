const fetch = require("isomorphic-fetch");
const { DOMParser } = require("xmldom");
const storage = require("node-persist");
const fs = require("fs");

// Initialize storage
storage.init();

// Array to store the changed URLs
const changedUrls = [];

// Function to fetch the sitemap index XML
async function fetchSitemapIndex(url) {
  const response = await fetch(url);
  const xml = await response.text();
  return xml;
}

// Function to extract sitemap URLs from the sitemap index XML
function extractSitemapUrls(sitemapIndexXml) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(sitemapIndexXml, "text/xml");
  const sitemapNodes = doc.getElementsByTagName("loc");
  const sitemapUrls = Array.from(sitemapNodes).map((node) => node.textContent);
  return sitemapUrls;
}

// Function to fetch the sitemap XML
async function fetchSitemap(url) {
  const response = await fetch(url);
  const xml = await response.text();
  return xml;
}

// Function to extract URLs from the sitemap XML
function extractUrlsFromSitemap(xml) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, "text/xml");
  const urlNodes = doc.getElementsByTagName("loc");
  const urls = Array.from(urlNodes).map((node) => node.textContent);
  return urls;
}

// Function to calculate the MD5 hash of a string
function calculateHash(content) {
  let hash = 0,
    i,
    chr;
  if (content.length === 0) return hash;
  for (i = 0; i < content.length; i++) {
    chr = content.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash |= 0; // Convert to 32-bit integer
  }
  return hash;
}

// Function to fetch the page content with timeout
async function fetchPageContent(url, timeout = 480000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, { signal: controller.signal });
    const content = await response.text();
    clearTimeout(timeoutId);
    return content;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

// Function to check if the page content has changed
async function checkContentChanges(url) {
  const storedHash = await storage.getItem(url);

  return fetchPageContent(url)
    .then((newContent) => {
      const newHash = calculateHash(newContent);

      if (storedHash !== newHash.toString()) {
        // Page content has changed
        console.log(`Page content has changed for URL: ${url}`);

        // Store the updated hash
        storage.setItem(url, newHash.toString());

        // Add the changed URL to the array
        changedUrls.push(url);
      } else {
        // Page content remains the same
        console.log(`Page content has not changed for URL: ${url}`);
      }
    })
    .catch((error) => {
      console.error(`Error fetching page content for URL: ${url}`, error);
    });
}

// Fetch the sitemap index XML
const sitemapIndexUrl = "https://lcef.org/sitemap_index.xml";
fetchSitemapIndex(sitemapIndexUrl)
  .then(async (sitemapIndexXml) => {
    // Extract sitemap URLs from the sitemap index
    const sitemapUrls = extractSitemapUrls(sitemapIndexXml);

    // Array to store the promises for content changes
    const promises = [];

    // Iterate over each sitemap URL
    for (const sitemapUrl of sitemapUrls) {
      // Fetch the sitemap XML
      const sitemapXml = await fetchSitemap(sitemapUrl);

      // Extract URLs from the sitemap
      const urls = extractUrlsFromSitemap(sitemapXml);

      // Iterate over each URL and check for content changes
      for (const url of urls) {
        promises.push(checkContentChanges(url));
      }
    }

    // Wait for all promises to resolve
    await Promise.all(promises);

    // Write the changed URLs to a CSV file
    const csvData = changedUrls.join("\n");
    fs.writeFileSync("changed_urls.csv", csvData);

    console.log("Changed URLs exported to changed_urls.csv");
  })
  .catch((error) => {
    console.error("Error fetching sitemap index:", error);
  });
