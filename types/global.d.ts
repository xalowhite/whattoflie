// types/global.d.ts
export {}

declare global {
  type FlyDetailData = {
    id: string
    name: string
    category?: string | null
    source?: 'global' | 'user'
    image_url?: string | null
    difficulty?: string | null
    sizes?: (number | string)[] | null
    tutorials?: { url: string; title: string; tutorial_type: string }[]
    materials?: { required: boolean; name: string; color: string | null }[]
    target_species?: string[] | null
    colorways?: string[] | null
  }
}
