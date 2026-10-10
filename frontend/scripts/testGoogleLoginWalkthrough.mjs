import puppeteer from 'puppeteer'
import path from 'node:path'

const ARTIFACT_DIR = 'C:/Users/vaish/.gemini/antigravity/brain/3d535ab6-bd46-4ce2-845a-7f17078453ce'

async function run() {
  console.log('Launching browser to test Google login...')
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1366,900'],
  })

  const page = await browser.newPage()
  await page.setViewport({ width: 1366, height: 900 })

  page.on('console', (msg) => console.log('PAGE LOG:', msg.text()))

  try {
    console.log('Navigating to http://localhost:5173/login...')
    await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle2', timeout: 30000 })
    await new Promise((r) => setTimeout(r, 1000))

    // Listen for the popup target created when clicking "Continue with Google"
    console.log('Setting up popup listener and clicking Continue with Google...')
    const popupTargetPromise = browser.waitForTarget((target) => target.url().includes(':9099/emulator/auth/handler'))

    // Click Continue with Google
    const googleBtn = await page.evaluateHandle(() => {
      const btns = Array.from(document.querySelectorAll('button'))
      return btns.find((b) => b.innerText && b.innerText.includes('Continue with Google'))
    })
    await googleBtn.asElement().click()

    const popupTarget = await popupTargetPromise
    const popupPage = await popupTarget.page()
    console.log('Google Auth popup opened:', popupPage.url())

    await popupPage.waitForSelector('.js-reuse-account', { timeout: 10000 })
    console.log('Found pre-seeded Google accounts in popup!')

    // Capture popup screenshot showing the accounts
    await popupPage.screenshot({ path: path.join(ARTIFACT_DIR, 'screenshot_google_auth_popup.png') })

    // Click the first account (Vaishnav Thakare / Rajesh Patel / etc.)
    console.log('Selecting Google account in popup...')
    await popupPage.click('.js-reuse-account')

    // Wait for main page to navigate away from /login
    console.log('Waiting for main page login navigation...')
    await page.waitForFunction(() => !window.location.pathname.includes('/login'), { timeout: 15000 })

    console.log('Successfully logged in with Google! Current URL:', page.url())
    await new Promise((r) => setTimeout(r, 2000))

    // Capture post-Google-login screenshot
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'screenshot_google_login_success.png') })
    console.log('Google login walkthrough completed successfully!')
  } catch (err) {
    console.error('Google login walkthrough error:', err)
  } finally {
    await browser.close()
  }
}

run()
