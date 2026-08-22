export const softwareNames = [
  'nginx',
  'docker',
  'kubectl',
  'git',
  'node',
  'npm',
  'python3',
  'java',
  'mysql',
  'redis-server',
  'psql',
  'go'
]

const serviceCandidates = [
  'nginx:nginx',
  'docker:docker',
  'mysql:mysql',
  'mysql:mysqld',
  'mysql:mariadb',
  'redis-server:redis',
  'redis-server:redis-server',
  'psql:postgresql'
]

const processSoftwareCandidates = [
  'nginx:nginx',
  'node:node',
  'python3:python3',
  'java:java',
  'redis-server:redis-server'
]

const commonSoftwarePaths = [
  'nginx:/usr/sbin/nginx',
  'nginx:/usr/local/sbin/nginx',
  'nginx:/usr/local/nginx/sbin/nginx',
  'nginx:/usr/local/openresty/nginx/sbin/nginx',
  'nginx:/opt/nginx/sbin/nginx',
  'nginx:/opt/openresty/nginx/sbin/nginx',
  'nginx:/opt/homebrew/bin/nginx'
]

const sourcePriority = {
  common: 1,
  process: 2,
  path: 3
}

export const softwareSourceLabels = {
  path: 'PATH 发现',
  process: '运行进程发现',
  common: '常见目录发现'
}

const linuxProcessProbe = [
  'if [ "$(uname -s 2>/dev/null)" = Linux ] && [ -d /proc ]; then',
  'for spec in ' + processSoftwareCandidates.join(' ') + '; do',
  'software=$(printf "%s" "$spec" | cut -d: -f1)',
  'process_name=$(printf "%s" "$spec" | cut -d: -f2-)',
  'pid=$(ps -eo pid=,comm= 2>/dev/null | awk -v name="$process_name" \'$2 == name { print $1; exit }\')',
  '[ -n "$pid" ] || continue',
  'app_path=$(readlink -f "/proc/$pid/exe" 2>/dev/null || readlink "/proc/$pid/exe" 2>/dev/null || true)',
  '[ -n "$app_path" ] && [ -x "$app_path" ] && printf \'__PROFILE_SOFTWARE__=%s|%s|process\\n\' "$software" "$app_path"',
  'done',
  'fi'
].join('\n')

const macProcessProbe = [
  'if [ "$(uname -s 2>/dev/null)" = Darwin ]; then',
  'for spec in ' + processSoftwareCandidates.join(' ') + '; do',
  'software=$(printf "%s" "$spec" | cut -d: -f1)',
  'process_name=$(printf "%s" "$spec" | cut -d: -f2-)',
  'app_path=$(ps -axo comm= 2>/dev/null | awk -v name="$process_name" \'{ command=$0; sub(/^[[:space:]]+/, "", command); base=command; sub(/^.*\\//, "", base); if (base == name) { print command; exit } }\')',
  '[ -n "$app_path" ] && [ -x "$app_path" ] && printf \'__PROFILE_SOFTWARE__=%s|%s|process\\n\' "$software" "$app_path"',
  'done',
  'fi'
].join('\n')

const commonPathProbe = [
  'for spec in ' + commonSoftwarePaths.join(' ') + '; do',
  'software=$(printf "%s" "$spec" | cut -d: -f1)',
  'app_path=$(printf "%s" "$spec" | cut -d: -f2-)',
  '[ -x "$app_path" ] && printf \'__PROFILE_SOFTWARE__=%s|%s|common\\n\' "$software" "$app_path"',
  'done'
].join('\n')

const serviceProbe = [
  'if command -v systemctl >/dev/null 2>&1; then',
  'printf \'__PROFILE_SERVICE_MANAGER__=systemctl\\n\'',
  'for spec in ' + serviceCandidates.join(' ') + '; do',
  'software=$(printf "%s" "$spec" | cut -d: -f1)',
  'unit=$(printf "%s" "$spec" | cut -d: -f2-)',
  'systemctl list-unit-files "$unit.service" --no-legend 2>/dev/null | grep -q "^$unit.service" && printf \'__PROFILE_SERVICE__=%s|%s|systemctl\\n\' "$software" "$unit"',
  'done',
  'elif command -v brew >/dev/null 2>&1; then',
  'printf \'__PROFILE_SERVICE_MANAGER__=brew\\n\'',
  'brew_service_list="$(brew services list 2>/dev/null | awk \'NR > 1 {print $1}\')"',
  'for spec in ' + serviceCandidates.join(' ') + '; do',
  'software=$(printf "%s" "$spec" | cut -d: -f1)',
  'unit=$(printf "%s" "$spec" | cut -d: -f2-)',
  'printf \'%s\\n\' "$brew_service_list" | grep -qx "$unit" && printf \'__PROFILE_SERVICE__=%s|%s|brew\\n\' "$software" "$unit"',
  'done',
  'elif command -v service >/dev/null 2>&1; then',
  'printf \'__PROFILE_SERVICE_MANAGER__=service\\n\'',
  'for spec in ' + serviceCandidates.join(' ') + '; do',
  'software=$(printf "%s" "$spec" | cut -d: -f1)',
  'unit=$(printf "%s" "$spec" | cut -d: -f2-)',
  '[ -x "/etc/init.d/$unit" ] && printf \'__PROFILE_SERVICE__=%s|%s|service\\n\' "$software" "$unit"',
  'done',
  'fi'
].join('\n')

export const machineProbeCommand = [
  'printf \'__PROFILE_OS__=%s\\n\' "$(uname -s 2>/dev/null || echo unknown)"',
  'printf \'__PROFILE_ARCH__=%s\\n\' "$(uname -m 2>/dev/null || echo unknown)"',
  'printf \'__PROFILE_KERNEL__=%s\\n\' "$(uname -r 2>/dev/null || echo unknown)"',
  'printf \'__PROFILE_HOST__=%s\\n\' "$(hostname 2>/dev/null || echo unknown)"',
  'printf \'__PROFILE_USER__=%s\\n\' "$(id -un 2>/dev/null || echo unknown)"',
  'printf \'__PROFILE_SHELL__=%s\\n\' "$SHELL"',
  'if [ -r /etc/os-release ]; then . /etc/os-release; printf \'__PROFILE_DISTRO__=%s\\n\' "$PRETTY_NAME"; elif command -v sw_vers >/dev/null 2>&1; then printf \'__PROFILE_DISTRO__=%s %s\\n\' "$(sw_vers -productName)" "$(sw_vers -productVersion)"; fi',
  'for p in apt-get dnf yum apk pacman zypper brew; do command -v "$p" >/dev/null 2>&1 && { printf \'__PROFILE_PACKAGE__=%s\\n\' "$p"; break; }; done',
  'for app in ' + softwareNames.join(' ') + '; do app_path=$(command -v "$app" 2>/dev/null || true); [ -n "$app_path" ] && printf \'__PROFILE_SOFTWARE__=%s|%s|path\\n\' "$app" "$app_path"; done',
  // 2026-07-12 coder(lq): Custom deployments often start ./nginx outside PATH; /proc exposes the real executable without scanning the whole disk.
  linuxProcessProbe,
  macProcessProbe,
  commonPathProbe,
  serviceProbe,
  'printf \'__PROFILE_DONE__=1\\n\''
].join('; ')

export function parseMachineProfile (output) {
  const profile = {
    os: '',
    arch: '',
    kernel: '',
    host: '',
    user: '',
    shell: '',
    distro: '',
    packageManager: '',
    serviceManager: '',
    software: [],
    services: []
  }
  String(output || '').split(/\r?\n/).forEach(line => {
    const divider = line.indexOf('=')
    if (divider < 0) return
    const key = line.slice(0, divider)
    const value = line.slice(divider + 1).trim()
    if (key === '__PROFILE_SOFTWARE__') {
      const [name, path, source = 'path'] = value.split('|')
      if (!name || !path) return
      const software = { name, path, source }
      const index = profile.software.findIndex(item => item.name === name)
      if (index < 0) {
        profile.software.push(software)
      } else if ((sourcePriority[source] || 0) > (sourcePriority[profile.software[index].source] || 0)) {
        profile.software[index] = software
      }
      return
    }
    if (key === '__PROFILE_SERVICE__') {
      const [software, unit, manager] = value.split('|')
      if (software && unit && manager && !profile.services.some(item => item.software === software)) {
        profile.services.push({ software, unit, manager })
      }
      return
    }
    const fields = {
      __PROFILE_OS__: 'os',
      __PROFILE_ARCH__: 'arch',
      __PROFILE_KERNEL__: 'kernel',
      __PROFILE_HOST__: 'host',
      __PROFILE_USER__: 'user',
      __PROFILE_SHELL__: 'shell',
      __PROFILE_DISTRO__: 'distro',
      __PROFILE_PACKAGE__: 'packageManager',
      __PROFILE_SERVICE_MANAGER__: 'serviceManager'
    }
    if (fields[key]) profile[fields[key]] = value
  })
  return profile
}
