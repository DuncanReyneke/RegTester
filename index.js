const puppeteer = require("puppeteer");
const Sitemapper = require("sitemapper");

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

    // Loop through each page on the sitemap
    for (const url of sitemapUrls.sites) {
      try {
        await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });

        // Wait for a short delay after page navigation to ensure all CSS styles are applied
        await page.waitForTimeout(20000); // Adjust the delay as needed

        // Take a screenshot of the page
        await page.screenshot({
          path: `screenshots/${url.replace(/[/\\?%*:|"<>]/g, "_")}.png`,
          fullPage: true, // Capture the entire height of the page
        });

        console.log(`Screenshot captured for page: ${url}`);

        // Look for clickable link with class "rev-btn"
        const popupLink = await page.$(".rev-btn");
        if (popupLink) {
          // Scroll the page to the element
          await page.evaluate((element) => {
            element.scrollIntoView();
          }, popupLink);

          // Click the element using page.evaluate
          await page.evaluate((element) => {
            element.click();
          }, popupLink);

          // Wait for a short delay to allow the popup to fully load
          await page.waitForTimeout(4000); // Adjust the delay as needed

          // Look for element with class "spu-content"
          const popupContent = await page.$(".spu-container");
          if (popupContent) {
            const popupFilename = `screenshots/${url.replace(
              /[/\\?%*:|"<>]/g,
              "_"
            )}_popup.png`;
            await page.screenshot({
              path: popupFilename,
              fullPage: true, // Capture the entire height of the page with the popup
            });
            console.log(`Screenshot captured for popup on page: ${url}`);
          } else {
            console.log(`No popup content found for page: ${url}`);
          }
        } else {
          console.log(`No popup link found for page: ${url}`);
        }
      } catch (error) {
        if (
          error.name === "TimeoutError" &&
          error.message.includes("Navigation timeout")
        ) {
          console.log(`Timeout occurred for page: ${url}`);
        } else {
          throw error;
        }
      }
    }
  } catch (error) {
    console.error(error);
  }

  await browser.close();
})();
