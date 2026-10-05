# ContextSail 2.25.2

This patch fills English/Chinese localization gaps in native AI progress and errors, media and terminal feedback, browser collaboration, session labels, and date/time formatting. Browser collaborators can choose English or Simplified Chinese independently; reopen the page to apply the saved choice without interrupting an edit.

Workflow recovery and error classification now recognize both languages. Collected content, collaborator names, AI answers, paths and external CLI output are preserved rather than translated.

README.md is entirely English; the Chinese guide remains in README.zh-CN.md. Regression checks now include static accessibility attributes, collaboration shells, native errors and progress labels, and README language.

Reload the unpacked extension from `chrome://extensions`. If you use browser collaboration, rerun `./install.sh --core` to update its local host and shared dictionaries; the video profile remains available with `--video`.
