import type { PropsWithChildren } from 'react'

/** Shared example provider; real projects can install router or theme providers. */
export function ExampleProvider({ children }: PropsWithChildren) {
  return <main className="example-preview">{children}</main>
}
