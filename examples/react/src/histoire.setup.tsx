import { defineSetupReact } from '@histoire/plugin-react'
import { ExampleProvider } from './ExampleProvider'
import './style.css'

export const setupReact = defineSetupReact(({ addWrapper }) => addWrapper(ExampleProvider))
