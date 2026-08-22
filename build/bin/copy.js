const { resolve } = require('path')
const fs = require('fs')
const { cp } = require('shelljs')
const trayIconsDir = resolve(
  __dirname,
  '../../node_modules/@electerm/electerm-resource/tray-icons'
)
const from = resolve(
  trayIconsDir,
  '*'
)
const from0 = resolve(
  __dirname,
  '../../node_modules/electerm-icons/icons'
)
const to1 = resolve(
  __dirname,
  '../../work/app/assets/images/'
)
const to2 = resolve(
  __dirname,
  '../../work/app/assets/icons'
)

fs.mkdirSync(to1, { recursive: true })
fs.mkdirSync(to2, { recursive: true })

const arr = []

if (fs.existsSync(trayIconsDir)) {
  arr.push({
    from,
    to: to1,
    file: true
  })
}

if (fs.existsSync(from0)) {
  arr.push({
    from: from0,
    to: to2
  })
}

for (const obj of arr) {
  const {
    file, from, to
  } = obj
  if (file) {
    cp(from, to)
  } else {
    cp('-r', from, to)
  }
}

const appIconSrc = resolve(
  __dirname,
  '../../build/icons/yunduo-128.png'
)
const appIconDst = resolve(
  to1,
  'electerm-round-128x128.png'
)

if (fs.existsSync(appIconSrc)) {
  fs.copyFileSync(appIconSrc, appIconDst)
}
