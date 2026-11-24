import { readdir, readFile, rm, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'

const PACKAGE_ID = 'dsh-archive-cleanup'
const NAMESPACE = 'archiveCleanup'
const CACHE_SEGMENTS = ['storages', 'session_projcache', 'sessions']

const codec = (name, parse) => ({
  mode: 'strict',
  typeSymbol: `${PACKAGE_ID}#${name}`,
  create: () => ({ parse }),
})

const jsonResult = codec('ArchiveCleanupResult', (value) => value)

const sessionIdList = codec('SessionIdList', (value) => {
  if (!Array.isArray(value)) throw new Error('Expected a list of session ids')
  const ids = []
  for (const entry of value) {
    if (typeof entry !== 'string' || entry.length === 0) throw new Error('Session ids must be non-empty strings')
    if (!ids.includes(entry)) ids.push(entry)
  }
  if (ids.length > 500) throw new Error('Too many session ids in one request')
  return ids
})

const DESCRIPTORS = Object.freeze([
  {
    id: `${PACKAGE_ID}#${NAMESPACE}/listArchived`,
    service: NAMESPACE,
    namespace: NAMESPACE,
    method: 'listArchived',
    invocation: { kind: 'direct' },
    result: jsonResult,
    parameters: [],
  },
  {
    id: `${PACKAGE_ID}#${NAMESPACE}/purgeArchived`,
    service: NAMESPACE,
    namespace: NAMESPACE,
    method: 'purgeArchived',
    invocation: { kind: 'direct' },
    result: jsonResult,
    parameters: [{ name: 'ids', wire: 'ids', source: 'json', codec: sessionIdList }],
  },
])

function messageOf(error) {
  if (error instanceof Error) return error.message
  return String(error)
}

function asTime(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

class ArchiveCleanupHost {
  constructor(ctx) {
    this.ctx = ctx
    this.registry = ctx.workspaceRegistry
    this.persistence = ctx.sessionPersistence
    this._home = undefined
    this._root = undefined
  }

  typertRemote = Object.freeze({ service: this, serviceKey: NAMESPACE, namespace: NAMESPACE })

  /** DSH home directory; the session logs and projection caches live below it. */
  homeDir() {
    if (this._home !== undefined) return this._home
    const fromEnv = typeof process.env.DSH_HOME === 'string' ? process.env.DSH_HOME.trim() : ''
    this._home = fromEnv ? resolve(fromEnv) : join(homedir(), '.dsh')
    return this._home
  }

  /** Root of all session logs; normally `<DSH_HOME>/sessions`. */
  sessionsRoot() {
    return this._root ?? join(this.homeDir(), 'sessions')
  }

  cacheFile(id) {
    return join(this.homeDir(), ...CACHE_SEGMENTS, `${id}.json`)
  }

  archivedIds() {
    const raw = this.registry?.archivedSessionIds
    const list = Array.isArray(raw) ? raw : []
    return [...new Set(list.map(String))]
  }

  async workspaces() {
    try {
      const list = await this.registry?.list?.()
      return Array.isArray(list) ? list : []
    } catch {
      return []
    }
  }

  async snapshot(id) {
    if (typeof this.persistence?.stat !== 'function') return undefined
    try {
      return await this.persistence.stat(id)
    } catch {
      return undefined
    }
  }

  /** Session title from the projection cache; the durable log is not decoded here. */
  async titleOf(id) {
    try {
      const parsed = JSON.parse(await readFile(this.cacheFile(id), 'utf8'))
      const title = parsed?.record?.rows?.title?.val
      if (typeof title === 'string' && title.trim()) return title.trim()
    } catch {
      /* missing or unreadable cache: fall through */
    }
    return ''
  }

  async readCacheRecord(id) {
    try {
      return JSON.parse(await readFile(this.cacheFile(id), 'utf8'))
    } catch {
      return undefined
    }
  }

  /**
   * Directories that hold this session's log. The persistence handle reports the
   * exact path; the directory scan is a fallback for handles without `locate`
   * (each project directory holds one sub-directory per session id).
   */
  async sessionDirs(id) {
    const snapshot = await this.snapshot(id)
    const header = snapshot?.header
    if (header && typeof this.persistence?.locate === 'function') {
      try {
        const located = await this.persistence.locate(header)
        const path = typeof located?.path === 'string' ? located.path : undefined
        if (path) {
          const dir = dirname(path)
          if (basename(dir) === id) {
            this._root = dirname(dir)
            if (basename(this._root) === 'sessions') this._home = dirname(this._root)
            return [dir]
          }
        }
      } catch {
        /* fall back to the directory scan */
      }
    }
    const root = this.sessionsRoot()
    const dirs = []
    let projects = []
    try {
      projects = await readdir(root, { withFileTypes: true })
    } catch {
      return dirs
    }
    for (const project of projects) {
      if (!project.isDirectory()) continue
      const candidate = join(root, project.name, id)
      try {
        const info = await stat(candidate)
        if (info.isDirectory()) dirs.push(candidate)
      } catch {
        /* not here */
      }
    }
    return dirs
  }

  async dirSize(dir) {
    let total = 0
    let entries = []
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return 0
    }
    for (const entry of entries) {
      const child = join(dir, entry.name)
      if (entry.isDirectory()) {
        total += await this.dirSize(child)
        continue
      }
      try {
        total += (await stat(child)).size
      } catch {
        /* raced with another writer */
      }
    }
    return total
  }

  async describe(id) {
    const snapshot = await this.snapshot(id)
    const header = snapshot?.header ?? {}
    const cache = await this.readCacheRecord(id)
    const dirs = await this.sessionDirs(id)
    let sizeBytes = typeof snapshot?.sizeBytes === 'number' ? snapshot.sizeBytes : 0
    if (!sizeBytes && dirs.length > 0) {
      for (const dir of dirs) sizeBytes += await this.dirSize(dir)
    }
    const title = await this.titleOf(id)
    const createdAt = asTime(header.createdAt) || asTime(cache?.record?.identity?.createdAt)
    const cwd =
      typeof header.cwd === 'string' && header.cwd
        ? header.cwd
        : typeof cache?.record?.identity?.cwd === 'string'
          ? cache.record.identity.cwd
          : ''
    const workspaces = []
    for (const workspace of await this.workspaces()) {
      const ids = Array.isArray(workspace?.sessionIds) ? workspace.sessionIds.map(String) : []
      if (!ids.includes(id)) continue
      const title2 = typeof workspace.title === 'string' && workspace.title ? workspace.title : ''
      workspaces.push({ id: String(workspace.id), title: title2 || String(workspace.path ?? workspace.id) })
    }
    return {
      id,
      title,
      cwd,
      createdAt,
      sizeBytes,
      hasLog: dirs.length > 0,
      workspaces,
    }
  }

  async listArchived() {
    const ids = this.archivedIds()
    const sessions = []
    let totalBytes = 0
    for (const id of ids) {
      const row = await this.describe(id)
      totalBytes += row.sizeBytes
      sessions.push(row)
    }
    sessions.sort((left, right) => right.createdAt - left.createdAt)
    return { sessions, totalBytes, archivedCount: ids.length }
  }

  async removeOne(id) {
    const snapshot = await this.snapshot(id)
    const dirs = await this.sessionDirs(id)
    let sizeBytes = typeof snapshot?.sizeBytes === 'number' ? snapshot.sizeBytes : 0
    if (!sizeBytes && dirs.length > 0) {
      for (const dir of dirs) sizeBytes += await this.dirSize(dir)
    }
    for (const dir of dirs) await rm(dir, { recursive: true, force: true })
    await rm(this.cacheFile(id), { force: true })
    const warnings = []
    try {
      await this.registry.unarchiveSession(id)
    } catch (error) {
      warnings.push({ id, code: 'unarchive-failed', message: messageOf(error) })
    }
    for (const workspace of await this.workspaces()) {
      const ids = Array.isArray(workspace?.sessionIds) ? workspace.sessionIds.map(String) : []
      if (!ids.includes(id)) continue
      try {
        await workspace.detachSession(id)
      } catch (error) {
        warnings.push({ id, code: 'detach-failed', workspace: String(workspace.id), message: messageOf(error) })
      }
    }
    return { id, sizeBytes, removedLogs: dirs.length, warnings }
  }

  async purgeArchived(rawIds) {
    const archived = new Set(this.archivedIds())
    const running = typeof process.env.DSH_SESSION_ID === 'string' ? process.env.DSH_SESSION_ID : ''
    const removed = []
    const failed = []
    const warnings = []
    let freedBytes = 0
    for (const id of rawIds) {
      if (!archived.has(id)) {
        failed.push({ id, code: 'not-archived', message: `${id} is not an archived session` })
        continue
      }
      if (running && running === id) {
        failed.push({ id, code: 'session-active', message: 'refusing to delete the session that is running this request' })
        continue
      }
      try {
        const result = await this.removeOne(id)
        warnings.push(...result.warnings)
        freedBytes += result.sizeBytes
        removed.push({ id, sizeBytes: result.sizeBytes, removedLogs: result.removedLogs })
      } catch (error) {
        failed.push({ id, code: 'delete-failed', message: messageOf(error) })
      }
    }
    return { removed, failed, warnings, freedBytes, remaining: this.archivedIds() }
  }
}

export const name = 'archive-cleanup'
export const inject = ['workspaceRegistry', 'sessionPersistence', 'typert']

export function apply(ctx) {
  const service = new ArchiveCleanupHost(ctx)
  ctx.provide(NAMESPACE, service)
  ctx.typert.register({
    package: PACKAGE_ID,
    face: 'host',
    schemas: [],
    model: { services: [], events: [], objects: [] },
    invocations: DESCRIPTORS,
  })
}
