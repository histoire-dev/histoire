/** Keep missing server compatibility reasons consistent across catalog and version views. */
export function incompatibleReason(reason?: string): string {
  return reason || 'Incompatible with this project'
}
