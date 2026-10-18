import { Story } from '@histoire/plugin-react'
import { Button } from './Button'

/** JSX example with implicit default variant. */
export default function BasicStory() {
  return <Story title="Basic"><div className="example-stage"><Button>React button</Button></div></Story>
}
