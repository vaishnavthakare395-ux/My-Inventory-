import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing'
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  runTransaction,
  increment,
  serverTimestamp,
} from 'firebase/firestore'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rulesPath = path.join(__dirname, '..', 'firestore.rules')
const rules = fs.readFileSync(rulesPath, 'utf8')

const PROJECT_ID = 'demo-stockflow-test'

async function runTests() {
  console.log('--- Initializing Firestore Security Rules Test Environment ---')
  const testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules,
      host: '127.0.0.1',
      port: 8080,
    },
  })

  let passed = 0
  let failed = 0

  async function test(name, fn) {
    try {
      await fn()
      console.log(`  ✓ PASS: ${name}`)
      passed++
    } catch (err) {
      console.error(`  ✗ FAIL: ${name}`)
      console.error('    Error:', err.message || err)
      failed++
    }
  }

  try {
    // Bootstrap user profiles in admin context
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore()
      // Shop A user
      await setDoc(doc(db, 'users', 'user_shop_a'), {
        uid: 'user_shop_a',
        email: 'userA@shop.local',
        role: 'user',
        assignedLocationIds: ['SHOP_A'],
        shopLocationId: 'SHOP_A',
      })
      // Shop B user
      await setDoc(doc(db, 'users', 'user_shop_b'), {
        uid: 'user_shop_b',
        email: 'userB@shop.local',
        role: 'user',
        assignedLocationIds: ['SHOP_B'],
        shopLocationId: 'SHOP_B',
      })
      // Admin user
      await setDoc(doc(db, 'users', 'user_admin'), {
        uid: 'user_admin',
        email: 'admin@platform.local',
        role: 'admin',
        assignedLocationIds: [],
      })
    })

    const ctxA = testEnv.authenticatedContext('user_shop_a')
    const dbA = ctxA.firestore()

    const ctxB = testEnv.authenticatedContext('user_shop_b')
    const dbB = ctxB.firestore()

    const ctxAdmin = testEnv.authenticatedContext('user_admin')
    const dbAdmin = ctxAdmin.firestore()

    console.log('\n--- Test Suite 1: Multi-Tenant Shop Authorization & Scoping ---')

    await test('Shop A user can create a POS bill scoped to SHOP_A', async () => {
      await assertSucceeds(
        setDoc(doc(dbA, 'bills', 'bill_1'), {
          invoiceNo: 'INV-001',
          locationId: 'SHOP_A',
          shopId: 'SHOP_A',
          grandTotal: 100,
          paymentMethod: 'cash',
        })
      )
    })

    await test('Shop A user CANNOT create a bill for SHOP_B (cross-tenant violation)', async () => {
      await assertFails(
        setDoc(doc(dbA, 'bills', 'bill_cross_tenant'), {
          invoiceNo: 'INV-BAD',
          locationId: 'SHOP_B',
          shopId: 'SHOP_B',
          grandTotal: 150,
          paymentMethod: 'cash',
        })
      )
    })

    await test('Shop B user CANNOT read Shop A bill (privacy isolation)', async () => {
      await assertFails(
        getDoc(doc(dbB, 'bills', 'bill_1'))
      )
    })

    await test('Shop A user can read their own Shop A bill', async () => {
      await assertSucceeds(
        getDoc(doc(dbA, 'bills', 'bill_1'))
      )
    })

    console.log('\n--- Test Suite 2: Batch Inventory & Negative Stock Protection ---')

    await test('Shop A user can create batch inventory in SHOP_A', async () => {
      await assertSucceeds(
        setDoc(doc(dbA, 'batch_inventory', 'SKU1__SHOP_A__B1'), {
          sku: 'SKU1',
          locationId: 'SHOP_A',
          batchNo: 'B1',
          qty: 25,
          expiryDate: '2026-12-31',
        })
      )
    })

    await test('Rules strictly REJECT negative stock quantity (qty: -5)', async () => {
      await assertFails(
        setDoc(doc(dbA, 'batch_inventory', 'SKU1__SHOP_A__BAD'), {
          sku: 'SKU1',
          locationId: 'SHOP_A',
          batchNo: 'BAD',
          qty: -5,
          expiryDate: '2026-12-31',
        })
      )
    })

    await test('Shop B user CANNOT modify Shop A batch inventory', async () => {
      await assertFails(
        updateDoc(doc(dbB, 'batch_inventory', 'SKU1__SHOP_A__B1'), {
          qty: 10,
        })
      )
    })

    console.log('\n--- Test Suite 3: Immutable Stock Ledger Audit Trail ---')

    await test('Shop A user can append an entry to stock_ledger for SHOP_A', async () => {
      await assertSucceeds(
        setDoc(doc(dbA, 'stock_ledger', 'ledger_entry_1'), {
          sku: 'SKU1',
          locationId: 'SHOP_A',
          shopId: 'SHOP_A',
          batchNo: 'B1',
          delta: 25,
          reason: 'add_stock',
        })
      )
    })

    await test('Stock ledger entries are IMMUTABLE: updates are rejected', async () => {
      await assertFails(
        updateDoc(doc(dbA, 'stock_ledger', 'ledger_entry_1'), {
          delta: 999,
        })
      )
    })

    await test('Stock ledger entries are IMMUTABLE: deletes are rejected', async () => {
      await assertFails(
        deleteDoc(doc(dbA, 'stock_ledger', 'ledger_entry_1'))
      )
    })

    console.log('\n--- Test Suite 4: Transactional Stock Integrity ---')

    await test('Transactional atomic deduction reduces stock correctly', async () => {
      const bRef = doc(dbA, 'batch_inventory', 'SKU1__SHOP_A__B1')
      await assertSucceeds(
        runTransaction(dbA, async (tx) => {
          const snap = await tx.get(bRef)
          if (!snap.exists()) throw new Error('Not found')
          const cur = snap.data().qty
          if (cur < 5) throw new Error('Insufficient stock')
          tx.update(bRef, { qty: increment(-5) })
        })
      )
      const after = await getDoc(bRef)
      if (after.data().qty !== 20) {
        throw new Error(`Expected qty 20, got ${after.data().qty}`)
      }
    })

  } finally {
    await testEnv.cleanup()
  }

  console.log(`\n========================================`)
  console.log(`Test Results: ${passed} passed, ${failed} failed`)
  console.log(`========================================`)

  if (failed > 0) {
    process.exit(1)
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err)
  process.exit(1)
})
