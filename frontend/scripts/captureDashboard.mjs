import puppeteer from 'puppeteer'
import path from 'node:path'

const ARTIFACT_DIR = 'C:/Users/vaish/.gemini/antigravity/brain/3d535ab6-bd46-4ce2-845a-7f17078453ce'

async function run() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1366,900'],
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 1366, height: 900 })

  await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle2' })
  await page.type('input[type="email"]', 'patel.mart@stockflow.local')
  await page.type('input[type="password"]', 'Password123!')
  await page.click('form button.btn.primary')
  await new Promise((r) => setTimeout(r, 2500))

  await page.goto('http://localhost:5173/cashier/dashboard', { waitUntil: 'networkidle2' })
  await new Promise((r) => setTimeout(r, 2000))
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'screenshot_dashboard_no_alerts.png') })
  await browser.close()
  console.log('Done')
}

run()
