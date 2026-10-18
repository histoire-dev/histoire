import type { ButtonHTMLAttributes } from 'react'

/** Example component with native button attributes. */
export function Button({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" {...props} className={['example-button', className].filter(Boolean).join(' ')} />
}
