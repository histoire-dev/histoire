import type { ButtonHTMLAttributes } from 'react'

/** Example component with native button attributes. */
export function Button(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" {...props} />
}
