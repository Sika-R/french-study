/** 去除变音符 + lowercase + trim，做宽容比对 */
export function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
}
