import ReactMarkdown from 'react-markdown'
import { C } from '@/lib/theme'

import privacyMd        from '@/content/legal/privacy.md?raw'
import termsMd          from '@/content/legal/terms.md?raw'
import dataProcessingMd from '@/content/legal/data-processing.md?raw'

const CONTENT = {
  privacy:          privacyMd,
  terms:            termsMd,
  'data-processing': dataProcessingMd,
}

const TITLE = {
  privacy:          'Privacy Policy',
  terms:            'Terms of Use',
  'data-processing': 'Data Processing',
}

export function LegalPage({ type }) {
  const md = CONTENT[type]
  if (!md) return <div style={{ padding: 32, color: C.text }}>Page not found.</div>

  return (
    <div style={{
      maxWidth: 680, margin: '0 auto', padding: '40px 24px 80px',
      fontFamily: 'system-ui, sans-serif', color: C.text,
    }}>
      <a
        href="/"
        style={{ display: 'inline-block', marginBottom: 24, fontSize: 13, color: C.textMut, textDecoration: 'none' }}
      >
        ← Back to app
      </a>

      <div className="nid-legal-body">
        <ReactMarkdown
          components={{
            h1: ({ children }) => (
              <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.5px', marginBottom: 6, color: C.text }}>{children}</h1>
            ),
            h2: ({ children }) => (
              <h2 style={{ fontSize: 17, fontWeight: 600, marginTop: 32, marginBottom: 10, color: C.text }}>{children}</h2>
            ),
            h3: ({ children }) => (
              <h3 style={{ fontSize: 14, fontWeight: 600, marginTop: 20, marginBottom: 6, color: C.text }}>{children}</h3>
            ),
            p: ({ children }) => (
              <p style={{ fontSize: 14, lineHeight: 1.75, color: C.textSec, marginBottom: 14 }}>{children}</p>
            ),
            ul: ({ children }) => (
              <ul style={{ paddingLeft: 20, marginBottom: 14 }}>{children}</ul>
            ),
            li: ({ children }) => (
              <li style={{ fontSize: 14, lineHeight: 1.75, color: C.textSec, marginBottom: 4 }}>{children}</li>
            ),
            strong: ({ children }) => (
              <strong style={{ color: C.text, fontWeight: 600 }}>{children}</strong>
            ),
            table: ({ children }) => (
              <div style={{ overflowX: 'auto', marginBottom: 20 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>{children}</table>
              </div>
            ),
            th: ({ children }) => (
              <th style={{ textAlign: 'left', padding: '8px 12px', borderBottom: `2px solid ${C.border}`, fontWeight: 600, color: C.text }}>{children}</th>
            ),
            td: ({ children }) => (
              <td style={{ padding: '8px 12px', borderBottom: `1px solid ${C.elevated}`, color: C.textSec, lineHeight: 1.6 }}>{children}</td>
            ),
            hr: () => (
              <hr style={{ border: 'none', borderTop: `1px solid ${C.border}`, margin: '28px 0' }} />
            ),
            a: ({ href, children }) => (
              <a href={href} style={{ color: C.accent, textDecoration: 'none' }} target="_blank" rel="noopener noreferrer">{children}</a>
            ),
          }}
        >
          {md}
        </ReactMarkdown>
      </div>
    </div>
  )
}

export { TITLE }
