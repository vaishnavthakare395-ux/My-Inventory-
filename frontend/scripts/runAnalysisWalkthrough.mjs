import puppeteer from 'puppeteer'
import path from 'node:path'

const ARTIFACT_DIR = 'C:/Users/vaish/.gemini/antigravity/brain/3d535ab6-bd46-4ce2-845a-7f17078453ce'

async function run() {
  console.log('Launching Puppeteer...')
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1366,900'],
  })

  const page = await browser.newPage()
  await page.setViewport({ width: 1366, height: 900 })

  page.on('console', (msg) => console.log('PAGE LOG:', msg.text()))
  page.on('pageerror', (err) => console.error('PAGE ERROR:', err.toString()))

  try {
    console.log('Navigating to http://localhost:5173/login...')
    await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle2', timeout: 30000 })
    await new Promise((r) => setTimeout(r, 1000))

    // Select and type into email field properly for React
    console.log('Focusing and typing email...')
    const emailField = await page.$('input[type="email"]')
    await emailField.click({ clickCount: 3 })
    await emailField.press('Backspace')
    await emailField.type('patel.mart@stockflow.local', { delay: 20 })

    console.log('Focusing and typing password...')
    const passField = await page.$('input[type="password"]')
    await passField.click({ clickCount: 3 })
    await passField.press('Backspace')
    await passField.type('Password123!', { delay: 20 })

    console.log('Clicking submit button...')
    await page.click('form button.btn.primary')

    await new Promise((r) => setTimeout(r, 3500))

    const currentUrl = page.url()
    console.log('URL after login attempt:', currentUrl)

    const formError = await page.evaluate(() => {
      const el = document.querySelector('.form-error')
      return el ? el.innerText : null
    })
    if (formError) {
      console.warn('Form Error present:', formError)
    }

    console.log('Navigating to /cashier/analysis...')
    await page.goto('http://localhost:5173/cashier/analysis', { waitUntil: 'networkidle2', timeout: 30000 })
    await new Promise((r) => setTimeout(r, 3000))

    console.log('Capturing Sales Analysis page screenshot...')
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'screenshot_sales_analysis.png') })

    // Find and click the 'View All Months Profit History' button
    console.log('Looking for "View All Months Profit History" button...')
    const btnFound = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'))
      const target = btns.find((b) => b.innerText && b.innerText.includes('All Months Profit History'))
      if (target) {
        target.click()
        return true
      }
      return false
    })

    if (btnFound) {
      console.log('Clicked "View All Months Profit History" button successfully!')
      await new Promise((r) => setTimeout(r, 1500))
      console.log('Capturing All Months Profit History modal screenshot...')
      await page.screenshot({ path: path.join(ARTIFACT_DIR, 'screenshot_all_months_profit.png') })
    } else {
      console.error('Could not find modal button on page!')
    }

    console.log('Walkthrough completed!')
  } catch (err) {
    console.error('Walkthrough error:', err)
  } finally {
    await browser.close()
  }
}

run()
