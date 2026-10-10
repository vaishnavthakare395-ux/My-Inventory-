import { describe, it, expect } from 'vitest'

// GSTIN validation utility: 15 alphanumeric characters standard in India
// format: 2 digits (state code), 10 chars (PAN), 1 entity code, 1 'Z', 1 check digit
export function validateAndFormatGstin(input) {
  if (!input) return { valid: true, formatted: '' }
  const clean = String(input).trim().toUpperCase()
  const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/
  const isValidFormat = gstinRegex.test(clean)
  return {
    valid: isValidFormat,
    formatted: clean,
    length: clean.length,
  }
}

describe('GSTIN Validation & Formatting Helper', () => {
  it('formats input to trimmed uppercase', () => {
    const res = validateAndFormatGstin('  07aaaaa0000a1z5  ')
    expect(res.formatted).toBe('07AAAAA0000A1Z5')
    expect(res.valid).toBe(true)
  })

  it('detects invalid format with incorrect length or characters', () => {
    const res1 = validateAndFormatGstin('12345')
    expect(res1.valid).toBe(false)

    const res2 = validateAndFormatGstin('07AAAAA0000A1Z') // 14 chars
    expect(res2.valid).toBe(false)
  })

  it('handles empty GSTIN as optional', () => {
    const res = validateAndFormatGstin('')
    expect(res.valid).toBe(true)
    expect(res.formatted).toBe('')
  })
})
