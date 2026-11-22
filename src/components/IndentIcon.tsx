/** Lines with an arrow pointing in (or out), the usual indent glyph. */
export function IndentIcon({ out }: { out?: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M7 4h7M7 8h7M7 12h7" />
      {out ? <path d="M4.5 5.5 2 8l2.5 2.5" /> : <path d="M2 5.5 4.5 8 2 10.5" />}
    </svg>
  )
}
