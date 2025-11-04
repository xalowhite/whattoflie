// types/global.d.ts
// Makes FlyDetailData available everywhere without importing.
declare global {
  interface FlyDetailData {
    id: string
    name: string
    category?: string | null
  }
}
export {}
