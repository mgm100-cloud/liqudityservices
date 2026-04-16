import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

type ScrapeResult = {
  allsurplus: number | null;
  govdeals: number | null;
};

const URLS = {
  allsurplus:
    "https://www.allsurplus.com/en/search?isAdvSearch=1&timing=bySimple&timeType=atauction&ps=24&locationType=state&sf=bestfit&so=asc",
  govdeals:
    "https://www.govdeals.com/en/search?isAdvSearch=1&timing=bySimple&timeType=atauction&ps=24&locationType=state&sf=bestfit&so=asc",
};

async function extractResultCount(
  page: Awaited<ReturnType<Awaited<ReturnType<typeof puppeteer.launch>>["newPage"]>>,
  url: string,
): Promise<number | null> {
  await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });

  // Wait for the results count text to appear (pattern: "X,XXX Results")
  try {
    await page.waitForFunction(
      () => {
        const body = document.body?.innerText || "";
        return /[\d,]+\s+Results/i.test(body);
      },
      { timeout: 20000 },
    );
  } catch {
    // If waiting times out, still try to parse what we have
  }

  const count = await page.evaluate(() => {
    const body = document.body?.innerText || "";
    const match = body.match(/([\d,]+)\s+Results/i);
    if (match) {
      return parseInt(match[1].replace(/,/g, ""), 10);
    }
    return null;
  });

  return count;
}

export async function scrapeListings(): Promise<ScrapeResult> {
  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: { width: 1280, height: 720 },
    executablePath: await chromium.executablePath(),
    headless: true,
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    );

    const allsurplus = await extractResultCount(page, URLS.allsurplus);
    const govdeals = await extractResultCount(page, URLS.govdeals);

    return { allsurplus, govdeals };
  } finally {
    await browser.close();
  }
}
