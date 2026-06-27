// GS1 element-string parser for 2D codes (GS1 DataMatrix / GS1 QR).
//
// A GS1 2D code packs several fields, each prefixed by an Application Identifier
// (AI). Some AIs are fixed length; others are variable length and run until a
// separator — the FNC1 / Group Separator (ASCII 29, "\x1D").
//
// AIs we use: (01) GTIN 14-digit, (17) expiry YYMMDD, (10) batch var-len,
// (21) serial var-len.

const GS = '\x1D'

const FIXED = { '01': 14, '17': 6, '11': 6, '15': 6 }
const VARIABLE = { '10': true, '21': true }

export function looksLikeGs1(raw) {
  if (!raw) return false
  if (raw.includes(GS)) return true
  const s = raw.startsWith(']') ? stripSymbologyId(raw) : raw
  return /^(01|17|10|21|11|15|8005|240)/.test(s.replace(/^\x1D/, ''))
}

function stripSymbologyId(raw) {
  return raw.replace(/^\][A-Za-z]\d/, '')
}

export function parseGs1(raw) {
  if (!raw) return null
  let s = stripSymbologyId(raw)
  if (s.startsWith(GS)) s = s.slice(1)

  const out = {}
  let i = 0
  let safety = 0

  while (i < s.length && safety++ < 50) {
    if (s[i] === GS) { i++; continue }
    const ai = s.slice(i, i + 2)

    if (FIXED[ai] !== undefined) {
      const len = FIXED[ai]
      const data = s.slice(i + 2, i + 2 + len)
      i += 2 + len
      applyAi(out, ai, data)
      continue
    }
    if (VARIABLE[ai]) {
      let end = s.indexOf(GS, i + 2)
      if (end === -1) end = s.length
      const data = s.slice(i + 2, end)
      i = end
      applyAi(out, ai, data)
      continue
    }
    break
  }
  return out.gtin ? out : null
}

function applyAi(out, ai, data) {
  if (ai === '01') out.gtin = data
  else if (ai === '17') out.expiry = expiryFromYYMMDD(data)
  else if (ai === '10') out.batchNo = data
  else if (ai === '21') out.serial = data
}

// (17) expiry YYMMDD -> YYYY-MM. DD == "00" means end of month.
function expiryFromYYMMDD(yymmdd) {
  if (!/^\d{6}$/.test(yymmdd)) return ''
  const yy = Number(yymmdd.slice(0, 2))
  const mm = yymmdd.slice(2, 4)
  const year = 2000 + yy
  if (Number(mm) < 1 || Number(mm) > 12) return ''
  return `${year}-${mm}`
}
