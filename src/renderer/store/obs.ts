import { MutationTree } from 'vuex'

interface OBSStore {
  connected: boolean
  scenes: string[]
  currentScene: string
}

const defaultState: OBSStore = {
  connected: false,
  scenes: [],
  currentScene: '',
}

export const state = () => Object.assign({}, defaultState)

export const mutations: MutationTree<OBSStore> = {
  setConnected(state, connected: boolean) {
    state.connected = connected
  },
  setScenes(state, scenes: string[]) {
    state.scenes = scenes
  },
  setCurrentScene(state, scene: string) {
    state.currentScene = scene
  },
  clear(state) {
    Object.assign(state, defaultState)
  },
}
