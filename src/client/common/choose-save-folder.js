const {
  openDialog
} = window.api

export async function chooseSaveDirectory (opts) {
  const title = window.translate('chooseFolderToSaveFiles')
  const savePaths = await openDialog({
    title,
    message: title,
    properties: [
      'openDirectory',
      'showHiddenFiles',
      'createDirectory',
      'noResolveAliases',
      'treatPackageAsDirectory',
      'dontAddToRecent'
    ],
    ...opts
  })
  if (!savePaths || !savePaths.length) {
    return undefined
  }
  return savePaths[0]
}
