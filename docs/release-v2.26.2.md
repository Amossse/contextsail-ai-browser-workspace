# ContextSail 2.26.2

The page assistant now tolerates extra whitespace inside bold markers in AI answers, such as `**Core position: **` and `** Core position: **`. It also handles Chinese punctuation at the end of a bold label immediately followed by prose, such as `**核心立场：**正文`. These render as bold text rather than displaying the asterisks, including in existing conversations.

The compatibility rule runs inside the Markdown inline parser, not as a global source rewrite. Inline code, fenced and indented code blocks, HTML code elements, escaped asterisks, and incomplete markers remain unchanged. HTML sanitization and safe-link handling still apply, and stored conversation text is never modified.

Reload the unpacked extension from `chrome://extensions`, then refresh the article tab. No answer regeneration or data migration is needed.
