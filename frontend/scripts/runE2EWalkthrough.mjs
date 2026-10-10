import puppeteer from 'puppeteer'
import path from 'node:path'

const ARTIFACT_DIR = 'C:/Users/vaish/.gemini/antigravity/brain/3d535ab6-bd46-4ce2-845a-7f17078453ce'

async function run() {
  console.log('Launching browser...')
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,800'],
  })

  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 800 })

  try {
    // --- 1. Login as Admin to inspect GST onboarding ---
    console.log('Navigating to http://localhost:5173...')
    await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle2', timeout: 30000 })
    await new Promise((r) => setTimeout(r, 1500))

    const emailInput = await page.$('input[type="email"]')
    if (emailInput) {
      console.log('Logging in as admin@stockflow.local...')
      await page.type('input[type="email"]', 'admin@stockflow.local')
      await page.type('input[type="password"]', 'AdminPass123!')
      const loginButton = await page.$('button[type="submit"]') || await page.$('.btn.primary')
      if (loginButton) {
        await loginButton.click()
        await new Promise((r) => setTimeout(r, 4000))
      }
    }

    // Go to /admin/users
    console.log('Navigating to /admin/users...')
    await page.goto('http://localhost:5173/admin/users', { waitUntil: 'networkidle2', timeout: 30000 })
    await new Promise((r) => setTimeout(r, 2000))
    console.log('Capturing admin GST onboarding screenshot...')
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'screenshot_admin_gst.png') })

    // --- 2. Switch to Shop user to inspect Billing & GST on receipt ---
    // Log out first
    console.log('Logging out from admin...')
    const logoutBtn = await page.$('button[title*="Sign out"]') || await page.$('.btn.ghost')
    if (logoutBtn) {
      // Find sign out link or clear localStorage
      await page.evaluate(() => {
        localStorage.clear()
        window.location.href = '/login'
      })
      await new Promise((r) => setTimeout(r, 2000))
    }

    console.log('Logging in as patel.mart@stockflow.local...')
    await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle2', timeout: 30000 })
    await new Promise((r) => setTimeout(r, 1500))
    await page.type('input[type="email"]', 'patel.mart@stockflow.local')
    await page.type('input[type="password"]', 'Password123!')
    const loginButton2 = await page.$('button[type="submit"]') || await page.$('.btn.primary')
    if (loginButton2) {
      await loginButton2.click()
      await new Promise((r) => setTimeout(r, 4000))
    }

    console.log('Navigating to /cashier/billing...')
    await page.goto('http://localhost:5173/cashier/billing', { waitUntil: 'networkidle2', timeout: 30000 })
    await new Promise((r) => setTimeout(r, 2000))

    // Click Bill History tab
    const buttons = await page.$$('button')
    for (const b of buttons) {
      const text = await (await b.getProperty('textContent')).jsonValue()
      if (text && text.includes('History')) {
        await b.click()
        await new Promise((r) => setTimeout(r, 1500))
        break
      }
    }

    // Click View Receipt on first bill if available
    const viewReceiptButtons = await page.$$('button')
    for (const b of viewReceiptButtons) {
      const text = await (await b.getProperty('textContent')).jsonValue()
      if (text && text.includes('View Receipt')) {
        await b.click()
        await new Promise((r) => setTimeout(r, 1500))
        break
      }
    }

    console.log('Capturing Bill Receipt with GSTIN...')
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'screenshot_bill_receipt_gst.png') })

    console.log('Walkthrough completed successfully!')
  } catch (err) {
    console.error('Walkthrough error:', err)
  } finally {
    await browser.close()
  }
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
