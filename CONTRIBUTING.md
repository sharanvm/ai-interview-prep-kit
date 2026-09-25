# Development notes

Keep deterministic logic in `packages/core`. Retrieval and model calls belong in the API services. The UI should treat the generated kit as local editable state and persist changes deliberately rather than on every keystroke.
