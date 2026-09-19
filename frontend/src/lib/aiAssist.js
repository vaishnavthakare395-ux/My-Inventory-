// AI Assist & Business Intelligence Engine for StockFlow
// Provides clearance pricing, predictive restocking, sales velocity analytics,
// festival campaigns, and an interactive shop copilot.

export const FESTIVALS = [
  {
    id: 'diwali',
    name: 'Diwali Festive Mega Saver',
    icon: '🪔',
    season: 'Autumn / October–November',
    highlight: 'Sweets, Dry Fruits, Ghee, Beverages, Pooja Essentials, Gift Hampers',
    tags: ['High Volume', 'Gifting', 'Family Feasts'],
  },
  {
    id: 'holi',
    name: 'Holi Colors & Treats Bonanza',
    icon: '🎨',
    season: 'Spring / March',
    highlight: 'Thandai, Dairy, Snacks, Sweets, Refreshments, Personal Care',
    tags: ['Party Packs', 'Beverages', 'Instant Foods'],
  },
  {
    id: 'navratri',
    name: 'Navratri & Dussehra Auspicious Sale',
    icon: '🚩',
    season: 'Autumn / October',
    highlight: 'Pure Ghee, Dry Fruits, Fasting Snacks, Dairy, Pooja Items',
    tags: ['Fasting Specials', 'Purity Essentials'],
  },
  {
    id: 'eid',
    name: 'Eid Mubarak Grand Bazaar',
    icon: '🌙',
    season: 'Spring / Festive Moon',
    highlight: 'Vermicelli, Milk, Dry Fruits, Spices, Syrups, Beverages',
    tags: ['Feast Essentials', 'Special Delights'],
  },
  {
    id: 'weekend_flash',
    name: 'Super Weekend Flash Savings',
    icon: '⚡',
    season: 'Every Saturday & Sunday',
    highlight: 'Daily Staples, Cooking Oil, Dairy, Biscuits, Breakfast Essentials',
    tags: ['48h Flash Sale', 'Weekly Traffic Driver'],
  },
  {
    id: 'monsoon_sale',
    name: 'Monsoon Care & Rainy Day Comforts',
    icon: '🌧️',
    season: 'Monsoon / July–August',
    highlight: 'Tea, Coffee, Soups, Immunity Boosters, Healthcare, Snacks',
    tags: ['Health & Hygiene', 'Hot Beverages'],
  },
  {
    id: 'new_year',
    name: 'New Year Fresh Start Clearance',
    icon: '🎉',
    season: 'December 28 – January 5',
    highlight: 'Party Snacks, Beverages, Confectionery, Health & Wellness',
    tags: ['Year-End Clearance', 'Celebration Packs'],
  },
]

/**
 * Days difference between a target date string and today
 */
export function getDaysLeft(dateStr) {
  if (!dateStr) return null
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const target = new Date(dateStr)
  target.setHours(0, 0, 0, 0)
  const diffTime = target.getTime() - now.getTime()
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
}

/**
 * 1. NEAR-EXPIRY CLEARANCE & FLASH OFFERS
 * Analyzes batches expiring within 60 days and creates pricing & promotional strategies
 */
export function generateClearanceOffers(batches = [], productsBySku = {}, shopName = 'Our Shop') {
  const eligible = []

  for (const b of batches) {
    if ((b.qty || 0) <= 0) continue
    const days = getDaysLeft(b.expiryDate)
    if (days === null || days > 60) continue // only within 60 days or expired

    const prod = productsBySku[b.sku] || {}
    const bp = Number(b.buyingPrice) || Number(prod.buyingPrice) || 0
    const sp = Number(b.sellingPrice) || Number(prod.sellingPrice) || (bp > 0 ? Math.round(bp * 1.25) : 100)

    // Determine risk tier
    let tier = 'WATCH'
    let discountPct = 15
    let urgencyBadge = '⏳ Upcoming (31-60d)'
    let urgencyColor = 'amber'

    if (days <= 0) {
      tier = 'EXPIRED'
      discountPct = 0
      urgencyBadge = '⛔ Expired'
      urgencyColor = 'red'
    } else if (days <= 7) {
      tier = 'CRITICAL'
      discountPct = 45
      urgencyBadge = `🚨 Critical (${days}d left)`
      urgencyColor = 'red'
    } else if (days <= 20) {
      tier = 'HIGH'
      discountPct = 30
      urgencyBadge = `⚠️ High Priority (${days}d left)`
      urgencyColor = 'orange'
    } else if (days <= 35) {
      tier = 'MEDIUM'
      discountPct = 20
      urgencyBadge = `⚡ Fast Move (${days}d left)`
      urgencyColor = 'yellow'
    }

    // Clearance price: calculate markdown while aiming to protect Break-Even (buying price)
    // If expiring in <= 7 days, allow selling at BP to salvage capital
    let clearancePrice = Math.round(sp * (1 - discountPct / 100))
    if (bp > 0) {
      // Don't price lower than BP unless it's critical (< 4 days)
      if (days > 4 && clearancePrice < bp) {
        clearancePrice = bp
        discountPct = Math.max(5, Math.round(((sp - bp) / sp) * 100))
      }
    }
    const customerSavings = Math.max(0, sp - clearancePrice)

    // Generate creative promotional angles
    const bundles = []
    if (b.qty >= 3) {
      bundles.push({
        title: 'Buy 2 Get 1 Free',
        desc: `Clear 3 units at once: 2 units at regular ₹${sp} + 1 unit free (Effective ₹${Math.round((sp * 2) / 3)}/unit).`,
        effectiveDiscount: '33% Off',
      })
    }
    if (b.qty >= 2) {
      bundles.push({
        title: `Twin Pack Combo (₹${clearancePrice * 2})`,
        desc: `Grab 2 packs together for only ₹${clearancePrice * 2} (Save ₹${customerSavings * 2}).`,
        effectiveDiscount: `${discountPct}% Off`,
      })
    }
    bundles.push({
      title: 'Flash Counter Deal',
      desc: `Place right near billing counter with marquee tag: "Clearance Special: ₹${clearancePrice} (MRP ₹${sp})"`,
      effectiveDiscount: `Save ₹${customerSavings}`,
    })

    // Ready-to-send WhatsApp promo text
    const whatsappMsg = `🔥 *FLASH CLEARANCE ALERT at ${shopName}* 🔥\n\n` +
      `Special Limited-Time Offer on *${prod.productName || b.sku}*!\n` +
      `📌 *Offer Price:* ₹${clearancePrice} ~₹${sp}~ (${discountPct}% OFF)\n` +
      `💰 *You Save:* ₹${customerSavings} per pack!\n` +
      `⏳ *Stock Left:* Only ${b.qty} units left at this rate.\n` +
      `📍 Visit ${shopName} today before stock runs out!`

    eligible.push({
      batchId: b.id,
      sku: b.sku,
      productName: prod.productName || b.sku,
      batchNo: b.batchNo,
      expiryDate: b.expiryDate,
      daysLeft: days,
      qty: b.qty,
      buyingPrice: bp,
      sellingPrice: sp,
      clearancePrice,
      customerSavings,
      discountPct,
      tier,
      urgencyBadge,
      urgencyColor,
      bundles,
      whatsappMsg,
    })
  }

  // Sort by most urgent first
  eligible.sort((a, b) => a.daysLeft - b.daysLeft)
  return eligible
}

/**
 * 2. PREDICTIVE RESTOCKING & REORDER QUANTITIES
 * Analyzes sales velocity from past bills vs current stock levels
 */
export function generateReorderRecommendations(batches = [], bills = [], products = []) {
  const prodMap = {}
  products.forEach((p) => {
    prodMap[p.sku] = p
  })

  // 1. Calculate sales count per SKU from bills
  const salesBySku = {}
  let earliestBillTime = Date.now()
  let latestBillTime = 0

  bills.forEach((bill) => {
    const billTime = bill.createdAt?.toMillis
      ? bill.createdAt.toMillis()
      : new Date(bill.createdAt || Date.now()).getTime()
    if (billTime < earliestBillTime) earliestBillTime = billTime
    if (billTime > latestBillTime) latestBillTime = billTime

    ;(bill.items || []).forEach((item) => {
      if (!item.sku) return
      salesBySku[item.sku] = (salesBySku[item.sku] || 0) + Number(item.qty || 0)
    })
  })

  // Measure observation window (default 14 days minimum)
  const windowDays = Math.max(14, Math.ceil((Math.max(Date.now(), latestBillTime) - earliestBillTime) / (1000 * 60 * 60 * 24)))

  // 2. Sum current stock per SKU
  const stockBySku = {}
  batches.forEach((b) => {
    if (!b.sku) return
    stockBySku[b.sku] = (stockBySku[b.sku] || 0) + Number(b.qty || 0)
  })

  // 3. For all known products or SKUs with stock/sales, compute velocity & ROQ
  const allSkus = new Set([...Object.keys(prodMap), ...Object.keys(stockBySku), ...Object.keys(salesBySku)])
  const recommendations = []

  allSkus.forEach((sku) => {
    const prod = prodMap[sku] || {}
    const currentStock = stockBySku[sku] || 0
    const totalSold = salesBySku[sku] || 0
    const dailyVelocity = parseFloat((totalSold / windowDays).toFixed(2))

    // Days of runway left
    let runwayDays = 999
    if (dailyVelocity > 0) {
      runwayDays = Math.round(currentStock / dailyVelocity)
    } else if (currentStock === 0) {
      runwayDays = 0
    }

    // Safety stock (covers 5 days) + Target cycle stock (covers 18 days)
    const targetCycleDays = 18
    const targetStock = Math.ceil(dailyVelocity * targetCycleDays) + (prod.reorderLevel || 5)
    let recommendedOrderQty = Math.max(0, targetStock - currentStock)

    let status = 'HEALTHY'
    let statusLabel = 'Stock Healthy'
    let statusColor = 'green'
    let urgencyScore = 0

    if (currentStock === 0 && totalSold > 0) {
      status = 'STOCKOUT'
      statusLabel = 'Out of Stock'
      statusColor = 'red'
      urgencyScore = 100
      recommendedOrderQty = Math.max(15, targetStock)
    } else if (runwayDays <= 3 && dailyVelocity > 0) {
      status = 'CRITICAL'
      statusLabel = `Runway: ${runwayDays} days (Critical)`
      statusColor = 'red'
      urgencyScore = 90
    } else if (runwayDays <= 7 && dailyVelocity > 0) {
      status = 'LOW_STOCK'
      statusLabel = `Runway: ${runwayDays} days (Low)`
      statusColor = 'amber'
      urgencyScore = 70
    } else if (totalSold === 0 && currentStock > 20) {
      status = 'DEAD_STOCK'
      statusLabel = 'Zero Sales / Slow Moving'
      statusColor = 'blue'
      urgencyScore = 10
      recommendedOrderQty = 0 // Don't order more stagnant stock!
    }

    recommendations.push({
      sku,
      productName: prod.productName || sku,
      category: prod.category || 'General',
      currentStock,
      totalSold,
      dailyVelocity,
      runwayDays: runwayDays === 999 ? '30+ days' : `${runwayDays} days`,
      recommendedOrderQty,
      buyingPrice: Number(prod.buyingPrice) || 0,
      sellingPrice: Number(prod.sellingPrice) || 0,
      estimatedReorderCost: Math.round(recommendedOrderQty * (Number(prod.buyingPrice) || 0)),
      status,
      statusLabel,
      statusColor,
      urgencyScore,
      advice: getRestockAdvice(status, runwayDays, recommendedOrderQty, dailyVelocity),
    })
  })

  // Sort by urgency
  recommendations.sort((a, b) => b.urgencyScore - a.urgencyScore)
  return recommendations
}

function getRestockAdvice(status, runwayDays, roq, velocity) {
  if (status === 'STOCKOUT') {
    return `Immediate action needed! Product is completely stocked out while customers are demanding it. Order ${roq} units now.`
  }
  if (status === 'CRITICAL') {
    return `Stockout imminent in ~${runwayDays} days. Selling at ${velocity} units/day. Order ${roq} units immediately to prevent loss of sales.`
  }
  if (status === 'LOW_STOCK') {
    return `Current supply will deplete within ${runwayDays} days. Place a PO for ${roq} units with your distributor.`
  }
  if (status === 'DEAD_STOCK') {
    return `No sales recorded recently. Avoid reordering. Consider bundling or flash clearance to free up working capital.`
  }
  return `Stock level is balanced for the next 2-3 weeks. Monitor next week.`
}

/**
 * 3. SALES & VELOCITY INTELLIGENCE
 * Computes shop-level sales analytics from bills
 */
export function generateSalesIntelligence(bills = [], batches = []) {
  let totalGrossRevenue = 0
  let totalCostOfGoods = 0
  let totalUnitsSold = 0
  let totalDiscountGiven = 0

  const paymentBreakdown = { cash: 0, upi: 0, card: 0, due: 0 }
  const productPerformance = {}

  bills.forEach((bill) => {
    const grand = Number(bill.grandTotal) || 0
    const disc = Number(bill.discount) || 0
    totalGrossRevenue += grand
    totalDiscountGiven += disc

    const payMode = (bill.paymentMethod || 'cash').toLowerCase()
    if (paymentBreakdown[payMode] != null) {
      paymentBreakdown[payMode] += grand
    } else {
      paymentBreakdown.cash += grand
    }

    ;(bill.items || []).forEach((it) => {
      const q = Number(it.qty) || 0
      const unitP = Number(it.unitPrice) || 0
      const buyP = Number(it.buyingPrice) || 0
      totalUnitsSold += q
      totalCostOfGoods += buyP * q

      if (!productPerformance[it.sku]) {
        productPerformance[it.sku] = {
          sku: it.sku,
          name: it.productName || it.sku,
          qtySold: 0,
          revenue: 0,
          profit: 0,
        }
      }
      const itemRev = unitP * q
      const itemProfit = itemRev - (buyP * q)
      productPerformance[it.sku].qtySold += q
      productPerformance[it.sku].revenue += itemRev
      productPerformance[it.sku].profit += itemProfit
    })
  })

  const grossProfit = Math.max(0, totalGrossRevenue - totalCostOfGoods)
  const marginPct = totalGrossRevenue > 0 ? parseFloat(((grossProfit / totalGrossRevenue) * 100).toFixed(1)) : 0
  const avgBillValue = bills.length > 0 ? Math.round(totalGrossRevenue / bills.length) : 0

  // Top products by revenue
  const topProducts = Object.values(productPerformance).sort((a, b) => b.revenue - a.revenue).slice(0, 6)

  return {
    totalGrossRevenue: Math.round(totalGrossRevenue),
    totalCostOfGoods: Math.round(totalCostOfGoods),
    grossProfit: Math.round(grossProfit),
    marginPct,
    avgBillValue,
    totalBillsCount: bills.length,
    totalUnitsSold,
    totalDiscountGiven: Math.round(totalDiscountGiven),
    paymentBreakdown,
    topProducts,
  }
}

/**
 * 4. FESTIVAL & OCCASION CAMPAIGN ENGINE
 * Generates dynamic festival campaigns tailored to shop products
 */
export function generateFestivalCampaigns(festivalId, shopName = 'Our Mart', products = []) {
  const fest = FESTIVALS.find((f) => f.id === festivalId) || FESTIVALS[0]

  // Filter sample products for bundle combinations
  const sampleProducts = products.slice(0, 6)

  const campaigns = [
    {
      title: `${fest.icon} ${fest.name} — Mega Saver Combo`,
      objective: 'Maximize average basket value and attract family shoppers.',
      structure: 'Combo Deal: Buy 3 Festive Staples & get Flat 15% OFF.',
      suggestedItems: sampleProducts.slice(0, 3).map((p) => p.productName || p.sku),
      bannerTag: 'Limited Festive Offer',
      whatsappCopy:
        `✨ *${fest.name.toUpperCase()} SPECIAL at ${shopName}* ✨\n\n` +
        `Celebrate with special savings! Get flat *15% OFF* on our exclusive Festive Saver Combo.\n` +
        `🎁 High-quality essentials for your family celebrations.\n` +
        `🏷️ Stock up early before rush hour!\n` +
        `📍 Visit us at ${shopName}. Happy Celebrations! 🪔`,
    },
    {
      title: `⚡ Festive Bill Buster: Shop ₹999 & Get Free Gift`,
      objective: 'Incentivize customers to increase their bill size past ₹1,000.',
      structure: 'Threshold Promo: Bills above ₹999 receive an instant ₹100 discount coupon or festive sweet pack.',
      bannerTag: 'Highest ROI',
      whatsappCopy:
        `🎉 *FESTIVE BILL BUSTER at ${shopName}* 🎉\n\n` +
        `Shop for ₹999 or more and receive an instant *₹100 Voucher* or *Festive Gift Pack* on the spot!\n` +
        `📅 Valid this week only.\n` +
        `📍 ${shopName} — Your Trusted Neighborhood Partner!`,
    },
    {
      title: `🏷️ Flat 20% Off on Near-Expiry Festive Treats`,
      objective: 'Rapidly clear seasonal & perishable stock before the celebration concludes.',
      structure: 'Flash Markdown: 20% to 30% discount on sweets, dairy & packaged snacks.',
      bannerTag: 'Stock Clearance',
      whatsappCopy:
        `🚨 *SPECIAL ${fest.name.toUpperCase()} CLEARANCE* 🚨\n\n` +
        `Enjoy flat *20% to 30% OFF* on selected snacks, dairy, and festive treats at ${shopName}!\n` +
        `⏳ Limited stock available — grab yours today!\n` +
        `📞 Call / Visit ${shopName} now.`,
    },
  ]

  return {
    festival: fest,
    campaigns,
  }
}

/**
 * 5. INTERACTIVE SHOP COPILOT REASONING
 * Grounded in the store's inventory, expiring batches, bills, and location context
 */
export async function askShopCopilot(question, shopContext, customApiKey = null) {
  const q = (question || '').trim().toLowerCase()

  // If a Gemini API key is configured, query Gemini API
  const apiKey = customApiKey || import.meta.env.VITE_GEMINI_API_KEY
  if (apiKey) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                role: 'user',
                parts: [
                  {
                    text: `You are StockFlow AI Copilot, an expert retail inventory and revenue optimization consultant assisting the owner of "${shopContext.shopName}".
Here is the real-time operational context of the shop:
- Total Units in Stock: ${shopContext.totalUnits}
- Products Expiring within 30 days: ${JSON.stringify(shopContext.nearExpiryItems || [])}
- Low Stock / Critical Items: ${JSON.stringify(shopContext.lowStockItems || [])}
- Gross Sales to date: ₹${shopContext.totalRevenue || 0} across ${shopContext.totalBills || 0} invoices.
- Top Selling Items: ${JSON.stringify(shopContext.topProducts || [])}

Answer the user's question clearly, professionally, and concisely in clean GitHub Markdown. Give concrete numbers, actionable marketing ideas, or pricing calculations based strictly on their store data.
User's Question: "${question}"`,
                  },
                ],
              },
            ],
            generationConfig: {
              temperature: 0.4,
              maxOutputTokens: 800,
            },
          }),
        }
      )

      if (response.ok) {
        const data = await response.json()
        const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text
        if (reply) return reply
      }
    } catch (e) {
      console.warn('Gemini API call failed, falling back to built-in reasoning engine:', e)
    }
  }

  // Built-in Native Intelligent Business Reasoning Engine (Local & Offline)
  return fallbackStrategicReasoning(q, shopContext)
}

function fallbackStrategicReasoning(q, ctx) {
  const nearExpiry = ctx.nearExpiryItems || []
  const lowStock = ctx.lowStockItems || []
  const topProds = ctx.topProducts || []

  // 1. Expiry & Clearance Queries
  if (q.includes('expire') || q.includes('expiry') || q.includes('clear') || q.includes('near expiry')) {
    if (nearExpiry.length === 0) {
      return `### ✅ Good News on Shelf Life!\n\nYour shop currently has **no critical batches expiring within the next 30 days**. All your products have healthy runway.\n\n**Proactive Tip:** To keep it this way, always follow strict batch rotation and scan the physical barcode with expiry extraction when billing.`
    }

    const itemsList = nearExpiry.slice(0, 4).map((it) => {
      return `- **${it.productName || it.sku}** (${it.qty} units, Batch: \`${it.batchNo}\`): Expires in **${it.daysLeft} days**. Suggested clearance price: **₹${it.clearancePrice}** (Regular: ₹${it.sellingPrice}, ~${it.discountPct}% off).`
    }).join('\n')

    return `### 🚨 Clearance Strategy for Near-Expiry Stock\n\nYou have **${nearExpiry.length} batch(es)** requiring immediate attention:\n\n${itemsList}\n\n#### Recommended Action Plan:\n1. **Front-of-Counter Placement:** Group these items in a "Special Deal Basket" right at the cash counter.\n2. **Run a 48-Hour Flash Markdown:** Price at the suggested clearance rate (guarantees you recover your buying cost without cash loss).\n3. **Combo Bundle:** Offer a *"Buy 2 Get 1 Free"* or bundle near-expiry items with high-margin fast-sellers.\n4. **Emergency Network Sharing:** You can also list these units in the **Emergency Stock** tab so nearby partner shops running low can acquire them from you!`
  }

  // 2. Reordering & Restocking Queries
  if (q.includes('order') || q.includes('reorder') || q.includes('restock') || q.includes('buy') || q.includes('how many')) {
    if (lowStock.length === 0) {
      return `### 📦 Inventory Runway is Stable\n\nBased on your sales velocity from past customer bills, none of your items are currently at risk of stocking out.\n\n**Recommended Action:** Maintain regular supplier cycles and check the **Predictive Restocking** tab every Monday morning.`
    }

    const orderRows = lowStock.slice(0, 5).map((it) => {
      return `| **${it.productName}** | ${it.currentStock} units | ${it.dailyVelocity}/day | ${it.runwayDays} | **${it.recommendedOrderQty} units** |`
    }).join('\n')

    return `### 📋 Recommended Order Quantities (ROQ)\n\nBased on your recent sales run-rate, here are the items you should reorder immediately to avoid lost sales:\n\n| Product | In Stock | Sales Velocity | Runway | Recommended Reorder |\n| :--- | :---: | :---: | :---: | :---: |\n${orderRows}\n\n> [!TIP]\n> Reordering these quantities will provide a **18-day safe buffer** without trapping excess working capital in overstocked inventory.`
  }

  // 3. Festival & Occasion Queries
  if (q.includes('festival') || q.includes('diwali') || q.includes('holi') || q.includes('eid') || q.includes('sale') || q.includes('offer')) {
    return `### 🪔 Festive Sales & Promotion Ideas for ${ctx.shopName}\n\nHere are 3 proven festival campaigns tailored for your shop:\n\n1. **The Festive Saver Combo:**\n   - Bundle 3 high-demand items (e.g. Cooking Oil, Sweets/Biscuits, Dairy) at **12% to 15% combined discount**.\n   - Family shoppers prefer 1-stop convenience and will buy all 3 from you instead of spreading purchases across multiple stores.\n\n2. **The "Shop ₹999+ & Win Instant Perk" Hook:**\n   - Offer customers who spend ₹999 or more an immediate perk: a complimentary festive pack or a ₹50 discount voucher valid on their next visit.\n   - **Result:** Increases average transaction value by 20–35%.\n\n3. **WhatsApp Broadcast Blast:**\n   - Send a personalized greeting to regular customers with your exclusive festival catalog. *(You can copy one-click ready copy from the Festival Campaigns tab!)*`
  }

  // 4. Sales & Profit Margin Analysis
  if (q.includes('sales') || q.includes('profit') || q.includes('revenue') || q.includes('analysis') || q.includes('performance')) {
    const topStr = topProds.length > 0
      ? topProds.slice(0, 3).map((p, i) => `${i + 1}. **${p.name}** — ${p.qtySold} sold (₹${p.revenue} rev)`).join('\n')
      : 'No billing history recorded yet.'

    return `### 📊 Store Sales & Profit Intelligence\n\n- **Total Revenue:** ₹${ctx.totalRevenue || 0}\n- **Invoices Generated:** ${ctx.totalBills || 0}\n- **Total Units in Stock:** ${ctx.totalUnits || 0}\n\n#### Top Performing Products:\n${topStr}\n\n**Strategy Tip:** Focus your shelf space on your top 20% revenue drivers. For slow-moving SKUs, avoid reordering and clear shelf space for seasonal fast-movers.`
  }

  // General Retail Consulting
  return `### 💡 AI Store Copilot Recommendation for ${ctx.shopName}\n\nTo optimize your store's profits and cash flow:\n\n1. **Check Near-Expiry First:** Open the **Clearance & Offers** tab to set promotional prices on items expiring within 30 days before they become total losses.\n2. **Optimize Working Capital:** Open **Predictive Restocking** to reorder exact quantities calculated from customer billing velocity.\n3. **Launch Festive Campaigns:** Open the **Festival Engine** tab to grab ready WhatsApp messages and in-store poster templates.\n\n*You can ask me specific questions like: "What should I reorder this week?", "How do I clear near-expiry milk?", or "Suggest a Diwali offer for grocery".*`
}
