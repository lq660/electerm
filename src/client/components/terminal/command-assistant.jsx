/* eslint-disable no-template-curly-in-string */
import { useEffect, useMemo, useState } from 'react'
import { Input } from 'antd'
import {
  CodeOutlined,
  DesktopOutlined,
  ExclamationCircleOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  SearchOutlined,
  SendOutlined
} from '@ant-design/icons'
import Modal from '../common/modal'
import { runCmd } from './terminal-apis'
import {
  machineProbeCommand,
  parseMachineProfile,
  softwareNames,
  softwareSourceLabels
} from './command-assistant-profile.mjs'
import './command-assistant.styl'

function shellQuote (value, fallback = '.') {
  const text = String(value || fallback)
  return "'" + text.replace(/'/g, "'\"'\"'") + "'"
}

function positiveInteger (value, fallback) {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function wait (milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

function softwareVersionCommand ({ name, path }) {
  const executable = shellQuote(path, name)
  if (name === 'nginx') {
    return `${executable} -v; ${executable} -V 2>&1 | tr ' ' '\\n' | grep -E '^--(prefix|conf-path|sbin-path|error-log-path|http-log-path)='`
  }
  if (name === 'java') return `${executable} -version`
  if (name === 'redis-server') return `${executable} --version`
  return `${executable} --version`
}

function serviceCommand (service, action) {
  if (!service) return ''
  const needsPrivilege = action === 'restart' || action === 'reload'
  const prefix = needsPrivilege ? 'sudo ' : ''
  if (service.manager === 'systemctl') {
    return `${prefix}systemctl ${action} ${shellQuote(service.unit)}${action === 'status' ? ' --no-pager' : ''}`
  }
  if (service.manager === 'service') {
    return `${prefix}service ${shellQuote(service.unit)} ${action}`
  }
  const brewAction = action === 'status' ? 'info' : action === 'reload' ? 'restart' : action
  return `brew services ${brewAction} ${shellQuote(service.unit)}`
}

function buildSoftwareOperations (software, profile) {
  const { name, path } = software
  const service = profile.services.find(item => item.software === name)
  const executable = shellQuote(path, name)
  const divider = path.lastIndexOf('/')
  const directory = divider > 0 ? path.slice(0, divider) : '.'
  const common = [
    {
      id: 'version',
      title: '查看版本',
      description: `执行 ${name} 的版本查询命令。`,
      command: softwareVersionCommand(software),
      risk: 'read'
    },
    {
      id: 'directory',
      title: '进入安装目录',
      description: `进入 ${directory} 并列出目录内容。`,
      command: `cd ${shellQuote(directory)} && pwd && ls -la`,
      risk: 'read'
    },
    {
      id: 'file-info',
      title: '查看命令文件',
      description: `查看 ${path} 的文件类型、权限和软链接。`,
      command: `ls -lh ${executable}; file ${executable}`,
      risk: 'read'
    }
  ]
  const specific = {
    nginx: [
      {
        id: 'process',
        title: '查看运行进程',
        description: '查看 Nginx 主进程、工作进程和完整启动参数。',
        command: "ps -eo pid,ppid,user,lstart,args | grep '[n]ginx'"
      },
      {
        id: 'config',
        title: '查看配置路径',
        description: '显示 Nginx 编译时配置的安装、配置和日志路径。',
        command: softwareVersionCommand(software)
      },
      {
        id: 'test-config',
        title: '检查配置',
        description: '验证 Nginx 配置语法，不重启服务。',
        command: `${executable} -t`
      },
      {
        id: 'find-directories',
        title: '查找相关目录',
        description: '从指定位置查找名称包含 nginx 的目录。',
        params: [
          { key: 'path', label: '查找范围', defaultValue: '/', placeholder: '例如 / 或 /etc' }
        ],
        build: ({ values }) => `find ${shellQuote(values.path, '/')} -type d -iname '*nginx*' 2>/dev/null`
      },
      {
        id: 'status',
        title: '查看服务状态',
        description: `通过 ${service?.manager || '服务管理器'} 查看 Nginx 服务状态。`,
        command: serviceCommand(service, 'status'),
        requiresService: true
      },
      {
        id: 'reload',
        title: '重载配置',
        description: service
          ? `通过 ${service.manager} 不中断现有连接并重新加载配置。`
          : `使用 ${path} 向 Nginx 主进程发送重载信号。`,
        command: service ? serviceCommand(service, 'reload') : `${executable} -s reload`,
        risk: 'change'
      },
      {
        id: 'restart',
        title: '重启服务',
        description: '停止并重新启动 Nginx，可能短暂影响请求。',
        command: serviceCommand(service, 'restart'),
        requiresService: true,
        risk: 'danger'
      }
    ],
    docker: [
      {
        id: 'containers',
        title: '查看运行中的容器',
        description: '以表格形式列出运行中的 Docker 容器。',
        command: `${executable} ps --format 'table {{.Names}}\\t{{.Image}}\\t{{.Status}}\\t{{.Ports}}'`
      },
      {
        id: 'disk',
        title: '查看空间占用',
        description: '查看镜像、容器和数据卷占用的磁盘空间。',
        command: `${executable} system df`
      },
      {
        id: 'status',
        title: '查看服务状态',
        description: `通过 ${service?.manager || '服务管理器'} 查看 Docker 服务状态。`,
        command: serviceCommand(service, 'status'),
        requiresService: true
      },
      {
        id: 'restart',
        title: '重启服务',
        description: '重启 Docker 服务，可能影响当前运行的容器。',
        command: serviceCommand(service, 'restart'),
        requiresService: true,
        risk: 'danger'
      }
    ],
    mysql: [
      {
        id: 'config',
        title: '查看默认配置',
        description: '显示 MySQL 客户端读取配置文件的位置。',
        command: `${executable} --help 2>/dev/null | grep -A 1 'Default options are read from'`
      },
      {
        id: 'status',
        title: '查看服务状态',
        description: `通过 ${service?.manager || '服务管理器'} 查看 MySQL 服务状态。`,
        command: serviceCommand(service, 'status'),
        requiresService: true
      },
      {
        id: 'restart',
        title: '重启服务',
        description: '重启 MySQL 服务，期间数据库连接会中断。',
        command: serviceCommand(service, 'restart'),
        requiresService: true,
        risk: 'danger'
      }
    ],
    'redis-server': [
      {
        id: 'process',
        title: '查看运行进程',
        description: '查看 Redis 服务进程和启动参数。',
        command: "ps aux | grep '[r]edis-server'"
      },
      {
        id: 'status',
        title: '查看服务状态',
        description: `通过 ${service?.manager || '服务管理器'} 查看 Redis 服务状态。`,
        command: serviceCommand(service, 'status'),
        requiresService: true
      },
      {
        id: 'restart',
        title: '重启服务',
        description: '重启 Redis 服务，可能造成短暂不可用。',
        command: serviceCommand(service, 'restart'),
        requiresService: true,
        risk: 'danger'
      }
    ],
    node: [
      {
        id: 'environment',
        title: '查看 Node 环境',
        description: '显示 Node、npm 版本和全局模块目录。',
        command: `${executable} --version; command -v npm; npm --version; npm root -g`
      }
    ],
    npm: [
      {
        id: 'global-packages',
        title: '查看全局安装包',
        description: '列出 npm 全局安装的一级依赖。',
        command: `${executable} list -g --depth=0`
      },
      {
        id: 'config',
        title: '查看全局目录',
        description: '显示 npm 全局安装前缀和模块目录。',
        command: `${executable} config get prefix; ${executable} root -g`
      }
    ],
    python3: [
      {
        id: 'environment',
        title: '查看 Python 环境',
        description: '显示解释器、版本和 site-packages 目录。',
        command: `${executable} -c "import sys, site; print(sys.version); print(sys.executable); print('\\n'.join(site.getsitepackages()))"`
      },
      {
        id: 'packages',
        title: '查看已安装包',
        description: '列出当前 Python 环境安装的软件包。',
        command: `${executable} -m pip list`
      }
    ],
    git: [
      {
        id: 'config',
        title: '查看配置来源',
        description: '列出 Git 配置及其所在文件。',
        command: `${executable} config --list --show-origin`
      }
    ],
    kubectl: [
      {
        id: 'contexts',
        title: '查看集群上下文',
        description: '列出 kubeconfig 中配置的集群上下文。',
        command: `${executable} config get-contexts`
      }
    ],
    go: [
      {
        id: 'environment',
        title: '查看 Go 环境',
        description: '显示 GOROOT、GOPATH、代理和模块配置。',
        command: `${executable} env GOROOT GOPATH GOPROXY GO111MODULE`
      }
    ]
  }
  return [...common, ...(specific[name] || [])]
    .filter(operation => !operation.requiresService || service)
    .map(operation => ({
      ...operation,
      risk: operation.risk || 'read'
    }))
}

function buildMachineCommands (profile) {
  if (!profile) return []
  const machineLabel = [profile.distro || profile.os, profile.arch].filter(Boolean).join(' · ')
  const commands = [
    {
      id: 'machine-overview',
      category: '当前环境',
      title: `查看 ${profile.host || '当前主机'} 的系统信息`,
      description: machineLabel || '查看操作系统、内核、架构、用户和 Shell。',
      keywords: `系统 版本 主机 内核 架构 shell ${profile.host} ${profile.distro}`,
      build: () => "printf '主机: '; hostname; printf '系统: '; uname -s; printf '内核: '; uname -r; printf '架构: '; uname -m; printf '用户: '; id -un; printf 'Shell: '; printf '%s\\n' \"${SHELL:-unknown}\""
    },
    {
      id: 'machine-software-paths',
      category: '当前环境',
      title: '列出当前机器的常用软件路径',
      description: `已识别 ${profile.software.length} 个常用软件命令。`,
      keywords: '软件 路径 命令 安装位置 command which whereis',
      build: () => `for app in ${softwareNames.join(' ')}; do app_path=$(command -v "$app" 2>/dev/null || true); [ -n "$app_path" ] && printf '%-16s %s\\n' "$app" "$app_path"; done`
    }
  ]
  profile.software.forEach(software => {
    const operations = buildSoftwareOperations(software, profile)
    const runningProcess = software.source === 'process'
    commands.push({
      id: `machine-software-${software.name}`,
      category: '已安装软件',
      title: `${software.name} · ${runningProcess ? '运行中' : '已安装'}`,
      description: `${software.path} · ${softwareSourceLabels[software.source] || softwareSourceLabels.path}`,
      keywords: `${software.name} 软件 路径 版本 安装 常用操作 ${operations.map(item => item.title).join(' ')}`,
      operations
    })
  })
  return commands
}

// 2026-07-11 coder(lq): Keep reliable daily operations in a local catalog so command lookup works without an AI model or network access.
const commandCatalog = [
  {
    id: 'directory-size',
    category: '磁盘',
    title: '统计每个子目录的大小',
    description: '按从小到大排序，快速定位占用空间较多的目录。',
    keywords: '目录 大小 磁盘 du sort 文件夹 占用空间',
    params: [
      { key: 'path', label: '目标目录', defaultValue: '.', placeholder: '例如 /var 或 .' }
    ],
    build: ({ values, system }) => system === 'mac'
      ? `du -hd 1 ${shellQuote(values.path)} 2>/dev/null | sort -h`
      : `du -h --max-depth=1 ${shellQuote(values.path)} 2>/dev/null | sort -h`
  },
  {
    id: 'large-files',
    category: '磁盘',
    title: '查找最大的文件',
    description: '列出指定目录中体积最大的 20 个文件。',
    keywords: '大文件 磁盘 空间 find size top',
    params: [
      { key: 'path', label: '目标目录', defaultValue: '.', placeholder: '例如 /var/log' }
    ],
    build: ({ values, system }) => system === 'mac'
      ? `find ${shellQuote(values.path)} -type f -exec du -h {} + 2>/dev/null | sort -hr | head -n 20`
      : `find ${shellQuote(values.path)} -type f -printf '%s %p\\n' 2>/dev/null | sort -nr | head -n 20 | numfmt --field=1 --to=iec`
  },
  {
    id: 'disk-usage',
    category: '磁盘',
    title: '查看磁盘空间',
    description: '查看各磁盘分区的总量、已用空间和剩余空间。',
    keywords: '磁盘 分区 空间 df 容量',
    build: () => 'df -h'
  },
  {
    id: 'port-process',
    category: '网络',
    title: '查看端口被哪个进程占用',
    description: '显示监听指定端口的进程、PID 和连接信息。',
    keywords: '端口 进程 占用 port pid lsof 80 443',
    params: [
      { key: 'port', label: '端口', defaultValue: '80', placeholder: '例如 80' }
    ],
    build: ({ values }) => `lsof -nP -iTCP:${positiveInteger(values.port, 80)} -sTCP:LISTEN`
  },
  {
    id: 'listening-ports',
    category: '网络',
    title: '查看所有监听端口',
    description: '列出当前机器正在监听的 TCP 端口和对应进程。',
    keywords: '端口 监听 网络 ss netstat lsof',
    build: ({ system }) => system === 'mac'
      ? 'lsof -nP -iTCP -sTCP:LISTEN'
      : 'ss -lntp'
  },
  {
    id: 'tail-log',
    category: '日志',
    title: '查看日志最后若干行',
    description: '查看日志文件末尾内容，不持续占用终端。',
    keywords: '日志 最后 tail 行 error access log',
    params: [
      { key: 'path', label: '日志文件', defaultValue: '/var/log/nginx/error.log', placeholder: '例如 /var/log/app.log' },
      { key: 'lines', label: '显示行数', defaultValue: '100', placeholder: '例如 100' }
    ],
    build: ({ values }) => `tail -n ${positiveInteger(values.lines, 100)} ${shellQuote(values.path, '/var/log/nginx/error.log')}`
  },
  {
    id: 'follow-log',
    category: '日志',
    title: '实时跟踪日志',
    description: '持续显示新增日志，使用 Ctrl+C 停止。',
    keywords: '日志 实时 跟踪 tail follow',
    params: [
      { key: 'path', label: '日志文件', defaultValue: '/var/log/nginx/error.log', placeholder: '例如 /var/log/app.log' }
    ],
    build: ({ values }) => `tail -f ${shellQuote(values.path, '/var/log/nginx/error.log')}`
  },
  {
    id: 'top-cpu',
    category: '进程',
    title: '查看 CPU 占用最高的进程',
    description: '按 CPU 占用从高到低列出前 15 个进程。',
    keywords: 'cpu 进程 占用 ps top 性能',
    build: () => 'ps aux | sort -nrk 3 | head -n 15'
  },
  {
    id: 'memory',
    category: '系统',
    title: '查看内存使用情况',
    description: '查看当前系统的内存使用概况。',
    keywords: '内存 memory free vm_stat 使用率',
    build: ({ system }) => system === 'mac' ? 'vm_stat' : 'free -h'
  },
  {
    id: 'find-file',
    category: '文件',
    title: '按名称查找文件',
    description: '在指定目录下忽略大小写查找文件或目录。',
    keywords: '文件 查找 搜索 find name',
    params: [
      { key: 'path', label: '查找范围', defaultValue: '.', placeholder: '例如 /var/www' },
      { key: 'name', label: '名称关键字', defaultValue: 'nginx', placeholder: '例如 nginx' }
    ],
    build: ({ values }) => `find ${shellQuote(values.path)} -iname ${shellQuote(`*${values.name || 'nginx'}*`)} 2>/dev/null`
  }
]

const defaultValues = commandCatalog.reduce((result, item) => {
  result[item.id] = (item.params || []).reduce((values, param) => ({
    ...values,
    [param.key]: param.defaultValue
  }), {})
  return result
}, {})

export default function CommandAssistant ({
  open,
  onClose,
  onUseCommand,
  defaultSystem = 'linux',
  terminalName = '当前终端',
  terminalId
}) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('全部')
  const [selectedId, setSelectedId] = useState(commandCatalog[0].id)
  const [selectedOperationId, setSelectedOperationId] = useState('')
  const [values, setValues] = useState(defaultValues)
  const [system, setSystem] = useState(defaultSystem)
  const [machineProfile, setMachineProfile] = useState(null)
  const [profileLoading, setProfileLoading] = useState(true)
  const [profileError, setProfileError] = useState('')
  const [profileVersion, setProfileVersion] = useState(0)
  const catalog = useMemo(() => {
    const installedSoftware = new Set(
      (machineProfile?.software || []).map(item => item.name)
    )
    const availableCommands = commandCatalog.filter(item => (
      !item.requiresSoftware || installedSoftware.has(item.requiresSoftware)
    ))
    return [
      ...buildMachineCommands(machineProfile),
      ...availableCommands
    ]
  }, [machineProfile])
  const categories = ['全部', ...new Set(catalog.map(item => item.category))]

  useEffect(() => {
    let disposed = false
    const inspect = async () => {
      setProfileLoading(true)
      setProfileError('')
      if (!terminalId) {
        setProfileLoading(false)
        setProfileError('当前终端尚未就绪，已显示通用命令。')
        return
      }
      let output = ''
      // 2026-07-12 coder(lq): A newly opened terminal can render before its background process accepts run-cmd requests, so retry only during this short startup window.
      for (const retryDelay of [0, 350, 900]) {
        if (retryDelay) await wait(retryDelay)
        if (disposed) return
        output = await runCmd(terminalId, machineProbeCommand).catch(() => '')
        if (output.includes('__PROFILE_DONE__=1')) break
      }
      if (disposed) return
      const profile = parseMachineProfile(output)
      if (!profile.os && !profile.distro && !profile.software.length) {
        setMachineProfile(null)
        setProfileError('未能读取当前终端环境，已显示通用命令。')
      } else {
        setMachineProfile(profile)
        setSystem(profile.os === 'Darwin' ? 'mac' : 'linux')
        setSelectedId('machine-overview')
        setSelectedOperationId('')
      }
      setProfileLoading(false)
    }
    inspect()
    return () => {
      disposed = true
    }
  }, [profileVersion, terminalId])

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    return catalog.filter(item => {
      const categoryMatch = category === '全部' || item.category === category
      const searchText = `${item.title} ${item.description} ${item.keywords}`.toLowerCase()
      return categoryMatch && (!keyword || searchText.includes(keyword))
    })
  }, [catalog, category, query])
  const selected = filtered.find(item => item.id === selectedId) || filtered[0] || catalog[0]
  const activeOperation = selected.operations?.find(item => item.id === selectedOperationId) || selected.operations?.[0]
  const activeParams = activeOperation?.params || selected.params || []
  const selectedValues = values[selected.id] || {}
  const command = activeOperation
    ? activeOperation.build
      ? activeOperation.build({ values: selectedValues, system })
      : activeOperation.command
    : selected.build({ values: selectedValues, system })
  const activeTitle = activeOperation ? `${selected.title.replace(/ · (已安装|运行中)$/, '')} · ${activeOperation.title}` : selected.title
  const activeDescription = activeOperation?.description || selected.description
  const activeRisk = activeOperation?.risk || selected.risk || 'read'
  const riskLabels = {
    read: '只读操作',
    change: '变更操作',
    danger: '高风险操作'
  }
  const requiresConfirmation = activeRisk !== 'read'
  const softwareExamples = machineProfile?.software.slice(0, 2).map(item => item.name) || []
  const searchPlaceholder = softwareExamples.length
    ? `已发现 ${softwareExamples.join('、')}，可搜索软件路径、系统信息或运维命令`
    : '用中文搜索命令，例如：查找 nginx、统计目录大小、查看 80 端口'

  const handleValueChange = (key, value) => {
    setValues(current => ({
      ...current,
      [selected.id]: {
        ...current[selected.id],
        [key]: value
      }
    }))
  }

  const handleUse = (execute) => {
    if (execute && requiresConfirmation) {
      Modal.confirm({
        title: '确认执行服务操作',
        okText: '确认执行',
        cancelText: '取消',
        content: (
          <div className='command-assistant-confirm'>
            <ExclamationCircleOutlined />
            <div>
              <strong>{activeTitle}</strong>
              <p>{activeDescription}</p>
              <code>{command}</code>
            </div>
          </div>
        ),
        onOk: () => onUseCommand(command, true)
      })
      return
    }
    onUseCommand(command, execute)
  }

  const handleSelectSoftware = (name) => {
    setQuery('')
    setCategory('全部')
    setSelectedId(`machine-software-${name}`)
    setSelectedOperationId('version')
  }

  const handleSelectCommand = (item) => {
    setSelectedId(item.id)
    setSelectedOperationId(item.operations?.[0]?.id || '')
  }

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title='命令助手'
      width={860}
      footer={null}
      wrapClassName='command-assistant-modal'
    >
      <div className='command-assistant-head'>
        <Input
          value={query}
          onChange={event => setQuery(event.target.value)}
          prefix={<SearchOutlined />}
          placeholder={searchPlaceholder}
          autoFocus
        />
        <div className='command-assistant-system' aria-label='命令运行环境'>
          <span>运行环境</span>
          <button className={system === 'linux' ? 'active' : ''} onClick={() => setSystem('linux')}>Linux</button>
          <button className={system === 'mac' ? 'active' : ''} onClick={() => setSystem('mac')}>macOS</button>
        </div>
      </div>

      <div className='command-assistant-machine'>
        <DesktopOutlined />
        {profileLoading
          ? (
            <div className='command-assistant-machine-loading'>
              <strong>正在读取当前终端环境</strong>
              <span>识别系统、架构、Shell、包管理器和常用软件路径</span>
            </div>
            )
          : machineProfile
            ? (
              <>
                <div className='command-assistant-machine-info'>
                  <strong>{machineProfile.user ? `${machineProfile.user}@` : ''}{machineProfile.host || terminalName}</strong>
                  <span>
                    {[machineProfile.distro || machineProfile.os, machineProfile.arch, machineProfile.shell, machineProfile.packageManager, machineProfile.serviceManager]
                      .filter(Boolean).join(' · ')}
                  </span>
                </div>
                <div className='command-assistant-machine-software'>
                  {machineProfile.software.slice(0, 8).map(item => (
                    <button
                      key={item.name}
                      title={`${item.path}（${softwareSourceLabels[item.source] || softwareSourceLabels.path}）`}
                      onClick={() => handleSelectSoftware(item.name)}
                    >
                      <b>{item.name}</b>
                      <span>{softwareSourceLabels[item.source] || softwareSourceLabels.path} · {item.path}</span>
                    </button>
                  ))}
                </div>
              </>
              )
            : (
              <div className='command-assistant-machine-loading error'>
                <strong>当前环境未识别</strong>
                <span>{profileError}</span>
              </div>
              )}
        <button
          className='command-assistant-machine-refresh'
          title='重新读取当前终端环境'
          disabled={profileLoading}
          onClick={() => setProfileVersion(version => version + 1)}
        >
          <ReloadOutlined spin={profileLoading} />
        </button>
      </div>

      <div className='command-assistant-categories'>
        {categories.map(item => (
          <button
            key={item}
            className={item === category ? 'active' : ''}
            onClick={() => setCategory(item)}
          >
            {item}
          </button>
        ))}
      </div>

      <div className='command-assistant-layout'>
        <div className='command-assistant-results'>
          {filtered.length
            ? filtered.map(item => (
              <button
                key={item.id}
                className={item.id === selected.id ? 'active' : ''}
                onClick={() => handleSelectCommand(item)}
              >
                <CodeOutlined />
                <span>
                  <b>{item.title}</b>
                  <em>{item.description}</em>
                </span>
              </button>
            ))
            : <div className='command-assistant-empty'>没有找到匹配的内置命令</div>}
        </div>

        <div className='command-assistant-detail'>
          <div className='command-assistant-detail-title'>
            <span>{selected.category}</span>
            <strong>{selected.title}</strong>
            <p>{selected.description}</p>
          </div>
          {selected.operations?.length
            ? (
              <div className='command-assistant-operation-section'>
                <div className='command-assistant-operation-label'>常用操作</div>
                <div className='command-assistant-operations'>
                  {selected.operations.map(operation => (
                    <button
                      key={operation.id}
                      className={operation.id === activeOperation?.id ? `active risk-${operation.risk}` : `risk-${operation.risk}`}
                      onClick={() => setSelectedOperationId(operation.id)}
                    >
                      <span>{operation.title}</span>
                      <em>{riskLabels[operation.risk]}</em>
                    </button>
                  ))}
                </div>
              </div>
              )
            : null}
          {activeParams.length > 0 && (
            <div className='command-assistant-params'>
              {activeParams.map(param => (
                <label key={param.key}>
                  <span>{param.label}</span>
                  <Input
                    value={selectedValues[param.key] ?? param.defaultValue}
                    placeholder={param.placeholder}
                    onChange={event => handleValueChange(param.key, event.target.value)}
                  />
                </label>
              ))}
            </div>
          )}
          <div className='command-assistant-preview-label'>命令预览</div>
          <pre className='command-assistant-preview'>{command}</pre>
          {requiresConfirmation
            ? (
              <div className={`command-assistant-risk risk-${activeRisk}`}>
                <ExclamationCircleOutlined />
                {activeRisk === 'danger'
                  ? '高风险操作可能导致服务短暂不可用，直接执行前需要再次确认。'
                  : '该操作会改变服务运行状态，直接执行前需要再次确认。'}
              </div>
              )
            : null}
          <div className='command-assistant-target'>发送到：{terminalName}</div>
          <div className='command-assistant-actions'>
            <button className='secondary' onClick={() => handleUse(false)}>
              <SendOutlined />
              填入终端
            </button>
            <button className='primary' onClick={() => handleUse(true)}>
              <PlayCircleOutlined />
              执行命令
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
