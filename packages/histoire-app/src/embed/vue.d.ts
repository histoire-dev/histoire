declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  /** App-owned Vue documents compiled by the embed Vite entry. */
  const component: DefineComponent<any, any, any>
  export default component
}
