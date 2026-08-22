import {
  splitMap
} from '../../common/constants'
import { getLayoutRatios } from './layout-ratios'

const px = value => value + 'px'

const layoutSingle = () => ({
  wrapStyles: [
    {
      left: 0,
      top: 0,
      bottom: 0,
      right: 0
    }
  ],
  handleStyles: []
})

const layoutTwoColumns = (w, h, ratios) => {
  const split = w * ratios.x[0] / 100
  return {
    wrapStyles: [
      { left: 0, top: 0, bottom: 0, right: px(w - split + 2) },
      { left: px(split + 2), top: 0, bottom: 0, right: 0 }
    ],
    handleStyles: [
      { left: px(split - 2), top: 0, bottom: 0 }
    ]
  }
}

const layoutThreeColumns = (w, h, ratios) => {
  const first = w * ratios.x[0] / 100
  const second = w * ratios.x[1] / 100
  return {
    wrapStyles: [
      { left: 0, top: 0, bottom: 0, right: px(w - first + 2) },
      { left: px(first + 2), top: 0, bottom: 0, right: px(w - second + 2) },
      { left: px(second + 2), top: 0, bottom: 0, right: 0 }
    ],
    handleStyles: [
      { left: px(first - 2), top: 0, bottom: 0 },
      { left: px(second - 2), top: 0, bottom: 0 }
    ]
  }
}

const layoutTwoRows = (w, h, ratios) => {
  const split = h * ratios.y[0] / 100
  return {
    wrapStyles: [
      { left: 0, top: 0, right: 0, bottom: px(h - split + 2) },
      { left: 0, top: px(split + 2), right: 0, bottom: 0 }
    ],
    handleStyles: [
      { top: px(split - 2), left: 0, right: 0 }
    ]
  }
}

const layoutThreeRows = (w, h, ratios) => {
  const first = h * ratios.y[0] / 100
  const second = h * ratios.y[1] / 100
  return {
    wrapStyles: [
      { left: 0, top: 0, right: 0, bottom: px(h - first + 2) },
      { left: 0, top: px(first + 2), right: 0, bottom: px(h - second + 2) },
      { left: 0, top: px(second + 2), right: 0, bottom: 0 }
    ],
    handleStyles: [
      { top: px(first - 2), left: 0, right: 0 },
      { top: px(second - 2), left: 0, right: 0 }
    ]
  }
}

const layoutGrid2x2 = (w, h, ratios) => {
  const splitX = w * ratios.x[0] / 100
  const splitY = h * ratios.y[0] / 100
  return {
    wrapStyles: [
      { left: 0, top: 0, right: px(w - splitX + 2), bottom: px(h - splitY + 2) },
      { left: px(splitX + 2), top: 0, right: 0, bottom: px(h - splitY + 2) },
      { left: 0, top: px(splitY + 2), right: px(w - splitX + 2), bottom: 0 },
      { left: px(splitX + 2), top: px(splitY + 2), right: 0, bottom: 0 }
    ],
    handleStyles: [
      { left: px(splitX - 2), top: 0, bottom: 0 },
      { top: px(splitY - 2), left: 0, right: 0 }
    ]
  }
}

const layoutTwoRowsRight = (w, h, ratios) => {
  const splitX = w * ratios.x[0] / 100
  const splitY = h * ratios.y[0] / 100
  return {
    wrapStyles: [
      { left: 0, top: 0, bottom: 0, right: px(w - splitX + 2) },
      { left: px(splitX + 2), top: 0, right: 0, bottom: px(h - splitY + 2) },
      { left: px(splitX + 2), top: px(splitY + 2), right: 0, bottom: 0 }
    ],
    handleStyles: [
      { left: px(splitX - 2), top: 0, bottom: 0 },
      { top: px(splitY - 2), left: px(splitX + 2), right: 0 }
    ]
  }
}

const layoutTwoColumnsBottom = (w, h, ratios) => {
  const splitX = w * ratios.x[0] / 100
  const splitY = h * ratios.y[0] / 100
  return {
    wrapStyles: [
      { left: 0, top: 0, right: 0, bottom: px(h - splitY + 2) },
      { left: 0, top: px(splitY + 2), right: px(w - splitX + 2), bottom: 0 },
      { left: px(splitX + 2), top: px(splitY + 2), right: 0, bottom: 0 }
    ],
    handleStyles: [
      { top: px(splitY - 2), left: 0, right: 0 },
      { left: px(splitX - 2), top: px(splitY + 2), bottom: 0 }
    ]
  }
}

const layoutFunctions = {
  [splitMap.c1]: layoutSingle,
  [splitMap.c2]: layoutTwoColumns,
  [splitMap.c3]: layoutThreeColumns,
  [splitMap.r2]: layoutTwoRows,
  [splitMap.r3]: layoutThreeRows,
  [splitMap.c2x2]: layoutGrid2x2,
  [splitMap.c1r2]: layoutTwoRowsRight,
  [splitMap.r1c2]: layoutTwoColumnsBottom
}

export default function layoutAlg (layout, w, h, savedRatios) {
  const layoutFunction = layoutFunctions[layout] || layoutSingle
  return layoutFunction(w, h, getLayoutRatios(layout, savedRatios))
}
