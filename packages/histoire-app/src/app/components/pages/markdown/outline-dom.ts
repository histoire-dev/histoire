/** One h2/h3 heading, with its element held only while current page owns it. */
export interface MarkdownHeading {
  /** Renderer-owned anchor identity; never regenerated. */
  id: string
  /** Heading label without decorative anchor link. */
  title: string
  /** Outline indentation level. */
  level: 2 | 3
  /** Page-scoped heading element. */
  element: HTMLElement
}

/** Read renderer anchors inside one page only, preserving duplicate host IDs safely. */
export function collectMarkdownHeadings(root: HTMLElement): MarkdownHeading[] {
  return Array.from(root.querySelectorAll<HTMLElement>('.histoire-docs h2[id], .histoire-docs h3[id]')).map((element) => {
    const label = element.cloneNode(true) as HTMLElement
    label.querySelectorAll('.header-anchor').forEach(anchor => anchor.remove())
    return { id: element.id, title: label.textContent?.trim() ?? '', level: element.tagName === 'H2' ? 2 : 3, element }
  })
}

/** Last heading above reading line follows scrolling without observing host viewport. */
export function activeMarkdownHeading(root: HTMLElement, headings: MarkdownHeading[]): string {
  const readingLine = root.getBoundingClientRect().top + 96
  let active = headings[0]?.id ?? ''
  for (const heading of headings) {
    if (heading.element.getBoundingClientRect().top > readingLine) break
    active = heading.id
  }
  return active
}

/** Scroll only owning page, using element references rather than document-wide IDs. */
export function scrollMarkdownHeading(root: HTMLElement, heading: MarkdownHeading): void {
  if (!root.contains(heading.element)) return
  root.scrollTop += heading.element.getBoundingClientRect().top - root.getBoundingClientRect().top - 32
}
