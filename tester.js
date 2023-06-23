const puppeteer = require("puppeteer");
const Sitemapper = require("sitemapper");
const { PNG } = require("pngjs");
const pixelmatch = require("pixelmatch");
const fs = require("fs");

// The threshold below determines the percentage of pixels that can be different before
// we consider the screenshot to be different. A lower value means the script will be
// more sensitive to small changes, but may also generate more false positives.
const threshold = 0.85;

// Maximum number of concurrent requests
const concurrencyLimit = 5;

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  // Set viewport width to 100% of the desktop width
  await page.setViewport({ width: 1920, height: 1080 });

  const sitemapUrl = "https://lcef.org/sitemap_index.xml";
  const sitemap = new Sitemapper({
    url: sitemapUrl,
    timeout: 300000, // Set a 5-minute timeout for parsing
  });

  try {
    const sitemapUrls = await sitemap.fetch();
    console.log(sitemapUrls);

    // Create a pool of promises to control concurrency
    const pool = [];
    let completedCount = 0;

    // Process each page on the sitemap
    for (const url of sitemapUrls.sites) {
      // Execute the page processing logic as a promise
      const promise = (async () => {
        // Load the old screenshot if it exists
        const oldPath = `screenshots/${url.replace(/[/\\?%*:|"<>]/g, "_")}.png`;
        let oldImage;
        try {
          oldImage = PNG.sync.read(fs.readFileSync(oldPath));
        } catch {
          oldImage = null;
        }

        // Take a new full-screen screenshot
        try {
          await page.goto(url, { waitUntil: "networkidle0", timeout: 60000 });

          // Wait for a short delay after page navigation to ensure all CSS styles are applied
          // await page.waitForTimeout(20000); // Adjust the delay as needed
        } catch (error) {
          console.log(`Timeout occurred for page: ${url}`);
          return;
        }
        const newImageBuffer = await page.screenshot({
          encoding: "binary",
          fullPage: true,
        });

        // If there is no old screenshot, save the new screenshot and continue
        if (!oldImage) {
          fs.writeFileSync(oldPath, newImageBuffer);
          return;
        }

        // Load the new screenshot
        const newImage = PNG.sync.read(newImageBuffer);

        // Compare the old and new screenshots using pixelmatch
        const diff = pixelmatch(
          oldImage.data,
          newImage.data,
          null,
          oldImage.width,
          oldImage.height,
          { threshold }
        );

        console.log(`Page URL: ${url}`);
        console.log(
          `Old Image Dimensions: ${oldImage.width}x${oldImage.height}`
        );
        console.log(
          `New Image Dimensions: ${newImage.width}x${newImage.height}`
        );
        console.log(`Difference: ${diff}`);

        // If the screenshots are different, save the new screenshot as a new file
        if (diff > 0) {
          const changedPath = `screenshots/${url.replace(
            /[/\\?%*:|"<>]/g,
            "_"
          )}_CHANGED.png`;
          fs.writeFileSync(changedPath, newImageBuffer);
          console.log(`Screenshot for ${url} has changed`);
        }
      })();

      // Add the promise to the pool
      pool.push(promise);

      // Control concurrency by limiting the pool size
      if (pool.length >= concurrencyLimit) {
        // Wait for any one of the promises to complete before proceeding
        await Promise.race(pool);
        completedCount++;
        console.log(
          `Completed ${completedCount}/${sitemapUrls.sites.length} requests`
        );
      }
    }

    // Wait for all remaining promises in the pool to complete
    await Promise.all(pool);

    console.log("All requests completed");
  } catch (error) {
    console.error(error);
  }

  await browser.close();
})();
