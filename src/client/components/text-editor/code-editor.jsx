import { useEffect, useRef, useState } from 'react'
import { Button, Flex, Tooltip } from 'antd'
import {
  CopyOutlined,
  RedoOutlined,
  SaveOutlined,
  SearchOutlined,
  SelectOutlined,
  UndoOutlined
} from '@ant-design/icons'
import { basicSetup } from 'codemirror'
import { Compartment, EditorState } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import {
  indentWithTab,
  redo,
  redoDepth,
  selectAll,
  undo,
  undoDepth
} from '@codemirror/commands'
import { gotoLine, openSearchPanel, search } from '@codemirror/search'
import classnames from 'classnames'
import { copy } from '../../common/clipboard'
import {
  getEditorLanguageName,
  loadEditorLanguage
} from './code-editor-language'

const editorTheme = EditorView.theme({
  '&': {
    height: '100%',
    color: 'var(--workbench-text, var(--text))',
    backgroundColor: 'var(--workbench-panel, var(--main))',
    fontSize: '13px'
  },
  '&.cm-focused': {
    outline: 'none'
  },
  '.cm-scroller': {
    fontFamily: 'Maple Mono, SFMono-Regular, Consolas, Liberation Mono, monospace',
    lineHeight: '1.65',
    minHeight: '0',
    height: '100%',
    overflowX: 'auto',
    overflowY: 'scroll',
    scrollbarGutter: 'stable'
  },
  '.cm-content': {
    caretColor: 'var(--workbench-primary, var(--primary))',
    padding: '8px 0'
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: 'var(--workbench-primary, var(--primary))'
  },
  '.cm-activeLine': {
    backgroundColor: 'rgba(62, 116, 169, .07)'
  },
  '.cm-selectionBackground, ::selection': {
    backgroundColor: 'rgba(76, 139, 202, .22) !important'
  },
  '.cm-gutters': {
    color: 'var(--workbench-muted, var(--text-light))',
    backgroundColor: 'var(--workbench-panel-soft, var(--main-light))',
    borderRight: '1px solid var(--workbench-border, var(--main-lighter))'
  },
  '.cm-activeLineGutter': {
    color: 'var(--workbench-text, var(--text))',
    backgroundColor: 'var(--workbench-primary-soft, rgba(62, 116, 169, .1))'
  },
  '.cm-panels': {
    color: 'var(--workbench-text, var(--text))',
    backgroundColor: 'var(--workbench-panel-soft, var(--main-light))'
  },
  '.cm-panels.cm-panels-top': {
    borderBottom: '1px solid var(--workbench-border, var(--main-lighter))'
  },
  '.cm-searchMatch': {
    backgroundColor: 'rgba(250, 173, 20, .32)'
  },
  '.cm-searchMatch.cm-searchMatch-selected': {
    backgroundColor: 'rgba(22, 119, 255, .28)'
  }
})

const editorPhrases = EditorState.phrases.of({
  Find: '查找',
  Replace: '替换',
  next: '下一个',
  previous: '上一个',
  all: '全选',
  'match case': '区分大小写',
  regexp: '正则表达式',
  'by word': '全字匹配',
  replace: '替换',
  'replace all': '全部替换',
  close: '关闭',
  'Go to line': '跳转到行',
  go: '跳转',
  Completions: '补全建议'
})

function getCursorStatus (state) {
  const position = state.selection.main.head
  const line = state.doc.lineAt(position)
  return {
    line: line.number,
    column: position - line.from + 1,
    lines: state.doc.lines,
    characters: state.doc.length
  }
}

export default function CodeEditor (props) {
  const {
    value = '',
    onChange,
    onSave,
    fileName = '',
    className,
    style
  } = props
  const hostRef = useRef(null)
  const viewRef = useRef(null)
  const onChangeRef = useRef(onChange)
  const onSaveRef = useRef(onSave)
  const syncingValueRef = useRef(false)
  const languageCompartmentRef = useRef(new Compartment())
  const wrapCompartmentRef = useRef(new Compartment())
  const [lineWrapping, setLineWrapping] = useState(false)
  const [languageName, setLanguageName] = useState(() => getEditorLanguageName(fileName))
  const [historyStatus, setHistoryStatus] = useState({
    canUndo: false,
    canRedo: false
  })
  const [cursorStatus, setCursorStatus] = useState({
    line: 1,
    column: 1,
    lines: 1,
    characters: String(value || '').length
  })

  onChangeRef.current = onChange
  onSaveRef.current = onSave

  useEffect(() => {
    if (!hostRef.current) return undefined

    // 2026-09-25 coder(lq): Use CodeMirror's extension model directly instead of a React wrapper so editor lifecycle and bundle behavior stay explicit in Electron.
    const state = EditorState.create({
      doc: String(value || ''),
      extensions: [
        basicSetup,
        editorTheme,
        editorPhrases,
        search({ top: true }),
        languageCompartmentRef.current.of([]),
        wrapCompartmentRef.current.of([]),
        EditorView.contentAttributes.of({
          'aria-label': '文件内容编辑器',
          spellcheck: 'false'
        }),
        keymap.of([
          {
            key: 'Mod-s',
            preventDefault: true,
            run: () => {
              onSaveRef.current?.()
              return true
            }
          },
          indentWithTab
        ]),
        EditorView.updateListener.of(update => {
          if (update.docChanged && !syncingValueRef.current) {
            onChangeRef.current?.(update.state.doc.toString())
          }
          if (update.docChanged || update.selectionSet) {
            setCursorStatus(getCursorStatus(update.state))
          }
          // 2026-09-25 coder(lq): Keep toolbar undo/redo availability aligned with CodeMirror's own history instead of maintaining a second edit stack.
          if (update.docChanged) {
            setHistoryStatus({
              canUndo: undoDepth(update.state) > 0,
              canRedo: redoDepth(update.state) > 0
            })
          }
        })
      ]
    })
    const view = new EditorView({
      state,
      parent: hostRef.current
    })
    viewRef.current = view
    setCursorStatus(getCursorStatus(view.state))
    view.focus()

    return () => {
      view.destroy()
      viewRef.current = null
    }
  }, [])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const nextValue = String(value || '')
    if (view.state.doc.toString() === nextValue) return
    syncingValueRef.current = true
    view.dispatch({
      changes: {
        from: 0,
        to: view.state.doc.length,
        insert: nextValue
      }
    })
    syncingValueRef.current = false
  }, [value])

  useEffect(() => {
    let cancelled = false
    setLanguageName(getEditorLanguageName(fileName))
    loadEditorLanguage(fileName).then(extension => {
      const view = viewRef.current
      if (cancelled || !view) return
      view.dispatch({
        effects: languageCompartmentRef.current.reconfigure(extension)
      })
    }).catch(window.store.onError)
    return () => {
      cancelled = true
    }
  }, [fileName])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({
      effects: wrapCompartmentRef.current.reconfigure(
        lineWrapping ? EditorView.lineWrapping : []
      )
    })
  }, [lineWrapping])

  function handleSearch () {
    const view = viewRef.current
    if (view) openSearchPanel(view)
  }

  function handleSave () {
    onSaveRef.current?.()
  }

  function handleUndo () {
    const view = viewRef.current
    if (view && undo(view)) view.focus()
  }

  function handleRedo () {
    const view = viewRef.current
    if (view && redo(view)) view.focus()
  }

  function handleSelectAll () {
    const view = viewRef.current
    if (view && selectAll(view)) view.focus()
  }

  function handleGotoLine () {
    const view = viewRef.current
    if (view) gotoLine(view)
  }

  function handleCopy () {
    copy(viewRef.current?.state.doc.toString() || '')
  }

  return (
    <div className={classnames('code-editor', className)} style={style}>
      <Flex className='code-editor-toolbar' align='center' justify='space-between' gap={8}>
        <Flex align='center' gap={4} wrap>
          <Tooltip title='保存（⌘/Ctrl + S）'>
            <Button
              type='primary'
              size='small'
              icon={<SaveOutlined />}
              onClick={handleSave}
            >
              保存
            </Button>
          </Tooltip>
          <Tooltip title='撤销（⌘/Ctrl + Z）'>
            <Button
              type='text'
              size='small'
              aria-label='撤销'
              icon={<UndoOutlined />}
              disabled={!historyStatus.canUndo}
              onClick={handleUndo}
            />
          </Tooltip>
          <Tooltip title='重做（⌘/Ctrl + Shift + Z）'>
            <Button
              type='text'
              size='small'
              aria-label='重做'
              icon={<RedoOutlined />}
              disabled={!historyStatus.canRedo}
              onClick={handleRedo}
            />
          </Tooltip>
          <Tooltip title='查找与替换（⌘/Ctrl + F）'>
            <Button
              type='text'
              size='small'
              icon={<SearchOutlined />}
              onClick={handleSearch}
            >
              查找/替换
            </Button>
          </Tooltip>
          <Tooltip title='跳转到指定行（Alt + G）'>
            <Button type='text' size='small' onClick={handleGotoLine}>
              跳转行
            </Button>
          </Tooltip>
          <Button
            type={lineWrapping ? 'primary' : 'text'}
            size='small'
            onClick={() => setLineWrapping(value => !value)}
          >
            自动换行
          </Button>
        </Flex>
        <Flex align='center' gap={8}>
          <span className='code-editor-language'>{languageName}</span>
          <Tooltip title='全选（⌘/Ctrl + A）'>
            <Button
              type='text'
              size='small'
              aria-label='全选'
              icon={<SelectOutlined />}
              onClick={handleSelectAll}
            />
          </Tooltip>
          <Tooltip title='复制全部内容'>
            <Button
              type='text'
              size='small'
              aria-label='复制全部内容'
              icon={<CopyOutlined />}
              onClick={handleCopy}
            />
          </Tooltip>
        </Flex>
      </Flex>
      <div ref={hostRef} className='code-editor-host' />
      <Flex className='code-editor-status' justify='space-between' align='center'>
        <span>行 {cursorStatus.line}，列 {cursorStatus.column}</span>
        <span>{cursorStatus.lines} 行 · {cursorStatus.characters} 字符</span>
      </Flex>
    </div>
  )
}
