const RESET = '\u001b[0m'

const DEFAULT_LOG_PATTERNS = [
  {
    regex: /\b\d{4}-\d{2}-\d{2}[T ][0-9:.]{8,18}(?:Z|[+-]\d{2}:?\d{2})?\b/g,
    colorCode: '\u001b[90m'
  },
  {
    regex: /\bERROR\b/g,
    colorCode: '\u001b[1;31m'
  },
  {
    regex: /\bWARN\b/g,
    colorCode: '\u001b[1;33m'
  },
  {
    regex: /\bINFO\b/g,
    colorCode: '\u001b[1;36m'
  },
  {
    regex: /\bDEBUG\b/g,
    colorCode: '\u001b[2;37m'
  },
  {
    regex: /\bhttps?:\/\/[^\s,"]+/g,
    colorCode: '\u001b[4;36m'
  },
  {
    regex: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    colorCode: '\u001b[36m'
  }
]

export class KeywordHighlighterAddon {
  constructor (keywords, options = {}) {
    this.keywords = keywords || []
    this.enableLogHighlight = options.enableLogHighlight !== false
    this.compiledPatterns = this.compilePatterns()
    this.compiledLogPatterns = this.compileLogPatterns()
  }

  // Pre-compile all regex patterns once for better performance
  compilePatterns = () => {
    const patterns = []
    for (const obj of this.keywords) {
      const { keyword, color = 'red' } = obj || {}
      if (keyword) {
        try {
          patterns.push({
            regex: new RegExp(keyword, 'gi'),
            colorCode: this.getColorCode(color)
          })
        } catch (e) {
          console.error('Invalid keyword regex:', keyword, e)
        }
      }
    }
    return patterns
  }

  compileLogPatterns = () => {
    return DEFAULT_LOG_PATTERNS.map(pattern => ({
      ...pattern,
      regex: new RegExp(pattern.regex.source, pattern.regex.flags)
    }))
  }

  getColorCode = (color) => {
    const colorMap = {
      green: '\u001b[32m',
      yellow: '\u001b[33m',
      blue: '\u001b[34m',
      magenta: '\u001b[35m',
      cyan: '\u001b[36m',
      white: '\u001b[37m',
      red: '\u001b[31m'
    }
    return colorMap[color] || colorMap.red
  }

  containsDcsSequence = (text) => {
    const ESC = String.fromCharCode(27)
    return text.includes(ESC + 'P')
  }

  escape = str => {
    return str.replace(/\\x1B/g, '\\x1B')
      .replace(/\033/g, '\\033')
  }

  highlightKeywords = (text) => {
    // Early exit if no patterns
    if (this.compiledPatterns.length === 0 && !this.enableLogHighlight) {
      return text
    }

    // Split text into segments: ANSI/OSC sequences vs plain text
    // Match OSC sequences (ESC ] ... BEL or ESC ] ... ESC \) and CSI sequences (ESC [ ... letter)
    // Use String.fromCharCode to avoid lint warnings about control characters
    const ESC = String.fromCharCode(27) // \x1b
    const BEL = String.fromCharCode(7) // \x07
    // eslint-disable-next-line no-control-regex
    const ansiPattern = new RegExp('(' + ESC + '\\][^' + BEL + ESC + ']*(?:' + BEL + '|' + ESC + '\\\\)|' + ESC + '\\[\\??[0-9;]*[A-Za-z])', 'g')

    const segments = []
    let lastIndex = 0
    let match

    while ((match = ansiPattern.exec(text)) !== null) {
      // Add plain text before this sequence
      if (match.index > lastIndex) {
        segments.push({ type: 'text', content: text.slice(lastIndex, match.index) })
      }
      // Add the ANSI sequence (don't highlight)
      segments.push({ type: 'ansi', content: match[0] })
      lastIndex = ansiPattern.lastIndex
    }

    // Add remaining plain text
    if (lastIndex < text.length) {
      segments.push({ type: 'text', content: text.slice(lastIndex) })
    }

    // Highlight only plain text segments using two-phase approach
    // to prevent patterns from interfering with each other's ANSI codes
    const result = segments.map(seg => {
      if (seg.type === 'ansi') {
        return seg.content
      }
      const content = seg.content
      return this.highlightPlainText(content)
    }).join('')

    return result
  }

  containsLogSignal = (text) => {
    return /\b(?:INFO|WARN|ERROR|DEBUG)\b/.test(text) ||
      /\b\d{4}-\d{2}-\d{2}[T ][0-9:.]{8,18}(?:Z|[+-]\d{2}:?\d{2})?\b/.test(text) ||
      /\bhttps?:\/\/[^\s,"]+/.test(text) ||
      /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(text)
  }

  getPatternsForText = (text) => {
    const patterns = [...this.compiledPatterns]
    if (this.enableLogHighlight && this.containsLogSignal(text)) {
      patterns.push(...this.compiledLogPatterns)
    }
    return patterns
  }

  highlightPlainText = (text) => {
    return text.split(/(\r\n|\n|\r)/).map(part => {
      if (/^(?:\r\n|\n|\r)$/.test(part)) {
        return part
      }
      const patterns = this.getPatternsForText(part)
      if (patterns.length === 0) {
        return part
      }
      // Phase 1: collect all match positions from all patterns on original text
      const matches = []
      for (const { regex, colorCode } of patterns) {
        regex.lastIndex = 0
        let m
        while ((m = regex.exec(part)) !== null) {
          if (m[0].length === 0) {
            regex.lastIndex++
            continue
          }
          matches.push({
            start: m.index,
            end: m.index + m[0].length,
            text: m[0],
            colorCode
          })
        }
      }
      if (matches.length === 0) {
        return part
      }
      // Phase 2: sort by position, remove overlaps (first pattern wins)
      matches.sort((a, b) => a.start - b.start || a.end - b.end)
      const filtered = [matches[0]]
      for (let i = 1; i < matches.length; i++) {
        if (matches[i].start >= filtered[filtered.length - 1].end) {
          filtered.push(matches[i])
        }
      }
      // Build result with ANSI codes inserted at correct positions
      let highlighted = ''
      let pos = 0
      for (const m of filtered) {
        highlighted += part.slice(pos, m.start)
        highlighted += m.colorCode + m.text + RESET
        pos = m.end
      }
      highlighted += part.slice(pos)
      return highlighted
    }).join('')
  }

  activate (terminal) {
    this.terminal = terminal
    // Store the original write method properly bound to terminal
    this.originalWrite = terminal.write.bind(terminal)
    const self = this
    terminal.write = function (data, callback) {
      if (typeof data !== 'string') {
        return self.originalWrite(data, callback)
      }
      if (self.containsDcsSequence(data)) {
        return self.originalWrite(data, callback)
      }
      self.originalWrite(
        terminal.displayRaw ? self.escape(data) : self.highlightKeywords(data),
        callback
      )
    }
  }

  dispose () {
    // Restore the original write method when disposing the addon
    this.terminal.write = this.originalWrite
    this.originalWrite = null
    this.terminal = null
  }
}
