/** Recursively readonly observation of portable data; mutable wire DTOs remain unchanged. */
export type HistoireReadonly<T> = T extends (...arguments_: never[]) => unknown
  ? T
  : T extends object
    ? { readonly [Key in keyof T]: HistoireReadonly<T[Key]> }
    : T
