import puppeteer from 'puppeteer'

async function checkPopupUrl() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })

  const page = await browser.newPage()
  page.on('console', (msg) => console.log('PAGE LOG:', msg.text()))
  page.on('pageerror', (err) => console.error('PAGE ERROR:', err.toString()))

  await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle2' })

  browser.on('targetcreated', async (t) => {
    if (t.type() === 'page') {
      const p = await t.page()
      if (p) {
        p.on('framenavigated', (frame) => {
          if (frame === p.mainFrame()) console.log('POPUP NAVIGATED TO:', frame.url())
        })
      }
    }
  })

  const googleBtn = await page.evaluateHandle(() => {
    const btns = Array.from(document.querySelectorAll('button'))
    return btns.find((b) => b.innerText && b.innerText.includes('Continue with Google'))
  })
  await googleBtn.asElement().click()

  await new Promise((r) => setTimeout(r, 4000))
  await browser.close()
}

checkPopupUrl()
