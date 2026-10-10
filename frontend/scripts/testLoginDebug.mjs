import puppeteer from 'puppeteer'

async function debugLogin() {
  const browser = await puppeteer.launch({ headless: 'new' })
  const page = await browser.newPage()
  
  page.on('response', async (res) => {
    if (res.status() >= 400) {
      try {
        const body = await res.text()
        console.log('STATUS:', res.status(), 'URL:', res.url(), 'BODY:', body)
      } catch (err) {}
    }
  })

  await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle2' })
  await page.type('input[type="email"]', 'patel.mart@stockflow.local')
  await page.type('input[type="password"]', 'Password123!')
  await page.click('form button.btn.primary')
  await new Promise((r) => setTimeout(r, 4000))
  console.log('Final URL:', page.url())
  await browser.close()
}

debugLogin()
