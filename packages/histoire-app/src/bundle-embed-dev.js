import { bootstrapEmbedDocument } from './embed/index.ts'
import './embed/document.css'

// Source-development entry keeps identical data-only bootstrap behavior.
export const sourceConnection = bootstrapEmbedDocument()
void sourceConnection.catch(error => console.error(error))
