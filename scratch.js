const puppeteer = require("puppeteer");
const Sitemapper = require("sitemapper");
const { PNG } = require("pngjs");
const pixelmatch = require("pixelmatch");
const fs = require("fs");

// The threshold below determines the percentage of pixels that can be different before
// we consider the screenshot to be different. A lower value means the script will be
// more sensitive to small changes, but may also generate more false positives.
const threshold = 0.2;

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  const sitemapUrl = "[YOURURL]/sitemap_index.xml";
  const sitemap = new Sitemapper({
    url: sitemapUrl,
    timeout: 300000, // Set a 5-minute timeout for parsing
  });

  try {
    const sitemapUrls = await sitemap.fetch();
    console.log(sitemapUrls);

    // Loop through each page on the sitemap
    for (const url of sitemapUrls.sites) {
      // Load the old screenshot if it exists
      const oldPath = `screenshots/${url.replace(/[/\\?%*:|"<>]/g, "_")}.png`;
      let oldImage;
      try {
        oldImage = PNG.sync.read(fs.readFileSync(oldPath));
      } catch {
        oldImage = null;
      }

      // Take a new screenshot
      await page.goto(url, { waitUntil: "networkidle0", timeout: 60000 });
      await page.waitForTimeout(5000); // Wait for 5 seconds
      const newImage = await page.screenshot({
        encoding: "binary",
      });

      const newImageBuffer = Buffer.from(newImage, "binary");

      // If there is no old screenshot, save the new screenshot and continue
      if (!oldImage) {
        fs.writeFileSync(oldPath, newImageBuffer);
        continue;
      }

      // Load the new screenshot
      const newImagePNG = PNG.sync.read(newImageBuffer);

      // Compare the old and new screenshots using pixelmatch
      const diff = pixelmatch(
        oldImage.data,
        newImagePNG.data,
        null,
        oldImage.width,
        oldImage.height,
        { threshold }
      );

      // If the screenshots are different, save the new screenshot and log a message
      if (diff > 0) {
        console.log(`Screenshot for ${url} has changed`);
        fs.writeFileSync(oldPath, newImageBuffer);
        oldImage = newImagePNG; // Set oldImage to the new image
      }
    }
  } catch (error) {
    console.error(error);
  }

  await browser.close();
})();
