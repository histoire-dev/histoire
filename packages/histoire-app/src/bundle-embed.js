import { bootstrapEmbedDocument } from './embed/index.js'
import './embed/document.css'

// Data document starts no explorer, framework runtime, or story loaders.
export const sourceConnection = bootstrapEmbedDocument()
void sourceConnection.catch(error => console.error(error))
