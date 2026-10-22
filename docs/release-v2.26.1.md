# ContextSail 2.26.1

Page-assistant answers now render Markdown and safe HTML instead of displaying formatting markers. Headings, emphasis, lists, tables, blockquotes, inline code, code blocks, and links use the existing warm paper theme, including in expanded view and restored conversations.

The extension reuses its bundled marked and DOMPurify libraries. Only assistant answers receive rich-text rendering; user input, quoted sources, and errors remain literal text. Scripts, event handlers, embedded pages, forms, inline styles, and automatic media loads are blocked. Links open separately with opener and referrer protection. Fenced HTML examples remain code, not executable content.

Conversation storage and AI context remain plain source text. Reload the unpacked extension from `chrome://extensions`, then refresh the article tab to enable rendering for both existing and new answers.
