// 2026-09-25 coder(lq): Keep file-list keyboard matching independent from the UI so local and remote panes share identical type-ahead behavior.
export const FILE_LIST_TYPEAHEAD_DELAY = 1000

const normalizeName = value => String(value || '')
  .normalize('NFKC')
  .toLocaleLowerCase()

export const appendTypeaheadKey = ({ query = '', lastTypedAt = 0 }, key, typedAt) => ({
  query: typedAt - lastTypedAt <= FILE_LIST_TYPEAHEAD_DELAY
    ? query + key
    : key,
  lastTypedAt: typedAt
})

export const findTypeaheadFileIndex = (files, query) => {
  const normalizedQuery = normalizeName(query)
  if (!normalizedQuery) return -1
  return files.findIndex(file => normalizeName(file?.name).startsWith(normalizedQuery))
}

export const getKeyboardTargetIndex = ({
  currentIndex,
  fileCount,
  key,
  pageSize = 1
}) => {
  if (!fileCount) return -1
  if (key === 'Home') return 0
  if (key === 'End') return fileCount - 1
  if (key === 'ArrowDown') return Math.min(currentIndex < 0 ? 0 : currentIndex + 1, fileCount - 1)
  if (key === 'ArrowUp') return Math.max(currentIndex < 0 ? fileCount - 1 : currentIndex - 1, 0)
  if (key === 'PageDown') return Math.min(currentIndex < 0 ? 0 : currentIndex + pageSize, fileCount - 1)
  if (key === 'PageUp') return Math.max(currentIndex < 0 ? fileCount - 1 : currentIndex - pageSize, 0)
  return currentIndex
}
