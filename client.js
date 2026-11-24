window.__ModuleLoader__.load({
  id: 'dsh-archive-cleanup',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useCallback, useEffect, useMemo, useRef, useState } = React

    const PACKAGE_ID = 'dsh-archive-cleanup'
    const NAMESPACE = 'archiveCleanup'
    const NS = 'dshArchiveCleanup'

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
      return ids
    })

    const REMOTE = Object.freeze({
      package: PACKAGE_ID,
      descriptors: Object.freeze([
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
      ]),
    })

    const en = {
      nav: 'Archived sessions',
      title: 'Archived sessions',
      subtitle:
        'Archived sessions are hidden from the sidebar but still take disk space. Deleting them here removes the session log and its projection cache for good.',
      count: '{count} archived',
      totalSize: '{size} on disk',
      selectAll: 'Select all',
      refresh: 'Refresh',
      deleteSelected: 'Delete selected',
      selectedCount: '{count} selected',
      deleting: 'Deleting\u2026',
      confirmTitle: 'Permanently delete {count} session(s)?',
      confirmBody:
        'The session log, projection cache and archive entry will be removed. This cannot be undone.',
      confirm: 'Delete permanently',
      cancel: 'Cancel',
      loading: 'Loading archived sessions\u2026',
      empty: 'No archived sessions.',
      emptyHint: 'Sessions you archive from the sidebar will show up here.',
      missingLog: 'Log already gone',
      titleMissing: '(untitled)',
      noWorkspace: 'No workspace',
      unknownTime: 'Unknown time',
      removedOk: 'Deleted {count} session(s), freed {size}.',
      removedPartial: 'Deleted {count} session(s), {failed} failed. Freed {size}.',
      deleteFailed: 'Delete failed: {message}',
      loadFailed: 'Could not load archived sessions: {message}',
      warnNotice: 'Some cleanup steps failed: {detail}',
      notArchived: 'no longer archived',
      sessionActive: 'session is running',
      deleteFailedReason: 'delete failed',
    }

    const zh = {
      nav: '归档会话清理',
      title: '归档会话清理',
      subtitle:
        '归档会话在侧边栏不可见，但仍占用磁盘空间。在这里删除会同时移除会话日志与投影缓存，且无法恢复。',
      count: '共 {count} 个归档会话',
      totalSize: '占用 {size}',
      selectAll: '全选',
      refresh: '刷新',
      deleteSelected: '删除所选',
      selectedCount: '已选 {count} 个',
      deleting: '正在删除\u2026',
      confirmTitle: '永久删除 {count} 个会话？',
      confirmBody: '会话日志、投影缓存与归档记录都会被移除，此操作无法撤销。',
      confirm: '永久删除',
      cancel: '取消',
      loading: '正在读取归档会话\u2026',
      empty: '没有归档会话。',
      emptyHint: '从侧边栏归档的会话会出现在这里。',
      missingLog: '日志已丢失',
      titleMissing: '（无标题）',
      noWorkspace: '未关联工作区',
      unknownTime: '未知时间',
      removedOk: '已删除 {count} 个会话，释放 {size}。',
      removedPartial: '已删除 {count} 个会话，{failed} 个失败，释放 {size}。',
      deleteFailed: '删除失败：{message}',
      loadFailed: '读取归档会话失败：{message}',
      warnNotice: '部分清理步骤失败：{detail}',
      notArchived: '已不在归档列表',
      sessionActive: '该会话正在运行',
      deleteFailedReason: '删除失败',
    }

    function messageOf(error) {
      if (error instanceof Error) return error.message
      if (error && typeof error === 'object' && typeof error.message === 'string') return error.message
      return String(error)
    }

    function formatBytes(bytes) {
      const value = Number(bytes)
      if (!Number.isFinite(value) || value <= 0) return '0 B'
      if (value < 1024) return `${Math.round(value)} B`
      const units = ['KB', 'MB', 'GB', 'TB', 'PB']
      let size = value / 1024
      let unit = 0
      while (size >= 1024 && unit < units.length - 1) {
        size /= 1024
        unit += 1
      }
      const rounded = size >= 100 ? Math.round(size) : Math.round(size * 10) / 10
      return `${rounded} ${units[unit]}`
    }

    function formatDate(milliseconds) {
      const date = new Date(milliseconds)
      if (Number.isNaN(date.getTime())) return ''
      try {
        return date.toLocaleString(undefined, {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        })
      } catch {
        return date.toLocaleString()
      }
    }

    const styles = {
      page: {
        display: 'grid',
        gap: '14px',
        maxWidth: '54rem',
        color: 'var(--dsw-alias-label-primary)',
        fontSize: '14px',
      },
      header: { display: 'grid', gap: '6px' },
      title: { margin: 0, fontSize: '1.05rem', fontWeight: 600 },
      subtitle: {
        margin: 0,
        lineHeight: 1.55,
        color: 'var(--dsw-alias-label-secondary)',
        maxWidth: '72ch',
      },
      toolbar: {
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '10px',
        padding: '10px 12px',
        border: '1px solid var(--dsw-alias-border-l1)',
        borderRadius: '12px',
        background: 'var(--dsw-alias-bg-layer-1)',
      },
      summary: { display: 'flex', flexWrap: 'wrap', gap: '6px', color: 'var(--dsw-alias-label-secondary)' },
      summaryStrong: { color: 'var(--dsw-alias-label-primary)', fontWeight: 600 },
      spacer: { flex: '1 1 auto' },
      checkboxLabel: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '7px',
        cursor: 'pointer',
        color: 'var(--dsw-alias-label-secondary)',
      },
      checkbox: { width: '15px', height: '15px', margin: 0, accentColor: 'var(--dsw-alias-brand-primary)' },
      button: {
        font: 'inherit',
        color: 'inherit',
        background: 'transparent',
        border: '1px solid var(--dsw-alias-border-l2)',
        borderRadius: '9px',
        padding: '6px 12px',
        cursor: 'pointer',
        minHeight: '32px',
      },
      buttonDanger: {
        font: 'inherit',
        color: '#fff',
        background: 'var(--dsw-alias-state-error-primary)',
        border: '1px solid transparent',
        borderRadius: '9px',
        padding: '6px 12px',
        cursor: 'pointer',
        minHeight: '32px',
        fontWeight: 600,
      },
      buttonDisabled: {
        font: 'inherit',
        color: 'var(--dsw-alias-label-secondary)',
        background: 'transparent',
        border: '1px solid var(--dsw-alias-border-l1)',
        borderRadius: '9px',
        padding: '6px 12px',
        minHeight: '32px',
        cursor: 'not-allowed',
        opacity: 0.6,
      },
      confirm: {
        display: 'grid',
        gap: '10px',
        border: '1px solid var(--dsw-alias-state-error-primary)',
        borderRadius: '12px',
        padding: '14px 16px',
        background: 'var(--dsw-alias-bg-layer-1)',
      },
      confirmTitle: { margin: 0, fontWeight: 600 },
      confirmBody: {
        margin: 0,
        lineHeight: 1.55,
        color: 'var(--dsw-alias-label-secondary)',
        maxWidth: '64ch',
      },
      rowActions: { display: 'flex', flexWrap: 'wrap', gap: '8px' },
      notice: {
        margin: 0,
        padding: '9px 12px',
        borderRadius: '10px',
        background: 'var(--dsw-alias-bg-layer-2)',
        color: 'var(--dsw-alias-label-secondary)',
        lineHeight: 1.5,
        overflowWrap: 'anywhere',
      },
      noticeError: {
        margin: 0,
        padding: '9px 12px',
        borderRadius: '10px',
        border: '1px solid var(--dsw-alias-state-error-primary)',
        color: 'var(--dsw-alias-state-error-primary)',
        background: 'var(--dsw-alias-bg-layer-1)',
        lineHeight: 1.5,
        overflowWrap: 'anywhere',
      },
      list: {
        border: '1px solid var(--dsw-alias-border-l1)',
        borderRadius: '12px',
        overflow: 'hidden',
        background: 'var(--dsw-alias-bg-layer-1)',
      },
      row: {
        display: 'flex',
        alignItems: 'flex-start',
        gap: '10px',
        padding: '11px 14px',
        borderTop: '1px solid var(--dsw-alias-border-l1)',
      },
      rowFirst: {
        display: 'flex',
        alignItems: 'flex-start',
        gap: '10px',
        padding: '11px 14px',
      },
      rowBody: { display: 'grid', gap: '5px', minWidth: 0 },
      rowTitleLine: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' },
      rowTitle: { fontWeight: 600, overflowWrap: 'anywhere' },
      chip: {
        fontSize: '11px',
        lineHeight: 1.6,
        padding: '0 8px',
        borderRadius: '999px',
        border: '1px solid var(--dsw-alias-border-l1)',
        color: 'var(--dsw-alias-label-secondary)',
      },
      warnChip: {
        fontSize: '11px',
        lineHeight: 1.6,
        padding: '0 8px',
        borderRadius: '999px',
        border: '1px solid var(--dsw-alias-state-warn-primary)',
        color: 'var(--dsw-alias-state-warn-primary)',
      },
      meta: {
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '8px',
        fontSize: '12px',
        color: 'var(--dsw-alias-label-secondary)',
        overflowWrap: 'anywhere',
      },
      empty: {
        display: 'grid',
        gap: '6px',
        justifyItems: 'center',
        padding: '30px 18px',
        border: '1px dashed var(--dsw-alias-border-l1)',
        borderRadius: '12px',
        textAlign: 'center',
      },
      emptyTitle: { margin: 0, fontWeight: 600 },
      muted: { margin: 0, color: 'var(--dsw-alias-label-secondary)', lineHeight: 1.5 },
    }

    function createSection(api, t) {
      function reasonText(entry) {
        if (entry.code === 'not-archived') return t('notArchived')
        if (entry.code === 'session-active') return t('sessionActive')
        return entry.message || t('deleteFailedReason')
      }

      function SessionRow({ session, checked, disabled, first, onToggle }) {
        return h(
          'div',
          { role: 'listitem', style: first ? styles.rowFirst : styles.row },
          h('input', {
            type: 'checkbox',
            checked,
            disabled,
            onChange: onToggle,
            style: styles.checkbox,
            'aria-label': session.title || t('titleMissing'),
          }),
          h(
            'div',
            { style: styles.rowBody },
            h(
              'div',
              { style: styles.rowTitleLine },
              h('span', { style: styles.rowTitle }, session.title || t('titleMissing')),
              session.hasLog ? null : h('span', { style: styles.warnChip }, t('missingLog')),
            ),
            h(
              'div',
              { style: styles.meta },
              session.cwd ? h('span', null, session.cwd) : null,
              h('span', null, session.createdAt ? formatDate(session.createdAt) : t('unknownTime')),
              h('span', null, formatBytes(session.sizeBytes)),
              (session.workspaces && session.workspaces.length
                ? session.workspaces.map((workspace) => h('span', { key: workspace.id, style: styles.chip }, workspace.title))
                : [h('span', { key: 'none', style: styles.chip }, t('noWorkspace'))]),
            ),
          ),
        )
      }

      return function Section() {
        const [data, setData] = useState(null)
        const [loading, setLoading] = useState(true)
        const [error, setError] = useState(null)
        const [notice, setNotice] = useState(null)
        const [selected, setSelected] = useState([])
        const [confirming, setConfirming] = useState(false)
        const [busy, setBusy] = useState(false)
        const alive = useRef(true)

        const load = useCallback(async (silent) => {
          if (!silent) setLoading(true)
          setError(null)
          try {
            const response = await api.listArchived()
            if (!alive.current) return
            if (response.ok) {
              setData(response.value)
              setSelected([])
              setConfirming(false)
            } else {
              setError(t('loadFailed', { message: messageOf(response.error) }))
            }
          } catch (cause) {
            if (alive.current) setError(t('loadFailed', { message: messageOf(cause) }))
          } finally {
            if (alive.current && !silent) setLoading(false)
          }
        }, [])

        useEffect(() => {
          alive.current = true
          void load()
          return () => {
            alive.current = false
          }
        }, [load])

        const sessions = useMemo(() => (data && Array.isArray(data.sessions) ? data.sessions : []), [data])
        const allSelected = sessions.length > 0 && selected.length === sessions.length

        const toggle = useCallback((id) => {
          setSelected((previous) =>
            previous.includes(id) ? previous.filter((entry) => entry !== id) : [...previous, id],
          )
        }, [])

        const toggleAll = useCallback(() => {
          setSelected((previous) => (previous.length === sessions.length ? [] : sessions.map((session) => session.id)))
        }, [sessions])

        const remove = useCallback(async () => {
          if (busy || selected.length === 0) return
          setBusy(true)
          setConfirming(false)
          setNotice(null)
          try {
            const response = await api.purgeArchived(selected.slice())
            if (!alive.current) return
            if (!response.ok) {
              setNotice({ kind: 'error', text: t('deleteFailed', { message: messageOf(response.error) }) })
              return
            }
            const value = response.value || {}
            const removedCount = Array.isArray(value.removed) ? value.removed.length : 0
            const failed = Array.isArray(value.failed) ? value.failed : []
            const warnings = Array.isArray(value.warnings) ? value.warnings : []
            const size = formatBytes(value.freedBytes || 0)
            let text = failed.length
              ? t('removedPartial', { count: removedCount, failed: failed.length, size })
              : t('removedOk', { count: removedCount, size })
            if (failed.length > 0) {
              text += ' ' + failed.slice(0, 3).map((entry) => `${entry.id}: ${reasonText(entry)}`).join('; ')
            }
            if (warnings.length > 0) {
              text +=
                ' ' +
                t('warnNotice', {
                  detail: warnings
                    .slice(0, 3)
                    .map((entry) => (entry.message ? `${entry.code}: ${entry.message}` : entry.code))
                    .join('; '),
                })
            }
            setNotice({ kind: failed.length > 0 || warnings.length > 0 ? 'warn' : 'success', text })
            await load(true)
          } catch (cause) {
            if (alive.current) setNotice({ kind: 'error', text: t('deleteFailed', { message: messageOf(cause) }) })
          } finally {
            if (alive.current) setBusy(false)
          }
        }, [busy, selected, load])

        const rows = sessions.map((session, index) =>
          h(SessionRow, {
            key: session.id,
            session,
            first: index === 0,
            checked: selected.includes(session.id),
            disabled: busy,
            onToggle: () => toggle(session.id),
          }),
        )

        return h(
          'section',
          { style: styles.page, 'aria-label': t('nav') },
          h(
            'div',
            { style: styles.header },
            h('h2', { style: styles.title }, t('title')),
            h('p', { style: styles.subtitle }, t('subtitle')),
          ),
          data
            ? h(
                'div',
                { style: styles.toolbar },
                h(
                  'span',
                  { style: styles.summary },
                  h('span', { style: styles.summaryStrong }, t('count', { count: sessions.length })),
                  h('span', null, t('totalSize', { size: formatBytes(data.totalBytes || 0) })),
                ),
                h('span', { style: styles.spacer }),
                h(
                  'label',
                  { style: styles.checkboxLabel },
                  h('input', {
                    type: 'checkbox',
                    checked: allSelected,
                    disabled: busy || sessions.length === 0,
                    onChange: toggleAll,
                    style: styles.checkbox,
                  }),
                  t('selectAll'),
                ),
                h(
                  'button',
                  { type: 'button', style: styles.button, disabled: busy, onClick: () => void load() },
                  t('refresh'),
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    style: selected.length > 0 && !busy ? styles.buttonDanger : styles.buttonDisabled,
                    disabled: busy || selected.length === 0,
                    onClick: () => setConfirming(true),
                  },
                  selected.length > 0
                    ? `${t('deleteSelected')} (${t('selectedCount', { count: selected.length })})`
                    : t('deleteSelected'),
                ),
              )
            : null,
          confirming
            ? h(
                'div',
                { style: styles.confirm, role: 'group', 'aria-label': t('confirmTitle', { count: selected.length }) },
                h('p', { style: styles.confirmTitle }, t('confirmTitle', { count: selected.length })),
                h('p', { style: styles.confirmBody }, t('confirmBody')),
                h(
                  'div',
                  { style: styles.rowActions },
                  h(
                    'button',
                    { type: 'button', style: styles.buttonDanger, disabled: busy, onClick: () => void remove() },
                    busy ? t('deleting') : t('confirm'),
                  ),
                  h(
                    'button',
                    { type: 'button', style: styles.button, disabled: busy, onClick: () => setConfirming(false) },
                    t('cancel'),
                  ),
                ),
              )
            : null,
          error ? h('p', { role: 'alert', style: styles.noticeError }, error) : null,
          notice
            ? h(
                'p',
                { role: notice.kind === 'error' ? 'alert' : 'status', style: notice.kind === 'error' ? styles.noticeError : styles.notice },
                notice.text,
              )
            : null,
          loading
            ? h('p', { style: styles.muted, role: 'status' }, t('loading'))
            : sessions.length === 0
              ? h(
                  'div',
                  { style: styles.empty },
                  h('p', { style: styles.emptyTitle }, t('empty')),
                  h('p', { style: styles.muted }, t('emptyHint')),
                )
              : h('div', { style: styles.list, role: 'list' }, rows),
        )
      }
    }

    async function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'dsh-archive-cleanup: dictionaries')
      const t = ctx.locale.bind(NS)
      await ctx.remote.$mount(REMOTE)
      ctx.inject(['remote.archiveCleanup'], (cleanupCtx) => {
        const api = cleanupCtx.get('remote.archiveCleanup') || cleanupCtx.remote.archiveCleanup
        const Section = createSection(api, t)
        cleanupCtx.slots.inject('settings.section', () =>
          cleanupCtx.slots.register(
            {
              name: 'settings.section',
              id: 'archive-cleanup',
              order: 45,
              label: () => t('nav'),
              locale: NS,
            },
            Section,
          ),
        )
      })
    }

    return { name: 'archive-cleanup-settings', inject: ['slots', 'locale', 'remote'], apply }
  },
})
