import { Dayjs } from 'dayjs'
import { MeetingFile, ShortJWLang } from '~/types'

export interface MediaStore {
  songPub: string
  ffMpeg: boolean
  mediaLang: ShortJWLang | null
  musicFadeOut: Dayjs | string
  meetings: Map<string, Map<number, MeetingFile[]>>
  progress: Map<string, Promise<string>>
}
