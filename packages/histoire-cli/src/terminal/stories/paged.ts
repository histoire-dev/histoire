/** One page as the reader needs it, independent of the operation behind it. */
export interface PagedPage<T> {
  /** Rows of the page. */
  items: T[]
  /** Revision every row belongs to. */
  revision: string
  /** Rows matching across all pages. */
  total: number
  /** Cursor of the next page. */
  next?: string
}

/** What the reader should do with a failed read. */
export type PagedFailure = 'stale' | 'ignore' | { problem: string }

/** Observable state of a paged reader. */
export interface PagedSnapshot<T> {
  /** `idle` before the first read, `loading` until the first page of a read landed. */
  status: 'idle' | 'loading' | 'ready' | 'failed'
  /** Why the latest read failed; rows already loaded stay visible. */
  problem?: string
  /** Revision of the rows shown. */
  revision?: string
  /** Rows loaded so far, all of one revision. */
  items: readonly T[]
  /** Rows matching across all pages. */
  total: number
  /** More pages exist. */
  hasMore: boolean
}

/** Inputs of a paged reader. */
export interface PagedReaderOptions<T, P> {
  /** Reads one page; continuation pages carry the cursor and the revision the read started at. */
  read: (request: { cursor?: string, expectedRevision?: string }) => Promise<P>
  /** Extracts the reader's view of a page. */
  select: (page: P) => PagedPage<T>
  /** Classifies a failed read. */
  classify: (error: unknown) => PagedFailure
  /** Stable ID of a row, used to keep loading until the wanted row is present. */
  idOf: (item: T) => string
  /** ID the owner wants visible (the selection); pages load until it appears or none remain. */
  wanted?: () => string | undefined
  /** Called for every accepted page (first or continuation). */
  accepted?: (page: P) => void
  /** Called after any change of the snapshot. */
  changed: () => void
  /** Most rows kept; further pages load only when the wanted row is still missing. */
  maxItems?: number
}

/** Pages a read can load while chasing a wanted row. */
const MAX_PURSUIT_PAGES = 200

/**
 * Reads a revision-pinned list page by page. The first page decides the revision;
 * continuation pages must match it, and a stale answer restarts the read from the first
 * page instead of appending. Rows of the previous read stay visible until the new first
 * page replaces them wholesale, so the list never mixes revisions.
 * @param options Page source and callbacks.
 */
export function createPagedReader<T, P>(options: PagedReaderOptions<T, P>) {
  let items: T[] = []
  let revision: string | undefined
  let next: string | undefined
  let total = 0
  let status: PagedSnapshot<T>['status'] = 'idle'
  let problem: string | undefined
  /** Increments on every restart or reset; answers of an older read are dropped. */
  let epoch = 0
  /** Reads still awaiting an answer, including dropped ones: a successor waits for them instead of racing. */
  let firstInFlight = 0
  let moreInFlight = 0
  let again = false
  /** Pages loaded while chasing the wanted row in the current read. */
  let pursued = 0

  /**
   * Records a failure unless it should be ignored; stale answers restart the read. A failed first
   * page leaves nothing the catalog confirms (the story may be gone), so earlier rows are dropped;
   * a failed continuation keeps the rows already loaded for the same revision.
   */
  function fail(error: unknown, startedAt: number, first: boolean) {
    if (startedAt !== epoch) return
    const outcome = options.classify(error)
    if (outcome === 'ignore') return
    if (outcome === 'stale') return void self.restart()
    problem = outcome.problem
    if (first) {
      items = []
      revision = next = undefined
      total = 0
      status = 'failed'
    }
    options.changed()
  }

  /** Loads further pages while the wanted row is not present yet. */
  function pursue() {
    const wanted = options.wanted?.()
    if (wanted !== undefined && next && !items.some(item => options.idOf(item) === wanted) && ++pursued < MAX_PURSUIT_PAGES) void self.more(true)
  }

  const self = {
    snapshot(): PagedSnapshot<T> {
      return { status, problem, revision, items, total, hasMore: next !== undefined }
    },
    /** Drops everything: the owner's generation changed, so no row is actionable any more. */
    reset() {
      epoch++
      items = []
      revision = next = problem = undefined
      total = 0
      status = 'idle'
      again = false
      options.changed()
    },
    /** Starts a read from the first page; concurrent calls coalesce into one follow-up read. */
    async restart() {
      if (firstInFlight > 0) {
        again = true
        epoch++
        return
      }
      const startedAt = ++epoch
      firstInFlight++
      again = false
      if (status !== 'ready') status = 'loading'
      problem = undefined
      options.changed()
      try {
        const page = await options.read({})
        firstInFlight--
        if (startedAt === epoch) {
          const view = options.select(page)
          items = view.items
          revision = view.revision
          next = view.next
          total = view.total
          status = 'ready'
          pursued = 0
          options.accepted?.(page)
          options.changed()
          pursue()
        }
      }
      catch (error) {
        firstInFlight--
        fail(error, startedAt, true)
      }
      if (again) {
        again = false
        void self.restart()
      }
    },
    /** Loads the next page of the current read. */
    async more(force = false) {
      if (!next || moreInFlight > 0 || firstInFlight > 0 || status !== 'ready') return
      if (!force && items.length >= (options.maxItems ?? Number.POSITIVE_INFINITY)) return
      const startedAt = epoch
      moreInFlight++
      try {
        const page = await options.read({ cursor: next, expectedRevision: revision })
        moreInFlight--
        if (startedAt !== epoch) return
        const view = options.select(page)
        // A continuation of another revision would mix two catalogs: restart instead.
        if (view.revision !== revision) return void self.restart()
        items = [...items, ...view.items]
        next = view.next
        total = view.total
        options.accepted?.(page)
        options.changed()
        pursue()
      }
      catch (error) {
        moreInFlight--
        fail(error, startedAt, false)
      }
    },
  }
  return self
}

/** Reader created by {@link createPagedReader}. */
export type PagedReader<T> = ReturnType<typeof createPagedReader<T, unknown>>
