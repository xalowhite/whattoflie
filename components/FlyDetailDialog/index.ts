export { default } from './FlyDetailDialog'

// Re-export the global type so old imports (if any) still work:
type _FlyDetailData = FlyDetailData
export type { _FlyDetailData as FlyDetailData }
