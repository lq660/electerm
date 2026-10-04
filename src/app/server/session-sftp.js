/**
 * terminal/sftp/serial class
 */
const {
  readRemoteFile,
  writeRemoteFile
} = require('./sftp-file')
const { commonExtends } = require('./session-common.js')
const { TerminalBase } = require('./session-base.js')
const {
  buildPosixFolderSizeCommand,
  getSizeCount,
  getSizeCountWin
} = require('../common/get-folder-size-and-file-count.js')
const globalState = require('./global-state')
const { promisify } = require('node:util')
const { pipeline } = require('node:stream/promises')
const remotePath = require('node:path').posix

class Sftp extends TerminalBase {
  connect (initOptions) {
    return this.remoteInitSftp(initOptions)
  }

  applySshFsOverride = (sshFs) => {
    sshFs.isSshFsFallback = true
    this.sftp = sshFs
    this.isSshFsFallback = true
    const proto = Object.getPrototypeOf(sshFs)
    const keys = Object.getOwnPropertyNames(proto)
    for (const method of keys) {
      if (method === 'constructor') {
        continue
      }
      if (typeof sshFs[method] === 'function') {
        this[method] = sshFs[method].bind(sshFs)
      }
    }
  }

  initSshFsFallback = (conn) => {
    const { SshFs } = require('ssh2-scp')
    const opts = {}
    const encode = this.initOptions?.encode || 'utf8'
    if (encode !== 'utf8') {
      opts.encoding = encode
      opts.iconv = require('iconv-lite')
    }
    const sshFs = new SshFs(conn, opts)
    this.applySshFsOverride(sshFs)
  }

  async remoteInitSftp (initOptions) {
    this.initOptions = initOptions
    this.transfers = {}
    const terminalInst = globalState.getSession(initOptions.terminalId)
    const {
      conn
    } = terminalInst
    this.client = conn
    // 2026-09-08 coder(lq): Inherit capability from the authenticated terminal; omitted means enabled, but a file request cannot override a disabled terminal.
    this.enableSsh = terminalInst.initOptions?.enableSsh !== false && initOptions.enableSsh !== false
    try {
      const sftp = await new Promise((resolve, reject) => {
        conn.sftp((err, sftp) => {
          if (err) {
            return reject(err)
          }
          resolve(sftp)
        })
      })
      this.sftp = sftp
    } catch (err) {
      this.initSshFsFallback(conn)
    }

    globalState.setSession(this.pid, this)
    return 'ok'
  }

  kill () {
    const keys = Object.keys(this.transfers || {})
    for (const k of keys) {
      const jj = this.transfers[k]
      jj && jj.destroy && jj.destroy()
      delete this.transfers[k]
    }
    this.sftp && this.sftp.end && this.sftp.end()
    delete this.sftp
    delete this.initOptions
    this.onEndConn()
  }

  escapePosixPath = (value) => {
    return `"${String(value).replace(/["\\$`]/g, '\\$&')}"`
  }

  escapePowerShellPath = (value) => {
    return `'${String(value).replace(/'/g, "''")}'`
  }

  normalizeWindowsExecPath = (value) => {
    return String(value).replace(/^\/([a-zA-Z]:)/, '$1')
  }

  buildPowerShellCommand = (script) => {
    return `powershell.exe -NoLogo -NonInteractive -NoProfile -Command "${script}"`
  }

  execBuffered (cmd) {
    return new Promise((resolve, reject) => {
      if (!this.enableSsh) {
        return reject(new Error('当前会话只有 SFTP 文件能力，不能执行终端命令。请切换到 SSH 终端后再试。'))
      }
      const { client } = this
      client.exec(cmd, this.getExecOpts(), (err, stream) => {
        if (err) {
          return reject(err)
        }
        let stdout = Buffer.from('')
        let stderr = Buffer.from('')
        let settled = false
        const settle = (result) => {
          if (settled) {
            return
          }
          settled = true
          resolve(result)
        }
        stream.on('close', (code) => {
          settle({
            code,
            stdout: stdout.toString(),
            stderr: stderr.toString()
          })
        }).on('end', () => {
          settle({
            code: 0,
            stdout: stdout.toString(),
            stderr: stderr.toString()
          })
        }).on('data', (data) => {
          stdout = Buffer.concat([stdout, data])
        })
        stream.stderr.on('data', (data) => {
          stderr = Buffer.concat([stderr, data])
        })
      })
    })
  }

  async getRemoteExecPlatform () {
    if (this.remoteExecPlatform) {
      return this.remoteExecPlatform
    }
    if (!this.remoteExecPlatformPromise) {
      this.remoteExecPlatformPromise = this.execBuffered('cmd.exe /d /s /c ver')
        .then(({ code, stdout, stderr }) => {
          const output = `${stdout}\n${stderr}`.toLowerCase()
          return code === 0 && output.includes('windows')
            ? 'windows'
            : 'posix'
        })
        .catch(() => 'posix')
        .then((platform) => {
          this.remoteExecPlatform = platform
          return platform
        })
    }
    return this.remoteExecPlatformPromise
  }

  async buildRemoteCommand (type, ...paths) {
    const platform = await this.getRemoteExecPlatform()
    if (platform === 'windows') {
      const args = paths
        .map(this.normalizeWindowsExecPath)
        .map(this.escapePowerShellPath)
      if (type === 'rmrf') {
        return this.buildPowerShellCommand(`Remove-Item -LiteralPath ${args[0]} -Force -Recurse`)
      }
      if (type === 'cp') {
        return this.buildPowerShellCommand(`Copy-Item -LiteralPath ${args[0]} -Destination ${args[1]} -Recurse -Force`)
      }
      if (type === 'mv') {
        return this.buildPowerShellCommand(`Move-Item -LiteralPath ${args[0]} -Destination ${args[1]} -Force`)
      }
      if (type === 'folder-size') {
        return this.buildPowerShellCommand(`Get-ChildItem -LiteralPath ${args[0]} -Recurse -File | Measure-Object -Property Length -Sum`)
      }
      if (type === 'extract') {
        const archive = args[0]
        const target = args[1]
        // 2026-09-03 coder(lq): Keep each extraction isolated and suffix collisions instead of overwriting existing folders.
        return this.buildPowerShellCommand(`$archive=${archive}; $base=${target}; $target=$base; $suffix=1; while (Test-Path -LiteralPath $target) { $target=$base+$suffix; $suffix++ }; New-Item -ItemType Directory -Path $target -Force | Out-Null; if ($archive -match '(?i)\\.zip$') { Expand-Archive -LiteralPath $archive -DestinationPath $target -Force; exit $LASTEXITCODE }; if (Get-Command tar.exe -ErrorAction SilentlyContinue) { tar.exe -xf $archive -C $target; exit $LASTEXITCODE }; throw 'No supported archive extractor found (Expand-Archive or tar.exe)'`)
      }
    }
    const posixArgs = paths.map(this.escapePosixPath)
    if (type === 'rmrf') {
      return `rm -rf ${posixArgs[0]}`
    }
    if (type === 'cp') {
      return `cp -r ${posixArgs[0]} ${posixArgs[1]}`
    }
    if (type === 'mv') {
      return `mv ${posixArgs[0]} ${posixArgs[1]}`
    }
    if (type === 'folder-size') {
      return buildPosixFolderSizeCommand(posixArgs[0])
    }
    if (type === 'extract') {
      const archive = posixArgs[0]
      const target = posixArgs[1]
      // 2026-09-03 coder(lq): Keep each extraction isolated and suffix collisions instead of overwriting existing folders.
      return `archive=${archive}; base=${target}; target=$base; suffix=1; while [ -e "$target" ]; do target="\${base}$suffix"; suffix=$((suffix + 1)); done; mkdir -p "$target"; archive_lower=$(printf '%s' "$archive" | tr '[:upper:]' '[:lower:]'); case "$archive_lower" in *.zip)
  if command -v unzip >/dev/null 2>&1; then unzip -oq "$archive" -d "$target" >/dev/null 2>&1
  elif command -v bsdtar >/dev/null 2>&1; then bsdtar -xf "$archive" -C "$target" >/dev/null 2>&1
  else printf '%s\\n' 'No supported archive extractor found (unzip or bsdtar)' >&2; exit 127; fi ;;
*.7z)
  if command -v 7z >/dev/null 2>&1; then 7z x -y "$archive" -o"$target" >/dev/null 2>&1
  elif command -v 7zz >/dev/null 2>&1; then 7zz x -y "$archive" -o"$target" >/dev/null 2>&1
  else printf '%s\\n' 'No supported archive extractor found (7z or 7zz)' >&2; exit 127; fi ;;
*.rar)
  if command -v unrar >/dev/null 2>&1; then unrar x -o+ "$archive" "$target/" >/dev/null 2>&1
  elif command -v 7z >/dev/null 2>&1; then 7z x -y "$archive" -o"$target" >/dev/null 2>&1
  elif command -v 7zz >/dev/null 2>&1; then 7zz x -y "$archive" -o"$target" >/dev/null 2>&1
  else printf '%s\\n' 'No supported archive extractor found (unrar or 7z)' >&2; exit 127; fi ;;
*)
  if command -v tar >/dev/null 2>&1; then tar -xf "$archive" -C "$target" >/dev/null 2>&1
  elif command -v bsdtar >/dev/null 2>&1; then bsdtar -xf "$archive" -C "$target" >/dev/null 2>&1
  else printf '%s\\n' 'No supported archive extractor found (tar or bsdtar)' >&2; exit 127; fi ;;
esac`
    }
    throw new Error(`unsupported remote command type: ${type}`)
  }

  /**
   * getHomeDir
   *
   * https://github.com/mscdex/ssh2/blob/master/SFTP.md
   * only support linux / mac
   * @return {Promise}
   */
  getHomeDir () {
    // return this.runCmd('eval echo "~$different_user"')
    // ext_home_dir
    return this.realpath('')
  }

  // getSftpHomeDir () {
  //   // return this.runCmd('eval echo "~$different_user"')
  //   // ext_home_dir
  //   return new Promise((resolve, reject) => {
  //     this.sftp.ext_home_dir('', (err, path) => {
  //       if (err) {
  //         return reject(err)
  //       }
  //       resolve(path)
  //     })
  //   })
  // }

  /**
   * rmdir
   *
   * @param {String} remotePath
   * https://github.com/mscdex/ssh2/blob/master/SFTP.md
   * only support rm -rf
   * @return {Promise}
   */
  rmdir (remotePath) {
    return this.rmrf(remotePath)
      .then(r => {
        return r
      })
      .catch(err => {
        console.error('rm -rf dir error', err)
        return this.removeDirectoryRecursively(remotePath)
      })
  }

  rmrf (remotePath) {
    return this.buildRemoteCommand('rmrf', remotePath)
      .then(cmd => this.runExec(cmd))
    // return new Promise((resolve, reject) => {
    //   const { client } = this
    //   const cmd = `rm -rf "${remotePath}"`
    //   this.runExec(cmd, this.getExecOpts(), (err, stream) => {
    //     if (err) {
    //       return reject(err)
    //     } else {
    //       console.log('rm -rf done', stream)
    //       resolve(1)
    //     }
    //   })
    // })
  }

  async removeDirectoryRecursively (remotePath) {
    const contents = await this.list(remotePath)
    for (const item of contents) {
      const itemPath = `${remotePath}/${item.name}`
      if (item.type === 'd') {
        // Recursively delete subdirectories
        await this.removeDirectoryRecursively(itemPath)
      } else {
        // Delete files
        await this.rm(itemPath)
      }
    }
    // Finally, remove the directory itself
    await this.rmFolder(remotePath)
  }

  /**
   * touch a file
   *
   * @param {String} remotePath
   * https://github.com/mscdex/ssh2/blob/master/SFTP.md
   * @return {Promise}
   */
  touch (remotePath) {
    // if (this.enableSsh) {
    //   return new Promise((resolve, reject) => {
    //     const { client } = this
    //     const cmd = `touch "${remotePath}"`
    //     client.exec(cmd, this.getExecOpts(), err => {
    //       if (err) reject(err)
    //       else resolve(1)
    //     })
    //   })
    // }
    return this.touchFile(remotePath)
  }

  openFile = (remotePath) => {
    return new Promise((resolve, reject) => {
      this.sftp.open(remotePath, 'w', (err, fd) => {
        if (err) {
          return reject(err)
        }
        resolve(fd)
      })
    })
  }

  closeFile = (fd) => {
    return new Promise((resolve, reject) => {
      this.sftp.close(fd, err => {
        if (err) {
          return reject(err)
        }
        resolve(true)
      })
    })
  }

  touchFile = (remotePath) => {
    return this.openFile(remotePath)
      .then(this.closeFile)
  }

  /**
   * cp
   *
   * @param {String} from
   * @param {String} to
   * https://github.com/mscdex/ssh2/blob/master/SFTP.md
   * @return {Promise}
   */
  cp (from, to) {
    if (!this.enableSsh) {
      return this.copyWithSftp(from, to)
    }
    return this.buildRemoteCommand('cp', from, to)
      .then(cmd => this.runExec(cmd))
      .then(() => 1)
  }

  async copyWithSftp (from, to) {
    const sftp = this.sftp
    const call = (method, ...args) => promisify(sftp[method].bind(sftp))(...args)
    const source = await call('lstat', from)
    // 2026-09-08 coder(lq): Resolve the destination parent before recursion so aliases cannot copy a directory into itself.
    if (source.isDirectory()) {
      const sourcePath = remotePath.normalize(await call('realpath', from))
      const parent = await call('realpath', remotePath.dirname(to))
      const targetPath = remotePath.join(parent, remotePath.basename(to))
      if (targetPath === sourcePath || targetPath.startsWith(sourcePath.replace(/\/$/, '') + '/')) {
        throw new Error('不能将文件夹复制到自身或其子目录')
      }
    }
    const copyEntry = async (sourcePath, targetPath, stat) => {
      if (stat.isSymbolicLink()) {
        await call('symlink', await call('readlink', sourcePath), targetPath)
      } else if (stat.isDirectory()) {
        await call('mkdir', targetPath, { mode: 0o700 })
        const entries = await call('readdir', sourcePath)
        for (const { filename } of entries) {
          if (filename === '.' || filename === '..') continue
          if (!filename || /[/\\]/.test(filename)) throw new Error('服务器返回了无效的文件名')
          const child = remotePath.join(sourcePath, filename)
          await copyEntry(child, remotePath.join(targetPath, filename), await call('lstat', child))
        }
        await call('chmod', targetPath, stat.mode & 0o777)
      } else if (stat.isFile()) {
        // 2026-09-08 coder(lq): Stream through SFTP with bounded memory; exclusive creation protects existing files and symlinks from overwrite races.
        await pipeline(
          sftp.createReadStream(sourcePath),
          sftp.createWriteStream(targetPath, { flags: 'wx', mode: stat.mode & 0o777 })
        )
      } else {
        throw new Error('不支持复制此特殊文件类型')
      }
    }
    await copyEntry(from, to, source)
    return 1
  }

  extractArchive (from, to) {
    return this.buildRemoteCommand('extract', from, to)
      .then(cmd => this.runExec(cmd))
      .then(() => 1)
  }

  /**
   * mv
   *
   * @param {String} from
   * @param {String} to
   * https://github.com/mscdex/ssh2/blob/master/SFTP.md
   * @return {Promise}
   */
  mv (from, to) {
    return this.buildRemoteCommand('mv', from, to)
      .then(cmd => this.runExec(cmd))
      .then(() => 1)
  }

  runExec (cmd) {
    return this.execBuffered(cmd)
      .then(({ code, stdout, stderr }) => {
        if (stderr) {
          throw new Error(stderr.trim())
        }
        if (typeof code === 'number' && code !== 0) {
          throw new Error(stdout.trim() || `Command exited with code ${code}`)
        }
        return stdout
      })
  }

  async getFolderSize (folderPath) {
    const platform = await this.getRemoteExecPlatform()
    const cmd = await this.buildRemoteCommand('folder-size', folderPath)
    const output = await this.runExec(cmd)
    return platform === 'windows'
      ? getSizeCountWin(output)
      : getSizeCount(output)
  }

  /**
   * list remote directory
   *
   * @param {String} remotePath
   * @return {Promise} list
   */
  list (remotePath) {
    return new Promise((resolve, reject) => {
      const { sftp } = this
      const reg = /-/g

      sftp.readdir(remotePath, (err, list) => {
        if (err) {
          return reject(err)
        }
        resolve(list.map(item => {
          const {
            filename,
            longname,
            attrs: {
              size, mtime, atime, uid, gid, mode
            }
          } = item
          // from https://github.com/jyu213/ssh2-sftp-client/blob/master/src/index.js
          return {
            type: longname.substr(0, 1),
            name: filename,
            size,
            modifyTime: mtime * 1000,
            accessTime: atime * 1000,
            mode,
            rights: {
              user: longname.substr(1, 3).replace(reg, ''),
              group: longname.substr(4, 3).replace(reg, ''),
              other: longname.substr(7, 3).replace(reg, '')
            },
            owner: uid,
            group: gid
          }
        }))
      })
    })
  }

  /**
   * mkdir
   *
   * @param {String} remotePath
   * @param {Object} attributes
   * An object with the following valid properties:

      mode - integer - Mode/permissions for the resource.
      uid - integer - User ID of the resource.
      gid - integer - Group ID of the resource.
      size - integer - Resource size in bytes.
      atime - integer - UNIX timestamp of the access time of the resource.
      mtime - integer - UNIX timestamp of the modified time of the resource.

      When supplying an ATTRS object to one of the SFTP methods:
      atime and mtime can be either a Date instance or a UNIX timestamp.
      mode can either be an integer or a string containing an octal number.
   * https://github.com/mscdex/ssh2/blob/master/SFTP.md
   * @return {Promise}
   */
  mkdir (remotePath, options = {}) {
    return new Promise((resolve, reject) => {
      const { sftp } = this
      sftp.mkdir(remotePath, options, err => {
        if (err) reject(err)
        else resolve(1)
      })
    })
  }

  /**
   * stat
   *
   * @param {String} remotePath
   * https://github.com/mscdex/ssh2/blob/master/SFTP.md
   * @return {Promise} stat
   *  stats.isDirectory()
      stats.isFile()
      stats.isBlockDevice()
      stats.isCharacterDevice()
      stats.isSymbolicLink()
      stats.isFIFO()
      stats.isSocket()
   */
  stat (remotePath) {
    return new Promise((resolve, reject) => {
      const { sftp } = this
      sftp.stat(remotePath, (err, stat) => {
        if (err) reject(err)
        else {
          resolve(
            Object.assign(stat, {
              isDirectory: stat.isDirectory()
            })
          )
        }
      })
    })
  }

  /**
   * readlink
   *
   * @param {String} remotePath
   * https://github.com/mscdex/ssh2/blob/master/SFTP.md
   * @return {Promise} target
   */
  readlink (remotePath) {
    return new Promise((resolve, reject) => {
      const { sftp } = this
      sftp.readlink(remotePath, (err, target) => {
        if (err) reject(err)
        else resolve(target)
      })
    })
  }

  /**
   * realpath
   *
   * @param {String} remotePath
   * https://github.com/mscdex/ssh2/blob/master/SFTP.md
   * @return {Promise} target
   */
  realpath (remotePath) {
    return new Promise((resolve, reject) => {
      const { sftp } = this
      sftp.realpath(remotePath, (err, target) => {
        if (err) reject(err)
        else resolve(target)
      })
    })
  }

  /**
   * lstat
   *
   * @param {String} remotePath
   * https://github.com/mscdex/ssh2/blob/master/SFTP.md
   * @return {Promise} stat
   *  stats.isDirectory()
      stats.isFile()
      stats.isBlockDevice()
      stats.isCharacterDevice()
      stats.isSymbolicLink()
      stats.isFIFO()
      stats.isSocket()
   */
  lstat (remotePath) {
    return new Promise((resolve, reject) => {
      const { sftp } = this
      sftp.lstat(remotePath, (err, stat) => {
        if (err) reject(err)
        else resolve(stat)
      })
    })
  }

  /**
   * chmod
   *
   * @param {String} remotePath
   * https://github.com/mscdex/ssh2/blob/master/SFTP.md
   * @return {Promise}
   */
  chmod (remotePath, mode) {
    return new Promise((resolve, reject) => {
      const { sftp } = this
      sftp.chmod(remotePath, mode, (err) => {
        if (err) reject(err)
        else resolve(1)
      })
    })
  }

  /**
   * rename
   *
   * @param {String} remotePath
   * @param {String} remotePathNew
   * https://github.com/mscdex/ssh2/blob/master/SFTP.md
   * @return {Promise}
   */
  rename (remotePath, remotePathNew) {
    return new Promise((resolve, reject) => {
      const { sftp } = this
      sftp.rename(remotePath, remotePathNew, (err) => {
        if (err) reject(err)
        else resolve(1)
      })
    })
  }

  /**
   * rm delete single file
   *
   * @param {String} remotePath
   * https://github.com/mscdex/ssh2/blob/master/SFTP.md
   * @return {Promise}
   */
  rmFolder (remotePath) {
    return new Promise((resolve, reject) => {
      const { sftp } = this
      sftp.rmdir(remotePath, (err) => {
        if (err) reject(err)
        else resolve(1)
      })
    })
  }

  /**
   * rm delete single file
   *
   * @param {String} remotePath
   * https://github.com/mscdex/ssh2/blob/master/SFTP.md
   * @return {Promise}
   */
  rm (remotePath) {
    return new Promise((resolve, reject) => {
      const { sftp } = this
      sftp.unlink(remotePath, (err) => {
        if (err) reject(err)
        else resolve(1)
      })
    })
  }

  /**
   * readFile single file
   *
   * @param {String} remotePath
   * https://github.com/mscdex/ssh2/blob/master/SFTP.md
   * @return {Promise}
   */
  readFile (remotePath) {
    return readRemoteFile(this.sftp, remotePath)
  }

  /**
   * writeFile single file
   *
   * @param {String} remotePath
   * https://github.com/mscdex/ssh2/blob/master/SFTP.md
   * @return {Promise}
   */
  writeFile (remotePath, str, mode) {
    return writeRemoteFile(this.sftp, remotePath, str, mode)
  }
  // end
}

exports.Sftp = commonExtends(Sftp)
