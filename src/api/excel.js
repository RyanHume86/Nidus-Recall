/**
 * Excel import / export using SheetJS.
 *
 * All FSRS scheduling fields are preserved so a round-trip
 * (export → edit in Excel → re-import) keeps full card history.
 */

const COLUMNS = [
  { key: 'id',          header: 'ID'              },
  { key: 'front',       header: 'Front'           },
  { key: 'back',        header: 'Back'            },
  { key: 'contentType', header: 'Content Type'    },
  { key: 'deck',        header: 'Deck'            },
  { key: 'elaboration', header: 'Elaboration'     },
  { key: 'status',      header: 'Status'          },
  { key: 'nextReview',  header: 'Next Review'     },
  { key: 'interval',    header: 'Interval (days)' },
  { key: 'reviewCount', header: 'Review Count'    },
  { key: 'stability',   header: 'Stability'       },
  { key: 'difficulty',  header: 'Difficulty'      },
  { key: 'lapses',      header: 'Lapses'          },
  { key: 'lastReview',  header: 'Last Review'     },
  { key: 'anchor',      header: 'Anchor'          },
  { key: 'source',      header: 'Source'          },
]

const COL_WIDTHS = [16, 52, 52, 18, 20, 52, 10, 12, 14, 12, 10, 10, 8, 12, 52, 40]

export const exportToExcel = async (cards, filename = 'memorydeck-cards') => {
  const XLSX = await import('xlsx')
  const rows = cards.map(c =>
    COLUMNS.reduce((row, col) => {
      row[col.header] = c[col.key] ?? ''
      return row
    }, {})
  )

  const ws = XLSX.utils.json_to_sheet(rows)
  ws['!cols'] = COL_WIDTHS.map(wch => ({ wch }))

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Cards')
  XLSX.writeFile(wb, `${filename}-${new Date().toISOString().split('T')[0]}.xlsx`)
}

export const importFromExcel = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = async ev => {
      try {
        const XLSX = await import('xlsx')
        const wb = XLSX.read(ev.target.result, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(ws, { defval: '' })

        const headerToKey = COLUMNS.reduce((m, col) => {
          m[col.header] = col.key
          return m
        }, {})

        const cards = rows
          .map(row => {
            const card = {}
            for (const [h, v] of Object.entries(row)) {
              const key = headerToKey[h]
              if (key) card[key] = v === '' ? null : v
            }
            // Ensure required fields with safe defaults
            if (!card.id) card.id = Date.now().toString(36) + Math.random().toString(36).slice(2)
            card.status      = card.status      || 'Active'
            card.contentType = card.contentType || 'Factual'
            card.deck        = card.deck        || 'General'
            card.elaboration = card.elaboration || ''
            card.interval    = Number(card.interval)    || 1
            card.reviewCount = Number(card.reviewCount) || 0
            card.lapses      = Number(card.lapses)      || 0
            card.stability   = card.stability  != null ? Number(card.stability)  : null
            card.difficulty  = card.difficulty != null ? Number(card.difficulty) : null
            return card
          })
          .filter(c => c.front && c.back)

        resolve(cards)
      } catch (err) {
        reject(new Error('Could not parse Excel file: ' + err.message))
      }
    }

    reader.onerror = () => reject(new Error('Could not read file'))
    reader.readAsArrayBuffer(file)
  })